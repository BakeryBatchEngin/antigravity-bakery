import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = await getDb();
    const ingredients = await db.all('SELECT * FROM ingredients ORDER BY ingredient_code ASC');
    return NextResponse.json({ success: true, ingredients });
  } catch (error) {
    console.error('Failed to fetch ingredients:', error);
    return NextResponse.json({ error: 'データの取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { ingredient_code, ingredient_name, purchase_weight, purchase_price, status } = await request.json();
    
    if (!ingredient_code || !ingredient_name) {
      return NextResponse.json({ error: '材料コードと材料名は必須です' }, { status: 400 });
    }

    const db = await getDb();
    
    await db.run('BEGIN TRANSACTION');
    try {
      await db.run(`
        INSERT INTO ingredients (ingredient_code, ingredient_name, purchase_weight, purchase_price, status)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(ingredient_code) DO UPDATE SET
          ingredient_name = excluded.ingredient_name,
          purchase_weight = excluded.purchase_weight,
          purchase_price = excluded.purchase_price,
          status = excluded.status
      `, [ingredient_code, ingredient_name, purchase_weight || null, purchase_price || null, status || 'active']);

      // 副材料マスタの名前が変更された場合、関連テーブルも更新する
      await db.run(`UPDATE doughs SET ingredient_name = ? WHERE ingredient_code = ?`, [ingredient_name, ingredient_code]);
      await db.run(`UPDATE product_ingredients SET ingredient_name = ? WHERE ingredient_code = ?`, [ingredient_name, ingredient_code]);
      
      await db.run('COMMIT');
      return NextResponse.json({ success: true });
    } catch (e) {
      await db.run('ROLLBACK');
      throw e;
    }
  } catch (error) {
    console.error('Failed to save ingredient:', error);
    return NextResponse.json({ error: 'データの保存に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    
    if (!code) return NextResponse.json({ error: '材料コードが指定されていません' }, { status: 400 });

    const db = await getDb();
    
    // 論理削除への変更により、使用中チェックは警告なしで通すことも可能ですが、
    // 誤操作防止のためそのまま残すか、論理削除なので通すか。
    // 今回は論理削除なので、過去の使用履歴があっても削除（無効化）できるように使用中チェックを外します。

    await db.run("UPDATE ingredients SET status = 'deleted' WHERE ingredient_code = ?", [code]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete ingredient:', error);
    return NextResponse.json({ error: 'データの削除に失敗しました' }, { status: 500 });
  }
}
