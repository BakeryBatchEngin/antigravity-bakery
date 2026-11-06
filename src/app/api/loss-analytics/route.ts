import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { resolveLossStoreId, STORE_SWITCHABLE_ROLES } from '@/lib/lossStore';
import {
  getWeekRange,
  getWeekInfoFromDate,
  getMonthWeeks,
  getYearMonths,
  getTotalWeeksInYear,
} from '@/lib/lossWeekUtils';

// 曜日の英語・日本語マッピングとキー判定
const DAY_KEYS = ['sun_hol', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const DAY_JA_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

function getDayInfo(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayIdx = dt.getUTCDay();
  return {
    dayKey: DAY_KEYS[dayIdx],
    dayLabel: DAY_LABELS[dayIdx],
    dayJaLabel: DAY_JA_LABELS[dayIdx],
  };
}

// 時刻文字列 "HH:MM" を分に変換
function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = String(t).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

// ==========================================
// 1. 日次（Dayモード）の実績集計
// ==========================================
async function buildDailyAnalytics(db: any, storeId: number, targetDate: string, tenantId: number | null) {
  // 1. 店舗情報
  const store = await db.get('SELECT id, store_name, store_code FROM stores WHERE id = ?', [storeId]);
  const profile = await db.get(
    'SELECT business_hours, location_characteristics FROM store_profiles WHERE store_id = ?',
    [storeId]
  );

  let businessHoursMap: any = null;
  if (profile?.business_hours) {
    try {
      businessHoursMap = JSON.parse(profile.business_hours);
    } catch (e) {
      businessHoursMap = null;
    }
  }

  const { dayKey, dayLabel, dayJaLabel } = getDayInfo(targetDate);
  const todayHours = businessHoursMap?.[dayKey] || { open: '08:00', close: '20:00', closed: false };
  const openMins = timeToMinutes(todayHours.open) ?? 8 * 60;
  const closeMins = timeToMinutes(todayHours.close) ?? 20 * 60;
  const totalOpenMinutes = Math.max(60, closeMins - openMins);

  // 2. 販売商品マスタ
  const masterMap = new Map<string, any>();
  if (tenantId) {
    const masterRows = await db.all(
      `SELECT product_code, product_name, retail_price, category, characteristics
       FROM store_products
       WHERE tenant_id = ?`,
      [tenantId]
    );
    for (const m of masterRows) {
      masterMap.set(m.product_code, m);
    }
  }

  // 3. 販売オーダー
  const orders = await db.all(
    `SELECT product_code, MAX(product_name) as product_name, SUM(quantity) as order_quantity
     FROM store_sales_orders
     WHERE store_id = ? AND order_date = ?
     GROUP BY product_code`,
    [storeId, targetDate]
  );
  const orderMap = new Map<string, any>();
  for (const o of orders) {
    orderMap.set(o.product_code, o);
  }

  // 4. ロス記録
  const wasteRecords = await db.all(
    `SELECT product_code, product_name, order_quantity, waste_count, sold_out_time, comment, delivery_diff, sample_count
     FROM waste_records
     WHERE store_id = ? AND target_date = ?`,
    [storeId, targetDate]
  );
  const wasteMap = new Map<string, any>();
  for (const w of wasteRecords) {
    wasteMap.set(w.product_code, w);
  }

  // 5. 商品コードのユニオン
  const allCodes = new Set<string>([...orderMap.keys(), ...wasteMap.keys()]);

  const rows: any[] = [];
  let totalOrderAmount = 0;
  let totalDeliveryAmount = 0;
  let totalSoldAmount = 0;
  let totalWasteAmount = 0;
  let totalSampleAmount = 0;

  for (const code of Array.from(allCodes).sort()) {
    const master = masterMap.get(code);
    const order = orderMap.get(code);
    const waste = wasteMap.get(code);

    const productName = master?.product_name || order?.product_name || waste?.product_name || '（名称不明）';
    const price = Number(master?.retail_price ?? 0);
    const orderQty = Number(order?.order_quantity ?? waste?.order_quantity ?? 0);
    const orderAmount = orderQty * price;

    const deliveryDiff = Number(waste?.delivery_diff ?? 0);
    const actualDeliveryQty = orderQty + deliveryDiff;
    const actualDeliveryAmount = actualDeliveryQty * price;

    const wasteCount = Number(waste?.waste_count ?? 0);
    const wasteAmount = wasteCount * price;

    const sampleCount = Number(waste?.sample_count ?? 0);
    const sampleAmount = sampleCount * price;

    const soldQty = actualDeliveryQty - wasteCount - sampleCount;
    const soldAmount = soldQty * price;

    const soldOutTime = waste?.sold_out_time ? String(waste.sold_out_time).trim() : '';
    const comment = waste?.comment ? String(waste.comment).trim() : '';

    let soldOutStatus: 'early' | 'normal' | 'late' | 'not_sold_out' | 'no_time' = 'no_time';
    let soldOutPercent = 0;
    if (soldOutTime) {
      const soldMins = timeToMinutes(soldOutTime);
      if (soldMins !== null) {
        const diffFromOpen = soldMins - openMins;
        soldOutPercent = Math.min(100, Math.max(0, Math.round((diffFromOpen / totalOpenMinutes) * 100)));
        if (soldOutPercent <= 50) {
          soldOutStatus = 'early';
        } else if (soldOutPercent <= 85) {
          soldOutStatus = 'normal';
        } else {
          soldOutStatus = 'late';
        }
      }
    } else if (wasteCount > 0) {
      soldOutStatus = 'not_sold_out';
    }

    rows.push({
      productCode: code,
      productName,
      price,
      orderQty,
      orderAmount,
      deliveryDiff,
      actualDeliveryQty,
      actualDeliveryAmount,
      soldQty,
      soldAmount,
      wasteCount,
      wasteAmount,
      sampleCount,
      sampleAmount,
      soldOutTime,
      soldOutPercent,
      soldOutStatus,
      comment,
    });

    totalOrderAmount += orderAmount;
    totalDeliveryAmount += actualDeliveryAmount;
    totalSoldAmount += soldAmount;
    totalWasteAmount += wasteAmount;
    totalSampleAmount += sampleAmount;
  }

  const wasteRate = totalSoldAmount > 0 ? totalWasteAmount / totalSoldAmount : 0;
  const sampleRate = totalSoldAmount > 0 ? totalSampleAmount / totalSoldAmount : 0;

  const savedAiAnalysis = await db.get(
    'SELECT ai_comment, updated_at FROM daily_loss_ai_analyses WHERE store_id = ? AND target_date = ?',
    [storeId, targetDate]
  );

  return {
    mode: 'day',
    store: {
      id: store.id,
      name: store.store_name,
      code: store.store_code,
      isAllStores: false,
    },
    targetDate,
    dayLabel,
    dayJaLabel,
    todayHours,
    locationCharacteristics: profile?.location_characteristics || '',
    summary: {
      soldAmount: totalSoldAmount,
      orderAmount: totalOrderAmount,
      deliveryAmount: totalDeliveryAmount,
      wasteAmount: totalWasteAmount,
      wasteRate,
      sampleAmount: totalSampleAmount,
      sampleRate,
    },
    rows,
    aiComment: savedAiAnalysis?.ai_comment || null,
    aiUpdatedAt: savedAiAnalysis?.updated_at || null,
  };
}

// ==========================================
// 2. 期間（週・月・年）の実績集計
// ==========================================
interface StoreInfo {
  id: number;
  name: string;
  code: string;
}

interface PeriodSegment {
  key: string;
  label: string;
  shortLabel: string;
  dates: string[];
}

async function buildPeriodAnalytics(
  db: any,
  stores: StoreInfo[],
  tenantId: number,
  mode: 'week' | 'month' | 'year',
  year: number,
  week?: number,
  month?: number
) {
  // 1. 期間とセグメントの確定
  let periodLabel = '';
  let startDate = '';
  let endDate = '';
  const segments: PeriodSegment[] = [];

  if (mode === 'week') {
    const validWeek = week && week >= 1 ? week : 1;
    const weekRange = getWeekRange(year, validWeek);
    periodLabel = `${year}年第${validWeek}週　実績データ`;
    startDate = weekRange.startDate;
    endDate = weekRange.endDate;

    const dayShortLabels = ['月', '火', '水', '木', '金', '土', '日'];
    weekRange.dates.forEach((dStr, idx) => {
      const parts = dStr.split('-');
      const md = `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}`;
      segments.push({
        key: dStr,
        label: `${dayShortLabels[idx]} (${md})`,
        shortLabel: dayShortLabels[idx],
        dates: [dStr],
      });
    });
  } else if (mode === 'month') {
    const validMonth = month && month >= 1 && month <= 12 ? month : 1;
    const monthWeeks = getMonthWeeks(year, validMonth);
    periodLabel = `${year}年${validMonth}月　実績データ`;
    startDate = monthWeeks[0]?.startDate || `${year}-${String(validMonth).padStart(2, '0')}-01`;
    endDate = monthWeeks[monthWeeks.length - 1]?.endDate || `${year}-${String(validMonth).padStart(2, '0')}-28`;

    monthWeeks.forEach(mw => {
      segments.push({
        key: `W${mw.weekNumber}`,
        label: mw.label,
        shortLabel: mw.shortLabel,
        dates: mw.dates,
      });
    });
  } else {
    // year
    const yearMonths = getYearMonths(year);
    periodLabel = `${year}年　年間実績データ`;
    startDate = `${year}-01-01`;
    endDate = `${year}-12-31`;

    yearMonths.forEach(ym => {
      segments.push({
        key: `M${ym.month}`,
        label: ym.label,
        shortLabel: ym.label,
        dates: ym.dates,
      });
    });
  }

  // 2. 店舗IDリストと店舗マップ
  const storeIds = stores.map(s => s.id);
  const storeMap = new Map<number, StoreInfo>();
  stores.forEach(s => storeMap.set(s.id, s));
  const placeholders = storeIds.map(() => '?').join(',');

  // 3. 販売商品マスタの取得
  const masterRows = await db.all(
    `SELECT product_code, product_name, retail_price, category, characteristics
     FROM store_products
     WHERE tenant_id = ?`,
    [tenantId]
  );
  const masterMap = new Map<string, any>();
  const categorySet = new Set<string>();
  for (const m of masterRows) {
    const cat = (m.category || '').trim() || '未分類';
    masterMap.set(m.product_code, {
      code: m.product_code,
      name: m.product_name,
      price: Number(m.retail_price ?? 0),
      category: cat,
    });
    categorySet.add(cat);
  }

  // 4. 発注データとロス・実績データの取得
  const orderRows = storeIds.length > 0 ? await db.all(
    `SELECT store_id, order_date, product_code, MAX(product_name) as product_name, SUM(quantity) as quantity
     FROM store_sales_orders
     WHERE store_id IN (${placeholders}) AND order_date >= ? AND order_date <= ?
     GROUP BY store_id, order_date, product_code`,
    [...storeIds, startDate, endDate]
  ) : [];

  const wasteRows = storeIds.length > 0 ? await db.all(
    `SELECT store_id, target_date, product_code, product_name, order_quantity, waste_count, sold_out_time, comment, delivery_diff, sample_count
     FROM waste_records
     WHERE store_id IN (${placeholders}) AND target_date >= ? AND target_date <= ?`,
    [...storeIds, startDate, endDate]
  ) : [];

  // 5. 日付 × 店舗 × 商品コードごとの実績マップを構築
  interface MergedItem {
    storeId: number;
    date: string;
    productCode: string;
    productName: string;
    category: string;
    price: number;
    orderQty: number;
    deliveryDiff: number;
    wasteCount: number;
    sampleCount: number;
    soldQty: number;
    soldAmount: number;
    orderAmount: number;
    deliveryAmount: number;
    wasteAmount: number;
    sampleAmount: number;
    soldOutTime?: string;
  }

  const mergedMap = new Map<string, MergedItem>();

  for (const o of orderRows) {
    const key = `${o.store_id}__${o.order_date}__${o.product_code}`;
    const master = masterMap.get(o.product_code);
    const cat = master?.category || '未分類';
    categorySet.add(cat);
    const price = master?.price ?? 0;
    const orderQty = Number(o.quantity ?? 0);

    mergedMap.set(key, {
      storeId: o.store_id,
      date: o.order_date,
      productCode: o.product_code,
      productName: master?.name || o.product_name || '（名称不明）',
      category: cat,
      price,
      orderQty,
      deliveryDiff: 0,
      wasteCount: 0,
      sampleCount: 0,
      soldQty: orderQty,
      soldAmount: orderQty * price,
      orderAmount: orderQty * price,
      deliveryAmount: orderQty * price,
      wasteAmount: 0,
      sampleAmount: 0,
    });
  }

  for (const w of wasteRows) {
    const key = `${w.store_id}__${w.target_date}__${w.product_code}`;
    const master = masterMap.get(w.product_code);
    const cat = master?.category || '未分類';
    categorySet.add(cat);
    const price = master?.price ?? 0;

    const existing = mergedMap.get(key);
    const orderQty = Number(w.order_quantity ?? existing?.orderQty ?? 0);
    const deliveryDiff = Number(w.delivery_diff ?? 0);
    const wasteCount = Number(w.waste_count ?? 0);
    const sampleCount = Number(w.sample_count ?? 0);
    const actualDeliveryQty = orderQty + deliveryDiff;
    const soldQty = actualDeliveryQty - wasteCount - sampleCount;

    const item: MergedItem = {
      storeId: w.store_id,
      date: w.target_date,
      productCode: w.product_code,
      productName: master?.name || w.product_name || existing?.productName || '（名称不明）',
      category: cat,
      price,
      orderQty,
      deliveryDiff,
      wasteCount,
      sampleCount,
      soldQty,
      soldAmount: soldQty * price,
      orderAmount: orderQty * price,
      deliveryAmount: actualDeliveryQty * price,
      wasteAmount: wasteCount * price,
      sampleAmount: sampleCount * price,
      soldOutTime: w.sold_out_time ? String(w.sold_out_time).trim() : undefined,
    };
    mergedMap.set(key, item);
  }

  const allMergedItems = Array.from(mergedMap.values());

  // 日付 → 所属セグメントインデックスのマップ
  const dateToSegmentIdx = new Map<string, number>();
  segments.forEach((seg, sIdx) => {
    seg.dates.forEach(d => dateToSegmentIdx.set(d, sIdx));
  });

  // 6. 各セグメントの集計
  interface SegmentMetric {
    soldAmount: number;
    orderAmount: number;
    deliveryAmount: number;
    wasteAmount: number;
    wasteRate: number;
    sampleAmount: number;
    sampleRate: number;
  }

  const segmentMetrics: SegmentMetric[] = segments.map(() => ({
    soldAmount: 0,
    orderAmount: 0,
    deliveryAmount: 0,
    wasteAmount: 0,
    wasteRate: 0,
    sampleAmount: 0,
    sampleRate: 0,
  }));

  // カテゴリー別のセグメント集計用
  const categoryList = Array.from(categorySet).sort();
  interface CategoryData {
    category: string;
    totalSoldAmount: number;
    totalWasteAmount: number;
    wasteRate: number;
    segmentValues: { soldAmount: number; wasteAmount: number; wasteRate: number }[];
  }
  const categoryBreakdownMap = new Map<string, CategoryData>();
  for (const cat of categoryList) {
    categoryBreakdownMap.set(cat, {
      category: cat,
      totalSoldAmount: 0,
      totalWasteAmount: 0,
      wasteRate: 0,
      segmentValues: segments.map(() => ({ soldAmount: 0, wasteAmount: 0, wasteRate: 0 })),
    });
  }

  // 商品別集計（ランキング用）
  interface ProductAgg {
    productCode: string;
    productName: string;
    category: string;
    soldQty: number;
    soldAmount: number;
    wasteCount: number;
    wasteAmount: number;
  }
  const productAggMap = new Map<string, ProductAgg>();

  // アイテムを集計に反映
  for (const item of allMergedItems) {
    const sIdx = dateToSegmentIdx.get(item.date);
    if (sIdx !== undefined && sIdx >= 0 && sIdx < segmentMetrics.length) {
      const sm = segmentMetrics[sIdx];
      sm.soldAmount += item.soldAmount;
      sm.orderAmount += item.orderAmount;
      sm.deliveryAmount += item.deliveryAmount;
      sm.wasteAmount += item.wasteAmount;
      sm.sampleAmount += item.sampleAmount;

      // カテゴリー
      const catData = categoryBreakdownMap.get(item.category);
      if (catData) {
        catData.totalSoldAmount += item.soldAmount;
        catData.totalWasteAmount += item.wasteAmount;
        const cSeg = catData.segmentValues[sIdx];
        cSeg.soldAmount += item.soldAmount;
        cSeg.wasteAmount += item.wasteAmount;
      }
    }

    // 商品別ランキング用集計
    let pAgg = productAggMap.get(item.productCode);
    if (!pAgg) {
      pAgg = {
        productCode: item.productCode,
        productName: item.productName,
        category: item.category,
        soldQty: 0,
        soldAmount: 0,
        wasteCount: 0,
        wasteAmount: 0,
      };
      productAggMap.set(item.productCode, pAgg);
    }
    pAgg.soldQty += item.soldQty;
    pAgg.soldAmount += item.soldAmount;
    pAgg.wasteCount += item.wasteCount;
    pAgg.wasteAmount += item.wasteAmount;
  }

  // セグメントごとの比率計算
  segmentMetrics.forEach(sm => {
    sm.wasteRate = sm.soldAmount > 0 ? sm.wasteAmount / sm.soldAmount : 0;
    sm.sampleRate = sm.soldAmount > 0 ? sm.sampleAmount / sm.soldAmount : 0;
  });

  // カテゴリーごとの比率計算
  for (const catData of categoryBreakdownMap.values()) {
    catData.wasteRate = catData.totalSoldAmount > 0 ? catData.totalWasteAmount / catData.totalSoldAmount : 0;
    catData.segmentValues.forEach(cs => {
      cs.wasteRate = cs.soldAmount > 0 ? cs.wasteAmount / cs.soldAmount : 0;
    });
  }

  // 期間総合計（サマリー）
  let totalSoldAmount = 0;
  let totalOrderAmount = 0;
  let totalDeliveryAmount = 0;
  let totalWasteAmount = 0;
  let totalSampleAmount = 0;
  segmentMetrics.forEach(sm => {
    totalSoldAmount += sm.soldAmount;
    totalOrderAmount += sm.orderAmount;
    totalDeliveryAmount += sm.deliveryAmount;
    totalWasteAmount += sm.wasteAmount;
    totalSampleAmount += sm.sampleAmount;
  });

  const summary = {
    soldAmount: totalSoldAmount,
    orderAmount: totalOrderAmount,
    deliveryAmount: totalDeliveryAmount,
    wasteAmount: totalWasteAmount,
    wasteRate: totalSoldAmount > 0 ? totalWasteAmount / totalSoldAmount : 0,
    sampleAmount: totalSampleAmount,
    sampleRate: totalSoldAmount > 0 ? totalSampleAmount / totalSoldAmount : 0,
  };

  // 7. ランキング生成
  const productAggList = Array.from(productAggMap.values());

  // 売上TOP5
  const topSales = [...productAggList]
    .filter(p => p.soldAmount > 0)
    .sort((a, b) => b.soldAmount - a.soldAmount)
    .slice(0, 5)
    .map((p, idx) => ({
      rank: idx + 1,
      productCode: p.productCode,
      productName: p.productName,
      category: p.category,
      soldQty: p.soldQty,
      soldAmount: p.soldAmount,
    }));

  // ロス額ワーストTOP5
  const topWaste = [...productAggList]
    .filter(p => p.wasteAmount > 0)
    .sort((a, b) => b.wasteAmount - a.wasteAmount)
    .slice(0, 5)
    .map((p, idx) => ({
      rank: idx + 1,
      productCode: p.productCode,
      productName: p.productName,
      category: p.category,
      wasteCount: p.wasteCount,
      wasteAmount: p.wasteAmount,
      wasteRate: p.soldAmount > 0 ? p.wasteAmount / p.soldAmount : 1,
    }));

  // 早期完売TOP5（完売時間が早かった順）
  // wasteRows のうち sold_out_time があるものを抽出
  const earlySoldRecords: {
    productCode: string;
    productName: string;
    targetDate: string;
    dayJaLabel: string;
    soldOutTime: string;
    timeMinutes: number;
    storeName: string;
  }[] = [];

  for (const w of wasteRows) {
    const sTime = w.sold_out_time ? String(w.sold_out_time).trim() : '';
    if (!sTime) continue;
    const mins = timeToMinutes(sTime);
    if (mins === null) continue;

    const master = masterMap.get(w.product_code);
    const storeObj = storeMap.get(w.store_id);
    const { dayJaLabel } = getDayInfo(w.target_date);

    earlySoldRecords.push({
      productCode: w.product_code,
      productName: master?.name || w.product_name || '（名称不明）',
      targetDate: w.target_date,
      dayJaLabel,
      soldOutTime: sTime,
      timeMinutes: mins,
      storeName: storeObj?.name || '',
    });
  }

  // 時間が早い順にソート（昇順）
  earlySoldRecords.sort((a, b) => a.timeMinutes - b.timeMinutes);

  // 同一商品は最も早い日を代表として採用し、重複を排除して上位5商品
  const seenProducts = new Set<string>();
  const topEarlySoldOut: any[] = [];
  for (const rec of earlySoldRecords) {
    if (!seenProducts.has(rec.productCode)) {
      seenProducts.add(rec.productCode);
      topEarlySoldOut.push({
        rank: topEarlySoldOut.length + 1,
        productCode: rec.productCode,
        productName: rec.productName,
        targetDate: rec.targetDate,
        dayJaLabel: rec.dayJaLabel,
        soldOutTime: rec.soldOutTime,
        storeName: rec.storeName,
      });
      if (topEarlySoldOut.length >= 5) break;
    }
  }

  // カテゴリー別実績を販売額順に並べる
  const categoryBreakdown = Array.from(categoryBreakdownMap.values()).sort(
    (a, b) => b.totalSoldAmount - a.totalSoldAmount
  );

  const isAllStores = stores.length > 1;
  const storeDisplay = isAllStores
    ? { id: 'all', name: '全店舗合算', code: 'ALL', isAllStores: true, storeCount: stores.length }
    : { id: stores[0]?.id || 0, name: stores[0]?.name || '店舗', code: stores[0]?.code || '', isAllStores: false };

  return {
    mode,
    periodLabel,
    period: {
      mode,
      year,
      week: week || null,
      month: month || null,
      startDate,
      endDate,
      totalWeeks: mode === 'week' ? getTotalWeeksInYear(year) : null,
    },
    store: storeDisplay,
    summary,
    segments: segments.map((seg, idx) => ({
      key: seg.key,
      label: seg.label,
      shortLabel: seg.shortLabel,
      metrics: segmentMetrics[idx],
    })),
    rankings: {
      topSales,
      topWaste,
      topEarlySoldOut,
    },
    categoryBreakdown,
  };
}

// ==========================================
// 3. GET ハンドラ（日次・週次・月次・年次 対応）
// ==========================================
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = (searchParams.get('mode') || 'day') as 'day' | 'week' | 'month' | 'year';

    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    }

    const db = await getDb(user);

    // ユーザーの切り替え権限
    const isSwitchable = STORE_SWITCHABLE_ROLES.includes(user.role);

    // 1. 所属企業（tenant_id）の特定
    let tenantId = user.tenant_id ? Number(user.tenant_id) : null;

    // 店舗選択パラメータ
    const reqStoreId = searchParams.get('storeId');

    // 店舗ロス管理者（切り替え不可）の場合: 自店舗のみ
    if (!isSwitchable) {
      const resolved = await resolveLossStoreId(db, user);
      if (resolved.error || !resolved.storeId) {
        return NextResponse.json(
          { error: resolved.error || '店舗が特定できません' },
          { status: resolved.status || 400 }
        );
      }
      const storeId = resolved.storeId;
      if (!tenantId) {
        const storeRow = await db.get('SELECT tenant_id FROM stores WHERE id = ?', [storeId]);
        tenantId = storeRow?.tenant_id || null;
      }

      if (mode === 'day') {
        const targetDate = searchParams.get('date') || new Date().toISOString().slice(0, 10);
        const data = await buildDailyAnalytics(db, storeId, targetDate, tenantId);
        return NextResponse.json(data);
      }

      // 週次・月次・年次（単一店舗）
      const storeRow = await db.get('SELECT id, store_name, store_code FROM stores WHERE id = ?', [storeId]);
      const stores: StoreInfo[] = [
        { id: storeRow.id, name: storeRow.store_name, code: storeRow.store_code },
      ];

      const year = parseInt(searchParams.get('year') || '', 10) || new Date().getFullYear();
      const week = parseInt(searchParams.get('week') || '', 10) || undefined;
      const month = parseInt(searchParams.get('month') || '', 10) || undefined;

      const data = await buildPeriodAnalytics(db, stores, tenantId || 0, mode, year, week, month);
      return NextResponse.json(data);
    }

    // ロスマネージャー（切り替え権限あり）の場合
    // 自社テナント内の全店舗リストを取得
    if (!tenantId) {
      // ユーザーの店舗から逆引き
      const userStore = await db.get('SELECT s.tenant_id FROM stores s JOIN user_stores us ON us.store_id = s.id WHERE us.user_id = ?', [user.id]);
      tenantId = userStore?.tenant_id || 1;
    }

    const tenantStores = await db.all(
      'SELECT id, store_name, store_code FROM stores WHERE tenant_id = ? ORDER BY id ASC',
      [tenantId]
    );

    // 全店舗合算モード判定
    const isAllStoresReq = reqStoreId === 'all';

    let targetStores: StoreInfo[] = [];
    if (isAllStoresReq) {
      targetStores = tenantStores.map((s: any) => ({ id: s.id, name: s.store_name, code: s.store_code }));
    } else if (reqStoreId) {
      const selected = tenantStores.find((s: any) => s.id === Number(reqStoreId));
      if (selected) {
        targetStores = [{ id: selected.id, name: selected.store_name, code: selected.store_code }];
      }
    }

    // フォールバック: resolveLossStoreId
    if (targetStores.length === 0) {
      const resolved = await resolveLossStoreId(db, user);
      if (resolved.storeId) {
        const found = tenantStores.find((s: any) => s.id === resolved.storeId);
        if (found) {
          targetStores = [{ id: found.id, name: found.store_name, code: found.store_code }];
        }
      }
    }

    if (targetStores.length === 0 && tenantStores.length > 0) {
      targetStores = [{ id: tenantStores[0].id, name: tenantStores[0].store_name, code: tenantStores[0].store_code }];
    }

    if (targetStores.length === 0) {
      return NextResponse.json({ error: '店舗情報が存在しません' }, { status: 400 });
    }

    // 日次モードの場合
    if (mode === 'day') {
      const targetDate = searchParams.get('date') || new Date().toISOString().slice(0, 10);
      const data = await buildDailyAnalytics(db, targetStores[0].id, targetDate, tenantId);
      return NextResponse.json(data);
    }

    // 週・月・年モード
    const year = parseInt(searchParams.get('year') || '', 10) || new Date().getFullYear();
    const week = parseInt(searchParams.get('week') || '', 10) || undefined;
    const month = parseInt(searchParams.get('month') || '', 10) || undefined;

    const data = await buildPeriodAnalytics(db, targetStores, tenantId || 0, mode, year, week, month);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error fetching loss analytics:', error);
    return NextResponse.json(
      {
        error: '実績解析データの取得に失敗しました',
        details: process.env.NODE_ENV === 'production' ? undefined : error.message,
      },
      { status: 500 }
    );
  }
}

