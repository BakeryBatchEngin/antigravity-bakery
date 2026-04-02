import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = await getDb();
    
    // 全生地データを取得
    const rows = await db.all('SELECT * FROM doughs ORDER BY dough_id ASC, ingredient_code ASC');
    
    // dough_idごとにグループ化したJSON構造を作成
    const doughsMap = new Map();
    rows.forEach((row: any) => {
      if (!doughsMap.has(row.dough_id)) {
        doughsMap.set(row.dough_id, {
          dough_id: row.dough_id,
          dough_name: row.dough_name,
          ingredients: []
        });
      }
      doughsMap.get(row.dough_id).ingredients.push({
        ingredient_code: row.ingredient_code,
        ingredient_name: row.ingredient_name,
        bakers_percent: row.bakers_percent
      });
    });

    const doughs = Array.from(doughsMap.values());
    
    return NextResponse.json({ success: true, doughs });
  } catch (error) {
    console.error('Failed to fetch doughs:', error);
    return NextResponse.json({ error: 'データの取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { dough_id, dough_name, ingredients } = await request.json();
    
    if (!dough_id || !dough_name || !ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return NextResponse.json({ error: '生地ID、生地名、および1つ以上の材料が必要です' }, { status: 400 });
    }

    const db = await getDb();
    
    // Transaction開始
    await db.run('BEGIN TRANSACTION');
    
    try {
      // 既存の同じ生地データを一度削除して作り直す (Upsertの代わり)
      await db.run('DELETE FROM doughs WHERE dough_id = ?', [dough_id]);

      // 各材料をインサート
      for (const ing of ingredients) {
        // 万が一フロントからingredient_nameが来ていなくても、DBから引けるなら引く
        let nameToInsert = ing.ingredient_name;
        if (!nameToInsert) {
          const masterIng = await db.get('SELECT ingredient_name FROM ingredients WHERE ingredient_code = ?', [ing.ingredient_code]);
          nameToInsert = masterIng ? masterIng.ingredient_name : '不明な材料';
        }

        await db.run(`
          INSERT INTO doughs (dough_id, dough_name, ingredient_code, ingredient_name, bakers_percent)
          VALUES (?, ?, ?, ?, ?)
        `, [dough_id, dough_name, ing.ingredient_code, nameToInsert, ing.bakers_percent]);
      }
      
      await db.run('COMMIT');
      return NextResponse.json({ success: true });
    } catch (txError) {
      await db.run('ROLLBACK');
      throw txError;
    }
    
  } catch (error) {
    console.error('Failed to save dough:', error);
    return NextResponse.json({ error: 'データの保存に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('id');
    
    if (!code) return NextResponse.json({ error: '生地IDが指定されていません' }, { status: 400 });

    const db = await getDb();
    
    // product_doughs で使われているかチェック
    const usage = await db.get('SELECT 1 FROM product_doughs WHERE dough_code = ? LIMIT 1', [code]);
    if (usage) {
      return NextResponse.json({ error: 'この生地は商品マスタで使用されているため削除できません' }, { status: 400 });
    }

    await db.run('DELETE FROM doughs WHERE dough_id = ?', [code]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete dough:', error);
    return NextResponse.json({ error: 'データの削除に失敗しました' }, { status: 500 });
  }
}
