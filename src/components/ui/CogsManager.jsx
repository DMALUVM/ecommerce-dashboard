import React from 'react';
import { Check } from 'lucide-react';

const CogsManager = ({
  showCogsManager,
  setShowCogsManager,
  savedCogs,
  cogsLastUpdated,
  files,
  setFiles,
  setFileNames,
  processAndSaveCogs,
  FileBox
}) => {
  if (!showCogsManager) return null;
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-md w-full">
        <h2 className="text-xl font-bold text-white mb-4">Manage COGS</h2>
        {Object.keys(savedCogs).length > 0 ? (
          <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4 mb-4">
            <div className="flex items-center gap-2 text-emerald-400 mb-1"><Check className="w-5 h-5" /><span className="font-semibold">COGS Loaded</span></div>
            <p className="text-slate-300 text-sm">{Object.keys(savedCogs).length} SKUs</p>
            {cogsLastUpdated && <p className="text-slate-500 text-xs">Updated: {new Date(cogsLastUpdated).toLocaleDateString()}</p>}
          </div>
        ) : (
          <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4 mb-4">
            <p className="text-amber-400 font-semibold">No COGS Data</p>
            <p className="text-slate-300 text-sm">Upload a COGS file to enable profit calculations</p>
          </div>
        )}
        <div className="mb-4"><p className="text-slate-400 text-sm mb-2">Upload COGS file:</p><FileBox type="cogs" label="COGS File" desc="CSV with SKU and Cost Per Unit" /></div>
        <div className="flex gap-3">
          {files.cogs && <button onClick={processAndSaveCogs} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 rounded-xl">Save COGS</button>}
          <button onClick={() => { setShowCogsManager(false); setFiles(p => ({ ...p, cogs: null })); setFileNames(p => ({ ...p, cogs: '' })); }} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-xl">{files.cogs ? 'Cancel' : 'Close'}</button>
        </div>
      </div>
    </div>
  );
};

export default CogsManager;
