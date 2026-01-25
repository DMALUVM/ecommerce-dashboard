// Vercel Serverless Function - Shopify Sync API
// Path: /api/shopify/sync.js
// Updated for 2026: Supports Client Credentials Grant + improved Shop Pay detection

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { storeUrl, accessToken, clientId, clientSecret, startDate, endDate, preview, test, syncType } = req.body;

  if (!storeUrl) {
    return res.status(400).json({ error: 'Store URL is required' });
  }

  const looksLikeAdminToken = (t) => typeof t === 'string' && t.trim().toLowerCase().startsWith('shpat_');

  const legacyToken = accessToken || (looksLikeAdminToken(clientSecret) ? clientSecret : null);
  const useOAuth = !!(clientId && clientSecret && !looksLikeAdminToken(clientSecret));

  if (!useOAuth && !legacyToken) {
    return res.status(400).json({ error: 'Missing credentials. Provide an Admin API access token (shpat_) or OAuth credentials.' });
  }

  let cleanStoreUrl = storeUrl.trim().toLowerCase();
  cleanStoreUrl = cleanStoreUrl.replace(/^https?:\/\//, '');
  cleanStoreUrl = cleanStoreUrl.replace(/\/$/, '');
  if (!cleanStoreUrl.includes('.myshopify.com')) {
    cleanStoreUrl += '.myshopify.com';
  }

  const baseUrl = `https://${cleanStoreUrl}/admin/api/2026-01`;

  const getAccessToken = async () => {
    if (!useOAuth) return legacyToken;

    try {
      const tokenResponse = await fetch(`https://${cleanStoreUrl}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('OAuth token error:', tokenResponse.status, errorText);
        throw new Error(
          tokenResponse.status === 401 || tokenResponse.status === 403
            ? 'Invalid Client ID or Secret.'
            : `Failed to get access token: ${tokenResponse.status}`
        );
      }

      const tokenData = await tokenResponse.json();
      return tokenData.access_token;
    } catch (err) {
      console.error('OAuth error:', err);
      throw new Error(`Authentication failed: ${err.message}`);
    }
  };

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
        if (shopRes.status === 401) return res.status(401).json({ error: 'Invalid credentials.' });
        if (shopRes.status === 404) return res.status(404).json({ error: 'Store not found.' });
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

  let token;
  try {
    token = await getAccessToken();
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }

  // PRODUCT CATALOG SYNC (unchanged except version + minor safety)
  if (syncType === 'products') {
    try {
      const products = [];
      let pageInfo = null;
      let hasNextPage = true;

      while (hasNextPage) {
        const url = pageInfo
          ? `${baseUrl}/products.json?page_info=${pageInfo}&limit=250`
          : `${baseUrl}/products.json?limit=250`;

        const productsRes = await fetch(url, {
          headers: {
            'X-Shopify-Access-Token': token,
            'Content-Type': 'application/json',
          },
        });

        if (!productsRes.ok) return res.status(productsRes.status).json({ error: 'Failed to fetch products' });

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

      const productCatalog = {};
      let skuCount = 0;
      let variantCount = 0;

      products.forEach(product => {
        (product.variants || []).forEach(variant => {
          variantCount++;
          const sku = variant.sku?.trim();
          if (!sku) return;
          skuCount++;
          productCatalog[sku] = {
            sku,
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

  // INVENTORY SYNC (unchanged except version)
  if (syncType === 'inventory') {
    // ... (your existing inventory code remains here – no critical bugs found in this block)
    // If you want rate-limit delays added here (e.g. await new Promise(r => setTimeout(r, 300))), let me know.
  }

  // ORDERS SYNC – main fixes applied here
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Missing date range' });
  }

  try {
    const orders = [];
    let pageInfo = null;
    let hasNextPage = true;

    const startDateTime = `${startDate}T00:00:00-00:00`;
    const endDateTime = `${endDate}T23:59:59-00:00`;

    while (hasNextPage) {
      const url = pageInfo
        ? `${baseUrl}/orders.json?page_info=${pageInfo}&limit=250`
        : `${baseUrl}/orders.json?created_at_min=${startDateTime}&created_at_max=${endDateTime}&status=any&limit=250`;

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

      const linkHeader = ordersRes.headers.get('Link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const nextMatch = linkHeader.match(/<[^>]*page_info=([^>&]+)[^>]*>;\s*rel="next"/);
        pageInfo = nextMatch ? nextMatch[1] : null;
        hasNextPage = !!pageInfo;
      } else {
        hasNextPage = false;
      }

      if (orders.length > 10000) {
        console.warn('Hit safety limit of 10,000 orders');
        break;
      }
    }

    const dailyData = {};
    const weeklyData = {};
    const skuTotals = {};
    let totalRevenue = 0;
    let totalUnits = 0;
    let totalDiscounts = 0;
    const taxByJurisdiction = {};
    const taxByState = {};
    let totalTaxCollected = 0;
    let totalShopPayTaxExcluded = 0;
    let shopPayOrderCount = 0;

    const allPaymentGateways = new Set();
    const shopPayGatewaysFound = new Set();

    const getWeekEnding = (dateStr) => {
      const date = new Date(dateStr);
      const day = date.getDay();
      const daysUntilSunday = day === 0 ? 0 : 7 - day;
      date.setDate(date.getDate() + daysUntilSunday);
      return date.toISOString().split('T')[0];
    };

    const isShopPayOrder = (order) => {
      const transactions = order.transactions || [];
      (order.payment_gateway_names || []).forEach(g => allPaymentGateways.add(g));

      return transactions.some(tx => {
        const receipt = tx.receipt || {};
        const paymentDetails = tx.payment_details || {};

        const isShopPayWallet =
          receipt.wallet_type?.toLowerCase() === 'shop_pay' ||
          receipt.wallet_payment_method?.toLowerCase()?.includes('shop_pay');

        const isShopPayCard = paymentDetails.credit_card_company?.toLowerCase() === 'shop pay';

        const isShopPayInstallments =
          paymentDetails.payment_method_name === 'shop_pay_installments' ||
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

    const getStateCode = (order) => {
      const billing = order.billing_address;
      const shipping = order.shipping_address;
      return billing?.province_code || shipping?.province_code || null;
    };

    for (const order of orders) {
      try {
        if (order.cancelled_at) continue;
        if (!order.created_at) {
          console.warn('Order missing created_at:', order.id);
          continue;
        }

        const orderDate = order.created_at.split('T')[0];
        const weekEnding = getWeekEnding(orderDate);
        const isShopPay = isShopPayOrder(order);
        const stateCode = getStateCode(order);

        if (isShopPay) shopPayOrderCount++;

        if (!dailyData[orderDate]) {
          dailyData[orderDate] = {
            shopify: {
              revenue: 0, netSales: 0, shipping: 0, units: 0, discounts: 0, orders: 0,
              skuData: [], taxTotal: 0, taxByState: {}, shopPayOrders: 0, shopPayTaxExcluded: 0,
            },
            total: { revenue: 0, units: 0 },
          };
        }

        if (!weeklyData[weekEnding]) {
          weeklyData[weekEnding] = {
            shopify: {
              revenue: 0, netSales: 0, shipping: 0, units: 0, discounts: 0, orders: 0,
              skuData: [], taxTotal: 0, taxByState: {}, shopPayOrders: 0, shopPayTaxExcluded: 0,
            },
            total: { revenue: 0, units: 0 },
          };
        }

        const orderTotalSales = parseFloat(order.current_total_price ?? order.total_price) || 0;
        const orderDiscount = parseFloat(order.current_total_discounts ?? order.total_discounts) || 0;
        const orderTax = parseFloat(order.current_total_tax ?? order.total_tax) || 0;
        const orderSubtotal = parseFloat(order.current_subtotal_price ?? order.subtotal_price) || 0;
        const orderShipping =
          parseFloat(order.total_shipping_price_set?.shop_money?.amount) ||
          (order.shipping_lines?.reduce((s, l) => s + parseFloat(l.price || 0), 0) || 0);

        dailyData[orderDate].shopify.revenue += orderTotalSales;
        dailyData[orderDate].shopify.discounts += orderDiscount;
        dailyData[orderDate].shopify.netSales += orderSubtotal;
        dailyData[orderDate].shopify.shipping += orderShipping;
        dailyData[orderDate].shopify.orders += 1;
        dailyData[orderDate].total.revenue += orderTotalSales;

        weeklyData[weekEnding].shopify.revenue += orderTotalSales;
        weeklyData[weekEnding].shopify.discounts += orderDiscount;
        weeklyData[weekEnding].shopify.netSales += orderSubtotal;
        weeklyData[weekEnding].shopify.shipping += orderShipping;
        weeklyData[weekEnding].shopify.orders += 1;
        weeklyData[weekEnding].total.revenue += orderTotalSales;

        totalRevenue += orderTotalSales;
        totalDiscounts += orderDiscount;

        // Tax-by-state tracking (ALL orders for visibility)
        if (stateCode) {
          if (!dailyData[orderDate].shopify.taxByState[stateCode]) {
            dailyData[orderDate].shopify.taxByState[stateCode] = {
              tax: 0, sales: 0, shipping: 0, orders: 0,
              shopPayTax: 0, shopPaySales: 0, shopPayShipping: 0, shopPayOrders: 0,
            };
          }
          dailyData[orderDate].shopify.taxByState[stateCode].sales += orderSubtotal;
          dailyData[orderDate].shopify.taxByState[stateCode].shipping += orderShipping;
          dailyData[orderDate].shopify.taxByState[stateCode].orders += 1;

          if (!weeklyData[weekEnding].shopify.taxByState[stateCode]) {
            weeklyData[weekEnding].shopify.taxByState[stateCode] = {
              tax: 0, sales: 0, shipping: 0, orders: 0,
              shopPayTax: 0, shopPaySales: 0, shopPayShipping: 0, shopPayOrders: 0,
            };
          }
          weeklyData[weekEnding].shopify.taxByState[stateCode].sales += orderSubtotal;
          weeklyData[weekEnding].shopify.taxByState[stateCode].shipping += orderShipping;
          weeklyData[weekEnding].shopify.taxByState[stateCode].orders += 1;

          if (!taxByState[stateCode]) {
            taxByState[stateCode] = {
              stateCode,
              taxCollected: 0,
              itemSales: 0,
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

        // Shop Pay vs non-Shop Pay tax logic
        if (isShopPay) {
          dailyData[orderDate].shopify.shopPayOrders += 1;
          dailyData[orderDate].shopify.shopPayTaxExcluded += orderTax;
          weeklyData[weekEnding].shopify.shopPayOrders += 1;
          weeklyData[weekEnding].shopify.shopPayTaxExcluded += orderTax;
          totalShopPayTaxExcluded += orderTax;

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
          // ONLY add to liability totals for non-Shop Pay
          dailyData[orderDate].shopify.taxTotal += orderTax;
          weeklyData[weekEnding].shopify.taxTotal += orderTax;
          totalTaxCollected += orderTax;

          if (stateCode) {
            dailyData[orderDate].shopify.taxByState[stateCode].tax += orderTax;
            weeklyData[weekEnding].shopify.taxByState[stateCode].tax += orderTax;
            taxByState[stateCode].taxCollected += orderTax;
          }
        }

        // Jurisdiction tax lines (unchanged)
        for (const taxLine of order.tax_lines || []) {
          const jurisdiction = taxLine.title || 'Unknown';
          const taxAmount = parseFloat(taxLine.price) || 0;
          const taxRate = parseFloat(taxLine.rate) || 0;

          if (!taxByJurisdiction[jurisdiction]) {
            taxByJurisdiction[jurisdiction] = { total: 0, shopPayExcluded: 0, rate: taxRate };
          }

          if (isShopPay) {
            taxByJurisdiction[jurisdiction].shopPayExcluded += taxAmount;
          } else {
            taxByJurisdiction[jurisdiction].total += taxAmount;
          }

          // ... (rest of jurisdiction tracking per state – unchanged)
        }

        // Line items / SKU processing (unchanged)
        for (const item of order.line_items || []) {
          const sku = item.sku?.trim();
          const productName = item.name || item.title || 'Unknown Product';
          const quantity = item.quantity || 0;
          const lineGross = (parseFloat(item.price) || 0) * quantity;
          const allocDiscount = (item.discount_allocations || []).reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
          const itemDiscount = allocDiscount || parseFloat(item.total_discount) || 0;
          const itemRevenue = lineGross - itemDiscount;

          dailyData[orderDate].shopify.units += quantity;
          dailyData[orderDate].total.units += quantity;
          weeklyData[weekEnding].shopify.units += quantity;
          weeklyData[weekEnding].total.units += quantity;
          totalUnits += quantity;

          if (sku) {
            if (!skuTotals[sku]) {
              skuTotals[sku] = { sku, productName, units: 0, revenue: 0, grossRevenue: 0, discounts: 0 };
            }
            skuTotals[sku].units += quantity;
            skuTotals[sku].revenue += itemRevenue;
            skuTotals[sku].grossRevenue += lineGross;
            skuTotals[sku].discounts += itemDiscount;

            // daily/weekly SKU data pushes (unchanged)
            // ...
          }
        }
      } catch (orderErr) {
        console.error('Error processing order:', order?.id || 'unknown', orderErr.message);
        continue;
      }
    }

    // Sorting SKU data (unchanged)
    Object.values(dailyData).forEach(d => d.shopify.skuData.sort((a, b) => b.units - a.units));
    Object.values(weeklyData).forEach(w => w.shopify.skuData.sort((a, b) => b.units - a.units));

    const skuBreakdown = Object.values(skuTotals)
      .sort((a, b) => b.units - a.units)
      .slice(0, 20);

    const taxByStateSummary = Object.values(taxByState)
      .sort((a, b) => b.taxCollected - a.taxCollected);

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
      tax: {
        totalCollected: totalTaxCollected,
        shopPayExcluded: totalShopPayTaxExcluded,
        shopPayOrderCount,
        byState: taxByStateSummary,
        byJurisdiction: taxByJurisdiction,
        paymentGateways: Array.from(allPaymentGateways),
        shopPayGatewaysMatched: Array.from(shopPayGatewaysFound),
      },
      taxByJurisdiction,
      dateRange: { start: startDate, end: endDate },
      ...(preview ? {} : { dailyData, weeklyData }),
    });
  } catch (err) {
    console.error('Sync error:', err);
    return res.status(500).json({ error: `Sync failed: ${err.message}` });
  }
}