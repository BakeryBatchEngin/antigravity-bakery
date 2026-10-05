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
    
    // 含まれる全ての日付を抽出
    const uniqueDates = Array.from(new Set(breakdowns.map((b: any) => b.order_date).filter(Boolean))) as string[];
    if (uniqueDates.length === 0) {
      return NextResponse.json({ error: '日付データが含まれていません' }, { status: 400 });
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

    let count = 0;

    await db.transactionWithUser(user.id, storeId, user.role, async (txDb) => {
      console.time('order_breakdowns_bulk_processing');
      
      // ===== 1. エイリアス（別名）マスタの事前一括取得 =====
      // orders側と同様に内訳データ側でも product_code のエイリアス置換を行わないと不整合が起きる
      const rawProductCodes = [...new Set(breakdowns.map((b: any) => b.product_code).filter(Boolean))];
      const aliasMap = new Map<string, string>(); // alias_code -> master product_code
      
      if (rawProductCodes.length > 0) {
        const placeholders = rawProductCodes.map(() => '?').join(',');
        const tenantId = user.role === 'super_admin' ? null : user.tenant_id;
        
        let aliasQuery = '';
        let aliasParams = [];
        if (tenantId) {
          aliasQuery = `SELECT a.alias_code, p.product_code FROM product_aliases a JOIN products p ON a.product_code = p.product_code WHERE a.alias_code IN (${placeholders}) AND a.tenant_id = ?`;
          aliasParams = [...rawProductCodes, tenantId];
        } else {
          aliasQuery = `SELECT a.alias_code, p.product_code FROM product_aliases a JOIN products p ON a.product_code = p.product_code WHERE a.alias_code IN (${placeholders})`;
          aliasParams = [...rawProductCodes];
        }
        
        const aliasRecords = await txDb.all(aliasQuery, aliasParams);
        aliasRecords.forEach((row: any) => {
          aliasMap.set(row.alias_code, row.product_code);
        });
      }

      // ===== 2. 既存内訳データの一括ロード =====
      const datePlaceholders = uniqueDates.map(() => '?').join(',');
      const existingBreakdowns = await txDb.all(
        `SELECT order_date, product_code, customer_name, dept_name, display_name, quantity FROM order_breakdowns WHERE store_id = ? AND order_date IN (${datePlaceholders})`,
        [storeId, ...uniqueDates]
      );

      // 合算用 Map: キー = "YYYY-MM-DD_商品コード_表示名"
      const mergedMap = new Map<string, any>();
      
      if (mode !== 'replace') {
         existingBreakdowns.forEach((row: any) => {
            const key = `${row.order_date}_${row.product_code}_${row.display_name}`;
            mergedMap.set(key, {
               order_date: row.order_date,
               product_code: row.product_code,
               customer_name: row.customer_name,
               dept_name: row.dept_name,
               display_name: row.display_name,
               quantity: Number(row.quantity) || 0,
               is_new: false
            });
         });
      }

      // ===== 3. 新規内訳の合算 =====
      for (const bd of breakdowns) {
         let pCode = bd.product_code || '';
         if (pCode && aliasMap.has(pCode)) {
           pCode = aliasMap.get(pCode)!;
         }

         const key = `${bd.order_date}_${pCode}_${bd.display_name}`;
         if (mergedMap.has(key)) {
            const existing = mergedMap.get(key);
            existing.quantity += (Number(bd.quantity) || 0);
            existing.is_new = true;
         } else {
            mergedMap.set(key, {
               order_date: bd.order_date,
               product_code: pCode,
               customer_name: bd.customer_name,
               dept_name: bd.dept_name,
               display_name: bd.display_name,
               quantity: Number(bd.quantity) || 0,
               is_new: true
            });
         }
      }

      const toInsertData = Array.from(mergedMap.values());
      toInsertData.forEach(item => {
          if (item.is_new) count++;
      });

      // ===== 4. DELETE & バルクINSERT =====
      if (toInsertData.length > 0 || mode === 'replace') {
         await txDb.run(`DELETE FROM order_breakdowns WHERE store_id = ? AND order_date IN (${datePlaceholders})`, [storeId, ...uniqueDates]);
         
         const chunkSize = 200;
         for (let i = 0; i < toInsertData.length; i += chunkSize) {
            const chunk = toInsertData.slice(i, i + chunkSize);
            const valuePlaceholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
            const flatValues = chunk.flatMap(item => [
                storeId,
                item.order_date,
                item.product_code,
                item.customer_name,
                item.dept_name,
                item.display_name,
                item.quantity
            ]);
            await txDb.run(`
               INSERT INTO order_breakdowns (store_id, order_date, product_code, customer_name, dept_name, display_name, quantity)
               VALUES ${valuePlaceholders}
            `, flatValues);
         }
      }
      console.timeEnd('order_breakdowns_bulk_processing');
    });

    return NextResponse.json({ success: true, count });
  } catch (error: any) {
    console.error('Failed to save order breakdowns:', error);
    return NextResponse.json(
      { error: '内訳データの保存に失敗しました', details: error.message || String(error) },
      { status: 500 }
    );
  }
}
