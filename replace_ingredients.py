import os
import re

filepath = 'src/app/admin/ingredients/page.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

if 'LoadingSpinner' not in content:
    content = re.sub(r'(import .*?;)', r'\1\nimport LoadingSpinner from "@/components/LoadingSpinner";', content, count=1)

content = re.sub(
    r'<tr><td colSpan=\{5\} className="text-center py-10 text-slate-400">Loading\.\.\.</td></tr>',
    r'<tr><td colSpan={5}><LoadingSpinner /></td></tr>',
    content
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
