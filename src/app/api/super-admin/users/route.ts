import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

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

// GET: ユーザー一覧取得
export async function GET() {
  const user = await checkSuperAdmin();
  if (!user) return NextResponse.json({ error: '権限がありません' }, { status: 403 });

  const db = await getDb();
  const users = await db.all(`
    SELECT
      u.id, u.username, u.display_name, u.role, u.pin_code, u.tenant_id, u.created_at,
      t.tenant_name,
      STRING_AGG(s.store_name, ', ' ORDER BY s.store_name) AS store_names
    FROM users u
    LEFT JOIN tenants t ON u.tenant_id = t.id
    LEFT JOIN user_stores us ON u.id = us.user_id
    LEFT JOIN stores s ON us.store_id = s.id
    GROUP BY u.id, t.tenant_name
    ORDER BY u.created_at DESC
  `);
  return NextResponse.json({ users });
}

// POST: ユーザー新規作成
export async function POST(request: Request) {
  const admin = await checkSuperAdmin();
  if (!admin) return NextResponse.json({ error: '権限がありません' }, { status: 403 });

  const { username, display_name, role, password, pin_code, tenant_id, store_ids } = await request.json();
  if (!username || !display_name || !role) {
    return NextResponse.json({ error: 'ユーザー名・表示名・権限は必須です' }, { status: 400 });
  }

  const db = await getDb();
  try {
    // パスワードをbcryptでハッシュ化
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

    const result = await db.run(
      `INSERT INTO users (username, display_name, role, password, pin_code, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [username, display_name, role, hashedPassword, pin_code || null, tenant_id || null]
    );

    // 新規IDを取得
    const newUser = await db.get(`SELECT id FROM users WHERE username = ?`, [username]);
    if (!newUser) throw new Error('ユーザーの作成に失敗しました');

    // 担当店舗を紐づける
    if (store_ids && Array.isArray(store_ids) && store_ids.length > 0) {
      for (const storeId of store_ids) {
        await db.run(`INSERT INTO user_stores (user_id, store_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [newUser.id, storeId]);
      }
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e.message?.includes('unique') || e.message?.includes('duplicate')) {
      return NextResponse.json({ error: 'そのユーザー名はすでに使われています' }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ error: '登録に失敗しました' }, { status: 500 });
  }
}

// PUT: ユーザー更新
export async function PUT(request: Request) {
  const admin = await checkSuperAdmin();
  if (!admin) return NextResponse.json({ error: '権限がありません' }, { status: 403 });

  const { id, display_name, role, password, pin_code, tenant_id, store_ids } = await request.json();
  if (!id || !display_name || !role) {
    return NextResponse.json({ error: 'ID・表示名・権限は必須です' }, { status: 400 });
  }

  const db = await getDb();

  // パスワードが入力されている場合はハッシュ化して更新、空欄なら現在のパスワードを維持
  if (password && password.length > 0) {
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.run(
      `UPDATE users SET display_name = ?, role = ?, password = ?, pin_code = ?, tenant_id = ? WHERE id = ?`,
      [display_name, role, hashedPassword, pin_code || null, tenant_id || null, id]
    );
  } else {
    await db.run(
      `UPDATE users SET display_name = ?, role = ?, pin_code = ?, tenant_id = ? WHERE id = ?`,
      [display_name, role, pin_code || null, tenant_id || null, id]
    );
  }

  // 担当店舗を更新（一度全削除してから再登録）
  if (store_ids && Array.isArray(store_ids)) {
    await db.run(`DELETE FROM user_stores WHERE user_id = ?`, [id]);
    for (const storeId of store_ids) {
      await db.run(`INSERT INTO user_stores (user_id, store_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [id, storeId]);
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE: ユーザー削除
export async function DELETE(request: Request) {
  const admin = await checkSuperAdmin();
  if (!admin) return NextResponse.json({ error: '権限がありません' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'IDが必要です' }, { status: 400 });

  const db = await getDb();
  await db.run(`DELETE FROM users WHERE id = ?`, [id]);
  return NextResponse.json({ success: true });
}
