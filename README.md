# Family Meal Planner

A private meal-planning app for two: a recipe book, a weekly planner, a shared
shopping list, a cooking view and a freezer tracker. Built originally in Google
AI Studio (export dated 5 October 2026) and now maintained here.

## What's in the app

| Tab | What it does |
| --- | --- |
| **Cookbook** | Your recipe book. Add a recipe by pasting it, pasting a link to it (Gemini opens the page), taking a photo of a cookbook page, or asking Gemini to write one; on Android you can also share a recipe page from Chrome to the app. Gemini copies recipes exactly as written, then you check them on the same editor as the recipe page, where each ingredient shows what it's bought as on the shopping list (*Shop as*). It spots recipes you already have (replace or keep both). Search covers names, ingredients and notes; one-tap filters: Favourites, Not had lately, Under 30 min, Veggie, Ninja, In the freezer. Cards show the time, Oven/Hob or Ninja, vegetarian/vegan, when you last had it (or when it's planned) and portions in the freezer. Opening a recipe shows everything on one page, with Favourite, Share, *Start cooking* and *Add to a day…*. |
| **Planning** | Pick meals for each day of the week, up to 4 weeks ahead: one tap adds a recipe for your usual number of people (*Settings → my household*). It opens on this week Monday–Thursday and next week Friday–Sunday; ‹ › switch weeks. Two views, chosen per phone under the eye button: *Classic* (search and one-tap filters for your meals, drag them onto the week strip below) and *List* (the seven days as a list). Today is highlighted, past days greyed, cooked meals ticked, leftovers say where they're from ("Leftovers from Mon") and the cook day says how many to cook for. Adding a recipe that's in the freezer, or that an earlier day already cooks, asks how you're having it: *Leftovers from Wed*, *From the freezer* (nothing to buy) or *Cook it fresh*. Tap a day for one panel: people, sides, notes, change meal, move or swap (leftovers follow), remove (with Undo). An M–S row shows the week at a glance. *Send to shopping list* puts the week's ingredients on the list; change it afterwards and an *Update list* button appears (and a note on Shop). *Copy a week* fills an empty week from another. |
| **Shop** | The week's list: meal ingredients, weekly staples and anything you add, one row per product, aisle by aisle in the order you walk your shop (*Arrange aisles…*; shared by both phones). ‹ › switch weeks; it opens on the week you're most likely shopping for. Type to add ("2 pints milk", "6 eggs", "bin bags"), or *Browse*; *Add a recipe's ingredients…* for a batch cook or anything not on the plan. Tick the circle (it stays in place, crossed out with *Undo*, for a few seconds before moving down, here and in shopping mode); tap the rest of a row for its panel: amount, note ("semi-skimmed"), aisle (remembered), which meals it's for, favourite, move to the following week, remove (with Undo). A *cupboard check* takes off the oils, spices, rice and stock you already have. Share copies the list as text. *Go shopping* is full screen with % done (milestones at 25/50/75%, a buzz on Android, a party at 100%): finished aisles fold away, *Undo* for the last tick stays in the bottom bar, press and hold for *out of stock* (doesn't count against the %), ticks from the other phone show within seconds ("✓ Rachel"), the screen stays on, and it reopens mid-shop if the phone locks. *Done shopping* moves, keeps or removes anything you didn't get (out-of-stock things only move if you ask), saves the shop to *Past shops* (best and average time) and learns your route round the shop: the aisles and items follow the order you usually pick things up, unless you've arranged the aisles yourself. |
| **Cook** | The week Monday to Sunday as compact cards, opening at today's. Each card has the date down the left, the meal, one line about it (Freezer / Leftovers from Wed / Takeaway, people or "Cook for 4 (2 for Fri)", minutes, sides), the note, a tick on the right, and small *Swap*, *Recipe* and *Note* buttons (the recipe has *Start cooking*). Past days just show the tick. Today's card has more: "Start by 4:45pm to eat at 6pm" (your usual time is in *Settings → my household*, 6pm unless you change it; tap the time to change it just for tonight), anything to do tonight for tomorrow ("Take the chilli out of the freezer tonight", or a marinate/soak/overnight step) and a *Start cooking* button. *Swap* moves the meal to a free day or swaps it with another (Undo). Tapping a meal opens the same panel as Planning. Ticking a freezer meal takes its portions out of the Freezer; ticking a "freeze 4" batch cook asks how many went in; unticking (or Undo) puts it right. Cooking mode: one column starting with *Get everything out* (a checklist with amounts), each step showing what it uses and a *Start N min timer* button; named timers, several at once, +1 min, they ring and buzz until stopped and keep going on every tab; *Voice* (hands-free: say "next", "back", "repeat", "go to step 3", "start the timer", "set a timer for 10 minutes", "how long left", "stop", "what do I need", or "question, …" to ask anything; it reads each step out as you move and only acts on short commands, so kitchen chatter doesn't move the steps; it uses the browser's own speech recognition, so it needs Chrome or Safari and internet), *Ask* (type a question; Gemini answers from the recipe as you're cooking it: your amounts, people, appliance and step; needs the Gemini key), *Big steps* (one step at a time, the text as big as fits on the screen, a normal-sized Next) and *Read* (reads each step aloud as you move to it, with *Read it again*; it uses the phone's own voice, which works in Chrome and Safari and the home-screen app but not inside some other apps' browsers, and says so there); Oven/Hob or Ninja. *Finished* says what goes in the fridge for later leftovers, adds portions to the freezer, asks "Have it again" or "Not for us" (shown on the recipe) and saves a note for next time to the recipe's notes. |
| **Freezer** | Batch-cooked meals in the freezer, which can be dropped into a week's plan. |
| **Settings** | Past weeks, grocery database, household (who's planning, default portions, when you usually eat, appliances), connections (GitHub sync + Gemini key), and backup. |

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
- `Planning: ask "from the freezer or cook it fresh?"` — adding a recipe that
  has portions in the freezer asks whether to use them or cook it fresh,
  the same way an earlier cook in the week asks about leftovers; when both
  apply it's one question with all three choices. Freezer meals use the
  oldest batch, add nothing to the shopping list and stay linked to the
  recipe ("This week: Sun" on its card). Leftovers only come from a day
  cooked from scratch.
- `Shop: one tidy list, Done shopping` — rows are one product each (the same
  rows and count as shopping mode) with a tick circle; the rest of the row
  opens one panel (amount per source, note, aisle remembered for next time,
  meals and days, favourite, move to the following week, remove with Undo)
  instead of a heart, −/+, tick box and bin on every row and the "Edit Milk"
  drawer. Aisles by default and remembered per phone; bought items go to a
  "Bought" group at the end; "12 of 36 bought" at the top. "Add an item…"
  understands amounts and says what's already on the list. Header is
  ‹ week › with "Sent"; opens on the likely week with things to buy (this
  week Mon–Thu, next week Fri–Sun). Shopping mode keeps its % and gets a
  *Done shopping* bar (move / leave / take off what you didn't get, and how
  long the shop took), notes, an add box and screen-awake. Share/copy the
  list as text. "Add batch" is now *Add a recipe's ingredients…* (any
  recipe, any number of people, freezer optional). Fixed: "1000 added" in
  Add items (it was adding up grams), and ~40 colour classes that didn't
  exist (an invisible Done button in Weekly staples, black borders).
- `Shopping mode: route, out of stock, shop together` — finished aisles fold
  to one line; the bottom bar keeps "Undo <last thing>"; All/To buy/Bought
  moved into the menu, the week and count into the green header; press and
  hold an item for *out of stock* (not counted in the %, stays on this list
  unless you ask for it next week at Done shopping); syncs every 6 s while
  shopping and shows who ticked what; reopens into shopping mode for 6 hours
  if the app closes; a no-signal note; learns the order you shop in (shared
  `preferences.shopRoute`); personal best and 25/50/75/100% moments (with a
  buzz on Android); *Past shops* (`preferences.shopHistory`, last 20).
- `Cook tab: tonight, timers, freezer` — the Cook tab is rebuilt
  (`CookTab.tsx`, helpers in `cookInfo.ts`): a Tonight card with a start-by
  time from your dinner time (`preferences.dinnerTime`) and the recipe's
  times, tomorrow's meal and anything to do tonight for it, the week one
  line per day with earlier days folded, ‹ › weeks and the Planning day
  panel. Ticking keeps the freezer right (`PlannedMeal.tookFromFreezer` /
  `froze` remember what changed so unticking undoes it). Cooking mode is one
  column: *Get everything out*, amounts under each step, step timers that
  count from the clock, ring until stopped and survive leaving cooking mode
  (`useCookTimers`, kept on the phone), *Big steps*, *Read* aloud, a clearer
  header ("for 4", prep/cook times, Oven/Hob | Ninja) and a Finished screen
  (fridge, freezer, `Recipe.verdict`, note for next time).
- `Cook tab: fuller day cards, notes that stick` — the week is back to a card
  per day with more on it (times, type, people, sides, cook-extra, note) and
  Cooked / Swap / Cook / recipe buttons on each. Notes now show on the cards.
  Fixed: a note typed in the day panel was lost if you then ticked or moved
  the meal (in Planning too), because two saves in one tap started from the
  same out-of-date week; the store now has `getState()` for the latest.
- `Cook tab: Monday to Sunday, today's card does more` — no separate Tonight
  card or folded days: the whole week in order, opening at today's card,
  which carries the start-by time, tomorrow's prep and Start cooking. Card
  buttons sit in an even grid so they fit on any phone (checked at 320px).
- `When you eat: a setting, 6pm by default` — *Settings → my household → We
  usually eat at* (`preferences.eatAt`, 6pm when not set). Changing the time
  on the Cook tab is for tonight only (`preferences.eatAtTonight`) and says
  so, with a link back to the usual time. (The earlier `dinnerTime`, only
  ever in the preview, is no longer used.)
- `Cook tab: compact cards` — cards about a third of the height: no
  coloured tiles or header bands, the date down the left, one line of
  facts, slim strips for the start time and tomorrow's prep, small
  Swap / Recipe / Note buttons that wrap (none on past days), and a
  shorter *Plan* button in the header.
- `Cooking mode: Big steps fit, Read aloud works` — Big steps shrinks the
  text (30px down to 17px) until the step fits between the header and a
  normal-sized Next; past that it scrolls. Read aloud now starts speaking
  from the tap itself (phones need that), reads long steps in pieces
  (Chrome stops after ~15 s), picks a British voice, shows "Read it
  again", and where the browser can't speak (e.g. Android's in-app web
  view) explains why instead of silently doing nothing (`src/speech.ts`).
- `Cooking mode: voice commands and questions` — *Voice* keeps the
  microphone open (restarting when the browser stops it, pausing while the
  phone is speaking) and acts on short commands only (`src/voiceCommands.ts`,
  tested); questions start with "question", "ask" or "chef". *Ask* (typed)
  and spoken questions go to Gemini with the recipe as it's being cooked
  (`askAboutRecipeApi`), and the answer shows under the header and is read
  out. Read aloud now says kitchen shorthand in words ("500 grams",
  "200 degrees, or 180 degrees fan", "1 and a half"). The cooking-mode
  controls are now four small buttons: Big, Read, Voice, Ask.
