import os
import re

with open('src/app/api/admin/doughs/route.ts', 'r', encoding='utf-8') as f:
    c = f.read()

target = r"const \{ dough_id, dough_name, ingredients \} = await request\.json\(\);[\s\S]*?await db\.run\('COMMIT'\);"
new = """const { dough_id, dough_name, type = 'standard', base_dough_id, base_dough_name, base_dough_amount, ingredients } = await request.json();

    if (!dough_id || !dough_name) {
      return NextResponse.json({ error: '生地ID、生地名は必須です' }, { status: 400 });
    }

    const tenantId = user.role === 'super_admin' ? null : user.tenant_id;
    const db = await getDb();

    await db.run('BEGIN TRANSACTION');
    try {
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

      if (tenantId) {
        await db.run(`UPDATE product_doughs SET dough_name = ? WHERE dough_code = ? AND tenant_id = ?`, [dough_name, dough_id, tenantId]);
      } else {
        await db.run(`UPDATE product_doughs SET dough_name = ? WHERE dough_code = ?`, [dough_name, dough_id]);
      }

      await db.run('COMMIT');"""

c = re.sub(target, new, c)

with open('src/app/api/admin/doughs/route.ts', 'w', encoding='utf-8') as f:
    f.write(c)
print("Fixed POST")
