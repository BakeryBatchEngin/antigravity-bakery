import os
import re

def update_file(filepath, pattern, replacement):
    with open(filepath, "r", encoding="utf-8") as f:
        c = f.read()
    new_c = re.sub(pattern, replacement, c)
    if new_c != c:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_c)
        print(f"Updated {filepath}")
    else:
        print(f"No changes in {filepath}")

update_file("src/app/api/admin/products/route.ts", r"DELETE FROM product_doughs WHERE product_code = \?', \[product_code\]\);", r"DELETE FROM product_doughs WHERE product_code = ? AND tenant_id = ?', [product_code, tenantId]);")
update_file("src/app/api/admin/products/route.ts", r"DELETE FROM product_ingredients WHERE product_code = \?', \[product_code\]\);", r"DELETE FROM product_ingredients WHERE product_code = ? AND tenant_id = ?', [product_code, tenantId]);")

update_file("src/app/api/admin/products/route.ts", r"DELETE FROM products WHERE product_code = \?', \[code\]\);", r"DELETE FROM products WHERE product_code = ? AND tenant_id = ?', [code, user.tenant_id]);")
update_file("src/app/api/admin/products/route.ts", r"DELETE FROM product_doughs WHERE product_code = \?', \[code\]\);", r"DELETE FROM product_doughs WHERE product_code = ? AND tenant_id = ?', [code, user.tenant_id]);")
update_file("src/app/api/admin/products/route.ts", r"DELETE FROM product_ingredients WHERE product_code = \?', \[code\]\);", r"DELETE FROM product_ingredients WHERE product_code = ? AND tenant_id = ?', [code, user.tenant_id]);")

