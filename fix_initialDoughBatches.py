import os
import re

with open('src/app/production/page.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

target = r"initialDoughBatches\.push\(\{\s*id,\s*type: 'dough',\s*doughCode: plan\.doughCode,\s*doughName: plan\.doughName,\s*totalBakersPercent: plan\.totalBakersPercent,"
new = """initialDoughBatches.push({
                  id,
                  type: 'dough',
                  doughCode: plan.doughCode,
                  doughName: plan.doughName,
                  isSubDough: plan.isSubDough,
                  baseDoughName: plan.baseDoughName,
                  totalBakersPercent: plan.totalBakersPercent,"""

c = re.sub(target, new, c)

with open('src/app/production/page.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print("Fixed initialDoughBatches push")
