import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { date, batchId } = await request.json();
    if (!date || !batchId) {
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
      await txDb.run(`
        INSERT INTO batch_executions (store_id, target_date, batch_id, executed_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(store_id, target_date, batch_id) DO UPDATE SET
          executed_at = CURRENT_TIMESTAMP
      `, [storeId, date, batchId]);
    });
    
    return NextResponse.json({ success: true });
  } catch(error) {
    console.error('Error recording mixing:', error);
    return NextResponse.json({ error: 'ミキシング記録に失敗しました' }, { status: 500 });
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
    
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('bakery_session');
    if (!sessionCookie || !sessionCookie.value) return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    const user = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));

    const storeCookie = cookieStore.get('active_store_id');
    const storeId = storeCookie ? Number(storeCookie.value) : null;
    if (!storeId) return NextResponse.json({ error: '店舗が選択されていません' }, { status: 400 });

    const db = await getDb();
    
    await db.transactionWithUser(user.id, storeId, user.role, async (txDb) => {
      await txDb.run('DELETE FROM batch_executions WHERE store_id = ? AND target_date = ? AND batch_id = ?', [storeId, date, batchId]);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error reverting mixing:', error);
    return NextResponse.json({ error: 'ミキシング記録の取り消しに失敗しました' }, { status: 500 });
  }
}
