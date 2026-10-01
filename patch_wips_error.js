const fs = require('fs');
const path = 'src/app/api/admin/wips/route.ts';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(
  "return NextResponse.json({ error: 'データの保存に失敗しました' }, { status: 500 });",
  "return NextResponse.json({ error: 'データの保存に失敗しました: ' + (error.message || String(error)) }, { status: 500 });"
);

c = c.replace(
  "return NextResponse.json({ error: 'データの保存に失敗しました' }, { status: 500 });",
  "return NextResponse.json({ error: 'データの保存に失敗しました: ' + (error.message || String(error)) }, { status: 500 });"
); // For both POST and PUT

fs.writeFileSync(path, c);
console.log('Patched error response to include details');
