const fs = require('fs');

let utilsContent = fs.readFileSync('src/utils.ts', 'utf8');
if (!utilsContent.includes('sanitizeForFirestore')) {
  utilsContent += `\nexport function sanitizeForFirestore<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore) as unknown as T;
  }
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = sanitizeForFirestore(value);
    }
  }
  return result;
}\n`;
  fs.writeFileSync('src/utils.ts', utilsContent);
}

let storeContent = fs.readFileSync('src/store.ts', 'utf8');

// Add import if not present
if (!storeContent.includes('sanitizeForFirestore')) {
  storeContent = storeContent.replace(
    /import \{[^}]*cleanDays[^}]*\} from '.\/utils';/,
    match => match.replace('cleanDays', 'cleanDays, sanitizeForFirestore')
  );
}

// Wrap all setDoc objects with sanitizeForFirestore
storeContent = storeContent.replace(
  /setDoc\(([^,]+),\s*([^,]+)(,\s*\{[^}]+\})?\)/g,
  (match, p1, p2, p3) => {
    // If it's already sanitized, skip
    if (p2.includes('sanitizeForFirestore')) return match;
    return `setDoc(${p1}, sanitizeForFirestore(${p2})${p3 || ''})`;
  }
);

fs.writeFileSync('src/store.ts', storeContent);
console.log("Done");
