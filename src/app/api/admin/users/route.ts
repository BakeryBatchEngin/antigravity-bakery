import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// ユーザー一覧の取得
export async function GET() {
  try {
    const db = await getDb();
    const users = await db.all(`
      SELECT 
        u.id, u.username, u.role, u.display_name, u.pin_code, u.password, u.created_at,
        COALESCE(
          (SELECT json_agg(store_id) FROM user_stores WHERE user_id = u.id),
          '[]'
        ) as store_ids
      FROM users u
      ORDER BY u.created_at DESC
    `);
    
    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'ユーザーの取得に失敗しました' }, { status: 500 });
  }
}

// ユーザーの新規作成
export async function POST(request: Request) {
  try {
    const data = await request.json();
    const { username, role, display_name, pin_code, password, store_ids } = data;

    if (!username || !role || !display_name) {
      return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 });
    }

    const db = await getDb();
    
    // ユーザー重複チェック
    const existingUser = await db.get(`SELECT id FROM users WHERE username = $1`, [username]);
    if (existingUser) {
      return NextResponse.json({ error: 'このユーザー名は既に使用されています' }, { status: 400 });
    }

    // ユーザー作成
    const result = await db.run(
      `INSERT INTO users (username, role, display_name, pin_code, password) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [username, role, display_name, pin_code || null, password || null]
    );

    // SQLite/pg 互換対応: RETURNING の結果は result.changes ではなく SELECT等で取り直すかラッパーを拡張する必要があるが、
    // ここは pg-pool を直接呼び出すか、ユーザー名からIDを取得し直すのが安全
    const newUser = await db.get(`SELECT id FROM users WHERE username = $1`, [username]);
    const userId = newUser.id;

    // 店舗の紐付け (chef, manager用)
    if (store_ids && Array.isArray(store_ids) && store_ids.length > 0) {
      for (const storeId of store_ids) {
        await db.run(
          `INSERT INTO user_stores (user_id, store_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
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
    const data = await request.json();
    const { id, username, role, display_name, pin_code, password, store_ids } = data;

    if (!id || !username || !role || !display_name) {
      return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 });
    }

    const db = await getDb();
    
    // ユーザー情報の更新
    await db.run(
      `UPDATE users 
       SET username = $1, role = $2, display_name = $3, pin_code = $4, password = $5
       WHERE id = $6`,
      [username, role, display_name, pin_code || null, password || null, id]
    );

    // 店舗の紐付けを一度全て削除してから再登録
    await db.run(`DELETE FROM user_stores WHERE user_id = $1`, [id]);
    
    if (store_ids && Array.isArray(store_ids) && store_ids.length > 0) {
      for (const storeId of store_ids) {
        await db.run(
          `INSERT INTO user_stores (user_id, store_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
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
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ユーザーIDが必要です' }, { status: 400 });
    }

    const db = await getDb();
    
    // ON DELETE CASCADE が設定されているため、関連する user_stores も自動で削除されます
    await db.run(`DELETE FROM users WHERE id = $1`, [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ error: 'ユーザーの削除に失敗しました' }, { status: 500 });
  }
}
