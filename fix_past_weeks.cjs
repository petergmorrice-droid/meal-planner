const fs = require('fs');
let content = fs.readFileSync('src/store.ts', 'utf8');

content = content.replace(/const pastPlans = state\.mealPlans\.filter\(p => isPastWeek\(p\.startDate\)\)\);/g, "const pastPlans = state.mealPlans.filter(p => isPastWeek(p.startDate));");
fs.writeFileSync('src/store.ts', content);
