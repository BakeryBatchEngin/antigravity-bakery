const fs = require('fs');
const path = 'src/app/production/page.tsx';
let c = fs.readFileSync(path, 'utf8');

const targetStr = `        return normalizeBatches(updatedBatches, mixers);
      });
    }
  };`;

const replaceStr = `        return normalizeBatches(updatedBatches, mixers);
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
          });
          
          return normalizeWipBatches(updatedWips, mixers);
        });
      }
    }
  };`;

c = c.replace(targetStr, replaceStr);
fs.writeFileSync(path, c);
console.log('Injected wip update logic into adjustProductQuantity');
