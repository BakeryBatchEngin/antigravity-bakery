import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { dates } = await request.json();

    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return NextResponse.json({ error: '日付が指定されていません' }, { status: 400 });
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
        storeId = allowedStoreIds[0];
      }
    } else {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    if (!storeId) {
      return NextResponse.json({ error: '店舗が選択されていません' }, { status: 400 });
    }

    // 指定された複数日付のオーダーを合計
    const placeholders = dates.map(() => '?').join(',');
    const orderedProductsRaw = await db.all(`
      SELECT product_code, MAX(product_name) as order_product_name, SUM(quantity) as total_quantity
      FROM orders
      WHERE store_id = ? AND order_date IN (${placeholders}) AND product_code IS NOT NULL AND product_code != ''
      GROUP BY product_code
    `, [storeId, ...dates]);

    if (orderedProductsRaw.length === 0) {
      return NextResponse.json({ ingredients: [] });
    }

    // 最新のマスタ商品名を取得
    const masterProductNames = await db.all(`
      SELECT product_code, MAX(product_name) as master_product_name
      FROM (
        SELECT product_code, product_name FROM product_doughs WHERE tenant_id = ?
        UNION ALL
        SELECT product_code, product_name FROM product_ingredients WHERE tenant_id = ?
      )
      GROUP BY product_code
    `, [user.tenant_id, user.tenant_id]);
    const masterNameMap: Record<string, string> = {};
    masterProductNames.forEach((row: any) => {
      masterNameMap[row.product_code] = row.master_product_name;
    });

    const orderedProducts = orderedProductsRaw.map((p: any) => ({
      product_code: p.product_code,
      product_name: masterNameMap[p.product_code] || p.order_product_name,
      total_quantity: p.total_quantity
    }));

    // 結果集計用のオブジェクト { ingredient_code: { code, name, totalGrams } }
    const aggregatedIngredients: Record<string, { code: string; name: string; totalGrams: number }> = {};

    const addIngredient = (code: string, name: string, grams: number) => {
      if (!aggregatedIngredients[code]) {
        aggregatedIngredients[code] = { code, name, totalGrams: 0 };
      }
      aggregatedIngredients[code].totalGrams += grams;
    };

    // 生地からの必要量計算
    const doughRequirements: Record<string, { totalAmountGrams: number }> = {};
    const subDoughRequirements: Record<string, {
      totalAmountGrams: number;
      baseDoughId: string;
      baseDoughAmount: number;
      ingredients: any[];
    }> = {};

    for (const product of orderedProducts) {
      // 副材料の計算 (product_ingredients)
      const productIngredients = await db.all(`
        SELECT ingredient_code, ingredient_name, ingredient_amount
        FROM product_ingredients
        WHERE product_code = ? AND tenant_id = ?
      `, [product.product_code, user.tenant_id]);
      
      for (const ing of productIngredients) {
        addIngredient(ing.ingredient_code, ing.ingredient_name, ing.ingredient_amount * product.total_quantity);
      }

      // 生地の計算 (product_doughs)
      const doughsForProduct = await db.all(`
        SELECT dough_code, dough_name, dough_amount
        FROM product_doughs
        WHERE product_code = ? AND tenant_id = ?
      `, [product.product_code, user.tenant_id]);

      for (const pd of doughsForProduct) {
        const subDough = await db.get('SELECT * FROM sub_doughs WHERE dough_id = ? AND tenant_id = ?', [pd.dough_code, user.tenant_id]);
        
        if (subDough) {
          const subIngs = await db.all('SELECT * FROM sub_dough_ingredients WHERE dough_id = ? AND tenant_id = ?', [pd.dough_code, user.tenant_id]);
          
          if (!subDoughRequirements[pd.dough_code]) {
            subDoughRequirements[pd.dough_code] = {
              totalAmountGrams: 0,
              baseDoughId: subDough.base_dough_id,
              baseDoughAmount: subDough.base_dough_amount,
              ingredients: subIngs
            };
          }
          const requiredSubDoughGrams = pd.dough_amount * product.total_quantity;
          subDoughRequirements[pd.dough_code].totalAmountGrams += requiredSubDoughGrams;
          
          if (!doughRequirements[subDough.base_dough_id]) {
            doughRequirements[subDough.base_dough_id] = { totalAmountGrams: 0 };
          }
          
          const recipeTotalGrams = subDough.base_dough_amount + subIngs.reduce((sum: number, ing: any) => sum + ing.ingredient_amount, 0);
          const multiplier = requiredSubDoughGrams / recipeTotalGrams;
          const requiredBaseGrams = subDough.base_dough_amount * multiplier;
          
          doughRequirements[subDough.base_dough_id].totalAmountGrams += requiredBaseGrams;
        } else {
          if (!doughRequirements[pd.dough_code]) {
            doughRequirements[pd.dough_code] = { totalAmountGrams: 0 };
          }
          doughRequirements[pd.dough_code].totalAmountGrams += (pd.dough_amount * product.total_quantity);
        }
      }
    }

    // サブ生地(sub_doughs)の材料展開
    for (const doughCode in subDoughRequirements) {
      const req = subDoughRequirements[doughCode];
      const totalAmountToMix = req.totalAmountGrams;
      const recipeTotalGrams = req.baseDoughAmount + req.ingredients.reduce((sum: number, item: any) => sum + item.ingredient_amount, 0);
      const multiplier = totalAmountToMix / recipeTotalGrams;

      for (const ing of req.ingredients) {
        addIngredient(ing.ingredient_code, ing.ingredient_name, ing.ingredient_amount * multiplier);
      }
    }

    // 標準生地(doughs)の材料展開
    for (const doughCode in doughRequirements) {
      const req = doughRequirements[doughCode];
      const totalAmountToMix = req.totalAmountGrams;
      
      const recipeIngredients = await db.all(`
        SELECT d.ingredient_code, d.ingredient_name, d.bakers_percent
        FROM doughs d
        WHERE d.dough_id = ? AND d.tenant_id = ?
      `, [doughCode, user.tenant_id]);

      if (recipeIngredients.length === 0) continue; 
      
      const totalBakersPercent = recipeIngredients.reduce((sum: number, item: any) => sum + item.bakers_percent, 0);
      
      for (const ing of recipeIngredients) {
        const requiredWeight = totalAmountToMix * (ing.bakers_percent / totalBakersPercent);
        addIngredient(ing.ingredient_code, ing.ingredient_name, requiredWeight);
      }
    }

    // フォーマットして配列に変換
    const ingredientsResult = Object.values(aggregatedIngredients)
      .filter(item => item.totalGrams > 0)
      .sort((a, b) => b.totalGrams - a.totalGrams); // 重量の多い順

    return NextResponse.json({
      success: true,
      ingredients: ingredientsResult
    });

  } catch (error) {
    console.error('Error generating forecast:', error);
    return NextResponse.json({ error: '予測の計算に失敗しました' }, { status: 500 });
  }
}
