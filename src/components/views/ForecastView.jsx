import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  AlertTriangle, BarChart3, Boxes, Brain, Check, Edit, Lightbulb, Loader2, Megaphone, Settings, ShoppingBag, Store, Target, TrendingUp, Upload, Zap
} from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/format';
import NavTabs from '../ui/NavTabs';

const ForecastView = ({
  aiForecastLoading,
  aiForecastModule,
  aiForecasts,
  aiLearningHistory,
  allDaysData,
  allPeriodsData,
  allWeeksData,
  amazonForecasts,
  appSettings,
  bankingData,
  dataBar,
  files,
  forecastCorrections,
  forecastPeriod,
  forecastTab,
  generateAIForecasts,
  generateChannelForecastAI,
  generateForecastComparisonAI,
  generateInventoryAI,
  generateSalesForecastAI,
  globalModals,
  hasDailySalesData,
  invHistory,
  leadTimeSettings,
  navDropdown,
  savedCogs,
  savedProductNames,
  setForecastPeriod,
  setForecastTab,
  setLeadTimeSettings,
  setNavDropdown,
  setSelectedDay,
  setSelectedInvDate,
  setSelectedPeriod,
  setSelectedWeek,
  setUploadTab,
  setView,
  view,
}) => {
    // Data availability
    const sortedWeeks = Object.keys(allWeeksData).sort();
    const sortedDays = Object.keys(allDaysData).filter(d => hasDailySalesData(allDaysData[d])).sort();
    const activeWeeksCount = sortedWeeks.filter(w => (allWeeksData[w]?.total?.revenue || 0) > 100).length;
    const hasEnoughData = sortedWeeks.length >= 4 || sortedDays.length >= 14;
    
    // Learning stats
    const learningStats = {
      predictions: aiLearningHistory.predictions?.length || 0,
      withActuals: aiLearningHistory.predictions?.filter(p => p.actual !== undefined).length || 0,
      avgAccuracy: (() => {
        const withActuals = aiLearningHistory.predictions?.filter(p => p.accuracy?.revenueError !== undefined) || [];
        if (withActuals.length === 0) return null;
        const totalError = withActuals.reduce((sum, p) => sum + Math.abs(p.accuracy.revenueError || 0), 0);
        return 100 - (totalError / withActuals.length);
      })(),
    };
    
    return (
      <div className="min-h-screen bg-slate-950 p-4 lg:p-6">
        <div className="max-w-7xl mx-auto">{globalModals}
          <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />
          {dataBar}
          
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                  <Brain className="w-7 h-7 text-purple-400" />
                </div>
                <div>
                  <h1 className="text-2xl lg:text-3xl font-bold text-white">AI Forecast Center</h1>
                  <p className="text-slate-400">Specialized AI forecasts powered by Claude • Continuously learning from your data</p>
                </div>
              </div>
              
              {/* Learning Status */}
              <div className="bg-slate-800/50 rounded-xl px-4 py-2 border border-slate-700">
                <p className="text-slate-400 text-xs">AI Learning Status</p>
                <div className="flex items-center gap-3">
                  <span className="text-white font-medium">{learningStats.predictions} predictions</span>
                  <span className="text-slate-500">•</span>
                  <span className="text-emerald-400">{learningStats.withActuals} verified</span>
                  {learningStats.avgAccuracy && (
                    <>
                      <span className="text-slate-500">•</span>
                      <span className="text-cyan-400">{learningStats.avgAccuracy.toFixed(1)}% accurate</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* Forecast Type Tabs */}
          <div className="flex flex-wrap gap-2 mb-6">
            <button onClick={() => setForecastTab('sales')} className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${forecastTab === 'sales' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
              <TrendingUp className="w-4 h-4" />Sales Forecast
            </button>
            <button onClick={() => setForecastTab('amazon')} className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${forecastTab === 'amazon' ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
              <Store className="w-4 h-4" />Amazon
            </button>
            <button onClick={() => setForecastTab('shopify')} className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${forecastTab === 'shopify' ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
              <ShoppingBag className="w-4 h-4" />Shopify
            </button>
            <button onClick={() => setForecastTab('inventory')} className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${forecastTab === 'inventory' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
              <Boxes className="w-4 h-4" />Inventory
            </button>
            <button onClick={() => setForecastTab('comparison')} className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${forecastTab === 'comparison' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
              <BarChart3 className="w-4 h-4" />AI vs Amazon
            </button>
            <button onClick={() => setForecastTab('settings')} className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${forecastTab === 'settings' ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
              <Settings className="w-4 h-4" />Settings
            </button>
          </div>
          
          {/* SALES FORECAST TAB */}
          {forecastTab === 'sales' && (
            <div className="space-y-6">
              {/* Time Period Selector */}
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <h3 className="text-white font-medium mb-1">Select Forecast Period</h3>
                    <p className="text-slate-400 text-sm">AI will predict total sales (Amazon + Shopify combined)</p>
                  </div>
                  <div className="flex gap-2">
                    {['tomorrow', 'week', 'month', 'quarter'].map(period => (
                      <button
                        key={period}
                        onClick={() => setForecastPeriod(period)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium ${forecastPeriod === period ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                      >
                        {period === 'tomorrow' ? 'Tomorrow' : period === 'week' ? 'This Week' : period === 'month' ? 'This Month' : 'This Quarter'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Generate Button & Results */}
              <div className="bg-gradient-to-br from-emerald-900/30 via-slate-800 to-teal-900/20 rounded-2xl border border-emerald-500/30 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-white">
                      {forecastPeriod === 'tomorrow' ? "Tomorrow's" : forecastPeriod === 'week' ? 'This Week' : forecastPeriod === 'month' ? 'This Month' : 'This Quarter'} Sales Forecast
                    </h3>
                    <p className="text-slate-400 text-sm">
                      {forecastPeriod === 'week' 
                        ? 'Multi-Signal AI forecast (synced with dashboard)'
                        : `AI prediction using ${activeWeeksCount} active weeks + ${sortedDays.length} days of sales data`}
                    </p>
                  </div>
                  {forecastPeriod === 'week' ? (
                    <button 
                      onClick={generateAIForecasts}
                      disabled={aiForecastLoading}
                      className="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl text-white font-medium flex items-center gap-2"
                    >
                      {aiForecastLoading ? (
                        <><Loader2 className="w-5 h-5 animate-spin" />Analyzing...</>
                      ) : (
                        <><Brain className="w-5 h-5" />Refresh Forecast</>
                      )}
                    </button>
                  ) : (
                    <button 
                      onClick={() => generateSalesForecastAI(forecastPeriod)}
                      disabled={aiForecastModule.loading === 'sales' || !hasEnoughData}
                      className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl text-white font-medium flex items-center gap-2"
                    >
                      {aiForecastModule.loading === 'sales' ? (
                        <><Loader2 className="w-5 h-5 animate-spin" />Analyzing...</>
                      ) : (
                        <><Zap className="w-5 h-5" />Generate Forecast</>
                      )}
                    </button>
                  )}
                </div>
                
                {!hasEnoughData && (
                  <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4 mb-4">
                    <p className="text-amber-400">Need at least 4 weeks or 14 days of sales data to generate forecasts.</p>
                  </div>
                )}
                
                {/* This Week - Always use Multi-Signal AI Forecast (same as dashboard) */}
                {forecastPeriod === 'week' && aiForecasts?.salesForecast?.next4Weeks?.[0] && (
                  <div className="space-y-4">
                    {/* Prediction Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-slate-800/70 rounded-xl p-4 border border-slate-700">
                        <p className="text-slate-400 text-sm mb-1">Expected Revenue</p>
                        <p className="text-3xl font-bold text-white">{formatCurrency(aiForecasts.salesForecast.next4Weeks[0].predictedRevenue || 0)}</p>
                        <p className="text-slate-500 text-xs mt-1">
                          Daily avg: {formatCurrency(aiForecasts.calculatedSignals?.dailyAvg7 || 0)}/day
                        </p>
                      </div>
                      <div className="bg-slate-800/70 rounded-xl p-4 border border-slate-700">
                        <p className="text-slate-400 text-sm mb-1">Expected Profit</p>
                        <p className={`text-3xl font-bold ${(aiForecasts.salesForecast.next4Weeks[0].predictedProfit || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {formatCurrency(aiForecasts.salesForecast.next4Weeks[0].predictedProfit || 0)}
                        </p>
                        <p className="text-slate-500 text-xs mt-1">
                          {aiForecasts.salesForecast.next4Weeks[0].confidence} confidence
                        </p>
                      </div>
                      <div className="bg-slate-800/70 rounded-xl p-4 border border-slate-700">
                        <p className="text-slate-400 text-sm mb-1">Expected Units</p>
                        <p className="text-3xl font-bold text-white">{formatNumber(aiForecasts.salesForecast.next4Weeks[0].predictedUnits || 0)}</p>
                        <p className="text-slate-500 text-xs mt-1">
                          ~{formatNumber(Math.round((aiForecasts.salesForecast.next4Weeks[0].predictedUnits || 0) / 7))}/day
                        </p>
                      </div>
                    </div>
                    
                    {/* Signals & Methodology */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-slate-800/50 rounded-xl p-4">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`px-3 py-1 rounded-lg text-sm font-medium ${
                            aiForecasts.salesForecast.next4Weeks[0].confidence === 'high' ? 'bg-emerald-500/20 text-emerald-400' :
                            aiForecasts.salesForecast.next4Weeks[0].confidence === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-slate-600 text-slate-300'
                          }`}>
                            {aiForecasts.salesForecast.next4Weeks[0].confidence} confidence
                          </span>
                          <span className={`px-3 py-1 rounded-lg text-sm ${
                            (aiForecasts.calculatedSignals?.momentum || 0) > 5 ? 'bg-emerald-500/20 text-emerald-400' :
                            (aiForecasts.calculatedSignals?.momentum || 0) < -5 ? 'bg-rose-500/20 text-rose-400' :
                            'bg-slate-600 text-slate-300'
                          }`}>
                            {(aiForecasts.calculatedSignals?.momentum || 0) > 5 ? '↑ Upward momentum' : 
                             (aiForecasts.calculatedSignals?.momentum || 0) < -5 ? '↓ Downward momentum' : '→ Stable'}
                          </span>
                        </div>
                        <p className="text-slate-300 text-sm">
                          Momentum: {aiForecasts.calculatedSignals?.momentum > 0 ? '+' : ''}{aiForecasts.calculatedSignals?.momentum?.toFixed(1)}% (last 7 days vs prior 7 days)
                        </p>
                      </div>
                      <div className="bg-slate-800/50 rounded-xl p-4">
                        <p className="text-slate-400 text-sm mb-2">Forecast Methodology</p>
                        <div className="flex flex-wrap gap-2">
                          <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs">📊 {aiForecasts.dataPoints?.dailyDays || aiForecasts.dataPoints?.daysAnalyzed || 0} days of daily data</span>
                          <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs">📅 {aiForecasts.dataPoints?.weeklyWeeks || aiForecasts.dataPoints?.weeksAnalyzed || 0} weeks of weekly data</span>
                          {aiForecasts.dataPoints?.amazonForecastWeeks > 0 && (
                            <span className="px-2 py-1 bg-orange-700 text-orange-300 rounded text-xs">🛒 {aiForecasts.dataPoints.amazonForecastWeeks} Amazon forecasts</span>
                          )}
                        </div>
                        <p className="text-purple-400 text-xs mt-2">Weighted: 60% daily trends, 20% weekly, 20% Amazon (if available)</p>
                      </div>
                    </div>
                    
                    {/* 4-Week Outlook */}
                    <div className="bg-slate-800/50 rounded-xl p-4">
                      <p className="text-slate-400 text-sm mb-3">4-Week Outlook</p>
                      <div className="grid grid-cols-4 gap-3">
                        {aiForecasts.salesForecast.next4Weeks.map((w, i) => (
                          <div key={i} className={`text-center p-3 rounded-lg ${i === 0 ? 'bg-purple-900/30 border border-purple-500/30' : 'bg-slate-700/30'}`}>
                            <p className="text-slate-500 text-xs mb-1">Week {i + 1}</p>
                            <p className="text-white font-bold">{formatCurrency(w.predictedRevenue || 0)}</p>
                            <p className={`text-xs ${(w.predictedProfit || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {formatCurrency(w.predictedProfit || 0)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* AI Insights Section */}
                    {(aiForecasts.actionableInsights?.length > 0 || aiForecasts.risks?.length > 0 || aiForecasts.opportunities?.length > 0) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Actionable Insights */}
                        {aiForecasts.actionableInsights?.length > 0 && (
                          <div className="bg-gradient-to-br from-emerald-900/20 to-slate-800 rounded-xl p-4 border border-emerald-500/20">
                            <p className="text-emerald-400 text-sm font-medium mb-3 flex items-center gap-2">
                              <Lightbulb className="w-4 h-4" /> AI Recommendations
                            </p>
                            <div className="space-y-2">
                              {aiForecasts.actionableInsights.slice(0, 3).map((insight, i) => (
                                <div key={i} className="flex items-start gap-2">
                                  <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-xs font-medium ${
                                    insight.priority === 'critical' ? 'bg-rose-500/30 text-rose-300' :
                                    insight.priority === 'high' ? 'bg-amber-500/30 text-amber-300' :
                                    'bg-slate-600 text-slate-300'
                                  }`}>
                                    {insight.priority}
                                  </span>
                                  <div>
                                    <p className="text-slate-200 text-sm">{insight.insight}</p>
                                    {insight.expectedImpact && (
                                      <p className="text-slate-500 text-xs mt-0.5">→ {insight.expectedImpact}</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Risks & Opportunities */}
                        <div className="space-y-4">
                          {aiForecasts.risks?.length > 0 && (
                            <div className="bg-gradient-to-br from-rose-900/20 to-slate-800 rounded-xl p-4 border border-rose-500/20">
                              <p className="text-rose-400 text-sm font-medium mb-2 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" /> Risks to Watch
                              </p>
                              <div className="space-y-1.5">
                                {aiForecasts.risks.slice(0, 2).map((risk, i) => (
                                  <div key={i} className="text-sm">
                                    <span className="text-slate-300">{risk.risk}</span>
                                    {risk.mitigation && (
                                      <span className="text-slate-500 text-xs ml-1">• {risk.mitigation}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {aiForecasts.opportunities?.length > 0 && (
                            <div className="bg-gradient-to-br from-blue-900/20 to-slate-800 rounded-xl p-4 border border-blue-500/20">
                              <p className="text-blue-400 text-sm font-medium mb-2 flex items-center gap-2">
                                <TrendingUp className="w-4 h-4" /> Opportunities
                              </p>
                              <div className="space-y-1.5">
                                {aiForecasts.opportunities.slice(0, 2).map((opp, i) => (
                                  <div key={i} className="text-sm">
                                    <span className="text-slate-300">{opp.opportunity}</span>
                                    {opp.action && (
                                      <span className="text-slate-500 text-xs ml-1">• {opp.action}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Ads Recommendations */}
                    {aiForecasts.adsRecommendations && aiForecasts.adsRecommendations.overallPerformance !== 'no-data' && (
                      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                        <p className="text-slate-400 text-sm font-medium mb-3 flex items-center gap-2">
                          <Megaphone className="w-4 h-4" /> Advertising Insights
                        </p>
                        <div className="flex flex-wrap gap-3 items-center">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            aiForecasts.adsRecommendations.overallPerformance === 'excellent' ? 'bg-emerald-500/20 text-emerald-400' :
                            aiForecasts.adsRecommendations.overallPerformance === 'good' ? 'bg-blue-500/20 text-blue-400' :
                            aiForecasts.adsRecommendations.overallPerformance === 'average' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-rose-500/20 text-rose-400'
                          }`}>
                            {aiForecasts.adsRecommendations.overallPerformance} performance
                          </span>
                          {aiForecasts.adsRecommendations.googleAdsAction && (
                            <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs">
                              Google: {aiForecasts.adsRecommendations.googleAdsAction}
                            </span>
                          )}
                          {aiForecasts.adsRecommendations.metaAdsAction && (
                            <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs">
                              Meta: {aiForecasts.adsRecommendations.metaAdsAction}
                            </span>
                          )}
                          {aiForecasts.adsRecommendations.suggestedWeeklyBudget?.total > 0 && (
                            <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-xs">
                              Suggested: {formatCurrency(aiForecasts.adsRecommendations.suggestedWeeklyBudget.total)}/week
                            </span>
                          )}
                        </div>
                        {aiForecasts.adsRecommendations.recommendations?.length > 0 && (
                          <p className="text-slate-400 text-xs mt-2">
                            💡 {aiForecasts.adsRecommendations.recommendations[0].action}
                          </p>
                        )}
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-1 rounded text-xs ${
                        aiForecasts.source?.startsWith('claude') ? 'bg-purple-500/20 text-purple-300' : 'bg-slate-700 text-slate-400'
                      }`}>
                        {aiForecasts.source?.startsWith('claude') ? '🧠 Claude AI' : '🤖 AI Generated'}
                      </span>
                      <p className="text-slate-500 text-xs">
                        Last updated: {aiForecasts.generatedAt ? new Date(aiForecasts.generatedAt).toLocaleString() : '—'}
                      </p>
                    </div>
                  </div>
                )}
                
                {/* This Week - No forecast yet */}
                {forecastPeriod === 'week' && !aiForecasts?.salesForecast?.next4Weeks?.[0] && !aiForecastLoading && hasEnoughData && (
                  <div className="text-center py-8">
                    <Brain className="w-12 h-12 text-purple-400/30 mx-auto mb-3" />
                    <p className="text-slate-400">Click "Refresh Forecast" to generate your weekly prediction</p>
                    <p className="text-slate-500 text-xs mt-2">Uses the same Multi-Signal AI as the dashboard widget</p>
                  </div>
                )}
                
                {/* Other periods (Tomorrow, Month, Quarter) - use generateSalesForecastAI */}
                {forecastPeriod !== 'week' && aiForecastModule.sales?.[forecastPeriod] && (
                  <div className="space-y-4">
                    {/* Prediction Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-slate-800/70 rounded-xl p-4 border border-slate-700">
                        <p className="text-slate-400 text-sm mb-1">Expected Revenue</p>
                        <p className="text-3xl font-bold text-white">{formatCurrency(aiForecastModule.sales[forecastPeriod].prediction?.revenue?.expected || 0)}</p>
                        <p className="text-slate-500 text-xs mt-1">
                          Range: {formatCurrency(aiForecastModule.sales[forecastPeriod].prediction?.revenue?.low || 0)} - {formatCurrency(aiForecastModule.sales[forecastPeriod].prediction?.revenue?.high || 0)}
                        </p>
                      </div>
                      <div className="bg-slate-800/70 rounded-xl p-4 border border-slate-700">
                        <p className="text-slate-400 text-sm mb-1">Expected Profit</p>
                        <p className={`text-3xl font-bold ${(aiForecastModule.sales[forecastPeriod].prediction?.profit?.expected || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {formatCurrency(aiForecastModule.sales[forecastPeriod].prediction?.profit?.expected || 0)}
                        </p>
                        <p className="text-slate-500 text-xs mt-1">
                          Range: {formatCurrency(aiForecastModule.sales[forecastPeriod].prediction?.profit?.low || 0)} - {formatCurrency(aiForecastModule.sales[forecastPeriod].prediction?.profit?.high || 0)}
                        </p>
                      </div>
                      <div className="bg-slate-800/70 rounded-xl p-4 border border-slate-700">
                        <p className="text-slate-400 text-sm mb-1">Expected Units</p>
                        <p className="text-3xl font-bold text-white">{formatNumber(aiForecastModule.sales[forecastPeriod].prediction?.units?.expected || 0)}</p>
                        <p className="text-slate-500 text-xs mt-1">
                          Range: {formatNumber(aiForecastModule.sales[forecastPeriod].prediction?.units?.low || 0)} - {formatNumber(aiForecastModule.sales[forecastPeriod].prediction?.units?.high || 0)}
                        </p>
                      </div>
                    </div>
                    
                    {/* Confidence & Insights */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-slate-800/50 rounded-xl p-4">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`px-3 py-1 rounded-lg text-sm font-medium ${
                            aiForecastModule.sales[forecastPeriod].confidence === 'high' ? 'bg-emerald-500/20 text-emerald-400' :
                            aiForecastModule.sales[forecastPeriod].confidence === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-slate-600 text-slate-300'
                          }`}>
                            {aiForecastModule.sales[forecastPeriod].confidence} confidence
                          </span>
                          <span className={`px-3 py-1 rounded-lg text-sm ${
                            aiForecastModule.sales[forecastPeriod].trend === 'up' ? 'bg-emerald-500/20 text-emerald-400' :
                            aiForecastModule.sales[forecastPeriod].trend === 'down' ? 'bg-rose-500/20 text-rose-400' :
                            'bg-slate-600 text-slate-300'
                          }`}>
                            {aiForecastModule.sales[forecastPeriod].trend === 'up' ? '↑ Upward trend' : 
                             aiForecastModule.sales[forecastPeriod].trend === 'down' ? '↓ Downward trend' : '→ Stable'}
                          </span>
                        </div>
                        <p className="text-slate-300 text-sm">{aiForecastModule.sales[forecastPeriod].reasoning}</p>
                      </div>
                      <div className="bg-slate-800/50 rounded-xl p-4">
                        <p className="text-slate-400 text-sm mb-2">Key Factors</p>
                        <div className="flex flex-wrap gap-2">
                          {(aiForecastModule.sales[forecastPeriod].factors || []).map((factor, i) => (
                            <span key={i} className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs">{factor}</span>
                          ))}
                        </div>
                        {aiForecastModule.sales[forecastPeriod].dayOfWeekInsight && (
                          <p className="text-cyan-400 text-xs mt-2">{aiForecastModule.sales[forecastPeriod].dayOfWeekInsight}</p>
                        )}
                      </div>
                    </div>
                    
                    <p className="text-slate-500 text-xs text-right">Generated: {new Date(aiForecastModule.sales[forecastPeriod].generatedAt).toLocaleString()}</p>
                  </div>
                )}
                
                {/* Empty state for non-week periods */}
                {forecastPeriod !== 'week' && !aiForecastModule.sales?.[forecastPeriod] && !aiForecastModule.loading && hasEnoughData && (
                  <div className="text-center py-8">
                    <TrendingUp className="w-12 h-12 text-emerald-400/30 mx-auto mb-3" />
                    <p className="text-slate-400">Click "Generate Forecast" to get AI predictions for {forecastPeriod === 'tomorrow' ? "tomorrow's" : forecastPeriod === 'month' ? 'this month' : 'this quarter'} sales</p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* AMAZON CHANNEL TAB */}
          {forecastTab === 'amazon' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-orange-900/30 via-slate-800 to-amber-900/20 rounded-2xl border border-orange-500/30 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-orange-400">Amazon Channel Forecast</h3>
                    <p className="text-slate-400 text-sm">AI prediction specifically for your Amazon marketplace performance</p>
                  </div>
                  <button 
                    onClick={() => generateChannelForecastAI('amazon')}
                    disabled={aiForecastModule.loading === 'amazon'}
                    className="px-6 py-3 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-700 rounded-xl text-white font-medium flex items-center gap-2"
                  >
                    {aiForecastModule.loading === 'amazon' ? <><Loader2 className="w-5 h-5 animate-spin" />Analyzing...</> : <><Zap className="w-5 h-5" />Generate Amazon Forecast</>}
                  </button>
                </div>
                
                {aiForecastModule.amazon ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-slate-800/70 rounded-xl p-4 border border-orange-500/20">
                        <p className="text-slate-400 text-sm mb-1">Next Week Revenue</p>
                        <p className="text-2xl font-bold text-white">{formatCurrency(aiForecastModule.amazon.nextWeek?.revenue?.expected || 0)}</p>
                        <p className="text-slate-500 text-xs">Range: {formatCurrency(aiForecastModule.amazon.nextWeek?.revenue?.low || 0)} - {formatCurrency(aiForecastModule.amazon.nextWeek?.revenue?.high || 0)}</p>
                      </div>
                      <div className="bg-slate-800/70 rounded-xl p-4 border border-orange-500/20">
                        <p className="text-slate-400 text-sm mb-1">Next Week Profit</p>
                        <p className={`text-2xl font-bold ${(aiForecastModule.amazon.nextWeek?.profit?.expected || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {formatCurrency(aiForecastModule.amazon.nextWeek?.profit?.expected || 0)}
                        </p>
                      </div>
                      <div className="bg-slate-800/70 rounded-xl p-4 border border-orange-500/20">
                        <p className="text-slate-400 text-sm mb-1">Next Month Total</p>
                        <p className="text-2xl font-bold text-white">{formatCurrency(aiForecastModule.amazon.nextMonth?.revenue || 0)}</p>
                        <p className={`text-xs ${(aiForecastModule.amazon.nextMonth?.profit || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {formatCurrency(aiForecastModule.amazon.nextMonth?.profit || 0)} profit
                        </p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-slate-800/50 rounded-xl p-4">
                        <p className="text-orange-400 font-medium mb-2">Channel Health: <span className={`${aiForecastModule.amazon.channelHealth === 'excellent' ? 'text-emerald-400' : aiForecastModule.amazon.channelHealth === 'good' ? 'text-cyan-400' : aiForecastModule.amazon.channelHealth === 'fair' ? 'text-amber-400' : 'text-rose-400'}`}>{aiForecastModule.amazon.channelHealth}</span></p>
                        <p className="text-slate-300 text-sm">{aiForecastModule.amazon.reasoning}</p>
                        {aiForecastModule.amazon.vsAmazonForecast && (
                          <p className="text-cyan-400 text-xs mt-2 border-t border-slate-700 pt-2">vs Amazon's Forecast: {aiForecastModule.amazon.vsAmazonForecast}</p>
                        )}
                      </div>
                      <div className="bg-slate-800/50 rounded-xl p-4">
                        <p className="text-slate-400 text-sm mb-2">Recommendations</p>
                        <ul className="space-y-1">
                          {(aiForecastModule.amazon.recommendations || []).map((rec, i) => (
                            <li key={i} className="text-slate-300 text-sm flex items-start gap-2">
                              <span className="text-orange-400">•</span>{rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Store className="w-12 h-12 text-orange-400/30 mx-auto mb-3" />
                    <p className="text-slate-400">Generate an Amazon-specific forecast to see detailed channel predictions</p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* SHOPIFY CHANNEL TAB */}
          {forecastTab === 'shopify' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-green-900/30 via-slate-800 to-emerald-900/20 rounded-2xl border border-green-500/30 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-green-400">Shopify/DTC Forecast</h3>
                    <p className="text-slate-400 text-sm">AI prediction specifically for your direct-to-consumer sales</p>
                  </div>
                  <button 
                    onClick={() => generateChannelForecastAI('shopify')}
                    disabled={aiForecastModule.loading === 'shopify'}
                    className="px-6 py-3 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 rounded-xl text-white font-medium flex items-center gap-2"
                  >
                    {aiForecastModule.loading === 'shopify' ? <><Loader2 className="w-5 h-5 animate-spin" />Analyzing...</> : <><Zap className="w-5 h-5" />Generate Shopify Forecast</>}
                  </button>
                </div>
                
                {aiForecastModule.shopify ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-slate-800/70 rounded-xl p-4 border border-green-500/20">
                        <p className="text-slate-400 text-sm mb-1">Next Week Revenue</p>
                        <p className="text-2xl font-bold text-white">{formatCurrency(aiForecastModule.shopify.nextWeek?.revenue?.expected || 0)}</p>
                      </div>
                      <div className="bg-slate-800/70 rounded-xl p-4 border border-green-500/20">
                        <p className="text-slate-400 text-sm mb-1">Next Week Profit</p>
                        <p className={`text-2xl font-bold ${(aiForecastModule.shopify.nextWeek?.profit?.expected || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {formatCurrency(aiForecastModule.shopify.nextWeek?.profit?.expected || 0)}
                        </p>
                      </div>
                      <div className="bg-slate-800/70 rounded-xl p-4 border border-green-500/20">
                        <p className="text-slate-400 text-sm mb-1">Monthly Projection</p>
                        <p className="text-2xl font-bold text-white">{formatCurrency(aiForecastModule.shopify.nextMonth?.revenue || 0)}</p>
                      </div>
                    </div>
                    
                    <div className="bg-slate-800/50 rounded-xl p-4">
                      <p className="text-slate-300 text-sm">{aiForecastModule.shopify.reasoning}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(aiForecastModule.shopify.insights || []).map((insight, i) => (
                          <span key={i} className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">{insight}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <ShoppingBag className="w-12 h-12 text-green-400/30 mx-auto mb-3" />
                    <p className="text-slate-400">Generate a Shopify-specific forecast to see detailed DTC predictions</p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* INVENTORY TAB */}
          {forecastTab === 'inventory' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-amber-900/30 via-slate-800 to-yellow-900/20 rounded-2xl border border-amber-500/30 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-amber-400">Inventory Forecast & Reorder</h3>
                    <p className="text-slate-400 text-sm">AI analyzes stock levels, velocity, and lead times to recommend reorders</p>
                  </div>
                  <button 
                    onClick={generateInventoryAI}
                    disabled={aiForecastModule.loading === 'inventory'}
                    className="px-6 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 rounded-xl text-white font-medium flex items-center gap-2"
                  >
                    {aiForecastModule.loading === 'inventory' ? <><Loader2 className="w-5 h-5 animate-spin" />Analyzing...</> : <><Zap className="w-5 h-5" />Analyze Inventory</>}
                  </button>
                </div>
                
                {/* Lead Time Settings Reminder */}
                <div className="bg-slate-800/50 rounded-lg p-3 mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-slate-300 text-sm">
                      Lead Time: <span className="text-amber-400 font-medium">{leadTimeSettings.defaultLeadTimeDays} days</span>
                      <span className="text-slate-500 mx-2">•</span>
                      Target Buffer: <span className="text-amber-400 font-medium">{leadTimeSettings.reorderTriggerDays || 60} days</span>
                      <span className="text-slate-500 mx-2">•</span>
                      Min Order: <span className="text-amber-400 font-medium">{leadTimeSettings.minOrderWeeks || 22} weeks</span>
                    </p>
                    <p className="text-slate-500 text-xs">Order when stock = {(leadTimeSettings.reorderTriggerDays || 60) + (leadTimeSettings.defaultLeadTimeDays || 14)} days supply, so shipment arrives at {leadTimeSettings.reorderTriggerDays || 60} days</p>
                  </div>
                  <button onClick={() => setForecastTab('settings')} className="text-xs text-amber-400 hover:text-amber-300">Edit Settings →</button>
                </div>
                
                {aiForecastModule.inventory ? (
                  <div className="space-y-4">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-rose-900/30 rounded-xl p-4 border border-rose-500/30">
                        <p className="text-rose-400 text-sm">Critical</p>
                        <p className="text-3xl font-bold text-white">{aiForecastModule.inventory.summary?.criticalCount || 0}</p>
                      </div>
                      <div className="bg-amber-900/30 rounded-xl p-4 border border-amber-500/30">
                        <p className="text-amber-400 text-sm">Need Reorder</p>
                        <p className="text-3xl font-bold text-white">{aiForecastModule.inventory.summary?.reorderCount || 0}</p>
                      </div>
                      <div className="bg-emerald-900/30 rounded-xl p-4 border border-emerald-500/30">
                        <p className="text-emerald-400 text-sm">Healthy</p>
                        <p className="text-3xl font-bold text-white">{aiForecastModule.inventory.summary?.healthyCount || 0}</p>
                      </div>
                      <div className="bg-slate-800 rounded-xl p-4 border border-slate-600">
                        <p className="text-slate-400 text-sm">Total Value (AI est.)</p>
                        <p className="text-2xl font-bold text-white">{formatCurrency(aiForecastModule.inventory.summary?.totalValue || 0)}</p>
                        <p className="text-slate-500 text-xs">See Inventory for precise</p>
                      </div>
                    </div>
                    
                    {/* Alerts */}
                    {aiForecastModule.inventory.alerts && aiForecastModule.inventory.alerts.length > 0 && (
                      <div className="bg-rose-900/20 border border-rose-500/30 rounded-xl p-4">
                        <h4 className="text-rose-400 font-medium mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Urgent Alerts</h4>
                        <ul className="space-y-1">
                          {aiForecastModule.inventory.alerts.map((alert, i) => (
                            <li key={i} className="text-white text-sm">• {alert}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {/* Recommendations */}
                    {aiForecastModule.inventory.recommendations && (
                      <div className="bg-slate-800/50 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-white font-medium">Reorder Recommendations</h4>
                          <span className="text-slate-400 text-sm">{aiForecastModule.inventory.recommendations.length} products</span>
                        </div>
                        <div className="space-y-2 max-h-[600px] overflow-y-auto">
                          {aiForecastModule.inventory.recommendations.map((rec, i) => (
                            <div key={i} className={`p-3 rounded-lg ${
                              rec.urgency === 'critical' ? 'bg-rose-900/30 border border-rose-500/30' :
                              rec.urgency === 'low' ? 'bg-amber-900/30 border border-amber-500/30' :
                              rec.urgency === 'overstock' ? 'bg-cyan-900/20 border border-cyan-500/20' :
                              'bg-emerald-900/20 border border-emerald-500/20'
                            }`}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-white font-medium">{savedProductNames[rec.sku] || rec.name || rec.sku}</span>
                                <span className={`text-xs px-2 py-1 rounded ${
                                  rec.urgency === 'critical' ? 'bg-rose-500 text-white' :
                                  rec.urgency === 'low' ? 'bg-amber-500 text-white' :
                                  rec.urgency === 'overstock' ? 'bg-cyan-500/50 text-cyan-100' :
                                  'bg-emerald-500/50 text-emerald-100'
                                }`}>{rec.urgency}</span>
                              </div>
                              <p className="text-slate-400 text-sm">{rec.action}</p>
                              <div className="flex flex-wrap gap-3 mt-2 text-xs">
                                <span className="text-slate-500">Stock: {rec.currentStock}</span>
                                <span className="text-slate-500">Velocity: {rec.weeklyVelocity?.toFixed(1)}/wk</span>
                                <span className="text-slate-500">DOS: {rec.daysOfSupply} days</span>
                                <span className="text-slate-500">Lead: {rec.leadTimeDays} days</span>
                                {rec.suggestedOrderQty && <span className="text-amber-400 font-medium">Order: {rec.suggestedOrderQty} units</span>}
                                {rec.stockoutDate && <span className="text-rose-400">Stockout: {rec.stockoutDate}</span>}
                              </div>
                              {rec.pendingProduction && (
                                <p className="text-cyan-400 text-xs mt-1">📦 {rec.pendingProduction} units arriving {rec.pendingArrivalDate}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Insights */}
                    {aiForecastModule.inventory.insights && (
                      <div className="bg-slate-800/30 rounded-xl p-4">
                        <p className="text-slate-300 text-sm">{aiForecastModule.inventory.insights}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Boxes className="w-12 h-12 text-amber-400/30 mx-auto mb-3" />
                    <p className="text-slate-400">Analyze your inventory to get AI-powered reorder recommendations</p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* COMPARISON TAB */}
          {forecastTab === 'comparison' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-cyan-900/30 via-slate-800 to-blue-900/20 rounded-2xl border border-cyan-500/30 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-cyan-400">AI vs Amazon Forecast Comparison</h3>
                    <p className="text-slate-400 text-sm">Compare our AI predictions against Amazon's forecasts to see accuracy</p>
                  </div>
                  <button 
                    onClick={generateForecastComparisonAI}
                    disabled={aiForecastModule.loading === 'comparison'}
                    className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 rounded-xl text-white font-medium flex items-center gap-2"
                  >
                    {aiForecastModule.loading === 'comparison' ? <><Loader2 className="w-5 h-5 animate-spin" />Analyzing...</> : <><Zap className="w-5 h-5" />Compare Forecasts</>}
                  </button>
                </div>
                
                {/* Data Requirements Check */}
                {(() => {
                  // Check what data we have for comparison
                  const forecastWeeks = Object.keys(amazonForecasts || {});
                  const actualWeeks = Object.keys(allWeeksData || {}).filter(k => (allWeeksData[k]?.amazon?.revenue || 0) > 0);
                  const overlappingWeeks = forecastWeeks.filter(w => actualWeeks.includes(w));
                  const weeksWithBothData = overlappingWeeks.filter(w => {
                    const actual = allWeeksData[w]?.amazon?.revenue || 0;
                    const forecast = amazonForecasts[w]?.totals?.sales || amazonForecasts[w]?.totalSales || 0;
                    return actual > 0 && forecast > 0;
                  });
                  
                  if (forecastWeeks.length === 0) {
                    return (
                      <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4 mb-4">
                        <p className="text-amber-400 font-medium mb-1">📊 No Amazon forecasts uploaded yet</p>
                        <p className="text-slate-400 text-sm">Upload Amazon forecast files to enable comparison. Go to Upload → Forecast tab.</p>
                      </div>
                    );
                  }
                  
                  if (weeksWithBothData.length === 0) {
                    const nextComparisonWeek = forecastWeeks.sort()[0];
                    return (
                      <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4 mb-4">
                        <p className="text-blue-400 font-medium mb-1">⏳ Waiting for actual data to compare</p>
                        <p className="text-slate-400 text-sm mb-2">
                          You have {forecastWeeks.length} week(s) of Amazon forecasts. 
                          Comparison will be available once those weeks have actual sales data.
                        </p>
                        <p className="text-slate-500 text-xs">
                          Forecast weeks: {forecastWeeks.slice(0, 3).map(w => new Date(w + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })).join(', ')}
                          {forecastWeeks.length > 3 && ` +${forecastWeeks.length - 3} more`}
                        </p>
                      </div>
                    );
                  }
                  
                  return (
                    <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4 mb-4">
                      <p className="text-emerald-400 font-medium mb-1">✓ Ready to compare: {weeksWithBothData.length} week(s) with both forecast and actual data</p>
                      <p className="text-slate-400 text-sm">Click "Compare Forecasts" to analyze accuracy.</p>
                    </div>
                  );
                })()}
                
                {aiForecastModule.comparison ? (
                  <div className="space-y-4">
                    {/* Accuracy Comparison */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-orange-900/20 border border-orange-500/30 rounded-xl p-4">
                        <h4 className="text-orange-400 font-medium mb-3">Amazon Forecast Accuracy</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Avg Revenue Error</span>
                            <span className={`font-medium ${Math.abs(aiForecastModule.comparison.amazonAccuracy?.averageRevenueError || 0) < 15 ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {(aiForecastModule.comparison.amazonAccuracy?.averageRevenueError || 0).toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Avg Units Error</span>
                            <span className="text-white font-medium">{(aiForecastModule.comparison.amazonAccuracy?.averageUnitsError || 0).toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Bias</span>
                            <span className="text-white">{aiForecastModule.comparison.amazonAccuracy?.bias}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Consistency</span>
                            <span className="text-white">{aiForecastModule.comparison.amazonAccuracy?.consistency}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-purple-900/20 border border-purple-500/30 rounded-xl p-4">
                        <h4 className="text-purple-400 font-medium mb-3">Our AI Accuracy</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Avg Error</span>
                            <span className="text-white font-medium">
                              {aiForecastModule.comparison.aiAccuracy?.averageError !== null 
                                ? `${aiForecastModule.comparison.aiAccuracy.averageError.toFixed(1)}%` 
                                : 'Learning...'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">vs Amazon</span>
                            <span className={`font-medium ${
                              aiForecastModule.comparison.aiAccuracy?.improvement === 'better than Amazon' ? 'text-emerald-400' :
                              aiForecastModule.comparison.aiAccuracy?.improvement === 'similar' ? 'text-cyan-400' :
                              'text-amber-400'
                            }`}>
                              {aiForecastModule.comparison.aiAccuracy?.improvement}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Recommended Corrections */}
                    <div className="bg-slate-800/50 rounded-xl p-4">
                      <h4 className="text-white font-medium mb-3">Recommended Corrections (Apply to Amazon Forecasts)</h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-slate-400 text-sm">Revenue Multiplier</p>
                          <p className="text-xl font-bold text-cyan-400">{(aiForecastModule.comparison.recommendedCorrection?.revenue || 1).toFixed(3)}x</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-sm">Units Multiplier</p>
                          <p className="text-xl font-bold text-cyan-400">{(aiForecastModule.comparison.recommendedCorrection?.units || 1).toFixed(3)}x</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-sm">Confidence</p>
                          <p className="text-xl font-bold text-white">{aiForecastModule.comparison.recommendedCorrection?.confidence || 0}%</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Patterns & Insights */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-slate-800/30 rounded-xl p-4">
                        <p className="text-slate-400 text-sm mb-2">Patterns Detected</p>
                        <ul className="space-y-1">
                          {(aiForecastModule.comparison.patterns || []).map((pattern, i) => (
                            <li key={i} className="text-slate-300 text-sm">• {pattern}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="bg-slate-800/30 rounded-xl p-4">
                        <p className="text-slate-400 text-sm mb-2">Recommendations</p>
                        <ul className="space-y-1">
                          {(aiForecastModule.comparison.recommendations || []).map((rec, i) => (
                            <li key={i} className="text-slate-300 text-sm">• {rec}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    
                    <div className="bg-slate-800/20 rounded-xl p-4">
                      <p className="text-slate-300 text-sm">{aiForecastModule.comparison.insights}</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <BarChart3 className="w-12 h-12 text-cyan-400/30 mx-auto mb-3" />
                    <p className="text-slate-400">Compare our AI predictions against Amazon's forecasts to improve accuracy</p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* SETTINGS TAB */}
          {forecastTab === 'settings' && (
            <div className="space-y-6">
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
                <h3 className="text-xl font-semibold text-white mb-4">Lead Time Settings</h3>
                <p className="text-slate-400 text-sm mb-6">Configure production lead times so AI can calculate accurate reorder points</p>
                
                {/* Default Lead Time */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Default Lead Time (days)</label>
                    <input 
                      type="number"
                      value={leadTimeSettings.defaultLeadTimeDays}
                      onChange={(e) => setLeadTimeSettings(prev => ({ ...prev, defaultLeadTimeDays: parseInt(e.target.value) || 14 }))}
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white"
                      min="1"
                    />
                    <p className="text-slate-500 text-xs mt-1">Average time from order to delivery for most products</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Reorder Buffer (days)</label>
                    <input 
                      type="number"
                      value={leadTimeSettings.reorderBuffer}
                      onChange={(e) => setLeadTimeSettings(prev => ({ ...prev, reorderBuffer: parseInt(e.target.value) || 7 }))}
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white"
                      min="0"
                    />
                    <p className="text-slate-500 text-xs mt-1">Extra safety margin added to lead time for reorder alerts</p>
                  </div>
                </div>
                
                {/* Reorder Strategy Settings */}
                <div className="border-t border-slate-700 pt-6 mb-6">
                  <h4 className="text-white font-medium mb-2">Reorder Strategy</h4>
                  <p className="text-slate-400 text-sm mb-4">Configure when to reorder and how much to order</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Target Inventory Buffer (days)</label>
                      <input 
                        type="number"
                        value={leadTimeSettings.reorderTriggerDays || 60}
                        onChange={(e) => setLeadTimeSettings(prev => ({ ...prev, reorderTriggerDays: parseInt(e.target.value) || 60 }))}
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white"
                        min="14"
                      />
                      <p className="text-slate-500 text-xs mt-1">New shipment should arrive when stock reaches this many days of supply</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Minimum Order Size (weeks of supply)</label>
                      <input 
                        type="number"
                        value={leadTimeSettings.minOrderWeeks || 22}
                        onChange={(e) => setLeadTimeSettings(prev => ({ ...prev, minOrderWeeks: parseInt(e.target.value) || 22 }))}
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white"
                        min="4"
                      />
                      <p className="text-slate-500 text-xs mt-1">Order at least this many weeks of supply ({Math.round((leadTimeSettings.minOrderWeeks || 22) / 4.3)} months)</p>
                    </div>
                  </div>
                  
                  {/* Visual explanation */}
                  <div className="mt-4 bg-slate-900/50 rounded-lg p-4">
                    <p className="text-slate-300 text-sm">
                      <span className="text-amber-400 font-medium">How it works:</span> Place order when Days of Supply = {(leadTimeSettings.reorderTriggerDays || 60) + (leadTimeSettings.defaultLeadTimeDays || 14)} days (Target Buffer {leadTimeSettings.reorderTriggerDays || 60} + Lead Time {leadTimeSettings.defaultLeadTimeDays || 14})
                    </p>
                    <p className="text-slate-400 text-xs mt-1">
                      This ensures your new shipment arrives when you still have {leadTimeSettings.reorderTriggerDays || 60} days of inventory left.
                    </p>
                  </div>
                </div>
                
                {/* SKU-Specific Lead Times */}
                <div className="border-t border-slate-700 pt-6">
                  <h4 className="text-white font-medium mb-4">SKU-Specific Lead Times</h4>
                  <p className="text-slate-400 text-sm mb-4">Override default lead time for specific products (e.g., items shipped from overseas)</p>
                  
                  {Object.keys(leadTimeSettings.skuLeadTimes || {}).length > 0 && (
                    <div className="space-y-2 mb-4">
                      {Object.entries(leadTimeSettings.skuLeadTimes).map(([sku, days]) => (
                        <div key={sku} className="flex items-center justify-between bg-slate-900/50 rounded-lg p-3">
                          <div>
                            <span className="text-white font-medium">{savedProductNames[sku] || sku}</span>
                            <span className="text-slate-500 text-sm ml-2">({sku})</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-amber-400 font-medium">{days} days</span>
                            <button 
                              onClick={() => {
                                const updated = { ...leadTimeSettings.skuLeadTimes };
                                delete updated[sku];
                                setLeadTimeSettings(prev => ({ ...prev, skuLeadTimes: updated }));
                              }}
                              className="text-slate-500 hover:text-rose-400"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Add New SKU Lead Time */}
                  <div className="bg-slate-900/50 rounded-xl p-4">
                    <p className="text-slate-400 text-sm mb-3">Add SKU-specific lead time:</p>
                    <div className="flex gap-3">
                      <select 
                        id="sku-lead-time-select"
                        className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white"
                        defaultValue=""
                      >
                        <option value="">Select SKU...</option>
                        {Object.keys(savedCogs).filter(sku => !leadTimeSettings.skuLeadTimes?.[sku]).slice(0, 50).map(sku => (
                          <option key={sku} value={sku}>{savedProductNames[sku] || sku}</option>
                        ))}
                      </select>
                      <input 
                        type="number"
                        id="sku-lead-time-days"
                        placeholder="Days"
                        className="w-24 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white"
                        min="1"
                      />
                      <button 
                        onClick={() => {
                          const select = document.getElementById('sku-lead-time-select');
                          const daysInput = document.getElementById('sku-lead-time-days');
                          if (select.value && daysInput.value) {
                            setLeadTimeSettings(prev => ({
                              ...prev,
                              skuLeadTimes: { ...prev.skuLeadTimes, [select.value]: parseInt(daysInput.value) }
                            }));
                            select.value = '';
                            daysInput.value = '';
                          }
                        }}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Learning Data */}
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
                <h3 className="text-xl font-semibold text-white mb-4">AI Learning Data</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-slate-900/50 rounded-xl p-4">
                    <p className="text-slate-400 text-sm">Total Predictions</p>
                    <p className="text-2xl font-bold text-white">{aiLearningHistory.predictions?.length || 0}</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-xl p-4">
                    <p className="text-slate-400 text-sm">Verified with Actuals</p>
                    <p className="text-2xl font-bold text-emerald-400">{aiLearningHistory.predictions?.filter(p => p.actual !== undefined).length || 0}</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-xl p-4">
                    <p className="text-slate-400 text-sm">Self-Learning Samples</p>
                    <p className="text-2xl font-bold text-cyan-400">{forecastCorrections.samplesUsed || 0}</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-xl p-4">
                    <p className="text-slate-400 text-sm">Learning Confidence</p>
                    <p className="text-2xl font-bold text-purple-400">{(forecastCorrections.confidence || 0).toFixed(0)}%</p>
                  </div>
                </div>
                <p className="text-slate-500 text-sm">AI continuously learns from every upload. The more data you add, the more accurate predictions become.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );

};

export default ForecastView;
