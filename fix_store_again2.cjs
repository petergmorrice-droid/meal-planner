const fs = require('fs');

// We see that updateMealPlan calls cleanDays. 
// We are adding takeout. Let's make sure it's not being erased by cleanDays.
let content = fs.readFileSync('src/utils.ts', 'utf8');

content = content.replace(/if \(days\[dayName\]\.meals\.length > 0\) \{/g, 
  "if (days[dayName].meals && days[dayName].meals.length > 0) {"
);

fs.writeFileSync('src/utils.ts', content);
