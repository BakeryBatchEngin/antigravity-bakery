import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // e.g., '2026-03'
    if (!month) {
      return NextResponse.json({ error: '月が指定されていません' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const storeCookie = cookieStore.get('active_store_id');
    const storeId = storeCookie ? Number(storeCookie.value) : null;
    
    if (!storeId) {
      return NextResponse.json({ error: '店舗が選択されていません' }, { status: 400 });
    }

    const db = await getDb();

    // 1. Fetch all production plans for the month
    const plans = await db.all(`
      SELECT target_date, plan_data
      FROM daily_production_plans
      WHERE target_date LIKE ? AND store_id = ?
    `, [`${month}-%`, storeId]);

    // 2. Fetch all executed batch IDs for the month
    const executedRows = await db.all(`
      SELECT DISTINCT target_date, batch_id
      FROM ingredient_usages
      WHERE target_date LIKE ? AND store_id = ?
    `, [`${month}-%`, storeId]);
    
    // Create a Set of "YYYY-MM-DD:batch_id" to ensure we only count executed batches for their specific day
    const executedSet = new Set(executedRows.map((r: any) => `${r.target_date}:${r.batch_id}`));

    // 3. Aggregate production quantities
    const matrixMap = new Map();

    for (const plan of plans) {
      const date = plan.target_date;
      let data;
      try {
        data = JSON.parse(plan.plan_data);
      } catch(e) {
        continue;
      }
      
      const productBatches = data.flatProductBatches || [];

      for (const pb of productBatches) {
        const parts = pb.id.split('-');
        // PM-MH00010014-1 -> parts[1] is MH00010014
        const pCode = parts.length > 1 ? parts[1] : 'UNKNOWN'; 
        
        if (!matrixMap.has(pCode)) {
          matrixMap.set(pCode, {
            productCode: pCode,
            productName: pb.productName,
            dailyCounts: {}
          });
        }

        if (executedSet.has(`${date}:${pb.id}`)) {
          // 実行済みバッチの個数を加算
          const item = matrixMap.get(pCode);
          if (!item.dailyCounts[date]) item.dailyCounts[date] = 0;
          item.dailyCounts[date] += (pb.currentBatchQuantity || 0);
        }
      }
    }

    const records = Array.from(matrixMap.values()).sort((a, b) => a.productCode.localeCompare(b.productCode));

    return NextResponse.json({ records });
  } catch (error) {
    console.error('Error fetching production report:', error);
    return NextResponse.json({ error: '生産実績の取得に失敗しました' }, { status: 500 });
  }
}
