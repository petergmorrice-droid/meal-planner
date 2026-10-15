const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./firebase-applet-config.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function fix() {
  const plansSnap = await db.collection('households/morrice-family/mealPlans').get();
  for (const doc of plansSnap.docs) {
    const data = doc.data();
    let updated = false;
    
    // Fix days
    const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const start = new Date(data.startDate + 'T00:00:00');
    
    if (data.days) {
      DAYS_OF_WEEK.forEach((d, i) => {
        const dDate = new Date(start);
        dDate.setDate(start.getDate() + i);
        const correctDateStr = dDate.toISOString().split('T')[0];
        if (data.days[d] && data.days[d].date !== correctDateStr) {
          data.days[d].date = correctDateStr;
          updated = true;
        }
      });
    }
    
    if (updated) {
      console.log('Fixing plan:', data.id);
      await doc.ref.update({ days: data.days });
    }
  }
  console.log('Done fixing plans.');
}
fix().catch(console.error);
