import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getDb } from '@/lib/db';

export const XMAS_PRODUCTS = [
  'デリスドゥフランス',
  'リンツァーロール',
  'ブッシュカイザー',
  'ブッシュ エキゾチック',
  'シュトーレン',
  'シュトーレン ハーフ',
];

/**
 * 受注一覧および商品ごとの上限・受注数サマリーの取得
 */
export async function GET(request: Request) {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountIdParam = searchParams.get('account_id');

    const db = await getDb();

    // 1. ユーザーの種別判定と対象テナント
    const isSuperAdmin = user.role === 'super_admin';
    const isAdmin = user.role === 'admin';
    const isManager = user.role === 'xmas_manager';
    const isFactory = user.role === 'xmas_factory';
    const isHeadquarters = user.role === 'xmas_headquarters';
    const isStore = user.role === 'tokyo_store' || user.role === 'regional_store';

    // 2. 店舗アカウント一覧（マネージャー・工場・本部・管理者の切替用）
    let availableAccounts: any[] = [];
    if (isSuperAdmin || isAdmin || isManager || isFactory || isHeadquarters) {
      let accQuery = `
        SELECT id, username, display_name, role 
        FROM xmas_accounts 
        WHERE role IN ('tokyo_store', 'regional_store') AND is_active = true
      `;
      const accParams: any[] = [];
      if (!isSuperAdmin && user.tenant_id) {
        accParams.push(user.tenant_id);
        accQuery += ` AND tenant_id = $${accParams.length}`;
      }
      accQuery += ` ORDER BY role ASC, display_name ASC`;
      availableAccounts = await db.all(accQuery, accParams);
    }

    // 3. 受注データの取得条件
    let ordersQuery = `
      SELECT o.*, a.display_name as store_name, a.role as store_role
      FROM xmas_orders o
      JOIN xmas_accounts a ON o.account_id = a.id
      WHERE 1=1
    `;
    const orderParams: any[] = [];

    if (!isSuperAdmin && user.tenant_id) {
      orderParams.push(user.tenant_id);
      ordersQuery += ` AND o.tenant_id = $${orderParams.length}`;
    }

    if (isStore) {
      // 店舗本人は自分の受注のみ
      orderParams.push(user.id);
      ordersQuery += ` AND o.account_id = $${orderParams.length}`;
    } else if (accountIdParam && accountIdParam !== 'all') {
      // マネージャーや工場が店舗を指定した場合
      orderParams.push(Number(accountIdParam));
      ordersQuery += ` AND o.account_id = $${orderParams.length}`;
    }

    ordersQuery += ` ORDER BY o.delivery_date ASC, o.delivery_time ASC, o.id DESC`;
    const orders = await db.all(ordersQuery, orderParams);

    // 各注文の明細アイテムを取得
    const orderIds = orders.map((o: any) => o.id);
    let itemsByOrderId: Record<number, any[]> = {};
    if (orderIds.length > 0) {
      // パラメータ展開
      const placeholders = orderIds.map((_: any, idx: number) => `$${idx + 1}`).join(',');
      const items = await db.all(
        `SELECT order_id, product_name, quantity FROM xmas_order_items WHERE order_id IN (${placeholders})`,
        orderIds
      );
      items.forEach((item: any) => {
        if (!itemsByOrderId[item.order_id]) itemsByOrderId[item.order_id] = [];
        itemsByOrderId[item.order_id].push(item);
      });
    }

    const ordersWithItems = orders.map((o: any) => ({
      ...o,
      items: itemsByOrderId[o.id] || [],
    }));

    // 4. 商品ごとの最大上限数と現在の全店受注総数を算出
    let limitQuery = `SELECT product_name, max_limit FROM xmas_product_limits WHERE 1=1`;
    const limitParams: any[] = [];
    if (!isSuperAdmin && user.tenant_id) {
      limitParams.push(user.tenant_id);
      limitQuery += ` AND tenant_id = $${limitParams.length}`;
    }
    const limitRows = await db.all(limitQuery, limitParams);
    const limitMap: Record<string, number> = {};
    limitRows.forEach((r: any) => {
      limitMap[r.product_name] = Number(r.max_limit || 0);
    });

    // 現在の受注総数を集計
    let countQuery = `
      SELECT oi.product_name, SUM(oi.quantity) as total_qty
      FROM xmas_order_items oi
      JOIN xmas_orders o ON oi.order_id = o.id
      WHERE 1=1
    `;
    const countParams: any[] = [];
    if (!isSuperAdmin && user.tenant_id) {
      countParams.push(user.tenant_id);
      countQuery += ` AND o.tenant_id = $${countParams.length}`;
    }
    countQuery += ` GROUP BY oi.product_name`;
    const countRows = await db.all(countQuery, countParams);
    const countMap: Record<string, number> = {};
    countRows.forEach((r: any) => {
      countMap[r.product_name] = Number(r.total_qty || 0);
    });

    const productSummaries = XMAS_PRODUCTS.map((prodName) => {
      const currentQty = countMap[prodName] || 0;
      const maxLimit = limitMap[prodName] || 0;
      const isMaxReached = maxLimit > 0 && currentQty >= maxLimit;
      return {
        product_name: prodName,
        current_quantity: currentQty,
        max_limit: maxLimit,
        is_max_reached: isMaxReached,
      };
    });

    // テナントの発注ロック状態を取得
    let isOrderLocked = false;
    if (user.tenant_id) {
      const lockRow = await db.get(
        `SELECT setting_value FROM xmas_settings WHERE tenant_id = $1 AND setting_key = 'is_order_locked'`,
        [user.tenant_id]
      );
      isOrderLocked = lockRow?.setting_value === 'true';
    }

    return NextResponse.json({
      orders: ordersWithItems,
      productSummaries,
      accounts: availableAccounts,
      isOrderLocked,
      currentUser: {
        id: user.id,
        role: user.role,
        displayName: user.displayName,
      },
    });
  } catch (err: any) {
    console.error('Failed to get xmas orders:', err);
    return NextResponse.json({ error: '受注一覧の取得に失敗しました', details: err.message }, { status: 500 });
  }
}

