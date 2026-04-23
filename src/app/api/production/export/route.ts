import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import ExcelJS from 'exceljs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    if (!date) return NextResponse.json({ error: 'date parameter is required' }, { status: 400 });

    const db = await getDb();
    
    // 確定プランを取得
    const savedPlanRow = await db.get(`SELECT plan_data FROM daily_production_plans WHERE target_date = ?`, [date]);
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

    // --- 新規追加: 実行済み（計量完了）の時刻データを取得 ---
    const usageRows = await db.all(
      `SELECT batch_id, ingredient_code, created_at FROM ingredient_usages WHERE target_date = ?`, 
      [date]
    );
    
    // batch_id -> ingredient_code -> time str (例: "14:35") のマップを作成
    const doneTimeMap: Record<string, Record<string, string>> = {};
    if (usageRows && Array.isArray(usageRows)) {
      usageRows.forEach((row: any) => {
        // created_at は PostgreSQL の場合 UTC で保存されているため JST (Asia/Tokyo) に変換する
        if (row.created_at) {
          const d = new Date(row.created_at + 'Z'); // UTCとしてパース（Supabaseの文字列フォーマットに依存）
          // 万が一 Invalid Date などを防ぐ
          if (!isNaN(d.getTime())) {
            // 'ja-JP'ロケールで時間と分を指定 (例: "14:35")
            const timeStr = d.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
            if (!doneTimeMap[row.batch_id]) {
              doneTimeMap[row.batch_id] = {};
            }
            doneTimeMap[row.batch_id][row.ingredient_code] = timeStr;
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
    sheet1.getColumn(2).width = 15; // 指(%)/個数
    sheet1.getColumn(3).width = 20; // 計量(g)
    sheet1.getColumn(4).width = 8;  // Check

    // タイトル
    const titleRow1 = sheet1.addRow([`【生地仕込み詳細】対象日: ${date}`, '', '', '']);
    sheet1.mergeCells('A1:D1');
    titleRow1.font = { size: 16, bold: true };
    sheet1.addRow([]);

    for (const batch of flatBatches) {
      // Current weight configuration
      const currentFlourWeightGrams = batch.currentFlourWeightGrams || 0;
      const totalBakersPercent = batch.totalBakersPercent || 100;
      const currentTotalWeightGrams = currentFlourWeightGrams * (totalBakersPercent / 100);

      // バッチタイトル行
      const batchTitleRow = sheet1.addRow([
        `${batch.doughName} (${batch.doughCode}) - ${batch.batchNumber}回目`, 
        '', 
        `粉量: ${(currentFlourWeightGrams / 1000).toFixed(2)}kg`, 
        `目安: ${(currentTotalWeightGrams / 1000).toFixed(2)}kg`
      ]);
      sheet1.mergeCells(`A${batchTitleRow.number}:B${batchTitleRow.number}`);
      
      batchTitleRow.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
      batchTitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } }; // Amber 500
      batchTitleRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCD34D' } }; // Amber 300
      batchTitleRow.getCell(3).font = { bold: true, color: { argb: 'FF92400E' } }; // Amber 900
      batchTitleRow.getCell(3).alignment = { horizontal: 'right' };
      batchTitleRow.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } }; // Amber 200
      batchTitleRow.getCell(4).font = { bold: true, color: { argb: 'FF92400E' } }; 
      batchTitleRow.getCell(4).alignment = { horizontal: 'right' };
      
      for(let i=1; i<=4; i++) {
         batchTitleRow.getCell(i).border = { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} };
      }

      // ヘッダー行
      const headerRow = sheet1.addRow(['材料名', '指定(%)', '計量 (g)', '確']);
      headerRow.font = { bold: true };
      headerRow.eachCell((cell, colNum) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; // Slate 100
        cell.border = { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} };
        if(colNum !== 1) cell.alignment = { horizontal: 'center' };
      });

      // 材料リスト
      if (batch.baseIngredients && Array.isArray(batch.baseIngredients)) {
        for (let idx = 0; idx < batch.baseIngredients.length; idx++) {
          const ing = batch.baseIngredients[idx];
          const requiredWeight = currentFlourWeightGrams * (ing.bakersPercent / 100);
          
          const reqW = Math.round(requiredWeight * 10) / 10;
          
          // 該当バッチ・材料の計量完了時刻があれば取得
          const doneTime = doneTimeMap[batch.id]?.[ing.ingredientCode] || '';

          const row = sheet1.addRow([
            ing.ingredientName,
            `${ing.bakersPercent}%`,
            reqW,
            doneTime
          ]);
          
          row.getCell(3).numFmt = '#,##0.##" g"';
          
          // Styling
          const isOdd = idx % 2 === 1;
          for (let c = 1; c <= 4; c++) {
            const cell = row.getCell(c);
            cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
            if (isOdd) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            if (c > 1) cell.alignment = { horizontal: 'center' };
            if (c === 3) cell.font = { bold: true, size: 12, color: { argb: 'FFD97706' } }; // Amber 600
          }
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
    sheet2.getColumn(2).width = 15; // (空白・使用数)
    sheet2.getColumn(3).width = 20; // グラム数
    sheet2.getColumn(4).width = 8;  // Check

    const titleRow2 = sheet2.addRow([`【本日の全商品仕込み】対象日: ${date}`, '', '', '']);
    sheet2.mergeCells('A1:D1');
    titleRow2.font = { size: 16, bold: true };
    sheet2.addRow([]);

    for (const batch of flatProductBatches) {
      const currentQty = batch.currentBatchQuantity || 1;
      const safeOriginalQty = batch.originalBatchQuantity || 1;
      const originalTotalDough = batch.originalTotalDoughWeightGrams || 0;
      const doughPerItem = originalTotalDough / safeOriginalQty;
      const currentDoughWeight = Math.round(doughPerItem * currentQty * 10) / 10;

      // バッチタイトル行
      const batchTitleRow = sheet2.addRow([
        `${batch.productName} (${batch.productCode}) - ${batch.batchNumber}回目`, 
        '', 
        `仕込数: ${currentQty}個`,
        ''
      ]);
      sheet2.mergeCells(`A${batchTitleRow.number}:B${batchTitleRow.number}`);
      
      batchTitleRow.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
      batchTitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } }; // Emerald 500
      batchTitleRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6EE7B7' } }; // Emerald 300
      batchTitleRow.getCell(3).font = { bold: true, color: { argb: 'FF065F46' } }; // Emerald 900
      batchTitleRow.getCell(3).alignment = { horizontal: 'right' };
      
      for(let i=1; i<=4; i++) {
         batchTitleRow.getCell(i).border = { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} };
      }

      // ヘッダー行
      const headerRow2 = sheet2.addRow(['材料（生地・副材料）', '', '総計量 (g)', '確']);
      headerRow2.font = { bold: true };
      headerRow2.eachCell((cell, colNum) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; 
        cell.border = { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} };
        if(colNum !== 1) cell.alignment = { horizontal: 'center' };
      });

      let lineIdx = 0;
      
      // 生地を最初の行として出力
      if (batch.doughName && currentDoughWeight > 0) {
         // アプリ側の仕様では「生地」自体の完了チェックはないため空欄にします
         const dRow = sheet2.addRow([ `${batch.doughName} (生地)`, '', currentDoughWeight, '' ]);
         dRow.getCell(1).font = { bold: true, color: { argb: 'FFB45309' } }; // Amber 700
         dRow.getCell(3).numFmt = '#,##0.##" g"';
         dRow.getCell(3).alignment = { horizontal: 'center' };
         dRow.getCell(3).font = { bold: true, size: 12, color: { argb: 'FFB45309' } };
         for (let c = 1; c <= 4; c++) {
            dRow.getCell(c).border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
         }
         lineIdx++;
      }

      // 副材料を列挙
      if (batch.baseIngredients && Array.isArray(batch.baseIngredients)) {
        for (const ing of batch.baseIngredients) {
          const perItemWeight = ing.requiredWeightGrams / safeOriginalQty;
          const reqWeight = Math.round(perItemWeight * currentQty * 10) / 10;
          
          // 該当バッチ・材料の計量完了時刻があれば取得
          const doneTime = doneTimeMap[batch.id]?.[ing.ingredientCode] || '';

          const row = sheet2.addRow([
            ing.ingredientName,
            '',
            reqWeight,
            doneTime
          ]);
          
          row.getCell(3).numFmt = '#,##0.##" g"';
          
          // Styling
          const isOdd = lineIdx % 2 === 1;
          for (let c = 1; c <= 4; c++) {
            const cell = row.getCell(c);
            cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
            if (isOdd) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            if (c > 1) cell.alignment = { horizontal: 'center' };
            if (c === 3) cell.font = { bold: true, size: 12, color: { argb: 'FFD97706' } };
          }
          lineIdx++;
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
