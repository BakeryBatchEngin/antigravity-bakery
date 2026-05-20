import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';

// ===== 関所ロジック：マネージャーのみアクセス可能 =====
async function getManagerAuth() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('bakery_session');
  if (!sessionCookie?.value) return { error: 'ログインが必要です', status: 401 };

  let user: any;
  try {
    user = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
  } catch {
    return { error: '無効なセッションです', status: 401 };
  }

  // manager と admin のみアクセス可能
  if (!['manager', 'admin'].includes(user.role)) {
    return { error: 'マネージャー権限が必要です', status: 403 };
  }

  const db = await getDb();
  return { user, db };
}

// GET: 全担当店舗 × 指定月 のKPIサマリーを返す
// クエリパラメータ: months=2026-03,2026-04,2026-05 (カンマ区切り)
export async function GET(request: Request) {
  try {
    const auth = await getManagerAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { user, db } = auth;

    const { searchParams } = new URL(request.url);
    const monthsParam = searchParams.get('months');

    // 月リストを組み立て（指定なければ直近3ヶ月）
    let months: string[] = [];
    if (monthsParam) {
      months = monthsParam.split(',').map(m => m.trim()).filter(Boolean);
    } else {
      // デフォルト：直近3ヶ月
      const now = new Date();
      for (let i = 2; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        months.push(`${yyyy}-${mm}`);
      }
    }

    // アクセス可能な店舗を取得（admin は全店、manager は担当店舗のみ）
    let storeList: any[];
    if (user.role === 'admin') {
      storeList = await db.all('SELECT id, store_code, store_name FROM stores ORDER BY store_code ASC');
    } else {
      // manager は user_stores テーブルで担当店舗を特定
      storeList = await db.all(`
        SELECT s.id, s.store_code, s.store_name
        FROM stores s
        INNER JOIN user_stores us ON s.id = us.store_id
        WHERE us.user_id = ?
        ORDER BY s.store_code ASC
      `, [user.id]);
    }

    // 月ごと・店舗ごとにKPIを集計する
    const result: any[] = [];

    for (const store of storeList) {
      const monthData: Record<string, any> = {};

      for (const month of months) {
        const pattern = `${month}-%`;

        // 売上サマリー（受注データ × 商品価格）
        const salesRow = await db.get(`
          SELECT 
            COALESCE(SUM(o.quantity * COALESCE(p.retail_price, 0)), 0) as retail_sales,
            COALESCE(SUM(o.quantity * COALESCE(p.wholesale_price, 0)), 0) as wholesale_sales
          FROM orders o
          LEFT JOIN products p ON o.product_code = p.product_code
          WHERE o.order_date LIKE ? AND o.store_id = ?
        `, [pattern, store.id]);

        // 原材料費合計（材料使用量 × 単価）
        const costRow = await db.get(`
          SELECT COALESCE(SUM(
            u.used_weight_grams * COALESCE(i.purchase_price, 0) / NULLIF(COALESCE(i.purchase_weight, 0), 0)
          ), 0) as material_cost
          FROM ingredient_usages u
          LEFT JOIN ingredients i ON u.ingredient_code = i.ingredient_code
          WHERE u.target_date LIKE ? AND u.store_id = ?
        `, [pattern, store.id]);

        const retailSales = Number(salesRow?.retail_sales) || 0;
        const wholesaleSales = Number(salesRow?.wholesale_sales) || 0;
        const materialCost = Math.round(Number(costRow?.material_cost) || 0);
        
        // 原価率：予想売上（小売）に対する原材料費の割合
        const costRate = retailSales > 0 
          ? Number(((materialCost / retailSales) * 100).toFixed(1)) 
          : null;

        monthData[month] = {
          retail_sales: retailSales,
          wholesale_sales: wholesaleSales,
          material_cost: materialCost,
          cost_rate: costRate,
        };
      }

      result.push({
        store_id: store.id,
        store_code: store.store_code,
        store_name: store.store_name,
        months: monthData,
      });
    }

    return NextResponse.json({ success: true, months, stores: result });

  } catch (error) {
    console.error('Manager dashboard error:', error);
    return NextResponse.json({ error: 'KPIデータの取得に失敗しました' }, { status: 500 });
  }
}
