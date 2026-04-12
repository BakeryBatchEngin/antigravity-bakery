// DBマイグレーションスクリプト: INTEGER → REAL への変換
// 実行: node src/scripts/run-migration.mjs

import pg from 'pg';
import { readFileSync } from 'fs';

// .env.local から DATABASE_URL を読み込む
const envContent = readFileSync('.env.local', 'utf8');
const match = envContent.match(/^DATABASE_URL=["']?(.+?)["']?$/m);
if (!match) {
  console.error('DATABASE_URL が .env.local に見つかりません');
  process.exit(1);
}
const connectionString = match[1].trim().replace(/^["']|["']$/g, '');

const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🔧 Migration 開始...');

    // product_doughs.dough_amount: INTEGER → REAL
    await client.query(`ALTER TABLE product_doughs ALTER COLUMN dough_amount TYPE REAL;`);
    console.log('✅ product_doughs.dough_amount: INTEGER → REAL に変更完了');

    // product_ingredients.ingredient_amount: INTEGER → REAL
    await client.query(`ALTER TABLE product_ingredients ALTER COLUMN ingredient_amount TYPE REAL;`);
    console.log('✅ product_ingredients.ingredient_amount: INTEGER → REAL に変更完了');

    // ingredient_usages.used_weight_grams: INTEGER → REAL
    await client.query(`ALTER TABLE ingredient_usages ALTER COLUMN used_weight_grams TYPE REAL;`);
    console.log('✅ ingredient_usages.used_weight_grams: INTEGER → REAL に変更完了');

    console.log('\n🎉 全てのマイグレーションが完了しました！');
  } catch (err) {
    console.error('❌ マイグレーション失敗:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
