const fs = require('fs');
const path = 'src/app/production/page.tsx';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(/selectedBatchDetail\.type === 'product' \? selectedBatchDetail\.productCode : selectedBatchDetail\.doughCode/g, "selectedBatchDetail.type === 'product' ? selectedBatchDetail.productCode : (selectedBatchDetail.type === 'wip' ? selectedBatchDetail.wipCode : selectedBatchDetail.doughCode)");
c = c.replace(/selectedBatchDetail\.type === 'product' \? selectedBatchDetail\.productName : selectedBatchDetail\.doughName/g, "selectedBatchDetail.type === 'product' ? selectedBatchDetail.productName : (selectedBatchDetail.type === 'wip' ? selectedBatchDetail.wipName : selectedBatchDetail.doughName)");

fs.writeFileSync(path, c);
console.log("Fixed doughCode/Name");
