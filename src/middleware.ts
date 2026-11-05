import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 認証不要でアクセスできる公開パス
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/me', '/api/auth/logout', '/api/auth/store', '/favicon.ico', '/apple-icon.png', '/presentation'];

// 公開静的ファイルの拡張子（APIルートは除外）
const PUBLIC_STATIC_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp'];

// ロールごとのアクセス可能パス（接頭辞）
const ROLE_ACCESS = {
  admin: ['/'], // admin は全パスアクセス可能とするので特殊扱い
  master: ['/admin/ingredients', '/admin/doughs', '/admin/wips', '/admin/products', '/production', '/reports', '/orders', '/order-breakdowns', '/settings', '/forecast'], 
  manager: ['/production', '/reports', '/orders', '/order-breakdowns', '/settings', '/mixers', '/manager', '/api/admin/products', '/api/admin/doughs', '/forecast'], 
  chef: ['/production', '/reports', '/orders', '/order-breakdowns', '/settings', '/mixers', '/api/admin/products', '/api/admin/doughs', '/forecast'], 
  store_loss_manager: [
    '/store-manager/waste',
    '/store-manager/profile',
    '/store-manager/analytics',
    '/api/vision',
    '/api/waste',
    '/api/orders/import-weekly',
    '/api/store-profile',
    '/api/loss-analytics',
  ],
  company_loss_manager: [
    '/store-manager',
    '/api/vision',
    '/api/waste',
    '/api/orders/import-weekly',
    '/api/sales-products',
    '/api/store-profile',
    '/api/loss-analytics',
  ],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Next.js 内部リソース（_next）は無条件スルー
  if (pathname.startsWith('/_next')) {
    return NextResponse.next();
  }

  // 2. 公開静的ファイル（画像・ファビコンなど）のスルー（APIルートは絶対に拡張子スルーさせない）
  if (!pathname.startsWith('/api/')) {
    const isPublicStatic = PUBLIC_STATIC_EXTENSIONS.some(ext => pathname.toLowerCase().endsWith(ext));
    if (isPublicStatic) {
      return NextResponse.next();
    }
  }

  // 3. 公開ページ・公開APIのスルー
  if (PUBLIC_PATHS.includes(pathname)) {
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
    // 署名の検証（定数時間比較）
    const sigCookie = request.cookies.get('bakery_session_sig');
    if (!sigCookie || !sigCookie.value) {
      throw new Error("Missing signature");
    }
    const { verifySession } = await import('@/lib/authCrypto');
    const isValid = await verifySession(sessionCookie.value, sigCookie.value);
    if (!isValid) {
      throw new Error("Invalid signature");
    }

    // セッションのデコード（Base64）
    const sessionData = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
    const role = sessionData.role;

    if (!role) {
      throw new Error("Invalid session data");
    }

    // セッション有効期限（exp）の検証（移行前の既存セッションは猶予して通す）
    if (sessionData.exp && sessionData.exp < Math.floor(Date.now() / 1000)) {
      throw new Error("Expired session");
    }

    // /super-admin/* は super_admin のみアクセス可
    if (pathname.startsWith('/super-admin') || pathname.startsWith('/api/super-admin')) {
      if (role !== 'super_admin') {
        return NextResponse.redirect(new URL('/', request.url));
      }
      return NextResponse.next();
    }

    // super_admin は super-admin 以外のページは不要なのでトップへ
    if (role === 'super_admin') {
      return NextResponse.next();
    }

    // admin はアプリ全体にアクセス可（/super-admin は上で除外済み）
    if (role === 'admin') {
      return NextResponse.next();
    }

    // それ以外のロール
    const allowedPaths = ROLE_ACCESS[role as keyof typeof ROLE_ACCESS] || [];
    
    // マスターデータの書き込み（POST/PUT/DELETE/PATCH）は master/admin/super_admin のみ許可
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
      const masterApiPrefixes = [
        '/api/admin/ingredients', 
        '/api/admin/doughs', 
        '/api/admin/wips', 
        '/api/admin/products'
      ];
      if (masterApiPrefixes.some(p => pathname.startsWith(p))) {
        if (role !== 'master') {
          return new NextResponse(
            JSON.stringify({ error: 'Permission denied: Read-only access for master data' }), 
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
    }

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
    // セッションデータが不正または期限切れの場合はCookieを消してログインへ
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('bakery_session');
    response.cookies.delete('bakery_session_sig');
    return response;
  }
}

// 適用するルートを限定
export const config = {
  matcher: [
    '/((?!_next/static|_next/image).*)',
  ],
};
