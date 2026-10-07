const fs = require('fs');
const file = 'src/app/production/page.tsx';
let c = fs.readFileSync(file, 'utf8');

const p1 = `{isExecuted && (
                          <div className="absolute inset-0 bg-white/40 dark:bg-slate-900/40 pointer-events-none z-10" />
                        )}`;

const p2 = `{isExecuted && (\r\n                          <div className="absolute inset-0 bg-white/40 dark:bg-slate-900/40 pointer-events-none z-10" />\r\n                        )}`;

const n = `{isExecuted && (
                          <>
                            <div className="absolute inset-0 bg-white/40 dark:bg-slate-900/40 pointer-events-none z-10" />
                            <div className="absolute top-0 right-0 bg-white text-slate-900 border border-slate-300 font-bold text-[10px] px-2 py-0.5 rounded-bl-lg shadow-sm z-20 dark:bg-slate-800 dark:text-white dark:border-slate-600">
                              計量済
                            </div>
                          </>
                        )}`;

if (c.includes(p1)) {
  c = c.replace(p1, n);
  fs.writeFileSync(file, c);
  console.log('Replaced p1');
} else if (c.includes(p2)) {
  c = c.replace(p2, n);
  fs.writeFileSync(file, c);
  console.log('Replaced p2');
} else {
  console.log('Not found');
}
