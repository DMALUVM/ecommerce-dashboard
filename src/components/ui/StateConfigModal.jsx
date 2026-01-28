import React from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../../utils/format';

const StateConfigModal = ({
  showTaxStateConfig,
  setShowTaxStateConfig,
  taxConfigState,
  setTaxConfigState,
  US_STATES_TAX_INFO,
  STATE_FILING_FORMATS,
  nexusStates,
  toggleNexus,
  updateStateConfig,
  taxFormRegistrationId,
  setTaxFormRegistrationId,
  taxFormNotes,
  setTaxFormNotes,
  newCustomFiling,
  setNewCustomFiling,
  addCustomFiling,
  removeCustomFiling,
  toggleHideState,
  hiddenStates
}) => {
  if (!showTaxStateConfig || !taxConfigState) return null;
  const stateInfo = US_STATES_TAX_INFO[taxConfigState];
  const config = (nexusStates || {})[taxConfigState] || { hasNexus: false, frequency: 'monthly', registrationId: '', customFilings: [], notes: '' };
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-2xl w-full my-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-white">{stateInfo?.name || taxConfigState}</h2>
            <p className="text-slate-400 text-sm">Configure sales tax settings</p>
          </div>
          <button onClick={() => { setShowTaxStateConfig(false); setTaxConfigState(null); }} className="p-2 hover:bg-slate-700 rounded-lg"><Trash2 className="w-5 h-5 text-slate-400" /></button>
        </div>
        
        {/* Basic Info */}
        <div className="space-y-4 mb-6">
          <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl">
            <span className="text-white">Nexus Established</span>
            <button onClick={() => toggleNexus(taxConfigState)} className={`w-12 h-6 rounded-full transition-all ${config.hasNexus ? 'bg-emerald-500' : 'bg-slate-600'}`}>
              <div className={`w-5 h-5 bg-white rounded-full transition-transform ${config.hasNexus ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
          
          <div>
            <label className="block text-sm text-slate-400 mb-2">Filing Frequency</label>
            <select value={config.frequency || 'monthly'} onChange={(e) => updateStateConfig(taxConfigState, 'frequency', e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white">
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="semi-annual">Semi-Annual</option>
              <option value="annual">Annual</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm text-slate-400 mb-2">State Registration / Account ID</label>
            <input type="text" value={taxFormRegistrationId} onChange={(e) => setTaxFormRegistrationId(e.target.value)} onBlur={(e) => updateStateConfig(taxConfigState, 'registrationId', e.target.value)} placeholder="e.g., 12-345678-9" className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white" />
          </div>
          
          <div>
            <label className="block text-sm text-slate-400 mb-2">Tax Portal URL</label>
            <div className="flex gap-2">
              <input 
                type="url" 
                defaultValue={config.portalUrl || STATE_FILING_FORMATS[taxConfigState]?.website || ''} 
                onBlur={(e) => updateStateConfig(taxConfigState, 'portalUrl', e.target.value)} 
                placeholder="https://state-tax-portal.gov..." 
                className="flex-1 bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white" 
              />
              {(config.portalUrl || STATE_FILING_FORMATS[taxConfigState]?.website) && (
                <button
                  onClick={() => window.open(config.portalUrl || STATE_FILING_FORMATS[taxConfigState]?.website, '_blank')}
                  className="px-4 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-medium"
                >
                  🔗 Open
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">Add your custom login URL or use the default state portal</p>
          </div>
          
          <div>
            <label className="block text-sm text-slate-400 mb-2">Notes</label>
            <textarea value={taxFormNotes} onChange={(e) => setTaxFormNotes(e.target.value)} onBlur={(e) => updateStateConfig(taxConfigState, 'notes', e.target.value)} placeholder="Any notes about this state's requirements..." rows={2} className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white" />
          </div>
        </div>
        
        {/* State Info */}
        {stateInfo && (
          <div className="bg-slate-900/50 rounded-xl p-4 mb-6">
            <h4 className="text-sm font-semibold text-slate-300 mb-3">State Tax Information</h4>
            <div className="grid grid-cols-2 gap-3 text-sm mb-3">
              <div className="bg-slate-800/50 rounded-lg p-2">
                <span className="text-slate-500 text-xs">Base State Rate</span>
                <p className="text-white font-semibold">{(stateInfo.stateRate * 100).toFixed(2)}%</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-2">
                <span className="text-slate-500 text-xs">Filing Types</span>
                <p className="text-white font-semibold capitalize">{stateInfo.filingTypes?.join(', ') || 'N/A'}</p>
              </div>
            </div>
            
            {/* Economic Nexus Thresholds */}
            {stateInfo.nexusThreshold && (
              <div className="bg-violet-900/20 border border-violet-500/30 rounded-lg p-3 mb-3">
                <h5 className="text-violet-400 text-xs font-semibold mb-2">Economic Nexus Threshold</h5>
                <div className="flex gap-4 text-sm">
                  {stateInfo.nexusThreshold.sales && (
                    <div>
                      <span className="text-slate-400">Sales:</span>
                      <span className="text-white ml-1 font-semibold">{formatCurrency(stateInfo.nexusThreshold.sales)}</span>
                    </div>
                  )}
                  {stateInfo.nexusThreshold.transactions && (
                    <div>
                      <span className="text-slate-400">Transactions:</span>
                      <span className="text-white ml-1 font-semibold">{stateInfo.nexusThreshold.transactions}+</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Features */}
            <div className="flex flex-wrap gap-2 mb-2">
              {stateInfo.marketplaceFacilitator && (
                <span className="px-2 py-1 bg-emerald-900/30 border border-emerald-500/30 rounded text-xs text-emerald-400">Marketplace Facilitator Law</span>
              )}
              {stateInfo.sst && (
                <span className="px-2 py-1 bg-blue-900/30 border border-blue-500/30 rounded text-xs text-blue-400">SST Member</span>
              )}
            </div>
            
            {stateInfo.note && (
              <div className="flex items-start gap-2 text-amber-400 text-xs mt-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{stateInfo.note}</span>
              </div>
            )}
          </div>
        )}
        
        {/* Custom Filings */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-slate-300 mb-3">Additional Filings (LLC Fees, Annual Reports, etc.)</h4>
          
          {config.customFilings?.length > 0 && (
            <div className="space-y-2 mb-4">
              {config.customFilings.map((f, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                  <div>
                    <span className="text-white">{f.name}</span>
                    <span className="text-slate-500 text-sm ml-2">({f.frequency}, due {f.dueMonth}/{f.dueDay})</span>
                    {f.amount && <span className="text-emerald-400 text-sm ml-2">{formatCurrency(parseFloat(f.amount))}</span>}
                  </div>
                  <button onClick={() => removeCustomFiling(taxConfigState, i)} className="text-rose-400 hover:text-rose-300"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input type="text" value={newCustomFiling.name} onChange={(e) => setNewCustomFiling(p => ({ ...p, name: e.target.value }))} placeholder="Filing name (e.g., LLC Annual Fee)" className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
            <select value={newCustomFiling.frequency} onChange={(e) => setNewCustomFiling(p => ({ ...p, frequency: e.target.value }))} className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm">
              <option value="annual">Annual</option>
              <option value="quarterly">Quarterly</option>
              <option value="monthly">Monthly</option>
            </select>
            <div className="flex gap-2">
              <input type="number" value={newCustomFiling.dueMonth} onChange={(e) => setNewCustomFiling(p => ({ ...p, dueMonth: e.target.value }))} placeholder="Month" min="1" max="12" className="w-1/2 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
              <input type="number" value={newCustomFiling.dueDay} onChange={(e) => setNewCustomFiling(p => ({ ...p, dueDay: e.target.value }))} placeholder="Day" min="1" max="31" className="w-1/2 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <input type="number" value={newCustomFiling.amount} onChange={(e) => setNewCustomFiling(p => ({ ...p, amount: e.target.value }))} placeholder="Amount ($)" className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <button onClick={() => { if (newCustomFiling.name) { addCustomFiling(taxConfigState, newCustomFiling); setNewCustomFiling({ name: '', frequency: 'annual', dueMonth: 0, dueDay: 15, amount: '' }); }}} disabled={!newCustomFiling.name} className="w-full py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg text-sm text-white">Add Filing</button>
        </div>
        
        <div className="flex gap-3">
          <button onClick={() => toggleHideState(taxConfigState)} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white">{hiddenStates.includes(taxConfigState) ? 'Unhide State' : 'Hide State'}</button>
          <button onClick={() => { setShowTaxStateConfig(false); setTaxConfigState(null); }} className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm text-white font-semibold">Done</button>
        </div>
      </div>
    </div>
  );
};

export default StateConfigModal;
