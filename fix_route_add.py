import os
import re

def fix_query(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        c = f.read()

    # Define user's tenant_id reference. Wait, does additional-batch have `user`?
    # Yes, it imports getUser and parses sessionCookie.
    tenant_var = "user.tenant_id"

    # products
    c = re.sub(
        r"SELECT product_code, product_name FROM products WHERE product_code = \?', \[productCode\]\);",
        r"SELECT product_code, product_name FROM products WHERE product_code = ? AND tenant_id = ?', [productCode, user.tenant_id]);",
        c
    )

    # product_doughs
    c = re.sub(
        r'WHERE product_code = \?\s*`, \[productCode\]\);',
        r'WHERE product_code = ? AND tenant_id = ?\n    `, [productCode, user.tenant_id]);',
        c
    )

    # sub_doughs
    c = re.sub(
        r"SELECT \* FROM sub_doughs WHERE dough_id = \?', \[pd\.dough_code\]\);",
        r"SELECT * FROM sub_doughs WHERE dough_id = ? AND tenant_id = ?', [pd.dough_code, user.tenant_id]);",
        c
    )

    # sub_dough_ingredients
    c = re.sub(
        r"SELECT \* FROM sub_dough_ingredients WHERE dough_id = \?', \[pd\.dough_code\]\);",
        r"SELECT * FROM sub_dough_ingredients WHERE dough_id = ? AND tenant_id = ?', [pd.dough_code, user.tenant_id]);",
        c
    )

    # doughs d
    c = re.sub(
        r'WHERE d\.dough_id = \?\s*`, \[d\.dough_code\]\);',
        r'WHERE d.dough_id = ? AND d.tenant_id = ?\n      `, [d.dough_code, user.tenant_id]);',
        c
    )
    
    # doughs WHERE dough_id
    c = re.sub(
        r"SELECT dough_name FROM doughs WHERE dough_id = \? LIMIT 1', \[d\.dough_code\]\);",
        r"SELECT dough_name FROM doughs WHERE dough_id = ? AND tenant_id = ? LIMIT 1', [d.dough_code, user.tenant_id]);",
        c
    )

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(c)
    print(f"Updated {filepath}")

fix_query("src/app/api/production/additional-batch/route.ts")
