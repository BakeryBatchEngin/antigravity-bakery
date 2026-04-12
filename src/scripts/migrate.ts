import { initDb, getDb } from '../lib/db';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function migrate() {
  const db = await getDb();
  console.log('Migrating product_doughs...');
  await db.exec(`ALTER TABLE product_doughs ALTER COLUMN dough_amount TYPE REAL;`);
  
  console.log('Migrating product_ingredients...');
  await db.exec(`ALTER TABLE product_ingredients ALTER COLUMN ingredient_amount TYPE REAL;`);
  
  console.log('Migrating ingredient_usages...');
  await db.exec(`ALTER TABLE ingredient_usages ALTER COLUMN used_weight_grams TYPE REAL;`);
  
  console.log('Migration completed successfully.');
}

migrate().catch(console.error);
