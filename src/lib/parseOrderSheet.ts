import ExcelJS from 'exceljs';

// オーダー表（Excel）の解析結果の型
export interface ParsedOrderDate {
  date: string; // 例: 2026-10-19
  label: string; // 例: 10月19日
}

export interface ParsedOrderRow {
  productCode: string;
  productName: string; // 商品名（Excel上に記載されている名称）
  quantities: number[]; // dates と同じ順番の発注数
}

export interface ParsedOrderSheet {
  dates: ParsedOrderDate[];
  rows: ParsedOrderRow[]; // 「いずれかの日にオーダー1以上」の行のみ（商品マスタの絞り込み前）
  warnings: string[];
}

// 日付を横に探すときの最大列間隔（この列数進んでも次の日付が出なければ終了）
const MAX_DATE_GAP = 15;

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
    // Excelのシリアル値のうち、現実的な日付範囲（20000〜80000: 約1954年〜2119年）だけを日付とみなす
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

// オーダー表を柔軟に解析する（ExcelJS による安全な実装）
export async function parseOrderSheet(data: Uint8Array): Promise<ParsedOrderSheet> {
  const workbook = new ExcelJS.Workbook();
  // Node.js Buffer に変換してロード
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  await workbook.xlsx.load(buffer as any);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('ワークシートが見つかりません。');
  }

  const warnings: string[] = [];
  const maxScanRows = Math.min(worksheet.rowCount, 15);

  // ----------------------------------------------------
  // 1. 日付行を動的に探索（1行目〜15行目をスキャン）
  // ----------------------------------------------------
  let dateRowNumber = -1;
  let maxDateCount = 0;

  for (let r = 1; r <= maxScanRows; r++) {
    const row = worksheet.getRow(r);
    let dateCount = 0;
    const maxCol = Math.max(row.cellCount, 40);

    for (let c = 1; c <= maxCol; c++) {
      const cell = row.getCell(c);
      if (cell.isMerged && cell.master && cell.master.address !== cell.address) {
        continue;
      }
      if (parseDateCell(cell.value)) {
        dateCount++;
      }
    }

    // 2つ以上の日付セルが見つかり、過去最多の行を日付行と判定
    if (dateCount >= 2 && dateCount > maxDateCount) {
      maxDateCount = dateCount;
      dateRowNumber = r;
    }
  }

  // 日付行が特定できなかった場合
  if (dateRowNumber < 0) {
    throw new Error('シートの上部（1〜15行目）に日付が見つかりません。オーダー表の日付形式をご確認ください。');
  }

  const dateRow = worksheet.getRow(dateRowNumber);
  const maxCol = Math.max(dateRow.cellCount, 60);

  // 日付列の一覧を収集
  const dateCols: { col: number; y: number; m: number; d: number }[] = [];
  let firstDateCol = -1;
  let lastDateCol = -1;

  for (let c = 1; c <= maxCol; c++) {
    const cell = dateRow.getCell(c);
    if (cell.isMerged && cell.master && cell.master.address !== cell.address) {
      continue;
    }

    const parsed = parseDateCell(cell.value);
    if (parsed) {
      if (firstDateCol === -1) firstDateCol = c;
      const dateStr = `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
      // 重複チェック
      const alreadyExists = dateCols.some(
        d => `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` === dateStr
      );
      if (!alreadyExists) {
        dateCols.push({ col: c, ...parsed });
        lastDateCol = c;
      }
    } else if (lastDateCol > 0 && c - lastDateCol >= MAX_DATE_GAP) {
      // 日付が一定列数途切れたら終了
      break;
    }
  }

  if (dateCols.length === 0) {
    throw new Error(`${dateRowNumber}行目に日付が見つかりませんでした。オーダー表の形式をご確認ください。`);
  }

  // ----------------------------------------------------
  // 2. 「オーダー」列＆ヘッダー行を探索（日付行の直下〜+4行以内）
  // ----------------------------------------------------
  let headerRowNumber = -1;
  let bestOrderMatches = 0;
  const maxHeaderSearchRow = Math.min(worksheet.rowCount, dateRowNumber + 4);

  for (let r = dateRowNumber + 1; r <= maxHeaderSearchRow; r++) {
    const row = worksheet.getRow(r);
    let orderMatches = 0;

    for (let i = 0; i < dateCols.length; i++) {
      const start = dateCols[i].col;
      const end = i + 1 < dateCols.length ? dateCols[i + 1].col - 1 : start + MAX_DATE_GAP - 1;

      for (let c = start; c <= end; c++) {
        const text = normalizeHeader(row.getCell(c).value);
        if (text === 'オーダー' || text === '発注' || text === 'オーダー数' || text === '発注数') {
          orderMatches++;
          break;
        }
      }
    }

    if (orderMatches > bestOrderMatches) {
      bestOrderMatches = orderMatches;
      headerRowNumber = r;
    }
  }

  // もしオーダー行が見つからなければ、日付行の次の行をフォールバックとして採用
  if (headerRowNumber < 0) {
    headerRowNumber = dateRowNumber + 1;
  }

  const headerRow = worksheet.getRow(headerRowNumber);

  // 各日付に対する「オーダー」列インデックスを特定
  const dates: ParsedOrderDate[] = [];
  const orderCols: number[] = [];

  for (let i = 0; i < dateCols.length; i++) {
    const start = dateCols[i].col;
    const end = i + 1 < dateCols.length ? dateCols[i + 1].col - 1 : start + MAX_DATE_GAP - 1;
    let orderCol = -1;

    // 1. 完全一致（「オーダー」）を最優先
    for (let c = start; c <= end; c++) {
      const headerText = normalizeHeader(headerRow.getCell(c).value);
      if (headerText === 'オーダー') {
        orderCol = c;
        break;
      }
    }

    // 2. 「オーダー」がなければ「発注」「オーダー数」「発注数」などを探す
    if (orderCol < 0) {
      for (let c = start; c <= end; c++) {
        const headerText = normalizeHeader(headerRow.getCell(c).value);
        if (headerText === '発注' || headerText === 'オーダー数' || headerText === '発注数') {
          orderCol = c;
          break;
        }
      }
    }

    // 3. それでも見つからない場合、日付列自体（start）に数字が入る構成なら start 列を採用
    if (orderCol < 0 && start === end) {
      orderCol = start;
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

  // ----------------------------------------------------
  // 3. 商品コード列と商品名列の動的特定（1〜5列目をスキャン）
  // ----------------------------------------------------
  let codeCol = 1; // デフォルト: A列
  let nameCol = 2; // デフォルト: B列

  // 日付行〜ヘッダー行の中で列見出しを探す
  for (let r = Math.max(1, dateRowNumber - 1); r <= headerRowNumber; r++) {
    const row = worksheet.getRow(r);
    for (let c = 1; c < (firstDateCol > 1 ? firstDateCol : 6); c++) {
      const text = normalizeHeader(row.getCell(c).value);
      if (text.includes('商品コード') || text.includes('品番') || text === 'コード') {
        codeCol = c;
      } else if (text.includes('商品名') || text.includes('品名') || text.includes('アイテム名') || text === '名称') {
        nameCol = c;
      }
    }
  }

  // ----------------------------------------------------
  // 4. データ行の読み取り（ヘッダー行の直下〜最終行）
  // ----------------------------------------------------
  const rows: ParsedOrderRow[] = [];
  const rowCount = worksheet.rowCount;
  const dataStartRow = headerRowNumber + 1;

  for (let r = dataStartRow; r <= rowCount; r++) {
    const row = worksheet.getRow(r);
    const code = getTextValue(row.getCell(codeCol).value);
    const name = getTextValue(row.getCell(nameCol).value);

    // コードも商品名も両方空の場合は空行としてスキップ
    if (!code && !name) continue;

    // 「合計」「小計」「総合計」「備考」などの集計行キーワードを除外
    const combined = (code + name).replace(/\s+/g, '');
    if (
      combined.includes('合計') ||
      combined.includes('小計') ||
      combined.includes('総合計') ||
      combined.includes('平均') ||
      combined.startsWith('※')
    ) {
      continue;
    }

    const quantities = orderCols.map(col => {
      const n = getNumericValue(row.getCell(col).value);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
    });

    if (quantities.some(q => q >= 1)) {
      rows.push({
        productCode: code,
        productName: name,
        quantities,
      });
    }
  }

  return { dates, rows, warnings };
}
