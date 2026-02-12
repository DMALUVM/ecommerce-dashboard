/**
 * adsReportParser.js — Universal Ads Report Classifier & Parser
 * 
 * Handles: CSV, XLSX, ZIP (containing CSVs/XLSXs)
 * Auto-classifies report type by header signatures
 * Routes to Tier 1 (daily KPIs → dailySales) or Tier 2 (deep analysis → adsIntelData)
 * 
 * TIER 1 REPORT TYPES (powers Dashboard, Profitability, Trends, Ads Overview):
 *   - amazon_daily_aggregate: Daily spend/revenue/ROAS across all Amazon campaigns
 *   - google_daily: Per-ad daily Google Ads metrics (aggregated to daily totals)
 *   - meta_daily: Per-ad daily Meta Ads metrics (aggregated to daily totals)
 * 
 * TIER 2 REPORT TYPES (powers Ads page search terms, placements, AI reports):
 *   Amazon: sp_search_terms, sp_advertised_product, sp_targeting, sp_placement,
 *           sb_campaign_placement, sb_search_terms, sd_campaign, search_query_performance
 *   Google: google_campaign_perf, google_search_terms, google_keywords, google_ad_groups, google_asset_groups
 *   Meta:   meta_campaign_perf, meta_ads, meta_ad_sets, meta_placement, meta_age, meta_gender
 *   Shopify: shopify_sales, shopify_sessions, shopify_conversion, shopify_aov, shopify_landing_pages
 *   Other:  sku_economics, business_report_child, business_report_parent, meta_ads_overview
 */

import * as XLSX from 'xlsx';

// ─── HEADER SIGNATURES ───────────────────────────────────────────────────────
// Each signature is an array of column names that MUST be present to match.
// Order matters for disambiguation — more specific signatures first.

