import React from 'react';
import { X } from 'lucide-react';

const SkuSettingsModal = ({
  showSkuSettings,
  setShowSkuSettings,
  skuSettingsEditItem,
  setSkuSettingsEditItem,
  skuSettingsEditForm,
  setSkuSettingsEditForm,
  skuSettingsSearch,
  setSkuSettingsSearch,
  leadTimeSettings,
  setLeadTimeSettings,
  invShowZeroStock,
  setInvShowZeroStock,
  skuSettingsFilteredSkus,
  getSkuSettings,
  saveSkuSettingsHandler,
  formatNumber
}) => {
  if (!showSkuSettings) return null;

  const handleClose = () => {
    setShowSkuSettings(false);
    setSkuSettingsEditItem(null);
    setSkuSettingsEditForm({});
    setSkuSettingsSearch('');
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-white text-xl font-bold">⚙️ SKU Inventory Settings</h2>
            <p className="text-white/70 text-sm">Configure lead times, reorder points, and alerts per SKU</p>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-white/20 rounded-lg text-white">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        {/* Global Defaults */}
        <div className="p-4 bg-slate-800/50 border-b border-slate-700">
          <h3 className="text-white font-semibold mb-3">🌐 Global Defaults</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <label className="text-slate-400 text-xs block mb-1">Default Lead Time</label>
              <div className="flex items-center gap-2">
                <input type="number" value={leadTimeSettings.defaultLeadTimeDays} onChange={(e) => setLeadTimeSettings(prev => ({ ...prev, defaultLeadTimeDays: parseInt(e.target.value) || 14 }))} className="w-20 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
                <span className="text-slate-500 text-xs">days</span>
              </div>
            </div>
            <div>
              <label className="text-slate-400 text-xs block mb-1">Reorder Trigger</label>
              <div className="flex items-center gap-2">
                <input type="number" value={leadTimeSettings.reorderTriggerDays} onChange={(e) => setLeadTimeSettings(prev => ({ ...prev, reorderTriggerDays: parseInt(e.target.value) || 60 }))} className="w-20 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
                <span className="text-slate-500 text-xs">days</span>
              </div>
            </div>
            <div>
              <label className="text-slate-400 text-xs block mb-1">Amazon Min Supply</label>
              <div className="flex items-center gap-2">
                <input type="number" value={leadTimeSettings.channelRules?.amazon?.minDaysOfSupply || 60} onChange={(e) => setLeadTimeSettings(prev => ({ ...prev, channelRules: { ...prev.channelRules, amazon: { ...prev.channelRules?.amazon, minDaysOfSupply: parseInt(e.target.value) || 60 }}}))} className="w-20 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
                <span className="text-slate-500 text-xs">days</span>
              </div>
            </div>
            <div>
              <label className="text-slate-400 text-xs block mb-1">3PL Default Alert</label>
              <div className="flex items-center gap-2">
                <input type="number" value={leadTimeSettings.channelRules?.threepl?.defaultQtyThreshold || 50} onChange={(e) => setLeadTimeSettings(prev => ({ ...prev, channelRules: { ...prev.channelRules, threepl: { ...prev.channelRules?.threepl, defaultQtyThreshold: parseInt(e.target.value) || 50 }}}))} className="w-20 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
                <span className="text-slate-500 text-xs">units</span>
              </div>
            </div>
            <div>
              <label className="text-slate-400 text-xs block mb-1">Reorder Buffer</label>
              <div className="flex items-center gap-2">
                <input type="number" value={leadTimeSettings.reorderBuffer || 7} onChange={(e) => setLeadTimeSettings(prev => ({ ...prev, reorderBuffer: parseInt(e.target.value) || 7 }))} className="w-20 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
                <span className="text-slate-500 text-xs">days</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Search and Filter */}
        <div className="p-4 border-b border-slate-700 flex gap-4 items-center">
          <input type="text" placeholder="🔍 Search SKUs..." value={skuSettingsSearch} onChange={(e) => setSkuSettingsSearch(e.target.value)} className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white" />
          <label className="flex items-center gap-2 text-sm text-slate-400 whitespace-nowrap">
            <input type="checkbox" checked={invShowZeroStock} onChange={(e) => setInvShowZeroStock(e.target.checked)} className="rounded bg-slate-700 border-slate-600" />
            Show zero stock
          </label>
        </div>
        
        {/* SKU List */}
        <div className="flex-1 overflow-y-auto p-4">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-900 z-10">
              <tr className="border-b border-slate-700">
                <th className="text-left text-slate-400 py-2 px-2" style={{width: '200px'}}>SKU / Product</th>
                <th className="text-right text-slate-400 py-2 px-2" style={{width: '80px'}}>Amazon</th>
                <th className="text-right text-slate-400 py-2 px-2" style={{width: '80px'}}>3PL</th>
                <th className="text-center text-slate-400 py-2 px-2" style={{width: '100px'}}>Lead Time</th>
                <th className="text-center text-slate-400 py-2 px-2" style={{width: '100px'}}>Reorder Qty</th>
                <th className="text-center text-slate-400 py-2 px-2" style={{width: '100px'}}>3PL Alert</th>
                <th className="text-center text-slate-400 py-2 px-2" style={{width: '100px'}}>AMZ Alert</th>
                <th className="text-center text-slate-400 py-2 px-2" style={{width: '100px'}}>Target Days</th>
                <th className="text-center text-slate-400 py-2 px-2" style={{width: '120px'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {skuSettingsFilteredSkus.map(item => {
                const settings = getSkuSettings(item.sku);
                const isEditing = skuSettingsEditItem === item.sku;
                const hasCustomSettings = settings.leadTime || settings.reorderPoint || settings.threeplAlertQty || settings.amazonAlertDays || settings.targetDays;
                
                if (isEditing) {
                  return (
                    <tr key={item.sku} className="border-b border-slate-700/50 bg-emerald-900/20">
                      <td className="py-3 px-2">
                        <p className="text-white font-medium">{item.sku}</p>
                        <p className="text-slate-500 text-xs truncate max-w-[180px]">{item.name}</p>
                      </td>
                      <td className="text-right py-3 px-2 text-orange-400 font-medium">{formatNumber(item.amazonQty || 0)}</td>
                      <td className="text-right py-3 px-2 text-violet-400 font-medium">{formatNumber(item.threeplQty || 0)}</td>
                      <td className="py-3 px-2 text-center">
                        <input type="number" value={skuSettingsEditForm.leadTime || ''} onChange={(e) => setSkuSettingsEditForm(f => ({...f, leadTime: e.target.value}))} placeholder={String(leadTimeSettings.defaultLeadTimeDays)} className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-center text-sm" />
                      </td>
                      <td className="py-3 px-2 text-center">
                        <input type="number" value={skuSettingsEditForm.reorderPoint || ''} onChange={(e) => setSkuSettingsEditForm(f => ({...f, reorderPoint: e.target.value}))} placeholder="—" className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-center text-sm" />
                      </td>
                      <td className="py-3 px-2 text-center">
                        <input type="number" value={skuSettingsEditForm.threeplAlertQty || ''} onChange={(e) => setSkuSettingsEditForm(f => ({...f, threeplAlertQty: e.target.value}))} placeholder="50" className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-center text-sm" />
                      </td>
                      <td className="py-3 px-2 text-center">
                        <input type="number" value={skuSettingsEditForm.amazonAlertDays || ''} onChange={(e) => setSkuSettingsEditForm(f => ({...f, amazonAlertDays: e.target.value}))} placeholder="60" className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-center text-sm" />
                      </td>
                      <td className="py-3 px-2 text-center">
                        <input type="number" value={skuSettingsEditForm.targetDays || ''} onChange={(e) => setSkuSettingsEditForm(f => ({...f, targetDays: e.target.value}))} placeholder="90" className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-center text-sm" />
                      </td>
                      <td className="py-3 px-2 text-center whitespace-nowrap">
                        <button onClick={() => saveSkuSettingsHandler(item.sku, { leadTime: skuSettingsEditForm.leadTime ? parseInt(skuSettingsEditForm.leadTime) : undefined, reorderPoint: skuSettingsEditForm.reorderPoint ? parseInt(skuSettingsEditForm.reorderPoint) : undefined, threeplAlertQty: skuSettingsEditForm.threeplAlertQty ? parseInt(skuSettingsEditForm.threeplAlertQty) : undefined, amazonAlertDays: skuSettingsEditForm.amazonAlertDays ? parseInt(skuSettingsEditForm.amazonAlertDays) : undefined, targetDays: skuSettingsEditForm.targetDays ? parseInt(skuSettingsEditForm.targetDays) : undefined, alertEnabled: true })} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-white text-xs mr-2">Save</button>
                        <button onClick={() => { setSkuSettingsEditItem(null); setSkuSettingsEditForm({}); }} className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 rounded text-white text-xs">Cancel</button>
                      </td>
                    </tr>
                  );
                }
                
                return (
                  <tr key={item.sku} className={`border-b border-slate-700/50 hover:bg-slate-800/30 ${hasCustomSettings ? 'bg-emerald-900/10' : ''}`}>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        {hasCustomSettings && <span className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0" title="Custom settings" />}
                        <div>
                          <p className="text-white font-medium">{item.sku}</p>
                          <p className="text-slate-500 text-xs truncate max-w-[160px]">{item.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-right py-2 px-2 text-orange-400">{formatNumber(item.amazonQty || 0)}</td>
                    <td className="text-right py-2 px-2 text-violet-400">{formatNumber(item.threeplQty || 0)}</td>
                    <td className="text-center py-2 px-2">{settings.leadTime ? <span className="text-emerald-400">{settings.leadTime}d</span> : <span className="text-slate-500">{leadTimeSettings.defaultLeadTimeDays}d</span>}</td>
                    <td className="text-center py-2 px-2">{settings.reorderPoint ? <span className="text-emerald-400">{formatNumber(settings.reorderPoint)}</span> : <span className="text-slate-500">—</span>}</td>
                    <td className="text-center py-2 px-2">{settings.threeplAlertQty ? <span className="text-amber-400">{formatNumber(settings.threeplAlertQty)}</span> : <span className="text-slate-500">—</span>}</td>
                    <td className="text-center py-2 px-2">{settings.amazonAlertDays ? <span className="text-amber-400">{settings.amazonAlertDays}d</span> : <span className="text-slate-500">—</span>}</td>
                    <td className="text-center py-2 px-2">{settings.targetDays ? <span className="text-cyan-400">{settings.targetDays}d</span> : <span className="text-slate-500">90d</span>}</td>
                    <td className="py-2 px-2 text-center">
                      <button onClick={() => { setSkuSettingsEditItem(item.sku); setSkuSettingsEditForm(settings); }} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 text-xs">Edit</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {skuSettingsFilteredSkus.length === 0 && (
            <div className="text-center py-8 text-slate-400">No SKUs found matching your search</div>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-slate-700 bg-slate-800/50 flex items-center justify-between">
          <div className="text-slate-400 text-sm">
            <span className="text-white font-medium">{Object.keys(leadTimeSettings.skuSettings || {}).length}</span> SKUs with custom settings
          </div>
          <button onClick={handleClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white">Close</button>
        </div>
      </div>
    </div>
  );
};

export default SkuSettingsModal;
