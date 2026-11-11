import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

// タイミング攻撃緩和用のダミーハッシュ（ユーザーが存在しない場合も同じ計算時間を消費させる）
const DUMMY_HASH = '$2b$10$7EqJtq98hPqEX7fNZaFWoO.8/k.Y9j7kGf56hQ3kG.aC9m9yK5J/2';
const GENERIC_AUTH_ERROR = 'ユーザー名またはパスワード（PIN）が正しくありません';

// ロックアウト設定
const MAX_FAILED_ATTEMPTS = 5; // 連続5回失敗でロック
const LOCKOUT_MINUTES = 15;     // 15分間ロック

async function handleLoginFailure(db: any, user: any): Promise<{ locked: boolean; remainingMinutes: number }> {
  const currentAttempts = (user.failed_attempts || 0) + 1;

  if (currentAttempts >= MAX_FAILED_ATTEMPTS) {
    // 5回以上の失敗：15分間ロックアウト
    const lockUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
    await db.run(
      `UPDATE users SET failed_attempts = $1, locked_until = $2 WHERE id = $3`,
      [currentAttempts, lockUntil.toISOString(), user.id]
    );
    return { locked: true, remainingMinutes: LOCKOUT_MINUTES };
  } else {
    // 失敗カウントのみ加算
    await db.run(
      `UPDATE users SET failed_attempts = $1 WHERE id = $2`,
      [currentAttempts, user.id]
    );
    return { locked: false, remainingMinutes: 0 };
  }
}

/**
 * クリスマスアカウント用ログイン失敗処理（フェイルセーフ対応）
 */
async function handleXmasLoginFailure(db: any, account: any): Promise<{ locked: boolean; remainingMinutes: number }> {
  try {
    const currentAttempts = (account.failed_attempts || 0) + 1;
    if (currentAttempts >= MAX_FAILED_ATTEMPTS) {
      const lockUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      await db.run(
        `UPDATE xmas_accounts SET failed_attempts = $1, locked_until = $2 WHERE id = $3`,
        [currentAttempts, lockUntil.toISOString(), account.id]
      );
      return { locked: true, remainingMinutes: LOCKOUT_MINUTES };
    } else {
      await db.run(
        `UPDATE xmas_accounts SET failed_attempts = $1 WHERE id = $2`,
        [currentAttempts, account.id]
      );
      return { locked: false, remainingMinutes: 0 };
    }
  } catch (err) {
    console.error('Failed to update xmas failed_attempts (failsafe):', err);
    return { locked: false, remainingMinutes: 0 };
  }
}

