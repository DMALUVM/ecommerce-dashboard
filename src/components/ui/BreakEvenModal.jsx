import React from 'react';
import { Calculator, X } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/format';

const BreakEvenModal = ({ 
  showBreakEven, 
  setShowBreakEven, 
  breakEvenInputs, 
  setBreakEvenInputs, 
  calculateBreakEven 
}) => {
  if (!showBreakEven) return null;
  const result = calculateBreakEven(
    parseFloat(breakEvenInputs.adSpend) || 0,
    parseFloat(breakEvenInputs.cogs) || 0,
    parseFloat(breakEvenInputs.price) || 0,
    parseFloat(breakEvenInputs.conversionRate) || 2
  );
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Calculator className="w-6 h-6 text-amber-400" />
            Break-Even Calculator
          </h2>
          <button onClick={() => setShowBreakEven(false)} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Ad Spend ($)</label>
            <input type="number" id="be-adspend" defaultValue={breakEvenInputs.adSpend}
              onBlur={e => setBreakEvenInputs(p => ({...p, adSpend: e.target.value}))}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500" placeholder="500" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">COGS per Unit ($)</label>
            <input type="number" id="be-cogs" defaultValue={breakEvenInputs.cogs}
              onBlur={e => setBreakEvenInputs(p => ({...p, cogs: e.target.value}))}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500" placeholder="5" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Selling Price ($)</label>
            <input type="number" id="be-price" defaultValue={breakEvenInputs.price}
              onBlur={e => setBreakEvenInputs(p => ({...p, price: e.target.value}))}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500" placeholder="25" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Conversion Rate (%)</label>
            <input type="number" id="be-cvr" defaultValue={breakEvenInputs.conversionRate}
              onBlur={e => setBreakEvenInputs(p => ({...p, conversionRate: e.target.value}))}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500" placeholder="2" />
          </div>
          <button onClick={() => {
            const adSpend = document.getElementById('be-adspend')?.value || '';
            const cogs = document.getElementById('be-cogs')?.value || '';
            const price = document.getElementById('be-price')?.value || '';
            const conversionRate = document.getElementById('be-cvr')?.value || '';
            setBreakEvenInputs({ adSpend, cogs, price, conversionRate });
          }} className="w-full py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-white font-semibold">
            Calculate
          </button>
        </div>
        
        {result && parseFloat(breakEvenInputs.price) > parseFloat(breakEvenInputs.cogs) ? (
          <div className="bg-slate-900/50 rounded-xl p-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-400">Profit per Unit</span>
              <span className="text-emerald-400 font-bold">{formatCurrency(result.profitPerUnit)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Units to Break Even</span>
              <span className="text-white font-bold">{result.unitsToBreakEven}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Clicks Needed (at {breakEvenInputs.conversionRate}% CVR)</span>
              <span className="text-white font-bold">{formatNumber(result.clicksNeeded)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Revenue at Break-Even</span>
              <span className="text-white font-bold">{formatCurrency(result.revenueAtBreakEven)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">ROAS at Break-Even</span>
              <span className="text-amber-400 font-bold">{result.roasAtBreakEven.toFixed(2)}x</span>
            </div>
          </div>
        ) : parseFloat(breakEvenInputs.price) <= parseFloat(breakEvenInputs.cogs) && breakEvenInputs.price ? (
          <div className="bg-rose-900/30 border border-rose-500/50 rounded-xl p-4 text-center">
            <p className="text-rose-400">Price must be greater than COGS to make profit</p>
          </div>
        ) : (
          <div className="bg-slate-900/50 rounded-xl p-4 text-center text-slate-500">
            Enter values above to calculate break-even point
          </div>
        )}
      </div>
    </div>
  );
};

export default BreakEvenModal;
