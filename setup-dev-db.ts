import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  try {
    const { initDb } = await import('./src/lib/db');
    console.log('Using DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 40) + '...');
    console.log('Initializing dev database...');
    await initDb();
    console.log('Init DB Success!');
  } catch (error) {
    console.error('Failed to init DB:', error);
  }
}

main();
