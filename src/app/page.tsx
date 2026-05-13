'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
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

  return (
    <div className="flex flex-col gap-8 items-center justify-center py-10">
      <div className="text-center mb-4">
        <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
          Welcome, {user.displayName}
        </h2>
        <p className="text-slate-500 mt-2">
          Role: <span className="uppercase font-bold">{role}</span>
        </p>
      </div>
      
      <div className="grid grid-cols-1 xl:grid-cols-3 md:grid-cols-2 gap-6 w-full max-w-6xl">
        {/* すべてのユーザー（Chef含む）がアクセス可能な共通画面（フェーズ2以降で店舗絞り込み等が入る） */}
        <Link 
          href="/production" 
          className="flex flex-col items-center justify-center p-10 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 border-transparent hover:border-amber-500 transition-all group"
        >
          <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">🥣</span>
          <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Production Plan</h3>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-center text-lg">本日の仕込み（生地・材料計量）</p>
        </Link>

        {/* Manager, Master, Admin 用のレポート画面 */}
        {(role === 'manager' || role === 'master' || role === 'admin') && (
          <Link 
            href="/reports/ingredients" 
            className="flex flex-col items-center justify-center p-10 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 border-transparent hover:border-amber-500 transition-all group"
          >
            <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">📊</span>
            <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Ingredient Report</h3>
            <p className="text-slate-500 dark:text-slate-400 mt-2 text-center text-lg">月間原材料の使用量実績と出力</p>
          </Link>
        )}

        {/* Admin 向けのインポート機能・設定機能 */}
        {role === 'admin' && (
          <>
            <Link 
              href="/orders/import" 
              className="flex flex-col items-center justify-center p-10 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 border-transparent hover:border-amber-500 transition-all group"
            >
              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">📥</span>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Import Orders</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-center text-lg">Excelからの注文取り込み</p>
            </Link>

            <Link 
              href="/settings/mixers" 
              className="flex flex-col items-center justify-center p-10 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 border-transparent hover:border-amber-500 transition-all group"
            >
              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">⚙️</span>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Mixer Settings</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-center text-lg">ミキサー容量上限の設定</p>
            </Link>
          </>
        )}
      </div>

      {/* Master, Admin 向けのマスタ管理 */}
      {(role === 'master' || role === 'admin') && (
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

