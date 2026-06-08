import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function SuperAdminDashboard() {
  // セッションチェック（簡易版）
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('bakery_session');
  
  if (!sessionCookie) {
    redirect('/login');
  }

  let user: any;
  try {
    user = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
  } catch (e) {
    redirect('/login');
  }

  if (user.role !== 'super_admin') {
    return (
      <div className="bg-red-50 text-red-600 p-6 rounded-xl border border-red-200">
        <h2 className="text-xl font-bold mb-2">アクセス権限がありません</h2>
        <p>このページはスーパー管理者専用です。</p>
      </div>
    );
  }

  let tenantCount = 0;
  let userCount = 0;
  let orderCount = 0;
  let logCount = 0;
  let errorMessage = null;

  try {
    const db = await getDb();
    const t = await db.get('SELECT COUNT(*) as count FROM stores');
    const u = await db.get('SELECT COUNT(*) as count FROM users');
    const o = await db.get('SELECT COUNT(*) as count FROM orders');
    const l = await db.get('SELECT COUNT(*) as count FROM audit_logs');
    
    tenantCount = t ? t.count : 0;
    userCount = u ? u.count : 0;
    orderCount = o ? o.count : 0;
    logCount = l ? l.count : 0;
  } catch (error: any) {
    errorMessage = error.message || 'Unknown database error';
    console.error('SuperAdmin Dashboard Error:', error);
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-extrabold text-slate-800">SaaS ダッシュボード</h2>
        <p className="text-slate-500 mt-2">システム全体の稼働状況サマリー</p>
      </header>

      {errorMessage && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200">
          <strong>エラーが発生しました:</strong> {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-slate-500 text-sm font-medium">登録テナント(店舗)数</h3>
          <p className="text-4xl font-black text-indigo-600 mt-2">{tenantCount}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-slate-500 text-sm font-medium">登録ユーザー数</h3>
          <p className="text-4xl font-black text-indigo-600 mt-2">{userCount}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-slate-500 text-sm font-medium">総注文データ数</h3>
          <p className="text-4xl font-black text-indigo-600 mt-2">{orderCount}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-slate-500 text-sm font-medium">蓄積監査ログ数</h3>
          <p className="text-4xl font-black text-amber-500 mt-2">{logCount}</p>
        </div>
      </div>
    </div>
  );
}
