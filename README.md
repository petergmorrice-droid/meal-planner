# Family Meal Planner

A private meal-planning app for two: a recipe book, a weekly planner, a shared
shopping list, a cooking view and a freezer tracker. Built originally in Google
AI Studio (export dated 5 October 2026) and now maintained here.

## What's in the app

| Tab | What it does |
| --- | --- |
| **Cookbook** | Your recipe book. Paste a recipe and Gemini copies it in exactly as written (or describe one and Gemini writes it). Each ingredient is linked to a product on your grocery list. Text can be selected and copied. |
| **Planning** | Pick meals for each day of the week, up to 4 weeks ahead. Finalise a week to build its shopping list. |
| **Shop** | Shopping list grouped by aisle, generated from the week's meals plus staples and extras. |
| **Cook** | This week's cooking schedule with step-by-step cook mode (oven/hob or Ninja). |
| **Freezer** | Batch-cooked meals in the freezer, which can be dropped into a week's plan. |
| **Settings** | Past weeks, grocery database, household, connections (GitHub sync + Gemini key), and backup. |

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

## Putting it online

`npm run build:single` produces the app in `dist-single/`: the whole app in
one `index.html`, plus four small files that let it open without signal and
be added to the home screen (`sw.js`, `manifest.webmanifest`, `icon-192.png`,
`icon-512.png`). To host it free on GitHub Pages:

1. On github.com, create a new **public** repository (e.g. `meal-planner`).
2. **Add file → Upload files**, drag in all five files together, and commit.
3. **Settings → Pages**: set *Source* to "Deploy from a branch", branch
   `main`, folder `/ (root)`, and save.
4. After a minute the app is at `https://<your-username>.github.io/meal-planner/`.
   Open it on each phone and add it to the home screen from the browser's
   share menu (iPhone: Share → *Add to Home Screen*).