/**
 * 店舗アカウントの発注ロック判定ヘルパー
 * 工場、マネージャー、システム管理者はロック中であっても操作可能
 */
async function isStoreLocked(db: any, tenantId: number | null | undefined, userRole: string): Promise<boolean> {
  if (['xmas_manager', 'xmas_factory', 'admin', 'super_admin'].includes(userRole)) {
    return false;
  }
  if (!tenantId) return false;
  const setting = await db.get(
    `SELECT setting_value FROM xmas_settings WHERE tenant_id = $1 AND setting_key = 'is_order_locked'`,
    [tenantId]
  );
  return setting?.setting_value === 'true';
}

/**
 * 受注の新規登録
 */
export async function POST(request: Request) {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    if (user.role === 'xmas_headquarters') {
      return NextResponse.json({ error: '本部アカウントは閲覧専用のため、登録操作はできません' }, { status: 403 });
    }

    const db = await getDb();

    // ロック判定（店舗アカウントはロック中に新規発注不可）
    if (await isStoreLocked(db, user.tenant_id, user.role)) {
      return NextResponse.json({
        error: '店舗からの新規発注・変更の受付は終了いたしました（12/15締切）。ご注文の修正・追加はマネージャーまたは工場へご連絡ください。'
      }, { status: 403 });
    }

    const body = await request.json();
    const {
      staff_name,
      order_route,
      web_reservation_no,
      payment_status,
      discount_type,
      delivery_date,
      delivery_time,
      customer_name,
      customer_phone,
      memo,
      order_datetime,
      items,
      target_account_id,
    } = body;

    // バリデーション
    if (!staff_name || !order_route || !delivery_date || !delivery_time || !customer_name || !customer_phone) {
      return NextResponse.json({ error: '必須項目が入力されていません' }, { status: 400 });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: '商品を1つ以上選択してください' }, { status: 400 });
    }

    if (order_route === 'ネット予約' && (!web_reservation_no || !/^\d{8}$/.test(web_reservation_no.trim()))) {
      return NextResponse.json({ error: 'ネット予約の場合は8桁の半角数字の予約番号を入力してください' }, { status: 400 });
    }

    // ネット予約の場合は自動で「支払済」にする
    const effectivePaymentStatus = order_route === 'ネット予約' ? '支払済' : (payment_status || 'お渡し支払');

    // 対象アカウントIDの決定
    let effectiveAccountId = user.id;
    if ((user.role === 'xmas_manager' || user.role === 'xmas_factory' || user.role === 'admin' || user.role === 'super_admin') && target_account_id) {
      effectiveAccountId = Number(target_account_id);
    }

    // 対象アカウントのテナントIDを取得
    const targetAccount = await db.get(`SELECT tenant_id FROM xmas_accounts WHERE id = $1`, [effectiveAccountId]);
    if (!targetAccount) {
      return NextResponse.json({ error: '指定された店舗アカウントが存在しません' }, { status: 400 });
    }
    const targetTenantId = targetAccount.tenant_id;

    // 最大受注数（上限）の排他チェック
    for (const item of items) {
      if (!item.product_name || !item.quantity || item.quantity <= 0) continue;
      const limitRow = await db.get(
        `SELECT max_limit FROM xmas_product_limits WHERE tenant_id = $1 AND product_name = $2`,
        [targetTenantId, item.product_name]
      );
      if (limitRow && limitRow.max_limit > 0) {
        const countRow = await db.get(
          `SELECT SUM(oi.quantity) as current_qty
           FROM xmas_order_items oi
           JOIN xmas_orders o ON oi.order_id = o.id
           WHERE o.tenant_id = $1 AND oi.product_name = $2`,
          [targetTenantId, item.product_name]
        );
        const currentQty = Number(countRow?.current_qty || 0);
        if (currentQty + Number(item.quantity) > limitRow.max_limit) {
          return NextResponse.json(
            {
              error: `商品「${item.product_name}」は最大受注上限（${limitRow.max_limit}個）に達しているため、これ以上注文できません。（現在受注数: ${currentQty}個）`,
            },
            { status: 400 }
          );
        }
      }
    }

    // トランザクションで保存
    const effectiveOrderDatetime = order_datetime ? new Date(order_datetime).toISOString() : new Date().toISOString();

    const insertOrderSql = `
      INSERT INTO xmas_orders (
        tenant_id, account_id, order_datetime, staff_name, order_route,
        web_reservation_no, payment_status, discount_type, delivery_date,
        delivery_time, customer_name, customer_phone, memo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
    `;

    // getDb() のラッパー互換で実行
    const result = await db.get(insertOrderSql, [
      targetTenantId,
      effectiveAccountId,
      effectiveOrderDatetime,
      staff_name.trim(),
      order_route,
      order_route === 'ネット予約' ? web_reservation_no.trim() : null,
      effectivePaymentStatus,
      discount_type || 'なし',
      delivery_date,
      delivery_time,
      customer_name.trim(),
      customer_phone.trim(),
      memo ? memo.slice(0, 80) : '',
    ]);

    const orderId = result?.id;
    if (!orderId) {
      throw new Error('受注の登録に失敗しました');
    }

    // 商品明細を保存
    for (const item of items) {
      if (!item.product_name || !item.quantity || item.quantity <= 0) continue;
      await db.run(
        `INSERT INTO xmas_order_items (order_id, product_name, quantity) VALUES ($1, $2, $3)`,
        [orderId, item.product_name, Number(item.quantity)]
      );
    }

    return NextResponse.json({ success: true, orderId, message: '受注を登録しました' });
  } catch (err: any) {
    console.error('Failed to create xmas order:', err);
    return NextResponse.json({ error: '受注の登録に失敗しました', details: err.message }, { status: 500 });
  }
}

