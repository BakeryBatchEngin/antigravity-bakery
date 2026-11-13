'use client';

import React, { useState, useMemo } from 'react';

export type SecurityLog = {
  id: number;
  tenant_id: number | null;
  user_id: number | null;
  username_attempted: string | null;
  event_type: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  message: string;
  action_advice: string | null;
  ip_address: string | null;
  user_agent: string | null;
  endpoint: string | null;
  metadata: any;
  created_at: string;
  user_name: string | null;
  tenant_name: string | null;
};

export type SecurityStats = {
  total: number;
  critical: number;
  warning: number;
  authFailures: number;
  accountLocked: number;
};

const SEVERITY_CONFIG: Record<string, { label: string; badge: string; border: string; bg: string }> = {
  CRITICAL: { label: '危険 (緊急)', badge: 'bg-red-600 text-white', border: 'border-red-300', bg: 'bg-red-50/50' },
  WARNING: { label: '警告', badge: 'bg-amber-500 text-white', border: 'border-amber-300', bg: 'bg-amber-50/50' },
  INFO: { label: '注意・情報', badge: 'bg-blue-600 text-white', border: 'border-blue-200', bg: 'bg-white' },
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  AUTH_FAILURE: 'ログイン失敗',
  ACCOUNT_LOCKED: 'アカウント自動ロック',
  INVALID_SIGNATURE: 'Cookie改ざん・偽造検知',
  FORBIDDEN_STORE_ACCESS: '他テナント店舗アクセス遮断',
  FORBIDDEN_ROLE_ACCESS: '権限外リクエスト遮断',
  SUSPICIOUS_REQUEST: '不審なリクエスト',
  SYSTEM_ERROR: 'サーバー内部エラー',
};

