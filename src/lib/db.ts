import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

// データベースへの接続を保持する変数
let db: Database | null = null;

/**
 * SQLiteデータベースへの接続を取得する非同期関数
 * (Singletonパターンで常に同一の接続を返すようにしています)
 */
export async function getDb(): Promise<Database> {
  if (db) {
    return db;
  }

  // プロジェクトのルートディレクトリ直下に「bakery.sqlite」という名前でデータベースファイルを作ります
  const dbPath = path.join(process.cwd(), 'bakery.sqlite');

  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  return db;
}

/**
 * 初回起動時などにデータベースのテーブルを作成する関数です。
 * 注文データや商品情報などを保存するための「器（テーブル）」を準備します。
 */
export async function initDb() {
  const database = await getDb();
  
  // 注文テーブルの作成
  await database.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_date TEXT NOT NULL,
      customer_name TEXT,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 商品マスタ（生地ベース）テーブルの作成
  // 商品1つに対して「どの生地を」「何グラム」使うかを定義します
  await database.exec(`
    CREATE TABLE IF NOT EXISTS product_doughs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_name TEXT NOT NULL,
      dough_name TEXT NOT NULL,
      dough_weight_g INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // 日別の手動調整済み生産計画データの保存テーブル
  // target_dateをUNIQUEにして、1日1レコードとして上書き(Set)・削除(Reset)を管理します
  await database.exec(`
    CREATE TABLE IF NOT EXISTS daily_production_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_date TEXT UNIQUE NOT NULL,
      plan_data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // バッチ実行（計量チェック完了）時に消費した材料を記録するテーブル
  // これを集計して月間の原材料使用量を算出します
  await database.exec(`
    CREATE TABLE IF NOT EXISTS ingredient_usages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_date TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      ingredient_code TEXT NOT NULL,
      ingredient_name TEXT NOT NULL,
      used_weight_grams INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // 今後、原価計算や副材料などのテーブルも必要に応じてここに追加していきます
  console.log('Database initialized successfully.');
}
