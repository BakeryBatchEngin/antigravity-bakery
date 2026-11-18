'use client';

import { useState, useRef } from 'react';

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  super_admin:   { label: 'システム管理者', color: 'bg-purple-100 text-purple-700' },
  admin:         { label: '管理者',         color: 'bg-indigo-100 text-indigo-700' },
  master:        { label: 'マスター',       color: 'bg-blue-100 text-blue-700' },
  manager:       { label: 'マネージャー',   color: 'bg-cyan-100 text-cyan-700' },
  company_loss_manager: { label: '企業ロス統括管理者', color: 'bg-rose-100 text-rose-700' },
  area_loss_manager:    { label: 'エリアロス統括マネージャー', color: 'bg-sky-100 text-sky-700' },
  store_loss_manager:   { label: '店舗ロス管理者',   color: 'bg-orange-100 text-orange-700' },
  chef:          { label: 'シェフ',         color: 'bg-emerald-100 text-emerald-700' },
};

type User = {
  id: number;
  username: string;
  display_name: string;
  role: string;
  has_pin?: boolean;
  has_password?: boolean;
  failed_attempts?: number;
  locked_until?: string | null;
  is_locked?: boolean;
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
  const [unlockLoadingId, setUnlockLoadingId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 雛形（テンプレートExcel）ダウンロード
  const downloadTemplate = async () => {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('ユーザー一括登録');

      ws.columns = [
        { header: '会社コード（必須）', key: 'tenant_code', width: 22 },
        { header: 'ユーザー名（必須）', key: 'username', width: 20 },
        { header: '表示名（必須）', key: 'display_name', width: 22 },
        { header: '権限（必須）', key: 'role', width: 20 },
        { header: '初期パスワード', key: 'password', width: 18 },
        { header: 'PINコード', key: 'pin_code', width: 14 },
        { header: '担当店舗コード（カンマ区切り可）', key: 'store_codes', width: 30 },
      ];

      const headerRow = ws.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4F46E5' },
      };

      // サンプル行
      const sampleTenant = tenants[0]?.tenant_code || 'DELICE';
      ws.addRow({
        tenant_code: sampleTenant,
        username: 'tanaka_chef',
        display_name: '田中 一郎',
        role: 'シェフ',
        password: 'InitPassword123!',
        pin_code: '1234',
        store_codes: 'S001',
      });
      ws.addRow({
        tenant_code: sampleTenant,
        username: 'sato_manager',
        display_name: '佐藤 次郎',
        role: '店長',
        password: 'InitPassword123!',
        pin_code: '5678',
        store_codes: 'S001,S002',
      });
      ws.addRow({
        tenant_code: sampleTenant,
        username: 'yamada_area',
        display_name: '山田 三郎',
        role: 'エリアロス統括マネージャー',
        password: 'InitPassword123!',
        pin_code: '',
        store_codes: 'S001,S002',
      });
      ws.addRow({
        tenant_code: sampleTenant,
        username: 'suzuki_loss',
        display_name: '鈴木 花子',
        role: '店舗ロス管理者',
        password: 'InitPassword123!',
        pin_code: '',
        store_codes: 'S001',
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ユーザー一括登録_雛形_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`雛形作成に失敗しました: ${err.message}`);
    }
  };

  // Excelファイル選択・一括インポート
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm(`選択したExcelファイル「${file.name}」からユーザーデータを一括登録しますか？`)) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/super-admin/users/import', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) {
        alert(`${json.error || '登録に失敗しました'}\n\n詳細:\n${json.details || '不明なエラー'}`);
        return;
      }

      alert(
        `一括登録が完了しました！\n\n登録成功: ${json.count} 名${
          json.skippedCount > 0 ? `\nスキップ（既存）: ${json.skippedCount} 名` : ''
        }`
      );
      await refreshList();
    } catch (err: any) {
      alert(`通信エラーが発生しました: ${err.message}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 選択中テナントに絞った店舗リスト（未選択の場合は他社店舗が表示されないよう空にする）
  const filteredStores = modal.data.tenant_id
    ? stores.filter(s => s.tenant_id === Number(modal.data.tenant_id))
    : [];

  const openAdd = () => setModal({ open: true, mode: 'add', data: emptyUser() });
  const openEdit = (u: User) => setModal({
    open: true, mode: 'edit',
    data: { ...u, password: '', pin_code: '', store_ids: [] },
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
    // super_admin 以外は所属会社（tenant_id）の選択が必須
    if (modal.data.role !== 'super_admin' && !modal.data.tenant_id) {
      setError('システム管理者以外の権限では、所属会社（テナント）の選択が必須です');
      return;
    }

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

  // アカウントのロック解除
  const handleUnlock = async (u: User) => {
    if (!confirm(`ユーザー「${u.display_name}」のアカウントロックを解除しますか？`)) return;

    setUnlockLoadingId(u.id);
    try {
      const res = await fetch('/api/super-admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'ロック解除に失敗しました');
      await refreshList();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setUnlockLoadingId(null);
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
          <div className="flex flex-wrap items-center gap-2.5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleImportExcel}
            />

            <button
              onClick={downloadTemplate}
              type="button"
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 rounded-lg text-sm font-semibold transition"
              title="一括登録用のExcel雛形をダウンロードします"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              雛形DL
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              type="button"
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg text-sm font-bold transition shadow disabled:opacity-50"
              title="Excelファイルを選択してユーザーを一括登録します"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              {importing ? '登録中...' : 'Excel一括登録'}
            </button>

            <button
              onClick={openAdd}
              type="button"
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition shadow"
            >
              ＋ 新規ユーザー追加
            </button>
          </div>
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
                <th className="p-4 font-medium">認証設定 / 状態</th>
                <th className="p-4 font-medium">登録日</th>
                <th className="p-4 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-slate-400">該当するユーザーがいません</td></tr>
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
                      <td className="p-4 text-xs">
                        {u.is_locked ? (
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-bold flex items-center gap-1 border border-red-200">
                              <span>🔒</span> ロック中
                            </span>
                            <button
                              onClick={() => handleUnlock(u)}
                              disabled={unlockLoadingId === u.id}
                              className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200 transition font-bold"
                            >
                              {unlockLoadingId === u.id ? '解除中...' : '解除'}
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {u.has_password && <span className="text-indigo-600 font-medium">● PW設定済</span>}
                            {u.has_pin && <span className="text-amber-600 font-medium">● PIN設定済 (暗号化)</span>}
                            {!u.has_password && !u.has_pin && <span className="text-slate-400 italic">未設定</span>}
                          </div>
                        )}
                      </td>
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
                    placeholder={modal.mode === 'edit' ? '変更時のみ入力（空欄=変更なし）' : 'パスワード'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    PINコード（4桁数字）
                    <span className="text-xs text-slate-400 font-normal block sm:inline sm:ml-1">※暗号化保存</span>
                  </label>
                  <input
                    type="password"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={modal.data.pin_code}
                    onChange={e => setModal(m => ({ ...m, data: { ...m.data, pin_code: e.target.value } }))}
                    maxLength={4}
                    placeholder={modal.mode === 'edit' ? '変更時のみ入力（空欄=変更なし）' : '0000'}
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
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  所属会社（テナント）
                  {modal.data.role !== 'super_admin' && <span className="text-red-500 font-bold ml-1">*必須</span>}
                </label>
                <select
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={modal.data.tenant_id || ''}
                  onChange={e => setModal(m => ({ ...m, data: { ...m.data, tenant_id: e.target.value ? Number(e.target.value) : null, store_ids: [] } }))}
                >
                  {modal.data.role === 'super_admin' ? (
                    <option value="">（なし / システム管理者）</option>
                  ) : (
                    <option value="">-- 所属会社を選択してください --</option>
                  )}
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.tenant_name}</option>)}
                </select>
              </div>
              {modal.data.role !== 'super_admin' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">担当店舗（複数選択可）</label>
                  {modal.data.tenant_id ? (
                    filteredStores.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto border border-slate-200 rounded-lg p-3 bg-slate-50">
                        {filteredStores.map(s => (
                          <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer hover:text-indigo-600">
                            <input
                              type="checkbox"
                              checked={(modal.data.store_ids || []).includes(s.id)}
                              onChange={() => toggleStore(s.id)}
                              className="accent-indigo-600 w-4 h-4 rounded"
                            />
                            {s.store_name}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg p-3 bg-slate-50">
                        この会社にはまだ登録されている店舗がありません。
                      </p>
                    )
                  ) : (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      ⚠️ 上記の「所属会社（テナント）」を選択すると、その会社の店舗が表示されます。
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50 rounded-b-2xl">
              <button onClick={closeModal} className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-100 transition">
                キャンセル
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition disabled:opacity-50 shadow"
              >
                {loading ? '保存中...' : '保存する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 削除確認モーダル */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <h4 className="text-lg font-bold text-slate-800">ユーザーの削除確認</h4>
            <p className="text-sm text-slate-600">
              「<span className="font-semibold text-slate-900">{deleteConfirm.display_name}</span>（@{deleteConfirm.username}）」を本当に削除しますか？この操作は取り消せません。
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-100 transition">
                キャンセル
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={loading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50 shadow"
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
