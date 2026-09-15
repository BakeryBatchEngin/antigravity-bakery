import os
import base64

with open("src/app/admin/doughs/page.tsx", "r", encoding="utf-8") as f:
    c = f.read()

target1 = "dough.ingredients.reduce((sum, i) => sum + (i.bakers_percent||0), 0)"
new1 = "Math.round(dough.ingredients.reduce((sum, i) => sum + (i.bakers_percent||0), 0) * 10) / 10"

target2 = "(dough.base_dough_amount||0) + dough.ingredients.reduce((sum, i) => sum + (i.ingredient_amount||0), 0)"
new2 = "Math.round(((dough.base_dough_amount||0) + dough.ingredients.reduce((sum, i) => sum + (i.ingredient_amount||0), 0)) * 10) / 10"

c = c.replace(target1, new1)
c = c.replace(target2, new2)

with open("src/app/admin/doughs/page.tsx", "w", encoding="utf-8") as f:
    f.write(c)
print("Updated page.tsx")
