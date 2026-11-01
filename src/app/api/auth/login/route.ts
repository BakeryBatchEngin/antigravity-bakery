import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

// タイミング攻撃緩和用のダミーハッシュ（ユーザーが存在しない場合も同じ計算時間を消費させる）
const DUMMY_HASH = '$2b$10$7EqJtq98hPqEX7fNZaFWoO.8/k.Y9j7kGf56hQ3kG.aC9m9yK5J/2';
const GENERIC_AUTH_ERROR = 'ユーザー名またはパスワード（PIN）が正しくありません';

export async function POST(request: Request) {
  try {
    const { username, pin, password } = await request.json();

    if (!username) {
      return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
    }

    const db = await getDb();
    
    // DBからユーザー検索
    const user = await db.get(`SELECT * FROM users WHERE username = $1`, [username]);
    
    // ユーザーが存在しない場合：ダミーのbcrypt比較を実行して応答時間を平準化（ユーザー列挙攻撃対策）
    if (!user) {
      await bcrypt.compare(password || pin || 'dummy', DUMMY_HASH);
      return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
    }

    // 認証チェック
    let isAuthenticated = false;
    
    if (user.role === 'chef') {
      // ChefはPINで認証（ステップ2でPINもハッシュ化予定）
      if (!pin || user.pin_code !== pin) {
        return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
      }
      isAuthenticated = true;
    } else {
      // Admin, Master, Manager はパスワードで認証
      if (!password) {
        return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
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
        return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
      }
    }

    if (!isAuthenticated) {
      return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
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
      tenant_id: user.tenant_id ?? null,
    };
    
    const sessionString = Buffer.from(JSON.stringify(sessionData)).toString('base64');
    
    // 署名の生成
    const { signSession } = await import('@/lib/authCrypto');
    const signature = await signSession(sessionString);

    const response = NextResponse.json({ success: true, user: sessionData });
    const isProduction = process.env.NODE_ENV === 'production';
    
    // セッションCookieをセット (本番環境ではsecure属性を付与)
    response.cookies.set({
      name: 'bakery_session',
      value: sessionString,
      httpOnly: true,
      secure: isProduction,
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 1週間有効
      sameSite: 'lax',
    });

    // 署名Cookieをセット (本番環境ではsecure属性を付与)
    response.cookies.set({
      name: 'bakery_session_sig',
      value: signature,
      httpOnly: true,
      secure: isProduction,
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
      sameSite: 'lax',
    });

    // デフォルトの active_store_id をセット
    if (user.role === 'manager') {
      // マネージャーはデフォルトで「マネージャーモード」からスタート
      response.cookies.set({
        name: 'active_store_id',
        value: 'manager',
        httpOnly: true,
        secure: isProduction,
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
        secure: isProduction,
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
          secure: isProduction,
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
