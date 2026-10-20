import React from 'react';
import { Star } from 'lucide-react';
import PersonMark, { personLook } from './PersonMark';
import type { PersonRatings } from '../ratings';

/** 1 to 5 stars. Tappable when `onChange` is given (tap the same star again to take the rating off). */
export function Stars({ value = 0, onChange, size = 'md', label }: { value?: number; onChange?: (stars: number) => void; size?: 'sm' | 'md' | 'lg'; label?: string }) {
  const px = size === 'lg' ? 'w-8 h-8' : size === 'md' ? 'w-6 h-6' : 'w-3.5 h-3.5';
  const hit = size === 'lg' ? 'w-11 h-11' : size === 'md' ? 'w-9 h-9' : '';
  return (
    <span className="inline-flex items-center" role={onChange ? 'radiogroup' : 'img'} aria-label={label || `${value || 'No'} ${value === 1 ? 'star' : 'stars'}`} data-stars={value}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= value;
        const icon = <Star className={`${px} ${on ? 'fill-amber-400 text-amber-500' : 'text-zinc-300'}`} aria-hidden="true" />;
        return onChange ? (
          <button key={n} type="button" onClick={() => onChange(n === value ? 0 : n)} role="radio" aria-checked={n === value} aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
            className={`${hit} flex items-center justify-center rounded-lg cursor-pointer active:scale-95`} data-star={n}>
            {icon}
          </button>
        ) : <span key={n}>{icon}</span>;
      })}
    </span>
  );
}

/**
 * Peter's and Rachel's ratings, one row each in their colour. The person using this phone can
 * tap their own stars; the other person's are shown as they left them.
 */
export function RatingRows({ ratings, me, onRate, size = 'md' }: { ratings: PersonRatings; me: string; onRate?: (stars: number) => void; size?: 'md' | 'lg' }) {
  const order = me === 'R' ? (['R', 'P'] as const) : (['P', 'R'] as const);
  return (
    <div className="space-y-1" data-rating-rows>
      {order.map((who) => {
        const look = personLook(who)!;
        const mine = who === me;
        const value = ratings[who] || 0;
        return (
          <div key={who} className="flex items-center gap-2" data-rating-row={who}>
            <span className={`w-20 shrink-0 text-sm font-semibold inline-flex items-center gap-1.5 ${look.text}`}>
              <PersonMark who={who} what={mine ? 'You' : look.name} />
              {mine ? 'You' : look.name}
            </span>
            {mine && onRate ? (
              <Stars value={value} onChange={onRate} size={size} label={`Your rating: ${value || 'none'}`} />
            ) : value ? (
              <Stars value={value} size={size === 'lg' ? 'md' : 'sm'} label={`${look.name}: ${value} ${value === 1 ? 'star' : 'stars'}`} />
            ) : (
              <span className="text-sm text-zinc-400">Not rated yet</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** "★ 4 5" on a card: each person's stars in their colour (or nothing if nobody's rated it). */
export function RatingChip({ ratings }: { ratings: PersonRatings }) {
  if (!ratings.P && !ratings.R) return null;
  const title = [ratings.P ? `Peter ${ratings.P}` : '', ratings.R ? `Rachel ${ratings.R}` : ''].filter(Boolean).join(', ');
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold rounded-md px-1.5 py-px bg-amber-50 border border-amber-200" title={title} aria-label={`Rated: ${title}`} data-rating-chip>
      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" aria-hidden="true" />
      {ratings.P ? <span className="text-blue-700" data-rating-p>{ratings.P}</span> : null}
      {ratings.R ? <span className="text-pink-700" data-rating-r>{ratings.R}</span> : null}
    </span>
  );
}
