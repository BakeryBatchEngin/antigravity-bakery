import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { date, batches } = await request.json();
    if (!date || !batches || !Array.isArray(batches)) {
        return NextResponse.json({ error: 'データが不足しています' }, { status: 400 });
    }
    
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('bakery_session');
    if (!sessionCookie || !sessionCookie.value) return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    const user = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));

    const storeCookie = cookieStore.get('active_store_id');
    const storeId = storeCookie ? Number(storeCookie.value) : null;
    if (!storeId) return NextResponse.json({ error: '店舗が選択されていません' }, { status: 400 });

    const db = await getDb();
    
    await db.transactionWithUser(user.id, storeId, user.role, async (txDb) => {
      console.time('bulk_execute_check');
      const batchIds = batches.map((b: any) => b.batchId);
      if (batchIds.length === 0) return;

      const placeholders = batchIds.map(() => '?').join(',');
      const existingRows = await txDb.all(
        `SELECT batch_id, ingredient_code FROM ingredient_usages WHERE store_id = ? AND target_date = ? AND batch_id IN (${placeholders})`,
        [storeId, date, ...batchIds]
      );
      
      const existingSet = new Set<string>();
      existingRows.forEach((row: any) => {
        existingSet.add(`${row.batch_id}_${row.ingredient_code}`);
      });
      console.timeEnd('bulk_execute_check');

      console.time('bulk_execute_insert');
      const toInsert: any[] = [];
      for (const batch of batches) {
        if (!batch.ingredients || batch.ingredients.length === 0) {
          const key = `${batch.batchId}___NO_INGREDIENTS__`;
          if (!existingSet.has(key)) {
            toInsert.push([storeId, date, batch.batchId, '__NO_INGREDIENTS__', '副材料なし（実行済）', 0]);
          }
        } else {
          for (const ing of batch.ingredients) {
            const key = `${batch.batchId}_${ing.ingredientCode}`;
            if (!existingSet.has(key)) {
              toInsert.push([storeId, date, batch.batchId, ing.ingredientCode, ing.ingredientName, Math.round(ing.requiredWeightGrams * 100) / 100]);
            }
          }
        }
      }

      if (toInsert.length > 0) {
        const chunkSize = 200; 
        for (let i = 0; i < toInsert.length; i += chunkSize) {
          const chunk = toInsert.slice(i, i + chunkSize);
          const valuePlaceholders = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
          const flatValues = chunk.flat();
          await txDb.run(`
            INSERT INTO ingredient_usages (store_id, target_date, batch_id, ingredient_code, ingredient_name, used_weight_grams)
            VALUES ${valuePlaceholders}
          `, flatValues);
        }
      }
      console.timeEnd('bulk_execute_insert');
    });
    
    return NextResponse.json({ success: true });
  } catch(error) {
    console.error('Error executing bulk batch:', error);
    return NextResponse.json({ error: '一括実行記録に失敗しました' }, { status: 500 });
  }
}
