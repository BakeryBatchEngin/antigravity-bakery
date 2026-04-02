import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // e.g., '2026-03'
    if (!month) {
      return NextResponse.json({ error: '月が指定されていません' }, { status: 400 });
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
      WHERE u.target_date LIKE ?
      GROUP BY u.ingredient_code, u.ingredient_name
      ORDER BY total_grams DESC
    `, [`${month}-%`]);

    // 日別の使用履歴（詳細を確認したい時用、Excel出力用）
    const history = await db.all(`
      SELECT target_date, batch_id, ingredient_name, used_weight_grams
      FROM ingredient_usages
      WHERE target_date LIKE ?
      ORDER BY target_date DESC, batch_id ASC
    `, [`${month}-%`]);

    return NextResponse.json({ success: true, month, totals, history });
  } catch (error) {
    console.error('Error fetching report:', error);
    return NextResponse.json({ error: '集計データの取得に失敗しました' }, { status: 500 });
  }
}
