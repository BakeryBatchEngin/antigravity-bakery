require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sub_doughs (
        dough_id VARCHAR(50) PRIMARY KEY,
        dough_name VARCHAR(100) NOT NULL,
        base_dough_id VARCHAR(50) NOT NULL,
        base_dough_name VARCHAR(100) NOT NULL,
        base_dough_amount REAL NOT NULL,
        tenant_id INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sub_dough_ingredients (
        dough_id VARCHAR(50) NOT NULL,
        ingredient_code VARCHAR(50) NOT NULL,
        ingredient_name VARCHAR(100),
        ingredient_amount REAL NOT NULL,
        tenant_id INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (dough_id, ingredient_code)
      );
    `);
    console.log("Migration successful on Production");
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
migrate();
