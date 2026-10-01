const fs = require('fs');
const path = 'src/app/production/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const regex = /\{\/\* === 副材料仕込み（Product Mixing）のリスト === \*\/\}\r?\n\s*\{flatProductBatches\.length > 0 && \(\r?\n\s*<div className="mt-8 mb-2 border-t-2 border-slate-300 dark:border-slate-600 pt-6">\r?\n\s*<h3 className="text-xl font-bold flex items-center gap-2 mb-4 text-amber-700 dark:text-amber-500">\r?\n\s*<span className="text-2xl">🥐<\/span> 副材料仕込み\r?\n\s*<\/h3>/;

const replacement = `              {/* === 仕掛品仕込み（WIP Mixing）のリスト === */}
              {flatWipBatches.length > 0 && (
                <div className="mt-8 mb-2 border-t-2 border-slate-300 dark:border-slate-600 pt-6">
                  <h3 className="text-xl font-bold flex items-center gap-2 mb-4 text-amber-700 dark:text-amber-500">
                    <span className="text-2xl">🍯</span> 仕掛品仕込み
                  </h3>
                  <div className="space-y-4">
                  {flatWipBatches.map(batch => {
                    const isSelected = selectedBatchId === batch.id;
                    const isExecuted = executedBatchIds.includes(batch.id);
                    
                    const batchChecks = checkedIngredients[batch.id] || {};
                    const isAllChecked = batch.baseIngredients.length > 0 && batch.baseIngredients.every(ing => batchChecks[ing.ingredientCode]);

                    return (
                      <div 
                        key={batch.id} 
                        onClick={() => { setSelectedBatchId(batch.id); setIsMobileDetailView(true); }}
                        className={\`
                          cursor-pointer rounded-xl px-3 py-2.5 transition-all duration-200 flex flex-col relative overflow-hidden border-l-4 mb-2
                          \${isExecuted 
                            ? (isSelected 
                               ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/40 shadow-md scale-[1.01]' 
                               : 'border-y border-r border-slate-300 border-l-slate-400 bg-slate-100 dark:bg-slate-800 dark:border-slate-700') 
                            : 'border-l-emerald-500'}
                          \${isSelected && !isExecuted ? 'bg-amber-50 dark:bg-amber-900/40 border-y border-r border-amber-300 dark:border-amber-700 shadow-md scale-[1.01]' : (!isExecuted ? 'border-y border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-amber-300 hover:shadow-sm' : '')}
                        \`}
                      >
                        {isExecuted && (
                          <div className="absolute inset-0 bg-white/40 dark:bg-slate-900/40 pointer-events-none z-10" />
                        )}
                        <div className="flex justify-between items-start mb-1 relative z-20">
                          <div className="flex items-center gap-2">
                            <span className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 px-1.5 py-0.5 rounded font-mono font-bold">{batch.wipCode}</span>
                            <span className="font-bold text-sm text-slate-700 dark:text-slate-200">{batch.wipName}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 relative z-20 mt-1">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 font-bold text-sm shadow-inner shrink-0">
                            {batch.batchNumber}
                          </div>
                          <div className="text-xs text-amber-600 dark:text-amber-400 font-bold whitespace-nowrap shrink-0">
                            回目
                          </div>
                          <div className="flex items-center justify-center gap-1 shrink-0">
                            <MixerIcon 
                              className={\`w-7 h-7 transition-colors \${batch.selectedMixerId ? 'text-amber-500 dark:text-amber-400' : 'text-slate-300 dark:text-slate-600'}\`}
                            />
                            <div className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-600 flex items-center justify-center">
                              {isExecuted && <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />}
                              {!isExecuted && isAllChecked && <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />}
                            </div>
                          </div>
                          
                          <div className="flex-1 flex justify-end">
                            <div className="text-right">
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">仕掛品重量</div>
                              <div className="flex items-baseline justify-end gap-1">
                                <span className="font-black text-amber-600 dark:text-amber-400 text-lg">{(batch.currentTotalWeightGrams / 1000).toFixed(2)}</span>
                                <span className="text-xs text-amber-600 dark:text-amber-400 font-bold">kg</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              )}

              {/* === 副材料仕込み（Product Mixing）のリスト === */}
              {flatProductBatches.length > 0 && (
                <div className="mt-8 mb-2 border-t-2 border-slate-300 dark:border-slate-600 pt-6">
                  <h3 className="text-xl font-bold flex items-center gap-2 mb-4 text-amber-700 dark:text-amber-500">
                    <span className="text-2xl">🥐</span> オーダー商品
                  </h3>`;

if (regex.test(content)) {
  fs.writeFileSync(path, content.replace(regex, replacement), 'utf8');
  console.log('Success!');
} else {
  console.log('Failed to match regex.');
}