export async function POST(request: Request) {
  try {
    const { username, pin, password } = await request.json();

    if (!username) {
      return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
    }

    const db = await getDb();
    
    // DBからユーザー検索
    const user = await db.get(`SELECT * FROM users WHERE username = $1`, [username]);
    
    // ユーザーが存在しない場合：クリスマス専用アカウントを検索
    if (!user) {
      const xmasAccount = await db.get(
        `SELECT * FROM xmas_accounts WHERE username = $1 AND is_active = true`,
        [username]
      );

      if (xmasAccount) {
        // クリスマスアカウントのロック状態チェック
        if (xmasAccount.locked_until) {
          const lockExpiry = new Date(xmasAccount.locked_until);
          const now = new Date();
          if (lockExpiry > now) {
            const remainingMinutes = Math.max(1, Math.ceil((lockExpiry.getTime() - now.getTime()) / (60 * 1000)));
            return NextResponse.json({
              error: `ログイン失敗が続いたため、アカウントが一時的にロックされています。あと約${remainingMinutes}分後に再度お試しいただくか、管理者にお問い合わせください。`,
              locked: true,
              remainingMinutes,
            }, { status: 423 }); // 423 Locked
          }
        }

        const inputPw = password || pin || '';
        const isMatch = await bcrypt.compare(inputPw, xmasAccount.password_hash);
        if (!isMatch) {
          const failResult = await handleXmasLoginFailure(db, xmasAccount);
          if (failResult.locked) {
            return NextResponse.json({
              error: `ログイン失敗が規定回数（${MAX_FAILED_ATTEMPTS}回）に達したため、アカウントが${LOCKOUT_MINUTES}分間ロックされました。しばらく経ってからお試しいただくか、管理者にお問い合わせください。`,
              locked: true,
              remainingMinutes: failResult.remainingMinutes,
            }, { status: 423 });
          }
          return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
        }

        // 認証成功時：失敗カウントとロックをリセット（フェイルセーフ）
        if (xmasAccount.failed_attempts > 0 || xmasAccount.locked_until !== null) {
          try {
            await db.run(
              `UPDATE xmas_accounts SET failed_attempts = 0, locked_until = NULL WHERE id = $1`,
              [xmasAccount.id]
            );
          } catch (e) {
            console.error('Failed to reset xmas failed_attempts (failsafe):', e);
          }
        }

        const nowSec = Math.floor(Date.now() / 1000);
        const sessionData = {
          id: xmasAccount.id,
          username: xmasAccount.username,
          role: xmasAccount.role,
          displayName: xmasAccount.display_name,
          storeIds: [],
          tenant_id: xmasAccount.tenant_id,
          is_xmas: true,
          exp: nowSec + 60 * 60 * 24 * 7,
        };

        const sessionString = Buffer.from(JSON.stringify(sessionData)).toString('base64');
        const { signSession } = await import('@/lib/authCrypto');
        const signature = await signSession(sessionString);

        const response = NextResponse.json({
          success: true,
          user: sessionData,
          redirectUrl: xmasAccount.role === 'xmas_factory' ? '/xmas/factory' : '/xmas/orders',
        });
        const isProduction = process.env.NODE_ENV === 'production';

        response.cookies.set({
          name: 'bakery_session',
          value: sessionString,
          httpOnly: true,
          secure: isProduction,
          path: '/',
          maxAge: 60 * 60 * 24 * 7,
          sameSite: 'lax',
        });

        response.cookies.set({
          name: 'bakery_session_sig',
          value: signature,
          httpOnly: true,
          secure: isProduction,
          path: '/',
          maxAge: 60 * 60 * 24 * 7,
          sameSite: 'lax',
        });

        return response;
      }

      // どちらにも存在しない場合：ダミーのbcrypt比較を実行して応答時間を平準化（ユーザー列挙攻撃対策）
      await bcrypt.compare(password || pin || 'dummy', DUMMY_HASH);
      return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
    }

    // アカウントのロック状態チェック
    if (user.locked_until) {
      const lockExpiry = new Date(user.locked_until);
      const now = new Date();
      if (lockExpiry > now) {
        const remainingMinutes = Math.max(1, Math.ceil((lockExpiry.getTime() - now.getTime()) / (60 * 1000)));
        return NextResponse.json({
          error: `ログイン失敗が続いたため、アカウントが一時的にロックされています。あと約${remainingMinutes}分後に再度お試しいただくか、管理者にお問い合わせください。`,
          locked: true,
          remainingMinutes,
        }, { status: 423 }); // 423 Locked
      }
    }

    // 認証チェック
    let isAuthenticated = false;
    let needPinUpgrade = false;
    let needPasswordUpgrade = false;
    
    if (user.role === 'chef') {
      // ChefはPINで認証
      if (!pin) {
        const failResult = await handleLoginFailure(db, user);
        if (failResult.locked) {
          return NextResponse.json({
            error: `ログイン失敗が規定回数（${MAX_FAILED_ATTEMPTS}回）に達したため、アカウントが${LOCKOUT_MINUTES}分間ロックされました。しばらく経ってからお試しいただくか、管理者にお問い合わせください。`,
            locked: true,
            remainingMinutes: failResult.remainingMinutes,
          }, { status: 423 });
        }
        return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
      }

      const storedPin = user.pin_code || '';
      if (storedPin.startsWith('$2b$') || storedPin.startsWith('$2a$')) {
        // ハッシュ化済みPIN → bcryptで照合
        isAuthenticated = await bcrypt.compare(String(pin).trim(), storedPin);
      } else {
        // 平文PIN（旧シェフ移行用） → 直接比較し、成功したらハッシュ化自動アップグレード
        isAuthenticated = storedPin === String(pin).trim();
        if (isAuthenticated) {
          needPinUpgrade = true;
        }
      }
    } else {
      // Admin, Master, Manager はパスワードで認証
      if (!password) {
        const failResult = await handleLoginFailure(db, user);
        if (failResult.locked) {
          return NextResponse.json({
            error: `ログイン失敗が規定回数（${MAX_FAILED_ATTEMPTS}回）に達したため、アカウントが${LOCKOUT_MINUTES}分間ロックされました。しばらく経ってからお試しいただくか、管理者にお問い合わせください。`,
            locked: true,
            remainingMinutes: failResult.remainingMinutes,
          }, { status: 423 });
        }
        return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
      }

      const storedPassword = user.password || '';
      if (storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2a$')) {
        // ハッシュ化済みパスワード → bcryptで照合
        isAuthenticated = await bcrypt.compare(password, storedPassword);
      } else {
        // 平文パスワード（旧ユーザー移行用） → 直接比較し、成功したらハッシュ化自動アップグレード
        isAuthenticated = storedPassword === password;
        if (isAuthenticated) {
          needPasswordUpgrade = true;
        }
      }
    }

    if (!isAuthenticated) {
      const failResult = await handleLoginFailure(db, user);
      if (failResult.locked) {
        return NextResponse.json({
          error: `ログイン失敗が規定回数（${MAX_FAILED_ATTEMPTS}回）に達したため、アカウントが${LOCKOUT_MINUTES}分間ロックされました。しばらく経ってからお試しいただくか、管理者にお問い合わせください。`,
          locked: true,
          remainingMinutes: failResult.remainingMinutes,
        }, { status: 423 });
      }
      return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
    }

    // 認証成功時：失敗カウントとロックをリセット（平文PIN/PWの場合は自動ハッシュ化）
    if (needPinUpgrade) {
      const hashedPin = await bcrypt.hash(String(pin).trim(), 10);
      await db.run(
        `UPDATE users SET pin_code = $1, failed_attempts = 0, locked_until = NULL WHERE id = $2`,
        [hashedPin, user.id]
      );
    } else if (needPasswordUpgrade) {
      const hashedPw = await bcrypt.hash(password, 10);
      await db.run(
        `UPDATE users SET password = $1, failed_attempts = 0, locked_until = NULL WHERE id = $2`,
        [hashedPw, user.id]
      );
    } else if (user.failed_attempts > 0 || user.locked_until !== null) {
      await db.run(
        `UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1`,
        [user.id]
      );
    }

    // 担当店舗を取得
    const userStores = await db.all(`SELECT store_id FROM user_stores WHERE user_id = $1`, [user.id]);
    // store_id を必ず数値として扱う（PostgreSQLが文字列で返す場合があるため）
    const storeIds = userStores.map((s: any) => Number(s.store_id));

    // 認証成功時、ユーザー情報をJSONでシリアライズしてCookieに保存（7日間の有効期限を付与）
    const nowSec = Math.floor(Date.now() / 1000);
    const sessionData = {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.display_name,
      storeIds: storeIds,
      tenant_id: user.tenant_id ?? null,
      exp: nowSec + 60 * 60 * 24 * 7, // 7日間有効
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
