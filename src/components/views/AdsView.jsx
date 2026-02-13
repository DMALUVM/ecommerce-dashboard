import React, { useState, useRef, useMemo, useCallback } from 'react';
import {
  AlertTriangle, BarChart3, Brain, Check, ChevronLeft, ChevronRight, Clock,
  Database, DollarSign, FileSpreadsheet, Flame, Loader2, RefreshCw, Search,
  Send, ShieldAlert, Sparkles, Target, TrendingDown, TrendingUp, Trophy, Upload, X, Zap
} from 'lucide-react';
import { formatCurrency, formatPercent, formatNumber } from '../../utils/format';
import { getShopifyAdsForDay, aggregateShopifyAdsForDays } from '../../utils/ads';
import { hasDailySalesData } from '../../utils/date';
import { AI_MODEL_OPTIONS, getModelLabel } from '../../utils/config';
import NavTabs from '../ui/NavTabs';

// Simple markdown → HTML converter for export (no external deps)
const markdownToHtml = (md) => {
  if (!md) return '';
  let html = md
    // Escape HTML entities
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Headers
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr/>')
    // Unordered lists
    .replace(/^[\-\*] (.+)$/gm, '<li>$1</li>')
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  
  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  
  // Paragraphs (lines not already wrapped in HTML tags)
  html = html.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    if (/^<[a-z]/.test(trimmed)) return trimmed;
    return `<p>${trimmed}</p>`;
  }).join('\n');
  
  return html;
};

