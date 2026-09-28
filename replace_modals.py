import os
import re

filepath = 'src/app/production/page.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# breakdownModal
content = re.sub(
    r'<div className="flex items-center justify-center py-8 gap-3">\s*<div className="animate-spin text-3xl">🔄</div>\s*<span className="text-slate-500 font-bold">読み込み中\.\.\.</span>\s*</div>',
    r'<LoadingSpinner text="読み込み中..." />',
    content
)

# addModal
content = re.sub(
    r'<div className="flex flex-col items-center justify-center py-10">\s*<div className="animate-spin text-4xl mb-4">🔄</div>\s*<p className="text-slate-500 font-bold">読み込み中\.\.\.</p>\s*</div>',
    r'<LoadingSpinner text="読み込み中..." />',
    content
)

# infoModal
content = re.sub(
    r'<div className="flex items-center justify-center py-10 gap-3">\s*<div className="animate-spin text-3xl">🔄</div>\s*<span className="text-slate-500 font-bold">読み込み中\.\.\.</span>\s*</div>',
    r'<LoadingSpinner text="読み込み中..." />',
    content
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
