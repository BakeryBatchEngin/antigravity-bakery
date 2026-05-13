import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ success: true });
  
  // セッションCookieを削除
  response.cookies.set({
    name: 'bakery_session',
    value: '',
    httpOnly: true,
    path: '/',
    maxAge: 0, // 即時無効化
  });

  return response;
}
