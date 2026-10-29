import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { resolveLossStoreId } from '@/lib/lossStore';

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

// 当日の実績集計用ヘルパー
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

  // 4. ロス記録（入荷差分・試食数・ロス数・完売時間・コメント）
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

  // 行データの生成
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
    const price = Number(master?.retail_price ?? 0); // 単価（税抜き）
    const orderQty = Number(order?.order_quantity ?? waste?.order_quantity ?? 0);
    const orderAmount = orderQty * price;

    const deliveryDiff = Number(waste?.delivery_diff ?? 0);
    const actualDeliveryQty = orderQty + deliveryDiff;
    const actualDeliveryAmount = actualDeliveryQty * price; // 展開金額

    const wasteCount = Number(waste?.waste_count ?? 0);
    const wasteAmount = wasteCount * price;

    const sampleCount = Number(waste?.sample_count ?? 0);
    const sampleAmount = sampleCount * price;

    const soldQty = actualDeliveryQty - wasteCount - sampleCount;
    const soldAmount = soldQty * price;

    const soldOutTime = waste?.sold_out_time ? String(waste.sold_out_time).trim() : '';
    const comment = waste?.comment ? String(waste.comment).trim() : '';

    // 完売グラフ用の計算
    let soldOutStatus: 'early' | 'normal' | 'late' | 'not_sold_out' | 'no_time' = 'no_time';
    let soldOutPercent = 0; // 開店からの経過割合 (0〜100%)
    if (soldOutTime) {
      const soldMins = timeToMinutes(soldOutTime);
      if (soldMins !== null) {
        const diffFromOpen = soldMins - openMins;
        soldOutPercent = Math.min(100, Math.max(0, Math.round((diffFromOpen / totalOpenMinutes) * 100)));
        // 営業時間の半分未満で完売した場合は「early（早期完売＝機会ロスの疑い）」
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

  // ロス率・試食率（販売総額に対する比率。販売総額が0の場合は0）
  const wasteRate = totalSoldAmount > 0 ? (totalWasteAmount / totalSoldAmount) : 0;
  const sampleRate = totalSoldAmount > 0 ? (totalSampleAmount / totalSoldAmount) : 0;

  // 保存済みのAI分析コメントを取得
  const savedAiAnalysis = await db.get(
    'SELECT ai_comment, updated_at FROM daily_loss_ai_analyses WHERE store_id = ? AND target_date = ?',
    [storeId, targetDate]
  );

  return {
    store: {
      id: store.id,
      name: store.store_name,
      code: store.store_code,
    },
    targetDate,
    dayLabel,
    dayJaLabel,
    todayHours,
    locationCharacteristics: profile?.location_characteristics || '',
    summary: {
      soldAmount: totalSoldAmount, // 販売総額
      orderAmount: totalOrderAmount, // 発注総額
      deliveryAmount: totalDeliveryAmount, // 納品総額
      wasteAmount: totalWasteAmount, // ロス総額
      wasteRate, // ロス率（0.0557...）
      sampleAmount: totalSampleAmount, // 試食総額
      sampleRate, // 試食率（0.0072...）
    },
    rows,
    aiComment: savedAiAnalysis?.ai_comment || null,
    aiUpdatedAt: savedAiAnalysis?.updated_at || null,
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const targetDate = searchParams.get('date') || new Date().toISOString().slice(0, 10);

    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    }

    const db = await getDb(user);
    const resolved = await resolveLossStoreId(db, user);
    if (resolved.error || !resolved.storeId) {
      return NextResponse.json({ error: resolved.error || '店舗が特定できません' }, { status: resolved.status || 400 });
    }
    const storeId = resolved.storeId;

    const storeRow = await db.get('SELECT tenant_id FROM stores WHERE id = ?', [storeId]);
    const tenantId = storeRow?.tenant_id || user.tenant_id || null;

    const data = await buildDailyAnalytics(db, storeId, targetDate, tenantId);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error fetching loss analytics:', error);
    return NextResponse.json({ error: '実績解析データの取得に失敗しました', details: error.message }, { status: 500 });
  }
}

// AI分析コメントの生成・保存
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
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    await db.transactionWithUser(user.id, storeId, user.role, async (txDb) => {
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
    return NextResponse.json({ error: 'AI分析の生成に失敗しました', details: error.message }, { status: 500 });
  }
}