export default function SecurityLogsClient({
  initialLogs,
  stats,
}: {
  initialLogs: SecurityLog[];
  stats: SecurityStats;
}) {
  const [logs] = useState<SecurityLog[]>(initialLogs);
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedEventType, setSelectedEventType] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<SecurityLog | null>(null);

  // フィルタリング
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (selectedSeverity !== 'ALL' && log.severity !== selectedSeverity) return false;
      if (selectedEventType !== 'ALL' && log.event_type !== selectedEventType) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const msg = (log.message || '').toLowerCase();
        const user = (log.username_attempted || log.user_name || '').toLowerCase();
        const ip = (log.ip_address || '').toLowerCase();
        const t = (log.tenant_name || '').toLowerCase();
        if (!msg.includes(q) && !user.includes(q) && !ip.includes(q) && !t.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [logs, selectedSeverity, selectedEventType, searchTerm]);

  // JSON整形
  const formatJson = (data: any) => {
    if (!data) return '（詳細メタデータなし）';
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
      <div>
        <h2 className="text-3xl font-extrabold text-slate-800 flex items-center gap-3">
          <span>🛡️</span> システム・セキュリティ監査ログ
        </h2>
        <p className="text-slate-500 mt-2">
          ログイン失敗、不正アクセス試行、セッション改ざん等のセキュリティイベントを自動監視します。
        </p>
      </div>

      {/* サマリーカード（過去24時間） */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400">過去24時間の検知総数</div>
            <div className="text-2xl font-black text-slate-800 mt-1">{stats.total} 件</div>
          </div>
          <span className="text-3xl">📡</span>
        </div>

        <div className={`rounded-2xl p-5 border shadow-sm flex items-center justify-between ${
          stats.critical > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'
        }`}>
          <div>
            <div className="text-xs font-bold text-red-600">危険・重大イベント</div>
            <div className={`text-2xl font-black mt-1 ${stats.critical > 0 ? 'text-red-700' : 'text-slate-800'}`}>
              {stats.critical} 件
            </div>
          </div>
          <span className="text-3xl">🔴</span>
        </div>

        <div className={`rounded-2xl p-5 border shadow-sm flex items-center justify-between ${
          stats.warning > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'
        }`}>
          <div>
            <div className="text-xs font-bold text-amber-700">警告・アカウントロック</div>
            <div className={`text-2xl font-black mt-1 ${stats.warning > 0 ? 'text-amber-800' : 'text-slate-800'}`}>
              {stats.accountLocked} 件
            </div>
          </div>
          <span className="text-3xl">🔒</span>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-blue-600">ログイン失敗試行</div>
            <div className="text-2xl font-black text-slate-800 mt-1">{stats.authFailures} 件</div>
          </div>
          <span className="text-3xl">🔑</span>
        </div>
      </div>

      {/* 初心者向けガイダンスバナー */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-6 shadow-md border border-slate-800">
        <div className="flex items-start gap-4">
          <span className="text-3xl shrink-0">💡</span>
          <div>
            <h3 className="font-bold text-base text-indigo-200">
              セキュリティログの見方と対処のアドバイス
            </h3>
            <p className="text-sm text-slate-300 mt-1 leading-relaxed">
              システムは不正なアクセスや改ざんを自動的に遮断・ロックして店舗運用を保護しています。
              各ログに記載されている「推奨される対応」をご確認ください。単発のログイン失敗はスタッフの入力ミスの可能性が高いため、過度にご心配いただく必要はありません。
            </p>
          </div>
        </div>
      </div>

      {/* フィルタバー */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="メッセージ、試行ユーザー名、IPアドレスで検索..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 min-w-[220px] border border-slate-300 rounded-xl px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />

        <select
          value={selectedSeverity}
          onChange={(e) => setSelectedSeverity(e.target.value)}
          className="border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer"
        >
          <option value="ALL">重要度：すべて</option>
          <option value="CRITICAL">🔴 危険 (CRITICAL)</option>
          <option value="WARNING">🟠 警告 (WARNING)</option>
          <option value="INFO">🔵 情報 (INFO)</option>
        </select>

        <select
          value={selectedEventType}
          onChange={(e) => setSelectedEventType(e.target.value)}
          className="border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer"
        >
          <option value="ALL">イベント種別：すべて</option>
          {Object.entries(EVENT_TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>

        <div className="text-sm font-bold text-slate-500 ml-auto whitespace-nowrap">
          {filteredLogs.length} 件を表示中
        </div>
      </div>

      {/* ログ一覧 */}
      <div className="space-y-3">
        {filteredLogs.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center text-slate-400 font-bold border border-slate-200">
            検知されたセキュリティイベントはありません。システムは正常に稼働しています。
          </div>
        ) : (
          filteredLogs.map((log) => {
            const sev = SEVERITY_CONFIG[log.severity] || SEVERITY_CONFIG.INFO;
            const eventLabel = EVENT_TYPE_LABELS[log.event_type] || log.event_type;
            const dateStr = new Date(log.created_at).toLocaleString('ja-JP');

            return (
              <div
                key={log.id}
                className={`rounded-2xl p-5 border shadow-xs transition-all hover:shadow-md cursor-pointer ${sev.border} ${sev.bg}`}
                onClick={() => setSelectedLog(log)}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1">
                    {/* ヘッダーバッジ */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full ${sev.badge}`}>
                        {sev.label}
                      </span>
                      <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                        {eventLabel}
                      </span>
                      {log.tenant_name && (
                        <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                          🏢 {log.tenant_name}
                        </span>
                      )}
                      <span className="text-xs font-mono text-slate-400 ml-auto md:ml-0">
                        {dateStr}
                      </span>
                    </div>

                    {/* メッセージ */}
                    <h4 className="text-base font-bold text-slate-900 mt-1">
                      {log.message}
                    </h4>

                    {/* 推奨される対応（Superadmin向けガイダンス） */}
                    {log.action_advice && (
                      <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 flex items-start gap-2">
                        <span className="text-emerald-600 font-bold shrink-0">✅ 推奨対応:</span>
                        <span className="font-medium leading-relaxed">{log.action_advice}</span>
                      </div>
                    )}
                  </div>

                  {/* 右側：IP・ユーザー情報 */}
                  <div className="text-right shrink-0 text-xs text-slate-500 space-y-1">
                    {log.username_attempted && (
                      <div>
                        試行ユーザー名: <span className="font-mono font-bold text-slate-800">{log.username_attempted}</span>
                      </div>
                    )}
                    {log.ip_address && (
                      <div>
                        IP: <span className="font-mono text-slate-600">{log.ip_address}</span>
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedLog(log);
                      }}
                      className="mt-1 text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
                    >
                      詳細情報を見る ▶
                    </button>
                  </div>
                </div>
              </div>
            );
          })
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
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    SEVERITY_CONFIG[selectedLog.severity]?.badge || 'bg-slate-700 text-white'
                  }`}>
                    {selectedLog.severity}
                  </span>
                  <span className="text-xs font-bold text-slate-500">
                    ID: {selectedLog.id}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mt-1">
                  {selectedLog.message}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  発生日時: {new Date(selectedLog.created_at).toLocaleString('ja-JP')}
                </p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-slate-50 space-y-4">
              {/* 対処ガイダンス */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                <div className="text-xs font-bold text-emerald-800 uppercase tracking-wide">
                  🛡️ 管理者の推奨アクション
                </div>
                <div className="text-sm font-bold text-emerald-950 mt-1 leading-relaxed">
                  {selectedLog.action_advice || '特に操作は不要です。'}
                </div>
              </div>

              {/* アクセス情報 */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500 font-bold">イベント種別</span>
                  <span className="font-mono font-bold text-slate-800">{selectedLog.event_type}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500 font-bold">IPアドレス</span>
                  <span className="font-mono text-slate-800">{selectedLog.ip_address || '不明'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500 font-bold">エンドポイント</span>
                  <span className="font-mono text-slate-800">{selectedLog.endpoint || '-'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500 font-bold">試行ユーザー名</span>
                  <span className="font-mono text-slate-800">{selectedLog.username_attempted || '-'}</span>
                </div>
                {selectedLog.user_agent && (
                  <div className="py-1">
                    <span className="text-slate-500 font-bold block mb-1">User Agent</span>
                    <span className="font-mono text-slate-700 text-[11px] break-all bg-slate-50 p-2 rounded block">
                      {selectedLog.user_agent}
                    </span>
                  </div>
                )}
              </div>

              {/* メタデータ */}
              {selectedLog.metadata && (
                <div>
                  <h4 className="text-xs font-bold text-slate-600 mb-1">詳細メタデータ (JSON)</h4>
                  <pre className="bg-slate-800 text-slate-200 p-4 rounded-xl text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-48">
                    {formatJson(selectedLog.metadata)}
                  </pre>
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
