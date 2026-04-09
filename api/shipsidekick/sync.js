// Vercel Serverless Function - Ship Sidekick Shipping API
// Path: /api/shipsidekick/sync.js
//
// Integrates with Ship Sidekick for shipping rate lookups and label generation
//
// Auth requires:
// - API key (UUID format, from Settings > API Keys in Ship Sidekick dashboard)
// - Client slug (org slug for child/sub-org accounts, e.g. "tallowbourn")
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
  const host = isProduction ? 'www.shipsidekick.com' : 'test.shipsidekick.com';

  // Try multiple auth header combinations — Ship Sidekick docs are not public,
  // so we try the most common API auth patterns until one succeeds (same approach as Packiyo)
  const buildHeaderVariants = () => {
    const variants = [];
    const slugHeaders = clientSlug
      ? [
          { 'x-client-slug': clientSlug },
          { 'X-Client-Slug': clientSlug },
          { 'client-slug': clientSlug },
          { 'X-Client-Id': clientSlug },
        ]
      : [{}];

    // Auth patterns: x-api-key, Bearer token, ApiKey header
    const authPatterns = [
      { 'x-api-key': apiKey },
      { 'Authorization': `Bearer ${apiKey}` },
      { 'Authorization': `ApiKey ${apiKey}` },
      { 'Authorization': `Token ${apiKey}` },
    ];

    for (const auth of authPatterns) {
      for (const slug of slugHeaders) {
        variants.push({
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...auth,
          ...slug,
        });
      }
    }
    return variants;
  };

  // Base URL patterns to try
  const baseUrls = [
    `https://${host}/api/v1`,
    `https://${host}/api/v2`,
    `https://${host}/api`,
  ];

  // Test endpoints to try
  const testEndpoints = ['/account', '/carriers', '/me', '/ping', '/validate', '/status'];

  console.log(`[ShipSidekick] Environment: ${environment}, Host: ${host}`);
  console.log(`[ShipSidekick] Client slug: ${clientSlug || '(none)'}`);
  console.log(`[ShipSidekick] API key prefix: ${apiKey.slice(0, 8)}...`);

  // Test connection — try all combinations of base URL, endpoint, and header variant
  if (test) {
    const headerVariants = buildHeaderVariants();
    let lastError = null;
    let lastStatus = null;

    for (const baseUrl of baseUrls) {
      for (const endpoint of testEndpoints) {
        for (const headers of headerVariants) {
          const url = `${baseUrl}${endpoint}`;
          try {
            console.log(`[ShipSidekick] Trying: ${url}`);
            const testRes = await fetch(url, {
              method: 'GET',
              headers,
            });

            console.log(`[ShipSidekick] ${url} -> ${testRes.status}`);
            lastStatus = testRes.status;

            if (testRes.ok) {
              let data = {};
              try { data = await testRes.json(); } catch (e) { /* response may not be JSON */ }
              const accountName = data.account?.name || data.data?.name || data.name ||
                data.organization?.name || data.company || 'Ship Sidekick Connected';
              console.log(`[ShipSidekick] SUCCESS with: ${url}, auth: ${Object.keys(headers).find(k => k.toLowerCase().includes('auth') || k.toLowerCase().includes('api-key') || k.toLowerCase().includes('x-api'))}`);
              return res.status(200).json({
                success: true,
                accountName,
                environment: isProduction ? 'production' : 'test',
              });
            }

            // 401/403 means the endpoint exists but auth failed — keep trying other header variants
            if (testRes.status === 401 || testRes.status === 403) {
              const errorBody = await testRes.text().catch(() => '');
              lastError = `${testRes.status}: ${errorBody.slice(0, 200)}`;
              console.log(`[ShipSidekick] Auth failed at ${url}: ${lastError}`);
              continue;
            }

            // 404 means this endpoint doesn't exist — try next endpoint
            if (testRes.status === 404) {
              continue;
            }

            // Other errors
            const errorText = await testRes.text().catch(() => '');
            lastError = `${testRes.status}: ${errorText.slice(0, 200)}`;
          } catch (err) {
            lastError = err.message;
            console.log(`[ShipSidekick] Fetch error for ${url}: ${err.message}`);
          }
        }
      }
    }

    // None of the combinations worked — return a helpful error
    if (lastStatus === 401 || lastStatus === 403) {
      return res.status(200).json({
        error: `Authentication failed (${lastStatus}). Please check: ` +
          '(1) API key is valid — regenerate in Ship Sidekick dashboard under Settings > API Keys. ' +
          '(2) Client slug is correct if your account is a child org. ' +
          `(3) You are using a ${isProduction ? 'production' : 'test'} key with the ${isProduction ? 'production' : 'test'} environment. ` +
          `Last response: ${lastError || 'none'}`,
      });
    }

    return res.status(200).json({
      error: `Could not connect to Ship Sidekick at ${host}. ` +
        `Tried multiple endpoints and auth methods. Last error: ${lastError || 'unknown'}`,
    });
  }

  // For non-test requests (rates, carriers), use the most common patterns
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'x-api-key': apiKey,
    'Authorization': `Bearer ${apiKey}`,
  };
  if (clientSlug) {
    headers['x-client-slug'] = clientSlug;
    headers['X-Client-Slug'] = clientSlug;
  }

  const baseUrl = `https://${host}/api/v1`;

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
