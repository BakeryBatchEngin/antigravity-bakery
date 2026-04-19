import { Pool } from 'pg';

// Supabase (PostgreSQL) 接続用のプールを作成
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
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
    DROP TABLE IF EXISTS orders CASCADE;
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      order_date TEXT NOT NULL,
      store_name TEXT,
      delivery_shift TEXT,
      product_code TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await database.exec(`
    DROP TABLE IF EXISTS product_doughs CASCADE;
    CREATE TABLE product_doughs (
      product_code TEXT NOT NULL,
      product_name TEXT NOT NULL,
      dough_code TEXT NOT NULL,
      dough_name TEXT,
      dough_amount REAL NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (product_code, dough_code)
    );
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS ingredients (
      ingredient_code TEXT PRIMARY KEY,
      ingredient_name TEXT NOT NULL,
      purchase_weight INTEGER,
      purchase_price INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS doughs (
      dough_id TEXT NOT NULL,
      dough_name TEXT NOT NULL,
      ingredient_code TEXT NOT NULL,
      ingredient_name TEXT,
      bakers_percent REAL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (dough_id, ingredient_code),
      FOREIGN KEY(ingredient_code) REFERENCES ingredients(ingredient_code)
    );
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS product_ingredients (
      product_code TEXT NOT NULL,
      product_name TEXT NOT NULL,
      ingredient_code TEXT NOT NULL,
      ingredient_name TEXT,
      ingredient_amount REAL NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (product_code, ingredient_code),
      FOREIGN KEY(ingredient_code) REFERENCES ingredients(ingredient_code)
    );
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS mixer_capacities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      max_capacity_kg INTEGER NOT NULL
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
      used_weight_grams REAL NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // 発注元ごとの内訳データを格納するテーブル（既存データを壊さないようDROPなし）
  await database.exec(`
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

  console.log('PostgreSQL Database initialized successfully.');
}
