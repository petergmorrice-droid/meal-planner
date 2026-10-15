const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./firebase-applet-config.json');

initializeApp({
  projectId: serviceAccount.projectId || 'ai-studio-familymealplanne-0165f91b-6f0f-43d4-ba3c-2887921ab022'
});

const db = getFirestore();
async function dedup() {
  const plansSnap = await db.collection('households/morrice-family/mealPlans').get();
  
  const byStartDate = {};
  for (const doc of plansSnap.docs) {
    const data = doc.data();
    if (!byStartDate[data.startDate]) {
      byStartDate[data.startDate] = [];
    }
    byStartDate[data.startDate].push({ id: doc.id, ref: doc.ref, data });
  }

  for (const [startDate, docs] of Object.entries(byStartDate)) {
    if (docs.length > 1) {
      console.log('Duplicate for', startDate, docs.length, 'docs');
      // keep the one with the most meals
      docs.sort((a, b) => {
        let countA = 0;
        let countB = 0;
        if (a.data.days) countA = Object.values(a.data.days).reduce((acc, d) => acc + d.meals.length, 0);
        if (b.data.days) countB = Object.values(b.data.days).reduce((acc, d) => acc + d.meals.length, 0);
        return countB - countA;
      });
      const [toKeep, ...toDelete] = docs;
      console.log('Keeping', toKeep.id, 'with', toKeep.data.days ? Object.values(toKeep.data.days).reduce((acc, d) => acc + d.meals.length, 0) : 0, 'meals');
      for (const docToDelete of toDelete) {
        console.log('Deleting', docToDelete.id);
        await docToDelete.ref.delete();
      }
    }
  }
}
dedup().catch(console.error);
