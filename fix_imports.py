import os

def insert_import(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        c = f.read()
    if "SearchableSelect" not in c or "import SearchableSelect" not in c:
        c = c.replace("'use client';", "'use client';\nimport SearchableSelect from '@/components/SearchableSelect';")
        c = c.replace("val) =>", "val: string) =>")
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(c)

insert_import("src/app/admin/products/page.tsx")
insert_import("src/app/admin/doughs/page.tsx")

