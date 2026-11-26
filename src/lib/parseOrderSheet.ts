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

// 見出し文字を比較用に整える（半角ｶﾅ→全角、改行・空白の完全除去）
function normalizeHeader(value: unknown): string {
  return getTextValue(value)
    .normalize('NFKC')
    .replace(/[\s\u3000\u00A0\u200B\uFEFF]+/g, '');
}

// セルの値から安全に文字列を取り出し、全角・半角スペースをトリム
function getTextValue(value: unknown): string {
  let str = '';
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('richText' in (value as any)) {
      str = (value as any).richText.map((t: any) => t.text).join('');
    } else if ('text' in (value as any)) {
      str = String((value as any).text ?? '');
    } else if ('result' in (value as any)) {
      str = String((value as any).result ?? '');
    } else {
      str = String(value);
    }
  } else {
    str = String(value);
  }
  // 全角スペース（\u3000）、半角スペース、不可視空白を先頭・末尾から完全除去
  return str.replace(/^[\s\u3000\u00A0\u200B\uFEFF]+|[\s\u3000\u00A0\u200B\uFEFF]+$/g, '');
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
    const res = (value as any).result;
    if (res instanceof Date) {
      return { y: res.getFullYear(), m: res.getMonth() + 1, d: res.getDate() };
    }
    const strMatch = String(res).trim().match(/^(\d{4})[^\d]+(\d{1,2})[^\d]+(\d{1,2})/);
    if (strMatch) {
      return { y: parseInt(strMatch[1], 10), m: parseInt(strMatch[2], 10), d: parseInt(strMatch[3], 10) };
    }
  }
  if (typeof value === 'number') {
    // Excelのシリアル値のうち、現実的な日付範囲（20000〜80000: 約1954年〜2119年）だけを日付とみなす
    if (value < 20000 || value > 80000) return null;
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
  }
  const str = String(value).trim();
  const match = str.match(/^(\d{4})[^\d]+(\d{1,2})[^\d]+(\d{1,2})/);
  if (match) {
    return { y: parseInt(match[1], 10), m: parseInt(match[2], 10), d: parseInt(match[3], 10) };
  }
  const matchMD = str.match(/^(\d{1,2})[月\/\-](\d{1,2})日?/);
  if (matchMD) {
    const currentYear = new Date().getFullYear();
    return { y: currentYear, m: parseInt(matchMD[1], 10), d: parseInt(matchMD[2], 10) };
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

  // 1. 日付行＆ヘッダー行を動的に探索（1行目〜15行目をスキャン）
  // 単に日付セルの個数だけでなく、直下に「オーダー」「発注」見出しがいくつ存在するかを総合判定（スコアリング）
  // これにより、売上金額（20000〜80000）の数値を日付と誤認してデータ行を日付行と判定する事故を完全に防止
  let bestDateRow = -1;
  let bestScore = -1;
  let bestDateCols: { col: number; y: number; m: number; d: number }[] = [];
  let bestHeaderRow = -1;

  for (let r = 1; r <= maxScanRows; r++) {
    const row = worksheet.getRow(r);
    const maxCol = Math.max(row.cellCount, 60);
    const candidateDates: { col: number; y: number; m: number; d: number }[] = [];
    let lastFoundCol = -1;

    for (let c = 1; c <= maxCol; c++) {
      const cell = row.getCell(c);
      if (cell.isMerged && cell.master && cell.master.address !== cell.address) {
        continue;
      }

      const parsed = parseDateCell(cell.value);
      if (parsed) {
        const dateStr = `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
        const alreadyExists = candidateDates.some(
          d => `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` === dateStr
        );
        if (!alreadyExists) {
          candidateDates.push({ col: c, ...parsed });
          lastFoundCol = c;
        }
      } else if (lastFoundCol > 0 && c - lastFoundCol >= MAX_DATE_GAP) {
        break;
      }
    }

    if (candidateDates.length < 2) {
      continue;
    }

    // 直下（+1〜+4行以内）で「オーダー」「発注」見出しがいくつ一致するか探索
    let maxOrderMatches = 0;
    let matchedHeaderRow = -1;
    const maxHeaderRow = Math.min(worksheet.rowCount, r + 4);

    for (let hr = r + 1; hr <= maxHeaderRow; hr++) {
      const hRow = worksheet.getRow(hr);
      let matches = 0;
      for (let i = 0; i < candidateDates.length; i++) {
        const start = candidateDates[i].col;
        const end = i + 1 < candidateDates.length ? candidateDates[i + 1].col - 1 : start + MAX_DATE_GAP - 1;
        for (let c = start; c <= end; c++) {
          const txt = normalizeHeader(hRow.getCell(c).value);
          if (txt === 'オーダー' || txt === '発注' || txt === 'オーダー数' || txt === '発注数') {
            matches++;
            break;
          }
        }
      }
      if (matches > maxOrderMatches) {
        maxOrderMatches = matches;
        matchedHeaderRow = hr;
      }
    }

    // スコアリング: 直下にオーダー見出しがある行を最優先！
    // オーダー見出しが2個以上一致していれば超高スコア（matches * 100 + 日付数）
    // オーダー見出しが0個の行（金額データ行の誤認など）はスコア0で除外
    const score = maxOrderMatches >= 2
      ? (maxOrderMatches * 100) + candidateDates.length
      : (maxOrderMatches > 0 ? candidateDates.length : 0);

    if (score > bestScore) {
      bestScore = score;
      bestDateRow = r;
      bestDateCols = candidateDates;
      bestHeaderRow = matchedHeaderRow > 0 ? matchedHeaderRow : r + 1;
    }
  }

  // 日付行またはオーダー見出しが見つからないシートはnullを返してスキップ可能にする
  if (bestDateRow < 0 || bestDateCols.length === 0 || bestScore <= 0) {
    return null;
  }

  const dateRowNumber = bestDateRow;
  const headerRowNumber = bestHeaderRow;
  const dateCols = bestDateCols;
  const headerRow = worksheet.getRow(headerRowNumber);

  // 各日付に対する「オーダー」列インデックスを特定
  const dates: ParsedOrderDate[] = [];
  const orderCols: number[] = [];
  const validDateCols: { col: number; y: number; m: number; d: number }[] = [];

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

    // オーダー列が見つからない日付（例: B2セル等に残る過去の日付など）は日付列から除外してスキップ
    if (orderCol < 0) {
      continue;
    }

    const dt = dateCols[i];
    const dateStr = `${dt.y}-${String(dt.m).padStart(2, '0')}-${String(dt.d).padStart(2, '0')}`;
    dates.push({ date: dateStr, label: `${dt.m}月${dt.d}日` });
    orderCols.push(orderCol);
    validDateCols.push(dt);
  }

  if (dates.length === 0) {
    return null;
  }

  // 3. 商品コード列と商品名列の動的特定（1〜有効な最初の日付列直前をスキャン）
  let codeCol = -1;
  let nameCol = -1;
  const priceCols = new Set<number>();
  const effectiveFirstDateCol = validDateCols.length > 0 ? validDateCols[0].col : (dateCols.length > 0 ? dateCols[0].col : 6);
  const scanEndCol = effectiveFirstDateCol > 1 ? effectiveFirstDateCol : 6;

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

  // 3.5 データ行サンプリングによる列の自動判定・補正
  // ヘッダーで見出しが取得できなかった場合や、空欄列を誤認している場合、実際のデータ行を分析して正確に特定
  const dataStartRow = headerRowNumber + 1;
  const sampleRowCount = Math.min(25, Math.max(1, worksheet.rowCount - dataStartRow + 1));
  const colStats = new Map<number, { textCount: number; numberCount: number; emptyCount: number }>();

  for (let c = 1; c < scanEndCol; c++) {
    colStats.set(c, { textCount: 0, numberCount: 0, emptyCount: 0 });
  }

  for (let r = dataStartRow; r < dataStartRow + sampleRowCount; r++) {
    const row = worksheet.getRow(r);
    for (let c = 1; c < scanEndCol; c++) {
      const val = row.getCell(c).value;
      const stats = colStats.get(c)!;
      if (val === null || val === undefined || val === '') {
        stats.emptyCount++;
      } else if (typeof val === 'number') {
        stats.numberCount++;
      } else {
        const str = getTextValue(val);
        if (/^\d+(\.\d+)?$/.test(str)) {
          stats.numberCount++;
        } else if (str.length > 0) {
          stats.textCount++;
        } else {
          stats.emptyCount++;
        }
      }
    }
  }

  // 単価列の追加検出（数値がほとんどを占める列）
  for (const [c, s] of colStats.entries()) {
    if (s.numberCount >= Math.max(2, Math.floor(sampleRowCount * 0.4)) && s.textCount === 0) {
      priceCols.add(c);
    }
  }

  // 商品名列が未確定、または現在特定された列のテキスト出現数が0の場合、
  // サンプリングでテキスト（商品名）が最も多く存在する列を商品名列とする
  const currentNameTextCount = nameCol > 0 ? (colStats.get(nameCol)?.textCount || 0) : 0;
  if (nameCol < 0 || currentNameTextCount === 0) {
    let bestNameCol = -1;
    let maxText = 0;
    for (const [c, s] of colStats.entries()) {
      if (!priceCols.has(c) && s.textCount > maxText) {
        maxText = s.textCount;
        bestNameCol = c;
      }
    }
    if (bestNameCol > 0) {
      nameCol = bestNameCol;
    }
  }

  // 依然として未確定の場合の最終フォールバック
  if (nameCol < 0) {
    if (codeCol === 1 && priceCols.has(2)) {
      nameCol = 1;
      codeCol = -1;
    } else {
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

  for (let r = dataStartRow; r <= rowCount; r++) {
    const row = worksheet.getRow(r);
    const code = codeCol > 0 ? getTextValue(row.getCell(codeCol).value) : '';
    const name = nameCol > 0 ? getTextValue(row.getCell(nameCol).value) : '';

    if (!code && !name) continue;

    // 「オーダー」「total」「予算」「合計」等が含まれる行は商品と見なさない
    const checkTarget = (code + ' ' + name)
      .normalize('NFKC')
      .toLowerCase();

    if (
      checkTarget.includes('オーダー') ||
      checkTarget.includes('total') ||
      checkTarget.includes('予算') ||
      checkTarget.includes('合計') ||
      checkTarget.includes('小計') ||
      checkTarget.includes('総合計') ||
      checkTarget.includes('平均') ||
      checkTarget.trim().startsWith('※')
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
