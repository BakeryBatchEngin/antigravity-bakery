require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function searchEverythingForD001() {
  const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const res = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
    `);
    
    for (const row of res.rows) {
        const table = row.table_name;
        try {
            const data = await client.query(`SELECT * FROM ${table}`);
            let found = false;
            for (const d of data.rows) {
                if (JSON.stringify(d).includes('D001')) {
                    if (!found) {
                        console.log(`Found D001 in table: ${table}`);
                        found = true;
                    }
                    console.log(`  Row:`, d);
                }
            }
        } catch(e) {}
    }
  } finally {
    client.release();
    pool.end();
  }
}
searchEverythingForD001();
