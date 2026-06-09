import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AuditLogsTable from './AuditLogsTable';

export default async function AuditLogsPage() {
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
    return <div className="text-red-500 p-4">権限がありません</div>;
  }

  const db = await getDb();
  
  // 監査ログ（上位500件まで取得してクライアント側でフィルタ）
  const logs = await db.all(`
    SELECT 
      a.id, a.action, a.table_name, a.record_id, a.old_data, a.new_data, a.created_at,
      a.store_id,
      u.display_name as user_name,
      s.store_name,
      t.id as tenant_id,
      t.tenant_name
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    LEFT JOIN stores s ON a.store_id = s.id
    LEFT JOIN tenants t ON s.tenant_id = t.id
    ORDER BY a.id DESC
    LIMIT 500
  `);

  // テナント一覧（フィルタ用）
  const tenants = await db.all(`
    SELECT id, tenant_code, tenant_name FROM tenants ORDER BY tenant_name
  `);

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-extrabold text-slate-800">監査ログ (Audit Logs)</h2>
        <p className="text-slate-500 mt-2">システムのデータ変更履歴を監視します（直近500件）</p>
      </header>

      <AuditLogsTable logs={logs} tenants={tenants} />
    </div>
  );
}
