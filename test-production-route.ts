import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const { getDb } = require('./src/lib/db');

async function testProductionRoute() {
  const date = '2026-03-31';
  try {
    const db = await getDb();

    console.log("Fetching mixers...");
    const mixers = await db.all('SELECT * FROM mixer_capacities ORDER BY max_capacity_kg DESC');
    console.log("-> Mixers:", mixers);
    const defaultMixer = mixers.length > 0 ? mixers[0] : null;
    const MIXER_LIMIT_G = defaultMixer ? defaultMixer.max_capacity_kg * 1000 : 50000;

    console.log("Fetching ordered products...");
    const orderedProducts = await db.all(`
      SELECT product_code, product_name, SUM(quantity) as total_quantity
      FROM orders
      WHERE order_date = ? AND product_code IS NOT NULL AND product_code != ''
      GROUP BY product_code, product_name
    `, [date]);

    if (orderedProducts.length === 0) {
      console.log('その日の注文データはありません');
      process.exit(0);
    }

    console.log("Fetching saved plan...");
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

    console.log("Fetching executions...");
    const executions = await db.all(`SELECT DISTINCT batch_id FROM ingredient_usages WHERE target_date = ?`, [date]);
    const executedBatchIds = executions.map((e: any) => e.batch_id);

    console.log("Building doughRequirements...");
    const doughRequirements: any = {};

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
        doughRequirements[pd.dough_code].totalAmountGrams += (pd.dough_amount * product.total_quantity);
      }
    }
    console.log("-> doughRequirements:", doughRequirements);

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

      const totalBakersPercent = recipeIngredients.reduce((sum: number, item: any) => sum + item.bakers_percent, 0);
      
      const flourBakersPercent = 100;
      const totalFlourWeightGrams = totalAmountToMix * (flourBakersPercent / totalBakersPercent);

      const NumberOfBatches = Math.ceil(totalAmountToMix / MIXER_LIMIT_G);
      const batches = [];
      let remainingMass = totalAmountToMix;

      for (let i = 0; i < NumberOfBatches; i++) {
        const batchWeight = Math.min(remainingMass, MIXER_LIMIT_G);
        remainingMass -= batchWeight;

        const batchFlourWeight = batchWeight * (flourBakersPercent / totalBakersPercent);

        const ingredients = recipeIngredients.map((ing: any) => {
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

    console.log("Building productMixingPlan...");
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

      const totalDoughAmountPerItem = doughsForProduct.reduce((sum: number, d: any) => sum + d.dough_amount, 0);
      const combinedDoughName = doughsForProduct.map((d: any) => d.dough_name).join(' + ') || '生地なし';
      const combinedDoughCode = doughsForProduct.map((d: any) => d.dough_code).join('+') || '';
      
      const totalSubIngredientsAmountPerItem = productIngredients.reduce((sum: number, ing: any) => sum + ing.ingredient_amount, 0);

      const totalQty = product.total_quantity;
      const weightPerItem = totalDoughAmountPerItem + totalSubIngredientsAmountPerItem;
      
      let maxBatchesQty = Math.floor(MIXER_LIMIT_G / weightPerItem);
      if (maxBatchesQty < 1) {
        maxBatchesQty = 1;
      }

      const numBatches = Math.ceil(totalQty / maxBatchesQty);
      const productBatches = [];

      let remainingQty = totalQty;

      const doughDetails = doughsForProduct.map((d: any) => ({
        doughCode: d.dough_code,
        amountPerItem: d.dough_amount
      }));

      for (let i = 0; i < numBatches; i++) {
        const batchQty = Math.min(remainingQty, maxBatchesQty);
        remainingQty -= batchQty;

        const batchIngredients = productIngredients.map((ing: any) => ({
          ingredientCode: ing.ingredient_code,
          ingredientName: ing.ingredient_name,
          requiredWeightGrams: Math.round(ing.ingredient_amount * batchQty)
        }));

        productBatches.push({
          batchNumber: i + 1,
          batchQuantity: batchQty,
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
    
    console.log("Success.");

  } catch (error) {
    console.error("Test Error:", error);
  }
  process.exit(0);
}

testProductionRoute();
