const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function main() {
  const dbPath = path.join(process.cwd(), 'bakery.sqlite');
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  
  // 1. Check orders
  console.log("--- Orders ---");
  const orders = await db.all("SELECT * FROM orders LIMIT 3");
  console.log(orders);
  
  // 2. Check product_doughs map
  console.log("\n--- Product Doughs ---");
  const pds = await db.all("SELECT * FROM product_doughs LIMIT 3");
  console.log(pds);
  
  // 3. Check doughs
  console.log("\n--- Doughs ---");
  const doughs = await db.all("SELECT * FROM doughs LIMIT 3");
  console.log(doughs);

  // 4. Test the join query exactly as the API does
  const date = '2026-04-01'; // Default date from the sample sheet
  console.log(`\n--- Test API Query for date: ${date} ---`);
  const orderedProducts = await db.all(`
    SELECT product_code, product_name, SUM(quantity) as total_quantity
    FROM orders
    WHERE order_date = ? AND product_code IS NOT NULL AND product_code != ''
    GROUP BY product_code
  `, [date]);
  console.log(orderedProducts);
}

main().catch(console.error);
