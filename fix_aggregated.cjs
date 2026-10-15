const fs = require('fs');

const path = 'src/components/ShopTab.tsx';
let content = fs.readFileSync(path, 'utf8');

const startStr = "const totalAmount = groupItems.reduce((sum, item) => sum + (item.amount || 0), 0);";
const endStr = "const unit = canonical.unit || '';";

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr, startIndex) + endStr.length;

if (startIndex !== -1 && endIndex !== -1) {
  const replacement = `const { amount: totalAmount, unit, displayQuantity } = aggregateIngredients(groupItems);
      const checked = groupItems.every(item => item.checked);
      const underlyingIds = groupItems.map(item => item.id);`;
  content = content.substring(0, startIndex) + replacement + content.substring(endIndex);
  fs.writeFileSync(path, content);
}
