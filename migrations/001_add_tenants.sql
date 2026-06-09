-- ============================================================
-- マイグレーション 001: テナント（会社）階層の追加
-- 実行対象: 開発用Supabase（確認後、本番用にも同じSQLを実行する）
-- 実行日: 2026-06-08
-- 説明: 「会社(tenant) > 店舗(store)」の階層構造を追加する
--       既存のデータ（ユーザー・店舗・商品・材料）はすべて保持される
-- ============================================================

-- ① tenantsテーブルを新規作成する
--    既に存在する場合は何もしない（安全）
CREATE TABLE IF NOT EXISTS tenants (
  id          SERIAL PRIMARY KEY,
  tenant_code TEXT UNIQUE NOT NULL,       -- 会社を識別する短いコード（例: MK, COREDO）
  tenant_name TEXT NOT NULL,              -- 会社名（例: 株式会社マールカフェ）
  plan        TEXT DEFAULT 'basic',       -- 契約プラン (basic, standard, premium など)
  status      TEXT DEFAULT 'active',      -- 契約状態 (active / suspended)
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ② storesテーブルに tenant_id 列を追加する
--    既に列が存在する場合は何もしない（安全）
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL;

-- ③ usersテーブルに tenant_id 列を追加する
--    スーパー管理者はNULL、それ以外のユーザーは所属会社のIDが入る
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL;

-- ④ インデックスを追加して検索を高速化する
CREATE INDEX IF NOT EXISTS idx_stores_tenant_id ON stores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);

-- ============================================================
-- ★ここから下は「既存データの紐づけ」作業★
-- 既存の店舗データを1つのテナントにまとめて紐づける場合に使用する。
-- 実行する場合は、以下の「MK Bakery」の部分を実際の会社名に変更してから実行してください。
-- ============================================================

-- （任意）既存店舗をまとめる会社（テナント）を1件登録する例
-- INSERT INTO tenants (tenant_code, tenant_name, plan)
-- VALUES ('MK', '株式会社MKベーカリー', 'standard')
-- ON CONFLICT (tenant_code) DO NOTHING;

-- （任意）既存の全店舗を上で登録した会社（テナント）に紐づける例
-- UPDATE stores
-- SET tenant_id = (SELECT id FROM tenants WHERE tenant_code = 'MK')
-- WHERE tenant_id IS NULL;

-- （任意）既存の全ユーザー（super_admin以外）を同じ会社に紐づける例
-- UPDATE users
-- SET tenant_id = (SELECT id FROM tenants WHERE tenant_code = 'MK')
-- WHERE role != 'super_admin' AND tenant_id IS NULL;

-- ============================================================
-- 確認用クエリ（実行後に結果を見てデータを確認できる）
-- ============================================================
-- SELECT * FROM tenants;
-- SELECT id, store_code, store_name, tenant_id FROM stores;
-- SELECT id, username, role, tenant_id FROM users;
