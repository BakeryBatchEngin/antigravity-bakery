import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    if (!month) {
      return NextResponse.json({ error: '月が指定されていません' }, { status: 400 });
    }

    const cookieStore = await cookies();

    // セッション認証
    const sessionCookie = cookieStore.get('bakery_session');
    if (!sessionCookie?.value) return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    try {
      JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
    } catch {
      return NextResponse.json({ error: '無効なセッション' }, { status: 401 });
    }

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

    // 2. Fetch all executed batch IDs for the month (Ingredient Usages)
    const executedRows = await db.all(`
      SELECT DISTINCT target_date, batch_id
      FROM ingredient_usages
      WHERE target_date LIKE ? AND store_id = ?
    `, [`${month}-%`, storeId]);
    
    // Create a Set of "YYYY-MM-DD:batch_id" to ensure we only count executed batches for their specific day
    const executedSet = new Set(executedRows.map((r: any) => `${r.target_date}:${r.batch_id}`));

    // 2.5 Fetch all mixing executed batch IDs for the month (Batch Executions)
    const mixingExecutedRows = await db.all(`
      SELECT DISTINCT target_date, batch_id
      FROM batch_executions
      WHERE target_date LIKE ? AND store_id = ?
    `, [`${month}-%`, storeId]);
    const mixingExecutedSet = new Set(mixingExecutedRows.map((r: any) => `${r.target_date}:${r.batch_id}`));

    // 3. Aggregate production quantities and mix counts
    const matrixMap = new Map();
    const dailyExecutedMixCounts: Record<string, number> = {};

    for (const plan of plans) {
      const date = plan.target_date;
      let data;
      try {
        data = JSON.parse(plan.plan_data);
      } catch(e) {
        continue;
      }
      
      const flatBatches = data.flatBatches || [];
      const productBatches = data.flatProductBatches || [];
      
      let mixCount = 0;

      // 生地のミキシングバッチで、ミキシング実行済みのものをカウント
      for (const b of flatBatches) {
        if (mixingExecutedSet.has(`${date}:${b.id}`)) {
          mixCount++;
        }
      }

      for (const pb of productBatches) {
        // 商品のミキシングバッチで、副材料があり、かつミキシング実行済みのものをカウント
        if (pb.baseIngredients && pb.baseIngredients.length > 0) {
          if (mixingExecutedSet.has(`${date}:${pb.id}`)) {
            mixCount++;
          }
        }

        const parts = pb.id.split('-');
        // PM-MH00010014-1 -> parts[1] is MH00010014
        // For ADD-P-..., pb.productCode is directly available.
        const pCode = pb.productCode || (parts.length > 1 ? parts[1] : 'UNKNOWN'); 
        
        if (!matrixMap.has(pCode)) {
          matrixMap.set(pCode, {
            productCode: pCode,
            productName: pb.productName,
            dailyCounts: {}
          });
        }

        if (executedSet.has(`${date}:${pb.id}`)) {
          // 再仕込みの場合は生産実績に加算しない
          if (!pb.isRemake) {
            const item = matrixMap.get(pCode);
            if (!item.dailyCounts[date]) item.dailyCounts[date] = 0;
            item.dailyCounts[date] += (pb.currentBatchQuantity || 0);
          }
        }
      }
      
      dailyExecutedMixCounts[date] = mixCount;
    }

    const records = Array.from(matrixMap.values()).sort((a, b) => a.productCode.localeCompare(b.productCode));

    return NextResponse.json({ records, dailyMixCounts: dailyExecutedMixCounts });
  } catch (error) {
    console.error('Error fetching production report:', error);
    return NextResponse.json({ error: '生産実績の取得に失敗しました' }, { status: 500 });
  }
}
