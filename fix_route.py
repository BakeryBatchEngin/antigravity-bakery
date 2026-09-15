import os

with open("src/app/api/admin/doughs/route.ts", "r", encoding="utf-8") as f:
    c = f.read()

target = """    const doughs = Array.from(doughsMap.values());"""
new = """    const doughs = Array.from(doughsMap.values());
    doughs.forEach((d: any) => {
      d.ingredients.sort((a: any, b: any) => {
        if (a.ingredient_name === '水' && b.ingredient_name !== '水') return 1;
        if (a.ingredient_name !== '水' && b.ingredient_name === '水') return -1;
        
        const valA = a.bakers_percent ?? a.ingredient_amount ?? 0;
        const valB = b.bakers_percent ?? b.ingredient_amount ?? 0;
        return valB - valA;
      });
    });"""

c = c.replace(target, new)

with open("src/app/api/admin/doughs/route.ts", "w", encoding="utf-8") as f:
    f.write(c)
print("Updated route.ts")
