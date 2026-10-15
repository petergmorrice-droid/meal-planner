const fs = require('fs');
let code = fs.readFileSync('src/store.ts', 'utf8');

const target = `        const plansUnsub = onSnapshot(collection(db, 'households/morrice-family/mealPlans'), (snapshot) => {
          const finalPlans = snapshot.docs.map(doc => doc.data() as MealPlan);
          setState(s => ({ ...s, mealPlans: finalPlans }));
        });`;

const replacement = `        const plansUnsub = onSnapshot(collection(db, 'households/morrice-family/mealPlans'), (snapshot) => {
          const rawPlans = snapshot.docs.map(doc => doc.data() as MealPlan);
          
          // Deduplicate by startDate
          const plansByDate = new Map<string, MealPlan[]>();
          for (const p of rawPlans) {
             if (!plansByDate.has(p.startDate)) plansByDate.set(p.startDate, []);
             plansByDate.get(p.startDate).push(p);
          }
          
          const finalPlans = [];
          for (const [date, plans] of plansByDate.entries()) {
             if (plans.length === 1) {
                finalPlans.push(plans[0]);
             } else {
                plans.sort((a, b) => {
                   // Prefer the correct expected ID format first
                   const aCorrect = a.id === \`plan-\${a.startDate}\` ? 1 : 0;
                   const bCorrect = b.id === \`plan-\${b.startDate}\` ? 1 : 0;
                   if (aCorrect !== bCorrect) return bCorrect - aCorrect;
                   // Then prefer finalized
                   if (a.status === 'finalized' && b.status !== 'finalized') return -1;
                   if (b.status === 'finalized' && a.status !== 'finalized') return 1;
                   // Fallback to most recently modified
                   return (b.lastModifiedAt || 0) - (a.lastModifiedAt || 0);
                });
                
                finalPlans.push(plans[0]);
                
                // Actively delete duplicates from DB
                plans.slice(1).forEach(dup => {
                   if (dup.id) {
                     deleteDoc(doc(db, 'households/morrice-family/mealPlans', dup.id)).catch(console.error);
                   }
                });
             }
          }
          
          setState(s => ({ ...s, mealPlans: finalPlans }));
        });`;

if (code.includes(target)) {
  fs.writeFileSync('src/store.ts', code.replace(target, replacement));
  console.log("Patched onSnapshot");
} else {
  console.log("Could not find target in store.ts");
}
