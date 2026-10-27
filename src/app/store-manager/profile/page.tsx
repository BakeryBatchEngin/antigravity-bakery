'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock, MapPin, Save, Loader2, CheckCircle2, AlertCircle, Copy } from 'lucide-react';

interface DayHours {
  open: string;
  close: string;
  closed: boolean;
}

interface BusinessHours {
  mon: DayHours;
  tue: DayHours;
  wed: DayHours;
  thu: DayHours;
  fri: DayHours;
  sat: DayHours;
  sun_hol: DayHours;
}

const DAYS_CONFIG: { key: keyof BusinessHours; label: string; badgeColor: string }[] = [
  { key: 'mon', label: '月曜日', badgeColor: 'bg-blue-100 text-blue-800' },
  { key: 'tue', label: '火曜日', badgeColor: 'bg-blue-100 text-blue-800' },
  { key: 'wed', label: '水曜日', badgeColor: 'bg-blue-100 text-blue-800' },
  { key: 'thu', label: '木曜日', badgeColor: 'bg-blue-100 text-blue-800' },
  { key: 'fri', label: '金曜日', badgeColor: 'bg-blue-100 text-blue-800' },
  { key: 'sat', label: '土曜日', badgeColor: 'bg-emerald-100 text-emerald-800' },
  { key: 'sun_hol', label: '日曜・祝日', badgeColor: 'bg-rose-100 text-rose-800' },
];

export default function StoreProfilePage() {
  const [storeInfo, setStoreInfo] = useState<{ id: number; name: string; code: string } | null>(null);
  const [businessHours, setBusinessHours] = useState<BusinessHours>({
    mon: { open: '08:00', close: '20:00', closed: false },
    tue: { open: '08:00', close: '20:00', closed: false },
    wed: { open: '08:00', close: '20:00', closed: false },
    thu: { open: '08:00', close: '20:00', closed: false },
    fri: { open: '08:00', close: '20:00', closed: false },
    sat: { open: '08:00', close: '20:00', closed: false },
    sun_hol: { open: '08:00', close: '20:00', closed: false },
  });
  const [locationCharacteristics, setLocationCharacteristics] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/store-profile');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'データの取得に失敗しました');

      setStoreInfo(data.store);
      if (data.businessHours) {
        setBusinessHours(data.businessHours);
      }
      setLocationCharacteristics(data.locationCharacteristics || '');
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleHoursChange = (dayKey: keyof BusinessHours, field: keyof DayHours, val: any) => {
    setBusinessHours(prev => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        [field]: val,
      },
    }));
  };

  // 月曜日の設定を火曜〜金曜に一括コピー
  const copyMondayToWeekdays = () => {
    const mon = businessHours.mon;
    setBusinessHours(prev => ({
      ...prev,
      tue: { ...mon },
      wed: { ...mon },
      thu: { ...mon },
      fri: { ...mon },
    }));
    setMessage({ type: 'success', text: '月曜日の営業時間を火曜日〜金曜日にコピーしました。' });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/store-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessHours,
          locationCharacteristics,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存に失敗しました');

      setMessage({ type: 'success', text: '店舗基礎データを正常に保存しました！AI分析に反映されます。' });
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 -mx-4 -mt-4 sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8">
      {/* ヘッダー */}
      <div className="bg-white border-b px-4 py-3 shadow-sm sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            title="トップへ戻る"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900">店舗基礎データ登録</h1>
            <p className="text-xs text-gray-500">
              対象店舗: <span className="font-bold text-emerald-700">{storeInfo?.name || '読込中...'}</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={loading || saving}
          onClick={handleSave}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm flex items-center gap-1.5 shadow transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>保存する</span>
        </button>
      </div>

      <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        {/* メッセージ */}
        {message && (
          <div
            className={`p-3.5 rounded-xl flex items-start gap-2.5 text-sm ${
              message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}
          >
            {message.type === 'error' ? (
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
            ) : (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-600" />
            )}
            <p className="font-semibold">{message.text}</p>
          </div>
        )}

        {/* 営業時間設定セクション */}
        <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-600" />
              <h2 className="text-base sm:text-lg font-bold text-gray-900">店舗の営業時間設定</h2>
            </div>
            <button
              type="button"
              onClick={copyMondayToWeekdays}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors border"
              title="月曜日の設定を火曜〜金曜に反映します"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>月曜の設定を平日（火〜金）に一括コピー</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {DAYS_CONFIG.map(({ key, label, badgeColor }) => {
              const current = businessHours[key] || { open: '08:00', close: '20:00', closed: false };
              return (
                <div
                  key={key}
                  className={`p-3 rounded-xl border flex items-center justify-between flex-wrap gap-3 transition-colors ${
                    current.closed ? 'bg-gray-100/70 opacity-60' : 'bg-white hover:border-emerald-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-[7.5rem]">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>{label}</span>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={current.closed}
                        onChange={e => handleHoursChange(key, 'closed', e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <span>定休日 / 休業</span>
                    </label>

                    {!current.closed && (
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          value={current.open}
                          onChange={e => handleHoursChange(key, 'open', e.target.value)}
                          className="px-2.5 py-1.5 border rounded-lg text-sm font-bold bg-gray-50 text-gray-900 focus:ring-2 focus:ring-emerald-500"
                        />
                        <span className="text-gray-400 font-bold">〜</span>
                        <input
                          type="time"
                          value={current.close}
                          onChange={e => handleHoursChange(key, 'close', e.target.value)}
                          className="px-2.5 py-1.5 border rounded-lg text-sm font-bold bg-gray-50 text-gray-900 focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-500">
            ※完売時間グラフの計算や、早め完売（機会損失）を判定するための基準時間として使用されます。
          </p>
        </div>

        {/* 立地条件・客層テキスト入力セクション */}
        <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6 space-y-3">
          <div className="flex items-center gap-2 pb-3 border-b">
            <MapPin className="w-5 h-5 text-emerald-600" />
            <div>
              <h2 className="text-base sm:text-lg font-bold text-gray-900">店舗の立地条件・客層の特徴</h2>
              <p className="text-xs text-gray-500">AIが実績分析を行う際の重要なインプットとなります。</p>
            </div>
          </div>

          <div>
            <textarea
              rows={5}
              value={locationCharacteristics}
              onChange={e => setLocationCharacteristics(e.target.value)}
              placeholder="例: ビジネス街の駅直結ビルに位置し、朝7:30〜9:00の通勤時間帯と夕方17:30〜19:00の帰宅時間帯に客足が集中します。オフィス勤務の会社員やOLが多く、ランチ用の惣菜パンや手土産用の焼き菓子の需要が高いです。夏休み期間や連休は周辺のオフィス人口が減るため客数が2〜3割落ちる傾向があります。"
              className="w-full p-3.5 border rounded-xl text-sm bg-gray-50 text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all leading-relaxed"
            />
          </div>
          <p className="text-xs text-gray-400">
            ※季節による変動、近隣イベント、天候の影響、主な来店層などを自由に記入してください。AIが完売時間やロスデータと組み合わせて実践的なアドバイスを導き出します。
          </p>
        </div>
      </main>
    </div>
  );
}
