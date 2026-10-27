# Family Meal Planner

A private meal-planning app for two: a recipe book, a weekly planner, a shared
shopping list, a cooking view and a freezer tracker. Built originally in Google
AI Studio (export dated 5 October 2026) and now maintained here.

## What's in the app

The bar along the bottom has five tabs: Cookbook, Planning, Shop, Cook and **More**, which opens a small menu
for the Freezer and Settings (More takes the colour of whichever of the two you're on).

| Tab | What it does |
| --- | --- |
| **Cookbook** | Your recipe book. Add a recipe by pasting it, pasting a link to it (Gemini opens the page), taking a photo of a cookbook page, or asking Gemini to write one; on Android you can also share a recipe page from Chrome to the app. Gemini copies recipes exactly as written, then you check them on the same editor as the recipe page, where each ingredient shows what it's bought as on the shopping list (*Shop as*). It spots recipes you already have (replace or keep both). Search covers names, ingredients and notes; one-tap filters: Favourites, Not had lately, Under 30 min, Veggie, Ninja, Slow cook, In the freezer (*Slow cook* is worked out from a recipe saying "slow cook", "slow cooker" or "crock pot" in its steps, name or tags, or set with the *Slow cook* switch on the recipe's editor). Cards show the time, Oven/Hob or Ninja, Slow cook, vegetarian/vegan, when you last had it (or when it's planned) and portions in the freezer. Opening a recipe shows everything on one page, with Favourite, Share, *Start cooking* and *Add to a day…*. |
| **Planning** | Pick meals for each day of the week, up to 4 weeks ahead: one tap adds a recipe for your usual number of people (*Settings → Household*). It opens on next week; ‹ › switch weeks. Two views, chosen per phone under the eye button: *Classic* (search and one-tap filters for your meals, drag them onto the week strip below) and *List* (the seven days as a list). Today is highlighted, past days greyed, cooked meals ticked, leftovers say where they're from ("Leftovers from Mon") and the cook day says how many to cook for. Adding a recipe that's in the freezer, or that an earlier day already cooks, asks how you're having it: *Leftovers from Wed*, *From the freezer* (nothing to buy) or *Cook it fresh*. Tap a day for one panel: people, sides, notes, change meal, move or swap (leftovers follow), remove (with Undo). An M–S row shows the week at a glance. *Send to shopping list* puts the week's ingredients on the list; change it afterwards and an *Update list* button appears (and a note on Shop), which opens the same check-the-week window, saying which days changed; updating starts the week's meal ingredients again (anything already ticked or marked out of stock on Shop goes back on unticked, and the window says how many first), keeping weekly staples, things you added and notes. *Copy a week* fills an empty week from another. |
| **Shop** | The week's list: meal ingredients, weekly staples and anything you add, one row per product, aisle by aisle in the order you walk your shop (*Arrange aisles…*; shared by both phones). ‹ › switch weeks; it opens on next week. Type to add ("2 pints milk", "6 eggs", "bin bags"), or *Browse*; *Add a recipe's ingredients…* for a batch cook or anything not on the plan. Tick the circle (it stays in place, crossed out with *Undo*, for a few seconds before moving down, here and in shopping mode); tap the rest of a row for its panel: amount, note ("semi-skimmed"; remembered for that product, so it comes back whenever it goes on the list again, until you clear it), aisle (remembered), which meals it's for, favourite, move to the following week, remove (with Undo). Adding something new asks straight away whether to save it as a product (and a weekly staple or favourite). A *cupboard check* takes off the oils, spices, rice and stock you already have. Share copies the list as text. *Go shopping* is full screen, notes in a coloured box under the item, with % done (milestones at 25/50/75%, a buzz on Android, a party at 100%): finished aisles fold away, *Undo* for the last tick stays in the bottom bar, press and hold for *out of stock* (doesn't count against the %), ticks from the other phone show within seconds ("✓ Rachel"), the screen stays on, and it reopens mid-shop if the phone locks. *Done shopping* moves, keeps or removes anything you didn't get (out-of-stock things only move if you ask), saves the shop to *Past shops* (best and average time) and learns your route round the shop: the aisles and items follow the order you usually pick things up, unless you've arranged the aisles yourself. |
| **Cook** | This week Monday to Sunday as compact cards, opening at today's. Each card has the date down the left, the meal, one line about it (Freezer / Leftovers from Wed / Takeaway, people or "Cook for 4 (2 for Fri)", minutes, sides), the note, a tick on the right, and small *Swap*, *Recipe* and *Note* buttons (the recipe has *Start cooking*). Past days just show the tick. Today's card has more: "Start by 4:45pm to eat at 6pm" (your usual time is in *Settings → Household*, 6pm unless you change it; tap the time to change it just for tonight), anything to do tonight for tomorrow ("Take the chilli out of the freezer tonight", or a marinate/soak/overnight step) and a *Start cooking* button. *Swap* moves the meal to a free day or swaps it with another (Undo). Tapping a meal opens the same panel as Planning. Ticking a freezer meal takes its portions out of the Freezer; ticking a "freeze 4" batch cook asks how many went in; unticking (or Undo) puts it right. Cooking mode: one column starting with *Get everything out* (a checklist with amounts), each step showing what it uses and a *Start N min timer* button; named timers, several at once, +1 min, they ring and buzz until stopped and keep going on every tab; *Voice* (hands-free: say "next", "back", "repeat", "go to step 3", "start the timer", "set a timer for 10 minutes", "how long left", "stop", "what do I need", or "question, …" to ask anything; it reads each step out as you move and only acts on short commands, so kitchen chatter doesn't move the steps; it uses the browser's own speech recognition, so it needs Chrome or Safari and internet), *Ask* (type a question; Gemini answers from the recipe as you're cooking it: your amounts, people, appliance and step; needs the Gemini key), *Big steps* (one step at a time, the text as big as fits on the screen, a normal-sized Next) and *Read* (reads each step aloud as you move to it, with *Read it again*; it uses the phone's own voice, which works in Chrome and Safari and the home-screen app but not inside some other apps' browsers, and says so there); Oven/Hob or Ninja. *Finished* says what goes in the fridge for later leftovers, adds portions to the freezer, asks "Have it again" or "Not for us" (shown on the recipe) and saves a note for next time to the recipe's notes. |
| **Freezer** | What's in the freezer by dish (two chilli batches are one line), oldest first, in **portions** (one person's helping, the same as everywhere else in the app) with "enough for 3 meals for 2". Each shows how long it's been frozen ("Use soon" after 3 months), what the plan already wants from it ("Planned Thu (2) · 5 spare", or a warning if there isn't enough) and *Have it on…* to plan it (nothing to buy). Tap one for its panel: portions, the date it was frozen, a note ("garage freezer, blue tub"), the recipe, and Remove with Undo. *Add* picks from your recipes or takes any name, with portions, date and note. |
| **Settings** | Four tabs. **Phone**: who's using it, the colour theme (Clean, Tab colours, Warm kitchen, Sage garden), the Gemini key with *Test it*, and *About this app*: the version and *Check for updates*; a banner says when newer files have been uploaded. **Household**: how many you usually cook for, when you usually eat, your usual appliance. *Reminders* (the same on both phones; each can be switched off): **Each morning** (9am unless changed, any time from 6am to 11:45am) tonight's dinner, when to start it and anything to do tonight; **Time to start cooking** ("Start cooking: Chilli con carne" at the Cook tab's start time, or 10 or 30 mins before); **The night before** (8pm unless changed, 3pm to 9:45pm) "Take the lasagne out of the freezer" or a marinate/soak step; **Plan next week** (Fridays unless changed, at the morning time) when next week has days with nothing planned, isn't on the shopping list yet, or has changed since it was (the notification opens Planning); and **Added to the shopping list** (notifications only: when the other person adds things by hand, straight away; each one replaces the last and lists everything added in the last 10 minutes: "Rachel added milk, eggs and bin bags"; not for meal ingredients from Send to list). *Show what's coming* lists the next ones. *On this phone*: *Turn on notifications*, and the reminders arrive here as notifications even with the app closed (start-cooking ones only between 3pm and 9:45pm, when the sender is checking). *Send test* reaches every phone at once; *Test in 45 seconds* is for checking with the app closed. Tapping a notification opens the Shop or the Cook tab. Needs *Sync between phones*, and on iPhone the app opened from its Home Screen icon (iOS 16.4 or later); a phone without notifications gets the reminders as calendar alerts instead. *Calendar*: *Meals in my calendar* (needs *Sync between phones*) keeps two calendar feeds in the sync Gist, rewritten whenever the app syncs a change: **Just the dinners**, for a phone with notifications, and **With reminders**, the dinners with the reminders as alerts, for a phone without; it suggests the right one for the phone you're on. Each of you subscribes your own calendar to its link (*iPhone / Mac Calendar*, *Google Calendar*, or *Copy link* for Outlook and others), so new, swapped and removed meals follow by themselves. iPhone and Mac calendars ring the alerts; Google Calendar shows the meals but doesn't ring alerts for calendars added by link. *Download the reminders once* gives a one-off calendar file with alerts (each day keeps the same event id so downloading again can replace rather than double up). Anyone with a feed link can see the plan. *History*: past weeks with what you ate, ticks and verdicts; *Copy to a week…* and *Copy as text*. **Shopping**: shortcuts to Arrange aisles, Weekly staples, Past shops, and *Products* (every product the Shop knows, with how it's sold, its aisle and what uses it: *Used in 3 recipes*; edit, add, other names it goes by, *Same as…* to merge two, remove with a warning and Undo, and tidy-up checks for likely duplicates, products with no aisle and ones not used yet). **Sync & backup**: *Sync between phones*: "Synced 2 min ago" or what's wrong in plain words, *Sync now*, the sync code to copy; or simple setup steps. If sync stops, a banner says so on every tab: straight away when GitHub turns the token down or the shared data can't be found, or after two days without a sync when it's just no internet; *Fix* opens this tab, *Later* hides it until the app is next opened. When GitHub tells the app when the token runs out, that date shows here and the banner warns two weeks before. *Backup & reset*: download (remembers when), restore (shows what's in the file first), products file, reset products to the built-in list, reset settings (keeps staples, aisle order and past shops). |

