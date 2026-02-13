// aiPromptBuilder.js — Extracted system prompt builder from App.jsx
// Builds the massive system prompt for the main AI chat
// Each section is crash-guarded so partial data failures degrade gracefully

import { hasDailySalesData } from './date';

/**
 * Build the chat system prompt from data context.
 * @param {Object} ctx - From prepareDataContext()
 * @param {Object} deps - Additional state deps
 * @returns {string} System prompt for Claude API
 */
export const buildChatSystemPrompt = (ctx, deps) => {
  const {
    allDaysData, allWeeksData, sortedDays, savedProductNames,
    amazonCampaigns, amazonForecasts, forecastMeta,
    threeplLedger, goals, bankingData,
    productionPipeline, forecastAccuracy,
    forecastCorrections, alertsSummary, notesData,
  } = deps;

  // Helper: safely evaluate template sections
  const safe = (fn, fallback = '', label = '') => {
    try { return fn(); } catch (e) {
      console.warn(`[aiPrompt${label ? ': ' + label : ''}]`, e.message);
      return fallback;
    }
  };

  return `
You are an expert e-commerce analyst and business advisor for "${ctx.storeName}". You have access to ALL uploaded sales data and can answer questions about any aspect of the business.

🚨🚨🚨 CRITICAL DATA AVAILABILITY RULES - READ FIRST 🚨🚨🚨

${ctx.dataAvailability?.instructions || ''}

**DATA AVAILABILITY STATUS:**
- Amazon: ${ctx.dataAvailability?.amazon?.dailyDataDates || 0} days of daily data, ${ctx.dataAvailability?.amazon?.periodDataCount || 0} period records
${ctx.dataAvailability?.amazon?.hasDailyGaps ? `  ⚠️ GAPS COVERED BY: ${ctx.dataAvailability.amazon.gapsCoveredBy?.join(', ') || 'monthly data'}` : ''}
- Shopify: ${ctx.dataAvailability?.shopify?.dailyDataDates || 0} days of daily data

**UNIFIED ALL-TIME TOTALS (USE THESE - includes period data):**
${ctx.unifiedMetrics ? `
- Amazon Revenue: $${ctx.unifiedMetrics.allTime?.amazon?.revenue?.toFixed(2) || 0}
- Shopify Revenue: $${ctx.unifiedMetrics.allTime?.shopify?.revenue?.toFixed(2) || 0}
- TOTAL Revenue: $${ctx.unifiedMetrics.allTime?.total?.revenue?.toFixed(2) || 0}
- TOTAL Profit: $${ctx.unifiedMetrics.allTime?.total?.profit?.toFixed(2) || 0}

By Year:
${Object.entries(ctx.unifiedMetrics.byYear || {}).map(([year, data]) => 
  `  ${year}: Amazon $${data.amazon?.revenue?.toFixed(0) || 0} | Shopify $${data.shopify?.revenue?.toFixed(0) || 0} | Total $${data.total?.revenue?.toFixed(0) || 0}`
).join('\n')}

Proper Averages (only from days WITH data):
- Daily Avg Revenue: $${ctx.unifiedMetrics.averages?.dailyRevenue?.total?.toFixed(2) || 0} (from ${ctx.unifiedMetrics.averages?.dailyRevenue?.daysUsed || 0} days with actual data)
- Weekly Avg Revenue: $${ctx.unifiedMetrics.averages?.weeklyRevenue?.total?.toFixed(2) || 0} (from ${ctx.unifiedMetrics.averages?.weeklyRevenue?.weeksUsed || 0} weeks)
- Monthly Avg Revenue: $${ctx.unifiedMetrics.averages?.monthlyRevenue?.total?.toFixed(2) || 0} (from ${ctx.unifiedMetrics.averages?.monthlyRevenue?.monthsUsed || 0} months)
` : 'Unified metrics not available'}

🚨🚨🚨 TIMEFRAME QUERIES - USE PRE-COMPUTED DATA 🚨🚨🚨
When user asks about a TIMEFRAME (last week, last month, etc.) you MUST use the PRE-COMPUTED data below.
DO NOT use skuAnalysis - that's ALL-TIME data and will give WRONG answers for timeframe questions!

| User asks about... | ONLY USE THIS DATA |
|-------------------|-------------------|
| "last week" | lastWeekByCategory (below) |
| "last 2 weeks" | last2WeeksByCategory (below) |
| "last month" / "last 4 weeks" | last4WeeksByCategory (below) |
| "this month" / "January" / "MTD" / "Jan 1-25" | currentMonthByCategory AND/OR CUSTOM DATE RANGE DATA (below) |
| "between X and Y" / specific dates | CUSTOM DATE RANGE DATA (below) |
| "all time" / "total" | allTimeByCategory (below) |

🎯 FOR DATE-SPECIFIC QUESTIONS LIKE "this month so far" or "between X and Y":
→ USE the "CUSTOM DATE RANGE DATA" section below - it has PRE-COMPUTED current month aggregates
→ The data shows EXACT Amazon vs Shopify breakdown by SKU

For category questions (e.g., "how much [product] this month?"):
→ Look up: currentMonthByCategory.byCategory["Category Name"]
→ OR use CUSTOM DATE RANGE DATA for per-SKU breakdown

⚠️ IMPORTANT: currentMonthByCategory has SEPARATE Amazon vs Shopify counts!
→ If user asks "Amazon [product] units", use amazonUnits from the category
→ If user asks "total [product] units", add Amazon + Shopify

⛔ NEVER use skuAnalysis for timeframe questions - it contains ALL-TIME totals
⛔ NEVER sum from skuByWeek array - those are historical weeks
⛔ NEVER use weekly skuData for current month - it may be MISSING Amazon SKU breakdown
✅ ALWAYS use DAILY data aggregates (currentMonthByCategory or CUSTOM DATE RANGE DATA) for current month
✅ ALWAYS use unifiedMetrics for all-time totals (includes period data)
✅ For date range questions → USE CUSTOM DATE RANGE DATA section

IMPORTANT PROFIT CALCULATION NOTES:
- Amazon "Net Proceeds" IS the profit - it already has COGS, fees, and ad spend deducted
- Shopify profit = Revenue - COGS - 3PL Fulfillment Costs - Ad Spend (Meta + Google)
- Do NOT double-count COGS or ad spend when calculating Amazon profit
- When reporting "total profit" always add Amazon Net Proceeds + Shopify calculated profit

STORE: ${ctx.storeName}
DATA RANGE: ${ctx.dataRange.weeksTracked} weeks tracked (${ctx.dataRange.oldestWeek || 'N/A'} to ${ctx.dataRange.newestWeek || 'N/A'})

=== KEY METRICS (All Time) ===
- Total Revenue: $${ctx.insights.allTimeRevenue.toFixed(2)}
- Total Profit: $${ctx.insights.allTimeProfit.toFixed(2)}
- Total Units Sold: ${ctx.insights.allTimeUnits}
- Overall Margin: ${ctx.insights.overallMargin.toFixed(1)}%
- Avg Profit/Unit: $${ctx.insights.overallProfitPerUnit.toFixed(2)}
- Avg Weekly Revenue: $${ctx.insights.avgWeeklyRevenue.toFixed(2)}
- Avg Weekly Profit: $${ctx.insights.avgWeeklyProfit.toFixed(2)}
- Avg Daily Revenue: $${ctx.insights.avgDailyRevenue?.toFixed(2) || 0}
- Avg Daily Profit: $${ctx.insights.avgDailyProfit?.toFixed(2) || 0}

=== DAILY DATA (Last 14 days for granular analysis) ===
${ctx.dailyData?.length > 0 ? `
Days tracked: ${ctx.dataRange.daysTracked}
Recent daily trend (last 7 days vs prior 7 days): ${ctx.dailyTrend?.toFixed(1) || 0}%
${JSON.stringify(ctx.dailyData)}
` : 'No daily data uploaded yet'}

=== DAY-OF-WEEK PATTERNS (AI Learning) ===
${ctx.dayOfWeekPatterns && Object.keys(ctx.dayOfWeekPatterns).length > 0 ? `
Best performing days and average revenue/profit by day of week:
${JSON.stringify(ctx.dayOfWeekPatterns)}
Use this to identify optimal days for promotions, ad spend, and inventory planning.
` : 'Not enough daily data for day-of-week analysis'}

=== RECENT TREND (Last 4 weeks vs Prior 4 weeks) ===
- Recent Revenue: $${ctx.insights.recentVsPrior.recentRevenue.toFixed(2)}
- Prior Revenue: $${ctx.insights.recentVsPrior.priorRevenue.toFixed(2)}
- Revenue Change: ${ctx.insights.recentVsPrior.revenueChange.toFixed(1)}%
- Recent Profit: $${ctx.insights.recentVsPrior.recentProfit.toFixed(2)}
- Prior Profit: $${ctx.insights.recentVsPrior.priorProfit.toFixed(2)}
- Profit Change: ${ctx.insights.recentVsPrior.profitChange.toFixed(1)}%

=== FORECAST (Next 4 Weeks Projection) ===
${forecastData ? `
- Projected Monthly Revenue: $${forecastData.nextMonth.revenue.toFixed(2)}
- Projected Monthly Profit: $${forecastData.nextMonth.profit.toFixed(2)}
- Projected Monthly Units: ${forecastData.nextMonth.units}
- Trend Direction: ${forecastData.trend.revenue} (${forecastData.trend.revenueChange.toFixed(1)}% per week)
- Forecast Confidence: ${forecastData.confidence}%
- Weekly Projections: ${JSON.stringify(forecastData.weekly)}
` : 'Not enough data for forecast (need 4+ weeks)'}

=== 🧠 MULTI-SIGNAL AI FORECAST (PRIMARY - Use this for predictions) ===
${multiSignalForecast ? `
This is the most accurate forecast - it's the same one shown on the dashboard widget.

**NEXT WEEK PREDICTION:**
- Revenue: $${multiSignalForecast.nextWeek?.predictedRevenue?.toFixed(2) || 0}
- Profit: $${multiSignalForecast.nextWeek?.predictedProfit?.toFixed(2) || 0}
- Units: ${multiSignalForecast.nextWeek?.predictedUnits || 0}
- Confidence: ${multiSignalForecast.nextWeek?.confidence || 'N/A'}

**4-WEEK OUTLOOK:**
${JSON.stringify(multiSignalForecast.next4Weeks)}

**SIGNALS USED:**
- Daily Average (7 days): $${multiSignalForecast.signals.dailyAvg7?.toFixed(2) || 0}/day
- Momentum (7d vs prior 7d): ${multiSignalForecast.signals.momentum?.toFixed(1) || 0}%
- Profit Margin: ${((multiSignalForecast.signals.avgProfitMargin || 0) * 100).toFixed(1)}%

**DATA SOURCES:**
- Daily data points: ${multiSignalForecast.dataPoints.dailyDays || multiSignalForecast.dataPoints.daysAnalyzed || 0} days
- Weekly data points: ${multiSignalForecast.dataPoints.weeklyWeeks || multiSignalForecast.dataPoints.weeksAnalyzed || 0} weeks  
- Amazon forecasts: ${multiSignalForecast.dataPoints.amazonForecastWeeks || 0} weeks

**METHODOLOGY:** ${multiSignalForecast.methodology}

Last updated: ${multiSignalForecast.generatedAt || 'Not yet generated'}
` : 'Multi-Signal forecast not yet generated. User should click "Refresh Forecast" on dashboard.'}

=== 📊 FORECAST ACCURACY LEARNING (Compare predictions to actuals) ===
${forecastAccuracy.summary ? `
**ACCURACY SUMMARY (from past forecasts vs actuals):**
- Samples with actual data: ${forecastAccuracy.summary.samplesWithActuals || 0}
- Average Accuracy: ${forecastAccuracy.summary.avgAccuracy || 'N/A'}
- Bias: ${forecastAccuracy.summary.avgBias || 'N/A'}

**RECENT FORECAST vs ACTUAL COMPARISONS:**
${forecastAccuracy.summary.recentTrend ? JSON.stringify(forecastAccuracy.summary.recentTrend, null, 2) : 'No recent comparisons yet'}

⚠️ LEARNING INSTRUCTIONS:
- If bias is consistently positive (actuals > forecast), predictions are too conservative - adjust up
- If bias is consistently negative (actuals < forecast), predictions are too optimistic - adjust down
- Use the accuracy % to determine confidence level in your predictions
- Factor in the specific error patterns when making new predictions
` : 'No forecast accuracy data yet. As weeks complete and actuals are uploaded, I will learn from prediction errors.'}

**FULL ACCURACY HISTORY (last 20 records):**
${forecastAccuracy.records.length > 0 ? JSON.stringify(forecastAccuracy.records.slice(-10)) : 'No records yet'}

=== GOALS ===
- Weekly Revenue Target: $${ctx.goals.weeklyRevenue || 0}
- Weekly Profit Target: $${ctx.goals.weeklyProfit || 0}
- Monthly Revenue Target: $${ctx.goals.monthlyRevenue || 0}
- Monthly Profit Target: $${ctx.goals.monthlyProfit || 0}
${ctx.goals.weeklyRevenue > 0 && ctx.weeklyData.length > 0 ? `- Last Week vs Goal: ${ctx.weeklyData[ctx.weeklyData.length-1]?.totalRevenue >= ctx.goals.weeklyRevenue ? 'MET' : 'MISSED'}` : ''}

=== ALERTS ===
${alertsSummary.length > 0 ? alertsSummary.join('\n') : 'No active alerts'}

=== PRODUCT CATALOG (SKU ↔ Product Name mapping) ===
Use this to translate between product names and SKUs:
${JSON.stringify(ctx.productCatalog)}

=== QUICK LOOKUP: Product Names → SKUs ===
${ctx.productCatalog?.slice(0, 15).map(p => `"${p.name.substring(0, 40)}..." → ${p.sku} [${p.category}]`).join('\n') || 'No catalog'}

=== SKUs BY CATEGORY (for category queries) ===
${Object.entries(ctx.skusByCategory || {}).map(([cat, skus]) => `${cat}: ${skus.join(', ')}`).join('\n') || 'No categories'}

=== 📦 SKU MASTER DATA (PRIMARY DATA SOURCE - USE THIS) ===
IMPORTANT: This is the authoritative SKU-level data. Use SKUs as the primary identifier for all analysis.

**TOP 20 SKUs BY REVENUE (all-time across periods + weeks):**
${ctx.skuMasterData?.slice(0, 20).map(s => 
  `${s.sku}: "${s.name}" [${s.category}] - $${s.totalRevenue.toFixed(0)} rev, ${s.totalUnits} units`
).join('\n') || 'No SKU data'}

**SKU BREAKDOWN BY 2025 MONTH:**
${safe(() => {
  const byMonth = {};
  ctx.skuMasterData?.forEach(s => {
    Object.entries(s.byPeriod || {}).forEach(([period, data]) => {
      if (!byMonth[period]) byMonth[period] = [];
      if (data.revenue > 0) byMonth[period].push({ sku: s.sku, name: s.name, category: s.category, revenue: data.revenue, units: data.units });
    });
  });
  return Object.entries(byMonth)
    .filter(([p]) => p.includes('2025') || p.includes('-2025'))
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 6)
    .map(([period, skus]) => {
      const top3 = skus.sort((a, b) => b.revenue - a.revenue).slice(0, 3);
      return `${period}: ${top3.map(s => `${s.sku}=$${s.revenue.toFixed(0)}`).join(', ')}`;
    }).join('\n') || 'No period data';
})}

**CATEGORY TOTALS FROM SKU DATA:**
${safe(() => {
  const cats = {};
  ctx.skuMasterData?.forEach(s => {
    if (!cats[s.category]) cats[s.category] = { revenue: 0, units: 0, skuCount: 0 };
    cats[s.category].revenue += s.totalRevenue;
    cats[s.category].units += s.totalUnits;
    cats[s.category].skuCount++;
  });
  return Object.entries(cats)
    .sort(([,a], [,b]) => b.revenue - a.revenue)
    .map(([cat, d]) => `${cat}: $${d.revenue.toFixed(0)} revenue, ${d.units} units (${d.skuCount} SKUs)`)
    .join('\n') || 'No category data';
})}

🔑 SKU-CENTRIC ANALYSIS RULES:
- ALWAYS use SKU codes as primary identifiers
- Look up product names from productCatalog when needed for display
- For category questions, find SKUs in that category and sum their data
- For period questions, use skuMasterData[x].byPeriod[period]
- For week questions, use skuMasterData[x].byWeek[week]

=== 🎯🎯🎯 PRE-COMPUTED TIMEFRAME DATA - USE THIS FOR TIMEFRAME QUESTIONS 🎯🎯🎯 ===

**LAST WEEK (${ctx.lastWeekByCategory?.weekLabel || 'No data'}):** ← USE THIS FOR "last week" questions
${ctx.lastWeekByCategory ? `
Week: ${ctx.lastWeekByCategory.weekEnding}
Total Revenue: $${ctx.lastWeekByCategory.totalRevenue.toFixed(2)}
Total Profit: $${ctx.lastWeekByCategory.totalProfit.toFixed(2)}
Total Units: ${ctx.lastWeekByCategory.totalUnits}
BY CATEGORY: ${JSON.stringify(ctx.lastWeekByCategory.byCategory)}
` : 'No data'}

**LAST 2 WEEKS (${ctx.last2WeeksByCategory?.dateRange || 'No data'}):** ← USE THIS FOR "last 2 weeks" questions
${ctx.last2WeeksByCategory ? `
Weeks included: ${ctx.last2WeeksByCategory.weeks?.join(', ')}
Total Revenue: $${ctx.last2WeeksByCategory.totalRevenue.toFixed(2)}
Total Profit: $${ctx.last2WeeksByCategory.totalProfit.toFixed(2)}
Total Units: ${ctx.last2WeeksByCategory.totalUnits}
BY CATEGORY: ${JSON.stringify(ctx.last2WeeksByCategory.byCategory)}
` : 'No data'}

**LAST 4 WEEKS / LAST MONTH (${ctx.last4WeeksByCategory?.dateRange || 'No data'}):** ← USE THIS FOR "last month" questions
${ctx.last4WeeksByCategory ? `
Weeks included: ${ctx.last4WeeksByCategory.weeks?.join(', ')}
Total Revenue: $${ctx.last4WeeksByCategory.totalRevenue.toFixed(2)}
Total Profit: $${ctx.last4WeeksByCategory.totalProfit.toFixed(2)}
Total Units: ${ctx.last4WeeksByCategory.totalUnits}
BY CATEGORY: ${JSON.stringify(ctx.last4WeeksByCategory.byCategory)}
` : 'No data'}

**🆕 CURRENT MONTH MTD (${ctx.currentMonthByCategory?.dateRange || 'No data'}):** ← USE THIS FOR "this month", "January", "MTD" questions
${ctx.currentMonthByCategory ? `
Data Source: ${ctx.currentMonthByCategory.dataSource} (${ctx.currentMonthByCategory.daysOrWeeksIncluded})
AMAZON: $${ctx.currentMonthByCategory.amazonRevenue?.toFixed(2) || 0} revenue, ${ctx.currentMonthByCategory.amazonUnits || 0} units
SHOPIFY: $${ctx.currentMonthByCategory.shopifyRevenue?.toFixed(2) || 0} revenue, ${ctx.currentMonthByCategory.shopifyUnits || 0} units
TOTAL: $${ctx.currentMonthByCategory.totalRevenue?.toFixed(2) || 0} revenue, ${ctx.currentMonthByCategory.totalUnits || 0} units
BY CATEGORY (units): ${JSON.stringify(Object.fromEntries(Object.entries(ctx.currentMonthByCategory.byCategory || {}).map(([cat, data]) => [cat, { total: data.units, amazon: data.amazonUnits, shopify: data.shopifyUnits }])))}
TOP SKUs BY UNITS: ${JSON.stringify((ctx.currentMonthByCategory.bySku || []).slice(0, 15).map(s => ({ sku: s.sku, name: s.name, channel: s.channel, units: s.units })))}
` : 'No daily or weekly data for current month - User should upload Amazon/Shopify reports via Upload tab'}

**⚠️ DATA AVAILABILITY CHECK:**
Daily data days: ${Object.keys(allDaysData || {}).length}
Days with Amazon skuData: ${Object.keys(allDaysData || {}).filter(d => (allDaysData[d]?.amazon?.skuData || []).length > 0).length}
Days with Shopify skuData: ${Object.keys(allDaysData || {}).filter(d => (allDaysData[d]?.shopify?.skuData || []).length > 0).length}
Latest daily data: ${sortedDays[sortedDays.length - 1] || 'none'}
Current month daily days: ${safe(() => { const now = new Date(); const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; return sortedDays.filter(d => d.startsWith(prefix)).length; })}

**📅 CUSTOM DATE RANGE DATA (For recent date range questions):**
${safe(() => {
  // Pre-compute current month aggregates dynamically
  const now = new Date();
  const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentMonthDays = sortedDays.filter(d => d.startsWith(currentMonthPrefix));
  if (currentMonthDays.length === 0) return 'No daily data available for current month';
  
  const skuTotals = {};
  let amzTotal = 0, shopTotal = 0;
  
  currentMonthDays.forEach(dayKey => {
    const dayData = allDaysData[dayKey];
    if (!dayData) return;
    
    (dayData.amazon?.skuData || []).forEach(s => {
      const sku = s.sku || s.msku || '';
      const units = s.unitsSold || s.units || 0;
      if (!skuTotals[sku]) skuTotals[sku] = { amazon: 0, shopify: 0, name: savedProductNames[sku] || s.name || sku };
      skuTotals[sku].amazon += units;
      amzTotal += units;
    });
    
    (dayData.shopify?.skuData || []).forEach(s => {
      const sku = s.sku || '';
      const units = s.unitsSold || s.units || 0;
      if (!skuTotals[sku]) skuTotals[sku] = { amazon: 0, shopify: 0, name: savedProductNames[sku] || s.name || sku };
      skuTotals[sku].shopify += units;
      shopTotal += units;
    });
  });
  
  // Get top SKUs by total units (dynamic, not hardcoded to any specific product)
  const topSkus = Object.entries(skuTotals)
    .sort((a, b) => (b[1].amazon + b[1].shopify) - (a[1].amazon + a[1].shopify))
    .slice(0, 15);
  
  const monthName = now.toLocaleString('en-US', { month: 'long' });
  const lastDay = currentMonthDays[currentMonthDays.length - 1]?.split('-')[2] || '';
  
  return `
${monthName.toUpperCase()} 1-${lastDay}, ${now.getFullYear()} (${currentMonthDays.length} days of daily data):
- Total Amazon units: ${amzTotal}
- Total Shopify units: ${shopTotal}

TOP SKUs BY UNITS (this month):
${topSkus.map(([sku, d]) => `  ${sku} (${d.name?.substring(0, 40) || sku}): Amazon ${d.amazon}, Shopify ${d.shopify}, TOTAL ${d.amazon + d.shopify}`).join('\n')}
`;
})}

**ALL TIME (${ctx.allTimeByCategory?.weeks || 0} weeks):** ← USE THIS FOR "all time/total" questions
${ctx.allTimeByCategory ? `
Total Revenue: $${ctx.allTimeByCategory.totalRevenue.toFixed(2)}
Total Profit: $${ctx.allTimeByCategory.totalProfit.toFixed(2)}
Total Units: ${ctx.allTimeByCategory.totalUnits}
BY CATEGORY: ${JSON.stringify(ctx.allTimeByCategory.byCategory)}
` : 'No data'}

⚠️ REMINDER: For "how much X sold last week" → use lastWeekByCategory.byCategory["X"]
⚠️ FOR CURRENT MONTH / DATE RANGE QUESTIONS → use CUSTOM DATE RANGE DATA above (has pre-computed current month totals)
⚠️ DO NOT use skuAnalysis or weekly skuData for current month - they may be missing Amazon data!

🗓️ FOR HISTORICAL QUESTIONS (2025 monthly, 2024 quarterly):
- "How did we do in January 2025?" → Use PERIOD DATA section above
- "What was Q3 2024 revenue?" → Use PERIOD DATA section above
- "Compare 2024 vs 2025" → Use YoY INSIGHTS + PERIOD DATA
- The period data contains monthly 2025 totals and quarterly 2024 totals

🏷️ FOR CATEGORY QUESTIONS (e.g., "how much [category] sold?"):
- User says category name → Find SKUs: skusByCategory["Category Name"] = [SKU1, SKU2, ...]
- Sum data from skuMasterData for each of those SKUs
- Show breakdown by SKU in response: "SKU1 (Product Name): $X, SKU2 (Product Name): $Y..."

📦 FOR SPECIFIC PRODUCT QUESTIONS (e.g., "how did [product] do?" or "[SKU] sales"):
- If SKU given → Look up directly in skuMasterData
- If product name given → Search productCatalog for match → Get SKU → Look up in skuMasterData
- Show: "SKU (Full Product Name): $X total, Y units"

🗓️ FOR PERIOD QUESTIONS (e.g., "[product] in January 2025"):
- Resolve product/category to SKUs first
- Then look up each SKU's byPeriod["january-2025"] data
- Sum and display with SKU breakdown

🔑 REMEMBER: Internally always use SKUs - they're unique identifiers. Product names are for user-friendly display.

=== WEEKLY DATA (most recent 12 weeks) ===
${JSON.stringify(ctx.weeklyData.slice().reverse().slice(0, 12))}

=== PERIOD DATA (Quarterly/Monthly/Yearly Historical) ===
${ctx.periodData.length > 0 ? `Total periods tracked: ${ctx.periodData.filter(p => p.totalRevenue > 0).length} (with data)

📅 2025 MONTHLY TOTALS:
${ctx.periodData.filter(p => (p.period.includes('2025') || p.period.includes('-2025')) && p.type === 'monthly' && p.totalRevenue > 0).map(p => 
  `${p.period}: $${p.totalRevenue.toFixed(0)} rev, ${p.totalUnits} units, ${p.margin.toFixed(1)}% margin`
).join('\n') || 'No 2025 monthly periods'}

📅 2024 QUARTERLY TOTALS:
${ctx.periodData.filter(p => (p.period.includes('2024') || p.period.includes('-2024')) && p.type === 'quarterly' && p.totalRevenue > 0).map(p => 
  `${p.period}: $${p.totalRevenue.toFixed(0)} rev, ${p.totalUnits} units`
).join('\n') || 'No 2024 quarterly periods'}

NOTE: For SKU-level breakdown by period, use the SKU MASTER DATA section above.
` : 'No historical period data uploaded yet'}

=== YEAR-OVER-YEAR INSIGHTS ===
${ctx.yoyInsights?.length > 0 ? JSON.stringify(ctx.yoyInsights) : 'No comparable year-over-year data available yet'}

=== 2025 MONTHLY TREND ===
${ctx.monthlyTrend2025?.length > 0 ? JSON.stringify(ctx.monthlyTrend2025) : 'No 2025 monthly data'}

=== SEASONALITY INSIGHTS ===
${ctx.periodData.length > 0 ? (() => {
  const months = ctx.periodData.filter(p => p.type === 'monthly');
  if (months.length < 3) return 'Not enough monthly data for seasonality analysis';
  const sorted = [...months].sort((a, b) => b.totalRevenue - a.totalRevenue);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const avgRev = months.reduce((s, m) => s + m.totalRevenue, 0) / months.length;
  return 'Best Month: ' + best.label + ' ($' + best.totalRevenue.toFixed(0) + ')\n' +
         'Worst Month: ' + worst.label + ' ($' + worst.totalRevenue.toFixed(0) + ')\n' +
         'Avg Monthly Revenue: $' + avgRev.toFixed(0) + '\n' +
         'Peak vs Avg: ' + ((best.totalRevenue / avgRev - 1) * 100).toFixed(0) + '% above average';
}) : 'No seasonality data'}

=== SEASONAL PATTERNS (AI Learning) ===
${ctx.seasonalPatterns ? `
Monthly Performance Patterns (for forecasting):
${JSON.stringify(ctx.seasonalPatterns.byMonth)}
Overall Monthly Average: $${ctx.seasonalPatterns.overallMonthlyAvg?.toFixed(0) || 0}
Strong Months (>10% above avg): ${ctx.seasonalPatterns.strongMonths?.join(', ') || 'None identified yet'}
Weak Months (<10% below avg): ${ctx.seasonalPatterns.weakMonths?.join(', ') || 'None identified yet'}

Use seasonal indices when forecasting:
- Index > 1.0 = Above average month (expect higher sales)
- Index < 1.0 = Below average month (expect lower sales)
- Apply: Expected Revenue = Base Forecast × Seasonal Index
` : 'Not enough historical data for seasonal pattern analysis'}

=== DATA QUALITY & TRIANGULATION ===
${ctx.dataTriangulation ? `
Data Quality Score: ${ctx.dataTriangulation.dataQualityScore}/100
- 25 pts: 12+ weeks sales history
- 20 pts: 30+ days daily data
- 20 pts: 100+ banking transactions
- 15 pts: 10+ SKUs with COGS
- 10 pts: AI learning active (4+ samples)
- 10 pts: Amazon forecasts uploaded

Multiple Data Sources: ${ctx.dataTriangulation.hasMultipleSources ? 'YES - Can cross-validate sales vs banking' : 'NO - Limited to single source'}

${ctx.dataTriangulation.hasMultipleSources && Object.keys(ctx.dataTriangulation.salesVsBanking || {}).length > 0 ? `
Sales vs Banking Comparison (cross-validation):
${Object.entries(ctx.dataTriangulation.salesVsBanking).slice(-6).map(([month, data]) => 
  `- ${month}: Sales $${data.salesRevenue?.toFixed(0) || 0} → Bank Deposits $${data.bankDeposits?.toFixed(0) || 0} (${(data.depositRatio * 100).toFixed(0)}% deposit ratio)`
).join('\n')}

Note: Deposit ratio < 100% is normal (marketplace fees taken before payout)
Typical healthy range: 70-85% for Amazon, 95-98% for Shopify
` : ''}
` : 'Data triangulation not available'}

=== WEEK NOTES (user annotations) ===
${notesData.length > 0 ? JSON.stringify(notesData) : 'No notes added'}

=== ⛔⛔⛔ ALL-TIME SKU DATA BELOW - DO NOT USE FOR TIMEFRAME QUESTIONS ⛔⛔⛔ ===
The data below is ALL-TIME totals. For "last week", "last month" etc. use the PRE-COMPUTED TIMEFRAME DATA sections above!

=== TOP SKUS BY REVENUE (ALL-TIME totals - NOT for timeframe questions) ===
${JSON.stringify(ctx.skuAnalysis.slice(0, 15))}

=== SKUS WITH DECLINING PROFITABILITY (ALL-TIME) ===
${JSON.stringify(ctx.decliningSkus)}

=== SKUS WITH IMPROVING PROFITABILITY (ALL-TIME) ===
${JSON.stringify(ctx.improvingSkus)}

=== INVENTORY STATUS ===
${ctx.inventory ? `As of ${ctx.inventory.asOfDate}: ${ctx.inventory.totalUnits?.toLocaleString() || 0} total units, $${ctx.inventory.totalValue?.toLocaleString() || 0} value
Amazon FBA: ${ctx.inventory.amazonUnits?.toLocaleString() || 0} units | AWD: ${ctx.inventory.awdUnits?.toLocaleString() || 0} units ($${ctx.inventory.awdValue?.toLocaleString() || 0}) | 3PL: ${ctx.inventory.threeplUnits?.toLocaleString() || 0} units | Inbound to FBA: ${ctx.inventory.amazonInbound?.toLocaleString() || 0} units

HEALTH BREAKDOWN:
- Critical (will stock out soon): ${ctx.inventory.healthBreakdown?.critical || 0} SKUs
- Low Stock: ${ctx.inventory.healthBreakdown?.low || 0} SKUs  
- Healthy: ${ctx.inventory.healthBreakdown?.healthy || 0} SKUs
- Overstock: ${ctx.inventory.healthBreakdown?.overstock || 0} SKUs
` : 'No inventory data'}

=== 🚨 URGENT REORDER (Past reorder date!) ===
${ctx.inventory?.urgentReorder?.length > 0 ? ctx.inventory.urgentReorder.map(i => 
  `- ${i.sku}: ${i.daysOverdue} days overdue! Stockout: ${i.stockoutDate}, Velocity: ${i.weeklyVelocity?.toFixed(1)}/wk, Suggested Order: ${i.suggestedOrderQty} units`
).join('\n') : 'None - all items are on schedule'}

=== ⚠️ NEEDS REORDER SOON (within 14 days) ===
${ctx.inventory?.needsReorderSoon?.length > 0 ? ctx.inventory.needsReorderSoon.map(i =>
  `- ${i.sku}: Order in ${i.daysUntilMustOrder} days, Current: ${i.currentQty}, Velocity: ${i.weeklyVelocity?.toFixed(1)}/wk, Lead Time: ${i.leadTimeDays}d, Suggested: ${i.suggestedOrderQty} units`
).join('\n') : 'None - no immediate reorders needed'}

=== 🔴 CRITICAL STOCK (will run out soon) ===
${ctx.inventory?.criticalItems?.length > 0 ? ctx.inventory.criticalItems.map(i =>
  `- ${i.sku} (${i.name?.slice(0,40)}...): ${i.totalQty} units, ${i.daysOfSupply} days supply, Stockout: ${i.stockoutDate}, Velocity: ${i.weeklyVelocity?.toFixed(1)}/wk`
).join('\n') : 'None'}

=== 🟡 LOW STOCK ===
${ctx.inventory?.lowStockItems?.length > 0 ? ctx.inventory.lowStockItems.slice(0, 10).map(i =>
  `- ${i.sku}: ${i.totalQty} units, ${i.daysOfSupply} days supply, Reorder by: ${i.reorderByDate}`
).join('\n') : 'None'}

=== 📈 TOP MOVERS (Highest Velocity) ===
${ctx.inventory?.topMovers?.length > 0 ? ctx.inventory.topMovers.map(i =>
  `- ${i.sku}: ${i.weeklyVelocity?.toFixed(1)} units/wk (AMZ: ${i.amazonVelocity?.toFixed(1)}, Shop: ${i.shopifyVelocity?.toFixed(1)}), ${i.daysOfSupply} days supply, Stock: ${i.totalQty}`
).join('\n') : 'No velocity data'}

=== 📦 OVERSTOCK (excess inventory tying up capital) ===
${ctx.inventory?.overstockItems?.length > 0 ? ctx.inventory.overstockItems.slice(0, 5).map(i =>
  `- ${i.sku}: ${i.daysOfSupply} days supply (${(i.daysOfSupply/30).toFixed(1)} months!), ${i.totalQty} units, $${i.totalValue?.toFixed(0)} tied up, Velocity: ${i.weeklyVelocity?.toFixed(1)}/wk`
).join('\n') : 'None identified'}

=== VELOCITY BY CHANNEL ===
${ctx.inventory?.velocityByChannel ? `
- Amazon: ${ctx.inventory.velocityByChannel.amazonTotal?.toFixed(0)} units/week
- Shopify: ${ctx.inventory.velocityByChannel.shopifyTotal?.toFixed(0)} units/week
- Total: ${(ctx.inventory.velocityByChannel.amazonTotal + ctx.inventory.velocityByChannel.shopifyTotal)?.toFixed(0)} units/week
` : 'No velocity data'}

=== 📊 VELOCITY TRENDS (Last 2 weeks vs Prior 2 weeks) ===
${ctx.inventory?.velocityTrends?.accelerating?.length > 0 ? `
🚀 ACCELERATING (velocity increasing >15%):
${ctx.inventory.velocityTrends.accelerating.map(v => 
  `- ${v.sku}: ${v.trendPercent} increase (was ${v.priorAvgWeekly?.toFixed(1)}/wk → now ${v.recentAvgWeekly?.toFixed(1)}/wk)`
).join('\n')}
` : ''}
${ctx.inventory?.velocityTrends?.declining?.length > 0 ? `
📉 DECLINING (velocity decreasing >15%):
${ctx.inventory.velocityTrends.declining.map(v => 
  `- ${v.sku}: ${v.trendPercent} decrease (was ${v.priorAvgWeekly?.toFixed(1)}/wk → now ${v.recentAvgWeekly?.toFixed(1)}/wk)`
).join('\n')}
` : ''}
${!ctx.inventory?.velocityTrends?.accelerating?.length && !ctx.inventory?.velocityTrends?.declining?.length ? 'All SKUs have stable velocity (±15%)' : ''}

=== INVENTORY FORECASTING ===
When user asks about inventory, you can analyze: Stockout Risk, Reorder Recommendations, Capital Efficiency, Velocity Trends, and Channel Mix.
${safe(() => {
  // Calculate velocity and days of supply from weekly data
  const sortedWeeks = Object.keys(allWeeksData).sort().slice(-8);
  if (sortedWeeks.length < 2) return 'Not enough weekly data for inventory forecasting';
  
  const weeklyUnits = sortedWeeks.map(w => allWeeksData[w]?.total?.units || 0);
  const avgWeeklyVelocity = weeklyUnits.reduce((s, u) => s + u, 0) / weeklyUnits.length;
  
  // Get SKU-level velocity
  const skuVelocity = {};
  sortedWeeks.forEach(w => {
    const shopify = allWeeksData[w]?.shopify?.skuData || [];
    const amazon = allWeeksData[w]?.amazon?.skuData || [];
    [...shopify, ...amazon].forEach(s => {
      const sku = s.sku || s.msku;
      if (!skuVelocity[sku]) skuVelocity[sku] = [];
      skuVelocity[sku].push(s.unitsSold || s.units || 0);
    });
  });
  
  const topVelocity = Object.entries(skuVelocity)
    .map(([sku, weeks]) => ({ sku, avgPerWeek: weeks.reduce((s,u) => s+u, 0) / weeks.length }))
    .sort((a, b) => b.avgPerWeek - a.avgPerWeek)
    .slice(0, 10);
  
  return 'Avg Weekly Unit Velocity: ' + avgWeeklyVelocity.toFixed(0) + ' units/week\n' +
    'Top SKUs by Velocity: ' + JSON.stringify(topVelocity.slice(0, 5)) + '\n' +
    'Use this to calculate: Days of Supply = Current Inventory / (Weekly Velocity / 7)';
})}

=== SALES TAX ===
${ctx.salesTax?.nexusStates?.length > 0 ? `Nexus states: ${JSON.stringify(ctx.salesTax.nexusStates)}` : 'No nexus states configured'}
Total sales tax paid all-time: $${ctx.salesTax?.totalPaidAllTime?.toFixed(2) || 0}

=== UPCOMING BILLS & INVOICES ===
${safe(() => {
  const unpaid = invoices.filter(i => !i.paid);
  if (unpaid.length === 0) return 'No upcoming bills';
  const total = unpaid.reduce((s, i) => s + i.amount, 0);
  return `Upcoming bills (${unpaid.length} total, $${total.toFixed(2)}):
${JSON.stringify(unpaid.map(i => ({ vendor: i.vendor, amount: i.amount, dueDate: i.dueDate, category: i.category, daysUntilDue: Math.ceil((new Date(i.dueDate) - new Date()) / (1000 * 60 * 60 * 24)) })))}`;
})}

=== AMAZON FORECASTS (from Amazon's projections) ===
${upcomingAmazonForecasts.length > 0 ? `
Upcoming Amazon projections:
${JSON.stringify(upcomingAmazonForecasts.map(f => ({ weekEnding: f.weekEnding, projectedRevenue: f.totals?.sales || f.totalSales || 0, projectedUnits: f.totals?.units || f.totalUnits || 0, projectedProfit: f.totals?.proceeds || f.totalProceeds || 0, skuCount: f.skuCount || 0 })))}
` : 'No upcoming Amazon forecasts uploaded'}

${getAmazonForecastComparison.length > 0 ? `
Forecast vs Actual Accuracy (Amazon) - ${getAmazonForecastComparison.length} weeks tracked:
${JSON.stringify(getAmazonForecastComparison.slice(0, 8).map(c => ({ 
  week: c.weekEnding, 
  forecastRev: c.forecast.revenue, 
  actualRev: c.actual.revenue, 
  variance: c.variance.revenuePercent.toFixed(1) + '%',
  accuracy: c.accuracy.toFixed(1) + '%',
  status: c.status 
})))}
` : ''}

${forecastAccuracyMetrics ? `
FORECAST ACCURACY INSIGHTS:
- Overall Accuracy: ${forecastAccuracyMetrics.avgAccuracy.toFixed(1)}% (based on ${forecastAccuracyMetrics.totalWeeks} weeks)
- Beat forecast ${forecastAccuracyMetrics.beatCount} times, Missed ${forecastAccuracyMetrics.missedCount} times
- Average Revenue Variance: ${forecastAccuracyMetrics.avgRevenueVariance > 0 ? '+' : ''}${forecastAccuracyMetrics.avgRevenueVariance.toFixed(1)}%
- Forecast Bias: ${forecastAccuracyMetrics.biasDescription}
- Recent 4-week Accuracy: ${forecastAccuracyMetrics.recentAccuracy.toFixed(1)}%
- Accuracy Trend: ${forecastAccuracyMetrics.accuracyTrend > 0 ? 'Improving' : forecastAccuracyMetrics.accuracyTrend < 0 ? 'Declining' : 'Stable'} (${forecastAccuracyMetrics.accuracyTrend > 0 ? '+' : ''}${forecastAccuracyMetrics.accuracyTrend.toFixed(1)}%)
${forecastAccuracyMetrics.bestWeek ? `- Best Predicted Week: ${forecastAccuracyMetrics.bestWeek.weekEnding} (${forecastAccuracyMetrics.bestWeek.accuracy.toFixed(1)}% accurate)` : ''}
${forecastAccuracyMetrics.worstWeek ? `- Worst Predicted Week: ${forecastAccuracyMetrics.worstWeek.weekEnding} (${forecastAccuracyMetrics.worstWeek.accuracy.toFixed(1)}% accurate)` : ''}
` : ''}

${mlTrainingData ? `
ML CORRECTION MODEL (based on ${mlTrainingData.summary.totalSamples} samples):
- Amazon Bias: ${mlTrainingData.summary.bias > 0 ? 'Under-forecasts' : 'Over-forecasts'} by ${Math.abs(mlTrainingData.summary.bias).toFixed(1)}% on average
- Correction Factor: ${mlTrainingData.summary.correctionFactor.toFixed(3)}x (multiply Amazon forecast by this)
- Prediction Variance: ±${mlTrainingData.summary.stdDev.toFixed(1)}%
- When user asks about expected revenue, apply correction: Amazon Forecast × ${mlTrainingData.summary.correctionFactor.toFixed(3)} = Adjusted Forecast
` : ''}

${forecastCorrections.samplesUsed >= 2 ? `
SELF-LEARNING FORECAST SYSTEM:
- Learning Status: ${forecastCorrections.confidence >= 30 ? 'ACTIVE' : 'TRAINING'} (${forecastCorrections.confidence.toFixed(0)}% confidence)
- Samples Used: ${forecastCorrections.samplesUsed} weeks of forecast-vs-actual comparisons
- Revenue Correction Factor: ${forecastCorrections.overall.revenue.toFixed(3)}x
- Units Correction Factor: ${forecastCorrections.overall.units.toFixed(3)}x  
- Profit Correction Factor: ${forecastCorrections.overall.profit.toFixed(3)}x
- SKUs with Custom Corrections: ${Object.keys(forecastCorrections.bySku).length}
- Last Updated: ${forecastCorrections.lastUpdated || 'Never'}
- Note: When confidence >= 30%, forecasts are auto-adjusted using learned corrections
` : `
SELF-LEARNING FORECAST SYSTEM:
- Status: COLLECTING DATA (need more samples)
- Current Samples: ${forecastCorrections.samplesUsed}
- Required: At least 2 weeks of forecast-vs-actual comparisons
- To enable: Upload Amazon forecasts BEFORE week ends, then upload actual sales AFTER week ends
`}

${pendingForecasts.length > 0 ? `
PENDING FORECASTS (awaiting actual data):
${pendingForecasts.map(pf => `- Week ${pf.weekEnding}: ${(pf.forecast.totals?.sales || pf.forecast.totalSales || 0).toFixed(0)} forecasted (${pf.isPast ? 'PAST - needs actuals uploaded' : pf.daysUntil + ' days until week ends'})`).join('\n')}
` : ''}

=== PRODUCTION PIPELINE (incoming inventory) ===
${productionPipeline.length > 0 ? `
${productionPipeline.length} production orders in pipeline (${formatNumber(productionPipeline.reduce((s, p) => s + (p.quantity || 0), 0))} total units):
${JSON.stringify(productionPipeline.map(p => ({ 
  sku: p.sku, 
  product: p.productName, 
  quantity: p.quantity, 
  expectedDate: p.expectedDate, 
  status: p.status,
  daysUntil: p.expectedDate ? Math.ceil((new Date(p.expectedDate) - new Date()) / (1000 * 60 * 60 * 24)) : null
})))}
` : 'No production orders in pipeline'}

=== 3PL FULFILLMENT COSTS ===
${safe(() => {
  const ledgerOrders = Object.values(threeplLedger.orders || {});
  if (ledgerOrders.length === 0) return 'No 3PL data uploaded yet';
  
  // Calculate totals from ledger
  const allWeeks = [...new Set(ledgerOrders.map(o => o.weekKey))].sort();
  const totalOrders = ledgerOrders.length;
  let totalCost = 0;
  let totalUnits = 0;
  
  ledgerOrders.forEach(o => {
    const c = o.charges || {};
    totalCost += (c.firstPick || 0) + (c.additionalPick || 0) + (c.box || 0) + (c.reBoxing || 0) + (c.fbaForwarding || 0);
    totalUnits += (c.firstPickQty || 0) + (c.additionalPickQty || 0);
  });
  
  // Get summary charges (storage, shipping, etc.)
  Object.values(threeplLedger.summaryCharges || {}).forEach(c => {
    totalCost += c.amount || 0;
  });
  
  // Recent weeks data
  const recentWeeks = allWeeks.slice(-8);
  const weeklyTotals = recentWeeks.map(w => {
    const weekOrders = ledgerOrders.filter(o => o.weekKey === w);
    let weekCost = 0;
    weekOrders.forEach(o => {
      const c = o.charges || {};
      weekCost += (c.firstPick || 0) + (c.additionalPick || 0) + (c.box || 0);
    });
    return { week: w, orders: weekOrders.length, cost: weekCost };
  });
  
  // Calculate trend
  const avgCostPerOrder = totalOrders > 0 ? totalCost / totalOrders : 0;
  
  return '3PL Summary (from bulk uploads):\n' +
    '- Total Orders Tracked: ' + totalOrders + '\n' +
    '- Total 3PL Cost: $' + totalCost.toFixed(2) + '\n' +
    '- Avg Cost Per Order: $' + avgCostPerOrder.toFixed(2) + '\n' +
    '- Total Units Shipped: ' + totalUnits + '\n' +
    '- Weeks with Data: ' + allWeeks.length + ' (' + (allWeeks[0] || 'N/A') + ' to ' + (allWeeks[allWeeks.length-1] || 'N/A') + ')\n\n' +
    'Recent Weekly 3PL Costs:\n' + JSON.stringify(weeklyTotals) + '\n\n' +
    'LOOK FOR:\n' +
    '- Rising avg cost per order (margin erosion)\n' +
    '- Storage cost spikes\n' +
    '- Shipping cost increases\n' +
    '- Changes in units per order affecting fulfillment efficiency';
})}

=== FORECAST DIVERGENCE ANALYSIS ===
${safe(() => {
  // Compare our projection vs Amazon's forecast
  const upcomingAmazon = Object.entries(amazonForecasts)
    .filter(([weekKey]) => new Date(weekKey) > new Date())
    .sort((a, b) => a[0].localeCompare(b[0]));
  
  if (upcomingAmazon.length === 0) return 'No upcoming Amazon forecasts to compare';
  
  const sortedWeeks = Object.keys(allWeeksData).sort();
  if (sortedWeeks.length === 0) return 'No historical data for our projection';
  
  const weeklyRevenues = sortedWeeks.map(w => allWeeksData[w]?.total?.revenue || 0);
  const ourAvg = weeklyRevenues.reduce((s, v) => s + v, 0) / weeklyRevenues.length;
  
  let analysis = 'FORECAST COMPARISON:\n';
  upcomingAmazon.slice(0, 4).forEach(([weekKey, forecast]) => {
    const amazonProjected = forecast.totals?.sales || 0;
    const divergence = ourAvg > 0 ? ((amazonProjected - ourAvg) / ourAvg * 100) : 0;
    const direction = divergence > 10 ? '📈 ABOVE' : divergence < -10 ? '📉 BELOW' : '≈ ALIGNED';
    analysis += `Week ${weekKey}: Amazon=$${amazonProjected.toFixed(0)} vs Our Avg=$${ourAvg.toFixed(0)} → ${direction} (${divergence > 0 ? '+' : ''}${divergence.toFixed(0)}%)\n`;
  });
  
  // Add recommendation
  const firstAmazon = upcomingAmazon[0]?.[1]?.totals?.sales || 0;
  const divergence = ourAvg > 0 ? ((firstAmazon - ourAvg) / ourAvg * 100) : 0;
  if (divergence > 20) {
    analysis += '\n⚠️ SIGNIFICANT DIVERGENCE: Amazon forecasts much higher than historical average. Could indicate upcoming demand surge OR Amazon being optimistic.';
  } else if (divergence < -20) {
    analysis += '\n⚠️ SIGNIFICANT DIVERGENCE: Amazon forecasts lower than historical average. Could indicate demand slowdown OR seasonality adjustment.';
  } else {
    analysis += '\nForecasts are reasonably aligned.';
  }
  
  return analysis;
})}

=== FORECAST UPLOAD STATUS ===
${safe(() => {
  const uploads = forecastMeta?.lastUploads || {};
  const status = [];
  ['7day', '30day', '60day'].forEach(type => {
    const last = uploads[type];
    if (last) {
      const days = Math.floor((new Date() - new Date(last)) / (1000 * 60 * 60 * 24));
      const threshold = type === '7day' ? 7 : type === '30day' ? 30 : 60;
      const isStale = days >= threshold;
      status.push(`${type}: ${days} days ago ${isStale ? '(NEEDS REFRESH)' : ''}`);
    } else {
      status.push(`${type}: Never uploaded`);
    }
  });
  return status.join('\n');
})}

=== AMAZON PPC CAMPAIGNS ===
${amazonCampaigns.campaigns?.length > 0 ? `
Last Updated: ${amazonCampaigns.lastUpdated ? new Date(amazonCampaigns.lastUpdated).toLocaleDateString() : 'N/A'}
Total Campaigns: ${amazonCampaigns.summary?.totalCampaigns || 0} (${amazonCampaigns.summary?.enabledCount || 0} enabled, ${amazonCampaigns.summary?.pausedCount || 0} paused)

CAMPAIGN PERFORMANCE SUMMARY:
- Total Spend: $${(amazonCampaigns.summary?.totalSpend || 0).toFixed(2)}
- Total Sales: $${(amazonCampaigns.summary?.totalSales || 0).toFixed(2)}
- Total Orders: ${amazonCampaigns.summary?.totalOrders || 0}
- ROAS: ${(amazonCampaigns.summary?.roas || 0).toFixed(2)}x
- ACOS: ${(amazonCampaigns.summary?.acos || 0).toFixed(1)}%
- Avg CPC: $${(amazonCampaigns.summary?.avgCpc || 0).toFixed(2)}
- Conversion Rate: ${(amazonCampaigns.summary?.convRate || 0).toFixed(2)}%

BY CAMPAIGN TYPE:
- Sponsored Products (SP): ${Array.isArray(amazonCampaigns.summary?.byType?.SP) ? amazonCampaigns.summary.byType.SP.length : 0} campaigns, $${(Array.isArray(amazonCampaigns.summary?.byType?.SP) ? amazonCampaigns.summary.byType.SP.reduce((s,c) => s + (c.spend || 0), 0) : 0).toFixed(0)} spend
- Sponsored Brands (SB): ${Array.isArray(amazonCampaigns.summary?.byType?.SB) ? amazonCampaigns.summary.byType.SB.length : 0} campaigns, $${(Array.isArray(amazonCampaigns.summary?.byType?.SB) ? amazonCampaigns.summary.byType.SB.reduce((s,c) => s + (c.spend || 0), 0) : 0).toFixed(0)} spend
- Sponsored Display (SD): ${Array.isArray(amazonCampaigns.summary?.byType?.SD) ? amazonCampaigns.summary.byType.SD.length : 0} campaigns, $${(Array.isArray(amazonCampaigns.summary?.byType?.SD) ? amazonCampaigns.summary.byType.SD.reduce((s,c) => s + (c.spend || 0), 0) : 0).toFixed(0)} spend

TOP 10 CAMPAIGNS BY SPEND:
${amazonCampaigns.campaigns?.slice().sort((a,b) => (b.spend || 0) - (a.spend || 0)).slice(0,10).map(c => 
  `- ${(c.name || 'Unknown').substring(0,50)}${(c.name || '').length > 50 ? '...' : ''}: $${(c.spend || 0).toFixed(0)} spend, $${(c.sales || 0).toFixed(0)} sales, ${(c.roas || 0).toFixed(2)}x ROAS, ${(c.acos || 0).toFixed(0)}% ACOS`
).join('\n')}

TOP 5 CAMPAIGNS BY ROAS (>$100 spend):
${amazonCampaigns.campaigns?.filter(c => c.spend > 100 && c.state === 'ENABLED').sort((a,b) => b.roas - a.roas).slice(0,5).map(c => 
  `- ${c.name.substring(0,40)}...: ${c.roas.toFixed(2)}x ROAS, $${c.spend.toFixed(0)} spend`
).join('\n') || 'No qualifying campaigns'}

CAMPAIGNS NEEDING ATTENTION (Low ROAS, >$100 spend):
${amazonCampaigns.campaigns?.filter(c => c.spend > 100 && c.roas < 2 && c.state === 'ENABLED').sort((a,b) => a.roas - b.roas).slice(0,5).map(c => 
  `- ${c.name.substring(0,40)}...: ${c.roas.toFixed(2)}x ROAS, ${c.acos.toFixed(0)}% ACOS - consider pausing or optimizing`
).join('\n') || 'All campaigns performing adequately'}

${amazonCampaigns.history?.length > 1 ? `
WEEK-OVER-WEEK TREND (${amazonCampaigns.history.length} weeks tracked):
${safe(() => {
  const current = amazonCampaigns.history[0]?.summary;
  const prior = amazonCampaigns.history[1]?.summary;
  if (!current || !prior) return 'Insufficient history';
  const spendChange = prior.totalSpend > 0 ? ((current.totalSpend - prior.totalSpend) / prior.totalSpend * 100) : 0;
  const salesChange = prior.totalSales > 0 ? ((current.totalSales - prior.totalSales) / prior.totalSales * 100) : 0;
  const roasChange = current.roas - prior.roas;
  return `Spend: $${current.totalSpend.toFixed(0)} (${spendChange >= 0 ? '+' : ''}${spendChange.toFixed(1)}% WoW)
Sales: $${current.totalSales.toFixed(0)} (${salesChange >= 0 ? '+' : ''}${salesChange.toFixed(1)}% WoW)
ROAS: ${current.roas.toFixed(2)}x (${roasChange >= 0 ? '+' : ''}${roasChange.toFixed(2)} WoW)`;
})}
` : ''}

${amazonCampaigns.analytics?.dayOfWeekInsights?.length > 0 ? `
📅 DAY-OF-WEEK PERFORMANCE (Amazon Ads):
${amazonCampaigns.analytics.dayOfWeekInsights.map(d => 
  `- ${d.day}: ROAS ${d.avgRoas?.toFixed(2)}x, ACOS ${d.avgAcos?.toFixed(1)}%, Avg Spend $${d.avgSpend?.toFixed(0)}, Avg Orders ${d.avgConversions?.toFixed(1)} (${d.sampleSize} samples)`
).join('\n')}

🏆 Best Day: ${amazonCampaigns.analytics.bestPerformingDay?.day} (${amazonCampaigns.analytics.bestPerformingDay?.avgRoas?.toFixed(2)}x ROAS)
📉 Worst Day: ${amazonCampaigns.analytics.worstPerformingDay?.day} (${amazonCampaigns.analytics.worstPerformingDay?.avgRoas?.toFixed(2)}x ROAS)

💡 OPTIMIZATION INSIGHT: Consider increasing ad spend on ${amazonCampaigns.analytics.bestPerformingDay?.day}s and reducing on ${amazonCampaigns.analytics.worstPerformingDay?.day}s to improve overall ROAS.
` : ''}

${amazonCampaigns.analytics?.monthlyTrends?.length > 0 ? `
📈 MONTHLY AD TRENDS:
${amazonCampaigns.analytics.monthlyTrends.slice(-6).map(m => 
  `- ${m.month}: $${m.spend?.toFixed(0)} spend → $${m.revenue?.toFixed(0)} ad rev, ${m.roas?.toFixed(2)}x ROAS, ${m.acos?.toFixed(1)}% ACOS`
).join('\n')}
` : ''}
` : 'No Amazon campaign data uploaded yet. User can upload Amazon Ads campaign report CSV.'}

=== DTC ADVERTISING (Meta + Google) ===
${ctx.dailyAdsData ? `
**LAST 7 DAYS:**
- Meta Spend: $${ctx.dailyAdsData.last7Days.metaSpend?.toFixed(2) || 0}
- Google Spend: $${ctx.dailyAdsData.last7Days.googleSpend?.toFixed(2) || 0}
- Total DTC Ads: $${ctx.dailyAdsData.last7Days.totalSpend?.toFixed(2) || 0}
- Avg Daily Spend: $${ctx.dailyAdsData.last7Days.avgDailySpend?.toFixed(2) || 0}
- Days with Data: ${ctx.dailyAdsData.last7Days.daysWithData || 0}

**LAST 30 DAYS:**
- Meta Spend: $${ctx.dailyAdsData.last30Days.metaSpend?.toFixed(2) || 0}
- Google Spend: $${ctx.dailyAdsData.last30Days.googleSpend?.toFixed(2) || 0}
- Total DTC Ads: $${ctx.dailyAdsData.last30Days.totalSpend?.toFixed(2) || 0}
- Avg Daily Spend: $${ctx.dailyAdsData.last30Days.avgDailySpend?.toFixed(2) || 0}
- Days with Data: ${ctx.dailyAdsData.last30Days.daysWithData || 0}
${ctx.dailyAdsData.last30Days.ctr > 0 ? `- CTR: ${ctx.dailyAdsData.last30Days.ctr}%
- Avg CPC: $${ctx.dailyAdsData.last30Days.cpc}` : ''}

**WEEKLY BREAKDOWN:**
${ctx.dailyAdsData.byWeek?.length > 0 ? ctx.dailyAdsData.byWeek.map(w => 
  `- ${w.week}: Meta $${w.metaSpend?.toFixed(0)}, Google $${w.googleSpend?.toFixed(0)}, Total $${w.totalSpend?.toFixed(0)}`
).join('\n') : 'No weekly ad data available'}

💡 NOTE: DTC ads data comes from daily uploads. If a week shows missing ads in alerts, it means no ads CSV was uploaded for those days.
` : 'No DTC (Meta/Google) ads data uploaded yet. User can upload Meta/Google ads reports via Upload tab → Bulk Ads Upload.'}

=== AI LEARNING STATUS ===
${ctx.aiLearning ? `
Forecast Correction Factors (learned from comparing predictions to actuals):
- Revenue Multiplier: ${ctx.aiLearning.forecastCorrections.revenueMultiplier.toFixed(3)}x
- Units Multiplier: ${ctx.aiLearning.forecastCorrections.unitsMultiplier.toFixed(3)}x
- Learning Confidence: ${ctx.aiLearning.forecastCorrections.confidence.toFixed(0)}%
- Samples Used: ${ctx.aiLearning.forecastCorrections.samplesUsed}

Prediction History:
- Total Predictions Made: ${ctx.aiLearning.predictionHistory.totalPredictions}
- Verified with Actuals: ${ctx.aiLearning.predictionHistory.verifiedPredictions}
- Recent Accuracy: ${ctx.aiLearning.predictionHistory.recentAccuracy ? ctx.aiLearning.predictionHistory.recentAccuracy.toFixed(1) + '%' : 'Still learning'}

${ctx.aiLearning.recentPredictions.length > 0 ? `Recent Predictions vs Actuals:
${ctx.aiLearning.recentPredictions.map(p => 
  `- ${p.type} (${p.period}): Predicted $${p.predicted?.toFixed(0) || 'N/A'}, Actual $${p.actual?.toFixed(0) || 'pending'}, Error: ${p.error ? p.error.toFixed(1) + '%' : 'awaiting actual'}`
).join('\n')}` : 'No predictions tracked yet'}

USE THIS LEARNING: When forecasting, apply the correction factors if confidence > 30%. This helps adjust for systematic biases in predictions.
` : 'AI Learning not yet initialized'}

=== WHAT YOU CAN HELP WITH ===
- Analyze sales trends and patterns (weekly, monthly, quarterly, yearly)
- Year-over-year comparisons (2024 vs 2025, Q1 vs Q1, etc.)
- Quarterly and monthly trend analysis
- Compare performance across weeks, months, quarters, years, products
- Identify best/worst performing SKUs and their trends over time
- Track progress toward goals
- Explain profit margins and calculations
- Forecast future revenue based on historical trends
- Compare Amazon's projections vs actual performance

📦 INVENTORY & REORDER PLANNING:
- Identify which SKUs will stock out and when
- Recommend when to place reorders based on lead times
- Calculate suggested order quantities
- Identify overstock items tying up capital
- Analyze velocity trends (which products are speeding up vs slowing down)
- Channel mix analysis for inventory planning (Amazon vs Shopify velocity)

📊 ADVERTISING OPTIMIZATION:
- Analyze Amazon PPC performance (ROAS, ACOS, TACOS)
- Day-of-week performance analysis (best/worst days to advertise)
- Campaign-level recommendations (pause, increase spend, optimize)
- Monthly and weekly ad spend trends
- Identify high-potential campaigns to scale

💰 FINANCIAL ANALYSIS:
- Answer questions about specific products by name or SKU
- Sales tax obligations by state
- Upcoming bills and cash flow planning
- Production pipeline tracking and timing
- Seasonality analysis (which months/quarters perform best)
- Cost structure analysis (COGS, fees, ads as % of revenue over time)
- 3PL cost analysis (avg cost per order, storage trends, shipping cost changes)
- Identify rising fulfillment costs that may be eroding margins
- Compare 3PL efficiency across time periods
- Amazon PPC campaign analysis (ROAS, ACOS by campaign, top/bottom performers)
- Campaign optimization recommendations (which campaigns to pause, scale, or optimize)
- Week-over-week campaign performance changes
- Campaign type comparison (SP vs SB vs SD effectiveness)
- **BANKING/CASH FLOW ANALYSIS** - analyze real bank transactions to find waste, forecast EOY profit

=== BANKING & CASH FLOW DATA ===
${ctx.banking ? `
Banking data available from ${ctx.banking.dateRange?.start} to ${ctx.banking.dateRange?.end}
Total transactions: ${ctx.banking.transactionCount}
Last upload: ${ctx.banking.lastUpload ? new Date(ctx.banking.lastUpload).toLocaleString() : 'Unknown'}

${bankingData?.profitAndLoss?.details ? `
QUICKBOOKS PROFIT & LOSS (${bankingData.profitAndLoss.period?.start || 'unknown'} to ${bankingData.profitAndLoss.period?.end || 'unknown'}):
- Total Income: $${(bankingData.profitAndLoss.details['Total Income'] || 0).toLocaleString()}
- Total COGS: $${(bankingData.profitAndLoss.details['Total Cost of Goods Sold'] || 0).toLocaleString()}
- Gross Profit: $${((bankingData.profitAndLoss.details['Total Income'] || 0) - (bankingData.profitAndLoss.details['Total Cost of Goods Sold'] || 0)).toLocaleString()}
- Total Expenses: $${(bankingData.profitAndLoss.details['Total Expenses'] || 0).toLocaleString()}
- Net Operating Income: $${((bankingData.profitAndLoss.details['Total Income'] || 0) - (bankingData.profitAndLoss.details['Total Cost of Goods Sold'] || 0) - (bankingData.profitAndLoss.details['Total Expenses'] || 0)).toLocaleString()}
Key Expense Lines:
${Object.entries(bankingData.profitAndLoss.details || {})
  .filter(([k, v]) => typeof v === 'number' && v > 100 && !k.startsWith('Total') && !k.includes('Sales'))
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([k, v]) => `  - ${k}: $${v.toLocaleString()}`)
  .join('\n')}
` : ''}

MONTHLY CASH FLOW (last 12 months):
${ctx.banking.monthlySnapshots.map(m => 
  `- ${m.month}: Income $${m.income?.toFixed(0) || 0}, Expenses $${m.expenses?.toFixed(0) || 0}, Net $${m.net?.toFixed(0) || 0}`
).join('\n')}

TOP EXPENSE CATEGORIES:
${ctx.banking.topExpenseCategories.map((c, i) => 
  `${i + 1}. ${c.name}: $${c.total?.toFixed(0) || 0} (${c.count} transactions)`
).join('\n')}

TOP INCOME SOURCES:
${ctx.banking.topIncomeCategories.map((c, i) => 
  `${i + 1}. ${c.name}: $${c.total?.toFixed(0) || 0} (${c.count} transactions)`
).join('\n')}

ACCOUNTS:
${ctx.banking.accounts.map(a => 
  `- ${a.name}: ${a.transactions} txns, In: $${a.totalIn?.toFixed(0) || 0}, Out: $${a.totalOut?.toFixed(0) || 0}`
).join('\n')}

You can help with:
- Identifying where money is being wasted (unusual expense patterns, rising costs)
- Projecting end-of-year profit based on monthly trends
- Calculating true business profitability (income - all expenses)
- Comparing expense categories over time to find cost creep
- Analyzing cash flow patterns and forecasting cash needs
- Identifying the biggest expense drivers
` : 'No banking data uploaded yet. User can upload QBO Transaction Detail by Account CSV.'}

Format all currency as $X,XXX.XX. Be concise but thorough. Reference specific numbers when discussing trends. When comparing periods, always show the actual numbers and % change. If the user asks about data you don't have, let them know what they need to upload.

=== 🧠 AI LEARNING INSTRUCTIONS ===
You have access to the MULTI-SIGNAL AI FORECAST which is the most accurate forecast available. Use it as your PRIMARY source for predictions.

**PRODUCT IDENTIFICATION (CRITICAL):**
- Users may ask using EITHER product name OR SKU code
- ALWAYS resolve to SKU internally for data lookup
- When user says a category name → find SKUs in skusByCategory → aggregate skuMasterData for those SKUs
- When user says a specific SKU → look up directly in skuMasterData
- When user says a product description → search productCatalog for matching name → get SKU → look up in skuMasterData
- In responses, show BOTH SKU code and product name: "SKU (Product Name): $X revenue"

**FOR SKU-LEVEL ANALYSIS:**
1. Use skuMasterData as the authoritative source for all SKU data
2. Each SKU has: totalRevenue, totalUnits, byPeriod (monthly), byWeek (recent weeks)
3. For category totals, sum data from all SKUs in that category
4. For period-specific questions, use skuMasterData[sku].byPeriod["january-2025"]

**FOR PREDICTIONS:**
1. Always use the Multi-Signal AI Forecast data (if available) for weekly predictions
2. Check the FORECAST ACCURACY LEARNING section to understand how past predictions performed
3. Apply any correction bias you observe (e.g., if forecasts are consistently 5% low, adjust up 5%)
4. Consider momentum - if daily trends show acceleration/deceleration, factor this in

**FOR ANALYSIS:**
1. Cross-reference sales data with banking data when available to validate accuracy
2. Use seasonal patterns to contextualize current performance
3. Reference the day-of-week patterns for tactical recommendations

**FOR CONSISTENCY:**
1. Your predictions should align with the Multi-Signal AI Forecast shown on the dashboard
2. If asked "what will next week's revenue be?", use the Multi-Signal next week prediction
3. Be transparent about confidence levels and data quality
4. Always show SKU codes alongside product names in responses for clarity

The goal is for you to learn from the forecast vs actual comparisons over time and become increasingly accurate.`;
};

export default buildChatSystemPrompt;
