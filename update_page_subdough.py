import os

with open('src/app/production/page.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

type_target = """interface ProductionPlanItem {
  doughCode: string;
  doughName: string;
  totalRequiredGrams: number;
  totalFlourWeightGrams: number;
  totalBakersPercent: number;
  batches: DoughBatch[];
}"""
type_new = """interface ProductionPlanItem {
  doughCode: string;
  doughName: string;
  isSubDough?: boolean;
  baseDoughId?: string;
  baseDoughName?: string;
  totalRequiredGrams: number;
  totalFlourWeightGrams: number;
  totalBakersPercent: number;
  batches: DoughBatch[];
}"""
c = c.replace(type_target, type_new)

flat_target = """interface FlatBatch {
  id: string; // 例: D001-1
  type: 'dough';
  doughCode: string;
  doughName: string;
  totalBakersPercent: number;
  batchNumber: number;
  originalFlourWeightGrams: number;
  originalTotalWeightGrams: number;
  baseIngredients: BatchIngredient[];
  currentFlourWeightGrams: number;
  selectedMixerId?: string;
  isAdditional?: boolean;
  isRemake?: boolean;
}"""
flat_new = """interface FlatBatch {
  id: string; // 例: D001-1
  type: 'dough';
  doughCode: string;
  doughName: string;
  isSubDough?: boolean;
  baseDoughName?: string;
  totalBakersPercent: number;
  batchNumber: number;
  originalFlourWeightGrams: number;
  originalTotalWeightGrams: number;
  baseIngredients: BatchIngredient[];
  currentFlourWeightGrams: number;
  selectedMixerId?: string;
  isAdditional?: boolean;
  isRemake?: boolean;
}"""
c = c.replace(flat_target, flat_new)

flat_push_target = """              initialBatches.push({
                id,
                type: 'dough',
                doughCode: plan.doughCode,
                doughName: plan.doughName,
                totalBakersPercent: plan.totalBakersPercent,
                batchNumber: batch.batchNumber,
                originalFlourWeightGrams: batch.batchFlourWeightGrams,
                originalTotalWeightGrams: batch.batchTotalWeightGrams,
                baseIngredients: batch.ingredients,
                currentFlourWeightGrams: batch.batchFlourWeightGrams,
                selectedMixerId: saved ? saved.selectedMixerId : undefined
              });"""
flat_push_new = """              initialBatches.push({
                id,
                type: 'dough',
                doughCode: plan.doughCode,
                doughName: plan.doughName,
                isSubDough: plan.isSubDough,
                baseDoughName: plan.baseDoughName,
                totalBakersPercent: plan.totalBakersPercent,
                batchNumber: batch.batchNumber,
                originalFlourWeightGrams: batch.batchFlourWeightGrams,
                originalTotalWeightGrams: batch.batchTotalWeightGrams,
                baseIngredients: batch.ingredients,
                currentFlourWeightGrams: batch.batchFlourWeightGrams,
                selectedMixerId: saved ? saved.selectedMixerId : undefined
              });"""
c = c.replace(flat_push_target, flat_push_new)

split_target = """          id: `${targetBatch.doughCode}-${newBatchNum}`,
          batchNumber: newBatchNum,
          currentFlourWeightGrams: remainderFlour
        };"""
split_new = """          id: `${targetBatch.doughCode}-${newBatchNum}`,
          batchNumber: newBatchNum,
          currentFlourWeightGrams: remainderFlour,
          isSubDough: targetBatch.isSubDough,
          baseDoughName: targetBatch.baseDoughName
        };"""
c = c.replace(split_target, split_new)

ui_label_target = """<span className="text-[9px] font-bold uppercase tracking-widest leading-none mb-0.5 text-amber-600 dark:text-amber-500">粉量</span>"""
ui_label_new = """<span className="text-[9px] font-bold uppercase tracking-widest leading-none mb-0.5 text-amber-600 dark:text-amber-500">{batch.isSubDough ? 'ベース生地量' : '粉量'}</span>"""
c = c.replace(ui_label_target, ui_label_new)

ui_label_target2 = """<div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">粉量</div>"""
ui_label_new2 = """<div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{selectedBatchDetail?.isSubDough ? 'ベース生地量' : '粉量'}</div>"""
c = c.replace(ui_label_target2, ui_label_new2)

ui_label_target3 = """<span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white text-slate-500 border border-slate-200">
                                            粉: {fmtG(b.currentFlourWeightGrams)}g
                                          </span>"""
ui_label_new3 = """<span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white text-slate-500 border border-slate-200">
                                            {b.isSubDough ? 'ベース' : '粉'}: {fmtG(b.currentFlourWeightGrams)}g
                                          </span>"""
c = c.replace(ui_label_target3, ui_label_new3)

subdough_tag_target = """{batch.isAdditional && (
                        <span className="ml-2 text-xs font-bold px-1.5 py-0.5 rounded bg-black/40 text-[#ADFF2F] border border-[#ADFF2F]/50">
                          {batch.isRemake ? '再仕込み' : '追加オーダー'}
                        </span>
                      )}"""
subdough_tag_new = """{batch.isSubDough && (
                        <span className="ml-2 text-xs font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200">
                          サブ生地
                        </span>
                      )}
                      {batch.isAdditional && (
                        <span className="ml-2 text-xs font-bold px-1.5 py-0.5 rounded bg-black/40 text-[#ADFF2F] border border-[#ADFF2F]/50">
                          {batch.isRemake ? '再仕込み' : '追加オーダー'}
                        </span>
                      )}"""
c = c.replace(subdough_tag_target, subdough_tag_new)

with open('src/app/production/page.tsx', 'w', encoding='utf-8') as f:
    f.write(c)

print("Updated page.tsx with sub dough tags")
