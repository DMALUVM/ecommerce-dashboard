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

  // ========== RAW DIAGNOSTIC - dumps unprocessed API response ==========
  if (syncType === 'diagnostic') {
    try {
      const apiBase = `https://${host}/api/v1`;
      const url = `${apiBase}/products?limit=3`;
      const r = await fetch(url, { method: 'GET', headers });
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch (e) { data = null; }

      // Also try a single product's variant to see if there's a detail endpoint
      let variantDetail = null;
      if (data?.data?.[0]?.productVariants?.[0]?.id) {
        const vid = data.data[0].productVariants[0].id;
        const vUrl = `${apiBase}/product-variants/${vid}`;
        try {
          const vr = await fetch(vUrl, { method: 'GET', headers });
          if (vr.ok) variantDetail = await vr.json();
        } catch (e) { /* ignore */ }
      }

      // Try inventory-levels endpoint
      let invLevelsData = null;
      try {
        const ir = await fetch(`${apiBase}/inventory-levels?limit=5`, { method: 'GET', headers });
        if (ir.ok) invLevelsData = await ir.json();
      } catch (e) { /* ignore */ }

      return res.status(200).json({
        success: true,
        syncType: 'diagnostic',
        productsEndpoint: { status: r.status, data: data },
        variantDetail,
        inventoryLevelsEndpoint: invLevelsData,
        rawText: text.slice(0, 5000),
      });
    } catch (err) {
      return res.status(200).json({ error: `Diagnostic error: ${err.message}` });
    }
  }

  // ========== INVENTORY SYNC ==========
  if (syncType === 'inventory') {
    try {
      console.log('[ShipSidekick] Starting inventory sync...');
      const apiBase = `https://${host}/api/v1`;

      // Fetch all pages of products (the known working endpoint)
      let allItems = [];
      let cursor = null;
      let pageCount = 0;
      const maxPages = 20;

      do {
        const url = cursor
          ? `${apiBase}/products?limit=100&cursor=${encodeURIComponent(cursor)}`
          : `${apiBase}/products?limit=100`;
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
        const pageItems = page.data || [];
        allItems = allItems.concat(pageItems);
        pageCount++;
        fetchDebugLog.push(`Page ${pageCount}: ${pageItems.length} items (total: ${allItems.length}/${page.totalCount || '?'})`);

        // Log first product's full variant structure for diagnostics
        if (pageCount === 1 && pageItems.length > 0) {
          const p0 = pageItems[0];
          fetchDebugLog.push(`Product[0] keys: ${JSON.stringify(Object.keys(p0))}`);
          const variants = p0.productVariants || p0.variants || [];
          if (variants.length > 0) {
            const v0 = variants[0];
            fetchDebugLog.push(`Variant[0] keys: ${JSON.stringify(Object.keys(v0))}`);
            fetchDebugLog.push(`Variant[0] SKU: ${v0.sku}`);
            // Log any quantity fields directly on the variant
            const variantQtyFields = {};
            for (const [k, val] of Object.entries(v0)) {
              if (typeof val === 'number' && (k.toLowerCase().includes('quant') || k.toLowerCase().includes('stock') || k.toLowerCase().includes('avail') || k.toLowerCase().includes('total') || k === 'onHand' || k === 'inbound')) {
                variantQtyFields[k] = val;
              }
            }
            if (Object.keys(variantQtyFields).length > 0) {
              fetchDebugLog.push(`Variant[0] qty fields: ${JSON.stringify(variantQtyFields)}`);
            }
            const invLevels = v0.inventoryLevels || [];
            fetchDebugLog.push(`Variant[0] inventoryLevels: ${invLevels.length}`);
            if (invLevels.length > 0) {
              fetchDebugLog.push(`invLevel[0] keys: ${JSON.stringify(Object.keys(invLevels[0]))}`);
              fetchDebugLog.push(`invLevel[0] full: ${JSON.stringify(invLevels[0])}`);
            }
          }
        }

        cursor = page.hasMore ? page.nextCursor : null;
      } while (cursor && pageCount < maxPages);

      // Fetch ALL inventory levels from /inventory-levels endpoint (paginated)
      // This is the PRIMARY source of truth — the products endpoint embeds inventoryLevels
      // but the dedicated endpoint has richer data with nested productVariant info.
      // Key structure: { availableQuantity, ..., productVariant: { sku, id, ... } }
      let inventoryLevelsBySku = {};
      let inventoryLevelsByVariantId = {};
      let totalLevelsFetched = 0;
      const invLevelsBase = `${apiBase}/inventory-levels`;
      let invCursor = null;
      let invPageCount = 0;

      try {
        do {
          const invUrl = invCursor
            ? `${invLevelsBase}?limit=200&cursor=${encodeURIComponent(invCursor)}`
            : `${invLevelsBase}?limit=200`;
          fetchDebugLog.push(`Fetching: ${invUrl}`);
          const r = await fetch(invUrl, { method: 'GET', headers });
          fetchDebugLog.push(`  -> ${r.status}`);

          if (!r.ok) break;

          const invData = await r.json();
          const levels = invData.data || [];
          invPageCount++;
          totalLevelsFetched += levels.length;
          fetchDebugLog.push(`  Page ${invPageCount}: ${levels.length} levels (total: ${totalLevelsFetched})`);

          if (invPageCount === 1 && levels.length > 0) {
            fetchDebugLog.push(`  Level keys: ${JSON.stringify(Object.keys(levels[0]))}`);
            fetchDebugLog.push(`  Level sample: ${JSON.stringify(levels[0]).slice(0, 800)}`);
          }

          for (const lvl of levels) {
            // SKU is nested under productVariant (confirmed by diagnostic)
            const pv = lvl.productVariant || {};
            const sku = (pv.sku || lvl.sku || lvl.variantSku || '').toLowerCase();
            const vid = pv.id || lvl.variantId || lvl.productVariantId || '';

            if (sku) {
              if (!inventoryLevelsBySku[sku]) inventoryLevelsBySku[sku] = [];
              inventoryLevelsBySku[sku].push(lvl);
            }
            if (vid) {
              if (!inventoryLevelsByVariantId[vid]) inventoryLevelsByVariantId[vid] = [];
              inventoryLevelsByVariantId[vid].push(lvl);
            }
          }

          invCursor = invData.hasMore ? invData.nextCursor : null;
        } while (invCursor && invPageCount < 20);

        fetchDebugLog.push(`Inventory levels: ${totalLevelsFetched} total, ${Object.keys(inventoryLevelsBySku).length} unique SKUs`);
      } catch (err) {
        fetchDebugLog.push(`  inventory-levels error: ${err.message}`);
      }

      const inventoryBySku = {};
      let totalUnits = 0;
      let skuCount = 0;
      let skippedNoSku = 0;
      let skippedBundles = 0;
      let totalVariants = 0;

      // Sum inventory across warehouse locations
      // Ship Sidekick fields: availableQuantity, incomingQuantity, committedQuantity,
      //   reservedQuantity, damagedQuantity, safetyStockQuantity, qualityControlQuantity
      function sumInventoryLevels(levels) {
        if (!Array.isArray(levels) || levels.length === 0) return null;
        let available = 0, incoming = 0, committed = 0, reserved = 0;
        for (const lvl of levels) {
          available += lvl.availableQuantity ?? lvl.available ?? lvl.quantityAvailable ?? lvl.onHand ?? lvl.quantity ?? 0;
          incoming += lvl.incomingQuantity ?? lvl.incoming ?? lvl.quantityIncoming ?? lvl.inbound ?? 0;
          committed += lvl.committedQuantity ?? lvl.committed ?? lvl.quantityAllocated ?? lvl.allocated ?? 0;
          reserved += lvl.reservedQuantity ?? lvl.reserved ?? 0;
        }
        // On-hand = available + committed + reserved (total stock in warehouse)
        const onHand = available + committed + reserved;
        return { onHand, available, incoming, committed, reserved };
      }

      // Extract quantity from a variant object (some APIs put summary fields directly on variant)
      function getVariantLevelQty(v) {
        const available = v.availableQuantity ?? v.quantityAvailable ?? v.available ?? v.sellableQuantity ?? 0;
        const incoming = v.incomingQuantity ?? v.quantityIncoming ?? v.incoming ?? v.inbound ?? 0;
        const committed = v.committedQuantity ?? v.quantityCommitted ?? v.committed ?? 0;
        const reserved = v.reservedQuantity ?? v.reserved ?? 0;
        const total = v.totalQuantity ?? v.quantityOnHand ?? v.totalInventory ?? v.stockQuantity ?? v.quantity ?? 0;
        const onHand = total > 0 ? total : (available + committed + reserved);
        if (onHand === 0 && available === 0) return null;
        return { onHand, available, incoming, committed, reserved };
      }

      fetchDebugLog.push('--- Per-SKU inventory ---');

      for (const product of allItems) {
        const productName = product.name || product.title || product.slug || '';
        if (product.isBundle === true) { skippedBundles++; continue; }
        const variants = product.productVariants || product.variants || [];

        for (const v of variants) {
          totalVariants++;
          const sku = v.sku || v.barcode || v.upc || v.asin || '';
          if (!sku) { skippedNoSku++; continue; }

          // Case-insensitive dedup
          const skuKey = sku.toLowerCase();
          if (inventoryBySku[skuKey]) continue;

          // Try multiple sources for inventory data, use the one with the highest available qty
          // Source 1: Embedded inventoryLevels on the variant
          const embeddedLevels = v.inventoryLevels || [];
          const embeddedSum = sumInventoryLevels(embeddedLevels);

          // Source 2: Variant-level quantity fields (some APIs put totals directly on variant)
          const variantQty = getVariantLevelQty(v);

          // Source 3: /inventory-levels endpoint data (keyed by SKU or variant ID)
          const extLevels = inventoryLevelsBySku[skuKey] || (v.id ? inventoryLevelsByVariantId[v.id] : null);
          const extSum = sumInventoryLevels(extLevels || []);

          // Pick the source with the highest available quantity
          const candidates = [
            { src: 'embedded', data: embeddedSum },
            { src: 'variant-field', data: variantQty },
            { src: 'ext-levels', data: extSum },
          ].filter(c => c.data != null);

          let best = { src: 'none', data: { onHand: 0, available: 0, incoming: 0, committed: 0, reserved: 0 } };
          for (const c of candidates) {
            if (c.data.available > best.data.available || (c.data.available === best.data.available && c.data.onHand > best.data.onHand)) {
              best = c;
            }
          }

          const qtyOnHand = best.data.onHand;
          const qtyAvailable = best.data.available;
          const qtyInbound = best.data.incoming;
          const qtyAllocated = best.data.committed;

          // Log ALL SKUs for full diagnostic comparison with dashboard
          const sources = candidates.map(c => `${c.src}:avail=${c.data.available}`).join(', ');
          fetchDebugLog.push(`  ${sku}: avail=${qtyAvailable}, onHand=${qtyOnHand}, inbound=${qtyInbound}, committed=${qtyAllocated} [best=${best.src}] (${sources})`);
          if (embeddedLevels.length > 0) {
            fetchDebugLog.push(`    raw[0]: ${JSON.stringify(embeddedLevels[0]).slice(0, 300)}`);
          }

          const cost = v.costPrice ?? v.cost ?? v.wholesalePrice ?? 0;
          const variantName = v.title || v.name || '';
          const displayName = variantName && variantName !== productName
            ? `${productName} - ${variantName}` : productName || sku;

          inventoryBySku[skuKey] = {
            sku,
            name: displayName,
            barcode: v.barcode || v.upc || v.ean || '',
            totalQty: qtyOnHand,
            // Pipeline expects snake_case fields (same as Packiyo response format)
            quantity_on_hand: qtyOnHand,
            quantity_available: qtyAvailable,
            quantity_inbound: qtyInbound,
            quantity_allocated: qtyAllocated,
            quantityOnHand: qtyOnHand,
            quantityAvailable: qtyAvailable,
            quantityInbound: qtyInbound,
            quantityAllocated: qtyAllocated,
            cost,
            value: qtyOnHand * cost,
            totalValue: qtyOnHand * cost,
            source: 'shipsidekick',
            productId: product.id,
          };

          totalUnits += qtyOnHand;
          skuCount++;
        }
      }

      fetchDebugLog.push('---');
      fetchDebugLog.push(`Products: ${allItems.length}, Variants: ${totalVariants}, Unique SKUs: ${skuCount}, Bundles skipped: ${skippedBundles}, No-SKU: ${skippedNoSku}`);
      fetchDebugLog.push(`TOTAL UNITS: ${totalUnits}`);
      console.log(`[ShipSidekick] Inventory: ${skuCount} SKUs, ${totalUnits} units`);

      return res.status(200).json({
        success: true,
        syncType: 'inventory',
        date: new Date().toISOString().split('T')[0],
        source: 'shipsidekick-direct',
        summary: {
          totalUnits,
          skuCount,
          productsFetched: allItems.length,
          productsWithInventory: skuCount,
        },
        items: Object.values(inventoryBySku),
        inventoryBySku,
        debugLog: fetchDebugLog,
      });
    } catch (err) {
      console.error('[ShipSidekick] Inventory sync error:', err);
      return res.status(200).json({ error: `Inventory sync error: ${err.message}`, debugLog: fetchDebugLog });
    }
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
