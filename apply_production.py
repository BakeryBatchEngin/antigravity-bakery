import os

with open('src/app/api/production/route.ts', 'r', encoding='utf-8') as f:
    c = f.read()

# Replace doughRequirements logic to handle sub doughs properly
dough_req_target = """    const doughRequirements: Record<string, {
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
        // 製品E個あたりの忁E生地釁E*注斁E
        doughRequirements[pd.dough_code].totalAmountGrams += (pd.dough_amount * product.total_quantity);
      }
    }"""

dough_req_new = """    const doughRequirements: Record<string, {
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
          
          const recipeTotalGrams = subDough.base_dough_amount + subIngs.reduce((sum: number, ing: any) => sum + ing.ingredient_amount, 0);
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
    }"""

c = c.replace(dough_req_target, dough_req_new)

# Add sub dough plan to productionPlan loop
prod_plan_target = """    for (const doughCode in doughRequirements) {
      const req = doughRequirements[doughCode];
      const totalAmountToMix = req.totalAmountGrams;"""

prod_plan_new = """    for (const doughCode in subDoughRequirements) {
      const req = subDoughRequirements[doughCode];
      const totalAmountToMix = req.totalAmountGrams;
      
      const recipeTotalGrams = req.baseDoughAmount + req.ingredients.reduce((sum, item) => sum + item.ingredient_amount, 0);
      const totalBakersPercent = req.ingredients.reduce((sum, item) => sum + ((item.ingredient_amount / req.baseDoughAmount) * 100), 0);
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
      const totalAmountToMix = req.totalAmountGrams;"""

c = c.replace(prod_plan_target, prod_plan_new)

with open('src/app/api/production/route.ts', 'w', encoding='utf-8') as f:
    f.write(c)

print("Updated route.ts logic")
