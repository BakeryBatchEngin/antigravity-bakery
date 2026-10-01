const fs = require('fs');
const path = 'src/app/production/page.tsx';
let c = fs.readFileSync(path, 'utf8');

const idx = c.indexOf('  // 副材料仕込みの個数を1個単位で増減させるロジック\n  const adjustProductQuantity =');

const patch = `const normalizeWipBatches = (batches: FlatWipBatch[], mixers: MixerCapacity[]): FlatWipBatch[] => {
  if (batches.length === 0) return [];
  let current = [...batches];
  const baseBatch = current[0];
  
  while (current.length > 0) {
    const lastIdx = current.length - 1;
    if (current[lastIdx].currentTotalWeightGrams <= 0) {
      const excess = current[lastIdx].currentTotalWeightGrams;
      current.pop();
      if (excess < 0 && current.length > 0) {
        current[current.length - 1].currentTotalWeightGrams += excess;
      }
    } else {
      break;
    }
  }
  
  for (let i = 0; i < current.length; i++) {
    const mixerId = current[i].selectedMixerId;
    const mixer = mixers.find(m => m.id === mixerId) || mixers[0];
    const maxCapacityKg = Math.max(1, mixer ? mixer.max_capacity_kg : 50);
    const maxWeightGrams = maxCapacityKg * 1000;

    if (current[i].currentTotalWeightGrams > maxWeightGrams + 0.1) {
      const excess = current[i].currentTotalWeightGrams - maxWeightGrams;
      current[i].currentTotalWeightGrams = maxWeightGrams;
      if (i + 1 < current.length) {
        current[i + 1].currentTotalWeightGrams += excess;
      } else {
        const nextBatchNum = current[i].batchNumber + 1;
        current.push({
          ...baseBatch,
          id: \`WIP-\${baseBatch.wipCode}-\${nextBatchNum}\`,
          batchNumber: nextBatchNum,
          originalTotalWeightGrams: 0,
          currentTotalWeightGrams: excess,
          selectedMixerId: current[i].selectedMixerId
        });
      }
    }
  }
  return current;
};

  `;

c = c.slice(0, idx) + patch + c.slice(idx);
fs.writeFileSync(path, c);
console.log('Injected normalizeWipBatches');
