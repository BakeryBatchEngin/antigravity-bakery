'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export default function NavigationHeader() {
  const [user, setUser] = useState<any>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        setUser(data.user);
      } catch (err) {
        setUser(null);
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
      window.dispatchEvent(new Event('roleChange'));
      router.push('/login');
    } catch (e) {
      console.error(e);
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
          <span className="text-xs font-bold text-slate-400 mb-2">Ver. 2.04</span>
        </Link>
        
        {/* ユーザー情報＆ログアウト */}
        {user && (
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-bold text-slate-700">{user.displayName}</div>
              <div className="text-xs text-slate-400 uppercase tracking-wider">{user.role} Mode</div>
            </div>
            <button 
              onClick={handleLogout}
              className="text-sm px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-lg transition-colors"
            >
              Logout
            </button>
          </div>
        )}
      </div>

      {/* 管理者モード時のみ表示される追加ナビゲーションバー（各画面からも直接跳べるように） */}
      {isMasterOrAdmin && (
        <div className="bg-slate-100 border-t border-slate-200 px-4 py-2 flex items-center gap-4 overflow-x-auto text-sm">
          <span className="font-bold text-slate-500 flex-shrink-0 mr-2">Master Menu:</span>
          <Link href="/admin/ingredients" className={`font-bold flex-shrink-0 ${pathname === '/admin/ingredients' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}`}>🍳 材料マスタ</Link>
          <Link href="/admin/doughs" className={`font-bold flex-shrink-0 ${pathname === '/admin/doughs' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}`}>🥣 生地マスタ</Link>
          <Link href="/admin/products" className={`font-bold flex-shrink-0 ${pathname === '/admin/products' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}`}>🥖 商品マスタ</Link>
        </div>
      )}
    </header>
  );
}
