const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./bakery.db');

db.all(
  SELECT t.id, t.tenant_name, COUNT(DISTINCT s.id) as store_count, COUNT(DISTINCT u.id) as user_count 
  FROM tenants t 
  LEFT JOIN stores s ON s.tenant_id = t.id 
  LEFT JOIN users u ON u.tenant_id = t.id 
  GROUP BY t.id
, [], (err, rows) => {
  if (err) throw err;
  console.log(rows);
});
