const fs = require('fs');
const path = 'src/app/production/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// Patch 1: toggleAllChecks
const toggleAllChecksStart = content.indexOf('const toggleAllChecks = async');
const toggleAllChecksEnd = content.indexOf('const newBatchChecks:', toggleAllChecksStart);
const toggleAllChecksBlock = content.substring(toggleAllChecksStart, toggleAllChecksEnd);

const toggleAllChecksNew = `const toggleAllChecks = async (batchId: string, isCurrentlyAllChecked: boolean) => {
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

    `;

content = content.replace(toggleAllChecksBlock, toggleAllChecksNew);

// Patch 2: toggleIngredientCheck
const toggleIngStart = content.indexOf('const toggleIngredientCheck = async');
const toggleIngEnd = content.indexOf('const newBatchChecks:', toggleIngStart);
const toggleIngBlock = content.substring(toggleIngStart, toggleIngEnd);

const toggleIngNew = `const toggleIngredientCheck = async (batchId: string, ingredientCode: string) => {
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

    `;
content = content.replace(toggleIngBlock, toggleIngNew);

// Patch 3: selectedBatchDetail definition
const batchDetailStart = content.indexOf('const selectedBatchDetail = useMemo');
const batchDetailEnd = content.indexOf('} else {', batchDetailStart);
const batchDetailBlock = content.substring(batchDetailStart, batchDetailEnd);

const batchDetailNew = `const selectedBatchDetail = useMemo(() => {
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

    if (isProduct) {
      const batchInfo = flatProductBatches.find(b => b.id === selectedBatchId);
      if (!batchInfo) return null;

      const currentQty = batchInfo.currentBatchQuantity;
      const safeOriginalQty = batchInfo.originalBatchQuantity || 1;

      // 現在の個数に合わせてグラム数を再計算
      const recalculatedIngredients = batchInfo.baseIngredients.map(ing => {
        const perItemWeight = ing.requiredWeightGrams / safeOriginalQty;
        return {
          ...ing,
          requiredWeightGrams: Math.round(perItemWeight * currentQty * 100) / 100
        };
      });

      const perItemDoughWeight = batchInfo.originalTotalDoughWeightGrams / safeOriginalQty;
      const currentTotalDoughWeightGrams = Math.round(perItemDoughWeight * currentQty * 100) / 100;

      return {
        ...batchInfo,
        type: 'product' as const,
        currentQty,
        currentTotalDoughWeightGrams,
        ingredients: recalculatedIngredients
      };
    `;

content = content.replace(batchDetailBlock, batchDetailNew);


// Patch 4: right pane UI stats box
const uiStartStr = '<div className="flex gap-8 items-center bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">';
const uiStart = content.indexOf(uiStartStr);
const uiEndStr = '<div className="flex gap-1.5 ml-1">';
const uiEnd = content.indexOf(uiEndStr, uiStart);
const uiBlock = content.substring(uiStart, uiEnd);

const uiNew = `<div className="flex gap-8 items-center bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
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
                      )}
                    </div>
                  </div>
                  
                  {/* アクションボタン群 */}
                  <div className="flex justify-between items-end">
                    `;

content = content.replace(uiBlock, uiNew);

fs.writeFileSync(path, content, 'utf8');
console.log("Patched everything securely.");
