'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Camera, Save, Loader2, AlertCircle, MessageSquare, X, PlusCircle, RefreshCw, Sparkles } from 'lucide-react';

interface Product {
  product_code: string;
  product_name: string;
}

interface WasteRecord {
  productCode: string;
  productName: string;
  orderQuantity: number;
  wasteCount: number;
  soldOutTime: string;
  comment?: string;
  deliveryDiff?: number; // 納品差異（発注数との差分。例: -20）
  sampleCount?: number; // 試食で使用した数
  category?: string; // 商品カテゴリー
}

interface AiDetectedItem {
  product_code: string;
  product_name: string;
  count: number;
}

// 押しっぱなし（長押し）で連続実行するボタン
interface RepeatButtonProps {
  onAction: () => void;
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
}


// カテゴリーごとの自動配色パレット（背景・枠線・バッジ）
interface CategoryColorStyle {
  cardBg: string;
  cardBorder: string;
  badgeBg: string;
}

// 自由入力や新設カテゴリー用パレット
const DYNAMIC_PALETTES: CategoryColorStyle[] = [
  { cardBg: 'bg-amber-50/75', cardBorder: 'border-amber-200 hover:border-amber-400', badgeBg: 'bg-amber-200/80 text-amber-900 border-amber-300' },
  { cardBg: 'bg-yellow-50/75', cardBorder: 'border-yellow-200 hover:border-yellow-400', badgeBg: 'bg-yellow-200/80 text-yellow-900 border-yellow-300' },
  { cardBg: 'bg-emerald-50/70', cardBorder: 'border-emerald-200 hover:border-emerald-400', badgeBg: 'bg-emerald-200/80 text-emerald-900 border-emerald-300' },
  { cardBg: 'bg-rose-50/70', cardBorder: 'border-rose-200 hover:border-rose-400', badgeBg: 'bg-rose-200/80 text-rose-900 border-rose-300' },
  { cardBg: 'bg-sky-50/70', cardBorder: 'border-sky-200 hover:border-sky-400', badgeBg: 'bg-sky-200/80 text-sky-900 border-sky-300' },
  { cardBg: 'bg-orange-50/70', cardBorder: 'border-orange-200 hover:border-orange-400', badgeBg: 'bg-orange-200/80 text-orange-900 border-orange-300' },
  { cardBg: 'bg-purple-50/70', cardBorder: 'border-purple-200 hover:border-purple-400', badgeBg: 'bg-purple-200/80 text-purple-900 border-purple-300' },
  { cardBg: 'bg-teal-50/70', cardBorder: 'border-teal-200 hover:border-teal-400', badgeBg: 'bg-teal-200/80 text-teal-900 border-teal-300' },
  { cardBg: 'bg-lime-50/70', cardBorder: 'border-lime-200 hover:border-lime-400', badgeBg: 'bg-lime-200/80 text-lime-900 border-lime-300' },
  { cardBg: 'bg-indigo-50/70', cardBorder: 'border-indigo-200 hover:border-indigo-400', badgeBg: 'bg-indigo-200/80 text-indigo-900 border-indigo-300' },
];

