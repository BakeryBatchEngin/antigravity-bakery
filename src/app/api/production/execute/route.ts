import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { date, batchId, ingredients } = await request.json();
    if (!date || !batchId || !ingredients || !Array.isArray(ingredients)) {
        return NextResponse.json({ error: 'データが不足しています' }, { status: 400 });
    }
    const db = await getDb();
    
    // SQLiteを使ったトランザクション風の安全な複数挿入（重複回避のためまず削除して再挿入）
    await db.run('BEGIN TRANSACTION');
    try {
      await db.run('DELETE FROM ingredient_usages WHERE target_date = ? AND batch_id = ?', [date, batchId]);
      
      for (const ing of ingredients) {
          await db.run(`
              INSERT INTO ingredient_usages (target_date, batch_id, ingredient_code, ingredient_name, used_weight_grams)
              VALUES (?, ?, ?, ?, ?)
          `, [date, batchId, ing.ingredientCode, ing.ingredientName, Math.round(ing.requiredWeightGrams)]);
      }
      await db.run('COMMIT');
    } catch(err) {
      await db.run('ROLLBACK');
      throw err;
    }
    return NextResponse.json({ success: true });
  } catch(error) {
    console.error('Error executing batch:', error);
    return NextResponse.json({ error: 'バッチの実行記録に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const batchId = searchParams.get('batchId');
    if (!date || !batchId) {
      return NextResponse.json({ error: 'パラメータが不足しています' }, { status: 400 });
    }

    const db = await getDb();
    await db.run('DELETE FROM ingredient_usages WHERE target_date = ? AND batch_id = ?', [date, batchId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error reverting batch:', error);
    return NextResponse.json({ error: '実行バッチの撤回(キャンセル)に失敗しました' }, { status: 500 });
  }
}
