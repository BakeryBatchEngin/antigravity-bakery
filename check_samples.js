const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'test_sample_bakery_data');

// Check CSV
try {
  console.log('--- Ingredient_DB.csv ---');
  const csvData = fs.readFileSync(path.join(dir, 'Ingredient_DB.csv'), 'utf-8');
  const lines = csvData.split('\n').slice(0, 5);
  lines.forEach((line, i) => console.log(`Row ${i}: ${line.trim()}`));
} catch (e) {
  console.error('Error reading CSV:', e.message);
}

// Check Excels
const excels = [
  'Dough_table.xlsx',
  'Product_dough table.xlsx',
  'Product_Ingredients table.xlsx',
  'Sample_Order コレド日本橋.xlsx'
];

excels.forEach(file => {
  try {
    console.log(`\n--- ${file} ---`);
    const workbook = xlsx.readFile(path.join(dir, file));
    workbook.SheetNames.forEach(sheetName => {
      console.log(`Sheet: ${sheetName}`);
      const worksheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
      for (let i = 0; i < Math.min(4, data.length); i++) {
        console.log(`  Row ${i}:`, data[i]);
      }
    });
  } catch (e) {
    console.error(`Error reading ${file}:`, e.message);
  }
});
