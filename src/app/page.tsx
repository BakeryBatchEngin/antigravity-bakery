'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ManagerDashboardPage from "./manager/dashboard/page";

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [activeStoreId, setActiveStoreId] = useState<number | 'manager' | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          if (data.activeStoreId !== undefined) setActiveStoreId(data.activeStoreId);
        } else {
          router.push('/login');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
    
    // 他のタブやヘッダーからのログアウト等に対応するため、イベントリッスン
    window.addEventListener('roleChange', fetchUser);
    return () => window.removeEventListener('roleChange', fetchUser);
  }, [router]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading...</div>;
  }

  if (!user) return null;

  const role = user.role;

  // マネージャーかつ「マネージャーモード」が選択されている場合はダッシュボードを表示
  const isManagerMode = role === 'manager' && activeStoreId === 'manager';
  // マネージャーが店舗を選択している場合はシェフと同じUIを表示
  const isManagerInStoreMode = role === 'manager' && activeStoreId !== 'manager' && activeStoreId !== null;
  // シェフとして操作できるか（シェフロール、またはマネージャーが店舗選択中）
  const showChefUI = (role === 'chef') || isManagerInStoreMode;

  return (
    <div className="flex flex-col gap-8 items-center justify-center py-10">

      {/* ===== マネージャーダッシュボード ===== */}
      {isManagerMode && (
        <div className="w-full max-w-7xl px-2">
          <ManagerDashboardPage />
        </div>
      )}

      {/* ===== シェフ向け操作メニュー（シェフ本人、またはマネージャーが店舗選択中） ===== */}
      {showChefUI && (
        <>
          <div className="text-center mb-4">
            <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
              Welcome, {user.displayName}
            </h2>
            <p className="text-slate-500 mt-2">
              Role: <span className="uppercase font-bold">{role}</span>
              {isManagerInStoreMode && (
                <span className="ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                  店舗操作モード
                </span>
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 md:grid-cols-2 gap-6 w-full max-w-6xl">
            {/* 受注データインポート */}
            <Link 
              href="/orders/import" 
              className="flex flex-col items-center justify-center p-10 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 border-transparent hover:border-amber-500 transition-all group"
            >
              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">📥</span>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Import Orders</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-center text-lg">Excelからの注文取り込み</p>
            </Link>

            {/* 仕込み計画 */}
            <Link 
              href="/production" 
              className="flex flex-col items-center justify-center p-10 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 border-transparent hover:border-amber-500 transition-all group"
            >
              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">🥣</span>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Production Plan</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-center text-lg">本日の仕込み（生地・材料計量）</p>
            </Link>
          
            {/* 月間原材料レポート */}
            <Link 
              href="/reports/ingredients" 
              className="flex flex-col items-center justify-center p-10 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 border-transparent hover:border-amber-500 transition-all group"
            >
              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">📊</span>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Ingredient Report</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-center text-lg">月間原材料の使用量実績と出力</p>
            </Link>

            {/* ミキサー設定 */}
            <Link 
              href="/settings/mixers" 
              className="flex flex-col items-center justify-center p-10 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 border-transparent hover:border-amber-500 transition-all group"
            >
              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">⚙️</span>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Mixer Settings</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-center text-lg">自店のミキサー容量上限の設定</p>
            </Link>
          </div>
        </>
      )}

      {/* ===== マネージャーがマネージャーモード（ウェルカムメッセージのみ、ダッシュボードが上に表示されている） ===== */}
      {isManagerMode && (
        <div className="text-center mt-2">
          <p className="text-slate-400 dark:text-slate-500 text-sm">
            ヘッダーの「表示:」から店舗を選ぶと、その店舗の仕込み操作ができます
          </p>
        </div>
      )}

      {/* ===== Admin 向けのシステム管理メニュー ===== */}
      {role === 'admin' && (
        <>
          <h2 className="text-3xl font-bold text-center text-purple-700 dark:text-purple-400 mt-4 border-b-2 border-slate-200 dark:border-slate-700 pb-4 w-full max-w-4xl">
            System Administration
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
            <Link 
              href="/admin/users" 
              className="flex flex-col items-center justify-center p-12 bg-slate-800 rounded-3xl shadow-xl border border-slate-700 hover:border-purple-500 hover:shadow-purple-500/20 transition-all group"
            >
              <span className="text-6xl mb-6 group-hover:scale-110 transition-transform drop-shadow-md">👥</span>
              <h3 className="text-2xl font-bold text-white">ユーザー管理</h3>
              <p className="text-slate-400 mt-3 text-center text-lg">アカウント発行と権限設定</p>
            </Link>

            <Link 
              href="/admin/stores" 
              className="flex flex-col items-center justify-center p-12 bg-slate-800 rounded-3xl shadow-xl border border-slate-700 hover:border-purple-500 hover:shadow-purple-500/20 transition-all group"
            >
              <span className="text-6xl mb-6 group-hover:scale-110 transition-transform drop-shadow-md">🏢</span>
              <h3 className="text-2xl font-bold text-white">店舗・設備管理</h3>
              <p className="text-slate-400 mt-3 text-center text-lg">店舗マスタとミキサー設定</p>
            </Link>
          </div>
        </>
      )}

      {/* ===== Master 向けのマスタ管理 ===== */}
      {role === 'master' && (
        <>
          <h2 className="text-3xl font-bold text-center text-amber-700 dark:text-amber-500 mt-8 pt-8 border-t-2 border-slate-200 dark:border-slate-700 w-full max-w-6xl">
            Master Data Management
          </h2>
          <div className="grid grid-cols-1 xl:grid-cols-3 md:grid-cols-2 gap-6 w-full max-w-6xl">
            <Link 
              href="/admin/ingredients" 
              className="flex flex-col items-center justify-center p-10 bg-amber-50 dark:bg-amber-900/20 rounded-2xl shadow-lg border-2 border-amber-200 dark:border-amber-800 hover:border-amber-500 transition-all group"
            >
              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">🍳</span>
              <h3 className="text-2xl font-bold text-amber-900 dark:text-amber-100">Ingredient Master</h3>
              <p className="text-amber-700 dark:text-amber-300 mt-2 text-center text-lg">原材料マスタ管理</p>
            </Link>

            <Link 
              href="/admin/doughs" 
              className="flex flex-col items-center justify-center p-10 bg-amber-50 dark:bg-amber-900/20 rounded-2xl shadow-lg border-2 border-amber-200 dark:border-amber-800 hover:border-amber-500 transition-all group"
            >
              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">🥣</span>
              <h3 className="text-2xl font-bold text-amber-900 dark:text-amber-100">Dough Master</h3>
              <p className="text-amber-700 dark:text-amber-300 mt-2 text-center text-lg">生地レシピ管理</p>
            </Link>

            <Link 
              href="/admin/products" 
              className="flex flex-col items-center justify-center p-10 bg-amber-50 dark:bg-amber-900/20 rounded-2xl shadow-lg border-2 border-amber-200 dark:border-amber-800 hover:border-amber-500 transition-all group"
            >
              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">🥖</span>
              <h3 className="text-2xl font-bold text-amber-900 dark:text-amber-100">Product Master</h3>
              <p className="text-amber-700 dark:text-amber-300 mt-2 text-center text-lg">商品構成マスタ管理</p>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
