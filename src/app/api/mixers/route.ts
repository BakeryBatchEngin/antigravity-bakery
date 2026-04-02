import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = await getDb();
    const mixers = await db.all('SELECT * FROM mixer_capacities ORDER BY max_capacity_kg DESC');
    return NextResponse.json({ success: true, mixers });
  } catch (error) {
    console.error('Error fetching mixers:', error);
    return NextResponse.json({ error: 'ミキサーマスタの取得に失敗しました' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const mixers = body.mixers;
    if (!mixers || !Array.isArray(mixers)) {
      return NextResponse.json({ error: '無効なデータ形式です' }, { status: 400 });
    }

    const db = await getDb();
    
    await db.exec('BEGIN TRANSACTION');
    try {
      for (const m of mixers) {
        await db.run(
          `UPDATE mixer_capacities SET max_capacity_kg = ? WHERE id = ?`,
          [m.max_capacity_kg, m.id]
        );
      }
      await db.exec('COMMIT');
    } catch (e) {
      await db.exec('ROLLBACK');
      throw e;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating mixers:', error);
    return NextResponse.json({ error: 'ミキサーマスタの更新に失敗しました' }, { status: 500 });
  }
}
