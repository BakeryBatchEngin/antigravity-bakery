'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

// アイコンの選択肢（既存の画像ファイルを使用）
const ICON_OPTIONS = [
  { value: 'spiral_icon.png', label: 'スパイラル型' },
  { value: 'mighty60_icon.png', label: 'マイティ60型' },
  { value: 'mighty30_icon.png', label: 'マイティ30型' },
];

interface MixerCapacity {
  id: string;
  name: string;
  icon: string;
  max_capacity_kg: number;
  store_id: number;
}

export default function MixerSettingsPage() {
  const [mixers, setMixers] = useState<MixerCapacity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  // 新規追加フォームの状態
  const [newMixer, setNewMixer] = useState({ name: '', icon: 'spiral_icon.png', max_capacity_kg: 50 });
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    fetchMixers();
  }, []);

  const fetchMixers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/mixers');
      if (!res.ok) throw new Error('API request failed');
      const data = await res.json();
      if (data.success) {
        setMixers(data.mixers);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'ミキサーデータの読み込みに失敗しました。' });
    } finally {
      setIsLoading(false);
    }
  };

  // 容量のインクリメント/デクリメント
  const adjustCapacity = (id: string, delta: number) => {
    setMixers(prev => prev.map(m => {
      if (m.id === id) {
        return { ...m, max_capacity_kg: Math.max(1, m.max_capacity_kg + delta) };
      }
      return m;
    }));
    setMessage(null);
  };

  // 名前の変更
  const updateName = (id: string, name: string) => {
    setMixers(prev => prev.map(m => m.id === id ? { ...m, name } : m));
    setMessage(null);
  };

  // 保存（PUT）
  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/mixers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mixers })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Save failed');
      setMessage({ type: 'success', text: 'ミキサー設定を保存しました！' });
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: '保存に失敗しました。' });
    } finally {
      setIsSaving(false);
    }
  };

  // 新規追加（POST）
  const handleAdd = async () => {
    if (!newMixer.name || newMixer.max_capacity_kg <= 0) {
      setMessage({ type: 'error', text: 'ミキサー名と容量を入力してください。' });
      return;
    }
    setIsAdding(true);
    setMessage(null);
    try {
      const res = await fetch('/api/mixers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMixer)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Add failed');
      setMessage({ type: 'success', text: `「${newMixer.name}」を追加しました！` });
      setNewMixer({ name: '', icon: 'spiral_icon.png', max_capacity_kg: 50 });
      fetchMixers(); // 再取得
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'ミキサーの追加に失敗しました。' });
    } finally {
      setIsAdding(false);
    }
  };

  // 削除（DELETE）
  const handleDelete = async (mixer: MixerCapacity) => {
    if (!confirm(`「${mixer.name}」を削除しますか？`)) return;
    setMessage(null);
    try {
      const res = await fetch(`/api/mixers?id=${encodeURIComponent(mixer.id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Delete failed');
      setMessage({ type: 'success', text: `「${mixer.name}」を削除しました。` });
      fetchMixers(); // 再取得
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: '削除に失敗しました。' });
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-900 pb-10">
      {/* ヘッダー */}
      <div className="flex-none flex items-center justify-between gap-4 bg-white dark:bg-slate-800 p-4 sm:px-8 border-b border-slate-200 dark:border-slate-700 shadow-sm z-10 sticky top-0">
        <h2 className="text-2xl font-bold flex items-center gap-3 text-slate-800 dark:text-slate-100">
          <span className="text-3xl text-amber-500">⚙️</span> ミキサー設定
        </h2>
        
        <div className="flex gap-3">
          <Link href="/" className="px-4 py-3 bg-slate-200 dark:bg-slate-700 rounded-xl text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 font-bold transition-colors">
            🏠 戻る
          </Link>
          <button 
            onClick={handleSave}
            disabled={isSaving || isLoading || mixers.length === 0}
            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 disabled:cursor-not-allowed text-white rounded-xl font-bold text-lg shadow-sm transition-colors flex items-center gap-2"
          >
            {isSaving ? '保存中...' : '✅ 変更を保存'}
          </button>
        </div>
      </div>

      <div className="flex-1 container mx-auto p-4 sm:p-8 max-w-4xl mt-4 flex flex-col gap-6">
        {/* メッセージ */}
        {message && (
          <div className={`p-4 rounded-xl font-bold text-lg border-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
            {message.type === 'success' ? '✅ ' : '❌ '}{message.text}
          </div>
        )}

        {/* 登録済みミキサー一覧 */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-6 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <h3 className="font-bold text-lg text-slate-700 dark:text-slate-200">自店のミキサー一覧</h3>
            <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
              仕込み計算のバッチ分割に使う、各ミキサーの最大生地量(kg)を設定してください。
            </p>
          </div>

          <div className="p-4 sm:p-6 flex flex-col gap-4">
            {isLoading ? (
              <div className="py-20 flex justify-center items-center text-slate-400">
                <div className="animate-spin text-4xl">🔄</div>
              </div>
            ) : mixers.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <div className="text-5xl mb-3">⚙️</div>
                <p className="font-bold">まだミキサーが登録されていません</p>
                <p className="text-sm mt-1">下の「ミキサーを追加」から登録してください</p>
              </div>
            ) : (
              mixers.map(mixer => (
                <div key={mixer.id} className="flex flex-col sm:flex-row items-center justify-between p-5 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 gap-4 hover:border-amber-400 transition-colors">
                  {/* アイコン＋名前 */}
                  <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center shadow-sm border border-slate-200 shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/${mixer.icon}`}
                        alt={mixer.name}
                        className="max-w-full max-h-full object-contain drop-shadow-md"
                        onError={(e) => { e.currentTarget.style.display='none'; (e.currentTarget.parentElement as HTMLElement).innerHTML = '<span class="text-3xl">⚙️</span>'; }}
                      />
                    </div>
                    <div className="flex-1">
                      <input
                        type="text"
                        value={mixer.name}
                        onChange={e => updateName(mixer.id, e.target.value)}
                        className="text-xl font-bold text-slate-800 dark:text-slate-100 bg-transparent border-b-2 border-transparent hover:border-slate-300 focus:border-amber-400 outline-none w-full"
                      />
                      <div className="text-slate-400 text-xs mt-0.5">{mixer.id}</div>
                    </div>
                  </div>

                  {/* 容量調整 + 削除 */}
                  <div className="flex items-center gap-3 w-full sm:w-auto justify-center">
                    <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-2 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                      <button onClick={() => adjustCapacity(mixer.id, -10)} className="w-10 h-10 flex items-center justify-center bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-sm transition-colors" title="-10kg">-10</button>
                      <button onClick={() => adjustCapacity(mixer.id, -1)} className="w-10 h-10 flex items-center justify-center bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-xl transition-colors" title="-1kg">-</button>
                      <div className="w-20 text-center flex flex-col items-center justify-center">
                        <span className="text-3xl font-black text-amber-600 dark:text-amber-400">{mixer.max_capacity_kg}</span>
                        <span className="text-xs font-bold text-slate-400">kg</span>
                      </div>
                      <button onClick={() => adjustCapacity(mixer.id, 1)} className="w-10 h-10 flex items-center justify-center bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-xl transition-colors" title="+1kg">+</button>
                      <button onClick={() => adjustCapacity(mixer.id, 10)} className="w-10 h-10 flex items-center justify-center bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-sm transition-colors" title="+10kg">+10</button>
                    </div>
                    <button
                      onClick={() => handleDelete(mixer)}
                      className="w-10 h-10 flex items-center justify-center bg-red-50 hover:bg-red-100 text-red-500 rounded-xl border border-red-200 transition-colors"
                      title="このミキサーを削除"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 新規追加フォーム */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-amber-200 dark:border-amber-800 overflow-hidden">
          <div className="p-6 border-b border-amber-100 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/20">
            <h3 className="font-bold text-lg text-amber-800 dark:text-amber-200">➕ ミキサーを追加</h3>
            <p className="text-amber-700 dark:text-amber-400 mt-1 text-sm">自店に新しいミキサーを登録します</p>
          </div>
          <div className="p-6 flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">ミキサー名 *</label>
              <input
                type="text"
                value={newMixer.name}
                onChange={e => setNewMixer({ ...newMixer, name: e.target.value })}
                placeholder="例: スパイラル1号機"
                className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white bg-white dark:bg-slate-700 placeholder-slate-400 dark:placeholder-slate-400 focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">アイコン種別</label>
              <select
                value={newMixer.icon}
                onChange={e => setNewMixer({ ...newMixer, icon: e.target.value })}
                className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white bg-white dark:bg-slate-700 focus:ring-2 focus:ring-amber-500 outline-none"
              >
                {ICON_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="w-36">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">最大容量 (kg) *</label>
              <input
                type="number"
                min="1"
                value={newMixer.max_capacity_kg}
                onChange={e => setNewMixer({ ...newMixer, max_capacity_kg: Number(e.target.value) })}
                className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white bg-white dark:bg-slate-700 focus:ring-2 focus:ring-amber-500 outline-none text-right font-bold"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={isAdding}
              className="px-6 py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 disabled:cursor-not-allowed text-white rounded-xl font-bold shadow-sm transition-colors whitespace-nowrap"
            >
              {isAdding ? '追加中...' : '追加する'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
