import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  AlertCircle, AlertTriangle, Bell, Boxes, Brain, Calendar, CalendarRange, Check, ChevronDown, Clock, Database, DollarSign, Download, Edit, Eye, FileSpreadsheet, FileText, Globe, HelpCircle, Info, Link, List, Loader2, MoreHorizontal, Package, RefreshCw, Save, Search, Settings, ShoppingBag, ShoppingCart, Store, Trash2, TrendingUp, Truck, Upload, Zap
} from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/format';
import { parseCSV } from '../../utils/csv';
import { lsSet, PRODUCT_NAMES_KEY } from '../../utils/storage';
import NavTabs from '../ui/NavTabs';

const UploadView = ({
  adsIntelData,
  aggregateDailyToWeekly,
  allDaysData,
  allPeriodsData,
  allWeeksData,
  amazonBulkFiles,
  amazonBulkParsed,
  amazonBulkProcessing,
  amazonCredentials,
  amazonForecasts,
  appSettings,
  bankingData,
  bulkAdFiles,
  bulkAdParsed,
  bulkAdProcessing,
  current,
  dataStatus,
  dtcIntelData,
  exportAll,
  FileBox,
  fileNames,
  files,
  forecastAlerts,
  forecastCorrections,
  forecastMeta,
  getAmazonForecastComparison,
  getCogsCost,
  getCogsLookup,
  globalModals,
  handleAmazonBulkFiles,
  handlePeriodFile,
  hasDailySalesData,
  importData,
  invFiles,
  invHistory,
  invSnapshotDate,
  isProcessing,
  navDropdown,
  packiyoCredentials,
  parseBulkAdFile,
  periodAdSpend,
  periodFileNames,
  periodFiles,
  periodLabel,
  processAmazonBulkUpload,
  processAmazonForecast,
  processAndSaveCogs,
  processBulkAdUpload,
  processInventory,
  processPeriod,
  reportType,
  save,
  saveInv,
  savedCogs,
  savedProductNames,
  setAllDaysData,
  setAllWeeksData,
  setAmazonBulkFiles,
  setAmazonForecasts,
  setBulkAdFiles,
  setBulkAdParsed,
  setBulkAdProcessing,
  setFileNames,
  setFiles,
  setForecastCorrections,
  setForecastMeta,
  setInvHistory,
  setInvSnapshotDate,
  setNavDropdown,
  setPeriodAdSpend,
  setPeriodLabel,
  setSavedProductNames,
  setSelectedDay,
  setSelectedInvDate,
  setSelectedPeriod,
  setSelectedWeek,
  setShopifyCredentials,
  setShopifyInventoryPreview,
  setShopifyInventoryStatus,
  setShopifySmartSync,
  setShopifySyncPreview,
  setShopifySyncRange,
  setShopifySyncStatus,
  setShowAdsIntelUpload,
  setShowCogsManager,
  setShowDtcIntelUpload,
  setShowUploadHelp,
  setToast,
  setUploadTab,
  setView,
  shopifyCredentials,
  shopifyInventoryPreview,
  shopifyInventoryStatus,
  shopifySmartSync,
  shopifySyncPreview,
  shopifySyncRange,
  shopifySyncStatus,
  stores,
  toast,
  uploadTab,
  view,
  weekEnding,
}) => {
    const PeriodFileBox = ({ type, label, desc, req, multi }) => {
      const hasFile = multi ? (periodFiles[type]?.length > 0) : periodFiles[type];
      const fileName = multi ? (periodFileNames[type]?.join(', ') || '') : periodFileNames[type];
      return (
        <div className={`relative border-2 border-dashed rounded-xl p-4 transition-all ${hasFile ? 'border-emerald-500/50 bg-emerald-950/20' : 'border-slate-600 hover:border-slate-500 bg-slate-800/30'}`}>
          <input type="file" accept=".csv" onChange={(e) => handlePeriodFile(type, e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
          <div className="flex items-start gap-3">
            {hasFile ? <Check className="w-5 h-5 text-emerald-400 mt-0.5" /> : <FileSpreadsheet className="w-5 h-5 text-slate-400 mt-0.5" />}
            <div className="flex-1 min-w-0">
              <p className={`font-medium ${hasFile ? 'text-emerald-400' : 'text-white'}`}>{label}{req && <span className="text-rose-400 ml-1">*</span>}</p>
              <p className="text-slate-500 text-sm truncate">{hasFile ? fileName : desc}</p>
            </div>
          </div>
        </div>
      );
    };
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 lg:p-6">
        <div className="max-w-4xl mx-auto">{globalModals}
          
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 mb-4">
              <Upload className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">Upload Data</h1>
            <p className="text-slate-400 mb-3">Import your sales reports and track performance</p>
            <button onClick={() => setShowUploadHelp(true)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-300 flex items-center gap-2 mx-auto">
              <FileText className="w-4 h-4" />How to Get These Files
            </button>
          </div>
          
          <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />
          
          {/* Upload Type Tabs - Clearer naming */}
          <div className="flex gap-2 mb-6 p-1 bg-slate-800/50 rounded-xl overflow-x-auto">
            <button onClick={() => setUploadTab('amazon-bulk')} className={`flex-1 min-w-fit px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 ${uploadTab === 'amazon-bulk' ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-lg' : 'text-slate-300 hover:bg-slate-700'}`}>
              <Package className="w-5 h-5" />Daily Sales
            </button>
            <button onClick={() => setUploadTab('bulk-ads')} className={`flex-1 min-w-fit px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 ${uploadTab === 'bulk-ads' ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg' : 'text-slate-300 hover:bg-slate-700'}`}>
              <Brain className="w-5 h-5" />Amazon PPC
            </button>
            <button onClick={() => setUploadTab('dtc-ads')} className={`flex-1 min-w-fit px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 ${uploadTab === 'dtc-ads' ? 'bg-gradient-to-r from-blue-600 to-teal-600 text-white shadow-lg' : 'text-slate-300 hover:bg-slate-700'}`}>
              <Globe className="w-5 h-5" />DTC / Meta / Google
            </button>
            <button onClick={() => setUploadTab('inventory')} className={`flex-1 min-w-fit px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 ${uploadTab === 'inventory' ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg' : 'text-slate-300 hover:bg-slate-700'}`}>
              <Boxes className="w-5 h-5" />Inventory
            </button>
            <button onClick={() => setUploadTab('cogs')} className={`flex-1 min-w-fit px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 ${uploadTab === 'cogs' ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-lg' : 'text-slate-300 hover:bg-slate-700'}`}>
              <DollarSign className="w-5 h-5" />COGS
            </button>
            <button onClick={() => setUploadTab('more')} className={`flex-1 min-w-fit px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 ${['forecast', 'period', 'shopify-sync', 'other-ads'].includes(uploadTab) || uploadTab === 'more' ? 'bg-gradient-to-r from-slate-600 to-slate-700 text-white shadow-lg' : 'text-slate-300 hover:bg-slate-700'}`}>
              <MoreHorizontal className="w-5 h-5" />More
            </button>
          </div>
          
          {/* More options sub-tabs */}
          {['forecast', 'period', 'shopify-sync', 'other-ads', 'more'].includes(uploadTab) && (
            <div className="flex gap-2 mb-4 p-1 bg-slate-700/30 rounded-lg flex-wrap">
              <button onClick={() => setUploadTab('forecast')} className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${uploadTab === 'forecast' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                <LineChart className="w-4 h-4" />Amazon Forecast
              </button>
              <button onClick={() => setUploadTab('other-ads')} className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${uploadTab === 'other-ads' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                <TrendingUp className="w-4 h-4" />Google/Meta Ads
              </button>
              <button onClick={() => setUploadTab('period')} className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${uploadTab === 'period' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                <CalendarRange className="w-4 h-4" />Annual/Period
              </button>
              <button onClick={() => setUploadTab('shopify-sync')} className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${uploadTab === 'shopify-sync' ? 'bg-green-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                <ShoppingBag className="w-4 h-4" />Shopify Sync
              </button>
            </div>
          )}
          
          {/* ============ DATA STATUS DASHBOARD ============ */}
          <div className="mb-6 bg-gradient-to-r from-slate-800/80 to-slate-900/80 rounded-2xl border border-slate-700 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-violet-400" />
                Data Status Dashboard
              </h3>
              <div className="flex items-center gap-2">
                {dataStatus.learningStatus.active && (
                  <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400 flex items-center gap-1">
                    <Brain className="w-3 h-3" />AI Learning Active
                  </span>
                )}
                <span className="text-xs text-slate-500">
                  {dataStatus.dailyStatus.totalDays} days • {dataStatus.weeklyStatus.totalWeeks} weeks
                </span>
              </div>
            </div>
            
            {/* Action Items */}
            {dataStatus.nextActions.length > 0 && (
              <div className="mb-4 space-y-2">
                {dataStatus.nextActions.slice(0, 3).map((action, idx) => (
                  <div key={idx} className={`flex items-center gap-3 p-2 rounded-lg ${
                    action.priority === 'high' ? 'bg-rose-900/30 border border-rose-500/30' :
                    action.priority === 'medium' ? 'bg-amber-900/30 border border-amber-500/30' :
                    'bg-slate-700/30 border border-slate-600/30'
                  }`}>
                    {action.priority === 'high' ? <AlertCircle className="w-4 h-4 text-rose-400" /> :
                     action.priority === 'medium' ? <Clock className="w-4 h-4 text-amber-400" /> :
                     <Bell className="w-4 h-4 text-slate-400" />}
                    <span className={`text-sm flex-1 ${
                      action.priority === 'high' ? 'text-rose-300' :
                      action.priority === 'medium' ? 'text-amber-300' :
                      'text-slate-400'
                    }`}>{action.message}</span>
                    {action.action === 'upload-forecast' && (
                      <button onClick={() => { setUploadTab('forecast'); setView('upload'); }} className="text-xs px-2 py-1 bg-amber-600 hover:bg-amber-500 rounded text-white">Upload</button>
                    )}
                    {action.action === 'upload-daily' && (
                      <button onClick={() => { setUploadTab('amazon-bulk'); setView('upload'); }} className="text-xs px-2 py-1 bg-cyan-600 hover:bg-cyan-500 rounded text-white">Upload</button>
                    )}
                    {action.action === 'upload-weekly' && (
                      <button onClick={() => { setUploadTab('amazon-bulk'); setView('upload'); }} className="text-xs px-2 py-1 bg-violet-600 hover:bg-violet-500 rounded text-white">Upload</button>
                    )}
                    {action.action === 'aggregate-daily' && (
                      <button onClick={aggregateDailyToWeekly} className="text-xs px-2 py-1 bg-teal-600 hover:bg-teal-500 rounded text-white">Aggregate</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Forecast Status */}
              <div className="bg-slate-900/50 rounded-xl p-3">
                <h4 className="text-sm font-medium text-amber-400 mb-2 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />Forecasts
                </h4>
                <div className="space-y-2">
                  {Object.entries(dataStatus.forecastStatus).map(([key, f]) => (
                    <div key={key} className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">{f.type}</span>
                      <span className={`px-2 py-0.5 rounded ${
                        f.status === 'active' ? 'bg-green-500/20 text-green-400' :
                        f.status === 'expiring' ? 'bg-amber-500/20 text-amber-400' :
                        f.status === 'expired' ? 'bg-rose-500/20 text-rose-400' :
                        'bg-slate-600/50 text-slate-500'
                      }`}>
                        {f.status === 'active' ? `${f.daysUntilExpiry}d left` :
                         f.status === 'expiring' ? `${f.daysUntilExpiry}d left!` :
                         f.status === 'expired' ? 'Expired' :
                         'Not uploaded'}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {dataStatus.forecastWeeks.length} weeks with forecast data
                </p>
              </div>
              
              {/* Daily Data Status - Mini Calendar */}
              <div className="bg-slate-900/50 rounded-xl p-3">
                <h4 className="text-sm font-medium text-cyan-400 mb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4" />Daily Data (Last 14 Days)
                </h4>
                <div className="grid grid-cols-7 gap-1">
                  {dataStatus.dailyStatus.last14Days.map((day, idx) => (
                    <div 
                      key={idx}
                      className={`w-6 h-6 rounded flex items-center justify-center text-xs cursor-pointer transition-all ${
                        day.hasData ? 'bg-cyan-500/30 text-cyan-300 hover:bg-cyan-500/50' : day.hasAdsOnly ? 'bg-amber-500/20 text-amber-400/60' : 'bg-slate-700/50 text-slate-600 hover:bg-slate-600/50'
                      }`}
                      title={`${day.date}${day.hasData ? ' ✓' : day.hasAdsOnly ? ' (ads only)' : ' (no data)'}`}
                    >
                      {new Date(day.date + 'T12:00:00').getDate()}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {dataStatus.dailyStatus.totalDays} total days • {dataStatus.dataFlow.weeksFromDaily} weeks
                </p>
              </div>
              
              {/* Learning Status */}
              <div className="bg-slate-900/50 rounded-xl p-3">
                <h4 className="text-sm font-medium text-purple-400 mb-2 flex items-center gap-2">
                  <Brain className="w-4 h-4" />Self-Learning
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Status</span>
                    <span className={`px-2 py-0.5 rounded ${
                      dataStatus.learningStatus.active ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {dataStatus.learningStatus.active ? 'Active' : 'Training'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Confidence</span>
                    <span className="text-slate-300">{dataStatus.learningStatus.confidence.toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Samples</span>
                    <span className="text-slate-300">{dataStatus.learningStatus.samples} comparisons</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Pending</span>
                    <span className={dataStatus.learningStatus.pendingComparisons > 0 ? 'text-amber-400' : 'text-slate-500'}>
                      {dataStatus.learningStatus.pendingComparisons} awaiting actuals
                    </span>
                  </div>
                </div>
                <div className="mt-2">
                  <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all ${dataStatus.learningStatus.active ? 'bg-green-500' : 'bg-amber-500'}`}
                      style={{ width: `${Math.min(100, dataStatus.learningStatus.confidence)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Data Flow Explanation */}
            <div className="mt-4 pt-3 border-t border-slate-700/50">
              <p className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Daily</span>
                <span>→</span>
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Weekly ({dataStatus.weeklyStatus.totalWeeks})</span>
                <span>→</span>
                <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />Forecasts ({dataStatus.forecastWeeks.length})</span>
                <span>→</span>
                <span className="flex items-center gap-1"><Brain className="w-3 h-3" />Learning ({dataStatus.learningStatus.samples})</span>
                <span>→</span>
                <span className="flex items-center gap-1"><Boxes className="w-3 h-3" />Inventory</span>
                {dataStatus.learningStatus.active && (
                  <span className="ml-auto text-green-400 flex items-center gap-1">
                    <Check className="w-3 h-3" />Corrections Active!
                  </span>
                )}
              </p>
            </div>
          </div>
          {/* ============ END DATA STATUS DASHBOARD ============ */}
          
          {/* Period Upload */}
          {uploadTab === 'period' && (
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-white mb-1">Period Upload</h2>
              <p className="text-slate-400 text-sm mb-6">Upload monthly or yearly totals for historical tracking</p>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-2">Period Label <span className="text-rose-400">*</span></label>
                <input type="text" id="period-label-input" defaultValue={periodLabel} onBlur={(e) => setPeriodLabel(e.target.value)} placeholder="e.g., 2024, Q1 2025, January 2025" className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-violet-500" />
                <p className="text-slate-500 text-xs mt-1">Tip: Use "2024" or "2025" for YoY comparisons</p>
              </div>
              
              {/* Period Date Range Guide */}
              {periodLabel && (() => {
                // Try to determine date range from label
                let startDate = '', endDate = '', suggestion = '';
                const label = periodLabel.trim().toLowerCase();
                const currentYear = new Date().getFullYear();
                
                if (/^20\d{2}$/.test(periodLabel.trim())) {
                  // Full year like "2024"
                  startDate = `01/01/${periodLabel.trim()}`;
                  endDate = `12/31/${periodLabel.trim()}`;
                  suggestion = `Full year ${periodLabel.trim()}`;
                } else if (/q[1-4]\s*20\d{2}/i.test(label)) {
                  // Quarter like "Q1 2025"
                  const match = label.match(/q([1-4])\s*(20\d{2})/i);
                  if (match) {
                    const q = parseInt(match[1]);
                    const y = match[2];
                    const qStarts = ['01/01', '04/01', '07/01', '10/01'];
                    const qEnds = ['03/31', '06/30', '09/30', '12/31'];
                    startDate = `${qStarts[q-1]}/${y}`;
                    endDate = `${qEnds[q-1]}/${y}`;
                    suggestion = `Q${q} ${y}`;
                  }
                }
                
                if (startDate && endDate) {
                  return (
                    <div className="bg-teal-900/20 border border-teal-500/30 rounded-xl p-4 mb-6">
                      <h3 className="text-teal-300 font-semibold mb-3 flex items-center gap-2">
                        <CalendarRange className="w-4 h-4" />
                        Date Range for "{suggestion}"
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <p className="text-orange-400 font-medium mb-1">📦 Amazon SKU Economics</p>
                          <p className="text-white font-mono">{startDate} → {endDate}</p>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <p className="text-blue-400 font-medium mb-1">🛒 Shopify Sales by Product</p>
                          <p className="text-white font-mono">{startDate} → {endDate}</p>
                        </div>
                      </div>
                      <p className="text-slate-400 text-xs mt-3">Make sure both reports use the same date range</p>
                    </div>
                  );
                }
                return null;
              })()}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <PeriodFileBox type="amazon" label="Amazon Report" desc="Business Reports" req />
                <PeriodFileBox type="shopify" label="Shopify Sales" desc="Sales by product" req />
                <PeriodFileBox type="threepl" label="3PL Costs" desc="Fulfillment file (CSV or Excel)" multi />
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div><label className="block text-sm text-slate-400 mb-2">Meta Ad Spend</label><input type="number" id="period-meta-ad" defaultValue={periodAdSpend.meta} onBlur={(e) => setPeriodAdSpend(p => ({ ...p, meta: e.target.value }))} placeholder="0.00" className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-teal-500" /></div>
                <div><label className="block text-sm text-slate-400 mb-2">Google Ad Spend</label><input type="number" id="period-google-ad" defaultValue={periodAdSpend.google} onBlur={(e) => setPeriodAdSpend(p => ({ ...p, google: e.target.value }))} placeholder="0.00" className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-teal-500" /></div>
              </div>
              
              {!hasCogs && <div className="bg-amber-900/30 border border-amber-500/50 rounded-xl p-4 mb-6 flex items-start gap-3"><AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" /><div><p className="text-amber-300 font-medium">COGS not set up</p><p className="text-amber-200/70 text-sm">Upload a COGS file or configure in settings for profit tracking</p></div></div>}
              
              <button onClick={processPeriod} disabled={isProcessing || !periodFiles.amazon || !periodFiles.shopify || !periodLabel.trim() || !hasCogs} className="w-full bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2">{isProcessing ? <><Loader2 className="w-5 h-5 animate-spin" />Processing...</> : 'Save Period Data'}</button>
            </div>
          )}
          
          {/* Bulk Ads Upload */}
          {uploadTab === 'other-ads' && (
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-white mb-1">📊 Google & Meta Ad Spend Upload</h2>
              <p className="text-slate-400 text-sm mb-6">Upload historical ad spend from Google Ads or Meta Ads - platform is auto-detected</p>
              
              {/* Supported Formats Info */}
              <div className="bg-slate-900/50 rounded-xl p-4 mb-6">
                <p className="text-slate-300 text-sm mb-2 font-medium">Supported file formats:</p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="flex items-start gap-2">
                    <span className="text-red-400">🔴</span>
                    <div>
                      <p className="text-slate-300 font-medium">Google Ads</p>
                      <p className="text-slate-500">Day, Cost, Impressions, Clicks, Avg. CPC</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-blue-400">🔵</span>
                    <div>
                      <p className="text-slate-300 font-medium">Meta Ads</p>
                      <p className="text-slate-500">Date, Amount spent, Impressions, Link clicks</p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* File Upload */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-2">Upload CSV Files (select multiple, can mix Google & Meta)</label>
                <div 
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${bulkAdFiles.length > 0 ? 'border-emerald-500/50 bg-emerald-900/20' : 'border-slate-600 hover:border-slate-500'}`}
                  onClick={() => document.getElementById('bulk-ad-file')?.click()}
                >
                  <input 
                    type="file" 
                    id="bulk-ad-file" 
                    accept=".csv"
                    multiple
                    className="hidden" 
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length === 0) return;
                      
                      setBulkAdProcessing(true);
                      setBulkAdFiles([]);
                      setBulkAdParsed(null);
                      
                      // Parse all files - auto-detect platform
                      const parsedFiles = [];
                      let combinedDaily = [];
                      let combinedWeekly = [];
                      let combinedMonthly = [];
                      let totalSpend = 0;
                      let totalImpressions = 0;
                      let totalClicks = 0;
                      let totalConversions = 0;
                      let errors = [];
                      let detectedPlatforms = new Set();
                      
                      for (const file of files) {
                        const text = await file.text();
                        // Pass null for platform to auto-detect
                        const parsed = parseBulkAdFile(text, null, file.name);
                        
                        if (parsed.error) {
                          errors.push(`${file.name}: ${parsed.error}`);
                          continue;
                        }
                        
                        if (parsed.platform) detectedPlatforms.add(parsed.platform);
                        parsedFiles.push({ name: file.name, parsed, platform: parsed.platform });
                        
                        // Combine data
                        if (parsed.dailyData) combinedDaily.push(...parsed.dailyData);
                        if (parsed.weeklyData) combinedWeekly.push(...parsed.weeklyData);
                        if (parsed.monthlyData) combinedMonthly.push(...parsed.monthlyData);
                        totalSpend += parsed.totalSpend || 0;
                        totalImpressions += parsed.totalImpressions || 0;
                        totalClicks += parsed.totalClicks || 0;
                        totalConversions += parsed.totalConversions || 0;
                      }
                      
                      // Deduplicate daily data by date (keep latest)
                      const dailyMap = {};
                      combinedDaily.forEach(d => { if (!d.isMonthly) dailyMap[d.date] = d; });
                      const dedupedDaily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
                      
                      // Deduplicate weekly data by weekEnding (sum duplicates)
                      const weeklyMap = {};
                      combinedWeekly.forEach(w => {
                        if (!weeklyMap[w.weekEnding]) {
                          weeklyMap[w.weekEnding] = { ...w };
                        }
                        // Don't sum - just keep latest (they should be the same)
                      });
                      const dedupedWeekly = Object.values(weeklyMap).sort((a, b) => a.weekEnding.localeCompare(b.weekEnding));
                      
                      // Deduplicate monthly data by periodLabel
                      const monthlyMap = {};
                      combinedMonthly.forEach(m => { monthlyMap[m.periodLabel] = m; });
                      const dedupedMonthly = Object.values(monthlyMap).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
                      
                      setBulkAdFiles(parsedFiles);
                      
                      // Create combined parsed result
                      const dateRange = dedupedDaily.length > 0
                        ? `${new Date(dedupedDaily[0].date + 'T00:00:00').toLocaleDateString()} - ${new Date(dedupedDaily[dedupedDaily.length - 1].date + 'T00:00:00').toLocaleDateString()}`
                        : dedupedMonthly.length > 0
                        ? `${dedupedMonthly[0].periodLabel} - ${dedupedMonthly[dedupedMonthly.length - 1].periodLabel}`
                        : '';
                      
                      const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
                      const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
                      const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
                      
                      setBulkAdParsed({
                        dailyData: dedupedDaily,
                        weeklyData: dedupedWeekly,
                        monthlyData: dedupedMonthly,
                        isMonthlyData: dedupedDaily.length === 0 && dedupedMonthly.length > 0,
                        totalSpend,
                        totalImpressions,
                        totalClicks,
                        totalConversions,
                        avgCpc,
                        avgCpa,
                        avgCtr,
                        dateRange,
                        fileCount: parsedFiles.length,
                        errors: errors.length > 0 ? errors : null,
                        platforms: [...detectedPlatforms],
                        parsedFiles,
                        weeksWithExistingData: dedupedWeekly.filter(w => allWeeksData[w.weekEnding]).length,
                        monthsWithExistingData: dedupedMonthly.filter(m => allPeriodsData[m.periodLabel]).length,
                      });
                      
                      setBulkAdProcessing(false);
                      e.target.value = ''; // Reset input to allow re-selecting same files
                    }}
                  />
                  {bulkAdProcessing ? (
                    <div>
                      <RefreshCw className="w-8 h-8 text-blue-400 mx-auto mb-2 animate-spin" />
                      <p className="text-blue-400 font-medium">Processing files...</p>
                    </div>
                  ) : bulkAdFiles.length > 0 ? (
                    <div>
                      <Check className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                      <p className="text-emerald-400 font-medium">{bulkAdFiles.length} file{bulkAdFiles.length > 1 ? 's' : ''} loaded</p>
                      <p className="text-slate-400 text-xs mt-1 max-w-md mx-auto truncate">{bulkAdFiles.map(f => f.name).join(', ')}</p>
                      <p className="text-slate-500 text-sm mt-1">Click to change files</p>
                    </div>
                  ) : (
                    <div>
                      <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                      <p className="text-slate-400">Click to upload Google or Meta Ads CSV files</p>
                      <p className="text-slate-500 text-sm mt-1">Platform auto-detected • Can mix Google & Meta files</p>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Files list with detected platforms */}
              {bulkAdFiles.length > 0 && !bulkAdParsed && (
                <div className="mb-4 space-y-2">
                  {bulkAdFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 bg-slate-900/50 rounded-lg p-2">
                      <span className={f.platform === 'google' ? 'text-red-400' : f.platform === 'meta' ? 'text-blue-400' : 'text-slate-400'}>
                        {f.platform === 'google' ? '🔴' : f.platform === 'meta' ? '🔵' : '📄'}
                      </span>
                      <span className="text-white text-sm flex-1 truncate">{f.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${f.platform === 'google' ? 'bg-red-900/30 text-red-400' : f.platform === 'meta' ? 'bg-blue-900/30 text-blue-400' : 'bg-slate-700 text-slate-400'}`}>
                        {f.platform === 'google' ? 'Google' : f.platform === 'meta' ? 'Meta' : 'Unknown'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Parse Preview */}
              {bulkAdParsed && (
                <div className="mb-6">
                  <div className={`rounded-xl p-4 ${bulkAdParsed.error ? 'bg-rose-900/30 border border-rose-500/50' : 'bg-emerald-900/20 border border-emerald-500/30'}`}>
                    {bulkAdParsed.error ? (
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
                        <div>
                          <p className="text-rose-400 font-medium">Parse Error</p>
                          <p className="text-rose-300/70 text-sm">{bulkAdParsed.error}</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Check className="w-5 h-5 text-emerald-400" />
                            <span className="text-emerald-400 font-medium">Parsed Successfully</span>
                            {bulkAdParsed.fileCount > 1 && (
                              <span className="text-emerald-400/70 text-sm">({bulkAdParsed.fileCount} files)</span>
                            )}
                          </div>
                          <span className="text-slate-400 text-sm">
                            {bulkAdParsed.dailyData?.length || 0} days, {bulkAdParsed.weeklyData?.length || 0} weeks
                            {bulkAdParsed.monthlyData?.length > 0 && `, ${bulkAdParsed.monthlyData.length} periods`}
                          </span>
                        </div>
                        
                        {/* Show errors if any files failed */}
                        {bulkAdParsed.errors && bulkAdParsed.errors.length > 0 && (
                          <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3 mb-3">
                            <p className="text-amber-400 text-sm font-medium mb-1">⚠️ Some files had issues:</p>
                            <ul className="text-amber-300/70 text-xs space-y-0.5">
                              {bulkAdParsed.errors.map((err, i) => (
                                <li key={i}>{err}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {/* KPI Summary Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                          <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                            <p className="text-slate-500 text-xs">Total Spend</p>
                            <p className="text-white font-bold">{formatCurrency(bulkAdParsed.totalSpend || 0)}</p>
                          </div>
                          <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                            <p className="text-slate-500 text-xs">Impressions</p>
                            <p className="text-white font-bold">{formatNumber(bulkAdParsed.totalImpressions || 0)}</p>
                          </div>
                          <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                            <p className="text-slate-500 text-xs">Clicks</p>
                            <p className="text-white font-bold">{formatNumber(bulkAdParsed.totalClicks || 0)}</p>
                          </div>
                          <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                            <p className="text-slate-500 text-xs">Conversions</p>
                            <p className="text-white font-bold">{formatNumber(bulkAdParsed.totalConversions || 0)}</p>
                          </div>
                        </div>
                        
                        {/* Performance Metrics */}
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                            <p className="text-slate-500 text-xs">Avg CPC</p>
                            <p className={`font-bold ${(bulkAdParsed.avgCpc || 0) < 2 ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {formatCurrency(bulkAdParsed.avgCpc || 0)}
                            </p>
                          </div>
                          <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                            <p className="text-slate-500 text-xs">Avg CPA</p>
                            <p className={`font-bold ${(bulkAdParsed.avgCpa || 0) < 30 ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {formatCurrency(bulkAdParsed.avgCpa || 0)}
                            </p>
                          </div>
                          <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                            <p className="text-slate-500 text-xs">CTR</p>
                            <p className={`font-bold ${(bulkAdParsed.avgCtr || 0) > 2 ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {(bulkAdParsed.avgCtr || 0).toFixed(2)}%
                            </p>
                          </div>
                        </div>
                        
                        {/* Summary by week or month */}
                        <div className="bg-slate-900/50 rounded-lg p-3 mb-3">
                          <p className="text-slate-400 text-xs uppercase mb-2">
                            {bulkAdParsed.isMonthlyData ? 'Monthly Data Preview' : 'Weekly Aggregation Preview'}
                          </p>
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {bulkAdParsed.isMonthlyData ? (
                              bulkAdParsed.monthlyData?.map(m => {
                                // Check if weekly data exists for this month
                                const monthMatch = m.periodLabel.match(/^(\w{3})\s+(\d{4})$/);
                                let hasWeeklyData = false;
                                if (monthMatch) {
                                  const monthNames = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
                                  const monthNum = monthNames[monthMatch[1].toLowerCase()];
                                  const year = parseInt(monthMatch[2]);
                                  hasWeeklyData = Object.keys(allWeeksData).some(weekKey => {
                                    const weekDate = new Date(weekKey + 'T00:00:00');
                                    return weekDate.getFullYear() === year && weekDate.getMonth() + 1 === monthNum;
                                  });
                                }
                                return (
                                  <div key={m.periodLabel} className={`flex items-center justify-between text-sm ${hasWeeklyData ? 'opacity-50' : ''}`}>
                                    <div className="flex items-center gap-2">
                                      <span className="text-white">{m.periodLabel}</span>
                                      {hasWeeklyData ? (
                                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-400">has weekly data</span>
                                      ) : allPeriodsData[m.periodLabel] ? (
                                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">exists</span>
                                      ) : null}
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="text-slate-400 text-xs">{formatNumber(m.clicks || 0)} clicks</span>
                                      <span className={`font-medium ${hasWeeklyData ? 'text-slate-500 line-through' : m.platform === 'google' ? 'text-red-400' : 'text-blue-400'}`}>{formatCurrency(m.spend)}</span>
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              bulkAdParsed.weeklyData?.map(w => (
                                <div key={w.weekEnding} className="flex items-center justify-between text-sm">
                                  <div className="flex items-center gap-2">
                                    <span className="text-white">Week ending {new Date(w.weekEnding + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                    {allWeeksData[w.weekEnding] && (
                                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">exists</span>
                                    )}
                                    {w.platform && (
                                      <span className={`text-xs px-1.5 py-0.5 rounded ${w.platform === 'google' ? 'bg-red-900/30 text-red-400' : 'bg-blue-900/30 text-blue-400'}`}>
                                        {w.platform === 'google' ? 'Google' : 'Meta'}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-slate-400 text-xs">{formatNumber(w.clicks || 0)} clicks</span>
                                    <span className={`font-medium ${w.platform === 'google' ? 'text-red-400' : 'text-blue-400'}`}>{formatCurrency(w.spend)}</span>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between text-sm mt-1">
                          <span className="text-slate-400">Date range:</span>
                          <span className="text-slate-300">{bulkAdParsed.dateRange}</span>
                        </div>
                        
                        {bulkAdParsed.isMonthlyData && bulkAdParsed.monthsWithExistingData > 0 && (
                          <p className="text-amber-400 text-xs mt-3 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            {bulkAdParsed.monthsWithExistingData} month(s) have existing data — will be updated
                          </p>
                        )}
                        {!bulkAdParsed.isMonthlyData && bulkAdParsed.weeksWithExistingData > 0 && (
                          <p className="text-amber-400 text-xs mt-3 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            {bulkAdParsed.weeksWithExistingData} week(s) have existing data — will be updated
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
              
              {/* How it works */}
              <div className="bg-slate-900/50 rounded-xl p-4 mb-6">
                <h3 className="text-slate-300 font-medium mb-2 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4" />How it works
                </h3>
                <ul className="text-slate-400 text-sm space-y-1">
                  <li>• Daily ad spend is aggregated into weeks (ending Sunday)</li>
                  <li>• Monthly ad data is stored by period (e.g., "Apr 2024")</li>
                  <li>• Existing ad spend for same platform will be overwritten (not duplicated)</li>
                  <li>• If no data exists for that period, it will be created</li>
                </ul>
              </div>
              
              <button 
                onClick={() => processBulkAdUpload(bulkAdParsed, null)} 
                disabled={isProcessing || !bulkAdParsed || bulkAdParsed.error || (!bulkAdParsed.weeklyData?.length && !bulkAdParsed.monthlyData?.length)} 
                className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold py-4 rounded-xl"
              >
                {isProcessing ? 'Processing...' : bulkAdParsed?.isMonthlyData 
                  ? `Update ${bulkAdParsed?.monthlyData?.length || 0} Month(s) with Ad Spend`
                  : `Update ${bulkAdParsed?.weeklyData?.length || 0} Week(s) with ${bulkAdParsed?.platforms?.length === 2 ? 'Google & Meta' : bulkAdParsed?.platforms?.[0] === 'google' ? 'Google' : 'Meta'} Ad Spend`
                }
              </button>
            </div>
          )}
          
          {/* Amazon Ads Intel - PRIMARY content of Amazon PPC tab */}
          {uploadTab === 'bulk-ads' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-violet-900/30 to-indigo-900/30 rounded-2xl border border-violet-500/30 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">🧠 Amazon PPC Intelligence</h2>
                    <p className="text-slate-400 text-sm">Upload search terms, placements, targeting, business reports & daily performance for AI-powered optimization</p>
                  </div>
                  {adsIntelData?.lastUpdated && (
                    <span className="text-xs text-emerald-400 bg-emerald-900/30 px-3 py-1 rounded-full">✓ Data loaded {new Date(adsIntelData.lastUpdated).toLocaleDateString()}</span>
                  )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4 text-xs text-slate-400">
                <span>• SP/SB/SD Search Terms</span>
                <span>• Placement Reports</span>
                <span>• Targeting Reports</span>
                <span>• Business Reports</span>
                <span>• Daily Overview (27d)</span>
                <span>• Historical Daily (552d)</span>
                <span>• Organic Search Queries</span>
                <span>• Advertised ASINs</span>
                <span>• SD Campaign Reports</span>
              </div>
              <button onClick={() => setShowAdsIntelUpload(true)} className="w-full px-6 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-xl text-white font-medium flex items-center justify-center gap-2 shadow-lg shadow-violet-500/20">
                <Brain className="w-5 h-5" />Upload Amazon PPC Reports
              </button>
              {adsIntelData?.lastUpdated && (
                <button onClick={() => { setShowAdsIntelUpload(true); setTimeout(() => { window.__adsIntelAutoReport = true; }, 100); }} className="w-full px-6 py-3 bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 rounded-xl text-white font-medium flex items-center justify-center gap-2 shadow-lg shadow-rose-500/20">
                  🔬 Generate Action Report from Existing Data
                </button>
              )}
              </div>
              
              {/* What data goes where - helpful guide */}
              <div className="bg-slate-800/30 rounded-xl border border-slate-700 p-4">
                <p className="text-sm text-slate-300 font-medium mb-2">📋 Quick Guide: Amazon Report Types</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-start gap-2">
                    <span className="text-violet-400">→</span>
                    <div>
                      <p className="text-white font-medium">Amazon PPC (upload here)</p>
                      <p className="text-slate-500">Search terms, placements, targeting, campaign performance</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-orange-400">→</span>
                    <div>
                      <p className="text-white font-medium">Daily Sales tab</p>
                      <p className="text-slate-500">SKU Economics, Payments reports (actual sales & fees)</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-amber-400">→</span>
                    <div>
                      <p className="text-white font-medium">More → Amazon Forecast</p>
                      <p className="text-slate-500">Amazon's projected sales for forecast comparison</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-blue-400">→</span>
                    <div>
                      <p className="text-white font-medium">More → Google/Meta Ads</p>
                      <p className="text-slate-500">Fill in historical ad spend from other platforms</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* DTC Ads - Dedicated tab */}
          {uploadTab === 'dtc-ads' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-blue-900/30 to-teal-900/30 rounded-2xl border border-blue-500/30 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">🌐 DTC Ads Intelligence</h2>
                    <p className="text-slate-400 text-sm">Upload Meta, Google, Amazon SQP & Shopify reports for cross-channel AI analysis</p>
                  </div>
                  {dtcIntelData?.lastUpdated && (
                    <span className="text-xs text-emerald-400 bg-emerald-900/30 px-3 py-1 rounded-full">✓ Data loaded {new Date(dtcIntelData.lastUpdated).toLocaleDateString()}</span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 text-xs text-slate-400">
                  <span>• Meta Campaigns</span>
                  <span>• Meta Ad Sets</span>
                  <span>• Meta Ads (Creative)</span>
                  <span>• Meta Demographics</span>
                  <span>• Google Campaigns</span>
                  <span>• Google Search Terms</span>
                  <span>• Google Keywords</span>
                  <span>• Google PMax Assets</span>
                  <span>• Amazon Search Query</span>
                  <span>• Shopify Sales</span>
                  <span>• Shopify Sessions</span>
                  <span>• Shopify Conversion</span>
                </div>
                <button onClick={() => setShowDtcIntelUpload(true)} className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-500 hover:to-teal-500 rounded-xl text-white font-medium flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20">
                  <TrendingUp className="w-5 h-5" />Upload DTC Reports
                </button>
                {dtcIntelData?.lastUpdated && (
                  <button onClick={() => setShowDtcIntelUpload(true)} className="w-full mt-2 px-6 py-3 bg-gradient-to-r from-blue-700/60 to-teal-700/60 hover:from-blue-600 hover:to-teal-600 rounded-xl text-white font-medium flex items-center justify-center gap-2">
                    🔬 Generate DTC Action Report
                  </button>
                )}
              </div>
              
              {/* Quick guide for DTC */}
              <div className="bg-slate-800/30 rounded-xl border border-slate-700 p-4">
                <p className="text-sm text-slate-300 font-medium mb-2">📋 Where to find these files</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-start gap-2">
                    <span className="text-purple-400">🟣</span>
                    <div>
                      <p className="text-white font-medium">Meta Ads Manager</p>
                      <p className="text-slate-500">Ads Manager → Campaigns/Ad Sets/Ads → Export → XLSX</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-blue-400">🔵</span>
                    <div>
                      <p className="text-white font-medium">Google Ads</p>
                      <p className="text-slate-500">Campaigns/Keywords/Search Terms → Download → XLSX</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-400">🟢</span>
                    <div>
                      <p className="text-white font-medium">Shopify Analytics</p>
                      <p className="text-slate-500">Analytics → Reports → Export CSV (Sales, Sessions, AOV)</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-orange-400">🟠</span>
                    <div>
                      <p className="text-white font-medium">Amazon Brand Analytics</p>
                      <p className="text-slate-500">Brand Analytics → Search Query Performance → Download</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Inventory Upload */}
          {uploadTab === 'inventory' && (
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-white mb-1">Inventory Sources</h2>
              <p className="text-slate-400 text-sm mb-6">Your inventory is synced from connected APIs. File upload is only needed as a fallback.</p>
              
              {/* API Status Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* Amazon FBA/AWD */}
                <div className={`rounded-xl p-4 border ${amazonCredentials.connected ? 'bg-orange-900/20 border-orange-500/30' : 'bg-slate-700/30 border-slate-600/50'}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${amazonCredentials.connected ? 'bg-orange-500/20' : 'bg-slate-600/50'}`}>
                      <ShoppingCart className={`w-5 h-5 ${amazonCredentials.connected ? 'text-orange-400' : 'text-slate-400'}`} />
                    </div>
                    <div>
                      <p className="text-white font-medium">Amazon FBA + AWD</p>
                      <p className={`text-xs ${amazonCredentials.connected ? 'text-orange-400' : 'text-slate-500'}`}>
                        {amazonCredentials.connected ? 'Connected via SP-API' : 'Not connected'}
                      </p>
                    </div>
                  </div>
                  {amazonCredentials.connected ? (
                    <div className="text-xs text-slate-400">
                      {amazonCredentials.lastSync ? `Last sync: ${new Date(amazonCredentials.lastSync).toLocaleString()}` : 'Not synced yet'}
                    </div>
                  ) : (
                    <button onClick={() => setView('settings')} className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1">
                      <Settings className="w-3 h-3" />Connect in Settings
                    </button>
                  )}
                </div>
                
                {/* 3PL / Packiyo */}
                <div className={`rounded-xl p-4 border ${packiyoCredentials.connected ? 'bg-violet-900/20 border-violet-500/30' : 'bg-slate-700/30 border-slate-600/50'}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${packiyoCredentials.connected ? 'bg-violet-500/20' : 'bg-slate-600/50'}`}>
                      <Truck className={`w-5 h-5 ${packiyoCredentials.connected ? 'text-violet-400' : 'text-slate-400'}`} />
                    </div>
                    <div>
                      <p className="text-white font-medium">3PL (Packiyo)</p>
                      <p className={`text-xs ${packiyoCredentials.connected ? 'text-violet-400' : 'text-slate-500'}`}>
                        {packiyoCredentials.connected ? 'Connected' : 'Not connected'}
                      </p>
                    </div>
                  </div>
                  {packiyoCredentials.connected ? (
                    <div className="text-xs text-slate-400">
                      {packiyoCredentials.lastSync ? `Last sync: ${new Date(packiyoCredentials.lastSync).toLocaleString()}` : 'Not synced yet'}
                    </div>
                  ) : (
                    <button onClick={() => setView('settings')} className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
                      <Settings className="w-3 h-3" />Connect in Settings
                    </button>
                  )}
                </div>
                
                {/* Shopify / Wormans Mill */}
                <div className={`rounded-xl p-4 border ${shopifyCredentials.connected ? 'bg-green-900/20 border-green-500/30' : 'bg-slate-700/30 border-slate-600/50'}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${shopifyCredentials.connected ? 'bg-green-500/20' : 'bg-slate-600/50'}`}>
                      <Store className={`w-5 h-5 ${shopifyCredentials.connected ? 'text-green-400' : 'text-slate-400'}`} />
                    </div>
                    <div>
                      <p className="text-white font-medium">Wormans Mill (Shopify)</p>
                      <p className={`text-xs ${shopifyCredentials.connected ? 'text-green-400' : 'text-slate-500'}`}>
                        {shopifyCredentials.connected ? 'Connected' : 'Not connected'}
                      </p>
                    </div>
                  </div>
                  {shopifyCredentials.connected ? (
                    <div className="text-xs text-slate-400">
                      {shopifyCredentials.lastInventorySync ? `Last sync: ${new Date(shopifyCredentials.lastInventorySync).toLocaleString()}` : 'Not synced yet'}
                    </div>
                  ) : (
                    <button onClick={() => setUploadTab('shopify-sync')} className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1">
                      <ShoppingBag className="w-3 h-3" />Connect Shopify
                    </button>
                  )}
                </div>
              </div>
              
              {/* Sync All Button - Always show */}
              <div className="bg-slate-900/50 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium">Sync All Inventory</p>
                    <p className="text-slate-400 text-xs">Pull latest data from all connected sources + calculate velocity</p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        // Direct localStorage check
                        const legacyRaw = localStorage.getItem('dailySales');
                        if (legacyRaw) {
                          const legacy = JSON.parse(legacyRaw);
                          const dates = Object.keys(legacy).sort().reverse();
                          const withAmazonSku = dates.filter(d => legacy[d]?.amazon?.skuData?.length > 0);
                          if (withAmazonSku.length > 0) {
                          }
                        } else {
                        }
                        alert('Check console (F12) for localStorage data');
                      }}
                      className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-white text-sm flex items-center gap-2"
                    >
                      <Database className="w-4 h-4" />Debug Data
                    </button>
                    <button 
                      onClick={async () => {
                        setToast({ message: 'Syncing inventory from all sources...', type: 'success' });
                        if (!invSnapshotDate) setInvSnapshotDate(new Date().toISOString().split('T')[0]);
                        processInventory();
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white text-sm flex items-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />Sync Now
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Fallback File Upload (collapsed by default) */}
              <details className="bg-slate-900/50 rounded-xl border border-slate-700/50">
                <summary className="p-4 cursor-pointer text-slate-300 hover:text-white flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    Manual File Upload (Fallback)
                  </span>
                  <ChevronDown className="w-4 h-4" />
                </summary>
                <div className="p-4 pt-0 space-y-4">
                  <p className="text-slate-500 text-xs">Use file upload only if APIs are not connected or you need to upload historical data.</p>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-300 mb-2">Snapshot Date <span className="text-rose-400">*</span></label>
                    <input type="date" value={invSnapshotDate} onChange={(e) => setInvSnapshotDate(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white" />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FileBox type="amazon" label="Amazon FBA Inventory" desc="FBA Manage Inventory report" req isInv />
                    <FileBox type="threepl" label="3PL Inventory" desc="Products export (if Packiyo not connected)" isInv />
                  </div>
                  
                  <button onClick={processInventory} disabled={isProcessing || (!invFiles.amazon && !amazonCredentials.connected) || !invSnapshotDate} className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2">
                    {isProcessing ? <><Loader2 className="w-5 h-5 animate-spin" />Processing...</> : 'Process Inventory Files'}
                  </button>
                </div>
              </details>
            </div>
          )}
          
          {/* Amazon Forecast Upload */}
          {uploadTab === 'forecast' && (
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-white mb-1">Amazon Forecast Upload</h2>
              <p className="text-slate-400 text-sm mb-4">Upload Amazon's projected sales to compare against actual results</p>
              
              {/* Upload Schedule Summary */}
              <div className="bg-gradient-to-r from-purple-900/30 to-indigo-900/30 rounded-xl border border-purple-500/30 p-4 mb-6">
                <h3 className="text-purple-300 font-semibold mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  📅 Your Upload Schedule
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {['7day', '30day', '60day'].map(type => {
                    const status = dataStatus.forecastStatus[type];
                    const isExpired = status.status === 'expired';
                    const isExpiring = status.status === 'expiring';
                    const isMissing = status.status === 'missing';
                    const isActive = status.status === 'active';
                    
                    return (
                      <div key={type} className={`rounded-lg p-3 ${
                        isExpired ? 'bg-rose-900/40 border border-rose-500/50' :
                        isExpiring ? 'bg-amber-900/40 border border-amber-500/50' :
                        isMissing ? 'bg-slate-700/50 border border-slate-600/50' :
                        'bg-emerald-900/30 border border-emerald-500/30'
                      }`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-white">{status.type}</span>
                          {isExpired && <span className="text-xs bg-rose-500/30 text-rose-300 px-2 py-0.5 rounded">UPLOAD NOW</span>}
                          {isExpiring && <span className="text-xs bg-amber-500/30 text-amber-300 px-2 py-0.5 rounded">{status.daysUntilExpiry}d left</span>}
                          {isActive && <span className="text-xs bg-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded">{status.daysUntilExpiry}d left</span>}
                          {isMissing && <span className="text-xs bg-slate-500/30 text-slate-300 px-2 py-0.5 rounded">Not set</span>}
                        </div>
                        <p className="text-xs text-slate-400">
                          {status.lastUpload 
                            ? `Last: ${new Date(status.lastUpload).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} (${status.daysSinceUpload}d ago)`
                            : 'Never uploaded'}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-400 mt-3">
                  💡 <strong className="text-slate-300">Workflow:</strong> Upload 7-day weekly, 30-day monthly, 60-day every 2 months → Upload daily sales → System learns and improves predictions
                </p>
              </div>
              
              {/* Forecast Date Ranges for each type */}
              {(() => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                const formatDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                const formatShort = (d) => d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
                
                // Calculate date ranges for each forecast type
                const get7DayRange = () => {
                  const start = new Date(today);
                  start.setDate(start.getDate() + 1); // Tomorrow
                  const end = new Date(start);
                  end.setDate(end.getDate() + 6); // 7 days from tomorrow
                  return { start, end, days: 7 };
                };
                
                const get30DayRange = () => {
                  const start = new Date(today);
                  start.setDate(start.getDate() + 1); // Tomorrow
                  const end = new Date(start);
                  end.setDate(end.getDate() + 29); // 30 days from tomorrow
                  return { start, end, days: 30 };
                };
                
                const get60DayRange = () => {
                  const start = new Date(today);
                  start.setDate(start.getDate() + 1); // Tomorrow
                  const end = new Date(start);
                  end.setDate(end.getDate() + 59); // 60 days from tomorrow
                  return { start, end, days: 60 };
                };
                
                const ranges = {
                  '7day': get7DayRange(),
                  '30day': get30DayRange(),
                  '60day': get60DayRange(),
                };
                
                // Calculate days until each forecast needs refresh
                const getDaysUntilRefresh = (type) => {
                  const lastUpload = forecastMeta.lastUploads?.[type];
                  if (!lastUpload) return null;
                  const uploadDate = new Date(lastUpload);
                  const daysSince = Math.floor((today - uploadDate) / (1000 * 60 * 60 * 24));
                  const refreshDays = type === '7day' ? 7 : type === '30day' ? 30 : 60;
                  return refreshDays - daysSince;
                };
                
                const selectedRange = files.forecastType ? ranges[files.forecastType] : null;
                
                return (
                  <div className="bg-orange-900/20 border border-orange-500/30 rounded-xl p-4 mb-6">
                    <h3 className="text-orange-300 font-semibold mb-3 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Amazon Forecast Date Ranges
                    </h3>
                    <p className="text-slate-400 text-sm mb-4">Select a forecast type below, then use these date ranges in Amazon Seller Central</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                      {/* 7-Day Forecast */}
                      <div className={`rounded-lg p-3 cursor-pointer transition-all ${files.forecastType === '7day' ? 'bg-amber-600/30 border-2 border-amber-500' : 'bg-slate-800/50 border border-slate-700 hover:border-slate-500'}`}
                        onClick={() => files.amazonForecast && setFiles(p => ({ ...p, forecastType: '7day' }))}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-amber-400 font-medium">📅 7-Day Forecast</p>
                          {forecastMeta.lastUploads?.['7day'] && (
                            <span className={`text-xs px-2 py-0.5 rounded ${getDaysUntilRefresh('7day') <= 0 ? 'bg-rose-500/30 text-rose-300' : getDaysUntilRefresh('7day') <= 2 ? 'bg-amber-500/30 text-amber-300' : 'bg-emerald-500/30 text-emerald-300'}`}>
                              {getDaysUntilRefresh('7day') <= 0 ? 'Due now!' : `${getDaysUntilRefresh('7day')}d left`}
                            </span>
                          )}
                        </div>
                        <p className="text-white font-mono text-sm">{formatShort(ranges['7day'].start)}</p>
                        <p className="text-white font-mono text-sm">→ {formatShort(ranges['7day'].end)}</p>
                        <p className="text-slate-500 text-xs mt-1">Refresh every 7 days</p>
                      </div>
                      
                      {/* 30-Day Forecast */}
                      <div className={`rounded-lg p-3 cursor-pointer transition-all ${files.forecastType === '30day' ? 'bg-amber-600/30 border-2 border-amber-500' : 'bg-slate-800/50 border border-slate-700 hover:border-slate-500'}`}
                        onClick={() => files.amazonForecast && setFiles(p => ({ ...p, forecastType: '30day' }))}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-orange-400 font-medium">📊 30-Day Forecast</p>
                          {forecastMeta.lastUploads?.['30day'] && (
                            <span className={`text-xs px-2 py-0.5 rounded ${getDaysUntilRefresh('30day') <= 0 ? 'bg-rose-500/30 text-rose-300' : getDaysUntilRefresh('30day') <= 2 ? 'bg-amber-500/30 text-amber-300' : 'bg-emerald-500/30 text-emerald-300'}`}>
                              {getDaysUntilRefresh('30day') <= 0 ? 'Due now!' : `${getDaysUntilRefresh('30day')}d left`}
                            </span>
                          )}
                        </div>
                        <p className="text-white font-mono text-sm">{formatShort(ranges['30day'].start)}</p>
                        <p className="text-white font-mono text-sm">→ {formatShort(ranges['30day'].end)}</p>
                        <p className="text-slate-500 text-xs mt-1">Refresh every 30 days</p>
                      </div>
                      
                      {/* 60-Day Forecast */}
                      <div className={`rounded-lg p-3 cursor-pointer transition-all ${files.forecastType === '60day' ? 'bg-amber-600/30 border-2 border-amber-500' : 'bg-slate-800/50 border border-slate-700 hover:border-slate-500'}`}
                        onClick={() => files.amazonForecast && setFiles(p => ({ ...p, forecastType: '60day' }))}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-red-400 font-medium">📈 60-Day Forecast</p>
                          {forecastMeta.lastUploads?.['60day'] && (
                            <span className={`text-xs px-2 py-0.5 rounded ${getDaysUntilRefresh('60day') <= 0 ? 'bg-rose-500/30 text-rose-300' : getDaysUntilRefresh('60day') <= 2 ? 'bg-amber-500/30 text-amber-300' : 'bg-emerald-500/30 text-emerald-300'}`}>
                              {getDaysUntilRefresh('60day') <= 0 ? 'Due now!' : `${getDaysUntilRefresh('60day')}d left`}
                            </span>
                          )}
                        </div>
                        <p className="text-white font-mono text-sm">{formatShort(ranges['60day'].start)}</p>
                        <p className="text-white font-mono text-sm">→ {formatShort(ranges['60day'].end)}</p>
                        <p className="text-slate-500 text-xs mt-1">Refresh every 60 days</p>
                      </div>
                    </div>
                    
                    {/* Selected forecast instructions */}
                    {selectedRange && (
                      <div className="bg-slate-900/50 rounded-lg p-3 mb-3">
                        <p className="text-emerald-400 font-medium mb-2">✓ Selected: {files.forecastType === '7day' ? '7-Day' : files.forecastType === '30day' ? '30-Day' : '60-Day'} Forecast</p>
                        <p className="text-white text-sm">
                          In Amazon Seller Central, set date range: <span className="font-mono text-amber-300">{formatShort(selectedRange.start)}</span> to <span className="font-mono text-amber-300">{formatShort(selectedRange.end)}</span>
                        </p>
                      </div>
                    )}
                    
                    <ol className="text-slate-300 text-sm space-y-1 list-decimal list-inside">
                      <li>Go to Seller Central → Reports → Business Reports → <span className="text-orange-300">SKU Economics</span></li>
                      <li>Set the date range to the <span className="text-orange-300 font-medium">future dates</span> shown above</li>
                      <li>Amazon will show <span className="text-orange-300 font-medium">projected/forecasted</span> sales for those dates</li>
                      <li>Export as CSV and upload below</li>
                    </ol>
                  </div>
                );
              })()}
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-2">Amazon Forecast CSV <span className="text-rose-400">*</span></label>
                <div className={`relative border-2 border-dashed rounded-xl p-6 transition-all ${files.amazonForecast ? 'border-amber-500/50 bg-amber-950/20' : 'border-slate-600 hover:border-slate-500 bg-slate-800/30'}`}>
                  <input 
                    key={`forecast-input-${forecastMeta.history?.length || 0}`}
                    type="file" 
                    accept=".csv" 
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        setFileNames(p => ({ ...p, amazonForecast: file.name }));
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const parsed = parseCSV(ev.target.result);
                          setFiles(p => ({ ...p, amazonForecast: parsed, forecastType: null }));
                        };
                        reader.readAsText(file);
                      }
                    }} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                  />
                  <div className="flex flex-col items-center gap-2">
                    {files.amazonForecast ? <Check className="w-8 h-8 text-amber-400" /> : <Upload className="w-8 h-8 text-slate-400" />}
                    <p className={`font-medium ${files.amazonForecast ? 'text-amber-400' : 'text-white'}`}>
                      {files.amazonForecast ? fileNames.amazonForecast : 'Click to upload Amazon forecast CSV'}
                    </p>
                    {files.amazonForecast && (
                      <p className="text-slate-400 text-sm">{files.amazonForecast.length} SKUs found</p>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Forecast Type Selection - shown if file uploaded but no type selected */}
              {files.amazonForecast && !files.forecastType && (
                <div className="mb-4 p-3 bg-amber-900/30 border border-amber-500/50 rounded-lg">
                  <p className="text-amber-300 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Click one of the forecast cards above to select which type this is (7-Day, 30-Day, or 60-Day)
                  </p>
                </div>
              )}
              
              {/* Selected forecast confirmation */}
              {files.amazonForecast && files.forecastType && (
                <div className="mb-4 p-3 bg-emerald-900/30 border border-emerald-500/50 rounded-lg flex items-center justify-between">
                  <p className="text-emerald-300 text-sm flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    Ready to upload: <span className="font-semibold">{files.forecastType === '7day' ? '7-Day' : files.forecastType === '30day' ? '30-Day' : '60-Day'}</span> forecast ({files.amazonForecast.length} SKUs)
                  </p>
                  <button onClick={() => setFiles(p => ({ ...p, forecastType: null }))} className="text-slate-400 hover:text-white text-xs">Change</button>
                </div>
              )}
              
              {/* Forecast Alerts */}
              {forecastAlerts.length > 0 && (
                <div className="mb-4 space-y-2">
                  {forecastAlerts.map((alert, i) => (
                    <div key={i} className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                      alert.severity === 'warning' ? 'bg-amber-900/30 border border-amber-500/50 text-amber-300' : 'bg-blue-900/30 border border-blue-500/50 text-blue-300'
                    }`}>
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{alert.message}</span>
                    </div>
                  ))}
                </div>
              )}
              
              <button onClick={() => {
                if (!files.amazonForecast) return;
                if (!files.forecastType) {
                  setToast({ message: 'Please select forecast type (7-Day, 30-Day, or 60-Day)', type: 'error' });
                  return;
                }
                const result = processAmazonForecast(files.amazonForecast);
                if (result) {
                  const forecastType = files.forecastType;
                  const now = new Date().toISOString();
                  
                  // Track this upload
                  const historyEntry = {
                    type: forecastType,
                    uploadedAt: now,
                    periodStart: result.type === 'monthly' ? result.period.startDate : result.forecast?.startDate,
                    periodEnd: result.type === 'monthly' ? result.period.endDate : result.forecast?.endDate,
                    totalSales: result.type === 'monthly' ? result.monthlyTotal.sales : result.forecast?.totals?.sales,
                    totalProceeds: result.type === 'monthly' ? result.monthlyTotal.proceeds : result.forecast?.totals?.proceeds,
                    accuracy: null, // Will be calculated when actuals come in
                  };
                  
                  setForecastMeta(prev => ({
                    lastUploads: { ...prev.lastUploads, [forecastType]: now },
                    history: [historyEntry, ...(prev.history || []).slice(0, 49)], // Keep last 50
                  }));
                  
                  if (result.type === 'monthly') {
                    // Monthly forecast - save each week separately
                    setAmazonForecasts(prev => ({ ...prev, ...result.forecasts }));
                    const weekCount = Object.keys(result.forecasts).length;
                    setToast({ message: `${forecastType} forecast split into ${weekCount} weekly forecasts (${formatCurrency(result.monthlyTotal.sales)} total)`, type: 'success' });
                  } else {
                    // Weekly forecast
                    setAmazonForecasts(prev => ({ ...prev, [result.forecast.weekEnding]: result.forecast }));
                    setToast({ message: `${forecastType} forecast saved for week ending ${result.forecast.weekEnding}`, type: 'success' });
                  }
                  setFiles(p => ({ ...p, amazonForecast: null, forecastType: null }));
                  setFileNames(p => ({ ...p, amazonForecast: '' }));
                } else {
                  setToast({ message: 'Could not parse forecast data', type: 'error' });
                }
              }} disabled={!files.amazonForecast || !files.forecastType} className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl mb-6">
                Save {files.forecastType ? (files.forecastType === '7day' ? '7-Day' : files.forecastType === '30day' ? '30-Day' : '60-Day') + ' ' : ''}Forecast
              </button>
              
              {/* Forecast Upload History */}
              {forecastMeta.lastUploads && (Object.values(forecastMeta.lastUploads).some(v => v)) && (
                <div className="bg-slate-800/50 rounded-xl p-4 mb-6">
                  <h3 className="text-sm font-semibold text-slate-300 uppercase mb-3">Last Uploads</h3>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    {['7day', '30day', '60day'].map(type => {
                      const lastUpload = forecastMeta.lastUploads?.[type];
                      const daysSince = lastUpload ? Math.floor((new Date() - new Date(lastUpload)) / (1000 * 60 * 60 * 24)) : null;
                      const isStale = (type === '7day' && daysSince >= 7) || (type === '30day' && daysSince >= 30) || (type === '60day' && daysSince >= 60);
                      return (
                        <div key={type} className={`p-3 rounded-lg ${isStale ? 'bg-amber-900/30 border border-amber-500/30' : 'bg-slate-700/50'}`}>
                          <p className="text-slate-400 text-xs uppercase">{type === '7day' ? '7-Day' : type === '30day' ? '30-Day' : '60-Day'}</p>
                          {lastUpload ? (
                            <>
                              <p className={`font-medium ${isStale ? 'text-amber-400' : 'text-white'}`}>{daysSince} days ago</p>
                              <p className="text-slate-500 text-xs">{new Date(lastUpload).toLocaleDateString()}</p>
                            </>
                          ) : (
                            <p className="text-slate-500">Never</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* Existing Forecasts */}
              {Object.keys(amazonForecasts).length > 0 && (
                <div className="border-t border-slate-700 pt-6">
                  <h3 className="text-sm font-semibold text-slate-300 uppercase mb-4">Saved Forecasts</h3>
                  <div className="space-y-2">
                    {Object.entries(amazonForecasts).sort((a, b) => b[0].localeCompare(a[0])).map(([weekKey, forecast]) => {
                      const hasActual = allWeeksData[weekKey];
                      const isPast = new Date(weekKey) < new Date();
                      const isFromMonthly = forecast.sourceType === '30-day-split';
                      return (
                        <div key={weekKey} className={`flex items-center justify-between p-3 rounded-xl ${hasActual ? 'bg-emerald-900/20 border border-emerald-500/30' : isPast ? 'bg-slate-700/30 border border-slate-600' : 'bg-amber-900/20 border border-amber-500/30'}`}>
                          <div>
                            <p className="text-white font-medium flex items-center gap-2">
                              Week ending {new Date(weekKey + 'T00:00:00').toLocaleDateString()}
                              {isFromMonthly && <span className="text-xs bg-violet-500/30 text-violet-300 px-2 py-0.5 rounded">from 30-day</span>}
                            </p>
                            <p className="text-slate-400 text-sm">
                              {formatCurrency(forecast.totals?.sales || 0)} projected • {forecast.skuCount || 0} SKUs
                              {isFromMonthly && forecast.monthlyTotal && ` • Part of ${formatCurrency(forecast.monthlyTotal.sales)} monthly`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {hasActual ? (
                              <span className="text-emerald-400 text-sm flex items-center gap-1"><Check className="w-4 h-4" />Has actuals</span>
                            ) : isPast ? (
                              <span className="text-slate-400 text-sm">Awaiting actuals</span>
                            ) : (
                              <span className="text-amber-400 text-sm">Upcoming</span>
                            )}
                            <button onClick={() => {
                              const updated = { ...amazonForecasts };
                              delete updated[weekKey];
                              setAmazonForecasts(updated);
                            }} className="p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-rose-400">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* Forecast vs Actual Comparison */}
              {getAmazonForecastComparison.length > 0 && (
                <div className="border-t border-slate-700 pt-6 mt-6">
                  <h3 className="text-sm font-semibold text-slate-300 uppercase mb-4">Forecast Accuracy</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left text-slate-400 py-2">Week</th>
                          <th className="text-right text-slate-400 py-2">Forecast</th>
                          <th className="text-right text-slate-400 py-2">Actual</th>
                          <th className="text-right text-slate-400 py-2">Variance</th>
                          <th className="text-right text-slate-400 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getAmazonForecastComparison.map(c => (
                          <tr key={c.weekEnding} className="border-b border-slate-700/50">
                            <td className="py-2 text-white">{new Date(c.weekEnding + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                            <td className="py-2 text-right text-slate-400">{formatCurrency(c.forecast.revenue)}</td>
                            <td className="py-2 text-right text-white font-medium">{formatCurrency(c.actual.revenue)}</td>
                            <td className={`py-2 text-right font-medium ${c.variance.revenuePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {c.variance.revenuePercent >= 0 ? '+' : ''}{c.variance.revenuePercent.toFixed(1)}%
                            </td>
                            <td className="py-2 text-right">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${c.status === 'beat' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-rose-900/50 text-rose-400'}`}>
                                {c.status === 'beat' ? '↑ Beat' : '↓ Missed'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* ============ AMAZON BULK UPLOAD TAB ============ */}
          {uploadTab === 'amazon-bulk' && (
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-orange-400" />
                Amazon SKU Economics Reports
              </h2>
              <p className="text-slate-400 text-sm mb-6">
                Upload one or more SKU Economics reports. The system auto-detects if they're daily, weekly, or monthly based on date range.
              </p>
              
              {/* How to get reports */}
              <div className="bg-orange-900/20 border border-orange-500/30 rounded-xl p-4 mb-6">
                <h3 className="text-orange-300 font-medium mb-2 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4" />
                  How to Download SKU Economics Reports
                </h3>
                <ol className="text-slate-300 text-sm space-y-1 list-decimal list-inside">
                  <li>Go to <strong>Seller Central → Reports → Business Reports</strong></li>
                  <li>Click <strong>SKU Economics</strong> in the left sidebar</li>
                  <li>Select your date range (daily, weekly, or monthly)</li>
                  <li>Click <strong>Download</strong> to get the CSV</li>
                </ol>
                <p className="text-slate-400 text-xs mt-2">You can upload multiple files at once - they'll be sorted by date automatically.</p>
              </div>
              
              {/* File Upload Zone */}
              <div 
                className={`border-2 border-dashed rounded-xl p-8 mb-6 text-center transition-all ${
                  amazonBulkFiles.length > 0 ? 'border-orange-500/50 bg-orange-900/10' : 'border-slate-600 hover:border-slate-500'
                }`}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.csv'));
                  if (files.length > 0) {
                    handleAmazonBulkFiles(files);
                  }
                }}
              >
                <input 
                  type="file" 
                  accept=".csv" 
                  multiple
                  className="hidden"
                  id="amazon-bulk-input"
                  onChange={(e) => {
                    const files = Array.from(e.target.files);
                    if (files.length > 0) {
                      handleAmazonBulkFiles(files);
                    }
                    e.target.value = '';
                  }}
                />
                <label htmlFor="amazon-bulk-input" className="cursor-pointer">
                  <Upload className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                  <p className="text-white font-medium mb-1">Drop CSV files here or click to browse</p>
                  <p className="text-slate-400 text-sm">Supports multiple files • Auto-detects report type</p>
                </label>
              </div>
              
              {/* Uploaded Files List */}
              {amazonBulkFiles.length > 0 && (
                <div className="space-y-4 mb-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-white font-medium">{amazonBulkFiles.length} File{amazonBulkFiles.length > 1 ? 's' : ''} Ready</h3>
                    <button 
                      onClick={() => setAmazonBulkFiles([])}
                      className="text-xs text-rose-400 hover:text-rose-300"
                    >
                      Clear All
                    </button>
                  </div>
                  
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {amazonBulkFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center gap-3 bg-slate-900/50 rounded-lg p-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          file.reportType === 'daily' ? 'bg-cyan-500/20' :
                          file.reportType === 'weekly' ? 'bg-violet-500/20' :
                          file.reportType === 'monthly' ? 'bg-teal-500/20' :
                          'bg-slate-600/50'
                        }`}>
                          {file.reportType === 'daily' ? <Clock className="w-5 h-5 text-cyan-400" /> :
                           file.reportType === 'weekly' ? <Calendar className="w-5 h-5 text-violet-400" /> :
                           file.reportType === 'monthly' ? <CalendarRange className="w-5 h-5 text-teal-400" /> :
                           <FileSpreadsheet className="w-5 h-5 text-slate-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm truncate">{file.name}</p>
                          <p className="text-slate-400 text-xs">
                            {file.reportType ? (
                              <span className={`${
                                file.reportType === 'daily' ? 'text-cyan-400' :
                                file.reportType === 'weekly' ? 'text-violet-400' :
                                'text-teal-400'
                              }`}>
                                {file.reportType.charAt(0).toUpperCase() + file.reportType.slice(1)}
                              </span>
                            ) : 'Parsing...'}{' '}
                            {file.dateRange && `• ${file.dateRange.start} to ${file.dateRange.end}`}
                            {file.skuCount && ` • ${file.skuCount} SKUs`}
                            {file.revenue && ` • ${formatCurrency(file.revenue)}`}
                          </p>
                        </div>
                        <button 
                          onClick={() => setAmazonBulkFiles(prev => prev.filter((_, i) => i !== idx))}
                          className="p-1 text-slate-400 hover:text-rose-400"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  
                  {/* Summary */}
                  {amazonBulkParsed && (
                    <div className="bg-slate-900/50 rounded-xl p-4 space-y-3">
                      <h4 className="text-white font-medium">Import Summary</h4>
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-2xl font-bold text-cyan-400">{amazonBulkParsed.dailyCount || 0}</p>
                          <p className="text-xs text-slate-400">Daily Reports</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-violet-400">{amazonBulkParsed.weeklyCount || 0}</p>
                          <p className="text-xs text-slate-400">Weekly Reports</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-teal-400">{amazonBulkParsed.monthlyCount || 0}</p>
                          <p className="text-xs text-slate-400">Monthly Reports</p>
                        </div>
                      </div>
                      <div className="pt-3 border-t border-slate-700 text-sm text-slate-300">
                        <p>Total Revenue: <span className="text-white font-medium">{formatCurrency(amazonBulkParsed.totalRevenue || 0)}</span></p>
                        <p>Date Range: <span className="text-white">{amazonBulkParsed.dateRange?.start} to {amazonBulkParsed.dateRange?.end}</span></p>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Process Button */}
              <button 
                onClick={processAmazonBulkUpload}
                disabled={amazonBulkProcessing || amazonBulkFiles.length === 0}
                className="w-full bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2"
              >
                {amazonBulkProcessing ? (
                  <><Loader2 className="w-5 h-5 animate-spin" />Processing...</>
                ) : (
                  <><Upload className="w-5 h-5" />Import {amazonBulkFiles.length} Report{amazonBulkFiles.length !== 1 ? 's' : ''}</>
                )}
              </button>
              
              <p className="text-slate-500 text-xs text-center mt-3">
                Shopify sales data will be pulled from Shopify Sync if connected. If not, only Amazon data will be imported.
              </p>
            </div>
          )}
          
          {/* ============ COGS UPLOAD TAB ============ */}
          {uploadTab === 'cogs' && (
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-pink-400" />
                Cost of Goods Sold (COGS)
              </h2>
              <p className="text-slate-400 text-sm mb-6">
                Upload a CSV with SKU and cost per unit to calculate profit margins accurately.
              </p>
              
              {/* Current COGS Status */}
              <div className={`rounded-xl p-4 mb-6 ${Object.keys(savedCogs).length > 0 ? 'bg-emerald-900/20 border border-emerald-500/30' : 'bg-amber-900/20 border border-amber-500/30'}`}>
                <div className="flex items-center gap-3">
                  {Object.keys(savedCogs).length > 0 ? (
                    <>
                      <Check className="w-5 h-5 text-emerald-400" />
                      <div>
                        <p className="text-emerald-300 font-medium">{Object.keys(savedCogs).length} SKUs with COGS configured</p>
                        <p className="text-slate-400 text-xs">Profit calculations are accurate</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-5 h-5 text-amber-400" />
                      <div>
                        <p className="text-amber-300 font-medium">No COGS configured</p>
                        <p className="text-slate-400 text-xs">Profit calculations will be incomplete without cost data</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
              
              {/* Upload COGS File */}
              <div className="mb-6">
                <h3 className="text-white font-medium mb-3">Upload COGS File</h3>
                <FileBox type="cogs" label="COGS File" desc="CSV with SKU and Cost Per Unit columns" />
              </div>
              
              {files.cogs && (
                <button 
                  onClick={processAndSaveCogs}
                  className="w-full bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-semibold py-4 rounded-xl"
                >
                  Save COGS Data
                </button>
              )}
              
              {/* View/Edit COGS */}
              {Object.keys(savedCogs).length > 0 && (
                <div className="mt-6">
                  <button 
                    onClick={() => setShowCogsManager(true)}
                    className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-white flex items-center justify-center gap-2"
                  >
                    <Settings className="w-4 h-4" />View & Edit COGS
                  </button>
                </div>
              )}
            </div>
          )}
          
          {/* ============ SHOPIFY SYNC TAB ============ */}
          {uploadTab === 'shopify-sync' && (
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-green-400" />
                Shopify Sync
              </h2>
              <p className="text-slate-400 text-sm mb-6">Automatically import orders from your Shopify store</p>
              
              {/* Connection Status */}
              <div className={`rounded-xl p-4 mb-6 ${shopifyCredentials.connected ? 'bg-emerald-900/30 border border-emerald-500/30' : 'bg-slate-700/30 border border-slate-600'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {shopifyCredentials.connected ? (
                      <>
                        <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
                          <Check className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-emerald-400 font-medium">Connected to Shopify</p>
                          <p className="text-slate-400 text-sm">{shopifyCredentials.storeUrl}</p>
                          {shopifyCredentials.lastSync && (
                            <p className="text-slate-500 text-xs">Last sync: {new Date(shopifyCredentials.lastSync).toLocaleString()}</p>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-10 h-10 bg-slate-600/50 rounded-full flex items-center justify-center">
                          <ShoppingBag className="w-5 h-5 text-slate-400" />
                        </div>
                        <div>
                          <p className="text-slate-300 font-medium">Not Connected</p>
                          <p className="text-slate-500 text-sm">Set up your Shopify connection in Settings</p>
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => setView('settings')}
                    className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-sm text-white flex items-center gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    {shopifyCredentials.connected ? 'Manage' : 'Connect'}
                  </button>
                </div>
              </div>
              
              {shopifyCredentials.connected ? (
                <>
                  {/* Sync Controls */}
                  <div className="bg-slate-900/50 rounded-xl p-4 mb-6">
                    <h3 className="text-white font-medium mb-4">Select Date Range to Sync</h3>
                    
                    {/* Quick Select Buttons - Moved to top for easier access */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      {[
                        { label: 'Last 7 Days', days: 7 },
                        { label: 'Last 14 Days', days: 14 },
                        { label: 'Last 30 Days', days: 30 },
                        { label: 'This Month', days: 'month' },
                        { label: 'Last Month', days: 'lastMonth' },
                      ].map(({ label, days }) => {
                        // Calculate what dates this button would set
                        let start = new Date();
                        let end = new Date();
                        if (days === 'month') {
                          start = new Date(end.getFullYear(), end.getMonth(), 1);
                        } else if (days === 'lastMonth') {
                          start = new Date(end.getFullYear(), end.getMonth() - 1, 1);
                          end = new Date(end.getFullYear(), end.getMonth(), 0);
                        } else {
                          start.setDate(end.getDate() - days + 1);
                        }
                        const startStr = start.toISOString().split('T')[0];
                        const endStr = end.toISOString().split('T')[0];
                        const isSelected = shopifySyncRange.start === startStr && shopifySyncRange.end === endStr;
                        
                        return (
                          <button
                            key={label}
                            onClick={() => {
                              setShopifySyncRange({ start: startStr, end: endStr });
                              // Clear smart sync - user needs to click Find Missing
                              setShopifySmartSync({ enabled: true, missingDays: [], existingDays: [] });
                            }}
                            className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                              isSelected 
                                ? 'bg-green-600 text-white' 
                                : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-slate-400 text-sm mb-2">Start Date</label>
                        <input
                          type="date"
                          value={shopifySyncRange.start}
                          max={shopifySyncRange.end || new Date().toISOString().split('T')[0]}
                          onChange={(e) => {
                            setShopifySyncRange(p => ({ ...p, start: e.target.value }));
                            // Clear smart sync when dates change - user needs to recalculate
                            setShopifySmartSync({ enabled: true, missingDays: [], existingDays: [] });
                          }}
                          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 text-sm mb-2">End Date</label>
                        <input
                          type="date"
                          value={shopifySyncRange.end}
                          min={shopifySyncRange.start}
                          max={new Date().toISOString().split('T')[0]}
                          onChange={(e) => {
                            setShopifySyncRange(p => ({ ...p, end: e.target.value }));
                            // Clear smart sync when dates change
                            setShopifySmartSync({ enabled: true, missingDays: [], existingDays: [] });
                          }}
                          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white"
                        />
                      </div>
                    </div>
                    
                    {/* Date range validation warning */}
                    {shopifySyncRange.start && shopifySyncRange.end && new Date(shopifySyncRange.start) > new Date(shopifySyncRange.end) && (
                      <div className="bg-rose-900/30 border border-rose-500/50 rounded-lg p-3 mb-4 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                        <span className="text-rose-300 text-sm">Start date must be before end date</span>
                      </div>
                    )}
                    
                    {/* Range info */}
                    {shopifySyncRange.start && shopifySyncRange.end && new Date(shopifySyncRange.start) <= new Date(shopifySyncRange.end) && (
                      <div className="text-slate-400 text-sm mb-4">
                        {(() => {
                          const days = Math.ceil((new Date(shopifySyncRange.end) - new Date(shopifySyncRange.start)) / (1000 * 60 * 60 * 24)) + 1;
                          return (
                            <span>
                              Selected range: <span className="text-white font-medium">{days} days</span>
                              {days > 90 && <span className="text-amber-400 ml-2">(large range may take longer to sync)</span>}
                            </span>
                          );
                        })()}
                      </div>
                    )}
                    
                    {/* Find Missing Button - Now a prominent action */}
                    <div className="flex flex-wrap gap-3 mb-4">
                      <button
                        onClick={() => {
                          if (!shopifySyncRange.start || !shopifySyncRange.end) {
                            setToast({ message: 'Please select a date range first', type: 'error' });
                            return;
                          }
                          
                          const start = new Date(shopifySyncRange.start);
                          const end = new Date(shopifySyncRange.end);
                          
                          if (start > end) {
                            setToast({ message: 'Start date must be before end date', type: 'error' });
                            return;
                          }
                          
                          const dayCount = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
                          if (dayCount > 730) {
                            setToast({ message: 'Range too large. Max 2 years (730 days).', type: 'error' });
                            return;
                          }
                          
                          // Calculate missing days
                          const missing = [];
                          const existing = [];
                          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                            const dateStr = d.toISOString().split('T')[0];
                            const hasShopifyData = allDaysData[dateStr]?.shopify?.revenue > 0;
                            if (hasShopifyData) {
                              existing.push(dateStr);
                            } else {
                              missing.push(dateStr);
                            }
                          }
                          setShopifySmartSync({ enabled: true, missingDays: missing, existingDays: existing });
                          
                          if (missing.length === 0) {
                            setToast({ message: 'All days in range already have Shopify data!', type: 'success' });
                          }
                        }}
                        disabled={!shopifySyncRange.start || !shopifySyncRange.end}
                        className="px-4 py-2 bg-amber-600/30 hover:bg-amber-600/50 disabled:opacity-50 border border-amber-500/50 rounded-lg text-sm text-amber-300 flex items-center gap-2"
                      >
                        <Zap className="w-4 h-4" />
                        Find Missing Days
                      </button>
                      
                      <button
                        onClick={() => {
                          // Find the full range of data (earliest to today)
                          const allDates = Object.keys(allDaysData).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
                          const end = new Date();
                          let start;
                          
                          if (allDates.length === 0) {
                            // No data yet - default to last 30 days
                            start = new Date();
                            start.setDate(end.getDate() - 30);
                          } else {
                            start = new Date(allDates[0]);
                          }
                          
                          // Limit to 2 years max
                          const twoYearsAgo = new Date();
                          twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
                          if (start < twoYearsAgo) {
                            start = twoYearsAgo;
                          }
                          
                          // Calculate missing days
                          const missing = [];
                          const existing = [];
                          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                            const dateStr = d.toISOString().split('T')[0];
                            const hasShopifyData = allDaysData[dateStr]?.shopify?.revenue > 0;
                            if (hasShopifyData) {
                              existing.push(dateStr);
                            } else {
                              missing.push(dateStr);
                            }
                          }
                          
                          setShopifySyncRange({ start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] });
                          setShopifySmartSync({ enabled: true, missingDays: missing, existingDays: existing });
                          
                          if (missing.length === 0) {
                            setToast({ message: 'All days already have Shopify data!', type: 'success' });
                          } else {
                            setToast({ message: `Found ${missing.length} days missing Shopify data`, type: 'info' });
                          }
                        }}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-300 flex items-center gap-2"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Scan Full History
                      </button>
                    </div>
                    
                    {/* Smart Sync Panel */}
                    {shopifySyncRange.start && shopifySyncRange.end && (shopifySmartSync.missingDays.length > 0 || shopifySmartSync.existingDays.length > 0) && (
                      <div className="bg-slate-800/50 border border-slate-600/50 rounded-lg p-4 mb-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-white font-medium flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-400" />
                            Smart Sync
                          </h4>
                          <div className="flex items-center gap-3 text-sm">
                            <span className="text-emerald-400">{shopifySmartSync.existingDays.length} synced</span>
                            <span className="text-amber-400">{shopifySmartSync.missingDays.length} missing</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3 mb-3">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={shopifySmartSync.enabled}
                              onChange={(e) => setShopifySmartSync(p => ({ ...p, enabled: e.target.checked }))}
                              className="w-4 h-4 rounded bg-slate-700 border-slate-500 text-emerald-500 focus:ring-emerald-500"
                            />
                            <span className="text-slate-300 text-sm">Only sync missing days</span>
                            <span className="text-slate-500 text-xs">(recommended)</span>
                          </label>
                        </div>
                        
                        {shopifySmartSync.enabled ? (
                          <p className="text-slate-400 text-xs">
                            Will sync <strong className="text-amber-400">{shopifySmartSync.missingDays.length}</strong> days, 
                            skip <strong className="text-emerald-400">{shopifySmartSync.existingDays.length}</strong> days that already have data.
                          </p>
                        ) : (
                          <p className="text-slate-400 text-xs">
                            Will re-sync <strong className="text-white">{shopifySmartSync.missingDays.length + shopifySmartSync.existingDays.length}</strong> days 
                            (overwrites {shopifySmartSync.existingDays.length} days with existing data).
                          </p>
                        )}
                      </div>
                    )}
                    
                    <div className="flex gap-3">
                      <button
                        onClick={async () => {
                          if (!shopifySyncRange.start || !shopifySyncRange.end) {
                            setToast({ message: 'Please select a date range', type: 'error' });
                            return;
                          }
                          setShopifySyncStatus({ loading: true, error: null, progress: 'Fetching preview...' });
                          
                          // Add timeout to prevent hanging
                          const controller = new AbortController();
                          const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout
                          
                          try {
                            const res = await fetch('/api/shopify/sync', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              signal: controller.signal,
                              body: JSON.stringify({
                                storeUrl: shopifyCredentials.storeUrl,
                                accessToken: shopifyCredentials.clientSecret,
                                clientId: shopifyCredentials.clientId, clientSecret: shopifyCredentials.clientSecret,
                                startDate: shopifySyncRange.start,
                                endDate: shopifySyncRange.end,
                                preview: true,
                              }),
                            });
                            clearTimeout(timeoutId);
                            
                            if (!res.ok) {
                              const errorText = await res.text();
                              throw new Error(`API error ${res.status}: ${errorText.slice(0, 100)}`);
                            }
                            
                            const data = await res.json();
                            if (data.error) throw new Error(data.error);
                            setShopifySyncPreview(data);
                            setShopifySyncStatus({ loading: false, error: null, progress: '' });
                          } catch (err) {
                            clearTimeout(timeoutId);
                            const errorMsg = err.name === 'AbortError' 
                              ? 'Request timed out - check if API is deployed'
                              : err.message;
                            setShopifySyncStatus({ loading: false, error: errorMsg, progress: '' });
                          }
                        }}
                        disabled={shopifySyncStatus.loading || !shopifySyncRange.start || !shopifySyncRange.end}
                        className="px-4 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 rounded-lg text-white flex items-center gap-2"
                      >
                        <Eye className="w-4 h-4" />
                        Preview
                      </button>
                      <button
                        onClick={async () => {
                          if (!shopifySyncRange.start || !shopifySyncRange.end) {
                            setToast({ message: 'Please select a date range', type: 'error' });
                            return;
                          }
                          
                          // Smart sync: check if there are days to sync
                          const daysToSync = shopifySmartSync.enabled ? shopifySmartSync.missingDays : [...shopifySmartSync.missingDays, ...shopifySmartSync.existingDays];
                          if (shopifySmartSync.enabled && shopifySmartSync.missingDays.length === 0) {
                            setToast({ message: 'All days in this range already have Shopify data. Uncheck "Only sync missing days" to re-sync.', type: 'info' });
                            return;
                          }
                          
                          const confirmMsg = shopifySmartSync.enabled 
                            ? `Sync ${shopifySmartSync.missingDays.length} missing days from Shopify?\n\n(Skipping ${shopifySmartSync.existingDays.length} days that already have data)`
                            : `Sync ALL ${daysToSync.length} days from ${shopifySyncRange.start} to ${shopifySyncRange.end}?\n\nThis will overwrite ${shopifySmartSync.existingDays.length} days with existing data.`;
                          
                          if (!confirm(confirmMsg)) return;
                          
                          setShopifySyncStatus({ loading: true, error: null, progress: 'Fetching orders from Shopify...' });
                          try {
                            const res = await fetch('/api/shopify/sync', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                storeUrl: shopifyCredentials.storeUrl,
                                accessToken: shopifyCredentials.clientSecret,
                                clientId: shopifyCredentials.clientId, clientSecret: shopifyCredentials.clientSecret,
                                startDate: shopifySyncRange.start,
                                endDate: shopifySyncRange.end,
                                preview: false,
                              }),
                            });
                            const data = await res.json();
                            if (data.error) throw new Error(data.error);
                            
                            setShopifySyncStatus({ loading: true, error: null, progress: 'Processing orders...' });
                            
                            // Get COGS lookup for calculating product costs
                            const cogsLookup = getCogsLookup();
                            
                            // Create set of days to include (smart sync filter)
                            const daysToInclude = new Set(daysToSync);
                            
                            // Merge daily data (only for selected days if smart sync enabled)
                            // IMPORTANT: Preserve all Amazon data, only add/update Shopify data
                            const updatedDays = { ...allDaysData };
                            let syncedDayCount = 0;
                            Object.entries(data.dailyData || {}).forEach(([dateKey, dayData]) => {
                              // Skip this day if smart sync is enabled and it's not in the missing days list
                              if (shopifySmartSync.enabled && !daysToInclude.has(dateKey)) {
                                return;
                              }
                              syncedDayCount++;
                              
                              const existing = updatedDays[dateKey] || {};
                              
                              // Preserve ALL existing Amazon data
                              const amazonData = existing.amazon || { revenue: 0, units: 0, orders: 0 };
                              const shopifyData = dayData.shopify || { revenue: 0, units: 0, orders: 0 };
                              
                              // Calculate COGS from SKU data if not already calculated
                              let calculatedCogs = shopifyData.cogs || 0;
                              if (!calculatedCogs && shopifyData.skuData && Object.keys(cogsLookup).length > 0) {
                                Object.values(shopifyData.skuData).forEach(sku => {
                                  const unitCost = cogsLookup[sku.sku] || 0;
                                  calculatedCogs += unitCost * (sku.unitsSold || sku.units || 0);
                                  // Also update the SKU's cogs
                                  if (unitCost > 0) {
                                    sku.cogs = unitCost * (sku.unitsSold || sku.units || 0);
                                  }
                                });
                              }
                              // Also calculate from line items if available
                              if (!calculatedCogs && shopifyData.lineItems && Object.keys(cogsLookup).length > 0) {
                                shopifyData.lineItems.forEach(item => {
                                  const unitCost = cogsLookup[item.sku] || 0;
                                  calculatedCogs += unitCost * (item.quantity || 0);
                                });
                              }
                              
                              // Preserve existing ad data (from Meta/Google uploads)
                              const existingMetaSpend = existing.metaSpend || existing.shopify?.metaSpend || 0;
                              const existingGoogleSpend = existing.googleSpend || existing.shopify?.googleSpend || 0;
                              
                              // Merge ad data into shopify object for consistency
                              const mergedShopifyData = {
                                ...shopifyData,
                                cogs: calculatedCogs,
                                metaSpend: existingMetaSpend,
                                metaAds: existingMetaSpend,
                                googleSpend: existingGoogleSpend,
                                googleAds: existingGoogleSpend,
                                adSpend: existingMetaSpend + existingGoogleSpend,
                              };
                              
                              // Recalculate profit with COGS and ad spend
                              const grossProfit = (mergedShopifyData.revenue || 0) - calculatedCogs - (mergedShopifyData.threeplCosts || 0);
                              mergedShopifyData.netProfit = grossProfit - mergedShopifyData.adSpend;
                              mergedShopifyData.netMargin = mergedShopifyData.revenue > 0 ? (mergedShopifyData.netProfit / mergedShopifyData.revenue) * 100 : 0;
                              if (mergedShopifyData.adSpend > 0) {
                                mergedShopifyData.roas = mergedShopifyData.revenue / mergedShopifyData.adSpend;
                              }
                              
                              updatedDays[dateKey] = {
                                ...existing,
                                // Keep Amazon exactly as-is
                                amazon: amazonData,
                                // Update Shopify with merged data including ads
                                shopify: mergedShopifyData,
                                // Recalculate total from both channels
                                total: {
                                  revenue: (amazonData.revenue || 0) + (mergedShopifyData.revenue || 0),
                                  units: (amazonData.units || 0) + (mergedShopifyData.units || 0),
                                  orders: (amazonData.orders || 0) + (mergedShopifyData.orders || 0),
                                  cogs: (amazonData.cogs || 0) + calculatedCogs,
                                  netProfit: (amazonData.netProfit || 0) + (mergedShopifyData.netProfit || 0),
                                },
                                // PRESERVE all existing ad data at top level
                                metaSpend: existingMetaSpend,
                                metaAds: existingMetaSpend,
                                metaImpressions: existing.metaImpressions,
                                metaClicks: existing.metaClicks,
                                metaCpc: existing.metaCpc,
                                metaCpa: existing.metaCpa,
                                metaConversions: existing.metaConversions,
                                metaPurchases: existing.metaPurchases,
                                googleSpend: existingGoogleSpend,
                                googleAds: existingGoogleSpend,
                                googleImpressions: existing.googleImpressions,
                                googleClicks: existing.googleClicks,
                                googleCpc: existing.googleCpc,
                                googleCpa: existing.googleCpa,
                                googleConversions: existing.googleConversions,
                                // Keep any other existing data
                                ads: existing.ads,
                                expenses: existing.expenses,
                                notes: existing.notes,
                              };
                            });
                            setAllDaysData(updatedDays);
                            // Save daily data to localStorage
                            try { lsSet('ecommerce_daily_sales_v1', JSON.stringify(updatedDays)); } catch(e) {}
                            
                            // Merge weekly data - PRESERVE existing ad data
                            const updatedWeeks = { ...allWeeksData };
                            Object.entries(data.weeklyData || {}).forEach(([weekKey, weekData]) => {
                              if (updatedWeeks[weekKey]) {
                                const existingWeek = updatedWeeks[weekKey];
                                const existingShopify = existingWeek.shopify || {};
                                
                                // Preserve existing ad data
                                const metaSpend = existingShopify.metaSpend || existingShopify.metaAds || 0;
                                const googleSpend = existingShopify.googleSpend || existingShopify.googleAds || 0;
                                const totalAds = metaSpend + googleSpend;
                                
                                // Calculate COGS from SKU data if not already calculated
                                let weekCogs = weekData.shopify?.cogs || 0;
                                if (!weekCogs && weekData.shopify?.skuData && Object.keys(cogsLookup).length > 0) {
                                  Object.values(weekData.shopify.skuData).forEach(sku => {
                                    const unitCost = cogsLookup[sku.sku] || 0;
                                    weekCogs += unitCost * (sku.unitsSold || sku.units || 0);
                                  });
                                }
                                
                                // Merge shopify data, preserving ads and adding COGS
                                const mergedShopify = {
                                  ...weekData.shopify,
                                  cogs: weekCogs,
                                  metaSpend: metaSpend,
                                  metaAds: metaSpend,
                                  googleSpend: googleSpend,
                                  googleAds: googleSpend,
                                  adSpend: totalAds,
                                };
                                
                                // Recalculate profit with COGS and ad spend
                                const grossProfit = (mergedShopify.revenue || 0) - weekCogs - (mergedShopify.threeplCosts || 0);
                                mergedShopify.netProfit = grossProfit - totalAds;
                                mergedShopify.netMargin = mergedShopify.revenue > 0 ? (mergedShopify.netProfit / mergedShopify.revenue) * 100 : 0;
                                if (totalAds > 0) {
                                  mergedShopify.roas = mergedShopify.revenue / totalAds;
                                }
                                
                                updatedWeeks[weekKey] = {
                                  ...existingWeek,
                                  shopify: mergedShopify,
                                  total: {
                                    ...existingWeek.total,
                                    revenue: (existingWeek.amazon?.revenue || 0) + (mergedShopify.revenue || 0),
                                    units: (existingWeek.amazon?.units || 0) + (mergedShopify.units || 0),
                                    adSpend: (existingWeek.amazon?.adSpend || 0) + totalAds,
                                    netProfit: (existingWeek.amazon?.netProfit || 0) + (mergedShopify.netProfit || 0),
                                    cogs: (existingWeek.amazon?.cogs || 0) + weekCogs,
                                  },
                                };
                              } else {
                                // New week - calculate COGS from SKU data
                                let newWeekCogs = weekData.shopify?.cogs || 0;
                                if (!newWeekCogs && weekData.shopify?.skuData && Object.keys(cogsLookup).length > 0) {
                                  Object.values(weekData.shopify.skuData).forEach(sku => {
                                    const unitCost = cogsLookup[sku.sku] || 0;
                                    newWeekCogs += unitCost * (sku.unitsSold || sku.units || 0);
                                  });
                                }
                                
                                // Update the week data with calculated COGS
                                const updatedWeekData = { ...weekData };
                                if (updatedWeekData.shopify) {
                                  updatedWeekData.shopify = {
                                    ...updatedWeekData.shopify,
                                    cogs: newWeekCogs,
                                  };
                                  // Recalculate profit
                                  const revenue = updatedWeekData.shopify.revenue || 0;
                                  const threeplCosts = updatedWeekData.shopify.threeplCosts || 0;
                                  const adSpend = updatedWeekData.shopify.adSpend || 0;
                                  updatedWeekData.shopify.netProfit = revenue - newWeekCogs - threeplCosts - adSpend;
                                  updatedWeekData.shopify.netMargin = revenue > 0 ? (updatedWeekData.shopify.netProfit / revenue) * 100 : 0;
                                }
                                if (updatedWeekData.total) {
                                  updatedWeekData.total.cogs = newWeekCogs;
                                }
                                updatedWeeks[weekKey] = updatedWeekData;
                              }
                            });
                            setAllWeeksData(updatedWeeks);
                            save(updatedWeeks);
                            
                            const updatedCreds = { ...shopifyCredentials, lastSync: new Date().toISOString() };
                            setShopifyCredentials(updatedCreds);
                            
                            // ========== AUTO-LEARNING: Compare predicted vs actual ==========
                            // This runs after each Shopify sync to improve velocity predictions
                            let learningToastShown = false;
                            try {
                              
                              // Get last complete week's data
                              const today = new Date();
                              const dayOfWeek = today.getDay();
                              const lastSunday = new Date(today);
                              lastSunday.setDate(today.getDate() - dayOfWeek - 7); // Go back to start of last complete week
                              const lastSaturday = new Date(lastSunday);
                              lastSaturday.setDate(lastSunday.getDate() + 6);
                              
                              const formatDate = (d) => d.toISOString().split('T')[0];
                              const weekStart = formatDate(lastSunday);
                              const weekEnd = formatDate(lastSaturday);
                              
                              
                              // Collect actual sales for the week
                              const actualSalesBySku = {};
                              let daysFound = 0;
                              
                              for (let d = new Date(lastSunday); d <= lastSaturday; d.setDate(d.getDate() + 1)) {
                                const dateKey = formatDate(d);
                                const dayData = updatedDays[dateKey];
                                if (!dayData) continue;
                                daysFound++;
                                
                                // Shopify sales
                                const shopifySkuData = dayData?.shopify?.skuData;
                                const shopifyList = Array.isArray(shopifySkuData) ? shopifySkuData : Object.values(shopifySkuData || {});
                                shopifyList.forEach(item => {
                                  if (!item.sku) return;
                                  const normalizedSku = item.sku.replace(/shop$/i, '').toUpperCase();
                                  if (!actualSalesBySku[normalizedSku]) actualSalesBySku[normalizedSku] = { units: 0, revenue: 0 };
                                  actualSalesBySku[normalizedSku].units += item.unitsSold || item.units || 0;
                                  actualSalesBySku[normalizedSku].revenue += item.netSales || item.revenue || 0;
                                });
                                
                                // Amazon sales
                                const amazonSkuData = dayData?.amazon?.skuData;
                                const amazonList = Array.isArray(amazonSkuData) ? amazonSkuData : Object.values(amazonSkuData || {});
                                amazonList.forEach(item => {
                                  if (!item.sku) return;
                                  const normalizedSku = item.sku.replace(/shop$/i, '').toUpperCase();
                                  if (!actualSalesBySku[normalizedSku]) actualSalesBySku[normalizedSku] = { units: 0, revenue: 0 };
                                  actualSalesBySku[normalizedSku].units += item.unitsSold || item.units || 0;
                                  actualSalesBySku[normalizedSku].revenue += item.netSales || item.netProceeds || item.revenue || 0;
                                });
                              }
                              
                              
                              // Only proceed if we have at least 5 days of data
                              if (daysFound >= 5 && Object.keys(actualSalesBySku).length > 0) {
                                // Get current inventory with predicted velocities
                                const latestInvKey = Object.keys(invHistory).sort().reverse()[0];
                                const currentInv = latestInvKey ? invHistory[latestInvKey]?.items || [] : [];
                                
                                // Calculate correction factors
                                let totalPredicted = 0;
                                let totalActual = 0;
                                const skuCorrections = {};
                                
                                currentInv.forEach(item => {
                                  const normalizedSku = item.sku.replace(/shop$/i, '').toUpperCase();
                                  const predicted = item.weeklyVel || item.rawWeeklyVel || 0;
                                  const actual = actualSalesBySku[normalizedSku]?.units || 0;
                                  
                                  if (predicted > 0 && actual > 0) {
                                    totalPredicted += predicted;
                                    totalActual += actual;
                                    
                                    // Per-SKU correction: actual / predicted
                                    const correction = actual / predicted;
                                    // Clamp to reasonable range (0.5x to 2x)
                                    const clampedCorrection = Math.max(0.5, Math.min(2.0, correction));
                                    
                                    skuCorrections[normalizedSku] = {
                                      predicted,
                                      actual,
                                      correction: clampedCorrection,
                                    };
                                  }
                                });
                                
                                // Calculate overall correction
                                const overallCorrection = totalPredicted > 0 ? totalActual / totalPredicted : 1;
                                const clampedOverall = Math.max(0.7, Math.min(1.5, overallCorrection));
                                
                                
                                // Update forecastCorrections state
                                setForecastCorrections(prev => {
                                  const newCorrections = { ...prev };
                                  
                                  // Update overall with exponential smoothing (70% old, 30% new)
                                  const alpha = 0.3;
                                  newCorrections.overall = {
                                    units: (prev.overall?.units || 1) * (1 - alpha) + clampedOverall * alpha,
                                    revenue: (prev.overall?.revenue || 1) * (1 - alpha) + clampedOverall * alpha,
                                    profit: prev.overall?.profit || 1,
                                  };
                                  
                                  // Update per-SKU corrections
                                  if (!newCorrections.bySku) newCorrections.bySku = {};
                                  Object.entries(skuCorrections).forEach(([sku, data]) => {
                                    const existing = prev.bySku?.[sku] || { units: 1, samples: 0 };
                                    newCorrections.bySku[sku] = {
                                      units: existing.units * (1 - alpha) + data.correction * alpha,
                                      samples: (existing.samples || 0) + 1,
                                      lastActual: data.actual,
                                      lastPredicted: data.predicted,
                                      lastUpdated: new Date().toISOString(),
                                    };
                                  });
                                  
                                  // Update confidence based on samples
                                  newCorrections.samplesUsed = (prev.samplesUsed || 0) + 1;
                                  newCorrections.confidence = Math.min(100, (newCorrections.samplesUsed || 0) * 15);
                                  newCorrections.lastUpdated = new Date().toISOString();
                                  
                                  
                                  return newCorrections;
                                });
                                
                                learningToastShown = true;
                                setToast({
                                  message: `✓ Synced ${data.orderCount} orders | 🧠 Learning updated (${Object.keys(skuCorrections).length} SKUs calibrated)`,
                                  type: 'success'
                                });
                              }
                            } catch (learningErr) {
                              console.error('Auto-learning error (non-fatal):', learningErr);
                            }
                            // ========== END AUTO-LEARNING ==========
                            
                            setShopifySyncStatus({ loading: false, error: null, progress: '' });
                            setShopifySyncPreview(null);
                            
                            // Reset smart sync state
                            setShopifySmartSync({ enabled: true, missingDays: [], existingDays: [] });
                            
                            // Only show basic toast if learning toast wasn't shown
                            if (!learningToastShown) {
                              const skippedCount = shopifySmartSync.enabled ? shopifySmartSync.existingDays.length : 0;
                              setToast({ 
                                message: `Synced ${data.orderCount} orders across ${syncedDayCount} days` + (skippedCount > 0 ? ` (skipped ${skippedCount} existing)` : ''), 
                                type: 'success' 
                              });
                            }
                          } catch (err) {
                            setShopifySyncStatus({ loading: false, error: err.message, progress: '' });
                          }
                        }}
                        disabled={shopifySyncStatus.loading || !shopifySyncRange.start || !shopifySyncRange.end}
                        className="px-6 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg text-white font-medium flex items-center gap-2"
                      >
                        {shopifySyncStatus.loading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Syncing...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4" />
                            Sync Orders
                          </>
                        )}
                      </button>
                    </div>
                    
                    {shopifySyncStatus.progress && (
                      <p className="text-slate-400 text-sm mt-3 flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {shopifySyncStatus.progress}
                      </p>
                    )}
                    {shopifySyncStatus.error && (
                      <p className="text-rose-400 text-sm mt-3 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        {shopifySyncStatus.error}
                      </p>
                    )}
                  </div>
                  
                  {/* Inventory Sync Section */}
                  <div className="bg-slate-900/50 rounded-xl p-4 mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-white font-medium flex items-center gap-2">
                          <Boxes className="w-5 h-5 text-emerald-400" />
                          Inventory Sync
                        </h3>
                        <p className="text-slate-400 text-sm">Pull current inventory levels from Shopify (includes 3PL)</p>
                      </div>
                      {shopifyCredentials.lastInventorySync && (
                        <span className="text-xs text-slate-500">
                          Last: {new Date(shopifyCredentials.lastInventorySync).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex gap-3">
                      <button
                        onClick={async () => {
                          setShopifyInventoryStatus({ loading: true, error: null });
                          try {
                            const res = await fetch('/api/shopify/sync', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                storeUrl: shopifyCredentials.storeUrl,
                                accessToken: shopifyCredentials.clientSecret,
                                clientId: shopifyCredentials.clientId, clientSecret: shopifyCredentials.clientSecret,
                                syncType: 'inventory',
                              }),
                            });
                            const data = await res.json();
                            if (data.error) throw new Error(data.error);
                            setShopifyInventoryPreview(data);
                            setShopifyInventoryStatus({ loading: false, error: null, lastSync: new Date().toISOString() });
                          } catch (err) {
                            setShopifyInventoryStatus({ loading: false, error: err.message });
                          }
                        }}
                        disabled={shopifyInventoryStatus.loading}
                        className="px-4 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 rounded-lg text-white flex items-center gap-2"
                      >
                        <Eye className="w-4 h-4" />
                        Preview Inventory
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm('Sync inventory from Shopify? This will create a new inventory snapshot.')) return;
                          
                          setShopifyInventoryStatus({ loading: true, error: null });
                          try {
                            const res = await fetch('/api/shopify/sync', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                storeUrl: shopifyCredentials.storeUrl,
                                accessToken: shopifyCredentials.clientSecret,
                                clientId: shopifyCredentials.clientId, clientSecret: shopifyCredentials.clientSecret,
                                syncType: 'inventory',
                              }),
                            });
                            const data = await res.json();
                            if (data.error) throw new Error(data.error);
                            
                            // Get existing inventory data to preserve Amazon quantities
                            const existingDates = Object.keys(invHistory).sort().reverse();
                            const existingSnapshot = existingDates.length > 0 ? invHistory[existingDates[0]] : null;
                            const existingItemsBySku = {};
                            const normalizeSkuForLookup = (sku) => (sku || '').trim().toUpperCase();
                            if (existingSnapshot?.items) {
                              existingSnapshot.items.forEach(item => {
                                const normSku = normalizeSkuForLookup(item.sku);
                                // Keep the one with more inventory if duplicates exist
                                if (!existingItemsBySku[normSku] || (item.totalQty || 0) > (existingItemsBySku[normSku].totalQty || 0)) {
                                  existingItemsBySku[normSku] = item;
                                }
                              });
                            }
                            
                            // Create inventory snapshot - MERGE with existing data
                            const snapshotDate = data.date || new Date().toISOString().split('T')[0];
                            
                            // Track which normalized SKUs we've already processed to avoid duplicates
                            const processedSkus = new Set();
                            
                            // Build items with merged data
                            const mergedItems = data.items.map(item => {
                              const normSku = normalizeSkuForLookup(item.sku);
                              
                              // Skip if we've already processed this normalized SKU
                              if (processedSkus.has(normSku)) return null;
                              processedSkus.add(normSku);
                              
                              const existing = existingItemsBySku[normSku] || {};
                              // Use COGS if available, then Shopify cost, then existing cost
                              // savedCogs stores cost directly as number: savedCogs[sku] = 3.97
                              const cogsCost = typeof savedCogs[item.sku] === 'number' ? savedCogs[item.sku] : (savedCogs[item.sku]?.cost || 0);
                              const cost = cogsCost || item.cost || existing.cost || 0;
                              // Preserve Amazon quantities from existing data
                              const amazonQty = existing.amazonQty || 0;
                              const amazonInbound = existing.amazonInbound || 0;
                              const threeplQty = item.threeplQty || item.totalQty || 0;
                              const homeQty = item.homeQty || 0;
                              const totalQty = amazonQty + threeplQty + homeQty;
                              
                              return {
                                sku: item.sku.toUpperCase(), // Normalize SKU case
                                name: savedProductNames[item.sku] || savedProductNames[normSku] || item.name || existing.name || item.sku,
                                asin: existing.asin || '',
                                amazonQty: amazonQty, // PRESERVED from existing
                                threeplQty: threeplQty, // FROM SHOPIFY
                                homeQty: homeQty, // FROM SHOPIFY
                                totalQty: totalQty,
                                cost: cost, // FROM COGS or Shopify
                                totalValue: totalQty * cost,
                                weeklyVel: existing.weeklyVel || 0,
                                daysOfSupply: existing.daysOfSupply || 999,
                                health: existing.health || 'unknown',
                                amazonInbound: amazonInbound, // PRESERVED
                                threeplInbound: existing.threeplInbound || 0,
                                locations: item.locations,
                                byLocation: item.byLocation,
                              };
                            }).filter(Boolean); // Remove nulls from skipped duplicates
                            
                            // Also include SKUs that exist in previous snapshot but not in Shopify
                            // (These might be Amazon-only products)
                            Object.entries(existingItemsBySku).forEach(([normSku, existing]) => {
                              if (!processedSkus.has(normSku) && (existing.amazonQty > 0 || existing.amazonInbound > 0)) {
                                processedSkus.add(normSku);
                                const cogsCost = getCogsCost(existing.sku) || getCogsCost(normSku);
                                const cost = cogsCost || existing.cost || 0;
                                mergedItems.push({
                                  ...existing,
                                  sku: existing.sku.toUpperCase(), // Normalize case
                                  cost: cost,
                                  totalValue: (existing.amazonQty + (existing.threeplQty || 0)) * cost,
                                  threeplQty: 0, // Not in Shopify
                                  homeQty: 0,
                                  totalQty: existing.amazonQty + existing.amazonInbound,
                                });
                              }
                            });
                            
                            // Calculate summary totals
                            let totalUnits = 0, totalValue = 0, amazonUnits = 0, amazonValue = 0, threeplUnits = 0, threeplValue = 0;
                            mergedItems.forEach(item => {
                              totalUnits += item.totalQty || 0;
                              totalValue += item.totalValue || 0;
                              amazonUnits += item.amazonQty || 0;
                              amazonValue += (item.amazonQty || 0) * (item.cost || 0);
                              threeplUnits += item.threeplQty || 0;
                              threeplValue += (item.threeplQty || 0) * (item.cost || 0);
                            });
                            
                            const snapshot = {
                              date: snapshotDate,
                              createdAt: new Date().toISOString(),
                              velocitySource: 'Shopify inventory sync (merged)',
                              source: 'shopify-api-merged',
                              locations: data.locations,
                              summary: {
                                totalUnits,
                                totalValue,
                                amazonUnits,
                                amazonValue,
                                amazonInbound: existingSnapshot?.summary?.amazonInbound || 0,
                                threeplUnits,
                                threeplValue,
                                threeplInbound: existingSnapshot?.summary?.threeplInbound || 0,
                                skuCount: mergedItems.length,
                                critical: 0,
                                low: 0,
                                healthy: 0,
                                overstock: 0,
                              },
                              items: mergedItems.sort((a, b) => (b.totalValue || 0) - (a.totalValue || 0)),
                            };
                            
                            // Save to inventory history
                            const updated = { ...invHistory, [snapshotDate]: snapshot };
                            setInvHistory(updated);
                            saveInv(updated);
                            
                            // Update credentials with last sync time
                            setShopifyCredentials(p => ({ ...p, lastInventorySync: new Date().toISOString() }));
                            
                            setShopifyInventoryStatus({ loading: false, error: null, lastSync: new Date().toISOString() });
                            setShopifyInventoryPreview(null);
                            setToast({ 
                              message: `Synced ${data.summary.skuCount} SKUs, ${formatNumber(data.summary.totalUnits)} units from ${data.locations?.length || 0} locations`, 
                              type: 'success' 
                            });
                          } catch (err) {
                            setShopifyInventoryStatus({ loading: false, error: err.message });
                          }
                        }}
                        disabled={shopifyInventoryStatus.loading}
                        className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-white font-medium flex items-center gap-2"
                      >
                        {shopifyInventoryStatus.loading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Syncing...
                          </>
                        ) : (
                          <>
                            <Boxes className="w-4 h-4" />
                            Sync Inventory
                          </>
                        )}
                      </button>
                    </div>
                    
                    {shopifyInventoryStatus.error && (
                      <p className="text-rose-400 text-sm mt-3 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        {shopifyInventoryStatus.error}
                      </p>
                    )}
                    
                    {/* Inventory Preview */}
                    {shopifyInventoryPreview && (
                      <div className="mt-4 pt-4 border-t border-slate-700">
                        <h4 className="text-emerald-400 font-medium mb-3 flex items-center gap-2">
                          <Eye className="w-4 h-4" />
                          Inventory Preview
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                          <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                            <p className="text-xl font-bold text-white">{formatNumber(shopifyInventoryPreview.summary?.totalUnits || 0)}</p>
                            <p className="text-slate-400 text-xs">Total Units</p>
                          </div>
                          <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                            <p className="text-xl font-bold text-emerald-400">{formatCurrency(shopifyInventoryPreview.summary?.totalValue || 0)}</p>
                            <p className="text-slate-400 text-xs">Total Value</p>
                          </div>
                          <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                            <p className="text-xl font-bold text-white">{shopifyInventoryPreview.summary?.skuCount || 0}</p>
                            <p className="text-slate-400 text-xs">SKUs</p>
                          </div>
                          <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                            <p className="text-xl font-bold text-white">{shopifyInventoryPreview.locations?.length || 0}</p>
                            <p className="text-slate-400 text-xs">Locations</p>
                          </div>
                        </div>
                        
                        {/* Location Breakdown */}
                        {shopifyInventoryPreview.locations && shopifyInventoryPreview.locations.length > 0 && (
                          <div className="mb-4">
                            <p className="text-slate-400 text-sm mb-2">Locations:</p>
                            <div className="flex flex-wrap gap-2">
                              {shopifyInventoryPreview.locations.map(loc => (
                                <span key={loc.id} className={`px-3 py-1 rounded-lg text-xs ${
                                  loc.type === '3pl' ? 'bg-violet-900/50 text-violet-300 border border-violet-500/30' :
                                  loc.type === 'home' ? 'bg-amber-900/50 text-amber-300 border border-amber-500/30' :
                                  'bg-slate-700 text-slate-300'
                                }`}>
                                  {loc.name}
                                  {loc.type === '3pl' && ' (3PL)'}
                                  {loc.type === 'home' && ' (Home)'}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Top SKUs */}
                        {shopifyInventoryPreview.items && shopifyInventoryPreview.items.length > 0 && (
                          <div>
                            <p className="text-slate-400 text-sm mb-2">Top SKUs by Value:</p>
                            <div className="space-y-1 max-h-40 overflow-y-auto">
                              {shopifyInventoryPreview.items.slice(0, 8).map(item => (
                                <div key={item.sku} className="flex items-center justify-between text-xs bg-slate-800/30 rounded px-2 py-1">
                                  <span className="text-slate-300 truncate flex-1">{item.name}</span>
                                  <span className="text-white font-medium ml-2">{formatNumber(item.totalQty)}</span>
                                  <span className="text-emerald-400 ml-2">{formatCurrency(item.totalValue)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <p className="text-slate-500 text-xs mt-3">
                      💡 Includes inventory from all Shopify locations (3PL, warehouse, etc). Amazon FBA inventory requires separate upload.
                    </p>
                  </div>
                  
                  {/* Product Catalog Sync Section */}
                  <div className="bg-slate-900/50 rounded-xl p-4 mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-white font-medium flex items-center gap-2">
                          <Package className="w-5 h-5 text-violet-400" />
                          Product Catalog Sync
                        </h3>
                        <p className="text-slate-400 text-sm">Sync SKU → Product Name mappings from Shopify</p>
                      </div>
                      <span className="text-xs text-slate-500">
                        {Object.keys(savedProductNames).length} SKUs mapped
                      </span>
                    </div>
                    
                    <div className="flex gap-3">
                      <button
                        onClick={async () => {
                          setShopifySyncStatus(p => ({ ...p, loading: true, progress: 'Fetching product catalog...' }));
                          try {
                            const res = await fetch('/api/shopify/sync', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                storeUrl: shopifyCredentials.storeUrl,
                                accessToken: shopifyCredentials.clientSecret,
                                clientId: shopifyCredentials.clientId, clientSecret: shopifyCredentials.clientSecret,
                                syncType: 'products',
                              }),
                            });
                            const data = await res.json();
                            if (data.error) throw new Error(data.error);
                            
                            // Merge with existing product names (SKU is the key!)
                            // Shopify names don't overwrite manually set names
                            const mergedNames = { ...savedProductNames };
                            let newCount = 0;
                            let updatedCount = 0;
                            
                            Object.entries(data.catalog || {}).forEach(([sku, product]) => {
                              if (!mergedNames[sku]) {
                                // New SKU - add it
                                mergedNames[sku] = product.name;
                                newCount++;
                              } else if (mergedNames[sku] === sku) {
                                // SKU exists but name is just the SKU itself - update it
                                mergedNames[sku] = product.name;
                                updatedCount++;
                              }
                              // Otherwise keep existing name (user may have customized it)
                            });
                            
                            setSavedProductNames(mergedNames);
                            lsSet(PRODUCT_NAMES_KEY, JSON.stringify(mergedNames));
                            
                            setShopifySyncStatus(p => ({ ...p, loading: false, progress: '' }));
                            setToast({ 
                              message: `Synced ${data.skuCount} SKUs (${newCount} new, ${updatedCount} updated)`, 
                              type: 'success' 
                            });
                          } catch (err) {
                            setShopifySyncStatus(p => ({ ...p, loading: false, error: err.message, progress: '' }));
                          }
                        }}
                        disabled={shopifySyncStatus.loading}
                        className="px-6 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-white font-medium flex items-center gap-2"
                      >
                        {shopifySyncStatus.loading && shopifySyncStatus.progress?.includes('catalog') ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Syncing...
                          </>
                        ) : (
                          <>
                            <Package className="w-4 h-4" />
                            Sync Product Names
                          </>
                        )}
                      </button>
                    </div>
                    
                    <div className="mt-3 p-3 bg-slate-800/50 rounded-lg">
                      <p className="text-slate-300 text-xs mb-2 font-medium">How SKU Matching Works:</p>
                      <ul className="text-slate-400 text-xs space-y-1">
                        <li>• <strong className="text-white">SKU is the primary key</strong> - matches across Amazon & Shopify</li>
                        <li>• Product names are display-only (can differ between platforms)</li>
                        <li>• Existing custom names you've set won't be overwritten</li>
                        <li>• SKUs without a match show as the raw SKU code</li>
                      </ul>
                    </div>
                  </div>
                  
                  {/* Preview Results */}
                  {shopifySyncPreview && (
                    <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4 mb-6">
                      <h3 className="text-emerald-400 font-medium mb-3 flex items-center gap-2">
                        <Eye className="w-4 h-4" />
                        Sync Preview
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-white">{shopifySyncPreview.orderCount}</p>
                          <p className="text-slate-400 text-sm">Orders</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-emerald-400">{formatCurrency(shopifySyncPreview.totalRevenue)}</p>
                          <p className="text-slate-400 text-sm">Revenue</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-white">{shopifySyncPreview.totalUnits}</p>
                          <p className="text-slate-400 text-sm">Units</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-white">{shopifySyncPreview.uniqueDays}</p>
                          <p className="text-slate-400 text-sm">Days</p>
                        </div>
                      </div>
                      {shopifySyncPreview.skuBreakdown && shopifySyncPreview.skuBreakdown.length > 0 && (
                        <div className="border-t border-emerald-500/30 pt-3 mt-3">
                          <p className="text-slate-400 text-sm mb-2">Top SKUs:</p>
                          <div className="flex flex-wrap gap-2">
                            {shopifySyncPreview.skuBreakdown.slice(0, 5).map(sku => (
                              <span key={sku.sku} className="px-2 py-1 bg-slate-800 rounded text-xs text-slate-300">
                                {sku.sku}: {sku.units} units
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Tax Preview */}
                      {shopifySyncPreview.tax && (
                        <div className="border-t border-emerald-500/30 pt-3 mt-3">
                          <p className="text-slate-400 text-sm mb-2 flex items-center gap-2">
                            <DollarSign className="w-4 h-4" />
                            Sales Tax Summary:
                          </p>
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                              <p className="text-lg font-semibold text-emerald-400">{formatCurrency(shopifySyncPreview.tax.totalCollected)}</p>
                              <p className="text-xs text-slate-400">Tax to Remit</p>
                            </div>
                            <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                              <p className="text-lg font-semibold text-slate-300">{shopifySyncPreview.tax.byState?.length || 0}</p>
                              <p className="text-xs text-slate-400">States</p>
                            </div>
                          </div>
                          {shopifySyncPreview.tax.byState && shopifySyncPreview.tax.byState.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-slate-500 text-xs uppercase">Tax by State:</p>
                              <div className="flex flex-wrap gap-2">
                                {shopifySyncPreview.tax.byState.slice(0, 8).map(state => (
                                  <span key={state.stateCode} className="px-2 py-1 bg-slate-800 rounded text-xs text-slate-300">
                                    {state.stateCode}: {formatCurrency(state.taxCollected)}
                                  </span>
                                ))}
                                {shopifySyncPreview.tax.byState.length > 8 && (
                                  <span className="px-2 py-1 text-xs text-slate-500">+{shopifySyncPreview.tax.byState.length - 8} more</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* What Gets Synced */}
                  <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
                    <h3 className="text-blue-400 font-medium mb-3 flex items-center gap-2">
                      <HelpCircle className="w-4 h-4" />
                      What Gets Synced
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-slate-300 text-sm font-medium mb-2">📦 Orders Sync:</p>
                        <ul className="text-slate-400 text-sm space-y-1">
                          <li className="flex items-start gap-2">
                            <Check className="w-3 h-3 text-emerald-400 mt-1 shrink-0" />
                            <span>Daily & weekly revenue</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Check className="w-3 h-3 text-emerald-400 mt-1 shrink-0" />
                            <span>SKU-level units sold</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Check className="w-3 h-3 text-emerald-400 mt-1 shrink-0" />
                            <span>Tax by state</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Check className="w-3 h-3 text-emerald-400 mt-1 shrink-0" />
                            <span>Discounts applied</span>
                          </li>
                        </ul>
                      </div>
                      <div>
                        <p className="text-slate-300 text-sm font-medium mb-2">📋 Inventory Sync:</p>
                        <ul className="text-slate-400 text-sm space-y-1">
                          <li className="flex items-start gap-2">
                            <Check className="w-3 h-3 text-emerald-400 mt-1 shrink-0" />
                            <span>3PL stock levels</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Check className="w-3 h-3 text-emerald-400 mt-1 shrink-0" />
                            <span>All Shopify locations</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Check className="w-3 h-3 text-emerald-400 mt-1 shrink-0" />
                            <span>SKU/product details</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Check className="w-3 h-3 text-emerald-400 mt-1 shrink-0" />
                            <span>Cost values</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-blue-500/20">
                      <p className="text-blue-300 text-xs flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span><strong>Amazon inventory still requires manual upload</strong> since it's not in Shopify.</span>
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 rounded-xl border border-green-500/30 p-6">
                    <h3 className="text-green-400 font-semibold mb-4 flex items-center gap-2">
                      <Zap className="w-5 h-5" />
                      Quick Setup Guide (5 minutes)
                    </h3>
                    <ol className="space-y-4 text-slate-300">
                      <li className="flex gap-3">
                        <span className="w-6 h-6 rounded-full bg-green-600 text-white text-sm flex items-center justify-center shrink-0">1</span>
                        <div>
                          <p className="font-medium">Go to Shopify Admin</p>
                          <p className="text-slate-400 text-sm">Settings → Apps and sales channels → Develop apps</p>
                        </div>
                      </li>
                      <li className="flex gap-3">
                        <span className="w-6 h-6 rounded-full bg-green-600 text-white text-sm flex items-center justify-center shrink-0">2</span>
                        <div>
                          <p className="font-medium">Create a Custom App</p>
                          <p className="text-slate-400 text-sm">Click "Allow custom app development" if prompted, then "Create an app"</p>
                        </div>
                      </li>
                      <li className="flex gap-3">
                        <span className="w-6 h-6 rounded-full bg-green-600 text-white text-sm flex items-center justify-center shrink-0">3</span>
                        <div>
                          <p className="font-medium">Configure API Scopes</p>
                          <p className="text-slate-400 text-sm">Enable: <code className="bg-slate-800 px-1 rounded">read_orders</code>, <code className="bg-slate-800 px-1 rounded">read_products</code>, <code className="bg-slate-800 px-1 rounded">read_inventory</code>, <code className="bg-slate-800 px-1 rounded">read_locations</code></p>
                        </div>
                      </li>
                      <li className="flex gap-3">
                        <span className="w-6 h-6 rounded-full bg-green-600 text-white text-sm flex items-center justify-center shrink-0">4</span>
                        <div>
                          <p className="font-medium">Install & Get Token</p>
                          <p className="text-slate-400 text-sm">Click Install, then copy the Admin API access token</p>
                        </div>
                      </li>
                      <li className="flex gap-3">
                        <span className="w-6 h-6 rounded-full bg-green-600 text-white text-sm flex items-center justify-center shrink-0">5</span>
                        <div>
                          <p className="font-medium">Connect Here</p>
                          <p className="text-slate-400 text-sm">Go to Settings and enter your store URL + token</p>
                        </div>
                      </li>
                    </ol>
                    <button
                      onClick={() => setView('settings')}
                      className="mt-6 w-full py-3 bg-green-600 hover:bg-green-500 rounded-xl text-white font-semibold flex items-center justify-center gap-2"
                    >
                      <Settings className="w-5 h-5" />
                      Go to Settings to Connect
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Import/Export */}
          <div className="mt-6 flex gap-3 justify-center">
            <button onClick={exportAll} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white flex items-center gap-2"><Download className="w-4 h-4" />Export All Data</button>
            <label className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white flex items-center gap-2 cursor-pointer"><Upload className="w-4 h-4" />Import Data<input type="file" accept=".json" onChange={(e) => e.target.files[0] && importData(e.target.files[0])} className="hidden" /></label>
          </div>
        </div>
      </div>
    );

};

export default UploadView;
