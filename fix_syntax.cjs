const fs = require('fs');
let content = fs.readFileSync('src/store.ts', 'utf8');

content = content.replace(
  /await setDoc\(doc\(db, 'households\/morrice-family\/recipes', withBreakdowns\.id\), withBreakdowns, \{ merge: true \};/g,
  "await setDoc(doc(db, 'households/morrice-family/recipes', withBreakdowns.id), sanitizeForFirestore(withBreakdowns), { merge: true });"
);

content = content.replace(
  /await setDoc\(doc\(db, 'households\/morrice-family\/mealPlans', newPlan\.id\), newPlan, \{ merge: true \};/g,
  "await setDoc(doc(db, 'households/morrice-family/mealPlans', newPlan.id), sanitizeForFirestore(newPlan), { merge: true });"
);

content = content.replace(
  /await setDoc\(doc\(db, 'households\/morrice-family\/mealPlans', plan\.id\), plan, \{ merge: true \};/g,
  "await setDoc(doc(db, 'households/morrice-family/mealPlans', plan.id), sanitizeForFirestore(plan), { merge: true });"
);

fs.writeFileSync('src/store.ts', content);
