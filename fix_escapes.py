import os

def fix_escapes(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        c = f.read()
    c = c.replace(r"\'dough_code\'", "'dough_code'")
    c = c.replace(r"\'ingredient_code\'", "'ingredient_code'")
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(c)

fix_escapes("src/app/admin/products/page.tsx")
fix_escapes("src/app/admin/doughs/page.tsx")

