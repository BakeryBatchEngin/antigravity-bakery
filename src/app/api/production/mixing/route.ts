import { NextResponse } from 'next/server';
import { resolveStoreAuth } from '@/lib/storeAuth';

export async function POST(request: Request) {
  try {
    const { date, batchId } = await request.json();
    if (!date || !batchId) {
        return NextResponse.json({ error: 'データが不足しています' }, { status: 400 });
    }
    
    const auth = await resolveStoreAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { user, storeId, db } = auth;
    
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
    
    const auth = await resolveStoreAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { user, storeId, db } = auth;
    
    await db.transactionWithUser(user.id, storeId, user.role, async (txDb) => {
      await txDb.run('DELETE FROM batch_executions WHERE store_id = ? AND target_date = ? AND batch_id = ?', [storeId, date, batchId]);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error reverting mixing:', error);
    return NextResponse.json({ error: 'ミキシング記録の取り消しに失敗しました' }, { status: 500 });
  }
}
