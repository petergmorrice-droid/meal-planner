const fs = require('fs');
let content = fs.readFileSync('src/components/PlanningTab.tsx', 'utf8');
content = content.replace(/console\.log\('UPDATING PLAN', updatedPlan\); /g, "");
content = content.replace(/console\.log\('EXECUTE MEAL CHANGE', \{dayName, existingMeal, newMeal\}\); /g, "");
fs.writeFileSync('src/components/PlanningTab.tsx', content);

// WAIT! What if the user is testing the LIVE app from the UI, and because I just restarted the dev server, it might actually work now?
// Let's do a quick curl test for the AI parsing endpoint again just to make absolutely sure.
