import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, X, Check, Upload, Download, RefreshCw, BarChart3, TrendingUp, DollarSign, AlertTriangle, Filter, Search, Sun, Zap, Target, Trophy, Send, Brain, GitCompare, Store
} from 'lucide-react';
import { formatCurrency, formatPercent, formatNumber } from '../../utils/format';
import NavTabs from '../ui/NavTabs';

const AdsView = ({
  adSpend,
  adsAiInput,
  adsAiLoading,
  adsAiMessages,
  adsIntelData,
  adsMonth,
  adsQuarter,
  adsSelectedDay,
  adsSelectedWeek,
  adsTimeTab,
  adsViewMode,
  adsYear,
  allDaysData,
  allPeriodsData,
  allWeeksData,
  amazonCampaignFilter,
  amazonCampaignSort,
  amazonCampaigns,
  appSettings,
  bankingData,
  best,
  breakdown,
  current,
  data,
  dataBar,
  files,
  globalModals,
  invHistory,
  months,
  navDropdown,
  parseAmazonCampaignCSV,
  saveAmazonCampaigns,
  sendAdsAIMessage,
  setAdsAiInput,
  setAdsAiMessages,
  setAdsMonth,
  setAdsQuarter,
  setAdsSelectedDay,
  setAdsSelectedWeek,
  setAdsTimeTab,
  setAdsViewMode,
  setAdsYear,
  setAmazonCampaignFilter,
  setAmazonCampaignSort,
  setNavDropdown,
  setSelectedDay,
  setSelectedInvDate,
  setSelectedPeriod,
  setSelectedWeek,
  setShowAdsAIChat,
  setShowAdsBulkUpload,
  setShowAdsIntelUpload,
  setToast,
  setUploadTab,
  showAdsAIChat,
  status,
  t,
  totalOrders,
  updated,
  setView,
  view,
  save
}) => {
  const sortedWeeks = Object.keys(allWeeksData).sort();
  const sortedDays = Object.keys(allDaysData || {}).sort();
  const hasDailyData = sortedDays.length > 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Get campaign and historical data
  const campaigns = amazonCampaigns?.campaigns || [];
  const hasCampaignData = campaigns.length > 0;
  const campaignSummary = amazonCampaigns?.summary || {};
  const historicalDaily = amazonCampaigns?.historicalDaily || {};
  const hasHistoricalData = Object.keys(historicalDaily).length > 0;
  
  // Calculate quick insights for executive summary
  const getQuickInsights = () => {
    const insights = [];
    
    if (hasCampaignData) {
      const enabledCampaigns = campaigns.filter(c => c.state === 'ENABLED');
      const wastefulCampaigns = enabledCampaigns.filter(c => c.spend > 100 && c.roas < 1.5);
      const scalingOpps = enabledCampaigns.filter(c => c.roas > 4 && c.spend < 500);
      const avgROAS = campaignSummary.roas || 0;
      
      if (wastefulCampaigns.length > 0) {
        const wastedSpend = wastefulCampaigns.reduce((s, c) => s + c.spend, 0);
        insights.push({ type: 'warning', icon: '⚠️', text: `${wastefulCampaigns.length} campaigns with ROAS < 1.5x wasting ${formatCurrency(wastedSpend)}`, action: 'Review underperformers' });
      }
      
      if (scalingOpps.length > 0) {
        insights.push({ type: 'opportunity', icon: '🚀', text: `${scalingOpps.length} high-ROAS campaigns (>4x) could scale with more budget`, action: 'Increase budgets' });
      }
      
      if (avgROAS >= 4) {
        insights.push({ type: 'success', icon: '✅', text: `Excellent overall ROAS of ${avgROAS.toFixed(2)}x - campaigns performing well`, action: null });
      } else if (avgROAS < 2.5) {
        insights.push({ type: 'warning', icon: '📉', text: `Overall ROAS of ${avgROAS.toFixed(2)}x below target (3.0x) - optimization needed`, action: 'Optimize campaigns' });
      }
    }
    
    if (hasHistoricalData) {
      const histDates = Object.keys(historicalDaily).sort();
      const recentDates = histDates.slice(-30);
      const olderDates = histDates.slice(-60, -30);
      
      if (recentDates.length > 0 && olderDates.length > 0) {
        const recentSpend = recentDates.reduce((s, d) => s + (historicalDaily[d]?.spend || 0), 0);
        const recentRev = recentDates.reduce((s, d) => s + (historicalDaily[d]?.adRevenue || historicalDaily[d]?.revenue || 0), 0);
        const olderSpend = olderDates.reduce((s, d) => s + (historicalDaily[d]?.spend || 0), 0);
        const olderRev = olderDates.reduce((s, d) => s + (historicalDaily[d]?.adRevenue || historicalDaily[d]?.revenue || 0), 0);
        
        const recentROAS = recentSpend > 0 ? recentRev / recentSpend : 0;
        const olderROAS = olderSpend > 0 ? olderRev / olderSpend : 0;
        
        if (recentROAS > olderROAS * 1.15) {
          insights.push({ type: 'success', icon: '📈', text: `ROAS improved ${((recentROAS - olderROAS) / olderROAS * 100).toFixed(0)}% in last 30 days`, action: null });
        } else if (recentROAS < olderROAS * 0.85) {
          insights.push({ type: 'warning', icon: '📉', text: `ROAS declined ${((olderROAS - recentROAS) / olderROAS * 100).toFixed(0)}% in last 30 days`, action: 'Investigate decline' });
        }
      }
    }
    
    return insights;
  };
  
  const quickInsights = getQuickInsights();
  
  // Get available years from data
  const allDates = [...sortedWeeks, ...sortedDays];
  const availableYears = [...new Set(allDates.map(d => parseInt(d.substring(0, 4))))].sort((a, b) => b - a);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  // Get weeks/days for selected year
  const weeksInYear = sortedWeeks.filter(w => w.startsWith(String(adsYear)));
  const daysInYear = sortedDays.filter(d => d.startsWith(String(adsYear)));
  const daysInMonth = sortedDays.filter(d => {
    const date = new Date(d + 'T00:00:00');
    return date.getFullYear() === adsYear && date.getMonth() === adsMonth;
  });
  
  // Initialize selected week if not set
  if (adsTimeTab === 'weekly' && !adsSelectedWeek && weeksInYear.length > 0) {
    setTimeout(() => setAdsSelectedWeek(weeksInYear[weeksInYear.length - 1]), 0);
  }
  
  // Initialize selected day if not set
  if (adsTimeTab === 'daily' && !adsSelectedDay && sortedDays.length > 0) {
    setTimeout(() => setAdsSelectedDay(sortedDays[sortedDays.length - 1]), 0);
  }
  
  // Helper to aggregate ad data from weeks
  const aggregateWeeklyData = (weeks) => {
    return weeks.reduce((acc, w) => {
      const week = allWeeksData[w];
      if (!week) return acc;
      const amzAds = week.amazon?.adSpend || 0;
      const amzRev = week.amazon?.revenue || 0;
      
      // Check weekly data first for Meta/Google
      let metaAds = week.shopify?.metaAds || week.shopify?.metaSpend || 0;
      let googleAds = week.shopify?.googleAds || week.shopify?.googleSpend || 0;
      
      // If weekly doesn't have Meta/Google, aggregate from daily data
      if (metaAds === 0 && googleAds === 0) {
        const weekEnd = new Date(w + 'T00:00:00');
        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekStart.getDate() - 6);
        
        sortedDays.filter(d => {
          const date = new Date(d + 'T00:00:00');
          return date >= weekStart && date <= weekEnd;
        }).forEach(d => {
          const day = allDaysData[d];
          metaAds += day?.shopify?.metaSpend || day?.metaSpend || day?.metaAds || 0;
          googleAds += day?.shopify?.googleSpend || day?.googleSpend || day?.googleAds || 0;
        });
      }
      
      const shopifyAdSpend = week.shopify?.adSpend || 0;
      const shopAds = (metaAds + googleAds) > 0 ? (metaAds + googleAds) : shopifyAdSpend;
      const shopRev = week.shopify?.revenue || 0;
      const totalRev = week.total?.revenue || (amzRev + shopRev);
      return {
        amzAds: acc.amzAds + amzAds, amzRev: acc.amzRev + amzRev,
        metaAds: acc.metaAds + metaAds, googleAds: acc.googleAds + googleAds,
        shopAds: acc.shopAds + shopAds, shopRev: acc.shopRev + shopRev,
        totalAds: acc.totalAds + amzAds + shopAds, totalRev: acc.totalRev + totalRev,
        count: acc.count + 1,
      };
    }, { amzAds: 0, amzRev: 0, metaAds: 0, googleAds: 0, shopAds: 0, shopRev: 0, totalAds: 0, totalRev: 0, count: 0 });
  };
  
  // Helper to aggregate daily ad data
  const aggregateDailyData = (days) => {
    return days.reduce((acc, d) => {
      const day = allDaysData[d];
      if (!day) return acc;
      
      // Get ad spend from shopify object
      const googleAds = day.shopify?.googleSpend || day.googleSpend || day.googleAds || 0;
      const metaAds = day.shopify?.metaSpend || day.metaSpend || day.metaAds || 0;
      
      // Get Amazon ad spend - prefer SKU Economics (amazon.adSpend), fall back to amazonAdsMetrics
      const amazonAds = day.amazon?.adSpend || day.amazonAdsMetrics?.spend || 0;
      
      // Get detailed metrics from adsMetrics
      const adsMetrics = day.shopify?.adsMetrics || {};
      const googleImpressions = adsMetrics.googleImpressions || day.googleImpressions || 0;
      const metaImpressions = adsMetrics.metaImpressions || day.metaImpressions || 0;
      const googleClicks = adsMetrics.googleClicks || day.googleClicks || 0;
      const metaClicks = adsMetrics.metaClicks || day.metaClicks || 0;
      const googleConversions = adsMetrics.googleConversions || day.googleConversions || 0;
      const metaPurchases = adsMetrics.metaPurchases || day.metaConversions || 0;
      const metaPurchaseValue = adsMetrics.metaPurchaseValue || 0;
      const metaROAS = adsMetrics.metaROAS || 0;
      const googleCPC = adsMetrics.googleCPC || 0;
      const googleCostPerConv = adsMetrics.googleCostPerConv || 0;
      const metaCPC = adsMetrics.metaCPC || 0;
      const metaCPM = adsMetrics.metaCPM || 0;
      const metaCTR = adsMetrics.metaCTR || 0;
      
      // Amazon Ads Metrics from historical import
      const amzAdsMetrics = day.amazonAdsMetrics || {};
      const amazonImpressions = amzAdsMetrics.impressions || 0;
      const amazonClicks = amzAdsMetrics.clicks || 0;
      const amazonConversions = amzAdsMetrics.conversions || 0;
      const amazonCpc = amzAdsMetrics.cpc || 0;
      const amazonAdsRevenue = amzAdsMetrics.totalRevenue || 0;
      
      // Get revenue for ROAS calculation - prefer SKU Economics, fall back to amazonAdsMetrics
      const shopifyRev = day.shopify?.revenue || 0;
      const amazonRev = day.amazon?.revenue || day.amazonAdsMetrics?.totalRevenue || 0;
      
      return {
        googleAds: acc.googleAds + googleAds, 
        metaAds: acc.metaAds + metaAds,
        amazonAds: acc.amazonAds + amazonAds,
        totalAds: acc.totalAds + googleAds + metaAds + amazonAds,
        googleImpressions: acc.googleImpressions + googleImpressions,
        metaImpressions: acc.metaImpressions + metaImpressions,
        amazonImpressions: acc.amazonImpressions + amazonImpressions,
        totalImpressions: acc.totalImpressions + googleImpressions + metaImpressions + amazonImpressions,
        googleClicks: acc.googleClicks + googleClicks,
        metaClicks: acc.metaClicks + metaClicks,
        amazonClicks: acc.amazonClicks + amazonClicks,
        totalClicks: acc.totalClicks + googleClicks + metaClicks + amazonClicks,
        googleConversions: acc.googleConversions + googleConversions,
        metaPurchases: acc.metaPurchases + metaPurchases,
        amazonConversions: acc.amazonConversions + amazonConversions,
        metaPurchaseValue: acc.metaPurchaseValue + metaPurchaseValue,
        shopifyRev: acc.shopifyRev + shopifyRev,
        amazonRev: acc.amazonRev + amazonRev,
        amazonAdsRevenue: acc.amazonAdsRevenue + amazonAdsRevenue,
        totalRev: acc.totalRev + shopifyRev + amazonRev,
        count: acc.count + 1,
        // Store for averaging later
        _googleCPCs: googleCPC > 0 ? [...(acc._googleCPCs || []), googleCPC] : (acc._googleCPCs || []),
        _metaCPCs: metaCPC > 0 ? [...(acc._metaCPCs || []), metaCPC] : (acc._metaCPCs || []),
        _metaCPMs: metaCPM > 0 ? [...(acc._metaCPMs || []), metaCPM] : (acc._metaCPMs || []),
        _amazonCPCs: amazonCpc > 0 ? [...(acc._amazonCPCs || []), amazonCpc] : (acc._amazonCPCs || []),
      };
    }, { 
      googleAds: 0, metaAds: 0, amazonAds: 0, totalAds: 0, 
      googleImpressions: 0, metaImpressions: 0, amazonImpressions: 0, totalImpressions: 0,
      googleClicks: 0, metaClicks: 0, amazonClicks: 0, totalClicks: 0,
      googleConversions: 0, metaPurchases: 0, amazonConversions: 0, metaPurchaseValue: 0,
      shopifyRev: 0, amazonRev: 0, amazonAdsRevenue: 0, totalRev: 0, count: 0,
      _googleCPCs: [], _metaCPCs: [], _metaCPMs: [], _amazonCPCs: [],
    });
  };
  
  // Get weeks for selected period
  const getWeeksForPeriod = () => {
    switch (adsTimeTab) {
      case 'weekly': return adsSelectedWeek ? [adsSelectedWeek] : [];
      case 'monthly': {
        const monthStart = new Date(adsYear, adsMonth, 1);
        const monthEnd = new Date(adsYear, adsMonth + 1, 0);
        return sortedWeeks.filter(w => {
          const d = new Date(w + 'T00:00:00');
          return d >= monthStart && d <= monthEnd;
        });
      }
      case 'quarterly': {
        const qStart = new Date(adsYear, (adsQuarter - 1) * 3, 1);
        const qEnd = new Date(adsYear, adsQuarter * 3, 0);
        return sortedWeeks.filter(w => {
          const d = new Date(w + 'T00:00:00');
          return d >= qStart && d <= qEnd;
        });
      }
      case 'yearly': return weeksInYear;
      default: return weeksInYear.slice(-4);
    }
  };
  
  // Get comparison period
  const getComparisonWeeks = () => {
    switch (adsTimeTab) {
      case 'weekly': {
        if (!adsSelectedWeek) return [];
        const idx = weeksInYear.indexOf(adsSelectedWeek);
        return idx > 0 ? [weeksInYear[idx - 1]] : [];
      }
      case 'monthly': {
        const prevMonth = adsMonth === 0 ? 11 : adsMonth - 1;
        const prevYear = adsMonth === 0 ? adsYear - 1 : adsYear;
        const monthStart = new Date(prevYear, prevMonth, 1);
        const monthEnd = new Date(prevYear, prevMonth + 1, 0);
        return sortedWeeks.filter(w => {
          const d = new Date(w + 'T00:00:00');
          return d >= monthStart && d <= monthEnd;
        });
      }
      case 'quarterly': {
        const prevQ = adsQuarter === 1 ? 4 : adsQuarter - 1;
        const prevYear = adsQuarter === 1 ? adsYear - 1 : adsYear;
        const qStart = new Date(prevYear, (prevQ - 1) * 3, 1);
        const qEnd = new Date(prevYear, prevQ * 3, 0);
        return sortedWeeks.filter(w => {
          const d = new Date(w + 'T00:00:00');
          return d >= qStart && d <= qEnd;
        });
      }
      case 'yearly': return sortedWeeks.filter(w => w.startsWith(String(adsYear - 1)));
      default: return [];
    }
  };
  
  // Calculate aggregated data
  // Get days based on time tab selection - Daily=yesterday, Weekly=last 7 days, Monthly=last 30 days (from daysInMonth)
  const getDaysForPeriod = () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    switch (adsTimeTab) {
      case 'daily': {
        // Show only the selected day
        if (adsSelectedDay) {
          return [adsSelectedDay];
        }
        // Fall back to most recent day
        return sortedDays.length > 0 ? [sortedDays[sortedDays.length - 1]] : [];
      }
      case 'weekly': {
        // Days in selected week
        if (adsSelectedWeek) {
          const weekEnd = new Date(adsSelectedWeek + 'T00:00:00');
          const weekStart = new Date(weekEnd);
          weekStart.setDate(weekStart.getDate() - 6);
          return sortedDays.filter(d => {
            const date = new Date(d + 'T00:00:00');
            return date >= weekStart && date <= weekEnd;
          });
        }
        // Fall back to last 7 days
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return sortedDays.filter(d => {
          const date = new Date(d + 'T00:00:00');
          return date >= sevenDaysAgo && date <= now;
        });
      }
      case 'monthly': {
        // Selected month
        return daysInMonth;
      }
      default:
        return daysInMonth;
    }
  };
  
  const periodWeeks = getWeeksForPeriod();
  const periodDays = getDaysForPeriod();
  const weeklyTotals = aggregateWeeklyData(periodWeeks);
  const dailyTotals = aggregateDailyData(periodDays);
  const compWeeks = getComparisonWeeks();
  const compTotals = aggregateWeeklyData(compWeeks);
  
  // Always use daily data for Meta/Google (that's where bulk imports go)
  // Use weekly data for Amazon (from SKU Economics) when available
  const useDailyData = adsTimeTab === 'daily' || adsTimeTab === 'weekly';
  
  // For monthly/quarterly/yearly: prefer daily totals if we have Meta/Google there
  const hasDailyMetaGoogle = dailyTotals.metaAds > 0 || dailyTotals.googleAds > 0;
  const hasWeeklyMetaGoogle = weeklyTotals.metaAds > 0 || weeklyTotals.googleAds > 0;
  
  const totals = useDailyData ? {
    ...dailyTotals, 
    amzAds: dailyTotals.amazonAds || 0, 
    amzRev: dailyTotals.amazonRev || 0, 
    shopAds: dailyTotals.googleAds + dailyTotals.metaAds, 
    shopRev: dailyTotals.shopifyRev || 0,
    totalRev: dailyTotals.totalRev || 0
  } : {
    ...weeklyTotals,
    // If daily has Meta/Google but weekly doesn't, use daily values
    metaAds: hasDailyMetaGoogle && !hasWeeklyMetaGoogle ? dailyTotals.metaAds : weeklyTotals.metaAds,
    googleAds: hasDailyMetaGoogle && !hasWeeklyMetaGoogle ? dailyTotals.googleAds : weeklyTotals.googleAds,
    shopAds: hasDailyMetaGoogle && !hasWeeklyMetaGoogle 
      ? (dailyTotals.metaAds + dailyTotals.googleAds) 
      : weeklyTotals.shopAds,
    totalAds: hasDailyMetaGoogle && !hasWeeklyMetaGoogle
      ? (weeklyTotals.amzAds + dailyTotals.metaAds + dailyTotals.googleAds)
      : weeklyTotals.totalAds,
  };
  
  // Calculate metrics
  const shopifyAds = totals.metaAds + totals.googleAds;
  const totalTacos = totals.totalRev > 0 ? (totals.totalAds / totals.totalRev) * 100 : 0;
  const amzTacos = totals.amzRev > 0 ? (totals.amzAds / totals.amzRev) * 100 : 0;
  const shopTacos = totals.shopRev > 0 ? (shopifyAds / totals.shopRev) * 100 : 0;
  
  // Daily KPIs
  const cpc = dailyTotals.totalClicks > 0 ? dailyTotals.totalAds / dailyTotals.totalClicks : 0;
  const cpa = (dailyTotals.googleConversions + dailyTotals.metaPurchases) > 0 ? dailyTotals.totalAds / (dailyTotals.googleConversions + dailyTotals.metaPurchases) : 0;
  const ctr = dailyTotals.totalImpressions > 0 ? (dailyTotals.totalClicks / dailyTotals.totalImpressions) * 100 : 0;
  
  // Comparison metrics
  const spendChange = compTotals.totalAds > 0 ? ((totals.totalAds - compTotals.totalAds) / compTotals.totalAds) * 100 : null;
  
  const tacosColor = (tacos) => tacos <= 15 ? 'text-emerald-400' : tacos <= 25 ? 'text-amber-400' : 'text-rose-400';
  
  // Build table data
  const weeklyTableData = periodWeeks.map(w => {
    const week = allWeeksData[w];
    const amzAds = week?.amazon?.adSpend || 0;
    
    // Meta/Google might be in weekly data OR in daily data (from bulk imports)
    // Check weekly first, then aggregate from daily if not present
    let metaAds = week?.shopify?.metaAds || week?.shopify?.metaSpend || 0;
    let googleAds = week?.shopify?.googleAds || week?.shopify?.googleSpend || 0;
    
    // If weekly doesn't have Meta/Google, aggregate from daily data for that week
    if (metaAds === 0 && googleAds === 0) {
      const weekEnd = new Date(w + 'T00:00:00');
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 6);
      
      // Find all days in this week
      const daysInWeek = sortedDays.filter(d => {
        const date = new Date(d + 'T00:00:00');
        return date >= weekStart && date <= weekEnd;
      });
      
      // Sum up Meta/Google from daily data
      daysInWeek.forEach(d => {
        const day = allDaysData[d];
        metaAds += day?.shopify?.metaSpend || day?.metaSpend || day?.metaAds || 0;
        googleAds += day?.shopify?.googleSpend || day?.googleSpend || day?.googleAds || 0;
      });
    }
    
    const totalAds = amzAds + metaAds + googleAds;
    const totalRev = week?.total?.revenue || 0;
    return { week: w, amzAds, metaAds, googleAds, totalAds, totalRev, tacos: totalRev > 0 ? (totalAds / totalRev) * 100 : 0 };
  });
  
  // Build daily table data - use periodDays for daily/weekly tabs
  const dailyTableData = (useDailyData ? periodDays : daysInMonth).map(d => {
    const day = allDaysData[d];
    const googleAds = day?.shopify?.googleSpend || day?.googleSpend || day?.googleAds || 0;
    const metaAds = day?.shopify?.metaSpend || day?.metaSpend || day?.metaAds || 0;
    const amazonAds = day?.amazon?.adSpend || 0;
    const adsMetrics = day?.shopify?.adsMetrics || {};
    const googleImpressions = adsMetrics.googleImpressions || day?.googleImpressions || 0;
    const metaImpressions = adsMetrics.metaImpressions || day?.metaImpressions || 0;
    const googleClicks = adsMetrics.googleClicks || day?.googleClicks || 0;
    const metaClicks = adsMetrics.metaClicks || day?.metaClicks || 0;
    const googleConversions = adsMetrics.googleConversions || day?.googleConversions || 0;
    const metaPurchases = adsMetrics.metaPurchases || day?.metaConversions || 0;
    const metaPurchaseValue = adsMetrics.metaPurchaseValue || 0;
    const metaROAS = adsMetrics.metaROAS || 0;
    const shopifyRev = day?.shopify?.revenue || 0;
    const amazonRev = day?.amazon?.revenue || 0;
    return { 
      date: d, 
      googleAds, metaAds, amazonAds,
      totalAds: googleAds + metaAds + amazonAds, 
      googleImpressions, metaImpressions,
      impressions: googleImpressions + metaImpressions, 
      googleClicks, metaClicks,
      clicks: googleClicks + metaClicks, 
      googleConversions, metaPurchases,
      conversions: googleConversions + metaPurchases,
      metaPurchaseValue, metaROAS,
      shopifyRev, amazonRev,
      totalRev: shopifyRev + amazonRev,
    };
  });
  
  // Labels
  const getPeriodLabel = () => {
    switch (adsTimeTab) {
      case 'daily': {
        // Show "Yesterday" or the actual date if different
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
        if (periodDays.length === 1 && periodDays[0] === yesterdayStr) {
          return 'Yesterday';
        } else if (periodDays.length === 1) {
          return new Date(periodDays[0] + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
        }
        return `${monthNames[adsMonth]} ${adsYear} - Daily`;
      }
      case 'weekly': return `Last 7 Days (${periodDays.length} days with data)`;
      case 'monthly': return `${monthNames[adsMonth]} ${adsYear}`;
      case 'quarterly': return `Q${adsQuarter} ${adsYear}`;
      case 'yearly': return `${adsYear} Full Year`;
      default: return '';
    }
  };
  
  const getCompLabel = () => {
    switch (adsTimeTab) {
      case 'daily': {
        const idx = sortedDays.indexOf(adsSelectedDay);
        if (idx > 0) {
          const prevDay = new Date(sortedDays[idx - 1] + 'T12:00:00');
          return `vs ${prevDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        }
        return '';
      }
      case 'weekly': return compWeeks.length > 0 ? 'vs prev week' : '';
      case 'monthly': {
        const pm = adsMonth === 0 ? 11 : adsMonth - 1;
        const py = adsMonth === 0 ? adsYear - 1 : adsYear;
        return `vs ${monthNamesShort[pm]} ${py}`;
      }
      case 'quarterly': {
        const pq = adsQuarter === 1 ? 4 : adsQuarter - 1;
        const py = adsQuarter === 1 ? adsYear - 1 : adsYear;
        return `vs Q${pq} ${py}`;
      }
      case 'yearly': return `vs ${adsYear - 1}`;
      default: return '';
    }
  };
  
  // Navigation
  const goToPrev = () => {
    if (adsTimeTab === 'daily') {
      const idx = sortedDays.indexOf(adsSelectedDay);
      if (idx > 0) setAdsSelectedDay(sortedDays[idx - 1]);
    } else if (adsTimeTab === 'monthly') {
      if (adsMonth === 0) { setAdsMonth(11); setAdsYear(adsYear - 1); }
      else setAdsMonth(adsMonth - 1);
    } else if (adsTimeTab === 'weekly') {
      const idx = weeksInYear.indexOf(adsSelectedWeek);
      if (idx > 0) setAdsSelectedWeek(weeksInYear[idx - 1]);
      else {
        const prevYearWeeks = sortedWeeks.filter(w => w.startsWith(String(adsYear - 1)));
        if (prevYearWeeks.length > 0) { setAdsYear(adsYear - 1); setAdsSelectedWeek(prevYearWeeks[prevYearWeeks.length - 1]); }
      }
    } else if (adsTimeTab === 'quarterly') {
      if (adsQuarter === 1) { setAdsQuarter(4); setAdsYear(adsYear - 1); } else setAdsQuarter(adsQuarter - 1);
    } else if (adsTimeTab === 'yearly') { setAdsYear(adsYear - 1); }
  };
  
  const goToNext = () => {
    if (adsTimeTab === 'daily') {
      const idx = sortedDays.indexOf(adsSelectedDay);
      if (idx < sortedDays.length - 1) setAdsSelectedDay(sortedDays[idx + 1]);
    } else if (adsTimeTab === 'monthly') {
      if (adsMonth === 11) { setAdsMonth(0); setAdsYear(adsYear + 1); }
      else setAdsMonth(adsMonth + 1);
    } else if (adsTimeTab === 'weekly') {
      const idx = weeksInYear.indexOf(adsSelectedWeek);
      if (idx < weeksInYear.length - 1) setAdsSelectedWeek(weeksInYear[idx + 1]);
      else {
        const nextYearWeeks = sortedWeeks.filter(w => w.startsWith(String(adsYear + 1)));
        if (nextYearWeeks.length > 0) { setAdsYear(adsYear + 1); setAdsSelectedWeek(nextYearWeeks[0]); }
      }
    } else if (adsTimeTab === 'quarterly') {
      if (adsQuarter === 4) { setAdsQuarter(1); setAdsYear(adsYear + 1); } else setAdsQuarter(adsQuarter + 1);
    } else if (adsTimeTab === 'yearly') { setAdsYear(adsYear + 1); }
  };
  
  // Months with data
  const monthsWithData = [...new Set([
    ...sortedWeeks,
    ...sortedDays,
    ...Object.keys(amazonCampaigns?.historicalDaily || {})
  ].filter(d => d.startsWith(String(adsYear))).map(d => new Date(d + 'T00:00:00').getMonth()))].sort((a, b) => a - b);
  
  // Filter and sort campaigns (use campaigns defined earlier)
  const filteredCampaigns = campaigns.filter(c => {
    if (amazonCampaignFilter.status !== 'all' && c.state !== amazonCampaignFilter.status) return false;
    if (amazonCampaignFilter.type !== 'all' && c.type !== amazonCampaignFilter.type && !(amazonCampaignFilter.type === 'SB' && c.type === 'SB2')) return false;
    if (amazonCampaignFilter.search && !c.name.toLowerCase().includes(amazonCampaignFilter.search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    const dir = amazonCampaignSort.dir === 'asc' ? 1 : -1;
    const field = amazonCampaignSort.field;
    if (typeof a[field] === 'string') return dir * a[field].localeCompare(b[field]);
    return dir * ((a[field] || 0) - (b[field] || 0));
  });
  
  // Handle Amazon campaign file upload
  const handleAmazonCampaignUpload = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = parseAmazonCampaignCSV(e.target.result);
      if (result.error) {
        setToast({ message: result.error, type: 'error' });
      } else {
        saveAmazonCampaigns(result.campaigns, result.summary);
        setToast({ message: `Imported ${result.campaigns.length} Amazon campaigns`, type: 'success' });
      }
    };
    reader.readAsText(file);
  };
  
  // Get top/bottom performers - with safety checks
  const topPerformers = [...campaigns].filter(c => c.state === 'ENABLED' && (c.roas || 0) > 0).sort((a, b) => (b.roas || 0) - (a.roas || 0)).slice(0, 5);
  const bottomPerformers = [...campaigns].filter(c => c.state === 'ENABLED' && (c.spend || 0) > 100).sort((a, b) => (a.roas || 0) - (b.roas || 0)).slice(0, 5);
  

    return (
    <div className="min-h-screen bg-slate-950 p-4 lg:p-6">
      <div className="max-w-7xl mx-auto">{globalModals}
        <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />
        {dataBar}
        
        <div className="mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-white mb-1">📊 Advertising Command Center</h1>
              <p className="text-slate-400">
                {hasCampaignData ? `${campaigns.length} campaigns` : 'No campaigns'} 
                {hasHistoricalData ? ` • ${Object.keys(historicalDaily).length} days history` : ''} 
                {sortedWeeks.length > 0 ? ` • ${sortedWeeks.length} weeks data` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowAdsAIChat(true)} className="px-4 py-2.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 rounded-xl text-white flex items-center gap-2 font-medium shadow-lg shadow-orange-500/20">
                <Zap className="w-4 h-4" />Ask AI
              </button>
              <button onClick={() => setShowAdsIntelUpload(true)} className="px-3 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-white flex items-center gap-2 text-sm">
                <Upload className="w-4 h-4" />History
              </button>
              <button onClick={() => setShowAdsBulkUpload(true)} className="px-3 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-white flex items-center gap-2 text-sm">
                <Upload className="w-4 h-4" />Meta/Google
              </button>
            </div>
          </div>
        </div>
        
        {/* Executive Summary - Quick Insights */}
        {quickInsights.length > 0 && (
          <div className="bg-gradient-to-r from-slate-800/80 to-slate-800/40 rounded-2xl border border-slate-700 p-4 mb-6">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">⚡ Quick Insights</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {quickInsights.map((insight, i) => (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-xl ${
                  insight.type === 'warning' ? 'bg-amber-900/20 border border-amber-500/30' :
                  insight.type === 'opportunity' ? 'bg-emerald-900/20 border border-emerald-500/30' :
                  'bg-blue-900/20 border border-blue-500/30'
                }`}>
                  <span className="text-xl">{insight.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm">{insight.text}</p>
                    {insight.action && (
                      <button onClick={() => { setAdsAiInput(insight.action); setShowAdsAIChat(true); }} className="text-xs text-orange-400 hover:text-orange-300 mt-1">
                        → {insight.action}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Data Upload Prompts */}
        {(!hasCampaignData || !hasHistoricalData) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {!hasCampaignData && (
              <div className="bg-slate-800/50 rounded-xl border border-dashed border-orange-500/50 p-6 text-center">
                <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Target className="w-6 h-6 text-orange-400" />
                </div>
                <h4 className="text-white font-medium mb-1">Campaign Performance</h4>
                <p className="text-slate-400 text-sm mb-3">Upload Amazon Ads campaign report for detailed analysis</p>
                <label className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg text-white text-sm cursor-pointer">
                  <Upload className="w-4 h-4" />Upload Campaigns
                  <input type="file" accept=".csv" className="hidden" onChange={(e) => handleAmazonCampaignUpload(e.target.files[0])} />
                </label>
              </div>
            )}
            {!hasHistoricalData && (
              <div className="bg-slate-800/50 rounded-xl border border-dashed border-violet-500/50 p-6 text-center">
                <div className="w-12 h-12 bg-violet-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <TrendingUp className="w-6 h-6 text-violet-400" />
                </div>
                <h4 className="text-white font-medium mb-1">Historical Trends</h4>
                <p className="text-slate-400 text-sm mb-3">Upload daily performance data for trend analysis</p>
                <button onClick={() => setShowAdsIntelUpload(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-white text-sm">
                  <Upload className="w-4 h-4" />Import History
                </button>
              </div>
            )}
          </div>
        )}
        
        {/* AI Ads Insights Chat Panel */}
        {showAdsAIChat && (
          <div className="fixed bottom-4 right-4 z-50 w-[560px] max-w-[calc(100vw-2rem)]">
            <div className="bg-slate-800 rounded-2xl border border-orange-500/50 shadow-2xl overflow-hidden">
              <div className="bg-gradient-to-r from-orange-600 to-amber-600 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <Zap className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">AI Ads Analyst</h3>
                    <p className="text-white/70 text-xs">
                      {hasCampaignData ? `${campaigns.length} campaigns` : 'No campaigns'} 
                      {hasHistoricalData ? ` • ${Object.keys(historicalDaily).length}d history` : ''}
                      {adsIntelData?.lastUpdated ? ` • Intel ✓${adsIntelData.historicalDaily ? ` (${adsIntelData.historicalDaily.totalDays}d hist)` : ''}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowAdsIntelUpload(true)} className={`p-2 rounded-lg text-white/70 hover:text-white ${adsIntelData?.lastUpdated ? 'hover:bg-white/20' : 'bg-white/20 animate-pulse'}`} title="Upload Ads Intelligence Reports">
                    <Brain className="w-4 h-4" />
                  </button>
                  <button onClick={() => setAdsAiMessages([])} className="p-2 hover:bg-white/20 rounded-lg text-white/70 hover:text-white" title="Clear chat">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button onClick={() => setShowAdsAIChat(false)} className="p-2 hover:bg-white/20 rounded-lg text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              <div className="h-[32rem] overflow-y-auto p-4 space-y-4">
                {adsAiMessages.length === 0 && (
                  <div className="text-center text-slate-400 py-2">
                    <Zap className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    {!adsIntelData?.lastUpdated && (
                      <button onClick={() => setShowAdsIntelUpload(true)} className="block w-full mb-3 px-3 py-2.5 bg-gradient-to-r from-violet-900/40 to-indigo-900/40 hover:from-violet-900/60 rounded-lg text-sm text-violet-300 border border-violet-500/30">
                        🧠 Upload Intel Reports for deeper analysis (search terms, placements, targeting)
                      </button>
                    )}
                    {adsIntelData?.lastUpdated && (
                      <div className="mb-3 px-3 py-2 bg-emerald-900/20 rounded-lg text-xs text-emerald-400 border border-emerald-500/20">
                        ✓ Intel loaded: {[adsIntelData.dailyOverview && `${adsIntelData.dailyOverview.totalDays}d overview`, adsIntelData.historicalDaily && `${adsIntelData.historicalDaily.totalDays}d historical`, adsIntelData.spSearchTerms && 'Search Terms', adsIntelData.spPlacement && 'Placements', adsIntelData.spTargeting?.length && 'Targeting', adsIntelData.businessReport?.length && 'Business Report', adsIntelData.searchQueryPerf?.length && 'Organic Queries'].filter(Boolean).join(' • ')}
                      </div>
                    )}
                    <p className="text-sm mb-4">{adsIntelData?.lastUpdated ? 'Deep intel loaded — generate your plan:' : 'Upload data, then generate your plan:'}</p>
                    <div className="space-y-2 text-left">
                      <button onClick={() => { sendAdsAIMessage("Generate my complete Amazon Ads Action Plan. Analyze ALL of the data I've uploaded — search terms, placements, targeting, campaigns, daily performance, business reports, organic queries — everything. Give me a structured plan with: 🔴 STOP DOING (what's wasting money with exact $ amounts), 🟢 KEEP DOING (what's working and why), 🚀 START DOING (specific scaling opportunities with revenue estimates), 📊 TREND DIAGNOSIS (month-over-month, TACOS direction, day-of-week patterns), and 🎯 THIS WEEK'S TOP 5 PRIORITY ACTIONS ranked by impact with time-to-implement. Be specific — cite exact search terms, campaign names, ASINs, and dollar amounts for every recommendation."); }} className="block w-full px-3 py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 rounded-xl text-sm text-white font-semibold shadow-lg shadow-orange-500/20">
                        ⚡ Generate Full Action Plan
                      </button>
                      {adsIntelData?.spSearchTerms ? (
                        <button onClick={() => { sendAdsAIMessage("Analyze my search terms - which are wasting money and which should I scale? Give me negative keyword suggestions."); }} className="block w-full px-3 py-2.5 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-sm text-slate-300">
                          🔍 Search term analysis + negative keywords
                        </button>
                      ) : (
                        <button onClick={() => { sendAdsAIMessage("Which campaigns should I pause to save money?"); }} className="block w-full px-3 py-2.5 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-sm text-slate-300">
                          ⚠️ Which campaigns should I pause?
                        </button>
                      )}
                      {adsIntelData?.spPlacement ? (
                        <button onClick={() => { sendAdsAIMessage("Analyze my placement performance - where should I increase/decrease bids for Top of Search vs Product Pages vs Rest of Search?"); }} className="block w-full px-3 py-2.5 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-sm text-slate-300">
                          📍 Placement bid optimization
                        </button>
                      ) : (
                        <button onClick={() => { sendAdsAIMessage("What are my best scaling opportunities?"); }} className="block w-full px-3 py-2.5 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-sm text-slate-300">
                          🚀 What are my best scaling opportunities?
                        </button>
                      )}
                      {adsIntelData?.searchQueryPerf?.length > 0 ? (
                        <button onClick={() => { sendAdsAIMessage("Compare my organic search query performance with my paid campaigns. Where am I paying for clicks I could get organically? Where should I increase paid because organic share is low?"); }} className="block w-full px-3 py-2.5 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-sm text-slate-300">
                          🔄 Organic vs Paid gap analysis
                        </button>
                      ) : (
                        <button onClick={() => { sendAdsAIMessage("How has my ROAS trended over the last 6 months?"); }} className="block w-full px-3 py-2.5 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-sm text-slate-300">
                          📈 How has my ROAS trended over time?
                        </button>
                      )}
                      <button onClick={() => { sendAdsAIMessage("Compare my SP vs SB vs SD campaign performance"); }} className="block w-full px-3 py-2.5 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-sm text-slate-300">
                        📊 Compare SP vs SB vs SD performance
                      </button>
                    </div>
                  </div>
                )}
                {adsAiMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[90%] rounded-2xl px-4 py-3 ${msg.role === 'user' ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-200'}`}>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {adsAiLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-700 rounded-2xl px-4 py-3">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="p-4 border-t border-slate-700">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={adsAiInput}
                    onChange={(e) => setAdsAiInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendAdsAIMessage(); } }}
                    placeholder="Ask about campaigns, ROAS, trends..."
                    className="flex-1 bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500"
                    autoComplete="off"
                  />
                  <button onClick={sendAdsAIMessage} disabled={!adsAiInput.trim() || adsAiLoading} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 rounded-xl text-white">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* View Mode Toggle */}
        <div className="flex gap-2 mb-6 p-1 bg-slate-800/50 rounded-xl overflow-x-auto">
          <button onClick={() => setAdsViewMode('campaigns')} className={`flex-1 min-w-fit px-4 py-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${adsViewMode === 'campaigns' ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-lg' : 'text-slate-300 hover:bg-slate-700'}`}>
            <Target className="w-4 h-4" />
            <span className="hidden sm:inline">Amazon</span>
            <span className="sm:hidden">AMZ</span>
            {hasCampaignData && <span className="px-1.5 py-0.5 bg-white/20 rounded text-xs">{campaigns.length}</span>}
          </button>
          <button onClick={() => setAdsViewMode('shopify')} className={`flex-1 min-w-fit px-4 py-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${adsViewMode === 'shopify' ? 'bg-gradient-to-r from-blue-600 to-red-600 text-white shadow-lg' : 'text-slate-300 hover:bg-slate-700'}`}>
            <Store className="w-4 h-4" />
            <span className="hidden sm:inline">Meta/Google</span>
            <span className="sm:hidden">M/G</span>
          </button>
          <button onClick={() => setAdsViewMode('trends')} className={`flex-1 min-w-fit px-4 py-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${adsViewMode === 'trends' ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg' : 'text-slate-300 hover:bg-slate-700'}`}>
            <TrendingUp className="w-4 h-4" />
            <span>Trends</span>
            {hasHistoricalData && <span className="px-1.5 py-0.5 bg-white/20 rounded text-xs">{Object.keys(historicalDaily).length}d</span>}
          </button>
          <button onClick={() => setAdsViewMode('performance')} className={`flex-1 min-w-fit px-4 py-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${adsViewMode === 'performance' ? 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-lg' : 'text-slate-300 hover:bg-slate-700'}`}>
            <BarChart3 className="w-4 h-4" />
            <span className="hidden sm:inline">All Channels</span>
            <span className="sm:hidden">All</span>
          </button>
        </div>
        
        {/* Shopify Ads (Meta/Google) View */}
        {adsViewMode === 'shopify' && (() => {
          // Aggregate Shopify ads data from daily data
          const daysWithShopifyAds = sortedDays.filter(d => {
            const day = allDaysData[d];
            const meta = day?.shopify?.metaSpend || day?.metaSpend || day?.metaAds || 0;
            const google = day?.shopify?.googleSpend || day?.googleSpend || day?.googleAds || 0;
            return (meta + google) > 0;
          });
          
          const hasShopifyAdsData = daysWithShopifyAds.length > 0;
          
          // Calculate totals
          const shopifyAdsTotals = daysWithShopifyAds.reduce((acc, d) => {
            const day = allDaysData[d];
            const meta = day?.shopify?.metaSpend || day?.metaSpend || day?.metaAds || 0;
            const google = day?.shopify?.googleSpend || day?.googleSpend || day?.googleAds || 0;
            const metaImpr = day?.shopify?.adsMetrics?.metaImpressions || day?.metaImpressions || 0;
            const googleImpr = day?.shopify?.adsMetrics?.googleImpressions || day?.googleImpressions || 0;
            const metaClicks = day?.shopify?.adsMetrics?.metaClicks || day?.metaClicks || 0;
            const googleClicks = day?.shopify?.adsMetrics?.googleClicks || day?.googleClicks || 0;
            const metaPurch = day?.shopify?.adsMetrics?.metaPurchases || day?.metaConversions || 0;
            const googleConv = day?.shopify?.adsMetrics?.googleConversions || day?.googleConversions || 0;
            const metaRev = day?.shopify?.adsMetrics?.metaPurchaseValue || 0;
            const shopRev = day?.shopify?.revenue || 0;
            return {
              meta: acc.meta + meta,
              google: acc.google + google,
              metaImpr: acc.metaImpr + metaImpr,
              googleImpr: acc.googleImpr + googleImpr,
              metaClicks: acc.metaClicks + metaClicks,
              googleClicks: acc.googleClicks + googleClicks,
              metaPurch: acc.metaPurch + metaPurch,
              googleConv: acc.googleConv + googleConv,
              metaRev: acc.metaRev + metaRev,
              shopRev: acc.shopRev + shopRev,
            };
          }, { meta: 0, google: 0, metaImpr: 0, googleImpr: 0, metaClicks: 0, googleClicks: 0, metaPurch: 0, googleConv: 0, metaRev: 0, shopRev: 0 });
          
          const totalSpend = shopifyAdsTotals.meta + shopifyAdsTotals.google;
          const metaRoas = shopifyAdsTotals.meta > 0 && shopifyAdsTotals.metaRev > 0 ? shopifyAdsTotals.metaRev / shopifyAdsTotals.meta : 0;
          const tacos = shopifyAdsTotals.shopRev > 0 ? (totalSpend / shopifyAdsTotals.shopRev) * 100 : 0;
          
          // Monthly breakdown
          const monthlyData = {};
          daysWithShopifyAds.forEach(d => {
            const monthKey = d.substring(0, 7);
            const day = allDaysData[d];
            if (!monthlyData[monthKey]) monthlyData[monthKey] = { meta: 0, google: 0, metaClicks: 0, googleClicks: 0, metaPurch: 0, googleConv: 0, metaRev: 0, shopRev: 0 };
            monthlyData[monthKey].meta += day?.shopify?.metaSpend || day?.metaSpend || day?.metaAds || 0;
            monthlyData[monthKey].google += day?.shopify?.googleSpend || day?.googleSpend || day?.googleAds || 0;
            monthlyData[monthKey].metaClicks += day?.shopify?.adsMetrics?.metaClicks || day?.metaClicks || 0;
            monthlyData[monthKey].googleClicks += day?.shopify?.adsMetrics?.googleClicks || day?.googleClicks || 0;
            monthlyData[monthKey].metaPurch += day?.shopify?.adsMetrics?.metaPurchases || day?.metaConversions || 0;
            monthlyData[monthKey].googleConv += day?.shopify?.adsMetrics?.googleConversions || day?.googleConversions || 0;
            monthlyData[monthKey].metaRev += day?.shopify?.adsMetrics?.metaPurchaseValue || 0;
            monthlyData[monthKey].shopRev += day?.shopify?.revenue || 0;
          });
          
          const monthlyArr = Object.entries(monthlyData).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
          
          return (
            <div>
              {!hasShopifyAdsData ? (
                <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-8 text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500/20 to-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Store className="w-8 h-8 text-violet-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">No Meta/Google Ads Data</h3>
                  <p className="text-slate-400 mb-4 max-w-md mx-auto">Import your Meta and Google Ads data to see performance analytics</p>
                  <button onClick={() => setShowAdsBulkUpload(true)} className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-red-600 hover:from-blue-500 hover:to-red-500 rounded-xl text-white font-medium">
                    <Upload className="w-5 h-5" />Import Ads Data
                  </button>
                </div>
              ) : (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
                    <div className="bg-gradient-to-br from-violet-900/30 to-slate-800/50 rounded-xl border border-violet-500/30 p-4">
                      <p className="text-slate-400 text-xs uppercase">Total Spend</p>
                      <p className="text-2xl font-bold text-white">{formatCurrency(totalSpend)}</p>
                      <p className="text-violet-400 text-xs mt-1">{daysWithShopifyAds.length} days</p>
                    </div>
                    <div className="bg-gradient-to-br from-blue-900/30 to-slate-800/50 rounded-xl border border-blue-500/30 p-4">
                      <p className="text-slate-400 text-xs uppercase">Meta Spend</p>
                      <p className="text-2xl font-bold text-blue-400">{formatCurrency(shopifyAdsTotals.meta)}</p>
                      <p className="text-slate-500 text-xs mt-1">{totalSpend > 0 ? ((shopifyAdsTotals.meta / totalSpend) * 100).toFixed(0) : 0}% of total</p>
                    </div>
                    <div className="bg-gradient-to-br from-red-900/30 to-slate-800/50 rounded-xl border border-red-500/30 p-4">
                      <p className="text-slate-400 text-xs uppercase">Google Spend</p>
                      <p className="text-2xl font-bold text-red-400">{formatCurrency(shopifyAdsTotals.google)}</p>
                      <p className="text-slate-500 text-xs mt-1">{totalSpend > 0 ? ((shopifyAdsTotals.google / totalSpend) * 100).toFixed(0) : 0}% of total</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                      <p className="text-slate-400 text-xs uppercase">Meta ROAS</p>
                      <p className={`text-2xl font-bold ${metaRoas >= 3 ? 'text-emerald-400' : metaRoas >= 2 ? 'text-amber-400' : 'text-rose-400'}`}>{metaRoas > 0 ? metaRoas.toFixed(2) + 'x' : '—'}</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                      <p className="text-slate-400 text-xs uppercase">Shopify Revenue</p>
                      <p className="text-2xl font-bold text-emerald-400">{formatCurrency(shopifyAdsTotals.shopRev)}</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                      <p className="text-slate-400 text-xs uppercase">TACOS</p>
                      <p className={`text-2xl font-bold ${tacos <= 15 ? 'text-emerald-400' : tacos <= 25 ? 'text-amber-400' : 'text-rose-400'}`}>{tacos > 0 ? tacos.toFixed(1) + '%' : '—'}</p>
                    </div>
                  </div>
                  
                  {/* Platform Comparison */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    {/* Meta Performance */}
                    <div className="bg-gradient-to-br from-blue-900/20 to-slate-800/50 rounded-xl border border-blue-500/30 p-5">
                      <h3 className="text-lg font-semibold text-blue-400 mb-4 flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-blue-500" />Meta Ads Performance
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div><p className="text-slate-500 text-xs">Total Spend</p><p className="text-white font-bold text-lg">{formatCurrency(shopifyAdsTotals.meta)}</p></div>
                        <div><p className="text-slate-500 text-xs">Impressions</p><p className="text-white font-medium">{formatNumber(shopifyAdsTotals.metaImpr)}</p></div>
                        <div><p className="text-slate-500 text-xs">Clicks</p><p className="text-white font-medium">{formatNumber(shopifyAdsTotals.metaClicks)}</p></div>
                        <div><p className="text-slate-500 text-xs">Purchases</p><p className="text-emerald-400 font-medium">{formatNumber(shopifyAdsTotals.metaPurch)}</p></div>
                        <div><p className="text-slate-500 text-xs">CTR</p><p className="text-white font-medium">{shopifyAdsTotals.metaImpr > 0 ? ((shopifyAdsTotals.metaClicks / shopifyAdsTotals.metaImpr) * 100).toFixed(2) : '—'}%</p></div>
                        <div><p className="text-slate-500 text-xs">CPC</p><p className="text-white font-medium">{shopifyAdsTotals.metaClicks > 0 ? formatCurrency(shopifyAdsTotals.meta / shopifyAdsTotals.metaClicks) : '—'}</p></div>
                        <div><p className="text-slate-500 text-xs">Conv Rate</p><p className="text-white font-medium">{shopifyAdsTotals.metaClicks > 0 ? ((shopifyAdsTotals.metaPurch / shopifyAdsTotals.metaClicks) * 100).toFixed(1) : '—'}%</p></div>
                        <div><p className="text-slate-500 text-xs">Cost/Purchase</p><p className={`font-medium ${shopifyAdsTotals.metaPurch > 0 && shopifyAdsTotals.meta / shopifyAdsTotals.metaPurch <= 25 ? 'text-emerald-400' : 'text-amber-400'}`}>{shopifyAdsTotals.metaPurch > 0 ? formatCurrency(shopifyAdsTotals.meta / shopifyAdsTotals.metaPurch) : '—'}</p></div>
                        <div className="col-span-2 pt-2 border-t border-slate-700">
                          <p className="text-slate-500 text-xs">Revenue (Attributed)</p>
                          <p className="text-emerald-400 font-bold text-lg">{formatCurrency(shopifyAdsTotals.metaRev)}</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Google Performance */}
                    <div className="bg-gradient-to-br from-red-900/20 to-slate-800/50 rounded-xl border border-red-500/30 p-5">
                      <h3 className="text-lg font-semibold text-red-400 mb-4 flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-red-500" />Google Ads Performance
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div><p className="text-slate-500 text-xs">Total Spend</p><p className="text-white font-bold text-lg">{formatCurrency(shopifyAdsTotals.google)}</p></div>
                        <div><p className="text-slate-500 text-xs">Impressions</p><p className="text-white font-medium">{formatNumber(shopifyAdsTotals.googleImpr)}</p></div>
                        <div><p className="text-slate-500 text-xs">Clicks</p><p className="text-white font-medium">{formatNumber(shopifyAdsTotals.googleClicks)}</p></div>
                        <div><p className="text-slate-500 text-xs">Conversions</p><p className="text-emerald-400 font-medium">{formatNumber(shopifyAdsTotals.googleConv)}</p></div>
                        <div><p className="text-slate-500 text-xs">CTR</p><p className="text-white font-medium">{shopifyAdsTotals.googleImpr > 0 ? ((shopifyAdsTotals.googleClicks / shopifyAdsTotals.googleImpr) * 100).toFixed(2) : '—'}%</p></div>
                        <div><p className="text-slate-500 text-xs">CPC</p><p className="text-white font-medium">{shopifyAdsTotals.googleClicks > 0 ? formatCurrency(shopifyAdsTotals.google / shopifyAdsTotals.googleClicks) : '—'}</p></div>
                        <div><p className="text-slate-500 text-xs">Conv Rate</p><p className="text-white font-medium">{shopifyAdsTotals.googleClicks > 0 ? ((shopifyAdsTotals.googleConv / shopifyAdsTotals.googleClicks) * 100).toFixed(1) : '—'}%</p></div>
                        <div><p className="text-slate-500 text-xs">Cost/Conv</p><p className={`font-medium ${shopifyAdsTotals.googleConv > 0 && shopifyAdsTotals.google / shopifyAdsTotals.googleConv <= 30 ? 'text-emerald-400' : 'text-amber-400'}`}>{shopifyAdsTotals.googleConv > 0 ? formatCurrency(shopifyAdsTotals.google / shopifyAdsTotals.googleConv) : '—'}</p></div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Monthly Performance Table */}
                  {monthlyArr.length > 0 && (
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-white">Monthly Performance</h3>
                        <button onClick={() => setShowAdsBulkUpload(true)} className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm text-white flex items-center gap-1">
                          <Upload className="w-4 h-4" />Import More
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-700">
                              <th className="text-left text-slate-400 py-2 px-2">Month</th>
                              <th className="text-right text-blue-400 py-2 px-2">Meta</th>
                              <th className="text-right text-red-400 py-2 px-2">Google</th>
                              <th className="text-right text-slate-400 py-2 px-2">Total</th>
                              <th className="text-right text-slate-400 py-2 px-2">Clicks</th>
                              <th className="text-right text-slate-400 py-2 px-2">Conv</th>
                              <th className="text-right text-slate-400 py-2 px-2">CPC</th>
                              <th className="text-right text-slate-400 py-2 px-2">TACOS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {monthlyArr.map(([month, m]) => {
                              const total = m.meta + m.google;
                              const totalClicks = m.metaClicks + m.googleClicks;
                              const totalConv = m.metaPurch + m.googleConv;
                              const cpc = totalClicks > 0 ? total / totalClicks : 0;
                              const monthTacos = m.shopRev > 0 ? (total / m.shopRev) * 100 : 0;
                              return (
                                <tr key={month} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                                  <td className="py-2 px-2 text-white font-medium">{month}</td>
                                  <td className="py-2 px-2 text-right text-blue-400">{formatCurrency(m.meta)}</td>
                                  <td className="py-2 px-2 text-right text-red-400">{formatCurrency(m.google)}</td>
                                  <td className="py-2 px-2 text-right text-white font-medium">{formatCurrency(total)}</td>
                                  <td className="py-2 px-2 text-right text-white">{formatNumber(totalClicks)}</td>
                                  <td className="py-2 px-2 text-right text-emerald-400">{formatNumber(totalConv)}</td>
                                  <td className="py-2 px-2 text-right text-white">{formatCurrency(cpc)}</td>
                                  <td className={`py-2 px-2 text-right font-medium ${monthTacos <= 15 ? 'text-emerald-400' : monthTacos <= 25 ? 'text-amber-400' : 'text-rose-400'}`}>{monthTacos > 0 ? monthTacos.toFixed(1) + '%' : '—'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}
        
        {/* Historical Trends View */}
        {adsViewMode === 'trends' && (
          <div>
            {!hasHistoricalData ? (
              <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-8 text-center">
                <div className="w-16 h-16 bg-violet-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="w-8 h-8 text-violet-400" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">Import Historical Data</h3>
                <p className="text-slate-400 mb-4 max-w-md mx-auto">Upload your daily Amazon Ads performance data to see trends over time</p>
                <button onClick={() => setShowAdsIntelUpload(true)} className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 rounded-xl text-white font-medium">
                  <Upload className="w-5 h-5" />Import Daily Data
                </button>
              </div>
            ) : (() => {
              // Calculate historical metrics
              const histDates = Object.keys(historicalDaily).sort();
              const dateRange = { start: histDates[0], end: histDates[histDates.length - 1] };
              
              // Monthly aggregation
              const monthly = {};
              histDates.forEach(date => {
                const d = historicalDaily[date];
                const monthKey = date.substring(0, 7);
                if (!monthly[monthKey]) monthly[monthKey] = { spend: 0, revenue: 0, orders: 0, clicks: 0, impressions: 0, totalRevenue: 0, days: 0 };
                monthly[monthKey].spend += d.spend || 0;
                monthly[monthKey].revenue += d.adRevenue || d.revenue || 0;
                monthly[monthKey].orders += d.orders || 0;
                monthly[monthKey].clicks += d.clicks || 0;
                monthly[monthKey].impressions += d.impressions || 0;
                monthly[monthKey].totalRevenue += d.totalRevenue || 0;
                monthly[monthKey].days++;
              });
              
              const monthlyArr = Object.entries(monthly).sort((a, b) => a[0].localeCompare(b[0]));
              const totals = monthlyArr.reduce((acc, [_, m]) => ({
                spend: acc.spend + m.spend,
                revenue: acc.revenue + m.revenue,
                totalRevenue: acc.totalRevenue + m.totalRevenue,
                orders: acc.orders + m.orders,
              }), { spend: 0, revenue: 0, totalRevenue: 0, orders: 0 });
              
              const overallROAS = totals.spend > 0 ? totals.revenue / totals.spend : 0;
              const overallACOS = totals.revenue > 0 ? (totals.spend / totals.revenue) * 100 : 0;
              const overallTACOS = totals.totalRevenue > 0 ? (totals.spend / totals.totalRevenue) * 100 : 0;
              
              return (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
                    <div className="bg-gradient-to-br from-violet-900/30 to-slate-800/50 rounded-xl border border-violet-500/30 p-4">
                      <p className="text-slate-400 text-xs uppercase">Total Ad Spend</p>
                      <p className="text-2xl font-bold text-white">{formatCurrency(totals.spend)}</p>
                      <p className="text-violet-400 text-xs mt-1">{histDates.length} days</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                      <p className="text-slate-400 text-xs uppercase">Ad Revenue</p>
                      <p className="text-2xl font-bold text-emerald-400">{formatCurrency(totals.revenue)}</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                      <p className="text-slate-400 text-xs uppercase">Total Revenue</p>
                      <p className="text-2xl font-bold text-white">{formatCurrency(totals.totalRevenue)}</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                      <p className="text-slate-400 text-xs uppercase">ROAS</p>
                      <p className={`text-2xl font-bold ${overallROAS >= 3 ? 'text-emerald-400' : overallROAS >= 2 ? 'text-amber-400' : 'text-rose-400'}`}>{overallROAS.toFixed(2)}x</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                      <p className="text-slate-400 text-xs uppercase">ACOS</p>
                      <p className={`text-2xl font-bold ${overallACOS <= 25 ? 'text-emerald-400' : overallACOS <= 35 ? 'text-amber-400' : 'text-rose-400'}`}>{overallACOS.toFixed(1)}%</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                      <p className="text-slate-400 text-xs uppercase">TACOS</p>
                      <p className={`text-2xl font-bold ${overallTACOS <= 15 ? 'text-emerald-400' : overallTACOS <= 25 ? 'text-amber-400' : 'text-rose-400'}`}>{overallTACOS.toFixed(1)}%</p>
                    </div>
                  </div>
                  
                  {/* Monthly Performance Table */}
                  <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-white">Monthly Performance</h3>
                      <span className="text-slate-400 text-sm">{dateRange.start} to {dateRange.end}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-700">
                            <th className="text-left text-slate-400 py-2 px-2">Month</th>
                            <th className="text-right text-slate-400 py-2 px-2">Spend</th>
                            <th className="text-right text-slate-400 py-2 px-2">Ad Revenue</th>
                            <th className="text-right text-slate-400 py-2 px-2">Total Revenue</th>
                            <th className="text-right text-slate-400 py-2 px-2">Orders</th>
                            <th className="text-right text-slate-400 py-2 px-2">ROAS</th>
                            <th className="text-right text-slate-400 py-2 px-2">ACOS</th>
                            <th className="text-right text-slate-400 py-2 px-2">TACOS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthlyArr.slice(-12).reverse().map(([month, m]) => {
                            const roas = m.spend > 0 ? m.revenue / m.spend : 0;
                            const acos = m.revenue > 0 ? (m.spend / m.revenue) * 100 : 0;
                            const tacos = m.totalRevenue > 0 ? (m.spend / m.totalRevenue) * 100 : 0;
                            return (
                              <tr key={month} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                                <td className="py-2 px-2 text-white font-medium">{month}</td>
                                <td className="py-2 px-2 text-right text-white">{formatCurrency(m.spend)}</td>
                                <td className="py-2 px-2 text-right text-emerald-400">{formatCurrency(m.revenue)}</td>
                                <td className="py-2 px-2 text-right text-white">{formatCurrency(m.totalRevenue)}</td>
                                <td className="py-2 px-2 text-right text-white">{m.orders.toLocaleString()}</td>
                                <td className={`py-2 px-2 text-right font-medium ${roas >= 3 ? 'text-emerald-400' : roas >= 2 ? 'text-amber-400' : 'text-rose-400'}`}>{roas.toFixed(2)}x</td>
                                <td className={`py-2 px-2 text-right ${acos <= 25 ? 'text-emerald-400' : acos <= 35 ? 'text-amber-400' : 'text-rose-400'}`}>{acos.toFixed(1)}%</td>
                                <td className={`py-2 px-2 text-right ${tacos <= 15 ? 'text-emerald-400' : tacos <= 25 ? 'text-amber-400' : 'text-rose-400'}`}>{tacos.toFixed(1)}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  
                  {/* Trend Analysis */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Best Months */}
                    <div className="bg-slate-800/50 rounded-xl border border-emerald-500/30 p-5">
                      <h3 className="text-lg font-semibold text-emerald-400 mb-3 flex items-center gap-2">
                        <Trophy className="w-5 h-5" />Best Performing Months
                      </h3>
                      <div className="space-y-2">
                        {monthlyArr
                          .map(([month, m]) => ({ month, roas: m.spend > 0 ? m.revenue / m.spend : 0, spend: m.spend }))
                          .filter(m => m.spend > 500)
                          .sort((a, b) => b.roas - a.roas)
                          .slice(0, 5)
                          .map((m, i) => (
                            <div key={m.month} className="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg">
                              <span className="text-white">{m.month}</span>
                              <span className="text-emerald-400 font-bold">{m.roas.toFixed(2)}x ROAS</span>
                            </div>
                          ))}
                      </div>
                    </div>
                    
                    {/* Worst Months */}
                    <div className="bg-slate-800/50 rounded-xl border border-amber-500/30 p-5">
                      <h3 className="text-lg font-semibold text-amber-400 mb-3 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" />Lowest Performing Months
                      </h3>
                      <div className="space-y-2">
                        {monthlyArr
                          .map(([month, m]) => ({ month, roas: m.spend > 0 ? m.revenue / m.spend : 0, spend: m.spend }))
                          .filter(m => m.spend > 500)
                          .sort((a, b) => a.roas - b.roas)
                          .slice(0, 5)
                          .map((m, i) => (
                            <div key={m.month} className="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg">
                              <span className="text-white">{m.month}</span>
                              <span className="text-amber-400 font-bold">{m.roas.toFixed(2)}x ROAS</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}
        
        {/* Amazon Campaigns View */}
        {adsViewMode === 'campaigns' && (
          <div>
            {/* Campaign Upload & Summary */}
            {!hasCampaignData ? (
              <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-8 text-center mb-6">
                <div className="w-16 h-16 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ShoppingBag className="w-8 h-8 text-orange-400" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">Upload Amazon Campaign Data</h3>
                <p className="text-slate-400 mb-4 max-w-md mx-auto">Upload your Amazon Ads campaign report to analyze ROAS, ACOS, and identify top performers</p>
                <label className="inline-flex items-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-500 rounded-xl text-white font-medium cursor-pointer">
                  <Upload className="w-5 h-5" />
                  Upload Campaign CSV
                  <input type="file" accept=".csv" className="hidden" onChange={(e) => handleAmazonCampaignUpload(e.target.files[0])} />
                </label>
                <p className="text-slate-500 text-sm mt-3">Export from Amazon Ads → Campaigns → Download Report</p>
              </div>
            ) : (
              <>
                {/* Last Updated & Refresh */}
                <div className="flex items-center justify-between mb-4">
                  <div className="text-slate-400 text-sm">
                    Last updated: {new Date(amazonCampaigns.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    {(() => {
                      const daysSince = Math.floor((new Date() - new Date(amazonCampaigns.lastUpdated)) / (1000 * 60 * 60 * 24));
                      if (daysSince >= 7) return <span className="text-amber-400 ml-2">⚠️ {daysSince} days old - refresh recommended</span>;
                      return null;
                    })()}
                  </div>
                  <label className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-white text-sm cursor-pointer">
                    <RefreshCw className="w-4 h-4" />
                    Refresh Data
                    <input type="file" accept=".csv" className="hidden" onChange={(e) => handleAmazonCampaignUpload(e.target.files[0])} />
                  </label>
                </div>
                
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
                  <div className="bg-gradient-to-br from-orange-900/30 to-slate-800/50 rounded-xl border border-orange-500/30 p-4">
                    <p className="text-slate-400 text-xs uppercase">Total Spend</p>
                    <p className="text-2xl font-bold text-white">{formatCurrency(campaignSummary.totalSpend || 0)}</p>
                  </div>
                  <div className="bg-gradient-to-br from-emerald-900/30 to-slate-800/50 rounded-xl border border-emerald-500/30 p-4">
                    <p className="text-slate-400 text-xs uppercase">Total Sales</p>
                    <p className="text-2xl font-bold text-emerald-400">{formatCurrency(campaignSummary.totalSales || 0)}</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                    <p className="text-slate-400 text-xs uppercase">ROAS</p>
                    <p className={`text-2xl font-bold ${(campaignSummary.roas || 0) >= 3 ? 'text-emerald-400' : (campaignSummary.roas || 0) >= 2 ? 'text-amber-400' : 'text-rose-400'}`}>{(campaignSummary.roas || 0).toFixed(2)}x</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                    <p className="text-slate-400 text-xs uppercase">ACOS</p>
                    <p className={`text-2xl font-bold ${(campaignSummary.acos || 0) <= 25 ? 'text-emerald-400' : (campaignSummary.acos || 0) <= 35 ? 'text-amber-400' : 'text-rose-400'}`}>{(campaignSummary.acos || 0).toFixed(1)}%</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                    <p className="text-slate-400 text-xs uppercase">Orders</p>
                    <p className="text-2xl font-bold text-white">{(campaignSummary.totalOrders || 0).toLocaleString()}</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                    <p className="text-slate-400 text-xs uppercase">Conv Rate</p>
                    <p className="text-2xl font-bold text-white">{(campaignSummary.convRate || 0).toFixed(1)}%</p>
                  </div>
                </div>
                
                {/* Week-over-Week Comparison */}
                {amazonCampaigns.history?.length > 1 && (
                  <div className="bg-gradient-to-br from-violet-900/20 to-slate-800/50 rounded-xl border border-violet-500/30 p-5 mb-6">
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-violet-400" />
                      Week-over-Week Trend
                      <span className="text-sm font-normal text-slate-400 ml-2">({amazonCampaigns.history.length} weeks tracked)</span>
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-700">
                            <th className="text-left text-slate-400 py-2">Week</th>
                            <th className="text-right text-slate-400 py-2">Spend</th>
                            <th className="text-right text-slate-400 py-2">Sales</th>
                            <th className="text-right text-slate-400 py-2">Orders</th>
                            <th className="text-right text-slate-400 py-2">ROAS</th>
                            <th className="text-right text-slate-400 py-2">ACOS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {amazonCampaigns.history.slice(0, 8).map((h, i) => {
                            const prior = amazonCampaigns.history[i + 1];
                            const spendChange = prior?.summary?.totalSpend > 0 ? ((h.summary.totalSpend - prior.summary.totalSpend) / prior.summary.totalSpend * 100) : null;
                            const salesChange = prior?.summary?.totalSales > 0 ? ((h.summary.totalSales - prior.summary.totalSales) / prior.summary.totalSales * 100) : null;
                            return (
                              <tr key={h.weekKey} className={`border-b border-slate-700/50 ${i === 0 ? 'bg-violet-900/20' : ''}`}>
                                <td className="py-2 text-white">
                                  {new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  {i === 0 && <span className="ml-2 text-xs text-violet-400">(latest)</span>}
                                </td>
                                <td className="py-2 text-right text-white">
                                  {formatCurrency(h.summary.totalSpend)}
                                  {spendChange !== null && <span className={`ml-1 text-xs ${spendChange <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>({spendChange >= 0 ? '+' : ''}{spendChange.toFixed(0)}%)</span>}
                                </td>
                                <td className="py-2 text-right text-emerald-400">
                                  {formatCurrency(h.summary.totalSales)}
                                  {salesChange !== null && <span className={`ml-1 text-xs ${salesChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>({salesChange >= 0 ? '+' : ''}{salesChange.toFixed(0)}%)</span>}
                                </td>
                                <td className="py-2 text-right text-white">{(h.summary.totalOrders || 0).toLocaleString()}</td>
                                <td className={`py-2 text-right font-medium ${h.summary.roas >= 3 ? 'text-emerald-400' : h.summary.roas >= 2 ? 'text-amber-400' : 'text-rose-400'}`}>{h.summary.roas.toFixed(2)}x</td>
                                <td className={`py-2 text-right ${h.summary.acos <= 25 ? 'text-emerald-400' : h.summary.acos <= 35 ? 'text-amber-400' : 'text-rose-400'}`}>{h.summary.acos.toFixed(1)}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                
                {/* Campaign Type Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  {[
                    { type: 'SP', label: 'Sponsored Products', color: 'blue', campaigns: Array.isArray(campaignSummary.byType?.SP) ? campaignSummary.byType.SP : [] },
                    { type: 'SB', label: 'Sponsored Brands', color: 'purple', campaigns: Array.isArray(campaignSummary.byType?.SB) ? campaignSummary.byType.SB : [] },
                    { type: 'SD', label: 'Sponsored Display', color: 'teal', campaigns: Array.isArray(campaignSummary.byType?.SD) ? campaignSummary.byType.SD : [] },
                  ].map(({ type, label, color, campaigns: typeCampaigns }) => {
                    const spend = typeCampaigns.reduce((s, c) => s + (c.spend || 0), 0);
                    const sales = typeCampaigns.reduce((s, c) => s + (c.sales || 0), 0);
                    const roas = spend > 0 ? sales / spend : 0;
                    return (
                      <div key={type} className={`bg-slate-800/50 rounded-xl border border-slate-700 p-4`}>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-white font-medium">{label}</h4>
                          <span className={`px-2 py-0.5 rounded text-xs bg-${color}-500/20 text-${color}-400`}>{typeCampaigns.length} campaigns</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div><p className="text-slate-500 text-xs">Spend</p><p className="text-white font-medium">{formatCurrency(spend)}</p></div>
                          <div><p className="text-slate-500 text-xs">Sales</p><p className="text-white font-medium">{formatCurrency(sales)}</p></div>
                          <div><p className="text-slate-500 text-xs">ROAS</p><p className={`font-medium ${roas >= 3 ? 'text-emerald-400' : roas >= 2 ? 'text-amber-400' : 'text-rose-400'}`}>{roas.toFixed(2)}x</p></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Top & Bottom Performers */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div className="bg-slate-800/50 rounded-xl border border-emerald-500/30 p-5">
                    <h3 className="text-lg font-semibold text-emerald-400 mb-3 flex items-center gap-2"><Trophy className="w-5 h-5" />Top Performers (by ROAS)</h3>
                    <div className="space-y-2">
                      {topPerformers.map((c, i) => (
                        <div key={c.id || i} className="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm truncate">{c.name}</p>
                            <p className="text-slate-500 text-xs">{formatCurrency(c.spend || 0)} spent</p>
                          </div>
                          <div className="text-right ml-2">
                            <p className="text-emerald-400 font-bold">{(c.roas || 0).toFixed(2)}x</p>
                            <p className="text-slate-500 text-xs">{formatCurrency(c.sales || 0)}</p>
                          </div>
                        </div>
                      ))}
                      {topPerformers.length === 0 && <p className="text-slate-500 text-sm">No enabled campaigns with sales</p>}
                    </div>
                  </div>
                  
                  <div className="bg-slate-800/50 rounded-xl border border-rose-500/30 p-5">
                    <h3 className="text-lg font-semibold text-rose-400 mb-3 flex items-center gap-2"><AlertTriangle className="w-5 h-5" />Needs Attention (Low ROAS)</h3>
                    <div className="space-y-2">
                      {bottomPerformers.map((c, i) => (
                        <div key={c.id || i} className="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm truncate">{c.name}</p>
                            <p className="text-slate-500 text-xs">{formatCurrency(c.spend || 0)} spent</p>
                          </div>
                          <div className="text-right ml-2">
                            <p className="text-rose-400 font-bold">{(c.roas || 0).toFixed(2)}x</p>
                            <p className="text-slate-500 text-xs">ACOS: {(c.acos || 0).toFixed(0)}%</p>
                          </div>
                        </div>
                      ))}
                      {bottomPerformers.length === 0 && <p className="text-slate-500 text-sm">No underperforming campaigns</p>}
                    </div>
                  </div>
                </div>
                
                {/* Campaign Table */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h3 className="text-lg font-semibold text-white">All Campaigns ({filteredCampaigns.length})</h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <select value={amazonCampaignFilter.status} onChange={(e) => setAmazonCampaignFilter(f => ({...f, status: e.target.value}))} className="bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-white text-sm">
                        <option value="all">All Status</option>
                        <option value="ENABLED">Enabled</option>
                        <option value="PAUSED">Paused</option>
                      </select>
                      <select value={amazonCampaignFilter.type} onChange={(e) => setAmazonCampaignFilter(f => ({...f, type: e.target.value}))} className="bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-white text-sm">
                        <option value="all">All Types</option>
                        <option value="SP">SP</option>
                        <option value="SB">SB</option>
                        <option value="SD">SD</option>
                      </select>
                      <input type="text" placeholder="Search..." value={amazonCampaignFilter.search} onChange={(e) => setAmazonCampaignFilter(f => ({...f, search: e.target.value}))} className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1 text-white text-sm w-40" />
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700">
                          {[
                            { field: 'name', label: 'Campaign' },
                            { field: 'type', label: 'Type' },
                            { field: 'state', label: 'Status' },
                            { field: 'spend', label: 'Spend' },
                            { field: 'sales', label: 'Sales' },
                            { field: 'orders', label: 'Orders' },
                            { field: 'roas', label: 'ROAS' },
                            { field: 'acos', label: 'ACOS' },
                          ].map(col => (
                            <th key={col.field} onClick={() => setAmazonCampaignSort(s => ({ field: col.field, dir: s.field === col.field && s.dir === 'desc' ? 'asc' : 'desc' }))} className={`text-left text-slate-400 py-2 px-2 cursor-pointer hover:text-white ${col.field !== 'name' ? 'text-right' : ''}`}>
                              {col.label} {amazonCampaignSort.field === col.field && (amazonCampaignSort.dir === 'desc' ? '↓' : '↑')}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCampaigns.slice(0, 50).map(c => (
                          <tr key={c.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                            <td className="py-2 px-2 text-white max-w-xs truncate" title={c.name}>{c.name}</td>
                            <td className="py-2 px-2 text-right"><span className={`px-1.5 py-0.5 rounded text-xs ${c.type === 'SP' ? 'bg-blue-500/20 text-blue-400' : c.type === 'SD' ? 'bg-teal-500/20 text-teal-400' : 'bg-purple-500/20 text-purple-400'}`}>{c.type}</span></td>
                            <td className="py-2 px-2 text-right"><span className={`px-1.5 py-0.5 rounded text-xs ${c.state === 'ENABLED' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'}`}>{c.state === 'ENABLED' ? 'Active' : 'Paused'}</span></td>
                            <td className="py-2 px-2 text-right text-white">{formatCurrency(c.spend || 0)}</td>
                            <td className="py-2 px-2 text-right text-emerald-400">{formatCurrency(c.sales || 0)}</td>
                            <td className="py-2 px-2 text-right text-white">{(c.orders || 0).toLocaleString()}</td>
                            <td className={`py-2 px-2 text-right font-medium ${(c.roas || 0) >= 3 ? 'text-emerald-400' : (c.roas || 0) >= 2 ? 'text-amber-400' : 'text-rose-400'}`}>{(c.roas || 0).toFixed(2)}x</td>
                            <td className={`py-2 px-2 text-right ${(c.acos || 0) <= 25 ? 'text-emerald-400' : (c.acos || 0) <= 35 ? 'text-amber-400' : 'text-rose-400'}`}>{(c.acos || 0).toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filteredCampaigns.length > 50 && <p className="text-slate-500 text-sm mt-2 text-center">Showing 50 of {filteredCampaigns.length} campaigns</p>}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        
        {/* Performance View (existing content) */}
        {adsViewMode === 'performance' && (
          <>
        {/* Time Period Tabs */}
        <div className="flex gap-2 mb-4 p-1 bg-slate-800/50 rounded-xl overflow-x-auto">
          <button onClick={() => setAdsTimeTab('daily')} disabled={!hasDailyData} className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${adsTimeTab === 'daily' ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:bg-slate-700 disabled:opacity-40'}`}>
            Daily {!hasDailyData && '(no data)'}
          </button>
          {['weekly', 'monthly', 'quarterly', 'yearly'].map(tab => (
            <button key={tab} onClick={() => setAdsTimeTab(tab)} className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium text-sm transition-all capitalize ${adsTimeTab === tab ? (tab === 'weekly' ? 'bg-violet-600' : tab === 'monthly' ? 'bg-blue-600' : tab === 'quarterly' ? 'bg-teal-600' : 'bg-amber-600') + ' text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
              {tab}
            </button>
          ))}
        </div>
        
        {/* Selectors Row */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-sm">Year:</span>
            <select value={adsYear} onChange={(e) => setAdsYear(parseInt(e.target.value))} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm">
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          
          {/* Show month selector for monthly tab only */}
          {adsTimeTab === 'monthly' && (
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-sm">Month:</span>
              <select value={adsMonth} onChange={(e) => setAdsMonth(parseInt(e.target.value))} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm">
                {monthNames.map((m, i) => <option key={i} value={i} disabled={!monthsWithData.includes(i)}>{m}</option>)}
              </select>
            </div>
          )}
          
          {/* Day selector for daily mode */}
          {adsTimeTab === 'daily' && sortedDays.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-sm">Day:</span>
              <select value={adsSelectedDay || ''} onChange={(e) => setAdsSelectedDay(e.target.value)} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm">
                {sortedDays.slice().reverse().slice(0, 90).map(d => (
                  <option key={d} value={d}>
                    {new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {/* Week selector for weekly mode */}
          {adsTimeTab === 'weekly' && weeksInYear.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-sm">Week Ending:</span>
              <select value={adsSelectedWeek || ''} onChange={(e) => setAdsSelectedWeek(e.target.value)} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm">
                {weeksInYear.slice().reverse().map(w => (
                  <option key={w} value={w}>
                    {new Date(w + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {adsTimeTab === 'quarterly' && (
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-sm">Quarter:</span>
              <select value={adsQuarter} onChange={(e) => setAdsQuarter(parseInt(e.target.value))} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm">
                {[1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q}</option>)}
              </select>
            </div>
          )}
          
          <div className="flex items-center gap-1 ml-auto">
            <button onClick={goToPrev} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={goToNext} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
        
        {/* Period Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">{getPeriodLabel()}</h2>
          <span className="text-slate-400 text-sm">
            {useDailyData 
              ? `${periodDays.length} day${periodDays.length !== 1 ? 's' : ''}` 
              : `${periodWeeks.length} week${periodWeeks.length !== 1 ? 's' : ''}`}
          </span>
        </div>
        
        {/* KPI Cards */}
        {useDailyData ? (
          <>
          {/* Main KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <div className="bg-gradient-to-br from-purple-900/30 to-slate-800/50 rounded-xl border border-purple-500/30 p-4">
              <p className="text-slate-400 text-xs uppercase">Total Spend</p>
              <p className="text-2xl font-bold text-white">{formatCurrency(dailyTotals.totalAds)}</p>
              <p className="text-purple-400 text-xs mt-1">{periodDays.length} day{periodDays.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-xs uppercase">Impressions</p>
              <p className="text-2xl font-bold text-white">{formatNumber(dailyTotals.totalImpressions)}</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-xs uppercase">Clicks</p>
              <p className="text-2xl font-bold text-white">{formatNumber(dailyTotals.totalClicks)}</p>
              <p className="text-slate-500 text-xs mt-1">CTR: {ctr.toFixed(2)}%</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-xs uppercase">Conversions</p>
              <p className="text-2xl font-bold text-white">{formatNumber(dailyTotals.googleConversions + dailyTotals.metaPurchases)}</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-xs uppercase">Avg CPC</p>
              <p className={`text-2xl font-bold ${cpc < 1.50 ? 'text-emerald-400' : cpc < 2.50 ? 'text-amber-400' : 'text-rose-400'}`}>{formatCurrency(cpc)}</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-xs uppercase">Revenue</p>
              <p className="text-2xl font-bold text-emerald-400">{formatCurrency(dailyTotals.totalRev)}</p>
              <p className="text-slate-500 text-xs mt-1">ROAS: {dailyTotals.totalAds > 0 ? (dailyTotals.totalRev / dailyTotals.totalAds).toFixed(2) : '—'}x</p>
            </div>
          </div>
          
          {/* Platform Breakdown Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Google Ads Card */}
            <div className="bg-gradient-to-br from-red-900/20 to-slate-800/50 rounded-xl border border-red-500/30 p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-red-400 font-semibold flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-500" />Google Ads
                </h4>
                <span className="text-white font-bold">{formatCurrency(dailyTotals.googleAds)}</span>
              </div>
              {dailyTotals.googleAds > 0 || dailyTotals.googleImpressions > 0 ? (
                <>
                  <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                    <div><p className="text-slate-500">Impressions</p><p className="text-white font-medium">{formatNumber(dailyTotals.googleImpressions)}</p></div>
                    <div><p className="text-slate-500">Clicks</p><p className="text-white font-medium">{formatNumber(dailyTotals.googleClicks)}</p></div>
                    <div><p className="text-slate-500">Conversions</p><p className="text-emerald-400 font-medium">{dailyTotals.googleConversions}</p></div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-slate-700/50">
                    <div>
                      <p className="text-slate-500">CTR</p>
                      <p className={`font-medium ${dailyTotals.googleImpressions > 0 && (dailyTotals.googleClicks / dailyTotals.googleImpressions * 100) >= 2 ? 'text-emerald-400' : 'text-white'}`}>
                        {dailyTotals.googleImpressions > 0 ? ((dailyTotals.googleClicks / dailyTotals.googleImpressions) * 100).toFixed(2) : '—'}%
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">CPC</p>
                      <p className={`font-medium ${dailyTotals.googleClicks > 0 && dailyTotals.googleAds / dailyTotals.googleClicks <= 1.50 ? 'text-emerald-400' : 'text-white'}`}>
                        {formatCurrency(dailyTotals.googleClicks > 0 ? dailyTotals.googleAds / dailyTotals.googleClicks : 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">CPA</p>
                      <p className={`font-medium ${dailyTotals.googleConversions > 0 && dailyTotals.googleAds / dailyTotals.googleConversions <= 30 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {formatCurrency(dailyTotals.googleConversions > 0 ? dailyTotals.googleAds / dailyTotals.googleConversions : 0)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-700/50 mt-2">
                    <div>
                      <p className="text-slate-500">Conv Rate</p>
                      <p className={`font-medium ${dailyTotals.googleClicks > 0 && (dailyTotals.googleConversions / dailyTotals.googleClicks * 100) >= 3 ? 'text-emerald-400' : 'text-white'}`}>
                        {dailyTotals.googleClicks > 0 ? ((dailyTotals.googleConversions / dailyTotals.googleClicks) * 100).toFixed(1) : '—'}%
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">CPM</p>
                      <p className="text-white font-medium">
                        {dailyTotals.googleImpressions > 0 ? formatCurrency((dailyTotals.googleAds / dailyTotals.googleImpressions) * 1000) : '—'}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-slate-500 text-xs">No Google Ads data • <button onClick={() => setShowAdsBulkUpload(true)} className="text-red-400 hover:underline">Import data</button></p>
              )}
            </div>
            
            {/* Meta Ads Card */}
            <div className="bg-gradient-to-br from-blue-900/20 to-slate-800/50 rounded-xl border border-blue-500/30 p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-blue-400 font-semibold flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-500" />Meta Ads
                </h4>
                <span className="text-white font-bold">{formatCurrency(dailyTotals.metaAds)}</span>
              </div>
              {dailyTotals.metaAds > 0 || dailyTotals.metaImpressions > 0 ? (
                <>
                  <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                    <div><p className="text-slate-500">Impressions</p><p className="text-white font-medium">{formatNumber(dailyTotals.metaImpressions)}</p></div>
                    <div><p className="text-slate-500">Clicks</p><p className="text-white font-medium">{formatNumber(dailyTotals.metaClicks)}</p></div>
                    <div><p className="text-slate-500">Purchases</p><p className="text-emerald-400 font-medium">{formatNumber(Math.round(dailyTotals.metaPurchases))}</p></div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-slate-700/50">
                    <div>
                      <p className="text-slate-500">CTR</p>
                      <p className={`font-medium ${dailyTotals.metaImpressions > 0 && (dailyTotals.metaClicks / dailyTotals.metaImpressions * 100) >= 1 ? 'text-emerald-400' : 'text-white'}`}>
                        {dailyTotals.metaImpressions > 0 ? ((dailyTotals.metaClicks / dailyTotals.metaImpressions) * 100).toFixed(2) : '—'}%
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">CPC</p>
                      <p className={`font-medium ${dailyTotals.metaClicks > 0 && dailyTotals.metaAds / dailyTotals.metaClicks <= 1.00 ? 'text-emerald-400' : 'text-white'}`}>
                        {formatCurrency(dailyTotals.metaClicks > 0 ? dailyTotals.metaAds / dailyTotals.metaClicks : 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">CPP</p>
                      <p className={`font-medium ${dailyTotals.metaPurchases > 0 && dailyTotals.metaAds / dailyTotals.metaPurchases <= 25 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {formatCurrency(dailyTotals.metaPurchases > 0 ? dailyTotals.metaAds / dailyTotals.metaPurchases : 0)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-700/50 mt-2">
                    <div>
                      <p className="text-slate-500">ROAS</p>
                      <p className={`font-medium ${dailyTotals.metaPurchaseValue > 0 && dailyTotals.metaAds > 0 && (dailyTotals.metaPurchaseValue / dailyTotals.metaAds) >= 3 ? 'text-emerald-400' : (dailyTotals.metaPurchaseValue / dailyTotals.metaAds) >= 2 ? 'text-amber-400' : 'text-rose-400'}`}>
                        {dailyTotals.metaPurchaseValue > 0 && dailyTotals.metaAds > 0 ? (dailyTotals.metaPurchaseValue / dailyTotals.metaAds).toFixed(2) + 'x' : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Sales</p>
                      <p className="text-emerald-400 font-medium">{formatCurrency(dailyTotals.metaPurchaseValue)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-700/50 mt-2">
                    <div>
                      <p className="text-slate-500">Conv Rate</p>
                      <p className={`font-medium ${dailyTotals.metaClicks > 0 && (dailyTotals.metaPurchases / dailyTotals.metaClicks * 100) >= 2 ? 'text-emerald-400' : 'text-white'}`}>
                        {dailyTotals.metaClicks > 0 ? ((dailyTotals.metaPurchases / dailyTotals.metaClicks) * 100).toFixed(1) : '—'}%
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">CPM</p>
                      <p className="text-white font-medium">
                        {dailyTotals.metaImpressions > 0 ? formatCurrency((dailyTotals.metaAds / dailyTotals.metaImpressions) * 1000) : '—'}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-slate-500 text-xs">No Meta Ads data • <button onClick={() => setShowAdsBulkUpload(true)} className="text-blue-400 hover:underline">Import data</button></p>
              )}
            </div>
            
            {/* Amazon Ads Card */}
            <div className="bg-gradient-to-br from-orange-900/20 to-slate-800/50 rounded-xl border border-orange-500/30 p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-orange-400 font-semibold flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-orange-500" />Amazon PPC
                </h4>
                <span className="text-white font-bold">{formatCurrency(dailyTotals.amazonAds)}</span>
              </div>
              {dailyTotals.amazonAds > 0 || dailyTotals.amazonImpressions > 0 ? (
                <>
                  <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                    <div><p className="text-slate-500">Revenue</p><p className="text-white font-medium">{formatCurrency(dailyTotals.amazonRev)}</p></div>
                    <div><p className="text-slate-500">ACOS</p><p className={`font-medium ${dailyTotals.amazonRev > 0 ? (dailyTotals.amazonAds / dailyTotals.amazonRev * 100 <= 25 ? 'text-emerald-400' : 'text-amber-400') : 'text-slate-500'}`}>{dailyTotals.amazonRev > 0 ? (dailyTotals.amazonAds / dailyTotals.amazonRev * 100).toFixed(1) + '%' : '—'}</p></div>
                    <div><p className="text-slate-500">ROAS</p><p className={`font-medium ${dailyTotals.amazonAds > 0 ? (dailyTotals.amazonRev / dailyTotals.amazonAds >= 3 ? 'text-emerald-400' : 'text-amber-400') : 'text-slate-500'}`}>{dailyTotals.amazonAds > 0 ? (dailyTotals.amazonRev / dailyTotals.amazonAds).toFixed(2) + 'x' : '—'}</p></div>
                  </div>
                  {/* Show detailed Amazon metrics if available from historical import */}
                  {dailyTotals.amazonImpressions > 0 && (
                    <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-slate-700/50">
                      <div><p className="text-slate-500">Impressions</p><p className="text-white font-medium">{formatNumber(dailyTotals.amazonImpressions)}</p></div>
                      <div><p className="text-slate-500">Clicks</p><p className="text-white font-medium">{formatNumber(dailyTotals.amazonClicks)}</p></div>
                      <div><p className="text-slate-500">CTR</p><p className="text-white font-medium">{dailyTotals.amazonImpressions > 0 ? ((dailyTotals.amazonClicks / dailyTotals.amazonImpressions) * 100).toFixed(2) : '—'}%</p></div>
                      <div><p className="text-slate-500">Conversions</p><p className="text-white font-medium">{formatNumber(dailyTotals.amazonConversions)}</p></div>
                      <div><p className="text-slate-500">CPC</p><p className="text-white font-medium">{dailyTotals.amazonClicks > 0 ? formatCurrency(dailyTotals.amazonAds / dailyTotals.amazonClicks) : '—'}</p></div>
                      <div><p className="text-slate-500">Conv Rate</p><p className="text-white font-medium">{dailyTotals.amazonClicks > 0 ? ((dailyTotals.amazonConversions / dailyTotals.amazonClicks) * 100).toFixed(1) : '—'}%</p></div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-slate-500 text-xs">No Amazon ads data • <button onClick={() => setShowAdsIntelUpload(true)} className="text-orange-400 hover:underline">Import historical data</button></p>
              )}
            </div>
          </div>
          
          {/* Platform Comparison Table - Only show if we have data from multiple platforms */}
          {(dailyTotals.googleAds > 0 || dailyTotals.metaAds > 0 || dailyTotals.amazonAds > 0) && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <GitCompare className="w-5 h-5 text-violet-400" />Platform Comparison
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left text-slate-400 py-2 px-2">Metric</th>
                      {dailyTotals.googleAds > 0 && <th className="text-right text-red-400 py-2 px-2">Google</th>}
                      {dailyTotals.metaAds > 0 && <th className="text-right text-blue-400 py-2 px-2">Meta</th>}
                      {dailyTotals.amazonAds > 0 && <th className="text-right text-orange-400 py-2 px-2">Amazon</th>}
                      <th className="text-right text-slate-400 py-2 px-2">Best</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Spend */}
                    <tr className="border-b border-slate-700/50">
                      <td className="py-2 px-2 text-slate-300">Spend</td>
                      {dailyTotals.googleAds > 0 && <td className="py-2 px-2 text-right text-white">{formatCurrency(dailyTotals.googleAds)}</td>}
                      {dailyTotals.metaAds > 0 && <td className="py-2 px-2 text-right text-white">{formatCurrency(dailyTotals.metaAds)}</td>}
                      {dailyTotals.amazonAds > 0 && <td className="py-2 px-2 text-right text-white">{formatCurrency(dailyTotals.amazonAds)}</td>}
                      <td className="py-2 px-2 text-right text-slate-500">—</td>
                    </tr>
                    {/* CPC */}
                    {(() => {
                      const googleCpc = dailyTotals.googleClicks > 0 ? dailyTotals.googleAds / dailyTotals.googleClicks : null;
                      const metaCpc = dailyTotals.metaClicks > 0 ? dailyTotals.metaAds / dailyTotals.metaClicks : null;
                      const amazonCpc = dailyTotals.amazonClicks > 0 ? dailyTotals.amazonAds / dailyTotals.amazonClicks : null;
                      const cpcs = [googleCpc, metaCpc, amazonCpc].filter(c => c !== null && c > 0);
                      const bestCpc = cpcs.length > 0 ? Math.min(...cpcs) : null;
                      const bestPlatform = bestCpc === googleCpc ? 'Google' : bestCpc === metaCpc ? 'Meta' : 'Amazon';
                      return (
                        <tr className="border-b border-slate-700/50">
                          <td className="py-2 px-2 text-slate-300">CPC</td>
                          {dailyTotals.googleAds > 0 && <td className={`py-2 px-2 text-right ${googleCpc === bestCpc ? 'text-emerald-400 font-medium' : 'text-white'}`}>{googleCpc ? formatCurrency(googleCpc) : '—'}</td>}
                          {dailyTotals.metaAds > 0 && <td className={`py-2 px-2 text-right ${metaCpc === bestCpc ? 'text-emerald-400 font-medium' : 'text-white'}`}>{metaCpc ? formatCurrency(metaCpc) : '—'}</td>}
                          {dailyTotals.amazonAds > 0 && <td className={`py-2 px-2 text-right ${amazonCpc === bestCpc ? 'text-emerald-400 font-medium' : 'text-white'}`}>{amazonCpc ? formatCurrency(amazonCpc) : '—'}</td>}
                          <td className="py-2 px-2 text-right text-emerald-400 text-xs">{bestCpc ? bestPlatform : '—'}</td>
                        </tr>
                      );
                    })()}
                    {/* CTR */}
                    {(() => {
                      const googleCtr = dailyTotals.googleImpressions > 0 ? (dailyTotals.googleClicks / dailyTotals.googleImpressions * 100) : null;
                      const metaCtr = dailyTotals.metaImpressions > 0 ? (dailyTotals.metaClicks / dailyTotals.metaImpressions * 100) : null;
                      const amazonCtr = dailyTotals.amazonImpressions > 0 ? (dailyTotals.amazonClicks / dailyTotals.amazonImpressions * 100) : null;
                      const ctrs = [googleCtr, metaCtr, amazonCtr].filter(c => c !== null);
                      const bestCtr = ctrs.length > 0 ? Math.max(...ctrs) : null;
                      const bestPlatform = bestCtr === googleCtr ? 'Google' : bestCtr === metaCtr ? 'Meta' : 'Amazon';
                      return (
                        <tr className="border-b border-slate-700/50">
                          <td className="py-2 px-2 text-slate-300">CTR</td>
                          {dailyTotals.googleAds > 0 && <td className={`py-2 px-2 text-right ${googleCtr === bestCtr ? 'text-emerald-400 font-medium' : 'text-white'}`}>{googleCtr ? googleCtr.toFixed(2) + '%' : '—'}</td>}
                          {dailyTotals.metaAds > 0 && <td className={`py-2 px-2 text-right ${metaCtr === bestCtr ? 'text-emerald-400 font-medium' : 'text-white'}`}>{metaCtr ? metaCtr.toFixed(2) + '%' : '—'}</td>}
                          {dailyTotals.amazonAds > 0 && <td className={`py-2 px-2 text-right ${amazonCtr === bestCtr ? 'text-emerald-400 font-medium' : 'text-white'}`}>{amazonCtr ? amazonCtr.toFixed(2) + '%' : '—'}</td>}
                          <td className="py-2 px-2 text-right text-emerald-400 text-xs">{bestCtr ? bestPlatform : '—'}</td>
                        </tr>
                      );
                    })()}
                    {/* Conv Rate */}
                    {(() => {
                      const googleConvRate = dailyTotals.googleClicks > 0 ? (dailyTotals.googleConversions / dailyTotals.googleClicks * 100) : null;
                      const metaConvRate = dailyTotals.metaClicks > 0 ? (dailyTotals.metaPurchases / dailyTotals.metaClicks * 100) : null;
                      const amazonConvRate = dailyTotals.amazonClicks > 0 ? (dailyTotals.amazonConversions / dailyTotals.amazonClicks * 100) : null;
                      const rates = [googleConvRate, metaConvRate, amazonConvRate].filter(c => c !== null);
                      const bestRate = rates.length > 0 ? Math.max(...rates) : null;
                      const bestPlatform = bestRate === googleConvRate ? 'Google' : bestRate === metaConvRate ? 'Meta' : 'Amazon';
                      return (
                        <tr className="border-b border-slate-700/50">
                          <td className="py-2 px-2 text-slate-300">Conv Rate</td>
                          {dailyTotals.googleAds > 0 && <td className={`py-2 px-2 text-right ${googleConvRate === bestRate ? 'text-emerald-400 font-medium' : 'text-white'}`}>{googleConvRate ? googleConvRate.toFixed(1) + '%' : '—'}</td>}
                          {dailyTotals.metaAds > 0 && <td className={`py-2 px-2 text-right ${metaConvRate === bestRate ? 'text-emerald-400 font-medium' : 'text-white'}`}>{metaConvRate ? metaConvRate.toFixed(1) + '%' : '—'}</td>}
                          {dailyTotals.amazonAds > 0 && <td className={`py-2 px-2 text-right ${amazonConvRate === bestRate ? 'text-emerald-400 font-medium' : 'text-white'}`}>{amazonConvRate ? amazonConvRate.toFixed(1) + '%' : '—'}</td>}
                          <td className="py-2 px-2 text-right text-emerald-400 text-xs">{bestRate ? bestPlatform : '—'}</td>
                        </tr>
                      );
                    })()}
                    {/* CPA/CPP */}
                    {(() => {
                      const googleCpa = dailyTotals.googleConversions > 0 ? dailyTotals.googleAds / dailyTotals.googleConversions : null;
                      const metaCpa = dailyTotals.metaPurchases > 0 ? dailyTotals.metaAds / dailyTotals.metaPurchases : null;
                      const amazonCpa = dailyTotals.amazonConversions > 0 ? dailyTotals.amazonAds / dailyTotals.amazonConversions : null;
                      const cpas = [googleCpa, metaCpa, amazonCpa].filter(c => c !== null && c > 0);
                      const bestCpa = cpas.length > 0 ? Math.min(...cpas) : null;
                      const bestPlatform = bestCpa === googleCpa ? 'Google' : bestCpa === metaCpa ? 'Meta' : 'Amazon';
                      return (
                        <tr className="border-b border-slate-700/50">
                          <td className="py-2 px-2 text-slate-300">Cost/Conv</td>
                          {dailyTotals.googleAds > 0 && <td className={`py-2 px-2 text-right ${googleCpa === bestCpa ? 'text-emerald-400 font-medium' : 'text-white'}`}>{googleCpa ? formatCurrency(googleCpa) : '—'}</td>}
                          {dailyTotals.metaAds > 0 && <td className={`py-2 px-2 text-right ${metaCpa === bestCpa ? 'text-emerald-400 font-medium' : 'text-white'}`}>{metaCpa ? formatCurrency(metaCpa) : '—'}</td>}
                          {dailyTotals.amazonAds > 0 && <td className={`py-2 px-2 text-right ${amazonCpa === bestCpa ? 'text-emerald-400 font-medium' : 'text-white'}`}>{amazonCpa ? formatCurrency(amazonCpa) : '—'}</td>}
                          <td className="py-2 px-2 text-right text-emerald-400 text-xs">{bestCpa ? bestPlatform : '—'}</td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
              <p className="text-slate-500 text-xs mt-3">Green highlights indicate best performing platform for each metric. Lower is better for CPC and Cost/Conv, higher is better for CTR and Conv Rate.</p>
            </div>
          )}
          
          {/* Shopify Ads (Meta + Google) Weekly Trend Chart */}
          
{(() => {
  const daysWithShopifyAds = sortedDays.filter(d => {
  const day = allDaysData[d];
  if (!day) return false;
  const ads = getShopifyAdsForDay(day);
  return (ads.metaSpend || 0) > 0 || (ads.googleSpend || 0) > 0;
  });

  const minPoints = adsTimeTab === 'daily' ? 7 : 14;
  if (daysWithShopifyAds.length < minPoints) {
  return (
    <div className="bg-slate-900/40 rounded-xl p-6 text-center">
      <p className="text-slate-500">Need more ad history to show trends</p>
    </div>
  );
  }

  const lookback = adsTimeTab === 'daily' ? 30 : 90;
  const chartDays = daysWithShopifyAds.slice(-lookback);

  const startDate = new Date(chartDays[0] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const endDate = new Date(chartDays[chartDays.length - 1] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  let chartData = [];

  if (adsTimeTab === 'daily') {
  chartData = chartDays.map(d => {
    const ads = getShopifyAdsForDay(allDaysData[d]);
    return {
      week: new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      meta: Math.round(ads.metaSpend || 0),
      google: Math.round(ads.googleSpend || 0),
      total: Math.round((ads.metaSpend || 0) + (ads.googleSpend || 0)),
    };
  });
  } else {
  // weekly aggregate
  const weeklyData = [];
  for (let i = 0; i < chartDays.length; i += 7) {
    const weekDays = chartDays.slice(i, Math.min(i + 7, chartDays.length));
    const totals = weekDays.reduce((acc, d) => {
      const ads = getShopifyAdsForDay(allDaysData[d]);
      return {
        meta: acc.meta + (ads.metaSpend || 0),
        google: acc.google + (ads.googleSpend || 0),
      };
    }, { meta: 0, google: 0 });
    weeklyData.push({
      week: new Date(weekDays[0] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      meta: Math.round(totals.meta),
      google: Math.round(totals.google),
      total: Math.round(totals.meta + totals.google),
    });
  }
  chartData = weeklyData;
  }

  const displayCount = adsTimeTab === 'daily' ? 14 : 8;
  const shown = chartData.slice(-displayCount);

  return (
  <div className="bg-slate-800/50 rounded-xl border border-purple-500/30 p-5 mb-6">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-violet-400" />Shopify Ads: Meta & Google Trend
      </h3>
      <span className="text-slate-400 text-sm">{startDate} - {endDate}</span>
    </div>

    <div className="space-y-3 mb-4">
      {shown.map((w, i) => {
        const maxSpend = Math.max(...shown.map(x => x.total));
        const metaWidth = maxSpend > 0 ? (w.meta / maxSpend) * 100 : 0;
        const googleWidth = maxSpend > 0 ? (w.google / maxSpend) * 100 : 0;
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="text-slate-400 text-xs w-16">{w.week}</span>
            <div className="flex-1 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <div className="h-2.5 bg-blue-500/80 rounded" style={{ width: `${metaWidth}%`, minWidth: w.meta > 0 ? '4px' : '0' }} />
                <span className="text-blue-400 text-xs">{formatCurrency(w.meta)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2.5 bg-red-500/80 rounded" style={{ width: `${googleWidth}%`, minWidth: w.google > 0 ? '4px' : '0' }} />
                <span className="text-red-400 text-xs">{formatCurrency(w.google)}</span>
              </div>
            </div>
            <span className="text-white text-xs font-medium w-16 text-right">{formatCurrency(w.total)}</span>
          </div>
        );
      })}
    </div>

    <div className="text-xs text-slate-500">
      {adsTimeTab === 'daily' ? 'Daily spend (last 14 days shown)' : 'Weekly spend (last 8 weeks shown)'}
    </div>
  </div>
  );
})()}
          </>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-gradient-to-br from-purple-900/30 to-slate-800/50 rounded-xl border border-purple-500/30 p-4">
              <p className="text-slate-400 text-sm">Total Ad Spend</p>
              <p className="text-2xl font-bold text-white">{formatCurrency(totals.totalAds)}</p>
              {spendChange !== null && <p className={`text-xs flex items-center gap-1 mt-1 ${spendChange <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{spendChange >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}{Math.abs(spendChange).toFixed(1)}% {getCompLabel()}</p>}
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">Overall TACOS</p>
              <p className={`text-2xl font-bold ${tacosColor(totalTacos)}`}>{totalTacos > 0 ? totalTacos.toFixed(1) : '—'}%</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">Amazon TACOS</p>
              <p className={`text-2xl font-bold ${tacosColor(amzTacos)}`}>{amzTacos > 0 ? amzTacos.toFixed(1) : '—'}%</p>
              <p className="text-orange-400 text-xs mt-1">{formatCurrency(totals.amzAds)} spent</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">Shopify TACOS</p>
              <p className={`text-2xl font-bold ${tacosColor(shopTacos)}`}>{shopTacos > 0 ? shopTacos.toFixed(1) : '—'}%</p>
              <p className="text-blue-400 text-xs mt-1">{formatCurrency(shopifyAds)} spent</p>
            </div>
          </div>
        )}
        
        {/* Channel Breakdown (non-daily) */}
        {adsTimeTab !== 'daily' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
              <h3 className="text-lg font-semibold text-white mb-4">Shopify Ad Spend</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center"><span className="text-red-400 flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500" />Google Ads</span><span className="text-white font-semibold">{formatCurrency(totals.googleAds)}</span></div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-red-500" style={{ width: `${shopifyAds > 0 ? (totals.googleAds / shopifyAds) * 100 : 0}%` }} /></div>
                <div className="flex justify-between items-center"><span className="text-blue-400 flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-500" />Meta Ads</span><span className="text-white font-semibold">{formatCurrency(totals.metaAds)}</span></div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${shopifyAds > 0 ? (totals.metaAds / shopifyAds) * 100 : 0}%` }} /></div>
                <div className="pt-3 border-t border-slate-700 flex justify-between"><span className="text-slate-400">Total</span><span className="text-white font-bold">{formatCurrency(shopifyAds)}</span></div>
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
              <h3 className="text-lg font-semibold text-white mb-4">Amazon PPC</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center"><span className="text-orange-400">Ad Spend</span><span className="text-white font-semibold">{formatCurrency(totals.amzAds)}</span></div>
                <div className="flex justify-between items-center"><span className="text-slate-400">Revenue</span><span className="text-white">{formatCurrency(totals.amzRev)}</span></div>
                <div className="flex justify-between items-center"><span className="text-slate-400">ACOS</span><span className={`font-semibold ${tacosColor(amzTacos)}`}>{amzTacos > 0 ? amzTacos.toFixed(1) : '—'}%</span></div>
              </div>
            </div>
          </div>
        )}
        


{/* Shopify Ads KPIs (derived from the same time window as the trend chart) */}
{(() => {
  const daysWithShopifyAds = sortedDays.filter(d => {
  const day = allDaysData[d];
  if (!day) return false;
  const ads = getShopifyAdsForDay(day);
  return (ads.metaSpend || 0) > 0 || (ads.googleSpend || 0) > 0 || (ads.metaImpressions || 0) > 0 || (ads.googleImpressions || 0) > 0;
  });
  const chartDays = adsTimeTab === 'daily'
  ? daysWithShopifyAds.slice(-14)
  : daysWithShopifyAds.slice(-56); // ~8 weeks of daily data for weekly aggregation context

  const metrics = aggregateShopifyAdsForDays(chartDays.map(d => allDaysData[d]).filter(Boolean));
  const show = (metrics.metaSpend + metrics.googleSpend + metrics.metaImpressions + metrics.googleImpressions) > 0;
  if (!show) return null;

  return (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
    <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-xl p-4">
      <h4 className="text-indigo-300 font-semibold mb-3">Meta Ads KPIs</h4>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div><p className="text-slate-400 text-xs mb-1">Spend</p><p className="text-white font-semibold">{formatCurrency(metrics.metaSpend)}</p></div>
        <div><p className="text-slate-400 text-xs mb-1">CTR</p><p className="text-white font-semibold">{metrics.metaCTR.toFixed(2)}%</p></div>
        <div><p className="text-slate-400 text-xs mb-1">CPC</p><p className="text-white font-semibold">{formatCurrency(metrics.metaCPC)}</p></div>
        <div><p className="text-slate-400 text-xs mb-1">ROAS</p><p className="text-white font-semibold">{metrics.metaROAS.toFixed(2)}</p></div>
        <div><p className="text-slate-400 text-xs mb-1">CPM</p><p className="text-white font-semibold">{formatCurrency(metrics.metaCPM)}</p></div>
        <div><p className="text-slate-400 text-xs mb-1">Purchases</p><p className="text-white font-semibold">{formatNumber(metrics.metaPurchases)}</p></div>
      </div>
    </div>

    <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4">
      <h4 className="text-red-300 font-semibold mb-3">Google Ads KPIs</h4>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div><p className="text-slate-400 text-xs mb-1">Spend</p><p className="text-white font-semibold">{formatCurrency(metrics.googleSpend)}</p></div>
        <div><p className="text-slate-400 text-xs mb-1">CTR</p><p className="text-white font-semibold">{metrics.googleCTR.toFixed(2)}%</p></div>
        <div><p className="text-slate-400 text-xs mb-1">CPC</p><p className="text-white font-semibold">{formatCurrency(metrics.googleCPC)}</p></div>
        <div><p className="text-slate-400 text-xs mb-1">CPA</p><p className="text-white font-semibold">{formatCurrency(metrics.googleCostPerConv)}</p></div>
        <div><p className="text-slate-400 text-xs mb-1">Conversions</p><p className="text-white font-semibold">{formatNumber(metrics.googleConversions)}</p></div>
        <div><p className="text-slate-400 text-xs mb-1">Clicks</p><p className="text-white font-semibold">{formatNumber(metrics.googleClicks)}</p></div>
      </div>
    </div>
  </div>
  );
})()}

        {/* Amazon Spend vs Revenue Trend Chart */}
{(() => {
  const hist = amazonCampaigns?.historicalDaily || {};

  const toKey = (dt) => {
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
  };

  const addDays = (key, delta) => {
  const dt = new Date(key + 'T12:00:00');
  dt.setDate(dt.getDate() + delta);
  return toKey(dt);
  };

  const monthRange = (year, monthIdx) => {
  const start = new Date(year, monthIdx, 1, 12, 0, 0);
  const end = new Date(year, monthIdx + 1, 0, 12, 0, 0);
  return { startKey: toKey(start), endKey: toKey(end), daysInMonth: end.getDate() };
  };

  const weekEndSunday = (key) => {
  const dt = new Date(key + 'T12:00:00');
  const dow = dt.getDay(); // 0=Sun
  const end = new Date(dt);
  end.setDate(dt.getDate() + (dow === 0 ? 0 : 7 - dow));
  return toKey(end);
  };

  const weekStartFromEnd = (endKey) => addDays(endKey, -6);

  const fmtDay = (key, includeYear = false) =>
  new Date(key + 'T12:00:00').toLocaleDateString('en-US', includeYear ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });

  const fmtMonth = (year, monthIdx) =>
  new Date(year, monthIdx, 1, 12, 0, 0).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

  const fmtQuarter = (year, q) => `Q${q} '${String(year).slice(-2)}`;

  // Pull Amazon PPC metrics from the *Amazon Ads history* if available (most complete),
  // otherwise fall back to per-day stored metrics.
  const getMetrics = (dateKey) => {
  const h = hist[dateKey];
  if (h) return h;
  const m = allDaysData?.[dateKey]?.amazonAdsMetrics;
  if (m) return m;
  return {};
  };

  const getSpend = (dateKey) => {
  // First try historicalDaily or amazonAdsMetrics
  const histSpend = Number(getMetrics(dateKey)?.spend ?? 0);
  if (histSpend > 0) return histSpend;
  // Fall back to amazon.adSpend from SKU Economics
  return Number(allDaysData?.[dateKey]?.amazon?.adSpend ?? 0);
  };
  
  const getRevenue = (dateKey) => {
  const m = getMetrics(dateKey) || {};
  // historicalDaily uses totalRevenue; some imports may use revenue
  const fromHist = Number(m.totalRevenue ?? m.revenue ?? 0);
  if (fromHist > 0) return fromHist;
  // final fallback: daily Amazon sales revenue, if present
  return Number(allDaysData?.[dateKey]?.amazon?.revenue ?? 0);
  };

  // Determine the currently selected "anchor" for the period tabs
  const anchorDateKey = (() => {
  // Prefer selected week end when in weekly mode
  if (adsTimeTab === 'weekly' && adsSelectedWeek) return weekEndSunday(adsSelectedWeek);
  // Prefer month selection (monthly tab has explicit month selector; daily uses current adsMonth in the UI navigation)
  if ((adsTimeTab === 'daily' || adsTimeTab === 'monthly') && typeof adsMonth === 'number') {
    const r = monthRange(adsYear, adsMonth);
    return r.endKey;
  }
  // Quarterly / yearly: anchor on end of period in selected year
  if (adsTimeTab === 'quarterly') {
    const qEndMonth = (adsQuarter * 3) - 1; // 0-based month index
    return monthRange(adsYear, qEndMonth).endKey;
  }
  if (adsTimeTab === 'yearly') {
    return monthRange(adsYear, 11).endKey;
  }
  // Otherwise use latest date in history
  const keys = Object.keys(hist).sort();
  return keys.length ? keys[keys.length - 1] : null;
  })();

  if (!anchorDateKey) return null;

  // Build series based on the Ads tab time period
  let series = [];

  if (adsTimeTab === 'daily') {
  const r = monthRange(adsYear, adsMonth);
  const includeYear = (new Date(r.startKey + 'T12:00:00').getFullYear() !== new Date(r.endKey + 'T12:00:00').getFullYear());
  for (let i = 0; i < r.daysInMonth; i++) {
    const k = addDays(r.startKey, i);
    const spend = getSpend(k);
    const revenue = getRevenue(k);
    const tacos = revenue > 0 ? (spend / revenue) * 100 : 0;
    series.push({ label: fmtDay(k, includeYear), spend, revenue, tacos, key: k });
  }
  // Keep the series readable: show only days with signal, but keep at least the last 14 days
  const withSignal = series.filter(x => x.spend > 0 || x.revenue > 0);
  if (withSignal.length >= 10) series = withSignal;
  series = series.slice(-14);
  } else if (adsTimeTab === 'weekly') {
  const endWeek = weekEndSunday(anchorDateKey);
  // show 8 weeks ending at selected week
  for (let w = 0; w < 8; w++) {
    const weekEnd = addDays(endWeek, -7 * (7 - w));
    const weekStart = weekStartFromEnd(weekEnd);
    let spend = 0, revenue = 0;
    for (let i = 0; i < 7; i++) {
      const k = addDays(weekStart, i);
      spend += getSpend(k);
      revenue += getRevenue(k);
    }
    const tacos = revenue > 0 ? (spend / revenue) * 100 : 0;
    series.push({
      label: new Date(weekEnd + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      spend, revenue, tacos, key: weekEnd
    });
  }
  } else if (adsTimeTab === 'monthly') {
  // Rolling 12 months ending at selected month
  const endY = adsYear;
  const endM = adsMonth;
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(endY, endM, 1, 12, 0, 0);
    dt.setMonth(dt.getMonth() - i);
    const y = dt.getFullYear();
    const m = dt.getMonth();
    const r = monthRange(y, m);
    let spend = 0, revenue = 0;
    for (let d = 0; d < r.daysInMonth; d++) {
      const k = addDays(r.startKey, d);
      spend += getSpend(k);
      revenue += getRevenue(k);
    }
    const tacos = revenue > 0 ? (spend / revenue) * 100 : 0;
    series.push({ label: fmtMonth(y, m), spend, revenue, tacos, key: r.endKey });
  }
  } else if (adsTimeTab === 'quarterly') {
  // Last 8 quarters ending at selected quarter
  const endQ = adsQuarter;
  const endY = adsYear;
  const quarterIndex = (y, q) => y * 4 + (q - 1);
  const endIdx = quarterIndex(endY, endQ);
  for (let i = 7; i >= 0; i--) {
    const idx = endIdx - i;
    const y = Math.floor(idx / 4);
    const q = (idx % 4) + 1;
    const startMonth = (q - 1) * 3;
    const endMonth = startMonth + 2;
    const rStart = monthRange(y, startMonth);
    const rEnd = monthRange(y, endMonth);
    let spend = 0, revenue = 0;
    const days = Math.round((new Date(rEnd.endKey + 'T12:00:00') - new Date(rStart.startKey + 'T12:00:00')) / (24*3600*1000)) + 1;
    for (let d = 0; d < days; d++) {
      const k = addDays(rStart.startKey, d);
      spend += getSpend(k);
      revenue += getRevenue(k);
    }
    const tacos = revenue > 0 ? (spend / revenue) * 100 : 0;
    series.push({ label: fmtQuarter(y, q), spend, revenue, tacos, key: rEnd.endKey });
  }
  } else if (adsTimeTab === 'yearly') {
  // Last 5 years ending at adsYear
  for (let i = 4; i >= 0; i--) {
    const y = adsYear - i;
    const r = monthRange(y, 11);
    let spend = 0, revenue = 0;
    // iterate through all days in year
    const startKey = `${y}-01-01`;
    const endKey = r.endKey;
    const days = Math.round((new Date(endKey + 'T12:00:00') - new Date(startKey + 'T12:00:00')) / (24*3600*1000)) + 1;
    for (let d = 0; d < days; d++) {
      const k = addDays(startKey, d);
      spend += getSpend(k);
      revenue += getRevenue(k);
    }
    const tacos = revenue > 0 ? (spend / revenue) * 100 : 0;
    series.push({ label: String(y), spend, revenue, tacos, key: endKey });
  }
  }

  // Remove empty points unless everything is empty
  const anySignal = series.some(r => (r.spend || 0) > 0 || (r.revenue || 0) > 0);
  if (!anySignal) return null;

  const startLabel = series[0]?.label || '';
  const endLabel = series[series.length - 1]?.label || '';
  const chartData = series.map(r => ({
  ...r,
  spend: Math.round(r.spend || 0),
  revenue: Math.round(r.revenue || 0),
  tacos: Math.round(((r.tacos || 0) * 10)) / 10,
  }));

  const avgSpend = chartData.reduce((s, w) => s + w.spend, 0) / chartData.length;
  const avgRev = chartData.reduce((s, w) => s + w.revenue, 0) / chartData.length;
  const avgTacos = chartData.reduce((s, w) => s + w.tacos, 0) / chartData.length;

  return (
  <div className="bg-slate-800/50 rounded-xl border border-orange-500/30 p-5 mb-6">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-orange-400" />Amazon Ads: Spend vs Revenue Trend
      </h3>
      <span className="text-slate-400 text-sm">{startLabel} - {endLabel}</span>
    </div>

    <div className="space-y-3 mb-4">
      {chartData.map((w, i) => {
        const maxValue = Math.max(...chartData.map(x => x.revenue));
        const spendWidth = maxValue > 0 ? (w.spend / maxValue) * 100 : 0;
        const revWidth = maxValue > 0 ? (w.revenue / maxValue) * 100 : 0;
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="text-slate-400 text-xs w-28">{w.label}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-2 bg-orange-500/70 rounded" style={{ width: `${spendWidth}%`, minWidth: w.spend > 0 ? '4px' : '0' }} />
                <span className="text-orange-400 text-xs">{formatCurrency(w.spend)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 bg-emerald-500/70 rounded" style={{ width: `${revWidth}%`, minWidth: w.revenue > 0 ? '4px' : '0' }} />
                <span className="text-emerald-400 text-xs">{formatCurrency(w.revenue)}</span>
              </div>
            </div>
            <div className="w-16 text-right">
              <span className={`text-xs font-medium ${(w.tacos || 0) > 15 ? 'text-rose-400' : 'text-slate-300'}`}>
                {(w.tacos || 0) > 0 ? w.tacos.toFixed(1) + '%' : '—'}
              </span>
            </div>
          </div>
        );
      })}
    </div>

    <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-700/50">
      <div className="text-center">
        <p className="text-slate-400 text-xs mb-1">Avg Spend</p>
        <p className="text-orange-400 font-semibold">{formatCurrency(avgSpend)}</p>
      </div>
      <div className="text-center">
        <p className="text-slate-400 text-xs mb-1">Avg Revenue</p>
        <p className="text-emerald-400 font-semibold">{formatCurrency(avgRev)}</p>
      </div>
      <div className="text-center">
        <p className="text-slate-400 text-xs mb-1">Avg TACOS</p>
        <p className="text-white font-semibold">{avgTacos > 0 ? avgTacos.toFixed(1) + '%' : '—'}</p>
      </div>
    </div>
  </div>
  );
})()}{/* Daily Table */}
        {useDailyData && dailyTableData.length > 0 && (
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">{adsTimeTab === 'daily' ? 'Daily Details' : 'Last 7 Days Breakdown'}</h3>
              <button onClick={() => setShowAdsBulkUpload(true)} className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm text-white flex items-center gap-1">
                <Upload className="w-4 h-4" />Import Ads
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-700">
                  <th className="text-left text-slate-400 py-2">Date</th>
                  <th className="text-right text-slate-400 py-2">Google</th>
                  <th className="text-right text-slate-400 py-2">Meta</th>
                  <th className="text-right text-slate-400 py-2">Amazon</th>
                  <th className="text-right text-slate-400 py-2">Total</th>
                  <th className="text-right text-slate-400 py-2">Impr</th>
                  <th className="text-right text-slate-400 py-2">Clicks</th>
                  <th className="text-right text-slate-400 py-2">Conv</th>
                  <th className="text-right text-slate-400 py-2">Revenue</th>
                  <th className="text-right text-slate-400 py-2">ROAS</th>
                </tr></thead>
                <tbody>
                  {dailyTableData.slice().reverse().map(d => {
                    const roas = d.totalAds > 0 ? d.totalRev / d.totalAds : 0;
                    return (
                    <tr key={d.date} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-2 text-white">{new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                      <td className="py-2 text-right text-red-400">{formatCurrency(d.googleAds)}</td>
                      <td className="py-2 text-right text-blue-400">{formatCurrency(d.metaAds)}</td>
                      <td className="py-2 text-right text-orange-400">{formatCurrency(d.amazonAds)}</td>
                      <td className="py-2 text-right text-white font-medium">{formatCurrency(d.totalAds)}</td>
                      <td className="py-2 text-right text-slate-400">{formatNumber(d.impressions)}</td>
                      <td className="py-2 text-right text-slate-300">{formatNumber(d.clicks)}</td>
                      <td className="py-2 text-right text-emerald-400">{d.conversions}</td>
                      <td className="py-2 text-right text-white">{formatCurrency(d.totalRev)}</td>
                      <td className={`py-2 text-right font-medium ${roas >= 3 ? 'text-emerald-400' : roas >= 2 ? 'text-amber-400' : roas > 0 ? 'text-rose-400' : 'text-slate-500'}`}>{roas > 0 ? roas.toFixed(2) + 'x' : '—'}</td>
                    </tr>
                  );})}
                </tbody>
                <tfoot><tr className="border-t-2 border-slate-600 font-semibold">
                  <td className="py-2 text-white">Total</td>
                  <td className="py-2 text-right text-red-400">{formatCurrency(dailyTotals.googleAds)}</td>
                  <td className="py-2 text-right text-blue-400">{formatCurrency(dailyTotals.metaAds)}</td>
                  <td className="py-2 text-right text-orange-400">{formatCurrency(dailyTotals.amazonAds)}</td>
                  <td className="py-2 text-right text-white">{formatCurrency(dailyTotals.totalAds)}</td>
                  <td className="py-2 text-right text-slate-400">{formatNumber(dailyTotals.totalImpressions)}</td>
                  <td className="py-2 text-right text-slate-300">{formatNumber(dailyTotals.totalClicks)}</td>
                  <td className="py-2 text-right text-emerald-400">{dailyTotals.googleConversions + dailyTotals.metaPurchases}</td>
                  <td className="py-2 text-right text-white">{formatCurrency(dailyTotals.totalRev)}</td>
                  <td className={`py-2 text-right font-medium ${dailyTotals.totalAds > 0 && dailyTotals.totalRev / dailyTotals.totalAds >= 3 ? 'text-emerald-400' : 'text-amber-400'}`}>{dailyTotals.totalAds > 0 ? (dailyTotals.totalRev / dailyTotals.totalAds).toFixed(2) + 'x' : '—'}</td>
                </tr></tfoot>
              </table>
            </div>
          </div>
        )}
        
        {/* Weekly Table (for monthly/quarterly/yearly) */}
        {!useDailyData && weeklyTableData.length > 0 && (
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
            <h3 className="text-lg font-semibold text-white mb-4">Weekly Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-700"><th className="text-left text-slate-400 py-2">Week Ending</th><th className="text-right text-slate-400 py-2">Amazon</th><th className="text-right text-slate-400 py-2">Google</th><th className="text-right text-slate-400 py-2">Meta</th><th className="text-right text-slate-400 py-2">Total Ads</th><th className="text-right text-slate-400 py-2">Revenue</th><th className="text-right text-slate-400 py-2">TACOS</th></tr></thead>
                <tbody>
                  {weeklyTableData.slice().reverse().map(w => (
                    <tr key={w.week} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-2 text-white">{new Date(w.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                      <td className="py-2 text-right text-orange-400">{formatCurrency(w.amzAds)}</td>
                      <td className="py-2 text-right text-red-400">{formatCurrency(w.googleAds)}</td>
                      <td className="py-2 text-right text-blue-400">{formatCurrency(w.metaAds)}</td>
                      <td className="py-2 text-right text-white font-medium">{formatCurrency(w.totalAds)}</td>
                      <td className="py-2 text-right text-white">{formatCurrency(w.totalRev)}</td>
                      <td className={`py-2 text-right font-semibold ${tacosColor(w.tacos)}`}>{w.tacos > 0 ? w.tacos.toFixed(1) : '—'}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t-2 border-slate-600 font-semibold"><td className="py-2 text-white">Total</td><td className="py-2 text-right text-orange-400">{formatCurrency(totals.amzAds)}</td><td className="py-2 text-right text-red-400">{formatCurrency(totals.googleAds)}</td><td className="py-2 text-right text-blue-400">{formatCurrency(totals.metaAds)}</td><td className="py-2 text-right text-white">{formatCurrency(totals.totalAds)}</td><td className="py-2 text-right text-white">{formatCurrency(totals.totalRev)}</td><td className={`py-2 text-right ${tacosColor(totalTacos)}`}>{totalTacos > 0 ? totalTacos.toFixed(1) : '—'}%</td></tr></tfoot>
              </table>
            </div>
          </div>
        )}
        
        {/* Empty state */}
        {((useDailyData && dailyTableData.length === 0) || (!useDailyData && weeklyTableData.length === 0)) && (
          <div className="text-center py-12 bg-slate-800/30 rounded-2xl border border-slate-700">
            <DollarSign className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 mb-4">No ad data for {getPeriodLabel()}</p>
            <button onClick={() => setShowAdsBulkUpload(true)} className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-white flex items-center gap-2 mx-auto">
              <Upload className="w-4 h-4" />Upload Ad Spend Data
            </button>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
};

export default AdsView;
