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

    const db = await getDb();

    // 取込先の店舗を決定（店舗ロス管理者は自店舗のみ。統括管理者はヘッダーで選択した自社の店舗）
    const resolved = await resolveLossStoreId(db, user);
    if (resolved.error) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    const effectiveStoreId = resolved.storeId;

    // 所属企業（tenant_id）を特定
    let tenantId: number | null = user.tenant_id ? Number(user.tenant_id) : null;
    if (!tenantId && effectiveStoreId) {
      const storeRow = await db.get('SELECT tenant_id FROM stores WHERE id = ?', [effectiveStoreId]);
      if (storeRow?.tenant_id) tenantId = Number(storeRow.tenant_id);
    }
    if (!tenantId) {
      return NextResponse.json({ error: '店舗の所属企業が特定できません。' }, { status: 400 });
    }

    // 自社の販売商品マスタ（store_products）を取得
    const masterProducts = await db.all(
      `SELECT product_code, product_name
       FROM store_products
       WHERE tenant_id = ?`,
      [tenantId]
    );

    if (!masterProducts || masterProducts.length === 0) {
      return NextResponse.json(
        {
          error: '販売商品マスタが未登録です。',
          details: '先に企業ロス統括管理者の「販売商品マスタ設定」から対象商品を登録してください。',
        },
        { status: 400 }
      );
    }

    // 商品名 -> 販売商品マスタの product_code のマップを作成
    const masterNameToCode = new Map<string, string>();
    for (const mp of masterProducts) {
      masterNameToCode.set(String(mp.product_name).trim(), String(mp.product_code).trim());
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

    // 各日の「個数」列（F=1日目, L=2日目, R=3日目 ... 6列おき）
    const DAY_COLUMNS = ['F', 'L', 'R', 'X', 'AD', 'AJ', 'AP'];
    const matchedOrders: { date: string; productCode: string; productName: string; quantity: number }[] = [];
    const matchedProductNames = new Set<string>();
    const skippedProductNames = new Set<string>();

    for (let diffDays = 0; diffDays < 7; diffDays++) {
      const targetColName = DAY_COLUMNS[diffDays];
      const dateStr = formatDate(diffDays);

      for (let i = 4; i <= 1229; i++) {
        const productCell = worksheet['C' + i];
        const orderCell = worksheet[targetColName + i];

        const rawName = productCell ? String(productCell.v ?? '').trim() : '';
        const orderQuantity = orderCell ? orderCell.v : 0;

        if (rawName && typeof orderQuantity === 'number' && orderQuantity > 0) {
          const masterCode = masterNameToCode.get(rawName);
          if (masterCode) {
            matchedOrders.push({
              date: dateStr,
              productCode: masterCode,
              productName: rawName,
              quantity: Math.round(orderQuantity),
            });
            matchedProductNames.add(rawName);
          } else {
            // 販売商品マスタに存在しない商品は読み込まない（スキップ）
            skippedProductNames.add(rawName);
          }
        }
      }
    }

    if (matchedOrders.length === 0) {
      return NextResponse.json(
        {
          error: '販売商品マスタに一致する発注商品が1件も見つかりませんでした。',
          details:
            skippedProductNames.size > 0
              ? `オーダー表には ${skippedProductNames.size} 品目の発注がありましたが、すべて販売商品マスタに未登録でした（例: ${Array.from(skippedProductNames).slice(0, 5).join('、')}）。`
              : '発注数（1個以上）が入力された行が見つかりませんでした。',
        },
        { status: 400 }
      );
    }

    await db.transactionWithUser(user.id, effectiveStoreId, user.role, async (txDb) => {
      // 対象の7日間だけ、この店舗の販売オーダーを入れ替える
      for (let offset = 0; offset < 7; offset++) {
        await txDb.run(
          `DELETE FROM store_sales_orders WHERE store_id = ? AND order_date = ?`,
          [effectiveStoreId, formatDate(offset)]
        );
      }

      // 同じ日・同じ商品コードが複数行あった場合に合算して登録
      const aggregated = new Map<string, { date: string; productCode: string; productName: string; quantity: number }>();
      for (const o of matchedOrders) {
        const key = `${o.date}__${o.productCode}`;
        const existing = aggregated.get(key);
        if (existing) {
          existing.quantity += o.quantity;
        } else {
          aggregated.set(key, { ...o });
        }
      }

      for (const o of aggregated.values()) {
        await txDb.run(
          `INSERT INTO store_sales_orders (store_id, order_date, product_code, product_name, quantity)
           VALUES (?, ?, ?, ?, ?)`,
          [effectiveStoreId, o.date, o.productCode, o.productName, o.quantity]
        );
      }
    });

    return NextResponse.json({
      success: true,
      message: 'データの保存に成功しました。',
      ordersCount: matchedOrders.length,
      productsCount: matchedProductNames.size,
      skippedProductsCount: skippedProductNames.size,
      skippedSample: Array.from(skippedProductNames).slice(0, 5),
    });
  } catch (error: any) {
    console.error('Import weekly orders error:', error);
    return NextResponse.json(
      { error: 'データの保存に失敗しました。', details: error.message },
      { status: 500 }
    );
  }
}
