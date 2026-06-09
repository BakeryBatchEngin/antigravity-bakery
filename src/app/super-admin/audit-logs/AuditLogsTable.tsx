'use client';

import { useState, useMemo } from 'react';

type Log = {
  id: number;
  action: string;
  table_name: string;
  record_id: string;
  old_data: any;
  new_data: any;
  created_at: string;
  store_id: number | null;
  user_name: string | null;
  store_name: string | null;
  tenant_id: number | null;
  tenant_name: string | null;
};

type Tenant = {
  id: number;
  tenant_code: string;
  tenant_name: string;
};

const ACTION_STYLE: Record<string, string> = {
  INSERT: 'bg-green-100 text-green-700',
  DELETE: 'bg-red-100 text-red-700',
  UPDATE: 'bg-blue-100 text-blue-700',
};

const ACTION_LABEL: Record<string, string> = {
  INSERT: '登録',
  DELETE: '削除',
  UPDATE: '更新',
};

// テーブル名を日本語に変換
const TABLE_LABEL: Record<string, string> = {
  daily_production_plans: '仕込み計画',
  ingredient_usages:      '材料使用記録',
  order_breakdowns:       '発注内訳',
  orders:                 '注文',
  stores:                 '店舗',
  users:                  'ユーザー',
  tenants:                'テナント',
  products:               '商品',
  ingredients:            '材料',
  doughs:                 '生地',
};

