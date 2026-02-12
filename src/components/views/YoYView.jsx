import React from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { formatCurrency, formatNumber, formatPercent } from '../../utils/format';
import NavTabs from '../ui/NavTabs';

const YoYBadge = ({ change }) => {
  if (change === null) return <span className="text-slate-500">—</span>;

  const isPositive = change > 0;
  const color = isPositive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400';
  const Icon = isPositive ? ArrowUpRight : ArrowDownRight;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm ${color}`}>
      <Icon className="w-3 h-3" />
      {Math.abs(change).toFixed(1)}%
    </span>
  );
};

const YoYView = ({
  allDaysData,
  allPeriodsData,
  allWeeksData,
  appSettings,
  bankingData,
  dataBar,
  getProfit,
  globalModals,
  hasDailySalesData,
  invHistory,
  navDropdown,
  setNavDropdown,
  setSelectedDay,
  setSelectedInvDate,
  setSelectedPeriod,
  setSelectedWeek,
  setUploadTab,
  setView,
  view,
}) => {
    const sortedWeeks = Object.keys(allWeeksData).sort();
    const weekYears = [...new Set(sortedWeeks.map(w => w.substring(0, 4)))].sort();
    
    // Check for annual periods (labeled as "2024", "2025", etc.)
    const periodYears = Object.keys(allPeriodsData).filter(k => /^\d{4}$/.test(k)).sort();
    
    // Also extract years from monthly periods like "January 2025", "Feb 2024", "Dec '25", etc.
    const monthlyPeriodYears = [];
    Object.keys(allPeriodsData).forEach(k => {
      // Try 4-digit year first
      let match = k.match(/\b(20\d{2})\b/);
      if (match) {
        monthlyPeriodYears.push(match[1]);
      } else {
        // Try 2-digit year (e.g., '25 or -25)
        match = k.match(/['-](\d{2})$/);
        if (match) {
          const shortYear = match[1];
          const fullYear = shortYear >= '50' ? '19' + shortYear : '20' + shortYear;
          monthlyPeriodYears.push(fullYear);
        }
      }
    });
    
    const allYears = [...new Set([...weekYears, ...periodYears, ...monthlyPeriodYears])].sort();
    
    const currentYear = allYears[allYears.length - 1];
    const previousYear = allYears.length > 1 ? allYears[allYears.length - 2] : null;
    
    // Get year data - prioritize period data if available, otherwise use weekly
    const getYearData = (year) => {
      // Check if we have a period for this year (e.g., "2025" annual period)
      if (allPeriodsData[year]) {
        const p = allPeriodsData[year];
        return {
          source: 'period',
          label: p.label,
          weeks: 0,
          revenue: p.total?.revenue || 0,
          profit: getProfit(p.total),
          units: p.total?.units || 0,
          amazonRev: p.amazon?.revenue || 0,
          shopifyRev: p.shopify?.revenue || 0,
          adSpend: p.total?.adSpend || 0,
          cogs: p.total?.cogs || 0,
        };
      }
      // Prefer daily data (exact calendar boundaries) over weekly data
      const yearDays = Object.keys(allDaysData).filter(d => d.startsWith(year)).sort();
      if (yearDays.length > 0) {
        const agg = { revenue: 0, profit: 0, units: 0, amazonRev: 0, shopifyRev: 0, adSpend: 0, cogs: 0 };
        yearDays.forEach(d => {
          const dd = allDaysData[d];
          agg.revenue += dd.total?.revenue || 0;
          agg.profit += getProfit(dd.total);
          agg.units += dd.total?.units || (dd.amazon?.units || 0) + (dd.shopify?.units || 0);
          agg.amazonRev += dd.amazon?.sales || dd.amazon?.revenue || 0;
          agg.shopifyRev += dd.shopify?.revenue || 0;
          agg.adSpend += dd.total?.adSpend || (dd.adKPIs?.amazon?.spend || 0) + (dd.adKPIs?.google?.spend || 0) + (dd.adKPIs?.meta?.spend || 0);
          agg.cogs += dd.total?.cogs || 0;
        });
        return {
          source: 'daily',
          label: `${year} (${yearDays.length} days)`,
          weeks: 0,
          ...agg,
        };
      }
      // Fall back to weekly data
      const yearWeeks = sortedWeeks.filter(w => w.startsWith(year));
      return {
        source: 'weekly',
        label: `${year} (${yearWeeks.length} weeks)`,
        weeks: yearWeeks.length,
        revenue: yearWeeks.reduce((sum, w) => sum + (allWeeksData[w].total?.revenue || 0), 0),
        profit: yearWeeks.reduce((sum, w) => sum + (getProfit(allWeeksData[w].total)), 0),
        units: yearWeeks.reduce((sum, w) => sum + (allWeeksData[w].total?.units || 0), 0),
        amazonRev: yearWeeks.reduce((sum, w) => sum + (allWeeksData[w].amazon?.revenue || 0), 0),
        shopifyRev: yearWeeks.reduce((sum, w) => sum + (allWeeksData[w].shopify?.revenue || 0), 0),
        adSpend: yearWeeks.reduce((sum, w) => sum + (allWeeksData[w].total?.adSpend || 0), 0),
        cogs: yearWeeks.reduce((sum, w) => sum + (allWeeksData[w].total?.cogs || 0), 0),
      };
    };
    
    const currentYearData = currentYear ? getYearData(currentYear) : null;
    const previousYearData = previousYear ? getYearData(previousYear) : null;
    
    // Month-over-month YoY comparison - use EXACT same logic as Trends getMonthlyTrends
    // First build ALL monthly data same as Trends, then filter by year
    const buildAllMonthlyData = () => {
      const monthData = {};
      
      // Step 1: Gather period data
      const monthlyPeriods = Object.keys(allPeriodsData).filter(p => {
        return /^(january|february|march|april|may|june|july|august|september|october|november|december)-?\d{4}$/i.test(p) ||
               /^\d{4}-\d{2}$/.test(p) ||
               /^[a-z]+-\d{4}$/i.test(p);
      });
      
      const periodByMonth = {};
      monthlyPeriods.forEach(p => {
        const data = allPeriodsData[p];
        let monthKey = p;
        const monthNamesList = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
        monthNamesList.forEach((name, idx) => {
          if (p.toLowerCase().includes(name)) {
            const yearMatch = p.match(/\d{4}/);
            if (yearMatch) monthKey = `${yearMatch[0]}-${String(idx + 1).padStart(2, '0')}`;
          }
        });
        periodByMonth[monthKey] = { key: p, revenue: data.total?.revenue || 0, profit: getProfit(data.total), units: data.total?.units || 0 };
      });
      
      // Step 2: Gather daily data (exact calendar boundaries)
      const dailyByMonth = {};
      const sortedDays = Object.keys(allDaysData).sort();
      sortedDays.forEach(day => {
        const monthKey = day.substring(0, 7);
        if (!dailyByMonth[monthKey]) dailyByMonth[monthKey] = { revenue: 0, profit: 0, units: 0 };
        const dd = allDaysData[day];
        dailyByMonth[monthKey].revenue += dd.total?.revenue || 0;
        dailyByMonth[monthKey].profit += getProfit(dd.total);
        dailyByMonth[monthKey].units += dd.total?.units || (dd.amazon?.units || 0) + (dd.shopify?.units || 0);
      });
      
      // Step 3: For each month, use whichever source has higher revenue
      const allMonthKeys = [...new Set([...Object.keys(periodByMonth), ...Object.keys(dailyByMonth)])];
      allMonthKeys.forEach(mk => {
        const period = periodByMonth[mk];
        const daily = dailyByMonth[mk];
        
        if (period && daily) {
          // Both exist — use whichever has higher revenue (more complete data)
          if (daily.revenue >= period.revenue) {
            monthData[mk] = { key: mk, source: 'daily', ...daily };
          } else {
            monthData[mk] = { key: period.key, source: 'period', ...period };
          }
        } else if (period) {
          monthData[mk] = { key: period.key, source: 'period', ...period };
        } else if (daily) {
          monthData[mk] = { key: mk, source: 'daily', ...daily };
        }
      });
      
      // Step 4: Fall back to weekly data for months with no period or daily data
      sortedWeeks.forEach(w => {
        const monthKey = w.substring(0, 7);
        if (!monthData[monthKey]) {
          monthData[monthKey] = {
            key: monthKey,
            source: 'weekly',
            revenue: 0, profit: 0, units: 0,
          };
        }
        if (monthData[monthKey].source === 'weekly') {
          const week = allWeeksData[w];
          monthData[monthKey].revenue += week.total?.revenue || 0;
          monthData[monthKey].profit += getProfit(week.total);
          monthData[monthKey].units += week.total?.units || 0;
        }
      });
      
      return monthData;
    };
    
    const allMonthlyData = buildAllMonthlyData();
    
    // Now filter by year and convert to month-only keys ("01", "02", etc.)
    const getMonthlyByYear = (year) => {
      const months = {};
      Object.entries(allMonthlyData).forEach(([key, data]) => {
        if (key.startsWith(year)) {
          const month = key.substring(5, 7); // Extract "01" from "2025-01"
          months[month] = data;
        }
      });
      return months;
    };
    
    const currentMonths = currentYear ? getMonthlyByYear(currentYear) : {};
    const previousMonths = previousYear ? getMonthlyByYear(previousYear) : {};
    const allMonths = ['01','02','03','04','05','06','07','08','09','10','11','12'];
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    
    // Compute year totals from monthly data (ensures Total row matches month sum)
    const sumMonths = (months) => Object.values(months).reduce((acc, m) => ({
      revenue: acc.revenue + (m.revenue || 0), profit: acc.profit + (m.profit || 0), units: acc.units + (m.units || 0),
    }), { revenue: 0, profit: 0, units: 0 });
    const currentMonthlyTotal = sumMonths(currentMonths);
    const previousMonthlyTotal = sumMonths(previousMonths);
    
    const hasMonthlyData = Object.keys(currentMonths).length > 0 || Object.keys(previousMonths).length > 0;
    
    const calcYoYChange = (current, previous) => {
      if (!previous || previous === 0) return null;
      return ((current - previous) / previous) * 100;
    };
    
    // Find max for chart
    const maxMonthlyRev = Math.max(
      ...allMonths.map(m => Math.max(currentMonths[m]?.revenue || 0, previousMonths[m]?.revenue || 0))
    );
    
    return (
      <div className="min-h-screen bg-slate-950 p-4 lg:p-6">
        <div className="max-w-7xl mx-auto">{globalModals}
          <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />
          {dataBar}
          
          <div className="mb-6">
            <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">📅 Year-over-Year Comparison</h1>
            <p className="text-slate-400">{previousYear && currentYear ? `Comparing ${currentYear} vs ${previousYear}` : (currentYear ? `${currentYear} data (add previous year data to compare)` : 'No data available - upload periods labeled as years (e.g., "2024", "2025")')}</p>
            {hasMonthlyData && (
              <p className="text-slate-500 text-xs mt-2">
                {Object.keys(currentMonths).length > 0 && `${currentYear}: ${Object.keys(currentMonths).map((m) => monthNames[Number(m) - 1]).join(', ')}`}
                {Object.keys(currentMonths).length > 0 && Object.keys(previousMonths).length > 0 && ' • '}
                {Object.keys(previousMonths).length > 0 && `${previousYear}: ${Object.keys(previousMonths).map((m) => monthNames[Number(m) - 1]).join(', ')}`}
              </p>
            )}
          </div>
          
          {!currentYearData && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-8 text-center">
              <p className="text-slate-400 mb-4">No year data found.</p>
              <p className="text-slate-500 text-sm">To see YoY comparisons:</p>
              <ul className="text-slate-500 text-sm mt-2 space-y-1">
                <li>• Upload weekly data with dates, OR</li>
                <li>• Create Periods labeled exactly as years (e.g., "2024", "2025")</li>
              </ul>
            </div>
          )}
          
          {currentYearData && (
          <>
          {/* Year Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Current Year */}
            <div className="bg-gradient-to-br from-violet-900/30 to-slate-800/50 rounded-xl border border-violet-500/30 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-violet-400">{currentYear}</h3>
                <span className="text-xs px-2 py-1 bg-violet-500/20 text-violet-300 rounded">{currentYearData.source === 'period' ? 'Period Data' : 'Weekly Data'}</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-slate-400 text-sm">Revenue</p>
                  <p className="text-2xl font-bold text-white">{formatCurrency(currentYearData.revenue)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">Net Profit</p>
                  <p className={`text-2xl font-bold ${currentYearData.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(currentYearData.profit)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">Units Sold</p>
                  <p className="text-xl font-bold text-white">{formatNumber(currentYearData.units)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">Margin</p>
                  <p className={`text-xl font-bold ${currentYearData.revenue > 0 && (currentYearData.profit/currentYearData.revenue) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {formatPercent(currentYearData.revenue > 0 ? (currentYearData.profit/currentYearData.revenue)*100 : 0)}
                  </p>
                </div>
              </div>
              <p className="text-slate-500 text-sm mt-3">{currentYearData.source === 'period' ? currentYearData.label : `${currentYearData.weeks} weeks of data`}</p>
            </div>
            
            {/* Previous Year */}
            {previousYearData ? (
              <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-400">{previousYear}</h3>
                  <span className="text-xs px-2 py-1 bg-slate-600 text-slate-300 rounded">{previousYearData.source === 'period' ? 'Period Data' : 'Weekly Data'}</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-slate-400 text-sm">Revenue</p>
                    <p className="text-2xl font-bold text-white">{formatCurrency(previousYearData.revenue)}</p>
                    <YoYBadge change={calcYoYChange(currentYearData.revenue, previousYearData.revenue)} />
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Net Profit</p>
                    <p className={`text-2xl font-bold ${previousYearData.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(previousYearData.profit)}</p>
                    <YoYBadge change={calcYoYChange(currentYearData.profit, previousYearData.profit)} />
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Units Sold</p>
                    <p className="text-xl font-bold text-white">{formatNumber(previousYearData.units)}</p>
                    <YoYBadge change={calcYoYChange(currentYearData.units, previousYearData.units)} />
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Margin</p>
                    <p className={`text-xl font-bold ${previousYearData.revenue > 0 && (previousYearData.profit/previousYearData.revenue) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatPercent(previousYearData.revenue > 0 ? (previousYearData.profit/previousYearData.revenue)*100 : 0)}
                    </p>
                  </div>
                </div>
                <p className="text-slate-500 text-sm mt-3">{previousYearData.source === 'period' ? previousYearData.label : `${previousYearData.weeks} weeks of data`}</p>
              </div>
            ) : (
              <div className="bg-slate-800/30 rounded-xl border border-dashed border-slate-600 p-5 flex items-center justify-center">
                <p className="text-slate-500 text-center">Upload {parseInt(currentYear) - 1} data to enable YoY comparison</p>
              </div>
            )}
          </div>
          
          {/* Monthly YoY Chart - shows even with just current year data */}
          {hasMonthlyData && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">Monthly Revenue: {currentYear}{previousYear ? ` vs ${previousYear}` : ''}</h3>
              <div className="flex items-end gap-2" style={{ height: '250px' }}>
                {allMonths.map((m, i) => {
                  const currRev = currentMonths[m]?.revenue || 0;
                  const prevRev = previousMonths[m]?.revenue || 0;
                  // Calculate pixel heights (max 200px)
                  const maxBarHeight = 200;
                  const currHeight = maxMonthlyRev > 0 ? Math.round((currRev / maxMonthlyRev) * maxBarHeight) : 0;
                  const prevHeight = maxMonthlyRev > 0 ? Math.round((prevRev / maxMonthlyRev) * maxBarHeight) : 0;
                  return (
                    <div key={m} className="flex-1 flex flex-col items-center justify-end">
                      <div className="flex gap-0.5 items-end w-full justify-center" style={{ height: `${maxBarHeight}px` }}>
                        {previousYear && (
                          <div className="flex-1 flex items-end justify-center group relative">
                            <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 hidden group-hover:block bg-slate-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-50 pointer-events-none shadow-lg">
                              {previousYear}: {formatCurrency(prevRev)}
                            </div>
                            <div 
                              title={`${previousYear}: ${formatCurrency(prevRev)}`}
                              className="w-full max-w-[30px] bg-slate-600 rounded-t transition-all hover:bg-slate-500" 
                              style={{ height: `${Math.max(prevHeight, prevRev > 0 ? 4 : 0)}px` }} 
                            />
                          </div>
                        )}
                        <div className={`${previousYear ? 'flex-1' : 'w-full'} flex items-end justify-center group relative`}>
                          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 hidden group-hover:block bg-slate-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-50 pointer-events-none shadow-lg">
                            {currentYear}: {formatCurrency(currRev)}
                          </div>
                          <div 
                            title={`${currentYear}: ${formatCurrency(currRev)}`}
                            className="w-full max-w-[30px] bg-violet-500 rounded-t transition-all hover:bg-violet-400" 
                            style={{ height: `${Math.max(currHeight, currRev > 0 ? 4 : 0)}px` }} 
                          />
                        </div>
                      </div>
                      <span className="text-xs text-slate-400 mt-2">{monthNames[i]}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-3 text-sm justify-center">
                {previousYear && <span className="flex items-center gap-2"><span className="w-3 h-3 bg-slate-600 rounded" />{previousYear}</span>}
                <span className="flex items-center gap-2"><span className="w-3 h-3 bg-violet-500 rounded" />{currentYear}</span>
              </div>
            </div>
          )}
          
          {/* Monthly Comparison Table - uses weekly data + monthly periods */}
          {hasMonthlyData && (
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
            <h3 className="text-lg font-semibold text-white mb-4">Month-by-Month Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left text-slate-400 font-medium py-2">Month</th>
                    <th className="text-right text-slate-400 font-medium py-2">{currentYear} Revenue</th>
                    {previousYear && <th className="text-right text-slate-400 font-medium py-2">{previousYear} Revenue</th>}
                    {previousYear && <th className="text-right text-slate-400 font-medium py-2">YoY Change</th>}
                    <th className="text-right text-slate-400 font-medium py-2">{currentYear} Profit</th>
                    {previousYear && <th className="text-right text-slate-400 font-medium py-2">{previousYear} Profit</th>}
                  </tr>
                </thead>
                <tbody>
                  {allMonths.map((m, i) => {
                    const curr = currentMonths[m] || { revenue: 0, profit: 0 };
                    const prev = previousMonths[m] || { revenue: 0, profit: 0 };
                    const hasData = curr.revenue > 0 || prev.revenue > 0;
                    if (!hasData) return null;
                    const change = calcYoYChange(curr.revenue, prev.revenue);
                    return (
                      <tr key={m} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="py-2 text-white">{monthNames[i]}</td>
                        <td className="py-2 text-right text-white">{formatCurrency(curr.revenue)}</td>
                        {previousYear && <td className="py-2 text-right text-slate-400">{formatCurrency(prev.revenue)}</td>}
                        {previousYear && <td className="py-2 text-right"><YoYBadge change={change} /></td>}
                        <td className={`py-2 text-right ${curr.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(curr.profit)}</td>
                        {previousYear && <td className={`py-2 text-right ${prev.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(prev.profit)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-slate-600">
                  <tr className="font-semibold">
                    <td className="py-2 text-white">Total</td>
                    <td className="py-2 text-right text-white">{formatCurrency(currentMonthlyTotal.revenue)}</td>
                    {previousYear && <td className="py-2 text-right text-slate-400">{formatCurrency(previousMonthlyTotal.revenue)}</td>}
                    {previousYear && <td className="py-2 text-right"><YoYBadge change={calcYoYChange(currentMonthlyTotal.revenue, previousMonthlyTotal.revenue)} /></td>}
                    <td className={`py-2 text-right ${currentMonthlyTotal.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(currentMonthlyTotal.profit)}</td>
                    {previousYear && <td className={`py-2 text-right ${previousMonthlyTotal.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(previousMonthlyTotal.profit)}</td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          )}
          
          {!hasMonthlyData && (
            <div className="bg-slate-800/30 rounded-xl border border-dashed border-slate-600 p-6 text-center">
              <p className="text-slate-500">Monthly breakdown requires weekly data or monthly period uploads.</p>
              <p className="text-slate-600 text-sm mt-1">Upload periods like "January 2025" or "Jan 2025" to see monthly breakdowns.</p>
            </div>
          )}
          </>
          )}
        </div>
      </div>
    );

};

export default YoYView;
