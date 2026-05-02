/**
 * adsCsvParser.js — Shared Ads CSV Parser (Google + Meta)
 *
 * Single source of truth for parsing Google/Meta ad CSV data.
 * Used by: adsReportParser.js (Ads view upload), AdsBulkUploadModal.jsx (Settings bulk import)
 *
 * Handles: auto-detection, flexible column aliases, CTR normalization,
 * Meta "null" strings, Google Ad ID as string, date parsing with quoted commas.
 */

// ─── CSV TEXT PARSER (handles quoted fields with commas) ────────────────────

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
  row.push(current.trim());
  if (row.some(v => v !== '')) rows.push(row);
  return rows;
};

// ─── HEADER ROW DETECTION ───────────────────────────────────────────────────

export const findHeaderRow = (rows, maxScan = 5) => {
  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    const cols = (rows[i] || []).map(v => String(v || '').toLowerCase().trim());
    if (cols.some(h => h === 'date' || h === 'day')) return i;
  }
  let bestRow = 0, bestCount = 0;
  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    const count = (rows[i] || []).filter(v => v != null && String(v).trim() !== '').length;
    if (count > bestCount) { bestCount = count; bestRow = i; }
  }
  return bestRow;
};

// ─── PLATFORM DETECTION ─────────────────────────────────────────────────────

const GOOGLE_TRIPLET = ['Cost', 'All conv. value', 'Conv. value / cost'];
const META_TRIPLET = ['Amount spent', 'Value:Paid Purchases', 'Purchase (ROAS) (all)'];

export const detectPlatform = (headers) => {
  const trimmed = headers.map(h => String(h || '').trim());
  const hasAll = (needles) => needles.every(n => trimmed.some(h => h === n));

  if (hasAll(GOOGLE_TRIPLET)) return 'google';
  if (hasAll(META_TRIPLET)) return 'meta';

  const lc = trimmed.map(h => h.toLowerCase());
  if (lc.includes('day') && lc.includes('campaign') && lc.includes('cost')) return 'google';
  if (lc.some(h => h.includes('amount spent')) && lc.some(h => h.includes('ad name'))) return 'meta';
  if (lc.includes('cost') && lc.some(h => h.includes('avg') && h.includes('cpc'))) return 'google';

  return null;
};

// ─── VALUE HELPERS ──────────────────────────────────────────────────────────

/**
 * Coerce any CSV cell value to a finite number.
 * Meta exports literal "null" strings in 7+ columns when there are no conversions
 * for a given ad/day. This must always produce a finite number — never NaN,
 * never the string "null", never undefined.
 */
