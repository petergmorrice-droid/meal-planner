const fs = require('fs');
let code = fs.readFileSync('src/components/SettingsTab.tsx', 'utf8');

code = code.replace("import { Wrench, DevConsoleTable } from './DevConsoleTable';", "import { DevConsoleTable } from './DevConsoleTable';");
if (!code.includes('Wrench,')) {
  code = code.replace("import {\n  Calendar,", "import {\n  Wrench,\n  Calendar,");
  code = code.replace("import { \n  Calendar,", "import { \n  Wrench,\n  Calendar,");
}
fs.writeFileSync('src/components/SettingsTab.tsx', code);
