import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';

async function checkSuperAdmin() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('bakery_session');
  if (!sessionCookie?.value) return null;
  try {
    const user = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
    return user.role === 'super_admin' ? user : null;
  } catch {
    return null;
  }
}

// GET: 全店舗一覧およびテナント一覧の取得
export async function GET() {
  const admin = await checkSuperAdmin();
  if (!admin) return NextResponse.json({ error: '権限がありません' }, { status: 403 });

  try {
    const db = await getDb(admin);

    // 全店舗の取得（所属テナント名付き）
    const stores = await db.all(`
      SELECT 
        s.id, s.store_code, s.store_name, s.tenant_id, s.created_at,
        t.tenant_name, t.tenant_code
      FROM stores s
      LEFT JOIN tenants t ON s.tenant_id = t.id
      ORDER BY t.tenant_name ASC, s.store_code ASC
    `);

    // テナント一覧（新規追加時の所属会社プルダウン用）
    const tenants = await db.all(`
      SELECT id, tenant_code, tenant_name 
      FROM tenants 
      ORDER BY tenant_name ASC
    `);

    return NextResponse.json({ stores, tenants });
  } catch (error: any) {
    console.error('Error fetching super-admin stores:', error);
    return NextResponse.json({ error: '店舗一覧の取得に失敗しました' }, { status: 500 });
  }
}

// POST: 新規店舗作成（super_admin用：tenant_id必須）
export async function POST(request: Request) {
  const admin = await checkSuperAdmin();
  if (!admin) return NextResponse.json({ error: '権限がありません' }, { status: 403 });

  try {
    const data = await request.json();
    const { store_code, store_name, tenant_id } = data;

    if (!store_code || !store_name || !tenant_id) {
      return NextResponse.json({ error: '店舗コード・店舗名・所属会社は必須です' }, { status: 400 });
    }

    const db = await getDb(admin);

    // テナントの存在確認
    const tenant = await db.get(`SELECT id FROM tenants WHERE id = ?`, [tenant_id]);
    if (!tenant) {
      return NextResponse.json({ error: '指定された会社（テナント）が存在しません' }, { status: 404 });
    }

    // 店舗コードの重複チェック（全体で一意または自社で一意）
    const existing = await db.get(`SELECT id FROM stores WHERE store_code = ?`, [store_code.trim().toUpperCase()]);
    if (existing) {
      return NextResponse.json({ error: 'この店舗コードは既に使用されています' }, { status: 409 });
    }

    await db.run(
      `INSERT INTO stores (store_code, store_name, tenant_id) VALUES (?, ?, ?)`,
      [store_code.trim().toUpperCase(), store_name.trim(), Number(tenant_id)]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error creating store:', error);
    return NextResponse.json({ error: '店舗の作成に失敗しました' }, { status: 500 });
  }
}

// PUT: 店舗情報更新
export async function PUT(request: Request) {
  const admin = await checkSuperAdmin();
  if (!admin) return NextResponse.json({ error: '権限がありません' }, { status: 403 });

  try {
    const data = await request.json();
    const { id, store_code, store_name, tenant_id } = data;

    if (!id || !store_code || !store_name || !tenant_id) {
      return NextResponse.json({ error: 'ID・店舗コード・店舗名・所属会社は必須です' }, { status: 400 });
    }

    const db = await getDb(admin);

    // 対象店舗の存在確認
    const currentStore = await db.get(`SELECT id FROM stores WHERE id = ?`, [id]);
    if (!currentStore) {
      return NextResponse.json({ error: '対象の店舗が見つかりません' }, { status: 404 });
    }

    // 店舗コードの重複チェック（自分以外の店舗と重複していないか）
    const duplicate = await db.get(`SELECT id FROM stores WHERE store_code = ? AND id != ?`, [store_code.trim().toUpperCase(), id]);
    if (duplicate) {
      return NextResponse.json({ error: 'この店舗コードは他の店舗で使用されています' }, { status: 409 });
    }

    await db.run(
      `UPDATE stores SET store_code = ?, store_name = ?, tenant_id = ? WHERE id = ?`,
      [store_code.trim().toUpperCase(), store_name.trim(), Number(tenant_id), id]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating store:', error);
    return NextResponse.json({ error: '店舗の更新に失敗しました' }, { status: 500 });
  }
}

// DELETE: 店舗削除
export async function DELETE(request: Request) {
  const admin = await checkSuperAdmin();
  if (!admin) return NextResponse.json({ error: '権限がありません' }, { status: 403 });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: '店舗IDが必要です' }, { status: 400 });

    const db = await getDb(admin);

    const store = await db.get(`SELECT id, store_name FROM stores WHERE id = ?`, [id]);
    if (!store) {
      return NextResponse.json({ error: '対象の店舗が見つかりません' }, { status: 404 });
    }

    await db.run(`DELETE FROM stores WHERE id = ?`, [id]);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting store:', error);
    return NextResponse.json({ error: '店舗の削除に失敗しました' }, { status: 500 });
  }
}
