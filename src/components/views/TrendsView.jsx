import { devWarn, devError } from '../../utils/logger';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ArrowDownRight, ArrowUpRight, Check, Database, Filter, Minus, Table, Target, TrendingDown, TrendingUp, Upload
} from 'lucide-react';
import { formatCurrency, formatPercent, formatNumber } from '../../utils/format';
import NavTabs from '../ui/NavTabs';

const ChangeIndicator = ({ current, previous }) => {
  if (!previous || previous === 0) {
    return <span className="text-slate-500 text-sm">—</span>;
  }

  const change = ((current - previous) / previous) * 100;
  const isPositive = change > 0;
  const isNeutral = Math.abs(change) < 0.5;
  const color = isNeutral ? 'text-slate-400' : isPositive ? 'text-emerald-400' : 'text-rose-400';
  const Icon = isNeutral ? Minus : isPositive ? ArrowUpRight : ArrowDownRight;

  return (
    <span className={`flex items-center gap-1 text-sm ${color}`}>
      <Icon className="w-4 h-4" />
      {Math.abs(change).toFixed(1)}%
    </span>
  );
};

const TrendsView = ({
  adSpend,
  allDaysData,
  allPeriodsData,
  allWeeksData,
  amazonForecasts,
  appSettings,
  bankingData,
  current,
  dataBar,
  enhancedForecast,
  forecastAccuracyHistory,
  generateForecast,
  getCogsCost,
  getProfit,
  globalModals,
  hasDailySalesData,
  invHistory,
  navDropdown,
  returnRates,
  revenueChange,
  savedCogs,
  savedProductNames,
  setNavDropdown,
  setSelectedDay,
  setSelectedInvDate,
  setSelectedPeriod,
  setSelectedWeek,
  setTrendsChannel,
  setTrendsDateRange,
  setTrendsTab,
  setUploadTab,
  setView,
  setViewingDayDetails,
  trendsChannel,
  trendsDateRange,
  trendsTab,
  view,
  weekEnding,
}) => {
    // Apply date range filter
    const filterByDateRange = (dateKey) => {
      if (trendsDateRange.preset === 'all' || (!trendsDateRange.start && !trendsDateRange.end)) {
        return true;
      }
      const date = dateKey.substring(0, 10); // Handle both YYYY-MM-DD and YYYY-MM-DD with extra chars
      if (trendsDateRange.start && date < trendsDateRange.start) return false;
      if (trendsDateRange.end && date > trendsDateRange.end) return false;
      return true;
    };
    
    // Get all available data with date filtering
    const sortedWeeks = Object.keys(allWeeksData).filter(filterByDateRange).sort();
    const sortedPeriods = Object.keys(allPeriodsData).sort();
    
    // Categorize periods by type
    const monthlyPeriods = sortedPeriods.filter(p => {
      // Match formats like "january-2025", "2025-01", "January 2025"
      return /^(january|february|march|april|may|june|july|august|september|october|november|december)-?\d{4}$/i.test(p) ||
             /^\d{4}-\d{2}$/.test(p) ||
             /^[a-z]+-\d{4}$/i.test(p);
    });
    
    const quarterlyPeriods = sortedPeriods.filter(p => /q[1-4]/i.test(p));
    const yearlyPeriods = sortedPeriods.filter(p => /^\d{4}$/.test(p));
    
    // Build unified monthly data (from periods OR aggregated from weeks)
    const getMonthlyTrends = () => {
      const monthData = {};
      
      // First, add period data for months
      monthlyPeriods.forEach(p => {
        const data = allPeriodsData[p];
        // Normalize the key to YYYY-MM format
        let monthKey = p;
        const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
        monthNames.forEach((name, idx) => {
          if (p.toLowerCase().includes(name)) {
            const yearMatch = p.match(/\d{4}/);
            if (yearMatch) monthKey = `${yearMatch[0]}-${String(idx + 1).padStart(2, '0')}`;
          }
        });
        
        // Calculate profit using COGS lookup for period data
        const amazonProfit = data.amazon?.netProfit || 0;
        const shopifyRevenue = data.shopify?.revenue || 0;
        const shopifyUnits = data.shopify?.units || 0;
        
        // Calculate Shopify COGS from SKU data using savedCogs lookup
        let shopifyCogs = data.shopify?.cogs || 0;
        if (shopifyCogs === 0 && data.shopify?.skuData) {
          shopifyCogs = (data.shopify.skuData || []).reduce((sum, sku) => {
            const skuKey = sku.sku || sku.title || '';
            const unitCost = getCogsCost(skuKey) || getCogsCost(sku.title) || 0;
            return sum + (unitCost * (sku.unitsSold || sku.units || 0));
          }, 0);
        }
        
        const shopifyFees = data.shopify?.fees || 0;
        const shopifyShipping = data.shopify?.shipping || 0;
        const shopifyAdSpend = data.shopify?.adSpend || 0;
        const shopifyProfit = data.shopify?.netProfit || (shopifyRevenue - shopifyCogs - shopifyFees - shopifyShipping - shopifyAdSpend);
        const totalRevenue = data.total?.revenue || (data.amazon?.revenue || 0) + shopifyRevenue;
        const totalProfit = data.total?.netProfit || (amazonProfit + shopifyProfit);
        const totalMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
        
        monthData[monthKey] = {
          key: p,
          label: data.label || p,
          source: 'period',
          revenue: totalRevenue,
          profit: totalProfit,
          units: data.total?.units || (data.amazon?.units || 0) + shopifyUnits,
          margin: data.total?.netMargin || totalMargin,
          amazonRev: data.amazon?.revenue || 0,
          amazonProfit: amazonProfit,
          amazonUnits: data.amazon?.units || 0,
          shopifyRev: shopifyRevenue,
          shopifyProfit: shopifyProfit,
          shopifyUnits: shopifyUnits,
          adSpend: data.total?.adSpend || 0,
          roas: data.total?.roas || 0,
          skuData: [...(data.amazon?.skuData || []), ...(data.shopify?.skuData || [])],
        };
      });
      
      // Then aggregate DAILY data — build separately first, then compare with period data
      const dailyAgg = {};
      const sortedDaysForTrends = Object.keys(allDaysData).sort();
      if (sortedDaysForTrends.length > 0) {
        sortedDaysForTrends.forEach(day => {
          const monthKey = day.substring(0, 7);
          if (!dailyAgg[monthKey]) {
            const dateForLabel = new Date(monthKey + '-15T12:00:00');
            dailyAgg[monthKey] = {
              key: monthKey,
              label: dateForLabel.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
              source: 'daily',
              revenue: 0, profit: 0, units: 0, margin: 0,
              amazonRev: 0, amazonProfit: 0, amazonUnits: 0,
              shopifyRev: 0, shopifyProfit: 0, shopifyUnits: 0,
              adSpend: 0, roas: 0,
              skuData: [], dayCount: 0,
            };
          }
          const dd = allDaysData[day];
          const azRev = dd.amazon?.sales || dd.amazon?.revenue || 0;
          const azProfit = getProfit(dd.amazon);
          const azUnits = dd.amazon?.units || 0;
          const shRev = dd.shopify?.revenue || 0;
          const shProfit = getProfit(dd.shopify);
          const shUnits = dd.shopify?.units || 0;
          
          dailyAgg[monthKey].revenue += dd.total?.revenue || (azRev + shRev);
          dailyAgg[monthKey].profit += getProfit(dd.total) || (azProfit + shProfit);
          dailyAgg[monthKey].units += dd.total?.units || (azUnits + shUnits);
          dailyAgg[monthKey].amazonRev += azRev;
          dailyAgg[monthKey].amazonProfit += azProfit;
          dailyAgg[monthKey].amazonUnits += azUnits;
          dailyAgg[monthKey].shopifyRev += shRev;
          dailyAgg[monthKey].shopifyProfit += shProfit;
          dailyAgg[monthKey].shopifyUnits += shUnits;
          dailyAgg[monthKey].adSpend += dd.total?.adSpend || (dd.adKPIs?.amazon?.spend || 0) + (dd.adKPIs?.google?.spend || 0) + (dd.adKPIs?.meta?.spend || 0);
          dailyAgg[monthKey].dayCount += 1;
        });
        
        // For each month: use daily data if it has higher revenue than period, or if no period exists
        Object.entries(dailyAgg).forEach(([mk, daily]) => {
          if (!monthData[mk]) {
            monthData[mk] = daily;
          } else if (daily.revenue > monthData[mk].revenue) {
            // Daily has more complete data (e.g., period upload was stale)
            monthData[mk] = daily;
          }
        });
      }
      
      // Then aggregate weekly data for months not in periods OR daily data
      sortedWeeks.forEach(w => {
        const monthKey = w.substring(0, 7);
        if (!monthData[monthKey]) {
          // Use T12:00:00 to avoid timezone issues
          const dateForLabel = new Date(monthKey + '-15T12:00:00');
          monthData[monthKey] = {
            key: monthKey,
            label: dateForLabel.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
            source: 'weekly',
            revenue: 0, profit: 0, units: 0, margin: 0,
            amazonRev: 0, amazonProfit: 0, amazonUnits: 0,
            shopifyRev: 0, shopifyProfit: 0, shopifyUnits: 0,
            adSpend: 0, roas: 0,
            skuData: [], weekCount: 0,
          };
        }
        if (monthData[monthKey].source === 'weekly') {
          const week = allWeeksData[w];
          
          // Calculate profit using COGS lookup for weekly aggregation
          const wkAmazonProfit = week.amazon?.netProfit || 0;
          const wkShopifyRev = week.shopify?.revenue || 0;
          const wkShopifyUnits = week.shopify?.units || 0;
          
          // Calculate Shopify COGS from SKU data
          let wkShopifyCogs = week.shopify?.cogs || 0;
          if (wkShopifyCogs === 0 && week.shopify?.skuData) {
            wkShopifyCogs = (week.shopify.skuData || []).reduce((sum, sku) => {
              const skuKey = sku.sku || sku.title || '';
              const unitCost = getCogsCost(skuKey) || getCogsCost(sku.title) || 0;
              return sum + (unitCost * (sku.unitsSold || sku.units || 0));
            }, 0);
          }
          
          const wkShopifyFees = week.shopify?.fees || 0;
          const wkShopifyShipping = week.shopify?.shipping || 0;
          const wkShopifyAdSpend = week.shopify?.adSpend || 0;
          const wkShopifyProfit = week.shopify?.netProfit || (wkShopifyRev - wkShopifyCogs - wkShopifyFees - wkShopifyShipping - wkShopifyAdSpend);
          const wkTotalProfit = week.total?.netProfit || (wkAmazonProfit + wkShopifyProfit);
          
          monthData[monthKey].revenue += week.total?.revenue || (week.amazon?.revenue || 0) + wkShopifyRev;
          monthData[monthKey].profit += wkTotalProfit;
          monthData[monthKey].units += week.total?.units || (week.amazon?.units || 0) + wkShopifyUnits;
          monthData[monthKey].amazonRev += week.amazon?.revenue || 0;
          monthData[monthKey].amazonProfit += wkAmazonProfit;
          monthData[monthKey].amazonUnits += week.amazon?.units || 0;
          monthData[monthKey].shopifyRev += wkShopifyRev;
          monthData[monthKey].shopifyProfit += wkShopifyProfit;
          monthData[monthKey].shopifyUnits += wkShopifyUnits;
          monthData[monthKey].adSpend += week.total?.adSpend || (week.amazon?.adSpend || 0) + wkShopifyAdSpend;
          monthData[monthKey].weekCount = (monthData[monthKey].weekCount || 0) + 1;
          // Aggregate SKU data
          const weekSkus = [...(week.amazon?.skuData || []), ...(week.shopify?.skuData || [])];
          monthData[monthKey].skuData.push(...weekSkus);
        }
      });
      
      // Calculate derived metrics
      Object.values(monthData).forEach(m => {
        if (m.source === 'weekly' || m.source === 'daily') {
          m.margin = m.revenue > 0 ? (m.profit / m.revenue) * 100 : 0;
          m.roas = m.adSpend > 0 ? m.revenue / m.adSpend : 0;
        }
      });
      
      // Filter out months with no revenue data
      return Object.entries(monthData)
        .filter(([k, v]) => v.revenue > 0)
        .sort((a, b) => a[0].localeCompare(b[0]));
    };
    
    // Build yearly data
    const getYearlyTrends = () => {
      const yearData = {};
      
      // Add yearly periods first
      yearlyPeriods.forEach(p => {
        const data = allPeriodsData[p];
        yearData[p] = {
          key: p,
          label: data.label || p,
          source: 'period',
          revenue: data.total?.revenue || 0,
          profit: getProfit(data.total),
          units: data.total?.units || 0,
          margin: data.total?.netMargin || 0,
          amazonRev: data.amazon?.revenue || 0,
          amazonProfit: data.amazon?.netProfit || 0,
          amazonUnits: data.amazon?.units || 0,
          shopifyRev: data.shopify?.revenue || 0,
          shopifyProfit: data.shopify?.netProfit || 0,
          shopifyUnits: data.shopify?.units || 0,
          adSpend: data.total?.adSpend || 0,
          roas: data.total?.roas || 0,
          skuData: [...(data.amazon?.skuData || []), ...(data.shopify?.skuData || [])],
        };
      });
      
      // Aggregate from quarters if available
      quarterlyPeriods.forEach(p => {
        const yearMatch = p.match(/\d{4}/);
        if (!yearMatch) return;
        const year = yearMatch[0];
        if (yearData[year]) return; // Already have yearly data
        
        if (!yearData[year]) {
          yearData[year] = {
            key: year, label: year, source: 'quarterly',
            revenue: 0, profit: 0, units: 0, 
            amazonRev: 0, amazonProfit: 0, amazonUnits: 0,
            shopifyRev: 0, shopifyProfit: 0, shopifyUnits: 0,
            adSpend: 0, skuData: [], quarterCount: 0,
          };
        }
        const data = allPeriodsData[p];
        yearData[year].revenue += data.total?.revenue || 0;
        yearData[year].profit += getProfit(data.total);
        yearData[year].units += data.total?.units || 0;
        yearData[year].amazonRev += data.amazon?.revenue || 0;
        yearData[year].amazonProfit += data.amazon?.netProfit || 0;
        yearData[year].amazonUnits += data.amazon?.units || 0;
        yearData[year].shopifyRev += data.shopify?.revenue || 0;
        yearData[year].shopifyProfit += data.shopify?.netProfit || 0;
        yearData[year].shopifyUnits += data.shopify?.units || 0;
        yearData[year].adSpend += data.total?.adSpend || 0;
        yearData[year].quarterCount++;
        yearData[year].skuData.push(...(data.amazon?.skuData || []), ...(data.shopify?.skuData || []));
      });
      
      // Calculate derived metrics
      Object.values(yearData).forEach(y => {
        y.margin = y.revenue > 0 ? (y.profit / y.revenue) * 100 : 0;
        y.roas = y.adSpend > 0 ? y.revenue / y.adSpend : 0;
      });
      
      // Filter out years with no revenue data
      return Object.entries(yearData)
        .filter(([k, v]) => v.revenue > 0)
        .sort((a, b) => a[0].localeCompare(b[0]));
    };
    
    // Get weekly data - filter out weeks with no meaningful revenue
    // Also include forecast data for comparison
    // Respect date range filter
    const weeksToShow = trendsDateRange.preset === 'all' ? 12 : 
                        trendsDateRange.preset === 'last30' ? 5 :
                        trendsDateRange.preset === 'last90' ? 13 :
                        sortedWeeks.length;
    
    const weeklyData = sortedWeeks.slice(-weeksToShow).map(w => {
      const week = allWeeksData[w];
      
      // Find forecast for this week from various sources
      let forecastRevenue = null;
      let forecastSource = null;
      
      // 1. Check Amazon forecasts
      const amazonForecast = amazonForecasts[w];
      if (amazonForecast) {
        forecastRevenue = amazonForecast.totals?.sales || amazonForecast.totals?.revenue || 0;
        forecastSource = 'amazon';
      }
      
      // 2. Check forecast accuracy history (has forecast vs actual)
      const accuracyRecord = forecastAccuracyHistory.records?.find(r => r.weekEnding === w);
      if (accuracyRecord && accuracyRecord.forecast?.revenue) {
        forecastRevenue = accuracyRecord.forecast.revenue;
        forecastSource = accuracyRecord.forecastSource || 'system';
      }
      
      // Calculate accuracy if we have both forecast and actual
      const actualRevenue = week.total?.revenue || (week.amazon?.revenue || 0) + (week.shopify?.revenue || 0);
      let accuracy = null;
      let variance = null;
      
      // Sanity check: if forecast is wildly off (>5x or <0.2x actual), ignore it
      if (forecastRevenue !== null && actualRevenue > 0) {
        const forecastRatio = forecastRevenue / actualRevenue;
        if (forecastRatio > 5 || forecastRatio < 0.2) {
          // Bad forecast data - ignore for accuracy calculation
          devWarn(`Ignoring suspicious forecast for ${w}: forecast $${forecastRevenue} vs actual $${actualRevenue}`);
          forecastRevenue = null;
          forecastSource = null;
        } else {
          variance = actualRevenue - forecastRevenue;
          accuracy = Math.max(-100, 100 - (Math.abs(variance) / actualRevenue * 100)); // Clamp to -100 min
        }
      }
      
      // Calculate profit using COGS lookup (same as rest of app)
      const amazonProfit = week.amazon?.netProfit || 0;
      const shopifyRevenue = week.shopify?.revenue || 0;
      const shopifyUnits = week.shopify?.units || 0;
      
      // Calculate Shopify COGS from SKU data using savedCogs lookup
      let shopifyCogs = week.shopify?.cogs || 0;
      if (shopifyCogs === 0 && week.shopify?.skuData) {
        shopifyCogs = (week.shopify.skuData || []).reduce((sum, sku) => {
          const skuKey = sku.sku || sku.title || '';
          const unitCost = getCogsCost(skuKey) || getCogsCost(sku.title) || 0;
          return sum + (unitCost * (sku.unitsSold || sku.units || 0));
        }, 0);
      }
      
      const shopifyFees = week.shopify?.fees || 0;
      const shopifyShipping = week.shopify?.shipping || 0;
      const shopifyAdSpend = week.shopify?.adSpend || 0;
      const shopifyProfit = week.shopify?.netProfit || (shopifyRevenue - shopifyCogs - shopifyFees - shopifyShipping - shopifyAdSpend);
      const totalProfit = week.total?.netProfit || (amazonProfit + shopifyProfit);
      const totalMargin = actualRevenue > 0 ? (totalProfit / actualRevenue) * 100 : 0;
      
      return {
        key: w,
        label: new Date(w + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        source: 'weekly',
        revenue: actualRevenue,
        profit: totalProfit,
        units: week.total?.units || (week.amazon?.units || 0) + shopifyUnits,
        margin: week.total?.netMargin || totalMargin,
        amazonRev: week.amazon?.revenue || 0,
        amazonProfit: amazonProfit,
        amazonUnits: week.amazon?.units || 0,
        shopifyRev: shopifyRevenue,
        shopifyProfit: shopifyProfit,
        shopifyUnits: shopifyUnits,
        adSpend: week.total?.adSpend || (week.amazon?.adSpend || 0) + shopifyAdSpend,
        roas: week.total?.roas || 0,
        skuData: [...(week.amazon?.skuData || []), ...(week.shopify?.skuData || [])],
        // Forecast data for comparison
        forecastRevenue,
        forecastSource,
        accuracy,
        variance,
      };
    }).filter(w => w.revenue > 0); // Only show weeks with actual sales data
    
    // GENERATE FUTURE PROJECTED WEEKS
    // Calculate average weekly revenue/profit/units from recent data
    const recentWeeks = weeklyData.slice(-4); // Last 4 weeks for trend
    const avgWeeklyRevenue = recentWeeks.length > 0 ? recentWeeks.reduce((s, w) => s + w.revenue, 0) / recentWeeks.length : 0;
    const avgWeeklyProfit = recentWeeks.length > 0 ? recentWeeks.reduce((s, w) => s + w.profit, 0) / recentWeeks.length : 0;
    const avgWeeklyUnits = recentWeeks.length > 0 ? recentWeeks.reduce((s, w) => s + w.units, 0) / recentWeeks.length : 0;
    const avgWeeklyMargin = avgWeeklyRevenue > 0 ? (avgWeeklyProfit / avgWeeklyRevenue) * 100 : 0;
    
    // Calculate week-over-week growth trend
    const growthRates = [];
    for (let i = 1; i < recentWeeks.length; i++) {
      if (recentWeeks[i-1].revenue > 0) {
        growthRates.push((recentWeeks[i].revenue - recentWeeks[i-1].revenue) / recentWeeks[i-1].revenue);
      }
    }
    const avgGrowth = growthRates.length > 0 ? growthRates.reduce((s, r) => s + r, 0) / growthRates.length : 0;
    
    // Generate next 8 projected weeks - USE AI FORECAST SYSTEM when available
    const lastWeekDate = weeklyData.length > 0 ? new Date(weeklyData[weeklyData.length - 1].key + 'T00:00:00') : new Date();
    const projectedWeeks = [];
    
    // Get AI forecast data if available
    const aiForecast = enhancedForecast || generateForecast;
    const aiWeeklyForecast = aiForecast?.weekly || [];
    
    // Sanity check: max reasonable forecast is 3x the average (to catch bad data)
    const maxReasonableForecast = avgWeeklyRevenue * 3;
    const minReasonableForecast = avgWeeklyRevenue * 0.1; // At least 10% of average
    
    for (let i = 1; i <= 8; i++) {
      const futureDate = new Date(lastWeekDate.getTime() + i * 7 * 24 * 60 * 60 * 1000);
      const weekKey = futureDate.toISOString().split('T')[0];
      
      // Priority 1: Use AI forecast for first 4 weeks
      const aiWeek = aiWeeklyForecast[i - 1];
      
      // Priority 2: Check Amazon forecasts (with sanity check)
      const amazonForecast = amazonForecasts[weekKey];
      let amazonRevenue = amazonForecast?.totals?.sales || amazonForecast?.totals?.revenue || null;
      
      // Sanity check: if Amazon forecast is wildly off, ignore it
      if (amazonRevenue && avgWeeklyRevenue > 0) {
        if (amazonRevenue > maxReasonableForecast || amazonRevenue < minReasonableForecast) {
          devWarn(`Ignoring suspicious Amazon forecast for ${weekKey}: $${amazonRevenue} (avg: $${avgWeeklyRevenue})`);
          amazonRevenue = null; // Ignore bad data
        }
      }
      
      // Priority 3: Fall back to trend calculation
      const growthMultiplier = Math.pow(1 + Math.max(-0.1, Math.min(0.1, avgGrowth)), i);
      const trendRevenue = Math.round(avgWeeklyRevenue * growthMultiplier);
      const trendProfit = Math.round(avgWeeklyProfit * growthMultiplier);
      const trendUnits = Math.round(avgWeeklyUnits * growthMultiplier);
      
      // Determine which forecast to use
      let projectedRevenue, projectedProfit, projectedUnits, forecastSource;
      
      if (aiWeek && i <= 4) {
        // Use AI forecast (includes Amazon blending if available)
        let aiRevenue = aiWeek.revenue || trendRevenue;
        // Sanity check AI forecast too
        if (aiRevenue > maxReasonableForecast) aiRevenue = trendRevenue;
        projectedRevenue = aiRevenue;
        projectedProfit = aiWeek.profit || trendProfit;
        projectedUnits = aiWeek.units || trendUnits;
        forecastSource = aiWeek.hasAmazonForecast ? 'ai-amazon' : 'ai-trend';
      } else if (amazonRevenue) {
        // Use direct Amazon forecast (already sanity checked)
        projectedRevenue = amazonRevenue;
        projectedProfit = trendProfit; // Estimate profit from trend
        projectedUnits = trendUnits;
        forecastSource = 'amazon';
      } else {
        // Use trend calculation
        projectedRevenue = trendRevenue;
        projectedProfit = trendProfit;
        projectedUnits = trendUnits;
        forecastSource = 'trend';
      }
      
      projectedWeeks.push({
        key: weekKey,
        label: futureDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        source: 'projected',
        isProjected: true,
        revenue: 0, // No actual yet
        profit: 0,
        units: 0,
        margin: 0,
        amazonRev: 0,
        shopifyRev: 0,
        // Projected values from AI forecast system
        projectedRevenue,
        projectedProfit,
        projectedUnits,
        projectedMargin: avgWeeklyMargin,
        forecastRevenue: projectedRevenue,
        forecastSource,
        aiConfidence: aiForecast?.confidence,
      });
    }
    
    // Combine actual + projected
    const weeklyDataWithProjections = [...weeklyData, ...projectedWeeks];
    
    // Get daily data filtered by date range
    const sortedDays = Object.keys(allDaysData)
      .filter(d => hasDailySalesData(allDaysData[d]) && filterByDateRange(d))
      .sort();
    
    // Determine how many days to show based on range
    const daysToShow = trendsDateRange.preset === 'all' ? 30 : 
                       trendsDateRange.preset === 'last30' ? 30 :
                       trendsDateRange.preset === 'last90' ? 90 :
                       sortedDays.length;
    
    const dailyData = sortedDays.slice(-daysToShow).map(d => {
      const day = allDaysData[d];
      
      // Calculate profit using COGS lookup (same as rest of app)
      const amazonProfit = day.amazon?.netProfit || 0;
      const shopifyRevenue = day.shopify?.revenue || 0;
      const shopifyUnits = day.shopify?.units || 0;
      
      // Calculate Shopify COGS from SKU data using savedCogs lookup
      let shopifyCogs = day.shopify?.cogs || 0;
      if (shopifyCogs === 0 && day.shopify?.skuData) {
        shopifyCogs = (day.shopify.skuData || []).reduce((sum, sku) => {
          const skuKey = sku.sku || sku.title || '';
          const unitCost = getCogsCost(skuKey) || getCogsCost(sku.title) || 0;
          return sum + (unitCost * (sku.unitsSold || sku.units || 0));
        }, 0);
      }
      
      const shopifyFees = day.shopify?.fees || 0;
      const shopifyShipping = day.shopify?.shipping || 0;
      const shopifyAdSpend = day.shopify?.adSpend || 0;
      const shopifyProfit = day.shopify?.netProfit || (shopifyRevenue - shopifyCogs - shopifyFees - shopifyShipping - shopifyAdSpend);
      
      const totalRevenue = day.total?.revenue || (day.amazon?.revenue || 0) + shopifyRevenue;
      const totalProfit = day.total?.netProfit || (amazonProfit + shopifyProfit);
      const totalMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
      
      return {
        key: d,
        label: new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        source: 'daily',
        revenue: totalRevenue,
        profit: totalProfit,
        units: day.total?.units || (day.amazon?.units || 0) + shopifyUnits,
        margin: day.total?.netMargin || totalMargin,
        amazonRev: day.amazon?.revenue || 0,
        amazonProfit: amazonProfit,
        amazonUnits: day.amazon?.units || 0,
        shopifyRev: shopifyRevenue,
        shopifyProfit: shopifyProfit,
        shopifyUnits: shopifyUnits,
        adSpend: day.total?.adSpend || (day.amazon?.adSpend || 0) + shopifyAdSpend,
        roas: day.total?.roas || 0,
        skuData: [...(day.amazon?.skuData || []), ...(day.shopify?.skuData || [])],
      };
    });
    
    const monthlyTrends = getMonthlyTrends();
    const yearlyTrends = getYearlyTrends();
    
    // Add projected months - USE AI FORECAST SYSTEM when available
    const monthlyWithProjections = (() => {
      const monthlyData = monthlyTrends.map(([k, v]) => v);
      if (monthlyData.length === 0) return [];
      
      // Get AI forecast data
      const aiForecast = enhancedForecast || generateForecast;
      const aiMonthlyForecast = aiForecast?.monthly;
      const aiTrend = aiForecast?.trend;
      const aiConfidence = aiForecast?.confidence;
      
      // Calculate average monthly metrics from recent data (fallback)
      const recentMonths = monthlyData.slice(-3);
      const avgMonthlyRevenue = recentMonths.reduce((s, m) => s + m.revenue, 0) / recentMonths.length;
      const avgMonthlyProfit = recentMonths.reduce((s, m) => s + m.profit, 0) / recentMonths.length;
      const avgMonthlyUnits = recentMonths.reduce((s, m) => s + m.units, 0) / recentMonths.length;
      const avgMonthlyMargin = avgMonthlyRevenue > 0 ? (avgMonthlyProfit / avgMonthlyRevenue) * 100 : 0;
      
      // Calculate month-over-month growth trend from AI or calculate manually
      let monthlyGrowthRate = 0;
      if (aiTrend?.revenueChange) {
        // Convert weekly trend to monthly (roughly 4.33 weeks per month)
        monthlyGrowthRate = (aiTrend.revenueChange / 100) * 4.33;
      } else {
        // Calculate from recent months
        const growthRates = [];
        for (let i = 1; i < recentMonths.length; i++) {
          if (recentMonths[i-1].revenue > 0) {
            growthRates.push((recentMonths[i].revenue - recentMonths[i-1].revenue) / recentMonths[i-1].revenue);
          }
        }
        monthlyGrowthRate = growthRates.length > 0 ? growthRates.reduce((s, r) => s + r, 0) / growthRates.length : 0;
      }
      // Cap growth at ±15% per month
      const cappedGrowth = Math.max(-0.15, Math.min(0.15, monthlyGrowthRate));
      
      // Generate next 6 projected months with AI-informed growth
      const lastMonth = monthlyData[monthlyData.length - 1];
      const lastDate = new Date(lastMonth.key + '-01');
      const projectedMonths = [];
      
      // Use AI monthly forecast for first month if available, then apply trend
      let baseRevenue = aiMonthlyForecast?.revenue ? aiMonthlyForecast.revenue / 4 : lastMonth.revenue || avgMonthlyRevenue;
      let baseProfit = aiMonthlyForecast?.profit ? aiMonthlyForecast.profit / 4 : lastMonth.profit || avgMonthlyProfit;
      let baseUnits = aiMonthlyForecast?.units ? aiMonthlyForecast.units / 4 : lastMonth.units || avgMonthlyUnits;
      
      // If we have AI forecast, use it for base values
      if (aiMonthlyForecast && aiMonthlyForecast.revenue > 0) {
        // AI forecast is for 4 weeks, so this is roughly a monthly value
        baseRevenue = aiMonthlyForecast.revenue;
        baseProfit = aiMonthlyForecast.profit;
        baseUnits = aiMonthlyForecast.units;
      }
      
      for (let i = 1; i <= 6; i++) {
        const futureDate = new Date(lastDate.getFullYear(), lastDate.getMonth() + i, 1);
        const monthKey = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}`;
        
        // Apply growth multiplier
        const growthMultiplier = Math.pow(1 + cappedGrowth, i);
        const projectedRevenue = Math.round(baseRevenue * growthMultiplier);
        const projectedProfit = Math.round(baseProfit * growthMultiplier);
        const projectedUnits = Math.round(baseUnits * growthMultiplier);
        
        projectedMonths.push({
          key: monthKey,
          label: futureDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          source: 'projected',
          isProjected: true,
          revenue: 0,
          profit: 0,
          units: 0,
          margin: 0,
          projectedRevenue,
          projectedProfit,
          projectedUnits,
          projectedMargin: avgMonthlyMargin,
          forecastRevenue: projectedRevenue,
          forecastSource: aiMonthlyForecast ? 'ai-forecast' : 'trend',
          growthRate: cappedGrowth,
          aiConfidence,
        });
      }
      
      return [...monthlyData, ...projectedMonths];
    })();
    
    // Select data based on active tab with fallbacks
    let currentData = [];
    if (trendsTab === 'daily' && dailyData.length > 0) {
      currentData = dailyData;
    } else if (trendsTab === 'weekly' && weeklyDataWithProjections.length > 0) {
      currentData = weeklyDataWithProjections;
    } else if (trendsTab === 'monthly' && monthlyWithProjections.length > 0) {
      currentData = monthlyWithProjections;
    } else if (trendsTab === 'yearly' && yearlyTrends.length > 0) {
      currentData = yearlyTrends.map(([k, v]) => v);
    } else {
      // Fallback: use whatever data is available
      if (dailyData.length > 0) {
        currentData = dailyData;
      } else if (monthlyWithProjections.length > 0) {
        currentData = monthlyWithProjections;
      } else if (weeklyDataWithProjections.length > 0) {
        currentData = weeklyDataWithProjections;
      } else if (yearlyTrends.length > 0) {
        currentData = yearlyTrends.map(([k, v]) => v);
      }
    }
    
    // For stats cards, only use actual data (not projected)
    const actualData = currentData.filter(d => !d.isProjected);
    
    // When filtering by channel, find the latest period that has data for that channel
    const getLatestWithChannelData = () => {
      if (trendsChannel === 'combined') {
        return actualData[actualData.length - 1];
      }
      // Find the latest period with actual data for the selected channel
      for (let i = actualData.length - 1; i >= 0; i--) {
        const period = actualData[i];
        if (trendsChannel === 'amazon' && (period.amazonRev > 0 || period.amazonUnits > 0)) {
          return period;
        }
        if (trendsChannel === 'shopify' && (period.shopifyRev > 0 || period.shopifyUnits > 0)) {
          return period;
        }
      }
      return actualData[actualData.length - 1]; // Fallback
    };
    
    const getPreviousWithChannelData = (latestIdx) => {
      if (trendsChannel === 'combined') {
        return actualData[actualData.length - 2];
      }
      const latestIndex = actualData.findIndex(d => d === latestIdx);
      for (let i = latestIndex - 1; i >= 0; i--) {
        const period = actualData[i];
        if (trendsChannel === 'amazon' && (period.amazonRev > 0 || period.amazonUnits > 0)) {
          return period;
        }
        if (trendsChannel === 'shopify' && (period.shopifyRev > 0 || period.shopifyUnits > 0)) {
          return period;
        }
      }
      return null;
    };
    
    const latestPeriod = getLatestWithChannelData();
    const prevPeriod = getPreviousWithChannelData(latestPeriod);
    
    // Apply channel filter to data - defined here so rangeTotals can use it
    const getFilteredValue = (d, field) => {
      if (trendsChannel === 'amazon') {
        if (field === 'revenue') return d.amazonRev || 0;
        if (field === 'profit') return d.amazonProfit || 0;
        if (field === 'units') return d.amazonUnits || 0;
      } else if (trendsChannel === 'shopify') {
        if (field === 'revenue') return d.shopifyRev || 0;
        if (field === 'profit') return d.shopifyProfit || 0;
        if (field === 'units') return d.shopifyUnits || 0;
      }
      return d[field] || 0;
    };
    
    // Also calculate totals for the entire selected range (for the selected channel)
    const rangeTotals = actualData.reduce((acc, d) => {
      acc.revenue += getFilteredValue(d, 'revenue');
      acc.profit += getFilteredValue(d, 'profit');
      acc.units += getFilteredValue(d, 'units');
      return acc;
    }, { revenue: 0, profit: 0, units: 0 });
    
    // Find max values for chart scaling
    const maxRevenue = Math.max(...currentData.map(d => d.revenue || 0), 1);
    const maxProfit = Math.max(...currentData.map(d => Math.abs(d.profit || 0)), 1);
    
    // Aggregate SKU trends
    const getSkuTrends = () => {
      const skuMap = {};
      currentData.forEach((period, idx) => {
        (period.skuData || []).forEach(sku => {
          const key = sku.sku || sku.title || 'Unknown';
          if (!skuMap[key]) {
            skuMap[key] = { sku: key, name: sku.title || sku.productName || key, periods: [], totalUnits: 0, totalProfit: 0 };
          }
          const profit = sku.netProceeds || ((sku.netSales || 0) - (sku.cogs || 0));
          const units = sku.unitsSold || 0;
          const ppu = units > 0 ? profit / units : 0;
          skuMap[key].periods.push({ idx, units, profit, ppu });
          skuMap[key].totalUnits += units;
          skuMap[key].totalProfit += profit;
        });
      });
      
      return Object.values(skuMap)
        .filter(s => s.periods.length >= 2 && s.totalUnits >= 3)
        .map(s => {
          const avgPPU = s.totalUnits > 0 ? s.totalProfit / s.totalUnits : 0;
          const recentPeriods = s.periods.slice(-Math.ceil(s.periods.length / 2));
          const olderPeriods = s.periods.slice(0, Math.floor(s.periods.length / 2));
          const recentPPU = recentPeriods.length > 0 ? recentPeriods.reduce((sum, p) => sum + p.ppu, 0) / recentPeriods.length : 0;
          const olderPPU = olderPeriods.length > 0 ? olderPeriods.reduce((sum, p) => sum + p.ppu, 0) / olderPeriods.length : recentPPU;
          const trend = olderPPU !== 0 ? ((recentPPU - olderPPU) / Math.abs(olderPPU)) * 100 : 0;
          return { ...s, avgPPU, recentPPU, olderPPU, trend };
        })
        .sort((a, b) => a.trend - b.trend);
    };
    
    const skuTrends = getSkuTrends();
    const decliningSkus = skuTrends.filter(s => s.trend < -10).slice(0, 8);
    const improvingSkus = skuTrends.filter(s => s.trend > 10).sort((a, b) => b.trend - a.trend).slice(0, 8);
    
    const periodLabel = trendsTab === 'daily' ? 'Daily' : trendsTab === 'weekly' ? 'Weekly' : trendsTab === 'monthly' ? 'Monthly' : trendsTab === 'yearly' ? 'Yearly' : 'Returns';
    const periodLabelShort = trendsTab === 'daily' ? 'Day' : trendsTab === 'weekly' ? 'Week' : trendsTab === 'monthly' ? 'Month' : trendsTab === 'yearly' ? 'Year' : 'SKU';
    const dataAvailable = trendsTab === 'returns' ? Object.keys(returnRates.bySku || {}).length > 0 : currentData.length > 0;

    return (
      <div className="min-h-screen bg-slate-950 p-4 lg:p-6">
        <div className="max-w-7xl mx-auto">{globalModals}
          <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />
          {dataBar}
          
          <div className="mb-6">
            <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">📈 Trends Dashboard</h1>
            <p className="text-slate-400">Performance trends across different time periods</p>
          </div>
          
          {/* Time Period Tabs */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button 
              onClick={() => setTrendsTab('daily')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${trendsTab === 'daily' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
            >
              🕐 Daily ({sortedDays.length})
            </button>
            <button 
              onClick={() => setTrendsTab('weekly')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${trendsTab === 'weekly' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
            >
              📅 Weekly ({sortedWeeks.length})
            </button>
            <button 
              onClick={() => setTrendsTab('monthly')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${trendsTab === 'monthly' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
            >
              📊 Monthly ({monthlyTrends.length})
            </button>
            <button 
              onClick={() => setTrendsTab('yearly')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${trendsTab === 'yearly' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
            >
              📆 Yearly ({yearlyTrends.length})
            </button>
            <button 
              onClick={() => setTrendsTab('returns')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${trendsTab === 'returns' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
            >
              🔄 Returns ({Object.keys(returnRates.bySku || {}).length} SKUs)
            </button>
          </div>
          
          {/* Channel Filter */}
          <div className="flex flex-wrap gap-2 mb-4 items-center">
            <span className="text-slate-400 text-sm mr-2">Channel:</span>
            <button 
              onClick={() => setTrendsChannel('combined')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${trendsChannel === 'combined' ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
            >
              All Channels
            </button>
            <button 
              onClick={() => setTrendsChannel('amazon')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${trendsChannel === 'amazon' ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
            >
              🛒 Amazon
            </button>
            <button 
              onClick={() => setTrendsChannel('shopify')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${trendsChannel === 'shopify' ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
            >
              🛍️ Shopify
            </button>
          </div>
          
          {/* Date Range Filter */}
          <div className="flex flex-wrap gap-2 mb-6 items-center bg-slate-800/50 rounded-lg p-3 border border-slate-700">
            <span className="text-slate-400 text-sm mr-2">📅 Date Range:</span>
            <button 
              onClick={() => setTrendsDateRange({ start: null, end: null, preset: 'all' })}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${trendsDateRange.preset === 'all' ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
            >
              All Time
            </button>
            <button 
              onClick={() => {
                const now = new Date();
                const start = `${now.getFullYear()}-01-01`;
                const end = `${now.getFullYear()}-12-31`;
                setTrendsDateRange({ start, end, preset: 'ytd' });
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${trendsDateRange.preset === 'ytd' ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
            >
              {new Date().getFullYear()}
            </button>
            <button 
              onClick={() => {
                const lastYear = new Date().getFullYear() - 1;
                setTrendsDateRange({ start: `${lastYear}-01-01`, end: `${lastYear}-12-31`, preset: 'lastyear' });
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${trendsDateRange.preset === 'lastyear' ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
            >
              {new Date().getFullYear() - 1}
            </button>
            <button 
              onClick={() => {
                const now = new Date();
                const end = now.toISOString().split('T')[0];
                const start = new Date(now.setDate(now.getDate() - 30)).toISOString().split('T')[0];
                setTrendsDateRange({ start, end, preset: 'last30' });
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${trendsDateRange.preset === 'last30' ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
            >
              Last 30 Days
            </button>
            <button 
              onClick={() => {
                const now = new Date();
                const end = now.toISOString().split('T')[0];
                const start = new Date(now.setDate(now.getDate() - 90)).toISOString().split('T')[0];
                setTrendsDateRange({ start, end, preset: 'last90' });
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${trendsDateRange.preset === 'last90' ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
            >
              Last 90 Days
            </button>
            
            {/* Custom Date Range */}
            <div className="flex items-center gap-2 ml-2 border-l border-slate-600 pl-3">
              <input 
                type="date" 
                value={trendsDateRange.start || ''} 
                onChange={(e) => setTrendsDateRange(prev => ({ ...prev, start: e.target.value, preset: 'custom' }))}
                className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white"
              />
              <span className="text-slate-500">to</span>
              <input 
                type="date" 
                value={trendsDateRange.end || ''} 
                onChange={(e) => setTrendsDateRange(prev => ({ ...prev, end: e.target.value, preset: 'custom' }))}
                className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white"
              />
            </div>
          </div>
          
          {!dataAvailable ? (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-12 text-center">
              <Database className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">No {periodLabel} Data Available</h3>
              <p className="text-slate-400 mb-4">Upload {trendsTab} data to see trends</p>
              {trendsTab === 'daily' && (
                <button onClick={() => { setUploadTab('amazon-bulk'); setView('upload'); }} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-white">
                  Upload Daily Data
                </button>
              )}
            </div>
          ) : (
            <>
              {/* RETURNS TAB CONTENT */}
              {trendsTab === 'returns' ? (
                <div className="space-y-6">
                  {/* Overall Return Rate Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-gradient-to-br from-rose-900/40 to-rose-800/20 rounded-xl border border-rose-500/30 p-4">
                      <p className="text-rose-400 text-sm mb-1">Overall Return Rate</p>
                      <p className="text-3xl font-bold text-white">{(returnRates.overall?.returnRate || 0).toFixed(2)}%</p>
                      <p className="text-slate-400 text-xs mt-1">{formatNumber(returnRates.overall?.unitsReturned || 0)} of {formatNumber(returnRates.overall?.unitsSold || 0)} units</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                      <p className="text-slate-400 text-sm mb-1">Total Units Sold</p>
                      <p className="text-2xl font-bold text-white">{formatNumber(returnRates.overall?.unitsSold || 0)}</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                      <p className="text-slate-400 text-sm mb-1">Total Units Returned</p>
                      <p className="text-2xl font-bold text-rose-400">{formatNumber(returnRates.overall?.unitsReturned || 0)}</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                      <p className="text-slate-400 text-sm mb-1">SKUs Tracked</p>
                      <p className="text-2xl font-bold text-white">{Object.keys(returnRates.bySku || {}).length}</p>
                    </div>
                  </div>
                  
                  {/* Monthly Return Rate Trend */}
                  {Object.keys(returnRates.byMonth || {}).length > 0 && (
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                      <h3 className="text-lg font-semibold text-white mb-4">📊 Monthly Return Rate Trend</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-700">
                              <th className="text-left text-slate-400 pb-2">Month</th>
                              <th className="text-right text-slate-400 pb-2">Units Sold</th>
                              <th className="text-right text-slate-400 pb-2">Returns</th>
                              <th className="text-right text-slate-400 pb-2">Return Rate</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(returnRates.byMonth || {}).sort((a, b) => b[0].localeCompare(a[0])).map(([month, data]) => (
                              <tr key={month} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                                <td className="py-2 text-white font-medium">{month}</td>
                                <td className="py-2 text-right text-slate-300">{formatNumber(data.unitsSold)}</td>
                                <td className="py-2 text-right text-rose-400">{formatNumber(data.unitsReturned)}</td>
                                <td className={`py-2 text-right font-medium ${data.returnRate > 5 ? 'text-rose-400' : data.returnRate > 2 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                  {data.returnRate.toFixed(2)}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  
                  {/* SKU Return Rates - Problematic SKUs */}
                  <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                    <h3 className="text-lg font-semibold text-white mb-4">🔴 SKU Return Rates (Sorted by Worst)</h3>
                    <div className="overflow-x-auto max-h-96">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-slate-800">
                          <tr className="border-b border-slate-700">
                            <th className="text-left text-slate-400 pb-2 px-2">SKU</th>
                            <th className="text-left text-slate-400 pb-2 px-2">Product</th>
                            <th className="text-right text-slate-400 pb-2 px-2">Units Sold</th>
                            <th className="text-right text-slate-400 pb-2 px-2">Returns</th>
                            <th className="text-right text-slate-400 pb-2 px-2">Return Rate</th>
                            <th className="text-right text-slate-400 pb-2 px-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(returnRates.bySku || {})
                            .filter(([sku, data]) => data.unitsSold >= 5) // Only show SKUs with enough data
                            .sort((a, b) => b[1].returnRate - a[1].returnRate)
                            .map(([sku, data]) => (
                              <tr key={sku} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                                <td className="py-2 px-2 text-cyan-400 font-mono text-xs">{sku}</td>
                                <td className="py-2 px-2 text-white truncate max-w-[200px]">{savedProductNames[sku] || sku}</td>
                                <td className="py-2 px-2 text-right text-slate-300">{formatNumber(data.unitsSold)}</td>
                                <td className="py-2 px-2 text-right text-rose-400">{formatNumber(data.unitsReturned)}</td>
                                <td className={`py-2 px-2 text-right font-bold ${data.returnRate > 10 ? 'text-rose-500' : data.returnRate > 5 ? 'text-rose-400' : data.returnRate > 2 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                  {data.returnRate.toFixed(2)}%
                                </td>
                                <td className="py-2 px-2 text-right">
                                  {data.returnRate > 10 ? (
                                    <span className="px-2 py-1 bg-rose-900/50 text-rose-300 text-xs rounded-full">⚠️ Critical</span>
                                  ) : data.returnRate > 5 ? (
                                    <span className="px-2 py-1 bg-amber-900/50 text-amber-300 text-xs rounded-full">⚡ High</span>
                                  ) : data.returnRate > 2 ? (
                                    <span className="px-2 py-1 bg-yellow-900/50 text-yellow-300 text-xs rounded-full">📊 Monitor</span>
                                  ) : (
                                    <span className="px-2 py-1 bg-emerald-900/50 text-emerald-300 text-xs rounded-full">✅ Good</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      {Object.entries(returnRates.bySku || {}).filter(([sku, data]) => data.unitsSold >= 5).length === 0 && (
                        <p className="text-slate-500 text-center py-4">No SKUs with enough data (minimum 5 units sold)</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Weekly Return Rate Trend */}
                  {Object.keys(returnRates.byWeek || {}).length > 0 && (
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                      <h3 className="text-lg font-semibold text-white mb-4">📅 Weekly Return Rate (Last 12 Weeks)</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-700">
                              <th className="text-left text-slate-400 pb-2">Week Ending</th>
                              <th className="text-right text-slate-400 pb-2">Units Sold</th>
                              <th className="text-right text-slate-400 pb-2">Returns</th>
                              <th className="text-right text-slate-400 pb-2">Return Rate</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(returnRates.byWeek || {}).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12).map(([week, data]) => (
                              <tr key={week} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                                <td className="py-2 text-white font-medium">{week}</td>
                                <td className="py-2 text-right text-slate-300">{formatNumber(data.unitsSold)}</td>
                                <td className="py-2 text-right text-rose-400">{formatNumber(data.unitsReturned)}</td>
                                <td className={`py-2 text-right font-medium ${data.returnRate > 5 ? 'text-rose-400' : data.returnRate > 2 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                  {data.returnRate.toFixed(2)}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
              <>
              {/* Channel indicator */}
              {trendsChannel !== 'combined' && (
                <div className={`mb-4 px-4 py-2 rounded-lg inline-flex items-center gap-2 ${trendsChannel === 'amazon' ? 'bg-orange-900/30 border border-orange-500/30 text-orange-300' : 'bg-green-900/30 border border-green-500/30 text-green-300'}`}>
                  <span className="text-sm">Showing {trendsChannel === 'amazon' ? 'Amazon' : 'Shopify'} data only</span>
                  <button onClick={() => setTrendsChannel('combined')} className="text-xs underline opacity-70 hover:opacity-100">Show all</button>
                </div>
              )}
              
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                  <p className="text-slate-400 text-sm mb-1">
                    Revenue (Latest {periodLabelShort})
                    {latestPeriod?.label && <span className="text-slate-500 text-xs ml-1">• {latestPeriod.label}</span>}
                  </p>
                  <p className="text-2xl font-bold text-white">{formatCurrency(getFilteredValue(latestPeriod || {}, 'revenue'))}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-slate-500 text-xs">vs previous</span>
                    <ChangeIndicator current={getFilteredValue(latestPeriod || {}, 'revenue')} previous={getFilteredValue(prevPeriod || {}, 'revenue')} />
                  </div>
                  {rangeTotals.revenue > 0 && actualData.length > 1 && (
                    <div className="mt-2 pt-2 border-t border-slate-700">
                      <span className="text-slate-500 text-xs">Range total ({actualData.length} {periodLabelShort.toLowerCase()}s): </span>
                      <span className="text-slate-300 text-xs font-medium">{formatCurrency(rangeTotals.revenue)}</span>
                    </div>
                  )}
                </div>
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                  <p className="text-slate-400 text-sm mb-1">Net Profit</p>
                  <p className={`text-2xl font-bold ${(getFilteredValue(latestPeriod || {}, 'profit')) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(getFilteredValue(latestPeriod || {}, 'profit'))}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-slate-500 text-xs">vs previous</span>
                    <ChangeIndicator current={getFilteredValue(latestPeriod || {}, 'profit')} previous={getFilteredValue(prevPeriod || {}, 'profit')} />
                  </div>
                  {rangeTotals.profit !== 0 && actualData.length > 1 && (
                    <div className="mt-2 pt-2 border-t border-slate-700">
                      <span className="text-slate-500 text-xs">Range total: </span>
                      <span className={`text-xs font-medium ${rangeTotals.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(rangeTotals.profit)}</span>
                    </div>
                  )}
                </div>
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                  <p className="text-slate-400 text-sm mb-1">Units Sold</p>
                  <p className="text-2xl font-bold text-white">{formatNumber(getFilteredValue(latestPeriod || {}, 'units'))}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-slate-500 text-xs">vs previous</span>
                    <ChangeIndicator current={getFilteredValue(latestPeriod || {}, 'units')} previous={getFilteredValue(prevPeriod || {}, 'units')} />
                  </div>
                  {rangeTotals.units > 0 && actualData.length > 1 && (
                    <div className="mt-2 pt-2 border-t border-slate-700">
                      <span className="text-slate-500 text-xs">Range total: </span>
                      <span className="text-slate-300 text-xs font-medium">{formatNumber(rangeTotals.units)}</span>
                    </div>
                  )}
                </div>
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                  <p className="text-slate-400 text-sm mb-1">Profit Margin</p>
                  {(() => {
                    const latestRev = getFilteredValue(latestPeriod || {}, 'revenue');
                    const latestProfit = getFilteredValue(latestPeriod || {}, 'profit');
                    const latestMargin = latestRev > 0 ? (latestProfit / latestRev) * 100 : 0;
                    const prevRev = getFilteredValue(prevPeriod || {}, 'revenue');
                    const prevProfit = getFilteredValue(prevPeriod || {}, 'profit');
                    const prevMargin = prevRev > 0 ? (prevProfit / prevRev) * 100 : 0;
                    const marginChange = latestMargin - prevMargin;
                    const rangeMargin = rangeTotals.revenue > 0 ? (rangeTotals.profit / rangeTotals.revenue) * 100 : 0;
                    return (
                      <>
                        <p className={`text-2xl font-bold ${latestMargin >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatPercent(latestMargin)}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-slate-500 text-xs">vs previous</span>
                          {prevPeriod && <span className={`text-sm ${marginChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {marginChange >= 0 ? '+' : ''}{marginChange.toFixed(1)}pt
                          </span>}
                        </div>
                        {actualData.length > 1 && (
                          <div className="mt-2 pt-2 border-t border-slate-700">
                            <span className="text-slate-500 text-xs">Range avg: </span>
                            <span className={`text-xs font-medium ${rangeMargin >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatPercent(rangeMargin)}</span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
              
              {/* Revenue Trend Chart - Actual vs Forecast */}
              <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6 overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">
                    {periodLabel} Revenue — Actual vs Forecast
                    {trendsChannel !== 'combined' && <span className="text-sm font-normal text-slate-400 ml-2">({trendsChannel === 'amazon' ? 'Amazon' : 'Shopify'})</span>}
                  </h3>
                  {/* Legend */}
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-violet-500 rounded" />Actual</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-500/60 rounded" />Forecast</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-500/60 rounded" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.2) 2px, rgba(0,0,0,0.2) 4px)' }} />Projected</span>
                  </div>
                </div>
                {(() => {
                  // Include forecast/projected values in max calculation for proper scaling
                  const allValues = currentData.flatMap(d => [
                    getFilteredValue(d, 'revenue'), 
                    d.forecastRevenue || 0,
                    d.projectedRevenue || 0
                  ]);
                  const chartMaxRevenue = Math.max(...allValues, 1);
                  const barMinWidth = currentData.length > 30 ? '4px' : currentData.length > 20 ? '8px' : '16px';
                  
                  // Calculate overall forecast accuracy (only for periods with actual data)
                  // Filter out outliers with extreme accuracy values (indicates bad forecast data)
                  const weeksWithForecasts = currentData.filter(d => 
                    d.forecastRevenue !== null && d.revenue > 0 && 
                    d.accuracy !== null && d.accuracy > -100 // Filter out extreme outliers
                  );
                  const avgAccuracy = weeksWithForecasts.length > 0 
                    ? Math.max(-100, Math.min(100, weeksWithForecasts.reduce((s, d) => s + (d.accuracy || 0), 0) / weeksWithForecasts.length))
                    : null;
                  
                  // Count projected periods
                  const projectedPeriods = currentData.filter(d => d.isProjected);
                  
                  return (
                    <>
                      {/* Accuracy Summary */}
                      {avgAccuracy !== null && (
                        <div className="flex items-center gap-4 mb-3 text-sm">
                          <span className="text-slate-400">
                            Forecast Accuracy: <span className={`font-medium ${avgAccuracy >= 90 ? 'text-emerald-400' : avgAccuracy >= 80 ? 'text-amber-400' : 'text-rose-400'}`}>
                              {avgAccuracy.toFixed(1)}%
                            </span>
                          </span>
                          <span className="text-slate-500">({weeksWithForecasts.length} periods with forecasts)</span>
                        </div>
                      )}
                      {projectedPeriods.length > 0 && (
                        <div className="flex items-center gap-4 mb-3 text-sm">
                          <span className="text-amber-400/80">
                            {projectedPeriods.some(p => p.forecastSource?.startsWith('ai')) 
                              ? `🤖 ${projectedPeriods.length} AI-projected periods` 
                              : `📊 ${projectedPeriods.length} projected periods`}
                            {(enhancedForecast || generateForecast)?.confidence && 
                              <span className="text-violet-400 ml-2">({(enhancedForecast || generateForecast).confidence}% confidence)</span>
                            }
                          </span>
                        </div>
                      )}
                      
                      {/* Chart bars - stacked/grouped for forecast vs actual */}
                      <div className="relative flex items-end gap-1 h-48 bg-slate-900/30 rounded-lg p-3">
                        {currentData.length === 0 ? (
                          <p className="text-slate-500 text-center w-full self-center">No data available</p>
                        ) : currentData.map((d, i) => {
                          const actualValue = getFilteredValue(d, 'revenue');
                          const forecastValue = d.forecastRevenue || d.projectedRevenue || 0;
                          const isProjected = d.isProjected;
                          const actualHeight = chartMaxRevenue > 0 ? (actualValue / chartMaxRevenue) * 100 : 0;
                          const projectedHeight = chartMaxRevenue > 0 ? (forecastValue / chartMaxRevenue) * 100 : 0;
                          const isLatest = i === currentData.filter(x => !x.isProjected).length - 1;
                          const isClickable = trendsTab === 'daily' && d.key && !isProjected;
                          const hasForecast = forecastValue > 0;
                          const variance = hasForecast && actualValue > 0 ? actualValue - forecastValue : null;
                          const variancePct = hasForecast && forecastValue > 0 && actualValue > 0 ? ((variance / forecastValue) * 100) : null;
                          
                          return (
                            <div 
                              key={d.key || i} 
                              className={`flex-1 flex items-end justify-center group relative h-full ${isClickable ? 'cursor-pointer' : ''}`}
                              style={{ minWidth: barMinWidth, maxWidth: '60px' }}
                              onClick={() => isClickable && setViewingDayDetails(d.key)}
                            >
                              {/* Tooltip */}
                              <div className="absolute -top-16 left-1/2 transform -translate-x-1/2 hidden group-hover:block bg-slate-700 text-white text-xs px-2 py-1.5 rounded whitespace-nowrap z-50 pointer-events-none shadow-lg">
                                <p className="font-medium">{d.label} {isProjected && <span className="text-amber-400">(Projected)</span>}</p>
                                {isProjected ? (
                                  <>
                                    <p className="text-amber-400">Projected: {formatCurrency(forecastValue)}</p>
                                    <p className="text-slate-400 text-[10px]">
                                      {d.forecastSource === 'ai-amazon' ? '🤖 AI + Amazon forecast' :
                                       d.forecastSource === 'ai-trend' ? '🤖 AI trend forecast' :
                                       d.forecastSource === 'ai-forecast' ? '🤖 AI forecast model' :
                                       d.forecastSource === 'amazon' ? 'Amazon forecast' : 
                                       d.forecastSource === 'average' ? 'Based on average' :
                                       d.growthRate ? `${(d.growthRate * 100).toFixed(1)}% MoM trend` : 'Based on trend'}
                                    </p>
                                    {d.aiConfidence && <p className="text-violet-400 text-[10px]">{d.aiConfidence}% confidence</p>}
                                  </>
                                ) : (
                                  <>
                                    <p>Actual: {formatCurrency(actualValue)}</p>
                                    {hasForecast && (
                                      <>
                                        <p className="text-amber-400">Forecast: {formatCurrency(forecastValue)}</p>
                                        {variance !== null && (
                                          <p className={variance >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                            {variance >= 0 ? '▲' : '▼'} {formatCurrency(Math.abs(variance))} ({variancePct >= 0 ? '+' : ''}{variancePct?.toFixed(1)}%)
                                          </p>
                                        )}
                                      </>
                                    )}
                                  </>
                                )}
                                {isClickable && <span className="text-cyan-400 block text-center mt-1">Click for details</span>}
                              </div>
                              
                              {/* Bars container */}
                              <div className="w-full flex items-end justify-center gap-0.5 h-full">
                                {isProjected ? (
                                  /* Projected period - only show amber bar with striped pattern */
                                  <div 
                                    className="w-3/4 rounded-t transition-all relative z-10 bg-amber-500/60"
                                    style={{ 
                                      height: `${projectedHeight}%`, 
                                      minHeight: projectedHeight > 0 ? '4px' : '0',
                                      backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.1) 3px, rgba(0,0,0,0.1) 6px)'
                                    }}
                                  />
                                ) : (
                                  <>
                                    {/* Forecast bar (behind, wider, more transparent) */}
                                    {hasForecast && (
                                      <div 
                                        className="absolute bottom-0 w-full bg-amber-500/40 rounded-t"
                                        style={{ height: `${projectedHeight}%`, minHeight: projectedHeight > 0 ? '4px' : '0' }}
                                      />
                                    )}
                                    {/* Actual bar (front, narrower) */}
                                    <div 
                                      className={`w-3/4 rounded-t transition-all relative z-10 ${
                                        isLatest ? 'bg-violet-500' : 'bg-violet-500/80'
                                      } hover:bg-violet-400`}
                                      style={{ height: `${actualHeight}%`, minHeight: actualHeight > 0 ? '4px' : '0' }}
                                    />
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {/* X-axis labels - outside chart area */}
                      <div className="flex gap-1 mt-1 px-3">
                        {currentData.length === 0 ? null : currentData.length <= 12 ? (
                          currentData.map((d, i) => (
                            <div key={d.key || i} className="flex-1 text-center" style={{ minWidth: barMinWidth, maxWidth: '60px' }}>
                              <span className="text-[10px] text-slate-500 truncate block">{d.label}</span>
                            </div>
                          ))
                        ) : (
                          /* Show all flex items but only first/last labels for alignment */
                          currentData.map((d, i) => (
                            <div key={d.key || i} className="flex-1 text-center" style={{ minWidth: barMinWidth, maxWidth: '60px' }}>
                              {(i === 0 || i === currentData.length - 1) && (
                                <span className="text-[10px] text-slate-500">{d.label}</span>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
              
              {/* Forecast Accuracy History Panel - only show if we have forecast data */}
              {trendsTab === 'weekly' && currentData.some(d => d.forecastRevenue !== null) && (
                <div className="bg-gradient-to-r from-amber-900/20 to-orange-900/20 rounded-xl border border-amber-500/30 p-5 mb-6">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Target className="w-5 h-5 text-amber-400" />
                    Forecast Accuracy History
                  </h3>
                  
                  {(() => {
                    const weeksWithForecasts = currentData.filter(d => d.forecastRevenue !== null && d.revenue > 0);
                    if (weeksWithForecasts.length === 0) return <p className="text-slate-400">No forecast data available yet.</p>;
                    
                    // Calculate stats
                    const accuracies = weeksWithForecasts.map(d => d.accuracy || 0);
                    const avgAccuracy = accuracies.reduce((s, a) => s + a, 0) / accuracies.length;
                    const variances = weeksWithForecasts.map(d => d.variance || 0);
                    const avgVariance = variances.reduce((s, v) => s + v, 0) / variances.length;
                    const bias = avgVariance > 0 ? 'under-forecasting' : avgVariance < 0 ? 'over-forecasting' : 'neutral';
                    
                    // Trend - compare recent vs older
                    const recentAccuracies = accuracies.slice(-3);
                    const olderAccuracies = accuracies.slice(0, -3);
                    const recentAvg = recentAccuracies.length > 0 ? recentAccuracies.reduce((s, a) => s + a, 0) / recentAccuracies.length : avgAccuracy;
                    const olderAvg = olderAccuracies.length > 0 ? olderAccuracies.reduce((s, a) => s + a, 0) / olderAccuracies.length : avgAccuracy;
                    const improving = recentAvg > olderAvg;
                    
                    return (
                      <>
                        {/* Stats Row */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                          <div className="bg-slate-800/50 rounded-lg p-3">
                            <p className="text-slate-400 text-xs mb-1">Average Accuracy</p>
                            <p className={`text-2xl font-bold ${avgAccuracy >= 90 ? 'text-emerald-400' : avgAccuracy >= 80 ? 'text-amber-400' : 'text-rose-400'}`}>
                              {avgAccuracy.toFixed(1)}%
                            </p>
                          </div>
                          <div className="bg-slate-800/50 rounded-lg p-3">
                            <p className="text-slate-400 text-xs mb-1">Avg Variance</p>
                            <p className={`text-2xl font-bold ${avgVariance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {avgVariance >= 0 ? '+' : ''}{formatCurrency(avgVariance)}
                            </p>
                          </div>
                          <div className="bg-slate-800/50 rounded-lg p-3">
                            <p className="text-slate-400 text-xs mb-1">Bias Direction</p>
                            <p className={`text-lg font-bold ${bias === 'under-forecasting' ? 'text-emerald-400' : bias === 'over-forecasting' ? 'text-rose-400' : 'text-slate-400'}`}>
                              {bias === 'under-forecasting' ? '📈 Under' : bias === 'over-forecasting' ? '📉 Over' : '⚖️ Neutral'}
                            </p>
                          </div>
                          <div className="bg-slate-800/50 rounded-lg p-3">
                            <p className="text-slate-400 text-xs mb-1">Trend</p>
                            <p className={`text-lg font-bold ${improving ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {improving ? '📈 Improving' : '📉 Declining'}
                            </p>
                          </div>
                        </div>
                        
                        {/* History Table */}
                        <div className="overflow-x-auto max-h-48">
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-slate-800">
                              <tr className="border-b border-slate-700">
                                <th className="text-left text-slate-400 py-2 px-2">Week</th>
                                <th className="text-right text-slate-400 py-2 px-2">Forecast</th>
                                <th className="text-right text-slate-400 py-2 px-2">Actual</th>
                                <th className="text-right text-slate-400 py-2 px-2">Variance</th>
                                <th className="text-right text-slate-400 py-2 px-2">Accuracy</th>
                              </tr>
                            </thead>
                            <tbody>
                              {weeksWithForecasts.slice().reverse().map(d => (
                                <tr key={d.key} className="border-b border-slate-700/50">
                                  <td className="py-2 px-2 text-white">{d.label}</td>
                                  <td className="py-2 px-2 text-right text-amber-400">{formatCurrency(d.forecastRevenue)}</td>
                                  <td className="py-2 px-2 text-right text-violet-400">{formatCurrency(d.revenue)}</td>
                                  <td className={`py-2 px-2 text-right ${d.variance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {d.variance >= 0 ? '+' : ''}{formatCurrency(d.variance)}
                                  </td>
                                  <td className={`py-2 px-2 text-right font-medium ${d.accuracy >= 90 ? 'text-emerald-400' : d.accuracy >= 80 ? 'text-amber-400' : 'text-rose-400'}`}>
                                    {d.accuracy?.toFixed(1)}%
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        
                        <p className="text-slate-400 text-sm mt-3">
                          💡 <strong>Insight:</strong> {bias === 'under-forecasting' 
                            ? 'Forecasts are typically lower than actual — consider adjusting models upward or you\'re outperforming expectations!' 
                            : bias === 'over-forecasting' 
                              ? 'Forecasts are typically higher than actual — consider adjusting models downward or review what\'s impacting sales.'
                              : 'Forecasts are well-calibrated to actual results.'}
                        </p>
                      </>
                    );
                  })()}
                </div>
              )}
              
              {/* Profit & Margin Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Profit Trend */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 overflow-hidden">
                  <h3 className="text-lg font-semibold text-white mb-4">
                    {periodLabel} Profit Trend
                    {trendsChannel !== 'combined' && <span className="text-sm font-normal text-slate-400 ml-2">({trendsChannel === 'amazon' ? 'Amazon' : 'Shopify'})</span>}
                  </h3>
                  {(() => {
                    const allProfitValues = currentData.flatMap(d => [
                      Math.abs(getFilteredValue(d, 'profit')),
                      Math.abs(d.projectedProfit || 0)
                    ]);
                    const chartMaxProfit = Math.max(...allProfitValues, 1);
                    const barMinWidth = currentData.length > 30 ? '4px' : currentData.length > 20 ? '8px' : '16px';
                    return (
                      <>
                        <div className="relative flex items-end gap-1 h-48 bg-slate-900/30 rounded-lg p-3">
                          {currentData.length === 0 ? (
                            <p className="text-slate-500 text-center w-full self-center">No data</p>
                          ) : currentData.map((d, i) => {
                            const actualProfit = getFilteredValue(d, 'profit');
                            const projectedProfit = d.projectedProfit || 0;
                            const isProjected = d.isProjected;
                            const displayValue = isProjected ? projectedProfit : actualProfit;
                            const height = chartMaxProfit > 0 ? (Math.abs(displayValue) / chartMaxProfit) * 100 : 0;
                            const isPositive = displayValue >= 0;
                            const isLatest = !isProjected && i === currentData.filter(x => !x.isProjected).length - 1;
                            const isClickable = trendsTab === 'daily' && d.key && !isProjected;
                            return (
                              <div 
                                key={d.key || i} 
                                className={`flex-1 flex items-end justify-center group relative h-full ${isClickable ? 'cursor-pointer' : ''}`}
                                style={{ minWidth: barMinWidth, maxWidth: '60px' }}
                                onClick={() => isClickable && setViewingDayDetails(d.key)}
                              >
                                <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 hidden group-hover:block bg-slate-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-50 pointer-events-none shadow-lg">
                                  {d.label} {isProjected && <span className="text-amber-400">(Projected)</span>}<br/>
                                  {isProjected ? <span className="text-amber-400">{formatCurrency(projectedProfit)}</span> : formatCurrency(actualProfit)}
                                  {isClickable && <span className="text-cyan-400 block text-center mt-1">Click for details</span>}
                                </div>
                                <div 
                                  className={`w-full rounded-t transition-all ${
                                    isProjected 
                                      ? (isPositive ? 'bg-emerald-500/50' : 'bg-rose-500/50')
                                      : isPositive 
                                        ? (isLatest ? 'bg-emerald-500' : 'bg-emerald-500/70') 
                                        : (isLatest ? 'bg-rose-500' : 'bg-rose-500/70')
                                  } ${!isProjected && 'hover:bg-emerald-400'}`}
                                  style={{ 
                                    height: `${height}%`, 
                                    minHeight: height > 0 ? '4px' : '0',
                                    ...(isProjected && { backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.1) 3px, rgba(0,0,0,0.1) 6px)' })
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                        {/* X-axis labels */}
                        <div className="flex gap-1 mt-1 px-3">
                          {currentData.length === 0 ? null : currentData.length <= 12 ? (
                            currentData.map((d, i) => (
                              <div key={d.key || i} className="flex-1 text-center" style={{ minWidth: barMinWidth, maxWidth: '60px' }}>
                                <span className="text-[10px] text-slate-500 truncate block">{d.label}</span>
                              </div>
                            ))
                          ) : (
                            /* Show all flex items but only first/last labels for alignment */
                            currentData.map((d, i) => (
                              <div key={d.key || i} className="flex-1 text-center" style={{ minWidth: barMinWidth, maxWidth: '60px' }}>
                                {(i === 0 || i === currentData.length - 1) && (
                                  <span className="text-[10px] text-slate-500">{d.label}</span>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
                
                {/* Margin Trend */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 overflow-hidden">
                  <h3 className="text-lg font-semibold text-white mb-4">{periodLabel} Margin Trend</h3>
                  {(() => {
                    // Calculate margin from filtered values, including projections
                    const marginData = currentData.map(d => {
                      if (d.isProjected) {
                        return d.projectedMargin || 0;
                      }
                      const rev = getFilteredValue(d, 'revenue');
                      const prof = getFilteredValue(d, 'profit');
                      return rev > 0 ? (prof / rev) * 100 : 0;
                    });
                    const maxMargin = Math.max(...marginData.map(Math.abs), 1);
                    const barMinWidth = currentData.length > 30 ? '4px' : currentData.length > 20 ? '8px' : '16px';
                    return (
                      <>
                        <div className="relative flex items-end gap-1 h-48 bg-slate-900/30 rounded-lg p-3">
                          {currentData.length === 0 ? (
                            <p className="text-slate-500 text-center w-full self-center">No data</p>
                          ) : currentData.map((d, i) => {
                            const margin = marginData[i];
                            const height = (Math.abs(margin) / maxMargin) * 100;
                            const isPositive = margin >= 0;
                            const isProjected = d.isProjected;
                            const isLatest = !isProjected && i === currentData.filter(x => !x.isProjected).length - 1;
                            const isClickable = trendsTab === 'daily' && d.key && !isProjected;
                            return (
                              <div 
                                key={d.key || i} 
                                className={`flex-1 flex items-end justify-center group relative h-full ${isClickable ? 'cursor-pointer' : ''}`}
                                style={{ minWidth: barMinWidth, maxWidth: '60px' }}
                                onClick={() => isClickable && setViewingDayDetails(d.key)}
                              >
                                <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 hidden group-hover:block bg-slate-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-50 pointer-events-none shadow-lg">
                                  {d.label} {isProjected && <span className="text-amber-400">(Projected)</span>}<br/>
                                  {isProjected ? <span className="text-amber-400">{formatPercent(margin)}</span> : formatPercent(margin)}
                                  {isClickable && <span className="text-cyan-400 block text-center mt-1">Click for details</span>}
                                </div>
                                <div 
                                  className={`w-full rounded-t transition-all ${
                                    isProjected 
                                      ? (isPositive ? 'bg-cyan-500/50' : 'bg-rose-500/50')
                                      : isPositive 
                                        ? (isLatest ? 'bg-cyan-500' : 'bg-cyan-500/70') 
                                        : (isLatest ? 'bg-rose-500' : 'bg-rose-500/70')
                                  } ${!isProjected && 'hover:bg-cyan-400'}`}
                                  style={{ 
                                    height: `${height}%`, 
                                    minHeight: height > 0 ? '4px' : '0',
                                    ...(isProjected && { backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.1) 3px, rgba(0,0,0,0.1) 6px)' })
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                        {/* X-axis labels */}
                        <div className="flex gap-1 mt-1 px-3">
                          {currentData.length === 0 ? null : currentData.length <= 12 ? (
                            currentData.map((d, i) => (
                              <div key={d.key || i} className="flex-1 text-center" style={{ minWidth: barMinWidth, maxWidth: '60px' }}>
                                <span className="text-[10px] text-slate-500 truncate block">{d.label}</span>
                              </div>
                            ))
                          ) : (
                            /* Show all flex items but only first/last labels for alignment */
                            currentData.map((d, i) => (
                              <div key={d.key || i} className="flex-1 text-center" style={{ minWidth: barMinWidth, maxWidth: '60px' }}>
                                {(i === 0 || i === currentData.length - 1) && (
                                  <span className="text-[10px] text-slate-500">{d.label}</span>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
              
              {/* Profit Per Unit Trend */}
              <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6 overflow-hidden">
                <h3 className="text-lg font-semibold text-white mb-4">💵 Profit Per Unit Trend</h3>
                {(() => {
                  // Calculate profit per unit from filtered values
                  const ppuData = currentData.map(d => {
                    const units = getFilteredValue(d, 'units');
                    const profit = getFilteredValue(d, 'profit');
                    return units > 0 ? profit / units : 0;
                  });
                  const maxPPU = Math.max(...ppuData.map(Math.abs), 1);
                  // Match Revenue Trend sizing
                  const barMinWidth = currentData.length > 30 ? '4px' : currentData.length > 20 ? '8px' : '16px';
                  return (
                    <>
                      <div className="relative flex items-end gap-1 h-48 bg-slate-900/30 rounded-lg p-3">
                        {currentData.length === 0 ? (
                          <p className="text-slate-500 text-center w-full self-center">No data</p>
                        ) : currentData.map((d, i) => {
                          const ppu = ppuData[i];
                          const height = maxPPU > 0 ? (Math.abs(ppu) / maxPPU) * 100 : 0;
                          const isPositive = ppu >= 0;
                          const isLatest = i === currentData.length - 1;
                          const isClickable = trendsTab === 'daily' && d.key;
                          return (
                            <div 
                              key={d.key || i} 
                              className={`flex-1 flex items-end justify-center group relative h-full ${isClickable ? 'cursor-pointer' : ''}`}
                              style={{ minWidth: barMinWidth, maxWidth: '60px' }}
                              onClick={() => isClickable && setViewingDayDetails(d.key)}
                            >
                              <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 hidden group-hover:block bg-slate-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-50 pointer-events-none shadow-lg">
                                {d.label}<br/>{formatCurrency(ppu)}/unit
                                {isClickable && <span className="text-cyan-400 block text-center mt-1">Click for details</span>}
                              </div>
                              <div 
                                className={`w-full rounded-t transition-all ${isPositive ? (isLatest ? 'bg-amber-500' : 'bg-amber-500/70') : (isLatest ? 'bg-rose-500' : 'bg-rose-500/70')} hover:bg-amber-400`}
                                style={{ height: `${height}%`, minHeight: height > 0 ? '4px' : '0' }}
                              />
                            </div>
                          );
                        })}
                      </div>
                      {/* X-axis labels */}
                      <div className="flex gap-1 mt-1 px-3">
                        {currentData.length === 0 ? null : currentData.length <= 12 ? (
                          currentData.map((d, i) => (
                            <div key={d.key || i} className="flex-1 text-center" style={{ minWidth: barMinWidth, maxWidth: '60px' }}>
                              <span className="text-[10px] text-slate-500 truncate block">{d.label}</span>
                            </div>
                          ))
                        ) : (
                          /* Show all flex items but only first/last labels for alignment */
                          currentData.map((d, i) => (
                            <div key={d.key || i} className="flex-1 text-center" style={{ minWidth: barMinWidth, maxWidth: '60px' }}>
                              {(i === 0 || i === currentData.length - 1) && (
                                <span className="text-[10px] text-slate-500">{d.label}</span>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                      <div className="flex justify-between text-xs text-slate-500 mt-2 px-2">
                        <span>Avg: {formatCurrency(ppuData.reduce((a, b) => a + b, 0) / (ppuData.length || 1))}/unit</span>
                        <span>Latest: {formatCurrency(ppuData[ppuData.length - 1] || 0)}/unit</span>
                      </div>
                    </>
                  );
                })()}
              </div>
              
              {/* Data Table */}
              <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6">
                <h3 className="text-lg font-semibold text-white mb-4">{periodLabel} Summary</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left text-slate-400 font-medium py-2">{periodLabel}</th>
                        <th className="text-right text-slate-400 font-medium py-2">Revenue</th>
                        <th className="text-right text-slate-400 font-medium py-2">Profit</th>
                        <th className="text-right text-slate-400 font-medium py-2">Units</th>
                        <th className="text-right text-slate-400 font-medium py-2">Margin</th>
                        <th className="text-right text-slate-400 font-medium py-2">$/Unit</th>
                        <th className="text-right text-slate-400 font-medium py-2">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentData.slice().reverse().map((d, idx) => {
                        const prev = currentData[currentData.length - idx - 2];
                        // Use filtered values
                        const rev = getFilteredValue(d, 'revenue');
                        const profit = getFilteredValue(d, 'profit');
                        const units = getFilteredValue(d, 'units');
                        const margin = rev > 0 ? (profit / rev) * 100 : 0;
                        const ppu = units > 0 ? profit / units : 0;
                        
                        const prevRev = prev ? getFilteredValue(prev, 'revenue') : 0;
                        const prevProfit = prev ? getFilteredValue(prev, 'profit') : 0;
                        const prevUnits = prev ? getFilteredValue(prev, 'units') : 0;
                        const prevMargin = prevRev > 0 ? (prevProfit / prevRev) * 100 : 0;
                        const prevPPU = prevUnits > 0 ? prevProfit / prevUnits : null;
                        
                        const marginChange = prev ? margin - prevMargin : null;
                        const ppuChange = prevPPU !== null && prevPPU !== 0 ? ((ppu - prevPPU) / Math.abs(prevPPU)) * 100 : null;
                        return (
                          <tr key={d.key} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                            <td className="py-2 text-white font-medium">{d.label}</td>
                            <td className="py-2 text-right text-white">{formatCurrency(rev)}</td>
                            <td className={`py-2 text-right ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(profit)}</td>
                            <td className="py-2 text-right text-white">{formatNumber(units)}</td>
                            <td className={`py-2 text-right ${margin >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {formatPercent(margin)}
                              {marginChange !== null && <span className={`ml-1 text-xs ${marginChange >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>({marginChange >= 0 ? '+' : ''}{marginChange.toFixed(1)}pt)</span>}
                            </td>
                            <td className={`py-2 text-right ${ppu >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                              {formatCurrency(ppu)}
                              {ppuChange !== null && <span className={`ml-1 text-xs ${ppuChange >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>({ppuChange >= 0 ? '+' : ''}{ppuChange.toFixed(1)}%)</span>}
                            </td>
                            <td className="py-2 text-right text-slate-500 text-xs">{d.source}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              
              {/* SKU Profit/Unit Trends */}
              {(decliningSkus.length > 0 || improvingSkus.length > 0) && (
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                  <h3 className="text-lg font-semibold text-white mb-4">🔍 SKU Profit/Unit Trends</h3>
                  <p className="text-slate-400 text-sm mb-4">Comparing recent vs earlier {periodLabel.toLowerCase()}s to identify margin changes</p>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {decliningSkus.length > 0 && (
                      <div>
                        <h4 className="text-rose-400 font-medium mb-3 flex items-center gap-2">
                          <TrendingDown className="w-4 h-4" />⚠️ Margin Declining ({decliningSkus.length})
                        </h4>
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                          {decliningSkus.map(sku => (
                            <div key={sku.sku} className="bg-rose-900/20 border border-rose-500/30 rounded-lg p-3">
                              <div className="flex justify-between items-start">
                                <div className="flex-1 min-w-0">
                                  <p className="text-white text-sm font-medium truncate">{sku.name}</p>
                                  <p className="text-slate-400 text-xs truncate">{sku.sku}</p>
                                </div>
                                <div className="text-right ml-2">
                                  <p className="text-rose-400 font-bold">{sku.trend.toFixed(1)}%</p>
                                </div>
                              </div>
                              <div className="flex justify-between mt-2 text-xs">
                                <span className="text-slate-400">Before: {formatCurrency(sku.olderPPU)}/unit</span>
                                <span className="text-rose-300">Now: {formatCurrency(sku.recentPPU)}/unit</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {improvingSkus.length > 0 && (
                      <div>
                        <h4 className="text-emerald-400 font-medium mb-3 flex items-center gap-2">
                          <TrendingUp className="w-4 h-4" />✅ Margin Improving ({improvingSkus.length})
                        </h4>
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                          {improvingSkus.map(sku => (
                            <div key={sku.sku} className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg p-3">
                              <div className="flex justify-between items-start">
                                <div className="flex-1 min-w-0">
                                  <p className="text-white text-sm font-medium truncate">{sku.name}</p>
                                  <p className="text-slate-400 text-xs truncate">{sku.sku}</p>
                                </div>
                                <div className="text-right ml-2">
                                  <p className="text-emerald-400 font-bold">+{sku.trend.toFixed(1)}%</p>
                                </div>
                              </div>
                              <div className="flex justify-between mt-2 text-xs">
                                <span className="text-slate-400">Before: {formatCurrency(sku.olderPPU)}/unit</span>
                                <span className="text-emerald-300">Now: {formatCurrency(sku.recentPPU)}/unit</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
            )}
          </>
          )}
        </div>
      </div>
    );

};

export default TrendsView;
