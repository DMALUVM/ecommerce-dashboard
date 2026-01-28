import React from 'react';
import { AlertTriangle, Cloud, Smartphone, GitCompareArrows } from 'lucide-react';
import { formatCurrency } from '../../utils/format';

const ConflictResolutionModal = ({
  showConflictModal,
  setShowConflictModal,
  conflictData,
  setConflictData,
  conflictCheckRef,
  pushToCloudNow,
  loadFromCloud,
  setToast,
  setAllWeeksData,
  setAllDaysData,
  setInvoices
}) => {
  if (!showConflictModal || !conflictData) return null;
  
  // Calculate differences for display
  const cloudWeeks = Object.keys(conflictData.cloudData?.sales || {}).length;
  const localWeeks = Object.keys(conflictData.localData?.sales || {}).length;
  const cloudDays = Object.keys(conflictData.cloudData?.dailySales || {}).length;
  const localDays = Object.keys(conflictData.localData?.dailySales || {}).length;
  
  const cloudRevenue = Object.values(conflictData.cloudData?.dailySales || {}).reduce((sum, d) => sum + (d?.total?.revenue || 0), 0);
  const localRevenue = Object.values(conflictData.localData?.dailySales || {}).reduce((sum, d) => sum + (d?.total?.revenue || 0), 0);
  
  const handleKeepLocal = async () => {
    // Force save local data, overwriting cloud
    setShowConflictModal(false);
    setConflictData(null);
    conflictCheckRef.current = false;
    await pushToCloudNow(conflictData.localData, true); // Force overwrite
    setToast({ message: 'Local changes saved to cloud', type: 'success' });
  };
  
  const handleKeepCloud = async () => {
    // Reload from cloud, discarding local changes
    setShowConflictModal(false);
    setConflictData(null);
    conflictCheckRef.current = false;
    await loadFromCloud();
    setToast({ message: 'Reloaded from cloud (local changes discarded)', type: 'info' });
  };
  
  const handleMergeSmart = async () => {
    // Smart merge: take newer data for each day/week
    setShowConflictModal(false);
    
    const mergedSales = { ...conflictData.cloudData?.sales, ...conflictData.localData?.sales };
    const mergedDailySales = { ...conflictData.cloudData?.dailySales, ...conflictData.localData?.dailySales };
    const mergedInvoices = [...(conflictData.cloudData?.invoices || []), ...(conflictData.localData?.invoices || [])].filter((v, i, a) => 
      a.findIndex(t => t.id === v.id) === i
    );
    
    const mergedData = {
      ...conflictData.cloudData,
      ...conflictData.localData,
      sales: mergedSales,
      dailySales: mergedDailySales,
      invoices: mergedInvoices,
    };
    
    // Apply merged data to state
    setAllWeeksData(mergedSales);
    setAllDaysData(mergedDailySales);
    if (mergedInvoices.length > 0) setInvoices(mergedInvoices);
    
    // Save merged data
    setConflictData(null);
    conflictCheckRef.current = false;
    await pushToCloudNow(mergedData, true);
    setToast({ message: 'Data merged successfully', type: 'success' });
  };
  
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-slate-900 rounded-2xl border border-amber-500/50 max-w-lg w-full shadow-2xl">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Sync Conflict Detected</h2>
              <p className="text-slate-400 text-sm">Data was modified on another device</p>
            </div>
          </div>
          
          {/* Conflict details */}
          <div className="bg-slate-800/50 rounded-xl p-4 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900/50 rounded-lg p-3 border border-blue-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <Cloud className="w-4 h-4 text-blue-400" />
                  <span className="text-blue-400 font-medium text-sm">Cloud Data</span>
                </div>
                <p className="text-slate-400 text-xs mb-1">Last updated:</p>
                <p className="text-white text-sm font-medium">{conflictData.cloudUpdatedAt}</p>
                <div className="mt-2 text-xs text-slate-500">
                  <p>{cloudDays} days • {cloudWeeks} weeks</p>
                  <p>{formatCurrency(cloudRevenue)} total revenue</p>
                </div>
              </div>
              
              <div className="bg-slate-900/50 rounded-lg p-3 border border-emerald-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400 font-medium text-sm">This Device</span>
                </div>
                <p className="text-slate-400 text-xs mb-1">Your changes:</p>
                <p className="text-white text-sm font-medium">{conflictData.localUpdatedAt}</p>
                <div className="mt-2 text-xs text-slate-500">
                  <p>{localDays} days • {localWeeks} weeks</p>
                  <p>{formatCurrency(localRevenue)} total revenue</p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={handleMergeSmart}
              className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-xl text-white font-semibold flex items-center justify-center gap-2"
            >
              <GitCompareArrows className="w-5 h-5" />
              Merge Both (Recommended)
            </button>
            
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleKeepLocal}
                className="py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-white font-medium flex items-center justify-center gap-2 text-sm"
              >
                <Smartphone className="w-4 h-4" />
                Keep This Device
              </button>
              <button
                onClick={handleKeepCloud}
                className="py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-white font-medium flex items-center justify-center gap-2 text-sm"
              >
                <Cloud className="w-4 h-4" />
                Keep Cloud
              </button>
            </div>
            
            <p className="text-center text-slate-500 text-xs mt-4">
              This happens when the same account is used on multiple devices simultaneously.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConflictResolutionModal;