// ==========================================
// 4. POST ハンドラ（AI分析コメント生成）
// ==========================================
export async function POST(req: Request) {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    }

    const { targetDate } = await req.json();
    if (!targetDate) {
      return NextResponse.json({ error: '日付が指定されていません。' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません。' }, { status: 500 });
    }

    const db = await getDb(user);
    const resolved = await resolveLossStoreId(db, user);
    if (resolved.error || !resolved.storeId) {
      return NextResponse.json({ error: resolved.error || '店舗が特定できません' }, { status: resolved.status || 400 });
    }
    const storeId = resolved.storeId;

    const storeRow = await db.get('SELECT tenant_id FROM stores WHERE id = ?', [storeId]);
    const tenantId = storeRow?.tenant_id || user.tenant_id || null;

    // 当日の集計データを構築
    const data = await buildDailyAnalytics(db, storeId, targetDate, tenantId);

    // 早期完売商品（機会ロスの疑い）
    const earlySoldOutItems = data.rows
      .filter((r: any) => r.soldOutStatus === 'early')
      .map((r: any) => `${r.productName}（完売:${r.soldOutTime}、販売数:${r.soldQty}個）`);

    // ロスが多い商品
    const highWasteItems = [...data.rows]
      .filter((r: any) => r.wasteCount > 0)
      .sort((a: any, b: any) => b.wasteAmount - a.wasteAmount)
      .slice(0, 5)
      .map((r: any) => `${r.productName}（ロス:${r.wasteCount}個 / ${r.wasteAmount.toLocaleString()}円）`);

    // 店長コメントがある商品
    const commentedItems = data.rows
      .filter((r: any) => r.comment)
      .map((r: any) => `${r.productName}: 「${r.comment}」`);

    // Geminiへのプロンプト作成
    const prompt = `あなたは全国のベーカリーのロス削減と売上最大化を支援するシニアベーカリー経営コンサルタントです。
以下の店舗の【基礎データ（営業時間・立地条件）】と【${data.targetDate}（${data.dayJaLabel}曜日）の販売・ロス実績】を総合的に分析し、店長に向けた具体的で励みになる実践的な改善アドバイス（200〜300文字程度）を作成してください。

【店舗情報】
- 店舗名: ${data.store.name}
- 営業時間（${data.dayJaLabel}曜）: ${data.todayHours.open} 〜 ${data.todayHours.close}
- 立地条件・客層の特徴: ${data.locationCharacteristics || '（未設定）'}

【本日の実績サマリー】
- 販売総額: ¥${data.summary.soldAmount.toLocaleString()}
- 発注総額: ¥${data.summary.orderAmount.toLocaleString()}
- 納品総額: ¥${data.summary.deliveryAmount.toLocaleString()}
- ロス総額: ¥${data.summary.wasteAmount.toLocaleString()}（ロス率: ${(data.summary.wasteRate * 100).toFixed(2)}%）
- 試食総額: ¥${data.summary.sampleAmount.toLocaleString()}（試食率: ${(data.summary.sampleRate * 100).toFixed(2)}%）

【注目の個別商品動向】
- 早期完売商品（早い時間に売り切れて機会損失が出ている可能性）:
  ${earlySoldOutItems.length > 0 ? earlySoldOutItems.join('、') : 'なし'}
- ロス額の大きかった商品（作りすぎ・発注過多の可能性）:
  ${highWasteItems.length > 0 ? highWasteItems.join('、') : 'なし'}
- 店長の現場メモ・コメント:
  ${commentedItems.length > 0 ? commentedItems.join('\n  ') : '特になし'}

【回答の要件】
- 冒頭に本日の総括（よく売れた点やロスの抑制度合など）。
- 立地条件や営業時間をふまえた、早期完売商品への増量提案や、ロス品目の調整アドバイス。
- 試食の活用状況や店長コメントへの具体的なフォロー。
- 丁寧で温かみがあり、現場が前向きに明日活かせるアドバイスにしてください。`;

    const modelName = process.env.GEMINI_MODEL || 'gemini-flash-latest';
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024,
            thinkingConfig: {
              thinkingLevel: 'LOW',
            },
          },
        }),
      }
    );

    const geminiData = await geminiRes.json();
    if (!geminiRes.ok) {
      throw new Error(geminiData?.error?.message || `Gemini API error (${geminiRes.status})`);
    }

    const aiComment = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '分析結果を生成できませんでした。';

    // DBに保存（UPSERT）
    await db.transactionWithUser(user.id, storeId, user.role, async (txDb: any) => {
      const existing = await txDb.get(
        'SELECT id FROM daily_loss_ai_analyses WHERE store_id = ? AND target_date = ?',
        [storeId, targetDate]
      );
      if (existing) {
        await txDb.run(
          `UPDATE daily_loss_ai_analyses
           SET ai_comment = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [aiComment, existing.id]
        );
      } else {
        await txDb.run(
          `INSERT INTO daily_loss_ai_analyses (store_id, target_date, ai_comment)
           VALUES (?, ?, ?)`,
          [storeId, targetDate, aiComment]
        );
      }
    });

    return NextResponse.json({ success: true, aiComment });
  } catch (error: any) {
    console.error('Error generating AI analysis:', error);
    return NextResponse.json(
      {
        error: 'AI分析の生成に失敗しました',
        details: process.env.NODE_ENV === 'production' ? undefined : error.message,
      },
      { status: 500 }
    );
  }
}
