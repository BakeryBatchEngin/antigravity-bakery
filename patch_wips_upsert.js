const fs = require('fs');
const path = 'src/app/api/admin/wips/route.ts';
let c = fs.readFileSync(path, 'utf8');

const targetStr = `      // 3. ingredients にも仕掛品を材料として登録・更新する（type='wip'）
      await db.run(\`
        INSERT INTO ingredients (ingredient_code, ingredient_name, type, status, tenant_id)
        VALUES (?, ?, 'wip', 'active', ?)
        ON CONFLICT(ingredient_code) DO UPDATE SET 
          ingredient_name = excluded.ingredient_name,
          type = 'wip'
      \`, [wip_code, wip_name, tenantId]);`;

const replaceStr = `      // 3. ingredients にも仕掛品を材料として登録・更新する（type='wip'）
      let existingIng;
      if (tenantId) {
        existingIng = await db.get('SELECT * FROM ingredients WHERE ingredient_code = ? AND tenant_id = ?', [wip_code, tenantId]);
      } else {
        existingIng = await db.get('SELECT * FROM ingredients WHERE ingredient_code = ?', [wip_code]);
      }
      
      if (existingIng) {
        if (tenantId) {
          await db.run(\`UPDATE ingredients SET ingredient_name = ?, type = 'wip' WHERE ingredient_code = ? AND tenant_id = ?\`, [wip_name, wip_code, tenantId]);
        } else {
          await db.run(\`UPDATE ingredients SET ingredient_name = ?, type = 'wip' WHERE ingredient_code = ?\`, [wip_name, wip_code]);
        }
      } else {
        await db.run(\`
          INSERT INTO ingredients (ingredient_code, ingredient_name, type, status, tenant_id)
          VALUES (?, ?, 'wip', 'active', ?)
        \`, [wip_code, wip_name, tenantId]);
      }`;

c = c.replace(targetStr, replaceStr);
fs.writeFileSync(path, c);
console.log('Patched wips route to use SELECT/UPDATE/INSERT');
