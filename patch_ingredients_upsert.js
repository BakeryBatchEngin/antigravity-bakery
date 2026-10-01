const fs = require('fs');
const path = 'src/app/api/admin/ingredients/route.ts';
let c = fs.readFileSync(path, 'utf8');

const targetStr = `      await db.run(\`
        INSERT INTO ingredients (ingredient_code, ingredient_name, purchase_weight, purchase_price, status, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(ingredient_code) DO UPDATE SET
          ingredient_name = excluded.ingredient_name,
          purchase_weight = excluded.purchase_weight,
          purchase_price = excluded.purchase_price,
          status = excluded.status
      \`, [ingredient_code, ingredient_name, purchase_weight || null, purchase_price || null, status || 'active', tenantId]);`;

const replaceStr = `      let existingIng;
      if (tenantId) {
        existingIng = await db.get('SELECT * FROM ingredients WHERE ingredient_code = ? AND tenant_id = ?', [ingredient_code, tenantId]);
      } else {
        existingIng = await db.get('SELECT * FROM ingredients WHERE ingredient_code = ?', [ingredient_code]);
      }
      
      if (existingIng) {
        if (tenantId) {
          await db.run(\`
            UPDATE ingredients SET 
              ingredient_name = ?, purchase_weight = ?, purchase_price = ?, status = ?
            WHERE ingredient_code = ? AND tenant_id = ?
          \`, [ingredient_name, purchase_weight || null, purchase_price || null, status || 'active', ingredient_code, tenantId]);
        } else {
          await db.run(\`
            UPDATE ingredients SET 
              ingredient_name = ?, purchase_weight = ?, purchase_price = ?, status = ?
            WHERE ingredient_code = ?
          \`, [ingredient_name, purchase_weight || null, purchase_price || null, status || 'active', ingredient_code]);
        }
      } else {
        await db.run(\`
          INSERT INTO ingredients (ingredient_code, ingredient_name, purchase_weight, purchase_price, status, tenant_id)
          VALUES (?, ?, ?, ?, ?, ?)
        \`, [ingredient_code, ingredient_name, purchase_weight || null, purchase_price || null, status || 'active', tenantId]);
      }`;

c = c.replace(targetStr, replaceStr);
fs.writeFileSync(path, c);
console.log('Patched ingredients route to use SELECT/UPDATE/INSERT');
