import { getDb } from './src/lib/db';
import { GET } from './src/app/api/reports/ingredients/export/route';

async function test() {
  const req = new Request('http://localhost:3000/api/reports/ingredients/export?month=2026-06', {
    headers: {
      cookie: 'active_store_id=1;'
    }
  });
  
  try {
    const res = await GET(req);
    console.log(res.status);
    if (!res.ok) {
        console.log(await res.json());
    } else {
        console.log("Success!");
    }
  } catch (e) {
    console.error("Caught error:", e);
  }
}

test();
