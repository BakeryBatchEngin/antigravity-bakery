import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ success: true });
  
  response.cookies.set({
    name: 'bakery_session',
    value: '',
    httpOnly: true,
    path: '/',
    maxAge: 0, // 即時無効化
  });

  response.cookies.set({
    name: 'bakery_session_sig',
    value: '',
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });

  return response;
}
