import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { resolveLossStoreId } from '@/lib/lossStore';
import * as XLSX from 'xlsx';

export async function POST(req: Request) {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証エラー：ログイン情報が見つかりません。' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'ファイルが提供されていません。' }, { status: 400 });
    }

    // ArrayBufferに変換してXLSXで読み込み
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const f2Cell = worksheet['F2'];
    const f2Val = f2Cell ? f2Cell.v : null;
    
    if (!f2Val) throw new Error('F2セルに基準となる日付が見つかりません。');

    // F2セルから日付（年・月・日）をタイムゾーンの誤差なく解析
    let startYear = 0;
    let startMonth = 0;
    let startDay = 0;

    if (typeof f2Val === 'number') {
      const parsed = XLSX.SSF.parse_date_code(f2Val);
      if (parsed && parsed.y) {
        startYear = parsed.y;
        startMonth = parsed.m;
        startDay = parsed.d;
      }
    } else if (f2Val instanceof Date) {
      startYear = f2Val.getFullYear();
      startMonth = f2Val.getMonth() + 1;
      startDay = f2Val.getDate();
    } else {
      const str = String(f2Val).trim();
      const match = str.match(/(\d{4})[^\d]+(\d{1,2})[^\d]+(\d{1,2})/);
      if (match) {
        startYear = parseInt(match[1], 10);
        startMonth = parseInt(match[2], 10);
        startDay = parseInt(match[3], 10);
      }
    }

    if (!startYear || !startMonth || !startDay) {
      throw new Error(`F2セルの日付フォーマットが正しくありません: ${f2Val}`);
    }

    // 日付加算関数（UTCで計算してタイムゾーンのずれを防ぐ）
    const formatDate = (offset: number) => {
      const dt = new Date(Date.UTC(startYear, startMonth - 1, startDay + offset));
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dt.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    // 各日の「個数」列（F=1日目, L=2日目, R=3日目 ... 6列おき。G,M...は金額列なので使わない）
    const DAY_COLUMNS = ['F', 'L', 'R', 'X', 'AD', 'AJ', 'AP'];
    const weeklyOrders: any[] = [];
    const weeklyProducts: any[] = [];
    const productMap = new Map<string, any>();

    for (let diffDays = 0; diffDays < 7; diffDays++) {
      const targetColName = DAY_COLUMNS[diffDays];
      const dateStr = formatDate(diffDays);

      for (let i = 4; i <= 1229; i++) {
        const productCell = worksheet['C' + i];
        const priceCell = worksheet['D' + i];
        const orderCell = worksheet[targetColName + i];

        const productName = productCell ? productCell.v : null;
        const retailPrice = priceCell ? priceCell.v : 0;
        const orderQuantity = orderCell ? orderCell.v : 0;

        if (productName && typeof orderQuantity === 'number' && orderQuantity > 0) {
          weeklyOrders.push({
            date: dateStr,
            productName: String(productName),
            quantity: orderQuantity,
            rowIdx: i
          });

          if (!productMap.has(String(productName))) {
            productMap.set(String(productName), {
              productName: String(productName),
              retailPrice: typeof retailPrice === 'number' ? retailPrice : 0,
              rowIdx: i
            });
          }
        }
      }
    }
    
    productMap.forEach(p => weeklyProducts.push(p));

    if (weeklyOrders.length === 0) {
      throw new Error('発注（1個以上）が見つかりませんでした。');
    }

    const db = await getDb();
    
    // 取込先の店舗を決定（店舗ロス管理者は自店舗のみ。統括管理者はヘッダーで選択した自社の店舗）
    const resolved = await resolveLossStoreId(db, user);
    if (resolved.error) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    const effectiveStoreId = resolved.storeId;

    await db.transactionWithUser(user.id, effectiveStoreId, user.role, async (txDb) => {
      // 1. 販売店舗専用の商品リスト (store_products) に登録
      // ※ 製造の仕込みマスタ(products)や製造オーダー(orders)には一切書き込まない
      const productNameToCode = new Map<string, string>();

      // この店舗の既存コードから、次の連番を決める (例: SP-0001, SP-0002 ...)
      const existingCodes = await txDb.all(
        'SELECT product_code FROM store_products WHERE store_id = ?',
        [effectiveStoreId]
      );
      let nextSeq = 1;
      for (const row of existingCodes) {
        const m = String(row.product_code).match(/^SP-(\d+)$/);
        if (m) nextSeq = Math.max(nextSeq, parseInt(m[1], 10) + 1);
      }

      for (const p of weeklyProducts) {
        const existingProduct = await txDb.get(
          'SELECT product_code FROM store_products WHERE store_id = ? AND product_name = ?',
          [effectiveStoreId, p.productName]
        );

        let pCode = '';
        if (existingProduct) {
          pCode = existingProduct.product_code;
          // 単価だけ最新に更新
          await txDb.run(
            'UPDATE store_products SET retail_price = ? WHERE store_id = ? AND product_code = ?',
            [p.retailPrice, effectiveStoreId, pCode]
          );
        } else {
          // 新規: 仮の商品コードを発番 (将来、仕込み側の商品コードと連携予定: linked_product_code)
          pCode = `SP-${String(nextSeq).padStart(4, '0')}`;
          nextSeq++;
          await txDb.run(
            'INSERT INTO store_products (tenant_id, store_id, product_code, product_name, retail_price) VALUES (?, ?, ?, ?, ?)',
            [user.tenant_id || null, effectiveStoreId, pCode, p.productName, p.retailPrice]
          );
        }
        productNameToCode.set(p.productName, pCode);
      }

      // 2. 販売オーダー (store_sales_orders) に登録
      // 対象の7日間だけ、この店舗の販売オーダーを入れ替える
      for (let offset = 0; offset < 7; offset++) {
        await txDb.run(
          `DELETE FROM store_sales_orders WHERE store_id = ? AND order_date = ?`,
          [effectiveStoreId, formatDate(offset)]
        );
      }

      for (const o of weeklyOrders) {
        const pCode = productNameToCode.get(o.productName);
        if (!pCode) continue;

        await txDb.run(
          `INSERT INTO store_sales_orders (store_id, order_date, product_code, product_name, quantity)
           VALUES (?, ?, ?, ?, ?)`,
          [effectiveStoreId, o.date, pCode, o.productName, o.quantity]
        );
      }
    });

    return NextResponse.json({ 
      success: true, 
      message: 'データの保存に成功しました。',
      ordersCount: weeklyOrders.length,
      productsCount: weeklyProducts.length
    });
  } catch (error: any) {
    console.error('Import weekly orders error:', error);
    return NextResponse.json({ error: 'データの保存に失敗しました。', details: error.message }, { status: 500 });
  }
}
