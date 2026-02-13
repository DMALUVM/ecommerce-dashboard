import React, { useState, useCallback } from 'react';
import { Brain, X, Upload, FileSpreadsheet, CheckCircle, AlertTriangle, TrendingUp, Target, Search, BarChart3, Eye, ShoppingCart, Zap, Download, FileText, Loader2, Archive, ChevronDown } from 'lucide-react';
import { loadXLSX } from '../../utils/xlsx';
import { AI_DEFAULT_MODEL, AI_MODEL_OPTIONS } from '../../utils/config';
import { sanitizeHtml } from '../../utils/sanitize';

const REPORT_TYPES = [
  { key: 'dailyOverview', label: 'Daily Ads Overview', icon: TrendingUp, color: 'yellow', desc: 'Seller Central daily ads overview (recent 30d)' },
  { key: 'historicalDaily', label: 'Historical Daily Data', icon: BarChart3, color: 'indigo', desc: 'Historical daily ads data (months/years)' },
  { key: 'spSearchTerms', label: 'SP Search Terms', icon: Search, color: 'blue', desc: 'Sponsored Products Search Term Report' },
  { key: 'spAdvertised', label: 'SP Advertised Products', icon: ShoppingCart, color: 'green', desc: 'Sponsored Products Advertised Product Report' },
  { key: 'spPlacement', label: 'SP Placements', icon: BarChart3, color: 'purple', desc: 'Sponsored Products / Brands Placement Report' },
  { key: 'spTargeting', label: 'SP Targeting', icon: Target, color: 'orange', desc: 'Sponsored Products Targeting Report' },
  { key: 'sbSearchTerms', label: 'SB Search Terms', icon: Search, color: 'cyan', desc: 'Sponsored Brands Search Term Report' },
  { key: 'sdCampaign', label: 'SD Campaigns', icon: Eye, color: 'pink', desc: 'Sponsored Display Campaign Report' },
  { key: 'businessReport', label: 'Business Report', icon: TrendingUp, color: 'emerald', desc: 'Amazon Business Report (by ASIN / child ASIN / Detail Page)' },
  { key: 'searchQueryPerf', label: 'Search Query Perf', icon: Search, color: 'amber', desc: 'Search Query Performance (Brand View)' },
  { key: 'skuEconomics', label: 'SKU Economics', icon: ShoppingCart, color: 'slate', desc: 'SKU Economics / Profitability Report' },
];

// Parse CSV line handling quotes
const parseCSVLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else current += char;
  }
  result.push(current.trim());
  return result;
};

const parseXlsx = async (file) => {
  const XLSX = await loadXLSX();
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  if (raw.length < 2) return [];
  
  // Find the real header row (first row with 3+ non-empty cells that look like column headers)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, raw.length); i++) {
    const row = raw[i] || [];
    const nonEmpty = row.filter(c => c != null && String(c).trim() !== '');
    if (nonEmpty.length >= 3) {
      // Check if this looks like a header row (contains known header keywords or non-numeric values)
      const hasHeaderWords = nonEmpty.some(c => {
        const s = String(c).toLowerCase();
        return s.includes('date') || s.includes('asin') || s.includes('search') || s.includes('campaign') || 
               s.includes('spend') || s.includes('impressions') || s.includes('clicks') || s.includes('sessions') ||
               s.includes('query') || s.includes('targeting') || s.includes('placement') || s.includes('portfolio') ||
               s.includes('currency') || s.includes('country') || s.includes('sku') || s.includes('title') ||
               s.includes('amazon store') || s.includes('start date') || s.includes('units') || s.includes('sales');
      });
      if (hasHeaderWords) { headerIdx = i; break; }
    }
  }
  
  const headers = (raw[headerIdx] || []).map(h => h != null ? String(h).trim() : '');
  const rows = [];
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const rowData = raw[i] || [];
    if (rowData.every(c => c == null || String(c).trim() === '')) continue;
    const obj = {};
    headers.forEach((h, idx) => { if (h) obj[h] = rowData[idx] != null ? rowData[idx] : null; });
    rows.push(obj);
  }
  return rows;
};

const parseCSV = (text) => {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  // Skip metadata lines (like Search Query Performance header)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes('asin') || lower.includes('date') || lower.includes('search query')) {
      headerIdx = i;
      break;
    }
  }
  const headers = parseCSVLine(lines[headerIdx]);
  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 3) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = cols[idx] || null; });
    rows.push(row);
  }
  return rows;
};

