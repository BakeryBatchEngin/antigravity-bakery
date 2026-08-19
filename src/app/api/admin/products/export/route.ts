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

export async function GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDb();
    const tenantFilter = user.role === 'super_admin' ? '' : 'WHERE tenant_id = ?';
    const tenantParams = user.role === 'super_admin' ? [] : [user.tenant_id];

    const [baseProducts, doughRows, ingRows] = await Promise.all([
      db.all(`SELECT product_code, product_name, retail_price, wholesale_price FROM products ${tenantFilter} ORDER BY product_code ASC`, tenantParams),
      db.all(`SELECT * FROM product_doughs ${tenantFilter} ORDER BY product_code ASC`, tenantParams),
      db.all(`SELECT * FROM product_ingredients ${tenantFilter} ORDER BY product_code ASC`, tenantParams),
    ]);

    const productsMap = new Map<string, any>();
    baseProducts.forEach((p: any) => {
      productsMap.set(p.product_code, {
        product_code: p.product_code,
        product_name: p.product_name,
        retail_price: p.retail_price || 0,
        wholesale_price: p.wholesale_price || 0,
        doughs: [],
        ingredients: []
      });
    });

    doughRows.forEach((row: any) => {
      if (!productsMap.has(row.product_code)) {
        productsMap.set(row.product_code, {
          product_code: row.product_code,
          product_name: row.product_name || row.product_code,
          retail_price: 0, wholesale_price: 0, doughs: [], ingredients: []
        });
      }
      productsMap.get(row.product_code).doughs.push({
        dough_code: row.dough_code, dough_name: row.dough_name, dough_amount: row.dough_amount
      });
    });

    ingRows.forEach((row: any) => {
      if (!productsMap.has(row.product_code)) {
        productsMap.set(row.product_code, {
          product_code: row.product_code,
          product_name: row.product_name || row.product_code,
          retail_price: 0, wholesale_price: 0, doughs: [], ingredients: []
        });
      }
      productsMap.get(row.product_code).ingredients.push({
        ingredient_code: row.ingredient_code, ingredient_name: row.ingredient_name, ingredient_amount: row.ingredient_amount
      });
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('商品マスタ');

    sheet.columns = [
      { header: '商品コード', key: 'product_code', width: 15 },
      { header: '商品名', key: 'product_name', width: 30 },
      { header: '一般販売価格', key: 'retail_price', width: 15 },
      { header: '社内取引価格', key: 'wholesale_price', width: 15 },
      { header: '構成タイプ', key: 'comp_type', width: 15 },
      { header: '構成コード', key: 'comp_code', width: 15 },
      { header: '構成名', key: 'comp_name', width: 30 },
      { header: '使用量(g)', key: 'amount', width: 15 }
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };

    const products = Array.from(productsMap.values()).sort((a, b) => a.product_code.localeCompare(b.product_code));

    products.forEach(prod => {
      const { product_code, product_name, retail_price, wholesale_price, doughs, ingredients } = prod;

      if (doughs.length === 0 && ingredients.length === 0) {
        sheet.addRow({ product_code, product_name, retail_price, wholesale_price, comp_type: '', comp_code: '', comp_name: '', amount: '' });
      } else {
        doughs.forEach((d: any) => {
          sheet.addRow({ product_code, product_name, retail_price, wholesale_price, comp_type: '生地', comp_code: d.dough_code, comp_name: d.dough_name, amount: d.dough_amount });
        });
        ingredients.forEach((i: any) => {
          sheet.addRow({ product_code, product_name, retail_price, wholesale_price, comp_type: '副材料', comp_code: i.ingredient_code, comp_name: i.ingredient_name, amount: i.ingredient_amount });
        });
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="products_master.xlsx"',
      },
    });
  } catch (error) {
    console.error('Export Error:', error);
    return NextResponse.json({ error: 'Excelの生成に失敗しました' }, { status: 500 });
  }
}