/**
 * 受注の更新・修正
 */
export async function PUT(request: Request) {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    if (user.role === 'xmas_headquarters') {
      return NextResponse.json({ error: '本部アカウントは閲覧専用のため、登録操作はできません' }, { status: 403 });
    }

    const body = await request.json();
    const {
      id,
      staff_name,
      order_route,
      web_reservation_no,
      payment_status,
      discount_type,
      delivery_date,
      delivery_time,
      customer_name,
      customer_phone,
      memo,
      order_datetime,
      items,
      target_account_id,
    } = body;

    if (!id) {
      return NextResponse.json({ error: '受注IDが指定されていません' }, { status: 400 });
    }

    const db = await getDb();

    // ロック判定（店舗アカウントはロック中に編集・修正不可）
    if (await isStoreLocked(db, user.tenant_id, user.role)) {
      return NextResponse.json({
        error: '店舗からの新規発注・変更の受付は終了いたしました（12/15締切）。ご注文の修正・追加はマネージャーまたは工場へご連絡ください。'
      }, { status: 403 });
    }

    const existingOrder = await db.get(`SELECT * FROM xmas_orders WHERE id = $1`, [id]);
    if (!existingOrder) {
      return NextResponse.json({ error: '対象の受注が見つかりません' }, { status: 404 });
    }

    // 権限チェック
    const isStore = user.role === 'tokyo_store' || user.role === 'regional_store';
    if (isStore && existingOrder.account_id !== user.id) {
      return NextResponse.json({ error: '他店舗の受注は編集できません' }, { status: 403 });
    }
    if (user.role !== 'super_admin' && existingOrder.tenant_id !== user.tenant_id) {
      return NextResponse.json({ error: '他社の受注は編集できません' }, { status: 403 });
    }

    // 上限チェック（自注文の旧個数を引いて判定）
    if (items && Array.isArray(items)) {
      const oldItems = await db.all(`SELECT product_name, quantity FROM xmas_order_items WHERE order_id = $1`, [id]);
      const oldQtyMap: Record<string, number> = {};
      oldItems.forEach((oi: any) => {
        oldQtyMap[oi.product_name] = Number(oi.quantity || 0);
      });

      for (const item of items) {
        if (!item.product_name || !item.quantity || item.quantity <= 0) continue;
        const limitRow = await db.get(
          `SELECT max_limit FROM xmas_product_limits WHERE tenant_id = $1 AND product_name = $2`,
          [existingOrder.tenant_id, item.product_name]
        );
        if (limitRow && limitRow.max_limit > 0) {
          const countRow = await db.get(
            `SELECT SUM(oi.quantity) as current_qty
             FROM xmas_order_items oi
             JOIN xmas_orders o ON oi.order_id = o.id
             WHERE o.tenant_id = $1 AND oi.product_name = $2`,
            [existingOrder.tenant_id, item.product_name]
          );
          const currentTotal = Number(countRow?.current_qty || 0);
          const oldQty = oldQtyMap[item.product_name] || 0;
          const newTotal = currentTotal - oldQty + Number(item.quantity);

          if (newTotal > limitRow.max_limit) {
            return NextResponse.json(
              {
                error: `商品「${item.product_name}」は最大受注上限（${limitRow.max_limit}個）を超過するため更新できません。（更新後の合計: ${newTotal}個）`,
              },
              { status: 400 }
            );
          }
        }
      }
    }

    const effectivePaymentStatus = order_route === 'ネット予約' ? '支払済' : (payment_status || 'お渡し支払');

    let updateAccountId = existingOrder.account_id;
    if ((user.role === 'xmas_manager' || user.role === 'xmas_factory' || user.role === 'admin' || user.role === 'super_admin') && target_account_id) {
      updateAccountId = Number(target_account_id);
    }

    await db.run(
      `UPDATE xmas_orders SET
        account_id = $1,
        staff_name = $2,
        order_route = $3,
        web_reservation_no = $4,
        payment_status = $5,
        discount_type = $6,
        delivery_date = $7,
        delivery_time = $8,
        customer_name = $9,
        customer_phone = $10,
        memo = $11,
        order_datetime = $12,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $13`,
      [
        updateAccountId,
        staff_name ? staff_name.trim() : existingOrder.staff_name,
        order_route || existingOrder.order_route,
        order_route === 'ネット予約' ? (web_reservation_no ? web_reservation_no.trim() : existingOrder.web_reservation_no) : null,
        effectivePaymentStatus,
        discount_type || existingOrder.discount_type,
        delivery_date || existingOrder.delivery_date,
        delivery_time || existingOrder.delivery_time,
        customer_name ? customer_name.trim() : existingOrder.customer_name,
        customer_phone ? customer_phone.trim() : existingOrder.customer_phone,
        memo !== undefined ? memo.slice(0, 80) : existingOrder.memo,
        order_datetime ? new Date(order_datetime).toISOString() : existingOrder.order_datetime,
        id,
      ]
    );

    // 明細の更新（既存削除して再登録）
    if (items && Array.isArray(items)) {
      await db.run(`DELETE FROM xmas_order_items WHERE order_id = $1`, [id]);
      for (const item of items) {
        if (!item.product_name || !item.quantity || item.quantity <= 0) continue;
        await db.run(
          `INSERT INTO xmas_order_items (order_id, product_name, quantity) VALUES ($1, $2, $3)`,
          [id, item.product_name, Number(item.quantity)]
        );
      }
    }

    return NextResponse.json({ success: true, message: '受注内容を更新しました' });
  } catch (err: any) {
    console.error('Failed to update xmas order:', err);
    return NextResponse.json({ error: '受注の更新に失敗しました', details: err.message }, { status: 500 });
  }
}

