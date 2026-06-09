'use client';

import { useState } from 'react';

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  super_admin: { label: 'システム管理者', color: 'bg-purple-100 text-purple-700' },
  admin:       { label: '管理者',         color: 'bg-indigo-100 text-indigo-700' },
  master:      { label: 'マスター',       color: 'bg-blue-100 text-blue-700' },
  manager:     { label: 'マネージャー',   color: 'bg-cyan-100 text-cyan-700' },
  chef:        { label: 'シェフ',         color: 'bg-emerald-100 text-emerald-700' },
};

type User = {
  id: number;
  username: string;
  display_name: string;
  role: string;
  pin_code: string | null;
  tenant_id: number | null;
  tenant_name: string | null;
  store_names: string | null;
  created_at: string;
};
type Tenant = { id: number; tenant_code: string; tenant_name: string };
type Store  = { id: number; store_name: string; tenant_id: number | null };

const emptyUser = (): any => ({
  username: '', display_name: '', role: 'chef',
  password: '', pin_code: '', tenant_id: null, store_ids: [],
});

export default function UsersClient({
  users: initialUsers, tenants, stores,
}: {
  users: User[]; tenants: Tenant[]; stores: Store[];
}) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [modal, setModal] = useState<{ open: boolean; mode: 'add' | 'edit'; data: any }>({
    open: false, mode: 'add', data: emptyUser(),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<User | null>(null);
  const [search, setSearch] = useState('');

  // 選択中テナントに絞った店舗リスト
  const filteredStores = modal.data.tenant_id
    ? stores.filter(s => s.tenant_id === Number(modal.data.tenant_id))
    : stores;

  const openAdd = () => setModal({ open: true, mode: 'add', data: emptyUser() });
  const openEdit = (u: User) => setModal({
    open: true, mode: 'edit',
    data: { ...u, password: '', pin_code: u.pin_code || '', store_ids: [] },
  });
  const closeModal = () => { setModal(m => ({ ...m, open: false })); setError(''); };

  const toggleStore = (storeId: number) => {
    setModal(m => {
      const ids: number[] = m.data.store_ids || [];
      return {
        ...m,
        data: {
          ...m.data,
          store_ids: ids.includes(storeId) ? ids.filter((i: number) => i !== storeId) : [...ids, storeId],
        },
      };
    });
  };

  const refreshList = async () => {
    const res = await fetch('/api/super-admin/users');
    const json = await res.json();
    setUsers(json.users || []);
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/super-admin/users', {
        method: modal.mode === 'add' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modal.data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '保存に失敗しました');
      await refreshList();
      closeModal();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (u: User) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/super-admin/users?id=${u.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '削除に失敗しました');
      setUsers(prev => prev.filter(x => x.id !== u.id));
      setDeleteConfirm(null);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const filtered = users.filter(u =>
    u.display_name.includes(search) || u.username.includes(search) || (u.tenant_name || '').includes(search)
  );

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex flex-wrap justify-between items-center p-4 border-b border-slate-100 gap-3">
          <input
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            placeholder="名前・ユーザー名・会社名で検索"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition shadow"
          >
            ＋ 新規ユーザー追加
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <th className="p-4 font-medium">表示名</th>
                <th className="p-4 font-medium">ユーザー名</th>
                <th className="p-4 font-medium">権限</th>
                <th className="p-4 font-medium">所属会社</th>
                <th className="p-4 font-medium">担当店舗</th>
                <th className="p-4 font-medium">登録日</th>
                <th className="p-4 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-400">該当するユーザーがいません</td></tr>
              ) : (
                filtered.map(u => {
                  const roleInfo = ROLE_LABELS[u.role] || { label: u.role, color: 'bg-slate-100 text-slate-600' };
                  return (
                    <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                      <td className="p-4 font-semibold text-slate-800">{u.display_name}</td>
                      <td className="p-4 font-mono text-slate-500 text-xs">{u.username}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${roleInfo.color}`}>{roleInfo.label}</span>
                      </td>
                      <td className="p-4 text-slate-600">{u.tenant_name || <span className="text-slate-300">-</span>}</td>
                      <td className="p-4 text-slate-500 text-xs max-w-xs truncate">{u.store_names || <span className="text-slate-300">-</span>}</td>
                      <td className="p-4 text-slate-500 text-xs">{new Date(u.created_at).toLocaleDateString('ja-JP')}</td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <button onClick={() => openEdit(u)} className="px-3 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded font-medium transition">編集</button>
                          <button onClick={() => setDeleteConfirm(u)} className="px-3 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-600 rounded font-medium transition">削除</button>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-800">
                {modal.mode === 'add' ? '新規ユーザー追加' : 'ユーザー情報の編集'}
              </h3>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">表示名</label>
                  <input
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={modal.data.display_name}
                    onChange={e => setModal(m => ({ ...m, data: { ...m.data, display_name: e.target.value } }))}
                    placeholder="例: コレド日本橋シェフ"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">ユーザー名（ログイン用）</label>
                  <input
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-slate-100 disabled:text-slate-500"
                    value={modal.data.username}
                    onChange={e => setModal(m => ({ ...m, data: { ...m.data, username: e.target.value } }))}
                    placeholder="例: coredo_chef"
                    disabled={modal.mode === 'edit'}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">パスワード{modal.mode === 'edit' && <span className="text-slate-400 font-normal">（空欄=変更なし）</span>}</label>
                  <input
                    type="password"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={modal.data.password}
                    onChange={e => setModal(m => ({ ...m, data: { ...m.data, password: e.target.value } }))}
                    placeholder="パスワード"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">PINコード（4桁）</label>
                  <input
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={modal.data.pin_code}
                    onChange={e => setModal(m => ({ ...m, data: { ...m.data, pin_code: e.target.value } }))}
                    maxLength={4}
                    placeholder="0000"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">権限（ロール）</label>
                <select
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={modal.data.role}
                  onChange={e => setModal(m => ({ ...m, data: { ...m.data, role: e.target.value } }))}
                >
                  {Object.entries(ROLE_LABELS).map(([val, info]) => (
                    <option key={val} value={val}>{info.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">所属会社（テナント）</label>
                <select
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={modal.data.tenant_id || ''}
                  onChange={e => setModal(m => ({ ...m, data: { ...m.data, tenant_id: e.target.value ? Number(e.target.value) : null, store_ids: [] } }))}
                >
                  <option value="">（なし / システム管理者）</option>
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.tenant_name}</option>)}
                </select>
              </div>
              {filteredStores.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">担当店舗（複数選択可）</label>
                  <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto border border-slate-200 rounded-lg p-3">
                    {filteredStores.map(s => (
                      <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(modal.data.store_ids || []).includes(s.id)}
                          onChange={() => toggleStore(s.id)}
                          className="accent-indigo-600"
                        />
                        {s.store_name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
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
            <p className="text-sm text-slate-500 mb-6">「{deleteConfirm.display_name}」を削除します。この操作は元に戻せません。</p>
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
