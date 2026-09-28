import os
import re

filepath = 'src/app/login/page.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

if 'LoadingSpinner' not in content:
    content = re.sub(r'(import .*?;)', r'\1\nimport LoadingSpinner from "@/components/LoadingSpinner";', content, count=1)

content = re.sub(
    r'<div className="text-slate-500 font-medium">Loading\.\.\.</div>',
    r'<div className="scale-75"><LoadingSpinner /></div>',
    content
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
