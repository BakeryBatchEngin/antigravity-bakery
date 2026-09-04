import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json({ error: '日付(date)が指定されていません' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('bakery_session');
    
    if (!sessionCookie || !sessionCookie.value) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }
    
    let user;
    try {
      user = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
    } catch (e) {
      return NextResponse.json({ error: '無効なセッションです' }, { status: 401 });
    }

    const db = await getDb();
    const storeCookie = cookieStore.get('active_store_id');
    const requestedStoreId = storeCookie ? Number(storeCookie.value) : null;
    let storeId = null;

    if (['admin', 'master', 'manager'].includes(user.role)) {
      storeId = requestedStoreId;
    } else if (user.role === 'chef') {
      const userStores = await db.all('SELECT store_id FROM user_stores WHERE user_id = ?', [user.id]);
      if (!userStores || userStores.length === 0) {
        return NextResponse.json({ error: '所属店舗が設定されていません。管理者に連絡してください。' }, { status: 403 });
      }
      
      const allowedStoreIds = userStores.map((row: any) => Number(row.store_id));
      
      if (requestedStoreId !== null && allowedStoreIds.includes(requestedStoreId)) {
        storeId = requestedStoreId;
      } else {
        // 未指定、または不正なIDの場合は所属店舗の1つ目をデフォルトセット
        storeId = allowedStoreIds[0];
      }
    } else {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    if (!storeId) {
      return NextResponse.json({ error: '店舗が選択されていません' }, { status: 400 });
    }

    const mixers = await db.all('SELECT * FROM mixer_capacities WHERE store_id = ? ORDER BY max_capacity_kg DESC', [storeId]);
    const defaultMixer = mixers.length > 0 ? mixers[0] : null;
    const MIXER_LIMIT_G = defaultMixer ? defaultMixer.max_capacity_kg * 1000 : 50000;

    const orderedProductsRaw = await db.all(`
      SELECT product_code, MAX(product_name) as order_product_name, SUM(quantity) as total_quantity
      FROM orders
      WHERE order_date = ? AND store_id = ? AND product_code IS NOT NULL AND product_code != ''
      GROUP BY product_code
    `, [date, storeId]);

    // 最新のマスタ商品名を取得
    const masterProductNames = await db.all(`
      SELECT product_code, MAX(product_name) as master_product_name
      FROM (
        SELECT product_code, product_name FROM product_doughs
        UNION ALL
        SELECT product_code, product_name FROM product_ingredients
      )
      GROUP BY product_code
    `);
    const masterNameMap: Record<string, string> = {};
    masterProductNames.forEach((row: any) => {
      masterNameMap[row.product_code] = row.master_product_name;
    });

    const orderedProducts = orderedProductsRaw.map((p: any) => ({
      product_code: p.product_code,
      product_name: masterNameMap[p.product_code] || p.order_product_name,
      total_quantity: p.total_quantity
    }));

    if (orderedProducts.length === 0) {
      return NextResponse.json({ message: 'その日の注文データはありません', productionPlan: [], productMixingPlan: [] });
    }

    // ==========================================
    // 1.5 手動で保存(Set)された計画データと実行済み状態の取得
    // ==========================================
    const savedPlanRow = await db.get(`SELECT plan_data FROM daily_production_plans WHERE target_date = ? AND store_id = ?`, [date, storeId]);
    let savedFlatBatches = null;
    let savedFlatProductBatches = null;
    let isPlanSet = false;

    if (savedPlanRow) {
      try {
        const parsed = JSON.parse(savedPlanRow.plan_data);
        savedFlatBatches = parsed.flatBatches || [];
        savedFlatProductBatches = parsed.flatProductBatches || [];
        isPlanSet = true;
      } catch (e) {
        console.error("Failed to parse saved plan_data", e);
      }
    }

    // どのバッチの計量がすべて完了（実行済み）したかのリストを取得
    const usages = await db.all(`SELECT DISTINCT batch_id FROM ingredient_usages WHERE target_date = ? AND store_id = ?`, [date, storeId]);
    const executedBatchIds = usages.map((e: any) => e.batch_id);

    // バッチごとのミキシング実行時刻を取得
    const mixingExecutions = await db.all(`SELECT batch_id, executed_at FROM batch_executions WHERE target_date = ? AND store_id = ?`, [date, storeId]);
    const mixingExecutionTimes: Record<string, string> = {};
    mixingExecutions.forEach((e: any) => {
      mixingExecutionTimes[e.batch_id] = e.executed_at;
    });

    // ==========================================
    // A. ベース生地のミキシング計画 (productionPlan)
    // ==========================================
    const doughRequirements: Record<string, {
      doughCode: string;
      doughName: string;
      totalAmountGrams: number;
    }> = {};

    const subDoughRequirements: Record<string, {
      doughCode: string;
      doughName: string;
      totalAmountGrams: number;
      baseDoughId: string;
      baseDoughName: string;
      baseDoughAmount: number;
      ingredients: any[];
    }> = {};

    for (const product of orderedProducts) {
      const doughsForProduct = await db.all(`
        SELECT dough_code, dough_name, dough_amount
        FROM product_doughs
        WHERE product_code = ?
      `, [product.product_code]);

      for (const pd of doughsForProduct) {
        const subDough = await db.get('SELECT * FROM sub_doughs WHERE dough_id = ?', [pd.dough_code]);
        
        if (subDough) {
          const subIngs = await db.all('SELECT * FROM sub_dough_ingredients WHERE dough_id = ?', [pd.dough_code]);
            subIngs.sort((a, b) => {
              if (a.ingredient_name === '水' && b.ingredient_name !== '水') return 1;
              if (a.ingredient_name !== '水' && b.ingredient_name === '水') return -1;
              return (b.ingredient_amount || 0) - (a.ingredient_amount || 0);
            });
          
          if (!subDoughRequirements[pd.dough_code]) {
            subDoughRequirements[pd.dough_code] = {
              doughCode: pd.dough_code,
              doughName: pd.dough_name,
              totalAmountGrams: 0,
              baseDoughId: subDough.base_dough_id,
              baseDoughName: subDough.base_dough_name,
              baseDoughAmount: subDough.base_dough_amount,
              ingredients: subIngs
            };
          }
          const requiredSubDoughGrams = pd.dough_amount * product.total_quantity;
          subDoughRequirements[pd.dough_code].totalAmountGrams += requiredSubDoughGrams;
          
          // ベース生地も必要な標準生地として加算
          if (!doughRequirements[subDough.base_dough_id]) {
            doughRequirements[subDough.base_dough_id] = {
              doughCode: subDough.base_dough_id,
              doughName: subDough.base_dough_name,
              totalAmountGrams: 0,
            };
          }
          
          const recipeTotalGrams = subDough.base_dough_amount + subIngs.reduce((sum, ing) => sum + ing.ingredient_amount, 0);
          const multiplier = requiredSubDoughGrams / recipeTotalGrams;
          const requiredBaseGrams = subDough.base_dough_amount * multiplier;
          
          doughRequirements[subDough.base_dough_id].totalAmountGrams += requiredBaseGrams;
          
        } else {
          if (!doughRequirements[pd.dough_code]) {
            doughRequirements[pd.dough_code] = {
              doughCode: pd.dough_code,
              doughName: pd.dough_name,
              totalAmountGrams: 0,
            };
          }
          doughRequirements[pd.dough_code].totalAmountGrams += (pd.dough_amount * product.total_quantity);
        }
      }
    }

    const productionPlan = [];

    for (const doughCode in subDoughRequirements) {
      const req = subDoughRequirements[doughCode];
      const totalAmountToMix = req.totalAmountGrams;
      
      const recipeTotalGrams = req.baseDoughAmount + req.ingredients.reduce((sum: number, item: any) => sum + item.ingredient_amount, 0);
      const totalBakersPercent = req.ingredients.reduce((sum: number, item: any) => sum + ((item.ingredient_amount / req.baseDoughAmount) * 100), 0);
      const flourBakersPercent = 100;
      
      const totalFlourWeightGrams = totalAmountToMix * (req.baseDoughAmount / recipeTotalGrams);
      const NumberOfBatches = Math.ceil(totalAmountToMix / MIXER_LIMIT_G);
      const batches = [];
      let remainingMass = totalAmountToMix;

      for (let i = 0; i < NumberOfBatches; i++) {
        const batchWeight = Math.min(remainingMass, MIXER_LIMIT_G);
        remainingMass -= batchWeight;
        const multiplier = batchWeight / recipeTotalGrams;
        const batchFlourWeight = req.baseDoughAmount * multiplier;

        const ingredients = req.ingredients.map(ing => {
          return {
            ingredientCode: ing.ingredient_code,
            ingredientName: ing.ingredient_name,
            bakersPercent: (ing.ingredient_amount / req.baseDoughAmount) * 100,
            requiredWeightGrams: Math.round(ing.ingredient_amount * multiplier * 10) / 10
          };
        });

        batches.push({
          batchNumber: i + 1,
          batchFlourWeightGrams: Math.round(batchFlourWeight * 10) / 10,
          batchTotalWeightGrams: Math.round(batchWeight * 10) / 10,
          ingredients: ingredients
        });
      }

      productionPlan.push({
        doughCode: req.doughCode,
        doughName: req.doughName,
        isSubDough: true,
        baseDoughId: req.baseDoughId,
        baseDoughName: req.baseDoughName,
        totalRequiredGrams: Math.round(totalAmountToMix * 10) / 10,
        totalFlourWeightGrams: Math.round(totalFlourWeightGrams * 10) / 10,
        totalBakersPercent: totalBakersPercent,
        batches: batches
      });
    }

    for (const doughCode in doughRequirements) {
      const req = doughRequirements[doughCode];
      const totalAmountToMix = req.totalAmountGrams;
      
      const recipeIngredients = await db.all(`
        SELECT d.ingredient_code, d.ingredient_name, d.bakers_percent
        FROM doughs d
        WHERE d.dough_id = ?
      `, [doughCode]);
        recipeIngredients.sort((a, b) => {
          if (a.ingredient_name === '水' && b.ingredient_name !== '水') return 1;
          if (a.ingredient_name !== '水' && b.ingredient_name === '水') return -1;
          return (b.bakers_percent || 0) - (a.bakers_percent || 0);
        });

      if (recipeIngredients.length === 0) continue; 
      
      const latestDoughName = recipeIngredients[0].dough_name || req.doughName;

      const totalBakersPercent = recipeIngredients.reduce((sum, item) => sum + item.bakers_percent, 0);
      
      // 粉の割合を計算（名前から推測するか、暗黙的に100%とする。今回は仕様に合わせて100とする）
      const flourBakersPercent = 100;
      const totalFlourWeightGrams = totalAmountToMix * (flourBakersPercent / totalBakersPercent);

      // 50kg制限に基づいて分割（バッチ数）
      const NumberOfBatches = Math.ceil(totalAmountToMix / MIXER_LIMIT_G);
      const batches = [];
      let remainingMass = totalAmountToMix;

      for (let i = 0; i < NumberOfBatches; i++) {
        // このバッチの総重量（最大50kg）
        const batchWeight = Math.min(remainingMass, MIXER_LIMIT_G);
        remainingMass -= batchWeight;

        // このバッチの粉の重量
        const batchFlourWeight = batchWeight * (flourBakersPercent / totalBakersPercent);

        const ingredients = recipeIngredients.map(ing => {
          const requiredWeight = batchWeight * (ing.bakers_percent / totalBakersPercent);
          return {
            ingredientCode: ing.ingredient_code,
            ingredientName: ing.ingredient_name,
            bakersPercent: ing.bakers_percent,
            requiredWeightGrams: Math.round(requiredWeight * 10) / 10
          };
        });

        batches.push({
          batchNumber: i + 1,
          batchFlourWeightGrams: Math.round(batchFlourWeight * 10) / 10,
          batchTotalWeightGrams: Math.round(batchWeight * 10) / 10,
          ingredients: ingredients
        });
      }

      productionPlan.push({
        doughCode: req.doughCode,
        doughName: latestDoughName,
        totalRequiredGrams: Math.round(totalAmountToMix * 10) / 10,
        totalFlourWeightGrams: Math.round(totalFlourWeightGrams * 10) / 10,
        totalBakersPercent: totalBakersPercent,
        batches: batches
      });
    }

    // ==========================================
    // B. 副材料ミキシング計画 (productMixingPlan)
    // ==========================================
    const productMixingPlan = [];

    for (const product of orderedProducts) {
      const productIngredients = await db.all(`
        SELECT ingredient_code, ingredient_name, ingredient_amount
        FROM product_ingredients
        WHERE product_code = ?
      `, [product.product_code]);

      const doughsForProduct = await db.all(`
        SELECT dough_code, dough_name, dough_amount
        FROM product_doughs
        WHERE product_code = ?
      `, [product.product_code]);

      if (productIngredients.length === 0 && doughsForProduct.length === 0) continue;

      // 最新の生地名称をマスターから確実に取得して連結
      const latestDoughNames = [];
      for (const d of doughsForProduct) {
        let masterDough = await db.get('SELECT dough_name FROM doughs WHERE dough_id = ? LIMIT 1', [d.dough_code]);
        if (!masterDough) {
          masterDough = await db.get('SELECT dough_name FROM sub_doughs WHERE dough_id = ? LIMIT 1', [d.dough_code]);
        }
        latestDoughNames.push(masterDough ? masterDough.dough_name : d.dough_name);
      }
      
      const totalDoughAmountPerItem = doughsForProduct.reduce((sum, d) => sum + d.dough_amount, 0);
      const combinedDoughName = latestDoughNames.join(' + ') || '生地なし';
      const combinedDoughCode = doughsForProduct.map(d => d.dough_code).join('+') || '';
      
      const totalSubIngredientsAmountPerItem = productIngredients.reduce((sum, ing) => sum + ing.ingredient_amount, 0);

      const totalQty = product.total_quantity;
      
      // 【現場からのご要望: 1回分50kg制限】
      // 生地1個分の重量 ＋ 副材料1個分の合計重量
      const weightPerItem = totalDoughAmountPerItem + totalSubIngredientsAmountPerItem;
      
      // 50kg(50,000g) を 1個あたりの総重量で割って、1バッチに収まる最大個数を算出
      let maxBatchesQty = Math.floor(MIXER_LIMIT_G / weightPerItem);
      // 万が一1個で50kgを超える異常値の場合は、最低1個は作れるようにする
      if (maxBatchesQty < 1) {
        maxBatchesQty = 1;
      }

      const numBatches = Math.ceil(totalQty / maxBatchesQty);
      const productBatches = [];

      let remainingQty = totalQty;

      const doughDetails = doughsForProduct.map(d => ({
        doughCode: d.dough_code,
        amountPerItem: d.dough_amount
      }));

      for (let i = 0; i < numBatches; i++) {
        const batchQty = Math.min(remainingQty, maxBatchesQty);
        remainingQty -= batchQty;

        const batchIngredients = productIngredients.map(ing => ({
          ingredientCode: ing.ingredient_code,
          ingredientName: ing.ingredient_name,
          requiredWeightGrams: Math.round(ing.ingredient_amount * batchQty * 10) / 10
        }));

        productBatches.push({
          batchNumber: i + 1,
          batchQuantity: batchQty, // (max = maxBatchesQty)
          doughCode: combinedDoughCode,
          doughName: combinedDoughName,
          totalDoughWeightGrams: Math.round(totalDoughAmountPerItem * batchQty * 10) / 10,
          ingredients: batchIngredients,
          doughDetails: doughDetails
        });
      }

      productMixingPlan.push({
        productCode: product.product_code,
        productName: product.product_name,
        totalQuantity: totalQty,
        batches: productBatches
      });
    }

    return NextResponse.json({
      success: true,
      date: date,
      isSet: isPlanSet,
      mixers: mixers,
      productionPlan: isPlanSet ? [] : productionPlan, // Set済みなら空配列を返す（クライアント側で不要なパースを省くため）
      productMixingPlan: isPlanSet ? [] : productMixingPlan,
      savedFlatBatches: savedFlatBatches,
      savedFlatProductBatches: savedFlatProductBatches,
      executedBatchIds: executedBatchIds,
      mixingExecutionTimes: mixingExecutionTimes
    });

  } catch (error) {
    console.error('Error generating production plan:', error);
    return NextResponse.json({ error: '仕込み表の生成に失敗しました' }, { status: 500 });
  }
}
