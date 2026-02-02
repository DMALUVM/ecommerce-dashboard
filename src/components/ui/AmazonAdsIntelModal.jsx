import React, { useState, useCallback } from 'react';
import { Brain, X, Upload, FileSpreadsheet, CheckCircle, AlertTriangle, TrendingUp, Target, Search, BarChart3, Eye, ShoppingCart, Zap } from 'lucide-react';
import { loadXLSX } from '../../utils/xlsx';

const REPORT_TYPES = [
  { key: 'dailyOverview', label: 'Daily Ads Overview', icon: TrendingUp, color: 'yellow', accept: '.csv', desc: 'Seller Central daily ads overview (recent 30d)' },
  { key: 'historicalDaily', label: 'Historical Daily Data', icon: BarChart3, color: 'indigo', accept: '.csv', desc: 'Historical daily ads data (months/years)' },
  { key: 'spSearchTerms', label: 'SP Search Terms', icon: Search, color: 'blue', accept: '.xlsx,.csv', desc: 'Sponsored Products Search Term Report' },
  { key: 'spAdvertised', label: 'SP Advertised Products', icon: ShoppingCart, color: 'green', desc: 'Sponsored Products Advertised Product Report' },
  { key: 'spPlacement', label: 'SP Placements', icon: BarChart3, color: 'purple', desc: 'Sponsored Products Placement Report' },
  { key: 'spTargeting', label: 'SP Targeting', icon: Target, color: 'orange', desc: 'Sponsored Products Targeting Report' },
  { key: 'sbSearchTerms', label: 'SB Search Terms', icon: Search, color: 'cyan', desc: 'Sponsored Brands Search Term Report' },
  { key: 'sdCampaign', label: 'SD Campaigns', icon: Eye, color: 'pink', desc: 'Sponsored Display Campaign Report' },
  { key: 'businessReport', label: 'Business Report', icon: TrendingUp, color: 'emerald', accept: '.csv', desc: 'Amazon Business Report (by ASIN or child ASIN)' },
  { key: 'searchQueryPerf', label: 'Search Query Perf', icon: Search, color: 'amber', accept: '.csv', desc: 'Search Query Performance (Brand View)' },
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
  return XLSX.utils.sheet_to_json(ws, { defval: null });
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

// Normalize date formats: "2026-01-01", "01/01/2024" (DD/MM/YYYY), etc
const normalizeDate = (d) => {
  if (!d) return null;
  const s = String(d).replace(/"/g, '').trim();
  // YYYY-MM-DD
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
    byPlacement[placement].sales += num(r['7 Day Total Sales '] || r['7 Day Total Sales']);
    byPlacement[placement].impressions += num(r['Impressions']);
    byPlacement[placement].clicks += num(r['Clicks']);
    byPlacement[placement].orders += num(r['7 Day Total Orders (#)']);
  });

  // Also aggregate by campaign + placement for detailed view
  const byCampaignPlacement = {};
  rows.forEach(r => {
    const camp = r['Campaign Name'] || '';
    const placement = r['Placement'] || 'Other';
    const key = `${camp}|||${placement}`;
    if (!byCampaignPlacement[key]) byCampaignPlacement[key] = { campaign: camp, placement, spend: 0, sales: 0, clicks: 0, orders: 0 };
    byCampaignPlacement[key].spend += num(r['Spend'] || r['spend']);
    byCampaignPlacement[key].sales += num(r['7 Day Total Sales '] || r['7 Day Total Sales']);
    byCampaignPlacement[key].clicks += num(r['Clicks']);
    byCampaignPlacement[key].orders += num(r['7 Day Total Orders (#)']);
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
    byTarget[key].sales += num(r['7 Day Total Sales '] || r['7 Day Total Sales']);
    byTarget[key].impressions += num(r['Impressions']);
    byTarget[key].clicks += num(r['Clicks']);
    byTarget[key].orders += num(r['7 Day Total Orders (#)']);
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
  return rows.map(r => {
    const query = r['Search Query'] || r['"Search Query"'] || '';
    return {
      query: query.replace(/^"|"$/g, ''),
      score: num(r['Search Query Score']),
      volume: num(r['Search Query Volume']),
      totalImpressions: num(r['Impressions: Total Count']),
      brandImpressions: num(r['Impressions: Brand Count']),
      brandImprShare: num(r['Impressions: Brand Share %']),
      totalClicks: num(r['Clicks: Total Count']),
      clickRate: num(r['Clicks: Click Rate %']),
      brandClicks: num(r['Clicks: Brand Count']),
      brandClickShare: num(r['Clicks: Brand Share %']),
      totalPurchases: num(r['Purchases: Total Count']),
      purchaseRate: num(r['Purchases: Purchase Rate %']),
      brandPurchases: num(r['Purchases: Brand Count']),
      brandPurchaseShare: num(r['Purchases: Brand Share %']),
      totalCartAdds: num(r['Cart Adds: Total Count']),
      brandCartAdds: num(r['Cart Adds: Brand Count']),
    };
  }).filter(r => r.query && r.totalImpressions > 0).sort((a, b) => b.volume - a.volume);
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

  return context;
};

// ============ AUTO-DETECT REPORT TYPE ============

const detectReportType = (headers, rows, fileName) => {
  const hSet = new Set(headers.map(h => h.toLowerCase().trim()));
  const fLower = fileName.toLowerCase();

  // Search Query Performance (Brand Analytics)
  if (hSet.has('search query') || hSet.has('"search query"') || hSet.has('search query volume') || hSet.has('search query score')) return 'searchQueryPerf';

  // Business Report (by ASIN)
  if (hSet.has('sessions - total') || hSet.has('(parent) asin') || hSet.has('unit session percentage') || hSet.has('featured offer (buy box) percentage')) return 'businessReport';

  // SD Campaign (14 Day + DPV / New-to-brand)
  if (hSet.has('14 day detail page views (dpv)') || hSet.has('14 day new-to-brand orders (#)')) return 'sdCampaign';

  // SB Search Terms (14 Day attribution)
  if ((hSet.has('customer search term') || hSet.has('search term')) && (hSet.has('14 day total sales') || hSet.has('14 day total sales ') || hSet.has('14 day total orders (#)'))) return 'sbSearchTerms';

  // SP Placement
  if (hSet.has('placement')) return 'spPlacement';

  // SP Targeting
  if (hSet.has('targeting') && (hSet.has('top-of-search impression share') || hSet.has('top-of-search is') || hSet.has('match type'))) return 'spTargeting';

  // SP Advertised Products
  if (hSet.has('advertised asin') || hSet.has('advertised sku')) return 'spAdvertised';

  // SP Search Terms (7 Day attribution)
  if (hSet.has('customer search term') && (hSet.has('7 day total sales') || hSet.has('7 day total sales ') || hSet.has('7 day total orders (#)'))) return 'spSearchTerms';

  // Daily Overview / Historical (has Date + Spend + ROAS columns)
  if ((hSet.has('date') || hSet.has('Date')) && (hSet.has('spend') || hSet.has('Spend')) && (hSet.has('roas') || hSet.has('ROAS') || hSet.has('acos') || hSet.has('ACOS'))) {
    // Distinguish by row count: >60 days = historical, else recent overview
    if (rows.length > 60 || fLower.includes('histor') || fLower.includes('year') || fLower.includes('552')) return 'historicalDaily';
    return 'dailyOverview';
  }

  // Fallback: search term report without clear attribution window
  if (hSet.has('customer search term') || hSet.has('search term')) return 'spSearchTerms';

  return null;
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
}) => {
  const [detectedFiles, setDetectedFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [dragOver, setDragOver] = useState(false);

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

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const fileList = [...e.dataTransfer.files].filter(f => f.name.endsWith('.csv') || f.name.endsWith('.xlsx') || f.name.endsWith('.xls'));
    if (fileList.length > 0) readAndDetect(fileList);
  };

  const handleFileInput = (e) => {
    const fileList = [...e.target.files];
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
        if (setAmazonCampaigns) setAmazonCampaigns(currentCampaigns);
        try { localStorage.setItem('ecommerce_daily_sales_v1', JSON.stringify(currentDays)); } catch(e) {}
        try { localStorage.setItem('ecommerce_amazon_campaigns_v1', JSON.stringify(currentCampaigns)); } catch(e) {}
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

  const validFiles = detectedFiles.filter(d => d.type && !d.error);
  const unknownFiles = detectedFiles.filter(d => !d.type || d.error);
  const hasExistingData = adsIntelData?.lastUpdated;
  const typeLabels = Object.fromEntries(REPORT_TYPES.map(r => [r.key, r.label]));
  const typeColors = Object.fromEntries(REPORT_TYPES.map(r => [r.key, r.color]));

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 p-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Brain className="w-6 h-6" />Amazon Ads Intelligence
            </h2>
            <p className="text-white/70 text-sm">Drop all your reports — we'll figure out the rest</p>
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
              <p className="text-emerald-400 font-medium">✓ Intel loaded · {new Date(adsIntelData.lastUpdated).toLocaleDateString()}</p>
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
                ].filter(Boolean).join(' · ')}
              </p>
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
              accept=".csv,.xlsx,.xls"
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
              
              {/* Generate Action Plan CTA */}
              {results.some(r => r.status === 'success') && onGoToAnalyst && (
                <button
                  onClick={() => {
                    setShow(false);
                    setDetectedFiles([]);
                    setResults(null);
                    onGoToAnalyst();
                  }}
                  className="w-full px-4 py-3.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 rounded-xl text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 text-base"
                >
                  <Zap className="w-5 h-5" />Generate My Action Plan
                </button>
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
              <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing...</>
            ) : (
              <><Brain className="w-4 h-4" /> Process {validFiles.length} Report{validFiles.length !== 1 ? 's' : ''}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AmazonAdsIntelModal;
