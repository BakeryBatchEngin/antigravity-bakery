'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Sparkles,
  Loader2,
  TrendingDown,
  ShoppingBag,
  Clock,
  MessageSquare,
  AlertTriangle,
  Download,
  Building2,
  RefreshCw,
} from 'lucide-react';

interface SummaryData {
  soldAmount: number;
  orderAmount: number;
  deliveryAmount: number;
  wasteAmount: number;
  wasteRate: number;
  sampleAmount: number;
  sampleRate: number;
}

interface AnalyticsRow {
  productCode: string;
  productName: string;
  price: number;
  orderQty: number;
  orderAmount: number;
  deliveryDiff: number;
  actualDeliveryQty: number;
  actualDeliveryAmount: number;
  soldQty: number;
  soldAmount: number;
  wasteCount: number;
  wasteAmount: number;
  sampleCount: number;
  sampleAmount: number;
  soldOutTime: string;
  soldOutPercent: number;
  soldOutStatus: 'early' | 'normal' | 'late' | 'not_sold_out' | 'no_time';
  comment: string;
}

interface AnalyticsData {
  store: { id: number; name: string; code: string };
  targetDate: string;
  dayLabel: string;
  dayJaLabel: string;
  todayHours: { open: string; close: string; closed: boolean };
  locationCharacteristics: string;
  summary: SummaryData;
  rows: AnalyticsRow[];
  aiComment: string | null;
  aiUpdatedAt: string | null;
}

