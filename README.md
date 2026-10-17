# Family Meal Planner

A private meal-planning app for two: a recipe book, a weekly planner, a shared
shopping list, a cooking view and a freezer tracker. Built originally in Google
AI Studio (export dated 5 October 2026) and now maintained here.

## What's in the app

| Tab | What it does |
| --- | --- |
| **Cookbook** | Your recipe book. Add a recipe by pasting it, pasting a link to it (Gemini opens the page), taking a photo of a cookbook page, or asking Gemini to write one; on Android you can also share a recipe page from Chrome to the app. Gemini copies recipes exactly as written, then you check them on the same editor as the recipe page, where each ingredient shows what it's bought as on the shopping list (*Shop as*). It spots recipes you already have (replace or keep both). Search covers names, ingredients and notes; one-tap filters: Favourites, Not had lately, Under 30 min, Veggie, Ninja, In the freezer. Cards show the time, Oven/Hob or Ninja, vegetarian/vegan, when you last had it (or when it's planned) and portions in the freezer. Opening a recipe shows everything on one page, with Favourite, Share, *Start cooking* and *Add to a day…*. |
| **Planning** | Pick meals for each day of the week, up to 4 weeks ahead: one tap adds a recipe for your usual number of people (*Settings → my household*). It opens on this week Monday–Thursday and next week Friday–Sunday; ‹ › switch weeks. Two views, chosen per phone under the eye button: *Classic* (search and one-tap filters for your meals, drag them onto the week strip below) and *List* (the seven days as a list). Today is highlighted, past days greyed, cooked meals ticked, leftovers say where they're from ("Leftovers from Mon") and the cook day says how many to cook for. Tap a day for one panel: people, sides, notes, change meal, move or swap (leftovers follow), remove (with Undo). An M–S row shows the week at a glance. *Send to shopping list* puts the week's ingredients on the list; change it afterwards and an *Update list* button appears (and a note on Shop). *Copy a week* fills an empty week from another. |
| **Shop** | Shopping list generated from the week's meals plus staples and extras. A *cupboard check* takes off the oils, spices, rice and stock you already have. Shopping mode shows one line per item, aisle by aisle in the order you walk your shop (*Arrange aisles…* in the view options; shared by both phones). |
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

## Previewing inside Claude

`npm run build:preview` makes `dist-preview/preview.html`: the app with
sample recipes and weeks, as a page that can be opened inside Claude to try
out changes before uploading them. Syncing and Gemini don't work there
(those pages can't connect to GitHub or Google) and nothing reaches your
phones. A note at the top says so, with a button to start again from the
sample.

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
- `Quicker planning and shopping` — adding a meal is one tap (no sides and
  people pop-ups; it uses your household's usual number of people), and
  *Copy a week* on Planning fills a week from another (copied meals aren't
  marked cooked). Shop has a cupboard check (*Have it* takes an item off the
  list, *Need it* keeps it; shared between phones, undoable), compact
  one-line rows in shopping mode (about half the scrolling), and aisles in
  your own order. Meal ingredients start expanded. Fixed: in shopping mode's
  aisle view, ticking an item that appeared twice (e.g. staple milk plus
  extra milk) only ticked one of them.
- `Planning: Classic and List views` — Planning keeps its drag-and-drop
  screen (*Classic*, the default) and gains *List*: the week as seven rows,
  tap a day to pick its meal. The meal chooser now has a search box (names,
  tags or ingredients), lists the book A–Z, and puts anything cooked in the
  3 days before at the top, so leftovers are one tap. A day that cooks for
  later leftovers says so ("Cook for 4: leftovers Sun").
- `Recipe cards and one-page recipes` — one card for Cookbook and Planning,
  about half the height (Planning shows 4 whole recipes instead of 2): one
  time instead of Prep/Cook/Total, only the appliances a recipe really has
  steps for, no made-up times, "Last had 3 weeks ago" / "Planned Thu",
  freezer portions, and a sort including *Not had lately*. The bin is off
  the cards (delete is in the recipe's edit mode). The recipe pop-up is one
  page instead of Info/Instructions tabs, without the aisle labels on
  ingredients, with bigger text, *Add to a day…* (with the usual leftovers
  question), *Our notes* (separate from the recipe's intro) and the website
  it came from, which is kept when the pasted recipe includes its link.
- `Cookbook: find and add recipes faster` — search looks in ingredients and
  notes; one-tap filters with "3 of 8 recipes · Clear"; favourites (star,
  filter, favourites first); a recipe count and an "Add recipe" button; the
  filters no longer count recipes with no time as quick, or call a recipe
  Ninja without Ninja steps. Adding: "Paste a recipe" / "Ask Gemini to write
  one", the appliance already chosen (remembered), a Paste button, import
  from a link (Gemini's URL context tool; if the page can't be read it says
  so rather than guessing) or a photo, and Android's Share → Meals. The
  check screen is the recipe editor, with *Shop as* for each ingredient
  instead of the Map Ingredient pop-up; duplicates can be replaced (same
  recipe, so plans and notes stay) or kept; the new recipe opens after
  saving. Share on the recipe page sends it as text.
- `Planning: clearer week, one panel per day` — today, past days and cooked
  meals are shown; leftovers/freezer/takeaway are labelled and the cook day
  says "Cook for 4: leftovers Wed"; the strip opens on today. Tapping a day
  opens one panel (people −/+, sides, notes, change, move or swap, remove)
  instead of three pop-ups and a bin on every card; moves and removals can
  be undone, and leftovers follow their cook (or become a fresh cook if
  their cook moves after them). An M–S row with "6 of 7 planned" jumps to a
  day; tablets show the whole week. ‹ › switch weeks; Planning opens on this
  week Mon–Thu and next week Fri–Sun. The recipes area uses the Cookbook's
  one-tap filters in the title row, and cards say "This week: Tue".
  "Finalize" is now "Send to shopping list" / "Sent"; changing a sent week
  no longer asks each time: an "Update list" button (and a note on Shop)
  appears instead, worked out from what changed (notes don't count).
  "Takeout" is "Takeaway" throughout.
