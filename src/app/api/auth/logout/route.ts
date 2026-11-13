import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { logActivity } from '@/lib/logger';

export async function POST(request: Request) {
  try {
    const { user } = await getSessionUser();
    if (user) {
      await logActivity({
        tenantId: user.tenant_id,
        userId: user.is_xmas ? null : user.id,
        action: 'LOGOUT',
        category: user.is_xmas ? 'xmas' : 'auth',
        tableName: user.is_xmas ? 'xmas_accounts' : 'users',
        recordId: user.id,
        description: `${user.is_xmas ? '[クリスマス] ' : ''}${user.displayName || user.username} がログアウトしました`,
      });
    }
  } catch {
    // ログアウト処理自体は失敗させない
  }

  const response = NextResponse.json({ success: true });
  const isProduction = process.env.NODE_ENV === 'production';
  
  response.cookies.set({
    name: 'bakery_session',
    value: '',
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0, // 即時無効化
  });

  response.cookies.set({
    name: 'bakery_session_sig',
    value: '',
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