const REPORT_SIGNATURES = [
  // ── TIER 1: Daily KPI Feeds ──
  {
    id: 'amazon_daily_aggregate',
    tier: 1,
    platform: 'amazon',
    label: 'Amazon Daily Aggregate',
    // "Ads data" xlsx files: date, Spend, Revenue, Orders, ROAS, ACOS, etc.
    required: ['date', 'Spend', 'Revenue', 'ROAS', 'ACOS'],
    optional: ['Impressions', 'Clicks', 'CTR', 'Total ACOS (TACOS)', 'Total Revenue'],
  },
  {
    id: 'google_daily',
    tier: 1,
    platform: 'google',
    label: 'Google Ads Daily',
    // Google daily CSV: Day, Campaign, Ad ID, Cost, Impressions, Clicks
    required: ['Day', 'Campaign', 'Cost', 'Impressions', 'Clicks'],
    optional: ['Ad ID', 'All conv. value', 'Conversions', 'CTR', 'Avg. CPC', 'Conv. value / cost'],
  },
  {
    id: 'meta_daily',
    tier: 1,
    platform: 'meta',
    label: 'Meta Ads Daily',
    // Meta daily CSV: Date, Ad name, Amount spent, Impressions, Link clicks
    required: ['Date', 'Ad name', 'Amount spent', 'Impressions'],
    optional: ['Purchases value (all)', 'Purchases (all)', 'Purchase (ROAS) (all)', 'Link clicks', 'CTR (all)', 'CPM'],
  },

  // ── TIER 2: Amazon Sponsored Products ──
  {
    id: 'sp_search_terms',
    tier: 2,
    platform: 'amazon',
    label: 'SP Search Terms',
    required: ['Customer Search Term', 'Campaign Name', 'Spend'],
    optional: ['Ad Group Name', 'Targeting', 'Match Type', 'Impressions', 'Clicks', '7 Day Total Sales'],
  },
  {
    id: 'sp_advertised_product',
    tier: 2,
    platform: 'amazon',
    label: 'SP Advertised Product',
    required: ['Advertised ASIN', 'Advertised SKU', 'Spend'],
    optional: ['Campaign Name', 'Impressions', 'Clicks', '7 Day Total Sales'],
  },
  {
    id: 'sp_targeting',
    tier: 2,
    platform: 'amazon',
    label: 'SP Targeting',
    required: ['Targeting', 'Match Type', 'Impressions'],
    optional: ['Campaign Name', 'Spend', 'Top-of-search Impression Share', '7 Day Total Sales'],
  },
  {
    id: 'sp_placement',
    tier: 2,
    platform: 'amazon',
    label: 'SP Placement',
    required: ['Placement', 'Bidding strategy', 'Campaign Name'],
    optional: ['Impressions', 'Clicks', 'Spend', '7 Day Total Sales'],
  },

  // ── TIER 2: Amazon Sponsored Brands ──
  {
    id: 'sb_campaign_placement',
    tier: 2,
    platform: 'amazon',
    label: 'SB Campaign Placement',
    required: ['Campaign Name', 'Placement', 'Cost type'],
    optional: ['Impressions', 'Clicks', 'Spend', '14 Day Total Sales', 'Viewable Impressions'],
  },
  {
    id: 'sb_search_terms',
    tier: 2,
    platform: 'amazon',
    label: 'SB Search Terms',
    required: ['Customer Search Term', 'Campaign Name', 'Cost type'],
    optional: ['Impressions', 'Clicks', 'Spend', '14 Day Total Sales'],
  },

  // ── TIER 2: Amazon Sponsored Display ──
  {
    id: 'sd_campaign',
    tier: 2,
    platform: 'amazon',
    label: 'SD Campaign',
    required: ['Campaign Name', 'Budget Amount'],
    optional: ['Impressions', 'Clicks', 'Spend', '14 Day Total Sales', '14 Day Detail Page Views (DPV)'],
  },

  // ── TIER 2: Amazon Brand Analytics ──
  {
    id: 'search_query_performance',
    tier: 2,
    platform: 'amazon',
    label: 'Search Query Performance',
    required: ['Search Query', 'Search Query Volume'],
    optional: ['Impressions: Total Count', 'Impressions: Brand Count', 'Impressions: Brand Share %', 'Clicks: Total Count'],
  },

  // ── TIER 2: Google Ads (from comprehensive reports - xlsx with metadata rows) ──
  {
    id: 'google_campaign_perf',
    tier: 2,
    platform: 'google',
    label: 'Google Campaign Performance',
    required: ['Campaign', 'Campaign state', 'Campaign type', 'Cost'],
    optional: ['Clicks', 'Impr.', 'CTR', 'Conversions', 'Conv. value'],
  },
  {
    id: 'google_search_terms',
    tier: 2,
    platform: 'google',
    label: 'Google Search Terms',
    required: ['Search term', 'Campaign', 'Cost'],
    optional: ['Match type', 'Impr.', 'Clicks', 'Conversions', 'Conv. value'],
  },
  {
    id: 'google_keywords',
    tier: 2,
    platform: 'google',
    label: 'Google Keywords',
    required: ['Keyword', 'Campaign', 'Match type'],
    optional: ['Keyword status', 'Impr.', 'Clicks', 'Cost', 'Conversions'],
  },
  {
    id: 'google_ad_groups',
    tier: 2,
    platform: 'google',
    label: 'Google Ad Group Performance',
    required: ['Ad group', 'Campaign', 'Campaign type'],
    optional: ['Clicks', 'Impr.', 'Cost', 'Conversions'],
  },
  {
    id: 'google_asset_groups',
    tier: 2,
    platform: 'google',
    label: 'Google Asset Groups',
    required: ['Asset Group', 'Campaign', 'Headlines'],
    optional: ['Descriptions', 'Asset group status'],
  },

  // ── TIER 2: Meta Ads (from comprehensive reports) ──
  {
    id: 'meta_campaign_perf',
    tier: 2,
    platform: 'meta',
    label: 'Meta Campaign Performance',
    required: ['Campaign name', 'Campaign delivery', 'Amount spent (USD)'],
    optional: ['Impressions', 'Reach', 'Frequency', 'CPM', 'Link clicks', 'Purchases'],
  },
  {
    id: 'meta_ads',
    tier: 2,
    platform: 'meta',
    label: 'Meta Ads',
    required: ['Ad name', 'Ad delivery', 'Amount spent (USD)'],
    optional: ['Impressions', 'Reach', 'Link clicks', 'Purchases', 'Quality ranking'],
  },
  {
    id: 'meta_ad_sets',
    tier: 2,
    platform: 'meta',
    label: 'Meta Ad Sets',
    required: ['Ad set name', 'Ad set delivery', 'Amount spent (USD)'],
    optional: ['Impressions', 'Reach', 'Bid', 'Link clicks'],
  },
  {
    id: 'meta_placement',
    tier: 2,
    platform: 'meta',
    label: 'Meta Placement',
    required: ['Ad set name', 'Platform', 'Placement', 'Amount spent (USD)'],
    optional: ['Device platform', 'Impressions'],
  },
  {
    id: 'meta_age',
    tier: 2,
    platform: 'meta',
    label: 'Meta Age Breakdown',
    required: ['Ad set name', 'Age', 'Amount spent (USD)'],
    optional: ['Impressions', 'Reach'],
  },
  {
    id: 'meta_gender',
    tier: 2,
    platform: 'meta',
    label: 'Meta Gender Breakdown',
    required: ['Ad set name', 'Gender', 'Amount spent (USD)'],
    optional: ['Impressions', 'Reach'],
  },
  {
    id: 'meta_ads_overview',
    tier: 2,
    platform: 'meta',
    label: 'Meta Ads Overview (Facebook Export)',
    required: ['Reporting starts', 'Campaign name', 'Amount spent (USD)'],
    optional: ['Results', 'Impressions', 'Reach', 'Frequency'],
  },

  // ── TIER 2: Shopify ──
  {
    id: 'shopify_sales',
    tier: 2,
    platform: 'shopify',
    label: 'Shopify Sales',
    required: ['Day', 'Orders', 'Gross sales', 'Net sales'],
    optional: ['Discounts', 'Returns', 'Shipping charges', 'Taxes', 'Total sales'],
  },
  {
    id: 'shopify_sessions',
    tier: 2,
    platform: 'shopify',
    label: 'Shopify Sessions',
    required: ['Day', 'Online store visitors', 'Sessions'],
    optional: ['Day (previous_period)'],
  },
  {
    id: 'shopify_conversion',
    tier: 2,
    platform: 'shopify',
    label: 'Shopify Conversion Rate',
    required: ['Day', 'Sessions', 'Conversion rate'],
    optional: ['Sessions with cart additions', 'Sessions that reached checkout'],
  },
  {
    id: 'shopify_aov',
    tier: 2,
    platform: 'shopify',
    label: 'Shopify AOV',
    required: ['Day', 'Average order value', 'Orders'],
    optional: ['Gross sales', 'Discounts'],
  },
  {
    id: 'shopify_landing_pages',
    tier: 2,
    platform: 'shopify',
    label: 'Shopify Landing Pages',
    required: ['Landing page path', 'Sessions'],
    optional: ['Landing page type', 'Online store visitors', 'Sessions with cart additions'],
  },

  // ── TIER 2: Business Reports & SKU Economics ──
  {
    id: 'business_report_child',
    tier: 2,
    platform: 'amazon',
    label: 'Business Report (Child ASIN)',
    required: ['(Child) ASIN', 'Sessions - Total'],
    optional: ['(Parent) ASIN', 'Title', 'Page Views - Total', 'Units Ordered', 'Ordered Product Sales'],
  },
  {
    id: 'business_report_parent',
    tier: 2,
    platform: 'amazon',
    label: 'Business Report (Parent ASIN)',
    required: ['(Parent) ASIN', 'Sessions - Total', 'Units Ordered'],
    optional: ['Title', 'Page Views - Total', 'Featured Offer (Buy Box) Percentage'],
  },
  {
    id: 'sku_economics',
    tier: 2,
    platform: 'amazon',
    label: 'SKU Economics Report',
    required: ['ASIN', 'MSKU', 'Average sales price'],
    optional: ['Units sold', 'Sales', 'FBA Fulfillment Fee per unit'],
  },
];


