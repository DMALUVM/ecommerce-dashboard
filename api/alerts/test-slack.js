// =============================================================
// API Route: /api/alerts/test-slack.js
// Tests that a Slack webhook URL is valid and working
// =============================================================

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { webhookUrl, storeName } = req.body;

  if (!webhookUrl || !webhookUrl.startsWith('https://hooks.slack.com/')) {
    return res.status(400).json({ error: 'Invalid Slack webhook URL. Must start with https://hooks.slack.com/' });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: '✅ Alert Test Successful!' },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Your *${storeName || 'eCommerce Dashboard'}* alerts are now connected to this Slack channel.\n\nYou'll receive:\n• 📊 Weekly performance summaries every Monday at 8am ET\n• 🚨 Critical alerts when ROAS, margin, or revenue breach thresholds\n• ⚠️ Warnings for ad spend spikes or trend changes`,
            },
          },
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: `Test sent at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET` }],
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(400).json({ error: `Slack returned ${response.status}: ${text}` });
    }

    return res.status(200).json({ success: true, message: 'Test message sent to Slack!' });
  } catch (err) {
    return res.status(500).json({ error: `Failed to send: ${err.message}` });
  }
}
