const fs = require('fs');
let code = fs.readFileSync('src/components/PlanningTab.tsx', 'utf-8');

code = code.replace(
  /setSelectedPlanId\(existing\.id\);\s*return existing\.id;/,
  `setSelectedPlanId(existing.id);
      store.setSelectedPlanId?.(existing.id);
      return existing.id;`
);

code = code.replace(
  /setSelectedPlanId\(newPlan\.id\);\s*return newPlan\.id;/,
  `setSelectedPlanId(newPlan.id);
    store.setSelectedPlanId?.(newPlan.id);
    return newPlan.id;`
);

fs.writeFileSync('src/components/PlanningTab.tsx', code);