## Where the data lives

- **On each phone:** everything is saved in the browser's local storage, so the
  app works offline.
- **Shared between phones:** if a GitHub token (and, on the second phone, the
  sync code) is entered in *Settings → Sync between phones*, the whole app
  state is synced to one private GitHub Gist (`family-meal-planner.json`).
  The "sync code" is the Gist ID.
- **Products:** one shared list (*Settings → Products*) holds every product,
  the app's own and yours, and is synced like everything else. Products you
  take off are kept as "removed" so they stay off on both phones.
- **Calendar feeds:** with *Settings → Household → Calendar* on, the same
  Gist also holds `meal-planner-calendar.ics` (just the dinners) and
  `meal-planner-calendar-alerts.ics` (the dinners and the reminders, with
  alerts), which calendars subscribe to at
  `https://gist.githubusercontent.com/<owner>/<sync code>/raw/<file>`.
  Turning it off removes the files.
- **Notifications:** a small sender on Netlify (`netlify/functions/push.mts`,
  project `morrice-meal-planner-push`) keeps each phone's notification sign-up
  under a household key from the synced settings, and passes "added to the
  list" messages to Apple's and Google's push services. The app also sends it the
  coming three weeks' reminder notifications whenever the plan or the reminder
  settings change, and a scheduled function (`netlify/functions/push-schedule.mts`,
  every 15 minutes from 6am to 11:45am and from 3pm to 9:45pm UK time) sends
  whatever is due. Netlify only rebuilds when
  the sender's files change. It makes its own
  signing keys the first time it runs and keeps them in its private Netlify
  storage. Netlify builds it from this repository (`netlify.toml`); the app
  itself stays on GitHub Pages.
