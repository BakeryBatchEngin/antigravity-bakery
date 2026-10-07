const fs = require('fs');
const file = 'src/app/api/production/export/route.ts';
let c = fs.readFileSync(file, 'utf8');

c = c.replace(
  "const flatBatches = planData.flatBatches || [];\r\n    const flatProductBatches = planData.flatProductBatches || [];",
  "const flatBatches = planData.flatBatches || [];\r\n    const flatWipBatches = planData.flatWipBatches || [];\r\n    const flatProductBatches = planData.flatProductBatches || [];"
);
c = c.replace(
  "const flatBatches = planData.flatBatches || [];\n    const flatProductBatches = planData.flatProductBatches || [];",
  "const flatBatches = planData.flatBatches || [];\n    const flatWipBatches = planData.flatWipBatches || [];\n    const flatProductBatches = planData.flatProductBatches || [];"
);

fs.writeFileSync(file, c);
console.log('Successfully patched export route parsing');
