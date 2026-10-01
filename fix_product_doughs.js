require('dotenv').config({path: '.env.local'});
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function fix() {
  try {
    // Add tenant_id to product_doughs
    await pool.query(`ALTER TABLE product_doughs ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL`);
    
    // Also drop the old primary key and recreate it to include tenant_id if it doesn't already
    try {
      await pool.query(`ALTER TABLE product_doughs DROP CONSTRAINT IF EXISTS product_doughs_pkey`);
      await pool.query(`ALTER TABLE product_doughs ADD PRIMARY KEY (product_code, dough_code, tenant_id)`);
    } catch (pkErr) {
      console.log('Could not update primary key (maybe it contains nulls?):', pkErr.message);
    }
    
    // Also check product_ingredients primary key
    try {
      await pool.query(`ALTER TABLE product_ingredients DROP CONSTRAINT IF EXISTS product_ingredients_pkey`);
      await pool.query(`ALTER TABLE product_ingredients ADD PRIMARY KEY (product_code, ingredient_code, tenant_id)`);
    } catch (pkErr) {
      console.log('Could not update PI primary key:', pkErr.message);
    }

    console.log("Fixed product_doughs table.");
  } catch (err) {
    console.error("Error fixing table:", err);
  } finally {
    pool.end();
  }
}

fix();
