import * as XLSX from 'xlsx';

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
const DATA_START_ROW_INDEX = 3;

// 見出し文字を比較用に整える（半角ｶﾅ→全角、改行・空白の除去）
function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '');
}

// セルの値を日付（年月日）に変換。日付でなければ null
function parseDateCell(value: unknown): { y: number; m: number; d: number } | null {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value === 'number') {
    // Excelのシリアル値のうち、現実的な日付範囲だけを日付とみなす
    if (value < 20000 || value > 80000) return null;
    const p = XLSX.SSF.parse_date_code(value);
    if (p && p.y) return { y: p.y, m: p.m, d: p.d };
    return null;
  }
  if (value instanceof Date) {
    return { y: value.getFullYear(), m: value.getMonth() + 1, d: value.getDate() };
  }
  const match = String(value).trim().match(/^(\d{4})[^\d]+(\d{1,2})[^\d]+(\d{1,2})/);
  if (match) return { y: parseInt(match[1], 10), m: parseInt(match[2], 10), d: parseInt(match[3], 10) };
  return null;
}

// 新フォーマットのオーダー表を解析する
export function parseOrderSheet(data: Uint8Array): ParsedOrderSheet {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const grid: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });

  const row1 = grid[0] || [];
  const row3 = grid[2] || [];
  const warnings: string[] = [];

  // 1. 1行目から日付の列位置を探す（D列から開始。15列進んでも日付が出なければ終了）
  const dateCols: { col: number; y: number; m: number; d: number }[] = [];
  let lastDateCol = 2; // D列(index 3)の手前
  for (let c = 3; c < row1.length + MAX_DATE_GAP; c++) {
    const parsed = parseDateCell(row1[c]);
    if (parsed) {
      dateCols.push({ col: c, ...parsed });
      lastDateCol = c;
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
      // 「オーダー金額」「オーダー数」などは対象外。「オーダー」のみ一致させる
      if (normalizeHeader(row3[c]) === 'オーダー') {
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
  for (let r = DATA_START_ROW_INDEX; r < grid.length; r++) {
    const code = String(grid[r][0] ?? '').trim();
    if (!code) continue;

    const quantities = orderCols.map(col => {
      const n = Number(grid[r][col]);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
    });
    if (quantities.some(q => q >= 1)) {
      rows.push({ productCode: code, quantities });
    }
  }

  return { dates, rows, warnings };
}
