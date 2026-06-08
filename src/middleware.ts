import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 認証不要でアクセスできるパス（ログインAPIや画像など）
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/me', '/api/auth/logout', '/api/auth/store', '/favicon.ico'];

// マネージャー専用APIの許可パス（/api/reports/manager は /reports に含まれるためOK）

// ロールごとのアクセス可能パス（接頭辞）
const ROLE_ACCESS = {
  admin: ['/'], // admin は全パスアクセス可能とするので特殊扱い
  master: ['/admin/ingredients', '/admin/doughs', '/admin/products', '/production', '/reports', '/orders', '/order-breakdowns', '/settings'], 
  manager: ['/production', '/reports', '/orders', '/order-breakdowns', '/settings', '/mixers', '/manager'], 
  chef: ['/production', '/reports', '/orders', '/order-breakdowns', '/settings', '/mixers'], 
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 静的ファイルや公開パスはスルー
  if (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.ai') ||
    pathname.endsWith('.csv') ||
    pathname.endsWith('.xlsx')
  ) {
    // ログイン済みユーザーが /login にアクセスした場合はトップへリダイレクト
    if (pathname === '/login') {
      const session = request.cookies.get('bakery_session');
      if (session && session.value) {
         return NextResponse.redirect(new URL('/', request.url));
      }
    }
    return NextResponse.next();
  }

  // Cookieからセッションを取得
  const sessionCookie = request.cookies.get('bakery_session');
  
  if (!sessionCookie || !sessionCookie.value) {
    // 未ログインの場合はログイン画面へ
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  try {
    // セッションのデコード（Base64）
    const sessionData = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
    const role = sessionData.role;

    if (!role) {
      throw new Error("Invalid session data");
    }

    // admin と super_admin はどこでもアクセス可
    if (role === 'admin' || role === 'super_admin') {
      return NextResponse.next();
    }

    // それ以外のロール
    const allowedPaths = ROLE_ACCESS[role as keyof typeof ROLE_ACCESS] || [];
    
    // トップページ（`/`）へのアクセス時は、権限に応じたポータルへ飛ばす処理は page.tsx 側で行うが
    // もし直接URLを叩かれた場合のチェック
    if (pathname !== '/') {
      const isAllowed = allowedPaths.some(p => 
        pathname.startsWith(p) || pathname.startsWith('/api' + p)
      );
      if (!isAllowed) {
        // アクセス権限がない場合はトップページ（ポータル）へ
        return NextResponse.redirect(new URL('/', request.url));
      }
    }

    // 認証OK
    return NextResponse.next();
  } catch (error) {
    // セッションデータが不正な場合はCookieを消してログインへ
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('bakery_session');
    return response;
  }
}

// 適用するルートを限定（APIの一部やNext.js内部通信を除く）
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes) -> Except we want to protect some APIs, so we let middleware run, or we can protect APIs inside the route itself.
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image).*)',
  ],
};
