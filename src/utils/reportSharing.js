// Report sharing utilities — Slack, PDF export, Google Sheets push
// Used by AmazonAdsIntelModal, DtcAdsIntelModal, and weeklyReportUI

/**
 * Send a report summary to Slack via webhook
 * Posts a formatted message with the report title and a truncated preview
 */
export async function shareToSlack(webhookUrl, { title, content, storeName }) {
  if (!webhookUrl) throw new Error('No Slack webhook URL configured. Go to Settings → Integrations.');

  // Truncate content for Slack (max ~3000 chars in a block)
  const preview = content.length > 2500
    ? content.slice(0, 2500) + '\n\n_(Report truncated — view full report in dashboard)_'
    : content;

  // Convert markdown headers to Slack mrkdwn bold
  const slackContent = preview
    .replace(/^### (.+)$/gm, '*$1*')
    .replace(/^## (.+)$/gm, '\n*$1*')
    .replace(/^# (.+)$/gm, '\n*$1*')
    .replace(/\*\*(.+?)\*\*/g, '*$1*');

  const payload = {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `📊 ${title} — ${storeName || 'Store Dashboard'}`, emoji: true }
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: slackContent }
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `Shared from dashboard · ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET` }]
      }
    ]
  };

  // Slack blocks have a 3001 char limit per text field — split into multiple blocks if needed
  if (slackContent.length > 2900) {
    const chunks = [];
    let remaining = slackContent;
    while (remaining.length > 0) {
      // Split at a newline near 2800 chars
      let cut = Math.min(2800, remaining.length);
      if (cut < remaining.length) {
        const newlineIdx = remaining.lastIndexOf('\n', cut);
        if (newlineIdx > cut * 0.5) cut = newlineIdx;
      }
      chunks.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut);
    }
    
    payload.blocks = [
      { type: 'header', text: { type: 'plain_text', text: `📊 ${title} — ${storeName || 'Store Dashboard'}`, emoji: true } },
      ...chunks.map(chunk => ({ type: 'section', text: { type: 'mrkdwn', text: chunk } })),
      { type: 'context', elements: [{ type: 'mrkdwn', text: `Shared from dashboard · ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET` }] }
    ];
  }

  const res = await fetch('/api/alerts/test-slack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ webhookUrl, storeName, customPayload: payload }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Slack returned ${res.status}`);
  }
  return true;
}


/**
 * Export report as a styled PDF via browser print dialog
 * Creates a clean, print-optimized HTML document and triggers print
 */
export function exportToPDF({ title, content, storeName }) {
  // Convert markdown to HTML (simplified)
  let html = content
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br/>');

  // Wrap consecutive <li> items in <ul>
  html = html.replace(/(<li>.*?<\/li>(?:<br\/>)?)+/g, (match) => {
    return '<ul>' + match.replace(/<br\/>/g, '') + '</ul>';
  });

  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const printDoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    @page { margin: 0.75in; size: letter; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      color: #1a1a2e; line-height: 1.6; font-size: 11pt; max-width: 7in; margin: 0 auto;
    }
    .header { border-bottom: 2px solid #4f46e5; padding-bottom: 12px; margin-bottom: 24px; }
    .header h1 { font-size: 20pt; color: #4f46e5; margin: 0 0 4px 0; }
    .header .meta { color: #64748b; font-size: 9pt; }
    h1 { font-size: 16pt; color: #1e293b; margin-top: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
    h2 { font-size: 14pt; color: #334155; margin-top: 20px; }
    h3 { font-size: 12pt; color: #475569; margin-top: 16px; }
    p { margin: 8px 0; }
    ul, ol { margin: 8px 0; padding-left: 24px; }
    li { margin: 4px 0; }
    strong { color: #0f172a; }
    em { color: #d97706; font-style: normal; font-weight: 600; }
    code { background: #f1f5f9; padding: 1px 4px; border-radius: 3px; font-size: 9pt; color: #059669; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 9pt; }
    th { background: #f8fafc; text-align: left; padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 600; }
    td { padding: 5px 8px; border: 1px solid #e2e8f0; }
    blockquote { border-left: 3px solid #f59e0b; padding-left: 12px; color: #92400e; margin: 12px 0; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 8pt; text-align: center; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    <div class="meta">${storeName || 'Store Dashboard'} · ${date}</div>
  </div>
  <div class="content"><p>${html}</p></div>
  <div class="footer">Generated by E-Commerce Dashboard · ${date}</div>
  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`;

  const blob = new Blob([printDoc], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    // Fallback: download as HTML
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9]/g, '-')}.html`;
    a.click();
  }
  // Clean up after a delay
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}


/**
 * Push report content to Google Sheets as a new "Reports" tab
 */
export async function pushToSheets(sheetId, { title, content, storeName }) {
  if (!sheetId) throw new Error('No Google Sheet ID configured. Go to Settings → Integrations.');

  // Convert report to rows: each line becomes a row
  const lines = content.split('\n');
  const rows = [
    [title, storeName || '', new Date().toISOString()],
    ['---', '', ''],
    ...lines.map(line => [line]),
  ];

  const res = await fetch('/api/sheets/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      spreadsheetId: sheetId,
      reportData: { title, rows },
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Sheets push failed (${res.status})`);
  }
  
  if (data.spreadsheetUrl) {
    window.open(data.spreadsheetUrl, '_blank');
  }
  return data;
}
