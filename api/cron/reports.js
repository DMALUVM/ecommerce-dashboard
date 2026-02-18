// =============================================================
// Vercel Cron: /api/cron/reports.js
// Schedule: Every Monday 8:15am EST (after alerts)
// Auto-generates Amazon PPC + DTC reports, saves to history, optionally notifies Slack
// =============================================================
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const DEFAULT_MODEL = 'claude-sonnet-4-6';

// ============ CALL ANTHROPIC API ============
async function callAnthropicAPI(userPrompt, systemPrompt, model = DEFAULT_MODEL) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 12000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

// ============ BUILD AMAZON REPORT PROMPT (server-side scheduled version) ============
function buildAmazonPrompt(adsIntelData) {
  if (!adsIntelData?.lastUpdated) return null;

  let dataContext = '';
  const d = adsIntelData;

  if (d.spSearchTerms?.length) {
    const top = d.spSearchTerms.slice(0, 50);
    const wasteful = d.spSearchTerms.filter(t => (t.sales || 0) === 0 && (t.spend || 0) > 5).sort((a, b) => (b.spend || 0) - (a.spend || 0)).slice(0, 20);
    const totalSpend = d.spSearchTerms.reduce((s, t) => s + (t.spend || 0), 0);
    const totalSales = d.spSearchTerms.reduce((s, t) => s + (t.sales || 0), 0);
    const wastedSpend = wasteful.reduce((s, t) => s + (t.spend || 0), 0);
    dataContext += `\n## SP Search Terms (${d.spSearchTerms.length} total, showing top ${top.length})
Total: Spend $${totalSpend.toFixed(0)} | Sales $${totalSales.toFixed(0)} | ROAS ${totalSpend > 0 ? (totalSales / totalSpend).toFixed(2) : 'N/A'} | Wasted: $${wastedSpend.toFixed(0)} (${totalSpend > 0 ? (wastedSpend / totalSpend * 100).toFixed(1) : 0}%)
TOP PERFORMERS:\n`;
    dataContext += top.filter(t => (t.sales || 0) > 0).slice(0, 20).map(t => `  "${t.query || t.searchTerm}": ${t.impressions || 0} imp, ${t.clicks || 0} cl, $${(t.spend || 0).toFixed(2)} spend, $${(t.sales || 0).toFixed(2)} sales, ROAS ${(t.spend || 0) > 0 ? ((t.sales || 0) / (t.spend || 0)).toFixed(1) : 'N/A'}, Conv ${(t.clicks || 0) > 0 ? ((t.orders || 0) / (t.clicks || 0) * 100).toFixed(1) : 0}%`).join('\n');
    dataContext += `\nWASTED SPEND ($0 sales, $5+ spend):\n`;
    dataContext += wasteful.map(t => `  "${t.query || t.searchTerm}": $${(t.spend || 0).toFixed(2)} wasted, ${t.clicks || 0} clicks, 0 orders`).join('\n');
  }

  if (d.spTargeting?.length) {
    const top = d.spTargeting.slice(0, 30);
    dataContext += `\n## SP Targeting (top ${top.length}):\n`;
    dataContext += top.map(t => `  "${t.targeting || t.keywordText}": $${(t.spend || 0).toFixed(2)} spend, $${(t.sales || 0).toFixed(2)} sales, ACOS ${(t.acos || 0).toFixed(1)}%, ROAS ${(t.spend || 0) > 0 ? ((t.sales || 0) / (t.spend || 0)).toFixed(1) : 'N/A'}`).join('\n');
  }

  if (d.spPlacement) {
    dataContext += `\n## Placement Performance:\n`;
    (d.spPlacement.byPlacement || []).forEach(p => {
      dataContext += `  ${p.placement}: Spend $${Math.round(p.spend)} | Sales $${Math.round(p.sales)} | ROAS ${p.roas?.toFixed(2) || 'N/A'} | CTR ${p.ctr?.toFixed(2) || 0}% | Conv ${p.convRate?.toFixed(1) || 0}%\n`;
    });
  }

  if (d.spAdvertised?.length) {
    dataContext += `\n## Advertised Products (${d.spAdvertised.length} ASINs):\n`;
    dataContext += d.spAdvertised.slice(0, 15).map(a => `  ${a.asin}${a.sku ? ` (${a.sku})` : ''}: Spend $${Math.round(a.spend)} | Sales $${Math.round(a.sales)} | ACOS ${a.acos?.toFixed(1) || 0}% | Conv ${a.convRate?.toFixed(1) || 0}%`).join('\n');
  }

  if (!dataContext) return null;

  const systemPrompt = `You are a senior Amazon PPC strategist generating a weekly action report. You think in cause→effect→action chains and quantify every recommendation.

RULES:
- ONLY cite numbers from the data. Never fabricate metrics.
- Every recommendation must include: the exact keyword/campaign, current metrics, specific action, and estimated dollar impact.
- Bid formula: Target Bid = Target ACOS × AOV × Conversion Rate. Show the math.
- Negative keyword threshold: $10+ spend with 0 orders = negate. Specify negative EXACT vs PHRASE.
- Minimum 5 negatives, 5 bid optimizations. Rank by dollar impact.
- Use direct operator language: "Set bid to $1.45" not "Consider adjusting."`;

  const userPrompt = `Generate a weekly Amazon PPC Action Report.

DATA:
${dataContext}

=== GENERATE THESE SECTIONS ===

## Executive Summary
Account health grade (A-F). Total spend, sales, ROAS, ACOS. Top 2 problems by dollar impact, top 2 opportunities.

## Kill List — Negative Keywords
| Search Term | Spend Wasted | Clicks | Action (neg exact/phrase) |
Total monthly savings from adding these negatives.

## Scale List — Bid Increases
| Search Term | Current CPC | ROAS | AOV | Conv% | Target Bid @25% ACOS (show math) |
Estimated additional revenue from bid increases.

## Placement Insights
Which placements convert best? Recommended TOS modifiers with math.

## Top 5 Actions This Week
Ranked by dollar impact. For each: exact action, where in Seller Central, expected impact, time to implement.

Keep under 3000 words. Be aggressive and specific.`;

  return { systemPrompt, userPrompt };
}