// ─── UTILITY HELPERS ──────────────────────────────────────────────────────────

const num = (v) => {
  if (v === null || v === undefined || v === '' || v === '—' || v === 'null' || v === '-') return 0;
  const n = Number(String(v).replace(/[$,%]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Parse date strings from various formats:
 * - "Feb 6, 2026"  (Google/Meta daily CSV)
 * - "2026-01-01"   (ISO)
 * - Excel date serial numbers
 * - "2026-01-01 00:00:00" (Excel datetime)
 */
const parseDate = (val) => {
  if (!val) return null;
  
  // Excel serial date number
  if (typeof val === 'number') {
    const d = new Date((val - 25569) * 86400 * 1000);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }
  
  const s = String(val).trim();
  
  // ISO format: 2026-01-01 or 2026-01-01T... or 2026-01-01 00:00:00
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  
  // "Feb 6, 2026" or "January 4, 2026" format
  const mdyMatch = s.match(/^(\w+)\s+(\d{1,2}),?\s*(\d{4})/);
  if (mdyMatch) {
    const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
    const m = months[mdyMatch[1].toLowerCase().slice(0, 3)];
    if (m) return `${mdyMatch[3]}-${m}-${mdyMatch[2].padStart(2, '0')}`;
  }
  
  // Try native Date parse as fallback
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  
  return null;
};


// ─── FILE CLASSIFICATION ──────────────────────────────────────────────────────

/**
 * Classify a set of headers against known report signatures.
 * Returns the best-matching signature or null.
 */
const classifyHeaders = (headers) => {
  if (!headers || headers.length === 0) return null;
  
  // Normalize headers for matching
  const normalizedHeaders = headers.map(h => String(h || '').trim());
  
  let bestMatch = null;
  let bestScore = 0;
  
  for (const sig of REPORT_SIGNATURES) {
    const requiredMatches = sig.required.filter(req => 
      normalizedHeaders.some(h => h.includes(req) || req.includes(h))
    );
    
    if (requiredMatches.length === sig.required.length) {
      // All required headers found — calculate score including optionals
      const optionalMatches = (sig.optional || []).filter(opt =>
        normalizedHeaders.some(h => h.includes(opt) || opt.includes(h))
      );
      const score = requiredMatches.length * 10 + optionalMatches.length;
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = sig;
      }
    }
  }
  
  return bestMatch;
};

/**
 * For Google/Meta XLSX exports that have metadata rows before headers,
 * find the actual header row by looking for the row with the most non-empty cells.
 */
const findHeaderRow = (rows, maxScan = 5) => {
  let bestRow = 0;
  let bestCount = 0;
  
  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    const row = rows[i];
    if (!row) continue;
    const nonEmpty = row.filter(v => v !== null && v !== undefined && String(v).trim() !== '').length;
    if (nonEmpty > bestCount) {
      bestCount = nonEmpty;
      bestRow = i;
    }
  }
  
  return bestRow;
};


// ─── TIER 1 PARSERS ──────────────────────────────────────────────────────────
// These return { dailyRecords: { [date]: { ... } }, reportMeta: { ... } }

/**
 * Parse Amazon Daily Aggregate XLSX
 * Input: rows from "Ads data" xlsx file
 * Output: daily records with ad metrics for merging into dailySales
 */
const parseAmazonDailyAggregate = (rows, headers) => {
  const colIdx = {};
  headers.forEach((h, i) => { colIdx[String(h).trim()] = i; });
  
  const dailyRecords = {};
  let totalSpend = 0, totalRev = 0, dayCount = 0;
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const date = parseDate(row[colIdx['date']]);
    if (!date) continue;
    
    const spend = num(row[colIdx['Spend']]);
    const revenue = num(row[colIdx['Revenue']]);
    const orders = num(row[colIdx['Orders']]);
    const conversions = num(row[colIdx['Conversions']]);
    const roas = num(row[colIdx['ROAS']]);
    const acos = num(row[colIdx['ACOS']]);
    const impressions = num(row[colIdx['Impressions']]);
    const clicks = num(row[colIdx['Clicks']]);
    const ctr = num(row[colIdx['CTR']]);
    const cpc = num(row[colIdx['Avg CPC']]);
    const convRate = num(row[colIdx['Conv Rate']]);
    const tacos = num(row[colIdx['Total ACOS (TACOS)']]);
    const totalUnits = num(row[colIdx['Total Units Ordered']]);
    const totalRevenue = num(row[colIdx['Total Revenue']]);
    
    dailyRecords[date] = {
      amazonAdsMetrics: {
        spend, revenue, orders, conversions, roas, acos,
        impressions, clicks, ctr, cpc, convRate,
        tacos, totalUnits, totalRevenue,
      }
    };
    
    totalSpend += spend;
    totalRev += revenue;
    dayCount++;
  }
  
  return {
    dailyRecords,
    reportMeta: {
      type: 'amazon_daily_aggregate',
      platform: 'amazon',
      tier: 1,
      days: dayCount,
      dateRange: Object.keys(dailyRecords).sort(),
      totalSpend,
      totalRevenue: totalRev,
    }
  };
};

