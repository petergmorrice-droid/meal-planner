const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');
const config = { projectId: 'ai-studio-familymealplanne-0165f91b-6f0f-43d4-ba3c-2887921ab022' };
const app = initializeApp(config);
const db = getFirestore(app);
async function run() {
  const snapshot = await getDocs(collection(db, 'households/morrice-family/mealPlans'));
  const plans = snapshot.docs.map(d => d.data());
  console.log("Plans length:", plans.length);
  plans.forEach(p => console.log(p.id, p.startDate));
}
run();
