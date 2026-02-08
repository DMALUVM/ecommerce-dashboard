// Vercel Serverless Function - Amazon SP-API Sync
// Path: /api/amazon/sync.js
// 
// This handles secure communication with Amazon's Selling Partner API
// Supports FBA Inventory, AWD (Amazon Warehousing & Distribution), and Ads API
//
// IMPORTANT: This integration is ADDITIVE - it only syncs Amazon FBA and AWD inventory
// It does NOT overwrite 3PL inventory (Packiyo) or Shopify Wormans Mill inventory
//
// Features:
// - FBA Inventory levels with inbound quantities
// - AWD (Amazon Warehousing & Distribution) inventory
// - Ads API for campaign performance data
// - Sales velocity from FBA reports

import crypto from 'crypto';

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

  const { 
    // SP-API Credentials
    clientId,
    clientSecret, 
    refreshToken,
    sellerId,
    marketplaceId = 'ATVPDKIKX0DER', // Default to US marketplace
    
    // Ads API Credentials (optional, separate from SP-API)
    adsClientId,
    adsClientSecret,
    adsRefreshToken,
    adsProfileId,
    
    // Sync options
    syncType, // 'inventory', 'fba', 'awd', 'ads', 'all', 'test'
    startDate,
    endDate,
    test
  } = req.body;

  // Validate required fields for SP-API
  if (!clientId || !clientSecret || !refreshToken) {
    return res.status(400).json({ 
      error: 'Missing SP-API credentials. Required: clientId, clientSecret, refreshToken' 
    });
  }

  // ============ HELPER: Get LWA Access Token ============
  const getAccessToken = async (clientId, clientSecret, refreshToken) => {
    try {
      console.log('Attempting LWA token exchange...');
      console.log('Client ID prefix:', clientId?.substring(0, 20) + '...');
      
      const tokenResponse = await fetch('https://api.amazon.com/auth/o2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      });

      const responseText = await tokenResponse.text();
      console.log('LWA response status:', tokenResponse.status);
      
      if (!tokenResponse.ok) {
        console.error('LWA token error:', tokenResponse.status, responseText);
        let errorDetail = responseText;
        try {
          const errorJson = JSON.parse(responseText);
          errorDetail = errorJson.error_description || errorJson.error || responseText;
        } catch (e) {}
        throw new Error(`LWA authentication failed (${tokenResponse.status}): ${errorDetail}`);
      }

      const tokenData = JSON.parse(responseText);
      if (!tokenData.access_token) {
        throw new Error('No access token in response');
      }
      console.log('LWA token exchange successful');
      return tokenData.access_token;
    } catch (err) {
      console.error('LWA error:', err);
      throw new Error(`Authentication failed: ${err.message}`);
    }
  };

  // ============ HELPER: Make SP-API Request ============
  const spApiRequest = async (accessToken, endpoint, method = 'GET', body = null) => {
    const baseUrl = 'https://sellingpartnerapi-na.amazon.com';
    const url = `${baseUrl}${endpoint}`;
    
    const headers = {
      'x-amz-access-token': accessToken,
      'Content-Type': 'application/json',
    };

    const options = { method, headers };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('SP-API error:', response.status, errorText);
      throw new Error(`SP-API error: ${response.status} - ${errorText.slice(0, 200)}`);
    }

    return response.json();
  };

  // ============ TEST CONNECTION ============
  if (test) {
    try {
      const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);
      
      // Test with a simple marketplace participations call
      const participations = await spApiRequest(
        accessToken, 
        '/sellers/v1/marketplaceParticipations'
      );
      
      const marketplaces = participations.payload || [];
      const usMarketplace = marketplaces.find(m => 
        m.marketplace?.id === 'ATVPDKIKX0DER' || 
        m.marketplace?.countryCode === 'US'
      );
      
      return res.status(200).json({
        success: true,
        sellerName: 'Amazon Seller Connected',
        marketplaces: marketplaces.map(m => ({
          id: m.marketplace?.id,
          name: m.marketplace?.name,
          countryCode: m.marketplace?.countryCode,
        })),
        primaryMarketplace: usMarketplace?.marketplace?.name || 'US Marketplace',
      });
    } catch (err) {
      console.error('Connection test error:', err);
      return res.status(200).json({ error: err.message || 'Connection failed' });
    }
  }

  // Get access token for all other operations
  let accessToken;
  try {
    accessToken = await getAccessToken(clientId, clientSecret, refreshToken);
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }

  // ============ FBA INVENTORY SYNC ============
  // This syncs Amazon FBA inventory - fulfillable, inbound, reserved quantities
  // Does NOT touch 3PL or Shopify inventory
  if (syncType === 'fba' || syncType === 'inventory' || syncType === 'all') {
    try {
      const inventoryItems = [];
      let nextToken = null;
      
      do {
        // Use FBA Inventory API
        let endpoint = `/fba/inventory/v1/summaries?details=true&granularityType=Marketplace&granularityId=${marketplaceId}&marketplaceIds=${marketplaceId}`;
        if (nextToken) {
          endpoint += `&nextToken=${encodeURIComponent(nextToken)}`;
        }

        const inventoryData = await spApiRequest(accessToken, endpoint);
        
        if (inventoryData.payload?.inventorySummaries) {
          inventoryItems.push(...inventoryData.payload.inventorySummaries);
        }
        
        nextToken = inventoryData.pagination?.nextToken;
        
        // Rate limit protection
        await new Promise(r => setTimeout(r, 200));
        
        // Safety limit
        if (inventoryItems.length > 10000) break;
        
      } while (nextToken);

      // Process inventory items
      const fbaInventory = {};
      let totalUnits = 0;
      let totalInbound = 0;

      inventoryItems.forEach(item => {
        const sku = item.sellerSku;
        if (!sku) return;

        const fulfillable = item.inventoryDetails?.fulfillableQuantity || 0;
        const inboundWorking = item.inventoryDetails?.inboundWorkingQuantity || 0;
        const inboundShipped = item.inventoryDetails?.inboundShippedQuantity || 0;
        const inboundReceiving = item.inventoryDetails?.inboundReceivingQuantity || 0;
        const reserved = item.inventoryDetails?.reservedQuantity?.totalReservedQuantity || 0;
        const unfulfillable = item.inventoryDetails?.unfulfillableQuantity?.totalUnfulfillableQuantity || 0;
        
        const totalInboundQty = inboundWorking + inboundShipped + inboundReceiving;
        const available = fulfillable;
        
        totalUnits += available;
        totalInbound += totalInboundQty;

        fbaInventory[sku] = {
          sku,
          asin: item.asin || '',
          fnsku: item.fnSku || '',
          name: item.productName || sku,
          
          // FBA specific quantities
          fulfillable,
          reserved,
          unfulfillable,
          
          // Inbound breakdown
          inboundWorking,
          inboundShipped,
          inboundReceiving,
          totalInbound: totalInboundQty,
          
          // Totals for compatibility with existing system
          available,
          total: available + reserved,
          
          // Condition
          condition: item.condition || 'NewItem',
          
          // Last updated
          lastUpdated: item.lastUpdatedTime || new Date().toISOString(),
        };
      });

      // If this is part of 'all' sync, continue to AWD
      if (syncType === 'all') {
        // Store FBA data to merge later
        req.fbaInventory = fbaInventory;
      } else {
        return res.status(200).json({
          success: true,
          syncType: 'fba',
          source: 'amazon-fba',
          summary: {
            totalSkus: Object.keys(fbaInventory).length,
            totalUnits,
            totalInbound,
          },
          items: Object.values(fbaInventory),
          inventoryBySku: fbaInventory,
        });
      }
    } catch (err) {
      console.error('FBA inventory sync error:', err);
      if (syncType !== 'all') {
        return res.status(500).json({ error: `FBA inventory sync failed: ${err.message}` });
      }
    }
  }

  // ============ AWD INVENTORY SYNC ============
  // Amazon Warehousing & Distribution - separate from FBA
  if (syncType === 'awd' || syncType === 'all') {
    try {
      const awdItems = [];
      let nextToken = null;
      
      do {
        // AWD Inventory API endpoint
        let endpoint = `/awd/2024-05-09/inventory`;
        const params = new URLSearchParams();
        if (nextToken) params.append('nextToken', nextToken);
        if (params.toString()) endpoint += `?${params.toString()}`;

        const awdData = await spApiRequest(accessToken, endpoint);
        
        if (awdData.inventory) {
          awdItems.push(...awdData.inventory);
        }
        
        nextToken = awdData.nextToken;
        
        await new Promise(r => setTimeout(r, 200));
        if (awdItems.length > 5000) break;
        
      } while (nextToken);

      // Process AWD inventory
      const awdInventory = {};
      let awdTotalUnits = 0;

      awdItems.forEach(item => {
        const sku = item.sku || item.sellerSku;
        if (!sku) return;

        const onHand = item.totalInventory?.quantity || item.onHandQuantity || 0;
        const inbound = item.inboundInventory?.quantity || 0;
        
        awdTotalUnits += onHand;

        awdInventory[sku] = {
          sku,
          name: item.productName || sku,
          awdQuantity: onHand,
          awdInbound: inbound,
          distributionCenterId: item.distributionCenterId || '',
          lastUpdated: new Date().toISOString(),
        };
      });

      // If this was 'all' sync, merge with FBA and return
      if (syncType === 'all') {
        const fbaInventory = req.fbaInventory || {};
        
        // Merge FBA and AWD data
        const allSkus = new Set([...Object.keys(fbaInventory), ...Object.keys(awdInventory)]);
        const mergedInventory = {};
        
        allSkus.forEach(sku => {
          const fba = fbaInventory[sku] || {};
          const awd = awdInventory[sku] || {};
          
          mergedInventory[sku] = {
            sku,
            asin: fba.asin || '',
            fnsku: fba.fnsku || '',
            name: fba.name || awd.name || sku,
            
            // FBA quantities
            fbaFulfillable: fba.fulfillable || 0,
            fbaReserved: fba.reserved || 0,
            fbaInbound: fba.totalInbound || 0,
            fbaTotal: (fba.fulfillable || 0) + (fba.reserved || 0),
            
            // AWD quantities
            awdQuantity: awd.awdQuantity || 0,
            awdInbound: awd.awdInbound || 0,
            
            // Combined Amazon totals (FBA + AWD)
            amazonTotal: (fba.fulfillable || 0) + (fba.reserved || 0) + (awd.awdQuantity || 0),
            amazonInbound: (fba.totalInbound || 0) + (awd.awdInbound || 0),
            
            // For compatibility - these are ONLY Amazon quantities
            // 3PL and Shopify inventory should be merged client-side
            available: fba.fulfillable || 0,
            total: (fba.fulfillable || 0) + (fba.reserved || 0),
          };
        });

        return res.status(200).json({
          success: true,
          syncType: 'all',
          source: 'amazon-fba-awd',
          summary: {
            totalSkus: Object.keys(mergedInventory).length,
            fbaSkus: Object.keys(fbaInventory).length,
            awdSkus: Object.keys(awdInventory).length,
            fbaUnits: Object.values(fbaInventory).reduce((s, i) => s + (i.available || 0), 0),
            awdUnits: awdTotalUnits,
          },
          items: Object.values(mergedInventory),
          inventoryBySku: mergedInventory,
          // Separate breakdowns for detailed view
          fbaInventory: Object.values(fbaInventory),
          awdInventory: Object.values(awdInventory),
        });
      }

      return res.status(200).json({
        success: true,
        syncType: 'awd',
        source: 'amazon-awd',
        summary: {
          totalSkus: Object.keys(awdInventory).length,
          totalUnits: awdTotalUnits,
        },
        items: Object.values(awdInventory),
        inventoryBySku: awdInventory,
      });

    } catch (err) {
      // AWD might not be available for all sellers
      console.error('AWD inventory sync error:', err);
      
      if (syncType === 'all') {
        // Return just FBA data if AWD fails
        const fbaInventory = req.fbaInventory || {};
        return res.status(200).json({
          success: true,
          syncType: 'fba',
          source: 'amazon-fba',
          awdError: err.message,
          summary: {
            totalSkus: Object.keys(fbaInventory).length,
            totalUnits: Object.values(fbaInventory).reduce((s, i) => s + (i.available || 0), 0),
          },
          items: Object.values(fbaInventory),
          inventoryBySku: fbaInventory,
        });
      }
      
      return res.status(500).json({ error: `AWD inventory sync failed: ${err.message}` });
    }
  }

  // ============ ADS API SYNC ============
  // Requires separate Ads API credentials
  if (syncType === 'ads') {
    if (!adsClientId || !adsClientSecret || !adsRefreshToken || !adsProfileId) {
      return res.status(400).json({ 
        error: 'Missing Ads API credentials. Required: adsClientId, adsClientSecret, adsRefreshToken, adsProfileId' 
      });
    }

    try {
      // Get Ads API access token (different from SP-API)
      const adsTokenResponse = await fetch('https://api.amazon.com/auth/o2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: adsRefreshToken,
          client_id: adsClientId,
          client_secret: adsClientSecret,
        }).toString(),
      });

      if (!adsTokenResponse.ok) {
        throw new Error('Failed to get Ads API access token');
      }

      const adsTokenData = await adsTokenResponse.json();
      const adsAccessToken = adsTokenData.access_token;

      // Fetch Sponsored Products campaigns
      const campaignsResponse = await fetch(
        `https://advertising-api.amazon.com/sp/campaigns?stateFilter=enabled`,
        {
          headers: {
            'Authorization': `Bearer ${adsAccessToken}`,
            'Amazon-Advertising-API-ClientId': adsClientId,
            'Amazon-Advertising-API-Scope': adsProfileId,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!campaignsResponse.ok) {
        const errorText = await campaignsResponse.text();
        throw new Error(`Ads API error: ${campaignsResponse.status} - ${errorText.slice(0, 200)}`);
      }

      const campaigns = await campaignsResponse.json();

      // Get performance data for date range
      const reportStartDate = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const reportEndDate = endDate || new Date().toISOString().split('T')[0];

      // Request a Sponsored Products report
      const reportRequestResponse = await fetch(
        `https://advertising-api.amazon.com/v2/sp/campaigns/report`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${adsAccessToken}`,
            'Amazon-Advertising-API-ClientId': adsClientId,
            'Amazon-Advertising-API-Scope': adsProfileId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reportDate: reportEndDate,
            metrics: 'impressions,clicks,cost,sales,orders,acos,roas',
          }),
        }
      );

      let reportData = null;
      if (reportRequestResponse.ok) {
        const reportRequest = await reportRequestResponse.json();
        // Note: Reports are async - you'd need to poll for completion
        // For now, return the campaign list
        reportData = reportRequest;
      }

      return res.status(200).json({
        success: true,
        syncType: 'ads',
        campaigns: campaigns.slice(0, 50).map(c => ({
          campaignId: c.campaignId,
          name: c.name,
          state: c.state,
          budget: c.budget,
          budgetType: c.budgetType,
          targetingType: c.targetingType,
        })),
        dateRange: { start: reportStartDate, end: reportEndDate },
        reportStatus: reportData ? 'requested' : 'unavailable',
      });

    } catch (err) {
      console.error('Ads API sync error:', err);
      return res.status(500).json({ error: `Ads sync failed: ${err.message}` });
    }
  }

  // ============ SALES VELOCITY (from Reports API) ============
  if (syncType === 'velocity') {
    try {
      // Request FBA Manage Inventory report for velocity data
      const reportResponse = await spApiRequest(
        accessToken,
        '/reports/2021-06-30/reports',
        'POST',
        {
          reportType: 'GET_FBA_MYI_ALL_INVENTORY_DATA',
          marketplaceIds: [marketplaceId],
        }
      );

      return res.status(200).json({
        success: true,
        syncType: 'velocity',
        reportId: reportResponse.reportId,
        status: 'Report requested - poll /reports/{reportId} for completion',
      });

    } catch (err) {
      console.error('Velocity report error:', err);
      return res.status(500).json({ error: `Velocity report failed: ${err.message}` });
    }
  }

  // ============ SALES DATA SYNC (from Orders API) ============
  // Fetches recent FBA orders with per-SKU daily breakdowns for velocity calculation.
  // This gives near-real-time sales data without waiting for SKU Economics reports.
  // SKU Economics uploads override this data on the client (more accurate fee/profit data).
  if (syncType === 'sales') {
    const syncStartTime = Date.now();
    try {
      const daysBack = parseInt(req.body.daysBack) || 14;
      const createdAfter = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
      
      console.log(`Fetching Amazon orders since ${createdAfter} (${daysBack} days back)`);

      // Step 1: Fetch all orders (FBA/Shipped) from the last N days
      const allOrders = [];
      let nextToken = null;
      
      do {
        let endpoint = `/orders/v0/orders?MarketplaceIds=${marketplaceId}&CreatedAfter=${encodeURIComponent(createdAfter)}&FulfillmentChannels=AFN&OrderStatuses=Shipped`;
        if (nextToken) {
          endpoint += `&NextToken=${encodeURIComponent(nextToken)}`;
        }
        
        const ordersData = await spApiRequest(accessToken, endpoint);
        
        if (ordersData.payload?.Orders) {
          allOrders.push(...ordersData.payload.Orders);
        }
        
        nextToken = ordersData.payload?.NextToken;
        await new Promise(r => setTimeout(r, 300));
        
        // Safety limit
        if (allOrders.length > 500) {
          console.log('Hit 500 order safety limit');
          break;
        }
      } while (nextToken);

      console.log(`Found ${allOrders.length} orders, fetching line items...`);

      // Step 2: Fetch order items for each order
      // Rate limits: burst of 30 at 300ms, then 2100ms between calls
      const dailyData = {};
      const skuTotals = {};
      let processedOrders = 0;
      let burstRemaining = 28; // Leave a small buffer from the 30 burst limit

      for (const order of allOrders) {
        // Timeout protection for serverless (50s max to leave room for response)
        if (Date.now() - syncStartTime > 50000) {
          console.log(`Timeout approaching at ${processedOrders}/${allOrders.length} orders`);
          break;
        }

        try {
          const itemsData = await spApiRequest(
            accessToken,
            `/orders/v0/orders/${order.AmazonOrderId}/orderItems`
          );
          
          const orderDate = (order.PurchaseDate || order.CreatedDate || '').split('T')[0];
          if (!orderDate) continue;
          
          // Initialize daily bucket
          if (!dailyData[orderDate]) {
            dailyData[orderDate] = {
              amazon: {
                revenue: 0,
                units: 0,
                orders: 0,
                returns: 0,
                skuData: {},
                source: 'api',
              },
            };
          }
          
          dailyData[orderDate].amazon.orders++;
          
          const items = itemsData.payload?.OrderItems || [];
          for (const item of items) {
            const sku = item.SellerSKU;
            if (!sku) continue;
            
            const qty = item.QuantityOrdered || 0;
            const price = parseFloat(item.ItemPrice?.Amount || 0);
            const itemTax = parseFloat(item.ItemTax?.Amount || 0);
            
            dailyData[orderDate].amazon.revenue += price;
            dailyData[orderDate].amazon.units += qty;
            
            // Per-SKU accumulation
            if (!dailyData[orderDate].amazon.skuData[sku]) {
              dailyData[orderDate].amazon.skuData[sku] = {
                sku,
                name: item.Title || sku,
                asin: item.ASIN || '',
                unitsSold: 0,
                revenue: 0,
              };
            }
            dailyData[orderDate].amazon.skuData[sku].unitsSold += qty;
            dailyData[orderDate].amazon.skuData[sku].revenue += price;
            
            // Running totals across all days
            if (!skuTotals[sku]) skuTotals[sku] = { sku, name: item.Title || sku, asin: item.ASIN || '', unitsSold: 0, revenue: 0 };
            skuTotals[sku].unitsSold += qty;
            skuTotals[sku].revenue += price;
          }
          
          processedOrders++;
          
          // Rate limiting: use burst capacity first, then slow down
          if (burstRemaining > 0) {
            burstRemaining--;
            await new Promise(r => setTimeout(r, 300));
          } else {
            await new Promise(r => setTimeout(r, 2100));
          }

        } catch (itemErr) {
          console.error(`Failed to get items for order ${order.AmazonOrderId}:`, itemErr.message);
          // If we get a throttle error, slow down significantly
          if (itemErr.message?.includes('429') || itemErr.message?.includes('QuotaExceeded')) {
            burstRemaining = 0;
            await new Promise(r => setTimeout(r, 5000));
          }
          continue;
        }
      }

      // Convert skuData from objects to sorted arrays for client compatibility
      Object.values(dailyData).forEach(day => {
        if (day.amazon?.skuData) {
          const skuArr = Object.values(day.amazon.skuData).sort((a, b) => b.unitsSold - a.unitsSold);
          day.amazon.skuData = skuArr;
        }
        // Add total summary per day
        day.total = {
          revenue: day.amazon?.revenue || 0,
          units: day.amazon?.units || 0,
          orders: day.amazon?.orders || 0,
        };
      });

      const totalUnits = Object.values(skuTotals).reduce((s, i) => s + i.unitsSold, 0);
      const totalRevenue = Object.values(skuTotals).reduce((s, i) => s + i.revenue, 0);

      console.log(`Sales sync complete: ${processedOrders}/${allOrders.length} orders, ${totalUnits} units, ${Object.keys(dailyData).length} days`);

      return res.status(200).json({
        success: true,
        syncType: 'sales',
        source: 'amazon-orders-api',
        summary: {
          totalOrders: processedOrders,
          totalOrdersFound: allOrders.length,
          incomplete: processedOrders < allOrders.length,
          daysWithData: Object.keys(dailyData).length,
          totalUnits,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          skuCount: Object.keys(skuTotals).length,
          daysBack,
          processingTimeMs: Date.now() - syncStartTime,
        },
        dailyData,
        skuTotals: Object.values(skuTotals).sort((a, b) => b.unitsSold - a.unitsSold),
      });

    } catch (err) {
      console.error('Sales sync error:', err);
      return res.status(500).json({ error: `Sales sync failed: ${err.message}` });
    }
  }

  return res.status(400).json({ 
    error: 'Invalid syncType. Use: test, fba, awd, inventory, all, ads, velocity, sales' 
  });
}
