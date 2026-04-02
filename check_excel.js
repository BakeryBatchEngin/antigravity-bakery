const xlsx = require('xlsx');

try {
  const workbook = xlsx.readFile('order_file サンプルコレドハード.xlsx');
  const sheetName = workbook.SheetNames[0]; // 最初のシート
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 }); // 配列の配列として読み込む
  
  console.log('Sheet Name:', sheetName);
  console.log('First 10 rows:');
  console.log(JSON.stringify(data.slice(0, 10), null, 2));
} catch (e) {
  console.error('Error reading excel file:', e);
}
