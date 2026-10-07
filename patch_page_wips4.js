const fs = require('fs');
const pagePath = 'src/app/production/page.tsx';
let c = fs.readFileSync(pagePath, 'utf8');

// 1. handleAllDone
const allDoneSearch = "    // 商品バッチの計算\n    flatProductBatches.forEach(batch => {";
const allDoneSearch2 = "    // 商品バッチの計算\r\n    flatProductBatches.forEach(batch => {";

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

if (c.includes(allDoneSearch)) {
  c = c.replace(allDoneSearch, allDoneReplace);
} else if (c.includes(allDoneSearch2)) {
  c = c.replace(allDoneSearch2, allDoneReplace);
}

// 2. handleAddBatchSubmit
const addSearch1 = "        if (res.ok && data.success) {\n          updatedDoughs = [...updatedDoughs, ...(data.additionalDoughBatches || [])];\n          updatedProducts = [...updatedProducts, ...(data.additionalProductBatches || [])];\n        } else {";
const addSearch2 = "        if (res.ok && data.success) {\r\n          updatedDoughs = [...updatedDoughs, ...(data.additionalDoughBatches || [])];\r\n          updatedProducts = [...updatedProducts, ...(data.additionalProductBatches || [])];\r\n        } else {";

const addReplace = `        if (res.ok && data.success) {
          updatedDoughs = [...updatedDoughs, ...(data.additionalDoughBatches || [])];
          updatedProducts = [...updatedProducts, ...(data.additionalProductBatches || [])];
          updatedWips = [...updatedWips, ...(data.additionalWipBatches || [])];
        } else {`;

if (c.includes(addSearch1)) {
  c = c.replace(addSearch1, addReplace);
} else if (c.includes(addSearch2)) {
  c = c.replace(addSearch2, addReplace);
}

// 2b. handleAddBatchSubmit initial variable
const v1 = "    try {\n      let updatedDoughs = [...flatBatches];\n      let updatedProducts = [...flatProductBatches];\n      \n      for (const item of validItems) {";
const v2 = "    try {\r\n      let updatedDoughs = [...flatBatches];\r\n      let updatedProducts = [...flatProductBatches];\r\n      \r\n      for (const item of validItems) {";

const vReplace = `    try {
      let updatedDoughs = [...flatBatches];
      let updatedProducts = [...flatProductBatches];
      let updatedWips = [...flatWipBatches];
      
      for (const item of validItems) {`;

if (c.includes(v1)) {
  c = c.replace(v1, vReplace);
} else if (c.includes(v2)) {
  c = c.replace(v2, vReplace);
}

// 2c. handleAddBatchSubmit auto save
const s1 = "      setFlatBatches(updatedDoughs);\n      setFlatProductBatches(updatedProducts);\n      setAddModal(prev => ({ ...prev, isOpen: false, isLoading: false }));\n      \n      if (isPlanSet) {\n        await fetch('/api/production/plan', {\n          method: 'POST',\n          headers: { 'Content-Type': 'application/json' },\n          body: JSON.stringify({\n            date: targetDate,\n            flatBatches: updatedDoughs,\n            flatProductBatches: updatedProducts\n          })\n        });\n      }";
const s2 = "      setFlatBatches(updatedDoughs);\r\n      setFlatProductBatches(updatedProducts);\r\n      setAddModal(prev => ({ ...prev, isOpen: false, isLoading: false }));\r\n      \r\n      if (isPlanSet) {\r\n        await fetch('/api/production/plan', {\r\n          method: 'POST',\r\n          headers: { 'Content-Type': 'application/json' },\r\n          body: JSON.stringify({\r\n            date: targetDate,\r\n            flatBatches: updatedDoughs,\r\n            flatProductBatches: updatedProducts\r\n          })\r\n        });\r\n      }";

const sReplace = `      setFlatBatches(updatedDoughs);
      setFlatProductBatches(updatedProducts);
      setFlatWipBatches(updatedWips);
      setAddModal(prev => ({ ...prev, isOpen: false, isLoading: false }));
      
      if (isPlanSet) {
        await fetch('/api/production/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: targetDate,
            flatBatches: updatedDoughs,
            flatWipBatches: updatedWips,
            flatProductBatches: updatedProducts
          })
        });
      }`;

if (c.includes(s1)) {
  c = c.replace(s1, sReplace);
} else if (c.includes(s2)) {
  c = c.replace(s2, sReplace);
}

fs.writeFileSync(pagePath, c);
console.log('Successfully repatched page.tsx');
