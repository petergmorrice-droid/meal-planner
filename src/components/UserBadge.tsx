import React from 'react';

interface UserBadgeProps {
  identity?: string;
  addedBy?: string;
  lastModifiedBy?: string;
}

export default function UserBadge({ identity, addedBy, lastModifiedBy }: UserBadgeProps) {
  // If we only have identity, use it
  const effectiveAddedBy = addedBy || (!lastModifiedBy ? identity : undefined);
  const effectiveLastModifiedBy = lastModifiedBy || (lastModifiedBy && lastModifiedBy !== addedBy ? lastModifiedBy : undefined);

  if (!effectiveAddedBy && !effectiveLastModifiedBy) return null;

  const renderBadgeCircle = (id: string, type: 'added' | 'modified') => {
    const isPeter = id.toUpperCase() === 'P';
    const name = isPeter ? 'Peter' : 'Rachel';
    const label = type === 'added' ? `Added by ${name}` : `Modified by ${name}`;
    
    return (
      <div 
        key={type}
        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm transition-transform hover:scale-110 relative select-none ${
          isPeter ? 'bg-indigo-500' : 'bg-emerald-500'
        }`}
        title={label}
      >
        {id.toUpperCase()}
        {type === 'added' ? (
          <span className="absolute -bottom-0.5 -right-0.5 bg-zinc-800 text-white rounded-full w-2.5 h-2.5 flex items-center justify-center text-[6px] font-black border border-white">
            +
          </span>
        ) : (
          <span className="absolute -bottom-0.5 -right-0.5 bg-zinc-800 text-white rounded-full w-2.5 h-2.5 flex items-center justify-center text-[6px] font-black border border-white font-mono">
            ✎
          </span>
        )}
      </div>
    );
  };

  // If addedBy and lastModifiedBy are same, or only one is provided
  if (effectiveAddedBy && effectiveLastModifiedBy && effectiveAddedBy !== effectiveLastModifiedBy) {
    return (
      <div className="flex items-center gap-1">
        {renderBadgeCircle(effectiveAddedBy, 'added')}
        {renderBadgeCircle(effectiveLastModifiedBy, 'modified')}
      </div>
    );
  }

  // Fallback to single badge
  const singleId = effectiveAddedBy || effectiveLastModifiedBy;
  if (!singleId) return null;

  const isPeter = singleId.toUpperCase() === 'P';
  const name = isPeter ? 'Peter' : 'Rachel';
  const tooltip = effectiveAddedBy && effectiveLastModifiedBy && effectiveAddedBy === effectiveLastModifiedBy
    ? `Added & modified by ${name}`
    : effectiveAddedBy
      ? `Added by ${name}`
      : `Modified by ${name}`;

  return (
    <div 
      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm relative group select-none ${
        isPeter ? 'bg-indigo-500' : 'bg-emerald-500'
      }`}
      title={tooltip}
    >
      {singleId.toUpperCase()}
      {effectiveAddedBy && (
        <span className="absolute -bottom-0.5 -right-0.5 bg-zinc-800 text-white rounded-full w-2.5 h-2.5 flex items-center justify-center text-[6px] font-black border border-white">
          +
        </span>
      )}
    </div>
  );
}
