import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getDb } from '@/lib/db';

/**
 * Superadmin専用：セキュリティ監査・アクセスログAPI
 */
export async function GET(request: Request) {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    if (user.role !== 'super_admin') {
      return NextResponse.json({ error: 'スーパー管理者権限が必要です' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const severity = searchParams.get('severity');
    const eventType = searchParams.get('event_type');
    const search = searchParams.get('search');
    const limit = Math.min(300, Math.max(10, Number(searchParams.get('limit')) || 100));

    const db = await getDb();

    let query = `
      SELECT 
        s.id,
        s.tenant_id,
        s.user_id,
        s.username_attempted,
        s.event_type,
        s.severity,
        s.message,
        s.action_advice,
        s.ip_address,
        s.user_agent,
        s.endpoint,
        s.metadata,
        s.created_at,
        u.display_name as user_name,
        t.tenant_name
      FROM security_logs s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN tenants t ON s.tenant_id = t.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (severity && severity !== 'ALL') {
      params.push(severity);
      query += ` AND s.severity = $${params.length}`;
    }

    if (eventType && eventType !== 'ALL') {
      params.push(eventType);
      query += ` AND s.event_type = $${params.length}`;
    }

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      const pIdx = params.length;
      query += ` AND (
        s.message ILIKE $${pIdx} OR 
        s.username_attempted ILIKE $${pIdx} OR 
        s.ip_address ILIKE $${pIdx} OR
        t.tenant_name ILIKE $${pIdx}
      )`;
    }

    query += ` ORDER BY s.id DESC LIMIT ${limit}`;

    const logs = await db.all(query, params);

    // 統計サマリー（過去24時間）
    const statsQuery = `
      SELECT 
        COUNT(*) as total_events,
        COUNT(CASE WHEN severity = 'CRITICAL' THEN 1 END) as critical_count,
        COUNT(CASE WHEN severity = 'WARNING' THEN 1 END) as warning_count,
        COUNT(CASE WHEN event_type = 'AUTH_FAILURE' THEN 1 END) as auth_failure_count,
        COUNT(CASE WHEN event_type = 'ACCOUNT_LOCKED' THEN 1 END) as account_locked_count
      FROM security_logs
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `;
    const stats = await db.get(statsQuery);

    return NextResponse.json({
      success: true,
      logs,
      stats: {
        total: Number(stats?.total_events || 0),
        critical: Number(stats?.critical_count || 0),
        warning: Number(stats?.warning_count || 0),
        authFailures: Number(stats?.auth_failure_count || 0),
        accountLocked: Number(stats?.account_locked_count || 0),
      },
    });
  } catch (err: any) {
    console.error('Failed to fetch security logs:', err);
    return NextResponse.json({
      error: 'セキュリティログの取得に失敗しました',
      details: err?.message || '不明なエラー',
    }, { status: 500 });
  }
}
