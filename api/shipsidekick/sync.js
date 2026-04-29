// Vercel Serverless Function - Ship Sidekick 3PL Inventory Sync
// Path: /api/shipsidekick/sync.js
//
// This provides DIRECT inventory data from Ship Sidekick, bypassing Shopify
// More accurate for 3PL inventory tracking
//
// Features:
// - Real-time inventory levels from Ship Sidekick
// - Separate from Shopify inventory (for home/office stock)
// - Supports multiple warehouses via X-SSK-Client header

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

  const { clientSlug, syncType, test } = req.body;
  // Trim whitespace from API key
  const apiKey = (req.body.apiKey || '').trim();

  // Validate required fields
  if (!apiKey) {
    return res.status(400).json({ error: 'Ship Sidekick API key is required' });
  }

  // Force Ship Sidekick base URL (ignore any old Packiyo URLs from stored credentials)
  let baseUrl = req.body.baseUrl || 'https://www.shipsidekick.com/api/v1';
  if (baseUrl.includes('packiyo')) {
    baseUrl = 'https://www.shipsidekick.com/api/v1';
  }

  // Build headers - Ship Sidekick uses Bearer auth + optional client header
  // See: https://docs.shipsidekick.com
  const buildHeaders = (method = 'GET') => {
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
    };
    // Only set Content-Type on requests with a body (POST/PUT/PATCH)
    if (method !== 'GET' && method !== 'DELETE') {
      headers['Content-Type'] = 'application/json';
    }
    // Multi-client support: scope requests to a specific child org
    if (clientSlug) {
      headers['X-SSK-Client'] = clientSlug;
    }
    return headers;
  };

  // Ship Sidekick has production and test environments
  const SSK_URLS = [
    baseUrl,
    baseUrl.includes('test.') ? 'https://www.shipsidekick.com/api/v1' : 'https://test.shipsidekick.com/api/v1',
  ];

  // Test connection - try both URLs and multiple auth schemes
  // Returns full debug log so errors can be diagnosed from the UI
  if (test) {
    const debugLog = [];
    const log = (msg) => { debugLog.push(`[${new Date().toISOString()}] ${msg}`); console.log(msg); };

    log(`=== Ship Sidekick Connection Test ===`);
    log(`API key length: ${apiKey.length}`);
    log(`API key preview: ${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`);
    log(`Client slug: ${clientSlug || '(none)'}`);
    log(`Incoming baseUrl: ${req.body.baseUrl || '(not provided)'}`);
    log(`Resolved baseUrl: ${baseUrl}`);
    log(`URLs to try: ${SSK_URLS.join(', ')}`);

    // Try multiple auth schemes — different APIs use different conventions
    const authSchemes = [
      { name: 'Bearer', headers: { 'Authorization': `Bearer ${apiKey}` } },
      { name: 'X-API-Key', headers: { 'X-API-Key': apiKey } },
      { name: 'Token', headers: { 'Authorization': `Token ${apiKey}` } },
      { name: 'ApiKey', headers: { 'Authorization': `ApiKey ${apiKey}` } },
      { name: 'Raw', headers: { 'Authorization': apiKey } },
      { name: 'X-Auth-Token', headers: { 'X-Auth-Token': apiKey } },
    ];

    let lastError = null;

    for (const tryUrl of SSK_URLS) {
      for (const scheme of authSchemes) {
        const testEndpoint = `${tryUrl}/inventory/levels?limit=1`;
        const headers = {
          ...scheme.headers,
          'Accept': 'application/json',
          ...(clientSlug ? { 'X-SSK-Client': clientSlug } : {}),
        };
        log(`--- Trying: ${tryUrl} with ${scheme.name} auth ---`);

        try {
          const startTime = Date.now();
          const testRes = await fetch(testEndpoint, {
            method: 'GET',
            headers,
          });
          const elapsed = Date.now() - startTime;

          log(`Response: HTTP ${testRes.status} ${testRes.statusText} (${elapsed}ms)`);

          let responseBody = '';
          try { responseBody = await testRes.text(); } catch (e) { log(`Could not read body: ${e.message}`); }
          log(`Response body (first 300 chars): ${responseBody.slice(0, 300)}`);

          if (testRes.ok) {
            log(`SUCCESS on ${tryUrl} with ${scheme.name} auth`);
            return res.status(200).json({
              success: true,
              customerName: clientSlug || 'Ship Sidekick',
              baseUrl: tryUrl,
              authScheme: scheme.name,
              debugLog,
            });
          } else {
            lastError = { status: testRes.status, body: responseBody, url: tryUrl, scheme: scheme.name };
          }
        } catch (err) {
          log(`NETWORK ERROR on ${tryUrl} (${scheme.name}): ${err.message}`);
          lastError = { status: 0, body: err.message, url: tryUrl, scheme: scheme.name };
        }
      }
    }

    // All URLs and auth schemes failed
    log(`=== All URLs and auth schemes failed ===`);
    let errorMsg;
    if (lastError?.status === 401) {
      errorMsg = 'Invalid API key. Tried Bearer, X-API-Key, Token, ApiKey, Raw, and X-Auth-Token auth schemes — all rejected. '
        + 'Verify your Ship Sidekick API key is correct and has not expired. '
        + 'You can find or regenerate your key in the Ship Sidekick dashboard under Settings > API Keys.';
      if (!clientSlug) {
        errorMsg += ' If your account is a child organization under a parent, you may also need to provide a Client Slug.';
      }
    } else if (lastError?.status === 403) {
      errorMsg = 'Access forbidden. Your API key may not have permission to access inventory data.';
    } else if (lastError) {
      errorMsg = `Ship Sidekick connection failed (HTTP ${lastError.status} from ${lastError.url}). Response: ${(lastError.body || '').slice(0, 300)}`;
    } else {
      errorMsg = 'Connection failed - could not reach Ship Sidekick servers. Check your network connection.';
    }

    return res.status(200).json({
      error: errorMsg,
      debugLog,
    });
  }

  // ============ INVENTORY SYNC ============
  if (syncType === 'inventory') {
    const headers = buildHeaders('GET');

    try {
      // Fetch all inventory levels with pagination
      const allItems = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const url = `${baseUrl}/inventory/levels?limit=100&page=${page}`;
        console.log('Fetching:', url);

        const levelsRes = await fetch(url, { headers });

        if (!levelsRes.ok) {
          const errorText = await levelsRes.text();
          console.log('Inventory fetch error:', levelsRes.status, errorText);
          return res.status(200).json({
            error: `Failed to fetch inventory: ${levelsRes.status} - ${errorText.slice(0, 200)}`
          });
        }

        const data = await levelsRes.json();

        // Ship Sidekick returns standard JSON - items may be in data array or at root
        const pageItems = data.data || data.items || data.inventoryLevels || (Array.isArray(data) ? data : []);
        allItems.push(...pageItems);

        console.log(`Page ${page}: fetched ${pageItems.length} items, total: ${allItems.length}`);

        // Log first page structure for debugging
        if (page === 1) {
          console.log('Response keys:', Object.keys(data));
          if (pageItems.length > 0) {
            console.log('First item keys:', Object.keys(pageItems[0]));
            console.log('First item:', JSON.stringify(pageItems[0]).slice(0, 500));
          }
          if (data.pagination) console.log('Pagination:', JSON.stringify(data.pagination));
          if (data.meta) console.log('Meta:', JSON.stringify(data.meta));
        }

        // Determine pagination - check multiple patterns
        let foundNextPage = false;

        // Pattern 1: pagination object
        if (data.pagination) {
          const p = data.pagination;
          if (p.hasMore || p.hasNextPage || (p.page && p.totalPages && p.page < p.totalPages) || (p.currentPage && p.lastPage && p.currentPage < p.lastPage)) {
            foundNextPage = true;
          }
        }

        // Pattern 2: meta object
        if (!foundNextPage && data.meta) {
          const m = data.meta;
          if (m.hasMore || m.hasNextPage || (m.currentPage && m.lastPage && m.currentPage < m.lastPage) || (m.page && m.totalPages && m.page < m.totalPages)) {
            foundNextPage = true;
          }
        }

        // Pattern 3: cursor-based
        if (!foundNextPage && (data.nextCursor || data.cursor)) {
          foundNextPage = true;
        }

        // Pattern 4: got a full page worth, assume more
        if (!foundNextPage && pageItems.length >= 100) {
          foundNextPage = true;
          console.log('Assuming next page exists (got full page of 100)');
        }

        if (foundNextPage) {
          page++;
        } else {
          hasMore = false;
        }

        // Stop on empty page
        if (pageItems.length === 0) {
          hasMore = false;
        }

        // Safety limit
        if (allItems.length > 20000) {
          console.log('Safety limit (20k) reached');
          break;
        }

        // Rate limit protection
        await new Promise(r => setTimeout(r, 150));
      }

      // Process items into inventory format
      // Ship Sidekick inventory levels include: available, committed, reserved, incoming, damaged, quality_control, safety_stock
      const inventoryBySku = {};
      let totalUnits = 0;
      let totalValue = 0;
      let skippedNoSku = 0;
      let skippedZeroQty = 0;

      allItems.forEach((item, idx) => {
        // Log first item structure for debugging
        if (idx === 0) {
          console.log('=== FIRST ITEM STRUCTURE ===');
          console.log('Keys:', Object.keys(item));
          console.log('Full item:', JSON.stringify(item).slice(0, 1000));
        }

        // Ship Sidekick may nest product info or have it flat
        // Try multiple field name patterns
        const sku = (
          item.sku ||
          item.productVariant?.sku ||
          item.product?.sku ||
          item.variant?.sku ||
          item.productSku ||
          ''
        ).trim();

        if (!sku) {
          skippedNoSku++;
          return;
        }

        // Get quantities - Ship Sidekick field names from their docs
        const quantityAvailable = parseInt(item.availableQuantity || item.available || item.quantity_available || item.availableQty || 0) || 0;
        const quantityCommitted = parseInt(item.committedQuantity || item.committed || item.quantity_committed || item.committedQty || 0) || 0;
        const quantityReserved = parseInt(item.reservedQuantity || item.reserved || item.quantity_reserved || item.reservedQty || 0) || 0;
        const quantityIncoming = parseInt(item.incomingQuantity || item.incoming || item.quantity_incoming || item.incomingQty || 0) || 0;
        const quantityDamaged = parseInt(item.damagedQuantity || item.damaged || item.quantity_damaged || item.damagedQty || 0) || 0;
        const quantityQC = parseInt(item.qualityControlQuantity || item.qualityControl || item.quality_control || item.qcQty || 0) || 0;
        const safetyStock = parseInt(item.safetyStockQuantity || item.safetyStock || item.safety_stock || 0) || 0;

        // Total on-hand = available + committed + reserved + damaged + QC
        // (incoming is not yet physically in warehouse)
        const quantityOnHand = quantityAvailable + quantityCommitted + quantityReserved + quantityDamaged + quantityQC;

        if (idx < 3) {
          console.log(`Item ${idx} (${sku}): available=${quantityAvailable}, committed=${quantityCommitted}, reserved=${quantityReserved}, incoming=${quantityIncoming}, onHand=${quantityOnHand}`);
        }

        // Skip items with no inventory
        if (quantityOnHand === 0 && quantityIncoming === 0) {
          skippedZeroQty++;
          return;
        }

        const cost = parseFloat(item.cost || item.unitCost || item.product?.cost || item.productVariant?.cost || 0) || 0;
        const value = quantityOnHand * cost;

        totalUnits += quantityOnHand;
        totalValue += value;

        // If same SKU appears multiple times (multiple warehouses), aggregate
        if (inventoryBySku[sku]) {
          inventoryBySku[sku].quantityOnHand += quantityOnHand;
          inventoryBySku[sku].quantityAvailable += quantityAvailable;
          inventoryBySku[sku].quantityInbound += quantityIncoming;
          inventoryBySku[sku].quantityAllocated += quantityCommitted;
          inventoryBySku[sku].quantityReserved += quantityReserved;
          inventoryBySku[sku].totalQty += quantityOnHand;
          inventoryBySku[sku].totalValue += value;
        } else {
          const name = item.name || item.productName || item.product?.name || item.productVariant?.name || item.title || sku;
          const barcode = item.barcode || item.productVariant?.barcode || item.product?.barcode || '';

          inventoryBySku[sku] = {
            sku,
            name,
            barcode,
            totalQty: quantityOnHand,
            quantityOnHand,
            quantityAvailable,
            quantityInbound: quantityIncoming,
            quantityAllocated: quantityCommitted,
            quantityReserved,
            quantityDamaged,
            quantityQC,
            safetyStock,
            cost,
            totalValue: value,
            shipsidekickId: item.id || item.productVariantId || '',
          };
        }
      });

      console.log(`Processing complete: ${allItems.length} items fetched, ${skippedNoSku} without SKU, ${skippedZeroQty} with zero qty, ${Object.keys(inventoryBySku).length} with inventory`);
      console.log(`=== FINAL TOTALS: ${totalUnits} units, $${totalValue.toFixed(2)} value ===`);

      // Log top 5 products by quantity
      const topProducts = Object.values(inventoryBySku)
        .sort((a, b) => b.quantityOnHand - a.quantityOnHand)
        .slice(0, 5);
      console.log('Top 5 products by qty:', topProducts.map(p => `${p.sku}: ${p.quantityOnHand}`).join(', '));

      const inventorySnapshot = {
        date: new Date().toISOString().split('T')[0],
        source: 'shipsidekick-direct',
        summary: {
          totalUnits,
          totalValue,
          skuCount: Object.keys(inventoryBySku).length,
          skippedNoSku,
          skippedZeroQty,
          productsFetched: allItems.length,
          productsWithInventory: Object.keys(inventoryBySku).length,
        },
        items: Object.values(inventoryBySku)
          .map(item => ({
            sku: item.sku,
            name: item.name,
            barcode: item.barcode,
            quantity_on_hand: item.quantityOnHand,
            quantity_available: item.quantityAvailable,
            quantity_inbound: item.quantityInbound,
            quantity_allocated: item.quantityAllocated,
            quantity_reserved: item.quantityReserved,
            cost: item.cost,
            value: item.totalValue,
            source: 'shipsidekick',
          }))
          .sort((a, b) => b.quantity_on_hand - a.quantity_on_hand),
        inventoryBySku,
      };

      return res.status(200).json({
        success: true,
        syncType: 'inventory',
        ...inventorySnapshot,
      });

    } catch (err) {
      console.error('Ship Sidekick inventory sync error:', err);
      return res.status(500).json({ error: `Inventory sync failed: ${err.message}` });
    }
  }

  // ============ SHIPMENTS SYNC (for 3PL costs) ============
  if (syncType === 'shipments') {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start and end dates required for shipments sync' });
    }

    const headers = buildHeaders('GET');

    try {
      const shipments = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const url = `${baseUrl}/orders?limit=100&page=${page}&startDate=${startDate}&endDate=${endDate}&status=shipped`;
        const shipmentsRes = await fetch(url, { headers });

        if (!shipmentsRes.ok) {
          return res.status(shipmentsRes.status).json({
            error: `Failed to fetch shipments: ${shipmentsRes.status}`
          });
        }

        const data = await shipmentsRes.json();
        const pageShipments = data.data || data.orders || data.shipments || (Array.isArray(data) ? data : []);
        shipments.push(...pageShipments);

        // Check pagination
        let foundNext = false;
        if (data.pagination?.hasMore || data.pagination?.hasNextPage) foundNext = true;
        if (!foundNext && data.meta?.currentPage && data.meta?.lastPage && data.meta.currentPage < data.meta.lastPage) foundNext = true;
        if (!foundNext && pageShipments.length >= 100) foundNext = true;

        if (foundNext) {
          page++;
        } else {
          hasMore = false;
        }

        if (pageShipments.length === 0) hasMore = false;
        if (shipments.length > 10000) break;
        await new Promise(r => setTimeout(r, 100));
      }

      // Aggregate shipments by week
      const byWeek = {};

      shipments.forEach(shipment => {
        const shipDate = new Date(shipment.shippedAt || shipment.shipped_at || shipment.completedAt || shipment.createdAt || shipment.created_at);
        const weekKey = getWeekEnding(shipDate);

        if (!byWeek[weekKey]) {
          byWeek[weekKey] = {
            weekEnding: weekKey,
            shipmentCount: 0,
            totalUnits: 0,
            orders: [],
          };
        }

        const lineItems = shipment.lineItems || shipment.items || shipment.orderItems || [];
        const units = lineItems.reduce((sum, item) => sum + (item.quantity || item.qty || 0), 0);

        byWeek[weekKey].shipmentCount++;
        byWeek[weekKey].totalUnits += units;
        byWeek[weekKey].orders.push({
          orderNumber: shipment.orderNumber || shipment.order_number || shipment.id,
          trackingNumber: shipment.trackingNumber || shipment.tracking_number,
          shippedAt: shipment.shippedAt || shipment.shipped_at,
          carrier: shipment.carrier || shipment.shippingMethod?.carrier,
          units,
        });
      });

      return res.status(200).json({
        success: true,
        syncType: 'shipments',
        shipmentCount: shipments.length,
        dateRange: { startDate, endDate },
        byWeek,
      });

    } catch (err) {
      console.error('Ship Sidekick shipments sync error:', err);
      return res.status(500).json({ error: `Shipments sync failed: ${err.message}` });
    }
  }

  return res.status(400).json({ error: 'Invalid syncType. Use: inventory, shipments' });
}

// Helper to get week ending (Sunday)
function getWeekEnding(date) {
  const d = new Date(date);
  const day = d.getDay();
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + daysUntilSunday);
  return d.toISOString().split('T')[0];
}
