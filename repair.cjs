const fs = require('fs');
let code = fs.readFileSync('src/store.ts', 'utf8');

const repairFn = `  const repairDatabase = async () => {
    // 1. Group meal plans by startDate
    const plansByDate = new Map<string, MealPlan[]>();
    for (const p of state.mealPlans) {
      if (!plansByDate.has(p.startDate)) plansByDate.set(p.startDate, []);
      plansByDate.get(p.startDate)!.push(p);
    }

    // 2. For each startDate, find the best plan and delete the rest
    for (const [startDate, plans] of plansByDate.entries()) {
      if (plans.length <= 1) continue;
      
      // Sort plans: prefer ones with the correct ID format, then by most recently modified
      plans.sort((a, b) => {
        const aCorrect = a.id === \`plan-\${a.startDate}\` ? 1 : 0;
        const bCorrect = b.id === \`plan-\${b.startDate}\` ? 1 : 0;
        if (aCorrect !== bCorrect) return bCorrect - aCorrect;
        return (b.lastModifiedAt || 0) - (a.lastModifiedAt || 0);
      });

      const bestPlan = plans[0];
      const duplicates = plans.slice(1);

      // Clean up the best plan to enforce 1 meal per day
      let modified = false;
      const cleanDaysData = { ...bestPlan.days };
      for (const day of Object.keys(cleanDaysData)) {
        if (cleanDaysData[day]?.meals?.length > 1) {
          cleanDaysData[day].meals = [cleanDaysData[day].meals[0]]; // keep only first meal
          modified = true;
        }
      }

      if (modified || bestPlan.id !== \`plan-\${bestPlan.startDate}\`) {
        const correctId = \`plan-\${bestPlan.startDate}\`;
        const updatedPlan = { ...bestPlan, id: correctId, days: cleanDaysData };
        await setDoc(doc(db, 'households/morrice-family/mealPlans', correctId), sanitizeForFirestore(updatedPlan), { merge: true });
        if (bestPlan.id !== correctId) {
          await deleteDoc(doc(db, 'households/morrice-family/mealPlans', bestPlan.id));
        }
      }

      // Delete the rest
      for (const dup of duplicates) {
        if (dup.id !== \`plan-\${bestPlan.startDate}\`) {
           await deleteDoc(doc(db, 'households/morrice-family/mealPlans', dup.id));
        }
      }
    }
    
    // Check all plans that are NOT duplicates but might have >1 meal per day
    for (const p of state.mealPlans) {
      const plans = plansByDate.get(p.startDate);
      if (plans && plans.length > 1) continue; // handled above
      
      let modified = false;
      const cleanDaysData = { ...p.days };
      for (const day of Object.keys(cleanDaysData)) {
        if (cleanDaysData[day]?.meals?.length > 1) {
          cleanDaysData[day].meals = [cleanDaysData[day].meals[0]]; // keep only first meal
          modified = true;
        }
      }
      if (modified) {
        await setDoc(doc(db, 'households/morrice-family/mealPlans', p.id), sanitizeForFirestore({ ...p, days: cleanDaysData }), { merge: true });
      }
    }
  };
`;

if (!code.includes('repairDatabase')) {
  code = code.replace('const duplicatePlanToWeek', repairFn + '\n  const duplicatePlanToWeek');
  code = code.replace('updateMealPlan,', 'updateMealPlan,\n    repairDatabase,');
  fs.writeFileSync('src/store.ts', code);
  console.log("Patched");
}
