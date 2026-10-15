const fs = require('fs');

// Also update the fallback "This Week" rendering in ShopTab subheader if needed
let shop = fs.readFileSync('src/components/ShopTab.tsx', 'utf-8');
shop = shop.replace(
  /\{activePlan \? formatWeekRange\(activePlan\.startDate\) : 'This Week'\}/,
  `{activePlan ? (activePlan.startDate === currentMondayStr ? 'This Week' : activePlan.startDate === nextMondayStr ? 'Next Week' : formatWeekRange(activePlan.startDate)) : 'This Week'}`
);

fs.writeFileSync('src/components/ShopTab.tsx', shop);
