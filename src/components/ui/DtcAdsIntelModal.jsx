import React, { useState } from 'react';
import { X, Upload, CheckCircle, AlertTriangle, TrendingUp, Target, Search, BarChart3, ShoppingCart, Zap, Download, FileText, Globe, Instagram, Archive, Loader2 } from 'lucide-react';
import { loadXLSX } from '../../utils/xlsx';

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
  const XLSX = await loadXLSX();
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  
  // Find the header row — look for known column names
  const knownHeaders = ['campaign', 'search term', 'keyword', 'ad group', 'ad set name', 'ad name', 
    'campaign name', 'search query', 'day', 'landing page type', 'asset group status', 'reporting starts',
    'keyword status', 'ad group status', 'campaign state', 'reporting starts', 'amount spent'];
  
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, allRows.length); i++) {
    const row = allRows[i];
    if (!row) continue;
    const lower = row.map(c => String(c || '').toLowerCase().trim());
    if (lower.some(h => knownHeaders.some(kh => h.includes(kh)))) {
      headerIdx = i;
      break;
    }
  }
  
  const headers = allRows[headerIdx].map(h => String(h || '').trim());
  const rows = [];
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const vals = allRows[i];
    if (!vals || vals.every(v => v === null || v === '' || v === undefined)) continue;
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
  
  // === AMAZON ===
  if (hSet.has('search query') && hSet.has('search query volume')) return 'amazonSearchQuery';
  
  // === SHOPIFY ===
  if (hSet.has('landing page type') && hSet.has('landing page path')) return 'shopifyLandingPages';
  if (hSet.has('day') && hSet.has('conversion rate') && hSet.has('sessions with cart additions')) return 'shopifyConversion';
  if (hSet.has('day') && hSet.has('average order value') && hSet.has('gross sales')) return 'shopifyAOV';
  if (hSet.has('day') && hSet.has('total sales') && hSet.has('net sales')) return 'shopifySales';
  if (hSet.has('day') && hSet.has('sessions') && hSet.has('online store visitors')) return 'shopifySessions';
  
  // === META ===
  if (hSet.has('ad set name') && hSet.has('age') && hSet.has('amount spent (usd)')) return 'metaAdSetAge';
  if (hSet.has('ad set name') && hSet.has('gender') && hSet.has('amount spent (usd)')) return 'metaAdSetGender';
  if (hSet.has('ad set name') && hSet.has('placement') && hSet.has('platform')) return 'metaAdSetPlacement';
  if (hSet.has('ad name') && hSet.has('amount spent (usd)')) return 'metaAds';
  if (hSet.has('ad set name') && hSet.has('amount spent (usd)') && !hSet.has('ad name')) return 'metaAdSets';
  if (hSet.has('campaign name') && hSet.has('amount spent (usd)')) return 'metaCampaign';
  // Meta Ads Manager export format (has Reporting starts/ends)
  if (hSet.has('reporting starts') && (hSet.has('amount spent (usd)') || hSet.has('purchase roas (return on ad spend)'))) return 'metaCampaign';
  
  // === GOOGLE ===
  if (hSet.has('asset group status') || hSet.has('asset group')) return 'googleAssetGroups';
  if (hSet.has('keyword status') && hSet.has('max. cpc')) return 'googleKeywords';
  if (hSet.has('search term') && hSet.has('match type') && (hSet.has('avg. cpc') || hSet.has('cost'))) return 'googleSearchTerms';
  if (hSet.has('ad group') && hSet.has('campaign') && hSet.has('clicks') && !hSet.has('search term')) return 'googleAdGroup';
  if (hSet.has('campaign') && hSet.has('campaign state') && hSet.has('cost')) return 'googleCampaign';
  
  return null;
};

// ============ AGGREGATORS ============

