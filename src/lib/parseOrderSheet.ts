import ExcelJS from 'exceljs';

// オーダー表（Excel）の解析結果の型
export interface ParsedOrderDate {
  date: string; // 例: 2026-10-19
  label: string; // 例: 10月19日
}

export interface ParsedOrderRow {
  productCode: string;
  quantities: number[]; // dates と同じ順番の発注数
}

export interface ParsedOrderSheet {
  dates: ParsedOrderDate[];
  rows: ParsedOrderRow[]; // 「いずれかの日にオーダー1以上」の行のみ（商品マスタの絞り込み前）
  warnings: string[];
}

// 日付を横に探すときの最大幅（この列数進んでも日付が出なければ読込終了）
const MAX_DATE_GAP = 15;
// 商品データの開始行（1始まり: 1行目=日付, 2行目=曜日, 3行目=表題, 4行目〜データ）
const DATA_START_ROW_NUMBER = 4;

// 見出し文字を比較用に整える（半角ｶﾅ→全角、改行・空白の除去）
function normalizeHeader(value: unknown): string {
  return getTextValue(value)
    .normalize('NFKC')
    .replace(/\s+/g, '');
}

// セルの値から安全に文字列を取り出す
function getTextValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('richText' in (value as any)) {
      return (value as any).richText.map((t: any) => t.text).join('').trim();
    }
    if ('text' in (value as any)) {
      return String((value as any).text ?? '').trim();
    }
    if ('result' in (value as any)) {
      return String((value as any).result ?? '').trim();
    }
  }
  return String(value).trim();
}

// セルの値から安全に数値を取り出す
function getNumericValue(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value !== null && 'result' in (value as any)) {
    const res = (value as any).result;
    return typeof res === 'number' ? res : Number(res) || 0;
  }
  return Number(value) || 0;
}

// セルの値を日付（年月日）に変換。日付でなければ null
function parseDateCell(value: unknown): { y: number; m: number; d: number } | null {
  if (value === '' || value === null || value === undefined) return null;
  if (value instanceof Date) {
    return { y: value.getFullYear(), m: value.getMonth() + 1, d: value.getDate() };
  }
  if (typeof value === 'object' && value !== null && 'result' in (value as any)) {
    return parseDateCell((value as any).result);
  }
  if (typeof value === 'number') {
    // Excelのシリアル値のうち、現実的な日付範囲（20000〜80000）だけを日付とみなす
    if (value < 20000 || value > 80000) return null;
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
  }
  const match = String(value).trim().match(/^(\d{4})[^\d]+(\d{1,2})[^\d]+(\d{1,2})/);
  if (match) {
    return { y: parseInt(match[1], 10), m: parseInt(match[2], 10), d: parseInt(match[3], 10) };
  }
  return null;
}

// 新フォーマットのオーダー表を解析する (ExcelJS による安全な実装)
export async function parseOrderSheet(data: Uint8Array): Promise<ParsedOrderSheet> {
  const workbook = new ExcelJS.Workbook();
  // Node.js Buffer に変換してロード
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  await workbook.xlsx.load(buffer as any);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('ワークシートが見つかりません。');
  }

  const row1 = worksheet.getRow(1);
  const row3 = worksheet.getRow(3);
  const warnings: string[] = [];

  // 1. 1行目から日付の列位置を探す（D列=4列目から開始。15列進んでも日付が出なければ終了）
  const dateCols: { col: number; y: number; m: number; d: number }[] = [];
  let lastDateCol = 3; // D列(4)の手前
  const maxCol = Math.max(row1.cellCount, 50);

  for (let c = 4; c <= maxCol; c++) {
    const cell = row1.getCell(c);
    // 結合セルのマスターセル（先頭列）以外はスキップ（ExcelJS では結合された全セルに値が返るため）
    if (cell.isMerged && cell.master && cell.master.address !== cell.address) {
      continue;
    }

    const cellValue = cell.value;
    const parsed = parseDateCell(cellValue);
    if (parsed) {
      const dateStr = `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
      // すでに同じ日付が登録されている場合はスキップ（二重登録防止）
      const alreadyExists = dateCols.some(
        d => `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` === dateStr
      );
      if (!alreadyExists) {
        dateCols.push({ col: c, ...parsed });
        lastDateCol = c;
      }
    } else if (c - lastDateCol >= MAX_DATE_GAP) {
      break;
    }
  }

  if (dateCols.length === 0) {
    throw new Error('1行目（D列〜）に日付が見つかりません。オーダー表の形式をご確認ください。');
  }

  // 2. 各日付の範囲（次の日付の1つ手前の列まで）から、表題が「オーダー」の列を探す
  const dates: ParsedOrderDate[] = [];
  const orderCols: number[] = [];
  for (let i = 0; i < dateCols.length; i++) {
    const start = dateCols[i].col;
    const end = i + 1 < dateCols.length ? dateCols[i + 1].col - 1 : start + MAX_DATE_GAP - 1;
    let orderCol = -1;

    for (let c = start; c <= end; c++) {
      const headerText = normalizeHeader(row3.getCell(c).value);
      // 「オーダー金額」「オーダー数」などは対象外。「オーダー」のみ一致させる
      if (headerText === 'オーダー') {
        orderCol = c;
        break;
      }
    }

    const dt = dateCols[i];
    const dateStr = `${dt.y}-${String(dt.m).padStart(2, '0')}-${String(dt.d).padStart(2, '0')}`;
    if (orderCol < 0) {
      warnings.push(`${dt.m}月${dt.d}日の範囲に「オーダー」列が見つからなかったため、この日は読み込みません。`);
      continue;
    }
    dates.push({ date: dateStr, label: `${dt.m}月${dt.d}日` });
    orderCols.push(orderCol);
  }

  if (dates.length === 0) {
    throw new Error('「オーダー」という表題の列が見つかりませんでした。オーダー表の形式をご確認ください。');
  }

  // 3. A列の商品コードごとに発注数を読み取る（いずれかの日に1以上ある行のみ）
  const rows: ParsedOrderRow[] = [];
  const rowCount = worksheet.rowCount;

  for (let r = DATA_START_ROW_NUMBER; r <= rowCount; r++) {
    const row = worksheet.getRow(r);
    const code = getTextValue(row.getCell(1).value);
    if (!code) continue;

    const quantities = orderCols.map(col => {
      const n = getNumericValue(row.getCell(col).value);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
    });

    if (quantities.some(q => q >= 1)) {
      rows.push({ productCode: code, quantities });
    }
  }

  return { dates, rows, warnings };
}
