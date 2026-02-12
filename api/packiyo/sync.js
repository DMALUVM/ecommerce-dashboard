// Vercel Serverless Function - Packiyo 3PL Inventory Sync
// Path: /api/packiyo/sync.js
// 
// This provides DIRECT inventory data from Packiyo, bypassing Shopify
// More accurate for 3PL inventory tracking
//
// Features:
// - Real-time inventory levels from Packiyo
// - Separate from Shopify inventory (for home/office stock)
// - Supports multiple warehouses if you have them
import {
  applyCors,
  handlePreflight,
  requireMethod,
  enforceRateLimit,
  enforceUserAuth,
  getUserSecret,
} from '../_lib/security.js';

export default async function handler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json({ error: 'Origin not allowed' });
  if (handlePreflight(req, res)) return;
  if (!requireMethod(req, res, 'POST')) return;
  if (!enforceRateLimit(req, res, 'packiyo-sync', { max: 40, windowMs: 60_000 })) return;

  const authUser = await enforceUserAuth(req, res);
  if (!authUser && res.writableEnded) return;

  let { apiKey, customerId, syncType, test, baseUrl } = req.body || {};

  if (!apiKey || !customerId) {
    try {
      const record = authUser?.id ? await getUserSecret(authUser.id, 'packiyo') : null;
      const secret = record?.secret || null;
      if (secret) {
        apiKey = apiKey || secret.apiKey;
        customerId = customerId || secret.customerId;
        baseUrl = baseUrl || secret.baseUrl;
      }
    } catch {
      // Ignore secret fetch failures and continue with request payload validation.
    }
  }

  // Validate required fields
  if (!apiKey) {
    return res.status(400).json({ error: 'Packiyo API key is required' });
  }
  
  if (!customerId) {
    return res.status(400).json({ error: 'Packiyo Customer ID is required' });
  }

  // Use tenant-specific URL if provided, otherwise default
  // Your tenant: excel3pl.packiyo.com
  baseUrl = baseUrl || 'https://excel3pl.packiyo.com/api/v1';
  
  // Try different header combinations - Packiyo may require specific Accept format
  const headerVariants = [
    {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/vnd.api+json',  // JSON:API format
    },
    {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': '*/*',  // Accept anything
    },
    {
      'Authorization': `Bearer ${apiKey}`,
      // No Accept header
    },
  ];

  // Test connection
  if (test) {
    try {
      const testEndpoints = [
        `${baseUrl}/products?page[size]=1`,
        `${baseUrl}/customers/${customerId}`,
      ];
      
      let lastError = null;
      let success = false;
      let customerName = 'Packiyo Connected';
      
      // Try each header variant with each endpoint
      for (const headers of headerVariants) {
        if (success) break;
        
        for (const endpoint of testEndpoints) {
          try {
            console.log('Trying endpoint with headers:', endpoint, JSON.stringify(headers));
            const testRes = await fetch(endpoint, {
              method: 'GET',
              headers,
            });
            
            console.log('Response status:', testRes.status);
            
            if (testRes.ok) {
              const data = await testRes.json();
              // Try to extract customer name from response
              if (data.data?.name) customerName = data.data.name;
              else if (data.data?.[0]?.customer?.name) customerName = data.data[0].customer.name;
              else if (Array.isArray(data.data) && data.data.length > 0) customerName = 'Excel 3PL';
              success = true;
              console.log('Success with endpoint:', endpoint);
              break;
            } else if (testRes.status === 401) {
              return res.status(200).json({ error: 'Invalid API key. Please check your API token in Packiyo settings.' });
            } else if (testRes.status === 403) {
              return res.status(200).json({ error: 'Access forbidden. Your API key may not have permission for this customer.' });
            } else {
              const errorText = await testRes.text();
              lastError = `${testRes.status}: ${errorText.slice(0, 100)}`;
              console.log('Endpoint failed:', endpoint, lastError);
            }
          } catch (endpointErr) {
            lastError = endpointErr.message;
            console.log('Endpoint error:', endpoint, lastError);
          }
        }
      }
      
      if (success) {
        return res.status(200).json({ 
          success: true, 
          customerName: customerName,
          customerId: customerId,
        });
      } else {
        return res.status(200).json({ 
          error: `Could not connect to Packiyo. Last error: ${lastError}. Please verify your API key and Customer ID are correct.` 
        });
      }
    } catch (err) {
      console.error('Connection test error:', err);
      return res.status(200).json({ error: err.message || 'Connection failed' });
    }
  }

  // ============ INVENTORY SYNC ============
  if (syncType === 'inventory') {
    // Use JSON:API Accept header for inventory sync
    const invHeaders = {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/vnd.api+json',
    };
    
    try {
      // Fetch all products with inventory
      const products = [];
      let page = 1;
      let hasMore = true;
      
      // Try with include parameter first, then without if it fails
      let useInclude = true;
      let retryWithoutInclude = false;
      
      while (hasMore) {
        // JSON:API pagination - API key is already scoped to customer
        const url = useInclude 
          ? `${baseUrl}/products?page[number]=${page}&page[size]=100&include=inventory_levels`
          : `${baseUrl}/products?page[number]=${page}&page[size]=100`;
        
        console.log('Fetching:', url);
        
        const productsRes = await fetch(url, { headers: invHeaders });
        
        if (!productsRes.ok) {
          const errorText = await productsRes.text();
          console.log('Products fetch error:', productsRes.status, errorText);
          
          // If 400 error and we're using include, retry without it
          if (productsRes.status === 400 && useInclude && !retryWithoutInclude) {
            console.log('Retrying without include parameter...');
            useInclude = false;
            retryWithoutInclude = true;
            continue;
          }
          
          return res.status(200).json({ 
            error: `Failed to fetch products: ${productsRes.status} - ${errorText.slice(0, 200)}` 
          });
        }
        
        const data = await productsRes.json();
        const pageProducts = data.data || [];
        products.push(...pageProducts);
        
        // JSON:API often returns related data in "included" section
        // We need to merge this with products
        if (data.included && Array.isArray(data.included)) {
          console.log(`Page ${page}: Found ${data.included.length} included items`);
          
          // Group included items by type and relationship
          const inventoryLevelsByProductId = {};
          data.included.forEach(item => {
            if (item.type === 'inventory_levels' || item.type === 'inventory-levels') {
              const productId = item.relationships?.product?.data?.id || item.attributes?.product_id;
              if (productId) {
                if (!inventoryLevelsByProductId[productId]) inventoryLevelsByProductId[productId] = [];
                inventoryLevelsByProductId[productId].push(item);
              }
            }
          });
          
          // Attach inventory levels to their products
          pageProducts.forEach(product => {
            const productId = product.id;
            if (productId && inventoryLevelsByProductId[productId]) {
              product.inventory_levels = inventoryLevelsByProductId[productId];
            }
          });
          
          console.log(`Attached inventory levels to ${Object.keys(inventoryLevelsByProductId).length} products`);
        }
        
        console.log(`Page ${page}: fetched ${pageProducts.length} products, total: ${products.length}`);
        
        // Log full pagination structure to debug
        if (page === 1) {
          console.log('Full response structure keys:', Object.keys(data));
          if (data.meta) console.log('Meta structure:', JSON.stringify(data.meta));
          if (data.links) console.log('Links structure:', JSON.stringify(data.links));
        }
        
        // Determine if there are more pages
        let foundNextPage = false;
        
        // Method 1: Check links.next (most reliable for JSON:API)
        if (data.links?.next) {
          foundNextPage = true;
          console.log('Found next via links.next');
        }
        
        // Method 2: Check meta for pagination info (various formats)
        if (!foundNextPage && data.meta) {
          const m = data.meta;
          
          // Packiyo might use: meta.current_page/last_page directly
          // OR meta.page.current_page/last_page
          // OR meta.pagination.current_page/last_page
          
          const currentPage = m.current_page || m.currentPage || m.page?.current_page || m.page?.currentPage || m.pagination?.current_page || page;
          const lastPage = m.last_page || m.lastPage || m.page?.last_page || m.page?.lastPage || m.pagination?.last_page || m.pagination?.total_pages || m.total_pages;
          const total = m.total || m.page?.total || m.pagination?.total;
          const perPage = m.per_page || m.perPage || m.page?.per_page || m.pagination?.per_page || 100;
          
          console.log(`Pagination check: current=${currentPage}, last=${lastPage}, total=${total}, perPage=${perPage}`);
          
          if (lastPage && currentPage < lastPage) {
            foundNextPage = true;
            console.log('Found next via meta (page comparison)');
          } else if (total && (products.length < total)) {
            foundNextPage = true;
            console.log(`Found next via meta.total (${products.length} < ${total})`);
          }
        }
        
        // Method 3: If we got a full page worth of products, assume there might be more
        if (!foundNextPage && pageProducts.length >= 100) {
          foundNextPage = true;
          console.log('Assuming next page exists (got full page of 100)');
        }
        
        if (foundNextPage) {
          page++;
        } else {
          console.log('No more pages detected, stopping');
          hasMore = false;
        }
        
        // Safety: if we got 0 products this page, stop
        if (pageProducts.length === 0) {
          console.log('Empty page, stopping');
          hasMore = false;
        }
        
        // Safety limit - increase to handle 15k+ products
        if (products.length > 20000) {
          console.log('Safety limit (20k) reached');
          break;
        }
        
        // Rate limit protection - slightly longer delay
        await new Promise(r => setTimeout(r, 150));
      }
      
      // If we didn't get inventory_levels included, try to fetch them separately
      if (!useInclude && products.length > 0) {
        console.log('Fetching inventory levels separately...');
        
        // Try the inventory endpoint
        try {
          const invRes = await fetch(
            `${baseUrl}/inventory?page[size]=500`,
            { headers: invHeaders }
          );
          
          if (invRes.ok) {
            const invData = await invRes.json();
            const inventoryLevels = invData.data || [];
            
            // Map inventory levels to products by product_id
            const invByProductId = {};
            inventoryLevels.forEach(inv => {
              const productId = inv.product_id || inv.attributes?.product_id;
              if (productId) {
                if (!invByProductId[productId]) invByProductId[productId] = [];
                invByProductId[productId].push(inv);
              }
            });
            
            // Attach to products
            products.forEach(p => {
              const pid = p.id || p.attributes?.id;
              if (pid && invByProductId[pid]) {
                p.inventory_levels = invByProductId[pid];
              }
            });
            
            console.log('Attached inventory to', Object.keys(invByProductId).length, 'products');
          }
        } catch (invErr) {
          console.log('Could not fetch separate inventory:', invErr.message);
        }
      }
      
      // Process products into inventory format
      // Handle both JSON:API format (attributes nested) and regular format
      // Also handle direct quantity fields as shown in CSV export
      const inventoryBySku = {};
      let totalUnits = 0;
      let totalValue = 0;
      let skippedNoSku = 0;
      let skippedZeroQty = 0;
      
      products.forEach((product, idx) => {
        // Log first product structure for debugging
        if (idx === 0) {
          console.log('=== FIRST PRODUCT STRUCTURE ===');
          console.log('Keys:', Object.keys(product));
          console.log('Has attributes?', !!product.attributes);
          console.log('Has relationships?', !!product.relationships);
          if (product.attributes) {
            console.log('Attribute keys:', Object.keys(product.attributes));
            console.log('quantity_on_hand:', product.attributes.quantity_on_hand);
          }
          console.log('Direct quantity_on_hand:', product.quantity_on_hand);
          console.log('Full first product (truncated):', JSON.stringify(product).slice(0, 1000));
        }
        
        // JSON:API format has data in attributes, regular format has it directly
        const attrs = product.attributes || product;
        const sku = (attrs.sku || product.sku)?.trim();
        
        // SKU is required for cross-platform matching
        if (!sku) {
          skippedNoSku++;
          return;
        }
        
        // Get quantity - check multiple possible locations
        // Priority 1: Direct fields on attributes (matches CSV export format)
        let quantityOnHand = parseInt(attrs.quantity_on_hand) || 0;
        let quantityAvailable = parseInt(attrs.quantity_available) || 0;
        let quantityInbound = parseInt(attrs.quantity_inbound) || 0;
        let quantityAllocated = parseInt(attrs.quantity_allocated) || 0;
        let quantityReserved = parseInt(attrs.quantity_reserved) || 0;
        
        // Log quantity finding for first few products
        if (idx < 3) {
          console.log(`Product ${idx} (${sku}): direct qty=${quantityOnHand}, available=${quantityAvailable}`);
        }
        
        // Priority 2: Check inventory_levels array if direct fields are 0
        if (quantityOnHand === 0) {
          let inventoryLevels = product.inventory_levels || attrs.inventory_levels || [];
          
          // If inventory_levels is in relationships (JSON:API format)
          if (product.relationships?.inventory_levels?.data) {
            inventoryLevels = product.relationships.inventory_levels.data;
          }
          
          if (idx < 3 && inventoryLevels.length > 0) {
            console.log(`Product ${idx} inventory_levels count:`, inventoryLevels.length);
            console.log('First level:', JSON.stringify(inventoryLevels[0]).slice(0, 300));
          }
          
          inventoryLevels.forEach(level => {
            const levelAttrs = level.attributes || level;
            quantityOnHand += parseInt(levelAttrs.quantity_on_hand) || 0;
            quantityAvailable += parseInt(levelAttrs.quantity_available) || 0;
            quantityInbound += parseInt(levelAttrs.quantity_inbound) || 0;
          });
          
          if (idx < 3) {
            console.log(`Product ${idx} (${sku}): after levels qty=${quantityOnHand}`);
          }
        }
        
        // Skip products with no inventory at all (bundles, inactive, etc)
        if (quantityOnHand === 0 && quantityInbound === 0) {
          skippedZeroQty++;
          return;
        }
        
        const cost = parseFloat(attrs.cost) || parseFloat(attrs.value) || parseFloat(product.cost) || parseFloat(product.value) || 0;
        const value = quantityOnHand * cost;
        
        totalUnits += quantityOnHand;
        totalValue += value;
        
        inventoryBySku[sku] = {
          sku,  // PRIMARY KEY - matches across platforms
          name: attrs.name || product.name || sku,
          barcode: attrs.barcode || product.barcode || '',
          totalQty: quantityOnHand,
          quantityOnHand,
          quantityAvailable,
          quantityInbound,
          quantityAllocated,
          quantityReserved,
          cost,
          totalValue: value,
          packiyoProductId: product.id || attrs.id,
        };
      });
      
      // Format response for app integration
      console.log(`Processing complete: ${products.length} products fetched, ${skippedNoSku} without SKU, ${skippedZeroQty} with zero qty, ${Object.keys(inventoryBySku).length} with inventory`);
      console.log(`=== FINAL TOTALS: ${totalUnits} units, $${totalValue.toFixed(2)} value ===`);
      
      // Log top 5 products by quantity for verification
      const topProducts = Object.values(inventoryBySku)
        .sort((a, b) => b.quantityOnHand - a.quantityOnHand)
        .slice(0, 5);
      console.log('Top 5 products by qty:', topProducts.map(p => `${p.sku}: ${p.quantityOnHand}`).join(', '));
      
      const inventorySnapshot = {
        date: new Date().toISOString().split('T')[0],
        source: 'packiyo-direct',
        summary: {
          totalUnits,
          totalValue,
          skuCount: Object.keys(inventoryBySku).length,
          skippedNoSku,
          skippedZeroQty,
          productsFetched: products.length,  // Total products from API
          productsWithInventory: Object.keys(inventoryBySku).length, // Products with qty > 0
        },
        // Format items array for easy merging with existing inventory structure
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
            source: 'packiyo',
          }))
          .sort((a, b) => b.quantity_on_hand - a.quantity_on_hand),  // Sort by qty
        // Also include raw inventory for detailed view
        inventoryBySku,
      };
      
      return res.status(200).json({
        success: true,
        syncType: 'inventory',
        ...inventorySnapshot,
      });
      
    } catch (err) {
      console.error('Packiyo inventory sync error:', err);
      return res.status(500).json({ error: `Inventory sync failed: ${err.message}` });
    }
  }
  
  // ============ SHIPMENTS SYNC (for 3PL costs) ============
  if (syncType === 'shipments') {
    const { startDate, endDate } = req.body;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start and end dates required for shipments sync' });
    }
    
    // Use JSON:API Accept header for shipments sync
    const shipHeaders = {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/vnd.api+json',
    };
    
    try {
      const shipments = [];
      let page = 1;
      let hasMore = true;
      
      while (hasMore) {
        const shipmentsRes = await fetch(
          `${baseUrl}/shipments?page[number]=${page}&page[size]=100&filter[shipped_after]=${startDate}&filter[shipped_before]=${endDate}`, 
          { headers: shipHeaders }
        );
        
        if (!shipmentsRes.ok) {
          return res.status(shipmentsRes.status).json({ 
            error: `Failed to fetch shipments: ${shipmentsRes.status}` 
          });
        }
        
        const data = await shipmentsRes.json();
        const pageShipments = data.data || [];
        shipments.push(...pageShipments);
        
        // Check pagination - handle both JSON:API and standard formats
        const meta = data.meta;
        const links = data.links;
        
        if (links && links.next) {
          page++;
        } else if (meta?.page?.current_page && meta?.page?.last_page) {
          if (meta.page.current_page < meta.page.last_page) {
            page++;
          } else {
            hasMore = false;
          }
        } else if (meta && meta.current_page !== undefined && meta.last_page !== undefined) {
          if (meta.current_page < meta.last_page) {
            page++;
          } else {
            hasMore = false;
          }
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
        const shipDate = new Date(shipment.shipped_at || shipment.created_at);
        const weekKey = getWeekEnding(shipDate);
        
        if (!byWeek[weekKey]) {
          byWeek[weekKey] = {
            weekEnding: weekKey,
            shipmentCount: 0,
            totalUnits: 0,
            orders: [],
          };
        }
        
        const units = (shipment.shipment_items || [])
          .reduce((sum, item) => sum + (item.quantity || 0), 0);
        
        byWeek[weekKey].shipmentCount++;
        byWeek[weekKey].totalUnits += units;
        byWeek[weekKey].orders.push({
          orderNumber: shipment.order?.order_number || shipment.order_id,
          trackingNumber: shipment.tracking_number,
          shippedAt: shipment.shipped_at,
          carrier: shipment.shipping_method?.carrier,
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
      console.error('Packiyo shipments sync error:', err);
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
