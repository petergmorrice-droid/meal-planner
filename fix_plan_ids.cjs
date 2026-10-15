const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./firebase-applet-config.json');

const app = initializeApp({
  projectId: serviceAccount.projectId || 'ai-studio-familymealplanne-0165f91b-6f0f-43d4-ba3c-2887921ab022'
});

const db = getFirestore(app, 'ai-studio-familymealplanne-0165f91b-6f0f-43d4-ba3c-2887921ab022');
async function fixIds() {
  const plansSnap = await db.collection('households/morrice-family/mealPlans').get();
  for (const doc of plansSnap.docs) {
    const data = doc.data();
    const desiredId = `plan-${data.startDate}`;
    if (doc.id !== desiredId) {
       console.log(`Moving ${doc.id} to ${desiredId}`);
       await db.collection('households/morrice-family/mealPlans').doc(desiredId).set({
         ...data,
         id: desiredId
       });
       await doc.ref.delete();
    } else if (data.id !== desiredId) {
       console.log(`Fixing inner id of ${doc.id}`);
       await doc.ref.update({ id: desiredId });
    }
  }
}
fixIds().catch(console.error);
