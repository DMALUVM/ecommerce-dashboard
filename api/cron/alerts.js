// =============================================================
// Vercel Cron: /api/cron/alerts.js
// Schedule: Every Monday 8am EST (or configurable)
// Checks user metrics against alert thresholds, sends Slack/email
// =============================================================
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

// ============ DEFAULT ALERT RULES ============
const DEFAULT_RULES = [
  { id: 'roas_low', metric: 'roas', operator: '<', threshold: 2.0, label: 'Blended ROAS below target', severity: 'critical' },
  { id: 'tacos_high', metric: 'tacos', operator: '>', threshold: 15, label: 'TACOS above 15%', severity: 'warning' },
  { id: 'revenue_drop', metric: 'revenue_wow_pct', operator: '<', threshold: -15, label: 'Revenue dropped >15% WoW', severity: 'critical' },
  { id: 'profit_negative', metric: 'net_margin', operator: '<', threshold: 0, label: 'Negative net margin', severity: 'critical' },
  { id: 'ad_spend_spike', metric: 'adspend_wow_pct', operator: '>', threshold: 25, label: 'Ad spend spiked >25% WoW', severity: 'warning' },
];

// ============ COMPUTE METRICS FROM APP_DATA ============
function computeMetrics(data) {
  const weeks = Object.keys(data.sales || {}).sort();
  if (weeks.length === 0) return null;

  const latest = weeks[weeks.length - 1];
  const previous = weeks.length > 1 ? weeks[weeks.length - 2] : null;

  const curr = data.sales[latest];
  const prev = previous ? data.sales[previous] : null;

  if (!curr?.total) return null;

  const t = curr.total;
  const p = prev?.total;

  const metrics = {
    week: latest,
    revenue: t.revenue || 0,
    ad_spend: t.adSpend || 0,
    cogs: t.cogs || 0,
    net_profit: t.netProfit || 0,
    net_margin: t.netMargin || 0,
    roas: t.roas || 0,
    tacos: t.revenue > 0 ? ((t.adSpend || 0) / t.revenue) * 100 : 0,
    units: t.units || 0,
    orders: t.orders || 0,
  };

  // Week-over-week changes
  if (p) {
    metrics.revenue_wow_pct = p.revenue > 0 ? ((t.revenue - p.revenue) / p.revenue) * 100 : 0;
    metrics.adspend_wow_pct = p.adSpend > 0 ? ((t.adSpend - p.adSpend) / p.adSpend) * 100 : 0;
    metrics.profit_wow_pct = p.netProfit !== 0 ? ((t.netProfit - p.netProfit) / Math.abs(p.netProfit)) * 100 : 0;
    metrics.prev_revenue = p.revenue || 0;
    metrics.prev_roas = p.roas || 0;
  }

  return metrics;
}

// ============ EVALUATE RULES ============
function evaluateRules(metrics, rules) {
  const triggered = [];

  for (const rule of rules) {
    if (!rule.enabled && rule.enabled !== undefined) continue;

    const value = metrics[rule.metric];
    if (value === undefined || value === null) continue;

    let fired = false;
    if (rule.operator === '<' && value < rule.threshold) fired = true;
    if (rule.operator === '>' && value > rule.threshold) fired = true;
    if (rule.operator === '<=' && value <= rule.threshold) fired = true;
    if (rule.operator === '>=' && value >= rule.threshold) fired = true;

    if (fired) {
      triggered.push({
        ...rule,
        currentValue: value,
        message: `${rule.label}: ${formatMetric(rule.metric, value)} (threshold: ${rule.operator} ${formatMetric(rule.metric, rule.threshold)})`,
      });
    }
  }

  return triggered;
}

function formatMetric(metric, value) {
  if (metric.includes('pct') || metric === 'tacos' || metric === 'net_margin') return `${value.toFixed(1)}%`;
  if (metric === 'roas') return `${value.toFixed(2)}x`;
  if (metric.includes('revenue') || metric.includes('profit') || metric.includes('spend')) return `$${Math.round(value).toLocaleString()}`;
  return value.toLocaleString();
}

