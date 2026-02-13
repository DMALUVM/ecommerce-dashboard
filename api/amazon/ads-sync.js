// Vercel Serverless Function - Amazon Ads API Sync (Comprehensive)
// Path: /api/amazon/ads-sync.js
//
// Pulls 8 report types from Amazon Advertising API v3:
//   SP Campaigns (daily)        → daily totals + allDaysData
//   SP Advertised Product       → SKU/ASIN-level ad spend ← KEY
//   SP Search Terms             → keyword optimization
//   SP Targeting                → bid/match type analysis
//   SP Campaign Placement       → top-of-search vs rest
//   SB Campaigns (daily)        → brand headline performance
//   SB Search Terms             → brand keyword insights
//   SD Campaigns (daily)        → display/retargeting + DPV
//
// Returns:
//   dailyData     → daily totals for allDaysData (spend, revenue, ACOS per day)
//   skuDailyData  → per-SKU ad spend per day (for SKU-level P&L tracking)
//   reports       → transformed rows matching Seller Central column names
//                   (feed directly into existing aggregator functions)
//   campaigns     → campaign-level summary with derived metrics
//   skuSummary    → SKU-level ad performance totals
//   summary       → totals, date range, report status

export const config = {
  maxDuration: 120,
  memory: 1024,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    adsClientId,
    adsClientSecret,
    adsRefreshToken,
    adsProfileId,
    syncType,        // 'test' | 'profiles' | 'campaigns' | 'daily'
    startDate,
    endDate,
    daysBack,
    pendingReports,  // For polling: [{ reportId, reportKey, status, downloadUrl }]
  } = req.body;

  if (!adsClientId || !adsClientSecret || !adsRefreshToken) {
    return res.status(400).json({ error: 'Missing Amazon Ads API credentials' });
  }

  const ADS_BASE = 'https://advertising-api.amazon.com';

  // ============ LWA Token Exchange ============
  const getAdsToken = async () => {
    const tokenRes = await fetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: adsRefreshToken,
        client_id: adsClientId,
        client_secret: adsClientSecret,
      }).toString(),
    });
    const text = await tokenRes.text();
    if (!tokenRes.ok) {
      let detail = text;
      try { detail = JSON.parse(text).error_description || text; } catch (e) {}
      throw new Error(`Ads LWA auth failed (${tokenRes.status}): ${detail}`);
    }
    const data = JSON.parse(text);
    if (!data.access_token) throw new Error('No access_token in LWA response');
    return data.access_token;
  };

  // ============ Ads API Request Helper ============
  const adsRequest = async (token, endpoint, method = 'GET', body = null) => {
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Amazon-Advertising-API-ClientId': adsClientId,
      'Content-Type': 'application/json',
    };
    if (adsProfileId) headers['Amazon-Advertising-API-Scope'] = adsProfileId;

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const response = await fetch(`${ADS_BASE}${endpoint}`, opts);
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ads API ${response.status}: ${errText.slice(0, 2000)}`);
    }
    const ct = response.headers.get('content-type') || '';
    return ct.includes('application/json') ? response.json() : response.text();
  };

  // ============ TEST CONNECTION ============
  if (syncType === 'test') {
    try {
      const token = await getAdsToken();
      const profiles = await adsRequest(token, '/v2/profiles');
      const usProfiles = profiles.filter(p => p.countryCode === 'US' && p.accountInfo?.type === 'seller');
      return res.status(200).json({
        success: true,
        profiles: profiles.map(p => ({
          profileId: String(p.profileId),
          countryCode: p.countryCode,
          accountType: p.accountInfo?.type,
          name: p.accountInfo?.name || p.accountInfo?.brandName || `Profile ${p.profileId}`,
          marketplaceId: p.accountInfo?.marketplaceStringId,
        })),
        recommended: usProfiles.length > 0 ? String(usProfiles[0].profileId) : (profiles.length > 0 ? String(profiles[0].profileId) : null),
      });
    } catch (err) {
      return res.status(200).json({ error: err.message });
    }
  }

  // ============ LIST PROFILES ============
  if (syncType === 'profiles') {
    try {
      const token = await getAdsToken();
      const profiles = await adsRequest(token, '/v2/profiles');
      return res.status(200).json({
        success: true,
        profiles: profiles.map(p => ({
          profileId: String(p.profileId),
          countryCode: p.countryCode,
          type: p.accountInfo?.type,
          name: p.accountInfo?.name || p.accountInfo?.brandName || `Profile ${p.profileId}`,
          marketplace: p.accountInfo?.marketplaceStringId,
        })),
      });
    } catch (err) {
      return res.status(200).json({ error: err.message });
    }
  }

  if (!adsProfileId) {
    return res.status(400).json({ error: 'Missing adsProfileId. Fetch profiles first.' });
  }

  let token;
  try { token = await getAdsToken(); }
  catch (err) { return res.status(401).json({ error: err.message }); }

  // ============ CAMPAIGN LIST (quick snapshot) ============
  if (syncType === 'campaigns') {
    try {
      const campaigns = { sp: [], sb: [], sd: [] };
      try {
        const d = await adsRequest(token, '/sp/campaigns/list', 'POST', { stateFilter: { include: ['ENABLED', 'PAUSED'] }, maxResults: 100 });
        campaigns.sp = (d.campaigns || []).map(c => ({ id: c.campaignId, name: c.name, state: c.state, budget: c.budget?.budget, budgetType: c.budget?.budgetType, targetingType: c.targetingType }));
      } catch (e) {}
      try {
        const d = await adsRequest(token, '/sb/v4/campaigns/list', 'POST', { stateFilter: { include: ['ENABLED', 'PAUSED'] }, maxResults: 100 });
        campaigns.sb = (d.campaigns || []).map(c => ({ id: c.campaignId, name: c.name, state: c.state, budget: c.budget?.budget }));
      } catch (e) {}
      try {
        const d = await adsRequest(token, '/sd/campaigns/list', 'POST', { stateFilter: { include: ['ENABLED', 'PAUSED'] }, maxResults: 100 });
        campaigns.sd = (d.campaigns || []).map(c => ({ id: c.campaignId, name: c.name, state: c.state, budget: c.budget?.budget, tactic: c.tactic }));
      } catch (e) {}
      return res.status(200).json({ success: true, syncType: 'campaigns', campaigns, total: campaigns.sp.length + campaigns.sb.length + campaigns.sd.length });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ============================================================
  // DAILY SYNC — Pull all 8 report types
  // ============================================================
  if (syncType === 'daily') {
    try {
      const days = Math.min(parseInt(daysBack) || 30, 60);
      const startDateObj = startDate ? new Date(startDate) : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const endDateObj = endDate ? new Date(endDate) : yesterday;
      const endFinal = endDateObj > yesterday ? yesterday : endDateObj;
      const startStr = startDateObj.toISOString().split('T')[0];
      const endStr = endFinal.toISOString().split('T')[0];

      console.log(`[AdsSync] Comprehensive daily sync: ${startStr} to ${endStr}`);

      // ---- If polling pending reports ----
      if (pendingReports && pendingReports.length > 0) {
        return await pollDownloadTransform(token, pendingReports, startStr, endStr, res);
      }

      // ---- Create all 8 report types ----
      const REPORT_SPECS = [
        // --- SP Reports (v3 column names) ---
        {
          key: 'spCampaigns',
          label: 'SP Campaigns',
          adProduct: 'SPONSORED_PRODUCTS',
          reportTypeId: 'spCampaigns',
          groupBy: ['campaign'],
          columns: ['campaignName', 'campaignId', 'campaignStatus', 'campaignBudgetAmount', 'campaignBudgetType',
            'date', 'impressions', 'clicks', 'cost', 'purchases7d', 'sales7d', 'unitsSoldClicks7d',
            'costPerClick', 'clickThroughRate'],
        },
        {
          key: 'spAdvertised',
          label: 'SP Advertised Product',
          adProduct: 'SPONSORED_PRODUCTS',
          reportTypeId: 'spAdvertisedProduct',
          groupBy: ['advertiser'],
          columns: ['campaignName', 'campaignId', 'adGroupName', 'adGroupId',
            'advertisedAsin', 'advertisedSku',
            'date', 'impressions', 'clicks', 'cost', 'purchases7d', 'sales7d', 'unitsSoldClicks7d',
            'costPerClick', 'clickThroughRate'],
        },
        {
          key: 'spSearchTerms',
          label: 'SP Search Terms',
          adProduct: 'SPONSORED_PRODUCTS',
          reportTypeId: 'spSearchTerm',
          groupBy: ['searchTerm'],
          columns: ['campaignName', 'campaignId', 'adGroupName', 'adGroupId',
            'keyword', 'keywordType', 'searchTerm', 'matchType',
            'date', 'impressions', 'clicks', 'cost', 'purchases7d', 'sales7d', 'unitsSoldClicks7d',
            'costPerClick', 'clickThroughRate'],
        },
        {
          key: 'spTargeting',
          label: 'SP Targeting',
          adProduct: 'SPONSORED_PRODUCTS',
          reportTypeId: 'spTargeting',
          groupBy: ['targeting'],
          columns: ['campaignName', 'campaignId', 'adGroupName', 'adGroupId',
            'keywordType', 'keyword',
            'date', 'impressions', 'clicks', 'cost', 'purchases7d', 'sales7d', 'unitsSoldClicks7d',
            'costPerClick', 'clickThroughRate', 'topOfSearchImpressionShare'],
        },
        {
          key: 'spPlacement',
          label: 'SP Campaign Placement',
          adProduct: 'SPONSORED_PRODUCTS',
          reportTypeId: 'spCampaigns',
          groupBy: ['campaignPlacement'],
          columns: ['campaignName', 'campaignId', 'placementClassification',
            'date', 'impressions', 'clicks', 'cost', 'purchases7d', 'sales7d', 'unitsSoldClicks7d'],
        },
        // --- SB Reports (v3 column names — different from SP) ---
        {
          key: 'sbCampaigns',
          label: 'SB Campaigns',
          adProduct: 'SPONSORED_BRANDS',
          reportTypeId: 'sbCampaigns',
          groupBy: ['campaign'],
          columns: ['campaignName', 'campaignId', 'campaignStatus', 'campaignBudgetAmount',
            'date', 'impressions', 'clicks', 'cost',
            'purchasesClicks14d', 'salesClicks14d', 'unitsSoldClicks14d'],
        },
        {
          key: 'sbSearchTerms',
          label: 'SB Search Terms',
          adProduct: 'SPONSORED_BRANDS',
          reportTypeId: 'sbSearchTerm',
          groupBy: ['searchTerm'],
          columns: ['campaignName', 'campaignId',
            'searchTerm',
            'date', 'impressions', 'clicks', 'cost',
            'purchasesClicks14d', 'salesClicks14d', 'unitsSoldClicks14d'],
        },
        // --- SD Reports (v3 column names — different from SP & SB) ---
        {
          key: 'sdCampaigns',
          label: 'SD Campaigns',
          adProduct: 'SPONSORED_DISPLAY',
          reportTypeId: 'sdCampaigns',
          groupBy: ['campaign'],
          columns: ['campaignName', 'campaignId', 'campaignStatus', 'campaignBudgetAmount',
            'date', 'impressions', 'clicks', 'cost',
            'purchasesClicks14d', 'salesClicks14d', 'unitsSoldClicks14d',
            'detailPageViewsClicks14d'],
        },
      ];

      const createdReports = [];

      for (const spec of REPORT_SPECS) {
        try {
          const body = {
            startDate: startStr,
            endDate: endStr,
            configuration: {
              adProduct: spec.adProduct,
              reportTypeId: spec.reportTypeId,
              timeUnit: 'DAILY',
              format: 'GZIP_JSON',
              groupBy: spec.groupBy,
              columns: spec.columns,
            },
          };

          let created;
          try {
            created = await adsRequest(token, '/reporting/reports', 'POST', body);
          } catch (firstErr) {
            const errMsg = firstErr.message || '';
            // If invalid columns, parse allowed values and retry with only valid ones
            if (errMsg.includes('invalid values') && errMsg.includes('Allowed values')) {
              const allowedMatch = errMsg.match(/Allowed values:\s*\(([^)]+)\)/);
              if (allowedMatch) {
                const allowed = new Set(allowedMatch[1].split(',').map(s => s.trim()));
                const validColumns = spec.columns.filter(c => allowed.has(c));
                if (validColumns.length >= 3) { // Need at least date + a couple metrics
                  console.log(`[AdsSync] ${spec.label}: retrying with ${validColumns.length}/${spec.columns.length} valid columns`);
                  body.configuration.columns = validColumns;
                  created = await adsRequest(token, '/reporting/reports', 'POST', body);
                } else {
                  // Try with just the core columns that should always work
                  const coreColumns = ['date', 'impressions', 'clicks', 'cost', 'campaignName', 'campaignId']
                    .filter(c => allowed.has(c));
                  // Add any sales/purchases columns available
                  for (const col of allowed) {
                    if (col.startsWith('sales') || col.startsWith('purchases') || col.startsWith('unitsSold') || col.startsWith('dpv') || col.startsWith('detailPage')) {
                      coreColumns.push(col);
                    }
                  }
                  if (coreColumns.length >= 3) {
                    console.log(`[AdsSync] ${spec.label}: fallback with ${coreColumns.length} core columns from allowed set`);
                    body.configuration.columns = coreColumns;
                    created = await adsRequest(token, '/reporting/reports', 'POST', body);
                  } else {
                    throw firstErr;
                  }
                }
              } else {
                throw firstErr;
              }
            } else {
              throw firstErr;
            }
          }

          createdReports.push({
            reportId: created.reportId,
            reportKey: spec.key,
            label: spec.label,
            status: created.status || 'PROCESSING',
          });
          console.log(`[AdsSync] ${spec.label} report created: ${created.reportId}`);
          await new Promise(r => setTimeout(r, 300));
        } catch (err) {
          const msg = err.message || '';
          // Non-fatal: account may not have SB, SD, etc.
          if (msg.includes('404') || msg.includes('NOT_FOUND') || msg.includes('401') || msg.includes('UNAUTHORIZED') || msg.includes('AccountNotFound')) {
            console.log(`[AdsSync] ${spec.label} not available, skipping`);
          } else {
            console.error(`[AdsSync] ${spec.label} creation failed:`, msg);
            createdReports.push({ reportKey: spec.key, label: spec.label, status: 'ERROR', error: msg });
          }
        }
      }

      if (createdReports.filter(r => r.reportId).length === 0) {
        return res.status(200).json({ success: false, error: 'No reports could be created. Check your Profile ID and that campaigns exist.', details: createdReports });
      }

      return await pollDownloadTransform(token, createdReports, startStr, endStr, res);

    } catch (err) {
      console.error('[AdsSync] Error:', err);
      return res.status(500).json({ error: `Ads sync failed: ${err.message}` });
    }
  }

  return res.status(400).json({ error: 'Invalid syncType. Use: test, profiles, campaigns, daily' });

  // ============================================================
  // Poll reports → download → transform to Seller Central format
  // ============================================================
  async function pollDownloadTransform(token, reports, startStr, endStr, res) {
    const pending = reports.filter(r => r.reportId && r.status !== 'COMPLETED' && r.status !== 'ERROR');
    const completed = reports.filter(r => r.status === 'COMPLETED');
    const errors = reports.filter(r => r.status === 'ERROR');

    // Poll up to ~80 seconds
    let polls = 0;
    while (pending.length > 0 && polls < 40) {
      polls++;
      await new Promise(r => setTimeout(r, 2000));

      for (let i = pending.length - 1; i >= 0; i--) {
        const rpt = pending[i];
        try {
          const status = await adsRequest(token, `/reporting/reports/${rpt.reportId}`);
          if (status.status === 'COMPLETED') {
            rpt.status = 'COMPLETED';
            rpt.downloadUrl = status.url;
            completed.push(rpt);
            pending.splice(i, 1);
            console.log(`[AdsSync] ${rpt.label} COMPLETED (poll ${polls})`);
          } else if (status.status === 'FAILURE') {
            rpt.status = 'ERROR';
            rpt.error = status.statusDetails || 'Report failed';
            errors.push(rpt);
            pending.splice(i, 1);
          }
        } catch (err) {
          console.error(`[AdsSync] Poll error ${rpt.label}:`, err.message);
        }
      }
    }

    // Return pending state if still waiting
    if (pending.length > 0) {
      return res.status(200).json({
        success: true, status: 'pending',
        message: `${completed.length} ready, ${pending.length} generating`,
        pendingReports: [...pending, ...completed].map(r => ({
          reportId: r.reportId, reportKey: r.reportKey, label: r.label,
          status: r.status, downloadUrl: r.downloadUrl,
        })),
      });
    }

    // ---- Download all completed reports ----
    const rawData = {}; // reportKey → array of raw JSON rows

    for (const rpt of completed) {
      if (!rpt.downloadUrl) continue;
      try {
        const dlRes = await fetch(rpt.downloadUrl);
        if (!dlRes.ok) throw new Error(`Download ${dlRes.status}`);

        let jsonText;
        const ct = dlRes.headers.get('content-type') || '';
        const ce = dlRes.headers.get('content-encoding');
        if (ct.includes('gzip') || ce === 'gzip' || rpt.downloadUrl.includes('.gz')) {
          const { gunzipSync } = await import('zlib');
          const buf = await dlRes.arrayBuffer();
          jsonText = gunzipSync(Buffer.from(buf)).toString('utf8');
        } else {
          jsonText = await dlRes.text();
        }

        let rows;
        try { rows = JSON.parse(jsonText); }
        catch (e) {
          rows = jsonText.split('\n').filter(l => l.trim()).map(l => {
            try { return JSON.parse(l); } catch (e2) { return null; }
          }).filter(Boolean);
        }
        if (!Array.isArray(rows)) { console.error(`[AdsSync] ${rpt.label}: not an array`); continue; }

        rawData[rpt.reportKey] = rows;
        console.log(`[AdsSync] ${rpt.label}: ${rows.length} rows`);
      } catch (err) {
        console.error(`[AdsSync] Download error ${rpt.label}:`, err.message);
        errors.push({ ...rpt, error: err.message });
      }
    }

    // ============================================================
    // TRANSFORM: API camelCase → Seller Central column names
    // This lets the client feed rows directly into existing aggregators
    // ============================================================

    const transformedReports = {};
    let totalRows = 0;

    // Helper: get value from row using v3 column names (with fallback to v2 names)
    const getSales = (r, w) => parseFloat(r[`salesClicks${w}`] || r[`sales${w}`]) || 0;
    const getPurchases = (r, w) => parseInt(r[`purchasesClicks${w}`] || r[`purchases${w}`]) || 0;
    const getUnits = (r, w) => parseInt(r[`unitsSoldClicks${w}`] || r[`unitsSold${w}`]) || 0;

    // --- Daily Overview (combine SP+SB+SD campaigns) ---
    {
      const dailyMap = {};
      const processDaily = (rows, attrWindow) => {
        for (const r of (rows || [])) {
          const d = r.date;
          if (!d) continue;
          if (!dailyMap[d]) dailyMap[d] = { Spend: 0, Revenue: 0, Orders: 0, Impressions: 0, Clicks: 0, Units: 0 };
          dailyMap[d].Spend += parseFloat(r.cost) || 0;
          dailyMap[d].Revenue += getSales(r, attrWindow);
          dailyMap[d].Orders += getPurchases(r, attrWindow);
          dailyMap[d].Units += getUnits(r, attrWindow);
          dailyMap[d].Impressions += parseInt(r.impressions) || 0;
          dailyMap[d].Clicks += parseInt(r.clicks) || 0;
        }
      };
      processDaily(rawData.spCampaigns, '7d');
      processDaily(rawData.sbCampaigns, '14d');
      processDaily(rawData.sdCampaigns, '14d');

      transformedReports.dailyOverview = Object.entries(dailyMap).map(([date, d]) => ({
        date, Date: date,
        Spend: d.Spend, Revenue: d.Revenue, Orders: d.Orders,
        Impressions: d.Impressions, Clicks: d.Clicks,
        ROAS: d.Spend > 0 ? d.Revenue / d.Spend : 0,
        ACOS: d.Revenue > 0 ? (d.Spend / d.Revenue) * 100 : 0,
        CTR: d.Impressions > 0 ? (d.Clicks / d.Impressions) * 100 : 0,
        'Avg CPC': d.Clicks > 0 ? d.Spend / d.Clicks : 0,
        'Conv Rate': d.Clicks > 0 ? (d.Orders / d.Clicks) * 100 : 0,
        'Total Units Ordered': d.Units,
        'Total Revenue': d.Revenue,
      })).sort((a, b) => a.date.localeCompare(b.date));
      totalRows += transformedReports.dailyOverview.length;
    }

    // --- SP Advertised Product (SKU/ASIN level) ---
    if (rawData.spAdvertised) {
      transformedReports.spAdvertised = rawData.spAdvertised.map(r => ({
        'Date': r.date,
        'Campaign Name': r.campaignName || '',
        'Campaign Id': r.campaignId || '',
        'Ad Group Name': r.adGroupName || '',
        'Advertised ASIN': r.advertisedAsin || '',
        'Advertised SKU': r.advertisedSku || '',
        'Impressions': parseInt(r.impressions) || 0,
        'Clicks': parseInt(r.clicks) || 0,
        'Spend': parseFloat(r.cost) || 0,
        '7 Day Total Sales': getSales(r, '7d'),
        '7 Day Total Orders (#)': getPurchases(r, '7d'),
        '7 Day Total Units (#)': getUnits(r, '7d'),
      }));
      totalRows += transformedReports.spAdvertised.length;
    }

    // --- SP Search Terms ---
    if (rawData.spSearchTerms) {
      transformedReports.spSearchTerms = rawData.spSearchTerms.map(r => ({
        'Date': r.date,
        'Campaign Name': r.campaignName || '',
        'Ad Group Name': r.adGroupName || '',
        'Keyword': r.keyword || '',
        'Customer Search Term': r.searchTerm || '',
        'Match Type': r.matchType || '',
        'Impressions': parseInt(r.impressions) || 0,
        'Clicks': parseInt(r.clicks) || 0,
        'Spend': parseFloat(r.cost) || 0,
        '7 Day Total Sales': getSales(r, '7d'),
        '7 Day Total Orders (#)': getPurchases(r, '7d'),
        '7 Day Total Units (#)': getUnits(r, '7d'),
      }));
      totalRows += transformedReports.spSearchTerms.length;
    }

    // --- SP Targeting ---
    if (rawData.spTargeting) {
      transformedReports.spTargeting = rawData.spTargeting.map(r => ({
        'Date': r.date,
        'Campaign Name': r.campaignName || '',
        'Ad Group Name': r.adGroupName || '',
        'Targeting': r.keyword || r.targetingExpression || '',
        'Match Type': r.keywordType || r.targetingType || '',
        'Impressions': parseInt(r.impressions) || 0,
        'Clicks': parseInt(r.clicks) || 0,
        'Spend': parseFloat(r.cost) || 0,
        '7 Day Total Sales': getSales(r, '7d'),
        '7 Day Total Orders (#)': getPurchases(r, '7d'),
        '7 Day Total Units (#)': getUnits(r, '7d'),
        'Top-of-search Impression Share': parseFloat(r.topOfSearchImpressionShare) || 0,
      }));
      totalRows += transformedReports.spTargeting.length;
    }

    // --- SP Placement ---
    if (rawData.spPlacement) {
      transformedReports.spPlacement = rawData.spPlacement.map(r => ({
        'Date': r.date,
        'Campaign Name': r.campaignName || '',
        'Placement': r.placementClassification || 'Other',
        'Impressions': parseInt(r.impressions) || 0,
        'Clicks': parseInt(r.clicks) || 0,
        'Spend': parseFloat(r.cost) || 0,
        '7 Day Total Sales': getSales(r, '7d'),
        '7 Day Total Orders (#)': getPurchases(r, '7d'),
        '7 Day Total Units (#)': getUnits(r, '7d'),
      }));
      totalRows += transformedReports.spPlacement.length;
    }

    // --- SB Search Terms ---
    if (rawData.sbSearchTerms) {
      transformedReports.sbSearchTerms = rawData.sbSearchTerms.map(r => ({
        'Date': r.date,
        'Campaign Name': r.campaignName || '',
        'Customer Search Term': r.searchTerm || '',
        'Match Type': r.matchType || '',
        'Impressions': parseInt(r.impressions) || 0,
        'Clicks': parseInt(r.clicks) || 0,
        'Spend': parseFloat(r.cost) || 0,
        '14 Day Total Sales': getSales(r, '14d'),
        '14 Day Total Orders (#)': getPurchases(r, '14d'),
      }));
      totalRows += transformedReports.sbSearchTerms.length;
    }

    // --- SD Campaign ---
    if (rawData.sdCampaigns) {
      transformedReports.sdCampaign = rawData.sdCampaigns.map(r => ({
        'Date': r.date,
        'Campaign Name': r.campaignName || '',
        'Status': r.campaignStatus || '',
        'Impressions': parseInt(r.impressions) || 0,
        'Clicks': parseInt(r.clicks) || 0,
        'Spend': parseFloat(r.cost) || 0,
        '14 Day Total Sales': getSales(r, '14d'),
        '14 Day Total Orders (#)': getPurchases(r, '14d'),
        '14 Day Detail Page Views (DPV)': parseInt(r.detailPageViewsClicks14d || r.dpv14d) || 0,
        '14 Day New-to-brand Orders (#)': 0,
        '14 Day New-to-brand Sales': 0,
      }));
      totalRows += transformedReports.sdCampaign.length;
    }

    // ============================================================
    // Build daily totals for allDaysData
    // ============================================================
    const dailyData = {};
    for (const row of (transformedReports.dailyOverview || [])) {
      dailyData[row.date] = {
        spend: row.Spend, revenue: row.Revenue, orders: row.Orders,
        units: row['Total Units Ordered'],
        impressions: row.Impressions, clicks: row.Clicks,
        acos: row.ACOS, roas: row.ROAS,
        cpc: row['Avg CPC'], ctr: row.CTR,
      };
    }

    // ============================================================
    // Build SKU-level daily data from SP Advertised Product
    // ============================================================
    const skuDailyData = {}; // date → { sku → { spend, sales, orders, ... } }
    const skuTotals = {};     // sku → aggregate totals

    for (const row of (transformedReports.spAdvertised || [])) {
      const date = row['Date'];
      const sku = row['Advertised SKU'] || '';
      const asin = row['Advertised ASIN'] || '';
      const key = sku || asin;
      if (!key || !date) continue;

      const spend = row['Spend'] || 0;
      const sales = row['7 Day Total Sales'] || 0;
      const orders = row['7 Day Total Orders (#)'] || 0;
      const units = row['7 Day Total Units (#)'] || 0;
      const clicks = row['Clicks'] || 0;
      const impressions = row['Impressions'] || 0;
      const campaign = row['Campaign Name'] || '';
      const adGroup = row['Ad Group Name'] || '';

      // Per-day per-SKU
      if (!skuDailyData[date]) skuDailyData[date] = {};
      if (!skuDailyData[date][key]) {
        skuDailyData[date][key] = { sku, asin, spend: 0, sales: 0, orders: 0, units: 0, clicks: 0, impressions: 0, campaigns: [] };
      }
      skuDailyData[date][key].spend += spend;
      skuDailyData[date][key].sales += sales;
      skuDailyData[date][key].orders += orders;
      skuDailyData[date][key].units += units;
      skuDailyData[date][key].clicks += clicks;
      skuDailyData[date][key].impressions += impressions;
      if (campaign && !skuDailyData[date][key].campaigns.includes(campaign)) {
        skuDailyData[date][key].campaigns.push(campaign);
      }

      // Running totals per SKU
      if (!skuTotals[key]) {
        skuTotals[key] = { sku, asin, spend: 0, sales: 0, orders: 0, units: 0, clicks: 0, impressions: 0, daysActive: new Set(), campaigns: new Set(), adGroups: new Set() };
      }
      skuTotals[key].spend += spend;
      skuTotals[key].sales += sales;
      skuTotals[key].orders += orders;
      skuTotals[key].units += units;
      skuTotals[key].clicks += clicks;
      skuTotals[key].impressions += impressions;
      skuTotals[key].daysActive.add(date);
      if (campaign) skuTotals[key].campaigns.add(campaign);
      if (adGroup) skuTotals[key].adGroups.add(adGroup);
    }

    // Derive metrics for SKU totals
    const skuSummary = Object.values(skuTotals).map(s => ({
      sku: s.sku, asin: s.asin,
      spend: s.spend, sales: s.sales, orders: s.orders, units: s.units,
      clicks: s.clicks, impressions: s.impressions,
      days: s.daysActive.size,
      campaigns: [...s.campaigns],
      adGroups: [...s.adGroups],
      acos: s.sales > 0 ? (s.spend / s.sales) * 100 : (s.spend > 0 ? 999 : 0),
      roas: s.spend > 0 ? s.sales / s.spend : 0,
      cpc: s.clicks > 0 ? s.spend / s.clicks : 0,
      ctr: s.impressions > 0 ? (s.clicks / s.impressions) * 100 : 0,
      convRate: s.clicks > 0 ? (s.orders / s.clicks) * 100 : 0,
      avgDailySpend: s.daysActive.size > 0 ? s.spend / s.daysActive.size : 0,
    })).sort((a, b) => b.spend - a.spend);

    // ============================================================
    // Build campaign summary (all ad types combined)
    // ============================================================
    const campMap = {};
    const addCampaigns = (rows, adType, attrWindow) => {
      for (const r of (rows || [])) {
        const name = r.campaignName;
        if (!name) continue;
        const key = `${adType}::${name}`;
        if (!campMap[key]) {
          campMap[key] = { name, id: r.campaignId || '', type: adType, status: r.campaignStatus || '', budget: parseFloat(r.campaignBudgetAmount) || 0, spend: 0, revenue: 0, orders: 0, units: 0, impressions: 0, clicks: 0, dpv: 0, days: new Set() };
        }
        campMap[key].spend += parseFloat(r.cost) || 0;
        campMap[key].revenue += getSales(r, attrWindow);
        campMap[key].orders += getPurchases(r, attrWindow);
        campMap[key].units += getUnits(r, attrWindow);
        campMap[key].impressions += parseInt(r.impressions) || 0;
        campMap[key].clicks += parseInt(r.clicks) || 0;
        campMap[key].dpv += parseInt(r.detailPageViewsClicks14d || r.dpv14d || 0) || 0;
        if (r.date) campMap[key].days.add(r.date);
        if (r.campaignStatus) campMap[key].status = r.campaignStatus;
      }
    };
    addCampaigns(rawData.spCampaigns, 'SP', '7d');
    addCampaigns(rawData.sbCampaigns, 'SB', '14d');
    addCampaigns(rawData.sdCampaigns, 'SD', '14d');

    const campaigns = Object.values(campMap).map(c => ({
      name: c.name, id: c.id, type: c.type, status: c.status, budget: c.budget,
      spend: c.spend, revenue: c.revenue, orders: c.orders, units: c.units,
      impressions: c.impressions, clicks: c.clicks, dpv: c.dpv,
      days: c.days.size,
      acos: c.revenue > 0 ? (c.spend / c.revenue) * 100 : (c.spend > 0 ? 999 : 0),
      roas: c.spend > 0 ? c.revenue / c.spend : 0,
      cpc: c.clicks > 0 ? c.spend / c.clicks : 0,
      ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
      convRate: c.clicks > 0 ? (c.orders / c.clicks) * 100 : 0,
    })).sort((a, b) => b.spend - a.spend);

    // ============================================================
    // Summary
    // ============================================================
    const dates = Object.keys(dailyData).sort();
    const totals = Object.values(dailyData).reduce((acc, d) => ({
      spend: acc.spend + d.spend, revenue: acc.revenue + d.revenue,
      orders: acc.orders + d.orders, impressions: acc.impressions + d.impressions,
      clicks: acc.clicks + d.clicks,
    }), { spend: 0, revenue: 0, orders: 0, impressions: 0, clicks: 0 });

    const reportCounts = {};
    for (const [key, rows] of Object.entries(transformedReports)) {
      reportCounts[key] = Array.isArray(rows) ? rows.length : 0;
    }

    console.log(`[AdsSync] Complete: ${dates.length} days, ${totalRows} rows, ${campaigns.length} campaigns, ${skuSummary.length} SKUs, $${totals.spend.toFixed(2)} spend`);

    return res.status(200).json({
      success: true,
      syncType: 'daily',
      status: 'complete',
      summary: {
        dateRange: { start: dates[0] || startStr, end: dates[dates.length - 1] || endStr },
        daysWithData: dates.length,
        totalRows,
        totalSpend: totals.spend,
        totalRevenue: totals.revenue,
        totalOrders: totals.orders,
        acos: totals.revenue > 0 ? (totals.spend / totals.revenue) * 100 : 0,
        roas: totals.spend > 0 ? totals.revenue / totals.spend : 0,
        campaignCount: campaigns.length,
        skuCount: skuSummary.length,
        reportCounts,
        reportsCompleted: completed.length,
        reportsFailed: errors.length,
      },
      dailyData,
      skuDailyData,
      skuSummary,
      campaigns,
      reports: transformedReports,
      errors: errors.length > 0 ? errors.map(r => ({ type: r.reportKey, label: r.label, error: r.error })) : undefined,
    });
  }
}
