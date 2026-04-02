import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { date, flatBatches, flatProductBatches } = await request.json();
    if (!date || !flatBatches) {
      return NextResponse.json({ error: 'データが不足しています' }, { status: 400 });
    }

    const db = await getDb();
    const planData = JSON.stringify({ flatBatches, flatProductBatches });

    await db.run(`
      INSERT INTO daily_production_plans (target_date, plan_data)
      VALUES (?, ?)
      ON CONFLICT(target_date) DO UPDATE SET
        plan_data=excluded.plan_data,
        updated_at=CURRENT_TIMESTAMP
    `, [date, planData]);

    const validBatchIds = [
      ...(flatBatches || []).map((b: any) => b.id),
      ...(flatProductBatches || []).map((b: any) => b.id)
    ];

    if (validBatchIds.length > 0) {
      const placeholders = validBatchIds.map(() => '?').join(',');
      await db.run(`
        DELETE FROM ingredient_usages 
        WHERE target_date = ? AND batch_id NOT IN (${placeholders})
      `, [date, ...validBatchIds]);
    } else {
      await db.run('DELETE FROM ingredient_usages WHERE target_date = ?', [date]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving plan:', error);
    return NextResponse.json({ error: '生産計画の保存(Set)に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    if (!date) {
      return NextResponse.json({ error: '日付が指定されていません' }, { status: 400 });
    }

    const db = await getDb();
    await db.run('DELETE FROM daily_production_plans WHERE target_date = ?', [date]);

    // リセット時は一緒にその日の実行記録も消すか？
    // ユーザーが明示的にリセットを押した場合は一旦計画全体を初期化するので、実行記録も消す。
    await db.run('DELETE FROM ingredient_usages WHERE target_date = ?', [date]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting plan:', error);
    return NextResponse.json({ error: '計画のリセットに失敗しました' }, { status: 500 });
  }
}
