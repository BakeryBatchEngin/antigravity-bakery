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

    let standardRows;
    let subRows;
    let subIngRows;

    if (user.role === 'super_admin') {
      standardRows = await db.all('SELECT * FROM doughs ORDER BY dough_id ASC, ingredient_code ASC');
      subRows = await db.all('SELECT * FROM sub_doughs ORDER BY dough_id ASC');
      subIngRows = await db.all('SELECT * FROM sub_dough_ingredients ORDER BY dough_id ASC, ingredient_code ASC');
    } else {
      standardRows = await db.all('SELECT * FROM doughs WHERE tenant_id = ? ORDER BY dough_id ASC, ingredient_code ASC', [user.tenant_id]);
      subRows = await db.all('SELECT * FROM sub_doughs WHERE tenant_id = ? ORDER BY dough_id ASC', [user.tenant_id]);
      subIngRows = await db.all('SELECT * FROM sub_dough_ingredients WHERE tenant_id = ? ORDER BY dough_id ASC, ingredient_code ASC', [user.tenant_id]);
    }

    const doughsMap = new Map();
    standardRows.forEach((row: any) => {
      if (!doughsMap.has(row.dough_id)) {
        doughsMap.set(row.dough_id, {
          dough_id: row.dough_id,
          dough_name: row.dough_name,
          type: 'standard',
          ingredients: []
        });
      }
      doughsMap.get(row.dough_id).ingredients.push({
        ingredient_code: row.ingredient_code,
        ingredient_name: row.ingredient_name,
        bakers_percent: row.bakers_percent
      });
    });

    subRows.forEach((row: any) => {
      doughsMap.set(row.dough_id, {
        dough_id: row.dough_id,
        dough_name: row.dough_name,
        type: 'sub_dough',
        base_dough_id: row.base_dough_id,
        base_dough_name: row.base_dough_name,
        base_dough_amount: row.base_dough_amount,
        ingredients: []
      });
    });

    subIngRows.forEach((row: any) => {
      if (doughsMap.has(row.dough_id)) {
        doughsMap.get(row.dough_id).ingredients.push({
          ingredient_code: row.ingredient_code,
          ingredient_name: row.ingredient_name,
          ingredient_amount: row.ingredient_amount
        });
      }
    });

    const doughs = Array.from(doughsMap.values());
    doughs.forEach((d: any) => {
      d.ingredients.sort((a: any, b: any) => {
        if (a.ingredient_name === '水' && b.ingredient_name !== '水') return 1;
        if (a.ingredient_name !== '水' && b.ingredient_name === '水') return -1;
        
        const valA = a.bakers_percent ?? a.ingredient_amount ?? 0;
        const valB = b.bakers_percent ?? b.ingredient_amount ?? 0;
        return valB - valA;
      });
    });
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

    const { dough_id, dough_name, type = 'standard', base_dough_id, base_dough_name, base_dough_amount, ingredients } = await request.json();

    if (!dough_id || !dough_name) {
      return NextResponse.json({ error: '生地ID、生地名は必須です' }, { status: 400 });
    }

    const tenantId = user.role === 'super_admin' ? null : user.tenant_id;
    const db = await getDb();

    await db.run('BEGIN TRANSACTION');
    try {
      if (tenantId) {
        await db.run('DELETE FROM doughs WHERE dough_id = ? AND tenant_id = ?', [dough_id, tenantId]);
        await db.run('DELETE FROM sub_doughs WHERE dough_id = ? AND tenant_id = ?', [dough_id, tenantId]);
        await db.run('DELETE FROM sub_dough_ingredients WHERE dough_id = ? AND tenant_id = ?', [dough_id, tenantId]);
      } else {
        await db.run('DELETE FROM doughs WHERE dough_id = ?', [dough_id]);
        await db.run('DELETE FROM sub_doughs WHERE dough_id = ?', [dough_id]);
        await db.run('DELETE FROM sub_dough_ingredients WHERE dough_id = ?', [dough_id]);
      }

      if (type === 'standard') {
        if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
          throw new Error('標準生地には1つ以上の材料が必要です');
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
      } else {
        if (!base_dough_id || !base_dough_amount) {
          throw new Error('サブ生地にはベース生地と基準グラム数が必要です');
        }
        await db.run(`
          INSERT INTO sub_doughs (dough_id, dough_name, base_dough_id, base_dough_name, base_dough_amount, tenant_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [dough_id, dough_name, base_dough_id, base_dough_name || '', base_dough_amount, tenantId]);

        if (ingredients && Array.isArray(ingredients)) {
          for (const ing of ingredients) {
            let nameToInsert = ing.ingredient_name;
            if (!nameToInsert) {
              const masterIng = await db.get('SELECT ingredient_name FROM ingredients WHERE ingredient_code = ?', [ing.ingredient_code]);
              nameToInsert = masterIng ? masterIng.ingredient_name : '不明な材料';
            }
            await db.run(`
              INSERT INTO sub_dough_ingredients (dough_id, ingredient_code, ingredient_name, ingredient_amount, tenant_id)
              VALUES (?, ?, ?, ?, ?)
            `, [dough_id, ing.ingredient_code, nameToInsert, ing.ingredient_amount, tenantId]);
          }
        }
      }

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
      await db.run('DELETE FROM sub_doughs WHERE dough_id = ? AND tenant_id = ?', [code, tenantId]);
      await db.run('DELETE FROM sub_dough_ingredients WHERE dough_id = ? AND tenant_id = ?', [code, tenantId]);
    } else {
      await db.run('DELETE FROM doughs WHERE dough_id = ?', [code]);
      await db.run('DELETE FROM sub_doughs WHERE dough_id = ?', [code]);
      await db.run('DELETE FROM sub_dough_ingredients WHERE dough_id = ?', [code]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete dough:', error);
    return NextResponse.json({ error: 'データの削除に失敗しました' }, { status: 500 });
  }
}
