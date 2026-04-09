import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const { getDb } = require('./src/lib/db');

async function testAll() {
  try {
    const db = await getDb();
    const date = '2026-03-31';
    
    console.log("1. Fetching mixers...");
    const mixers = await db.all('SELECT * FROM mixer_capacities ORDER BY max_capacity_kg DESC');
    console.log("Mixers fetched:", mixers.length);

    console.log("2. Fetching ordered products for", date);
    const orderedProducts = await db.all(`
      SELECT product_code, product_name, SUM(quantity) as total_quantity
      FROM orders
      WHERE order_date = ? AND product_code IS NOT NULL AND product_code != ''
      GROUP BY product_code, product_name
    `, [date]);
    console.log("Ordered products:", orderedProducts.length);

    if (orderedProducts.length === 0) {
      console.log("No orders, exiting.");
      process.exit(0);
    }

    console.log("3. Fetching saved plan...");
    const savedPlanRow = await db.get(`SELECT plan_data FROM daily_production_plans WHERE target_date = ?`, [date]);
    console.log("Saved plan found:", !!savedPlanRow);

    console.log("4. Fetching executions...");
    const executions = await db.all(`SELECT DISTINCT batch_id FROM ingredient_usages WHERE target_date = ?`, [date]);
    console.log("Executions found:", executions.length);

    console.log("5. Checking product doughs for the first product:", orderedProducts[0].product_code);
    const doughsForProduct = await db.all(`
        SELECT dough_code, dough_name, dough_amount
        FROM product_doughs
        WHERE product_code = ?
      `, [orderedProducts[0].product_code]);
    console.log("Doughs found:", doughsForProduct.length);

    if (doughsForProduct.length > 0) {
      console.log("6. Checking recipe ingredients for dough:", doughsForProduct[0].dough_code);
      const recipeIngredients = await db.all(`
        SELECT d.ingredient_code, d.ingredient_name, d.bakers_percent
        FROM doughs d
        WHERE d.dough_id = ?
      `, [doughsForProduct[0].dough_code]);
      console.log("Recipe ingredients found:", recipeIngredients.length);
    }

    console.log("7. Checking product ingredients for the first product");
    const productIngredients = await db.all(`
        SELECT ingredient_code, ingredient_name, ingredient_amount
        FROM product_ingredients
        WHERE product_code = ?
      `, [orderedProducts[0].product_code]);
    console.log("Product ingredients found:", productIngredients.length);

  } catch (error) {
    console.error("Test Error:", error);
  }
  process.exit(0);
}

testAll();
