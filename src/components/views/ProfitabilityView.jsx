import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  AlertTriangle, Calculator, Check, Filter, Grid, Table, Target, TrendingDown, TrendingUp, Zap
} from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import { deriveWeeksFromDays } from '../../utils/aggregation';
import NavTabs from '../ui/NavTabs';
import PnLView from '../../PnLView';

const ProfitabilityView = ({
  adSpend,
  adsIntelData,
  allDaysData,
  allPeriodsData,
  allWeeksData,
  appSettings,
  bankingData,
  confirmedRecurring,
  current,
  dataBar,
  dtcIntelData,
  get3PLForWeek,
  getProfit,
  globalModals,
  hasDailySalesData,
  invHistory,
  navDropdown,
  profitPeriodIndex,
  profitSubTab,
  savedCogs,
  setNavDropdown,
  setProfitPeriodIndex,
  setProfitSubTab,
  setSelectedDay,
  setSelectedInvDate,
  setSelectedPeriod,
  setSelectedWeek,
  setTrendsTab,
  setUploadTab,
  setView,
  theme,
  threeplLedger,
  trendsTab,
  view,
}) => {
    
    // CRITICAL: Derive weekly data from daily data for accuracy
    // This ensures we use actual daily totals instead of potentially incorrect weekly uploads
    const derivedWeeks = deriveWeeksFromDays(allDaysData || {});
    
    // Merge stored weekly data with derived data - DERIVED TOTALS TAKE PRIORITY
    // This fixes issues where stored weekly data has incorrect totals
    const getMergedWeekData = (weekKey) => {
      const stored = allWeeksData[weekKey];
      const derived = derivedWeeks[weekKey];
      if (!stored && !derived) return null;
      if (!stored) return derived;
      if (!derived) return stored;
      
      // CRITICAL: If derived data has revenue, use derived totals
      // This ensures daily-derived totals override potentially incorrect weekly uploads
      const derivedHasData = (derived.total?.revenue || 0) > 0;
      
      if (derivedHasData) {
        // Start with derived data (correct totals from daily)
        // Then merge in SKU-level details from stored if not in derived
        return {
          ...stored,
          total: derived.total, // Use derived totals
          amazon: {
            ...stored.amazon,
            revenue: derived.amazon?.revenue ?? stored.amazon?.revenue,
            units: derived.amazon?.units ?? stored.amazon?.units,
            // Keep SKU data and other details from stored
          },
          shopify: {
            ...stored.shopify,
            revenue: derived.shopify?.revenue ?? stored.shopify?.revenue,
            units: derived.shopify?.units ?? stored.shopify?.units,
          },
        };
      }
      
      // If no derived revenue, use stored
      return stored;
    };
    
    // Get all week keys from both sources
    const allWeekKeys = new Set([
      ...Object.keys(allWeeksData),
      ...Object.keys(derivedWeeks)
    ]);
    
    const sortedWeeks = Array.from(allWeekKeys).filter(w => {
      const data = getMergedWeekData(w);
      return (data.total?.revenue || 0) > 0;
    }).sort();
    const sortedPeriods = Object.keys(allPeriodsData).sort();
    
    // Categorize periods - flexible matching for various formats
    const monthlyPeriods = sortedPeriods.filter(p => {
      if (/^(january|february|march|april|may|june|july|august|september|october|november|december)[\s\-]*['']?\d{2,4}$/i.test(p)) return true;
      if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[\s\-]*['']?\d{2,4}$/i.test(p)) return true;
      if (/^\d{4}-\d{2}$/.test(p)) return true;
      return false;
    }).sort((a, b) => {
      // Sort by extracted year and month
      const getYearMonth = (p) => {
        const yearMatch = p.match(/(20\d{2})/);
        const year = yearMatch ? yearMatch[1] : '2025';
        const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const monthMatch = p.toLowerCase().match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
        const month = monthMatch ? String(monthNames.indexOf(monthMatch[1]) + 1).padStart(2, '0') : '01';
        return `${year}-${month}`;
      };
      return getYearMonth(a).localeCompare(getYearMonth(b));
    });
    const quarterlyPeriods = sortedPeriods.filter(p => /q[1-4]/i.test(p)).sort();
    const yearlyPeriods = sortedPeriods.filter(p => /^\d{4}$/.test(p)).sort();
    
    // Get 3PL costs for a date range - uses ledger data structure
    const get3PLCostsForPeriod = (startDate, endDate) => {
      if (!threeplLedger?.orders) return 0;
      let total = 0;
      Object.entries(threeplLedger.orders).forEach(([orderId, order]) => {
        const orderDate = order.shipmentDate || order.orderDate || order.weekKey;
        if (orderDate && orderDate >= startDate && orderDate <= endDate) {
          // Charges are stored in order.charges object
          const charges = order.charges || {};
          total += (charges.shipping || order.shipping || 0);
          total += (charges.firstPick || 0) + (charges.additionalPick || 0);
          total += (charges.box || charges.packaging || order.packagingFees || 0);
          total += (charges.storage || order.storageFees || 0);
          total += (charges.reBoxing || 0) + (charges.fbaForwarding || 0);
          total += (order.otherFees || charges.other || 0);
        }
      });
      
      // Also check summaryCharges (storage, receiving, etc.)
      Object.values(threeplLedger.summaryCharges || {}).forEach(charge => {
        const chargeDate = charge.weekKey || charge.date;
        if (chargeDate && chargeDate >= startDate && chargeDate <= endDate) {
          total += charge.amount || 0;
        }
      });
      
      return total;
    };
    
    // Get 3PL costs for a specific week key using existing function
    const getWeek3PLCosts = (weekKey) => {
      const ledger3PL = get3PLForWeek(threeplLedger, weekKey);
      return ledger3PL?.metrics?.totalCost || 0;
    };
    
    // Helper to get data from either weekly (merged) or period source
    const getData = (key) => {
      // First check if it's a week key - use merged data
      const mergedWeek = getMergedWeekData(key);
      if (mergedWeek) return mergedWeek;
      // Then check period data
      if (allPeriodsData[key]) return allPeriodsData[key];
      return null;
    };
    
    // Get single period data based on selected tab
    let currentPeriodKey = '';
    let currentPeriodLabel = '';
    let priorPeriodKey = '';
    let priorPeriodLabel = '';
    let trendPeriods = []; // For margin trend chart
    let trendPeriodType = 'week';
    
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-indexed
    const currentQuarter = Math.floor(currentMonth / 3) + 1;
    
    if (profitPeriod === 'monthly' && monthlyPeriods.length > 0) {
      // Selected month (default to most recent if -1)
      const idx = profitPeriodIndex === -1 ? monthlyPeriods.length - 1 : Math.min(profitPeriodIndex, monthlyPeriods.length - 1);
      currentPeriodKey = monthlyPeriods[idx];
      currentPeriodLabel = currentPeriodKey;
      priorPeriodKey = idx > 0 ? monthlyPeriods[idx - 1] : '';
      priorPeriodLabel = priorPeriodKey;
      trendPeriods = monthlyPeriods.slice(-8);
      trendPeriodType = 'month';
    } else if (profitPeriod === 'quarterly' && quarterlyPeriods.length > 0) {
      // Selected quarter
      const idx = profitPeriodIndex === -1 ? quarterlyPeriods.length - 1 : Math.min(profitPeriodIndex, quarterlyPeriods.length - 1);
      currentPeriodKey = quarterlyPeriods[idx];
      currentPeriodLabel = currentPeriodKey;
      priorPeriodKey = idx > 0 ? quarterlyPeriods[idx - 1] : '';
      priorPeriodLabel = priorPeriodKey;
      trendPeriods = quarterlyPeriods.slice(-4);
      trendPeriodType = 'quarter';
    } else if (profitPeriod === 'yearly') {
      // YTD - aggregate all weeks from current year
      const ytdWeeks = sortedWeeks.filter(w => w.startsWith(String(currentYear)));
      currentPeriodKey = 'ytd';
      currentPeriodLabel = `${currentYear} Year-to-Date`;
      // Prior year same period for comparison
      const priorYtdWeeks = sortedWeeks.filter(w => w.startsWith(String(currentYear - 1)));
      priorPeriodKey = 'prior_ytd';
      priorPeriodLabel = `${currentYear - 1} Same Period`;
      trendPeriods = monthlyPeriods.length > 0 ? monthlyPeriods.slice(-12) : sortedWeeks.slice(-12);
      trendPeriodType = monthlyPeriods.length > 0 ? 'month' : 'week';
    } else {
      // Weekly - selected week (default to most recent if -1)
      const idx = profitPeriodIndex === -1 ? sortedWeeks.length - 1 : Math.min(profitPeriodIndex, sortedWeeks.length - 1);
      currentPeriodKey = sortedWeeks[idx] || '';
      // Show full week range: Monday - Sunday
      if (currentPeriodKey) {
        const endDate = new Date(currentPeriodKey + 'T00:00:00');
        const startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - 6);
        currentPeriodLabel = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      } else {
        currentPeriodLabel = 'No data';
      }
      priorPeriodKey = idx > 0 ? sortedWeeks[idx - 1] : '';
      if (priorPeriodKey) {
        const endDate = new Date(priorPeriodKey + 'T00:00:00');
        const startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - 6);
        priorPeriodLabel = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      } else {
        priorPeriodLabel = '';
      }
      trendPeriods = sortedWeeks.slice(-8);
      trendPeriodType = 'week';
    }
    
    // Get totals for current period
    const totals = { revenue: 0, cogs: 0, amazonFees: 0, threeplCosts: 0, adSpend: 0, profit: 0, units: 0, returns: 0 };
    
    if (profitPeriod === 'yearly') {
      // YTD aggregation - use merged data for accuracy
      const ytdWeeks = sortedWeeks.filter(w => w.startsWith(String(currentYear)));
      ytdWeeks.forEach(w => {
        const data = getMergedWeekData(w);
        if (!data) return;
        totals.revenue += data.total?.revenue || 0;
        totals.cogs += data.total?.cogs || 0;
        totals.amazonFees += data.amazon?.fees || 0;
        // Get 3PL from weekly data OR ledger (whichever has data)
        const weeklyThreepl = data.shopify?.threeplCosts || 0;
        const ledgerThreepl = getWeek3PLCosts(w);
        totals.threeplCosts += Math.max(weeklyThreepl, ledgerThreepl);
        totals.adSpend += data.total?.adSpend || 0;
        totals.profit += getProfit(data.total);
        totals.units += data.total?.units || 0;
        totals.returns += data.amazon?.returns || 0;
      });
    } else {
      // Single period
      const data = getData(currentPeriodKey);
      if (data) {
        totals.revenue = data.total?.revenue || 0;
        totals.cogs = data.total?.cogs || 0;
        totals.amazonFees = data.amazon?.fees || 0;
        // Get 3PL from data OR ledger
        totals.threeplCosts = data.shopify?.threeplCosts || 0;
        totals.adSpend = data.total?.adSpend || 0;
        totals.profit = getProfit(data.total);
        totals.units = data.total?.units || 0;
        totals.returns = data.amazon?.returns || 0;
        
        // Add 3PL costs from ledger for weekly periods if not in weekly data
        if (profitPeriod === 'weekly' && currentPeriodKey) {
          const ledgerThreepl = getWeek3PLCosts(currentPeriodKey);
          // Use ledger data if it's higher (meaning we have ledger data)
          if (ledgerThreepl > totals.threeplCosts) {
            totals.threeplCosts = ledgerThreepl;
          }
        }
        
        // For monthly periods, sum up weekly ledger data
        if (profitPeriod === 'monthly' && currentPeriodKey) {
          // Find weeks that fall in this month
          const monthMatch = currentPeriodKey.toLowerCase().match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
          const yearMatch = currentPeriodKey.match(/(20\d{2})/);
          if (monthMatch && yearMatch) {
            const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
            const month = monthNames.indexOf(monthMatch[1]);
            const year = parseInt(yearMatch[1]);
            const monthWeeks = sortedWeeks.filter(w => {
              const wDate = new Date(w + 'T00:00:00');
              return wDate.getFullYear() === year && wDate.getMonth() === month;
            });
            let ledgerTotal = 0;
            monthWeeks.forEach(w => {
              ledgerTotal += getWeek3PLCosts(w);
            });
            if (ledgerTotal > totals.threeplCosts) {
              totals.threeplCosts = ledgerTotal;
            }
          }
        }
      }
    }
    
    // Get prior period totals for comparison
    const priorTotals = { revenue: 0, cogs: 0, amazonFees: 0, threeplCosts: 0, adSpend: 0, profit: 0, units: 0, returns: 0 };
    if (profitPeriod === 'yearly') {
      // Prior YTD - use merged data for accuracy
      const currentDayOfYear = Math.floor((new Date() - new Date(currentYear, 0, 0)) / (1000 * 60 * 60 * 24));
      const priorYtdEnd = new Date(currentYear - 1, 0, currentDayOfYear);
      const priorYtdWeeks = sortedWeeks.filter(w => {
        const wDate = new Date(w);
        return wDate.getFullYear() === currentYear - 1 && wDate <= priorYtdEnd;
      });
      priorYtdWeeks.forEach(w => {
        const data = getMergedWeekData(w);
        if (!data) return;
        priorTotals.revenue += data.total?.revenue || 0;
        priorTotals.cogs += data.total?.cogs || 0;
        priorTotals.amazonFees += data.amazon?.fees || 0;
        // Get 3PL from weekly data OR ledger
        const weeklyThreepl = data.shopify?.threeplCosts || 0;
        const ledgerThreepl = getWeek3PLCosts(w);
        priorTotals.threeplCosts += Math.max(weeklyThreepl, ledgerThreepl);
        priorTotals.adSpend += data.total?.adSpend || 0;
        priorTotals.profit += getProfit(data.total);
      });
    } else if (priorPeriodKey) {
      const priorData = getData(priorPeriodKey);
      if (priorData) {
        priorTotals.revenue = priorData.total?.revenue || 0;
        priorTotals.cogs = priorData.total?.cogs || 0;
        priorTotals.amazonFees = priorData.amazon?.fees || 0;
        priorTotals.threeplCosts = priorData.shopify?.threeplCosts || 0;
        priorTotals.adSpend = priorData.total?.adSpend || 0;
        priorTotals.profit = priorData.total?.netProfit || 0;
        
        // Add ledger data for prior week if needed
        if (profitPeriod === 'weekly') {
          const ledgerThreepl = getWeek3PLCosts(priorPeriodKey);
          if (ledgerThreepl > priorTotals.threeplCosts) {
            priorTotals.threeplCosts = ledgerThreepl;
          }
        }
      }
    }
    
    const weeklyBreakdown = [];
    
    // Calculate percentages with safeguards
    // Cap percentages to reasonable values and handle bad data
    const safePercent = (value, total) => {
      if (total <= 0 || isNaN(value) || !isFinite(value)) return 0;
      const pct = (value / total) * 100;
      // Cap at 100% - any higher indicates bad data
      return Math.min(Math.max(pct, 0), 100);
    };
    
    const pcts = {
      cogs: safePercent(totals.cogs, totals.revenue),
      amazonFees: safePercent(totals.amazonFees, totals.revenue),
      threeplCosts: safePercent(totals.threeplCosts, totals.revenue),
      adSpend: safePercent(totals.adSpend, totals.revenue),
      profit: totals.revenue > 0 ? Math.max(Math.min((totals.profit / totals.revenue) * 100, 100), -100) : 0,
    };
    
    // Validate: if costs exceed revenue significantly, recalculate profit from other values
    const totalCostPct = pcts.cogs + pcts.amazonFees + pcts.threeplCosts + pcts.adSpend;
    if (totalCostPct > 100) {
      // Normalize costs to fit within 100% minus profit
      const scaleFactor = (100 - Math.abs(pcts.profit)) / totalCostPct;
      pcts.cogs *= scaleFactor;
      pcts.amazonFees *= scaleFactor;
      pcts.threeplCosts *= scaleFactor;
      pcts.adSpend *= scaleFactor;
    }
    
    // Prior period percentages
    const priorPcts = {
      cogs: priorTotals.revenue > 0 ? (priorTotals.cogs / priorTotals.revenue) * 100 : 0,
      profit: priorTotals.revenue > 0 ? (priorTotals.profit / priorTotals.revenue) * 100 : 0,
      adSpend: priorTotals.revenue > 0 ? (priorTotals.adSpend / priorTotals.revenue) * 100 : 0,
    };
    
    // Calculate key metrics
    const avgOrderValue = totals.units > 0 ? totals.revenue / totals.units : 0;
    const profitPerUnit = totals.units > 0 ? totals.profit / totals.units : 0;
    const returnRate = (totals.units + totals.returns) > 0 ? (totals.returns / (totals.units + totals.returns)) * 100 : 0;
    const grossMargin = totals.revenue > 0 ? ((totals.revenue - totals.cogs) / totals.revenue) * 100 : 0;
    const operatingMargin = totals.revenue > 0 ? ((totals.revenue - totals.cogs - totals.amazonFees - totals.threeplCosts) / totals.revenue) * 100 : 0;
    
    // Identify biggest cost driver
    const costDrivers = [
      { name: 'COGS', value: totals.cogs, pct: pcts.cogs },
      { name: 'Amazon Fees', value: totals.amazonFees, pct: pcts.amazonFees },
      { name: '3PL Costs', value: totals.threeplCosts, pct: pcts.threeplCosts },
      { name: 'Ad Spend', value: totals.adSpend, pct: pcts.adSpend },
    ].sort((a, b) => b.value - a.value);
    
    // Build margin trends data from trendPeriods
    const marginTrends = trendPeriods.map(p => {
      const data = getData(p);
      if (!data) return null;
      const rev = data.total?.revenue || 1;
      const profit = getProfit(data.total);
      return {
        period: p,
        label: trendPeriodType === 'week' 
          ? new Date(p + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : p.replace(/\s*\d{4}$/, '').slice(0, 3),
        revenue: data.total?.revenue || 0,
        profit: profit,
        margin: (profit / rev) * 100,
        cogsPct: ((data.total?.cogs || 0) / rev) * 100,
        adsPct: ((data.total?.adSpend || 0) / rev) * 100,
        feesPct: (((data.amazon?.fees || 0) + (data.shopify?.threeplCosts || 0)) / rev) * 100,
      };
    }).filter(Boolean);
    
    // SKU-level profitability for current period
    const skuProfitability = [];
    const currentData = getData(currentPeriodKey);
    if (currentData) {
      [...(currentData.amazon?.skuData || []), ...(currentData.shopify?.skuData || [])].forEach(s => {
        const profit = s.netProceeds !== undefined ? s.netProceeds : (s.netSales || 0) - (s.cogs || 0);
        const revenue = s.netSales || 0;
        skuProfitability.push({ sku: s.sku, name: s.name || '', revenue, profit, units: s.unitsSold || 0 });
      });
    } else if (profitPeriod === 'yearly') {
      // For YTD, aggregate all SKUs from current year - use merged data
      const ytdWeeks = sortedWeeks.filter(w => w.startsWith(String(currentYear)));
      ytdWeeks.forEach(w => {
        const data = getMergedWeekData(w);
        if (!data) return;
        [...(data.amazon?.skuData || []), ...(data.shopify?.skuData || [])].forEach(s => {
          const existing = skuProfitability.find(x => x.sku === s.sku);
          const profit = s.netProceeds !== undefined ? s.netProceeds : (s.netSales || 0) - (s.cogs || 0);
          const revenue = s.netSales || 0;
          if (existing) {
            existing.revenue += revenue;
            existing.profit += profit;
            existing.units += s.unitsSold || 0;
          } else {
            skuProfitability.push({ sku: s.sku, name: s.name || '', revenue, profit, units: s.unitsSold || 0 });
          }
        });
      });
    }
    
    // Calculate margin and sort
    const skuWithMargins = skuProfitability.map(s => ({
      ...s,
      margin: s.revenue > 0 ? (s.profit / s.revenue) * 100 : 0,
      profitPerUnit: s.units > 0 ? s.profit / s.units : 0,
    })).filter(s => s.revenue > 100); // Filter out tiny SKUs
    
    const topProfitSkus = [...skuWithMargins].sort((a, b) => b.profit - a.profit).slice(0, 5);
    const worstMarginSkus = [...skuWithMargins].sort((a, b) => a.margin - b.margin).slice(0, 5);
    const bestMarginSkus = [...skuWithMargins].sort((a, b) => b.margin - a.margin).slice(0, 5);
    
    // Waterfall segments
    const waterfall = [
      { label: 'Revenue', value: totals.revenue, color: 'bg-violet-500', running: totals.revenue },
      { label: 'COGS', value: -totals.cogs, color: 'bg-rose-500', running: totals.revenue - totals.cogs },
      { label: 'Amazon Fees', value: -totals.amazonFees, color: 'bg-orange-500', running: totals.revenue - totals.cogs - totals.amazonFees },
      { label: '3PL Costs', value: -totals.threeplCosts, color: 'bg-blue-500', running: totals.revenue - totals.cogs - totals.amazonFees - totals.threeplCosts },
      { label: 'Ad Spend', value: -totals.adSpend, color: 'bg-purple-500', running: totals.revenue - totals.cogs - totals.amazonFees - totals.threeplCosts - totals.adSpend },
      { label: 'Net Profit', value: totals.profit, color: totals.profit >= 0 ? 'bg-emerald-500' : 'bg-rose-500', running: totals.profit },
    ];
    
    const maxVal = Math.max(totals.revenue, Math.abs(totals.profit));
    
    // Cost trends over time - use merged data for accuracy
    const costTrends = sortedWeeks.slice(-12).map(w => {
      const week = getMergedWeekData(w);
      if (!week) return null;
      const rev = week.total?.revenue || 1;
      return {
        week: w,
        revenue: week.total?.revenue || 0,
        cogsPct: ((week.total?.cogs || 0) / rev) * 100,
        adsPct: ((week.total?.adSpend || 0) / rev) * 100,
        feesPct: (((week.amazon?.fees || 0) + (week.shopify?.threeplCosts || 0)) / rev) * 100,
        margin: ((week.total?.netProfit || 0) / rev) * 100,
      };
    }).filter(Boolean);
    
    return (
      <div className="min-h-screen bg-slate-950 p-4 lg:p-6">
        <div className="max-w-7xl mx-auto">{globalModals}
          <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />
          {dataBar}
          
          {/* Sub-tab: Profitability vs P&L Statement */}
          <div className="flex gap-2 mb-6">
            <button onClick={() => setProfitSubTab('profitability')} className={`px-5 py-2.5 rounded-xl font-medium transition-all ${profitSubTab === 'profitability' ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>📊 Profitability</button>
            <button onClick={() => setProfitSubTab('pnl')} className={`px-5 py-2.5 rounded-xl font-medium transition-all ${profitSubTab === 'pnl' ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>💰 P&L Statement</button>
          </div>
          
          {profitSubTab === 'pnl' ? (
            <PnLView
              allWeeksData={allWeeksData} allDaysData={allDaysData} savedCogs={savedCogs}
              threeplLedger={threeplLedger} get3PLForWeek={get3PLForWeek}
              adsIntelData={adsIntelData} dtcIntelData={dtcIntelData}
              appSettings={appSettings} theme={theme} formatCurrency={formatCurrency}
              confirmedRecurring={confirmedRecurring}
            />
          ) : (<>
          
          <div className="mb-6">
            <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">💰 Profitability Deep Dive</h1>
            <p className="text-slate-400">
              {profitPeriod === 'yearly' 
                ? currentPeriodLabel 
                : `${currentPeriodLabel}${priorPeriodLabel ? ` vs ${priorPeriodLabel}` : ''}`}
            </p>
          </div>
          
          {/* Time Period Tabs */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button 
              onClick={() => { setTrendsTab('weekly'); setProfitPeriodIndex(-1); }}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${profitPeriod === 'weekly' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
            >
              📅 Weekly
            </button>
            <button 
              onClick={() => { setTrendsTab('monthly'); setProfitPeriodIndex(-1); }}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${profitPeriod === 'monthly' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
              disabled={monthlyPeriods.length === 0}
            >
              📊 Monthly {monthlyPeriods.length === 0 && '(No data)'}
            </button>
            <button 
              onClick={() => { setTrendsTab('quarterly'); setProfitPeriodIndex(-1); }}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${profitPeriod === 'quarterly' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
              disabled={quarterlyPeriods.length === 0}
            >
              📈 Quarterly {quarterlyPeriods.length === 0 && '(No data)'}
            </button>
            <button 
              onClick={() => { setTrendsTab('yearly'); setProfitPeriodIndex(-1); }}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${profitPeriod === 'yearly' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
            >
              📆 YTD
            </button>
          </div>
          
          {/* Period Selector */}
          {profitPeriod !== 'yearly' && (
            <div className="flex flex-wrap gap-2 mb-6 items-center bg-slate-800/50 rounded-lg p-3 border border-slate-700">
              <span className="text-slate-400 text-sm mr-2">📅 Select Period:</span>
              <select
                value={(() => {
                  const periods = profitPeriod === 'weekly' ? sortedWeeks : profitPeriod === 'monthly' ? monthlyPeriods : quarterlyPeriods;
                  return profitPeriodIndex === -1 ? periods.length - 1 : profitPeriodIndex;
                })()}
                onChange={(e) => {
                  const periods = profitPeriod === 'weekly' ? sortedWeeks : profitPeriod === 'monthly' ? monthlyPeriods : quarterlyPeriods;
                  const idx = parseInt(e.target.value);
                  setProfitPeriodIndex(idx === periods.length - 1 ? -1 : idx);
                }}
                className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm min-w-[200px]"
              >
                {profitPeriod === 'weekly' && [...sortedWeeks].reverse().map((w, reverseIdx) => {
                  const idx = sortedWeeks.length - 1 - reverseIdx;
                  return (
                    <option key={w} value={idx}>
                      Week of {new Date(w + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </option>
                  );
                })}
                {profitPeriod === 'monthly' && [...monthlyPeriods].reverse().map((p, reverseIdx) => {
                  const idx = monthlyPeriods.length - 1 - reverseIdx;
                  return <option key={p} value={idx}>{p}</option>;
                })}
                {profitPeriod === 'quarterly' && [...quarterlyPeriods].reverse().map((p, reverseIdx) => {
                  const idx = quarterlyPeriods.length - 1 - reverseIdx;
                  return <option key={p} value={idx}>{p}</option>;
                })}
              </select>
              
              {/* Quick navigation buttons */}
              <div className="flex gap-1 ml-2">
                <button
                  onClick={() => {
                    const periods = profitPeriod === 'weekly' ? sortedWeeks : profitPeriod === 'monthly' ? monthlyPeriods : quarterlyPeriods;
                    const currentIdx = profitPeriodIndex === -1 ? periods.length - 1 : profitPeriodIndex;
                    if (currentIdx > 0) setProfitPeriodIndex(currentIdx - 1);
                  }}
                  className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 text-sm"
                  title="Previous period"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => {
                    const periods = profitPeriod === 'weekly' ? sortedWeeks : profitPeriod === 'monthly' ? monthlyPeriods : quarterlyPeriods;
                    const currentIdx = profitPeriodIndex === -1 ? periods.length - 1 : profitPeriodIndex;
                    if (currentIdx < periods.length - 1) setProfitPeriodIndex(currentIdx + 1);
                    else setProfitPeriodIndex(-1); // Go to latest
                  }}
                  className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 text-sm"
                  title="Next period"
                >
                  Next →
                </button>
                <button
                  onClick={() => setProfitPeriodIndex(-1)}
                  className={`px-2 py-1 rounded text-sm ${profitPeriodIndex === -1 ? 'bg-emerald-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
                  title="Go to latest"
                >
                  Latest
                </button>
              </div>
            </div>
          )}
          
          {/* Period Comparison Summary - Clear side-by-side view */}
          {profitPeriod !== 'yearly' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-gradient-to-br from-emerald-900/30 to-slate-800/50 rounded-xl border border-emerald-500/30 p-4">
                <p className="text-emerald-400 text-xs font-medium uppercase mb-1">Selected Period</p>
                <p className="text-white font-semibold mb-2">{currentPeriodLabel}</p>
                <p className="text-2xl font-bold text-white">{formatCurrency(totals.revenue)}</p>
                <p className="text-slate-400 text-sm">Revenue</p>
              </div>
              {priorPeriodKey && (
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                  <p className="text-slate-400 text-xs font-medium uppercase mb-1">Prior Period</p>
                  <p className="text-slate-300 font-semibold mb-2">{priorPeriodLabel}</p>
                  <p className="text-2xl font-bold text-slate-300">{formatCurrency(priorTotals.revenue)}</p>
                  <p className="text-slate-500 text-sm">Revenue</p>
                </div>
              )}
            </div>
          )}
          
          {/* Key Insights Alert */}
          <div className="bg-gradient-to-r from-indigo-900/40 to-violet-900/40 border border-indigo-500/30 rounded-xl p-4 mb-6">
            <h3 className="text-indigo-300 font-semibold mb-2 flex items-center gap-2"><Zap className="w-4 h-4" />Key Insights</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-slate-400">Biggest Cost Driver</p>
                <p className="text-white font-semibold">{costDrivers[0]?.name}: {costDrivers[0]?.pct.toFixed(1)}% of revenue</p>
              </div>
              <div>
                <p className="text-slate-400">Profit Per Unit</p>
                <p className={`font-semibold ${profitPerUnit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(profitPerUnit)}</p>
              </div>
              <div>
                <p className="text-slate-400">Margin vs Prior Period</p>
                <p className={`font-semibold flex items-center gap-1 ${pcts.profit >= priorPcts.profit ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {priorPcts.profit > 0 ? (
                    <>
                      {pcts.profit >= priorPcts.profit ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      {pcts.profit >= priorPcts.profit ? '+' : ''}{(pcts.profit - priorPcts.profit).toFixed(1)}%
                    </>
                  ) : (
                    <span className="text-slate-500">No prior data</span>
                  )}
                </p>
              </div>
            </div>
          </div>
          
          {/* Profit Waterfall - Compact Horizontal View */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Profit Waterfall</h3>
              <span className="text-sm text-slate-400">{currentPeriodLabel}</span>
            </div>
            {/* Horizontal Bar Waterfall */}
            <div className="space-y-2">
              {waterfall.map((item, i) => {
                const widthPct = totals.revenue > 0 ? (Math.abs(item.value) / totals.revenue) * 100 : 0;
                const isExpense = item.value < 0;
                return (
                  <div key={item.label} className="flex items-center gap-3">
                    <div className="w-24 text-sm text-slate-400 text-right">{item.label}</div>
                    <div className="flex-1 h-8 bg-slate-900/50 rounded-lg overflow-hidden relative">
                      <div 
                        className={`h-full ${item.color} transition-all`}
                        style={{ width: `${Math.min(widthPct, 100)}%` }}
                      />
                      <span className="absolute inset-0 flex items-center px-3 text-sm font-medium text-white">
                        {isExpense ? '-' : ''}{formatCurrency(Math.abs(item.value))}
                        <span className="text-slate-400 text-xs ml-2">({widthPct.toFixed(1)}%)</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Summary */}
            <div className="mt-4 pt-4 border-t border-slate-700 flex items-center justify-between">
              <p className="text-slate-400 text-sm">For every <span className="text-white font-semibold">$1,000</span> in revenue:</p>
              <p className="text-lg font-bold">
                {pcts.profit >= 0 
                  ? <span>You keep <span className="text-emerald-400">{formatCurrency(pcts.profit * 10)}</span></span>
                  : <span>You lose <span className="text-rose-400">{formatCurrency(Math.abs(pcts.profit * 10))}</span></span>
                }
              </p>
            </div>
          </div>
          
          {/* Margin Metrics Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">Gross Margin</p>
              <p className="text-2xl font-bold text-white">{grossMargin.toFixed(1)}%</p>
              <p className="text-slate-500 text-xs">Revenue - COGS</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">Operating Margin</p>
              <p className="text-2xl font-bold text-white">{operatingMargin.toFixed(1)}%</p>
              <p className="text-slate-500 text-xs">Before ad spend</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-900/30 to-slate-800/50 rounded-xl border border-emerald-500/30 p-4">
              <p className="text-slate-400 text-sm">Net Margin</p>
              <p className={`text-2xl font-bold ${pcts.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{pcts.profit.toFixed(1)}%</p>
              <p className="text-slate-500 text-xs">After all costs</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">Return Rate</p>
              <p className={`text-2xl font-bold ${returnRate < 5 ? 'text-emerald-400' : returnRate < 10 ? 'text-amber-400' : 'text-rose-400'}`}>{returnRate.toFixed(1)}%</p>
              <p className="text-slate-500 text-xs">{totals.returns} returns</p>
            </div>
          </div>
          
          {/* Cost Breakdown Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">COGS</p>
              <p className="text-xl font-bold text-white">{formatCurrency(totals.cogs)}</p>
              <p className="text-rose-400 text-sm">{pcts.cogs.toFixed(1)}% of revenue</p>
              {priorPcts.cogs > 0 && <p className={`text-xs ${pcts.cogs <= priorPcts.cogs ? 'text-emerald-400' : 'text-rose-400'}`}>{pcts.cogs <= priorPcts.cogs ? '↓' : '↑'} vs prior</p>}
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">Amazon Fees</p>
              <p className="text-xl font-bold text-white">{formatCurrency(totals.amazonFees)}</p>
              <p className="text-orange-400 text-sm">{pcts.amazonFees.toFixed(1)}% of revenue</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">3PL Costs</p>
              <p className="text-xl font-bold text-white">{formatCurrency(totals.threeplCosts)}</p>
              <p className="text-blue-400 text-sm">{pcts.threeplCosts.toFixed(1)}% of revenue</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">Ad Spend (TACOS)</p>
              <p className="text-xl font-bold text-white">{formatCurrency(totals.adSpend)}</p>
              <p className="text-purple-400 text-sm">{pcts.adSpend.toFixed(1)}% of revenue</p>
              {priorPcts.adSpend > 0 && <p className={`text-xs ${pcts.adSpend <= priorPcts.adSpend ? 'text-emerald-400' : 'text-rose-400'}`}>{pcts.adSpend <= priorPcts.adSpend ? '↓' : '↑'} vs prior</p>}
            </div>
            <div className="bg-gradient-to-br from-emerald-900/30 to-slate-800/50 rounded-xl border border-emerald-500/30 p-4">
              <p className="text-slate-400 text-sm">Net Profit</p>
              <p className={`text-xl font-bold ${totals.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(totals.profit)}</p>
              <p className={`text-sm ${pcts.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{pcts.profit.toFixed(1)}% margin</p>
            </div>
          </div>
          
          {/* Margin Trend Chart */}
          {marginTrends.length > 1 && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Margin Trend</h3>
                <span className="text-sm text-slate-400">Last {marginTrends.length} {trendPeriodType}s</span>
              </div>
              <div className="h-48 flex items-end gap-2">
                {marginTrends.map((t, i) => {
                  const maxMargin = Math.max(...marginTrends.map(m => Math.abs(m.margin)), 50);
                  const height = Math.abs(t.margin) / maxMargin * 100;
                  const isPositive = t.margin >= 0;
                  const isLast = i === marginTrends.length - 1;
                  return (
                    <div key={t.period} className="flex-1 flex flex-col items-center group relative h-full">
                      <div className="absolute -top-16 left-1/2 transform -translate-x-1/2 hidden group-hover:block bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded whitespace-nowrap z-50 shadow-lg pointer-events-none">
                        <p className="font-medium">{t.period}</p>
                        <p className="text-slate-300">Revenue: {formatCurrency(t.revenue)}</p>
                        <p className={isPositive ? 'text-emerald-400' : 'text-rose-400'}>Margin: {t.margin.toFixed(1)}%</p>
                        <p className="text-rose-300">COGS: {t.cogsPct.toFixed(1)}%</p>
                        <p className="text-orange-300">Fees: {t.feesPct.toFixed(1)}%</p>
                        <p className="text-purple-300">Ads: {t.adsPct.toFixed(1)}%</p>
                      </div>
                      <div className="w-full flex-1 flex items-end">
                        <div 
                          className={`w-full rounded-t transition-all hover:opacity-80 ${isPositive ? (isLast ? 'bg-emerald-500' : 'bg-emerald-500/60') : (isLast ? 'bg-rose-500' : 'bg-rose-500/60')}`}
                          style={{ height: `${Math.max(height, 8)}%` }}
                        />
                      </div>
                      <div className="mt-2 text-center">
                        <span className="text-[10px] text-slate-500">{t.label}</span>
                        <p className={`text-xs font-medium ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>{t.margin.toFixed(0)}%</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-700 flex justify-between text-sm text-slate-400">
                <span>Avg Margin: <span className={marginTrends.reduce((s, t) => s + t.margin, 0) / marginTrends.length >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{(marginTrends.reduce((s, t) => s + t.margin, 0) / marginTrends.length).toFixed(1)}%</span></span>
                <span>Trend: {marginTrends.length >= 2 ? (
                  marginTrends[marginTrends.length - 1].margin > marginTrends[0].margin 
                    ? <span className="text-emerald-400">↑ Improving</span>
                    : marginTrends[marginTrends.length - 1].margin < marginTrends[0].margin
                    ? <span className="text-rose-400">↓ Declining</span>
                    : <span className="text-slate-400">→ Stable</span>
                ) : '-'}</span>
              </div>
            </div>
          )}
          
          {/* SKU Profitability Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Top Profit SKUs */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />Top Profit Generators
              </h3>
              <div className="space-y-2">
                {topProfitSkus.map((s, i) => (
                  <div key={s.sku} className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-400 font-bold">#{i+1}</span>
                      <span className="text-white truncate max-w-[120px]">{s.name || s.sku}</span>
                    </div>
                    <span className="text-emerald-400 font-semibold">{formatCurrency(s.profit)}</span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Best Margin SKUs */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" />Best Margins
              </h3>
              <div className="space-y-2">
                {bestMarginSkus.map((s, i) => (
                  <div key={s.sku} className="flex justify-between items-center text-sm">
                    <span className="text-white truncate max-w-[150px]">{s.name || s.sku}</span>
                    <span className="text-emerald-400 font-semibold">{s.margin.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Worst Margin SKUs */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-400" />Margin Opportunities
              </h3>
              <div className="space-y-2">
                {worstMarginSkus.map((s, i) => (
                  <div key={s.sku} className="flex justify-between items-center text-sm">
                    <span className="text-white truncate max-w-[150px]">{s.name || s.sku}</span>
                    <span className={`font-semibold ${s.margin < 0 ? 'text-rose-400' : 'text-amber-400'}`}>{s.margin.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
              <p className="text-slate-500 text-xs mt-2">Consider raising prices or cutting ad spend</p>
            </div>
          </div>
          
          {/* Weekly Breakdown Table */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">Weekly Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left text-slate-400 py-2">Week</th>
                    <th className="text-right text-slate-400 py-2">Revenue</th>
                    <th className="text-right text-slate-400 py-2">COGS</th>
                    <th className="text-right text-slate-400 py-2">Fees</th>
                    <th className="text-right text-slate-400 py-2">3PL</th>
                    <th className="text-right text-slate-400 py-2">Ads</th>
                    <th className="text-right text-slate-400 py-2">Profit</th>
                    <th className="text-right text-slate-400 py-2">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyBreakdown.map(w => {
                    // Format the week label - handle both date strings and period labels
                    const formatWeekLabel = (weekKey) => {
                      // Check if it's a date format (YYYY-MM-DD)
                      if (/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) {
                        return new Date(weekKey + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                      }
                      // Otherwise return as-is (it's a period label like "January 2025")
                      return weekKey;
                    };
                    return (
                    <tr key={w.week} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-2 text-white">{formatWeekLabel(w.week)}</td>
                      <td className="py-2 text-right text-white">{formatCurrency(w.revenue)}</td>
                      <td className="py-2 text-right text-rose-400">{formatCurrency(w.cogs)}</td>
                      <td className="py-2 text-right text-orange-400">{formatCurrency(w.amazonFees)}</td>
                      <td className="py-2 text-right text-blue-400">{formatCurrency(w.threeplCosts)}</td>
                      <td className="py-2 text-right text-purple-400">{formatCurrency(w.adSpend)}</td>
                      <td className={`py-2 text-right font-semibold ${w.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(w.profit)}</td>
                      <td className={`py-2 text-right ${w.margin >= 20 ? 'text-emerald-400' : w.margin >= 10 ? 'text-amber-400' : 'text-rose-400'}`}>{w.margin.toFixed(1)}%</td>
                    </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-slate-600">
                  <tr className="font-semibold">
                    <td className="py-2 text-white">Total</td>
                    <td className="py-2 text-right text-white">{formatCurrency(totals.revenue)}</td>
                    <td className="py-2 text-right text-rose-400">{formatCurrency(totals.cogs)}</td>
                    <td className="py-2 text-right text-orange-400">{formatCurrency(totals.amazonFees)}</td>
                    <td className="py-2 text-right text-blue-400">{formatCurrency(totals.threeplCosts)}</td>
                    <td className="py-2 text-right text-purple-400">{formatCurrency(totals.adSpend)}</td>
                    <td className={`py-2 text-right ${totals.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(totals.profit)}</td>
                    <td className={`py-2 text-right ${pcts.profit >= 20 ? 'text-emerald-400' : pcts.profit >= 10 ? 'text-amber-400' : 'text-rose-400'}`}>{pcts.profit.toFixed(1)}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          
          {/* Cost % Trends Chart */}
          {costTrends.length >= 4 && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">Margin Trend Over Time ({costTrends.length} weeks)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left text-slate-400 py-2">Week</th>
                      <th className="text-right text-slate-400 py-2">Revenue</th>
                      <th className="text-right text-slate-400 py-2">COGS %</th>
                      <th className="text-right text-slate-400 py-2">Ads %</th>
                      <th className="text-right text-slate-400 py-2">Fees %</th>
                      <th className="text-right text-slate-400 py-2">Net Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costTrends.map(t => (
                      <tr key={t.week} className="border-b border-slate-700/50">
                        <td className="py-2 text-white">{new Date(t.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                        <td className="py-2 text-right text-white">{formatCurrency(t.revenue)}</td>
                        <td className="py-2 text-right text-rose-400">{t.cogsPct.toFixed(1)}%</td>
                        <td className="py-2 text-right text-purple-400">{t.adsPct.toFixed(1)}%</td>
                        <td className="py-2 text-right text-orange-400">{t.feesPct.toFixed(1)}%</td>
                        <td className={`py-2 text-right font-semibold ${t.margin >= 20 ? 'text-emerald-400' : t.margin >= 10 ? 'text-amber-400' : t.margin >= 0 ? 'text-white' : 'text-rose-400'}`}>{t.margin.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {/* Break-even Analysis - Redesigned */}
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-2xl border border-slate-700 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-violet-400" />
              Break-Even Analysis
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left side - Key metrics */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-900/50 rounded-xl p-4">
                    <p className="text-slate-500 text-xs uppercase mb-1">Cost Ratio</p>
                    <p className="text-2xl font-bold text-white">{(100 - pcts.profit).toFixed(1)}%</p>
                    <p className="text-slate-400 text-xs">of revenue</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-xl p-4">
                    <p className="text-slate-500 text-xs uppercase mb-1">Keep Per $1,000</p>
                    <p className={`text-2xl font-bold ${pcts.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(Math.max(0, pcts.profit) * 10)}</p>
                    <p className="text-slate-400 text-xs">net profit</p>
                  </div>
                </div>
                
                <div className="bg-slate-900/50 rounded-xl p-4">
                  <p className="text-slate-500 text-xs uppercase mb-1">Average Order Value</p>
                  <p className="text-xl font-bold text-white">{formatCurrency(avgOrderValue)}</p>
                </div>
                
                <div className="bg-violet-900/20 border border-violet-500/20 rounded-xl p-4">
                  <p className="text-violet-300 font-semibold mb-3 flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    To increase margin by 5%:
                  </p>
                  <ul className="text-slate-300 text-sm space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-rose-400">•</span>
                      <span>Reduce COGS by <span className="text-white font-medium">{formatCurrency(totals.revenue * 0.05)}</span> (negotiate suppliers)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-purple-400">•</span>
                      <span>Cut ad spend by <span className="text-white font-medium">{pcts.adSpend > 0 ? `${Math.round(5 / pcts.adSpend * 100)}%` : 'N/A'}</span> (optimize targeting)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-amber-400">•</span>
                      <span>Increase prices by <span className="text-white font-medium">~{(100 - pcts.profit) > 0 ? (5 / (100 - pcts.profit) * 100).toFixed(1) : '0'}%</span></span>
                    </li>
                  </ul>
                </div>
              </div>
              
              {/* Right side - Visual breakdown */}
              <div className="bg-slate-900/50 rounded-xl p-5">
                <p className="text-slate-400 text-sm font-medium mb-4">Revenue Breakdown</p>
                
                {/* Stacked bar */}
                <div className="h-8 bg-slate-700 rounded-lg overflow-hidden flex mb-4">
                  {pcts.cogs > 0 && <div className="bg-rose-500 h-full transition-all" style={{ width: `${pcts.cogs}%` }} />}
                  {pcts.amazonFees > 0 && <div className="bg-orange-500 h-full transition-all" style={{ width: `${pcts.amazonFees}%` }} />}
                  {pcts.threeplCosts > 0 && <div className="bg-blue-500 h-full transition-all" style={{ width: `${pcts.threeplCosts}%` }} />}
                  {pcts.adSpend > 0 && <div className="bg-purple-500 h-full transition-all" style={{ width: `${pcts.adSpend}%` }} />}
                  {pcts.profit !== 0 && <div className={`${pcts.profit >= 0 ? 'bg-emerald-500' : 'bg-rose-600'} h-full transition-all`} style={{ width: `${Math.abs(pcts.profit)}%` }} />}
                </div>
                
                {/* Legend - Grid layout for better readability */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-rose-500 rounded-sm flex-shrink-0" />
                    <span className="text-slate-300">COGS</span>
                    <span className="text-white font-medium ml-auto">{pcts.cogs.toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-orange-500 rounded-sm flex-shrink-0" />
                    <span className="text-slate-300">Fees</span>
                    <span className="text-white font-medium ml-auto">{pcts.amazonFees.toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-blue-500 rounded-sm flex-shrink-0" />
                    <span className="text-slate-300">3PL</span>
                    <span className="text-white font-medium ml-auto">{pcts.threeplCosts.toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-purple-500 rounded-sm flex-shrink-0" />
                    <span className="text-slate-300">Ads</span>
                    <span className="text-white font-medium ml-auto">{pcts.adSpend.toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center gap-2 col-span-2 pt-2 border-t border-slate-700">
                    <span className={`w-3 h-3 ${pcts.profit >= 0 ? 'bg-emerald-500' : 'bg-rose-600'} rounded-sm flex-shrink-0`} />
                    <span className="text-slate-300 font-medium">Net Profit</span>
                    <span className={`font-bold ml-auto ${pcts.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{pcts.profit.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </>)}
        </div>
      </div>
    );

};

export default ProfitabilityView;
