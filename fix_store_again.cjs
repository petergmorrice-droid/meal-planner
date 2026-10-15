const fs = require('fs');
let content = fs.readFileSync('src/store.ts', 'utf8');

content = content.replace(/setDoc\(doc\(db, sanitizeForFirestore\('([^']+)'\)\), (.*?), \{ merge: true \}\);/g, "setDoc(doc(db, '$1'), $2, { merge: true });");
content = content.replace(/setDoc\(doc\(db, sanitizeForFirestore\('([^']+)'\)\), (.*?)\);/g, "setDoc(doc(db, '$1'), $2);");

fs.writeFileSync('src/store.ts', content);
