// Realistic data for reviewing the app: 8 recipes, this week (part cooked), next week (draft), freezer, staples.
// Every flow runs on the same day: Wednesday 14 Oct 2026, 4:30pm in London (pin the browser clock to it too).
const TEST_NOW = new Date('2026-10-14T16:30:00+01:00');
function mondayOf(d) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; }
function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
let n = 0;
const ing = (name, amount, unit, category = 'Pantry', note) => ({ id: 'i' + (++n), name, amount, unit, category, ...(note ? { note } : {}) });
const recipe = (id, name, servings, prep, cook, ingredients, instructions, extra = {}) => ({
  id, name, description: '', servings, prepTime: prep, cookTime: cook, ingredients, instructions,
  methodInstructions: { oven_hob: instructions }, cookingMethods: ['oven_hob'], tags: ['Stovetop'], isVegetarian: false, isVegan: false, ...extra,
});
const RECIPES = [
  recipe('r-bol', 'Spaghetti bolognese', 4, 15, 45, [
    ing('olive oil', 1, 'tbsp'), ing('onion', 1, '', 'Produce', 'finely chopped'), ing('carrots', 2, '', 'Produce', 'finely chopped'),
    ing('celery sticks', 2, '', 'Produce'), ing('garlic cloves', 2, '', 'Produce', 'crushed'), ing('beef mince', 500, 'g', 'Meat & Seafood'),
    ing('chopped tomatoes', 2, 'x 400g tins'), ing('tomato purée', 1, 'tbsp'), ing('beef stock cube', 1, ''), ing('spaghetti', 400, 'g'), ing('parmesan', 0, '', 'Dairy', 'to serve')],
    ['Heat 1 tbsp olive oil in a large pan and fry the onion, carrots and celery for 10 mins.', 'Add the garlic and 500g beef mince and brown for 5 mins.', 'Tip in the tomatoes, purée and crumbled stock cube, then simmer for 30 mins.', 'Cook 400g spaghetti following pack instructions. Serve with parmesan.']),
  recipe('r-tikka', 'Chicken tikka masala', 4, 15, 30, [
    ing('chicken breasts', 4, '', 'Meat & Seafood', 'cut into chunks'), ing('natural yogurt', 150, 'g', 'Dairy'), ing('tikka paste', 2, 'heaped tbsp'),
    ing('onion', 1, '', 'Produce'), ing('ginger', 1, 'thumb-sized piece', 'Produce', 'grated'), ing('chopped tomatoes', 1, 'x 400g tin'),
    ing('double cream', 100, 'ml', 'Dairy'), ing('coriander', 1, 'small bunch', 'Produce'), ing('basmati rice', 300, 'g')],
    ['Mix the chicken with the yogurt and tikka paste and leave for 10 mins.', 'Fry the onion and ginger for 8 mins, add the chicken and brown.', 'Add the tomatoes and simmer for 15 mins, then stir in the cream.', 'Scatter with coriander and serve with rice.']),
  recipe('r-aub', 'Aubergine & chickpea curry', 2, 10, 25, [
    ing('aubergine', 1, '', 'Produce'), ing('chickpeas', 1, 'x 400g tin'), ing('coconut milk', 400, 'ml'), ing('curry paste', 2, 'tbsp'), ing('spinach', 100, 'g', 'Produce')],
    ['Fry the aubergine for 8 mins.', 'Add the curry paste, chickpeas and coconut milk and simmer for 15 mins.', 'Stir in the spinach.'], { isVegetarian: true, isVegan: true, tags: ['Vegan', 'Stovetop'] }),
  recipe('r-salmon', 'Salmon traybake', 2, 10, 30, [
    ing('salmon fillets', 2, '', 'Meat & Seafood'), ing('new potatoes', 500, 'g', 'Produce', 'halved'), ing('cherry tomatoes', 250, 'g', 'Produce'),
    ing('green beans', 200, 'g', 'Produce'), ing('lemon', 1, '', 'Produce'), ing('olive oil', 2, 'tbsp')],
    ['Heat oven to 200C/180C fan. Roast the potatoes in 2 tbsp olive oil for 15 mins.', 'Add the beans, tomatoes and salmon, squeeze over the lemon and roast for 15 mins more.']),
  recipe('r-chilli', 'Chilli con carne', 6, 15, 60, [
    ing('beef mince', 750, 'g', 'Meat & Seafood'), ing('kidney beans', 2, 'x 400g tins'), ing('chopped tomatoes', 2, 'x 400g tins'), ing('onions', 2, '', 'Produce'),
    ing('red peppers', 2, '', 'Produce'), ing('chilli powder', 2, 'tsp', 'Spices'), ing('ground cumin', 1, 'tsp', 'Spices'), ing('long grain rice', 400, 'g')],
    ['Fry the onions and peppers for 8 mins.', 'Add 750g mince and brown, then the spices.', 'Add tomatoes and beans and simmer for 45 mins.', 'Serve with rice.']),
  recipe('r-sausage', 'Sausage & mash', 4, 10, 30, [
    ing('pork sausages', 8, '', 'Meat & Seafood'), ing('potatoes', 1, 'kg', 'Produce'), ing('butter', 50, 'g', 'Dairy'), ing('milk', 100, 'ml', 'Dairy'),
    ing('gravy granules', 4, 'tbsp'), ing('frozen peas', 300, 'g', 'Frozen')],
    ['Grill the sausages for 20 mins, turning.', 'Boil the potatoes for 20 mins, drain and mash with the butter and milk.', 'Make the gravy and cook the peas.']),
  recipe('r-fajita', 'Chicken fajitas', 4, 15, 15, [
    ing('chicken breasts', 3, '', 'Meat & Seafood', 'sliced'), ing('peppers', 3, '', 'Produce', 'sliced'), ing('red onion', 1, '', 'Produce'),
    ing('fajita seasoning', 1, 'sachet', 'Spices'), ing('tortilla wraps', 8, ''), ing('soured cream', 150, 'ml', 'Dairy'), ing('cheddar', 100, 'g', 'Dairy', 'grated')],
    ['Fry the chicken, peppers and onion with the seasoning for 10 mins.', 'Warm the tortillas and serve with soured cream and cheese.']),
  recipe('r-omelette', 'Cheese omelette', 1, 5, 5, [ing('eggs', 3, '', 'Dairy'), ing('butter', 1, 'knob', 'Dairy'), ing('cheddar', 30, 'g', 'Dairy')],
    ['Whisk the eggs.', 'Melt the butter, cook the eggs for 2 mins, add the cheese and fold.'], { isVegetarian: true, tags: ['Vegetarian', 'Stovetop'] }),
];
const meal = (id, type, recipeId, name, servings, extra = {}) => ({ id, type, recipeId, name, servings, ...extra });
function plan(mon, mealsByDay, status) {
  const start = iso(mon);
  const days = {};
  DAYS.forEach((d, i) => { const dd = new Date(mon); dd.setDate(mon.getDate() + i); days[d] = { date: iso(dd), meals: mealsByDay[d] || [] }; });
  return { id: `plan-${start}`, startDate: start, days, status, isCurrent: false, lastModifiedAt: 1 };
}
function reviewSeed() {
  const thisMon = mondayOf(TEST_NOW);
  const nextMon = new Date(thisMon); nextMon.setDate(thisMon.getDate() + 7);
  const thisWeek = plan(thisMon, {
    Monday: [meal('m1', 'recipe', 'r-bol', 'Spaghetti bolognese', 2, { cooked: true })],
    Tuesday: [meal('m2', 'recipe', 'r-salmon', 'Salmon traybake', 2, { cooked: true })],
    Wednesday: [meal('m3', 'leftover', 'r-bol', 'Spaghetti bolognese', 2, { cooked: true })],
    Thursday: [meal('m4', 'recipe', 'r-tikka', 'Chicken tikka masala', 2)],
    Friday: [meal('m5', 'takeout', undefined, 'Takeaway', 2, { note: 'Pizza night' })],
    Saturday: [meal('m6', 'recipe', 'r-chilli', 'Chilli con carne', 4)],
    Sunday: [meal('m7', 'recipe', 'r-sausage', 'Sausage & mash', 2)],
  }, 'finalized');
  const nextWeek = plan(nextMon, {
    Monday: [meal('n1', 'recipe', 'r-fajita', 'Chicken fajitas', 2)],
    Tuesday: [meal('n2', 'recipe', 'r-aub', 'Aubergine & chickpea curry', 2)],
    Wednesday: [meal('n3', 'recipe', 'r-chilli', 'Chilli con carne', 6, { note: 'Batch cook: freeze 4' })],
    Thursday: [meal('n4', 'recipe', 'r-bol', 'Spaghetti bolognese', 2)],
    Friday: [meal('n5', 'eating_out', undefined, 'Eating out', 2)],
    Saturday: [meal('n6', 'recipe', 'r-salmon', 'Salmon traybake', 2)],
  }, 'draft');
  return {
    recipes: RECIPES,
    mealPlans: [thisWeek, nextWeek],
    batches: [
      { id: 'b1', name: 'Chilli con carne', recipeId: 'r-chilli', portions: 3, dateAdded: iso(new Date(thisMon.getTime() - 20 * 864e5)) },
      { id: 'b2', name: 'Lentil soup', portions: 2, dateAdded: iso(new Date(thisMon.getTime() - 90 * 864e5)) },
    ],
    shoppingList: [],
    preferences: {
      showPrepTime: true, showCookTime: true, showTotalTime: true, showMethod: true, showVegetarian: true, showVegan: true, currencySymbol: '£', maxForwardWeeks: 4, defaultServings: 2,
      recurringItems: [
        { id: 'rec-milk', name: 'Milk', amount: 4, unit: 'pints', category: 'Dairy' },
        { id: 'rec-bread', name: 'Bread', amount: 1, unit: 'loaf', category: 'Bakery' },
        { id: 'rec-bananas', name: 'Bananas', amount: 6, unit: '', category: 'Produce' },
      ],
    },
    groceryOverrides: {},
  };
}
module.exports = { TEST_NOW, reviewSeed, iso, mondayOf };
