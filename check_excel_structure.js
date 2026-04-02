const xlsx = require('xlsx');

try {
  const workbook = xlsx.readFile('order_file サンプルコレドハード.xlsx');
  const sheetName = workbook.SheetNames[0]; // 最初のシート
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
  
  console.log('--- Row 0 (Length ' + data[0]?.length + ') ---');
  console.log(data[0]?.slice(0, 15));
  console.log('--- Row 1 (Length ' + data[1]?.length + ') ---');
  console.log(data[1]?.slice(0, 15));
  console.log('--- Row 2 (Length ' + data[2]?.length + ') ---');
  console.log(data[2]?.slice(0, 15));
  console.log('--- Row 3 (Length ' + data[3]?.length + ') ---');
  console.log(data[3]?.slice(0, 15));
  
} catch (e) {
  console.error(e);
}
