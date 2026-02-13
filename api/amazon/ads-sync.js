// Vercel Serverless Function - Amazon Ads API Sync
// Path: /api/amazon/ads-sync.js
//
// Pulls daily campaign performance data from Amazon Advertising API (v3 Reporting)
// Supports Sponsored Products, Sponsored Brands, and Sponsored Display
// Uses separate LWA credentials from SP-API (different app registration)
//
// Endpoints used:
//   - GET  /v2/profiles                     → List advertising profiles
//   - POST /reporting/reports               → Create async report
//   - GET  /reporting/reports/{reportId}     → Poll report status
//   - GET  {downloadUrl}                    → Download completed report
//

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
    syncType,  // 'test' | 'profiles' | 'campaigns' | 'daily'
    startDate,
    endDate,
    daysBack,
    pendingReports, // For polling: [{ reportId, adType }]
  } = req.body;

  if (!adsClientId || !adsClientSecret || !adsRefreshToken) {
    return res.status(400).json({ error: 'Missing Amazon Ads API credentials (adsClientId, adsClientSecret, adsRefreshToken)' });
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
    // Profile scope required for all non-profile endpoints
    if (adsProfileId) {
      headers['Amazon-Advertising-API-Scope'] = adsProfileId;
    }

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const response = await fetch(`${ADS_BASE}${endpoint}`, opts);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[AdsAPI] ${method} ${endpoint} → ${response.status}:`, errText.slice(0, 300));
      throw new Error(`Ads API ${response.status}: ${errText.slice(0, 200)}`);
    }

    // Some endpoints return 207 multi-status; handle gracefully
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json();
    }
    return response.text();
  };

  // ============ TEST CONNECTION ============
  if (syncType === 'test') {
    try {
      const token = await getAdsToken();
      const profiles = await adsRequest(token, '/v2/profiles');

      const usProfiles = profiles.filter(p =>
        p.countryCode === 'US' && p.accountInfo?.type === 'seller'
      );

      return res.status(200).json({
        success: true,
        profiles: profiles.map(p => ({
          profileId: p.profileId,
          countryCode: p.countryCode,
          accountType: p.accountInfo?.type,
          name: p.accountInfo?.name || p.accountInfo?.brandName || `Profile ${p.profileId}`,
          marketplaceId: p.accountInfo?.marketplaceStringId,
        })),
        recommended: usProfiles.length > 0 ? String(usProfiles[0].profileId) : (profiles.length > 0 ? String(profiles[0].profileId) : null),
      });
    } catch (err) {
      console.error('[AdsSync] Test failed:', err.message);
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

  // Profile ID required for all data endpoints
  if (!adsProfileId) {
    return res.status(400).json({ error: 'Missing adsProfileId. Fetch profiles first.' });
  }

  let token;
  try {
    token = await getAdsToken();
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }

  // ============ DAILY CAMPAIGN SYNC (Main endpoint) ============
  // Uses Amazon Ads Reporting API v3 (async reports)
  // Creates reports for SP, SB, SD campaigns → polls → downloads → aggregates
  if (syncType === 'daily') {
    try {
      const endDateObj = endDate ? new Date(endDate) : new Date();
      // Default 30 days back, max 60
      const days = Math.min(parseInt(daysBack) || 30, 60);
      const startDateObj = startDate ? new Date(startDate) : new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const startStr = startDateObj.toISOString().split('T')[0];
      // End date = yesterday (today's data isn't complete)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const endStr = endDateObj > yesterday ? yesterday.toISOString().split('T')[0] : endDateObj.toISOString().split('T')[0];

      console.log(`[AdsSync] Daily sync: ${startStr} to ${endStr}`);

      // ---- Step 1: If we have pending reports, poll them ----
      if (pendingReports && pendingReports.length > 0) {
        return await pollAndDownload(token, pendingReports, res);
      }

      // ---- Step 2: Create reports for each ad type ----
      const adTypes = [
        {
          type: 'sp',
          label: 'Sponsored Products',
          reportTypeId: 'spCampaigns',
          columns: ['campaignName', 'campaignId', 'campaignStatus', 'campaignBudgetAmount', 'campaignBudgetType',
            'date', 'impressions', 'clicks', 'cost', 'purchases7d', 'sales7d', 'unitsSold7d',
            'costPerClick', 'clickThroughRate'],
          timeUnit: 'DAILY',
        },
        {
          type: 'sb',
          label: 'Sponsored Brands',
          reportTypeId: 'sbCampaigns',
          columns: ['campaignName', 'campaignId', 'campaignStatus', 'campaignBudgetAmount',
            'date', 'impressions', 'clicks', 'cost', 'purchases14d', 'sales14d', 'unitsSold14d',
            'costPerClick', 'clickThroughRate'],
          timeUnit: 'DAILY',
        },
        {
          type: 'sd',
          label: 'Sponsored Display',
          reportTypeId: 'sdCampaigns',
          columns: ['campaignName', 'campaignId', 'campaignStatus', 'campaignBudgetAmount',
            'date', 'impressions', 'clicks', 'cost', 'purchases14d', 'sales14d', 'unitsSold14d',
            'dpv14d', 'costPerClick', 'clickThroughRate'],
          timeUnit: 'DAILY',
        },
      ];

      const createdReports = [];

      for (const ad of adTypes) {
        try {
          const reportBody = {
            reportTypeId: ad.reportTypeId,
            timeUnit: ad.timeUnit,
            format: 'GZIP_JSON',
            groupBy: ['campaign'],
            columns: ad.columns,
            reportDate: {
              startDate: startStr,
              endDate: endStr,
            },
          };

          console.log(`[AdsSync] Creating ${ad.label} report...`);
          const created = await adsRequest(token, '/reporting/reports', 'POST', reportBody);

          createdReports.push({
            reportId: created.reportId,
            adType: ad.type,
            label: ad.label,
            status: created.status || 'PROCESSING',
          });

          console.log(`[AdsSync] ${ad.label} report created: ${created.reportId} (${created.status})`);

          // Rate limit between requests
          await new Promise(r => setTimeout(r, 500));
        } catch (err) {
          console.error(`[AdsSync] Failed to create ${ad.label} report:`, err.message);
          // Non-fatal — some accounts may not have SB or SD
          if (err.message.includes('404') || err.message.includes('NOT_FOUND') || err.message.includes('401') || err.message.includes('UNAUTHORIZED')) {
            console.log(`[AdsSync] ${ad.label} not available for this account, skipping`);
          } else {
            createdReports.push({ adType: ad.type, label: ad.label, status: 'ERROR', error: err.message });
          }
        }
      }

      if (createdReports.filter(r => r.reportId).length === 0) {
        return res.status(200).json({
          success: false,
          error: 'No reports could be created. Check that your Ads Profile ID is correct and campaigns exist.',
          details: createdReports,
        });
      }

      // ---- Step 3: Poll for completion (up to ~90s) ----
      return await pollAndDownload(token, createdReports, res);

    } catch (err) {
      console.error('[AdsSync] Daily sync error:', err);
      return res.status(500).json({ error: `Ads daily sync failed: ${err.message}` });
    }
  }

  // ============ CAMPAIGN SNAPSHOT (quick current state) ============
  if (syncType === 'campaigns') {
    try {
      // Use the lightweight campaign list endpoints (not reports)
      const campaigns = { sp: [], sb: [], sd: [] };

      // SP Campaigns
      try {
        const spData = await adsRequest(token, '/sp/campaigns/list', 'POST', {
          stateFilter: { include: ['ENABLED', 'PAUSED'] },
          maxResults: 100,
        });
        campaigns.sp = (spData.campaigns || []).map(c => ({
          id: c.campaignId, name: c.name, state: c.state,
          budget: c.budget?.budget, budgetType: c.budget?.budgetType,
          startDate: c.startDate, targetingType: c.targetingType,
        }));
      } catch (e) { console.log('[AdsSync] SP campaigns list not available:', e.message); }

      // SB Campaigns
      try {
        const sbData = await adsRequest(token, '/sb/v4/campaigns/list', 'POST', {
          stateFilter: { include: ['ENABLED', 'PAUSED'] },
          maxResults: 100,
        });
        campaigns.sb = (sbData.campaigns || []).map(c => ({
          id: c.campaignId, name: c.name, state: c.state,
          budget: c.budget?.budget, budgetType: c.budget?.budgetType,
          startDate: c.startDate,
        }));
      } catch (e) { console.log('[AdsSync] SB campaigns list not available:', e.message); }

      // SD Campaigns
      try {
        const sdData = await adsRequest(token, '/sd/campaigns/list', 'POST', {
          stateFilter: { include: ['ENABLED', 'PAUSED'] },
          maxResults: 100,
        });
        campaigns.sd = (sdData.campaigns || []).map(c => ({
          id: c.campaignId, name: c.name, state: c.state,
          budget: c.budget?.budget, budgetType: c.budget?.budgetType,
          startDate: c.startDate, tactic: c.tactic,
        }));
      } catch (e) { console.log('[AdsSync] SD campaigns list not available:', e.message); }

      const total = campaigns.sp.length + campaigns.sb.length + campaigns.sd.length;

      return res.status(200).json({
        success: true,
        syncType: 'campaigns',
        summary: {
          total,
          sp: campaigns.sp.length,
          sb: campaigns.sb.length,
          sd: campaigns.sd.length,
        },
        campaigns,
      });

    } catch (err) {
      console.error('[AdsSync] Campaign snapshot error:', err);
      return res.status(500).json({ error: `Campaign list failed: ${err.message}` });
    }
  }

  return res.status(400).json({ error: 'Invalid syncType. Use: test, profiles, campaigns, daily' });

  // ============================================================
  // HELPER: Poll pending reports, download, aggregate, return
  // ============================================================
  async function pollAndDownload(token, reports, res) {
    const pendingReports = reports.filter(r => r.reportId && r.status !== 'COMPLETED' && r.status !== 'ERROR');
    const completedReports = reports.filter(r => r.status === 'COMPLETED');
    const errorReports = reports.filter(r => r.status === 'ERROR');

    // Poll loop — up to ~80 seconds
    let polls = 0;
    const maxPolls = 40;

    while (pendingReports.length > 0 && polls < maxPolls) {
      polls++;
      await new Promise(r => setTimeout(r, 2000));

      for (let i = pendingReports.length - 1; i >= 0; i--) {
        const rpt = pendingReports[i];
        try {
          const status = await adsRequest(token, `/reporting/reports/${rpt.reportId}`);

          if (status.status === 'COMPLETED') {
            rpt.status = 'COMPLETED';
            rpt.downloadUrl = status.url;
            rpt.fileSize = status.fileSize;
            completedReports.push(rpt);
            pendingReports.splice(i, 1);
            console.log(`[AdsSync] ${rpt.label} report COMPLETED (poll ${polls})`);
          } else if (status.status === 'FAILURE') {
            rpt.status = 'ERROR';
            rpt.error = status.statusDetails || 'Report generation failed';
            errorReports.push(rpt);
            pendingReports.splice(i, 1);
            console.error(`[AdsSync] ${rpt.label} report FAILED:`, rpt.error);
          }
          // else still PROCESSING — keep polling
        } catch (err) {
          console.error(`[AdsSync] Poll error for ${rpt.label}:`, err.message);
        }
      }
    }

    // If still pending after timeout, return pending state for client retry
    if (pendingReports.length > 0) {
      console.log(`[AdsSync] ${pendingReports.length} reports still pending after ${polls * 2}s`);
      return res.status(200).json({
        success: true,
        status: 'pending',
        message: `${completedReports.length} reports ready, ${pendingReports.length} still generating`,
        pendingReports: [...pendingReports, ...completedReports].map(r => ({
          reportId: r.reportId, adType: r.adType, label: r.label, status: r.status,
          downloadUrl: r.downloadUrl,
        })),
      });
    }

    // ---- Download and parse all completed reports ----
    const allDailyData = {};   // date → { spend, revenue, impressions, clicks, orders }
    const allCampaignData = {}; // campaignName → { type, spend, revenue, ... }
    let totalRows = 0;

    for (const rpt of completedReports) {
      if (!rpt.downloadUrl) continue;
      try {
        const dlRes = await fetch(rpt.downloadUrl);
        if (!dlRes.ok) throw new Error(`Download failed: ${dlRes.status}`);

        let jsonText;
        const contentEncoding = dlRes.headers.get('content-encoding');
        const contentType = dlRes.headers.get('content-type') || '';

        // Reports are GZIP_JSON format
        if (contentType.includes('gzip') || contentEncoding === 'gzip' || rpt.downloadUrl.includes('.gz')) {
          const { gunzipSync } = await import('zlib');
          const buffer = await dlRes.arrayBuffer();
          jsonText = gunzipSync(Buffer.from(buffer)).toString('utf8');
        } else {
          jsonText = await dlRes.text();
        }

        let rows;
        try {
          rows = JSON.parse(jsonText);
        } catch (e) {
          // Sometimes response is already decompressed or has a wrapper
          console.error(`[AdsSync] JSON parse error for ${rpt.label}, trying line-delimited...`);
          rows = jsonText.split('\n').filter(l => l.trim()).map(l => {
            try { return JSON.parse(l); } catch (e2) { return null; }
          }).filter(Boolean);
        }

        if (!Array.isArray(rows)) {
          console.error(`[AdsSync] ${rpt.label}: expected array, got ${typeof rows}`);
          continue;
        }

        console.log(`[AdsSync] ${rpt.label}: ${rows.length} rows downloaded`);
        totalRows += rows.length;

        // Parse rows into daily and campaign aggregations
        for (const row of rows) {
          const date = row.date; // Format: YYYY-MM-DD
          if (!date) continue;

          const spend = parseFloat(row.cost) || 0;
          // SP uses 7d attribution, SB/SD use 14d
          const revenue = parseFloat(row.sales7d || row.sales14d || 0) || 0;
          const orders = parseInt(row.purchases7d || row.purchases14d || 0) || 0;
          const units = parseInt(row.unitsSold7d || row.unitsSold14d || 0) || 0;
          const impressions = parseInt(row.impressions) || 0;
          const clicks = parseInt(row.clicks) || 0;
          const campaignName = row.campaignName || '';
          const campaignId = row.campaignId || '';
          const campaignStatus = row.campaignStatus || '';
          const dpv = parseInt(row.dpv14d || 0) || 0;

          // Daily totals
          if (!allDailyData[date]) {
            allDailyData[date] = { spend: 0, revenue: 0, orders: 0, units: 0, impressions: 0, clicks: 0, dpv: 0,
              spSpend: 0, spRevenue: 0, sbSpend: 0, sbRevenue: 0, sdSpend: 0, sdRevenue: 0 };
          }
          allDailyData[date].spend += spend;
          allDailyData[date].revenue += revenue;
          allDailyData[date].orders += orders;
          allDailyData[date].units += units;
          allDailyData[date].impressions += impressions;
          allDailyData[date].clicks += clicks;
          allDailyData[date].dpv += dpv;
          allDailyData[date][`${rpt.adType}Spend`] += spend;
          allDailyData[date][`${rpt.adType}Revenue`] += revenue;

          // Campaign aggregation
          if (campaignName) {
            const campKey = `${rpt.adType}::${campaignName}`;
            if (!allCampaignData[campKey]) {
              allCampaignData[campKey] = {
                name: campaignName, id: campaignId, type: rpt.adType, status: campaignStatus,
                spend: 0, revenue: 0, orders: 0, units: 0, impressions: 0, clicks: 0, dpv: 0, days: 0,
              };
            }
            allCampaignData[campKey].spend += spend;
            allCampaignData[campKey].revenue += revenue;
            allCampaignData[campKey].orders += orders;
            allCampaignData[campKey].units += units;
            allCampaignData[campKey].impressions += impressions;
            allCampaignData[campKey].clicks += clicks;
            allCampaignData[campKey].dpv += dpv;
            allCampaignData[campKey].days++;
            // Keep most recent status
            if (campaignStatus) allCampaignData[campKey].status = campaignStatus;
          }
        }
      } catch (err) {
        console.error(`[AdsSync] Error downloading ${rpt.label} report:`, err.message);
        errorReports.push({ ...rpt, status: 'DOWNLOAD_ERROR', error: err.message });
      }
    }

    // Compute derived metrics for campaigns
    const campaigns = Object.values(allCampaignData).map(c => ({
      ...c,
      acos: c.revenue > 0 ? (c.spend / c.revenue) * 100 : (c.spend > 0 ? 999 : 0),
      roas: c.spend > 0 ? c.revenue / c.spend : 0,
      cpc: c.clicks > 0 ? c.spend / c.clicks : 0,
      ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
      convRate: c.clicks > 0 ? (c.orders / c.clicks) * 100 : 0,
    })).sort((a, b) => b.spend - a.spend);

    // Compute daily derived metrics
    const dailyData = {};
    for (const [date, d] of Object.entries(allDailyData)) {
      dailyData[date] = {
        ...d,
        acos: d.revenue > 0 ? (d.spend / d.revenue) * 100 : 0,
        roas: d.spend > 0 ? d.revenue / d.spend : 0,
        cpc: d.clicks > 0 ? d.spend / d.clicks : 0,
        ctr: d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0,
      };
    }

    // Summary stats
    const dates = Object.keys(dailyData).sort();
    const totals = Object.values(allDailyData).reduce((acc, d) => ({
      spend: acc.spend + d.spend,
      revenue: acc.revenue + d.revenue,
      orders: acc.orders + d.orders,
      impressions: acc.impressions + d.impressions,
      clicks: acc.clicks + d.clicks,
    }), { spend: 0, revenue: 0, orders: 0, impressions: 0, clicks: 0 });

    console.log(`[AdsSync] Complete: ${dates.length} days, ${totalRows} rows, ${campaigns.length} campaigns, $${totals.spend.toFixed(2)} total spend`);

    return res.status(200).json({
      success: true,
      syncType: 'daily',
      status: 'complete',
      summary: {
        dateRange: { start: dates[0], end: dates[dates.length - 1] },
        daysWithData: dates.length,
        totalRows,
        totalSpend: totals.spend,
        totalRevenue: totals.revenue,
        totalOrders: totals.orders,
        acos: totals.revenue > 0 ? (totals.spend / totals.revenue) * 100 : 0,
        roas: totals.spend > 0 ? totals.revenue / totals.spend : 0,
        campaignCount: campaigns.length,
        reportsCompleted: completedReports.length,
        reportsFailed: errorReports.length,
      },
      dailyData,
      campaigns,
      errors: errorReports.length > 0 ? errorReports.map(r => ({ type: r.adType, error: r.error })) : undefined,
    });
  }
}
