const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/components/NavigationHeader.tsx');
let content = fs.readFileSync(file, 'utf-8');

// The file has some U+FFFD characters, we can just do a regex replace.
content = content.replace(/<span className="text-xs font-bold text-slate-500 mr-2">.*?<\/span>/, '<span className="text-xs font-bold text-slate-500 mr-2">📍 店舗:</span>');

fs.writeFileSync(file, content, 'utf-8');
console.log('Fixed Store label.');
