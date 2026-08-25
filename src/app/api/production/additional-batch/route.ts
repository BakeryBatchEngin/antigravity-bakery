import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';

const MIXER_LIMIT_G = 50000; // 50kg

export async function POST(request: Request) {
  try {
    const { productCode, quantity, reason } = await request.json();
    if (!productCode || !quantity) {
      return NextResponse.json({ error: '商品コードと個数が必要です' }, { status: 400 });
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
    
    // 該当商品の情報を取得
    const product = await db.get('SELECT product_code, product_name FROM products WHERE product_code = ?', [productCode]);
    if (!product) {
      return NextResponse.json({ error: '商品が見つかりません' }, { status: 404 });
    }

    const doughsForProduct = await db.all(`
      SELECT dough_code, dough_name, dough_amount
      FROM product_doughs
      WHERE product_code = ?
    `, [productCode]);

    const productIngredients = await db.all(`
      SELECT ingredient_code, ingredient_name, ingredient_amount
      FROM product_ingredients
      WHERE product_code = ?
    `, [productCode]);

    const timestamp = Date.now();
    const generatedDoughBatches = [];
    const generatedProductBatches = [];

    // --- 生地(Dough)の計算 ---
    let doughIndex = 1;
    for (const pd of doughsForProduct) {
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
          id: `ADD-D-${timestamp}-${doughIndex++}`,
          type: 'dough',
          doughCode: pd.dough_code,
          doughName: latestDoughName,
          totalBakersPercent: totalBakersPercent,
          batchNumber: i + 1,
          originalFlourWeightGrams: Math.round(batchFlourWeight * 10) / 10,
          originalTotalWeightGrams: Math.round(batchWeight * 10) / 10,
          currentFlourWeightGrams: Math.round(batchFlourWeight * 10) / 10,
          baseIngredients: ingredients,
          isAdditional: true,
          isRemake: reason === 'remake'
        });
      }
    }

    // --- 副材料(Product)の計算 ---
    if (productIngredients.length > 0 || doughsForProduct.length > 0) {
      const latestDoughNames = [];
      for (const d of doughsForProduct) {
        const masterDough = await db.get('SELECT dough_name FROM doughs WHERE dough_id = ? LIMIT 1', [d.dough_code]);
        latestDoughNames.push(masterDough ? masterDough.dough_name : d.dough_name);
      }
      
      const totalDoughAmountPerItem = doughsForProduct.reduce((sum: number, d: any) => sum + d.dough_amount, 0);
      const combinedDoughName = latestDoughNames.join(' + ') || '生地なし';
      const combinedDoughCode = doughsForProduct.map((d: any) => d.dough_code).join('+') || '';
      const totalSubIngredientsAmountPerItem = productIngredients.reduce((sum: number, ing: any) => sum + ing.ingredient_amount, 0);

      const weightPerItem = totalDoughAmountPerItem + totalSubIngredientsAmountPerItem;
      let maxBatchesQty = Math.floor(MIXER_LIMIT_G / weightPerItem);
      if (maxBatchesQty < 1) maxBatchesQty = 1;

      const numBatches = Math.ceil(quantity / maxBatchesQty);
      let remainingQty = quantity;
      const doughDetails = doughsForProduct.map((d: any) => ({
        doughCode: d.dough_code,
        amountPerItem: d.dough_amount
      }));

      let productBatchIndex = 1;
      for (let i = 0; i < numBatches; i++) {
        const batchQty = Math.min(remainingQty, maxBatchesQty);
        remainingQty -= batchQty;

        const batchIngredients = productIngredients.map((ing: any) => ({
          ingredientCode: ing.ingredient_code,
          ingredientName: ing.ingredient_name,
          requiredWeightGrams: Math.round(ing.ingredient_amount * batchQty * 10) / 10
        }));

        generatedProductBatches.push({
          id: `ADD-P-${timestamp}-${productBatchIndex++}`,
          type: 'product',
          productCode: product.product_code,
          productName: product.product_name,
          doughCode: combinedDoughCode,
          doughName: combinedDoughName,
          batchNumber: i + 1,
          originalBatchQuantity: batchQty,
          originalTotalDoughWeightGrams: Math.round(totalDoughAmountPerItem * batchQty * 10) / 10,
          currentBatchQuantity: batchQty,
          maxBatchQuantity: maxBatchesQty,
          doughDetails: doughDetails,
          baseIngredients: batchIngredients,
          isAdditional: true,
          isRemake: reason === 'remake'
        });
      }
    }

    return NextResponse.json({
      success: true,
      additionalDoughBatches: generatedDoughBatches,
      additionalProductBatches: generatedProductBatches
    });

  } catch (error) {
    console.error('Error generating additional batch:', error);
    return NextResponse.json({ error: '追加バッチの生成に失敗しました' }, { status: 500 });
  }
}
