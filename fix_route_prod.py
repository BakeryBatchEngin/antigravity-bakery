import os
import re

def fix_query(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        c = f.read()

    # Define user's tenant_id reference
    tenant_var = "user.tenant_id"

    # 1. product_doughs, product_ingredients (in masterProductNames)
    c = re.sub(
        r'SELECT product_code, product_name FROM product_doughs\s*UNION ALL\s*SELECT product_code, product_name FROM product_ingredients',
        r'SELECT product_code, product_name FROM product_doughs WHERE tenant_id = ?\n        UNION ALL\n        SELECT product_code, product_name FROM product_ingredients WHERE tenant_id = ?',
        c
    )
    # The parameters for masterProductNames need to be added.
    c = re.sub(
        r'const masterProductNames = await db\.all\(`\s*SELECT product_code, MAX\(product_name\) as master_product_name\s*FROM \(\s*SELECT product_code, product_name FROM product_doughs WHERE tenant_id = \?\s*UNION ALL\s*SELECT product_code, product_name FROM product_ingredients WHERE tenant_id = \?\s*\)\s*GROUP BY product_code\s*`\);',
        r'const masterProductNames = await db.all(`\n      SELECT product_code, MAX(product_name) as master_product_name\n      FROM (\n        SELECT product_code, product_name FROM product_doughs WHERE tenant_id = ?\n        UNION ALL\n        SELECT product_code, product_name FROM product_ingredients WHERE tenant_id = ?\n      )\n      GROUP BY product_code\n    `, [user.tenant_id, user.tenant_id]);',
        c
    )

    # 2. SELECT ... FROM product_doughs WHERE product_code = ?
    c = re.sub(
        r'SELECT dough_code, dough_name, dough_amount\s*FROM product_doughs\s*WHERE product_code = \?',
        r'SELECT dough_code, dough_name, dough_amount\n        FROM product_doughs\n        WHERE product_code = ? AND tenant_id = ?',
        c
    )
    # Replace `[product.product_code]` with `[product.product_code, user.tenant_id]`
    c = re.sub(
        r'WHERE product_code = \?\s*`, \[product\.product_code\]\);',
        r'WHERE product_code = ? AND tenant_id = ?\n      `, [product.product_code, user.tenant_id]);',
        c
    )

    # 3. sub_doughs
    c = re.sub(
        r"SELECT \* FROM sub_doughs WHERE dough_id = \?', \[pd\.dough_code\]\);",
        r"SELECT * FROM sub_doughs WHERE dough_id = ? AND tenant_id = ?', [pd.dough_code, user.tenant_id]);",
        c
    )
    # 4. sub_dough_ingredients
    c = re.sub(
        r"SELECT \* FROM sub_dough_ingredients WHERE dough_id = \?', \[pd\.dough_code\]\);",
        r"SELECT * FROM sub_dough_ingredients WHERE dough_id = ? AND tenant_id = ?', [pd.dough_code, user.tenant_id]);",
        c
    )

    # 5. doughs d WHERE d.dough_id = ?
    c = re.sub(
        r'FROM doughs d\s*WHERE d\.dough_id = \?',
        r'FROM doughs d\n        WHERE d.dough_id = ? AND d.tenant_id = ?',
        c
    )
    c = re.sub(
        r'WHERE d\.dough_id = \?\s*`, \[d\.dough_code\]\);',
        r'WHERE d.dough_id = ? AND d.tenant_id = ?\n      `, [d.dough_code, user.tenant_id]);',
        c
    )

    # 6. product_ingredients WHERE product_code = ?
    c = re.sub(
        r'FROM product_ingredients\s*WHERE product_code = \?',
        r'FROM product_ingredients\n        WHERE product_code = ? AND tenant_id = ?',
        c
    )
    c = re.sub(
        r'WHERE product_code = \?\s*`, \[p\.product_code\]\);',
        r'WHERE product_code = ? AND tenant_id = ?\n      `, [p.product_code, user.tenant_id]);',
        c
    )
    
    # 7. dough_name FROM doughs WHERE dough_id = ? LIMIT 1
    c = re.sub(
        r"SELECT dough_name FROM doughs WHERE dough_id = \? LIMIT 1', \[d\.dough_code\]\);",
        r"SELECT dough_name FROM doughs WHERE dough_id = ? AND tenant_id = ? LIMIT 1', [d.dough_code, user.tenant_id]);",
        c
    )

    # 8. dough_name FROM sub_doughs WHERE dough_id = ? LIMIT 1
    c = re.sub(
        r"SELECT dough_name FROM sub_doughs WHERE dough_id = \? LIMIT 1', \[d\.dough_code\]\);",
        r"SELECT dough_name FROM sub_doughs WHERE dough_id = ? AND tenant_id = ? LIMIT 1', [d.dough_code, user.tenant_id]);",
        c
    )

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(c)
    print(f"Updated {filepath}")

fix_query("src/app/api/production/route.ts")