function getCategoryStyle(category?: string, productCode?: string): CategoryColorStyle {
  const cat = String(category || '').trim();
  const code = String(productCode || '').trim().toUpperCase();

  // 1. カテゴリー名、または商品コードの頭2文字から主要プリセットを判定
  if (cat.includes('ハード') || code.startsWith('OH')) {
    return DYNAMIC_PALETTES[0]; // アンバー（小麦色）
  }
  if (cat.includes('ヴィエノ') || code.startsWith('OV')) {
    return DYNAMIC_PALETTES[1]; // イエロー（バター・クロワッサン）
  }
  if (cat.includes('サンド') || code.startsWith('OS')) {
    return DYNAMIC_PALETTES[2]; // エメラルド（新鮮なグリーン）
  }
  if (cat.includes('菓子パン') || cat.includes('焼き菓子') || code.startsWith('OP')) {
    return DYNAMIC_PALETTES[3]; // ローズ・ピンク（スイーツ）
  }
  if (cat.includes('食パン')) {
    return DYNAMIC_PALETTES[4]; // スカイ（清潔な青）
  }
  if (cat.includes('惣菜') || cat.includes('調理')) {
    return DYNAMIC_PALETTES[5]; // オレンジ（具材）
  }

  // 2. その他のカテゴリー文字列があればハッシュで自動決定（常に同じ色に決定）
  if (cat) {
    let hash = 0;
    for (let i = 0; i < cat.length; i++) {
      hash = (hash << 5) - hash + cat.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % DYNAMIC_PALETTES.length;
    return DYNAMIC_PALETTES[idx];
  }

  // 3. カテゴリー未設定
  return {
    cardBg: 'bg-white',
    cardBorder: 'border-gray-200 hover:border-gray-300',
    badgeBg: 'bg-gray-100 text-gray-700 border-gray-200',
  };
}

const RepeatButton: React.FC<RepeatButtonProps> = ({ onAction, className, children, disabled, ariaLabel }) => {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const stop = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timerRef.current = null;
    intervalRef.current = null;
  };

  const start = (e: React.PointerEvent) => {
    if (disabled) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    stop();
    onAction(); // 初回発火

    // 300ms長押し後に 80ms ごとに高速リピート
    timerRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        onAction();
      }, 80);
    }, 300);
  };

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={e => e.preventDefault()}
      className={`select-none touch-manipulation active:scale-95 transition-transform disabled:opacity-30 disabled:pointer-events-none ${className || ''}`}
    >
      {children}
    </button>
  );
};

