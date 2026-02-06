import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  X, Check, Upload, Download, Edit, Save, DollarSign, Clock, AlertTriangle, AlertCircle, Settings, Eye, Filter, FileText, Grid, List, Code, Home
} from 'lucide-react';
import { formatCurrency, formatPercent, formatNumber } from '../../utils/format';
import { hasDailySalesData } from '../../utils/date';
import { lsSet } from '../../utils/storage';
import NavTabs from '../ui/NavTabs';

const SalesTaxView = ({
  allDaysData,
  allPeriodsData,
  allWeeksData,
  appSettings,
  bankingData,
  editPortalUrlValue,
  editingPortalUrl,
  files,
  filingDetailState,
  globalModals,
  invHistory,
  navDropdown,
  periodLabel,
  salesTaxConfig,
  setEditPortalUrlValue,
  setEditingPortalUrl,
  setFilingDetailState,
  setNavDropdown,
  setParsedTaxReport,
  setSelectedDay,
  setSelectedInvDate,
  setSelectedPeriod,
  setSelectedTaxState,
  setSelectedWeek,
  setShowHiddenStates,
  setShowTaxStateConfig,
  setTaxConfigState,
  setTaxFilterStatus,
  setTaxPeriodType,
  setTaxPeriodValue,
  setTaxReportFileName,
  setToast,
  setUploadTab,
  setViewingStateHistory,
  showHiddenStates,
  taxFilterStatus,
  taxPeriodType,
  taxPeriodValue,
  viewingStateHistory,
  setView,
  view
}) => {
  const { nexusStates, filingHistory, hiddenStates } = salesTaxConfig;
  
  // Get states with nexus sorted by next due date
  const nexusStatesList = Object.entries(nexusStates || {})
    .filter(([code, config]) => config.hasNexus)
    .map(([code, config]) => ({
      code,
      ...US_STATES_TAX_INFO[code],
      ...config,
      nextDue: getNextDueDate(config.frequency || 'monthly', code)
    }))
    .sort((a, b) => a.nextDue - b.nextDue);
  
  // Calculate upcoming due items
  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  
  const overdue = nexusStatesList.filter(s => s.nextDue < now);
  const dueSoon = nexusStatesList.filter(s => s.nextDue >= now && s.nextDue <= sevenDays);
  const upcoming = nexusStatesList.filter(s => s.nextDue > sevenDays && s.nextDue <= thirtyDays);
  
  // Handle tax report file upload
  const handleTaxReportUpload = (file, stateCode) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = parseCSV(e.target.result);
      const parsed = parseShopifyTaxReport(data, stateCode);
      setParsedTaxReport(parsed);
      setTaxReportFileName(file.name);
    };
    reader.readAsText(file);
  };
  
  // Toggle nexus for a state
  const toggleNexus = (stateCode) => {
    const updated = { ...salesTaxConfig };
    if (!updated.nexusStates) updated.nexusStates = {};
    if (!updated.nexusStates[stateCode]) {
      updated.nexusStates[stateCode] = { hasNexus: true, frequency: 'monthly', registrationId: '', customFilings: [], notes: '' };
    } else {
      updated.nexusStates[stateCode].hasNexus = !updated.nexusStates[stateCode].hasNexus;
    }
    saveSalesTax(updated);
  };
  
  // Toggle hidden state
  const toggleHideState = (stateCode) => {
    const updated = { ...salesTaxConfig };
    if (!updated.hiddenStates) updated.hiddenStates = [];
    if (updated.hiddenStates.includes(stateCode)) {
      updated.hiddenStates = updated.hiddenStates.filter(s => s !== stateCode);
    } else {
      updated.hiddenStates = [...updated.hiddenStates, stateCode];
    }
    saveSalesTax(updated);
  };
  
  // Update state config
  const updateStateConfig = (stateCode, field, value) => {
    const updated = { ...salesTaxConfig };
    if (!updated.nexusStates) updated.nexusStates = {};
    if (!updated.nexusStates[stateCode]) {
      updated.nexusStates[stateCode] = { hasNexus: false, frequency: 'monthly', registrationId: '', customFilings: [], notes: '' };
    }
    updated.nexusStates[stateCode][field] = value;
    saveSalesTax(updated);
  };
  
  // Add custom filing to a state
  const addCustomFiling = (stateCode, filing) => {
    const updated = { ...salesTaxConfig };
    if (!updated.nexusStates[stateCode].customFilings) {
      updated.nexusStates[stateCode].customFilings = [];
    }
    updated.nexusStates[stateCode].customFilings.push(filing);
    saveSalesTax(updated);
  };
  
  // Remove custom filing
  const removeCustomFiling = (stateCode, index) => {
    const updated = { ...salesTaxConfig };
    updated.nexusStates[stateCode].customFilings.splice(index, 1);
    saveSalesTax(updated);
  };
  
  // Mark filing as complete
  const markFilingComplete = (stateCode, periodKey, data) => {
    const updated = { ...salesTaxConfig };
    if (!updated.filingHistory[stateCode]) {
      updated.filingHistory[stateCode] = {};
    }
    updated.filingHistory[stateCode][periodKey] = {
      filed: true,
      filedDate: new Date().toISOString(),
      ...data
    };
    saveSalesTax(updated);
    setParsedTaxReport(null);
    setTaxReportFileName('');
  };
  
  // StateConfigModal and FilingDetailModal extracted to separate components


    return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 lg:p-6">
      <div className="max-w-7xl mx-auto">{globalModals}
        
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white">Sales Tax Management</h1>
            <p className="text-slate-400">Track nexus, filings, and compliance across states</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-slate-400 text-sm">{Object.values(nexusStates).filter(s => s.hasNexus).length} states with nexus</span>
          </div>
        </div>
        
        <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />
        
        {/* Alerts */}
        {(overdue.length > 0 || dueSoon.length > 0) && (
          <div className="mb-6 space-y-2">
            {overdue.map(s => (
              <div key={s.code} className="flex items-center justify-between p-3 bg-rose-900/30 border border-rose-500/50 rounded-xl">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                  <span className="text-rose-300"><strong>{s.name}</strong> filing is overdue! Was due {s.nextDue.toLocaleDateString()}</span>
                </div>
                <button onClick={() => setSelectedTaxState(s.code)} className="px-3 py-1 bg-rose-600 hover:bg-rose-500 rounded-lg text-sm text-white">File Now</button>
              </div>
            ))}
            {dueSoon.map(s => (
              <div key={s.code} className="flex items-center justify-between p-3 bg-amber-900/30 border border-amber-500/50 rounded-xl">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-amber-400" />
                  <span className="text-amber-300"><strong>{s.name}</strong> due in {Math.ceil((s.nextDue - now) / (1000 * 60 * 60 * 24))} days ({s.nextDue.toLocaleDateString()})</span>
                </div>
                <button onClick={() => setSelectedTaxState(s.code)} className="px-3 py-1 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm text-white">File</button>
              </div>
            ))}
          </div>
        )}
        
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5">
            <p className="text-slate-400 text-sm">States with Nexus</p>
            <p className="text-3xl font-bold text-white">{nexusStatesList.length}</p>
          </div>
          <div className="bg-rose-900/20 border border-rose-500/30 rounded-2xl p-5">
            <p className="text-rose-400 text-sm">Overdue</p>
            <p className="text-3xl font-bold text-rose-400">{overdue.length}</p>
          </div>
          <div className="bg-amber-900/20 border border-amber-500/30 rounded-2xl p-5">
            <p className="text-amber-400 text-sm">Due Within 7 Days</p>
            <p className="text-3xl font-bold text-amber-400">{dueSoon.length}</p>
          </div>
          <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-2xl p-5">
            <p className="text-emerald-400 text-sm">Upcoming (30 days)</p>
            <p className="text-3xl font-bold text-emerald-400">{upcoming.length}</p>
          </div>
        </div>
        
        {/* Shopify Tax Calculator */}
        {(() => {
          // Calculate date range based on period selection
          const getDateRange = () => {
            const [year, periodNum] = taxPeriodValue.split('-').map(Number);
            let start, end;
            
            if (taxPeriodType === 'month') {
              start = new Date(year, periodNum - 1, 1);
              end = new Date(year, periodNum, 0);
            } else if (taxPeriodType === 'quarter') {
              const quarterStart = (periodNum - 1) * 3;
              start = new Date(year, quarterStart, 1);
              end = new Date(year, quarterStart + 3, 0);
            } else if (taxPeriodType === 'semiannual') {
              const halfStart = (periodNum - 1) * 6;
              start = new Date(year, halfStart, 1);
              end = new Date(year, halfStart + 6, 0);
            } else { // annual
              start = new Date(year, 0, 1);
              end = new Date(year, 11, 31);
            }
            
            return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
          };
          
          // Aggregate tax by state from daily data
          const calculateTaxByState = () => {
            const { start, end } = getDateRange();
            const taxByStateMap = {};
            let totalTax = 0;
            let shopPayExcluded = 0;
            let daysWithData = 0;
            
            Object.entries(allDaysData).forEach(([dateKey, dayData]) => {
              if (dateKey >= start && dateKey <= end && dayData.shopify?.taxByState) {
                daysWithData++;
                Object.entries(dayData.shopify.taxByState).forEach(([stateCode, stateTax]) => {
                  if (!taxByStateMap[stateCode]) {
                    taxByStateMap[stateCode] = { 
                      tax: 0, 
                      sales: 0,  // Item sales only
                      shipping: 0,  // Shipping charges
                      orders: 0,
                      shopPayTax: 0,
                      shopPaySales: 0,
                      shopPayShipping: 0,
                      shopPayOrders: 0,
                      jurisdictions: {}  // Jurisdiction-level breakdown
                    };
                  }
                  // Handle both old format (number) and new format (object)
                  if (typeof stateTax === 'number') {
                    taxByStateMap[stateCode].tax += stateTax;
                  } else {
                    taxByStateMap[stateCode].tax += stateTax.tax || 0;
                    taxByStateMap[stateCode].sales += stateTax.sales || 0;
                    taxByStateMap[stateCode].shipping += stateTax.shipping || 0;
                    taxByStateMap[stateCode].orders += stateTax.orders || 0;
                    // Shop Pay breakdown
                    taxByStateMap[stateCode].shopPayTax += stateTax.shopPayTax || 0;
                    taxByStateMap[stateCode].shopPaySales += stateTax.shopPaySales || 0;
                    taxByStateMap[stateCode].shopPayShipping += stateTax.shopPayShipping || 0;
                    taxByStateMap[stateCode].shopPayOrders += stateTax.shopPayOrders || 0;
                    
                    // Aggregate jurisdiction data
                    if (stateTax.jurisdictions) {
                      Object.entries(stateTax.jurisdictions).forEach(([jurisdiction, jData]) => {
                        if (!taxByStateMap[stateCode].jurisdictions[jurisdiction]) {
                          taxByStateMap[stateCode].jurisdictions[jurisdiction] = {
                            tax: 0, sales: 0, orders: 0, rate: jData.rate || 0
                          };
                        }
                        taxByStateMap[stateCode].jurisdictions[jurisdiction].tax += jData.tax || 0;
                        taxByStateMap[stateCode].jurisdictions[jurisdiction].sales += jData.sales || 0;
                        taxByStateMap[stateCode].jurisdictions[jurisdiction].orders += jData.orders || 0;
                      });
                    }
                  }
                });
                totalTax += dayData.shopify.taxTotal || 0;
                shopPayExcluded += dayData.shopify.shopPayTaxExcluded || 0;
              }
            });
            
            return {
              byState: Object.entries(taxByStateMap)
                .map(([code, data]) => {
                  const stateInfo = US_STATES_TAX_INFO[code];
                  const shippingTaxable = stateInfo?.shippingTaxable || false;
                  
                  // Calculate taxable sales based on whether state taxes shipping
                  const itemSales = data.sales + data.shopPaySales;
                  const totalShipping = data.shipping + data.shopPayShipping;
                  const taxableSales = shippingTaxable ? (itemSales + totalShipping) : itemSales;
                  
                  return { 
                    stateCode: code, 
                    stateName: stateInfo?.name || code,
                    shippingTaxable,
                    // Sales breakdown
                    itemSales: itemSales,
                    shipping: totalShipping,
                    // Total taxable sales (includes shipping if state taxes it)
                    totalSales: taxableSales,
                    totalOrders: data.orders + data.shopPayOrders,
                    totalTax: data.tax + data.shopPayTax,
                    // What YOU owe (non-Shop Pay only)
                    taxOwed: data.tax,
                    salesYouOwe: shippingTaxable ? (data.sales + data.shipping) : data.sales,
                    ordersYouOwe: data.orders,
                    // Shop Pay (Shopify remits this)
                    shopPayTax: data.shopPayTax,
                    shopPaySales: data.shopPaySales,
                    shopPayOrders: data.shopPayOrders,
                    // Jurisdiction breakdown for county/city level reporting
                    jurisdictions: Object.entries(data.jurisdictions || {})
                      .map(([name, jData]) => ({
                        name,
                        tax: jData.tax,
                        sales: jData.sales,
                        orders: jData.orders,
                        rate: jData.rate
                      }))
                      .filter(j => j.tax > 0 || j.sales > 0)
                      .sort((a, b) => b.tax - a.tax),
                    // Raw data
                    ...data 
                  };
                })
                .sort((a, b) => b.totalSales - a.totalSales), // Sort by total sales
              totalTax,
              shopPayExcluded,
              daysWithData,
              // Calculate totals for Shop Pay
              totalShopPayOrders: Object.values(taxByStateMap).reduce((sum, d) => sum + d.shopPayOrders, 0),
              totalShopPaySales: Object.values(taxByStateMap).reduce((sum, d) => sum + d.shopPaySales, 0),
            };
          };
          
          const taxData = calculateTaxByState();
          const hasShopifyTaxData = taxData.daysWithData > 0;
          
          // Period options based on type
          const getPeriodOptions = () => {
            const currentYear = new Date().getFullYear();
            const options = [];
            
            if (taxPeriodType === 'month') {
              for (let y = currentYear; y >= currentYear - 1; y--) {
                for (let m = 12; m >= 1; m--) {
                  if (y === currentYear && m > new Date().getMonth() + 1) continue;
                  options.push({ value: `${y}-${String(m).padStart(2, '0')}`, label: `${new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}` });
                }
              }
            } else if (taxPeriodType === 'quarter') {
              for (let y = currentYear; y >= currentYear - 1; y--) {
                for (let q = 4; q >= 1; q--) {
                  if (y === currentYear && q > Math.ceil((new Date().getMonth() + 1) / 3)) continue;
                  options.push({ value: `${y}-${q}`, label: `Q${q} ${y}` });
                }
              }
            } else if (taxPeriodType === 'semiannual') {
              for (let y = currentYear; y >= currentYear - 1; y--) {
                for (let h = 2; h >= 1; h--) {
                  if (y === currentYear && h === 2 && new Date().getMonth() < 6) continue;
                  options.push({ value: `${y}-${h}`, label: `${h === 1 ? 'H1' : 'H2'} ${y} (${h === 1 ? 'Jan-Jun' : 'Jul-Dec'})` });
                }
              }
            } else {
              for (let y = currentYear; y >= currentYear - 2; y--) {
                options.push({ value: `${y}-1`, label: `${y}` });
              }
            }
            
            return options;
          };
          
          return (
            <div className="mb-6 bg-gradient-to-r from-green-900/20 to-emerald-900/20 border border-green-500/30 rounded-2xl p-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-green-400" />
                    Shopify Tax Calculator
                  </h3>
                  <p className="text-slate-400 text-sm">Tax collected from synced Shopify orders</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={taxPeriodType}
                    onChange={(e) => {
                      setTaxPeriodType(e.target.value);
                      // Reset to first option of new type
                      const currentYear = new Date().getFullYear();
                      if (e.target.value === 'month') {
                        setTaxPeriodValue(`${currentYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
                      } else if (e.target.value === 'quarter') {
                        setTaxPeriodValue(`${currentYear}-${Math.ceil((new Date().getMonth() + 1) / 3)}`);
                      } else if (e.target.value === 'semiannual') {
                        setTaxPeriodValue(`${currentYear}-${new Date().getMonth() < 6 ? 1 : 2}`);
                      } else {
                        setTaxPeriodValue(`${currentYear}-1`);
                      }
                    }}
                    className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    <option value="month">Monthly</option>
                    <option value="quarter">Quarterly</option>
                    <option value="semiannual">Semi-Annual</option>
                    <option value="annual">Annual</option>
                  </select>
                  <select
                    value={taxPeriodValue}
                    onChange={(e) => setTaxPeriodValue(e.target.value)}
                    className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    {getPeriodOptions().map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              {hasShopifyTaxData ? (
                <>
                  {/* Main Summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="bg-gradient-to-br from-rose-600/30 to-rose-900/30 border-2 border-rose-500/50 rounded-xl p-4 text-center">
                      <p className="text-xs text-rose-300 font-semibold uppercase tracking-wide mb-1">💰 YOU OWE</p>
                      <p className="text-3xl font-bold text-rose-400">{formatCurrency(taxData.totalTax)}</p>
                      <p className="text-rose-300/70 text-xs mt-1">Tax to remit this period</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-xl p-4 text-center">
                      <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">Total Collected</p>
                      <p className="text-2xl font-bold text-white">{formatCurrency(taxData.totalTax + taxData.shopPayExcluded)}</p>
                      <p className="text-slate-500 text-xs mt-1">from all orders</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-xl p-4 text-center">
                      <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">States</p>
                      <p className="text-2xl font-bold text-white">{taxData.byState.length}</p>
                      <p className="text-slate-500 text-xs mt-1">with sales this period</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-xl p-4 text-center">
                      <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">Days Synced</p>
                      <p className="text-2xl font-bold text-white">{taxData.daysWithData}</p>
                      <p className="text-slate-500 text-xs mt-1">in selected period</p>
                    </div>
                  </div>
                  
                  {/* States Where You Owe Tax */}
                  {taxData.byState.filter(s => s.tax > 0).length > 0 && (
                    <div className="bg-rose-900/20 border border-rose-500/30 rounded-xl p-4 mb-4">
                      <h4 className="text-rose-400 font-semibold mb-3 flex items-center gap-2">
                        <AlertCircle className="w-5 h-5" />
                        States Where You Owe Tax
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {taxData.byState.filter(s => s.tax > 0).map(state => {
                          const hasNexus = nexusStates[state.stateCode]?.hasNexus;
                          return (
                            <div key={state.stateCode} className={`p-3 rounded-lg ${hasNexus ? 'bg-rose-800/30 border border-rose-500/50' : 'bg-slate-800/50 border border-slate-600/50'}`}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-white font-bold">{state.stateCode}</span>
                                {hasNexus && <span className="text-xs bg-rose-600 text-white px-1.5 py-0.5 rounded">NEXUS</span>}
                              </div>
                              <p className="text-xl font-bold text-rose-400">{formatCurrency(state.tax)}</p>
                              <p className="text-slate-500 text-xs">{state.orders} orders • {formatCurrency(state.sales)} sales</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  {/* NEXUS States Quick Actions - Your Filing Obligations */}
                  {(() => {
                    const nexusStatesWithData = taxData.byState.filter(s => nexusStates[s.stateCode]?.hasNexus);
                    const totalNexusTaxOwed = nexusStatesWithData.reduce((s, st) => s + (st.taxOwed || st.tax || 0), 0);
                    const periodKey = taxPeriodType === 'month' ? taxPeriodValue : `${taxPeriodValue.split('-')[0]}-Q${taxPeriodValue.split('-')[1]}`;
                    const unfiledStates = nexusStatesWithData.filter(s => !salesTaxConfig.filingHistory?.[s.stateCode]?.[periodKey]?.filed);
                    const filedStates = nexusStatesWithData.filter(s => salesTaxConfig.filingHistory?.[s.stateCode]?.[periodKey]?.filed);
                    
                    // Helper: Check if filing is due for this period based on frequency
                    const isFilingDueForPeriod = (stateCode) => {
                      const config = nexusStates[stateCode] || {};
                      const frequency = config.frequency || 'monthly';
                      const [year, period] = taxPeriodValue.split('-');
                      const periodMonth = parseInt(period);
                      
                      if (taxPeriodType === 'month') {
                        if (frequency === 'monthly') return true;
                        if (frequency === 'quarterly') {
                          // Q1: Mar, Q2: Jun, Q3: Sep, Q4: Dec
                          return [3, 6, 9, 12].includes(periodMonth);
                        }
                        if (frequency === 'semi-annual') {
                          // H1: Jun, H2: Dec
                          return [6, 12].includes(periodMonth);
                        }
                        if (frequency === 'annual') {
                          return periodMonth === 12;
                        }
                      }
                      return true; // Default to due
                    };
                    
                    // Filter to only states with filings due this period
                    const statesDueThisPeriod = unfiledStates.filter(s => isFilingDueForPeriod(s.stateCode));
                    const statesNotDueYet = unfiledStates.filter(s => !isFilingDueForPeriod(s.stateCode));
                    
                    // Helper to download a single state's filing
                    const downloadStateFiling = (state) => {
                      const { start, end } = getDateRange();
                      // Use taxPeriodValue directly to avoid timezone issues
                      let periodLabel;
                      if (taxPeriodType === 'month') {
                        const [year, month] = taxPeriodValue.split('-');
                        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        periodLabel = `${monthNames[parseInt(month) - 1]}-${year}`;
                      } else {
                        periodLabel = taxPeriodValue;
                      }
                      const stateInfo = US_STATES_TAX_INFO[state.stateCode];
                      const filingFormat = STATE_FILING_FORMATS[state.stateCode] || STATE_FILING_FORMATS.DEFAULT;
                      const calculated = filingFormat.calculate(state, stateInfo);
                      
                      let csv = `${stateInfo?.name || state.stateCode} Sales Tax Return\n`;
                      csv += `Period: ${periodLabel}\n`;
                      csv += `Form: ${filingFormat.formName}\n`;
                      csv += `Generated: ${new Date().toLocaleDateString()}\n`;
                      csv += `\nVERIFY: Compare with Shopify Admin > Analytics > Reports > Taxes\n\n`;
                      csv += `Field,Value,Notes\n`;
                      
                      filingFormat.fields.forEach(field => {
                        const val = calculated[field.key];
                        const formattedVal = typeof val === 'number' ? val.toFixed(2) : (val || '');
                        csv += `"${field.name}",${formattedVal},"${field.description || ''}"\n`;
                      });
                      
                      csv += `\nState Tax Rate,${((stateInfo?.stateRate || 0) * 100).toFixed(2)}%\n`;
                      csv += `Orders,${state.totalOrders || state.orders || 0}\n`;
                      
                      if (filingFormat.note) csv += `\nNote:,"${filingFormat.note}"\n`;
                      
                      const portalUrl = nexusStates[state.stateCode]?.portalUrl || STATE_FILING_FORMATS[state.stateCode]?.website;
                      if (portalUrl) csv += `\nFile Online:,${portalUrl}\n`;
                      
                      const blob = new Blob([csv], { type: 'text/csv' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${state.stateCode}-SalesTax-${periodLabel}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    };
                    
                    // Get portal URL for a state (custom > default)
                    const getPortalUrl = (stateCode) => {
                      return nexusStates[stateCode]?.portalUrl || STATE_FILING_FORMATS[stateCode]?.website || null;
                    };
                    
                    if (nexusStatesWithData.length === 0) return null;
                    
                    return (
                      <div className="bg-gradient-to-r from-rose-900/30 to-violet-900/30 border border-rose-500/30 rounded-xl p-4 mb-6">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h4 className="text-lg font-bold text-white flex items-center gap-2">
                              🏛️ Your Filing Obligations
                            </h4>
                            <p className="text-slate-400 text-sm">
                              {statesDueThisPeriod.length > 0 
                                ? `${statesDueThisPeriod.length} state${statesDueThisPeriod.length > 1 ? 's' : ''} due for ${taxPeriodValue}`
                                : unfiledStates.length > 0 
                                  ? 'No filings due this period'
                                  : 'All filings complete! ✓'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-slate-400">Total You Owe</p>
                            <p className="text-2xl font-bold text-rose-400">{formatCurrency(totalNexusTaxOwed)}</p>
                          </div>
                        </div>
                        
                        {/* States DUE This Period */}
                        {statesDueThisPeriod.length > 0 && (
                          <>
                            <p className="text-xs text-rose-400 mb-2 font-semibold">⚠️ DUE THIS PERIOD:</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                              {statesDueThisPeriod.map(state => {
                                const stateInfo = US_STATES_TAX_INFO[state.stateCode];
                                const config = nexusStates[state.stateCode] || {};
                                const portalUrl = getPortalUrl(state.stateCode);
                                return (
                                  <div key={state.stateCode} className="bg-slate-800/80 rounded-lg p-3 border border-rose-500/50">
                                    <div className="flex justify-between items-center mb-1">
                                      <div>
                                        <span className="font-bold text-white">{state.stateName}</span>
                                        <span className="text-xs text-slate-500 ml-2">({config.frequency || 'monthly'})</span>
                                      </div>
                                      <span className="text-rose-400 font-bold">{formatCurrency(state.taxOwed || state.tax || 0)}</span>
                                    </div>
                                    <div className="flex gap-2 mt-2">
                                      <button
                                        onClick={() => downloadStateFiling(state)}
                                        className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1.5 rounded font-medium"
                                        title="Download filing data"
                                      >
                                        ⬇️ Export
                                      </button>
                                      <button
                                        onClick={() => setFilingDetailState({ stateCode: state.stateCode, data: state })}
                                        className="text-xs bg-violet-600 hover:bg-violet-500 text-white px-2 py-1.5 rounded font-medium"
                                      >
                                        📋 Details
                                      </button>
                                      {portalUrl && (
                                        <button
                                          onClick={() => window.open(portalUrl, '_blank')}
                                          className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1.5 rounded font-medium"
                                          title={`Open ${state.stateCode} tax portal`}
                                        >
                                          🔗 File Online
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                        
                        {/* States NOT Due Yet (accumulating) */}
                        {statesNotDueYet.length > 0 && (
                          <div className="mb-4">
                            <p className="text-xs text-amber-400 mb-2">📅 Accumulating (not due yet):</p>
                            <div className="flex flex-wrap gap-2">
                              {statesNotDueYet.map(state => {
                                const config = nexusStates[state.stateCode] || {};
                                return (
                                  <div key={state.stateCode} className="text-xs bg-amber-900/30 text-amber-300 px-2 py-1 rounded border border-amber-500/30 flex items-center gap-2">
                                    <span>{state.stateCode}: {formatCurrency(state.taxOwed || state.tax || 0)}</span>
                                    <span className="text-amber-500">({config.frequency || 'monthly'})</span>
                                    <button
                                      onClick={() => downloadStateFiling(state)}
                                      className="hover:text-amber-200"
                                      title="Download anyway"
                                    >
                                      ⬇️
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        
                        {/* Filed States */}
                        {filedStates.length > 0 && (
                          <div className="mb-4">
                            <p className="text-xs text-emerald-400 mb-2">✓ Filed this period:</p>
                            <div className="flex flex-wrap gap-2">
                              {filedStates.map(state => (
                                <span key={state.stateCode} className="text-xs bg-emerald-900/50 text-emerald-300 px-2 py-1 rounded border border-emerald-500/30">
                                  {state.stateCode} • {formatCurrency(salesTaxConfig.filingHistory?.[state.stateCode]?.[periodKey]?.amount || state.taxOwed || 0)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Download All DUE States Button */}
                        {statesDueThisPeriod.length > 0 && (
                          <button
                            onClick={async () => {
                              for (const state of statesDueThisPeriod) {
                                downloadStateFiling(state);
                                await new Promise(resolve => setTimeout(resolve, 300));
                              }
                              setToast({ message: `Downloaded ${statesDueThisPeriod.length} state filings`, type: 'success' });
                            }}
                            className="w-full px-4 py-3 bg-gradient-to-r from-violet-600 to-rose-600 hover:from-violet-500 hover:to-rose-500 rounded-lg text-white font-bold flex items-center justify-center gap-2"
                          >
                            <Download className="w-5 h-5" />
                            Download All Due Filings ({statesDueThisPeriod.length} files)
                          </button>
                        )}
                      </div>
                    );
                  })()}
                  
                  {taxData.byState.length > 0 && (
                    <>
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="text-white font-medium">All States with Sales</h4>
                        <button
                          onClick={() => {
                            // Export tax data as CSV for filing
                            const { start, end } = getDateRange();
                            // Use taxPeriodValue directly to avoid timezone issues
                            let periodLabel;
                            if (taxPeriodType === 'month') {
                              const [year, month] = taxPeriodValue.split('-');
                              const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                              periodLabel = `${monthNames[parseInt(month) - 1]} ${year}`;
                            } else if (taxPeriodType === 'quarter') {
                              periodLabel = `Q${taxPeriodValue.split('-')[1]} ${taxPeriodValue.split('-')[0]}`;
                            } else if (taxPeriodType === 'semiannual') {
                              periodLabel = `${taxPeriodValue.split('-')[1] === '1' ? 'H1' : 'H2'} ${taxPeriodValue.split('-')[0]}`;
                            } else {
                              periodLabel = taxPeriodValue.split('-')[0];
                            }
                            
                            // Create CSV with all fields states typically need
                            let csv = 'State,State Code,Item Sales,Shipping,Taxable Sales,Total Tax,Tax You Owe,Shipping Taxable,Total Orders,Has Nexus,Period,Start Date,End Date\n';
                            taxData.byState.forEach(state => {
                              const hasNexus = nexusStates[state.stateCode]?.hasNexus ? 'Yes' : 'No';
                              const itemSales = state.itemSales || state.sales || 0;
                              const shipping = state.shipping || 0;
                              const taxableSales = state.totalSales || state.sales || 0;
                              const totalTax = state.totalTax || state.tax || 0;
                              const taxOwed = state.taxOwed || state.tax || 0;
                              const shippingTaxable = state.shippingTaxable ? 'Yes' : 'No';
                              const totalOrders = state.totalOrders || state.orders || 0;
                              csv += `"${state.stateName}",${state.stateCode},${itemSales.toFixed(2)},${shipping.toFixed(2)},${taxableSales.toFixed(2)},${totalTax.toFixed(2)},${taxOwed.toFixed(2)},${shippingTaxable},${totalOrders},${hasNexus},"${periodLabel}",${start},${end}\n`;
                            });
                            const grandTotalItemSales = taxData.byState.reduce((s, st) => s + (st.itemSales || st.sales || 0), 0);
                            const grandTotalShipping = taxData.byState.reduce((s, st) => s + (st.shipping || 0), 0);
                            const grandTotalTaxableSales = taxData.byState.reduce((s, st) => s + (st.totalSales || st.sales || 0), 0);
                            const grandTotalTax = taxData.byState.reduce((s, st) => s + (st.totalTax || st.tax || 0), 0);
                            const grandTotalOrders = taxData.byState.reduce((s, st) => s + (st.totalOrders || st.orders || 0), 0);
                            csv += `"TOTAL",,${grandTotalItemSales.toFixed(2)},${grandTotalShipping.toFixed(2)},${grandTotalTaxableSales.toFixed(2)},${grandTotalTax.toFixed(2)},${taxData.totalTax.toFixed(2)},,${grandTotalOrders},,"${periodLabel}",${start},${end}\n`;
                            csv += '\n"Item Sales = Product sales only (excludes shipping)"\n';
                            csv += '"Taxable Sales = Item Sales + Shipping (if shipping is taxable in that state)"\n';
                            csv += '"Tax You Owe = What you need to file and pay yourself"\n';
                            
                            const blob = new Blob([csv], { type: 'text/csv' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `sales-tax-${periodLabel.replace(/\s+/g, '-')}.csv`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="px-3 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/50 rounded-lg text-sm text-emerald-300 flex items-center gap-1"
                        >
                          <Download className="w-4 h-4" />
                          Export for Filing
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-700">
                            <th className="text-left text-slate-400 py-2 px-2">State</th>
                            <th className="text-right text-slate-400 py-2 px-2">
                              <span title="Includes shipping if taxable in that state">Taxable Sales</span>
                            </th>
                            <th className="text-right text-slate-400 py-2 px-2">Total Tax</th>
                            <th className="text-right text-slate-400 py-2 px-2">
                              <span className="text-rose-400">YOU OWE</span>
                            </th>
                            <th className="text-right text-slate-400 py-2 px-2">Orders</th>
                            <th className="text-center text-slate-400 py-2 px-2">Status</th>
                            <th className="text-center text-slate-400 py-2 px-2">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {taxData.byState.map(state => {
                            const hasNexus = nexusStates[state.stateCode]?.hasNexus;
                            const owes = state.taxOwed > 0;
                            return (
                              <tr key={state.stateCode} className={`border-b border-slate-700/50 ${owes && hasNexus ? 'bg-rose-900/20' : 'hover:bg-slate-800/50'}`}>
                                <td className="py-2 px-2">
                                  <span className="text-white font-medium">{state.stateName}</span>
                                  <span className="text-slate-500 ml-2 text-xs">{state.stateCode}</span>
                                  {state.shippingTaxable && (
                                    <span className="ml-1 text-xs text-cyan-400" title="Shipping is taxable in this state">📦</span>
                                  )}
                                </td>
                                <td className="py-2 px-2 text-right text-slate-300">
                                  <span title={state.shippingTaxable ? `Items: ${formatCurrency(state.itemSales || 0)} + Ship: ${formatCurrency(state.shipping || 0)}` : `Items only (shipping exempt)`}>
                                    {formatCurrency(state.totalSales || state.sales || 0)}
                                  </span>
                                </td>
                                <td className="py-2 px-2 text-right text-slate-400">{formatCurrency(state.totalTax || state.tax || 0)}</td>
                                <td className={`py-2 px-2 text-right font-bold ${owes ? 'text-rose-400' : 'text-slate-500'}`}>
                                  {owes ? formatCurrency(state.taxOwed || state.tax) : '—'}
                                </td>
                                <td className="py-2 px-2 text-right text-slate-400">{state.totalOrders || state.orders || 0}</td>
                                <td className="py-2 px-2 text-center">
                                  {hasNexus ? (
                                    <span className="text-xs bg-rose-600/80 text-white px-2 py-0.5 rounded font-medium">NEXUS</span>
                                  ) : owes ? (
                                    <button
                                      onClick={() => toggleNexus(state.stateCode)}
                                      className="text-xs text-amber-400 hover:text-amber-300"
                                    >
                                      + Add Nexus
                                    </button>
                                  ) : (
                                    <span className="text-xs text-slate-600">No tax</span>
                                  )}
                                </td>
                                <td className="py-2 px-2 text-center">
                                  {hasNexus && (
                                    <button
                                      onClick={() => setFilingDetailState({ stateCode: state.stateCode, data: state })}
                                      className="text-xs bg-violet-600 hover:bg-violet-500 text-white px-2 py-1 rounded font-medium"
                                    >
                                      📋 File
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-rose-500/50 bg-rose-900/10">
                            <td className="py-3 px-2 font-bold text-white">TOTAL</td>
                            <td className="py-3 px-2 text-right text-slate-300 font-medium">{formatCurrency(taxData.byState.reduce((s, st) => s + (st.totalSales || st.sales || 0), 0))}</td>
                            <td className="py-3 px-2 text-right text-slate-400">{formatCurrency(taxData.byState.reduce((s, st) => s + (st.totalTax || st.tax || 0), 0))}</td>
                            <td className="py-3 px-2 text-right font-bold text-xl text-rose-400">{formatCurrency(taxData.totalTax)}</td>
                            <td className="py-3 px-2 text-right text-slate-400">{taxData.byState.reduce((s, st) => s + (st.totalOrders || st.orders || 0), 0)}</td>
                            <td></td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                      <div className="mt-4 p-3 bg-slate-800/50 rounded-lg">
                        <p className="text-slate-400 text-xs">
                          💡 <strong className="text-rose-300">YOU OWE</strong> = Tax you must file and pay.
                          <span className="ml-2">📦 = Shipping is taxable in that state (included in Taxable Sales).</span>
                          <span className="ml-2">Click <strong className="text-violet-300">📋 File</strong> on NEXUS states for state-specific filing format.</span>
                        </p>
                      </div>
                      
                      {/* State Filing Detail Modal */}
                      {filingDetailState && (() => {
                        const stateCode = filingDetailState.stateCode;
                        const stateData = filingDetailState.data;
                        const stateInfo = US_STATES_TAX_INFO[stateCode];
                        const filingFormat = STATE_FILING_FORMATS[stateCode] || STATE_FILING_FORMATS.DEFAULT;
                        const calculated = filingFormat.calculate(stateData, stateInfo);
                        const periodKey = taxPeriodType === 'month' ? taxPeriodValue : `${taxPeriodValue.split('-')[0]}-Q${taxPeriodValue.split('-')[1]}`;
                        const alreadyFiled = salesTaxConfig.filingHistory?.[stateCode]?.[periodKey]?.filed;
                        
                        return (
                          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                            <div className="bg-slate-800 rounded-xl border border-slate-600 p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
                              <div className="flex items-center justify-between mb-4">
                                <div>
                                  <h3 className="text-xl font-bold text-white">{stateInfo?.name || stateCode} Sales Tax Filing</h3>
                                  <p className="text-sm text-slate-400">{filingFormat.formName}</p>
                                </div>
                                <button onClick={() => setFilingDetailState(null)} className="p-2 hover:bg-slate-700 rounded-lg">
                                  <X className="w-5 h-5 text-slate-400" />
                                </button>
                              </div>
                              
                              {/* Already Filed Banner */}
                              {alreadyFiled && (
                                <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-lg p-3 mb-4 flex items-center gap-2">
                                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                                  <div>
                                    <p className="text-emerald-400 font-medium">Filed & Paid</p>
                                    <p className="text-emerald-300/70 text-xs">
                                      {salesTaxConfig.filingHistory[stateCode][periodKey].filedDate 
                                        ? `Filed on ${new Date(salesTaxConfig.filingHistory[stateCode][periodKey].filedDate).toLocaleDateString()}`
                                        : 'Marked as complete'}
                                      {salesTaxConfig.filingHistory[stateCode][periodKey].amount > 0 && 
                                        ` • ${formatCurrency(salesTaxConfig.filingHistory[stateCode][periodKey].amount)} paid`}
                                    </p>
                                  </div>
                                </div>
                              )}
                              
                              {/* Portal URL - Custom or Default with Edit option */}
                              {(() => {
                                const portalUrl = nexusStates[stateCode]?.portalUrl || filingFormat.website;
                                const isEditing = editingPortalUrl === stateCode;
                                
                                return (
                                  <div className="mb-4">
                                    {!isEditing ? (
                                      <div className="flex gap-2">
                                        {portalUrl && (
                                          <button 
                                            onClick={() => window.open(portalUrl, '_blank')}
                                            className="flex-1 flex items-center justify-center gap-2 text-sm bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-medium"
                                          >
                                            <ArrowUpRight className="w-4 h-4" />
                                            Open {stateInfo?.name} Tax Portal
                                          </button>
                                        )}
                                        <button 
                                          onClick={() => {
                                            setEditPortalUrlValue(portalUrl || '');
                                            setEditingPortalUrl(stateCode);
                                          }}
                                          className="px-3 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm"
                                          title="Edit portal URL"
                                        >
                                          ✏️
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="space-y-2">
                                        <label className="text-xs text-slate-400">Tax Portal URL:</label>
                                        <div className="flex gap-2">
                                          <input
                                            type="url"
                                            value={editPortalUrlValue}
                                            onChange={(e) => setEditPortalUrlValue(e.target.value)}
                                            placeholder="https://..."
                                            className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm"
                                          />
                                          <button
                                            onClick={() => {
                                              // Save custom URL to nexusStates
                                              const updated = {
                                                ...nexusStates,
                                                [stateCode]: {
                                                  ...nexusStates[stateCode],
                                                  portalUrl: editPortalUrlValue || null
                                                }
                                              };
                                              setNexusStates(updated);
                                              lsSet('nexusStates', JSON.stringify(updated));
                                              setEditingPortalUrl(null);
                                            }}
                                            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm"
                                          >
                                            Save
                                          </button>
                                          <button
                                            onClick={() => setEditingPortalUrl(null)}
                                            className="px-3 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-sm"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                        {filingFormat.website && filingFormat.website !== editPortalUrlValue && (
                                          <p className="text-xs text-slate-500">
                                            Default: <button 
                                              onClick={() => setEditPortalUrlValue(filingFormat.website)}
                                              className="text-blue-400 hover:underline"
                                            >{filingFormat.website}</button>
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                              
                              {/* Filing fields */}
                              <div className="bg-slate-900 rounded-lg p-4 mb-4">
                                <h4 className="text-sm font-semibold text-slate-300 mb-3">📝 Fields for Your Return</h4>
                                <div className="space-y-3">
                                  {filingFormat.fields.map(field => (
                                    <div key={field.key} className="flex justify-between items-center border-b border-slate-700 pb-2">
                                      <div>
                                        <p className="text-white font-medium">{field.name}</p>
                                        <p className="text-xs text-slate-500">{field.description}</p>
                                      </div>
                                      <p className="text-lg font-bold text-emerald-400">
                                        {typeof calculated[field.key] === 'number' 
                                          ? formatCurrency(calculated[field.key])
                                          : calculated[field.key] || '—'}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              
                              {/* Jurisdiction Breakdown - for states requiring county/city reporting */}
                              {stateData.jurisdictions && stateData.jurisdictions.length > 0 && (
                                <div className="bg-slate-900 rounded-lg p-4 mb-4">
                                  <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-sm font-semibold text-slate-300">
                                      📍 {filingFormat.requiresJurisdictions ? `${filingFormat.jurisdictionType || 'Jurisdiction'} Breakdown` : 'Tax by Jurisdiction'}
                                      {filingFormat.requiresJurisdictions && (
                                        <span className="ml-2 text-xs bg-amber-600/30 text-amber-300 px-2 py-0.5 rounded">Required for Filing</span>
                                      )}
                                    </h4>
                                    <button
                                      onClick={() => {
                                        // Export jurisdiction-level CSV
                                        const { start, end } = getDateRange();
                                        let csv = 'Jurisdiction,Tax Rate,Taxable Sales,Tax Collected,Orders\n';
                                        stateData.jurisdictions.forEach(j => {
                                          csv += `"${j.name}",${((j.rate || 0) * 100).toFixed(3)}%,${(j.sales || 0).toFixed(2)},${(j.tax || 0).toFixed(2)},${j.orders || 0}\n`;
                                        });
                                        csv += `\n"TOTAL",,${(stateData.totalSales || 0).toFixed(2)},${(stateData.taxOwed || 0).toFixed(2)},${stateData.totalOrders || 0}\n`;
                                        csv += `\n"State: ${stateInfo?.name || stateCode}"\n`;
                                        csv += `"Period: ${taxPeriodValue}"\n`;
                                        csv += `"Date Range: ${start} to ${end}"\n`;
                                        
                                        const blob = new Blob([csv], { type: 'text/csv' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `${stateCode}-jurisdiction-breakdown-${taxPeriodValue}.csv`;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                      }}
                                      className="text-xs bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 px-2 py-1 rounded flex items-center gap-1"
                                    >
                                      <Download className="w-3 h-3" />
                                      Export CSV
                                    </button>
                                  </div>
                                  <div className="max-h-48 overflow-y-auto">
                                    <table className="w-full text-sm">
                                      <thead className="sticky top-0 bg-slate-900">
                                        <tr className="text-slate-400 text-xs">
                                          <th className="text-left py-1">Jurisdiction</th>
                                          <th className="text-right py-1">Rate</th>
                                          <th className="text-right py-1">Sales</th>
                                          <th className="text-right py-1">Tax</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {stateData.jurisdictions.map((j, idx) => (
                                          <tr key={idx} className="border-t border-slate-800">
                                            <td className="py-1.5 text-white">{j.name}</td>
                                            <td className="py-1.5 text-right text-slate-400">{((j.rate || 0) * 100).toFixed(2)}%</td>
                                            <td className="py-1.5 text-right text-slate-300">{formatCurrency(j.sales || 0)}</td>
                                            <td className="py-1.5 text-right text-emerald-400">{formatCurrency(j.tax || 0)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                              
                              {/* Note about jurisdiction requirements */}
                              {filingFormat.requiresJurisdictions && (!stateData.jurisdictions || stateData.jurisdictions.length === 0) && (
                                <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3 mb-4">
                                  <p className="text-amber-300 text-sm">
                                    ⚠️ <strong>{stateInfo?.name}</strong> requires {filingFormat.jurisdictionType || 'jurisdiction'}-level breakdown, 
                                    but no jurisdiction data is available. Re-sync your Shopify data to capture tax jurisdiction details, 
                                    or manually check Shopify's tax report.
                                  </p>
                                </div>
                              )}
                              
                              {filingFormat.note && (
                                <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3 mb-4">
                                  <p className="text-amber-300 text-sm">⚠️ {filingFormat.note}</p>
                                </div>
                              )}
                              
                              {/* Verify with Shopify */}
                              <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 mb-4">
                                <p className="text-blue-300 text-sm">
                                  💡 <strong>Verify:</strong> Cross-check these numbers with Shopify Admin → Analytics → Reports → Taxes. 
                                  Look for "{stateInfo?.name} Sales Tax" report for this period.
                                </p>
                              </div>
                              
                              {/* State-specific info */}
                              <div className="bg-slate-700/50 rounded-lg p-3 mb-4 text-sm">
                                <div className="grid grid-cols-2 gap-2">
                                  <div><span className="text-slate-400">State Rate:</span> <span className="text-white">{((stateInfo?.stateRate || 0) * 100).toFixed(2)}%</span></div>
                                  <div><span className="text-slate-400">SST Member:</span> <span className="text-white">{stateInfo?.sst ? 'Yes' : 'No'}</span></div>
                                  <div><span className="text-slate-400">Marketplace:</span> <span className="text-white">{stateInfo?.marketplaceFacilitator ? 'Yes' : 'No'}</span></div>
                                  <div><span className="text-slate-400">Period:</span> <span className="text-white">{taxPeriodValue}</span></div>
                                </div>
                              </div>
                              
                              {/* Mark as Paid Section */}
                              {!alreadyFiled && (stateData.taxOwed > 0 || stateData.tax > 0) && (
                                <div className="bg-slate-900 rounded-lg p-4 mb-4">
                                  <h4 className="text-sm font-semibold text-slate-300 mb-3">✅ Mark as Filed & Paid</h4>
                                  <div className="space-y-3">
                                    <div>
                                      <label className="block text-xs text-slate-400 mb-1">Amount Paid</label>
                                      <input
                                        type="number"
                                        step="0.01"
                                        id={`filing-amount-${stateCode}`}
                                        defaultValue={(stateData.taxOwed || stateData.tax || 0).toFixed(2)}
                                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-slate-400 mb-1">Confirmation # (optional)</label>
                                      <input
                                        type="text"
                                        id={`filing-confirm-${stateCode}`}
                                        placeholder="e.g., 12345678"
                                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white"
                                      />
                                    </div>
                                    <button
                                      onClick={() => {
                                        const amount = parseFloat(document.getElementById(`filing-amount-${stateCode}`).value) || 0;
                                        const confirmNum = document.getElementById(`filing-confirm-${stateCode}`).value || '';
                                        markFilingComplete(stateCode, periodKey, {
                                          amount,
                                          confirmationNum: confirmNum,
                                          reportData: {
                                            grossSales: stateData.totalSales || stateData.sales,
                                            taxCollected: stateData.taxOwed || stateData.tax,
                                            orders: stateData.totalOrders || stateData.orders,
                                            period: taxPeriodValue,
                                          }
                                        });
                                        setToast({ message: `${stateInfo?.name} tax marked as filed for ${taxPeriodValue}`, type: 'success' });
                                        setFilingDetailState(null);
                                      }}
                                      className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white font-medium"
                                    >
                                      ✓ Mark as Filed & Paid
                                    </button>
                                  </div>
                                </div>
                              )}
                              
                              {/* Export button */}
                              <div className="flex gap-3">
                                <button
                                  onClick={() => {
                                    // Generate state-specific CSV
                                    let csv = `${stateInfo?.name} Sales Tax Filing - ${taxPeriodValue}\n`;
                                    csv += `Form: ${filingFormat.formName}\n\n`;
                                    csv += `Field,Value\n`;
                                    filingFormat.fields.forEach(field => {
                                      const val = calculated[field.key];
                                      csv += `"${field.name}",${typeof val === 'number' ? val.toFixed(2) : val || ''}\n`;
                                    });
                                    csv += `\nState Rate,${((stateInfo?.stateRate || 0) * 100).toFixed(2)}%\n`;
                                    csv += `Period,${taxPeriodValue}\n`;
                                    
                                    const blob = new Blob([csv], { type: 'text/csv' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `${stateCode}-sales-tax-${taxPeriodValue}.csv`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                  }}
                                  className="flex-1 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-white font-medium flex items-center justify-center gap-2"
                                >
                                  <Download className="w-4 h-4" />
                                  Export {stateCode} Data
                                </button>
                                <button
                                  onClick={() => setFilingDetailState(null)}
                                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300"
                                >
                                  Close
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </>
              ) : (
                <div className="text-center py-6">
                  <ShoppingBag className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400">No Shopify tax data for this period</p>
                  <p className="text-slate-500 text-sm mb-4">Sync Shopify orders to see tax breakdown by state</p>
                  <button
                    onClick={() => { setUploadTab('shopify-sync'); setView('upload'); }}
                    className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm text-white"
                  >
                    Sync Shopify
                  </button>
                </div>
              )}
            </div>
          );
        })()}
        
        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Nexus States List */}
          <div className="lg:col-span-2 bg-slate-800/50 rounded-2xl border border-slate-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Your Nexus States</h3>
              <select value={taxFilterStatus} onChange={(e) => setTaxFilterStatus(e.target.value)} className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white">
                <option value="all">All States</option>
                <option value="due">Overdue</option>
                <option value="upcoming">Due Soon</option>
              </select>
            </div>
            
            {nexusStatesList.length === 0 ? (
              <div className="text-center py-8">
                <DollarSign className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No nexus states configured</p>
                <p className="text-slate-500 text-sm">Add states from the list on the right</p>
              </div>
            ) : (
              <div className="space-y-2">
                {nexusStatesList
                  .filter(s => taxFilterStatus === 'all' || (taxFilterStatus === 'due' && s.nextDue < now) || (taxFilterStatus === 'upcoming' && s.nextDue >= now && s.nextDue <= sevenDays))
                  .map(state => {
                    const isOverdue = state.nextDue < now;
                    const isDueSoon = state.nextDue >= now && state.nextDue <= sevenDays;
                    return (
                      <div key={state.code} className={`flex items-center justify-between p-4 rounded-xl transition-all ${isOverdue ? 'bg-rose-900/20 border border-rose-500/30' : isDueSoon ? 'bg-amber-900/20 border border-amber-500/30' : 'bg-slate-900/50 hover:bg-slate-700/50'}`}>
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${isOverdue ? 'bg-rose-600' : isDueSoon ? 'bg-amber-600' : 'bg-slate-700'}`}>{state.code}</div>
                          <div>
                            <p className="text-white font-medium">{state.name}</p>
                            <p className="text-slate-400 text-sm capitalize">{state.frequency} filing • {state.registrationId || 'No ID set'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className={`text-sm font-medium ${isOverdue ? 'text-rose-400' : isDueSoon ? 'text-amber-400' : 'text-slate-300'}`}>
                              {isOverdue ? 'Overdue' : `Due ${state.nextDue.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                            </p>
                            <p className="text-slate-500 text-xs">{Math.ceil((state.nextDue - now) / (1000 * 60 * 60 * 24))} days</p>
                          </div>
                          <button onClick={() => setSelectedTaxState(state.code)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg" title="File/Upload Report"><Upload className="w-4 h-4" /></button>
                          <button onClick={() => setViewingStateHistory(state.code)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg" title="View History"><FileText className="w-4 h-4" /></button>
                          <button onClick={() => { setTaxConfigState(state.code); setShowTaxStateConfig(true); }} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg" title="Settings"><Settings className="w-4 h-4" /></button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
          
          {/* State Selector */}
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Add States</h3>
              <button onClick={() => setShowHiddenStates(!showHiddenStates)} className="text-xs text-slate-400 hover:text-slate-300">{showHiddenStates ? 'Hide' : 'Show'} Hidden ({(hiddenStates || []).length})</button>
            </div>
            
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {Object.entries(US_STATES_TAX_INFO)
                .filter(([code]) => !(hiddenStates || []).includes(code) || showHiddenStates)
                .filter(([code]) => !nexusStates[code]?.hasNexus)
                .sort(([, a], [, b]) => a.name.localeCompare(b.name))
                .map(([code, info]) => (
                  <div key={code} className={`flex items-center justify-between p-2 rounded-lg hover:bg-slate-700/50 ${hiddenStates.includes(code) ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-slate-500 w-6">{code}</span>
                      <span className="text-white text-sm">{info.name}</span>
                      {!info.hasStateTax && <span className="text-xs text-emerald-400">(No tax)</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      {info.hasStateTax && (
                        <button onClick={() => toggleNexus(code)} className="px-2 py-1 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/50 rounded text-xs text-emerald-300">+ Add</button>
                      )}
                      <button onClick={() => toggleHideState(code)} className="p-1 text-slate-500 hover:text-slate-300"><Eye className="w-3 h-3" /></button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
        
        {/* Filing History */}
        {Object.keys(filingHistory || {}).length > 0 && (
          <div className="mt-6 bg-slate-800/50 rounded-2xl border border-slate-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Filing History</h3>
              <div className="flex items-center gap-2">
                <select 
                  value={viewingStateHistory || 'all'} 
                  onChange={(e) => setViewingStateHistory(e.target.value === 'all' ? null : e.target.value)} 
                  className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white"
                >
                  <option value="all">All States</option>
                  {Object.keys(filingHistory || {}).sort().map(code => (
                    <option key={code} value={code}>{US_STATES_TAX_INFO[code]?.name || code}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left p-3 text-slate-400">State</th>
                    <th className="text-left p-3 text-slate-400">Period</th>
                    <th className="text-right p-3 text-slate-400">Amount Paid</th>
                    <th className="text-left p-3 text-slate-400">Confirmation #</th>
                    <th className="text-left p-3 text-slate-400">Filed Date</th>
                    <th className="text-left p-3 text-slate-400">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(filingHistory || {})
                    .filter(([stateCode]) => !viewingStateHistory || stateCode === viewingStateHistory)
                    .flatMap(([stateCode, periods]) => 
                      Object.entries(periods || {})
                        .sort(([a], [b]) => b.localeCompare(a))
                        .map(([period, data]) => (
                          <tr key={`${stateCode}-${period}`} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <span className="w-8 h-8 bg-slate-700 rounded flex items-center justify-center text-xs font-bold text-white">{stateCode}</span>
                                <span className="text-white">{US_STATES_TAX_INFO[stateCode]?.name || stateCode}</span>
                              </div>
                            </td>
                            <td className="p-3 text-slate-300">{period}</td>
                            <td className="p-3 text-right text-emerald-400 font-semibold">{formatCurrency(data.amount || 0)}</td>
                            <td className="p-3 text-slate-400 font-mono text-xs">{data.taxFilingConfirmNumationNum || data.confirmationNum || '-'}</td>
                            <td className="p-3 text-slate-400">{data.filedDate ? new Date(data.filedDate).toLocaleDateString() : '-'}</td>
                            <td className="p-3 text-slate-500 text-xs max-w-[200px] truncate">{data.notes || '-'}</td>
                          </tr>
                        ))
                    )}
                </tbody>
              </table>
            </div>
            {/* Totals by State */}
            <div className="mt-4 pt-4 border-t border-slate-700">
              <h4 className="text-sm font-semibold text-slate-300 mb-3">Total Paid by State</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {Object.entries(filingHistory || {}).map(([stateCode, periods]) => {
                  const total = Object.values(periods || {}).reduce((sum, p) => sum + (p.amount || 0), 0);
                  const count = Object.keys(periods || {}).length;
                  return (
                    <div key={stateCode} className="bg-slate-900/50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-400">{stateCode}</span>
                        <span className="text-xs text-slate-500">{count} filings</span>
                      </div>
                      <p className="text-lg font-bold text-emerald-400">{formatCurrency(total)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        
        {/* Economic Nexus Reference Guide */}
        <div className="mt-6 bg-slate-800/50 rounded-2xl border border-slate-700 p-5">
          <h3 className="text-lg font-semibold text-white mb-2">Economic Nexus Quick Reference</h3>
          <p className="text-slate-400 text-sm mb-4">Remote seller thresholds that trigger sales tax collection requirements (post-Wayfair)</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            {/* High Threshold States */}
            <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4">
              <h4 className="text-emerald-400 font-semibold mb-2 flex items-center gap-2"><Check className="w-4 h-4" />High Threshold ($500K+)</h4>
              <div className="text-sm text-slate-300 space-y-1">
                <p><span className="text-white font-medium">California:</span> $500K sales</p>
                <p><span className="text-white font-medium">New York:</span> $500K + 100 transactions</p>
                <p><span className="text-white font-medium">Texas:</span> $500K sales</p>
              </div>
            </div>
            
            {/* Standard Threshold States */}
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
              <h4 className="text-blue-400 font-semibold mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Standard Threshold ($100K)</h4>
              <p className="text-slate-400 text-sm">Most states: $100K sales OR 200 transactions (some states removed transaction threshold)</p>
            </div>
            
            {/* Special Cases */}
            <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4">
              <h4 className="text-amber-400 font-semibold mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Special Requirements</h4>
              <div className="text-sm text-slate-300 space-y-1">
                <p><span className="text-white font-medium">Colorado:</span> Home-rule cities separate</p>
                <p><span className="text-white font-medium">Louisiana:</span> Parish filing required</p>
                <p><span className="text-white font-medium">Alaska:</span> Local only (ARSSTC)</p>
              </div>
            </div>
          </div>
          
          {/* SST Member States */}
          <div className="bg-slate-900/50 rounded-xl p-4">
            <h4 className="text-slate-300 font-semibold mb-2">Streamlined Sales Tax (SST) Member States</h4>
            <p className="text-slate-500 text-xs mb-2">These states offer simplified registration and filing through the SST system</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(US_STATES_TAX_INFO)
                .filter(([, info]) => info.sst)
                .map(([code]) => (
                  <span key={code} className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300">{code}</span>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesTaxView;
