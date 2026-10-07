const fs = require('fs');
const file = 'src/app/production/page.tsx';
let c = fs.readFileSync(file, 'utf8');

const p = "                          ${isSelected && !isExecuted ? 'bg-amber-50 dark:bg-amber-900/40 border-y border-r border-amber-300 dark:border-amber-700 shadow-md scale-[1.01]' : (!isExecuted ? 'border-y border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-amber-300 hover:shadow-sm' : '')}";
const n = `                          \${!isExecuted && isAllChecked ? 'opacity-40 grayscale' : ''}
                          \${isSelected && !isExecuted ? 'bg-amber-50 dark:bg-amber-900/40 border-y border-r border-amber-300 dark:border-amber-700 shadow-md scale-[1.01]' : (!isExecuted ? 'border-y border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-amber-300 hover:shadow-sm' : '')}`;

if (c.includes(p)) {
  c = c.replace(p, n);
  fs.writeFileSync(file, c);
  console.log('Replaced');
} else {
  console.log('Not found');
}
