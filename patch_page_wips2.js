const fs = require('fs');

const pagePath = 'src/app/production/page.tsx';
let c = fs.readFileSync(pagePath, 'utf8');

// 1. handleAllDone
const allDoneSearch = `    // 商品バッチの計算
    flatProductBatches.forEach(batch => {`;

const allDoneReplace = `    // 仕掛品バッチの計算
    flatWipBatches.forEach(batch => {
      const safeOriginalWeight = batch.originalTotalWeightGrams || 1;
      const unCheckedIngredients = batch.baseIngredients.filter(ing => !checkedIngredients[batch.id]?.[ing.ingredientCode]);

      if (unCheckedIngredients.length > 0) {
        const ingredients = unCheckedIngredients.map(ing => ({
          ingredientCode: ing.ingredientCode,
          ingredientName: ing.ingredientName,
          requiredWeightGrams: Math.round((ing.requiredWeightGrams / safeOriginalWeight) * batch.currentTotalWeightGrams * 100) / 100
        }));
        exportBatches.push({ batchId: batch.id, ingredients });
      } else if (batch.baseIngredients.length === 0 && !checkedIngredients[batch.id]?.['__NO_INGREDIENTS__']) {
        exportBatches.push({ batchId: batch.id, ingredients: [] });
      }

      newExecutedIds.push(batch.id);

      const checks: Record<string, boolean> = { ...(newCheckedState[batch.id] || {}) };
      if (batch.baseIngredients.length > 0) {
        batch.baseIngredients.forEach(ing => { checks[ing.ingredientCode] = true; });
      } else {
        checks['__NO_INGREDIENTS__'] = true;
      }
      newCheckedState[batch.id] = checks;
    });

    // 商品バッチの計算
    flatProductBatches.forEach(batch => {`;

c = c.replace(allDoneSearch, allDoneReplace);

// 2. handleAddBatchSubmit
const addBatchSearch = `        if (res.ok && data.success) {
          updatedDoughs = [...updatedDoughs, ...(data.additionalDoughBatches || [])];
          updatedProducts = [...updatedProducts, ...(data.additionalProductBatches || [])];
        } else {`;

const addBatchReplace = `        if (res.ok && data.success) {
          updatedDoughs = [...updatedDoughs, ...(data.additionalDoughBatches || [])];
          updatedProducts = [...updatedProducts, ...(data.additionalProductBatches || [])];
          setFlatWipBatches(prev => [...prev, ...(data.additionalWipBatches || [])]);
        } else {`;

c = c.replace(addBatchSearch, addBatchReplace);

// 3. fetch excel export in page.tsx
const excelSearch = `      const res = await fetch('/api/production/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: targetDate,
          flatBatches: flatBatches,
          flatProductBatches: flatProductBatches
        })
      });`;

const excelReplace = `      const res = await fetch('/api/production/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: targetDate,
          flatBatches: flatBatches,
          flatWipBatches: flatWipBatches,
          flatProductBatches: flatProductBatches
        })
      });`;

c = c.replace(excelSearch, excelReplace);

fs.writeFileSync(pagePath, c);
console.log('Successfully patched page.tsx for All Done and Additional Batch WIPs');
