const { sanitizeForFirestore } = require('./src/utils.js');
// Wait, we need to test sanitizeForFirestore to make sure it doesn't drop the whole document.

function sanitizeMock(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeMock)
  }
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = sanitizeMock(value);
    }
  }
  return result;
}

const p = {
  id: "plan-2024-09-14",
  days: {
    Monday: { date: "2024-09-14", meals: [{ type: "takeout", name: "Takeout", note: "" }] }
  }
};
console.log(JSON.stringify(sanitizeMock(p)));

