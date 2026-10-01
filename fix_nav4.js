const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/components/NavigationHeader.tsx');
let content = fs.readFileSync(file, 'utf-8');

// The file might contain U+FFFD.
// We can use a regex to match the Master Menu section and replace it.
// The structure is:
// <span className="font-bold text-slate-500 flex-shrink-0 mr-2">Master Menu:</span>
// <Link href="/admin/ingredients" ... >...</Link>
// <Link href="/admin/doughs" ... >...</Link>
// <Link href="/admin/wips" ... >...</Link>
// <Link href="/admin/products" ... >...</Link>

const targetRegex = /<span className="font-bold text-slate-500 flex-shrink-0 mr-2">Master Menu:<\/span>[\s\S]*?<\/div>/;

const replacement = `<span className="font-bold text-slate-500 flex-shrink-0 mr-2">Master Menu:</span>
              <Link href="/admin/ingredients" className={\`font-bold flex-shrink-0 \${pathname === '/admin/ingredients' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}\`}>🍳 材料マスタ</Link>
              <Link href="/admin/doughs" className={\`font-bold flex-shrink-0 \${pathname === '/admin/doughs' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}\`}>🥣 生地マスタ</Link>
              <Link href="/admin/wips" className={\`font-bold flex-shrink-0 \${pathname === '/admin/wips' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}\`}>🍯 仕掛品マスタ</Link>
              <Link href="/admin/products" className={\`font-bold flex-shrink-0 \${pathname === '/admin/products' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}\`}>🥁 商品マスタ</Link>
            </>
          )}
          
          {role === 'admin' && (
            <>
              <span className="font-bold text-slate-500 flex-shrink-0 mr-2">Admin Menu:</span>
              <Link href="/admin/users" className={\`font-bold flex-shrink-0 \${pathname === '/admin/users' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}\`}>👥 ユーザー管理</Link>
              <Link href="/admin/stores" className={\`font-bold flex-shrink-0 \${pathname === '/admin/stores' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}\`}>🏪 店舗・設備管理</Link>
            </>
          )}
        </div>`;

content = content.replace(targetRegex, replacement);

fs.writeFileSync(file, content, 'utf-8');
console.log('Fixed NavigationHeader.');
