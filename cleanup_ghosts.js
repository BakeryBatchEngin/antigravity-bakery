const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('bakery.sqlite');

async function cleanup() {
  db.all('SELECT target_date, plan_data FROM daily_production_plans', (err, rows) => {
    if (err) return console.error(err);
    if (!rows || rows.length === 0) return console.log('No plans found');
    
    rows.forEach(row => {
      const date = row.target_date;
      const plan = JSON.parse(row.plan_data);
      const validIds = [
         ...(plan.flatBatches || []).map(b => b.id),
         ...(plan.flatProductBatches || []).map(b => b.id)
      ];
      
      if (validIds.length > 0) {
        const placeholders = validIds.map(() => '?').join(',');
        const query = `DELETE FROM ingredient_usages WHERE target_date = ? AND batch_id NOT IN (${placeholders})`;
        db.run(query, [date, ...validIds], function(err2) {
           if (err2) console.error('Delete error for', date, err2);
           else if (this.changes > 0) console.log(`Deleted ${this.changes} orphaned records for ${date}`);
        });
      }
    });
  });
}

cleanup();
