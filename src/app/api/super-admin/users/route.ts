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

  const db = await getDb(user);
  const users = await db.all(`
    SELECT
      u.id, u.username, u.display_name, u.role,
      (u.password IS NOT NULL AND u.password != '') AS has_password,
      (u.pin_code IS NOT NULL AND u.pin_code != '') AS has_pin,
      u.failed_attempts,
      u.locked_until,
      CASE 
        WHEN u.locked_until IS NOT NULL AND u.locked_until > CURRENT_TIMESTAMP THEN true 
        ELSE false 
      END AS is_locked,
      u.tenant_id, u.created_at,
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

  // super_admin 以外は所属会社（tenant_id）が必須
  if (role !== 'super_admin' && !tenant_id) {
    return NextResponse.json({ error: 'システム管理者以外の権限では、所属会社（テナント）の指定が必須です' }, { status: 400 });
  }

  const db = await getDb(admin);

  // 担当店舗が自社の店舗か検証
  if (store_ids && Array.isArray(store_ids) && store_ids.length > 0 && tenant_id) {
    const tenantStores = await db.all('SELECT id FROM stores WHERE tenant_id = ?', [tenant_id]);
    const validStoreIds = new Set(tenantStores.map((s: any) => s.id));
    for (const sid of store_ids) {
      if (!validStoreIds.has(sid)) {
        return NextResponse.json({ error: '選択された店舗の中に、所属会社と一致しない店舗が含まれています' }, { status: 400 });
      }
    }
  }
  try {
    // パスワードをbcryptでハッシュ化
    const hashedPassword = password && password.trim().length > 0
      ? await bcrypt.hash(password.trim(), 10)
      : null;

    // PINコードもbcryptでハッシュ化
    const hashedPin = pin_code && String(pin_code).trim().length > 0
      ? await bcrypt.hash(String(pin_code).trim(), 10)
      : null;

    await db.run(
      `INSERT INTO users (username, display_name, role, password, pin_code, tenant_id, failed_attempts, locked_until)
       VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
      [username.trim(), display_name.trim(), role, hashedPassword, hashedPin, tenant_id || null]
    );

    // 新規IDを取得
    const newUser = await db.get(`SELECT id FROM users WHERE username = ?`, [username.trim()]);
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

  // super_admin 以外は所属会社（tenant_id）が必須
  if (role !== 'super_admin' && !tenant_id) {
    return NextResponse.json({ error: 'システム管理者以外の権限では、所属会社（テナント）の指定が必須です' }, { status: 400 });
  }

  const db = await getDb(admin);

  // 既存ユーザーの情報を取得
  const currentUser = await db.get(`SELECT id, password, pin_code FROM users WHERE id = ?`, [id]);
  if (!currentUser) {
    return NextResponse.json({ error: '対象のユーザーが見つかりません' }, { status: 404 });
  }

  // 担当店舗が自社の店舗か検証
  if (store_ids && Array.isArray(store_ids) && store_ids.length > 0 && tenant_id) {
    const tenantStores = await db.all('SELECT id FROM stores WHERE tenant_id = ?', [tenant_id]);
    const validStoreIds = new Set(tenantStores.map((s: any) => s.id));
    for (const sid of store_ids) {
      if (!validStoreIds.has(sid)) {
        return NextResponse.json({ error: '選択された店舗の中に、所属会社と一致しない店舗が含まれています' }, { status: 400 });
      }
    }
  }

  // パスワードが入力されている場合はハッシュ化して更新、空欄なら現在のパスワードを維持
  let passwordToSave = currentUser.password;
  if (password && typeof password === 'string' && password.trim().length > 0) {
    passwordToSave = await bcrypt.hash(password.trim(), 10);
  }

  // PINコードが入力されている場合はハッシュ化して更新、空欄なら現在のPINを維持
  let pinToSave = currentUser.pin_code;
  if (pin_code !== undefined && pin_code !== null && String(pin_code).trim().length > 0) {
    pinToSave = await bcrypt.hash(String(pin_code).trim(), 10);
  }

  await db.run(
    `UPDATE users SET display_name = ?, role = ?, password = ?, pin_code = ?, tenant_id = ? WHERE id = ?`,
    [display_name.trim(), role, passwordToSave, pinToSave, tenant_id || null, id]
  );

  // 担当店舗を更新（一度全削除してから再登録）
  if (store_ids && Array.isArray(store_ids)) {
    await db.run(`DELETE FROM user_stores WHERE user_id = ?`, [id]);
    for (const storeId of store_ids) {
      await db.run(`INSERT INTO user_stores (user_id, store_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [id, storeId]);
    }
  }

  return NextResponse.json({ success: true });
}

// PATCH: アカウントのロック解除
export async function PATCH(request: Request) {
  const admin = await checkSuperAdmin();
  if (!admin) return NextResponse.json({ error: '権限がありません' }, { status: 403 });

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: 'IDが必要です' }, { status: 400 });

  const db = await getDb(admin);
  await db.run(
    `UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?`,
    [id]
  );

  return NextResponse.json({ success: true, message: 'アカウントのロックを解除しました' });
}

// DELETE: ユーザー削除
export async function DELETE(request: Request) {
  const admin = await checkSuperAdmin();
  if (!admin) return NextResponse.json({ error: '権限がありません' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'IDが必要です' }, { status: 400 });

  const db = await getDb(admin);
  await db.run(`DELETE FROM users WHERE id = ?`, [id]);
  return NextResponse.json({ success: true });
}
