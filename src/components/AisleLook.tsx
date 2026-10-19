import React from 'react';
import { Carrot, Croissant, Drumstick, Milk, Wheat, Cylinder, Amphora, Snowflake, SprayCan } from 'lucide-react';
import type { FoodAisle } from '../utils';

/**
 * Each aisle's colour and icon, so you can find your place in the list at a glance:
 * Fresh Produce green, Bakery amber, Meat & Seafood red, Dairy blue, Pasta & Rice orange,
 * Canned & Jarred purple, Pantry yellow, Frozen ice-blue, Household grey.
 * (Full class names written out so Tailwind keeps them.)
 */
export const AISLE_LOOK: Record<FoodAisle, {
  Icon: React.ComponentType<{ className?: string }>;
  /** Header strip: tinted background and its divider. */
  header: string;
  /** Header text. */
  title: string;
  /** The icon's tile. */
  tile: string;
}> = {
  produce: { Icon: Carrot, header: 'bg-emerald-50 border-emerald-100', title: 'text-emerald-900', tile: 'bg-emerald-100 text-emerald-700' },
  bakery: { Icon: Croissant, header: 'bg-amber-50 border-amber-100', title: 'text-amber-900', tile: 'bg-amber-100 text-amber-700' },
  meat_seafood: { Icon: Drumstick, header: 'bg-rose-50 border-rose-100', title: 'text-rose-900', tile: 'bg-rose-100 text-rose-700' },
  dairy_eggs: { Icon: Milk, header: 'bg-blue-50 border-blue-100', title: 'text-blue-900', tile: 'bg-blue-100 text-blue-700' },
  grains_pasta: { Icon: Wheat, header: 'bg-orange-50 border-orange-100', title: 'text-orange-900', tile: 'bg-orange-100 text-orange-700' },
  canned_jars: { Icon: Cylinder, header: 'bg-violet-50 border-violet-100', title: 'text-violet-900', tile: 'bg-violet-100 text-violet-700' },
  pantry_spices: { Icon: Amphora, header: 'bg-yellow-50 border-yellow-100', title: 'text-yellow-900', tile: 'bg-yellow-100 text-yellow-800' },
  frozen: { Icon: Snowflake, header: 'bg-cyan-50 border-cyan-100', title: 'text-cyan-900', tile: 'bg-cyan-100 text-cyan-700' },
  household_other: { Icon: SprayCan, header: 'bg-slate-100 border-slate-200', title: 'text-slate-800', tile: 'bg-slate-200/80 text-slate-700' },
};

/** The aisle's icon on its coloured tile. */
export function AisleIcon({ aisle, size = 'sm' }: { aisle: FoodAisle; size?: 'sm' | 'md' }) {
  const look = AISLE_LOOK[aisle] || AISLE_LOOK.household_other;
  const { Icon } = look;
  return (
    <span
      className={`${size === 'md' ? 'w-8 h-8 rounded-lg' : 'w-6 h-6 rounded-md'} ${look.tile} inline-flex items-center justify-center shrink-0`}
      aria-hidden="true"
      data-aisle-icon={aisle}
    >
      <Icon className={size === 'md' ? 'w-[18px] h-[18px]' : 'w-3.5 h-3.5'} />
    </span>
  );
}
