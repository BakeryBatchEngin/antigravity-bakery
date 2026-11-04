import { NextResponse } from 'next/server';
import { resolveStoreAuth } from '@/lib/storeAuth';

async function getStoreId() {
  const auth = await resolveStoreAuth();
  if (auth.errorResponse) return { error: '認証エラーまたは店舗未選択', status: auth.errorResponse.status };
  return { storeId: auth.storeId, db: auth.db };
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
