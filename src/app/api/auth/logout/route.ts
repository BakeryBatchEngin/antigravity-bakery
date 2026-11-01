import { NextResponse } from 'next/server';

export async function POST() {
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
