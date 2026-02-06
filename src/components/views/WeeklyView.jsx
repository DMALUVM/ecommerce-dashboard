import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  BarChart3, Calendar, Check, ChevronLeft, ChevronRight, DollarSign, Edit, FileSpreadsheet, Package, RefreshCw, Save, ShoppingCart, Store, Trash2, TrendingUp, Truck, Upload
} from 'lucide-react';
import { deriveWeeksFromDays } from '../../utils/aggregation';
import { formatCurrency, formatNumber, formatPercent } from '../../utils/format';
import { parseCSV } from '../../utils/csv';
import NavTabs from '../ui/NavTabs';
import ChannelCard from '../ui/ChannelCard';
import MetricCard from '../ui/MetricCard';

const WeeklyView = ({
  adSpend,
  allDaysData,
  allPeriodsData,
  allWeeksData,
  appSettings,
  bankingData,
  current,
  deleteWeek,
  edit3PLCost,
  editAdSpend,
  editingNote,
  files,
  get3PLForWeek,
  globalModals,
  handleReprocessFile,
  hasDailySalesData,
  invHistory,
  mergeWeekData,
  navDropdown,
  noteText,
  parse3PLData,
  reprocessAdSpend,
  reprocessFileNames,
  reprocessFiles,
  reprocessWeek,
  run,
  selectedWeek,
  setEdit3PLCost,
  setEditAdSpend,
  setEditingNote,
  setNavDropdown,
  setNoteText,
  setReprocessAdSpend,
  setReprocessFileNames,
  setReprocessFiles,
  setSelectedDay,
  setSelectedInvDate,
  setSelectedPeriod,
  setSelectedWeek,
  setShowEdit3PL,
  setShowEditAdSpend,
  setShowReprocess,
  setToast,
  setUploadTab,
  setView,
  setWeekNotes,
  showEdit3PL,
  showEditAdSpend,
  showReprocess,
  showSaveConfirm,
  storeLogo,
  storeName,
  threeplLedger,
  toast,
  updateWeek3PL,
  updateWeekAdSpend,
  view,
  weekEnding,
  weekNotes,
}) => {
    const derivedWeeks = deriveWeeksFromDays(allDaysData);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    // Allow current week: week is visible if it has started (weekEnding - 6 days <= today)
    const weeks = Array.from(new Set([...(Object.keys(allWeeksData || {})), ...(Object.keys(derivedWeeks || {}))]))
      .filter(w => {
        const weekEnd = new Date(w + 'T12:00:00');
        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekStart.getDate() - 6); // Week starts 6 days before ending
        return weekStart <= today; // Show if week has started
      })
      .sort().reverse();
    
    // If current selectedWeek hasn't started yet, switch to most recent valid week
    const selectedWeekEnd = new Date(selectedWeek + 'T12:00:00');
    const selectedWeekStart = new Date(selectedWeekEnd);
    selectedWeekStart.setDate(selectedWeekStart.getDate() - 6);
    if (selectedWeekStart > today && weeks.length > 0) {
      setSelectedWeek(weeks[0]);
      return null; // Re-render with valid week
    }
    
    const idx = weeks.indexOf(selectedWeek);
    const rawData = mergeWeekData(allWeeksData[selectedWeek], derivedWeeks[selectedWeek]);
    if (!rawData) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 lg:p-6">
          <div className="max-w-7xl mx-auto">
            <Toast toast={toast} setToast={setToast} showSaveConfirm={showSaveConfirm} />
            <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />
            <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-2xl border border-slate-700 p-8 mt-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-700/50 flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-8 h-8 text-slate-500" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">No Data for This Week</h2>
              <p className="text-slate-400 mb-6 max-w-md mx-auto">Upload daily Amazon/Shopify files or run a sync, and this week will populate automatically.</p>
              <button onClick={() => { setView('upload'); setUploadTab('amazon-bulk'); }} className="px-6 py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 rounded-xl text-white font-medium inline-flex items-center gap-2">
                <Upload className="w-5 h-5" />Upload Sales Data
              </button>
            </div>
          </div>
        </div>
      );
    }
    
    // Enhance Shopify data with 3PL from ledger if available
    const ledger3PL = get3PLForWeek(threeplLedger, selectedWeek);
    const enhancedShopify = { ...rawData.shopify };
    
    if (ledger3PL && ledger3PL.metrics.totalCost > 0) {
      // Use ledger data for 3PL costs
      enhancedShopify.threeplCosts = ledger3PL.metrics.totalCost;
      enhancedShopify.threeplBreakdown = ledger3PL.breakdown;
      enhancedShopify.threeplMetrics = ledger3PL.metrics;
      
      // Recalculate profit with new 3PL costs
      const oldThreePL = rawData.shopify?.threeplCosts || 0;
      const newThreePL = ledger3PL.metrics.totalCost;
      const profitAdjustment = oldThreePL - newThreePL; // Add back old, subtract new
      enhancedShopify.netProfit = (rawData.shopify?.netProfit || 0) + profitAdjustment;
      enhancedShopify.netMargin = enhancedShopify.revenue > 0 ? (enhancedShopify.netProfit / enhancedShopify.revenue) * 100 : 0;
    }
    
    // Create enhanced data object (always recompute totals so Amazon + Shopify are included)
    const amz = rawData.amazon || {};
    const amzRev = amz.revenue || 0;
    const amzUnits = amz.units || 0;
    const amzCogs = amz.cogs || 0;
    const amzAds = amz.adSpend || 0;
    const amzProfit = (amz.netProfit || amz.netProceeds || 0);

    const shopRev = enhancedShopify.revenue || 0;
    const shopUnits = enhancedShopify.units || 0;
    const shopCogs = enhancedShopify.cogs || 0;
    const shopAds = enhancedShopify.adSpend || 0;
    const shopProfit = enhancedShopify.netProfit || 0;

    const totalRevenue = amzRev + shopRev;
    const totalUnits = amzUnits + shopUnits;
    const totalCogs = amzCogs + shopCogs;
    const totalAdSpend = amzAds + shopAds;
    const totalNetProfit = amzProfit + shopProfit;

    const data = {
      ...rawData,
      shopify: enhancedShopify,
      total: {
        revenue: totalRevenue,
        units: totalUnits,
        cogs: totalCogs,
        adSpend: totalAdSpend,
        netProfit: totalNetProfit,
        netMargin: totalRevenue > 0 ? (totalNetProfit / totalRevenue) * 100 : 0,
        roas: totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0,
        amazonShare: totalRevenue > 0 ? (amzRev / totalRevenue) * 100 : 0,
        shopifyShare: totalRevenue > 0 ? (shopRev / totalRevenue) * 100 : 0,
      }
    };
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 lg:p-6">
        <div className="max-w-7xl mx-auto">{globalModals}
          {/* Edit Ad Spend Modal */}
          {showEditAdSpend && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-md w-full">
                <h2 className="text-xl font-bold text-white mb-2">Edit Ad Spend</h2>
                <p className="text-slate-400 text-sm mb-4">Week ending {new Date(selectedWeek+'T00:00:00').toLocaleDateString()}</p>
                
                <div className="space-y-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-blue-500"></span>Meta Ads (Facebook/Instagram)
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                      <input type="number" id="edit-ad-meta" defaultValue={editAdSpend.meta} placeholder="0.00" className="w-full bg-slate-900 border border-slate-600 rounded-xl pl-8 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-red-500"></span>Google Ads
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                      <input type="number" id="edit-ad-google" defaultValue={editAdSpend.google} placeholder="0.00" className="w-full bg-slate-900 border border-slate-600 rounded-xl pl-8 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                  </div>
                </div>
                
                {/* Total Summary */}
                <div className="bg-slate-900/50 rounded-xl p-3 mb-6">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Total Ad Spend</span>
                    <span className="text-white font-bold text-lg">{formatCurrency((parseFloat(editAdSpend.meta) || 0) + (parseFloat(editAdSpend.google) || 0))}</span>
                  </div>
                </div>
                
                <p className="text-slate-500 text-xs mb-4">💡 Tip: Amazon ad spend is included automatically from SKU Economics report</p>
                
                <div className="flex gap-3">
                  <button onClick={() => {
                    const meta = document.getElementById('edit-ad-meta')?.value || '0';
                    const google = document.getElementById('edit-ad-google')?.value || '0';
                    updateWeekAdSpend(selectedWeek, meta, google);
                  }} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 rounded-xl">Save</button>
                  <button onClick={() => setShowEditAdSpend(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-xl">Cancel</button>
                </div>
              </div>
            </div>
          )}
          {/* Edit 3PL Costs Modal */}
          {showEdit3PL && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-md w-full">
                <h2 className="text-xl font-bold text-white mb-4">Edit 3PL / Fulfillment Costs</h2>
                <p className="text-slate-400 text-sm mb-4">Week ending {new Date(selectedWeek+'T00:00:00').toLocaleDateString()}</p>
                
                {/* Option 1: Upload 3PL File */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Option 1: Upload 3PL Invoice</label>
                  <div className={`relative border-2 border-dashed rounded-xl p-4 ${reprocessFiles.threepl ? 'border-teal-400 bg-teal-950/30' : 'border-slate-600 bg-slate-800/30'}`}>
                    <input type="file" accept=".csv" onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const parsed = parseCSV(ev.target.result);
                          setReprocessFiles(p => ({ ...p, threepl: parsed }));
                          setReprocessFileNames(p => ({ ...p, threepl: file.name }));
                          // Auto-calculate cost from file
                          const threeplData = parse3PLData(parsed);
                          setEdit3PLCost(threeplData.metrics.totalCost.toString());
                        };
                        reader.readAsText(file);
                      }
                    }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    <div className="flex flex-col items-center gap-2">
                      {reprocessFiles.threepl ? <Check className="w-6 h-6 text-teal-400" /> : <Upload className="w-6 h-6 text-slate-400" />}
                      <span className={reprocessFiles.threepl ? 'text-teal-400 text-sm' : 'text-slate-400 text-sm'}>
                        {reprocessFileNames.threepl || 'Click to upload 3PL CSV'}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-slate-700" />
                  <span className="text-slate-500 text-sm">OR</span>
                  <div className="flex-1 h-px bg-slate-700" />
                </div>
                
                {/* Option 2: Enter Amount Manually */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Option 2: Enter Total Manually</label>
                  <input type="number" id="edit-3pl-cost" defaultValue={edit3PLCost} placeholder="0.00" className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  <p className="text-slate-500 text-xs mt-2">Total fulfillment costs (shipping, pick & pack, storage, etc.)</p>
                </div>
                
                <div className="flex gap-3">
                  <button onClick={() => {
                    const cost = document.getElementById('edit-3pl-cost')?.value || '0';
                    updateWeek3PL(selectedWeek, cost);
                    setReprocessFiles(p => ({ ...p, threepl: null }));
                    setReprocessFileNames(p => ({ ...p, threepl: '' }));
                  }} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 rounded-xl">Save</button>
                  <button onClick={() => {
                    setShowEdit3PL(false);
                    setReprocessFiles(p => ({ ...p, threepl: null }));
                    setReprocessFileNames(p => ({ ...p, threepl: '' }));
                  }} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-xl">Cancel</button>
                </div>
              </div>
            </div>
          )}
          {/* Reprocess Modal */}
          {showReprocess && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold text-white mb-2">Re-process Week</h2>
                <p className="text-slate-400 text-sm mb-4">Week ending {new Date(selectedWeek+'T00:00:00').toLocaleDateString()} - Upload files to add SKU detail</p>
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Amazon Report <span className="text-rose-400">*</span></label>
                    <div className={`relative border-2 border-dashed rounded-xl p-3 ${reprocessFiles.amazon ? 'border-emerald-400 bg-emerald-950/30' : 'border-slate-600 bg-slate-800/30'}`}>
                      <input type="file" accept=".csv" onChange={(e) => handleReprocessFile('amazon', e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                      <div className="flex items-center gap-2">
                        {reprocessFiles.amazon ? <Check className="w-4 h-4 text-emerald-400" /> : <FileSpreadsheet className="w-4 h-4 text-slate-400" />}
                        <span className={reprocessFiles.amazon ? 'text-emerald-400 text-sm' : 'text-slate-400 text-sm'}>{reprocessFileNames.amazon || 'Click to upload'}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Shopify Sales <span className="text-rose-400">*</span></label>
                    <div className={`relative border-2 border-dashed rounded-xl p-3 ${reprocessFiles.shopify ? 'border-emerald-400 bg-emerald-950/30' : 'border-slate-600 bg-slate-800/30'}`}>
                      <input type="file" accept=".csv" onChange={(e) => handleReprocessFile('shopify', e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                      <div className="flex items-center gap-2">
                        {reprocessFiles.shopify ? <Check className="w-4 h-4 text-emerald-400" /> : <FileSpreadsheet className="w-4 h-4 text-slate-400" />}
                        <span className={reprocessFiles.shopify ? 'text-emerald-400 text-sm' : 'text-slate-400 text-sm'}>{reprocessFileNames.shopify || 'Click to upload'}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">3PL Costs (Optional)</label>
                    <div className={`relative border-2 border-dashed rounded-xl p-3 ${reprocessFiles.threepl ? 'border-emerald-400 bg-emerald-950/30' : 'border-slate-600 bg-slate-800/30'}`}>
                      <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => handleReprocessFile('threepl', e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                      <div className="flex items-center gap-2">
                        {reprocessFiles.threepl ? <Check className="w-4 h-4 text-emerald-400" /> : <FileSpreadsheet className="w-4 h-4 text-slate-400" />}
                        <span className={reprocessFiles.threepl ? 'text-emerald-400 text-sm' : 'text-slate-400 text-sm'}>{reprocessFileNames.threepl || 'Click to upload (.csv or .xlsx)'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm text-slate-400 mb-2">Meta Ads</label><input type="number" id="reprocess-meta-ad" defaultValue={reprocessAdSpend.meta} placeholder="0.00" className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-violet-500" /></div>
                    <div><label className="block text-sm text-slate-400 mb-2">Google Ads</label><input type="number" id="reprocess-google-ad" defaultValue={reprocessAdSpend.google} placeholder="0.00" className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-violet-500" /></div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => {
                    const meta = document.getElementById('reprocess-meta-ad')?.value || '';
                    const google = document.getElementById('reprocess-google-ad')?.value || '';
                    setReprocessAdSpend({ meta, google });
                    setTimeout(() => reprocessWeek(selectedWeek), 10);
                  }} disabled={!reprocessFiles.amazon || !reprocessFiles.shopify} className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 text-white font-semibold py-2 rounded-xl">Re-process</button>
                  <button onClick={() => { setShowReprocess(false); setReprocessFiles({ amazon: null, shopify: null, threepl: null }); setReprocessFileNames({ amazon: '', shopify: '', threepl: '' }); setReprocessAdSpend({ meta: '', google: '' }); }} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-xl">Cancel</button>
                </div>
              </div>
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              {storeLogo && (
                <img src={storeLogo} alt="Store logo" className="w-12 h-12 object-contain rounded-xl bg-white p-1.5" />
              )}
              <div><h1 className="text-2xl lg:text-3xl font-bold text-white">{storeName ? storeName + ' Dashboard' : 'Weekly Performance'}</h1><p className="text-slate-400">Week ending {new Date(selectedWeek+'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p></div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setReprocessAdSpend({ meta: data.shopify.metaSpend || '', google: data.shopify.googleSpend || '' }); setShowReprocess(true); }} className="bg-violet-900/50 hover:bg-violet-800/50 border border-violet-600/50 text-violet-300 px-3 py-2 rounded-lg text-sm flex items-center gap-1"><RefreshCw className="w-4 h-4" />Re-process</button>
              <button onClick={() => { setEditAdSpend({ meta: data.shopify.metaSpend || '', google: data.shopify.googleSpend || '' }); setShowEditAdSpend(true); }} className="bg-blue-900/50 hover:bg-blue-800/50 border border-blue-600/50 text-blue-300 px-3 py-2 rounded-lg text-sm flex items-center gap-1"><DollarSign className="w-4 h-4" />Edit Ads</button>
              <button onClick={() => { setEdit3PLCost(data.shopify?.threeplCosts?.toString() || ''); setShowEdit3PL(true); }} className="bg-teal-900/50 hover:bg-teal-800/50 border border-teal-600/50 text-teal-300 px-3 py-2 rounded-lg text-sm flex items-center gap-1"><Truck className="w-4 h-4" />Edit 3PL</button>
              <button onClick={() => deleteWeek(selectedWeek)} className="bg-rose-900/50 hover:bg-rose-800/50 border border-rose-600/50 text-rose-300 px-3 py-2 rounded-lg text-sm"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
          <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />
          <div className="flex items-center gap-4 mb-6">
            <button onClick={() => idx < weeks.length - 1 && setSelectedWeek(weeks[idx + 1])} disabled={idx >= weeks.length - 1} className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg"><ChevronLeft className="w-5 h-5" /></button>
            <select value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)} className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white">{weeks.map(w => <option key={w} value={w}>{new Date(w+'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</option>)}</select>
            <button onClick={() => idx > 0 && setSelectedWeek(weeks[idx - 1])} disabled={idx <= 0} className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg"><ChevronRight className="w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <MetricCard label="Total Revenue" value={formatCurrency(data.total.revenue)} icon={DollarSign} color="emerald" />
            <MetricCard label="Total Units" value={formatNumber(data.total.units)} icon={Package} color="blue" />
            <MetricCard label="Net Profit" value={formatCurrency(data.total.netProfit)} sub={`${formatPercent(data.total.netMargin)} margin`} icon={TrendingUp} color={data.total.netProfit >= 0 ? 'emerald' : 'rose'} />
            <MetricCard label="Ad Spend" value={formatCurrency(data.total.adSpend)} sub={`${(data.total.roas || 0).toFixed(2)}x TACOS`} icon={BarChart3} color="violet" />
            <MetricCard label="COGS" value={formatCurrency(data.total.cogs)} icon={ShoppingCart} color="amber" />
          </div>
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5 mb-8">
            <h3 className="text-sm font-semibold text-slate-400 uppercase mb-4">Revenue by Channel</h3>
            <div className="h-4 bg-slate-700 rounded-full overflow-hidden flex mb-3"><div className="bg-orange-500 h-full" style={{ width: `${data.total.amazonShare}%` }} /><div className="bg-blue-500 h-full" style={{ width: `${data.total.shopifyShare}%` }} /></div>
            <div className="flex justify-between text-sm"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-orange-500" /><span className="text-slate-300">Amazon</span><span className="text-white font-semibold">{formatPercent(data.total.amazonShare)}</span></div><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500" /><span className="text-slate-300">Shopify</span><span className="text-white font-semibold">{formatPercent(data.total.shopifyShare)}</span></div></div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><ChannelCard title="Amazon" color="orange" data={data.amazon} isAmz showSkuTable /><ChannelCard title="Shopify" color="blue" data={data.shopify} showSkuTable /></div>


{/* Google/Meta Ads Details (Weekly) */}
{(() => {
  const googleSpendW = data.shopify?.googleSpend || 0;
  const metaSpendW = data.shopify?.metaSpend || 0;
  const m = data.shopify?.adsMetrics || {};
  const googleImpressionsW = m.googleImpressions || 0;
  const googleClicksW = m.googleClicks || 0;
  const googleConversionsW = m.googleConversions || 0;
  const metaImpressionsW = m.metaImpressions || 0;
  const metaClicksW = m.metaClicks || 0;
  const metaPurchasesW = m.metaPurchases || 0;
  const metaPurchaseValueW = m.metaPurchaseValue || 0;

  const showGoogle = googleSpendW > 0 || googleImpressionsW > 0 || googleClicksW > 0 || googleConversionsW > 0;
  const showMeta = metaSpendW > 0 || metaImpressionsW > 0 || metaClicksW > 0 || metaPurchasesW > 0;

  if (!showGoogle && !showMeta) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      {/* Google Ads */}
      {showGoogle && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-2xl p-5">
          <h3 className="text-lg font-semibold text-red-400 mb-4">Google Ads</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div><p className="text-slate-400 text-xs mb-1">Spend</p><p className="text-white text-lg font-semibold">{formatCurrency(googleSpendW)}</p></div>
            <div><p className="text-slate-400 text-xs mb-1">Clicks</p><p className="text-white text-lg font-semibold">{formatNumber(googleClicksW)}</p></div>
            <div><p className="text-slate-400 text-xs mb-1">Impressions</p><p className="text-white text-lg font-semibold">{formatNumber(googleImpressionsW)}</p></div>
            <div><p className="text-slate-400 text-xs mb-1">Conversions</p><p className="text-white text-lg font-semibold">{formatNumber(googleConversionsW)}</p></div>
            <div><p className="text-slate-400 text-xs mb-1">CTR</p><p className="text-white text-lg font-semibold">{(m.googleCTR || 0).toFixed(2)}%</p></div>
            <div><p className="text-slate-400 text-xs mb-1">CPC</p><p className="text-white text-lg font-semibold">{formatCurrency(m.googleCPC || 0)}</p></div>
            <div><p className="text-slate-400 text-xs mb-1">CPA</p><p className="text-white text-lg font-semibold">{formatCurrency(m.googleCostPerConv || 0)}</p></div>
          </div>
        </div>
      )}

      {/* Meta Ads */}
      {showMeta && (
        <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-2xl p-5">
          <h3 className="text-lg font-semibold text-indigo-300 mb-4">Meta Ads</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div><p className="text-slate-400 text-xs mb-1">Spend</p><p className="text-white text-lg font-semibold">{formatCurrency(metaSpendW)}</p></div>
            <div><p className="text-slate-400 text-xs mb-1">Clicks</p><p className="text-white text-lg font-semibold">{formatNumber(metaClicksW)}</p></div>
            <div><p className="text-slate-400 text-xs mb-1">Impressions</p><p className="text-white text-lg font-semibold">{formatNumber(metaImpressionsW)}</p></div>
            <div><p className="text-slate-400 text-xs mb-1">Purchases</p><p className="text-white text-lg font-semibold">{formatNumber(metaPurchasesW)}</p></div>
            <div><p className="text-slate-400 text-xs mb-1">CTR</p><p className="text-white text-lg font-semibold">{(m.metaCTR || 0).toFixed(2)}%</p></div>
            <div><p className="text-slate-400 text-xs mb-1">CPC</p><p className="text-white text-lg font-semibold">{formatCurrency(m.metaCPC || 0)}</p></div>
            <div><p className="text-slate-400 text-xs mb-1">ROAS</p><p className="text-white text-lg font-semibold">{(m.metaROAS || 0).toFixed(2)}</p></div>
            <div><p className="text-slate-400 text-xs mb-1">Purchase Value</p><p className="text-white text-lg font-semibold">{formatCurrency(metaPurchaseValueW)}</p></div>
          </div>
        </div>
      )}
    </div>
  );
})()}

          {/* Week Notes */}
          <div className="mt-6 bg-slate-800/50 rounded-2xl border border-slate-700 p-5">
            <h3 className="text-sm font-semibold text-slate-400 uppercase mb-3 flex items-center gap-2"><StickyNote className="w-4 h-4" />Week Notes</h3>
            <WeekNoteEditor weekKey={selectedWeek} weekNotes={weekNotes} setWeekNotes={setWeekNotes} editingNote={editingNote} setEditingNote={setEditingNote} noteText={noteText} setNoteText={setNoteText} />
          </div>
        </div>
      </div>
    );

};

export default WeeklyView;
