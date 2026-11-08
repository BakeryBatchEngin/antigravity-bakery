'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import LoadingSpinner from '@/components/LoadingSpinner';

const DELIVERY_DATES = [
  { value: '2026-12-19', label: '12/19(土)' },
  { value: '2026-12-20', label: '12/20(日)' },
  { value: '2026-12-21', label: '12/21(月)' },
  { value: '2026-12-22', label: '12/22(火)' },
  { value: '2026-12-23', label: '12/23(水)' },
  { value: '2026-12-24', label: '12/24(木)' },
  { value: '2026-12-25', label: '12/25(金)' },
];

// メインのケーキ4種とおまけ商品2種
const MAIN_CAKES = ['デリスドゥラス', 'リンツァーロール', 'ブッシュカイザー', 'ブッシュ エキゾチック'];
const SIDE_PRODUCTS = ['シュトーレン', 'シュトーレン ハーフ'];

type ProductSummary = {
  product_name: string;
  total_quantity: number;
  max_limit: number;
  is_max_reached: boolean;
};

type StoreAccount = {
  id: number;
  username: string;
  display_name: string;
  role: string;
};

export default function XmasFactoryPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [savingLimits, setSavingLimits] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // データ
  const [products, setProducts] = useState<string[]>([]);
  const [storeAccounts, setStoreAccounts] = useState<StoreAccount[]>([]);
  const [productSummaries, setProductSummaries] = useState<ProductSummary[]>([]);
  const [dailyMatrix, setDailyMatrix] = useState<{
    all: Record<string, Record<string, number>>;
    tokyo: Record<string, Record<string, number>>;
    regional: Record<string, Record<string, number>>;
  }>({ all: {}, tokyo: {}, regional: {} });
  const [storeMatrixByDate, setStoreMatrixByDate] = useState<
    Record<string, Record<number, Record<string, number>>>
  >({});

  // 最大受注数の一時入力用ステート
  const [limitInputs, setLimitInputs] = useState<Record<string, number>>({});

  // 表示切り替えステート
  const [shipmentScope, setShipmentScope] = useState<'all' | 'tokyo' | 'regional'>('all');
  const [selectedDeliveryDate, setSelectedDeliveryDate] = useState<string>('2026-12-24');

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login');
        return;
      }
      if (!['xmas_factory', 'admin', 'super_admin', 'xmas_manager'].includes(user.role)) {
        router.push('/xmas/orders');
        return;
      }
      fetchFactoryData();
    }
  }, [authLoading, user]);

  const fetchFactoryData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/xmas/factory');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'データの取得に失敗しました');

      // 商品順を確実に整頓（ケーキ4種 → シュトーレン2種）
      const sortedProducts = [
        ...MAIN_CAKES.filter(p => (data.products || []).includes(p)),
        ...SIDE_PRODUCTS.filter(p => (data.products || []).includes(p)),
      ];

      setProducts(sortedProducts.length > 0 ? sortedProducts : (data.products || []));
      setStoreAccounts(data.storeAccounts || []);

      // サマリーも整頓
      const summaryMap: Record<string, ProductSummary> = {};
      (data.productSummaries || []).forEach((ps: ProductSummary) => {
        summaryMap[ps.product_name] = ps;
      });
      const sortedSummaries = sortedProducts.map(p => summaryMap[p]).filter(Boolean);
      setProductSummaries(sortedSummaries);

      setDailyMatrix(data.dailyMatrix || { all: {}, tokyo: {}, regional: {} });
      setStoreMatrixByDate(data.storeMatrixByDate || {});

      // 入力値の初期化
      const inputs: Record<string, number> = {};
      (data.productSummaries || []).forEach((ps: ProductSummary) => {
        inputs[ps.product_name] = ps.max_limit;
      });
      setLimitInputs(inputs);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // 最大受注数の保存
  const handleSaveLimits = async () => {
    setSavingLimits(true);
    setMessage(null);
    try {
      const payload = {
        limits: Object.entries(limitInputs).map(([product_name, max_limit]) => ({
          product_name,
          max_limit: Number(max_limit) || 0,
        })),
      };

      const res = await fetch('/api/xmas/factory/limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存に失敗しました');

      setMessage({ type: 'success', text: '最大受注数の設定を更新しました！' });
      fetchFactoryData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSavingLimits(false);
    }
  };

  if (authLoading || loading) {
    return <LoadingSpinner fullScreen={true} />;
  }

  const currentDailyMatrix = dailyMatrix[shipmentScope] || {};

  // メインケーキのサマリーとおまけ商品のサマリーを分離
  const mainCakeSummaries = productSummaries.filter(ps => MAIN_CAKES.includes(ps.product_name));
  const sideProductSummaries = productSummaries.filter(ps => SIDE_PRODUCTS.includes(ps.product_name));

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-3 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex flex-col gap-8">

        {/* メッセージ通知 */}
        {message && (
          <div
            className={`p-4 rounded-2xl font-bold flex items-center justify-between border ${
              message.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <span>{message.type === 'success' ? '✅' : '⚠️'} {message.text}</span>
            <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-600 font-bold px-2">✕</button>
          </div>
        )}

        {/* ======================================================== */}
        {/* 一番上: 商品別合算受注数 ＆ 最大受注数設定 ウィンドウ */}
        {/* ======================================================== */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200 mb-6">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-3xl">📊</span>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  商品別合算受注数 ＆ 最大受注数設定
                </h1>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                最大受注数を入力して保存すると、上限に達した商品は各店舗で自動的に選択不可となります（0で無制限）。
              </p>
            </div>

            <div className="flex items-center gap-3 self-start sm:self-auto">
              <button
                onClick={() => router.push('/xmas/orders')}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm transition-all"
              >
                <span>📋</span>
                <span>全注文履歴一覧へ</span>
              </button>

              <button
                onClick={handleSaveLimits}
                disabled={savingLimits}
                className="px-5 py-2.5 rounded-xl font-black text-white bg-red-600 hover:bg-red-700 shadow-md hover:shadow-lg transition-all disabled:opacity-50 text-xs sm:text-sm flex items-center gap-2"
              >
                <span>💾</span>
                <span>{savingLimits ? '保存中...' : '最大受注数を保存'}</span>
              </button>
            </div>
          </div>

          {/* メインケーキ4種（堂々とした大きなカード） */}
          <div className="mb-6">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              🎂 メインケーキ（4種）
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {mainCakeSummaries.map((ps) => {
                const currentInput = limitInputs[ps.product_name] ?? ps.max_limit;
                const isReached = ps.max_limit > 0 && ps.total_quantity >= ps.max_limit;
                const percentage = ps.max_limit > 0 ? Math.min(100, Math.round((ps.total_quantity / ps.max_limit) * 100)) : 0;

                return (
                  <div
                    key={ps.product_name}
                    className={`p-5 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                      isReached
                        ? 'bg-red-50/90 border-red-500 shadow-sm'
                        : 'bg-slate-50/80 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1 mb-2">
                        <h4 className="text-base font-black text-slate-900 leading-snug">{ps.product_name}</h4>
                        {isReached && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-red-600 text-white flex-shrink-0 animate-pulse">
                            上限到達
                          </span>
                        )}
                      </div>

                      {/* 合算受注数（特大） */}
                      <div className="my-3">
                        <span className="text-[11px] font-bold text-slate-500 block mb-0.5">全店合算受注数:</span>
                        <div className="flex items-baseline gap-1.5">
                          <span className={`text-4xl font-black tracking-tight ${isReached ? 'text-red-600' : 'text-slate-900'}`}>
                            {ps.total_quantity}
                          </span>
                          <span className="text-sm font-bold text-slate-500">個</span>
                        </div>
                      </div>

                      {/* 進捗バー */}
                      {ps.max_limit > 0 && (
                        <div className="mb-3">
                          <div className="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
                            <span>進捗率</span>
                            <span>{percentage}% ({ps.total_quantity}/{ps.max_limit})</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-2 rounded-full ${isReached ? 'bg-red-600' : percentage > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 最大受注数入力ボックス */}
                    <div className="pt-3 border-t border-slate-200">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        最大受注数（上限個数）:
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={currentInput}
                          onChange={(e) => setLimitInputs({
                            ...limitInputs,
                            [ps.product_name]: Math.max(0, parseInt(e.target.value) || 0),
                          })}
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-black text-base text-slate-900 text-center focus:outline-none focus:border-red-500 shadow-inner"
                        />
                        <span className="text-xs font-bold text-slate-500 flex-shrink-0">個 (0:無制限)</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* シュトーレン・シュトーレンハーフ（おまけ的商品：半分サイズのコンパクトボックス） */}
          <div className="pt-4 border-t border-slate-200">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              🥖 おまけ的商品（シュトーレン）
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
              {sideProductSummaries.map((ps) => {
                const currentInput = limitInputs[ps.product_name] ?? ps.max_limit;
                const isReached = ps.max_limit > 0 && ps.total_quantity >= ps.max_limit;

                return (
                  <div
                    key={ps.product_name}
                    className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                      isReached
                        ? 'bg-red-50/80 border-red-400'
                        : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-slate-800 truncate">{ps.product_name}</span>
                        {isReached && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-red-600 text-white">
                            上限
                          </span>
                        )}
                      </div>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-xs text-slate-500 font-bold">合算:</span>
                        <span className={`text-xl font-black ${isReached ? 'text-red-600' : 'text-slate-900'}`}>
                          {ps.total_quantity}
                        </span>
                        <span className="text-xs text-slate-500 font-bold">個</span>
                        {ps.max_limit > 0 && (
                          <span className="text-[11px] text-slate-400 font-medium ml-1">
                            (上限: {ps.max_limit})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* コンパクト上限入力 */}
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-bold text-slate-600">上限:</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={currentInput}
                        onChange={(e) => setLimitInputs({
                          ...limitInputs,
                          [ps.product_name]: Math.max(0, parseInt(e.target.value) || 0),
                        })}
                        className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-lg font-black text-sm text-slate-900 text-center focus:outline-none focus:border-red-500"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 真ん中: 商品別・日別出荷数 ウィンドウ */}
        {/* ======================================================== */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-200 mb-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
                <span>📅 商品別・日別出荷数</span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                出荷仕分け用に「合算」「首都圏店舗向け」「地方店舗向け」を切り替えられます。
              </p>
            </div>

            {/* スコープ切り替えタブ */}
            <div className="flex items-center bg-slate-100 p-1.5 rounded-2xl border border-slate-200 self-start md:self-auto">
              {[
                { id: 'all', label: '合算（全体）', icon: '🌐' },
                { id: 'tokyo', label: '首都圏向け', icon: '🏙️' },
                { id: 'regional', label: '地方向け', icon: '🌾' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setShipmentScope(tab.id as any)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                    shipmentScope === tab.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-center">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3.5 text-left text-xs font-black text-slate-600 uppercase">
                    商品名
                  </th>
                  {DELIVERY_DATES.map(d => (
                    <th key={d.value} className="px-3 py-3.5 text-xs font-black text-slate-700 whitespace-nowrap">
                      {d.label}
                    </th>
                  ))}
                  <th className="px-4 py-3.5 text-xs font-black text-red-700 bg-red-50/70 whitespace-nowrap">
                    期間合計
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {products.map(prod => {
                  const dateCounts = currentDailyMatrix[prod] || {};
                  let rowTotal = 0;
                  DELIVERY_DATES.forEach(d => {
                    rowTotal += (dateCounts[d.value] || 0);
                  });
                  const isSide = SIDE_PRODUCTS.includes(prod);

                  return (
                    <tr key={prod} className={`hover:bg-slate-50 transition-colors ${isSide ? 'bg-slate-50/40 text-slate-700' : ''}`}>
                      <td className="px-4 py-3.5 text-left font-black text-slate-900 text-sm whitespace-nowrap">
                        {isSide && <span className="text-xs text-slate-400 mr-1.5 font-normal">🥖</span>}
                        {prod}
                      </td>
                      {DELIVERY_DATES.map(d => {
                        const count = dateCounts[d.value] || 0;
                        return (
                          <td key={d.value} className="px-3 py-3.5 whitespace-nowrap">
                            <span className={`text-base font-bold ${count > 0 ? 'text-slate-900' : 'text-slate-300'}`}>
                              {count}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-4 py-3.5 bg-red-50/50 whitespace-nowrap">
                        <span className="text-lg font-black text-red-600">
                          {rowTotal}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* 日別合計行 */}
              <tfoot className="bg-slate-100/80 font-black">
                <tr>
                  <td className="px-4 py-3.5 text-left text-slate-900 text-sm">
                    日別合計
                  </td>
                  {DELIVERY_DATES.map(d => {
                    let colTotal = 0;
                    products.forEach(p => {
                      colTotal += (currentDailyMatrix[p]?.[d.value] || 0);
                    });
                    return (
                      <td key={d.value} className="px-3 py-3.5 text-slate-900 text-base">
                        {colTotal}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3.5 bg-red-100 text-red-800 text-lg">
                    {products.reduce((acc, p) => {
                      const counts = currentDailyMatrix[p] || {};
                      return acc + DELIVERY_DATES.reduce((sum, d) => sum + (counts[d.value] || 0), 0);
                    }, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 一番下: 🏭 工場出荷集計 ＆ 店舗別・商品別の受注内訳 ウィンドウ */}
        {/* ======================================================== */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-200 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">🏭</span>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  工場出荷集計 ＆ 店舗別受注内訳
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                納品日（お渡し日）を選択して、店舗ごとのケーキ仕分け数量を確認できます。
              </p>
            </div>

            {/* 納品日切り替えタブ */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 self-start md:self-auto">
              {DELIVERY_DATES.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setSelectedDeliveryDate(d.value)}
                  className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                    selectedDeliveryDate === d.value
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-center">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3.5 text-left text-xs font-black text-slate-600 uppercase">
                    店舗名（アカウント）
                  </th>
                  <th className="px-3 py-3.5 text-xs font-black text-slate-500 uppercase whitespace-nowrap">
                    区分
                  </th>
                  {products.map(prod => (
                    <th key={prod} className="px-3 py-3.5 text-xs font-black text-slate-700 whitespace-nowrap">
                      {prod}
                    </th>
                  ))}
                  <th className="px-4 py-3.5 text-xs font-black text-red-700 bg-red-50/70 whitespace-nowrap">
                    店舗計
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {storeAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={products.length + 3} className="px-6 py-8 text-center text-slate-400 font-bold">
                      店舗アカウントがまだ登録されていません。
                    </td>
                  </tr>
                ) : (
                  storeAccounts.map((acc) => {
                    const storeData = storeMatrixByDate[selectedDeliveryDate]?.[acc.id] || {};
                    let storeTotal = 0;
                    products.forEach(p => {
                      storeTotal += (storeData[p] || 0);
                    });

                    return (
                      <tr key={acc.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3.5 text-left font-bold text-slate-900 text-sm whitespace-nowrap">
                          {acc.display_name}
                        </td>
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                            acc.role === 'tokyo_store'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {acc.role === 'tokyo_store' ? '首都圏' : '地方'}
                          </span>
                        </td>
                        {products.map(prod => {
                          const count = storeData[prod] || 0;
                          return (
                            <td key={prod} className="px-3 py-3.5 whitespace-nowrap">
                              <span className={`text-base font-bold ${count > 0 ? 'text-slate-900' : 'text-slate-300'}`}>
                                {count}
                              </span>
                            </td>
                          );
                        })}
                        <td className="px-4 py-3.5 bg-red-50/50 whitespace-nowrap">
                          <span className="text-base font-black text-red-600">
                            {storeTotal}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {/* 店舗合計行 */}
              <tfoot className="bg-slate-100/80 font-black">
                <tr>
                  <td colSpan={2} className="px-4 py-3.5 text-left text-slate-900 text-sm">
                    {DELIVERY_DATES.find(d => d.value === selectedDeliveryDate)?.label} 全店合計
                  </td>
                  {products.map(prod => {
                    let colTotal = 0;
                    storeAccounts.forEach(acc => {
                      colTotal += (storeMatrixByDate[selectedDeliveryDate]?.[acc.id]?.[prod] || 0);
                    });
                    return (
                      <td key={prod} className="px-3 py-3.5 text-slate-900 text-base">
                        {colTotal}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3.5 bg-red-100 text-red-800 text-lg">
                    {storeAccounts.reduce((acc, store) => {
                      const data = storeMatrixByDate[selectedDeliveryDate]?.[store.id] || {};
                      return acc + products.reduce((sum, p) => sum + (data[p] || 0), 0);
                    }, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
