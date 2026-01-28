import React from 'react';
import { AlertCircle, AlertTriangle } from 'lucide-react';

const ValidationModal = ({ 
  showValidationModal, 
  setShowValidationModal, 
  dataValidationWarnings, 
  setDataValidationWarnings,
  pendingProcessAction,
  setPendingProcessAction 
}) => {
  if (!showValidationModal) return null;
  const hasErrors = dataValidationWarnings.some(w => w.type === 'error');
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
          {hasErrors ? <AlertCircle className="w-6 h-6 text-rose-400" /> : <AlertTriangle className="w-6 h-6 text-amber-400" />}
          Data Validation {hasErrors ? 'Errors' : 'Warnings'}
        </h2>
        <p className="text-slate-400 text-sm mb-4">
          {hasErrors ? 'Please fix these issues before proceeding:' : 'Review these warnings before proceeding:'}
        </p>
        
        <div className="space-y-3 mb-6">
          {dataValidationWarnings.map((warning, idx) => (
            <div key={idx} className={`rounded-lg p-3 ${
              warning.type === 'error' ? 'bg-rose-900/30 border border-rose-500/50' :
              warning.type === 'warning' ? 'bg-amber-900/30 border border-amber-500/50' :
              'bg-blue-900/30 border border-blue-500/50'
            }`}>
              <p className={`font-medium ${
                warning.type === 'error' ? 'text-rose-300' :
                warning.type === 'warning' ? 'text-amber-300' :
                'text-blue-300'
              }`}>
                {warning.type === 'error' ? '❌' : warning.type === 'warning' ? '⚠️' : 'ℹ️'} {warning.message}
              </p>
              {warning.detail && <p className="text-slate-400 text-sm mt-1">{warning.detail}</p>}
            </div>
          ))}
        </div>
        
        <div className="flex gap-3">
          {!hasErrors && (
            <button 
              onClick={() => {
                setShowValidationModal(false);
                if (pendingProcessAction) {
                  pendingProcessAction();
                  setPendingProcessAction(null);
                }
              }} 
              className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2 rounded-lg"
            >
              Continue Anyway
            </button>
          )}
          <button 
            onClick={() => { 
              setShowValidationModal(false); 
              setPendingProcessAction(null);
              setDataValidationWarnings([]);
            }} 
            className={`${hasErrors ? 'flex-1' : ''} bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg`}
          >
            {hasErrors ? 'Go Back & Fix' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ValidationModal;
