import React from 'react';
import { Check } from 'lucide-react';

/**
 * Peter blue, Rachel pink: who added, changed or wrote something. The same two colours
 * everywhere (shopping list, notes, meals, freezer, recipes, who ticked it).
 * (Full class names written out so Tailwind keeps them.)
 */
export const PEOPLE = {
  P: {
    name: 'Peter',
    mark: 'bg-blue-100 text-blue-700 ring-blue-200',
    text: 'text-blue-800',
    icon: 'text-blue-600',
    tile: 'bg-blue-50 text-blue-700',
    box: 'bg-blue-50/70 border-blue-200',
    bg: 'bg-blue-50',
  },
  R: {
    name: 'Rachel',
    mark: 'bg-pink-100 text-pink-700 ring-pink-200',
    text: 'text-pink-800',
    icon: 'text-pink-600',
    tile: 'bg-pink-50 text-pink-700',
    box: 'bg-pink-50/70 border-pink-200',
    bg: 'bg-pink-50',
  },
} as const;

export type PersonId = keyof typeof PEOPLE;

/** Peter or Rachel's colours, or null when it isn't known who. */
export function personLook(id?: string | null) {
  return id === 'P' || id === 'R' ? PEOPLE[id] : null;
}

/** "Peter", "Rachel", or '' when it isn't known who. */
export const personName = (id?: string | null) => personLook(id)?.name ?? '';

/** Note colours: the writer's colour, or the usual amber when nobody's known. */
export function noteLook(id?: string | null): { text: string; icon: string; box: string; bg: string } {
  return personLook(id) || { text: 'text-amber-800', icon: 'text-amber-600', box: 'bg-amber-50/70 border-amber-200', bg: 'bg-amber-50' };
}

/**
 * A small blue (Peter) or pink (Rachel) tick with their initial: who last added or changed it.
 * Nothing when nobody's known.
 */
export default function PersonMark({ who, what = 'Last changed', className = '' }: { who?: string | null; what?: string; className?: string }) {
  const look = personLook(who);
  if (!look) return null;
  const label = `${what} by ${look.name}`;
  return (
    <span
      className={`inline-flex items-center gap-px h-[18px] pl-1 pr-1.5 rounded-full ring-1 ring-inset text-[10px] font-bold leading-none shrink-0 ${look.mark} ${className}`}
      title={label}
      aria-label={label}
      role="img"
      data-person-mark={who}
    >
      <Check className="w-2.5 h-2.5 stroke-[3.5]" aria-hidden="true" />
      {who}
    </span>
  );
}
