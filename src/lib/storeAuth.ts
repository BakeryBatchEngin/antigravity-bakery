import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getDb, PgCompatibleDb } from '@/lib/db';
import type { SessionUser } from '@/lib/session';
import { verifySession } from '@/lib/authCrypto';
import { logSecurityEvent } from '@/lib/logger';

export type StoreAuthSuccess = {
  user: SessionUser;
  storeId: number;
  db: PgCompatibleDb;
  errorResponse: null;
};

export type StoreAuthManagerModeSuccess = {
  user: SessionUser;
  storeId: 'manager';
  db: PgCompatibleDb;
  errorResponse: null;
};

export type StoreAuthFailure = {
  user: null;
  storeId: null;
  db: null;
  errorResponse: NextResponse;
};

export interface ResolveStoreAuthOptions {
  allowedRoles?: string[];
  allowManagerMode?: boolean;
}

/**
 * 仕込み系・発注系・ロス管理系共通の安全な店舗コンテキスト解決ヘルパー
 */
export async function resolveStoreAuth(
  options: { allowManagerMode: true; allowedRoles?: string[] }
): Promise<StoreAuthSuccess | StoreAuthManagerModeSuccess | StoreAuthFailure>;
export async function resolveStoreAuth(
  options?: { allowManagerMode?: false; allowedRoles?: string[] }
): Promise<StoreAuthSuccess | StoreAuthFailure>;
export async function resolveStoreAuth(
  options: ResolveStoreAuthOptions = {}
): Promise<StoreAuthSuccess | StoreAuthManagerModeSuccess | StoreAuthFailure> {
  const allowedRoles = options.allowedRoles || ['admin', 'master', 'manager', 'chef', 'super_admin'];

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('bakery_session');
  const sigCookie = cookieStore.get('bakery_session_sig');

  if (!sessionCookie?.value) {
    return {
      user: null,
      storeId: null,
      db: null,
      errorResponse: NextResponse.json({ error: 'ログインが必要です' }, { status: 401 }),
    };
  }

  // 署名の検証（改ざん検知）
  if (sigCookie?.value) {
    const isValid = await verifySession(sessionCookie.value, sigCookie.value);
    if (!isValid) {
      await logSecurityEvent({
        eventType: 'INVALID_SIGNATURE',
        severity: 'CRITICAL',
        message: 'Cookie署名の不一致（セッション改ざん試行の疑い）を検知しブロックしました',
        endpoint: 'resolveStoreAuth',
      });
      return {
        user: null,
        storeId: null,
        db: null,
        errorResponse: NextResponse.json({ error: 'セッション署名が無効です' }, { status: 401 }),
      };
    }
  }

  let user: SessionUser;
  try {
    user = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8')) as SessionUser;
  } catch {
    return {
      user: null,
      storeId: null,
      db: null,
      errorResponse: NextResponse.json({ error: '無効なセッションです' }, { status: 401 }),
    };
  }

  // 有効期限の検証（既存セッションは猶予して通す）
  if (user.exp && user.exp < Math.floor(Date.now() / 1000)) {
    return {
      user: null,
      storeId: null,
      db: null,
      errorResponse: NextResponse.json({ error: 'セッションの有効期限が切れました。再度ログインしてください。' }, { status: 401 }),
    };
  }

  if (!allowedRoles.includes(user.role)) {
    return {
      user: null,
      storeId: null,
      db: null,
      errorResponse: NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 }),
    };
  }

  // RLS (Row Level Security) が適用されたDB接続を生成
  const db = await getDb(user);

  const storeCookie = cookieStore.get('active_store_id');
  const cookieValue = storeCookie?.value;

  // マネージャーモードの特別処理
  if (cookieValue === 'manager' && options.allowManagerMode) {
    if (['manager', 'admin', 'super_admin'].includes(user.role)) {
      return { user, storeId: 'manager', db, errorResponse: null };
    }
  }

  const isSuperAdmin = user.role === 'super_admin';
  const requestedStoreId = cookieValue && cookieValue !== 'manager' ? Number(cookieValue) : null;
  let resolvedStoreId: number | null = null;

  // 1. シェフまたは店舗ロス管理者の場合: user_stores に登録された自店舗のみ
  if (user.role === 'chef' || user.role === 'store_loss_manager') {
    const userStores = await db.all(
      'SELECT store_id FROM user_stores WHERE user_id = $1 ORDER BY store_id ASC',
      [user.id]
    );
    if (!userStores || userStores.length === 0) {
      return {
        user: null,
        storeId: null,
        db: null,
        errorResponse: NextResponse.json(
          { error: '所属店舗が設定されていません。管理者に連絡してください。' },
          { status: 403 }
        ),
      };
    }
    const allowedIds = userStores.map((r: any) => Number(r.store_id));
    if (requestedStoreId && allowedIds.includes(requestedStoreId)) {
      resolvedStoreId = requestedStoreId;
    } else {
      resolvedStoreId = allowedIds[0];
    }
  } else {
    // 2. admin / master / manager / company_loss_manager / super_admin
    // Cookieで指定された店舗がある場合、自社（テナント）の店舗かをDBで厳格に検証する
    if (requestedStoreId && Number.isInteger(requestedStoreId) && requestedStoreId > 0) {
      const targetStore = await db.get('SELECT id, tenant_id FROM stores WHERE id = $1', [requestedStoreId]);
      if (targetStore && (isSuperAdmin || Number(targetStore.tenant_id) === Number(user.tenant_id))) {
        resolvedStoreId = Number(targetStore.id);
      } else if (targetStore && !isSuperAdmin && Number(targetStore.tenant_id) !== Number(user.tenant_id)) {
        await logSecurityEvent({
          tenantId: user.tenant_id,
          userId: user.id,
          eventType: 'FORBIDDEN_STORE_ACCESS',
          severity: 'WARNING',
          message: `他テナントの店舗 (ID:${requestedStoreId}) へのアクセス試行を検知し自社店舗へ切り替えました`,
          endpoint: 'resolveStoreAuth',
        });
      }
    }

    // 指定店舗がない、または他社店舗だった場合は、自社の先頭店舗を安全にデフォルトとする
    if (!resolvedStoreId) {
      const firstStore = isSuperAdmin || user.tenant_id === null
        ? await db.get('SELECT id FROM stores ORDER BY store_code ASC LIMIT 1')
        : await db.get('SELECT id FROM stores WHERE tenant_id = $1 ORDER BY store_code ASC LIMIT 1', [user.tenant_id]);

      if (firstStore?.id) {
        resolvedStoreId = Number(firstStore.id);
      }
    }
  }

  if (!resolvedStoreId) {
    return {
      user: null,
      storeId: null,
      db: null,
      errorResponse: NextResponse.json({ error: '店舗が選択されていないか、存在しません' }, { status: 400 }),
    };
  }

  return { user, storeId: resolvedStoreId, db, errorResponse: null };
}
