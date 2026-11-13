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
  // 通常テーブル・店舗・ユーザーに加え、クリスマスアカウント(xmas_accounts)も安全に結合して解決
  const logs = await db.all(`
    SELECT 
      a.id, a.action, a.category, a.table_name, a.record_id, a.description,
      a.old_data, a.new_data, a.created_at,
      a.store_id,
      COALESCE(u.display_name, u.username, xa.username, xa.display_name, '不明') as user_name,
      COALESCE(
        s.store_name, 
        CASE WHEN a.category = 'xmas' OR a.table_name LIKE 'xmas%' THEN xa.display_name ELSE NULL END,
        '-'
      ) as store_name,
      t.id as tenant_id,
      t.tenant_name,
      t.tenant_code
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    LEFT JOIN stores s ON a.store_id = s.id
    LEFT JOIN xmas_accounts xa ON (
      (a.table_name = 'xmas_accounts' AND a.record_id = xa.id::TEXT)
      OR (a.table_name = 'xmas_orders' AND (a.new_data->>'account_id' = xa.id::TEXT OR a.old_data->>'account_id' = xa.id::TEXT))
      OR (a.user_id IS NULL AND a.category = 'xmas' AND a.record_id = xa.id::TEXT)
    )
    LEFT JOIN tenants t ON COALESCE(a.tenant_id, s.tenant_id, u.tenant_id, xa.tenant_id) = t.id
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
