import React, { useState } from 'react';
import { X, Upload, CheckCircle, AlertTriangle, TrendingUp, Target, Search, BarChart3, ShoppingCart, Zap, Download, FileText, Globe, Instagram, Archive, Loader2, ChevronDown } from 'lucide-react';
import { loadXLSX } from '../../utils/xlsx';
import { AI_DEFAULT_MODEL, AI_MODEL_OPTIONS } from '../../utils/config';
import { sanitizeHtml } from '../../utils/sanitize';

// ============ REPORT TYPES ============

const REPORT_TYPES = [
  // Google
  { key: 'googleCampaign', label: 'Google Campaigns', icon: Globe, color: 'blue', platform: 'google' },
  { key: 'googleAdGroup', label: 'Google Ad Groups', icon: BarChart3, color: 'blue', platform: 'google' },
  { key: 'googleSearchTerms', label: 'Google Search Terms', icon: Search, color: 'blue', platform: 'google' },
  { key: 'googleKeywords', label: 'Google Keywords', icon: Target, color: 'blue', platform: 'google' },
  { key: 'googleAssetGroups', label: 'Google PMax Assets', icon: TrendingUp, color: 'blue', platform: 'google' },
  // Meta
  { key: 'metaCampaign', label: 'Meta Campaigns', icon: Instagram, color: 'purple', platform: 'meta' },
  { key: 'metaAdSets', label: 'Meta Ad Sets', icon: BarChart3, color: 'purple', platform: 'meta' },
  { key: 'metaAds', label: 'Meta Ads', icon: ShoppingCart, color: 'purple', platform: 'meta' },
  { key: 'metaAdSetAge', label: 'Meta Age Breakdown', icon: BarChart3, color: 'purple', platform: 'meta' },
  { key: 'metaAdSetGender', label: 'Meta Gender Breakdown', icon: BarChart3, color: 'purple', platform: 'meta' },
  { key: 'metaAdSetPlacement', label: 'Meta Placement', icon: BarChart3, color: 'purple', platform: 'meta' },
  // Amazon Search Query
  { key: 'amazonSearchQuery', label: 'Amazon Search Query Perf', icon: Search, color: 'orange', platform: 'amazon' },
  // Shopify
  { key: 'shopifySales', label: 'Shopify Sales', icon: ShoppingCart, color: 'green', platform: 'shopify' },
  { key: 'shopifySessions', label: 'Shopify Sessions', icon: TrendingUp, color: 'green', platform: 'shopify' },
  { key: 'shopifyAOV', label: 'Shopify AOV', icon: TrendingUp, color: 'green', platform: 'shopify' },
  { key: 'shopifyConversion', label: 'Shopify Conversion Rate', icon: Target, color: 'green', platform: 'shopify' },
  { key: 'shopifyLandingPages', label: 'Shopify Landing Pages', icon: Globe, color: 'green', platform: 'shopify' },
];

// ============ HELPERS ============

