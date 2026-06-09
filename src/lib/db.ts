import { Pool } from 'pg';

// Poolの遅延初期化
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

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
    const { rows } = await getPool().query(pgSql, params);
    return rows[0] || undefined;
  }

  // 全行取得するメソッド (SQLiteの db.all 互換)
  async all(sql: string, params: any[] = []) {
    const pgSql = convertSqliteToPg(sql);
    const { rows } = await getPool().query(pgSql, params);
    return rows;
  }

  // 更新や挿入を行うメソッド (SQLiteの db.run 互換)
  async run(sql: string, params: any[] = []) {
    const pgSql = convertSqliteToPg(sql);
    const result = await getPool().query(pgSql, params);
    // SQLite互換の戻り値をエミュレート
    return { changes: result.rowCount, lastID: 0 }; 
  }

  // 複数行のSQLをまとめて実行するメソッド (SQLiteの db.exec 互換)
  async exec(sql: string) {
    // プレースホルダは使われない前提のDDL実行など
    await getPool().query(sql);
  }

  // 監査ログやRLS用のコンテキスト(ユーザーID等)をセットして、トランザクション内でクエリを実行するメソッド
  // ※ RLSを機能させるために、スーパーユーザー権限を捨てて 'authenticated' ロールに切り替えます
  async transactionWithUser(userId: number | null, storeId: number | null, role: string | null = null, callback: (txDb: { get: Function, all: Function, run: Function }) => Promise<any>) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      
      // PostgreSQLのセッション変数にユーザーID、店舗ID、ロールをセットする
      if (userId) {
        await client.query(`SET LOCAL app.current_user_id = '${userId}'`);
      } else {
        await client.query(`SET LOCAL app.current_user_id = ''`);
      }
      
      if (storeId) {
        await client.query(`SET LOCAL app.current_store_id = '${storeId}'`);
      } else {
        await client.query(`SET LOCAL app.current_store_id = ''`);
      }

      if (role) {
        await client.query(`SET LOCAL app.current_user_role = '${role}'`);
      } else {
        await client.query(`SET LOCAL app.current_user_role = ''`);
      }

      // RLS（Row Level Security）を機能させるため、一時的に一般ユーザー権限に切り替える
      // （※ スーパーユーザー postgres のままだと RLS が無視されてしまうため）
      await client.query(`SET LOCAL ROLE authenticated`);

      // トランザクション専用の互換オブジェクトを作成
      const txDb = {
        get: async (sql: string, params: any[] = []) => {
          const pgSql = convertSqliteToPg(sql);
          const { rows } = await client.query(pgSql, params);
          return rows[0] || undefined;
        },
        all: async (sql: string, params: any[] = []) => {
          const pgSql = convertSqliteToPg(sql);
          const { rows } = await client.query(pgSql, params);
          return rows;
        },
        run: async (sql: string, params: any[] = []) => {
          const pgSql = convertSqliteToPg(sql);
          const result = await client.query(pgSql, params);
          return { changes: result.rowCount, lastID: 0 };
        }
      };

      const result = await callback(txDb);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

// シングルトンインスタンス
const dbInstance = new PgCompatibleDb();

export async function getDb() {
  return dbInstance;
}

export async function initDb() {
  const database = await getDb();
  
  // 【安全装置】本番データベースの初期化を防止
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  // Vercel本番のプロジェクトIDが含まれているかチェック
  const isProdUrl = process.env.DATABASE_URL?.includes('klyyjcvezaletaazcrgx');

  if (isProduction || isProdUrl) {
    throw new Error("❌ 【安全装置作動】本番環境（または本番用データベース）に対するテーブルの初期化（DROP TABLE等）は禁止されています！");
  }

  // 以降、安全なローカル/開発DBに対してのみ実行される

  // PostgreSQL用に INTEGER PRIMARY KEY AUTOINCREMENT を SERIAL PRIMARY KEY に翻訳済み
  // DATETIME は TIMESTAMP に翻訳済み

  await database.exec(`
    DROP TABLE IF EXISTS orders CASCADE;
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
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
    CREATE TABLE IF NOT EXISTS products (
      product_code TEXT PRIMARY KEY,
      product_name TEXT NOT NULL,
      retail_price INTEGER DEFAULT 0,
      wholesale_price INTEGER DEFAULT 0,
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
      status TEXT DEFAULT 'active',
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
      max_capacity_kg INTEGER NOT NULL,
      store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE
    );
  `);
  
  await database.exec(`
    DROP TABLE IF EXISTS daily_production_plans CASCADE;
    CREATE TABLE IF NOT EXISTS daily_production_plans (
      id SERIAL PRIMARY KEY,
      store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
      target_date TEXT NOT NULL,
      plan_data TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(target_date, store_id)
    );
  `);

  await database.exec(`
    DROP TABLE IF EXISTS ingredient_usages CASCADE;
    CREATE TABLE IF NOT EXISTS ingredient_usages (
      id SERIAL PRIMARY KEY,
      store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
      target_date TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      ingredient_code TEXT NOT NULL,
      ingredient_name TEXT NOT NULL,
      used_weight_grams REAL NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // 発注元ごとの内訳データを格納するテーブル
  await database.exec(`
    DROP TABLE IF EXISTS order_breakdowns CASCADE;
    CREATE TABLE IF NOT EXISTS order_breakdowns (
      id            SERIAL PRIMARY KEY,
      store_id      INTEGER REFERENCES stores(id) ON DELETE CASCADE,
      order_date    TEXT NOT NULL,
      product_code  TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      dept_name     TEXT NOT NULL,
      display_name  TEXT NOT NULL,
      quantity      INTEGER NOT NULL,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // テナント（会社）テーブル：1テナントが複数の店舗を持つ階層構造
  await database.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id          SERIAL PRIMARY KEY,
      tenant_code TEXT UNIQUE NOT NULL,
      tenant_name TEXT NOT NULL,
      plan        TEXT DEFAULT 'basic',
      status      TEXT DEFAULT 'active',
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // フェーズ1: ユーザー＆店舗管理基盤
  await database.exec(`
    CREATE TABLE IF NOT EXISTS stores (
      id         SERIAL PRIMARY KEY,
      tenant_id  INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
      store_code TEXT UNIQUE NOT NULL,
      store_name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id           SERIAL PRIMARY KEY,
      tenant_id    INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
      username     TEXT UNIQUE NOT NULL,
      role         TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'master', 'manager', 'chef')),
      pin_code     TEXT,
      password     TEXT,
      display_name TEXT NOT NULL,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS user_stores (
      user_id  INTEGER REFERENCES users(id) ON DELETE CASCADE,
      store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, store_id)
    );
  `);

  // 監査ログ用テーブルの追加
  await database.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      store_id INTEGER,
      action TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_id TEXT,
      old_data JSONB,
      new_data JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log('PostgreSQL Database initialized successfully.');
}
