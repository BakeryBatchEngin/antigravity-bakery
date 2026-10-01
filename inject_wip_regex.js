const fs = require('fs');
const path = 'src/app/production/page.tsx';
let c = fs.readFileSync(path, 'utf8');

// The exact string without line endings
const searchPattern = /        \/\/ 順番を保持\r?\n        updatedBatches\.sort\(\(a, b\) => \{\r?\n          const doughCmp = a\.doughCode\.localeCompare\(b\.doughCode, 'en'\);\r?\n          if \(doughCmp !== 0\) return doughCmp;\r?\n          return a\.batchNumber - b\.batchNumber;\r?\n        \}\);\r?\n        \r?\n        return updatedBatches;\r?\n      \}\);\r?\n    \}/;

const replaceStr = `        // 順番を保持
        updatedBatches.sort((a, b) => {
          const doughCmp = a.doughCode.localeCompare(b.doughCode, 'en');
          if (doughCmp !== 0) return doughCmp;
          return a.batchNumber - b.batchNumber;
        });
        
        return updatedBatches;
      });
    }

    // 仕掛品 (WIP) の総量も連動して増減させる
    if (targetBatch.baseIngredients && targetBatch.baseIngredients.length > 0) {
      const wipIngredients = targetBatch.baseIngredients.filter(ing => 
        flatWipBatches.some(w => w.wipCode === ing.ingredientCode)
      );

      if (wipIngredients.length > 0) {
        setFlatWipBatches(prevWipBatches => {
          let updatedWips = [...prevWipBatches];
          
          wipIngredients.forEach(ing => {
            const safeOriginalQty = targetBatch.originalBatchQuantity || 1;
            const amountPerItem = ing.requiredWeightGrams / safeOriginalQty;
            const deltaGrams = amountPerItem * deltaQty;
            
            const wipBatches = updatedWips.filter(b => b.wipCode === ing.ingredientCode).sort((a,b) => a.batchNumber - b.batchNumber);
            if (wipBatches.length === 0) return;
            
            const lastBatchId = wipBatches[wipBatches.length - 1].id;
            const lastBatchIdx = updatedWips.findIndex(b => b.id === lastBatchId);
            if (lastBatchIdx !== -1) {
              updatedWips[lastBatchIdx] = {
                ...updatedWips[lastBatchIdx],
                currentTotalWeightGrams: Math.max(0, updatedWips[lastBatchIdx].currentTotalWeightGrams + deltaGrams)
              };
            }
            
            // この仕掛品の再正規化
            const otherWipBatches = updatedWips.filter(b => b.wipCode !== ing.ingredientCode);
            const targetWipBatches = updatedWips.filter(b => b.wipCode === ing.ingredientCode).sort((a,b) => a.batchNumber - b.batchNumber);
            const normalizedWipBatches = normalizeWipBatches(targetWipBatches, mixers);
            updatedWips = [...otherWipBatches, ...normalizedWipBatches];
          });
          
          updatedWips.sort((a, b) => {
            const wipCmp = a.wipCode.localeCompare(b.wipCode, 'en');
            if (wipCmp !== 0) return wipCmp;
            return a.batchNumber - b.batchNumber;
          });
          
          return updatedWips;
        });
      }
    }`;

if (searchPattern.test(c)) {
  c = c.replace(searchPattern, replaceStr);
  fs.writeFileSync(path, c);
  console.log('Injected WIP logic properly this time!');
} else {
  console.log('Regex did not match!');
}
