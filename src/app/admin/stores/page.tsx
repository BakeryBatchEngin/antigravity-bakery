'use client';

import { useState, useEffect } from 'react';

type Store = {
  id: number;
  store_code: string;
  store_name: string;
  created_at: string;
};

export default function StoresAdminPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // モーダルステート
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  
  // フォームステート
  const [formData, setFormData] = useState({
    store_code: '',
    store_name: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/stores');
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'データの取得に失敗しました');
      if (data.stores) setStores(data.stores);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (store?: Store) => {
    if (store) {
      setEditingStore(store);
      setFormData({
        store_code: store.store_code,
        store_name: store.store_name,
      });
    } else {
      setEditingStore(null);
      setFormData({
        store_code: '',
        store_name: '',
      });
    }
    setError('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingStore(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      const isEdit = !!editingStore;
      const url = '/api/admin/stores';
      const method = isEdit ? 'PUT' : 'POST';
      
      const payload = {
        ...(isEdit && { id: editingStore.id }),
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
    if (!confirm(`店舗「${name}」を削除してもよろしいですか？\n※関連するデータ（ユーザーとの紐付け等）も削除される場合があります。`)) return;
    
    try {
      const res = await fetch(`/api/admin/stores?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '削除に失敗しました');
      
      await fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      <main className="max-w-5xl mx-auto p-4 sm:p-6 pb-20 pt-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-white">店舗・設備管理</h1>
            <p className="text-slate-400 mt-1">システムで管理する店舗のマスタ設定</p>
          </div>
          <button 
            onClick={() => handleOpenModal()}
            className="bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
            新規店舗登録
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
                    <th className="p-4 font-bold border-b border-slate-700 w-1/4">店舗コード</th>
                    <th className="p-4 font-bold border-b border-slate-700 w-1/2">店舗名</th>
                    <th className="p-4 font-bold border-b border-slate-700 w-1/4 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {stores.map(store => (
                    <tr key={store.id} className="hover:bg-slate-700/30 transition-colors">
                      <td className="p-4">
                        <span className="font-mono text-amber-400 font-bold bg-amber-400/10 px-3 py-1 rounded-lg">
                          {store.store_code}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-white text-lg">{store.store_name}</div>
                      </td>
                      <td className="p-4 text-right">
                        <button 
                          onClick={() => handleOpenModal(store)}
                          className="text-blue-400 hover:text-blue-300 font-bold px-3 py-2 rounded-lg hover:bg-slate-700 transition-colors mr-2"
                        >
                          編集
                        </button>
                        <button 
                          onClick={() => handleDelete(store.id, store.store_name)}
                          className="text-red-400 hover:text-red-300 font-bold px-3 py-2 rounded-lg hover:bg-slate-700 transition-colors"
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                  {stores.length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-slate-500">
                        登録されている店舗はありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* 店舗登録・編集モーダル */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-800 rounded-3xl w-full max-w-lg shadow-2xl border border-slate-700 my-8">
            <div className="p-6 sm:p-8 border-b border-slate-700 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">
                {editingStore ? '店舗の編集' : '新規店舗登録'}
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

              <div>
                <label className="block text-sm font-bold text-slate-300 mb-2">店舗コード <span className="text-red-400">*</span></label>
                <input 
                  type="text" 
                  required 
                  placeholder="例: S001"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 font-mono text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none uppercase"
                  value={formData.store_code}
                  onChange={e => setFormData({...formData, store_code: e.target.value.toUpperCase()})}
                />
                <p className="text-xs text-slate-500 mt-2">注文ファイル等で識別するための一意のコード（半角英数字）</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-300 mb-2">店舗名 <span className="text-red-400">*</span></label>
                <input 
                  type="text" 
                  required 
                  placeholder="例: 東京本店"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
                  value={formData.store_name}
                  onChange={e => setFormData({...formData, store_name: e.target.value})}
                />
              </div>

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
                  {editingStore ? '更新する' : '登録する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
