const fs = require('fs');
let code = fs.readFileSync('src/components/ThisWeekTab.tsx', 'utf-8');

code = code.replace(
  /setSelectedPlanId\(plan\.id\);\s*setShowWeekDropdown\(false\);/,
  `setSelectedPlanId(plan.id);
                          store.setSelectedPlanId?.(plan.id);
                          setShowWeekDropdown(false);`
);

code = code.replace(
  /setSelectedPlanId\(existing\.id\);\s*setShowWeekDropdown\(false\);/,
  `setSelectedPlanId(existing.id);
      store.setSelectedPlanId?.(existing.id);
      setShowWeekDropdown(false);`
);

code = code.replace(
  /setSelectedPlanId\(newPlan\.id\);\s*setShowWeekDropdown\(false\);/,
  `setSelectedPlanId(newPlan.id);
    store.setSelectedPlanId?.(newPlan.id);
    setShowWeekDropdown(false);`
);

fs.writeFileSync('src/components/ThisWeekTab.tsx', code);