const aggregateGoogleCampaigns = (rows, dateRange) => {
  return rows.filter(r => r['Campaign']).map(r => ({
    campaign: r['Campaign'],
    state: r['Campaign state'] || '',
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
  const terms = rows.filter(r => r['Search term']).map(r => ({
    term: r['Search term'],
    matchType: r['Match type'] || '',
    campaign: r['Campaign'] || '',
    adGroup: r['Ad group'] || '',
    keyword: r['Keyword'] || '',
    clicks: num(r['Clicks']),
    impressions: num(r['Impr.']),
    ctr: pct(r['CTR']),
    avgCPC: num(r['Avg. CPC']),
    cost: num(r['Cost']),
    conversions: num(r['Conversions']),
    convValue: num(r['Conv. value']),
    roas: num(r['Conv. value / cost']),
    convRate: pct(r['Conv. rate']),
    added: r['Added/Excluded'] || '',
  }));

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

const aggregateMetaCampaigns = (rows, dateRange) => {
  return rows.filter(r => r['Campaign name'] || r['Campaign Name']).map(r => ({
    campaign: r['Campaign name'] || r['Campaign Name'] || '',
    delivery: r['Campaign delivery'] || r['Campaign Delivery'] || '',
    spend: num(r['Amount spent (USD)'] || r['Amount Spent (USD)']),
    impressions: num(r['Impressions']),
    reach: num(r['Reach']),
    frequency: num(r['Frequency']),
    cpm: num(r['CPM (cost per 1,000 impressions) (USD)']),
    cpc: num(r['CPC (cost per link click) (USD)']),
    clicks: num(r['Link clicks'] || r['Clicks (all)']),
    purchases: num(r['Purchases']),
    purchaseValue: num(r['Purchases conversion value']),
    costPerPurchase: num(r['Cost per purchase (USD)']),
    roas: num(r['Purchase ROAS (return on ad spend)']),
    addToCart: num(r['Adds to cart']),
    checkouts: num(r['Checkouts initiated']),
    dateRange,
  })).filter(r => r.spend > 0 || r.campaign).sort((a, b) => b.spend - a.spend);
};

const aggregateMetaAdSets = (rows, dateRange) => {
  return rows.filter(r => r['Ad set name'] && num(r['Amount spent (USD)']) > 0).map(r => ({
    adSet: r['Ad set name'],
    delivery: r['Ad set delivery'] || '',
    spend: num(r['Amount spent (USD)']),
    impressions: num(r['Impressions']),
    reach: num(r['Reach']),
    frequency: num(r['Frequency']),
    cpm: num(r['CPM (cost per 1,000 impressions) (USD)']),
    cpc: num(r['CPC (cost per link click) (USD)']),
    clicks: num(r['Link clicks']),
    purchases: num(r['Purchases']),
    purchaseValue: num(r['Purchases conversion value']),
    costPerPurchase: num(r['Cost per purchase (USD)']),
    roas: num(r['Purchase ROAS (return on ad spend)']),
    addToCart: num(r['Adds to cart']),
    cartValue: num(r['Adds to cart conversion value']),
    checkouts: num(r['Checkouts initiated']),
    dateRange,
  })).sort((a, b) => b.spend - a.spend);
};

const aggregateMetaAds = (rows, dateRange) => {
  return rows.filter(r => r['Ad name'] && num(r['Amount spent (USD)']) > 0).map(r => ({
    adName: r['Ad name'],
    adSet: r['Ad set name'] || '',
    delivery: r['Ad delivery'] || '',
    spend: num(r['Amount spent (USD)']),
    impressions: num(r['Impressions']),
    reach: num(r['Reach']),
    frequency: num(r['Frequency']),
    cpm: num(r['CPM (cost per 1,000 impressions) (USD)']),
    cpc: num(r['CPC (cost per link click) (USD)']),
    clicks: num(r['Link clicks']),
    purchases: num(r['Purchases']),
    purchaseValue: num(r['Purchases conversion value']),
    costPerPurchase: num(r['Cost per purchase (USD)']),
    roas: num(r['Purchase ROAS (return on ad spend)']),
    addToCart: num(r['Adds to cart']),
    checkouts: num(r['Checkouts initiated']),
    qualityRanking: r['Quality ranking'] || '',
    engagementRanking: r['Engagement rate ranking'] || '',
    conversionRanking: r['Conversion rate ranking'] || '',
    dateRange,
  })).sort((a, b) => b.spend - a.spend);
};

const aggregateMetaDemographic = (rows, dimensionKey, dateRange) => {
  return rows.filter(r => r[dimensionKey] && num(r['Amount spent (USD)']) > 0).map(r => ({
    dimension: r[dimensionKey],
    adSet: r['Ad set name'] || '',
    spend: num(r['Amount spent (USD)']),
    impressions: num(r['Impressions']),
    clicks: num(r['Link clicks']),
    cpc: num(r['CPC (cost per link click) (USD)']),
    purchases: num(r['Purchases']),
    purchaseValue: num(r['Purchases conversion value']),
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
    ctx += `\n--- GOOGLE CAMPAIGNS (${gc.length}) | Total Spend $${Math.round(totalCost)} | Conv Value $${Math.round(totalConvVal)} | ROAS ${totalCost > 0 ? (totalConvVal / totalCost).toFixed(2) : 'N/A'} ---
${gc.filter(c => c.cost > 0).map(c => `  ${c.campaign} [${c.type}] ${c.state} | Spend $${c.cost.toFixed(2)} | Conv Val $${c.convValue.toFixed(2)} | ROAS ${c.roas.toFixed(2)} | Conv ${c.conversions} | CPC $${c.avgCPC.toFixed(2)} | CTR ${c.ctr}% | AbsTop ${c.absTopImpr}%`).join('\n')}
`;
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

export const buildDtcActionReportPrompt = (intelData) => {
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
  const brandTerms = ['tallowbourn', 'tallowbourne', 'tallow bourn'];
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

CROSS-CHANNEL OVERVIEW:
  Meta: Spend $${Math.round(metaSpend)} | Revenue $${Math.round(metaRevenue)} | ROAS ${metaSpend > 0 ? (metaRevenue / metaSpend).toFixed(2) : 'N/A'} | ${metaPurchases} purchases | CPP $${metaPurchases > 0 ? (metaSpend / metaPurchases).toFixed(2) : 'N/A'}
  Google: Spend $${Math.round(googleSpend)} | Revenue $${Math.round(googleRevenue)} | ROAS ${googleSpend > 0 ? (googleRevenue / googleSpend).toFixed(2) : 'N/A'} | ${googleConversions} conversions
  TOTAL ADS: Spend $${Math.round(totalAdSpend)} | Reported Revenue $${Math.round(totalAdRevenue)} | Blended ROAS ${totalAdSpend > 0 ? (totalAdRevenue / totalAdSpend).toFixed(2) : 'N/A'}
  Shopify: ${shopifyDays}d | Revenue $${Math.round(shopifyRevenue)} | Net $${Math.round(shopifyNet)} | ${shopifyOrders} orders
  TRUE BLENDED ROAS (Shopify rev / total ad spend): ${totalAdSpend > 0 ? (shopifyRevenue / totalAdSpend).toFixed(2) : 'N/A'}
  Ad Spend as % of Shopify Revenue: ${shopifyRevenue > 0 ? (totalAdSpend / shopifyRevenue * 100).toFixed(1) : 'N/A'}%
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
- Pull each lever independently. Diagnose which lever is broken before prescribing solutions.
- Contribution Margin: Revenue - COGS - Ad Spend - Shipping - Payment Processing
- CAC: Total ad spend / new customers. LTV:CAC ratio should be 3:1+ for sustainable growth.
- For tallow skincare DTC: target 60%+ gross margin, <30% of revenue on ads, CAC payback <60 days.
`;

  if (hasMeta) {
    frameworks += `
FRAMEWORK 2: META ADS — OPERATOR PLAYBOOK
Account structure (Advantage+ era):
- 1 ASC campaign (Advantage+ Shopping) with 3-5 creatives → primary prospecting engine
- 1 CBO retargeting campaign (website visitors 1-30d, ATC 1-14d, engaged video 1-7d)
- 1 testing campaign (ABO) → 3 ad sets × 1 creative each → test new angles at $20/day per ad set
- Kill rule: any ad with 2x the account-avg CPP after $30 spend → OFF
- Scale rule: if ROAS > 2x account avg for 3 days straight → increase budget 20%
Creative analysis:
- Hook rate (3-sec video view / impressions): healthy is >25%. Below 15% = bad hook
- CTR (link click): above 1.5% for cold, above 2.5% for retargeting
- Quality/Engagement/Conversion rankings: "Below average" on ANY = creative is penalized → replace
- Creative fatigue: frequency >3.0 + declining CTR over 7d = fatigue
- CPM benchmarks for DTC beauty: $8-15 for prospecting, $15-25 for retargeting
Attribution: Meta 7d click / 1d view over-attributes by 20-40% vs actual Shopify revenue.
`;
  }

  if (hasGoogle) {
    frameworks += `
FRAMEWORK 3: GOOGLE ADS — OPERATOR PLAYBOOK
- Brand Search (exact + phrase): target 8-15x ROAS. If abs-top IS <85%, increase bids.
- Non-brand Search (category terms): target 2.5-4x ROAS. Aggressive on exact match for proven converters.
- Google PMax: target 2-3x ROAS BUT audit search terms monthly — PMax cannibalizes brand traffic.
Bid formula: Target Bid = Target CPA × Conversion Rate. Always specify EXACT new bid amount.
Negative keywords: NEGATIVE EXACT for irrelevant or >$15 spend with 0 conversions. NEGATIVE PHRASE for irrelevant root phrases. NEVER negate brand terms.
`;
  }

  if (hasShopify) {
    frameworks += `
FRAMEWORK 4: ON-PAGE SEO & CONVERSION RATE OPTIMIZATION
Product pages: Title tag with primary keyword + brand (<60 chars). Meta description benefit-driven 150-160 chars. H1 with product keyword. Min 5 images with keyword alt tags. Reviews/UGC above fold. Trust badges near ATC. Cross-sell below ATC increases AOV 10-25%.
Landing pages for ads: dedicated LPs for top campaigns, headline must mirror ad hook, page speed <3s mobile.
Technical SEO: Product + Review + FAQ schema markup. Internal linking blog → product. Blog content targeting long-tail converting keywords. Core Web Vitals: LCP <2.5s, FID <100ms, CLS <0.1.
Funnel benchmarks: Cart add rate 8-12%, Cart→Checkout 55-70%, Checkout→Purchase 70-85%.
`;
  }

  if (hasMeta && hasMetaDemographics) {
    frameworks += `
FRAMEWORK 5: AUDIENCE & DEMOGRAPHIC STRATEGY
- Find "golden cohort" — demo converting at 2x+ average. Double down with specific creative.
- Exclude demographics with ROAS <0.5x average from prospecting.
- Placement: Feed and Reels typically outperform Stories and Audience Network. Kill placements with >$20 spend and 0 purchases.
`;
  }

  frameworks += `
FRAMEWORK 6: CROSS-CHANNEL BUDGET ALLOCATION
For $200-400/day DTC skincare: Meta 55-65%, Google 25-35%, PMax 5-10%.
Shift budget WEEKLY from lowest true-ROAS channel to highest.
TRUE north star: Shopify total revenue / total ad spend = real blended ROAS.
If blended ROAS >2.5x at 60% margins → profitable, scale. 1.5-2.5x → optimize. <1.5x → cut, fix fundamentals.

FRAMEWORK 7: CEO'S WEEKLY OPERATING CADENCE
Review: Blended ROAS trend, CAC by channel, AOV stability, conversion rate by device, top 3 ads fatigue check, Google search term waste, inventory levels.
`;

  const systemPrompt = `You are a fractional CMO / COO who has scaled 150+ DTC skincare/beauty brands from $500K to $10M+ annually. You operate hands-on — logging into Meta Ads Manager, Google Ads, Shopify Analytics, and Google Search Console personally. You've spent $100M+ across Meta and Google for DTC brands.

${frameworks}

FORMAT YOUR REPORT IN MARKDOWN. Be AGGRESSIVE, SPECIFIC, and OPERATOR-LEVEL. Every recommendation must include:
1. The EXACT campaign name, ad name, keyword, or page URL
2. Current performance metrics from the data
3. The SPECIFIC action (exact bid, budget, creative kill/keep, page edit)
4. Estimated dollar impact (weekly and monthly)
5. Time to implement

You are not an advisor. You are the fractional CMO in the operator seat. Write as if you will log into Meta Ads Manager, Google Ads, and Shopify admin TODAY. Use direct language: "Kill this ad" not "Consider pausing."`;

  // ===== BUILD USER PROMPT — only request sections for available data =====
  let sections = `
## 📊 EXECUTIVE SUMMARY & P&L HEALTH CHECK
- Account health grade (A-F) for each platform with data, with justification
- Total ad spend, Shopify revenue, blended ROAS (Shopify revenue / total ad spend)
- TRUE MER and sustainability at 60% margins
- Revenue equation breakdown: Traffic × Conv Rate × AOV = Revenue. Which lever is broken?
- Top 3 wins, top 3 problems
- 1-sentence CEO verdict: "The business is [healthy/at risk/bleeding] because [reason]"
`;

  if (hasMeta) {
    sections += `
## 🔴 META: KILL LIST — Ads & Audiences to Cut Immediately
For EACH underperforming ad/ad set/campaign:
| Name | Type | Spend | Purchases | ROAS | CPP | Quality/Eng/Conv Rank | Verdict |
Kill rule: CPP > 2x account avg OR ROAS < 0.5x account avg after $30 spend → OFF
Calculate: "Cutting these saves ~$X/week"
Flag creative fatigue signals (frequency >3, declining CTR).

## 🟢 META: SCALE LIST — Winners to Push
| Name | Spend | ROAS | CPP | CPC | Purchases | Action |
Which creatives to duplicate? Budget increases (exact daily amount)? New angles to test?

## 🎨 META: CREATIVE STRATEGY & TESTING ROADMAP
What hook angles and formats are winning vs losing?
5 specific new creative briefs: format, hook, body, CTA, product. Testing budget and kill criteria.
`;
  }

  if (hasMeta && hasMetaDemographics) {
    sections += `
## 👥 META: AUDIENCE & DEMOGRAPHIC OPTIMIZATION
"Golden cohort" identification. Demographics to EXCLUDE.
| Placement | Spend | Purchases | ROAS | Verdict (Scale / Keep / Kill) |
Advantage+ signal recommendations. Retargeting vs prospecting split assessment.
`;
  }

  if (hasGoogle) {
    sections += `
## 🔴 GOOGLE: NEGATIVE KEYWORDS & WASTED SPEND
| Search Term | Campaign | Cost | Clicks | Conv | Action (negative exact/phrase) |
Minimum 10 negatives. Total savings calculation.
PMax brand cannibalization audit if applicable.

## 🟢 GOOGLE: SCALE & BID OPTIMIZATION
| Keyword | Campaign | Current CPC | ROAS | Conv | Suggested Bid | Action |
Brand term impression share assessment. Non-brand winners to promote to exact. Budget cap flags.
`;
  }

  if (hasShopify) {
    sections += `
## 🛒 SHOPIFY: CONVERSION RATE OPTIMIZATION & ON-PAGE SEO

### Funnel Diagnosis
Session→Cart rate: ${(avgCartRate * 100).toFixed(1)}% (benchmark 8-12%). Cart→Checkout: ${(avgCheckoutRate * 100).toFixed(1)}% (benchmark 55-70%). Checkout→Purchase: ${(avgCheckoutComplete * 100).toFixed(1)}% (benchmark 70-85%).
For each below-benchmark stage: 3 SPECIFIC actions.
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
| Channel | Current Spend/Day | ROAS | Recommended Spend/Day | Expected ROAS | $ Change |
Account for attribution differences. Project improvement.
`;
  }

  sections += `
## ⚡ TOP 10 ACTIONS THIS WEEK (Priority Order)
For EACH: specific action, current metrics, expected improvement, time to implement, estimated weekly impact, WHERE to do it.
Organize: 🟢 QUICK WINS (<5 min) | 🟡 MEDIUM (5-15 min) | 🔴 STRATEGIC (15+ min)

## 📋 IMPLEMENTATION CHECKLIST
Numbered checklist of EVERY action, organized by platform (${[hasMeta && 'Meta Ads Manager', hasGoogle && 'Google Ads', hasShopify && 'Shopify Admin', 'Content/SEO'].filter(Boolean).join(', ')}).

## 📆 CEO's WEEKLY REVIEW TEMPLATE
7-item checklist for Monday morning: metric, where to find it, what "good" looks like, what to do if off.`;

  const userPrompt = `Generate a comprehensive DTC Growth & Advertising Action Report for Tallowbourn (tallow-based skincare: lip balms, body balms, deodorant).

REPORTS AVAILABLE: ${available.join(', ')}
${available.length < 5 ? `\nNOTE: Only ${available.length} report types uploaded. Analyze what's available and note which missing reports would enable deeper analysis.` : ''}

PRODUCT CONTEXT:
- Lip Balm 3-Pack — hero SKU, ~$14 price point, highest volume
- Body Balm 2oz — premium product, $18-24 price point
- Deodorant — newer product, $12-16, building awareness
- Shopify DTC site: tallowbourn.com
- Also selling on Amazon (separate PPC report covers Amazon ads)
- ~$200-300/day total DTC ad budget (Meta + Google)
- Target blended ROAS: 2.5x+ (Shopify revenue / total ad spend)
- ~60% gross margins
- Target CAC: <$15 for lip balm, <$25 for body balm, <$18 for deodorant

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

const DtcAdsIntelModal = ({
  show,
  setShow,
  dtcIntelData,
  setDtcIntelData,
  queueCloudSave,
  setToast,
  callAI,
}) => {
  const [detectedFiles, setDetectedFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [actionReport, setActionReport] = useState(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState(null);

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

          // Merge arrays for types that may have multiple time periods
          if (Array.isArray(summary) && Array.isArray(newIntel[det.type])) {
            // Deduplicate by merging
            const existing = newIntel[det.type] || [];
            newIntel[det.type] = [...existing, ...summary];
          } else if (det.type === 'googleSearchTerms' && newIntel[det.type]) {
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
      const prompts = buildDtcActionReportPrompt(dtcIntelData);
      if (!prompts) throw new Error('No data available');
      const response = await callAI(prompts.userPrompt, prompts.systemPrompt);
      setActionReport(response);
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
                <button onClick={generateActionReport} className="mt-3 w-full px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-lg text-white font-medium flex items-center justify-center gap-2 text-sm shadow-lg shadow-cyan-500/20">
                  <FileText className="w-4 h-4" />🔬 Generate DTC Action Report from This Data
                </button>
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
                [&_li]:text-slate-300 [&_li]:leading-relaxed
                [&_p]:text-slate-300 [&_p]:leading-relaxed
                [&_table]:w-full [&_th]:text-left [&_th]:text-slate-300 [&_th]:pb-2 [&_th]:pr-3 [&_td]:py-1 [&_td]:pr-3 [&_td]:text-slate-400
                [&_code]:bg-slate-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-emerald-400 [&_code]:text-xs
              ">
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(actionReport) }} />
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
                      <div className="flex gap-2">
                        {callAI && !actionReport && !generatingReport && (
                          <button onClick={generateActionReport} className="flex-1 px-4 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-xl text-white font-medium flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20">
                            <FileText className="w-4 h-4" />🔬 Generate DTC Action Report
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
