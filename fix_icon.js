const fs = require('fs');
const path = 'src/app/production/page.tsx';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(/<MixerIcon[\s\S]*?\/>/, '<span className="text-xl">🍯</span>');

fs.writeFileSync(path, c);
console.log("Fixed MixerIcon");
