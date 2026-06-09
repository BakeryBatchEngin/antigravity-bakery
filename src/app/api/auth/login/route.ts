import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
  try {
    const { username, pin, password } = await request.json();

    if (!username) {
      return NextResponse.json({ error: 'ユーザー名が必要です' }, { status: 400 });
    }

    const db = await getDb();
    
    // DBからユーザー検索
    const user = await db.get(`SELECT * FROM users WHERE username = $1`, [username]);
    
    if (!user) {
      return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 401 });
    }

    // 認証チェック
    let isAuthenticated = false;
    
    if (user.role === 'chef') {
      // ChefはPINで認証
      if (!pin || user.pin_code !== pin) {
        return NextResponse.json({ error: 'PINコードが間違っています' }, { status: 401 });
      }
      isAuthenticated = true;
    } else {
      // Admin, Master, Manager はパスワードで認証
      // bcryptハッシュ（$2b$で始まる）と平文の両方に対応（移行期間用）
      if (!password) {
        return NextResponse.json({ error: 'パスワードが必要です' }, { status: 401 });
      }
      const storedPassword = user.password || '';
      if (storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2a$')) {
        // ハッシュ化済みパスワード → bcryptで照合
        isAuthenticated = await bcrypt.compare(password, storedPassword);
      } else {
        // 平文パスワード（移行前の旧ユーザー） → 直接比較
        isAuthenticated = storedPassword === password;
      }
      if (!isAuthenticated) {
        return NextResponse.json({ error: 'パスワードが間違っています' }, { status: 401 });
      }
    }

    if (!isAuthenticated) {
      return NextResponse.json({ error: '認証に失敗しました' }, { status: 401 });
    }

    // 担当店舗を取得
    const userStores = await db.all(`SELECT store_id FROM user_stores WHERE user_id = $1`, [user.id]);
    // store_id を必ず数値として扱う（PostgreSQLが文字列で返す場合があるため）
    const storeIds = userStores.map((s: any) => Number(s.store_id));

    // 認証成功時、ユーザー情報をJSONでシリアライズしてCookieに保存
    const sessionData = {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.display_name,
      storeIds: storeIds,
      tenant_id: user.tenant_id ?? null,  // ← テナントIDを追加
    };
    
    const sessionString = Buffer.from(JSON.stringify(sessionData)).toString('base64');

    const response = NextResponse.json({ success: true, user: sessionData });
    
    // セッションCookieをセット
    response.cookies.set({
      name: 'bakery_session',
      value: sessionString,
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 1週間有効
      sameSite: 'lax',
    });

    // デフォルトの active_store_id をセット
    if (user.role === 'manager') {
      // マネージャーはデフォルトで「マネージャーモード」からスタート
      response.cookies.set({
        name: 'active_store_id',
        value: 'manager',
        httpOnly: true,
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
        sameSite: 'lax',
      });
    } else if (storeIds.length > 0) {
      // シェフなど：担当店舗の最初の1件をデフォルトに設定
      response.cookies.set({
        name: 'active_store_id',
        value: String(storeIds[0]),
        httpOnly: true,
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
        sameSite: 'lax',
      });
    } else if (user.role === 'admin' || user.role === 'master') {
      // Admin/Master の場合は自テナントの最初の店舗をデフォルトにセット
      const storeQuery = user.tenant_id
        ? `SELECT id FROM stores WHERE tenant_id = ${user.tenant_id} ORDER BY store_code ASC LIMIT 1`
        : `SELECT id FROM stores ORDER BY store_code ASC LIMIT 1`;
      const firstStore = await db.get(storeQuery);
      if (firstStore) {
        response.cookies.set({
          name: 'active_store_id',
          value: String(firstStore.id),
          httpOnly: true,
          path: '/',
          maxAge: 60 * 60 * 24 * 30,
          sameSite: 'lax',
        });
      }
    }

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
