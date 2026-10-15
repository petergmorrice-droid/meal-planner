import React from 'react';

export const DevConsoleTable = ({ title, data, description }: { title: string, data: any[], description?: string }) => {
  if (!data || data.length === 0) return (
    <div className="space-y-1 mb-6">
      <h3 className="text-sm font-bold text-zinc-900">{title}</h3>
      {description && <p className="text-xs text-zinc-500">{description}</p>}
      <div className="p-4 bg-white border border-zinc-200 rounded-xl text-zinc-400 text-xs text-center">No data</div>
    </div>
  );

  const keys = Array.from(new Set(data.flatMap(Object.keys)));

  const renderValue = (val: any) => {
    if (val === null || val === undefined) return <span className="text-zinc-400">null</span>;
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'object') {
      return (
        <details className="cursor-pointer">
          <summary className="text-blue-600 hover:underline">View Object</summary>
          <pre className="mt-1 p-2 bg-zinc-100 rounded text-[10px] overflow-auto max-h-32">
            {JSON.stringify(val, null, 2)}
          </pre>
        </details>
      );
    }
    return String(val);
  };

  return (
    <div className="space-y-2 mb-8">
      <h3 className="text-sm font-bold text-zinc-900">{title} ({data.length})</h3>
      {description && <p className="text-xs text-zinc-500">{description}</p>}
      <div className="overflow-x-auto bg-white border border-zinc-200 rounded-xl shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-50 border-b border-zinc-200">
            <tr>
              {keys.map(k => <th key={k} className="px-3 py-2 font-semibold text-zinc-700 whitespace-nowrap">{k}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {data.map((row, i) => (
              <tr key={i} className="hover:bg-zinc-50/50">
                {keys.map(k => (
                  <td key={k} className="px-3 py-2 align-top max-w-xs break-words">
                    {renderValue(row[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
