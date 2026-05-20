'use client';

import React, { useState, useEffect, useCallback } from 'react';

// ===== 型定義 =====
interface MonthData {
  retail_sales: number;
  wholesale_sales: number;
  material_cost: number;
  cost_rate: number | null;
}

interface StoreRow {
  store_id: number;
  store_code: string;
  store_name: string;
  months: Record<string, MonthData>;
}

interface DashboardData {
  months: string[];
  stores: StoreRow[];
}

// ソート可能なカラムの種類
type SortKey = 'retail_sales' | 'wholesale_sales' | 'material_cost' | 'cost_rate';

// 直近N ヶ月のリストを生成
function getRecentMonths(n: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

export default function ManagerDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 選択中の月数（3ヶ月 or 6ヶ月）
  const [monthCount, setMonthCount] = useState(3);
  // ソート設定：{ month: '2026-05', key: 'retail_sales', order: 'desc' }
  const [sortConfig, setSortConfig] = useState<{ month: string; key: SortKey; order: 'asc' | 'desc' } | null>(null);

  const fetchData = useCallback(async (count: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const months = getRecentMonths(count);
      const res = await fetch(`/api/reports/manager?months=${months.join(',')}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'エラーが発生しました');
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(monthCount);
  }, [fetchData, monthCount]);

  // ヘッダーをクリックしてソート
  const handleSort = (month: string, key: SortKey) => {
    setSortConfig(prev => {
      if (prev?.month === month && prev?.key === key) {
        // 同じカラムを再クリック → 昇降順を切り替え
        return { month, key, order: prev.order === 'asc' ? 'desc' : 'asc' };
      }
      // 新しいカラムをクリック → 降順から開始
      return { month, key, order: 'desc' };
    });
  };

  // ソートアイコン表示
  const getSortIcon = (month: string, key: SortKey) => {
    if (sortConfig?.month !== month || sortConfig?.key !== key) return '⇅';
    return sortConfig.order === 'asc' ? '↑' : '↓';
  };

  // 表示するストアリストをソート
  const getSortedStores = (): StoreRow[] => {
    if (!data?.stores) return [];
    if (!sortConfig) {
      // デフォルト：店舗コード昇順
      return [...data.stores].sort((a, b) => a.store_code.localeCompare(b.store_code));
    }
    return [...data.stores].sort((a, b) => {
      const aVal = a.months[sortConfig.month]?.[sortConfig.key] ?? -1;
      const bVal = b.months[sortConfig.month]?.[sortConfig.key] ?? -1;
      const aNum = aVal === null ? -1 : Number(aVal);
      const bNum = bVal === null ? -1 : Number(bVal);
      return sortConfig.order === 'asc' ? aNum - bNum : bNum - aNum;
    });
  };

  const sortedStores = getSortedStores();
  const months = data?.months || [];

  // 金額フォーマット
  const fmtYen = (v: number) => v > 0 ? `¥${v.toLocaleString()}` : '—';
  const fmtRate = (v: number | null) => v !== null ? `${v}%` : '—';

  return (
    <div className="p-4 sm:p-6 max-w-full">
      {/* タイトルと操作バー */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span>📊</span> Manager Dashboard
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            全担当店舗の月次KPI一覧
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-slate-500">表示期間:</span>
          {[3, 6].map(n => (
            <button
              key={n}
              onClick={() => setMonthCount(n)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                monthCount === n
                  ? 'bg-amber-500 text-white shadow-md'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              直近{n}ヶ月
            </button>
          ))}
          <button
            onClick={() => fetchData(monthCount)}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl text-sm font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
          >
            🔄 更新
          </button>
        </div>
      </div>

      {/* エラー */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl p-4 mb-6 text-red-700 dark:text-red-300 font-bold">
          ⚠️ {error}
        </div>
      )}

      {/* ロード中 */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 text-4xl animate-spin">
          🔄
        </div>
      )}

      {/* KPIテーブル */}
      {!isLoading && data && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-max">
              <thead>
                {/* 1行目：月ヘッダー（月名を月数分スパン） */}
                <tr className="bg-slate-800 dark:bg-slate-900 text-white">
                  <th className="p-4 text-left font-black text-base border-r border-slate-600 min-w-[160px] sticky left-0 bg-slate-800 dark:bg-slate-900 z-10">
                    店舗
                  </th>
                  {months.map(month => (
                    <th
                      key={month}
                      colSpan={4}
                      className="p-3 text-center font-black text-base border-r border-slate-600 last:border-r-0"
                    >
                      📅 {month}
                    </th>
                  ))}
                </tr>
                {/* 2行目：各月のKPI項目名（クリックでソート） */}
                <tr className="bg-slate-700 dark:bg-slate-800 text-slate-200">
                  <th className="p-3 text-left border-r border-slate-600 sticky left-0 bg-slate-700 dark:bg-slate-800 z-10">
                    店舗コード
                  </th>
                  {months.map(month => (
                    <React.Fragment key={month}>
                      {/* 予想売上（小売） */}
                      <th
                        onClick={() => handleSort(month, 'retail_sales')}
                        className="p-3 text-right cursor-pointer hover:bg-amber-600/30 transition-colors whitespace-nowrap select-none border-l border-slate-600 group"
                        title="クリックでソート"
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-amber-300">💰 予想売上</span>
                          <span className="text-xs opacity-60 group-hover:opacity-100 transition-opacity">
                            {getSortIcon(month, 'retail_sales')}
                          </span>
                        </div>
                      </th>
                      {/* 社内取引売上 */}
                      <th
                        onClick={() => handleSort(month, 'wholesale_sales')}
                        className="p-3 text-right cursor-pointer hover:bg-blue-600/30 transition-colors whitespace-nowrap select-none border-l border-slate-600 group"
                        title="クリックでソート"
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-blue-300">🏢 社内取引</span>
                          <span className="text-xs opacity-60 group-hover:opacity-100 transition-opacity">
                            {getSortIcon(month, 'wholesale_sales')}
                          </span>
                        </div>
                      </th>
                      {/* 原材料費合計 */}
                      <th
                        onClick={() => handleSort(month, 'material_cost')}
                        className="p-3 text-right cursor-pointer hover:bg-red-600/30 transition-colors whitespace-nowrap select-none border-l border-slate-600 group"
                        title="クリックでソート"
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-red-300">🛒 原材料費</span>
                          <span className="text-xs opacity-60 group-hover:opacity-100 transition-opacity">
                            {getSortIcon(month, 'material_cost')}
                          </span>
                        </div>
                      </th>
                      {/* 原価率 */}
                      <th
                        onClick={() => handleSort(month, 'cost_rate')}
                        className="p-3 text-right cursor-pointer hover:bg-purple-600/30 transition-colors whitespace-nowrap select-none border-l border-slate-600 border-r border-slate-500 last:border-r-0 group"
                        title="クリックでソート"
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-purple-300">📈 原価率</span>
                          <span className="text-xs opacity-60 group-hover:opacity-100 transition-opacity">
                            {getSortIcon(month, 'cost_rate')}
                          </span>
                        </div>
                      </th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedStores.length === 0 ? (
                  <tr>
                    <td
                      colSpan={1 + months.length * 4}
                      className="p-16 text-center text-slate-400 dark:text-slate-500"
                    >
                      <span className="text-5xl block mb-3">📭</span>
                      担当店舗のデータがありません
                    </td>
                  </tr>
                ) : (
                  sortedStores.map((store, i) => (
                    <tr
                      key={store.store_id}
                      className={`border-b border-slate-100 dark:border-slate-700 transition-colors hover:bg-amber-50 dark:hover:bg-slate-700/40 ${
                        i % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50 dark:bg-slate-800/60'
                      }`}
                    >
                      {/* 店舗コード列（固定） */}
                      <td className="p-4 border-r border-slate-200 dark:border-slate-700 sticky left-0 bg-inherit z-10">
                        <div className="font-black text-slate-800 dark:text-slate-100 text-base">
                          {store.store_code}
                        </div>
                        <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 whitespace-nowrap">
                          {store.store_name}
                        </div>
                      </td>

                      {/* 各月のデータ */}
                      {months.map(month => {
                        const m = store.months[month];
                        const isHighCostRate = m?.cost_rate !== null && m?.cost_rate !== undefined && m.cost_rate > 80;
                        return (
                          <React.Fragment key={`${store.store_id}-${month}`}>
                            {/* 予想売上 */}
                            <td className="p-3 text-right font-bold text-amber-600 dark:text-amber-400 border-l border-slate-100 dark:border-slate-700 whitespace-nowrap">
                              {fmtYen(m?.retail_sales ?? 0)}
                            </td>
                            {/* 社内取引売上 */}
                            <td className="p-3 text-right font-bold text-blue-600 dark:text-blue-400 border-l border-slate-100 dark:border-slate-700 whitespace-nowrap">
                              {fmtYen(m?.wholesale_sales ?? 0)}
                            </td>
                            {/* 原材料費 */}
                            <td className="p-3 text-right font-bold text-red-600 dark:text-red-400 border-l border-slate-100 dark:border-slate-700 whitespace-nowrap">
                              {fmtYen(m?.material_cost ?? 0)}
                            </td>
                            {/* 原価率 */}
                            <td
                              className={`p-3 text-right font-black border-l border-slate-100 dark:border-slate-700 border-r border-slate-200 dark:border-slate-600 last:border-r-0 whitespace-nowrap text-base ${
                                isHighCostRate
                                  ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
                                  : 'text-purple-600 dark:text-purple-400'
                              }`}
                            >
                              {fmtRate(m?.cost_rate ?? null)}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 凡例 */}
          <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span>💡 各月のカラム名をクリックすると昇順/降順で並べ替えができます</span>
            <span className="text-red-500">■ 赤背景 = 原価率80%超え</span>
            <span>— = データなし</span>
          </div>
        </div>
      )}
    </div>
  );
}
