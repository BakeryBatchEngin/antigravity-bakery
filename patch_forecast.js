const fs = require('fs');
const path = 'src/app/api/forecast/route.ts';
let content = fs.readFileSync(path, 'utf8');

const targetStr = `    // 結果集計用のオブジェクト { ingredient_code: { code, name, totalGrams } }
    const aggregatedIngredients: Record<string, { code: string; name: string; totalGrams: number }> = {};

    const addIngredient = (code: string, name: string, grams: number) => {
      if (!aggregatedIngredients[code]) {
        aggregatedIngredients[code] = { code, name, totalGrams: 0 };
      }
      aggregatedIngredients[code].totalGrams += grams;
    };`;

const replaceStr = `    // --- WIP (仕掛品) のデータを取得 ---
    const wipsInDb = await db.all('SELECT wip_code FROM wips WHERE tenant_id = ?', [user.tenant_id]);
    const wipCodes = new Set(wipsInDb.map((w: any) => w.wip_code));

    const wipIngredientsRaw = await db.all('SELECT wip_code, ingredient_code, ingredient_name, ingredient_amount FROM wip_ingredients WHERE tenant_id = ?', [user.tenant_id]);
    const wipIngredientsMap: Record<string, { code: string; name: string; amount: number }[]> = {};
    wipIngredientsRaw.forEach((row: any) => {
      if (!wipIngredientsMap[row.wip_code]) {
        wipIngredientsMap[row.wip_code] = [];
      }
      wipIngredientsMap[row.wip_code].push({
        code: row.ingredient_code,
        name: row.ingredient_name,
        amount: row.ingredient_amount
      });
    });

    // 結果集計用のオブジェクト { ingredient_code: { code, name, totalGrams } }
    const aggregatedIngredients: Record<string, { code: string; name: string; totalGrams: number }> = {};

    const addIngredient = (code: string, name: string, grams: number) => {
      if (wipCodes.has(code)) {
        // 仕掛品の場合は原材料に分解して加算
        const recipe = wipIngredientsMap[code];
        if (recipe && recipe.length > 0) {
          const totalRecipeGrams = recipe.reduce((sum, ing) => sum + ing.amount, 0);
          if (totalRecipeGrams > 0) {
            const multiplier = grams / totalRecipeGrams;
            for (const ing of recipe) {
              // 再帰的に加算（仕掛品の中に仕掛品がある場合も対応可能）
              addIngredient(ing.code, ing.name, ing.amount * multiplier);
            }
          }
        }
      } else {
        // 通常の原材料の場合はそのまま加算
        if (!aggregatedIngredients[code]) {
          aggregatedIngredients[code] = { code, name, totalGrams: 0 };
        }
        aggregatedIngredients[code].totalGrams += grams;
      }
    };`;

content = content.replace(targetStr, replaceStr);
fs.writeFileSync(path, content, 'utf8');
console.log("Patched forecast logic!");
