const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function main() {
  const dbPath = path.join(process.cwd(), 'bakery.sqlite');
  
  // データベースファイルを開く
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  console.log('Dropping existing tables if any...');
  await db.exec(`
    DROP TABLE IF EXISTS orders;
    DROP TABLE IF EXISTS product_doughs;
    DROP TABLE IF EXISTS ingredients;
    DROP TABLE IF EXISTS doughs;
    DROP TABLE IF EXISTS product_ingredients;
  `);

  console.log('Creating tables...');

  // 1. 原材料テーブル (Ingredient_DB.csv に対応)
  await db.exec(`
    CREATE TABLE ingredients (
      ingredient_code TEXT PRIMARY KEY,
      ingredient_name TEXT NOT NULL,
      purchase_weight INTEGER,
      purchase_price INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. 生地レシピテーブル (Dough_table.xlsx に対応)
  await db.exec(`
    CREATE TABLE doughs (
      dough_id TEXT NOT NULL,
      dough_name TEXT NOT NULL,
      ingredient_code TEXT NOT NULL,
      ingredient_name TEXT,
      bakers_percent REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (dough_id, ingredient_code),
      FOREIGN KEY(ingredient_code) REFERENCES ingredients(ingredient_code)
    );
  `);

  // 3. 製品の生地使用量テーブル (Product_dough table.xlsx に対応)
  await db.exec(`
    CREATE TABLE product_doughs (
      product_code TEXT NOT NULL,
      product_name TEXT NOT NULL,
      dough_code TEXT NOT NULL,
      dough_name TEXT,
      dough_amount INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (product_code, dough_code)
    );
  `);

  // 4. 製品の副材料使用量テーブル (Product_Ingredients table.xlsx に対応)
  await db.exec(`
    CREATE TABLE product_ingredients (
      product_code TEXT NOT NULL,
      product_name TEXT NOT NULL,
      ingredient_code TEXT NOT NULL,
      ingredient_name TEXT,
      ingredient_amount INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (product_code, ingredient_code),
      FOREIGN KEY(ingredient_code) REFERENCES ingredients(ingredient_code)
    );
  `);

  // 5. 受注テーブル (Sample_Order に対応)
  await db.exec(`
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_date TEXT NOT NULL, -- YYYY-MM-DD
      store_name TEXT NOT NULL,
      delivery_shift TEXT,      -- 1便, 2便, 3便 など
      product_code TEXT,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log('Database (bakery.sqlite) initialized successfully with the new schema!');
}

main().catch(console.error);
