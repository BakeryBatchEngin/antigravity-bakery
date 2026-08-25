'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';

// APIが返すデータの型定義
interface MixerCapacity {
  id: string;
  name: string;
  icon: string;
  max_capacity_kg: number;
}

interface BatchIngredient {
  ingredientCode: string;
  ingredientName: string;
  bakersPercent: number;
  requiredWeightGrams: number;
}

interface DoughBatch {
  batchNumber: number;
  batchFlourWeightGrams: number;
  batchTotalWeightGrams: number;
  ingredients: BatchIngredient[];
}

interface ProductionPlanItem {
  doughCode: string;
  doughName: string;
  totalRequiredGrams: number;
  totalFlourWeightGrams: number;
  totalBakersPercent: number;
  batches: DoughBatch[];
}

interface ProductMixingBatch {
  batchNumber: number;
  batchQuantity: number;
  doughCode: string;
  doughName: string;
  totalDoughWeightGrams: number;
  doughDetails?: { doughCode: string, amountPerItem: number }[];
  ingredients: {
    ingredientCode: string;
    ingredientName: string;
    requiredWeightGrams: number;
  }[];
  currentBatchQuantity: number;
  maxBatchQuantity: number;
}

interface ProductMixingPlanItem {
  productCode: string;
  productName: string;
  totalQuantity: number;
  batches: ProductMixingBatch[];
}

interface ProductionResponse {
  success?: boolean;
  date?: string;
  mixers?: MixerCapacity[];
  productionPlan?: ProductionPlanItem[];
  productMixingPlan?: ProductMixingPlanItem[];
  savedFlatBatches?: FlatBatch[];
  savedFlatProductBatches?: FlatProductBatch[];
  executedBatchIds?: string[];
  mixingExecutionTimes?: Record<string, string>;
  isSet?: boolean;
  message?: string;
  error?: string;
}

// クライアント側で管理するフラットなバッチ情報
interface FlatBatch {
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
}

interface FlatProductBatch {
  id: string; // 例: PM-MH001-1
  type: 'product';
  productCode: string;
  productName: string;
  doughCode: string;
  doughName: string;
  batchNumber: number;
  originalBatchQuantity: number;
  originalTotalDoughWeightGrams: number;
  doughDetails?: { doughCode: string, amountPerItem: number }[];
  baseIngredients: {
    ingredientCode: string;
    ingredientName: string;
    requiredWeightGrams: number;
  }[];
  currentBatchQuantity: number;
  maxBatchQuantity: number;
  selectedMixerId?: string;
  isAdditional?: boolean;
  isRemake?: boolean;
}


const normalizeBatches = (batches: FlatBatch[], mixers: MixerCapacity[]): FlatBatch[] => {
  if (batches.length === 0) return [];
  let current = [...batches];
  const baseBatch = current[0];
  
  while (current.length > 0) {
    const lastIdx = current.length - 1;
    if (current[lastIdx].currentFlourWeightGrams <= 0) {
      const excess = current[lastIdx].currentFlourWeightGrams;
      current.pop();
      if (excess < 0 && current.length > 0) {
        current[current.length - 1].currentFlourWeightGrams += excess;
      }
    } else {
      break;
    }
  }
  
  for (let i = 0; i < current.length; i++) {
    const mixerId = current[i].selectedMixerId;
    const mixer = mixers.find(m => m.id === mixerId) || mixers[0];
    const maxCapacityKg = Math.max(1, mixer ? mixer.max_capacity_kg : 50);
    const maxFlourWeight = (maxCapacityKg * 1000) / (baseBatch.totalBakersPercent / 100);

    if (current[i].currentFlourWeightGrams > maxFlourWeight + 0.1) {
      const excess = current[i].currentFlourWeightGrams - maxFlourWeight;
      current[i].currentFlourWeightGrams = maxFlourWeight;
      if (i + 1 < current.length) {
        current[i + 1].currentFlourWeightGrams += excess;
      } else {
        const nextBatchNum = current[i].batchNumber + 1;
        current.push({
          ...baseBatch,
          id: `${baseBatch.doughCode}-${nextBatchNum}`,
          batchNumber: nextBatchNum,
          originalFlourWeightGrams: 0,
          originalTotalWeightGrams: 0,
          currentFlourWeightGrams: excess,
          selectedMixerId: current[i].selectedMixerId
        });
      }
    }
  }
  return current;
};

const normalizeProductBatches = (batches: FlatProductBatch[], mixers: MixerCapacity[]): FlatProductBatch[] => {
  if (batches.length === 0) return [];
  let current = [...batches];
  const baseBatch = current[0];
  
  const safeOriginalQty = baseBatch.originalBatchQuantity || 1;
  const baseTotalIngWeightGrams = baseBatch.baseIngredients.reduce((sum, ing) => sum + ing.requiredWeightGrams, 0);
  const baseItemTotalWeightGrams = (baseBatch.originalTotalDoughWeightGrams + baseTotalIngWeightGrams) / safeOriginalQty;

  while (current.length > 0) {
    const lastIdx = current.length - 1;
    if (current[lastIdx].currentBatchQuantity <= 0) {
      const excess = current[lastIdx].currentBatchQuantity;
      current.pop();
      if (excess < 0 && current.length > 0) {
        current[current.length - 1].currentBatchQuantity += excess;
      }
    } else {
      break;
    }
  }
  
  for (let i = 0; i < current.length; i++) {
    const mixerId = current[i].selectedMixerId;
    const mixer = mixers.find(m => m.id === mixerId) || mixers[0];
    const maxCapacityKg = Math.max(1, mixer ? mixer.max_capacity_kg : 50);
    const maxCapacityGrams = maxCapacityKg * 1000;
    
    let maxQty = Math.floor(maxCapacityGrams / baseItemTotalWeightGrams);
    if (maxQty < 1) maxQty = 1;
    current[i].maxBatchQuantity = maxQty;

    if (current[i].currentBatchQuantity > maxQty) {
      const excess = current[i].currentBatchQuantity - maxQty;
      current[i].currentBatchQuantity = maxQty;
      if (i + 1 < current.length) {
        current[i + 1].currentBatchQuantity += excess;
      } else {
        const nextBatchNum = current[i].batchNumber + 1;
        current.push({
          ...baseBatch,
          id: `PM-${baseBatch.productCode}-${nextBatchNum}`,
          batchNumber: nextBatchNum,
          currentBatchQuantity: excess,
          selectedMixerId: current[i].selectedMixerId
        });
      }
    }
  }
  return current;
};

