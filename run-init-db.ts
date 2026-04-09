import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// dotenv.configの後にrequireでインポートする
const { initDb } = require('./src/lib/db');

async function run() {
  console.log('Running initDb...');
  await initDb();
  console.log('Done!');
  process.exit(0);
}

run().catch(console.error);
