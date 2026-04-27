const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runMigration() {
  try {
    console.log('Adding status column to ingredients table...');
    await pool.query(`
      ALTER TABLE ingredients
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
    `);
    
    // 既存のNULL値をactiveにする（念のため）
    await pool.query(`
      UPDATE ingredients SET status = 'active' WHERE status IS NULL;
    `);

    console.log('Migration successful.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pool.end();
  }
}

runMigration();
