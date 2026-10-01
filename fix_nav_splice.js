const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/components/NavigationHeader.tsx');
let content = fs.readFileSync(file, 'utf-8');

const lines = content.split('\n');

// Find index of Master Menu:
const index = lines.findIndex(line => line.includes('Master Menu:'));

if (index !== -1) {
  // Replace the next 3 lines (which are the links) with the fixed 4 links
  lines.splice(index + 1, 3,
    "              <Link href=\"/admin/ingredients\" className={`font-bold flex-shrink-0 ${pathname === '/admin/ingredients' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}`}>🍳 材料マスタ</Link>",
    "              <Link href=\"/admin/doughs\" className={`font-bold flex-shrink-0 ${pathname === '/admin/doughs' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}`}>🥣 生地マスタ</Link>",
    "              <Link href=\"/admin/wips\" className={`font-bold flex-shrink-0 ${pathname === '/admin/wips' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}`}>🍯 仕掛品マスタ</Link>",
    "              <Link href=\"/admin/products\" className={`font-bold flex-shrink-0 ${pathname === '/admin/products' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}`}>🥁 商品マスタ</Link>"
  );
}

fs.writeFileSync(file, lines.join('\n'), 'utf-8');
console.log('Fixed NavigationHeader exactly using index splice.');
