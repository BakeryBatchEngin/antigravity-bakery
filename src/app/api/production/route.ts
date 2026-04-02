import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json({ error: '日付(date)が指定されていません' }, { status: 400 });
    }

    const db = await getDb();

    const mixers = await db.all('SELECT * FROM mixer_capacities ORDER BY max_capacity_kg DESC');
    const defaultMixer = mixers.length > 0 ? mixers[0] : null;
    const MIXER_LIMIT_G = defaultMixer ? defaultMixer.max_capacity_kg * 1000 : 50000;

    const orderedProducts = await db.all(`
      SELECT product_code, product_name, SUM(quantity) as total_quantity
      FROM orders
      WHERE order_date = ? AND product_code IS NOT NULL AND product_code != ''
      GROUP BY product_code
    `, [date]);

    if (orderedProducts.length === 0) {
      return NextResponse.json({ message: 'その日の注文データはありません', productionPlan: [], productMixingPlan: [] });
    }

    // ==========================================
    // 1.5 手動で保存(Set)された計画データと実行済み状態の取得
    // ==========================================
    const savedPlanRow = await db.get(`SELECT plan_data FROM daily_production_plans WHERE target_date = ?`, [date]);
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

    // どのバッチがすでに完了（実行済み）したかのリストを取得
    const executions = await db.all(`SELECT DISTINCT batch_id FROM ingredient_usages WHERE target_date = ?`, [date]);
    const executedBatchIds = executions.map(e => e.batch_id);

    // ==========================================
    // A. ベース生地のミキシング計画 (productionPlan)
    // ==========================================
    const doughRequirements: Record<string, {
      doughCode: string;
      doughName: string;
      totalAmountGrams: number;
    }> = {};

    for (const product of orderedProducts) {
      const doughsForProduct = await db.all(`
        SELECT dough_code, dough_name, dough_amount
        FROM product_doughs
        WHERE product_code = ?
      `, [product.product_code]);

      for (const pd of doughsForProduct) {
        if (!doughRequirements[pd.dough_code]) {
          doughRequirements[pd.dough_code] = {
            doughCode: pd.dough_code,
            doughName: pd.dough_name,
            totalAmountGrams: 0,
          };
        }
        // 製品1個あたりの必要生地量 × 注文数
        doughRequirements[pd.dough_code].totalAmountGrams += (pd.dough_amount * product.total_quantity);
      }
    }

    const productionPlan = [];

    for (const doughCode in doughRequirements) {
      const req = doughRequirements[doughCode];
      const totalAmountToMix = req.totalAmountGrams;
      
      const recipeIngredients = await db.all(`
        SELECT d.ingredient_code, d.ingredient_name, d.bakers_percent
        FROM doughs d
        WHERE d.dough_id = ?
      `, [doughCode]);

      if (recipeIngredients.length === 0) continue; 

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
            requiredWeightGrams: Math.round(requiredWeight)
          };
        });

        batches.push({
          batchNumber: i + 1,
          batchFlourWeightGrams: Math.round(batchFlourWeight),
          batchTotalWeightGrams: Math.round(batchWeight),
          ingredients: ingredients
        });
      }

      productionPlan.push({
        doughCode: req.doughCode,
        doughName: req.doughName,
        totalRequiredGrams: Math.round(totalAmountToMix),
        totalFlourWeightGrams: Math.round(totalFlourWeightGrams),
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

      const totalDoughAmountPerItem = doughsForProduct.reduce((sum, d) => sum + d.dough_amount, 0);
      const combinedDoughName = doughsForProduct.map(d => d.dough_name).join(' + ') || '生地なし';
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
          requiredWeightGrams: Math.round(ing.ingredient_amount * batchQty)
        }));

        productBatches.push({
          batchNumber: i + 1,
          batchQuantity: batchQty, // (max = maxBatchesQty)
          doughCode: combinedDoughCode,
          doughName: combinedDoughName,
          totalDoughWeightGrams: Math.round(totalDoughAmountPerItem * batchQty),
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
      executedBatchIds: executedBatchIds
    });

  } catch (error) {
    console.error('Error generating production plan:', error);
    return NextResponse.json({ error: '仕込み表の生成に失敗しました' }, { status: 500 });
  }
}
