import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  console.log('Connecting to PostgreSQL using URL:', process.env.DATABASE_URL ? '***[HIDDEN]***' : 'NOT SET');
  try {
    const { initDb } = await import('./src/lib/db');
    await initDb();
    console.log('✅ PostgreSQL テーブル初期化完了！');
    process.exit(0);
  } catch (error) {
    console.error('❌ テーブル初期化エラー:', error);
    process.exit(1);
  }
}

main();
