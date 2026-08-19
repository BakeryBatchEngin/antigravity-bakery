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
    
    // Excelからデータを読み取ってProduct単位にまとめる
    const productsMap = new Map<string, { product_name: string, retail_price: number, wholesale_price: number, doughs: any[], ingredients: any[] }>();

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // ヘッダーはスキップ
      
      const product_code = row.getCell(1).text?.trim();
      const product_name = row.getCell(2).text?.trim();
      
      if (!product_code || !product_name) return;

      const retail_price_text = row.getCell(3).text?.replace(/,/g, '')?.trim();
      const wholesale_price_text = row.getCell(4).text?.replace(/,/g, '')?.trim();
      const retail_price = retail_price_text ? parseInt(retail_price_text, 10) : 0;
      const wholesale_price = wholesale_price_text ? parseInt(wholesale_price_text, 10) : 0;

      const comp_type = row.getCell(5).text?.trim();
      const comp_code = row.getCell(6).text?.trim();
      const comp_name = row.getCell(7).text?.trim();
      const amount_text = row.getCell(8).text?.replace(/,/g, '')?.replace(/g/i, '')?.trim();
      const amount = amount_text ? parseFloat(amount_text) : 0;

      if (!productsMap.has(product_code)) {
        productsMap.set(product_code, { product_name, retail_price, wholesale_price, doughs: [], ingredients: [] });
      }

      if (comp_type && comp_code && comp_name && amount > 0) {
        if (comp_type === '生地') {
          productsMap.get(product_code)?.doughs.push({ dough_code: comp_code, dough_name: comp_name, dough_amount: amount });
        } else if (comp_type === '副材料') {
          productsMap.get(product_code)?.ingredients.push({ ingredient_code: comp_code, ingredient_name: comp_name, ingredient_amount: amount });
        }
      }
    });

    let rowCount = 0;
    await db.run('BEGIN TRANSACTION');

    try {
      for (const [product_code, data] of Array.from(productsMap.entries())) {
        // Product自体のUpsert
        await db.run(`
          INSERT INTO products (product_code, product_name, retail_price, wholesale_price, tenant_id)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(product_code) DO UPDATE SET
            product_name = excluded.product_name,
            retail_price = excluded.retail_price,
            wholesale_price = excluded.wholesale_price
        `, [product_code, data.product_name, data.retail_price, data.wholesale_price, tenantId]);

        // 部分更新のため、Excelに存在する商品コードについてのみ関連テーブルを一度削除して再挿入する
        if (tenantId) {
          await db.run('DELETE FROM product_doughs WHERE product_code = ? AND tenant_id = ?', [product_code, tenantId]);
          await db.run('DELETE FROM product_ingredients WHERE product_code = ? AND tenant_id = ?', [product_code, tenantId]);
        } else {
          await db.run('DELETE FROM product_doughs WHERE product_code = ?', [product_code]);
          await db.run('DELETE FROM product_ingredients WHERE product_code = ?', [product_code]);
        }

        for (const d of data.doughs) {
          await db.run(`
            INSERT INTO product_doughs (product_code, dough_code, dough_name, dough_amount, tenant_id)
            VALUES (?, ?, ?, ?, ?)
          `, [product_code, d.dough_code, d.dough_name, d.dough_amount, tenantId]);
        }

        for (const i of data.ingredients) {
          await db.run(`
            INSERT INTO product_ingredients (product_code, ingredient_code, ingredient_name, ingredient_amount, tenant_id)
            VALUES (?, ?, ?, ?, ?)
          `, [product_code, i.ingredient_code, i.ingredient_name, i.ingredient_amount, tenantId]);
        }
        
        rowCount++;
      }

      await db.run('COMMIT');
      return NextResponse.json({ success: true, count: productsMap.size });
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
