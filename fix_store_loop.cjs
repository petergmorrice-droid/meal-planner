const fs = require('fs');

let content = fs.readFileSync('src/store.ts', 'utf8');

const regex = /const plansUnsub = onSnapshot\(collection\(db, 'households\/morrice-family\/mealPlans'\), \(snapshot\) => \{[\s\S]*?setState\(s => \(\{ \.\.\.s, mealPlans: finalPlans \}\)\);\n\s*\}\);/g;

const replacement = `const plansUnsub = onSnapshot(collection(db, 'households/morrice-family/mealPlans'), (snapshot) => {
          const rawPlans = snapshot.docs.map(doc => doc.data() as MealPlan);
          
          // Just read the plans, deduplicate locally without writing back in the listener
          const byStartDate: Record<string, MealPlan[]> = {};
          rawPlans.forEach(plan => {
            if (!byStartDate[plan.startDate]) {
              byStartDate[plan.startDate] = [];
            }
            byStartDate[plan.startDate].push(plan);
          });
          
          const finalPlans: MealPlan[] = [];
          Object.values(byStartDate).forEach(plans => {
            if (plans.length > 1) {
              plans.sort((a, b) => {
                const countA = a.days ? Object.values(a.days).reduce((acc, d) => acc + d.meals.length, 0) : 0;
                const countB = b.days ? Object.values(b.days).reduce((acc, d) => acc + d.meals.length, 0) : 0;
                return countB - countA;
              });
            }
            finalPlans.push(plans[0]); // Just take the best one
          });
          
          setState(s => ({ ...s, mealPlans: finalPlans }));
        });`;

content = content.replace(regex, replacement);

fs.writeFileSync('src/store.ts', content);
console.log("Done");
