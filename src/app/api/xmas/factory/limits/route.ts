import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getDb } from '@/lib/db';
import { logActivity } from '@/lib/logger';

/**
 * 最大受注数の設定更新API
 */
export async function POST(request: Request) {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    if (!['xmas_factory', 'admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: '最大受注数の設定権限がありません' }, { status: 403 });
    }

    const body = await request.json();
    const { limits, tenant_id } = body; // limits: [{ product_name: string, max_limit: number }]

    if (!limits || !Array.isArray(limits)) {
      return NextResponse.json({ error: 'データ形式が不正です' }, { status: 400 });
    }

    const effectiveTenantId = user.role === 'super_admin' ? (tenant_id ? Number(tenant_id) : user.tenant_id) : user.tenant_id;
    if (!effectiveTenantId) {
      return NextResponse.json({ error: 'テナントIDが特定できません' }, { status: 400 });
    }

    const db = await getDb();

    // 各商品の最大上限数を安全にUPSERT（SELECTで存在確認後UPDATE/INSERT）
    for (const item of limits) {
      const { product_name, max_limit } = item;
      if (!product_name) continue;
      const parsedLimit = Math.max(0, parseInt(String(max_limit)) || 0);

      const existing = await db.get(
        `SELECT id FROM xmas_product_limits WHERE tenant_id = $1 AND product_name = $2`,
        [effectiveTenantId, product_name]
      );

      if (existing) {
        await db.run(
          `UPDATE xmas_product_limits SET max_limit = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [parsedLimit, existing.id]
        );
      } else {
        await db.run(
          `INSERT INTO xmas_product_limits (tenant_id, product_name, max_limit) VALUES ($1, $2, $3)`,
          [effectiveTenantId, product_name, parsedLimit]
        );
      }
    }

    // 業務アクティビティログを記録
    const limitsSummary = limits.map((l: any) => `${l.product_name}:${l.max_limit}台`).join(', ');
    await logActivity({
      tenantId: effectiveTenantId,
      userId: user.is_xmas ? null : user.id,
      action: 'UPDATE',
      category: 'xmas',
      tableName: 'xmas_product_limits',
      description: `[クリスマス工場] 商品別製造上限数を更新しました (${limitsSummary})`,
      newData: { limits },
    });

    return NextResponse.json({ success: true, message: '最大受注数を保存しました' });
  } catch (err: any) {
    console.error('Failed to update product limits:', err);
    return NextResponse.json({ error: '最大受注数の保存に失敗しました', details: err.message }, { status: 500 });
  }
}
