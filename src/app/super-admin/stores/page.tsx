import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import StoresClient from './StoresClient';

export default async function SuperAdminStoresPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('bakery_session');
  if (!sessionCookie) redirect('/login');

  let user: any;
  try {
    user = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
  } catch (e) {
    redirect('/login');
  }
  if (user.role !== 'super_admin') return <div className="text-red-500 p-4">権限がありません</div>;

  const db = await getDb(user);

  // 全店舗（所属テナント名・コード付き）
  const stores = await db.all(`
    SELECT 
      s.id, s.store_code, s.store_name, s.tenant_id, s.created_at,
      t.tenant_name, t.tenant_code
    FROM stores s
    LEFT JOIN tenants t ON s.tenant_id = t.id
    ORDER BY t.tenant_name ASC, s.store_code ASC
  `);

  // 全テナント（プルダウン用）
  const tenants = await db.all(`
    SELECT id, tenant_code, tenant_name 
    FROM tenants 
    ORDER BY tenant_name ASC
  `);

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-extrabold text-slate-800">店舗管理</h2>
        <p className="text-slate-500 mt-2">各テナント（会社）に所属する店舗の発行・設定</p>
      </header>
      <StoresClient initialStores={stores} tenants={tenants} />
    </div>
  );
}
