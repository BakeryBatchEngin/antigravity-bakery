const fs = require('fs');
const path = 'src/app/production/page.tsx';
let content = fs.readFileSync(path, 'utf8');

function patchContent(markerStart, markerEnd, newStr) {
  const start = content.indexOf(markerStart);
  if (start === -1) {
    console.error("NOT FOUND START:", markerStart);
    process.exit(1);
  }
  const end = content.indexOf(markerEnd, start);
  if (end === -1) {
    console.error("NOT FOUND END:", markerEnd);
    process.exit(1);
  }
  const target = content.substring(start, end);
  content = content.replace(target, newStr);
}

// 1. Interfaces
patchContent('interface FlatProductBatch {', "  type: 'product';", `export interface WipMixingPlanItem {
  wipCode: string;
  wipName: string;
  totalRequiredGrams: number;
  batches: {
    batchNumber: number;
    batchTotalWeightGrams: number;
    ingredients: {
      ingredientCode: string;
      ingredientName: string;
      requiredWeightGrams: number;
    }[];
  }[];
}

export interface FlatWipBatch {
  id: string;
  type: 'wip';
  wipCode: string;
  wipName: string;
  batchNumber: number;
  originalTotalWeightGrams: number;
  currentTotalWeightGrams: number;
  baseIngredients: {
    ingredientCode: string;
    ingredientName: string;
    requiredWeightGrams: number;
  }[];
  selectedMixerId?: string;
  isAdditional?: boolean;
}

interface FlatProductBatch {\n`);

// 2. ProductionResponse
patchContent('  savedFlatProductBatches?: FlatProductBatch[];', '  executedBatchIds?: string[];', `  savedFlatProductBatches?: FlatProductBatch[];\n  wipMixingPlan?: WipMixingPlanItem[];\n  savedFlatWipBatches?: FlatWipBatch[];\n`);

// 3. States
patchContent('  const [flatProductBatches, setFlatProductBatches] = useState<FlatProductBatch[]>([]);', '  const [isPlanSet, setIsPlanSet] = useState<boolean>(false);', `  const [flatProductBatches, setFlatProductBatches] = useState<FlatProductBatch[]>([]);\n  const [flatWipBatches, setFlatWipBatches] = useState<FlatWipBatch[]>([]);\n`);

// 4. useEffect
patchContent('        setFlatBatches(initialDoughBatches);', '        const initialProductBatches: FlatProductBatch[] = [];', `        setFlatBatches(initialDoughBatches);

        const initialWipBatches: FlatWipBatch[] = [];
        if (data.wipMixingPlan && data.wipMixingPlan.length > 0) {
          data.wipMixingPlan.forEach(plan => {
            plan.batches.forEach(batch => {
              const id = \`\${plan.wipCode}-\${batch.batchNumber}\`;
              if (!firstBatchId) firstBatchId = id;
              initialWipBatches.push({
                id,
                type: 'wip',
                wipCode: plan.wipCode,
                wipName: plan.wipName,
                batchNumber: batch.batchNumber,
                originalTotalWeightGrams: batch.batchTotalWeightGrams,
                baseIngredients: batch.ingredients,
                currentTotalWeightGrams: batch.batchTotalWeightGrams,
                selectedMixerId: data.mixers?.[0]?.id
              });
            });
          });
        }
        setFlatWipBatches(initialWipBatches);

`);

// 5. toggleAllChecks
patchContent('  const toggleAllChecks = async (batchId: string, isCurrentlyAllChecked: boolean) => {', '    const newBatchChecks: Record<string, boolean> = {};', `  const toggleAllChecks = async (batchId: string, isCurrentlyAllChecked: boolean) => {
    let batch: FlatBatch | FlatProductBatch | FlatWipBatch | undefined = flatBatches.find(b => b.id === batchId);
    let batchType: 'dough' | 'product' | 'wip' = 'dough';
    
    if (!batch) {
      batch = flatProductBatches.find(b => b.id === batchId);
      if (batch) batchType = 'product';
    }
    if (!batch) {
      batch = flatWipBatches.find(b => b.id === batchId);
      if (batch) batchType = 'wip';
    }
    
    if (!batch) return;

    let calculatedIngredients = [];
    if (batchType === 'product') {
      const b = batch as FlatProductBatch;
      const safeOriginalQty = b.originalBatchQuantity || 1;
      const currentQty = b.currentBatchQuantity || 1;
      calculatedIngredients = b.baseIngredients.map(ing => ({
        ingredientCode: ing.ingredientCode,
        ingredientName: ing.ingredientName,
        requiredWeightGrams: Math.round((ing.requiredWeightGrams / safeOriginalQty) * currentQty * 100) / 100
      }));
    } else if (batchType === 'wip') {
      const b = batch as FlatWipBatch;
      const safeOriginalQty = b.originalTotalWeightGrams || 1;
      const ratio = b.currentTotalWeightGrams / safeOriginalQty;
      calculatedIngredients = b.baseIngredients.map(ing => ({
        ingredientCode: ing.ingredientCode,
        ingredientName: ing.ingredientName,
        requiredWeightGrams: Math.round((ing.requiredWeightGrams * ratio) * 100) / 100
      }));
    } else {
      const b = batch as FlatBatch;
      const currTotalFlour = b.currentFlourWeightGrams || 0;
      calculatedIngredients = b.baseIngredients.map(ing => ({
        ingredientCode: ing.ingredientCode,
        ingredientName: ing.ingredientName,
        requiredWeightGrams: Math.round(currTotalFlour * (ing.bakersPercent / 100) * 100) / 100
      }));
    }

`);

