'use client';

import { useState } from 'react';

type Store = {
  id: number;
  store_code: string;
  store_name: string;
  tenant_id: number;
  tenant_name: string | null;
  tenant_code: string | null;
  created_at: string;
};

type Tenant = {
  id: number;
  tenant_code: string;
  tenant_name: string;
};

const emptyStore = (): any => ({
  store_code: '',
  store_name: '',
  tenant_id: '',
});

export default function StoresClient({
  initialStores,
  tenants,
}: {
  initialStores: Store[];
  tenants: Tenant[];
}) {
  const [stores, setStores] = useState<Store[]>(initialStores);
  const [modal, setModal] = useState<{ open: boolean; mode: 'add' | 'edit'; data: any }>({
    open: false,
    mode: 'add',
    data: emptyStore(),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<Store | null>(null);
  const [search, setSearch] = useState('');
  const [selectedTenantFilter, setSelectedTenantFilter] = useState<string>('all');

  const openAdd = () => {
    setModal({
      open: true,
      mode: 'add',
      data: {
        ...emptyStore(),
        // 絞り込み中のテナントがあれば初期選択
        tenant_id: selectedTenantFilter !== 'all' ? selectedTenantFilter : (tenants[0]?.id ? String(tenants[0].id) : ''),
      },
    });
    setError('');
  };

  const openEdit = (s: Store) => {
    setModal({
      open: true,
      mode: 'edit',
      data: {
        id: s.id,
        store_code: s.store_code,
        store_name: s.store_name,
        tenant_id: String(s.tenant_id),
      },
    });
    setError('');
  };

  const closeModal = () => {
    setModal(m => ({ ...m, open: false }));
    setError('');
  };

  const refreshList = async () => {
    const res = await fetch('/api/super-admin/stores');
    const json = await res.json();
    if (json.stores) setStores(json.stores);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modal.data.tenant_id) {
      setError('所属会社を選択してください');
      return;
    }
    if (!modal.data.store_code || !modal.data.store_name) {
      setError('店舗コードと店舗名は必須です');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/super-admin/stores', {
        method: modal.mode === 'add' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...modal.data,
          tenant_id: Number(modal.data.tenant_id),
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '保存に失敗しました');

      await refreshList();
      closeModal();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (store: Store) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/super-admin/stores?id=${store.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '削除に失敗しました');

      await refreshList();
      setDeleteConfirm(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // フィルタリング処理
  const filteredStores = stores.filter(s => {
    const matchesTenant = selectedTenantFilter === 'all' || String(s.tenant_id) === selectedTenantFilter;
    const matchesSearch =
      s.store_name.toLowerCase().includes(search.toLowerCase()) ||
      s.store_code.toLowerCase().includes(search.toLowerCase()) ||
      (s.tenant_name && s.tenant_name.toLowerCase().includes(search.toLowerCase()));
    return matchesTenant && matchesSearch;
  });

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* 検索・絞り込み・新規ボタン */}
        <div className="flex flex-wrap justify-between items-center p-4 border-b border-slate-100 gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-60 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="店舗名・店舗コード・会社名で検索"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />

            <select
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 font-medium text-slate-700"
              value={selectedTenantFilter}
              onChange={e => setSelectedTenantFilter(e.target.value)}
            >
              <option value="all">すべての会社（テナント）</option>
              {tenants.map(t => (
                <option key={t.id} value={String(t.id)}>
                  {t.tenant_name} ({t.tenant_code})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition shadow"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
            新規店舗追加
          </button>
        </div>

        {/* 店舗一覧テーブル */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <th className="p-4 font-semibold">所属会社（テナント）</th>
                <th className="p-4 font-semibold">店舗コード</th>
                <th className="p-4 font-semibold">店舗名</th>
                <th className="p-4 font-semibold">登録日</th>
                <th className="p-4 font-semibold text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredStores.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    登録されている店舗がありません
                  </td>
                </tr>
              ) : (
                filteredStores.map(s => (
                  <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td className="p-4">
                      <span className="font-semibold text-slate-800">{s.tenant_name || '-'}</span>
                      {s.tenant_code && (
                        <span className="ml-2 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                          {s.tenant_code}
                        </span>
                      )}
                    </td>
                    <td className="p-4 font-mono font-bold text-amber-600">{s.store_code}</td>
                    <td className="p-4 font-bold text-slate-800 text-base">{s.store_name}</td>
                    <td className="p-4 text-slate-500 text-xs">
                      {s.created_at ? new Date(s.created_at).toLocaleDateString('ja-JP') : '-'}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEdit(s)}
                          className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-700 transition"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(s)}
                          className="px-3 py-1.5 text-xs bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-bold transition"
                        >
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 新規・編集モーダル */}
      {modal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-800">
                {modal.mode === 'add' ? '新規店舗の追加' : '店舗情報の編集'}
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm font-bold">{error}</div>}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  所属会社（テナント） <span className="text-red-500 font-bold">*</span>
                </label>
                <select
                  required
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 font-medium"
                  value={modal.data.tenant_id}
                  onChange={e => setModal(m => ({ ...m, data: { ...m.data, tenant_id: e.target.value } }))}
                >
                  <option value="">-- 所属会社を選択してください --</option>
                  {tenants.map(t => (
                    <option key={t.id} value={String(t.id)}>
                      {t.tenant_name} ({t.tenant_code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  店舗コード（半角英数字） <span className="text-red-500 font-bold">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="例: S001 または SHIBUYA"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white font-mono uppercase focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={modal.data.store_code}
                  onChange={e => setModal(m => ({ ...m, data: { ...m.data, store_code: e.target.value.toUpperCase() } }))}
                />
                <p className="text-xs text-slate-400 mt-1">※注文シートの取り込み等で使用される一意のコード</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  店舗名 <span className="text-red-500 font-bold">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="例: 渋谷本店"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 font-medium"
                  value={modal.data.store_name}
                  onChange={e => setModal(m => ({ ...m, data: { ...m.data, store_name: e.target.value } }))}
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-100 transition"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition disabled:opacity-50 shadow"
                >
                  {loading ? '保存中...' : (modal.mode === 'add' ? '追加する' : '更新する')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 削除確認モーダル */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <h4 className="text-lg font-bold text-slate-800">店舗の削除確認</h4>
            <p className="text-sm text-slate-600">
              「<span className="font-semibold text-slate-900">{deleteConfirm.store_name}</span>（{deleteConfirm.store_code}）」を本当に削除しますか？<br />
              <span className="text-xs text-red-500 mt-1 block">※この店舗に関連するデータ（スタッフ所属等）も解除されます。</span>
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-100 transition"
              >
                キャンセル
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={loading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition disabled:opacity-50 shadow"
              >
                {loading ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
