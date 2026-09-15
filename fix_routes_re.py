import os
import re

def fix_all_queries(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        c = f.read()

    # 1. doughsForProduct (first one around line 147)
    c = re.sub(
        r'WHERE product_code = \? AND tenant_id = \?\s*`, \[product\.product_code\]\);',
        r'WHERE product_code = ? AND tenant_id = ?\n      `, [product.product_code, user.tenant_id]);',
        c
    )
    
    # 2. doughsForProduct (second one around line 335)
    c = re.sub(
        r'WHERE product_code = \? AND tenant_id = \?\s*`, \[product\.product_code\]\);',
        r'WHERE product_code = ? AND tenant_id = ?\n      `, [product.product_code, user.tenant_id]);',
        c
    )
    
    # 3. productIngredients (around line 324)
    c = re.sub(
        r'WHERE product_code = \? AND tenant_id = \? AND tenant_id = \?',
        r'WHERE product_code = ? AND tenant_id = ?',
        c
    )
    c = re.sub(
        r'WHERE product_code = \? AND tenant_id = \?\s*`, \[product\.product_code, user\.tenant_id\]\);',
        r'WHERE product_code = ? AND tenant_id = ?\n      `, [product.product_code, user.tenant_id]);',
        c
    )

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(c)
    print(f"Updated {filepath}")

fix_all_queries("src/app/api/production/route.ts")
