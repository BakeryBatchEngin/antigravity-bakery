const fs = require('fs');
const pagePath = 'src/app/production/page.tsx';
let c = fs.readFileSync(pagePath, 'utf8');

const search = `    try {
      let updatedDoughs = [...flatBatches];
      let updatedProducts = [...flatProductBatches];
      
      for (const item of validItems) {`;

const replace = `    try {
      let updatedDoughs = [...flatBatches];
      let updatedProducts = [...flatProductBatches];
      let updatedWips = [...flatWipBatches];
      
      for (const item of validItems) {`;

c = c.replace(search, replace);

const search2 = `        if (res.ok && data.success) {
          updatedDoughs = [...updatedDoughs, ...(data.additionalDoughBatches || [])];
          updatedProducts = [...updatedProducts, ...(data.additionalProductBatches || [])];
          setFlatWipBatches(prev => [...prev, ...(data.additionalWipBatches || [])]);
        } else {`;

const replace2 = `        if (res.ok && data.success) {
          updatedDoughs = [...updatedDoughs, ...(data.additionalDoughBatches || [])];
          updatedProducts = [...updatedProducts, ...(data.additionalProductBatches || [])];
          updatedWips = [...updatedWips, ...(data.additionalWipBatches || [])];
        } else {`;

c = c.replace(search2, replace2);

const search3 = `      setFlatBatches(updatedDoughs);
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

const replace3 = `      setFlatBatches(updatedDoughs);
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

c = c.replace(search3, replace3);
fs.writeFileSync(pagePath, c);
console.log('Successfully patched page.tsx for auto save WIPs');
