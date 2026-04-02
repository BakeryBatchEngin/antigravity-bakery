'use client';

import { useState, useEffect } from 'react';

// 生地に含まれる材料の型
interface DoughIngredient {
  ingredient_code: string;
  ingredient_name: string;
  bakers_percent: number;
}

// 生地の型
interface Dough {
  dough_id: string;
  dough_name: string;
  ingredients: DoughIngredient[];
}

// 材料マスタの型（選択肢用）
interface MasterIngredient {
  ingredient_code: string;
  ingredient_name: string;
}

export default function DoughsMasterPage() {
  const [doughs, setDoughs] = useState<Dough[]>([]);
  const [masterIngredients, setMasterIngredients] = useState<MasterIngredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // フォーム用ステート
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Dough>({
    dough_id: '',
    dough_name: '',
    ingredients: [],
  });
  
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [doughsRes, ingsRes] = await Promise.all([
        fetch('/api/admin/doughs'),
        fetch('/api/admin/ingredients')
      ]);
      const doughsData = await doughsRes.json();
      const ingsData = await ingsRes.json();
      
      if (doughsRes.ok) setDoughs(doughsData.doughs || []);
      if (ingsRes.ok) setMasterIngredients(ingsData.ingredients || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (dough: Dough) => {
    // ディープコピーしてセット
    setFormData(JSON.parse(JSON.stringify(dough)));
    setIsEditing(true);
    setErrorMsg('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancel = () => {
    setFormData({ dough_id: '', dough_name: '', ingredients: [] });
    setIsEditing(false);
    setErrorMsg('');
  };

  const addIngredientRow = () => {
    setFormData({
      ...formData,
      ingredients: [
        ...formData.ingredients, 
        { ingredient_code: '', ingredient_name: '', bakers_percent: 0 }
      ]
    });
  };

  const updateIngredientRow = (index: number, field: string, value: string | number) => {
    const newIngs = [...formData.ingredients];
    if (field === 'ingredient_code') {
      const selected = masterIngredients.find(i => i.ingredient_code === value);
      newIngs[index].ingredient_code = value as string;
      newIngs[index].ingredient_name = selected ? selected.ingredient_name : '';
    } else if (field === 'bakers_percent') {
      newIngs[index].bakers_percent = value as number;
    }
    setFormData({ ...formData, ingredients: newIngs });
  };

  const removeIngredientRow = (index: number) => {
    const newIngs = [...formData.ingredients];
    newIngs.splice(index, 1);
    setFormData({ ...formData, ingredients: newIngs });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.dough_id || !formData.dough_name) {
      setErrorMsg('生地コードと生地名は必須です');
      return;
    }
    if (formData.ingredients.length === 0) {
      setErrorMsg('少なくとも1つ以上の材料を追加してください');
      return;
    }
    const hasEmptyIng = formData.ingredients.some(i => !i.ingredient_code || i.bakers_percent <= 0);
    if (hasEmptyIng) {
      setErrorMsg('材料コードとBakers%(0より大きい値)を正しく入力してください');
      return;
    }
    
    try {
      const res = await fetch('/api/admin/doughs', {
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
    if (!confirm(`生地 ${id} を削除しますか？`)) return;
    try {
      const res = await fetch(`/api/admin/doughs?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
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

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-black text-white flex items-center gap-3">
          <span className="text-4xl text-amber-500">🥣</span> Dough Master
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
            {isEditing ? '生地の編集' : '新規生地の登録'}
          </h2>
        </div>
        <div className="p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">生地コード *</label>
                <input 
                  type="text" 
                  value={formData.dough_id}
                  onChange={e => setFormData({...formData, dough_id: e.target.value})}
                  disabled={isEditing}
                  className="w-full px-4 py-3 text-slate-900 bg-slate-50 md:bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none disabled:opacity-50 font-mono"
                  placeholder="例: D001"
                  required
                />
              </div>
              <div className="flex-[2]">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">生地名 *</label>
                <input 
                  type="text" 
                  value={formData.dough_name}
                  onChange={e => setFormData({...formData, dough_name: e.target.value})}
                  className="w-full px-4 py-3 text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                  placeholder="例: トラディショナル"
                  required
                />
              </div>
            </div>

            {/* 材料リストエディタ */}
            <div className="border border-amber-200 bg-amber-50/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3 border-b border-amber-200 pb-2">
                <h3 className="font-bold text-amber-800">使用材料 (Bakers %)</h3>
                <button type="button" onClick={addIngredientRow} className="px-3 py-1 bg-amber-100 text-amber-700 hover:bg-amber-200 rounded text-sm font-bold transition-colors">
                  ＋ 材料を追加
                </button>
              </div>
              
              <div className="space-y-2">
                {formData.ingredients.length === 0 && (
                  <p className="text-slate-400 text-sm text-center py-2">材料が追加されていません</p>
                )}
                {formData.ingredients.map((ing, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row gap-2 items-center bg-white p-2 border border-amber-100 rounded shadow-sm">
                    <select
                      value={ing.ingredient_code}
                      onChange={(e) => updateIngredientRow(idx, 'ingredient_code', e.target.value)}
                      className="flex-[2] w-full px-3 py-2 text-slate-900 border border-slate-300 rounded focus:ring-amber-500 outline-none"
                      required
                    >
                      <option value="">-- 材料を選択 --</option>
                      {masterIngredients.map(mi => (
                        <option key={mi.ingredient_code} value={mi.ingredient_code}>
                          {mi.ingredient_code} : {mi.ingredient_name}
                        </option>
                      ))}
                    </select>
                    
                    <div className="flex-1 w-full sm:w-auto flex items-center gap-1 border border-slate-300 rounded px-2 focus-within:ring-2 focus-within:ring-amber-500 bg-white">
                      <input 
                        type="number"
                        step="0.1"
                        min="0"
                        value={ing.bakers_percent || ''}
                        onChange={(e) => updateIngredientRow(idx, 'bakers_percent', Number(e.target.value))}
                        className="w-full py-2 text-slate-900 outline-none text-right placeholder-slate-400"
                        placeholder="100"
                        required
                      />
                      <span className="text-slate-400 font-bold px-1">%</span>
                    </div>

                    <button 
                      type="button" 
                      onClick={() => removeIngredientRow(idx)}
                      className="text-red-400 hover:text-red-600 p-2 sm:ml-2"
                      title="削除"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
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
                {isEditing ? '更新して保存' : '生地を追加'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* 生地一覧 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-700">登録済み生地一覧 ({doughs.length}件)</h2>
        </div>
        <div className="overflow-x-auto p-4 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {isLoading ? (
              <p className="text-slate-400 text-center col-span-full py-10">Loading...</p>
            ) : doughs.length === 0 ? (
              <p className="text-slate-400 text-center col-span-full py-10">登録されている生地がありません</p>
            ) : (
              doughs.map(dough => (
                <div key={dough.dough_id} className="border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow bg-slate-50 group">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span className="text-xs font-mono bg-slate-200 text-slate-600 px-2 py-0.5 rounded">{dough.dough_id}</span>
                      <h3 className="font-bold text-lg text-slate-800 mt-1">{dough.dough_name}</h3>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEdit(dough)} className="p-1 hover:bg-blue-100 text-blue-600 rounded">✏️</button>
                      <button onClick={() => handleDelete(dough.dough_id)} className="p-1 hover:bg-red-100 text-red-600 rounded">🗑️</button>
                    </div>
                  </div>
                  <div className="bg-white rounded border border-slate-100 p-2">
                    <table className="w-full text-sm">
                      <tbody>
                        {dough.ingredients.map((ing, idx) => (
                          <tr key={idx} className="border-b last:border-0 border-slate-100">
                            <td className="py-1 text-slate-600">{ing.ingredient_name}</td>
                            <td className="py-1 text-right font-bold text-slate-800">{ing.bakers_percent}%</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t border-slate-200 mt-1 font-bold text-slate-500">
                        <tr>
                          <td className="pt-1">合計</td>
                          <td className="pt-1 text-right">{dough.ingredients.reduce((sum, i) => sum + i.bakers_percent, 0)}%</td>
                        </tr>
                      </tfoot>
                    </table>
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
