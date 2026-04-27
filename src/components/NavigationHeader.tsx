'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function NavigationHeader() {
  const [isAdmin, setIsAdmin] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // 初回ロード時にlocalStorageから取得
    const stored = localStorage.getItem('bakeryRole');
    if (stored === 'admin') {
      setIsAdmin(true);
    }
  }, []);

  const toggleRole = () => {
    const newRole = !isAdmin;
    setIsAdmin(newRole);
    localStorage.setItem('bakeryRole', newRole ? 'admin' : 'chef');
    // Window全体がRoleを共有できるようにしておく
    window.dispatchEvent(new Event('roleChange'));
  };

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
          <span className="text-xs font-bold text-slate-400 mb-2">Ver. 2.03</span>
        </Link>
        
        {/* ロール切り替えトグル */}
        <div className="flex items-center gap-3">
          <span className={`text-sm font-bold ${!isAdmin ? 'text-amber-600' : 'text-slate-400'}`}>Chef</span>
          <button 
            onClick={toggleRole}
            className={`w-12 h-6 rounded-full p-1 transition-colors relative ${isAdmin ? 'bg-slate-700' : 'bg-amber-400'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white transition-transform ${isAdmin ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
          <span className={`text-sm font-bold ${isAdmin ? 'text-slate-700' : 'text-slate-400'}`}>Admin</span>
        </div>
      </div>

      {/* 管理者モード時のみ表示される追加ナビゲーションバー（各画面からも直接跳べるように） */}
      {isAdmin && (
        <div className="bg-slate-100 border-t border-slate-200 px-4 py-2 flex items-center gap-4 overflow-x-auto text-sm">
          <span className="font-bold text-slate-500 flex-shrink-0 mr-2">Admin Menu:</span>
          <Link href="/admin/ingredients" className={`font-bold flex-shrink-0 ${pathname === '/admin/ingredients' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}`}>🍳 材料マスタ</Link>
          <Link href="/admin/doughs" className={`font-bold flex-shrink-0 ${pathname === '/admin/doughs' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}`}>🥣 生地マスタ</Link>
          <Link href="/admin/products" className={`font-bold flex-shrink-0 ${pathname === '/admin/products' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}`}>🥖 商品マスタ</Link>
        </div>
      )}
    </header>
  );
}
