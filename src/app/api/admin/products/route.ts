import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = await getDb();
    
    // products, product_doughs, product_ingredients の全テーブルから商品コードを収集する
    // （products テーブルに登録されていない商品も拾えるようにするため）
    const [baseProducts, doughRows, ingRows] = await Promise.all([
      db.all('SELECT product_code, product_name, retail_price, wholesale_price FROM products ORDER BY product_code ASC'),
      db.all('SELECT * FROM product_doughs ORDER BY product_code ASC'),
      db.all('SELECT * FROM product_ingredients ORDER BY product_code ASC'),
    ]);

    // products テーブルの情報を Map に格納
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

    // product_doughs に含まれる商品コードが products テーブルに存在しない場合も追加
    doughRows.forEach((row: any) => {
      if (!productsMap.has(row.product_code)) {
        productsMap.set(row.product_code, {
          product_code: row.product_code,
          product_name: row.product_name || row.product_code,
          retail_price: 0,
          wholesale_price: 0,
          doughs: [],
          ingredients: []
        });
      }
      productsMap.get(row.product_code).doughs.push({
        dough_code: row.dough_code,
        dough_name: row.dough_name,
        dough_amount: row.dough_amount
      });
    });

    // product_ingredients に含まれる商品コードも同様に補完
    ingRows.forEach((row: any) => {
      if (!productsMap.has(row.product_code)) {
        productsMap.set(row.product_code, {
          product_code: row.product_code,
          product_name: row.product_name || row.product_code,
          retail_price: 0,
          wholesale_price: 0,
          doughs: [],
          ingredients: []
        });
      }
      productsMap.get(row.product_code).ingredients.push({
        ingredient_code: row.ingredient_code,
        ingredient_name: row.ingredient_name,
        ingredient_amount: row.ingredient_amount
      });
    });

    // Map を配列に変換してコード順にソート
    const products = Array.from(productsMap.values()).sort((a, b) =>
      a.product_code.localeCompare(b.product_code)
    );
    
    return NextResponse.json({ success: true, products });
  } catch (error) {
    console.error('Failed to fetch products:', error);
    return NextResponse.json({ error: 'データの取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { product_code, product_name, retail_price, wholesale_price, doughs, ingredients } = await request.json();
    
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
      // products テーブルの upsert
      await db.run(`
        INSERT INTO products (product_code, product_name, retail_price, wholesale_price)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(product_code) DO UPDATE SET
          product_name = excluded.product_name,
          retail_price = excluded.retail_price,
          wholesale_price = excluded.wholesale_price
      `, [product_code, product_name, retail_price || 0, wholesale_price || 0]);

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
      await db.run('DELETE FROM products WHERE product_code = ?', [code]);
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