- **AI recipe parsing and questions:** use your own Gemini API key, entered in
  *Settings → This phone*. It is stored only on that phone.

There is no server and no database to pay for. The built app is a set of
static files that can be hosted for free anywhere.

## Putting it online

The code lives in the public `meal-planner` repository on GitHub. Every change
pushed to `main` goes through the checks in `.github/workflows/check.yml`,
and when they all pass, GitHub publishes the site (GitHub Pages, free). A
change that fails a check never reaches the phones. The app is at
`https://<your-username>.github.io/meal-planner/`.

Once, when setting up the repository: **Settings → Pages**, set *Source* to
"GitHub Actions". After the first run that passes, open the address on each
phone and add it to the home screen from the browser's share menu (iPhone:
Share → *Add to Home Screen*).

The site is five files (`npm run build:single` makes them in `dist-single/`):
the whole app in one `index.html`, plus four small files that let it open
without signal and be added to the home screen (`sw.js`,
`manifest.webmanifest`, `icon-192.png`, `icon-512.png`). Every check run also
attaches them as *site-files*, if you ever want to host them somewhere else.

The code holds no passwords, keys or household data (keys are entered on each
phone; your data is in a private Gist), so a public repository is fine. Keep
the address the same between updates: each phone's saved settings belong to
the address.

**iPhone:** the home-screen app keeps its own storage, separate from Safari.
The first time you open it from the home screen, enter the GitHub and Gemini
details again (*Settings → Sync between phones*: the token, the sync code
from the other phone, and under *Advanced* choose "Use what's on GitHub")
and everything comes down from the Gist.

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

Every product you buy has one **master record** in the shared product list
(*Settings → Products*): its name, aisle (one of the Shop's aisles), the unit
you buy it in, the step it's sold in (e.g. Beef Mince: 250 g steps; Chopped
Tomatoes: 1 can) and the other names it goes by ("zucchini" is Courgette).
Built-in products and yours are in the same list, and every screen (the Shop,
staples, Planning sides, recipe import) reads it. Merging two products with
*Same as…* moves recipes, staples, favourites and shopping-list lines over to
the one you keep.
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
6. **Says what the meals actually use** when it's less than you buy: "300 g ·
   need 100 g" for chicken breasts, "1 bulb · need 3 cloves" for garlic. The
   item panel shows each recipe's amount ("Chilli con carne (Wed): 2").

Something you add to the list that isn't a product yet ("party poppers")
opens **"Save it as a product for future shops?"** straight away (in the list
and in shopping mode). It's filled in for you: name, aisle and how it's sold
(1 pack, 500 g…), and you can also make it a **weekly staple** (with how many
each week; this week's line becomes the staple's line, so it isn't on the list
twice) and/or a **favourite**. Next time it goes straight into that aisle.
*Not now* closes it (it's still offered in a card at the top of the list and
in its panel, and isn't asked again until the app is next opened); *Don't ask
again* stops it asking about that item, on both phones.

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

Every Gemini request goes to Gemini 3.8 Flash first and, if that can't answer
(its free allowance used up, busy, or too slow), to 3.6 Flash, then 3.1
Flash-Lite, each with its own free allowance. A model that's busy for a moment
is asked once more after a short wait, and one whose allowance for today is
used up is skipped until it comes back (about 8am). Copying jobs ask Gemini to think only briefly, so they take
seconds; writing or changing a recipe uses Gemini's usual amount of thinking.
When neither model answers, the message says why in plain words (the free
allowance, no signal, too slow, busy), with what happened on each model in
small print underneath. The code is `src/services/gemini/client.ts`, tested by
`tests/gemini.test.mjs`.

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
  A week's plan is combined **day by day** (you planning Tuesday while the
  other phone ticks Monday keeps both), and staples, favourites and past shops
  **item by item**. If you both change different things, both are kept. If you
  both change the same thing, the later change wins.
