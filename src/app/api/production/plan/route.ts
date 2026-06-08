import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { date, flatBatches, flatProductBatches } = await request.json();
    if (!date || !flatBatches) {
      return NextResponse.json({ error: 'データが不足しています' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('bakery_session');
    
    if (!sessionCookie || !sessionCookie.value) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }
    
    let user;
    try {
      user = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
    } catch (e) {
      return NextResponse.json({ error: '無効なセッションです' }, { status: 401 });
    }

    const db = await getDb();
    const storeCookie = cookieStore.get('active_store_id');
    const requestedStoreId = storeCookie ? Number(storeCookie.value) : null;
    let storeId = null;

    if (['admin', 'master', 'manager'].includes(user.role)) {
      storeId = requestedStoreId;
    } else if (user.role === 'chef') {
      const userStores = await db.all('SELECT store_id FROM user_stores WHERE user_id = ?', [user.id]);
      if (!userStores || userStores.length === 0) {
        return NextResponse.json({ error: '所属店舗が設定されていません。管理者に連絡してください。' }, { status: 403 });
      }
      
      const allowedStoreIds = userStores.map((row: any) => Number(row.store_id));
      
      if (requestedStoreId !== null && allowedStoreIds.includes(requestedStoreId)) {
        storeId = requestedStoreId;
      } else {
        storeId = allowedStoreIds[0];
      }
    } else {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    if (!storeId) {
      return NextResponse.json({ error: '店舗が選択されていません' }, { status: 400 });
    }
    const planData = JSON.stringify({ flatBatches, flatProductBatches });

    await db.transactionWithUser(user.id, storeId, user.role, async (txDb) => {
      await txDb.run(`
        INSERT INTO daily_production_plans (store_id, target_date, plan_data)
        VALUES (?, ?, ?)
        ON CONFLICT(target_date, store_id) DO UPDATE SET
          plan_data=excluded.plan_data,
          updated_at=CURRENT_TIMESTAMP
      `, [storeId, date, planData]);

      const validBatchIds = [
        ...(flatBatches || []).map((b: any) => b.id),
        ...(flatProductBatches || []).map((b: any) => b.id)
      ];

      if (validBatchIds.length > 0) {
        const placeholders = validBatchIds.map(() => '?').join(',');
        await txDb.run(`
          DELETE FROM ingredient_usages 
          WHERE store_id = ? AND target_date = ? AND batch_id NOT IN (${placeholders})
        `, [storeId, date, ...validBatchIds]);
      } else {
        await txDb.run('DELETE FROM ingredient_usages WHERE store_id = ? AND target_date = ?', [storeId, date]);
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving plan:', error);
    return NextResponse.json({ error: '生産計画の保存(Set)に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    if (!date) {
      return NextResponse.json({ error: '日付が指定されていません' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('bakery_session');
    
    if (!sessionCookie || !sessionCookie.value) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }
    
    let user;
    try {
      user = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
    } catch (e) {
      return NextResponse.json({ error: '無効なセッションです' }, { status: 401 });
    }

    const db = await getDb();
    const storeCookie = cookieStore.get('active_store_id');
    const requestedStoreId = storeCookie ? Number(storeCookie.value) : null;
    let storeId = null;

    if (['admin', 'master', 'manager'].includes(user.role)) {
      storeId = requestedStoreId;
    } else if (user.role === 'chef') {
      const userStores = await db.all('SELECT store_id FROM user_stores WHERE user_id = ?', [user.id]);
      if (!userStores || userStores.length === 0) {
        return NextResponse.json({ error: '所属店舗が設定されていません。管理者に連絡してください。' }, { status: 403 });
      }
      
      const allowedStoreIds = userStores.map((row: any) => Number(row.store_id));
      
      if (requestedStoreId !== null && allowedStoreIds.includes(requestedStoreId)) {
        storeId = requestedStoreId;
      } else {
        storeId = allowedStoreIds[0];
      }
    } else {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    if (!storeId) {
      return NextResponse.json({ error: '店舗が選択されていません' }, { status: 400 });
    }
    await db.transactionWithUser(user.id, storeId, user.role, async (txDb) => {
      await txDb.run('DELETE FROM daily_production_plans WHERE store_id = ? AND target_date = ?', [storeId, date]);

      // リセット時は一緒にその日の実行記録も消すか？
      // ユーザーが明示的にリセットを押した場合は一旦計画全体を初期化するので、実行記録も消す。
      await txDb.run('DELETE FROM ingredient_usages WHERE store_id = ? AND target_date = ?', [storeId, date]);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting plan:', error);
    return NextResponse.json({ error: '計画のリセットに失敗しました' }, { status: 500 });
  }
}
