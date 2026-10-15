const fs = require('fs');

const path = 'src/components/CatalogDrawer.tsx';
let content = fs.readFileSync(path, 'utf8');

if (!content.includes('currentWeekItems')) {
  content = content.replace("interface CatalogDrawerProps {", "interface CatalogDrawerProps {\n  currentWeekItems?: any;");
}

fs.writeFileSync(path, content);
