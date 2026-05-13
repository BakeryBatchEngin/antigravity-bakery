import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { date, batches } = await request.json();
    if (!date || !batches || !Array.isArray(batches)) {
        return NextResponse.json({ error: 'データが不足しています' }, { status: 400 });
    }
    const db = await getDb();
    
    await db.run('BEGIN TRANSACTION');
    try {
      for (const batch of batches) {
        for (const ing of batch.ingredients) {
            // 既に登録されているか確認し、登録されていなければ INSERT する
            const existing = await db.get(
              'SELECT 1 FROM ingredient_usages WHERE target_date = ? AND batch_id = ? AND ingredient_code = ?',
              [date, batch.batchId, ing.ingredientCode]
            );
            
            if (!existing) {
                await db.run(`
                    INSERT INTO ingredient_usages (target_date, batch_id, ingredient_code, ingredient_name, used_weight_grams)
                    VALUES (?, ?, ?, ?, ?)
                `, [date, batch.batchId, ing.ingredientCode, ing.ingredientName, Math.round(ing.requiredWeightGrams * 10) / 10]);
            }
        }
      }
      await db.run('COMMIT');
    } catch(err) {
      await db.run('ROLLBACK');
      throw err;
    }
    return NextResponse.json({ success: true });
  } catch(error) {
    console.error('Error executing bulk batch:', error);
    return NextResponse.json({ error: '一括実行記録に失敗しました' }, { status: 500 });
  }
}
