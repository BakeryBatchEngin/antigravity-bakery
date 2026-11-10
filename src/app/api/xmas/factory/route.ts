import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getDb } from '@/lib/db';
import { XMAS_PRODUCTS } from '../orders/route';

const DELIVERY_DATES = [
  '2026-12-19',
  '2026-12-20',
  '2026-12-21',
  '2026-12-22',
  '2026-12-23',
  '2026-12-24',
  '2026-12-25',
];

/**
 * 工場用集計データ取得API
 */
export async function GET(request: Request) {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 工場、管理者、Superadmin、マネージャー、本部が閲覧可能
    const isAllowed = ['xmas_factory', 'admin', 'super_admin', 'xmas_manager', 'xmas_headquarters'].includes(user.role);
    if (!isAllowed) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const db = await getDb();
    const isSuperAdmin = user.role === 'super_admin';

    // 1. 全店舗アカウント取得（首都圏・地方）
    let accQuery = `
      SELECT id, username, display_name, role 
      FROM xmas_accounts 
      WHERE role IN ('tokyo_store', 'regional_store') AND is_active = true
    `;
    const accParams: any[] = [];
    if (!isSuperAdmin && user.tenant_id) {
      accParams.push(user.tenant_id);
      accQuery += ` AND tenant_id = $${accParams.length}`;
    }
    accQuery += ` ORDER BY role ASC, display_name ASC`;
    const storeAccounts = await db.all(accQuery, accParams);

    // 2. 全受注＆明細データを取得
    let dataQuery = `
      SELECT o.id, o.account_id, o.delivery_date, o.order_route,
             a.display_name as store_name, a.role as store_role,
             oi.product_name, oi.quantity
      FROM xmas_orders o
      JOIN xmas_accounts a ON o.account_id = a.id
      JOIN xmas_order_items oi ON o.id = oi.order_id
      WHERE 1=1
    `;
    const dataParams: any[] = [];
    if (!isSuperAdmin && user.tenant_id) {
      dataParams.push(user.tenant_id);
      dataQuery += ` AND o.tenant_id = $${dataParams.length}`;
    }
    const orderItemsRows = await db.all(dataQuery, dataParams);

    // 3. 最大受注数設定を取得
    let limitQuery = `SELECT product_name, max_limit FROM xmas_product_limits WHERE 1=1`;
    const limitParams: any[] = [];
    if (!isSuperAdmin && user.tenant_id) {
      limitParams.push(user.tenant_id);
      limitQuery += ` AND tenant_id = $${limitParams.length}`;
    }
    const limitRows = await db.all(limitQuery, limitParams);
    const limitMap: Record<string, number> = {};
    limitRows.forEach((r: any) => {
      limitMap[r.product_name] = Number(r.max_limit || 0);
    });

    // 4. 集計データ構造の構築
    // (A) 商品別日別出荷数（首都圏、地方、合算）
    // dailyMatrix[scope][product_name][date] = count
    const createEmptyDailyMatrix = () => {
      const matrix: Record<string, Record<string, number>> = {};
      XMAS_PRODUCTS.forEach(p => {
        matrix[p] = {};
        DELIVERY_DATES.forEach(d => {
          matrix[p][d] = 0;
        });
      });
      return matrix;
    };

    const dailyMatrix = {
      all: createEmptyDailyMatrix(),
      tokyo: createEmptyDailyMatrix(),
      regional: createEmptyDailyMatrix(),
    };

    // 商品ごとの総受注数
    const productTotalCount: Record<string, number> = {};
    XMAS_PRODUCTS.forEach(p => {
      productTotalCount[p] = 0;
    });

    // (B) 納品日別「店舗別 × 商品別」集計
    // storeMatrixByDate[date][accountId][product_name] = count
    const storeMatrixByDate: Record<string, Record<number, Record<string, number>>> = {};
    DELIVERY_DATES.forEach(d => {
      storeMatrixByDate[d] = {};
      storeAccounts.forEach((acc: any) => {
        storeMatrixByDate[d][acc.id] = {};
        XMAS_PRODUCTS.forEach(p => {
          storeMatrixByDate[d][acc.id][p] = 0;
        });
      });
    });

    // 集計ループ
    orderItemsRows.forEach((row: any) => {
      const { product_name, quantity, delivery_date, store_role, account_id } = row;
      const qty = Number(quantity || 0);

      if (productTotalCount[product_name] !== undefined) {
        productTotalCount[product_name] += qty;
      }

      // 日別マトリクス
      if (dailyMatrix.all[product_name] && dailyMatrix.all[product_name][delivery_date] !== undefined) {
        dailyMatrix.all[product_name][delivery_date] += qty;
        if (store_role === 'tokyo_store') {
          dailyMatrix.tokyo[product_name][delivery_date] += qty;
        } else if (store_role === 'regional_store') {
          dailyMatrix.regional[product_name][delivery_date] += qty;
        }
      }

      // 店舗別マトリクス
      if (storeMatrixByDate[delivery_date] && storeMatrixByDate[delivery_date][account_id]) {
        if (storeMatrixByDate[delivery_date][account_id][product_name] !== undefined) {
          storeMatrixByDate[delivery_date][account_id][product_name] += qty;
        }
      }
    });

    // 商品ごとのサマリー（合算数と最大受注数）
    const productSummaries = XMAS_PRODUCTS.map(p => ({
      product_name: p,
      total_quantity: productTotalCount[p] || 0,
      max_limit: limitMap[p] || 0,
      is_max_reached: limitMap[p] > 0 && (productTotalCount[p] || 0) >= limitMap[p],
    }));

    return NextResponse.json({
      dates: DELIVERY_DATES,
      products: XMAS_PRODUCTS,
      storeAccounts,
      dailyMatrix,
      productSummaries,
      storeMatrixByDate,
    });
  } catch (err: any) {
    console.error('Failed to get xmas factory data:', err);
    return NextResponse.json({ error: '工場集計データの取得に失敗しました', details: err.message }, { status: 500 });
  }
}
