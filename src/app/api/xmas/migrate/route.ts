import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getDb } from '@/lib/db';

/**
 * クリスマス専用テーブル群の安全なマイグレーションAPI
 * super_admin または admin のみが実行可能。
 * すでにテーブルが存在する場合は何も変更せず安全に終了します。
 */
export async function POST() {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    if (user.role !== 'super_admin' && user.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const db = await getDb();

    await db.exec(`
      CREATE TABLE IF NOT EXISTS xmas_accounts (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('tokyo_store', 'regional_store', 'xmas_manager', 'xmas_factory', 'xmas_headquarters')),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS xmas_orders (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        account_id INTEGER REFERENCES xmas_accounts(id) ON DELETE CASCADE,
        order_datetime TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        staff_name TEXT NOT NULL,
        order_route TEXT NOT NULL,
        web_reservation_no TEXT,
        payment_status TEXT NOT NULL,
        discount_type TEXT NOT NULL,
        delivery_date TEXT NOT NULL,
        delivery_time TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        memo TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS xmas_order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES xmas_orders(id) ON DELETE CASCADE,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS xmas_product_limits (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        product_name TEXT NOT NULL,
        max_limit INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (tenant_id, product_name)
      );

      CREATE TABLE IF NOT EXISTS xmas_settings (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        setting_key TEXT NOT NULL,
        setting_value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (tenant_id, setting_key)
      );

      CREATE INDEX IF NOT EXISTS idx_xmas_orders_tenant_account ON xmas_orders(tenant_id, account_id);
      CREATE INDEX IF NOT EXISTS idx_xmas_orders_delivery ON xmas_orders(delivery_date, delivery_time);
      CREATE INDEX IF NOT EXISTS idx_xmas_order_items_order_id ON xmas_order_items(order_id);
      CREATE INDEX IF NOT EXISTS idx_xmas_accounts_tenant ON xmas_accounts(tenant_id);
    `);

    return NextResponse.json({ success: true, message: 'クリスマス専用テーブルの準備が完了しました' });
  } catch (err: any) {
    console.error('Xmas migration error:', err);
    return NextResponse.json({ error: 'マイグレーションに失敗しました', details: err.message }, { status: 500 });
  }
}
