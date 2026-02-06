import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Check, Filter, Store, Table, Truck, Upload
} from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/format';
import NavTabs from '../ui/NavTabs';

const ThreePLView = ({
  allDaysData,
  allPeriodsData,
  allWeeksData,
  appSettings,
  bankingData,
  dataBar,
  files,
  get3PLForWeek,
  globalModals,
  hasDailySalesData,
  invHistory,
  navDropdown,
  setNavDropdown,
  setSelectedDay,
  setSelectedInvDate,
  setSelectedPeriod,
  setSelectedWeek,
  setShow3PLBulkUpload,
  setThreeplCustomEnd,
  setThreeplCustomStart,
  setThreeplDateRange,
  setThreeplTimeView,
  setUploadTab,
  setView,
  threeplCustomEnd,
  threeplCustomStart,
  threeplDateRange,
  threeplLedger,
  threeplTimeView,
  view,
}) => {
    const sortedWeeks = Object.keys(allWeeksData).sort();
    
    // Get all ledger data
    const ledgerOrders = Object.values(threeplLedger.orders || {});
    const ledgerWeeksSet = new Set(ledgerOrders.map(o => o.weekKey));
    const ledgerWeeksList = [...ledgerWeeksSet].sort();
    
    // Calculate date boundaries based on selected range
    const getDateBoundaries = () => {
      const today = new Date();
      let startDate, endDate = today;
      
      switch (threeplDateRange) {
        case 'week':
          startDate = new Date(today);
          startDate.setDate(today.getDate() - 7);
          break;
        case '4weeks':
          startDate = new Date(today);
          startDate.setDate(today.getDate() - 28);
          break;
        case 'month':
          startDate = new Date(today.getFullYear(), today.getMonth(), 1);
          break;
        case 'quarter':
          const quarter = Math.floor(today.getMonth() / 3);
          startDate = new Date(today.getFullYear(), quarter * 3, 1);
          break;
        case 'year':
          startDate = new Date(today.getFullYear(), 0, 1);
          break;
        case 'custom':
          startDate = threeplCustomStart ? new Date(threeplCustomStart) : new Date(0);
          endDate = threeplCustomEnd ? new Date(threeplCustomEnd) : today;
          break;
        case 'all':
        default:
          startDate = new Date(0);
          break;
      }
      
      return { 
        start: startDate.toISOString().split('T')[0], 
        end: endDate.toISOString().split('T')[0] 
      };
    };
    
    const dateBounds = getDateBoundaries();
    
    // Aggregate 3PL data by week - check BOTH weekly data AND ledger
    let weeklyData = sortedWeeks.map(w => {
      const week = allWeeksData[w];
      const weekMetrics = week.shopify?.threeplMetrics || {};
      const weekBreakdown = week.shopify?.threeplBreakdown || {};
      const weekCost = week.shopify?.threeplCosts || 0;
      
      // Also check ledger for this week's data
      const ledgerData = get3PLForWeek(threeplLedger, w);
      
      // Calculate values from weekly data
      const weekOrderCount = weekMetrics.orderCount || weekMetrics.firstPickCount || weekMetrics.shippingCount || 0;
      const weekAvgCost = weekMetrics.avgCostPerOrder || 
        (weekOrderCount > 0 ? (weekCost - (weekBreakdown.storage || 0)) / weekOrderCount : 0);
      
      // Calculate values from ledger data
      const ledgerOrderCount = ledgerData?.metrics?.orderCount || 0;
      const ledgerCost = ledgerData?.metrics?.totalCost || 0;
      const ledgerAvgCost = ledgerData?.metrics?.avgCostPerOrder || 0;
      
      // Use whichever source has data (prefer ledger if both have data)
      const hasLedgerData = ledgerCost > 0;
      const hasWeekData = weekCost > 0;
      
      const finalCost = hasLedgerData ? ledgerCost : weekCost;
      const finalOrderCount = hasLedgerData ? ledgerOrderCount : weekOrderCount;
      const finalAvgCost = hasLedgerData ? ledgerAvgCost : weekAvgCost;
      const finalBreakdown = hasLedgerData ? (ledgerData?.breakdown || {}) : weekBreakdown;
      const finalMetrics = hasLedgerData ? (ledgerData?.metrics || {}) : weekMetrics;
      
      // If we have cost but no avgCost, try to calculate from Shopify units as fallback
      let calculatedAvgCost = finalAvgCost;
      if (calculatedAvgCost === 0 && finalCost > 0) {
        const storage = finalBreakdown.storage || 0;
        const fulfillmentCost = finalCost - storage;
        if (finalOrderCount > 0) {
          calculatedAvgCost = fulfillmentCost / finalOrderCount;
        } else if (week.shopify?.units > 0) {
          // Last resort: use Shopify units as proxy for orders
          calculatedAvgCost = fulfillmentCost / week.shopify.units;
        }
      }
      
      return {
        week: w,
        type: 'week',
        label: new Date(w + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        totalCost: finalCost,
        orderCount: finalOrderCount,
        totalUnits: finalMetrics.totalUnits || finalMetrics.firstPickCount || 0,
        avgCostPerOrder: calculatedAvgCost,
        avgShippingCost: finalMetrics.avgShippingCost || 0,
        avgPickCost: finalMetrics.avgPickCost || 0,
        avgPackagingCost: finalMetrics.avgPackagingCost || 0,
        avgUnitsPerOrder: finalMetrics.avgUnitsPerOrder || 0,
        storage: finalBreakdown.storage || 0,
        shipping: finalBreakdown.shipping || 0,
        pickFees: finalBreakdown.pickFees || 0,
        boxCharges: finalBreakdown.boxCharges || 0,
        receiving: finalBreakdown.receiving || 0,
        revenue: week.shopify?.revenue || 0,
        fromLedger: hasLedgerData,
        carrierBreakdown: finalMetrics.carrierBreakdown || {},
        stateBreakdown: finalMetrics.stateBreakdown || {},
      };
    }).filter(d => d.totalCost > 0 || d.shipping > 0 || d.pickFees > 0 || d.storage > 0);
    
    // Get weeks from ledger that aren't in allWeeksData
    const ledgerWeeks = new Set(Object.values(threeplLedger.orders || {}).map(o => o.weekKey));
    const existingWeeks = new Set(sortedWeeks);
    const ledgerOnlyWeeks = [...ledgerWeeks].filter(w => !existingWeeks.has(w)).sort();
    
    // Add ledger-only weeks to weeklyData
    ledgerOnlyWeeks.forEach(w => {
      const ledgerData = get3PLForWeek(threeplLedger, w);
      if (ledgerData && ledgerData.metrics.totalCost > 0) {
        weeklyData.push({
          week: w,
          type: 'week',
          label: new Date(w + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          totalCost: ledgerData.metrics.totalCost,
          orderCount: ledgerData.metrics.orderCount || 0,
          totalUnits: ledgerData.metrics.totalUnits || 0,
          avgCostPerOrder: ledgerData.metrics.avgCostPerOrder || 0,
          avgShippingCost: ledgerData.metrics.avgShippingCost || 0,
          avgPickCost: ledgerData.metrics.avgPickCost || 0,
          avgPackagingCost: ledgerData.metrics.avgPackagingCost || 0,
          avgUnitsPerOrder: ledgerData.metrics.avgUnitsPerOrder || 0,
          storage: ledgerData.breakdown.storage || 0,
          shipping: ledgerData.breakdown.shipping || 0,
          pickFees: ledgerData.breakdown.pickFees || 0,
          boxCharges: ledgerData.breakdown.boxCharges || 0,
          receiving: ledgerData.breakdown.receiving || 0,
          revenue: 0,
          fromLedger: true,
          carrierBreakdown: ledgerData.metrics.carrierBreakdown || {},
          stateBreakdown: ledgerData.metrics.stateBreakdown || {},
        });
      }
    });
    
    // Sort weeklyData by week
    weeklyData.sort((a, b) => a.week.localeCompare(b.week));
    
    // Store all data before filtering for comparison
    const allWeeklyData = [...weeklyData];
    
    // Filter by date range
    weeklyData = weeklyData.filter(w => {
      return w.week >= dateBounds.start && w.week <= dateBounds.end;
    });
    
    // Also get Period 3PL data
    const periodData = Object.entries(allPeriodsData).map(([key, period]) => {
      const metrics = period.shopify?.threeplMetrics || {};
      const breakdown = period.shopify?.threeplBreakdown || {};
      const totalCost = period.shopify?.threeplCosts || 0;
      const orderCount = metrics.orderCount || 0;
      // Calculate avgCostPerOrder if not provided
      const avgCostPerOrder = metrics.avgCostPerOrder || 
        (orderCount > 0 ? (totalCost - (breakdown.storage || 0)) / orderCount : 
        (totalCost > 0 && period.shopify?.units > 0 ? totalCost / period.shopify.units : 0));
      return {
        period: key,
        type: 'period',
        label: period.label || key,
        totalCost,
        orderCount,
        totalUnits: metrics.totalUnits || 0,
        avgCostPerOrder,
        avgShippingCost: metrics.avgShippingCost || 0,
        avgPickCost: metrics.avgPickCost || 0,
        avgPackagingCost: metrics.avgPackagingCost || 0,
        avgUnitsPerOrder: metrics.avgUnitsPerOrder || 0,
        storage: breakdown.storage || 0,
        shipping: breakdown.shipping || 0,
        pickFees: breakdown.pickFees || 0,
        boxCharges: breakdown.boxCharges || 0,
        receiving: breakdown.receiving || 0,
        revenue: period.shopify?.revenue || 0,
      };
    }).filter(d => d.totalCost > 0);
    
    // Aggregate by month (weekly data only)
    const monthlyData = {};
    weeklyData.forEach(w => {
      const month = w.week.substring(0, 7);
      if (!monthlyData[month]) {
        monthlyData[month] = { 
          month, totalCost: 0, orderCount: 0, totalUnits: 0, 
          storage: 0, shipping: 0, pickFees: 0, boxCharges: 0, receiving: 0,
          revenue: 0, weeks: 0
        };
      }
      monthlyData[month].totalCost += w.totalCost;
      monthlyData[month].orderCount += w.orderCount;
      monthlyData[month].totalUnits += w.totalUnits;
      monthlyData[month].storage += w.storage;
      monthlyData[month].shipping += w.shipping;
      monthlyData[month].pickFees += w.pickFees;
      monthlyData[month].boxCharges += w.boxCharges;
      monthlyData[month].receiving += w.receiving;
      monthlyData[month].revenue += w.revenue;
      monthlyData[month].weeks += 1;
    });
    
    // Calculate averages for monthly data
    Object.values(monthlyData).forEach(m => {
      m.avgCostPerOrder = m.orderCount > 0 ? (m.totalCost - m.storage) / m.orderCount : 0;
      m.avgUnitsPerOrder = m.orderCount > 0 ? m.totalUnits / m.orderCount : 0;
      m.costAsPercentOfRevenue = m.revenue > 0 ? (m.totalCost / m.revenue) * 100 : 0;
    });
    
    const months = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));
    
    // Totals for selected date range (not just last 4 weeks)
    const filteredTotals = weeklyData.reduce((acc, w) => ({
      totalCost: acc.totalCost + w.totalCost,
      orderCount: acc.orderCount + w.orderCount,
      totalUnits: acc.totalUnits + w.totalUnits,
      storage: acc.storage + w.storage,
      shipping: acc.shipping + w.shipping,
      pickFees: acc.pickFees + w.pickFees,
      boxCharges: acc.boxCharges + w.boxCharges,
      revenue: acc.revenue + w.revenue,
    }), { totalCost: 0, orderCount: 0, totalUnits: 0, storage: 0, shipping: 0, pickFees: 0, boxCharges: 0, revenue: 0 });
    
    filteredTotals.avgCostPerOrder = filteredTotals.orderCount > 0 ? (filteredTotals.totalCost - filteredTotals.storage) / filteredTotals.orderCount : 0;
    filteredTotals.avgUnitsPerOrder = filteredTotals.orderCount > 0 ? filteredTotals.totalUnits / filteredTotals.orderCount : 0;
    filteredTotals.costAsPercentOfRevenue = filteredTotals.revenue > 0 ? (filteredTotals.totalCost / filteredTotals.revenue) * 100 : 0;
    
    // Date range labels
    const rangeLabels = {
      'week': 'Last 7 Days',
      '4weeks': 'Last 4 Weeks',
      'month': 'This Month',
      'quarter': 'This Quarter',
      'year': 'This Year',
      'all': 'All Time',
      'custom': 'Custom Range',
    };
    
    // Find max for chart scaling
    const maxWeeklyCost = Math.max(...weeklyData.map(d => d.totalCost), 1);
    const maxMonthlyCost = Math.max(...months.map(d => d.totalCost), 1);
    
    // Use component-level state for time view toggle
    const timeView = threeplTimeView;
    const setTimeView = setThreeplTimeView;
    
    // Check if we have any 3PL data at all (use unfiltered data)
    const hasWeeklyData = allWeeklyData.length > 0;
    const hasPeriodData = periodData.length > 0;
    const hasLedgerData = Object.keys(threeplLedger.orders || {}).length > 0;
    
    if (!hasWeeklyData && !hasPeriodData && !hasLedgerData) {
      return (
        <div className="min-h-screen bg-slate-950 p-4 lg:p-6">
          <div className="max-w-7xl mx-auto">{globalModals}
            <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />{dataBar}
            <div className="text-center py-12">
              <Truck className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">No 3PL Data Yet</h2>
              <p className="text-slate-400 mb-4">Upload data with 3PL files to see fulfillment analytics</p>
              <button 
                onClick={() => setShow3PLBulkUpload(true)}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-semibold flex items-center gap-2 mx-auto mb-4"
              >
                <Upload className="w-5 h-5" />
                Bulk Upload 3PL Files
              </button>
              <div className="text-slate-500 text-sm">
                <p>Upload multiple 3PL Excel files at once</p>
                <p>Supports .xlsx format from Packiyo • Auto-deduplication</p>
              </div>
            </div>
          </div>
        </div>
      );
    }
    
    // If only period data (no weekly and no ledger), show a different view
    if (!hasWeeklyData && hasPeriodData && !hasLedgerData) {
      return (
        <div className="min-h-screen bg-slate-950 p-4 lg:p-6">
          <div className="max-w-7xl mx-auto">{globalModals}
            <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />{dataBar}
            
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h1 className="text-2xl lg:text-3xl font-bold text-white">🚚 3PL Fulfillment Analytics</h1>
                <button 
                  onClick={() => setShow3PLBulkUpload(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-medium flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Bulk Upload
                </button>
              </div>
              <p className="text-slate-400">Period-level 3PL data (upload weekly data for trend charts)</p>
            </div>
            
            {/* Period 3PL Summary */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">Period 3PL Summary</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left text-slate-400 py-2">Period</th>
                      <th className="text-right text-slate-400 py-2">Total 3PL</th>
                      <th className="text-right text-slate-400 py-2">Orders</th>
                      <th className="text-right text-slate-400 py-2">Units</th>
                      <th className="text-right text-slate-400 py-2">Avg/Order</th>
                      <th className="text-right text-slate-400 py-2">Shipping</th>
                      <th className="text-right text-slate-400 py-2">Pick Fees</th>
                      <th className="text-right text-slate-400 py-2">Storage</th>
                      <th className="text-right text-slate-400 py-2">% of Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodData.map(d => {
                      const pctOfRev = d.revenue > 0 ? (d.totalCost / d.revenue) * 100 : 0;
                      return (
                        <tr key={d.period} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                          <td className="py-3 text-white font-medium">{d.label}</td>
                          <td className="py-3 text-right text-white font-semibold">{formatCurrency(d.totalCost)}</td>
                          <td className="py-3 text-right text-white">{d.orderCount > 0 ? formatNumber(d.orderCount) : '—'}</td>
                          <td className="py-3 text-right text-white">{d.totalUnits > 0 ? formatNumber(d.totalUnits) : '—'}</td>
                          <td className={`py-3 text-right font-semibold ${d.avgCostPerOrder > 0 ? (d.avgCostPerOrder <= 10 ? 'text-emerald-400' : d.avgCostPerOrder <= 15 ? 'text-amber-400' : 'text-rose-400') : 'text-slate-500'}`}>
                            {d.avgCostPerOrder > 0 ? formatCurrency(d.avgCostPerOrder) : '—'}
                          </td>
                          <td className="py-3 text-right text-blue-400">{formatCurrency(d.shipping)}</td>
                          <td className="py-3 text-right text-emerald-400">{formatCurrency(d.pickFees)}</td>
                          <td className="py-3 text-right text-violet-400">{formatCurrency(d.storage)}</td>
                          <td className={`py-3 text-right ${pctOfRev <= 10 ? 'text-emerald-400' : pctOfRev <= 15 ? 'text-amber-400' : 'text-rose-400'}`}>
                            {pctOfRev.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
              <p className="text-blue-400 text-sm">💡 <strong>Tip:</strong> Upload weekly data with 3PL files to see trend charts, week-over-week comparisons, and more detailed analytics.</p>
            </div>
          </div>
        </div>
      );
    }
    
    return (
      <div className="min-h-screen bg-slate-950 p-4 lg:p-6">
        <div className="max-w-7xl mx-auto">{globalModals}
          <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />
          {dataBar}
          
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-2xl lg:text-3xl font-bold text-white">🚚 3PL Fulfillment Analytics</h1>
              <button 
                onClick={() => setShow3PLBulkUpload(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-medium flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Bulk Upload
              </button>
            </div>
            <p className="text-slate-400">Track shipping costs, order metrics, and fulfillment efficiency over time</p>
          </div>
          
          {/* Date Range Selector */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 mb-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-slate-400 text-sm">Date Range:</span>
              <div className="flex flex-wrap gap-2">
                {['week', '4weeks', 'month', 'quarter', 'year', 'all'].map(range => (
                  <button
                    key={range}
                    onClick={() => setThreeplDateRange(range)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      threeplDateRange === range 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {rangeLabels[range]}
                  </button>
                ))}
                <button
                  onClick={() => setThreeplDateRange('custom')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    threeplDateRange === 'custom' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Custom
                </button>
              </div>
              {threeplDateRange === 'custom' && (
                <div className="flex items-center gap-2 ml-auto">
                  <input
                    type="date"
                    value={threeplCustomStart}
                    onChange={(e) => setThreeplCustomStart(e.target.value)}
                    className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm"
                  />
                  <span className="text-slate-500">to</span>
                  <input
                    type="date"
                    value={threeplCustomEnd}
                    onChange={(e) => setThreeplCustomEnd(e.target.value)}
                    className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm"
                  />
                </div>
              )}
            </div>
            {weeklyData.length === 0 && allWeeklyData.length > 0 && (
              <div className="mt-3 p-3 bg-amber-900/20 border border-amber-500/30 rounded-lg">
                <p className="text-amber-400 text-sm">⚠️ No 3PL data found for {rangeLabels[threeplDateRange]}. Try selecting a different date range.</p>
              </div>
            )}
          </div>
          
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-900/30 to-slate-800/50 rounded-xl border border-blue-500/30 p-4">
              <p className="text-slate-400 text-sm">Total 3PL</p>
              <p className="text-2xl font-bold text-white">{formatCurrency(filteredTotals.totalCost)}</p>
              <p className="text-blue-400 text-xs">{filteredTotals.costAsPercentOfRevenue > 0 ? `${filteredTotals.costAsPercentOfRevenue.toFixed(1)}% of revenue` : `${weeklyData.length} weeks`}</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">Orders</p>
              <p className="text-2xl font-bold text-white">{formatNumber(filteredTotals.orderCount)}</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">Units Shipped</p>
              <p className="text-2xl font-bold text-white">{formatNumber(filteredTotals.totalUnits)}</p>
            </div>
            <div className="bg-cyan-900/30 rounded-xl border border-cyan-500/30 p-4">
              <p className="text-cyan-400 text-sm">Avg Cost/Order</p>
              <p className="text-2xl font-bold text-cyan-300">{formatCurrency(filteredTotals.avgCostPerOrder)}</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">Avg Units/Order</p>
              <p className="text-2xl font-bold text-white">{filteredTotals.avgUnitsPerOrder.toFixed(1)}</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">Storage</p>
              <p className="text-2xl font-bold text-white">{formatCurrency(filteredTotals.storage)}</p>
            </div>
          </div>
          
          {/* Time View Toggle */}
          <div className="flex gap-2 mb-4">
            <button onClick={() => setTimeView('weekly')} className={`px-4 py-2 rounded-lg text-sm font-medium ${timeView === 'weekly' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>Weekly</button>
            <button onClick={() => setTimeView('monthly')} className={`px-4 py-2 rounded-lg text-sm font-medium ${timeView === 'monthly' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>Monthly</button>
          </div>
          
          {/* Cost Trend Chart */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6 overflow-hidden">
            <h3 className="text-lg font-semibold text-white mb-4">
              {timeView === 'weekly' ? 'Weekly' : 'Monthly'} 3PL Costs
            </h3>
            <div className="relative flex items-end gap-1 h-48">
              {(timeView === 'weekly' ? weeklyData.slice(-12) : months.slice(-12)).map((d, i) => {
                const data = d;
                const height = timeView === 'weekly' 
                  ? (data.totalCost / maxWeeklyCost) * 100 
                  : (data.totalCost / maxMonthlyCost) * 100;
                const label = timeView === 'weekly' 
                  ? new Date(data.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : new Date(data.month + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                return (
                  <div key={timeView === 'weekly' ? data.week : data.month} className="flex-1 flex flex-col items-center group relative">
                    <div className="absolute -top-14 left-1/2 transform -translate-x-1/2 hidden group-hover:block bg-slate-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-50 pointer-events-none shadow-lg">
                      {label}<br/>
                      Total: {formatCurrency(data.totalCost)}<br/>
                      Orders: {formatNumber(data.orderCount)}<br/>
                      Avg/Order: {formatCurrency(data.avgCostPerOrder)}
                    </div>
                    <div className="w-full flex flex-col justify-end h-40">
                      {/* Stacked bar */}
                      <div className="w-full bg-violet-500 rounded-t" style={{ height: `${(data.storage / data.totalCost) * height}%` }} title="Storage" />
                      <div className="w-full bg-blue-500" style={{ height: `${(data.shipping / data.totalCost) * height}%` }} title="Shipping" />
                      <div className="w-full bg-emerald-500" style={{ height: `${(data.pickFees / data.totalCost) * height}%` }} title="Pick Fees" />
                      <div className="w-full bg-amber-500" style={{ height: `${(data.boxCharges / data.totalCost) * height}%` }} title="Packaging" />
                    </div>
                    <span className="text-[9px] text-slate-500 mt-1 truncate w-full text-center">{label}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-3 text-xs justify-center flex-wrap">
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-violet-500 rounded" />Storage</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded" />Shipping</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500 rounded" />Pick Fees</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-500 rounded" />Packaging</span>
            </div>
          </div>
          
          {/* 3PL Trend Charts */}
          {(() => {
            const chartData = (timeView === 'weekly' ? weeklyData : months).slice(-12);
            if (chartData.length < 2) return null;
            
            const getLabel = (d) => timeView === 'weekly' 
              ? new Date(d.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : new Date(d.month + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            
            const TrendChart = ({ data, getValue, title, format = 'currency', colorFn = null, goodDirection = 'down', icon }) => {
              const values = data.map(d => getValue(d) || 0);
              const maxVal = Math.max(...values, 1);
              const avgVal = values.reduce((a, b) => a + b, 0) / values.length;
              const latestVal = values[values.length - 1];
              const prevVal = values[values.length - 2];
              const change = prevVal > 0 ? ((latestVal - prevVal) / prevVal) * 100 : 0;
              const isGood = goodDirection === 'down' ? change <= 0 : change >= 0;
              
              return (
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="text-slate-400 text-sm">{title}</p>
                      <p className="text-white font-bold text-xl">
                        {format === 'currency' ? formatCurrency(latestVal) : format === 'percent' ? `${latestVal.toFixed(1)}%` : latestVal.toFixed(0)}
                      </p>
                    </div>
                    <div className="text-right">
                      {change !== 0 && (
                        <div className={`px-2 py-1 rounded text-xs font-medium ${isGood ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                          {change > 0 ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
                        </div>
                      )}
                      <p className="text-slate-500 text-xs mt-1">vs last {timeView === 'weekly' ? 'week' : 'month'}</p>
                    </div>
                  </div>
                  <div className="relative flex items-end gap-1 h-20">
                    {data.map((d, i) => {
                      const val = getValue(d) || 0;
                      const height = maxVal > 0 ? (val / maxVal) * 100 : 0;
                      const isLatest = i === data.length - 1;
                      const defaultColor = 'bg-slate-500';
                      const color = colorFn ? colorFn(val) : defaultColor;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center group relative">
                          <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 hidden group-hover:block bg-slate-900 border border-slate-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-50 shadow-lg pointer-events-none">
                            <p className="font-medium">{getLabel(d)}</p>
                            <p className="text-slate-300">{format === 'currency' ? formatCurrency(val) : format === 'percent' ? `${val.toFixed(1)}%` : val.toFixed(0)}</p>
                          </div>
                          <div 
                            className={`w-full rounded-t transition-all hover:opacity-80 ${isLatest ? color : color + '/60'}`} 
                            style={{ height: `${Math.max(height, 4)}%` }} 
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1 px-1">
                    <span>{getLabel(data[0])}</span>
                    <span>{getLabel(data[data.length - 1])}</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-700/50 text-xs text-slate-500">
                    Avg: {format === 'currency' ? formatCurrency(avgVal) : format === 'percent' ? `${avgVal.toFixed(1)}%` : avgVal.toFixed(0)}
                  </div>
                </div>
              );
            };
            
            return (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-4">📈 Cost Trends</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <TrendChart 
                    data={chartData} 
                    getValue={d => d.totalCost} 
                    title="Total 3PL Cost"
                    colorFn={v => 'bg-violet-500'}
                  />
                  <TrendChart 
                    data={chartData} 
                    getValue={d => d.avgCostPerOrder} 
                    title="Avg Cost Per Order"
                    colorFn={v => v <= 10 ? 'bg-emerald-500' : v <= 15 ? 'bg-amber-500' : 'bg-rose-500'}
                  />
                  <TrendChart 
                    data={chartData} 
                    getValue={d => d.revenue > 0 ? (d.totalCost / d.revenue) * 100 : 0} 
                    title="3PL as % of Revenue"
                    format="percent"
                    colorFn={v => v <= 10 ? 'bg-emerald-500' : v <= 15 ? 'bg-amber-500' : 'bg-rose-500'}
                  />
                  <TrendChart 
                    data={chartData} 
                    getValue={d => d.shipping} 
                    title="Shipping Costs"
                    colorFn={v => 'bg-blue-500'}
                  />
                  <TrendChart 
                    data={chartData} 
                    getValue={d => d.pickFees} 
                    title="Pick Fees"
                    colorFn={v => 'bg-cyan-500'}
                  />
                  <TrendChart 
                    data={chartData} 
                    getValue={d => d.storage} 
                    title="Storage Costs"
                    colorFn={v => 'bg-amber-500'}
                  />
                </div>
              </div>
            );
          })()}
          
          {/* Detailed Table */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
            <h3 className="text-lg font-semibold text-white mb-4">{timeView === 'weekly' ? 'Weekly' : 'Monthly'} Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left text-slate-400 py-2">{timeView === 'weekly' ? 'Week' : 'Month'}</th>
                    <th className="text-right text-slate-400 py-2">Total</th>
                    <th className="text-right text-slate-400 py-2">Orders</th>
                    <th className="text-right text-slate-400 py-2">Units</th>
                    <th className="text-right text-slate-400 py-2">Avg/Order</th>
                    <th className="text-right text-slate-400 py-2">Shipping</th>
                    <th className="text-right text-slate-400 py-2">Pick Fees</th>
                    <th className="text-right text-slate-400 py-2">Packaging</th>
                    <th className="text-right text-slate-400 py-2">Storage</th>
                    <th className="text-right text-slate-400 py-2">% of Rev</th>
                  </tr>
                </thead>
                <tbody>
                  {(timeView === 'weekly' ? weeklyData.slice(-12).reverse() : months.slice(-12).reverse()).map(d => {
                    const pctOfRev = d.revenue > 0 ? (d.totalCost / d.revenue) * 100 : 0;
                    const label = timeView === 'weekly' 
                      ? new Date(d.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : new Date(d.month + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                    return (
                      <tr key={timeView === 'weekly' ? d.week : d.month} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="py-2 text-white">{label}</td>
                        <td className="py-2 text-right text-white font-medium">{formatCurrency(d.totalCost)}</td>
                        <td className="py-2 text-right text-white">{formatNumber(d.orderCount)}</td>
                        <td className="py-2 text-right text-white">{formatNumber(d.totalUnits)}</td>
                        <td className={`py-2 text-right font-semibold ${d.avgCostPerOrder <= 10 ? 'text-emerald-400' : d.avgCostPerOrder <= 15 ? 'text-amber-400' : 'text-rose-400'}`}>{formatCurrency(d.avgCostPerOrder)}</td>
                        <td className="py-2 text-right text-blue-400">{formatCurrency(d.shipping)}</td>
                        <td className="py-2 text-right text-emerald-400">{formatCurrency(d.pickFees)}</td>
                        <td className="py-2 text-right text-amber-400">{formatCurrency(d.boxCharges)}</td>
                        <td className="py-2 text-right text-violet-400">{formatCurrency(d.storage)}</td>
                        <td className={`py-2 text-right ${pctOfRev <= 10 ? 'text-emerald-400' : pctOfRev <= 15 ? 'text-amber-400' : 'text-rose-400'}`}>{pctOfRev.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );

};

export default ThreePLView;
