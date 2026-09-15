import os
import re

with open('src/app/api/production/route.ts', 'r', encoding='utf-8') as f:
    c = f.read()

c = re.sub(r'reduce\(\(sum, item\) => sum \+ item.ingredient_amount', r'reduce((sum: number, item: any) => sum + item.ingredient_amount', c)
c = re.sub(r'reduce\(\(sum, item\) => sum \+ \(\(item.ingredient_amount / req.baseDoughAmount\) \* 100\)', r'reduce((sum: number, item: any) => sum + ((item.ingredient_amount / req.baseDoughAmount) * 100)', c)

with open('src/app/api/production/route.ts', 'w', encoding='utf-8') as f:
    f.write(c)

print("Fixed any types")
