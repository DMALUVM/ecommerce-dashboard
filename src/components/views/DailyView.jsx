import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  BarChart3, ChevronLeft, ChevronRight, DollarSign, Package, ShoppingCart, Store, Trash2, TrendingUp
} from 'lucide-react';
import { formatCurrency, formatNumber, formatPercent } from '../../utils/format';
import { lsSet } from '../../utils/storage';
import NavTabs from '../ui/NavTabs';
import ChannelCard from '../ui/ChannelCard';
import MetricCard from '../ui/MetricCard';

const DailyView = ({
  adSpend,
  allDaysData,
  allPeriodsData,
  allWeeksData,
  appSettings,
  bankingData,
  combinedData,
  current,
  get3PLForDay,
  get3PLForWeek,
  getShopifyAdsForDay,
  getSunday,
  globalModals,
  hasDailySalesData,
  invHistory,
  navDropdown,
  queueCloudSave,
  selectedDay,
  setAllDaysData,
  setDeletedItems,
  setNavDropdown,
  setSelectedDay,
  setSelectedInvDate,
  setSelectedPeriod,
  setSelectedWeek,
  setToast,
  setUploadTab,
  setView,
  storeLogo,
  storeName,
  sumSkuRows,
  threeplLedger,
  view,
  withShippingSkuRow,
}) => {
    const dayData = allDaysData[selectedDay];
    const today = new Date().toISOString().split('T')[0];
    const daysWithSales = Object.keys(allDaysData).filter(k => hasDailySalesData(allDaysData[k]) && k <= today).sort().reverse();
    
    // If current selectedDay is in the future, switch to most recent valid day
    if (selectedDay > today && daysWithSales.length > 0) {
      setSelectedDay(daysWithSales[0]);
      return null; // Re-render with valid day
    }
    
    const idx = daysWithSales.indexOf(selectedDay);
    
    let amazon = dayData.amazon || {};
let shopify = dayData.shopify || {};

// Calculate Amazon COGS from SKU data if not already set
if (!amazon.cogs && amazon.skuData && Array.isArray(amazon.skuData)) {
  const amazonSkuCogs = amazon.skuData.reduce((sum, sku) => sum + (sku.cogs || 0), 0);
  amazon = { ...amazon, cogs: amazonSkuCogs };
}

// Normalize Shopify ads metrics for this day (consistent KPIs across views)
const shopifyAds = getShopifyAdsForDay(dayData);

// Ensure Shopify SKU totals reconcile to the displayed revenue by adding shipping collected as a SKU row
const shopifySkuWithShipping = withShippingSkuRow(shopify.skuData || [], shopify.shippingCollected || 0);
if (shopifySkuWithShipping.length > 0) {
  const skuSums = sumSkuRows(shopifySkuWithShipping, { units: 'unitsSold', revenue: 'netSales', cogs: 'cogs', profit: 'profit' });
  shopify = { ...shopify, revenue: skuSums.revenue, units: skuSums.units, cogs: skuSums.cogs, skuData: shopifySkuWithShipping };
}

    // Compute totals from channel data (more reliable than stored total which may be incomplete)
    const storedTotal = dayData.total || {};
    const total = {
      revenue: (amazon.revenue || 0) + (shopify.revenue || 0),
      units: (amazon.units || 0) + (shopify.units || 0),
      cogs: (amazon.cogs || 0) + (shopify.cogs || 0),
      netProfit: (amazon.netProfit || amazon.netProceeds || 0) + (shopify.netProfit || 0),
      adSpend: (amazon.adSpend || 0) + (shopify.metaSpend || dayData.metaSpend || 0) + (shopify.googleSpend || dayData.googleSpend || 0),
    };
    // Recalculate derived metrics
    total.netMargin = total.revenue > 0 ? (total.netProfit / total.revenue) * 100 : 0;
    total.roas = total.adSpend > 0 ? total.revenue / total.adSpend : 0;
    total.amazonShare = total.revenue > 0 ? ((amazon.revenue || 0) / total.revenue) * 100 : 0;
    total.shopifyShare = total.revenue > 0 ? ((shopify.revenue || 0) / total.revenue) * 100 : 0;
    
    // Get ads metrics from either shopify object or top-level dayData (bulk uploads store at top level)
    const googleSpend = shopify.googleSpend || dayData.googleSpend || 0;
    const metaSpend = shopify.metaSpend || dayData.metaSpend || 0;
    const googleImpressions = shopifyAds.googleImpressions || 0;
    const googleClicks = shopifyAds.googleClicks || 0;
    const googleConversions = shopifyAds.googleConversions || 0;
    const googleCPC = dayData.googleCpc || (googleClicks > 0 ? googleSpend / googleClicks : 0);
    const googleCPA = dayData.googleCpa || dayData.googleCostPerConv || (googleConversions > 0 ? googleSpend / googleConversions : 0);
    const metaImpressions = shopify.adsMetrics?.metaImpressions || dayData.metaImpressions || 0;
    const metaClicks = shopify.adsMetrics?.metaClicks || dayData.metaClicks || 0;
    const metaPurchases = shopify.adsMetrics?.metaPurchases || dayData.metaPurchases || dayData.metaConversions || 0;
    const metaCTR = dayData.metaCtr || (metaImpressions > 0 ? (metaClicks / metaImpressions) * 100 : 0);
    const metaCPC = dayData.metaCpc || (metaClicks > 0 ? metaSpend / metaClicks : 0);
    
    // Get 3PL costs from ledger first (exact day match), then try week ledger, then weekly data, then fallback
    const ledger3PLDay = get3PLForDay(threeplLedger, selectedDay);
    // Calculate the week key (Sunday) for this day
    const weekKey = getSunday(new Date(selectedDay + 'T12:00:00'));
    const ledger3PLWeek = !ledger3PLDay ? get3PLForWeek(threeplLedger, weekKey) : null;
    const weekData = allWeeksData[weekKey];
    
    // Use day data if available, otherwise prorate week data
    // NOTE: Storage is excluded from daily 3PL as it's a weekly/monthly aggregate charge
    let threeplCosts = 0;
    let threeplBreakdown = {};
    let threeplMetrics = {};
    
    if (ledger3PLDay && ledger3PLDay.metrics.totalCost > 0) {
      // Exact day match from ledger - exclude storage
      const storageExcluded = ledger3PLDay.breakdown.storage || 0;
      threeplCosts = ledger3PLDay.metrics.totalCost - storageExcluded;
      threeplBreakdown = { ...ledger3PLDay.breakdown, storage: 0 };
      threeplMetrics = { ...ledger3PLDay.metrics, totalCost: threeplCosts };
    } else if (ledger3PLWeek && ledger3PLWeek.metrics.totalCost > 0) {
      // Prorate from week ledger data - exclude storage
      const weekShopifyUnits = weekData?.shopify?.units || 0;
      const dayShopifyUnits = shopify.units || 0;
      const ratio = weekShopifyUnits > 0 && dayShopifyUnits > 0 
        ? dayShopifyUnits / weekShopifyUnits 
        : 1/7;
      
      // Calculate costs excluding storage
      const weekCostExStorage = ledger3PLWeek.metrics.totalCost - (ledger3PLWeek.breakdown.storage || 0);
      threeplCosts = weekCostExStorage * ratio;
      threeplBreakdown = {
        storage: 0, // Excluded from daily
        shipping: (ledger3PLWeek.breakdown.shipping || 0) * ratio,
        pickFees: (ledger3PLWeek.breakdown.pickFees || 0) * ratio,
        boxCharges: (ledger3PLWeek.breakdown.boxCharges || 0) * ratio,
        receiving: (ledger3PLWeek.breakdown.receiving || 0) * ratio,
        other: (ledger3PLWeek.breakdown.other || 0) * ratio,
      };
      threeplMetrics = {
        ...ledger3PLWeek.metrics,
        totalCost: threeplCosts,
        orderCount: Math.round(ledger3PLWeek.metrics.orderCount * ratio),
        totalUnits: Math.round(ledger3PLWeek.metrics.totalUnits * ratio),
        isProrated: true,
      };
    } else if (weekData?.shopify?.threeplCosts > 0) {
      // Use weekly processed data's 3PL costs (prorate by units) - exclude storage
      const weekShopifyUnits = weekData.shopify.units || 0;
      const dayShopifyUnits = shopify.units || 0;
      const ratio = weekShopifyUnits > 0 && dayShopifyUnits > 0 
        ? dayShopifyUnits / weekShopifyUnits 
        : 1/7;
      
      const weekThreepl = weekData.shopify;
      const weekStorage = weekThreepl.threeplBreakdown?.storage || 0;
      const weekCostExStorage = weekThreepl.threeplCosts - weekStorage;
      threeplCosts = weekCostExStorage * ratio;
      threeplBreakdown = weekThreepl.threeplBreakdown ? {
        storage: 0, // Excluded from daily
        shipping: (weekThreepl.threeplBreakdown.shipping || 0) * ratio,
        pickFees: (weekThreepl.threeplBreakdown.pickFees || 0) * ratio,
        boxCharges: (weekThreepl.threeplBreakdown.boxCharges || 0) * ratio,
        receiving: (weekThreepl.threeplBreakdown.receiving || 0) * ratio,
        other: (weekThreepl.threeplBreakdown.other || 0) * ratio,
      } : {};
      threeplMetrics = weekThreepl.threeplMetrics ? {
        ...weekThreepl.threeplMetrics,
        totalCost: threeplCosts,
        orderCount: Math.round((weekThreepl.threeplMetrics.orderCount || 0) * ratio),
        totalUnits: Math.round((weekThreepl.threeplMetrics.totalUnits || 0) * ratio),
        isProrated: true,
      } : { totalCost: threeplCosts, isProrated: true };
    } else {
      // Fallback to stored day data - also exclude storage
      const rawCost = shopify.threeplCosts || dayData.threeplCosts || 0;
      const rawBreakdown = shopify.threeplBreakdown || dayData.threeplBreakdown || {};
      const storageCost = rawBreakdown.storage || 0;
      threeplCosts = rawCost - storageCost;
      threeplBreakdown = { ...rawBreakdown, storage: 0 };
      threeplMetrics = shopify.threeplMetrics || dayData.threeplMetrics || {};
    }
    
    // Build proper data structures for ChannelCard component
    const amazonData = {
      revenue: amazon.revenue || 0,
      units: amazon.units || 0,
      netProfit: amazon.netProfit || amazon.netProceeds || 0,
      margin: amazon.margin || (amazon.revenue > 0 ? ((amazon.netProfit || amazon.netProceeds || 0) / amazon.revenue) * 100 : 0),
      cogs: amazon.cogs || 0,
      fees: amazon.fees || amazon.fbaFees || 0,
      adSpend: amazon.adSpend || 0,
      roas: amazon.roas || (amazon.adSpend > 0 ? amazon.revenue / amazon.adSpend : 0),
      aov: amazon.units > 0 ? amazon.revenue / amazon.units : 0,
      returns: amazon.returns || 0,
      returnRate: amazon.returnRate || 0,
      skuData: amazon.skuData || [],
    };
    
    const shopifyData = {
      revenue: shopify.revenue || 0,
      units: shopify.units || 0,
      netProfit: shopify.netProfit || 0,
      netMargin: shopify.netMargin || (shopify.revenue > 0 ? (shopify.netProfit / shopify.revenue) * 100 : 0),
      cogs: shopify.cogs || 0,
      threeplCosts: threeplCosts,
      threeplBreakdown: threeplBreakdown,
      threeplMetrics: threeplMetrics,
      adSpend: metaSpend + googleSpend,
      metaSpend: metaSpend,
      googleSpend: googleSpend,
      roas: (metaSpend + googleSpend) > 0 ? (shopify.revenue || 0) / (metaSpend + googleSpend) : 0,
      aov: shopify.units > 0 ? shopify.revenue / shopify.units : 0,
      discounts: shopify.discounts || 0,
      skuData: shopify.skuData || [],
    };
    
    const deleteDay = (dayKey) => {
      const data = allDaysData[dayKey];
      if (!data) return;
      
      const revenue = data.total?.revenue || 0;
      const dateStr = new Date(dayKey + 'T12:00:00').toLocaleDateString();
      
      // Delete immediately
      const updated = { ...allDaysData };
      delete updated[dayKey];
      setAllDaysData(updated);
      lsSet('ecommerce_daily_sales_v1', JSON.stringify(updated));
      queueCloudSave({ ...combinedData, dailySales: updated });
      
      // Store for undo
      const undoId = Date.now();
      const undoTimer = setTimeout(() => {
        setDeletedItems(prev => prev.filter(item => item.id !== undoId));
      }, 10000);
      
      setDeletedItems(prev => [...prev, { id: undoId, type: 'day', key: dayKey, data, undoTimer }]);
      setToast({ 
        message: `Deleted ${dateStr} ($${revenue.toFixed(0)} revenue)`, 
        type: 'warning',
        action: {
          label: 'Undo',
          onClick: () => {
            clearTimeout(undoTimer);
            const restored = { ...allDaysData, [dayKey]: data };
            setAllDaysData(restored);
            lsSet('ecommerce_daily_sales_v1', JSON.stringify(restored));
            queueCloudSave({ ...combinedData, dailySales: restored });
            setSelectedDay(dayKey);
            setDeletedItems(prev => prev.filter(item => item.id !== undoId));
            setToast({ message: `Restored ${dateStr}`, type: 'success' });
          }
        }
      });
      
      const today = new Date().toISOString().split('T')[0];
      const remaining = Object.keys(updated).filter(k => hasDailySalesData(updated[k]) && k <= today).sort().reverse();
      if (remaining.length) setSelectedDay(remaining[0]);
      else { setView('dashboard'); setSelectedDay(null); }
    };
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 lg:p-6">
        <div className="max-w-7xl mx-auto">{globalModals}
          
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              {storeLogo && (
                <img src={storeLogo} alt="Store logo" className="w-12 h-12 object-contain rounded-xl bg-white p-1.5" />
              )}
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold text-white">{storeName ? storeName + ' Dashboard' : 'Daily Performance'}</h1>
                <p className="text-slate-400">{new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => deleteDay(selectedDay)} className="bg-rose-900/50 hover:bg-rose-800/50 border border-rose-600/50 text-rose-300 px-3 py-2 rounded-lg text-sm"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
          
          <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />
          
          {/* Day Selector */}
          <div className="flex items-center gap-4 mb-6">
            <button onClick={() => idx < daysWithSales.length - 1 && setSelectedDay(daysWithSales[idx + 1])} disabled={idx >= daysWithSales.length - 1} className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg"><ChevronLeft className="w-5 h-5" /></button>
            <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white">
              {daysWithSales.map(d => <option key={d} value={d}>{new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</option>)}
            </select>
            <button onClick={() => idx > 0 && setSelectedDay(daysWithSales[idx - 1])} disabled={idx <= 0} className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg"><ChevronRight className="w-5 h-5" /></button>
          </div>
          
          {/* Top Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <MetricCard label="Total Revenue" value={formatCurrency(total.revenue || 0)} icon={DollarSign} color="emerald" />
            <MetricCard label="Total Units" value={formatNumber(total.units || 0)} icon={Package} color="blue" />
            <MetricCard label="Net Profit" value={formatCurrency(total.netProfit || 0)} sub={`${formatPercent(total.netMargin || 0)} margin`} icon={TrendingUp} color={(total.netProfit || 0) >= 0 ? 'emerald' : 'rose'} />
            <MetricCard label="Ad Spend" value={formatCurrency(total.adSpend || 0)} sub={`${(total.roas || 0).toFixed(2)}x TACOS`} icon={BarChart3} color="violet" />
            <MetricCard label="COGS" value={formatCurrency(total.cogs || 0)} icon={ShoppingCart} color="amber" />
          </div>
          
          {/* Channel Split Bar */}
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5 mb-8">
            <h3 className="text-sm font-semibold text-slate-400 uppercase mb-4">Revenue by Channel</h3>
            <div className="h-4 bg-slate-700 rounded-full overflow-hidden flex mb-3">
              <div className="bg-orange-500 h-full" style={{ width: `${total.amazonShare || 0}%` }} />
              <div className="bg-blue-500 h-full" style={{ width: `${total.shopifyShare || 0}%` }} />
            </div>
            <div className="flex justify-between text-sm">
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-orange-500" /><span className="text-slate-300">Amazon</span><span className="text-white font-semibold">{formatPercent(total.amazonShare || 0)}</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500" /><span className="text-slate-300">Shopify</span><span className="text-white font-semibold">{formatPercent(total.shopifyShare || 0)}</span></div>
            </div>
          </div>
          
          {/* Channel Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChannelCard title="Amazon" color="orange" data={amazonData} isAmz showSkuTable />
            <ChannelCard title="Shopify" color="blue" data={shopifyData} showSkuTable />
          </div>
          
          {/* Google/Meta Ads Details */}
          {(googleSpend > 0 || googleImpressions > 0 || metaSpend > 0 || metaImpressions > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              {/* Google Ads */}
              {(googleSpend > 0 || googleImpressions > 0) && (
                <div className="bg-red-900/20 border border-red-500/30 rounded-2xl p-5">
                  <h3 className="text-lg font-semibold text-red-400 mb-4">Google Ads</h3>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div><p className="text-slate-400 text-xs mb-1">Spend</p><p className="text-white text-lg font-semibold">{formatCurrency(googleSpend)}</p></div>
                    <div><p className="text-slate-400 text-xs mb-1">Clicks</p><p className="text-white text-lg font-semibold">{formatNumber(googleClicks)}</p></div>
                    <div><p className="text-slate-400 text-xs mb-1">Impressions</p><p className="text-white text-lg font-semibold">{formatNumber(googleImpressions)}</p></div>
                    <div><p className="text-slate-400 text-xs mb-1">Conversions</p><p className="text-white text-lg font-semibold">{formatNumber(googleConversions)}</p></div>
                    <div><p className="text-slate-400 text-xs mb-1">CPC</p><p className="text-white text-lg font-semibold">{formatCurrency(googleCPC)}</p></div>
                    <div><p className="text-slate-400 text-xs mb-1">CPA</p><p className="text-white text-lg font-semibold">{formatCurrency(googleCPA)}</p></div>
                  </div>
                </div>
              )}
              
              {/* Meta Ads */}
              {(metaSpend > 0 || metaImpressions > 0) && (
                <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-2xl p-5">
                  <h3 className="text-lg font-semibold text-indigo-400 mb-4">Meta Ads</h3>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div><p className="text-slate-400 text-xs mb-1">Spend</p><p className="text-white text-lg font-semibold">{formatCurrency(metaSpend)}</p></div>
                    <div><p className="text-slate-400 text-xs mb-1">Clicks</p><p className="text-white text-lg font-semibold">{formatNumber(metaClicks)}</p></div>
                    <div><p className="text-slate-400 text-xs mb-1">Impressions</p><p className="text-white text-lg font-semibold">{formatNumber(metaImpressions)}</p></div>
                    <div><p className="text-slate-400 text-xs mb-1">Purchases</p><p className="text-white text-lg font-semibold">{formatNumber(metaPurchases)}</p></div>
                    <div><p className="text-slate-400 text-xs mb-1">CTR</p><p className="text-white text-lg font-semibold">{metaCTR.toFixed(2)}%</p></div>
                    <div><p className="text-slate-400 text-xs mb-1">CPC</p><p className="text-white text-lg font-semibold">{formatCurrency(metaCPC)}</p></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );

};

export default DailyView;
