const fs = require('fs');
const path = 'src/app/production/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const interfaceReplacement = `  savedFlatBatches?: FlatBatch[];
  savedFlatProductBatches?: FlatProductBatch[];
  wipMixingPlan?: WipMixingPlanItem[];
  savedFlatWipBatches?: FlatWipBatch[];
  executedBatchIds?: string[];`;

content = content.replace(/  savedFlatBatches\?: FlatBatch\[\];\r?\n\s*savedFlatProductBatches\?: FlatProductBatch\[\];\r?\n\s*executedBatchIds\?: string\[\];/g, interfaceReplacement);

const newInterfaces = `interface FlatProductBatch {
  id: string;
  type: 'product';
  productCode: string;
  productName: string;
  batchNumber: number;
  originalBatchQuantity: number;
  currentBatchQuantity: number;
  baseIngredients: {
    ingredientCode: string;
    ingredientName: string;
    requiredWeightGrams: number;
  }[];
  originalTotalDoughWeightGrams: number;
}

interface WipMixingPlanItem {
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

content = content.replace(/interface FlatProductBatch \{[\s\S]*?originalTotalDoughWeightGrams: number;\r?\n\}/, newInterfaces);

const stateReplacement = `  const [flatBatches, setFlatBatches] = useState<FlatBatch[]>([]);
  const [flatProductBatches, setFlatProductBatches] = useState<FlatProductBatch[]>([]);
  const [flatWipBatches, setFlatWipBatches] = useState<FlatWipBatch[]>([]);`;

content = content.replace(/  const \[flatBatches, setFlatBatches\] = useState<FlatBatch\[\]>\(\[\]\);\r?\n\s*const \[flatProductBatches, setFlatProductBatches\] = useState<FlatProductBatch\[\]>\(\[\]\);/, stateReplacement);

fs.writeFileSync(path, content, 'utf8');
console.log("Patched interfaces and state");
