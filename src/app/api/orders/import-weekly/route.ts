import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { resolveLossStoreId } from '@/lib/lossStore';
import { parseOrderSheet } from '@/lib/parseOrderSheet';

// オーダー表（新フォーマット）の取込API
//   mode=preview : ファイルを解析して内容を返す（DBには書き込まない）
//   mode=commit  : 同じファイルを再解析して登録（Excelに載っている日付分を入れ替え）
export async function POST(req: Request) {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証エラー：ログイン情報が見つかりません。' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const mode = String(formData.get('mode') || 'preview');
    if (!file) {
      return NextResponse.json({ error: 'ファイルが提供されていません。' }, { status: 400 });
    }
    if (mode !== 'preview' && mode !== 'commit') {
      return NextResponse.json({ error: '不正なモードです。' }, { status: 400 });
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
    const masterMap = new Map<string, string>();
    for (const mp of masterProducts) {
      masterMap.set(String(mp.product_code).trim(), String(mp.product_name));
    }

    // Excelの解析
    const data = new Uint8Array(await file.arrayBuffer());
    const parsed = parseOrderSheet(data);

    // 商品マスタに存在する商品コードだけに絞り込み（同じコードが複数行あれば合算）
    const aggregated = new Map<string, { productCode: string; productName: string; quantities: number[] }>();
    const skippedCodes = new Set<string>();
    for (const row of parsed.rows) {
      const masterName = masterMap.get(row.productCode);
      if (!masterName) {
        skippedCodes.add(row.productCode);
        continue;
      }
      const existing = aggregated.get(row.productCode);
      if (existing) {
        existing.quantities = existing.quantities.map((q, i) => q + row.quantities[i]);
      } else {
        aggregated.set(row.productCode, {
          productCode: row.productCode,
          productName: masterName,
          quantities: [...row.quantities],
        });
      }
    }
    const rows = Array.from(aggregated.values());

    if (rows.length === 0) {
      return NextResponse.json(
        {
          error: '販売商品マスタに一致する発注商品が1件も見つかりませんでした。',
          details:
            skippedCodes.size > 0
              ? `オーダー表には ${skippedCodes.size} 品目の発注がありましたが、すべて販売商品マスタに未登録でした（例: ${Array.from(skippedCodes).slice(0, 5).join('、')}）。`
              : '発注数（1個以上）が入力された行が見つかりませんでした。',
        },
        { status: 400 }
      );
    }

    // すでにオーダーが登録されている日付を調べる（上書き確認用）
    const existingDates: string[] = [];
    for (const d of parsed.dates) {
      const found = await db.get(
        `SELECT 1 AS found FROM store_sales_orders WHERE store_id = ? AND order_date = ? LIMIT 1`,
        [effectiveStoreId, d.date]
      );
      if (found) existingDates.push(d.date);
    }

    if (mode === 'preview') {
      return NextResponse.json({
        success: true,
        dates: parsed.dates,
        rows,
        existingDates,
        skippedProductsCount: skippedCodes.size,
        skippedSample: Array.from(skippedCodes).slice(0, 5),
        warnings: parsed.warnings,
      });
    }

    // ---- 登録（Excelに載っている日付分だけ入れ替え） ----
    let ordersCount = 0;
    await db.transactionWithUser(user.id, effectiveStoreId, user.role, async (txDb) => {
      for (const d of parsed.dates) {
        await txDb.run(`DELETE FROM store_sales_orders WHERE store_id = ? AND order_date = ?`, [
          effectiveStoreId,
          d.date,
        ]);
      }
      for (const row of rows) {
        for (let i = 0; i < parsed.dates.length; i++) {
          const qty = row.quantities[i];
          if (qty >= 1) {
            await txDb.run(
              `INSERT INTO store_sales_orders (store_id, order_date, product_code, product_name, quantity)
               VALUES (?, ?, ?, ?, ?)`,
              [effectiveStoreId, parsed.dates[i].date, row.productCode, row.productName, qty]
            );
            ordersCount++;
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'データの保存に成功しました。',
      ordersCount,
      productsCount: rows.length,
      datesCount: parsed.dates.length,
      skippedProductsCount: skippedCodes.size,
      skippedSample: Array.from(skippedCodes).slice(0, 5),
    });
  } catch (error: any) {
    console.error('Import weekly orders error:', error);
    return NextResponse.json(
      { error: 'データの保存に失敗しました。', details: error.message },
      { status: 500 }
    );
  }
}
