const fs = require('fs');
const path = 'src/app/production/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const targetRegex = /    let batch: FlatBatch \| FlatProductBatch \| undefined = flatBatches\.find\(b => b\.id === batchId\);[\s\S]*?    if \(!batch\) return;[\s\S]*?      \}\)\);\r?\n\s*\}/g;

const replacement = `    let batch: FlatBatch | FlatProductBatch | FlatWipBatch | undefined = flatBatches.find(b => b.id === batchId);
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

content = content.replace(targetRegex, replacement);
fs.writeFileSync(path, content, 'utf8');
console.log("Replaced using Regex.");
