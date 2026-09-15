import os
import re

def rewrite_page(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    if "SearchableSelect" not in content:
        content = re.sub(
            r"(import React.*?;\n)",
            r"\1import SearchableSelect from '@/components/SearchableSelect';\n",
            content,
            count=1
        )
    
    # 1. Base dough select
    content = re.sub(
        r'<select\s+value=\{formData\.base_dough_id \|\| \'\'\}\s+onChange=\{\(e\) => \{\s*const selected = doughs\.find\(d => d\.dough_id === e\.target\.value\);\s*setFormData\(\{\s*\.\.\.formData,\s*base_dough_id: e\.target\.value,\s*base_dough_name: selected\?\.dough_name \|\| \'\'\s*\}\);\s*\}\}\s+className="([^"]+)"\s*>\s*<option value="">ベース生地を選択してください</option>\s*\{doughs\.map\(d => \(\s*<option key=\{d\.dough_id\} value=\{d\.dough_id\}>\s*\{d\.dough_name\}\s*</option>\s*\)\)\}\s*</select>',
        r'''<SearchableSelect 
                        options={doughs.map(d => ({value: d.dough_id, label: d.dough_name}))}
                        value={formData.base_dough_id || ''}
                        onChange={(val) => {
                          const selected = doughs.find(d => d.dough_id === val);
                          setFormData({
                            ...formData,
                            base_dough_id: val,
                            base_dough_name: selected?.dough_name || ''
                          });
                        }}
                        className="flex-[2] w-full"
                        placeholder="ベース生地を検索・選択..."
                      />''',
        content,
        flags=re.DOTALL
    )

    # 2. Ingredients select
    content = re.sub(
        r'<select\s+value=\{ing\.ingredient_code\}\s+onChange=\{\(e\) => updateIngredientRow\(idx, \'ingredient_code\', e\.target\.value\)\}\s+className="([^"]+)"\s+required\s*>\s*\{masterIngredients\.map\(mi => \(\s*<option key=\{mi\.ingredient_code\} value=\{mi\.ingredient_code\}>\s*\{mi\.ingredient_code\} : \{mi\.ingredient_name\}\s*</option>\s*\)\)\}\s*</select>',
        r'<SearchableSelect options={masterIngredients.map(mi => ({value: mi.ingredient_code, label: `${mi.ingredient_code} : ${mi.ingredient_name}`}))} value={ing.ingredient_code} onChange={(val) => updateIngredientRow(idx, \'ingredient_code\', val)} className="flex-[2] w-full" placeholder="材料を検索・選択..." />',
        content,
        flags=re.DOTALL
    )

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Updated {filepath}")

rewrite_page("src/app/admin/doughs/page.tsx")

