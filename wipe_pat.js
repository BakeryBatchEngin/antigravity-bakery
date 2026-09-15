require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function wipePatData() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log("Wiping Master Data for Tenant 2...");
    await client.query("DELETE FROM product_doughs WHERE tenant_id = 2");
    await client.query("DELETE FROM product_ingredients WHERE tenant_id = 2");
    await client.query("DELETE FROM products WHERE tenant_id = 2");
    
    await client.query("DELETE FROM sub_dough_ingredients WHERE tenant_id = 2");
    await client.query("DELETE FROM sub_doughs WHERE tenant_id = 2");
    await client.query("DELETE FROM doughs WHERE tenant_id = 2");
    await client.query("DELETE FROM ingredients WHERE tenant_id = 2");
    
    console.log("Wiping Order & Production Data for Tenant 2 stores...");
    // The query safely deletes rows where store_id belongs to tenant_id = 2
    const storeSubquery = "SELECT id FROM stores WHERE tenant_id = 2";
    
    await client.query(`DELETE FROM ingredient_usages WHERE store_id IN (${storeSubquery})`);
    await client.query(`DELETE FROM batch_executions WHERE store_id IN (${storeSubquery})`);
    await client.query(`DELETE FROM daily_batches WHERE store_id IN (${storeSubquery})`);
    await client.query(`DELETE FROM daily_production_plans WHERE store_id IN (${storeSubquery})`);
    await client.query(`DELETE FROM order_breakdowns WHERE store_id IN (${storeSubquery})`);
    await client.query(`DELETE FROM orders WHERE store_id IN (${storeSubquery})`);
    
    await client.query('COMMIT');
    console.log("Successfully wiped all Pat Co data from Production!");
  } catch (e) {
    await client.query('ROLLBACK');
    console.error("Failed, rolled back:", e);
  } finally {
    client.release();
    pool.end();
  }
}
wipePatData();
