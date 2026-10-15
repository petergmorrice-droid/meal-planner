const fs = require('fs');

const path = 'src/components/ShopTab.tsx';
let content = fs.readFileSync(path, 'utf8');

// Inject the import
if (!content.includes('ShopAisleGroup')) {
  content = content.replace("import UserBadge from './UserBadge';", "import UserBadge from './UserBadge';\nimport ShopAisleGroup from './ShopAisleGroup';");
}

// Find groupedAisles.map
const startStr = "          groupedAisles.map(group => {";
const endStr = "          })";

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr, startIndex) + endStr.length;

if (startIndex === -1 || endIndex === -1) {
  console.log("Could not find groupedAisles.map boundaries");
  process.exit(1);
}

const newComponent = `          groupedAisles.map(group => (
            <ShopAisleGroup
              key={group.aisle}
              aisle={group.aisle}
              info={group.info}
              items={arrangeListItems(group.items)}
              renderItem={(item) => (
                <ShoppingModeItemRow
                  key={item.id}
                  item={item}
                  onToggle={handleToggleItem}
                />
              )}
            />
          ))`;

content = content.substring(0, startIndex) + newComponent + content.substring(endIndex);

fs.writeFileSync(path, content);
