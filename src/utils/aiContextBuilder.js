// aiContextBuilder.js — Extracted from App.jsx for maintainability
// Builds the data context object for AI chat system prompts
// Each section is try/catch guarded so partial data failures don't kill chat

import { hasDailySalesData } from './date';

/**
 * Build comprehensive data context for AI chat.
 * @param {Object} deps - All state dependencies from App
 * @returns {Object} ctx - Data context for system prompt
 */
export const prepareDataContext = (deps) => {
  const {
    allDaysData, allWeeksData, allPeriodsData,
    savedProductNames, savedCogs, invHistory,
    forecastCorrections, amazonForecasts, leadTimeSettings,
    storeName, salesTaxConfig, threeplLedger,
    goals, bankingData, aiLearningHistory,
    getProfit, get3PLForPeriod,
  } = deps;

  // Helper: run a computation, return fallback on error instead of crashing
  const safe = (fn, fallback = null, label = '') => {
    try { return fn(); } catch (e) {
      console.warn(`[aiContext${label ? ': ' + label : ''}]`, e.message);
      return fallback;
    }
  };

    const weeksCount = Object.keys(allWeeksData || {}).length;
    const sortedWeeks = Object.keys(allWeeksData || {}).sort();
    const sortedDays = Object.keys(allDaysData || {}).filter(d => hasDailySalesData(allDaysData[d])).sort();
    const daysCount = sortedDays.length;
    const periodsCount = Object.keys(allPeriodsData || {}).length;

  try {
    
    // Daily data summary - for forecasting, only include days with COMPLETE data
    // Amazon has a reporting delay, so days with Shopify but no Amazon are incomplete
    // Exception: Include Shopify-only days from early 2024/2025 before Amazon was active
    const amazonStartDate = '2024-06-01'; // Approximate date Amazon sales started
    
    const dailySummary = sortedDays.slice(-30).map(day => {
      const data = allDaysData[day];
      const amazonRevenue = data.amazon?.revenue || 0;
      const shopifyRevenue = data.shopify?.revenue || 0;
      const isEarlyData = day < amazonStartDate;
      
      // For recent days, only include if Amazon has data (or it's early data before Amazon)
      const hasCompleteData = amazonRevenue > 0 || isEarlyData || day < '2024-01-01';
      
      return {
        date: day,
        totalRevenue: data.total?.revenue || 0,
        totalProfit: getProfit(data.total),
        totalUnits: data.total?.units || 0,
        amazonRevenue,
        amazonProfit: data.amazon?.netProfit || 0,
        shopifyRevenue,
        shopifyProfit: data.shopify?.netProfit || 0,
        hasCompleteData, // Flag for filtering in trend calculations
      };
    }).filter(d => d.totalRevenue > 0); // Still need some revenue
    
    const weeksSummary = sortedWeeks.map(week => {
      const data = allWeeksData[week];
      const amz = data.amazon || {};
      const shop = data.shopify || {};
      const total = data.total || {};
      
      // Adjust date if it's Monday (start of week) to show Sunday (end of week)
      const weekDate = new Date(week + 'T00:00:00');
      const dayOfWeek = weekDate.getDay();
      const weekEndDate = dayOfWeek === 1 
        ? new Date(weekDate.getTime() - 24 * 60 * 60 * 1000) 
        : weekDate;
      const weekEndStr = weekEndDate.toISOString().split('T')[0];
      
      return {
        weekEnding: weekEndStr,
        weekKey: week, // Original key
        totalRevenue: total.revenue || 0,
        totalProfit: total.netProfit || 0,
        totalUnits: total.units || 0,
        margin: total.revenue ? ((total.netProfit || 0) / total.revenue * 100).toFixed(1) : 0,
        amazonRevenue: amz.revenue || 0,
        amazonProfit: amz.netProfit || 0,
        shopifyRevenue: shop.revenue || 0,
        shopifyProfit: shop.netProfit || 0,
      };
    });
    
    const periodsSummary = Object.entries(allPeriodsData).map(([label, data]) => {
      const amz = data.amazon || {};
      const shop = data.shopify || {};
      
      // Get 3PL data from ledger for this period
      const ledger3PL = get3PLForPeriod(threeplLedger, label);
      const threeplFromLedger = ledger3PL?.metrics?.totalCost || 0;
      
      // Compute category breakdown for this period (like we do for weeks)
      const categoryBreakdown = {};
      const processSkusForPeriod = (skuData, channel) => {
        (skuData || []).forEach(s => {
          const sku = s.sku || s.msku || '';
          const productName = (savedProductNames[sku] || s.name || s.title || sku).toLowerCase();
          const units = s.unitsSold || s.units || 0;
          const revenue = s.netSales || s.revenue || 0;
          const profit = channel === 'Amazon' ? (s.netProceeds || revenue) : (revenue - (s.cogs || 0));
          
          // Determine category (same logic as computeCategoryBreakdown)
          let category = 'Other';
          if (productName.includes('lip balm') || productName.includes('lip-balm')) category = 'Lip Balm';
          else if (productName.includes('sensitive') && productName.includes('deodorant')) category = 'Sensitive Skin Deodorant';
          else if (productName.includes('extra strength') && productName.includes('deodorant')) category = 'Extra Strength Deodorant';
          else if (productName.includes('deodorant') || productName.includes('deo')) category = 'Deodorant';
          else if (productName.includes('athlete') && productName.includes('soap')) category = "Athlete's Shield Soap";
          else if (productName.includes('soap') || productName.includes('bar soap')) category = 'Tallow Soap Bars';
          else if (productName.includes('sun balm') || productName.includes('spf')) category = 'Sun Balm';
          else if (productName.includes('tallow balm') || productName.includes('moisturizer')) category = 'Tallow Balm';
          
          // Fallback: check for lip balm pack patterns (handles "Sweet Orange 3-Pack", "Assorted Pack", etc.)
          if (category === 'Other') {
            const combined = (sku + ' ' + productName).toLowerCase();
            // Check for pack patterns with lip balm flavors/variants
            const isLipBalmPack = (
              (combined.includes('pack') || combined.includes('pk')) && (
                combined.includes('orange') || combined.includes('peppermint') || 
                combined.includes('vanilla') || combined.includes('lavender') ||
                combined.includes('unscented') || combined.includes('assorted') ||
                combined.includes('mint') || combined.includes('honey') ||
                combined.includes('sweet') || combined.includes('citrus') ||
                combined.includes('cherry') || combined.includes('berry')
              )
            );
            // Also check for lip balm SKU patterns (like LB-, BALM-, etc.)
            const hasLipBalmSku = /^(lb|balm|lip)/i.test(sku) || sku.toLowerCase().includes('lip');
            
            if (isLipBalmPack || hasLipBalmSku) {
              category = 'Lip Balm';
            }
          }
          
          if (!categoryBreakdown[category]) {
            categoryBreakdown[category] = { units: 0, revenue: 0, profit: 0 };
          }
          categoryBreakdown[category].units += units;
          categoryBreakdown[category].revenue += revenue;
          categoryBreakdown[category].profit += profit;
        });
      };
      
      processSkusForPeriod(amz.skuData, 'Amazon');
      processSkusForPeriod(shop.skuData, 'Shopify');
      
      // Also build SKU-level breakdown for detailed queries
      const skuBreakdown = {};
      const buildSkuBreakdown = (skuData) => {
        (skuData || []).forEach(s => {
          const sku = s.sku || s.msku || '';
          if (!sku) return;
          const name = savedProductNames[sku] || s.name || s.title || sku;
          const revenue = s.netSales || s.revenue || 0;
          const units = s.unitsSold || s.units || 0;
          if (!skuBreakdown[sku]) {
            skuBreakdown[sku] = { name, revenue: 0, units: 0 };
          }
          skuBreakdown[sku].revenue += revenue;
          skuBreakdown[sku].units += units;
        });
      };
      buildSkuBreakdown(amz.skuData);
      buildSkuBreakdown(shop.skuData);
      
      return {
        period: label,
        label: data.label || label,
        type: (() => {
          const l = label.toLowerCase();
          if (l.match(/^\d{4}$/)) return 'yearly';
          if (l.match(/^q\d/i)) return 'quarterly';
          if (l.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i)) return 'monthly';
          return 'monthly';
        })(),
        totalRevenue: data.total?.revenue || 0,
        totalProfit: getProfit(data.total),
        totalUnits: data.total?.units || 0,
        totalCogs: data.total?.cogs || 0,
        totalAdSpend: data.total?.adSpend || 0,
        margin: data.total?.revenue > 0 ? ((getProfit(data.total)) / data.total.revenue * 100) : 0,
        amazonRevenue: amz.revenue || 0,
        amazonProfit: amz.netProfit || 0,
        amazonUnits: amz.units || 0,
        shopifyRevenue: shop.revenue || 0,
        shopifyProfit: shop.netProfit || 0,
        shopifyUnits: shop.units || 0,
        threeplCosts: threeplFromLedger || shop.threeplCosts || 0,
        skuCount: ((amz.skuData || []).length + (shop.skuData || []).length),
        byCategory: categoryBreakdown, // Category breakdown for this period
        skuBreakdown: skuBreakdown, // SKU-level breakdown for detailed queries
      };
    }).sort((a, b) => a.period.localeCompare(b.period));
    
    // Calculate year-over-year insights
    const yoyInsights = [];
    const quarters2024 = periodsSummary.filter(p => p.period.includes('2024') && p.type === 'quarterly');
    const months2024 = periodsSummary.filter(p => p.period.includes('2024') && p.type === 'monthly');
    const months2025 = periodsSummary.filter(p => p.period.includes('2025') && p.type === 'monthly');
    
    // Q4 2024 vs Q4 2025 (or most recent comparable quarters)
    quarters2024.forEach(q2024 => {
      const qNum = q2024.period.split(' ')[0]; // e.g., "Q3"
      const q2025 = periodsSummary.find(p => p.period === `${qNum} 2025`);
      if (q2025) {
        yoyInsights.push({
          comparison: `${qNum} YoY`,
          period1: q2024.period,
          period2: q2025.period,
          revChange: q2024.totalRevenue > 0 ? ((q2025.totalRevenue - q2024.totalRevenue) / q2024.totalRevenue * 100) : 0,
          profitChange: q2024.totalProfit > 0 ? ((q2025.totalProfit - q2024.totalProfit) / q2024.totalProfit * 100) : 0,
        });
      }
    });
    
    // Monthly trends for 2025
    const monthlyTrend2025 = months2025.map(m => ({
      month: m.label,
      revenue: m.totalRevenue,
      profit: m.totalProfit,
      margin: m.margin,
    }));
    
    const skuWeeklyBreakdown = {};
    sortedWeeks.forEach(week => {
      const data = allWeeksData[week];
      (data.amazon?.skuData || []).forEach(s => {
        const sku = s.sku || s.msku || 'unknown';
        if (!skuWeeklyBreakdown[sku]) {
          skuWeeklyBreakdown[sku] = { sku, name: s.name || s.title || sku, channel: 'Amazon', weeks: {}, totals: { revenue: 0, units: 0, profit: 0, fees: 0 } };
        }
        const units = s.unitsSold || s.units || 0;
        const revenue = s.netSales || s.revenue || 0;
        const proceeds = s.netProceeds || revenue;
        // Amazon: netProceeds IS the profit (already has COGS, fees, and ad spend deducted)
        const profit = proceeds;
        const fees = revenue - proceeds;
        skuWeeklyBreakdown[sku].weeks[week] = { units, revenue, profit, fees, profitPerUnit: units > 0 ? profit / units : 0 };
        skuWeeklyBreakdown[sku].totals.revenue += revenue;
        skuWeeklyBreakdown[sku].totals.units += units;
        skuWeeklyBreakdown[sku].totals.profit += profit;
        skuWeeklyBreakdown[sku].totals.fees += fees;
      });
      (data.shopify?.skuData || []).forEach(s => {
        const sku = 'SHOP_' + (s.sku || 'unknown');
        if (!skuWeeklyBreakdown[sku]) {
          skuWeeklyBreakdown[sku] = { sku: s.sku, name: s.name || s.title || s.sku, channel: 'Shopify', weeks: {}, totals: { revenue: 0, units: 0, profit: 0, fees: 0 } };
        }
        const units = s.unitsSold || s.units || 0;
        const revenue = s.netSales || s.revenue || 0;
        // Shopify: netSales already has discounts deducted, subtract COGS
        const profit = revenue - (s.cogs || 0);
        skuWeeklyBreakdown[sku].weeks[week] = { units, revenue, profit, fees: 0, profitPerUnit: units > 0 ? profit / units : 0 };
        skuWeeklyBreakdown[sku].totals.revenue += revenue;
        skuWeeklyBreakdown[sku].totals.units += units;
        skuWeeklyBreakdown[sku].totals.profit += profit;
      });
    });
    
    const skuAnalysis = Object.values(skuWeeklyBreakdown).filter(s => s.totals.units >= 1).map(s => {
      const weekDates = Object.keys(s.weeks).sort();
      const recentWeeks = weekDates.slice(-4);
      const olderWeeks = weekDates.slice(-8, -4);
      let recentUnits = 0, recentProfit = 0, olderUnits = 0, olderProfit = 0;
      recentWeeks.forEach(w => { recentUnits += s.weeks[w].units; recentProfit += s.weeks[w].profit; });
      olderWeeks.forEach(w => { olderUnits += s.weeks[w].units; olderProfit += s.weeks[w].profit; });
      const recentPPU = recentUnits > 0 ? recentProfit / recentUnits : 0;
      const olderPPU = olderUnits > 0 ? olderProfit / olderUnits : 0;
      const ppuChange = olderWeeks.length > 0 ? recentPPU - olderPPU : 0;
      const overallPPU = s.totals.units > 0 ? s.totals.profit / s.totals.units : 0;
      const overallMargin = s.totals.revenue > 0 ? (s.totals.profit / s.totals.revenue * 100) : 0;
      // Get product name from savedProductNames if available
      const productName = savedProductNames[s.sku] || s.name || s.sku;
      return {
        sku: s.sku, name: s.name, productName, channel: s.channel,
        totalRevenue: s.totals.revenue, totalUnits: s.totals.units, totalProfit: s.totals.profit, totalFees: s.totals.fees,
        profitPerUnit: overallPPU, margin: overallMargin,
        recentProfitPerUnit: recentPPU, priorProfitPerUnit: olderPPU, profitPerUnitChange: ppuChange,
        trend: ppuChange > 0.5 ? 'improving' : ppuChange < -0.5 ? 'declining' : 'stable',
      };
    }).sort((a, b) => b.totalRevenue - a.totalRevenue);
    
    const latestInvDate = Object.keys(invHistory).sort().reverse()[0];
    const latestInv = latestInvDate ? invHistory[latestInvDate] : null;
    
    // Build comprehensive inventory data for AI
    const inventoryItems = latestInv?.items || [];
    const inventorySummary = latestInv ? {
      asOfDate: latestInvDate, 
      totalUnits: latestInv.summary?.totalUnits || 0, 
      totalValue: latestInv.summary?.totalValue || 0,
      amazonUnits: latestInv.summary?.amazonUnits || 0,
      threeplUnits: latestInv.summary?.threeplUnits || 0,
      awdUnits: latestInv.summary?.awdUnits || 0,
      awdValue: latestInv.summary?.awdValue || 0,
      amazonInbound: latestInv.summary?.amazonInbound || 0,
      healthBreakdown: {
        critical: latestInv.summary?.critical || 0,
        low: latestInv.summary?.low || 0,
        healthy: latestInv.summary?.healthy || 0,
        overstock: latestInv.summary?.overstock || 0,
      },
      // Items needing attention
      criticalItems: inventoryItems.filter(i => i.health === 'critical').map(i => ({
        sku: i.sku, name: i.name, totalQty: i.totalQty, daysOfSupply: i.daysOfSupply,
        weeklyVelocity: i.weeklyVel, stockoutDate: i.stockoutDate, reorderByDate: i.reorderByDate,
        safetyStock: i.safetyStock, reorderPoint: i.reorderPoint, demandClass: i.demandClass
      })),
      lowStockItems: inventoryItems.filter(i => i.health === 'low').map(i => ({
        sku: i.sku, name: i.name, totalQty: i.totalQty, daysOfSupply: i.daysOfSupply,
        weeklyVelocity: i.weeklyVel, stockoutDate: i.stockoutDate, reorderByDate: i.reorderByDate,
        safetyStock: i.safetyStock, reorderPoint: i.reorderPoint, demandClass: i.demandClass
      })),
      // Overstock items (opportunity to reduce)
      overstockItems: inventoryItems.filter(i => i.health === 'overstock' && i.daysOfSupply > 180).map(i => ({
        sku: i.sku, name: i.name, totalQty: i.totalQty, daysOfSupply: i.daysOfSupply,
        weeklyVelocity: i.weeklyVel, totalValue: i.totalValue, demandClass: i.demandClass
      })).sort((a, b) => b.totalValue - a.totalValue).slice(0, 10),
      // Top movers by velocity
      topMovers: inventoryItems.filter(i => i.weeklyVel > 0).sort((a, b) => b.weeklyVel - a.weeklyVel).slice(0, 10).map(i => ({
        sku: i.sku, name: i.name, weeklyVelocity: i.weeklyVel, amazonVelocity: i.amzWeeklyVel, shopifyVelocity: i.shopWeeklyVel,
        daysOfSupply: i.daysOfSupply, totalQty: i.totalQty,
        safetyStock: i.safetyStock, seasonalFactor: i.seasonalFactor, cv: i.cv, demandClass: i.demandClass
      })),
      // Velocity trends (comparing Amazon vs Shopify)
      velocityByChannel: {
        amazonTotal: inventoryItems.reduce((sum, i) => sum + (i.amzWeeklyVel || 0), 0),
        shopifyTotal: inventoryItems.reduce((sum, i) => sum + (i.shopWeeklyVel || 0), 0),
      },
      // Reorder recommendations
      needsReorderSoon: inventoryItems.filter(i => {
        const daysUntilOrder = i.daysUntilMustOrder;
        return daysUntilOrder !== null && daysUntilOrder <= 14 && daysUntilOrder > 0;
      }).map(i => ({
        sku: i.sku, name: i.name, daysUntilMustOrder: i.daysUntilMustOrder, 
        suggestedOrderQty: i.suggestedOrderQty, currentQty: i.totalQty,
        weeklyVelocity: i.weeklyVel, leadTimeDays: i.leadTimeDays
      })),
      // Already past reorder point
      urgentReorder: inventoryItems.filter(i => {
        const daysUntilOrder = i.daysUntilMustOrder;
        return daysUntilOrder !== null && daysUntilOrder <= 0;
      }).map(i => ({
        sku: i.sku, name: i.name, daysOverdue: Math.abs(i.daysUntilMustOrder),
        suggestedOrderQty: i.suggestedOrderQty, stockoutDate: i.stockoutDate,
        weeklyVelocity: i.weeklyVel, safetyStock: i.safetyStock
      })),
      // Industry-standard demand analysis
      demandAnalysis: {
        methodology: 'Weighted Moving Average with Safety Stock, Seasonality Index, and CV Classification',
        serviceLevel: '95% (Z=1.65)',
        demandClassification: inventoryItems.reduce((acc, i) => {
          const cls = i.demandClass || 'unknown';
          acc[cls] = (acc[cls] || 0) + 1;
          return acc;
        }, {}),
        totalSafetyStockUnits: inventoryItems.reduce((sum, i) => sum + (i.safetyStock || 0), 0),
        highVariabilityProducts: inventoryItems.filter(i => i.cv >= 0.8).sort((a, b) => b.cv - a.cv).slice(0, 5).map(i => ({
          sku: i.sku, name: i.name, cv: i.cv, demandClass: i.demandClass, safetyStock: i.safetyStock
        })),
        seasonalHighlights: inventoryItems.filter(i => i.seasonalFactor && Math.abs(i.seasonalFactor - 1.0) > 0.15).map(i => ({
          sku: i.sku, seasonalFactor: i.seasonalFactor, direction: i.seasonalFactor > 1 ? 'peak' : 'slow'
        })).slice(0, 10),
      },
    } : null;
    
    // Calculate velocity trends (is velocity increasing or decreasing?)
    // Compare last 2 weeks velocity vs prior 2 weeks
    const velocityTrends = {};
    const sortedWeeksForTrend = Object.keys(allWeeksData).sort().reverse();
    const recent2Weeks = sortedWeeksForTrend.slice(0, 2);
    const prior2Weeks = sortedWeeksForTrend.slice(2, 4);
    
    // Build SKU velocity by period
    const recentVelocity = {};
    const priorVelocity = {};
    
    recent2Weeks.forEach(w => {
      const weekData = allWeeksData[w];
      [...(weekData?.amazon?.skuData || []), ...(weekData?.shopify?.skuData || [])].forEach(s => {
        const sku = s.sku || s.msku;
        if (!sku) return;
        if (!recentVelocity[sku]) recentVelocity[sku] = 0;
        recentVelocity[sku] += s.unitsSold || s.units || 0;
      });
    });
    
    prior2Weeks.forEach(w => {
      const weekData = allWeeksData[w];
      [...(weekData?.amazon?.skuData || []), ...(weekData?.shopify?.skuData || [])].forEach(s => {
        const sku = s.sku || s.msku;
        if (!sku) return;
        if (!priorVelocity[sku]) priorVelocity[sku] = 0;
        priorVelocity[sku] += s.unitsSold || s.units || 0;
      });
    });
    
    // Calculate trends
    inventoryItems.forEach(item => {
      if (!item.sku || !item.weeklyVel) return;
      const skuLower = item.sku.toLowerCase();
      const recent = (recentVelocity[item.sku] || recentVelocity[skuLower] || 0) / Math.max(recent2Weeks.length, 1);
      const prior = (priorVelocity[item.sku] || priorVelocity[skuLower] || 0) / Math.max(prior2Weeks.length, 1);
      
      let trend = 'stable';
      let trendPercent = 0;
      if (prior > 0) {
        trendPercent = ((recent - prior) / prior) * 100;
        if (trendPercent > 15) trend = 'accelerating';
        else if (trendPercent > 5) trend = 'increasing';
        else if (trendPercent < -15) trend = 'declining';
        else if (trendPercent < -5) trend = 'slowing';
      } else if (recent > 0) {
        trend = 'new';
        trendPercent = 100;
      }
      
      velocityTrends[item.sku] = {
        currentWeekly: item.weeklyVel,
        recentAvgWeekly: recent,
        priorAvgWeekly: prior,
        trend,
        trendPercent: trendPercent.toFixed(1) + '%',
        amazonShare: item.weeklyVel > 0 ? ((item.amzWeeklyVel || 0) / item.weeklyVel * 100).toFixed(0) + '%' : '0%',
        shopifyShare: item.weeklyVel > 0 ? ((item.shopWeeklyVel || 0) / item.weeklyVel * 100).toFixed(0) + '%' : '0%',
      };
    });
    
    // Add velocity trends to inventory summary for AI
    if (inventorySummary) {
      inventorySummary.velocityTrends = {
        accelerating: Object.entries(velocityTrends).filter(([,v]) => v.trend === 'accelerating').map(([sku, v]) => ({ sku, ...v })).slice(0, 5),
        declining: Object.entries(velocityTrends).filter(([,v]) => v.trend === 'declining').map(([sku, v]) => ({ sku, ...v })).slice(0, 5),
      };
    }
    
    const taxSummary = {
      nexusStates: Object.entries(salesTaxConfig.nexusStates || {}).filter(([,v]) => v.hasNexus).map(([code, config]) => ({ state: US_STATES_TAX_INFO[code]?.name || code, frequency: config.frequency })),
      totalPaidAllTime: Object.values(salesTaxConfig.filingHistory || {}).reduce((sum, periods) => sum + Object.values(periods).reduce((s, p) => s + (p.amount || 0), 0), 0),
    };
    
    // Build product catalog with categories from product names
    const productCatalog = Object.entries(savedProductNames).map(([sku, name]) => {
      // Auto-detect category from product name
      const nameLower = name.toLowerCase();
      let category = 'Other';
      if (nameLower.includes('lip balm')) category = 'Lip Balm';
      else if (nameLower.includes('deodorant') && nameLower.includes('sensitive')) category = 'Sensitive Skin Deodorant';
      else if (nameLower.includes('deodorant') && nameLower.includes('extra strength')) category = 'Extra Strength Deodorant';
      else if (nameLower.includes('deodorant')) category = 'Deodorant';
      else if (nameLower.includes('soap') && nameLower.includes('athlete')) category = "Athlete's Shield Soap";
      else if (nameLower.includes('soap')) category = 'Tallow Soap Bars';
      else if (nameLower.includes('sun balm')) category = 'Sun Balm';
      else if (nameLower.includes('tallow balm')) category = 'Tallow Balm';
      
      return { sku, name, category };
    });
    
    // Group SKUs by category for easier AI lookup
    const skusByCategory = {};
    productCatalog.forEach(p => {
      if (!skusByCategory[p.category]) skusByCategory[p.category] = [];
      skusByCategory[p.category].push(p.sku);
    });
    
    // COMPREHENSIVE SKU-LEVEL AGGREGATION (combines all periods + weeks)
    const skuMasterData = {};
    
    // Add period data (2025 monthly, 2024 quarterly)
    periodsSummary.filter(p => p.totalRevenue > 0).forEach(period => {
      Object.entries(period.skuBreakdown || {}).forEach(([sku, data]) => {
        if (!skuMasterData[sku]) {
          const catalogEntry = productCatalog.find(p => p.sku === sku);
          skuMasterData[sku] = {
            sku,
            name: catalogEntry?.name || data.name || sku,
            category: catalogEntry?.category || 'Other',
            totalRevenue: 0,
            totalUnits: 0,
            byPeriod: {},
            byWeek: {},
          };
        }
        skuMasterData[sku].totalRevenue += data.revenue || 0;
        skuMasterData[sku].totalUnits += data.units || 0;
        skuMasterData[sku].byPeriod[period.period] = { revenue: data.revenue, units: data.units };
      });
    });
    
    // Add weekly data (recent weeks)
    sortedWeeks.slice(-12).forEach(week => {
      const weekData = allWeeksData[week];
      if (!weekData) return;
      
      const processWeekSkus = (skuData, channel) => {
        (skuData || []).forEach(s => {
          const sku = s.sku || s.msku || '';
          if (!sku) return;
          const revenue = s.netSales || s.revenue || 0;
          const units = s.unitsSold || s.units || 0;
          
          if (!skuMasterData[sku]) {
            const catalogEntry = productCatalog.find(p => p.sku === sku);
            skuMasterData[sku] = {
              sku,
              name: catalogEntry?.name || savedProductNames[sku] || s.name || sku,
              category: catalogEntry?.category || 'Other',
              totalRevenue: 0,
              totalUnits: 0,
              byPeriod: {},
              byWeek: {},
            };
          }
          
          if (!skuMasterData[sku].byWeek[week]) {
            skuMasterData[sku].byWeek[week] = { revenue: 0, units: 0 };
          }
          skuMasterData[sku].byWeek[week].revenue += revenue;
          skuMasterData[sku].byWeek[week].units += units;
          // Only add to totals if not already counted in periods
          if (Object.keys(skuMasterData[sku].byPeriod).length === 0) {
            skuMasterData[sku].totalRevenue += revenue;
            skuMasterData[sku].totalUnits += units;
          }
        });
      };
      
      processWeekSkus(weekData.amazon?.skuData, 'Amazon');
      processWeekSkus(weekData.shopify?.skuData, 'Shopify');
    });
    
    // Convert to sorted array
    const skuMasterList = Object.values(skuMasterData)
      .filter(s => s.totalRevenue > 0 || Object.keys(s.byWeek).length > 0)
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
    
    // Calculate all time totals properly:
    // 2026: Use weekly data (actual weeks)
    // 2025: Use monthly period data (no weekly breakdown available)
    // 2024: Use quarterly period data
    const currentYear = new Date().getFullYear().toString();
    const weeks2026 = weeksSummary.filter(w => w.weekKey && w.weekKey.startsWith(currentYear) && w.totalRevenue > 0);
    // Note: months2025 and quarters2024 already defined above in YoY section
    
    const allTimeRevenue = 
      weeks2026.reduce((s, w) => s + w.totalRevenue, 0) +
      months2025.reduce((s, p) => s + p.totalRevenue, 0) +
      quarters2024.reduce((s, p) => s + p.totalRevenue, 0);
    const allTimeProfit = 
      weeks2026.reduce((s, w) => s + w.totalProfit, 0) +
      months2025.reduce((s, p) => s + p.totalProfit, 0) +
      quarters2024.reduce((s, p) => s + p.totalProfit, 0);
    const allTimeUnits = 
      weeks2026.reduce((s, w) => s + w.totalUnits, 0) +
      months2025.reduce((s, p) => s + p.totalUnits, 0) +
      quarters2024.reduce((s, p) => s + p.totalUnits, 0);
    const recentWeeksData = weeksSummary.filter(w => w.totalRevenue > 0).slice(-4);
    const priorWeeksData = weeksSummary.filter(w => w.totalRevenue > 0).slice(-8, -4);
    const recentRevenue = recentWeeksData.reduce((s, w) => s + w.totalRevenue, 0);
    const priorRevenue = priorWeeksData.reduce((s, w) => s + w.totalRevenue, 0);
    const recentProfit = recentWeeksData.reduce((s, w) => s + w.totalProfit, 0);
    const priorProfit = priorWeeksData.reduce((s, w) => s + w.totalProfit, 0);
    
    // Calculate daily trends for AI learning - ONLY use days with complete data
    const completeDailySummary = dailySummary.filter(d => d.hasCompleteData);
    const recentDailyData = completeDailySummary.slice(-7);
    const priorDailyData = completeDailySummary.slice(-14, -7);
    const recentDailyRevenue = recentDailyData.reduce((s, d) => s + d.totalRevenue, 0);
    const priorDailyRevenue = priorDailyData.reduce((s, d) => s + d.totalRevenue, 0);
    const dailyTrend = priorDailyRevenue > 0 ? ((recentDailyRevenue - priorDailyRevenue) / priorDailyRevenue * 100) : 0;
    
    // Calculate day-of-week patterns for AI learning - only use complete data days
    const dayOfWeekPatterns = {};
    const amazonStartDateObj = new Date('2024-06-01');
    sortedDays.forEach(day => {
      const data = allDaysData[day];
      const dayDate = new Date(day + 'T12:00:00');
      const dayName = dayDate.toLocaleDateString('en-US', { weekday: 'long' });
      
      // Only include days with complete data (Amazon revenue > 0, or pre-Amazon era)
      const hasAmazonData = (data.amazon?.revenue || 0) > 0;
      const isPreAmazon = dayDate < amazonStartDateObj;
      if (!hasAmazonData && !isPreAmazon && dayDate >= new Date('2024-01-01')) {
        return; // Skip incomplete days
      }
      
      if (!dayOfWeekPatterns[dayName]) {
        dayOfWeekPatterns[dayName] = { count: 0, totalRevenue: 0, totalProfit: 0 };
      }
      dayOfWeekPatterns[dayName].count++;
      dayOfWeekPatterns[dayName].totalRevenue += data.total?.revenue || 0;
      dayOfWeekPatterns[dayName].totalProfit += getProfit(data.total);
    });
    Object.keys(dayOfWeekPatterns).forEach(day => {
      const p = dayOfWeekPatterns[day];
      p.avgRevenue = p.count > 0 ? p.totalRevenue / p.count : 0;
      p.avgProfit = p.count > 0 ? p.totalProfit / p.count : 0;
    });
    
    // PRE-COMPUTED: Filter to only weeks with actual revenue
    const weeksWithRevenue = sortedWeeks.filter(w => (allWeeksData[w]?.total?.revenue || 0) > 0);
    
    // Helper function to compute category breakdown for a set of weeks
    const computeCategoryBreakdown = (weekKeys) => {
      const categories = {};
      
      // SKU patterns for categorization (fallback if product name doesn't match)
      const skuPatterns = {
        'Lip Balm': [/lip/i, /balm.*pack/i, /orange.*pack/i, /peppermint.*pack/i, /unscented.*pack/i, /assorted.*pack/i, /vanilla.*pack/i, /lavender.*pack/i, /mint.*pack/i],
        'Deodorant': [/deo/i, /deod/i],
        'Tallow Soap Bars': [/soap/i, /bar/i],
        'Sun Balm': [/sun/i, /spf/i],
        'Tallow Balm': [/tallow.*balm/i, /moisturiz/i, /hydrat/i],
      };
      
      weekKeys.forEach(weekKey => {
        const weekData = allWeeksData[weekKey];
        if (!weekData) return;
        
        // Process all SKUs and group by category
        const processSkus = (skuData, channel) => {
          (skuData || []).forEach(s => {
            const sku = s.sku || s.msku || '';
            const productName = (savedProductNames[sku] || s.name || s.title || sku).toLowerCase();
            const units = s.unitsSold || s.units || 0;
            const revenue = s.netSales || s.revenue || 0;
            const profit = channel === 'Amazon' ? (s.netProceeds || revenue) : (revenue - (s.cogs || 0));
            
            // Determine category from product name first
            let category = 'Other';
            
            // Explicit product name matching
            if (productName.includes('lip balm') || productName.includes('lip-balm')) category = 'Lip Balm';
            else if (productName.includes('sensitive') && productName.includes('deodorant')) category = 'Sensitive Skin Deodorant';
            else if (productName.includes('extra strength') && productName.includes('deodorant')) category = 'Extra Strength Deodorant';
            else if (productName.includes('deodorant') || productName.includes('deo')) category = 'Deodorant';
            else if (productName.includes('athlete') && productName.includes('soap')) category = "Athlete's Shield Soap";
            else if (productName.includes('soap') || productName.includes('bar soap')) category = 'Tallow Soap Bars';
            else if (productName.includes('sun balm') || productName.includes('spf')) category = 'Sun Balm';
            else if (productName.includes('tallow balm') || productName.includes('moisturizer')) category = 'Tallow Balm';
            
            // If still "Other", try SKU-based pattern matching (common lip balm packs)
            if (category === 'Other') {
              const combined = (sku + ' ' + productName).toLowerCase();
              // Check for pack patterns with lip balm flavors/variants
              const isLipBalmPack = (
                (combined.includes('pack') || combined.includes('pk')) && (
                  combined.includes('orange') || combined.includes('peppermint') || 
                  combined.includes('vanilla') || combined.includes('lavender') ||
                  combined.includes('unscented') || combined.includes('assorted') ||
                  combined.includes('mint') || combined.includes('honey') ||
                  combined.includes('sweet') || combined.includes('citrus') ||
                  combined.includes('cherry') || combined.includes('berry')
                )
              );
              // Also check for lip balm SKU patterns (like LB-, BALM-, etc.)
              const hasLipBalmSku = /^(lb|balm|lip)/i.test(sku) || sku.toLowerCase().includes('lip');
              
              if (isLipBalmPack || hasLipBalmSku) {
                category = 'Lip Balm';
              }
            }
            
            // Final fallback: check SKU patterns
            if (category === 'Other') {
              for (const [cat, patterns] of Object.entries(skuPatterns)) {
                for (const pattern of patterns) {
                  if (pattern.test(sku) || pattern.test(productName)) {
                    category = cat;
                    break;
                  }
                }
                if (category !== 'Other') break;
              }
            }
            
            if (!categories[category]) {
              categories[category] = { units: 0, revenue: 0, profit: 0, skus: [] };
            }
            categories[category].units += units;
            categories[category].revenue += revenue;
            categories[category].profit += profit;
            
            // Only add SKU details for single-week queries (keep data compact)
            if (weekKeys.length === 1) {
              categories[category].skus.push({ sku, name: savedProductNames[sku] || s.name || sku, channel, units, revenue, profit });
            }
          });
        };
        
        processSkus(weekData.amazon?.skuData, 'Amazon');
        processSkus(weekData.shopify?.skuData, 'Shopify');
      });
      
      // Calculate margins and sort SKUs
      Object.values(categories).forEach(cat => {
        cat.margin = cat.revenue > 0 ? (cat.profit / cat.revenue * 100).toFixed(1) : 0;
        if (cat.skus) cat.skus.sort((a, b) => b.revenue - a.revenue);
      });
      
      return categories;
    };
    
    // Get total metrics for a set of weeks
    const getWeeksTotals = (weekKeys) => {
      return weekKeys.reduce((acc, w) => {
        const data = allWeeksData[w];
        if (data) {
          acc.revenue += data.total?.revenue || 0;
          acc.profit += getProfit(data.total);
          acc.units += data.total?.units || 0;
        }
        return acc;
      }, { revenue: 0, profit: 0, units: 0 });
    };
    
    // LAST WEEK (most recent week with actual data)
    const lastWeekKey = weeksWithRevenue[weeksWithRevenue.length - 1];
    const lastWeekData = lastWeekKey ? allWeeksData[lastWeekKey] : null;
    
    return {
      storeName: storeName || 'E-Commerce Store',
      dataRange: { 
        weeksTracked: weeksCount, 
        daysTracked: daysCount,
        periodsTracked: periodsCount, 
        oldestWeek: sortedWeeks[0], 
        newestWeek: sortedWeeks[sortedWeeks.length - 1],
        oldestDay: sortedDays[0],
        newestDay: sortedDays[sortedDays.length - 1],
      },
      dailyData: dailySummary,
      dailyTrend,
      dayOfWeekPatterns,
      weeklyData: weeksSummary,
      periodData: periodsSummary,
      yoyInsights,
      monthlyTrend2025,
      // PER-WEEK SKU BREAKDOWN - for answering "last week" questions accurately
      skuByWeek: safe(() => {
        const recentWeeks = sortedWeeks.slice(-4);
        return recentWeeks.map(week => {
          const data = allWeeksData[week];
          const skuList = [];
          
          // Week dates: Amazon reports week as ending Sunday, key is typically the Sunday
          // If key is Monday (start of week), adjust to show Sunday (end of prior week)
          const weekDate = new Date(week + 'T00:00:00');
          const dayOfWeek = weekDate.getDay(); // 0=Sun, 1=Mon, etc.
          // If it's Monday (1), subtract 1 day to get Sunday
          // If it's already Sunday (0), keep it
          const weekEndDate = dayOfWeek === 1 
            ? new Date(weekDate.getTime() - 24 * 60 * 60 * 1000) 
            : weekDate;
          const weekEndStr = weekEndDate.toISOString().split('T')[0];
          
          // Amazon SKUs
          (data.amazon?.skuData || []).forEach(s => {
            const sku = s.sku || s.msku;
            const productName = savedProductNames[sku] || s.name || s.title || sku;
            const units = s.unitsSold || s.units || 0;
            const revenue = s.netSales || s.revenue || 0;
            const profit = s.netProceeds || revenue;
            skuList.push({
              sku,
              productName,
              channel: 'Amazon',
              units,
              revenue,
              profit,
              profitPerUnit: units > 0 ? profit / units : 0,
            });
          });
          
          // Shopify SKUs
          (data.shopify?.skuData || []).forEach(s => {
            const sku = s.sku;
            const productName = savedProductNames[sku] || s.name || s.title || sku;
            const units = s.unitsSold || s.units || 0;
            const revenue = s.netSales || s.revenue || 0;
            const profit = revenue - (s.cogs || 0);
            skuList.push({
              sku,
              productName,
              channel: 'Shopify',
              units,
              revenue,
              profit,
              profitPerUnit: units > 0 ? profit / units : 0,
            });
          });
          
          return {
            weekEnding: weekEndStr,
            weekKey: week, // Original key for reference
            weekLabel: `Week ending ${weekEndDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}`,
            totalRevenue: data.total?.revenue || 0,
            totalProfit: getProfit(data.total),
            totalUnits: data.total?.units || 0,
            skus: skuList.sort((a, b) => b.revenue - a.revenue),
          };
        });
      }),
      // LAST WEEK (most recent week with actual revenue)
      lastWeekByCategory: lastWeekKey ? {
        weekEnding: lastWeekKey,
        weekLabel: `Week of ${new Date(new Date(lastWeekKey + 'T00:00:00').getTime() - 6*24*60*60*1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(lastWeekKey + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        totalRevenue: lastWeekData?.total?.revenue || 0,
        totalProfit: getProfit(lastWeekData?.total),
        totalUnits: lastWeekData?.total?.units || 0,
        byCategory: computeCategoryBreakdown([lastWeekKey]),
      } : null,
      
      // LAST 2 WEEKS
      last2WeeksByCategory: safe(() => {
        const weeks = weeksWithRevenue.slice(-2);
        if (weeks.length === 0) return null;
        const totals = getWeeksTotals(weeks);
        const startDate = new Date(new Date(weeks[0] + 'T00:00:00').getTime() - 6*24*60*60*1000);
        const endDate = new Date(weeks[weeks.length - 1] + 'T00:00:00');
        return {
          weeks: weeks,
          dateRange: `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
          totalRevenue: totals.revenue,
          totalProfit: totals.profit,
          totalUnits: totals.units,
          byCategory: computeCategoryBreakdown(weeks),
        };
      }),
      
      // LAST 4 WEEKS (approx 1 month)
      last4WeeksByCategory: safe(() => {
        const weeks = weeksWithRevenue.slice(-4);
        if (weeks.length === 0) return null;
        const totals = getWeeksTotals(weeks);
        const startDate = new Date(new Date(weeks[0] + 'T00:00:00').getTime() - 6*24*60*60*1000);
        const endDate = new Date(weeks[weeks.length - 1] + 'T00:00:00');
        return {
          weeks: weeks,
          dateRange: `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
          totalRevenue: totals.revenue,
          totalProfit: totals.profit,
          totalUnits: totals.units,
          byCategory: computeCategoryBreakdown(weeks),
        };
      }),
      
      // ALL TIME by category
      allTimeByCategory: safe(() => {
        const totals = getWeeksTotals(weeksWithRevenue);
        return {
          weeks: weeksWithRevenue.length,
          totalRevenue: totals.revenue,
          totalProfit: totals.profit,
          totalUnits: totals.units,
          byCategory: computeCategoryBreakdown(weeksWithRevenue),
        };
      }),
      
      // CURRENT MONTH (MTD) by category - aggregated from DAILY data for precision
      // Falls back to WEEKLY data if no daily data exists
      currentMonthByCategory: safe(() => {
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();
        const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
        const monthName = today.toLocaleDateString('en-US', { month: 'long' });
        
        // Aggregate SKU data - SEPARATE by channel
        const amazonSkuTotals = {};
        const shopifySkuTotals = {};
        let totalRevenue = 0, totalUnits = 0, totalProfit = 0;
        let amazonRevenue = 0, amazonUnits = 0, shopifyRevenue = 0, shopifyUnits = 0;
        let dataSource = 'none';
        let daysOrWeeksIncluded = 0;
        
        // Get all days in current month from DAILY data
        const daysInMonth = sortedDays.filter(d => d >= monthStart && d <= formatDateKey(today));
        
        if (daysInMonth.length > 0) {
          dataSource = 'daily';
          daysOrWeeksIncluded = daysInMonth.length;
          
          daysInMonth.forEach(dayKey => {
            const dayData = allDaysData[dayKey];
            if (!dayData) return;
            
            // Amazon daily SKU data
            (dayData.amazon?.skuData || []).forEach(s => {
              const sku = s.sku || s.msku || '';
              if (!sku) return;
              const units = s.unitsSold || s.units || 0;
              const revenue = s.netSales || s.revenue || 0;
              const profit = s.netProceeds || revenue;
              
              if (!amazonSkuTotals[sku]) {
                amazonSkuTotals[sku] = { sku, name: savedProductNames[sku] || s.name || sku, units: 0, revenue: 0, profit: 0, channel: 'Amazon' };
              }
              amazonSkuTotals[sku].units += units;
              amazonSkuTotals[sku].revenue += revenue;
              amazonSkuTotals[sku].profit += profit;
              amazonRevenue += revenue;
              amazonUnits += units;
            });
            
            // Shopify daily SKU data
            (dayData.shopify?.skuData || []).forEach(s => {
              const sku = s.sku || '';
              if (!sku) return;
              const units = s.unitsSold || s.units || 0;
              const revenue = s.netSales || s.revenue || 0;
              const profit = revenue - (s.cogs || 0);
              
              if (!shopifySkuTotals[sku]) {
                shopifySkuTotals[sku] = { sku, name: savedProductNames[sku] || s.name || sku, units: 0, revenue: 0, profit: 0, channel: 'Shopify' };
              }
              shopifySkuTotals[sku].units += units;
              shopifySkuTotals[sku].revenue += revenue;
              shopifySkuTotals[sku].profit += profit;
              shopifyRevenue += revenue;
              shopifyUnits += units;
            });
            
            totalRevenue += (dayData.total?.revenue || 0);
            totalUnits += (dayData.total?.units || 0);
            totalProfit += (getProfit(dayData.total));
          });
        }
        
        // If no daily data OR no Amazon data in daily, try WEEKLY data
        const weeksInMonth = Object.keys(allWeeksData).filter(w => w >= monthStart).sort();
        if (weeksInMonth.length > 0 && (Object.keys(amazonSkuTotals).length === 0 || amazonUnits === 0)) {
          // Use weekly data for Amazon (supplement or replace)
          if (Object.keys(amazonSkuTotals).length === 0) {
            dataSource = dataSource === 'daily' ? 'daily+weekly' : 'weekly';
          } else {
            dataSource = 'daily+weekly-amazon';
          }
          daysOrWeeksIncluded = weeksInMonth.length + ' weeks';
          
          weeksInMonth.forEach(weekKey => {
            const weekData = allWeeksData[weekKey];
            if (!weekData) return;
            
            // Amazon weekly SKU data (only if we don't have daily amazon data)
            if (Object.keys(amazonSkuTotals).length === 0 || amazonUnits === 0) {
              (weekData.amazon?.skuData || []).forEach(s => {
                const sku = s.sku || s.msku || '';
                if (!sku) return;
                const units = s.unitsSold || s.units || 0;
                const revenue = s.netSales || s.revenue || 0;
                const profit = s.netProceeds || revenue;
                
                if (!amazonSkuTotals[sku]) {
                  amazonSkuTotals[sku] = { sku, name: savedProductNames[sku] || s.name || sku, units: 0, revenue: 0, profit: 0, channel: 'Amazon' };
                }
                amazonSkuTotals[sku].units += units;
                amazonSkuTotals[sku].revenue += revenue;
                amazonSkuTotals[sku].profit += profit;
                amazonRevenue += revenue;
                amazonUnits += units;
              });
            }
            
            // If no daily Shopify data either, use weekly
            if (Object.keys(shopifySkuTotals).length === 0) {
              (weekData.shopify?.skuData || []).forEach(s => {
                const sku = s.sku || '';
                if (!sku) return;
                const units = s.unitsSold || s.units || 0;
                const revenue = s.netSales || s.revenue || 0;
                const profit = revenue - (s.cogs || 0);
                
                if (!shopifySkuTotals[sku]) {
                  shopifySkuTotals[sku] = { sku, name: savedProductNames[sku] || s.name || sku, units: 0, revenue: 0, profit: 0, channel: 'Shopify' };
                }
                shopifySkuTotals[sku].units += units;
                shopifySkuTotals[sku].revenue += revenue;
                shopifySkuTotals[sku].profit += profit;
                shopifyRevenue += revenue;
                shopifyUnits += units;
              });
            }
            
            // Update totals from weekly if no daily
            if (daysInMonth.length === 0) {
              totalRevenue += (weekData.total?.revenue || 0);
              totalUnits += (weekData.total?.units || 0);
              totalProfit += (getProfit(weekData.total));
            }
          });
        }
        
        if (Object.keys(amazonSkuTotals).length === 0 && Object.keys(shopifySkuTotals).length === 0) {
          return null;
        }
        
        // Build category breakdown from SKU data
        const byCategory = {};
        const bySku = {};
        
        const processSkuForCategory = (skuData) => {
          Object.values(skuData).forEach(s => {
            // Determine category
            const productName = s.name.toLowerCase();
            const sku = s.sku.toLowerCase();
            let category = 'Other';
            
            if (productName.includes('lip balm') || productName.includes('lip-balm') || 
                /^(ddpe|lb)/i.test(s.sku) ||
                ((productName.includes('pack') || productName.includes('pk')) && 
                 (productName.includes('orange') || productName.includes('peppermint') || 
                  productName.includes('unscented') || productName.includes('assorted')))) {
              category = 'Lip Balm';
            } else if (productName.includes('deodorant') || productName.includes('deo')) {
              category = 'Deodorant';
            } else if (productName.includes('soap')) {
              category = 'Soap';
            } else if (productName.includes('sun balm') || productName.includes('spf')) {
              category = 'Sun Balm';
            } else if (productName.includes('tallow balm') || productName.includes('moisturizer')) {
              category = 'Tallow Balm';
            }
            
            if (!byCategory[category]) {
              byCategory[category] = { units: 0, revenue: 0, profit: 0, amazonUnits: 0, shopifyUnits: 0, skus: [] };
            }
            byCategory[category].units += s.units;
            byCategory[category].revenue += s.revenue;
            byCategory[category].profit += s.profit;
            if (s.channel === 'Amazon') byCategory[category].amazonUnits += s.units;
            if (s.channel === 'Shopify') byCategory[category].shopifyUnits += s.units;
            byCategory[category].skus.push(s);
            
            // Also track by SKU
            if (!bySku[s.sku]) {
              bySku[s.sku] = { ...s };
            } else {
              bySku[s.sku].units += s.units;
              bySku[s.sku].revenue += s.revenue;
              bySku[s.sku].profit += s.profit;
            }
          });
        };
        
        processSkuForCategory(amazonSkuTotals);
        processSkuForCategory(shopifySkuTotals);
        
        // Sort SKUs by units within each category
        Object.values(byCategory).forEach(cat => {
          cat.skus.sort((a, b) => b.units - a.units);
        });
        
        return {
          month: monthName,
          year: currentYear,
          dateRange: `${monthName} 1-${today.getDate()}, ${currentYear}`,
          dataSource,
          daysOrWeeksIncluded,
          totalRevenue,
          totalUnits,
          totalProfit,
          amazonRevenue,
          amazonUnits,
          shopifyRevenue,
          shopifyUnits,
          byCategory,
          bySku: Object.values(bySku).sort((a, b) => b.units - a.units).slice(0, 30),
        };
      }),
      
      skuAnalysis: skuAnalysis.slice(0, 30),
      skusByProfitPerUnit: [...skuAnalysis].sort((a, b) => b.profitPerUnit - a.profitPerUnit).slice(0, 10),
      decliningSkus: skuAnalysis.filter(s => s.trend === 'declining').slice(0, 10),
      improvingSkus: skuAnalysis.filter(s => s.trend === 'improving').slice(0, 10),
      productCatalog,
      skusByCategory,
      skuMasterData: skuMasterList, // COMPREHENSIVE: all SKU data across periods + weeks
      inventory: inventorySummary,
      salesTax: taxSummary,
      goals,
      insights: {
        allTimeRevenue, allTimeProfit, allTimeUnits,
        avgWeeklyRevenue: weeksCount > 0 ? allTimeRevenue / weeksCount : 0,
        avgWeeklyProfit: weeksCount > 0 ? allTimeProfit / weeksCount : 0,
        avgDailyRevenue: daysCount > 0 ? dailySummary.reduce((s, d) => s + d.totalRevenue, 0) / daysCount : 0,
        avgDailyProfit: daysCount > 0 ? dailySummary.reduce((s, d) => s + d.totalProfit, 0) / daysCount : 0,
        overallMargin: allTimeRevenue > 0 ? (allTimeProfit / allTimeRevenue * 100) : 0,
        overallProfitPerUnit: allTimeUnits > 0 ? allTimeProfit / allTimeUnits : 0,
        recentVsPrior: {
          recentRevenue, priorRevenue, revenueChange: priorRevenue > 0 ? ((recentRevenue - priorRevenue) / priorRevenue * 100) : 0,
          recentProfit, priorProfit, profitChange: priorProfit > 0 ? ((recentProfit - priorProfit) / priorProfit * 100) : 0,
        },
        topChannel: allTimeRevenue > 0 ? (weeksSummary.reduce((s, w) => s + w.amazonRevenue, 0) > allTimeRevenue / 2 ? 'Amazon' : 'Shopify') : 'Unknown',
      },
      // AI Learning Data - helps Claude make better predictions
      aiLearning: {
        forecastCorrections: {
          revenueMultiplier: forecastCorrections.overall?.revenue || 1,
          unitsMultiplier: forecastCorrections.overall?.units || 1,
          confidence: forecastCorrections.confidence || 0,
          samplesUsed: forecastCorrections.samplesUsed || 0,
        },
        predictionHistory: {
          totalPredictions: aiLearningHistory.predictions?.length || 0,
          verifiedPredictions: aiLearningHistory.predictions?.filter(p => p.actual !== undefined).length || 0,
          recentAccuracy: safe(() => {
            const verified = aiLearningHistory.predictions?.filter(p => p.accuracy?.revenueError !== undefined) || [];
            if (verified.length === 0) return null;
            const avgError = verified.slice(-10).reduce((sum, p) => sum + Math.abs(p.accuracy.revenueError || 0), 0) / Math.min(10, verified.length);
            return 100 - avgError;
          }),
        },
        recentPredictions: aiLearningHistory.predictions?.slice(-5).map(p => ({
          type: p.type,
          period: p.period,
          predictedAt: p.predictedAt,
          predicted: p.prediction?.revenue?.expected,
          actual: p.actual?.revenue,
          error: p.accuracy?.revenueError,
        })) || [],
      },
      // Seasonal Patterns for AI Forecasting
      seasonalPatterns: safe(() => {
        // Group data by month across years
        const monthlyByYear = {};
        sortedWeeks.forEach(w => {
          const data = allWeeksData[w];
          const date = new Date(w);
          const year = date.getFullYear();
          const month = date.getMonth() + 1;
          const key = `${year}-${String(month).padStart(2, '0')}`;
          if (!monthlyByYear[key]) monthlyByYear[key] = { year, month, revenue: 0, profit: 0, units: 0, weeks: 0 };
          monthlyByYear[key].revenue += data.total?.revenue || 0;
          monthlyByYear[key].profit += getProfit(data.total);
          monthlyByYear[key].units += data.total?.units || 0;
          monthlyByYear[key].weeks++;
        });
        
        // Calculate month-over-month and year-over-year patterns
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const seasonalIndex = {};
        monthNames.forEach((name, i) => {
          const monthData = Object.values(monthlyByYear).filter(m => m.month === i + 1);
          if (monthData.length > 0) {
            const avgRevenue = monthData.reduce((s, m) => s + m.revenue, 0) / monthData.length;
            seasonalIndex[name] = {
              avgRevenue,
              avgProfit: monthData.reduce((s, m) => s + m.profit, 0) / monthData.length,
              dataPoints: monthData.length,
              years: monthData.map(m => m.year),
            };
          }
        });
        
        // Calculate overall average for seasonal index
        const allMonths = Object.values(seasonalIndex);
        const overallAvg = allMonths.length > 0 ? allMonths.reduce((s, m) => s + m.avgRevenue, 0) / allMonths.length : 0;
        
        // Add seasonal index (1.0 = average, >1 = above average month)
        Object.keys(seasonalIndex).forEach(month => {
          seasonalIndex[month].index = overallAvg > 0 ? seasonalIndex[month].avgRevenue / overallAvg : 1;
        });
        
        return {
          byMonth: seasonalIndex,
          overallMonthlyAvg: overallAvg,
          strongMonths: Object.entries(seasonalIndex).filter(([_, m]) => m.index > 1.1).map(([name]) => name),
          weakMonths: Object.entries(seasonalIndex).filter(([_, m]) => m.index < 0.9).map(([name]) => name),
        };
      }),
      // Multi-Source Data Triangulation for AI
      dataTriangulation: safe(() => {
        // Compare sales data with banking deposits
        const salesVsBanking = {};
        if (bankingData.monthlySnapshots) {
          Object.entries(bankingData.monthlySnapshots).forEach(([month, banking]) => {
            // Find matching sales data
            const salesWeeks = sortedWeeks.filter(w => w.startsWith(month));
            const salesRevenue = salesWeeks.reduce((s, w) => s + (allWeeksData[w]?.total?.revenue || 0), 0);
            const salesProfit = salesWeeks.reduce((s, w) => s + (getProfit(allWeeksData[w]?.total)), 0);
            
            if (salesRevenue > 0 || banking.income > 0) {
              salesVsBanking[month] = {
                salesRevenue,
                salesProfit,
                bankDeposits: banking.income,
                bankExpenses: banking.expenses,
                bankNet: banking.net,
                // Deposits should be less than revenue (after marketplace fees)
                depositRatio: salesRevenue > 0 ? (banking.income / salesRevenue) : 0,
                // True profit = sales profit - additional bank expenses (like ads, 3PL not in sales data)
                adjustedProfit: salesProfit - (banking.expenses * 0.3), // Estimate 30% of expenses are already in COGS
              };
            }
          });
        }
        
        return {
          salesVsBanking,
          hasMultipleSources: bankingData.transactions?.length > 0 && sortedWeeks.length > 0,
          dataQualityScore: safe(() => {
            let score = 0;
            if (sortedWeeks.length >= 12) score += 25; // Good weekly history
            if (sortedDays.length >= 30) score += 20; // Good daily history
            if (bankingData.transactions?.length >= 100) score += 20; // Good banking data
            if (Object.keys(savedCogs).length >= 10) score += 15; // Good COGS coverage
            if (forecastCorrections.samplesUsed >= 4) score += 10; // AI learning active
            if (Object.keys(amazonForecasts).length > 0) score += 10; // Has forecasts
            return score;
          }),
        };
      }),
      // Banking/Cash Flow Data for AI analysis
      banking: bankingData.transactions?.length > 0 ? safe(() => {
        // Filter to real bank accounts only
        const strictFilter = (name) => {
          if (!/\(\d{4}\)\s*-\s*\d+$/.test(name)) return false;
          if (name.includes('"') || name.length > 60) return false;
          if (!/^[A-Za-z]/.test(name.trim())) return false;
          return true;
        };
        const accts = Object.entries(bankingData.accounts || {}).filter(([name, _]) => strictFilter(name));
        const checkingAccts = accts.filter(([_, a]) => a.type !== 'credit_card');
        const creditAccts = accts.filter(([_, a]) => a.type === 'credit_card');
        const totalCash = checkingAccts.reduce((s, [_, a]) => s + (a.balance || 0), 0);
        const totalDebt = creditAccts.reduce((s, [_, a]) => s + (a.balance || 0), 0);
        const recentMonths = Object.keys(bankingData.monthlySnapshots || {}).sort().slice(-3);
        const avgBurn = recentMonths.length > 0 
          ? recentMonths.reduce((s, m) => s + (bankingData.monthlySnapshots[m]?.expenses || 0), 0) / recentMonths.length
          : 0;
        const runway = avgBurn > 0 ? Math.floor(totalCash / avgBurn) : 99;
        
        return {
          transactionCount: bankingData.transactions.length,
          dateRange: bankingData.dateRange,
          lastUpload: bankingData.lastUpload,
          // CFO Summary (note: this is CASH FLOW not profit - doesn't include COGS)
          cfoMetrics: {
            cashPosition: totalCash,
            creditCardDebt: totalDebt,
            netPosition: totalCash - totalDebt,
            monthlyBurnRate: avgBurn,
            cashRunwayMonths: runway,
          },
          // Account Balances
          accounts: accts.map(([name, data]) => ({
            name: name.split('(')[0].trim(),
            type: data.type,
            balance: data.balance || 0,
            transactions: data.transactions,
          })),
          // Monthly Cash Flow (last 12 months) - NOTE: income is deposits, not revenue; net is cash flow, not profit
          monthlySnapshots: Object.entries(bankingData.monthlySnapshots || {}).slice(-12).map(([month, data]) => ({
            month,
            income: data.income,  // Bank deposits (Amazon/Shopify payouts after fees)
            expenses: data.expenses,
            net: data.net,
            transactionCount: data.transactions,
          })),
          // Top expense categories
          topExpenseCategories: Object.entries(bankingData.categories || {})
            .filter(([_, c]) => c.totalOut > 0)
            .sort((a, b) => b[1].totalOut - a[1].totalOut)
            .slice(0, 10)
            .map(([name, data]) => ({ name, total: data.totalOut, count: data.count })),
          // Top income sources
          topIncomeCategories: Object.entries(bankingData.categories || {})
            .filter(([_, c]) => c.totalIn > 0)
            .sort((a, b) => b[1].totalIn - a[1].totalIn)
            .slice(0, 10)
            .map(([name, data]) => ({ name, total: data.totalIn, count: data.count })),
        };
      }) : null,
      // ========= UNIFIED AI METRICS - COMPREHENSIVE DATA VIEW =========
      // This provides the AI with a proper understanding of data availability
      // IMPORTANT: Use these metrics for ALL-TIME totals, not the daily data
      unifiedMetrics: unifiedBusinessMetrics,
      
      // Data availability explanation for AI
      dataAvailability: {
        // Amazon: Daily data may only exist for 2026, but 2024-2025 has monthly/quarterly period data
        amazon: {
          dailyDataDates: unifiedBusinessMetrics.dataSources?.amazon?.dailyDates?.length || 0,
          periodDataCount: unifiedBusinessMetrics.dataSources?.amazon?.periodNames?.length || 0,
          hasDailyGaps: unifiedBusinessMetrics.dataSources?.amazon?.hasDailyGaps || false,
          gapsCoveredBy: unifiedBusinessMetrics.dataSources?.amazon?.gapsCoveredByPeriods || [],
          explanation: unifiedBusinessMetrics.dataSources?.amazon?.hasDailyGaps 
            ? 'Amazon has monthly period data for periods without daily uploads. DO NOT treat missing daily data as $0 sales.'
            : 'Amazon has daily data available.',
        },
        shopify: {
          dailyDataDates: unifiedBusinessMetrics.dataSources?.shopify?.dailyDates?.length || 0,
          periodDataCount: unifiedBusinessMetrics.dataSources?.shopify?.periodNames?.length || 0,
          hasDailyGaps: unifiedBusinessMetrics.dataSources?.shopify?.hasDailyGaps || false,
          gapsCoveredBy: unifiedBusinessMetrics.dataSources?.shopify?.gapsCoveredByPeriods || [],
        },
        // Key instruction for AI
        instructions: `
⚠️ CRITICAL DATA AVAILABILITY RULES:
1. Amazon daily data may not exist for all dates - we have MONTHLY period data instead
2. NEVER treat missing daily Amazon data as $0 sales - this will severely undercount revenue
3. For all-time totals, use the unifiedMetrics.allTime values which properly combine period + weekly data
4. For averages, use unifiedMetrics.averages which only calculate from days WITH data
5. When calculating trends, EXCLUDE days without data rather than counting them as $0
6. Period data (monthly/quarterly) is AUTHORITATIVE for historical totals

📊 DATA SOURCES HIERARCHY:
- For 2024: Use quarterly period data (most accurate)
- For 2025: Use monthly period data (most accurate)
- For 2026: Use weekly/daily data (most current)
`,
      },
      // ========= DAILY ADS DATA - AGGREGATED FROM DAILY UPLOADS =========
      dailyAdsData: safe(() => {
        const last30Days = sortedDays.slice(-30);
        const last7Days = sortedDays.slice(-7);
        
        const aggregateAds = (days) => {
          let metaSpend = 0, googleSpend = 0, metaImpressions = 0, googleImpressions = 0;
          let metaClicks = 0, googleClicks = 0, metaConversions = 0, googleConversions = 0;
          let daysWithData = 0;
          
          days.forEach(dayKey => {
            const dayData = allDaysData[dayKey];
            if (!dayData) return;
            
            const meta = dayData.metaSpend || dayData.shopify?.metaSpend || 0;
            const google = dayData.googleSpend || dayData.shopify?.googleSpend || 0;
            
            if (meta > 0 || google > 0) daysWithData++;
            metaSpend += meta;
            googleSpend += google;
            metaImpressions += dayData.metaImpressions || 0;
            googleImpressions += dayData.googleImpressions || 0;
            metaClicks += dayData.metaClicks || 0;
            googleClicks += dayData.googleClicks || 0;
            metaConversions += dayData.metaConversions || 0;
            googleConversions += dayData.googleConversions || 0;
          });
          
          const totalSpend = metaSpend + googleSpend;
          const totalClicks = metaClicks + googleClicks;
          const totalImpressions = metaImpressions + googleImpressions;
          
          return {
            metaSpend, googleSpend, totalSpend,
            metaImpressions, googleImpressions, totalImpressions,
            metaClicks, googleClicks, totalClicks,
            metaConversions, googleConversions,
            daysWithData,
            avgDailySpend: daysWithData > 0 ? totalSpend / daysWithData : 0,
            ctr: totalImpressions > 0 ? (totalClicks / totalImpressions * 100).toFixed(2) : 0,
            cpc: totalClicks > 0 ? (totalSpend / totalClicks).toFixed(2) : 0,
          };
        };
        
        return {
          last7Days: aggregateAds(last7Days),
          last30Days: aggregateAds(last30Days),
          byWeek: safe(() => {
            // Group ads by week
            const weeklyAds = {};
            sortedDays.forEach(dayKey => {
              const dayData = allDaysData[dayKey];
              if (!dayData) return;
              
              // Validate date key format
              if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return;
              const date = new Date(dayKey + 'T12:00:00');
              if (isNaN(date.getTime())) return; // Skip invalid dates
              
              const dayOfWeek = date.getDay();
              const weekEnd = new Date(date);
              weekEnd.setDate(date.getDate() + (dayOfWeek === 0 ? 0 : 7 - dayOfWeek));
              const weekKey = weekEnd.toISOString().split('T')[0];
              
              if (!weeklyAds[weekKey]) weeklyAds[weekKey] = { metaSpend: 0, googleSpend: 0, days: 0 };
              weeklyAds[weekKey].metaSpend += dayData.metaSpend || dayData.shopify?.metaSpend || 0;
              weeklyAds[weekKey].googleSpend += dayData.googleSpend || dayData.shopify?.googleSpend || 0;
              weeklyAds[weekKey].days++;
            });
            
            return Object.entries(weeklyAds)
              .filter(([_, d]) => d.metaSpend > 0 || d.googleSpend > 0)
              .slice(-8)
              .map(([week, data]) => ({
                week,
                metaSpend: data.metaSpend,
                googleSpend: data.googleSpend,
                totalSpend: data.metaSpend + data.googleSpend,
                daysWithData: data.days,
              }));
          }),
        };
      }),
    };

  } catch (e) {
    console.error('[aiContext] Failed to build full context:', e.message);
    // Return minimal context so AI chat still works with whatever data is available
    return {
      storeName: storeName || 'E-Commerce Store',
      _error: e.message,
      dataRange: { weeksTracked: weeksCount, daysTracked: daysCount, periodsTracked: periodsCount },
      dailyData: [],
      weeklyData: [],
      periodData: [],
      insights: { allTimeRevenue: 0, allTimeProfit: 0, allTimeUnits: 0, channelSplit: {} },
    };
  }

};

export default prepareDataContext;
