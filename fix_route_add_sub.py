import os
import re

def fix_query(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        c = f.read()

    # doughs d
    c = re.sub(
        r'WHERE d\.dough_id = \?\s*`, \[subDough\.base_dough_id\]\);',
        r'WHERE d.dough_id = ? AND d.tenant_id = ?\n          `, [subDough.base_dough_id, user.tenant_id]);',
        c
    )
    c = re.sub(
        r'WHERE d\.dough_id = \?\s*`, \[pd\.dough_code\]\);',
        r'WHERE d.dough_id = ? AND d.tenant_id = ?\n          `, [pd.dough_code, user.tenant_id]);',
        c
    )

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(c)
    print(f"Updated {filepath}")

fix_query("src/app/api/production/additional-batch/route.ts")
