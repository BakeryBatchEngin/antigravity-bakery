const xlsx = require('xlsx');
const path = require('path');

const csvPath = path.join(__dirname, 'test_sample_bakery_data', 'Ingredient_DB.csv');

try {
  // Try reading with xlsx library which sometimes handles different CSV encodings better
  const workbook = xlsx.readFile(csvPath, { codepage: 932 }); // Windows-31J/Shift-JIS
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
  console.log("CSV Read Test:");
  console.log(data.slice(0, 3));
} catch(e) {
  console.error("Error:", e);
}
