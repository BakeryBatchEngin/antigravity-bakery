import os
import re

directories = ['src/app']

for root, _, files in os.walk(directories[0]):
    for file in files:
        if file.endswith('.ts') or file.endswith('.tsx'):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # replace * 10) / 10 with * 100) / 100
            new_content = re.sub(r'\*\s*10\)\s*/\s*10', '* 100) / 100', content)
            
            if new_content != content:
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"Updated {path}")
