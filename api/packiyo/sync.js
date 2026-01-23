// Vercel Serverless Function - Packiyo 3PL Inventory Sync
// Path: /api/packiyo/sync.js

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { apiKey, customerId, syncType, test, baseUrl: providedBaseUrl } = req.body;

  // Validate required fields
  if (!apiKey) {
    return res.status(400).json({ error: 'Packiyo API key is required' });
  }
  
  if (!customerId) {
    return res.status(400).json({ error: 'Packiyo Customer ID is required' });
  }

  // Use tenant-specific URL if provided, otherwise default
  const baseUrl = providedBaseUrl || 'https://excel3pl.packiyo.com/api/v1';
  
  // Packiyo API headers - IMPORTANT: Use Accept: */* (not application/json)
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Accept': '*/*',
  };

  // Test connection
  if (test) {
    try {
      // Use JSON:API pagination format: page[number]=1&page[size]=1
      const testRes = await fetch(`${baseUrl}/products?customer_id=${customerId}&page[number]=1&page[size]=1`, {
        method: 'GET',
        headers,
      });
      
      if (!testRes.ok) {
        const errorText = await testRes.text();
        console.error('Packiyo API error:', testRes.status, errorText);
        
        if (testRes.status === 401) {
          return res.status(401).json({ error: 'Invalid API key' });
        }
        if (testRes.status === 403) {
          return res.status(403).json({ error: 'Access forbidden. Check API key permissions.' });
        }
        return res.status(testRes.status).json({ error: `Packiyo API error: ${testRes.status}` });
      }
      
      const data = await testRes.json();
      return res.status(200).json({ 
        success: true, 
        customerName: 'Excel3PL',
        customerId: customerId,
        productCount: data.data?.length || 0,
      });
    } catch (err) {
      console.error('Connection test error:', err);
      return res.status(500).json({ error: err.message || 'Connection failed' });
    }
  }

  // ============ INVENTORY SYNC ============
  if (syncType === 'inventory') {
    try {
      const products = [];
      let page = 1;
      let hasMore = true;
      
      while (hasMore) {
        // Use JSON:API pagination format: page[number]=X&page[size]=100
        const productsRes = await fetch(
          `${baseUrl}/products?customer_id=${customerId}&page[number]=${page}&page[size]=100`, 
          { method: 'GET', headers }
        );
        
        if (!productsRes.ok) {
          const errorText = await productsRes.text();
          console.error('Products fetch error:', productsRes.status, errorText);
          return res.status(productsRes.status).json({ 
            error: `Failed to fetch products: ${productsRes.status}` 
          });
        }
        
        const data = await productsRes.json();
        const pageProducts = data.data || [];
        products.push(...pageProducts);
        
        // Check pagination - JSON:API format uses meta.last_page or links.next
        const meta = data.meta;
        if (meta && meta.current_page < meta.last_page) {
          page++;
        } else if (data.links?.next) {
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
        
        if (!sku) {
          skippedNoSku++;
          return;
        }
        
        // Get quantity - try multiple field names
        const qty = parseInt(product.quantity_on_hand) || 
                    parseInt(product.quantity_available) || 
                    parseInt(product.quantity) || 0;
        const inbound = parseInt(product.quantity_inbound) || 0;
        const cost = parseFloat(product.value) || parseFloat(product.cost) || parseFloat(product.price) || 0;
        
        totalUnits += qty;
        totalValue += qty * cost;
        
        inventoryBySku[sku] = {
          sku,
          name: product.name || sku,
          barcode: product.barcode || '',
          totalQty: qty,
          quantity_on_hand: qty,
          quantity_available: parseInt(product.quantity_available) || qty,
          quantity_committed: parseInt(product.quantity_committed) || 0,
          quantity_inbound: inbound,
          cost,
          totalValue: qty * cost,
          packiyoProductId: product.id,
        };
      });
      
      return res.status(200).json({
        success: true,
        syncType: 'inventory',
        date: new Date().toISOString().split('T')[0],
        source: 'packiyo-direct',
        summary: {
          totalUnits,
          totalValue,
          skuCount: Object.keys(inventoryBySku).length,
          skippedNoSku,
          productCount: products.length,
        },
        items: Object.values(inventoryBySku)
          .map(item => ({
            sku: item.sku,
            name: item.name,
            quantity_on_hand: item.quantity_on_hand,
            quantity_available: item.quantity_available,
            quantity_committed: item.quantity_committed,
            quantity_inbound: item.quantity_inbound,
            cost: item.cost,
            value: item.totalValue,
            source: 'packiyo',
          }))
          .sort((a, b) => b.value - a.value),
        inventoryBySku,
      });
      
    } catch (err) {
      console.error('Packiyo inventory sync error:', err);
      return res.status(500).json({ error: `Inventory sync failed: ${err.message}` });
    }
  }

  return res.status(400).json({ error: 'Invalid syncType. Use: inventory' });
}
