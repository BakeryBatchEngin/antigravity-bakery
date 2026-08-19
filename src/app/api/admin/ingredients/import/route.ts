import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import ExcelJS from 'exceljs';

async function getUser() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('bakery_session');
  if (!sessionCookie?.value) return null;
  try {
    return JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
  } catch { return null; }
}

export async function POST(request: Request) {
  try {
    // 認証チェック（インポートは特に重要）
    const user = await getUser();
    if (!user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const tenantId = user.role === 'super_admin' ? null : user.tenant_id;

    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'ファイルが見つかりません' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const sheet = workbook.getWorksheet(1);
    if (!sheet) {
      return NextResponse.json({ error: 'Excelシートが見つかりません' }, { status: 400 });
    }

    const db = await getDb();
    const excelCodes = new Set<string>();

    await db.run('BEGIN TRANSACTION');

    try {
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

        if (!code || !name) continue;

        excelCodes.add(code);

        const purchaseWeight = weightText ? parseInt(weightText, 10) : null;
        const purchasePrice = priceText ? parseInt(priceText, 10) : null;

        let status = 'active';
        if (statusText === '利用停止') status = 'suspended';
        if (statusText === '削除') status = 'deleted';

        // 自テナントの材料のみ upsert
        await db.run(`
          INSERT INTO ingredients (ingredient_code, ingredient_name, purchase_weight, purchase_price, status, tenant_id)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(ingredient_code) DO UPDATE SET
            ingredient_name = excluded.ingredient_name,
            purchase_weight = excluded.purchase_weight,
            purchase_price = excluded.purchase_price,
            status = excluded.status
        `, [
          code, name,
          isNaN(purchaseWeight as number) ? null : purchaseWeight,
          isNaN(purchasePrice as number) ? null : purchasePrice,
          status, tenantId
        ]);

        // 関連テーブルの名前も連動更新（自テナントのみ）
        if (tenantId) {
          await db.run(`UPDATE doughs SET ingredient_name = ? WHERE ingredient_code = ? AND tenant_id = ?`, [name, code, tenantId]);
          await db.run(`UPDATE product_ingredients SET ingredient_name = ? WHERE ingredient_code = ? AND tenant_id = ?`, [name, code, tenantId]);
        } else {
          await db.run(`UPDATE doughs SET ingredient_name = ? WHERE ingredient_code = ?`, [name, code]);
          await db.run(`UPDATE product_ingredients SET ingredient_name = ? WHERE ingredient_code = ?`, [name, code]);
        }

        rowCount++;
      }

      // Excelに存在しなかったコードを「削除」ステータスに（自テナントのみ）
      // ※部分追加アップロードに対応するため、完全同期の削除ロジックを無効化
      /*
      let allIngredients;
      if (tenantId) {
        allIngredients = await db.all('SELECT ingredient_code FROM ingredients WHERE tenant_id = ?', [tenantId]);
      } else {
        allIngredients = await db.all('SELECT ingredient_code FROM ingredients');
      }

      for (const ing of allIngredients) {
        if (!excelCodes.has(ing.ingredient_code)) {
          if (tenantId) {
            await db.run("UPDATE ingredients SET status = 'deleted' WHERE ingredient_code = ? AND tenant_id = ?", [ing.ingredient_code, tenantId]);
          } else {
            await db.run("UPDATE ingredients SET status = 'deleted' WHERE ingredient_code = ?", [ing.ingredient_code]);
          }
        }
      }
      */

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
