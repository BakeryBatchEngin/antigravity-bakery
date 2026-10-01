const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/middleware.ts');
let content = fs.readFileSync(file, 'utf-8');

content = content.replace("master: ['/admin/ingredients', '/admin/doughs', '/admin/products',", "master: ['/admin/ingredients', '/admin/doughs', '/admin/wips', '/admin/products',");

fs.writeFileSync(file, content, 'utf-8');
console.log('Fixed middleware roles.');
