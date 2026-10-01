const fs = require('fs');
const path = 'src/app/production/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const targetStr = `interface WipMixingPlanItem {
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

interface FlatWipBatch {
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
}`;

if (content.includes(targetStr)) {
  content = content.replace(targetStr, '');
  
  const searchStr = `export interface ProductMixingPlanItem {`;
  content = content.replace(searchStr, targetStr + '\n\n' + searchStr);
  fs.writeFileSync(path, content, 'utf8');
  console.log("Moved interfaces successfully.");
} else {
  console.log("Could not find targetStr to move.");
}
