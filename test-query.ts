import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const { getDb } = require('./src/lib/db');

async function testQuery() {
  try {
    const db = await getDb();
    
    console.log("Fetching mixers...");
    const mixers = await db.all('SELECT * FROM mixer_capacities ORDER BY max_capacity_kg DESC');
    console.log("Mixers:", mixers);

    console.log("Fetching orders for date 2024-01-01...");
    const orderedProducts = await db.all(`
      SELECT product_code, product_name, SUM(quantity) as total_quantity
      FROM orders
      WHERE order_date = ? AND product_code IS NOT NULL AND product_code != ''
      GROUP BY product_code
    `, ['2024-01-01']);
    console.log("Orders:", orderedProducts);

  } catch (error) {
    console.error("Test Error:", error);
  }
  process.exit(0);
}

testQuery();
