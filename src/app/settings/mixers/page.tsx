'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface MixerCapacity {
  id: string;
  name: string;
  icon: string;
  max_capacity_kg: number;
}

export default function MixerSettingsPage() {
  const [mixers, setMixers] = useState<MixerCapacity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  useEffect(() => {
    fetchMixers();
  }, []);

  const fetchMixers = async () => {
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

  const adjustCapacity = (id: string, delta: number) => {
    setMixers(prev => prev.map(m => {
      if (m.id === id) {
        return { ...m, max_capacity_kg: Math.max(1, m.max_capacity_kg + delta) };
      }
      return m;
    }));
    setMessage(null);
  };

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
      if (!res.ok || !data.success) throw new Error(data.error || 'Saved failed');
      setMessage({ type: 'success', text: 'ミキサーの上限マスタを保存しました！' });
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: '保存に失敗しました。' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-900 pb-10">
      <div className="flex-none flex items-center justify-between gap-4 bg-white dark:bg-slate-800 p-4 sm:px-8 border-b border-slate-200 dark:border-slate-700 shadow-sm z-10 sticky top-0">
        <h2 className="text-2xl font-bold flex items-center gap-3 text-slate-800 dark:text-slate-100">
          <span className="text-3xl text-amber-500">⚙️</span> ミキサー上限マスタ
        </h2>
        
        <div className="flex gap-4">
          <Link href="/" className="px-4 py-3 bg-slate-200 dark:bg-slate-700 rounded-xl text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 font-bold transition-colors">
            🏠 戻る
          </Link>
          <button 
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 disabled:cursor-not-allowed text-white rounded-xl font-bold text-lg shadow-sm transition-colors flex items-center gap-2"
          >
            {isSaving ? '保存中...' : '確定 (保存)'}
          </button>
        </div>
      </div>

      <div className="flex-1 container mx-auto p-4 sm:p-8 max-w-4xl mt-4">
        {message && (
          <div className={`p-4 mb-6 rounded-xl font-bold text-lg border-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
            {message.type === 'success' ? '✅ ' : '❌ '}{message.text}
          </div>
        )}

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-6 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <h3 className="font-bold text-lg text-slate-700 dark:text-slate-200">店舗のミキサーサイズ設定</h3>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              仕込み画面でバッチを自動分割する際の基準となる、各ミキサーの生地量上限(kg)を設定してください。
            </p>
          </div>

          <div className="p-2 sm:p-6 flex flex-col gap-6">
            {isLoading ? (
              <div className="py-20 flex justify-center items-center text-slate-400"><div className="animate-spin text-4xl">🔄</div></div>
            ) : mixers.length === 0 ? (
              <div className="py-20 text-center text-slate-400">データが見つかりません</div>
            ) : (
              mixers.map(mixer => (
                <div key={mixer.id} className="flex flex-col sm:flex-row items-center justify-between p-6 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 gap-6 hover:border-amber-400 dark:hover:border-amber-600 transition-colors">
                  <div className="flex items-center gap-6 w-full sm:w-auto">
                    <div className="w-24 h-24 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center p-2 shadow-sm border border-slate-200 dark:border-slate-700 shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/${mixer.icon}`} alt={mixer.name} className="max-w-full max-h-full object-contain drop-shadow-md" onError={(e) => { e.currentTarget.style.display='none'; e.currentTarget.parentElement!.innerHTML = '<span class="text-4xl">⚙️</span>'; }} />
                    </div>
                    <div>
                      <h4 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{mixer.name}</h4>
                      <div className="text-slate-500 dark:text-slate-400 text-sm mt-1">{mixer.id}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 bg-white dark:bg-slate-800 p-2 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 w-full sm:w-auto justify-center">
                    <button 
                      onClick={() => adjustCapacity(mixer.id, -10)}
                      className="w-12 h-12 flex items-center justify-center bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-2xl transition-colors"
                      title="-10kg"
                    >-10</button>
                    <button 
                      onClick={() => adjustCapacity(mixer.id, -1)}
                      className="w-12 h-12 flex items-center justify-center bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-2xl transition-colors"
                      title="-1kg"
                    >-</button>
                    
                    <div className="w-28 text-center flex flex-col items-center justify-center">
                      <span className="text-3xl font-black text-amber-600 dark:text-amber-400">{mixer.max_capacity_kg}</span>
                      <span className="text-xs font-bold text-slate-400">kg</span>
                    </div>

                    <button 
                      onClick={() => adjustCapacity(mixer.id, 1)}
                      className="w-12 h-12 flex items-center justify-center bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-2xl transition-colors"
                      title="+1kg"
                    >+</button>
                    <button 
                      onClick={() => adjustCapacity(mixer.id, 10)}
                      className="w-12 h-12 flex items-center justify-center bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-2xl transition-colors"
                      title="+10kg"
                    >+10</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
