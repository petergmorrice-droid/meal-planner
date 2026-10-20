// Test fixture: the shopping code as it was before "One product list" (bundled from that version
// of src/shopping), so products-sync.cjs can build data the way older copies of the app saved it.
// Generated; don't edit.
// oldhead/src/shopping/units.ts
var MASS = { mg: 1e-3, g: 1, kg: 1e3, oz: 28.35, lb: 453.6 };
var VOLUME = {
  ml: 1,
  cl: 10,
  dl: 100,
  l: 1e3,
  tsp: 5,
  dsp: 10,
  tbsp: 15,
  cup: 240,
  floz: 28.4,
  pint: 568
};
var ALIASES = {
  // mass
  mg: "mg",
  milligram: "mg",
  milligrams: "mg",
  g: "g",
  gr: "g",
  grm: "g",
  gram: "g",
  grams: "g",
  gramme: "g",
  grammes: "g",
  gms: "g",
  gm: "g",
  kg: "kg",
  kgs: "kg",
  kilo: "kg",
  kilos: "kg",
  kilogram: "kg",
  kilograms: "kg",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  // volume
  ml: "ml",
  mls: "ml",
  millilitre: "ml",
  millilitres: "ml",
  milliliter: "ml",
  milliliters: "ml",
  cl: "cl",
  centilitre: "cl",
  centilitres: "cl",
  dl: "dl",
  decilitre: "dl",
  decilitres: "dl",
  l: "l",
  ltr: "l",
  ltrs: "l",
  litre: "l",
  litres: "l",
  liter: "l",
  liters: "l",
  tsp: "tsp",
  tsps: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  teaspoonful: "tsp",
  t: "tsp",
  dsp: "dsp",
  dessertspoon: "dsp",
  dessertspoons: "dsp",
  tbsp: "tbsp",
  tbsps: "tbsp",
  tbs: "tbsp",
  tbl: "tbsp",
  tblsp: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tablespoonful: "tbsp",
  cup: "cup",
  cups: "cup",
  mug: "cup",
  mugs: "cup",
  "fl oz": "floz",
  floz: "floz",
  "fluid ounce": "floz",
  "fluid ounces": "floz",
  pint: "pint",
  pints: "pint",
  pt: "pint",
  pts: "pint",
  // plain count
  "": "each",
  each: "each",
  ea: "each",
  x: "each",
  whole: "each",
  piece: "each",
  pieces: "each",
  pc: "each",
  pcs: "each",
  item: "each",
  items: "each",
  unit: "each",
  units: "each",
  number: "each",
  count: "each",
  small: "each",
  medium: "each",
  large: "each",
  "extra large": "each",
  big: "each",
  // product-specific counts (size comes from the product)
  clove: "clove",
  cloves: "clove",
  can: "can",
  cans: "can",
  tin: "can",
  tins: "can",
  "400g can": "can",
  "400g cans": "can",
  "400g tin": "can",
  "400g tins": "can",
  jar: "jar",
  jars: "jar",
  pack: "pack",
  packs: "pack",
  packet: "pack",
  packets: "pack",
  pkt: "pack",
  punnet: "pack",
  punnets: "pack",
  bag: "bag",
  bags: "bag",
  box: "box",
  boxes: "box",
  bunch: "bunch",
  bunches: "bunch",
  bnch: "bunch",
  sprig: "sprig",
  sprigs: "sprig",
  stalk: "stick",
  stalks: "stick",
  stick: "stick",
  sticks: "stick",
  rib: "stick",
  ribs: "stick",
  head: "head",
  heads: "head",
  bulb: "bulb",
  bulbs: "bulb",
  ball: "ball",
  balls: "ball",
  "ball (125g)": "ball",
  "balls (125g)": "ball",
  block: "block",
  blocks: "block",
  "block (200g)": "block",
  "blocks (200g)": "block",
  fillet: "fillet",
  fillets: "fillet",
  breast: "breast",
  breasts: "breast",
  thigh: "thigh",
  thighs: "thigh",
  chop: "chop",
  chops: "chop",
  steak: "steak",
  steaks: "steak",
  rasher: "rasher",
  rashers: "rasher",
  sausage: "sausage",
  sausages: "sausage",
  slice: "slice",
  slices: "slice",
  sheet: "sheet",
  sheets: "sheet",
  leaf: "leaf",
  leaves: "leaf",
  cube: "cube",
  cubes: "cube",
  "stock cube": "cube",
  "stock cubes": "cube",
  pot: "pot",
  pots: "pot",
  "pot (150ml)": "pot",
  "pots (150ml)": "pot",
  tub: "tub",
  tubs: "tub",
  carton: "carton",
  cartons: "carton",
  bottle: "bottle",
  bottles: "bottle",
  tube: "tube",
  tubes: "tube",
  sachet: "sachet",
  sachets: "sachet",
  loaf: "loaf",
  loaves: "loaf",
  wrap: "wrap",
  wraps: "wrap",
  tortilla: "wrap",
  tortillas: "wrap",
  roll: "roll",
  rolls: "roll",
  bun: "roll",
  buns: "roll",
  egg: "egg",
  eggs: "egg",
  bar: "bar",
  bars: "bar",
  thumb: "thumb",
  thumbs: "thumb",
  "thumb-sized piece": "thumb",
  "thumb sized piece": "thumb",
  cm: "cm",
  spear: "spear",
  spears: "spear",
  floret: "floret",
  florets: "floret",
  // vague amounts (sizes are defaults; products can override)
  pinch: "pinch",
  pinches: "pinch",
  dash: "dash",
  dashes: "dash",
  splash: "splash",
  splashes: "splash",
  drizzle: "drizzle",
  glug: "drizzle",
  glugs: "drizzle",
  knob: "knob",
  knobs: "knob",
  handful: "handful",
  handfuls: "handful"
};
var VAGUE = {
  pinch: { dimension: "mass", factor: 0.5 },
  dash: { dimension: "volume", factor: 1 },
  splash: { dimension: "volume", factor: 10 },
  drizzle: { dimension: "volume", factor: 10 },
  knob: { dimension: "mass", factor: 15 },
  handful: { dimension: "mass", factor: 30 }
};
function canonicalUnit(raw) {
  let u = String(raw ?? "").toLowerCase().trim().replace(/\.$/, "").replace(/\s+/g, " ");
  if (u in ALIASES) return ALIASES[u];
  u = u.replace(/^x\s+/, "").replace(/\(?\d+(\.\d+)?\s*(g|ml|kg|l)\)?\s*/g, "").trim();
  if (u in ALIASES) return ALIASES[u];
  u = u.replace(/\s*\(.*\)$/, "").trim();
  if (u in ALIASES) return ALIASES[u];
  const sized = u.replace(/^(small|large|big|medium|heaped|level|rounded|generous|good|scant|a|an)\s+/, "").trim();
  if (sized !== u) return canonicalUnit(sized);
  const withoutOf = u.replace(/\s+of$/, "").trim();
  if (withoutOf !== u) return canonicalUnit(withoutOf);
  return u;
}
function unitInfo(raw) {
  const unit = canonicalUnit(raw);
  if (unit in MASS) return { unit, dimension: "mass", factor: MASS[unit] };
  if (unit in VOLUME) return { unit, dimension: "volume", factor: VOLUME[unit] };
  return { unit, dimension: "count", factor: 1 };
}
function vagueUnit(unit) {
  return VAGUE[unit] ?? null;
}
var NICE_FRACTIONS = [[1 / 8, "\u215B"], [1 / 4, "\xBC"], [1 / 3, "\u2153"], [1 / 2, "\xBD"], [2 / 3, "\u2154"], [3 / 4, "\xBE"]];

