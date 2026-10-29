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

export interface UserContext {
  id?: number | null;
  tenant_id?: number | null;
  role?: string | null;
  store_id?: number | null;
}

/**
 * 既存のSQLite呼び出し（db.get, db.all, etc）を
 * 内部でPostgreSQL(pg)に変換して実行するラッパークラス
 * ユーザーコンテキスト(userContext)を渡すことで、RLS用のセッション変数を自動適用します。
 */
export class PgCompatibleDb {
  private userContext?: UserContext | null;

  constructor(userContext?: UserContext | null) {
    this.userContext = userContext;
  }

  private async executeWithContext<T>(action: (runner: any) => Promise<T>): Promise<T> {
    if (!this.userContext) {
      return await action(getPool());
    }

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const tenantIdStr = this.userContext.tenant_id != null ? String(this.userContext.tenant_id) : '';
      const roleStr = this.userContext.role || '';
      const userIdStr = this.userContext.id != null ? String(this.userContext.id) : '';
      const storeIdStr = this.userContext.store_id != null ? String(this.userContext.store_id) : '';

      await client.query(`SET LOCAL app.current_tenant_id = '${tenantIdStr}'`);
      await client.query(`SET LOCAL app.current_user_role = '${roleStr}'`);
      await client.query(`SET LOCAL app.current_user_id = '${userIdStr}'`);
      await client.query(`SET LOCAL app.current_store_id = '${storeIdStr}'`);
      await client.query('SET LOCAL ROLE authenticated');

      const res = await action(client);
      await client.query('COMMIT');
      return res;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  
  // 1行だけ取得するメソッド (SQLiteの db.get 互換)
  async get(sql: string, params: any[] = []) {
    const pgSql = convertSqliteToPg(sql);
    return await this.executeWithContext(async (runner) => {
      const { rows } = await runner.query(pgSql, params);
      return rows[0] || undefined;
    });
  }

  // 全行取得するメソッド (SQLiteの db.all 互換)
  async all(sql: string, params: any[] = []) {
    const pgSql = convertSqliteToPg(sql);
    return await this.executeWithContext(async (runner) => {
      const { rows } = await runner.query(pgSql, params);
      return rows;
    });
  }

  // 更新や挿入を行うメソッド (SQLiteの db.run 互換)
  async run(sql: string, params: any[] = []) {
    const pgSql = convertSqliteToPg(sql);
    return await this.executeWithContext(async (runner) => {
      const result = await runner.query(pgSql, params);
      return { changes: result.rowCount, lastID: 0 };
    });
  }

  // 複数行のSQLをまとめて実行するメソッド (SQLiteの db.exec 互換)
  async exec(sql: string) {
    return await this.executeWithContext(async (runner) => {
      await runner.query(sql);
    });
  }

  // トランザクションを実行するメソッド（userContextがある場合は自動でRLSセッションを保持）
  async transaction(callback: (txDb: { get: Function, all: Function, run: Function }) => Promise<any>) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');

      if (this.userContext) {
        const tenantIdStr = this.userContext.tenant_id != null ? String(this.userContext.tenant_id) : '';
        const roleStr = this.userContext.role || '';
        const userIdStr = this.userContext.id != null ? String(this.userContext.id) : '';
        const storeIdStr = this.userContext.store_id != null ? String(this.userContext.store_id) : '';

        await client.query(`SET LOCAL app.current_tenant_id = '${tenantIdStr}'`);
        await client.query(`SET LOCAL app.current_user_role = '${roleStr}'`);
        await client.query(`SET LOCAL app.current_user_id = '${userIdStr}'`);
        await client.query(`SET LOCAL app.current_store_id = '${storeIdStr}'`);
        await client.query('SET LOCAL ROLE authenticated');
      }
      
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

  // 互換用：手動でユーザーID等を渡すトランザクションメソッド
  async transactionWithUser(userId: number | null, storeId: number | null, role: string | null = null, callback: (txDb: { get: Function, all: Function, run: Function }) => Promise<any>) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      
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

      await client.query('SET LOCAL ROLE authenticated');

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

// シングルトンインスタンス（後方互換・システム管理者用）
const dbInstance = new PgCompatibleDb();

export async function getDb(user?: UserContext | null) {
  if (user) {
    return new PgCompatibleDb(user);
  }
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
      memo TEXT,
      informart_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // 開発環境等の既存DBに対するマイグレーション用（既に存在する場合はエラーになるためキャッチは別スクリプトでやるべきだが、SQLiteだとALTER TABLE IF NOT EXISTSが使えないのでPostgreSQL用なら本来はADD COLUMN IF NOT EXISTS）
  // 稼働中のDBには直接SQLを実行してカラムを追加しておく想定。

  await database.exec(`
    CREATE TABLE IF NOT EXISTS product_aliases (
      alias_code TEXT PRIMARY KEY,
      product_code TEXT NOT NULL REFERENCES products(product_code) ON DELETE CASCADE,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS product_doughs (
      product_code TEXT NOT NULL,
      product_name TEXT NOT NULL,
      dough_code TEXT NOT NULL,
      dough_name TEXT,
      dough_amount REAL NOT NULL,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (product_code, dough_code)
    );
  `);

  try {
    await database.exec(`ALTER TABLE product_doughs ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL;`);
  } catch (e) {
    // column might already exist
  }

  await database.exec(`
    CREATE TABLE IF NOT EXISTS ingredients (
      ingredient_code TEXT PRIMARY KEY,
      ingredient_name TEXT NOT NULL,
      type TEXT DEFAULT 'material',
      purchase_weight INTEGER,
      purchase_price INTEGER,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 既存のingredientsテーブルにtypeカラムを追加（既に存在する場合はエラーになるため無視）
  try {
    await database.exec(`ALTER TABLE ingredients ADD COLUMN type TEXT DEFAULT 'material';`);
  } catch (e) {
    // column might already exist
  }

  await database.exec(`
    CREATE TABLE IF NOT EXISTS wips (
      wip_code TEXT NOT NULL,
      wip_name TEXT NOT NULL,
      memo TEXT,
      informart_url TEXT,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (wip_code, tenant_id)
    );
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS wip_ingredients (
      wip_code TEXT NOT NULL,
      ingredient_code TEXT NOT NULL,
      ingredient_name TEXT,
      ingredient_amount REAL NOT NULL,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (wip_code, ingredient_code, tenant_id),
      FOREIGN KEY (wip_code, tenant_id) REFERENCES wips(wip_code, tenant_id) ON DELETE CASCADE,
      FOREIGN KEY (ingredient_code, tenant_id) REFERENCES ingredients(ingredient_code, tenant_id) ON DELETE CASCADE
    );
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS doughs (
      dough_id TEXT NOT NULL,
      dough_name TEXT NOT NULL,
      ingredient_code TEXT NOT NULL,
      ingredient_name TEXT,
      bakers_percent REAL,
      memo TEXT,
      informart_url TEXT,
      tenant_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (dough_id, ingredient_code),
      FOREIGN KEY(ingredient_code) REFERENCES ingredients(ingredient_code)
    );
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS sub_doughs (
      dough_id TEXT PRIMARY KEY,
      dough_name TEXT NOT NULL,
      base_dough_id TEXT NOT NULL,
      base_dough_name TEXT NOT NULL,
      base_dough_amount REAL NOT NULL,
      memo TEXT,
      informart_url TEXT,
      tenant_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS sub_dough_ingredients (
      dough_id TEXT NOT NULL,
      ingredient_code TEXT NOT NULL,
      ingredient_name TEXT NOT NULL,
      ingredient_amount REAL NOT NULL,
      tenant_id INTEGER,
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
  
  await database.exec(`
    CREATE TABLE IF NOT EXISTS batch_executions (
      id SERIAL PRIMARY KEY,
      store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
      target_date TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(store_id, target_date, batch_id)
    );
  `);
  
  // 発注元ごとの内訳データを格納するテーブル
  await database.exec(`
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
      role         TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'master', 'manager', 'chef', 'store_loss_manager', 'company_loss_manager')),
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

  await database.exec(`
    CREATE TABLE IF NOT EXISTS store_products (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      product_code TEXT NOT NULL,
      product_name TEXT NOT NULL,
      retail_price INTEGER DEFAULT 0,
      category TEXT DEFAULT '',
      characteristics TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, product_code),
      UNIQUE (tenant_id, product_name)
    );
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS store_sales_orders (
      id SERIAL PRIMARY KEY,
      store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      order_date TEXT NOT NULL,
      product_code TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (store_id, order_date, product_code)
    );
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS waste_records (
      id SERIAL PRIMARY KEY,
      store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
      target_date TEXT NOT NULL,
      product_code TEXT NOT NULL,
      product_name TEXT,
      order_quantity INTEGER DEFAULT 0,
      waste_count INTEGER DEFAULT 0,
      sold_out_time TEXT,
      comment TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(store_id, target_date, product_code)
    );
  `);

  // ロス記録に「納品差異」と「試食数」を追加（既に存在する場合は何もしない）
  try {
    await database.exec(`ALTER TABLE waste_records ADD COLUMN IF NOT EXISTS delivery_diff INTEGER DEFAULT 0;`);
    await database.exec(`ALTER TABLE waste_records ADD COLUMN IF NOT EXISTS sample_count INTEGER DEFAULT 0;`);
  } catch (e) {
    // カラムが既に存在する場合などは無視
  }

  await database.exec(`
    CREATE TABLE IF NOT EXISTS waste_photo_logs (
      id SERIAL PRIMARY KEY,
      store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
      target_date TEXT NOT NULL,
      image_base64 TEXT NOT NULL,
      results_json TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS store_profiles (
      id SERIAL PRIMARY KEY,
      store_id INTEGER UNIQUE NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      business_hours TEXT,
      location_characteristics TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS daily_loss_ai_analyses (
      id SERIAL PRIMARY KEY,
      store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      target_date TEXT NOT NULL,
      ai_comment TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(store_id, target_date)
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
