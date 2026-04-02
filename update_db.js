const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./bakery.sqlite');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS daily_production_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_date TEXT UNIQUE NOT NULL,
      plan_data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ingredient_usages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_date TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      ingredient_code TEXT NOT NULL,
      ingredient_name TEXT NOT NULL,
      used_weight_grams INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log("Tables created successfully.");
});

db.close();