// ============ BUILD DTC REPORT PROMPT (server-side scheduled version) ============
function buildDtcPrompt(dtcIntelData) {
  if (!dtcIntelData?.lastUpdated) return null;

  let dataContext = '';
  const d = dtcIntelData;

  if (d.metaCampaigns?.length) {
    const top = d.metaCampaigns.slice(0, 25);
    const totalSpend = top.reduce((s, c) => s + (c.spend || 0), 0);
    const totalRev = top.reduce((s, c) => s + (c.purchaseValue || c.revenue || 0), 0);
    const totalPurchases = top.reduce((s, c) => s + (c.purchases || 0), 0);
    dataContext += `\n## Meta Campaigns (${top.length}, Total: Spend $${totalSpend.toFixed(0)} | Rev $${totalRev.toFixed(0)} | ${totalPurchases} purchases | Platform ROAS ${totalSpend > 0 ? (totalRev / totalSpend).toFixed(2) : 'N/A'}):\n`;
    dataContext += top.map(c => `  ${c.campaignName || c.name}: $${(c.spend || 0).toFixed(2)} spend, $${(c.purchaseValue || c.revenue || 0).toFixed(2)} rev, ${c.purchases || 0} purch, ROAS ${(c.spend || 0) > 0 ? ((c.purchaseValue || c.revenue || 0) / (c.spend || 0)).toFixed(2) : 'N/A'}${c.ctr ? `, CTR ${c.ctr}%` : ''}${c.cpc ? `, CPC $${c.cpc}` : ''}`).join('\n');
  }

  if (d.metaAds?.length) {
    const top = d.metaAds.slice(0, 20);
    dataContext += `\n## Meta Ads (top ${top.length} by spend):\n`;
    dataContext += top.map(a => `  ${a.adName || a.name}: $${(a.spend || 0).toFixed(2)} spend, ${a.purchases || 0} purch, ROAS ${(a.spend || 0) > 0 ? ((a.purchaseValue || a.revenue || 0) / (a.spend || 0)).toFixed(2) : 'N/A'}${a.ctr ? `, CTR ${a.ctr}%` : ''}${a.frequency ? `, Freq ${a.frequency}` : ''}`).join('\n');
  }

  if (d.googleCampaigns?.length) {
    const top = d.googleCampaigns.slice(0, 25);
    const totalCost = top.reduce((s, c) => s + (c.cost || 0), 0);
    const totalConvValue = top.reduce((s, c) => s + (c.conversionValue || c.revenue || 0), 0);
    dataContext += `\n## Google Campaigns (${top.length}, Total: Cost $${totalCost.toFixed(0)} | Conv Value $${totalConvValue.toFixed(0)} | Platform ROAS ${totalCost > 0 ? (totalConvValue / totalCost).toFixed(2) : 'N/A'}):\n`;
    dataContext += top.map(c => `  ${c.campaign || c.name}: $${(c.cost || 0).toFixed(2)} cost, $${(c.conversionValue || c.revenue || 0).toFixed(2)} rev, ${c.conversions || 0} conv${c.cpc ? `, CPC $${c.cpc}` : ''}${c.impressionShare ? `, IS ${c.impressionShare}%` : ''}`).join('\n');
  }

  if (d.googleSearchTerms?.length) {
    const wasteful = (d.googleSearchTerms.wasteful || d.googleSearchTerms.filter(t => (t.conversions || 0) === 0 && (t.cost || 0) > 5) || []).slice(0, 15);
    if (wasteful.length > 0) {
      dataContext += `\n## Google Wasted Search Terms ($0 conversions, $5+ cost):\n`;
      dataContext += wasteful.map(t => `  "${t.searchTerm || t.query}": $${(t.cost || t.spend || 0).toFixed(2)} wasted, ${t.clicks || 0} clicks`).join('\n');
    }
  }

  if (!dataContext) return null;

  const systemPrompt = `You are a fractional CMO generating a weekly DTC action report. You manage Meta Ads, Google Ads, and Shopify analytics hands-on.

RULES:
- ONLY cite numbers from the data. Never fabricate metrics or campaign names.
- Always label Meta/Google reported revenue as "Platform ROAS" — it overstates true performance by 20-50%.
- TACOS (Total Ad Spend / Total Revenue) is the real efficiency metric. Platform ROAS is directional only.
- Every recommendation: exact campaign/ad name, current metrics, specific action, estimated dollar impact.
- Meta kill rule: CPP > 2x account avg after $30 spend → OFF. Scale rule: ROAS > 1.5x avg for 3 days → +20% budget.
- Google negative threshold: $15+ spend, 0 conversions → negate (exact or phrase, specify which).
- Use direct operator language: "Kill this ad" not "Consider pausing."`;

  const userPrompt = `Generate a weekly DTC Ads Action Report.

DATA:
${dataContext}

=== GENERATE THESE SECTIONS ===

## Executive Summary
TACOS estimate (if Shopify revenue available), platform ROAS by channel, top 2 wins, top 2 problems by dollar amount.

## Meta: Kill & Scale
KILL: ads/campaigns with poor ROAS after significant spend. Show spend wasted.
SCALE: winners to increase budget on. Specify exact $/day increase (max 20% at a time).

## Google: Negatives & Bid Optimization
Negative keywords to add (minimum 5). Total savings calculation.
Campaigns to scale or adjust bids on. Brand impression share check.

## Cross-Channel Budget Reallocation
| Channel | Current $/Day | Platform ROAS | Recommended $/Day | Expected Impact |
Account for Meta/Google attribution overlap.

## Top 5 Actions This Week
Ranked by dollar impact. For each: exact action, which platform, expected weekly impact, time to implement.

Keep under 3000 words. Be aggressive and specific.`;

  return { systemPrompt, userPrompt };
}

