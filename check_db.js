require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function check() {
  try {
    const res = await pool.query("SELECT * FROM sub_doughs WHERE dough_id = 'D008'");
    console.log("sub_doughs:");
    console.log(res.rows);

    const res2 = await pool.query("SELECT * FROM sub_dough_ingredients WHERE dough_id = 'D008'");
    console.log("sub_dough_ingredients:");
    console.log(res2.rows);

  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
check();
