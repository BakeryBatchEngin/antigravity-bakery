import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

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
      // Admin, Master, Managerはパスワードで認証
      if (!password || user.password !== password) {
        return NextResponse.json({ error: 'パスワードが間違っています' }, { status: 401 });
      }
      isAuthenticated = true;
    }

    if (!isAuthenticated) {
      return NextResponse.json({ error: '認証に失敗しました' }, { status: 401 });
    }

    // 認証成功時、ユーザー情報をJSONでシリアライズしてCookieに保存（簡易実装）
    // セキュリティ上、本番ではJWT署名などが必要ですが、今回はBase64エンコードの簡易セッションとします
    const sessionData = {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.display_name
    };
    
    const sessionString = Buffer.from(JSON.stringify(sessionData)).toString('base64');

    const response = NextResponse.json({ success: true, user: sessionData });
    
    // httpOnly, SameSite=Lax な Cookie をセット
    response.cookies.set({
      name: 'bakery_session',
      value: sessionString,
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 1週間有効
      sameSite: 'lax',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
