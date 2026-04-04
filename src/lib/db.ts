import { Pool } from 'pg';

// Supabase (PostgreSQL) 接続用のプールを作成
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // もしVercelやSupabaseの証明書関連でエラーが出る場合はsslを有効にしますが、
  // デフォルトでURLに含まれているパラメータが効くため 일단そのままにします
});

/**
 * 【自動翻訳エンジン】
 * SQLiteの ? プレースホルダを PostgreSQLの $1, $2, ... に変換します。
 * 例: "SELECT * FROM users WHERE id = ? AND name = ?"
 *  -> "SELECT * FROM users WHERE id = $1 AND name = $2"
 */
function convertSqliteToPg(sql: string): string {
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

/**
 * 既存のSQLite呼び出し（db.get, db.all, etc）を
 * 内部でPostgreSQL(pg)に変換して実行するラッパークラス
 */
class PgCompatibleDb {
  
  // 1行だけ取得するメソッド (SQLiteの db.get 互換)
  async get(sql: string, params: any[] = []) {
    const pgSql = convertSqliteToPg(sql);
    const { rows } = await pool.query(pgSql, params);
    return rows[0] || undefined;
  }

  // 全行取得するメソッド (SQLiteの db.all 互換)
  async all(sql: string, params: any[] = []) {
    const pgSql = convertSqliteToPg(sql);
    const { rows } = await pool.query(pgSql, params);
    return rows;
  }

  // 更新や挿入を行うメソッド (SQLiteの db.run 互換)
  async run(sql: string, params: any[] = []) {
    const pgSql = convertSqliteToPg(sql);
    const result = await pool.query(pgSql, params);
    // SQLite互換の戻り値をエミュレート
    return { changes: result.rowCount, lastID: 0 }; 
  }

  // 複数行のSQLをまとめて実行するメソッド (SQLiteの db.exec 互換)
  async exec(sql: string) {
    // プレースホルダは使われない前提のDDL実行など
    await pool.query(sql);
  }
}

// シングルトンインスタンス
const dbInstance = new PgCompatibleDb();

export async function getDb() {
  return dbInstance;
}

export async function initDb() {
  const database = await getDb();
  
  // PostgreSQL用に INTEGER PRIMARY KEY AUTOINCREMENT を SERIAL PRIMARY KEY に翻訳済み
  // DATETIME は TIMESTAMP に翻訳済み

  await database.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      order_date TEXT NOT NULL,
      customer_name TEXT,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS product_doughs (
      id SERIAL PRIMARY KEY,
      product_name TEXT NOT NULL,
      dough_name TEXT NOT NULL,
      dough_weight_g INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  await database.exec(`
    CREATE TABLE IF NOT EXISTS daily_production_plans (
      id SERIAL PRIMARY KEY,
      target_date TEXT UNIQUE NOT NULL,
      plan_data TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS ingredient_usages (
      id SERIAL PRIMARY KEY,
      target_date TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      ingredient_code TEXT NOT NULL,
      ingredient_name TEXT NOT NULL,
      used_weight_grams INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  console.log('PostgreSQL Database initialized successfully.');
}
