import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { resolveLossStoreId } from '@/lib/lossStore';
import { parseOrderSheet } from '@/lib/parseOrderSheet';
import { logActivity } from '@/lib/logger';

// 商品名比較用の正規化（全角半角統一、空白除去、小文字化）
function normalizeProductName(name: string): string {
  return String(name || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase();
}

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

    const db = await getDb(user);

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

    // 1. コード引き用Map、2. 商品名引き用Map（正規化）の2種類を作成
    const masterCodeMap = new Map<string, string>();
    const masterNameMap = new Map<string, { productCode: string; productName: string }>();

    for (const mp of masterProducts) {
      const code = String(mp.product_code || '').trim();
      const name = String(mp.product_name || '').trim();
      if (code) {
        masterCodeMap.set(code, name);
      }
      const norm = normalizeProductName(name);
      if (norm && !masterNameMap.has(norm)) {
        masterNameMap.set(norm, { productCode: code, productName: name });
      }
    }

    // Excelの解析（行位置・ヘッダー位置を動的スキャン）
    const data = new Uint8Array(await file.arrayBuffer());
    const parsed = await parseOrderSheet(data);

    // 商品マスタとの突合（コード完全一致優先 ＋ 商品名正規化一致フォールバック）
    const aggregated = new Map<string, { productCode: string; productName: string; quantities: number[] }>();
    const unmatchedItems = new Set<string>();
    let nameMatchedCount = 0;

    for (const row of parsed.rows) {
      let resolvedCode = '';
      let resolvedName = '';

      // ① まず商品コードで照合
      if (row.productCode && masterCodeMap.has(row.productCode)) {
        resolvedCode = row.productCode;
        resolvedName = masterCodeMap.get(row.productCode)!;
      }
      // ② コードで一致しない、またはコードが空の場合は商品名で照合
      else if (row.productName) {
        const norm = normalizeProductName(row.productName);
        const matched = masterNameMap.get(norm);
        if (matched) {
          resolvedCode = matched.productCode;
          resolvedName = matched.productName;
          nameMatchedCount++;
        }
      }

      // どちらでもマスタに見つからない場合（発注数量が1以上ある行）
      if (!resolvedCode) {
        const itemLabel = row.productName
          ? row.productName
          : (row.productCode ? `コード: ${row.productCode}` : '名称不明の商品');
        unmatchedItems.add(itemLabel);
        continue;
      }

      // 同一コードがあれば合算
      const existing = aggregated.get(resolvedCode);
      if (existing) {
        existing.quantities = existing.quantities.map((q, i) => q + row.quantities[i]);
      } else {
        aggregated.set(resolvedCode, {
          productCode: resolvedCode,
          productName: resolvedName,
          quantities: [...row.quantities],
        });
      }
    }

    // 発注数量があるにもかかわらず商品マスタに該当しない商品が存在する場合はエラーで中断
    if (unmatchedItems.size > 0) {
      const items = Array.from(unmatchedItems);
      const errorMsg =
        items.length === 1
          ? `「${items[0]}」という商品が商品マスタに該当しません。`
          : `${items.slice(0, 3).map(name => `「${name}」`).join('、')}${items.length > 3 ? ` など計${items.length}品目` : ''}という商品が商品マスタに該当しません。`;

      return NextResponse.json(
        {
          error: errorMsg,
          details: '商品マスタの登録内容や、Excel内の商品名・商品コードをご確認ください。未登録の場合は企業ロス統括管理者の「販売商品マスタ設定」から商品を登録してください。',
        },
        { status: 400 }
      );
    }

    const rows = Array.from(aggregated.values());

    if (rows.length === 0) {
      return NextResponse.json(
        {
          error: '発注データが1件も見つかりませんでした。',
          details: 'オーダー表内の発注数（1個以上）が入力された行をご確認ください。',
        },
        { status: 400 }
      );
    }

    // すでにオーダーが登録されている日付を調べる（上書き確認用：1回のクエリで一括取得）
    const dateStrings = parsed.dates.map(d => d.date);
    const datePlaceholders = dateStrings.map(() => '?').join(',');
    const foundRows = (await db.all(
      `SELECT DISTINCT order_date FROM store_sales_orders WHERE store_id = ? AND order_date IN (${datePlaceholders})`,
      [effectiveStoreId, ...dateStrings]
    )) as { order_date: string }[];
    const existingDates: string[] = (foundRows || []).map(r => r.order_date);

    if (mode === 'preview') {
      return NextResponse.json({
        success: true,
        dates: parsed.dates,
        rows,
        existingDates,
        skippedProductsCount: 0,
        skippedSample: [],
        nameMatchedCount,
        warnings: parsed.warnings,
      });
    }

    // ---- 登録（Excelに載っている日付分だけ入れ替え：一括削除 & チャンク一括INSERT） ----
    let ordersCount = 0;
    await db.transactionWithUser(
      user.id,
      effectiveStoreId,
      user.role,
      async (txDb) => {
        // 1. 対象日の既存オーダーを1回のクエリで一括削除
        await txDb.run(
          `DELETE FROM store_sales_orders WHERE store_id = ? AND order_date IN (${datePlaceholders})`,
          [effectiveStoreId, ...dateStrings]
        );

        // 2. 登録用データの作成
        const toInsert: any[] = [];
        for (const row of rows) {
          for (let i = 0; i < parsed.dates.length; i++) {
            const qty = row.quantities[i];
            if (qty >= 1) {
              toInsert.push([effectiveStoreId, parsed.dates[i].date, row.productCode, row.productName, qty]);
              ordersCount++;
            }
          }
        }

        // 3. チャンク一括INSERT（N+1往復を根絶）
        if (toInsert.length > 0) {
          const chunkSize = 100;
          for (let i = 0; i < toInsert.length; i += chunkSize) {
            const chunk = toInsert.slice(i, i + chunkSize);
            const valuePlaceholders = chunk.map(() => '(?, ?, ?, ?, ?)').join(', ');
            const flatValues = chunk.flat();
            await txDb.run(
              `INSERT INTO store_sales_orders (store_id, order_date, product_code, product_name, quantity)
               VALUES ${valuePlaceholders}`,
              flatValues
            );
          }
        }
      },
      tenantId
    );

    // 業務アクティビティログを記録
    const dateRangeStr = parsed.dates.length > 0
      ? `${parsed.dates[0].date} 〜 ${parsed.dates[parsed.dates.length - 1].date}`
      : '';
    await logActivity({
      tenantId,
      userId: user.id,
      storeId: effectiveStoreId,
      action: 'IMPORT',
      category: 'order',
      tableName: 'store_sales_orders',
      description: `週間オーダー表を取り込みました（${rows.length}品目・計${ordersCount}件${nameMatchedCount > 0 ? ` ※商品名一致による補完${nameMatchedCount}件含む` : ''} / 対象期間: ${dateRangeStr}）`,
      newData: { ordersCount, productsCount: rows.length, datesCount: parsed.dates.length, nameMatchedCount },
    });

    return NextResponse.json({
      success: true,
      message: 'データの保存に成功しました。',
      ordersCount,
      productsCount: rows.length,
      datesCount: parsed.dates.length,
      nameMatchedCount,
      skippedProductsCount: 0,
      skippedSample: [],
    });
  } catch (error: any) {
    console.error('Import weekly orders error:', error);
    return NextResponse.json(
      {
        error: 'データの保存に失敗しました。',
        details: process.env.NODE_ENV === 'production' ? undefined : error.message,
      },
      { status: 500 }
    );
  }
}
