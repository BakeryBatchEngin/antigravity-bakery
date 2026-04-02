const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function main() {
  const dbPath = path.join(process.cwd(), 'bakery.sqlite');
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  console.log('Creating mixer_capacities table if not exists...');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS mixer_capacities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      max_capacity_kg INTEGER NOT NULL
    );
  `);

  const existing = await db.get('SELECT count(*) as count FROM mixer_capacities');
  if (existing.count === 0) {
    console.log('Inserting default mixer capacities...');
    await db.exec(`
      INSERT INTO mixer_capacities (id, name, icon, max_capacity_kg) VALUES 
      ('spiral', 'スパイラル', 'spiral_icon.png', 100),
      ('mighty60', 'マイティ60', 'mighty60_icon.png', 30),
      ('mighty30', 'マイティ30', 'mighty30_icon.png', 10);
    `);
  } else {
    console.log('mixer_capacities already has data.');
  }

  console.log('Mixer setup complete!');
}

main().catch(console.error);