// ============ NOTIFY SLACK ============
async function notifySlack(webhookUrl, reportType, storeName, actionCount) {
  if (!webhookUrl) return;

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📊 *${reportType === 'amazon' ? 'Amazon PPC' : 'DTC Ads'} Report Generated* for ${storeName || 'your store'}\n${actionCount} action items identified. View the full report in your dashboard.`,
          },
        },
      ],
    }),
  });
}

// ============ MAIN HANDLER ============
export default async function handler(req, res) {
  // Auth check
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === 'production' && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured in environment variables' });
  }

  console.log('=== CRON REPORTS STARTED ===', new Date().toISOString());
  const results = [];

  try {
    const { data: users, error } = await supabase
      .from('app_data')
      .select('user_id, data');

    if (error) throw error;
    if (!users?.length) {
      return res.status(200).json({ success: true, message: 'No users found', results: [] });
    }

    for (const user of users) {
      const appData = user.data;
      if (!appData) continue;

      const settings = appData.settings || {};
      const scheduleConfig = {
        enabled: settings.scheduledReportsEnabled || false,
        amazon: settings.scheduleAmazon !== false,
        dtc: settings.scheduleDtc !== false,
        model: settings.aiModel || DEFAULT_MODEL,
      };
      if (!scheduleConfig.enabled) continue; // Skip users who haven't enabled scheduled reports

      const model = scheduleConfig.model;
      const slackUrl = settings.scheduleNotifySlack !== false ? settings.slackWebhookUrl : null;
      const userResults = { userId: user.user_id, reports: [] };

      // Generate Amazon report if data exists
      if (scheduleConfig.amazon && appData.adsIntelData?.lastUpdated) {
        try {
          const prompts = buildAmazonPrompt(appData.adsIntelData);
          if (prompts) {
            const content = await callAnthropicAPI(prompts.userPrompt, prompts.systemPrompt, model);
            const actionCount = (content.match(/^\d+[\.\)]/gm) || []).length;

            const reportEntry = {
              id: `report_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              generatedAt: new Date().toISOString(),
              type: 'amazon',
              content,
              model,
              automated: true,
              metrics: { actionCount },
            };

            const history = [reportEntry, ...(appData.reportHistory || [])].slice(0, 50);
            await supabase
              .from('app_data')
              .update({ data: { ...appData, reportHistory: history } })
              .eq('user_id', user.user_id);
            
            // Update appData reference for next report
            appData.reportHistory = history;

            if (slackUrl) await notifySlack(slackUrl, 'amazon', appData.storeName, actionCount);
            userResults.reports.push({ type: 'amazon', success: true, actionCount });
          }
        } catch (err) {
          userResults.reports.push({ type: 'amazon', success: false, error: err.message });
        }
      }

      // Generate DTC report if data exists
      if (scheduleConfig.dtc && appData.dtcIntelData?.lastUpdated) {
        try {
          const prompts = buildDtcPrompt(appData.dtcIntelData);
          if (prompts) {
            const content = await callAnthropicAPI(prompts.userPrompt, prompts.systemPrompt, model);
            const actionCount = (content.match(/^\d+[\.\)]/gm) || []).length;

            const reportEntry = {
              id: `report_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              generatedAt: new Date().toISOString(),
              type: 'dtc',
              content,
              model,
              automated: true,
              metrics: { actionCount },
            };

            const history = [reportEntry, ...(appData.reportHistory || [])].slice(0, 50);
            await supabase
              .from('app_data')
              .update({ data: { ...appData, reportHistory: history } })
              .eq('user_id', user.user_id);

            if (slackUrl) await notifySlack(slackUrl, 'dtc', appData.storeName, actionCount);
            userResults.reports.push({ type: 'dtc', success: true, actionCount });
          }
        } catch (err) {
          userResults.reports.push({ type: 'dtc', success: false, error: err.message });
        }
      }

      results.push(userResults);
    }

  } catch (err) {
    console.error('Report cron error:', err);
    return res.status(500).json({ error: err.message, results });
  }

  console.log('=== CRON REPORTS COMPLETE ===', results);
  return res.status(200).json({ success: true, timestamp: new Date().toISOString(), results });
}
