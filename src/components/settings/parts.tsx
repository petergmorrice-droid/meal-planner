/** Small pieces the Settings pages are built from: rows, a segmented choice, a sheet, a sub-page header. */
import React, { useEffect } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { GROCERY_AISLES } from '../../utils';

export const sectionTitle = 'text-[13px] font-bold uppercase tracking-wide text-zinc-500 px-1 mb-1.5';
export const card = 'bg-white rounded-2xl border border-zinc-200 divide-y divide-zinc-100';
export const row = 'w-full px-4 py-3 flex items-center gap-3 text-left';

export function NavRow({
  icon,
  title,
  sub,
  onClick,
  attr,
}: {
  icon: React.ReactNode;
  title: string;
  sub?: string;
  onClick: () => void;
  attr: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${row} cursor-pointer hover:bg-zinc-50`}
      data-setting-link={attr}
    >
      <span className="w-9 h-9 rounded-xl bg-zinc-100 text-zinc-600 flex items-center justify-center shrink-0">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-zinc-900">{title}</span>
        {sub && <span className="block text-[13px] text-zinc-500 truncate">{sub}</span>}
      </span>
      <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  attr,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  attr: string;
}) {
  return (
    <div className="flex items-center bg-zinc-100 p-0.5 rounded-xl border border-zinc-200" data-segmented={attr}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`h-9 px-3 text-sm font-semibold rounded-lg cursor-pointer whitespace-nowrap ${value === o.id ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ label, children, onClose }: { label: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={label}
        className="bg-white w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {children}
      </div>
    </div>
  );
}

export const SubHeader = ({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) => (
  <header className="bg-white border-b border-zinc-200/80 px-2 py-1.5 shrink-0">
    <div className="max-w-2xl mx-auto flex items-center gap-1">
      <button
        type="button"
        onClick={onBack}
        className="h-10 pl-1 pr-2 rounded-xl text-sm font-semibold text-zinc-600 inline-flex items-center cursor-pointer"
        data-settings-back
      >
        <ChevronLeft className="w-5 h-5" />
        Settings
      </button>
      <h2 className="flex-1 text-center text-[15px] font-bold text-zinc-900 truncate pr-2">{title}</h2>
      <span className="min-w-[88px] flex justify-end">{right}</span>
    </div>
  </header>
);
export const AISLES_IN_ORDER = Object.values(GROCERY_AISLES).sort((a, b) => a.order - b.order);
