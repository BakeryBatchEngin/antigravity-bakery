import os
import re

filepath = 'src/app/admin/doughs/page.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

if 'LoadingSpinner' not in content:
    content = re.sub(r'(import .*?;)', r'\1\nimport LoadingSpinner from "@/components/LoadingSpinner";', content, count=1)

content = re.sub(
    r'<p className="text-slate-400 text-center col-span-full py-10">Loading\.\.\.</p>',
    r'<div className="col-span-full"><LoadingSpinner /></div>',
    content
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
