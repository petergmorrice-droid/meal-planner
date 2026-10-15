const fs = require('fs');
let content = fs.readFileSync('src/store.ts', 'utf8');

content = content.replace(/await setDoc\(doc\(db, '([^']+)', (.*?)\), (.*?), \{ merge: true \}\);/g, "await setDoc(doc(db, '$1', $2), sanitizeForFirestore($3), { merge: true });");
content = content.replace(/await setDoc\(doc\(db, '([^']+)'\), (.*?), \{ merge: true \}\);/g, "await setDoc(doc(db, '$1'), sanitizeForFirestore($2), { merge: true });");
content = content.replace(/await setDoc\(doc\(db, '([^']+)', (.*?)\), ([^,]+)\);/g, "await setDoc(doc(db, '$1', $2), sanitizeForFirestore($3));");

fs.writeFileSync('src/store.ts', content);