// Normalize date formats: "2026-01-01", "01/01/2024" (DD/MM/YYYY), Date objects from xlsx, etc
const normalizeDate = (d) => {
  if (!d) return null;
  // Handle Date objects (from xlsx)
  if (d instanceof Date || (typeof d === 'object' && d.getFullYear)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const s = String(d).replace(/"/g, '').trim();
  // YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split('/');
    return `${yyyy}-${mm}-${dd}`;
  }
  // MM/DD/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const parts = s.split('/');
    return `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
  }
  return s;
};

// Helper to parse numeric values from CSV
const parseNum = (v) => {
  if (v === null || v === undefined || v === '' || v === 'null') return 0;
  const s = String(v).replace(/[$,%"\s]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

// ============ WRITE DAILY DATA TO TRACKING ============
// This function takes daily overview rows and merges them into allDaysData and amazonCampaigns
const writeDailyToTracking = (rows, currentDays = {}, currentCampaigns = {}) => {
  const updatedDays = { ...currentDays };
  const updatedCampaigns = { ...currentCampaigns };
  
  // Step 1: Pre-aggregate all rows by date (a single file may have multiple campaign rows per date)
  const byDate = {};
  const campaignAgg = {};
  
  rows.forEach(row => {
    const date = normalizeDate(row['date'] || row['Date']);
    if (!date) return;
    
    const campaign = row['Campaign Name'] || row['campaign'] || row['Campaign'] || '';
    const spend = parseNum(row['Spend']);
    const revenue = parseNum(row['Revenue']);
    const adRevenue = parseNum(row['Ad Revenue'] || row['revenue']);
    const orders = parseNum(row['Orders']);
    const impressions = parseNum(row['Impressions']);
    const clicks = parseNum(row['Clicks']);
    const totalRevenue = parseNum(row['Total Revenue']);
    const totalUnits = parseNum(row['Total Units Ordered'] || row['Total Units']);
    
    if (spend === 0 && revenue === 0 && orders === 0 && impressions === 0) return;
    
    if (!byDate[date]) {
      byDate[date] = { adSpend: 0, adRevenue: 0, adOrders: 0, adImpressions: 0, adClicks: 0, totalRevenue: 0, totalUnits: 0 };
    }
    byDate[date].adSpend += spend;
    byDate[date].adRevenue += (adRevenue || revenue);
    byDate[date].adOrders += orders;
    byDate[date].adImpressions += impressions;
    byDate[date].adClicks += clicks;
    byDate[date].totalRevenue = Math.max(byDate[date].totalRevenue, totalRevenue);
    byDate[date].totalUnits = Math.max(byDate[date].totalUnits, totalUnits);
    
    // Campaign aggregation
    if (campaign) {
      const campKey = campaign;
      if (!campaignAgg[campKey]) campaignAgg[campKey] = { name: campaign, totalSpend: 0, totalRevenue: 0, totalOrders: 0, days: {} };
      campaignAgg[campKey].totalSpend += spend;
      campaignAgg[campKey].totalRevenue += (adRevenue || revenue);
      campaignAgg[campKey].totalOrders += orders;
      if (!campaignAgg[campKey].days[date]) campaignAgg[campKey].days[date] = { spend: 0, revenue: 0, orders: 0 };
      campaignAgg[campKey].days[date].spend += spend;
      campaignAgg[campKey].days[date].revenue += (adRevenue || revenue);
      campaignAgg[campKey].days[date].orders += orders;
    }
  });
  
  // Step 2: REPLACE ad metrics per date (prevents double-counting on re-upload)
  for (const [date, agg] of Object.entries(byDate)) {
    if (!updatedDays[date]) {
      updatedDays[date] = { amazon: { sales: 0, units: 0, refunds: 0, adSpend: 0, adRevenue: 0, orders: 0 } };
    }
    if (!updatedDays[date].amazon) {
      updatedDays[date].amazon = { sales: 0, units: 0, refunds: 0, adSpend: 0, adRevenue: 0, orders: 0 };
    }
    
    // REPLACE (not accumulate) ad metrics for this date
    updatedDays[date].amazon.adSpend = agg.adSpend;
    updatedDays[date].amazon.adRevenue = agg.adRevenue;
    updatedDays[date].amazon.adOrders = agg.adOrders;
    updatedDays[date].amazon.adImpressions = agg.adImpressions;
    updatedDays[date].amazon.adClicks = agg.adClicks;
    
    if (agg.totalRevenue > 0) {
      updatedDays[date].amazon.sales = Math.max(updatedDays[date].amazon.sales || 0, agg.totalRevenue);
    }
    if (agg.totalUnits > 0) {
      updatedDays[date].amazon.units = Math.max(updatedDays[date].amazon.units || 0, agg.totalUnits);
    }
  }
  
  // Step 3: REPLACE campaign data (prevents double-counting on re-upload)
  for (const [campName, campData] of Object.entries(campaignAgg)) {
    updatedCampaigns[campName] = campData;
  }
  
  return { updatedDays, updatedCampaigns };
};

// ============ DAILY OVERVIEW / HISTORICAL AGGREGATION ============

const aggregateDailyOverview = (rows) => {
  // Parse each day
  const days = rows.map(r => ({
    date: normalizeDate(r['date'] || r['Date']),
    spend: num(r['Spend']),
    revenue: num(r['Revenue']),
    orders: num(r['Orders']),
    conversions: num(r['Conversions']),
    roas: num(r['ROAS']),
    acos: num(r['ACOS']),
    impressions: num(r['Impressions']),
    clicks: num(r['Clicks']),
    ctr: num(r['CTR']),
    cpc: num(r['Avg CPC']),
    convRate: num(r['Conv Rate']),
    tacos: num(r['Total ACOS (TACOS)']),
    totalUnits: num(r['Total Units Ordered']),
    totalRevenue: num(r['Total Revenue']),
  })).filter(d => d.date && d.spend > 0).sort((a, b) => a.date.localeCompare(b.date));

  if (days.length === 0) return null;

  // Monthly summaries
  const monthly = {};
  days.forEach(d => {
    const m = d.date.substring(0, 7);
    if (!monthly[m]) monthly[m] = { month: m, spend: 0, revenue: 0, totalRevenue: 0, orders: 0, clicks: 0, impressions: 0, days: 0 };
    monthly[m].spend += d.spend;
    monthly[m].revenue += d.revenue;
    monthly[m].totalRevenue += d.totalRevenue;
    monthly[m].orders += d.orders;
    monthly[m].clicks += d.clicks;
    monthly[m].impressions += d.impressions;
    monthly[m].days++;
  });
  const monthlyArr = Object.values(monthly).map(m => ({
    ...m,
    roas: m.spend > 0 ? m.revenue / m.spend : 0,
    acos: m.revenue > 0 ? (m.spend / m.revenue) * 100 : 0,
    tacos: m.totalRevenue > 0 ? (m.spend / m.totalRevenue) * 100 : 0,
    avgDailySpend: m.days > 0 ? m.spend / m.days : 0,
    avgDailyRevenue: m.days > 0 ? m.totalRevenue / m.days : 0,
    cpc: m.clicks > 0 ? m.spend / m.clicks : 0,
    ctr: m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0,
    convRate: m.clicks > 0 ? (m.orders / m.clicks) * 100 : 0,
  })).sort((a, b) => a.month.localeCompare(b.month));

  // Day-of-week patterns
  const dow = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };
  const dowBuckets = {};
  days.forEach(d => {
    const dayIdx = new Date(d.date + 'T12:00:00').getDay();
    const dayName = dow[dayIdx];
    if (!dowBuckets[dayName]) dowBuckets[dayName] = { day: dayName, spend: 0, revenue: 0, totalRevenue: 0, orders: 0, count: 0 };
    dowBuckets[dayName].spend += d.spend;
    dowBuckets[dayName].revenue += d.revenue;
    dowBuckets[dayName].totalRevenue += d.totalRevenue;
    dowBuckets[dayName].orders += d.orders;
    dowBuckets[dayName].count++;
  });
  const dowArr = Object.values(dowBuckets).map(b => ({
    ...b,
    avgSpend: b.count > 0 ? b.spend / b.count : 0,
    avgRevenue: b.count > 0 ? b.revenue / b.count : 0,
    avgTotalRevenue: b.count > 0 ? b.totalRevenue / b.count : 0,
    avgOrders: b.count > 0 ? b.orders / b.count : 0,
    roas: b.spend > 0 ? b.revenue / b.spend : 0,
    tacos: b.totalRevenue > 0 ? (b.spend / b.totalRevenue) * 100 : 0,
  })).sort((a, b) => b.roas - a.roas);

  // Last 7 vs prior 7 momentum
  const recent7 = days.slice(-7);
  const prior7 = days.slice(-14, -7);
  const r7 = recent7.reduce((a, d) => ({ spend: a.spend + d.spend, revenue: a.revenue + d.revenue, orders: a.orders + d.orders, totalRevenue: a.totalRevenue + d.totalRevenue }), { spend: 0, revenue: 0, orders: 0, totalRevenue: 0 });
  const p7 = prior7.length >= 5 ? prior7.reduce((a, d) => ({ spend: a.spend + d.spend, revenue: a.revenue + d.revenue, orders: a.orders + d.orders, totalRevenue: a.totalRevenue + d.totalRevenue }), { spend: 0, revenue: 0, orders: 0, totalRevenue: 0 }) : null;

  // Best / worst days
  const bestROAS = [...days].sort((a, b) => b.roas - a.roas).slice(0, 5);
  const worstROAS = [...days].filter(d => d.spend > 100).sort((a, b) => a.roas - b.roas).slice(0, 5);
  const highestSpend = [...days].sort((a, b) => b.spend - a.spend).slice(0, 5);
  const highestRevenue = [...days].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 5);

  // Totals
  const totalSpend = days.reduce((s, d) => s + d.spend, 0);
  const totalAdRevenue = days.reduce((s, d) => s + d.revenue, 0);
  const totalRevenue = days.reduce((s, d) => s + d.totalRevenue, 0);
  const totalOrders = days.reduce((s, d) => s + d.orders, 0);

  return {
    dateRange: { from: days[0].date, to: days[days.length - 1].date },
    totalDays: days.length,
    totalSpend, totalAdRevenue, totalRevenue, totalOrders,
    overallROAS: totalSpend > 0 ? totalAdRevenue / totalSpend : 0,
    overallACOS: totalAdRevenue > 0 ? (totalSpend / totalAdRevenue) * 100 : 0,
    overallTACOS: totalRevenue > 0 ? (totalSpend / totalRevenue) * 100 : 0,
    monthly: monthlyArr,
    dayOfWeek: dowArr,
    momentum: {
      recent7: { ...r7, roas: r7.spend > 0 ? r7.revenue / r7.spend : 0, tacos: r7.totalRevenue > 0 ? (r7.spend / r7.totalRevenue) * 100 : 0 },
      prior7: p7 ? { ...p7, roas: p7.spend > 0 ? p7.revenue / p7.spend : 0, tacos: p7.totalRevenue > 0 ? (p7.spend / p7.totalRevenue) * 100 : 0 } : null,
    },
    bestROAS, worstROAS, highestSpend, highestRevenue,
  };
};

const num = (v) => {
  if (v === null || v === undefined || v === '' || v === 'null') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const s = String(v).replace(/[$,%"\s]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

const pct = (v) => {
  if (v === null || v === undefined) return 0;
  const n = num(v);
  // If already a decimal (like 0.25 for 25%), convert
  return n > 1 ? n : n * 100;
};

// ============ AGGREGATION FUNCTIONS ============

const aggregateSPSearchTerms = (rows) => {
  // Aggregate by search term across all dates
  const byTerm = {};
  rows.forEach(r => {
    const term = r['Customer Search Term'] || r['customer search term'] || '';
    if (!term) return;
    if (!byTerm[term]) byTerm[term] = { term, spend: 0, sales: 0, impressions: 0, clicks: 0, orders: 0, units: 0, matchTypes: new Set(), campaigns: new Set() };
    byTerm[term].spend += num(r['Spend'] || r['spend']);
    byTerm[term].sales += num(r['7 Day Total Sales '] || r['7 Day Total Sales'] || r['Total Sales']);
    byTerm[term].impressions += num(r['Impressions'] || r['impressions']);
    byTerm[term].clicks += num(r['Clicks'] || r['clicks']);
    byTerm[term].orders += num(r['7 Day Total Orders (#)'] || r['Total Orders']);
    byTerm[term].units += num(r['7 Day Total Units (#)'] || r['Total Units']);
    const mt = r['Match Type'] || r['match type'] || '';
    if (mt) byTerm[term].matchTypes.add(mt);
    const camp = r['Campaign Name'] || r['campaign name'] || '';
    if (camp) byTerm[term].campaigns.add(camp);
  });

  const terms = Object.values(byTerm).map(t => ({
    ...t,
    roas: t.spend > 0 ? t.sales / t.spend : 0,
    acos: t.sales > 0 ? (t.spend / t.sales) * 100 : (t.spend > 0 ? 999 : 0),
    ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0,
    convRate: t.clicks > 0 ? (t.orders / t.clicks) * 100 : 0,
    cpc: t.clicks > 0 ? t.spend / t.clicks : 0,
    matchTypes: [...t.matchTypes],
    campaigns: [...t.campaigns],
  }));

  const topByROAS = terms.filter(t => t.spend >= 5 && t.sales > 0).sort((a, b) => b.roas - a.roas).slice(0, 25);
  const topBySales = terms.filter(t => t.sales > 0).sort((a, b) => b.sales - a.sales).slice(0, 25);
  const wasteful = terms.filter(t => t.spend >= 5 && t.sales === 0).sort((a, b) => b.spend - a.spend).slice(0, 25);
  const highSpend = terms.filter(t => t.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, 25);
  const highImprNoClick = terms.filter(t => t.impressions > 100 && t.clicks === 0).sort((a, b) => b.impressions - a.impressions).slice(0, 15);

  const totalSpend = terms.reduce((s, t) => s + t.spend, 0);
  const totalSales = terms.reduce((s, t) => s + t.sales, 0);

  return {
    totalTerms: terms.length,
    totalSpend,
    totalSales,
    overallROAS: totalSpend > 0 ? totalSales / totalSpend : 0,
    topByROAS,
    topBySales,
    wasteful,
    highSpend,
    highImprNoClick,
  };
};

const aggregateSPAdvertised = (rows) => {
  const byASIN = {};
  rows.forEach(r => {
    const asin = r['Advertised ASIN'] || '';
    const sku = r['Advertised SKU'] || '';
    const key = asin || sku;
    if (!key) return;
    if (!byASIN[key]) byASIN[key] = { asin, sku, spend: 0, sales: 0, impressions: 0, clicks: 0, orders: 0, units: 0, campaigns: new Set() };
    byASIN[key].spend += num(r['Spend'] || r['spend']);
    byASIN[key].sales += num(r['7 Day Total Sales '] || r['7 Day Total Sales']);
    byASIN[key].impressions += num(r['Impressions']);
    byASIN[key].clicks += num(r['Clicks']);
    byASIN[key].orders += num(r['7 Day Total Orders (#)']);
    byASIN[key].units += num(r['7 Day Total Units (#)']);
    const camp = r['Campaign Name'] || '';
    if (camp) byASIN[key].campaigns.add(camp);
  });

  return Object.values(byASIN).map(a => ({
    ...a,
    roas: a.spend > 0 ? a.sales / a.spend : 0,
    acos: a.sales > 0 ? (a.spend / a.sales) * 100 : (a.spend > 0 ? 999 : 0),
    ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0,
    convRate: a.clicks > 0 ? (a.orders / a.clicks) * 100 : 0,
    campaigns: [...a.campaigns],
  })).sort((a, b) => b.spend - a.spend);
};

const aggregateSPPlacement = (rows) => {
  const byPlacement = {};
  rows.forEach(r => {
    const placement = r['Placement'] || 'Other';
    if (!byPlacement[placement]) byPlacement[placement] = { placement, spend: 0, sales: 0, impressions: 0, clicks: 0, orders: 0 };
    byPlacement[placement].spend += num(r['Spend'] || r['spend']);
    byPlacement[placement].sales += num(r['7 Day Total Sales '] || r['7 Day Total Sales'] || r['14 Day Total Sales'] || r['14 Day Total Sales ']);
    byPlacement[placement].impressions += num(r['Impressions']);
    byPlacement[placement].clicks += num(r['Clicks']);
    byPlacement[placement].orders += num(r['7 Day Total Orders (#)'] || r['14 Day Total Orders (#)']);
  });

  // Also aggregate by campaign + placement for detailed view
  const byCampaignPlacement = {};
  rows.forEach(r => {
    const camp = r['Campaign Name'] || '';
    const placement = r['Placement'] || 'Other';
    const key = `${camp}|||${placement}`;
    if (!byCampaignPlacement[key]) byCampaignPlacement[key] = { campaign: camp, placement, spend: 0, sales: 0, clicks: 0, orders: 0 };
    byCampaignPlacement[key].spend += num(r['Spend'] || r['spend']);
    byCampaignPlacement[key].sales += num(r['7 Day Total Sales '] || r['7 Day Total Sales'] || r['14 Day Total Sales'] || r['14 Day Total Sales ']);
    byCampaignPlacement[key].clicks += num(r['Clicks']);
    byCampaignPlacement[key].orders += num(r['7 Day Total Orders (#)'] || r['14 Day Total Orders (#)']);
  });

  return {
    byPlacement: Object.values(byPlacement).map(p => ({
      ...p,
      roas: p.spend > 0 ? p.sales / p.spend : 0,
      acos: p.sales > 0 ? (p.spend / p.sales) * 100 : 0,
      ctr: p.impressions > 0 ? (p.clicks / p.impressions) * 100 : 0,
      convRate: p.clicks > 0 ? (p.orders / p.clicks) * 100 : 0,
    })).sort((a, b) => b.spend - a.spend),
    topCampaignPlacements: Object.values(byCampaignPlacement)
      .map(cp => ({ ...cp, roas: cp.spend > 0 ? cp.sales / cp.spend : 0 }))
      .filter(cp => cp.spend > 10)
      .sort((a, b) => b.roas - a.roas)
      .slice(0, 20),
  };
};

const aggregateSPTargeting = (rows) => {
  const byTarget = {};
  rows.forEach(r => {
    const target = r['Targeting'] || '';
    const matchType = r['Match Type'] || '';
    const key = `${target}|${matchType}`;
    if (!byTarget[key]) byTarget[key] = { target, matchType, spend: 0, sales: 0, impressions: 0, clicks: 0, orders: 0, tosShare: [] };
    byTarget[key].spend += num(r['Spend'] || r['spend']);
    byTarget[key].sales += num(r['7 Day Total Sales '] || r['7 Day Total Sales'] || r['14 Day Total Sales'] || r['14 Day Total Sales ']);
    byTarget[key].impressions += num(r['Impressions']);
    byTarget[key].clicks += num(r['Clicks']);
    byTarget[key].orders += num(r['7 Day Total Orders (#)'] || r['14 Day Total Orders (#)']);
    const tos = num(r['Top-of-search Impression Share'] || r['Top-of-Search IS']);
    if (tos > 0) byTarget[key].tosShare.push(tos);
  });

  return Object.values(byTarget).map(t => ({
    ...t,
    roas: t.spend > 0 ? t.sales / t.spend : 0,
    acos: t.sales > 0 ? (t.spend / t.sales) * 100 : (t.spend > 0 ? 999 : 0),
    ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0,
    convRate: t.clicks > 0 ? (t.orders / t.clicks) * 100 : 0,
    avgTosShare: t.tosShare.length > 0 ? t.tosShare.reduce((a, b) => a + b, 0) / t.tosShare.length : 0,
  })).sort((a, b) => b.spend - a.spend);
};

const aggregateSBSearchTerms = (rows) => {
  const byTerm = {};
  rows.forEach(r => {
    const term = r['Customer Search Term'] || '';
    if (!term) return;
    if (!byTerm[term]) byTerm[term] = { term, spend: 0, sales: 0, impressions: 0, clicks: 0, orders: 0 };
    byTerm[term].spend += num(r['Spend'] || r['spend']);
    byTerm[term].sales += num(r['14 Day Total Sales '] || r['14 Day Total Sales'] || r['Total Sales']);
    byTerm[term].impressions += num(r['Impressions']);
    byTerm[term].clicks += num(r['Clicks']);
    byTerm[term].orders += num(r['14 Day Total Orders (#)'] || r['Total Orders']);
  });

  return Object.values(byTerm).map(t => ({
    ...t,
    roas: t.spend > 0 ? t.sales / t.spend : 0,
    acos: t.sales > 0 ? (t.spend / t.sales) * 100 : (t.spend > 0 ? 999 : 0),
    ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0,
    convRate: t.clicks > 0 ? (t.orders / t.clicks) * 100 : 0,
  })).sort((a, b) => b.spend - a.spend);
};

const aggregateSDCampaign = (rows) => {
  const byCampaign = {};
  rows.forEach(r => {
    const camp = r['Campaign Name'] || '';
    if (!byCampaign[camp]) byCampaign[camp] = { campaign: camp, spend: 0, sales: 0, impressions: 0, clicks: 0, orders: 0, ntbOrders: 0, ntbSales: 0, dpv: 0, status: '' };
    byCampaign[camp].spend += num(r['Spend'] || r['spend']);
    byCampaign[camp].sales += num(r['14 Day Total Sales '] || r['14 Day Total Sales']);
    byCampaign[camp].impressions += num(r['Impressions']);
    byCampaign[camp].clicks += num(r['Clicks']);
    byCampaign[camp].orders += num(r['14 Day Total Orders (#)']);
    byCampaign[camp].ntbOrders += num(r['14 Day New-to-brand Orders (#)']);
    byCampaign[camp].ntbSales += num(r['14 Day New-to-brand Sales']);
    byCampaign[camp].dpv += num(r['14 Day Detail Page Views (DPV)']);
    byCampaign[camp].status = r['Status'] || byCampaign[camp].status;
  });

  return Object.values(byCampaign).map(c => ({
    ...c,
    roas: c.spend > 0 ? c.sales / c.spend : 0,
    acos: c.sales > 0 ? (c.spend / c.sales) * 100 : (c.spend > 0 ? 999 : 0),
    ntbRate: c.orders > 0 ? (c.ntbOrders / c.orders) * 100 : 0,
    costPerDPV: c.dpv > 0 ? c.spend / c.dpv : 0,
  })).sort((a, b) => b.spend - a.spend);
};

const aggregateBusinessReport = (rows) => {
  return rows.map(r => {
    const asin = r['(Parent) ASIN'] || r['(Child) ASIN'] || '';
    const childAsin = r['(Child) ASIN'] || '';
    const title = r['Title'] || '';
    const sessions = num(r['Sessions - Total']);
    const pageViews = num(r['Page Views - Total']);
    const units = num(r['Units Ordered']);
    const sales = num(r['Ordered Product Sales']);
    const buyBox = num(r['Featured Offer (Buy Box) Percentage']);
    const refunds = num(r['Units Refunded']);
    const convRate = num(r['Unit Session Percentage']);
    return {
      asin, childAsin, title: title.substring(0, 80),
      sessions, pageViews, units, sales, buyBox, refunds, convRate,
      refundRate: units > 0 ? (refunds / units) * 100 : 0,
    };
  }).filter(r => r.sessions > 0 || r.units > 0).sort((a, b) => b.sales - a.sales);
};

const aggregateSearchQueryPerf = (rows) => {
  // Helper to find column value with fuzzy matching (handles trailing spaces, slight variations)
  const getCol = (r, ...names) => {
    for (const n of names) {
      if (r[n] !== undefined && r[n] !== null) return r[n];
    }
    // Fuzzy: try matching by lowercase includes
    const keys = Object.keys(r);
    for (const n of names) {
      const lower = n.toLowerCase();
      const match = keys.find(k => k.toLowerCase().trim() === lower || k.toLowerCase().includes(lower));
      if (match && r[match] !== undefined && r[match] !== null) return r[match];
    }
    return null;
  };

  return rows.map(r => {
    const query = getCol(r, 'Search Query', '"Search Query"', 'search query') || '';
    return {
      query: String(query).replace(/^"|"$/g, ''),
      score: num(getCol(r, 'Search Query Score')),
      volume: num(getCol(r, 'Search Query Volume')),
      totalImpressions: num(getCol(r, 'Impressions: Total Count')),
      brandImpressions: num(getCol(r, 'Impressions: Brand Count')),
      brandImprShare: num(getCol(r, 'Impressions: Brand Share', 'Impressions: Brand Share %')),
      totalClicks: num(getCol(r, 'Clicks: Total Count')),
      clickRate: num(getCol(r, 'Clicks: Click Rate', 'Clicks: Click Rate %')),
      brandClicks: num(getCol(r, 'Clicks: Brand Count')),
      brandClickShare: num(getCol(r, 'Clicks: Brand Share', 'Clicks: Brand Share %')),
      totalPurchases: num(getCol(r, 'Purchases: Total Count')),
      purchaseRate: num(getCol(r, 'Purchases: Purchase Rate', 'Purchases: Purchase Rate %')),
      brandPurchases: num(getCol(r, 'Purchases: Brand Count')),
      brandPurchaseShare: num(getCol(r, 'Purchases: Brand Share', 'Purchases: Brand Share %')),
      totalCartAdds: num(getCol(r, 'Cart Adds: Total Count')),
      brandCartAdds: num(getCol(r, 'Cart Adds: Brand Count')),
    };
  }).filter(r => r.query && r.totalImpressions > 0).sort((a, b) => b.volume - a.volume);
};

const aggregateSkuEconomics = (rows) => {
  return rows.map(r => {
    const asin = r['ASIN'] || r['Parent ASIN'] || '';
    const msku = r['MSKU'] || '';
    const fnsku = r['FNSKU'] || '';
    return {
      asin,
      parentAsin: r['Parent ASIN'] || '',
      msku,
      fnsku,
      avgPrice: num(r['Average sales price']),
      unitsSold: num(r['Units sold']),
      unitsReturned: num(r['Units returned']),
      netUnits: num(r['Net units sold']),
      sales: num(r['Sales']),
      netSales: num(r['Net sales']),
      fbaFees: num(r['FBA fees']),
      referralFee: num(r['Referral fee']),
      adSpend: num(r['Advertising spend']),
      cogsPerUnit: num(r['Cost of goods per unit']),
      contributionProfit: num(r['Contribution profit']),
      contributionMargin: num(r['Contribution margin']),
    };
  }).filter(r => r.asin && (r.unitsSold > 0 || r.sales > 0)).sort((a, b) => b.sales - a.sales);
};

// ============ BUILD AI CONTEXT ============

const buildDailyContext = (data, label) => {
  if (!data) return '';
  let ctx = `\n--- ${label} (${data.dateRange.from} to ${data.dateRange.to}, ${data.totalDays} days) ---
TOTALS: Ad Spend $${Math.round(data.totalSpend).toLocaleString()} | Ad Revenue $${Math.round(data.totalAdRevenue).toLocaleString()} | Total Revenue $${Math.round(data.totalRevenue).toLocaleString()} | Orders ${data.totalOrders.toLocaleString()}
ROAS: ${data.overallROAS.toFixed(2)} | ACOS: ${data.overallACOS.toFixed(1)}% | TACOS: ${data.overallTACOS.toFixed(1)}%
`;

  // Monthly trend
  if (data.monthly.length > 1) {
    ctx += `\nMONTHLY TREND:\n`;
    data.monthly.slice(-12).forEach(m => {
      ctx += `  ${m.month}: Spend $${Math.round(m.spend).toLocaleString()} | Ad Rev $${Math.round(m.revenue).toLocaleString()} | Total Rev $${Math.round(m.totalRevenue).toLocaleString()} | ROAS ${m.roas.toFixed(2)} | ACOS ${m.acos.toFixed(1)}% | TACOS ${m.tacos.toFixed(1)}% | CPC $${m.cpc.toFixed(2)} | Conv ${m.convRate.toFixed(1)}%\n`;
    });
    // Month-over-month changes
    if (data.monthly.length >= 2) {
      const last = data.monthly[data.monthly.length - 1];
      const prev = data.monthly[data.monthly.length - 2];
      const spendChg = prev.spend > 0 ? ((last.spend - prev.spend) / prev.spend * 100) : 0;
      const roasChg = prev.roas > 0 ? ((last.roas - prev.roas) / prev.roas * 100) : 0;
      const revChg = prev.totalRevenue > 0 ? ((last.totalRevenue - prev.totalRevenue) / prev.totalRevenue * 100) : 0;
      ctx += `  MoM CHANGES (${prev.month} → ${last.month}): Spend ${spendChg >= 0 ? '+' : ''}${spendChg.toFixed(1)}% | ROAS ${roasChg >= 0 ? '+' : ''}${roasChg.toFixed(1)}% | Total Rev ${revChg >= 0 ? '+' : ''}${revChg.toFixed(1)}%\n`;
    }
  }

  // Day-of-week
  if (data.dayOfWeek.length > 0) {
    ctx += `\nDAY-OF-WEEK PERFORMANCE (sorted by ROAS):\n`;
    data.dayOfWeek.forEach(d => {
      ctx += `  ${d.day}: Avg Spend $${d.avgSpend.toFixed(0)} | Avg Ad Rev $${d.avgRevenue.toFixed(0)} | Avg Total Rev $${d.avgTotalRevenue.toFixed(0)} | ROAS ${d.roas.toFixed(2)} | TACOS ${d.tacos.toFixed(1)}% | Avg Orders ${d.avgOrders.toFixed(1)}\n`;
    });
  }

  // Momentum
  if (data.momentum.prior7) {
    const r = data.momentum.recent7;
    const p = data.momentum.prior7;
    const spendChg = p.spend > 0 ? ((r.spend - p.spend) / p.spend * 100) : 0;
    const roasChg = p.roas > 0 ? ((r.roas - p.roas) / p.roas * 100) : 0;
    ctx += `\nWEEK-OVER-WEEK MOMENTUM (last 7d vs prior 7d):
  Recent 7d: Spend $${Math.round(r.spend)} | ROAS ${r.roas.toFixed(2)} | TACOS ${r.tacos.toFixed(1)}%
  Prior 7d:  Spend $${Math.round(p.spend)} | ROAS ${p.roas.toFixed(2)} | TACOS ${p.tacos.toFixed(1)}%
  Change: Spend ${spendChg >= 0 ? '+' : ''}${spendChg.toFixed(1)}% | ROAS ${roasChg >= 0 ? '+' : ''}${roasChg.toFixed(1)}%
`;
  }

  // Outliers
  ctx += `\nBEST ROAS DAYS: ${data.bestROAS.slice(0, 3).map(d => `${d.date} ROAS ${d.roas.toFixed(2)} ($${Math.round(d.spend)} spend)`).join(' | ')}`;
  ctx += `\nWORST ROAS DAYS: ${data.worstROAS.slice(0, 3).map(d => `${d.date} ROAS ${d.roas.toFixed(2)} ($${Math.round(d.spend)} spend)`).join(' | ')}`;
  ctx += `\nHIGHEST REVENUE DAYS: ${data.highestRevenue.slice(0, 3).map(d => `${d.date} $${Math.round(d.totalRevenue)} total rev`).join(' | ')}`;
  ctx += '\n';

  return ctx;
};

export const buildAdsIntelContext = (intelData) => {
  if (!intelData || !intelData.lastUpdated) return '';
  
  let context = `\n=== DETAILED AMAZON ADS INTELLIGENCE (Updated: ${new Date(intelData.lastUpdated).toLocaleDateString()}) ===\n`;

  // Daily Overview (recent)
  if (intelData.dailyOverview) {
    context += buildDailyContext(intelData.dailyOverview, 'RECENT DAILY PERFORMANCE');
  }

  // Historical Daily
  if (intelData.historicalDaily) {
    context += buildDailyContext(intelData.historicalDaily, 'HISTORICAL DAILY PERFORMANCE');
  }
  
  // SP Search Terms
  if (intelData.spSearchTerms) {
    const d = intelData.spSearchTerms;
    context += `\n--- SP SEARCH TERM ANALYSIS (${d.totalTerms} unique terms) ---
Total: Spend $${Math.round(d.totalSpend)} | Sales $${Math.round(d.totalSales)} | ROAS ${d.overallROAS.toFixed(2)}

TOP CONVERTING SEARCH TERMS (by ROAS, min $5 spend):
${d.topByROAS.slice(0, 15).map(t => `  "${t.term}" | ROAS ${t.roas.toFixed(1)} | Spend $${t.spend.toFixed(2)} | Sales $${t.sales.toFixed(2)} | Conv ${t.convRate.toFixed(1)}% | ${t.matchTypes.join('/')}`).join('\n')}

TOP REVENUE SEARCH TERMS:
${d.topBySales.slice(0, 10).map(t => `  "${t.term}" | Sales $${t.sales.toFixed(2)} | Spend $${t.spend.toFixed(2)} | ACOS ${t.acos.toFixed(1)}% | Orders ${t.orders}`).join('\n')}

WASTED SPEND (spend but $0 sales):
${d.wasteful.slice(0, 15).map(t => `  "${t.term}" | WASTED $${t.spend.toFixed(2)} | Clicks ${t.clicks} | Impr ${t.impressions} | ${t.matchTypes.join('/')}`).join('\n')}

HIGH IMPRESSIONS / NO CLICKS (potential negative targets):
${(d.highImprNoClick || []).slice(0, 10).map(t => `  "${t.term}" | ${t.impressions} impressions, 0 clicks`).join('\n')}
`;
  }

  // SP Advertised Products
  if (intelData.spAdvertised?.length > 0) {
    const prods = intelData.spAdvertised;
    context += `\n--- ADVERTISED PRODUCT PERFORMANCE (${prods.length} ASINs) ---
${prods.slice(0, 15).map(a => `  ${a.asin}${a.sku ? ` (${a.sku})` : ''} | Spend $${Math.round(a.spend)} | Sales $${Math.round(a.sales)} | ROAS ${a.roas.toFixed(2)} | ACOS ${a.acos.toFixed(1)}% | Conv ${a.convRate.toFixed(1)}%`).join('\n')}
`;
  }

  // SP Placements
  if (intelData.spPlacement) {
    const pl = intelData.spPlacement;
    context += `\n--- PLACEMENT PERFORMANCE ---
${pl.byPlacement.map(p => `  ${p.placement}: Spend $${Math.round(p.spend)} | Sales $${Math.round(p.sales)} | ROAS ${p.roas.toFixed(2)} | ACOS ${p.acos.toFixed(1)}% | CTR ${p.ctr.toFixed(2)}% | Conv ${p.convRate.toFixed(1)}%`).join('\n')}

BEST CAMPAIGN-PLACEMENT COMBOS:
${(pl.topCampaignPlacements || []).slice(0, 10).map(cp => `  ${cp.campaign.substring(0, 50)} @ ${cp.placement} | ROAS ${cp.roas.toFixed(2)} | Spend $${Math.round(cp.spend)}`).join('\n')}
`;
  }

  // SP Targeting
  if (intelData.spTargeting?.length > 0) {
    const targets = intelData.spTargeting;
    const topTargets = targets.filter(t => t.spend >= 5 && t.sales > 0).sort((a, b) => b.roas - a.roas).slice(0, 15);
    const wastefulTargets = targets.filter(t => t.spend >= 5 && t.sales === 0).sort((a, b) => b.spend - a.spend).slice(0, 10);
    const highTOS = targets.filter(t => t.avgTosShare > 5).sort((a, b) => b.avgTosShare - a.avgTosShare).slice(0, 10);
    
    context += `\n--- TARGETING PERFORMANCE (${targets.length} targets) ---
TOP TARGETS (by ROAS):
${topTargets.map(t => `  "${t.target}" (${t.matchType}) | ROAS ${t.roas.toFixed(2)} | Spend $${t.spend.toFixed(2)} | Sales $${t.sales.toFixed(2)} | TOS Share ${t.avgTosShare.toFixed(1)}%`).join('\n')}

WASTEFUL TARGETS ($0 sales):
${wastefulTargets.map(t => `  "${t.target}" (${t.matchType}) | WASTED $${t.spend.toFixed(2)} | ${t.clicks} clicks`).join('\n')}

TOP OF SEARCH IMPRESSION SHARE:
${highTOS.map(t => `  "${t.target}" | TOS Share: ${t.avgTosShare.toFixed(1)}% | ROAS ${t.roas.toFixed(2)}`).join('\n')}
`;
  }

  // SB Search Terms
  if (intelData.sbSearchTerms?.length > 0) {
    const sb = intelData.sbSearchTerms;
    const topSB = sb.filter(t => t.sales > 0).sort((a, b) => b.roas - a.roas).slice(0, 10);
    const totalSBSpend = sb.reduce((s, t) => s + t.spend, 0);
    const totalSBSales = sb.reduce((s, t) => s + t.sales, 0);
    context += `\n--- SPONSORED BRANDS SEARCH TERMS (${sb.length} terms) ---
Totals: Spend $${Math.round(totalSBSpend)} | Sales $${Math.round(totalSBSales)} | ROAS ${totalSBSpend > 0 ? (totalSBSales / totalSBSpend).toFixed(2) : 'N/A'}
Top Terms: ${topSB.map(t => `"${t.term}" ROAS ${t.roas.toFixed(1)}`).join(' | ')}
`;
  }

  // SD Campaigns
  if (intelData.sdCampaign?.length > 0) {
    const sd = intelData.sdCampaign;
    context += `\n--- SPONSORED DISPLAY CAMPAIGNS (${sd.length}) ---
${sd.slice(0, 10).map(c => `  ${c.campaign.substring(0, 55)} | ${c.status} | Spend $${Math.round(c.spend)} | Sales $${Math.round(c.sales)} | ROAS ${c.roas.toFixed(2)} | NTB ${c.ntbRate.toFixed(0)}% | DPV ${c.dpv}`).join('\n')}
`;
  }

  // Business Report
  if (intelData.businessReport?.length > 0) {
    const br = intelData.businessReport;
    context += `\n--- BUSINESS REPORT (Organic + Paid Traffic) ---
${br.slice(0, 12).map(r => `  ${r.asin}${r.childAsin ? ` (${r.childAsin})` : ''}: Sessions ${r.sessions.toLocaleString()} | Units ${r.units.toLocaleString()} | Sales $${Math.round(r.sales).toLocaleString()} | Conv ${r.convRate.toFixed(1)}% | BuyBox ${r.buyBox.toFixed(0)}% | Refund ${r.refundRate.toFixed(1)}%`).join('\n')}
`;
  }

  // Search Query Performance
  if (intelData.searchQueryPerf?.length > 0) {
    const sq = intelData.searchQueryPerf;
    context += `\n--- ORGANIC SEARCH QUERY PERFORMANCE (Brand View) ---
TOP QUERIES BY VOLUME:
${sq.slice(0, 15).map(q => `  "${q.query}" | Vol ${q.volume.toLocaleString()} | Brand Impr Share ${q.brandImprShare.toFixed(1)}% | Brand Click Share ${q.brandClickShare.toFixed(1)}% | Brand Purchase Share ${q.brandPurchaseShare.toFixed(1)}% | Purchases ${q.brandPurchases}`).join('\n')}

OPPORTUNITY QUERIES (low brand share but high volume):
${sq.filter(q => q.brandImprShare < 15 && q.volume > 1000).sort((a, b) => b.volume - a.volume).slice(0, 10).map(q => `  "${q.query}" | Vol ${q.volume.toLocaleString()} | Only ${q.brandImprShare.toFixed(1)}% impr share → OPPORTUNITY`).join('\n')}

HIGH CONVERSION QUERIES (brand purchase share > 30%):
${sq.filter(q => q.brandPurchaseShare > 30).sort((a, b) => b.brandPurchaseShare - a.brandPurchaseShare).slice(0, 10).map(q => `  "${q.query}" | Brand Purch Share ${q.brandPurchaseShare.toFixed(1)}% | ${q.brandPurchases} purchases`).join('\n')}
`;
  }

  // SKU Economics
  if (intelData.skuEconomics?.length > 0) {
    const sku = intelData.skuEconomics;
    context += `\n--- SKU ECONOMICS / PROFITABILITY ---
${sku.slice(0, 15).map(s => `  ${s.asin} (${s.msku || s.fnsku || '?'}) | Sales $${Math.round(s.sales)} | Units ${s.unitsSold} | Avg Price $${s.avgPrice.toFixed(2)} | Returns ${s.unitsReturned} (${s.unitsSold > 0 ? ((s.unitsReturned / s.unitsSold) * 100).toFixed(1) : 0}%) | Contrib Profit $${Math.round(s.contributionProfit)} | Margin ${(s.contributionMargin * 100).toFixed(1)}%`).join('\n')}
`;
  }

  // === API-sourced data (from Amazon Ads API auto-sync) ===
  // SKU-level ad performance from API
  if (intelData.skuAdPerformance?.length > 0) {
    const skus = intelData.skuAdPerformance;
    const totalSkuSpend = skus.reduce((s, k) => s + k.spend, 0);
    const totalSkuSales = skus.reduce((s, k) => s + k.sales, 0);
    context += `\n--- SKU-LEVEL AD PERFORMANCE (${skus.length} SKUs, API-sourced) ---
Total: Spend $${Math.round(totalSkuSpend)} | Ad Revenue $${Math.round(totalSkuSales)} | ROAS ${totalSkuSpend > 0 ? (totalSkuSales / totalSkuSpend).toFixed(2) : 'N/A'}
${skus.slice(0, 20).map(s => `  ${s.asin}${s.sku ? ` (${s.sku})` : ''} | Spend $${s.spend.toFixed(2)} | Sales $${s.sales.toFixed(2)} | ACOS ${s.acos.toFixed(1)}% | ROAS ${s.roas.toFixed(2)} | Orders ${s.orders} | CPC $${s.cpc.toFixed(2)} | Conv ${s.convRate.toFixed(1)}% | ${s.days}d active | ${s.campaigns.length} campaigns`).join('\n')}
`;
  }

  // Campaign summary from API
  if (intelData.campaignSummary?.length > 0) {
    const camps = intelData.campaignSummary;
    context += `\n--- CAMPAIGN SUMMARY (${camps.length} campaigns, API-sourced) ---
${camps.slice(0, 25).map(c => `  [${c.type}] ${c.name.substring(0, 55)} | ${c.status} | Spend $${Math.round(c.spend)} | Rev $${Math.round(c.revenue)} | ACOS ${c.acos.toFixed(1)}% | ROAS ${c.roas.toFixed(2)} | CPC $${c.cpc.toFixed(2)} | Conv ${c.convRate.toFixed(1)}% | Budget $${c.budget || '?'}/day | ${c.days}d`).join('\n')}
`;
  }

  // API-sourced raw report data (provides granular row-level detail the AI can reference)
  if (intelData._apiSpSearchTerms?.length > 0) {
    const terms = intelData._apiSpSearchTerms;
    // Group by search term and compute totals
    const byTerm = {};
    terms.forEach(r => {
      const t = r['Customer Search Term'] || '';
      if (!t) return;
      if (!byTerm[t]) byTerm[t] = { term: t, spend: 0, sales: 0, clicks: 0, orders: 0, impressions: 0, matchTypes: new Set() };
      byTerm[t].spend += r['Spend'] || 0;
      byTerm[t].sales += r['7 Day Total Sales'] || 0;
      byTerm[t].clicks += r['Clicks'] || 0;
      byTerm[t].orders += r['7 Day Total Orders (#)'] || 0;
      byTerm[t].impressions += r['Impressions'] || 0;
      if (r['Match Type']) byTerm[t].matchTypes.add(r['Match Type']);
    });
    const termArr = Object.values(byTerm).map(t => ({ ...t, roas: t.spend > 0 ? t.sales / t.spend : 0, acos: t.sales > 0 ? (t.spend / t.sales) * 100 : 999 }));
    const topROAS = termArr.filter(t => t.spend >= 3 && t.sales > 0).sort((a, b) => b.roas - a.roas).slice(0, 15);
    const wasteful = termArr.filter(t => t.spend >= 3 && t.sales === 0).sort((a, b) => b.spend - a.spend).slice(0, 15);
    context += `\n--- SP SEARCH TERMS (${Object.keys(byTerm).length} terms, API-sourced from ${terms.length} rows) ---
TOP CONVERTING: ${topROAS.map(t => `"${t.term}" ROAS ${t.roas.toFixed(1)} $${t.spend.toFixed(0)}→$${t.sales.toFixed(0)}`).join(' | ')}
WASTED SPEND: ${wasteful.map(t => `"${t.term}" $${t.spend.toFixed(2)} wasted (${t.clicks}cl)`).join(' | ')}
`;
  }

  if (intelData._apiSpTargeting?.length > 0) {
    const targets = intelData._apiSpTargeting;
    const byTarget = {};
    targets.forEach(r => {
      const t = r['Targeting'] || '';
      if (!t) return;
      if (!byTarget[t]) byTarget[t] = { target: t, spend: 0, sales: 0, clicks: 0, impressions: 0, tosShares: [] };
      byTarget[t].spend += r['Spend'] || 0;
      byTarget[t].sales += r['7 Day Total Sales'] || 0;
      byTarget[t].clicks += r['Clicks'] || 0;
      byTarget[t].impressions += r['Impressions'] || 0;
      const tos = r['Top-of-search Impression Share'];
      if (tos > 0) byTarget[t].tosShares.push(tos);
    });
    const tArr = Object.values(byTarget).map(t => ({ ...t, roas: t.spend > 0 ? t.sales / t.spend : 0, avgTos: t.tosShares.length > 0 ? t.tosShares.reduce((a, b) => a + b, 0) / t.tosShares.length : 0 }));
    const topT = tArr.filter(t => t.spend >= 3 && t.sales > 0).sort((a, b) => b.roas - a.roas).slice(0, 10);
    context += `\n--- SP TARGETING (${Object.keys(byTarget).length} targets, API-sourced) ---
TOP: ${topT.map(t => `"${t.target}" ROAS ${t.roas.toFixed(1)} TOS ${t.avgTos.toFixed(0)}%`).join(' | ')}
`;
  }

  if (intelData._apiSpPlacement?.length > 0) {
    const placements = intelData._apiSpPlacement;
    const byP = {};
    placements.forEach(r => {
      const p = r['Placement'] || 'Other';
      if (!byP[p]) byP[p] = { placement: p, spend: 0, sales: 0, clicks: 0, impressions: 0 };
      byP[p].spend += r['Spend'] || 0;
      byP[p].sales += r['7 Day Total Sales'] || 0;
      byP[p].clicks += r['Clicks'] || 0;
      byP[p].impressions += r['Impressions'] || 0;
    });
    context += `\n--- PLACEMENT PERFORMANCE (API-sourced) ---
${Object.values(byP).map(p => `  ${p.placement}: Spend $${Math.round(p.spend)} | Sales $${Math.round(p.sales)} | ROAS ${p.spend > 0 ? (p.sales / p.spend).toFixed(2) : 'N/A'} | CTR ${p.impressions > 0 ? ((p.clicks / p.impressions) * 100).toFixed(2) : 0}%`).join('\n')}
`;
  }

  if (intelData._apiSbSearchTerms?.length > 0) {
    context += `\n--- SB SEARCH TERMS (${intelData._apiSbSearchTerms.length} rows, API-sourced) ---\n`;
  }

  if (intelData._apiSdCampaign?.length > 0) {
    context += `\n--- SD CAMPAIGNS (${intelData._apiSdCampaign.length} rows, API-sourced) ---\n`;
  }

  if (intelData.apiSyncSummary) {
    const s = intelData.apiSyncSummary;
    context += `\n--- API SYNC SUMMARY ---
Date Range: ${s.dateRange?.start} to ${s.dateRange?.end} | ${s.daysWithData} days
Total: Spend $${Math.round(s.totalSpend || 0)} | Revenue $${Math.round(s.totalRevenue || 0)} | ACOS ${(s.acos || 0).toFixed(1)}% | ROAS ${(s.roas || 0).toFixed(2)}
Reports: ${s.campaignCount} campaigns | ${s.skuCount || 0} SKUs | ${JSON.stringify(s.reportCounts || {})}
`;
  }

  return context;
};

// ============ AUTO-DETECT REPORT TYPE ============

const detectReportType = (headers, rows, fileName) => {
  const hSet = new Set(headers.map(h => (h || '').toLowerCase().trim()));
  const fLower = fileName.toLowerCase();

  // Search Query Performance (Brand Analytics) — has metadata row, headers like "Search Query Volume"
  if (hSet.has('search query') || hSet.has('"search query"') || hSet.has('search query volume') || hSet.has('search query score')) return 'searchQueryPerf';

  // SKU Economics Report
  if (hSet.has('amazon store') && (hSet.has('msku') || hSet.has('fnsku')) && (hSet.has('average sales price') || hSet.has('units sold'))) return 'skuEconomics';

  // Business Report — Detail Page Sales and Traffic (has Sessions - Total, (Parent) ASIN)
  if (hSet.has('sessions - total') || (hSet.has('(parent) asin') && (hSet.has('sessions - mobile app') || hSet.has('units ordered') || hSet.has('ordered product sales')))) return 'businessReport';
  if (hSet.has('unit session percentage') || hSet.has('featured offer (buy box) percentage')) return 'businessReport';

  // SD Campaign (14 Day + DPV / New-to-brand)
  if (hSet.has('14 day detail page views (dpv)') || hSet.has('14 day new-to-brand orders (#)')) return 'sdCampaign';

  // SB Search Terms (14 Day attribution + Customer Search Term)
  if ((hSet.has('customer search term') || hSet.has('search term')) && (hSet.has('14 day total sales') || hSet.has('14 day total sales ') || hSet.has('14 day total orders (#)'))) return 'sbSearchTerms';

  // SP/SB Placement (has Placement column + sales data)
  if (hSet.has('placement') && hSet.has('bidding strategy')) return 'spPlacement';
  if (hSet.has('placement') && (hSet.has('14 day total sales') || hSet.has('14 day total sales ') || hSet.has('cost type') || hSet.has('7 day total sales ') || hSet.has('7 day total sales'))) return 'spPlacement';
  if (hSet.has('placement') && (hSet.has('spend') || hSet.has('impressions'))) return 'spPlacement';

  // SP Targeting (has Targeting + Match Type + Top-of-search IS)
  if (hSet.has('targeting') && (hSet.has('top-of-search impression share') || hSet.has('top-of-search is') || hSet.has('match type'))) return 'spTargeting';

  // SP Advertised Products
  if (hSet.has('advertised asin') || hSet.has('advertised sku')) return 'spAdvertised';

  // SP Search Terms (7 Day attribution)
  if (hSet.has('customer search term') && (hSet.has('7 day total sales') || hSet.has('7 day total sales ') || hSet.has('7 day total orders (#)'))) return 'spSearchTerms';

  // Daily Overview / Historical (has Date + Spend + ROAS columns — custom/manual overview data)
  if ((hSet.has('date') || hSet.has('Date')) && (hSet.has('spend') || hSet.has('Spend')) && (hSet.has('roas') || hSet.has('ROAS') || hSet.has('acos') || hSet.has('ACOS'))) {
    if (rows.length > 60 || fLower.includes('histor') || fLower.includes('year') || fLower.includes('552')) return 'historicalDaily';
    return 'dailyOverview';
  }

  // Fallback: search term report without clear attribution window
  if (hSet.has('customer search term') || hSet.has('search term')) return 'spSearchTerms';

  return null;
};

// ============ AI ACTION REPORT BUILDER ============

export const buildActionReportPrompt = (intelData) => {
  if (!intelData) return null;
  
  // Detect date range across all reports
  const allDates = [];
  if (intelData.dailyOverview?.days) intelData.dailyOverview.days.forEach(d => allDates.push(d.date));
  if (intelData.historicalDaily?.days) intelData.historicalDaily.days.forEach(d => allDates.push(d.date));
  allDates.sort();
  const dateRange = allDates.length > 0 ? `${allDates[0]} to ${allDates[allDates.length - 1]}` : 'Recent period';
  
  // Count available reports
  const available = [];
  if (intelData.spSearchTerms) available.push(`SP Search Terms (${intelData.spSearchTerms.totalTerms} terms, $${Math.round(intelData.spSearchTerms.totalSpend)} spend)`);
  if (intelData.spTargeting?.length) available.push(`SP Targeting (${intelData.spTargeting.length} targets)`);
  if (intelData.spPlacement) available.push(`SP Placements (${intelData.spPlacement.byPlacement?.length || 0} placements)`);
  if (intelData.spAdvertised?.length) available.push(`SP Advertised Products (${intelData.spAdvertised.length} ASINs)`);
  if (intelData.sbSearchTerms?.length) available.push(`SB Search Terms (${intelData.sbSearchTerms.length} terms)`);
  if (intelData.sdCampaign?.length) available.push(`SD Campaigns (${intelData.sdCampaign.length} campaigns)`);
  if (intelData.businessReport?.length) available.push(`Business Report (${intelData.businessReport.length} ASINs)`);
  if (intelData.searchQueryPerf?.length) available.push(`Search Query Perf (${intelData.searchQueryPerf.length} queries)`);
  if (intelData.skuEconomics?.length) available.push(`SKU Economics (${intelData.skuEconomics.length} SKUs)`);
  if (intelData.dailyOverview?.days?.length) available.push(`Daily Overview (${intelData.dailyOverview.days.length} days)`);
  
  // ===== COMPUTE ADVANCED METRICS FOR AI =====
  let advancedContext = '';
  
  // 1. Campaign structure analysis (extract from campaign naming conventions)
  if (intelData.spSearchTerms) {
    const d = intelData.spSearchTerms;
    const campaignTypes = {};
    const matchTypeSplit = { EXACT: { spend: 0, sales: 0 }, PHRASE: { spend: 0, sales: 0 }, BROAD: { spend: 0, sales: 0 } };
    
    // Analyze search term match type efficiency
    (d.topByROAS || []).concat(d.topBySales || []).concat(d.wasteful || []).forEach(t => {
      (t.matchTypes || []).forEach(mt => {
        const norm = mt.toUpperCase();
        if (matchTypeSplit[norm]) {
          matchTypeSplit[norm].spend += t.spend / (t.matchTypes.length || 1);
          matchTypeSplit[norm].sales += t.sales / (t.matchTypes.length || 1);
        }
      });
    });
    
    // Brand vs Non-Brand classification
    const brandTerms = ['tallowbourn', 'tallowbourne', 'tallow bourn'];
    let brandSpend = 0, brandSales = 0, nonBrandSpend = 0, nonBrandSales = 0;
    const allTerms = [...(d.topByROAS || []), ...(d.topBySales || []), ...(d.wasteful || [])];
    const seenTerms = new Set();
    allTerms.forEach(t => {
      if (seenTerms.has(t.term)) return;
      seenTerms.add(t.term);
      const isBrand = brandTerms.some(b => (t.term || '').toLowerCase().includes(b));
      if (isBrand) { brandSpend += t.spend; brandSales += t.sales; }
      else { nonBrandSpend += t.spend; nonBrandSales += t.sales; }
    });
    
    advancedContext += `\n=== ADVANCED ANALYSIS (COMPUTED) ===

MATCH TYPE EFFICIENCY:
  EXACT: Spend ~$${Math.round(matchTypeSplit.EXACT.spend)} | Sales ~$${Math.round(matchTypeSplit.EXACT.sales)} | ROAS ${matchTypeSplit.EXACT.spend > 0 ? (matchTypeSplit.EXACT.sales / matchTypeSplit.EXACT.spend).toFixed(2) : 'N/A'}
  PHRASE: Spend ~$${Math.round(matchTypeSplit.PHRASE.spend)} | Sales ~$${Math.round(matchTypeSplit.PHRASE.sales)} | ROAS ${matchTypeSplit.PHRASE.spend > 0 ? (matchTypeSplit.PHRASE.sales / matchTypeSplit.PHRASE.spend).toFixed(2) : 'N/A'}
  BROAD: Spend ~$${Math.round(matchTypeSplit.BROAD.spend)} | Sales ~$${Math.round(matchTypeSplit.BROAD.sales)} | ROAS ${matchTypeSplit.BROAD.spend > 0 ? (matchTypeSplit.BROAD.sales / matchTypeSplit.BROAD.spend).toFixed(2) : 'N/A'}

BRAND VS NON-BRAND SPLIT:
  Brand terms: Spend $${Math.round(brandSpend)} | Sales $${Math.round(brandSales)} | ROAS ${brandSpend > 0 ? (brandSales / brandSpend).toFixed(2) : 'N/A'}
  Non-brand terms: Spend $${Math.round(nonBrandSpend)} | Sales $${Math.round(nonBrandSales)} | ROAS ${nonBrandSpend > 0 ? (nonBrandSales / nonBrandSpend).toFixed(2) : 'N/A'}
  Brand % of total spend: ${d.totalSpend > 0 ? (brandSpend / d.totalSpend * 100).toFixed(1) : 0}%

WASTE ANALYSIS:
  Total wasted spend ($0 sales terms): $${Math.round((d.wasteful || []).reduce((s, t) => s + t.spend, 0))}
  Waste as % of total SP spend: ${d.totalSpend > 0 ? ((d.wasteful || []).reduce((s, t) => s + t.spend, 0) / d.totalSpend * 100).toFixed(1) : 0}%
  Unique zero-sale terms: ${(d.wasteful || []).length}
`;

    // Compute suggested bids for top terms
    // Formula: Target Bid = Target ACOS × (Avg Order Value) × Conversion Rate
    const topTermsWithBidSuggestions = (d.topByROAS || []).filter(t => t.spend > 5 && t.orders > 0).slice(0, 20).map(t => {
      const avgOrderValue = t.orders > 0 ? t.sales / t.orders : 0;
      const convRate = t.clicks > 0 ? t.orders / t.clicks : 0;
      const currentCPC = t.clicks > 0 ? t.spend / t.clicks : 0;
      const targetAcos30 = 0.30; // 30% ACOS target
      const targetAcos20 = 0.20; // 20% aggressive ACOS target  
      const suggestedBid30 = targetAcos30 * avgOrderValue * convRate;
      const suggestedBid20 = targetAcos20 * avgOrderValue * convRate;
      return { 
        term: t.term, currentCPC: currentCPC.toFixed(2), avgOrderValue: avgOrderValue.toFixed(2), 
        convRate: (convRate * 100).toFixed(1), currentACOS: t.acos.toFixed(1),
        suggestedBid30: suggestedBid30.toFixed(2), suggestedBid20: suggestedBid20.toFixed(2),
        bidDelta: ((suggestedBid30 - currentCPC) / currentCPC * 100).toFixed(0)
      };
    });
    
    if (topTermsWithBidSuggestions.length > 0) {
      advancedContext += `\nBID OPTIMIZATION DATA (Formula: Target Bid = Target ACOS × AOV × Conv Rate):
${topTermsWithBidSuggestions.map(t => `  "${t.term}" | CPC $${t.currentCPC} | AOV $${t.avgOrderValue} | Conv ${t.convRate}% | Current ACOS ${t.currentACOS}% | Suggested bid @30% ACOS: $${t.suggestedBid30} | @20% ACOS: $${t.suggestedBid20} | Change: ${t.bidDelta}%`).join('\n')}
`;
    }
  }

  // 2. Placement modifier calculations
  if (intelData.spPlacement) {
    const pl = intelData.spPlacement.byPlacement || [];
    const tosData = pl.find(p => p.placement === 'Top of Search on-Amazon');
    const restData = pl.find(p => p.placement === 'Rest of search on Amazon' || p.placement === 'Other on-Amazon');
    const productData = pl.find(p => p.placement === 'Product pages on Amazon' || p.placement === 'Detail page on-Amazon');
    
    if (tosData && (restData || productData)) {
      const baselineRoas = restData?.roas || productData?.roas || 1;
      const tosMultiplier = tosData.roas > 0 && baselineRoas > 0 ? (tosData.roas / baselineRoas) : 1;
      advancedContext += `\nPLACEMENT MODIFIER CALCULATION:
  Top of Search ROAS: ${tosData.roas.toFixed(2)} | Rest/Product ROAS: ${baselineRoas.toFixed(2)}
  TOS performance multiplier: ${tosMultiplier.toFixed(2)}x
  ${tosMultiplier > 1.3 ? `→ RECOMMENDED: Increase Top of Search bid modifier to +${Math.min(Math.round((tosMultiplier - 1) * 100), 900)}%` : tosMultiplier < 0.8 ? '→ RECOMMENDED: Decrease or remove Top of Search modifier — product pages converting better' : '→ TOS performing similarly to other placements — no modifier change needed'}
`;
    }
  }

  // 3. Search term isolation opportunities (broad/phrase converting terms not yet in exact)
  if (intelData.spSearchTerms && intelData.spTargeting?.length) {
    const targetedExact = new Set(
      intelData.spTargeting
        .filter(t => t.matchType?.toUpperCase() === 'EXACT')
        .map(t => t.target?.toLowerCase().trim())
    );
    
    const isolationCandidates = (intelData.spSearchTerms.topByROAS || [])
      .filter(t => {
        const termLower = (t.term || '').toLowerCase().trim();
        const isFromBroad = (t.matchTypes || []).some(m => ['BROAD', 'PHRASE'].includes(m.toUpperCase()));
        const notYetExact = !targetedExact.has(termLower);
        return isFromBroad && notYetExact && t.orders >= 2 && t.spend >= 3;
      })
      .slice(0, 15);
    
    if (isolationCandidates.length > 0) {
      advancedContext += `\nSEARCH TERM ISOLATION CANDIDATES (converting in broad/phrase, not yet exact targeted):
${isolationCandidates.map(t => `  "${t.term}" | ${t.orders} orders | ROAS ${t.roas.toFixed(1)} | ACOS ${t.acos.toFixed(1)}% | from ${t.matchTypes.join('/')} → ADD as EXACT, negate in source campaign`).join('\n')}
`;
    }
  }

  // Build the full data context
  const dataContext = buildAdsIntelContext(intelData);
  
  const systemPrompt = `You are a senior Amazon PPC consultant who has managed $50M+ in Amazon ad spend across 200+ brands. You specialize in tallow/skincare/beauty DTC brands scaling on Amazon. You think in frameworks:

FRAMEWORK 1: ACOS TARGETS BY FUNNEL STAGE
- Brand defense (branded keywords): Target ACOS 5-15% — these should be ultra-efficient since shoppers already know you
- High-intent non-brand (e.g., "tallow lip balm"): Target ACOS 25-35% — willing to pay more for new customers who know the category
- Category discovery (e.g., "natural lip balm"): Target ACOS 35-50% — top-of-funnel acquisition, acceptable higher cost
- Competitor conquesting (e.g., competitor brand names): Target ACOS 30-45% — worth paying to steal share
- Product targeting (ASIN targets): Target ACOS 25-40% — depends on relevance of target product

FRAMEWORK 2: BID OPTIMIZATION FORMULA
Target Bid = Target ACOS × Average Order Value × Conversion Rate
If current CPC is BELOW this, increase bid to capture more volume.
If current CPC is ABOVE this, decrease bid or pause.
Always specify the exact bid amount, not just "increase" or "decrease."

FRAMEWORK 3: SEARCH TERM MANAGEMENT WORKFLOW
1. HARVEST: Find converting search terms in auto/broad/phrase campaigns
2. ISOLATE: Add them as exact match keywords in a dedicated campaign 
3. NEGATE: Add as negative exact in the source campaign to prevent cannibalization
4. OPTIMIZE: Adjust bids on the new exact match based on performance
Always specify WHICH campaign to add the negative to and WHICH to add the keyword to.

FRAMEWORK 4: CAMPAIGN STRUCTURE EVALUATION
- Single-keyword ad groups (or small, tightly themed groups) perform better
- Separate campaigns by match type (exact, phrase, broad/auto) for bid control
- Separate campaigns by product category (lip balm, body balm, deodorant)
- Campaign naming should encode: Ad Type | Product | ASIN | Match Type | Strategy

FRAMEWORK 5: PLACEMENT STRATEGY
- Calculate placement modifier: (TOS ROAS / Rest ROAS - 1) × 100 = recommended TOS modifier %
- If TOS converts 2x better than rest, set modifier to +100%
- Cap at +900%, and only apply to campaigns where TOS has statistical significance (>50 clicks)

FRAMEWORK 6: NEGATIVE KEYWORD RULES
- Add as NEGATIVE EXACT if: the exact term is irrelevant or has >$10 spend with 0 orders
- Add as NEGATIVE PHRASE if: the root phrase is irrelevant (e.g., "pet" for a skincare brand)  
- NEVER negate your own brand terms
- NEVER negate terms with <$5 spend (insufficient data)
- Flag terms with 10+ clicks and 0 orders as candidates even if spend is low

FORMAT YOUR REPORT IN MARKDOWN. Be AGGRESSIVE and SPECIFIC. Every recommendation must include:
1. The EXACT keyword, campaign name, ASIN, or target
2. Current performance metrics from the data
3. The SPECIFIC action to take (exact bid amount, exact negative to add, etc.)
4. Estimated dollar impact where possible

You are not an advisor — you are the operator. Write as if you are the person who will log into Seller Central and make these changes TODAY. Use direct, confident language: "Set bid to $1.45" not "Consider adjusting the bid."`;

  // Detect which data types are available for conditional sections
  const hasSP = !!(intelData.spSearchTerms || intelData.spTargeting?.length || intelData.spPlacement || intelData.spAdvertised?.length);
  const hasSB = !!(intelData.sbSearchTerms?.length);
  const hasSD = !!(intelData.sdCampaign?.length);
  const hasSQP = !!(intelData.searchQueryPerf?.length);
  const hasBR = !!(intelData.businessReport?.length);
  const hasSKU = !!(intelData.skuEconomics?.length);
  const hasPlacement = !!(intelData.spPlacement);
  const hasTargeting = !!(intelData.spTargeting?.length);

  let sections = `
## 📊 EXECUTIVE SUMMARY & ACCOUNT HEALTH
- Account health grade (A-F) with justification
- Total spend, revenue, ROAS, ACOS, TACOS across SP/SB/SD
- Blended ACOS vs target (25%). How far off and trending which direction?
- Top 3 biggest problems costing money right now
- Top 3 biggest opportunities to capture more revenue
`;

  if (hasSP) {
    sections += `
## 🔴 KILL LIST — Negative Keywords to Add Immediately
| Keyword | Campaign to Negate In | Match Type | Spend Wasted | Clicks | Why Negate |
Minimum 10 keywords. Prioritize by spend wasted. Estimate total savings.

## 🟢 SCALE LIST — Increase Bids & Budgets
| Keyword | Current Bid/CPC | Current ROAS | Suggested Bid @25% ACOS | Action |
Minimum 8 keywords. Flag budget-capped campaigns.
`;
  }

  if (hasSP && hasTargeting) {
    sections += `
## 🔵 SEARCH TERM ISOLATION — Harvest → Exact → Negate Workflow
| Search Term | Source Campaign | Orders | ACOS | Action: Add Exact to [Campaign] + Negate in [Source] |
Minimum 5 isolation actions.
`;
  }

  if (hasPlacement) {
    sections += `
## 📍 PLACEMENT OPTIMIZATION
| Campaign | TOS ROAS | Rest ROAS | Current TOS Modifier | Recommended TOS Modifier |
Calculate exact modifier percentage.
`;
  }

  if (intelData.spAdvertised?.length) {
    sections += `
## 💰 PRODUCT-LEVEL AD PROFITABILITY
| ASIN/SKU | Ad Spend | Ad Revenue | ACOS | Conv Rate | Verdict |
Flag ACOS exceeding 60% margin. Recommend: increase/maintain/reduce/pause.
`;
  }

  if (hasSB || hasSD) {
    sections += `
## 📢 SPONSORED BRANDS & DISPLAY ASSESSMENT
${hasSB ? '- SB: which campaigns justify spend? SB video performance?' : ''}
${hasSD ? '- SD: remarketing ROI? Audience efficiency? New-to-brand cost?' : ''}
- Specific pause/restructure recommendations with campaign names
`;
  }

  if (hasSQP) {
    sections += `
## 🔍 SEARCH QUERY MARKET SHARE
- Top 10 queries by volume where brand share <20% → size opportunity
- Queries with high purchase share → defend with increased ad spend
- Category vs brand queries performance gap
`;
  }

  sections += `
## 🏗️ CAMPAIGN STRUCTURE RECOMMENDATIONS
- Campaigns to split or consolidate. Match type segregation. Product grouping. Budget allocation.

## 📈 BUDGET REALLOCATION
| From | To | Amount | Why | Expected Impact |
Total budget stays same — move from low to high performing.

## ⚡ TOP 5 ACTIONS — DO THIS WEEK
For each: exact action, current metrics, expected improvement, time to implement, monthly impact.

## 🎯 CAMPAIGN-BY-CAMPAIGN AUDIT (TOP 10 BY SPEND)
| Campaign | Status | Spend | Sales | ROAS | ACOS | Conv Rate | Verdict |
For EACH: 2-3 specific changes, exact bid amounts, keywords to negate/harvest, budget verdict.

## 📋 IMPLEMENTATION CHECKLIST
1. QUICK WINS (<5 min) — negatives, bid adjustments
2. MEDIUM (5-15 min) — restructuring, new ad groups
3. STRATEGIC (15+ min) — new campaigns, major budget shifts`;

  const userPrompt = `Generate a comprehensive Amazon PPC Action Report for Tallowbourn (tallow-based skincare: lip balms, body balms, deodorant).

DATE RANGE: ${dateRange}
REPORTS AVAILABLE: ${available.join(', ')}
${available.length < 5 ? `\nNOTE: Only ${available.length} report types uploaded. Analyze what's available and note which missing reports would enable deeper analysis.` : ''}

PRODUCT CONTEXT:
- Lip Balm 3-Pack (Parent ASIN B0CLHTF8YN) — highest volume SKU
- Body Balm 2oz (B0CLF4XDCP) — premium product, higher AOV
- Deodorant (B0CLHSC2WC) — newer product, still building traction
- Typical price points: Lip balm $10-14, Body balm $18-24, Deodorant $12-16
- Target blended ACOS: 25% (willing to go higher for new customer acquisition)
- Target TACOS: under 12%

${dataContext}

${advancedContext}

=== GENERATE ALL SECTIONS — SKIP NONE ===
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
  // Lists
  html = html.replace(/^- (.+$)/gm, '&lt;li&gt;$1&lt;/li&gt;');
  html = html.replace(/^(\d+)\. (.+$)/gm, '&lt;li&gt;$2&lt;/li&gt;');
  html = html.replace(/(&lt;li&gt;.*&lt;\/li&gt;\n?)+/g, '&lt;ul&gt;$&&lt;/ul&gt;');
  // Tables
  html = html.replace(/\|(.+)\|/g, function(match) {
    var cells = match.split('|').filter(function(c) { return c.trim(); });
    var isSep = cells.every(function(c) { return c.trim().replace(/[-:]/g, '').trim() === ''; });
    if (isSep) return '';
    return '&lt;tr&gt;' + cells.map(function(c) { return '&lt;td&gt;' + c.trim() + '&lt;/td&gt;'; }).join('') + '&lt;/tr&gt;';
  });
  html = html.replace(/(&lt;tr&gt;.*&lt;\/tr&gt;\n?)+/g, '&lt;table&gt;$&&lt;/table&gt;');
  // Collapse 3+ blank lines into 1
  html = html.replace(/\n{3,}/g, '\n\n');
  // Paragraphs and line breaks
  html = html.replace(/\n\n/g, '&lt;/p&gt;&lt;p&gt;');
  html = html.replace(/\n/g, '&lt;br/&gt;');
  // Clean up empty paragraphs
  html = html.replace(/&lt;p&gt;\s*&lt;\/p&gt;/g, '');
  html = html.replace(/&lt;p&gt;\s*&lt;br\/&gt;\s*&lt;\/p&gt;/g, '');
  // Now unescape our HTML tags
  var unescapeRe = new RegExp('&lt;(\\/?(?:h[23]|strong|em|li|ul|ol|table|tr|td|th|p|br\\/?|code))&gt;', 'g');
  html = html.replace(unescapeRe, function(_, tag) { return '<' + tag + '>'; });
  return html;
};

// ============ COMPONENT ============

const AmazonAdsIntelModal = ({
  show,
  setShow,
  adsIntelData,
  setAdsIntelData,
  combinedData,
  queueCloudSave,
  allDaysData,
  setAllDaysData,
  amazonCampaigns,
  setAmazonCampaigns,
  setToast,
  onGoToAnalyst,
  callAI,
  saveReportToHistory,
}) => {
  const [detectedFiles, setDetectedFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [actionReport, setActionReport] = useState(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState(null);
  const [selectedModel, setSelectedModel] = useState(window.__aiModelOverride || AI_DEFAULT_MODEL);

  // Move all logic into the render check
  if (!show) return null;

  const readAndDetect = async (fileList) => {
    const newDetected = [];
    for (const file of fileList) {
      try {
        let rows, headers;
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          rows = await parseXlsx(file);
          headers = rows.length > 0 ? Object.keys(rows[0]) : [];
        } else {
          const text = await file.text();
          rows = parseCSV(text);
          headers = rows.length > 0 ? Object.keys(rows[0]) : [];
        }
        const type = detectReportType(headers, rows, file.name);
        newDetected.push({ file, type, rows: rows.length, headers: headers.slice(0, 6) });
      } catch (err) {
        newDetected.push({ file, type: null, rows: 0, error: err.message });
      }
    }
    setDetectedFiles(prev => {
      // Replace files of same detected type, keep others
      const existing = [...prev];
      newDetected.forEach(nd => {
        if (nd.type) {
          const idx = existing.findIndex(e => e.type === nd.type);
          if (idx >= 0) existing[idx] = nd;
          else existing.push(nd);
        } else {
          existing.push(nd);
        }
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
      // Skip macOS metadata files
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
        try {
          const extracted = await extractZip(f);
          fileList.push(...extracted);
        } catch (err) {
          console.error('ZIP extraction error:', err);
          setDetectedFiles(prev => [...prev, { file: f, type: null, rows: 0, error: 'Failed to extract ZIP: ' + err.message }]);
        }
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
        try {
          const extracted = await extractZip(f);
          fileList.push(...extracted);
        } catch (err) {
          console.error('ZIP extraction error:', err);
          setDetectedFiles(prev => [...prev, { file: f, type: null, rows: 0, error: 'Failed to extract ZIP: ' + err.message }]);
        }
      } else {
        fileList.push(f);
      }
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
    const newIntel = { ...adsIntelData, lastUpdated: new Date().toISOString() };
    const processResults = [];

    try {
      for (const det of detectedFiles) {
        if (!det.type || det.error) {
          processResults.push({ key: det.type || 'unknown', fileName: det.file.name, status: 'skipped', error: det.error || 'Unrecognized format' });
          continue;
        }
        try {
          let rows;
          if (det.file.name.endsWith('.xlsx') || det.file.name.endsWith('.xls')) {
            rows = await parseXlsx(det.file);
          } else {
            const text = await det.file.text();
            rows = parseCSV(text);
          }

          let summary;
          switch (det.type) {
            case 'dailyOverview': summary = aggregateDailyOverview(rows); break;
            case 'historicalDaily': summary = aggregateDailyOverview(rows); break;
            case 'spSearchTerms': summary = aggregateSPSearchTerms(rows); break;
            case 'spAdvertised': summary = aggregateSPAdvertised(rows); break;
            case 'spPlacement': summary = aggregateSPPlacement(rows); break;
            case 'spTargeting': summary = aggregateSPTargeting(rows); break;
            case 'sbSearchTerms': summary = aggregateSBSearchTerms(rows); break;
            case 'sdCampaign': summary = aggregateSDCampaign(rows); break;
            case 'businessReport': summary = aggregateBusinessReport(rows); break;
            case 'searchQueryPerf': summary = aggregateSearchQueryPerf(rows); break;
            case 'skuEconomics': summary = aggregateSkuEconomics(rows); break;
          }

          newIntel[det.type] = summary;
          processResults.push({ key: det.type, fileName: det.file.name, status: 'success', rows: rows.length });
        } catch (err) {
          console.error(`Error processing ${det.file.name}:`, err);
          processResults.push({ key: det.type, fileName: det.file.name, status: 'error', error: err.message });
        }
      }

      setAdsIntelData(newIntel);
      
      // If daily overview or historical files were processed, also write to allDaysData
      let trackingUpdated = false;
      let currentDays = allDaysData || {};
      let currentCampaigns = amazonCampaigns || {};
      
      for (const det of detectedFiles) {
        if (!det.type || (det.type !== 'dailyOverview' && det.type !== 'historicalDaily')) continue;
        try {
          let rows;
          if (det.file.name.endsWith('.xlsx') || det.file.name.endsWith('.xls')) {
            rows = await parseXlsx(det.file);
          } else {
            const text = await det.file.text();
            rows = parseCSV(text);
          }
          if (rows.length > 0 && setAllDaysData) {
            const { updatedDays, updatedCampaigns } = writeDailyToTracking(rows, currentDays, currentCampaigns);
            currentDays = updatedDays;
            currentCampaigns = updatedCampaigns;
            trackingUpdated = true;
          }
        } catch (e) { console.error('Error writing daily tracking:', e); }
      }
      
      if (trackingUpdated && setAllDaysData) {
        setAllDaysData(currentDays);
        // Update lastUpdated on amazonCampaigns to clear the staleness alert
        if (setAmazonCampaigns) {
          const newCampaigns = {
            ...currentCampaigns,
            lastUpdated: new Date().toISOString(),
            // Also store the date range of data we have
            historicalDaily: newIntel.historicalDaily || currentCampaigns.historicalDaily,
            historicalLastUpdated: newIntel.historicalDaily ? new Date().toISOString() : currentCampaigns.historicalLastUpdated,
          };
          setAmazonCampaigns(newCampaigns);
          try { localStorage.setItem('ecommerce_amazon_campaigns_v1', JSON.stringify(newCampaigns)); } catch(e) {}
        }
        try { localStorage.setItem('ecommerce_daily_sales_v1', JSON.stringify(currentDays)); } catch(e) {}
      }
      
      if (queueCloudSave) queueCloudSave();
      setResults(processResults);
      if (setToast && processResults.length > 0) {
        const successCount = processResults.filter(r => r.status === 'success').length;
        setToast({ message: `Processed ${successCount} report${successCount !== 1 ? 's' : ''} successfully${trackingUpdated ? ' • Daily tracking updated' : ''}`, type: 'success' });
      }
    } catch (err) {
      console.error('Processing error:', err);
    } finally {
      setProcessing(false);
    }
  };

  const generateActionReport = async () => {
    if (!callAI || !adsIntelData?.lastUpdated) return;
    setGeneratingReport(true);
    setReportError(null);
    setActionReport(null);
    
    try {
      const prompts = buildActionReportPrompt(adsIntelData);
      if (!prompts) throw new Error('No data available for report');
      
      const response = await callAI(prompts.userPrompt, prompts.systemPrompt, selectedModel);
      setActionReport(response);
      // Save to report history
      if (saveReportToHistory) {
        const t = adsIntelData?.total || {};
        saveReportToHistory({
          type: 'amazon',
          content: response,
          model: selectedModel,
          metrics: {
            revenue: t.totalSales || 0,
            adSpend: t.totalSpend || 0,
            roas: t.totalSales && t.totalSpend ? (t.totalSales / t.totalSpend) : 0,
            acos: t.totalSpend && t.totalSales ? (t.totalSpend / t.totalSales * 100) : 0,
            actionCount: (response.match(/^\d+[\.\)]/gm) || []).length,
          },
        });
      }
    } catch (err) {
      console.error('Report generation error:', err);
      setReportError(err.message || 'Failed to generate report');
    } finally {
      setGeneratingReport(false);
    }
  };

  const downloadReport = () => {
    if (!actionReport) return;
    const date = new Date().toISOString().split('T')[0];
    const blob = new Blob([`# Amazon PPC Action Report — ${date}\n\n${actionReport}`], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PPC-Action-Report-${date}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const validFiles = detectedFiles.filter(d => d.type && !d.error);
  const unknownFiles = detectedFiles.filter(d => !d.type || d.error);
  const hasExistingData = adsIntelData?.lastUpdated;
  const typeLabels = Object.fromEntries(REPORT_TYPES.map(r => [r.key, r.label]));
  const typeColors = Object.fromEntries(REPORT_TYPES.map(r => [r.key, r.color]));
  const showReportView = actionReport || generatingReport || reportError;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`bg-slate-900 rounded-2xl border border-slate-700 w-full ${showReportView ? 'max-w-5xl' : 'max-w-2xl'} max-h-[90vh] overflow-hidden flex flex-col transition-all`}>
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 p-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Upload className="w-6 h-6" />Amazon PPC Data Import
            </h2>
            <p className="text-white/70 text-sm">Drop your reports — we'll auto-detect the format</p>
          </div>
          <button onClick={() => { setShow(false); setDetectedFiles([]); setResults(null); }} className="p-2 hover:bg-white/20 rounded-lg text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {/* Existing data status */}
          {hasExistingData && (
            <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-lg p-3 text-sm">
              <p className="text-emerald-400 font-medium">✓ Intel loaded · {new Date(adsIntelData.lastUpdated).toLocaleDateString()}{adsIntelData.source === 'amazon-ads-api' ? ' (API)' : ''}</p>
              <p className="text-slate-400 text-xs mt-1">
                {[
                  adsIntelData.dailyOverview && `${adsIntelData.dailyOverview.totalDays}d overview`,
                  adsIntelData.historicalDaily && `${adsIntelData.historicalDaily.totalDays}d historical`,
                  adsIntelData.spSearchTerms && `${adsIntelData.spSearchTerms.totalTerms} SP terms`,
                  adsIntelData.spAdvertised?.length && `${adsIntelData.spAdvertised.length} ASINs`,
                  adsIntelData.spPlacement && `placements`,
                  adsIntelData.spTargeting?.length && `${adsIntelData.spTargeting.length} targets`,
                  adsIntelData.sbSearchTerms?.length && `${adsIntelData.sbSearchTerms.length} SB terms`,
                  adsIntelData.sdCampaign?.length && `${adsIntelData.sdCampaign.length} SD campaigns`,
                  adsIntelData.businessReport?.length && `${adsIntelData.businessReport.length} biz report ASINs`,
                  adsIntelData.searchQueryPerf?.length && `${adsIntelData.searchQueryPerf.length} queries`,
                  adsIntelData.skuEconomics?.length && `${adsIntelData.skuEconomics.length} SKU econ`,
                  // API-sourced data
                  adsIntelData.skuAdPerformance?.length && `${adsIntelData.skuAdPerformance.length} SKU ad perf (API)`,
                  adsIntelData.campaignSummary?.length && `${adsIntelData.campaignSummary.length} campaigns (API)`,
                  adsIntelData._apiSpSearchTerms?.length && `${adsIntelData._apiSpSearchTerms.length} SP term rows (API)`,
                  adsIntelData._apiSpTargeting?.length && `${adsIntelData._apiSpTargeting.length} targeting rows (API)`,
                  adsIntelData._apiSpPlacement?.length && `placements (API)`,
                ].filter(Boolean).join(' · ')}
              </p>
              {/* Generate report from existing data */}
              {callAI && !actionReport && !generatingReport && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-400 whitespace-nowrap">AI Model:</label>
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                    >
                      {AI_MODEL_OPTIONS.map(m => (
                        <option key={m.value} value={m.value}>{m.label} — {m.cost}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={generateActionReport}
                    className="w-full px-4 py-2.5 bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 rounded-lg text-white font-medium flex items-center justify-center gap-2 text-sm shadow-lg shadow-rose-500/20"
                  >
                    <FileText className="w-4 h-4" />
                    Generate Action Report
                  </button>
                </div>
              )}
            </div>
          )}
          
          {/* Report generation/display ABOVE the drop zone when triggered from existing data */}
          {generatingReport && !results && (
            <div className="bg-gradient-to-br from-rose-900/30 to-orange-900/30 border border-rose-500/30 rounded-xl p-6 text-center">
              <div className="w-8 h-8 border-3 border-rose-400/30 border-t-rose-400 rounded-full animate-spin mx-auto mb-3" style={{borderWidth: '3px'}} />
              <p className="text-white font-medium">Generating Action Report...</p>
              <p className="text-slate-400 text-sm mt-1">Analyzing {Object.keys(adsIntelData || {}).filter(k => k !== 'lastUpdated' && adsIntelData[k]).length} data sources with expert PPC frameworks</p>
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
                  <FileText className="w-5 h-5 text-rose-400" />
                  PPC Action Report
                </h3>
                <div className="flex gap-2">
                  <button onClick={downloadReport} className="px-3 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 rounded-lg text-emerald-300 text-sm flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5" />Download .md
                  </button>
                  <button onClick={generateActionReport} className="px-3 py-1.5 bg-slate-600/50 hover:bg-slate-600 rounded-lg text-slate-300 text-sm">Regenerate</button>
                  <button onClick={() => setActionReport(null)} className="px-3 py-1.5 bg-slate-600/50 hover:bg-slate-600 rounded-lg text-slate-300 text-sm">Close Report</button>
                </div>
              </div>
              <div className="bg-slate-950 border border-slate-700 rounded-xl p-5 max-h-[60vh] overflow-y-auto prose prose-invert prose-sm max-w-none
                [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-white [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:pb-2 [&_h2]:border-b [&_h2]:border-slate-700
                [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-200 [&_h3]:mt-4 [&_h3]:mb-2
                [&_strong]:text-white [&_em]:text-amber-300
                [&_ul]:space-y-1 [&_ol]:space-y-1
                [&_li]:text-slate-300 [&_li]:leading-relaxed
                [&_p]:text-slate-300 [&_p]:leading-relaxed
                [&_table]:w-full [&_th]:text-left [&_th]:text-slate-300 [&_th]:pb-2 [&_th]:pr-3 [&_td]:py-1 [&_td]:pr-3 [&_td]:text-slate-400
                [&_code]:bg-slate-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-emerald-400 [&_code]:text-xs
                [&_blockquote]:border-l-2 [&_blockquote]:border-amber-500 [&_blockquote]:pl-4 [&_blockquote]:text-amber-200
              ">
                <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderMarkdown(actionReport)) }} />
              </div>
            </div>
          )}

          {/* DROP ZONE */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${dragOver ? 'border-violet-400 bg-violet-500/10' : 'border-slate-600 hover:border-slate-500 bg-slate-800/30'}`}
          >
            <input
              type="file"
              multiple
              accept=".csv,.xlsx,.xls,.zip"
              onChange={handleFileInput}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <Upload className={`w-10 h-10 mx-auto mb-3 ${dragOver ? 'text-violet-400' : 'text-slate-500'}`} />
            <p className="text-white font-medium mb-1">
              {detectedFiles.length > 0 ? 'Drop more files or click to add' : 'Drop files here or click to browse'}
            </p>
            <p className="text-slate-500 text-xs">
              CSV & XLSX — search terms, placements, targeting, business reports, daily overviews, and more
            </p>
            <p className="text-slate-500 text-xs mt-1">
              <Archive className="w-3 h-3 inline mr-1" />ZIP archives supported — we'll extract and detect all files inside
            </p>
          </div>

          {/* Detected files list */}
          {detectedFiles.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{detectedFiles.length} file{detectedFiles.length !== 1 ? 's' : ''} detected</p>
              {validFiles.map((det, i) => {
                const origIdx = detectedFiles.indexOf(det);
                return (
                  <div key={origIdx} className="flex items-center gap-3 bg-emerald-900/20 border border-emerald-500/30 rounded-lg p-2.5">
                    <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">{det.file.name}</p>
                      <p className="text-emerald-400 text-xs">{typeLabels[det.type] || det.type} · {det.rows.toLocaleString()} rows</p>
                    </div>
                    <button onClick={() => removeFile(origIdx)} className="p-1 hover:bg-slate-700 rounded text-slate-500 hover:text-white">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
              {unknownFiles.map((det, i) => {
                const origIdx = detectedFiles.indexOf(det);
                return (
                  <div key={origIdx} className="flex items-center gap-3 bg-amber-900/20 border border-amber-500/30 rounded-lg p-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">{det.file.name}</p>
                      <p className="text-amber-400 text-xs">{det.error || 'Could not identify report type'} — will be skipped</p>
                    </div>
                    <button onClick={() => removeFile(origIdx)} className="p-1 hover:bg-slate-700 rounded text-slate-500 hover:text-white">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Results */}
          {results && (
            <div className="space-y-3">
              <div className="bg-slate-800/50 rounded-lg p-3 space-y-1">
                <p className="text-slate-300 text-xs font-medium mb-2">Processing Results</p>
                {results.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 text-sm ${r.status === 'success' ? 'text-emerald-400' : r.status === 'skipped' ? 'text-amber-400' : 'text-red-400'}`}>
                    {r.status === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    <span className="truncate">{r.fileName || typeLabels[r.key] || r.key}: {r.status === 'success' ? `${r.rows} rows → ${typeLabels[r.key]}` : r.error}</span>
                  </div>
                ))}
              </div>
              
              {/* Success message and options */}
              {results.some(r => r.status === 'success') && (
                <div className="space-y-3">
                  <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-lg p-3">
                    <p className="text-emerald-400 font-medium flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Data saved successfully!
                    </p>
                    <p className="text-slate-400 text-xs mt-1">Your ads data has been imported and is now available in your dashboard.</p>
                  </div>
                  
                  <div className="space-y-2">
                    {/* Model selector */}
                    {callAI && !actionReport && !generatingReport && (
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-400 whitespace-nowrap">AI Model:</label>
                        <select
                          value={selectedModel}
                          onChange={(e) => setSelectedModel(e.target.value)}
                          className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                        >
                          {AI_MODEL_OPTIONS.map(m => (
                            <option key={m.value} value={m.value}>{m.label} — {m.cost}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="flex gap-2">
                    {/* Generate Action Report */}
                    {callAI && !actionReport && !generatingReport && (
                      <button
                        onClick={generateActionReport}
                        className="flex-1 px-4 py-3 bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 rounded-xl text-white font-medium flex items-center justify-center gap-2 shadow-lg shadow-rose-500/20"
                      >
                        <FileText className="w-4 h-4" />
                        Generate Action Report
                      </button>
                    )}
                    
                    {/* Secondary: AI Chat (optional) */}
                    {onGoToAnalyst && !actionReport && !generatingReport && (
                      <button
                        onClick={() => {
                          setShow(false);
                          setDetectedFiles([]);
                          setResults(null);
                          onGoToAnalyst();
                        }}
                        className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-600/80 to-amber-600/80 hover:from-orange-500 hover:to-amber-500 rounded-xl text-white font-medium flex items-center justify-center gap-2"
                      >
                        <Zap className="w-4 h-4" />
                        AI Chat
                      </button>
                    )}

                    {/* Done button */}
                    {!generatingReport && (
                      <button
                        onClick={() => {
                          setShow(false);
                          setDetectedFiles([]);
                          setResults(null);
                          setActionReport(null);
                          setReportError(null);
                        }}
                        className={`${actionReport ? 'flex-shrink-0' : 'flex-1'} px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-white font-medium flex items-center justify-center gap-2`}
                      >
                        <CheckCircle className="w-4 h-4" />
                        Done
                      </button>
                    )}
                  </div>
                  </div>
                  
                  {/* Report Generation State */}
                  {generatingReport && (
                    <div className="bg-gradient-to-br from-rose-900/30 to-orange-900/30 border border-rose-500/30 rounded-xl p-6 text-center">
                      <div className="w-8 h-8 border-3 border-rose-400/30 border-t-rose-400 rounded-full animate-spin mx-auto mb-3" />
                      <p className="text-white font-medium">Generating Action Report...</p>
                      <p className="text-slate-400 text-sm mt-1">Analyzing {Object.keys(adsIntelData || {}).filter(k => k !== 'lastUpdated' && adsIntelData[k]).length} data sources</p>
                      <p className="text-slate-500 text-xs mt-2">This may take 30-60 seconds</p>
                    </div>
                  )}
                  
                  {/* Report Error */}
                  {reportError && (
                    <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4">
                      <p className="text-red-400 font-medium">Report generation failed</p>
                      <p className="text-red-400/70 text-sm mt-1">{reportError}</p>
                      <button onClick={generateActionReport} className="mt-2 px-4 py-2 bg-red-600/30 hover:bg-red-600/50 rounded-lg text-red-300 text-sm">
                        Retry
                      </button>
                    </div>
                  )}
                  
                  {/* Action Report Display */}
                  {actionReport && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-white font-bold flex items-center gap-2">
                          <FileText className="w-5 h-5 text-rose-400" />
                          PPC Action Report
                        </h3>
                        <div className="flex gap-2">
                          <button
                            onClick={downloadReport}
                            className="px-3 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 rounded-lg text-emerald-300 text-sm flex items-center gap-1.5"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download .md
                          </button>
                          <button
                            onClick={generateActionReport}
                            className="px-3 py-1.5 bg-slate-600/50 hover:bg-slate-600 rounded-lg text-slate-300 text-sm flex items-center gap-1.5"
                          >
                            Regenerate
                          </button>
                        </div>
                      </div>
                      <div className="bg-slate-950 border border-slate-700 rounded-xl p-5 max-h-[50vh] overflow-y-auto prose prose-invert prose-sm max-w-none">
                        <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderMarkdown(actionReport)) }} />
                      </div>
                    </div>
                  )}
                  </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 flex justify-between items-center">
          <div>
            {validFiles.length > 0 && (
              <p className="text-slate-400 text-sm">{validFiles.length} report{validFiles.length !== 1 ? 's' : ''} ready</p>
            )}
            {detectedFiles.length > 0 && (
              <button onClick={() => { setDetectedFiles([]); setResults(null); }} className="text-slate-500 text-xs hover:text-slate-300">Clear all</button>
            )}
          </div>
          <button
            onClick={processAll}
            disabled={validFiles.length === 0 || processing}
            className="px-6 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-lg font-medium disabled:opacity-40 hover:opacity-90 flex items-center gap-2"
          >
            {processing ? (
              <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Importing...</>
            ) : (
              <><Upload className="w-4 h-4" /> Import {validFiles.length} Report{validFiles.length !== 1 ? 's' : ''}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AmazonAdsIntelModal;
