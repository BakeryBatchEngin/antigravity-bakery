'use client';
import SearchableSelect from '@/components/SearchableSelect';
import LoadingSpinner from "@/components/LoadingSpinner";
import { useState, useEffect } from 'react';

interface WipIngredient {
  ingredient_code: string;
  ingredient_name: string;
  ingredient_amount: number;
}

interface Wip {
  wip_code: string;
  wip_name: string;
  memo?: string;
  informart_url?: string;
  ingredients: WipIngredient[];
}

interface MasterIngredient {
  ingredient_code: string;
  ingredient_name: string;
}

export default function WipsMasterPage() {
  const [wips, setWips] = useState<Wip[]>([]);
  const [masterIngredients, setMasterIngredients] = useState<MasterIngredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Wip>({
    wip_code: '',
    wip_name: '',
    memo: '',
    informart_url: '',
    ingredients: [],
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [wipRes, ingRes] = await Promise.all([
        fetch('/api/admin/wips'),
        fetch('/api/admin/ingredients')
      ]);

      if (wipRes.ok) {
        const data = await wipRes.json();
        setWips(data.wips || []);
      }
      if (ingRes.ok) {
        const data = await ingRes.json();
        // type = 'wip' も材料として登録されるため、再帰的に自分自身を選ばないよう配慮が必要ですが、今はすべて選択可能にしておきます
        setMasterIngredients(data.ingredients || []);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (wip: Wip) => {
    setFormData({ ...wip });
    setIsEditing(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (wip_code: string) => {
    if (!confirm(`仕掛品「${wip_code}」を削除しますか？`)) return;

    try {
      const res = await fetch(`/api/admin/wips?id=${wip_code}`, { method: 'DELETE' });
      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        alert(`削除に失敗しました: ${data.error || '不明なエラー'}`);
      }
    } catch (error) {
      alert('削除エラーが発生しました');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.wip_code || !formData.wip_name) {
      alert('必須項目を入力してください');
      return;
    }

    try {
      const res = await fetch('/api/admin/wips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setFormData({ wip_code: '', wip_name: '', memo: '', informart_url: '', ingredients: [] });
        setIsEditing(false);
        fetchData();
      } else {
        const data = await res.json();
        alert(`保存に失敗しました: ${data.error || '不明なエラー'}`);
      }
    } catch (error) {
      alert('保存エラーが発生しました');
    }
  };

  const handleCancel = () => {
    setFormData({ wip_code: '', wip_name: '', memo: '', informart_url: '', ingredients: [] });
    setIsEditing(false);
  };

  const addIngredientRow = () => {
    setFormData(prev => ({
      ...prev,
      ingredients: [...prev.ingredients, { ingredient_code: '', ingredient_name: '', ingredient_amount: 0 }]
    }));
  };

  const updateIngredientRow = (index: number, field: keyof WipIngredient, value: string | number) => {
    const newIngredients = [...formData.ingredients];
    newIngredients[index] = { ...newIngredients[index], [field]: value };
    if (field === 'ingredient_code') {
      const found = masterIngredients.find(i => i.ingredient_code === value);
      if (found) newIngredients[index].ingredient_name = found.ingredient_name;
    }
    setFormData({ ...formData, ingredients: newIngredients });
  };

  const removeIngredientRow = (index: number) => {
    const newIngredients = formData.ingredients.filter((_, i) => i !== index);
    setFormData({ ...formData, ingredients: newIngredients });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
        <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
          <span className="text-3xl">🍯</span> 仕掛品マスタ管理
        </h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-amber-50 border-b border-amber-100 px-6 py-4">
          <h2 className="text-lg font-bold text-amber-800">
            {isEditing ? '仕掛品の編集' : '新規仕掛品の追加'}
          </h2>
        </div>
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">仕掛品コード <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  value={formData.wip_code}
                  onChange={e => setFormData({...formData, wip_code: e.target.value})}
                  disabled={isEditing}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none disabled:bg-slate-100 disabled:text-slate-500"
                  placeholder="例: WIP001"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">仕掛品名 <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  value={formData.wip_name}
                  onChange={e => setFormData({...formData, wip_name: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                  placeholder="例: ガーリックバター"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">メモ</label>
              <textarea 
                value={formData.memo || ''}
                onChange={e => setFormData({...formData, memo: e.target.value})}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none min-h-[80px]"
                placeholder="作り方や注意点など"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-bold text-slate-700">構成材料</label>
                <button type="button" onClick={addIngredientRow} className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded shadow-sm">
                  + 材料を追加
                </button>
              </div>
              <div className="space-y-2">
                {formData.ingredients.length === 0 ? (
                  <p className="text-sm text-slate-400 p-4 border border-dashed rounded bg-slate-50">材料を追加してください</p>
                ) : (
                  formData.ingredients.map((ing, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <div className="flex-1">
                        <SearchableSelect 
                          options={masterIngredients.map(mi => ({value: mi.ingredient_code, label: `${mi.ingredient_code} : ${mi.ingredient_name}`}))}
                          value={ing.ingredient_code}
                          onChange={(val) => updateIngredientRow(idx, 'ingredient_code', val)}
                          placeholder="材料を検索・選択"
                        />
                      </div>
                      <div className="w-24">
                        <input 
                          type="number"
                          step="0.1"
                          min="0"
                          value={ing.ingredient_amount || ''}
                          onChange={(e) => updateIngredientRow(idx, 'ingredient_amount', Number(e.target.value))}
                          className="w-full px-2 py-2 border border-slate-300 rounded-lg text-right"
                          placeholder="g"
                          required
                        />
                      </div>
                      <span className="text-slate-500 text-sm">g</span>
                      <button type="button" onClick={() => removeIngredientRow(idx)} className="text-red-500 hover:bg-red-50 p-2 rounded">
                        🗑️
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
            
            <div className="flex gap-2 justify-end">
              {isEditing && (
                <button type="button" onClick={handleCancel} className="px-4 py-2 bg-slate-100 border rounded-lg font-bold">キャンセル</button>
              )}
              <button type="submit" className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg shadow-sm">
                {isEditing ? '更新' : '追加'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? <LoadingSpinner /> : wips.map(wip => (
          <div key={wip.wip_code} className="border border-slate-200 rounded-lg p-4 bg-white shadow-sm hover:shadow-md">
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded font-mono">{wip.wip_code}</span>
                <h3 className="font-bold text-lg mt-1">{wip.wip_name}</h3>
              </div>
              <div className="flex gap-1">
                <button onClick={() => handleEdit(wip)} className="p-1 hover:bg-blue-50 text-blue-600 rounded">✏️</button>
                <button onClick={() => handleDelete(wip.wip_code)} className="p-1 hover:bg-red-50 text-red-600 rounded">🗑️</button>
              </div>
            </div>
            {wip.memo && <div className="text-sm bg-slate-50 p-2 mb-2 rounded text-slate-600 whitespace-pre-wrap">{wip.memo}</div>}
            <table className="w-full text-sm mt-3 border-t pt-2">
              <tbody>
                {wip.ingredients.map((ing, i) => (
                  <tr key={i} className="border-b last:border-0 border-slate-100">
                    <td className="py-1">{ing.ingredient_name}</td>
                    <td className="py-1 text-right font-bold">{ing.ingredient_amount}g</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
