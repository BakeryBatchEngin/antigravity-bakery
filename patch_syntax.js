const fs = require('fs');
const file = 'src/app/api/production/route.ts';
let c = fs.readFileSync(file, 'utf8');

c = c.replace(/let savedFlatWipBatches = null;\\n    let savedFlatProductBatches = null;/, 'let savedFlatWipBatches = null;\n    let savedFlatProductBatches = null;');

fs.writeFileSync(file, c);
console.log('Fixed syntax');
