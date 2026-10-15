const fs = require('fs');

// We have two places where `currentPlan.status === 'finalized'` is checked.
// One is inside `applyOrConfirmPlanChange` (used by servings updates).
// The other is inside `executeMealChange`.
// These are correct.

