const fs = require('fs');

const path = 'src/firebaseConfig.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace("import { getAuth, signInAnonymously } from 'firebase/auth';", "import { getAuth } from 'firebase/auth';");
content = content.replace("signInAnonymously(auth).catch(error => {\n  console.error(\"Error signing in anonymously: \", error);\n});", "");

fs.writeFileSync(path, content);
