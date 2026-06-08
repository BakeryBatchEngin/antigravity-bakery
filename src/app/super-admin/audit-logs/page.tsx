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
  
  const logs = await db.all(`
    SELECT 
      a.id, a.action, a.table_name, a.record_id, a.old_data, a.new_data, a.created_at,
      u.display_name as user_name,
      s.store_name
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    LEFT JOIN stores s ON a.store_id = s.id
    ORDER BY a.id DESC
    LIMIT 100
  `);

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-extrabold text-slate-800">監査ログ (Audit Logs)</h2>
        <p className="text-slate-500 mt-2">システムのデータ変更履歴を監視します</p>
      </header>

      <AuditLogsTable logs={logs} />
    </div>
  );
}
