import React, { useState, useMemo } from 'react';
import { ChevronRight, Truck } from 'lucide-react';
import { formatCurrency, formatNumber, formatPercent } from '../../utils/format';
import { withShippingSkuRow } from '../../utils/reconcile';

const ChannelCard = ({ title, color, data, isAmz, showSkuTable = false }) => {
  const [expanded, setExpanded] = useState(false);
  const [show3plBreakdown, setShow3plBreakdown] = useState(false);
  const [skuSort, setSkuSort] = useState({ field: 'netSales', dir: 'desc' });
  const skuDataRaw = data.skuData || [];
  const threeplBreakdown = data.threeplBreakdown || {};
  const has3plData = !isAmz && (data.threeplCosts > 0);
  const has3plBreakdown = has3plData && Object.values(threeplBreakdown).some(v => v > 0);
  
  // Add calculated fields and sort
  const skuDataRawFixed = useMemo(() => {
    if (isAmz) return skuDataRaw || [];
    return withShippingSkuRow((skuDataRaw || []), data.shippingCollected || 0);
  }, [isAmz, skuDataRaw, data.shippingCollected]);

  const skuData = useMemo(() => {
    const withCalcs = skuDataRawFixed.map(item => {
      const profit = isAmz 
        ? (item.netProceeds || 0)
        : (item.netSales || 0) - (item.cogs || 0);
      const proceedsPerUnit = item.unitsSold > 0
        ? (isAmz
            ? (item.netProceedsPerUnit !== null && item.netProceedsPerUnit !== undefined
                ? item.netProceedsPerUnit
                : (item.netProceeds || 0) / item.unitsSold)
            : profit / item.unitsSold)
        : 0;
      return { ...item, profit, proceedsPerUnit };
    });
    return withCalcs.sort((a, b) => {
      const aVal = a[skuSort.field] || 0;
      const bVal = b[skuSort.field] || 0;
      return skuSort.dir === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [skuDataRawFixed, skuSort, isAmz]);
  
  const handleSort = (field) => {
    setSkuSort(prev => ({ field, dir: prev.field === field && prev.dir === 'desc' ? 'asc' : 'desc' }));
  };
  
  const SortHeader = ({ field, label, align = 'right' }) => (
    <th 
      onClick={() => handleSort(field)}
      className={`text-${align} text-xs font-medium text-slate-400 uppercase px-2 py-2 cursor-pointer hover:text-white transition-all ${skuSort.field === field ? 'text-violet-400' : ''}`}
    >
      {label} {skuSort.field === field && (skuSort.dir === 'desc' ? '↓' : '↑')}
    </th>
  );
  
  return (
    <div className="bg-slate-800/50 rounded-2xl border border-slate-700 overflow-hidden">
      <div className={`border-l-4 ${color === 'orange' ? 'border-orange-500' : 'border-blue-500'} p-5`}>
        <h3 className={`text-lg font-bold ${color === 'orange' ? 'text-orange-400' : 'text-blue-400'} mb-4`}>{title}</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div><p className="text-slate-500 text-xs uppercase mb-1">Revenue</p><p className="text-xl font-bold text-white">{formatCurrency(data.revenue)}</p></div>
          <div><p className="text-slate-500 text-xs uppercase mb-1">Units</p><p className="text-xl font-bold text-white">{formatNumber(data.units)}</p></div>
          <div><p className="text-slate-500 text-xs uppercase mb-1">Net Profit</p><p className={`text-xl font-bold ${data.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(data.netProfit)}</p></div>
          <div><p className="text-slate-500 text-xs uppercase mb-1">Margin</p><p className={`text-xl font-bold ${(isAmz ? data.margin : data.netMargin) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatPercent(isAmz ? data.margin : data.netMargin)}</p></div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div><p className="text-slate-500 text-xs uppercase mb-1">COGS</p><p className="text-lg font-semibold text-white">{formatCurrency(data.cogs)}</p></div>
          <div>
            <p className="text-slate-500 text-xs uppercase mb-1">{isAmz ? 'Fees' : '3PL Costs'}</p>
            <p className="text-lg font-semibold text-white">{formatCurrency(isAmz ? data.fees : data.threeplCosts)}</p>
            {has3plData && <button onClick={() => setShow3plBreakdown(!show3plBreakdown)} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"><Truck className="w-3 h-3" />{show3plBreakdown ? 'Hide Details' : 'View Details'}</button>}
            {!isAmz && data.threeplMetrics?.isProrated && <span className="text-xs text-amber-400">~estimated</span>}
          </div>
          <div><p className="text-slate-500 text-xs uppercase mb-1">Ad Spend</p><p className="text-lg font-semibold text-white">{formatCurrency(data.adSpend)}</p></div>
          <div><p className="text-slate-500 text-xs uppercase mb-1">TACOS</p><p className="text-lg font-semibold text-white">{(data.roas || 0).toFixed(2)}x</p></div>
        </div>
        {/* 3PL Breakdown */}
        {show3plBreakdown && has3plData && (
          <div className="bg-slate-900/50 rounded-xl p-4 mb-4">
            <h4 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2"><Truck className="w-4 h-4 text-blue-400" />3PL Cost Breakdown</h4>
            {has3plBreakdown ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                  {threeplBreakdown.shipping > 0 && <div className="flex justify-between"><span className="text-slate-400 text-sm">Shipping</span><span className="text-white text-sm">{formatCurrency(threeplBreakdown.shipping)}</span></div>}
                  {threeplBreakdown.pickFees > 0 && <div className="flex justify-between"><span className="text-slate-400 text-sm">Pick Fees</span><span className="text-white text-sm">{formatCurrency(threeplBreakdown.pickFees)}</span></div>}
                  {threeplBreakdown.storage > 0 && <div className="flex justify-between"><span className="text-slate-400 text-sm">Storage</span><span className="text-white text-sm">{formatCurrency(threeplBreakdown.storage)}</span></div>}
                  {threeplBreakdown.boxCharges > 0 && <div className="flex justify-between"><span className="text-slate-400 text-sm">Box/Mailer</span><span className="text-white text-sm">{formatCurrency(threeplBreakdown.boxCharges)}</span></div>}
                  {threeplBreakdown.receiving > 0 && <div className="flex justify-between"><span className="text-slate-400 text-sm">Receiving</span><span className="text-white text-sm">{formatCurrency(threeplBreakdown.receiving)}</span></div>}
                  {threeplBreakdown.other > 0 && <div className="flex justify-between"><span className="text-slate-400 text-sm">Other</span><span className="text-white text-sm">{formatCurrency(threeplBreakdown.other)}</span></div>}
                </div>
                {/* Enhanced 3PL Metrics */}
                {data.threeplMetrics && data.threeplMetrics.orderCount > 0 ? (
                  <div className="border-t border-slate-700 pt-3 mt-3">
                    <h5 className="text-xs font-semibold text-cyan-400 uppercase mb-2">📦 Order Metrics</h5>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-slate-800/50 rounded-lg p-2">
                        <p className="text-slate-500 text-xs">Orders</p>
                        <p className="text-white font-semibold">{formatNumber(data.threeplMetrics.orderCount)}</p>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-2">
                        <p className="text-slate-500 text-xs">Units Picked</p>
                        <p className="text-white font-semibold">{formatNumber(data.threeplMetrics.totalUnits)}</p>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-2">
                        <p className="text-slate-500 text-xs">Avg Units/Order</p>
                        <p className="text-white font-semibold">{data.threeplMetrics.avgUnitsPerOrder.toFixed(1)}</p>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-2">
                        <p className="text-slate-500 text-xs">Avg Ship Cost</p>
                        <p className="text-white font-semibold">{formatCurrency(data.threeplMetrics.avgShippingCost)}</p>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-2">
                        <p className="text-slate-500 text-xs">Avg Pick Cost</p>
                        <p className="text-white font-semibold">{formatCurrency(data.threeplMetrics.avgPickCost)}</p>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-2">
                        <p className="text-slate-500 text-xs">Avg Packaging</p>
                        <p className="text-white font-semibold">{formatCurrency(data.threeplMetrics.avgPackagingCost)}</p>
                      </div>
                      <div className="bg-cyan-900/30 rounded-lg p-2 border border-cyan-500/30">
                        <p className="text-cyan-400 text-xs font-medium">Avg Cost/Order</p>
                        <p className="text-cyan-300 font-bold">{formatCurrency(data.threeplMetrics.avgCostPerOrder)}</p>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-2">
                        <p className="text-slate-500 text-xs">Storage</p>
                        <p className="text-white font-semibold">{formatCurrency(threeplBreakdown.storage)}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-slate-700 pt-3 mt-3">
                    <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3">
                      <p className="text-amber-400 text-sm font-medium">📊 Order metrics not available</p>
                      <p className="text-slate-400 text-xs mt-1">To see orders, avg cost/order, and other metrics:</p>
                      <ul className="text-slate-500 text-xs mt-1 list-disc list-inside">
                        <li>Re-process this data with a 3PL CSV that includes "Count Total" column</li>
                        <li>Make sure your 3PL file has "First Pick Fee" rows (used to count orders)</li>
                      </ul>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-slate-500 text-sm">No breakdown available. Re-process this data with a 3PL CSV to see the breakdown.</p>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div><p className="text-slate-500 text-xs uppercase mb-1">AOV</p><p className="text-lg font-semibold text-white">{formatCurrency((data.aov || (isAmz ? ((data.units || 0) > 0 ? (data.revenue || 0) / (data.units || 1) : 0) : ((data.orders || 0) > 0 ? (data.revenue || 0) / (data.orders || 1) : ((data.units || 0) > 0 ? (data.revenue || 0) / (data.units || 1) : 0)))))}</p></div>
          {isAmz ? (
            <>
              <div><p className="text-slate-500 text-xs uppercase mb-1">Returns</p><p className="text-lg font-semibold text-white">{formatNumber(data.returns || 0)}</p></div>
              <div><p className="text-slate-500 text-xs uppercase mb-1">Return Rate</p><p className="text-lg font-semibold text-white">{formatPercent(data.returnRate || 0)}</p></div>
            </>
          ) : (
            <>
              <div><p className="text-slate-500 text-xs uppercase mb-1">Meta Ads</p><p className="text-lg font-semibold text-white">{formatCurrency(data.metaSpend || data.metaAds || 0)}</p></div>
              <div><p className="text-slate-500 text-xs uppercase mb-1">Google Ads</p><p className="text-lg font-semibold text-white">{formatCurrency(data.googleSpend || data.googleAds || 0)}</p></div>
            </>
          )}
          <div><p className="text-slate-500 text-xs uppercase mb-1">{isAmz ? 'COGS/Unit' : 'Discounts'}</p><p className="text-lg font-semibold text-white">{isAmz ? formatCurrency(data.units > 0 ? data.cogs / data.units : 0) : formatCurrency(data.discounts || 0)}</p></div>
        </div>
        {showSkuTable && (
          <div className="mt-4 pt-4 border-t border-slate-700">
            <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-3">
              <ChevronRight className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
              SKU Details ({skuData.length} products)
            </button>
            {expanded && (
              skuData.length > 0 ? (
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900/50 sticky top-0">
                      <tr>
                        <th className="text-left text-xs font-medium text-slate-400 uppercase px-2 py-2">SKU</th>
                        <SortHeader field="unitsSold" label="Units" />
                        <SortHeader field="netSales" label="Sales" />
                        {isAmz && <SortHeader field="netProceeds" label="Proceeds" />}
                        {isAmz && <SortHeader field="adSpend" label="Ad Spend" />}
                        {isAmz && <SortHeader field="returns" label="Returns" />}
                        {!isAmz && <SortHeader field="discounts" label="Discounts" />}
                        <SortHeader field="cogs" label="COGS" />
                        <SortHeader field="profit" label="Profit" />
                        <SortHeader field="proceedsPerUnit" label="$/Unit" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {skuData.map((item, i) => (
                        <tr key={item.sku + i} className="hover:bg-slate-700/30">
                          <td className="px-2 py-2"><div className="max-w-[200px] truncate text-white" title={item.name}>{item.sku}</div></td>
                          <td className="text-right px-2 py-2 text-white">{formatNumber(item.unitsSold)}</td>
                          <td className="text-right px-2 py-2 text-white">{formatCurrency(item.netSales)}</td>
                          {isAmz && <td className="text-right px-2 py-2 text-emerald-400">{formatCurrency(item.netProceeds)}</td>}
                          {isAmz && <td className="text-right px-2 py-2 text-violet-400">{formatCurrency(item.adSpend)}</td>}
                          {isAmz && <td className="text-right px-2 py-2 text-rose-400">{formatNumber(item.returns)}</td>}
                          {!isAmz && <td className="text-right px-2 py-2 text-amber-400">{formatCurrency(item.discounts)}</td>}
                          <td className="text-right px-2 py-2 text-slate-400">{formatCurrency(item.cogs)}</td>
                          <td className={`text-right px-2 py-2 font-medium ${item.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(item.profit)}</td>
                          <td className={`text-right px-2 py-2 font-medium ${item.proceedsPerUnit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(item.proceedsPerUnit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bg-slate-900/50 rounded-lg p-4 text-center">
                  <p className="text-slate-400 text-sm">No SKU data available for this week.</p>
                  <p className="text-slate-500 text-xs mt-1">Re-upload your sales files to capture SKU-level detail.</p>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChannelCard;
