// Vercel Cron Job for Auto-Sync
// Schedule this in vercel.json with: { "crons": [{ "path": "/api/cron/sync", "schedule": "0 */4 * * *" }] }
// This runs every 4 hours server-side

export default async function handler(req, res) {
  // Verify this is a legitimate cron request
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  
  // In production, verify the request is from Vercel Cron
  if (process.env.NODE_ENV === 'production' && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const results = [];
  const startTime = Date.now();
  
  console.log('=== CRON AUTO-SYNC STARTED ===', new Date().toISOString());
  
  try {
    // Get credentials from request body (for manual triggers) or environment
    const {
      amazonCredentials,
      shopifyCredentials,
      packiyoCredentials,
    } = req.body || {};
    
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';
    
    // Amazon Sync - uses /api/amazon/sync
    if (amazonCredentials?.refreshToken || process.env.AMAZON_REFRESH_TOKEN) {
      try {
        console.log('Syncing Amazon...');
        const amazonRes = await fetch(`${baseUrl}/api/amazon/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            syncType: 'sales', // Use sales for cron sync (gets per-SKU daily order data)
            refreshToken: amazonCredentials?.refreshToken || process.env.AMAZON_REFRESH_TOKEN,
            clientId: amazonCredentials?.clientId || process.env.AMAZON_CLIENT_ID,
            clientSecret: amazonCredentials?.clientSecret || process.env.AMAZON_CLIENT_SECRET,
            sellerId: amazonCredentials?.sellerId || process.env.AMAZON_SELLER_ID,
            marketplaceId: amazonCredentials?.marketplaceId || 'ATVPDKIKX0DER',
          }),
        });
        const data = await amazonRes.json();
        results.push({
          service: 'Amazon',
          success: !data.error && amazonRes.ok,
          error: data.error,
        });
      } catch (err) {
        results.push({ service: 'Amazon', success: false, error: err.message });
      }
    }
    
    // Shopify Sync (last 7 days) - uses /api/shopify/sync
    if (shopifyCredentials?.clientSecret || process.env.SHOPIFY_ACCESS_TOKEN) {
      try {
        console.log('Syncing Shopify...');
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const shopifyRes = await fetch(`${baseUrl}/api/shopify/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeUrl: shopifyCredentials?.storeUrl || process.env.SHOPIFY_STORE_URL,
            accessToken: shopifyCredentials?.clientSecret || process.env.SHOPIFY_ACCESS_TOKEN,
            clientId: shopifyCredentials?.clientId || process.env.SHOPIFY_CLIENT_ID,
            clientSecret: shopifyCredentials?.clientSecret || process.env.SHOPIFY_CLIENT_SECRET,
            startDate,
            endDate,
            preview: false,
          }),
        });
        const data = await shopifyRes.json();
        results.push({
          service: 'Shopify',
          success: !data.error && shopifyRes.ok,
          orders: data.orderCount || 0,
          error: data.error,
        });
      } catch (err) {
        results.push({ service: 'Shopify', success: false, error: err.message });
      }
    }
    
    // Packiyo Sync - uses /api/packiyo/sync
    if (packiyoCredentials?.apiKey || process.env.PACKIYO_API_KEY) {
      try {
        console.log('Syncing Packiyo...');
        const packiyoRes = await fetch(`${baseUrl}/api/packiyo/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            syncType: 'inventory', // Use inventory for cron sync
            apiKey: packiyoCredentials?.apiKey || process.env.PACKIYO_API_KEY,
            customerId: packiyoCredentials?.customerId || process.env.PACKIYO_CUSTOMER_ID || '134',
            baseUrl: packiyoCredentials?.baseUrl || 'https://excel3pl.packiyo.com/api/v1',
          }),
        });
        const data = await packiyoRes.json();
        results.push({
          service: 'Packiyo',
          success: !data.error && packiyoRes.ok,
          skus: data.summary?.skuCount || data.products?.length || 0,
          error: data.error,
        });
      } catch (err) {
        results.push({ service: 'Packiyo', success: false, error: err.message });
      }
    }
    
  } catch (err) {
    console.error('Cron sync error:', err);
    return res.status(500).json({ error: err.message, results });
  }
  
  const duration = Date.now() - startTime;
  console.log('=== CRON AUTO-SYNC COMPLETE ===', `${duration}ms`, results);
  
  return res.status(200).json({
    success: true,
    timestamp: new Date().toISOString(),
    duration: `${duration}ms`,
    results,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
  });
}
