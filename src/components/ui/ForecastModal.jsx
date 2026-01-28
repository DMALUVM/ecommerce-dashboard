import React from 'react';
import { TrendingUp, TrendingDown, X, Brain, Target, Minus } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/format';

const ForecastModal = ({
  showForecast,
  setShowForecast,
  generateForecast,
  enhancedForecast,
  amazonForecasts,
  goals
}) => {
  if (!showForecast || !generateForecast) return null;
  const f = enhancedForecast || generateForecast;
  
  const sourceLabels = {
    'weekly': 'Weekly trend analysis (4+ weeks)',
    'weekly-amazon': 'Weekly avg + Amazon forecast',
    'weekly-avg': 'Weekly averages',
    'period': 'Period averages (historical)',
  };
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-emerald-400" />
            Revenue Forecast
            {f.corrected && <span className="text-xs bg-purple-500/30 text-purple-300 px-2 py-0.5 rounded ml-2">AI-Enhanced</span>}
          </h2>
          <button onClick={() => setShowForecast(false)} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* AI Learning Status */}
        {enhancedForecast && (
          <div className={`rounded-xl p-3 mb-4 ${enhancedForecast.corrected ? 'bg-purple-900/30 border border-purple-500/30' : 'bg-slate-700/30 border border-slate-600'}`}>
            <div className="flex items-center gap-2">
              <Brain className={`w-4 h-4 ${enhancedForecast.corrected ? 'text-purple-400' : 'text-slate-400'}`} />
              <span className={`text-sm font-medium ${enhancedForecast.corrected ? 'text-purple-300' : 'text-slate-300'}`}>
                Self-Learning: {enhancedForecast.corrected ? 'Active' : 'Training'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">{enhancedForecast.correctionNote}</p>
          </div>
        )}
        
        <div className="bg-slate-900/50 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400">Data Source</span>
            <span className="text-white font-medium">{sourceLabels[generateForecast.source] || generateForecast.source}</span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400">Based on</span>
            <span className="text-white font-medium">
              {generateForecast.basedOn} {generateForecast.source === 'period' ? 'period(s)' : generateForecast.source === 'blended' ? 'week(s) + periods' : 'week(s)'}
            </span>
          </div>
          {generateForecast.amazonBlended && (
            <div className="mb-2 p-2 bg-orange-900/30 border border-orange-500/30 rounded-lg">
              <p className="text-orange-300 text-xs flex items-center gap-1">
                <Target className="w-3 h-3" />
                Using {generateForecast.amazonForecastCount || 0} Amazon forecast(s) for enhanced accuracy
              </p>
            </div>
          )}
          {!generateForecast.amazonBlended && Object.keys(amazonForecasts).length === 0 && (
            <div className="mb-2 p-2 bg-slate-700/50 border border-slate-600 rounded-lg">
              <p className="text-slate-400 text-xs flex items-center gap-1">
                💡 Upload Amazon forecasts (7/30/60-day) from Seller Central to improve projections
              </p>
            </div>
          )}
          {generateForecast.note && (
            <div className="mb-2 p-2 bg-amber-900/30 border border-amber-500/30 rounded-lg">
              <p className="text-amber-300 text-xs">⚠️ {generateForecast.note}</p>
            </div>
          )}
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400">Trend Direction</span>
            <span className={`font-medium flex items-center gap-1 ${f.trend.revenue === 'up' ? 'text-emerald-400' : f.trend.revenue === 'down' ? 'text-rose-400' : 'text-slate-400'}`}>
              {f.trend.revenue === 'up' ? <TrendingUp className="w-4 h-4" /> : f.trend.revenue === 'down' ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
              {f.trend.revenueChange > 0 ? '+' : ''}{f.trend.revenueChange.toFixed(1)}% per week
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Confidence</span>
            <span className={`font-medium ${parseFloat(f.confidence) > 70 ? 'text-emerald-400' : parseFloat(f.confidence) > 40 ? 'text-amber-400' : 'text-rose-400'}`}>{f.confidence}%</span>
          </div>
        </div>
        
        <h3 className="text-sm font-semibold text-slate-400 uppercase mb-3">Weekly Projections</h3>
        <div className="grid grid-cols-4 gap-3 mb-4">
          {f.weekly.map((w, i) => {
            const onWeeklyTarget = goals.weeklyRevenue > 0 ? w.revenue >= goals.weeklyRevenue : null;
            return (
              <div key={i} className={`rounded-xl p-3 text-center ${w.hasAmazonForecast ? 'bg-orange-900/20 border border-orange-500/30' : 'bg-slate-900/50'}`}>
                <p className="text-slate-500 text-xs mb-1">{w.week}</p>
                {w.hasAmazonForecast && <p className="text-orange-400 text-xs mb-1">📊 Amazon</p>}
                <p className="text-white font-bold">{formatCurrency(w.revenue)}</p>
                <p className={`text-sm ${w.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(w.profit)}</p>
                <p className="text-slate-500 text-xs">{formatNumber(w.units)} units</p>
                {onWeeklyTarget !== null && (
                  <p className={`text-xs mt-1 ${onWeeklyTarget ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {onWeeklyTarget ? '✓ On target' : `${formatCurrency(goals.weeklyRevenue - w.revenue)} short`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        
        {/* Weekly Goal Progress */}
        {goals.weeklyRevenue > 0 && (
          <div className="bg-slate-900/50 rounded-xl p-4 mb-4 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-sm">Weekly Goal Progress (Avg Projection)</span>
              <span className={`font-medium ${f.weekly.reduce((s, w) => s + w.revenue, 0) / 4 >= goals.weeklyRevenue ? 'text-emerald-400' : 'text-amber-400'}`}>
                {formatCurrency(f.weekly.reduce((s, w) => s + w.revenue, 0) / 4)} / {formatCurrency(goals.weeklyRevenue)}
              </span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all ${f.weekly.reduce((s, w) => s + w.revenue, 0) / 4 >= goals.weeklyRevenue ? 'bg-emerald-500' : 'bg-amber-500'}`}
                style={{ width: `${Math.min(100, (f.weekly.reduce((s, w) => s + w.revenue, 0) / 4 / goals.weeklyRevenue * 100))}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {f.weekly.reduce((s, w) => s + w.revenue, 0) / 4 >= goals.weeklyRevenue 
                ? `🎯 Projections exceed weekly goal by ${formatCurrency(f.weekly.reduce((s, w) => s + w.revenue, 0) / 4 - goals.weeklyRevenue)}`
                : `⚠️ Projections are ${formatCurrency(goals.weeklyRevenue - f.weekly.reduce((s, w) => s + w.revenue, 0) / 4)} below weekly goal`
              }
            </p>
          </div>
        )}
        
        <div className="bg-gradient-to-r from-emerald-900/30 to-violet-900/30 rounded-xl p-4 border border-emerald-500/30">
          <h3 className="text-sm font-semibold text-emerald-400 uppercase mb-3">Next Month Projection</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-slate-400 text-sm">Revenue</p>
              <p className="text-2xl font-bold text-white">{formatCurrency(f.monthly.revenue)}</p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Profit</p>
              <p className={`text-2xl font-bold ${f.monthly.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(f.monthly.profit)}</p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Units</p>
              <p className="text-2xl font-bold text-white">{formatNumber(f.monthly.units)}</p>
            </div>
          </div>
          {goals.monthlyRevenue > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-700">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">vs Monthly Goal</span>
                <span className={f.monthly.revenue >= goals.monthlyRevenue ? 'text-emerald-400' : 'text-amber-400'}>
                  {f.monthly.revenue >= goals.monthlyRevenue ? '✓ On track' : `${formatCurrency(goals.monthlyRevenue - f.monthly.revenue)} short`}
                </span>
              </div>
            </div>
          )}
        </div>
        
        <p className="text-slate-500 text-xs mt-4 text-center">
          * Forecast based on {sourceLabels[f.source] || 'available data'}. Actual results may vary.
        </p>
      </div>
    </div>
  );
};

export default ForecastModal;