// ============ SEND SLACK ============
async function sendSlack(webhookUrl, metrics, triggered, storeName) {
  const criticals = triggered.filter(t => t.severity === 'critical');
  const warnings = triggered.filter(t => t.severity === 'warning');

  const emoji = criticals.length > 0 ? '🚨' : warnings.length > 0 ? '⚠️' : '✅';
  const status = criticals.length > 0 ? 'NEEDS ATTENTION' : warnings.length > 0 ? 'Review Recommended' : 'All Clear';

  const alertLines = triggered.map(t => {
    const icon = t.severity === 'critical' ? '🔴' : '🟡';
    return `${icon} ${t.message}`;
  }).join('\n');

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${emoji} Weekly Performance Alert — ${storeName || 'Your Store'}` },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Week ending ${metrics.week}* · Status: *${status}*`,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Revenue*\n$${Math.round(metrics.revenue).toLocaleString()}${metrics.revenue_wow_pct !== undefined ? ` (${metrics.revenue_wow_pct > 0 ? '+' : ''}${metrics.revenue_wow_pct.toFixed(1)}% WoW)` : ''}` },
        { type: 'mrkdwn', text: `*Net Profit*\n$${Math.round(metrics.net_profit).toLocaleString()} (${metrics.net_margin.toFixed(1)}% margin)` },
        { type: 'mrkdwn', text: `*ROAS*\n${metrics.roas.toFixed(2)}x` },
        { type: 'mrkdwn', text: `*TACOS*\n${metrics.tacos.toFixed(1)}%` },
      ],
    },
  ];

  if (triggered.length > 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Alerts Triggered (${triggered.length}):*\n${alertLines}` },
    });
  } else {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '✅ All metrics within healthy thresholds.' },
    });
  }

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `Sent by your eCommerce Dashboard · ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET` }],
  });

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks }),
  });

  return res.ok;
}

// ============ MAIN HANDLER ============
export default async function handler(req, res) {
  // Auth check
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === 'production' && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('=== CRON ALERTS STARTED ===', new Date().toISOString());
  const results = [];

  try {
    // Get all users with alert settings configured
    // For single-user: just get all app_data rows
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

      // Check if user has alerts configured
      // Settings are stored in appData.settings by the client
      const settings = appData.settings || {};
      const slackUrl = settings.slackWebhookUrl;
      if (!slackUrl) continue; // Skip users without Slack configured

      const rules = settings.alertRules?.length > 0 ? settings.alertRules : DEFAULT_RULES;
      const metrics = computeMetrics(appData);
      if (!metrics) {
        results.push({ userId: user.user_id, skipped: true, reason: 'No weekly data' });
        continue;
      }

      const triggered = evaluateRules(metrics, rules);

      // Always send Monday summary (even if no alerts triggered)
      const sendAlways = settings.sendWeeklySummary !== false; // Default: send always
      if (!sendAlways && triggered.length === 0) {
        results.push({ userId: user.user_id, alerts: 0, sent: false });
        continue;
      }

      const sent = await sendSlack(slackUrl, metrics, triggered, appData.storeName);

      // Save alert to history
      const alertEntry = {
        timestamp: new Date().toISOString(),
        metrics,
        triggered: triggered.length,
        rules: triggered.map(t => t.id),
        sent,
      };
      const history = [...(appData.alertHistory || []).slice(-49), alertEntry]; // Keep last 50
      const updatedSettings = { ...settings, alertHistory: history };
      await supabase
        .from('app_data')
        .update({ data: { ...appData, settings: updatedSettings } })
        .eq('user_id', user.user_id);

      results.push({
        userId: user.user_id,
        alerts: triggered.length,
        sent,
        criticals: triggered.filter(t => t.severity === 'critical').length,
      });
    }

  } catch (err) {
    console.error('Alert cron error:', err);
    return res.status(500).json({ error: err.message, results });
  }

  console.log('=== CRON ALERTS COMPLETE ===', results);
  return res.status(200).json({ success: true, timestamp: new Date().toISOString(), results });
}
