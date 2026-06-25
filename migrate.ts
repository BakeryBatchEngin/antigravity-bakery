import { getDb } from './src/lib/db';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

async function run() {
  try {
    const db = await getDb();
    
    console.log("Creating batch_executions table...");
    await db.exec(`
      CREATE TABLE IF NOT EXISTS batch_executions (
        id SERIAL PRIMARY KEY,
        store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
        target_date TEXT NOT NULL,
        batch_id TEXT NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(store_id, target_date, batch_id)
      );
    `);
    console.log("Success.");
  } catch(e) {
    console.error("Failed:", e);
  } finally {
    process.exit(0);
  }
}

run();
