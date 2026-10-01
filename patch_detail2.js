const fs = require('fs');

const path = 'src/app/production/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const regex1 = /  const selectedBatchDetail = useMemo\(\(\) => \{\r?\n\s*if \(\!selectedBatchId\) return null;\r?\n\s*const isProduct = selectedBatchId\.startsWith\('PM-'\) \|\| selectedBatchId\.startsWith\('ADD-P-'\);\r?\n\s*if \(isProduct\) \{/;

const repStr1 = `  const selectedBatchDetail = useMemo(() => {
    if (!selectedBatchId) return null;
    
    const isProduct = selectedBatchId.startsWith('PM-') || selectedBatchId.startsWith('ADD-P-');
    
    // WIP判定
    const wipBatchInfo = flatWipBatches.find(b => b.id === selectedBatchId);
    if (wipBatchInfo) {
      const safeOriginalQty = wipBatchInfo.originalTotalWeightGrams || 1;
      const ratio = wipBatchInfo.currentTotalWeightGrams / safeOriginalQty;

      const recalculatedIngredients = wipBatchInfo.baseIngredients.map(ing => {
        return {
          ...ing,
          requiredWeightGrams: Math.round(ing.requiredWeightGrams * ratio * 100) / 100
        };
      });

      return {
        ...wipBatchInfo,
        type: 'wip' as const,
        productCode: wipBatchInfo.wipCode,
        productName: wipBatchInfo.wipName,
        ingredients: recalculatedIngredients
      };
    }

    if (isProduct) {`;

const regex2 = /                      \{selectedBatchDetail\.type === 'dough' \? \([\s\S]*?\} \)/;
// Wait, regex2 is too complex to write safely, let me just find the snippet

const r2 = /<div className="flex gap-8 items-center bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">[\s\S]*?<\/div>\r?\n\s*<\/div>\r?\n\s*<\/div>\r?\n\s*<\/>\r?\n\s*\) : \(\r?\n\s*<>\r?\n\s*<div className="text-center">[\s\S]*?<\/div>\r?\n\s*<\/div>\r?\n\s*<\/>\r?\n\s*\)\}/;

const repStr2 = `                    <div className="flex gap-8 items-center bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                      {selectedBatchDetail.type === 'dough' ? (
                        <>
                          <div className="text-center">
                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{selectedBatchDetail?.isSubDough ? 'ベース生地量' : '粉量'}</div>
                            <div className="text-2xl font-black text-slate-700">
                              {fmtG(selectedBatchDetail.currentFlourWeightGrams)} <span className="text-xl text-slate-400">g</span>
                            </div>
                          </div>
                          <div className="text-slate-300 font-light text-2xl">/</div>
                          <div className="text-center">
                            <div className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">総生地量目安</div>
                            <div className="text-3xl font-black text-amber-500">
                              {fmtG(selectedBatchDetail.currentTotalWeightGrams)} <span className="text-2xl text-amber-500/80">g</span>
                            </div>
                          </div>
                        </>
                      ) : selectedBatchDetail.type === 'wip' ? (
                        <>
                          <div className="text-center">
                            <div className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">仕掛品総重量</div>
                            <div className="text-3xl font-black text-amber-500">
                              {fmtG(selectedBatchDetail.currentTotalWeightGrams)} <span className="text-2xl text-amber-500/80">g</span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-center">
                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">バッチ個数</div>
                            <div className="text-2xl font-black text-slate-700">
                              {selectedBatchDetail.currentQty} <span className="text-xl text-slate-400">個</span>
                            </div>
                          </div>
                          <div className="text-slate-300 font-light text-2xl">/</div>
                          <div className="text-center">
                            <div className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">使用生地量目安</div>
                            <div className="text-3xl font-black text-amber-500">
                              {fmtG(selectedBatchDetail.currentTotalDoughWeightGrams)} <span className="text-2xl text-amber-500/80">g</span>
                            </div>
                          </div>
                        </>
                      )}`;

if (regex1.test(content)) content = content.replace(regex1, repStr1);
else console.log("regex1 not found");
if (r2.test(content)) content = content.replace(r2, repStr2);
else console.log("regex2 not found");

fs.writeFileSync(path, content, 'utf8');
console.log('Done');
