import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

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

    // 基本的に同じ日付のはずなので、1件目の日付を基準とする
    const orderDate = orders[0].orderDate || new Date().toISOString().split('T')[0];
    const db = await getDb();

    // モード: check（同一日付のオーダーが存在するか確認）
    if (mode === 'check') {
      const row = await db.get('SELECT COUNT(*) as count FROM orders WHERE order_date = ?', [orderDate]);
      return NextResponse.json({ exists: row.count > 0 });
    }

    // モード: replace（同一日付のオーダーをすべて削除してから追加）
    if (mode === 'replace') {
      await db.run('DELETE FROM orders WHERE order_date = ?', [orderDate]);
    }

    let insertedCount = 0;
    let updatedCount = 0;

    for (const order of orders) {
      const dateToSave = order.orderDate || orderDate;
      const storeName = order.customerName || '不明な店舗';
      const deliveryShift = order.deliveryShift !== undefined ? order.deliveryShift : '';
      const productCode = order.productKey || '';
      const productName = order.productName || '';
      const quantity = Number(order.quantity) || 0;

      // モード: append の場合は、すでに同じ店舗・便・商品のものがあるか確認し、あれば加算する
      if (mode === 'append') {
        const existing = await db.get(
          'SELECT id, quantity FROM orders WHERE order_date = ? AND store_name = ? AND delivery_shift = ? AND product_code = ?',
          [dateToSave, storeName, deliveryShift, productCode]
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
        'INSERT INTO orders (order_date, store_name, delivery_shift, product_code, product_name, quantity) VALUES (?, ?, ?, ?, ?, ?)',
        [dateToSave, storeName, deliveryShift, productCode, productName, quantity]
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
  } catch (error) {
    console.error('Error saving orders:', error);
    return NextResponse.json({ error: 'データベースへの保存に失敗しました' }, { status: 500 });
  }
}
