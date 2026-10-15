const fs = require('fs');

const path = 'src/components/PlanningTab.tsx';
let content = fs.readFileSync(path, 'utf8');

if (!content.includes('UserBadge')) {
  content = content.replace("import { MealCostModal, MealHealthModal, WeeklyCostModal, WeeklyHealthModal } from '.';", "import { MealCostModal, MealHealthModal, WeeklyCostModal, WeeklyHealthModal } from '.';\nimport UserBadge from './UserBadge';");
  // Also look for other possible places if it's imported differently
  if (!content.includes('UserBadge')) {
      content = content.replace("import { Recipe, MealPlan, PlannedMeal, BatchItem, DayPlan, UserPreferences } from '../types';", "import { Recipe, MealPlan, PlannedMeal, BatchItem, DayPlan, UserPreferences } from '../types';\nimport UserBadge from './UserBadge';");
  }
}

const headerStr = '<span className="block font-medium">{formatWeekRange(plan.startDate)}</span>';
const newHeaderStr = `<div className="flex items-center gap-2">
                          <span className="block font-medium">{formatWeekRange(plan.startDate)}</span>
                          <UserBadge identity={plan.lastModifiedBy || plan.addedBy} />
                        </div>`;

content = content.replace(headerStr, newHeaderStr);

fs.writeFileSync(path, content);
