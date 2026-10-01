const fs = require('fs');
const path = 'src/app/api/production/additional-batch/route.ts';
let content = fs.readFileSync(path, 'utf8');

const topTarget = `    const timestamp = Date.now();
    const generatedDoughBatches = [];
    const generatedProductBatches = [];`;

const topReplace = `    const timestamp = Date.now();
    const generatedDoughBatches: any[] = [];
    const generatedProductBatches: any[] = [];
    const generatedWipBatches: any[] = [];`;

content = content.replace(topTarget, topReplace);

const bottomTarget = `    return NextResponse.json({
      success: true,
      additionalDoughBatches: generatedDoughBatches,
      additionalProductBatches: generatedProductBatches
    });`;

const wipLogic = `    // --- 仕掛品 (WIP) の計算 ---
    if (productIngredients.length > 0) {
      const wipsInDb = await db.all('SELECT wip_code, wip_name FROM wips WHERE tenant_id = ?', [user.tenant_id]);
      const wipCodes = new Set(wipsInDb.map((w: any) => w.wip_code));
      
      const wipRequirements: Record<string, { wipCode: string, wipName: string, totalRequiredGrams: number }> = {};
      for (const ing of productIngredients) {
        if (wipCodes.has(ing.ingredient_code)) {
          if (!wipRequirements[ing.ingredient_code]) {
            wipRequirements[ing.ingredient_code] = {
              wipCode: ing.ingredient_code,
              wipName: ing.ingredient_name,
              totalRequiredGrams: 0
            };
          }
          wipRequirements[ing.ingredient_code].totalRequiredGrams += (ing.ingredient_amount * quantity);
        }
      }

      let wipIndex = 1;
      for (const wipCode in wipRequirements) {
        const req = wipRequirements[wipCode];
        
        const recipeIngredients = await db.all(\`
          SELECT ingredient_code, ingredient_name, ingredient_amount
          FROM wip_ingredients
          WHERE wip_code = ? AND tenant_id = ?
        \`, [wipCode, user.tenant_id]);

        if (recipeIngredients.length > 0) {
          const totalRecipeGrams = recipeIngredients.reduce((sum: number, ing: any) => sum + ing.ingredient_amount, 0);
          if (totalRecipeGrams > 0) {
            const numBatches = Math.ceil(req.totalRequiredGrams / MIXER_LIMIT_G);
            let remainingMass = req.totalRequiredGrams;

            for (let i = 0; i < numBatches; i++) {
              const batchWeight = Math.min(remainingMass, MIXER_LIMIT_G);
              remainingMass -= batchWeight;
              const multiplier = batchWeight / totalRecipeGrams;

              const baseIngredients = recipeIngredients.map((ing: any) => ({
                ingredientCode: ing.ingredient_code,
                ingredientName: ing.ingredient_name,
                requiredWeightGrams: Math.round(ing.ingredient_amount * multiplier * 100) / 100
              }));

              generatedWipBatches.push({
                id: \`ADD-W-\${timestamp}-\${wipIndex++}\`,
                type: 'wip',
                wipCode: req.wipCode,
                wipName: req.wipName,
                batchNumber: i + 1,
                originalTotalWeightGrams: Math.round(batchWeight * 100) / 100,
                currentTotalWeightGrams: Math.round(batchWeight * 100) / 100,
                baseIngredients: baseIngredients,
                isAdditional: true,
                isRemake: reason === 'remake'
              });
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      additionalDoughBatches: generatedDoughBatches,
      additionalProductBatches: generatedProductBatches,
      additionalWipBatches: generatedWipBatches
    });`;

content = content.replace(bottomTarget, wipLogic);
fs.writeFileSync(path, content, 'utf8');
console.log("Patched additional-batch logic!");
