import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/authCrypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const store_id = body.store_id;

    // "manager" という特別な文字列（マネージャーモード）か、数値（店舗ID）を受け付ける
    if (store_id === undefined || store_id === null) {
      return NextResponse.json({ error: '店舗IDが必要です' }, { status: 400 });
    }

    // 数値（店舗ID）の場合は、ログイン済みで、かつ「自社の店舗」であることを確認する
    // （このAPIは公開パスのため、ここで署名付きセッションを自前で検証する）
    if (store_id !== 'manager') {
      const sessionCookie = request.cookies.get('bakery_session');
      const sigCookie = request.cookies.get('bakery_session_sig');
      if (!sessionCookie?.value || !sigCookie?.value || !(await verifySession(sessionCookie.value, sigCookie.value))) {
        return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
      }
      const session = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));

      const targetId = Number(store_id);
      if (!Number.isInteger(targetId) || targetId <= 0) {
        return NextResponse.json({ error: '店舗IDが不正です' }, { status: 400 });
      }

      const db = await getDb();
      const store = await db.get('SELECT id, tenant_id FROM stores WHERE id = $1', [targetId]);
      const isSuperAdmin = session.role === 'super_admin';
      if (!store || (!isSuperAdmin && Number(store.tenant_id) !== Number(session.tenant_id))) {
        return NextResponse.json({ error: 'この店舗には切り替えできません' }, { status: 403 });
      }
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set({
      name: 'active_store_id',
      value: String(store_id),
      httpOnly: true,
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30, // 30日間有効
      sameSite: 'lax',
    });

    return response;
  } catch (error) {
    console.error('Error setting active store:', error);
    return NextResponse.json({ error: '店舗の切り替えに失敗しました' }, { status: 500 });
  }
}
