const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/components/NavigationHeader.tsx');
let content = fs.readFileSync(file, 'utf-8');

// The original lines are:
//              <Link href="/admin/ingredients" className={\`font-bold flex-shrink-0 \${pathname === '/admin/ingredients' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}\`}>🍳 材料マスタ</Link>
//              <Link href="/admin/doughs" className={\`font-bold flex-shrink-0 \${pathname === '/admin/doughs' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}\`}>🥣 生地マスタ</Link>
//              <Link href="/admin/wips" className={\`font-bold flex-shrink-0 \${pathname === '/admin/wips' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}\`}>🍯 仕掛品Eスタ</Link>
//              <Link href="/admin/products" className={\`font-bold flex-shrink-0 \${pathname === '/admin/products' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}\`}>🥁E啁Eマスタ</Link>

// We can just replace using regex for the Master Menu links section
content = content.replace(
  /<span className="font-bold text-slate-500 flex-shrink-0 mr-2">Master Menu:<\/span>[\s\S]*?<\/div>/,
  \`<span className="font-bold text-slate-500 flex-shrink-0 mr-2">Master Menu:</span>
              <Link href="/admin/ingredients" className={\\\`font-bold flex-shrink-0 \\\${pathname === '/admin/ingredients' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}\\\`}>🍳 材料マスタ</Link>
              <Link href="/admin/doughs" className={\\\`font-bold flex-shrink-0 \\\${pathname === '/admin/doughs' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}\\\`}>🥣 生地マスタ</Link>
              <Link href="/admin/wips" className={\\\`font-bold flex-shrink-0 \\\${pathname === '/admin/wips' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}\\\`}>🍯 仕掛品マスタ</Link>
              <Link href="/admin/products" className={\\\`font-bold flex-shrink-0 \\\${pathname === '/admin/products' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}\\\`}>🥁 商品マスタ</Link>
            </>
          )}
          
          {role === 'admin' && (
            <>
              <span className="font-bold text-slate-500 flex-shrink-0 mr-2">Admin Menu:</span>
              <Link href="/admin/users" className={\\\`font-bold flex-shrink-0 \\\${pathname === '/admin/users' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}\\\`}>👥 ユーザー管理</Link>
              <Link href="/admin/stores" className={\\\`font-bold flex-shrink-0 \\\${pathname === '/admin/stores' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}\\\`}>🏪 店舗・設備管理</Link>
            </>
          )}
        </div>\`
);

fs.writeFileSync(file, content, 'utf-8');
console.log('Fixed NavigationHeader completely.');