To update, upload the new files over the old ones (all five; if only
`index.html` changed that's enough, but uploading all is always safe). The
code holds no passwords or keys (those are entered on each phone), so a
public repository is fine. Keep the address the same between updates: each
phone's saved settings belong to the address.

**iPhone:** the home-screen app keeps its own storage, separate from Safari.
The first time you open it from the home screen, enter the GitHub and Gemini
details again (*Settings → connections*, choose **Pull**) and everything
comes down from the Gist.

## Opening without signal

After the app has been opened once with signal, it opens without any: in
the supermarket, on a train, in airplane mode. Your lists and recipes are
already kept on the phone; changes made offline are uploaded when the phone
is back online.

- With signal, the app checks for a newer version (waiting at most 3
  seconds), so an update you upload shows up the next time it's opened.
- With no or very weak signal, the saved copy opens straight away.
- Gemini and syncing need signal; everything else works without it.

This is done by `public/sw.js` (a "service worker"). It only saves the app's
own files; your data is never sent anywhere new.

> Earlier versions used a Firebase database created by AI Studio. The current
> version does not read from it. If any old data only exists there, it would
> need a one-off import.

## How shopping quantities work

Every product you buy has one **master record** in the grocery list
(*Settings → grocery database*): its name, aisle, the unit you buy it in and
the step it's sold in (e.g. Beef Mince: 250 g steps; Chopped Tomatoes: 1 can).
The app also knows how recipe amounts relate to it (a can is 400 g, a garlic
clove is 5 g, an onion is about 150 g, a tablespoon is 15 ml…).

When a week is finalised the app:

1. **Links each ingredient to its product**, whatever the recipe calls it:
   "chicken breasts", "2 skinless chicken breast fillets" and "Chicken breast"
   are all *Chicken Breasts*. Look-alikes are kept apart: "ground coriander"
   is the spice, not fresh coriander, and "onion powder" isn't onions.
2. **Converts every amount into that product's measure**, using standard
   units (g, kg, ml, l, tsp, tbsp, cup, pinch, clove, can…, in any spelling).
3. **Adds them up across the week** and rounds up to whole packs:
   200 g + 1 can + 400 g of chopped tomatoes = 1000 g = **3 cans**.
4. **Never adds things that can't be compared.** If an amount can't be
   converted (e.g. "2 cups" of something sold by weight), the line is marked
   **check amount** with a note, instead of being added in.
5. **Store-cupboard items** (oils, salt, spices, flour, rice, pasta, stock)
   are marked **check cupboard**, so you can skip them if you have some.

Recipes keep their own wording for cooking; only the shopping list uses the
standard names.

## How a recipe is imported

Pasting a recipe takes two small Gemini requests, and the app does the rest:

1. **Gemini copies the recipe.** Every ingredient line is copied as written
   (name, amount, unit, and a note such as "finely chopped"), the method word
   for word, and the servings as stated. Nothing is scaled, converted or
   renamed. Gemini also says whether the recipe is vegetarian, vegan,
   gluten-free and dairy-free.
2. **The app links ingredients it recognises** to grocery-list products
   ("garlic cloves" → *Garlic*, "chicken breasts" → *Chicken Breasts*).
3. **Gemini is asked only about the rest**, with the grocery list in front of
   it ("polpa" → *Chopped Tomatoes*, "San Marzano tomatoes" →
   *Plum Tomatoes*). It can only pick a name from the list, or nothing.
4. **Anything still unknown** goes to the "Map Ingredient" step, where you link
   it to a product, add a new one, or keep it as it is.

If step 3 fails (e.g. the free daily limit), the recipe still imports; a few
more ingredients just come up in "Map Ingredient". If step 1 fails, the app
says so and saves nothing, rather than guessing.

A recipe that serves 4 is saved as serving 4. When you plan it for 2, the
shopping list and the amounts in cook mode are worked out for 2 by the app.
"Gluten-Free" and "Dairy-Free" labels only appear when both Gemini and the
ingredient list agree, because a wrong free-from label is worse than none.

The code is in `src/shopping/` (`units.ts`, `names.ts`, `catalog.ts`,
`quantities.ts`, `linking.ts`) and is covered by `tests/shopping.test.mjs`
and `tests/recipeImport.test.mjs`.

## How syncing between phones works

- **Every edit uploads within about a second.** Before uploading, the app
  downloads the latest copy and combines it with its own, so neither phone
  overwrites the other's changes.
- **The other phone's changes appear within about 20 seconds** while the app
  is open, and straight away when you switch back to the app or come back
  online. These checks use GitHub's "has it changed?" request, which is free
  and doesn't count towards GitHub's limits.
- **Changes are combined item by item**, and settings one setting at a time.
  If you both change different things, both are kept. If you both change the
  same thing, the later change wins.
- **A new phone never overwrites your data.** The default settings and
  built-in grocery list a phone starts with always give way to the real
  shared data when it first connects.
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
npm test          # tests for syncing, shopping quantities and recipe import
```

Main files:

- `src/store.ts` — all app state, saving, and the background sync loop
- `src/services/syncMerge.ts` — how two phones' data is combined
- `src/services/gistStorage.ts` — GitHub Gist read/write (incl. splitting large data)
- `src/shopping/` — standard units, product matching and shopping quantities
- `src/utils/initialGroceryDb.ts` — the built-in grocery list (pack sizes are in `src/shopping/catalog.ts`)
- `src/services/geminiService.ts` — Gemini calls (copying a recipe, suggesting products)
- `src/components/*Tab.tsx` — one file per tab
- `src/types.ts` — data shapes (Recipe, MealPlan, ShoppingListItem, …)
- `public/` — `sw.js` (opening without signal), the manifest and icons
  (`scripts/make-icons.py` draws the icons)

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
- `Standard units and products for shopping quantities` — every ingredient is
  linked to one product and converted to its measure before adding up, so
  the list shows real shop quantities (fixes "200 cans of tomatoes", "63 ball
  mozzarella", "76 onions"). 65 common products added (spices, fresh herbs,
  chorizo, crème fraîche…), store-cupboard items flagged, unconvertible
  amounts flagged instead of added, Gemini given standard names/units, and a
  clear message instead of a silent bad guess when Gemini fails. Sync now
  merges settings one by one and never lets a new phone's defaults win.
- `Gemini copies recipes; the app does the maths` — importing a recipe no
  longer lets Gemini rewrite it: names, amounts, units, notes, method and
  servings are kept exactly as written, at temperature 0. Matching to the
  grocery list is a separate small request about only the ingredients the app
  can't link itself. Notes ("finely chopped") are kept and shown, units like
  "small bunch" or "heaped tbsp" are understood, and free-from labels are no
  longer put on pasta or cheese dishes.
- `Opens without signal, plus quick fixes` — the app can be added to the
  home screen and opens with no signal. Shopping amounts read as you buy
  them (1 kg, not 1000 g; milk in pints). Cook mode and recipes show kitchen
  fractions (½ onion, not 0.5). Recipe text can be selected and copied, and
  the smallest text is bigger. The made-up cost and health figures, the
  sample-data button and the developer tools in Settings are gone. "Next
  week" labels no longer slip a day in the week the clocks change.
