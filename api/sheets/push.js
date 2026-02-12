// =============================================================
// API Route: /api/sheets/push.js
// Push P&L data, weekly breakdown, and action items to Google Sheets
// Uses a Google Cloud Service Account (no OAuth needed)
// =============================================================
import { google } from 'googleapis';
import {
  applyCors,
  handlePreflight,
  requireMethod,
  enforceRateLimit,
  enforceUserAuth,
} from '../_lib/security.js';

// Service account credentials from environment
const CREDENTIALS = {
  client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  private_key: (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').replace(/\\n/g, '\n'),
};

function getAuth() {
  if (!CREDENTIALS.client_email || !CREDENTIALS.private_key) {
    throw new Error('Google Service Account credentials not configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_KEY in environment.');
  }
  return new google.auth.GoogleAuth({
    credentials: CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// ============ FORMAT DATA FOR SHEETS ============
function buildPnLSheet(weeklyData) {
  const weeks = Object.keys(weeklyData || {}).sort().reverse();
  if (!weeks.length) return [['No weekly data available']];

  const rows = [
    ['P&L Summary', '', '', '', '', '', '', ''],
    ['Week Ending', 'Revenue', 'COGS', 'Gross Profit', 'Ad Spend', '3PL + Storage', 'Net Profit', 'Net Margin %'],
  ];

  let totals = { revenue: 0, cogs: 0, adSpend: 0, fulfillment: 0, netProfit: 0 };

  for (const wk of weeks.slice(0, 52)) { // Last 52 weeks
    const w = weeklyData[wk];
    if (!w?.total) continue;
    const t = w.total;
    const sh = w.shopify || {};
    const fulfillment = (t.storageCost || 0) + (sh.threeplBreakdown ? Object.values(sh.threeplBreakdown).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0) : 0);
    const gross = (t.revenue || 0) - (t.cogs || 0);

    rows.push([
      wk,
      t.revenue || 0,
      t.cogs || 0,
      gross,
      t.adSpend || 0,
      fulfillment,
      t.netProfit || 0,
      t.netMargin ? `${t.netMargin.toFixed(1)}%` : '0%',
    ]);

    totals.revenue += t.revenue || 0;
    totals.cogs += t.cogs || 0;
    totals.adSpend += t.adSpend || 0;
    totals.fulfillment += fulfillment;
    totals.netProfit += t.netProfit || 0;
  }

  rows.push([]);
  rows.push([
    'TOTAL',
    totals.revenue,
    totals.cogs,
    totals.revenue - totals.cogs,
    totals.adSpend,
    totals.fulfillment,
    totals.netProfit,
    totals.revenue > 0 ? `${(totals.netProfit / totals.revenue * 100).toFixed(1)}%` : '0%',
  ]);

  return rows;
}

function buildChannelSheet(weeklyData) {
  const weeks = Object.keys(weeklyData || {}).sort().reverse();
  if (!weeks.length) return [['No data']];

  const rows = [
    ['Channel Breakdown', '', '', '', '', '', ''],
    ['Week', 'Amazon Rev', 'Amazon Ads', 'Amazon ROAS', 'Shopify Rev', 'DTC Ads', 'DTC ROAS'],
  ];

  for (const wk of weeks.slice(0, 52)) {
    const w = weeklyData[wk];
    if (!w?.total) continue;
    const az = w.amazon || {};
    const sh = w.shopify || {};
    const dtcAds = (sh.metaSpend || 0) + (sh.googleSpend || 0);

    rows.push([
      wk,
      az.revenue || 0,
      az.adSpend || 0,
      az.adSpend > 0 ? `${(az.revenue / az.adSpend).toFixed(2)}x` : '—',
      sh.revenue || 0,
      dtcAds,
      dtcAds > 0 ? `${(sh.revenue / dtcAds).toFixed(2)}x` : '—',
    ]);
  }

  return rows;
}

function buildActionsSheet(actionItems) {
  if (!actionItems?.length) return [['No action items']];

  const rows = [
    ['Action Items', '', '', '', ''],
    ['Status', 'Priority', 'Platform', 'Action', 'Created'],
  ];

  const statusOrder = { todo: 1, in_progress: 2, done: 3 };
  const sorted = [...actionItems].sort((a, b) => (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0));

  for (const item of sorted) {
    rows.push([
      (item.status || 'todo').replace('_', ' ').toUpperCase(),
      item.priority || 'medium',
      item.platform || '',
      item.text || '',
      item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '',
    ]);
  }

  return rows;
}

// ============ WRITE TO SHEETS ============
async function writeToSheet(auth, spreadsheetId, sheetName, data) {
  const sheets = google.sheets({ version: 'v4', auth });

  // Check if sheet exists, create if not
  try {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const existing = spreadsheet.data.sheets.map(s => s.properties.title);
    if (!existing.includes(sheetName)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: sheetName } } }],
        },
      });
    }
  } catch (err) {
    // If we can't read the spreadsheet, the service account might not have access
    if (err.code === 403 || err.code === 404) {
      throw new Error(`Cannot access spreadsheet. Make sure you've shared it with: ${CREDENTIALS.client_email}`);
    }
    throw err;
  }

  // Clear existing data
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${sheetName}!A:Z`,
  });

  // Write new data
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: data },
  });
}

// ============ MAIN HANDLER ============
export default async function handler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json({ error: 'Origin not allowed' });
  if (handlePreflight(req, res)) return;
  if (!requireMethod(req, res, 'POST')) return;
  if (!enforceRateLimit(req, res, 'sheets-push', { max: 20, windowMs: 60_000 })) return;

  const authUser = await enforceUserAuth(req, res);
  if (!authUser && res.writableEnded) return;

  const { spreadsheetId, weeklyData, actionItems, sheets: sheetConfig } = req.body;

  if (!spreadsheetId) {
    return res.status(400).json({ error: 'spreadsheetId is required' });
  }

  try {
    const auth = getAuth();
    const results = [];

    // Default: push all sheets
    const pushPnl = sheetConfig?.pnl !== false;
    const pushChannels = sheetConfig?.channels !== false;
    const pushActions = sheetConfig?.actions !== false;

    if (pushPnl && weeklyData) {
      const data = buildPnLSheet(weeklyData);
      await writeToSheet(auth, spreadsheetId, 'P&L', data);
      results.push({ sheet: 'P&L', rows: data.length });
    }

    if (pushChannels && weeklyData) {
      const data = buildChannelSheet(weeklyData);
      await writeToSheet(auth, spreadsheetId, 'Channels', data);
      results.push({ sheet: 'Channels', rows: data.length });
    }

    if (pushActions && actionItems?.length) {
      const data = buildActionsSheet(actionItems);
      await writeToSheet(auth, spreadsheetId, 'Actions', data);
      results.push({ sheet: 'Actions', rows: data.length });
    }

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
      results,
    });

  } catch (err) {
    console.error('Sheets push error:', err);
    return res.status(500).json({ error: err.message });
  }
}
