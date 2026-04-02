'use client';

import { useState, useEffect } from 'react';

// 型定義
interface ProductDough {
  dough_code: string;
  dough_name: string;
  dough_amount: number;
}

interface ProductIngredient {
  ingredient_code: string;
  ingredient_name: string;
  ingredient_amount: number;
}

interface Product {
  product_code: string;
  product_name: string;
  doughs: ProductDough[];
  ingredients: ProductIngredient[];
}

interface MasterDough {
  dough_id: string;
  dough_name: string;
}

interface MasterIngredient {
  ingredient_code: string;
  ingredient_name: string;
}

export default function ProductsMasterPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [masterDoughs, setMasterDoughs] = useState<MasterDough[]>([]);
  const [masterIngredients, setMasterIngredients] = useState<MasterIngredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // 検索・ソート用ステート
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'code' | 'dough'>('code');

  // フォーム用ステート
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Product>({
    product_code: '',
    product_name: '',
    doughs: [],
    ingredients: [],
  });
  
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [prodsRes, doughsRes, ingsRes] = await Promise.all([
        fetch('/api/admin/products'),
        fetch('/api/admin/doughs'),
        fetch('/api/admin/ingredients')
      ]);
      if (prodsRes.ok) setProducts((await prodsRes.json()).products || []);
      if (doughsRes.ok) setMasterDoughs((await doughsRes.json()).doughs || []);
      if (ingsRes.ok) setMasterIngredients((await ingsRes.json()).ingredients || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (prod: Product) => {
    setFormData(JSON.parse(JSON.stringify(prod)));
    setIsEditing(true);
    setErrorMsg('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancel = () => {
    setFormData({ product_code: '', product_name: '', doughs: [], ingredients: [] });
    setIsEditing(false);
    setErrorMsg('');
  };

  // 生地操作
  const addDoughRow = () => {
    setFormData({
      ...formData,
      doughs: [...formData.doughs, { dough_code: '', dough_name: '', dough_amount: 0 }]
    });
  };
  const updateDoughRow = (index: number, field: string, value: string | number) => {
    const newArr = [...formData.doughs];
    if (field === 'dough_code') {
      const selected = masterDoughs.find(d => d.dough_id === value);
      newArr[index].dough_code = value as string;
      newArr[index].dough_name = selected ? selected.dough_name : '';
    } else if (field === 'dough_amount') {
      newArr[index].dough_amount = value as number;
    }
    setFormData({ ...formData, doughs: newArr });
  };
  const removeDoughRow = (index: number) => {
    const newArr = [...formData.doughs];
    newArr.splice(index, 1);
    setFormData({ ...formData, doughs: newArr });
  };

  // 副材料操作
  const addIngredientRow = () => {
    setFormData({
      ...formData,
      ingredients: [...formData.ingredients, { ingredient_code: '', ingredient_name: '', ingredient_amount: 0 }]
    });
  };
  const updateIngredientRow = (index: number, field: string, value: string | number) => {
    const newArr = [...formData.ingredients];
    if (field === 'ingredient_code') {
      const selected = masterIngredients.find(i => i.ingredient_code === value);
      newArr[index].ingredient_code = value as string;
      newArr[index].ingredient_name = selected ? selected.ingredient_name : '';
    } else if (field === 'ingredient_amount') {
      newArr[index].ingredient_amount = value as number;
    }
    setFormData({ ...formData, ingredients: newArr });
  };
  const removeIngredientRow = (index: number) => {
    const newArr = [...formData.ingredients];
    newArr.splice(index, 1);
    setFormData({ ...formData, ingredients: newArr });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.product_code || !formData.product_name) {
      setErrorMsg('商品コードと商品名は必須です');
      return;
    }
    if (formData.doughs.length === 0 && formData.ingredients.length === 0) {
      setErrorMsg('生地または副材料のいずれかを追加してください');
      return;
    }
    const hasEmptyD = formData.doughs.some(d => !d.dough_code || d.dough_amount <= 0);
    const hasEmptyI = formData.ingredients.some(i => !i.ingredient_code || i.ingredient_amount <= 0);
    if (hasEmptyD || hasEmptyI) {
      setErrorMsg('コードの未選択、またはグラム数が0以下の項目があります');
      return;
    }
    
    try {
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok) {
        fetchData();
        handleCancel();
      } else {
        setErrorMsg(data.error || '保存エラー');
      }
    } catch (err) {
      setErrorMsg('通信エラー');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`商品 ${id} を削除しますか？`)) return;
    try {
      const res = await fetch(`/api/admin/products?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        fetchData();
      } else {
        alert(data.error || '削除エラー');
      }
    } catch (e) {
      alert('通信エラー');
    }
  };

  // 検索・並べ替えロジック
  const filteredProducts = products.filter(p => {
    if (!searchQuery) return true;
    const lowerQ = searchQuery.toLowerCase();
    return p.product_code.toLowerCase().includes(lowerQ) ||
           p.product_name.toLowerCase().includes(lowerQ) ||
           p.doughs.some(d => d.dough_name.toLowerCase().includes(lowerQ));
  }).sort((a, b) => {
    if (sortBy === 'code') {
      return a.product_code.localeCompare(b.product_code);
    } else {
      const aDough = a.doughs.length > 0 ? a.doughs[0].dough_name : '\uFFFF';
      const bDough = b.doughs.length > 0 ? b.doughs[0].dough_name : '\uFFFF';
      if (aDough === bDough) return a.product_code.localeCompare(b.product_code);
      return aDough.localeCompare(bDough);
    }
  });

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-black text-white flex items-center gap-3">
          <span className="text-4xl text-amber-500">🥖</span> Product Master
        </h1>
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
            {isEditing ? '商品の編集' : '新規商品の登録'}
          </h2>
        </div>
        <div className="p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">商品コード *</label>
                <input 
                  type="text" 
                  value={formData.product_code}
                  onChange={e => setFormData({...formData, product_code: e.target.value})}
                  disabled={isEditing}
                  className="w-full px-4 py-3 text-slate-900 bg-slate-50 md:bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none disabled:opacity-50 font-mono"
                  placeholder="例: PRD001"
                  required
                />
              </div>
              <div className="flex-[2]">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">商品名 *</label>
                <input 
                  type="text" 
                  value={formData.product_name}
                  onChange={e => setFormData({...formData, product_name: e.target.value})}
                  className="w-full px-4 py-3 text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                  placeholder="例: クロワッサン"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 使用生地リスト */}
              <div className="border border-blue-200 bg-blue-50/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3 border-b border-blue-200 pb-2">
                  <h3 className="font-bold text-blue-800">使用生地</h3>
                  <button type="button" onClick={addDoughRow} className="px-3 py-1 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded text-sm font-bold transition-colors">
                    ＋ 生地を追加
                  </button>
                </div>
                
                <div className="space-y-2">
                  {formData.doughs.length === 0 && (
                    <p className="text-slate-400 text-sm text-center py-2">生地が追加されていません</p>
                  )}
                  {formData.doughs.map((d, idx) => (
                    <div key={idx} className="flex flex-col sm:flex-row gap-2 items-center bg-white p-2 border border-blue-100 rounded shadow-sm">
                      <select
                        value={d.dough_code}
                        onChange={(e) => updateDoughRow(idx, 'dough_code', e.target.value)}
                        className="flex-[2] w-full px-3 py-2 text-slate-900 border border-slate-300 rounded focus:ring-blue-500 outline-none"
                        required
                      >
                        <option value="">-- 生地を選択 --</option>
                        {masterDoughs.map(md => (
                          <option key={md.dough_id} value={md.dough_id}>
                            {md.dough_id} : {md.dough_name}
                          </option>
                        ))}
                      </select>
                      <div className="flex-1 w-full sm:w-auto flex items-center gap-1 border border-slate-300 rounded px-2 focus-within:ring-2 focus-within:ring-blue-500 bg-white">
                        <input 
                          type="number"
                          min="1"
                          value={d.dough_amount || ''}
                          onChange={(e) => updateDoughRow(idx, 'dough_amount', Number(e.target.value))}
                          className="w-full py-2 text-slate-900 outline-none text-right placeholder-slate-400"
                          placeholder="60"
                          required
                        />
                        <span className="text-slate-400 font-bold px-1">g</span>
                      </div>
                      <button type="button" onClick={() => removeDoughRow(idx)} className="text-red-400 hover:text-red-600 p-2 sm:ml-2" title="削除">🗑️</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 使用副材料リスト */}
              <div className="border border-green-200 bg-green-50/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3 border-b border-green-200 pb-2">
                  <h3 className="font-bold text-green-800">使用副材料 (トッピング・充填)</h3>
                  <button type="button" onClick={addIngredientRow} className="px-3 py-1 bg-green-100 text-green-700 hover:bg-green-200 rounded text-sm font-bold transition-colors">
                    ＋ 副材料を追加
                  </button>
                </div>
                
                <div className="space-y-2">
                  {formData.ingredients.length === 0 && (
                    <p className="text-slate-400 text-sm text-center py-2">副材料が追加されていません</p>
                  )}
                  {formData.ingredients.map((ing, idx) => (
                    <div key={idx} className="flex flex-col sm:flex-row gap-2 items-center bg-white p-2 border border-green-100 rounded shadow-sm">
                      <select
                        value={ing.ingredient_code}
                        onChange={(e) => updateIngredientRow(idx, 'ingredient_code', e.target.value)}
                        className="flex-[2] w-full px-3 py-2 text-slate-900 border border-slate-300 rounded focus:ring-green-500 outline-none"
                        required
                      >
                        <option value="">-- 副材料を選択 --</option>
                        {masterIngredients.map(mi => (
                          <option key={mi.ingredient_code} value={mi.ingredient_code}>
                            {mi.ingredient_code} : {mi.ingredient_name}
                          </option>
                        ))}
                      </select>
                      
                      <div className="flex-1 w-full sm:w-auto flex items-center gap-1 border border-slate-300 rounded px-2 focus-within:ring-2 focus-within:ring-green-500 bg-white">
                        <input 
                          type="number"
                          min="1"
                          value={ing.ingredient_amount || ''}
                          onChange={(e) => updateIngredientRow(idx, 'ingredient_amount', Number(e.target.value))}
                          className="w-full py-2 text-slate-900 outline-none text-right placeholder-slate-400"
                          placeholder="15"
                          required
                        />
                        <span className="text-slate-400 font-bold px-1">g</span>
                      </div>
                      <button type="button" onClick={() => removeIngredientRow(idx)} className="text-red-400 hover:text-red-600 p-2 sm:ml-2" title="削除">🗑️</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex gap-2 justify-end mt-2">
              {isEditing && (
                <button 
                  type="button" 
                  onClick={handleCancel}
                  className="w-full sm:w-32 px-4 py-3 rounded-lg font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-all"
                >
                  取消
                </button>
              )}
              <button 
                type="submit" 
                className={`w-full sm:w-40 px-4 py-3 rounded-lg font-bold text-white shadow-sm transition-all ${isEditing ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-500 hover:bg-amber-600'}`}
              >
                {isEditing ? '更新して保存' : '商品を追加'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* 商品一覧 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-lg font-bold text-slate-700">登録済み商品一覧 ({filteredProducts.length}件)</h2>
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <div className="flex bg-slate-200 p-1 rounded-lg w-full sm:w-auto">
              <button 
                onClick={() => setSortBy('code')}
                className={`flex-1 sm:flex-none px-3 py-1.5 text-sm font-bold rounded-md transition-colors ${sortBy === 'code' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                コード順
              </button>
              <button 
                onClick={() => setSortBy('dough')}
                className={`flex-1 sm:flex-none px-3 py-1.5 text-sm font-bold rounded-md transition-colors ${sortBy === 'dough' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                生地順
              </button>
            </div>
            <div className="relative w-full sm:w-64">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input 
                type="text" 
                placeholder="名称やコードで検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none block"
              />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto p-4 sm:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {isLoading ? (
              <p className="text-slate-400 text-center col-span-full py-10">Loading...</p>
            ) : filteredProducts.length === 0 ? (
              <p className="text-slate-400 text-center col-span-full py-10">該当する商品がありません</p>
            ) : (
              filteredProducts.map(prod => (
                <div key={prod.product_code} className="border border-slate-200 rounded-lg p-5 hover:shadow-md transition-shadow bg-slate-50 relative group">
                  <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleEdit(prod)} className="p-1 hover:bg-blue-100 text-blue-600 rounded bg-white border border-slate-200 shadow-sm">✏️</button>
                    <button onClick={() => handleDelete(prod.product_code)} className="p-1 hover:bg-red-100 text-red-600 rounded bg-white border border-slate-200 shadow-sm">🗑️</button>
                  </div>
                  <div className="mb-4 pr-16">
                    <span className="text-xs font-mono bg-amber-100 text-amber-800 px-2 py-0.5 rounded shadow-sm">{prod.product_code}</span>
                    <h3 className="font-black text-xl text-slate-800 mt-2">{prod.product_name}</h3>
                  </div>

                  <div className="space-y-3">
                    {prod.doughs.length > 0 && (
                      <div className="bg-white rounded border border-blue-100 p-3 shadow-sm">
                        <div className="text-xs font-bold text-blue-600 mb-2 uppercase tracking-wider">使用生地</div>
                        <ul className="space-y-1">
                          {prod.doughs.map((d, idx) => (
                            <li key={idx} className="flex justify-between items-center text-sm">
                              <span className="text-slate-700 font-medium">{d.dough_name} <span className="text-slate-400 text-xs ml-1">({d.dough_code})</span></span>
                              <span className="font-bold text-slate-800">{d.dough_amount}g</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {prod.ingredients.length > 0 && (
                      <div className="bg-white rounded border border-green-100 p-3 shadow-sm">
                        <div className="text-xs font-bold text-green-600 mb-2 uppercase tracking-wider">副材料</div>
                        <ul className="space-y-1">
                          {prod.ingredients.map((ing, idx) => (
                            <li key={idx} className="flex justify-between items-center text-sm">
                              <span className="text-slate-700 font-medium">{ing.ingredient_name}</span>
                              <span className="font-bold text-slate-800">{ing.ingredient_amount}g</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
