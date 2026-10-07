const fs = require('fs');
let c = fs.readFileSync('src/middleware.ts', 'utf8');
c = c.replace(
  "'/api/admin/migrate-wips'",
  "'/api/admin/migrate-wips', '/api/admin/fix-type'"
);
fs.writeFileSync('src/middleware.ts', c);
console.log('Patched middleware.ts');
