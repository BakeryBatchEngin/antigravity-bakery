const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function main() {
  const dbPath = path.join(process.cwd(), 'bakery.sqlite');
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  
  const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
  console.log("Newly created tables:");
  tables.forEach(t => console.log(`- ${t.name}`));
}

main().catch(console.error);
