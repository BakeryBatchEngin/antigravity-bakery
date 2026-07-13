'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export default function NavigationHeader() {
  const [user, setUser] = useState<any>(null);
  const [stores, setStores] = useState<any[]>([]);
  // activeStoreId は 数値（店舗ID）または "manager"（マネージャーモード）または null
  const [activeStoreId, setActiveStoreId] = useState<number | 'manager' | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        setUser(data.user);
        if (data.stores) setStores(data.stores);
        if (data.activeStoreId !== undefined) setActiveStoreId(data.activeStoreId);
      } catch (err) {
        setUser(null);
        setStores([]);
      }
    };
    fetchUser();

    window.addEventListener('roleChange', fetchUser);
    return () => window.removeEventListener('roleChange', fetchUser);
  }, []);

  const handleLogout = async () => {
    if (!confirm('ログアウトしますか？')) return;
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setStores([]);
      setActiveStoreId(null);
      window.dispatchEvent(new Event('roleChange'));
      router.push('/login');
    } catch (e) {
      console.error(e);
    }
  };

  // セレクトボックスの値が変わったとき（"manager" または 店舗IDの数値文字列）
  const handleStoreChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    try {
      const res = await fetch('/api/auth/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // "manager" はそのまま、数値文字列は数値に変換して送る
        body: JSON.stringify({ store_id: val === 'manager' ? 'manager' : Number(val) })
      });
      
      if (res.ok) {
        setActiveStoreId(val === 'manager' ? 'manager' : Number(val));
        // Next.jsのキャッシュをクリアして状態を更新
        router.refresh();
        setTimeout(() => {
          window.location.reload();
        }, 200);
      }
    } catch (error) {
      console.error('Failed to switch store', error);
    }
  };

  // ログイン画面ではヘッダーのツールバーをシンプルに
  if (pathname === '/login') {
    return (
      <header className="bg-white text-slate-800 shadow-sm border-b border-slate-200 relative overflow-hidden">
        <div className="container mx-auto px-4 py-3 flex items-center justify-center relative z-10">
          <img src="/Bakery-Batch-Engine-Logo-New.png" alt="Bakery Batch Engine" className="h-14 sm:h-20 w-auto object-contain drop-shadow-sm rounded-lg" />
        </div>
      </header>
    );
  }

  const role = user?.role;
  const isMasterOrAdmin = role === 'admin' || role === 'master';
  const isManager = role === 'manager';

  // マネージャーが担当できる店舗リスト（自分のstoreIds に含まれるもの）
  const managerStores = isManager
    ? stores.filter(s => user?.storeIds?.includes(s.id))
    : [];

  return (
    <header className="bg-white text-slate-800 shadow-sm border-b border-slate-200 relative overflow-hidden">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between relative z-10">
        <Link href="/" className="hover:opacity-80 transition-opacity flex items-end gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
            src="/Bakery-Batch-Engine-Logo-New.png" 
            alt="Bakery Batch Engine" 
            className="h-14 sm:h-20 w-auto object-contain drop-shadow-sm rounded-lg"
          />
          <span className="text-xs font-bold text-slate-400 mb-2">Ver. 2.31</span>
        </Link>
        
        {/* ユーザー情報＆ログアウト */}
        {user && (
          <div className="flex items-center gap-4">
            
            {/* ===== マネージャー専用：モード切り替えセレクト ===== */}
            {isManager && managerStores.length > 0 && (
              <div className="hidden sm:flex items-center bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                <span className="text-xs font-bold text-emerald-700 mr-2">🏢 表示:</span>
                <select
                  value={String(activeStoreId ?? 'manager')}
                  onChange={handleStoreChange}
                  className="bg-transparent text-sm font-bold text-emerald-900 outline-none cursor-pointer"
                >
                  {/* マネージャーモード（デフォルト）を先頭に配置 */}
                  <option value="manager">📊 マネージャーモード</option>
                  {/* 担当店舗の一覧 */}
                  {managerStores.map(store => (
                    <option key={store.id} value={store.id}>
                      🏪 {store.store_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* ===== シェフ向け：店舗表示UI（master/admin/manager/super_admin は別の場所で管理）===== */}
            {stores.length > 0 && activeStoreId && !isManager && !isMasterOrAdmin && role !== 'super_admin' && (
              <div className="hidden sm:flex items-center bg-slate-100 rounded-lg px-3 py-1.5 border border-slate-200">
                <span className="text-xs font-bold text-slate-500 mr-2">📍 店舗:</span>
                {(user.storeIds && user.storeIds.length > 1) ? (
                  <select 
                    value={String(activeStoreId)} 
                    onChange={handleStoreChange}
                    className="bg-transparent text-sm font-bold text-slate-800 outline-none cursor-pointer"
                  >
                    {stores.filter(s => user.storeIds?.includes(s.id)).map(store => (
                      <option key={store.id} value={store.id}>{store.store_name}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm font-bold text-slate-800">
                    {stores.find(s => s.id === activeStoreId)?.store_name || '未設定'}
                  </span>
                )}
              </div>
            )}

            {/* Super Admin 用バッジ */}
            {role === 'super_admin' && (
              <div className="hidden sm:flex items-center bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5">
                <span className="text-xs font-bold text-indigo-700">👑 システム全体管理</span>
              </div>
            )}

            <div className="text-right hidden sm:block border-l border-slate-200 pl-4">
              <div className="text-sm font-bold text-slate-700">{user.displayName}</div>
              <div className="text-xs text-slate-400 uppercase tracking-wider">{user.role} Mode</div>
            </div>
            <button 
              onClick={handleLogout}
              className="text-sm px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-lg transition-colors ml-2"
            >
              Logout
            </button>
          </div>
        )}
      </div>

      {/* 管理者・マスタモード・Super Admin時のみ表示される追加ナビゲーションバー */}
      {(role === 'master' || role === 'admin' || role === 'super_admin') && (
        <div className="bg-slate-100 border-t border-slate-200 px-4 py-2 flex items-center gap-4 overflow-x-auto text-sm">
          {role === 'super_admin' && (
            <>
              <span className="font-bold text-indigo-500 flex-shrink-0 mr-2">SaaS Management:</span>
              <Link href="/super-admin" className="font-bold flex-shrink-0 text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1 rounded-md border border-indigo-100">
                🚀 スーパー管理者ダッシュボードへ
              </Link>
            </>
          )}

          {role === 'master' && (
            <>
              <span className="font-bold text-slate-500 flex-shrink-0 mr-2">Master Menu:</span>
              <Link href="/admin/ingredients" className={`font-bold flex-shrink-0 ${pathname === '/admin/ingredients' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}`}>🍳 材料マスタ</Link>
              <Link href="/admin/doughs" className={`font-bold flex-shrink-0 ${pathname === '/admin/doughs' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}`}>🥣 生地マスタ</Link>
              <Link href="/admin/products" className={`font-bold flex-shrink-0 ${pathname === '/admin/products' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}`}>🥖 商品マスタ</Link>
            </>
          )}
          
          {role === 'admin' && (
            <>
              <span className="font-bold text-slate-500 flex-shrink-0 mr-2">Admin Menu:</span>
              <Link href="/admin/users" className={`font-bold flex-shrink-0 ${pathname === '/admin/users' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}`}>👥 ユーザー管理</Link>
              <Link href="/admin/stores" className={`font-bold flex-shrink-0 ${pathname === '/admin/stores' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}`}>🏢 店舗・設備管理</Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}