export default function AuditLogsTable({ logs, tenants }: { logs: Log[]; tenants: Tenant[] }) {
  const [selectedLog, setSelectedLog] = useState<Log | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null); // null = 全テナント
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [tableFilter, setTableFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  // テーブル名の一覧（フィルタ用）
  const tableNames = useMemo(() => {
    const names = Array.from(new Set(logs.map(l => l.table_name))).sort();
    return names;
  }, [logs]);

  // フィルタ処理
  const filtered = useMemo(() => {
    return logs.filter(log => {
      if (selectedTenantId !== null && log.tenant_id !== selectedTenantId) return false;
      if (actionFilter !== 'ALL' && log.action !== actionFilter) return false;
      if (tableFilter !== 'ALL' && log.table_name !== tableFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !(log.user_name || '').toLowerCase().includes(q) &&
          !(log.store_name || '').toLowerCase().includes(q) &&
          !(log.table_name || '').toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [logs, selectedTenantId, actionFilter, tableFilter, search]);

  // JSON整形
  const formatJson = (data: any) => {
    if (!data) return 'データなし';
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      return String(data);
    }
  };

  // CSV出力
  const exportCsv = () => {
    const header = [
      'ID', '日時', 'テナント', '店舗', 'ユーザー',
      '操作', '対象テーブル', 'レコードID',
      '変更前データ', '変更後データ',
    ];

    const formatForCsv = (log: Log, data: any) => {
      // 仕込み計画は非常に大きいため省略
      if (log.table_name === 'daily_production_plans') {
        return '（データ量が大きいため省略）';
      }
      if (!data) return '';
      try {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        return JSON.stringify(parsed);
      } catch {
        return String(data);
      }
    };

    const rows = filtered.map(log => [
      log.id,
      new Date(log.created_at).toLocaleString('ja-JP'),
      log.tenant_name || 'システム',
      log.store_name || '-',
      log.user_name || '不明',
      `${log.action}（${ACTION_LABEL[log.action] || log.action}）`,
      TABLE_LABEL[log.table_name] || log.table_name,
      log.record_id || '-',
      formatForCsv(log, log.old_data),
      formatForCsv(log, log.new_data),
    ]);

    const csvContent = [header, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const bom = '\uFEFF'; // Excel文字化け対策
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `audit_logs_${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* テナント切り替えタブ */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedTenantId(null)}
          className={`px-4 py-2 rounded-full text-sm font-semibold transition border ${
            selectedTenantId === null
              ? 'bg-slate-800 text-white border-slate-800'
              : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'
          }`}
        >
          🌐 全テナント（{logs.length}件）
        </button>
        {tenants.map(t => {
          const count = logs.filter(l => l.tenant_id === t.id).length;
          return (
            <button
              key={t.id}
              onClick={() => setSelectedTenantId(t.id)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition border ${
                selectedTenantId === t.id
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'
              }`}
            >
              🏢 {t.tenant_name}（{count}件）
            </button>
          );
        })}
        {/* 店舗未紐付けのシステムログ */}
        {(() => {
          const sysCount = logs.filter(l => l.tenant_id === null).length;
          return sysCount > 0 ? (
            <button
              onClick={() => setSelectedTenantId(-1)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition border ${
                selectedTenantId === -1
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-white text-amber-600 border-amber-300 hover:border-amber-500'
              }`}
            >
              ⚙️ システム（{sysCount}件）
            </button>
          ) : null;
        })()}
      </div>

      {/* フィルタバー */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3 items-center">
        <input
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white w-48 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          placeholder="店舗・ユーザー・テーブルで検索"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
        >
          <option value="ALL">操作：すべて</option>
          <option value="INSERT">INSERT（登録）</option>
          <option value="UPDATE">UPDATE（更新）</option>
          <option value="DELETE">DELETE（削除）</option>
        </select>
        <select
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          value={tableFilter}
          onChange={e => setTableFilter(e.target.value)}
        >
          <option value="ALL">テーブル：すべて</option>
          {tableNames.map(name => (
            <option key={name} value={name}>{TABLE_LABEL[name] || name}</option>
          ))}
        </select>
        <span className="text-sm text-slate-500 ml-auto">
          {filtered.length} 件表示中
        </span>
        <button
          onClick={exportCsv}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition shadow-sm"
        >
          📥 CSV出力
        </button>
      </div>

      {/* テーブル */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-sm border-b border-slate-200">
                <th className="p-4 font-medium">日時</th>
                {selectedTenantId === null && <th className="p-4 font-medium">テナント</th>}
                <th className="p-4 font-medium">店舗</th>
                <th className="p-4 font-medium">ユーザー</th>
                <th className="p-4 font-medium">操作</th>
                <th className="p-4 font-medium">対象</th>
                <th className="p-4 font-medium">詳細</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    該当するログがありません
                  </td>
                </tr>
              ) : (
                filtered.map((log) => {
                  const dateStr = new Date(log.created_at).toLocaleString('ja-JP');
                  return (
                    <tr
                      key={log.id}
                      className="border-b border-slate-100 hover:bg-slate-50 transition cursor-pointer"
                      onClick={() => setSelectedLog(log)}
                    >
                      <td className="p-4 whitespace-nowrap text-slate-500 text-xs">{dateStr}</td>
                      {selectedTenantId === null && (
                        <td className="p-4 text-xs text-indigo-600 font-medium">
                          {log.tenant_name || <span className="text-slate-300">システム</span>}
                        </td>
                      )}
                      <td className="p-4 font-medium text-slate-700">{log.store_name || <span className="text-slate-300">-</span>}</td>
                      <td className="p-4 text-slate-600">{log.user_name || <span className="text-slate-400">不明</span>}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${ACTION_STYLE[log.action] || 'bg-slate-100 text-slate-600'}`}>
                          {ACTION_LABEL[log.action] || log.action}
                        </span>
                      </td>
                      <td className="p-4 text-slate-500 text-xs">
                        {TABLE_LABEL[log.table_name] || log.table_name}
                      </td>
                      <td className="p-4">
                        <button
                          className="text-indigo-600 hover:text-indigo-800 underline font-medium text-xs bg-indigo-50 px-2 py-1 rounded"
                          onClick={e => { e.stopPropagation(); setSelectedLog(log); }}
                        >
                          詳細 (ID:{log.record_id})
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 詳細モーダル */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedLog(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-slate-800">ログ詳細情報</h3>
                <p className="text-sm text-slate-500 mt-1">
                  <span className="font-mono text-indigo-600">{TABLE_LABEL[selectedLog.table_name] || selectedLog.table_name}</span>
                  　{selectedLog.tenant_name ? `｜${selectedLog.tenant_name}` : ''}
                  　{selectedLog.store_name ? `｜${selectedLog.store_name}` : ''}
                  　(ID: {selectedLog.record_id})
                </p>
              </div>
              <button onClick={() => setSelectedLog(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600">✕</button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50 space-y-6">
              {selectedLog.old_data && (
                <div>
                  <h4 className="text-sm font-bold text-slate-700 mb-2 border-l-4 border-amber-500 pl-2">変更前のデータ</h4>
                  <pre className="bg-slate-800 text-amber-100 p-4 rounded-xl text-xs font-mono overflow-x-auto whitespace-pre-wrap">{formatJson(selectedLog.old_data)}</pre>
                </div>
              )}
              {selectedLog.new_data && (
                <div>
                  <h4 className="text-sm font-bold text-slate-700 mb-2 border-l-4 border-emerald-500 pl-2">保存されたデータ</h4>
                  <pre className="bg-slate-800 text-emerald-100 p-4 rounded-xl text-xs font-mono overflow-x-auto whitespace-pre-wrap">{formatJson(selectedLog.new_data)}</pre>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-white rounded-b-2xl flex justify-end">
              <button onClick={() => setSelectedLog(null)} className="px-6 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 font-medium transition shadow-md">閉じる</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
