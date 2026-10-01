const fs = require('fs');
const path = 'src/app/production/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const defs = `
export interface WipMixingPlanItem {
  wipCode: string;
  wipName: string;
  totalRequiredGrams: number;
  batches: {
    batchNumber: number;
    batchTotalWeightGrams: number;
    ingredients: {
      ingredientCode: string;
      ingredientName: string;
      requiredWeightGrams: number;
    }[];
  }[];
}

export interface FlatWipBatch {
  id: string;
  type: 'wip';
  wipCode: string;
  wipName: string;
  batchNumber: number;
  originalTotalWeightGrams: number;
  currentTotalWeightGrams: number;
  baseIngredients: {
    ingredientCode: string;
    ingredientName: string;
    requiredWeightGrams: number;
  }[];
  selectedMixerId?: string;
  isAdditional?: boolean;
}

`;

content = content.replace('export default function ProductionPlanPage() {', defs + 'export default function ProductionPlanPage() {');
fs.writeFileSync(path, content, 'utf8');
console.log("Injected defs");
