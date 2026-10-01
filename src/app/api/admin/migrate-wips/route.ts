import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('bakery_session');
    
    if (!sessionCookie || !sessionCookie.value) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }
    
    // 認証チェックを緩和（一時的なマイグレーション用。ログイン済みなら許可）
    let user;
    try {
      user = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
    } catch (e) {
      return NextResponse.json({ error: '無効なセッションです' }, { status: 401 });
    }

    const db = await getDb();
    
    // wipsテーブルの作成
    await db.exec(`
      CREATE TABLE IF NOT EXISTS wips (
        id SERIAL PRIMARY KEY,
        wip_code TEXT UNIQUE NOT NULL,
        wip_name TEXT NOT NULL,
        tenant_id INTEGER REFERENCES tenants(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // wip_ingredientsテーブルの作成
    await db.exec(`
      CREATE TABLE IF NOT EXISTS wip_ingredients (
        id SERIAL PRIMARY KEY,
        wip_code TEXT REFERENCES wips(wip_code) ON DELETE CASCADE,
        ingredient_code TEXT NOT NULL,
        ingredient_name TEXT NOT NULL,
        ingredient_amount REAL NOT NULL,
        tenant_id INTEGER REFERENCES tenants(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    return NextResponse.json({ success: true, message: 'WIP migration completed successfully (role=' + user.role + ')' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
