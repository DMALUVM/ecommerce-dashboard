import React from 'react';
import { Target, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatCurrency } from '../../utils/format';

const ProgressBar = ({ current, target, label, projected, trendDir, recentPeriodCount }) => {
  if (!target || target <= 0) return null;

  const pct = Math.min((current / target) * 100, 100);
  const hit = current >= target;
  const projectedPct = projected ? Math.min((projected / target) * 100, 150) : null;
  const willHit = projected >= target;
  const diff = current - target;
  const projectedDiff = projected ? projected - target : null;

  return (
    <div className="mb-4">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-400">{label}</span>
        <span className="text-white">{formatCurrency(current)} / {formatCurrency(target)}</span>
      </div>
      <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden relative">
        <div className={`h-full transition-all ${hit ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
        {projectedPct && (
          <div
            className={`absolute top-0 h-full w-1 ${willHit ? 'bg-emerald-300' : 'bg-rose-400'}`}
            style={{ left: `${Math.min(projectedPct, 100)}%` }}
            title={`Projected: ${formatCurrency(projected)}`}
          />
        )}
      </div>
      <div className="flex justify-between items-center mt-1">
        <p className={`text-xs ${hit ? 'text-emerald-400' : 'text-amber-400'}`}>
          {pct.toFixed(0)}% {hit ? '🎉' : ''}
          <span className="text-slate-500 ml-1">
            ({diff >= 0 ? '+' : ''}{formatCurrency(diff)})
          </span>
        </p>
        {projected && recentPeriodCount >= 3 && (
          <p className={`text-xs flex items-center gap-1 ${willHit ? 'text-emerald-400' : 'text-rose-400'}`}>
            {trendDir === 'up' ? <TrendingUp className="w-3 h-3" /> : trendDir === 'down' ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            Trend: {willHit ? 'On track' : `${formatCurrency(Math.abs(projectedDiff))} short`}
          </p>
        )}
      </div>
    </div>
  );
};

const GoalsCard = ({ 
  weekRevenue = 0, 
  weekProfit = 0, 
  monthRevenue = 0, 
  monthProfit = 0, 
  monthLabel = '',
  goals,
  allWeeksData,
  setShowGoalsModal
}) => {
  const hasGoals = goals.weeklyRevenue > 0 || goals.weeklyProfit > 0 || goals.monthlyRevenue > 0 || goals.monthlyProfit > 0;
  if (!hasGoals) return null;
  
  // Calculate trend data
  const sortedWeeks = Object.keys(allWeeksData).sort();
  const recentWeeks = sortedWeeks.slice(-8); // Last 8 weeks for trend
  const weeklyRevenues = recentWeeks.map(w => allWeeksData[w]?.total?.revenue || 0);
  const weeklyProfits = recentWeeks.map(w => allWeeksData[w]?.total?.netProfit || 0);
  
  // Simple linear regression for trend
  const calcTrend = (data) => {
    if (data.length < 3) return { slope: 0, projected: data[data.length - 1] || 0, trend: 'stable' };
    const n = data.length;
    const sumX = data.reduce((s, _, i) => s + i, 0);
    const sumY = data.reduce((s, v) => s + v, 0);
    const sumXY = data.reduce((s, v, i) => s + i * v, 0);
    const sumX2 = data.reduce((s, _, i) => s + i * i, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const projected = slope * n + intercept; // Project next period
    const avgChange = slope / (sumY / n) * 100; // % change per period
    return { 
      slope, 
      projected, 
      avgChange,
      trend: avgChange > 2 ? 'up' : avgChange < -2 ? 'down' : 'stable'
    };
  };
  
  const revenueTrend = calcTrend(weeklyRevenues);
  const profitTrend = calcTrend(weeklyProfits);
  
  // Calculate monthly projection (4 weeks)
  const projectedMonthlyRevenue = revenueTrend.projected * 4;
  const projectedMonthlyProfit = profitTrend.projected * 4;
  
  return (
    <div className="bg-gradient-to-br from-amber-900/20 to-slate-800/50 rounded-xl border border-amber-500/30 p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-amber-400 font-semibold flex items-center gap-2"><Target className="w-4 h-4" />Goals Progress</h3>
        <button onClick={() => setShowGoalsModal(true)} className="text-xs text-slate-400 hover:text-white">Edit</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {goals.weeklyRevenue > 0 && (
          <ProgressBar 
            current={weekRevenue} 
            target={goals.weeklyRevenue} 
            label="Weekly Revenue" 
            projected={revenueTrend.projected}
            trendDir={revenueTrend.trend}
            recentPeriodCount={recentWeeks.length}
          />
        )}
        {goals.weeklyProfit > 0 && (
          <ProgressBar 
            current={weekProfit} 
            target={goals.weeklyProfit} 
            label="Weekly Profit" 
            projected={profitTrend.projected}
            trendDir={profitTrend.trend}
            recentPeriodCount={recentWeeks.length}
          />
        )}
        {goals.monthlyRevenue > 0 && (
          <ProgressBar 
            current={monthRevenue} 
            target={goals.monthlyRevenue} 
            label={monthLabel ? `${monthLabel} Revenue` : 'Monthly Revenue'} 
            projected={projectedMonthlyRevenue}
            trendDir={revenueTrend.trend}
            recentPeriodCount={recentWeeks.length}
          />
        )}
        {goals.monthlyProfit > 0 && (
          <ProgressBar 
            current={monthProfit} 
            target={goals.monthlyProfit} 
            label={monthLabel ? `${monthLabel} Profit` : 'Monthly Profit'} 
            projected={projectedMonthlyProfit}
            trendDir={profitTrend.trend}
            recentPeriodCount={recentWeeks.length}
          />
        )}
      </div>
      {recentWeeks.length >= 3 && (
        <div className="mt-3 pt-3 border-t border-slate-700/50">
          <p className="text-xs text-slate-400">
            📈 Trend based on last {recentWeeks.length} weeks | 
            Revenue: <span className={revenueTrend.trend === 'up' ? 'text-emerald-400' : revenueTrend.trend === 'down' ? 'text-rose-400' : 'text-slate-300'}>
              {revenueTrend.avgChange > 0 ? '+' : ''}{revenueTrend.avgChange.toFixed(1)}%/wk
            </span> | 
            Profit: <span className={profitTrend.trend === 'up' ? 'text-emerald-400' : profitTrend.trend === 'down' ? 'text-rose-400' : 'text-slate-300'}>
              {profitTrend.avgChange > 0 ? '+' : ''}{profitTrend.avgChange.toFixed(1)}%/wk
            </span>
          </p>
        </div>
      )}
    </div>
  );
};

export default GoalsCard;
