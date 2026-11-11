import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

const VALID_ROLES = ['tokyo_store', 'regional_store', 'xmas_manager', 'xmas_factory', 'xmas_headquarters'];

/**
 * クリスマスアカウント一覧取得
 */
export async function GET(request: Request) {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    if (user.role !== 'super_admin' && user.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const tenantParam = searchParams.get('tenant_id');

    const db = await getDb();
    let query = `
      SELECT a.id, a.tenant_id, a.username, a.display_name, a.role, a.is_active,
             COALESCE(a.failed_attempts, 0) as failed_attempts, a.locked_until, a.created_at,
             t.tenant_name,
             (SELECT COUNT(*) FROM xmas_orders o WHERE o.account_id = a.id) as order_count
      FROM xmas_accounts a
      LEFT JOIN tenants t ON a.tenant_id = t.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (user.role !== 'super_admin') {
      // 企業管理者は自テナントのみ
      params.push(user.tenant_id);
      query += ` AND a.tenant_id = $${params.length}`;
    } else if (tenantParam) {
      // super_admin がテナント絞り込みを指定した場合
      params.push(Number(tenantParam));
      query += ` AND a.tenant_id = $${params.length}`;
    }

    query += ` ORDER BY a.role ASC, a.display_name ASC, a.id ASC`;

    const accounts = await db.all(query, params);

    // テナント一覧（super_adminの場合のみ選択肢として返す）
    let tenants: any[] = [];
    if (user.role === 'super_admin') {
      tenants = await db.all(`SELECT id, tenant_code, tenant_name FROM tenants ORDER BY id ASC`);
    }

    return NextResponse.json({ accounts, tenants, currentUserRole: user.role });
  } catch (err: any) {
    console.error('Failed to fetch xmas accounts:', err);
    return NextResponse.json({ error: 'クリスマスアカウントの取得に失敗しました', details: err.message }, { status: 500 });
  }
}

/**
 * クリスマスアカウント新規登録
 */
export async function POST(request: Request) {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    if (user.role !== 'super_admin' && user.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const body = await request.json();
    const { username, password, display_name, role, tenant_id } = body;

    if (!username || !password || !display_name || !role) {
      return NextResponse.json({ error: 'ログインID、パスワード、表示名、役割は必須です' }, { status: 400 });
    }

    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: '無効なアカウント種別です' }, { status: 400 });
    }

    // テナントIDの決定
    const effectiveTenantId = user.role === 'super_admin' ? (tenant_id ? Number(tenant_id) : user.tenant_id) : user.tenant_id;
    if (!effectiveTenantId) {
      return NextResponse.json({ error: 'テナントIDが特定できません' }, { status: 400 });
    }

    const db = await getDb();

    // 重複チェック
    const existing = await db.get(`SELECT id FROM xmas_accounts WHERE username = $1`, [username.trim()]);
    if (existing) {
      return NextResponse.json({ error: 'このログインIDは既に使用されています' }, { status: 409 });
    }

    // パスワードハッシュ化
    const passwordHash = await bcrypt.hash(password, 10);

    await db.run(
      `INSERT INTO xmas_accounts (tenant_id, username, password_hash, display_name, role, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)`,
      [effectiveTenantId, username.trim(), passwordHash, display_name.trim(), role]
    );

    return NextResponse.json({ success: true, message: 'アカウントを作成しました' });
  } catch (err: any) {
    console.error('Failed to create xmas account:', err);
    return NextResponse.json({ error: 'クリスマスアカウントの作成に失敗しました', details: err.message }, { status: 500 });
  }
}

/**
 * クリスマスアカウント更新
 */
export async function PUT(request: Request) {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    if (user.role !== 'super_admin' && user.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const body = await request.json();
    const { id, display_name, role, password, is_active, unlock } = body;

    if (!id) {
      return NextResponse.json({ error: 'アカウントIDが指定されていません' }, { status: 400 });
    }

    const db = await getDb();

    // 既存アカウント確認＆テナント境界チェック
    const account = await db.get(`SELECT * FROM xmas_accounts WHERE id = $1`, [id]);
    if (!account) {
      return NextResponse.json({ error: 'アカウントが見つかりません' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && account.tenant_id !== user.tenant_id) {
      return NextResponse.json({ error: '他社のアカウントは操作できません' }, { status: 403 });
    }

    const updateFields: string[] = [];
    const params: any[] = [];

    if (display_name !== undefined) {
      params.push(display_name.trim());
      updateFields.push(`display_name = $${params.length}`);
    }

    if (role !== undefined && VALID_ROLES.includes(role)) {
      params.push(role);
      updateFields.push(`role = $${params.length}`);
    }

    if (is_active !== undefined) {
      params.push(Boolean(is_active));
      updateFields.push(`is_active = $${params.length}`);
    }

    if (password && password.trim().length > 0) {
      const passwordHash = await bcrypt.hash(password, 10);
      params.push(passwordHash);
      updateFields.push(`password_hash = $${params.length}`);
      // パスワード変更時はロックも自動解除
      updateFields.push(`failed_attempts = 0`);
      updateFields.push(`locked_until = NULL`);
    } else if (unlock === true) {
      // 明示的なロック解除
      updateFields.push(`failed_attempts = 0`);
      updateFields.push(`locked_until = NULL`);
    }

    if (updateFields.length === 0) {
      return NextResponse.json({ message: '更新項目がありません' });
    }

    params.push(new Date().toISOString());
    updateFields.push(`updated_at = $${params.length}`);

    params.push(id);
    const sql = `UPDATE xmas_accounts SET ${updateFields.join(', ')} WHERE id = $${params.length}`;
    await db.run(sql, params);

    return NextResponse.json({ success: true, message: 'アカウントを更新しました' });
  } catch (err: any) {
    console.error('Failed to update xmas account:', err);
    return NextResponse.json({ error: 'クリスマスアカウントの更新に失敗しました', details: err.message }, { status: 500 });
  }
}

/**
 * クリスマスアカウント削除
 */
export async function DELETE(request: Request) {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    if (user.role !== 'super_admin' && user.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'アカウントIDが指定されていません' }, { status: 400 });
    }

    const db = await getDb();

    // 既存アカウント確認＆テナント境界チェック
    const account = await db.get(`SELECT * FROM xmas_accounts WHERE id = $1`, [Number(id)]);
    if (!account) {
      return NextResponse.json({ error: 'アカウントが見つかりません' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && account.tenant_id !== user.tenant_id) {
      return NextResponse.json({ error: '他社のアカウントは操作できません' }, { status: 403 });
    }

    // 安全装置: 受注データが存在するアカウントの削除を厳格にブロック
    const orderCountRow = await db.get(
      `SELECT COUNT(*) as cnt FROM xmas_orders WHERE account_id = $1`,
      [Number(id)]
    );
    const orderCount = Number(orderCountRow?.cnt || 0);
    if (orderCount > 0) {
      return NextResponse.json({
        error: `このアカウントには受注データが ${orderCount} 件存在するため削除できません。注文データを保持したままログインを停止するには「無効化（編集でステータス変更）」をご利用ください。`
      }, { status: 409 });
    }

    await db.run(`DELETE FROM xmas_accounts WHERE id = $1`, [Number(id)]);

    return NextResponse.json({ success: true, message: 'アカウントを削除しました' });
  } catch (err: any) {
    console.error('Failed to delete xmas account:', err);
    return NextResponse.json({ error: 'クリスマスアカウントの削除に失敗しました', details: err.message }, { status: 500 });
  }
}
