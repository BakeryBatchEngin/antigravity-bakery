'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

interface IngredientTotal {
  ingredient_code: string;
  ingredient_name: string;
  total_grams: number;
  purchase_weight: number | null;
  purchase_price: number | null;
}

interface IngredientHistory {
  target_date: string;
  batch_id: string;
  ingredient_name: string;
  used_weight_grams: number;
}

export default function IngredientsReportPage() {
  const [targetMonth, setTargetMonth] = useState<string>('');
  const [totals, setTotals] = useState<IngredientTotal[]>([]);
  const [history, setHistory] = useState<IngredientHistory[]>([]);
  const [productionRecords, setProductionRecords] = useState<any[]>([]);
  const [salesSummary, setSalesSummary] = useState({ total_retail_sales: 0, total_wholesale_sales: 0 });
  const [dailyMixCounts, setDailyMixCounts] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<'ingredients' | 'production'>('ingredients');
  const [isLoading, setIsLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedTotals = useMemo(() => {
    let sortableItems = [...totals];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue: any = 0;
        let bValue: any = 0;
        if (sortConfig.key === 'ingredient_code') { aValue = a.ingredient_code; bValue = b.ingredient_code; }
        else if (sortConfig.key === 'ingredient_name') { aValue = a.ingredient_name; bValue = b.ingredient_name; }
        else if (sortConfig.key === 'total_grams') { aValue = a.total_grams; bValue = b.total_grams; }
        else if (sortConfig.key === 'cost') { 
          aValue = a.purchase_weight && a.purchase_price ? (a.total_grams * (a.purchase_price / a.purchase_weight)) : 0;
          bValue = b.purchase_weight && b.purchase_price ? (b.total_grams * (b.purchase_price / b.purchase_weight)) : 0;
        }
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [totals, sortConfig]);

  const sortedProductionRecords = useMemo(() => {
    let sortableItems = [...productionRecords];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue: any = 0;
        let bValue: any = 0;
        if (sortConfig.key === 'productCode') { aValue = a.productCode; bValue = b.productCode; }
        else if (sortConfig.key === 'productName') { aValue = a.productName; bValue = b.productName; }
        else if (sortConfig.key.startsWith('day-')) {
          const dateKey = sortConfig.key.replace('day-', '');
          aValue = a.dailyCounts[dateKey] || 0;
          bValue = b.dailyCounts[dateKey] || 0;
        }
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [productionRecords, sortConfig]);

  useEffect(() => {
    // 初回表示時は今月をセット
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const defaultMonth = `${yyyy}-${mm}`;
    setTargetMonth(defaultMonth);
    fetchReport(defaultMonth);
  }, []);

  const fetchReport = async (month: string) => {
    if (!month) return;
    setIsLoading(true);
    try {
      const [res, pRes] = await Promise.all([
         fetch(`/api/reports/ingredients?month=${month}`),
         fetch(`/api/reports/production?month=${month}`)
      ]);
      const data = await res.json();
      const pData = await pRes.json();

      if (res.ok) {
        setTotals(data.totals || []);
        setHistory(data.history || []);
        setSalesSummary(data.salesSummary || { total_retail_sales: 0, total_wholesale_sales: 0 });
      }
      if (pRes.ok) {
        setProductionRecords(pData.records || []);
        setDailyMixCounts(pData.dailyMixCounts || {});
      }
    } catch (e) {
      console.error(e);
      alert('データ取得エラー');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setTargetMonth(newVal);
    fetchReport(newVal);
  };

  const handleExportExcel = () => {
    if (activeTab === 'ingredients') {
      if (totals.length === 0) {
        alert('出力するデータがありません');
        return;
      }
      window.location.href = `/api/reports/ingredients/export?month=${targetMonth}`;
    } else {
      if (productionRecords.length === 0) {
        alert('出力するデータがありません');
        return;
      }
      window.location.href = `/api/reports/production/export?month=${targetMonth}`;
    }
  };

  const totalMaterialCost = totals.reduce((acc, t) => {
    if (t.purchase_weight && t.purchase_price) {
      return acc + Math.round(t.total_grams * (t.purchase_price / t.purchase_weight));
    }
    return acc;
  }, 0);

  return (
    <div className="flex flex-col h-screen bg-slate-100 dark:bg-slate-900 overflow-hidden">
      <div className="flex-none flex items-center justify-between bg-white dark:bg-slate-800 p-4 border-b border-slate-200 dark:border-slate-700 shadow-sm z-10">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-3 text-slate-800 dark:text-slate-100">
            <span className="text-3xl">📊</span> 月間実績レポート
          </h2>
          <div className="flex gap-6 mt-4">
            <button 
              onClick={() => { setActiveTab('ingredients'); setSortConfig(null); }} 
              className={`pb-2 font-bold transition-colors ${activeTab === 'ingredients' ? 'text-blue-600 dark:text-blue-400 border-b-4 border-blue-600 dark:border-blue-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
            >
              原材料使用量
            </button>
            <button 
              onClick={() => { setActiveTab('production'); setSortConfig(null); }} 
              className={`pb-2 font-bold transition-colors ${activeTab === 'production' ? 'text-emerald-600 dark:text-emerald-400 border-b-4 border-emerald-600 dark:border-emerald-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
            >
              生産実績
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <input 
            type="month" 
            value={targetMonth} 
            onChange={handleMonthChange}
            style={{ colorScheme: 'dark' }}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl font-bold text-lg text-slate-700 dark:text-slate-200"
          />
          <Link href="/" className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-xl font-bold transition-colors hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200">
            🏠 戻る
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-8 pb-32 flex flex-col items-center">
        {isLoading ? (
           <div className="animate-spin text-4xl mt-12">🔄</div>
        ) : (
          <div className="w-full max-w-5xl flex flex-col gap-6 mb-12">
            {/* サマリーカード */}
            {!isLoading && totals.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-md p-6 border-t-4 border-amber-500">
                  <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-2"><span>💰</span> 予想売上 (一般)</h4>
                  <p className="text-3xl font-black text-slate-800 dark:text-slate-100">¥ {Number(salesSummary.total_retail_sales).toLocaleString()}</p>
                </div>
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-md p-6 border-t-4 border-blue-500">
                  <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-2"><span>🏢</span> 社内取引売上</h4>
                  <p className="text-3xl font-black text-slate-800 dark:text-slate-100">¥ {Number(salesSummary.total_wholesale_sales).toLocaleString()}</p>
                </div>
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-md p-6 border-t-4 border-red-500">
                  <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-2"><span>🛒</span> 原材料費合計</h4>
                  <div className="flex items-end justify-between">
                    <p className="text-3xl font-black text-red-600 dark:text-red-400">¥ {totalMaterialCost.toLocaleString()}</p>
                    {Number(salesSummary.total_retail_sales) > 0 && (
                      <p className="text-sm font-bold text-slate-500">
                        (原価率 {((totalMaterialCost / Number(salesSummary.total_retail_sales)) * 100).toFixed(1)}%)
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden">
              <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/80">
                <h3 className="text-2xl font-black text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <span>🗓️</span> {targetMonth} の実績
                </h3>
                <button 
                  onClick={handleExportExcel}
                  disabled={activeTab === 'ingredients' ? totals.length === 0 : productionRecords.length === 0}
                  className={`px-5 py-3 ${(activeTab === 'ingredients' ? totals.length === 0 : productionRecords.length === 0) ? 'bg-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'} text-white font-bold rounded-xl shadow-md flex items-center gap-2 transition-transform active:scale-95`}
                >
                  <span className="text-xl">📗</span> Excel(.xlsx) 出力
                </button>
              </div>

            {activeTab === 'ingredients' ? (
              totals.length === 0 ? (
                <div className="p-16 text-center">
                  <span className="text-6xl mb-4 block opacity-50">📭</span>
                  <p className="text-xl text-slate-500 font-bold">データがありません</p>
                  <p className="text-slate-400 mt-2">「本日の仕込み」でバッチの計量チェックを完了（実行済みに）するとここに自動集計されます。</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-900 font-bold text-slate-500 dark:text-slate-400 border-b-2 border-slate-200 dark:border-slate-700">
                        <th className="p-4 px-6 w-32 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800" onClick={() => handleSort('ingredient_code')}>
                          材料コード {sortConfig?.key === 'ingredient_code' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                        </th>
                        <th className="p-4 px-6 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800" onClick={() => handleSort('ingredient_name')}>
                          材料名 {sortConfig?.key === 'ingredient_name' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                        </th>
                        <th className="p-4 px-6 text-right w-48 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800" onClick={() => handleSort('total_grams')}>
                          総使用量 (g) {sortConfig?.key === 'total_grams' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                        </th>
                        <th className="p-4 px-6 text-right w-48 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800" onClick={() => handleSort('cost')}>
                          原材料費 (円) {sortConfig?.key === 'cost' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTotals.map((t, i) => (
                        <tr key={i} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-amber-50 dark:hover:bg-slate-700/30 transition-colors">
                          <td className="p-4 px-6 font-mono text-sm text-slate-400">{t.ingredient_code}</td>
                          <td className="p-4 px-6 font-bold text-lg text-slate-800 dark:text-slate-200">{t.ingredient_name}</td>
                          <td className="p-4 px-6 text-right font-black text-slate-700 dark:text-slate-300">
                            {t.total_grams.toLocaleString()} <span className="text-sm font-normal text-slate-400 ml-1">g</span>
                          </td>
                          <td className="p-4 px-6 text-right font-black text-amber-600 dark:text-amber-500 text-xl">
                            {t.purchase_weight && t.purchase_price 
                              ? `¥ ${Math.round(t.total_grams * (t.purchase_price / t.purchase_weight)).toLocaleString()}` 
                              : <span className="text-sm font-normal text-slate-400">未設定</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              productionRecords.length === 0 ? (
                <div className="p-16 text-center">
                  <span className="text-6xl mb-4 block opacity-50">📭</span>
                  <p className="text-xl text-slate-500 font-bold">データがありません</p>
                  <p className="text-slate-400 mt-2">「本日の仕込み」で計量を完了するとここに自動集計されます。</p>
                </div>
              ) : (
                <div className="overflow-x-auto pb-4">
                  <table className="w-full text-left border-collapse whitespace-nowrap min-w-max">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-900 font-bold text-slate-500 dark:text-slate-400 border-b-2 border-slate-200 dark:border-slate-700">
                        <th className="p-4 px-4 sticky left-0 z-10 bg-slate-100 dark:bg-slate-900 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800" onClick={() => handleSort('productCode')}>
                          商品コード {sortConfig?.key === 'productCode' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                        </th>
                        <th className="p-4 px-4 sticky left-[120px] z-10 bg-slate-100 dark:bg-slate-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800" onClick={() => handleSort('productName')}>
                          商品名 {sortConfig?.key === 'productName' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                        </th>
                        {(() => {
                          const [y, m] = targetMonth.split('-');
                          const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
                          return Array.from({length: lastDay}, (_, i) => i + 1).map(d => {
                             const dateKey = `${y}-${m}-${d.toString().padStart(2, '0')}`;
                             return (
                               <th key={d} className="p-4 px-4 text-center cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800" onClick={() => handleSort(`day-${dateKey}`)}>
                                 {d}日 {sortConfig?.key === `day-${dateKey}` ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                               </th>
                             );
                          });
                        })()}
                      </tr>
                    </thead>
                    <tbody>
                      {/* ミキシング回数行 */}
                      <tr className="group border-b-4 border-slate-200 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="p-4 px-4 font-mono text-sm text-slate-400 sticky left-0 bg-white dark:bg-slate-800 group-hover:bg-amber-50 dark:group-hover:bg-slate-700"></td>
                        <td className="p-4 px-4 font-bold text-amber-600 dark:text-amber-500 sticky left-[120px] bg-white dark:bg-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-amber-50 dark:group-hover:bg-slate-700 flex items-center gap-2">
                          <span>🥣</span> ミキシング回数
                        </td>
                        {(() => {
                          const [y, m] = targetMonth.split('-');
                          const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
                          return Array.from({length: lastDay}, (_, i) => i + 1).map(d => {
                            const dateKey = `${y}-${m}-${d.toString().padStart(2, '0')}`;
                            const val = dailyMixCounts[dateKey] || 0;
                            return (
                              <td key={d} className={`p-4 px-4 text-center font-bold ${val > 0 ? 'text-amber-600 dark:text-amber-500' : 'text-slate-300 dark:text-slate-600'}`}>
                                {val > 0 ? `${val}回` : '-'}
                              </td>
                            );
                          });
                        })()}
                      </tr>
                      {sortedProductionRecords.map((rec, i) => (
                        <tr key={i} className="group border-b border-slate-100 dark:border-slate-700/50 hover:bg-emerald-50 dark:hover:bg-slate-700/30 transition-colors">
                          <td className="p-4 px-4 font-mono text-sm text-slate-500 sticky left-0 bg-white dark:bg-slate-800 group-hover:bg-emerald-50 dark:group-hover:bg-slate-700">{rec.productCode}</td>
                          <td className="p-4 px-4 font-bold text-slate-800 dark:text-slate-200 sticky left-[120px] bg-white dark:bg-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-emerald-50 dark:group-hover:bg-slate-700">{rec.productName}</td>
                          {(() => {
                            const [y, m] = targetMonth.split('-');
                            const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
                            return Array.from({length: lastDay}, (_, i) => i + 1).map(d => {
                              const dateKey = `${y}-${m}-${d.toString().padStart(2, '0')}`;
                              const val = rec.dailyCounts[dateKey] || 0;
                              return (
                                <td key={d} className={`p-4 px-4 text-center ${val > 0 ? 'font-black text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' : 'text-slate-300 dark:text-slate-600'}`}>
                                  {val}
                                </td>
                              );
                            });
                          })()}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
