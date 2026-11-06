'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  AlertTriangle,
  Download,
  Building2,
  RefreshCw,
  BarChart3,
  Trophy,
  AlertOctagon,
  Timer,
  Layers,
  Store,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import LossTrendChart from '@/components/analytics/LossTrendChart';
import { getWeekInfoFromDate } from '@/lib/lossWeekUtils';

// ==========================================
// 型定義
// ==========================================

// 日次モード用型定義
interface DailySummaryData {
  soldAmount: number;
  orderAmount: number;
  deliveryAmount: number;
  wasteAmount: number;
  wasteRate: number;
  sampleAmount: number;
  sampleRate: number;
}

interface DailyAnalyticsRow {
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

interface DailyAnalyticsData {
  mode: 'day';
  store: { id: number; name: string; code: string; isAllStores?: boolean };
  targetDate: string;
  dayLabel: string;
  dayJaLabel: string;
  todayHours: { open: string; close: string; closed: boolean };
  locationCharacteristics: string;
  summary: DailySummaryData;
  rows: DailyAnalyticsRow[];
  aiComment: string | null;
  aiUpdatedAt: string | null;
}

// 期間（週・月・年）モード用型定義
interface PeriodMetric {
  soldAmount: number;
  orderAmount: number;
  deliveryAmount: number;
  wasteAmount: number;
  wasteRate: number;
  sampleAmount: number;
  sampleRate: number;
}

interface PeriodSegment {
  key: string;
  label: string;
  shortLabel: string;
  metrics: PeriodMetric;
}

interface TopSalesItem {
  rank: number;
  productCode: string;
  productName: string;
  category: string;
  soldQty: number;
  soldAmount: number;
}

interface TopWasteItem {
  rank: number;
  productCode: string;
  productName: string;
  category: string;
  wasteCount: number;
  wasteAmount: number;
  wasteRate: number;
}

interface TopEarlySoldOutItem {
  rank: number;
  productCode: string;
  productName: string;
  targetDate: string;
  dayJaLabel: string;
  soldOutTime: string;
  storeName?: string;
}

interface CategoryBreakdownItem {
  category: string;
  totalSoldAmount: number;
  totalWasteAmount: number;
  wasteRate: number;
  segmentValues: { soldAmount: number; wasteAmount: number; wasteRate: number }[];
}

interface PeriodAnalyticsData {
  mode: 'week' | 'month' | 'year';
  periodLabel: string;
  period: {
    mode: 'week' | 'month' | 'year';
    year: number;
    week: number | null;
    month: number | null;
    startDate: string;
    endDate: string;
    totalWeeks: number | null;
  };
  store: {
    id: number | 'all';
    name: string;
    code: string;
    isAllStores: boolean;
    storeCount?: number;
  };
  summary: PeriodMetric;
  segments: PeriodSegment[];
  rankings: {
    topSales: TopSalesItem[];
    topWaste: TopWasteItem[];
    topEarlySoldOut: TopEarlySoldOutItem[];
  };
  categoryBreakdown: CategoryBreakdownItem[];
}

// ==========================================
// メインコンポーネント
// ==========================================
export default function LossAnalyticsPage() {
  const { user, stores, activeStoreId } = useAuth();
  const canSwitchStore =
    user?.role === 'company_loss_manager' || user?.role === 'admin' || user?.role === 'super_admin';

  // 表示モード (day | week | month | year)
  const [mode, setMode] = useState<'day' | 'week' | 'month' | 'year'>('week');

  // 店舗選択 (ロスマネージャーの場合: 'all' または storeId)
  const [selectedStoreId, setSelectedStoreId] = useState<string>(() => {
    return activeStoreId ? String(activeStoreId) : 'all';
  });

  // 日次モード用日付 (YYYY-MM-DD)
  const [targetDate, setTargetDate] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });

  // 期間モード用 (年, 週, 月)
  const now = new Date();
  const currentWeekInfo = useMemo(() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return getWeekInfoFromDate(`${y}-${m}-${d}`);
  }, []);

  const [targetYear, setTargetYear] = useState<number>(currentWeekInfo.year);
  const [targetWeek, setTargetWeek] = useState<number>(currentWeekInfo.week);
  const [targetMonth, setTargetMonth] = useState<number>(now.getMonth() + 1);

  // データとローディング
  const [dayData, setDayData] = useState<DailyAnalyticsData | null>(null);
  const [periodData, setPeriodData] = useState<PeriodAnalyticsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [analyzingAi, setAnalyzingAi] = useState<boolean>(false);

  // データフェッチ
  useEffect(() => {
    fetchAnalytics();
  }, [mode, selectedStoreId, targetDate, targetYear, targetWeek, targetMonth]);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `/api/loss-analytics?mode=${mode}`;
      if (canSwitchStore && selectedStoreId) {
        url += `&storeId=${selectedStoreId}`;
      }

      if (mode === 'day') {
        url += `&date=${targetDate}`;
        const res = await fetch(url);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || '実績データの取得に失敗しました');
        setDayData(json);
        setPeriodData(null);
      } else {
        url += `&year=${targetYear}`;
        if (mode === 'week') url += `&week=${targetWeek}`;
        if (mode === 'month') url += `&month=${targetMonth}`;
        const res = await fetch(url);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || '実績データの取得に失敗しました');
        setPeriodData(json);
        setDayData(null);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 日次ナビゲーション
  const changeDate = (days: number) => {
    const [y, m, d] = targetDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    const nextY = dt.getUTCFullYear();
    const nextM = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const nextD = String(dt.getUTCDate()).padStart(2, '0');
    setTargetDate(`${nextY}-${nextM}-${nextD}`);
  };

  // 週ナビゲーション
  const changeWeek = (delta: number) => {
    const totalWeeks = periodData?.period?.totalWeeks || 52;
    let nextWeek = targetWeek + delta;
    let nextYear = targetYear;
    if (nextWeek < 1) {
      nextYear -= 1;
      nextWeek = 52;
    } else if (nextWeek > totalWeeks) {
      nextYear += 1;
      nextWeek = 1;
    }
    setTargetYear(nextYear);
    setTargetWeek(nextWeek);
  };

  // 月ナビゲーション
  const changeMonth = (delta: number) => {
    let nextM = targetMonth + delta;
    let nextYear = targetYear;
    if (nextM < 1) {
      nextYear -= 1;
      nextM = 12;
    } else if (nextM > 12) {
      nextYear += 1;
      nextM = 1;
    }
    setTargetYear(nextYear);
    setTargetMonth(nextM);
  };

  // 年ナビゲーション
  const changeYear = (delta: number) => {
    setTargetYear(prev => prev + delta);
  };

  // 日次AIコメント生成
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

      setDayData(prev =>
        prev ? { ...prev, aiComment: json.aiComment, aiUpdatedAt: new Date().toISOString() } : null
      );
    } catch (err: any) {
      console.error(err);
      alert(`AI分析に失敗しました: ${err.message}`);
    } finally {
      setAnalyzingAi(false);
    }
  };

  // CSVダウンロード
  const handleExportCsv = () => {
    if (mode === 'day') {
      if (!dayData || dayData.rows.length === 0) return;
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
        `"${dayData.targetDate}（${dayData.dayLabel}）実績データ - ${dayData.store.name}"`,
        `"販売総額",${dayData.summary.soldAmount},"発注総額",${dayData.summary.orderAmount},"納品総額",${dayData.summary.deliveryAmount}`,
        `"ロス総額",${dayData.summary.wasteAmount},"ロス率",${(dayData.summary.wasteRate * 100).toFixed(2)}%`,
        `"試食総額",${dayData.summary.sampleAmount},"試食率",${(dayData.summary.sampleRate * 100).toFixed(2)}%`,
        '',
        headers.map(h => `"${h}"`).join(','),
        ...dayData.rows.map(r =>
          [
            r.productCode,
            `"${r.productName.replace(/"/g, '""')}"`,
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
      downloadCsvFile(lines, `実績解析_${dayData.store.name}_${dayData.targetDate}.csv`);
    } else {
      // 週次・月次・年次（エクセルフォーマット完全準拠）
      if (!periodData) return;
      const { periodLabel, store, summary, segments, rankings, categoryBreakdown } = periodData;

      const lines: string[] = [];

      // 1行目: 表題
      lines.push(`"${periodLabel}‐${store.name}"`);

      // 2〜4行目: 上部サマリー
      lines.push(
        `"販売総額",${summary.soldAmount},"発注総額",${summary.orderAmount},"納品総額",${summary.deliveryAmount}`
      );
      lines.push(`"ロス総額",${summary.wasteAmount},"ロス率","${(summary.wasteRate * 100).toFixed(2)}%"`);
      lines.push(`"試食総額",${summary.sampleAmount},"試食率","${(summary.sampleRate * 100).toFixed(2)}%"`);
      lines.push('');

      // 6〜14行目: 推移表（横軸: セグメント）
      const segHeaders = segments.map(s => `"${s.label}"`);
      lines.push([`""`, ...segHeaders, `"合計"`].join(','));

      lines.push(
        [`"販売総額"`, ...segments.map(s => s.metrics.soldAmount), summary.soldAmount].join(',')
      );
      lines.push(
        [`"発注総額"`, ...segments.map(s => s.metrics.orderAmount), summary.orderAmount].join(',')
      );
      lines.push(
        [`"納品総額"`, ...segments.map(s => s.metrics.deliveryAmount), summary.deliveryAmount].join(',')
      );
      lines.push(
        [`"ロス総額"`, ...segments.map(s => s.metrics.wasteAmount), summary.wasteAmount].join(',')
      );
      lines.push(
        [
          `"ロス率"`,
          ...segments.map(s => `"${(s.metrics.wasteRate * 100).toFixed(2)}%"`),
          `"${(summary.wasteRate * 100).toFixed(2)}%"`,
        ].join(',')
      );
      lines.push(
        [`"試食総額"`, ...segments.map(s => s.metrics.sampleAmount), summary.sampleAmount].join(',')
      );
      lines.push(
        [
          `"試食率"`,
          ...segments.map(s => `"${(s.metrics.sampleRate * 100).toFixed(2)}%"`),
          `"${(summary.sampleRate * 100).toFixed(2)}%"`,
        ].join(',')
      );
      lines.push('');

      // ランキング
      // 売上TOP5
      for (let i = 0; i < 5; i++) {
        const item = rankings.topSales[i];
        if (item) {
          lines.push(`"売上${i + 1}位商品","${item.productName}",${item.soldAmount},"${item.soldQty}個"`);
        } else {
          lines.push(`"売上${i + 1}位商品","-"`);
        }
      }

      // ロス額TOP5
      for (let i = 0; i < 5; i++) {
        const item = rankings.topWaste[i];
        if (item) {
          lines.push(
            `"ロス額${i + 1}位商品","${item.productName}",${item.wasteAmount},"${item.wasteCount}個","${(item.wasteRate * 100).toFixed(2)}%"`
          );
        } else {
          lines.push(`"ロス額${i + 1}位商品","-"`);
        }
      }

      // 早期完売TOP5
      for (let i = 0; i < 5; i++) {
        const item = rankings.topEarlySoldOut[i];
        if (item) {
          const storeInfo = item.storeName ? ` (${item.storeName})` : '';
          lines.push(
            `"早期完売${i + 1}位商品","${item.productName}","${item.targetDate}(${item.dayJaLabel}) ${item.soldOutTime}${storeInfo}"`
          );
        } else {
          lines.push(`"早期完売${i + 1}位商品","-"`);
        }
      }
      lines.push('');

      // カテゴリー別集計
      lines.push(`"カテゴリー別"`);
      for (const cat of categoryBreakdown) {
        lines.push(
          [
            `"「${cat.category}」合計"`,
            ...cat.segmentValues.map(v => v.soldAmount),
            cat.totalSoldAmount,
          ].join(',')
        );
        lines.push(
          [
            `"「${cat.category}」ロス率"`,
            ...cat.segmentValues.map(v => `"${(v.wasteRate * 100).toFixed(2)}%"`),
            `"${(cat.wasteRate * 100).toFixed(2)}%"`,
          ].join(',')
        );
      }

      const fileName = `実績解析_${store.name}_${periodLabel.replace(/\s+/g, '_')}.csv`;
      downloadCsvFile(lines, fileName);
    }
  };

  const downloadCsvFile = (lines: string[], fileName: string) => {
    const bom = '\uFEFF';
    const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 -mx-4 -mt-4 sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8">
      {/* 画面上部ヘッダーバー */}
      <div className="bg-white border-b px-4 py-3 shadow-xs sticky top-0 z-20 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* 左側: 戻る ＋ タイトル ＋ モード切替タブ */}
          <div className="flex items-center gap-3 flex-wrap">
            <Link
              href="/"
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              title="トップへ戻る"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black text-gray-900 flex items-center gap-1.5">
                  <BarChart3 className="w-5 h-5 text-emerald-600" />
                  <span>販売実績解析</span>
                </h1>
              </div>
            </div>

            {/* モード切替タブ (日次・週次・月次・年次) */}
            <div className="inline-flex p-1 bg-gray-100 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setMode('day')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  mode === 'day'
                    ? 'bg-white text-emerald-800 shadow-xs font-black'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                日次
              </button>
              <button
                type="button"
                onClick={() => setMode('week')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  mode === 'week'
                    ? 'bg-white text-emerald-800 shadow-xs font-black'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                週次
              </button>
              <button
                type="button"
                onClick={() => setMode('month')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  mode === 'month'
                    ? 'bg-white text-emerald-800 shadow-xs font-black'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                月次
              </button>
              <button
                type="button"
                onClick={() => setMode('year')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  mode === 'year'
                    ? 'bg-white text-emerald-800 shadow-xs font-black'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                年次
              </button>
            </div>
          </div>

          {/* 右側: 店舗選択（ロスマネージャーのみ） ＋ 期間セレクタ ＋ CSV出力 */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* ロスマネージャー向け店舗切り替え */}
            {canSwitchStore && (
              <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl px-2.5 py-1">
                <Store className="w-3.5 h-3.5 text-emerald-700" />
                <select
                  value={selectedStoreId}
                  onChange={e => setSelectedStoreId(e.target.value)}
                  className="bg-transparent text-xs font-black text-emerald-900 outline-none cursor-pointer"
                >
                  <option value="all">🏢 全店舗合算</option>
                  {stores.map(s => (
                    <option key={s.id} value={String(s.id)}>
                      {s.store_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 期間ナビゲーションコントロール */}
            {mode === 'day' && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => changeDate(-1)}
                  className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
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
                    className="bg-transparent text-xs sm:text-sm font-bold text-gray-800 outline-none cursor-pointer"
                  />
                  {dayData && (
                    <span className="text-xs font-bold text-emerald-700 ml-1">
                      （{dayData.dayJaLabel}）
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => changeDate(1)}
                  className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                  title="翌日へ"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {mode === 'week' && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => changeWeek(-1)}
                  className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                  title="前週へ"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="bg-gray-50 border rounded-lg px-3 py-1 text-xs sm:text-sm font-black text-gray-800 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-gray-500" />
                  <span>
                    {targetYear}年 第{targetWeek}週
                  </span>
                  {periodData && (
                    <span className="text-[11px] font-semibold text-gray-500">
                      ({periodData.period.startDate.slice(5)} 〜 {periodData.period.endDate.slice(5)})
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => changeWeek(1)}
                  className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                  title="翌週へ"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {mode === 'month' && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => changeMonth(-1)}
                  className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                  title="前月へ"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="bg-gray-50 border rounded-lg px-3 py-1 text-xs sm:text-sm font-black text-gray-800 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-gray-500" />
                  <span>
                    {targetYear}年 {targetMonth}月
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => changeMonth(1)}
                  className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                  title="翌月へ"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {mode === 'year' && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => changeYear(-1)}
                  className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                  title="前年へ"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="bg-gray-50 border rounded-lg px-3 py-1 text-xs sm:text-sm font-black text-gray-800 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-gray-500" />
                  <span>{targetYear}年</span>
                </div>
                <button
                  type="button"
                  onClick={() => changeYear(1)}
                  className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                  title="翌年へ"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* CSV出力ボタン */}
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={loading || (mode === 'day' ? !dayData : !periodData)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
              title="CSV形式でダウンロード"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV出力</span>
            </button>
          </div>
        </div>

        {/* サブバー: 対象店舗情報 */}
        <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
          <div className="flex items-center gap-1.5">
            <span>対象店舗:</span>
            {periodData?.store.isAllStores ? (
              <span className="font-extrabold px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 flex items-center gap-1">
                <span>🏢 全店舗合算</span>
                <span className="text-[10px] font-normal">({periodData.store.storeCount}店舗)</span>
              </span>
            ) : (
              <span className="font-extrabold text-emerald-800">
                {mode === 'day' ? dayData?.store.name || '...' : periodData?.store.name || '...'}
              </span>
            )}
          </div>
          <div className="text-[11px] text-gray-400">
            {mode === 'day' && '日次明細・AI分析'}
            {mode === 'week' && '週別7日間（月〜日）の推移・集計'}
            {mode === 'month' && '月別（各週）の推移・集計'}
            {mode === 'year' && '年間（1〜12月）の推移・集計'}
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
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
        ) : mode === 'day' ? (
          /* =========================================================
             A. 日次モード（従来の詳細テーブル ＋ AIコメントカード）
             ========================================================= */
          !dayData || dayData.rows.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border p-12 text-center text-gray-500 space-y-3">
              <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="font-bold text-base text-gray-700">
                {targetDate} の販売オーダーまたはロス記録が見つかりません。
              </p>
              <p className="text-xs text-gray-400">
                トップ画面の「オーダー表 一括読込」から当日の発注を取り込むか、日付を変更してください。
              </p>
            </div>
          ) : (
            <>
              {/* 日次トップ サマリー指標 ＋ AI分析カード */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border p-4 sm:p-5">
                  <div className="flex items-center justify-between pb-3 border-b mb-3.5">
                    <h2 className="text-sm sm:text-base font-extrabold text-gray-800 flex items-center gap-1.5">
                      <span>{dayData.targetDate}</span>
                      <span className="text-emerald-700">（{dayData.dayLabel}）</span>
                      <span className="text-gray-500 text-xs font-normal">販売・ロスサマリー</span>
                    </h2>
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        営業時間: {dayData.todayHours.open} 〜 {dayData.todayHours.close}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-xl p-3">
                      <span className="text-xs font-bold text-emerald-800">販売総額</span>
                      <p className="text-xl sm:text-2xl font-black text-emerald-950 tabular-nums mt-0.5">
                        ¥{dayData.summary.soldAmount.toLocaleString()}
                      </p>
                      <span className="text-[10px] text-emerald-700 font-medium">（税抜 売上実績）</span>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <span className="text-xs font-bold text-slate-700">発注総額</span>
                      <p className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums mt-0.5">
                        ¥{dayData.summary.orderAmount.toLocaleString()}
                      </p>
                      <span className="text-[10px] text-slate-500 font-medium">（当初オーダー合計）</span>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <span className="text-xs font-bold text-slate-700">納品総額（展開）</span>
                      <p className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums mt-0.5">
                        ¥{dayData.summary.deliveryAmount.toLocaleString()}
                      </p>
                      <span className="text-[10px] text-slate-500 font-medium">（入荷増減反映後）</span>
                    </div>

                    <div className="bg-rose-50/80 border border-rose-200/80 rounded-xl p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-rose-800">ロス総額</span>
                        <span className="text-xs font-black px-1.5 py-0.5 rounded-full bg-rose-200 text-rose-900 tabular-nums">
                          {(dayData.summary.wasteRate * 100).toFixed(2)}%
                        </span>
                      </div>
                      <p className="text-xl sm:text-2xl font-black text-rose-950 tabular-nums mt-0.5">
                        ¥{dayData.summary.wasteAmount.toLocaleString()}
                      </p>
                      <span className="text-[10px] text-rose-700 font-medium">（ロス総額 ÷ 販売総額）</span>
                    </div>

                    <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-800">試食総額</span>
                        <span className="text-xs font-black px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-900 tabular-nums">
                          {(dayData.summary.sampleRate * 100).toFixed(2)}%
                        </span>
                      </div>
                      <p className="text-xl sm:text-2xl font-black text-amber-950 tabular-nums mt-0.5">
                        ¥{dayData.summary.sampleAmount.toLocaleString()}
                      </p>
                      <span className="text-[10px] text-amber-700 font-medium">（試食総額 ÷ 販売総額）</span>
                    </div>

                    <div className="bg-blue-50/80 border border-blue-200/80 rounded-xl p-3">
                      <span className="text-xs font-bold text-blue-800">取扱い商品数</span>
                      <p className="text-xl sm:text-2xl font-black text-blue-950 tabular-nums mt-0.5">
                        {dayData.rows.length} <span className="text-sm font-bold text-blue-800">品目</span>
                      </p>
                      <span className="text-[10px] text-blue-700 font-medium">（当日オーダー対象）</span>
                    </div>
                  </div>
                </div>

                {/* AI分析カード */}
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
                            <span>{dayData.aiComment ? '再分析' : 'AI分析を実行'}</span>
                          </>
                        )}
                      </button>
                    </div>

                    {dayData.aiComment ? (
                      <div className="text-xs sm:text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-medium">
                        {dayData.aiComment}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-gray-400 space-y-2">
                        <Sparkles className="w-8 h-8 text-indigo-300 mx-auto" />
                        <p className="text-xs font-semibold text-gray-500">
                          店舗基礎データと完売時間・ロス実績を元に、AIが本日の改善アドバイスを作成します。
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

                  {dayData.locationCharacteristics && (
                    <div className="mt-3 pt-2.5 border-t border-indigo-100 flex items-start gap-1 text-[11px] text-indigo-900/80">
                      <Building2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-indigo-500" />
                      <span className="truncate" title={dayData.locationCharacteristics}>
                        立地特性: {dayData.locationCharacteristics}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 日次商品別 詳細実績テーブル */}
              <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b bg-slate-50/70 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">商品別 詳細実績一覧</h3>
                    <p className="text-xs text-gray-500">
                      A〜O列（15項目）: オーダー・納品差分・販売・ロス・試食・完売グラフ
                    </p>
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
                        <th className="py-2.5 px-2 text-right whitespace-nowrap bg-emerald-100/60 text-emerald-950">
                          販売数
                        </th>
                        <th className="py-2.5 px-2 text-right whitespace-nowrap bg-emerald-100/60 text-emerald-950">
                          販売金額
                        </th>
                        <th className="py-2.5 px-2 text-right whitespace-nowrap bg-rose-100/50 text-rose-950">
                          ロス数
                        </th>
                        <th className="py-2.5 px-2 text-right whitespace-nowrap bg-rose-100/50 text-rose-950">
                          ロス金額
                        </th>
                        <th className="py-2.5 px-2 text-right whitespace-nowrap bg-amber-100/50 text-amber-950">
                          試食数
                        </th>
                        <th className="py-2.5 px-2 text-right whitespace-nowrap bg-amber-100/50 text-amber-950">
                          試食金額
                        </th>
                        <th className="py-2.5 px-3 text-center whitespace-nowrap min-w-[11rem]">完売グラフ</th>
                        <th className="py-2.5 px-3 text-left whitespace-nowrap min-w-[10rem]">コメント</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {dayData.rows.map(row => (
                        <tr
                          key={row.productCode}
                          className="hover:bg-slate-50/80 transition-colors odd:bg-white even:bg-slate-50/30"
                        >
                          <td className="py-2 px-2.5 font-mono text-gray-600 whitespace-nowrap">
                            {row.productCode}
                          </td>
                          <td className="py-2 px-3 font-bold text-gray-900 whitespace-nowrap">
                            {row.productName}
                          </td>
                          <td className="py-2 px-2 text-right font-medium text-gray-700 tabular-nums">
                            {row.price.toLocaleString()}
                          </td>
                          <td className="py-2 px-2 text-right font-bold text-gray-900 tabular-nums">
                            {row.orderQty > 0 ? row.orderQty : ''}
                          </td>
                          <td className="py-2 px-2 text-right font-medium text-gray-700 tabular-nums">
                            {row.orderAmount > 0 ? row.orderAmount.toLocaleString() : ''}
                          </td>
                          <td
                            className={`py-2 px-2 text-right font-bold tabular-nums ${
                              row.deliveryDiff > 0
                                ? 'text-emerald-600'
                                : row.deliveryDiff < 0
                                ? 'text-rose-600'
                                : 'text-gray-400'
                            }`}
                          >
                            {row.deliveryDiff !== 0
                              ? (row.deliveryDiff > 0 ? `+${row.deliveryDiff}` : row.deliveryDiff)
                              : '-'}
                          </td>
                          <td className="py-2 px-2 text-right font-bold text-slate-800 bg-slate-100/50 tabular-nums">
                            {row.actualDeliveryAmount > 0 ? row.actualDeliveryAmount.toLocaleString() : ''}
                          </td>
                          <td className="py-2 px-2 text-right font-bold text-emerald-950 bg-emerald-50/50 tabular-nums">
                            {row.soldQty > 0 ? row.soldQty : 0}
                          </td>
                          <td className="py-2 px-2 text-right font-black text-emerald-900 bg-emerald-50/50 tabular-nums">
                            {row.soldAmount > 0 ? row.soldAmount.toLocaleString() : 0}
                          </td>
                          <td
                            className={`py-2 px-2 text-right font-bold tabular-nums bg-rose-50/40 ${
                              row.wasteCount > 0 ? 'text-rose-950 font-black' : 'text-gray-400'
                            }`}
                          >
                            {row.wasteCount > 0 ? row.wasteCount : '-'}
                          </td>
                          <td
                            className={`py-2 px-2 text-right font-bold tabular-nums bg-rose-50/40 ${
                              row.wasteAmount > 0 ? 'text-rose-900 font-black' : 'text-gray-400'
                            }`}
                          >
                            {row.wasteAmount > 0 ? row.wasteAmount.toLocaleString() : '-'}
                          </td>
                          <td className="py-2 px-2 text-right font-medium text-amber-900 bg-amber-50/40 tabular-nums">
                            {row.sampleCount > 0 ? row.sampleCount : '-'}
                          </td>
                          <td className="py-2 px-2 text-right font-medium text-amber-900 bg-amber-50/40 tabular-nums">
                            {row.sampleAmount > 0 ? row.sampleAmount.toLocaleString() : '-'}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {row.soldOutStatus === 'not_sold_out' ? (
                              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                未完売（ロス有）
                              </span>
                            ) : row.soldOutTime ? (
                              <div className="flex items-center gap-1.5 justify-center">
                                <span
                                  className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${
                                    row.soldOutStatus === 'early'
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-blue-100 text-blue-800'
                                  }`}
                                >
                                  {row.soldOutTime}
                                </span>
                              </div>
                            ) : row.wasteCount === 0 && row.soldQty > 0 ? (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                                完売 (ロス0)
                              </span>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-gray-700 truncate max-w-[12rem]" title={row.comment}>
                            {row.comment || ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )
        ) : (
          /* =========================================================
             B. 期間モード（週次・月次・年次：エクセル仕様準拠）
             ========================================================= */
          !periodData ? (
            <div className="bg-white rounded-2xl shadow-sm border p-12 text-center text-gray-500">
              データが見つかりませんでした。
            </div>
          ) : (
            <>
              {/* ① 最上部サマリー（全期間合計カード: Excel 2〜6行目相当） */}
              <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-4">
                <div className="flex items-center justify-between border-b pb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-100 text-emerald-800">
                      {mode === 'week' ? '週次実績' : mode === 'month' ? '月次実績' : '年次実績'}
                    </span>
                    <h2 className="text-base sm:text-lg font-black text-gray-900">
                      {periodData.periodLabel}
                    </h2>
                    <span className="text-xs font-bold text-gray-500">
                      （{periodData.store.name}）
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    対象期間: {periodData.period.startDate} 〜 {periodData.period.endDate}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {/* 販売総額 */}
                  <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-xl p-3.5">
                    <span className="text-xs font-bold text-emerald-800">販売総額</span>
                    <p className="text-xl sm:text-2xl font-black text-emerald-950 tabular-nums mt-0.5">
                      ¥{periodData.summary.soldAmount.toLocaleString()}
                    </p>
                    <span className="text-[10px] text-emerald-700 font-medium">（期間売上合計）</span>
                  </div>

                  {/* 発注総額 */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                    <span className="text-xs font-bold text-slate-700">発注総額</span>
                    <p className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums mt-0.5">
                      ¥{periodData.summary.orderAmount.toLocaleString()}
                    </p>
                    <span className="text-[10px] text-slate-500 font-medium">（当初オーダー合計）</span>
                  </div>

                  {/* 納品総額 */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                    <span className="text-xs font-bold text-slate-700">納品総額（展開）</span>
                    <p className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums mt-0.5">
                      ¥{periodData.summary.deliveryAmount.toLocaleString()}
                    </p>
                    <span className="text-[10px] text-slate-500 font-medium">（入荷増減反映後）</span>
                  </div>

                  {/* ロス総額 & ロス率 */}
                  <div className="bg-rose-50/80 border border-rose-200/80 rounded-xl p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-rose-800">ロス総額</span>
                      <span className="text-xs font-black px-1.5 py-0.5 rounded-full bg-rose-200 text-rose-900 tabular-nums">
                        {(periodData.summary.wasteRate * 100).toFixed(2)}%
                      </span>
                    </div>
                    <p className="text-xl sm:text-2xl font-black text-rose-950 tabular-nums mt-0.5">
                      ¥{periodData.summary.wasteAmount.toLocaleString()}
                    </p>
                    <span className="text-[10px] text-rose-700 font-medium">（期間ロス総額）</span>
                  </div>

                  {/* 試食総額 & 試食率 */}
                  <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-800">試食総額</span>
                      <span className="text-xs font-black px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-900 tabular-nums">
                        {(periodData.summary.sampleRate * 100).toFixed(2)}%
                      </span>
                    </div>
                    <p className="text-xl sm:text-2xl font-black text-amber-950 tabular-nums mt-0.5">
                      ¥{periodData.summary.sampleAmount.toLocaleString()}
                    </p>
                    <span className="text-[10px] text-amber-700 font-medium">（期間試食総額）</span>
                  </div>
                </div>
              </div>

              {/* ② 期間推移テーブル（Excel 7〜14行目相当） */}
              <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b bg-slate-50/70 flex items-center justify-between">
                  <h3 className="text-sm sm:text-base font-extrabold text-gray-900">
                    期間推移テーブル
                  </h3>
                  <span className="text-xs text-gray-500">
                    {mode === 'week' ? '曜日別' : mode === 'month' ? '週別' : '月別'}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse min-w-[700px]">
                    <thead>
                      <tr className="bg-slate-100 text-gray-700 font-bold border-b border-gray-200 select-none">
                        <th className="py-2.5 px-3 text-left whitespace-nowrap bg-slate-200/70 sticky left-0 z-10 min-w-[7rem]">
                          項目
                        </th>
                        {periodData.segments.map(seg => (
                          <th key={seg.key} className="py-2.5 px-3 text-right whitespace-nowrap">
                            {seg.label}
                          </th>
                        ))}
                        <th className="py-2.5 px-3 text-right whitespace-nowrap bg-slate-200/70 font-black">
                          合計
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                      {/* 販売総額 */}
                      <tr className="hover:bg-slate-50 transition-colors bg-emerald-50/20">
                        <td className="py-2.5 px-3 font-bold text-emerald-950 sticky left-0 bg-white/95 z-10 border-r">
                          販売総額
                        </td>
                        {periodData.segments.map(s => (
                          <td key={s.key} className="py-2.5 px-3 text-right tabular-nums text-emerald-950 font-bold">
                            ¥{s.metrics.soldAmount.toLocaleString()}
                          </td>
                        ))}
                        <td className="py-2.5 px-3 text-right tabular-nums font-black text-emerald-950 bg-emerald-100/40">
                          ¥{periodData.summary.soldAmount.toLocaleString()}
                        </td>
                      </tr>

                      {/* 発注総額 */}
                      <tr className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-gray-700 sticky left-0 bg-white/95 z-10 border-r">
                          発注総額
                        </td>
                        {periodData.segments.map(s => (
                          <td key={s.key} className="py-2.5 px-3 text-right tabular-nums text-gray-700">
                            ¥{s.metrics.orderAmount.toLocaleString()}
                          </td>
                        ))}
                        <td className="py-2.5 px-3 text-right tabular-nums font-bold text-gray-900 bg-slate-100/60">
                          ¥{periodData.summary.orderAmount.toLocaleString()}
                        </td>
                      </tr>

                      {/* 納品総額 */}
                      <tr className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-gray-700 sticky left-0 bg-white/95 z-10 border-r">
                          納品総額
                        </td>
                        {periodData.segments.map(s => (
                          <td key={s.key} className="py-2.5 px-3 text-right tabular-nums text-gray-700">
                            ¥{s.metrics.deliveryAmount.toLocaleString()}
                          </td>
                        ))}
                        <td className="py-2.5 px-3 text-right tabular-nums font-bold text-gray-900 bg-slate-100/60">
                          ¥{periodData.summary.deliveryAmount.toLocaleString()}
                        </td>
                      </tr>

                      {/* ロス総額 */}
                      <tr className="hover:bg-slate-50 transition-colors bg-rose-50/20">
                        <td className="py-2.5 px-3 font-bold text-rose-950 sticky left-0 bg-white/95 z-10 border-r">
                          ロス総額
                        </td>
                        {periodData.segments.map(s => (
                          <td key={s.key} className="py-2.5 px-3 text-right tabular-nums text-rose-950 font-bold">
                            ¥{s.metrics.wasteAmount.toLocaleString()}
                          </td>
                        ))}
                        <td className="py-2.5 px-3 text-right tabular-nums font-black text-rose-950 bg-rose-100/40">
                          ¥{periodData.summary.wasteAmount.toLocaleString()}
                        </td>
                      </tr>

                      {/* ロス率 */}
                      <tr className="hover:bg-slate-50 transition-colors bg-rose-50/30">
                        <td className="py-2.5 px-3 font-bold text-rose-950 sticky left-0 bg-white/95 z-10 border-r">
                          ロス率
                        </td>
                        {periodData.segments.map(s => (
                          <td key={s.key} className="py-2.5 px-3 text-right tabular-nums text-rose-900 font-extrabold">
                            {(s.metrics.wasteRate * 100).toFixed(2)}%
                          </td>
                        ))}
                        <td className="py-2.5 px-3 text-right tabular-nums font-black text-rose-900 bg-rose-200/50">
                          {(periodData.summary.wasteRate * 100).toFixed(2)}%
                        </td>
                      </tr>

                      {/* 試食総額 */}
                      <tr className="hover:bg-slate-50 transition-colors bg-amber-50/20">
                        <td className="py-2.5 px-3 font-bold text-amber-950 sticky left-0 bg-white/95 z-10 border-r">
                          試食総額
                        </td>
                        {periodData.segments.map(s => (
                          <td key={s.key} className="py-2.5 px-3 text-right tabular-nums text-amber-950">
                            ¥{s.metrics.sampleAmount.toLocaleString()}
                          </td>
                        ))}
                        <td className="py-2.5 px-3 text-right tabular-nums font-bold text-amber-950 bg-amber-100/40">
                          ¥{periodData.summary.sampleAmount.toLocaleString()}
                        </td>
                      </tr>

                      {/* 試食率 */}
                      <tr className="hover:bg-slate-50 transition-colors bg-amber-50/30">
                        <td className="py-2.5 px-3 font-bold text-amber-950 sticky left-0 bg-white/95 z-10 border-r">
                          試食率
                        </td>
                        {periodData.segments.map(s => (
                          <td key={s.key} className="py-2.5 px-3 text-right tabular-nums text-amber-900 font-bold">
                            {(s.metrics.sampleRate * 100).toFixed(2)}%
                          </td>
                        ))}
                        <td className="py-2.5 px-3 text-right tabular-nums font-black text-amber-900 bg-amber-200/50">
                          {(periodData.summary.sampleRate * 100).toFixed(2)}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ③ 推移グラフ（Excel 16行目「グラフ」相当） */}
              <LossTrendChart segments={periodData.segments} />

              {/* ④ ランキングセクション（3カラム） */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 売上TOP5 */}
                <div className="bg-white rounded-2xl shadow-sm border p-4 space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <div className="flex items-center gap-1.5 text-emerald-800">
                      <Trophy className="w-4 h-4 text-emerald-600" />
                      <h4 className="text-sm font-extrabold">売上TOP 5 商品</h4>
                    </div>
                    <span className="text-[10px] text-gray-400 font-bold">期間売上順</span>
                  </div>

                  {periodData.rankings.topSales.length === 0 ? (
                    <div className="py-8 text-center text-xs text-gray-400">データがありません</div>
                  ) : (
                    <div className="space-y-2">
                      {periodData.rankings.topSales.map(item => (
                        <div
                          key={item.productCode}
                          className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 hover:bg-emerald-50/50 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                                item.rank === 1
                                  ? 'bg-amber-400 text-amber-950'
                                  : item.rank === 2
                                  ? 'bg-slate-300 text-slate-800'
                                  : item.rank === 3
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {item.rank}
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-black text-gray-900 truncate">
                                {item.productName}
                              </p>
                              <span className="text-[10px] text-gray-400 font-medium">
                                {item.category}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0 font-mono">
                            <p className="text-xs font-black text-emerald-950">
                              ¥{item.soldAmount.toLocaleString()}
                            </p>
                            <span className="text-[10px] text-gray-500">
                              {item.soldQty.toLocaleString()}個
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ロス額ワーストTOP5 */}
                <div className="bg-white rounded-2xl shadow-sm border p-4 space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <div className="flex items-center gap-1.5 text-rose-800">
                      <AlertOctagon className="w-4 h-4 text-rose-600" />
                      <h4 className="text-sm font-extrabold">ロス額ワースト 5</h4>
                    </div>
                    <span className="text-[10px] text-gray-400 font-bold">期間ロス金額順</span>
                  </div>

                  {periodData.rankings.topWaste.length === 0 ? (
                    <div className="py-8 text-center text-xs text-gray-400">データがありません</div>
                  ) : (
                    <div className="space-y-2">
                      {periodData.rankings.topWaste.map(item => (
                        <div
                          key={item.productCode}
                          className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 hover:bg-rose-50/50 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                                item.rank === 1
                                  ? 'bg-rose-500 text-white'
                                  : item.rank === 2
                                  ? 'bg-rose-400 text-white'
                                  : 'bg-rose-200 text-rose-900'
                              }`}
                            >
                              {item.rank}
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-black text-gray-900 truncate">
                                {item.productName}
                              </p>
                              <span className="text-[10px] text-gray-400 font-medium">
                                {item.category}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0 font-mono">
                            <p className="text-xs font-black text-rose-950">
                              ¥{item.wasteAmount.toLocaleString()}
                            </p>
                            <span className="text-[10px] text-rose-700 font-bold">
                              {item.wasteCount}個 ({(item.wasteRate * 100).toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 早期完売TOP5（新機能！） */}
                <div className="bg-white rounded-2xl shadow-sm border p-4 space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <div className="flex items-center gap-1.5 text-blue-900">
                      <Timer className="w-4 h-4 text-blue-600" />
                      <h4 className="text-sm font-extrabold">早期完売TOP 5（機会ロス）</h4>
                    </div>
                    <span className="text-[10px] text-blue-600 font-bold">早い時刻順</span>
                  </div>

                  {periodData.rankings.topEarlySoldOut.length === 0 ? (
                    <div className="py-8 text-center text-xs text-gray-400">
                      完売時刻の記録がありません
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {periodData.rankings.topEarlySoldOut.map(item => (
                        <div
                          key={item.productCode}
                          className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 hover:bg-blue-50/50 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                                item.rank === 1
                                  ? 'bg-blue-600 text-white'
                                  : item.rank === 2
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-blue-200 text-blue-900'
                              }`}
                            >
                              {item.rank}
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-black text-gray-900 truncate">
                                {item.productName}
                              </p>
                              {item.storeName && (
                                <span className="text-[9px] font-bold text-purple-700 bg-purple-50 px-1 py-0.2 rounded-xs">
                                  {item.storeName}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-xs font-black px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-950 font-mono">
                              {item.soldOutTime} 完売
                            </span>
                            <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                              {item.targetDate.slice(5)} ({item.dayJaLabel})
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ⑤ カテゴリー別推移テーブル（Excel 29行目〜相当） */}
              <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b bg-slate-50/70 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-emerald-700" />
                    <h3 className="text-sm sm:text-base font-extrabold text-gray-900">
                      カテゴリー別 実績推移
                    </h3>
                  </div>
                  <span className="text-xs text-gray-500">販売総額 ＆ ロス率</span>
                </div>

                {periodData.categoryBreakdown.length === 0 ? (
                  <div className="p-8 text-center text-xs text-gray-400">
                    カテゴリー別データが見つかりませんでした。
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse min-w-[700px]">
                      <thead>
                        <tr className="bg-slate-100 text-gray-700 font-bold border-b border-gray-200 select-none">
                          <th className="py-2.5 px-3 text-left whitespace-nowrap bg-slate-200/70 sticky left-0 z-10 min-w-[10rem]">
                            カテゴリー / 項目
                          </th>
                          {periodData.segments.map(seg => (
                            <th key={seg.key} className="py-2.5 px-3 text-right whitespace-nowrap">
                              {seg.label}
                            </th>
                          ))}
                          <th className="py-2.5 px-3 text-right whitespace-nowrap bg-slate-200/70 font-black">
                            期間合計
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {periodData.categoryBreakdown.map((cat, catIdx) => (
                          <React.Fragment key={cat.category}>
                            {/* カテゴリー販売額 */}
                            <tr
                              className={`hover:bg-slate-50/80 transition-colors ${
                                catIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                              }`}
                            >
                              <td className="py-2.5 px-3 font-bold text-gray-900 sticky left-0 bg-white/95 z-10 border-r flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                <span>「{cat.category}」合計</span>
                              </td>
                              {cat.segmentValues.map((v, i) => (
                                <td
                                  key={i}
                                  className="py-2.5 px-3 text-right tabular-nums text-gray-900 font-medium"
                                >
                                  {v.soldAmount > 0 ? `¥${v.soldAmount.toLocaleString()}` : '-'}
                                </td>
                              ))}
                              <td className="py-2.5 px-3 text-right tabular-nums font-black text-emerald-950 bg-emerald-50/60">
                                ¥{cat.totalSoldAmount.toLocaleString()}
                              </td>
                            </tr>

                            {/* カテゴリーロス率 */}
                            <tr
                              className={`hover:bg-slate-50/80 transition-colors border-b-2 border-slate-100 ${
                                catIdx % 2 === 0 ? 'bg-rose-50/10' : 'bg-rose-50/20'
                              }`}
                            >
                              <td className="py-1.5 px-3 font-bold text-rose-800 text-[11px] sticky left-0 bg-white/95 z-10 border-r pl-6">
                                └ ロス率
                              </td>
                              {cat.segmentValues.map((v, i) => (
                                <td
                                  key={i}
                                  className="py-1.5 px-3 text-right tabular-nums text-rose-800 text-[11px] font-bold"
                                >
                                  {v.soldAmount > 0 ? `${(v.wasteRate * 100).toFixed(2)}%` : '-'}
                                </td>
                              ))}
                              <td className="py-1.5 px-3 text-right tabular-nums font-black text-rose-900 bg-rose-100/50 text-[11px]">
                                {(cat.wasteRate * 100).toFixed(2)}%
                              </td>
                            </tr>
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )
        )}
      </main>
    </div>
  );
}
