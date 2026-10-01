const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/app/page.tsx');
let content = fs.readFileSync(file, 'utf-8');

const target = `<Link 
              href="/admin/products" 
              className="flex flex-col items-center justify-center p-10 bg-amber-50 dark:bg-amber-900/20 rounded-2xl shadow-lg border-2 border-amber-200 dark:border-amber-800 hover:border-amber-500 transition-all group"
            >
              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">🥁</span>
              <h3 className="text-2xl font-bold text-amber-900 dark:text-amber-100">Product Master</h3>
              <p className="text-amber-700 dark:text-amber-300 mt-2 text-center text-lg">商品構成マスタ管理</p>
            </Link>`;

const insert = `<Link 
              href="/admin/wips" 
              className="flex flex-col items-center justify-center p-10 bg-amber-50 dark:bg-amber-900/20 rounded-2xl shadow-lg border-2 border-amber-200 dark:border-amber-800 hover:border-amber-500 transition-all group"
            >
              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">🍯</span>
              <h3 className="text-2xl font-bold text-amber-900 dark:text-amber-100">WIP Master</h3>
              <p className="text-amber-700 dark:text-amber-300 mt-2 text-center text-lg">仕掛品マスタ管理</p>
            </Link>

            `;

if (!content.includes('href="/admin/wips"')) {
  // Replace the grid cols from 3 to 4 so it fits better, or just leave it as grid-cols-1 md:grid-cols-2 xl:grid-cols-4
  content = content.replace('grid-cols-1 xl:grid-cols-3 md:grid-cols-2', 'grid-cols-1 xl:grid-cols-4 md:grid-cols-2');
  
  content = content.replace(target, insert + target);
  fs.writeFileSync(file, content, 'utf-8');
  console.log('Patched page.tsx successfully');
}
