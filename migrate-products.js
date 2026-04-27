const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  try {
    console.log('Creating products table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        product_code TEXT PRIMARY KEY,
        product_name TEXT NOT NULL,
        retail_price INTEGER DEFAULT 0,
        wholesale_price INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Inserting existing products...');
    await pool.query(`
      INSERT INTO products (product_code, product_name)
      SELECT DISTINCT product_code, product_name FROM product_doughs
      ON CONFLICT (product_code) DO NOTHING;
    `);

    await pool.query(`
      INSERT INTO products (product_code, product_name)
      SELECT DISTINCT product_code, product_name FROM product_ingredients
      ON CONFLICT (product_code) DO NOTHING;
    `);

    console.log('Migration successful!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    pool.end();
  }
}

run();