const num = (v) => {
  if (v === null || v === undefined || v === '' || v === 'null' || v === '--' || v === ' --') return 0;
  const s = String(v).replace(/[$,%"\s]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

const pct = (v) => {
  if (v === null || v === undefined || v === '' || v === '--') return 0;
  const s = String(v).replace(/[%"\s]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

// Google exports have metadata rows at top; need to find the real header
const parseXlsxSmart = async (file) => {
  let allRows;
  try {
    const XLSX = await loadXLSX();
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const ws = wb.Sheets[wb.SheetNames[0]];
    allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  } catch (xlsxErr) {
    // Fallback: parse CSV as text (handles cases where SheetJS fails on CSV ArrayBuffer)
    if (file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv') {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) throw new Error('CSV file is empty');
      allRows = lines.map(line => {
        const vals = [];
        let current = '', inQ = false;
        for (const c of line) {
          if (c === '"') inQ = !inQ;
          else if (c === ',' && !inQ) { vals.push(current.trim().replace(/^"|"$/g, '')); current = ''; }
          else current += c;
        }
        vals.push(current.trim().replace(/^"|"$/g, ''));
        return vals;
      });
    } else {
      throw xlsxErr;
    }
  }
  
  // Find the header row — look for known column names (require 3+ matches to avoid title rows like "Search terms report")
  const knownHeaders = ['campaign', 'search term', 'keyword', 'ad group', 'ad set name', 'ad name', 
    'campaign name', 'search query', 'day', 'date', 'landing page type', 'asset group status', 'reporting starts',
    'keyword status', 'ad group status', 'campaign state', 'campaign status', 'reporting starts', 'amount spent', 'impressions', 'clicks', 'cost'];
  
  let headerIdx = 0;
  let bestScore = 0;
  for (let i = 0; i < Math.min(10, allRows.length); i++) {
    const row = allRows[i];
    if (!row || row.length < 3) continue;
    const lower = row.map(c => String(c || '').toLowerCase().trim());
    const score = lower.filter(h => knownHeaders.some(kh => h === kh || (h.length > 3 && h.includes(kh)))).length;
    if (score > bestScore) {
      bestScore = score;
      headerIdx = i;
    }
  }
  
  const headers = allRows[headerIdx].map(h => String(h || '').trim());
  const rows = [];
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const vals = allRows[i];
    if (!vals || vals.every(v => v === null || v === '' || v === undefined)) continue;
    // Skip Google Ads "Total:" footer rows (e.g. "Total: Shopping", "Total: Account")
    if (vals[0] && String(vals[0]).startsWith('Total:')) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] !== undefined ? vals[idx] : null; });
    rows.push(row);
  }
  
  // Also extract date range from metadata rows (Google puts it in row 1)
  let dateRange = null;
  for (let i = 0; i < headerIdx; i++) {
    const row = allRows[i];
    if (row) {
      const text = row.map(v => String(v || '')).join(' ');
      const dateMatch = text.match(/((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d+,?\s+\d{4})\s*-\s*((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d+,?\s+\d{4})/);
      if (dateMatch) dateRange = { from: dateMatch[1], to: dateMatch[2] };
    }
  }
  
  return { rows, headers, dateRange };
};

// ============ AUTO-DETECT REPORT TYPE ============

const detectReportType = (headers, rows, fileName) => {
  const hSet = new Set(headers.map(h => h.toLowerCase().trim()));
  const fLower = fileName.toLowerCase();
  
  // Helper: Meta exports may use "Amount spent (USD)" (xlsx) or "Amount spent" (CSV)
  const hasMetaSpend = hSet.has('amount spent (usd)') || hSet.has('amount spent');
  
  // === AMAZON ===
  if (hSet.has('search query') && hSet.has('search query volume')) return 'amazonSearchQuery';
  
  // === SHOPIFY ===
  if (hSet.has('landing page type') && hSet.has('landing page path')) return 'shopifyLandingPages';
  if (hSet.has('day') && hSet.has('conversion rate') && hSet.has('sessions with cart additions')) return 'shopifyConversion';
  if (hSet.has('day') && hSet.has('average order value') && hSet.has('gross sales')) return 'shopifyAOV';
  if (hSet.has('day') && hSet.has('total sales') && hSet.has('net sales')) return 'shopifySales';
  if (hSet.has('day') && hSet.has('sessions') && hSet.has('online store visitors')) return 'shopifySessions';
  
  // === META ===
  if (hSet.has('ad set name') && hSet.has('age') && hasMetaSpend) return 'metaAdSetAge';
  if (hSet.has('ad set name') && hSet.has('gender') && hasMetaSpend) return 'metaAdSetGender';
  if (hSet.has('ad set name') && hSet.has('placement') && hSet.has('platform')) return 'metaAdSetPlacement';
  if (hSet.has('ad name') && hasMetaSpend) return 'metaAds';
  // Meta CSV daily format: Date + Ad name + Amount spent + Purchases value (all)
  if (hSet.has('date') && hSet.has('ad name') && hSet.has('amount spent')) return 'metaAds';
  if (hSet.has('ad set name') && hasMetaSpend && !hSet.has('ad name')) return 'metaAdSets';
  if (hSet.has('campaign name') && hasMetaSpend) return 'metaCampaign';
  // Meta Ads Manager export format (has Reporting starts/ends)
  if (hSet.has('reporting starts') && (hasMetaSpend || hSet.has('purchase roas (return on ad spend)'))) {
    if (hSet.has('ad name')) return 'metaAds';
    if (hSet.has('ad set name')) return 'metaAdSets';
    return 'metaCampaign';
  }
  
  // === GOOGLE ===
  if (hSet.has('asset group status') || hSet.has('asset group')) return 'googleAssetGroups';
  if (hSet.has('keyword status') && hSet.has('max. cpc')) return 'googleKeywords';
  if (hSet.has('search term') && hSet.has('match type') && (hSet.has('avg. cpc') || hSet.has('cost') || hSet.has('avg. cost'))) return 'googleSearchTerms';
  if (hSet.has('ad group') && hSet.has('campaign') && (hSet.has('clicks') || hSet.has('cost')) && !hSet.has('search term') && !hSet.has('keyword')) return 'googleAdGroup';
  if (hSet.has('campaign') && (hSet.has('campaign state') || hSet.has('campaign status')) && hSet.has('cost')) return 'googleCampaign';
  // Google Ads daily export (Day + Campaign + Cost/Impressions/Clicks, no Campaign state)
  if (hSet.has('day') && hSet.has('campaign') && (hSet.has('cost') || hSet.has('impressions')) && hSet.has('clicks')) return 'googleCampaign';
  
  return null;
};

// ============ AGGREGATORS ============

const aggregateGoogleCampaigns = (rows, dateRange) => {
  // Detect if this is a daily-granularity export (has 'Day' column)
  const hasDay = rows.length > 0 && ('Day' in rows[0] || 'day' in rows[0]);
  
  if (hasDay) {
    // Daily per-campaign/ad rows: aggregate by campaign across all dates
    const campMap = {};
    const dailyData = {}; // Also track daily trends
    
    for (const r of rows) {
      const campaign = r['Campaign'] || r['campaign'];
      if (!campaign) continue;
      
      const cost = num(r['Cost'] || r['cost'] || 0);
      const convValue = num(r['All conv. value'] || r['Conv. value'] || r['All conv. value'] || 0);
      const conversions = num(r['Conversions'] || r['conversions'] || 0);
      const impressions = num(r['Impressions'] || r['Impr.'] || r['impressions'] || 0);
      const clicks = num(r['Clicks'] || r['clicks'] || 0);
      const day = r['Day'] || r['day'] || '';
      
      if (!campMap[campaign]) {
        campMap[campaign] = { cost: 0, convValue: 0, conversions: 0, impressions: 0, clicks: 0, days: new Set() };
      }
      campMap[campaign].cost += cost;
      campMap[campaign].convValue += convValue;
      campMap[campaign].conversions += conversions;
      campMap[campaign].impressions += impressions;
      campMap[campaign].clicks += clicks;
      if (day) campMap[campaign].days.add(String(day));
      
      // Track daily totals for trend context
      const dayKey = String(day);
      if (dayKey) {
        if (!dailyData[dayKey]) dailyData[dayKey] = { cost: 0, convValue: 0, conversions: 0, impressions: 0, clicks: 0 };
        dailyData[dayKey].cost += cost;
        dailyData[dayKey].convValue += convValue;
        dailyData[dayKey].conversions += conversions;
        dailyData[dayKey].impressions += impressions;
        dailyData[dayKey].clicks += clicks;
      }
    }
    
    // Derive date range from data
    const allDays = Object.keys(dailyData).sort();
    const computedDateRange = allDays.length > 0 ? { from: allDays[0], to: allDays[allDays.length - 1] } : dateRange;
    
    const campaigns = Object.entries(campMap).map(([name, d]) => ({
      campaign: name,
      state: '',
      type: name.toLowerCase().includes('shopping') ? 'Shopping' : name.toLowerCase().includes('search') ? 'Search' : name.toLowerCase().includes('pmax') ? 'Performance Max' : '',
      clicks: d.clicks,
      impressions: d.impressions,
      ctr: d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0,
      avgCPC: d.clicks > 0 ? d.cost / d.clicks : 0,
      cost: d.cost,
      conversions: d.conversions,
      convValue: d.convValue,
      roas: d.cost > 0 ? d.convValue / d.cost : 0,
      convRate: d.clicks > 0 ? (d.conversions / d.clicks) * 100 : 0,
      costPerConv: d.conversions > 0 ? d.cost / d.conversions : 0,
      absTopImpr: 0,
      topImpr: 0,
      viewThrough: 0,
      daysActive: d.days.size,
      dateRange: computedDateRange,
    })).sort((a, b) => b.cost - a.cost);
    
    // Attach daily trend data for AI context
    campaigns._dailyTrend = dailyData;
    campaigns._dateRange = computedDateRange;
    campaigns._totalDays = allDays.length;
    
    return campaigns;
  }
  
  // Original pre-aggregated format (Google Ads Editor / campaign summary exports)
  return rows.filter(r => r['Campaign']).map(r => ({
    campaign: r['Campaign'],
    state: r['Campaign state'] || r['Campaign status'] || '',
    type: r['Campaign type'] || '',
    clicks: num(r['Clicks']),
    impressions: num(r['Impr.']),
    ctr: pct(r['CTR']),
    avgCPC: num(r['Avg. CPC']),
    cost: num(r['Cost']),
    conversions: num(r['Conversions']),
    convValue: num(r['Conv. value']),
    roas: num(r['Conv. value / cost']),
    convRate: pct(r['Conv. rate']),
    costPerConv: num(r['Cost / conv.']),
    absTopImpr: pct(r['Impr. (Abs. Top) %']),
    topImpr: pct(r['Impr. (Top) %']),
    viewThrough: num(r['View-through conv.']),
    dateRange,
  })).sort((a, b) => b.cost - a.cost);
};

const aggregateGoogleAdGroups = (rows, dateRange) => {
  return rows.filter(r => r['Ad group'] && num(r['Cost']) > 0).map(r => ({
    adGroup: r['Ad group'],
    campaign: r['Campaign'],
    state: r['Ad group state'] || '',
    type: r['Campaign type'] || '',
    clicks: num(r['Clicks']),
    impressions: num(r['Impr.']),
    ctr: pct(r['CTR']),
    avgCPC: num(r['Avg. CPC']),
    cost: num(r['Cost']),
    conversions: num(r['Conversions']),
    convValue: num(r['Conv. value']),
    roas: num(r['Conv. value / cost']),
    convRate: pct(r['Conv. rate']),
    costPerConv: num(r['Cost / conv.']),
    dateRange,
  })).sort((a, b) => b.cost - a.cost);
};

const aggregateGoogleSearchTerms = (rows, dateRange) => {
  const terms = rows.filter(r => r['Search term']).map(r => {
    // Google xlsx uses "Interactions"/"Interaction rate"/"Avg. cost"; CSV uses "Clicks"/"CTR"/"Avg. CPC"
    const clicks = num(r['Clicks'] || r['Interactions']);
    const impressions = num(r['Impr.'] || r['Impressions']);
    const cost = num(r['Cost'] || r['Avg. cost']); // Note: "Avg. cost" in search terms report IS total cost per term
    return {
      term: r['Search term'],
      matchType: r['Match type'] || '',
      campaign: r['Campaign'] || '',
      adGroup: r['Ad group'] || '',
      keyword: r['Keyword'] || '',
      clicks,
      impressions,
      ctr: pct(r['CTR'] || r['Interaction rate']),
      avgCPC: num(r['Avg. CPC']) || (clicks > 0 ? cost / clicks : 0),
      cost,
      conversions: num(r['Conversions']),
      convValue: num(r['Conv. value'] || r['All conv. value']),
      roas: num(r['Conv. value / cost']),
      convRate: pct(r['Conv. rate']),
      added: r['Added/Excluded'] || '',
    };
  });

  const totalCost = terms.reduce((s, t) => s + t.cost, 0);
  const totalConvValue = terms.reduce((s, t) => s + t.convValue, 0);
  const totalConversions = terms.reduce((s, t) => s + t.conversions, 0);
  
  return {
    totalTerms: terms.length,
    totalCost,
    totalConvValue,
    totalConversions,
    overallROAS: totalCost > 0 ? totalConvValue / totalCost : 0,
    topByROAS: terms.filter(t => t.cost >= 1 && t.conversions > 0).sort((a, b) => b.roas - a.roas).slice(0, 25),
    topByRevenue: terms.filter(t => t.convValue > 0).sort((a, b) => b.convValue - a.convValue).slice(0, 15),
    wasteful: terms.filter(t => t.cost >= 1 && t.conversions === 0).sort((a, b) => b.cost - a.cost).slice(0, 30),
    highVolNoConv: terms.filter(t => t.clicks >= 5 && t.conversions === 0).sort((a, b) => b.clicks - a.clicks).slice(0, 15),
    dateRange,
  };
};

const aggregateGoogleKeywords = (rows, dateRange) => {
  return rows.filter(r => r['Keyword']).map(r => ({
    keyword: r['Keyword'],
    matchType: r['Match type'] || '',
    campaign: r['Campaign'] || '',
    adGroup: r['Ad group'] || '',
    status: r['Keyword status'] || r['Status'] || '',
    maxCPC: num(r['Max. CPC']),
    clicks: num(r['Clicks']),
    impressions: num(r['Impr.']),
    cost: num(r['Cost']),
    conversions: num(r['Conversions']),
    convValue: num(r['Conv. value']),
    roas: num(r['Conv. value / cost']),
    convRate: pct(r['Conv. rate']),
    avgCPC: num(r['Avg. CPC']),
    costPerConv: num(r['Cost / conv.']),
  })).sort((a, b) => b.cost - a.cost);
};

const aggregateGoogleAssetGroups = (rows, dateRange) => {
  return rows.filter(r => r['Asset Group']).map(r => ({
    assetGroup: r['Asset Group'],
    campaign: r['Campaign'] || '',
    status: r['Asset group status'] || r['Status'] || '',
    adStrength: r['Ad Strength'] || '',
    impressions: num(r['Impr.']),
    interactions: num(r['Interactions']),
    interactionRate: pct(r['Interaction rate']),
    cost: num(r['Cost']),
    convValue: num(r['Conv. value']),
    roas: num(r['Conv. value / cost']),
    conversions: num(r['Conversions']),
    convRate: pct(r['Conv. rate']),
    costPerConv: num(r['Cost / conv.']),
    headlines: r['Headlines'] || '',
    searchThemes: r['Search themes'] || '',
    dateRange,
  })).sort((a, b) => b.cost - a.cost);
};

// === META AGGREGATORS ===

// Helper: Meta exports may use "Amount spent (USD)" (Ads Manager xlsx) or "Amount spent" (CSV/third-party)
const metaSpend = (r) => num(r['Amount spent (USD)'] || r['Amount Spent (USD)'] || r['Amount spent'] || r['Amount Spent']);
const metaClicks = (r) => num(r['Link clicks'] || r['Link Clicks'] || r['Clicks (all)']);
const metaPurchases = (r) => num(r['Purchases'] || r['Purchases (all)']);
const metaPurchaseValue = (r) => num(r['Purchases conversion value'] || r['Purchases value (all)']);
const metaCostPerPurchase = (r) => num(r['Cost per purchase (USD)'] || r['Cost per Purchase (all)']);
const metaROAS = (r) => num(r['Purchase ROAS (return on ad spend)'] || r['Purchase (ROAS) (all)']);
const metaCPM = (r) => num(r['CPM (cost per 1,000 impressions) (USD)'] || r['CPM']);
const metaCPC = (r) => num(r['CPC (cost per link click) (USD)'] || r['Cost per link click']);
const metaCTR = (r) => pct(r['CTR (all)'] || r['CTR']);

const aggregateMetaCampaigns = (rows, dateRange) => {
  return rows.filter(r => r['Campaign name'] || r['Campaign Name']).map(r => ({
    campaign: r['Campaign name'] || r['Campaign Name'] || '',
    delivery: r['Campaign delivery'] || r['Campaign Delivery'] || '',
    spend: metaSpend(r),
    impressions: num(r['Impressions']),
    reach: num(r['Reach']),
    frequency: num(r['Frequency']),
    cpm: metaCPM(r),
    cpc: metaCPC(r),
    clicks: metaClicks(r),
    purchases: metaPurchases(r),
    purchaseValue: metaPurchaseValue(r),
    costPerPurchase: metaCostPerPurchase(r),
    roas: metaROAS(r),
    addToCart: num(r['Adds to cart']),
    checkouts: num(r['Checkouts initiated']),
    dateRange,
  })).filter(r => r.spend > 0 || r.campaign).sort((a, b) => b.spend - a.spend);
};

const aggregateMetaAdSets = (rows, dateRange) => {
  return rows.filter(r => r['Ad set name'] && metaSpend(r) > 0).map(r => ({
    adSet: r['Ad set name'],
    delivery: r['Ad set delivery'] || '',
    spend: metaSpend(r),
    impressions: num(r['Impressions']),
    reach: num(r['Reach']),
    frequency: num(r['Frequency']),
    cpm: metaCPM(r),
    cpc: metaCPC(r),
    clicks: metaClicks(r),
    purchases: metaPurchases(r),
    purchaseValue: metaPurchaseValue(r),
    costPerPurchase: metaCostPerPurchase(r),
    roas: metaROAS(r),
    addToCart: num(r['Adds to cart']),
    cartValue: num(r['Adds to cart conversion value']),
    checkouts: num(r['Checkouts initiated']),
    dateRange,
  })).sort((a, b) => b.spend - a.spend);
};

const aggregateMetaAds = (rows, dateRange) => {
  // Handle both period-level and daily-granularity Meta exports
  const hasDate = rows.length > 0 && (rows[0]['Date'] != null || rows[0]['date'] != null);
  
  if (hasDate) {
    // Daily CSV format (Date, Ad name, Amount spent, ...) — aggregate by ad name across dates
    const adMap = {};
    const dailyTotals = {}; // Track daily totals for allDaysData feed
    for (const r of rows) {
      const adName = r['Ad name'] || r['Ad Name'] || '';
      if (!adName) continue;
      const spend = metaSpend(r);
      const imp = num(r['Impressions']);
      const clk = metaClicks(r);
      const purch = metaPurchases(r);
      const pval = metaPurchaseValue(r);
      if (spend <= 0 && imp <= 0) continue;
      if (!adMap[adName]) {
        adMap[adName] = { adName, adSet: '', delivery: '', spend: 0, impressions: 0, reach: 0, frequency: 0,
          cpm: 0, cpc: 0, ctr: 0, clicks: 0, purchases: 0, purchaseValue: 0, costPerPurchase: 0, roas: 0,
          addToCart: 0, checkouts: 0, qualityRanking: '', engagementRanking: '', conversionRanking: '', days: new Set() };
      }
      const a = adMap[adName];
      a.spend += spend;
      a.impressions += imp;
      a.clicks += clk;
      a.purchases += purch;
      a.purchaseValue += pval;
      a.reach += num(r['Reach']);
      a.addToCart += num(r['Adds to cart']);
      a.checkouts += num(r['Checkouts initiated']);
      const dateVal = r['Date'] || r['date'] || '';
      if (dateVal) a.days.add(String(dateVal));
      
      // Daily totals for feed
      const dayKey = String(dateVal);
      if (dayKey) {
        if (!dailyTotals[dayKey]) dailyTotals[dayKey] = { cost: 0, impressions: 0, clicks: 0, conversions: 0, convValue: 0 };
        dailyTotals[dayKey].cost += spend;
        dailyTotals[dayKey].impressions += imp;
        dailyTotals[dayKey].clicks += clk;
        dailyTotals[dayKey].conversions += purch;
        dailyTotals[dayKey].convValue += pval;
      }
    }
    // Compute derived metrics
    const result = Object.values(adMap).map(a => ({
      ...a,
      cpm: a.impressions > 0 ? (a.spend / a.impressions) * 1000 : 0,
      cpc: a.clicks > 0 ? a.spend / a.clicks : 0,
      ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0,
      roas: a.spend > 0 ? a.purchaseValue / a.spend : 0,
      costPerPurchase: a.purchases > 0 ? a.spend / a.purchases : 0,
      daysActive: a.days ? a.days.size : 0,
      dateRange,
    })).sort((a, b) => b.spend - a.spend);
    // Attach daily totals for allDaysData feed
    result._dailyTrend = dailyTotals;
    return result;
  }
  
  // Period-level format (Ads Manager xlsx — one row per ad)
  return rows.filter(r => r['Ad name'] && metaSpend(r) > 0).map(r => ({
    adName: r['Ad name'],
    adSet: r['Ad set name'] || '',
    delivery: r['Ad delivery'] || '',
    spend: metaSpend(r),
    impressions: num(r['Impressions']),
    reach: num(r['Reach']),
    frequency: num(r['Frequency']),
    cpm: metaCPM(r),
    cpc: metaCPC(r),
    ctr: metaCTR(r),
    clicks: metaClicks(r),
    purchases: metaPurchases(r),
    purchaseValue: metaPurchaseValue(r),
    costPerPurchase: metaCostPerPurchase(r),
    roas: metaROAS(r),
    addToCart: num(r['Adds to cart']),
    checkouts: num(r['Checkouts initiated']),
    qualityRanking: r['Quality ranking'] || '',
    engagementRanking: r['Engagement rate ranking'] || '',
    conversionRanking: r['Conversion rate ranking'] || '',
    dateRange,
  })).sort((a, b) => b.spend - a.spend);
};

const aggregateMetaDemographic = (rows, dimensionKey, dateRange) => {
  return rows.filter(r => r[dimensionKey] && metaSpend(r) > 0).map(r => ({
    dimension: r[dimensionKey],
    adSet: r['Ad set name'] || '',
    spend: metaSpend(r),
    impressions: num(r['Impressions']),
    clicks: metaClicks(r),
    cpc: metaCPC(r),
    purchases: metaPurchases(r),
    purchaseValue: metaPurchaseValue(r),
    roas: num(r['Purchase ROAS (return on ad spend)']),
    costPerPurchase: num(r['Cost per purchase (USD)']),
    addToCart: num(r['Adds to cart']),
    dateRange,
  })).sort((a, b) => b.spend - a.spend);
};

// === AMAZON SEARCH QUERY ===

const aggregateAmazonSearchQuery = (rows) => {
  return rows.filter(r => r['Search Query']).map(r => ({
    query: String(r['Search Query']).replace(/^"|"$/g, ''),
    score: num(r['Search Query Score']),
    volume: num(r['Search Query Volume']),
    totalImpressions: num(r['Impressions: Total Count']),
    brandImpressions: num(r['Impressions: Brand Count']),
    brandImprShare: num(r['Impressions: Brand Share %']),
    totalClicks: num(r['Clicks: Total Count']),
    brandClicks: num(r['Clicks: Brand Count']),
    brandClickShare: num(r['Clicks: Brand Share %']),
    totalPurchases: num(r['Purchases: Total Count']),
    brandPurchases: num(r['Purchases: Brand Count']),
    brandPurchaseShare: num(r['Purchases: Brand Share %']),
    totalCartAdds: num(r['Cart Adds: Total Count']),
    brandCartAdds: num(r['Cart Adds: Brand Count']),
    brandCartShare: num(r['Cart Adds: Brand Share %']),
  })).filter(r => r.totalImpressions > 0).sort((a, b) => b.volume - a.volume);
};

// === SHOPIFY ===

const aggregateShopifySales = (rows) => {
  return rows.filter(r => r['Day']).map(r => ({
    day: r['Day'],
    orders: num(r['Orders']),
    grossSales: num(r['Gross sales']),
    discounts: num(r['Discounts']),
    returns: num(r['Returns']),
    netSales: num(r['Net sales']),
    shipping: num(r['Shipping charges']),
    taxes: num(r['Taxes']),
    totalSales: num(r['Total sales']),
  }));
};

const aggregateShopifySessions = (rows) => {
  return rows.filter(r => r['Day']).map(r => ({
    day: r['Day'],
    visitors: num(r['Online store visitors']),
    sessions: num(r['Sessions']),
  }));
};

const aggregateShopifyAOV = (rows) => {
  return rows.filter(r => r['Day']).map(r => ({
    day: r['Day'],
    grossSales: num(r['Gross sales']),
    discounts: num(r['Discounts']),
    orders: num(r['Orders']),
    aov: num(r['Average order value']),
  }));
};

const aggregateShopifyConversion = (rows) => {
  return rows.filter(r => r['Day']).map(r => ({
    day: r['Day'],
    sessions: num(r['Sessions']),
    cartSessions: num(r['Sessions with cart additions']),
    checkoutSessions: num(r['Sessions that reached checkout']),
    completedSessions: num(r['Sessions that completed checkout']),
    convRate: num(r['Conversion rate']),
  }));
};

const aggregateShopifyLandingPages = (rows) => {
  return rows.filter(r => r['Landing page path']).map(r => ({
    type: r['Landing page type'] || '',
    path: r['Landing page path'],
    visitors: num(r['Online store visitors']),
    sessions: num(r['Sessions']),
    cartSessions: num(r['Sessions with cart additions']),
    checkoutSessions: num(r['Sessions that reached checkout']),
  })).sort((a, b) => b.sessions - a.sessions);
};

// ============ BUILD AI CONTEXT ============

export const buildDtcIntelContext = (intelData) => {
  if (!intelData || !intelData.lastUpdated) return '';
  let ctx = `\n=== DTC ADVERTISING INTELLIGENCE (Updated: ${new Date(intelData.lastUpdated).toLocaleDateString()}) ===\n`;

  // Google Campaigns
  const gc = intelData.googleCampaign;
  if (gc?.length > 0) {
    const totalCost = gc.reduce((s, c) => s + c.cost, 0);
    const totalConvVal = gc.reduce((s, c) => s + c.convValue, 0);
    const totalConversions = gc.reduce((s, c) => s + c.conversions, 0);
    const totalClicks = gc.reduce((s, c) => s + c.clicks, 0);
    const totalImpr = gc.reduce((s, c) => s + c.impressions, 0);
    
    ctx += `\n--- GOOGLE CAMPAIGNS (${gc.length}) | Total Spend $${Math.round(totalCost)} | Conv Value $${Math.round(totalConvVal)} | ROAS ${totalCost > 0 ? (totalConvVal / totalCost).toFixed(2) : 'N/A'} | Conv ${totalConversions} | Clicks ${totalClicks} | Impr ${totalImpr.toLocaleString()}`;
    
    // Include date range if available from daily data
    if (gc._dateRange) {
      ctx += ` | Period: ${gc._dateRange.from || ''} to ${gc._dateRange.to || ''} (${gc._totalDays || '?'} days)`;
    }
    ctx += ` ---
${gc.filter(c => c.cost > 0).map(c => `  ${c.campaign} [${c.type || '?'}] ${c.state || ''} | Spend $${c.cost.toFixed(2)} | Conv Val $${c.convValue.toFixed(2)} | ROAS ${c.roas.toFixed(2)} | Conv ${c.conversions} | CPC $${c.avgCPC.toFixed(2)} | CTR ${typeof c.ctr === 'number' ? c.ctr.toFixed(1) : c.ctr}% | CostPerConv $${c.costPerConv?.toFixed(2) || '0.00'}${c.daysActive ? ` | ${c.daysActive}d active` : ''}${c.absTopImpr ? ` | AbsTop ${c.absTopImpr}%` : ''}`).join('\n')}
`;

    // Campaign type breakdown
    const byType = {};
    gc.filter(c => c.cost > 0).forEach(c => {
      const t = c.type || 'Unknown';
      if (!byType[t]) byType[t] = { cost: 0, convValue: 0, conversions: 0, clicks: 0, impressions: 0 };
      byType[t].cost += c.cost;
      byType[t].convValue += c.convValue;
      byType[t].conversions += c.conversions;
      byType[t].clicks += c.clicks;
      byType[t].impressions += c.impressions;
    });
    if (Object.keys(byType).length > 1) {
      ctx += `CAMPAIGN TYPE BREAKDOWN:
${Object.entries(byType).sort((a, b) => b[1].cost - a[1].cost).map(([t, d]) => `  ${t}: Spend $${d.cost.toFixed(2)} | Conv Val $${d.convValue.toFixed(2)} | ROAS ${d.cost > 0 ? (d.convValue / d.cost).toFixed(2) : 'N/A'} | Conv ${d.conversions} | CPC $${d.clicks > 0 ? (d.cost / d.clicks).toFixed(2) : '0.00'}`).join('\n')}
`;
    }

    // Daily trend if available
    if (gc._dailyTrend) {
      const days = Object.entries(gc._dailyTrend).sort((a, b) => a[0].localeCompare(b[0]));
      if (days.length > 0) {
        ctx += `DAILY TREND (${days.length} days):
${days.map(([d, v]) => `  ${d}: Spend $${v.cost.toFixed(2)} | Conv Val $${v.convValue.toFixed(2)} | ROAS ${v.cost > 0 ? (v.convValue / v.cost).toFixed(2) : '0'} | Conv ${v.conversions} | Clicks ${v.clicks}`).join('\n')}
`;
      }
    }
  }

  // Google Ad Groups
  if (intelData.googleAdGroup?.length > 0) {
    ctx += `\n--- GOOGLE AD GROUPS (${intelData.googleAdGroup.length} with spend) ---
${intelData.googleAdGroup.slice(0, 20).map(g => `  "${g.adGroup}" in ${g.campaign.substring(0, 40)} | Spend $${g.cost.toFixed(2)} | ROAS ${g.roas.toFixed(2)} | Conv ${g.conversions} | CPC $${g.avgCPC.toFixed(2)} | CTR ${g.ctr}%`).join('\n')}
`;
  }

  // Google Search Terms
  if (intelData.googleSearchTerms) {
    const st = intelData.googleSearchTerms;
    ctx += `\n--- GOOGLE SEARCH TERMS (${st.totalTerms} terms) | Total Cost $${Math.round(st.totalCost)} | Conv Value $${Math.round(st.totalConvValue)} | ROAS ${st.overallROAS.toFixed(2)} ---
TOP CONVERTING (by ROAS):
${st.topByROAS.slice(0, 15).map(t => `  "${t.term}" [${t.matchType}] | Cost $${t.cost.toFixed(2)} | Conv Val $${t.convValue.toFixed(2)} | ROAS ${t.roas.toFixed(2)} | Conv ${t.conversions} | Clicks ${t.clicks} | in "${t.campaign.substring(0, 40)}"`).join('\n')}

TOP BY REVENUE:
${st.topByRevenue.slice(0, 10).map(t => `  "${t.term}" | Rev $${t.convValue.toFixed(2)} | Cost $${t.cost.toFixed(2)} | ROAS ${t.roas.toFixed(2)} | Conv ${t.conversions}`).join('\n')}

WASTED SPEND (cost but $0 conversions):
${st.wasteful.slice(0, 20).map(t => `  "${t.term}" [${t.matchType}] | WASTED $${t.cost.toFixed(2)} | ${t.clicks} clicks | in "${t.campaign.substring(0, 40)}" | ${t.added || 'None'}`).join('\n')}

HIGH CLICK NO CONVERSION (5+ clicks, 0 conv):
${st.highVolNoConv.slice(0, 10).map(t => `  "${t.term}" | ${t.clicks} clicks | $${t.cost.toFixed(2)} wasted | ${t.matchType}`).join('\n')}
`;
  }

  // Google Keywords
  if (intelData.googleKeywords?.length > 0) {
    const kw = intelData.googleKeywords;
    ctx += `\n--- GOOGLE KEYWORDS (${kw.length}) ---
TOP PERFORMING:
${kw.filter(k => k.cost > 0 && k.conversions > 0).sort((a, b) => b.roas - a.roas).slice(0, 15).map(k => `  "${k.keyword}" [${k.matchType}] | Max CPC $${k.maxCPC.toFixed(2)} | Avg CPC $${k.avgCPC.toFixed(2)} | Cost $${k.cost.toFixed(2)} | ROAS ${k.roas.toFixed(2)} | Conv ${k.conversions}`).join('\n')}

WASTEFUL KEYWORDS:
${kw.filter(k => k.cost > 1 && k.conversions === 0).sort((a, b) => b.cost - a.cost).slice(0, 10).map(k => `  "${k.keyword}" [${k.matchType}] | Max CPC $${k.maxCPC.toFixed(2)} | WASTED $${k.cost.toFixed(2)} | ${k.clicks} clicks`).join('\n')}
`;
  }

  // Google PMax Asset Groups
  if (intelData.googleAssetGroups?.length > 0) {
    ctx += `\n--- GOOGLE PMAX ASSET GROUPS (${intelData.googleAssetGroups.length}) ---
${intelData.googleAssetGroups.map(a => `  "${a.assetGroup}" in ${a.campaign.substring(0, 40)} | ${a.status} | Ad Strength: ${a.adStrength} | Cost $${a.cost.toFixed(2)} | ROAS ${a.roas.toFixed(2)} | Conv ${a.conversions} | Search Themes: ${(a.searchThemes || '').substring(0, 80)}`).join('\n')}
`;
  }

  // Meta Campaigns
  if (intelData.metaCampaign?.length > 0) {
    const mc = intelData.metaCampaign;
    const totalSpend = mc.reduce((s, c) => s + c.spend, 0);
    const totalPurchaseVal = mc.reduce((s, c) => s + c.purchaseValue, 0);
    ctx += `\n--- META CAMPAIGNS (${mc.length}) | Total Spend $${Math.round(totalSpend)} | Purchase Value $${Math.round(totalPurchaseVal)} | ROAS ${totalSpend > 0 ? (totalPurchaseVal / totalSpend).toFixed(2) : 'N/A'} ---
${mc.filter(c => c.spend > 0).map(c => `  "${c.campaign}" [${c.delivery}] | Spend $${c.spend.toFixed(2)} | Purchases ${c.purchases} | Purch Value $${c.purchaseValue.toFixed(2)} | ROAS ${c.roas.toFixed(2)} | CPP $${c.costPerPurchase.toFixed(2)} | CPM $${c.cpm.toFixed(2)} | CPC $${c.cpc.toFixed(2)} | Clicks ${c.clicks} | ATC ${c.addToCart}`).join('\n')}
`;
  }

  // Meta Ad Sets
  if (intelData.metaAdSets?.length > 0) {
    ctx += `\n--- META AD SETS (${intelData.metaAdSets.length} with spend) ---
${intelData.metaAdSets.map(a => `  "${a.adSet}" [${a.delivery}] | Spend $${a.spend.toFixed(2)} | Purchases ${a.purchases} | ROAS ${a.roas.toFixed(2)} | CPP $${a.costPerPurchase.toFixed(2)} | CPC $${a.cpc.toFixed(2)} | Clicks ${a.clicks} | ATC ${a.addToCart} | Checkouts ${a.checkouts}`).join('\n')}
`;
  }

  // Meta Ads
  if (intelData.metaAds?.length > 0) {
    ctx += `\n--- META ADS (${intelData.metaAds.length} with spend) ---
${intelData.metaAds.slice(0, 20).map(a => `  "${a.adName}" in "${a.adSet}" | Spend $${a.spend.toFixed(2)} | Purchases ${a.purchases} | ROAS ${a.roas.toFixed(2)} | CPP $${a.costPerPurchase.toFixed(2)} | CPC $${a.cpc.toFixed(2)} | Clicks ${a.clicks} | Quality: ${a.qualityRanking || '-'} | Engagement: ${a.engagementRanking || '-'} | Conv: ${a.conversionRanking || '-'}`).join('\n')}
`;
  }

  // Meta Demographics
  if (intelData.metaAdSetAge?.length > 0) {
    const byAge = {};
    intelData.metaAdSetAge.forEach(r => {
      if (!byAge[r.dimension]) byAge[r.dimension] = { spend: 0, purchases: 0, purchaseValue: 0, clicks: 0 };
      byAge[r.dimension].spend += r.spend;
      byAge[r.dimension].purchases += r.purchases;
      byAge[r.dimension].purchaseValue += r.purchaseValue;
      byAge[r.dimension].clicks += r.clicks;
    });
    ctx += `\n--- META AGE BREAKDOWN ---
${Object.entries(byAge).sort((a, b) => b[1].spend - a[1].spend).map(([age, d]) => `  ${age}: Spend $${d.spend.toFixed(2)} | Purchases ${d.purchases} | Rev $${d.purchaseValue.toFixed(2)} | ROAS ${d.spend > 0 ? (d.purchaseValue / d.spend).toFixed(2) : 'N/A'} | Clicks ${d.clicks}`).join('\n')}
`;
  }

  if (intelData.metaAdSetGender?.length > 0) {
    const byGender = {};
    intelData.metaAdSetGender.forEach(r => {
      if (!byGender[r.dimension]) byGender[r.dimension] = { spend: 0, purchases: 0, purchaseValue: 0, clicks: 0 };
      byGender[r.dimension].spend += r.spend;
      byGender[r.dimension].purchases += r.purchases;
      byGender[r.dimension].purchaseValue += r.purchaseValue;
      byGender[r.dimension].clicks += r.clicks;
    });
    ctx += `\n--- META GENDER BREAKDOWN ---
${Object.entries(byGender).sort((a, b) => b[1].spend - a[1].spend).map(([g, d]) => `  ${g}: Spend $${d.spend.toFixed(2)} | Purchases ${d.purchases} | Rev $${d.purchaseValue.toFixed(2)} | ROAS ${d.spend > 0 ? (d.purchaseValue / d.spend).toFixed(2) : 'N/A'} | Clicks ${d.clicks}`).join('\n')}
`;
  }

  if (intelData.metaAdSetPlacement?.length > 0) {
    const byPlacement = {};
    intelData.metaAdSetPlacement.forEach(r => {
      const key = `${r.dimension}`;
      if (!byPlacement[key]) byPlacement[key] = { spend: 0, purchases: 0, purchaseValue: 0, clicks: 0, impressions: 0 };
      byPlacement[key].spend += r.spend;
      byPlacement[key].purchases += r.purchases;
      byPlacement[key].purchaseValue += r.purchaseValue;
      byPlacement[key].clicks += r.clicks;
      byPlacement[key].impressions += r.impressions;
    });
    ctx += `\n--- META PLACEMENT BREAKDOWN (top by spend) ---
${Object.entries(byPlacement).sort((a, b) => b[1].spend - a[1].spend).slice(0, 15).map(([p, d]) => `  ${p}: Spend $${d.spend.toFixed(2)} | Purchases ${d.purchases} | ROAS ${d.spend > 0 ? (d.purchaseValue / d.spend).toFixed(2) : 'N/A'} | Clicks ${d.clicks}`).join('\n')}
`;
  }

  // Amazon Search Query
  if (intelData.amazonSearchQuery?.length > 0) {
    const sq = intelData.amazonSearchQuery;
    ctx += `\n--- AMAZON SEARCH QUERY PERFORMANCE (Brand View, ${sq.length} queries) ---
TOP BY VOLUME:
${sq.slice(0, 15).map(q => `  "${q.query}" | Vol ${q.volume.toLocaleString()} | Brand Impr ${q.brandImprShare.toFixed(1)}% | Brand Click ${q.brandClickShare.toFixed(1)}% | Brand Purch ${q.brandPurchaseShare.toFixed(1)}% | ${q.brandPurchases} brand purchases`).join('\n')}

OPPORTUNITY (low brand share, high volume):
${sq.filter(q => q.brandImprShare < 20 && q.volume > 500).sort((a, b) => b.volume - a.volume).slice(0, 10).map(q => `  "${q.query}" | Vol ${q.volume.toLocaleString()} | Only ${q.brandImprShare.toFixed(1)}% impr share → OPPORTUNITY`).join('\n')}

DEFEND (high purchase share):
${sq.filter(q => q.brandPurchaseShare > 30 && q.volume > 100).sort((a, b) => b.brandPurchaseShare - a.brandPurchaseShare).slice(0, 10).map(q => `  "${q.query}" | ${q.brandPurchaseShare.toFixed(1)}% purchase share | ${q.brandPurchases} purchases`).join('\n')}
`;
  }

  // Shopify
  if (intelData.shopifySales?.length > 0) {
    const sales = intelData.shopifySales;
    const totalOrders = sales.reduce((s, d) => s + d.orders, 0);
    const totalGross = sales.reduce((s, d) => s + d.grossSales, 0);
    const totalNet = sales.reduce((s, d) => s + d.netSales, 0);
    const totalDisc = sales.reduce((s, d) => s + d.discounts, 0);
    ctx += `\n--- SHOPIFY SALES (${sales.length} days) ---
TOTALS: Orders ${totalOrders} | Gross $${totalGross.toFixed(2)} | Discounts $${totalDisc.toFixed(2)} | Net $${totalNet.toFixed(2)}
AVG/DAY: ${(totalOrders / sales.length).toFixed(1)} orders | $${(totalGross / sales.length).toFixed(2)} gross
DAILY: ${sales.map(d => `${String(d.day).substring(0, 10)}: ${d.orders} orders $${d.grossSales.toFixed(0)} gross $${d.netSales.toFixed(0)} net`).join(' | ')}
`;
  }

  if (intelData.shopifySessions?.length > 0) {
    const sess = intelData.shopifySessions;
    const totalSess = sess.reduce((s, d) => s + d.sessions, 0);
    ctx += `\n--- SHOPIFY SESSIONS (${sess.length} days) | Total ${totalSess} sessions ---
${sess.map(d => `${String(d.day).substring(0, 10)}: ${d.visitors} visitors / ${d.sessions} sessions`).join(' | ')}
`;
  }

  if (intelData.shopifyConversion?.length > 0) {
    const conv = intelData.shopifyConversion;
    const avgRate = conv.reduce((s, d) => s + d.convRate, 0) / conv.length;
    ctx += `\n--- SHOPIFY CONVERSION FUNNEL (avg conv rate: ${(avgRate * 100).toFixed(2)}%) ---
${conv.map(d => `${String(d.day).substring(0, 10)}: ${d.sessions} sessions → ${d.cartSessions} cart → ${d.checkoutSessions} checkout → ${d.completedSessions} purchased (${(d.convRate * 100).toFixed(1)}%)`).join('\n')}
`;
  }

  if (intelData.shopifyAOV?.length > 0) {
    const aov = intelData.shopifyAOV;
    const avgAOV = aov.reduce((s, d) => s + d.aov, 0) / aov.length;
    ctx += `\n--- SHOPIFY AOV (avg: $${avgAOV.toFixed(2)}) ---
${aov.map(d => `${String(d.day).substring(0, 10)}: AOV $${d.aov.toFixed(2)} | ${d.orders} orders | Gross $${d.grossSales.toFixed(2)} | Disc $${d.discounts.toFixed(2)}`).join('\n')}
`;
  }

  if (intelData.shopifyLandingPages?.length > 0) {
    ctx += `\n--- SHOPIFY LANDING PAGES (top 15) ---
${intelData.shopifyLandingPages.slice(0, 15).map(p => `  ${p.path} [${p.type}] | ${p.sessions} sessions | ${p.cartSessions} cart adds | ${p.checkoutSessions} to checkout`).join('\n')}
`;
  }

  return ctx;
};

// ============ AI REPORT PROMPT ============

export const buildDtcActionReportPrompt = (intelData, storeName) => {
  if (!intelData) return null;

  const available = [];
  if (intelData.googleCampaign?.length) available.push(`Google Campaigns (${intelData.googleCampaign.length})`);
  if (intelData.googleAdGroup?.length) available.push(`Google Ad Groups (${intelData.googleAdGroup.length})`);
  if (intelData.googleSearchTerms) available.push(`Google Search Terms (${intelData.googleSearchTerms.totalTerms})`);
  if (intelData.googleKeywords?.length) available.push(`Google Keywords (${intelData.googleKeywords.length})`);
  if (intelData.googleAssetGroups?.length) available.push(`Google PMax Assets (${intelData.googleAssetGroups.length})`);
  if (intelData.metaCampaign?.length) available.push(`Meta Campaigns (${intelData.metaCampaign.length})`);
  if (intelData.metaAdSets?.length) available.push(`Meta Ad Sets (${intelData.metaAdSets.length})`);
  if (intelData.metaAds?.length) available.push(`Meta Ads (${intelData.metaAds.length})`);
  if (intelData.metaAdSetAge?.length) available.push('Meta Age Data');
  if (intelData.metaAdSetGender?.length) available.push('Meta Gender Data');
  if (intelData.metaAdSetPlacement?.length) available.push('Meta Placement Data');
  if (intelData.amazonSearchQuery?.length) available.push(`Amazon Search Query (${intelData.amazonSearchQuery.length})`);
  if (intelData.shopifySales?.length) available.push('Shopify Sales');
  if (intelData.shopifySessions?.length) available.push('Shopify Sessions');
  if (intelData.shopifyAOV?.length) available.push('Shopify AOV');
  if (intelData.shopifyConversion?.length) available.push('Shopify Conversion');
  if (intelData.shopifyLandingPages?.length) available.push('Shopify Landing Pages');

  // Detect which platforms have data for conditional framework/section inclusion
  const hasMeta = !!(intelData.metaCampaign?.length || intelData.metaAdSets?.length || intelData.metaAds?.length);
  const hasMetaDemographics = !!(intelData.metaAdSetAge?.length || intelData.metaAdSetGender?.length || intelData.metaAdSetPlacement?.length);
  const hasGoogle = !!(intelData.googleCampaign?.length || intelData.googleSearchTerms || intelData.googleKeywords?.length);
  const hasGooglePMax = !!(intelData.googleAssetGroups?.length);
  const hasShopify = !!(intelData.shopifySales?.length || intelData.shopifySessions?.length || intelData.shopifyConversion?.length);
  const hasShopifyPages = !!(intelData.shopifyLandingPages?.length);
  const hasAmazonSQP = !!(intelData.amazonSearchQuery?.length);

  const dataContext = buildDtcIntelContext(intelData);

  // ===== COMPUTE ADVANCED CROSS-CHANNEL METRICS =====
  let advancedContext = '';

  // 1. Cross-channel ROAS comparison
  const metaSpend = (intelData.metaCampaign || []).reduce((s, c) => s + c.spend, 0);
  const metaRevenue = (intelData.metaCampaign || []).reduce((s, c) => s + c.purchaseValue, 0);
  const metaPurchases = (intelData.metaCampaign || []).reduce((s, c) => s + c.purchases, 0);
  const googleSpend = (intelData.googleCampaign || []).reduce((s, c) => s + c.cost, 0);
  const googleRevenue = (intelData.googleCampaign || []).reduce((s, c) => s + c.convValue, 0);
  const googleConversions = (intelData.googleCampaign || []).reduce((s, c) => s + c.conversions, 0);
  const totalAdSpend = metaSpend + googleSpend;
  const totalAdRevenue = metaRevenue + googleRevenue;
  const shopifyRevenue = (intelData.shopifySales || []).reduce((s, d) => s + d.grossSales, 0);
  const shopifyOrders = (intelData.shopifySales || []).reduce((s, d) => s + d.orders, 0);
  const shopifyNet = (intelData.shopifySales || []).reduce((s, d) => s + d.netSales, 0);
  const shopifyDays = (intelData.shopifySales || []).length || 1;

  // Funnel metrics
  const avgSessions = (intelData.shopifySessions || []).reduce((s, d) => s + d.sessions, 0);
  const avgConvRate = (intelData.shopifyConversion || []).length > 0
    ? (intelData.shopifyConversion.reduce((s, d) => s + d.convRate, 0) / intelData.shopifyConversion.length)
    : 0;
  const avgAOV = (intelData.shopifyAOV || []).length > 0
    ? (intelData.shopifyAOV.reduce((s, d) => s + d.aov, 0) / intelData.shopifyAOV.length)
    : (shopifyOrders > 0 ? shopifyRevenue / shopifyOrders : 0);
  const avgCartRate = (intelData.shopifyConversion || []).length > 0
    ? (intelData.shopifyConversion.reduce((s, d) => s + (d.sessions > 0 ? d.cartSessions / d.sessions : 0), 0) / intelData.shopifyConversion.length)
    : 0;
  const avgCheckoutRate = (intelData.shopifyConversion || []).length > 0
    ? (intelData.shopifyConversion.reduce((s, d) => s + (d.cartSessions > 0 ? d.checkoutSessions / d.cartSessions : 0), 0) / intelData.shopifyConversion.length)
    : 0;
  const avgCheckoutComplete = (intelData.shopifyConversion || []).length > 0
    ? (intelData.shopifyConversion.reduce((s, d) => s + (d.checkoutSessions > 0 ? d.completedSessions / d.checkoutSessions : 0), 0) / intelData.shopifyConversion.length)
    : 0;

  // Meta creative efficiency
  let topAd = null, worstAd = null, avgCPP = 0;
  if (intelData.metaAds?.length > 0) {
    const adsWithPurchases = intelData.metaAds.filter(a => a.purchases > 0 && a.spend > 5);
    if (adsWithPurchases.length > 0) {
      avgCPP = adsWithPurchases.reduce((s, a) => s + a.costPerPurchase, 0) / adsWithPurchases.length;
      topAd = adsWithPurchases.sort((a, b) => b.roas - a.roas)[0];
      worstAd = intelData.metaAds.filter(a => a.spend > 10).sort((a, b) => a.roas - b.roas)[0];
    }
  }

  // Meta frequency / fatigue analysis
  const highFreqCampaigns = (intelData.metaCampaign || []).filter(c => c.frequency > 2.5 && c.spend > 20);
  const lowROASPlacements = [];
  if (intelData.metaAdSetPlacement?.length > 0) {
    const byPlacement = {};
    intelData.metaAdSetPlacement.forEach(r => {
      if (!byPlacement[r.dimension]) byPlacement[r.dimension] = { spend: 0, purchases: 0, purchaseValue: 0 };
      byPlacement[r.dimension].spend += r.spend;
      byPlacement[r.dimension].purchases += r.purchases;
      byPlacement[r.dimension].purchaseValue += r.purchaseValue;
    });
    Object.entries(byPlacement).forEach(([p, d]) => {
      if (d.spend > 10 && d.purchases === 0) lowROASPlacements.push({ placement: p, spend: d.spend });
    });
  }

  // Google brand vs non-brand split
  let gBrandSpend = 0, gBrandConvVal = 0, gNonBrandSpend = 0, gNonBrandConvVal = 0;
  const brandTerms = storeName
    ? [storeName.toLowerCase(), storeName.toLowerCase().replace(/\s+/g, '')]
    : [];
  if (intelData.googleSearchTerms) {
    const st = intelData.googleSearchTerms;
    [...(st.topByROAS || []), ...(st.topByRevenue || []), ...(st.wasteful || [])].forEach(t => {
      const isBrand = brandTerms.some(b => (t.term || '').toLowerCase().includes(b));
      if (isBrand) { gBrandSpend += t.cost; gBrandConvVal += t.convValue; }
      else { gNonBrandSpend += t.cost; gNonBrandConvVal += t.convValue; }
    });
  }

  // Google PMax brand cannibalization check
  let pmaxBrandCannibal = [];
  if (intelData.googleSearchTerms) {
    const st = intelData.googleSearchTerms;
    const allTerms = [...(st.topByROAS || []), ...(st.topByRevenue || [])];
    pmaxBrandCannibal = allTerms.filter(t => {
      const isBrand = brandTerms.some(b => (t.term || '').toLowerCase().includes(b));
      const isPmax = (t.campaign || '').toLowerCase().includes('pmax') || (t.campaign || '').toLowerCase().includes('performance max');
      return isBrand && isPmax;
    });
  }

  advancedContext = `
=== ADVANCED COMPUTED METRICS ===

IMPORTANT METRIC DEFINITIONS:
  PLATFORM ROAS = Ad-attributed revenue / Ad spend (reported by Google/Meta — inflated by attribution overlap)
  TACOS (Total Ad Cost of Sale) = Total Ad Spend / Total Revenue × 100 — the TRUE efficiency metric
  MER (Marketing Efficiency Ratio) = Total Revenue / Total Ad Spend — inverse of TACOS

CROSS-CHANNEL OVERVIEW:
  Meta: Spend $${Math.round(metaSpend)} | Meta-Attributed Revenue $${Math.round(metaRevenue)} | Platform ROAS ${metaSpend > 0 ? (metaRevenue / metaSpend).toFixed(2) : 'N/A'}x | ${metaPurchases} purchases | CPP $${metaPurchases > 0 ? (metaSpend / metaPurchases).toFixed(2) : 'N/A'}
  Google: Spend $${Math.round(googleSpend)} | Google-Attributed Revenue $${Math.round(googleRevenue)} | Platform ROAS ${googleSpend > 0 ? (googleRevenue / googleSpend).toFixed(2) : 'N/A'}x | ${googleConversions} conversions
  TOTAL ADS: Spend $${Math.round(totalAdSpend)} | Combined Platform-Attributed Revenue $${Math.round(totalAdRevenue)}
  Shopify: ${shopifyDays}d | Actual Revenue $${Math.round(shopifyRevenue)} | Net $${Math.round(shopifyNet)} | ${shopifyOrders} orders
  ⚠️ Platform-attributed revenue ($${Math.round(totalAdRevenue)}) vs actual Shopify revenue ($${Math.round(shopifyRevenue)}) — difference is attribution overlap/inflation
  TACOS: ${shopifyRevenue > 0 ? (totalAdSpend / shopifyRevenue * 100).toFixed(1) : 'N/A'}% (target: <30% at 60% margins)
  MER: ${totalAdSpend > 0 ? (shopifyRevenue / totalAdSpend).toFixed(2) : 'N/A'}x
  Daily Run Rate: $${(totalAdSpend / shopifyDays).toFixed(0)}/day spend → $${(shopifyRevenue / shopifyDays).toFixed(0)}/day revenue

SHOPIFY FUNNEL METRICS:
  Avg Sessions/Day: ${(avgSessions / shopifyDays).toFixed(0)}
  Avg Conversion Rate: ${(avgConvRate * 100).toFixed(2)}%
  Avg AOV: $${avgAOV.toFixed(2)}
  Cart Add Rate: ${(avgCartRate * 100).toFixed(1)}%
  Cart → Checkout Rate: ${(avgCheckoutRate * 100).toFixed(1)}%
  Checkout → Purchase Rate: ${(avgCheckoutComplete * 100).toFixed(1)}%
  Revenue Equation: ${(avgSessions / shopifyDays).toFixed(0)} sessions × ${(avgConvRate * 100).toFixed(2)}% conv × $${avgAOV.toFixed(2)} AOV = $${((avgSessions / shopifyDays) * avgConvRate * avgAOV).toFixed(0)}/day

META CREATIVE EFFICIENCY:
  Avg CPP across ads with purchases: $${avgCPP.toFixed(2)}
  ${topAd ? `Best ad: "${topAd.adName}" ROAS ${topAd.roas.toFixed(2)} | CPP $${topAd.costPerPurchase.toFixed(2)}` : 'No ad-level data'}
  ${worstAd ? `Worst spend ad: "${worstAd.adName}" ROAS ${worstAd.roas.toFixed(2)} | Spend $${worstAd.spend.toFixed(2)}` : ''}
  High-frequency campaigns (>2.5): ${highFreqCampaigns.length > 0 ? highFreqCampaigns.map(c => `"${c.campaign}" freq ${c.frequency.toFixed(1)}`).join(', ') : 'None'}
  Zero-purchase placements: ${lowROASPlacements.length > 0 ? lowROASPlacements.map(p => `${p.placement} ($${p.spend.toFixed(2)} wasted)`).join(', ') : 'None'}

GOOGLE BRAND VS NON-BRAND:
  Brand: Spend $${Math.round(gBrandSpend)} | Conv Value $${Math.round(gBrandConvVal)} | ROAS ${gBrandSpend > 0 ? (gBrandConvVal / gBrandSpend).toFixed(2) : 'N/A'}
  Non-brand: Spend $${Math.round(gNonBrandSpend)} | Conv Value $${Math.round(gNonBrandConvVal)} | ROAS ${gNonBrandSpend > 0 ? (gNonBrandConvVal / gNonBrandSpend).toFixed(2) : 'N/A'}
  Brand % of Google spend: ${googleSpend > 0 ? (gBrandSpend / googleSpend * 100).toFixed(1) : 0}%
  ${pmaxBrandCannibal.length > 0 ? `⚠️ PMAX BRAND CANNIBALIZATION DETECTED: ${pmaxBrandCannibal.length} brand terms found in PMax campaigns → $${Math.round(pmaxBrandCannibal.reduce((s, t) => s + t.cost, 0))} spend on brand terms via PMax` : 'No PMax brand cannibalization detected'}

GOOGLE WASTED SPEND SUMMARY:
  Total wasteful terms (cost, $0 conversions): $${intelData.googleSearchTerms ? Math.round((intelData.googleSearchTerms.wasteful || []).reduce((s, t) => s + t.cost, 0)) : 0}
  Unique zero-conversion terms: ${intelData.googleSearchTerms ? (intelData.googleSearchTerms.wasteful || []).length : 0}
  Waste as % of total Google spend: ${googleSpend > 0 && intelData.googleSearchTerms ? ((intelData.googleSearchTerms.wasteful || []).reduce((s, t) => s + t.cost, 0) / googleSpend * 100).toFixed(1) : 0}%
`;

  // ===== BUILD SYSTEM PROMPT — only include frameworks for uploaded data =====
  let frameworks = `FRAMEWORK 1: THE DTC REVENUE EQUATION & UNIT ECONOMICS
Revenue = Traffic × Conversion Rate × AOV × Purchase Frequency
- Diagnose which lever is broken FIRST. Most brands over-index on traffic when conversion rate is the real problem.
- Contribution Margin: Revenue - COGS - Ad Spend - Shipping - Payment Processing. This is the number that matters.
- CAC (Customer Acquisition Cost): Total ad spend / new customers. LTV:CAC ratio should be 3:1+ for sustainable growth.
- TACOS (Total Ad Cost of Sale): Total Ad Spend / Total Shopify Revenue × 100. This is the SINGLE SOURCE OF TRUTH for ad efficiency — not platform ROAS.
- Platform ROAS ALWAYS overstates actual performance by 20-50% due to attribution overlap between Meta and Google. Both platforms claim credit for the same purchase. ALWAYS distinguish "Platform ROAS" from "True Business ROAS".
- MER (Marketing Efficiency Ratio): Total Revenue / Total Marketing Spend. The inverse of TACOS. MER > 3x is strong, > 5x is excellent.
- Benchmark targets at 60%+ gross margin: TACOS <20% = highly profitable (scale hard), 20-30% = profitable (optimize), 30-40% = marginal (fix fundamentals), >40% = unprofitable (cut spend or fix unit economics).
- First-order vs repeat: if >50% of revenue is repeat customers, TACOS overstates true acquisition cost. Segment new vs returning.
`;

  if (hasMeta) {
    frameworks += `
FRAMEWORK 2: META ADS — OPERATOR PLAYBOOK (2025-2026 Advantage+ Era)
Account structure:
- 1 ASC campaign (Advantage+ Shopping) with 5-10 creatives per ad → primary prospecting engine. Meta's algorithm does the targeting — your job is feeding it diverse creative.
- 1 CBO retargeting campaign: website visitors 1-30d, add-to-cart 1-14d, engaged video viewers 1-7d, past purchasers (for cross-sell only, exclude from prospecting)
- 1 testing campaign (ABO) → 3 ad sets × 1 creative each → test new angles at $20-30/day per ad set. Graduate winners to ASC after 3-5 days of above-average performance.
- Kill rule: any ad with 2x the account-avg CPP (cost per purchase) after $30 spend → OFF immediately. Don't wait.
- Scale rule: if an ad has ROAS > 1.5x account avg for 3 consecutive days → increase budget 20% every 3 days. Never increase more than 20% at a time or the algorithm resets learning.

Creative analysis — this is the #1 lever in Meta:
- Hook rate (3-sec video views / impressions): >30% = strong hook, 20-30% = acceptable, <15% = hook is failing → new creative needed
- Hold rate (ThruPlays / 3-sec views): >30% = content resonates, <15% = people watch the hook but bounce → body content is weak
- CTR (outbound click): >1.5% for cold prospecting, >2.5% for retargeting. Below these = creative isn't driving action.
- CPM benchmarks for DTC consumer goods: $8-18 for prospecting, $15-30 for retargeting. High CPM + low CTR = Meta is penalizing your creative quality.
- Quality/Engagement/Conversion rankings: "Below average" on ANY = creative is being penalized in the auction → replace immediately. This is costing you money through higher CPMs.
- Creative fatigue signals: frequency >3.0 AND declining CTR over 7 days = fatigue. Solution: new creative, not new audiences.
- Creative velocity: winning accounts test 3-5 new creatives per week. If you haven't introduced new creative in 2+ weeks, performance will decline.
- Format performance: UGC and creator content typically outperform polished brand content 2:1 for DTC. Video (especially Reels-native vertical) outperforms static by 30-50%.

Attribution reality check: Meta 7-day click / 1-day view attribution over-attributes by 20-50% vs actual Shopify revenue. ALWAYS label Meta-reported numbers as "Platform ROAS." A Meta Platform ROAS of 2.0x may only be 1.2-1.5x in actual Shopify revenue. The gap widens as spend increases because Meta starts claiming credit for organic buyers.
`;
  }

  if (hasGoogle) {
    frameworks += `
FRAMEWORK 3: GOOGLE ADS — OPERATOR PLAYBOOK (2025-2026)
Campaign type hierarchy:
- Brand Search (exact + phrase match): target 8-15x ROAS. Non-negotiable — you MUST own your brand terms. If absolute top impression share <85%, increase bids until you own it. This is defense, not growth.
- Non-brand Search (category terms): target 2.5-4x ROAS. Use exact match for proven converters, phrase match for discovery. Broad match ONLY with Smart Bidding (tCPA or tROAS) and sufficient conversion data (30+ conversions/month).
- PMax (Performance Max): target 2-3x ROAS BUT audit search terms monthly. PMax cannibalizes brand traffic — if 30%+ of PMax conversions come from brand queries, you're paying for organic traffic. Use brand exclusions. Check "Insights" tab for search term categories.
- Demand Gen campaigns: use for top-of-funnel awareness on YouTube/Discover/Gmail. Target 1-2x ROAS. These are prospecting, not conversion campaigns.

Bid optimization:
- Formula: Target Bid = Target CPA × Conversion Rate. Always specify EXACT new bid amounts.
- For tROAS bidding: set target ROAS 10-20% below actual to give the algorithm room. If actual ROAS is 4x, set target to 3.5x.
- Max CPC caps: remove them if using Smart Bidding — they hamstring the algorithm. Only use with Manual CPC.

Negative keywords:
- NEGATIVE EXACT for irrelevant terms or terms with >$15 spend and 0 conversions
- NEGATIVE PHRASE for irrelevant root phrases ("wholesale", "free", "DIY", "recipe" for DTC products)
- NEVER negate brand terms — not even in PMax (use brand exclusion lists instead)
- Audit PMax search terms monthly — add negatives at the account level for PMax
- Calculate total waste: sum spend on zero-conversion terms → "Adding negatives saves $X/month"

Google-specific cross-channel insight: Google captures high-intent demand that Meta creates. If you cut Meta spend, Google non-brand conversions will drop 2-4 weeks later. They are not independent channels.
`;
  }

  if (hasShopify) {
    frameworks += `
FRAMEWORK 4: CONVERSION RATE OPTIMIZATION & ON-PAGE SEO
The conversion funnel has 4 stages. Diagnose WHERE the funnel breaks before prescribing solutions:
1. Landing → Add to Cart: benchmark 8-12%. Below 6% = product page problem (price, images, reviews, copy, or wrong traffic)
2. Cart → Checkout: benchmark 55-70%. Below 50% = cart experience problem (surprise shipping costs, lack of trust signals, no urgency)
3. Checkout → Purchase: benchmark 70-85%. Below 65% = checkout friction (too many fields, limited payment options, shipping too slow/expensive)
4. Mobile vs Desktop gap: if mobile converts at <60% of desktop rate, mobile UX is broken — prioritize mobile page speed and simplified layout.

Product page priorities:
- Above the fold: hero image, price, star rating, "Add to Cart" button. If ATC is below fold on mobile, you're losing 10-20% of potential adds.
- Social proof: reviews (minimum 25+ for credibility), UGC photos, "X people bought this today"
- Trust signals: money-back guarantee, shipping speed, secure payment badges — all near the ATC button
- Cross-sell/upsell: "Frequently bought together" or "Complete your routine" below ATC increases AOV 10-25%

Landing pages for paid traffic:
- Dedicated landing pages for top-spend campaigns ALWAYS outperform sending traffic to product pages
- Headline must mirror the ad creative hook (message match). Mismatch = high bounce rate.
- Page speed: <3s load on mobile or you lose 40% of visitors. Check Core Web Vitals.

SEO:
- Title tag: primary keyword + brand, <60 chars
- Product + Review + FAQ schema markup for rich results
- Internal linking: blog → product pages for category keywords
- Blog content targeting long-tail keywords from Google Search Terms that are converting
`;
  }

  if (hasMeta && hasMetaDemographics) {
    frameworks += `
FRAMEWORK 5: AUDIENCE, DEMOGRAPHIC & CREATIVE STRATEGY
Demographics:
- Find "golden cohort" — the age/gender segment converting at 2x+ the account average. Create dedicated creative speaking directly to this cohort.
- Exclude demographics with ROAS <0.5x account average AND $30+ spend from prospecting campaigns. These are proven non-converters.
- If one gender converts at 3x+ the other, create gender-specific creative with matching messaging and imagery.

Placement optimization:
- Feed and Reels typically outperform Stories and Audience Network for DTC purchases.
- Kill any placement with >$30 spend and 0 purchases — it's wasting money.
- Audience Network almost never converts for DTC — check if it's eating budget with zero ROI.
- Instagram Reels often has lower CPM than Feed — if your creative is video-first, shift budget.

Creative testing velocity:
- Winning brands test 3-5 new creatives per week. <1 new creative/week = performance will plateau.
- Calculate creative win rate: what % of new creatives beat the account average? Below 20% = creative strategy needs rethinking, not just more volume.
- Winning creative angles to test: UGC testimonials, before/after, ingredient education, founder story, "day in my life" with product, problem-agitation-solution.
`;
  }

  frameworks += `
FRAMEWORK 6: CROSS-CHANNEL BUDGET ALLOCATION & ATTRIBUTION
Budget split benchmarks (adapt based on data):
- At $100-300/day total: Meta 60-70%, Google 25-35%, Other 5-10%
- At $300-1000/day total: Meta 50-60%, Google 30-40%, Other 5-10%
- At $1000+/day total: Meta 45-55%, Google 35-45%, Other 5-15% (add YouTube/Demand Gen)

Shift budget WEEKLY from lowest TACOS-contributing channel to highest. But remember:
- Meta creates demand, Google captures it. Cutting Meta saves money short-term but kills Google non-brand volume in 2-4 weeks.
- Google Brand spend is low-incrementality (customers would find you anyway) but necessary for defense.
- PMax cannibalizes brand traffic — always net out brand conversions from PMax ROAS to see true performance.

NORTH STAR METRIC: TACOS = Total Ad Spend / Total Shopify Revenue × 100.
TACOS targets at 60%+ gross margins: <20% = highly profitable (scale aggressively), 20-30% = profitable (optimize), 30-40% = marginal (fix fundamentals), >40% = unprofitable (cut or restructure).

Attribution reality:
- Meta + Google combined will ALWAYS claim more conversions than Shopify reports. This is normal — both platforms use overlapping attribution windows (Meta 7d click + 1d view, Google 30d click).
- True incremental ROAS is typically 50-70% of platform-reported ROAS for Meta, 60-80% for Google Search, and 30-50% for Google PMax.
- The ONLY honest metric is TACOS against actual Shopify revenue. Report per-platform metrics as "Platform ROAS" and make business decisions on TACOS.
- If total platform-reported revenue is >2x Shopify revenue, attribution overlap is extreme and per-platform decisions are unreliable — manage to TACOS only.

FRAMEWORK 7: CEO'S WEEKLY OPERATING CADENCE
Monday morning review (15 minutes):
1. TACOS trend: is total ad efficiency improving or declining week-over-week?
2. Shopify revenue trend: top-line growing? Compare same day last week.
3. CAC by channel: which channel is getting more expensive?
4. AOV stability: has average order value shifted? Sudden drops = discount overuse or mix shift.
5. Conversion rate by device: mobile vs desktop — any sudden drops?
6. Creative fatigue check: top 3 ads by spend — is frequency >3? CTR declining?
7. Google search term waste: any new irrelevant terms eating budget?
If ANY metric is >15% worse than last week, investigate immediately — don't wait for the monthly review.
`;

  const systemPrompt = `You are a fractional CMO / COO who has scaled 150+ DTC consumer brands from $500K to $10M+ annually. You operate hands-on — logging into Meta Ads Manager, Google Ads, Shopify Analytics, and Google Search Console personally. You've managed $200M+ across Meta and Google for DTC brands and understand the interplay between paid acquisition, organic growth, and retention.

=== ANALYSIS PRINCIPLES (MANDATORY) ===
- ONLY cite numbers that appear in the data below. NEVER fabricate metrics, campaign names, or benchmarks.
- Every recommendation MUST reference the specific data point that triggered it. Format: "Campaign X has ROAS 0.8x on $450 spend → [action]"
- Cross-reference across platforms: tie Meta spend to Shopify revenue, Google keywords to landing page performance, ad ROAS to actual Shopify sales.
- PLATFORM ROAS ≠ TRUE ROAS. Meta and Google both over-attribute due to overlapping attribution windows. ALWAYS label platform-reported numbers as "Platform ROAS" and anchor business decisions on TACOS (Total Ad Spend / Total Shopify Revenue).
- Quantify EVERYTHING: "$X saved/week", "$X revenue gained", "CPA drops from $X to $Y". Show the math.
- MINIMUM DATA THRESHOLDS: $20+ spend for kill/scale decisions on Meta, $15+ spend for Google negatives, 100+ sessions for page-level CRO conclusions. Flag when data is below threshold.
- Think in CAUSE → EFFECT → ACTION chains: don't just say "CTR is low" — diagnose why (creative fatigue? wrong audience? weak hook?) and prescribe the specific fix.

${frameworks}

FORMAT YOUR REPORT IN MARKDOWN with tables, bold metrics, and clear headers. Be AGGRESSIVE, SPECIFIC, and OPERATOR-LEVEL. Every recommendation must include:
1. The EXACT campaign name, ad name, keyword, or page URL (copy-pasteable into the platform)
2. Current performance metrics FROM THE DATA (never invented)
3. The SPECIFIC action with exact bid, budget, creative decision, or page edit
4. The MATH showing why this is the right move
5. Estimated dollar impact (weekly and monthly)
6. Time to implement and confidence level (HIGH/MEDIUM/LOW)

You are not an advisor. You are the fractional CMO in the operator seat. Write as if you will log into Meta Ads Manager, Google Ads, and Shopify admin in the next 30 minutes. Use direct language: "Kill this ad" not "Consider pausing." When data is insufficient, say "Directional signal — monitor 7 more days" rather than making a weak recommendation.`;

  // ===== BUILD USER PROMPT — only request sections for available data =====
  let sections = `
## 📊 EXECUTIVE SUMMARY & P&L HEALTH CHECK
Start with the numbers that matter — pull exact figures from the data:
- **TACOS**: Total Ad Spend $X / Total Shopify Revenue $X = X%. Verdict: [profitable/marginal/unprofitable] at assumed 60% margins.
- **MER**: Total Revenue / Total Ad Spend = X.Xx. Above 3x is healthy.
- **Platform ROAS** (labeled clearly): Meta Platform ROAS X.Xx, Google Platform ROAS X.Xx. Caveat: these overstate true performance by ~30-50%.
- **Revenue equation diagnosis**: Traffic (sessions) × Conv Rate × AOV = Revenue. Calculate each number. Which lever is the weakest? That's where to focus.
- **Channel efficiency comparison**: which channel has the best TACOS contribution? Which is the worst? Don't use platform ROAS for this — use actual Shopify attribution if available.
- Account health grade (A-F) for EACH platform with specific justification tied to metrics
- Top 3 wins (with dollar amounts), Top 3 problems (with dollar amounts at stake)
- 1-sentence CEO verdict: "The business is [scaling profitably / healthy but stalling / bleeding cash] because [specific reason with numbers]"
`;

  if (hasMeta) {
    sections += `
## 🔴 META: KILL LIST — Ads & Audiences to Cut Immediately
For EACH underperforming ad/ad set/campaign (only those with $30+ spend):
| Name | Type (Campaign/AdSet/Ad) | Spend | Purchases | Platform ROAS | CPP | CTR | Frequency | Verdict |
Kill rules applied to each:
- CPP > 2x account average → KILL
- Platform ROAS < 0.5x account average after $30 spend → KILL
- Frequency > 3.5 with declining CTR over 7 days → CREATIVE FATIGUE, replace creative
- Quality/Engagement/Conversion ranking "Below Average" → PENALIZED, replace immediately
For items below $30 spend threshold, list as "Watch List — check in 3 days"
BOTTOM LINE: "Killing these X ads/audiences saves ~$X/week ($X/month) while losing only ~Y purchases that were unprofitable."

## 🟢 META: SCALE LIST — Winners to Push
| Name | Current Daily Spend | Purchases | Platform ROAS | CPP | CTR | Frequency | Action |
For each winner:
- How much to increase budget (exact $/day — never more than 20% increase at a time)
- Duplicate to new ad set if near frequency cap (>2.5)
- What similar angle to test based on this winner's hook/format
BOTTOM LINE: "Scaling these winners adds ~$X/week in Platform Revenue at current efficiency."

## 🎨 META: CREATIVE STRATEGY & TESTING ROADMAP
### What's Working vs What's Not
Analyze the data to identify patterns: which creative FORMATS (video/static/carousel), HOOKS (problem/benefit/social proof), and ANGLES are producing the best CPP and CTR?

### 5 New Creative Briefs (specific enough to hand to a creator)
For each brief:
1. **Format**: UGC video / static / carousel / Reel
2. **Hook** (first 3 seconds): exact script or concept — this is the most important part
3. **Body**: key selling points to cover, in order
4. **CTA**: specific call to action
5. **Product focus**: which product/SKU and why
6. **Testing budget**: $X/day for X days, kill if CPP > $X after $30 spend
Base these briefs on what's CURRENTLY working in the data — don't invent angles unconnected to performance patterns.
`;
  }

  if (hasMeta && hasMetaDemographics) {
    sections += `
## 👥 META: AUDIENCE & DEMOGRAPHIC OPTIMIZATION
### Golden Cohort Analysis
| Age Range | Gender | Spend | Purchases | Platform ROAS | CPP | Verdict |
- Identify the top-performing age/gender segment (the "golden cohort"). How much better does it perform vs account average?
- Identify the worst-performing segment. If ROAS < 0.5x average with $30+ spend → EXCLUDE from prospecting.

### Placement Performance
| Placement | Spend | Purchases | Platform ROAS | CPP | Verdict (Scale / Keep / Kill) |
- Feed vs Reels vs Stories vs Audience Network — which is actually converting?
- Kill any placement with $30+ spend and 0 purchases.
- Is Audience Network eating budget? (Almost never converts for DTC — recommend excluding if data confirms.)

### Retargeting vs Prospecting Split
- What % of spend goes to retargeting vs prospecting? Healthy split: 70-80% prospecting, 20-30% retargeting.
- If retargeting ROAS is very high but prospecting is poor → you're harvesting without planting. Need more prospecting budget.
- If retargeting has high frequency (>5) → audience is saturated. Expand prospecting to feed the funnel.
`;
  }

  if (hasGoogle) {
    sections += `
## 🔴 GOOGLE: NEGATIVE KEYWORDS & WASTED SPEND
| Search Term | Campaign | Cost | Clicks | Conversions | Conv Value | Action (neg exact / neg phrase) | Why |
RULES: minimum 10 negatives. Only recommend negatives for terms with $15+ spend and 0 conversions, OR terms that are clearly irrelevant regardless of spend.
For each: specify NEGATIVE EXACT vs NEGATIVE PHRASE and explain why (is the root phrase irrelevant, or just this specific query?).
### PMax Brand Cannibalization Audit
If PMax data available: what % of PMax conversions/spend are from brand queries? If >30%, PMax is cannibalizing brand search — add brand exclusions and recalculate true PMax ROAS.
BOTTOM LINE: "Adding these negatives saves ~$X/week ($X/month). PMax brand cannibalization accounts for ~$X of inflated PMax revenue."

## 🟢 GOOGLE: SCALE & BID OPTIMIZATION
| Keyword/Campaign | Type | Current CPC | ROAS | Conversions | Impression Share | Suggested Action |
For each scalable keyword:
- Brand terms: check absolute top impression share. If <85%, increase bid. Losing brand auctions to competitors is unacceptable.
- Non-brand converters: if ROAS > 3x and impression share < 50%, there's volume to capture. Calculate target bid.
- Budget-capped campaigns: if a campaign is consistently hitting daily budget with ROAS > target, increase budget by 25-50%.
- Promote winning phrase/broad terms to exact match in dedicated campaigns.
BOTTOM LINE: "Scaling these opportunities adds ~$X/week in revenue at target ROAS."
`;
  }

  if (hasShopify) {
    sections += `
## 🛒 SHOPIFY: CONVERSION RATE OPTIMIZATION & ON-PAGE SEO

### Funnel Diagnosis (this is critical — fix the funnel before spending more on ads)
Session→Cart rate: ${(avgCartRate * 100).toFixed(1)}% (benchmark 8-12%). Cart→Checkout: ${(avgCheckoutRate * 100).toFixed(1)}% (benchmark 55-70%). Checkout→Purchase: ${(avgCheckoutComplete * 100).toFixed(1)}% (benchmark 70-85%).

For EACH stage that is below benchmark:
1. Diagnose the CAUSE (not just "it's low" — WHY is it low? Wrong traffic? Bad page? Price issue? Trust issue?)
2. Prescribe 3 SPECIFIC fixes (not generic advice like "improve your page" — tell them EXACTLY what to change)
3. Estimate the impact: "Improving cart rate from ${(avgCartRate * 100).toFixed(1)}% to 10% would add ~$X/week in revenue at current traffic levels"

Revenue impact calculation: Current sessions × (target conv rate - current conv rate) × AOV = additional weekly revenue. This number often dwarfs what you can gain from ad optimization alone.
`;
    if (hasShopifyPages) {
      sections += `
### Landing Page Performance
| Page Path | Sessions | Cart Adds | Cart Rate | Verdict |
Which pages get MORE traffic? Which STOP? Specific on-page changes for top 3.

### On-Page SEO Priorities
Title tag, meta description, H1, image alt-tag, schema markup recommendations for top product pages.
5 blog content ideas based on converting search terms.
`;
    }
    sections += `
### AOV Optimization
AOV trend assessment. Bundle, upsell, and free shipping threshold recommendations.
`;
  }

  if (hasAmazonSQP) {
    sections += `
## 🔍 AMAZON: ORGANIC SEARCH SHARE INTELLIGENCE
Top 10 queries by volume: brand share strong vs weak?
Market share opportunities. Queries to defend. Cross-channel ad impact on Amazon search volume.
`;
  }

  if (hasMeta && hasGoogle) {
    sections += `
## 📈 CROSS-CHANNEL BUDGET REALLOCATION
| Channel | Current $/Day | Platform ROAS | Est. True ROAS (70% of platform) | TACOS Contribution | Recommended $/Day | $ Change | Expected Impact |
RULES:
- Total budget stays the same unless you explicitly recommend increase/decrease with justification.
- Account for attribution inflation: discount Meta Platform ROAS by ~30-40%, Google Search by ~20%, PMax by ~50%.
- Meta drives awareness → Google captures intent. They're complementary, not interchangeable. Cutting Meta hurts Google non-brand in 2-4 weeks.
- If Google Brand is >40% of Google spend, the Google budget is artificially inflated by brand traffic that would convert organically.
- Recommend specific $/day amounts for each channel and campaign type (not just platform-level).
BOTTOM LINE: "Reallocating $X from [channel] to [channel] improves estimated TACOS from X% to Y%, adding ~$Z/month in profit."
`;
  }

  sections += `
## ⚡ TOP 10 ACTIONS THIS WEEK (Ranked by Dollar Impact)
This is the most important section. Rank by estimated dollar impact, largest first.
For EACH action:
1. **What**: The specific action in plain language
2. **Where**: Exact platform → campaign/ad/page → setting to change
3. **Current State**: The metric/number that triggered this action (from the data)
4. **Action**: Copy-pasteable instructions (exact bid, exact budget, exact negative keyword, etc.)
5. **Expected Impact**: $X/week, $X/month (show the math)
6. **Time**: Minutes to implement
7. **Confidence**: HIGH (clear data signal) / MEDIUM (directional) / LOW (worth testing)

Organize: 🟢 QUICK WINS (<5 min, do today) | 🟡 MEDIUM (5-15 min, do this week) | 🔴 STRATEGIC (15+ min, schedule time)
BOTTOM LINE: "Implementing all 10 actions is estimated to save/generate ~$X/month total."

## 📋 IMPLEMENTATION CHECKLIST
Platform-by-platform numbered checklist (${[hasMeta && 'Meta Ads Manager', hasGoogle && 'Google Ads', hasShopify && 'Shopify Admin', 'Content/SEO'].filter(Boolean).join(', ')}):
Each item should be a single, completable task with the exact action. Check-box format.
Estimated total time: X hours to implement everything.

## 📆 CEO's WEEKLY OPERATING DASHBOARD
7-item Monday morning checklist:
| # | Metric | Where to Check | "Healthy" Range | Red Flag | If Red: Do This |
Fill in the "Healthy" ranges and red flags with numbers specific to THIS brand's current performance from the data — not generic benchmarks.`;

  const brandName = storeName || 'this brand';
  const userPrompt = `Generate a comprehensive DTC Growth & Advertising Action Report for ${brandName}.

REPORTS AVAILABLE: ${available.join(', ')}
${available.length < 5 ? `\nNOTE: Only ${available.length} report types uploaded. Analyze what's available and note which missing reports would enable deeper analysis.` : ''}

BUSINESS CONTEXT:
- Brand: ${brandName}
- Channels: Shopify DTC + Amazon
- Ad platforms: Google Ads, Meta Ads
- Identify products, pricing, and performance from the data below

${dataContext}

${advancedContext}

=== GENERATE ALL SECTIONS BELOW — SKIP NONE ===
${sections}`;

  return { systemPrompt, userPrompt };
};

// ============ MARKDOWN RENDERER ============

const renderMarkdown = (md) => {
  if (!md) return '';
  var lt = new RegExp('<', 'g');
  var gt = new RegExp('>', 'g');
  var html = md.replace(lt, '&lt;').replace(gt, '&gt;');
  // Remove horizontal rules (--- or ___) to avoid empty spacing
  html = html.replace(/^[\-_]{3,}\s*$/gm, '');
  // Headers
  html = html.replace(/^# (.*$)/gm, '&lt;h2&gt;$1&lt;/h2&gt;');
  html = html.replace(/^## (.*$)/gm, '&lt;h2&gt;$1&lt;/h2&gt;');
  html = html.replace(/^### (.*$)/gm, '&lt;h3&gt;$1&lt;/h3&gt;');
  // Inline formatting
  html = html.replace(/\*\*(.+?)\*\*/g, '&lt;strong&gt;$1&lt;/strong&gt;');
  html = html.replace(/\*(.+?)\*/g, '&lt;em&gt;$1&lt;/em&gt;');
  html = html.replace(/`([^`]+)`/g, '&lt;code&gt;$1&lt;/code&gt;');
  // Lists (handle both - and * bullets)
  html = html.replace(/^[\-\*] (.+$)/gm, '&lt;li&gt;$1&lt;/li&gt;');
  html = html.replace(/^(\d+)\. (.+$)/gm, '&lt;li&gt;$2&lt;/li&gt;');
  html = html.replace(/(&lt;li&gt;.*&lt;\/li&gt;\n?)+/g, '&lt;ul&gt;$&&lt;/ul&gt;');
  // Tables — line-by-line detection for proper header/body structure
  var tLines = html.split('\n');
  var tOut = [];
  var ti = 0;
  while (ti < tLines.length) {
    if (tLines[ti].includes('|') && ti + 1 < tLines.length && /^\|?\s*[-:]+[-|\s:]+$/.test(tLines[ti + 1])) {
      var hLine = tLines[ti];
      var sLine = tLines[ti + 1];
      var aligns = sLine.split('|').filter(function(c) { return c.trim(); }).map(function(c) {
        var t = c.trim();
        if (t.charAt(0) === ':' && t.charAt(t.length - 1) === ':') return 'center';
        if (t.charAt(t.length - 1) === ':') return 'right';
        return 'left';
      });
      var hCells = hLine.replace(/^\|/, '').replace(/\|$/, '').split('|').map(function(c) { return c.trim(); });
      var tHtml = '&lt;div class="table-wrap"&gt;&lt;table&gt;&lt;thead&gt;&lt;tr&gt;';
      hCells.forEach(function(cell, ci) {
        var a = aligns[ci] || 'left';
        tHtml += '&lt;th style="text-align:' + a + '"&gt;' + cell + '&lt;/th&gt;';
      });
      tHtml += '&lt;/tr&gt;&lt;/thead&gt;&lt;tbody&gt;';
      ti += 2;
      while (ti < tLines.length && tLines[ti].includes('|') && !/^\|?\s*[-:]+[-|\s:]+$/.test(tLines[ti])) {
        var rCells = tLines[ti].replace(/^\|/, '').replace(/\|$/, '').split('|').map(function(c) { return c.trim(); });
        tHtml += '&lt;tr&gt;';
        rCells.forEach(function(cell, ci) {
          var a = aligns[ci] || 'left';
          tHtml += '&lt;td style="text-align:' + a + '"&gt;' + cell + '&lt;/td&gt;';
        });
        tHtml += '&lt;/tr&gt;';
        ti++;
      }
      tHtml += '&lt;/tbody&gt;&lt;/table&gt;&lt;/div&gt;';
      tOut.push(tHtml);
    } else {
      tOut.push(tLines[ti]);
      ti++;
    }
  }
  html = tOut.join('\n');
  // Collapse 3+ blank lines into 1
  html = html.replace(/\n{3,}/g, '\n\n');
  // Paragraphs and line breaks
  html = html.replace(/\n\n/g, '&lt;/p&gt;&lt;p&gt;');
  html = html.replace(/\n/g, '&lt;br/&gt;');
  // Clean up empty paragraphs
  html = html.replace(/&lt;p&gt;\s*&lt;\/p&gt;/g, '');
  html = html.replace(/&lt;p&gt;\s*&lt;br\/&gt;\s*&lt;\/p&gt;/g, '');
  // Now unescape our HTML tags
  var unescapeRe = new RegExp('&lt;(\\/?(?:h[23]|strong|em|li|ul|ol|table|thead|tbody|tr|td|th|div|p|br\\/?|code)(?:\\s[^&]*)?)&gt;', 'g');
  html = html.replace(unescapeRe, function(_, tag) { return '<' + tag + '>'; });
  return html;
};

// ============ COMPONENT ============

const DtcAdsIntelModal = ({
  show,
  setShow,
  dtcIntelData,
  setDtcIntelData,
  queueCloudSave,
  setToast,
  callAI,
  saveReportToHistory,
  allDaysData,
  setAllDaysData,
  storeName,
}) => {
  const [detectedFiles, setDetectedFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [actionReport, setActionReport] = useState(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState(null);
  const [selectedModel, setSelectedModel] = useState((typeof window !== 'undefined' && typeof window.__aiModelOverride === 'string' && window.__aiModelOverride) || AI_DEFAULT_MODEL);

  if (!show) return null;

  const readAndDetect = async (fileList) => {
    const newDetected = [];
    for (const file of fileList) {
      try {
        const { rows, headers, dateRange } = await parseXlsxSmart(file);
        const type = detectReportType(headers, rows, file.name);
        newDetected.push({ file, type, rows: rows.length, headers: headers.slice(0, 6), dateRange });
      } catch (err) {
        newDetected.push({ file, type: null, rows: 0, error: err.message });
      }
    }
    setDetectedFiles(prev => {
      const existing = [...prev];
      newDetected.forEach(nd => {
        // Allow multiple files of same type (different time periods)
        existing.push(nd);
      });
      return existing;
    });
    setResults(null);
  };

  // Extract files from a ZIP archive (requires jszip: npm install jszip)
  const extractZip = async (zipFile) => {
    let JSZip;
    try {
      JSZip = (await import('jszip')).default;
    } catch (e) {
      throw new Error('ZIP support requires jszip. Run: npm install jszip');
    }
    const zip = await JSZip.loadAsync(zipFile);
    const extracted = [];
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const lower = name.toLowerCase();
      if (!lower.endsWith('.csv') && !lower.endsWith('.xlsx') && !lower.endsWith('.xls')) continue;
      if (name.includes('__MACOSX') || name.startsWith('.')) continue;
      const blob = await entry.async('blob');
      const cleanName = name.split('/').pop();
      const file = new File([blob], cleanName, { type: lower.endsWith('.csv') ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      extracted.push(file);
    }
    return extracted;
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    const allFiles = [...e.dataTransfer.files];
    let fileList = [];
    for (const f of allFiles) {
      if (f.name.toLowerCase().endsWith('.zip')) {
        try { fileList.push(...await extractZip(f)); }
        catch (err) { setDetectedFiles(prev => [...prev, { file: f, type: null, rows: 0, error: 'ZIP extract failed: ' + err.message }]); }
      } else if (f.name.endsWith('.csv') || f.name.endsWith('.xlsx') || f.name.endsWith('.xls')) {
        fileList.push(f);
      }
    }
    if (fileList.length > 0) readAndDetect(fileList);
  };

  const handleFileInput = async (e) => {
    const allFiles = [...e.target.files];
    let fileList = [];
    for (const f of allFiles) {
      if (f.name.toLowerCase().endsWith('.zip')) {
        try { fileList.push(...await extractZip(f)); }
        catch (err) { setDetectedFiles(prev => [...prev, { file: f, type: null, rows: 0, error: 'ZIP extract failed: ' + err.message }]); }
      } else { fileList.push(f); }
    }
    if (fileList.length > 0) readAndDetect(fileList);
    e.target.value = '';
  };

  const removeFile = (idx) => {
    setDetectedFiles(prev => prev.filter((_, i) => i !== idx));
    setResults(null);
  };

  const processAll = async () => {
    setProcessing(true);
    setResults(null);
    const newIntel = { ...dtcIntelData, lastUpdated: new Date().toISOString() };
    const processResults = [];

    // For types that can have multiple time periods, we pick the longest/most recent
    // by merging data — or for search terms, prefer 30-day over 7-day
    const filesByType = {};
    for (const det of detectedFiles) {
      if (!det.type || det.error) continue;
      if (!filesByType[det.type]) filesByType[det.type] = [];
      filesByType[det.type].push(det);
    }

    try {
      for (const det of detectedFiles) {
        if (!det.type || det.error) {
          processResults.push({ key: det.type || 'unknown', fileName: det.file.name, status: 'skipped', error: det.error || 'Unrecognized' });
          continue;
        }
        try {
          const { rows, dateRange } = await parseXlsxSmart(det.file);
          let summary;

          switch (det.type) {
            case 'googleCampaign': summary = aggregateGoogleCampaigns(rows, dateRange); break;
            case 'googleAdGroup': summary = aggregateGoogleAdGroups(rows, dateRange); break;
            case 'googleSearchTerms': summary = aggregateGoogleSearchTerms(rows, dateRange); break;
            case 'googleKeywords': summary = aggregateGoogleKeywords(rows, dateRange); break;
            case 'googleAssetGroups': summary = aggregateGoogleAssetGroups(rows, dateRange); break;
            case 'metaCampaign': summary = aggregateMetaCampaigns(rows, dateRange); break;
            case 'metaAdSets': summary = aggregateMetaAdSets(rows, dateRange); break;
            case 'metaAds': summary = aggregateMetaAds(rows, dateRange); break;
            case 'metaAdSetAge': summary = aggregateMetaDemographic(rows, 'Age', dateRange); break;
            case 'metaAdSetGender': summary = aggregateMetaDemographic(rows, 'Gender', dateRange); break;
            case 'metaAdSetPlacement': summary = aggregateMetaDemographic(rows, 'Placement', dateRange); break;
            case 'amazonSearchQuery': summary = aggregateAmazonSearchQuery(rows); break;
            case 'shopifySales': summary = aggregateShopifySales(rows); break;
            case 'shopifySessions': summary = aggregateShopifySessions(rows); break;
            case 'shopifyAOV': summary = aggregateShopifyAOV(rows); break;
            case 'shopifyConversion': summary = aggregateShopifyConversion(rows); break;
            case 'shopifyLandingPages': summary = aggregateShopifyLandingPages(rows); break;
          }

          // REPLACE per report type — re-uploading the same file overwrites, not appends.
          // (A new export is the complete state for that report type.)
          if (det.type === 'googleSearchTerms' && newIntel[det.type]) {
            // Merge search terms - keep the one with more data
            if (summary.totalTerms > (newIntel[det.type].totalTerms || 0)) {
              newIntel[det.type] = summary;
            }
          } else {
            newIntel[det.type] = summary;
          }

          processResults.push({ key: det.type, fileName: det.file.name, status: 'success', rows: rows.length });
        } catch (err) {
          processResults.push({ key: det.type, fileName: det.file.name, status: 'error', error: err.message });
        }
      }

      setDtcIntelData(newIntel);
      
      // === FEED DAILY AD SPEND INTO allDaysData ===
      // Extract daily totals from Google campaigns and Meta ads (daily CSV format)
      if (setAllDaysData) {
        const googleDaily = newIntel.googleCampaign?._dailyTrend || {};
        const metaDaily = newIntel.metaAds?._dailyTrend || {};
        
        const allDateKeys = new Set([...Object.keys(googleDaily), ...Object.keys(metaDaily)]);
        
        if (allDateKeys.size > 0) {
          const currentDays = { ...(allDaysData || {}) };
          let daysUpdated = false;
          
          // Normalize date strings to YYYY-MM-DD
          const normDate = (d) => {
            if (!d) return null;
            const s = String(d).trim();
            // Already ISO
            if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
            // "Feb 11, 2026" format
            const months = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
            const m = s.match(/^(\w{3})\s+(\d+),?\s*(\d{4})$/);
            if (m) {
              const mo = months[m[1].toLowerCase()];
              if (mo !== undefined) {
                const dt = new Date(parseInt(m[3]), mo, parseInt(m[2]));
                return dt.toISOString().slice(0, 10);
              }
            }
            // Excel serial number
            if (/^\d{5}$/.test(s)) {
              const dt = new Date((parseInt(s) - 25569) * 86400000);
              return dt.toISOString().slice(0, 10);
            }
            // Try Date parse
            const dt = new Date(s);
            return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
          };
          
          for (const rawDate of allDateKeys) {
            const dateKey = normDate(rawDate);
            if (!dateKey) continue;
            
            const gd = googleDaily[rawDate] || {};
            const md = metaDaily[rawDate] || {};
            
            if (!currentDays[dateKey]) currentDays[dateKey] = {};
            if (!currentDays[dateKey].shopify) currentDays[dateKey].shopify = {};
            
            // Write Google daily metrics
            if (gd.cost > 0 || gd.impressions > 0) {
              currentDays[dateKey].googleSpend = gd.cost || 0;
              currentDays[dateKey].googleAds = gd.cost || 0;
              currentDays[dateKey].googleImpressions = gd.impressions || 0;
              currentDays[dateKey].googleClicks = gd.clicks || 0;
              currentDays[dateKey].googleConversions = gd.conversions || 0;
              currentDays[dateKey].googleCpc = gd.clicks > 0 ? gd.cost / gd.clicks : 0;
              currentDays[dateKey].shopify.googleSpend = gd.cost || 0;
              daysUpdated = true;
            }
            
            // Write Meta daily metrics
            if (md.cost > 0 || md.impressions > 0) {
              currentDays[dateKey].metaSpend = md.cost || 0;
              currentDays[dateKey].metaAds = md.cost || 0;
              currentDays[dateKey].metaImpressions = md.impressions || 0;
              currentDays[dateKey].metaClicks = md.clicks || 0;
              currentDays[dateKey].metaPurchases = md.conversions || 0;
              currentDays[dateKey].metaConversions = md.conversions || 0;
              currentDays[dateKey].metaCpc = md.clicks > 0 ? md.cost / md.clicks : 0;
              currentDays[dateKey].shopify.metaSpend = md.cost || 0;
              daysUpdated = true;
            }
            
            // Update shopify.adSpend total
            const gs = currentDays[dateKey].shopify.googleSpend || currentDays[dateKey].googleSpend || 0;
            const ms = currentDays[dateKey].shopify.metaSpend || currentDays[dateKey].metaSpend || 0;
            if (gs + ms > 0) {
              currentDays[dateKey].shopify.adSpend = gs + ms;
            }
          }
          
          if (daysUpdated) {
            setAllDaysData(currentDays);
            try { localStorage.setItem('ecommerce_daily_sales_v1', JSON.stringify(currentDays)); } catch(e) {}
          }
        }
      }
      
      if (queueCloudSave) queueCloudSave();
      setResults(processResults);
      const successCount = processResults.filter(r => r.status === 'success').length;
      if (setToast && successCount > 0) {
        setToast({ message: `Processed ${successCount} DTC report${successCount !== 1 ? 's' : ''} successfully`, type: 'success' });
      }
    } catch (err) {
      console.error('DTC processing error:', err);
    } finally {
      setProcessing(false);
    }
  };

  const generateActionReport = async () => {
    if (!callAI || !dtcIntelData?.lastUpdated) return;
    setGeneratingReport(true);
    setReportError(null);
    setActionReport(null);
    try {
      const prompts = buildDtcActionReportPrompt(dtcIntelData, storeName);
      if (!prompts) throw new Error('No data available');
      // DTC reports need high token limit for full campaign audit (no truncation)
      const response = await callAI(prompts.userPrompt, prompts.systemPrompt, selectedModel, 32000);
      setActionReport(response);
      // Save to report history
      if (saveReportToHistory) {
        const d = dtcIntelData || {};
        const metaSpend = d.metaCampaigns?.reduce?.((s, c) => s + (c.spend || 0), 0) || 0;
        const googleSpend = d.googleCampaigns?.reduce?.((s, c) => s + (c.cost || 0), 0) || 0;
        const metaRev = d.metaCampaigns?.reduce?.((s, c) => s + (c.purchaseValue || c.revenue || 0), 0) || 0;
        const googleRev = d.googleCampaigns?.reduce?.((s, c) => s + (c.conversionValue || c.revenue || 0), 0) || 0;
        const totalSpend = metaSpend + googleSpend;
        const totalRev = metaRev + googleRev;
        saveReportToHistory({
          type: 'dtc',
          content: response,
          model: selectedModel,
          metrics: {
            revenue: totalRev,
            adSpend: totalSpend,
            roas: totalSpend > 0 ? totalRev / totalSpend : 0,
            tacos: totalRev > 0 ? (totalSpend / totalRev * 100) : 0,
            actionCount: (response.match(/^\d+[\.\)]/gm) || []).length,
          },
        });
      }
    } catch (err) {
      setReportError(err.message || 'Failed to generate report');
    } finally {
      setGeneratingReport(false);
    }
  };

  const downloadReport = () => {
    if (!actionReport) return;
    const date = new Date().toISOString().split('T')[0];
    const blob = new Blob([`# DTC Ads Action Report — ${date}\n\n${actionReport}`], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DTC-Action-Report-${date}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportReportPdf = () => {
    if (!actionReport) return;
    const bn = storeName || 'Brand';
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const htmlBody = sanitizeHtml(renderMarkdown(actionReport));
    const pdfStyles = `
@page { margin: 0.6in 0.65in; size: letter; }
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif; color: #1a1a2e; line-height: 1.6; font-size: 10pt; }
.cover { background: linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0f3460 100%); color: white; padding: 36px 44px 24px; margin: -0.6in -0.65in 0; }
.cover .brand { font-size: 11pt; font-weight: 500; letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-bottom: 2px; }
.cover h1 { font-size: 26pt; font-weight: 900; letter-spacing: -0.5px; margin: 0 0 4px; line-height: 1.15; }
.cover .subtitle { font-size: 12pt; font-weight: 300; color: rgba(255,255,255,0.7); margin-bottom: 16px; }
.cover .meta-row { display: flex; gap: 24px; font-size: 8.5pt; color: rgba(255,255,255,0.45); border-top: 1px solid rgba(255,255,255,0.1); padding-top: 12px; }
.content { padding: 28px 0 0; }
.confidential { background: #f8f9fa; border-left: 4px solid #e94560; padding: 10px 16px; margin-bottom: 28px; font-size: 8pt; color: #6b7280; font-weight: 500; }
h1 { font-size: 18pt; font-weight: 800; color: #0f172a; margin: 36px 0 12px; }
h2 { font-size: 13pt; font-weight: 700; color: #1e293b; margin: 30px 0 10px; padding-bottom: 8px; border-bottom: 2.5px solid #e94560; }
h3 { font-size: 11pt; font-weight: 600; color: #334155; margin: 22px 0 8px; padding-left: 12px; border-left: 3px solid #6366f1; }
h4 { font-size: 10pt; font-weight: 600; color: #475569; margin: 16px 0 6px; }
p { font-size: 10pt; margin-bottom: 6px; line-height: 1.65; color: #374151; }
li { font-size: 10pt; margin-bottom: 4px; line-height: 1.55; color: #374151; }
ul, ol { padding-left: 20px; margin-bottom: 10px; }
strong { color: #e94560; font-weight: 700; }
em { color: #6366f1; }
code { background: #f1f5f9; padding: 1px 6px; border-radius: 3px; font-size: 9pt; color: #7c3aed; }
hr { border: none; border-top: 1px solid #e5e7eb; margin: 28px 0; }
.table-wrap { overflow-x: auto; margin: 14px 0 18px; }
table { width: 100%; border-collapse: collapse; font-size: 8.5pt; border: 1px solid #d1d5db; border-radius: 6px; overflow: hidden; }
th { background: #0f172a; color: #e2e8f0; font-weight: 700; text-align: left; padding: 9px 10px; font-size: 7pt; text-transform: uppercase; letter-spacing: 0.6px; border-bottom: 2px solid #e94560; white-space: nowrap; }
td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; font-size: 8.5pt; color: #374151; vertical-align: top; }
tbody tr:nth-child(even) { background: #f9fafb; }
.footer { margin-top: 48px; padding-top: 16px; border-top: 2px solid #0f172a; text-align: center; }
.footer p { font-size: 7.5pt; color: #9ca3af; margin-bottom: 2px; }
.footer .brand-line { font-size: 8.5pt; font-weight: 700; color: #1e293b; }
@media print {
  .no-print { display: none !important; }
  .cover { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  th { background: #0f172a !important; color: #e2e8f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  table { page-break-inside: auto; } tr { page-break-inside: avoid; }
  h2, h3 { page-break-after: avoid; }
}`;
    const printDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${bn}-dtc-audit</title><style>${pdfStyles}</style></head><body>
<div class="cover">
  <div class="brand">${bn}</div>
  <h1>DTC Advertising Audit</h1>
  <div class="subtitle">Google & Meta Performance Report</div>
  <div class="meta-row"><span>${dateStr}</span><span>AI-Generated Analysis</span></div>
</div>
<div class="content">
  <div class="no-print" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:14px 24px;margin-bottom:24px;border-radius:8px;font-size:10pt;display:flex;justify-content:space-between;align-items:center;">
    <span><strong>PDF Preview</strong> — Use Ctrl+P / Cmd+P and select "Save as PDF"</span>
    <button onclick="window.print()" style="background:white;color:#6366f1;border:none;padding:8px 20px;border-radius:6px;font-weight:700;cursor:pointer;font-size:10pt;">Save as PDF</button>
  </div>
  <div class="confidential">CONFIDENTIAL — Proprietary advertising intelligence for ${bn}. Do not distribute.</div>
  ${htmlBody}
</div>
<div class="footer">
  <p class="brand-line">${bn} Advertising Command Center</p>
  <p>DTC Ads Audit &middot; ${dateStr}</p>
  <p style="margin-top:6px;font-size:6.5pt;color:#d1d5db;">AI-generated analysis. Validate recommendations before implementation.</p>
</div></body></html>`;
    const blob = new Blob([printDoc], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) { setToast({ message: 'Please allow popups to export PDF', type: 'error' }); URL.revokeObjectURL(url); return; }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const validFiles = detectedFiles.filter(d => d.type && !d.error);
  const hasExistingData = dtcIntelData?.lastUpdated;
  const typeLabels = Object.fromEntries(REPORT_TYPES.map(r => [r.key, r.label]));
  const typeColors = Object.fromEntries(REPORT_TYPES.map(r => [r.key, r.color]));
  const showReportView = actionReport || generatingReport || reportError;

  const platformIcon = (type) => {
    const rt = REPORT_TYPES.find(r => r.key === type);
    if (!rt) return '📄';
    return rt.platform === 'google' ? '🔵' : rt.platform === 'meta' ? '🟣' : rt.platform === 'amazon' ? '🟠' : '🟢';
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`bg-slate-900 rounded-2xl border border-slate-700 w-full ${showReportView ? 'max-w-5xl' : 'max-w-2xl'} max-h-[90vh] overflow-hidden flex flex-col transition-all`}>
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-600 to-blue-600 p-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Globe className="w-6 h-6" />DTC Ads Intelligence
            </h2>
            <p className="text-white/70 text-sm">Google + Meta + Shopify + Amazon Search — drop all your reports</p>
          </div>
          <button onClick={() => { setShow(false); setDetectedFiles([]); setResults(null); }} className="p-2 hover:bg-white/20 rounded-lg text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {/* Existing data + generate from existing */}
          {hasExistingData && (
            <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-lg p-3 text-sm">
              <p className="text-emerald-400 font-medium">✓ DTC data loaded · {new Date(dtcIntelData.lastUpdated).toLocaleDateString()}</p>
              <p className="text-slate-400 text-xs mt-1">
                {[
                  dtcIntelData.googleCampaign?.length && `${dtcIntelData.googleCampaign.length} Google campaigns`,
                  dtcIntelData.googleSearchTerms && `${dtcIntelData.googleSearchTerms.totalTerms} search terms`,
                  dtcIntelData.metaCampaign?.length && `${dtcIntelData.metaCampaign.length} Meta campaigns`,
                  dtcIntelData.metaAds?.length && `${dtcIntelData.metaAds.length} Meta ads`,
                  dtcIntelData.amazonSearchQuery?.length && `${dtcIntelData.amazonSearchQuery.length} Amazon queries`,
                  dtcIntelData.shopifySales?.length && `${dtcIntelData.shopifySales.length}d Shopify`,
                ].filter(Boolean).join(' · ')}
              </p>
              {callAI && !actionReport && !generatingReport && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-400 whitespace-nowrap">AI Model:</label>
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                    >
                      <optgroup label="Anthropic">
                        {AI_MODEL_OPTIONS.filter(m => m.provider === 'anthropic').map(m => (
                          <option key={m.value} value={m.value}>{m.label} — {m.cost}</option>
                        ))}
                      </optgroup>
                      <optgroup label="OpenAI">
                        {AI_MODEL_OPTIONS.filter(m => m.provider === 'openai').map(m => (
                          <option key={m.value} value={m.value}>{m.label} — {m.cost}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                  <button onClick={generateActionReport} className="w-full px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-lg text-white font-medium flex items-center justify-center gap-2 text-sm shadow-lg shadow-cyan-500/20">
                    <FileText className="w-4 h-4" />Generate DTC Action Report
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Report states shown above drop zone */}
          {generatingReport && !results && (
            <div className="bg-gradient-to-br from-cyan-900/30 to-blue-900/30 border border-cyan-500/30 rounded-xl p-6 text-center">
              <div className="w-8 h-8 border-3 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin mx-auto mb-3" style={{borderWidth: '3px'}} />
              <p className="text-white font-medium">Generating DTC Action Report...</p>
              <p className="text-slate-400 text-sm mt-1">Analyzing Google, Meta, Shopify & Amazon data with expert DTC frameworks</p>
              <p className="text-slate-500 text-xs mt-2">This may take 30-60 seconds</p>
            </div>
          )}

          {reportError && !results && (
            <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4">
              <p className="text-red-400 font-medium">Report generation failed</p>
              <p className="text-red-400/70 text-sm mt-1">{reportError}</p>
              <button onClick={generateActionReport} className="mt-2 px-4 py-2 bg-red-600/30 hover:bg-red-600/50 rounded-lg text-red-300 text-sm">Retry</button>
            </div>
          )}

          {actionReport && !results && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-bold flex items-center gap-2">
                  <FileText className="w-5 h-5 text-cyan-400" />DTC Action Report
                </h3>
                <div className="flex gap-2">
                  <button onClick={exportReportPdf} className="px-3 py-1.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 rounded-lg text-white text-sm font-medium flex items-center gap-1.5 shadow-lg shadow-orange-500/20">
                    <Download className="w-3.5 h-3.5" />Export PDF
                  </button>
                  <button onClick={downloadReport} className="px-3 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 rounded-lg text-emerald-300 text-sm flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5" />Download .md
                  </button>
                  <button onClick={generateActionReport} className="px-3 py-1.5 bg-slate-600/50 hover:bg-slate-600 rounded-lg text-slate-300 text-sm">Regenerate</button>
                  <button onClick={() => setActionReport(null)} className="px-3 py-1.5 bg-slate-600/50 hover:bg-slate-600 rounded-lg text-slate-300 text-sm">Close Report</button>
                </div>
              </div>
              <div className="bg-slate-950 border border-slate-700 rounded-xl p-5 max-h-[60vh] overflow-y-auto text-slate-300 text-sm leading-relaxed max-w-none
                [&_h1]:text-xl [&_h1]:font-extrabold [&_h1]:text-white [&_h1]:mt-6 [&_h1]:mb-3
                [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-white [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:pb-2 [&_h2]:border-b [&_h2]:border-slate-700
                [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-200 [&_h3]:mt-4 [&_h3]:mb-2
                [&_strong]:text-orange-400 [&_em]:text-amber-300
                [&_ul]:space-y-1 [&_ol]:space-y-1 [&_ul]:pl-5 [&_ol]:pl-5
                [&_li]:text-slate-300 [&_li]:leading-relaxed
                [&_p]:text-slate-300 [&_p]:leading-relaxed [&_p]:mb-1
                [&_.table-wrap]:overflow-x-auto [&_.table-wrap]:my-3 [&_.table-wrap]:rounded-lg [&_.table-wrap]:border [&_.table-wrap]:border-slate-700
                [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse
                [&_th]:bg-slate-800 [&_th]:text-left [&_th]:text-slate-400 [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold [&_th]:text-[0.65rem] [&_th]:uppercase [&_th]:tracking-wide [&_th]:border-b-2 [&_th]:border-indigo-500 [&_th]:whitespace-nowrap
                [&_td]:px-3 [&_td]:py-1.5 [&_td]:text-slate-300 [&_td]:border-b [&_td]:border-slate-800 [&_td]:align-top
                [&_tbody_tr:nth-child(even)]:bg-slate-800/40 [&_tbody_tr:hover]:bg-indigo-500/10
                [&_code]:bg-slate-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-emerald-400 [&_code]:text-xs
                [&_hr]:border-slate-700 [&_hr]:my-4
              ">
                <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderMarkdown(actionReport)) }} />
              </div>
            </div>
          )}

          {/* Drop zone */}
          {!actionReport && !generatingReport && (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${dragOver ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-600 hover:border-slate-500 bg-slate-800/30'}`}
              >
                <input type="file" multiple accept=".csv,.xlsx,.xls,.zip" onChange={handleFileInput} className="absolute inset-0 opacity-0 cursor-pointer" />
                <Upload className={`w-10 h-10 mx-auto mb-3 ${dragOver ? 'text-cyan-400' : 'text-slate-500'}`} />
                <p className="text-white font-medium mb-1">{detectedFiles.length > 0 ? 'Drop more files or click to add' : 'Drop all your Google, Meta, Shopify & Amazon reports'}</p>
                <p className="text-slate-500 text-xs">XLSX & CSV — campaigns, ad sets, ads, search terms, keywords, sessions, sales, search queries</p>
                <p className="text-slate-500 text-xs mt-1">
                  <Archive className="w-3 h-3 inline mr-1" />ZIP archives supported — we'll extract and detect all files inside
                </p>
              </div>

              {/* Detected files */}
              {detectedFiles.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{detectedFiles.length} file{detectedFiles.length !== 1 ? 's' : ''} detected</p>
                  {detectedFiles.map((det, i) => (
                    <div key={i} className={`flex items-center gap-3 ${det.type ? 'bg-slate-800/50 border border-slate-700' : 'bg-amber-900/20 border border-amber-500/30'} rounded-lg p-2.5`}>
                      <span className="text-lg">{det.type ? platformIcon(det.type) : '⚠️'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{det.file.name}</p>
                        <p className={`text-xs ${det.type ? 'text-slate-400' : 'text-amber-400'}`}>
                          {det.type ? `${typeLabels[det.type] || det.type} · ${det.rows} rows${det.dateRange ? ` · ${det.dateRange.from} - ${det.dateRange.to}` : ''}` : det.error || 'Unrecognized'}
                        </p>
                      </div>
                      <button onClick={() => removeFile(i)} className="p-1 hover:bg-slate-700 rounded text-slate-500 hover:text-white">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Results */}
              {results && (
                <div className="space-y-3">
                  <div className="bg-slate-800/50 rounded-lg p-3 space-y-1">
                    <p className="text-slate-300 text-xs font-medium mb-2">Processing Results</p>
                    {results.map((r, i) => (
                      <div key={i} className={`flex items-center gap-2 text-sm ${r.status === 'success' ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {r.status === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                        <span className="truncate">{r.fileName}: {r.status === 'success' ? `${r.rows} rows → ${typeLabels[r.key] || r.key}` : r.error}</span>
                      </div>
                    ))}
                  </div>

                  {results.some(r => r.status === 'success') && (
                    <div className="space-y-3">
                      <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-lg p-3">
                        <p className="text-emerald-400 font-medium flex items-center gap-2"><CheckCircle className="w-4 h-4" />Data imported!</p>
                      </div>
                      {callAI && !actionReport && !generatingReport && (
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-slate-400 whitespace-nowrap">AI Model:</label>
                          <select
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                            className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                          >
                            {AI_MODEL_OPTIONS.map(m => (
                              <option key={m.value} value={m.value}>{m.label} — {m.cost}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="flex gap-2">
                        {callAI && !actionReport && !generatingReport && (
                          <button onClick={generateActionReport} className="flex-1 px-4 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-xl text-white font-medium flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20">
                            <FileText className="w-4 h-4" />Generate DTC Action Report
                          </button>
                        )}
                        <button onClick={() => { setShow(false); setDetectedFiles([]); setResults(null); }} className="px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-white font-medium flex items-center justify-center gap-2">
                          <CheckCircle className="w-4 h-4" />Done
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!actionReport && !generatingReport && (
          <div className="p-4 border-t border-slate-700 flex justify-between items-center">
            <div>
              {validFiles.length > 0 && <p className="text-slate-400 text-sm">{validFiles.length} report{validFiles.length !== 1 ? 's' : ''} ready</p>}
              {detectedFiles.length > 0 && (
                <button onClick={() => { setDetectedFiles([]); setResults(null); }} className="text-slate-500 text-xs hover:text-slate-300">Clear all</button>
              )}
            </div>
            <button
              onClick={processAll}
              disabled={validFiles.length === 0 || processing}
              className="px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg font-medium disabled:opacity-40 hover:opacity-90 flex items-center gap-2"
            >
              {processing ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Importing...</>
              ) : (
                <><Upload className="w-4 h-4" /> Import {validFiles.length} Report{validFiles.length !== 1 ? 's' : ''}</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DtcAdsIntelModal;
