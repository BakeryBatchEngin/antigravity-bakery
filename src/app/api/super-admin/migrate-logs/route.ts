import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getDb } from '@/lib/db';

/**
 * 監査ログおよびセキュリティログの安全なマイグレーションAPI
 * Superadminのみ実行可能。
 * 既存のテーブル構造や運用データを保護し、安全にカラム追加と新規テーブル作成を行います。
 */
export async function POST() {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    if (user.role !== 'super_admin') {
      return NextResponse.json({ error: 'スーパー管理者権限が必要です' }, { status: 403 });
    }

    const db = await getDb();

    // 1. audit_logs テーブルの拡張
    await db.exec(`
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL;
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS description TEXT;
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address TEXT;

      CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON audit_logs(category);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
    `);

    // 2. 過去の audit_logs レコードへの tenant_id 補完
    await db.exec(`
      UPDATE audit_logs a
      SET tenant_id = s.tenant_id
      FROM stores s
      WHERE a.store_id = s.id AND a.tenant_id IS NULL;

      UPDATE audit_logs a
      SET tenant_id = u.tenant_id
      FROM users u
      WHERE a.user_id = u.id AND a.tenant_id IS NULL;
    `);

    // 3. security_logs テーブルの作成
    await db.exec(`
      CREATE TABLE IF NOT EXISTS security_logs (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        username_attempted TEXT,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        action_advice TEXT,
        ip_address TEXT,
        user_agent TEXT,
        endpoint TEXT,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_security_logs_created ON security_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_security_logs_severity ON security_logs(severity);
      CREATE INDEX IF NOT EXISTS idx_security_logs_event_type ON security_logs(event_type);
      CREATE INDEX IF NOT EXISTS idx_security_logs_tenant ON security_logs(tenant_id);
    `);

    return NextResponse.json({
      success: true,
      message: '監査ログおよびセキュリティログのマイグレーションが正常に完了しました',
    });
  } catch (err: any) {
    console.error('Audit/Security logs migration error:', err);
    return NextResponse.json({
      error: 'マイグレーションに失敗しました',
      details: err?.message || '不明なエラー',
    }, { status: 500 });
  }
}
