const fs = require('fs');
let code = fs.readFileSync('src/store.ts', 'utf8');

const target = `  const updateMealPlan = async (plan: MealPlan) => {
    const currentMondayStr = formatDateISO(getMonday(new Date()));
    let processedPlan = { 
      ...plan, 
      id: \`plan-\${plan.startDate}\`,
      isCurrent: plan.startDate === currentMondayStr,
      days: cleanDays(plan.days) 
    };

    const maxWeeks = state.preferences?.maxForwardWeeks || DEFAULT_PREFERENCES.maxForwardWeeks || 4;
    if (isWeekBeyondForwardLimit(processedPlan.startDate, maxWeeks)) {
      console.warn(\`Cannot add meal plan beyond forward limit (\${maxWeeks} weeks)\`, processedPlan.startDate);
      return;
    }

    if (processedPlan.status !== 'finalized') {
      const hasMeals = Object.values(processedPlan.days).some((day: any) => day.meals && day.meals.length > 0);
      processedPlan.status = hasMeals ? 'draft' : 'not_started';
    }

    processedPlan.lastModifiedBy = currentUser;
    processedPlan.lastModifiedAt = Date.now();
    
    
    

    await setDoc(doc(db, 'households/morrice-family/mealPlans', processedPlan.id), sanitizeForFirestore(processedPlan), { merge: true });
  };`;

const replacement = `  const updateMealPlan = async (plan: MealPlan) => {
    const currentMondayStr = formatDateISO(getMonday(new Date()));
    const expectedId = \`plan-\${plan.startDate}\`;
    let processedPlan = { 
      ...plan, 
      id: expectedId,
      isCurrent: plan.startDate === currentMondayStr,
      days: cleanDays(plan.days) 
    };

    const maxWeeks = state.preferences?.maxForwardWeeks || DEFAULT_PREFERENCES.maxForwardWeeks || 4;
    if (isWeekBeyondForwardLimit(processedPlan.startDate, maxWeeks)) {
      console.warn(\`Cannot add meal plan beyond forward limit (\${maxWeeks} weeks)\`, processedPlan.startDate);
      return;
    }

    if (processedPlan.status !== 'finalized') {
      const hasMeals = Object.values(processedPlan.days).some((day: any) => day.meals && day.meals.length > 0);
      processedPlan.status = hasMeals ? 'draft' : 'not_started';
    }

    processedPlan.lastModifiedBy = currentUser;
    processedPlan.lastModifiedAt = Date.now();
    
    if (plan.id && plan.id !== expectedId) {
      try {
        await deleteDoc(doc(db, 'households/morrice-family/mealPlans', plan.id));
      } catch (e) {
        console.warn('Failed to delete old plan ID', e);
      }
    }

    await setDoc(doc(db, 'households/morrice-family/mealPlans', processedPlan.id), sanitizeForFirestore(processedPlan), { merge: true });
  };`;

if (code.includes(target)) {
  fs.writeFileSync('src/store.ts', code.replace(target, replacement));
  console.log("Patched successfully");
} else {
  // try regex replacement for the blank lines
  const regex = /  const updateMealPlan = async \(plan: MealPlan\) => \{[\s\S]*?await setDoc\(doc\(db, 'households\/morrice-family\/mealPlans', processedPlan\.id\), sanitizeForFirestore\(processedPlan\), \{ merge: true \}\);\n  \};\n/;
  if (regex.test(code)) {
    fs.writeFileSync('src/store.ts', code.replace(regex, replacement + '\n'));
    console.log("Patched with regex");
  } else {
    console.log("Could not find target");
  }
}
