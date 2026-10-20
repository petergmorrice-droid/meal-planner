import { shopQuantityText } from '../../shopList';
import { formatListWithAnd, ThresholdWarningState } from './needs';

export function BelowThresholdWarningModal({ data, onClose, onKeepRequired, onConfirmReduce }: { data: ThresholdWarningState, onClose: () => void, onKeepRequired: () => void, onConfirmReduce: (amount: number) => void }) {
  const need = shopQuantityText({ amount: data.requirement?.requiredAmount ?? 0, unit: data.item?.unit });
  const recipes: string[] = data.requirement?.recipes || [];
  return (
    <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4" data-below-needed>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="font-semibold text-lg mb-2 text-zinc-900">Less than your meals need</h3>
        <p className="text-zinc-700 text-sm">
          {recipes.length ? `${formatListWithAnd(recipes)} need${recipes.length === 1 ? 's' : ''}` : 'Your meals need'} {need} of {data.item?.name}.
        </p>
        <div className="flex flex-col gap-2 mt-5">
          <button onClick={onKeepRequired} className="w-full px-4 py-3 font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl">Keep {need}</button>
          <button onClick={() => onConfirmReduce(data.targetAmount)} className="w-full px-4 py-3 font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-xl">{data.isRemoval ? 'Remove it anyway' : 'Use less anyway'}</button>
          <button onClick={onClose} className="w-full px-4 py-2 font-medium text-zinc-500 rounded-xl">Cancel</button>
        </div>
      </div>
    </div>
  );
}
