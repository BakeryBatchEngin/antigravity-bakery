import os

with open('src/app/api/production/additional-batch/route.ts', 'r', encoding='utf-8') as f:
    c = f.read()

target = """    for (const pd of doughsForProduct) {
      const totalAmountToMix = pd.dough_amount * quantity;

      const recipeIngredients = await db.all(`
        SELECT d.ingredient_code, d.ingredient_name, d.bakers_percent, d.dough_name
        FROM doughs d
        WHERE d.dough_id = ?
      `, [pd.dough_code]);

      if (recipeIngredients.length === 0) continue; 
      
      const latestDoughName = recipeIngredients[0].dough_name || pd.dough_name;
      const totalBakersPercent = recipeIngredients.reduce((sum: number, item: any) => sum + item.bakers_percent, 0);
      const flourBakersPercent = 100;
      
      const NumberOfBatches = Math.ceil(totalAmountToMix / MIXER_LIMIT_G);
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
            requiredWeightGrams: Math.round(requiredWeight * 10) / 10
          };
        });

        generatedDoughBatches.push({
          id: `ADD-D-${timestamp}-${doughBatchIndex++}`,
          doughCode: pd.dough_code,
          doughName: latestDoughName,
          totalBakersPercent: totalBakersPercent,
          batchNumber: i + 1,
          currentFlourWeightGrams: Math.round(batchFlourWeight * 10) / 10,
          baseIngredients: ingredients,
          isAdditional: true,
          isRemake: reason === 'remake'
        });
      }
    }"""

new = """    for (const pd of doughsForProduct) {
      const totalAmountToMix = pd.dough_amount * quantity;

      const subDough = await db.get('SELECT * FROM sub_doughs WHERE dough_id = ?', [pd.dough_code]);
      
      if (subDough) {
        // サブ生地のバッチ生成
        const subIngs = await db.all('SELECT * FROM sub_dough_ingredients WHERE dough_id = ?', [pd.dough_code]);
        const recipeTotalGrams = subDough.base_dough_amount + subIngs.reduce((sum: number, item: any) => sum + item.ingredient_amount, 0);
        const totalBakersPercent = subIngs.reduce((sum: number, item: any) => sum + ((item.ingredient_amount / subDough.base_dough_amount) * 100), 0) + 100;
        
        const NumberOfBatches = Math.ceil(totalAmountToMix / MIXER_LIMIT_G);
        let remainingMass = totalAmountToMix;

        for (let i = 0; i < NumberOfBatches; i++) {
          const batchWeight = Math.min(remainingMass, MIXER_LIMIT_G);
          remainingMass -= batchWeight;
          const multiplier = batchWeight / recipeTotalGrams;
          const batchFlourWeight = subDough.base_dough_amount * multiplier;

          const ingredients = subIngs.map((ing: any) => {
            return {
              ingredientCode: ing.ingredient_code,
              ingredientName: ing.ingredient_name,
              bakersPercent: (ing.ingredient_amount / subDough.base_dough_amount) * 100,
              requiredWeightGrams: Math.round(ing.ingredient_amount * multiplier * 10) / 10
            };
          });

          generatedDoughBatches.push({
            id: `ADD-D-${timestamp}-${doughBatchIndex++}`,
            doughCode: pd.dough_code,
            doughName: subDough.dough_name,
            isSubDough: true,
            baseDoughName: subDough.base_dough_name,
            totalBakersPercent: totalBakersPercent,
            batchNumber: i + 1,
            currentFlourWeightGrams: Math.round(batchFlourWeight * 10) / 10,
            baseIngredients: ingredients,
            isAdditional: true,
            isRemake: reason === 'remake'
          });
        }
        
        // ベース生地も必要な標準生地として生成
        const baseRequiredGrams = subDough.base_dough_amount * (totalAmountToMix / recipeTotalGrams);
        const recipeIngredients = await db.all(`
          SELECT d.ingredient_code, d.ingredient_name, d.bakers_percent, d.dough_name
          FROM doughs d
          WHERE d.dough_id = ?
        `, [subDough.base_dough_id]);

        if (recipeIngredients.length > 0) {
          const baseLatestName = recipeIngredients[0].dough_name || subDough.base_dough_name;
          const baseTotalBakersPercent = recipeIngredients.reduce((sum: number, item: any) => sum + item.bakers_percent, 0);
          
          const baseBatchesNum = Math.ceil(baseRequiredGrams / MIXER_LIMIT_G);
          let baseRemainingMass = baseRequiredGrams;
          
          for (let i = 0; i < baseBatchesNum; i++) {
            const baseBatchWeight = Math.min(baseRemainingMass, MIXER_LIMIT_G);
            baseRemainingMass -= baseBatchWeight;
            const baseBatchFlourWeight = baseBatchWeight * (100 / baseTotalBakersPercent);

            const baseIngredients = recipeIngredients.map((ing: any) => {
              const requiredWeight = baseBatchWeight * (ing.bakers_percent / baseTotalBakersPercent);
              return {
                ingredientCode: ing.ingredient_code,
                ingredientName: ing.ingredient_name,
                bakersPercent: ing.bakers_percent,
                requiredWeightGrams: Math.round(requiredWeight * 10) / 10
              };
            });

            generatedDoughBatches.push({
              id: `ADD-D-${timestamp}-${doughBatchIndex++}`,
              doughCode: subDough.base_dough_id,
              doughName: baseLatestName,
              totalBakersPercent: baseTotalBakersPercent,
              batchNumber: i + 1,
              currentFlourWeightGrams: Math.round(baseBatchFlourWeight * 10) / 10,
              baseIngredients: baseIngredients,
              isAdditional: true,
              isRemake: reason === 'remake'
            });
          }
        }
        
      } else {
        // 標準生地の場合
        const recipeIngredients = await db.all(`
          SELECT d.ingredient_code, d.ingredient_name, d.bakers_percent, d.dough_name
          FROM doughs d
          WHERE d.dough_id = ?
        `, [pd.dough_code]);

        if (recipeIngredients.length === 0) continue; 
        
        const latestDoughName = recipeIngredients[0].dough_name || pd.dough_name;
        const totalBakersPercent = recipeIngredients.reduce((sum: number, item: any) => sum + item.bakers_percent, 0);
        const flourBakersPercent = 100;
        
        const NumberOfBatches = Math.ceil(totalAmountToMix / MIXER_LIMIT_G);
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
              requiredWeightGrams: Math.round(requiredWeight * 10) / 10
            };
          });

          generatedDoughBatches.push({
            id: `ADD-D-${timestamp}-${doughBatchIndex++}`,
            doughCode: pd.dough_code,
            doughName: latestDoughName,
            totalBakersPercent: totalBakersPercent,
            batchNumber: i + 1,
            currentFlourWeightGrams: Math.round(batchFlourWeight * 10) / 10,
            baseIngredients: ingredients,
            isAdditional: true,
            isRemake: reason === 'remake'
          });
        }
      }
    }"""

c = c.replace(target, new)

with open('src/app/api/production/additional-batch/route.ts', 'w', encoding='utf-8') as f:
    f.write(c)

print("Updated additional-batch logic")
