'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import LoadingSpinner from '@/components/LoadingSpinner';

type XmasAccount = {
  id: number;
  tenant_id: number;
  username: string;
  display_name: string;
  role: 'tokyo_store' | 'regional_store' | 'xmas_manager' | 'xmas_factory' | 'xmas_headquarters';
  is_active: boolean;
  created_at: string;
  tenant_name?: string;
};

type Tenant = {
  id: number;
  tenant_code: string;
  tenant_name: string;
};

const ROLE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  tokyo_store: { label: '① 首都圏店舗', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: '🏙️' },
  regional_store: { label: '② 地方店舗', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: '🌾' },
  xmas_manager: { label: '③ クリスマスマネージャー', color: 'bg-purple-100 text-purple-800 border-purple-200', icon: '👔' },
  xmas_factory: { label: '④ 工場アカウント', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: '🏭' },
  xmas_headquarters: { label: '⑤ 本部アカウント（閲覧専用）', color: 'bg-indigo-100 text-indigo-800 border-indigo-200', icon: '🏛️' },
};

export default function XmasAccountsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [accounts, setAccounts] = useState<XmasAccount[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantFilter, setSelectedTenantFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // モーダル管理
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<XmasAccount | null>(null);

  // フォームステート
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    display_name: '',
    role: 'tokyo_store' as 'tokyo_store' | 'regional_store' | 'xmas_manager' | 'xmas_factory' | 'xmas_headquarters',
    tenant_id: '',
    is_active: true,
  });

  useEffect(() => {
    if (!authLoading && user) {
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        router.push('/');
        return;
      }
      fetchAccounts();
    }
  }, [authLoading, user, selectedTenantFilter]);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      setError('');
      const url = selectedTenantFilter 
        ? `/api/admin/xmas-accounts?tenant_id=${selectedTenantFilter}` 
        : '/api/admin/xmas-accounts';
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '取得に失敗しました');

      setAccounts(data.accounts || []);
      if (data.tenants) setTenants(data.tenants);
    } catch (err: any) {
      setError(err.message || 'データ取得中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingAccount(null);
    setFormData({
      username: '',
      password: '',
      display_name: '',
      role: 'tokyo_store',
      tenant_id: tenants.length > 0 ? String(tenants[0].id) : '',
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (account: XmasAccount) => {
    setEditingAccount(account);
    setFormData({
      username: account.username,
      password: '', // パスワードは空（変更時のみ入力）
      display_name: account.display_name,
      role: account.role,
      tenant_id: String(account.tenant_id),
      is_active: account.is_active,
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingAccount(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    try {
      if (editingAccount) {
        // 更新
        const body: any = {
          id: editingAccount.id,
          display_name: formData.display_name,
          role: formData.role,
          is_active: formData.is_active,
        };
        if (formData.password.trim()) {
          body.password = formData.password.trim();
        }

        const res = await fetch('/api/admin/xmas-accounts', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const resData = await res.json();
        if (!res.ok) throw new Error(resData.error || '更新に失敗しました');

        setSuccessMessage('アカウントを更新しました');
      } else {
        // 新規作成
        if (!formData.password) {
          alert('パスワードを入力してください');
          return;
        }

        const res = await fetch('/api/admin/xmas-accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        const resData = await res.json();
        if (!res.ok) throw new Error(resData.error || '作成に失敗しました');

        setSuccessMessage('新規クリスマスアカウントを作成しました');
      }

      handleCloseModal();
      fetchAccounts();
    } catch (err: any) {
      alert(err.message || 'エラーが発生しました');
    }
  };

  const handleDelete = async (account: XmasAccount) => {
    if (!confirm(`クリスマスアカウント「${account.display_name}（${account.username}）」を削除しますか？\n※関連する受注データも削除されます。`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/xmas-accounts?id=${account.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '削除に失敗しました');

      setSuccessMessage('アカウントを削除しました');
      fetchAccounts();
    } catch (err: any) {
      alert(err.message || '削除中にエラーが発生しました');
    }
  };

  if (authLoading || loading) {
    return <LoadingSpinner fullScreen={true} />;
  }

  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        
        {/* ヘッダーエリア */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-6 border-b border-slate-200 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-3xl">🎄</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                クリスマス受発注アカウント管理
              </h1>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              2026年クリスマス期間専用のアカウント（首都圏店舗・地方店舗・マネージャー・工場）の発行と管理を行います。
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleOpenCreateModal}
              className="inline-flex items-center justify-center px-5 py-3 border border-transparent text-sm font-bold rounded-xl text-white bg-red-600 hover:bg-red-700 shadow-md hover:shadow-lg transition-all"
            >
              ＋ 新規アカウント作成
            </button>
          </div>
        </div>

        {/* メッセージ通知 */}
        {successMessage && (
          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl font-bold flex items-center justify-between">
            <span>✅ {successMessage}</span>
            <button onClick={() => setSuccessMessage('')} className="text-emerald-600 hover:text-emerald-800">✕</button>
          </div>
        )}
        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl font-bold flex items-center justify-between">
            <span>⚠️ {error}</span>
            <button onClick={() => setError('')} className="text-red-600 hover:text-red-800">✕</button>
          </div>
        )}

        {/* スーパー管理者用：テナント絞り込み */}
        {isSuperAdmin && tenants.length > 0 && (
          <div className="mt-6 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
            <span className="text-sm font-bold text-slate-700">🏢 テナント絞り込み:</span>
            <select
              value={selectedTenantFilter}
              onChange={(e) => setSelectedTenantFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">全テナント表示</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.tenant_name} ({t.tenant_code})</option>
              ))}
            </select>
          </div>
        )}

        {/* アカウント一覧テーブル */}
        <div className="mt-6 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left">
              <thead className="bg-slate-50">
                <tr>
                  {isSuperAdmin && <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase">会社名</th>}
                  <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase">店舗名・表示名</th>
                  <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase">ログインID</th>
                  <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase">種別 / 役割</th>
                  <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase">状態</th>
                  <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {accounts.length === 0 ? (
                  <tr>
                    <td colSpan={isSuperAdmin ? 6 : 5} className="px-6 py-12 text-center text-slate-400 font-medium">
                      クリスマス専用アカウントはまだ登録されていません。「＋ 新規アカウント作成」から追加してください。
                    </td>
                  </tr>
                ) : (
                  accounts.map((acc) => {
                    const roleInfo = ROLE_LABELS[acc.role] || { label: acc.role, color: 'bg-slate-100 text-slate-800 border-slate-200', icon: '👤' };
                    return (
                      <tr key={acc.id} className="hover:bg-slate-50/80 transition-colors">
                        {isSuperAdmin && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-700">
                            {acc.tenant_name || '-'}
                          </td>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-base font-bold text-slate-900">{acc.display_name}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="font-mono text-sm font-semibold bg-slate-100 px-2.5 py-1 rounded text-slate-800">
                            {acc.username}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${roleInfo.color}`}>
                            <span>{roleInfo.icon}</span>
                            <span>{roleInfo.label}</span>
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {acc.is_active ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                              有効
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-600">
                              停止中
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleOpenEditModal(acc)}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-xs transition-colors"
                            >
                              編集
                            </button>
                            <button
                              onClick={() => handleDelete(acc)}
                              className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg font-bold text-xs transition-colors"
                            >
                              削除
                            </button>
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

        {/* 作成・編集モーダル */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 relative">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <span>{editingAccount ? '✏️ クリスマスアカウント編集' : '🎄 クリスマスアカウント新規作成'}</span>
              </h2>

              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                {/* テナント選択（super_admin新規作成時のみ） */}
                {isSuperAdmin && !editingAccount && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">所属企業（テナント）*</label>
                    <select
                      value={formData.tenant_id}
                      onChange={(e) => setFormData({ ...formData, tenant_id: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 focus:outline-none focus:border-red-500"
                      required
                    >
                      {tenants.map(t => (
                        <option key={t.id} value={t.id}>{t.tenant_name} ({t.tenant_code})</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* アカウント種別 */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">アカウント種別（役割）*</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 focus:outline-none focus:border-red-500"
                    required
                  >
                    <option value="tokyo_store">① 首都圏店舗（お客様受注データ入力）</option>
                    <option value="regional_store">② 地方店舗（お客様受注データ入力）</option>
                    <option value="xmas_manager">③ クリスマスマネージャー（全店閲覧・切替入力）</option>
                    <option value="xmas_factory">④ 工場アカウント（日別出荷数・最大受注数設定・集計）</option>
                    <option value="xmas_headquarters">⑤ 本部アカウント（各店受注・工場集計の閲覧専用）</option>
                  </select>
                </div>

                {/* 表示名（店舗名など） */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    表示名（店舗名・工場名など）*
                  </label>
                  <input
                    type="text"
                    value={formData.display_name}
                    onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                    placeholder="例: MK 広尾明治屋店, 札幌工場 など"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-none focus:border-red-500"
                    required
                  />
                  <p className="text-[11px] text-slate-500 mt-1">※受注票や工場集計表に表示される名称です</p>
                </div>

                {/* ログインID */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">ログインID *</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="例: xmas_hiroo, xmas_factory など"
                    disabled={!!editingAccount}
                    className={`w-full px-4 py-3 rounded-xl font-mono font-bold focus:outline-none ${
                      editingAccount
                        ? 'bg-slate-100 border border-slate-200 text-slate-500 cursor-not-allowed'
                        : 'bg-slate-50 border border-slate-300 text-slate-900 focus:border-red-500'
                    }`}
                    required
                  />
                  {editingAccount && <p className="text-[11px] text-slate-400 mt-1">※ログインIDは変更できません</p>}
                </div>

                {/* パスワード */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {editingAccount ? '新しいパスワード（変更しない場合は空欄）' : 'ログインパスワード *'}
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder={editingAccount ? '変更する場合のみ入力' : 'パスワードを入力'}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-none focus:border-red-500"
                    required={!editingAccount}
                  />
                </div>

                {/* 有効/無効（編集時のみ） */}
                {editingAccount && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="is_active_checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="w-4 h-4 text-red-600 rounded border-slate-300 focus:ring-red-500"
                    />
                    <label htmlFor="is_active_checkbox" className="text-sm font-bold text-slate-700 cursor-pointer">
                      アカウントを有効にする
                    </label>
                  </div>
                )}

                {/* ボタン群 */}
                <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 text-sm transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 text-sm shadow-md transition-colors"
                  >
                    {editingAccount ? '変更を保存' : '作成する'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
