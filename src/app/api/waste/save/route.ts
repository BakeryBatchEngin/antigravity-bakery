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

    const db = await getDb(user);

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
        // 納品差異（発注数との差分。マイナス可）と試食数（0以上）
        const deliveryDiff = Number.isFinite(Number(record.deliveryDiff)) ? Math.trunc(Number(record.deliveryDiff)) : 0;
        const sampleCount = Math.max(0, Number.isFinite(Number(record.sampleCount)) ? Math.trunc(Number(record.sampleCount)) : 0);

        // UPSERT (ON CONFLICT DO UPDATE) は PostgreSQL固有の構文に依存するため、
        // 厳密なルールに従い SELECT してから INSERT or UPDATE を行う
        const existing = await txDb.get(
          `SELECT id FROM waste_records WHERE store_id = ? AND target_date = ? AND product_code = ?`,
          [effectiveStoreId, targetDate, productCode]
        );

        if (existing) {
          await txDb.run(
            `UPDATE waste_records 
             SET waste_count = ?, sold_out_time = ?, comment = ?, delivery_diff = ?, sample_count = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [wasteCount, soldOutTime || null, comment || null, deliveryDiff, sampleCount, existing.id]
          );
        } else {
          await txDb.run(
            `INSERT INTO waste_records (store_id, target_date, product_code, product_name, order_quantity, waste_count, sold_out_time, comment, delivery_diff, sample_count)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [effectiveStoreId, targetDate, productCode, productName, orderQuantity || 0, wasteCount, soldOutTime || null, comment || null, deliveryDiff, sampleCount]
          );
        }
      }

      // 学習データとして画像と確定した正解カウントを保存
      if (imageBase64) {
        // AIのFew-shot学習精度を高めるため product_code, product_name, count をセットで記録
        const resultsJson = JSON.stringify(
          records
            .filter((r: any) => r.wasteCount > 0)
            .map((r: any) => ({
              product_code: r.productCode,
              product_name: r.productName,
              count: r.wasteCount,
            }))
        );

        // 同じ店舗・同じ日付の学習ログが既にあれば上書き更新し、過去3件の枠が同日の再保存で埋まるのを防ぐ
        const existingPhotoLog = await txDb.get(
          `SELECT id FROM waste_photo_logs WHERE store_id = ? AND target_date = ? ORDER BY id DESC LIMIT 1`,
          [effectiveStoreId, targetDate]
        );

        if (existingPhotoLog) {
          await txDb.run(
            `UPDATE waste_photo_logs
             SET image_base64 = ?, results_json = ?, created_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [imageBase64, resultsJson, existingPhotoLog.id]
          );
        } else {
          await txDb.run(
            `INSERT INTO waste_photo_logs (store_id, target_date, image_base64, results_json) VALUES (?, ?, ?, ?)`,
            [effectiveStoreId, targetDate, imageBase64, resultsJson]
          );
        }

        // 店舗ごとに直近3件のみを保持し、4件目以降の古い写真ログを自動削除（DB容量の肥大化を防止）
        const recentPhotoLogs = (await txDb.all(
          `SELECT id FROM waste_photo_logs WHERE store_id = ? ORDER BY id DESC LIMIT 3`,
          [effectiveStoreId]
        )) as { id: number }[];
        if (recentPhotoLogs && recentPhotoLogs.length >= 3) {
          const keepIds = recentPhotoLogs.map((r: { id: number }) => r.id);
          const placeholders = keepIds.map(() => '?').join(',');
          await txDb.run(
            `DELETE FROM waste_photo_logs WHERE store_id = ? AND id NOT IN (${placeholders})`,
            [effectiveStoreId, ...keepIds]
          );
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Waste records save error:', error);
    return NextResponse.json({ error: 'データの保存に失敗しました。', details: error.message }, { status: 500 });
  }
}
