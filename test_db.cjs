const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./firebase-applet-config.json');

const app = initializeApp({
  projectId: serviceAccount.projectId || 'ai-studio-familymealplanne-0165f91b-6f0f-43d4-ba3c-2887921ab022'
});

const db = getFirestore(app, 'ai-studio-familymealplanne-0165f91b-6f0f-43d4-ba3c-2887921ab022');
async function test() {
  const plansSnap = await db.collection('households/morrice-family/mealPlans').get();
  for (const doc of plansSnap.docs) {
    const data = doc.data();
    console.log("DocID:", doc.id, "ID in doc:", data.id, "StartDate:", data.startDate);
  }
}
test().catch(console.error);
