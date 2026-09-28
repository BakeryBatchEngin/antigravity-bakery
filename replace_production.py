import os
import re

filepath = 'src/app/production/page.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

if 'LoadingSpinner' not in content:
    content = re.sub(r'(import .*?;)', r'\1\nimport LoadingSpinner from "@/components/LoadingSpinner";', content, count=1)

content = re.sub(
    r'<div className="flex w-full justify-center items-center">\s*<div className="animate-spin text-6xl">🔄</div>\s*<span className="text-2xl ml-4 font-bold text-slate-600 dark:text-slate-300">計算中\.\.\.</span>\s*</div>',
    r'<LoadingSpinner text="計算中..." />',
    content
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
