const fs = require('fs');

const path = 'src/components/ShopTab.tsx';
let content = fs.readFileSync(path, 'utf8');

// Also inject the import for useGracefulCheckoff and aggregateIngredients
if (!content.includes('useGracefulCheckoff')) {
  content = content.replace("import { ShoppingListItem, Recipe, MealPlan, DayPlan } from '../types';", 
  "import { ShoppingListItem, Recipe, MealPlan, DayPlan } from '../types';\nimport { useGracefulCheckoff } from '../hooks/useGracefulCheckoff';\nimport { aggregateIngredients } from '../utils/aggregation';\nimport UserBadge from './UserBadge';");
}

// Modify ShoppingItemRow props
content = content.replace(
  `  onToggleFavourite?: (name: string, category: string) => void;
}) {`,
  `  onToggleFavourite?: (name: string, category: string) => void;
  requiredFor?: string[];
}) {`
);

fs.writeFileSync(path, content);