export default function WasteCountPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [records, setRecords] = useState<WasteRecord[]>([]);
  const [targetDate, setTargetDate] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [captureMode, setCaptureMode] = useState<'overwrite' | 'add'>('overwrite');
  const [aiDetectedCodes, setAiDetectedCodes] = useState<Set<string>>(new Set());
  const [lastAiDetections, setLastAiDetections] = useState<AiDetectedItem[]>([]);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // コメント入力モーダル用の状態
  const [commentModalIndex, setCommentModalIndex] = useState<number | null>(null);
  const [tempComment, setTempComment] = useState<string>('');

  // 完売時間入力モーダル用の状態
  const [timeModalIndex, setTimeModalIndex] = useState<number | null>(null);
  const [tempTime, setTempTime] = useState<string>('');

  // 試食数入力モーダル用の状態
  const [sampleModalIndex, setSampleModalIndex] = useState<number | null>(null);
  const [tempSampleCount, setTempSampleCount] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 日付変更時はプレビューやAI検出バッジをクリア
    setImagePreview(null);
    setAiDetectedCodes(new Set());
    setLastAiDetections([]);
    setMessage(null);

    const fetchTargets = async () => {
      try {
        const res = await fetch(`/api/waste/targets?date=${targetDate}`);
        const data = await res.json();
        if (res.ok) {
          setRecords(data.records || []);
          setProducts((data.records || []).map((r: any) => ({
            product_code: r.productCode,
            product_name: r.productName
          })));
        } else {
          setMessage({ type: 'error', text: data.error || 'データの取得に失敗しました' });
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchTargets();
  }, [targetDate]);

  // カメラ起動トリガー（上書きモード or 追加合算モード）
  const triggerCamera = (mode: 'overwrite' | 'add') => {
    setCaptureMode(mode);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  // 画像選択＆AI解析（1024px・品質0.75で高速送信＆認識を両立）
  const handleImageCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMessage(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1024;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.75);
        setImagePreview(compressedBase64);
        analyzeImage(compressedBase64, captureMode);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const analyzeImage = async (base64Data: string, mode: 'overwrite' | 'add') => {
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/vision/count-waste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64Data,
          products: products
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '解析に失敗しました');

      const aiResults: AiDetectedItem[] = data.result || [];
      setLastAiDetections(aiResults);

      if (aiResults.length === 0) {
        setMessage({
          type: 'error',
          text: '写真から対象リストのパンを認識できませんでした。もう少し棚に近づいて撮影するか、手動で入力してください。'
        });
        return;
      }

      const detectedSet = new Set<string>(mode === 'add' ? Array.from(aiDetectedCodes) : []);
      aiResults.forEach(item => detectedSet.add(item.product_code));
      setAiDetectedCodes(detectedSet);

      setRecords(prev => prev.map(record => {
        const found = aiResults.find(r => r.product_code === record.productCode);
        if (found) {
          const nextCount = mode === 'add' ? record.wasteCount + found.count : found.count;
          return { ...record, wasteCount: nextCount };
        }
        return record;
      }));

      const totalCounted = aiResults.reduce((sum, item) => sum + item.count, 0);
      setMessage({
        type: 'success',
        text: mode === 'add'
          ? `AIが ${aiResults.length} 種類（計 ${totalCounted} 個）を認識し、現在のロス数に加算しました！`
          : `AIが ${aiResults.length} 種類（計 ${totalCounted} 個）を認識し、ロス数に自動入力しました！`
      });
    } catch (error: any) {
      console.error(error);
      setMessage({ type: 'error', text: error.message });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // レコードの更新
  const handleRecordChange = (index: number, field: keyof WasteRecord, value: any) => {
    setRecords(prev => {
      const newRecords = [...prev];
      newRecords[index] = { ...newRecords[index], [field]: value };
      return newRecords;
    });
  };

  // 時刻ヘルパー
  const timeToMinutes = (time: string): number => {
    if (!time) return 0;
    const [h, m] = time.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const minutesToTime = (minutes: number): string => {
    // 0:00 〜 23:59 の範囲内に収める
    const clamped = Math.min(24 * 60 - 1, Math.max(0, Math.round(minutes)));
    const h = String(Math.floor(clamped / 60)).padStart(2, '0');
    const m = String(clamped % 60).padStart(2, '0');
    return `${h}:${m}`;
  };

  // 完売時間モーダル操作
  const openTimeModal = (index: number) => {
    setTimeModalIndex(index);
    const current = records[index].soldOutTime;
    if (current) {
      setTempTime(current);
    } else {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      setTempTime(`${h}:${m}`);
    }
  };

  const adjustTempTime = (deltaMinutes: number) => {
    const mins = timeToMinutes(tempTime || '12:00');
    setTempTime(minutesToTime(mins + deltaMinutes));
  };

  const setTempTimeNow = () => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    setTempTime(`${h}:${m}`);
  };

  const saveTimeModal = () => {
    if (timeModalIndex !== null) {
      handleRecordChange(timeModalIndex, 'soldOutTime', tempTime);
      setTimeModalIndex(null);
    }
  };

  const clearTimeModal = () => {
    if (timeModalIndex !== null) {
      handleRecordChange(timeModalIndex, 'soldOutTime', '');
      setTimeModalIndex(null);
    }
  };

  // 試食数モーダル操作
  const openSampleModal = (index: number) => {
    setSampleModalIndex(index);
    setTempSampleCount(records[index].sampleCount || 0);
  };

  const saveSampleModal = () => {
    if (sampleModalIndex !== null) {
      handleRecordChange(sampleModalIndex, 'sampleCount', tempSampleCount);
      setSampleModalIndex(null);
    }
  };

  const clearSampleModal = () => {
    if (sampleModalIndex !== null) {
      handleRecordChange(sampleModalIndex, 'sampleCount', 0);
      setSampleModalIndex(null);
    }
  };

  // クリアボタン: 完売時間・ロス数・コメントをリセット
  const clearRecord = (index: number) => {
    const code = records[index]?.productCode;
    if (code && aiDetectedCodes.has(code)) {
      const nextSet = new Set(aiDetectedCodes);
      nextSet.delete(code);
      setAiDetectedCodes(nextSet);
    }
    setRecords(prev => {
      const newRecords = [...prev];
      newRecords[index] = {
        ...newRecords[index],
        wasteCount: 0,
        soldOutTime: '',
        comment: '',
        deliveryDiff: 0,
        sampleCount: 0
      };
      return newRecords;
    });
  };

  // コメントモーダルを開く
  const openCommentModal = (index: number) => {
    setCommentModalIndex(index);
    setTempComment(records[index].comment || '');
  };

  // コメントを確定保存
  const saveComment = () => {
    if (commentModalIndex !== null) {
      handleRecordChange(commentModalIndex, 'comment', tempComment.trim());
      setCommentModalIndex(null);
    }
  };

  // データの保存
  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/waste/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetDate,
          records,
          imageBase64: imagePreview
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存に失敗しました');

      setMessage({ type: 'success', text: '店舗のロス記録をデータベースに正常に保存しました！' });
    } catch (error: any) {
      console.error(error);
      setMessage({ type: 'error', text: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24 -mx-4 -mt-4 sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8">
      {/* 画面ヘッダー */}
      <div className="bg-white border-b px-4 py-3 shadow-sm sticky top-0 z-10 flex items-center justify-between">
        <h1 className="text-lg sm:text-xl font-bold text-gray-800">ロスパン自動カウント</h1>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={targetDate}
            onChange={e => setTargetDate(e.target.value)}
            className="p-1.5 border rounded-lg text-sm bg-gray-50 font-bold focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      <main className="max-w-4xl mx-auto p-3 sm:p-4 space-y-4">
        {/* カメラ撮影エリア */}
        <div className="bg-white p-4 rounded-xl shadow-sm text-center space-y-3">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={fileInputRef}
            className="hidden"
            onChange={handleImageCapture}
          />

          {!imagePreview ? (
            <button
              type="button"
              disabled={isAnalyzing || records.length === 0}
              onClick={() => triggerCamera('overwrite')}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow transition-colors text-base"
            >
              <Camera className="w-5 h-5" />
              棚の写真を撮影して自動カウント
            </button>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isAnalyzing}
                onClick={() => triggerCamera('add')}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 shadow transition-colors text-sm sm:text-base"
              >
                <PlusCircle className="w-5 h-5" />
                別の棚を追加撮影（個数を合算）
              </button>
              <button
                type="button"
                disabled={isAnalyzing}
                onClick={() => triggerCamera('overwrite')}
                className="w-full py-2.5 bg-slate-600 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 shadow transition-colors text-sm sm:text-base"
              >
                <RefreshCw className="w-4 h-4" />
                写真を撮り直す（上書き）
              </button>
            </div>
          )}

          {imagePreview && (
            <div className="mt-2 relative rounded-lg overflow-hidden border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="Preview" className="w-full h-auto object-cover max-h-56" />
              {isAnalyzing && (
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white backdrop-blur-sm">
                  <Loader2 className="w-8 h-8 animate-spin mb-1" />
                  <p className="font-bold text-sm">AIがパンと値札を解析・カウント中...</p>
                </div>
              )}
            </div>
          )}

          {/* 今回の撮影でAIが検出した商品のサマリー */}
          {lastAiDetections.length > 0 && !isAnalyzing && (
            <div className="bg-blue-50/80 border border-blue-200 rounded-lg p-2.5 text-left">
              <div className="flex items-center gap-1 text-xs font-bold text-blue-800 mb-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>直近の写真からAIが検出したパン:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {lastAiDetections.map(item => {
                  const matchedProduct = records.find(r => r.productCode === item.product_code);
                  const displayName = matchedProduct?.productName || item.product_name || item.product_code;
                  return (
                    <span
                      key={item.product_code}
                      className="inline-flex items-center gap-1 bg-white border border-blue-200 text-blue-900 text-xs font-bold px-2 py-0.5 rounded-full shadow-2xs"
                    >
                      <span>{displayName}</span>
                      <span className="text-blue-600 font-black">{item.count}個</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* メッセージ表示 */}
        {message && (
          <div className={`p-3 rounded-lg flex items-start gap-2 text-sm ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p className="font-medium">{message.text}</p>
          </div>
        )}

        {/* 商品一覧（上段: 商品名・発注数 / 下段: 操作系 の2段レイアウト） */}
        <div className="space-y-1.5">
          {records.length === 0 && (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-500">
              この日の販売オーダーが見つかりません。トップ画面の「オーダー表 一括読込」でExcelを取り込んでください。
            </div>
          )}

          {records.map((record, idx) => {
            const isAiCounted = aiDetectedCodes.has(record.productCode);
            const style = getCategoryStyle(record.category, record.productCode);
            return (
              <div
                key={record.productCode}
                className={`border-2 rounded-xl sm:rounded-2xl shadow-xs p-2 sm:p-2.5 transition-all hover:shadow-sm ${style.cardBg} ${
                  isAiCounted ? 'border-blue-500 ring-2 ring-blue-200/70' : style.cardBorder
                }`}
              >
{/* 上段（1行目）: 商品名 ＆ 発注数・納品差異（コメント・クリアは2行目右端へ移動して商品名領域を最大化） */}
                <div className="flex items-center justify-between gap-1.5 border-b border-gray-100 pb-1.5 mb-1.5">
                  {/* 左: 商品名 ＋ カテゴリーバッジ（スマホでは完全非表示、タブレット以上のみ表示） ＋ AI認識バッジ */}
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    {record.category && (
                      <span
                        className={`hidden sm:inline-flex items-center text-[9px] font-bold px-1.5 py-0.2 rounded border whitespace-nowrap flex-shrink-0 ${style.badgeBg}`}
                      >
                        {record.category}
                      </span>
                    )}
                    <span className="text-xs sm:text-sm font-bold text-gray-900 leading-tight truncate">
                      {record.productName}
                    </span>
                    {isAiCounted && (
                      <span className="inline-flex items-center gap-0.5 bg-blue-100 text-blue-700 text-[9px] font-black px-1 py-0.2 rounded-full whitespace-nowrap flex-shrink-0">
                        ✨AI
                      </span>
                    )}
                  </div>

                  {/* 右: 発注数 ＋ 納品差異バッジ ＋ 納品差異ステッパー［ー］［＋］ */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-[10px] sm:text-xs font-semibold text-gray-500 whitespace-nowrap">
                      発注
                      <span className="text-xs sm:text-sm font-black text-gray-900 mx-0.5 tabular-nums">
                        {record.orderQuantity}
                      </span>
                      個
                    </span>

                    {/* 納品差異バッジ */}
                    {(record.deliveryDiff || 0) !== 0 && (
                      <span className="text-[10px] font-black px-1 py-0.2 rounded-md bg-red-100 text-red-700 border border-red-300 whitespace-nowrap tabular-nums">
                        納品数{(record.deliveryDiff || 0) > 0 ? '+' : ''}{record.deliveryDiff}
                      </span>
                    )}

                    {/* 納品差異ステッパー［ー］［＋］ */}
                    <div className="flex items-center gap-0.5">
                      <RepeatButton
                        onAction={() => handleRecordChange(idx, 'deliveryDiff', (record.deliveryDiff || 0) - 1)}
                        className="h-6 w-6 sm:h-7 sm:w-7 rounded-md bg-purple-100 hover:bg-purple-200 active:bg-purple-300 text-purple-900 font-black text-[11px] sm:text-xs flex items-center justify-center border border-purple-300"
                        ariaLabel="納品数を1減らす"
                      >
                        ー
                      </RepeatButton>
                      <RepeatButton
                        onAction={() => handleRecordChange(idx, 'deliveryDiff', (record.deliveryDiff || 0) + 1)}
                        className="h-6 w-6 sm:h-7 sm:w-7 rounded-md bg-purple-100 hover:bg-purple-200 active:bg-purple-300 text-purple-900 font-black text-[11px] sm:text-xs flex items-center justify-center border border-purple-300"
                        ariaLabel="納品数を1増やす"
                      >
                        ＋
                      </RepeatButton>
                    </div>
                  </div>
                </div>

                {/* 下段（2行目）: [⏰ 完売時間]  [🍴 試食]  ロス: [ 0 ] [ー][＋]  ---  [コメント] [クリア] */}
                <div className="flex items-center justify-between gap-1 flex-wrap">
                  {/* 左ブロック: [⏰ 完売時間] [🍴 試食] ロス数[ー][＋] */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {/* 完売時間ボタン */}
                    <button
                      type="button"
                      onClick={() => openTimeModal(idx)}
                      className={`h-7 px-1.5 sm:px-2 rounded-md text-[10px] sm:text-xs font-bold shadow-2xs flex items-center gap-0.5 transition-colors whitespace-nowrap ${
                        record.soldOutTime
                          ? 'bg-orange-500 hover:bg-orange-600 text-white font-black'
                          : 'bg-orange-50 hover:bg-orange-100 text-orange-900 border border-orange-300'
                      }`}
                      title="完売時間を設定"
                    >
                      <span className="text-xs">⏰</span>
                      <span>{record.soldOutTime || '完売時間'}</span>
                    </button>

                    {/* 試食ボタン */}
                    <button
                      type="button"
                      onClick={() => openSampleModal(idx)}
                      className={`h-7 px-1.5 sm:px-2 rounded-md text-[10px] sm:text-xs font-bold shadow-2xs flex items-center gap-0.5 transition-colors whitespace-nowrap ${
                        (record.sampleCount || 0) > 0
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-black'
                          : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300'
                      }`}
                      title="試食数を設定"
                    >
                      <span>🍴</span>
                      <span>{(record.sampleCount || 0) > 0 ? `試食: ${record.sampleCount}` : '試食'}</span>
                    </button>

                    {/* ロス数: [ 0 ] 個 [ー] [＋] */}
                    <div className="flex items-center gap-0.5">
                      <span className="text-[10px] sm:text-xs font-bold text-gray-700 whitespace-nowrap">ロス:</span>
                      <div className="flex items-center bg-gray-50 border border-gray-300 rounded-md px-1 h-7">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={record.wasteCount}
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9]/g, '');
                            handleRecordChange(idx, 'wasteCount', val === '' ? 0 : parseInt(val, 10));
                          }}
                          className="w-5 sm:w-7 text-center text-sm sm:text-base font-black bg-transparent border-none p-0 focus:outline-none text-gray-900 tabular-nums"
                        />
                        <span className="text-[9px] font-semibold text-gray-500 ml-0.2">個</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <RepeatButton
                          onAction={() => handleRecordChange(idx, 'wasteCount', Math.max(0, record.wasteCount - 1))}
                          className="h-7 w-6 sm:w-7 rounded-md bg-blue-100 hover:bg-blue-200 active:bg-blue-300 text-blue-900 font-black text-xs flex items-center justify-center border border-blue-300"
                          ariaLabel="ロス数を1減らす"
                        >
                          ー
                        </RepeatButton>
                        <RepeatButton
                          onAction={() => handleRecordChange(idx, 'wasteCount', record.wasteCount + 1)}
                          className="h-7 w-6 sm:w-7 rounded-md bg-blue-100 hover:bg-blue-200 active:bg-blue-300 text-blue-900 font-black text-xs flex items-center justify-center border border-blue-300"
                          ariaLabel="ロス数を1増やす"
                        >
                          ＋
                        </RepeatButton>
                      </div>
                    </div>
                  </div>

                  {/* 右端ブロック: [コメント] [クリア] */}
                  <div className="flex items-center gap-1 ml-auto flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => openCommentModal(idx)}
                      className={`h-7 px-2 rounded-md text-[10px] sm:text-xs font-bold shadow-2xs text-white transition-colors flex items-center justify-center gap-0.5 whitespace-nowrap ${
                        record.comment ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-500 hover:bg-orange-600'
                      }`}
                    >
                      {record.comment && <span className="text-[9px]">✓</span>}
                      <span>コメント</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => clearRecord(idx)}
                      className="h-7 px-2 rounded-md text-[10px] sm:text-xs font-bold shadow-2xs bg-blue-600 hover:bg-blue-700 text-white transition-colors whitespace-nowrap"
                    >
                      クリア
                    </button>
                  </div>
                </div>

                                {/* メモ・コメントが既に記入されている場合は下部に小さく表示 */}
                {record.comment && (
                  <div className="mt-1.5 pt-1 border-t border-gray-100 flex items-start gap-1.5 text-xs text-gray-600">
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span className="font-medium truncate">{record.comment}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* 画面下部固定の保存ボタンバー */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t p-3 z-20 shadow-lg">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="text-xs sm:text-sm text-gray-600">
            登録件数: <span className="font-bold text-gray-900">{records.length}</span> 品目
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving || records.length === 0}
            className="py-3 px-8 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-md disabled:opacity-50 transition-colors text-base"
          >
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {isSaving ? '店舗データ保存中...' : '店舗データを保存する'}
          </button>
        </div>
      </div>



      {/* 完売時間入力ポップアップモーダル */}
      {timeModalIndex !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">⏰</span>
                <h3 className="font-bold text-gray-900 text-base">完売時間の設定</h3>
              </div>
              <button
                type="button"
                onClick={() => setTimeModalIndex(null)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-center">
              <p className="text-sm font-extrabold text-gray-800 truncate">
                {records[timeModalIndex]?.productName}
              </p>

              {/* 「今！」ボタン */}
              <button
                type="button"
                onClick={setTempTimeNow}
                className="w-full py-2 bg-orange-100 hover:bg-orange-200 active:bg-orange-300 text-orange-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1 border border-orange-300 transition-colors"
              >
                <span>⏰ 今の時刻をセット</span>
              </button>

              {/* 時間パネル（直接入力可能 ＆ 数字中央表示） */}
              <div className="bg-orange-50 border-2 border-orange-300 rounded-2xl p-4 flex flex-col items-center justify-center">
                <span className="text-[10px] font-bold text-orange-800 mb-1">完売時刻</span>
                <input
                  type="time"
                  value={tempTime}
                  onChange={e => setTempTime(e.target.value)}
                  className="text-4xl font-black text-gray-900 bg-transparent text-center outline-none cursor-pointer tracking-wider font-mono"
                />
              </div>

              {/* 1分単位ステッパー［ー］［＋］（左にー、右に＋。長押しで高速スクロール） */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-gray-500">1分単位で微調整（長押しで高速スクロール）</span>
                <div className="flex items-center justify-center gap-3">
                  <RepeatButton
                    onAction={() => adjustTempTime(-1)}
                    className="h-12 w-20 rounded-xl bg-orange-100 hover:bg-orange-200 active:bg-orange-300 text-orange-950 font-black text-xl flex items-center justify-center border-2 border-orange-300 shadow-xs"
                    ariaLabel="1分戻す"
                  >
                    ー 1分
                  </RepeatButton>
                  <RepeatButton
                    onAction={() => adjustTempTime(1)}
                    className="h-12 w-20 rounded-xl bg-orange-100 hover:bg-orange-200 active:bg-orange-300 text-orange-950 font-black text-xl flex items-center justify-center border-2 border-orange-300 shadow-xs"
                    ariaLabel="1分進める"
                  >
                    ＋ 1分
                  </RepeatButton>
                </div>
              </div>

              {/* クイックボタン: 10分単位 */}
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => adjustTempTime(-10)}
                  className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg border"
                >
                  -10分
                </button>
                <button
                  type="button"
                  onClick={() => adjustTempTime(10)}
                  className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg border"
                >
                  +10分
                </button>
                <button
                  type="button"
                  onClick={() => adjustTempTime(-30)}
                  className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg border"
                >
                  -30分
                </button>
                <button
                  type="button"
                  onClick={() => adjustTempTime(30)}
                  className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg border"
                >
                  +30分
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 border-t">
              <button
                type="button"
                onClick={clearTimeModal}
                className="px-3 py-2 rounded-xl text-rose-700 bg-rose-50 hover:bg-rose-100 text-xs font-bold border border-rose-200"
              >
                未設定に戻す
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTimeModalIndex(null)}
                  className="px-4 py-2 rounded-xl text-gray-600 bg-gray-100 hover:bg-gray-200 text-xs font-semibold"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={saveTimeModal}
                  className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold shadow"
                >
                  決定
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 試食数入力ポップアップモーダル */}
      {sampleModalIndex !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">🍴</span>
                <h3 className="font-bold text-gray-900 text-base">試食数の登録</h3>
              </div>
              <button
                type="button"
                onClick={() => setSampleModalIndex(null)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-center">
              <p className="text-sm font-extrabold text-gray-800 truncate">
                {records[sampleModalIndex]?.productName}
              </p>
              <p className="text-xs text-gray-500">
                カットして試食提供した数量を1個単位で登録できます。
              </p>

              {/* 試食数パネル（直接入力可能） */}
              <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-4 flex flex-col items-center justify-center">
                <span className="text-[10px] font-bold text-emerald-800 mb-1">試食数</span>
                <div className="flex items-center justify-center">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={tempSampleCount}
                    onChange={e => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setTempSampleCount(val === '' ? 0 : parseInt(val, 10));
                    }}
                    className="text-5xl font-black text-emerald-950 bg-transparent text-center w-24 outline-none tabular-nums"
                  />
                  <span className="text-lg font-bold text-emerald-800 ml-1">個</span>
                </div>
              </div>

              {/* 1個単位ステッパー［ー］［＋］（左にー、右に＋。長押しで連続増減） */}
              <div className="flex items-center justify-center gap-3 pt-1">
                <RepeatButton
                  onAction={() => setTempSampleCount(prev => Math.max(0, prev - 1))}
                  className="h-12 w-20 rounded-xl bg-emerald-100 hover:bg-emerald-200 active:bg-emerald-300 text-emerald-950 font-black text-xl flex items-center justify-center border-2 border-emerald-300 shadow-xs"
                  ariaLabel="1個減らす"
                >
                  ー 1個
                </RepeatButton>
                <RepeatButton
                  onAction={() => setTempSampleCount(prev => prev + 1)}
                  className="h-12 w-20 rounded-xl bg-emerald-100 hover:bg-emerald-200 active:bg-emerald-300 text-emerald-950 font-black text-xl flex items-center justify-center border-2 border-emerald-300 shadow-xs"
                  ariaLabel="1個増やす"
                >
                  ＋ 1個
                </RepeatButton>
              </div>

              {/* クイック加算ボタン */}
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setTempSampleCount(prev => prev + 1)}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-lg border"
                >
                  +1個
                </button>
                <button
                  type="button"
                  onClick={() => setTempSampleCount(prev => prev + 2)}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-lg border"
                >
                  +2個
                </button>
                <button
                  type="button"
                  onClick={() => setTempSampleCount(prev => prev + 5)}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-lg border"
                >
                  +5個
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 border-t">
              <button
                type="button"
                onClick={clearSampleModal}
                className="px-3 py-2 rounded-xl text-rose-700 bg-rose-50 hover:bg-rose-100 text-xs font-bold border border-rose-200"
              >
                0個に戻す
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSampleModalIndex(null)}
                  className="px-4 py-2 rounded-xl text-gray-600 bg-gray-100 hover:bg-gray-200 text-xs font-semibold"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={saveSampleModal}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow"
                >
                  決定
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* コメント入力モーダル */}
      {commentModalIndex !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-orange-500" />
                <h3 className="font-bold text-gray-900 text-base">商品メモ・コメントの記録</h3>
              </div>
              <button
                type="button"
                onClick={() => setCommentModalIndex(null)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <p className="text-sm font-bold text-gray-800 mb-1">
                {records[commentModalIndex]?.productName}
              </p>
              <p className="text-xs text-gray-500 mb-2">
                天候の影響、焼き上がり状況、売れ行きの傾向など最大100文字で記録できます。
              </p>
              <textarea
                value={tempComment}
                onChange={e => setTempComment(e.target.value.slice(0, 100))}
                placeholder="例: 雨天のため完売が遅れた。夕方に値下げ販売を実施。"
                rows={3}
                className="w-full p-3 border-2 border-orange-200 rounded-xl text-sm focus:border-orange-500 focus:outline-none"
              />
              <div className="text-right text-xs text-gray-400 mt-1">
                {tempComment.length} / 100 文字
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCommentModalIndex(null)}
                className="px-4 py-2 rounded-xl text-gray-600 bg-gray-100 hover:bg-gray-200 text-sm font-semibold"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={saveComment}
                className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold shadow"
              >
                コメントを確定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
