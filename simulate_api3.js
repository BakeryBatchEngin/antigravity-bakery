require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function simulateProductionAPI(dateStr, storeId, tenantId) {
  const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const orderedProductsRaw = await client.query(`
        SELECT product_code, MAX(product_name) as order_product_name, SUM(quantity) as total_quantity
        FROM orders
        WHERE store_id = $1
        GROUP BY product_code
    `, [storeId]);

    console.log("Ordered products:", orderedProductsRaw.rows);

    for (const product of orderedProductsRaw.rows) {
        const doughsForProduct = await client.query(`
          SELECT dough_code, dough_name, dough_amount
          FROM product_doughs
          WHERE product_code = $1 AND tenant_id = $2
        `, [product.product_code, tenantId]);
        
        console.log(`Doughs for ${product.product_code}:`, doughsForProduct.rows);
    }
  } finally {
    client.release();
    pool.end();
  }
}
simulateProductionAPI('', 6, 2);
