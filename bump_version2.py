import os
import re

filepath = 'src/components/NavigationHeader.tsx'
if os.path.exists(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = re.sub(r'Ver\.\s*3\.\d+', 'Ver. 3.17', content)
    
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated version in {filepath}")
