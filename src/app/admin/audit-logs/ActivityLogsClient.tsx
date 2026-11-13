'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';

export type ActivityLog = {
  id: number;
  tenant_id: number | null;
  user_id: number | null;
  store_id: number | null;
  action: string;
  category: string;
  table_name: string;
  record_id: string | null;
  description: string | null;
  ip_address: string | null;
  old_data: any;
  new_data: any;
  created_at: string;
  user_name: string | null;
  username: string | null;
  store_name: string | null;
  tenant_name: string | null;
};

export type StoreOption = {
  id: number;
  store_code: string;
  store_name: string;
};

const CATEGORY_MAP: Record<string, { label: string; icon: string; bg: string; text: string }> = {
  auth: { label: 'ログイン', icon: '🔐', bg: 'bg-indigo-50 border-indigo-200', text: 'text-indigo-700' },
  order: { label: '発注・取込', icon: '📦', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
  production: { label: '仕込み計画', icon: '🥣', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' },
  xmas: { label: 'クリスマス', icon: '🎄', bg: 'bg-rose-50 border-rose-200', text: 'text-rose-700' },
  master: { label: 'マスタ設定', icon: '⚙️', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
  loss: { label: 'ロス登録', icon: '📊', bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700' },
  general: { label: '一般操作', icon: '📝', bg: 'bg-slate-50 border-slate-200', text: 'text-slate-700' },
};

const ACTION_MAP: Record<string, { label: string; color: string }> = {
  LOGIN: { label: 'ログイン', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  LOGOUT: { label: 'ログアウト', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  INSERT: { label: '新規登録', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  UPDATE: { label: '更新・変更', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  DELETE: { label: '削除', color: 'bg-rose-100 text-rose-800 border-rose-200' },
  IMPORT: { label: '一括取込', color: 'bg-teal-100 text-teal-800 border-teal-200' },
};

export default function ActivityLogsClient({
  initialLogs,
  stores,
  tenantName,
}: {
  initialLogs: ActivityLog[];
  stores: StoreOption[];
  tenantName?: string;
}) {
  const [logs] = useState<ActivityLog[]>(initialLogs);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStoreId, setSelectedStoreId] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  // フィルタ処理
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (selectedCategory !== 'ALL' && log.category !== selectedCategory) return false;
      if (selectedStoreId !== 'ALL' && String(log.store_id) !== selectedStoreId) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const desc = (log.description || '').toLowerCase();
        const user = (log.user_name || log.username || '').toLowerCase();
        const store = (log.store_name || '').toLowerCase();
        const tbl = (log.table_name || '').toLowerCase();
        if (!desc.includes(q) && !user.includes(q) && !store.includes(q) && !tbl.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [logs, selectedCategory, selectedStoreId, searchTerm]);

  // CSVダウンロード
  const handleExportCsv = () => {
    const headers = ['ID', '日時', '店舗', '操作者', 'カテゴリ', '操作区分', '作業内容・説明', '対象レコードID'];
    const rows = filteredLogs.map((log) => [
      log.id,
      new Date(log.created_at).toLocaleString('ja-JP'),
      log.store_name || '全社・共通',
      log.user_name || log.username || 'システム',
      CATEGORY_MAP[log.category]?.label || log.category,
      ACTION_MAP[log.action]?.label || log.action,
      log.description || `${log.table_name} (${log.action})`,
      log.record_id || '-',
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const bom = '\uFEFF';
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // JSON表示整形
  const formatJson = (data: any) => {
    if (!data) return '（データなし）';
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      return JSON.stringify(parsed, null, 2);
    } catch {
      return String(data);
    }
  };

  return (
    <div className="space-y-6">
      {/* 画面ヘッダー */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/"
              className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
            >
              ← ホームに戻る
            </Link>
            {tenantName && (
              <span className="text-xs bg-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded-full">
                🏢 {tenantName}
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 flex items-center gap-3">
            <span>📜</span> 操作・作業履歴一覧
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            誰がログインしたか、どの店舗で発注や仕込み操作が行われたかを時系列で確認できます。
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition shadow-sm cursor-pointer"
          >
            <span>📥</span> CSVダウンロード
          </button>
        </div>
      </div>

      {/* カテゴリ切り替えタブ */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory('ALL')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition border cursor-pointer ${
            selectedCategory === 'ALL'
              ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
          }`}
        >
          🌐 すべて（{logs.length}）
        </button>

        {Object.entries(CATEGORY_MAP).map(([key, info]) => {
          const count = logs.filter((l) => l.category === key).length;
          if (count === 0 && key === 'loss') return null; // 該当なしは非表示
          return (
            <button
              key={key}
              onClick={() => setSelectedCategory(key)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition border cursor-pointer flex items-center gap-1.5 ${
                selectedCategory === key
                  ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-purple-300'
              }`}
            >
              <span>{info.icon}</span>
              <span>{info.label}</span>
              <span className={`text-xs ml-1 px-1.5 py-0.2 rounded-full ${
                selectedCategory === key ? 'bg-purple-700 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 絞り込みバー */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="操作内容・スタッフ名・店舗名で検索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
        </div>

        {stores.length > 0 && (
          <div className="w-full sm:w-auto">
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="w-full sm:w-auto border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400 cursor-pointer"
            >
              <option value="ALL">🏪 全店舗</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.store_name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="text-sm font-bold text-slate-500 ml-auto whitespace-nowrap">
          {filteredLogs.length} 件を表示中
        </div>
      </div>

      {/* 履歴リスト */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-bold">
            該当する作業履歴が見つかりませんでした
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredLogs.map((log) => {
              const catInfo = CATEGORY_MAP[log.category] || CATEGORY_MAP.general;
              const actInfo = ACTION_MAP[log.action] || { label: log.action, color: 'bg-slate-100 text-slate-700 border-slate-200' };
              const dateObj = new Date(log.created_at);
              const dateStr = dateObj.toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' });
              const timeStr = dateObj.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

              return (
                <div
                  key={log.id}
                  className="p-4 sm:p-5 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start sm:items-center gap-3 sm:gap-4 flex-1">
                    {/* アイコン */}
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-xl shrink-0">
                      {catInfo.icon}
                    </div>

                    {/* 日時 */}
                    <div className="shrink-0 text-left sm:text-center w-24">
                      <div className="text-xs font-bold text-slate-800">{dateStr}</div>
                      <div className="text-xs font-mono text-slate-400">{timeStr}</div>
                    </div>

                    {/* バッジ・店舗・ユーザー */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${actInfo.color}`}>
                          {actInfo.label}
                        </span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${catInfo.bg} ${catInfo.text}`}>
                          {catInfo.label}
                        </span>
                        {log.store_name && (
                          <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                            🏪 {log.store_name}
                          </span>
                        )}
                        <span className="text-xs font-bold text-indigo-700">
                          👤 {log.user_name || log.username || 'システム'}
                        </span>
                      </div>

                      {/* 説明テキスト */}
                      <p className="text-sm sm:text-base font-bold text-slate-800 leading-snug">
                        {log.description || `${log.table_name} への ${log.action} 操作が行われました`}
                      </p>
                    </div>
                  </div>

                  {/* 詳細ボタン */}
                  <div className="flex items-center gap-2 justify-end sm:shrink-0 pt-2 sm:pt-0">
                    {(log.old_data || log.new_data || log.record_id) && (
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-purple-100 text-slate-700 hover:text-purple-700 font-bold text-xs rounded-lg transition border border-slate-200 hover:border-purple-300 cursor-pointer"
                      >
                        詳細を見る ▶
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 詳細モーダル */}
      {selectedLog && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-100 flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                    ID: {selectedLog.id}
                  </span>
                  <span className="text-xs font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                    {CATEGORY_MAP[selectedLog.category]?.label || selectedLog.category}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mt-1">
                  {selectedLog.description || '作業ログ詳細'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  日時: {new Date(selectedLog.created_at).toLocaleString('ja-JP')}
                  {selectedLog.store_name ? ` ｜ 店舗: ${selectedLog.store_name}` : ''}
                  {selectedLog.user_name ? ` ｜ 操作者: ${selectedLog.user_name}` : ''}
                </p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-slate-50 space-y-5">
              {selectedLog.old_data && (
                <div>
                  <h4 className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2 border-l-4 border-amber-500 pl-2">
                    変更前のデータ
                  </h4>
                  <pre className="bg-slate-800 text-amber-100 p-4 rounded-xl text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-60">
                    {formatJson(selectedLog.old_data)}
                  </pre>
                </div>
              )}

              {selectedLog.new_data && (
                <div>
                  <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2 border-l-4 border-emerald-500 pl-2">
                    登録・変更後のデータ
                  </h4>
                  <pre className="bg-slate-800 text-emerald-100 p-4 rounded-xl text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-60">
                    {formatJson(selectedLog.new_data)}
                  </pre>
                </div>
              )}

              {!selectedLog.old_data && !selectedLog.new_data && (
                <div className="p-8 text-center text-slate-400 font-medium">
                  追加のデータ詳細はありません
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-sm transition shadow-sm cursor-pointer"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
