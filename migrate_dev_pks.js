require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function migrateDb(connectionString, name) {
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Drop FKs if they exist
    await client.query(`ALTER TABLE doughs DROP CONSTRAINT IF EXISTS doughs_ingredient_code_fkey`);
    await client.query(`ALTER TABLE product_ingredients DROP CONSTRAINT IF EXISTS product_ingredients_ingredient_code_fkey`);
    await client.query(`ALTER TABLE sub_dough_ingredients DROP CONSTRAINT IF EXISTS sub_dough_ingredients_ingredient_code_fkey`);
    
    // Drop PKs
    await client.query(`ALTER TABLE products DROP CONSTRAINT IF EXISTS products_pkey`);
    await client.query(`ALTER TABLE product_doughs DROP CONSTRAINT IF EXISTS product_doughs_pkey`);
    await client.query(`ALTER TABLE product_ingredients DROP CONSTRAINT IF EXISTS product_ingredients_pkey`);
    await client.query(`ALTER TABLE ingredients DROP CONSTRAINT IF EXISTS ingredients_pkey`);
    await client.query(`ALTER TABLE doughs DROP CONSTRAINT IF EXISTS doughs_pkey`);
    await client.query(`ALTER TABLE sub_doughs DROP CONSTRAINT IF EXISTS sub_doughs_pkey`);
    await client.query(`ALTER TABLE sub_dough_ingredients DROP CONSTRAINT IF EXISTS sub_dough_ingredients_pkey`);
    
    // Add PKs
    await client.query(`ALTER TABLE products ADD PRIMARY KEY (product_code, tenant_id)`);
    await client.query(`ALTER TABLE product_doughs ADD PRIMARY KEY (product_code, dough_code, tenant_id)`);
    await client.query(`ALTER TABLE product_ingredients ADD PRIMARY KEY (product_code, ingredient_code, tenant_id)`);
    await client.query(`ALTER TABLE ingredients ADD PRIMARY KEY (ingredient_code, tenant_id)`);
    await client.query(`ALTER TABLE doughs ADD PRIMARY KEY (dough_id, ingredient_code, tenant_id)`);
    await client.query(`ALTER TABLE sub_doughs ADD PRIMARY KEY (dough_id, tenant_id)`);
    await client.query(`ALTER TABLE sub_dough_ingredients ADD PRIMARY KEY (dough_id, ingredient_code, tenant_id)`);
    
    // Add FKs
    await client.query(`ALTER TABLE doughs ADD CONSTRAINT doughs_ingredient_fkey FOREIGN KEY (ingredient_code, tenant_id) REFERENCES ingredients (ingredient_code, tenant_id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE product_ingredients ADD CONSTRAINT product_ingredients_ingredient_fkey FOREIGN KEY (ingredient_code, tenant_id) REFERENCES ingredients (ingredient_code, tenant_id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE sub_dough_ingredients ADD CONSTRAINT sub_dough_ingredients_ingredient_fkey FOREIGN KEY (ingredient_code, tenant_id) REFERENCES ingredients (ingredient_code, tenant_id) ON DELETE CASCADE`);
    
    await client.query('COMMIT');
    console.log(`Successfully migrated ${name}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`Error migrating ${name}:`, e);
  } finally {
    client.release();
    pool.end();
  }
}

async function main() {
  await migrateDb(process.env.DATABASE_URL, 'Dev DB');
}
main();
