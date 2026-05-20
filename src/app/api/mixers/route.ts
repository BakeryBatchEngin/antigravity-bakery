import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';

// ===== 共通：関所ロジック（セッションと店舗IDを取得） =====
async function getStoreId() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('bakery_session');
  if (!sessionCookie?.value) return { error: 'ログインが必要です', status: 401 };

  let user: any;
  try {
    user = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
  } catch {
    return { error: '無効なセッションです', status: 401 };
  }

  const db = await getDb();
  const storeCookie = cookieStore.get('active_store_id');
  const requestedStoreId = storeCookie ? Number(storeCookie.value) : null;
  let storeId: number | null = null;

  if (['admin', 'master', 'manager'].includes(user.role)) {
    storeId = requestedStoreId;
  } else if (user.role === 'chef') {
    const userStores = await db.all('SELECT store_id FROM user_stores WHERE user_id = ?', [user.id]);
    if (!userStores || userStores.length === 0) {
      return { error: '所属店舗が設定されていません', status: 403 };
    }
    const allowedIds = userStores.map((r: any) => Number(r.store_id));
    storeId = (requestedStoreId && allowedIds.includes(requestedStoreId)) ? requestedStoreId : allowedIds[0];
  } else {
    return { error: 'アクセス権限がありません', status: 403 };
  }

  if (!storeId) return { error: '店舗が選択されていません', status: 400 };
  return { storeId, db };
}

// GET: 選択中の店舗のミキサー一覧を取得
export async function GET() {
  try {
    const result = await getStoreId();
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const { storeId, db } = result;

    const mixers = await db.all(
      'SELECT * FROM mixer_capacities WHERE store_id = ? ORDER BY max_capacity_kg DESC',
      [storeId]
    );
    return NextResponse.json({ success: true, mixers });
  } catch (error) {
    console.error('Error fetching mixers:', error);
    return NextResponse.json({ error: 'ミキサーデータの取得に失敗しました' }, { status: 500 });
  }
}

// POST: 新しいミキサーを追加
export async function POST(request: Request) {
  try {
    const result = await getStoreId();
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const { storeId, db } = result;

    const { name, icon, max_capacity_kg } = await request.json();
    if (!name || !max_capacity_kg || max_capacity_kg <= 0) {
      return NextResponse.json({ error: '名前と容量(kg)は必須です' }, { status: 400 });
    }

    // ID は "店舗ID_タイムスタンプ" で自動生成（ユニーク保証）
    const newId = `store${storeId}_${Date.now()}`;
    const iconFile = icon || 'spiral_icon.png';

    await db.run(
      'INSERT INTO mixer_capacities (id, name, icon, max_capacity_kg, store_id) VALUES (?, ?, ?, ?, ?)',
      [newId, name, iconFile, max_capacity_kg, storeId]
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error adding mixer:', error);
    return NextResponse.json({ error: 'ミキサーの追加に失敗しました' }, { status: 500 });
  }
}

// PUT: ミキサーの容量を更新
export async function PUT(request: Request) {
  try {
    const result = await getStoreId();
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const { storeId, db } = result;

    const body = await request.json();
    const mixers = body.mixers;
    if (!mixers || !Array.isArray(mixers)) {
      return NextResponse.json({ error: '無効なデータ形式です' }, { status: 400 });
    }

    // 自分の店舗のミキサーのみ更新（他店舗のIDを悪用できないよう store_id で絞り込む）
    for (const m of mixers) {
      await db.run(
        'UPDATE mixer_capacities SET max_capacity_kg = ?, name = ? WHERE id = ? AND store_id = ?',
        [m.max_capacity_kg, m.name, m.id, storeId]
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating mixers:', error);
    return NextResponse.json({ error: 'ミキサーの更新に失敗しました' }, { status: 500 });
  }
}

// DELETE: ミキサーを削除
export async function DELETE(request: Request) {
  try {
    const result = await getStoreId();
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const { storeId, db } = result;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'IDが指定されていません' }, { status: 400 });

    // 自分の店舗のミキサーのみ削除可能
    await db.run('DELETE FROM mixer_capacities WHERE id = ? AND store_id = ?', [id, storeId]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting mixer:', error);
    return NextResponse.json({ error: 'ミキサーの削除に失敗しました' }, { status: 500 });
  }
}
