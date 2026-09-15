import os
import re

def fix_import_query(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        c = f.read()

    # product_doughs
    c = re.sub(
        r'INSERT INTO product_doughs \(product_code, dough_code, dough_name, dough_amount, tenant_id\)\s*VALUES \(\?, \?, \?, \?, \?\)\s*`, \[product_code, d\.dough_code, d\.dough_name, d\.dough_amount, tenantId\]\);',
        r'INSERT INTO product_doughs (product_code, product_name, dough_code, dough_name, dough_amount, tenant_id)\n              VALUES (?, ?, ?, ?, ?, ?)\n            `, [product_code, data.product_name, d.dough_code, d.dough_name, d.dough_amount, tenantId]);',
        c
    )

    # product_ingredients
    c = re.sub(
        r'INSERT INTO product_ingredients \(product_code, ingredient_code, ingredient_name, ingredient_amount, tenant_id\)\s*VALUES \(\?, \?, \?, \?, \?\)\s*`, \[product_code, i\.ingredient_code, i\.ingredient_name, i\.ingredient_amount, tenantId\]\);',
        r'INSERT INTO product_ingredients (product_code, product_name, ingredient_code, ingredient_name, ingredient_amount, tenant_id)\n              VALUES (?, ?, ?, ?, ?, ?)\n            `, [product_code, data.product_name, i.ingredient_code, i.ingredient_name, i.ingredient_amount, tenantId]);',
        c
    )

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(c)
    print(f"Updated {filepath}")

fix_import_query("src/app/api/admin/products/import/route.ts")
