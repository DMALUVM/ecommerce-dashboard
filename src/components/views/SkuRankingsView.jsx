import React from 'react';
import {
  AlertTriangle, Award, Database, DollarSign, Eye, Flame, List, Package, Search, Snowflake, TrendingDown, TrendingUp, Zap
} from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/format';
import NavTabs from '../ui/NavTabs';

const ALIGNMENT_CLASS = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

const SortableHeader = ({ column, label, align = 'left', sortCol, sortDir, onSort }) => {
  const alignClass = ALIGNMENT_CLASS[align] || ALIGNMENT_CLASS.left;
  return (
    <th
      className={`${alignClass} text-slate-400 font-medium py-2 cursor-pointer hover:text-white transition-colors select-none`}
      onClick={() => onSort(column)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortCol === column && (
          <span className="text-cyan-400">{sortDir === 'desc' ? '↓' : '↑'}</span>
        )}
      </span>
    </th>
  );
};

const SkuTable = ({
  color,
  data,
  icon,
  savedProductNames,
  showGrowth = false,
  showProfit = false,
  showProfitPerUnit = false,
  sortable = false,
  sortColumn,
  sortDirection,
  onSortColumn,
  onSortDirection,
  title,
}) => {
  const sortedData = sortable && sortColumn
    ? [...data].sort((a, b) => {
      const aVal = a[sortColumn] ?? 0;
      const bVal = b[sortColumn] ?? 0;
      return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
    })
    : data;

  const handleSort = (column) => {
    if (sortColumn === column) {
      onSortDirection((direction) => (direction === 'desc' ? 'asc' : 'desc'));
      return;
    }
    onSortColumn(column);
    onSortDirection('desc');
  };

  const columnCount = 5 + (showProfit ? 1 : 0) + (showProfitPerUnit ? 2 : 0) + (showGrowth ? 1 : 0);

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-lg font-semibold ${color} flex items-center gap-2`}>{icon}{title}</h3>
        {sortable && (
          <span className="text-xs text-slate-500">Click headers to sort</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left text-slate-400 font-medium py-2">#</th>
              <th className="text-left text-slate-400 font-medium py-2">Product</th>
              <th className="text-left text-slate-400 font-medium py-2">Channel</th>
              {sortable ? (
                <>
                  <SortableHeader column="revenue" label="Revenue" align="right" sortCol={sortColumn} sortDir={sortDirection} onSort={handleSort} />
                  <SortableHeader column="units" label="Units" align="right" sortCol={sortColumn} sortDir={sortDirection} onSort={handleSort} />
                  {showProfit && <SortableHeader column="profit" label="Profit" align="right" sortCol={sortColumn} sortDir={sortDirection} onSort={handleSort} />}
                  {showProfitPerUnit && <SortableHeader column="profitPerUnit" label="$/Unit" align="right" sortCol={sortColumn} sortDir={sortDirection} onSort={handleSort} />}
                  {showProfitPerUnit && <SortableHeader column="margin" label="Margin" align="right" sortCol={sortColumn} sortDir={sortDirection} onSort={handleSort} />}
                  {showGrowth && <SortableHeader column="growth" label="Growth" align="right" sortCol={sortColumn} sortDir={sortDirection} onSort={handleSort} />}
                </>
              ) : (
                <>
                  <th className="text-right text-slate-400 font-medium py-2">Revenue</th>
                  <th className="text-right text-slate-400 font-medium py-2">Units</th>
                  {showProfit && <th className="text-right text-slate-400 font-medium py-2">Profit</th>}
                  {showProfitPerUnit && <th className="text-right text-slate-400 font-medium py-2">$/Unit</th>}
                  {showProfitPerUnit && <th className="text-right text-slate-400 font-medium py-2">Margin</th>}
                  {showGrowth && <th className="text-right text-slate-400 font-medium py-2">Growth</th>}
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((s, index) => (
              <tr key={`${s.sku}-${s.channel}-${index}`} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                <td className="py-2.5 text-slate-500">{index + 1}</td>
                <td className="py-2.5"><div className="max-w-[200px] truncate text-white font-medium" title={savedProductNames[s.sku] || s.name || s.sku}>{savedProductNames[s.sku] || s.name || s.sku}</div></td>
                <td className="py-2.5"><span className={`text-xs px-2 py-0.5 rounded ${s.channel === 'Amazon' ? 'bg-orange-500/20 text-orange-400' : s.channel === 'Amazon + Shopify' ? 'bg-purple-500/20 text-purple-400' : 'bg-green-500/20 text-green-400'}`}>{s.channel}</span></td>
                <td className="py-2.5 text-right text-white font-medium">{formatCurrency(s.revenue)}</td>
                <td className="py-2.5 text-right text-white">{formatNumber(s.units)}</td>
                {showProfit && <td className={`py-2.5 text-right font-medium ${s.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(s.profit)}</td>}
                {showProfitPerUnit && <td className={`py-2.5 text-right ${s.profitPerUnit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(s.profitPerUnit)}</td>}
                {showProfitPerUnit && <td className={`py-2.5 text-right ${s.margin >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{s.margin.toFixed(1)}%</td>}
                {showGrowth && <td className={`py-2.5 text-right font-medium ${s.growth >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{s.growth > 0 ? '+' : ''}{s.growth.toFixed(0)}%</td>}
              </tr>
            ))}
            {sortedData.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="py-8 text-center text-slate-500">No data available</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const SkuRankingsView = ({
  allDaysData,
  allPeriodsData,
  allWeeksData,
  appSettings,
  bankingData,
  current,
  dataBar,
  globalModals,
  hasDailySalesData,
  invHistory,
  navDropdown,
  savedProductNames,
  selectedInvDate,
  setNavDropdown,
  setSelectedDay,
  setSelectedInvDate,
  setSelectedPeriod,
  setSelectedWeek,
  setSkuDateRange,
  setSkuSearchQuery,
  setSkuSortColumn,
  setSkuSortDirection,
  setUploadTab,
  setView,
  skuDateRange,
  skuSearchQuery,
  skuSortColumn,
  skuSortDirection,
  view,
}) => {
    const allWeeks = Object.keys(allWeeksData).sort();
    
    // Helper to get base SKU - keep full SKU since both channels use same format
    const getBaseSku = (sku) => sku;
    
    // Aggregate SKU data
    const skuAggregates = {};
    const skuRecentData = {};
    const skuOlderData = {};
    const skuWeeklyData = {};
    
    // Helper function to add SKU data to aggregates
    const addSkuData = (skuList, channel, isRecent, isOlder, periodKey) => {
      (skuList || []).forEach(s => {
        const baseSku = getBaseSku(s.sku);
        const weekProfit = channel === 'Amazon' 
          ? (s.netProceeds || 0)  // Amazon: netProceeds is profit
          : (s.netSales || 0) - (s.cogs || 0);  // Shopify: revenue - COGS
        
        if (!skuAggregates[baseSku]) {
          skuAggregates[baseSku] = { 
            sku: baseSku, 
            name: savedProductNames[s.sku] || savedProductNames[baseSku] || s.name, 
            channels: [], 
            units: 0, 
            revenue: 0, 
            profit: 0, 
            cogs: 0, 
            weeks: 0 
          };
        }
        if (!skuAggregates[baseSku].channels.includes(channel)) {
          skuAggregates[baseSku].channels.push(channel);
        }
        skuAggregates[baseSku].units += s.unitsSold || 0;
        skuAggregates[baseSku].revenue += s.netSales || 0;
        skuAggregates[baseSku].cogs += s.cogs || 0;
        skuAggregates[baseSku].profit += weekProfit;
        skuAggregates[baseSku].weeks += 1;
        
        // Track weekly/period data for trends
        if (periodKey) {
          if (!skuWeeklyData[baseSku]) {
            skuWeeklyData[baseSku] = { 
              sku: baseSku, 
              name: savedProductNames[s.sku] || savedProductNames[baseSku] || s.name, 
              channel, 
              weeks: {} 
            };
          }
          if (!skuWeeklyData[baseSku].weeks[periodKey]) {
            skuWeeklyData[baseSku].weeks[periodKey] = { units: 0, revenue: 0, profit: 0, fees: 0 };
          }
          skuWeeklyData[baseSku].weeks[periodKey].units += s.unitsSold || 0;
          skuWeeklyData[baseSku].weeks[periodKey].revenue += s.netSales || 0;
          skuWeeklyData[baseSku].weeks[periodKey].profit += weekProfit;
        }
        
        if (isRecent) {
          if (!skuRecentData[baseSku]) skuRecentData[baseSku] = { units: 0, revenue: 0, profit: 0 };
          skuRecentData[baseSku].units += s.unitsSold || 0;
          skuRecentData[baseSku].revenue += s.netSales || 0;
          skuRecentData[baseSku].profit += weekProfit;
        }
        if (isOlder) {
          if (!skuOlderData[baseSku]) skuOlderData[baseSku] = { units: 0, revenue: 0, profit: 0 };
          skuOlderData[baseSku].units += s.unitsSold || 0;
          skuOlderData[baseSku].revenue += s.netSales || 0;
          skuOlderData[baseSku].profit += weekProfit;
        }
      });
    };
    
    // Determine which data sources to use based on date range
    let sortedWeeks = [];
    let periodsUsed = [];
    let dataSourceLabel = '';
    
    // Only use current year weekly data (user confirmed no weekly data before 2026)
    const currentYearStr = new Date().getFullYear().toString();
    const weeks2026 = allWeeks.filter(w => w.startsWith(currentYearStr));
    
    if (skuDateRange === '4weeks') {
      sortedWeeks = weeks2026.slice(-4);
      dataSourceLabel = `Last 4 Weeks`;
    } else if (skuDateRange === 'ytd') {
      // YTD = 2026 weekly data only
      sortedWeeks = weeks2026;
      dataSourceLabel = `2026 Year to Date`;
    } else if (skuDateRange === '2025') {
      // 2025 = Monthly periods only (no weekly data for 2025)
      sortedWeeks = [];
      const monthlyPeriods = [
        'january-2025', 'february-2025', 'march-2025', 'april-2025', 'may-2025', 'june-2025',
        'july-2025', 'august-2025', 'september-2025', 'october-2025', 'november-2025', 'december-2025'
      ];
      monthlyPeriods.forEach(pKey => {
        if (allPeriodsData[pKey] && allPeriodsData[pKey].total?.revenue > 0) {
          periodsUsed.push(pKey);
        }
      });
      dataSourceLabel = `2025 (${periodsUsed.length} months)`;
    } else if (skuDateRange === '2024') {
      // 2024 = Quarterly periods only
      sortedWeeks = [];
      const quarterlyPeriods = ['q2-2024', 'q3-2024', 'q4-2024'];
      quarterlyPeriods.forEach(pKey => {
        if (allPeriodsData[pKey] && allPeriodsData[pKey].total?.revenue > 0) {
          periodsUsed.push(pKey);
        }
      });
      dataSourceLabel = `2024 (${periodsUsed.length} quarters)`;
    } else {
      // ALL TIME: 2026 weekly + 2025 monthly + 2024 quarterly (no overlap)
      sortedWeeks = weeks2026; // Only 2026 weekly data
      
      // Add quarterly 2024 data
      const quarterlyPeriods = ['q2-2024', 'q3-2024', 'q4-2024'];
      quarterlyPeriods.forEach(pKey => {
        if (allPeriodsData[pKey] && allPeriodsData[pKey].total?.revenue > 0) {
          periodsUsed.push(pKey);
        }
      });
      
      // Add monthly 2025 data (all 12 months)
      const monthlyPeriods = [
        'january-2025', 'february-2025', 'march-2025', 'april-2025', 'may-2025', 'june-2025',
        'july-2025', 'august-2025', 'september-2025', 'october-2025', 'november-2025', 'december-2025'
      ];
      monthlyPeriods.forEach(pKey => {
        if (allPeriodsData[pKey] && allPeriodsData[pKey].total?.revenue > 0) {
          periodsUsed.push(pKey);
        }
      });
      
      dataSourceLabel = `All Time`;
    }
    
    const recentWeeks = sortedWeeks.slice(-4);
    const olderWeeks = sortedWeeks.slice(-8, -4);
    
    // Process weekly data
    sortedWeeks.forEach(w => {
      const week = allWeeksData[w];
      if (!week) return;
      const isRecent = recentWeeks.includes(w);
      const isOlder = olderWeeks.includes(w);
      
      addSkuData(week.amazon?.skuData, 'Amazon', isRecent, isOlder, w);
      addSkuData(week.shopify?.skuData, 'Shopify', isRecent, isOlder, w);
    });
    
    // Process period data (for All Time only)
    periodsUsed.forEach(pKey => {
      const period = allPeriodsData[pKey];
      if (!period) return;
      // Period data is older, use for comparison baseline
      addSkuData(period.amazon?.skuData, 'Amazon', false, true, pKey);
      addSkuData(period.shopify?.skuData, 'Shopify', false, true, pKey);
    });
    
    // Get period label for display
    const getPeriodLabel = () => {
      if (sortedWeeks.length > 0) {
        const dateRange = `${sortedWeeks[0]} to ${sortedWeeks[sortedWeeks.length - 1]}`;
        if (periodsUsed.length > 0) {
          return `${dataSourceLabel} • Weeks: ${dateRange}, Periods: Q2-Q4 2024 + Monthly 2025`;
        }
        return `${dataSourceLabel} • ${dateRange}`;
      }
      return dataSourceLabel;
    };
    
    // Calculate profit per unit trends (recent 4 weeks vs prior 4 weeks)
    const skuProfitTrends = Object.entries(skuWeeklyData)
      .filter(([, data]) => Object.keys(data.weeks).length >= 2)
      .map(([, data]) => {
        const weekDates = Object.keys(data.weeks).sort();
        const recentWeekDates = weekDates.slice(-4);
        const olderWeekDates = weekDates.slice(-8, -4);
        
        // Calculate averages for recent and older periods
        let recentUnits = 0, recentProfit = 0, recentFees = 0;
        let olderUnits = 0, olderProfit = 0, olderFees = 0;
        
        recentWeekDates.forEach(w => {
          const d = data.weeks[w];
          recentUnits += d.units || 0;
          recentProfit += d.profit || 0;
          recentFees += d.fees || 0;
        });
        
        olderWeekDates.forEach(w => {
          const d = data.weeks[w];
          olderUnits += d.units || 0;
          olderProfit += d.profit || 0;
          olderFees += d.fees || 0;
        });
        
        const recentPPU = recentUnits > 0 ? recentProfit / recentUnits : 0;
        const olderPPU = olderUnits > 0 ? olderProfit / olderUnits : 0;
        const recentFPU = recentUnits > 0 ? recentFees / recentUnits : 0;
        const olderFPU = olderUnits > 0 ? olderFees / olderUnits : 0;
        
        const ppuChange = recentPPU - olderPPU;
        const ppuChangePercent = olderPPU !== 0 ? (ppuChange / Math.abs(olderPPU)) * 100 : 0;
        const fpuChange = recentFPU - olderFPU;
        
        return {
          sku: data.sku,
          name: savedProductNames[data.sku] || data.name,
          channel: data.channel,
          weeklyData: weekDates.slice(-8).map(w => ({ week: w, ...data.weeks[w] })),
          recentPPU,
          olderPPU,
          ppuChange,
          ppuChangePercent,
          recentFPU,
          olderFPU,
          fpuChange,
          recentUnits,
          olderUnits,
          totalUnits: recentUnits + olderUnits,
        };
      })
      .filter(s => s.totalUnits >= 5) // Only SKUs with meaningful volume
      .sort((a, b) => a.ppuChange - b.ppuChange); // Sort by biggest decline first
    
    // Only include SKUs that have data in BOTH periods (older AND recent) to show accurate trends
    const decliningProfitability = skuProfitTrends.filter(s => s.ppuChange < -0.5 && s.olderUnits > 0 && s.recentUnits > 0).slice(0, 10);
    const improvingProfitability = skuProfitTrends.filter(s => s.ppuChange > 0.5 && s.olderUnits > 0 && s.recentUnits > 0).sort((a, b) => b.ppuChange - a.ppuChange).slice(0, 10);
    
    const allSkus = Object.values(skuAggregates).map(s => ({
      ...s,
      channel: s.channels?.join(' + ') || 'Unknown',
      profitPerUnit: s.units > 0 ? s.profit / s.units : 0,
      margin: s.revenue > 0 ? (s.profit / s.revenue) * 100 : 0,
    }));
    const topByRevenue = [...allSkus].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const topByUnits = [...allSkus].sort((a, b) => b.units - a.units).slice(0, 10);
    const topByProfit = [...allSkus].sort((a, b) => b.profit - a.profit).slice(0, 10);
    const topByProfitPerUnit = [...allSkus].filter(s => s.units >= 5).sort((a, b) => b.profitPerUnit - a.profitPerUnit).slice(0, 10);
    
    // Calculate growth rates - use baseSku directly now
    const skusWithGrowth = allSkus.map(s => {
      const recent = skuRecentData[s.sku]?.revenue || 0;
      const older = skuOlderData[s.sku]?.revenue || 0;
      const growth = older > 0 ? ((recent - older) / older) * 100 : (recent > 0 ? 100 : 0);
      return { ...s, recentRev: recent, olderRev: older, growth };
    }).filter(s => s.recentRev > 0 || s.olderRev > 0);
    
    const risingStars = [...skusWithGrowth].filter(s => s.growth > 0 && s.recentRev > 50).sort((a, b) => b.growth - a.growth).slice(0, 5);
    const declining = [...skusWithGrowth].filter(s => s.growth < -10 && s.olderRev > 50).sort((a, b) => a.growth - b.growth).slice(0, 5);
    
    // Dead stock (in inventory but no recent sales)
    const invData = selectedInvDate ? invHistory[selectedInvDate] : null;
    const deadStock = invData ? invData.items.filter(item => {
      const hasStock = item.totalQty > 0;
      const noRecentSales = !skuRecentData[item.sku] && !skuRecentData['shop_' + item.sku];
      return hasStock && noRecentSales;
    }).slice(0, 10) : [];
    
    return (
      <div className="min-h-screen bg-slate-950 p-4 lg:p-6">
        <div className="max-w-7xl mx-auto">{globalModals}
          <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />
          {dataBar}
          
          <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-white mb-1">🏆 SKU Performance Rankings</h1>
              <p className="text-slate-400 text-sm">Identify your best sellers, most profitable products, and trends — <span className="text-white font-medium">{getPeriodLabel()}</span></p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { key: '4weeks', label: '4 Weeks' },
                { key: 'ytd', label: '2026 YTD' },
                { key: '2025', label: '2025' },
                { key: '2024', label: '2024' },
                { key: 'all', label: 'All Time' },
              ].map(r => (
                <button
                  key={r.key}
                  onClick={() => setSkuDateRange(r.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    skuDateRange === r.key 
                      ? 'bg-amber-600 text-white' 
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 text-center">
              <p className="text-3xl font-bold text-white">{allSkus.length}</p>
              <p className="text-slate-400 text-sm">Products with Sales</p>
              <p className="text-slate-500 text-xs mt-1">
                {sortedWeeks.length > 0 && periodsUsed.length > 0 
                  ? `${sortedWeeks.length} weeks + ${periodsUsed.length} periods`
                  : sortedWeeks.length > 0 
                    ? `${sortedWeeks.length} weeks`
                    : `${periodsUsed.length} periods`
                }
              </p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 text-center">
              <p className="text-3xl font-bold text-emerald-400">{formatCurrency(allSkus.reduce((s, x) => s + x.revenue, 0))}</p>
              <p className="text-slate-400 text-sm">Total Revenue</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 text-center">
              <p className="text-3xl font-bold text-white">{formatNumber(allSkus.reduce((s, x) => s + x.units, 0))}</p>
              <p className="text-slate-400 text-sm">Total Units</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 text-center">
              <p className="text-3xl font-bold text-amber-400">{formatCurrency(allSkus.reduce((s, x) => s + x.profit, 0))}</p>
              <p className="text-slate-400 text-sm">Total Profit</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 text-center">
              <p className="text-3xl font-bold text-violet-400">
                {formatCurrency(allSkus.reduce((s, x) => s + x.units, 0) > 0 
                  ? allSkus.reduce((s, x) => s + x.profit, 0) / allSkus.reduce((s, x) => s + x.units, 0) 
                  : 0)}
              </p>
              <p className="text-slate-400 text-sm">Avg $/Unit Profit</p>
            </div>
          </div>
          
          {/* Profit Per Unit Trends - Compact Design */}
          {(decliningProfitability.length > 0 || improvingProfitability.length > 0) && (
            <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Declining */}
              {decliningProfitability.length > 0 && (
                <div className="bg-rose-900/10 border border-rose-500/20 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-rose-400 mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Declining Profit/Unit ({decliningProfitability.length})
                  </h3>
                  <div className="space-y-2">
                    {decliningProfitability.slice(0, 5).map(s => (
                      <div key={s.sku} className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate" title={s.name || s.sku}>{s.name || s.sku}</p>
                          <p className="text-slate-500 text-xs">{s.totalUnits} units</p>
                        </div>
                        <div className="text-right ml-3">
                          <p className="text-rose-400 font-bold">{formatCurrency(s.ppuChange)}/unit</p>
                          <p className="text-slate-500 text-xs">{formatCurrency(s.olderPPU)} → {formatCurrency(s.recentPPU)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {decliningProfitability.length > 5 && (
                    <p className="text-slate-500 text-xs mt-2 text-center">+{decliningProfitability.length - 5} more</p>
                  )}
                </div>
              )}
              
              {/* Improving */}
              {improvingProfitability.length > 0 && (
                <div className="bg-emerald-900/10 border border-emerald-500/20 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-emerald-400 mb-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Improving Profit/Unit ({improvingProfitability.length})
                  </h3>
                  <div className="space-y-2">
                    {improvingProfitability.slice(0, 5).map(s => (
                      <div key={s.sku} className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate" title={s.name || s.sku}>{s.name || s.sku}</p>
                          <p className="text-slate-500 text-xs">{s.totalUnits} units</p>
                        </div>
                        <div className="text-right ml-3">
                          <p className="text-emerald-400 font-bold">+{formatCurrency(s.ppuChange)}/unit</p>
                          <p className="text-slate-500 text-xs">{formatCurrency(s.olderPPU)} → {formatCurrency(s.recentPPU)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {improvingProfitability.length > 5 && (
                    <p className="text-slate-500 text-xs mt-2 text-center">+{improvingProfitability.length - 5} more</p>
                  )}
                </div>
              )}
            </div>
          )}
          
          {/* Top Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <SkuTable data={topByRevenue} title="Top 10 by Revenue" icon={<DollarSign className="w-5 h-5" />} color="text-emerald-400" showProfitPerUnit savedProductNames={savedProductNames} />
            <SkuTable data={topByUnits} title="Top 10 by Units" icon={<Package className="w-5 h-5" />} color="text-blue-400" showProfitPerUnit savedProductNames={savedProductNames} />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <SkuTable data={topByProfit} title="Top 10 Total Profit" icon={<Award className="w-5 h-5" />} color="text-amber-400" showProfit showProfitPerUnit savedProductNames={savedProductNames} />
            <SkuTable data={topByProfitPerUnit} title="Top 10 Best $/Unit" icon={<Zap className="w-5 h-5" />} color="text-violet-400" showProfitPerUnit savedProductNames={savedProductNames} />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <SkuTable data={risingStars} title="Rising Stars (4wk growth)" icon={<Flame className="w-5 h-5" />} color="text-orange-400" showGrowth showProfitPerUnit savedProductNames={savedProductNames} />
            <SkuTable data={declining} title="Watch List (Declining)" icon={<TrendingDown className="w-5 h-5" />} color="text-rose-400" showGrowth showProfitPerUnit savedProductNames={savedProductNames} />
          </div>
          
          {/* All Products - Searchable & Sortable */}
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6 mb-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-cyan-400" />
                All Products ({allSkus.length})
              </h3>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search SKU or name..."
                    value={skuSearchQuery}
                    onChange={(e) => setSkuSearchQuery(e.target.value)}
                    className="w-64 bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 pl-10 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                  <Eye className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
                <span className="text-xs text-slate-500">Click headers to sort</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left text-slate-400 font-medium py-2 px-2">#</th>
                    <th className="text-left text-slate-400 font-medium py-2 px-2">Product</th>
                    <th className="text-left text-slate-400 font-medium py-2 px-2">Channel</th>
                    <th 
                      className="text-right text-slate-400 font-medium py-2 px-2 cursor-pointer hover:text-white transition-colors select-none"
                      onClick={() => { setSkuSortColumn('revenue'); setSkuSortDirection(d => skuSortColumn === 'revenue' ? (d === 'desc' ? 'asc' : 'desc') : 'desc'); }}
                    >
                      Revenue {skuSortColumn === 'revenue' && <span className="text-cyan-400">{skuSortDirection === 'desc' ? '↓' : '↑'}</span>}
                    </th>
                    <th 
                      className="text-right text-slate-400 font-medium py-2 px-2 cursor-pointer hover:text-white transition-colors select-none"
                      onClick={() => { setSkuSortColumn('units'); setSkuSortDirection(d => skuSortColumn === 'units' ? (d === 'desc' ? 'asc' : 'desc') : 'desc'); }}
                    >
                      Units {skuSortColumn === 'units' && <span className="text-cyan-400">{skuSortDirection === 'desc' ? '↓' : '↑'}</span>}
                    </th>
                    <th 
                      className="text-right text-slate-400 font-medium py-2 px-2 cursor-pointer hover:text-white transition-colors select-none"
                      onClick={() => { setSkuSortColumn('profit'); setSkuSortDirection(d => skuSortColumn === 'profit' ? (d === 'desc' ? 'asc' : 'desc') : 'desc'); }}
                    >
                      Profit {skuSortColumn === 'profit' && <span className="text-cyan-400">{skuSortDirection === 'desc' ? '↓' : '↑'}</span>}
                    </th>
                    <th 
                      className="text-right text-slate-400 font-medium py-2 px-2 cursor-pointer hover:text-white transition-colors select-none"
                      onClick={() => { setSkuSortColumn('margin'); setSkuSortDirection(d => skuSortColumn === 'margin' ? (d === 'desc' ? 'asc' : 'desc') : 'desc'); }}
                    >
                      Margin {skuSortColumn === 'margin' && <span className="text-cyan-400">{skuSortDirection === 'desc' ? '↓' : '↑'}</span>}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...allSkus]
                    .filter(s => !skuSearchQuery || 
                      s.sku.toLowerCase().includes(skuSearchQuery.toLowerCase()) || 
                      (savedProductNames[s.sku] || s.name || '').toLowerCase().includes(skuSearchQuery.toLowerCase())
                    )
                    .sort((a, b) => {
                      const aVal = a[skuSortColumn] ?? 0;
                      const bVal = b[skuSortColumn] ?? 0;
                      return skuSortDirection === 'desc' ? bVal - aVal : aVal - bVal;
                    })
                    .slice(0, 50)
                    .map((s, i) => (
                    <tr key={s.sku + i} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                      <td className="py-2.5 px-2 text-slate-500">{i + 1}</td>
                      <td className="py-2.5 px-2">
                        <div className="max-w-[250px]">
                          <p className="text-white font-medium truncate">{savedProductNames[s.sku] || s.name || s.sku}</p>
                          <p className="text-slate-500 text-xs truncate">{s.sku}</p>
                        </div>
                      </td>
                      <td className="py-2.5 px-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${s.channel === 'Amazon' ? 'bg-orange-500/20 text-orange-400' : s.channel === 'Amazon + Shopify' ? 'bg-purple-500/20 text-purple-400' : 'bg-green-500/20 text-green-400'}`}>
                          {s.channel}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right text-white font-medium">{formatCurrency(s.revenue)}</td>
                      <td className="py-2.5 px-2 text-right text-white">{formatNumber(s.units)}</td>
                      <td className={`py-2.5 px-2 text-right font-medium ${s.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(s.profit)}</td>
                      <td className={`py-2.5 px-2 text-right ${s.margin >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{s.margin.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {allSkus.filter(s => !skuSearchQuery || s.sku.toLowerCase().includes(skuSearchQuery.toLowerCase()) || (savedProductNames[s.sku] || s.name || '').toLowerCase().includes(skuSearchQuery.toLowerCase())).length > 50 && (
                <p className="text-center text-slate-500 text-sm mt-4">Showing first 50 results. Use search to find specific products.</p>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {deadStock.length > 0 && (
              <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                <h3 className="text-lg font-semibold text-slate-400 mb-4 flex items-center gap-2"><Snowflake className="w-5 h-5" />Dead Stock (No Recent Sales)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-700"><th className="text-left text-slate-400 py-2">SKU</th><th className="text-right text-slate-400 py-2">Qty</th><th className="text-right text-slate-400 py-2">Value</th></tr></thead>
                    <tbody>
                      {deadStock.map(s => (
                        <tr key={s.sku} className="border-b border-slate-700/50"><td className="py-2 text-white">{s.sku}</td><td className="py-2 text-right text-white">{formatNumber(s.totalQty)}</td><td className="py-2 text-right text-slate-400">{formatCurrency(s.totalValue)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );

};

export default SkuRankingsView;
