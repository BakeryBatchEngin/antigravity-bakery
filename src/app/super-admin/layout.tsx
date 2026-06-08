import { ReactNode } from 'react';
import Link from 'next/link';

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* サイドバー */}
      <aside className="w-full md:w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-4 border-b border-slate-700">
          <h1 className="text-xl font-bold tracking-wider">SUPER ADMIN</h1>
          <p className="text-xs text-slate-400 mt-1">SaaS Management Console</p>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <Link href="/super-admin" className="block px-4 py-2 rounded hover:bg-slate-800 transition">
            ダッシュボード
          </Link>
          <Link href="/super-admin/tenants" className="block px-4 py-2 rounded hover:bg-slate-800 transition">
            テナント(店舗)管理
          </Link>
          <Link href="/super-admin/users" className="block px-4 py-2 rounded hover:bg-slate-800 transition">
            ユーザー管理
          </Link>
          <Link href="/super-admin/audit-logs" className="block px-4 py-2 rounded hover:bg-slate-800 transition text-amber-400">
            監査ログ
          </Link>
        </nav>
        <div className="p-4 border-t border-slate-700">
          <Link href="/" className="block px-4 py-2 text-center bg-slate-700 rounded hover:bg-slate-600 transition">
            アプリへ戻る
          </Link>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
