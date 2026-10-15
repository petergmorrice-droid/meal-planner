const fs = require('fs');
let content = fs.readFileSync('src/store.ts', 'utf8');

// First remove any existing sanitizeForFirestore completely
content = content.replace(/sanitizeForFirestore\((.*?)\)/g, "$1");

// Then just add it exactly where we know it needs to go
content = content.replace(
  /await setDoc\(doc\(db, 'households\/morrice-family\/recipes', withBreakdowns\.id\), withBreakdowns, \{ merge: true \}\);/g,
  "await setDoc(doc(db, 'households/morrice-family/recipes', withBreakdowns.id), sanitizeForFirestore(withBreakdowns), { merge: true });"
);

content = content.replace(
  /await setDoc\(doc\(db, 'households\/morrice-family\/mealPlans', processedPlan\.id\), processedPlan, \{ merge: true \}\);/g,
  "await setDoc(doc(db, 'households/morrice-family/mealPlans', processedPlan.id), sanitizeForFirestore(processedPlan), { merge: true });"
);

content = content.replace(
  /await setDoc\(doc\(db, 'households\/morrice-family\/mealPlans', newPlan\.id\), newPlan, \{ merge: true \}\);/g,
  "await setDoc(doc(db, 'households/morrice-family/mealPlans', newPlan.id), sanitizeForFirestore(newPlan), { merge: true });"
);

content = content.replace(
  /await setDoc\(doc\(db, 'households\/morrice-family\/mealPlans', plan\.id\), plan, \{ merge: true \}\);/g,
  "await setDoc(doc(db, 'households/morrice-family/mealPlans', plan.id), sanitizeForFirestore(plan), { merge: true });"
);

content = content.replace(
  /await setDoc\(doc\(db, 'households\/morrice-family\/batches', batch\.id\), batch\);/g,
  "await setDoc(doc(db, 'households/morrice-family/batches', batch.id), sanitizeForFirestore(batch));"
);

content = content.replace(
  /await setDoc\(doc\(db, 'households\/morrice-family\/batches', batch\.id\), batch, \{ merge: true \}\);/g,
  "await setDoc(doc(db, 'households/morrice-family/batches', batch.id), sanitizeForFirestore(batch), { merge: true });"
);

content = content.replace(
  /await setDoc\(doc\(db, 'households\/morrice-family\/data\/shoppingState'\), \{ items: processedList \}, \{ merge: true \}\);/g,
  "await setDoc(doc(db, 'households/morrice-family/data/shoppingState'), sanitizeForFirestore({ items: processedList }), { merge: true });"
);

content = content.replace(
  /await setDoc\(doc\(db, 'households\/morrice-family\/data\/groceryOverrides'\), \{ overrides: newOverrides \}, \{ merge: true \}\);/g,
  "await setDoc(doc(db, 'households/morrice-family/data/groceryOverrides'), sanitizeForFirestore({ overrides: newOverrides }), { merge: true });"
);

content = content.replace(
  /await setDoc\(doc\(db, 'households\/morrice-family\/data\/preferences'\), newPrefs, \{ merge: true \}\);/g,
  "await setDoc(doc(db, 'households/morrice-family/data/preferences'), sanitizeForFirestore(newPrefs), { merge: true });"
);

content = content.replace(
  /await setDoc\(doc\(db, 'households\/morrice-family\/data\/preferences'\), DEFAULT_PREFERENCES, \{ merge: true \}\);/g,
  "await setDoc(doc(db, 'households/morrice-family/data/preferences'), sanitizeForFirestore(DEFAULT_PREFERENCES), { merge: true });"
);

fs.writeFileSync('src/store.ts', content);
