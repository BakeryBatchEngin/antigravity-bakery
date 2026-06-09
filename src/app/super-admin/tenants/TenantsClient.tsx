'use client';

import { useState } from 'react';

const PLAN_LABELS: Record<string, string> = {
  basic: 'ベーシック',
  standard: 'スタンダード',
  premium: 'プレミアム',
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active:    { label: '契約中',   color: 'bg-emerald-100 text-emerald-700' },
  suspended: { label: '停止中',   color: 'bg-red-100 text-red-700' },
  trial:     { label: 'トライアル', color: 'bg-amber-100 text-amber-700' },
};

type Tenant = {
  id: number;
  tenant_code: string;
  tenant_name: string;
  plan: string;
  status: string;
  created_at: string;
  store_count: number;
  user_count: number;
};

const emptyTenant = (): Partial<Tenant> => ({
  tenant_code: '',
  tenant_name: '',
  plan: 'basic',
  status: 'active',
});

export default function TenantsClient({ tenants: initialTenants }: { tenants: Tenant[] }) {
  const [tenants, setTenants] = useState<Tenant[]>(initialTenants);
  const [modal, setModal] = useState<{ open: boolean; mode: 'add' | 'edit'; data: Partial<Tenant> }>({
    open: false, mode: 'add', data: emptyTenant(),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<Tenant | null>(null);

  const openAdd = () => setModal({ open: true, mode: 'add', data: emptyTenant() });
  const openEdit = (t: Tenant) => setModal({ open: true, mode: 'edit', data: { ...t } });
  const closeModal = () => { setModal(m => ({ ...m, open: false })); setError(''); };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/super-admin/tenants', {
        method: modal.mode === 'add' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modal.data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '保存に失敗しました');

      // 一覧を再取得
      const listRes = await fetch('/api/super-admin/tenants');
      const listJson = await listRes.json();
      setTenants(listJson.tenants || []);
      closeModal();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (tenant: Tenant) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/super-admin/tenants?id=${tenant.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '削除に失敗しました');
      setTenants(prev => prev.filter(t => t.id !== tenant.id));
      setDeleteConfirm(null);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-slate-100">
          <span className="text-sm text-slate-500">全 <strong>{tenants.length}</strong> 件のテナント</span>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition shadow"
          >
            ＋ 新規テナント追加
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <th className="p-4 font-medium">コード</th>
                <th className="p-4 font-medium">会社名</th>
                <th className="p-4 font-medium">プラン</th>
                <th className="p-4 font-medium">状態</th>
                <th className="p-4 font-medium text-center">店舗数</th>
                <th className="p-4 font-medium text-center">ユーザー数</th>
                <th className="p-4 font-medium">登録日</th>
                <th className="p-4 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {tenants.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-slate-400">テナントがまだ登録されていません</td></tr>
              ) : (
                tenants.map(t => {
                  const st = STATUS_LABELS[t.status] || { label: t.status, color: 'bg-slate-100 text-slate-600' };
                  return (
                    <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                      <td className="p-4 font-mono font-bold text-indigo-600">{t.tenant_code}</td>
                      <td className="p-4 font-semibold text-slate-800">{t.tenant_name}</td>
                      <td className="p-4 text-slate-600">{PLAN_LABELS[t.plan] || t.plan}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${st.color}`}>{st.label}</span>
                      </td>
                      <td className="p-4 text-center font-bold text-slate-700">{t.store_count}</td>
                      <td className="p-4 text-center font-bold text-slate-700">{t.user_count}</td>
                      <td className="p-4 text-slate-500 text-xs">{new Date(t.created_at).toLocaleDateString('ja-JP')}</td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <button onClick={() => openEdit(t)} className="px-3 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded font-medium transition">編集</button>
                          <button onClick={() => setDeleteConfirm(t)} className="px-3 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-600 rounded font-medium transition">削除</button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 追加・編集モーダル */}
      {modal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-800">
                {modal.mode === 'add' ? '新規テナント追加' : 'テナント情報の編集'}
              </h3>
            </div>
            <div className="p-6 space-y-4">
              {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">テナントコード（半角英数）</label>
                <input
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono disabled:bg-slate-100 disabled:text-slate-500"
                  value={modal.data.tenant_code || ''}
                  onChange={e => setModal(m => ({ ...m, data: { ...m.data, tenant_code: e.target.value.toUpperCase() } }))}
                  placeholder="例: MK"
                  disabled={modal.mode === 'edit'}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">会社名</label>
                <input
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={modal.data.tenant_name || ''}
                  onChange={e => setModal(m => ({ ...m, data: { ...m.data, tenant_name: e.target.value } }))}
                  placeholder="例: 株式会社MKベーカリー"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">プラン</label>
                <select
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={modal.data.plan || 'basic'}
                  onChange={e => setModal(m => ({ ...m, data: { ...m.data, plan: e.target.value } }))}
                >
                  <option value="basic">ベーシック</option>
                  <option value="standard">スタンダード</option>
                  <option value="premium">プレミアム</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">状態</label>
                <select
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={modal.data.status || 'active'}
                  onChange={e => setModal(m => ({ ...m, data: { ...m.data, status: e.target.value } }))}
                >
                  <option value="active">契約中</option>
                  <option value="trial">トライアル</option>
                  <option value="suspended">停止中</option>
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={closeModal} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition">キャンセル</button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="px-6 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
              >
                {loading ? '保存中...' : '保存する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 削除確認モーダル */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 mb-2">本当に削除しますか？</h3>
            <p className="text-sm text-slate-500 mb-6">「{deleteConfirm.tenant_name}」を削除します。この操作は元に戻せません。</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">キャンセル</button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={loading}
                className="px-4 py-2 text-sm bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
