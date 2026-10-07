const fs = require('fs');
const file = 'src/app/api/production/export/route.ts';
let c = fs.readFileSync(file, 'utf8');
const search = "// =====================================\r\n    // シート2";

if (c.includes(search)) {
  const newCode = `    // 仕掛品バッチの出力
    if (flatWipBatches && flatWipBatches.length > 0) {
      const wipTitleRow = sheet1.addRow(['【仕掛品仕込み詳細】', '', '', '', '']);
      sheet1.mergeCells(\`A\${wipTitleRow.number}:E\${wipTitleRow.number}\`);
      wipTitleRow.font = { size: 14, bold: true, color: { argb: 'FF92400E' } };
      sheet1.addRow([]);

      for (const batch of flatWipBatches) {
        const currentTotalWeightGrams = batch.currentTotalWeightGrams || 0;
        const mixingTimeStr = mixingExecutionTimeMap[batch.id] || '';

        const batchTitleRow = sheet1.addRow([
          \`\${batch.wipName} (\${batch.wipCode}) - \${batch.batchNumber}回目\`, 
          '', 
          mixingTimeStr, 
          '', 
          \`仕掛品重量: \${(currentTotalWeightGrams / 1000).toFixed(2)}kg\`
        ]);
        sheet1.mergeCells(\`A\${batchTitleRow.number}:B\${batchTitleRow.number}\`);
        
        batchTitleRow.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
        batchTitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } };
        batchTitleRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCD34D' } };
        batchTitleRow.getCell(3).font = { bold: true, color: { argb: 'FFDC2626' } };
        batchTitleRow.getCell(3).alignment = { horizontal: 'right' };
        batchTitleRow.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } };
        batchTitleRow.getCell(5).font = { bold: true, color: { argb: 'FF92400E' } }; 
        batchTitleRow.getCell(5).alignment = { horizontal: 'right' };
        
        for(let i=1; i<=5; i++) {
           batchTitleRow.getCell(i).border = { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} };
        }

        const headerRow = sheet1.addRow(['材料名', '材料使用期限', '', '計量 (g)', '計量日時']);
        headerRow.font = { bold: true };
        headerRow.eachCell((cell, colNum) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; 
          cell.border = { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} };
          if(colNum !== 1 && colNum !== 2) cell.alignment = { horizontal: 'center' };
        });

        if (batch.baseIngredients && Array.isArray(batch.baseIngredients) && batch.baseIngredients.length > 0) {
          for (const ing of batch.baseIngredients) {
            const safeOriginalWeight = batch.originalTotalWeightGrams || 1;
            const targetWeightGrams = Math.round((ing.requiredWeightGrams / safeOriginalWeight) * currentTotalWeightGrams * 100) / 100;
            const doneTime = doneTimeMap[batch.id]?.[ing.ingredientCode] || '';

            const row = sheet1.addRow([
              ing.ingredientName,
              '',
              '',
              targetWeightGrams.toFixed(2),
              doneTime
            ]);

            for (let c = 1; c <= 5; c++) {
              const cell = row.getCell(c);
              cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
              if (c > 2) cell.alignment = { horizontal: 'center' };
              if (c === 4) cell.font = { bold: true, size: 12, color: { argb: 'FFD97706' } };
            }
          }
        } else {
           const doneTime = doneTimeMap[batch.id]?.['__NO_INGREDIENTS__'] || '';
           const row = sheet1.addRow(['(材料なし)', '', '', '-', doneTime]);
           row.getCell(1).font = { italic: true, color: { argb: 'FF888888' } };
           for (let c = 1; c <= 5; c++) {
              row.getCell(c).border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
              if (c > 2) row.getCell(c).alignment = { horizontal: 'center' };
           }
        }
        sheet1.addRow([]);
      }
    }

    // =====================================
    // シート2`;
  
  c = c.replace(search, newCode);
  fs.writeFileSync(file, c);
  console.log('Successfully patched export route');
} else {
  // try LF instead of CRLF
  const search2 = "// =====================================\n    // シート2";
  if (c.includes(search2)) {
    console.log('Found with LF');
    const newCode = `    // 仕掛品バッチの出力
    if (flatWipBatches && flatWipBatches.length > 0) {
      const wipTitleRow = sheet1.addRow(['【仕掛品仕込み詳細】', '', '', '', '']);
      sheet1.mergeCells(\`A\${wipTitleRow.number}:E\${wipTitleRow.number}\`);
      wipTitleRow.font = { size: 14, bold: true, color: { argb: 'FF92400E' } };
      sheet1.addRow([]);

      for (const batch of flatWipBatches) {
        const currentTotalWeightGrams = batch.currentTotalWeightGrams || 0;
        const mixingTimeStr = mixingExecutionTimeMap[batch.id] || '';

        const batchTitleRow = sheet1.addRow([
          \`\${batch.wipName} (\${batch.wipCode}) - \${batch.batchNumber}回目\`, 
          '', 
          mixingTimeStr, 
          '', 
          \`仕掛品重量: \${(currentTotalWeightGrams / 1000).toFixed(2)}kg\`
        ]);
        sheet1.mergeCells(\`A\${batchTitleRow.number}:B\${batchTitleRow.number}\`);
        
        batchTitleRow.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
        batchTitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } };
        batchTitleRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCD34D' } };
        batchTitleRow.getCell(3).font = { bold: true, color: { argb: 'FFDC2626' } };
        batchTitleRow.getCell(3).alignment = { horizontal: 'right' };
        batchTitleRow.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } };
        batchTitleRow.getCell(5).font = { bold: true, color: { argb: 'FF92400E' } }; 
        batchTitleRow.getCell(5).alignment = { horizontal: 'right' };
        
        for(let i=1; i<=5; i++) {
           batchTitleRow.getCell(i).border = { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} };
        }

        const headerRow = sheet1.addRow(['材料名', '材料使用期限', '', '計量 (g)', '計量日時']);
        headerRow.font = { bold: true };
        headerRow.eachCell((cell, colNum) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; 
          cell.border = { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} };
          if(colNum !== 1 && colNum !== 2) cell.alignment = { horizontal: 'center' };
        });

        if (batch.baseIngredients && Array.isArray(batch.baseIngredients) && batch.baseIngredients.length > 0) {
          for (const ing of batch.baseIngredients) {
            const safeOriginalWeight = batch.originalTotalWeightGrams || 1;
            const targetWeightGrams = Math.round((ing.requiredWeightGrams / safeOriginalWeight) * currentTotalWeightGrams * 100) / 100;
            const doneTime = doneTimeMap[batch.id]?.[ing.ingredientCode] || '';

            const row = sheet1.addRow([
              ing.ingredientName,
              '',
              '',
              targetWeightGrams.toFixed(2),
              doneTime
            ]);

            for (let c = 1; c <= 5; c++) {
              const cell = row.getCell(c);
              cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
              if (c > 2) cell.alignment = { horizontal: 'center' };
              if (c === 4) cell.font = { bold: true, size: 12, color: { argb: 'FFD97706' } };
            }
          }
        } else {
           const doneTime = doneTimeMap[batch.id]?.['__NO_INGREDIENTS__'] || '';
           const row = sheet1.addRow(['(材料なし)', '', '', '-', doneTime]);
           row.getCell(1).font = { italic: true, color: { argb: 'FF888888' } };
           for (let c = 1; c <= 5; c++) {
              row.getCell(c).border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
              if (c > 2) row.getCell(c).alignment = { horizontal: 'center' };
           }
        }
        sheet1.addRow([]);
      }
    }

    // =====================================
    // シート2`;
    c = c.replace(search2, newCode);
    fs.writeFileSync(file, c);
    console.log('Successfully patched export route (LF)');
  } else {
    console.log('Could not find target with CRLF or LF');
  }
}
