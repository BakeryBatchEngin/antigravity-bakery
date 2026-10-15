import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { resolveLossStoreId } from '@/lib/lossStore';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const targetDate = searchParams.get('date');

    if (!targetDate) {
      return NextResponse.json({ error: '日付が指定されていません。' }, { status: 400 });
    }

    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    }

    const db = await getDb();
    
    // 対象店舗の決定
    // - 店舗ロス管理者などは、自分に紐づく店舗のみ
    // - 企業ロス統括管理者・管理者は、ヘッダーで選択した自社の店舗
    const resolved = await resolveLossStoreId(db, user);
    if (resolved.error) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    const storeId = resolved.storeId;

    // 1. その日の販売オーダー（ロス管理専用）から商品ごとの発注数を取得
    const orders = await db.all(`
      SELECT 
        product_code, 
        MAX(product_name) as product_name, 
        SUM(quantity) as order_quantity 
      FROM store_sales_orders 
      WHERE store_id = $1 AND order_date = $2
      GROUP BY product_code
      ORDER BY product_code
    `, [storeId, targetDate]);

    // 2. すでに登録されているロス記録があれば取得
    const wasteRecords = await db.all(`
      SELECT product_code, waste_count, sold_out_time, comment
      FROM waste_records
      WHERE store_id = $1 AND target_date = $2
    `, [storeId, targetDate]);

    const wasteMap = new Map();
    for (const w of wasteRecords) {
      wasteMap.set(w.product_code, w);
    }

    // 3. マージする
    // オーダーがない場合でもロス記録がある商品を含める（イレギュラーなケース）
    const productCodes = new Set([...orders.map((o: any) => o.product_code), ...wasteRecords.map((w: any) => w.product_code)]);
    
    const results = Array.from(productCodes).map(code => {
      const order = orders.find((o: any) => o.product_code === code);
      const waste = wasteMap.get(code);
      
      return {
        productCode: code,
        productName: order?.product_name || '（名称不明）',
        orderQuantity: order?.order_quantity || 0,
        wasteCount: waste?.waste_count || 0,
        soldOutTime: waste?.sold_out_time || '',
        comment: waste?.comment || ''
      };
    });

    return NextResponse.json({ records: results, storeId });
  } catch (error: any) {
    console.error('Error fetching waste targets:', error);
    return NextResponse.json({ error: 'データの取得に失敗しました', details: error.message }, { status: 500 });
  }
}
