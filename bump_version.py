import os
import re

files_to_update = [
    'src/components/NavigationHeader.tsx',
    'src/app/login/page.tsx'
]

for filepath in files_to_update:
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 3.16 を 3.17 に置換
        new_content = re.sub(r'Ver\.\s*3\.16', 'Ver. 3.17', content)
        
        if new_content != content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Updated version in {filepath}")
        else:
            print(f"No changes needed or version string not found in {filepath}")
    else:
        print(f"File not found: {filepath}")
