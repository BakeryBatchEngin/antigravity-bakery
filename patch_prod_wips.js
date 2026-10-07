const fs = require('fs');
const routePath = 'src/app/api/production/route.ts';
let c = fs.readFileSync(routePath, 'utf8');

// 1. Add let savedFlatWipBatches = [];
const letSearch = `    let savedFlatBatches: any[] = [];
    let savedFlatProductBatches: any[] = [];`;
const letReplace = `    let savedFlatBatches: any[] = [];
    let savedFlatWipBatches: any[] = [];
    let savedFlatProductBatches: any[] = [];`;
if (c.includes(letSearch)) {
  c = c.replace(letSearch, letReplace);
}

// 2. Add parsed.flatWipBatches
const parseSearch = `        savedFlatBatches = parsed.flatBatches || [];
        savedFlatProductBatches = parsed.flatProductBatches || [];`;
const parseReplace = `        savedFlatBatches = parsed.flatBatches || [];
        savedFlatWipBatches = parsed.flatWipBatches || [];
        savedFlatProductBatches = parsed.flatProductBatches || [];`;
if (c.includes(parseSearch)) {
  c = c.replace(parseSearch, parseReplace);
}

// 3. Return savedFlatWipBatches
const returnSearch = `      savedFlatBatches: savedFlatBatches,
      savedFlatProductBatches: savedFlatProductBatches,`;
const returnReplace = `      savedFlatBatches: savedFlatBatches,
      savedFlatWipBatches: savedFlatWipBatches,
      savedFlatProductBatches: savedFlatProductBatches,`;
if (c.includes(returnSearch)) {
  c = c.replace(returnSearch, returnReplace);
}

fs.writeFileSync(routePath, c);
console.log('Successfully patched api/production/route.ts for savedFlatWipBatches');
