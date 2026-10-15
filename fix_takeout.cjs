const fs = require('fs');
let content = fs.readFileSync('src/components/PlanningTab.tsx', 'utf8');

// I notice executeMealChange checks if the plan is finalized, if so it uses setPendingPlanChange. 
// Otherwise it directly calls store.updateMealPlan. 
// Let's check how the newMeal is constructed.
// The newMeal contains undefined note. 
// This shouldn't be an issue anymore because we have sanitizeForFirestore.
// Let's check if the issue is that it's undefined instead of an empty string, maybe there is some other bug.
// Let's remove undefined and use empty string for note just in case.

content = content.replace(/note: note\?\.trim\(\) \|\| undefined/g, "note: note?.trim() || ''");

fs.writeFileSync('src/components/PlanningTab.tsx', content);
