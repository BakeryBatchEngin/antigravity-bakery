import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { resolveLossStoreId } from '@/lib/lossStore';

export async function POST(req: Request) {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証エラー：ログイン情報が見つかりません。' }, { status: 401 });
    }

    const { targetDate, records, imageBase64 } = await req.json();

    if (!targetDate || !records || !Array.isArray(records)) {
      return NextResponse.json({ error: '不正なリクエストデータです。' }, { status: 400 });
    }

    const db = await getDb();
    
    // 操作対象の店舗を決定（店舗ロス管理者は自店舗のみ。統括管理者はヘッダーで選択した自社の店舗）
    const resolved = await resolveLossStoreId(db, user);
    if (resolved.error) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    const effectiveStoreId = resolved.storeId;
    const userId = user.id;

    await db.transactionWithUser(userId, effectiveStoreId, user.role, async (txDb) => {
      for (const record of records) {
        const { productCode, productName, orderQuantity, wasteCount, soldOutTime, comment } = record;

        // UPSERT (ON CONFLICT DO UPDATE) は PostgreSQL固有の構文に依存するため、
        // 厳密なルールに従い SELECT してから INSERT or UPDATE を行う
        const existing = await txDb.get(
          `SELECT id FROM waste_records WHERE store_id = ? AND target_date = ? AND product_code = ?`,
          [effectiveStoreId, targetDate, productCode]
        );

        if (existing) {
          await txDb.run(
            `UPDATE waste_records 
             SET waste_count = ?, sold_out_time = ?, comment = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [wasteCount, soldOutTime || null, comment || null, existing.id]
          );
        } else {
          await txDb.run(
            `INSERT INTO waste_records (store_id, target_date, product_code, product_name, order_quantity, waste_count, sold_out_time, comment)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [effectiveStoreId, targetDate, productCode, productName, orderQuantity || 0, wasteCount, soldOutTime || null, comment || null]
          );
        }
      }

      // 学習データとして画像を保存 (任意)
      if (imageBase64) {
        // 結果JSONにはロスの数だけを入れるか、現在のレコード状態を入れる
        const resultsJson = JSON.stringify(
          records.filter((r: any) => r.wasteCount > 0).map((r: any) => ({ product_code: r.productCode, count: r.wasteCount }))
        );
        await txDb.run(
          `INSERT INTO waste_photo_logs (store_id, target_date, image_base64, results_json) VALUES (?, ?, ?, ?)`,
          [effectiveStoreId, targetDate, imageBase64, resultsJson]
        );
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Waste records save error:', error);
    return NextResponse.json({ error: 'データの保存に失敗しました。', details: error.message }, { status: 500 });
  }
}
