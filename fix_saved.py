import os

with open('src/app/api/production/route.ts', 'r', encoding='utf-8') as f:
    c = f.read()

target = """    savedBatches.forEach(b => {
      if (b.type === 'dough') {
        savedFlatBatches.push({
          id: b.batch_id,
          type: 'dough',
          doughCode: b.dough_code,
          doughName: b.dough_name,
          totalBakersPercent: b.total_bakers_percent,
          batchNumber: b.batch_number,
          originalFlourWeightGrams: b.original_flour_weight_grams,
          originalTotalWeightGrams: b.original_total_weight_grams,
          baseIngredients: JSON.parse(b.base_ingredients),
          currentFlourWeightGrams: b.current_flour_weight_grams,
          selectedMixerId: b.selected_mixer_id || undefined,
          isAdditional: b.is_additional === 1,
          isRemake: b.is_remake === 1
        });
      }"""

new = """    // Sub Dough information lookup for saved batches
    const allSubDoughs = await db.all('SELECT * FROM sub_doughs');
    const subDoughMap = new Map();
    allSubDoughs.forEach((sd: any) => {
      subDoughMap.set(sd.dough_id, sd);
    });

    savedBatches.forEach(b => {
      if (b.type === 'dough') {
        const sd = subDoughMap.get(b.dough_code);
        savedFlatBatches.push({
          id: b.batch_id,
          type: 'dough',
          doughCode: b.dough_code,
          doughName: b.dough_name,
          isSubDough: !!sd,
          baseDoughName: sd ? sd.base_dough_name : undefined,
          totalBakersPercent: b.total_bakers_percent,
          batchNumber: b.batch_number,
          originalFlourWeightGrams: b.original_flour_weight_grams,
          originalTotalWeightGrams: b.original_total_weight_grams,
          baseIngredients: JSON.parse(b.base_ingredients),
          currentFlourWeightGrams: b.current_flour_weight_grams,
          selectedMixerId: b.selected_mixer_id || undefined,
          isAdditional: b.is_additional === 1,
          isRemake: b.is_remake === 1
        });
      }"""

c = c.replace(target, new)

with open('src/app/api/production/route.ts', 'w', encoding='utf-8') as f:
    f.write(c)
print("Updated route.ts with isSubDough lookup for saved batches")
