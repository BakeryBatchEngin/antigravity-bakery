import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';

// super_admin 権限チェック共通処理
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

// GET: テナント一覧取得
export async function GET() {
  const user = await checkSuperAdmin();
  if (!user) return NextResponse.json({ error: '権限がありません' }, { status: 403 });

  const db = await getDb();
  const tenants = await db.all(`
    SELECT t.*, COUNT(DISTINCT s.id) as store_count, COUNT(DISTINCT u.id) as user_count
    FROM tenants t
    LEFT JOIN stores s ON s.tenant_id = t.id
    LEFT JOIN users u ON u.tenant_id = t.id
    GROUP BY t.id
    ORDER BY t.created_at DESC
  `);
  return NextResponse.json({ tenants });
}

// POST: テナント新規作成
export async function POST(request: Request) {
  const user = await checkSuperAdmin();
  if (!user) return NextResponse.json({ error: '権限がありません' }, { status: 403 });

  const { tenant_code, tenant_name, plan, status } = await request.json();
  if (!tenant_code || !tenant_name) {
    return NextResponse.json({ error: 'テナントコードと会社名は必須です' }, { status: 400 });
  }

  const db = await getDb();
  try {
    await db.run(
      `INSERT INTO tenants (tenant_code, tenant_name, plan, status) VALUES (?, ?, ?, ?)`,
      [tenant_code.toUpperCase(), tenant_name, plan || 'basic', status || 'active']
    );
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e.message?.includes('unique') || e.message?.includes('duplicate')) {
      return NextResponse.json({ error: 'そのテナントコードはすでに使われています' }, { status: 409 });
    }
    return NextResponse.json({ error: '登録に失敗しました' }, { status: 500 });
  }
}

// PUT: テナント更新
export async function PUT(request: Request) {
  const user = await checkSuperAdmin();
  if (!user) return NextResponse.json({ error: '権限がありません' }, { status: 403 });

  const { id, tenant_name, plan, status } = await request.json();
  if (!id || !tenant_name) {
    return NextResponse.json({ error: 'IDと会社名は必須です' }, { status: 400 });
  }

  const db = await getDb();
  await db.run(
    `UPDATE tenants SET tenant_name = ?, plan = ?, status = ? WHERE id = ?`,
    [tenant_name, plan || 'basic', status || 'active', id]
  );
  return NextResponse.json({ success: true });
}

// DELETE: テナント削除
export async function DELETE(request: Request) {
  const user = await checkSuperAdmin();
  if (!user) return NextResponse.json({ error: '権限がありません' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'IDが必要です' }, { status: 400 });

  const db = await getDb();
  await db.run(`DELETE FROM tenants WHERE id = ?`, [id]);
  return NextResponse.json({ success: true });
}
