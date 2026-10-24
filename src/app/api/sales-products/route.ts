import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { resolveLossStoreId } from '@/lib/lossStore';

// ログインユーザーの tenant_id を確実に解決するヘルパー
async function resolveTenantId(db: any, user: any): Promise<number | null> {
  if (user.tenant_id) return Number(user.tenant_id);
  const resolved = await resolveLossStoreId(db, user);
  if (resolved.storeId) {
    const store = await db.get('SELECT tenant_id FROM stores WHERE id = ?', [resolved.storeId]);
    if (store?.tenant_id) return Number(store.tenant_id);
  }
  return null;
}

// 販売商品マスタの管理権限チェック（企業ロス統括管理者・管理者・システム管理者のみ）
function canManageSalesProducts(role: string): boolean {
  return ['company_loss_manager', 'admin', 'super_admin'].includes(role);
}

export async function GET() {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証エラー：ログインし直してください。' }, { status: 401 });
    }

    if (!canManageSalesProducts(user.role)) {
      return NextResponse.json({ error: '販売商品マスタの閲覧権限がありません。' }, { status: 403 });
    }

    const db = await getDb();
    const tenantId = await resolveTenantId(db, user);
    if (!tenantId) {
      return NextResponse.json({ error: '所属企業が特定できません。' }, { status: 400 });
    }

    const products = await db.all(
      `SELECT id, tenant_id, product_code, product_name, retail_price, category, characteristics, created_at, updated_at
       FROM store_products
       WHERE tenant_id = ?
       ORDER BY product_code ASC`,
      [tenantId]
    );

    return NextResponse.json({ products });
  } catch (err: any) {
    console.error('Failed to fetch sales products:', err);
    return NextResponse.json(
      { error: '販売商品マスタの取得に失敗しました。', details: err.message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証エラー：ログインし直してください。' }, { status: 401 });
    }

    if (!canManageSalesProducts(user.role)) {
      return NextResponse.json({ error: '販売商品マスタの編集権限がありません。' }, { status: 403 });
    }

    const db = await getDb();
    const tenantId = await resolveTenantId(db, user);
    if (!tenantId) {
      return NextResponse.json({ error: '所属企業が特定できません。' }, { status: 400 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'delete') {
      const id = Number(body.id);
      if (!id) {
        return NextResponse.json({ error: '削除対象のIDが指定されていません。' }, { status: 400 });
      }

      const target = await db.get(
        'SELECT id, product_code FROM store_products WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );
      if (!target) {
        return NextResponse.json({ error: '対象の商品が見つかりません。' }, { status: 404 });
      }

      await db.run('DELETE FROM store_products WHERE id = ? AND tenant_id = ?', [id, tenantId]);
      return NextResponse.json({ success: true });
    }

    // 新規作成または更新
    const id = body.id ? Number(body.id) : null;
    const productCode = String(body.product_code || '').trim();
    const productName = String(body.product_name || '').trim();
    const retailPrice = Math.max(0, Math.round(Number(body.retail_price) || 0));
    const category = String(body.category || '').trim();
    const characteristics = String(body.characteristics || '').trim();

    if (!productCode || !productName) {
      return NextResponse.json(
        { error: '「商品コード」と「商品名」は必須項目です。' },
        { status: 400 }
      );
    }

    if (id) {
      // 更新時：他レコードとのコード重複・商品名重複をチェック
      const dupCode = await db.get(
        'SELECT id FROM store_products WHERE tenant_id = ? AND product_code = ? AND id != ?',
        [tenantId, productCode, id]
      );
      if (dupCode) {
        return NextResponse.json(
          { error: `商品コード「${productCode}」は既に別の商品で使用されています。` },
          { status: 400 }
        );
      }

      const dupName = await db.get(
        'SELECT id FROM store_products WHERE tenant_id = ? AND product_name = ? AND id != ?',
        [tenantId, productName, id]
      );
      if (dupName) {
        return NextResponse.json(
          { error: `商品名「${productName}」は既に別の商品コードで登録されています。` },
          { status: 400 }
        );
      }

      // もし商品コードが変更された場合、既存の販売オーダー・ロス記録の商品コードも連動して更新する
      const current = await db.get(
        'SELECT product_code FROM store_products WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );
      if (!current) {
        return NextResponse.json({ error: '更新対象の商品が見つかりません。' }, { status: 404 });
      }

      await db.run(
        `UPDATE store_products
         SET product_code = ?, product_name = ?, retail_price = ?, category = ?, characteristics = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND tenant_id = ?`,
        [productCode, productName, retailPrice, category, characteristics, id, tenantId]
      );

      // 商品コードまたは商品名が変わった場合、自社店舗のオーダー・ロス記録も同期しておく
      if (current.product_code !== productCode) {
        await db.run(
          `UPDATE store_sales_orders SET product_code = ?, product_name = ?
           WHERE product_code = ? AND store_id IN (SELECT id FROM stores WHERE tenant_id = ?)`,
          [productCode, productName, current.product_code, tenantId]
        );
        await db.run(
          `UPDATE waste_records SET product_code = ?, product_name = ?
           WHERE product_code = ? AND store_id IN (SELECT id FROM stores WHERE tenant_id = ?)`,
          [productCode, productName, current.product_code, tenantId]
        );
      }
    } else {
      // 新規作成時：重複チェック
      const dupCode = await db.get(
        'SELECT id, product_name FROM store_products WHERE tenant_id = ? AND product_code = ?',
        [tenantId, productCode]
      );
      if (dupCode) {
        return NextResponse.json(
          { error: `商品コード「${productCode}」は既に登録されています（${dupCode.product_name}）。` },
          { status: 400 }
        );
      }

      const dupName = await db.get(
        'SELECT id, product_code FROM store_products WHERE tenant_id = ? AND product_name = ?',
        [tenantId, productName]
      );
      if (dupName) {
        return NextResponse.json(
          { error: `商品名「${productName}」は既に登録されています（コード: ${dupName.product_code}）。` },
          { status: 400 }
        );
      }

      await db.run(
        `INSERT INTO store_products (tenant_id, product_code, product_name, retail_price, category, characteristics)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [tenantId, productCode, productName, retailPrice, category, characteristics]
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Failed to save sales product:', err);
    return NextResponse.json(
      { error: '販売商品マスタの保存に失敗しました。', details: err.message },
      { status: 500 }
    );
  }
}