// 長押しで高速増減するボタンコンポーネント
// ※UXの観点から、3秒ではなく500ms(0.5秒)後に連続実行が始まる一般的な設定にしています。
function AutoRepeatButton({ onAction, className, 'aria-label': ariaLabel, children, disabled }: any) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPress = (e: React.PointerEvent) => {
    e.stopPropagation(); // バッチ選択など親への伝播を防ぐ
    // タッチデバイスでのスクロール等の誤爆を防ぎ、左クリックのみ反応させる
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    
    // イベントオブジェクトのダミー（連続実行時にe.stopPropagationがエラーにならないようにするため）
    const dummyEvent = { stopPropagation: () => {} };

    // まず1回実行
    if (onAction) onAction(e);
    
    // 500ms(0.5秒)押しっぱなしで高速連続実行を開始
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        if (onAction) onAction(dummyEvent);
      }, 80); // 80ms間隔（1秒間に約12回）で素早く増減
    }, 500); 
  };

  const stopPress = (e?: React.PointerEvent) => {
    if (e) e.stopPropagation();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  useEffect(() => {
    return stopPress;
  }, []);

  return (
    <button
      className={className}
      aria-label={ariaLabel}
      onPointerDown={startPress}
      onPointerUp={stopPress}
      onPointerLeave={stopPress}
      onPointerCancel={stopPress}
      onClick={(e) => e.stopPropagation()} // ネイティブのクリックイベントも親へ伝播しないよう止める
      onContextMenu={(e) => { e.preventDefault(); stopPress(); }} // 右クリックメニューを防ぎ、長押しをキャンセル
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export default function ProductionPlanPage() {
  const [targetDate, setTargetDate] = useState<string>('');
  const [productionData, setProductionData] = useState<ProductionResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  
  // UI状態管理
  const [mixers, setMixers] = useState<MixerCapacity[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [flatBatches, setFlatBatches] = useState<FlatBatch[]>([]);
  const [flatProductBatches, setFlatProductBatches] = useState<FlatProductBatch[]>([]);
  const [isPlanSet, setIsPlanSet] = useState<boolean>(false);
  const [executedBatchIds, setExecutedBatchIds] = useState<string[]>([]);
  const [mixingExecutionTimes, setMixingExecutionTimes] = useState<Record<string, string>>({});
  
  // 計量完了のチェック状態管理: { [batchId]: { [ingredientCode]: true/false } }
  const [checkedIngredients, setCheckedIngredients] = useState<Record<string, Record<string, boolean>>>({});

  // 発注元内訳表示用のモーダル状態
  const [breakdownModal, setBreakdownModal] = useState<{
    isOpen: boolean;
    productCode: string;
    productName: string;
    items: { display_name: string; quantity: number }[];
    isLoading: boolean;
  }>({
    isOpen: false,
    productCode: '',
    productName: '',
    items: [],
    isLoading: false,
  });

  // 追加仕込み用状態
  const [addModal, setAddModal] = useState<{
    isOpen: boolean;
    products: any[];
    items: { id: string, productCode: string, quantity: number, reason: 'additional' | 'remake' }[];
    isLoading: boolean;
  }>({
    isOpen: false,
    products: [],
    items: [{ id: '1', productCode: '', quantity: 1, reason: 'additional' }],
    isLoading: false,
  });

  // 初回レンダリング時にURLのdateパラメータがあればそれを、なければ今日の日付をセットし、データをフェッチ
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get('date');
    const today = new Date().toISOString().split('T')[0];
    const initialDate = dateParam || today;
    setTargetDate(initialDate);
    fetchProductionPlan(initialDate);
  }, []);

  // 発注元内訳を取得してモーダルを開くハンドラ
  const handleShowBreakdown = async (e: React.MouseEvent, productCode: string, productName: string) => {
    e.stopPropagation(); // バッチ選択への会気を防ぐ
    setBreakdownModal({ isOpen: true, productCode, productName, items: [], isLoading: true });
    try {
      const res = await fetch(`/api/order-breakdowns?date=${targetDate}&product_code=${encodeURIComponent(productCode)}`);
      const data = await res.json();
      if (res.ok && data.breakdowns) {
        setBreakdownModal(prev => ({ ...prev, items: data.breakdowns, isLoading: false }));
      } else {
        setBreakdownModal(prev => ({ ...prev, items: [], isLoading: false }));
      }
    } catch {
      setBreakdownModal(prev => ({ ...prev, items: [], isLoading: false }));
    }
  };

  // 追加仕込みモーダルを開く
  const handleOpenAddModal = async () => {
    setAddModal(prev => ({ ...prev, isOpen: true, isLoading: true, items: [{ id: Date.now().toString(), productCode: '', quantity: 1, reason: 'additional' }] }));
    try {
      const res = await fetch('/api/admin/products');
      const data = await res.json();
      if (res.ok && data.products) {
        setAddModal(prev => ({ ...prev, products: data.products, isLoading: false }));
        if (data.products.length === 0) {
          alert('登録されている商品が見つかりません。');
        }
      } else {
        console.error('Failed to fetch products:', data);
        setAddModal(prev => ({ ...prev, isLoading: false }));
        alert('商品の取得に失敗しました。サーバーのエラーログを確認してください。');
      }
    } catch (e) {
      console.error('Network error fetching products:', e);
      setAddModal(prev => ({ ...prev, isLoading: false }));
      alert('通信エラーが発生しました。商品一覧を取得できません。');
    }
  };

  // 追加仕込みの実行
  const handleAddBatchSubmit = async () => {
    const validItems = addModal.items.filter(item => item.productCode && item.quantity > 0);
    if (validItems.length === 0) return;

    setAddModal(prev => ({ ...prev, isLoading: true }));
    try {
      let updatedDoughs = [...flatBatches];
      let updatedProducts = [...flatProductBatches];
      
      for (const item of validItems) {
        const res = await fetch('/api/production/additional-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productCode: item.productCode, quantity: item.quantity, reason: item.reason })
        });
        const data = await res.json();
        
        if (res.ok && data.success) {
          updatedDoughs = [...updatedDoughs, ...(data.additionalDoughBatches || [])];
          updatedProducts = [...updatedProducts, ...(data.additionalProductBatches || [])];
        } else {
          alert(`エラー: ${data.error || '追加バッチの生成に失敗しました'}`);
        }
      }
      
      setFlatBatches(updatedDoughs);
      setFlatProductBatches(updatedProducts);
      setAddModal(prev => ({ ...prev, isOpen: false, isLoading: false }));
      
      if (isPlanSet) {
        await fetch('/api/production/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: targetDate,
            flatBatches: updatedDoughs,
            flatProductBatches: updatedProducts
          })
        });
      }
    } catch (e) {
      alert('エラーが発生しました');
      setAddModal(prev => ({ ...prev, isLoading: false }));
    }
  };

  const fetchProductionPlan = async (date: string) => {
    if (!date) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/production?date=${date}`);
      const data: ProductionResponse = await res.json();
      
      if (res.ok) {
        setProductionData(data);
        if (data.mixers) setMixers(data.mixers);

        setIsPlanSet(!!data.isSet);
        const execIds = data.executedBatchIds || [];
        setExecutedBatchIds(execIds);
        setMixingExecutionTimes(data.mixingExecutionTimes || {});
        
        // 1. 保存された計画データ（Set済み）があればそれを直接使う
        if (data.isSet && data.savedFlatBatches) {
          const sortedSavedDoughs = [...data.savedFlatBatches];
          sortedSavedDoughs.sort((a, b) => {
            if (a.isAdditional !== b.isAdditional) return a.isAdditional ? 1 : -1;
            const doughCmp = a.doughCode.localeCompare(b.doughCode, 'en');
            if (doughCmp !== 0) return doughCmp;
            return a.batchNumber - b.batchNumber;
          });
          setFlatBatches(sortedSavedDoughs);
          
          const sortedSavedProducts = data.savedFlatProductBatches || [];
          sortedSavedProducts.sort((a, b) => {
            if (a.isAdditional !== b.isAdditional) return a.isAdditional ? 1 : -1;
            const doughCmp = a.doughCode.localeCompare(b.doughCode, 'en');
            if (doughCmp !== 0) return doughCmp;
            const prodCmp = a.productCode.localeCompare(b.productCode, 'en');
            if (prodCmp !== 0) return prodCmp;
            return a.batchNumber - b.batchNumber;
          });
          setFlatProductBatches(sortedSavedProducts);
          
          let firstBatchId = data.savedFlatBatches[0]?.id || sortedSavedProducts[0]?.id || null;
          setSelectedBatchId(firstBatchId);

          // 実行済みのバッチについては、UI上の全チェックボックスをONにしておく
          const initialChecks: Record<string, Record<string, boolean>> = {};
          data.savedFlatBatches.forEach(b => {
             if (execIds.includes(b.id)) {
               initialChecks[b.id] = {};
               b.baseIngredients.forEach(i => initialChecks[b.id][i.ingredientCode] = true);
             }
          });
          data.savedFlatProductBatches?.forEach(b => {
             if (execIds.includes(b.id)) {
               initialChecks[b.id] = {};
               b.baseIngredients.forEach(i => initialChecks[b.id][i.ingredientCode] = true);
             }
          });
          setCheckedIngredients(initialChecks);
          return;
        }

        // 2. 保存されていない場合は、注文からの新規計算データを使用
        setCheckedIngredients({}); // <--- 日付を変えた際など、前のチェック状態が残るのを防ぐためリセット
        let firstBatchId: string | null = null;
        
        const initialDoughBatches: FlatBatch[] = [];
        if (data.productionPlan && data.productionPlan.length > 0) {
          data.productionPlan.forEach(plan => {
            plan.batches.forEach(batch => {
              const id = `${plan.doughCode}-${batch.batchNumber}`;
              if (!firstBatchId) firstBatchId = id;
              initialDoughBatches.push({
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
                selectedMixerId: data.mixers?.[0]?.id
              });
            });
          });
        }
        initialDoughBatches.sort((a, b) => {
          const doughCmp = a.doughCode.localeCompare(b.doughCode, 'en');
          if (doughCmp !== 0) return doughCmp;
          return a.batchNumber - b.batchNumber;
        });
        setFlatBatches(initialDoughBatches);

        const initialProductBatches: FlatProductBatch[] = [];
        if (data.productMixingPlan && data.productMixingPlan.length > 0) {
          data.productMixingPlan.forEach(plan => {
            const maxQty = plan.batches.reduce((max, b) => Math.max(max, b.batchQuantity), 1);
            plan.batches.forEach(batch => {
              const id = `PM-${plan.productCode}-${batch.batchNumber}`;
              if (!firstBatchId) firstBatchId = id;
              initialProductBatches.push({
                id,
                type: 'product',
                productCode: plan.productCode,
                productName: plan.productName,
                doughCode: batch.doughCode,
                doughName: batch.doughName,
                batchNumber: batch.batchNumber,
                originalBatchQuantity: batch.batchQuantity,
                originalTotalDoughWeightGrams: batch.totalDoughWeightGrams,
                doughDetails: batch.doughDetails,
                baseIngredients: batch.ingredients,
                currentBatchQuantity: batch.batchQuantity,
                maxBatchQuantity: maxQty,
                selectedMixerId: data.mixers?.[0]?.id
              });
            });
          });
        }
        
        initialProductBatches.sort((a, b) => {
          const doughCmp = a.doughCode.localeCompare(b.doughCode, 'en');
          if (doughCmp !== 0) return doughCmp;
          const prodCmp = a.productCode.localeCompare(b.productCode, 'en');
          if (prodCmp !== 0) return prodCmp;
          return a.batchNumber - b.batchNumber;
        });
        setFlatProductBatches(initialProductBatches);

        if (initialProductBatches.length > 0 && (!initialDoughBatches || initialDoughBatches.length === 0)) {
           firstBatchId = initialProductBatches[0].id;
        }

        setSelectedBatchId(firstBatchId);
      } else {
        setErrorMsg(data.error || 'エラーが発生しました');
      }
    } catch (e) {
      setErrorMsg('ネットワーク通信エラー');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    setTargetDate(newDate);
    fetchProductionPlan(newDate);
  };

  // 1日進める/戻すボタンハンドラ
  const shiftDate = (days: number) => {
    if (!targetDate) return;
    const current = new Date(targetDate);
    current.setDate(current.getDate() + days);
    
    // YYYY-MM-DD 形式にフォーマット (ローカルタイムゾーン考慮)
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const newDateStr = `${year}-${month}-${day}`;
    
    setTargetDate(newDateStr);
    fetchProductionPlan(newDateStr);
  };

  // ミキサーの選択時にバッチ上限を計算し直すハンドラ
  const handleMixerSelect = (batchId: string, doughCode: string, mixerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlanSet || executedBatchIds.includes(batchId)) return;
    setFlatBatches(prev => {
      const otherBatches = prev.filter(b => b.doughCode !== doughCode);
      const targetBatches = prev.filter(b => b.doughCode === doughCode).sort((a,b) => a.batchNumber - b.batchNumber);
      if (targetBatches.length === 0) return prev;
      
      const idx = targetBatches.findIndex(b => b.id === batchId);
      if (idx === -1) return prev;
      
      targetBatches[idx] = { ...targetBatches[idx], selectedMixerId: mixerId };
      
      const newBatches = [...otherBatches, ...normalizeBatches(targetBatches, mixers)];
      newBatches.sort((a, b) => {
        const doughCmp = a.doughCode.localeCompare(b.doughCode, 'en');
        if (doughCmp !== 0) return doughCmp;
        return a.batchNumber - b.batchNumber;
      });
      return newBatches;
    });
  };

  const handleProductMixerSelect = (batchId: string, productCode: string, mixerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlanSet || executedBatchIds.includes(batchId)) return;
    setFlatProductBatches(prev => {
      const otherBatches = prev.filter(b => b.productCode !== productCode);
      const targetBatches = prev.filter(b => b.productCode === productCode).sort((a,b) => a.batchNumber - b.batchNumber);
      if (targetBatches.length === 0) return prev;
      
      const idx = targetBatches.findIndex(b => b.id === batchId);
      if (idx === -1) return prev;
      
      targetBatches[idx] = { ...targetBatches[idx], selectedMixerId: mixerId };
      
      const newBatches = [...otherBatches, ...normalizeProductBatches(targetBatches, mixers)];
      newBatches.sort((a, b) => {
        const doughCmp = a.doughCode.localeCompare(b.doughCode, 'en');
        if (doughCmp !== 0) return doughCmp;
        const prodCmp = a.productCode.localeCompare(b.productCode, 'en');
        if (prodCmp !== 0) return prodCmp;
        return a.batchNumber - b.batchNumber;
      });
      return newBatches;
    });
  };

  // 粉量を1kg単位で増減させるロジック
  const adjustWeight = (id: string, doughCode: string, deltaKg: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setFlatBatches(prev => {
      const otherBatches = prev.filter(b => b.doughCode !== doughCode);
      const targetBatches = prev.filter(b => b.doughCode === doughCode).sort((a,b) => a.batchNumber - b.batchNumber);
      if (targetBatches.length === 0) return prev;
      
      const idx = targetBatches.findIndex(b => b.id === id);
      if (idx === -1) return prev;
      
      const deltaGrams = deltaKg * 1000;
      const originalValue = targetBatches[idx].currentFlourWeightGrams;
      targetBatches[idx] = { ...targetBatches[idx], currentFlourWeightGrams: originalValue + deltaGrams };
      
      if (idx !== targetBatches.length - 1) {
        let remaining = deltaGrams;
        for (let j = targetBatches.length - 1; j > idx; j--) {
          if (remaining === 0) break;
          const reduceAmount = Math.min(targetBatches[j].currentFlourWeightGrams, Math.max(0, remaining));
          if(remaining < 0) {
              const addAmount = Math.abs(remaining);
              targetBatches[j] = { ...targetBatches[j], currentFlourWeightGrams: targetBatches[j].currentFlourWeightGrams + addAmount };
              remaining += addAmount;
          } else {
              targetBatches[j] = { ...targetBatches[j], currentFlourWeightGrams: targetBatches[j].currentFlourWeightGrams - reduceAmount };
              remaining -= reduceAmount;
          }
        }
        if (remaining !== 0) {
          targetBatches[idx].currentFlourWeightGrams -= remaining;
        }
      }
      const newBatches = [...otherBatches, ...normalizeBatches(targetBatches, mixers)];
      newBatches.sort((a, b) => {
        const doughCmp = a.doughCode.localeCompare(b.doughCode, 'en');
        if (doughCmp !== 0) return doughCmp;
        return a.batchNumber - b.batchNumber;
      });
      return newBatches;
    });
  };

  // 指定した生地バッチを2つに分割するロジック（総生地量 >= 2kg の場合のみ）
  const splitDoughBatch = (id: string, doughCode: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlanSet || executedBatchIds.includes(id)) return;
    
    setFlatBatches(prev => {
      const otherBatches = prev.filter(b => b.doughCode !== doughCode);
      const targetBatches = prev.filter(b => b.doughCode === doughCode).sort((a,b) => a.batchNumber - b.batchNumber);
      if (targetBatches.length === 0) return prev;
      
      const idx = targetBatches.findIndex(b => b.id === id);
      if (idx === -1) return prev;
      
      const targetBatch = targetBatches[idx];
      const currentTotalWeightGrams = targetBatch.currentFlourWeightGrams * (targetBatch.totalBakersPercent / 100);
      
      // 2kg (2000g) 未満は分割不可
      if (currentTotalWeightGrams < 2000) return prev;
      
      // 半分の粉量を計算（少数切り捨て）
      const halfFlour = Math.floor(targetBatch.currentFlourWeightGrams / 2);
      const remainderFlour = targetBatch.currentFlourWeightGrams - halfFlour;
      
      // 元のバッチの粉量を半分に更新
      targetBatches[idx] = { ...targetBatch, currentFlourWeightGrams: halfFlour };
      
      // 新しいバッチを末尾に追加
      const maxBatchNum = Math.max(...targetBatches.map(b => b.batchNumber));
      const newBatchNum = maxBatchNum + 1;
      const newBatch: FlatBatch = {
        ...targetBatch,
        id: `${targetBatch.doughCode}-${newBatchNum}`,
        batchNumber: newBatchNum,
        currentFlourWeightGrams: remainderFlour
      };
      
      targetBatches.push(newBatch);
      
      const newBatches = [...otherBatches, ...targetBatches]; // normalizeは呼ばない
      
      newBatches.sort((a, b) => {
        const doughCmp = a.doughCode.localeCompare(b.doughCode, 'en');
        if (doughCmp !== 0) return doughCmp;
        return a.batchNumber - b.batchNumber;
      });
      
      return newBatches;
    });
  };

  // 総生地量を0.01kg(10g)単位で増減させるロジック
  const adjustTotalWeight = (id: string, doughCode: string, deltaTotalKg: number, totalBakersPercent: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setFlatBatches(prev => {
      const otherBatches = prev.filter(b => b.doughCode !== doughCode);
      const targetBatches = prev.filter(b => b.doughCode === doughCode).sort((a,b) => a.batchNumber - b.batchNumber);
      if (targetBatches.length === 0) return prev;
      
      const idx = targetBatches.findIndex(b => b.id === id);
      if (idx === -1) return prev;
      
      const deltaFlourGrams = (deltaTotalKg * 1000) / (totalBakersPercent / 100);
      const originalValue = targetBatches[idx].currentFlourWeightGrams;
      targetBatches[idx] = { ...targetBatches[idx], currentFlourWeightGrams: originalValue + deltaFlourGrams };
      
      if (idx !== targetBatches.length - 1) {
        let remaining = deltaFlourGrams;
        for (let j = targetBatches.length - 1; j > idx; j--) {
          if (remaining === 0) break;
          const reduceAmount = Math.min(targetBatches[j].currentFlourWeightGrams, Math.max(0, remaining));
          if(remaining < 0) {
              const addAmount = Math.abs(remaining);
              targetBatches[j] = { ...targetBatches[j], currentFlourWeightGrams: targetBatches[j].currentFlourWeightGrams + addAmount };
              remaining += addAmount;
          } else {
              targetBatches[j] = { ...targetBatches[j], currentFlourWeightGrams: targetBatches[j].currentFlourWeightGrams - reduceAmount };
              remaining -= reduceAmount;
          }
        }
        if (remaining !== 0) {
          targetBatches[idx].currentFlourWeightGrams -= remaining;
        }
      }
      const newBatches = [...otherBatches, ...normalizeBatches(targetBatches, mixers)];
      newBatches.sort((a, b) => {
        const doughCmp = a.doughCode.localeCompare(b.doughCode, 'en');
        if (doughCmp !== 0) return doughCmp;
        return a.batchNumber - b.batchNumber;
      });
      return newBatches;
    });
  };

  // 「Set」ボタン：現在の調整内容で本日の計画を確定・保存する
  const handleSetPlan = async () => {
    if (!targetDate) return;

    // ロックされている場合は解除するだけ（保存は上書きしない）
    if (isPlanSet) {
      setIsPlanSet(false);
      return;
    }

    if (!confirm('現在の調整内容で本日の計画を確定（Set）しますか？\n（確定すると日付を変えても内容が保持され、アジャスト操作がロックされます）')) return;
    
    try {
      const res = await fetch('/api/production/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: targetDate,
          flatBatches: flatBatches,
          flatProductBatches: flatProductBatches
        })
      });
      if (res.ok) {
        setIsPlanSet(true);
      } else {
        alert('保存に失敗しました。');
      }
    } catch (e) {
      alert('通信エラーが発生しました。');
    }
  };

  // 「Reset」ボタン：確定済みの計画を削除し、再計算する
  const handleResetPlan = async () => {
    if (!targetDate) return;
    if (!confirm('確定済みの計画を削除し、本日の注文データから再計算しますか？\n（チェック済みの実行記録もリセットされます！）')) return;
    
    try {
      const res = await fetch(`/api/production/plan?date=${targetDate}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setCheckedIngredients({});
        setIsPlanSet(false);
        fetchProductionPlan(targetDate);
      } else {
        alert('リセットに失敗しました。');
      }
    } catch (e) {
      alert('通信エラーが発生しました。');
    }
  };

  // 全一括実行（All done）ボタン
  const handleAllDone = async () => {
    if (!targetDate) return;
    if (!confirm('本日のすべてのバッチを一括で「実行済み」にしますか？\n(既に個別チェックされているものも含まれます)')) return;

    const exportBatches: { batchId: string, ingredients: any[] }[] = [];
    const newExecutedIds: string[] = [];
    const newCheckedState: Record<string, Record<string, boolean>> = { ...checkedIngredients };

    // 生地バッチの計算
    flatBatches.forEach(batch => {
      const flourBakersPercent = 100;
      const unCheckedIngredients = batch.baseIngredients.filter(ing => !checkedIngredients[batch.id]?.[ing.ingredientCode]);

      if (unCheckedIngredients.length > 0) {
        const ingredients = unCheckedIngredients.map(ing => ({
          ingredientCode: ing.ingredientCode,
          ingredientName: ing.ingredientName,
          requiredWeightGrams: Math.round(batch.currentFlourWeightGrams * (ing.bakersPercent / flourBakersPercent) * 10) / 10
        }));
        exportBatches.push({ batchId: batch.id, ingredients });
      } else if (batch.baseIngredients.length === 0 && !checkedIngredients[batch.id]?.['__NO_INGREDIENTS__']) {
        exportBatches.push({ batchId: batch.id, ingredients: [] });
      }

      newExecutedIds.push(batch.id);
      
      const checks: Record<string, boolean> = { ...(newCheckedState[batch.id] || {}) };
      if (batch.baseIngredients.length > 0) {
        batch.baseIngredients.forEach(ing => { checks[ing.ingredientCode] = true; });
      } else {
        checks['__NO_INGREDIENTS__'] = true;
      }
      newCheckedState[batch.id] = checks;
    });

    // 商品バッチの計算
    flatProductBatches.forEach(batch => {
      const safeOriginalQty = batch.originalBatchQuantity || 1;
      const unCheckedIngredients = batch.baseIngredients.filter(ing => !checkedIngredients[batch.id]?.[ing.ingredientCode]);

      if (unCheckedIngredients.length > 0) {
        const ingredients = unCheckedIngredients.map(ing => ({
          ingredientCode: ing.ingredientCode,
          ingredientName: ing.ingredientName,
          requiredWeightGrams: Math.round((ing.requiredWeightGrams / safeOriginalQty) * batch.currentBatchQuantity * 10) / 10
        }));
        exportBatches.push({ batchId: batch.id, ingredients });
      } else if (batch.baseIngredients.length === 0 && !checkedIngredients[batch.id]?.['__NO_INGREDIENTS__']) {
        exportBatches.push({ batchId: batch.id, ingredients: [] });
      }

      newExecutedIds.push(batch.id);

      const checks: Record<string, boolean> = { ...(newCheckedState[batch.id] || {}) };
      if (batch.baseIngredients.length > 0) {
        batch.baseIngredients.forEach(ing => { checks[ing.ingredientCode] = true; });
      } else {
        checks['__NO_INGREDIENTS__'] = true;
      }
      newCheckedState[batch.id] = checks;
    });

    try {
      const res = await fetch('/api/production/execute/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: targetDate,
          batches: exportBatches
        })
      });
      if (res.ok) {
        setExecutedBatchIds(Array.from(new Set([...executedBatchIds, ...newExecutedIds])));
        setCheckedIngredients(newCheckedState);
      } else {
         alert('一括実行に失敗しました。');
      }
    } catch (e) {
      alert('通信エラーが発生しました。');
    }
  };

  // Excel出力ボタン
  const handleExportExcel = () => {
    if (!targetDate) return;
    if (!isPlanSet) {
      alert('Excelを出力するには、先に「Set」ボタンで本日の計画を確定してください。');
      return;
    }
    // 別タブで開いてダウンロードさせる
    window.open(`/api/production/export?date=${targetDate}`, '_blank');
  };

  const toggleAllChecks = async (batchId: string, isCurrentlyAllChecked: boolean) => {
    let batch: FlatBatch | FlatProductBatch | undefined = flatBatches.find(b => b.id === batchId);
    let isProduct = false;
    let currentQty = 1;
    let currTotalFlour = 0;
    
    if (!batch) {
      batch = flatProductBatches.find(b => b.id === batchId);
      isProduct = true;
      currentQty = (batch as FlatProductBatch)?.currentBatchQuantity || 1;
    } else {
      currTotalFlour = (batch as FlatBatch)?.currentFlourWeightGrams || 0;
    }
    
    if (!batch) return;

    let calculatedIngredients = [];
    if (isProduct) {
      const b = batch as FlatProductBatch;
      const safeOriginalQty = b.originalBatchQuantity || 1;
      calculatedIngredients = b.baseIngredients.map(ing => ({
        ingredientCode: ing.ingredientCode,
        ingredientName: ing.ingredientName,
        requiredWeightGrams: Math.round((ing.requiredWeightGrams / safeOriginalQty) * currentQty * 10) / 10
      }));
    } else {
      const b = batch as FlatBatch;
      calculatedIngredients = b.baseIngredients.map(ing => ({
        ingredientCode: ing.ingredientCode,
        ingredientName: ing.ingredientName,
        requiredWeightGrams: Math.round(currTotalFlour * (ing.bakersPercent / 100) * 10) / 10
      }));
    }

    const newBatchChecks: Record<string, boolean> = {};
    if (batch.baseIngredients.length > 0) {
      batch.baseIngredients.forEach(ing => {
        newBatchChecks[ing.ingredientCode] = !isCurrentlyAllChecked;
      });
    } else {
      newBatchChecks['__NO_INGREDIENTS__'] = !isCurrentlyAllChecked;
    }

    setCheckedIngredients(prev => ({
      ...prev,
      [batchId]: newBatchChecks
    }));

    const wasExecuted = executedBatchIds.includes(batchId);
    
    if (!isCurrentlyAllChecked && !wasExecuted) {
      try {
        const res = await fetch('/api/production/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: targetDate,
            batchId: batchId,
            ingredients: calculatedIngredients
          })
        });
        if (res.ok) {
          setExecutedBatchIds(prev => [...prev, batchId]);
        }
      } catch(e) { console.error(e); }
    } else if (isCurrentlyAllChecked && wasExecuted) {
      try {
        const res = await fetch('/api/production/execute', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: targetDate,
            batchId: batchId
          })
        });
        if (res.ok) {
          setExecutedBatchIds(prev => prev.filter(id => id !== batchId));
        }
      } catch(e) { console.error(e); }
    }
  };

  const toggleIngredientCheck = async (batchId: string, ingredientCode: string) => {
    // 変更前の状態を取得
    const batchChecks = checkedIngredients[batchId] || {};
    const isCurrentlyChecked = !!batchChecks[ingredientCode];
    const newBatchChecks = { ...batchChecks, [ingredientCode]: !isCurrentlyChecked };
    
    // UIを即座に更新 (optimistic UI)
    setCheckedIngredients(prev => ({
      ...prev,
      [batchId]: newBatchChecks
    }));

    // 変更後の全材料チェック判定を行う
    let batch: FlatBatch | FlatProductBatch | undefined = flatBatches.find(b => b.id === batchId);
    let isProduct = false;
    let currentQty = 1;
    let currTotalFlour = 0;
    
    if (!batch) {
      batch = flatProductBatches.find(b => b.id === batchId);
      isProduct = true;
      currentQty = (batch as FlatProductBatch)?.currentBatchQuantity || 1;
    } else {
      currTotalFlour = (batch as FlatBatch)?.currentFlourWeightGrams || 0;
    }
    
    if (!batch) return;

    // 現在の計算された材料リストを生成 (UI上のグラム数と同じ量)
    let calculatedIngredients = [];
    if (isProduct) {
      const b = batch as FlatProductBatch;
      const safeOriginalQty = b.originalBatchQuantity || 1;
      calculatedIngredients = b.baseIngredients.map(ing => {
        const perItemWeight = ing.requiredWeightGrams / safeOriginalQty;
        return {
          ingredientCode: ing.ingredientCode,
          ingredientName: ing.ingredientName,
          requiredWeightGrams: Math.round(perItemWeight * currentQty * 10) / 10
        };
      });
    } else {
      const b = batch as FlatBatch;
      calculatedIngredients = b.baseIngredients.map(ing => {
        const requiredWeight = currTotalFlour * (ing.bakersPercent / 100);
        return {
          ingredientCode: ing.ingredientCode,
          ingredientName: ing.ingredientName,
          requiredWeightGrams: Math.round(requiredWeight * 10) / 10
        };
      });
    }

    const allCheckedNow = calculatedIngredients.length > 0 && calculatedIngredients.every(ing => newBatchChecks[ing.ingredientCode]);
    const wasExecuted = executedBatchIds.includes(batchId);

    // 対象の材料の情報を探す
    const targetIng = calculatedIngredients.find(ing => ing.ingredientCode === ingredientCode);
    
    if (targetIng) {
      if (!isCurrentlyChecked) {
        // チェックをつけた場合、その材料だけ POST する
        try {
          await fetch('/api/production/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date: targetDate,
              batchId: batchId,
              ingredients: [targetIng]
            })
          });
        } catch(e) { console.error(e); }
      } else {
        // チェックを外した場合、その材料だけ DELETE する
        try {
          await fetch(`/api/production/execute?date=${targetDate}&batchId=${batchId}&ingredientCode=${ingredientCode}`, {
            method: 'DELETE',
          });
        } catch(e) { console.error(e); }
      }
    }

    // UI上のバッチ全体実行済みフラグ（緑の帯など）の制御
    if (allCheckedNow && !wasExecuted) {
      setExecutedBatchIds(prev => [...prev, batchId]);
    } else if (!allCheckedNow && wasExecuted) {
      setExecutedBatchIds(prev => prev.filter(id => id !== batchId));
    }
  };

  const toggleMixingExecution = async (batchId: string, isRevert: boolean = false) => {
    try {
      if (isRevert) {
        if (!confirm('ミキシングの実行記録を取り消しますか？')) return;
        const res = await fetch(`/api/production/mixing?date=${targetDate}&batchId=${batchId}`, {
          method: 'DELETE'
        });
        if (!res.ok) throw new Error('Failed to revert mixing');
        setMixingExecutionTimes(prev => {
          const next = { ...prev };
          delete next[batchId];
          return next;
        });
      } else {
        const res = await fetch('/api/production/mixing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: targetDate, batchId })
        });
        if (!res.ok) throw new Error('Failed to record mixing');
        // 簡単のためローカルで現在時刻をセット（正確にはサーバーからの返り値を使うべきだが即時反映優先）
        const nowStr = new Date().toISOString();
        setMixingExecutionTimes(prev => ({ ...prev, [batchId]: nowStr }));
      }
    } catch (e) {
      console.error(e);
      alert('ミキシング記録の更新に失敗しました。');
    }
  };

  // 副材料仕込みの個数を1個単位で増減させるロジック
  const adjustProductQuantity = (id: string, productCode: string, deltaQty: number, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // 生地重量連動のため、対象バッチの生地情報を事前取得
    const targetBatch = flatProductBatches.find(b => b.id === id);
    if (!targetBatch) return;
    const targetDoughDetails = targetBatch.doughDetails;

    setFlatProductBatches(prev => {
      const otherBatches = prev.filter(b => b.productCode !== productCode);
      const targetBatches = prev.filter(b => b.productCode === productCode).sort((a,b) => a.batchNumber - b.batchNumber);
      if (targetBatches.length === 0) return prev;
      
      const idx = targetBatches.findIndex(b => b.id === id);
      if (idx === -1) return prev;
      
      const originalValue = targetBatches[idx].currentBatchQuantity;
      targetBatches[idx] = { ...targetBatches[idx], currentBatchQuantity: originalValue + deltaQty };
      
      if (idx !== targetBatches.length - 1) {
        let remaining = deltaQty;
        for (let j = targetBatches.length - 1; j > idx; j--) {
          if (remaining === 0) break;
          const reduceAmount = Math.min(targetBatches[j].currentBatchQuantity, Math.max(0, remaining));
          if(remaining < 0) {
              const addAmount = Math.abs(remaining);
              targetBatches[j] = { ...targetBatches[j], currentBatchQuantity: targetBatches[j].currentBatchQuantity + addAmount };
              remaining += addAmount;
          } else {
              targetBatches[j] = { ...targetBatches[j], currentBatchQuantity: targetBatches[j].currentBatchQuantity - reduceAmount };
              remaining -= reduceAmount;
          }
        }
        if (remaining !== 0) {
          targetBatches[idx].currentBatchQuantity -= remaining;
        }
      }
      const newBatches = [...otherBatches, ...normalizeProductBatches(targetBatches, mixers)];
      newBatches.sort((a, b) => {
        const doughCmp = a.doughCode.localeCompare(b.doughCode, 'en');
        if (doughCmp !== 0) return doughCmp;
        const prodCmp = a.productCode.localeCompare(b.productCode, 'en');
        if (prodCmp !== 0) return prodCmp;
        return a.batchNumber - b.batchNumber;
      });
      return newBatches;
    });

    // 大元の生地の総量も連動して増減させる
    if (targetDoughDetails && targetDoughDetails.length > 0) {
      setFlatBatches(prevFlatBatches => {
        let updatedBatches = [...prevFlatBatches];
        
        targetDoughDetails.forEach(detail => {
          if (!detail.amountPerItem) return;
          const deltaGrams = detail.amountPerItem * deltaQty;
          
          const doughBatches = updatedBatches.filter(b => b.doughCode === detail.doughCode).sort((a,b) => a.batchNumber - b.batchNumber);
          if (doughBatches.length === 0) return;
          
          const totalBP = doughBatches[0].totalBakersPercent;
          const deltaFlourGrams = deltaGrams / (totalBP / 100);
          
          // この生地の最後のバッチに増減分を適用
          const lastBatchId = doughBatches[doughBatches.length - 1].id;
          const lastBatchIdx = updatedBatches.findIndex(b => b.id === lastBatchId);
          if (lastBatchIdx !== -1) {
            updatedBatches[lastBatchIdx] = {
              ...updatedBatches[lastBatchIdx],
              currentFlourWeightGrams: updatedBatches[lastBatchIdx].currentFlourWeightGrams + deltaFlourGrams
            };
          }
          
          // この生地の再正規化（ミキサー容量オーバー時は分割される）
          const otherDoughBatches = updatedBatches.filter(b => b.doughCode !== detail.doughCode);
          const targetDoughBatches = updatedBatches.filter(b => b.doughCode === detail.doughCode).sort((a,b) => a.batchNumber - b.batchNumber);
          const normalizedDoughBatches = normalizeBatches(targetDoughBatches, mixers);
          updatedBatches = [...otherDoughBatches, ...normalizedDoughBatches];
        });
        
        // 順番を保持
        updatedBatches.sort((a, b) => {
          const doughCmp = a.doughCode.localeCompare(b.doughCode, 'en');
          if (doughCmp !== 0) return doughCmp;
          return a.batchNumber - b.batchNumber;
        });
        
        return updatedBatches;
      });
    }
  };

  // 現在選択されているバッチの詳細データを構築
  const selectedBatchDetail = useMemo(() => {
    if (!selectedBatchId) return null;
    
    const isProduct = selectedBatchId.startsWith('PM-') || selectedBatchId.startsWith('ADD-P-');

    if (isProduct) {
      const batchInfo = flatProductBatches.find(b => b.id === selectedBatchId);
      if (!batchInfo) return null;

      const currentQty = batchInfo.currentBatchQuantity;
      const safeOriginalQty = batchInfo.originalBatchQuantity || 1;

      // 現在の個数に合わせてグラム数を再計算
      const recalculatedIngredients = batchInfo.baseIngredients.map(ing => {
        const perItemWeight = ing.requiredWeightGrams / safeOriginalQty;
        return {
          ...ing,
          requiredWeightGrams: Math.round(perItemWeight * currentQty * 10) / 10
        };
      });

      const perItemDoughWeight = batchInfo.originalTotalDoughWeightGrams / safeOriginalQty;
      const currentTotalDoughWeightGrams = Math.round(perItemDoughWeight * currentQty * 10) / 10;

      return {
        ...batchInfo,
        type: 'product' as const,
        currentQty,
        currentTotalDoughWeightGrams,
        ingredients: recalculatedIngredients
      };
    } else {
      const batchInfo = flatBatches.find(b => b.id === selectedBatchId);
      if (!batchInfo) return null;

      const currentFlourWeightGrams = batchInfo.currentFlourWeightGrams;

      // 現在の粉重量に合わせて各材料のグラム数を再計算
      const flourBakersPercent = 100;
      
      const recalculatedIngredients = batchInfo.baseIngredients.map(ing => {
        const requiredWeight = currentFlourWeightGrams * (ing.bakersPercent / flourBakersPercent);
        return {
          ...ing,
          requiredWeightGrams: Math.round(requiredWeight * 10) / 10
        };
      });

      // 再計算後の総生地量
      const currentTotalWeightGrams = currentFlourWeightGrams * (batchInfo.totalBakersPercent / flourBakersPercent);

      return {
        ...batchInfo,
        type: 'dough' as const,
        currentFlourWeightGrams,
        currentTotalWeightGrams,
        ingredients: recalculatedIngredients
      };
    }
  }, [selectedBatchId, flatBatches, flatProductBatches]);

  // フォーマット用ユーティリティ
  const formatKg = (g: number) => {
    return (g / 1000).toFixed(0); // リスト用は小数点除外(デザイン合わせ)
  };
  
  // 小数第1位まで表示。小数部分がない場合は整数のみ表示（例: 100.0g → 100g, 15.3g → 15.3g）
  const fmtG = (g: number) => {
    const rounded = Math.round(g * 10) / 10;
    return Number.isInteger(rounded) ? rounded.toLocaleString() : rounded.toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  };

  const formatDetailWeight = (g: number) => {
    if (g >= 1000) {
      return `${(g / 1000).toFixed(2)}`;
    }
    return fmtG(g);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100 dark:bg-slate-900">
      {/* 画面ヘッダー部 */}
      <div className="flex-none flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-800 p-4 sm:px-8 border-b border-slate-200 dark:border-slate-700 shadow-sm z-10">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-3 text-slate-800 dark:text-slate-100">
            <span className="text-3xl text-amber-500">🥣</span> 本日の仕込み（{flatBatches.length + flatProductBatches.filter(b => b.baseIngredients && b.baseIngredients.length > 0).length}回）
          </h2>
        </div>
        
        <div className="flex flex-wrap gap-2 sm:gap-4 w-full sm:w-auto items-center justify-start sm:justify-end">
          
          {/* ボタン群をラップするコンテナでスマホ時に折り返しを制御 */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-700 pb-2 sm:pb-0 sm:pr-4">
            {/* Set / Reset ボタン */}
            <div className="flex items-center gap-2">
              <button 
                onClick={handleSetPlan}
                className={`px-3 sm:px-4 py-2 text-white font-bold rounded-lg shadow-md transition-all flex items-center gap-1 sm:gap-2 transform active:scale-95 text-sm sm:text-base ${
                  isPlanSet ? "bg-slate-500 hover:bg-slate-600" : "bg-amber-500 hover:bg-amber-600"
                }`}
                title={isPlanSet ? "ロックを解除して数量を再調整します" : "現在のバッチ数量で本日の計画を確定・ロックします"}
              >
                {isPlanSet ? '🔓 Unlock' : '💾 Set'}
              </button>
              <button 
                onClick={handleResetPlan}
                className="px-2 sm:px-3 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1 sm:gap-2 text-sm sm:text-base"
                title="計画をリセットし、注文データから再計算します"
              >
                🔄 Reset
              </button>
              {/* 追加仕込みボタン */}
              <button 
                onClick={handleOpenAddModal}
                className="px-2 sm:px-3 py-2 bg-black hover:bg-slate-800 text-[#ADFF2F] font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1 sm:gap-2 transform active:scale-95 text-sm sm:text-base border border-[#ADFF2F]/30"
                title="緊急で追加仕込みを行います"
              >
                ⚠️ 追加仕込み
              </button>
            </div>

            {/* 新規追加：一括実行 / Excel出力 */}
            <div className="flex items-center gap-2">
              <button 
                onClick={handleAllDone}
                className="px-2 sm:px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1 sm:gap-2 transform active:scale-95 text-sm sm:text-base"
                title="表示されているすべてのバッチを一括で実行済み（チェック完了）にします"
              >
                ✅ All done
              </button>
              <button 
                disabled={!isPlanSet}
                onClick={handleExportExcel}
                className={`px-2 sm:px-3 py-2 font-bold rounded-lg shadow-sm flex items-center gap-1 sm:gap-2 transition-all text-sm sm:text-base ${
                  isPlanSet 
                    ? "bg-blue-500 hover:bg-blue-600 text-white cursor-pointer transform active:scale-95" 
                    : "bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed opacity-60"
                }`}
                title={isPlanSet ? "この内容で詳細エクセルを出力します" : "エクセルを出力するには、先に「Set」して確定してください"}
              >
                📊 Excel出力
              </button>
            </div>
          </div>

          {/* カレンダー・戻るボタン */}
          <div className="flex items-center justify-between w-full sm:w-auto gap-2">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 rounded-xl p-1 border border-slate-300 dark:border-slate-600 focus-within:border-amber-500 transition-colors flex-1 sm:flex-none">
              <button 
                onClick={() => shiftDate(-1)}
                className="px-2 sm:px-3 py-1 sm:py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors font-bold flex items-center justify-center"
                aria-label="前日へ"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
              </button>
              <input 
                type="date" 
                value={targetDate} 
                onChange={handleDateChange} 
                
                className="px-1 sm:px-2 py-1 bg-transparent text-base sm:text-lg font-bold text-slate-700 dark:text-slate-200 outline-none w-full sm:w-auto text-center [color-scheme:light] dark:[color-scheme:dark]"
              />
              <button 
                onClick={() => shiftDate(1)}
                className="px-2 sm:px-3 py-1 sm:py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors font-bold flex items-center justify-center"
                aria-label="翌日へ"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
              </button>
            </div>
            <Link href="/" className="shrink-0 px-3 sm:px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-xl text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 font-bold transition-colors text-sm sm:text-base">
              🏠 戻る
            </Link>
          </div>
        </div>
      </div>

      {/* メインコンテンツエリア */}
      <div className="flex-1 overflow-hidden flex flex-col sm:flex-row text-slate-800 dark:text-slate-100">
        
        {/* ローディング・エラー・データなし時の表示 */}
        {isLoading && (
          <div className="flex w-full justify-center items-center">
            <div className="animate-spin text-6xl">🔄</div>
            <span className="text-2xl ml-4 font-bold text-slate-600 dark:text-slate-300">計算中...</span>
          </div>
        )}
        
        {errorMsg && !isLoading && (
          <div className="w-full flex justify-center items-center p-8">
            <div className="bg-red-100 border-l-8 border-red-500 text-red-700 p-6 rounded-lg text-xl font-bold max-w-2xl w-full">
              <span className="text-3xl mr-3">⚠️</span> {errorMsg}
            </div>
          </div>
        )}

        {!isLoading && productionData && productionData.message && !productionData.productionPlan?.length && (
          <div className="w-full flex justify-center items-center p-8">
            <div className="bg-amber-50 border-4 border-dashed border-amber-300 text-amber-800 p-12 text-center rounded-2xl max-w-2xl w-full">
               <span className="text-6xl block mb-4">📭</span>
               <p className="text-2xl font-bold">指定日の注文データが見つかりません</p>
               <p className="text-lg mt-2 opacity-80">
                 先に「注文データのインポート」から本日のExcelを読み込んでください。
               </p>
            </div>
          </div>
        )}

        {/* 2ペインレイアウト (データがある場合のみ) */}
        {!isLoading && flatBatches.length > 0 && (
          <>
            {/* 左ペイン：バッチリスト */}
            <div className="w-full sm:w-1/3 md:w-80 lg:w-96 flex-none bg-slate-200/50 dark:bg-slate-800/50 border-r border-slate-200 dark:border-slate-700 overflow-y-auto p-4 space-y-4 shadow-inner">
              {flatBatches.map(batch => {
                const isSelected = selectedBatchId === batch.id;
                const currentFlourWeight = batch.currentFlourWeightGrams;
                
                // このバッチがすべて完了状態かチェック
                const batchChecks = checkedIngredients[batch.id] || {};
                const isAllChecked = batch.baseIngredients.length > 0 && batch.baseIngredients.every(ing => batchChecks[ing.ingredientCode]);
                
                // 生地の総量逸脱チェック（色付け用）
                const doughBatches = flatBatches.filter(b => b.doughCode === batch.doughCode);
                let sysTotalFlour = 0;
                let orgTotalFlour = 0;
                doughBatches.forEach(b => {
                  sysTotalFlour += b.currentFlourWeightGrams;
                  orgTotalFlour += b.originalFlourWeightGrams;
                });
                
                // 誤差による色付きを防ぐため1gより大きい差分のみ判定
                const diff = sysTotalFlour - orgTotalFlour;
                const isExecuted = executedBatchIds.includes(batch.id);

                // 現在の総生地量
                const currentTotalWeight = currentFlourWeight * (batch.totalBakersPercent / 100);
                
                return (
                  <div 
                    key={batch.id} 
                    onClick={() => setSelectedBatchId(batch.id)}
                    className={`
                      cursor-pointer rounded-xl px-3 py-2.5 transition-all duration-200 flex flex-col relative overflow-hidden border-l-4 mb-2
                      ${isExecuted 
                        ? (isSelected 
                           ? 'border-emerald-500 bg-slate-100 dark:bg-slate-700 shadow-md scale-[1.01]' 
                           : 'border-l-emerald-500 border-y border-r border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20') 
                        : 'border-l-amber-500'}
                      ${!isExecuted && isAllChecked ? 'opacity-40 grayscale' : ''}
                      ${!isExecuted && isSelected
                        ? 'bg-slate-200 dark:bg-slate-700 shadow-lg scale-[1.01] border-y border-r border-amber-500' 
                        : !isExecuted ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-y border-r border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 shadow-sm' : ''}
                    `}
                  >
                    {/* 実行済みバッジ */}
                    {isExecuted && (
                      <div className="absolute top-0 right-0 bg-white text-slate-900 border border-slate-300 font-bold text-[10px] px-2 py-0.5 rounded-bl-lg shadow-sm z-10 dark:bg-slate-800 dark:text-white dark:border-slate-600">
                        計量済
                      </div>
                    )}
                    
                    {/* 1段目: ヘッダーエリア */}
                    <div className="flex items-start gap-2 mb-2 pr-16">
                      <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-500">
                        {batch.doughCode}
                      </span>
                      <span className="font-bold text-base leading-tight break-all text-amber-600 dark:text-amber-500">{batch.doughName}</span>
                      {batch.isAdditional && (
                        <span className="ml-2 text-xs font-bold px-1.5 py-0.5 rounded bg-black/40 text-[#ADFF2F] border border-[#ADFF2F]/50">
                          {batch.isRemake ? '再仕込み' : '追加オーダー'}
                        </span>
                      )}
                    </div>

                    {/* 2段目: 情報エリア */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className="flex flex-col items-center justify-center w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-500 font-black text-sm shadow-inner">
                          {batch.batchNumber}
                        </div>
                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-500">回目</span>
                        
                        <div className="flex gap-1 ml-1">
                          {mixers.map(m => (
                            <button 
                              key={m.id}
                              disabled={isExecuted || isPlanSet}
                              onClick={(e) => handleMixerSelect(batch.id, batch.doughCode, m.id, e)}
                              className={`w-7 h-7 p-0.5 flex-shrink-0 rounded-md border-2 transition-all ${(isExecuted || isPlanSet) ? 'opacity-30 cursor-not-allowed' : ''} ${batch.selectedMixerId === m.id ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/30 shadow-[0_0_8px_rgba(245,158,11,0.5)] scale-110 z-10' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 opacity-50 hover:opacity-100'}`}
                              title={`${m.name} (上限 ${m.max_capacity_kg}kg)`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={`/${m.icon}`} alt={m.name} className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display='none'; e.currentTarget.parentElement!.innerHTML = '<span class="text-[10px]">🔄</span>'; }}/>
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-1.5">
                        <div className="flex flex-col items-end">
                          <span className="text-[9px] font-bold uppercase tracking-widest leading-none mb-0.5 text-amber-600 dark:text-amber-500">粉量</span>
                          <div className="text-base font-black tracking-tight leading-none text-amber-600 dark:text-amber-500 mb-1">
                            {(currentFlourWeight / 1000).toFixed(0)}<span className="text-[9px] font-bold ml-0.5 opacity-80">kg</span>
                          </div>
                          {!isExecuted && !isPlanSet && (
                            <div className="flex bg-slate-100 border border-slate-300 rounded overflow-hidden">
                              <AutoRepeatButton 
                                onAction={(e: any) => adjustWeight(batch.id, batch.doughCode, 1, e)}
                                disabled={isExecuted || isPlanSet}
                                className={`px-1.5 py-0.5 transition-colors border-r ${isSelected ? 'hover:bg-amber-200 active:bg-amber-300 text-amber-800 border-amber-200' : 'hover:bg-slate-300 active:bg-slate-400 text-slate-700 border-slate-300'}`}
                              >
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd"></path></svg>
                              </AutoRepeatButton>
                              <AutoRepeatButton 
                                onAction={(e: any) => adjustWeight(batch.id, batch.doughCode, -1, e)}
                                disabled={isExecuted || isPlanSet}
                                className={`px-1.5 py-0.5 transition-colors ${isSelected ? 'hover:bg-amber-200 active:bg-amber-300 text-amber-800' : 'hover:bg-slate-300 active:bg-slate-400 text-slate-700'}`}
                              >
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" clipRule="evenodd"></path></svg>
                              </AutoRepeatButton>
                            </div>
                          )}
                        </div>
                        <span className="text-sm text-slate-300 dark:text-slate-600 font-light mt-2">/</span>
                        <div className="flex flex-col items-end">
                          <span className="text-[9px] font-bold uppercase tracking-widest leading-none mb-0.5 text-amber-600 dark:text-amber-500">総生地量</span>
                          <div className="text-lg font-black tracking-tight leading-none text-amber-600 dark:text-amber-500 mb-1">
                            {(currentTotalWeight / 1000).toFixed(2)}<span className="text-[9px] font-bold ml-0.5 opacity-80">kg</span>
                          </div>
                          {!isExecuted && !isPlanSet && (
                            <div className="flex bg-slate-100 border border-slate-300 rounded overflow-hidden">
                              <AutoRepeatButton 
                                onAction={(e: any) => adjustTotalWeight(batch.id, batch.doughCode, 0.01, batch.totalBakersPercent, e)}
                                disabled={isExecuted || isPlanSet}
                                className={`px-1.5 py-0.5 transition-colors border-r ${isSelected ? 'hover:bg-amber-200 active:bg-amber-300 text-amber-800 border-amber-200' : 'hover:bg-slate-300 active:bg-slate-400 text-slate-700 border-slate-300'}`}
                              >
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd"></path></svg>
                              </AutoRepeatButton>
                              <AutoRepeatButton 
                                onAction={(e: any) => adjustTotalWeight(batch.id, batch.doughCode, -0.01, batch.totalBakersPercent, e)}
                                disabled={isExecuted || isPlanSet}
                                className={`px-1.5 py-0.5 transition-colors ${isSelected ? 'hover:bg-amber-200 active:bg-amber-300 text-amber-800' : 'hover:bg-slate-300 active:bg-slate-400 text-slate-700'}`}
                              >
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" clipRule="evenodd"></path></svg>
                              </AutoRepeatButton>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 3段目: アクションエリア */}
                    <div className="flex items-center justify-start gap-2 pt-2 border-t border-amber-200 dark:border-amber-700/50">
                      {isExecuted && (
                        mixingExecutionTimes[batch.id] ? (
                          <div 
                            className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded shadow-inner border border-indigo-200 flex items-center gap-1 cursor-pointer hover:bg-indigo-100 transition-colors" 
                            onClick={(e) => { e.stopPropagation(); toggleMixingExecution(batch.id, true); }}
                            title="クリックで取り消し"
                          >
                            🔄 済 ({new Date(mixingExecutionTimes[batch.id]).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })})
                          </div>
                        ) : (
                          <button 
                            onClick={(e) => { e.stopPropagation(); toggleMixingExecution(batch.id, false); }}
                            className="text-[10px] font-bold text-white bg-indigo-500 hover:bg-indigo-600 px-3 py-1 rounded shadow-md transition-colors"
                          >
                            ミキシング実行
                          </button>
                        )
                      )}
                      {currentTotalWeight >= 2000 && !isExecuted && !isPlanSet && (
                        <button
                          onClick={(e) => splitDoughBatch(batch.id, batch.doughCode, e)}
                          className="px-2 py-1 rounded bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-700 border border-slate-300 hover:border-amber-300 transition-colors text-[10px] font-bold"
                        >
                          半分に分割
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* === 副材料仕込み（Product Mixing）のリスト === */}
              {flatProductBatches.length > 0 && (
                <div className="mt-8 mb-2 border-t-2 border-slate-300 dark:border-slate-600 pt-6">
                  <h3 className="text-xl font-bold flex items-center gap-2 mb-4 text-amber-700 dark:text-amber-500">
                    <span className="text-2xl">🥐</span> 副材料仕込み
                  </h3>
                  <div className="space-y-4">
                  {flatProductBatches.map(batch => {
                    const isSelected = selectedBatchId === batch.id;
                    const currentQty = batch.currentBatchQuantity;
                    
                    const batchChecks = checkedIngredients[batch.id] || {};
                    const isAllChecked = batch.baseIngredients.length > 0 && batch.baseIngredients.every(ing => batchChecks[ing.ingredientCode]);
                    
                    const isExecuted = executedBatchIds.includes(batch.id);
                    const prodBatches = flatProductBatches.filter(b => b.productCode === batch.productCode);
                    let sysTotalQty = 0;
                    let orgTotalQty = 0;
                    prodBatches.forEach(b => {
                      sysTotalQty += b.currentBatchQuantity;
                      orgTotalQty += b.originalBatchQuantity;
                    });
                    
                    const diff = sysTotalQty - orgTotalQty;

                    return (
                      <div 
                        key={batch.id} 
                        onClick={() => setSelectedBatchId(batch.id)}
                        className={`
                          cursor-pointer rounded-xl px-3 py-2.5 transition-all duration-200 flex flex-col relative overflow-hidden border-l-4 mb-2
                          ${isExecuted 
                            ? (isSelected 
                               ? 'border-emerald-500 bg-slate-100 dark:bg-slate-700 shadow-md scale-[1.01]' 
                               : 'border-l-emerald-500 border-y border-r border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20') 
                            : 'border-l-emerald-500'}
                          ${!isExecuted && isAllChecked ? 'opacity-40 grayscale' : ''}
                          ${!isExecuted && isSelected
                            ? 'bg-slate-200 dark:bg-slate-700 shadow-lg scale-[1.01] border-y border-r border-emerald-500' 
                            : !isExecuted ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-y border-r border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 shadow-sm' : ''}
                        `}
                      >
                        {/* 実行済みバッジ */}
                        {isExecuted && (
                          <div className="absolute top-0 right-0 bg-white text-slate-900 border border-slate-300 font-bold text-[10px] px-2 py-0.5 rounded-bl-lg shadow-sm z-10 dark:bg-slate-800 dark:text-white dark:border-slate-600">
                            計量済
                          </div>
                        )}
                        
                        {/* 1段目: ヘッダーエリア */}
                        <div className="flex items-start gap-2 mb-2 pr-16">
                          <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-500">
                            {batch.productCode}
                          </span>
                          <span className="font-bold text-base leading-tight break-all text-emerald-600 dark:text-emerald-500">{batch.productName}</span>
                          {batch.isAdditional && (
                            <span className="ml-2 text-xs font-bold px-1.5 py-0.5 rounded bg-black/40 text-[#ADFF2F] border border-[#ADFF2F]/50">
                              {batch.isRemake ? '再仕込み' : '追加オーダー'}
                            </span>
                          )}
                        </div>

                        {/* 2段目: 情報エリア */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-1.5 mt-1">
                            <div className="flex flex-col items-center justify-center w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-500 font-black text-sm shadow-inner">
                              {batch.batchNumber}
                            </div>
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-500">回目</span>
                            
                            {/* 内訳ボタン */}
                            <button
                              onClick={(e) => handleShowBreakdown(e, batch.productCode, batch.productName)}
                              className="ml-1 px-1.5 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:hover:bg-indigo-800/60 dark:text-indigo-300 text-[10px] font-bold rounded flex items-center gap-1 border border-indigo-200 dark:border-indigo-700 transition-colors"
                            >
                              📋 内訳
                            </button>
                            
                            <div className="flex gap-1 ml-1.5">
                              {mixers.map(m => (
                                <button 
                                  key={m.id}
                                  disabled={isExecuted || isPlanSet}
                                  onClick={(e) => handleProductMixerSelect(batch.id, batch.productCode, m.id, e)}
                                  className={`w-7 h-7 p-0.5 flex-shrink-0 rounded-md border-2 transition-all ${(isExecuted || isPlanSet) ? 'opacity-30 cursor-not-allowed' : ''} ${batch.selectedMixerId === m.id ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/30 shadow-[0_0_8px_rgba(245,158,11,0.5)] scale-110 z-10' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 opacity-50 hover:opacity-100'}`}
                                  title={`${m.name} (上限 ${m.max_capacity_kg}kg)`}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={`/${m.icon}`} alt={m.name} className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display='none'; e.currentTarget.parentElement!.innerHTML = '<span class="text-[10px]">🔄</span>'; }}/>
                                </button>
                              ))}
                            </div>
                          </div>
                          
                          <div className="flex items-start gap-1.5">
                            <div className="flex flex-col items-end">
                              <span className="text-[9px] font-bold uppercase tracking-widest leading-none mb-0.5 text-emerald-600 dark:text-emerald-500">バッチ</span>
                              <div className="text-base font-black tracking-tight leading-none text-emerald-600 dark:text-emerald-500 mb-1">
                                {currentQty}<span className="text-[9px] font-bold ml-0.5 opacity-80">個</span>
                              </div>
                              {!isExecuted && !isPlanSet && (
                                <div className="flex bg-slate-100 border border-slate-300 rounded overflow-hidden">
                                  <AutoRepeatButton 
                                    onAction={(e: any) => adjustProductQuantity(batch.id, batch.productCode, 1, e)}
                                    disabled={isExecuted || isPlanSet}
                                    className={`px-1.5 py-0.5 transition-colors border-r ${isSelected ? 'hover:bg-amber-200 active:bg-amber-300 text-amber-800 border-amber-200' : 'hover:bg-slate-300 active:bg-slate-400 text-slate-700 border-slate-300'}`}
                                  >
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd"></path></svg>
                                  </AutoRepeatButton>
                                  <AutoRepeatButton 
                                    onAction={(e: any) => adjustProductQuantity(batch.id, batch.productCode, -1, e)}
                                    disabled={isExecuted || isPlanSet}
                                    className={`px-1.5 py-0.5 transition-colors ${isSelected ? 'hover:bg-amber-200 active:bg-amber-300 text-amber-800' : 'hover:bg-slate-300 active:bg-slate-400 text-slate-700'}`}
                                  >
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" clipRule="evenodd"></path></svg>
                                  </AutoRepeatButton>
                                </div>
                              )}
                            </div>
                            <span className="text-sm text-slate-300 dark:text-slate-600 font-light mt-2">/</span>
                            <div className="flex flex-col items-end">
                              <span className="text-[9px] font-bold uppercase tracking-widest leading-none mb-0.5 text-emerald-600 dark:text-emerald-500">オーダー累計</span>
                              <div className="text-lg font-black tracking-tight leading-none text-emerald-600 dark:text-emerald-500">
                                {batch.originalBatchQuantity}<span className="text-[9px] font-bold ml-0.5 opacity-80">個</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 3段目: アクションエリア */}
                        <div className="flex items-center justify-start gap-2 pt-2 border-t border-emerald-200 dark:border-emerald-700/50">
                          {isExecuted && (
                            mixingExecutionTimes[batch.id] ? (
                              <div 
                                className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded shadow-inner border border-indigo-200 flex items-center gap-1 cursor-pointer hover:bg-indigo-100 transition-colors" 
                                onClick={(e) => { e.stopPropagation(); toggleMixingExecution(batch.id, true); }}
                                title="クリックで取り消し"
                              >
                                🔄 済 ({new Date(mixingExecutionTimes[batch.id]).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })})
                              </div>
                            ) : (
                              <button 
                                onClick={(e) => { e.stopPropagation(); toggleMixingExecution(batch.id, false); }}
                                className="text-[10px] font-bold text-white bg-indigo-500 hover:bg-indigo-600 px-3 py-1 rounded shadow-md transition-colors"
                              >
                                ミキシング実行
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              )}
            </div>

            {/* 発注元内訳モーダル */}
            {breakdownModal.isOpen && (
              <div
                className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
                onClick={() => setBreakdownModal(prev => ({ ...prev, isOpen: false }))}
              >
                <div
                  className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700 overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* モーダルヘッダー */}
                  <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold opacity-80 tracking-wider mb-0.5">{breakdownModal.productCode}</div>
                      <h3 className="text-xl font-black">📋 {breakdownModal.productName}</h3>
                    </div>
                    <button
                      onClick={() => setBreakdownModal(prev => ({ ...prev, isOpen: false }))}
                      className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors font-bold text-lg"
                    >
                      ×
                    </button>
                  </div>

                  {/* モーダルボディ */}
                  <div className="p-6">
                    {breakdownModal.isLoading ? (
                      <div className="flex items-center justify-center py-8 gap-3">
                        <div className="animate-spin text-3xl">🔄</div>
                        <span className="text-slate-500 font-bold">読み込み中...</span>
                      </div>
                    ) : breakdownModal.items.length === 0 ? (
                      <div className="text-center py-8">
                        <div className="text-4xl mb-3">💭</div>
                        <p className="text-slate-500 font-bold">内訳データがありません</p>
                        <p className="text-sm text-slate-400 mt-2">
                          発注元内訳は、Excelインポート時にD列以降に発注元別数量が記載されている場合に表示されます。同じExcelを再インポートすると内訳データが保存されます。
                        </p>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">発注元内訳</p>
                        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                          {breakdownModal.items.map((item, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between bg-slate-50 dark:bg-slate-700/50 rounded-xl px-4 py-3 border border-slate-100 dark:border-slate-700"
                            >
                              <span className="font-bold text-slate-700 dark:text-slate-200">{item.display_name}</span>
                              <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                                {item.quantity}<span className="text-sm font-bold ml-1 text-slate-500">個</span>
                              </span>
                            </div>
                          ))}
                        </div>
                        {/* 合計行 */}
                        <div className="mt-3 flex items-center justify-between bg-indigo-50 dark:bg-indigo-900/30 rounded-xl px-4 py-3 border border-indigo-100 dark:border-indigo-800">
                          <span className="font-black text-indigo-700 dark:text-indigo-300">📦 合計</span>
                          <span className="text-2xl font-black text-indigo-700 dark:text-indigo-300">
                            {breakdownModal.items.reduce((s, i) => s + i.quantity, 0)}<span className="text-sm font-bold ml-1">個</span>
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 右ペイン：詳細表示 (黄色の枠線のデザイン) */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center items-start">
              {selectedBatchDetail ? (
                <div className="w-full max-w-3xl bg-white rounded-lg outline outline-4 outline-amber-400 outline-offset-0 overflow-hidden shadow-2xl">
                  
                  {/* 詳細ヘッダー */}
                  <div className="px-6 py-5 flex items-center gap-4 bg-white">
                    <div className="bg-amber-100 text-amber-900 font-black text-xl px-4 py-2 rounded-lg border border-amber-300">
                      {selectedBatchDetail.type === 'product' ? selectedBatchDetail.productCode : selectedBatchDetail.doughCode}
                    </div>
                    <h3 className="text-3xl font-black text-slate-900 tracking-wide">
                      {selectedBatchDetail.type === 'product' ? selectedBatchDetail.productName : selectedBatchDetail.doughName}
                    </h3>
                  </div>

                  {/* サブヘッダー (ミキシング重量/個数) */}
                  <div className="bg-slate-100 px-6 py-4 flex justify-between items-center text-slate-800 border-b border-t border-slate-200">
                    <div className="flex items-center gap-3 text-xl font-bold">
                      <span className="bg-slate-800 text-white w-8 h-8 rounded-full flex items-center justify-center text-lg shadow-sm">
                        {selectedBatchDetail.batchNumber}
                      </span>
                      回目 ミキシング
                    </div>
                    
                    <div className="flex gap-8 items-center bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                      {selectedBatchDetail.type === 'dough' ? (
                        <>
                          <div className="text-center">
                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">粉量</div>
                            <div className="text-2xl font-black text-slate-700">
                              {fmtG(selectedBatchDetail.currentFlourWeightGrams)} <span className="text-xl text-slate-400">g</span>
                            </div>
                          </div>
                          <div className="text-slate-300 font-light text-2xl">/</div>
                          <div className="text-center">
                            <div className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">総生地量目安</div>
                            <div className="text-3xl font-black text-amber-500">
                              {fmtG(selectedBatchDetail.currentTotalWeightGrams)} <span className="text-2xl text-amber-500/80">g</span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-center">
                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">バッチ個数</div>
                            <div className="text-2xl font-black text-slate-700">
                              {selectedBatchDetail.currentQty} <span className="text-xl text-slate-400">個</span>
                            </div>
                          </div>
                          <div className="text-slate-300 font-light text-2xl">/</div>
                          <div className="text-center">
                            <div className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">使用生地量目安</div>
                            <div className="text-3xl font-black text-amber-500">
                              {fmtG(selectedBatchDetail.currentTotalDoughWeightGrams)} <span className="text-2xl text-amber-500/80">g</span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 材料リスト */}
                  <div className="bg-white">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-slate-500 text-sm border-b border-slate-200 bg-slate-50 font-bold">
                          <th className="py-4 px-6">材料名</th>
                          {selectedBatchDetail.type === 'dough' && <th className="py-4 px-6 text-center">指定(%)</th>}
                          <th className="py-4 px-6 text-right text-lg">計量 (g)</th>
                          <th className="py-2 px-2 w-28 text-center">
                            {(() => {
                              const batchChecks = checkedIngredients[selectedBatchDetail.id] || {};
                              const isAllChecked = selectedBatchDetail.baseIngredients.length > 0 && 
                                Object.keys(batchChecks).length === selectedBatchDetail.baseIngredients.length && 
                                Object.values(batchChecks).every(v => v);
                              
                              return (
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleAllChecks(selectedBatchDetail.id, isAllChecked); }}
                                  className={`w-8 h-8 mx-auto rounded-full border-2 flex items-center justify-center transition-all shadow-sm ${
                                    isAllChecked 
                                      ? 'bg-emerald-500 border-emerald-500 text-white' 
                                      : 'bg-white border-slate-300 hover:border-amber-400'
                                  }`}
                                  title={isAllChecked ? "すべてのチェックを外す" : "すべての材料をチェック済みにする"}
                                >
                                  {isAllChecked && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                                </button>
                              );
                            })()}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* 如果Productなら、先頭に「生地」の行を表示する */}
                        {selectedBatchDetail.type === 'product' && selectedBatchDetail.currentTotalDoughWeightGrams > 0 && (
                          <tr className="border-b border-slate-200/80 hover:bg-slate-50 transition-all cursor-pointer group">
                            <td className="py-5 px-6 font-bold text-xl sm:text-2xl transition-colors text-amber-700">
                              {selectedBatchDetail.doughName} <span className="text-sm font-normal text-slate-500">(生地)</span>
                            </td>
                            <td className="py-5 px-6 text-right">
                              <span className="text-4xl sm:text-5xl font-black font-mono tracking-tighter text-amber-500">
                                {fmtG(selectedBatchDetail.currentTotalDoughWeightGrams)}
                              </span>
                              <span className="text-xl sm:text-2xl ml-2 font-bold text-slate-400">
                                g
                              </span>
                            </td>
                            <td className="py-5 px-6 text-right"></td>
                          </tr>
                        )}
                        {selectedBatchDetail.ingredients.map((ing, idx) => {
                          const isChecked = checkedIngredients[selectedBatchDetail.id]?.[ing.ingredientCode] || false;
                          
                          // @ts-ignore
                          const bakersPercent = ing.bakersPercent;

                          return (
                            <tr 
                              key={idx} 
                              onClick={() => toggleIngredientCheck(selectedBatchDetail.id, ing.ingredientCode)}
                              className={`
                                border-b border-slate-200/80 hover:bg-slate-50 transition-all cursor-pointer group
                                ${isChecked ? 'opacity-40 bg-slate-100 grayscale' : ''}
                              `}
                            >
                              <td className={`py-5 px-6 font-bold text-xl sm:text-2xl transition-colors ${isChecked ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                                {ing.ingredientName}
                              </td>
                              {selectedBatchDetail.type === 'dough' && (
                                <td className="py-5 px-6 text-center text-slate-500 font-bold text-lg">
                                  {bakersPercent}%
                                </td>
                              )}
                              <td className="py-5 px-6 text-right">
                                <span className={`text-4xl sm:text-5xl font-black font-mono tracking-tighter transition-colors ${isChecked ? 'text-slate-400' : 'text-amber-500 group-hover:text-amber-400'}`}>
                                  {fmtG(ing.requiredWeightGrams)}
                                </span>
                                <span className={`text-xl sm:text-2xl ml-2 font-bold ${isChecked ? 'text-slate-400' : 'text-slate-400'}`}>
                                  g
                                </span>
                              </td>
                              <td className="py-5 px-6 text-right">
                                {/* チェックボックス */}
                                <div className={`
                                  w-10 h-10 rounded-md border-2 flex items-center justify-center transition-all mx-auto shadow-sm
                                  ${isChecked 
                                    ? 'bg-amber-500 border-amber-500 text-white shadow-inner' 
                                    : 'bg-white border-slate-300 group-hover:border-amber-400 group-hover:bg-amber-50 text-transparent'}
                                `}>
                                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                                  </svg>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                </div>
              ) : (
                <div className="h-full flex items-center justify-center w-full text-slate-400 font-bold text-2xl">
                  左のリストからバッチを選択してください
                </div>
              )}
            </div>

          </>
        )}
      </div>

            {/* 追加仕込みモーダル */}
      {addModal.isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) {
              setAddModal(prev => ({ ...prev, isOpen: false }));
            }
          }}
        >
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="bg-black text-[#ADFF2F] px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-black">⚠️ 追加仕込み</h3>
              <button
                onClick={() => setAddModal(prev => ({ ...prev, isOpen: false }))}
                className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors font-bold text-lg text-white"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              {addModal.isLoading ? (
                <div className="flex items-center justify-center py-8 gap-3">
                  <div className="animate-spin text-3xl">🔄</div>
                  <span className="text-slate-500 font-bold">処理中...</span>
                </div>
              ) : (
                <>
                  <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                    {addModal.items.map((item, index) => (
                      <div key={item.id} className="flex items-end gap-2 bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg border border-slate-100 dark:border-slate-600">
                        <div className="flex-1">
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">対象商品</label>
                          <select
                            className="w-full px-2 py-2 border rounded-md bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#ADFF2F] text-sm"
                            value={item.productCode}
                            onChange={(e) => {
                              const newItems = [...addModal.items];
                              newItems[index].productCode = e.target.value;
                              setAddModal(prev => ({ ...prev, items: newItems }));
                            }}
                          >
                            <option value="">選択してください</option>
                            {addModal.products.map(p => (
                              <option key={p.product_code} value={p.product_code}>{p.product_code} - {p.product_name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="w-24">
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">追加数</label>
                          <input
                            type="number"
                            min="1"
                            className="w-full px-2 py-2 border rounded-md bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#ADFF2F] text-sm"
                            value={item.quantity}
                            onChange={(e) => {
                              const newItems = [...addModal.items];
                              newItems[index].quantity = parseInt(e.target.value) || 1;
                              setAddModal(prev => ({ ...prev, items: newItems }));
                            }}
                          />
                        </div>
                        <div className="w-28 flex flex-col gap-1 text-xs font-bold text-slate-600 dark:text-slate-300">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name={`reason-${item.id}`}
                              value="additional"
                              checked={item.reason === 'additional'}
                              onChange={(e) => {
                                const newItems = [...addModal.items];
                                newItems[index].reason = 'additional';
                                setAddModal(prev => ({ ...prev, items: newItems }));
                              }}
                              className="accent-[#ADFF2F]"
                            />
                            追加オーダー
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name={`reason-${item.id}`}
                              value="remake"
                              checked={item.reason === 'remake'}
                              onChange={(e) => {
                                const newItems = [...addModal.items];
                                newItems[index].reason = 'remake';
                                setAddModal(prev => ({ ...prev, items: newItems }));
                              }}
                              className="accent-[#ADFF2F]"
                            />
                            再仕込み
                          </label>
                        </div>
                        {addModal.items.length > 1 && (
                          <button
                            onClick={() => {
                              const newItems = addModal.items.filter((_, i) => i !== index);
                              setAddModal(prev => ({ ...prev, items: newItems }));
                            }}
                            className="w-9 h-9 mb-0.5 flex-none flex items-center justify-center bg-red-100 text-red-500 hover:bg-red-200 rounded-md transition-colors"
                            title="この行を削除"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  <button
                    onClick={() => {
                      setAddModal(prev => ({
                        ...prev,
                        items: [...prev.items, { id: Date.now().toString(), productCode: '', quantity: 1, reason: 'additional' }]
                      }));
                    }}
                    className="w-full py-2 border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-400 font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <span className="text-xl">⊕</span> さらに商品を追加する
                  </button>

                  <button
                    onClick={handleAddBatchSubmit}
                    disabled={!addModal.items.some(item => item.productCode && item.quantity > 0)}
                    className="w-full mt-4 py-3 bg-black hover:bg-slate-800 text-[#ADFF2F] font-black rounded-xl shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    この内容で仕込みを追加する
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
