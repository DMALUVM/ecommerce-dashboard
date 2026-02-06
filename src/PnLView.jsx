// ============================================================
// PnLView.jsx — Unified Profit & Loss Statement
// The CEO's #1 screen: Revenue waterfall → COGS → Ads → 3PL → Net
// ============================================================
import React, { useState, useMemo } from 'react';
import { DollarSign, TrendingUp, TrendingDown, ChevronDown, ChevronUp, Download, Calendar, ArrowRight, Minus } from 'lucide-react';

// ============ WATERFALL BAR COMPONENT ============
const WaterfallBar = ({ label, value, total, color, isTotal, isSubtraction, prevRunning, theme }) => {
  const pct = total > 0 ? Math.abs(value) / total * 100 : 0;
  const maxBarWidth = 65; // % of row width
  const barWidth = Math.min(pct / 100 * maxBarWidth * 2, maxBarWidth); // Scale so revenue = ~65%
  
  const light = theme?.mode === 'light';
  const colors = {
    green: light ? 'bg-emerald-500' : 'bg-emerald-500',
    red: light ? 'bg-rose-500' : 'bg-rose-500',
    blue: light ? 'bg-blue-500' : 'bg-blue-500',
    violet: light ? 'bg-violet-500' : 'bg-violet-500',
    amber: light ? 'bg-amber-500' : 'bg-amber-500',
    cyan: light ? 'bg-cyan-500' : 'bg-cyan-500',
    slate: light ? 'bg-slate-400' : 'bg-slate-500',
  };
  const bgColor = colors[color] || colors.slate;

  return (
    <div className={`flex items-center gap-3 py-2 px-3 rounded-lg ${isTotal ? (light ? 'bg-slate-100 border border-slate-200' : 'bg-slate-700/50 border border-slate-600/50') : ''}`}>
      <div className={`w-40 text-sm font-medium ${isTotal ? (light ? 'text-slate-900 font-bold' : 'text-white font-bold') : (light ? 'text-slate-700' : 'text-slate-300')}`}>
        {isSubtraction && !isTotal && <Minus className="w-3 h-3 inline mr-1 text-rose-400" />}
        {label}
      </div>
      <div className="flex-1 flex items-center gap-2">
        <div className={`h-7 rounded ${bgColor} transition-all duration-500`} style={{ width: `${barWidth}%`, minWidth: value !== 0 ? '4px' : '0' }} />
        <span className={`text-sm font-mono ${isSubtraction && !isTotal ? 'text-rose-400' : (light ? 'text-slate-700' : 'text-slate-300')}`}>
          {isSubtraction && !isTotal ? '-' : ''}${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </span>
      </div>
      <div className="w-16 text-right">
        <span className={`text-xs font-mono ${light ? 'text-slate-500' : 'text-slate-500'}`}>
          {total > 0 ? `${(Math.abs(value) / total * 100).toFixed(1)}%` : '—'}
        </span>
      </div>
    </div>
  );
};

// ============ METRIC CARD ============
const MetricCard = ({ label, value, suffix, trend, trendValue, icon: Icon, color, theme }) => {
  const light = theme?.mode === 'light';
  const colorClasses = {
    green: 'text-emerald-400 border-emerald-500/30',
    red: 'text-rose-400 border-rose-500/30',
    blue: 'text-blue-400 border-blue-500/30',
    violet: 'text-violet-400 border-violet-500/30',
    amber: 'text-amber-400 border-amber-500/30',
  };
  return (
    <div className={`${light ? 'bg-white border-slate-200' : 'bg-slate-800/60 border-slate-700/50'} border rounded-xl p-4`}>
      <div className={`flex items-center gap-2 mb-1 text-xs ${light ? 'text-slate-500' : 'text-slate-400'}`}>
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
      </div>
      <div className={`text-xl font-bold ${light ? 'text-slate-900' : 'text-white'}`}>
        {typeof value === 'number' ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : value}
        {suffix && <span className={`text-sm font-normal ml-1 ${light ? 'text-slate-500' : 'text-slate-400'}`}>{suffix}</span>}
      </div>
      {trend !== undefined && (
        <div className={`flex items-center gap-1 mt-1 text-xs ${trend >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {trend >= 0 ? '+' : ''}{trendValue || `${trend.toFixed(1)}%`}
        </div>
      )}
    </div>
  );
};

// ============ MAIN P&L VIEW ============
const PnLView = ({ allWeeksData, allDaysData, savedCogs, threeplLedger, get3PLForWeek, adsIntelData, dtcIntelData, appSettings, theme, formatCurrency, confirmedRecurring }) => {
  const [timeRange, setTimeRange] = useState('month'); // 'week' | 'month' | 'quarter' | 'ytd' | 'all'
  const [showChannelBreakdown, setShowChannelBreakdown] = useState(false);
  const [showAdBreakdown, setShowAdBreakdown] = useState(false);
  const [showWeeklyTable, setShowWeeklyTable] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  
  const light = theme?.mode === 'light';
  const fc = (v) => formatCurrency ? formatCurrency(v) : `$${(v || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const fPct = (v) => `${(v || 0).toFixed(1)}%`;
  
  // ============ COMPUTE P&L DATA ============
  const pnlData = useMemo(() => {
    const weeks = Object.keys(allWeeksData).sort();
    if (!weeks.length) return null;
    
    const now = new Date();
    const currentYear = now.getFullYear();
    
    // Filter weeks by time range
    const filterWeek = (weekKey) => {
      const d = new Date(weekKey + 'T00:00:00');
      const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
      switch (timeRange) {
        case 'week': return diffDays <= 7;
        case 'month': return diffDays <= 30;
        case 'quarter': return diffDays <= 90;
        case 'ytd': return d.getFullYear() === currentYear;
        case 'all': default: return true;
      }
    };
    
    const filteredWeeks = weeks.filter(filterWeek);
    const prevFilterWeek = (weekKey) => {
      const d = new Date(weekKey + 'T00:00:00');
      const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
      switch (timeRange) {
        case 'week': return diffDays > 7 && diffDays <= 14;
        case 'month': return diffDays > 30 && diffDays <= 60;
        case 'quarter': return diffDays > 90 && diffDays <= 180;
        case 'ytd': return d.getFullYear() === currentYear - 1;
        default: return false;
      }
    };
    const prevWeeks = weeks.filter(prevFilterWeek);
    
    const aggregate = (weekKeys) => {
      const result = {
        revenue: 0, amazonRevenue: 0, shopifyRevenue: 0,
        cogs: 0, adSpend: 0, amazonAdSpend: 0, metaAdSpend: 0, googleAdSpend: 0,
        threeplCost: 0, storageCost: 0,
        orders: 0, units: 0,
        netProfit: 0,
        weekCount: weekKeys.length,
        weeklyData: [],
      };
      
      weekKeys.forEach(wk => {
        const w = allWeeksData[wk];
        if (!w) return;
        const t = w.total || {};
        const az = w.amazon || {};
        const sh = w.shopify || {};
        
        const rev = t.revenue || 0;
        const azRev = az.revenue || 0;
        const shRev = sh.revenue || 0;
        const cogs = t.cogs || 0;
        const adSpend = t.adSpend || 0;
        const azAds = az.adSpend || 0;
        const metaAds = sh.metaSpend || 0;
        const googleAds = sh.googleSpend || 0;
        const threepl = sh.threeplBreakdown ? Object.values(sh.threeplBreakdown).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0) : 0;
        const storage = t.storageCost || 0;
        const profit = t.netProfit || 0;
        
        result.revenue += rev;
        result.amazonRevenue += azRev;
        result.shopifyRevenue += shRev;
        result.cogs += cogs;
        result.adSpend += adSpend;
        result.amazonAdSpend += azAds;
        result.metaAdSpend += metaAds;
        result.googleAdSpend += googleAds;
        result.threeplCost += threepl;
        result.storageCost += storage;
        result.orders += (t.orders || az.orders || 0) + (sh.orders || 0);
        result.units += t.units || 0;
        result.netProfit += profit;
        
        result.weeklyData.push({
          week: wk, revenue: rev, cogs, adSpend, threeplCost: threepl + storage,
          profit, margin: rev > 0 ? (profit / rev) * 100 : 0,
          amazonRevenue: azRev, shopifyRevenue: shRev,
        });
      });
      
      result.grossProfit = result.revenue - result.cogs;
      result.grossMargin = result.revenue > 0 ? (result.grossProfit / result.revenue) * 100 : 0;
      result.netMargin = result.revenue > 0 ? (result.netProfit / result.revenue) * 100 : 0;
      result.roas = result.adSpend > 0 ? result.revenue / result.adSpend : 0;
      result.tacos = result.revenue > 0 ? (result.adSpend / result.revenue) * 100 : 0;
      result.aov = result.orders > 0 ? result.revenue / result.orders : 0;
      result.fulfillmentCost = result.threeplCost + result.storageCost;
      
      // Estimated fixed costs from recurring expenses
      result.fixedCosts = 0;
      if (confirmedRecurring && confirmedRecurring.length) {
        const monthlyFixed = confirmedRecurring.reduce((s, r) => s + Math.abs(r.amount || 0), 0);
        const rangeMultiplier = timeRange === 'week' ? 0.25 : timeRange === 'month' ? 1 : timeRange === 'quarter' ? 3 : timeRange === 'ytd' ? (now.getMonth() + 1) : 12;
        result.fixedCosts = monthlyFixed * rangeMultiplier;
      }
      
      result.operatingProfit = result.netProfit - result.fixedCosts;
      result.operatingMargin = result.revenue > 0 ? (result.operatingProfit / result.revenue) * 100 : 0;
      
      return result;
    };
    
    const current = aggregate(filteredWeeks);
    const previous = prevWeeks.length > 0 ? aggregate(prevWeeks) : null;
    
    // Calculate trends
    if (previous && previous.revenue > 0) {
      current.revenueTrend = ((current.revenue - previous.revenue) / previous.revenue) * 100;
      current.profitTrend = previous.netProfit !== 0 ? ((current.netProfit - previous.netProfit) / Math.abs(previous.netProfit)) * 100 : 0;
      current.marginTrend = current.netMargin - previous.netMargin;
      current.roasTrend = current.roas - previous.roas;
    }
    
    return { current, previous };
  }, [allWeeksData, timeRange, confirmedRecurring]);

  if (!pnlData?.current || pnlData.current.weekCount === 0) {
    return (
      <div className={`text-center py-20 ${light ? 'text-slate-500' : 'text-slate-400'}`}>
        <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <h3 className="text-lg font-semibold mb-2">No P&L Data Yet</h3>
        <p className="text-sm">Upload weekly data to see your Profit & Loss statement.</p>
      </div>
    );
  }

  const d = pnlData.current;
  const p = pnlData.previous;
  const rangeLabel = { week: 'This Week', month: 'Last 30 Days', quarter: 'Last 90 Days', ytd: 'Year to Date', all: 'All Time' }[timeRange];
  
  // Health grade
  const getHealthGrade = () => {
    const margin = d.netMargin;
    const roas = d.roas;
    if (margin >= 25 && roas >= 3) return { grade: 'A', color: 'text-emerald-400', bg: light ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-900/20 border-emerald-500/30', label: 'Excellent' };
    if (margin >= 15 && roas >= 2) return { grade: 'B', color: 'text-blue-400', bg: light ? 'bg-blue-50 border-blue-200' : 'bg-blue-900/20 border-blue-500/30', label: 'Good' };
    if (margin >= 5 && roas >= 1.5) return { grade: 'C', color: 'text-amber-400', bg: light ? 'bg-amber-50 border-amber-200' : 'bg-amber-900/20 border-amber-500/30', label: 'Needs Attention' };
    if (margin >= 0) return { grade: 'D', color: 'text-orange-400', bg: light ? 'bg-orange-50 border-orange-200' : 'bg-orange-900/20 border-orange-500/30', label: 'At Risk' };
    return { grade: 'F', color: 'text-rose-400', bg: light ? 'bg-rose-50 border-rose-200' : 'bg-rose-900/20 border-rose-500/30', label: 'Losing Money' };
  };
  const health = getHealthGrade();

  // Export P&L as CSV
  const exportCSV = () => {
    const rows = [
      ['P&L Statement', rangeLabel, `${d.weekCount} weeks`],
      [],
      ['Revenue', '', fc(d.revenue)],
      ['  Amazon Revenue', '', fc(d.amazonRevenue)],
      ['  Shopify/DTC Revenue', '', fc(d.shopifyRevenue)],
      [],
      ['Cost of Goods Sold (COGS)', '', `(${fc(d.cogs)})`],
      ['Gross Profit', '', fc(d.grossProfit)],
      ['Gross Margin', '', fPct(d.grossMargin)],
      [],
      ['Advertising', '', `(${fc(d.adSpend)})`],
      ['  Amazon PPC', '', `(${fc(d.amazonAdSpend)})`],
      ['  Meta Ads', '', `(${fc(d.metaAdSpend)})`],
      ['  Google Ads', '', `(${fc(d.googleAdSpend)})`],
      [],
      ['Fulfillment (3PL + Storage)', '', `(${fc(d.fulfillmentCost)})`],
      [],
      ['Contribution Margin', '', fc(d.netProfit)],
      ['Contribution Margin %', '', fPct(d.netMargin)],
      [],
      ['Fixed Costs (est.)', '', `(${fc(d.fixedCosts)})`],
      ['Operating Profit', '', fc(d.operatingProfit)],
      ['Operating Margin', '', fPct(d.operatingMargin)],
      [],
      ['Key Metrics'],
      ['ROAS', '', `${d.roas.toFixed(2)}x`],
      ['TACOS', '', fPct(d.tacos)],
      ['AOV', '', fc(d.aov)],
      ['Total Orders', '', d.orders.toLocaleString()],
    ];
    
    if (d.weeklyData.length > 0) {
      rows.push([], ['Weekly Breakdown']);
      rows.push(['Week', 'Revenue', 'COGS', 'Ad Spend', '3PL', 'Net Profit', 'Margin %']);
      d.weeklyData.forEach(w => {
        rows.push([w.week, fc(w.revenue), fc(w.cogs), fc(w.adSpend), fc(w.threeplCost), fc(w.profit), fPct(w.margin)]);
      });
    }
    
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `pnl_${timeRange}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className={`text-2xl font-bold ${light ? 'text-slate-900' : 'text-white'}`}>💰 Profit & Loss</h2>
          <p className={`text-sm ${light ? 'text-slate-500' : 'text-slate-400'}`}>{rangeLabel} · {d.weekCount} week{d.weekCount !== 1 ? 's' : ''} of data</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Time Range Selector */}
          <div className={`flex rounded-lg overflow-hidden border ${light ? 'border-slate-200' : 'border-slate-700'}`}>
            {['week', 'month', 'quarter', 'ytd', 'all'].map(r => (
              <button key={r} onClick={() => setTimeRange(r)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  timeRange === r 
                    ? (light ? 'bg-violet-100 text-violet-700' : 'bg-violet-600 text-white')
                    : (light ? 'bg-white text-slate-600 hover:bg-slate-50' : 'bg-slate-800 text-slate-400 hover:bg-slate-700')
                }`}>
                {r === 'ytd' ? 'YTD' : r.charAt(0).toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>
          <button onClick={exportCSV} className={`p-2 rounded-lg ${light ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-slate-700 text-slate-400'}`} title="Export CSV">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Health Grade + Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className={`${health.bg} border rounded-xl p-4 flex items-center gap-3`}>
          <div className={`text-3xl font-black ${health.color}`}>{health.grade}</div>
          <div>
            <div className={`text-xs ${light ? 'text-slate-500' : 'text-slate-400'}`}>Health Grade</div>
            <div className={`text-sm font-semibold ${health.color}`}>{health.label}</div>
          </div>
        </div>
        <MetricCard label="Revenue" value={d.revenue} trend={d.revenueTrend} icon={DollarSign} theme={theme} />
        <MetricCard label="Net Profit" value={d.netProfit} trend={d.profitTrend} icon={TrendingUp} theme={theme} />
        <MetricCard label="Net Margin" value={fPct(d.netMargin)} suffix="" trend={d.marginTrend} trendValue={d.marginTrend !== undefined ? `${d.marginTrend > 0 ? '+' : ''}${d.marginTrend.toFixed(1)}pp` : undefined} icon={TrendingUp} theme={theme} />
        <MetricCard label="Blended ROAS" value={`${d.roas.toFixed(2)}x`} suffix="" trend={d.roasTrend} trendValue={d.roasTrend !== undefined ? `${d.roasTrend > 0 ? '+' : ''}${d.roasTrend.toFixed(2)}x` : undefined} icon={TrendingUp} theme={theme} />
      </div>

      {/* Waterfall Chart */}
      <div className={`${light ? 'bg-white border-slate-200' : 'bg-slate-800/40 border-slate-700/50'} border rounded-xl p-5`}>
        <h3 className={`text-lg font-bold mb-4 ${light ? 'text-slate-800' : 'text-white'}`}>P&L Waterfall</h3>
        <div className="space-y-1">
          <WaterfallBar label="Revenue" value={d.revenue} total={d.revenue} color="green" theme={theme} />
          
          {/* Channel breakdown toggle */}
          <button onClick={() => setShowChannelBreakdown(!showChannelBreakdown)} className={`flex items-center gap-1 ml-3 text-xs ${light ? 'text-violet-600' : 'text-violet-400'} hover:underline`}>
            {showChannelBreakdown ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Channel breakdown
          </button>
          {showChannelBreakdown && (
            <div className={`ml-6 space-y-1 py-1 pl-3 border-l-2 ${light ? 'border-slate-200' : 'border-slate-700'}`}>
              <WaterfallBar label="Amazon" value={d.amazonRevenue} total={d.revenue} color="amber" theme={theme} />
              <WaterfallBar label="Shopify/DTC" value={d.shopifyRevenue} total={d.revenue} color="cyan" theme={theme} />
            </div>
          )}
          
          <WaterfallBar label="COGS" value={d.cogs} total={d.revenue} color="red" isSubtraction theme={theme} />
          <WaterfallBar label="Gross Profit" value={d.grossProfit} total={d.revenue} color="green" isTotal theme={theme} />
          
          <div className={`border-t my-2 ${light ? 'border-slate-200' : 'border-slate-700/50'}`} />
          
          <WaterfallBar label="Advertising" value={d.adSpend} total={d.revenue} color="red" isSubtraction theme={theme} />
          
          {/* Ad breakdown toggle */}
          <button onClick={() => setShowAdBreakdown(!showAdBreakdown)} className={`flex items-center gap-1 ml-3 text-xs ${light ? 'text-violet-600' : 'text-violet-400'} hover:underline`}>
            {showAdBreakdown ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Ad spend breakdown
          </button>
          {showAdBreakdown && (
            <div className={`ml-6 space-y-1 py-1 pl-3 border-l-2 ${light ? 'border-slate-200' : 'border-slate-700'}`}>
              <WaterfallBar label="Amazon PPC" value={d.amazonAdSpend} total={d.revenue} color="amber" isSubtraction theme={theme} />
              <WaterfallBar label="Meta Ads" value={d.metaAdSpend} total={d.revenue} color="blue" isSubtraction theme={theme} />
              <WaterfallBar label="Google Ads" value={d.googleAdSpend} total={d.revenue} color="cyan" isSubtraction theme={theme} />
            </div>
          )}
          
          <WaterfallBar label="Fulfillment & 3PL" value={d.fulfillmentCost} total={d.revenue} color="red" isSubtraction theme={theme} />
          
          <div className={`border-t my-2 ${light ? 'border-slate-200' : 'border-slate-700/50'}`} />
          
          <WaterfallBar label="Contribution Margin" value={d.netProfit} total={d.revenue} color={d.netProfit >= 0 ? 'green' : 'red'} isTotal theme={theme} />
          
          {d.fixedCosts > 0 && (
            <>
              <WaterfallBar label="Fixed Costs (est.)" value={d.fixedCosts} total={d.revenue} color="slate" isSubtraction theme={theme} />
              <WaterfallBar label="Operating Profit" value={d.operatingProfit} total={d.revenue} color={d.operatingProfit >= 0 ? 'green' : 'red'} isTotal theme={theme} />
            </>
          )}
        </div>
      </div>

      {/* Unit Economics Row */}
      <div className={`grid grid-cols-2 md:grid-cols-4 gap-3`}>
        <div className={`${light ? 'bg-white border-slate-200' : 'bg-slate-800/40 border-slate-700/50'} border rounded-xl p-4`}>
          <div className={`text-xs ${light ? 'text-slate-500' : 'text-slate-400'} mb-1`}>TACOS</div>
          <div className={`text-xl font-bold ${d.tacos <= 12 ? 'text-emerald-400' : d.tacos <= 20 ? 'text-amber-400' : 'text-rose-400'}`}>
            {fPct(d.tacos)}
          </div>
          <div className={`text-xs ${light ? 'text-slate-400' : 'text-slate-500'} mt-1`}>Target: &lt;12%</div>
        </div>
        <div className={`${light ? 'bg-white border-slate-200' : 'bg-slate-800/40 border-slate-700/50'} border rounded-xl p-4`}>
          <div className={`text-xs ${light ? 'text-slate-500' : 'text-slate-400'} mb-1`}>Avg Order Value</div>
          <div className={`text-xl font-bold ${light ? 'text-slate-900' : 'text-white'}`}>{fc(d.aov)}</div>
          <div className={`text-xs ${light ? 'text-slate-400' : 'text-slate-500'} mt-1`}>{d.orders.toLocaleString()} orders</div>
        </div>
        <div className={`${light ? 'bg-white border-slate-200' : 'bg-slate-800/40 border-slate-700/50'} border rounded-xl p-4`}>
          <div className={`text-xs ${light ? 'text-slate-500' : 'text-slate-400'} mb-1`}>Revenue per Unit</div>
          <div className={`text-xl font-bold ${light ? 'text-slate-900' : 'text-white'}`}>{d.units > 0 ? fc(d.revenue / d.units) : '—'}</div>
          <div className={`text-xs ${light ? 'text-slate-400' : 'text-slate-500'} mt-1`}>{d.units.toLocaleString()} units</div>
        </div>
        <div className={`${light ? 'bg-white border-slate-200' : 'bg-slate-800/40 border-slate-700/50'} border rounded-xl p-4`}>
          <div className={`text-xs ${light ? 'text-slate-500' : 'text-slate-400'} mb-1`}>Profit per Order</div>
          <div className={`text-xl font-bold ${d.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {d.orders > 0 ? fc(d.netProfit / d.orders) : '—'}
          </div>
          <div className={`text-xs ${light ? 'text-slate-400' : 'text-slate-500'} mt-1`}>After all variable costs</div>
        </div>
      </div>

      {/* Channel Comparison */}
      <div className={`${light ? 'bg-white border-slate-200' : 'bg-slate-800/40 border-slate-700/50'} border rounded-xl p-5`}>
        <h3 className={`text-lg font-bold mb-4 ${light ? 'text-slate-800' : 'text-white'}`}>Channel P&L</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`${light ? 'text-slate-500 border-slate-200' : 'text-slate-400 border-slate-700'} border-b`}>
                <th className="text-left py-2 font-medium">Metric</th>
                <th className="text-right py-2 font-medium">Amazon</th>
                <th className="text-right py-2 font-medium">Shopify/DTC</th>
                <th className="text-right py-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody className={`${light ? 'text-slate-700' : 'text-slate-300'}`}>
              <tr className={`${light ? 'border-slate-100' : 'border-slate-800'} border-b`}>
                <td className="py-2">Revenue</td>
                <td className="text-right font-mono">{fc(d.amazonRevenue)}</td>
                <td className="text-right font-mono">{fc(d.shopifyRevenue)}</td>
                <td className={`text-right font-mono font-bold ${light ? 'text-slate-900' : 'text-white'}`}>{fc(d.revenue)}</td>
              </tr>
              <tr className={`${light ? 'border-slate-100' : 'border-slate-800'} border-b`}>
                <td className="py-2">Revenue Share</td>
                <td className="text-right font-mono">{d.revenue > 0 ? fPct(d.amazonRevenue / d.revenue * 100) : '—'}</td>
                <td className="text-right font-mono">{d.revenue > 0 ? fPct(d.shopifyRevenue / d.revenue * 100) : '—'}</td>
                <td className="text-right font-mono">100%</td>
              </tr>
              <tr className={`${light ? 'border-slate-100' : 'border-slate-800'} border-b`}>
                <td className="py-2">Ad Spend</td>
                <td className="text-right font-mono text-rose-400">{fc(d.amazonAdSpend)}</td>
                <td className="text-right font-mono text-rose-400">{fc(d.metaAdSpend + d.googleAdSpend)}</td>
                <td className="text-right font-mono text-rose-400">{fc(d.adSpend)}</td>
              </tr>
              <tr className={`${light ? 'border-slate-100' : 'border-slate-800'} border-b`}>
                <td className="py-2">ROAS</td>
                <td className="text-right font-mono">{d.amazonAdSpend > 0 ? `${(d.amazonRevenue / d.amazonAdSpend).toFixed(2)}x` : '—'}</td>
                <td className="text-right font-mono">{(d.metaAdSpend + d.googleAdSpend) > 0 ? `${(d.shopifyRevenue / (d.metaAdSpend + d.googleAdSpend)).toFixed(2)}x` : '—'}</td>
                <td className={`text-right font-mono font-bold ${light ? 'text-slate-900' : 'text-white'}`}>{`${d.roas.toFixed(2)}x`}</td>
              </tr>
              <tr>
                <td className="py-2">TACOS</td>
                <td className="text-right font-mono">{d.amazonRevenue > 0 ? fPct(d.amazonAdSpend / d.amazonRevenue * 100) : '—'}</td>
                <td className="text-right font-mono">{d.shopifyRevenue > 0 ? fPct((d.metaAdSpend + d.googleAdSpend) / d.shopifyRevenue * 100) : '—'}</td>
                <td className={`text-right font-mono font-bold ${light ? 'text-slate-900' : 'text-white'}`}>{fPct(d.tacos)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Weekly Breakdown Table */}
      <div className={`${light ? 'bg-white border-slate-200' : 'bg-slate-800/40 border-slate-700/50'} border rounded-xl p-5`}>
        <button onClick={() => setShowWeeklyTable(!showWeeklyTable)} className="flex items-center justify-between w-full">
          <h3 className={`text-lg font-bold ${light ? 'text-slate-800' : 'text-white'}`}>Weekly Breakdown</h3>
          {showWeeklyTable ? <ChevronUp className={`w-5 h-5 ${light ? 'text-slate-400' : 'text-slate-500'}`} /> : <ChevronDown className={`w-5 h-5 ${light ? 'text-slate-400' : 'text-slate-500'}`} />}
        </button>
        {showWeeklyTable && d.weeklyData.length > 0 && (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className={`${light ? 'text-slate-500 border-slate-200' : 'text-slate-400 border-slate-700'} border-b`}>
                  <th className="text-left py-2 font-medium">Week</th>
                  <th className="text-right py-2 font-medium">Revenue</th>
                  <th className="text-right py-2 font-medium">COGS</th>
                  <th className="text-right py-2 font-medium">Ad Spend</th>
                  <th className="text-right py-2 font-medium">3PL</th>
                  <th className="text-right py-2 font-medium">Net Profit</th>
                  <th className="text-right py-2 font-medium">Margin</th>
                </tr>
              </thead>
              <tbody>
                {d.weeklyData.sort((a, b) => b.week.localeCompare(a.week)).map((w, i) => (
                  <tr key={w.week} className={`${light ? 'border-slate-100 hover:bg-slate-50' : 'border-slate-800 hover:bg-slate-800/50'} border-b transition-colors`}>
                    <td className={`py-2 font-mono text-xs ${light ? 'text-slate-600' : 'text-slate-400'}`}>{w.week}</td>
                    <td className={`text-right font-mono ${light ? 'text-slate-800' : 'text-slate-200'}`}>{fc(w.revenue)}</td>
                    <td className="text-right font-mono text-rose-400">{fc(w.cogs)}</td>
                    <td className="text-right font-mono text-rose-400">{fc(w.adSpend)}</td>
                    <td className="text-right font-mono text-rose-400">{fc(w.threeplCost)}</td>
                    <td className={`text-right font-mono font-semibold ${w.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fc(w.profit)}</td>
                    <td className={`text-right font-mono ${w.margin >= 15 ? 'text-emerald-400' : w.margin >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>{fPct(w.margin)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={`${light ? 'border-slate-300 font-bold text-slate-900' : 'border-slate-600 font-bold text-white'} border-t-2`}>
                  <td className="py-2">Total</td>
                  <td className="text-right font-mono">{fc(d.revenue)}</td>
                  <td className="text-right font-mono text-rose-400">{fc(d.cogs)}</td>
                  <td className="text-right font-mono text-rose-400">{fc(d.adSpend)}</td>
                  <td className="text-right font-mono text-rose-400">{fc(d.fulfillmentCost)}</td>
                  <td className={`text-right font-mono ${d.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fc(d.netProfit)}</td>
                  <td className={`text-right font-mono ${d.netMargin >= 15 ? 'text-emerald-400' : d.netMargin >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>{fPct(d.netMargin)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Previous Period Comparison */}
      {p && p.revenue > 0 && (
        <div className={`${light ? 'bg-white border-slate-200' : 'bg-slate-800/40 border-slate-700/50'} border rounded-xl p-5`}>
          <h3 className={`text-lg font-bold mb-4 ${light ? 'text-slate-800' : 'text-white'}`}>vs Previous Period</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Revenue', curr: d.revenue, prev: p.revenue },
              { label: 'Net Profit', curr: d.netProfit, prev: p.netProfit },
              { label: 'Ad Spend', curr: d.adSpend, prev: p.adSpend, invert: true },
              { label: 'ROAS', curr: d.roas, prev: p.roas, suffix: 'x', decimals: 2 },
            ].map(({ label, curr, prev, invert, suffix, decimals }) => {
              const change = prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : 0;
              const isGood = invert ? change <= 0 : change >= 0;
              return (
                <div key={label} className={`p-3 rounded-lg ${light ? 'bg-slate-50' : 'bg-slate-800/60'}`}>
                  <div className={`text-xs ${light ? 'text-slate-500' : 'text-slate-400'} mb-1`}>{label}</div>
                  <div className={`flex items-center gap-2`}>
                    <span className={`text-sm font-mono ${light ? 'text-slate-500' : 'text-slate-400'}`}>
                      {suffix ? `${prev.toFixed(decimals || 0)}${suffix}` : fc(prev)}
                    </span>
                    <ArrowRight className={`w-3 h-3 ${light ? 'text-slate-400' : 'text-slate-500'}`} />
                    <span className={`text-sm font-mono font-bold ${light ? 'text-slate-900' : 'text-white'}`}>
                      {suffix ? `${curr.toFixed(decimals || 0)}${suffix}` : fc(curr)}
                    </span>
                  </div>
                  <div className={`text-xs mt-1 ${isGood ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default PnLView;
