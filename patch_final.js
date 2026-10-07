const fs = require('fs');

const routePath = 'src/app/api/production/route.ts';
let c = fs.readFileSync(routePath, 'utf8');

c = c.replace(/let savedFlatBatches: any\[\] = \[\];\r?\n\s*let savedFlatProductBatches: any\[\] = \[\];/, 
  'let savedFlatBatches: any[] = [];\n    let savedFlatWipBatches: any[] = [];\n    let savedFlatProductBatches: any[] = [];');

c = c.replace(/savedFlatBatches = parsed\.flatBatches \|\| \[\];\r?\n\s*savedFlatProductBatches = parsed\.flatProductBatches \|\| \[\];/,
  'savedFlatBatches = parsed.flatBatches || [];\n        savedFlatWipBatches = parsed.flatWipBatches || [];\n        savedFlatProductBatches = parsed.flatProductBatches || [];');

c = c.replace(/savedFlatBatches: savedFlatBatches,\r?\n\s*savedFlatProductBatches: savedFlatProductBatches,/,
  'savedFlatBatches: savedFlatBatches,\n      savedFlatWipBatches: savedFlatWipBatches,\n      savedFlatProductBatches: savedFlatProductBatches,');

fs.writeFileSync(routePath, c);

const pagePath = 'src/app/production/page.tsx';
let p = fs.readFileSync(pagePath, 'utf8');

p = p.replace(/setFlatProductBatches\(sortedSavedProducts\);\r?\n\s*let firstBatchId = data\.savedFlatBatches\[0\]\?\.id \|\| sortedSavedProducts\[0\]\?\.id \|\| null;\r?\n\s*setSelectedBatchId\(firstBatchId\);/g,
  `setFlatProductBatches(sortedSavedProducts);
          
          const sortedSavedWips = data.savedFlatWipBatches || [];
          sortedSavedWips.sort((a: any, b: any) => {
            if (a.isAdditional !== b.isAdditional) return a.isAdditional ? 1 : -1;
            const wipCmp = a.wipCode.localeCompare(b.wipCode, 'en');
            if (wipCmp !== 0) return wipCmp;
            return a.batchNumber - b.batchNumber;
          });
          setFlatWipBatches(sortedSavedWips);
          
          let firstBatchId = data.savedFlatBatches[0]?.id || sortedSavedProducts[0]?.id || sortedSavedWips[0]?.id || null;
          setSelectedBatchId(firstBatchId);`);

p = p.replace(/data\.savedFlatProductBatches\?\.forEach\(b => \{\r?\n\s*if \(execIds\.includes\(b\.id\)\) \{\r?\n\s*initialChecks\[b\.id\] = \{\};\r?\n\s*b\.baseIngredients\.forEach\(i => initialChecks\[b\.id\]\[i\.ingredientCode\] = true\);\r?\n\s*\}\r?\n\s*\}\);\r?\n\s*setCheckedIngredients\(initialChecks\);/g,
  `data.savedFlatProductBatches?.forEach(b => {
             if (execIds.includes(b.id)) {
               initialChecks[b.id] = {};
               b.baseIngredients.forEach((i: any) => initialChecks[b.id][i.ingredientCode] = true);
             }
          });
          data.savedFlatWipBatches?.forEach((b: any) => {
             if (execIds.includes(b.id)) {
               initialChecks[b.id] = {};
               b.baseIngredients.forEach((i: any) => initialChecks[b.id][i.ingredientCode] = true);
             }
          });
          setCheckedIngredients(initialChecks);`);

fs.writeFileSync(pagePath, p);
console.log('Successfully patched route.ts and page.tsx with regex!');
