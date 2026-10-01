const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/app/api/production/route.ts');
let content = fs.readFileSync(file, 'utf-8');

const injectionCode = `
    // ==========================================
    // C. 仕掛品ミキシング計画 (wipMixingPlan)
    // ==========================================
    const wipMixingPlan: any[] = [];
    const wipRequirements: Record<string, any> = {};

    // 1. 全ての生産計画（生地・商品）から、使用される仕掛品を抽出
    const allIngredientsList: any[] = [];
    productionPlan.forEach(plan => {
      plan.batches.forEach(batch => {
        if (batch.ingredients) {
          allIngredientsList.push(...batch.ingredients);
        }
      });
    });
    productMixingPlan.forEach(plan => {
      plan.batches.forEach(batch => {
        if (batch.ingredients) {
          allIngredientsList.push(...batch.ingredients);
        }
      });
    });

    // 2. 材料のうち、wipsテーブルに存在するものを仕掛品として集計
    // 大量のクエリを避けるため、一括で仕掛品一覧を取得
    const wipsInDb = await db.all('SELECT wip_code, wip_name FROM wips WHERE tenant_id = ?', [user.tenant_id]);
    const wipCodes = new Set(wipsInDb.map(w => w.wip_code));

    allIngredientsList.forEach(ing => {
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
    });

    // 3. 各仕掛品についてバッチ分割と構成材料の計算
    for (const wipCode in wipRequirements) {
      const req = wipRequirements[wipCode];
      
      const recipeIngredients = await db.all(\`
        SELECT ingredient_code, ingredient_name, ingredient_amount
        FROM wip_ingredients
        WHERE wip_code = ? AND tenant_id = ?
      \`, [wipCode, user.tenant_id]);

      if (recipeIngredients.length === 0) continue;

      const totalRecipeGrams = recipeIngredients.reduce((sum, ing) => sum + ing.ingredient_amount, 0);
      if (totalRecipeGrams === 0) continue;

      const numBatches = Math.ceil(req.totalRequiredGrams / MIXER_LIMIT_G);
      const wipBatches = [];
      let remainingWeight = req.totalRequiredGrams;

      for (let i = 0; i < numBatches; i++) {
        const batchWeight = Math.min(remainingWeight, MIXER_LIMIT_G);
        remainingWeight -= batchWeight;

        // レシピの比率に基づいて各材料の必要量を計算
        const batchIngredients = recipeIngredients.map(ing => {
          const ratio = ing.ingredient_amount / totalRecipeGrams;
          return {
            ingredientCode: ing.ingredient_code,
            ingredientName: ing.ingredient_name,
            requiredWeightGrams: Math.round(batchWeight * ratio * 100) / 100
          };
        });

        wipBatches.push({
          batchNumber: i + 1,
          batchTotalWeightGrams: Math.round(batchWeight * 100) / 100,
          ingredients: batchIngredients
        });
      }

      wipMixingPlan.push({
        wipCode: req.wipCode,
        wipName: req.wipName,
        totalRequiredGrams: Math.round(req.totalRequiredGrams * 100) / 100,
        batches: wipBatches
      });
    }
`;

const returnStatementStr = 'return NextResponse.json({\n      success: true,\n      date: date,';

if (!content.includes('const wipMixingPlan: any[]')) {
    content = content.replace(returnStatementStr, injectionCode + '\n    ' + returnStatementStr);
    content = content.replace('productMixingPlan: isPlanSet ? [] : productMixingPlan,', 
        'productMixingPlan: isPlanSet ? [] : productMixingPlan,\n      wipMixingPlan: isPlanSet ? [] : wipMixingPlan,');
    fs.writeFileSync(file, content, 'utf-8');
    console.log('wipMixingPlan logic injected successfully.');
} else {
    console.log('wipMixingPlan logic already exists.');
}
