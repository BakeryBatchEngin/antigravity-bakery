const xlsx = require('xlsx');

function checkFile(filePath) {
  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0]; // 最初のシート
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
    
    console.log(\n\n=== File:  + filePath +  ===);
    console.log(Sheet:  + sheetName);
    console.log('--- Row 0 (Headers) ---');
    console.log(data[0]);
    console.log('--- Row 1 (Data) ---');
    console.log(data[1]);
    console.log('--- Row 2 (Data) ---');
    console.log(data[2]);
    
  } catch (e) {
    console.error(Error reading  + filePath + :, e.message);
  }
}

checkFile('./test_sample_bakery_data/Sample_Order コレド日本橋.xlsx');
checkFile('./test_sample_bakery_data/Product_dough table.xlsx');
checkFile('./test_sample_bakery_data/Product_Ingredients table.xlsx');
checkFile('./test_sample_bakery_data/Dough_table.xlsx');
