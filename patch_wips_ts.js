const fs = require('fs');
const path = 'src/app/api/admin/wips/route.ts';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(/catch \(error\)/g, "catch (error: any)");

fs.writeFileSync(path, c);
console.log('Fixed typescript error in wips route');
