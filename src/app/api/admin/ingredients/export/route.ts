import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import ExcelJS from 'exceljs';

export async function GET(request: Request) {
  try {
    const db = await getDb();
    
    // 全材料データを取得（論理削除されたものも含む）
    const ingredients = await db.all('SELECT * FROM ingredients ORDER BY ingredient_code ASC');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Antigravity Bakery';
    const sheet = workbook.addWorksheet('材料マスタ');

    // 列の幅を設定
    sheet.getColumn(1).width = 20; // 材料コード
    sheet.getColumn(2).width = 40; // 材料名
    sheet.getColumn(3).width = 15; // 仕入量(g)
    sheet.getColumn(4).width = 15; // 仕入価格(¥)
    sheet.getColumn(5).width = 15; // ステータス

    // ヘッダー行 (1行目)
    const headerRow = sheet.addRow(['材料コード', '材料名', '仕入量(g)', '仕入価格(¥)', 'ステータス']);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B9BD5' } };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { horizontal: 'center' };
    });

    // データ行 (2行目以降)
    ingredients.forEach(ing => {
      // ステータスの日本語化
      let statusStr = '有効';
      if (ing.status === 'suspended') statusStr = '利用停止';
      if (ing.status === 'deleted') statusStr = '削除';

      const row = sheet.addRow([
        ing.ingredient_code,
        ing.ingredient_name,
        ing.purchase_weight || '',
        ing.purchase_price || '',
        statusStr
      ]);

      row.getCell(3).numFmt = '#,##0" g"';
      row.getCell(4).numFmt = '"¥"#,##0';
      row.getCell(5).alignment = { horizontal: 'center' };

      // 取り消し線や文字色の設定（削除・利用停止の場合）
      if (ing.status === 'deleted') {
        row.font = { color: { argb: 'FFAAAAAA' }, strike: true };
      } else if (ing.status === 'suspended') {
        row.font = { color: { argb: 'FFD97706' } }; // Amber
      }
      
      row.eachCell(cell => {
        cell.border = { top: { style: 'thin', color: { argb: 'FFD9D9D9' } }, bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } }, left: { style: 'thin', color: { argb: 'FFD9D9D9' } }, right: { style: 'thin', color: { argb: 'FFD9D9D9' } } };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();

    // ファイル名を日付付きにする
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="IngredientsMaster_${dateStr}.xlsx"`
      }
    });

  } catch (error) {
    console.error('Export Excel Error:', error);
    return NextResponse.json({ error: 'Excelの生成に失敗しました' }, { status: 500 });
  }
}
