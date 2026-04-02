import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import ExcelJS from 'exceljs';
import { GET as getProductionPlan } from '@/app/api/production/route';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // e.g., "2026-04"
    if (!month) return NextResponse.json({ error: 'month parameter is required' }, { status: 400 });

    const db = await getDb();
    
    // 1. その月の使用量履歴を全取得
    const usages = await db.all(`
      SELECT 
        u.target_date, 
        u.batch_id, 
        u.ingredient_code, 
        u.ingredient_name, 
        u.used_weight_grams,
        i.purchase_weight,
        i.purchase_price
      FROM ingredient_usages u
      LEFT JOIN ingredients i ON u.ingredient_code = i.ingredient_code
      WHERE u.target_date LIKE ?
    `, [`${month}%`]);

    if (usages.length === 0) {
      // 履歴がゼロでも、ヘッダーだけのExcelを返すかどうかの処理
      // とりあえずエラーで返します
      return NextResponse.json({ error: '出力するデータがありません' }, { status: 404 });
    }

    // 2. 月間データ集計 (水を除外)
    const monthlyTotalsMap = new Map();
    usages.forEach((u: any) => {
      if (u.ingredient_name === '水') return;
      if (!monthlyTotalsMap.has(u.ingredient_code)) {
        monthlyTotalsMap.set(u.ingredient_code, {
           code: u.ingredient_code,
           name: u.ingredient_name,
           grams: 0,
           purchase_weight: u.purchase_weight,
           purchase_price: u.purchase_price
        });
      }
      monthlyTotalsMap.get(u.ingredient_code).grams += u.used_weight_grams;
    });
    // sort by code
    const monthlyTotals = Array.from(monthlyTotalsMap.values()).sort((a,b) => a.code.localeCompare(b.code));

    // Workbook作成
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Antigravity Bakery';

    // =====================================
    // シート1: 月間集計
    // =====================================
    const sheet1 = workbook.addWorksheet('月間集計');
    sheet1.getColumn(1).width = 20; // 材料コード
    sheet1.getColumn(2).width = 40; // 材料名
    sheet1.getColumn(3).width = 18; // 総使用量(g)
    sheet1.getColumn(4).width = 18; // 総使用量(kg)

    // Row 1
    const parts = month.split('-');
    const yearMonthStr = `${parts[0]}年${parseInt(parts[1])}月`;
    const titleRow = sheet1.addRow(['原材料使用量', '', '', yearMonthStr]);
    sheet1.mergeCells('A1:C1');
    titleRow.font = { size: 14, bold: true };
    titleRow.getCell(4).alignment = { horizontal: 'right' };
    
    // Row 2
    sheet1.addRow([]);

    // Row 3 (Headers)
    const headerRow = sheet1.addRow(['材料コード', '材料名', '総使用量(g)', '原材料費(円)']);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }; // 白文字
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B9BD5' } }; // 濃い青
      const borderConfig = { style: 'thin', color: { argb: 'FF8EA9DB' } } as const;
      cell.border = { top: borderConfig, bottom: borderConfig, left: borderConfig, right: borderConfig };
      cell.alignment = { horizontal: 'center' };
    });

    // Rows 4+ Data
    monthlyTotals.forEach((t, i) => {
      let cost: string | number = '-';
      if (t.purchase_weight && t.purchase_price) {
        cost = Math.round(t.grams * (t.purchase_price / t.purchase_weight));
      }
      const row = sheet1.addRow([t.code, t.name, t.grams, cost]);
      
      row.getCell(3).numFmt = '#,##0" g"';
      if (typeof cost === 'number') {
        row.getCell(4).numFmt = '"¥"#,##0';
      } else {
        row.getCell(4).alignment = { horizontal: 'center' };
      }
      
      const isOddIndex = i % 2 === 1; // 1行目は白、2行目は薄い青
      for (let c = 1; c <= 4; c++) {
         const cell = row.getCell(c);
         cell.border = { top: { style: 'thin', color: { argb: 'FFD9D9D9' } }, bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } }, left: { style: 'thin', color: { argb: 'FFD9D9D9' } }, right: { style: 'thin', color: { argb: 'FFD9D9D9' } } };
         if (isOddIndex) {
           cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
         }
      }
    });

    // =====================================
    // シート2以降: 日付別シート (製造作業記録)
    // =====================================
    const days = Array.from(new Set(usages.map((u: any) => u.target_date))).sort() as string[];
    
    for (const day of days) {
      const dayStrChunks = day.split('-');
      const daySheetName = `${dayStrChunks[0]}.${parseInt(dayStrChunks[1])}.${parseInt(dayStrChunks[2])}`; // 例: 2026.4.2
      const sheet = workbook.addWorksheet(daySheetName);
      
      sheet.getColumn(1).width = 40; // 材料名
      sheet.getColumn(2).width = 18; // 使用量(g)
      sheet.getColumn(3).width = 18; // 使用量(kg)

      // Row 1
      const dayTitleRow = sheet.addRow(['製造作業記録', '', daySheetName]);
      sheet.mergeCells('A1:B1');
      dayTitleRow.font = { size: 14, bold: true };
      dayTitleRow.getCell(3).alignment = { horizontal: 'right' };

      // 対象日の仕込みプラン情報を取得（APIを内部呼び出し）
      const dummyUrl = new URL(request.url);
      dummyUrl.pathname = '/api/production';
      dummyUrl.search = `?date=${day}`;
      const mockReq = new Request(dummyUrl.toString());
      const resCtx = await getProductionPlan(mockReq);
      const resData = await resCtx.json();

      // プランからフラットなバッチ一覧を組み立て
      let flatBatches = resData.savedFlatBatches || [];
      if (flatBatches.length === 0 && resData.productionPlan) {
        flatBatches = resData.productionPlan.flatMap((p: any) => 
          p.batches.map((b: any) => ({ 
            id: `${p.doughCode}-${b.batchNumber}`, // D- プレフィックス無し（フロントエンドと統一）
            doughName: p.doughName, 
            batchNumber: b.batchNumber,
            currentFlourWeightGrams: b.batchFlourWeightGrams,
            totalBakersPercent: p.totalBakersPercent
          }))
        );
      }

      let flatProductBatches = resData.savedFlatProductBatches || [];
      if (flatProductBatches.length === 0 && resData.productMixingPlan) {
        flatProductBatches = resData.productMixingPlan.flatMap((p: any) => 
          p.batches.map((b: any) => ({
            id: `PM-${p.productCode}-${b.batchNumber}`,
            productName: p.productName,
            doughName: b.doughName,
            batchNumber: b.batchNumber,
            currentBatchQuantity: b.batchQuantity,
            originalBatchQuantity: b.batchQuantity,
            originalTotalDoughWeightGrams: b.totalDoughWeightGrams
          }))
        );
      }

      // 該当日の実行済み材料履歴をバッチ単位でグループ化
      const dayUsages = usages.filter((u: any) => u.target_date === day);
      const usagesByBatch = new Map();
      dayUsages.forEach((u: any) => {
        if (!usagesByBatch.has(u.batch_id)) usagesByBatch.set(u.batch_id, []);
        usagesByBatch.get(u.batch_id).push(u);
      });

      // 表示順：生地バッチ → 商品バッチ、それぞれのアルファベット・数字順
      const executedIds = Array.from(usagesByBatch.keys());
      executedIds.sort((a: string, b: string) => {
        const isAProduct = a.startsWith('PM-');
        const isBProduct = b.startsWith('PM-');
        if (!isAProduct && isBProduct) return -1;
        if (isAProduct && !isBProduct) return 1;
        return a.localeCompare(b);
      });

      for (const bId of executedIds) {
        const isDough = !bId.startsWith('PM-');
        const batchUsages = usagesByBatch.get(bId) || [];
        
        // バッチの前に1行空ける
        sheet.addRow([]);

        if (isDough) {
          const parts = bId.split('-');
          const fallbackBatchNum = parts.length > 1 ? parseInt(parts[parts.length - 1], 10) || 1 : 1;
          const fallbackDoughCode = parts.slice(0, parts.length - 1).join('-');
          
          let batchInfo = flatBatches.find((b: any) => b.id === bId);
          if (!batchInfo) {
             const similarBatch = flatBatches.find((b: any) => b.id.startsWith(fallbackDoughCode + '-'));
             batchInfo = {
                doughName: similarBatch ? similarBatch.doughName : `不明生地(${fallbackDoughCode})`,
                batchNumber: fallbackBatchNum
             };
          }
          const totalWeightGrams = batchUsages.reduce((sum: number, u: any) => sum + u.used_weight_grams, 0);

          // Orange Row (バッチタイトル)
          const batchHeader = sheet.addRow([`${batchInfo.doughName}${batchInfo.batchNumber}回目`, '総生地量', totalWeightGrams / 1000]);
          for (let c = 1; c <= 3; c++) batchHeader.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };
          batchHeader.font = { bold: true };
          batchHeader.getCell(3).numFmt = '#,##0.00" kg"';
          batchHeader.getCell(3).alignment = { horizontal: 'right' };
          batchHeader.getCell(2).alignment = { horizontal: 'right' };

          // Light Blue Header (列タイトル)
          const colsHeader = sheet.addRow(['材料名', '使用量(g)', '原材料費(円)']);
          for (let c = 1; c <= 3; c++) colsHeader.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } }; 
          colsHeader.font = { bold: true };
          for (let c = 1; c <= 3; c++) colsHeader.getCell(c).border = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };

          // Items
          batchUsages.forEach((u: any, idx: number) => {
             let cost: string | number = '-';
             if (u.purchase_weight && u.purchase_price) {
               cost = Math.round(u.used_weight_grams * (u.purchase_price / u.purchase_weight));
             }
             const row = sheet.addRow([u.ingredient_name, u.used_weight_grams, cost]);
             row.getCell(2).numFmt = '#,##0" g"';
             if (typeof cost === 'number') {
               row.getCell(3).numFmt = '"¥"#,##0';
             } else {
               row.getCell(3).alignment = { horizontal: 'center' };
             }
             for (let c = 1; c <= 3; c++) row.getCell(c).border = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
             // Even rows get light blue bg
             if (idx % 2 === 0) {
               for (let c = 1; c <= 3; c++) row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } }; 
             }
          });

        } else {
          // 商品(副材料)バッチ
          const parts = bId.replace('PM-', '').split('-');
          const fallbackBatchNum = parts.length > 1 ? parseInt(parts[parts.length - 1], 10) || 1 : 1;
          const fallbackProductCode = parts.slice(0, parts.length - 1).join('-');
          
          let batchInfo = flatProductBatches.find((b: any) => b.id === bId);
          if (!batchInfo) {
             const similarBatch = flatProductBatches.find((b: any) => b.id.startsWith('PM-' + fallbackProductCode + '-'));
             batchInfo = {
                productName: similarBatch ? similarBatch.productName : `不明商品(${fallbackProductCode})`,
                doughName: similarBatch ? similarBatch.doughName : '',
                batchNumber: fallbackBatchNum,
                currentBatchQuantity: 0,
                originalTotalDoughWeightGrams: 0
             };
          }
          
          // Green Row
          const batchHeader = sheet.addRow([`${batchInfo.productName}${batchInfo.batchNumber}回目`, '仕込み個数', batchInfo.currentBatchQuantity]);
          for (let c = 1; c <= 3; c++) batchHeader.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
          batchHeader.font = { bold: true };
          batchHeader.getCell(3).numFmt = '#,##0';
          batchHeader.getCell(3).alignment = { horizontal: 'right' };
          batchHeader.getCell(2).alignment = { horizontal: 'right' };

          // Light Blue Header
          const colsHeader = sheet.addRow(['材料名', '使用量(g)', '原材料費(円)']);
          for (let c = 1; c <= 3; c++) colsHeader.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } };
          colsHeader.font = { bold: true };
          for (let c = 1; c <= 3; c++) colsHeader.getCell(c).border = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };

          // 使用生地情報を最初に挿入
          let idxCount = 0;
          
          // DB保存時に不足している可能性がある生地計算（個数ベースで補正）
          const currentQty = batchInfo.currentBatchQuantity || 1;
          const originalQty = batchInfo.originalBatchQuantity || currentQty;
          const originalDoughAmount = batchInfo.originalTotalDoughWeightGrams || 0;
          const computedTotalDoughAmount = batchInfo.currentTotalDoughWeightGrams || Math.round((originalDoughAmount / originalQty) * currentQty);

          if (batchInfo.doughName && computedTotalDoughAmount > 0) {
             const doughRow = sheet.addRow([`${batchInfo.doughName}(生地)`, computedTotalDoughAmount, '-']);
             doughRow.getCell(2).numFmt = '#,##0" g"';
             doughRow.getCell(3).alignment = { horizontal: 'center' };
             for (let c = 1; c <= 3; c++) doughRow.getCell(c).border = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
             for (let c = 1; c <= 3; c++) doughRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } }; 
             idxCount++;
          }

          // 副材料リストを挿入
          batchUsages.forEach((u: any) => {
             let cost: string | number = '-';
             if (u.purchase_weight && u.purchase_price) {
               cost = Math.round(u.used_weight_grams * (u.purchase_price / u.purchase_weight));
             }
             const row = sheet.addRow([u.ingredient_name, u.used_weight_grams, cost]);
             row.getCell(2).numFmt = '#,##0" g"';
             if (typeof cost === 'number') {
               row.getCell(3).numFmt = '"¥"#,##0';
             } else {
               row.getCell(3).alignment = { horizontal: 'center' };
             }
             for (let c = 1; c <= 3; c++) row.getCell(c).border = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
             if (idxCount % 2 === 0) {
               for (let c = 1; c <= 3; c++) row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
             }
             idxCount++;
          });
        }
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="IngredientsReport_${month.replace('-', '')}.xlsx"`
      }
    });

  } catch (error) {
    console.error('Export Excel Error:', error);
    return NextResponse.json({ error: 'Excelの生成に失敗しました' }, { status: 500 });
  }
}
