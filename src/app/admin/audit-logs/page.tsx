import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import ActivityLogsClient from './ActivityLogsClient';

export default async function AdminAuditLogsPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('bakery_session');

  if (!sessionCookie) redirect('/login');

  let user: any;
  try {
    user = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
  } catch (e) {
    redirect('/login');
  }

  // admin または super_admin のみアクセス可能
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center">
        <div className="bg-red-50 text-red-700 p-6 rounded-2xl border border-red-200 font-bold">
          このページは企業管理者（admin）またはスーパー管理者のみアクセスできます。
        </div>
      </div>
    );
  }

  const db = await getDb();
  const tenantId = user.tenant_id;

  // ログ取得（自テナント優先、直近300件）
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

  if (user.role !== 'super_admin' && tenantId) {
    params.push(tenantId);
    query += ` AND a.tenant_id = $${params.length}`;
  }

  query += ` ORDER BY a.id DESC LIMIT 300`;

  const logs = await db.all(query, params);

  // 店舗一覧
  let storesQuery = `SELECT id, store_code, store_name FROM stores WHERE 1=1`;
  const storeParams: any[] = [];
  if (user.role !== 'super_admin' && tenantId) {
    storeParams.push(tenantId);
    storesQuery += ` AND tenant_id = $1`;
  }
  storesQuery += ` ORDER BY store_code ASC`;
  const stores = await db.all(storesQuery, storeParams);

  // テナント名
  let tenantName = '';
  if (tenantId) {
    const t = await db.get('SELECT tenant_name FROM tenants WHERE id = $1', [tenantId]);
    tenantName = t?.tenant_name || '';
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <ActivityLogsClient
        initialLogs={logs || []}
        stores={stores || []}
        tenantName={tenantName}
      />
    </div>
  );
}
