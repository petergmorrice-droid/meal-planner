const fs = require('fs');
let content = fs.readFileSync('src/components/PlanningTab.tsx', 'utf8');

content = content.replace(/executeMealChange\(dayName, existingMeal, newMeal\);/g, 
  "console.log('EXECUTE MEAL CHANGE', {dayName, existingMeal, newMeal}); executeMealChange(dayName, existingMeal, newMeal);"
);
fs.writeFileSync('src/components/PlanningTab.tsx', content);
