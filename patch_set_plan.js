const fs = require('fs');
const path = 'src/app/production/page.tsx';
let c = fs.readFileSync(path, 'utf8');

const targetStr = `        body: JSON.stringify({
          date: targetDate,
          flatBatches: flatBatches,
          flatProductBatches: flatProductBatches
        })
      });`;

const replaceStr = `        body: JSON.stringify({
          date: targetDate,
          flatBatches: flatBatches,
          flatWipBatches: flatWipBatches,
          flatProductBatches: flatProductBatches
        })
      });`;

c = c.replace(targetStr, replaceStr);
fs.writeFileSync(path, c);
console.log('Patched handleSetPlan to include flatWipBatches');
