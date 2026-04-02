const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('bakery.sqlite');

db.all('SELECT * FROM daily_production_plans ORDER BY target_date DESC LIMIT 1', (err, rows) => {
   if (rows && rows.length > 0) {
      console.log("Found plan for date:", rows[0].target_date);
      const plan = JSON.parse(rows[0].plan_data);
      console.log("Saved Flat Batches:", plan.flatBatches.map(b => b.id).join(', '));
      console.log("Saved Product Batches:", plan.flatProductBatches.map(b => b.id).join(', '));
   }
});

db.all('SELECT DISTINCT batch_id, target_date FROM ingredient_usages', (err, rows) => {
   console.log("Executed batches:", rows);
});
