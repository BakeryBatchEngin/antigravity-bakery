const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

function normalizeCode(str) {
  if (!str) return str;
  return String(str).replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).toUpperCase().trim();
}

async function main() {
  const dbPath = path.join(process.cwd(), 'bakery.sqlite');
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  
  console.log('Normalizing product_doughs...');
  const pdRows = await db.all("SELECT rowid, dough_code, product_code FROM product_doughs");
  for (let r of pdRows) {
     const pdCode = normalizeCode(r.product_code);
     const dCode = normalizeCode(r.dough_code);
     if (pdCode !== r.product_code || dCode !== r.dough_code) {
         await db.run("UPDATE product_doughs SET product_code = ?, dough_code = ? WHERE rowid = ?", [pdCode, dCode, r.rowid]);
         console.log(`Fixed product_doughs rowid ${r.rowid}`);
     }
  }

  console.log('Normalizing doughs...');
  const dRows = await db.all("SELECT rowid, dough_id, ingredient_code FROM doughs");
  for (let r of dRows) {
     const dCode = normalizeCode(r.dough_id);
     const iCode = normalizeCode(r.ingredient_code);
     if (dCode !== r.dough_id || iCode !== r.ingredient_code) {
         await db.run("UPDATE doughs SET dough_id = ?, ingredient_code = ? WHERE rowid = ?", [dCode, iCode, r.rowid]);
         console.log(`Fixed doughs rowid ${r.rowid}: ${r.dough_id} -> ${dCode}`);
     }
  }

  console.log('Normalizing product_ingredients...');
  const piRows = await db.all("SELECT rowid, product_code, ingredient_code FROM product_ingredients");
  for (let r of piRows) {
     const pCode = normalizeCode(r.product_code);
     const iCode = normalizeCode(r.ingredient_code);
     if (pCode !== r.product_code || iCode !== r.ingredient_code) {
         await db.run("UPDATE product_ingredients SET product_code = ?, ingredient_code = ? WHERE rowid = ?", [pCode, iCode, r.rowid]);
     }
  }

  console.log('Normalizing orders...');
  const oRows = await db.all("SELECT id, product_code FROM orders");
  for (let r of oRows) {
     const pCode = normalizeCode(r.product_code);
     if (pCode !== r.product_code) {
         await db.run("UPDATE orders SET product_code = ? WHERE id = ?", [pCode, r.id]);
     }
  }
  
  console.log('All master data codes have been normalized to half-width characters.');
}

main().catch(console.error);
