const fs = require('fs');
let content = fs.readFileSync('src/components/PlanningTab.tsx', 'utf8');

content = content.replace(/store\.updateMealPlan\(updatedPlan\);/g, "console.log('UPDATING PLAN', updatedPlan); store.updateMealPlan(updatedPlan);");
fs.writeFileSync('src/components/PlanningTab.tsx', content);

let storeContent = fs.readFileSync('src/store.ts', 'utf8');
storeContent = storeContent.replace(/await setDoc\(doc\(db, 'households\/morrice-family\/mealPlans', processedPlan\.id\), sanitizeForFirestore\(processedPlan\), \{ merge: true \}\);/g, 
  "console.log('FIRESTORE WRITE', sanitizeForFirestore(processedPlan)); await setDoc(doc(db, 'households/morrice-family/mealPlans', processedPlan.id), sanitizeForFirestore(processedPlan), { merge: true });"
);
fs.writeFileSync('src/store.ts', storeContent);
