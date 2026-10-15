const fs = require('fs');

const path = 'src/store.ts';
let content = fs.readFileSync(path, 'utf8');

// Remove auth from imports
content = content.replace("import { db, auth } from './firebaseConfig';", "import { db } from './firebaseConfig';");

// Remove auth.onAuthStateChanged block
const startStr = "const unsubscribeAuth = auth.onAuthStateChanged(user => {\n      if (user) {";
const endStr = "}\n    });\n    return () => unsubscribeAuth();";

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr, startIndex);

if (startIndex !== -1 && endIndex !== -1) {
  // Extract the inner part
  const innerContent = content.substring(startIndex + startStr.length, endIndex);
  
  // Clean up the inner content by removing extra indentation (optional, but good for readability)
  // Actually, we can just dump it directly
  const replacement = innerContent;
  
  content = content.substring(0, startIndex) + replacement + content.substring(endIndex + endStr.length);
  fs.writeFileSync(path, content);
}
