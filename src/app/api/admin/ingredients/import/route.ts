import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import ExcelJS from 'exceljs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'ファイルが見つかりません' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const sheet = workbook.getWorksheet(1); // 1つ目のシートを使用
    if (!sheet) {
      return NextResponse.json({ error: 'Excelシートが見つかりません' }, { status: 400 });
    }

    const db = await getDb();
    const excelCodes = new Set<string>();

    await db.run('BEGIN TRANSACTION');

    try {
      // 2行目から読み込み
      const rowsToProcess: any[] = [];
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // ヘッダーはスキップ
        rowsToProcess.push(row);
      });

      let rowCount = 0;
      for (const row of rowsToProcess) {
        const code = row.getCell(1).text?.trim();
        const name = row.getCell(2).text?.trim();
        const weightText = row.getCell(3).text?.replace(/,/g, '').replace(/g/i, '')?.trim();
        const priceText = row.getCell(4).text?.replace(/,/g, '').replace(/¥|\\/g, '')?.trim();
        const statusText = row.getCell(5).text?.trim();

        if (!code || !name) {
          // コードか名前が空の場合はスキップ
          continue;
        }

        excelCodes.add(code);

        const purchaseWeight = weightText ? parseInt(weightText, 10) : null;
        const purchasePrice = priceText ? parseInt(priceText, 10) : null;

        // ステータス変換
        let status = 'active';
        if (statusText === '利用停止') status = 'suspended';
        if (statusText === '削除') status = 'deleted';

        // Upsert
        await db.run(`
          INSERT INTO ingredients (ingredient_code, ingredient_name, purchase_weight, purchase_price, status)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(ingredient_code) DO UPDATE SET
            ingredient_name = excluded.ingredient_name,
            purchase_weight = excluded.purchase_weight,
            purchase_price = excluded.purchase_price,
            status = excluded.status
        `, [
          code, 
          name, 
          isNaN(purchaseWeight as number) ? null : purchaseWeight, 
          isNaN(purchasePrice as number) ? null : purchasePrice, 
          status
        ]);
        
        // 関連テーブルの名前も念のため更新
        await db.run(`UPDATE doughs SET ingredient_name = ? WHERE ingredient_code = ?`, [name, code]);
        await db.run(`UPDATE product_ingredients SET ingredient_name = ? WHERE ingredient_code = ?`, [name, code]);
        
        rowCount++;
      }

      // Excelに存在しなかったコードをDB側で「削除(deleted)」ステータスにする
      const allIngredients = await db.all('SELECT ingredient_code FROM ingredients');
      for (const ing of allIngredients) {
        if (!excelCodes.has(ing.ingredient_code)) {
          await db.run("UPDATE ingredients SET status = 'deleted' WHERE ingredient_code = ?", [ing.ingredient_code]);
        }
      }

      await db.run('COMMIT');

      return NextResponse.json({ success: true, count: rowCount });
    } catch (e) {
      await db.run('ROLLBACK');
      console.error('Database Error during import:', e);
      throw e;
    }

  } catch (error) {
    console.error('Import Excel Error:', error);
    return NextResponse.json({ error: 'Excelの読み込み・保存に失敗しました' }, { status: 500 });
  }
}
