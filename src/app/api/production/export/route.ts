import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import ExcelJS from 'exceljs';

// タイムゾーンによるパースの違いを吸収して JST フォーマット文字列を返す関数
function formatToJST(val: any): string {
  if (!val) return '';
  let date: Date;
  if (val instanceof Date) {
    // ローカル(pgドライバ)の場合、DBの生の値(UTC)がローカル時間としてパースされているので、
    // 各要素を取り出して UTC として組み立て直す
    const y = val.getFullYear();
    const mo = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    const h = String(val.getHours()).padStart(2, '0');
    const m = String(val.getMinutes()).padStart(2, '0');
    const s = String(val.getSeconds()).padStart(2, '0');
    date = new Date(`${y}-${mo}-${d}T${h}:${m}:${s}Z`);
  } else {
    // Vercel(文字列)の場合
    const str = String(val);
    date = new Date(str.endsWith('Z') || str.includes('+') ? str : str + 'Z');
  }

  if (isNaN(date.getTime())) return '';

  // UTCからJST(+9時間)に変換
  const jstTime = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const m = jstTime.getUTCMonth() + 1;
  const day = jstTime.getUTCDate();
  const w = ['日', '月', '火', '水', '木', '金', '土'][jstTime.getUTCDay()];
  const hh = jstTime.getUTCHours().toString().padStart(2, '0');
  const mm = jstTime.getUTCMinutes().toString().padStart(2, '0');
  
  return `${m}月${day}日(${w}) ${hh}:${mm}`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    if (!date) return NextResponse.json({ error: 'date parameter is required' }, { status: 400 });

    // ===== 関所ロジック：セッションと店舗権限をチェックする =====
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('bakery_session');
    if (!sessionCookie || !sessionCookie.value) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    let user: any;
    try {
      user = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
    } catch (e) {
      return NextResponse.json({ error: '無効なセッションです' }, { status: 401 });
    }

    const db = await getDb();
    const storeCookie = cookieStore.get('active_store_id');
    const requestedStoreId = storeCookie ? Number(storeCookie.value) : null;
    let storeId: number | null = null;

    if (['admin', 'master', 'manager'].includes(user.role)) {
      storeId = requestedStoreId;
    } else if (user.role === 'chef') {
      const userStores = await db.all('SELECT store_id FROM user_stores WHERE user_id = ?', [user.id]);
      if (!userStores || userStores.length === 0) {
        return NextResponse.json({ error: '所属店舗が設定されていません。管理者に連絡してください。' }, { status: 403 });
      }
      const allowedStoreIds = userStores.map((row: any) => Number(row.store_id));
      if (requestedStoreId !== null && allowedStoreIds.includes(requestedStoreId)) {
        storeId = requestedStoreId;
      } else {
        storeId = allowedStoreIds[0];
      }
    } else {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    if (!storeId) return NextResponse.json({ error: '店舗が選択されていません' }, { status: 400 });
    // ===== 関所ここまで =====

    // 確定プランを取得（store_id でも絞り込み）
    const savedPlanRow = await db.get(`SELECT plan_data FROM daily_production_plans WHERE target_date = ? AND store_id = ?`, [date, storeId]);
    if (!savedPlanRow) {
      return NextResponse.json({ error: '指定された日付の仕込み計画が確定(Set)されていません。まずは画面でSetボタンを押してください。' }, { status: 404 });
    }

    let planData;
    try {
      planData = JSON.parse(savedPlanRow.plan_data);
    } catch (e) {
      return NextResponse.json({ error: 'プランデータの解析に失敗しました' }, { status: 500 });
    }

    const flatBatches = planData.flatBatches || [];
    const flatProductBatches = planData.flatProductBatches || [];

    // --- 実行済み（計量完了）の時刻データを取得（store_id でも絞り込み）---
    const usageRows = await db.all(
      `SELECT batch_id, ingredient_code, created_at FROM ingredient_usages WHERE target_date = ? AND store_id = ?`, 
      [date, storeId]
    );
    
    // batch_id -> ingredient_code -> time str (例: "14:35") のマップを作成
    const doneTimeMap: Record<string, Record<string, string>> = {};
    if (usageRows && Array.isArray(usageRows)) {
      usageRows.forEach((row: any) => {
        if (row.created_at) {
          const timeStr = formatToJST(row.created_at);
          if (timeStr) {
            if (!doneTimeMap[row.batch_id]) {
              doneTimeMap[row.batch_id] = {};
            }
            doneTimeMap[row.batch_id][row.ingredient_code] = timeStr;
          }
        }
      });
    }
    // --------------------------------------------------------
    
    // --- ミキシング実行時刻データを取得 ---
    const mixingExecutionRows = await db.all(
      `SELECT batch_id, executed_at FROM batch_executions WHERE target_date = ? AND store_id = ?`,
      [date, storeId]
    );
    const mixingExecutionTimeMap: Record<string, string> = {};
    if (mixingExecutionRows && Array.isArray(mixingExecutionRows)) {
      mixingExecutionRows.forEach((row: any) => {
        if (row.executed_at) {
          const timeStr = formatToJST(row.executed_at);
          if (timeStr) {
            mixingExecutionTimeMap[row.batch_id] = `実行: ${timeStr}`;
          }
        }
      });
    }
    // --------------------------------------------------------

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Antigravity Bakery';

    // =====================================
    // シート1: 生地仕込み詳細
    // =====================================
    const sheet1 = workbook.addWorksheet('生地仕込み詳細', { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } } });
    sheet1.getColumn(1).width = 25; // 材料名
    sheet1.getColumn(2).width = 20; // 材料使用期限
    sheet1.getColumn(3).width = 15; // 指(%)/個数
    sheet1.getColumn(4).width = 20; // 計量(g)
    sheet1.getColumn(5).width = 25; // 計量日時

    // タイトル
    const titleRow1 = sheet1.addRow([`【生地仕込み詳細】対象日: ${date}`, '', '', '', '']);
    sheet1.mergeCells('A1:E1');
    titleRow1.font = { size: 16, bold: true };
    sheet1.addRow([]);

    for (const batch of flatBatches) {
      // Current weight configuration
      const currentFlourWeightGrams = batch.currentFlourWeightGrams || 0;
      const totalBakersPercent = batch.totalBakersPercent || 100;
      const currentTotalWeightGrams = currentFlourWeightGrams * (totalBakersPercent / 100);

      const mixingTimeStr = mixingExecutionTimeMap[batch.id] || '';

      // バッチタイトル行
      const batchTitleRow = sheet1.addRow([
        `${batch.doughName} (${batch.doughCode}) - ${batch.batchNumber}回目`, 
        '', 
        mixingTimeStr, 
        `粉量: ${(currentFlourWeightGrams / 1000).toFixed(2)}kg`, 
        `目安: ${(currentTotalWeightGrams / 1000).toFixed(2)}kg`
      ]);
      sheet1.mergeCells(`A${batchTitleRow.number}:B${batchTitleRow.number}`);
      
      batchTitleRow.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
      batchTitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } }; // Amber 500
      batchTitleRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCD34D' } }; // Amber 300
      batchTitleRow.getCell(3).font = { bold: true, color: { argb: 'FFDC2626' } }; // Red 600
      batchTitleRow.getCell(3).alignment = { horizontal: 'right' };
      batchTitleRow.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCD34D' } }; // Amber 300
      batchTitleRow.getCell(4).font = { bold: true, color: { argb: 'FF92400E' } }; // Amber 900
      batchTitleRow.getCell(4).alignment = { horizontal: 'right' };
      batchTitleRow.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } }; // Amber 200
      batchTitleRow.getCell(5).font = { bold: true, color: { argb: 'FF92400E' } }; 
      batchTitleRow.getCell(5).alignment = { horizontal: 'right' };
      
      for(let i=1; i<=5; i++) {
         batchTitleRow.getCell(i).border = { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} };
      }

      // ヘッダー行
      const headerRow = sheet1.addRow(['材料名', '材料使用期限', '指定(%)', '計量 (g)', '計量日時']);
      headerRow.font = { bold: true };
      headerRow.eachCell((cell, colNum) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; // Slate 100
        cell.border = { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} };
        if(colNum !== 1 && colNum !== 2) cell.alignment = { horizontal: 'center' };
      });

      // 材料リスト
      if (batch.baseIngredients && Array.isArray(batch.baseIngredients) && batch.baseIngredients.length > 0) {
        for (let idx = 0; idx < batch.baseIngredients.length; idx++) {
          const ing = batch.baseIngredients[idx];
          const requiredWeight = currentFlourWeightGrams * (ing.bakersPercent / 100);
          
          const reqW = Math.round(requiredWeight * 10) / 10;
          
          // 該当バッチ・材料の計量完了時刻があれば取得
          const doneTime = doneTimeMap[batch.id]?.[ing.ingredientCode] || '';

          const row = sheet1.addRow([
            ing.ingredientName,
            '', // 材料使用期限を手書きするための空欄
            `${ing.bakersPercent}%`,
            reqW,
            doneTime
          ]);
          
          row.getCell(4).numFmt = '#,##0.##" g"';
          
          // Styling
          const isOdd = idx % 2 === 1;
          for (let c = 1; c <= 5; c++) {
            const cell = row.getCell(c);
            cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
            if (isOdd) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            if (c > 2) cell.alignment = { horizontal: 'center' };
            if (c === 4) cell.font = { bold: true, size: 12, color: { argb: 'FFD97706' } }; // Amber 600
          }
        }
      } else {
         const doneTime = doneTimeMap[batch.id]?.['__NO_INGREDIENTS__'] || '';
         const row = sheet1.addRow(['(材料なし)', '', '-', '-', doneTime]);
         row.getCell(1).font = { italic: true, color: { argb: 'FF888888' } };
         for (let c = 1; c <= 5; c++) {
            row.getCell(c).border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
            if (c > 2) row.getCell(c).alignment = { horizontal: 'center' };
         }
      }
      
      // バッチ間に少し隙間を空ける
      sheet1.addRow([]);
    }

    // =====================================
    // シート2: 全商品詳細
    // =====================================
    const sheet2 = workbook.addWorksheet('全商品詳細', { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } } });
    sheet2.getColumn(1).width = 25; // 材料・生地名
    sheet2.getColumn(2).width = 20; // 材料使用期限
    sheet2.getColumn(3).width = 15; // (空白・使用数)
    sheet2.getColumn(4).width = 20; // グラム数
    sheet2.getColumn(5).width = 25; // 計量日時

    const titleRow2 = sheet2.addRow([`【本日の全商品仕込み】対象日: ${date}`, '', '', '', '']);
    sheet2.mergeCells('A1:E1');
    titleRow2.font = { size: 16, bold: true };
    sheet2.addRow([]);

    for (const batch of flatProductBatches) {
      const currentQty = batch.currentBatchQuantity || 1;
      const safeOriginalQty = batch.originalBatchQuantity || 1;
      const originalTotalDough = batch.originalTotalDoughWeightGrams || 0;
      const doughPerItem = originalTotalDough / safeOriginalQty;
      const currentDoughWeight = Math.round(doughPerItem * currentQty * 10) / 10;

      const mixingTimeStr = mixingExecutionTimeMap[batch.id] || '';

      // バッチタイトル行
      const batchTitleRow = sheet2.addRow([
        `${batch.productName} (${batch.productCode}) - ${batch.batchNumber}回目`, 
        '', 
        mixingTimeStr, 
        `仕込数: ${currentQty}個`,
        ''
      ]);
      sheet2.mergeCells(`A${batchTitleRow.number}:B${batchTitleRow.number}`);
      
      batchTitleRow.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
      batchTitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } }; // Emerald 500
      batchTitleRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6EE7B7' } }; // Emerald 300
      batchTitleRow.getCell(3).font = { bold: true, color: { argb: 'FFDC2626' } }; // Red 600
      batchTitleRow.getCell(3).alignment = { horizontal: 'right' };
      batchTitleRow.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6EE7B7' } }; // Emerald 300
      batchTitleRow.getCell(4).font = { bold: true, color: { argb: 'FF065F46' } }; // Emerald 900
      batchTitleRow.getCell(4).alignment = { horizontal: 'right' };
      
      for(let i=1; i<=5; i++) {
         batchTitleRow.getCell(i).border = { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} };
      }

      // ヘッダー行
      const headerRow2 = sheet2.addRow(['材料（生地・副材料）', '材料使用期限', '', '総計量 (g)', '計量日時']);
      headerRow2.font = { bold: true };
      headerRow2.eachCell((cell, colNum) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; 
        cell.border = { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} };
        if(colNum !== 1 && colNum !== 2) cell.alignment = { horizontal: 'center' };
      });

      let lineIdx = 0;
      
      // 生地を最初の行として出力
      if (batch.doughName && currentDoughWeight > 0) {
         // アプリ側の仕様では「生地」自体の完了チェックはないため空欄にします
         const dRow = sheet2.addRow([ `${batch.doughName} (生地)`, '', '', currentDoughWeight, '' ]);
         dRow.getCell(1).font = { bold: true, color: { argb: 'FFB45309' } }; // Amber 700
         dRow.getCell(4).numFmt = '#,##0.##" g"';
         dRow.getCell(4).alignment = { horizontal: 'center' };
         dRow.getCell(4).font = { bold: true, size: 12, color: { argb: 'FFB45309' } };
         for (let c = 1; c <= 5; c++) {
            dRow.getCell(c).border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
         }
         lineIdx++;
      }

      // 副材料を列挙
      if (batch.baseIngredients && Array.isArray(batch.baseIngredients) && batch.baseIngredients.length > 0) {
        for (const ing of batch.baseIngredients) {
          const perItemWeight = ing.requiredWeightGrams / safeOriginalQty;
          const reqWeight = Math.round(perItemWeight * currentQty * 10) / 10;
          
          // 該当バッチ・材料の計量完了時刻があれば取得
          const doneTime = doneTimeMap[batch.id]?.[ing.ingredientCode] || '';

          const row = sheet2.addRow([
            ing.ingredientName,
            '', // 材料使用期限
            '',
            reqWeight,
            doneTime
          ]);
          
          row.getCell(4).numFmt = '#,##0.##" g"';
          
          // Styling
          const isOdd = lineIdx % 2 === 1;
          for (let c = 1; c <= 5; c++) {
            const cell = row.getCell(c);
            cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
            if (isOdd) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            if (c > 2) cell.alignment = { horizontal: 'center' };
            if (c === 4) cell.font = { bold: true, size: 12, color: { argb: 'FFD97706' } };
          }
          lineIdx++;
        }
      } else {
         const doneTime = doneTimeMap[batch.id]?.['__NO_INGREDIENTS__'] || '';
         const row = sheet2.addRow(['(副材料なし)', '', '', '-', doneTime]);
         row.getCell(1).font = { italic: true, color: { argb: 'FF888888' } };
         for (let c = 1; c <= 5; c++) {
            row.getCell(c).border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
            if (c > 2) row.getCell(c).alignment = { horizontal: 'center' };
         }
      }

      // バッチ間に少し隙間を空ける
      sheet2.addRow([]);
    }

    const buffer = await workbook.xlsx.writeBuffer();

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="ProductionPlan_${date.replace(/-/g, '')}.xlsx"`
      }
    });

  } catch (error) {
    console.error('Export Excel Error:', error);
    return NextResponse.json({ error: 'Excelの生成に失敗しました' }, { status: 500 });
  }
}
