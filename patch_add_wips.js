const fs = require('fs');

const routePath = 'src/app/api/production/additional-batch/route.ts';
let c = fs.readFileSync(routePath, 'utf8');

const targetStr = `    return NextResponse.json({
      success: true,
      additionalDoughBatches: generatedDoughBatches,
      additionalProductBatches: generatedProductBatches
    });`;

const replacement = `
    // WIP batches calculation
    const generatedWipBatches = [];
    const wipsInDb = await db.all('SELECT wip_code, wip_name FROM wips WHERE tenant_id = ?', [user.tenant_id]);
    const wipCodes = new Set(wipsInDb.map((w: any) => w.wip_code));
    const wipRequirements: Record<string, any> = {};

    for (const pBatch of generatedProductBatches) {
      for (const ing of pBatch.baseIngredients) {
        if (wipCodes.has(ing.ingredientCode)) {
          if (!wipRequirements[ing.ingredientCode]) {
            wipRequirements[ing.ingredientCode] = {
              wipCode: ing.ingredientCode,
              wipName: ing.ingredientName,
              totalRequiredGrams: 0
            };
          }
          wipRequirements[ing.ingredientCode].totalRequiredGrams += ing.requiredWeightGrams;
        }
      }
    }

    for (const wipCode in wipRequirements) {
      const req = wipRequirements[wipCode];
      const wipIngs = await db.all(\`
        SELECT ingredient_code, ingredient_name, ingredient_amount 
        FROM wip_ingredients
        WHERE wip_code = ? AND tenant_id = ?
      \`, [wipCode, user.tenant_id]);

      const wBatchesCount = Math.ceil(req.totalRequiredGrams / MIXER_LIMIT_G) || 1;
      const weightPerBatch = req.totalRequiredGrams / wBatchesCount;

      for (let i = 0; i < wBatchesCount; i++) {
        const batchIngredients = wipIngs.map((wIng: any) => {
          return {
            ingredientCode: wIng.ingredient_code,
            ingredientName: wIng.ingredient_name,
            requiredWeightGrams: Math.round(weightPerBatch * wIng.ingredient_amount * 100) / 100
          };
        });

        generatedWipBatches.push({
          id: \`wip-\${req.wipCode}-add-\${Date.now()}-\${i}\`,
          type: 'wip',
          wipCode: req.wipCode,
          wipName: req.wipName,
          batchNumber: i + 1,
          currentTotalWeightGrams: Math.round(weightPerBatch * 100) / 100,
          originalTotalWeightGrams: Math.round(weightPerBatch * 100) / 100,
          baseIngredients: batchIngredients,
          isAdditional: true,
          isRemake: reason === 'remake'
        });
      }
    }

    return NextResponse.json({
      success: true,
      additionalDoughBatches: generatedDoughBatches,
      additionalProductBatches: generatedProductBatches,
      additionalWipBatches: generatedWipBatches
    });`;

c = c.replace(targetStr, replacement);
fs.writeFileSync(routePath, c);
console.log('Successfully patched additional-batch/route.ts for WIPs');
