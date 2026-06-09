import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import TenantsClient from './TenantsClient';

export default async function TenantsPage() {
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

  const db = await getDb();
  const tenants = await db.all(`
    SELECT t.*, COUNT(s.id) as store_count, COUNT(DISTINCT u.id) as user_count
    FROM tenants t
    LEFT JOIN stores s ON s.tenant_id = t.id
    LEFT JOIN users u ON u.tenant_id = t.id
    GROUP BY t.id
    ORDER BY t.created_at DESC
  `);

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-extrabold text-slate-800">テナント（会社）管理</h2>
        <p className="text-slate-500 mt-2">このシステムを利用している会社（テナント）の一覧と管理</p>
      </header>
      <TenantsClient tenants={tenants} />
    </div>
  );
}
