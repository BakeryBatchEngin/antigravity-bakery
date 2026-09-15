require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function init() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sub_doughs (
        dough_id TEXT PRIMARY KEY,
        dough_name TEXT NOT NULL,
        base_dough_id TEXT NOT NULL,
        base_dough_name TEXT NOT NULL,
        base_dough_amount REAL NOT NULL,
        tenant_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sub_dough_ingredients (
        dough_id TEXT NOT NULL,
        ingredient_code TEXT NOT NULL,
        ingredient_name TEXT NOT NULL,
        ingredient_amount REAL NOT NULL,
        tenant_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (dough_id, ingredient_code),
        FOREIGN KEY(ingredient_code) REFERENCES ingredients(ingredient_code)
      );
    `);
    console.log('Tables created successfully');
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
init();
