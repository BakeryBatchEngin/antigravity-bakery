'use client';

import { useState } from 'react';

export default function AuditLogsTable({ logs }: { logs: any[] }) {
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const formatJson = (data: any) => {
    if (!data) return 'データなし';
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      return String(data);
    }
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-sm border-b border-slate-200">
                <th className="p-4 font-medium">日時</th>
                <th className="p-4 font-medium">店舗</th>
                <th className="p-4 font-medium">ユーザー</th>
                <th className="p-4 font-medium">操作</th>
                <th className="p-4 font-medium">対象テーブル</th>
                <th className="p-4 font-medium">変更詳細</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    ログはまだありません
                  </td>
                </tr>
              ) : (
                logs.map((log: any) => {
                  let diffPreview = '';
                  if (log.action === 'INSERT') diffPreview = '新規追加';
                  else if (log.action === 'DELETE') diffPreview = '削除';
                  else if (log.action === 'UPDATE') diffPreview = '更新';

                  const dateStr = new Date(log.created_at).toLocaleString('ja-JP');

                  return (
                    <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50 transition cursor-pointer" onClick={() => setSelectedLog(log)}>
                      <td className="p-4 whitespace-nowrap text-slate-500">{dateStr}</td>
                      <td className="p-4 font-medium text-slate-700">{log.store_name || 'システム'}</td>
                      <td className="p-4 text-slate-600">{log.user_name || '不明'}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          log.action === 'INSERT' ? 'bg-green-100 text-green-700' :
                          log.action === 'DELETE' ? 'bg-red-100 text-red-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="p-4 text-slate-600 font-mono text-xs">{log.table_name}</td>
                      <td className="p-4">
                        <button 
                          className="text-indigo-600 hover:text-indigo-800 underline font-medium text-xs bg-indigo-50 px-2 py-1 rounded"
                          onClick={(e) => { e.stopPropagation(); setSelectedLog(log); }}
                        >
                          詳細を見る (ID: {log.record_id})
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

      {/* モーダル表示 */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedLog(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-slate-800">ログ詳細情報</h3>
                <p className="text-sm text-slate-500 mt-1">
                  対象: <span className="font-mono text-indigo-600">{selectedLog.table_name}</span> (ID: {selectedLog.record_id})
                </p>
              </div>
              <button 
                onClick={() => setSelectedLog(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
              <div className="space-y-6">
                
                {/* 変更前のデータ (UPDATE, DELETEの場合) */}
                {selectedLog.old_data && (
                  <div>
                    <h4 className="text-sm font-bold text-slate-700 mb-2 border-l-4 border-amber-500 pl-2">変更前のデータ (Old Data)</h4>
                    <pre className="bg-slate-800 text-amber-100 p-4 rounded-xl text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                      {formatJson(selectedLog.old_data)}
                    </pre>
                  </div>
                )}

                {/* 変更後のデータ (INSERT, UPDATEの場合) */}
                {selectedLog.new_data && (
                  <div>
                    <h4 className="text-sm font-bold text-slate-700 mb-2 border-l-4 border-emerald-500 pl-2">保存されたデータ (New Data)</h4>
                    <pre className="bg-slate-800 text-emerald-100 p-4 rounded-xl text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                      {formatJson(selectedLog.new_data)}
                    </pre>
                  </div>
                )}
                
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-white rounded-b-2xl flex justify-end">
              <button 
                onClick={() => setSelectedLog(null)}
                className="px-6 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 font-medium transition shadow-md"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
