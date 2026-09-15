import os
import re

def update_file(filepath, pattern, replacement):
    with open(filepath, "r", encoding="utf-8") as f:
        c = f.read()
    new_c = re.sub(pattern, replacement, c, flags=re.DOTALL)
    if new_c != c:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_c)
        print(f"Updated {filepath}")
    else:
        print(f"No changes in {filepath}")

# For POST:
target_post = r"await db\.run\('DELETE FROM product_doughs WHERE product_code = \? AND tenant_id = \?', \[product_code, tenantId\]\);\s*await db\.run\('DELETE FROM product_ingredients WHERE product_code = \? AND tenant_id = \?', \[product_code, tenantId\]\);"
replacement_post = """if (tenantId) {
          await db.run('DELETE FROM product_doughs WHERE product_code = ? AND tenant_id = ?', [product_code, tenantId]);
          await db.run('DELETE FROM product_ingredients WHERE product_code = ? AND tenant_id = ?', [product_code, tenantId]);
        } else {
          await db.run('DELETE FROM product_doughs WHERE product_code = ?', [product_code]);
          await db.run('DELETE FROM product_ingredients WHERE product_code = ?', [product_code]);
        }"""
update_file("src/app/api/admin/products/route.ts", target_post, replacement_post)

# For DELETE:
target_delete = r"await db\.run\('DELETE FROM products WHERE product_code = \? AND tenant_id = \?', \[code, user\.tenant_id\]\);\s*await db\.run\('DELETE FROM product_doughs WHERE product_code = \? AND tenant_id = \?', \[code, user\.tenant_id\]\);\s*await db\.run\('DELETE FROM product_ingredients WHERE product_code = \? AND tenant_id = \?', \[code, user\.tenant_id\]\);"
replacement_delete = """const tenantId = user.role === 'super_admin' ? null : user.tenant_id;
        if (tenantId) {
          await db.run('DELETE FROM products WHERE product_code = ? AND tenant_id = ?', [code, tenantId]);
          await db.run('DELETE FROM product_doughs WHERE product_code = ? AND tenant_id = ?', [code, tenantId]);
          await db.run('DELETE FROM product_ingredients WHERE product_code = ? AND tenant_id = ?', [code, tenantId]);
        } else {
          await db.run('DELETE FROM products WHERE product_code = ?', [code]);
          await db.run('DELETE FROM product_doughs WHERE product_code = ?', [code]);
          await db.run('DELETE FROM product_ingredients WHERE product_code = ?', [code]);
        }"""
update_file("src/app/api/admin/products/route.ts", target_delete, replacement_delete)
