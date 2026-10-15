'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Camera, Save, Loader2, AlertCircle, MessageSquare, X } from 'lucide-react';

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
}

// 押しっぱなし（長押し）で連続実行するボタン
interface RepeatButtonProps {
  onAction: () => void;
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // コメント入力モーダル用の状態
  const [commentModalIndex, setCommentModalIndex] = useState<number | null>(null);
  const [tempComment, setTempComment] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
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

  // 画像選択＆AI解析
  const handleImageCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMessage(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
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

        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
        setImagePreview(compressedBase64);
        analyzeImage(compressedBase64);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const analyzeImage = async (base64Data: string) => {
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

      const aiResults: { product_code: string; count: number }[] = data.result;

      setRecords(prev => prev.map(record => {
        const found = aiResults.find(r => r.product_code === record.productCode);
        if (found) {
          return { ...record, wasteCount: found.count };
        }
        return record;
      }));

      setMessage({ type: 'success', text: 'AIの解析が完了しました。ロス数が自動入力されました。' });
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

  // 「今！」ボタン: 端末の現在時刻を完売時間にセット
  const setSoldOutNow = (index: number) => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    handleRecordChange(index, 'soldOutTime', `${h}:${m}`);
  };

  // 完売時間の微調整 (分単位)
  const adjustSoldOutTime = (index: number, deltaMinutes: number) => {
    const current = records[index].soldOutTime;
    if (!current) {
      setSoldOutNow(index);
      return;
    }
    const mins = timeToMinutes(current);
    handleRecordChange(index, 'soldOutTime', minutesToTime(mins + deltaMinutes));
  };

  // クリアボタン: 完売時間・ロス数・コメントをリセット
  const clearRecord = (index: number) => {
    setRecords(prev => {
      const newRecords = [...prev];
      newRecords[index] = {
        ...newRecords[index],
        wasteCount: 0,
        soldOutTime: '',
        comment: ''
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
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow transition-colors text-base"
          >
            <Camera className="w-5 h-5" />
            棚の写真を撮影して自動カウント
          </button>

          {imagePreview && (
            <div className="mt-2 relative rounded-lg overflow-hidden border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="Preview" className="w-full h-auto object-cover max-h-56" />
              {isAnalyzing && (
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white backdrop-blur-sm">
                  <Loader2 className="w-8 h-8 animate-spin mb-1" />
                  <p className="font-bold text-sm">AIがパンをカウント中...</p>
                </div>
              )}
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
        <div className="space-y-2.5">
          {records.length === 0 && (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-500">
              この日の販売オーダーが見つかりません。トップ画面の「オーダー表 一括読込」でExcelを取り込んでください。
            </div>
          )}

          {records.map((record, idx) => (
            <div
              key={record.productCode}
              className="border-2 border-emerald-600 rounded-2xl bg-white shadow-sm p-3 transition-all hover:shadow"
            >
              {/* 上段（1行目）: 商品名 ＆ 発注数 */}
              <div className="flex items-baseline justify-between gap-2 border-b border-gray-100 pb-1.5 mb-2">
                <span className="text-base sm:text-lg font-bold text-gray-900 leading-snug">
                  {record.productName}
                </span>
                <span className="text-xs sm:text-sm font-semibold text-gray-600 whitespace-nowrap flex-shrink-0">
                  発注数
                  <span className="text-2xl sm:text-3xl font-black text-gray-950 mx-1 tabular-nums">
                    {record.orderQuantity}
                  </span>
                  個
                </span>
              </div>

              {/* 下段（2行目）: 操作系（完売時間・ロス数・ボタン群） */}
              <div className="flex items-center justify-between gap-1.5 sm:gap-2">
                {/* 完売時間ブロック */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSoldOutNow(idx)}
                    className="px-2.5 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white text-xs sm:text-sm font-extrabold shadow-sm flex items-center gap-1 whitespace-nowrap transition-colors"
                    title="現在の時刻を完売時間にセット"
                  >
                    <span className="text-xs">⏰</span>
                    <span>今！</span>
                  </button>

                  {/* 完売時間表示 ＋ 上下ステッパー */}
                  <div className="flex items-center bg-orange-50 border border-orange-200 rounded-lg px-2 py-0.5">
                    <div className="text-center mr-1.5">
                      <div className="text-[9px] text-orange-800 font-semibold leading-none">完売時間</div>
                      <div className="text-base sm:text-lg font-bold text-gray-900 tabular-nums leading-tight">
                        {record.soldOutTime || '--:--'}
                      </div>
                    </div>
                    <div className="flex flex-col border-l border-orange-200 pl-1 -my-0.5">
                      <RepeatButton
                        onAction={() => adjustSoldOutTime(idx, 5)}
                        className="w-5 h-4 flex items-center justify-center text-xs font-bold text-blue-600 hover:bg-orange-100 rounded leading-none"
                        ariaLabel="完売時間を5分進める"
                      >
                        +
                      </RepeatButton>
                      <RepeatButton
                        onAction={() => adjustSoldOutTime(idx, -5)}
                        className="w-5 h-4 flex items-center justify-center text-xs font-bold text-blue-600 hover:bg-orange-100 rounded leading-none"
                        ariaLabel="完売時間を5分戻す"
                      >
                        -
                      </RepeatButton>
                    </div>
                  </div>
                </div>

                {/* ロス数ブロック */}
                <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-0.5">
                  <span className="text-[10px] sm:text-xs text-blue-900 font-bold leading-none">ロス数</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={record.wasteCount}
                    onChange={e => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      handleRecordChange(idx, 'wasteCount', val === '' ? 0 : parseInt(val, 10));
                    }}
                    className="w-10 sm:w-12 text-center text-2xl font-black bg-transparent border-none p-0 focus:outline-none text-gray-900 tabular-nums"
                  />
                  <span className="text-xs font-semibold text-gray-600 mr-1">個</span>
                  <div className="flex flex-col border-l border-gray-300 pl-1 -my-0.5">
                    <RepeatButton
                      onAction={() => handleRecordChange(idx, 'wasteCount', record.wasteCount + 1)}
                      className="w-5 h-4 flex items-center justify-center text-xs font-bold text-blue-600 hover:bg-gray-200 rounded leading-none"
                      ariaLabel="ロス数を1増やす"
                    >
                      +
                    </RepeatButton>
                    <RepeatButton
                      onAction={() => handleRecordChange(idx, 'wasteCount', Math.max(0, record.wasteCount - 1))}
                      className="w-5 h-4 flex items-center justify-center text-xs font-bold text-blue-600 hover:bg-gray-200 rounded leading-none"
                      ariaLabel="ロス数を1減らす"
                    >
                      -
                    </RepeatButton>
                  </div>
                </div>

                {/* コメント・クリアボタン（上下2段） */}
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => openCommentModal(idx)}
                    className={`px-3 py-1 text-xs font-bold rounded shadow-sm text-white transition-colors flex items-center justify-center gap-0.5 ${
                      record.comment ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-500 hover:bg-orange-600 active:bg-orange-700'
                    }`}
                  >
                    {record.comment && <span className="text-[10px]">✓</span>}
                    <span>コメント</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => clearRecord(idx)}
                    className="px-3 py-1 text-xs font-bold rounded shadow-sm bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white transition-colors"
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
          ))}
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
