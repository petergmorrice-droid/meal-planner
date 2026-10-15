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

## Putting it online (single file)

`npm run build:single` produces `dist-single/index.html`: the entire app in
one file. To host it free on GitHub Pages:

1. On github.com, create a new **public** repository (e.g. `meal-planner`).
2. **Add file → Upload files**, upload `index.html`, and commit.
3. **Settings → Pages**: set *Source* to "Deploy from a branch", branch
   `main`, folder `/ (root)`, and save.
4. After a minute the app is at `https://<your-username>.github.io/meal-planner/`.
   Add it to each phone's home screen from the browser's share menu.

To update, upload the new `index.html` over the old one. The code holds no
passwords or keys (those are entered on each phone), so a public repository
is fine. Keep the address the same between updates: each phone's saved
settings belong to the address.

> Earlier versions used a Firebase database created by AI Studio. The current
> version does not read from it. If any old data only exists there, it would
> need a one-off import.

## How syncing between phones works

- **Every edit uploads within about a second.** Before uploading, the app
  downloads the latest copy and combines it with its own, so neither phone
  overwrites the other's changes.
- **The other phone's changes appear within about 20 seconds** while the app
  is open, and straight away when you switch back to the app or come back
  online. These checks use GitHub's "has it changed?" request, which is free
  and doesn't count towards GitHub's limits.
- **Changes are combined item by item.** If you both change different things,
  both are kept. If you both change the same item, the later change wins.
- **Deletions stick.** Removing a recipe, a shopping item or a staple leaves a
  dated marker, so the other phone's older copy can't bring it back. Removed
  staples and recipe ingredients stay removed on both phones until you tap
  "Restore removed recipe ingredients". Markers are kept for 90 days.
- **Works offline.** Edits are saved on the phone straight away and uploaded
  when the connection returns, even if the app was closed in between.
- **No size ceiling in practice.** GitHub only lets the app read Gist files up
  to 1 MB, so once the data passes 800 KB it is split across several files in
  the same Gist (`family-meal-planner.part1.txt`, …) automatically.

The logic lives in `src/services/syncMerge.ts` (combining and deletions) and
`src/services/gistStorage.ts` (talking to GitHub). `npm test` runs the tests
for the combining rules.

## Moving both phones onto a new version

Each website address keeps its own saved data and settings, so a newly
hosted copy of the app starts empty on each phone. To move across:

1. In the **old** app on each phone, open *Settings → connections* and tap
   **Sync Now**, so everything is in the Gist. Note the **Gist ID** shown there.
2. **Stop using the old app** on both phones. Its older sync can undo
   deletions made in the new one.
3. Open the **new** app → *Settings → connections*. Paste your GitHub token
   and the Gist ID, leave the strategy on **Merge**, and tap
   **Connect Existing Gist**. Do the same on the second phone.
4. Re-enter the Gemini API key (same screen), and check *my household* shows
   the right person for that phone.

If you no longer have the GitHub token, create a new one at
github.com → Settings → Developer settings → Personal access tokens, with the
**gist** permission only.

## Working on the code

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev       # local dev server with live reload
npm run build     # production build into dist/
npm run build:single  # the whole app as ONE file: dist-single/index.html
npm run preview   # serve the production build locally
npm test          # tests for the sync merge rules
```

Main files:

- `src/store.ts` — all app state, saving, and the background sync loop
- `src/services/syncMerge.ts` — how two phones' data is combined
- `src/services/gistStorage.ts` — GitHub Gist read/write (incl. splitting large data)
- `src/services/geminiService.ts` — Gemini calls and the non-AI fallback parser
- `src/components/*Tab.tsx` — one file per tab
- `src/types.ts` — data shapes (Recipe, MealPlan, ShoppingListItem, …)

## History

- `Import original AI Studio export` — the code exactly as exported.
- `Clean up AI Studio leftovers` — removed ~67 one-off patch/debug scripts,
  the Express dev server and unused packages (`firebase`, `@google/genai`,
  `motion`, `express`, `dotenv`). The app code in `src/` is unchanged.
  Anything removed can be recovered from the first commit.
- `Reliable two-phone sync` — deletions stick, changes are combined instead
  of overwritten, background checks every 20 s, offline edits kept, and large
  data split across Gist files. Removed shopping items are now shared between
  phones instead of remembered on one phone only.
