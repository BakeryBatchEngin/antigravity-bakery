import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const sessionCookie = request.cookies.get('bakery_session');
  const activeStoreCookie = request.cookies.get('active_store_id');
  
  if (!sessionCookie || !sessionCookie.value) {
    return NextResponse.json({ user: null });
  }

  try {
    const sessionData = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
    
    // active_store_id の値を取得（"manager" という文字列か数値のどちらかを返す）
    let activeStoreId: number | 'manager' | null = null;
    if (activeStoreCookie?.value) {
      if (activeStoreCookie.value === 'manager') {
        activeStoreId = 'manager';
      } else {
        activeStoreId = Number(activeStoreCookie.value) || null;
      }
    }

    // マネージャーがログインしてCookieがまだない場合は "manager" モードをデフォルトにする
    if (sessionData.role === 'manager' && activeStoreId === null) {
      activeStoreId = 'manager';
    }
    
    const db = await getDb();
    const storesRes = await db.all('SELECT id, store_code, store_name FROM stores ORDER BY store_code ASC');

    return NextResponse.json({ 
      user: sessionData, 
      activeStoreId: activeStoreId,
      stores: storesRes || []
    });
  } catch (e) {
    return NextResponse.json({ user: null });
  }
}
