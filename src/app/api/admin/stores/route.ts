import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';

// セッションからユーザー情報を取得する共通処理
async function getUser() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('bakery_session');
  if (!sessionCookie?.value) return null;
  try {
    return JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

// 店舗一覧の取得（自分のテナントの店舗のみ、super_adminは全店舗）
export async function GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDb(user);

    let stores;
    if (user.role === 'super_admin') {
      // super_admin は全店舗を見られる
      stores = await db.all(`
        SELECT s.id, s.store_code, s.store_name, s.tenant_id, s.created_at,
               t.tenant_name
        FROM stores s
        LEFT JOIN tenants t ON s.tenant_id = t.id
        ORDER BY s.store_code ASC
      `);
    } else {
      // それ以外は自分のテナントの店舗のみ
      stores = await db.all(`
        SELECT s.id, s.store_code, s.store_name, s.tenant_id, s.created_at,
               t.tenant_name
        FROM stores s
        LEFT JOIN tenants t ON s.tenant_id = t.id
        WHERE s.tenant_id = ?
        ORDER BY s.store_code ASC
      `, [user.tenant_id]);
    }

    return NextResponse.json({ stores });
  } catch (error) {
    console.error('Error fetching stores:', error);
    return NextResponse.json({ error: '店舗の取得に失敗しました' }, { status: 500 });
  }
}

// 店舗の新規作成（admin または super_admin のみ許可）
export async function POST(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    // 権限チェック：店舗作成は管理者(admin)またはスーパー管理者(super_admin)のみ
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: '店舗を新規追加する権限がありません' }, { status: 403 });
    }

    const data = await request.json();
    const { store_code, store_name } = data;

    if (!store_code || !store_name) {
      return NextResponse.json({ error: '店舗コードと店舗名が必要です' }, { status: 400 });
    }

    const db = await getDb(user);
    const normalizedCode = store_code.trim().toUpperCase();

    // 店舗コードの重複チェック
    const existingStore = await db.get(`SELECT id FROM stores WHERE store_code = ?`, [normalizedCode]);
    if (existingStore) {
      return NextResponse.json({ error: 'この店舗コードは既に使用されています' }, { status: 409 });
    }

    // super_admin は指定テナント、それ以外は自分のテナントに自動所属
    const tenantId = user.role === 'super_admin' ? (data.tenant_id || null) : user.tenant_id;

    if (!tenantId && user.role !== 'super_admin') {
      return NextResponse.json({ error: '所属会社（テナント）が設定されていません' }, { status: 400 });
    }

    await db.run(
      `INSERT INTO stores (store_code, store_name, tenant_id) VALUES (?, ?, ?)`,
      [normalizedCode, store_name.trim(), tenantId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error creating store:', error);
    return NextResponse.json({ error: '店舗の作成に失敗しました' }, { status: 500 });
  }
}

// 店舗の更新（admin または super_admin のみ許可）
export async function PUT(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: '店舗情報を編集する権限がありません' }, { status: 403 });
    }

    const data = await request.json();
    const { id, store_code, store_name } = data;

    if (!id || !store_code || !store_name) {
      return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 });
    }

    const db = await getDb(user);
    const normalizedCode = store_code.trim().toUpperCase();

    // 自分のテナントの店舗かチェック（super_adminは全店舗OK）
    if (user.role !== 'super_admin') {
      const store = await db.get(`SELECT tenant_id FROM stores WHERE id = ?`, [id]);
      if (!store || store.tenant_id !== user.tenant_id) {
        return NextResponse.json({ error: '他のテナントの店舗は変更できません' }, { status: 403 });
      }
    }

    const existingStore = await db.get(`SELECT id FROM stores WHERE store_code = ? AND id != ?`, [normalizedCode, id]);
    if (existingStore) {
      return NextResponse.json({ error: 'この店舗コードは他の店舗で使用されています' }, { status: 409 });
    }

    await db.run(
      `UPDATE stores SET store_code = ?, store_name = ? WHERE id = ?`,
      [normalizedCode, store_name.trim(), id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating store:', error);
    return NextResponse.json({ error: '店舗の更新に失敗しました' }, { status: 500 });
  }
}

// 店舗の削除（admin または super_admin のみ許可）
export async function DELETE(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: '店舗を削除する権限がありません' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: '店舗IDが必要です' }, { status: 400 });

    const db = await getDb(user);

    // 自分のテナントの店舗かチェック
    if (user.role !== 'super_admin') {
      const store = await db.get(`SELECT tenant_id FROM stores WHERE id = ?`, [id]);
      if (!store || store.tenant_id !== user.tenant_id) {
        return NextResponse.json({ error: '他のテナントの店舗は削除できません' }, { status: 403 });
      }
    }

    await db.run(`DELETE FROM stores WHERE id = ?`, [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting store:', error);
    return NextResponse.json({ error: '店舗の削除に失敗しました' }, { status: 500 });
  }
}