/**
 * Parse Google Ads Daily CSV
 * Per-ad-per-day rows → aggregated to daily totals
 */
const parseGoogleDaily = (rows, headers) => {
  const colIdx = {};
  headers.forEach((h, i) => { colIdx[String(h).trim()] = i; });
  
  const dayMap = {};
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const date = parseDate(row[colIdx['Day']]);
    if (!date) continue;
    
    if (!dayMap[date]) {
      dayMap[date] = { spend: 0, convValue: 0, conversions: 0, impressions: 0, clicks: 0 };
    }
    
    dayMap[date].spend += num(row[colIdx['Cost']]);
    dayMap[date].convValue += num(row[colIdx['All conv. value']]);
    dayMap[date].conversions += num(row[colIdx['Conversions']]);
    dayMap[date].impressions += num(row[colIdx['Impressions']]);
    dayMap[date].clicks += num(row[colIdx['Clicks']]);
  }
  
  const dailyRecords = {};
  let totalSpend = 0;
  
  for (const [date, agg] of Object.entries(dayMap)) {
    dailyRecords[date] = {
      shopify: {
        googleSpend: agg.spend,
        adsMetrics: {
          googleImpressions: agg.impressions,
          googleClicks: agg.clicks,
          googleConversions: agg.conversions,
          googleConvValue: agg.convValue,
          googleCPC: agg.clicks > 0 ? agg.spend / agg.clicks : 0,
          googleCTR: agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0,
          googleCostPerConv: agg.conversions > 0 ? agg.spend / agg.conversions : 0,
          googleROAS: agg.spend > 0 ? agg.convValue / agg.spend : 0,
        }
      }
    };
    totalSpend += agg.spend;
  }
  
  return {
    dailyRecords,
    reportMeta: {
      type: 'google_daily',
      platform: 'google',
      tier: 1,
      days: Object.keys(dailyRecords).length,
      dateRange: Object.keys(dailyRecords).sort(),
      totalSpend,
    }
  };
};

/**
 * Parse Meta Ads Daily CSV
 * Per-ad-per-day rows → aggregated to daily totals
 */
const parseMetaDaily = (rows, headers) => {
  const colIdx = {};
  headers.forEach((h, i) => { colIdx[String(h).trim()] = i; });
  
  const dayMap = {};
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const date = parseDate(row[colIdx['Date']]);
    if (!date) continue;
    
    if (!dayMap[date]) {
      dayMap[date] = { spend: 0, purchaseValue: 0, purchases: 0, impressions: 0, clicks: 0 };
    }
    
    dayMap[date].spend += num(row[colIdx['Amount spent']]);
    dayMap[date].purchaseValue += num(row[colIdx['Purchases value (all)']]);
    dayMap[date].purchases += num(row[colIdx['Purchases (all)']]);
    dayMap[date].impressions += num(row[colIdx['Impressions']]);
    dayMap[date].clicks += num(row[colIdx['Link clicks']]);
  }
  
  const dailyRecords = {};
  let totalSpend = 0;
  
  for (const [date, agg] of Object.entries(dayMap)) {
    dailyRecords[date] = {
      shopify: {
        metaSpend: agg.spend,
        adsMetrics: {
          metaImpressions: agg.impressions,
          metaClicks: agg.clicks,
          metaPurchases: agg.purchases,
          metaPurchaseValue: agg.purchaseValue,
          metaCPC: agg.clicks > 0 ? agg.spend / agg.clicks : 0,
          metaCTR: agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0,
          metaCPM: agg.impressions > 0 ? (agg.spend / agg.impressions) * 1000 : 0,
          metaROAS: agg.spend > 0 ? agg.purchaseValue / agg.spend : 0,
        }
      }
    };
    totalSpend += agg.spend;
  }
  
  return {
    dailyRecords,
    reportMeta: {
      type: 'meta_daily',
      platform: 'meta',
      tier: 1,
      days: Object.keys(dailyRecords).length,
      dateRange: Object.keys(dailyRecords).sort(),
      totalSpend,
    }
  };
};

