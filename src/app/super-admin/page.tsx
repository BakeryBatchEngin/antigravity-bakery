import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function SuperAdminDashboard() {
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
    return (
      <div className="bg-red-50 text-red-600 p-6 rounded-xl border border-red-200">
        <h2 className="text-xl font-bold mb-2">アクセス権限がありません</h2>
        <p>このページはスーパー管理者専用です。</p>
      </div>
    );
  }

  let storeCount  = 0;
  let tenantCount = 0;
  let userCount   = 0;
  let orderCount  = 0;
  let logCount    = 0;
  let tenantList: any[] = [];
  let errorMessage = null;

  try {
    const db = await getDb();
    const s  = await db.get('SELECT COUNT(*) as count FROM stores');
    const tc = await db.get('SELECT COUNT(*) as count FROM tenants');
    const u  = await db.get('SELECT COUNT(*) as count FROM users WHERE role != \'super_admin\'');
    const o  = await db.get('SELECT COUNT(*) as count FROM orders');
    const l  = await db.get('SELECT COUNT(*) as count FROM audit_logs');

    storeCount  = s?.count  ?? 0;
    tenantCount = tc?.count ?? 0;
    userCount   = u?.count  ?? 0;
    orderCount  = o?.count  ?? 0;
    logCount    = l?.count  ?? 0;

    // 会社ごとの店舗数・ユーザー数を集計
    tenantList = await db.all(`
      SELECT
        t.id, t.tenant_code, t.tenant_name, t.plan, t.status,
        COUNT(DISTINCT s.id) AS store_count,
        COUNT(DISTINCT u.id) AS user_count
      FROM tenants t
      LEFT JOIN stores s ON s.tenant_id = t.id
      LEFT JOIN users  u ON u.tenant_id = t.id
      GROUP BY t.id
      ORDER BY t.tenant_name
    `);
  } catch (error: any) {
    errorMessage = error.message || 'Unknown database error';
    console.error('SuperAdmin Dashboard Error:', error);
  }

  const PLAN_LABEL: Record<string, string> = {
    basic: 'ベーシック', standard: 'スタンダード', premium: 'プレミアム',
  };
  const STATUS_COLOR: Record<string, string> = {
    active:    'bg-emerald-100 text-emerald-700',
    trial:     'bg-amber-100 text-amber-700',
    suspended: 'bg-red-100 text-red-700',
  };
  const STATUS_LABEL: Record<string, string> = {
    active: '契約中', trial: 'トライアル', suspended: '停止中',
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-extrabold text-slate-800">SaaS ダッシュボード</h2>
        <p className="text-slate-500 mt-2">システム全体の稼働状況サマリー</p>
      </header>

      {errorMessage && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200">
          <strong>エラーが発生しました:</strong> {errorMessage}
        </div>
      )}

      {/* サマリーカード */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-slate-500 text-sm font-medium">契約会社数</h3>
          <p className="text-4xl font-black text-indigo-600 mt-2">{tenantCount}</p>
          <p className="text-xs text-slate-400 mt-1">テナント数</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-slate-500 text-sm font-medium">登録店舗数</h3>
          <p className="text-4xl font-black text-indigo-600 mt-2">{storeCount}</p>
          <p className="text-xs text-slate-400 mt-1">全テナント合計</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-slate-500 text-sm font-medium">登録ユーザー数</h3>
          <p className="text-4xl font-black text-indigo-600 mt-2">{userCount}</p>
          <p className="text-xs text-slate-400 mt-1">super_admin除く</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-slate-500 text-sm font-medium">蓄積監査ログ数</h3>
          <p className="text-4xl font-black text-amber-500 mt-2">{logCount}</p>
          <p className="text-xs text-slate-400 mt-1">総オペレーション数</p>
        </div>
      </div>

      {/* 契約会社一覧 */}
      <section>
        <h3 className="text-lg font-bold text-slate-700 mb-3">契約会社一覧</h3>
        {tenantList.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400">
            まだ会社が登録されていません
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {tenantList.map((t: any) => (
              <div key={t.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs text-slate-400">{t.tenant_code}</p>
                    <h4 className="font-bold text-slate-800 text-lg leading-snug">{t.tenant_name}</h4>
                  </div>
                  <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-bold ${STATUS_COLOR[t.status] || 'bg-slate-100 text-slate-500'}`}>
                    {STATUS_LABEL[t.status] || t.status}
                  </span>
                </div>
                <div className="flex gap-4 text-sm text-slate-600">
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400">🏪</span>
                    <span><strong className="text-slate-800">{t.store_count}</strong> 店舗</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400">👤</span>
                    <span><strong className="text-slate-800">{t.user_count}</strong> ユーザー</span>
                  </div>
                  <div className="flex items-center gap-1 ml-auto">
                    <span className="text-xs text-slate-400">{PLAN_LABEL[t.plan] || t.plan}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
