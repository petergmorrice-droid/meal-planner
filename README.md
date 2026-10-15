# Family Meal Planner

A private meal-planning app for two: a recipe book, a weekly planner, a shared
shopping list, a cooking view and a freezer tracker. Built originally in Google
AI Studio (export dated 5 October 2026) and now maintained here.

## What's in the app

| Tab | What it does |
| --- | --- |
| **Cookbook** | Your recipe book. Paste a recipe (or describe one) and Gemini turns it into a structured recipe with ingredients, method, cost and health breakdowns. |
| **Planning** | Pick meals for each day of the week, up to 4 weeks ahead. Finalise a week to build its shopping list. |
| **Shop** | Shopping list grouped by aisle, generated from the week's meals plus staples and extras. |
| **Cook** | This week's cooking schedule with step-by-step cook mode (oven/hob or Ninja). |
| **Freezer** | Batch-cooked meals in the freezer, which can be dropped into a week's plan. |
| **Settings** | Past weeks, grocery database, household, and connections (GitHub sync + Gemini key). |

## Where the data lives

- **On each phone:** everything is saved in the browser's local storage, so the
  app works offline.
- **Shared between phones:** if a GitHub token and Gist ID are entered in
  *Settings → Connections*, the whole app state is synced to one private
  GitHub Gist (`family-meal-planner.json`).
- **AI recipe parsing:** uses your own Gemini API key, entered in
  *Settings → Connections*. It is stored only on that phone.

There is no server and no database to pay for. The built app is a set of
static files that can be hosted for free anywhere.

> Earlier versions used a Firebase database created by AI Studio. The current
> version does not read from it. If any old data only exists there, it would
> need a one-off import.

## Known issues (October 2026)

1. **Deleted things come back.** Deleting a recipe or removing a shopping item
   on one phone is undone the next time the other phone opens the app.
2. **Changes don't appear live.** The other phone only sees changes when it
   reopens the app or taps sync. If both apps are open, each phone's saves
   overwrite the other's in the Gist.
3. **1 MB ceiling.** GitHub cuts off Gist files over 1 MB when the app reads
   them. At about 6 KB per recipe, that is roughly 120–150 recipes before
   loading breaks.

## Working on the code

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev       # local dev server with live reload
npm run build     # production build into dist/
npm run preview   # serve the production build locally
```

Main files:

- `src/store.ts` — all app state and the save/sync logic
- `src/services/gistStorage.ts` — GitHub Gist read/write and merge
- `src/services/geminiService.ts` — Gemini calls and the non-AI fallback parser
- `src/components/*Tab.tsx` — one file per tab
- `src/types.ts` — data shapes (Recipe, MealPlan, ShoppingListItem, …)

## History

- `Import original AI Studio export` — the code exactly as exported.
- `Clean up AI Studio leftovers` — removed ~67 one-off patch/debug scripts,
  the Express dev server and unused packages (`firebase`, `@google/genai`,
  `motion`, `express`, `dotenv`). The app code in `src/` is unchanged.
  Anything removed can be recovered from the first commit.
