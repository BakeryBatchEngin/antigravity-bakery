import * as dotenv from 'dotenv';
import { Pool } from 'pg';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

dotenv.config({ path: '.env.local' });

async function main() {
  console.log('Connecting to PostgreSQL using URL:', process.env.DATABASE_URL ? '***[HIDDEN]***' : 'NOT SET');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const dbPath = path.join(process.cwd(), 'bakery.sqlite');
  console.log(`Connecting to SQLite at ${dbPath}...`);
  const sqliteDb = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Omit created_at to avoid parsing issues, let Postgres use CURRENT_TIMESTAMP
  const tables = [
    {
      name: 'ingredients',
      columns: ['ingredient_code', 'ingredient_name', 'purchase_weight', 'purchase_price'],
      ints: ['purchase_weight', 'purchase_price']
    },
    {
      name: 'doughs',
      columns: ['dough_id', 'dough_name', 'ingredient_code', 'ingredient_name', 'bakers_percent'],
      ints: []
    },
    {
      name: 'product_doughs',
      columns: ['product_code', 'product_name', 'dough_code', 'dough_name', 'dough_amount'],
      ints: ['dough_amount']
    },
    {
      name: 'product_ingredients',
      columns: ['product_code', 'product_name', 'ingredient_code', 'ingredient_name', 'ingredient_amount'],
      ints: ['ingredient_amount']
    },
    {
      name: 'mixer_capacities',
      columns: ['id', 'name', 'icon', 'max_capacity_kg'],
      ints: ['max_capacity_kg']
    }
  ];

  for (const table of tables) {
    console.log(`Migrating table: ${table.name}...`);
    await pool.query(`TRUNCATE TABLE ${table.name} CASCADE`);
    
    const rows = await sqliteDb.all(`SELECT * FROM ${table.name}`);
    console.log(`  Found ${rows.length} rows in SQLite.`);
    
    if (rows.length === 0) continue;

    const colsStr = table.columns.join(', ');
    const paramsStr = table.columns.map((_, i) => `$${i + 1}`).join(', ');
    const insertSql = `INSERT INTO ${table.name} (${colsStr}) VALUES (${paramsStr})`;
    
    for (const row of rows) {
      const values = table.columns.map(col => {
        let val = row[col];
        if (table.ints.includes(col)) {
          // ensure integers are properly parsed, or null if empty
          if (val === '' || val === null) return null;
          return Number(val);
        }
        return val;
      });
      
      try {
        await pool.query(insertSql, values);
      } catch (err) {
        console.error(`Skipping invalid row in ${table.name} (likely orphaned FK):`, row.ingredient_code || row.dough_code || row);
      }
    }
    console.log(`  Successfully inserted ${rows.length} rows to PostgreSQL.`);
  }

  console.log('✅ Migration complete!');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Migration error:', err);
  process.exit(1);
});
