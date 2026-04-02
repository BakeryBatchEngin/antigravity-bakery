const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function main() {
  const dbPath = path.join(process.cwd(), 'bakery.sqlite');
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  
  // 過去のミスって入った注文データを削除します
  await db.run("DELETE FROM orders");
  console.log("All orders deleted. Ready for clean import.");
}

main().catch(console.error);
