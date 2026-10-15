const fs = require('fs');

const path = 'src/components/ShopTab.tsx';
let content = fs.readFileSync(path, 'utf8');

const modals = `
function BatchMealModal({ store, onClose, onAdd, weekLabel }: { store: any, onClose: () => void, onAdd: (recipe: any) => void, weekLabel: string }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="font-bold text-lg mb-4">Add Batch Meal</h3>
        {/* Placeholder implementation */}
        <p className="text-zinc-500 text-sm mb-4">Select a batch meal to add to your list.</p>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 font-medium text-zinc-600 bg-zinc-100 rounded-lg">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function BelowThresholdWarningModal({ data, onClose, onKeepRequired, onConfirmReduce }: { data: any, onClose: () => void, onKeepRequired: () => void, onConfirmReduce: (amount: number) => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="font-bold text-lg mb-4 text-amber-600">Below Required Amount</h3>
        <p className="text-zinc-700 text-sm mb-4">You are reducing this item below what is required for your planned meals.</p>
        <div className="flex flex-col gap-3 mt-6">
          <button onClick={onKeepRequired} className="w-full px-4 py-3 font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-lg">Keep Required Amount</button>
          <button onClick={() => onConfirmReduce(data.targetAmount)} className="w-full px-4 py-3 font-semibold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-lg">Confirm Reduction</button>
          <button onClick={onClose} className="w-full px-4 py-3 font-medium text-zinc-500 rounded-lg">Cancel</button>
        </div>
      </div>
    </div>
  );
}
`;

content = content.replace("function ShoppingItemRow({", modals + "\nfunction ShoppingItemRow({");

fs.writeFileSync(path, content);
