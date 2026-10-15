const fs = require('fs');

let content = fs.readFileSync('src/store.ts', 'utf8');

const regex = /const plansUnsub = onSnapshot\(collection\(db, 'households\/morrice-family\/mealPlans'\), \(snapshot\) => \{[\s\S]*?setState\(s => \(\{ \.\.\.s, mealPlans: finalPlans \}\)\);\n\s*\}\);/g;

const replacement = `const plansUnsub = onSnapshot(collection(db, 'households/morrice-family/mealPlans'), (snapshot) => {
          const finalPlans = snapshot.docs.map(doc => doc.data() as MealPlan);
          setState(s => ({ ...s, mealPlans: finalPlans }));
        });`;

content = content.replace(regex, replacement);

fs.writeFileSync('src/store.ts', content);
console.log("Done");
