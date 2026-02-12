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
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

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

// ============ BUILD AMAZON REPORT PROMPT (simplified server-side version) ============
function buildAmazonPrompt(adsIntelData) {
  if (!adsIntelData?.lastUpdated) return null;

  let dataContext = '';
  const d = adsIntelData;

  if (d.spSearchTerms?.length) {
    const top = d.spSearchTerms.slice(0, 50);
    dataContext += `\n## SP Search Terms (top ${top.length}):\n`;
    dataContext += top.map(t => `${t.query || t.searchTerm}: ${t.impressions || 0} imp, ${t.clicks || 0} clicks, $${(t.spend || 0).toFixed(2)} spend, $${(t.sales || 0).toFixed(2)} sales`).join('\n');
  }

  if (d.spTargeting?.length) {
    const top = d.spTargeting.slice(0, 30);
    dataContext += `\n## SP Targeting (top ${top.length}):\n`;
    dataContext += top.map(t => `${t.targeting || t.keywordText}: $${(t.spend || 0).toFixed(2)} spend, $${(t.sales || 0).toFixed(2)} sales, ${(t.acos || 0).toFixed(1)}% ACOS`).join('\n');
  }

  if (!dataContext) return null;

  const systemPrompt = `You are an Amazon PPC expert generating a concise weekly action report. Focus on the top 5 most impactful actions with specific numbers. Be direct and actionable.`;

  const userPrompt = `Generate a brief Amazon PPC Action Report from this data. Focus on:
1. Top 3 wasted spend terms to negate
2. Top 3 terms to increase bids on
3. Budget reallocation recommendations
4. Campaign structure issues

DATA:
${dataContext}

Keep the report under 2000 words. Use ## headers and numbered lists for actions.`;

  return { systemPrompt, userPrompt };
}

// ============ BUILD DTC REPORT PROMPT (simplified server-side version) ============
function buildDtcPrompt(dtcIntelData) {
  if (!dtcIntelData?.lastUpdated) return null;

  let dataContext = '';
  const d = dtcIntelData;

  if (d.metaCampaigns?.length) {
    const top = d.metaCampaigns.slice(0, 20);
    dataContext += `\n## Meta Campaigns (${top.length}):\n`;
    dataContext += top.map(c => `${c.campaignName || c.name}: $${(c.spend || 0).toFixed(2)} spend, $${(c.purchaseValue || c.revenue || 0).toFixed(2)} rev, ${c.purchases || 0} purchases`).join('\n');
  }

  if (d.googleCampaigns?.length) {
    const top = d.googleCampaigns.slice(0, 20);
    dataContext += `\n## Google Campaigns (${top.length}):\n`;
    dataContext += top.map(c => `${c.campaign || c.name}: $${(c.cost || 0).toFixed(2)} cost, $${(c.conversionValue || c.revenue || 0).toFixed(2)} rev, ${c.conversions || 0} conversions`).join('\n');
  }

  if (!dataContext) return null;

  const systemPrompt = `You are a DTC performance marketing expert generating a weekly action report. Focus on the top 5 most impactful optimizations with specific numbers.`;

  const userPrompt = `Generate a brief DTC Ads Action Report from this data. Focus on:
1. Top campaign optimizations (pause/scale/adjust)
2. Budget reallocation between Meta and Google
3. Creative refresh recommendations
4. Audience targeting improvements

DATA:
${dataContext}

Keep the report under 2000 words. Use ## headers and numbered lists for actions.`;

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
            const actionCount = (content.match(/^\d+[.)]/gm) || []).length;

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
            const actionCount = (content.match(/^\d+[.)]/gm) || []).length;

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
