const fs = require('fs');
let content = fs.readFileSync('src/store.ts', 'utf8');

const regex = /const indexByDate = state\.mealPlans\.findIndex\(p => p\.startDate === processedPlan\.startDate\);\n\s*if \(indexByDate >= 0 && state\.mealPlans\[indexByDate\]\.id !== processedPlan\.id\) \{\n\s*await deleteDoc\(doc\(db, 'households\/morrice-family\/mealPlans', state\.mealPlans\[indexByDate\]\.id\)\);\n\s*\}/g;

content = content.replace(regex, '');
fs.writeFileSync('src/store.ts', content);
console.log("Done");
