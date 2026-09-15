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

update_file("src/app/api/admin/ingredients/import/route.ts", r"ON CONFLICT\(ingredient_code\) DO UPDATE SET", r"ON CONFLICT(ingredient_code, tenant_id) DO UPDATE SET")
update_file("src/app/api/admin/products/import/route.ts", r"ON CONFLICT\(product_code\) DO UPDATE SET", r"ON CONFLICT(product_code, tenant_id) DO UPDATE SET")

