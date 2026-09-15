import os

with open('src/app/admin/doughs/page.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Update Interfaces
c = c.replace("""interface DoughIngredient {
  ingredient_code: string;
  ingredient_name: string;
  bakers_percent: number;
}""", """interface DoughIngredient {
  ingredient_code: string;
  ingredient_name: string;
  bakers_percent?: number;
  ingredient_amount?: number;
}""")

c = c.replace("""interface Dough {
  dough_id: string;
  dough_name: string;
  ingredients: DoughIngredient[];
}""", """interface Dough {
  dough_id: string;
  dough_name: string;
  type?: 'standard' | 'sub_dough';
  base_dough_id?: string;
  base_dough_name?: string;
  base_dough_amount?: number;
  ingredients: DoughIngredient[];
}""")

# 2. Update default formData
c = c.replace("""  const [formData, setFormData] = useState<Dough>({
    dough_id: '',
    dough_name: '',
    ingredients: [],
  });""", """  const [formData, setFormData] = useState<Dough>({
    dough_id: '',
    dough_name: '',
    type: 'standard',
    ingredients: [],
  });""")

# 3. Update cost calculation to handle sub_dough
c = c.replace("""    dough.ingredients.forEach(ing => {
      totalPercent += ing.bakers_percent;
      const costPerG = getIngredientCostPerGram(ing.ingredient_code);
      costForTotalPercent += ing.bakers_percent * costPerG;
    });

    if (totalPercent === 0) return 0;
    return (costForTotalPercent / totalPercent) * 1000;""", """    if (dough.type === 'sub_dough') {
      let totalGrams = dough.base_dough_amount || 0;
      let totalCost = 0;
      
      const baseDough = doughs.find(d => d.dough_id === dough.base_dough_id);
      if (baseDough) {
        const baseDoughCostPerKg = calculateDoughCostPerKg(baseDough);
        totalCost += (baseDoughCostPerKg / 1000) * (dough.base_dough_amount || 0);
      }

      dough.ingredients.forEach(ing => {
        totalGrams += (ing.ingredient_amount || 0);
        const costPerG = getIngredientCostPerGram(ing.ingredient_code);
        totalCost += (ing.ingredient_amount || 0) * costPerG;
      });

      if (totalGrams === 0) return 0;
      return (totalCost / totalGrams) * 1000;
    } else {
      dough.ingredients.forEach(ing => {
        totalPercent += (ing.bakers_percent || 0);
        const costPerG = getIngredientCostPerGram(ing.ingredient_code);
        costForTotalPercent += (ing.bakers_percent || 0) * costPerG;
      });

      if (totalPercent === 0) return 0;
      return (costForTotalPercent / totalPercent) * 1000;
    }""")

# 4. Update cancel function
c = c.replace("""    setFormData({ dough_id: '', dough_name: '', ingredients: [] });""", """    setFormData({ dough_id: '', dough_name: '', type: 'standard', base_dough_id: '', base_dough_name: '', base_dough_amount: 0, ingredients: [] });""")

# 5. Update addIngredientRow
c = c.replace("""        { ingredient_code: '', ingredient_name: '', bakers_percent: 0 }""", """        { ingredient_code: '', ingredient_name: '', bakers_percent: formData.type === 'standard' ? 0 : undefined, ingredient_amount: formData.type === 'sub_dough' ? 0 : undefined }""")


# 6. Update updateIngredientRow
c = c.replace("""    } else if (field === 'bakers_percent') {
      newIngs[index].bakers_percent = value as number;
    }""", """    } else if (field === 'bakers_percent') {
      newIngs[index].bakers_percent = value as number;
    } else if (field === 'ingredient_amount') {
      newIngs[index].ingredient_amount = value as number;
    }""")

# 7. Update handleSubmit validation
c = c.replace("""    if (formData.ingredients.length === 0) {
      setErrorMsg('少なくとも1つ以上の材料を追加してください');
      return;
    }
    const hasEmptyIng = formData.ingredients.some(i => !i.ingredient_code || i.bakers_percent <= 0);
    if (hasEmptyIng) {
      setErrorMsg('材料コードとBakers%(0より大きい値)を正しく入力してください');
      return;
    }""", """    if (formData.type === 'standard') {
      if (formData.ingredients.length === 0) {
        setErrorMsg('少なくとも1つ以上の材料を追加してください');
        return;
      }
      const hasEmptyIng = formData.ingredients.some(i => !i.ingredient_code || !i.bakers_percent || i.bakers_percent <= 0);
      if (hasEmptyIng) {
        setErrorMsg('材料コードとBakers%(0より大きい値)を正しく入力してください');
        return;
      }
    } else {
      if (!formData.base_dough_id || !formData.base_dough_amount || formData.base_dough_amount <= 0) {
        setErrorMsg('ベース生地と基準グラム数を正しく入力してください');
        return;
      }
      const hasEmptyIng = formData.ingredients.some(i => !i.ingredient_code || !i.ingredient_amount || i.ingredient_amount <= 0);
      if (hasEmptyIng) {
        setErrorMsg('追加材料のコードとグラム数(0より大きい値)を正しく入力してください');
        return;
      }
    }""")

# 8. Update form UI (type toggle and base dough section)
form_top = """            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">"""
form_top_new = """            {/* 種類選択 */}
            <div className="flex gap-4 p-4 bg-slate-100 rounded-lg border border-slate-200">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="dough_type" 
                  value="standard" 
                  checked={formData.type === 'standard'} 
                  onChange={() => setFormData({...formData, type: 'standard'})}
                  className="w-4 h-4 text-amber-500"
                />
                <span className="font-bold text-slate-700">標準生地 (Bakers %)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="dough_type" 
                  value="sub_dough" 
                  checked={formData.type === 'sub_dough'} 
                  onChange={() => setFormData({...formData, type: 'sub_dough'})}
                  className="w-4 h-4 text-amber-500"
                />
                <span className="font-bold text-slate-700">サブ生地 (ベース生地 + 追加材料)</span>
              </label>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">"""
c = c.replace(form_top, form_top_new)


# 9. Add Sub dough base selection
base_dough_ui = """            </div>

            {/* 材料リストエディタ */}"""
base_dough_ui_new = """            </div>

            {formData.type === 'sub_dough' && (
              <div className="border border-indigo-200 bg-indigo-50/30 rounded-lg p-4">
                <h3 className="font-bold text-indigo-800 mb-3 border-b border-indigo-200 pb-2">ベース生地の設定</h3>
                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  <select
                    value={formData.base_dough_id || ''}
                    onChange={(e) => {
                      const selected = doughs.find(d => d.dough_id === e.target.value);
                      setFormData({
                        ...formData,
                        base_dough_id: e.target.value,
                        base_dough_name: selected?.dough_name || ''
                      });
                    }}
                    className="flex-[2] w-full px-3 py-2 text-slate-900 border border-slate-300 rounded focus:ring-indigo-500 outline-none"
                  >
                    <option value="">-- ベースとなる生地を選択 --</option>
                    {doughs.filter(d => d.type === 'standard').map(d => (
                      <option key={d.dough_id} value={d.dough_id}>
                        {d.dough_name}
                      </option>
                    ))}
                  </select>
                  <div className="flex-1 w-full sm:w-auto flex items-center gap-1 border border-slate-300 rounded px-2 focus-within:ring-2 focus-within:ring-indigo-500 bg-white">
                    <input 
                      type="number"
                      step="1"
                      min="1"
                      value={formData.base_dough_amount || ''}
                      onChange={(e) => setFormData({...formData, base_dough_amount: Number(e.target.value)})}
                      className="w-full py-2 text-slate-900 outline-none text-right placeholder-slate-400"
                      placeholder="例: 125"
                    />
                    <span className="text-slate-400 font-bold px-1">g</span>
                  </div>
                </div>
              </div>
            )}

            {/* 材料リストエディタ */}"""
c = c.replace(base_dough_ui, base_dough_ui_new)

# 10. Update ingredient list heading and input
header_target = """<h3 className="font-bold text-amber-800">使用材料 (Bakers %)</h3>"""
header_new = """<h3 className="font-bold text-amber-800">{formData.type === 'standard' ? '使用材料 (Bakers %)' : '追加材料 (固定グラム数)'}</h3>"""
c = c.replace(header_target, header_new)

input_target = """                      <input 
                        type="number"
                        step="0.1"
                        min="0"
                        value={ing.bakers_percent || ''}
                        onChange={(e) => updateIngredientRow(idx, 'bakers_percent', Number(e.target.value))}
                        className="w-full py-2 text-slate-900 outline-none text-right placeholder-slate-400"
                        placeholder="100"
                        required
                      />
                      <span className="text-slate-400 font-bold px-1">%</span>"""
input_new = """                      <input 
                        type="number"
                        step={formData.type === 'standard' ? "0.1" : "1"}
                        min="0"
                        value={formData.type === 'standard' ? (ing.bakers_percent || '') : (ing.ingredient_amount || '')}
                        onChange={(e) => updateIngredientRow(idx, formData.type === 'standard' ? 'bakers_percent' : 'ingredient_amount', Number(e.target.value))}
                        className="w-full py-2 text-slate-900 outline-none text-right placeholder-slate-400"
                        placeholder={formData.type === 'standard' ? "100" : "例: 23"}
                        required
                      />
                      <span className="text-slate-400 font-bold px-1">{formData.type === 'standard' ? '%' : 'g'}</span>"""
c = c.replace(input_target, input_new)

# 11. Update Dough list view
list_target = """                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono bg-slate-200 text-slate-600 px-3 py-1 rounded">{dough.dough_id}</span>
                        {calculateDoughCostPerKg(dough) > 0 && (
                          <span className="text-sm font-bold bg-amber-100 text-amber-800 px-3 py-1 rounded border border-amber-200 shadow-sm">
                            原価: ¥{Math.round(calculateDoughCostPerKg(dough))}/kg
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-lg text-slate-800 mt-1">{dough.dough_name}</h3>"""
list_new = """                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono bg-slate-200 text-slate-600 px-3 py-1 rounded">{dough.dough_id}</span>
                        {dough.type === 'sub_dough' && (
                          <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2 py-1 rounded border border-indigo-200">
                            サブ生地
                          </span>
                        )}
                        {calculateDoughCostPerKg(dough) > 0 && (
                          <span className="text-sm font-bold bg-amber-100 text-amber-800 px-3 py-1 rounded border border-amber-200 shadow-sm">
                            原価: ¥{Math.round(calculateDoughCostPerKg(dough))}/kg
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-lg text-slate-800 mt-1">{dough.dough_name}</h3>"""
c = c.replace(list_target, list_new)

table_target = """                    <table className="w-full text-sm">
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
                    </table>"""
table_new = """                    <table className="w-full text-sm">
                      <tbody>
                        {dough.type === 'sub_dough' && (
                          <tr className="border-b border-indigo-100 bg-indigo-50/50">
                            <td className="py-1 px-1 text-indigo-700 font-bold">🍞 {dough.base_dough_name}</td>
                            <td className="py-1 px-1 text-right font-bold text-indigo-800">{dough.base_dough_amount}g</td>
                          </tr>
                        )}
                        {dough.ingredients.map((ing, idx) => (
                          <tr key={idx} className="border-b last:border-0 border-slate-100">
                            <td className="py-1 text-slate-600">{dough.type === 'sub_dough' ? `＋ ${ing.ingredient_name}` : ing.ingredient_name}</td>
                            <td className="py-1 text-right font-bold text-slate-800">
                              {dough.type === 'standard' ? `${ing.bakers_percent}%` : `${ing.ingredient_amount}g`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t border-slate-200 mt-1 font-bold text-slate-500">
                        <tr>
                          <td className="pt-1">合計</td>
                          <td className="pt-1 text-right">
                            {dough.type === 'standard' 
                              ? `${dough.ingredients.reduce((sum, i) => sum + (i.bakers_percent||0), 0)}%`
                              : `${(dough.base_dough_amount||0) + dough.ingredients.reduce((sum, i) => sum + (i.ingredient_amount||0), 0)}g`
                            }
                          </td>
                        </tr>
                      </tfoot>
                    </table>"""
c = c.replace(table_target, table_new)

with open('src/app/admin/doughs/page.tsx', 'w', encoding='utf-8') as f:
    f.write(c)

print("Updated UI")