export const toNum = (v) => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v).trim();
  if (s === '' || s === '-' || s === '—') return 0;
  if (/^null$/i.test(s)) return 0;
  const n = Number(s.replace(/[$,%]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export const num = toNum;

/**
 * Sanitize a day record loaded from Supabase / localStorage.
 * Coerces any lingering string "null" or NaN values in ads metrics to 0.
 * Call this on every day record after loading from cloud to prevent
 * string concatenation bugs in the accumulator loops.
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
    if (k in day && typeof day[k] !== 'number') day[k] = toNum(day[k]);
    if (k in day && !Number.isFinite(day[k])) day[k] = 0;
  }
  const am = day.shopify?.adsMetrics;
  if (am) {
    for (const k of Object.keys(am)) {
      if (typeof am[k] !== 'number') am[k] = toNum(am[k]);
      if (!Number.isFinite(am[k])) am[k] = 0;
    }
  }
  return day;
};

export const parseDate = (val) => {
  if (!val) return null;
  if (typeof val === 'number') {
    const d = new Date((val - 25569) * 86400 * 1000);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  let s = String(val).trim();
  // Strip leading day-of-week: "Wednesday, Feb 6, 2026" → "Feb 6, 2026"
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

const findCol = (colIdx, ...names) => {
  for (const n of names) { if (colIdx[n] !== undefined) return colIdx[n]; }
  return undefined;
};

// ─── GOOGLE DAILY PARSER ────────────────────────────────────────────────────

export const parseGoogleRows = (dataRows, headers) => {
  const colIdx = {};
  headers.forEach((h, i) => { colIdx[String(h).trim()] = i; });

  const dateCol        = findCol(colIdx, 'Day', 'Date', 'day', 'date');
  const costCol        = findCol(colIdx, 'Cost', 'cost');
  const convValueCol   = findCol(colIdx, 'All conv. value', 'Conv. value', 'Conversion value');
  const conversionsCol = findCol(colIdx, 'Conversions', 'Conv.', 'conversions');
  const impressionsCol = findCol(colIdx, 'Impressions', 'Impr.', 'impressions');
  const clicksCol      = findCol(colIdx, 'Clicks', 'clicks');
  const cpcCol         = findCol(colIdx, 'Avg. CPC', 'Avg CPC', 'avg. cpc', 'avg cpc');
  const costPerConvCol = findCol(colIdx, 'Cost / conv.', 'Cost/conv.', 'Cost per conversion');

  const columnMapping = {
    'Cost':        costCol !== undefined ? headers[costCol] : 'NOT FOUND',
    'Conversions': conversionsCol !== undefined ? headers[conversionsCol] : 'NOT FOUND',
    'Conv. Value': convValueCol !== undefined ? headers[convValueCol] : 'NOT FOUND',
    'Impressions': impressionsCol !== undefined ? headers[impressionsCol] : 'NOT FOUND',
    'Clicks':      clicksCol !== undefined ? headers[clicksCol] : 'NOT FOUND',
    'CPC':         cpcCol !== undefined ? headers[cpcCol] : 'NOT FOUND',
  };

  const dayMap = {};
  let rowsParsed = 0, rowsSkipped = 0, totalSpend = 0;

  for (const row of dataRows) {
    const date = parseDate(row[dateCol]);
    if (!date) { rowsSkipped++; continue; }
    rowsParsed++;

    if (!dayMap[date]) {
      dayMap[date] = { spend: 0, convValue: 0, conversions: 0, impressions: 0, clicks: 0 };
    }
    const spend = num(row[costCol]);
    dayMap[date].spend += spend;
    dayMap[date].convValue += num(row[convValueCol]);
    dayMap[date].conversions += num(row[conversionsCol]);
    dayMap[date].impressions += num(row[impressionsCol]);
    dayMap[date].clicks += num(row[clicksCol]);
    totalSpend += spend;
  }

  const dailyData = {};
  for (const [date, agg] of Object.entries(dayMap)) {
    dailyData[date] = {
      date,
      spend:       agg.spend,
      impressions: agg.impressions,
      clicks:      agg.clicks,
      conversions: agg.conversions,
      convValue:   agg.convValue,
      ctr:         agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0,
      cpc:         agg.clicks > 0 ? agg.spend / agg.clicks : 0,
      costPerConv: agg.conversions > 0 ? agg.spend / agg.conversions : 0,
      roas:        agg.spend > 0 ? agg.convValue / agg.spend : 0,
    };
  }

  const dates = Object.keys(dailyData).sort();
  return {
    platform: 'google',
    dailyData,
    columnMapping,
    rowsParsed,
    rowsSkipped,
    totalSpend,
    dateRange: dates.length > 0 ? { start: dates[0], end: dates[dates.length - 1] } : null,
    daysCount: dates.length,
  };
};

// ─── META DAILY PARSER ──────────────────────────────────────────────────────

export const parseMetaRows = (dataRows, headers) => {
  const colIdx = {};
  headers.forEach((h, i) => { colIdx[String(h).trim()] = i; });

  const dateCol          = findCol(colIdx, 'Date', 'date');
  const spendCol         = findCol(colIdx, 'Amount spent', 'Amount Spent (USD)', 'Spend');
  const purchaseValueCol = findCol(colIdx, 'Value:Paid Purchases', 'Purchases value (all)', 'Purchase Value');
  const purchasesCol     = findCol(colIdx, 'Paid Purchases', 'Purchases (all)', 'Purchases', 'Website Purchases', 'Results');
  const roasCol          = findCol(colIdx, 'Purchase (ROAS) (all)', 'Purchase ROAS', 'ROAS');
  const impressionsCol   = findCol(colIdx, 'Impressions');
  const clicksCol        = findCol(colIdx, 'Link clicks', 'Link Clicks', 'Clicks (all)', 'Clicks');

  const columnMapping = {
    'Spend':          spendCol !== undefined ? headers[spendCol] : 'NOT FOUND',
    'Purchases':      purchasesCol !== undefined ? headers[purchasesCol] : 'NOT FOUND',
    'Purchase Value': purchaseValueCol !== undefined
      ? headers[purchaseValueCol]
      : (roasCol !== undefined ? `computed from ${headers[roasCol]}` : 'NOT FOUND'),
    'Impressions':    impressionsCol !== undefined ? headers[impressionsCol] : 'NOT FOUND',
    'Clicks':         clicksCol !== undefined ? headers[clicksCol] : 'NOT FOUND',
  };

  const dayMap = {};
  let rowsParsed = 0, rowsSkipped = 0, totalSpend = 0;

  for (const row of dataRows) {
    const date = parseDate(row[dateCol]);
    if (!date) { rowsSkipped++; continue; }
    rowsParsed++;

    if (!dayMap[date]) {
      dayMap[date] = { spend: 0, purchaseValue: 0, purchases: 0, impressions: 0, clicks: 0 };
    }

    const spend = num(row[spendCol]);
    dayMap[date].spend += spend;
    dayMap[date].impressions += num(row[impressionsCol]);
    dayMap[date].clicks += num(row[clicksCol]);
    dayMap[date].purchases += num(row[purchasesCol]);

    if (purchaseValueCol !== undefined) {
      dayMap[date].purchaseValue += num(row[purchaseValueCol]);
    } else if (roasCol !== undefined && spend > 0) {
      dayMap[date].purchaseValue += spend * num(row[roasCol]);
    }

    totalSpend += spend;
  }

  const dailyData = {};
  for (const [date, agg] of Object.entries(dayMap)) {
    dailyData[date] = {
      date,
      spend:         agg.spend,
      impressions:   agg.impressions,
      clicks:        agg.clicks,
      purchases:     agg.purchases,
      purchaseValue: agg.purchaseValue,
      ctr:           agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0,
      cpc:           agg.clicks > 0 ? agg.spend / agg.clicks : 0,
      cpm:           agg.impressions > 0 ? (agg.spend / agg.impressions) * 1000 : 0,
      roas:          agg.spend > 0 ? agg.purchaseValue / agg.spend : 0,
    };
  }

  const dates = Object.keys(dailyData).sort();
  return {
    platform: 'meta',
    dailyData,
    columnMapping,
    rowsParsed,
    rowsSkipped,
    totalSpend,
    dateRange: dates.length > 0 ? { start: dates[0], end: dates[dates.length - 1] } : null,
    daysCount: dates.length,
  };
};

// ─── HIGH-LEVEL: PARSE ADS CSV TEXT ─────────────────────────────────────────

export const parseAdsCsv = (csvText) => {
  const allRows = parseCSV(csvText);
  if (allRows.length < 2) return null;

  const headerIdx = findHeaderRow(allRows);
  const headers = allRows[headerIdx].map(v => String(v || '').trim());
  const dataRows = allRows.slice(headerIdx + 1);

  const platform = detectPlatform(headers);
  if (!platform) return null;

  if (platform === 'google') return parseGoogleRows(dataRows, headers);
  if (platform === 'meta') return parseMetaRows(dataRows, headers);
  return null;
};
