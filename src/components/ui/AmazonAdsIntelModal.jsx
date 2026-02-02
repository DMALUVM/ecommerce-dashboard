import React, { useState, useCallback } from 'react';
import { Brain, X, Upload, FileSpreadsheet, CheckCircle, AlertTriangle, TrendingUp, Target, Search, BarChart3, Eye, ShoppingCart } from 'lucide-react';
import { loadXLSX } from '../../utils/xlsx';

const REPORT_TYPES = [
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
    if (lines[i].includes('ASIN') || lines[i].includes('Date') || lines[i].includes('Search Query')) {
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

export const buildAdsIntelContext = (intelData) => {
  if (!intelData || !intelData.lastUpdated) return '';
  
  let context = `\n=== DETAILED AMAZON ADS INTELLIGENCE (Updated: ${new Date(intelData.lastUpdated).toLocaleDateString()}) ===\n`;
  
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

// ============ COMPONENT ============

const AmazonAdsIntelModal = ({
  show,
  setShow,
  adsIntelData,
  setAdsIntelData,
  combinedData,
  queueCloudSave,
}) => {
  const [files, setFiles] = useState({});
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);

  if (!show) return null;

  const handleFileSelect = (key, file) => {
    setFiles(prev => ({ ...prev, [key]: file }));
    setResults(null);
  };

  const processAll = async () => {
    setProcessing(true);
    setResults(null);
    const newIntel = { ...adsIntelData, lastUpdated: new Date().toISOString() };
    const processResults = [];

    try {
      for (const [key, file] of Object.entries(files)) {
        if (!file) continue;
        try {
          let rows;
          if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            rows = await parseXlsx(file);
          } else {
            const text = await file.text();
            rows = parseCSV(text);
          }

          let summary;
          switch (key) {
            case 'spSearchTerms': summary = aggregateSPSearchTerms(rows); break;
            case 'spAdvertised': summary = aggregateSPAdvertised(rows); break;
            case 'spPlacement': summary = aggregateSPPlacement(rows); break;
            case 'spTargeting': summary = aggregateSPTargeting(rows); break;
            case 'sbSearchTerms': summary = aggregateSBSearchTerms(rows); break;
            case 'sdCampaign': summary = aggregateSDCampaign(rows); break;
            case 'businessReport': summary = aggregateBusinessReport(rows); break;
            case 'searchQueryPerf': summary = aggregateSearchQueryPerf(rows); break;
          }

          newIntel[key] = summary;
          processResults.push({ key, status: 'success', rows: rows.length });
        } catch (err) {
          console.error(`Error processing ${key}:`, err);
          processResults.push({ key, status: 'error', error: err.message });
        }
      }

      setAdsIntelData(newIntel);
      if (queueCloudSave) queueCloudSave();
      setResults(processResults);
    } catch (err) {
      console.error('Processing error:', err);
    } finally {
      setProcessing(false);
    }
  };

  const fileCount = Object.values(files).filter(Boolean).length;
  const hasExistingData = adsIntelData?.lastUpdated;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 p-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Brain className="w-6 h-6" />Amazon Ads Intelligence Upload
            </h2>
            <p className="text-white/70 text-sm">Upload reports for deep AI optimization analysis</p>
          </div>
          <button onClick={() => { setShow(false); setFiles({}); setResults(null); }} className="p-2 hover:bg-white/20 rounded-lg text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {hasExistingData && (
            <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-lg p-3 text-sm">
              <p className="text-emerald-400 font-medium">✓ Intel data loaded from {new Date(adsIntelData.lastUpdated).toLocaleDateString()}</p>
              <p className="text-slate-400 text-xs mt-1">
                {[
                  adsIntelData.spSearchTerms && `${adsIntelData.spSearchTerms.totalTerms} SP search terms`,
                  adsIntelData.spAdvertised?.length && `${adsIntelData.spAdvertised.length} advertised ASINs`,
                  adsIntelData.spPlacement && `${adsIntelData.spPlacement.byPlacement.length} placements`,
                  adsIntelData.spTargeting?.length && `${adsIntelData.spTargeting.length} targets`,
                  adsIntelData.sbSearchTerms?.length && `${adsIntelData.sbSearchTerms.length} SB terms`,
                  adsIntelData.sdCampaign?.length && `${adsIntelData.sdCampaign.length} SD campaigns`,
                  adsIntelData.businessReport?.length && `${adsIntelData.businessReport.length} ASINs in biz report`,
                  adsIntelData.searchQueryPerf?.length && `${adsIntelData.searchQueryPerf.length} organic queries`,
                ].filter(Boolean).join(' • ')}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {REPORT_TYPES.map(rt => {
              const Icon = rt.icon;
              const file = files[rt.key];
              const hasExisting = !!adsIntelData?.[rt.key];
              return (
                <label key={rt.key} className={`relative flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${file ? 'border-emerald-500/50 bg-emerald-900/20' : hasExisting ? 'border-slate-600 bg-slate-800/30' : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'}`}>
                  <Icon className={`w-5 h-5 flex-shrink-0 text-${rt.color}-400`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium">{rt.label}</p>
                    {file ? (
                      <p className="text-emerald-400 text-xs truncate">✓ {file.name}</p>
                    ) : (
                      <p className="text-slate-500 text-xs">{rt.desc}</p>
                    )}
                  </div>
                  {hasExisting && !file && <span className="text-xs text-slate-500 bg-slate-700 px-2 py-0.5 rounded">cached</span>}
                  <input type="file" accept={rt.accept || '.xlsx,.csv'} className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => { if (e.target.files[0]) handleFileSelect(rt.key, e.target.files[0]); }} />
                </label>
              );
            })}
          </div>

          {/* Results */}
          {results && (
            <div className="bg-slate-800/50 rounded-lg p-3 space-y-1">
              {results.map(r => (
                <div key={r.key} className={`flex items-center gap-2 text-sm ${r.status === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {r.status === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  <span>{REPORT_TYPES.find(rt => rt.key === r.key)?.label}: {r.status === 'success' ? `${r.rows} rows processed` : r.error}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 flex justify-between items-center">
          <p className="text-slate-400 text-sm">{fileCount} file{fileCount !== 1 ? 's' : ''} selected</p>
          <button
            onClick={processAll}
            disabled={fileCount === 0 || processing}
            className="px-6 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-lg font-medium disabled:opacity-40 hover:opacity-90 flex items-center gap-2"
          >
            {processing ? (
              <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing...</>
            ) : (
              <><Brain className="w-4 h-4" /> Process & Save Intel</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AmazonAdsIntelModal;
