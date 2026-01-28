import React from 'react';
import { GitCompareArrows, X } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/format';

const ComparisonView = ({
  compareMode,
  setCompareMode,
  compareItems,
  setCompareItems,
  allWeeksData,
  weekNotes
}) => {
  if (!compareMode || compareItems.length < 2) return null;
  
  const items = compareItems.slice(0, 4).map(key => {
    const data = allWeeksData[key];
    if (!data) return null;
    return {
      key,
      label: key,
      revenue: data.total?.revenue || 0,
      profit: data.total?.netProfit || 0,
      units: data.total?.units || 0,
      margin: data.total?.revenue ? ((data.total?.netProfit || 0) / data.total.revenue * 100) : 0,
      amazonRev: data.amazon?.revenue || 0,
      shopifyRev: data.shopify?.revenue || 0,
      note: weekNotes[key] || '',
    };
  }).filter(Boolean);
  
  if (items.length < 2) return null;
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <GitCompareArrows className="w-6 h-6 text-violet-400" />
            Compare Weeks
          </h2>
          <button onClick={() => { setCompareMode(false); setCompareItems([]); }} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-slate-400 py-2 px-3">Metric</th>
                {items.map(item => (
                  <th key={item.key} className="text-right text-white py-2 px-3 font-semibold">{item.label}</th>
                ))}
                <th className="text-right text-slate-400 py-2 px-3">Difference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              <tr>
                <td className="py-3 px-3 text-slate-400">Revenue</td>
                {items.map(item => <td key={item.key} className="text-right py-3 px-3 text-white font-medium">{formatCurrency(item.revenue)}</td>)}
                <td className={`text-right py-3 px-3 font-medium ${items[1].revenue >= items[0].revenue ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {items[1].revenue >= items[0].revenue ? '+' : ''}{formatCurrency(items[1].revenue - items[0].revenue)}
                </td>
              </tr>
              <tr>
                <td className="py-3 px-3 text-slate-400">Profit</td>
                {items.map(item => <td key={item.key} className={`text-right py-3 px-3 font-medium ${item.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(item.profit)}</td>)}
                <td className={`text-right py-3 px-3 font-medium ${items[1].profit >= items[0].profit ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {items[1].profit >= items[0].profit ? '+' : ''}{formatCurrency(items[1].profit - items[0].profit)}
                </td>
              </tr>
              <tr>
                <td className="py-3 px-3 text-slate-400">Units</td>
                {items.map(item => <td key={item.key} className="text-right py-3 px-3 text-white">{formatNumber(item.units)}</td>)}
                <td className={`text-right py-3 px-3 font-medium ${items[1].units >= items[0].units ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {items[1].units >= items[0].units ? '+' : ''}{formatNumber(items[1].units - items[0].units)}
                </td>
              </tr>
              <tr>
                <td className="py-3 px-3 text-slate-400">Margin</td>
                {items.map(item => <td key={item.key} className="text-right py-3 px-3 text-white">{item.margin.toFixed(1)}%</td>)}
                <td className={`text-right py-3 px-3 font-medium ${items[1].margin >= items[0].margin ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {items[1].margin >= items[0].margin ? '+' : ''}{(items[1].margin - items[0].margin).toFixed(1)}%
                </td>
              </tr>
              <tr>
                <td className="py-3 px-3 text-slate-400">Amazon</td>
                {items.map(item => <td key={item.key} className="text-right py-3 px-3 text-orange-400">{formatCurrency(item.amazonRev)}</td>)}
                <td className={`text-right py-3 px-3 font-medium ${items[1].amazonRev >= items[0].amazonRev ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {items[1].amazonRev >= items[0].amazonRev ? '+' : ''}{formatCurrency(items[1].amazonRev - items[0].amazonRev)}
                </td>
              </tr>
              <tr>
                <td className="py-3 px-3 text-slate-400">Shopify</td>
                {items.map(item => <td key={item.key} className="text-right py-3 px-3 text-blue-400">{formatCurrency(item.shopifyRev)}</td>)}
                <td className={`text-right py-3 px-3 font-medium ${items[1].shopifyRev >= items[0].shopifyRev ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {items[1].shopifyRev >= items[0].shopifyRev ? '+' : ''}{formatCurrency(items[1].shopifyRev - items[0].shopifyRev)}
                </td>
              </tr>
              {items.some(i => i.note) && (
                <tr>
                  <td className="py-3 px-3 text-slate-400">Notes</td>
                  {items.map(item => <td key={item.key} className="text-right py-3 px-3 text-slate-300 text-sm max-w-[150px] truncate">{item.note || '—'}</td>)}
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        <div className="mt-4 pt-4 border-t border-slate-700 flex justify-between items-center">
          <p className="text-slate-500 text-sm">Select weeks from the dashboard to compare</p>
          <button onClick={() => { setCompareMode(false); setCompareItems([]); }}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-medium">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default ComparisonView;
