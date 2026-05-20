import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const store_id = body.store_id;

    // "manager" という特別な文字列（マネージャーモード）か、数値（店舗ID）を受け付ける
    if (store_id === undefined || store_id === null) {
      return NextResponse.json({ error: '店舗IDが必要です' }, { status: 400 });
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
