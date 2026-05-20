import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// 店舗一覧の取得
export async function GET() {
  try {
    const db = await getDb();
    const stores = await db.all(`
      SELECT id, store_code, store_name, created_at 
      FROM stores 
      ORDER BY store_code ASC
    `);
    
    return NextResponse.json({ stores });
  } catch (error) {
    console.error('Error fetching stores:', error);
    return NextResponse.json({ error: '店舗の取得に失敗しました' }, { status: 500 });
  }
}

// 店舗の新規作成
export async function POST(request: Request) {
  try {
    const data = await request.json();
    const { store_code, store_name } = data;

    if (!store_code || !store_name) {
      return NextResponse.json({ error: '店舗コードと店舗名が必要です' }, { status: 400 });
    }

    const db = await getDb();
    
    // 店舗コードの重複チェック
    const existingStore = await db.get(`SELECT id FROM stores WHERE store_code = $1`, [store_code]);
    if (existingStore) {
      return NextResponse.json({ error: 'この店舗コードは既に使用されています' }, { status: 400 });
    }

    await db.run(
      `INSERT INTO stores (store_code, store_name) VALUES ($1, $2)`,
      [store_code, store_name]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error creating store:', error);
    return NextResponse.json({ error: '店舗の作成に失敗しました' }, { status: 500 });
  }
}

// 店舗の更新
export async function PUT(request: Request) {
  try {
    const data = await request.json();
    const { id, store_code, store_name } = data;

    if (!id || !store_code || !store_name) {
      return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 });
    }

    const db = await getDb();
    
    // 重複チェック (自分自身を除く)
    const existingStore = await db.get(`SELECT id FROM stores WHERE store_code = $1 AND id != $2`, [store_code, id]);
    if (existingStore) {
      return NextResponse.json({ error: 'この店舗コードは他の店舗で使用されています' }, { status: 400 });
    }

    await db.run(
      `UPDATE stores SET store_code = $1, store_name = $2 WHERE id = $3`,
      [store_code, store_name, id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating store:', error);
    return NextResponse.json({ error: '店舗の更新に失敗しました' }, { status: 500 });
  }
}

// 店舗の削除
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '店舗IDが必要です' }, { status: 400 });
    }

    const db = await getDb();
    
    await db.run(`DELETE FROM stores WHERE id = $1`, [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting store:', error);
    return NextResponse.json({ error: '店舗の削除に失敗しました' }, { status: 500 });
  }
}
