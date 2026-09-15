import os
import base64

b64 = "const bakersPercent = ing.bakersPercent;"

with open('src/app/production/page.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

target = """                        {selectedBatchDetail.ingredients.map((ing, idx) => {"""
new = """                        {selectedBatchDetail.type === 'dough' && selectedBatchDetail.isSubDough && (
                            <tr 
                              onClick={() => toggleIngredientCheck(selectedBatchDetail.id, '__BASE_DOUGH__')}
                              className={`
                                border-b border-slate-200/80 hover:bg-slate-50 transition-all cursor-pointer group
                                ${checkedIngredients[selectedBatchDetail.id]?.__BASE_DOUGH__ ? 'opacity-40 bg-slate-100 grayscale' : 'bg-indigo-50/30'}
                              `}
                            >
                              <td className={`py-5 px-6 font-bold text-xl sm:text-2xl transition-colors ${checkedIngredients[selectedBatchDetail.id]?.__BASE_DOUGH__ ? 'text-slate-400 line-through' : 'text-indigo-700'}`}>
                                🍞 {selectedBatchDetail.baseDoughName || 'ベース生地'}
                              </td>
                              <td className="py-5 px-6 text-center text-slate-500 font-bold text-lg">
                                -
                              </td>
                              <td className="py-5 px-6 text-right">
                                <span className={`text-4xl sm:text-5xl font-black font-mono tracking-tighter transition-colors ${checkedIngredients[selectedBatchDetail.id]?.__BASE_DOUGH__ ? 'text-slate-400' : 'text-indigo-600 group-hover:text-indigo-500'}`}>
                                  {fmtG(selectedBatchDetail.currentFlourWeightGrams)}
                                </span>
                                <span className={`text-xl sm:text-2xl ml-2 font-bold text-slate-400`}>
                                  g
                                </span>
                              </td>
                              <td className="py-5 px-6 text-right">
                                <div className={`
                                  w-10 h-10 rounded-md border-2 flex items-center justify-center transition-all mx-auto shadow-sm
                                  ${checkedIngredients[selectedBatchDetail.id]?.__BASE_DOUGH__ 
                                    ? 'bg-amber-500 border-amber-500 text-white shadow-inner' 
                                    : 'bg-white border-slate-300 group-hover:border-amber-400 group-hover:bg-amber-50 text-transparent'}
                                `}>
                                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                                  </svg>
                                </div>
                              </td>
                            </tr>
                          )}
                          {selectedBatchDetail.ingredients.map((ing, idx) => {"""
c = c.replace(target, new)

target2 = """                              {selectedBatchDetail.type === 'dough' && (
                                <td className="py-5 px-6 text-center text-slate-500 font-bold text-lg">
                                  {bakersPercent}%
                                </td>
                              )}"""
new2 = """                              {selectedBatchDetail.type === 'dough' && (
                                <td className="py-5 px-6 text-center text-slate-500 font-bold text-lg">
                                  {typeof bakersPercent === 'number' ? (Math.round(bakersPercent * 10) / 10) : bakersPercent}%
                                </td>
                              )}"""
c = c.replace(target2, new2)

with open('src/app/production/page.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print("done")