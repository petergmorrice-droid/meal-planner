const fs = require('fs');
let code = fs.readFileSync('src/components/SettingsTab.tsx', 'utf8');

const target = `                  <button
                    type="button"
                    onClick={exportBackup}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-medium transition-colors shadow-2xs cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Backup (JSON)</span>
                  </button>`;

const replacement = `                  <button
                    type="button"
                    onClick={exportBackup}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-medium transition-colors shadow-2xs cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Backup (JSON)</span>
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("This will clean up duplicate weeks and enforce 1 meal per day rules. Are you sure?")) {
                        store.repairDatabase().then(() => alert("Database Repaired Successfully"));
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-xs font-medium transition-colors shadow-2xs cursor-pointer"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Repair Database (Remove Duplicates)</span>
                  </button>`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  // Ensure Wrench icon is imported
  if (!code.includes('Wrench')) {
    code = code.replace('Download,', 'Download, Wrench,');
  }
  
  const typeTarget = `exportAllData: () => any;`;
  if (code.includes(typeTarget) && !code.includes('repairDatabase: () => Promise<void>;')) {
    code = code.replace(typeTarget, "exportAllData: () => any;\n    repairDatabase: () => Promise<void>;");
  }
  
  fs.writeFileSync('src/components/SettingsTab.tsx', code);
  console.log("Patched SettingsTab.tsx");
} else {
  console.log("Could not find target in SettingsTab.tsx");
}
