const fs = require('fs');
const path = 'src/app/production/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const targetStr = `      let updatedDoughs = [...flatBatches];
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
          alert(\`エラー: \${data.error || '追加バッチの生成に失敗しました'}\`);
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
      }`;

const replaceStr = `      let updatedDoughs = [...flatBatches];
      let updatedProducts = [...flatProductBatches];
      let updatedWips = [...flatWipBatches];
      
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
          updatedWips = [...updatedWips, ...(data.additionalWipBatches || [])];
        } else {
          alert(\`エラー: \${data.error || '追加バッチの生成に失敗しました'}\`);
        }
      }
      
      setFlatBatches(updatedDoughs);
      setFlatProductBatches(updatedProducts);
      setFlatWipBatches(updatedWips);
      setAddModal(prev => ({ ...prev, isOpen: false, isLoading: false }));
      
      if (isPlanSet) {
        await fetch('/api/production/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: targetDate,
            flatBatches: updatedDoughs,
            flatWipBatches: updatedWips,
            flatProductBatches: updatedProducts
          })
        });
      }`;

content = content.replace(targetStr, replaceStr);
fs.writeFileSync(path, content, 'utf8');
console.log("Patched page.tsx handleAddBatchSubmit!");
