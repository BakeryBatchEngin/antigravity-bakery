import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import SecurityLogsClient from './SecurityLogsClient';

export default async function SuperAdminSecurityLogsPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('bakery_session');

  if (!sessionCookie) redirect('/login');

  let user: any;
  try {
    user = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
  } catch (e) {
    redirect('/login');
  }

  if (user.role !== 'super_admin') {
    return <div className="text-red-500 p-4">スーパー管理者権限がありません</div>;
  }

  const db = await getDb();

  // 最新セキュリティログ（直近300件）
  const logs = await db.all(`
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
    ORDER BY s.id DESC
    LIMIT 300
  `);

  // 統計情報（過去24時間）
  const statsRow = await db.get(`
    SELECT 
      COUNT(*) as total_events,
      COUNT(CASE WHEN severity = 'CRITICAL' THEN 1 END) as critical_count,
      COUNT(CASE WHEN severity = 'WARNING' THEN 1 END) as warning_count,
      COUNT(CASE WHEN event_type = 'AUTH_FAILURE' THEN 1 END) as auth_failure_count,
      COUNT(CASE WHEN event_type = 'ACCOUNT_LOCKED' THEN 1 END) as account_locked_count
    FROM security_logs
    WHERE created_at >= NOW() - INTERVAL '24 hours'
  `);

  const stats = {
    total: Number(statsRow?.total_events || 0),
    critical: Number(statsRow?.critical_count || 0),
    warning: Number(statsRow?.warning_count || 0),
    authFailures: Number(statsRow?.auth_failure_count || 0),
    accountLocked: Number(statsRow?.account_locked_count || 0),
  };

  return (
    <SecurityLogsClient
      initialLogs={logs || []}
      stats={stats}
    />
  );
}
