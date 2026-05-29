import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
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

    // オーダー登録済みの日付を取得
    const orderRows = await db.all('SELECT DISTINCT order_date FROM orders WHERE store_id = ?', [storeId]);
    const registeredDates = orderRows.map((row: any) => row.order_date);

    // 仕込みSET済みの日付を取得
    const planRows = await db.all('SELECT DISTINCT target_date FROM daily_production_plans WHERE store_id = ?', [storeId]);
    const setDates = planRows.map((row: any) => row.target_date);

    return NextResponse.json({ success: true, registeredDates, setDates });
  } catch (error: any) {
    console.error('Error fetching dates:', error);
    return NextResponse.json({ error: '日付データの取得に失敗しました', details: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    // 以前はそのまま配列を受け取っていたが、オブジェクトに包んでいない場合にも対応できるようフォールバック
    const isArrayPayload = Array.isArray(payload);
    const orders = isArrayPayload ? payload : payload.orders;
    const mode = isArrayPayload ? 'append' : payload.mode || 'append';

    if (!Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json({ error: '保存するデータがありません' }, { status: 400 });
    }

    // 含まれる全ての日付を抽出
    const uniqueDates = Array.from(new Set(orders.map((o: any) => o.orderDate).filter(Boolean))) as string[];
    if (uniqueDates.length === 0) {
      uniqueDates.push(new Date().toISOString().split('T')[0]);
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
      // 管理者・マスター・マネージャーはクッキーで指定された店舗をそのまま使用
      storeId = requestedStoreId;
    } else if (user.role === 'chef') {
      // シェフは所属店舗のみアクセス可能
      const userStores = await db.all('SELECT store_id FROM user_stores WHERE user_id = ?', [user.id]);
      if (!userStores || userStores.length === 0) {
        return NextResponse.json({ error: '所属店舗が設定されていません。管理者に連絡してください。' }, { status: 403 });
      }
      const allowedStoreIds = userStores.map((row: any) => Number(row.store_id));
      if (requestedStoreId !== null && allowedStoreIds.includes(requestedStoreId)) {
        storeId = requestedStoreId;
      } else {
        // 未指定または不正なIDの場合は所属店舗の1つ目をデフォルトに
        storeId = allowedStoreIds[0];
      }
    } else {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    if (!storeId) return NextResponse.json({ error: '店舗が選択されていません' }, { status: 400 });
    // ===== 関所ここまで =====

    // モード: check（同一日付のオーダーが存在するか確認 ＋ SET済み確認）
    if (mode === 'check') {
      const placeholders = uniqueDates.map(() => '?').join(',');
      
      // 1. SET済み（daily_production_plansに存在するか）チェック
      const planRow = await db.get(`SELECT COUNT(*) as count FROM daily_production_plans WHERE store_id = ? AND target_date IN (${placeholders})`, [storeId, ...uniqueDates]);
      if (planRow && planRow.count > 0) {
        return NextResponse.json({ error: '登録日にSET済みの日付が含まれています。仕込みモードでリセットしてから登録してください。', isSetError: true }, { status: 400 });
      }

      // 2. 既存オーダーデータチェック
      const row = await db.get(`SELECT COUNT(*) as count FROM orders WHERE store_id = ? AND order_date IN (${placeholders})`, [storeId, ...uniqueDates]);
      return NextResponse.json({ exists: row.count > 0 });
    }

    // モード: replace（同一日付のオーダーをすべて削除してから追加）
    if (mode === 'replace') {
      const placeholders = uniqueDates.map(() => '?').join(',');
      await db.run(`DELETE FROM orders WHERE store_id = ? AND order_date IN (${placeholders})`, [storeId, ...uniqueDates]);
    }

    let insertedCount = 0;
    let updatedCount = 0;

    for (const order of orders) {
      const dateToSave = order.orderDate || uniqueDates[0];
      const storeName = order.customerName || '不明な店舗';
      const deliveryShift = order.deliveryShift !== undefined ? order.deliveryShift : '';
      const productCode = order.productKey || '';
      const productName = order.productName || '';
      const quantity = Number(order.quantity) || 0;

      // モード: append の場合は、すでに同じ店舗・便・商品のものがあるか確認し、あれば加算する
      if (mode === 'append') {
        const existing = await db.get(
          'SELECT id, quantity FROM orders WHERE store_id = ? AND order_date = ? AND store_name = ? AND delivery_shift = ? AND product_code = ?',
          [storeId, dateToSave, storeName, deliveryShift, productCode]
        );

        if (existing) {
          await db.run(
            'UPDATE orders SET quantity = quantity + ? WHERE id = ?',
            [quantity, existing.id]
          );
          updatedCount++;
          continue; // すでに更新したため、INSERTはスキップ
        }
      }

      // 存在しない、または replace モードの場合は新規INSERT
      await db.run(
        'INSERT INTO orders (store_id, order_date, store_name, delivery_shift, product_code, product_name, quantity) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [storeId, dateToSave, storeName, deliveryShift, productCode, productName, quantity]
      );
      insertedCount++;
    }

    const msg = mode === 'replace' 
      ? `${insertedCount}件の注文データを置き換えました` 
      : `${insertedCount}件を新規追加、${updatedCount}件を合算更新しました`;

    return NextResponse.json({ 
      success: true, 
      message: msg,
      count: insertedCount + updatedCount
    });
    } catch (error: any) {
    console.error('Error saving orders:', error);
    return NextResponse.json({ error: 'データベースへの保存に失敗しました', details: error.message || String(error) }, { status: 500 });
  }
}