const TIER1_PARSERS = {
  amazon_daily_aggregate: parseAmazonDailyAggregate,
  google_daily: parseGoogleDaily,
  meta_daily: parseMetaDaily,
};


// ─── TIER 2 GENERIC PARSER ───────────────────────────────────────────────────
// For Tier 2, we store the raw parsed rows with headers for AI report generation.
// The AI prompt builder will format this data contextually.

const parseTier2Generic = (rows, headers, signature) => {
  const colIdx = {};
  headers.forEach((h, i) => { colIdx[String(h).trim()] = i; });
  
  // Parse all rows into objects
  const records = [];
  let totalSpend = 0;
  let dateRange = [];
  
  // Find the spend column (varies by report)
  const spendCol = headers.findIndex(h => {
    const hn = String(h || '').trim().toLowerCase();
    return hn === 'spend' || hn === 'cost' || hn === 'amount spent (usd)' || hn === 'amount spent';
  });
  
  // Find date column
  const dateCol = headers.findIndex(h => {
    const hn = String(h || '').trim().toLowerCase();
    return hn === 'date' || hn === 'day' || hn === 'reporting starts';
  });
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const record = {};
    headers.forEach((h, j) => {
      const key = String(h || '').trim();
      if (key) record[key] = row[j];
    });
    records.push(record);
    
    if (spendCol >= 0) totalSpend += num(row[spendCol]);
    if (dateCol >= 0) {
      const d = parseDate(row[dateCol]);
      if (d) dateRange.push(d);
    }
  }
  
  dateRange = [...new Set(dateRange)].sort();
  
  return {
    records,
    headers: headers.map(h => String(h || '').trim()).filter(Boolean),
    reportMeta: {
      type: signature.id,
      platform: signature.platform,
      tier: 2,
      label: signature.label,
      rows: records.length,
      columns: headers.length,
      dateRange: dateRange.length > 0 ? dateRange : undefined,
      totalSpend: totalSpend > 0 ? totalSpend : undefined,
      uploadedAt: new Date().toISOString(),
    }
  };
};


// ─── SINGLE FILE PARSER ──────────────────────────────────────────────────────

/**
 * Parse a single file (CSV or XLSX sheet data).
 * Returns { tier, reportType, data, meta } or null if unrecognized.
 */
const parseSingleSheet = (allRows, fileName) => {
  if (!allRows || allRows.length < 2) return [];
  
  // Find the header row (Google/Meta XLSX have metadata rows before headers)
  const headerRowIdx = findHeaderRow(allRows);
  const headers = allRows[headerRowIdx].map(v => String(v || '').trim());
  const dataRows = allRows.slice(headerRowIdx + 1);
  
  // For Search Query Performance, the actual headers are in row 2 (row 1 is metadata)
  // Check if row 0 looks like metadata (few columns with "Brand=..." format)
  let actualHeaders = headers;
  let actualDataRows = dataRows;
  
  if (headers.some(h => h.includes('Brand=') || h.includes('Reporting Range='))) {
    // SQP format: row 0 = metadata, row 1 = headers, row 2+ = data
    if (allRows.length > 2) {
      actualHeaders = allRows[1].map(v => String(v || '').trim());
      actualDataRows = allRows.slice(2);
    }
  }
  
  // Classify the report
  const signature = classifyHeaders(actualHeaders);
  
  if (!signature) {
    // Try with original headers as fallback
    const sig2 = classifyHeaders(headers);
    if (sig2) {
      return parseSingleSheet_inner(sig2, headers, dataRows, fileName);
    }
    return [{ 
      unrecognized: true, 
      fileName, 
      headers: actualHeaders.slice(0, 10),
      rowCount: actualDataRows.length 
    }];
  }
  
  return parseSingleSheet_inner(signature, actualHeaders, actualDataRows, fileName);
};

const parseSingleSheet_inner = (signature, headers, dataRows, fileName) => {
  const results = [];
  
  if (signature.tier === 1) {
    const parser = TIER1_PARSERS[signature.id];
    if (parser) {
      const result = parser(dataRows, headers);
      results.push({
        tier: 1,
        reportType: signature.id,
        platform: signature.platform,
        label: signature.label,
        data: result.dailyRecords,
        meta: result.reportMeta,
        fileName,
      });
      
      // For google_daily and meta_daily, ALSO emit Tier 2 with campaign-level detail
      // so the comprehensive AI prompt can analyze individual campaigns
      if (signature.id === 'google_daily' || signature.id === 'meta_daily') {
        const t2Label = signature.id === 'google_daily' ? 'Google Daily Campaign Detail' : 'Meta Daily Campaign Detail';
        const t2Id = signature.id + '_detail';
        const t2sig = { ...signature, id: t2Id, tier: 2, label: t2Label };
        const t2result = parseTier2Generic(dataRows, headers, t2sig);
        results.push({
          tier: 2,
          reportType: t2Id,
          platform: signature.platform,
          label: t2Label,
          data: t2result.records,
          headers: t2result.headers,
          meta: t2result.reportMeta,
          fileName,
        });
      }
      
      return results;
    }
  }
  
  // Tier 2 — generic parse
  const result = parseTier2Generic(dataRows, headers, signature);
  results.push({
    tier: 2,
    reportType: signature.id,
    platform: signature.platform,
    label: signature.label,
    data: result.records,
    headers: result.headers,
    meta: result.reportMeta,
    fileName,
  });
  return results;
};


