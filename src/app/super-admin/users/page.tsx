import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import UsersClient from './UsersClient';

export default async function UsersPage() {
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

  // 全ユーザー（所属テナント名・担当店舗名を含む）を取得
  const users = await db.all(`
    SELECT
      u.id, u.username, u.display_name, u.role, u.pin_code, u.tenant_id, u.created_at,
      t.tenant_name,
      STRING_AGG(s.store_name, ', ' ORDER BY s.store_name) AS store_names
    FROM users u
    LEFT JOIN tenants t ON u.tenant_id = t.id
    LEFT JOIN user_stores us ON u.id = us.user_id
    LEFT JOIN stores s ON us.store_id = s.id
    GROUP BY u.id, t.tenant_name
    ORDER BY u.created_at DESC
  `);

  // テナント一覧（プルダウン用）
  const tenants = await db.all(`SELECT id, tenant_code, tenant_name FROM tenants ORDER BY tenant_name`);

  // 店舗一覧（プルダウン用）
  const stores = await db.all(`SELECT id, store_name, tenant_id FROM stores ORDER BY store_name`);

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-extrabold text-slate-800">ユーザー管理</h2>
        <p className="text-slate-500 mt-2">全テナントのユーザー一覧と権限・店舗の設定</p>
      </header>
      <UsersClient users={users} tenants={tenants} stores={stores} />
    </div>
  );
}