// 6. toggleIngredientCheck
patchContent('    // 変更後の全材料チェック判定を行う', '    const allCheckedNow = calculatedIngredients', `    // 変更後の全材料チェック判定を行う
    let batch: FlatBatch | FlatProductBatch | FlatWipBatch | undefined = flatBatches.find(b => b.id === batchId);
    let batchType: 'dough' | 'product' | 'wip' = 'dough';
    
    if (!batch) {
      batch = flatProductBatches.find(b => b.id === batchId);
      if (batch) batchType = 'product';
    }
    if (!batch) {
      batch = flatWipBatches.find(b => b.id === batchId);
      if (batch) batchType = 'wip';
    }
    
    if (!batch) return;

    // 現在の計算された材料リストを生成 (UI上のグラム数と同じ量)
    let calculatedIngredients = [];
    if (batchType === 'product') {
      const b = batch as FlatProductBatch;
      const safeOriginalQty = b.originalBatchQuantity || 1;
      const currentQty = b.currentBatchQuantity || 1;
      calculatedIngredients = b.baseIngredients.map(ing => ({
        ingredientCode: ing.ingredientCode,
        ingredientName: ing.ingredientName,
        requiredWeightGrams: Math.round((ing.requiredWeightGrams / safeOriginalQty) * currentQty * 100) / 100
      }));
    } else if (batchType === 'wip') {
      const b = batch as FlatWipBatch;
      const safeOriginalQty = b.originalTotalWeightGrams || 1;
      const ratio = b.currentTotalWeightGrams / safeOriginalQty;
      calculatedIngredients = b.baseIngredients.map(ing => ({
        ingredientCode: ing.ingredientCode,
        ingredientName: ing.ingredientName,
        requiredWeightGrams: Math.round((ing.requiredWeightGrams * ratio) * 100) / 100
      }));
    } else {
      const b = batch as FlatBatch;
      const currTotalFlour = b.currentFlourWeightGrams || 0;
      calculatedIngredients = b.baseIngredients.map(ing => ({
        ingredientCode: ing.ingredientCode,
        ingredientName: ing.ingredientName,
        requiredWeightGrams: Math.round(currTotalFlour * (ing.bakersPercent / 100) * 100) / 100
      }));
    }

`);

// 7. selectedBatchDetail
patchContent('  const selectedBatchDetail = useMemo(() => {', '    if (isProduct) {', `  const selectedBatchDetail = useMemo(() => {
    if (!selectedBatchId) return null;
    
    const isProduct = selectedBatchId.startsWith('PM-') || selectedBatchId.startsWith('ADD-P-');
    
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

`);

// 8. Rename 副材料仕込み and Inject WIP UI
patchContent('              {/* === 副材料仕込み（Product Mixing）のリスト === */}', '              {flatProductBatches.length > 0 && (', `              {/* === 仕掛品仕込み（WIP Mixing）のリスト === */}
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

              {/* === オーダー商品（Product Mixing）のリスト === */}
              {flatProductBatches.length > 0 && (
                <div className="mt-8 mb-2 border-t-2 border-slate-300 dark:border-slate-600 pt-6">
                  <h3 className="text-xl font-bold flex items-center gap-2 mb-4 text-amber-700 dark:text-amber-500">
                    <span className="text-2xl">🥐</span> オーダー商品
                  </h3>
`);
patchContent('                    <span className="text-2xl">🥐</span> 副材料仕込み', '                  </h3>', `                    <span className="text-2xl">🥐</span> オーダー商品\n`);

// 9. Right pane Detail box
patchContent("                      {selectedBatchDetail.type === 'dough' ? (", '                    </div>\n                  </div>\n\n                  {/* 材料リスト */}', `                      {selectedBatchDetail.type === 'dough' ? (
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
                      )}\n`);

fs.writeFileSync(path, content, 'utf8');
console.log("All patches applied VERY securely.");
