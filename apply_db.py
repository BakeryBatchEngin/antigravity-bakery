import os

with open('src/lib/db.ts', 'r', encoding='utf-8') as f:
    content = f.read()

target = """  await database.exec(`
    CREATE TABLE IF NOT EXISTS product_ingredients ("""

new = """  await database.exec(`
    CREATE TABLE IF NOT EXISTS sub_doughs (
      dough_id TEXT PRIMARY KEY,
      dough_name TEXT NOT NULL,
      base_dough_id TEXT NOT NULL,
      base_dough_name TEXT NOT NULL,
      base_dough_amount REAL NOT NULL,
      tenant_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS sub_dough_ingredients (
      dough_id TEXT NOT NULL,
      ingredient_code TEXT NOT NULL,
      ingredient_name TEXT NOT NULL,
      ingredient_amount REAL NOT NULL,
      tenant_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (dough_id, ingredient_code),
      FOREIGN KEY(ingredient_code) REFERENCES ingredients(ingredient_code)
    );
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS product_ingredients ("""

content = content.replace(target, new)

with open('src/lib/db.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated src/lib/db.ts")
