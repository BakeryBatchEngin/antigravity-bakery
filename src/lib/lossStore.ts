/**
 * ロス管理（店舗販売ロス）専用: 操作対象の店舗IDを決める共通ヘルパー
 *
 * ルール:
 *  - 店舗ロス管理者など: 自分に紐づく店舗のみ（Cookieやリクエストでの店舗指定は無視）
 *  - 企業ロス統括管理者 / admin / super_admin:
 *      ヘッダーで選択した店舗（Cookie: active_store_id）を使う。
 *      ただし「自社（テナント）の店舗」かを必ずDBで確認する（super_admin は全社可）。
 *      未選択・不正な場合は、自社の先頭の店舗をデフォルトにする。
 */
import { cookies } from 'next/headers';
import type { SessionUser } from '@/lib/session';

// ヘッダーで店舗を切り替えられるロール
export const STORE_SWITCHABLE_ROLES = ['company_loss_manager', 'admin', 'super_admin'];

type Db = { get: Function; all: Function };

export type LossStoreResult =
  | { storeId: number; error: null; status: 200 }
  | { storeId: null; error: string; status: 403 };

export async function resolveLossStoreId(db: Db, user: SessionUser): Promise<LossStoreResult> {
  // 店舗を切り替えられないロール: 自分に紐づく店舗のみ
  if (!STORE_SWITCHABLE_ROLES.includes(user.role)) {
    const own = await db.get(
      'SELECT store_id FROM user_stores WHERE user_id = $1 ORDER BY store_id ASC LIMIT 1',
      [user.id]
    );
    if (!own?.store_id) {
      return { storeId: null, error: '店舗情報が見つかりません。', status: 403 };
    }
    return { storeId: Number(own.store_id), error: null, status: 200 };
  }

  const isSuperAdmin = user.role === 'super_admin';

  // ヘッダーで選択された店舗（Cookie）。"manager" などの数値でない値は無視
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get('active_store_id')?.value;
  const requestedId = Number(cookieValue);

  if (cookieValue && Number.isInteger(requestedId) && requestedId > 0) {
    const target = await db.get('SELECT id, tenant_id FROM stores WHERE id = $1', [requestedId]);
    if (target && (isSuperAdmin || Number(target.tenant_id) === Number(user.tenant_id))) {
      return { storeId: Number(target.id), error: null, status: 200 };
    }
    // 他社の店舗などは無視して、下のデフォルトにフォールバック
  }

  // デフォルト: 自社の先頭の店舗（super_admin は全体の先頭）
  const first = isSuperAdmin || user.tenant_id === null
    ? await db.get('SELECT id FROM stores ORDER BY store_code ASC LIMIT 1')
    : await db.get('SELECT id FROM stores WHERE tenant_id = $1 ORDER BY store_code ASC LIMIT 1', [user.tenant_id]);

  if (!first?.id) {
    return { storeId: null, error: '対象の店舗が登録されていません。', status: 403 };
  }
  return { storeId: Number(first.id), error: null, status: 200 };
}
