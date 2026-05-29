import { db } from './src/lib/db.js';

async function main() {
  try {
    const dates = await db.all('SELECT order_date, COUNT(*) as c FROM order_breakdowns GROUP BY order_date');
    console.log('Dates:', dates);

    const may21 = await db.all("SELECT * FROM order_breakdowns WHERE order_date = '2026-05-21'");
    console.log('May 21 Count:', may21.length);
    if (may21.length > 0) {
      console.log('Sample:', may21[0]);
    }
  } catch(e) {
    console.error(e);
  }
}
main();