// ─── MAIN ENTRY POINTS ──────────────────────────────────────────────────────

/**
 * Parse a CSV string into rows.
 */
const parseCSVString = (csvText) => {
  const rows = [];
  let current = '';
  let inQuotes = false;
  let row = [];
  
  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    
    if (ch === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      row.push(current.trim());
      current = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && csvText[i + 1] === '\n') i++;
      row.push(current.trim());
      if (row.some(v => v !== '')) rows.push(row);
      row = [];
      current = '';
    } else {
      current += ch;
    }
  }
  
  // Last row
  row.push(current.trim());
  if (row.some(v => v !== '')) rows.push(row);
  
  return rows;
};

/**
 * Parse a single file (CSV or XLSX) from a File object or ArrayBuffer.
 * Returns array of parsed results (one per sheet for XLSX).
 */
export const parseFile = async (file) => {
  const results = [];
  const fileName = file.name || 'unknown';
  const ext = fileName.split('.').pop().toLowerCase();
  
  if (ext === 'csv' || ext === 'tsv') {
    const text = await file.text();
    const rows = parseCSVString(text);
    const sheetResults = parseSingleSheet(rows, fileName);
    results.push(...sheetResults);
  } else if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      if (rows.length > 1) {
        const sheetResults = parseSingleSheet(rows, `${fileName} [${sheetName}]`);
        results.push(...sheetResults);
      }
    }
  }
  
  return results;
};

/**
 * Parse a ZIP file containing CSVs and XLSXs.
 * Requires JSZip to be available globally or imported.
 * Returns array of parsed results.
 */
export const parseZipFile = async (file, JSZip) => {
  const results = [];
  
  try {
    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    
    const entries = Object.entries(zip.files).filter(([name, entry]) => {
      if (entry.dir) return false;
      if (name.startsWith('__MACOSX') || name.startsWith('.')) return false;
      const ext = name.split('.').pop().toLowerCase();
      return ['csv', 'tsv', 'xlsx', 'xls'].includes(ext);
    });
    
    for (const [name, entry] of entries) {
      const ext = name.split('.').pop().toLowerCase();
      const shortName = name.split('/').pop();
      
      try {
        if (ext === 'csv' || ext === 'tsv') {
          const text = await entry.async('string');
          const rows = parseCSVString(text);
          const sheetResults = parseSingleSheet(rows, shortName);
          results.push(...sheetResults);
        } else {
          const buffer = await entry.async('arraybuffer');
          const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
          
          for (const sheetName of wb.SheetNames) {
            const ws = wb.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
            if (rows.length > 1) {
              const sheetResults = parseSingleSheet(rows, `${shortName}`);
              results.push(...sheetResults);
            }
          }
        }
      } catch (err) {
        console.warn(`Failed to parse ${name}:`, err);
        results.push({ unrecognized: true, fileName: shortName, error: err.message });
      }
    }
  } catch (err) {
    console.error('ZIP parse error:', err);
    throw err;
  }
  
  return results;
};

/**
 * Process an array of File objects (mixed CSV, XLSX, ZIP).
 * Returns { tier1Results, tier2Results, unrecognized, summary }
 */
export const processUploadedFiles = async (files, JSZip) => {
  const allResults = [];
  
  for (const file of files) {
    const ext = file.name.split('.').pop().toLowerCase();
    
    if (ext === 'zip') {
      if (!JSZip) {
        console.error('JSZip not available for ZIP processing');
        allResults.push({ unrecognized: true, fileName: file.name, error: 'ZIP processing unavailable' });
        continue;
      }
      const zipResults = await parseZipFile(file, JSZip);
      allResults.push(...zipResults);
    } else {
      const fileResults = await parseFile(file);
      allResults.push(...fileResults);
    }
  }
  
  // Separate by tier
  const tier1Results = allResults.filter(r => r.tier === 1);
  const tier2Results = allResults.filter(r => r.tier === 2);
  const unrecognized = allResults.filter(r => r.unrecognized);
  
  // Build summary
  const summary = {
    totalFiles: allResults.length,
    tier1: tier1Results.length,
    tier2: tier2Results.length,
    unrecognized: unrecognized.length,
    platforms: [...new Set(allResults.filter(r => r.platform).map(r => r.platform))],
    reportTypes: allResults.filter(r => r.reportType).map(r => ({
      type: r.reportType,
      label: r.label,
      platform: r.platform,
      tier: r.tier,
      fileName: r.fileName,
    })),
  };
  
  return { tier1Results, tier2Results, unrecognized, summary };
};


// ─── TIER 1 MERGE LOGIC ─────────────────────────────────────────────────────
// Merge Tier 1 daily records into existing dailySales data

