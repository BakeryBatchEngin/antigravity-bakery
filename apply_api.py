import os

with open('src/app/api/admin/doughs/route.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Update GET
get_target = """    let rows;
    if (user.role === 'super_admin') {
      rows = await db.all('SELECT * FROM doughs ORDER BY dough_id ASC, ingredient_code ASC');
    } else {
      rows = await db.all(
        'SELECT * FROM doughs WHERE tenant_id = ? ORDER BY dough_id ASC, ingredient_code ASC',
        [user.tenant_id]
      );
    }

    // dough_id ごとにグループ化
    const doughsMap = new Map();
    rows.forEach((row: any) => {
      if (!doughsMap.has(row.dough_id)) {
        doughsMap.set(row.dough_id, {
          dough_id: row.dough_id,
          dough_name: row.dough_name,
          ingredients: []
        });
      }
      doughsMap.get(row.dough_id).ingredients.push({
        ingredient_code: row.ingredient_code,
        ingredient_name: row.ingredient_name,
        bakers_percent: row.bakers_percent
      });
    });

    const doughs = Array.from(doughsMap.values());"""

get_new = """    let standardRows;
    let subRows;
    let subIngRows;

    if (user.role === 'super_admin') {
      standardRows = await db.all('SELECT * FROM doughs ORDER BY dough_id ASC, ingredient_code ASC');
      subRows = await db.all('SELECT * FROM sub_doughs ORDER BY dough_id ASC');
      subIngRows = await db.all('SELECT * FROM sub_dough_ingredients ORDER BY dough_id ASC, ingredient_code ASC');
    } else {
      standardRows = await db.all('SELECT * FROM doughs WHERE tenant_id = ? ORDER BY dough_id ASC, ingredient_code ASC', [user.tenant_id]);
      subRows = await db.all('SELECT * FROM sub_doughs WHERE tenant_id = ? ORDER BY dough_id ASC', [user.tenant_id]);
      subIngRows = await db.all('SELECT * FROM sub_dough_ingredients WHERE tenant_id = ? ORDER BY dough_id ASC, ingredient_code ASC', [user.tenant_id]);
    }

    const doughsMap = new Map();
    standardRows.forEach((row: any) => {
      if (!doughsMap.has(row.dough_id)) {
        doughsMap.set(row.dough_id, {
          dough_id: row.dough_id,
          dough_name: row.dough_name,
          type: 'standard',
          ingredients: []
        });
      }
      doughsMap.get(row.dough_id).ingredients.push({
        ingredient_code: row.ingredient_code,
        ingredient_name: row.ingredient_name,
        bakers_percent: row.bakers_percent
      });
    });

    subRows.forEach((row: any) => {
      doughsMap.set(row.dough_id, {
        dough_id: row.dough_id,
        dough_name: row.dough_name,
        type: 'sub_dough',
        base_dough_id: row.base_dough_id,
        base_dough_name: row.base_dough_name,
        base_dough_amount: row.base_dough_amount,
        ingredients: []
      });
    });

    subIngRows.forEach((row: any) => {
      if (doughsMap.has(row.dough_id)) {
        doughsMap.get(row.dough_id).ingredients.push({
          ingredient_code: row.ingredient_code,
          ingredient_name: row.ingredient_name,
          ingredient_amount: row.ingredient_amount
        });
      }
    });

    const doughs = Array.from(doughsMap.values());"""

content = content.replace(get_target, get_new)


# Update POST
post_target = """    const { dough_id, dough_name, ingredients } = await request.json();

    if (!dough_id || !dough_name || !ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return NextResponse.json({ error: '生地ID、生地名、およE1つ以上E材料が忁EでぁE }, { status: 400 });
    }

    const tenantId = user.role === 'super_admin' ? null : user.tenant_id;
    const db = await getDb();

    await db.run('BEGIN TRANSACTION');
    try {
      // 既存データを削除して作り直ぁE
      if (tenantId) {
        await db.run('DELETE FROM doughs WHERE dough_id = ? AND tenant_id = ?', [dough_id, tenantId]);
      } else {
        await db.run('DELETE FROM doughs WHERE dough_id = ?', [dough_id]);
      }

      for (const ing of ingredients) {
        let nameToInsert = ing.ingredient_name;
        if (!nameToInsert) {
          const masterIng = await db.get('SELECT ingredient_name FROM ingredients WHERE ingredient_code = ?', [ing.ingredient_code]);
          nameToInsert = masterIng ? masterIng.ingredient_name : '不Eな材料';
        }
        await db.run(`
          INSERT INTO doughs (dough_id, dough_name, ingredient_code, ingredient_name, bakers_percent, tenant_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [dough_id, dough_name, ing.ingredient_code, nameToInsert, ing.bakers_percent, tenantId]);
      }

      // 啁Eマスタの生地名も連動更新
      if (tenantId) {
        await db.run(`UPDATE product_doughs SET dough_name = ? WHERE dough_code = ? AND tenant_id = ?`, [dough_name, dough_id, tenantId]);
      } else {
        await db.run(`UPDATE product_doughs SET dough_name = ? WHERE dough_code = ?`, [dough_name, dough_id]);
      }

      await db.run('COMMIT');"""

post_new = """    const { dough_id, dough_name, type = 'standard', base_dough_id, base_dough_name, base_dough_amount, ingredients } = await request.json();

    if (!dough_id || !dough_name) {
      return NextResponse.json({ error: '生地ID、生地名は必須です' }, { status: 400 });
    }

    const tenantId = user.role === 'super_admin' ? null : user.tenant_id;
    const db = await getDb();

    await db.run('BEGIN TRANSACTION');
    try {
      // 古いデータをすべて削除（種類変更の可能性もあるため両テーブルから削除）
      if (tenantId) {
        await db.run('DELETE FROM doughs WHERE dough_id = ? AND tenant_id = ?', [dough_id, tenantId]);
        await db.run('DELETE FROM sub_doughs WHERE dough_id = ? AND tenant_id = ?', [dough_id, tenantId]);
        await db.run('DELETE FROM sub_dough_ingredients WHERE dough_id = ? AND tenant_id = ?', [dough_id, tenantId]);
      } else {
        await db.run('DELETE FROM doughs WHERE dough_id = ?', [dough_id]);
        await db.run('DELETE FROM sub_doughs WHERE dough_id = ?', [dough_id]);
        await db.run('DELETE FROM sub_dough_ingredients WHERE dough_id = ?', [dough_id]);
      }

      if (type === 'standard') {
        if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
          throw new Error('標準生地には1つ以上の材料が必要です');
        }
        for (const ing of ingredients) {
          let nameToInsert = ing.ingredient_name;
          if (!nameToInsert) {
            const masterIng = await db.get('SELECT ingredient_name FROM ingredients WHERE ingredient_code = ?', [ing.ingredient_code]);
            nameToInsert = masterIng ? masterIng.ingredient_name : '不明な材料';
          }
          await db.run(`
            INSERT INTO doughs (dough_id, dough_name, ingredient_code, ingredient_name, bakers_percent, tenant_id)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [dough_id, dough_name, ing.ingredient_code, nameToInsert, ing.bakers_percent, tenantId]);
        }
      } else {
        if (!base_dough_id || !base_dough_amount) {
          throw new Error('サブ生地にはベース生地と基準グラム数が必要です');
        }
        await db.run(`
          INSERT INTO sub_doughs (dough_id, dough_name, base_dough_id, base_dough_name, base_dough_amount, tenant_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [dough_id, dough_name, base_dough_id, base_dough_name || '', base_dough_amount, tenantId]);

        if (ingredients && Array.isArray(ingredients)) {
          for (const ing of ingredients) {
            let nameToInsert = ing.ingredient_name;
            if (!nameToInsert) {
              const masterIng = await db.get('SELECT ingredient_name FROM ingredients WHERE ingredient_code = ?', [ing.ingredient_code]);
              nameToInsert = masterIng ? masterIng.ingredient_name : '不明な材料';
            }
            await db.run(`
              INSERT INTO sub_dough_ingredients (dough_id, ingredient_code, ingredient_name, ingredient_amount, tenant_id)
              VALUES (?, ?, ?, ?, ?)
            `, [dough_id, ing.ingredient_code, nameToInsert, ing.ingredient_amount, tenantId]);
          }
        }
      }

      // 商品マスタの生地名も連動更新
      if (tenantId) {
        await db.run(`UPDATE product_doughs SET dough_name = ? WHERE dough_code = ? AND tenant_id = ?`, [dough_name, dough_id, tenantId]);
      } else {
        await db.run(`UPDATE product_doughs SET dough_name = ? WHERE dough_code = ?`, [dough_name, dough_id]);
      }

      await db.run('COMMIT');"""

content = content.replace(post_target, post_new)

delete_target = """    if (tenantId) {
      await db.run('DELETE FROM doughs WHERE dough_id = ? AND tenant_id = ?', [code, tenantId]);
    } else {
      await db.run('DELETE FROM doughs WHERE dough_id = ?', [code]);
    }"""
delete_new = """    if (tenantId) {
      await db.run('DELETE FROM doughs WHERE dough_id = ? AND tenant_id = ?', [code, tenantId]);
      await db.run('DELETE FROM sub_doughs WHERE dough_id = ? AND tenant_id = ?', [code, tenantId]);
      await db.run('DELETE FROM sub_dough_ingredients WHERE dough_id = ? AND tenant_id = ?', [code, tenantId]);
    } else {
      await db.run('DELETE FROM doughs WHERE dough_id = ?', [code]);
      await db.run('DELETE FROM sub_doughs WHERE dough_id = ?', [code]);
      await db.run('DELETE FROM sub_dough_ingredients WHERE dough_id = ?', [code]);
    }"""
content = content.replace(delete_target, delete_new)

with open('src/app/api/admin/doughs/route.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated API route")
