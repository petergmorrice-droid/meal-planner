const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');

code = code.replace(
  /const \[navigatedPlanId, setNavigatedPlanId\] = useState<string \| null>\(null\);/,
  ``
);

code = code.replace(
  /setNavigatedPlanId\(planId\);/,
  ``
);

code = code.replace(
  /targetPlanId={navigatedPlanId \|\| store\.selectedPlanId}/,
  `targetPlanId={store.selectedPlanId}`
);

fs.writeFileSync('src/App.tsx', code);
