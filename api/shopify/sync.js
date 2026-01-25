// Vercel Serverless Function - Shopify Sync API
// Path: /api/shopify/sync.js
// This handles secure communication with Shopify's Admin API
//
// Updated for 2026: Supports Client Credentials Grant (OAuth 2.0)
// New apps use clientId/clientSecret, tokens expire after 24 hours
//
// Features:
// - Syncs orders, SKU data, and tax information
// - EXCLUDES Shop Pay orders from tax calculations (Shopify remits those automatically)
// - Aggregates tax by state for sales tax filing

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { storeUrl, accessToken, clientId, clientSecret, startDate, endDate, preview, test, syncType } = req.body;
 
  // syncType can be: 'orders' (default), 'inventory', 'products', 'both'
  // Validate required fields
  if (!storeUrl) {
    return res.status(400).json({ error: 'Store URL is required' });
  }
 
  // Support both legacy (Admin API access token / shpat_) and optional OAuth-style creds.
  // IMPORTANT: Shopify Admin API calls require an Admin API access token (typically starts with "shpat_").
  // Some users may paste that token into the UI field labeled "Client Secret".
  const looksLikeAdminToken = (t) => typeof t === 'string' && t.trim().toLowerCase().startsWith('shpat_');
  // Prefer explicit accessToken; fall back to clientSecret if it looks like an Admin API token.
  const legacyToken = accessToken || (looksLikeAdminToken(clientSecret) ? clientSecret : null);
  // Only treat clientId/clientSecret as OAuth credentials if clientSecret does NOT look like an Admin API token.
  // (If it *does* look like shpat_, we should NOT try to exchange it via /admin/oauth/access_token.)
  const useOAuth = !!(clientId && clientSecret && !looksLikeAdminToken(clientSecret));
  if (!useOAuth && !legacyToken) {
    return res.status(400).json({ error: 'Missing credentials. Provide an Admin API access token (shpat_) or OAuth credentials.' });
  }
  // Clean up store URL
  let cleanStoreUrl = storeUrl.trim().toLowerCase();
  cleanStoreUrl = cleanStoreUrl.replace(/^https?:\/\//, '');
  cleanStoreUrl = cleanStoreUrl.replace(/\/$/, '');
  if (!cleanStoreUrl.endsWith('.myshopify.com')) {
    cleanStoreUrl += '.myshopify.com';
  }
  const baseUrl = `https://${cleanStoreUrl}/admin/api/2026-01`;
 
  // Helper function to get access token (handles both old and new auth)
  const getAccessToken = async () => {
    if (!useOAuth) {
      // Legacy: Use static Admin API access token (shpat_ tokens)
      return legacyToken;
    }
   
    // New 2026 OAuth: Exchange client credentials for access token
    try {
      const tokenResponse = await fetch(`https://${cleanStoreUrl}/admin/oauth/access_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      });
     
      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('OAuth token error:', tokenResponse.status, errorText);
       
        if (tokenResponse.status === 401 || tokenResponse.status === 403) {
          throw new Error('Invalid Client ID or Secret. Check your Dev Dashboard credentials.');
        }
        throw new Error(`Failed to get access token: ${tokenResponse.status}`);
      }
     
      const tokenData = await tokenResponse.json();
      return tokenData.access_token;
    } catch (err) {
      console.error('OAuth error:', err);
      throw new Error(`Authentication failed: ${err.message}`);
    }
  };
  // Test connection
  if (test) {
    try {
      const token = await getAccessToken();
     
      const shopRes = await fetch(`${baseUrl}/shop.json`, {
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json',
        },
      });
     
      if (!shopRes.ok) {
        const errorText = await shopRes.text();
        console.error('Shopify API error:', shopRes.status, errorText);
        if (shopRes.status === 401) {
          return res.status(401).json({ error: 'Invalid credentials. Verify your Admin API access token (shpat_) and store URL.' });
        }
        if (shopRes.status === 404) {
          return res.status(404).json({ error: 'Store not found. Please check your store URL.' });
        }
        return res.status(shopRes.status).json({ error: `Shopify API error: ${shopRes.status}` });
      }
     
      const shopData = await shopRes.json();
      return res.status(200).json({
        success: true,
        shopName: shopData.shop?.name || cleanStoreUrl,
        email: shopData.shop?.email,
        authMethod: useOAuth ? 'oauth2026' : 'legacy',
      });
    } catch (err) {
      console.error('Connection test error:', err);
      return res.status(500).json({ error: err.message || 'Connection failed' });
    }
  }
 
  // Get access token for all other operations
  let token;
  try {
    token = await getAccessToken();
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }
  // ============ PRODUCT CATALOG SYNC ============
  // Returns SKU -> product info mapping for the entire catalog
  if (syncType === 'products') {
    try {
      const products = [];
      let pageInfo = null;
      let hasNextPage = true;
     
      while (hasNextPage) {
        let url = pageInfo
          ? `${baseUrl}/products.json?page_info=${pageInfo}&limit=250`
          : `${baseUrl}/products.json?limit=250`;
       
        const productsRes = await fetch(url, {
          headers: {
            'X-Shopify-Access-Token': token,
            'Content-Type': 'application/json',
          },
        });
       
        if (!productsRes.ok) {
          return res.status(productsRes.status).json({ error: 'Failed to fetch products' });
        }
       
        const data = await productsRes.json();
        products.push(...(data.products || []));
       
        const linkHeader = productsRes.headers.get('Link');
        if (linkHeader && linkHeader.includes('rel="next"')) {
          const nextMatch = linkHeader.match(/<[^>]*page_info=([^>&]+)[^>]*>;\s*rel="next"/);
          pageInfo = nextMatch ? nextMatch[1] : null;
          hasNextPage = !!pageInfo;
        } else {
          hasNextPage = false;
        }
       
        if (products.length > 5000) break;
        // Rate limit delay
        await new Promise(r => setTimeout(r, 500));
      }
     
      // Build SKU -> product info catalog
      // SKU is the PRIMARY KEY - product name is just metadata
      const productCatalog = {};
      let skuCount = 0;
      let variantCount = 0;
     
      products.forEach(product => {
        (product.variants || []).forEach(variant => {
          variantCount++;
          const sku = variant.sku?.trim();
         
          // Skip items without SKU - they can't be matched across systems
          if (!sku) return;
         
          skuCount++;
          productCatalog[sku] = {
            // SKU is the key, everything else is metadata
            sku: sku,
            name: product.title + (variant.title !== 'Default Title' ? ` - ${variant.title}` : ''),
            productTitle: product.title,
            variantTitle: variant.title,
            productType: product.product_type || '',
            vendor: product.vendor || '',
            tags: product.tags || '',
            price: parseFloat(variant.price) || 0,
            compareAtPrice: parseFloat(variant.compare_at_price) || 0,
            cost: parseFloat(variant.inventory_item?.cost) || 0,
            barcode: variant.barcode || '',
            weight: variant.weight || 0,
            weightUnit: variant.weight_unit || 'lb',
            // Shopify IDs (for reference, not for matching)
            shopifyProductId: product.id,
            shopifyVariantId: variant.id,
            shopifyInventoryItemId: variant.inventory_item_id,
          };
        });
      });
     
      return res.status(200).json({
        success: true,
        syncType: 'products',
        productCount: products.length,
        variantCount,
        skuCount,
        skusWithoutSku: variantCount - skuCount,
        catalog: productCatalog,
      });
     
    } catch (err) {
      console.error('Product catalog sync error:', err);
      return res.status(500).json({ error: `Product sync failed: ${err.message}` });
    }
  }
  // ============ INVENTORY SYNC ============
  if (syncType === 'inventory') {
    try {
      // Step 1: Get all locations (warehouses)
      const locationsRes = await fetch(`${baseUrl}/locations.json`, {
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json',
        },
      });
     
      if (!locationsRes.ok) {
        return res.status(locationsRes.status).json({ error: 'Failed to fetch locations' });
      }
     
      const locationsData = await locationsRes.json();
      const allLocations = locationsData.locations || [];
     
      // Create location map for easy lookup
      const locationMap = {};
      allLocations.forEach(loc => {
        const nameLower = loc.name.toLowerCase();
        // Identify location type based on name
        let locType = 'other';
        if (nameLower.includes('wormans') || nameLower.includes('worman') ||
            nameLower.includes('home') || nameLower.includes('office')) {
          locType = 'home';
        } else if (nameLower.includes('excel') || nameLower.includes('3pl') ||
                   nameLower.includes('packiyo') || nameLower.includes('warehouse') ||
                   nameLower.includes('fulfillment')) {
          locType = '3pl';
        }
       
        locationMap[loc.id] = {
          id: loc.id,
          name: loc.name,
          address: loc.address1,
          city: loc.city,
          province: loc.province,
          country: loc.country,
          isActive: loc.active,
          type: locType,
        };
      });
     
      // FILTER: Only sync from home location (Wormans Mill), NOT 3PL
      // 3PL inventory comes from Packiyo sync instead
      const homeLocations = allLocations.filter(loc => {
        const nameLower = loc.name.toLowerCase();
        return nameLower.includes('wormans') || nameLower.includes('worman') ||
               nameLower.includes('home') || nameLower.includes('office');
      });
     
      if (homeLocations.length === 0) {
        // Fallback: exclude known 3PL locations
        const non3plLocations = allLocations.filter(loc => {
          const nameLower = loc.name.toLowerCase();
          return !nameLower.includes('excel') && !nameLower.includes('3pl') &&
                 !nameLower.includes('packiyo') && !nameLower.includes('warehouse') &&
                 !nameLower.includes('fulfillment');
        });
        homeLocations.push(...non3plLocations);
      }
     
      // Use only home locations for inventory
      const locations = homeLocations;
     
      console.log('Syncing inventory from locations:', locations.map(l => l.name).join(', '));
      console.log('Excluded 3PL locations:', allLocations.filter(l => !locations.includes(l)).map(l => l.name).join(', ') || 'none');
     
      // Step 2: Get all products with variants (for SKU mapping)
      const products = [];
      let pageInfo = null;
      let hasNextPage = true;
     
      while (hasNextPage) {
        let url;
        if (pageInfo) {
          url = `${baseUrl}/products.json?page_info=${pageInfo}&limit=250`;
        } else {
          url = `${baseUrl}/products.json?limit=250`;
        }
       
        const productsRes = await fetch(url, {
          headers: {
            'X-Shopify-Access-Token': token,
            'Content-Type': 'application/json',
          },
        });
       
        if (!productsRes.ok) {
          return res.status(productsRes.status).json({ error: 'Failed to fetch products' });
        }
       
        const data = await productsRes.json();
        products.push(...(data.products || []));
       
        // Check pagination
        const linkHeader = productsRes.headers.get('Link');
        if (linkHeader && linkHeader.includes('rel="next"')) {
          const nextMatch = linkHeader.match(/<[^>]*page_info=([^>&]+)[^>]*>;\s*rel="next"/);
          pageInfo = nextMatch ? nextMatch[1] : null;
          hasNextPage = !!pageInfo;
        } else {
          hasNextPage = false;
        }
       
        if (products.length > 5000) break; // Safety limit
        // Rate limit delay
        await new Promise(r => setTimeout(r, 500));
      }
     
      // Build variant/SKU map - SKU IS THE PRIMARY KEY
      // Items without SKUs cannot be matched across systems and are skipped
      const variantMap = {}; // inventory_item_id -> { sku, name, product_id, variant_id }
      let skippedNoSku = 0;
     
      products.forEach(product => {
        (product.variants || []).forEach(variant => {
          const sku = variant.sku?.trim().toLowerCase(); // Normalize case for matching
         
          // SKU is REQUIRED - skip items without it
          if (!sku) {
            skippedNoSku++;
            return;
          }
         
          if (variant.inventory_item_id) {
            variantMap[variant.inventory_item_id] = {
              sku: sku, // PRIMARY KEY
              name: product.title + (variant.title !== 'Default Title' ? ` - ${variant.title}` : ''),
              productId: product.id,
              variantId: variant.id,
              price: parseFloat(variant.price) || 0,
              cost: parseFloat(variant.inventory_item?.cost) || 0,
            };
          }
        });
      });
     
      // Step 3: Get inventory levels for all locations
      const inventoryItems = [];
      const locationIds = locations.map(l => l.id).join(',');
     
      // Need to fetch inventory levels in batches by inventory_item_id
      const inventoryItemIds = Object.keys(variantMap);
      const batchSize = 50; // Shopify limit
     
      for (let i = 0; i < inventoryItemIds.length; i += batchSize) {
        const batchIds = inventoryItemIds.slice(i, i + batchSize).join(',');
       
        const levelsRes = await fetch(
          `${baseUrl}/inventory_levels.json?inventory_item_ids=${batchIds}&location_ids=${locationIds}`,
          {
            headers: {
              'X-Shopify-Access-Token': token,
              'Content-Type': 'application/json',
            },
          }
        );
       
        if (levelsRes.ok) {
          const levelsData = await levelsRes.json();
          inventoryItems.push(...(levelsData.inventory_levels || []));
        }
       
        // Delay to avoid rate limits
        if (i + batchSize < inventoryItemIds.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
     
      // Step 4: Aggregate inventory by SKU and location
      // SKU is the PRIMARY KEY - this allows matching with Amazon data
      const inventoryBySku = {};
      let totalUnits = 0;
      let totalValue = 0;
     
      inventoryItems.forEach(level => {
        const variant = variantMap[level.inventory_item_id];
        if (!variant) return;
       
        const location = locationMap[level.location_id];
        const qty = level.available || 0;
       
        if (!inventoryBySku[variant.sku]) {
          inventoryBySku[variant.sku] = {
            sku: variant.sku,
            name: variant.name,
            price: variant.price,
            cost: variant.cost,
            totalQty: 0,
            totalValue: 0,
            byLocation: {},
            locations: [],
          };
        }
       
        inventoryBySku[variant.sku].totalQty += qty;
        inventoryBySku[variant.sku].totalValue += qty * (variant.cost || 0);
        totalUnits += qty;
        totalValue += qty * (variant.cost || 0);
       
        if (qty > 0 || location) {
          const locName = location?.name || `Location ${level.location_id}`;
          const locType = location?.type || 'other';
         
          inventoryBySku[variant.sku].byLocation[locName] = {
            qty,
            locationId: level.location_id,
            type: locType,
          };
         
          if (!inventoryBySku[variant.sku].locations.includes(locName)) {
            inventoryBySku[variant.sku].locations.push(locName);
          }
        }
      });
     
      // Format for app's inventory structure
      const inventorySnapshot = {
        date: new Date().toISOString().split('T')[0],
        source: 'shopify-home-only', // Only syncing from home location (Wormans Mill)
        syncedLocations: locations.map(l => l.name), // Which locations were synced
        excludedLocations: allLocations.filter(l => !locations.find(h => h.id === l.id)).map(l => l.name),
        locations: Object.values(locationMap),
        summary: {
          totalUnits,
          totalValue,
          homeUnits: totalUnits, // All units are from home since we filtered
          skuCount: Object.keys(inventoryBySku).length,
          skippedNoSku, // Items without SKU cannot be matched across systems
          locationCount: locations.length,
          note: '3PL inventory excluded - use Packiyo sync for 3PL',
        },
        items: Object.values(inventoryBySku)
          .map(item => ({
            sku: item.sku, // PRIMARY KEY - matches across Amazon & Shopify
            name: item.name, // Display only - may differ between platforms
            totalQty: item.totalQty,
            homeQty: item.totalQty, // All qty is home qty since we filtered to home only
            threeplQty: 0, // 3PL not included in this sync
            cost: item.cost,
            totalValue: item.totalValue,
            locations: item.locations,
            byLocation: item.byLocation,
          }))
          .sort((a, b) => b.totalValue - a.totalValue),
      };
     
      return res.status(200).json({
        success: true,
        syncType: 'inventory',
        ...inventorySnapshot,
      });
     
    } catch (err) {
      console.error('Inventory sync error:', err);
      return res.status(500).json({ error: `Inventory sync failed: ${err.message}` });
    }
  }
  // Validate date range for sync
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Missing date range' });
  }

  // Add date format validation
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return res.status(400).json({ error: 'Invalid date format (YYYY-MM-DD required)' });
  }

  try {
    // Fetch orders from Shopify
    const orders = [];
    let pageInfo = null;
    let hasNextPage = true;
   
    // Format dates for Shopify API
    const startDateTime = `${startDate}T00:00:00-00:00`;
    const endDateTime = `${endDate}T23:59:59-00:00`;
   
    while (hasNextPage) {
      let url;
      if (pageInfo) {
        url = `${baseUrl}/orders.json?page_info=${pageInfo}&limit=250`;
      } else {
        url = `${baseUrl}/orders.json?created_at_min=${startDateTime}&created_at_max=${endDateTime}&status=any&limit=250`;
      }
     
      const ordersRes = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json',
        },
      });
     
      if (!ordersRes.ok) {
        const errorText = await ordersRes.text();
        console.error('Orders fetch error:', ordersRes.status, errorText);
        return res.status(ordersRes.status).json({ error: `Failed to fetch orders: ${ordersRes.status}` });
      }
     
      const data = await ordersRes.json();
      orders.push(...(data.orders || []));
     
      // Check for pagination
      const linkHeader = ordersRes.headers.get('Link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const nextMatch = linkHeader.match(/<[^>]*page_info=([^>&]+)[^>]*>;\s*rel="next"/);
        pageInfo = nextMatch ? nextMatch[1] : null;
        hasNextPage = !!pageInfo;
      } else {
        hasNextPage = false;
      }
     
      // Safety limit
      if (orders.length > 10000) {
        console.warn('Hit safety limit of 10,000 orders');
        break;
      }
      // Rate limit delay
      await new Promise(r => setTimeout(r, 500));
    }
    // Process orders into daily/weekly format
    const dailyData = {};
    const weeklyData = {};
    const skuTotals = {};
    let totalRevenue = 0;
    let totalUnits = 0;
    let totalDiscounts = 0;
    const taxByJurisdiction = {};
   
    // Tax tracking - separate Shop Pay vs non-Shop Pay
    const taxByState = {}; // { stateCode: { taxCollected, taxableSales, orderCount, excludedShopPayTax } }
    let totalTaxCollected = 0;
    let totalShopPayTaxExcluded = 0;
    let shopPayOrderCount = 0;
   
    // Track all payment gateways seen (for debugging Shop Pay detection)
    const allPaymentGateways = new Set();
    const shopPayGatewaysFound = new Set();
    // Helper to get week ending (Sunday)
    const getWeekEnding = (dateStr) => {
      const date = new Date(dateStr);
      const day = date.getDay();
      const daysUntilSunday = day === 0 ? 0 : 7 - day;
      date.setDate(date.getDate() + daysUntilSunday);
      return date.toISOString().split('T')[0];
    };
   
    // Helper to check if order used Shop Pay (accelerated checkout)
    // IMPORTANT: "shopify_payments" is just credit card processing - NOT Shop Pay
    // Only actual "shop_pay" orders have tax remitted by Shopify
    const isShopPayOrder = (order) => {
      const transactions = order.transactions || [];
      (order.payment_gateway_names || []).forEach(g => allPaymentGateways.add(g)); // Keep debug
      return transactions.some(tx => {
        const receipt = tx.receipt || {};
        const paymentDetails = tx.payment_details || {};
        const isShopPayWallet = receipt.wallet_type?.toLowerCase() === 'shop_pay' ||
                               receipt.wallet_payment_method?.toLowerCase()?.includes('shop_pay');
        const isShopPayCard = paymentDetails.credit_card_company?.toLowerCase() === 'shop pay';
        const isShopPayInstallments = paymentDetails.payment_method_name === 'shop_pay_installments' ||
                                     paymentDetails.payment_method_name?.toLowerCase()?.includes('shop pay installments');
        if (isShopPayWallet || isShopPayCard || isShopPayInstallments) {
          const method = isShopPayWallet ? 'wallet_type' :
                         isShopPayCard ? 'credit_card_company' :
                         'installments';
          shopPayGatewaysFound.add(method);
          return true;
        }
        return false;
      });
    };
   
    // Helper to get state code from order
    const getStateCode = (order) => {
      // Try billing address first, then shipping
      const billing = order.billing_address;
      const shipping = order.shipping_address;
     
      // Province code is the state abbreviation (e.g., "WV", "CA")
      return billing?.province_code || shipping?.province_code || null;
    };
    // Process each order
    for (const order of orders) {
      try {
        // Skip cancelled/refunded orders in most calculations
        const isCancelled = Boolean(order.cancelled_at);
        if (isCancelled) continue;
       
        // Defensive check for created_at
        if (!order.created_at) {
          console.warn('Order missing created_at:', order.id);
          continue;
        }
       
        const orderDate = order.created_at.split('T')[0];
        const weekEnding = getWeekEnding(orderDate);
        const isShopPay = isShopPayOrder(order);
        const stateCode = getStateCode(order);
     
      if (isShopPay) shopPayOrderCount++;
     
      // Initialize daily data
      if (!dailyData[orderDate]) {
        dailyData[orderDate] = {
          shopify: {
            revenue: 0,
            netSales: 0,
            shipping: 0,
            shippingCollected: 0,
            units: 0,
            discounts: 0,
            orders: 0,
            skuData: [],
            taxTotal: 0,
            taxTotalAll: 0,
            taxByState: {},
            shopPayOrders: 0,
            shopPayTaxExcluded: 0,
          },
          total: { revenue: 0, units: 0 },
        };
      }
     
      // Initialize weekly data
      if (!weeklyData[weekEnding]) {
        weeklyData[weekEnding] = {
          shopify: {
            revenue: 0,
            netSales: 0,
            shipping: 0,
            shippingCollected: 0,
            units: 0,
            discounts: 0,
            orders: 0,
            skuData: [],
            taxTotal: 0,
            taxTotalAll: 0,
            taxByState: {},
            shopPayOrders: 0,
            shopPayTaxExcluded: 0,
          },
          total: { revenue: 0, units: 0 },
        };
      }
      // Order totals (prefer current_* fields so edits/refunds are reflected)
      const orderTotalSales = parseFloat(order.current_total_price ?? order.total_price) || 0;
      const orderDiscount = parseFloat(order.current_total_discounts ?? order.total_discounts) || 0;
      const orderTax = parseFloat(order.current_total_tax ?? order.total_tax) || 0;
      // Net item sales (excludes tax + shipping). Used for SKU attribution and debugging.
      const orderNetItemSales = parseFloat(order.current_subtotal_price ?? order.subtotal_price) || 0;
      const orderSubtotal = orderNetItemSales;
      // Track shipping separately
      const orderShipping = parseFloat(order.total_shipping_price_set?.shop_money?.amount) ||
                           parseFloat(order.shipping_lines?.reduce((s, l) => s + parseFloat(l.price || 0), 0)) || 0;
      // Calculate shipping tax from tax_lines
      const shippingTax = (order.tax_lines || [])
        .filter(t => t.title?.toLowerCase().includes('shipping'))
        .reduce((s, t) => s + parseFloat(t.price || 0), 0);
     
      const orderRevenue = orderNetItemSales + orderShipping; // Net sales + shipping collected (excludes tax)
      dailyData[orderDate].shopify.revenue += orderRevenue;
      dailyData[orderDate].shopify.discounts += orderDiscount;
      dailyData[orderDate].shopify.netSales += orderNetItemSales;
      dailyData[orderDate].shopify.shippingCollected += orderShipping;
      dailyData[orderDate].shopify.taxTotalAll += orderTax;
      dailyData[orderDate].shopify.orders += 1;
      dailyData[orderDate].total.revenue += orderRevenue;
     
      weeklyData[weekEnding].shopify.revenue += orderRevenue;
      weeklyData[weekEnding].shopify.discounts += orderDiscount;
      weeklyData[weekEnding].shopify.netSales += orderNetItemSales;
      weeklyData[weekEnding].shopify.shippingCollected += orderShipping;
      weeklyData[weekEnding].shopify.taxTotalAll += orderTax;
      weeklyData[weekEnding].shopify.orders += 1;
      weeklyData[weekEnding].total.revenue += orderRevenue;
     
      totalRevenue += orderRevenue;
      totalDiscounts += orderDiscount;
      // Process tax - EXCLUDE Shop Pay orders from tax totals
      // (Shopify remits tax automatically for Shop Pay orders)
      // BUT still track ALL orders in taxByState for visibility
     
      // First, track this order in daily/weekly taxByState regardless of Shop Pay status
      // This ensures we have complete sales data by state
      if (stateCode) {
        // Daily state tracking (ALL orders)
        if (!dailyData[orderDate].shopify.taxByState[stateCode]) {
          dailyData[orderDate].shopify.taxByState[stateCode] = {
            tax: 0,
            sales: 0, // Item subtotal only
            shipping: 0, // Shipping charges
            orders: 0,
            shopPayTax: 0,
            shopPaySales: 0,
            shopPayShipping: 0,
            shopPayOrders: 0,
            jurisdictions: {}
          };
        }
        dailyData[orderDate].shopify.taxByState[stateCode].sales += orderSubtotal;
        dailyData[orderDate].shopify.taxByState[stateCode].shipping += orderShipping;
        dailyData[orderDate].shopify.taxByState[stateCode].orders += 1;
       
        // Weekly state tracking (ALL orders)
        if (!weeklyData[weekEnding].shopify.taxByState[stateCode]) {
          weeklyData[weekEnding].shopify.taxByState[stateCode] = {
            tax: 0,
            sales: 0,
            shipping: 0,
            orders: 0,
            shopPayTax: 0,
            shopPaySales: 0,
            shopPayShipping: 0,
            shopPayOrders: 0,
            jurisdictions: {}
          };
        }
        weeklyData[weekEnding].shopify.taxByState[stateCode].sales += orderSubtotal;
        weeklyData[weekEnding].shopify.taxByState[stateCode].shipping += orderShipping;
        weeklyData[weekEnding].shopify.taxByState[stateCode].orders += 1;
       
        // Global state tracking
        if (!taxByState[stateCode]) {
          taxByState[stateCode] = {
            stateCode,
            taxCollected: 0,
            itemSales: 0, // Renamed for clarity
            shipping: 0,
            orderCount: 0,
            excludedShopPayTax: 0,
            shopPaySales: 0,
            shopPayShipping: 0,
            shopPayOrders: 0,
          };
        }
        taxByState[stateCode].itemSales += orderSubtotal;
        taxByState[stateCode].shipping += orderShipping;
        taxByState[stateCode].orderCount += 1;
      }
     
      // Now handle tax amounts based on Shop Pay status
      if (isShopPay) {
        // Track excluded tax for reporting (Shopify remits this)
        dailyData[orderDate].shopify.shopPayOrders += 1;
        dailyData[orderDate].shopify.shopPayTaxExcluded += orderTax;
        weeklyData[weekEnding].shopify.shopPayOrders += 1;
        weeklyData[weekEnding].shopify.shopPayTaxExcluded += orderTax;
        totalShopPayTaxExcluded += orderTax;
       
        // Track Shop Pay tax separately by state (for visibility, not filing)
        if (stateCode) {
          dailyData[orderDate].shopify.taxByState[stateCode].shopPayTax += orderTax;
          dailyData[orderDate].shopify.taxByState[stateCode].shopPaySales += orderSubtotal;
          dailyData[orderDate].shopify.taxByState[stateCode].shopPayShipping += orderShipping;
          dailyData[orderDate].shopify.taxByState[stateCode].shopPayOrders += 1;
         
          weeklyData[weekEnding].shopify.taxByState[stateCode].shopPayTax += orderTax;
          weeklyData[weekEnding].shopify.taxByState[stateCode].shopPaySales += orderSubtotal;
          weeklyData[weekEnding].shopify.taxByState[stateCode].shopPayShipping += orderShipping;
          weeklyData[weekEnding].shopify.taxByState[stateCode].shopPayOrders += 1;
         
          taxByState[stateCode].excludedShopPayTax += orderTax;
          taxByState[stateCode].shopPaySales += orderSubtotal;
          taxByState[stateCode].shopPayShipping += orderShipping;
          taxByState[stateCode].shopPayOrders += 1;
        }
      } else {
        // Include tax in totals for non-Shop Pay orders (YOU owe this tax)
        dailyData[orderDate].shopify.taxTotal += orderTax;
        weeklyData[weekEnding].shopify.taxTotal += orderTax;
        totalTaxCollected += orderTax;
       
        // Add to taxByState for non-Shop Pay (this is what you file)
        if (stateCode) {
          dailyData[orderDate].shopify.taxByState[stateCode].tax += orderTax;
          weeklyData[weekEnding].shopify.taxByState[stateCode].tax += orderTax;
          taxByState[stateCode].taxCollected += orderTax;
        }
      }
      // Process tax jurisdictions (for detailed reporting by state/county/city)
      for (const taxLine of order.tax_lines || []) {
        const jurisdiction = taxLine.title || 'Unknown';
        const taxAmount = parseFloat(taxLine.price) || 0;
        const taxRate = parseFloat(taxLine.rate) || 0;
       
        // Global jurisdiction tracking
        if (!taxByJurisdiction[jurisdiction]) {
          taxByJurisdiction[jurisdiction] = { total: 0, shopPayExcluded: 0, rate: taxRate };
        }
       
        if (isShopPay) {
          taxByJurisdiction[jurisdiction].shopPayExcluded += taxAmount;
        } else {
          taxByJurisdiction[jurisdiction].total += taxAmount;
        }
       
        // Track jurisdiction data by state for state-specific filing
        if (stateCode) {
          // Initialize jurisdiction tracking in daily/weekly data
          if (!dailyData[orderDate].shopify.taxByState[stateCode].jurisdictions) {
            dailyData[orderDate].shopify.taxByState[stateCode].jurisdictions = {};
          }
          if (!dailyData[orderDate].shopify.taxByState[stateCode].jurisdictions[jurisdiction]) {
            dailyData[orderDate].shopify.taxByState[stateCode].jurisdictions[jurisdiction] = {
              tax: 0, sales: 0, rate: taxRate, orders: 0
            };
          }
          dailyData[orderDate].shopify.taxByState[stateCode].jurisdictions[jurisdiction].tax += isShopPay ? 0 : taxAmount;
          dailyData[orderDate].shopify.taxByState[stateCode].jurisdictions[jurisdiction].sales += orderSubtotal;
          dailyData[orderDate].shopify.taxByState[stateCode].jurisdictions[jurisdiction].orders += 1;

          // Add weekly jurisdiction tracking for consistency
          if (!weeklyData[weekEnding].shopify.taxByState[stateCode].jurisdictions) {
            weeklyData[weekEnding].shopify.taxByState[stateCode].jurisdictions = {};
          }
          if (!weeklyData[weekEnding].shopify.taxByState[stateCode].jurisdictions[jurisdiction]) {
            weeklyData[weekEnding].shopify.taxByState[stateCode].jurisdictions[jurisdiction] = {
              tax: 0, sales: 0, rate: taxRate, orders: 0
            };
          }
          weeklyData[weekEnding].shopify.taxByState[stateCode].jurisdictions[jurisdiction].tax += isShopPay ? 0 : taxAmount;
          weeklyData[weekEnding].shopify.taxByState[stateCode].jurisdictions[jurisdiction].sales += orderSubtotal;
          weeklyData[weekEnding].shopify.taxByState[stateCode].jurisdictions[jurisdiction].orders += 1;
        }
      }
      // Process line items for SKU data
      // SKU is the PRIMARY KEY - only items with real SKUs can be matched across systems
      for (const item of order.line_items || []) {
        const sku = item.sku?.trim();
        const productName = item.name || item.title || 'Unknown Product';
        const quantity = item.quantity || 0;
        const lineGross = (parseFloat(item.price) || 0) * quantity;
        const allocDiscount = (item.discount_allocations || []).reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
        const fallbackDiscount = parseFloat(item.total_discount) || 0;
        const itemDiscount = allocDiscount || fallbackDiscount;
        const itemRevenue = lineGross - itemDiscount;
       
        dailyData[orderDate].shopify.units += quantity;
        dailyData[orderDate].total.units += quantity;
        weeklyData[weekEnding].shopify.units += quantity;
        weeklyData[weekEnding].total.units += quantity;
       
        totalUnits += quantity;
       
        // Only track SKU-level data for items WITH a SKU
        // Items without SKU still count toward total units/revenue but can't be matched
        if (sku) {
          // Track SKU totals
          if (!skuTotals[sku]) {
            skuTotals[sku] = { sku, productName, units: 0, revenue: 0, grossRevenue: 0, discounts: 0 };
          }
          skuTotals[sku].units += quantity;
          skuTotals[sku].revenue += itemRevenue;
          skuTotals[sku].grossRevenue += lineGross;
          skuTotals[sku].discounts += itemDiscount;
         
          // Add to daily SKU data
          const existingDailySku = dailyData[orderDate].shopify.skuData.find(s => s.sku === sku);
          if (existingDailySku) {
            existingDailySku.unitsSold += quantity;
            existingDailySku.netSales += itemRevenue;
            existingDailySku.discounts += itemDiscount;
            existingDailySku.grossSales += lineGross;
          } else {
            dailyData[orderDate].shopify.skuData.push({
              sku, // PRIMARY KEY
              name: productName, // Display only
              unitsSold: quantity,
              netSales: itemRevenue,
              discounts: itemDiscount,
              grossSales: lineGross,
              cogs: 0, // filled client-side from your uploaded COGS file
            });
          }
         
          // Add to weekly SKU data
          const existingWeeklySku = weeklyData[weekEnding].shopify.skuData.find(s => s.sku === sku);
          if (existingWeeklySku) {
            existingWeeklySku.unitsSold += quantity;
            existingWeeklySku.netSales += itemRevenue;
            existingWeeklySku.discounts += itemDiscount;
            existingWeeklySku.grossSales += lineGross; // Added for consistency
          } else {
            weeklyData[weekEnding].shopify.skuData.push({
              sku, // PRIMARY KEY
              name: productName, // Display only
              unitsSold: quantity,
              netSales: itemRevenue,
              discounts: itemDiscount,
              grossSales: lineGross, // Added for consistency
              cogs: 0, // filled client-side from your uploaded COGS file
            });
          }
        }
      }
      } catch (orderErr) {
        // Log and skip problematic orders instead of crashing
        console.error('Error processing order:', order?.id || 'unknown', orderErr.message);
        continue;
      }
    }
    // Sort SKU data in each day/week by units descending
    Object.values(dailyData).forEach(d => {
      d.shopify.skuData.sort((a, b) => (b.unitsSold || 0) - (a.unitsSold || 0));
    });
    Object.values(weeklyData).forEach(w => {
      w.shopify.skuData.sort((a, b) => (b.unitsSold || 0) - (a.unitsSold || 0));
    });
    // Build SKU breakdown for preview
    const skuBreakdown = Object.values(skuTotals)
      .sort((a, b) => b.units - a.units)
      .slice(0, 20);
   
    // Build tax by state summary
    const taxByStateSummary = Object.values(taxByState)
      .sort((a, b) => b.taxCollected - a.taxCollected);
    // Return response
    // Log payment gateway info for debugging
    console.log('Payment Gateways Found:', Array.from(allPaymentGateways));
    console.log('Shop Pay Gateways Matched:', Array.from(shopPayGatewaysFound));
    console.log(`Shop Pay Orders: ${shopPayOrderCount} out of ${orders.length} total orders`);
   
    return res.status(200).json({
      success: true,
      orderCount: orders.length,
      totalRevenue,
      totalUnits,
      totalDiscounts,
      uniqueDays: Object.keys(dailyData).length,
      uniqueWeeks: Object.keys(weeklyData).length,
      skuBreakdown,
      // Enhanced tax data
      tax: {
        totalCollected: totalTaxCollected,
        shopPayExcluded: totalShopPayTaxExcluded,
        shopPayOrderCount,
        byState: taxByStateSummary,
        byJurisdiction: taxByJurisdiction,
        // Payment gateway debugging info
        paymentGateways: Array.from(allPaymentGateways),
        shopPayGatewaysMatched: Array.from(shopPayGatewaysFound),
      },
      taxByJurisdiction, // Keep for backward compatibility
      dateRange: { start: startDate, end: endDate },
      ...(preview ? {} : { dailyData, weeklyData }),
    });
  } catch (err) {
    console.error('Sync error:', err);
    return res.status(500).json({ error: `Sync failed: ${err.message}` });
  }
}