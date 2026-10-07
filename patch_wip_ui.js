const fs = require('fs');

const pageTsxPath = 'src/app/production/page.tsx';
let c = fs.readFileSync(pageTsxPath, 'utf8');

// 1. Add adjustWipWeight function
const wipFunc = `
  const adjustWipWeight = (id: string, wipCode: string, deltaGrams: number, e: React.MouseEvent) => {
    e.stopPropagation();

    setFlatWipBatches(prevWips => {
      let updatedWips = [...prevWips];
      
      const targetBatches = updatedWips.filter(b => b.wipCode === wipCode).sort((a,b) => a.batchNumber - b.batchNumber);
      if (targetBatches.length === 0) return prevWips;
      
      const idx = updatedWips.findIndex(b => b.id === id);
      if (idx === -1) return prevWips;
      
      // Calculate normalized value
      const newValueGrams = Math.max(0, updatedWips[idx].currentTotalWeightGrams + deltaGrams);
      updatedWips[idx] = {
        ...updatedWips[idx],
        currentTotalWeightGrams: newValueGrams
      };
      
      // Re-normalize WIP batches for this wipCode
      const otherWipBatches = updatedWips.filter(b => b.wipCode !== wipCode);
      const wipBatchesToNormalize = updatedWips.filter(b => b.wipCode === wipCode).sort((a,b) => a.batchNumber - b.batchNumber);
      
      // We need mixers from state, assuming 'mixers' is available in scope
      const normalizedWipBatches = normalizeWipBatches(wipBatchesToNormalize, mixers);
      
      let finalWips = [...otherWipBatches, ...normalizedWipBatches];
      finalWips.sort((a, b) => {
        const wipCmp = a.wipCode.localeCompare(b.wipCode, 'en');
        if (wipCmp !== 0) return wipCmp;
        return a.batchNumber - b.batchNumber;
      });
      return finalWips;
    });
  };
`;

if (!c.includes('const adjustWipWeight =')) {
  c = c.replace('const adjustProductQuantity =', wipFunc + '\n  const adjustProductQuantity =');
}

// 2. Replace the WIP batch render block
const searchStr = `                          <div className="flex items-center justify-center gap-1 shrink-0">
                            <span className="text-xl">🍯</span>
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
                          </div>`;

const replaceStr = `                          <div className="flex-1 flex justify-end">
                            <div className="flex flex-col items-end">
                              <span className="text-[9px] font-bold uppercase tracking-widest leading-none mb-0.5 text-amber-600 dark:text-amber-500">仕掛品重量</span>
                              <div className="flex items-baseline justify-end gap-1 mb-1">
                                <span className="font-black text-amber-600 dark:text-amber-400 text-lg">{(batch.currentTotalWeightGrams / 1000).toFixed(2)}</span>
                                <span className="text-[9px] font-bold ml-0.5 opacity-80 text-amber-600 dark:text-amber-400">kg</span>
                              </div>
                              {!isExecuted && !isPlanSet && (
                                <div className="flex bg-slate-100 border border-slate-300 rounded overflow-hidden">
                                  <AutoRepeatButton 
                                    onAction={(e: any) => adjustWipWeight(batch.id, batch.wipCode, 100, e)}
                                    disabled={isExecuted || isPlanSet}
                                    className={\`px-1.5 py-0.5 transition-colors border-r \${isSelected ? 'hover:bg-amber-200 active:bg-amber-300 text-amber-800 border-amber-200' : 'hover:bg-slate-300 active:bg-slate-400 text-slate-700 border-slate-300'}\`}
                                  >
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd"></path></svg>
                                  </AutoRepeatButton>
                                  <AutoRepeatButton 
                                    onAction={(e: any) => adjustWipWeight(batch.id, batch.wipCode, -100, e)}
                                    disabled={isExecuted || isPlanSet}
                                    className={\`px-1.5 py-0.5 transition-colors \${isSelected ? 'hover:bg-amber-200 active:bg-amber-300 text-amber-800' : 'hover:bg-slate-300 active:bg-slate-400 text-slate-700'}\`}
                                  >
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" clipRule="evenodd"></path></svg>
                                  </AutoRepeatButton>
                                </div>
                              )}
                            </div>
                          </div>`;

c = c.replace(searchStr, replaceStr);
fs.writeFileSync(pageTsxPath, c);
console.log('Successfully patched page.tsx for WIP UI buttons');
