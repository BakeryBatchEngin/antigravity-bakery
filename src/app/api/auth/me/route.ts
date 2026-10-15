import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/authCrypto';

export async function GET(request: NextRequest) {
  const sessionCookie = request.cookies.get('bakery_session');
  const sigCookie = request.cookies.get('bakery_session_sig');
  const activeStoreCookie = request.cookies.get('active_store_id');
  
  if (!sessionCookie || !sessionCookie.value) {
    return NextResponse.json({ user: null });
  }

  try {
    // 署名を検証（改ざんされたセッションには店舗一覧を返さない）
    if (!sigCookie?.value || !(await verifySession(sessionCookie.value, sigCookie.value))) {
      return NextResponse.json({ user: null });
    }

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

    // 店舗一覧: super_admin は全店舗、それ以外は「自社（テナント）の店舗のみ」を返す
    // （他社の店舗名がブラウザに渡らないようにする）
    const storesRes = (sessionData.role === 'super_admin' || sessionData.tenant_id == null)
      ? await db.all('SELECT id, store_code, store_name FROM stores ORDER BY store_code ASC')
      : await db.all(
          'SELECT id, store_code, store_name FROM stores WHERE tenant_id = $1 ORDER BY store_code ASC',
          [sessionData.tenant_id]
        );

    // 企業ロス統括管理者: 選択中の店舗が自社に無い／未選択なら、自社の先頭の店舗を選択中として返す
    // （ロス管理API側 resolveLossStoreId と同じ決め方）
    if (sessionData.role === 'company_loss_manager') {
      const isOwnStore = typeof activeStoreId === 'number' && storesRes.some((s: any) => Number(s.id) === activeStoreId);
      if (!isOwnStore) {
        activeStoreId = storesRes.length > 0 ? Number(storesRes[0].id) : null;
      }
    }

    return NextResponse.json({ 
      user: sessionData, 
      activeStoreId: activeStoreId,
      stores: storesRes || []
    });
  } catch (e) {
    return NextResponse.json({ user: null });
  }
}