export default function LossAnalyticsPage() {
  const [targetDate, setTargetDate] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzingAi, setAnalyzingAi] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalytics(targetDate);
  }, [targetDate]);

  const fetchAnalytics = async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/loss-analytics?date=${date}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '実績データの取得に失敗しました');
      setData(json);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 日付の前後移動
  const changeDate = (days: number) => {
    const [y, m, d] = targetDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    const nextY = dt.getUTCFullYear();
    const nextM = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const nextD = String(dt.getUTCDate()).padStart(2, '0');
    setTargetDate(`${nextY}-${nextM}-${nextD}`);
  };

  // AI分析コメントの生成
  const handleGenerateAiAnalysis = async () => {
    setAnalyzingAi(true);
    try {
      const res = await fetch('/api/loss-analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDate }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'AI分析の生成に失敗しました');

      setData(prev => (prev ? { ...prev, aiComment: json.aiComment, aiUpdatedAt: new Date().toISOString() } : null));
    } catch (err: any) {
      console.error(err);
      alert(`AI分析に失敗しました: ${err.message}`);
    } finally {
      setAnalyzingAi(false);
    }
  };

  // CSVエクスポート
  const handleExportCsv = () => {
    if (!data || data.rows.length === 0) return;

    const headers = [
      '商品コード',
      '商品名',
      '商品単価（税抜き）',
      'オーダー数',
      'オーダー金額',
      '納品差分',
      '展開金額',
      '販売数',
      '販売金額',
      'ロス数',
      'ロス金額',
      '試食数',
      '試食金額',
      '完売時刻',
      'コメント',
    ];

    const lines = [
      `"${data.targetDate}（${data.dayLabel}）実績データ - ${data.store.name}"`,
      `"販売総額",${data.summary.soldAmount},"発注総額",${data.summary.orderAmount},"納品総額",${data.summary.deliveryAmount}`,
      `"ロス総額",${data.summary.wasteAmount},"ロス率",${(data.summary.wasteRate * 100).toFixed(2)}%`,
      `"試食総額",${data.summary.sampleAmount},"試食率",${(data.summary.sampleRate * 100).toFixed(2)}%`,
      '',
      headers.map(h => `"${h}"`).join(','),
      ...data.rows.map(r =>
        [
          r.productCode,
          r.productName,
          r.price,
          r.orderQty,
          r.orderAmount,
          r.deliveryDiff,
          r.actualDeliveryAmount,
          r.soldQty,
          r.soldAmount,
          r.wasteCount,
          r.wasteAmount,
          r.sampleCount,
          r.sampleAmount,
          r.soldOutTime,
          `"${(r.comment || '').replace(/"/g, '""')}"`,
        ].join(',')
      ),
    ];

    const bom = '\uFEFF';
    const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `実績解析_${data.store.name}_${data.targetDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 -mx-4 -mt-4 sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8">
      {/* 画面上部ヘッダーバー */}
      <div className="bg-white border-b px-4 py-3 shadow-sm sticky top-0 z-20 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            title="トップへ戻る"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-gray-900">販売実績解析</h1>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                日次モード
              </span>
            </div>
            <p className="text-xs text-gray-500">
              対象店舗: <span className="font-bold text-emerald-700">{data?.store.name || '...'}</span>
            </p>
          </div>
        </div>

        {/* 日付コントロール */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => changeDate(-1)}
            className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 transition-colors"
            title="前日へ"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1 bg-gray-50 border rounded-lg px-2.5 py-1">
            <Calendar className="w-4 h-4 text-gray-500" />
            <input
              type="date"
              value={targetDate}
              onChange={e => setTargetDate(e.target.value)}
              className="bg-transparent text-sm font-bold text-gray-800 outline-none cursor-pointer"
            />
            {data && (
              <span className="text-xs font-bold text-emerald-700 ml-1">
                （{data.dayJaLabel}）
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => changeDate(1)}
            className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 transition-colors"
            title="翌日へ"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!data || data.rows.length === 0}
            className="ml-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition-colors"
            title="CSV形式でダウンロード"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">CSV出力</span>
          </button>
        </div>
      </div>

      <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-2xl shadow-sm border p-12 text-center text-gray-500 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            <p className="font-bold">実績データを集計中...</p>
          </div>
        ) : !data || data.rows.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border p-12 text-center text-gray-500 space-y-3">
            <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto" />
            <p className="font-bold text-base text-gray-700">{targetDate} の販売オーダーまたはロス記録が見つかりません。</p>
            <p className="text-xs text-gray-400">
              トップ画面の「オーダー表 一括読込」から当日の発注を取り込むか、日付を変更してください。
            </p>
          </div>
        ) : (
          <>
            {/* ===== トップ サマリー指標（Excel 2〜6行目相当） ＋ AI分析カード ===== */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* 指標カード（2カラム分） */}
              <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border p-4 sm:p-5">
                <div className="flex items-center justify-between pb-3 border-b mb-3.5">
                  <h2 className="text-sm sm:text-base font-extrabold text-gray-800 flex items-center gap-1.5">
                    <span>{data.targetDate}</span>
                    <span className="text-emerald-700">（{data.dayLabel}）</span>
                    <span className="text-gray-500 text-xs font-normal">販売・ロスサマリー</span>
                  </h2>
                  <div className="text-xs text-gray-500 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>営業時間: {data.todayHours.open} 〜 {data.todayHours.close}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {/* 販売総額 */}
                  <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-xl p-3">
                    <span className="text-xs font-bold text-emerald-800">販売総額</span>
                    <p className="text-xl sm:text-2xl font-black text-emerald-950 tabular-nums mt-0.5">
                      ¥{data.summary.soldAmount.toLocaleString()}
                    </p>
                    <span className="text-[10px] text-emerald-700 font-medium">（税抜 売上実績）</span>
                  </div>

                  {/* 発注総額 */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <span className="text-xs font-bold text-slate-700">発注総額</span>
                    <p className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums mt-0.5">
                      ¥{data.summary.orderAmount.toLocaleString()}
                    </p>
                    <span className="text-[10px] text-slate-500 font-medium">（当初オーダー合計）</span>
                  </div>

                  {/* 納品総額（展開金額） */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <span className="text-xs font-bold text-slate-700">納品総額（展開）</span>
                    <p className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums mt-0.5">
                      ¥{data.summary.deliveryAmount.toLocaleString()}
                    </p>
                    <span className="text-[10px] text-slate-500 font-medium">（入荷増減反映後）</span>
                  </div>

                  {/* ロス総額 & ロス率 */}
                  <div className="bg-rose-50/80 border border-rose-200/80 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-rose-800">ロス総額</span>
                      <span className="text-xs font-black px-1.5 py-0.5 rounded-full bg-rose-200 text-rose-900 tabular-nums">
                        {(data.summary.wasteRate * 100).toFixed(2)}%
                      </span>
                    </div>
                    <p className="text-xl sm:text-2xl font-black text-rose-950 tabular-nums mt-0.5">
                      ¥{data.summary.wasteAmount.toLocaleString()}
                    </p>
                    <span className="text-[10px] text-rose-700 font-medium">（ロス総額 ÷ 販売総額）</span>
                  </div>

                  {/* 試食総額 & 試食率 */}
                  <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-800">試食総額</span>
                      <span className="text-xs font-black px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-900 tabular-nums">
                        {(data.summary.sampleRate * 100).toFixed(2)}%
                      </span>
                    </div>
                    <p className="text-xl sm:text-2xl font-black text-amber-950 tabular-nums mt-0.5">
                      ¥{data.summary.sampleAmount.toLocaleString()}
                    </p>
                    <span className="text-[10px] text-amber-700 font-medium">（試食総額 ÷ 販売総額）</span>
                  </div>

                  {/* 登録品目数 */}
                  <div className="bg-blue-50/80 border border-blue-200/80 rounded-xl p-3">
                    <span className="text-xs font-bold text-blue-800">取扱い商品数</span>
                    <p className="text-xl sm:text-2xl font-black text-blue-950 tabular-nums mt-0.5">
                      {data.rows.length} <span className="text-sm font-bold text-blue-800">品目</span>
                    </p>
                    <span className="text-[10px] text-blue-700 font-medium">（当日オーダー対象）</span>
                  </div>
                </div>
              </div>

              {/* AIコメントカード（1カラム分） */}
              <div className="bg-gradient-to-br from-indigo-50 via-white to-purple-50 rounded-2xl shadow-sm border border-indigo-200 p-4 sm:p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-2.5 border-b border-indigo-100 mb-3">
                    <div className="flex items-center gap-1.5 text-indigo-900">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      <h3 className="text-sm font-bold">AI経営分析コメント</h3>
                    </div>
                    <button
                      type="button"
                      disabled={analyzingAi}
                      onClick={handleGenerateAiAnalysis}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg shadow-xs transition-colors"
                      title="Geminiによる実績分析を実行"
                    >
                      {analyzingAi ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>分析中...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>{data.aiComment ? '再分析' : 'AI分析を実行'}</span>
                        </>
                      )}
                    </button>
                  </div>

                  {data.aiComment ? (
                    <div className="text-xs sm:text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-medium">
                      {data.aiComment}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-gray-400 space-y-2">
                      <Sparkles className="w-8 h-8 text-indigo-300 mx-auto" />
                      <p className="text-xs font-semibold text-gray-500">
                        店舗基礎データ（立地・営業時間）と完売時間・ロス実績を元に、AIが本日の改善アドバイスを作成します。
                      </p>
                      <button
                        type="button"
                        disabled={analyzingAi}
                        onClick={handleGenerateAiAnalysis}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow transition-colors inline-flex items-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        AI分析を実行する
                      </button>
                    </div>
                  )}
                </div>

                {data.locationCharacteristics && (
                  <div className="mt-3 pt-2.5 border-t border-indigo-100 flex items-start gap-1 text-[11px] text-indigo-900/80">
                    <Building2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-indigo-500" />
                    <span className="truncate" title={data.locationCharacteristics}>
                      立地特性: {data.locationCharacteristics}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* ===== 実績詳細テーブル（Excel 8行目〜準拠 15項目） ===== */}
            <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
              <div className="p-4 border-b bg-slate-50/70 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-base font-bold text-gray-900">商品別 詳細実績一覧</h3>
                  <p className="text-xs text-gray-500">
                    A〜O列（15項目）: オーダー・納品差分・販売・ロス・試食・完売グラフ
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span> 早期完売（営業時間50%以内）
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span> 通常完売
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span> 完売（ロス0）
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold">
                    <span className="w-2 h-2 rounded-full bg-slate-400"></span> 未完売（ロス有）
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse min-w-[1300px]">
                  <thead>
                    <tr className="bg-slate-100 text-gray-700 font-bold border-b border-gray-200 select-none">
                      <th className="py-2.5 px-2.5 text-left whitespace-nowrap">商品コード</th>
                      <th className="py-2.5 px-3 text-left whitespace-nowrap min-w-[12rem]">商品名</th>
                      <th className="py-2.5 px-2 text-right whitespace-nowrap">単価(税抜)</th>
                      <th className="py-2.5 px-2 text-right whitespace-nowrap">オーダー数</th>
                      <th className="py-2.5 px-2 text-right whitespace-nowrap">オーダー金額</th>
                      <th className="py-2.5 px-2 text-right whitespace-nowrap">納品差分</th>
                      <th className="py-2.5 px-2 text-right whitespace-nowrap bg-slate-200/60">展開金額</th>
                      <th className="py-2.5 px-2 text-right whitespace-nowrap bg-emerald-100/60 text-emerald-950">販売数</th>
                      <th className="py-2.5 px-2 text-right whitespace-nowrap bg-emerald-100/60 text-emerald-950">販売金額</th>
                      <th className="py-2.5 px-2 text-right whitespace-nowrap bg-rose-100/50 text-rose-950">ロス数</th>
                      <th className="py-2.5 px-2 text-right whitespace-nowrap bg-rose-100/50 text-rose-950">ロス金額</th>
                      <th className="py-2.5 px-2 text-right whitespace-nowrap bg-amber-100/50 text-amber-950">試食数</th>
                      <th className="py-2.5 px-2 text-right whitespace-nowrap bg-amber-100/50 text-amber-950">試食金額</th>
                      <th className="py-2.5 px-3 text-center whitespace-nowrap min-w-[11rem]">完売グラフ</th>
                      <th className="py-2.5 px-3 text-left whitespace-nowrap min-w-[10rem]">コメント</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.rows.map(row => {
                      return (
                        <tr
                          key={row.productCode}
                          className="hover:bg-slate-50/80 transition-colors odd:bg-white even:bg-slate-50/30"
                        >
                          {/* A列: 商品コード */}
                          <td className="py-2 px-2.5 font-mono text-gray-600 whitespace-nowrap">{row.productCode}</td>

                          {/* B列: 商品名 */}
                          <td className="py-2 px-3 font-bold text-gray-900 whitespace-nowrap">{row.productName}</td>

                          {/* C列: 単価 */}
                          <td className="py-2 px-2 text-right font-medium text-gray-700 tabular-nums">
                            {row.price.toLocaleString()}
                          </td>

                          {/* D列: オーダー数 */}
                          <td className="py-2 px-2 text-right font-bold text-gray-900 tabular-nums">
                            {row.orderQty > 0 ? row.orderQty : ''}
                          </td>

                          {/* E列: オーダー金額 */}
                          <td className="py-2 px-2 text-right font-medium text-gray-700 tabular-nums">
                            {row.orderAmount > 0 ? row.orderAmount.toLocaleString() : ''}
                          </td>

                          {/* F列: 納品差分 */}
                          <td className="py-2 px-2 text-right font-bold tabular-nums">
                            {row.deliveryDiff !== 0 ? (
                              <span
                                className={`px-1.5 py-0.5 rounded ${
                                  row.deliveryDiff < 0
                                    ? 'bg-red-100 text-red-700 font-black'
                                    : 'bg-blue-100 text-blue-700 font-black'
                                }`}
                              >
                                {row.deliveryDiff > 0 ? `+${row.deliveryDiff}` : row.deliveryDiff}
                              </span>
                            ) : (
                              ''
                            )}
                          </td>

                          {/* G列: 展開金額 */}
                          <td className="py-2 px-2 text-right font-bold text-slate-900 bg-slate-100/40 tabular-nums">
                            {row.actualDeliveryAmount > 0 ? row.actualDeliveryAmount.toLocaleString() : ''}
                          </td>

                          {/* H列: 販売数 */}
                          <td className="py-2 px-2 text-right font-black text-emerald-900 bg-emerald-50/40 tabular-nums">
                            {row.soldQty > 0 ? row.soldQty : ''}
                          </td>

                          {/* I列: 販売金額 */}
                          <td className="py-2 px-2 text-right font-black text-emerald-900 bg-emerald-50/40 tabular-nums">
                            {row.soldAmount > 0 ? row.soldAmount.toLocaleString() : ''}
                          </td>

                          {/* J列: ロス数 */}
                          <td className="py-2 px-2 text-right font-bold tabular-nums bg-rose-50/30">
                            {row.wasteCount > 0 ? (
                              <span className="text-rose-700 font-black">{row.wasteCount}</span>
                            ) : (
                              ''
                            )}
                          </td>

                          {/* K列: ロス金額 */}
                          <td className="py-2 px-2 text-right font-bold tabular-nums bg-rose-50/30">
                            {row.wasteAmount > 0 ? (
                              <span className="text-rose-700 font-black">{row.wasteAmount.toLocaleString()}</span>
                            ) : (
                              0
                            )}
                          </td>

                          {/* L列: 試食数 */}
                          <td className="py-2 px-2 text-right font-bold tabular-nums bg-amber-50/30">
                            {row.sampleCount > 0 ? (
                              <span className="text-amber-800 font-black">{row.sampleCount}</span>
                            ) : (
                              ''
                            )}
                          </td>

                          {/* M列: 試食金額 */}
                          <td className="py-2 px-2 text-right font-bold tabular-nums bg-amber-50/30">
                            {row.sampleAmount > 0 ? (
                              <span className="text-amber-800 font-black">{row.sampleAmount.toLocaleString()}</span>
                            ) : (
                              0
                            )}
                          </td>

                          {/* N列: 完売グラフ（全行で棒を表示、ロスがある場合は右にロス数を表示） */}
                          <td className="py-2 px-3">
                            {row.soldOutTime ? (
                              /* ① 完売時間がある商品 */
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[10px]">
                                  <span
                                    className={`font-black px-1.5 py-0.2 rounded ${
                                      row.soldOutStatus === 'early'
                                        ? 'bg-rose-100 text-rose-700'
                                        : 'bg-blue-100 text-blue-700'
                                    }`}
                                  >
                                    ⏰ {row.soldOutTime}
                                    {row.soldOutStatus === 'early' && ' (早期)'}
                                  </span>
                                  {row.wasteCount > 0 ? (
                                    <span className="font-black text-rose-700 bg-rose-100 px-1.5 py-0.2 rounded">
                                      ロス: {row.wasteCount}個
                                    </span>
                                  ) : (
                                    <span className="text-gray-400 font-mono">{row.soldOutPercent}%</span>
                                  )}
                                </div>
                                <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden relative">
                                  <div
                                    className={`h-full transition-all rounded-full ${
                                      row.soldOutStatus === 'early' ? 'bg-rose-500' : 'bg-blue-500'
                                    }`}
                                    style={{ width: `${Math.max(5, row.soldOutPercent)}%` }}
                                  />
                                </div>
                              </div>
                            ) : row.wasteCount > 0 ? (
                              /* ② ロスがある商品（未完売）: 棒を表示＋右にロス数を明瞭表示 */
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                                    未完売
                                  </span>
                                  <span className="font-black text-rose-700 bg-rose-100 px-1.5 py-0.2 rounded">
                                    ロス: {row.wasteCount}個
                                  </span>
                                </div>
                                <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden relative">
                                  <div className="h-full bg-slate-400 rounded-full w-full" />
                                </div>
                              </div>
                            ) : (
                              /* ③ ロスが0で完売時間が未記録の商品: 閉店まで完売（100%緑バー） */
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded">
                                    完売（時間未入力）
                                  </span>
                                  <span className="text-emerald-700 font-bold font-mono">100%</span>
                                </div>
                                <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden relative">
                                  <div className="h-full bg-emerald-400 rounded-full w-full" />
                                </div>
                              </div>
                            )}
                          </td>

                          {/* O列: コメント */}
                          <td className="py-2 px-3 text-gray-700">
                            {row.comment ? (
                              <div className="flex items-start gap-1">
                                <MessageSquare className="w-3 h-3 text-emerald-600 flex-shrink-0 mt-0.5" />
                                <span className="font-semibold">{row.comment}</span>
                              </div>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
