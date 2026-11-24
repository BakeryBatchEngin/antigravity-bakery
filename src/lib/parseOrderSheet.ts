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
  sheetNames?: string[];
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

// ワークブックからシート名一覧を取得する関数
export async function getOrderWorkbookSheets(data: Uint8Array): Promise<string[]> {
  const workbook = new ExcelJS.Workbook();
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  await workbook.xlsx.load(buffer as any);
  return workbook.worksheets.map(ws => ws.name);
}

// 単一シートの解析
function parseSingleWorksheet(worksheet: ExcelJS.Worksheet): { dates: ParsedOrderDate[]; rows: ParsedOrderRow[]; warnings: string[] } | null {
  const warnings: string[] = [];
  const maxScanRows = Math.min(worksheet.rowCount, 15);

  // 1. 日付行を動的に探索（1行目〜15行目をスキャン）
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

    if (dateCount >= 2 && dateCount > maxDateCount) {
      maxDateCount = dateCount;
      dateRowNumber = r;
    }
  }

  // 日付行が見つからないシートはnullを返してスキップ可能にする
  if (dateRowNumber < 0) {
    return null;
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
      const alreadyExists = dateCols.some(
        d => `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` === dateStr
      );
      if (!alreadyExists) {
        dateCols.push({ col: c, ...parsed });
        lastDateCol = c;
      }
    } else if (lastDateCol > 0 && c - lastDateCol >= MAX_DATE_GAP) {
      break;
    }
  }

  if (dateCols.length === 0) {
    return null;
  }

  // 2. 「オーダー」列＆ヘッダー行を探索（日付行の直下〜+4行以内）
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

    for (let c = start; c <= end; c++) {
      const headerText = normalizeHeader(headerRow.getCell(c).value);
      if (headerText === 'オーダー') {
        orderCol = c;
        break;
      }
    }

    if (orderCol < 0) {
      for (let c = start; c <= end; c++) {
        const headerText = normalizeHeader(headerRow.getCell(c).value);
        if (headerText === '発注' || headerText === 'オーダー数' || headerText === '発注数') {
          orderCol = c;
          break;
        }
      }
    }

    if (orderCol < 0 && start === end) {
      orderCol = start;
    }

    const dt = dateCols[i];
    const dateStr = `${dt.y}-${String(dt.m).padStart(2, '0')}-${String(dt.d).padStart(2, '0')}`;
    if (orderCol < 0) {
      warnings.push(`シート「${worksheet.name}」: ${dt.m}月${dt.d}日の範囲に「オーダー」列が見つからなかったため、この日は読み込みません。`);
      continue;
    }

    dates.push({ date: dateStr, label: `${dt.m}月${dt.d}日` });
    orderCols.push(orderCol);
  }

  if (dates.length === 0) {
    return null;
  }

  // 3. 商品コード列と商品名列の動的特定（1〜日付列直前をスキャン）
  let codeCol = -1;
  let nameCol = -1;
  const priceCols = new Set<number>();
  const scanEndCol = firstDateCol > 1 ? firstDateCol : 6;

  for (let r = Math.max(1, dateRowNumber - 1); r <= headerRowNumber; r++) {
    const row = worksheet.getRow(r);
    for (let c = 1; c < scanEndCol; c++) {
      const text = normalizeHeader(row.getCell(c).value);
      if (!text) continue;

      // 単価・金額・価格列の検知（これらは商品コード・商品名から絶対に除外）
      if (
        text.includes('単価') ||
        text.includes('価格') ||
        text.includes('定価') ||
        text.includes('金額') ||
        text.includes('売価')
      ) {
        priceCols.add(c);
        continue;
      }

      // 商品コード列の検知
      if (
        text.includes('商品コード') ||
        text.includes('品目コード') ||
        text.includes('品番') ||
        text.includes('アイテムコード') ||
        text === 'コード'
      ) {
        codeCol = c;
      }
      // 商品名列の検知（「アイテム」「ｱｲﾃﾑ」等も確実にヒットさせる）
      else if (
        text.includes('商品名') ||
        text.includes('品名') ||
        text.includes('アイテム') ||
        text.includes('ｱｲﾃﾑ') ||
        text.includes('品目名') ||
        text.includes('品目') ||
        text === '名称' ||
        text === '商品'
      ) {
        nameCol = c;
      }
    }
  }

  // フォールバック処理: ヘッダーで特定できなかった場合の判定
  if (nameCol < 0) {
    if (codeCol === 1 && priceCols.has(2)) {
      // 1列目がcodeColと仮判定されたが2列目が単価の場合、実質1列目が商品名
      nameCol = 1;
      codeCol = -1;
    } else {
      // 単価列以外の列で最初の列を商品名列とする
      for (let c = 1; c < scanEndCol; c++) {
        if (!priceCols.has(c) && c !== codeCol) {
          nameCol = c;
          break;
        }
      }
      if (nameCol < 0) nameCol = 1;
    }
  }

  // もし codeCol が nameCol と同じ、または単価列に入っているなら無効化
  if (codeCol === nameCol || priceCols.has(codeCol)) {
    codeCol = -1;
  }

  // 4. データ行の読み取り
  const rows: ParsedOrderRow[] = [];
  const rowCount = worksheet.rowCount;
  const dataStartRow = headerRowNumber + 1;

  for (let r = dataStartRow; r <= rowCount; r++) {
    const row = worksheet.getRow(r);
    const code = codeCol > 0 ? getTextValue(row.getCell(codeCol).value) : '';
    const name = nameCol > 0 ? getTextValue(row.getCell(nameCol).value) : '';

    if (!code && !name) continue;

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

// オーダー表を柔軟に解析する（単一または複数シート対応）
export async function parseOrderSheet(data: Uint8Array, targetSheetNames?: string[]): Promise<ParsedOrderSheet> {
  const workbook = new ExcelJS.Workbook();
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  await workbook.xlsx.load(buffer as any);

  if (workbook.worksheets.length === 0) {
    throw new Error('ワークシートが見つかりません。');
  }

  // 解析対象のワークシートを決定
  let targetSheets: ExcelJS.Worksheet[] = [];
  if (targetSheetNames && targetSheetNames.length > 0) {
    targetSheets = workbook.worksheets.filter(ws => targetSheetNames.includes(ws.name));
  }
  if (targetSheets.length === 0) {
    targetSheets = [workbook.worksheets[0]];
  }

  const allWarnings: string[] = [];
  const parsedSheets: { sheetName: string; dates: ParsedOrderDate[]; rows: ParsedOrderRow[] }[] = [];

  for (const ws of targetSheets) {
    const res = parseSingleWorksheet(ws);
    if (!res) {
      allWarnings.push(`シート「${ws.name}」にはオーダーの日付・発注形式が見つからなかったためスキップしました。`);
      continue;
    }
    allWarnings.push(...res.warnings);
    parsedSheets.push({
      sheetName: ws.name,
      dates: res.dates,
      rows: res.rows,
    });
  }

  if (parsedSheets.length === 0) {
    throw new Error('選択されたシートの上部に日付が見つかりませんでした。オーダー表の日付形式をご確認ください。');
  }

  // 1. 全シートの日付を収集し、重複を除いて昇順ソート
  const dateMap = new Map<string, string>(); // date(YYYY-MM-DD) -> label
  for (const s of parsedSheets) {
    for (const d of s.dates) {
      if (!dateMap.has(d.date)) {
        dateMap.set(d.date, d.label);
      }
    }
  }

  const sortedDates: ParsedOrderDate[] = Array.from(dateMap.keys())
    .sort()
    .map(date => ({ date, label: dateMap.get(date)! }));

  const dateIndexMap = new Map<string, number>();
  sortedDates.forEach((d, idx) => dateIndexMap.set(d.date, idx));

  // 2. 商品行の統合
  // 同一商品（商品コード一致、または商品名正規化一致）の数量を日付ごとに合算
  // key: コード優先、なければ正規化名
  const rowMap = new Map<string, { productCode: string; productName: string; quantities: number[] }>();

  for (const s of parsedSheets) {
    for (const r of s.rows) {
      const normName = normalizeHeader(r.productName);
      const key = r.productCode ? `code:${r.productCode}` : `name:${normName}`;

      let entry = rowMap.get(key);
      if (!entry) {
        entry = {
          productCode: r.productCode,
          productName: r.productName,
          quantities: new Array(sortedDates.length).fill(0),
        };
        rowMap.set(key, entry);
      } else {
        if (!entry.productCode && r.productCode) entry.productCode = r.productCode;
        if (!entry.productName && r.productName) entry.productName = r.productName;
      }

      // 各日付の数量を合算
      for (let i = 0; i < s.dates.length; i++) {
        const d = s.dates[i].date;
        const targetIdx = dateIndexMap.get(d);
        if (targetIdx !== undefined) {
          entry.quantities[targetIdx] += (r.quantities[i] || 0);
        }
      }
    }
  }

  // 数量が全日0の商品は除外
  const finalRows = Array.from(rowMap.values()).filter(r => r.quantities.some(q => q > 0));

  return {
    dates: sortedDates,
    rows: finalRows,
    warnings: allWarnings,
    sheetNames: parsedSheets.map(s => s.sheetName),
  };
}
