import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { resolveLossStoreId } from '@/lib/lossStore';
import { parseOrderSheet, getOrderWorkbookSheets } from '@/lib/parseOrderSheet';
import { logActivity } from '@/lib/logger';
import { normalizeProductName, normalizeWithoutPunctuation, cleanTrimming, extractBaseProductName } from '@/lib/productNormalizer';

// オーダー表の取込API
//   mode=get-sheets : アップロードされたExcel内の全シート名一覧を返す
//   mode=preview    : 指定されたシート（未指定時は先頭シート）を解析して内容を返す（DBには書き込まない）
//   mode=commit     : 解析結果をDBに登録（importType='replace' または 'append'）
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
    if (mode !== 'get-sheets' && mode !== 'preview' && mode !== 'commit') {
      return NextResponse.json({ error: '不正なモードです。' }, { status: 400 });
    }

    const fileBuffer = new Uint8Array(await file.arrayBuffer());

    // 1. シート名一覧取得モード
    if (mode === 'get-sheets') {
      const sheets = await getOrderWorkbookSheets(fileBuffer);
      return NextResponse.json({ success: true, sheets });
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

    // 自社の販売商品マスタ（store_products）を取得（別名 alias_1, alias_2, alias_3 も含む）
    const masterProducts = await db.all(
      `SELECT product_code, product_name, alias_1, alias_2, alias_3
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

    // 1. コード引き用Map
    // 2. 正規化商品名引き用Map（正式名＋別名1〜3の表記ゆれ吸収）
    // 3. 記号・カッコ除去商品名引き用Map（フォールバック）
    const masterCodeMap = new Map<string, string>();
    const masterNameMap = new Map<string, { productCode: string; productName: string }>();
    const masterPunctuationMap = new Map<string, { productCode: string; productName: string }>();

    const registerNameEntry = (targetName: string, code: string, officialName: string) => {
      const clean = cleanTrimming(targetName);
      if (!clean) return;

      const norm = normalizeProductName(clean);
      if (norm && !masterNameMap.has(norm)) {
        masterNameMap.set(norm, { productCode: code, productName: officialName });
      }

      const punct = normalizeWithoutPunctuation(clean);
      if (punct && !masterPunctuationMap.has(punct)) {
        masterPunctuationMap.set(punct, { productCode: code, productName: officialName });
      }
    };

    for (const mp of masterProducts) {
      const code = String(mp.product_code || '').trim();
      const name = String(mp.product_name || '').trim();
      if (code) {
        masterCodeMap.set(code, name);
      }
      if (name) {
        registerNameEntry(name, code, name);
      }
      if (mp.alias_1) {
        registerNameEntry(mp.alias_1, code, name);
      }
      if (mp.alias_2) {
        registerNameEntry(mp.alias_2, code, name);
      }
      if (mp.alias_3) {
        registerNameEntry(mp.alias_3, code, name);
      }
    }

    // 指定されたシート名群を解析
    const sheetNamesRaw = formData.get('sheetNames');
    let targetSheetNames: string[] | undefined = undefined;
    if (typeof sheetNamesRaw === 'string' && sheetNamesRaw.trim()) {
      try {
        const parsed = JSON.parse(sheetNamesRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          targetSheetNames = parsed.map(s => String(s).trim()).filter(Boolean);
        }
      } catch {
        targetSheetNames = sheetNamesRaw.split(',').map(s => s.trim()).filter(Boolean);
      }
    }

    // Excelの解析（指定シート群をスキャン・日付統合・合算）
    const parsed = await parseOrderSheet(fileBuffer, targetSheetNames);

    // 商品マスタとの突合（コード完全一致優先 ＋ 商品名正規化一致フォールバック）
    const aggregated = new Map<string, { productCode: string; productName: string; quantities: number[] }>();
    const unmatchedItems = new Set<string>();
    let nameMatchedCount = 0;

    for (const row of parsed.rows) {
      let resolvedCode = '';
      let resolvedName = '';

      // ① まず商品コードで照合（完全一致）
      if (row.productCode && masterCodeMap.has(row.productCode)) {
        resolvedCode = row.productCode;
        resolvedName = masterCodeMap.get(row.productCode)!;
      }
      // ② 商品名で照合（正式名 または 別名1〜3 の強力正規化一致 ＆ 記号・カッコ除去フォールバック ＆ ベース名照合）
      else if (row.productName) {
        const norm = normalizeProductName(row.productName);
        const matched = masterNameMap.get(norm);
        if (matched) {
          resolvedCode = matched.productCode;
          resolvedName = matched.productName;
          nameMatchedCount++;
        } else {
          const punct = normalizeWithoutPunctuation(row.productName);
          const punctMatched = masterPunctuationMap.get(punct);
          if (punctMatched) {
            resolvedCode = punctMatched.productCode;
            resolvedName = punctMatched.productName;
            nameMatchedCount++;
          } else {
            // スペースや期間メモ（「キャラメルパイ ～1/11」等）を除いたベース名でのフォールバック
            const baseName = extractBaseProductName(row.productName);
            if (baseName && baseName !== row.productName) {
              const baseNorm = normalizeProductName(baseName);
              const baseMatched = masterNameMap.get(baseNorm) || masterPunctuationMap.get(normalizeWithoutPunctuation(baseName));
              if (baseMatched) {
                resolvedCode = baseMatched.productCode;
                resolvedName = baseMatched.productName;
                nameMatchedCount++;
              }
            }
          }
        }
      }

      // ③ row.productCode 自体を商品名（または別名）として照合
      if (!resolvedCode && row.productCode) {
        const norm = normalizeProductName(row.productCode);
        const matched = masterNameMap.get(norm);
        if (matched) {
          resolvedCode = matched.productCode;
          resolvedName = matched.productName;
          nameMatchedCount++;
        } else {
          const punct = normalizeWithoutPunctuation(row.productCode);
          const punctMatched = masterPunctuationMap.get(punct);
          if (punctMatched) {
            resolvedCode = punctMatched.productCode;
            resolvedName = punctMatched.productName;
            nameMatchedCount++;
          }
        }
      }

      // ④ row.productName 自体を商品コードとして照合
      if (!resolvedCode && row.productName && masterCodeMap.has(row.productName)) {
        resolvedCode = row.productName;
        resolvedName = masterCodeMap.get(row.productName)!;
      }

      // どちらでもマスタに見つからない場合
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

    // 未登録商品（マスタに該当しない商品）の判定
    // 6品目以上の場合は誤登録防止のためエラーで中断
    if (unmatchedItems.size > 5) {
      const items = Array.from(unmatchedItems);
      const errorMsg = `販売商品マスタに未登録の商品が多すぎます（計${items.length}品目：${items.slice(0, 3).map(name => `「${name}」`).join('、')} など）。`;

      return NextResponse.json(
        {
          error: errorMsg,
          details: 'マスタ未登録の商品が6品目以上あるため読み込みを中断しました。シート選択やエクセル内の商品名をご確認いただくか、企業ロス統括管理者の「販売商品マスタ設定」から事前に商品を登録してください。',
        },
        { status: 400 }
      );
    }

    const rows = Array.from(aggregated.values());

    if (rows.length === 0) {
      return NextResponse.json(
        {
          error: '有効な商品発注データが1件も見つかりませんでした。',
          details: '販売商品マスタに登録されている商品で、発注数（1個以上）が入力された行をご確認ください。',
        },
        { status: 400 }
      );
    }

    // すでにオーダーが登録されている日付および既存の商品重複（かぶり）を調査
    const dateStrings = parsed.dates.map(d => d.date);
    const datePlaceholders = dateStrings.map(() => '?').join(',');
    const existingRows = (await db.all(
      `SELECT order_date, product_code, product_name, quantity
       FROM store_sales_orders
       WHERE store_id = ? AND order_date IN (${datePlaceholders})`,
      [effectiveStoreId, ...dateStrings]
    )) as { order_date: string; product_code: string; product_name: string; quantity: number }[];

    const existingDates: string[] = Array.from(new Set((existingRows || []).map(r => r.order_date)));

    // 既存データを Map 化して重複（かぶり）商品を正確に検出
    const existingProductMap = new Map<string, { product_name: string; quantity: number }>();
    for (const er of existingRows) {
      existingProductMap.set(`${er.order_date}___${er.product_code}`, {
        product_name: er.product_name,
        quantity: er.quantity,
      });
    }

    const dateLabelMap = new Map<string, string>();
    parsed.dates.forEach(d => dateLabelMap.set(d.date, d.label));

    // 重複商品のリストを抽出
    const overlappingProducts: {
      date: string;
      dateLabel: string;
      productCode: string;
      productName: string;
      existingQuantity: number;
      newQuantity: number;
    }[] = [];

    for (const row of rows) {
      for (let i = 0; i < parsed.dates.length; i++) {
        const d = parsed.dates[i].date;
        const newQty = row.quantities[i];
        if (newQty > 0) {
          const key = `${d}___${row.productCode}`;
          const existing = existingProductMap.get(key);
          if (existing) {
            overlappingProducts.push({
              date: d,
              dateLabel: dateLabelMap.get(d) || d,
              productCode: row.productCode,
              productName: row.productName || existing.product_name,
              existingQuantity: existing.quantity,
              newQuantity: newQty,
            });
          }
        }
      }
    }

    // 2. プレビューモード
    if (mode === 'preview') {
      return NextResponse.json({
        success: true,
        dates: parsed.dates,
        rows,
        sheetNames: parsed.sheetNames,
        existingDates,
        existingCount: existingRows.length,
        overlappingProducts,
        skippedProductsCount: unmatchedItems.size,
        unmatchedItems: Array.from(unmatchedItems),
        skippedSample: Array.from(unmatchedItems),
        nameMatchedCount,
        warnings: parsed.warnings,
      });
    }

    // 3. コミットモード（登録実行）
    const importType = String(formData.get('importType') || 'replace'); // 'replace' | 'append'
    let ordersCount = 0;

    await db.transactionWithUser(
      user.id,
      effectiveStoreId,
      user.role,
      async (txDb) => {
        // 登録用データの作成
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

        if (importType === 'replace') {
          // 【置き換え】対象日の既存オーダーを全削除した上で、今回のデータをINSERT
          await txDb.run(
            `DELETE FROM store_sales_orders WHERE store_id = ? AND order_date IN (${datePlaceholders})`,
            [effectiveStoreId, ...dateStrings]
          );

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
        } else {
          // 【追加】対象日の他の既存商品は削除せずそのまま保持！
          // 今回取り込む商品が重複した場合は数量を最新値で更新（ON CONFLICT DO UPDATE）
          if (toInsert.length > 0) {
            const chunkSize = 100;
            for (let i = 0; i < toInsert.length; i += chunkSize) {
              const chunk = toInsert.slice(i, i + chunkSize);
              const valuePlaceholders = chunk.map(() => '(?, ?, ?, ?, ?)').join(', ');
              const flatValues = chunk.flat();
              await txDb.run(
                `INSERT INTO store_sales_orders (store_id, order_date, product_code, product_name, quantity)
                 VALUES ${valuePlaceholders}
                 ON CONFLICT (store_id, order_date, product_code)
                 DO UPDATE SET quantity = EXCLUDED.quantity, product_name = EXCLUDED.product_name`,
                flatValues
              );
            }
          }
        }
      },
      tenantId
    );

    // 業務アクティビティログを記録
    const dateRangeStr = parsed.dates.length > 0
      ? `${parsed.dates[0].date} 〜 ${parsed.dates[parsed.dates.length - 1].date}`
      : '';
    const actionLabel = importType === 'append' ? '追加登録' : '置き換え登録';
    const skippedMsg = unmatchedItems.size > 0 ? ` ※マスタ未登録のためスキップ: ${unmatchedItems.size}品目（${Array.from(unmatchedItems).join('、')}）` : '';
    await logActivity({
      tenantId,
      userId: user.id,
      storeId: effectiveStoreId,
      action: 'IMPORT',
      category: 'order',
      tableName: 'store_sales_orders',
      description: `オーダー表を${actionLabel}しました（${rows.length}品目・計${ordersCount}件${nameMatchedCount > 0 ? ` ※商品名一致による補完${nameMatchedCount}件含む` : ''}${skippedMsg} / 対象期間: ${dateRangeStr}${parsed.sheetNames ? ` / シート: ${parsed.sheetNames.join(', ')}` : ''}）`,
      newData: { ordersCount, productsCount: rows.length, datesCount: parsed.dates.length, nameMatchedCount, importType, sheetNames: parsed.sheetNames, skippedProductsCount: unmatchedItems.size, unmatchedItems: Array.from(unmatchedItems) },
    });

    return NextResponse.json({
      success: true,
      message: 'データの保存に成功しました。',
      ordersCount,
      productsCount: rows.length,
      datesCount: parsed.dates.length,
      nameMatchedCount,
      importType,
      sheetNames: parsed.sheetNames,
      skippedProductsCount: unmatchedItems.size,
      unmatchedItems: Array.from(unmatchedItems),
      skippedSample: Array.from(unmatchedItems),
    });
  } catch (error: any) {
    console.error('Import weekly orders error:', error);
    return NextResponse.json(
      {
        error: error.message || 'データの保存に失敗しました。',
        details: process.env.NODE_ENV === 'production' ? undefined : error.message,
      },
      { status: 500 }
    );
  }
}