- **A new phone never overwrites your data.** The default settings and
  built-in grocery list a phone starts with always give way to the real
  shared data when it first connects.
- **Deletions stick.** Removing a recipe, a shopping item or a staple leaves a
  dated marker, so the other phone's older copy can't bring it back. Removed
  staples and recipe ingredients stay removed on both phones until you tap
  "Restore removed recipe ingredients". Markers are kept for 90 days.
- **A phone away for over 90 days** (no successful sync) starts from the
  shared copy and adds only what was changed on it since, so things deleted
  meanwhile don't come back. Settings says when this has happened.
- **Keep both phones on the same version.** When a banner says a newer
  version has been uploaded, tap it on both phones. An older copy still syncs
  safely, but it doesn't know about newer things (it would still show
  products you've removed, for example).
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

1. In the **old** app on each phone, open *Settings → Sync between phones*
   and tap **Sync now**, so everything is in the Gist. Note the **sync code**
   (Gist ID) shown there.
2. **Stop using the old app** on both phones. Its older sync can undo
   deletions made in the new one.
3. Open the **new** app → *Settings → Sync between phones*. Paste your GitHub
   token and the sync code, leave *Advanced* on **Combine both**, and tap
   **Connect to the other phone**. Do the same on the second phone.
4. Re-enter the Gemini key (*Settings → This phone*, then **Test it**), and
   check *Who's using this phone* shows the right person.

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
npm test          # tests for syncing, shopping quantities, recipe import and Gemini requests
npm run typecheck # strict TypeScript check (nothing unused)
npm run lint      # code checks (ESLint, with React's rules for hooks)
npm run format    # tidy the layout of every file (Prettier); format:check only checks
npm run test:e2e  # builds the app and runs the browser tests (tests/e2e/README.md)
```

Main files:

- `src/store/` — all app state: `index.ts` (the store and the background sync
  loop), `saved.ts` (what's saved on the phone and how the app starts),
  `edits.ts` and `productEdits.ts` (every way to change the data, each saved
  through the store's `commit`)
- `src/services/syncMerge.ts` — how two phones' data is combined
- `src/services/gistStorage.ts` — GitHub Gist read/write (incl. splitting large data)
- `src/shopping/` — standard units, product matching and shopping quantities;
  `aisles.ts` (the one set of aisles), `productList.ts` (keeping the product
  list in one piece; remove, merge, other names, tidy-up checks)
- `src/utils/initialGroceryDb.ts` — the built-in grocery list (pack sizes are in `src/shopping/catalog.ts`)
- `src/services/geminiService.ts` — Gemini: the rest of the app imports from
  here; the code is in `src/services/gemini/` (`client.ts` the key and the
  request, `recipes.ts` the recipe requests, `recipeRules.ts` turning answers
  into recipes, `prompts.ts` what Gemini is told, `products.ts` product tidy-up)
- `src/components/*Tab.tsx` — one file per tab. The biggest are split up:
  the Shop's pieces are in `src/components/shop/` (shopping mode, the sheets,
  and hooks such as `useShopWeek`, `useNewProducts`, `useShoppingTrip`), and
  Planning's are in `src/components/planner/` (the windows, and hooks such as
  `usePlanningWeek`, `useWeekEditor`). Settings' pages and sections are in
  `src/components/settings/` (this phone, household, sync, backup, about,
  products, history). The Cook tab's and cooking mode's are in
  `src/components/cook/` (a day's card, tonight's panel, the steps two ways,
  the finished screen, the timers). Changes to the shopping list are plain
  functions in `src/shopListEdits.ts`; changes to a week's meals are in
  `src/planning.ts`. Both have unit tests.
- `src/staples.ts` — the one way weekly staples are made, changed and removed
  (the staples window, "Add every week?", saving a new product as a staple)
- `src/types.ts` — data shapes (Recipe, MealPlan, ShoppingListItem, TabName, …);
  `AppStore` (in `src/store/index.ts`) is what every screen gets from the store
- `public/` — `sw.js` (opening without signal), the manifest and icons
  (`scripts/make-icons.py` draws the icons)

Effects (code that runs after the screen updates) list everything they use.
When one should run only when certain things change but needs other values as
they are at that moment, that part goes in React's `useEffectEvent`. Code that
runs later, such as an Undo or the microphone's callback, reads the newest
value through `useLatest(value)` (`src/hooks/useLatest.ts`). No lint warnings
are switched off (`eslint-disable`) anywhere. If one ever has to be, say why on
the same line.

Layout is Prettier's (single quotes, lines up to 120 characters,
`.prettierrc.json`), so nobody has to think about it. Run `npm run format`
before committing; GitHub checks it. Code checks are in `eslint.config.js`:
ESLint's and typescript-eslint's recommended rules plus React's two hook
rules. A name starting with `_` marks something unused on purpose. There's
no `any` anywhere (the check fails on one): data from outside (the Gist,
Gemini, backups, files, the browser's speech) is described as the shape the
app expects with every field optional, or as `unknown`, and checked before
it's used. `messageOf(err)` (`src/errors.ts`) reads what was thrown. For an
empty list that shouldn't count as a change on every render, use
`EMPTY_LIST` (`src/emptyList.ts`) rather than a new `[]`.

## Automatic checks on GitHub

`.github/workflows/check.yml` checks every change on a fresh machine: the
strict type check, the code checks, the formatting, the unit tests, a full
build and all the browser tests
(about 10 minutes). It runs whenever code is pushed, and from the *Run
workflow* button on the repository's *Actions* tab. A green tick next to a
commit means everything passed; a red cross means something didn't. Open the
run to see which step failed. When browser tests fail, their screenshots and
logs are attached as *browser-test-results*.

When everything passes on `main`, the last step publishes the site (see
*Putting it online*). Every run that gets past the build also attaches
**site-files**, the five files of the site as GitHub built them.

It's free: public repositories have no limit on these runs.

`package-lock.json` pins the exact version of every package, so every run
installs what was last tested, and a new release of a tool can't break the
build without anyone changing anything. It was made by GitHub, not by hand:
when there isn't one, the first run that passes commits the one it made
(the `save-lock` step). To move to newer versions, delete it and push; the
next run that passes saves a new one.

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
- `Freezer and Settings rebuilt` — the Freezer counts portions like the rest
  of the app (it said "3 meals · 2 adults each" for 3 portions), groups a
  dish's batches, shows how long things have been frozen and what the plan
  wants, plans a freezer meal on a day, and has a panel with Undo and a
  better Add (`src/freezer.ts`, tested; `BatchItem.note`). Settings is one
  page (`SettingsTab.tsx`, helpers in `settingsInfo.ts`): the Multi-cooker
  model (unused) and the duplicate Gemini clean-up are gone; Products and
  Past weeks are their own pages; restore previews the file; reset keeps
  staples, aisle order and shop history; the build stamps a version into
  index.html and sw.js (`appVersion.ts`) so Settings shows it and a banner
  offers new uploads.
- `One product list, safer syncing` — products were in three places (the
  synced list, separate per-product changes, and newer built-in products kept
  only in the code), and screens read different ones. Now there is one synced
  list: older data is folded in automatically (`normaliseProducts`), every
  product's category is one of the Shop's aisles, removals are kept as markers
  so they stick (built-in ones too), and merges point old links at the product
  kept. The Products page shows everything the Shop uses with what uses it,
  *Same as…*, other names, and tidy-up checks. Syncing combines weeks day by
  day and staples, favourites and past shops item by item (always the same
  answer whatever order the phones sync in, tested with random edits), and a
  phone away for over 90 days takes the shared copy first.
- `UK products` — the built-in products checked against what UK supermarkets
  sell: real pack sizes (chicken breasts in 300 g, potatoes in 2.5 kg bags,
  pasta 500 g, rice 1 kg, flour 1.5 kg, frozen peas 1 kg…), UK names (Peppers,
  Soft Cheese, Soured Cream, Tinned Tuna, Washing-up Liquid, Toilet Roll…),
  rice and grains in their own aisle, and separate products for things you
  buy separately (plain / self-raising / strong flour; granulated / caster /
  icing sugar; chicken / beef / vegetable stock; red / white wine; tikka,
  korma and Thai pastes). About 70 UK staples added (parsnips, swede, baby
  potatoes, gammon, crumpets, Marmite, Yorkshire puddings, cling film…). The
  new defaults are applied once (`CATALOG_VERSION` 4, `DEFAULT_CHANGES` in
  `src/shopping/catalog.ts`), only to products you haven't changed yourselves.
- `No dark pop-ups` — every short message ("Note saved", "Removed Milk ·
  Undo") is now one light notice (`src/components/Notice.tsx`) at the bottom,
  just above the tabs, so it never covers the add box. In shopping mode it
  sits above the Done shopping bar. The "can't read aloud here" note in
  cooking mode is a light note too.
- `Ask to save new items straight away` — adding something that isn't a
  product yet opens a light "Save it as a product for future shops?" sheet
  (`src/components/shop/SaveProductSheet.tsx`) with weekly staple and
  favourite options; the add box lets go of the keyboard so the whole
  question shows. Amounts under one now read singular ("need ½ can").
- `New products add up` — saving something as a product puts this week's line
  in the unit it's sold in ("1" becomes "1 pack"), so adding another makes
  "2 packs", not "1 + 1 pack". Lines saved that way before this are fixed when
  the Shop opens (`fitHandAddedToProducts` in `src/shopList.ts`).
- `Added by you, always` — every item's panel has an "Added by you" amount,
  at 0 when you haven't added any, so + adds one of your own on top of what
  the meals or staples need (1 can of chickpeas); − at its smallest takes it
  off again.
- `Colours` — each aisle has its own colour and icon in the Shop list,
  shopping mode, the item panel, Arrange aisles and Products
  (`src/components/AisleLook.tsx`); each tab has its own colour (Cookbook
  amber, Planning green, Shop blue, Cook orange, Freezer ice-blue, Settings
  grey); and one meaning per colour everywhere else: green = go/done (all
  main buttons, no more black ones), amber = check this, red = remove or out
  of stock, blue = information. The stray purple accents are gone.
- `Notes and (i)` — a note on an item shows under the meals it's for, never
  instead of them. Every row (the list and shopping mode) has an (i): which
  meals it's for with each day and amount, extra recipes, the weekly staple,
  what was added by hand and by whom, who sent the meals to the list, the
  note, and who ticked it (`src/components/shop/ItemInfoSheet.tsx`). It
  never ticks the row; on the list, *Change it* opens the item panel.
- `Colour themes` — *Settings → This phone → Colour theme*: Clean (white and
  light grey, as before), Tab colours (each screen's page and top bar in its
  tab's colour), Warm kitchen (oat and cream, terracotta bars, warm greys) and
  Sage garden (soft green). Each phone keeps its own (`src/theme.ts`; the
  colours are in the "Colour themes" block of `src/index.css`, which sets the
  page, top bars and tab bar and, for Warm and Sage, retints the greys).
  Green for go/done, amber, red and the aisle colours are the same in every
  theme.
- `Who changed it: Peter blue, Rachel pink` — a small blue P or pink R tick
  shows who last added or changed something: on the shopping list for what
  was added by hand (list, shopping mode, item panel, (i)), on each planned
  day (Planning, Cook) and on freezer meals; "✓ Rachel" for who ticked it is
  in her colour too. Notes (shopping items, meals, freezer meals, a recipe's
  "Our notes") are in their writer's colour; notes written before this was
  recorded stay amber. Recorded on the phone when something is saved
  (`src/whoChanged.ts`: `editedBy`, `noteBy`, a day's `updatedBy`, a freezer
  meal's `addedBy`/`lastModifiedBy`, a recipe's `notesBy`) and synced with
  it; ticking something doesn't count as changing it.
- `Notes reach cooking` — the Cook tab's day card shows the recipe's own
  notes ("Recipe notes: …") under the day's note; cook mode has a Notes strip
  at the top with the day's note and the recipe's notes, each in its writer's
  colour, open at the start and folded to one line after the first step (tap
  to see them again).
- `Planning fits, coloured days, full week summary` — the recipe pop-up
  always has *Our notes* at the top (add or change them right there). The
  Planning week strip is a little taller and its day cards fit (one-line
  day and date, labels on one line, the meal name never squashed). Leftover
  days are amber and freezer meals faint ice blue, on Planning and Cook
  (`dayTone` in `src/components/planner/DayListRow.tsx`). *Send to list*
  shows every day in full: meal, kind, people, who it cooks for, sides, the
  day's note and the recipe's notes, with Edit opening that day.
- `Ratings` — you and Rachel each give a recipe 1 to 5 stars: "How was it?"
  at the end of cooking, *Rate it* on a cooked day in Cook, and *Our
  ratings* in the recipe pop-up (tap yours; the other person's shows in their
  colour). Cards show "★ 4 5" (blue, pink), Cookbook and Planning can sort by
  *Best rated*, and History shows them. Kept as one rating per recipe per
  person (`preferences.ratings`, `src/ratings.ts`), synced one at a time so
  you can both rate at once. They replace the old thumbs up/down.
- `Suggested staples` — anything added by hand in 3 of the last 6 weeks gets
  "Add every week?" on the Shop list (`suggestedStaples` in
  `src/shopList.ts`). Choose how much each week and it becomes a weekly
  staple (this week's line becomes the staple's line); *Not a staple* stops
  suggesting it on both phones (`preferences.notStaples`).
- `Safety` — the browser tests now live in the project (`tests/e2e/`, run
  with `npm run test:e2e`), not just on the machine that wrote them. Each
  phone saves one copy of the data instead of three (the old duplicate copies
  are removed), and if the phone's storage is full the app says so plainly
  with a Backup button instead of failing silently. Shopping lines from more
  than 10 weeks ago are cleared, through the normal save so the other phone
  clears them too (`oldShoppingLineIds`), so the data and every sync stop
  growing. Each tab has a safety net (`src/components/ErrorBoundary.tsx`): if
  something goes wrong on one, it shows *Try again* / *Reload the app* and
  the other tabs keep working. The product list is kept in memory for the
  Shop's matching (`src/shopping/current.ts`) instead of being re-read from
  storage each time.
- `Smaller screens` — the Shop and Planning screens were one file each (about
  3,800 and 3,000 lines). They're now split into small files: the windows
  (shopping mode, the staples editor, cupboard check, aisle order, Send to
  list, Select meal, Copy a week, the leftover questions…) and hooks for the
  logic, with the list and week changes as plain functions that are unit
  tested (`src/shopListEdits.ts`, `src/planning.ts`). Code that could never
  run (old filters, windows nothing opened) was removed. Nothing looks or
  works differently: the page is identical, step by step, before and after,
  and a new browser test (`screen-pieces`) opens every moved window.
- `One way to make staples` — weekly staples are made, changed and removed in
  one place (`src/staples.ts`) instead of three. That fixed four things in the
  staples window: a new staple starts at one pack (butter 250 g, eggs 6; it
  was 1 g and 1 egg); adding something that's already a staple doesn't make a
  second one; if you'd added it by hand this week, the staple's line takes
  over instead of it being on the list twice; and changing any staple no
  longer brings back staple lines you'd taken off a week.
- `Strict types` — TypeScript now checks strictly (`npm run typecheck`, with
  `strict`, no unused code and no switch fall-through) and passes with no
  errors (there were 10). Every screen gets a typed store (`AppStore`) instead
  of `any`, the tab names are defined once (`TabName`), and loose `any`s in the
  screens were replaced with real types (205 → 165; the rest are where data
  comes in from outside: the Gist, Gemini, backups, browser speech). Unused
  code went: two files nothing used, an old triage window, four unused
  Gemini fallbacks, unused imports, and a second copy of "keep the screen
  on" (cooking and shopping now share one). Nothing looks different: the
  page is identical step by step before and after.
- `Latest data` — every change is worked out from the latest data, not the
  copy on screen (which can be a moment behind). The store takes a change
  as a function (`updateShoppingList(list => …)`, `updatePreferences(p => …)`,
  `changeMealPlan`, `changeBatch`, `changeRecipe`), and the screens use it.
  So two quick taps both count (+ + on milk, freezer portions, people in
  Settings used to add one), and a recipe left open on one phone shows the
  other phone's changes and only saves what you changed (tapping favourite
  used to wipe a note the other phone had just added). Undo puts back only
  the days its change touched. Tests: `quick-taps`, `latest-edits`.
- `Switched-off warnings reviewed` — all 23 places where a code check was
  switched off (mostly "an effect must list what it uses") were checked and
  fixed, so none are left. Effects that run only when something particular
  changes now read the rest through React's `useEffectEvent`. This needs React
  19.2, which is what the app was already built with, so package.json now says
  so and lists React's type definitions, which were missing. Values copied
  into a ref while the screen was being drawn are now copied just after
  (`useLatest`). In the recipe window, two effects became simple calculations
  and a duplicate was removed. Lists the Shop works out (new products,
  suggested staples, product usage) now take the product list explicitly
  instead of relying on it behind the scenes. Nothing looks different: the
  page is identical step by step before and after. A new browser test
  (`follow-changes`) checks four things:
  - old shopping lines are cleared soon after opening;
  - a shared recipe opens "Add a recipe" once;
  - the cooking method you pick stays picked;
  - an edit in progress survives the other phone's change and saves only
    what you edited.
- `Automatic checks on GitHub` — a GitHub Actions workflow
  (`.github/workflows/check.yml`) runs the type check, unit tests, build and
  all browser tests on every push. It attaches the built site files and, when
  browser tests fail, their screenshots. It also makes `package-lock.json`
  from the first run that passes, ready to commit. The type check was also run
  with Node's type definitions included, as TypeScript 5.8 on GitHub does, and
  passes. The browser tests pass two at a time, as they'll run there.
- `Formatting and code checks` — every file is laid out by Prettier in one
  consistent style. The built app is the same as before, apart from some
  spaces in on-screen text now being stored as separate pieces; the text
  shown is identical. ESLint runs on every file (`npm run lint`), with React's
  rules that hooks are called the same way every time and that effects list
  what they use; GitHub checks both on every change. The packages couldn't be
  installed where this was done, so each rule was run with stand-ins built
  from the tools available. They found 23 things to fix, mostly a list that
  wasn't kept up to date or was worked out again on every render, including:
  - Planning's week following "the week asked for" so it can't pull you back
    to it;
  - the Shop's rows following what the meals need;
  - shopping mode's filter following ticks.

  Also fixed: empty error handlers now say why they're empty, three `let`s
  that never change are `const`, and unused names in the tests are gone.
  Nothing looks different: the page is identical step by step before and
  after.
- `No loose types` — the 157 places typed as "anything" (`any`) now have real
  types, and the code checks fail on a new one. The sync merge (59 of them)
  describes the synced data as the app expects it, with every field optional,
  since any version of the app may have written it. The Gemini code (36)
  describes what Gemini is asked to send back. Errors, files and the
  browser's speech features are typed too. Only types changed, apart from:
  - recipes Gemini writes or changes now give each ingredient its own id,
    like recipes copied from text (a new unit test checks this);
  - two helpers left over from the app's old Firebase days, which nothing
    used, were removed.

  Everything else works exactly as before: the page is identical step by
  step, and all the tests pass.
- `Gemini edits keep what they didn't change` — *Change it with Gemini* in a
  recipe used to replace the whole recipe with Gemini's answer. That meant:
  - a recipe for 4 became one for 2;
  - a recipe with oven and Ninja steps lost one of them;
  - favourite, who added it, and who wrote the notes were wiped;
  - every ingredient lost its link to its product.

  Now Gemini is sent just the recipe (how many it serves, the ingredients
  and each appliance's steps), and its answer is applied onto the recipe as
  it was (`applyGeminiEdit`). It keeps the number of people unless you ask
  to change it, gives steps for every appliance, and keeps each unchanged
  ingredient's product link, note and aisle. An answer without ingredients
  changes nothing. Tests: two new unit tests and a new browser test
  (`gemini-edit`), which fails on the old version.
- `Big files split` — the three biggest files are now folders of smaller
  ones, each about one thing:
  - **Settings:** 2,212 lines became 201, plus `settings/` (one file per
    section or page).
  - **Gemini code:** 1,427 lines became `gemini/` (connection, recipe
    requests, turning answers into recipes, what Gemini is told, product
    tidy-up), with `geminiService.ts` as the one place the app imports
    from. Six copies of "read Gemini's JSON answer" became one.
  - **The store:** 1,001 lines became `store/` (the store and its sync,
    what's saved, and the ways to change the data).

  Nothing works differently: the moved code is the same line for line apart
  from names. The page is identical step by step before and after, and all
  the tests pass.
- `Dead ends removed` — searched the whole app for code nothing uses, and
  removed:
  - Cooking mode's meal switcher, which could never appear (cooking mode is
    always opened for one meal), and its handling of switching recipes;
  - "large" versions of the step pieces nothing drew;
  - an unused banner option on the recipe window;
  - thirteen functions and types nothing called, among them four old product
    checks, two week helpers and two test hooks;
  - the recipe "cost" and "health" fields left from the app's first version
    (old saved data that has them is still read fine).

  A search for files, packages or component options nothing uses found no
  others. Cooking mode (1,507 lines → 896) and the Cook tab (1,437 → 766)
  were split into `cook/` too. Nothing looks or works differently: the Cook
  tab and cooking mode are identical step by step before and after (13
  steps, including big steps, timers and ticking), as are Planning and the
  Shop, and all the tests pass.
- `Published from GitHub` — the code now lives in the public `meal-planner`
  repository, and the site is published from it automatically when every
  check passes (GitHub Pages via Actions), instead of five files being
  uploaded by hand. The history is published under GitHub's private
  "noreply" address rather than a personal email address.
- `Reading recipe pages fixed` — adding a recipe from a link could fail with
  "there was no connection, or it took too long" even with good signal:
  - Gemini was left to think at its usual length while also opening the
    page, so it could run past the one-minute limit. Copying jobs (a link, a
    photo, pasted text, matching products, questions while cooking, *Test it*)
    now ask it to think only briefly. Reading a page now gets 90 seconds.
  - Every request set "temperature 0", which Google now says not to do with
    Gemini 3 models (the backup model can repeat itself until the time runs
    out; the newest ones ignore it). It's no longer sent.
  - The message came from whichever model failed last, guessed from its
    wording, so a used-up free allowance could show as "no connection". Now
    each failure is sorted by what Google actually said (the free allowance
    for today or per minute, the key, no signal, too slow, busy, stopped by
    Google's checks, cut off), the message gives the real reason (today's
    allowance says it comes back at about 8am), and the import screen shows
    what happened on each model in small print.
  - An answer that ran on and was cut off is no longer used (part of a recipe
    is worse than none); the other model is asked instead. A wrong key, or no
    signal at all, doesn't wait for a second model that would fail the same
    way. The time limit now covers the whole answer, not just its start.

  Tests: 15 new unit tests (`tests/gemini.test.mjs`) with a stand-in for
  Google, and 5 new browser checks on the import screen.
- `Tinned lentils, and "400 g can" lines` — found checking a real import
  (BBC Good Food's veggie shepherd's pie). Recipes often say "a 410g can
  green lentils", which Gemini copies as 410 with the unit "g can". The app
  didn't know that unit, so:
  - the chopped tomatoes ("400 g can") showed *check amount*;
  - *Shop as → new product* made a "Green Lentils" product sold in "g cans",
    so the list said "205 g canses".

  Now "g can" (and "ml tin", "g jar"…) in a recipe line means that weight,
  so it comes to 1 can; a product made from such a line is sold by the can,
  and products already made that way (like your Green Lentils) work too.
  Lentils from a can or tin go to a new *Tinned Lentils* product (Canned
  aisle) instead of the dried *Lentils* bag; dried, red and puy lentils still
  go to *Lentils*. Tests: four new unit tests, which fail on the old version.
- `The list catches up` — a sent week's list is saved, so a fix like the one
  above (or changing a recipe or a product after sending) didn't reach it:
  *Update list* only appeared when the meals changed. Now the Shop also says
  "Some amounts are out of date" when lines no longer match what the meals
  need, naming them, and *Update list* puts them right. Lines you've bought
  or changed by hand are left alone, and ticks are kept. *Update list* also
  clears a "check amount" that no longer applies (it used to keep the old
  one). Tests: three unit tests and a browser test (`list-catch-up`) of the
  shepherd's pie list as it was on the phone.
- `Written for the number you ask for` — *Ask Gemini to write one* always
  made the recipe for 2 ("macaroni cheese for 4" came back for 2): the
  request said "servings: 2" and the app then set 2 whatever Gemini wrote.
  Now it's written for the number in your request, or for how many you
  usually cook for (*Settings → Household*) if you don't say, and that's the
  number it's saved with. Tests: a unit test and a browser check.
- `Three Gemini models, and fewer wasted requests` — on the phone, 3.8
  Flash's free allowance (only 20 a day) was used up and Flash-Lite happened
  to be busy, so a recipe couldn't be read. Now a busy model is asked again
  after 2.5 seconds; 3.6 Flash, with its own free allowance, is tried before
  Flash-Lite; and a model whose daily allowance is used up is skipped until
  it comes back at about 8am (remembered on each phone; a new key starts
  afresh), so it doesn't cost a wasted request each time. Tests: five new
  unit tests, including the reset time across the clock changes.
- `No waiting minutes` — with three Gemini models, a link that every model
  is slow to read could take three time limits. Now it stops after two
  models run out of time. Test: a unit test.
- `More free Gemini use` — copying (a link, a photo, pasted text), matching
  products and questions while cooking now start on the light models
  (3.5 Flash-Lite, then 3.1 Flash-Lite), which do these jobs well and allow
  hundreds of free requests a day. 3.8 Flash's ~20 a day are kept for
  writing and changing recipes. Test: a unit test.

