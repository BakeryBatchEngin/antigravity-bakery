import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getDb } from '@/lib/db';

/**
 * 企業管理者向け：自社テナントの作業・操作履歴（アクティビティログ）API
 */
export async function GET(request: Request) {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: '企業管理者権限が必要です' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const storeId = searchParams.get('store_id');
    const search = searchParams.get('search');
    const limit = Math.min(200, Math.max(10, Number(searchParams.get('limit')) || 100));

    const db = await getDb();

    // テナント決定（super_adminは全件または指定テナント、adminは自社のみ）
    let effectiveTenantId = user.tenant_id;
    if (user.role === 'super_admin') {
      const tenantParam = searchParams.get('tenant_id');
      effectiveTenantId = tenantParam ? Number(tenantParam) : null;
    }

    let query = `
      SELECT 
        a.id,
        a.tenant_id,
        a.user_id,
        a.store_id,
        a.action,
        a.category,
        a.table_name,
        a.record_id,
        a.description,
        a.ip_address,
        a.old_data,
        a.new_data,
        a.created_at,
        u.display_name as user_name,
        u.username,
        s.store_name,
        t.tenant_name
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN stores s ON a.store_id = s.id
      LEFT JOIN tenants t ON a.tenant_id = t.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (effectiveTenantId !== null) {
      params.push(effectiveTenantId);
      query += ` AND a.tenant_id = $${params.length}`;
    }

    if (category && category !== 'ALL') {
      params.push(category);
      query += ` AND a.category = $${params.length}`;
    }

    if (storeId && storeId !== 'ALL') {
      params.push(Number(storeId));
      query += ` AND a.store_id = $${params.length}`;
    }

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      const pIdx = params.length;
      query += ` AND (
        a.description ILIKE $${pIdx} OR 
        u.display_name ILIKE $${pIdx} OR 
        s.store_name ILIKE $${pIdx} OR
        a.table_name ILIKE $${pIdx}
      )`;
    }

    query += ` ORDER BY a.id DESC LIMIT ${limit}`;

    const logs = await db.all(query, params);

    // フィルタ用の店舗一覧を取得（自社店舗のみ）
    let storesQuery = `SELECT id, store_code, store_name FROM stores WHERE 1=1`;
    const storeParams: any[] = [];
    if (effectiveTenantId !== null) {
      storeParams.push(effectiveTenantId);
      storesQuery += ` AND tenant_id = $1`;
    }
    storesQuery += ` ORDER BY store_code ASC`;
    const stores = await db.all(storesQuery, storeParams);

    return NextResponse.json({
      success: true,
      logs,
      stores,
    });
  } catch (err: any) {
    console.error('Failed to fetch activity logs:', err);
    return NextResponse.json({
      error: '作業履歴の取得に失敗しました',
      details: err?.message || '不明なエラー',
    }, { status: 500 });
  }
}
