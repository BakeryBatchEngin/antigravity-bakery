const fs = require('fs');
const path = 'src/app/production/page.tsx';
let c = fs.readFileSync(path, 'utf8');

const targetStr = `      if (wipIngredients.length > 0) {
        setFlatWipBatches(prevWipBatches => {`;

const replaceStr = `      console.log('adjust WIP:', { targetBatchBaseIngredients: targetBatch.baseIngredients, flatWipBatches: flatWipBatches, wipIngredients });
      if (wipIngredients.length > 0) {
        setFlatWipBatches(prevWipBatches => {`;

c = c.replace(targetStr, replaceStr);
fs.writeFileSync(path, c);
console.log('Added logs');
