const fs = require('fs');
const path = 'src/app/production/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const regex = /interface WipMixingPlanItem \{[\s\S]*?isAdditional\?: boolean;\r?\n\}/;

const match = content.match(regex);
if (match) {
  content = content.replace(regex, '');
  content = match[0] + '\n\n' + content;
  fs.writeFileSync(path, content, 'utf8');
  console.log("Moved");
} else {
  console.log("Not found");
}
