const fs = require('fs');

const path = 'src/components/CookBookTab.tsx';
let content = fs.readFileSync(path, 'utf8');

if (!content.includes('UserBadge')) {
  content = content.replace("import { Recipe, AppState, UserPreferences } from '../types';", "import { Recipe, AppState, UserPreferences } from '../types';\nimport UserBadge from './UserBadge';");
}

const headerStr = '<h3 className="font-semibold text-zinc-900 text-sm sm:text-base truncate">{editedRecipe.name}</h3>';
const newHeaderStr = `<div className="flex items-center gap-2">
              <h3 className="font-semibold text-zinc-900 text-sm sm:text-base truncate">{editedRecipe.name}</h3>
              <UserBadge identity={editedRecipe.lastModifiedBy || editedRecipe.addedBy} />
            </div>`;

content = content.replace(headerStr, newHeaderStr);

fs.writeFileSync(path, content);
