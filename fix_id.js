const fs = require('fs');
const path = 'src/app/production/page.tsx';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(/interface FlatProductBatch \{\r?\n\s*type: 'product';/, "interface FlatProductBatch {\n  id: string;\n  type: 'product';");

fs.writeFileSync(path, c);
console.log("Fixed id");
