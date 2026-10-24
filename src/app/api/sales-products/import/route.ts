import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { resolveLossStoreId } from '@/lib/lossStore';
import * as XLSX from 'xlsx';

async function resolveTenantId(db: any, user: any): Promise<number | null> {
  if (user.tenant_id) return Number(user.tenant_id);
  const resolved = await resolveLossStoreId(db, user);
  if (resolved.storeId) {
    const store = await db.get('SELECT tenant_id FROM stores WHERE id = ?', [resolved.storeId]);
    if (store?.tenant_id) return Number(store.tenant_id);
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証エラー：ログインし直してください。' }, { status: 401 });
    }

    if (!['company_loss_manager', 'admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: '販売商品マスタの一括登録権限がありません。' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'Excelファイルが選択されていません。' }, { status: 400 });
    }

    const db = await getDb();
    const tenantId = await resolveTenantId(db, user);
    if (!tenantId) {
      return NextResponse.json({ error: '所属企業が特定できません。' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // 2次元配列として全行を取得
    const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
    if (!rows || rows.length < 2) {
      return NextResponse.json(
        { error: 'Excelファイルにデータ行が見つかりません。' },
        { status: 400 }
      );
    }

    // 1行目のヘッダーから列インデックスを特定（デフォルトは A:0, B:1, C:2, D:3, E:4）
    const headerRow = rows[0].map((cell: any) => String(cell || '').trim());
    let codeIdx = 0;
    let nameIdx = 1;
    let priceIdx = 2;
    let catIdx = 3;
    let charIdx = 4;

    headerRow.forEach((h: string, idx: number) => {
      if (h.includes('コード') || h.toLowerCase() === 'product_code') codeIdx = idx;
      else if (h.includes('商品名') || h.toLowerCase() === 'product_name') nameIdx = idx;
      else if (h.includes('価格') || h.includes('売価') || h.includes('単価') || h.toLowerCase() === 'retail_price') priceIdx = idx;
      else if (h.includes('カテゴリ') || h.toLowerCase() === 'category') catIdx = idx;
      else if (h.includes('特性') || h.includes('特徴') || h.includes('メモ') || h.toLowerCase() === 'characteristics') charIdx = idx;
    });

    interface ParsedItem {
      productCode: string;
      productName: string;
      retailPrice: number;
      category: string;
      characteristics: string;
    }

    const items: ParsedItem[] = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length === 0) continue;

      const productCode = String(r[codeIdx] ?? '').trim();
      const productName = String(r[nameIdx] ?? '').trim();
      if (!productCode || !productName) continue;

      const rawPrice = String(r[priceIdx] ?? '').replace(/[,¥￥円\s]/g, '');
      const retailPrice = Math.max(0, Math.round(Number(rawPrice) || 0));
      const category = String(r[catIdx] ?? '').trim();
      const characteristics = String(r[charIdx] ?? '').trim();

      items.push({
        productCode,
        productName,
        retailPrice,
        category,
        characteristics,
      });
    }

    if (items.length === 0) {
      return NextResponse.json(
        { error: '有効な商品データ（「商品コード」と「商品名」が両方入力された行）が見つかりませんでした。' },
        { status: 400 }
      );
    }

    let insertedCount = 0;
    let updatedCount = 0;

    for (const item of items) {
      // 1. まず同じ product_code が自社マスタにあるか確認
      const byCode = await db.get(
        'SELECT id, product_code, product_name FROM store_products WHERE tenant_id = ? AND product_code = ?',
        [tenantId, item.productCode]
      );

      // 2. 同じ product_name が別のコードで既に登録されていないかも確認（UNIQUE制約違反を防ぐ）
      const byName = await db.get(
        'SELECT id, product_code, product_name FROM store_products WHERE tenant_id = ? AND product_name = ?',
        [tenantId, item.productName]
      );

      if (byCode) {
        // もし変更後の商品名が別レコード(byName)と衝突する場合は、古い別レコードを統合削除してから更新
        if (byName && byName.id !== byCode.id) {
          await db.run('DELETE FROM store_products WHERE id = ? AND tenant_id = ?', [byName.id, tenantId]);
        }
        await db.run(
          `UPDATE store_products
           SET product_name = ?, retail_price = ?, category = ?, characteristics = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND tenant_id = ?`,
          [item.productName, item.retailPrice, item.category, item.characteristics, byCode.id, tenantId]
        );
        updatedCount++;
      } else if (byName) {
        // 同じ商品名が既に存在していた場合は、その商品のコード・価格・カテゴリ・特性を最新に更新
        const oldCode = byName.product_code;
        await db.run(
          `UPDATE store_products
           SET product_code = ?, retail_price = ?, category = ?, characteristics = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND tenant_id = ?`,
          [item.productCode, item.retailPrice, item.category, item.characteristics, byName.id, tenantId]
        );
        if (oldCode !== item.productCode) {
          await db.run(
            `UPDATE store_sales_orders SET product_code = ?
             WHERE product_code = ? AND store_id IN (SELECT id FROM stores WHERE tenant_id = ?)`,
            [item.productCode, oldCode, tenantId]
          );
          await db.run(
            `UPDATE waste_records SET product_code = ?
             WHERE product_code = ? AND store_id IN (SELECT id FROM stores WHERE tenant_id = ?)`,
            [item.productCode, oldCode, tenantId]
          );
        }
        updatedCount++;
      } else {
        await db.run(
          `INSERT INTO store_products (tenant_id, product_code, product_name, retail_price, category, characteristics)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [tenantId, item.productCode, item.productName, item.retailPrice, item.category, item.characteristics]
        );
        insertedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      insertedCount,
      updatedCount,
      totalCount: items.length,
    });
  } catch (err: any) {
    console.error('Sales products import error:', err);
    return NextResponse.json(
      { error: 'Excelの一括取込に失敗しました。', details: err.message },
      { status: 500 }
    );
  }
}
