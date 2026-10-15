const fs = require('fs');
let code = fs.readFileSync('src/components/PlanningTab.tsx', 'utf-8');

code = code.replace(
  /const currentMondayStr = formatDateISO\(currentMonday\);/,
  `const currentMondayStr = formatDateISO(currentMonday);
  const nextMondayDate = new Date(currentMondayStr + 'T00:00:00');
  nextMondayDate.setDate(nextMondayDate.getDate() + 7);
  const nextMondayStr = formatDateISO(nextMondayDate);`
);

// We need to fix the duplicate local variables too just in case it clashes
code = code.replace(
  /const nextMondayDate = new Date\(currentMondayStr \+ 'T00:00:00'\);\s*nextMondayDate\.setDate\(nextMondayDate\.getDate\(\) \+ 7\);\s*const nextMondayStr = formatDateISO\(nextMondayDate\);/g,
  `// local nextMondayDate removed`
);

// Put the definition back where we wanted it (since the replace above removed all instances including the one we just added)
code = code.replace(
  /const currentMondayStr = formatDateISO\(currentMonday\);/,
  `const currentMondayStr = formatDateISO(currentMonday);
  const nextMondayDateTop = new Date(currentMondayStr + 'T00:00:00');
  nextMondayDateTop.setDate(nextMondayDateTop.getDate() + 7);
  const nextMondayStr = formatDateISO(nextMondayDateTop);`
);

fs.writeFileSync('src/components/PlanningTab.tsx', code);
