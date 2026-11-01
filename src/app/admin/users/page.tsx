'use client';

import { useState, useEffect } from 'react';

type User = {
  id: number;
  username: string;
  role: string;
  display_name: string;
  has_pin?: boolean;
  has_password?: boolean;
  failed_attempts?: number;
  locked_until?: string | null;
  is_locked?: boolean;
  store_ids: number[];
};

type Store = {
  id: number;
  store_code: string;
  store_name: string;
};

export default function UsersAdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unlockLoadingId, setUnlockLoadingId] = useState<number | null>(null);
  
  // モーダルステート
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  // フォームステート
  const [formData, setFormData] = useState({
    username: '',
    role: 'chef',
    display_name: '',
    pin_code: '',
    password: '',
    store_ids: [] as number[],
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersRes, storesRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/stores')
      ]);
      
      const usersData = await usersRes.json();
      const storesData = await storesRes.json();
      
      if (usersData.users) setUsers(usersData.users);
      if (storesData.stores) setStores(storesData.stores);
    } catch (err: any) {
      setError(err.message || 'データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        username: user.username,
        role: user.role,
        display_name: user.display_name,
        pin_code: '', // セキュリティのため既存PINは画面に送出せず、空文字初期化（空なら変更なし）
        password: '', // セキュリティのため既存パスワードは画面に送出せず、空文字初期化（空なら変更なし）
        store_ids: user.store_ids || [],
      });
    } else {
      setEditingUser(null);
      setFormData({
        username: '',
        role: 'chef',
        display_name: '',
        pin_code: '',
        password: '',
        store_ids: [],
      });
    }
    setError('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
  };

  const handleStoreToggle = (storeId: number) => {
    setFormData(prev => {
      const isSelected = prev.store_ids.includes(storeId);
      if (isSelected) {
        return { ...prev, store_ids: prev.store_ids.filter(id => id !== storeId) };
      } else {
        return { ...prev, store_ids: [...prev.store_ids, storeId] };
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      const isEdit = !!editingUser;
      const url = '/api/admin/users';
      const method = isEdit ? 'PUT' : 'POST';
      
      const payload = {
        ...(isEdit && { id: editingUser.id }),
        ...formData
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存に失敗しました');

      await fetchData();
      handleCloseModal();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`ユーザー「${name}」を削除してもよろしいですか？`)) return;
    
    try {
      const res = await fetch(`/api/admin/users?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '削除に失敗しました');
      
      await fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // アカウントのロック解除
  const handleUnlock = async (id: number, name: string) => {
    if (!confirm(`ユーザー「${name}」のアカウントロックを解除しますか？`)) return;
    
    setUnlockLoadingId(id);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ロック解除に失敗しました');
      
      await fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUnlockLoadingId(null);
    }
  };

  return (
    <div>
      <main className="max-w-6xl mx-auto p-4 sm:p-6 pb-20 pt-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-800">ユーザー管理</h1>
            <p className="text-slate-600 mt-1">自社店舗でシステムを利用するアカウントの発行・権限設定</p>
          </div>
          <button 
            onClick={() => handleOpenModal()}
            className="bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
            新規ユーザー登録
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20 text-slate-500">読み込み中...</div>
        ) : (
          <div className="bg-slate-800 rounded-2xl overflow-hidden shadow-xl border border-slate-700">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900/50 text-slate-400 text-sm uppercase tracking-wider">
                    <th className="p-4 font-bold border-b border-slate-700">表示名 / ID</th>
                    <th className="p-4 font-bold border-b border-slate-700">権限 (Role)</th>
                    <th className="p-4 font-bold border-b border-slate-700">認証設定 / 状態</th>
                    <th className="p-4 font-bold border-b border-slate-700">担当店舗</th>
                    <th className="p-4 font-bold border-b border-slate-700 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {users.map(user => {
                    const isAdminUser = user.role === 'admin' || user.role === 'super_admin';
                    return (
                      <tr key={user.id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="p-4">
                          <div className="font-bold text-white text-lg">{user.display_name}</div>
                          <div className="text-sm text-slate-400 mt-1 font-mono">{user.username}</div>
                        </td>
                        <td className="p-4">
                          <span className={`px-3 py-1 text-xs font-bold rounded-full border ${
                            user.role === 'admin' ? 'bg-red-900/30 text-red-400 border-red-800' :
                            user.role === 'master' ? 'bg-purple-900/30 text-purple-400 border-purple-800' :
                            user.role === 'manager' ? 'bg-blue-900/30 text-blue-400 border-blue-800' :
                            user.role === 'store_loss_manager' ? 'bg-orange-900/30 text-orange-400 border-orange-800' :
                            user.role === 'company_loss_manager' ? 'bg-rose-900/30 text-rose-400 border-rose-800' :
                            'bg-emerald-900/30 text-emerald-400 border-emerald-800'
                          }`}>
                            {user.role.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-4 text-xs">
                          <div className="flex flex-col gap-1.5">
                            {user.is_locked ? (
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800 font-bold flex items-center gap-1">
                                  <span>🔒</span> ロック中
                                </span>
                                <button
                                  onClick={() => handleUnlock(user.id, user.display_name)}
                                  disabled={unlockLoadingId === user.id}
                                  className="text-xs bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 px-2 py-0.5 rounded border border-amber-500/50 transition font-bold"
                                >
                                  {unlockLoadingId === user.id ? '解除中...' : '解除する'}
                                </button>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1">
                                {user.has_password && (
                                  <span className="text-slate-300 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                    パスワード設定済
                                  </span>
                                )}
                                {user.has_pin && (
                                  <span className="text-amber-300 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                    PINコード設定済 (暗号化)
                                  </span>
                                )}
                                {!user.has_password && !user.has_pin && (
                                  <span className="text-slate-500 italic">未設定</span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-sm text-slate-300">
                          {user.store_ids && user.store_ids.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {user.store_ids.map(id => {
                                const store = stores.find(s => s.id === id);
                                return store ? (
                                  <span key={id} className="bg-slate-700 px-2 py-1 rounded text-xs text-white">
                                    {store.store_name}
                                  </span>
                                ) : null;
                              })}
                            </div>
                          ) : (
                            <span className="text-slate-500 italic">全店または指定なし</span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          {isAdminUser ? (
                            <span className="text-xs text-slate-500 italic px-2 py-1 bg-slate-900/40 rounded border border-slate-700">
                              本部管理
                            </span>
                          ) : (
                            <>
                              <button 
                                onClick={() => handleOpenModal(user)}
                                className="text-blue-400 hover:text-blue-300 font-bold px-3 py-2 rounded-lg hover:bg-slate-700 transition-colors mr-2 text-sm"
                              >
                                編集
                              </button>
                              <button 
                                onClick={() => handleDelete(user.id, user.display_name)}
                                className="text-red-400 hover:text-red-300 font-bold px-3 py-2 rounded-lg hover:bg-slate-700 transition-colors text-sm"
                              >
                                削除
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500">
                        登録されているユーザーはいません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* ユーザー登録・編集モーダル */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-800 rounded-3xl w-full max-w-xl shadow-2xl border border-slate-700 my-8">
            <div className="p-6 sm:p-8 border-b border-slate-700 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">
                {editingUser ? 'ユーザーの編集' : '新規ユーザー登録'}
              </h2>
              <button onClick={handleCloseModal} className="text-slate-400 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
              {error && (
                <div className="p-4 bg-red-900/50 text-red-200 rounded-xl border border-red-800 font-bold text-sm">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-slate-300 mb-2">ログインID <span className="text-red-400">*</span></label>
                  <input 
                    type="text" 
                    required 
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
                    value={formData.username}
                    onChange={e => setFormData({...formData, username: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-300 mb-2">表示名 <span className="text-red-400">*</span></label>
                  <input 
                    type="text" 
                    required 
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
                    value={formData.display_name}
                    onChange={e => setFormData({...formData, display_name: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-300 mb-2">権限 (Role) <span className="text-red-400">*</span></label>
                <select 
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none font-bold"
                  value={formData.role}
                  onChange={e => setFormData({...formData, role: e.target.value})}
                >
                  <option value="chef">Chef (店舗スタッフ / 仕込み担当)</option>
                  <option value="store_loss_manager">Store Loss Manager (店舗ロス管理者 / 店舗担当)</option>
                  <option value="manager">Manager (エリアマネージャー / 複数店舗管理)</option>
                  <option value="company_loss_manager">Company Loss Manager (企業ロス統括管理者 / 全店アクセス)</option>
                  <option value="master">Master (商品・マスタデータ管理者)</option>
                  {/* AdminはSuperadminのみがSuperAdmin画面から登録する運用 */}
                  {editingUser?.role === 'admin' && (
                    <option value="admin" disabled>Admin (管理者 ※変更不可)</option>
                  )}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-slate-900/50 rounded-xl border border-slate-800">
                <div>
                  <label className="block text-sm font-bold text-slate-300 mb-2">パスワード (管理職用)</label>
                  <input 
                    type="password" 
                    placeholder={editingUser ? (editingUser.has_password ? '変更時のみ入力（設定済）' : '設定する場合に入力') : '省略で未設定'}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-amber-500 outline-none"
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-300 mb-1">PINコード (Chef用)</label>
                  <span className="block text-[11px] text-slate-400 mb-2">※4桁数字（暗号化保存）</span>
                  <input 
                    type="password" 
                    placeholder={editingUser ? (editingUser.has_pin ? '変更時のみ入力（設定済）' : '設定する場合に入力') : '省略で未設定 (例: 1234)'}
                    maxLength={4}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-amber-500 outline-none font-mono"
                    value={formData.pin_code}
                    onChange={e => setFormData({...formData, pin_code: e.target.value})}
                  />
                </div>
              </div>

              {(formData.role === 'chef' || formData.role === 'manager' || formData.role === 'store_loss_manager') && (
                <div>
                  <label className="block text-sm font-bold text-slate-300 mb-3">
                    担当店舗 <span className="text-xs text-slate-400 font-normal ml-2">※複数選択可</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {stores.map(store => {
                      const isSelected = formData.store_ids.includes(store.id);
                      return (
                        <button
                          key={store.id}
                          type="button"
                          onClick={() => handleStoreToggle(store.id)}
                          className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-colors ${
                            isSelected 
                              ? 'bg-amber-500/20 border-amber-500 text-amber-100' 
                              : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'bg-amber-500 border-amber-500' : 'border-slate-500'}`}>
                            {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                          </div>
                          <span className="text-sm font-bold truncate">{store.store_name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="pt-6 border-t border-slate-700 flex justify-end gap-4">
                <button 
                  type="button" 
                  onClick={handleCloseModal}
                  className="px-6 py-3 font-bold text-slate-300 hover:bg-slate-700 rounded-xl transition-colors"
                >
                  キャンセル
                </button>
                <button 
                  type="submit" 
                  className="px-8 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-lg transition-colors"
                >
                  {editingUser ? '更新する' : '登録する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
