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

  // Build auth header variants — Ship Sidekick docs are not public,
  // so we try common API auth patterns until one succeeds (same approach as Packiyo)
  const buildHeaderVariants = () => {
    const variants = [];
    const slugVariants = clientSlug
      ? [
          { 'x-client-slug': clientSlug },
          { 'X-Client-Slug': clientSlug },
        ]
      : [{}];

    const authPatterns = [
      { 'x-api-key': apiKey },
      { 'Authorization': `Bearer ${apiKey}` },
      { 'Authorization': `ApiKey ${apiKey}` },
    ];

    for (const auth of authPatterns) {
      for (const slug of slugVariants) {
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

  // Base URL patterns to try — including bare domain since team said "use www.shipsidekick.com"
  const baseUrls = [
    `https://${host}`,
    `https://${host}/api`,
    `https://${host}/api/v1`,
    `https://${host}/api/v2`,
  ];

  // Test endpoints to try
  const testEndpoints = ['/account', '/carriers', '/me', '/ping', '/validate', '/status', '/shipments', '/orders'];

  const debugLog = [];
  debugLog.push(`Environment: ${environment}`);
  debugLog.push(`Host: ${host}`);
  debugLog.push(`Client slug: ${clientSlug || '(none)'}`);
  debugLog.push(`API key: ${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`);
  debugLog.push(`---`);

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
        // Only try first header variant for each URL/endpoint to keep it fast,
        // but try all variants for URLs that return 401 (auth issue, not wrong URL)
        const url = `${baseUrl}${endpoint}`;
        let triedAuth = false;

        for (const headers of headerVariants) {
          try {
            const authType = headers['x-api-key'] ? 'x-api-key' :
              headers['Authorization']?.split(' ')[0] || 'unknown';
            const slugType = headers['x-client-slug'] ? 'x-client-slug' :
              headers['X-Client-Slug'] ? 'X-Client-Slug' : 'no-slug';

            const logEntry = `${url} [auth=${authType}, slug=${slugType}]`;
            console.log(`[ShipSidekick] Trying: ${logEntry}`);

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);

            const testRes = await fetch(url, {
              method: 'GET',
              headers,
              signal: controller.signal,
            });
            clearTimeout(timeout);

            const status = testRes.status;
            lastStatus = status;
            debugLog.push(`${logEntry} -> ${status}`);
            console.log(`[ShipSidekick] ${url} -> ${status}`);

            if (testRes.ok) {
              let data = {};
              const responseText = await testRes.text().catch(() => '');
              try { data = JSON.parse(responseText); } catch (e) { /* not JSON */ }
              const accountName = data.account?.name || data.data?.name || data.name ||
                data.organization?.name || data.company || 'Ship Sidekick Connected';
              debugLog.push(`SUCCESS! Response: ${responseText.slice(0, 300)}`);
              return res.status(200).json({
                success: true,
                accountName,
                environment: isProduction ? 'production' : 'test',
                debugLog,
              });
            }

            // Read response body for debugging
            const bodyText = await testRes.text().catch(() => '');
            if (bodyText) {
              debugLog.push(`  Body: ${bodyText.slice(0, 200)}`);
            }

            // 401/403 — endpoint exists but auth failed, try other auth patterns
            if (status === 401 || status === 403) {
              lastError = `${status}: ${bodyText.slice(0, 200)}`;
              triedAuth = true;
              continue; // try next header variant
            }

            // 404 — this endpoint doesn't exist, skip to next endpoint
            if (status === 404) {
              break; // skip remaining header variants for this endpoint
            }

            // Other status — log and move on
            lastError = `${status}: ${bodyText.slice(0, 200)}`;
            break; // skip remaining header variants
          } catch (err) {
            const errMsg = err.name === 'AbortError' ? 'Timeout (8s)' : err.message;
            debugLog.push(`${url} -> ERROR: ${errMsg}`);
            lastError = errMsg;
            console.log(`[ShipSidekick] Fetch error for ${url}: ${errMsg}`);
            break; // skip remaining header variants on network error
          }
        }
      }
    }

    // None of the combinations worked
    debugLog.push(`---`);
    debugLog.push(`All attempts failed. Last status: ${lastStatus}, Last error: ${lastError}`);

    if (lastStatus === 401 || lastStatus === 403) {
      return res.status(200).json({
        error: `Authentication failed (${lastStatus}). Tried multiple auth methods across multiple endpoints. ` +
          `Last response: ${lastError || 'none'}`,
        debugLog,
      });
    }

    return res.status(200).json({
      error: `Could not connect to Ship Sidekick at ${host}. ` +
        `Tried multiple endpoints and auth methods. Last error: ${lastError || 'unknown'}`,
      debugLog,
    });
  }

  // For non-test requests, build headers using the auth pattern that worked during test
  // We send both common auth headers — the server will use whichever it recognizes
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

  // Reuse baseUrls declared above for data endpoints

  // Helper: try a fetch against multiple base URLs
  const fetchDebugLog = [];
  async function tryFetch(pathSuffixes, method = 'GET', body = null) {
    let lastError = null;
    for (const base of baseUrls) {
      for (const path of pathSuffixes) {
        const url = `${base}${path}`;
        try {
          const opts = { method, headers };
          if (body) opts.body = JSON.stringify(body);
          const r = await fetch(url, opts);
          fetchDebugLog.push(`${url} -> ${r.status}`);
          if (r.ok) {
            const text = await r.text();
            let data;
            try { data = JSON.parse(text); } catch (e) {
              fetchDebugLog.push(`  Response not JSON: ${text.slice(0, 200)}`);
              continue; // skip non-JSON responses (e.g. HTML pages)
            }
            fetchDebugLog.push(`  Response keys: ${JSON.stringify(Object.keys(data))}`);
            fetchDebugLog.push(`  Response preview: ${text.slice(0, 500)}`);
            return { success: true, data, url };
          }
          if (r.status === 404) continue; // try next path
          const errorText = await r.text().catch(() => '');
          lastError = `${r.status}: ${errorText.slice(0, 200)}`;
          fetchDebugLog.push(`  Error: ${lastError}`);
          if (r.status === 401 || r.status === 403) {
            return { success: false, error: `Auth failed (${r.status}): ${errorText.slice(0, 200)}`, debugLog: fetchDebugLog };
          }
        } catch (err) {
          lastError = err.message;
          fetchDebugLog.push(`${url} -> ERROR: ${err.message}`);
        }
      }
    }
    return { success: false, error: lastError || 'All endpoints returned 404', debugLog: fetchDebugLog };
  }

  // ========== INVENTORY SYNC ==========
  if (syncType === 'inventory') {
    console.log('[ShipSidekick] Starting inventory sync...');
    const productsBase = `https://${host}/api/v1/products`;

    // Try fetching products with inventory data included via common expand/include params
    const expandParams = [
      'include=inventoryLevels',
      'include=inventory',
      'expand=inventoryLevels',
      'expand=inventory',
      'includes=inventoryLevels',
    ];

    // Fetch all pages using cursor-based pagination
    let allItems = [];
    let cursor = null;
    let pageCount = 0;
    const maxPages = 50;
    let usedExpandParam = '';

    // First, try each expand param on the first page to see which returns inventory data
    let bestUrl = `${productsBase}?limit=100`;
    for (const param of expandParams) {
      const testUrl = `${productsBase}?limit=1&${param}`;
      try {
        fetchDebugLog.push(`Trying expand: ${testUrl}`);
        const r = await fetch(testUrl, { method: 'GET', headers });
        if (r.ok) {
          const page = await r.json();
          const items = page.data || [];
          if (items.length > 0) {
            const variants = items[0].productVariants || items[0].variants || [];
            if (variants.length > 0) {
              const invLevels = variants[0].inventoryLevels || variants[0].inventory_levels || [];
              fetchDebugLog.push(`  ${param} -> ${invLevels.length} inventoryLevels`);
              if (invLevels.length > 0) {
                usedExpandParam = param;
                fetchDebugLog.push(`  Using expand param: ${param}`);
                break;
              }
            }
          }
        } else {
          fetchDebugLog.push(`  ${param} -> ${r.status}`);
        }
      } catch (err) {
        fetchDebugLog.push(`  ${param} -> ERROR: ${err.message}`);
      }
    }

    if (usedExpandParam) {
      bestUrl = `${productsBase}?limit=100&${usedExpandParam}`;
    }

    try {
      do {
        const url = cursor
          ? `${bestUrl}&cursor=${encodeURIComponent(cursor)}`
          : bestUrl;
        fetchDebugLog.push(`Fetching: ${url}`);
        const r = await fetch(url, { method: 'GET', headers });

        if (!r.ok) {
          const errorText = await r.text().catch(() => '');
          fetchDebugLog.push(`${url} -> ${r.status}: ${errorText.slice(0, 200)}`);
          if (allItems.length === 0) {
            return res.status(200).json({ error: `Inventory fetch failed (${r.status}): ${errorText.slice(0, 200)}`, debugLog: fetchDebugLog });
          }
          break;
        }

        const page = await r.json();
        const pageItems = page.data || page.items || page.products || page.results || (Array.isArray(page) ? page : []);
        allItems = allItems.concat(pageItems);
        pageCount++;

        fetchDebugLog.push(`Page ${pageCount}: ${pageItems.length} items (total so far: ${allItems.length}/${page.totalCount || '?'})`);

        // Log first variant's inventoryLevels structure
        if (pageCount === 1 && pageItems.length > 0) {
          const variants = pageItems[0].productVariants || pageItems[0].variants || [];
          if (variants.length > 0) {
            const invLevels = variants[0].inventoryLevels || variants[0].inventory_levels || [];
            fetchDebugLog.push(`Variant SKU: ${variants[0].sku}, inventoryLevels count: ${invLevels.length}`);
            if (invLevels.length > 0) {
              fetchDebugLog.push(`inventoryLevel keys: ${JSON.stringify(Object.keys(invLevels[0]))}`);
              fetchDebugLog.push(`inventoryLevel sample: ${JSON.stringify(invLevels[0]).slice(0, 500)}`);
            }
          }
        }

        cursor = page.hasMore ? page.nextCursor : null;
      } while (cursor && pageCount < maxPages);
    } catch (err) {
      fetchDebugLog.push(`Pagination error: ${err.message}`);
      if (allItems.length === 0) {
        return res.status(200).json({ error: `Inventory fetch error: ${err.message}`, debugLog: fetchDebugLog });
      }
    }

    // Also try to fetch inventory levels from a separate endpoint and merge
    let inventoryByVariantId = {};
    const invLevelPaths = ['/inventory-levels', '/inventory', '/stock-levels', '/warehouse/inventory'];
    for (const path of invLevelPaths) {
      const invUrl = `https://${host}/api/v1${path}?limit=500`;
      try {
        fetchDebugLog.push(`Trying inventory endpoint: ${invUrl}`);
        const r = await fetch(invUrl, { method: 'GET', headers });
        fetchDebugLog.push(`  ${invUrl} -> ${r.status}`);
        if (r.ok) {
          const invData = await r.json();
          const levels = invData.data || invData.items || invData.inventory || (Array.isArray(invData) ? invData : []);
          fetchDebugLog.push(`  Got ${levels.length} inventory levels`);
          if (levels.length > 0) {
            fetchDebugLog.push(`  Level keys: ${JSON.stringify(Object.keys(levels[0]))}`);
            fetchDebugLog.push(`  Level sample: ${JSON.stringify(levels[0]).slice(0, 500)}`);
            // Index by variant ID for merging
            for (const lvl of levels) {
              const vid = lvl.variantId || lvl.variant_id || lvl.productVariantId || lvl.product_variant_id || '';
              if (vid) {
                if (!inventoryByVariantId[vid]) inventoryByVariantId[vid] = [];
                inventoryByVariantId[vid].push(lvl);
              }
            }
            break; // found working endpoint
          }
        }
      } catch (err) {
        fetchDebugLog.push(`  ${invUrl} -> ERROR: ${err.message}`);
      }
    }

    const hasExternalInventory = Object.keys(inventoryByVariantId).length > 0;
    fetchDebugLog.push(`External inventory levels loaded: ${hasExternalInventory} (${Object.keys(inventoryByVariantId).length} variants)`);

    console.log(`[ShipSidekick] Fetched ${allItems.length} products across ${pageCount} pages`);

    const inventoryBySku = {};
    let totalUnits = 0;
    let skuCount = 0;
    let skippedNoSku = 0;
    let skippedZeroQty = 0;
    let totalVariants = 0;

    // Helper: sum inventory from inventoryLevels array
    function sumInventoryLevels(levels) {
      if (!Array.isArray(levels) || levels.length === 0) return null;
      let onHand = 0, available = 0, incoming = 0, allocated = 0;
      for (const lvl of levels) {
        onHand += lvl.onHand ?? lvl.on_hand ?? lvl.quantity ?? lvl.stock ?? lvl.quantityOnHand ?? 0;
        available += lvl.available ?? lvl.availableForSale ?? lvl.available_for_sale ?? lvl.quantityAvailable ?? onHand;
        incoming += lvl.incoming ?? lvl.inbound ?? lvl.inTransit ?? lvl.in_transit ?? lvl.quantityIncoming ?? 0;
        allocated += lvl.allocated ?? lvl.committed ?? lvl.reserved ?? lvl.quantityAllocated ?? 0;
      }
      return { onHand, available, incoming, allocated };
    }

    for (const product of allItems) {
      const productName = product.name || product.title || product.slug || '';
      const isBundle = product.isBundle === true;
      const variants = product.productVariants || product.variants || [];

      for (const v of variants) {
        totalVariants++;
        const sku = v.sku || v.barcode || v.upc || v.asin || '';
        if (!sku) { skippedNoSku++; continue; }

        // Case-insensitive SKU dedup
        const skuKey = sku.toLowerCase();
        if (inventoryBySku[skuKey]) continue;

        // Get inventory levels: from variant's embedded data, or from separate endpoint
        let invLevels = v.inventoryLevels || v.inventory_levels || [];
        if (invLevels.length === 0 && hasExternalInventory && v.id) {
          invLevels = inventoryByVariantId[v.id] || [];
        }
        const summed = sumInventoryLevels(invLevels);

        const qtyOnHand = summed?.onHand
          ?? v.quantityOnHand ?? v.quantity_on_hand ?? v.onHand ?? v.quantity ?? v.stock ?? 0;
        const qtyAvailable = summed?.available ?? v.quantityAvailable ?? v.available ?? qtyOnHand;
        const qtyInbound = summed?.incoming ?? v.quantityInbound ?? v.inbound ?? v.inTransit ?? 0;
        const qtyAllocated = summed?.allocated ?? v.quantityAllocated ?? v.allocated ?? v.reserved ?? 0;

        // Skip bundles explicitly flagged
        if (isBundle) { skippedZeroQty++; continue; }

        // Only skip zero-inventory items if we actually have inventory data
        // (i.e. inventoryLevels were populated). If no inventory data at all,
        // include the item so SKUs show up.
        const hasInventoryData = invLevels.length > 0;
        if (hasInventoryData && qtyOnHand === 0 && qtyAvailable === 0 && qtyInbound === 0) {
          skippedZeroQty++;
          continue;
        }

        const cost = v.costPrice ?? v.cost ?? v.unitCost ?? v.wholesalePrice ?? 0;
        const variantName = v.title || v.name || '';
        const displayName = variantName && variantName !== productName
          ? `${productName} - ${variantName}` : productName || sku;

        inventoryBySku[skuKey] = {
          sku, // preserve original case
          name: displayName,
          barcode: v.barcode || v.upc || v.ean || '',
          totalQty: qtyOnHand,
          quantityOnHand: qtyOnHand,
          quantityAvailable: qtyAvailable,
          quantityInbound: qtyInbound,
          quantityAllocated: qtyAllocated,
          cost,
          totalValue: qtyOnHand * cost,
          source: 'shipsidekick',
          productId: product.id,
          hasInventoryData,
        };

        totalUnits += qtyOnHand;
        skuCount++;
      }
    }

    fetchDebugLog.push(`Products: ${allItems.length}, Variants: ${totalVariants}, Unique SKUs: ${skuCount}, Bundles/zero-qty skipped: ${skippedZeroQty}, No-SKU skipped: ${skippedNoSku}`);
    console.log(`[ShipSidekick] Inventory: ${skuCount} SKUs, ${totalUnits} units, ${skippedZeroQty} skipped`);

    return res.status(200).json({
      success: true,
      syncType: 'inventory',
      date: new Date().toISOString().split('T')[0],
      source: 'shipsidekick-direct',
      matchedUrl: inventoryUrl,
      rawItemCount: allItems.length,
      skippedNoSku,
      pagesLoaded: pageCount,
      summary: {
        totalUnits,
        skuCount,
        productsFetched: allItems.length,
        productsWithInventory: skuCount,
      },
      items: Object.values(inventoryBySku),
      inventoryBySku,
      products: allItems.slice(0, 10), // send first 10 raw items for debug
      debugLog: fetchDebugLog,
    });
  }

  // ========== SHIPMENTS SYNC ==========
  if (syncType === 'shipments') {
    const { startDate, endDate } = req.body;
    const shipmentPaths = ['/shipments', '/orders/shipments', '/fulfillments', '/shipping/history'];
    const result = await tryFetch(shipmentPaths);

    if (!result.success) {
      return res.status(200).json({ error: `Shipments sync failed: ${result.error}` });
    }

    const raw = result.data;
    const shipments = raw.shipments || raw.data || raw.orders || (Array.isArray(raw) ? raw : []);

    return res.status(200).json({
      success: true,
      syncType: 'shipments',
      shipmentCount: shipments.length,
      dateRange: { startDate, endDate },
      shipments,
    });
  }

  // ========== CARRIERS ==========
  if (syncType === 'carriers') {
    const carrierPaths = ['/carriers', '/shipping/carriers', '/services'];
    const result = await tryFetch(carrierPaths);

    if (!result.success) {
      return res.status(200).json({ error: `Carrier fetch failed: ${result.error}` });
    }

    const raw = result.data;
    const carriers = raw.carriers || raw.data || raw.services || (Array.isArray(raw) ? raw : []);
    return res.status(200).json({ success: true, carriers });
  }

  // ========== RATES ==========
  if (syncType === 'rates') {
    const { shipment } = req.body;
    if (!shipment) {
      return res.status(400).json({ error: 'Shipment details required for rate lookup' });
    }

    const ratePaths = ['/rates', '/shipping/rates', '/quotes'];
    const result = await tryFetch(ratePaths, 'POST', shipment);

    if (!result.success) {
      return res.status(200).json({ error: `Rate lookup failed: ${result.error}` });
    }

    const raw = result.data;
    return res.status(200).json({ success: true, rates: raw.rates || raw.data || raw });
  }

  // Default: return account info
  const accountPaths = ['/account', '/me', '/profile'];
  const result = await tryFetch(accountPaths);
  if (!result.success) {
    return res.status(200).json({ error: `Account fetch failed: ${result.error}` });
  }
  return res.status(200).json({ success: true, account: result.data });
}
