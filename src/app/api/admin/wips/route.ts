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

    let wipRows;
    let wipIngRows;

    if (user.role === 'super_admin') {
      wipRows = await db.all('SELECT * FROM wips ORDER BY wip_code ASC');
      wipIngRows = await db.all('SELECT * FROM wip_ingredients ORDER BY wip_code ASC, ingredient_code ASC');
    } else {
      wipRows = await db.all('SELECT * FROM wips WHERE tenant_id = ? ORDER BY wip_code ASC', [user.tenant_id]);
      wipIngRows = await db.all('SELECT * FROM wip_ingredients WHERE tenant_id = ? ORDER BY wip_code ASC, ingredient_code ASC', [user.tenant_id]);
    }

    const wipsMap = new Map();

    wipRows.forEach((row: any) => {
      wipsMap.set(row.wip_code, {
        wip_code: row.wip_code,
        wip_name: row.wip_name,
        memo: row.memo || '',
        informart_url: row.informart_url || '',
        ingredients: []
      });
    });

    wipIngRows.forEach((row: any) => {
      if (wipsMap.has(row.wip_code)) {
        wipsMap.get(row.wip_code).ingredients.push({
          ingredient_code: row.ingredient_code,
          ingredient_name: row.ingredient_name,
          ingredient_amount: row.ingredient_amount
        });
      }
    });

    const wips = Array.from(wipsMap.values());
    
    return NextResponse.json({ success: true, wips });
  } catch (error) {
    console.error('Failed to fetch wips:', error);
    return NextResponse.json({ error: 'データの取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { wip_code, wip_name, memo, informart_url, ingredients } = await request.json();

    if (!wip_code || !wip_name) {
      return NextResponse.json({ error: '仕掛品コード、仕掛品名は必須です' }, { status: 400 });
    }

    const tenantId = user.role === 'super_admin' ? null : user.tenant_id;
    const db = await getDb();

    await db.run('BEGIN TRANSACTION');
    try {
      // 既存データの削除（洗い替え）
      if (tenantId) {
        await db.run('DELETE FROM wips WHERE wip_code = ? AND tenant_id = ?', [wip_code, tenantId]);
        await db.run('DELETE FROM wip_ingredients WHERE wip_code = ? AND tenant_id = ?', [wip_code, tenantId]);
      } else {
        await db.run('DELETE FROM wips WHERE wip_code = ?', [wip_code]);
        await db.run('DELETE FROM wip_ingredients WHERE wip_code = ?', [wip_code]);
      }

      // 1. wips に登録
      await db.run(`
        INSERT INTO wips (wip_code, wip_name, memo, informart_url, tenant_id)
        VALUES (?, ?, ?, ?, ?)
      `, [wip_code, wip_name, memo || null, informart_url || null, tenantId]);

      // 2. wip_ingredients に登録
      if (ingredients && Array.isArray(ingredients)) {
        for (const ing of ingredients) {
          let nameToInsert = ing.ingredient_name;
          if (!nameToInsert) {
            const masterIng = await db.get('SELECT ingredient_name FROM ingredients WHERE ingredient_code = ?', [ing.ingredient_code]);
            nameToInsert = masterIng ? masterIng.ingredient_name : '不明な材料';
          }
          await db.run(`
            INSERT INTO wip_ingredients (wip_code, ingredient_code, ingredient_name, ingredient_amount, tenant_id)
            VALUES (?, ?, ?, ?, ?)
          `, [wip_code, ing.ingredient_code, nameToInsert, ing.ingredient_amount, tenantId]);
        }
      }

      // 3. ingredients にも仕掛品を材料として登録・更新する（type='wip'）
      let existingIng;
      if (tenantId) {
        existingIng = await db.get('SELECT * FROM ingredients WHERE ingredient_code = ? AND tenant_id = ?', [wip_code, tenantId]);
      } else {
        existingIng = await db.get('SELECT * FROM ingredients WHERE ingredient_code = ?', [wip_code]);
      }
      
      if (existingIng) {
        if (tenantId) {
          await db.run(`UPDATE ingredients SET ingredient_name = ?, type = 'wip' WHERE ingredient_code = ? AND tenant_id = ?`, [wip_name, wip_code, tenantId]);
        } else {
          await db.run(`UPDATE ingredients SET ingredient_name = ?, type = 'wip' WHERE ingredient_code = ?`, [wip_name, wip_code]);
        }
      } else {
        await db.run(`
          INSERT INTO ingredients (ingredient_code, ingredient_name, type, status, tenant_id)
          VALUES (?, ?, 'wip', 'active', ?)
        `, [wip_code, wip_name, tenantId]);
      }

      // 4. 他の関連テーブル（生地や商品構成）の名前も連動更新
      if (tenantId) {
        await db.run(`UPDATE doughs SET ingredient_name = ? WHERE ingredient_code = ? AND tenant_id = ?`, [wip_name, wip_code, tenantId]);
        await db.run(`UPDATE product_ingredients SET ingredient_name = ? WHERE ingredient_code = ? AND tenant_id = ?`, [wip_name, wip_code, tenantId]);
      } else {
        await db.run(`UPDATE doughs SET ingredient_name = ? WHERE ingredient_code = ?`, [wip_name, wip_code]);
        await db.run(`UPDATE product_ingredients SET ingredient_name = ? WHERE ingredient_code = ?`, [wip_name, wip_code]);
      }

      await db.run('COMMIT');
      return NextResponse.json({ success: true });
    } catch (txError) {
      await db.run('ROLLBACK');
      throw txError;
    }
  } catch (error) {
    console.error('Failed to save wip:', error);
    return NextResponse.json({ error: 'データの保存に失敗しました: ' + (error.message || String(error)) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('id');
    if (!code) return NextResponse.json({ error: '仕掛品コードが指定されていません' }, { status: 400 });

    const db = await getDb();
    const tenantId = user.role === 'super_admin' ? null : user.tenant_id;

    // 他マスタ（生地、商品、他の仕掛品）で使用されているかチェック
    const usageQueries = [
      { q: tenantId ? 'SELECT 1 FROM doughs WHERE ingredient_code = ? AND tenant_id = ? LIMIT 1' : 'SELECT 1 FROM doughs WHERE ingredient_code = ? LIMIT 1' },
      { q: tenantId ? 'SELECT 1 FROM sub_dough_ingredients WHERE ingredient_code = ? AND tenant_id = ? LIMIT 1' : 'SELECT 1 FROM sub_dough_ingredients WHERE ingredient_code = ? LIMIT 1' },
      { q: tenantId ? 'SELECT 1 FROM product_ingredients WHERE ingredient_code = ? AND tenant_id = ? LIMIT 1' : 'SELECT 1 FROM product_ingredients WHERE ingredient_code = ? LIMIT 1' },
      { q: tenantId ? 'SELECT 1 FROM wip_ingredients WHERE ingredient_code = ? AND tenant_id = ? LIMIT 1' : 'SELECT 1 FROM wip_ingredients WHERE ingredient_code = ? LIMIT 1' }
    ];

    for (const uq of usageQueries) {
      const usageParams = tenantId ? [code, tenantId] : [code];
      const usage = await db.get(uq.q, usageParams);
      if (usage) {
        return NextResponse.json({ error: 'この仕掛品は他のレシピ（生地・商品・仕掛品）で使用されているため削除できません' }, { status: 400 });
      }
    }

    if (tenantId) {
      await db.run('DELETE FROM wips WHERE wip_code = ? AND tenant_id = ?', [code, tenantId]);
      await db.run('DELETE FROM wip_ingredients WHERE wip_code = ? AND tenant_id = ?', [code, tenantId]);
      // 材料テーブルからの削除（論理削除または物理削除）
      await db.run("UPDATE ingredients SET status = 'deleted' WHERE ingredient_code = ? AND tenant_id = ?", [code, tenantId]);
    } else {
      await db.run('DELETE FROM wips WHERE wip_code = ?', [code]);
      await db.run('DELETE FROM wip_ingredients WHERE wip_code = ?', [code]);
      await db.run("UPDATE ingredients SET status = 'deleted' WHERE ingredient_code = ?", [code]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete wip:', error);
    return NextResponse.json({ error: 'データの削除に失敗しました' }, { status: 500 });
  }
}
