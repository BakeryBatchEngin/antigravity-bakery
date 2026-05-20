import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
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

    // ===== 関所ロジック：セッションと店舗権限をチェックする =====
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('bakery_session');
    if (!sessionCookie || !sessionCookie.value) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    let user: any;
    try {
      user = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
    } catch (e) {
      return NextResponse.json({ error: '無効なセッションです' }, { status: 401 });
    }

    const db = await getDb();
    const storeCookie = cookieStore.get('active_store_id');
    const requestedStoreId = storeCookie ? Number(storeCookie.value) : null;
    let storeId: number | null = null;

    if (['admin', 'master', 'manager'].includes(user.role)) {
      storeId = requestedStoreId;
    } else if (user.role === 'chef') {
      const userStores = await db.all('SELECT store_id FROM user_stores WHERE user_id = ?', [user.id]);
      if (!userStores || userStores.length === 0) {
        return NextResponse.json({ error: '所属店舗が設定されていません。管理者に連絡してください。' }, { status: 403 });
      }
      const allowedStoreIds = userStores.map((row: any) => Number(row.store_id));
      if (requestedStoreId !== null && allowedStoreIds.includes(requestedStoreId)) {
        storeId = requestedStoreId;
      } else {
        storeId = allowedStoreIds[0];
      }
    } else {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    if (!storeId) return NextResponse.json({ error: '店舗が選択されていません' }, { status: 400 });
    // ===== 関所ここまで =====

    const rows = await db.all(
      `SELECT display_name, customer_name, dept_name, quantity
       FROM order_breakdowns
       WHERE store_id = ? AND order_date = ? AND product_code = ?
       ORDER BY display_name ASC`,
      [storeId, date, productCode]
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

    // ===== 関所ロジック：セッションと店舗権限をチェックする =====
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('bakery_session');
    if (!sessionCookie || !sessionCookie.value) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    let user: any;
    try {
      user = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
    } catch (e) {
      return NextResponse.json({ error: '無効なセッションです' }, { status: 401 });
    }

    const db = await getDb();
    const storeCookie = cookieStore.get('active_store_id');
    const requestedStoreId = storeCookie ? Number(storeCookie.value) : null;
    let storeId: number | null = null;

    if (['admin', 'master', 'manager'].includes(user.role)) {
      storeId = requestedStoreId;
    } else if (user.role === 'chef') {
      const userStores = await db.all('SELECT store_id FROM user_stores WHERE user_id = ?', [user.id]);
      if (!userStores || userStores.length === 0) {
        return NextResponse.json({ error: '所属店舗が設定されていません。管理者に連絡してください。' }, { status: 403 });
      }
      const allowedStoreIds = userStores.map((row: any) => Number(row.store_id));
      if (requestedStoreId !== null && allowedStoreIds.includes(requestedStoreId)) {
        storeId = requestedStoreId;
      } else {
        storeId = allowedStoreIds[0];
      }
    } else {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    if (!storeId) return NextResponse.json({ error: '店舗が選択されていません' }, { status: 400 });
    // ===== 関所ここまで =====

    // replace モードの場合は同じ日付の内訳を全消去
    if (mode === 'replace') {
      await db.run('DELETE FROM order_breakdowns WHERE store_id = ? AND order_date = ?', [storeId, orderDate]);
    }

    let count = 0;
    for (const bd of breakdowns) {
      if (mode === 'append') {
        const existing = await db.get(
          `SELECT id, quantity FROM order_breakdowns
           WHERE store_id = ? AND order_date = ? AND product_code = ? AND display_name = ?`,
          [storeId, bd.order_date, bd.product_code, bd.display_name]
        );

        if (existing) {
          await db.run(
            `UPDATE order_breakdowns SET quantity = quantity + ? WHERE id = ?`,
            [bd.quantity, existing.id]
          );
          count++;
          continue; // UPDATEしたのでINSERTはスキップ
        }
      }

      await db.run(
        `INSERT INTO order_breakdowns
           (store_id, order_date, product_code, customer_name, dept_name, display_name, quantity)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          storeId,
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
  } catch (error: any) {
    console.error('Failed to save order breakdowns:', error);
    return NextResponse.json(
      { error: '内訳データの保存に失敗しました', details: error.message || String(error) },
      { status: 500 }
    );
  }
}
