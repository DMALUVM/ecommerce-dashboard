/**
 * adsCsvParser.js — Ads CSV Ingest (Google Campaign-grain + Meta Ad-grain)
 *
 * SPEC: Ads CSV Ingestion — Google (Campaign-grain) + Meta (Ad-grain)
 *
 * Google: Report Editor export at Campaign × Day grain. Captures all campaign
 * types including Performance Max. Has a 2-line preamble ("Google report" + date range).
 *
 * Meta: Standard daily table export at Ad × Day grain. Uses literal "null" strings
 * in 7+ columns when there are no conversions for a given ad/day.
 *
 * The deprecated Ad-grain Google export (Day, Campaign, Ad ID, Cost...) is REJECTED
 * because it silently excludes Performance Max spend (~48% of total).
 */

// ─── ERROR CLASSES ──────────────────────────────────────────────────────────

export class DeprecatedAdsCsvFormat extends Error {
  constructor() {
    super(
      'This is an Ad-grain Google export, which excludes Performance Max spend. ' +
      'Re-export from Report Editor at the Campaign × Day grain. See parser spec §1.'
    );
    this.name = 'DeprecatedAdsCsvFormat';
  }
}

export class UnknownAdsCsvFormat extends Error {
  constructor(hint) {
    super(`Unknown CSV format${hint ? ': ' + hint : ''}. Expected Google (Report Editor campaign-grain) or Meta (daily table) export.`);
    this.name = 'UnknownAdsCsvFormat';
  }
}

// ─── CSV TEXT PARSER ────────────────────────────────────────────────────────

export const parseCSV = (csvText) => {
  const rows = [];
  let current = '';
  let inQuotes = false;
  let row = [];

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    if (ch === '"') {
      if (inQuotes && csvText[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      row.push(current);
      current = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && csvText[i + 1] === '\n') i++;
      row.push(current);
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
      current = '';
    } else {
      current += ch;
    }
  }
  row.push(current);
  if (row.some(v => v.trim() !== '')) rows.push(row);
  return rows;
};

// ─── VALUE HELPERS ──────────────────────────────────────────────────────────

/**
 * Coerce a CSV cell to a number.
 *
 * @param {unknown} v        Raw cell value
 * @param {number|null} fallback  Value when the cell is empty / null / unparseable.
 *                                Use 0 for count fields, null for ratio fields.
 * @returns {number|null}
 */
export const toNum = (v, fallback = 0) => {
  if (v == null || v === '') return fallback;
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  const s = String(v).trim();
  if (s === '' || s === '-' || s === '--' || s === '—' || s === ' --') return fallback;
  if (/^null$/i.test(s)) return fallback;
  const cleaned = s.replace(/[$,%\s]/g, '');
  if (cleaned === '' || cleaned === '-') return fallback;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
};

export const num = (v) => toNum(v, 0);

