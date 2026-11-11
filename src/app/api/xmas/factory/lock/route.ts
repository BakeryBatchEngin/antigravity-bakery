import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getDb } from '@/lib/db';

/**
 * クリスマス受発注の店舗ロック状態取得API
 */
export async function GET() {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const db = await getDb();
    const effectiveTenantId = user.tenant_id;

    if (!effectiveTenantId) {
      return NextResponse.json({ is_locked: false });
    }

    const setting = await db.get(
      `SELECT setting_value FROM xmas_settings WHERE tenant_id = $1 AND setting_key = 'is_order_locked'`,
      [effectiveTenantId]
    );

    const isLocked = setting?.setting_value === 'true';
    return NextResponse.json({ is_locked: isLocked });
  } catch (err: any) {
    console.error('Failed to get xmas lock status:', err);
    return NextResponse.json({ error: 'ロック状態の取得に失敗しました', details: err.message }, { status: 500 });
  }
}

/**
 * クリスマス受発注の店舗ロック切替API
 * 工場（xmas_factory）およびシステム管理者（admin, super_admin）のみ実行可能
 */
export async function POST(request: Request) {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const isAllowed = ['xmas_factory', 'admin', 'super_admin'].includes(user.role);
    if (!isAllowed) {
      return NextResponse.json({ error: '発注ロックの切替権限がありません' }, { status: 403 });
    }

    const body = await request.json();
    const { is_locked, tenant_id } = body;

    const effectiveTenantId = user.role === 'super_admin' ? (tenant_id ? Number(tenant_id) : user.tenant_id) : user.tenant_id;
    if (!effectiveTenantId) {
      return NextResponse.json({ error: 'テナントIDが特定できません' }, { status: 400 });
    }

    const db = await getDb();
    const lockVal = is_locked ? 'true' : 'false';

    const existing = await db.get(
      `SELECT id FROM xmas_settings WHERE tenant_id = $1 AND setting_key = 'is_order_locked'`,
      [effectiveTenantId]
    );

    if (existing) {
      await db.run(
        `UPDATE xmas_settings SET setting_value = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [lockVal, existing.id]
      );
    } else {
      await db.run(
        `INSERT INTO xmas_settings (tenant_id, setting_key, setting_value) VALUES ($1, 'is_order_locked', $2)`,
        [effectiveTenantId, lockVal]
      );
    }

    return NextResponse.json({
      success: true,
      is_locked: is_locked === true,
      message: is_locked ? '店舗からの新規発注・変更をロックしました' : '店舗からの発注ロックを解除しました',
    });
  } catch (err: any) {
    console.error('Failed to update xmas lock status:', err);
    return NextResponse.json({ error: '発注ロックの切替に失敗しました', details: err.message }, { status: 500 });
  }
}
