# Browser tests

Each file here drives the real app in a phone-sized Chrome (Playwright) and checks what you'd see:
`shop-list.cjs` adds things to the list, opens panels, shares the list; `cook-tab.cjs` ticks meals
and freezes portions; `products-sync.cjs` runs two phones against a pretend sync service; and so on.
Each prints a `PASS`/`FAIL` line per check and exits with 1 if anything failed.

## Running them

```bash
npm i -D playwright && npx playwright install chromium   # once
npm run test:e2e                                          # builds the app, then runs them all
node tests/e2e/run.mjs dist-single --only shop-list,themes   # some of them, against a built copy
APP_URL=https://you.github.io/meal-planner/ node tests/e2e/run.mjs   # against the copy online
```

The runner serves the built app itself, runs four tests at a time, and runs any that fail once more
on their own (a few timing checks are sensitive to a busy machine) before reporting them.
Screenshots and each test's log go to `tests/e2e/.out/<test>/`.

## Writing one

Copy a short one (`themes.cjs`, `safety.cjs`). Start from `reviewSeed()` in `review-seed.cjs` (two
weeks of meals, recipes, a freezer and a list), change what the test needs, and fix the clock with
`ctx.clock.install(...)` so "today" doesn't depend on when it runs. Find things on screen by their
`data-…` attributes rather than by wording or position.

`fixtures/old-shopping.mjs` is the shopping code from before "One product list", used to build
data the way older copies of the app saved it.