const AdsView = ({
  adSpend, adsAiInput, adsAiLoading, adsAiMessages, adsIntelData,
  aiChatModel, setAiChatModel,
  adsAiReportHistory, setAdsAiReportHistory,
  adsMonth, adsQuarter, adsSelectedDay, adsSelectedWeek, adsTimeTab,
  adsViewMode, adsYear, allDaysData, allPeriodsData, allWeeksData,
  amazonCampaignFilter, amazonCampaignSort, amazonCampaigns, appSettings,
  bankingData, current, dataBar, files, globalModals, invHistory, months,
  navDropdown, parseAmazonCampaignCSV, processAdsUpload,
  saveAmazonCampaigns, sendAdsAIMessage, setAdsAiInput, setAdsAiMessages,
  setAdsMonth, setAdsQuarter, setAdsSelectedDay, setAdsSelectedWeek,
  setAdsTimeTab, setAdsViewMode, setAdsYear, setAmazonCampaignFilter,
  setAmazonCampaignSort, setNavDropdown, setSelectedDay, setSelectedInvDate,
  setSelectedPeriod, setSelectedWeek, setShowAdsAIChat, setShowAdsBulkUpload,
  setShowAdsIntelUpload, setToast, setUploadTab, showAdsAIChat, setView,
  view, save
}) => {
  const sortedWeeks = Object.keys(allWeeksData).sort();
  const sortedDays = Object.keys(allDaysData || {}).sort();
  const hasDailyData = sortedDays.length > 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const [uploadStatus, setUploadStatus] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showDataSources, setShowDataSources] = useState(false);
  const [intelDateRange, setIntelDateRange] = useState(30);
  const fileInputRef = useRef(null);

  const campaigns = amazonCampaigns?.campaigns || [];
  const hasCampaignData = campaigns.length > 0;
  const campaignSummary = amazonCampaigns?.summary || {};
  const historicalDaily = amazonCampaigns?.historicalDaily || {};
  const hasHistoricalData = Object.keys(historicalDaily).length > 0;

  // Count Tier 2 reports
  const tier2Summary = useMemo(() => {
    if (!adsIntelData) return { count: 0, platforms: [] };
    let count = 0; const platforms = new Set();
    for (const [platform, reports] of Object.entries(adsIntelData)) {
      if (platform === 'lastUpdated' || platform === 'reportCount') continue;
      if (typeof reports !== 'object') continue;
      for (const [, val] of Object.entries(reports)) {
        if (val?.records) { count++; platforms.add(platform); }
      }
    }
    return { count, platforms: [...platforms] };
  }, [adsIntelData]);

  // Quick Insights
  const quickInsights = useMemo(() => {
    const insights = [];
    if (hasCampaignData) {
      const enabled = campaigns.filter(c => c.state === 'ENABLED');
      const wasteful = enabled.filter(c => c.spend > 100 && c.roas < 1.5);
      const scaling = enabled.filter(c => c.roas > 4 && c.spend < 500);
      const avgROAS = campaignSummary.roas || 0;
      if (wasteful.length > 0) {
        const w$ = wasteful.reduce((s, c) => s + c.spend, 0);
        insights.push({ type: 'warning', icon: '⚠️', text: `${wasteful.length} campaigns ROAS<1.5x wasting ${formatCurrency(w$)}`, action: 'Review underperformers' });
      }
      if (scaling.length > 0) insights.push({ type: 'opportunity', icon: '🚀', text: `${scaling.length} high-ROAS (>4x) campaigns could scale`, action: 'Increase budgets' });
      if (avgROAS >= 4) insights.push({ type: 'success', icon: '✅', text: `Excellent ROAS ${avgROAS.toFixed(2)}x`, action: null });
      else if (avgROAS >= 2) insights.push({ type: 'info', icon: '📊', text: `ROAS ${avgROAS.toFixed(2)}x — room to optimize`, action: null });
    }
    return insights;
  }, [campaigns, campaignSummary, hasCampaignData]);

  // ═══ AMAZON ADS INTELLIGENCE (from API sync data) ═══
  const amazonAdsInsights = useMemo(() => {
    const intel = { hasData: false, wastedSpend: [], topWinners: [], topCampaigns: [], skuPerformance: [], placementInsights: null, negativeKeywords: [], summary: null, dateRange: { earliest: null, latest: null, daysAvailable: 0 } };
    if (!adsIntelData) return intel;
    
    // Read from BOTH formats: nested (amazon.sp_search_terms.records) AND flat (_apiSpSearchTerms)
    const amz = adsIntelData.amazon || {};
    const getRecords = (nestedKey, flatKey) => {
      const nested = amz[nestedKey]?.records;
      const flat = adsIntelData[flatKey];
      if (nested?.length) return nested;
      if (Array.isArray(flat) && flat.length) return flat;
      return [];
    };
    
    const spSearchTerms = getRecords('sp_search_terms', '_apiSpSearchTerms');
    const spCampaignsRaw = getRecords('sp_campaigns', '_apiSpCampaigns');
    const spCampaigns = spCampaignsRaw.length ? spCampaignsRaw : getRecords('sp_campaigns', '_apiDailyOverview');
    const spAdvertised = getRecords('sp_advertised_product', '_apiSpAdvertised');
    const spPlacement = getRecords('sp_placement', '_apiSpPlacement');
    const spTargeting = getRecords('sp_targeting', '_apiSpTargeting');
    
    // If nothing at all, bail
    if (!spSearchTerms.length && !spCampaigns.length && !spAdvertised.length && !spPlacement.length) return intel;
    
    // Date range filter
    const cutoffDate = intelDateRange === 'all' ? null : (() => {
      const d = new Date(); d.setDate(d.getDate() - intelDateRange); return d.toISOString().slice(0, 10);
    })();
    const inRange = (r) => {
      if (!cutoffDate) return true;
      const d = r['Date'] || r['date'] || '';
      return d >= cutoffDate;
    };
    
    // Detect date range of available data
    const allDates = new Set();
    [spSearchTerms, spCampaigns, spAdvertised, spPlacement, spTargeting].forEach(arr => {
      arr.forEach(r => { const d = r['Date'] || r['date']; if (d) allDates.add(d); });
    });
    if (allDates.size > 0) {
      const sorted = [...allDates].sort();
      intel.dateRange.earliest = sorted[0];
      intel.dateRange.latest = sorted[sorted.length - 1];
      intel.dateRange.daysAvailable = sorted.length;
    }
    
    // --- Search Terms Analysis ---
    const searchTerms = spSearchTerms.filter(inRange);
    if (searchTerms.length > 0) {
      intel.hasData = true;
      // Aggregate by search term (API gives daily rows)
      const termMap = {};
      searchTerms.forEach(r => {
        const term = r['Customer Search Term'] || '';
        if (!term) return;
        if (!termMap[term]) termMap[term] = { term, spend: 0, sales: 0, clicks: 0, impressions: 0, orders: 0 };
        termMap[term].spend += Number(r['Spend'] || 0);
        termMap[term].sales += Number(r['7 Day Total Sales'] || 0);
        termMap[term].clicks += Number(r['Clicks'] || 0);
        termMap[term].impressions += Number(r['Impressions'] || 0);
        termMap[term].orders += Number(r['7 Day Total Orders (#)'] || 0);
      });
      const terms = Object.values(termMap);
      
      // Wasted spend: $5+ spend, zero sales
      intel.wastedSpend = terms
        .filter(t => t.spend >= 5 && t.sales === 0)
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 10);
      
      // Top winners: highest ROAS with meaningful spend
      intel.topWinners = terms
        .filter(t => t.spend >= 3 && t.sales > 0)
        .map(t => ({ ...t, roas: t.sales / t.spend, acos: t.spend / t.sales * 100 }))
        .sort((a, b) => b.roas - a.roas)
        .slice(0, 10);
      
      // Negative keyword candidates: 10+ clicks, zero orders
      intel.negativeKeywords = terms
        .filter(t => t.clicks >= 10 && t.orders === 0)
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 10);
      
      // Summary
      const totalSearchSpend = terms.reduce((s, t) => s + t.spend, 0);
      const totalSearchSales = terms.reduce((s, t) => s + t.sales, 0);
      const wastedTotal = intel.wastedSpend.reduce((s, t) => s + t.spend, 0);
      intel.summary = {
        totalTerms: terms.length,
        totalSpend: totalSearchSpend,
        totalSales: totalSearchSales,
        overallRoas: totalSearchSpend > 0 ? totalSearchSales / totalSearchSpend : 0,
        wastedTotal,
        wastedPct: totalSearchSpend > 0 ? (wastedTotal / totalSearchSpend) * 100 : 0
      };
    }
    
    // --- Campaign Analysis ---
    // campaignSummary is pre-aggregated across all dates (not date-filterable)
    // dailyOverview rows can supplement if they have campaign names
    const campaignSummaryData = adsIntelData.campaignSummary;
    if (Array.isArray(campaignSummaryData) && campaignSummaryData.length > 0) {
      intel.hasData = true;
      intel.topCampaigns = campaignSummaryData
        .filter(c => c.spend > 0)
        .map(c => ({
          name: c.name || '',
          type: c.type || 'SP',
          status: c.status || '',
          spend: c.spend || 0,
          sales: c.revenue || 0,
          clicks: c.clicks || 0,
          impressions: c.impressions || 0,
          orders: c.orders || 0,
          roas: c.roas || (c.spend > 0 ? (c.revenue || 0) / c.spend : 0),
          acos: c.acos || (c.revenue > 0 ? (c.spend / c.revenue) * 100 : 999),
        }))
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 12);
    } else {
      // Fallback: try daily campaign rows
      const dailyOverview = spCampaigns.filter(inRange);
      if (dailyOverview.length > 0) {
        intel.hasData = true;
        const campMap = {};
        dailyOverview.forEach(r => {
          const name = r['Campaign Name'] || r['campaignName'] || '';
          if (!name) return;
          if (!campMap[name]) campMap[name] = { name, spend: 0, sales: 0, clicks: 0, impressions: 0, orders: 0 };
          campMap[name].spend += Number(r['Spend'] || r['spend'] || 0);
          campMap[name].sales += Number(r['Sales'] || r['sales'] || r['7 Day Total Sales'] || 0);
          campMap[name].clicks += Number(r['Clicks'] || r['clicks'] || 0);
          campMap[name].impressions += Number(r['Impressions'] || r['impressions'] || 0);
          campMap[name].orders += Number(r['Orders'] || r['orders'] || r['7 Day Total Orders (#)'] || 0);
        });
        intel.topCampaigns = Object.values(campMap)
          .filter(c => c.spend > 0)
          .map(c => ({ ...c, roas: c.spend > 0 ? c.sales / c.spend : 0, acos: c.sales > 0 ? (c.spend / c.sales) * 100 : 999 }))
          .sort((a, b) => b.spend - a.spend)
          .slice(0, 12);
      }
    }
    
    // --- SKU Performance ---
    // Try daily rows first (date-filterable), then fall back to pre-aggregated skuAdPerformance
    const skuData = spAdvertised.filter(inRange);
    if (skuData.length > 0) {
      intel.hasData = true;
      const skuMap = {};
      skuData.forEach(r => {
        const sku = r['Advertised SKU'] || r['SKU'] || '';
        if (!sku) return;
        if (!skuMap[sku]) skuMap[sku] = { sku, asin: r['Advertised ASIN'] || '', spend: 0, sales: 0, clicks: 0, impressions: 0, orders: 0 };
        skuMap[sku].spend += Number(r['Spend'] || 0);
        skuMap[sku].sales += Number(r['7 Day Total Sales'] || 0);
        skuMap[sku].clicks += Number(r['Clicks'] || 0);
        skuMap[sku].impressions += Number(r['Impressions'] || 0);
        skuMap[sku].orders += Number(r['7 Day Total Orders (#)'] || r['7 Day Total Units (#)'] || 0);
      });
      intel.skuPerformance = Object.values(skuMap)
        .filter(s => s.spend > 0)
        .map(s => ({ ...s, roas: s.spend > 0 ? s.sales / s.spend : 0, acos: s.sales > 0 ? (s.spend / s.sales) * 100 : 999 }))
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 10);
    } else if (Array.isArray(adsIntelData.skuAdPerformance) && adsIntelData.skuAdPerformance.length > 0) {
      // Fallback: pre-aggregated SKU data from API
      intel.hasData = true;
      intel.skuPerformance = adsIntelData.skuAdPerformance
        .filter(s => s.spend > 0)
        .map(s => ({
          sku: s.sku || '',
          asin: s.asin || '',
          spend: s.spend || 0,
          sales: s.revenue || s.sales || 0,
          clicks: s.clicks || 0,
          impressions: s.impressions || 0,
          orders: s.orders || 0,
          roas: s.roas || (s.spend > 0 ? (s.revenue || s.sales || 0) / s.spend : 0),
          acos: s.acos || (s.revenue > 0 ? (s.spend / s.revenue) * 100 : 999),
        }))
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 10);
    }
    
    // --- Placement Insights ---
    const placementData = spPlacement.filter(inRange);
    if (placementData.length > 0) {
      intel.hasData = true;
      const placeMap = {};
      placementData.forEach(r => {
        const place = r['Placement'] || '';
        if (!place) return;
        if (!placeMap[place]) placeMap[place] = { placement: place, spend: 0, sales: 0, clicks: 0, impressions: 0 };
        placeMap[place].spend += Number(r['Spend'] || 0);
        placeMap[place].sales += Number(r['7 Day Total Sales'] || 0);
        placeMap[place].clicks += Number(r['Clicks'] || 0);
        placeMap[place].impressions += Number(r['Impressions'] || 0);
      });
      const placements = Object.values(placeMap).map(p => ({
        ...p, roas: p.spend > 0 ? p.sales / p.spend : 0, cpc: p.clicks > 0 ? p.spend / p.clicks : 0, ctr: p.impressions > 0 ? (p.clicks / p.impressions) * 100 : 0
      }));
      intel.placementInsights = placements;
    }
    
    return intel;
  }, [adsIntelData, intelDateRange]);

  // Period navigation constants
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const availableYears = [...new Set([...sortedWeeks, ...sortedDays].map(d => parseInt(d.slice(0, 4))))].filter(Boolean).sort();
  if (availableYears.length === 0) availableYears.push(today.getFullYear());
  const weeksInYear = sortedWeeks.filter(w => w.startsWith(String(adsYear)));
  const daysInMonth = sortedDays.filter(d => { const dt = new Date(d+'T00:00:00'); return dt.getMonth() === adsMonth && dt.getFullYear() === adsYear; });

  if (adsTimeTab === 'daily' && !adsSelectedDay && sortedDays.length > 0)
    setTimeout(() => setAdsSelectedDay(sortedDays[sortedDays.length - 1]), 0);

  // ── Aggregation helpers ──
  const aggregateDailyData = (days) => days.reduce((acc, d) => {
    const day = allDaysData[d]; if (!day) return acc;
    const gAds = day.shopify?.googleSpend || day.googleSpend || day.googleAds || 0;
    const mAds = day.shopify?.metaSpend || day.metaSpend || day.metaAds || 0;
    const aAds = day.amazon?.adSpend || day.amazonAdsMetrics?.spend || 0;
    const am = day.shopify?.adsMetrics || {};
    const gI = am.googleImpressions||0, mI = am.metaImpressions||0;
    const gC = am.googleClicks||0, mC = am.metaClicks||0;
    const gCv = am.googleConversions||0, mP = am.metaPurchases||day.metaConversions||0;
    const mPV = am.metaPurchaseValue||0;
    const amz = day.amazonAdsMetrics||{};
    const aI = amz.impressions||0, aC = amz.clicks||0, aCv = amz.conversions||0;
    const sR = day.shopify?.revenue||0, aR = day.amazon?.revenue||0;
    return {
      googleAds:acc.googleAds+gAds, metaAds:acc.metaAds+mAds, amazonAds:acc.amazonAds+aAds,
      totalAds:acc.totalAds+gAds+mAds+aAds,
      googleImpressions:acc.googleImpressions+gI, metaImpressions:acc.metaImpressions+mI,
      amazonImpressions:acc.amazonImpressions+aI,
      totalImpressions:acc.totalImpressions+gI+mI+aI,
      googleClicks:acc.googleClicks+gC, metaClicks:acc.metaClicks+mC, amazonClicks:acc.amazonClicks+aC,
      totalClicks:acc.totalClicks+gC+mC+aC,
      googleConversions:acc.googleConversions+gCv, metaPurchases:acc.metaPurchases+mP,
      amazonConversions:acc.amazonConversions+aCv, metaPurchaseValue:acc.metaPurchaseValue+mPV,
      shopifyRev:acc.shopifyRev+sR, amazonRev:acc.amazonRev+aR, totalRev:acc.totalRev+sR+aR,
      count:acc.count+1,
    };
  }, {googleAds:0,metaAds:0,amazonAds:0,totalAds:0,googleImpressions:0,metaImpressions:0,amazonImpressions:0,totalImpressions:0,googleClicks:0,metaClicks:0,amazonClicks:0,totalClicks:0,googleConversions:0,metaPurchases:0,amazonConversions:0,metaPurchaseValue:0,shopifyRev:0,amazonRev:0,totalRev:0,count:0});

  const aggregateWeeklyData = (weeks) => weeks.reduce((acc, w) => {
    const week = allWeeksData[w]; if (!week) return acc;
    const amzAds = week.amazon?.adSpend||0, amzRev = week.amazon?.revenue||0;
    let mAds = week.shopify?.metaAds||week.shopify?.metaSpend||0;
    let gAds = week.shopify?.googleAds||week.shopify?.googleSpend||0;
    if (mAds===0 && gAds===0) {
      const we=new Date(w+'T00:00:00'), ws=new Date(we); ws.setDate(ws.getDate()-6);
      sortedDays.filter(d=>{const dt=new Date(d+'T00:00:00');return dt>=ws&&dt<=we;}).forEach(d=>{
        const dy=allDaysData[d]; mAds+=dy?.shopify?.metaSpend||dy?.metaSpend||dy?.metaAds||0;
        gAds+=dy?.shopify?.googleSpend||dy?.googleSpend||dy?.googleAds||0;
      });
    }
    const shopAds=(mAds+gAds)>0?(mAds+gAds):(week.shopify?.adSpend||0);
    const shopRev=week.shopify?.revenue||0, totalRev=week.total?.revenue||(amzRev+shopRev);
    return { amzAds:acc.amzAds+amzAds, amzRev:acc.amzRev+amzRev, metaAds:acc.metaAds+mAds,
      googleAds:acc.googleAds+gAds, shopAds:acc.shopAds+shopAds, shopRev:acc.shopRev+shopRev,
      totalAds:acc.totalAds+amzAds+shopAds, totalRev:acc.totalRev+totalRev, count:acc.count+1 };
  }, {amzAds:0,amzRev:0,metaAds:0,googleAds:0,shopAds:0,shopRev:0,totalAds:0,totalRev:0,count:0});

  // Period selectors
  const getWeeksForPeriod = () => {
    if (adsTimeTab==='weekly') return adsSelectedWeek?[adsSelectedWeek]:[];
    if (adsTimeTab==='monthly') { const ms=new Date(adsYear,adsMonth,1),me=new Date(adsYear,adsMonth+1,0); return sortedWeeks.filter(w=>{const d=new Date(w+'T00:00:00');return d>=ms&&d<=me;}); }
    if (adsTimeTab==='quarterly') { const qs=new Date(adsYear,(adsQuarter-1)*3,1),qe=new Date(adsYear,adsQuarter*3,0); return sortedWeeks.filter(w=>{const d=new Date(w+'T00:00:00');return d>=qs&&d<=qe;}); }
    if (adsTimeTab==='yearly') return weeksInYear;
    return weeksInYear.slice(-4);
  };
  const getDaysForPeriod = () => {
    if (adsTimeTab==='daily') return adsSelectedDay?[adsSelectedDay]:sortedDays.length>0?[sortedDays[sortedDays.length-1]]:[];
    if (adsTimeTab==='weekly') { if (adsSelectedWeek) { const we=new Date(adsSelectedWeek+'T00:00:00'),ws=new Date(we);ws.setDate(ws.getDate()-6); return sortedDays.filter(d=>{const dt=new Date(d+'T00:00:00');return dt>=ws&&dt<=we;}); } const sda=new Date(today);sda.setDate(sda.getDate()-7); return sortedDays.filter(d=>{const dt=new Date(d+'T00:00:00');return dt>=sda&&dt<=today;}); }
    return daysInMonth;
  };

  const periodWeeks = getWeeksForPeriod();
  const periodDays = getDaysForPeriod();
  const weeklyTotals = aggregateWeeklyData(periodWeeks);
  const dailyTotals = aggregateDailyData(periodDays);
  const useDailyData = adsTimeTab === 'daily' || adsTimeTab === 'weekly';
  const hasDailyMG = dailyTotals.metaAds>0||dailyTotals.googleAds>0;
  const hasWeeklyMG = weeklyTotals.metaAds>0||weeklyTotals.googleAds>0;

  const totals = useDailyData ? {
    ...dailyTotals, amzAds:dailyTotals.amazonAds||0, amzRev:dailyTotals.amazonRev||0,
    shopAds:dailyTotals.googleAds+dailyTotals.metaAds, shopRev:dailyTotals.shopifyRev||0, totalRev:dailyTotals.totalRev||0
  } : {
    ...weeklyTotals,
    metaAds:hasDailyMG&&!hasWeeklyMG?dailyTotals.metaAds:weeklyTotals.metaAds,
    googleAds:hasDailyMG&&!hasWeeklyMG?dailyTotals.googleAds:weeklyTotals.googleAds,
    shopAds:hasDailyMG&&!hasWeeklyMG?(dailyTotals.metaAds+dailyTotals.googleAds):weeklyTotals.shopAds,
    totalAds:hasDailyMG&&!hasWeeklyMG?(weeklyTotals.amzAds+dailyTotals.metaAds+dailyTotals.googleAds):weeklyTotals.totalAds,
  };

  const totalTacos = totals.totalRev>0?(totals.totalAds/totals.totalRev)*100:0;
  const amzTacos = totals.amzRev>0?(totals.amzAds/totals.amzRev)*100:0;
  const cpc = dailyTotals.totalClicks>0?dailyTotals.totalAds/dailyTotals.totalClicks:0;
  const ctr = dailyTotals.totalImpressions>0?(dailyTotals.totalClicks/dailyTotals.totalImpressions)*100:0;
  const tacosColor = (t) => t<=15?'text-emerald-400':t<=25?'text-amber-400':'text-rose-400';

  const getPeriodLabel = () => {
    if (adsTimeTab==='daily' && periodDays.length===1) return new Date(periodDays[0]+'T00:00:00').toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',year:'numeric'});
    if (adsTimeTab==='weekly') return `Last 7 Days (${periodDays.length} days with data)`;
    if (adsTimeTab==='monthly') return `${monthNames[adsMonth]} ${adsYear}`;
    if (adsTimeTab==='quarterly') return `Q${adsQuarter} ${adsYear}`;
    if (adsTimeTab==='yearly') return `${adsYear} Full Year`;
    return '';
  };
  const goToPrev = () => {
    if (adsTimeTab==='daily'){const i=sortedDays.indexOf(adsSelectedDay);if(i>0)setAdsSelectedDay(sortedDays[i-1]);}
    else if(adsTimeTab==='monthly'){if(adsMonth===0){setAdsMonth(11);setAdsYear(adsYear-1);}else setAdsMonth(adsMonth-1);}
    else if(adsTimeTab==='weekly'){const i=weeksInYear.indexOf(adsSelectedWeek);if(i>0)setAdsSelectedWeek(weeksInYear[i-1]);}
    else if(adsTimeTab==='quarterly'){if(adsQuarter===1){setAdsQuarter(4);setAdsYear(adsYear-1);}else setAdsQuarter(adsQuarter-1);}
    else if(adsTimeTab==='yearly')setAdsYear(adsYear-1);
  };
  const goToNext = () => {
    if(adsTimeTab==='daily'){const i=sortedDays.indexOf(adsSelectedDay);if(i<sortedDays.length-1)setAdsSelectedDay(sortedDays[i+1]);}
    else if(adsTimeTab==='monthly'){if(adsMonth===11){setAdsMonth(0);setAdsYear(adsYear+1);}else setAdsMonth(adsMonth+1);}
    else if(adsTimeTab==='weekly'){const i=weeksInYear.indexOf(adsSelectedWeek);if(i<weeksInYear.length-1)setAdsSelectedWeek(weeksInYear[i+1]);}
    else if(adsTimeTab==='quarterly'){if(adsQuarter===4){setAdsQuarter(1);setAdsYear(adsYear+1);}else setAdsQuarter(adsQuarter+1);}
    else if(adsTimeTab==='yearly')setAdsYear(adsYear+1);
  };
  const monthsWithData = [...new Set([...sortedWeeks,...sortedDays,...Object.keys(historicalDaily)].filter(d=>d.startsWith(String(adsYear))).map(d=>new Date(d+'T00:00:00').getMonth()))].sort((a,b)=>a-b);

  // Table data
  const weeklyTableData = periodWeeks.map(w => {
    const week=allWeeksData[w]; const amzAds=week?.amazon?.adSpend||0;
    let mAds=week?.shopify?.metaAds||week?.shopify?.metaSpend||0, gAds=week?.shopify?.googleAds||week?.shopify?.googleSpend||0;
    if(mAds===0&&gAds===0){const we=new Date(w+'T00:00:00'),ws=new Date(we);ws.setDate(ws.getDate()-6);sortedDays.filter(d=>{const dt=new Date(d+'T00:00:00');return dt>=ws&&dt<=we;}).forEach(d=>{const dy=allDaysData[d];mAds+=dy?.shopify?.metaSpend||dy?.metaSpend||dy?.metaAds||0;gAds+=dy?.shopify?.googleSpend||dy?.googleSpend||dy?.googleAds||0;});}
    const totalAds=amzAds+mAds+gAds, totalRev=week?.total?.revenue||0;
    return {week:w,amzAds,metaAds:mAds,googleAds:gAds,totalAds,totalRev,tacos:totalRev>0?(totalAds/totalRev)*100:0};
  });
  const dailyTableData = (useDailyData?periodDays:daysInMonth).map(d => {
    const day=allDaysData[d]; const gAds=day?.shopify?.googleSpend||day?.googleSpend||day?.googleAds||0;
    const mAds=day?.shopify?.metaSpend||day?.metaSpend||day?.metaAds||0;
    const aAds=day?.amazon?.adSpend||0; const am=day?.shopify?.adsMetrics||{};
    const sR=day?.shopify?.revenue||0, aR=day?.amazon?.revenue||0;
    return {date:d,googleAds:gAds,metaAds:mAds,amazonAds:aAds,totalAds:gAds+mAds+aAds,
      googleImpressions:am.googleImpressions||0,metaImpressions:am.metaImpressions||0,
      impressions:(am.googleImpressions||0)+(am.metaImpressions||0),
      googleClicks:am.googleClicks||0,metaClicks:am.metaClicks||0,
      clicks:(am.googleClicks||0)+(am.metaClicks||0),
      googleConversions:am.googleConversions||0,metaPurchases:am.metaPurchases||0,
      conversions:(am.googleConversions||0)+(am.metaPurchases||0),
      metaPurchaseValue:am.metaPurchaseValue||0,shopifyRev:sR,amazonRev:aR,totalRev:sR+aR};
  });

  // Upload handler
  const handleFileDrop = useCallback(async (fileList) => {
    if (!fileList||fileList.length===0) return;
    if (!processAdsUpload) { setToast({message:'Upload handler not available — update App.jsx',type:'error'}); return; }
    setUploadStatus({processing:true,results:null,error:null});
    try {
      const result = await processAdsUpload(Array.from(fileList));
      setUploadStatus({processing:false,results:result,error:null});
      const {summary}=result;
      if(summary.tier1>0||summary.tier2>0) setToast({message:`Processed ${summary.totalFiles} reports: ${summary.tier1} daily KPIs, ${summary.tier2} deep analysis${summary.unrecognized>0?`, ${summary.unrecognized} unrecognized`:''}`,type:'success'});
      else if(summary.unrecognized>0) setToast({message:`${summary.unrecognized} file(s) not recognized`,type:'warning'});
    } catch(err) { setUploadStatus({processing:false,results:null,error:err.message}); setToast({message:`Upload error: ${err.message}`,type:'error'}); }
  }, [processAdsUpload, setToast]);

  const handleDragOver=(e)=>{e.preventDefault();e.stopPropagation();setIsDragging(true);};
  const handleDragLeave=(e)=>{e.preventDefault();e.stopPropagation();setIsDragging(false);};
  const handleDrop=(e)=>{e.preventDefault();e.stopPropagation();setIsDragging(false);handleFileDrop(e.dataTransfer.files);};

  // ═══════════════════════════════════════════════════════════════════
  // RENDER — continued in next section via str_replace append
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-slate-950 p-4 lg:p-6">
      <div className="max-w-7xl mx-auto">{globalModals}
        <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />
        {dataBar}

        {/* HEADER */}
        <div className="mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-white mb-1">📊 Advertising Command Center</h1>
              <p className="text-slate-400">{sortedDays.length>0?`${sortedDays.length} days data`:'No daily data'}{hasCampaignData?` • ${campaigns.length} campaigns`:''}{tier2Summary.count>0?` • ${tier2Summary.count} deep reports loaded`:''}</p>
            </div>
            <button onClick={()=>setShowAdsAIChat(true)} className="px-4 py-2.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 rounded-xl text-white flex items-center gap-2 font-medium shadow-lg shadow-orange-500/20">
              <Zap className="w-4 h-4"/>Ask AI
            </button>
          </div>
        </div>

        {/* QUICK INSIGHTS */}
        {quickInsights.length>0 && adsViewMode==='overview' && (
          <div className="bg-gradient-to-r from-slate-800/80 to-slate-800/40 rounded-2xl border border-slate-700 p-4 mb-6">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">⚡ Quick Insights</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {quickInsights.map((ins,i)=>(
                <div key={i} className={`flex items-start gap-3 p-3 rounded-xl ${ins.type==='warning'?'bg-amber-900/20 border border-amber-500/30':ins.type==='opportunity'?'bg-emerald-900/20 border border-emerald-500/30':'bg-blue-900/20 border border-blue-500/30'}`}>
                  <span className="text-xl">{ins.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm">{ins.text}</p>
                    {ins.action&&<button onClick={()=>{setAdsAiInput(ins.action);setShowAdsAIChat(true);}} className="text-xs text-orange-400 hover:text-orange-300 mt-1">→ {ins.action}</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB BAR */}
        <div className="flex gap-2 mb-6 p-1 bg-slate-800/50 rounded-xl overflow-x-auto">
          <button onClick={()=>setAdsViewMode('overview')} className={`flex-1 min-w-fit px-4 py-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${adsViewMode==='overview'?'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg':'text-slate-300 hover:bg-slate-700'}`}><BarChart3 className="w-4 h-4"/>Overview</button>
          <button onClick={()=>setAdsViewMode('upload')} className={`flex-1 min-w-fit px-4 py-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${adsViewMode==='upload'?'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg':'text-slate-300 hover:bg-slate-700'}`}><Upload className="w-4 h-4"/>Upload{tier2Summary.count>0&&<span className="px-1.5 py-0.5 bg-white/20 rounded text-xs">{tier2Summary.count}</span>}</button>
          <button onClick={()=>setAdsViewMode('analysis')} className={`flex-1 min-w-fit px-4 py-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${adsViewMode==='analysis'?'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg':'text-slate-300 hover:bg-slate-700'}`}><Search className="w-4 h-4"/>Deep Analysis</button>
          <button onClick={()=>setAdsViewMode('reports')} className={`flex-1 min-w-fit px-4 py-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${adsViewMode==='reports'?'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-lg':'text-slate-300 hover:bg-slate-700'}`}><Brain className="w-4 h-4"/>AI Reports</button>
        </div>

        {/* ═══ OVERVIEW TAB ═══ */}
        {adsViewMode==='overview' && (<>
          <div className="flex gap-2 mb-4 p-1 bg-slate-800/50 rounded-xl overflow-x-auto">
            <button onClick={()=>setAdsTimeTab('daily')} disabled={!hasDailyData} className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${adsTimeTab==='daily'?'bg-cyan-600 text-white':'text-slate-300 hover:bg-slate-700 disabled:opacity-40'}`}>Daily</button>
            {['weekly','monthly','quarterly','yearly'].map(t=>(<button key={t} onClick={()=>setAdsTimeTab(t)} className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium text-sm transition-all capitalize ${adsTimeTab===t?(t==='weekly'?'bg-violet-600':t==='monthly'?'bg-blue-600':t==='quarterly'?'bg-teal-600':'bg-amber-600')+' text-white':'text-slate-300 hover:bg-slate-700'}`}>{t}</button>))}
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="flex items-center gap-2"><span className="text-slate-400 text-sm">Year:</span>
              <select value={adsYear} onChange={e=>setAdsYear(parseInt(e.target.value))} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm">{availableYears.map(y=><option key={y} value={y}>{y}</option>)}</select></div>
            {adsTimeTab==='monthly'&&<div className="flex items-center gap-2"><span className="text-slate-400 text-sm">Month:</span><select value={adsMonth} onChange={e=>setAdsMonth(parseInt(e.target.value))} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm">{monthNames.map((m,i)=><option key={i} value={i} disabled={!monthsWithData.includes(i)}>{m}</option>)}</select></div>}
            {adsTimeTab==='daily'&&sortedDays.length>0&&<div className="flex items-center gap-2"><span className="text-slate-400 text-sm">Day:</span><select value={adsSelectedDay||''} onChange={e=>setAdsSelectedDay(e.target.value)} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm">{sortedDays.slice().reverse().slice(0,90).map(d=><option key={d} value={d}>{new Date(d+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'})}</option>)}</select></div>}
            {adsTimeTab==='weekly'&&weeksInYear.length>0&&<div className="flex items-center gap-2"><span className="text-slate-400 text-sm">Week:</span><select value={adsSelectedWeek||''} onChange={e=>setAdsSelectedWeek(e.target.value)} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm">{weeksInYear.slice().reverse().map(w=><option key={w} value={w}>{new Date(w+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</option>)}</select></div>}
            {adsTimeTab==='quarterly'&&<div className="flex items-center gap-2"><span className="text-slate-400 text-sm">Quarter:</span><select value={adsQuarter} onChange={e=>setAdsQuarter(parseInt(e.target.value))} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm">{[1,2,3,4].map(q=><option key={q} value={q}>Q{q}</option>)}</select></div>}
            <div className="flex items-center gap-1 ml-auto">
              <button onClick={goToPrev} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white"><ChevronLeft className="w-4 h-4"/></button>
              <button onClick={goToNext} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white"><ChevronRight className="w-4 h-4"/></button>
            </div>
          </div>

          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">{getPeriodLabel()}</h2>
            <span className="text-slate-400 text-sm">{useDailyData?`${periodDays.length} day${periodDays.length!==1?'s':''}`:`${periodWeeks.length} week${periodWeeks.length!==1?'s':''}`}</span>
          </div>

          {/* KPI CARDS */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <div className="bg-gradient-to-br from-purple-900/30 to-slate-800/50 rounded-xl border border-purple-500/30 p-4"><p className="text-slate-400 text-xs uppercase">Total Spend</p><p className="text-2xl font-bold text-white">{formatCurrency(useDailyData?dailyTotals.totalAds:totals.totalAds)}</p></div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4"><p className="text-slate-400 text-xs uppercase">Impressions</p><p className="text-2xl font-bold text-white">{formatNumber(dailyTotals.totalImpressions)}</p></div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4"><p className="text-slate-400 text-xs uppercase">Clicks</p><p className="text-2xl font-bold text-white">{formatNumber(dailyTotals.totalClicks)}</p><p className="text-slate-500 text-xs mt-1">CTR: {ctr.toFixed(2)}%</p></div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4"><p className="text-slate-400 text-xs uppercase">Conversions</p><p className="text-2xl font-bold text-white">{formatNumber(dailyTotals.googleConversions+dailyTotals.metaPurchases+dailyTotals.amazonConversions)}</p></div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4"><p className="text-slate-400 text-xs uppercase">Avg CPC</p><p className={`text-2xl font-bold ${cpc<1.5?'text-emerald-400':cpc<2.5?'text-amber-400':'text-rose-400'}`}>{formatCurrency(cpc)}</p></div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4"><p className="text-slate-400 text-xs uppercase">Revenue</p><p className="text-2xl font-bold text-emerald-400">{formatCurrency(useDailyData?dailyTotals.totalRev:totals.totalRev)}</p><p className="text-slate-500 text-xs mt-1">TACOS: <span className={tacosColor(totalTacos)}>{totalTacos>0?totalTacos.toFixed(1)+'%':'—'}</span></p></div>
          </div>

          {/* PLATFORM CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gradient-to-br from-orange-900/20 to-slate-800/50 rounded-xl border border-orange-500/30 p-4">
              <div className="flex items-center justify-between mb-3"><h4 className="text-orange-400 font-semibold flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-orange-500"/>Amazon</h4><span className="text-white font-bold">{formatCurrency(totals.amzAds||dailyTotals.amazonAds)}</span></div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><p className="text-slate-500">Revenue</p><p className="text-emerald-400 font-medium">{formatCurrency(totals.amzRev||dailyTotals.amazonRev)}</p></div>
                <div><p className="text-slate-500">TACOS</p><p className={`font-medium ${tacosColor(amzTacos)}`}>{amzTacos>0?amzTacos.toFixed(1)+'%':'—'}</p></div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-red-900/20 to-slate-800/50 rounded-xl border border-red-500/30 p-4">
              <div className="flex items-center justify-between mb-3"><h4 className="text-red-400 font-semibold flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500"/>Google</h4><span className="text-white font-bold">{formatCurrency(totals.googleAds||dailyTotals.googleAds)}</span></div>
              {(dailyTotals.googleAds>0||dailyTotals.googleImpressions>0)?<div className="grid grid-cols-3 gap-2 text-xs">
                <div><p className="text-slate-500">Impr.</p><p className="text-white font-medium">{formatNumber(dailyTotals.googleImpressions)}</p></div>
                <div><p className="text-slate-500">Clicks</p><p className="text-white font-medium">{formatNumber(dailyTotals.googleClicks)}</p></div>
                <div><p className="text-slate-500">Conv.</p><p className="text-emerald-400 font-medium">{dailyTotals.googleConversions}</p></div>
              </div>:<p className="text-slate-500 text-xs">No data • <button onClick={()=>setAdsViewMode('upload')} className="text-red-400 hover:underline">Upload</button></p>}
            </div>
            <div className="bg-gradient-to-br from-blue-900/20 to-slate-800/50 rounded-xl border border-blue-500/30 p-4">
              <div className="flex items-center justify-between mb-3"><h4 className="text-blue-400 font-semibold flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-500"/>Meta</h4><span className="text-white font-bold">{formatCurrency(totals.metaAds||dailyTotals.metaAds)}</span></div>
              {(dailyTotals.metaAds>0||dailyTotals.metaImpressions>0)?<div className="grid grid-cols-3 gap-2 text-xs">
                <div><p className="text-slate-500">Impr.</p><p className="text-white font-medium">{formatNumber(dailyTotals.metaImpressions)}</p></div>
                <div><p className="text-slate-500">Clicks</p><p className="text-white font-medium">{formatNumber(dailyTotals.metaClicks)}</p></div>
                <div><p className="text-slate-500">Purchases</p><p className="text-emerald-400 font-medium">{formatNumber(Math.round(dailyTotals.metaPurchases))}</p></div>
              </div>:<p className="text-slate-500 text-xs">No data • <button onClick={()=>setAdsViewMode('upload')} className="text-blue-400 hover:underline">Upload</button></p>}
            </div>
          </div>

          {/* ═══ AMAZON ADS INTELLIGENCE ═══ */}
          {amazonAdsInsights.hasData && (
            <div className="mb-6 space-y-4">
              <div className="flex items-center justify-between">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="text-lg font-bold text-white flex items-center gap-2"><Flame className="w-5 h-5 text-orange-400"/>Amazon Ads Intelligence</h2>
                <div className="flex items-center gap-2">
                  {[7, 14, 30, 60, 90, 'all'].map(range => (
                    <button key={range} onClick={() => setIntelDateRange(range)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${intelDateRange === range ? 'bg-orange-600 text-white shadow-lg shadow-orange-500/20' : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white'}`}>
                      {range === 'all' ? 'All' : `${range}d`}
                    </button>
                  ))}
                </div>
              </div>
              {amazonAdsInsights.dateRange.earliest && (
                <p className="text-xs text-slate-500 mt-1">
                  {intelDateRange === 'all' ? `All data: ${amazonAdsInsights.dateRange.earliest} → ${amazonAdsInsights.dateRange.latest}` : `Last ${intelDateRange} days`}
                  {amazonAdsInsights.summary ? ` · ${amazonAdsInsights.summary.totalTerms.toLocaleString()} search terms` : ''}
                  {` · ${amazonAdsInsights.dateRange.daysAvailable} days available`}
                </p>
              )}
              </div>
              
              {/* Alert Banner: Wasted Spend */}
              {amazonAdsInsights.summary && amazonAdsInsights.summary.wastedTotal > 10 && (
                <div className="bg-gradient-to-r from-red-900/30 to-amber-900/20 rounded-xl border border-red-500/40 p-4 flex items-center gap-4">
                  <div className="p-2 bg-red-500/20 rounded-lg"><ShieldAlert className="w-6 h-6 text-red-400"/></div>
                  <div className="flex-1">
                    <p className="text-white font-semibold">{formatCurrency(amazonAdsInsights.summary.wastedTotal)} wasted on zero-sale search terms</p>
                    <p className="text-slate-400 text-sm">{amazonAdsInsights.wastedSpend.length} terms with ${'>'}5 spend and no conversions — {amazonAdsInsights.summary.wastedPct.toFixed(1)}% of total search spend</p>
                  </div>
                  <button onClick={() => { setAdsAiInput('Analyze my wasted ad spend on search terms with zero sales. Which should be added as negative keywords?'); setShowAdsAIChat(true); }} className="px-3 py-2 bg-red-600/40 hover:bg-red-600/60 border border-red-500/30 rounded-lg text-red-300 text-xs font-medium whitespace-nowrap">AI Analysis →</button>
                </div>
              )}
              
              {/* Summary KPIs */}
              {amazonAdsInsights.summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-3">
                    <p className="text-slate-500 text-xs uppercase">Search ROAS</p>
                    <p className={`text-xl font-bold ${amazonAdsInsights.summary.overallRoas >= 4 ? 'text-emerald-400' : amazonAdsInsights.summary.overallRoas >= 2 ? 'text-amber-400' : 'text-rose-400'}`}>{amazonAdsInsights.summary.overallRoas.toFixed(2)}x</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-3">
                    <p className="text-slate-500 text-xs uppercase">Search ACOS</p>
                    <p className={`text-xl font-bold ${amazonAdsInsights.summary.overallRoas > 0 ? ((1/amazonAdsInsights.summary.overallRoas)*100 <= 25 ? 'text-emerald-400' : (1/amazonAdsInsights.summary.overallRoas)*100 <= 40 ? 'text-amber-400' : 'text-rose-400') : 'text-slate-400'}`}>{amazonAdsInsights.summary.overallRoas > 0 ? ((1/amazonAdsInsights.summary.overallRoas)*100).toFixed(1) + '%' : '—'}</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-3">
                    <p className="text-slate-500 text-xs uppercase">Ad Sales</p>
                    <p className="text-xl font-bold text-emerald-400">{formatCurrency(amazonAdsInsights.summary.totalSales)}</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-3">
                    <p className="text-slate-500 text-xs uppercase">Ad Spend</p>
                    <p className="text-xl font-bold text-white">{formatCurrency(amazonAdsInsights.summary.totalSpend)}</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Wasted Spend — Zero-Sale Search Terms */}
                {amazonAdsInsights.wastedSpend.length > 0 && (
                  <div className="bg-slate-800/30 rounded-xl border border-slate-700 p-4">
                    <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-400"/>Wasted Spend — Zero-Sale Terms</h3>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {amazonAdsInsights.wastedSpend.map((t, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 rounded-lg hover:bg-slate-700/30">
                          <span className="text-slate-500 w-5">{i + 1}.</span>
                          <span className="text-white flex-1 truncate" title={t.term}>{t.term}</span>
                          <span className="text-slate-400">{t.clicks} clicks</span>
                          <span className="text-red-400 font-semibold w-16 text-right">{formatCurrency(t.spend)}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-slate-500 text-xs mt-2 pt-2 border-t border-slate-700/50">💡 Consider adding these as negative keywords</p>
                  </div>
                )}

                {/* Top Winners — High ROAS Terms */}
                {amazonAdsInsights.topWinners.length > 0 && (
                  <div className="bg-slate-800/30 rounded-xl border border-slate-700 p-4">
                    <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4 text-emerald-400"/>Top Winners — Highest ROAS Terms</h3>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {amazonAdsInsights.topWinners.map((t, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 rounded-lg hover:bg-slate-700/30">
                          <span className="text-slate-500 w-5">{i + 1}.</span>
                          <span className="text-white flex-1 truncate" title={t.term}>{t.term}</span>
                          <span className="text-slate-400">{formatCurrency(t.spend)}</span>
                          <span className={`font-semibold w-14 text-right ${t.roas >= 5 ? 'text-emerald-400' : t.roas >= 3 ? 'text-cyan-400' : 'text-amber-400'}`}>{t.roas.toFixed(1)}x</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-slate-500 text-xs mt-2 pt-2 border-t border-slate-700/50">🚀 Scale budget on these winning terms</p>
                  </div>
                )}

                {/* Campaign Performance */}
                {amazonAdsInsights.topCampaigns.length > 0 && (
                  <div className="bg-slate-800/30 rounded-xl border border-slate-700 p-4">
                    <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><Target className="w-4 h-4 text-violet-400"/>Campaign Performance</h3>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {amazonAdsInsights.topCampaigns.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg hover:bg-slate-700/30">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.roas >= 3 ? 'bg-emerald-500' : c.roas >= 1.5 ? 'bg-amber-500' : 'bg-red-500'}`}/>
                          <span className="text-white flex-1 truncate" title={c.name}>{c.name}</span>
                          <span className="text-slate-400 w-16 text-right">{formatCurrency(c.spend)}</span>
                          <span className={`font-semibold w-12 text-right ${c.acos <= 25 ? 'text-emerald-400' : c.acos <= 40 ? 'text-amber-400' : 'text-rose-400'}`}>{c.acos < 999 ? c.acos.toFixed(0) + '%' : '—'}</span>
                          <span className={`font-semibold w-12 text-right ${c.roas >= 3 ? 'text-emerald-400' : c.roas >= 1.5 ? 'text-amber-400' : 'text-rose-400'}`}>{c.roas.toFixed(1)}x</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500 mt-2 pt-2 border-t border-slate-700/50">
                      <span>Sorted by spend</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"/>ROAS{'>'}3x</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"/>1.5-3x</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"/>{'<'}1.5x</span>
                    </div>
                  </div>
                )}

                {/* SKU Ad Performance */}
                {amazonAdsInsights.skuPerformance.length > 0 && (
                  <div className="bg-slate-800/30 rounded-xl border border-slate-700 p-4">
                    <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><DollarSign className="w-4 h-4 text-cyan-400"/>SKU Ad Performance</h3>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {amazonAdsInsights.skuPerformance.map((s, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg hover:bg-slate-700/30">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.roas >= 3 ? 'bg-emerald-500' : s.roas >= 1.5 ? 'bg-amber-500' : 'bg-red-500'}`}/>
                          <span className="text-white flex-1 truncate font-mono" title={s.sku}>{s.sku}</span>
                          <span className="text-slate-400 w-16 text-right">{formatCurrency(s.spend)}</span>
                          <span className="text-emerald-400 w-16 text-right">{formatCurrency(s.sales)}</span>
                          <span className={`font-semibold w-12 text-right ${s.acos <= 25 ? 'text-emerald-400' : s.acos <= 40 ? 'text-amber-400' : 'text-rose-400'}`}>{s.acos < 999 ? s.acos.toFixed(0) + '%' : '—'}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-2 pt-2 border-t border-slate-700/50">
                      <span>Cols: SKU · Spend · Sales · ACOS</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Placement Performance */}
              {amazonAdsInsights.placementInsights && amazonAdsInsights.placementInsights.length > 0 && (
                <div className="bg-slate-800/30 rounded-xl border border-slate-700 p-4">
                  <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-amber-400"/>Placement Performance</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {amazonAdsInsights.placementInsights.map((p, i) => {
                      const isTopSearch = /top/i.test(p.placement);
                      const isProduct = /product|detail/i.test(p.placement);
                      return (
                        <div key={i} className={`rounded-xl p-3 border ${isTopSearch ? 'bg-amber-900/15 border-amber-500/30' : isProduct ? 'bg-cyan-900/15 border-cyan-500/30' : 'bg-slate-800/50 border-slate-700'}`}>
                          <p className={`text-xs font-semibold uppercase mb-2 ${isTopSearch ? 'text-amber-400' : isProduct ? 'text-cyan-400' : 'text-slate-400'}`}>{p.placement}</p>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div><span className="text-slate-500">Spend</span><p className="text-white font-medium">{formatCurrency(p.spend)}</p></div>
                            <div><span className="text-slate-500">ROAS</span><p className={`font-bold ${p.roas >= 3 ? 'text-emerald-400' : p.roas >= 1.5 ? 'text-amber-400' : 'text-rose-400'}`}>{p.roas.toFixed(2)}x</p></div>
                            <div><span className="text-slate-500">CPC</span><p className="text-white">{formatCurrency(p.cpc)}</p></div>
                            <div><span className="text-slate-500">CTR</span><p className="text-white">{p.ctr.toFixed(2)}%</p></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Negative Keyword Opportunities */}
              {amazonAdsInsights.negativeKeywords.length > 0 && (
                <div className="bg-gradient-to-r from-slate-800/50 to-slate-800/30 rounded-xl border border-amber-500/20 p-4">
                  <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400"/>Negative Keyword Opportunities <span className="text-xs font-normal text-slate-500">— 10+ clicks, zero orders</span></h3>
                  <div className="flex flex-wrap gap-2">
                    {amazonAdsInsights.negativeKeywords.map((t, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-700/50 rounded-lg text-xs border border-slate-600/50">
                        <span className="text-white">{t.term}</span>
                        <span className="text-red-400">{formatCurrency(t.spend)}</span>
                        <span className="text-slate-500">{t.clicks}c</span>
                      </span>
                    ))}
                  </div>
                  <button onClick={() => { setAdsAiInput('Generate a list of negative keywords I should add based on my search term data. Show me the exact keywords and which campaigns they should be added to.'); setShowAdsAIChat(true); }} className="mt-3 px-3 py-1.5 bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/30 rounded-lg text-amber-300 text-xs font-medium">Generate Negative Keyword List →</button>
                </div>
              )}
            </div>
          )}

          {/* DETAIL TABLES */}
          {useDailyData && dailyTableData.length>1 && (
            <div className="bg-slate-800/30 rounded-2xl border border-slate-700 overflow-hidden mb-6"><div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="border-b border-slate-700 text-slate-400 text-xs uppercase"><th className="py-3 px-4 text-left">Date</th><th className="py-3 px-2 text-right">Amazon</th><th className="py-3 px-2 text-right">Google</th><th className="py-3 px-2 text-right">Meta</th><th className="py-3 px-2 text-right">Total</th><th className="py-3 px-2 text-right">Revenue</th><th className="py-3 px-2 text-right">TACOS</th></tr></thead>
              <tbody>{dailyTableData.map((d,i)=>{const tc=d.totalRev>0?(d.totalAds/d.totalRev)*100:0;return(<tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30"><td className="py-2 px-4 text-slate-300">{new Date(d.date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}</td><td className="py-2 px-2 text-right text-orange-400">{d.amazonAds>0?formatCurrency(d.amazonAds):'—'}</td><td className="py-2 px-2 text-right text-red-400">{d.googleAds>0?formatCurrency(d.googleAds):'—'}</td><td className="py-2 px-2 text-right text-blue-400">{d.metaAds>0?formatCurrency(d.metaAds):'—'}</td><td className="py-2 px-2 text-right text-white font-medium">{formatCurrency(d.totalAds)}</td><td className="py-2 px-2 text-right text-white">{formatCurrency(d.totalRev)}</td><td className={`py-2 px-2 text-right font-semibold ${tacosColor(tc)}`}>{tc>0?tc.toFixed(1)+'%':'—'}</td></tr>);})}</tbody>
              <tfoot><tr className="border-t-2 border-slate-600 font-semibold"><td className="py-2 px-4 text-white">Total</td><td className="py-2 px-2 text-right text-orange-400">{formatCurrency(dailyTotals.amazonAds)}</td><td className="py-2 px-2 text-right text-red-400">{formatCurrency(dailyTotals.googleAds)}</td><td className="py-2 px-2 text-right text-blue-400">{formatCurrency(dailyTotals.metaAds)}</td><td className="py-2 px-2 text-right text-white">{formatCurrency(dailyTotals.totalAds)}</td><td className="py-2 px-2 text-right text-white">{formatCurrency(dailyTotals.totalRev)}</td><td className={`py-2 px-2 text-right ${tacosColor(totalTacos)}`}>{totalTacos>0?totalTacos.toFixed(1)+'%':'—'}</td></tr></tfoot>
            </table></div></div>
          )}

          {!useDailyData && weeklyTableData.length>0 && (
            <div className="bg-slate-800/30 rounded-2xl border border-slate-700 overflow-hidden mb-6"><div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="border-b border-slate-700 text-slate-400 text-xs uppercase"><th className="py-3 px-4 text-left">Week</th><th className="py-3 px-2 text-right">Amazon</th><th className="py-3 px-2 text-right">Google</th><th className="py-3 px-2 text-right">Meta</th><th className="py-3 px-2 text-right">Total</th><th className="py-3 px-2 text-right">Revenue</th><th className="py-3 px-2 text-right">TACOS</th></tr></thead>
              <tbody>{weeklyTableData.map((w,i)=>(<tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30"><td className="py-2 px-4 text-slate-300">{new Date(w.week+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}</td><td className="py-2 px-2 text-right text-orange-400">{formatCurrency(w.amzAds)}</td><td className="py-2 px-2 text-right text-red-400">{formatCurrency(w.googleAds)}</td><td className="py-2 px-2 text-right text-blue-400">{formatCurrency(w.metaAds)}</td><td className="py-2 px-2 text-right text-white font-medium">{formatCurrency(w.totalAds)}</td><td className="py-2 px-2 text-right text-white">{formatCurrency(w.totalRev)}</td><td className={`py-2 px-2 text-right font-semibold ${tacosColor(w.tacos)}`}>{w.tacos>0?w.tacos.toFixed(1)+'%':'—'}</td></tr>))}</tbody>
              <tfoot><tr className="border-t-2 border-slate-600 font-semibold"><td className="py-2 px-4 text-white">Total</td><td className="py-2 px-2 text-right text-orange-400">{formatCurrency(totals.amzAds)}</td><td className="py-2 px-2 text-right text-red-400">{formatCurrency(totals.googleAds)}</td><td className="py-2 px-2 text-right text-blue-400">{formatCurrency(totals.metaAds)}</td><td className="py-2 px-2 text-right text-white">{formatCurrency(totals.totalAds)}</td><td className="py-2 px-2 text-right text-white">{formatCurrency(totals.totalRev)}</td><td className={`py-2 px-2 text-right ${tacosColor(totalTacos)}`}>{totalTacos>0?totalTacos.toFixed(1)+'%':'—'}</td></tr></tfoot>
            </table></div></div>
          )}

          {((useDailyData&&dailyTableData.length===0)||(!useDailyData&&weeklyTableData.length===0))&&(
            <div className="text-center py-12 bg-slate-800/30 rounded-2xl border border-slate-700">
              <DollarSign className="w-12 h-12 text-slate-600 mx-auto mb-4"/>
              <p className="text-slate-400 mb-4">No ad data for {getPeriodLabel()}</p>
              <button onClick={()=>setAdsViewMode('upload')} className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-white flex items-center gap-2 mx-auto"><Upload className="w-4 h-4"/>Upload Data</button>
            </div>
          )}
        </>)}

        {/* ═══ UPLOAD TAB ═══ */}
        {adsViewMode==='upload' && (<>
          <div className={`rounded-2xl border-2 border-dashed p-8 text-center transition-all mb-6 ${isDragging?'border-violet-400 bg-violet-900/20':'border-slate-600 bg-slate-800/30 hover:border-slate-500'}`}
            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
            {uploadStatus?.processing ? (
              <div className="py-4"><Loader2 className="w-12 h-12 text-violet-400 mx-auto mb-4 animate-spin"/><p className="text-white font-medium mb-1">Processing files...</p><p className="text-slate-400 text-sm">Auto-detecting report types</p></div>
            ) : (<>
              <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4"/>
              <h3 className="text-white text-lg font-semibold mb-2">Drop Any Ad Reports Here</h3>
              <p className="text-slate-400 text-sm mb-4 max-w-lg mx-auto">CSV, XLSX, or ZIP — auto-detects Amazon PPC, Google Ads, Meta Ads, Shopify, and Brand Analytics. Daily KPIs flow everywhere, deep analysis powers AI reports.</p>
              <button onClick={()=>fileInputRef.current?.click()} className="px-6 py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 rounded-xl text-white font-medium shadow-lg shadow-violet-500/20">
                <span className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5"/>Choose Files</span>
              </button>
              <input ref={fileInputRef} type="file" multiple accept=".csv,.xlsx,.xls,.zip,.tsv" className="hidden" onChange={e=>handleFileDrop(e.target.files)}/>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 text-xs text-slate-500">
                <div className="flex items-center gap-2 justify-center"><span className="w-2 h-2 rounded-full bg-orange-500"/>Amazon PPC</div>
                <div className="flex items-center gap-2 justify-center"><span className="w-2 h-2 rounded-full bg-red-500"/>Google Ads</div>
                <div className="flex items-center gap-2 justify-center"><span className="w-2 h-2 rounded-full bg-blue-500"/>Meta Ads</div>
                <div className="flex items-center gap-2 justify-center"><span className="w-2 h-2 rounded-full bg-emerald-500"/>Shopify / Brand Analytics</div>
              </div>
            </>)}
          </div>

          {uploadStatus?.results && (
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6 mb-6">
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2"><Check className="w-5 h-5 text-emerald-400"/>Last Upload Results</h3>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-emerald-900/20 rounded-xl border border-emerald-500/30 p-4 text-center"><p className="text-2xl font-bold text-emerald-400">{uploadStatus.results.summary.tier1}</p><p className="text-slate-400 text-xs mt-1">Daily KPIs</p><p className="text-emerald-500/60 text-xs">→ all pages</p></div>
                <div className="bg-violet-900/20 rounded-xl border border-violet-500/30 p-4 text-center"><p className="text-2xl font-bold text-violet-400">{uploadStatus.results.summary.tier2}</p><p className="text-slate-400 text-xs mt-1">Deep Analysis</p><p className="text-violet-500/60 text-xs">→ AI reports</p></div>
                <div className={`rounded-xl border p-4 text-center ${uploadStatus.results.summary.unrecognized>0?'bg-amber-900/20 border-amber-500/30':'bg-slate-800/50 border-slate-700'}`}><p className={`text-2xl font-bold ${uploadStatus.results.summary.unrecognized>0?'text-amber-400':'text-slate-500'}`}>{uploadStatus.results.summary.unrecognized}</p><p className="text-slate-400 text-xs mt-1">Unrecognized</p></div>
              </div>
              <div className="space-y-2">
                {uploadStatus.results.summary.reportTypes.map((r,i)=>(
                  <div key={i} className="flex items-center gap-3 p-2 bg-slate-900/50 rounded-lg">
                    <span className={`w-2 h-2 rounded-full ${r.platform==='amazon'?'bg-orange-500':r.platform==='google'?'bg-red-500':r.platform==='meta'?'bg-blue-500':'bg-emerald-500'}`}/>
                    <span className="text-white text-sm flex-1">{r.label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${r.tier===1?'bg-emerald-900/30 text-emerald-400':'bg-violet-900/30 text-violet-400'}`}>Tier {r.tier}</span>
                    <span className="text-slate-500 text-xs truncate max-w-[200px]">{r.fileName}</span>
                  </div>
                ))}
                {uploadStatus.results.unrecognized.map((r,i)=>(
                  <div key={`u${i}`} className="flex items-center gap-3 p-2 bg-amber-900/10 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-amber-400"/><span className="text-amber-300 text-sm flex-1">{r.fileName}</span><span className="text-xs text-amber-500">Not recognized</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Data Inventory */}
          <div className="bg-slate-800/30 rounded-2xl border border-slate-700 p-6">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2"><Database className="w-5 h-5 text-cyan-400"/>Currently Loaded Data</h3>
            <div className="mb-6">
              <h4 className="text-cyan-400 text-sm font-semibold uppercase tracking-wider mb-3">Tier 1 — Daily KPIs</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-slate-900/50 rounded-xl p-4"><div className="flex items-center gap-2 mb-2"><span className="w-3 h-3 rounded-full bg-orange-500"/><span className="text-white text-sm font-medium">Amazon</span></div><p className="text-slate-400 text-xs">{sortedDays.filter(d=>allDaysData[d]?.amazon?.adSpend>0).length} days SP-API</p><p className="text-slate-400 text-xs">{sortedDays.filter(d=>(allDaysData[d]?.amazonAdsMetrics?.spend||0)>0).length} days Ads report</p></div>
                <div className="bg-slate-900/50 rounded-xl p-4"><div className="flex items-center gap-2 mb-2"><span className="w-3 h-3 rounded-full bg-red-500"/><span className="text-white text-sm font-medium">Google</span></div><p className="text-slate-400 text-xs">{sortedDays.filter(d=>(allDaysData[d]?.shopify?.googleSpend||0)>0).length} days spend</p><p className="text-slate-400 text-xs">{sortedDays.filter(d=>(allDaysData[d]?.shopify?.adsMetrics?.googleImpressions||0)>0).length} days metrics</p></div>
                <div className="bg-slate-900/50 rounded-xl p-4"><div className="flex items-center gap-2 mb-2"><span className="w-3 h-3 rounded-full bg-blue-500"/><span className="text-white text-sm font-medium">Meta</span></div><p className="text-slate-400 text-xs">{sortedDays.filter(d=>(allDaysData[d]?.shopify?.metaSpend||0)>0).length} days spend</p><p className="text-slate-400 text-xs">{sortedDays.filter(d=>(allDaysData[d]?.shopify?.adsMetrics?.metaImpressions||0)>0).length} days metrics</p></div>
              </div>
            </div>
            <div>
              <h4 className="text-violet-400 text-sm font-semibold uppercase tracking-wider mb-3">Tier 2 — Deep Analysis</h4>
              {tier2Summary.count===0 ? (
                <div className="bg-slate-900/50 rounded-xl p-6 text-center"><Brain className="w-8 h-8 text-slate-600 mx-auto mb-2"/><p className="text-slate-400 text-sm">No deep analysis data loaded</p><p className="text-slate-500 text-xs mt-1">Upload search terms, placements, campaigns for AI reports</p></div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(adsIntelData||{}).map(([platform,reports])=>{
                    if(platform==='lastUpdated'||platform==='reportCount'||typeof reports!=='object') return null;
                    return Object.entries(reports).map(([rt,data])=>{
                      if(!data?.records) return null;
                      return (<div key={`${platform}-${rt}`} className="bg-slate-900/50 rounded-xl p-3 flex items-center gap-3">
                        <span className={`w-2 h-2 rounded-full ${platform==='amazon'?'bg-orange-500':platform==='google'?'bg-red-500':platform==='meta'?'bg-blue-500':'bg-emerald-500'}`}/>
                        <div className="flex-1 min-w-0"><p className="text-white text-sm">{data.meta?.label||rt}</p><p className="text-slate-500 text-xs">{data.records.length} rows • {data.meta?.uploadedAt?.slice(0,10)||'unknown'}</p></div>
                      </div>);
                    });
                  })}
                </div>
              )}
            </div>
          </div>
        </>)}
        {/* ═══ DEEP ANALYSIS TAB ═══ */}
        {adsViewMode==='analysis' && (<>
          {tier2Summary.count===0 ? (
            <div className="text-center py-16 bg-slate-800/30 rounded-2xl border border-slate-700">
              <Search className="w-16 h-16 text-slate-600 mx-auto mb-4"/>
              <h3 className="text-white text-xl font-semibold mb-2">Upload Deep Analysis Reports</h3>
              <p className="text-slate-400 max-w-md mx-auto mb-6">Drop search term, placement, campaign, or Brand Analytics reports to unlock keyword analysis, placement optimization, and audience insights.</p>
              <button onClick={()=>setAdsViewMode('upload')} className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl text-white font-medium"><span className="flex items-center gap-2"><Upload className="w-5 h-5"/>Go to Upload</span></button>
            </div>
          ) : (<>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Search Terms */}
              {(adsIntelData?.amazon?.sp_search_terms||adsIntelData?.google?.google_search_terms) && (
                <div className="bg-slate-800/30 rounded-2xl border border-slate-700 p-6">
                  <h3 className="text-white font-semibold mb-4 flex items-center gap-2"><Search className="w-5 h-5 text-emerald-400"/>Search Terms</h3>
                  {adsIntelData?.amazon?.sp_search_terms && (()=>{
                    const recs=adsIntelData.amazon.sp_search_terms.records, hds=adsIntelData.amazon.sp_search_terms.headers;
                    const spK=hds.find(h=>/^Spend$/i.test(h)), slK=hds.find(h=>/Sales/i.test(h)), srK=hds.find(h=>/Customer Search Term/i.test(h));
                    const top10=spK?[...recs].sort((a,b)=>Number(b[spK]||0)-Number(a[spK]||0)).slice(0,10):recs.slice(0,10);
                    return (<div><p className="text-orange-400 text-sm font-medium mb-2">Amazon SP ({recs.length} terms)</p><div className="space-y-1">{top10.map((r,i)=>{
                      const sp=Number(r[spK]||0),sl=Number(r[slK]||0),roas=sp>0?sl/sp:0;
                      return (<div key={i} className="flex items-center gap-2 text-xs py-1"><span className="text-slate-400 w-5">{i+1}.</span><span className="text-white flex-1 truncate">{r[srK]||'—'}</span><span className="text-slate-400">{formatCurrency(sp)}</span><span className={`w-14 text-right ${roas>=3?'text-emerald-400':roas>=1?'text-amber-400':sl===0?'text-rose-400':'text-white'}`}>{roas>0?roas.toFixed(1)+'x':'—'}</span></div>);
                    })}</div></div>);
                  })()}
                  {adsIntelData?.google?.google_search_terms && (()=>{
                    const recs=adsIntelData.google.google_search_terms.records, hds=adsIntelData.google.google_search_terms.headers;
                    const cK=hds.find(h=>/^Cost$/i.test(h)), tK=hds.find(h=>/Search term/i.test(h)), cvK=hds.find(h=>/^Conversions$/i.test(h));
                    const top10=cK?[...recs].sort((a,b)=>Number(b[cK]||0)-Number(a[cK]||0)).slice(0,10):recs.slice(0,10);
                    return (<div className="mt-4 pt-4 border-t border-slate-700"><p className="text-red-400 text-sm font-medium mb-2">Google ({recs.length} terms)</p><div className="space-y-1">{top10.map((r,i)=>(
                      <div key={i} className="flex items-center gap-2 text-xs py-1"><span className="text-slate-400 w-5">{i+1}.</span><span className="text-white flex-1 truncate">{r[tK]||'—'}</span><span className="text-slate-400">{formatCurrency(Number(r[cK]||0))}</span><span className="text-emerald-400 w-14 text-right">{Number(r[cvK]||0)>0?Number(r[cvK]).toFixed(0)+' conv':'—'}</span></div>
                    ))}</div></div>);
                  })()}
                </div>
              )}

              {/* Campaigns & Placements */}
              {(adsIntelData?.google?.google_campaign_perf||adsIntelData?.meta?.meta_campaign_perf) && (
                <div className="bg-slate-800/30 rounded-2xl border border-slate-700 p-6">
                  <h3 className="text-white font-semibold mb-4 flex items-center gap-2"><Target className="w-5 h-5 text-violet-400"/>Campaigns</h3>
                  {adsIntelData?.google?.google_campaign_perf && (()=>{
                    const recs=adsIntelData.google.google_campaign_perf.records;
                    return (<div><p className="text-red-400 text-sm font-medium mb-2">Google ({recs.length})</p><div className="space-y-1">{recs.slice(0,8).map((r,i)=>(
                      <div key={i} className="flex items-center gap-2 text-xs py-1"><span className={`w-2 h-2 rounded-full ${r['Campaign state']==='Enabled'?'bg-emerald-500':'bg-slate-500'}`}/><span className="text-white flex-1 truncate">{r['Campaign']||'—'}</span><span className="text-slate-400">{formatCurrency(Number(r['Cost']||0))}</span><span className="text-slate-400">{Number(r['Conversions']||0).toFixed(0)} conv</span></div>
                    ))}</div></div>);
                  })()}
                  {adsIntelData?.meta?.meta_campaign_perf && (()=>{
                    const recs=adsIntelData.meta.meta_campaign_perf.records;
                    return (<div className={adsIntelData?.google?.google_campaign_perf?'mt-4 pt-4 border-t border-slate-700':''}><p className="text-blue-400 text-sm font-medium mb-2">Meta ({recs.length})</p><div className="space-y-1">{recs.slice(0,8).map((r,i)=>(
                      <div key={i} className="flex items-center gap-2 text-xs py-1"><span className={`w-2 h-2 rounded-full ${r['Campaign delivery']==='active'?'bg-emerald-500':'bg-slate-500'}`}/><span className="text-white flex-1 truncate">{r['Campaign name']||'—'}</span><span className="text-slate-400">{formatCurrency(Number(r['Amount spent (USD)']||0))}</span></div>
                    ))}</div></div>);
                  })()}
                </div>
              )}

              {/* Brand Analytics */}
              {adsIntelData?.amazon?.search_query_performance && (
                <div className="bg-slate-800/30 rounded-2xl border border-slate-700 p-6 lg:col-span-2">
                  <h3 className="text-white font-semibold mb-4 flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-400"/>Brand Analytics — Search Query Performance</h3>
                  {(()=>{
                    const recs=adsIntelData.amazon.search_query_performance.records;
                    return (<div className="overflow-x-auto"><table className="w-full text-xs">
                      <thead><tr className="border-b border-slate-700 text-slate-400"><th className="py-2 text-left">#</th><th className="py-2 text-left">Search Query</th><th className="py-2 text-right">Volume</th><th className="py-2 text-right">Brand Share</th><th className="py-2 text-right">Click Share</th></tr></thead>
                      <tbody>{recs.slice(0,20).map((r,i)=>(
                        <tr key={i} className="border-b border-slate-800/50"><td className="py-1.5 text-slate-500">{i+1}</td><td className="py-1.5 text-white">{r['Search Query']||'—'}</td><td className="py-1.5 text-right text-slate-300">{formatNumber(Number(r['Search Query Volume']||0))}</td><td className="py-1.5 text-right text-cyan-400">{Number(r['Impressions: Brand Share %']||0).toFixed(1)}%</td><td className="py-1.5 text-right text-emerald-400">{Number(r['Clicks: Brand Share %']||0).toFixed(1)}%</td></tr>
                      ))}</tbody>
                    </table><p className="text-slate-500 text-xs mt-2">{recs.length} total queries</p></div>);
                  })()}
                </div>
              )}
            </div>

            {tier2Summary.count>0 && (
              <div className="mt-6 text-center">
                <button onClick={()=>setAdsViewMode('reports')} className="px-6 py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 rounded-xl text-white font-medium shadow-lg shadow-orange-500/20">
                  <span className="flex items-center gap-2"><Brain className="w-5 h-5"/>Generate AI Audit →</span>
                </button>
              </div>
            )}
          </>)}
        </>)}
        {/* ═══ AI REPORTS TAB ═══ */}
        {adsViewMode==='reports' && (<>
          <div className="bg-gradient-to-r from-orange-900/20 to-amber-900/20 rounded-2xl border border-orange-500/30 p-6 mb-6">
            <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
              <div>
                <h3 className="text-white text-lg font-semibold flex items-center gap-2"><Brain className="w-6 h-6 text-orange-400"/>AI Comprehensive Ads Audit</h3>
                <p className="text-slate-400 text-sm mt-1">Generates a full cross-platform audit from ALL available data — search terms, placements, campaigns, daily performance, Brand Analytics.</p>
              </div>
              <select value={aiChatModel} onChange={e => setAiChatModel(e.target.value)} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm">
                {AI_MODEL_OPTIONS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            {/* Data Sources Manifest — shows exactly what the AI will analyze */}
            {(() => {
              const sources = [];
              // Tier 1: Daily KPIs
              if (sortedDays.length > 0) sources.push({ platform: 'Dashboard', type: 'Daily KPIs (SP-API + Shopify)', rows: sortedDays.length, unit: 'days', date: sortedDays[sortedDays.length-1], color: 'violet' });
              // SP-API campaigns
              if (hasCampaignData) sources.push({ platform: 'Amazon', type: 'SP-API Campaigns', rows: campaigns.length, unit: 'campaigns', date: 'Live', color: 'orange' });
              // Tier 2 reports
              if (adsIntelData) {
                ['amazon','google','meta','shopify'].forEach(plat => {
                  if (!adsIntelData[plat] || typeof adsIntelData[plat] !== 'object') return;
                  Object.entries(adsIntelData[plat]).forEach(([reportType, data]) => {
                    if (!data?.records) return;
                    const label = data.meta?.label || reportType.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
                    sources.push({
                      platform: plat.charAt(0).toUpperCase()+plat.slice(1),
                      type: label,
                      rows: data.records.length,
                      unit: 'rows',
                      date: data.meta?.uploadedAt?.slice(0,10) || 'unknown',
                      color: plat==='amazon'?'orange':plat==='google'?'red':plat==='meta'?'blue':'emerald',
                    });
                  });
                });
              }
              const totalSources = sources.length;
              const platformColors = { Amazon:'orange', Google:'red', Meta:'blue', Shopify:'emerald', Dashboard:'violet' };
              return (
                <div className="mb-4">
                  <button onClick={()=>setShowDataSources(p=>!p)} className="flex items-center gap-2 text-sm text-slate-300 hover:text-white mb-2">
                    <Database className="w-4 h-4"/>
                    <span className="font-medium">{totalSources} data source{totalSources!==1?'s':''} loaded</span>
                    <span className="text-slate-500 text-xs">({sources.reduce((s,r)=>s+r.rows,0).toLocaleString()} total records)</span>
                    <ChevronRight className={`w-3 h-3 transition-transform ${showDataSources?'rotate-90':''}`}/>
                  </button>
                  {showDataSources && (
                    <div className="bg-slate-900/60 rounded-xl border border-slate-700 p-3 space-y-1.5 max-h-[300px] overflow-y-auto">
                      {totalSources===0 ? (
                        <p className="text-slate-500 text-xs text-center py-4">No data loaded yet. Upload reports or connect SP-API to populate data sources.</p>
                      ) : sources.map((s,i) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-slate-800/60 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full bg-${s.color}-500`}/>
                            <span className="text-slate-400 w-16">{s.platform}</span>
                            <span className="text-white">{s.type}</span>
                          </div>
                          <div className="flex items-center gap-3 text-slate-500">
                            <span>{s.rows.toLocaleString()} {s.unit}</span>
                            <span className="text-[10px]">{s.date}</span>
                          </div>
                        </div>
                      ))}
                      {totalSources>0 && (
                        <p className="text-slate-600 text-[10px] pt-1 text-center">The AI report will analyze all sources listed above. Upload more reports for deeper insights.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="space-y-3">
              <button onClick={()=>{setShowAdsAIChat(true);setTimeout(()=>sendAdsAIMessage("Generate a COMPREHENSIVE cross-platform advertising audit using ALL available data. Cover: Executive Summary, Amazon PPC deep analysis (search terms, placements, targeting, ACOS trends), Google Ads analysis (campaigns, search terms, keywords), Meta Ads analysis (creative performance, audiences, placements), Cross-Channel budget allocation, Immediate Actions for this week, and 30-day Strategic Recommendations. Be BRUTALLY specific — cite exact campaign names, search terms, ASINs, ad names, and dollar amounts."),200);}} className="w-full px-6 py-4 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 rounded-xl text-white font-semibold shadow-lg shadow-orange-500/20 flex items-center justify-center gap-3">
                <Zap className="w-5 h-5"/>Generate Full Cross-Platform Audit
              </button>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button onClick={()=>{setShowAdsAIChat(true);setTimeout(()=>sendAdsAIMessage("Analyze ALL Amazon PPC data — search terms, placements, targeting, campaigns. Top 10 profitable keywords, top 10 wasteful keywords with exact $ wasted, placement bid strategy, negative keyword recommendations."),200);}} className="px-4 py-3 bg-slate-700/50 hover:bg-slate-700 rounded-xl text-white text-sm flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-orange-500"/>Amazon PPC Deep Dive</button>
                <button onClick={()=>{setShowAdsAIChat(true);setTimeout(()=>sendAdsAIMessage("Analyze ALL Google Ads data — campaigns, search terms, keywords, ad groups. Best campaigns, wasteful search terms as negatives, keyword opportunities, budget reallocation."),200);}} className="px-4 py-3 bg-slate-700/50 hover:bg-slate-700 rounded-xl text-white text-sm flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500"/>Google Ads Deep Dive</button>
                <button onClick={()=>{setShowAdsAIChat(true);setTimeout(()=>sendAdsAIMessage("Analyze ALL Meta Ads data — campaigns, creatives, audiences, placements. Best ads, audience insights, creative fatigue, budget optimization."),200);}} className="px-4 py-3 bg-slate-700/50 hover:bg-slate-700 rounded-xl text-white text-sm flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-500"/>Meta Ads Deep Dive</button>
                <button onClick={()=>{setShowAdsAIChat(true);setTimeout(()=>sendAdsAIMessage("Compare organic search query performance (Brand Analytics) with paid campaigns. Where am I paying for clicks I could get organically? Where should I increase paid? Specific keyword recommendations."),200);}} className="px-4 py-3 bg-slate-700/50 hover:bg-slate-700 rounded-xl text-white text-sm flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-500"/>Organic vs Paid Gap</button>
              </div>
            </div>
          </div>

          {/* Prior Report History */}
          {adsAiReportHistory && adsAiReportHistory.length > 0 && (
            <div className="bg-slate-800/30 rounded-2xl border border-slate-700 p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-slate-300 font-medium text-sm flex items-center gap-2"><Clock className="w-4 h-4"/>Report History ({adsAiReportHistory.length})</h3>
                <button onClick={()=>{if(window.confirm('Clear all report history? The AI will lose memory of prior analyses.')){setAdsAiReportHistory([]);}}} className="text-xs text-slate-500 hover:text-red-400">Clear History</button>
              </div>
              <div className="space-y-2">
                {adsAiReportHistory.slice(-5).reverse().map((r,i)=>(
                  <div key={i} className="flex items-center justify-between bg-slate-900/50 rounded-lg px-3 py-2 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400">{r.date}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${r.model==='Opus'?'bg-violet-900/50 text-violet-300':r.model==='Sonnet'?'bg-blue-900/50 text-blue-300':'bg-slate-700 text-slate-300'}`}>{r.model}</span>
                      {r.healthScore && <span className={`font-bold ${parseInt(r.healthScore)>=7?'text-emerald-400':parseInt(r.healthScore)>=4?'text-amber-400':'text-red-400'}`}>{r.healthScore}/10</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 max-w-[300px] truncate">{r.keyIssues}</span>
                      <select value={r.actionsTaken||'pending'} onChange={e=>{setAdsAiReportHistory(prev=>prev.map((rr,ri)=>ri===prev.length-1-i?{...rr,actionsTaken:e.target.value}:rr));}} className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-slate-300">
                        <option value="pending">⏳ Pending</option>
                        <option value="in-progress">🔄 In Progress</option>
                        <option value="completed">✅ Completed</option>
                        <option value="skipped">⏭ Skipped</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {adsAiMessages.length>0 && (
            <div className="bg-slate-800/30 rounded-2xl border border-slate-700 p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="text-white font-semibold">Report Output</h3>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Copy plain text */}
                  <button onClick={()=>{
                    const report = adsAiMessages.filter(m=>m.role==='assistant').map(m=>m.content).join('\n\n---\n\n');
                    navigator.clipboard.writeText(report).then(()=>setToast({message:'Report copied as plain text',type:'success'})).catch(()=>setToast({message:'Copy failed',type:'error'}));
                  }} className="text-slate-400 hover:text-white text-xs flex items-center gap-1 px-2 py-1.5 bg-slate-700/50 rounded-lg hover:bg-slate-700" title="Copy as plain text">📋 Copy Text</button>
                  
                  {/* Copy rich HTML for Google Docs */}
                  <button onClick={()=>{
                    const report = adsAiMessages.filter(m=>m.role==='assistant').map(m=>m.content).join('\n\n---\n\n');
                    const html = markdownToHtml(report);
                    const blob = new Blob([html], {type:'text/html'});
                    const item = new ClipboardItem({'text/html': blob, 'text/plain': new Blob([report], {type:'text/plain'})});
                    navigator.clipboard.write([item]).then(()=>setToast({message:'Copied as rich text — paste into Google Docs, Notion, etc.',type:'success'})).catch(()=>{
                      navigator.clipboard.writeText(report).then(()=>setToast({message:'Copied as plain text (rich copy not supported in this browser)',type:'success'}));
                    });
                  }} className="text-slate-400 hover:text-white text-xs flex items-center gap-1 px-2 py-1.5 bg-slate-700/50 rounded-lg hover:bg-slate-700" title="Copy as formatted HTML for Google Docs">📄 Copy for Docs</button>
                  
                  {/* Download markdown */}
                  <button onClick={()=>{
                    const report = adsAiMessages.map(m=>m.role==='user'?`**PROMPT:** ${m.content}`:m.content).join('\n\n---\n\n');
                    const header = `# Tallowbourn Advertising Audit Report\n**Generated:** ${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}\n**Model:** ${getModelLabel(aiChatModel)}\n\n---\n\n`;
                    const blob = new Blob([header + report], {type:'text/markdown'});
                    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `tallowbourn-ads-audit-${new Date().toISOString().slice(0,10)}.md`; a.click(); URL.revokeObjectURL(url);
                    setToast({message:'Downloaded as markdown',type:'success'});
                  }} className="text-slate-400 hover:text-white text-xs flex items-center gap-1 px-2 py-1.5 bg-slate-700/50 rounded-lg hover:bg-slate-700" title="Download markdown file">⬇️ .md</button>
                  
                  {/* Export as PDF (styled print window) */}
                  <button onClick={()=>{
                    const report = adsAiMessages.filter(m=>m.role==='assistant').map(m=>m.content).join('\n\n---\n\n');
                    const dateStr = new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
                    const modelName = getModelLabel(aiChatModel);
                    const htmlBody = markdownToHtml(report);
                    const printDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tallowbourn Ads Audit - ${dateStr}</title>
<style>
  @page { margin: 0.75in; size: letter; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #1a1a2e; line-height: 1.6; max-width: 100%; padding: 0; margin: 0; font-size: 11pt; }
  .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; padding: 30px 40px; margin: -0.75in -0.75in 30px; }
  .header h1 { font-size: 22pt; margin: 0 0 8px; font-weight: 700; }
  .header .meta { font-size: 9pt; opacity: 0.8; }
  .header .meta span { margin-right: 20px; }
  h2 { color: #1a1a2e; border-bottom: 2px solid #e94560; padding-bottom: 6px; margin-top: 28px; font-size: 14pt; page-break-after: avoid; }
  h3 { color: #16213e; margin-top: 20px; font-size: 12pt; page-break-after: avoid; }
  h4 { color: #444; margin-top: 16px; font-size: 11pt; }
  p, li { font-size: 11pt; }
  ul, ol { padding-left: 20px; }
  li { margin-bottom: 4px; }
  strong { color: #e94560; }
  code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-size: 10pt; }
  hr { border: none; border-top: 1px solid #ddd; margin: 24px 0; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 10pt; }
  th { background: #1a1a2e; color: white; padding: 8px 10px; text-align: left; }
  td { padding: 6px 10px; border-bottom: 1px solid #eee; }
  tr:nth-child(even) td { background: #f8f9fa; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 2px solid #1a1a2e; font-size: 8pt; color: #888; text-align: center; }
  @media print { .no-print { display: none; } .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<div class="header">
  <h1>📊 Tallowbourn Advertising Audit</h1>
  <div class="meta"><span>📅 ${dateStr}</span><span>🤖 ${modelName}</span><span>📁 ${(adsAiMessages.filter(m=>m.role==='assistant').length)} report sections</span></div>
</div>
<div class="no-print" style="background:#fff3cd;padding:12px 20px;margin-bottom:20px;border-radius:8px;font-size:10pt;color:#856404;">
  💡 <strong>To save as PDF:</strong> Press Ctrl+P (or ⌘+P on Mac) → Select "Save as PDF" as the destination → Click Save
</div>
${htmlBody}
<div class="footer">
  <p>Generated by Tallowbourn Advertising Command Center • ${dateStr} • ${modelName}</p>
</div>
</body></html>`;
                    const w = window.open('','_blank','width=900,height=700');
                    w.document.write(printDoc); w.document.close();
                    setTimeout(()=>w.print(), 500);
                  }} className="text-slate-400 hover:text-white text-xs flex items-center gap-1 px-2 py-1.5 bg-orange-900/50 rounded-lg hover:bg-orange-800/50 border border-orange-500/30" title="Export as PDF (opens print dialog)">📑 PDF</button>
                  
                  {/* Clear */}
                  <button onClick={()=>{if(adsAiMessages.length>4){if(!window.confirm('Clear report? This will remove all AI output from this session.'))return;}setAdsAiMessages([]);}} className="text-slate-400 hover:text-red-400 text-xs flex items-center gap-1 px-2 py-1.5 bg-slate-700/50 rounded-lg hover:bg-slate-700"><RefreshCw className="w-3 h-3"/>Clear</button>
                </div>
              </div>
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {adsAiMessages.map((msg,i)=>(
                  <div key={i} className={`${msg.role==='user'?'bg-orange-900/20 border border-orange-500/20':'bg-slate-900/50'} rounded-xl p-4`}>
                    <p className="text-xs text-slate-500 mb-1">{msg.role==='user'?'📝 Prompt':'🤖 AI Report'}</p>
                    <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                ))}
                {adsAiLoading&&<div className="bg-slate-900/50 rounded-xl p-4"><div className="flex gap-1"><div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{animationDelay:'0ms'}}/><div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{animationDelay:'150ms'}}/><div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{animationDelay:'300ms'}}/></div></div>}
              </div>
            </div>
          )}
        </>)}
        {/* ═══ FLOATING AI CHAT ═══ */}
        {showAdsAIChat && (
          <div className="fixed bottom-4 right-4 z-50 w-[560px] max-w-[calc(100vw-2rem)]">
            <div className="bg-slate-800 rounded-2xl border border-orange-500/50 shadow-2xl overflow-hidden">
              <div className="bg-gradient-to-r from-orange-600 to-amber-600 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><Zap className="w-5 h-5 text-white"/></div>
                  <div><h3 className="text-white font-semibold">AI Ads Analyst</h3><p className="text-white/70 text-xs">{sortedDays.length}d daily{tier2Summary.count>0?` • ${tier2Summary.count} deep reports`:''}</p></div>
                </div>
                <div className="flex items-center gap-2">
                  <select value={aiChatModel} onChange={e=>setAiChatModel(e.target.value)} className="bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-white text-xs">
                    {AI_MODEL_OPTIONS.map(m => (
                      <option key={m.value} value={m.value}>{m.label.replace('Claude ', '')}</option>
                    ))}
                  </select>
                  <button onClick={()=>setAdsAiMessages([])} className="p-2 hover:bg-white/20 rounded-lg text-white/70 hover:text-white" title="Clear"><RefreshCw className="w-4 h-4"/></button>
                  <button onClick={()=>setShowAdsAIChat(false)} className="p-2 hover:bg-white/20 rounded-lg text-white"><X className="w-5 h-5"/></button>
                </div>
              </div>
              <div className="h-[32rem] overflow-y-auto p-4 space-y-4">
                {adsAiMessages.length===0 && (
                  <div className="text-center text-slate-400 py-2">
                    <Zap className="w-10 h-10 mx-auto mb-3 opacity-50"/>
                    <p className="text-sm mb-4">Ask anything about your ads:</p>
                    <div className="space-y-2 text-left">
                      <button onClick={()=>sendAdsAIMessage("Generate my complete cross-platform Ads Action Plan with specific recommendations and dollar amounts.")} className="block w-full px-3 py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 rounded-xl text-sm text-white font-semibold shadow-lg shadow-orange-500/20">⚡ Generate Full Action Plan</button>
                      <button onClick={()=>sendAdsAIMessage("Which campaigns or search terms are wasting money? Give me negative keyword suggestions.")} className="block w-full px-3 py-2.5 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-sm text-slate-300">⚠️ Find wasted ad spend</button>
                      <button onClick={()=>sendAdsAIMessage("What are my best scaling opportunities across all platforms?")} className="block w-full px-3 py-2.5 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-sm text-slate-300">🚀 Best scaling opportunities</button>
                      <button onClick={()=>sendAdsAIMessage("How should I reallocate budget across Amazon, Google, and Meta for max ROAS?")} className="block w-full px-3 py-2.5 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-sm text-slate-300">💰 Cross-channel budget allocation</button>
                    </div>
                  </div>
                )}
                {adsAiMessages.map((msg,i)=>(
                  <div key={i} className={`flex ${msg.role==='user'?'justify-end':'justify-start'}`}>
                    <div className={`max-w-[90%] rounded-2xl px-4 py-3 ${msg.role==='user'?'bg-orange-600 text-white':'bg-slate-700 text-slate-200'}`}>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {adsAiLoading&&<div className="flex justify-start"><div className="bg-slate-700 rounded-2xl px-4 py-3"><div className="flex gap-1"><div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{animationDelay:'0ms'}}/><div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{animationDelay:'150ms'}}/><div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{animationDelay:'300ms'}}/></div></div></div>}
              </div>
              <div className="p-4 border-t border-slate-700"><div className="flex gap-2">
                <input type="text" value={adsAiInput} onChange={e=>setAdsAiInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();sendAdsAIMessage();}}} placeholder="Ask about campaigns, keywords, ROAS..." className="flex-1 bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500" autoComplete="off"/>
                <button onClick={sendAdsAIMessage} disabled={!adsAiInput.trim()||adsAiLoading} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 rounded-xl text-white"><Send className="w-4 h-4"/></button>
              </div></div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default AdsView;