export const parseDate = (val) => {
  if (!val) return null;
  if (typeof val === 'number') {
    const d = new Date((val - 25569) * 86400 * 1000);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  let s = String(val).trim();
  s = s.replace(/^[A-Za-z]+,\s*/, '');

  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const mdyMatch = s.match(/^(\w+)\s+(\d{1,2}),?\s*(\d{4})/);
  if (mdyMatch) {
    const months = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
                     jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
    const m = months[mdyMatch[1].toLowerCase().slice(0, 3)];
    if (m) return `${mdyMatch[3]}-${m}-${mdyMatch[2].padStart(2, '0')}`;
  }

  const usMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    return `${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`;
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
};

/**
 * Derive a campaign name from a Meta ad name.
 * First segment when split on ` - `. Handles "Manual Ad - creatorHandle" specially.
 */
export function deriveMetaCampaign(adName) {
  if (!adName) return adName || '';
  const parts = adName.split(' - ').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return adName;
  if (parts.length === 1) return parts[0];
  if (parts[0] === 'Manual Ad') return `Manual Ad - ${parts[1]}`;
  return parts[0];
}

// ─── PLATFORM DETECTION (first-3-lines) ─────────────────────────────────────

/**
 * Detect platform from raw CSV text. Reads first 3 lines.
 * @param {string} csvText
 * @returns {'google' | 'meta'}
 * @throws {DeprecatedAdsCsvFormat | UnknownAdsCsvFormat}
 */
export function detectPlatform(csvText) {
  const lines = csvText.split('\n', 4);
  const line1 = (lines[0] || '').trim();

  if (line1 === 'Google report') {
    const line3 = (lines[2] || '').trim();
    if (!line3.includes('Campaign type')) {
      throw new UnknownAdsCsvFormat('Google report detected but line 3 missing "Campaign type" column — may be an older export format.');
    }
    return 'google';
  }

  if (line1.startsWith('Day,Campaign,Ad ID,Cost')) {
    throw new DeprecatedAdsCsvFormat();
  }

  if (line1.startsWith('Date,Ad name,Amount spent')) {
    return 'meta';
  }

  throw new UnknownAdsCsvFormat(`First line: "${line1.slice(0, 80)}"`);
}

// ─── GOOGLE CAMPAIGN-GRAIN PARSER ───────────────────────────────────────────

const findCol = (colIdx, ...names) => {
  for (const n of names) { if (colIdx[n] !== undefined) return colIdx[n]; }
  return undefined;
};

/**
 * Parse Google Report Editor CSV (campaign × day grain) with 2-line preamble.
 * @param {string} csvText  Full CSV text including preamble
 * @returns {NormalizedAdRow[]}
 */
export function parseGoogleCampaignCsv(csvText) {
  const csvBody = csvText.split('\n').slice(2).join('\n');
  const allRows = parseCSV(csvBody);
  if (allRows.length < 2) return [];

  const headers = allRows[0].map(v => v.trim());
  const dataRows = allRows.slice(1);
  return parseGoogleCampaignRows(dataRows, headers);
}

/**
 * Parse Google campaign-grain rows from pre-split data (also used by XLSX path).
 */
export function parseGoogleCampaignRows(dataRows, headers) {
  const colIdx = {};
  headers.forEach((h, i) => { colIdx[h.trim()] = i; });

  const dateCol         = findCol(colIdx, 'Day', 'Date');
  const campaignCol     = findCol(colIdx, 'Campaign');
  const campaignTypeCol = findCol(colIdx, 'Campaign type');
  const currencyCol     = findCol(colIdx, 'Currency code');
  const costPerConvCol  = findCol(colIdx, 'Cost / all conv.', 'Cost / conv.');
  const imprCol         = findCol(colIdx, 'Impr.', 'Impressions');
  const clicksCol       = findCol(colIdx, 'Clicks');
  const convCol         = findCol(colIdx, 'All conv.', 'Conversions');
  const convValueCol    = findCol(colIdx, 'Conv. value', 'All conv. value');
  const costCol         = findCol(colIdx, 'Cost');

  const rows = [];
  for (const row of dataRows) {
    const date = parseDate(row[dateCol]);
    if (!date) continue;

    const spend = toNum(row[costCol], 0);
    const revenue = toNum(row[convValueCol], 0);
    const campaign = (row[campaignCol] || '').trim();

    rows.push({
      date,
      platform: 'google',
      campaign,
      campaign_type: campaignTypeCol !== undefined ? (row[campaignTypeCol] || '').trim() || null : null,
      ad_identifier: campaign,
      ad_name: null,
      spend,
      revenue,
      conversions: toNum(row[convCol], 0),
      cost_per_conversion: toNum(row[costPerConvCol], null),
      roas: spend > 0 ? revenue / spend : null,
      impressions: toNum(row[imprCol], 0),
      clicks: toNum(row[clicksCol], 0),
      ctr_pct: null,
      cpc: null,
      cpm: null,
      currency: currencyCol !== undefined ? (row[currencyCol] || 'USD').trim() : 'USD',
    });
  }
  return rows;
}

// ─── META AD-GRAIN PARSER ───────────────────────────────────────────────────

/**
 * Parse Meta daily table CSV (ad × day grain).
 * @param {string} csvText  Full CSV text (no preamble)
 * @returns {NormalizedAdRow[]}
 */
export function parseMetaAdsCsv(csvText) {
  const allRows = parseCSV(csvText);
  if (allRows.length < 2) return [];

  const headers = allRows[0].map(v => v.trim());
  const dataRows = allRows.slice(1);
  return parseMetaAdsRows(dataRows, headers);
}

/**
 * Parse Meta ad-grain rows from pre-split data (also used by XLSX path).
 */
export function parseMetaAdsRows(dataRows, headers) {
  const colIdx = {};
  headers.forEach((h, i) => { colIdx[h.trim()] = i; });

  const dateCol          = findCol(colIdx, 'Date', 'date');
  const adNameCol        = findCol(colIdx, 'Ad name', 'Ad Name');
  const spendCol         = findCol(colIdx, 'Amount spent', 'Amount Spent (USD)', 'Spend');
  const purchaseValueCol = findCol(colIdx, 'Value:Paid Purchases', 'Purchases value (all)', 'Purchase Value');
  const purchasesCol     = findCol(colIdx, 'Paid Purchases', 'Purchases (all)', 'Purchases', 'Website Purchases', 'Results');
  const costPerPurchCol  = findCol(colIdx, 'Cost:Paid Purchases', 'Cost per purchase');
  const roasCol          = findCol(colIdx, 'Purchase (ROAS) (all)', 'Purchase ROAS', 'ROAS');
  const impressionsCol   = findCol(colIdx, 'Impressions');
  const clicksCol        = findCol(colIdx, 'Link clicks', 'Link Clicks', 'Clicks (all)', 'Clicks');
  const ctrCol           = findCol(colIdx, 'CTR (all)', 'CTR');
  const cpcCol           = findCol(colIdx, 'Cost per link click', 'CPC');
  const cpmCol           = findCol(colIdx, 'CPM');

  const rows = [];
  for (const row of dataRows) {
    const date = parseDate(row[dateCol]);
    if (!date) continue;

    const adName = adNameCol !== undefined ? (row[adNameCol] || '').trim() : '';
    const spend = toNum(row[spendCol], 0);
    let revenue = toNum(row[purchaseValueCol], 0);
    if (revenue === 0 && roasCol !== undefined && spend > 0) {
      const roas = toNum(row[roasCol], null);
      if (roas !== null) revenue = spend * roas;
    }

    rows.push({
      date,
      platform: 'meta',
      campaign: deriveMetaCampaign(adName),
      campaign_type: null,
      ad_identifier: adName,
      ad_name: adName,
      spend,
      revenue,
      conversions: toNum(row[purchasesCol], 0),
      cost_per_conversion: toNum(row[costPerPurchCol], null),
      roas: toNum(row[roasCol], null),
      impressions: toNum(row[impressionsCol], 0),
      clicks: toNum(row[clicksCol], 0),
      ctr_pct: toNum(row[ctrCol], null),
      cpc: toNum(row[cpcCol], null),
      cpm: toNum(row[cpmCol], null),
      currency: 'USD',
    });
  }
  return rows;
}

// ─── PUBLIC ENTRY POINT ─────────────────────────────────────────────────────

/**
 * Parse a Google or Meta ads CSV.
 * @param {string} csvText  Full file contents
 * @returns {{ platform: 'google'|'meta', rows: NormalizedAdRow[], totalSpend: number, rowCount: number, dateRange: {start:string, end:string}|null }}
 * @throws {DeprecatedAdsCsvFormat | UnknownAdsCsvFormat}
 */
export function parseAdsCsv(csvText) {
  const platform = detectPlatform(csvText);
  const rows = platform === 'google'
    ? parseGoogleCampaignCsv(csvText)
    : parseMetaAdsCsv(csvText);

  let totalSpend = 0;
  let minDate = null, maxDate = null;
  for (const r of rows) {
    totalSpend += r.spend;
    if (!minDate || r.date < minDate) minDate = r.date;
    if (!maxDate || r.date > maxDate) maxDate = r.date;
  }

  return {
    platform,
    rows,
    totalSpend,
    rowCount: rows.length,
    dateRange: minDate ? { start: minDate, end: maxDate } : null,
  };
}

// ─── RECONCILIATION GUARDRAIL (§6.9) ────────────────────────────────────────

/**
 * Check that the parsed spend total is within 0.5% of the expected total.
 * @param {number} csvTotal
 * @param {number} expectedTotal  User-supplied expected total (optional)
 * @returns {{ ok: boolean, diff: number, pct: number, message: string }}
 */
export function checkReconciliation(csvTotal, expectedTotal) {
  if (!expectedTotal || expectedTotal <= 0) {
    return { ok: true, diff: 0, pct: 0, message: `Ingested $${csvTotal.toFixed(2)} — verify this matches your ads platform UI.` };
  }
  const diff = Math.abs(csvTotal - expectedTotal);
  const pct = (diff / expectedTotal) * 100;
  if (pct > 0.5) {
    return {
      ok: false, diff, pct,
      message: `Spend mismatch: CSV total $${csvTotal.toFixed(2)} vs expected $${expectedTotal.toFixed(2)} (${pct.toFixed(2)}% off). Threshold is 0.5%.`,
    };
  }
  return { ok: true, diff, pct, message: `Spend reconciled: $${csvTotal.toFixed(2)} (${pct.toFixed(3)}% variance).` };
}

// ─── DAILY AGGREGATION (for dashboard display) ──────────────────────────────

/**
 * Aggregate per-row NormalizedAdRow[] into per-day totals for dashboard display.
 * Produces the same shape expected by adsReportParser.js merge logic and AdsView.
 */
export function aggregateRowsByDay(rows) {
  if (!rows || rows.length === 0) return { dailyData: {}, platform: null, totalSpend: 0, daysCount: 0 };

  const platform = rows[0].platform;
  const dayMap = {};

  for (const r of rows) {
    if (!dayMap[r.date]) {
      dayMap[r.date] = { spend: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0 };
    }
    const d = dayMap[r.date];
    d.spend += r.spend;
    d.revenue += r.revenue;
    d.conversions += r.conversions;
    d.impressions += r.impressions;
    d.clicks += r.clicks;
  }

  const dailyData = {};
  let totalSpend = 0;
  for (const [date, agg] of Object.entries(dayMap)) {
    if (platform === 'google') {
      dailyData[date] = {
        date,
        spend: agg.spend,
        impressions: agg.impressions,
        clicks: agg.clicks,
        conversions: agg.conversions,
        convValue: agg.revenue,
        ctr: agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0,
        cpc: agg.clicks > 0 ? agg.spend / agg.clicks : 0,
        costPerConv: agg.conversions > 0 ? agg.spend / agg.conversions : 0,
        roas: agg.spend > 0 ? agg.revenue / agg.spend : 0,
      };
    } else {
      dailyData[date] = {
        date,
        spend: agg.spend,
        impressions: agg.impressions,
        clicks: agg.clicks,
        purchases: agg.conversions,
        purchaseValue: agg.revenue,
        ctr: agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0,
        cpc: agg.clicks > 0 ? agg.spend / agg.clicks : 0,
        cpm: agg.impressions > 0 ? (agg.spend / agg.impressions) * 1000 : 0,
        roas: agg.spend > 0 ? agg.revenue / agg.spend : 0,
      };
    }
    totalSpend += agg.spend;
  }

  const dates = Object.keys(dailyData).sort();
  return {
    platform,
    dailyData,
    totalSpend,
    daysCount: dates.length,
    dateRange: dates.length > 0 ? { start: dates[0], end: dates[dates.length - 1] } : null,
  };
}

// ─── BACKWARD-COMPAT WRAPPERS (for adsReportParser.js XLSX path) ────────────

/**
 * Parse Google rows from pre-split data. Used by adsReportParser for XLSX files.
 * Rejects deprecated Ad-grain format (has 'Ad ID' column).
 */
export function parseGoogleRows(dataRows, headers) {
  const headerSet = new Set(headers.map(h => String(h).trim()));
  if (headerSet.has('Ad ID')) throw new DeprecatedAdsCsvFormat();

  if (headerSet.has('Campaign type')) {
    const rows = parseGoogleCampaignRows(dataRows, headers);
    return aggregateRowsByDay(rows);
  }

  // Legacy fallback for sheets without Campaign type — parse best-effort
  const rows = parseGoogleCampaignRows(dataRows, headers);
  return aggregateRowsByDay(rows);
}

/**
 * Parse Meta rows from pre-split data. Used by adsReportParser for XLSX files.
 */
export function parseMetaRows(dataRows, headers) {
  const rows = parseMetaAdsRows(dataRows, headers);
  return aggregateRowsByDay(rows);
}

// ─── SANITIZE CLOUD DATA ───────────────────────────────────────────────────

/**
 * Sanitize a day record loaded from Supabase / localStorage.
 * Coerces any lingering string "null" or NaN values in ads metrics to 0.
 */
export const sanitizeDayAdsMetrics = (day) => {
  if (!day) return day;
  const numFields = [
    'metaSpend', 'googleSpend', 'metaAds', 'googleAds',
    'metaImpressions', 'googleImpressions', 'metaClicks', 'googleClicks',
    'metaPurchases', 'metaConversions', 'googleConversions',
    'metaPurchaseValue', 'metaCpc', 'metaCpa', 'googleCpc', 'googleCpa',
  ];
  for (const k of numFields) {
    if (k in day && typeof day[k] !== 'number') day[k] = toNum(day[k], 0);
    if (k in day && !Number.isFinite(day[k])) day[k] = 0;
  }
  const am = day.shopify?.adsMetrics;
  if (am) {
    for (const k of Object.keys(am)) {
      if (typeof am[k] !== 'number') am[k] = toNum(am[k], 0);
      if (!Number.isFinite(am[k])) am[k] = 0;
    }
  }
  return day;
};
