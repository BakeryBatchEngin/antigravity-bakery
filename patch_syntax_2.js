const fs = require('fs');
const file = 'src/app/production/page.tsx';
let c = fs.readFileSync(file, 'utf8');

c = c.replace(/body: JSON\.stringify\(\{\\n          date: targetDate,\\n          flatBatches: flatBatches,\\n          flatWipBatches: flatWipBatches,\\n          flatProductBatches: flatProductBatches\\n        \}\)/, 
`body: JSON.stringify({
          date: targetDate,
          flatBatches: flatBatches,
          flatWipBatches: flatWipBatches,
          flatProductBatches: flatProductBatches
        })`);

fs.writeFileSync(file, c);
console.log('Fixed syntax using template literal.');
