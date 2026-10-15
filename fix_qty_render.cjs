const fs = require('fs');

const path = 'src/components/ShopTab.tsx';
let content = fs.readFileSync(path, 'utf8');

const startStr = "const rawUnit = item.unit ? item.unit.toLowerCase().trim() : '';";
const endStr = "})()}";

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr, startIndex) + endStr.length;

if (startIndex !== -1 && endIndex !== -1) {
  const replacement = `if (item.displayQuantity) return item.displayQuantity;
              const rawUnit = item.unit ? item.unit.toLowerCase().trim() : '';
              const isCount = !rawUnit || ['whole', 'item', 'items', 'count', 'piece', 'pieces', 'unit', 'units', ''].includes(rawUnit);
              return isCount ? \`Qty: \${item.amount}\` : \`\${item.amount}\${item.unit ? ' ' + item.unit : ''}\`;
            })()}`;
  content = content.substring(0, startIndex) + replacement + content.substring(endIndex);
  fs.writeFileSync(path, content);
}
