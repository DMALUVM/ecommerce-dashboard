// AI Chat System Prompt Builder - Token-Optimized v2
// Builds comprehensive system prompt from business context + deps
// ~45% reduction from v1: deduplication, compact formats, merged sections

import { hasDailySalesData } from './date';

export const buildChatSystemPrompt = (ctx, deps) => {
  const {
    allDaysData, allWeeksData, sortedDays, savedProductNames,
    amazonCampaigns, amazonForecasts, forecastMeta,
    threeplLedger, goals, bankingData,
    productionPipeline, forecastAccuracy,
    forecastCorrections, alertsSummary, notesData,
    forecastData, multiSignalForecast,
    forecastAccuracyMetrics, mlTrainingData, pendingForecasts,
    invoices, upcomingAmazonForecasts, getAmazonForecastComparison,
  } = deps;

  // Helper: safely evaluate template sections
  const safe = (fn, fallback = '', label = '') => {
    try { return fn(); } catch (e) {
      console.warn(`[aiPrompt${label ? ': ' + label : ''}]`, e.message);
      return fallback;
    }
  };

  // Helper: safe number formatter
  const f = (v, d = 2) => (Number(v) || 0).toFixed(d);

  // Ensure critical nested objects exist
  if (!ctx.insights) ctx.insights = {};
  if (!ctx.insights.recentVsPrior) ctx.insights.recentVsPrior = {};
  if (!ctx.dataRange) ctx.dataRange = {};
  if (!ctx.unifiedMetrics) ctx.unifiedMetrics = {};
  if (!ctx.unifiedMetrics.averages) ctx.unifiedMetrics.averages = {};
  if (!ctx.unifiedMetrics.allTime) ctx.unifiedMetrics.allTime = {};

  // === COMPACT HELPERS ===
  // Build compact category string
  const compactCats = (cats) => {
    if (!cats || typeof cats !== 'object') return 'No data';
    return Object.entries(cats)
      .sort(([,a], [,b]) => (b.revenue || b.totalRevenue || 0) - (a.revenue || a.totalRevenue || 0))
      .map(([cat, d]) => {
        const rev = d.revenue || d.totalRevenue || 0;
        const units = d.units || d.totalUnits || 0;
        const extra = d.amazonUnits !== undefined ? ` (AMZ:${d.amazonUnits}, Shop:${d.shopifyUnits})` : '';
        return `${cat}: $${f(rev, 0)} ${units}u${extra}`;
      })
      .join(' | ');
  };

  // Build compact timeframe block
  const tfBlock = (label, data) => {
    if (!data) return '';
    return `[${label}] ${data.dateRange || data.weekLabel || data.weekEnding || ''}: Rev $${f(data.totalRevenue, 0)}, Profit $${f(data.totalProfit, 0)}, ${data.totalUnits || 0}u | ${compactCats(data.byCategory)}`;
  };

  return `
You are an expert e-commerce analyst for "${ctx.storeName}".
Data: ${ctx.dataRange.weeksTracked || 0} weeks (${ctx.dataRange.oldestWeek || 'N/A'} to ${ctx.dataRange.newestWeek || 'N/A'})

=== RULES ===
- Amazon "Net Proceeds" IS profit (COGS, fees, ad spend already deducted). Do NOT double-count.
- Shopify profit = Revenue - COGS - 3PL - Ad Spend (Meta + Google)
- For timeframe questions use PRE-COMPUTED TIMEFRAME DATA, not skuAnalysis (which is all-time)
- For current month use CUSTOM DATE RANGE section
- For all-time use UNIFIED TOTALS
- Always resolve product names to SKU codes internally; show both in responses
- SKU-level data includes .byPeriod[period] and .byWeek[week] for historical drill-down
- For category questions: find SKUs in skusByCategory, aggregate from skuMasterData
- Format currency as $X,XXX.XX. Be concise, reference specific numbers.
${ctx.dataAvailability?.instructions || ''}

=== DATA STATUS ===
Amazon: ${ctx.dataAvailability?.amazon?.dailyDataDates || 0}d daily, ${ctx.dataAvailability?.amazon?.periodDataCount || 0} periods${ctx.dataAvailability?.amazon?.hasDailyGaps ? ' (GAPS covered by monthly data - missing daily != $0)' : ''}
Shopify: ${ctx.dataAvailability?.shopify?.dailyDataDates || 0}d daily
Daily days: ${Object.keys(allDaysData || {}).length} | Latest: ${sortedDays[sortedDays.length - 1] || 'none'}

=== UNIFIED TOTALS ===
${ctx.unifiedMetrics ? `AMZ: $${f(ctx.unifiedMetrics.allTime?.amazon?.revenue, 0)} | Shop: $${f(ctx.unifiedMetrics.allTime?.shopify?.revenue, 0)} | TOTAL: $${f(ctx.unifiedMetrics.allTime?.total?.revenue, 0)} rev, $${f(ctx.unifiedMetrics.allTime?.total?.profit, 0)} profit
By Year: ${Object.entries(ctx.unifiedMetrics.byYear || {}).map(([y, d]) => `${y}: AMZ $${f(d.amazon?.revenue, 0)}, Shop $${f(d.shopify?.revenue, 0)}, Total $${f(d.total?.revenue, 0)}`).join(' | ')}
Averages: $${f(ctx.unifiedMetrics.averages?.dailyRevenue?.total, 0)}/d (${ctx.unifiedMetrics.averages?.dailyRevenue?.daysUsed || 0}d), $${f(ctx.unifiedMetrics.averages?.weeklyRevenue?.total, 0)}/w (${ctx.unifiedMetrics.averages?.weeklyRevenue?.weeksUsed || 0}w), $${f(ctx.unifiedMetrics.averages?.monthlyRevenue?.total, 0)}/m` : 'Unified metrics not available'}
Margin: ${f(ctx.insights.overallMargin, 1)}% | $/Unit: $${f(ctx.insights.overallProfitPerUnit)} | Units: ${ctx.insights.allTimeUnits || 0}
Trend (4w vs prior): Rev $${f(ctx.insights.recentVsPrior.recentRevenue, 0)} vs $${f(ctx.insights.recentVsPrior.priorRevenue, 0)} (${f(ctx.insights.recentVsPrior.revenueChange, 1)}%) | Profit ${f(ctx.insights.recentVsPrior.profitChange, 1)}% | 7d trend: ${f(ctx.dailyTrend, 1)}%

=== GOALS ===
Weekly: Rev $${ctx.goals.weeklyRevenue || 0}, Profit $${ctx.goals.weeklyProfit || 0} | Monthly: Rev $${ctx.goals.monthlyRevenue || 0}, Profit $${ctx.goals.monthlyProfit || 0}
${ctx.goals.weeklyRevenue > 0 && ctx.weeklyData?.length > 0 ? `Last Week: ${ctx.weeklyData[ctx.weeklyData.length-1]?.totalRevenue >= ctx.goals.weeklyRevenue ? 'MET' : 'MISSED'}` : ''}

=== ALERTS ===
${(alertsSummary || []).length > 0 ? (alertsSummary || []).join('\n') : 'None'}

=== PRODUCT CATALOG ===
${ctx.productCatalog?.slice(0, 20).map(p => `"${p.name.substring(0, 40)}" > ${p.sku} [${p.category}]`).join('\n') || 'No catalog'}
By Category: ${Object.entries(ctx.skusByCategory || {}).map(([cat, skus]) => `${cat}: ${skus.join(', ')}`).join(' | ') || 'None'}

=== TOP SKUs (all-time) ===
${ctx.skuMasterData?.slice(0, 20).map(s => 
  `${s.sku}: "${(s.name || '').substring(0, 35)}" [${s.category}] $${f(s.totalRevenue, 0)} ${s.totalUnits}u`
).join('\n') || 'No SKU data'}

${safe(() => {
  const cats = {};
  ctx.skuMasterData?.forEach(s => {
    if (!cats[s.category]) cats[s.category] = { revenue: 0, units: 0, n: 0 };
    cats[s.category].revenue += s.totalRevenue;
    cats[s.category].units += s.totalUnits;
    cats[s.category].n++;
  });
  return 'Totals: ' + Object.entries(cats).sort(([,a], [,b]) => b.revenue - a.revenue)
    .map(([c, d]) => `${c}: $${f(d.revenue, 0)} ${d.units}u (${d.n} SKUs)`).join(' | ');
})}

Declining SKUs: ${JSON.stringify(ctx.decliningSkus || [])}
Improving SKUs: ${JSON.stringify(ctx.improvingSkus || [])}

=== PRE-COMPUTED TIMEFRAMES ===
${tfBlock('LAST WEEK', ctx.lastWeekByCategory)}
${tfBlock('LAST 2WK', ctx.last2WeeksByCategory)}
${tfBlock('LAST 4WK', ctx.last4WeeksByCategory)}
${ctx.currentMonthByCategory ? `[MTD] ${ctx.currentMonthByCategory.dateRange || ''} (${ctx.currentMonthByCategory.dataSource}): AMZ $${f(ctx.currentMonthByCategory.amazonRevenue, 0)} ${ctx.currentMonthByCategory.amazonUnits || 0}u | Shop $${f(ctx.currentMonthByCategory.shopifyRevenue, 0)} ${ctx.currentMonthByCategory.shopifyUnits || 0}u | Total $${f(ctx.currentMonthByCategory.totalRevenue, 0)} ${ctx.currentMonthByCategory.totalUnits || 0}u
Cat: ${compactCats(ctx.currentMonthByCategory.byCategory)}
Top SKUs: ${(ctx.currentMonthByCategory.bySku || []).slice(0, 10).map(s => `${s.sku}(${s.channel}):${s.units}u`).join(', ')}` : 'No MTD'}
${tfBlock('ALL TIME', ctx.allTimeByCategory)}

=== CURRENT MONTH DAILY AGGREGATION ===
${safe(() => {
  const now = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const days = sortedDays.filter(d => d.startsWith(prefix));
  if (days.length === 0) return 'No daily data for current month';
  const skuTotals = {};
  let amzT = 0, shopT = 0;
  days.forEach(dk => {
    const dd = allDaysData[dk];
    if (!dd) return;
    (dd.amazon?.skuData || []).forEach(s => {
      const sku = s.sku || s.msku || '', u = s.unitsSold || s.units || 0;
      if (!skuTotals[sku]) skuTotals[sku] = { a: 0, s: 0, name: savedProductNames[sku] || s.name || sku };
      skuTotals[sku].a += u; amzT += u;
    });
    (dd.shopify?.skuData || []).forEach(s => {
      const sku = s.sku || '', u = s.unitsSold || s.units || 0;
      if (!skuTotals[sku]) skuTotals[sku] = { a: 0, s: 0, name: savedProductNames[sku] || s.name || sku };
      skuTotals[sku].s += u; shopT += u;
    });
  });
  const top = Object.entries(skuTotals).sort((a, b) => (b[1].a + b[1].s) - (a[1].a + a[1].s)).slice(0, 15);
  const mn = now.toLocaleString('en-US', { month: 'long' });
  return `${mn} 1-${days[days.length - 1]?.split('-')[2] || ''} (${days.length}d): AMZ ${amzT}u, Shop ${shopT}u\n${top.map(([sku, d]) => `  ${sku}: AMZ ${d.a}, Shop ${d.s}, Total ${d.a + d.s}`).join('\n')}`;
})}

=== DAILY DATA (14d) ===
${ctx.dailyData?.length > 0 ? JSON.stringify(ctx.dailyData) : 'None'}

=== DOW PATTERNS ===
${ctx.dayOfWeekPatterns && Object.keys(ctx.dayOfWeekPatterns).length > 0 ? JSON.stringify(ctx.dayOfWeekPatterns) : 'Insufficient data'}

=== WEEKLY DATA (8w) ===
${JSON.stringify((ctx.weeklyData || []).slice().reverse().slice(0, 8))}

=== PERIODS ===
${ctx.periodData.length > 0 ? `${ctx.periodData.filter(p => p.totalRevenue > 0).length} periods
2025 Mo: ${ctx.periodData.filter(p => (p.period.includes('2025') || p.period.includes('-2025')) && p.type === 'monthly' && p.totalRevenue > 0).map(p => `${p.period}: $${f(p.totalRevenue, 0)} ${p.totalUnits}u ${f(p.margin, 1)}%`).join(' | ') || 'None'}
2024 Qtr: ${ctx.periodData.filter(p => (p.period.includes('2024') || p.period.includes('-2024')) && p.type === 'quarterly' && p.totalRevenue > 0).map(p => `${p.period}: $${f(p.totalRevenue, 0)} ${p.totalUnits}u`).join(' | ') || 'None'}` : 'No period data'}

=== SEASONALITY ===
${ctx.yoyInsights?.length > 0 ? `YoY: ${JSON.stringify(ctx.yoyInsights)}` : ''}
${ctx.seasonalPatterns ? `Patterns: ${JSON.stringify(ctx.seasonalPatterns.byMonth)}
Avg Mo: $${f(ctx.seasonalPatterns.overallMonthlyAvg, 0)} | Strong: ${ctx.seasonalPatterns.strongMonths?.join(', ') || 'N/A'} | Weak: ${ctx.seasonalPatterns.weakMonths?.join(', ') || 'N/A'}` : 'Insufficient data'}

=== DATA QUALITY ===
${ctx.dataTriangulation ? `Score: ${ctx.dataTriangulation.dataQualityScore}/100 | Multi-source: ${ctx.dataTriangulation.hasMultipleSources ? 'YES' : 'NO'}
${ctx.dataTriangulation.hasMultipleSources && Object.keys(ctx.dataTriangulation.salesVsBanking || {}).length > 0 ? 
  Object.entries(ctx.dataTriangulation.salesVsBanking).slice(-4).map(([m, d]) => 
    `${m}: Sales $${f(d.salesRevenue, 0)} > Bank $${f(d.bankDeposits, 0)} (${f(d.depositRatio * 100, 0)}%)`
  ).join(' | ') : ''}` : ''}

=== NOTES ===
${(notesData || []).length > 0 ? JSON.stringify(notesData) : 'None'}

=== INVENTORY ===
${ctx.inventory ? `${ctx.inventory.asOfDate}: ${ctx.inventory.totalUnits?.toLocaleString() || 0}u, $${ctx.inventory.totalValue?.toLocaleString() || 0}
FBA ${ctx.inventory.amazonUnits?.toLocaleString() || 0} | AWD ${ctx.inventory.awdUnits?.toLocaleString() || 0} | 3PL ${ctx.inventory.threeplUnits?.toLocaleString() || 0} | Inbound ${ctx.inventory.amazonInbound?.toLocaleString() || 0}
Health: Crit ${ctx.inventory.healthBreakdown?.critical || 0}, Low ${ctx.inventory.healthBreakdown?.low || 0}, OK ${ctx.inventory.healthBreakdown?.healthy || 0}, Over ${ctx.inventory.healthBreakdown?.overstock || 0}
Velocity: AMZ ${f(ctx.inventory?.velocityByChannel?.amazonTotal, 0)}/wk, Shop ${f(ctx.inventory?.velocityByChannel?.shopifyTotal, 0)}/wk

URGENT REORDER: ${ctx.inventory?.urgentReorder?.length > 0 ? ctx.inventory.urgentReorder.map(i => `${i.sku}: ${i.daysOverdue}d overdue, Out ${i.stockoutDate}, ${f(i.weeklyVelocity, 1)}/wk, Order ${i.suggestedOrderQty}u`).join(' | ') : 'None'}
REORDER SOON: ${ctx.inventory?.needsReorderSoon?.length > 0 ? ctx.inventory.needsReorderSoon.map(i => `${i.sku}: ${i.daysUntilMustOrder}d, ${i.currentQty}u, ${f(i.weeklyVelocity, 1)}/wk, Lead ${i.leadTimeDays}d`).join(' | ') : 'None'}
CRITICAL: ${ctx.inventory?.criticalItems?.length > 0 ? ctx.inventory.criticalItems.map(i => `${i.sku}: ${i.totalQty}u, ${i.daysOfSupply}d, Out ${i.stockoutDate}`).join(' | ') : 'None'}
LOW: ${ctx.inventory?.lowStockItems?.length > 0 ? ctx.inventory.lowStockItems.slice(0, 8).map(i => `${i.sku}: ${i.totalQty}u, ${i.daysOfSupply}d`).join(' | ') : 'None'}
TOP MOVERS: ${ctx.inventory?.topMovers?.length > 0 ? ctx.inventory.topMovers.map(i => `${i.sku}: ${f(i.weeklyVelocity, 1)}/wk (A${f(i.amazonVelocity, 1)} S${f(i.shopifyVelocity, 1)}), ${i.daysOfSupply}d`).join(' | ') : 'None'}
OVERSTOCK: ${ctx.inventory?.overstockItems?.length > 0 ? ctx.inventory.overstockItems.slice(0, 5).map(i => `${i.sku}: ${i.daysOfSupply}d, ${i.totalQty}u, $${f(i.totalValue, 0)}`).join(' | ') : 'None'}
${ctx.inventory?.velocityTrends?.accelerating?.length > 0 ? `Accelerating: ${ctx.inventory.velocityTrends.accelerating.map(v => `${v.sku}: ${v.trendPercent} (${f(v.priorAvgWeekly, 1)}>${f(v.recentAvgWeekly, 1)}/wk)`).join(', ')}` : ''}
${ctx.inventory?.velocityTrends?.declining?.length > 0 ? `Declining: ${ctx.inventory.velocityTrends.declining.map(v => `${v.sku}: ${v.trendPercent} (${f(v.priorAvgWeekly, 1)}>${f(v.recentAvgWeekly, 1)}/wk)`).join(', ')}` : ''}` : 'No inventory data'}

=== TAX ===
${ctx.salesTax?.nexusStates?.length > 0 ? `Nexus: ${JSON.stringify(ctx.salesTax.nexusStates)}` : 'No nexus'} | Paid: $${f(ctx.salesTax?.totalPaidAllTime, 2)}

=== BILLS ===
${safe(() => {
  const unpaid = (invoices || []).filter(i => !i.paid);
  if (unpaid.length === 0) return 'None';
  return unpaid.map(i => `${i.vendor}: $${f(i.amount, 2)} due ${i.dueDate} (${Math.ceil((new Date(i.dueDate) - new Date()) / 86400000)}d)`).join(' | ');
})}

=== FORECASTS ===
${forecastData ? `Basic: $${f(forecastData.nextMonth?.revenue, 0)}/mo, $${f(forecastData.nextMonth?.profit, 0)} profit, ${forecastData.nextMonth?.units || 0}u, ${forecastData.trend?.revenue || '?'} ${f(forecastData.trend?.revenueChange, 1)}%/wk, Conf ${forecastData.confidence}%` : 'Need 4+ weeks'}
${multiSignalForecast ? `
Multi-Signal (PRIMARY):
Next Wk: $${f(multiSignalForecast.nextWeek?.predictedRevenue, 0)} rev, $${f(multiSignalForecast.nextWeek?.predictedProfit, 0)} profit, ${multiSignalForecast.nextWeek?.predictedUnits || 0}u, Conf ${multiSignalForecast.nextWeek?.confidence || '?'}
4Wk: ${JSON.stringify(multiSignalForecast.next4Weeks)}
Signals: $${f(multiSignalForecast.signals?.dailyAvg7)}/d avg, ${f(multiSignalForecast.signals?.momentum, 1)}% momentum, ${f(((multiSignalForecast.signals?.avgProfitMargin || 0) * 100), 1)}% margin
Data: ${multiSignalForecast.dataPoints?.dailyDays || multiSignalForecast.dataPoints?.daysAnalyzed || 0}d, ${multiSignalForecast.dataPoints?.weeklyWeeks || multiSignalForecast.dataPoints?.weeksAnalyzed || 0}w, ${multiSignalForecast.dataPoints?.amazonForecastWeeks || 0} AMZ wks` : 'Not generated'}

=== FORECAST ACCURACY ===
${forecastAccuracy?.summary ? `Summary: ${forecastAccuracy.summary.samplesWithActuals || 0} samples, Acc ${forecastAccuracy.summary.avgAccuracy || 'N/A'}, Bias ${forecastAccuracy.summary.avgBias || 'N/A'}` : 'No data'}
${forecastAccuracyMetrics ? `Detail: ${f(forecastAccuracyMetrics.avgAccuracy, 1)}% over ${forecastAccuracyMetrics.totalWeeks || 0}w, Beat ${forecastAccuracyMetrics.beatCount || 0}x Miss ${forecastAccuracyMetrics.missedCount || 0}x, Var ${(forecastAccuracyMetrics.avgRevenueVariance || 0) > 0 ? '+' : ''}${f(forecastAccuracyMetrics.avgRevenueVariance, 1)}%, Recent ${f(forecastAccuracyMetrics.recentAccuracy, 1)}%` : ''}
${mlTrainingData ? `ML (${mlTrainingData.summary?.totalSamples || 0}s): ${(mlTrainingData.summary?.bias || 0) > 0 ? 'Under' : 'Over'}-forecasts ${f(Math.abs(mlTrainingData.summary?.bias || 0), 1)}%, Factor ${f(mlTrainingData.summary?.correctionFactor, 3)}x` : ''}
${forecastCorrections?.samplesUsed >= 2 ? `Self-Learn: ${forecastCorrections?.confidence >= 30 ? 'ACTIVE' : 'TRAINING'} ${f(forecastCorrections?.confidence, 0)}% conf, Rev×${f(forecastCorrections?.overall?.revenue, 3)} Units×${f(forecastCorrections?.overall?.units, 3)}` : ''}
${(pendingForecasts || []).length > 0 ? `Pending: ${pendingForecasts.map(pf => `Wk${pf.weekEnding}: $${f(pf.forecast?.totals?.sales || pf.forecast?.totalSales || 0, 0)} (${pf.isPast ? 'needs actuals' : pf.daysUntil + 'd'})`).join(', ')}` : ''}

=== AMAZON FORECASTS ===
${(upcomingAmazonForecasts || []).length > 0 ? upcomingAmazonForecasts.map(af => `Wk${af.weekEnding}: $${f(af.totals?.sales || af.totalSales || 0, 0)} ${af.totals?.units || af.totalUnits || 0}u`).join(' | ') : 'None'}
${(getAmazonForecastComparison || []).length > 0 ? `Accuracy: ${(getAmazonForecastComparison || []).slice(0, 6).map(c => `${c.weekEnding}: F$${f(c.forecast.revenue, 0)}>A$${f(c.actual.revenue, 0)} ${f(c.accuracy, 0)}%`).join(' | ')}` : ''}
${safe(() => {
  const up = Object.entries(amazonForecasts || {}).filter(([w]) => new Date(w) > new Date()).sort((a, b) => a[0].localeCompare(b[0]));
  if (up.length === 0) return '';
  const wks = Object.keys(allWeeksData).sort();
  if (wks.length === 0) return '';
  const revs = wks.map(w => allWeeksData[w]?.total?.revenue || 0);
  const avg = revs.reduce((s, v) => s + v, 0) / revs.length;
  return 'Divergence: ' + up.slice(0, 3).map(([w, fc]) => {
    const r = fc.totals?.sales || 0;
    const d = avg > 0 ? ((r - avg) / avg * 100) : 0;
    return `${w}: AMZ $${f(r, 0)} vs Avg $${f(avg, 0)} (${d > 0 ? '+' : ''}${f(d, 0)}%)`;
  }).join(' | ');
})}

=== PRODUCTION ===
${(productionPipeline || []).length > 0 ? (productionPipeline || []).map(p => 
  `${p.sku}: ${p.quantity}u ETA ${p.expectedDate} (${p.expectedDate ? Math.ceil((new Date(p.expectedDate) - new Date()) / 86400000) : '?'}d) ${p.status}`
).join(' | ') : 'None'}

=== 3PL ===
${safe(() => {
  const orders = Object.values(threeplLedger.orders || {});
  if (orders.length === 0) return 'No data';
  const wks = [...new Set(orders.map(o => o.weekKey))].sort();
  let tc = 0, tu = 0;
  orders.forEach(o => {
    const c = o.charges || {};
    tc += (c.firstPick || 0) + (c.additionalPick || 0) + (c.box || 0) + (c.reBoxing || 0) + (c.fbaForwarding || 0);
    tu += (c.firstPickQty || 0) + (c.additionalPickQty || 0);
  });
  Object.values(threeplLedger.summaryCharges || {}).forEach(c => { tc += c.amount || 0; });
  const recent = wks.slice(-4).map(w => {
    const wo = orders.filter(o => o.weekKey === w);
    let wc = 0;
    wo.forEach(o => { const c = o.charges || {}; wc += (c.firstPick || 0) + (c.additionalPick || 0) + (c.box || 0); });
    return `${w}:${wo.length}o/$${f(wc, 0)}`;
  });
  return `${orders.length} orders, $${f(tc, 0)} total, $${f(orders.length > 0 ? tc / orders.length : 0, 2)}/order, ${tu}u
Recent: ${recent.join(' | ')}`;
})}

=== AMAZON PPC ===
${amazonCampaigns?.campaigns?.length > 0 ? `
${amazonCampaigns.summary?.totalCampaigns || 0} campaigns (${amazonCampaigns.summary?.enabledCount || 0} on, ${amazonCampaigns.summary?.pausedCount || 0} paused) | Updated ${amazonCampaigns.lastUpdated ? new Date(amazonCampaigns.lastUpdated).toLocaleDateString() : '?'}
Spend $${f(amazonCampaigns.summary?.totalSpend || 0, 0)} | Sales $${f(amazonCampaigns.summary?.totalSales || 0, 0)} | ROAS ${f(amazonCampaigns.summary?.roas || 0, 2)}x | ACOS ${f(amazonCampaigns.summary?.acos || 0, 1)}% | CPC $${f(amazonCampaigns.summary?.avgCpc || 0, 2)} | CVR ${f(amazonCampaigns.summary?.convRate || 0, 2)}%
Types: SP ${Array.isArray(amazonCampaigns.summary?.byType?.SP) ? amazonCampaigns.summary.byType.SP.length : 0}($${f(Array.isArray(amazonCampaigns.summary?.byType?.SP) ? amazonCampaigns.summary.byType.SP.reduce((s,c) => s + (c.spend || 0), 0) : 0, 0)}) SB ${Array.isArray(amazonCampaigns.summary?.byType?.SB) ? amazonCampaigns.summary.byType.SB.length : 0}($${f(Array.isArray(amazonCampaigns.summary?.byType?.SB) ? amazonCampaigns.summary.byType.SB.reduce((s,c) => s + (c.spend || 0), 0) : 0, 0)}) SD ${Array.isArray(amazonCampaigns.summary?.byType?.SD) ? amazonCampaigns.summary.byType.SD.length : 0}($${f(Array.isArray(amazonCampaigns.summary?.byType?.SD) ? amazonCampaigns.summary.byType.SD.reduce((s,c) => s + (c.spend || 0), 0) : 0, 0)})

Top 10 Spend:
${amazonCampaigns.campaigns?.slice().sort((a,b) => (b.spend || 0) - (a.spend || 0)).slice(0,10).map(c => 
  `${(c.name || '?').substring(0,40)}: $${f(c.spend || 0, 0)} > $${f(c.sales || 0, 0)} ${f(c.roas || 0, 2)}x ${f(c.acos || 0, 0)}%`
).join('\n')}
Best ROAS (>$100): ${amazonCampaigns.campaigns?.filter(c => c.spend > 100 && c.state === 'ENABLED').sort((a,b) => b.roas - a.roas).slice(0,5).map(c => `${c.name.substring(0,30)}: ${f(c.roas, 2)}x`).join(' | ') || 'None'}
Low ROAS (<2x >$100): ${amazonCampaigns.campaigns?.filter(c => c.spend > 100 && c.roas < 2 && c.state === 'ENABLED').sort((a,b) => a.roas - b.roas).slice(0,5).map(c => `${c.name.substring(0,30)}: ${f(c.roas, 2)}x ${f(c.acos, 0)}%`).join(' | ') || 'OK'}
${amazonCampaigns.history?.length > 1 ? safe(() => {
  const cur = amazonCampaigns.history[0]?.summary, pri = amazonCampaigns.history[1]?.summary;
  if (!cur || !pri) return '';
  return `WoW: Spend ${pri.totalSpend > 0 ? ((cur.totalSpend - pri.totalSpend) / pri.totalSpend * 100).toFixed(1) : 0}%, Sales ${pri.totalSales > 0 ? ((cur.totalSales - pri.totalSales) / pri.totalSales * 100).toFixed(1) : 0}%, ROAS ${f(cur.roas, 2)}x`;
}) : ''}
${amazonCampaigns.analytics?.bestPerformingDay ? `Best day: ${amazonCampaigns.analytics.bestPerformingDay.day} ${f(amazonCampaigns.analytics.bestPerformingDay.avgRoas, 2)}x | Worst: ${amazonCampaigns.analytics.worstPerformingDay?.day} ${f(amazonCampaigns.analytics.worstPerformingDay?.avgRoas, 2)}x` : ''}
${amazonCampaigns.analytics?.monthlyTrends?.length > 0 ? `Monthly: ${amazonCampaigns.analytics.monthlyTrends.slice(-4).map(m => `${m.month}: $${f(m.spend, 0)}>$${f(m.revenue, 0)} ${f(m.roas, 2)}x`).join(' | ')}` : ''}` : 'No PPC data'}

=== DTC ADS ===
${ctx.dailyAdsData ? `7d: Meta $${f(ctx.dailyAdsData.last7Days.metaSpend, 0)} Google $${f(ctx.dailyAdsData.last7Days.googleSpend, 0)} Total $${f(ctx.dailyAdsData.last7Days.totalSpend, 0)} ($${f(ctx.dailyAdsData.last7Days.avgDailySpend, 0)}/d)
30d: Meta $${f(ctx.dailyAdsData.last30Days.metaSpend, 0)} Google $${f(ctx.dailyAdsData.last30Days.googleSpend, 0)} Total $${f(ctx.dailyAdsData.last30Days.totalSpend, 0)}${ctx.dailyAdsData.last30Days.ctr > 0 ? ` CTR ${ctx.dailyAdsData.last30Days.ctr}% CPC $${ctx.dailyAdsData.last30Days.cpc}` : ''}
${ctx.dailyAdsData.byWeek?.length > 0 ? ctx.dailyAdsData.byWeek.map(w => `${w.week}: M$${f(w.metaSpend, 0)} G$${f(w.googleSpend, 0)}`).join(' | ') : ''}` : 'No DTC ads'}

=== AI LEARNING ===
${ctx.aiLearning ? `Rev×${f(ctx.aiLearning.forecastCorrections.revenueMultiplier, 3)} Units×${f(ctx.aiLearning.forecastCorrections.unitsMultiplier, 3)} Conf ${f(ctx.aiLearning.forecastCorrections?.confidence, 0)}% (${ctx.aiLearning.forecastCorrections?.samplesUsed}s)
${ctx.aiLearning.predictionHistory.totalPredictions} predictions, ${ctx.aiLearning.predictionHistory.verifiedPredictions} verified, Acc ${ctx.aiLearning.predictionHistory.recentAccuracy ? f(ctx.aiLearning.predictionHistory.recentAccuracy, 1) + '%' : 'learning'}
${ctx.aiLearning.recentPredictions.length > 0 ? ctx.aiLearning.recentPredictions.map(p => `${p.type}(${p.period}): P$${f(p.predicted, 0)} A$${f(p.actual, 0)} ${p.error ? f(p.error, 1) + '%' : '?'}`).join(' | ') : ''}` : ''}

=== FORECAST STATUS ===
${safe(() => {
  const u = forecastMeta?.lastUploads || {};
  return ['7day', '30day', '60day'].map(t => {
    const l = u[t];
    if (!l) return `${t}:Never`;
    const d = Math.floor((new Date() - new Date(l)) / 86400000);
    return `${t}:${d}d${d >= (t === '7day' ? 7 : t === '30day' ? 30 : 60) ? ' STALE' : ''}`;
  }).join(' | ');
})}

=== BANKING ===
${ctx.banking ? `${ctx.banking.dateRange?.start} to ${ctx.banking.dateRange?.end} | ${ctx.banking.transactionCount} txns
${bankingData?.profitAndLoss?.details ? safe(() => {
  const d = bankingData.profitAndLoss.details;
  const inc = d['Total Income'] || 0, cogs = d['Total Cost of Goods Sold'] || 0, exp = d['Total Expenses'] || 0;
  return `P&L: Income $${inc.toLocaleString()}, COGS $${cogs.toLocaleString()}, Exp $${exp.toLocaleString()}, Net $${(inc - cogs - exp).toLocaleString()}
Expenses: ${Object.entries(d).filter(([k, v]) => typeof v === 'number' && v > 100 && !k.startsWith('Total') && !k.includes('Sales')).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}:$${v.toLocaleString()}`).join(', ')}`;
}) : ''}
Monthly: ${ctx.banking.monthlySnapshots.map(m => `${m.month}: +$${f(m.income, 0)} -$${f(m.expenses, 0)} =$${f(m.net, 0)}`).join(' | ')}
Top Exp: ${ctx.banking.topExpenseCategories.slice(0, 5).map(c => `${c.name}:$${f(c.total, 0)}`).join(', ')}
Income: ${ctx.banking.topIncomeCategories.slice(0, 4).map(c => `${c.name}:$${f(c.total, 0)}`).join(', ')}
Accts: ${ctx.banking.accounts.map(a => `${a.name}: In$${f(a.totalIn, 0)} Out$${f(a.totalOut, 0)}`).join(' | ')}` : 'No banking data'}

=== END ===
Use Multi-Signal forecast as primary prediction. Apply correction factors when confidence >30%. Cross-reference sales with banking when available.`;
};

export default buildChatSystemPrompt;
