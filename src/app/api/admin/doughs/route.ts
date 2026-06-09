import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';

async function getUser() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('bakery_session');
  if (!sessionCookie?.value) return null;
  try {
    return JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
  } catch { return null; }
}

export async function GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDb();

    let rows;
    if (user.role === 'super_admin') {
      rows = await db.all('SELECT * FROM doughs ORDER BY dough_id ASC, ingredient_code ASC');
    } else {
      rows = await db.all(
        'SELECT * FROM doughs WHERE tenant_id = ? ORDER BY dough_id ASC, ingredient_code ASC',
        [user.tenant_id]
      );
    }

    // dough_id ごとにグループ化
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
    const user = await getUser();
    if (!user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { dough_id, dough_name, ingredients } = await request.json();

    if (!dough_id || !dough_name || !ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return NextResponse.json({ error: '生地ID、生地名、および1つ以上の材料が必要です' }, { status: 400 });
    }

    const tenantId = user.role === 'super_admin' ? null : user.tenant_id;
    const db = await getDb();

    await db.run('BEGIN TRANSACTION');
    try {
      // 既存データを削除して作り直す
      if (tenantId) {
        await db.run('DELETE FROM doughs WHERE dough_id = ? AND tenant_id = ?', [dough_id, tenantId]);
      } else {
        await db.run('DELETE FROM doughs WHERE dough_id = ?', [dough_id]);
      }

      for (const ing of ingredients) {
        let nameToInsert = ing.ingredient_name;
        if (!nameToInsert) {
          const masterIng = await db.get('SELECT ingredient_name FROM ingredients WHERE ingredient_code = ?', [ing.ingredient_code]);
          nameToInsert = masterIng ? masterIng.ingredient_name : '不明な材料';
        }
        await db.run(`
          INSERT INTO doughs (dough_id, dough_name, ingredient_code, ingredient_name, bakers_percent, tenant_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [dough_id, dough_name, ing.ingredient_code, nameToInsert, ing.bakers_percent, tenantId]);
      }

      // 商品マスタの生地名も連動更新
      if (tenantId) {
        await db.run(`UPDATE product_doughs SET dough_name = ? WHERE dough_code = ? AND tenant_id = ?`, [dough_name, dough_id, tenantId]);
      } else {
        await db.run(`UPDATE product_doughs SET dough_name = ? WHERE dough_code = ?`, [dough_name, dough_id]);
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
    const user = await getUser();
    if (!user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('id');
    if (!code) return NextResponse.json({ error: '生地IDが指定されていません' }, { status: 400 });

    const db = await getDb();
    const tenantId = user.role === 'super_admin' ? null : user.tenant_id;

    // 商品マスタで使われているかチェック（自テナントのみ）
    const usageQuery = tenantId
      ? 'SELECT 1 FROM product_doughs WHERE dough_code = ? AND tenant_id = ? LIMIT 1'
      : 'SELECT 1 FROM product_doughs WHERE dough_code = ? LIMIT 1';
    const usageParams = tenantId ? [code, tenantId] : [code];
    const usage = await db.get(usageQuery, usageParams);
    if (usage) {
      return NextResponse.json({ error: 'この生地は商品マスタで使用されているため削除できません' }, { status: 400 });
    }

    if (tenantId) {
      await db.run('DELETE FROM doughs WHERE dough_id = ? AND tenant_id = ?', [code, tenantId]);
    } else {
      await db.run('DELETE FROM doughs WHERE dough_id = ?', [code]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete dough:', error);
    return NextResponse.json({ error: 'データの削除に失敗しました' }, { status: 500 });
  }
}
