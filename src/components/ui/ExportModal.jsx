import React from 'react';
import { FileDown, X, Calendar, Package, Boxes, Database } from 'lucide-react';

const ExportModal = ({ 
  showExportModal, 
  setShowExportModal, 
  exportWeeklyDataCSV, 
  exportSKUDataCSV, 
  exportInventoryCSV, 
  exportAll,
  invHistory 
}) => {
  if (!showExportModal) return null;
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FileDown className="w-6 h-6 text-emerald-400" />
            Export Data
          </h2>
          <button onClick={() => setShowExportModal(false)} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="space-y-3">
          <button onClick={() => { exportWeeklyDataCSV(); setShowExportModal(false); }}
            className="w-full p-4 bg-slate-900/50 hover:bg-slate-700 border border-slate-600 rounded-xl text-left flex items-center gap-3">
            <Calendar className="w-6 h-6 text-violet-400" />
            <div>
              <p className="text-white font-medium">Weekly Sales Data</p>
              <p className="text-slate-400 text-sm">Revenue, profit, units by week</p>
            </div>
          </button>
          
          <button onClick={() => { exportSKUDataCSV(); setShowExportModal(false); }}
            className="w-full p-4 bg-slate-900/50 hover:bg-slate-700 border border-slate-600 rounded-xl text-left flex items-center gap-3">
            <Package className="w-6 h-6 text-pink-400" />
            <div>
              <p className="text-white font-medium">SKU Performance</p>
              <p className="text-slate-400 text-sm">All SKUs with totals and averages</p>
            </div>
          </button>
          
          <button onClick={() => { exportInventoryCSV(); setShowExportModal(false); }}
            disabled={Object.keys(invHistory).length === 0}
            className="w-full p-4 bg-slate-900/50 hover:bg-slate-700 border border-slate-600 rounded-xl text-left flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed">
            <Boxes className="w-6 h-6 text-amber-400" />
            <div>
              <p className="text-white font-medium">Inventory Snapshot</p>
              <p className="text-slate-400 text-sm">Current inventory with values</p>
            </div>
          </button>
          
          <button onClick={() => { exportAll(); setShowExportModal(false); }}
            className="w-full p-4 bg-slate-900/50 hover:bg-slate-700 border border-slate-600 rounded-xl text-left flex items-center gap-3">
            <Database className="w-6 h-6 text-emerald-400" />
            <div>
              <p className="text-white font-medium">Full Backup (JSON)</p>
              <p className="text-slate-400 text-sm">Complete data backup for restore</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
