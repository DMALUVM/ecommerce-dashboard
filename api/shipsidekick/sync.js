// Vercel Serverless Function - Ship Sidekick Shipping API
// Path: /api/shipsidekick/sync.js
//
// Integrates with Ship Sidekick for shipping rate lookups and label generation
//
// Auth requires:
// - API key (UUID format, from Settings > API Keys in Ship Sidekick dashboard)
// - Client slug (org slug for child/sub-org accounts, e.g. "acme-corp")
// - Correct environment: production (www.shipsidekick.com) vs test (test.shipsidekick.com)

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { apiKey, clientSlug, environment, test, syncType } = req.body;

  // Validate required fields
  if (!apiKey) {
    return res.status(400).json({ error: 'Ship Sidekick API key is required' });
  }

  // Determine base URL from environment setting
  const isProduction = environment === 'production';
  const baseUrl = isProduction
    ? 'https://www.shipsidekick.com/api/v1'
    : 'https://test.shipsidekick.com/api/v1';

  // Build auth headers — always include API key; include client slug if provided
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'x-api-key': apiKey,
  };
  if (clientSlug) {
    headers['x-client-slug'] = clientSlug;
  }

  console.log(`[ShipSidekick] Environment: ${environment}, Base URL: ${baseUrl}`);
  console.log(`[ShipSidekick] Client slug: ${clientSlug || '(none)'}`);

  // Test connection
  if (test) {
    try {
      const testRes = await fetch(`${baseUrl}/account`, {
        method: 'GET',
        headers,
      });

      console.log('[ShipSidekick] Test response status:', testRes.status);

      if (testRes.ok) {
        const data = await testRes.json();
        return res.status(200).json({
          success: true,
          accountName: data.account?.name || data.name || 'Ship Sidekick Connected',
          environment: isProduction ? 'production' : 'test',
        });
      } else if (testRes.status === 401) {
        const errorBody = await testRes.text().catch(() => '');
        console.log('[ShipSidekick] 401 response body:', errorBody);
        return res.status(200).json({
          error: 'Authentication failed (401 Unauthorized). Please check: ' +
            '(1) API key is valid — regenerate in Ship Sidekick dashboard under Settings > API Keys. ' +
            '(2) Client slug is set if your account is a child org. ' +
            `(3) You are using a ${isProduction ? 'production' : 'test'} key with the ${isProduction ? 'production' : 'test'} environment.`,
        });
      } else if (testRes.status === 403) {
        return res.status(200).json({
          error: 'Access forbidden (403). Your API key may not have the required permissions.',
        });
      } else {
        const errorText = await testRes.text().catch(() => '');
        return res.status(200).json({
          error: `Ship Sidekick returned ${testRes.status}: ${errorText.slice(0, 200)}`,
        });
      }
    } catch (err) {
      console.error('[ShipSidekick] Connection test error:', err);
      return res.status(200).json({
        error: `Could not connect to Ship Sidekick (${baseUrl}): ${err.message}`,
      });
    }
  }

  // Fetch shipping rates
  if (syncType === 'rates') {
    const { shipment } = req.body;
    if (!shipment) {
      return res.status(400).json({ error: 'Shipment details required for rate lookup' });
    }

    try {
      const ratesRes = await fetch(`${baseUrl}/rates`, {
        method: 'POST',
        headers,
        body: JSON.stringify(shipment),
      });

      if (!ratesRes.ok) {
        if (ratesRes.status === 401) {
          return res.status(200).json({ error: 'Authentication failed. Check your API key and client slug.' });
        }
        const errorText = await ratesRes.text().catch(() => '');
        return res.status(200).json({ error: `Rate lookup failed (${ratesRes.status}): ${errorText.slice(0, 200)}` });
      }

      const data = await ratesRes.json();
      return res.status(200).json({ success: true, rates: data.rates || data });
    } catch (err) {
      console.error('[ShipSidekick] Rate lookup error:', err);
      return res.status(500).json({ error: `Rate lookup failed: ${err.message}` });
    }
  }

  // Fetch carriers / account info
  if (syncType === 'carriers') {
    try {
      const carriersRes = await fetch(`${baseUrl}/carriers`, {
        method: 'GET',
        headers,
      });

      if (!carriersRes.ok) {
        if (carriersRes.status === 401) {
          return res.status(200).json({ error: 'Authentication failed. Check your API key and client slug.' });
        }
        const errorText = await carriersRes.text().catch(() => '');
        return res.status(200).json({ error: `Carrier fetch failed (${carriersRes.status}): ${errorText.slice(0, 200)}` });
      }

      const data = await carriersRes.json();
      return res.status(200).json({ success: true, carriers: data.carriers || data });
    } catch (err) {
      console.error('[ShipSidekick] Carriers fetch error:', err);
      return res.status(500).json({ error: `Carrier fetch failed: ${err.message}` });
    }
  }

  // Default: return account info
  try {
    const accountRes = await fetch(`${baseUrl}/account`, {
      method: 'GET',
      headers,
    });

    if (!accountRes.ok) {
      if (accountRes.status === 401) {
        return res.status(200).json({ error: 'Authentication failed. Check your API key and client slug.' });
      }
      const errorText = await accountRes.text().catch(() => '');
      return res.status(200).json({ error: `Account fetch failed (${accountRes.status}): ${errorText.slice(0, 200)}` });
    }

    const data = await accountRes.json();
    return res.status(200).json({ success: true, account: data });
  } catch (err) {
    console.error('[ShipSidekick] Account fetch error:', err);
    return res.status(500).json({ error: `Account fetch failed: ${err.message}` });
  }
}
