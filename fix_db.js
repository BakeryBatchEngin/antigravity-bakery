require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function fix() {
  try {
    await pool.query("DELETE FROM doughs WHERE bakers_percent IS NULL");
    console.log("Deleted invalid sub_dough entries from doughs table.");
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
fix();
