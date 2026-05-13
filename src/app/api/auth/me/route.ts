import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const sessionCookie = request.cookies.get('bakery_session');
  
  if (!sessionCookie || !sessionCookie.value) {
    return NextResponse.json({ user: null });
  }

  try {
    const sessionData = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
    return NextResponse.json({ user: sessionData });
  } catch (e) {
    return NextResponse.json({ user: null });
  }
}
