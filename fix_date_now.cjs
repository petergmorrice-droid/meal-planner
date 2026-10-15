const fs = require('fs');
let content = fs.readFileSync('src/store.ts', 'utf8');

content = content.replace(/Date\.now\(\)\);/g, "Date.now();");
fs.writeFileSync('src/store.ts', content);
