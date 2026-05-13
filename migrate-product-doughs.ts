import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const { getDb } = require('./src/lib/db'); // PostgreSQL connection

async function migrate() {
  console.log('Starting migration for product_doughs...');
  
  // 1. SQLiteを開く
  const dbPath = path.join(process.cwd(), 'bakery.sqlite');
  const sqliteDb = await open({ filename: dbPath, driver: sqlite3.Database });
  
  // 2. PostgreSQLを開く
  const pgDb = await getDb();
  
  // 3. SQLiteから product_doughs を取得
  const productDoughs = await sqliteDb.all('SELECT * FROM product_doughs');
  console.log(`Found ${productDoughs.length} product_doughs in SQLite.`);
  
  // 4. PostgreSQLにインサート
  let count = 0;
  for (const row of productDoughs) {
    try {
      await pgDb.run(
        `INSERT INTO product_doughs (product_code, product_name, dough_code, dough_name, dough_amount) 
         VALUES ($1, $2, $3, $4, $5) 
         ON CONFLICT (product_code, dough_code) DO NOTHING`,
        [row.product_code, row.product_name, row.dough_code, row.dough_name, row.dough_amount]
      );
      count++;
    } catch (e) {
      console.error('Error inserting row:', row, e);
    }
  }
  
  console.log(`Successfully migrated ${count} product_doughs to PostgreSQL.`);
  
  // order_breakdowns が消えている可能性もあるので、SQLiteから orders も移行できればするが、
  // ユーザーが再インポートしているかもしれないので今回は product_doughs と product_ingredients のみ。

  console.log('Starting migration for product_ingredients...');
  const productIngredients = await sqliteDb.all('SELECT * FROM product_ingredients');
  console.log(`Found ${productIngredients.length} product_ingredients in SQLite.`);
  
  let iCount = 0;
  for (const row of productIngredients) {
    try {
      await pgDb.run(
        `INSERT INTO product_ingredients (product_code, product_name, ingredient_code, ingredient_name, ingredient_amount) 
         VALUES ($1, $2, $3, $4, $5) 
         ON CONFLICT (product_code, ingredient_code) DO NOTHING`,
        [row.product_code, row.product_name, row.ingredient_code, row.ingredient_name, row.ingredient_amount]
      );
      iCount++;
    } catch (e) {
      console.error('Error inserting row:', row, e);
    }
  }
  console.log(`Successfully migrated ${iCount} product_ingredients to PostgreSQL.`);

  process.exit(0);
}

migrate().catch(console.error);
