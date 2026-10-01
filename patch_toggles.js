const fs = require('fs');
const path = 'src/app/production/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const t1 = `    let batch: FlatBatch | FlatProductBatch | undefined = flatBatches.find(b => b.id === batchId);
    let isProduct = false;
    let currentQty = 1;
    let currTotalFlour = 0;
    
    if (!batch) {
      batch = flatProductBatches.find(b => b.id === batchId);
      isProduct = true;
      currentQty = (batch as FlatProductBatch)?.currentBatchQuantity || 1;
    } else {
      currTotalFlour = (batch as FlatBatch)?.currentFlourWeightGrams || 0;
    }
    
    if (!batch) return;

    let calculatedIngredients = [];
    if (isProduct) {
      const b = batch as FlatProductBatch;
      const safeOriginalQty = b.originalBatchQuantity || 1;
      calculatedIngredients = b.baseIngredients.map(ing => ({
        ingredientCode: ing.ingredientCode,
        ingredientName: ing.ingredientName,
        requiredWeightGrams: Math.round((ing.requiredWeightGrams / safeOriginalQty) * currentQty * 100) / 100
      }));
    } else {
      const b = batch as FlatBatch;
      calculatedIngredients = b.baseIngredients.map(ing => ({
        ingredientCode: ing.ingredientCode,
        ingredientName: ing.ingredientName,
        requiredWeightGrams: Math.round(currTotalFlour * (ing.bakersPercent / 100) * 100) / 100
      }));
    }`;

const r1 = `    let batch: FlatBatch | FlatProductBatch | FlatWipBatch | undefined = flatBatches.find(b => b.id === batchId);
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
    }`;

if(content.includes(t1)) {
  content = content.replace(t1, r1);
  console.log("toggleAllChecks patched");
} else console.log("toggleAllChecks target not found");

const t2 = `    let batch: FlatBatch | FlatProductBatch | undefined = flatBatches.find(b => b.id === batchId);
    let isProduct = false;
    let currentQty = 1;
    let currTotalFlour = 0;
    
    if (!batch) {
      batch = flatProductBatches.find(b => b.id === batchId);
      isProduct = true;
      currentQty = (batch as FlatProductBatch)?.currentBatchQuantity || 1;
    } else {
      currTotalFlour = (batch as FlatBatch)?.currentFlourWeightGrams || 0;
    }
    
    if (!batch) return;

    let calculatedIngredients = [];
    if (isProduct) {
      const b = batch as FlatProductBatch;
      const safeOriginalQty = b.originalBatchQuantity || 1;
      calculatedIngredients = b.baseIngredients.map(ing => ({
        ingredientCode: ing.ingredientCode,
        ingredientName: ing.ingredientName,
        requiredWeightGrams: Math.round((ing.requiredWeightGrams / safeOriginalQty) * currentQty * 100) / 100
      }));
    } else {
      const b = batch as FlatBatch;
      calculatedIngredients = b.baseIngredients.map(ing => ({
        ingredientCode: ing.ingredientCode,
        ingredientName: ing.ingredientName,
        requiredWeightGrams: Math.round(currTotalFlour * (ing.bakersPercent / 100) * 100) / 100
      }));
    }`;

if(content.includes(t2)) {
  content = content.replace(t2, r1);
  console.log("toggleIngredientCheck patched");
} else console.log("toggleIngredientCheck target not found");

fs.writeFileSync(path, content, 'utf8');
