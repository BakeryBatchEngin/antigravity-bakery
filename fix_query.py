import os

with open('src/app/api/production/route.ts', 'r', encoding='utf-8') as f:
    c = f.read()

target = """        const masterDough = await db.get('SELECT dough_name FROM doughs WHERE dough_id = ? LIMIT 1', [d.dough_code]);"""
new = """        let masterDough = await db.get('SELECT dough_name FROM doughs WHERE dough_id = ? LIMIT 1', [d.dough_code]);
        if (!masterDough) {
          masterDough = await db.get('SELECT dough_name FROM sub_doughs WHERE dough_id = ? LIMIT 1', [d.dough_code]);
        }"""
c = c.replace(target, new)

with open('src/app/api/production/route.ts', 'w', encoding='utf-8') as f:
    f.write(c)
print("Fixed dough name query in route.ts")
