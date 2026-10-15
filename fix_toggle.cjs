const fs = require('fs');

const path = 'src/components/ShopTab.tsx';
let content = fs.readFileSync(path, 'utf8');

const startStr = "              renderItem={(item) => (";
const endStr = "              )}";

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr, startIndex) + endStr.length;

if (startIndex !== -1 && endIndex !== -1) {
  const replacement = `              renderItem={(item) => (
                <ShoppingModeItemRow
                  key={item.id}
                  item={item}
                  onToggle={parentOnToggle}
                />
              )}`;
  content = content.substring(0, startIndex) + replacement + content.substring(endIndex);
  fs.writeFileSync(path, content);
}
