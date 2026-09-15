import os
import re

def rewrite_page(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Insert import if not exists
    if "SearchableSelect" not in content:
        content = re.sub(
            r"(import React.*?;\n)",
            r"\1import SearchableSelect from '@/components/SearchableSelect';\n",
            content,
            count=1
        )
    
    # 1. Replace <select> for masterDoughs
    content = re.sub(
        r'<select\s+value=\{d\.dough_code\}\s+onChange=\{\(e\) => updateDoughRow\(idx, \'dough_code\', e\.target\.value\)\}\s+className="([^"]+)"\s+required\s*>\s*\{masterDoughs\.map\(md => \(\s*<option key=\{md\.dough_id\} value=\{md\.dough_id\}>\s*\{md\.dough_id\} : \{md\.dough_name\}\s*</option>\s*\)\)\}\s*</select>',
        r'<SearchableSelect options={masterDoughs.map(md => ({value: md.dough_id, label: `${md.dough_id} : ${md.dough_name}`}))} value={d.dough_code} onChange={(val) => updateDoughRow(idx, \'dough_code\', val)} className="flex-[2] w-full" placeholder="生地を検索・選択..." />',
        content,
        flags=re.DOTALL
    )

    # 2. Replace <select> for masterIngredients in products page
    content = re.sub(
        r'<select\s+value=\{ing\.ingredient_code\}\s+onChange=\{\(e\) => updateIngredientRow\(idx, \'ingredient_code\', e\.target\.value\)\}\s+className="([^"]+)"\s+required\s*>\s*\{masterIngredients\.map\(mi => \(\s*<option key=\{mi\.ingredient_code\} value=\{mi\.ingredient_code\}>\s*\{mi\.ingredient_code\} : \{mi\.ingredient_name\}\s*</option>\s*\)\)\}\s*</select>',
        r'<SearchableSelect options={masterIngredients.map(mi => ({value: mi.ingredient_code, label: `${mi.ingredient_code} : ${mi.ingredient_name}`}))} value={ing.ingredient_code} onChange={(val) => updateIngredientRow(idx, \'ingredient_code\', val)} className="flex-[2] w-full" placeholder="材料を検索・選択..." />',
        content,
        flags=re.DOTALL
    )

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Updated {filepath}")

rewrite_page("src/app/admin/products/page.tsx")

