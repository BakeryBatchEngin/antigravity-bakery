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
    const resolved = await resolveLossStoreId(db, user);
    if (resolved.error) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    const storeId = resolved.storeId;

    // 店舗の所属企業（tenant_id）を取得し、販売商品マスタ情報（カテゴリー・特性・価格）を引けるようにする
    const storeRow = await db.get('SELECT tenant_id FROM stores WHERE id = $1', [storeId]);
    const tenantId = storeRow?.tenant_id || user.tenant_id || null;

    const masterMap = new Map<string, any>();
    if (tenantId) {
      const masterRows = await db.all(
        `SELECT product_code, product_name, retail_price, category, characteristics
         FROM store_products
         WHERE tenant_id = $1`,
        [tenantId]
      );
      for (const m of masterRows) {
        masterMap.set(m.product_code, m);
      }
    }

    // 1. その日の販売オーダー（ロス管理専用）から商品ごとの発注数を取得
    const orders = await db.all(
      `SELECT 
         product_code, 
         MAX(product_name) as product_name, 
         SUM(quantity) as order_quantity 
       FROM store_sales_orders 
       WHERE store_id = $1 AND order_date = $2
       GROUP BY product_code
       ORDER BY product_code`,
      [storeId, targetDate]
    );

    // 2. すでに登録されているロス記録があれば取得
    const wasteRecords = await db.all(
      `SELECT product_code, product_name, waste_count, sold_out_time, comment, delivery_diff, sample_count
       FROM waste_records
       WHERE store_id = $1 AND target_date = $2`,
      [storeId, targetDate]
    );

    const wasteMap = new Map();
    for (const w of wasteRecords) {
      wasteMap.set(w.product_code, w);
    }

    // 3. マージする
    const productCodes = new Set([
      ...orders.map((o: any) => o.product_code),
      ...wasteRecords.map((w: any) => w.product_code),
    ]);

    const results = Array.from(productCodes).map(code => {
      const order = orders.find((o: any) => o.product_code === code);
      const waste = wasteMap.get(code);
      const master = masterMap.get(code);

      return {
        productCode: code,
        productName: master?.product_name || order?.product_name || waste?.product_name || '（名称不明）',
        orderQuantity: Number(order?.order_quantity || 0),
        wasteCount: Number(waste?.waste_count || 0),
        soldOutTime: waste?.sold_out_time || '',
        comment: waste?.comment || '',
        deliveryDiff: Number(waste?.delivery_diff || 0),
        sampleCount: Number(waste?.sample_count || 0),
        category: master?.category || '',
        characteristics: master?.characteristics || '',
      };
    });

    return NextResponse.json({ records: results, storeId });
  } catch (error: any) {
    console.error('Error fetching waste targets:', error);
    return NextResponse.json(
      { error: 'データの取得に失敗しました', details: error.message },
      { status: 500 }
    );
  }
}
