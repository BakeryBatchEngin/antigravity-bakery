'use client';

import { useState, useEffect, useRef } from 'react';

interface Ingredient {
  ingredient_code: string;
  ingredient_name: string;
  purchase_weight: number | null;
  purchase_price: number | null;
  status: string;
}

export default function IngredientsMasterPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // 検索・ソート用ステート
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'code' | 'name'>('code');
  const [showHidden, setShowHidden] = useState(false);

  // フォーム用ステート
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Ingredient>({
    ingredient_code: '',
    ingredient_name: '',
    purchase_weight: null,
    purchase_price: null,
    status: 'active',
  });
  
  const [errorMsg, setErrorMsg] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);


  useEffect(() => {
    fetchIngredients();
  }, []);

  const fetchIngredients = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/ingredients');
      const data = await res.json();
      if (res.ok) {
        setIngredients(data.ingredients);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (ing: Ingredient) => {
    setFormData({ ...ing });
    setIsEditing(true);
    setErrorMsg('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancel = () => {
    setFormData({ ingredient_code: '', ingredient_name: '', purchase_weight: null, purchase_price: null, status: 'active' });
    setIsEditing(false);
    setErrorMsg('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.ingredient_code || !formData.ingredient_name) {
      setErrorMsg('コードと名前は必須です');
      return;
    }
    
    try {
      const res = await fetch('/api/admin/ingredients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok) {
        fetchIngredients();
        handleCancel();
      } else {
        setErrorMsg(data.error || '保存エラー');
      }
    } catch (err) {
      setErrorMsg('通信エラー');
    }
  };

  const handleDelete = async (code: string) => {
    if (!confirm(`材料 ${code} を削除しますか？`)) return;
    try {
      const res = await fetch(`/api/admin/ingredients?code=${encodeURIComponent(code)}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        fetchIngredients();
      } else {
        alert(data.error || '削除エラー');
      }
    } catch (e) {
      alert('通信エラー');
    }
  };

  const handleDownloadExcel = () => {
    window.location.href = '/api/admin/ingredients/export';
  };

  const handleUploadExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setErrorMsg('');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/admin/ingredients/import', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        alert('Excelのアップロードに成功しました');
        fetchIngredients();
      } else {
        setErrorMsg(data.error || 'アップロードに失敗しました');
      }
    } catch (err) {
      setErrorMsg('アップロード通信エラー');
    } finally {
      setIsUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  // 検索・並べ替えロジック
  const filteredIngredients = ingredients.filter(ing => {
    if (!showHidden && (ing.status === 'deleted' || ing.status === 'suspended')) return false;
    if (!searchQuery) return true;
    const lowerQ = searchQuery.toLowerCase();
    return ing.ingredient_code.toLowerCase().includes(lowerQ) ||
           ing.ingredient_name.toLowerCase().includes(lowerQ);
  }).sort((a, b) => {
    if (sortBy === 'code') {
      return a.ingredient_code.localeCompare(b.ingredient_code);
    } else {
      return a.ingredient_name.localeCompare(b.ingredient_name, 'ja');
    }
  });

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-black text-white flex items-center gap-3">
          <span className="text-4xl text-amber-500">🍳</span> Ingredient Master
        </h1>
        <div className="flex gap-3">
          <button 
            onClick={handleDownloadExcel}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm flex items-center gap-2 transition-colors"
          >
            📥 Excelダウンロード
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className={`px-4 py-2 ${isUploading ? 'bg-slate-400' : 'bg-blue-600 hover:bg-blue-700'} text-white font-bold rounded-lg shadow-sm flex items-center gap-2 transition-colors`}
          >
            {isUploading ? '⏳ 処理中...' : '📤 Excelアップロード'}
          </button>
          <input 
            type="file" 
            accept=".xlsx" 
            ref={fileInputRef} 
            onChange={handleUploadExcel} 
            className="hidden" 
          />
        </div>
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 bg-red-50 text-red-600 font-bold border-l-4 border-red-500 rounded-r shadow-sm">
          {errorMsg}
        </div>
      )}

      {/* 登録・編集フォーム */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-10">
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-700">
            {isEditing ? '材料の編集' : '新規材料の登録'}
          </h2>
        </div>
        <div className="p-6">
          <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 w-full relative">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">材料コード *</label>
              <input 
                type="text" 
                value={formData.ingredient_code}
                onChange={e => setFormData({...formData, ingredient_code: e.target.value})}
                disabled={isEditing}
                className="w-full px-4 py-3 text-slate-900 bg-slate-50 md:bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none transition-shadow disabled:opacity-50 font-mono"
                placeholder="例: FLO0003"
                required
              />
            </div>
            <div className="flex-1 w-full">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">材料名 *</label>
              <input 
                type="text" 
                value={formData.ingredient_name}
                onChange={e => setFormData({...formData, ingredient_name: e.target.value})}
                className="w-full px-4 py-3 text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none transition-shadow"
                placeholder="例: ゆめちから"
                required
              />
            </div>
            <div className="w-full md:w-32">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">仕入量(g)</label>
              <input 
                type="number" 
                value={formData.purchase_weight || ''}
                onChange={e => setFormData({...formData, purchase_weight: e.target.value ? Number(e.target.value) : null})}
                className="w-full px-4 py-3 text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none transition-shadow"
                placeholder="25000"
              />
            </div>
            <div className="w-full md:w-32">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">仕入価格(¥)</label>
              <input 
                type="number" 
                value={formData.purchase_price || ''}
                onChange={e => setFormData({...formData, purchase_price: e.target.value ? Number(e.target.value) : null})}
                className="w-full px-4 py-3 text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none transition-shadow"
                placeholder="7000"
              />
            </div>
            
            <div className="w-full md:w-32">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">ステータス</label>
              <select 
                value={formData.status}
                onChange={e => setFormData({...formData, status: e.target.value})}
                className="w-full px-4 py-3 text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none transition-shadow bg-white"
              >
                <option value="active">有効</option>
                <option value="suspended">利用停止</option>
                <option value="deleted">削除</option>
              </select>
            </div>
            
            <div className="flex gap-2 w-full md:w-auto mt-4 md:mt-0">
              <button 
                type="submit" 
                className={`flex-1 md:w-28 px-4 py-3 rounded-lg font-bold text-white transition-all shadow-sm ${isEditing ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-500 hover:bg-amber-600'}`}
              >
                {isEditing ? '更新' : '追加'}
              </button>
              {isEditing && (
                <button 
                  type="button" 
                  onClick={handleCancel}
                  className="flex-1 md:w-20 px-4 py-3 rounded-lg font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-all"
                >
                  取消
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* 材料一覧 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-lg font-bold text-slate-700">登録済み材料一覧 ({filteredIngredients.length}件)</h2>
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <div className="flex bg-slate-200 p-1 rounded-lg w-full sm:w-auto">
              <button 
                onClick={() => setSortBy('code')}
                className={`flex-1 sm:flex-none px-3 py-1.5 text-sm font-bold rounded-md transition-colors ${sortBy === 'code' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                コード順
              </button>
              <button 
                onClick={() => setSortBy('name')}
                className={`flex-1 sm:flex-none px-3 py-1.5 text-sm font-bold rounded-md transition-colors ${sortBy === 'name' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                あいうえお順
              </button>
            </div>
            <div className="relative w-full sm:w-64 flex flex-col items-end gap-2">
              <div className="relative w-full">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                <input 
                  type="text" 
                  placeholder="材料名やコードで検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none block"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={showHidden} 
                  onChange={(e) => setShowHidden(e.target.checked)} 
                  className="rounded text-amber-500 focus:ring-amber-500"
                />
                利用停止・削除を表示
              </label>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-100/50 text-slate-500 text-sm border-b border-slate-200">
                <th className="py-3 px-6 font-bold">Code</th>
                <th className="py-3 px-6 font-bold">Name</th>
                <th className="py-3 px-6 font-bold text-right">仕入量</th>
                <th className="py-3 px-6 font-bold text-right">仕入価格</th>
                <th className="py-3 px-6 font-bold text-center">状態</th>
                <th className="py-3 px-6 w-24 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={5} className="text-center py-10 text-slate-400">Loading...</td></tr>
              ) : filteredIngredients.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-slate-400">該当する材料がありません</td></tr>
              ) : (
                filteredIngredients.map((ing) => (
                  <tr key={ing.ingredient_code} className="hover:bg-slate-50 transition-colors group">
                    <td className="py-3 px-6 font-mono text-sm text-slate-500">{ing.ingredient_code}</td>
                    <td className="py-3 px-6 font-bold text-slate-800">{ing.ingredient_name}</td>
                    <td className="py-3 px-6 text-right text-slate-600">{ing.purchase_weight ? `${ing.purchase_weight.toLocaleString()} g` : '-'}</td>
                    <td className="py-3 px-6 text-right text-slate-600">{ing.purchase_price ? `¥${ing.purchase_price.toLocaleString()}` : '-'}</td>
                    <td className="py-3 px-6 text-center">
                      {ing.status === 'active' && <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">有効</span>}
                      {ing.status === 'suspended' && <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">利用停止</span>}
                      {ing.status === 'deleted' && <span className="px-2 py-1 bg-slate-200 text-slate-500 text-xs font-bold rounded-full">削除</span>}
                    </td>
                    <td className="py-3 px-6 text-center">
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleEdit(ing)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                          title="編集"
                        >
                          ✏️
                        </button>
                        <button 
                          onClick={() => handleDelete(ing.ingredient_code)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                          title="削除"
                        >
                          🗑️
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
    </div>
  );
}
