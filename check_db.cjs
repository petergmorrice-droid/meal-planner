const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, deleteDoc, doc } = require("firebase/firestore");
const firebaseConfig = { projectId: 'ai-studio-familymealplanne-0165f91b-6f0f-43d4-ba3c-2887921ab022' };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  try {
    const snapshot = await getDocs(collection(db, 'households/morrice-family/mealPlans'));
    const plans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log("PLANS COUNT:", plans.length);
    plans.forEach(p => console.log(p.id, p.startDate, p.status));
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
