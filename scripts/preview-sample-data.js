// Sample data for the preview page (scripts/make-preview.mjs). Plain browser
// JavaScript: this whole function is copied into the preview and run there, so
// the sample weeks are always "this week" and "next week" whenever it's opened.
function makeSampleState() {
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const mondayOf = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  };
  const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };
  let n = 0;
  const ing = (name, amount, unit, category, note) => ({
    id: 'sample-i' + ++n,
    name,
    amount,
    unit,
    category: category || 'Pantry',
    ...(note ? { note } : {}),
  });
  const recipe = (id, name, description, servings, prep, cook, ingredients, instructions, extra) => ({
    id,
    name,
    description,
    servings,
    prepTime: prep,
    cookTime: cook,
    ingredients,
    instructions,
    methodInstructions: { oven_hob: instructions },
    methodPrepTime: { oven_hob: prep },
    methodCookTime: { oven_hob: cook },
    cookingMethods: ['oven_hob'],
    tags: ['Stovetop'],
    isVegetarian: false,
    isVegan: false,
    ...(extra || {}),
  });
  const recipes = [
    recipe(
      'sample-bol',
      'Spaghetti bolognese',
      'A family favourite.',
      4,
      15,
      45,
      [
        ing('olive oil', 1, 'tbsp'),
        ing('onion', 1, '', 'Produce', 'finely chopped'),
        ing('carrots', 2, '', 'Produce', 'finely chopped'),
        ing('celery sticks', 2, '', 'Produce', 'finely chopped'),
        ing('garlic cloves', 2, '', 'Produce', 'crushed'),
        ing('beef mince', 500, 'g', 'Meat & Seafood'),
        ing('chopped tomatoes', 2, 'x 400g tins'),
        ing('tomato purée', 1, 'tbsp'),
        ing('beef stock cube', 1, '', 'Pantry', 'crumbled'),
        ing('spaghetti', 400, 'g'),
        ing('parmesan', 0, '', 'Dairy', 'to serve'),
      ],
      [
        'Heat 1 tbsp olive oil in a large pan and fry the onion, carrots and celery for 10 mins.',
        'Add the garlic and 500g beef mince and brown for 5 mins.',
        'Tip in the tomatoes, purée and crumbled stock cube, then simmer for 30 mins.',
        'Cook 400g spaghetti following pack instructions. Serve with parmesan.',
      ],
    ),
    recipe(
      'sample-tikka',
      'Chicken tikka masala',
      'Mild, creamy curry.',
      4,
      15,
      30,
      [
        ing('chicken breasts', 4, '', 'Meat & Seafood', 'cut into chunks'),
        ing('natural yogurt', 150, 'g', 'Dairy'),
        ing('tikka paste', 2, 'heaped tbsp'),
        ing('onion', 1, '', 'Produce', 'sliced'),
        ing('ginger', 1, 'thumb-sized piece', 'Produce', 'grated'),
        ing('chopped tomatoes', 1, 'x 400g tin'),
        ing('double cream', 100, 'ml', 'Dairy'),
        ing('coriander', 1, 'small bunch', 'Produce', 'chopped'),
        ing('basmati rice', 300, 'g', 'Pantry', 'to serve'),
      ],
      [
        'Mix the chicken with the yogurt and tikka paste and leave for 10 mins.',
        'Fry the onion and ginger for 8 mins, add the chicken and brown.',
        'Add the tomatoes and simmer for 15 mins, then stir in the cream.',
        'Scatter with coriander and serve with rice.',
      ],
    ),
    recipe(
      'sample-aub',
      'Aubergine & chickpea curry',
      'Quick vegan curry.',
      2,
      10,
      25,
      [
        ing('aubergine', 1, '', 'Produce', 'cut into chunks'),
        ing('chickpeas', 1, 'x 400g tin', 'Pantry', 'drained'),
        ing('coconut milk', 400, 'ml'),
        ing('curry paste', 2, 'tbsp'),
        ing('spinach', 100, 'g', 'Produce'),
      ],
      [
        'Fry the aubergine for 8 mins.',
        'Add the curry paste, chickpeas and coconut milk and simmer for 15 mins.',
        'Stir in the spinach until wilted.',
      ],
      { isVegetarian: true, isVegan: true, tags: ['Vegan', 'Gluten-Free', 'Dairy-Free', 'Stovetop'] },
    ),
    recipe(
      'sample-salmon',
      'Salmon traybake',
      'One tray, little washing up.',
      2,
      10,
      30,
      [
        ing('salmon fillets', 2, '', 'Meat & Seafood'),
        ing('new potatoes', 500, 'g', 'Produce', 'halved'),
        ing('cherry tomatoes', 250, 'g', 'Produce'),
        ing('green beans', 200, 'g', 'Produce'),
        ing('lemon', 1, '', 'Produce'),
        ing('olive oil', 2, 'tbsp'),
      ],
      [
        'Heat oven to 200C/180C fan. Roast the potatoes in 2 tbsp olive oil for 15 mins.',
        'Add the beans, tomatoes and salmon, squeeze over the lemon and roast for 15 mins more.',
      ],
    ),
    recipe(
      'sample-chilli',
      'Chilli con carne',
      'Makes plenty for the freezer.',
      6,
      15,
      60,
      [
        ing('beef mince', 750, 'g', 'Meat & Seafood'),
        ing('kidney beans', 2, 'x 400g tins'),
        ing('chopped tomatoes', 2, 'x 400g tins'),
        ing('onions', 2, '', 'Produce', 'chopped'),
        ing('red peppers', 2, '', 'Produce', 'chopped'),
        ing('chilli powder', 2, 'tsp', 'Spices'),
        ing('ground cumin', 1, 'tsp', 'Spices'),
        ing('long grain rice', 400, 'g', 'Pantry', 'to serve'),
      ],
      [
        'Fry the onions and peppers for 8 mins.',
        'Add 750g mince and brown, then stir in the spices.',
        'Add the tomatoes and beans and simmer for 45 mins.',
        'Serve with rice.',
      ],
    ),
    recipe(
      'sample-sausage',
      'Sausage & mash',
      'Comfort food.',
      4,
      10,
      30,
      [
        ing('pork sausages', 8, '', 'Meat & Seafood'),
        ing('potatoes', 1, 'kg', 'Produce', 'peeled and chopped'),
        ing('butter', 50, 'g', 'Dairy'),
        ing('milk', 100, 'ml', 'Dairy'),
        ing('gravy granules', 4, 'tbsp'),
        ing('frozen peas', 300, 'g', 'Frozen'),
      ],
      [
        'Grill the sausages for 20 mins, turning.',
        'Boil the potatoes for 20 mins, drain and mash with the butter and milk.',
        'Make the gravy and cook the peas.',
      ],
    ),
    recipe(
      'sample-fajita',
      'Chicken fajitas',
      'Friday-night favourite.',
      4,
      15,
      15,
      [
        ing('chicken breasts', 3, '', 'Meat & Seafood', 'sliced'),
        ing('peppers', 3, '', 'Produce', 'sliced'),
        ing('red onion', 1, '', 'Produce', 'sliced'),
        ing('fajita seasoning', 1, 'sachet', 'Spices'),
        ing('tortilla wraps', 8, ''),
        ing('soured cream', 150, 'ml', 'Dairy'),
        ing('cheddar', 100, 'g', 'Dairy', 'grated'),
      ],
      [
        'Fry the chicken, peppers and onion with the seasoning for 10 mins.',
        'Warm the tortillas and serve with soured cream and cheese.',
      ],
    ),
    recipe(
      'sample-omelette',
      'Cheese omelette',
      'Five-minute lunch.',
      1,
      5,
      5,
      [
        ing('eggs', 3, '', 'Dairy', 'beaten'),
        ing('butter', 1, 'knob', 'Dairy'),
        ing('cheddar', 30, 'g', 'Dairy', 'grated'),
      ],
      ['Whisk the eggs.', 'Melt the butter, cook the eggs for 2 mins, add the cheese and fold.'],
      { isVegetarian: true, tags: ['Vegetarian', 'Gluten-Free', 'Stovetop'] },
    ),
  ];
  const meal = (id, type, recipeId, name, servings, extra) => ({
    id,
    type,
    recipeId,
    name,
    servings,
    ...(extra || {}),
  });
  const plan = (monday, meals, status) => {
    const days = {};
    DAYS.forEach((d, i) => {
      days[d] = { date: iso(addDays(monday, i)), meals: meals[d] || [] };
    });
    return { id: `plan-${iso(monday)}`, startDate: iso(monday), days, status, isCurrent: false, lastModifiedAt: 1 };
  };
  const thisMonday = mondayOf(new Date());
  const today = (new Date().getDay() + 6) % 7; // 0 = Monday
  const cooked = (dayIndex) => ({ cooked: dayIndex < today });
  const thisWeek = plan(
    thisMonday,
    {
      Monday: [meal('sample-m1', 'recipe', 'sample-bol', 'Spaghetti bolognese', 2, cooked(0))],
      Tuesday: [meal('sample-m2', 'recipe', 'sample-salmon', 'Salmon traybake', 2, cooked(1))],
      Wednesday: [
        meal('sample-m3', 'leftover', 'sample-bol', 'Spaghetti bolognese', 2, {
          ...cooked(2),
          note: 'Reheat from Monday',
        }),
      ],
      Thursday: [meal('sample-m4', 'recipe', 'sample-tikka', 'Chicken tikka masala', 2, cooked(3))],
      Friday: [meal('sample-m5', 'takeout', undefined, 'Takeaway', 2, { ...cooked(4), note: 'Pizza night' })],
      Saturday: [meal('sample-m6', 'recipe', 'sample-chilli', 'Chilli con carne', 4, cooked(5))],
      Sunday: [meal('sample-m7', 'recipe', 'sample-sausage', 'Sausage & mash', 2, cooked(6))],
    },
    'finalized',
  );
  const nextWeek = plan(
    addDays(thisMonday, 7),
    {
      Monday: [meal('sample-n1', 'recipe', 'sample-fajita', 'Chicken fajitas', 2)],
      Tuesday: [meal('sample-n2', 'recipe', 'sample-aub', 'Aubergine & chickpea curry', 2)],
      Wednesday: [
        meal('sample-n3', 'recipe', 'sample-chilli', 'Chilli con carne', 6, { note: 'Batch cook: freeze 4' }),
      ],
      Thursday: [meal('sample-n4', 'recipe', 'sample-bol', 'Spaghetti bolognese', 2)],
      Friday: [meal('sample-n5', 'eating_out', undefined, 'Eating out', 2)],
      Saturday: [meal('sample-n6', 'recipe', 'sample-salmon', 'Salmon traybake', 2)],
    },
    'draft',
  );
  return {
    recipes,
    mealPlans: [thisWeek, nextWeek],
    batches: [
      {
        id: 'sample-b1',
        name: 'Chilli con carne',
        recipeId: 'sample-chilli',
        portions: 3,
        dateAdded: iso(addDays(thisMonday, -20)),
      },
      { id: 'sample-b2', name: 'Lentil soup', portions: 2, dateAdded: iso(addDays(thisMonday, -90)) },
    ],
    shoppingList: [],
    preferences: {
      showPrepTime: true,
      showCookTime: true,
      showTotalTime: true,
      showMethod: true,
      showVegetarian: true,
      showVegan: true,
      currencySymbol: '£',
      maxForwardWeeks: 4,
      defaultServings: 2,
      recurringItems: [
        { id: 'sample-rec-milk', name: 'Milk', amount: 4, unit: 'pints', category: 'Dairy' },
        { id: 'sample-rec-bread', name: 'Bread', amount: 1, unit: 'loaf', category: 'Bakery' },
        { id: 'sample-rec-bananas', name: 'Bananas', amount: 6, unit: '', category: 'Produce' },
      ],
    },
    groceryOverrides: {},
  };
}
