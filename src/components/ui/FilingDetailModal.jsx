import React from 'react';
import { Check, Upload } from 'lucide-react';
import { formatCurrency } from '../../utils/format';

const FilingDetailModal = ({
  selectedTaxState,
  setSelectedTaxState,
  US_STATES_TAX_INFO,
  nexusStates,
  getNextDueDate,
  taxReportFileName,
  setTaxReportFileName,
  handleTaxReportUpload,
  parsedTaxReport,
  setParsedTaxReport,
  taxFilingConfirmNum,
  setTaxFilingConfirmNum,
  taxFilingPaidAmount,
  setTaxFilingPaidAmount,
  taxFilingNotes,
  setTaxFilingNotes,
  markFilingComplete
}) => {
  if (!selectedTaxState) return null;
  const stateInfo = US_STATES_TAX_INFO[selectedTaxState];
  const config = (nexusStates || {})[selectedTaxState] || {};
  const nextDue = getNextDueDate(config.frequency || 'monthly', selectedTaxState);
  const periodKey = config.frequency === 'monthly' 
    ? `${nextDue.getFullYear()}-${String(nextDue.getMonth()).padStart(2, '0')}`
    : config.frequency === 'quarterly'
    ? `${nextDue.getFullYear()}-Q${Math.ceil((nextDue.getMonth() + 1) / 3)}`
    : `${nextDue.getFullYear()}`;
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-4xl w-full my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-white">{stateInfo?.name} - Sales Tax Filing</h2>
            <p className="text-slate-400 text-sm">Due: {nextDue.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          </div>
          <button onClick={() => { setSelectedTaxState(null); setParsedTaxReport(null); setTaxReportFileName(''); }} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400">✕</button>
        </div>
        
        {/* Upload Tax Report */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Upload Shopify Tax Report</h3>
          <div className={`relative border-2 border-dashed rounded-xl p-6 ${taxReportFileName ? 'border-emerald-500/50 bg-emerald-950/20' : 'border-slate-600 hover:border-slate-500 bg-slate-800/30'}`}>
            <input type="file" accept=".csv" onChange={(e) => handleTaxReportUpload(e.target.files[0], selectedTaxState)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            <div className="text-center">
              {taxReportFileName ? (
                <><Check className="w-8 h-8 text-emerald-400 mx-auto mb-2" /><p className="text-emerald-400">{taxReportFileName}</p></>
              ) : (
                <><Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" /><p className="text-slate-400">Drop Shopify tax report CSV or click to upload</p><p className="text-slate-500 text-xs mt-1">Analytics → Reports → Taxes → Export by jurisdiction</p></>
              )}
            </div>
          </div>
        </div>
        
        {/* Parsed Report */}
        {parsedTaxReport && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Tax Report Summary</h3>
            
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-slate-900/50 rounded-xl p-4">
                <p className="text-slate-400 text-xs">Total Sales</p>
                <p className="text-xl font-bold text-white">{formatCurrency(parsedTaxReport.totalSales)}</p>
              </div>
              <div className="bg-slate-900/50 rounded-xl p-4">
                <p className="text-slate-400 text-xs">Taxable Sales</p>
                <p className="text-xl font-bold text-emerald-400">{formatCurrency(parsedTaxReport.totalTaxableSales)}</p>
              </div>
              <div className="bg-slate-900/50 rounded-xl p-4">
                <p className="text-slate-400 text-xs">Exempt Sales</p>
                <p className="text-xl font-bold text-slate-300">{formatCurrency(parsedTaxReport.totalExemptSales)}</p>
              </div>
              <div className="bg-rose-900/30 border border-rose-500/30 rounded-xl p-4">
                <p className="text-rose-400 text-xs">Tax Collected</p>
                <p className="text-xl font-bold text-white">{formatCurrency(parsedTaxReport.totalTaxCollected)}</p>
              </div>
            </div>
            
            {/* Tax Breakdown by Type */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-violet-900/20 border border-violet-500/30 rounded-lg p-3">
                <p className="text-violet-400 text-xs">State Tax</p>
                <p className="text-lg font-semibold text-white">{formatCurrency(parsedTaxReport.stateTax)}</p>
              </div>
              <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
                <p className="text-blue-400 text-xs">County Tax</p>
                <p className="text-lg font-semibold text-white">{formatCurrency(parsedTaxReport.countyTax)}</p>
              </div>
              <div className="bg-teal-900/20 border border-teal-500/30 rounded-lg p-3">
                <p className="text-teal-400 text-xs">City Tax</p>
                <p className="text-lg font-semibold text-white">{formatCurrency(parsedTaxReport.cityTax)}</p>
              </div>
              <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3">
                <p className="text-amber-400 text-xs">Special Tax</p>
                <p className="text-lg font-semibold text-white">{formatCurrency(parsedTaxReport.specialTax)}</p>
              </div>
            </div>
            
            {/* Jurisdiction Details */}
            <div className="bg-slate-900/50 rounded-xl overflow-hidden">
              <div className="p-3 border-b border-slate-700">
                <h4 className="text-sm font-semibold text-slate-300">Jurisdiction Breakdown</h4>
              </div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800 sticky top-0">
                    <tr>
                      <th className="text-left p-2 text-slate-400">Jurisdiction</th>
                      <th className="text-left p-2 text-slate-400">Type</th>
                      <th className="text-right p-2 text-slate-400">Rate</th>
                      <th className="text-right p-2 text-slate-400">Taxable</th>
                      <th className="text-right p-2 text-slate-400">Tax Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedTaxReport.jurisdictions.map((j, i) => (
                      <tr key={i} className="border-b border-slate-700/50">
                        <td className="p-2 text-white">{j.name}{j.county && <span className="text-slate-500 text-xs ml-1">({j.county})</span>}</td>
                        <td className="p-2 capitalize text-slate-400">{j.type}</td>
                        <td className="p-2 text-right text-slate-300">{(j.rate * 100).toFixed(3)}%</td>
                        <td className="p-2 text-right text-slate-300">{formatCurrency(j.taxableSales)}</td>
                        <td className="p-2 text-right font-semibold text-emerald-400">{formatCurrency(j.taxAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        
        {/* Filing Confirmation */}
        <div className="border-t border-slate-700 pt-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Mark as Filed</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Confirmation Number</label>
              <input type="text" value={taxFilingConfirmNum} onChange={(e) => setTaxFilingConfirmNum(e.target.value)} placeholder="State confirmation #" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Amount Paid</label>
              <input type="number" value={taxFilingPaidAmount} onChange={(e) => setTaxFilingPaidAmount(e.target.value)} placeholder={parsedTaxReport ? parsedTaxReport.totalTaxCollected.toFixed(2) : '0.00'} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Notes</label>
              <input type="text" value={taxFilingNotes} onChange={(e) => setTaxFilingNotes(e.target.value)} placeholder="Any notes..." className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
          </div>
          <button 
            onClick={() => markFilingComplete(selectedTaxState, periodKey, { 
              confirmationNum: taxFilingConfirmNum, 
              amount: parseFloat(taxFilingPaidAmount) || parsedTaxReport?.totalTaxCollected || 0,
              notes: taxFilingNotes,
              reportData: parsedTaxReport 
            })}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-semibold text-white"
          >
            <Check className="w-5 h-5 inline mr-2" />Mark as Filed & Paid
          </button>
        </div>
      </div>
    </div>
  );
};

export default FilingDetailModal;
