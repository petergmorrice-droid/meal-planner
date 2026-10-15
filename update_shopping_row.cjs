const fs = require('fs');

const path = 'src/components/ShopTab.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replace the ShoppingItemRow component
const startStr = "function ShoppingItemRow({";
const endStr = "  );\n}\n\ninterface AggregatedShoppingListItem {";

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr, startIndex);

if (startIndex === -1 || endIndex === -1) {
  console.log("Could not find ShoppingItemRow boundaries");
  process.exit(1);
}

const newComponent = `function ShoppingItemRow({ 
  item, 
  onToggle, 
  onRemove,
  onUpdateQuantity,
  onEdit,
  requirement,
  onResetToRequired,
  isFavourite,
  onToggleFavourite,
  requiredFor
}: { 
  key?: React.Key;
  item: ShoppingListItem; 
  onToggle: (id: string) => void; 
  onRemove: (item: ShoppingListItem) => void; 
  onUpdateQuantity?: (id: string, delta: number) => void;
  onEdit?: (item: ShoppingListItem) => void;
  requirement?: PlannedRequirement | null;
  onResetToRequired?: (item: ShoppingListItem, requiredAmount: number) => void;
  isFavourite?: boolean;
  onToggleFavourite?: (name: string, category: string) => void;
  requiredFor?: string[];
}) {
  const aisle = getGroceryAisle(item);
  const aisleInfo = GROCERY_AISLES[aisle];
  const isBelowRequirement = requirement && !item.isAdhoc && !item.isBatch && !item.isRecurring && item.amount < requirement.requiredAmount;

  const { checked, isPending, toggle, undo } = useGracefulCheckoff(item.checked, () => onToggle(item.id), 2500);

  return (
    <div className={\`flex items-center justify-between px-3 py-2 rounded-xl border transition-all \${
      checked 
        ? 'bg-zinc-50/70 border-zinc-200/60 opacity-40' 
        : isBelowRequirement
          ? 'bg-amber-50/30 border-amber-300/80 shadow-2xs hover:border-amber-400'
          : 'bg-white border-zinc-200/80 shadow-2xs hover:border-zinc-300'
    }\`}>
      <div className="flex-1 min-w-0 pr-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className={\`font-medium text-xs text-zinc-900 truncate \${checked ? 'line-through text-zinc-400' : ''}\`}>
            {item.name}
          </p>

          {onToggleFavourite && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavourite(item.name, aisleInfo.name);
              }}
              className={\`p-0.5 rounded-full transition-colors \${
                isFavourite 
                  ? 'text-rose-500 hover:bg-rose-50' 
                  : 'text-zinc-300 hover:text-rose-400 hover:bg-zinc-100'
              }\`}
              title={isFavourite ? "Remove from favourites" : "Add to favourites"}
            >
              <Heart className={\`w-3.5 h-3.5 \${isFavourite ? 'fill-rose-500' : ''}\`} />
            </button>
          )}

          <span className={\`text-[9px] font-medium px-1.5 py-0.2 rounded border \${aisleInfo.colorClass}\`}>
            {aisleInfo.name}
          </span>

          {item.isBatch && (
            <span className="inline-flex items-center text-cyan-500" title="Batch">
              <Snowflake className="w-3.5 h-3.5" />
            </span>
          )}

          {item.isRecurring && (
            <span className="inline-flex items-center text-emerald-500" title="Recurring">
              <RotateCcw className="w-3.5 h-3.5" />
            </span>
          )}

          {item.isAdhoc && (
            <span className="inline-flex items-center text-amber-500" title="Added Item">
              <UserPlus className="w-3.5 h-3.5" />
            </span>
          )}

          {isBelowRequirement && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onResetToRequired?.(item, requirement.requiredAmount);
              }}
              className="inline-flex items-center gap-1 text-[9px] font-semibold bg-amber-100/90 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded hover:bg-amber-200 transition-colors cursor-pointer"
              title={\`\${requirement.requiredAmount} required for meal plan. Click to restore.\`}
            >
              <Info className="w-2.5 h-2.5 text-amber-600" />
              <span>Below need ({item.amount}/{requirement.requiredAmount})</span>
            </button>
          )}

          {/* User Audit Trail Badge */}
          <UserBadge identity={item.addedBy || item.lastModifiedBy} />
        </div>

        <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-0.5 flex-wrap">
          <span className="font-semibold text-zinc-700">
            {item.amount}{item.unit && !['whole', 'item', 'items', 'count', 'piece', 'pieces', 'unit', 'units', ''].includes(item.unit.toLowerCase().trim()) ? \` \${item.unit}\` : ''}
          </span>

          {requiredFor && requiredFor.length > 0 && (
            <span className="truncate max-w-[200px]">
              For: {requiredFor.join(', ')}
            </span>
          )}

          {!requiredFor && item.isBatch && item.batchRecipeName && (
            <span className="truncate max-w-[200px] text-zinc-500">
              for Batch: {item.batchRecipeName}
            </span>
          )}

          {!requiredFor && item.recipeNames && item.recipeNames.length > 0 && (
            <span className="truncate max-w-[200px]">
              for {item.recipeNames.join(', ')}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 ml-2 shrink-0">
        {isPending && (
          <button
            onClick={undo}
            className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-200 active:bg-emerald-100 transition-colors cursor-pointer"
          >
            Undo
          </button>
        )}
        
        {!isPending && onUpdateQuantity && (
          <div className="flex items-center bg-zinc-100/90 border border-zinc-200/80 rounded-lg p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => onUpdateQuantity(item.id, -1)}
              disabled={item.isAdhoc ? item.amount <= 1 : item.amount <= 0}
              className="w-5 h-5 rounded flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:bg-white disabled:opacity-25 disabled:hover:bg-transparent transition-all cursor-pointer"
            >
              <Minus className="w-2.5 h-2.5 stroke-[2.5]" />
            </button>
            <span className="text-[11px] font-bold text-zinc-800 min-w-[24px] text-center tabular-nums px-0.5 select-none">
              {item.amount || 1}{item.unit === 'g' || item.unit === 'ml' ? item.unit : ''}
            </span>
            <button
              type="button"
              onClick={() => onUpdateQuantity(item.id, 1)}
              className="w-5 h-5 rounded flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:bg-white transition-all cursor-pointer"
            >
              <Plus className="w-2.5 h-2.5 stroke-[2.5]" />
            </button>
          </div>
        )}

        {!isPending && (
          <>
            <button 
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit?.(item); }}
              className="p-1 text-zinc-300 hover:text-emerald-500 rounded-lg transition-colors cursor-pointer"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>

            <button 
              type="button"
              onClick={() => onRemove(item)} 
              className="p-1 text-zinc-300 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        <button
          type="button"
          onClick={toggle}
          className={\`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all cursor-pointer \${
            checked 
              ? 'bg-emerald-500 border-emerald-500 shadow-inner' 
              : 'bg-white border-zinc-200/80 shadow-2xs hover:border-zinc-300'
          }\`}
        >
          {checked && <Check className="w-4 h-4 text-white stroke-[3]" />}
        </button>
      </div>
    </div>`;

content = content.substring(0, startIndex) + newComponent + content.substring(endIndex);
fs.writeFileSync(path, content);
