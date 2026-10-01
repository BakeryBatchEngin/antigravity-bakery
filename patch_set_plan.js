const fs = require('fs');

const pageTsxPath = 'src/app/production/page.tsx';
let c = fs.readFileSync(pageTsxPath, 'utf8');

c = c.replace(
  `        body: JSON.stringify({
          date: targetDate,
          flatBatches: flatBatches,
          flatProductBatches: flatProductBatches
        })`,
  `        body: JSON.stringify({
          date: targetDate,
          flatBatches: flatBatches,
          flatWipBatches: flatWipBatches,
          flatProductBatches: flatProductBatches
        })`
);

fs.writeFileSync(pageTsxPath, c);
console.log('Successfully patched handleSetPlan for flatWipBatches');
