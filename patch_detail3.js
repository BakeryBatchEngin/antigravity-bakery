const fs = require('fs');

const path = 'src/app/production/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const t = `                    <div className="flex gap-8 items-center bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
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

const r = `                    <div className="flex gap-8 items-center bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
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

if (content.includes(t)) {
  content = content.replace(t, r);
  fs.writeFileSync(path, content, 'utf8');
  console.log("Success");
} else {
  console.log("Not found, falling back to substring search...");
  // Fallback to substring replace based on index
  const idx = content.indexOf('flex gap-8 items-center bg-white px-4 py-2');
  if (idx > -1) {
    const endIdx = content.indexOf('</>', idx) + 3;
    const finalEndIdx = content.indexOf(')}', endIdx) + 2;
    content = content.slice(0, idx - 36) + r + content.slice(finalEndIdx);
    fs.writeFileSync(path, content, 'utf8');
    console.log("Success with fallback");
  } else {
    console.log("Completely failed.");
  }
}
