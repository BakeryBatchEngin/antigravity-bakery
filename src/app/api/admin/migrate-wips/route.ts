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
    
    let user;
    try {
      user = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
    } catch (e) {
      return NextResponse.json({ error: '無効なセッションです' }, { status: 401 });
    }

    const db = await getDb();
    
    // 間違ったスキーマで作成されたテーブルを削除
    await db.exec(`
      DROP TABLE IF EXISTS wip_ingredients CASCADE;
      DROP TABLE IF EXISTS wips CASCADE;
    `);

    // 正しいスキーマで wips を作成
    await db.exec(`
      CREATE TABLE IF NOT EXISTS wips (
        wip_code TEXT NOT NULL,
        wip_name TEXT NOT NULL,
        memo TEXT,
        informart_url TEXT,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (wip_code, tenant_id)
      );
    `);

    // 正しいスキーマで wip_ingredients を作成
    await db.exec(`
      CREATE TABLE IF NOT EXISTS wip_ingredients (
        wip_code TEXT NOT NULL,
        ingredient_code TEXT NOT NULL,
        ingredient_name TEXT,
        ingredient_amount REAL NOT NULL,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (wip_code, ingredient_code, tenant_id),
        FOREIGN KEY (wip_code, tenant_id) REFERENCES wips(wip_code, tenant_id) ON DELETE CASCADE,
        FOREIGN KEY (ingredient_code, tenant_id) REFERENCES ingredients(ingredient_code, tenant_id) ON DELETE CASCADE
      );
    `);

    return NextResponse.json({ success: true, message: 'WIP schema fixed and created successfully' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
