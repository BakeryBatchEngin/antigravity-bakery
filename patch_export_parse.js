const fs = require('fs');
const routePath = 'src/app/api/production/export/route.ts';
let c = fs.readFileSync(routePath, 'utf8');

const parseSearch = `    const flatBatches = planData.flatBatches || [];
    const flatProductBatches = planData.flatProductBatches || [];`;
const parseReplace = `    const flatBatches = planData.flatBatches || [];
    const flatWipBatches = planData.flatWipBatches || [];
    const flatProductBatches = planData.flatProductBatches || [];`;
c = c.replace(parseSearch, parseReplace);

fs.writeFileSync(routePath, c);
console.log('Successfully patched parsing in export route');