/**
 * Merge Tier 1 parsed results into dailySales.
 * Returns updated dailySales object (does not mutate original).
 */
export const mergeTier1IntoDailySales = (dailySales, tier1Results) => {
  const updated = JSON.parse(JSON.stringify(dailySales || {}));
  
  for (const result of tier1Results) {
    if (!result.data) continue;
    
    for (const [date, record] of Object.entries(result.data)) {
      if (!updated[date]) {
        updated[date] = { amazon: {}, shopify: {} };
      }
      
      const day = updated[date];
      
      if (result.reportType === 'amazon_daily_aggregate') {
        // Merge Amazon ads metrics
        if (!day.amazonAdsMetrics) day.amazonAdsMetrics = {};
        Object.assign(day.amazonAdsMetrics, record.amazonAdsMetrics);
      }
      
      if (result.reportType === 'google_daily') {
        // Merge Google metrics into shopify
        if (!day.shopify) day.shopify = {};
        day.shopify.googleSpend = record.shopify.googleSpend;  // Replace with latest upload
        
        if (!day.shopify.adsMetrics) day.shopify.adsMetrics = {};
        // Overwrite with new data (more granular)
        Object.assign(day.shopify.adsMetrics, record.shopify.adsMetrics);
      }
      
      if (result.reportType === 'meta_daily') {
        // Merge Meta metrics into shopify
        if (!day.shopify) day.shopify = {};
        day.shopify.metaSpend = record.shopify.metaSpend;  // Replace with latest upload
        
        if (!day.shopify.adsMetrics) day.shopify.adsMetrics = {};
        Object.assign(day.shopify.adsMetrics, record.shopify.adsMetrics);
      }
    }
  }
  
  return updated;
};


// ─── TIER 2 STORAGE LOGIC ────────────────────────────────────────────────────

/**
 * Merge Tier 2 parsed results into adsIntelData.
 * Organized by platform > reportType with upload history.
 */
export const mergeTier2IntoIntelData = (existing, tier2Results) => {
  const updated = JSON.parse(JSON.stringify(existing || {}));
  
  for (const result of tier2Results) {
    if (!result.data || !result.reportType) continue;
    
    const platform = result.platform || 'other';
    if (!updated[platform]) updated[platform] = {};
    
    // Store by report type with metadata
    updated[platform][result.reportType] = {
      records: result.data,
      headers: result.headers,
      meta: result.meta,
      fileName: result.fileName,
      uploadedAt: new Date().toISOString(),
    };
  }
  
  // Update global metadata
  updated.lastUpdated = new Date().toISOString();
  updated.reportCount = Object.values(updated)
    .filter(v => typeof v === 'object' && !Array.isArray(v) && v !== null && v.records === undefined)
    .reduce((sum, platform) => sum + Object.keys(platform).filter(k => k !== 'lastUpdated' && k !== 'reportCount').length, 0);
  
  return updated;
};


// ─── AI REPORT PROMPT BUILDER ────────────────────────────────────────────────

/**
 * Build a comprehensive AI prompt from ALL available ads data (Tier 1 + Tier 2).
 * This feeds the AI report generator with maximum context.
 */
