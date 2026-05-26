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
    
    // 月間集計：材料ごとの合計使用量と原価
    const totals = await db.all(`
      SELECT 
        u.ingredient_code, 
        u.ingredient_name, 
        SUM(u.used_weight_grams) as total_grams,
        MAX(i.purchase_weight) as purchase_weight,
        MAX(i.purchase_price) as purchase_price
      FROM ingredient_usages u
      LEFT JOIN ingredients i ON u.ingredient_code = i.ingredient_code
      WHERE u.target_date LIKE ? AND u.store_id = ?
      GROUP BY u.ingredient_code, u.ingredient_name
      ORDER BY total_grams DESC
    `, [`${month}-%`, storeId]);

    // 日別の使用履歴（詳細を確認したい時用、Excel出力用）
    const history = await db.all(`
      SELECT target_date, batch_id, ingredient_name, used_weight_grams
      FROM ingredient_usages
      WHERE target_date LIKE ? AND store_id = ?
      ORDER BY target_date DESC, batch_id ASC
    `, [`${month}-%`, storeId]);

    // 月間の売上サマリー（受注データから計算）
    const salesSummaryRow = await db.get(`
      SELECT 
        SUM(o.quantity * COALESCE(p.retail_price, 0)) as total_retail_sales,
        SUM(o.quantity * COALESCE(p.wholesale_price, 0)) as total_wholesale_sales
      FROM orders o
      LEFT JOIN products p ON o.product_code = p.product_code
      WHERE o.order_date LIKE ? AND o.store_id = ?
    `, [`${month}-%`, storeId]);

    const salesSummary = {
      total_retail_sales: Number(salesSummaryRow?.total_retail_sales) || 0,
      total_wholesale_sales: Number(salesSummaryRow?.total_wholesale_sales) || 0
    };

    return NextResponse.json({ success: true, month, totals, history, salesSummary });
  } catch (error) {
    console.error('Error fetching report:', error);
    return NextResponse.json({ error: '集計データの取得に失敗しました' }, { status: 500 });
  }
}
