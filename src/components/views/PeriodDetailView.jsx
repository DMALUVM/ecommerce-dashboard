import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  BarChart3, ChevronLeft, ChevronRight, DollarSign, Package, PieChart, RefreshCw, ShoppingCart, Trash2, TrendingUp, Trophy, Truck, Upload, Zap
} from 'lucide-react';
import { formatCurrency, formatNumber, formatPercent } from '../../utils/format';
import NavTabs from '../ui/NavTabs';
import ChannelCard from '../ui/ChannelCard';
import MetricCard from '../ui/MetricCard';

const PeriodDetailView = ({
  adSpend,
  allDaysData,
  allPeriodsData,
  allWeeksData,
  appSettings,
  bankingData,
  clearPeriod3PLFiles,
  deletePeriod,
  files,
  globalModals,
  handlePeriodFile,
  hasDailySalesData,
  invHistory,
  navDropdown,
  parse3PLData,
  periodAdSpend,
  periodAnalyticsView,
  periodFileNames,
  periodFiles,
  reprocessPeriod,
  savePeriods,
  selectedPeriod,
  setAllPeriodsData,
  setNavDropdown,
  setPeriodAdSpend,
  setPeriodAnalyticsView,
  setPeriodFileNames,
  setPeriodFiles,
  setReprocessPeriod,
  setSelectedDay,
  setSelectedInvDate,
  setSelectedPeriod,
  setSelectedWeek,
  setUploadTab,
  setView,
  view,
}) => {
    const data = allPeriodsData[selectedPeriod], periods = Object.keys(allPeriodsData).sort().reverse(), idx = periods.indexOf(selectedPeriod);
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 lg:p-6">
        <div className="max-w-7xl mx-auto">{globalModals}
          {/* Period Reprocess Modal */}
          {reprocessPeriod && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-md w-full">
                <h2 className="text-xl font-bold text-white mb-2">Update Period: {allPeriodsData[reprocessPeriod]?.label}</h2>
                <p className="text-slate-400 text-sm mb-4">Add or update 3PL costs and ad spend for this period</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-300 mb-2">3PL Cost Files (click multiple times to add)</label>
                    <div className={`relative border-2 border-dashed rounded-xl p-4 ${periodFiles.threepl?.length > 0 ? 'border-emerald-400 bg-emerald-950/30' : 'border-slate-600 hover:border-slate-400 bg-slate-800/30'}`}>
                      <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => handlePeriodFile('threepl', e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                      <div className="text-center">
                        {periodFileNames.threepl?.length > 0 ? (
                          <div>
                            <p className="text-emerald-400 text-sm">{periodFileNames.threepl.length} file(s) selected</p>
                            {periodFileNames.threepl.map((n, i) => <p key={i} className="text-xs text-slate-400 truncate">• {n}</p>)}
                            <button onClick={(e) => { e.stopPropagation(); clearPeriod3PLFiles(); }} className="text-xs text-rose-400 mt-2">Clear all</button>
                          </div>
                        ) : (
                          <p className="text-slate-500 text-sm">Click to add 3PL files (.csv or .xlsx)</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-slate-300 mb-1">Meta Ad Spend</label>
                      <input type="number" value={periodAdSpend.meta} onChange={(e) => setPeriodAdSpend(p => ({ ...p, meta: e.target.value }))} placeholder={String(allPeriodsData[reprocessPeriod]?.shopify?.metaSpend || 0)} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white" />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-300 mb-1">Google Ad Spend</label>
                      <input type="number" value={periodAdSpend.google} onChange={(e) => setPeriodAdSpend(p => ({ ...p, google: e.target.value }))} placeholder={String(allPeriodsData[reprocessPeriod]?.shopify?.googleSpend || 0)} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white" />
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button onClick={() => {
                    const existing = allPeriodsData[reprocessPeriod];
                    if (!existing) return;
                    
                    // Use enhanced 3PL parser for full metrics
                    let newThreeplCost = existing.shopify?.threeplCosts || 0;
                    let newBreakdown = existing.shopify?.threeplBreakdown || { storage: 0, shipping: 0, pickFees: 0, boxCharges: 0, receiving: 0, other: 0 };
                    let newMetrics = existing.shopify?.threeplMetrics || null;
                    
                    if (periodFiles.threepl?.length > 0) {
                      const threeplData = parse3PLData(periodFiles.threepl);
                      newThreeplCost = threeplData.metrics.totalCost;
                      newBreakdown = threeplData.breakdown;
                      newMetrics = threeplData.metrics;
                    }
                    
                    // Update ad spend if provided
                    const newMeta = periodAdSpend.meta ? parseFloat(periodAdSpend.meta) : (existing.shopify?.metaSpend || 0);
                    const newGoogle = periodAdSpend.google ? parseFloat(periodAdSpend.google) : (existing.shopify?.googleSpend || 0);
                    const newShopAds = newMeta + newGoogle;
                    
                    // Recalculate profit
                    const shopRev = existing.shopify?.revenue || 0;
                    const shopCogs = existing.shopify?.cogs || 0;
                    const newShopProfit = shopRev - shopCogs - newThreeplCost - newShopAds;
                    const amzProfit = existing.amazon?.netProfit || 0;
                    const totalRev = existing.total?.revenue || 0;
                    const newTotalProfit = amzProfit + newShopProfit;
                    
                    const updated = {
                      ...allPeriodsData,
                      [reprocessPeriod]: {
                        ...existing,
                        shopify: {
                          ...existing.shopify,
                          threeplCosts: newThreeplCost,
                          threeplBreakdown: newBreakdown,
                          threeplMetrics: newMetrics,
                          metaSpend: newMeta,
                          googleSpend: newGoogle,
                          adSpend: newShopAds,
                          netProfit: newShopProfit,
                          netMargin: shopRev > 0 ? (newShopProfit / shopRev) * 100 : 0,
                        },
                        total: {
                          ...existing.total,
                          adSpend: (existing.amazon?.adSpend || 0) + newShopAds,
                          netProfit: newTotalProfit,
                          netMargin: totalRev > 0 ? (newTotalProfit / totalRev) * 100 : 0,
                        }
                      }
                    };
                    setAllPeriodsData(updated);
                    savePeriods(updated);
                    setReprocessPeriod(null);
                    setPeriodFiles(p => ({ ...p, threepl: [] }));
                    setPeriodFileNames(p => ({ ...p, threepl: [] }));
                    setPeriodAdSpend({ meta: '', google: '' });
                  }} className="flex-1 bg-teal-600 hover:bg-teal-500 text-white font-semibold py-2 rounded-xl">Update Period</button>
                  <button onClick={() => { setReprocessPeriod(null); clearPeriod3PLFiles(); setPeriodAdSpend({ meta: '', google: '' }); }} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-xl">Cancel</button>
                </div>
              </div>
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div><h1 className="text-2xl lg:text-3xl font-bold text-white">{data.label}</h1><p className="text-slate-400">Period Performance</p></div>
            <div className="flex gap-2">
              <button onClick={() => setReprocessPeriod(selectedPeriod)} className="bg-cyan-700 hover:bg-cyan-600 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-1"><RefreshCw className="w-4 h-4" />Update 3PL/Ads</button>
              <button onClick={() => { setUploadTab('period'); setView('upload'); }} className="bg-teal-700 hover:bg-teal-600 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-1"><Upload className="w-4 h-4" />New</button>
              <button onClick={() => deletePeriod(selectedPeriod)} className="bg-rose-900/50 hover:bg-rose-800/50 border border-rose-600/50 text-rose-300 px-3 py-2 rounded-lg text-sm"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
          <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />
          {periods.length > 1 && (
            <div className="flex items-center gap-4 mb-6">
              <button onClick={() => idx < periods.length - 1 && setSelectedPeriod(periods[idx + 1])} disabled={idx >= periods.length - 1} className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg"><ChevronLeft className="w-5 h-5" /></button>
              <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)} className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white">{periods.map(p => <option key={p} value={p}>{allPeriodsData[p]?.label || p}</option>)}</select>
              <button onClick={() => idx > 0 && setSelectedPeriod(periods[idx - 1])} disabled={idx <= 0} className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg"><ChevronRight className="w-5 h-5" /></button>
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <MetricCard label="Total Revenue" value={formatCurrency(data.total.revenue)} icon={DollarSign} color="emerald" />
            <MetricCard label="Total Units" value={formatNumber(data.total.units)} icon={Package} color="blue" />
            <MetricCard label="Net Profit" value={formatCurrency(data.total.netProfit)} sub={`${formatPercent(data.total.netMargin)} margin`} icon={TrendingUp} color={data.total.netProfit >= 0 ? 'emerald' : 'rose'} />
            <MetricCard label="Ad Spend" value={formatCurrency(data.total.adSpend)} sub={`${(data.total.roas || 0).toFixed(2)}x TACOS`} icon={BarChart3} color="violet" />
            <MetricCard label="COGS" value={formatCurrency(data.total.cogs)} icon={ShoppingCart} color="amber" />
          </div>
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5 mb-6">
            <h3 className="text-sm font-semibold text-slate-400 uppercase mb-4">Revenue by Channel</h3>
            <div className="h-4 bg-slate-700 rounded-full overflow-hidden flex mb-3"><div className="bg-orange-500 h-full" style={{ width: `${data.total.amazonShare}%` }} /><div className="bg-blue-500 h-full" style={{ width: `${data.total.shopifyShare}%` }} /></div>
            <div className="flex justify-between text-sm"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-orange-500" /><span className="text-slate-300">Amazon</span><span className="text-white font-semibold">{formatPercent(data.total.amazonShare)}</span></div><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500" /><span className="text-slate-300">Shopify</span><span className="text-white font-semibold">{formatPercent(data.total.shopifyShare)}</span></div></div>
          </div>
          
          {/* Period Analytics Quick Access Buttons */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <button onClick={() => setPeriodAnalyticsView(periodAnalyticsView === 'skus' ? null : 'skus')} className={`p-3 rounded-xl border text-left transition-all ${periodAnalyticsView === 'skus' ? 'bg-pink-600/20 border-pink-500/50' : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'}`}>
              <Trophy className={`w-5 h-5 mb-1 ${periodAnalyticsView === 'skus' ? 'text-pink-400' : 'text-slate-400'}`} />
              <p className={`text-sm font-medium ${periodAnalyticsView === 'skus' ? 'text-pink-300' : 'text-white'}`}>SKU Rankings</p>
              <p className="text-xs text-slate-500">{(data.amazon?.skuData?.length || 0) + (data.shopify?.skuData?.length || 0)} products</p>
            </button>
            <button onClick={() => setPeriodAnalyticsView(periodAnalyticsView === 'profit' ? null : 'profit')} className={`p-3 rounded-xl border text-left transition-all ${periodAnalyticsView === 'profit' ? 'bg-emerald-600/20 border-emerald-500/50' : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'}`}>
              <PieChart className={`w-5 h-5 mb-1 ${periodAnalyticsView === 'profit' ? 'text-emerald-400' : 'text-slate-400'}`} />
              <p className={`text-sm font-medium ${periodAnalyticsView === 'profit' ? 'text-emerald-300' : 'text-white'}`}>Profitability</p>
              <p className="text-xs text-slate-500">{formatPercent(data.total.netMargin)} margin</p>
            </button>
            <button onClick={() => setPeriodAnalyticsView(periodAnalyticsView === 'ads' ? null : 'ads')} className={`p-3 rounded-xl border text-left transition-all ${periodAnalyticsView === 'ads' ? 'bg-purple-600/20 border-purple-500/50' : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'}`}>
              <Zap className={`w-5 h-5 mb-1 ${periodAnalyticsView === 'ads' ? 'text-purple-400' : 'text-slate-400'}`} />
              <p className={`text-sm font-medium ${periodAnalyticsView === 'ads' ? 'text-purple-300' : 'text-white'}`}>Ad Performance</p>
              <p className="text-xs text-slate-500">{formatCurrency(data.total.adSpend)} spent</p>
            </button>
            <button onClick={() => setPeriodAnalyticsView(periodAnalyticsView === '3pl' ? null : '3pl')} className={`p-3 rounded-xl border text-left transition-all ${periodAnalyticsView === '3pl' ? 'bg-blue-600/20 border-blue-500/50' : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'}`}>
              <Truck className={`w-5 h-5 mb-1 ${periodAnalyticsView === '3pl' ? 'text-blue-400' : 'text-slate-400'}`} />
              <p className={`text-sm font-medium ${periodAnalyticsView === '3pl' ? 'text-blue-300' : 'text-white'}`}>3PL Costs</p>
              <p className="text-xs text-slate-500">{formatCurrency(data.shopify?.threeplCosts || 0)}</p>
            </button>
          </div>
          
          {/* SKU Rankings Panel */}
          {periodAnalyticsView === 'skus' && (
            <div className="bg-slate-800/50 rounded-2xl border border-pink-500/30 p-5 mb-6">
              <h3 className="text-lg font-semibold text-pink-400 mb-4 flex items-center gap-2"><Trophy className="w-5 h-5" />SKU Rankings - {data.label}</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-semibold text-orange-400 mb-3">Amazon Top SKUs</h4>
                  {data.amazon?.skuData?.length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto">{data.amazon.skuData.slice(0, 10).map((sku, i) => (<div key={sku.sku} className="flex items-center gap-3 p-2 bg-slate-900/50 rounded-lg"><span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-amber-500 text-black' : i === 1 ? 'bg-slate-400 text-black' : i === 2 ? 'bg-amber-700 text-white' : 'bg-slate-700 text-white'}`}>{i + 1}</span><div className="flex-1 min-w-0"><p className="text-white text-sm truncate">{sku.sku}</p><p className="text-slate-500 text-xs">{formatNumber(sku.unitsSold)} units</p></div><p className="text-emerald-400 font-semibold">{formatCurrency(sku.netSales)}</p></div>))}</div>
                  ) : <p className="text-slate-500 text-sm">No SKU data</p>}
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-blue-400 mb-3">Shopify Top SKUs</h4>
                  {data.shopify?.skuData?.length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto">{data.shopify.skuData.slice(0, 10).map((sku, i) => (<div key={sku.sku} className="flex items-center gap-3 p-2 bg-slate-900/50 rounded-lg"><span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-amber-500 text-black' : i === 1 ? 'bg-slate-400 text-black' : i === 2 ? 'bg-amber-700 text-white' : 'bg-slate-700 text-white'}`}>{i + 1}</span><div className="flex-1 min-w-0"><p className="text-white text-sm truncate">{sku.sku}</p><p className="text-slate-500 text-xs">{formatNumber(sku.unitsSold)} units</p></div><p className="text-emerald-400 font-semibold">{formatCurrency(sku.netSales)}</p></div>))}</div>
                  ) : <p className="text-slate-500 text-sm">No SKU data</p>}
                </div>
              </div>
            </div>
          )}
          
          {/* Profitability Panel */}
          {periodAnalyticsView === 'profit' && (
            <div className="bg-slate-800/50 rounded-2xl border border-emerald-500/30 p-5 mb-6">
              <h3 className="text-lg font-semibold text-emerald-400 mb-4 flex items-center gap-2"><PieChart className="w-5 h-5" />Profitability - {data.label}</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div><h4 className="text-sm font-semibold text-slate-300 mb-3">Profit Waterfall</h4><div className="space-y-2"><div className="flex justify-between items-center p-2 bg-emerald-900/30 rounded-lg"><span className="text-slate-300">Revenue</span><span className="text-emerald-400 font-semibold">{formatCurrency(data.total.revenue)}</span></div><div className="flex justify-between items-center p-2 bg-rose-900/30 rounded-lg"><span className="text-slate-300">− COGS</span><span className="text-rose-400">({formatCurrency(data.total.cogs)})</span></div><div className="flex justify-between items-center p-2 bg-rose-900/30 rounded-lg"><span className="text-slate-300">− Amazon Fees</span><span className="text-rose-400">({formatCurrency(data.amazon?.fees || 0)})</span></div><div className="flex justify-between items-center p-2 bg-rose-900/30 rounded-lg"><span className="text-slate-300">− 3PL Costs</span><span className="text-rose-400">({formatCurrency(data.shopify?.threeplCosts || 0)})</span></div><div className="flex justify-between items-center p-2 bg-rose-900/30 rounded-lg"><span className="text-slate-300">− Ad Spend</span><span className="text-rose-400">({formatCurrency(data.total.adSpend)})</span></div><div className="flex justify-between items-center p-2 bg-slate-700 rounded-lg border-2 border-emerald-500/50"><span className="text-white font-semibold">Net Profit</span><span className={`font-bold ${data.total.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(data.total.netProfit)}</span></div></div></div>
                <div><h4 className="text-sm font-semibold text-slate-300 mb-3">Cost Breakdown</h4><div className="space-y-3"><div><div className="flex justify-between text-sm mb-1"><span className="text-slate-400">COGS</span><span className="text-white">{formatPercent(data.total.revenue > 0 ? (data.total.cogs / data.total.revenue) * 100 : 0)}</span></div><div className="h-2 bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-amber-500" style={{ width: `${Math.min(100, data.total.revenue > 0 ? (data.total.cogs / data.total.revenue) * 100 : 0)}%` }} /></div></div><div><div className="flex justify-between text-sm mb-1"><span className="text-slate-400">Fees & Fulfillment</span><span className="text-white">{formatPercent(data.total.revenue > 0 ? (((data.amazon?.fees || 0) + (data.shopify?.threeplCosts || 0)) / data.total.revenue) * 100 : 0)}</span></div><div className="h-2 bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${Math.min(100, data.total.revenue > 0 ? (((data.amazon?.fees || 0) + (data.shopify?.threeplCosts || 0)) / data.total.revenue) * 100 : 0)}%` }} /></div></div><div><div className="flex justify-between text-sm mb-1"><span className="text-slate-400">Advertising</span><span className="text-white">{formatPercent(data.total.revenue > 0 ? (data.total.adSpend / data.total.revenue) * 100 : 0)}</span></div><div className="h-2 bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-purple-500" style={{ width: `${Math.min(100, data.total.revenue > 0 ? (data.total.adSpend / data.total.revenue) * 100 : 0)}%` }} /></div></div><div><div className="flex justify-between text-sm mb-1"><span className="text-slate-400">Net Margin</span><span className={data.total.netMargin >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{formatPercent(data.total.netMargin)}</span></div><div className="h-2 bg-slate-700 rounded-full overflow-hidden"><div className={`h-full ${data.total.netMargin >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(100, Math.abs(data.total.netMargin))}%` }} /></div></div></div></div>
              </div>
            </div>
          )}
          
          {/* Ads Panel */}
          {periodAnalyticsView === 'ads' && (
            <div className="bg-slate-800/50 rounded-2xl border border-purple-500/30 p-5 mb-6">
              <h3 className="text-lg font-semibold text-purple-400 mb-4 flex items-center gap-2"><Zap className="w-5 h-5" />Ad Performance - {data.label}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4"><div className="bg-slate-900/50 rounded-lg p-3"><p className="text-slate-500 text-xs">Total Ad Spend</p><p className="text-white text-xl font-bold">{formatCurrency(data.total.adSpend)}</p></div><div className="bg-slate-900/50 rounded-lg p-3"><p className="text-slate-500 text-xs">TACOS</p><p className={`text-xl font-bold ${data.total.revenue > 0 && (data.total.adSpend / data.total.revenue) * 100 <= 15 ? 'text-emerald-400' : 'text-amber-400'}`}>{data.total.revenue > 0 ? ((data.total.adSpend / data.total.revenue) * 100).toFixed(1) : 0}%</p></div><div className="bg-slate-900/50 rounded-lg p-3"><p className="text-slate-500 text-xs">Amazon Ads</p><p className="text-orange-400 text-xl font-bold">{formatCurrency(data.amazon?.adSpend || 0)}</p></div><div className="bg-slate-900/50 rounded-lg p-3"><p className="text-slate-500 text-xs">Shopify Ads</p><p className="text-blue-400 text-xl font-bold">{formatCurrency(data.shopify?.adSpend || 0)}</p></div></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  <div className="bg-orange-900/20 rounded-lg p-4 border border-orange-500/30">
    <h4 className="text-orange-400 font-semibold mb-2">Amazon</h4>
    <div className="space-y-1 text-sm">
      <div className="flex justify-between"><span className="text-slate-400">Sponsored Products</span><span className="text-white">{formatCurrency(data.amazon?.adSpend || 0)}</span></div>
      <div className="flex justify-between"><span className="text-slate-400">TACOS</span><span className="text-white">{data.amazon?.revenue > 0 ? ((data.amazon.adSpend / data.amazon.revenue) * 100).toFixed(1) : 0}%</span></div>
    </div>
  </div>

  <div className="bg-blue-900/20 rounded-lg p-4 border border-blue-500/30">
    <h4 className="text-blue-400 font-semibold mb-2">Shopify</h4>
    <div className="space-y-1 text-sm">
      <div className="flex justify-between"><span className="text-slate-400">Meta Ads</span><span className="text-white">{formatCurrency(data.shopify?.metaSpend || 0)}</span></div>
      <div className="flex justify-between"><span className="text-slate-400">Google Ads</span><span className="text-white">{formatCurrency(data.shopify?.googleSpend || 0)}</span></div>
      <div className="flex justify-between"><span className="text-slate-400">TACOS</span><span className="text-white">{data.shopify?.revenue > 0 ? ((data.shopify.adSpend / data.shopify.revenue) * 100).toFixed(1) : 0}%</span></div>
    </div>

    {/* Weekly KPIs (populated from daily ads uploads via utils/weekly.js) */}
    {(() => {
      const m = data.shopify?.adsMetrics || {};
      const metaImpr = m.metaImpressions || 0;
      const googleImpr = m.googleImpressions || 0;
      const has = (metaImpr + googleImpr) > 0 || (m.metaClicks || 0) > 0 || (m.googleClicks || 0) > 0;
      if (!has) return null;

      return (
        <div className="mt-4 pt-4 border-t border-blue-500/20 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-slate-900/50 rounded-lg p-3">
            <p className="text-slate-400 text-xs font-medium mb-2">Meta KPIs</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><p className="text-slate-500 text-[10px]">Impr</p><p className="text-white text-sm font-semibold">{formatNumber(metaImpr)}</p></div>
              <div><p className="text-slate-500 text-[10px]">Clicks</p><p className="text-white text-sm font-semibold">{formatNumber(m.metaClicks || 0)}</p></div>
              <div><p className="text-slate-500 text-[10px]">Purch</p><p className="text-white text-sm font-semibold">{formatNumber(m.metaPurchases || 0)}</p></div>
              <div><p className="text-slate-500 text-[10px]">CTR</p><p className="text-white text-sm font-semibold">{(m.metaCTR || 0).toFixed(2)}%</p></div>
              <div><p className="text-slate-500 text-[10px]">CPC</p><p className="text-white text-sm font-semibold">{formatCurrency(m.metaCPC || 0)}</p></div>
              <div><p className="text-slate-500 text-[10px]">ROAS</p><p className="text-white text-sm font-semibold">{(m.metaROAS || 0).toFixed(2)}</p></div>
            </div>
          </div>

          <div className="bg-slate-900/50 rounded-lg p-3">
            <p className="text-slate-400 text-xs font-medium mb-2">Google KPIs</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><p className="text-slate-500 text-[10px]">Impr</p><p className="text-white text-sm font-semibold">{formatNumber(googleImpr)}</p></div>
              <div><p className="text-slate-500 text-[10px]">Clicks</p><p className="text-white text-sm font-semibold">{formatNumber(m.googleClicks || 0)}</p></div>
              <div><p className="text-slate-500 text-[10px]">Conv</p><p className="text-white text-sm font-semibold">{formatNumber(m.googleConversions || 0)}</p></div>
              <div><p className="text-slate-500 text-[10px]">CTR</p><p className="text-white text-sm font-semibold">{(m.googleCTR || 0).toFixed(2)}%</p></div>
              <div><p className="text-slate-500 text-[10px]">CPC</p><p className="text-white text-sm font-semibold">{formatCurrency(m.googleCPC || 0)}</p></div>
              <div><p className="text-slate-500 text-[10px]">CPA</p><p className="text-white text-sm font-semibold">{formatCurrency(m.googleCostPerConv || 0)}</p></div>
            </div>
          </div>
        </div>
      );
    })()}
  </div>
</div>
            </div>
          )}
          
          {/* 3PL Panel */}
          {periodAnalyticsView === '3pl' && (
            <div className="bg-slate-800/50 rounded-2xl border border-blue-500/30 p-5 mb-6">
              <h3 className="text-lg font-semibold text-blue-400 mb-4 flex items-center gap-2"><Truck className="w-5 h-5" />3PL Fulfillment - {data.label}</h3>
              {data.shopify?.threeplCosts > 0 ? (<><div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4"><div className="bg-slate-900/50 rounded-lg p-3"><p className="text-slate-500 text-xs">Total 3PL</p><p className="text-white text-xl font-bold">{formatCurrency(data.shopify.threeplCosts)}</p></div><div className="bg-slate-900/50 rounded-lg p-3"><p className="text-slate-500 text-xs">% of Revenue</p><p className="text-white text-xl font-bold">{data.shopify.revenue > 0 ? ((data.shopify.threeplCosts / data.shopify.revenue) * 100).toFixed(1) : 0}%</p></div>{data.shopify.threeplMetrics?.orderCount > 0 && (<><div className="bg-cyan-900/30 rounded-lg p-3 border border-cyan-500/30"><p className="text-cyan-400 text-xs">Orders</p><p className="text-cyan-300 text-xl font-bold">{formatNumber(data.shopify.threeplMetrics.orderCount)}</p></div><div className="bg-cyan-900/30 rounded-lg p-3 border border-cyan-500/30"><p className="text-cyan-400 text-xs">Avg Cost/Order</p><p className="text-cyan-300 text-xl font-bold">{formatCurrency(data.shopify.threeplMetrics.avgCostPerOrder)}</p></div></>)}</div>{data.shopify.threeplBreakdown && (<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">{data.shopify.threeplBreakdown.shipping > 0 && <div className="bg-slate-900/50 rounded-lg p-2"><p className="text-slate-500 text-xs">Shipping</p><p className="text-blue-400 font-semibold">{formatCurrency(data.shopify.threeplBreakdown.shipping)}</p></div>}{data.shopify.threeplBreakdown.pickFees > 0 && <div className="bg-slate-900/50 rounded-lg p-2"><p className="text-slate-500 text-xs">Pick Fees</p><p className="text-emerald-400 font-semibold">{formatCurrency(data.shopify.threeplBreakdown.pickFees)}</p></div>}{data.shopify.threeplBreakdown.storage > 0 && <div className="bg-slate-900/50 rounded-lg p-2"><p className="text-slate-500 text-xs">Storage</p><p className="text-violet-400 font-semibold">{formatCurrency(data.shopify.threeplBreakdown.storage)}</p></div>}{data.shopify.threeplBreakdown.boxCharges > 0 && <div className="bg-slate-900/50 rounded-lg p-2"><p className="text-slate-500 text-xs">Packaging</p><p className="text-amber-400 font-semibold">{formatCurrency(data.shopify.threeplBreakdown.boxCharges)}</p></div>}{data.shopify.threeplBreakdown.receiving > 0 && <div className="bg-slate-900/50 rounded-lg p-2"><p className="text-slate-500 text-xs">Receiving</p><p className="text-slate-300 font-semibold">{formatCurrency(data.shopify.threeplBreakdown.receiving)}</p></div>}{data.shopify.threeplBreakdown.other > 0 && <div className="bg-slate-900/50 rounded-lg p-2"><p className="text-slate-500 text-xs">Other</p><p className="text-slate-300 font-semibold">{formatCurrency(data.shopify.threeplBreakdown.other)}</p></div>}</div>)}{data.shopify.threeplMetrics?.orderCount > 0 && (<div className="border-t border-slate-700 pt-4"><h4 className="text-sm font-semibold text-cyan-400 mb-3">📦 Order Metrics</h4><div className="grid grid-cols-2 md:grid-cols-4 gap-3"><div className="bg-slate-900/50 rounded-lg p-2"><p className="text-slate-500 text-xs">Units Picked</p><p className="text-white font-semibold">{formatNumber(data.shopify.threeplMetrics.totalUnits)}</p></div><div className="bg-slate-900/50 rounded-lg p-2"><p className="text-slate-500 text-xs">Avg Units/Order</p><p className="text-white font-semibold">{data.shopify.threeplMetrics.avgUnitsPerOrder?.toFixed(1) || '—'}</p></div><div className="bg-slate-900/50 rounded-lg p-2"><p className="text-slate-500 text-xs">Avg Ship Cost</p><p className="text-white font-semibold">{formatCurrency(data.shopify.threeplMetrics.avgShippingCost)}</p></div><div className="bg-slate-900/50 rounded-lg p-2"><p className="text-slate-500 text-xs">Avg Pick Cost</p><p className="text-white font-semibold">{formatCurrency(data.shopify.threeplMetrics.avgPickCost)}</p></div></div></div>)}</>) : (<div className="text-center py-6"><Truck className="w-12 h-12 text-slate-600 mx-auto mb-3" /><p className="text-slate-400">No 3PL data for this period</p><p className="text-slate-500 text-sm mt-1">Click "Update 3PL/Ads" to add 3PL cost files</p></div>)}
            </div>
          )}
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><ChannelCard title="Amazon" color="orange" data={data.amazon} isAmz showSkuTable /><ChannelCard title="Shopify" color="blue" data={data.shopify} showSkuTable /></div>
        </div>
      </div>
    );

};

export default PeriodDetailView;
