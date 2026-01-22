// Vercel Serverless Function - Shopify Sync API
// Path: /api/shopify/sync.js
// This handles secure communication with Shopify's Admin API
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

  const { storeUrl, accessToken, startDate, endDate, preview, test, syncType } = req.body;
  
  // syncType can be: 'orders' (default), 'inventory', 'both'

  // Validate required fields
  if (!storeUrl || !accessToken) {
    return res.status(400).json({ error: 'Missing store URL or access token' });
  }

  // Clean up store URL
  let cleanStoreUrl = storeUrl.trim().toLowerCase();
  cleanStoreUrl = cleanStoreUrl.replace(/^https?:\/\//, '');
  cleanStoreUrl = cleanStoreUrl.replace(/\/$/, '');
  if (!cleanStoreUrl.includes('.myshopify.com')) {
    cleanStoreUrl = cleanStoreUrl.replace('.myshopify.com', '') + '.myshopify.com';
  }

  const baseUrl = `https://${cleanStoreUrl}/admin/api/2024-01`;

  // Test connection
  if (test) {
    try {
      const shopRes = await fetch(`${baseUrl}/shop.json`, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      });
      
      if (!shopRes.ok) {
        const errorText = await shopRes.text();
        console.error('Shopify API error:', shopRes.status, errorText);
        if (shopRes.status === 401) {
          return res.status(401).json({ error: 'Invalid access token. Please check your credentials.' });
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
      });
    } catch (err) {
      console.error('Connection test error:', err);
      return res.status(500).json({ error: `Connection failed: ${err.message}` });
    }
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
            'X-Shopify-Access-Token': accessToken,
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
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      });
      
      if (!locationsRes.ok) {
        return res.status(locationsRes.status).json({ error: 'Failed to fetch locations' });
      }
      
      const locationsData = await locationsRes.json();
      const locations = locationsData.locations || [];
      
      // Create location map for easy lookup
      const locationMap = {};
      locations.forEach(loc => {
        locationMap[loc.id] = {
          id: loc.id,
          name: loc.name,
          address: loc.address1,
          city: loc.city,
          province: loc.province,
          country: loc.country,
          isActive: loc.active,
          // Identify location type based on name
          type: loc.name.toLowerCase().includes('packiyo') || 
                loc.name.toLowerCase().includes('3pl') || 
                loc.name.toLowerCase().includes('warehouse') ||
                loc.name.toLowerCase().includes('fulfillment')
                  ? '3pl' 
                  : loc.name.toLowerCase().includes('home') || 
                    loc.name.toLowerCase().includes('office')
                    ? 'home'
                    : 'other',
        };
      });
      
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
            'X-Shopify-Access-Token': accessToken,
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
      }
      
      // Build variant/SKU map - SKU IS THE PRIMARY KEY
      // Items without SKUs cannot be matched across systems and are skipped
      const variantMap = {}; // inventory_item_id -> { sku, name, product_id, variant_id }
      let skippedNoSku = 0;
      
      products.forEach(product => {
        (product.variants || []).forEach(variant => {
          const sku = variant.sku?.trim();
          
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
              'X-Shopify-Access-Token': accessToken,
              'Content-Type': 'application/json',
            },
          }
        );
        
        if (levelsRes.ok) {
          const levelsData = await levelsRes.json();
          inventoryItems.push(...(levelsData.inventory_levels || []));
        }
        
        // Small delay to avoid rate limits
        if (i + batchSize < inventoryItemIds.length) {
          await new Promise(r => setTimeout(r, 100));
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
      
      // Build summary by location type
      const byLocationType = { '3pl': 0, home: 0, other: 0 };
      Object.values(inventoryBySku).forEach(item => {
        Object.entries(item.byLocation).forEach(([locName, locData]) => {
          byLocationType[locData.type] = (byLocationType[locData.type] || 0) + locData.qty;
        });
      });
      
      // Format for app's inventory structure
      const inventorySnapshot = {
        date: new Date().toISOString().split('T')[0],
        source: 'shopify-sync',
        locations: Object.values(locationMap),
        summary: {
          totalUnits,
          totalValue,
          threeplUnits: byLocationType['3pl'],
          homeUnits: byLocationType['home'] || 0,
          otherUnits: byLocationType['other'] || 0,
          skuCount: Object.keys(inventoryBySku).length,
          skippedNoSku, // Items without SKU cannot be matched across systems
          locationCount: locations.length,
        },
        items: Object.values(inventoryBySku)
          .map(item => ({
            sku: item.sku, // PRIMARY KEY - matches across Amazon & Shopify
            name: item.name, // Display only - may differ between platforms
            totalQty: item.totalQty,
            threeplQty: Object.entries(item.byLocation)
              .filter(([_, d]) => d.type === '3pl')
              .reduce((sum, [_, d]) => sum + d.qty, 0),
            homeQty: Object.entries(item.byLocation)
              .filter(([_, d]) => d.type === 'home')
              .reduce((sum, [_, d]) => sum + d.qty, 0),
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
          'X-Shopify-Access-Token': accessToken,
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

    // Helper to get week ending (Sunday)
    const getWeekEnding = (dateStr) => {
      const date = new Date(dateStr);
      const day = date.getDay();
      const daysUntilSunday = day === 0 ? 0 : 7 - day;
      date.setDate(date.getDate() + daysUntilSunday);
      return date.toISOString().split('T')[0];
    };
    
    // Helper to check if order used Shop Pay
    const isShopPayOrder = (order) => {
      const gateways = order.payment_gateway_names || [];
      return gateways.some(g => 
        g.toLowerCase().includes('shopify_payments') || 
        g.toLowerCase().includes('shop_pay') ||
        g.toLowerCase() === 'shopify payments'
      );
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
      // Skip cancelled/refunded orders in most calculations
      const isCancelled = order.cancelled_at || order.financial_status === 'refunded';
      if (isCancelled) continue;
      
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
            units: 0,
            discounts: 0,
            orders: 0,
            skuData: [],
            taxTotal: 0,
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
            units: 0,
            discounts: 0,
            orders: 0,
            skuData: [],
            taxTotal: 0,
            taxByState: {},
            shopPayOrders: 0,
            shopPayTaxExcluded: 0,
          },
          total: { revenue: 0, units: 0 },
        };
      }

      // Order totals
      const orderRevenue = parseFloat(order.total_price) || 0;
      const orderDiscount = parseFloat(order.total_discounts) || 0;
      const orderTax = parseFloat(order.total_tax) || 0;
      
      dailyData[orderDate].shopify.revenue += orderRevenue;
      dailyData[orderDate].shopify.discounts += orderDiscount;
      dailyData[orderDate].shopify.orders += 1;
      dailyData[orderDate].total.revenue += orderRevenue;
      
      weeklyData[weekEnding].shopify.revenue += orderRevenue;
      weeklyData[weekEnding].shopify.discounts += orderDiscount;
      weeklyData[weekEnding].shopify.orders += 1;
      weeklyData[weekEnding].total.revenue += orderRevenue;
      
      totalRevenue += orderRevenue;
      totalDiscounts += orderDiscount;

      // Process tax - EXCLUDE Shop Pay orders from tax totals
      // (Shopify remits tax automatically for Shop Pay orders)
      if (isShopPay) {
        // Track excluded tax for reporting
        dailyData[orderDate].shopify.shopPayOrders += 1;
        dailyData[orderDate].shopify.shopPayTaxExcluded += orderTax;
        weeklyData[weekEnding].shopify.shopPayOrders += 1;
        weeklyData[weekEnding].shopify.shopPayTaxExcluded += orderTax;
        totalShopPayTaxExcluded += orderTax;
      } else {
        // Include tax in totals for non-Shop Pay orders
        dailyData[orderDate].shopify.taxTotal += orderTax;
        weeklyData[weekEnding].shopify.taxTotal += orderTax;
        totalTaxCollected += orderTax;
        
        // Track by state for filing purposes
        if (stateCode && orderTax > 0) {
          // Initialize state tracking
          if (!taxByState[stateCode]) {
            taxByState[stateCode] = {
              stateCode,
              taxCollected: 0,
              taxableSales: 0,
              orderCount: 0,
              excludedShopPayTax: 0,
            };
          }
          taxByState[stateCode].taxCollected += orderTax;
          taxByState[stateCode].taxableSales += orderRevenue - orderDiscount;
          taxByState[stateCode].orderCount += 1;
          
          // Daily state tracking
          if (!dailyData[orderDate].shopify.taxByState[stateCode]) {
            dailyData[orderDate].shopify.taxByState[stateCode] = { tax: 0, sales: 0, orders: 0 };
          }
          dailyData[orderDate].shopify.taxByState[stateCode].tax += orderTax;
          dailyData[orderDate].shopify.taxByState[stateCode].sales += orderRevenue - orderDiscount;
          dailyData[orderDate].shopify.taxByState[stateCode].orders += 1;
          
          // Weekly state tracking
          if (!weeklyData[weekEnding].shopify.taxByState[stateCode]) {
            weeklyData[weekEnding].shopify.taxByState[stateCode] = { tax: 0, sales: 0, orders: 0 };
          }
          weeklyData[weekEnding].shopify.taxByState[stateCode].tax += orderTax;
          weeklyData[weekEnding].shopify.taxByState[stateCode].sales += orderRevenue - orderDiscount;
          weeklyData[weekEnding].shopify.taxByState[stateCode].orders += 1;
        }
      }

      // Process tax jurisdictions (for detailed reporting)
      for (const taxLine of order.tax_lines || []) {
        const jurisdiction = taxLine.title || 'Unknown';
        const taxAmount = parseFloat(taxLine.price) || 0;
        
        if (!taxByJurisdiction[jurisdiction]) {
          taxByJurisdiction[jurisdiction] = { total: 0, shopPayExcluded: 0 };
        }
        
        if (isShopPay) {
          taxByJurisdiction[jurisdiction].shopPayExcluded += taxAmount;
        } else {
          taxByJurisdiction[jurisdiction].total += taxAmount;
        }
      }

      // Process line items for SKU data
      // SKU is the PRIMARY KEY - only items with real SKUs can be matched across systems
      for (const item of order.line_items || []) {
        const sku = item.sku?.trim();
        const productName = item.name || item.title || 'Unknown Product';
        const quantity = item.quantity || 0;
        const itemRevenue = parseFloat(item.price) * quantity || 0;
        const itemDiscount = parseFloat(item.total_discount) || 0;
        
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
            skuTotals[sku] = { sku, productName, units: 0, revenue: 0, discounts: 0 };
          }
          skuTotals[sku].units += quantity;
          skuTotals[sku].revenue += itemRevenue;
          skuTotals[sku].discounts += itemDiscount;
          
          // Add to daily SKU data
          const existingDailySku = dailyData[orderDate].shopify.skuData.find(s => s.sku === sku);
          if (existingDailySku) {
            existingDailySku.units += quantity;
            existingDailySku.revenue += itemRevenue;
          } else {
            dailyData[orderDate].shopify.skuData.push({
              sku, // PRIMARY KEY
              productName, // Display only
              units: quantity,
              revenue: itemRevenue,
            });
          }
          
          // Add to weekly SKU data
          const existingWeeklySku = weeklyData[weekEnding].shopify.skuData.find(s => s.sku === sku);
          if (existingWeeklySku) {
            existingWeeklySku.units += quantity;
            existingWeeklySku.revenue += itemRevenue;
          } else {
            weeklyData[weekEnding].shopify.skuData.push({
              sku, // PRIMARY KEY
              productName, // Display only
              units: quantity,
              revenue: itemRevenue,
            });
          }
        }
      }
    }

    // Sort SKU data in each day/week by units descending
    Object.values(dailyData).forEach(d => {
      d.shopify.skuData.sort((a, b) => b.units - a.units);
    });
    Object.values(weeklyData).forEach(w => {
      w.shopify.skuData.sort((a, b) => b.units - a.units);
    });

    // Build SKU breakdown for preview
    const skuBreakdown = Object.values(skuTotals)
      .sort((a, b) => b.units - a.units)
      .slice(0, 20);
    
    // Build tax by state summary
    const taxByStateSummary = Object.values(taxByState)
      .sort((a, b) => b.taxCollected - a.taxCollected);

    // Return response
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
