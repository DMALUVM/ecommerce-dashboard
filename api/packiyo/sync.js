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

  const { apiKey, customerId, syncType, test } = req.body;

  // Validate required fields
  if (!apiKey) {
    return res.status(400).json({ error: 'Packiyo API key is required' });
  }
  
  if (!customerId) {
    return res.status(400).json({ error: 'Packiyo Customer ID is required' });
  }

  // Use tenant-specific URL if provided, otherwise default
  // Your tenant: excel3pl.packiyo.com
  const baseUrl = req.body.baseUrl || 'https://excel3pl.packiyo.com/api/v1';
  
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  // Test connection
  if (test) {
    try {
      const testRes = await fetch(`${baseUrl}/customers/${customerId}`, {
        headers,
      });
      
      if (!testRes.ok) {
        const errorText = await testRes.text();
        console.error('Packiyo API error:', testRes.status, errorText);
        if (testRes.status === 401) {
          return res.status(401).json({ error: 'Invalid API key' });
        }
        if (testRes.status === 404) {
          return res.status(404).json({ error: 'Customer not found. Check your Customer ID.' });
        }
        return res.status(testRes.status).json({ error: `Packiyo API error: ${testRes.status}` });
      }
      
      const customerData = await testRes.json();
      return res.status(200).json({ 
        success: true, 
        customerName: customerData.data?.name || 'Connected',
        customerId: customerId,
      });
    } catch (err) {
      console.error('Connection test error:', err);
      return res.status(500).json({ error: err.message || 'Connection failed' });
    }
  }

  // ============ INVENTORY SYNC ============
  if (syncType === 'inventory') {
    try {
      // Fetch all products with inventory
      const products = [];
      let page = 1;
      let hasMore = true;
      
      while (hasMore) {
        const productsRes = await fetch(
          `${baseUrl}/products?customer_id=${customerId}&page=${page}&per_page=100&include=inventory_levels`, 
          { headers }
        );
        
        if (!productsRes.ok) {
          return res.status(productsRes.status).json({ 
            error: `Failed to fetch products: ${productsRes.status}` 
          });
        }
        
        const data = await productsRes.json();
        const pageProducts = data.data || [];
        products.push(...pageProducts);
        
        // Check pagination
        const meta = data.meta;
        if (meta && meta.current_page < meta.last_page) {
          page++;
        } else {
          hasMore = false;
        }
        
        // Safety limit
        if (products.length > 10000) break;
        
        // Rate limit protection
        await new Promise(r => setTimeout(r, 100));
      }
      
      // Process products into inventory format
      const inventoryBySku = {};
      let totalUnits = 0;
      let totalValue = 0;
      let skippedNoSku = 0;
      
      products.forEach(product => {
        const sku = product.sku?.trim();
        
        // SKU is required for cross-platform matching
        if (!sku) {
          skippedNoSku++;
          return;
        }
        
        // Get inventory levels from all locations
        const inventoryLevels = product.inventory_levels || [];
        let productTotalQty = 0;
        const byWarehouse = {};
        
        inventoryLevels.forEach(level => {
          const qty = level.quantity_on_hand || 0;
          const warehouseName = level.warehouse?.name || 'Default Warehouse';
          
          productTotalQty += qty;
          byWarehouse[warehouseName] = {
            qty,
            warehouseId: level.warehouse_id,
            quantityOnHand: level.quantity_on_hand || 0,
            quantityCommitted: level.quantity_committed || 0,
            quantityAvailable: level.quantity_available || 0,
            quantityInbound: level.quantity_inbound || 0,
          };
        });
        
        const cost = parseFloat(product.value) || parseFloat(product.cost) || 0;
        const value = productTotalQty * cost;
        
        totalUnits += productTotalQty;
        totalValue += value;
        
        inventoryBySku[sku] = {
          sku,  // PRIMARY KEY - matches across platforms
          name: product.name || sku,
          barcode: product.barcode || '',
          totalQty: productTotalQty,
          quantityAvailable: inventoryLevels.reduce((sum, l) => sum + (l.quantity_available || 0), 0),
          quantityCommitted: inventoryLevels.reduce((sum, l) => sum + (l.quantity_committed || 0), 0),
          quantityInbound: inventoryLevels.reduce((sum, l) => sum + (l.quantity_inbound || 0), 0),
          cost,
          totalValue: value,
          byWarehouse,
          packiyoProductId: product.id,
        };
      });
      
      // Format response for app integration
      const inventorySnapshot = {
        date: new Date().toISOString().split('T')[0],
        source: 'packiyo-direct',
        summary: {
          totalUnits,
          totalValue,
          skuCount: Object.keys(inventoryBySku).length,
          skippedNoSku,
          productCount: products.length,
        },
        // Format items array for easy merging with existing inventory structure
        items: Object.values(inventoryBySku)
          .map(item => ({
            sku: item.sku,
            name: item.name,
            quantity_on_hand: item.totalQty,
            quantity_available: item.quantityAvailable,
            quantity_committed: item.quantityCommitted,
            quantity_inbound: item.quantityInbound,
            cost: item.cost,
            value: item.totalValue,
            source: 'packiyo',
            byWarehouse: item.byWarehouse,
          }))
          .sort((a, b) => b.value - a.value),
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
    
    try {
      const shipments = [];
      let page = 1;
      let hasMore = true;
      
      while (hasMore) {
        const shipmentsRes = await fetch(
          `${baseUrl}/shipments?customer_id=${customerId}&page=${page}&per_page=100&shipped_after=${startDate}&shipped_before=${endDate}`, 
          { headers }
        );
        
        if (!shipmentsRes.ok) {
          return res.status(shipmentsRes.status).json({ 
            error: `Failed to fetch shipments: ${shipmentsRes.status}` 
          });
        }
        
        const data = await shipmentsRes.json();
        const pageShipments = data.data || [];
        shipments.push(...pageShipments);
        
        const meta = data.meta;
        if (meta && meta.current_page < meta.last_page) {
          page++;
        } else {
          hasMore = false;
        }
        
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
