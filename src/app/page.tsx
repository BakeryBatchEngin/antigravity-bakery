'use client';

import { useState, useEffect } from "react";
import Link from "next/link";

export default function Home() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkRole = () => {
      setIsAdmin(localStorage.getItem('bakeryRole') === 'admin');
    };
    checkRole();
    window.addEventListener('roleChange', checkRole);
    return () => window.removeEventListener('roleChange', checkRole);
  }, []);

  return (
    <div className="flex flex-col gap-8 items-center justify-center py-10">
      <h2 className="text-3xl font-bold text-center text-slate-800 dark:text-slate-100">
        Dashboard
      </h2>
      
      {/* 厨房のタブレット等で押しやすいように、ボタンを大きく配置しています */}
      <div className="grid grid-cols-1 xl:grid-cols-3 md:grid-cols-2 gap-6 w-full max-w-6xl">
        <Link 
          href="/orders/import" 
          className="flex flex-col items-center justify-center p-10 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 border-transparent hover:border-amber-500 transition-all group"
        >
          <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">📥</span>
          <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Import Orders</h3>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-center text-lg">Excelファイルから本日の注文を取り込みます</p>
        </Link>

        <Link 
          href="/production" 
          className="flex flex-col items-center justify-center p-10 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 border-transparent hover:border-amber-500 transition-all group"
        >
          <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">🥣</span>
          <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Production Plan</h3>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-center text-lg">生地や材料の必要量を自動計算して表示します</p>
        </Link>
        
        <Link 
          href="/settings/mixers" 
          className="flex flex-col items-center justify-center p-10 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 border-transparent hover:border-amber-500 transition-all group"
        >
          <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">⚙️</span>
          <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Mixer Settings</h3>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-center text-lg">店舗ごとのミキサー容量上限を登録します</p>
        </Link>
        
        <Link 
          href="/reports/ingredients" 
          className="flex flex-col items-center justify-center p-10 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 border-transparent hover:border-amber-500 transition-all group xl:col-span-3"
        >
          <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">📊</span>
          <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Ingredient Report</h3>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-center text-lg">月間原材料の使用量実績とExcel出力</p>
        </Link>
      </div>

      {isAdmin && (
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
              <p className="text-amber-700 dark:text-amber-300 mt-2 text-center text-lg">粉やバターなどの原材料マスタを管理します</p>
            </Link>

            <Link 
              href="/admin/doughs" 
              className="flex flex-col items-center justify-center p-10 bg-amber-50 dark:bg-amber-900/20 rounded-2xl shadow-lg border-2 border-amber-200 dark:border-amber-800 hover:border-amber-500 transition-all group"
            >
              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">🥣</span>
              <h3 className="text-2xl font-bold text-amber-900 dark:text-amber-100">Dough Master</h3>
              <p className="text-amber-700 dark:text-amber-300 mt-2 text-center text-lg">生地のレシピ（Bakers%）を管理します</p>
            </Link>

            <Link 
              href="/admin/products" 
              className="flex flex-col items-center justify-center p-10 bg-amber-50 dark:bg-amber-900/20 rounded-2xl shadow-lg border-2 border-amber-200 dark:border-amber-800 hover:border-amber-500 transition-all group"
            >
              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">🥖</span>
              <h3 className="text-2xl font-bold text-amber-900 dark:text-amber-100">Product Master</h3>
              <p className="text-amber-700 dark:text-amber-300 mt-2 text-center text-lg">商品の構成（使用生地・副材料）を管理します</p>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
