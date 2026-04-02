import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = await getDb();
    
    // 全商品コードと名前を取得するため、2つのテーブルからUNION
    const baseProducts = await db.all(`
      SELECT product_code, product_name FROM product_doughs
      UNION
      SELECT product_code, product_name FROM product_ingredients
      ORDER BY product_code ASC
    `);

    // 各テーブルのデータを全取得
    const [doughRows, ingRows] = await Promise.all([
      db.all('SELECT * FROM product_doughs'),
      db.all('SELECT * FROM product_ingredients')
    ]);

    const productsMap = new Map();
    baseProducts.forEach((p: any) => {
      productsMap.set(p.product_code, {
        product_code: p.product_code,
        product_name: p.product_name,
        doughs: [],
        ingredients: []
      });
    });

    doughRows.forEach((row: any) => {
      if (productsMap.has(row.product_code)) {
        productsMap.get(row.product_code).doughs.push({
          dough_code: row.dough_code,
          dough_name: row.dough_name,
          dough_amount: row.dough_amount
        });
      }
    });

    ingRows.forEach((row: any) => {
      if (productsMap.has(row.product_code)) {
        productsMap.get(row.product_code).ingredients.push({
          ingredient_code: row.ingredient_code,
          ingredient_name: row.ingredient_name,
          ingredient_amount: row.ingredient_amount
        });
      }
    });

    const products = Array.from(productsMap.values());
    
    return NextResponse.json({ success: true, products });
  } catch (error) {
    console.error('Failed to fetch products:', error);
    return NextResponse.json({ error: 'データの取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { product_code, product_name, doughs, ingredients } = await request.json();
    
    if (!product_code || !product_name) {
      return NextResponse.json({ error: '商品コードと商品名は必須です' }, { status: 400 });
    }

    const hasDough = Array.isArray(doughs) && doughs.length > 0;
    const hasIng = Array.isArray(ingredients) && ingredients.length > 0;

    if (!hasDough && !hasIng) {
      return NextResponse.json({ error: '少なくとも1つ以上の使用生地または副材料を追加してください' }, { status: 400 });
    }

    const db = await getDb();
    
    // Transaction開始
    await db.run('BEGIN TRANSACTION');
    
    try {
      // 既存データを一度削除して作り直す
      await db.run('DELETE FROM product_doughs WHERE product_code = ?', [product_code]);
      await db.run('DELETE FROM product_ingredients WHERE product_code = ?', [product_code]);

      if (hasDough) {
        for (const d of doughs) {
          let nameToInsert = d.dough_name;
          if (!nameToInsert) {
            const masterDough = await db.get('SELECT dough_name FROM doughs WHERE dough_id = ? LIMIT 1', [d.dough_code]);
            nameToInsert = masterDough ? masterDough.dough_name : '不明な生地';
          }
          await db.run(`
            INSERT INTO product_doughs (product_code, product_name, dough_code, dough_name, dough_amount)
            VALUES (?, ?, ?, ?, ?)
          `, [product_code, product_name, d.dough_code, nameToInsert, d.dough_amount]);
        }
      }

      if (hasIng) {
        for (const ing of ingredients) {
          let nameToInsert = ing.ingredient_name;
          if (!nameToInsert) {
            const masterIng = await db.get('SELECT ingredient_name FROM ingredients WHERE ingredient_code = ?', [ing.ingredient_code]);
            nameToInsert = masterIng ? masterIng.ingredient_name : '不明な副材料';
          }
          await db.run(`
            INSERT INTO product_ingredients (product_code, product_name, ingredient_code, ingredient_name, ingredient_amount)
            VALUES (?, ?, ?, ?, ?)
          `, [product_code, product_name, ing.ingredient_code, nameToInsert, ing.ingredient_amount]);
        }
      }
      
      await db.run('COMMIT');
      return NextResponse.json({ success: true });
    } catch (txError) {
      await db.run('ROLLBACK');
      throw txError;
    }
    
  } catch (error) {
    console.error('Failed to save product:', error);
    return NextResponse.json({ error: 'データの保存に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('id');
    
    if (!code) return NextResponse.json({ error: '商品コードが指定されていません' }, { status: 400 });

    const db = await getDb();
    
    // 受注(orders) で使われているかチェック
    const orderUsage = await db.get('SELECT 1 FROM orders WHERE product_code = ? LIMIT 1', [code]);
    if (orderUsage) {
      return NextResponse.json({ error: 'この商品は受注データが存在するため削除できません' }, { status: 400 });
    }

    await db.run('BEGIN TRANSACTION');
    try {
      await db.run('DELETE FROM product_doughs WHERE product_code = ?', [code]);
      await db.run('DELETE FROM product_ingredients WHERE product_code = ?', [code]);
      await db.run('COMMIT');
      return NextResponse.json({ success: true });
    } catch (e) {
      await db.run('ROLLBACK');
      throw e;
    }
  } catch (error) {
    console.error('Failed to delete product:', error);
    return NextResponse.json({ error: 'データの削除に失敗しました' }, { status: 500 });
  }
}
