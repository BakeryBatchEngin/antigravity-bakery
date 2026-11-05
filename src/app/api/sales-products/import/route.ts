import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { resolveLossStoreId } from '@/lib/lossStore';
import ExcelJS from 'exceljs';

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
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(arrayBuffer) as any);
    const worksheet = workbook.worksheets[0];

    if (!worksheet || worksheet.rowCount < 2) {
      return NextResponse.json(
        { error: 'Excelファイルにデータ行が見つかりません。' },
        { status: 400 }
      );
    }

    // セルから安全にテキストを取得するヘルパー
    const getCellText = (cell: any): string => {
      if (!cell || cell.value === null || cell.value === undefined) return '';
      if (typeof cell.value === 'object') {
        if ('richText' in cell.value) return cell.value.richText.map((t: any) => t.text).join('').trim();
        if ('text' in cell.value) return String(cell.value.text ?? '').trim();
        if ('result' in cell.value) return String(cell.value.result ?? '').trim();
      }
      return String(cell.value).trim();
    };

    // 1行目のヘッダーから列インデックスを特定（1始まり）
    const headerRow = worksheet.getRow(1);
    let codeCol = 1;
    let nameCol = 2;
    let priceCol = 3;
    let catCol = 4;
    let charCol = 5;

    for (let c = 1; c <= headerRow.cellCount; c++) {
      const h = getCellText(headerRow.getCell(c));
      if (h.includes('コード') || h.toLowerCase() === 'product_code') codeCol = c;
      else if (h.includes('商品名') || h.toLowerCase() === 'product_name') nameCol = c;
      else if (h.includes('価格') || h.includes('売価') || h.includes('単価') || h.toLowerCase() === 'retail_price') priceCol = c;
      else if (h.includes('カテゴリ') || h.toLowerCase() === 'category') catCol = c;
      else if (h.includes('特性') || h.includes('特徴') || h.includes('メモ') || h.toLowerCase() === 'characteristics') charCol = c;
    }

    interface ParsedItem {
      productCode: string;
      productName: string;
      retailPrice: number;
      category: string;
      characteristics: string;
    }

    const items: ParsedItem[] = [];
    for (let r = 2; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const productCode = getCellText(row.getCell(codeCol));
      const productName = getCellText(row.getCell(nameCol));
      if (!productCode || !productName) continue;

      const rawPrice = getCellText(row.getCell(priceCol)).replace(/[,¥￥円\s]/g, '');
      const retailPrice = Math.max(0, Math.round(Number(rawPrice) || 0));
      const category = getCellText(row.getCell(catCol));
      const characteristics = getCellText(row.getCell(charCol));

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
