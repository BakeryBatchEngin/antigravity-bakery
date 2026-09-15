import os

files = ['src/app/login/page.tsx', 'src/components/NavigationHeader.tsx']

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        c = f.read()
    c = c.replace('Ver. 3.01', 'Ver. 3.10')
    with open(file, 'w', encoding='utf-8') as f:
        f.write(c)
        
print("Updated Version to 3.10")
