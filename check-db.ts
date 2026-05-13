import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const { getDb } = require('./src/lib/db');

async function check() {
  const db = await getDb();
  
  const orders = await db.all('SELECT count(*) as c FROM orders');
  const products = await db.all('SELECT count(*) as c FROM products');
  const doughs = await db.all('SELECT count(*) as c FROM doughs');
  const ingredients = await db.all('SELECT count(*) as c FROM ingredients');
  const productDoughs = await db.all('SELECT count(*) as c FROM product_doughs');
  const breakdowns = await db.all('SELECT count(*) as c FROM order_breakdowns');
  
  console.log('--- DB Record Counts ---');
  console.log('orders:', orders[0].c);
  console.log('products:', products[0].c);
  console.log('doughs:', doughs[0].c);
  console.log('ingredients:', ingredients[0].c);
  console.log('product_doughs:', productDoughs[0].c);
  console.log('order_breakdowns:', breakdowns[0].c);
  
  // order_breakdowns の先頭1件
  if (breakdowns[0].c > 0) {
    const ob = await db.all('SELECT * FROM order_breakdowns LIMIT 1');
    console.log('sample breakdown:', ob[0]);
  }
  
  process.exit(0);
}

check().catch(console.error);