export const buildComprehensiveAdsPrompt = (adsIntelData, dailySalesSnippet, amazonCampaigns, options = {}) => {
  const clampLimit = (value, fallback) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback);
  const includeAllThreshold = clampLimit(options.includeAllThreshold, 25);
  const maxRowsPerReport = clampLimit(options.maxRowsPerReport, 20);
  const maxWasteRows = clampLimit(options.maxWasteRows, 12);
  const maxCampaignRows = clampLimit(options.maxCampaignRows, 15);
  const sections = [];
  
  sections.push(`You are an expert Amazon & DTC advertising strategist performing a comprehensive audit of Tallowbourn's advertising across all platforms. Provide specific, actionable recommendations with exact numbers. Do NOT be generic — reference specific campaigns, keywords, ASINs, placements, and metrics.`);
  
  // ── Tier 1: Daily performance context ──
  if (dailySalesSnippet && Object.keys(dailySalesSnippet).length > 0) {
    const dates = Object.keys(dailySalesSnippet).sort();
    const last30 = dates.slice(-30);
    let amzSpend = 0, amzRev = 0, googleSpend = 0, metaSpend = 0, shopRev = 0;
    
    last30.forEach(d => {
      const day = dailySalesSnippet[d];
      amzSpend += (day?.amazon?.adSpend || day?.amazonAdsMetrics?.spend || 0);
      amzRev += (day?.amazon?.revenue || 0);
      googleSpend += (day?.shopify?.googleSpend || 0);
      metaSpend += (day?.shopify?.metaSpend || 0);
      shopRev += (day?.shopify?.revenue || 0);
    });
    
    sections.push(`\n## LAST 30 DAYS OVERVIEW (from daily sales data)\n- Amazon: $${amzSpend.toFixed(0)} ad spend → $${amzRev.toFixed(0)} revenue (TACOS: ${amzRev > 0 ? ((amzSpend/amzRev)*100).toFixed(1) : 'N/A'}%)\n- Google: $${googleSpend.toFixed(0)} ad spend\n- Meta: $${metaSpend.toFixed(0)} ad spend\n- Shopify Revenue: $${shopRev.toFixed(0)}\n- Total Ad Spend: $${(amzSpend+googleSpend+metaSpend).toFixed(0)}\n- Total Revenue: $${(amzRev+shopRev).toFixed(0)}\n- Combined ROAS: ${(amzSpend+googleSpend+metaSpend) > 0 ? ((amzRev+shopRev)/(amzSpend+googleSpend+metaSpend)).toFixed(2) : 'N/A'}x`);
  }
  
  // ── Amazon SP-API campaign data ──
  if (amazonCampaigns?.campaigns?.length > 0) {
    const camps = amazonCampaigns.campaigns;
    const active = camps.filter(c => c.state === 'ENABLED');
    sections.push(`\n## AMAZON CAMPAIGNS (SP-API)\n${camps.length} total campaigns (${active.length} enabled)\n${camps.slice(0, maxCampaignRows).map(c => `- ${c.name}: ${c.state} | Budget: $${c.budget || 0} | Spend: $${(c.spend || 0).toFixed(2)} | ROAS: ${(c.roas || 0).toFixed(2)}x`).join('\n')}`);
  }
  
  // ── Tier 2: Deep analysis data ──
  if (adsIntelData) {
    for (const [platform, reports] of Object.entries(adsIntelData)) {
      if (platform === 'lastUpdated' || platform === 'reportCount') continue;
      if (typeof reports !== 'object') continue;
      
      for (const [reportType, reportData] of Object.entries(reports)) {
        if (!reportData?.records || !reportData?.headers) continue;
        
        const records = reportData.records;
        const label = reportData.meta?.label || reportType;
        const rowCount = records.length;
        
        sections.push(`\n## ${platform.toUpperCase()}: ${label} (${rowCount} rows, uploaded ${reportData.meta?.uploadedAt?.slice(0,10) || 'unknown'})`);
        
        // Provide summary + top records based on report type
        if (rowCount <= includeAllThreshold) {
          // Small dataset — include all records
          sections.push(`Headers: ${reportData.headers.join(' | ')}`);
          records.forEach(r => {
            const vals = reportData.headers.map(h => r[h] ?? '').join(' | ');
            sections.push(vals);
          });
        } else {
          // Large dataset — provide top performers and summary stats
          sections.push(`Headers: ${reportData.headers.join(' | ')}`);
          
          // Find spend column and sort by it
          const spendKey = reportData.headers.find(h => 
            /^(spend|cost|amount spent)/i.test(h)
          );
          
          if (spendKey) {
            const sorted = [...records].sort((a, b) => num(b[spendKey]) - num(a[spendKey]));
            const topCount = Math.min(maxRowsPerReport, rowCount);
            sections.push(`\nTop ${topCount} by spend:`);
            sorted.slice(0, topCount).forEach(r => {
              const vals = reportData.headers.map(h => r[h] ?? '').join(' | ');
              sections.push(vals);
            });
            
            // Also include worst performers (high spend, low ROAS)
            const salesKey = reportData.headers.find(h => /sales|revenue|conv.*value/i.test(h));
            
            if (salesKey) {
              const wasteful = sorted.filter(r => num(r[spendKey]) > 5 && num(r[salesKey]) === 0);
              if (wasteful.length > 0) {
                sections.push(`\nWasteful (spend > $5, zero sales): ${wasteful.length} entries`);
                wasteful.slice(0, maxWasteRows).forEach(r => {
                  const vals = reportData.headers.map(h => r[h] ?? '').join(' | ');
                  sections.push(vals);
                });
              }
            }
            
            if (rowCount > topCount) {
              sections.push(`\n... and ${rowCount - topCount} more rows`);
            }
          } else {
            // No spend column — just show first 30
            const topCount = Math.min(maxRowsPerReport, rowCount);
            sections.push(`\nFirst ${topCount} records:`);
            records.slice(0, topCount).forEach(r => {
              const vals = reportData.headers.map(h => r[h] ?? '').join(' | ');
              sections.push(vals);
            });
            if (rowCount > topCount) {
              sections.push(`\n... and ${rowCount - topCount} more rows`);
            }
          }
        }
      }
    }
  }
  
  sections.push(`\n## YOUR TASK\nGenerate a COMPREHENSIVE advertising audit covering:\n1. **Executive Summary** — overall health across all platforms, key wins and problems\n2. **Amazon PPC Analysis** — campaign efficiency, keyword winners/losers, placement strategy, ACOS trends\n3. **Google Ads Analysis** — campaign performance, search term quality, keyword opportunities\n4. **Meta Ads Analysis** — creative performance, audience insights, placement efficiency\n5. **Cross-Channel Insights** — budget allocation efficiency, overlap/cannibalization, attribution gaps\n6. **Immediate Actions** (do this week) — specific, numbered, with expected impact\n7. **Strategic Recommendations** (next 30 days) — budget shifts, new campaigns, testing ideas\n\nBe BRUTALLY specific. Reference actual campaign names, keywords, ASINs, ad names, and dollar amounts. Generic advice like "optimize your campaigns" is worthless.`);
  
  return sections.join('\n');
};


// ─── EXPORTS ─────────────────────────────────────────────────────────────────
export { classifyHeaders, parseDate, num, REPORT_SIGNATURES };
