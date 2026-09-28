import os
import re

filepath = 'src/app/page.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. import の追加
if 'LoadingSpinner' not in content:
    content = re.sub(r'(import .*?;)', r'\1\nimport LoadingSpinner from "@/components/LoadingSpinner";', content, count=1)

# 2. Loading... の置換
content = re.sub(
    r'<div className="min-h-screen flex items-center justify-center text-slate-500">Loading\.\.\.</div>',
    r'<LoadingSpinner fullScreen={true} />',
    content
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
