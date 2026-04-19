import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET: 指定した日付・商品コードの発注元内訳を取得する
 * クエリパラメータ: ?date=YYYY-MM-DD&product_code=XXX
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const productCode = searchParams.get('product_code');

    if (!date || !productCode) {
      return NextResponse.json(
        { error: 'date と product_code は必須です' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const rows = await db.all(
      `SELECT display_name, customer_name, dept_name, quantity
       FROM order_breakdowns
       WHERE order_date = ? AND product_code = ?
       ORDER BY display_name ASC`,
      [date, productCode]
    );

    return NextResponse.json({ success: true, breakdowns: rows });
  } catch (error) {
    console.error('Failed to fetch order breakdowns:', error);
    return NextResponse.json(
      { error: '内訳データの取得に失敗しました' },
      { status: 500 }
    );
  }
}

/**
 * POST: 発注元内訳データを一括保存する
 * ボディ: { breakdowns: BreakdownItem[], mode: 'replace' | 'append' }
 *
 * mode = 'replace': 同じ日付のデータを全削除してから保存
 * mode = 'append' : 同じ日付 + 同じ商品 + 同じ発注元があれば上書き、なければ追加
 */
export async function POST(request: Request) {
  try {
    const { breakdowns, mode } = await request.json();

    if (!Array.isArray(breakdowns) || breakdowns.length === 0) {
      // 内訳が空でも正常終了（内訳なしのオーダーもある）
      return NextResponse.json({ success: true, count: 0 });
    }

    const orderDate = breakdowns[0].order_date;
    const db = await getDb();

    // replace モードの場合は同じ日付の内訳を全消去
    if (mode === 'replace') {
      await db.run('DELETE FROM order_breakdowns WHERE order_date = ?', [orderDate]);
    }

    let count = 0;
    for (const bd of breakdowns) {
      if (mode === 'append') {
        // 同じ日付・商品・発注元の行があれば削除してから再挿入（上書き）
        await db.run(
          `DELETE FROM order_breakdowns
           WHERE order_date = ? AND product_code = ? AND display_name = ?`,
          [bd.order_date, bd.product_code, bd.display_name]
        );
      }

      await db.run(
        `INSERT INTO order_breakdowns
           (order_date, product_code, customer_name, dept_name, display_name, quantity)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          bd.order_date,
          bd.product_code,
          bd.customer_name,
          bd.dept_name,
          bd.display_name,
          bd.quantity,
        ]
      );
      count++;
    }

    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error('Failed to save order breakdowns:', error);
    return NextResponse.json(
      { error: '内訳データの保存に失敗しました' },
      { status: 500 }
    );
  }
}
