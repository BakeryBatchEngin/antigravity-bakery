require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function simulateProductionAPI(dateStr, storeId, tenantId) {
  const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const orderedProductsRaw = await client.query(`
        SELECT product_code, MAX(product_name) as order_product_name, SUM(quantity) as total_quantity
        FROM orders
        WHERE store_id = $1 AND order_date = $2
        GROUP BY product_code
    `, [storeId, dateStr]);

    console.log("Ordered products:", orderedProductsRaw.rows);

    for (const product of orderedProductsRaw.rows) {
        const doughsForProduct = await client.query(`
          SELECT dough_code, dough_name, dough_amount
          FROM product_doughs
          WHERE product_code = $1 AND tenant_id = $2
        `, [product.product_code, tenantId]);
        
        console.log(`Doughs for ${product.product_code}:`, doughsForProduct.rows);

        for (const pd of doughsForProduct.rows) {
            const subDough = await client.query(`SELECT * FROM sub_doughs WHERE dough_id = $1 AND tenant_id = $2`, [pd.dough_code, tenantId]);
            
            if (subDough.rows.length > 0) {
                 console.log("Found subdough:", subDough.rows[0]);
            } else {
                 const recipeIngredients = await client.query(`
                  SELECT d.ingredient_code, d.ingredient_name, d.bakers_percent
                  FROM doughs d
                  WHERE d.dough_id = $1 AND d.tenant_id = $2
                 `, [pd.dough_code, tenantId]);
                 console.log(`Ingredients for ${pd.dough_code}:`, recipeIngredients.rows);
            }
        }
    }
  } finally {
    client.release();
    pool.end();
  }
}
simulateProductionAPI('2026-09-12', 6, 2);