// oldhead/src/shopping/names.ts
var DESCRIPTORS = /* @__PURE__ */ new Set([
  "fresh",
  "freshly",
  "large",
  "small",
  "medium",
  "big",
  "extra",
  "ripe",
  "baby",
  "mini",
  "finely",
  "roughly",
  "thinly",
  "thickly",
  "coarsely",
  "lightly",
  "very",
  "chopped",
  "diced",
  "sliced",
  "crushed",
  "grated",
  "peeled",
  "deseeded",
  "seeded",
  "trimmed",
  "halved",
  "quartered",
  "cubed",
  "shredded",
  "torn",
  "beaten",
  "softened",
  "melted",
  "mashed",
  "skinless",
  "boneless",
  "skin",
  "bone",
  "on",
  "in",
  "free",
  "range",
  "organic",
  "british",
  "lean",
  "extra-lean",
  "good",
  "quality",
  "cold",
  "warm",
  "room",
  "temperature",
  "washed",
  "cut",
  "into",
  "chunk",
  "piece",
  "strip",
  "wedge",
  "ring",
  "about",
  "approx",
  "approximately",
  "plus",
  "more",
  "to",
  "serve",
  "for",
  "garnish",
  "optional",
  "and",
  "or",
  "of",
  "a",
  "an",
  "the",
  "some",
  "few",
  "x",
  "pack",
  "packet",
  "bag",
  "tin",
  "can",
  "jar",
  "bunch",
  "handful",
  "sprig"
]);
var SPELLINGS = {
  chili: "chilli",
  chile: "chilli",
  chilies: "chilli",
  chiles: "chilli",
  chillies: "chilli",
  yoghurt: "yogurt",
  yoghourt: "yogurt",
  houmous: "hummus",
  hoummos: "hummus",
  scallion: "spring onion",
  capsicum: "pepper"
};
var KEEP = /* @__PURE__ */ new Set([
  "couscous",
  "asparagus",
  "hummus",
  "molasses",
  "swiss",
  "bass",
  "grass",
  "lemongrass",
  "cress",
  "watercress",
  "citrus",
  "octopus",
  "jus",
  "gas",
  "lettuce",
  "quinoa",
  "pasta",
  "rice",
  "feta",
  "gnocchi",
  "spaghetti",
  "penne",
  "fusilli",
  "tagliatelle",
  "linguine",
  "oregano",
  "paprika",
  "brussels",
  "series",
  "species",
  "chorizo",
  "mozzarella",
  "ricotta",
  "passata",
  "polenta"
]);
var IRREGULAR = {
  leaves: "leaf",
  loaves: "loaf",
  halves: "half",
  knives: "knife",
  cookies: "cookie",
  potatoes: "potato",
  tomatoes: "tomato",
  mangoes: "mango",
  avocados: "avocado",
  anchovies: "anchovy",
  cherries: "cherry",
  berries: "berry",
  chillies: "chilli",
  radishes: "radish",
  peaches: "peach",
  sandwiches: "sandwich",
  dishes: "dish",
  pies: "pie",
  fries: "fry",
  ties: "tie"
};
function singularize(word) {
  const w = word.toLowerCase();
  if (KEEP.has(w) || w.length <= 3) return w;
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("oes")) return w.slice(0, -2);
  if (/(ches|shes|sses|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}
function stripAccents(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function nameWords(name) {
  let s = stripAccents(String(name ?? "")).toLowerCase();
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.split(/,|;| - | – /)[0];
  s = s.replace(/^\s*(the )?(juice|zest|zest and juice|juice and zest) of\s+/, "");
  s = s.replace(/&/g, " and ");
  s = s.replace(/\d+(\.\d+)?\s*%/g, " ");
  s = s.replace(/\b\d+(\.\d+)?\s*(g|kg|ml|l|oz|lb|cm)\b/g, " ");
  s = s.replace(/[\d½¼¾⅓⅔/.]+/g, " ");
  s = s.replace(/[^a-z\s'-]/g, " ").replace(/['’]/g, "").replace(/-/g, " ");
  const words = [];
  for (const raw of s.split(/\s+/)) {
    if (!raw) continue;
    const spelled = SPELLINGS[raw] ?? raw;
    for (const part of spelled.split(" ")) words.push(singularize(part));
  }
  return words.filter((w) => w.length > 0);
}
function matchKey(name) {
  return nameWords(name).filter((w) => !["of", "a", "an", "the", "x"].includes(w)).join(" ");
}
var IDENTITY_AFTER = /* @__PURE__ */ new Set([
  "powder",
  "stock",
  "paste",
  "sauce",
  "oil",
  "seed",
  "flake",
  "granule",
  "salt",
  "extract",
  "essence",
  "vinegar",
  "puree",
  "jam",
  "marmalade",
  "chutney",
  "relish",
  "syrup",
  "soup",
  "pie",
  "cake",
  "crisp",
  "biscuit",
  "bread",
  "pizza",
  "milk",
  "butter",
  "water",
  "wine",
  "spread",
  "mix",
  "seasoning",
  "rub",
  "glaze",
  "gravy",
  "cube",
  "pot",
  "noodle",
  "pasta",
  "rice",
  "steak",
  "mince",
  "burger",
  "nugget",
  "finger",
  "kiev",
  "chip",
  "fritter",
  "cracker",
  "tortilla",
  "wrap",
  "cordial",
  "liqueur",
  "tea",
  "curd",
  "ketchup",
  "pesto",
  "dressing",
  "mayonnaise",
  "bean",
  "lentil",
  "yogurt",
  "cream",
  "cheese"
]);
var IDENTITY_BEFORE = /* @__PURE__ */ new Set([
  "ground",
  "dried",
  "dry",
  "tinned",
  "canned",
  "jarred",
  "pickled",
  "crystallised",
  "crystallized",
  "powdered",
  "desiccated",
  "sun",
  "frozen",
  "candied",
  "stem",
  "quail",
  "duck"
]);
var GENERIC_HEADS = /* @__PURE__ */ new Set([
  "pasta",
  "rice",
  "noodle",
  "bread",
  "oil",
  "vinegar",
  "cheese",
  "sauce",
  "stock",
  "flour",
  "sugar",
  "milk",
  "cream",
  "wine",
  "steak",
  "salad",
  "pepper",
  "roll",
  "bun",
  "spice",
  "herb",
  "mushroom"
]);

// oldhead/src/utils/initialGroceryDb.ts
var INITIAL_GROCERY_DATABASE = [
  { id: "gdb-1", name: "Spinach", unit: "g", increment: 100, category: "Produce" },
  { id: "gdb-2", name: "Garlic", unit: "bulb", increment: 1, category: "Produce" },
  { id: "gdb-3", name: "Onion", unit: "whole", increment: 1, category: "Produce" },
  { id: "gdb-4", name: "Red Onion", unit: "whole", increment: 1, category: "Produce" },
  { id: "gdb-5", name: "Potatoes", unit: "g", increment: 250, category: "Produce" },
  { id: "gdb-6", name: "Sweet Potatoes", unit: "g", increment: 250, category: "Produce" },
  { id: "gdb-7", name: "Broccoli", unit: "head", increment: 1, category: "Produce" },
  { id: "gdb-8", name: "Bell Peppers", unit: "whole", increment: 1, category: "Produce" },
  { id: "gdb-9", name: "Carrots", unit: "g", increment: 200, category: "Produce" },
  { id: "gdb-10", name: "Avocado", unit: "whole", increment: 1, category: "Produce" },
  { id: "gdb-11", name: "Tomatoes", unit: "g", increment: 150, category: "Produce" },
  { id: "gdb-12", name: "Cherry Tomatoes", unit: "pack", increment: 1, category: "Produce" },
  { id: "gdb-13", name: "Cucumber", unit: "whole", increment: 1, category: "Produce" },
  { id: "gdb-14", name: "Lettuce", unit: "head", increment: 1, category: "Produce" },
  { id: "gdb-15", name: "Salad Mix", unit: "bag", increment: 1, category: "Produce" },
  { id: "gdb-16", name: "Mushrooms", unit: "g", increment: 150, category: "Produce" },
  { id: "gdb-17", name: "Courgette", unit: "whole", increment: 1, category: "Produce" },
  { id: "gdb-18", name: "Zucchini", unit: "whole", increment: 1, category: "Produce" },
  { id: "gdb-19", name: "Aubergine", unit: "whole", increment: 1, category: "Produce" },
  { id: "gdb-20", name: "Eggplant", unit: "whole", increment: 1, category: "Produce" },
  { id: "gdb-21", name: "Cauliflower", unit: "head", increment: 1, category: "Produce" },
  { id: "gdb-22", name: "Cabbage", unit: "head", increment: 1, category: "Produce" },
  { id: "gdb-23", name: "Celery", unit: "bunch", increment: 1, category: "Produce" },
  { id: "gdb-24", name: "Leeks", unit: "whole", increment: 1, category: "Produce" },
  { id: "gdb-25", name: "Asparagus", unit: "bunch", increment: 1, category: "Produce" },
  { id: "gdb-26", name: "Green Beans", unit: "g", increment: 150, category: "Produce" },
  { id: "gdb-27", name: "Spring Onions", unit: "bunch", increment: 1, category: "Produce" },
  { id: "gdb-28", name: "Ginger", unit: "g", increment: 50, category: "Produce" },
  { id: "gdb-29", name: "Chilli Peppers", unit: "whole", increment: 1, category: "Produce" },
  { id: "gdb-30", name: "Coriander", unit: "bunch", increment: 1, category: "Produce" },
  { id: "gdb-31", name: "Parsley", unit: "bunch", increment: 1, category: "Produce" },
  { id: "gdb-32", name: "Basil", unit: "bunch", increment: 1, category: "Produce" },
  { id: "gdb-33", name: "Bananas", unit: "whole", increment: 1, category: "Produce" },
  { id: "gdb-34", name: "Apples", unit: "whole", increment: 1, category: "Produce" },
  { id: "gdb-35", name: "Lemons", unit: "whole", increment: 1, category: "Produce" },
  { id: "gdb-36", name: "Limes", unit: "whole", increment: 1, category: "Produce" },
  { id: "gdb-37", name: "Oranges", unit: "whole", increment: 1, category: "Produce" },
  { id: "gdb-38", name: "Grapes", unit: "pack", increment: 1, category: "Produce" },
  { id: "gdb-39", name: "Strawberries", unit: "pack", increment: 1, category: "Produce" },
  { id: "gdb-40", name: "Blueberries", unit: "pack", increment: 1, category: "Produce" },
  { id: "gdb-41", name: "Raspberries", unit: "pack", increment: 1, category: "Produce" },
  { id: "gdb-42", name: "Pineapple", unit: "whole", increment: 1, category: "Produce" },
  { id: "gdb-43", name: "Mango", unit: "whole", increment: 1, category: "Produce" },
  { id: "gdb-44", name: "Melon", unit: "whole", increment: 1, category: "Produce" },
  { id: "gdb-45", name: "Kiwi", unit: "whole", increment: 1, category: "Produce" },
  { id: "gdb-46", name: "Pears", unit: "whole", increment: 1, category: "Produce" },
  { id: "gdb-47", name: "Plums", unit: "whole", increment: 1, category: "Produce" },
  { id: "gdb-48", name: "Peaches", unit: "whole", increment: 1, category: "Produce" },
  { id: "gdb-49", name: "Minced Beef", unit: "g", increment: 250, category: "Meat" },
  { id: "gdb-50", name: "Beef Mince", unit: "g", increment: 250, category: "Meat" },
  { id: "gdb-51", name: "Chicken Breasts", unit: "g", increment: 250, category: "Meat" },
  { id: "gdb-52", name: "Chicken Thighs", unit: "g", increment: 250, category: "Meat" },
  { id: "gdb-53", name: "Whole Chicken", unit: "whole", increment: 1, category: "Meat" },
  { id: "gdb-54", name: "Pork Mince", unit: "g", increment: 250, category: "Meat" },
  { id: "gdb-55", name: "Lamb Mince", unit: "g", increment: 250, category: "Meat" },
  { id: "gdb-56", name: "Pork Chops", unit: "chop", increment: 1, category: "Meat" },
  { id: "gdb-57", name: "Bacon", unit: "pack", increment: 1, category: "Meat" },
  { id: "gdb-58", name: "Sausages", unit: "pack", increment: 1, category: "Meat" },
  { id: "gdb-59", name: "Steak", unit: "steak", increment: 1, category: "Meat" },
  { id: "gdb-60", name: "Turkey Mince", unit: "g", increment: 250, category: "Meat" },
  { id: "gdb-61", name: "Diced Beef", unit: "g", increment: 250, category: "Meat" },
  { id: "gdb-62", name: "Diced Chicken", unit: "g", increment: 250, category: "Meat" },
  { id: "gdb-63", name: "Salmon Fillets", unit: "fillet", increment: 1, category: "Fish" },
  { id: "gdb-64", name: "Cod Fillets", unit: "fillet", increment: 1, category: "Fish" },
  { id: "gdb-65", name: "Prawns", unit: "g", increment: 150, category: "Fish" },
  { id: "gdb-66", name: "Canned Tuna", unit: "can", increment: 1, category: "Fish" },
  { id: "gdb-67", name: "Smoked Salmon", unit: "pack", increment: 1, category: "Fish" },
  { id: "gdb-68", name: "Mackerel", unit: "fillet", increment: 1, category: "Fish" },
  { id: "gdb-69", name: "Haddock Fillets", unit: "fillet", increment: 1, category: "Fish" },
  { id: "gdb-70", name: "Cheddar Cheese", unit: "g", increment: 200, category: "Dairy" },
  { id: "gdb-71", name: "Mozzarella", unit: "ball", increment: 1, category: "Dairy" },
  { id: "gdb-72", name: "Parmesan", unit: "g", increment: 100, category: "Dairy" },
  { id: "gdb-73", name: "Halloumi Cheese", unit: "pack", increment: 1, category: "Dairy" },
  { id: "gdb-74", name: "Feta Cheese", unit: "pack", increment: 1, category: "Dairy" },
  { id: "gdb-75", name: "Cream Cheese", unit: "pack", increment: 1, category: "Dairy" },
  { id: "gdb-76", name: "Single Cream", unit: "ml", increment: 150, category: "Dairy" },
  { id: "gdb-77", name: "Double Cream", unit: "ml", increment: 150, category: "Dairy" },
  { id: "gdb-78", name: "Sour Cream", unit: "pack", increment: 1, category: "Dairy" },
  { id: "gdb-79", name: "Milk", unit: "pint", increment: 1, category: "Dairy" },
  { id: "gdb-80", name: "Butter", unit: "g", increment: 250, category: "Dairy" },
  { id: "gdb-81", name: "Eggs", unit: "egg", increment: 6, category: "Dairy" },
  { id: "gdb-82", name: "Yogurt", unit: "pack", increment: 1, category: "Dairy" },
  { id: "gdb-83", name: "Greek Yogurt", unit: "pack", increment: 1, category: "Dairy" },
  { id: "gdb-84", name: "Oat Milk", unit: "ml", increment: 1e3, category: "Dairy" },
  { id: "gdb-85", name: "Almond Milk", unit: "ml", increment: 1e3, category: "Dairy" },
  { id: "gdb-86", name: "Bread", unit: "loaf", increment: 1, category: "Bakery" },
  { id: "gdb-87", name: "Tortilla Wraps", unit: "pack", increment: 1, category: "Bakery" },
  { id: "gdb-88", name: "Pita Bread", unit: "pack", increment: 1, category: "Bakery" },
  { id: "gdb-89", name: "Bagels", unit: "pack", increment: 1, category: "Bakery" },
  { id: "gdb-90", name: "Croissants", unit: "pack", increment: 1, category: "Bakery" },
  { id: "gdb-91", name: "Rolls", unit: "pack", increment: 1, category: "Bakery" },
  { id: "gdb-92", name: "Spaghetti", unit: "g", increment: 200, category: "Pasta" },
  { id: "gdb-93", name: "Penne", unit: "g", increment: 200, category: "Pasta" },
  { id: "gdb-94", name: "Fusilli", unit: "g", increment: 200, category: "Pasta" },
  { id: "gdb-95", name: "Macaroni", unit: "g", increment: 200, category: "Pasta" },
  { id: "gdb-96", name: "Noodles", unit: "pack", increment: 1, category: "Pasta" },
  { id: "gdb-97", name: "Lasagne Sheets", unit: "pack", increment: 1, category: "Pasta" },
  { id: "gdb-98", name: "Jasmine Rice", unit: "g", increment: 200, category: "Pantry" },
  { id: "gdb-99", name: "Basmati Rice", unit: "g", increment: 200, category: "Pantry" },
  { id: "gdb-100", name: "Brown Rice", unit: "g", increment: 200, category: "Pantry" },
  { id: "gdb-101", name: "Quinoa", unit: "g", increment: 200, category: "Pantry" },
  { id: "gdb-102", name: "Couscous", unit: "g", increment: 200, category: "Pantry" },
  { id: "gdb-103", name: "Oats", unit: "g", increment: 500, category: "Pantry" },
  { id: "gdb-104", name: "Cereal", unit: "box", increment: 1, category: "Pantry" },
  { id: "gdb-105", name: "Chopped Tomatoes", unit: "can", increment: 1, category: "Canned" },
  { id: "gdb-106", name: "Plum Tomatoes", unit: "can", increment: 1, category: "Canned" },
  { id: "gdb-107", name: "Passata", unit: "carton", increment: 1, category: "Canned" },
  { id: "gdb-108", name: "Baked Beans", unit: "can", increment: 1, category: "Canned" },
  { id: "gdb-109", name: "Kidney Beans", unit: "can", increment: 1, category: "Canned" },
  { id: "gdb-110", name: "Black Beans", unit: "can", increment: 1, category: "Canned" },
  { id: "gdb-111", name: "Chickpeas", unit: "can", increment: 1, category: "Canned" },
  { id: "gdb-112", name: "Sweetcorn", unit: "can", increment: 1, category: "Canned" },
  { id: "gdb-113", name: "Coconut Milk", unit: "can", increment: 1, category: "Canned" },
  { id: "gdb-114", name: "Tomato Puree", unit: "tube", increment: 1, category: "Pantry" },
  { id: "gdb-115", name: "Pesto", unit: "jar", increment: 1, category: "Pantry" },
  { id: "gdb-116", name: "Pasta Sauce", unit: "jar", increment: 1, category: "Pantry" },
  { id: "gdb-117", name: "Curry Paste", unit: "jar", increment: 1, category: "Pantry" },
  { id: "gdb-118", name: "Peanut Butter", unit: "jar", increment: 1, category: "Pantry" },
  { id: "gdb-119", name: "Jam", unit: "jar", increment: 1, category: "Pantry" },
  { id: "gdb-120", name: "Honey", unit: "jar", increment: 1, category: "Pantry" },
  { id: "gdb-121", name: "Olive Oil", unit: "ml", increment: 500, category: "Pantry" },
  { id: "gdb-122", name: "Vegetable Oil", unit: "ml", increment: 500, category: "Pantry" },
  { id: "gdb-123", name: "Sunflower Oil", unit: "ml", increment: 500, category: "Pantry" },
  { id: "gdb-124", name: "Soy Sauce", unit: "ml", increment: 150, category: "Pantry" },
  { id: "gdb-125", name: "Balsamic Vinegar", unit: "ml", increment: 250, category: "Pantry" },
  { id: "gdb-126", name: "White Wine Vinegar", unit: "ml", increment: 250, category: "Pantry" },
  { id: "gdb-127", name: "Ketchup", unit: "bottle", increment: 1, category: "Pantry" },
  { id: "gdb-128", name: "Mayonnaise", unit: "jar", increment: 1, category: "Pantry" },
  { id: "gdb-129", name: "Mustard", unit: "jar", increment: 1, category: "Pantry" },
  { id: "gdb-130", name: "Hot Sauce", unit: "bottle", increment: 1, category: "Pantry" },
  { id: "gdb-131", name: "Salt", unit: "g", increment: 250, category: "Pantry" },
  { id: "gdb-132", name: "Black Pepper", unit: "g", increment: 100, category: "Pantry" },
  { id: "gdb-133", name: "Flour", unit: "g", increment: 500, category: "Pantry" },
  { id: "gdb-134", name: "Sugar", unit: "g", increment: 500, category: "Pantry" },
  { id: "gdb-135", name: "Brown Sugar", unit: "g", increment: 500, category: "Pantry" },
  { id: "gdb-136", name: "Stock Cubes", unit: "pack", increment: 1, category: "Pantry" },
  { id: "gdb-137", name: "Frozen Peas", unit: "g", increment: 250, category: "Frozen" },
  { id: "gdb-138", name: "Frozen Chips", unit: "g", increment: 500, category: "Frozen" },
  { id: "gdb-139", name: "Frozen Pizza", unit: "whole", increment: 1, category: "Frozen" },
  { id: "gdb-140", name: "Ice Cream", unit: "tub", increment: 1, category: "Frozen" },
  { id: "gdb-141", name: "Frozen Mixed Veg", unit: "g", increment: 250, category: "Frozen" },
  { id: "gdb-142", name: "Frozen Berries", unit: "g", increment: 250, category: "Frozen" },
  { id: "gdb-143", name: "Crisps", unit: "pack", increment: 1, category: "Snacks" },
  { id: "gdb-144", name: "Chocolate", unit: "bar", increment: 1, category: "Snacks" },
  { id: "gdb-145", name: "Biscuits", unit: "pack", increment: 1, category: "Snacks" },
  { id: "gdb-146", name: "Nuts", unit: "pack", increment: 1, category: "Snacks" },
  { id: "gdb-147", name: "Popcorn", unit: "pack", increment: 1, category: "Snacks" },
  { id: "gdb-148", name: "Coffee", unit: "pack", increment: 1, category: "Beverages" },
  { id: "gdb-149", name: "Tea Bags", unit: "pack", increment: 1, category: "Beverages" },
  { id: "gdb-150", name: "Orange Juice", unit: "carton", increment: 1, category: "Beverages" },
  { id: "gdb-151", name: "Apple Juice", unit: "carton", increment: 1, category: "Beverages" },
  { id: "gdb-152", name: "Sparkling Water", unit: "bottle", increment: 1, category: "Beverages" },
  { id: "gdb-153", name: "Soda", unit: "bottle", increment: 1, category: "Beverages" },
  { id: "gdb-154", name: "Beer", unit: "pack", increment: 1, category: "Beverages" },
  { id: "gdb-155", name: "Wine", unit: "bottle", increment: 1, category: "Beverages" },
  { id: "gdb-156", name: "Toilet Paper", unit: "pack", increment: 1, category: "Household" },
  { id: "gdb-157", name: "Kitchen Roll", unit: "pack", increment: 1, category: "Household" },
  { id: "gdb-158", name: "Dish Soap", unit: "bottle", increment: 1, category: "Household" },
  { id: "gdb-159", name: "Dishwasher Tablets", unit: "pack", increment: 1, category: "Household" },
  { id: "gdb-160", name: "Laundry Detergent", unit: "bottle", increment: 1, category: "Household" },
  { id: "gdb-161", name: "Fabric Softener", unit: "bottle", increment: 1, category: "Household" },
  { id: "gdb-162", name: "Bin Bags", unit: "pack", increment: 1, category: "Household" },
  { id: "gdb-163", name: "Shampoo", unit: "bottle", increment: 1, category: "Hygiene" },
  { id: "gdb-164", name: "Conditioner", unit: "bottle", increment: 1, category: "Hygiene" },
  { id: "gdb-165", name: "Body Wash", unit: "bottle", increment: 1, category: "Hygiene" },
  { id: "gdb-166", name: "Toothpaste", unit: "tube", increment: 1, category: "Hygiene" },
  { id: "gdb-167", name: "Deodorant", unit: "can", increment: 1, category: "Hygiene" },
  { id: "gdb-168", name: "Peas", unit: "g", increment: 100, category: "Produce" },
  { id: "gdb-169", name: "Garlic Bread", unit: "pack", increment: 1, category: "Bakery" }
];

// oldhead/src/shopping/catalog.ts
var herb = (aliases) => ({ base: "g", per: { bunch: 30, pack: 30, each: 30, handful: 10, sprig: 1, leaf: 0.2, tbsp: 3, tsp: 1 }, aliases });
var each = (gramsEach, aliases = [], extra2 = {}) => ({ base: "each", per: { g: 1 / gramsEach, ...extra2 }, aliases });
var weighed = (gramsEach, aliases = [], extra2 = {}) => ({ base: "g", per: { ...gramsEach ? { each: gramsEach } : {}, ...extra2 }, aliases });
var jar = (grams, aliases = [], cupboard = true) => ({ base: "g", per: { jar: grams, pack: grams, each: grams, tsp: 2.5, tbsp: 7 }, cupboard, aliases });
var liquid = (aliases = [], per = {}, cupboard = false) => ({ base: "ml", per, cupboard, aliases });
var PRODUCT_SPECS = {
  "gdb-1": weighed(null, ["baby spinach", "spinach leaf"], { handful: 30, bag: 200 }),
  "gdb-2": { base: "g", per: { clove: 5, each: 5, bulb: 50, head: 50, tsp: 5, tbsp: 15 }, aliases: ["garlic clove", "clove garlic", "garlic bulb", "minced garlic", "garlic paste"] },
  "gdb-3": weighed(150, ["brown onion", "white onion", "yellow onion", "cooking onion"]),
  "gdb-4": weighed(150, ["red onion"]),
  "gdb-5": weighed(200, ["potato", "baking potato", "new potato", "baby potato", "maris piper", "maris piper potato", "charlotte potato", "floury potato", "waxy potato"]),
  "gdb-6": weighed(250, ["sweet potato"]),
  "gdb-7": weighed(350, ["broccoli floret", "tenderstem broccoli"], { head: 350, floret: 15 }),
  "gdb-8": weighed(160, ["red pepper", "green pepper", "yellow pepper", "orange pepper", "sweet pepper", "bell pepper", "romano pepper", "mixed pepper"]),
  "gdb-9": weighed(80, ["carrot"]),
  "gdb-10": weighed(150, ["avocado"]),
  "gdb-11": weighed(100, ["tomato", "vine tomato", "salad tomato", "beef tomato", "beefsteak tomato"]),
  "gdb-12": weighed(15, ["cherry tomato", "baby plum tomato", "grape tomato", "cherry vine tomato"], { pack: 250 }),
  "gdb-13": weighed(300, ["cucumber"]),
  "gdb-14": { base: "each", per: { head: 1, leaf: 0.08, g: 1 / 300 }, aliases: ["iceberg lettuce", "little gem", "little gem lettuce", "romaine lettuce", "cos lettuce", "gem lettuce"] },
  "gdb-15": weighed(120, ["salad leaf", "mixed leaf", "mixed salad leaf", "salad", "rocket", "arugula", "watercress", "baby leaf salad", "green salad"], { bag: 120, handful: 30 }),
  "gdb-16": weighed(20, ["mushroom", "chestnut mushroom", "button mushroom", "closed cup mushroom", "portobello mushroom", "flat mushroom"], { pack: 250 }),
  "gdb-17": weighed(200, ["courgette", "zucchini"]),
  "gdb-18": { base: "g", sameAs: "gdb-17" },
  "gdb-19": weighed(250, ["aubergine", "eggplant"]),
  "gdb-20": { base: "g", sameAs: "gdb-19" },
  "gdb-21": weighed(600, ["cauliflower floret"], { head: 600, floret: 15 }),
  "gdb-22": weighed(800, ["white cabbage", "savoy cabbage", "pointed cabbage", "sweetheart cabbage"], { head: 800 }),
  "gdb-23": { base: "each", per: { stick: 1, each: 1, bunch: 8, head: 8, g: 1 / 40 }, aliases: ["celery stick", "celery stalk", "stick celery"] },
  "gdb-24": weighed(250, ["leek"]),
  "gdb-25": weighed(20, ["asparagus spear"], { bunch: 250, spear: 20 }),
  "gdb-26": weighed(null, ["green bean", "fine bean", "french bean", "runner bean", "trimmed green bean"]),
  "gdb-27": { base: "each", per: { each: 1, stick: 1, bunch: 8, g: 1 / 15 }, aliases: ["spring onion", "scallion", "green onion", "salad onion"] },
  "gdb-28": weighed(50, ["fresh ginger", "root ginger", "ginger root", "grated ginger", "ginger"], { thumb: 15, cm: 5, tsp: 5, tbsp: 15 }),
  "gdb-29": each(10, ["chilli", "red chilli", "green chilli", "fresh chilli", "bird eye chilli", "birds eye chilli", "jalapeno", "scotch bonnet", "chilli pepper"]),
  "gdb-30": herb(["fresh coriander", "cilantro", "coriander leaf", "coriander"]),
  "gdb-31": herb(["flat leaf parsley", "fresh parsley", "curly parsley", "parsley"]),
  "gdb-32": herb(["fresh basil", "basil leaf", "basil"]),
  "gdb-33": each(120, ["banana"]),
  "gdb-34": each(180, ["apple", "eating apple", "bramley apple", "cooking apple"]),
  "gdb-35": each(100, ["lemon", "lemon juice", "lemon zest", "unwaxed lemon"], { ml: 1 / 30 }),
  "gdb-36": each(70, ["lime", "lime juice", "lime zest"], { ml: 1 / 20 }),
  "gdb-37": each(200, ["orange", "orange zest"], { ml: 1 / 80 }),
  "gdb-38": weighed(5, ["grape", "red grape", "green grape"], { pack: 500, handful: 80 }),
  "gdb-39": weighed(15, ["strawberry"], { pack: 400, handful: 80 }),
  "gdb-40": weighed(null, ["blueberry"], { pack: 150, handful: 50 }),
  "gdb-41": weighed(null, ["raspberry"], { pack: 150, handful: 50 }),
  "gdb-42": each(1e3, ["pineapple"]),
  "gdb-43": each(300, ["mango"]),
  "gdb-44": each(1200, ["melon"]),
  "gdb-45": each(75, ["kiwi", "kiwi fruit"]),
  "gdb-46": each(180, ["pear"]),
  "gdb-47": each(70, ["plum"]),
  "gdb-48": each(150, ["peach", "nectarine"]),
  "gdb-49": { base: "g", sameAs: "gdb-50" },
  "gdb-50": weighed(null, ["minced beef", "ground beef", "steak mince", "lean beef mince", "beef mince"]),
  "gdb-51": weighed(150, ["chicken breast", "chicken breast fillet", "chicken fillet", "chicken breast steak"], { breast: 150, fillet: 150 }),
  "gdb-52": weighed(110, ["chicken thigh", "chicken thigh fillet"], { thigh: 110, fillet: 110 }),
  "gdb-53": each(1500, ["whole chicken", "roasting chicken", "whole roast chicken"]),
  "gdb-54": weighed(null, ["minced pork", "ground pork", "pork mince"]),
  "gdb-55": weighed(null, ["minced lamb", "ground lamb", "lamb mince"]),
  "gdb-56": each(180, ["pork chop", "pork loin chop"], { chop: 1 }),
  "gdb-57": { base: "each", per: { pack: 8, rasher: 1, slice: 1, each: 1, g: 1 / 25 }, aliases: ["bacon rasher", "streaky bacon", "back bacon", "smoked bacon", "smoked streaky bacon", "smoked back bacon"] },
  "gdb-58": { base: "each", per: { pack: 6, sausage: 1, each: 1, g: 1 / 67 }, aliases: ["sausage", "pork sausage", "chipolata", "cumberland sausage"] },
  "gdb-59": each(225, ["sirloin steak", "rump steak", "ribeye steak", "rib eye steak", "fillet steak", "beef steak"], { steak: 1 }),
  "gdb-60": weighed(null, ["minced turkey", "ground turkey", "turkey mince"]),
  "gdb-61": weighed(null, ["stewing beef", "braising steak", "casserole beef", "beef stewing steak", "beef chuck", "diced beef"]),
  "gdb-62": weighed(null, ["chicken piece", "chicken chunk", "chicken mini fillet", "diced chicken"]),
  "gdb-63": each(120, ["salmon fillet", "salmon", "salmon steak", "skinless salmon fillet"], { fillet: 1 }),
  "gdb-64": each(140, ["cod", "cod fillet", "cod loin"], { fillet: 1 }),
  "gdb-65": weighed(null, ["prawn", "king prawn", "raw prawn", "cooked prawn", "tiger prawn", "shrimp", "raw king prawn"]),
  "gdb-66": weighed(null, ["tuna", "tinned tuna", "canned tuna", "tuna chunk", "tuna in spring water", "tin tuna"], { can: 145 }),
  "gdb-67": weighed(null, ["smoked salmon"], { pack: 100 }),
  "gdb-68": each(100, ["mackerel fillet", "smoked mackerel", "mackerel"], { fillet: 1 }),
  "gdb-69": each(140, ["haddock", "haddock fillet", "smoked haddock"], { fillet: 1 }),
  "gdb-70": weighed(null, ["cheddar", "mature cheddar", "grated cheddar", "extra mature cheddar", "cheddar cheese", "mild cheddar"], { cup: 100, handful: 30, tbsp: 7 }),
  "gdb-71": weighed(125, ["mozzarella ball", "buffalo mozzarella", "mozzarella", "grated mozzarella"], { ball: 125, pack: 125 }),
  "gdb-72": weighed(null, ["parmesan cheese", "parmigiano reggiano", "grana padano", "vegetarian italian hard cheese", "parmesan"], { tbsp: 5, cup: 80, handful: 20 }),
  "gdb-73": weighed(225, ["halloumi"], { pack: 225, block: 225 }),
  "gdb-74": weighed(200, ["feta"], { pack: 200, block: 200 }),
  "gdb-75": { base: "g", per: { pack: 180, tub: 180, each: 180, tbsp: 15 }, aliases: ["soft cheese", "full fat soft cheese", "light soft cheese", "philadelphia"] },
  "gdb-76": liquid(["light cream", "single cream"], { pot: 150 }),
  "gdb-77": liquid(["heavy cream", "whipping cream", "double cream"], { pot: 150 }),
  "gdb-78": liquid(["soured cream", "sour cream"], { pack: 300, pot: 300, tub: 300 }),
  "gdb-79": liquid(["whole milk", "semi skimmed milk", "skimmed milk", "milk"], { pint: 568 }),
  "gdb-80": { base: "g", density: 0.96, per: { knob: 15, tbsp: 14, tsp: 5, pack: 250, block: 250 }, aliases: ["unsalted butter", "salted butter", "butter"] },
  "gdb-81": { base: "each", per: { egg: 1, each: 1, g: 1 / 55 }, aliases: ["egg", "free range egg", "large egg", "medium egg", "egg yolk", "egg white"] },
  "gdb-82": { base: "g", per: { pack: 500, pot: 500, tub: 500, each: 500 }, aliases: ["natural yogurt", "plain yogurt", "yogurt"] },
  "gdb-83": { base: "g", per: { pack: 500, pot: 500, tub: 500, each: 500 }, aliases: ["greek style yogurt", "greek yogurt", "fat free greek yogurt"] },
  "gdb-84": liquid(["oat milk"], { carton: 1e3 }),
  "gdb-85": liquid(["almond milk"], { carton: 1e3 }),
  "gdb-86": { base: "each", per: { loaf: 1, each: 1, slice: 1 / 20, g: 1 / 800 }, aliases: ["loaf", "sliced bread", "white bread", "wholemeal bread", "sourdough", "sourdough bread", "bread"] },
  "gdb-87": { base: "each", per: { pack: 8, wrap: 1, each: 1 }, aliases: ["tortilla", "wrap", "flour tortilla", "tortilla wrap"] },
  "gdb-88": { base: "each", per: { pack: 6, each: 1 }, aliases: ["pitta", "pitta bread", "pita"] },
  "gdb-89": { base: "each", per: { pack: 5, each: 1 }, aliases: ["bagel"] },
  "gdb-90": { base: "each", per: { pack: 4, each: 1 }, aliases: ["croissant"] },
  "gdb-91": { base: "each", per: { pack: 6, roll: 1, each: 1 }, aliases: ["bread roll", "burger bun", "brioche bun", "roll", "bun", "sub roll"] },
  "gdb-92": { base: "g", cupboard: true, aliases: ["spaghetti"] },
  "gdb-93": { base: "g", cupboard: true, aliases: ["penne"] },
  "gdb-94": { base: "g", cupboard: true, aliases: ["fusilli"] },
  "gdb-95": { base: "g", cupboard: true, aliases: ["macaroni"] },
  "gdb-96": { base: "g", per: { pack: 300, nest: 50, each: 50 }, aliases: ["egg noodle", "rice noodle", "udon noodle", "noodle nest", "straight to wok noodle", "fine egg noodle", "noodle"] },
  "gdb-97": { base: "each", cupboard: true, per: { pack: 18, sheet: 1, each: 1, g: 1 / 20 }, aliases: ["lasagne sheet", "lasagna sheet", "dried lasagne sheet"] },
  "gdb-98": { base: "g", cupboard: true, per: { cup: 185 }, aliases: ["jasmine rice", "thai jasmine rice", "thai rice"] },
  "gdb-99": { base: "g", cupboard: true, per: { cup: 185 }, aliases: ["basmati rice", "basmati", "rice", "long grain rice", "white rice", "easy cook rice"] },
  "gdb-100": { base: "g", cupboard: true, per: { cup: 185 }, aliases: ["brown rice", "wholegrain rice"] },
  "gdb-101": { base: "g", cupboard: true, per: { cup: 170 }, aliases: ["quinoa"] },
  "gdb-102": { base: "g", cupboard: true, per: { cup: 180 }, aliases: ["couscous", "giant couscous"] },
  "gdb-103": { base: "g", cupboard: true, per: { cup: 90 }, aliases: ["porridge oat", "rolled oat", "oat"] },
  "gdb-104": { base: "each", per: { box: 1, each: 1 }, aliases: ["cereal"] },
  "gdb-105": { base: "g", per: { can: 400, carton: 390 }, aliases: ["chopped tomato", "tinned tomato", "canned tomato", "tin tomato", "can tomato", "tinned chopped tomato", "canned chopped tomato", "can chopped tomato", "tin chopped tomato", "crushed tomato", "diced tomato", "chopped tinned tomato"] },
  "gdb-106": { base: "g", per: { can: 400 }, aliases: ["plum tomato", "whole plum tomato", "tinned plum tomato", "canned plum tomato", "tinned whole tomato"] },
  "gdb-107": { base: "g", density: 1, per: { carton: 500, jar: 500, bottle: 500, each: 500 }, aliases: ["passata", "sieved tomato", "tomato passata"] },
  "gdb-108": { base: "g", per: { can: 415 }, aliases: ["baked bean"] },
  "gdb-109": { base: "g", per: { can: 400 }, aliases: ["kidney bean", "red kidney bean"] },
  "gdb-110": { base: "g", per: { can: 400 }, aliases: ["black bean"] },
  "gdb-111": { base: "g", per: { can: 400 }, aliases: ["chickpea", "garbanzo bean", "tinned chickpea"] },
  "gdb-112": { base: "g", per: { can: 325, cup: 160 }, aliases: ["sweetcorn", "sweetcorn kernel", "corn", "tinned sweetcorn", "corn kernel"] },
  "gdb-113": { base: "ml", per: { can: 400 }, aliases: ["coconut milk", "light coconut milk", "reduced fat coconut milk", "tinned coconut milk"] },
  "gdb-114": { base: "g", cupboard: true, per: { tube: 200, each: 200, tbsp: 16, tsp: 5 }, aliases: ["tomato puree", "tomato paste", "double concentrated tomato puree"] },
  "gdb-115": { base: "g", per: { jar: 190, each: 190, tbsp: 15 }, aliases: ["pesto", "basil pesto", "green pesto", "red pesto"] },
  "gdb-116": { base: "g", per: { jar: 500, each: 500 }, aliases: ["pasta sauce", "tomato pasta sauce", "bolognese sauce"] },
  "gdb-117": { base: "g", per: { jar: 200, each: 200, tbsp: 15, tsp: 5 }, aliases: ["curry paste", "thai red curry paste", "thai green curry paste", "red curry paste", "green curry paste", "korma paste", "tikka paste", "tikka masala paste", "balti paste", "madras paste", "rogan josh paste"] },
  "gdb-118": jar(340, ["peanut butter", "smooth peanut butter", "crunchy peanut butter"]),
  "gdb-119": jar(340, ["jam", "strawberry jam", "raspberry jam"]),
  "gdb-120": { base: "g", density: 1.4, cupboard: true, per: { jar: 340, bottle: 340, each: 340 }, aliases: ["honey", "runny honey", "clear honey"] },
  "gdb-121": liquid(["olive oil", "extra virgin olive oil", "light olive oil", "evoo"], { bottle: 500 }, true),
  "gdb-122": liquid(["vegetable oil", "oil", "cooking oil", "rapeseed oil", "neutral oil"], { bottle: 1e3 }, true),
  "gdb-123": liquid(["sunflower oil"], { bottle: 1e3 }, true),
  "gdb-124": liquid(["soy sauce", "light soy sauce", "dark soy sauce", "soy", "tamari", "reduced salt soy sauce"], { bottle: 150 }, true),
  "gdb-125": liquid(["balsamic vinegar", "balsamic", "balsamic glaze"], { bottle: 250 }, true),
  "gdb-126": liquid(["white wine vinegar", "vinegar"], { bottle: 350 }, true),
  "gdb-127": liquid(["ketchup", "tomato ketchup"], { bottle: 460 }, true),
  "gdb-128": jar(400, ["mayonnaise", "mayo", "light mayonnaise"]),
  "gdb-129": jar(185, ["mustard", "dijon mustard", "wholegrain mustard", "english mustard", "dijon"]),
  "gdb-130": liquid(["hot sauce", "sriracha", "tabasco", "chilli sauce", "hot chilli sauce"], { bottle: 150 }, true),
  "gdb-131": { base: "g", density: 1.2, cupboard: true, per: { pinch: 0.5, each: 500 }, aliases: ["salt", "sea salt", "table salt", "salt and pepper", "salt and black pepper", "sea salt flake", "kosher salt", "salt flake"] },
  "gdb-132": { base: "g", density: 0.5, cupboard: true, per: { pinch: 0.25, each: 100 }, aliases: ["black pepper", "pepper", "ground black pepper", "black peppercorn", "white pepper", "cracked black pepper", "freshly ground black pepper"] },
  "gdb-133": { base: "g", density: 0.55, cupboard: true, per: { cup: 125 }, aliases: ["flour", "plain flour", "self raising flour", "self rising flour", "all purpose flour", "strong white bread flour", "bread flour", "wholemeal flour"] },
  "gdb-134": { base: "g", density: 0.85, cupboard: true, per: { cup: 200 }, aliases: ["sugar", "caster sugar", "granulated sugar", "white sugar", "icing sugar", "golden caster sugar"] },
  "gdb-135": { base: "g", density: 0.8, cupboard: true, per: { cup: 200 }, aliases: ["brown sugar", "light brown sugar", "dark brown sugar", "soft brown sugar", "light muscovado sugar", "dark muscovado sugar", "muscovado sugar", "demerara sugar"] },
  "gdb-136": { base: "each", cupboard: true, per: { pack: 8, cube: 1, each: 1, pot: 1, sachet: 1, ml: 1 / 500 }, aliases: ["stock cube", "stock", "chicken stock", "beef stock", "vegetable stock", "veg stock", "fish stock", "lamb stock", "stock pot", "bouillon", "vegetable bouillon", "chicken stock cube", "beef stock cube", "vegetable stock cube", "chicken stock pot", "beef stock pot", "vegetable stock pot", "hot chicken stock", "hot vegetable stock", "hot beef stock"] },
  "gdb-137": weighed(null, ["frozen pea", "pea", "garden pea", "petit pois"], { cup: 150, handful: 40 }),
  "gdb-138": weighed(null, ["frozen chip", "oven chip", "chip"]),
  "gdb-139": { base: "each", per: { each: 1 }, aliases: ["frozen pizza", "pizza"] },
  "gdb-140": { base: "each", per: { tub: 1, each: 1 }, aliases: ["ice cream"] },
  "gdb-141": weighed(null, ["mixed veg", "mixed vegetable", "frozen mixed vegetable", "frozen vegetable"]),
  "gdb-142": weighed(null, ["frozen berry", "mixed berry", "frozen fruit", "frozen mixed berry"]),
  "gdb-150": liquid(["orange juice", "fresh orange juice"], { carton: 1e3 }),
  "gdb-151": liquid(["apple juice"], { carton: 1e3 }),
  "gdb-155": liquid(["wine", "red wine", "white wine", "dry white wine", "dry red wine"], { bottle: 750 }),
  "gdb-168": { base: "g", sameAs: "gdb-137" }
};
var spice = (id, name, aliases, grams = 40) => ({
  item: { id, name, unit: "jar", increment: 1, category: "Pantry" },
  spec: { base: "g", cupboard: true, per: { jar: grams, each: grams, tsp: 2.5, tbsp: 7.5, pinch: 0.25 }, aliases }
});
var extra = (id, name, unit, increment, category, spec) => ({
  item: { id, name, unit, increment, category },
  spec
});
var EXTRA_PRODUCTS = [
  spice("gdb-x-ground-cumin", "Ground Cumin", ["cumin", "cumin powder", "ground cumin"]),
  spice("gdb-x-cumin-seeds", "Cumin Seeds", ["cumin seed"]),
  spice("gdb-x-paprika", "Paprika", ["sweet paprika", "paprika"]),
  spice("gdb-x-smoked-paprika", "Smoked Paprika", ["smoked sweet paprika", "pimenton", "hot smoked paprika"]),
  spice("gdb-x-chilli-powder", "Chilli Powder", ["hot chilli powder", "mild chilli powder", "chili powder"]),
  spice("gdb-x-chilli-flakes", "Chilli Flakes", ["dried chilli flake", "red pepper flake", "crushed chilli", "crushed red pepper", "chilli flake"]),
  spice("gdb-x-turmeric", "Ground Turmeric", ["turmeric", "turmeric powder"]),
  spice("gdb-x-garam-masala", "Garam Masala", ["garam masala"]),
  spice("gdb-x-curry-powder", "Curry Powder", ["medium curry powder", "mild curry powder", "madras curry powder", "hot curry powder"]),
  spice("gdb-x-ground-coriander", "Ground Coriander", ["coriander powder", "ground coriander"]),
  spice("gdb-x-coriander-seeds", "Coriander Seeds", ["coriander seed"]),
  spice("gdb-x-oregano", "Dried Oregano", ["oregano", "dried oregano"]),
  spice("gdb-x-mixed-herbs", "Mixed Herbs", ["dried mixed herb", "italian seasoning", "herbes de provence", "italian herb", "dried herb"]),
  spice("gdb-x-dried-thyme", "Dried Thyme", ["dried thyme"]),
  spice("gdb-x-dried-basil", "Dried Basil", ["dried basil"]),
  spice("gdb-x-dried-parsley", "Dried Parsley", ["dried parsley"]),
  spice("gdb-x-cinnamon", "Ground Cinnamon", ["cinnamon", "cinnamon powder", "cinnamon stick"]),
  spice("gdb-x-ground-ginger", "Ground Ginger", ["ground ginger", "ginger powder"]),
  spice("gdb-x-nutmeg", "Ground Nutmeg", ["nutmeg", "grated nutmeg"]),
  spice("gdb-x-bay-leaves", "Bay Leaves", ["bay leaf", "dried bay leaf", "fresh bay leaf"], 5),
  spice("gdb-x-cayenne", "Cayenne Pepper", ["cayenne", "cayenne pepper"]),
  spice("gdb-x-five-spice", "Chinese Five Spice", ["five spice", "five spice powder", "chinese five spice powder"]),
  spice("gdb-x-garlic-powder", "Garlic Powder", ["garlic granule", "garlic powder"]),
  spice("gdb-x-onion-powder", "Onion Powder", ["onion granule", "onion powder"]),
  spice("gdb-x-mixed-spice", "Mixed Spice", ["mixed spice", "allspice", "ground allspice"]),
  spice("gdb-x-fennel-seeds", "Fennel Seeds", ["fennel seed"]),
  spice("gdb-x-sesame-seeds", "Sesame Seeds", ["sesame seed", "toasted sesame seed"], 100),
  extra("gdb-x-vanilla", "Vanilla Extract", "bottle", 1, "Pantry", { base: "ml", cupboard: true, per: { bottle: 38 }, aliases: ["vanilla essence", "vanilla", "vanilla bean paste"] }),
  extra("gdb-x-baking-powder", "Baking Powder", "tub", 1, "Pantry", { base: "g", density: 0.9, cupboard: true, per: { tub: 170 }, aliases: ["baking powder"] }),
  extra("gdb-x-bicarb", "Bicarbonate of Soda", "tub", 1, "Pantry", { base: "g", density: 1.1, cupboard: true, per: { tub: 200 }, aliases: ["baking soda", "bicarb", "bicarbonate soda", "bicarb soda"] }),
  extra("gdb-x-cornflour", "Cornflour", "g", 500, "Pantry", { base: "g", density: 0.6, cupboard: true, aliases: ["cornstarch", "corn flour", "cornflour"] }),
  extra("gdb-x-worcestershire", "Worcestershire Sauce", "bottle", 1, "Pantry", { base: "ml", cupboard: true, per: { bottle: 150 }, aliases: ["worcestershire sauce", "worcester sauce"] }),
  extra("gdb-x-sweet-chilli", "Sweet Chilli Sauce", "bottle", 1, "Pantry", { base: "ml", cupboard: true, per: { bottle: 300 }, aliases: ["sweet chilli sauce", "sweet chili sauce"] }),
  extra("gdb-x-fish-sauce", "Fish Sauce", "bottle", 1, "Pantry", { base: "ml", cupboard: true, per: { bottle: 200 }, aliases: ["fish sauce", "nam pla", "thai fish sauce"] }),
  extra("gdb-x-oyster-sauce", "Oyster Sauce", "bottle", 1, "Pantry", { base: "ml", cupboard: true, per: { bottle: 150 }, aliases: ["oyster sauce"] }),
  extra("gdb-x-hoisin", "Hoisin Sauce", "jar", 1, "Pantry", { base: "ml", cupboard: true, per: { jar: 200, bottle: 200 }, aliases: ["hoisin sauce", "hoisin"] }),
  extra("gdb-x-sesame-oil", "Sesame Oil", "bottle", 1, "Pantry", { base: "ml", cupboard: true, per: { bottle: 250 }, aliases: ["sesame oil", "toasted sesame oil"] }),
  extra("gdb-x-red-wine-vinegar", "Red Wine Vinegar", "bottle", 1, "Pantry", { base: "ml", cupboard: true, per: { bottle: 350 }, aliases: ["red wine vinegar"] }),
  extra("gdb-x-cider-vinegar", "Cider Vinegar", "bottle", 1, "Pantry", { base: "ml", cupboard: true, per: { bottle: 350 }, aliases: ["apple cider vinegar", "cider vinegar"] }),
  extra("gdb-x-rice-vinegar", "Rice Vinegar", "bottle", 1, "Pantry", { base: "ml", cupboard: true, per: { bottle: 150 }, aliases: ["rice wine vinegar", "rice vinegar"] }),
  extra("gdb-x-gravy", "Gravy Granules", "tub", 1, "Pantry", { base: "g", cupboard: true, per: { tub: 200, tbsp: 10, tsp: 3 }, aliases: ["gravy granule", "gravy"] }),
  extra("gdb-x-lentils", "Lentils", "g", 500, "Pantry", { base: "g", cupboard: true, per: { cup: 190 }, aliases: ["red lentil", "green lentil", "puy lentil", "dried red lentil", "split red lentil", "lentil"] }),
  extra("gdb-x-pasta", "Pasta", "g", 500, "Pasta", { base: "g", cupboard: true, per: { cup: 100 }, aliases: ["pasta", "dried pasta", "pasta shape", "rigatoni", "farfalle", "tagliatelle", "linguine", "conchiglie", "orzo"] }),
  extra("gdb-x-breadcrumbs", "Breadcrumbs", "g", 200, "Pantry", { base: "g", cupboard: true, per: { cup: 60, tbsp: 7 }, aliases: ["breadcrumb", "panko", "panko breadcrumb", "dried breadcrumb"] }),
  extra("gdb-x-creme-fraiche", "Cr\xE8me Fra\xEEche", "pot", 1, "Dairy", { base: "ml", per: { pot: 200, tub: 200, each: 200 }, aliases: ["creme fraiche", "half fat creme fraiche", "reduced fat creme fraiche"] }),
  extra("gdb-x-ricotta", "Ricotta", "tub", 1, "Dairy", { base: "g", per: { tub: 250, each: 250 }, aliases: ["ricotta"] }),
  extra("gdb-x-mascarpone", "Mascarpone", "tub", 1, "Dairy", { base: "g", per: { tub: 250, each: 250 }, aliases: ["mascarpone"] }),
  extra("gdb-x-chorizo", "Chorizo", "pack", 1, "Meat", { base: "g", per: { pack: 200, ring: 225, each: 200, slice: 5 }, aliases: ["chorizo", "chorizo sausage", "cooking chorizo", "chorizo ring", "sliced chorizo"] }),
  extra("gdb-x-pancetta", "Pancetta", "pack", 1, "Meat", { base: "g", per: { pack: 130, each: 130 }, aliases: ["pancetta", "cubetti di pancetta", "pancetta cube", "diced pancetta", "lardon", "bacon lardon"] }),
  extra("gdb-x-tofu", "Tofu", "pack", 1, "Dairy", { base: "g", per: { pack: 280, block: 280, each: 280 }, aliases: ["firm tofu", "extra firm tofu", "tofu"] }),
  extra("gdb-x-gnocchi", "Gnocchi", "pack", 1, "Pasta", { base: "g", per: { pack: 500, each: 500 }, aliases: ["gnocchi", "potato gnocchi"] }),
  extra("gdb-x-naan", "Naan Bread", "pack", 1, "Bakery", { base: "each", per: { pack: 2, each: 1 }, aliases: ["naan", "naan bread", "garlic naan", "plain naan"] }),
  extra("gdb-x-puff-pastry", "Puff Pastry", "pack", 1, "Bakery", { base: "each", per: { pack: 1, sheet: 1, block: 1, each: 1, g: 1 / 320 }, aliases: ["puff pastry", "ready rolled puff pastry", "all butter puff pastry"] }),
  extra("gdb-x-shortcrust", "Shortcrust Pastry", "pack", 1, "Bakery", { base: "each", per: { pack: 1, sheet: 1, block: 1, each: 1, g: 1 / 320 }, aliases: ["shortcrust pastry", "ready rolled shortcrust pastry"] }),
  extra("gdb-x-shallots", "Shallots", "pack", 1, "Produce", { base: "g", per: { each: 30, pack: 250 }, aliases: ["shallot", "banana shallot"] }),
  extra("gdb-x-butternut", "Butternut Squash", "whole", 1, "Produce", { base: "g", per: { each: 1e3 }, aliases: ["butternut squash", "squash"] }),
  extra("gdb-x-kale", "Kale", "g", 200, "Produce", { base: "g", per: { bag: 200, handful: 30 }, aliases: ["kale", "cavolo nero", "curly kale", "spring green"] }),
  extra("gdb-x-pak-choi", "Pak Choi", "whole", 1, "Produce", { base: "each", per: { each: 1, head: 1, g: 1 / 120 }, aliases: ["pak choi", "bok choy", "pak choy", "bok choi"] }),
  extra("gdb-x-fresh-thyme", "Fresh Thyme", "pack", 1, "Produce", herb(["thyme", "fresh thyme", "thyme sprig", "thyme leaf"])),
  extra("gdb-x-fresh-rosemary", "Fresh Rosemary", "pack", 1, "Produce", herb(["rosemary", "fresh rosemary", "rosemary sprig"])),
  extra("gdb-x-fresh-mint", "Fresh Mint", "bunch", 1, "Produce", herb(["mint", "fresh mint", "mint leaf"])),
  extra("gdb-x-chives", "Chives", "pack", 1, "Produce", herb(["chive", "fresh chive", "snipped chive"])),
  extra("gdb-x-dill", "Dill", "pack", 1, "Produce", herb(["dill", "fresh dill"])),
  extra("gdb-x-pine-nuts", "Pine Nuts", "pack", 1, "Pantry", { base: "g", per: { pack: 100, each: 100, tbsp: 9 }, aliases: ["pine nut", "toasted pine nut"] }),
  extra("gdb-x-coconut-cream", "Coconut Cream", "carton", 1, "Canned", { base: "ml", per: { carton: 200, can: 400 }, aliases: ["coconut cream", "creamed coconut"] })
];
var EXTRA_BY_ID = new Map(EXTRA_PRODUCTS.map((p) => [p.item.id, p]));
function inferSpec(item) {
  const info = unitInfo(item.unit);
  if (info.dimension === "mass") return { base: "g" };
  if (info.dimension === "volume") return { base: "ml" };
  if (info.unit === "can") return { base: "g", per: { can: 400 } };
  return { base: "each", per: { [info.unit]: 1, each: 1 } };
}
function sizeOfUnit(unit, base, per, density) {
  if (per[unit] !== void 0) return per[unit];
  const vague = vagueUnit(unit);
  if (vague) {
    if (base === "g" || base === "ml") return vague.factor;
    const viaWeight = per.g ?? per.ml;
    return viaWeight !== void 0 ? vague.factor * viaWeight : null;
  }
  const info = unitInfo(unit);
  if (info.dimension === "mass") {
    if (base === "g") return info.factor;
    if (base === "ml" && density) return info.factor / density;
    if (base === "ml") return info.factor;
    if (per.g !== void 0) return info.factor * per.g;
    return null;
  }
  if (info.dimension === "volume") {
    if (base === "ml") return info.factor;
    if (base === "g" && density) return info.factor * density;
    if (per.ml !== void 0) return info.factor * per.ml;
    return null;
  }
  if (unit === "each" && base === "each") return 1;
  if (unit === "can" && base !== "each") return 400;
  return null;
}
function toProduct(item, specOverride) {
  const spec = specOverride ?? PRODUCT_SPECS[item.id] ?? EXTRA_BY_ID.get(item.id)?.spec ?? inferSpec(item);
  const base = spec.base;
  const per = { ...spec.per ?? {} };
  const buyUnit = canonicalUnit(item.unit);
  const step = typeof item.increment === "number" && item.increment > 0 ? item.increment : 1;
  const buySize = sizeOfUnit(buyUnit, base, per, spec.density);
  const names = [item.name, ...item.aliases ?? [], ...spec.aliases ?? []];
  const keys = [...new Set(names.map(matchKey).filter((k) => k.length > 0))];
  return {
    id: item.id,
    name: item.name,
    category: item.category || "Other",
    buyUnit,
    step,
    buySize,
    base,
    per,
    density: spec.density,
    cupboard: Boolean(spec.cupboard),
    sameAs: spec.sameAs,
    keys,
    item
  };
}
function buildCatalog(groceryDatabase, overrides) {
  const baseList = Array.isArray(groceryDatabase) && groceryDatabase.length > 0 ? groceryDatabase : INITIAL_GROCERY_DATABASE;
  const ov = overrides || {};
  const items = baseList.filter((i) => i && typeof i.name === "string" && i.name.trim()).map((i) => ({ ...i, ...ov[i.id] || {} }));
  const ids = new Set(items.map((i) => i.id));
  for (const o of Object.values(ov)) {
    if (o && o.id && o.name && !ids.has(o.id)) {
      items.push(o);
      ids.add(o.id);
    }
  }
  const userCount = items.length;
  for (const extra2 of EXTRA_PRODUCTS) {
    if (!ids.has(extra2.item.id)) {
      items.push(extra2.item);
      ids.add(extra2.item.id);
    }
  }
  const products = items.map((i) => toProduct(i));
  const byId = new Map(products.map((p) => [p.id, p]));
  const byKey = /* @__PURE__ */ new Map();
  const entries = [];
  products.forEach((p, idx) => {
    for (const key of p.keys) {
      const existing = byKey.get(key);
      if (!existing || idx < userCount && products.indexOf(existing) >= userCount) byKey.set(key, p);
      entries.push({ key, words: key.split(" "), product: p });
    }
  });
  return { products, byId, byKey, entries };
}
function resolve(catalog, product) {
  let p = product ?? null;
  for (let i = 0; p && p.sameAs && i < 5; i++) {
    const target = catalog.byId.get(p.sameAs);
    if (!target) break;
    p = target;
  }
  return p;
}
function findSpan(words, keyWords) {
  for (let start = words.length - keyWords.length; start >= 0; start--) {
    let ok = true;
    for (let j = 0; j < keyWords.length; j++) {
      if (words[start + j] !== keyWords[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return start;
  }
  return -1;
}
var SMALL_MEASURES = /* @__PURE__ */ new Set(["pinch", "dash", "tsp", "tbsp", "grind"]);
function matchProductDetailed(catalog, name, opts = {}) {
  const key = matchKey(name);
  if (key) {
    const exact = catalog.byKey.get(key);
    if (exact) return { product: disambiguate(catalog, resolve(catalog, exact), key, key, opts), how: "exact" };
  }
  if (opts.groceryId) {
    const linked = resolve(catalog, catalog.byId.get(opts.groceryId));
    if (linked) return { product: linked, how: "linked" };
  }
  if (!key) return null;
  const words = key.split(" ");
  let best = null;
  for (const entry of catalog.entries) {
    if (entry.words.length > words.length) continue;
    const start = findSpan(words, entry.words);
    if (start < 0) continue;
    const end = start + entry.words.length;
    const after = words.slice(end);
    const ownWords = /* @__PURE__ */ new Set([...entry.product.name.toLowerCase().split(/\s+/).map((w) => w.replace(/s$/, "")), ...entry.product.category.toLowerCase().split(/\W+/).map((w) => w.replace(/s$/, ""))]);
    if (after.some((w) => IDENTITY_AFTER.has(w) && !ownWords.has(w))) continue;
    if (start > 0 && IDENTITY_BEFORE.has(words[start - 1])) continue;
    const generic = entry.words.length === 1 && GENERIC_HEADS.has(entry.words[0]);
    if (generic && words.slice(0, start).some((w) => !DESCRIPTORS.has(w))) continue;
    const score = [end === words.length && !generic ? 1 : 0, entry.words.length, entry.key.length];
    if (!best || score[0] > best.score[0] || score[0] === best.score[0] && (score[1] > best.score[1] || score[1] === best.score[1] && score[2] > best.score[2])) {
      best = { score, product: entry.product, key: entry.key };
    }
  }
  if (!best) return null;
  const product = resolve(catalog, best.product);
  return product ? { product: disambiguate(catalog, product, best.key, key, opts), how: "partial" } : null;
}
function disambiguate(catalog, found, foundKey, key, opts) {
  if (foundKey !== "pepper") return found;
  const u = canonicalUnit(opts.unit);
  const words = key.split(" ");
  const toTaste = words.includes("taste") || words.includes("season") || words.includes("seasoning");
  const counted = u === "each" && !SMALL_MEASURES.has(u) && typeof opts.amount === "number" && opts.amount >= 1 && !toTaste;
  const bell = resolve(catalog, catalog.byId.get("gdb-8"));
  return counted && bell ? bell : found;
}
function matchProduct(catalog, name, opts = {}) {
  return matchProductDetailed(catalog, name, opts)?.product ?? null;
}

// oldhead/src/utils.ts
function getGroceryAisle(item) {
  const cat = (item.category || "").toLowerCase().trim();
  const name = (item.name || "").toLowerCase().trim();
  if (cat.includes("produce") || cat.includes("vegetable") || cat.includes("fruit")) return "produce";
  if (cat.includes("meat") || cat.includes("poultry") || cat.includes("fish") || cat.includes("seafood")) return "meat_seafood";
  if (cat.includes("dairy") || cat.includes("egg") || cat.includes("cheese")) return "dairy_eggs";
  if (cat.includes("pasta") || cat.includes("grain") || cat.includes("rice") || cat.includes("noodle")) return "grains_pasta";
  if (cat.includes("canned") || cat.includes("tin") || cat.includes("jar")) return "canned_jars";
  if (cat.includes("bakery") || cat.includes("bread")) return "bakery";
  if (cat.includes("frozen")) return "frozen";
  if (cat.includes("pantry") || cat.includes("spice") || cat.includes("seasoning") || cat.includes("oil")) return "pantry_spices";
  if (cat.includes("household") || cat.includes("clean")) return "household_other";
  if (/\b(apple|apples|banana|bananas|berry|berries|broccoli|carrot|carrots|onion|onions|garlic|potato|potatoes|tomato|tomatoes|spinach|lettuce|salad|pepper|peppers|courgette|zucchini|mushroom|mushrooms|ginger|lemon|lemons|lime|limes|avocado|avocados|cucumber|cabbage|celery|chili|chilli|chillies|herb|herbs|basil|coriander|cilantro|parsley|rosemary|thyme|leek|leeks|kale|cauliflower|pea|peas|asparagus|corn|sweetcorn|beetroot|orange|oranges|grape|grapes|fruit|veg|vegetable|shallot|shallots|scallion|scallions)\b/i.test(name)) {
    return "produce";
  }
  if (/\b(bread|bagel|bagels|pitta|pita|wrap|wraps|tortilla|tortillas|naan|roll|rolls|bun|buns|baguette|sourdough|loaf|brioche|croissant|crumpet|toast|flatbread|muffin|muffins)\b/i.test(name)) {
    return "bakery";
  }
  if (/\b(beef|chicken|pork|lamb|bacon|sausage|sausages|steak|steaks|mince|minced|turkey|duck|salmon|cod|prawn|prawns|shrimp|fish|fillet|fillets|tuna|ham|prosciutto|chorizo|meat|seafood|ribs|gammon)\b/i.test(name)) {
    return "meat_seafood";
  }
  if (/\b(milk|oat milk|almond milk|cheese|cheddar|mozzarella|parmesan|halloumi|feta|brie|butter|cream|double cream|single cream|sour cream|yogurt|yoghurt|egg|eggs|creme fraiche|paneer|ricotta|mascarpone|custard|dairy)\b/i.test(name)) {
    return "dairy_eggs";
  }
  if (/\b(pasta|spaghetti|noodle|noodles|penne|fusilli|macaroni|lasagne|lasagna|rice|basmati|jasmine|couscous|quinoa|oats|oatmeal|barley|bulgur|orzo|cereal|grain|grains)\b/i.test(name)) {
    return "grains_pasta";
  }
  if (/\b(canned|can|tin|tinned|tomato paste|passata|baked beans|black beans|kidney beans|chickpeas|coconut milk|lentils|olives|pesto|pickles|salsa|jam|marmite)\b/i.test(name)) {
    return "canned_jars";
  }
  if (/\b(frozen|ice cream|ice|gelato|sorbet)\b/i.test(name)) {
    return "frozen";
  }
  if (/\b(oil|olive oil|vegetable oil|sesame oil|sunflower oil|soy sauce|vinegar|balsamic|flour|sugar|salt|pepper|black pepper|cumin|paprika|oregano|curry|curry powder|turmeric|cinnamon|stock|stock cube|stock cubes|broth|honey|mustard|mayo|mayonnaise|ketchup|sauce|spice|spices|powder|baking powder|yeast|nuts|almonds|walnuts|seeds|peanut butter|tea|coffee)\b/i.test(name)) {
    return "pantry_spices";
  }
  if (/\b(foil|kitchen roll|toilet roll|soap|detergent|wash|tissue|tissues|sponge|sponges|cleaner|bag|bags|batteries|napkin|napkins)\b/i.test(name)) {
    return "household_other";
  }
  return "pantry_spices";
}
export {
  INITIAL_GROCERY_DATABASE,
  buildCatalog,
  getGroceryAisle,
  matchProduct,
  matchProductDetailed
};
