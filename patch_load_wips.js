const fs = require('fs');
const pagePath = 'src/app/production/page.tsx';
let c = fs.readFileSync(pagePath, 'utf8');

const search = `          const sortedSavedProducts = data.savedFlatProductBatches || [];
          sortedSavedProducts.sort((a, b) => {
            if (a.isAdditional !== b.isAdditional) return a.isAdditional ? 1 : -1;
            const doughCmp = a.doughCode.localeCompare(b.doughCode, 'en');
            if (doughCmp !== 0) return doughCmp;
            const prodCmp = a.productCode.localeCompare(b.productCode, 'en');
            if (prodCmp !== 0) return prodCmp;
            return a.batchNumber - b.batchNumber;
          });
          setFlatProductBatches(sortedSavedProducts);
          
          let firstBatchId = data.savedFlatBatches[0]?.id || sortedSavedProducts[0]?.id || null;
          setSelectedBatchId(firstBatchId);`;

const replace = `          const sortedSavedProducts = data.savedFlatProductBatches || [];
          sortedSavedProducts.sort((a, b) => {
            if (a.isAdditional !== b.isAdditional) return a.isAdditional ? 1 : -1;
            const doughCmp = a.doughCode.localeCompare(b.doughCode, 'en');
            if (doughCmp !== 0) return doughCmp;
            const prodCmp = a.productCode.localeCompare(b.productCode, 'en');
            if (prodCmp !== 0) return prodCmp;
            return a.batchNumber - b.batchNumber;
          });
          setFlatProductBatches(sortedSavedProducts);
          
          const sortedSavedWips = data.savedFlatWipBatches || [];
          sortedSavedWips.sort((a: any, b: any) => {
            if (a.isAdditional !== b.isAdditional) return a.isAdditional ? 1 : -1;
            const wipCmp = a.wipCode.localeCompare(b.wipCode, 'en');
            if (wipCmp !== 0) return wipCmp;
            return a.batchNumber - b.batchNumber;
          });
          setFlatWipBatches(sortedSavedWips);
          
          let firstBatchId = data.savedFlatBatches[0]?.id || sortedSavedProducts[0]?.id || sortedSavedWips[0]?.id || null;
          setSelectedBatchId(firstBatchId);`;

if(c.includes(search)) {
  c = c.replace(search, replace);
} else {
  // LF
  const search2 = search.replace(/\r\n/g, '\n');
  if(c.includes(search2)) {
    c = c.replace(search2, replace);
  }
}

// 2. Also fix the initialChecks logic for WIPs just below
const searchChecks = `          data.savedFlatBatches.forEach(b => {
             if (execIds.includes(b.id)) {
               initialChecks[b.id] = {};
               b.baseIngredients.forEach(i => initialChecks[b.id][i.ingredientCode] = true);
             }
          });
          data.savedFlatProductBatches?.forEach(b => {
             if (execIds.includes(b.id)) {
               initialChecks[b.id] = {};
               b.baseIngredients.forEach(i => initialChecks[b.id][i.ingredientCode] = true);
             }
          });
          setCheckedIngredients(initialChecks);`;

const replaceChecks = `          data.savedFlatBatches.forEach(b => {
             if (execIds.includes(b.id)) {
               initialChecks[b.id] = {};
               b.baseIngredients.forEach(i => initialChecks[b.id][i.ingredientCode] = true);
             }
          });
          data.savedFlatProductBatches?.forEach(b => {
             if (execIds.includes(b.id)) {
               initialChecks[b.id] = {};
               b.baseIngredients.forEach(i => initialChecks[b.id][i.ingredientCode] = true);
             }
          });
          data.savedFlatWipBatches?.forEach(b => {
             if (execIds.includes(b.id)) {
               initialChecks[b.id] = {};
               b.baseIngredients.forEach(i => initialChecks[b.id][i.ingredientCode] = true);
             }
          });
          setCheckedIngredients(initialChecks);`;

if(c.includes(searchChecks)) {
  c = c.replace(searchChecks, replaceChecks);
} else {
  const searchChecks2 = searchChecks.replace(/\r\n/g, '\n');
  if(c.includes(searchChecks2)) {
    c = c.replace(searchChecks2, replaceChecks);
  }
}

fs.writeFileSync(pagePath, c);
console.log('Successfully patched page.tsx for loading saved WIPs');
