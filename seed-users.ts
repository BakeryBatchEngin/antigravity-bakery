import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const { getDb, initDb } = require('./src/lib/db');

async function run() {
  console.log('Running initDb to ensure tables exist...');
  await initDb();
  
  const db = await getDb();
  console.log('Seeding stores and users data...');

  // 店舗データの作成
  const stores = [
    { code: 'S001', name: 'Tokyo Main Store' },
    { code: 'S002', name: 'Osaka Branch' },
    { code: 'S003', name: 'Yokohama Store' }
  ];

  for (const store of stores) {
    await db.run(
      `INSERT INTO stores (store_code, store_name) VALUES ($1, $2) ON CONFLICT (store_code) DO NOTHING`,
      [store.code, store.name]
    );
  }

  // ユーザーデータの作成
  const users = [
    { username: 'admin_user', role: 'admin', pin: null, pass: 'admin123', display: 'System Admin' },
    { username: 'master_user', role: 'master', pin: null, pass: 'master123', display: 'Master Data Manager' },
    { username: 'manager_user', role: 'manager', pin: null, pass: 'manager123', display: 'Area Manager' },
    { username: 'chef_tokyo', role: 'chef', pin: '1111', pass: null, display: 'Tokyo Chef' },
    { username: 'chef_osaka', role: 'chef', pin: '2222', pass: null, display: 'Osaka Chef' },
  ];

  for (const user of users) {
    await db.run(
      `INSERT INTO users (username, role, pin_code, password, display_name) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (username) DO NOTHING`,
      [user.username, user.role, user.pin, user.pass, user.display]
    );
  }

  // ユーザーと店舗の紐付け
  // Tokyo Chef -> S001
  const tokyoChef = await db.get(`SELECT id FROM users WHERE username = 'chef_tokyo'`);
  const tokyoStore = await db.get(`SELECT id FROM stores WHERE store_code = 'S001'`);
  if (tokyoChef && tokyoStore) {
    await db.run(`INSERT INTO user_stores (user_id, store_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [tokyoChef.id, tokyoStore.id]);
  }

  // Osaka Chef -> S002, S003 (複数店舗担当のテスト)
  const osakaChef = await db.get(`SELECT id FROM users WHERE username = 'chef_osaka'`);
  const osakaStore = await db.get(`SELECT id FROM stores WHERE store_code = 'S002'`);
  const yokohamaStore = await db.get(`SELECT id FROM stores WHERE store_code = 'S003'`);
  if (osakaChef && osakaStore && yokohamaStore) {
    await db.run(`INSERT INTO user_stores (user_id, store_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [osakaChef.id, osakaStore.id]);
    await db.run(`INSERT INTO user_stores (user_id, store_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [osakaChef.id, yokohamaStore.id]);
  }

  console.log('Seeding Done!');
  process.exit(0);
}

run().catch(console.error);
