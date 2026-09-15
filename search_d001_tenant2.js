require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function searchD001() {
  const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const tables = ['doughs', 'products', 'ingredients', 'product_doughs', 'product_ingredients', 'sub_doughs', 'sub_dough_ingredients', 'orders'];
    for(const table of tables) {
      try {
        const res = await client.query(`SELECT * FROM ${table} WHERE tenant_id = 2::integer`);
        for(const row of res.rows) {
            const rowStr = JSON.stringify(row);
            if(rowStr.includes('D001')) {
                console.log(`FOUND D001 in ${table}:`, rowStr);
            }
        }
      } catch(e) {
         // ignore table if columns differ
      }
    }
    
    // Also orders which uses store_id
    const resOrders = await client.query(`SELECT * FROM orders WHERE store_id IN (6,7)`);
    for(const row of resOrders.rows) {
        if(JSON.stringify(row).includes('D001')) {
            console.log("FOUND D001 in orders:", row);
        }
    }
    
  } finally {
    client.release();
    pool.end();
  }
}
searchD001();