/**
 * 受注の削除
 */
export async function DELETE(request: Request) {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    if (user.role === 'xmas_headquarters') {
      return NextResponse.json({ error: '本部アカウントは閲覧専用のため、登録操作はできません' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: '受注IDが指定されていません' }, { status: 400 });
    }

    const db = await getDb();

    // ロック判定（店舗アカウントはロック中に削除不可）
    if (await isStoreLocked(db, user.tenant_id, user.role)) {
      return NextResponse.json({
        error: '店舗からの新規発注・変更の受付は終了いたしました（12/15締切）。ご注文の修正・追加はマネージャーまたは工場へご連絡ください。'
      }, { status: 403 });
    }

    const order = await db.get(`SELECT * FROM xmas_orders WHERE id = $1`, [Number(id)]);
    if (!order) {
      return NextResponse.json({ error: '対象の受注が見つかりません' }, { status: 404 });
    }

    // 権限チェック
    const isStore = user.role === 'tokyo_store' || user.role === 'regional_store';
    if (isStore && order.account_id !== user.id) {
      return NextResponse.json({ error: '他店舗の受注は削除できません' }, { status: 403 });
    }
    if (user.role !== 'super_admin' && order.tenant_id !== user.tenant_id) {
      return NextResponse.json({ error: '他社の受注は削除できません' }, { status: 403 });
    }

    // 明細レコードを明示的に削除してから受注本体を削除
    await db.run(`DELETE FROM xmas_order_items WHERE order_id = $1`, [Number(id)]);
    await db.run(`DELETE FROM xmas_orders WHERE id = $1`, [Number(id)]);

    return NextResponse.json({ success: true, message: '受注を削除しました' });
  } catch (err: any) {
    console.error('Failed to delete xmas order:', err);
    return NextResponse.json({ error: '受注の削除に失敗しました', details: err.message }, { status: 500 });
  }
}
