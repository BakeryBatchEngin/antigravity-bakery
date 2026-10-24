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

export async function GET() {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    }

    if (!['company_loss_manager', 'admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const db = await getDb();
    const tenantId = await resolveTenantId(db, user);
    if (!tenantId) {
      return NextResponse.json({ error: '所属企業が特定できません' }, { status: 400 });
    }

    const products = await db.all(
      `SELECT product_code, product_name, retail_price, category, characteristics
       FROM store_products
       WHERE tenant_id = ?
       ORDER BY product_code ASC`,
      [tenantId]
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('販売商品マスタ');

    sheet.columns = [
      { header: '商品コード', key: 'product_code', width: 16 },
      { header: '商品名', key: 'product_name', width: 32 },
      { header: '価格', key: 'retail_price', width: 14 },
      { header: '商品カテゴリー', key: 'category', width: 22 },
      { header: '商品の特性', key: 'characteristics', width: 55 },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' },
    };

    if (products.length === 0) {
      // 未登録時は入力見本行を1行入れてテンプレートとして使いやすくする
      sheet.addRow({
        product_code: 'S-001',
        product_name: 'バゲット',
        retail_price: 351,
        category: 'ハード系',
        characteristics: '看板商品・夕方まで欠品厳禁・翌日ラスク加工可',
      });
    } else {
      for (const p of products) {
        sheet.addRow({
          product_code: p.product_code,
          product_name: p.product_name,
          retail_price: p.retail_price ?? 0,
          category: p.category || '',
          characteristics: p.characteristics || '',
        });
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="sales_products_master.xlsx"',
      },
    });
  } catch (err: any) {
    console.error('Sales products export error:', err);
    return NextResponse.json({ error: 'Excelの出力に失敗しました' }, { status: 500 });
  }
}
