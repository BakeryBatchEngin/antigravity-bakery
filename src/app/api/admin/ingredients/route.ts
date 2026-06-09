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

    let ingredients;
    if (user.role === 'super_admin') {
      ingredients = await db.all('SELECT * FROM ingredients ORDER BY ingredient_code ASC');
    } else {
      ingredients = await db.all(
        'SELECT * FROM ingredients WHERE tenant_id = ? ORDER BY ingredient_code ASC',
        [user.tenant_id]
      );
    }

    return NextResponse.json({ success: true, ingredients });
  } catch (error) {
    console.error('Failed to fetch ingredients:', error);
    return NextResponse.json({ error: 'データの取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { ingredient_code, ingredient_name, purchase_weight, purchase_price, status } = await request.json();

    if (!ingredient_code || !ingredient_name) {
      return NextResponse.json({ error: '材料コードと材料名は必須です' }, { status: 400 });
    }

    const tenantId = user.role === 'super_admin' ? null : user.tenant_id;
    const db = await getDb();

    await db.run('BEGIN TRANSACTION');
    try {
      await db.run(`
        INSERT INTO ingredients (ingredient_code, ingredient_name, purchase_weight, purchase_price, status, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(ingredient_code) DO UPDATE SET
          ingredient_name = excluded.ingredient_name,
          purchase_weight = excluded.purchase_weight,
          purchase_price = excluded.purchase_price,
          status = excluded.status
      `, [ingredient_code, ingredient_name, purchase_weight || null, purchase_price || null, status || 'active', tenantId]);

      // 同一テナントの関連テーブルも連動更新
      if (tenantId) {
        await db.run(`UPDATE doughs SET ingredient_name = ? WHERE ingredient_code = ? AND tenant_id = ?`, [ingredient_name, ingredient_code, tenantId]);
        await db.run(`UPDATE product_ingredients SET ingredient_name = ? WHERE ingredient_code = ? AND tenant_id = ?`, [ingredient_name, ingredient_code, tenantId]);
      } else {
        await db.run(`UPDATE doughs SET ingredient_name = ? WHERE ingredient_code = ?`, [ingredient_name, ingredient_code]);
        await db.run(`UPDATE product_ingredients SET ingredient_name = ? WHERE ingredient_code = ?`, [ingredient_name, ingredient_code]);
      }

      await db.run('COMMIT');
      return NextResponse.json({ success: true });
    } catch (e) {
      await db.run('ROLLBACK');
      throw e;
    }
  } catch (error) {
    console.error('Failed to save ingredient:', error);
    return NextResponse.json({ error: 'データの保存に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    if (!code) return NextResponse.json({ error: '材料コードが指定されていません' }, { status: 400 });

    const db = await getDb();

    // 他テナントの材料は削除不可
    if (user.role !== 'super_admin') {
      const ing = await db.get('SELECT tenant_id FROM ingredients WHERE ingredient_code = ?', [code]);
      if (ing && ing.tenant_id !== user.tenant_id) {
        return NextResponse.json({ error: '他のテナントの材料は削除できません' }, { status: 403 });
      }
    }

    // 論理削除（statusをdeletedに変更）
    await db.run("UPDATE ingredients SET status = 'deleted' WHERE ingredient_code = ?", [code]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete ingredient:', error);
    return NextResponse.json({ error: 'データの削除に失敗しました' }, { status: 500 });
  }
}
