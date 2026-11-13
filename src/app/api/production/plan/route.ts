import { NextResponse } from 'next/server';
import { resolveStoreAuth } from '@/lib/storeAuth';
import { logActivity } from '@/lib/logger';

export async function POST(request: Request) {
  try {
    const { date, flatBatches, flatWipBatches, flatProductBatches } = await request.json();
    if (!date || !flatBatches) {
      return NextResponse.json({ error: 'データが不足しています' }, { status: 400 });
    }

    const auth = await resolveStoreAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { user, storeId, db } = auth;

    const planData = JSON.stringify({ flatBatches, flatWipBatches, flatProductBatches });

    await db.transactionWithUser(user.id, storeId, user.role, async (txDb) => {
      await txDb.run(`
        INSERT INTO daily_production_plans (store_id, target_date, plan_data)
        VALUES (?, ?, ?)
        ON CONFLICT(target_date, store_id) DO UPDATE SET
          plan_data=excluded.plan_data,
          updated_at=CURRENT_TIMESTAMP
      `, [storeId, date, planData]);
    });

    // 業務アクティビティログを記録
    const batchCount = Array.isArray(flatBatches) ? flatBatches.length : 0;
    await logActivity({
      tenantId: user.tenant_id,
      userId: user.id,
      storeId,
      action: 'UPDATE',
      category: 'production',
      tableName: 'daily_production_plans',
      recordId: date,
      description: `仕込み計画を保存しました（対象日: ${date} / 計${batchCount}バッチ）`,
      newData: { date, batchCount },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving plan:', error);
    return NextResponse.json({ error: '計画の保存に失敗しました' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    if (!date) {
      return NextResponse.json({ error: '日付が指定されていません' }, { status: 400 });
    }

    const auth = await resolveStoreAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { storeId, db } = auth;

    const plan = await db.get(
      'SELECT plan_data FROM daily_production_plans WHERE store_id = ? AND target_date = ?',
      [storeId, date]
    );

    if (!plan) {
      return NextResponse.json({ plan: null });
    }

    return NextResponse.json({ plan: JSON.parse(plan.plan_data) });
  } catch (error) {
    console.error('Error fetching plan:', error);
    return NextResponse.json({ error: '計画の取得に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    if (!date) {
      return NextResponse.json({ error: '日付が指定されていません' }, { status: 400 });
    }

    const auth = await resolveStoreAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { user, storeId, db } = auth;

    await db.transactionWithUser(user.id, storeId, user.role, async (txDb) => {
      await txDb.run('DELETE FROM daily_production_plans WHERE store_id = ? AND target_date = ?', [storeId, date]);
      await txDb.run('DELETE FROM ingredient_usages WHERE store_id = ? AND target_date = ?', [storeId, date]);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting plan:', error);
    return NextResponse.json({ error: '計画のリセットに失敗しました' }, { status: 500 });
  }
}
