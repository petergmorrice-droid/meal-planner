const { sanitizeForFirestore, cleanDays } = require('./src/utils.js');
// The AI Parsing is fixed! The response was {"name":"Simple Cookies"...}
// This is because the Gemini model was updated and the server restarted.

// So why doesn't "takeout" work?
// It must be a UI state bug in `PlanningTab.tsx`.
// When they click "Add Takeout":
// 1. setCustomMealModal opens modal
// 2. user fills out note, clicks "Add to Plan"
// 3. handleAddCustomMeal(dayName, type, undefined, note, servings) is called
// 4. existingMeal is found (could be null)
// 5. newMeal = { id, type: 'takeout', name: 'Takeout', servings, note }
// 6. executeMealChange(dayName, existingMeal, newMeal) is called
// 7. plan is "draft" or "not_started"
// 8. executeMealChange calls `store.updateMealPlan`

// Wait, the `executeMealChange` uses `store.updateMealPlan({ ...currentPlan, days: nextDays })`
// It does NOT call `setPendingPlanChange`. 
// So it immediately pushes the update to Firestore.
// And `store.ts` calls `sanitizeForFirestore` and `setDoc`.
// Does it reach Firestore?
