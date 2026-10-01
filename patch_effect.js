const fs = require('fs');
const path = 'src/app/production/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const targetStr = `        setFlatBatches(initialDoughBatches);

        const initialProductBatches: FlatProductBatch[] = [];`;

const replaceStr = `        setFlatBatches(initialDoughBatches);

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

        const initialProductBatches: FlatProductBatch[] = [];`;

content = content.replace(targetStr, replaceStr);
fs.writeFileSync(path, content, 'utf8');
console.log("Patched useEffect");
