const fs = require('fs');
const path = 'src/middleware.ts';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(
  "const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/me', '/api/auth/logout', '/api/auth/store', '/favicon.ico', '/presentation'];",
  "const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/me', '/api/auth/logout', '/api/auth/store', '/favicon.ico', '/presentation', '/api/admin/migrate-wips'];"
);

fs.writeFileSync(path, c);
console.log('Patched middleware.ts');
