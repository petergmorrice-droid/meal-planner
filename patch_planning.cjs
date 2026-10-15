const fs = require('fs');
let code = fs.readFileSync('src/components/PlanningTab.tsx', 'utf-8');

code = code.replace(
  /setSelectedPlanId\(plan\.id\);\s*setShowWeekDropdown\(false\);/,
  `setSelectedPlanId(plan.id);
                          store.setSelectedPlanId?.(plan.id);
                          setShowWeekDropdown(false);`
);

fs.writeFileSync('src/components/PlanningTab.tsx', code);
