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
      for (const batch of batches) {
        if (!batch.ingredients || batch.ingredients.length === 0) {
            const existing = await txDb.get(
              'SELECT 1 FROM ingredient_usages WHERE store_id = ? AND target_date = ? AND batch_id = ? AND ingredient_code = ?',
              [storeId, date, batch.batchId, '__NO_INGREDIENTS__']
            );
            if (!existing) {
                await txDb.run(`
                    INSERT INTO ingredient_usages (store_id, target_date, batch_id, ingredient_code, ingredient_name, used_weight_grams)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [storeId, date, batch.batchId, '__NO_INGREDIENTS__', '副材料なし（実行済）', 0]);
            }
        } else {
            for (const ing of batch.ingredients) {
                // 既に登録されているか確認し、登録されていなければ INSERT する
                const existing = await txDb.get(
                  'SELECT 1 FROM ingredient_usages WHERE store_id = ? AND target_date = ? AND batch_id = ? AND ingredient_code = ?',
                  [storeId, date, batch.batchId, ing.ingredientCode]
                );
                
                if (!existing) {
                    await txDb.run(`
                        INSERT INTO ingredient_usages (store_id, target_date, batch_id, ingredient_code, ingredient_name, used_weight_grams)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `, [storeId, date, batch.batchId, ing.ingredientCode, ing.ingredientName, Math.round(ing.requiredWeightGrams * 10) / 10]);
                }
            }
        }
      }
    });
    return NextResponse.json({ success: true });
  } catch(error) {
    console.error('Error executing bulk batch:', error);
    return NextResponse.json({ error: '一括実行記録に失敗しました' }, { status: 500 });
  }
}
