import os
import re

def fix_query(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        c = f.read()

    # doughs d
    c = re.sub(
        r'WHERE d\.dough_id = \? AND d\.tenant_id = \?\s*`, \[doughCode\]\);',
        r'WHERE d.dough_id = ? AND d.tenant_id = ?\n        `, [doughCode, user.tenant_id]);',
        c
    )

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(c)
    print(f"Updated {filepath}")

fix_query("src/app/api/production/route.ts")
