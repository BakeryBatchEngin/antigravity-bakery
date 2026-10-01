require('dotenv').config({path: '.env.local'});
const { Pool } = require('pg');

const devPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const prodPool = new Pool({ connectionString: process.env.PROD_DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function syncTenant2() {
  const dev = await devPool.connect();
  const prod = await prodPool.connect();
  
  try {
    await dev.query('BEGIN');
    console.log("Syncing Tenant 2 from Prod to Dev...");

    async function syncTable(tableName, pkColumns) {
      console.log(`Syncing ${tableName}...`);
      const res = await prod.query(`SELECT * FROM ${tableName} WHERE tenant_id = 2`);
      if (res.rows.length === 0) return;
      
      const columns = Object.keys(res.rows[0]);
      
      for (const row of res.rows) {
        const values = columns.map(c => row[c]);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        
        const updateSet = columns
          .filter(c => !pkColumns.includes(c))
          .map(c => `${c} = EXCLUDED.${c}`)
          .join(', ');
          
        const conflictClause = pkColumns.length > 0 && updateSet.length > 0
          ? `ON CONFLICT (${pkColumns.join(', ')}) DO UPDATE SET ${updateSet}`
          : (pkColumns.length > 0 ? `ON CONFLICT (${pkColumns.join(', ')}) DO NOTHING` : '');
          
        const query = `
          INSERT INTO ${tableName} (${columns.join(', ')})
          VALUES (${placeholders})
          ${conflictClause}
        `;
        
        await dev.query(query, values);
      }
    }

    await syncTable('ingredients', ['ingredient_code', 'tenant_id']);
    await syncTable('doughs', ['dough_id', 'ingredient_code', 'tenant_id']);
    await syncTable('sub_doughs', ['dough_id']); 
    await syncTable('sub_dough_ingredients', ['dough_id', 'ingredient_code']);
    
    await syncTable('products', ['product_code', 'tenant_id']);
    await syncTable('product_doughs', ['product_code', 'dough_code', 'tenant_id']);
    await syncTable('product_ingredients', ['product_code', 'ingredient_code', 'tenant_id']);
    await syncTable('product_aliases', ['alias_code', 'tenant_id']);

    await dev.query('COMMIT');
    console.log("Sync complete!");
  } catch (err) {
    await dev.query('ROLLBACK');
    console.error("Sync failed:", err);
  } finally {
    dev.release();
    prod.release();
    devPool.end();
    prodPool.end();
  }
}

syncTenant2();
