import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { date, batchId, ingredients } = await request.json();
    if (!date || !batchId || !ingredients || !Array.isArray(ingredients)) {
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
      if (ingredients.length === 0) {
        const existing = await txDb.get(
          'SELECT 1 FROM ingredient_usages WHERE store_id = ? AND target_date = ? AND batch_id = ? AND ingredient_code = ?',
          [storeId, date, batchId, '__NO_INGREDIENTS__']
        );
        if (!existing) {
            await txDb.run(`
                INSERT INTO ingredient_usages (store_id, target_date, batch_id, ingredient_code, ingredient_name, used_weight_grams)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [storeId, date, batchId, '__NO_INGREDIENTS__', '副材料なし（実行済）', 0]);
        }
      } else {
        for (const ing of ingredients) {
            const existing = await txDb.get(
              'SELECT 1 FROM ingredient_usages WHERE store_id = ? AND target_date = ? AND batch_id = ? AND ingredient_code = ?',
              [storeId, date, batchId, ing.ingredientCode]
            );
            if (!existing) {
                await txDb.run(`
                    INSERT INTO ingredient_usages (store_id, target_date, batch_id, ingredient_code, ingredient_name, used_weight_grams)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [storeId, date, batchId, ing.ingredientCode, ing.ingredientName, Math.round(ing.requiredWeightGrams * 10) / 10]);
            }
        }
      }
    });
    
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

    const ingredientCode = searchParams.get('ingredientCode');
    
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('bakery_session');
    if (!sessionCookie || !sessionCookie.value) return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    const user = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));

    const storeCookie = cookieStore.get('active_store_id');
    const storeId = storeCookie ? Number(storeCookie.value) : null;
    if (!storeId) return NextResponse.json({ error: '店舗が選択されていません' }, { status: 400 });

    const db = await getDb();
    
    await db.transactionWithUser(user.id, storeId, user.role, async (txDb) => {
      if (ingredientCode) {
        await txDb.run('DELETE FROM ingredient_usages WHERE store_id = ? AND target_date = ? AND batch_id = ? AND ingredient_code = ?', [storeId, date, batchId, ingredientCode]);
      } else {
        await txDb.run('DELETE FROM ingredient_usages WHERE store_id = ? AND target_date = ? AND batch_id = ?', [storeId, date, batchId]);
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error reverting batch:', error);
    return NextResponse.json({ error: '実行バッチの撤回(キャンセル)に失敗しました' }, { status: 500 });
  }
}
