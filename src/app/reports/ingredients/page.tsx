'use client';

import { useState, useEffect } from 'react';
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
  const [salesSummary, setSalesSummary] = useState({ total_retail_sales: 0, total_wholesale_sales: 0 });
  const [isLoading, setIsLoading] = useState(false);

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
      const res = await fetch(`/api/reports/ingredients?month=${month}`);
      const data = await res.json();
      if (res.ok) {
        setTotals(data.totals || []);
        setHistory(data.history || []);
        setSalesSummary(data.salesSummary || { total_retail_sales: 0, total_wholesale_sales: 0 });
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
    if (totals.length === 0) {
      alert('出力するデータがありません');
      return;
    }
    
    // バックエンドAPIへリダイレクトしてExcelをダウンロード
    window.location.href = `/api/reports/ingredients/export?month=${targetMonth}`;
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
            <span className="text-3xl">📊</span> 月間原材料使用量
          </h2>
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
                    {Number(salesSummary.total_wholesale_sales) > 0 && (
                      <p className="text-sm font-bold text-slate-500">
                        (原価率 {((totalMaterialCost / Number(salesSummary.total_wholesale_sales)) * 100).toFixed(1)}%)
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
                  disabled={totals.length === 0}
                  className={`px-5 py-3 ${totals.length === 0 ? 'bg-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'} text-white font-bold rounded-xl shadow-md flex items-center gap-2 transition-transform active:scale-95`}
                >
                  <span className="text-xl">📗</span> Excel(.xlsx) 出力
                </button>
              </div>

            {totals.length === 0 ? (
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
                      <th className="p-4 px-6 w-32">材料コード</th>
                      <th className="p-4 px-6">材料名</th>
                      <th className="p-4 px-6 text-right w-48">総使用量 (g)</th>
                      <th className="p-4 px-6 text-right w-48">原材料費 (円)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totals.map((t, i) => (
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
            )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
