const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function main() {
  const dbPath = path.join(process.cwd(), 'bakery.sqlite');
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  
  const pd = await db.all("SELECT * FROM product_doughs WHERE dough_name LIKE '%ヴィエノワ%' OR product_name LIKE '%ヴィエノワ%'");
  console.log('product_doughs:', pd);
  
  const doughs = await db.all("SELECT DISTINCT dough_id, dough_name FROM doughs");
  console.log('All doughs in DB:', doughs.filter(d => d.dough_name.includes('ヴィエノワ') || String(d.dough_id).includes('V')));
}
main().catch(console.error);
