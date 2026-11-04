/**
 * Each tag's symbol, the same on the cards, in the filters and in the editor. Your own tags get one
 * from their words ("Quick" → a timer, "Kids" → a baby), or a plain tag if nothing fits.
 */
import {
  Baby,
  Beef,
  CakeSlice,
  CookingPot,
  Croissant,
  Drumstick,
  Dumbbell,
  Egg,
  Fish,
  Flame,
  Heart,
  Leaf,
  MilkOff,
  PartyPopper,
  Pizza,
  Salad,
  Sandwich,
  Shrimp,
  Snowflake,
  Soup,
  Sprout,
  Sun,
  Tag,
  Timer,
  Users,
  Utensils,
  Wallet,
  WheatOff,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { RecipeTag } from '../recipeInfo';

const BUILT_IN: Record<string, { icon: LucideIcon; color: string }> = {
  oven_hob: { icon: Flame, color: 'text-rose-500' },
  ninja: { icon: Zap, color: 'text-amber-500' },
  slow_cook: { icon: CookingPot, color: 'text-orange-600' },
  veggie: { icon: Leaf, color: 'text-emerald-600' },
  vegan: { icon: Sprout, color: 'text-emerald-600' },
  gluten_free: { icon: WheatOff, color: 'text-yellow-600' },
  dairy_free: { icon: MilkOff, color: 'text-sky-600' },
  meat: { icon: Beef, color: 'text-red-700' },
  fish: { icon: Fish, color: 'text-blue-600' },
};

/** Words in your own tags and the symbol they get (first match wins). */
const BY_WORD: [RegExp, LucideIcon, string][] = [
  [/quick|fast|speedy|easy|minute|\bmin\b/, Timer, 'text-violet-600'],
  [/freez/, Snowflake, 'text-cyan-600'],
  [/kid|child|toddler|baby|family/, Baby, 'text-pink-500'],
  [/spic|\bhot\b|chilli|chili/, Flame, 'text-red-600'],
  [/soup|stew|casserole/, Soup, 'text-orange-600'],
  [/salad|light|summer/, Salad, 'text-lime-600'],
  [/chicken|turkey|poultry/, Drumstick, 'text-amber-700'],
  [/prawn|shrimp|seafood/, Shrimp, 'text-orange-500'],
  [/egg/, Egg, 'text-amber-500'],
  [/pizza|italian|pasta/, Pizza, 'text-orange-500'],
  [/bake|bread|pastry|brunch|breakfast/, Croissant, 'text-amber-600'],
  [/lunch|sandwich|packed/, Sandwich, 'text-amber-600'],
  [/dessert|pudding|sweet|cake|treat/, CakeSlice, 'text-pink-500'],
  [/party|guest|special|celebrat|christmas|birthday/, PartyPopper, 'text-fuchsia-600'],
  [/batch|crowd|share|sharing/, Users, 'text-indigo-600'],
  [/healthy|protein|fitness|\blow\b/, Dumbbell, 'text-teal-600'],
  [/cheap|budget|thrifty/, Wallet, 'text-emerald-700'],
  [/favourite|favorite|love|comfort/, Heart, 'text-rose-500'],
  [/bbq|barbecue|sunny|weekend/, Sun, 'text-yellow-500'],
  [/dinner|weeknight|meal/, Utensils, 'text-zinc-500'],
];

export function tagSymbol(tag: Pick<RecipeTag, 'key' | 'label'>): { icon: LucideIcon; color: string } {
  const built = BUILT_IN[tag.key];
  if (built) return built;
  const words = tag.label.toLowerCase();
  const hit = BY_WORD.find(([re]) => re.test(words));
  return hit ? { icon: hit[1], color: hit[2] } : { icon: Tag, color: 'text-zinc-400' };
}

/** A tag's symbol. `plain`: in the colour of the text around it (on a filled button). */
export function TagIcon({
  tag,
  className = 'w-3.5 h-3.5',
  plain = false,
}: {
  tag: Pick<RecipeTag, 'key' | 'label'>;
  className?: string;
  plain?: boolean;
}) {
  const { icon: Icon, color } = tagSymbol(tag);
  return <Icon className={`${className} shrink-0 ${plain ? '' : color}`} aria-hidden="true" />;
}
