/**
 * APIルート共通のセッション・テナント解析ヘルパー
 * 
 * 返り値:
 *   user      - ログインユーザー情報
 *   tenantId  - 所属テナントID（super_adminはnull → 全データにアクセス可）
 *   error     - エラー時のレスポンス（これを返せばOK）
 */

import { cookies } from 'next/headers';

export type SessionUser = {
  id: number;
  username: string;
  role: string;
  tenant_id: number | null;
};

export async function getSessionUser(): Promise<
  { user: SessionUser; error: null } | { user: null; error: Response }
> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('bakery_session');

  if (!sessionCookie?.value) {
    return {
      user: null,
      error: new Response(JSON.stringify({ error: 'ログインが必要です' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }

  try {
    const user = JSON.parse(
      Buffer.from(sessionCookie.value, 'base64').toString('utf-8')
    ) as SessionUser;
    return { user, error: null };
  } catch {
    return {
      user: null,
      error: new Response(JSON.stringify({ error: '無効なセッションです' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }
}

/**
 * super_admin は全テナントのデータにアクセス可能。
 * それ以外のロール（admin, master, manager, chef）は
 * 自分のテナント（tenant_id）のデータのみに制限される。
 *
 * WHERE句に追加するための条件文字列とパラメータを返す。
 *
 * 例:
 *   const { clause, params } = tenantFilter(user, existingParams);
 *   const rows = await db.all(`SELECT * FROM stores WHERE 1=1 ${clause}`, params);
 */
export function tenantFilter(
  user: SessionUser,
  existingParams: any[] = []
): { clause: string; params: any[] } {
  if (user.role === 'super_admin' || user.tenant_id === null) {
    // super_admin は全テナントにアクセス可
    return { clause: '', params: existingParams };
  }
  const nextIdx = existingParams.length + 1;
  return {
    clause: ` AND tenant_id = $${nextIdx}`,
    params: [...existingParams, user.tenant_id],
  };
}
