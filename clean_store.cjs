const fs = require('fs');
let storeContent = fs.readFileSync('src/store.ts', 'utf8');

storeContent = storeContent.replace(/console\.log\('FIRESTORE WRITE'.*?\); /g, "");

fs.writeFileSync('src/store.ts', storeContent);
