import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

// 一般のテナント管理者が作成・付与できるロール一覧（admin, super_admin は除外）
const ALLOWED_TENANT_ROLES = [
  'master',
  'manager',
  'chef',
  'store_loss_manager',
  'company_loss_manager',
];

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

// ユーザー一覧の取得（自分のテナントのユーザーのみ）
export async function GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDb(user);

    let users;
    if (user.role === 'super_admin') {
      // super_admin は全ユーザーを見られる
      // ※パスワードハッシュやPINの生データは返さず、設定済みフラグのみ返す
      users = await db.all(`
        SELECT 
          u.id, u.username, u.role, u.display_name,
          (u.password IS NOT NULL AND u.password != '') AS has_password,
          (u.pin_code IS NOT NULL AND u.pin_code != '') AS has_pin,
          u.tenant_id, u.created_at,
          COALESCE(
            (SELECT json_agg(store_id) FROM user_stores WHERE user_id = u.id),
            '[]'
          ) as store_ids
        FROM users u
        ORDER BY u.created_at DESC
      `);
    } else {
      // それ以外は自分のテナントのユーザーのみ
      users = await db.all(`
        SELECT 
          u.id, u.username, u.role, u.display_name,
          (u.password IS NOT NULL AND u.password != '') AS has_password,
          (u.pin_code IS NOT NULL AND u.pin_code != '') AS has_pin,
          u.tenant_id, u.created_at,
          COALESCE(
            (SELECT json_agg(store_id) FROM user_stores WHERE user_id = u.id),
            '[]'
          ) as store_ids
        FROM users u
        WHERE u.tenant_id = ?
          AND u.role != 'super_admin'
        ORDER BY u.created_at DESC
      `, [user.tenant_id]);
    }

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'ユーザーの取得に失敗しました' }, { status: 500 });
  }
}

// ユーザーの新規作成（自分のテナントのユーザーとして作成）
export async function POST(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const data = await request.json();
    const { username, role, display_name, pin_code, password, store_ids } = data;

    if (!username || !role || !display_name) {
      return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 });
    }

    // 権限チェック：super_admin 以外は admin / super_admin を作成できない
    if (user.role !== 'super_admin') {
      if (role === 'admin' || role === 'super_admin' || !ALLOWED_TENANT_ROLES.includes(role)) {
        return NextResponse.json(
          { error: '権限エラー：管理者・システム管理者のアカウントは登録できません' },
          { status: 403 }
        );
      }
    }

    const db = await getDb(user);

    const existingUser = await db.get(`SELECT id FROM users WHERE username = ?`, [username]);
    if (existingUser) {
      return NextResponse.json({ error: 'このユーザー名は既に使用されています' }, { status: 400 });
    }

    // 所属テナントIDを決定（super_adminは指定、それ以外は自分のテナント）
    const tenantId = user.role === 'super_admin' ? (data.tenant_id || null) : user.tenant_id;

    // パスワードをbcryptでハッシュ化（空の場合はnull）
    const hashedPassword = password && password.trim().length > 0
      ? await bcrypt.hash(password.trim(), 10)
      : null;

    await db.run(
      `INSERT INTO users (username, role, display_name, pin_code, password, tenant_id) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [username.trim(), role, display_name.trim(), pin_code ? pin_code.trim() : null, hashedPassword, tenantId]
    );

    const newUser = await db.get(`SELECT id FROM users WHERE username = ?`, [username.trim()]);
    const userId = newUser.id;

    if (store_ids && Array.isArray(store_ids) && store_ids.length > 0) {
      for (const storeId of store_ids) {
        await db.run(
          `INSERT INTO user_stores (user_id, store_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
          [userId, storeId]
        );
      }
    }

    return NextResponse.json({ success: true, user_id: userId });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: 'ユーザーの作成に失敗しました' }, { status: 500 });
  }
}

// ユーザー情報の更新
export async function PUT(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const data = await request.json();
    const { id, username, role, display_name, pin_code, password, store_ids } = data;

    if (!id || !username || !role || !display_name) {
      return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 });
    }

    const db = await getDb(user);

    // 更新対象ユーザーの存在と権限のチェック
    const targetUser = await db.get(`SELECT id, role, password, pin_code, tenant_id FROM users WHERE id = ?`, [id]);
    if (!targetUser) {
      return NextResponse.json({ error: '対象のユーザーが見つかりません' }, { status: 404 });
    }

    // 自分のテナントのユーザーかチェック
    if (user.role !== 'super_admin') {
      if (targetUser.tenant_id !== user.tenant_id) {
        return NextResponse.json({ error: '他のテナントのユーザーは変更できません' }, { status: 403 });
      }

      // 一般管理者は、admin や super_admin アカウントを変更できない
      if (targetUser.role === 'admin' || targetUser.role === 'super_admin') {
        return NextResponse.json({ error: '権限エラー：管理者アカウントの編集はできません' }, { status: 403 });
      }

      // 一般管理者は、admin や super_admin のロールを誰かに付与できない
      if (role === 'admin' || role === 'super_admin' || !ALLOWED_TENANT_ROLES.includes(role)) {
        return NextResponse.json({ error: '権限エラー：その権限を付与することはできません' }, { status: 403 });
      }
    }

    // パスワードの更新処理（入力がある場合のみハッシュ化、空文字なら既存のハッシュを維持）
    let passwordToSave: string | null = targetUser.password;
    if (password && typeof password === 'string' && password.trim().length > 0) {
      passwordToSave = await bcrypt.hash(password.trim(), 10);
    }

    // PINコードの更新処理（入力がある場合のみ更新、空文字なら既存のPINを維持）
    let pinToSave: string | null = targetUser.pin_code;
    if (pin_code !== undefined && pin_code !== null && String(pin_code).trim().length > 0) {
      pinToSave = String(pin_code).trim();
    }

    await db.run(
      `UPDATE users 
       SET username = ?, role = ?, display_name = ?, pin_code = ?, password = ?
       WHERE id = ?`,
      [username.trim(), role, display_name.trim(), pinToSave, passwordToSave, id]
    );

    await db.run(`DELETE FROM user_stores WHERE user_id = ?`, [id]);

    if (store_ids && Array.isArray(store_ids) && store_ids.length > 0) {
      for (const storeId of store_ids) {
        await db.run(
          `INSERT INTO user_stores (user_id, store_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
          [id, storeId]
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'ユーザーの更新に失敗しました' }, { status: 500 });
  }
}

// ユーザーの削除
export async function DELETE(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ユーザーIDが必要です' }, { status: 400 });

    const db = await getDb(user);

    const targetUser = await db.get(`SELECT id, role, tenant_id FROM users WHERE id = ?`, [id]);
    if (!targetUser) {
      return NextResponse.json({ error: '対象のユーザーが見つかりません' }, { status: 404 });
    }

    // 自分のテナントのユーザーかチェック
    if (user.role !== 'super_admin') {
      if (targetUser.tenant_id !== user.tenant_id) {
        return NextResponse.json({ error: '他のテナントのユーザーは削除できません' }, { status: 403 });
      }

      // 一般管理者は、admin や super_admin アカウントを削除できない
      if (targetUser.role === 'admin' || targetUser.role === 'super_admin') {
        return NextResponse.json({ error: '権限エラー：管理者アカウントの削除はできません' }, { status: 403 });
      }
    }

    await db.run(`DELETE FROM users WHERE id = ?`, [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ error: 'ユーザーの削除に失敗しました' }, { status: 500 });
  }
}
