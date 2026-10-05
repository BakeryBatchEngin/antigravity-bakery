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

    let insertedCount = 0;

    // トランザクションを開始し、セッションに user_id, store_id, role を記録する（監査ログとRLS用）
    await db.transactionWithUser(user.id, storeId, user.role, async (txDb) => {
      
      console.time('order_bulk_processing');
      // ===== 1. 事前一括取得 (バルク取得) =====
      // アップロードされたすべての productCode (alias_code の可能性あり) を抽出
      const rawProductCodes = [...new Set(orders.map((o: any) => o.productKey).filter(Boolean))];
      
      const aliasMap = new Map<string, { product_code: string, product_name: string }>();
      if (rawProductCodes.length > 0) {
        const placeholders = rawProductCodes.map(() => '?').join(',');
        const tenantId = user.role === 'super_admin' ? null : user.tenant_id;
        
        let aliasQuery = '';
        let aliasParams = [];
        if (tenantId) {
          aliasQuery = `SELECT a.alias_code, p.product_code, p.product_name FROM product_aliases a JOIN products p ON a.product_code = p.product_code WHERE a.alias_code IN (${placeholders}) AND a.tenant_id = ?`;
          aliasParams = [...rawProductCodes, tenantId];
        } else {
          aliasQuery = `SELECT a.alias_code, p.product_code, p.product_name FROM product_aliases a JOIN products p ON a.product_code = p.product_code WHERE a.alias_code IN (${placeholders})`;
          aliasParams = [...rawProductCodes];
        }
        
        const aliasRecords = await txDb.all(aliasQuery, aliasParams);
        aliasRecords.forEach((row: any) => {
          aliasMap.set(row.alias_code, { product_code: row.product_code, product_name: row.product_name });
        });
      }

      // ===== 2. 既存オーダーのメモリ上への一括ロード =====
      // uniqueDates に該当するこの店舗のオーダーをすべてロードする
      const datePlaceholders = uniqueDates.map(() => '?').join(',');
      const existingOrders = await txDb.all(
        `SELECT order_date, store_name, delivery_shift, product_code, product_name, quantity FROM orders WHERE store_id = ? AND order_date IN (${datePlaceholders})`,
        [storeId, ...uniqueDates]
      );
      
      // 合算用 Map: キー = "YYYY-MM-DD_店舗名_便名_商品コード"
      const mergedOrdersMap = new Map<string, any>();

      // replaceモードでなければ既存データをMapにセット
      if (mode !== 'replace') {
        existingOrders.forEach((row: any) => {
          const shift = row.delivery_shift || '';
          const key = `${row.order_date}_${row.store_name}_${shift}_${row.product_code}`;
          mergedOrdersMap.set(key, {
            order_date: row.order_date,
            store_name: row.store_name,
            delivery_shift: shift,
            product_code: row.product_code,
            product_name: row.product_name,
            quantity: Number(row.quantity) || 0,
            is_new: false // 既存データ由来
          });
        });
      }

      // ===== 3. 新規オーダーの合算処理 =====
      for (const order of orders) {
        const dateToSave = order.orderDate || uniqueDates[0];
        const storeName = order.customerName || '不明な店舗';
        const deliveryShift = order.deliveryShift !== undefined ? order.deliveryShift : '';
        let productCode = order.productKey || '';
        let productName = order.productName || '';
        const quantity = Number(order.quantity) || 0;

        if (productCode && aliasMap.has(productCode)) {
          const alias = aliasMap.get(productCode)!;
          productCode = alias.product_code;
          productName = alias.product_name;
        }

        const key = `${dateToSave}_${storeName}_${deliveryShift}_${productCode}`;
        
        if (mergedOrdersMap.has(key)) {
          const existing = mergedOrdersMap.get(key);
          existing.quantity += quantity;
          existing.is_new = true; // 今回アップロードされたデータが含まれているため、処理カウントの対象とする
        } else {
          mergedOrdersMap.set(key, {
            order_date: dateToSave,
            store_name: storeName,
            delivery_shift: deliveryShift,
            product_code: productCode,
            product_name: productName,
            quantity: quantity,
            is_new: true
          });
        }
      }

      const toInsertData = Array.from(mergedOrdersMap.values());
      toInsertData.forEach(item => {
          if (item.is_new) insertedCount++;
      });

      // ===== 4. DELETE & バルクINSERT =====
      if (toInsertData.length > 0 || mode === 'replace') {
         // まず、対象日のオーダーを全消去
         await txDb.run(`DELETE FROM orders WHERE store_id = ? AND order_date IN (${datePlaceholders})`, [storeId, ...uniqueDates]);
         
         // チャンク単位で バルクINSERT
         const chunkSize = 200;
         for (let i = 0; i < toInsertData.length; i += chunkSize) {
            const chunk = toInsertData.slice(i, i + chunkSize);
            const valuePlaceholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
            const flatValues = chunk.flatMap(item => [
                storeId,
                item.order_date,
                item.store_name,
                item.delivery_shift,
                item.product_code,
                item.product_name,
                item.quantity
            ]);
            await txDb.run(`
               INSERT INTO orders (store_id, order_date, store_name, delivery_shift, product_code, product_name, quantity)
               VALUES ${valuePlaceholders}
            `, flatValues);
         }
      }
      console.timeEnd('order_bulk_processing');
    });

    const msg = mode === 'replace' 
      ? `指定日の注文データを置き換えました` 
      : `${insertedCount}件のオーダー明細を登録・合算しました`;

    return NextResponse.json({ 
      success: true, 
      message: msg,
      count: insertedCount
    });
  } catch (error: any) {
    console.error('Error saving orders:', error);
    return NextResponse.json({ error: 'データベースへの保存に失敗しました', details: error.message || String(error) }, { status: 500 });
  }
}
