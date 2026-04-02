const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const xlsx = require('xlsx');
const path = require('path');

// Excel内の全角英数字を半角に変換する関数
function normalizeCode(str) {
  if (!str) return '';
  return String(str).replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).toUpperCase().trim();
}

async function main() {
  const dbPath = path.join(process.cwd(), 'bakery.sqlite');
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  const dir = path.join(__dirname, 'test_sample_bakery_data');

  console.log('--- 1. Importing Ingredients (原材料) ---');
  let wb = xlsx.readFile(path.join(dir, 'Ingredient_DB.csv'), { codepage: 932 });
  let data = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  let count = 0;
  for (const row of data) {
    if (!row.ingredient_code) continue;
    await db.run(
      `INSERT OR REPLACE INTO ingredients (ingredient_code, ingredient_name, purchase_weight, purchase_price) VALUES (?, ?, ?, ?)`,
      [normalizeCode(row.ingredient_code), row.ingredient_name || '', row.purchase_weight || 0, row.purchase_price || 0]
    );
    count++;
  }
  console.log(`Imported ${count} ingredients.`);

  console.log('--- 2. Importing Dough Recipes (生地レシピ) ---');
  wb = xlsx.readFile(path.join(dir, 'Dough_table.xlsx'));
  data = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  count = 0;
  for (const row of data) {
    if (!row.Dough_id || !row.Ingredient_code) continue;
    const bakersPercent = row["Baker's_pecent"] || 0;
    await db.run(
      `INSERT OR REPLACE INTO doughs (dough_id, dough_name, ingredient_code, ingredient_name, bakers_percent) VALUES (?, ?, ?, ?, ?)`,
      [normalizeCode(row.Dough_id), row.Dough_name || '', normalizeCode(row.Ingredient_code), row.Ingredient_name || '', bakersPercent]
    );
    count++;
  }
  console.log(`Imported ${count} dough components.`);

  console.log('--- 3. Importing Product Doughs (製品ごとの生地使用量) ---');
  wb = xlsx.readFile(path.join(dir, 'Product_dough table.xlsx'));
  data = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  count = 0;
  for (const row of data) {
    if (!row.product_code || !row.dough_code) continue;
    const amount = row.dough_amaunt || 0;
    await db.run(
      `INSERT OR REPLACE INTO product_doughs (product_code, product_name, dough_code, dough_name, dough_amount) VALUES (?, ?, ?, ?, ?)`,
      [normalizeCode(row.product_code), row.product_name || '', normalizeCode(row.dough_code), row.dough_name || '', amount]
    );
    count++;
  }
  console.log(`Imported ${count} product doughs.`);

  console.log('--- 4. Importing Product Ingredients (製品ごとの副材料) ---');
  wb = xlsx.readFile(path.join(dir, 'Product_Ingredients table.xlsx'));
  data = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  count = 0;
  for (const row of data) {
    if (!row.product_code || !row.ingredient_code) continue;
    await db.run(
      `INSERT OR REPLACE INTO product_ingredients (product_code, product_name, ingredient_code, ingredient_name, ingredient_amount) VALUES (?, ?, ?, ?, ?)`,
      [normalizeCode(row.product_code), row.product_name || '', normalizeCode(row.ingredient_code), row.ingredient_name || '', row.ingredient_amount || 0]
    );
    count++;
  }
  console.log(`Imported ${count} product ingredients.`);

  console.log('\nFinished importing ALL master data successfully!');
}

main().catch(console.error);
