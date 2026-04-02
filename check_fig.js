const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./bakery.sqlite');

db.get("SELECT plan_data FROM daily_production_plans WHERE target_date = '2026-03-25'", (err, row) => {
  if (err) console.error(err);
  if (row) {
    const data = JSON.parse(row.plan_data);
    const figDough = data.flatBatches ? data.flatBatches.filter(b => b.doughName.includes('フィグ')) : [];
    const figProduct = data.flatProductBatches ? data.flatProductBatches.filter(b => b.productName.includes('フィグ')) : [];
    
    console.log("=== UI Plan Data (flatBatches) ===");
    console.log(JSON.stringify(figDough, null, 2));
    console.log("=== UI Plan Data (flatProductBatches) ===");
    console.log(JSON.stringify(figProduct, null, 2));
  } else {
    console.log("No plan found for 2026-03-25");
  }
});

db.all("SELECT * FROM ingredient_usages WHERE target_date = '2026-03-25'", (err, rows) => {
  if (err) console.error(err);
  console.log("=== usages ===");
  console.log(rows);
});
