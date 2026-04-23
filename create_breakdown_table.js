const { Pool } = require('pg');

// Supabase への接続（.env.local と同じ接続文字列を使用）
// pgbouncer=true のURLはトランザクションプーリングモード用なのでPREPARED STATEMENTは使えない
const pool = new Pool({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.klyyjcvezaletaazcrgx',
  password: 'sSNOVRyUaVj4VElI',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  // pgbouncer のトランザクションプーリングモードではstatement_cacheは使えないため無効化
  max: 1,
});

async function main() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_breakdowns (
        id            SERIAL PRIMARY KEY,
        order_date    TEXT NOT NULL,
        product_code  TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        dept_name     TEXT NOT NULL,
        display_name  TEXT NOT NULL,
        quantity      INTEGER NOT NULL,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('SUCCESS: order_breakdowns テーブルを作成しました！');

    // テーブルが実際に存在するか確認
    const result = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_breakdowns';"
    );
    if (result.rows.length > 0) {
      console.log('確認OK: テーブルが正常に存在しています。');
    } else {
      console.log('WARNING: テーブルが見つかりませんでした。');
    }
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
