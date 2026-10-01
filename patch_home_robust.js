const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/app/page.tsx');
let content = fs.readFileSync(file, 'utf-8');
const lines = content.split(/\r?\n/);

const index = lines.findIndex(line => line.includes('href="/admin/products"'));

if (index !== -1 && !content.includes('href="/admin/wips"')) {
  const wipsButton = [
    '            <Link ',
    '              href="/admin/wips" ',
    '              className="flex flex-col items-center justify-center p-10 bg-amber-50 dark:bg-amber-900/20 rounded-2xl shadow-lg border-2 border-amber-200 dark:border-amber-800 hover:border-amber-500 transition-all group"',
    '            >',
    '              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">🍯</span>',
    '              <h3 className="text-2xl font-bold text-amber-900 dark:text-amber-100">WIP Master</h3>',
    '              <p className="text-amber-700 dark:text-amber-300 mt-2 text-center text-lg">仕掛品マスタ管理</p>',
    '            </Link>'
  ];
  
  lines.splice(index - 1, 0, ...wipsButton, '');
  
  const modifiedContent = lines.join('\n').replace('grid-cols-1 xl:grid-cols-3 md:grid-cols-2', 'grid-cols-1 xl:grid-cols-4 md:grid-cols-2');
  fs.writeFileSync(file, modifiedContent, 'utf-8');
  console.log('Successfully injected into page.tsx');
} else {
  console.log('Failed to find products link or wips already exists');
}
