// 3PL (Third-Party Logistics) utility functions
// Handles parsing and processing of 3PL/fulfillment data

import { loadXLSX } from './xlsx';

const parse3PLData = (threeplFiles) => {
  const breakdown = { storage: 0, shipping: 0, pickFees: 0, boxCharges: 0, receiving: 0, other: 0 };
  const metrics = {
    totalCost: 0,
    orderCount: 0,
    totalUnits: 0,
    avgShippingCost: 0,
    avgPickCost: 0,
    avgPackagingCost: 0,
    avgCostPerOrder: 0,
    avgUnitsPerOrder: 0,
    shippingCount: 0,
    firstPickCount: 0,
    additionalPickCount: 0,
  };
  
  if (!threeplFiles) return { breakdown, metrics };
  
  // Normalize to array of file data arrays
  // threeplFiles could be:
  // 1. null/undefined -> return empty
  // 2. Array of row objects (single file): [{Charge: x}, {Charge: y}] 
  // 3. Array of arrays (multiple files): [[{row1}, {row2}], [{row1}, {row2}]]
  let filesArray;
  if (Array.isArray(threeplFiles)) {
    // Check if first element is an array (multiple files) or an object (single file's rows)
    if (threeplFiles.length > 0 && Array.isArray(threeplFiles[0])) {
      // Multiple files: [[rows], [rows]]
      filesArray = threeplFiles;
    } else {
      // Single file: [rows] - wrap it
      filesArray = [threeplFiles];
    }
  } else {
    // Single non-array item (shouldn't happen but handle it)
    filesArray = [[threeplFiles]];
  }
  
  filesArray.forEach(fileData => {
    if (!fileData || !Array.isArray(fileData)) return;
    fileData.forEach(r => {
      if (!r || typeof r !== 'object') return;
      const charge = r['Charge On Invoice'] || '';
      const amount = parseFloat(r['Amount Total ($)'] || 0);
      const count = parseInt(r['Count Total'] || 0);
      const avg = parseFloat(r['Average ($)'] || 0);
      const chargeLower = charge.toLowerCase();
      
      metrics.totalCost += amount;
      
      if (chargeLower.includes('storage')) {
        breakdown.storage += amount;
      } else if (chargeLower.includes('shipping')) {
        breakdown.shipping += amount;
        metrics.shippingCount += count;
        metrics.avgShippingCost = avg; // Use the average from the row
      } else if (chargeLower.includes('first pick')) {
        breakdown.pickFees += amount;
        metrics.firstPickCount += count;
        metrics.orderCount += count; // First pick count = order count
      } else if (chargeLower.includes('additional pick')) {
        breakdown.pickFees += amount;
        metrics.additionalPickCount += count;
      } else if (chargeLower.includes('pick')) {
        breakdown.pickFees += amount;
      } else if (chargeLower.includes('box') || chargeLower.includes('mailer')) {
        breakdown.boxCharges += amount;
      } else if (chargeLower.includes('receiving')) {
        breakdown.receiving += amount;
      } else {
        breakdown.other += amount;
      }
    });
  });
  
  // Calculate derived metrics
  metrics.totalUnits = metrics.firstPickCount + metrics.additionalPickCount;
  
  if (metrics.orderCount > 0) {
    metrics.avgPickCost = breakdown.pickFees / metrics.orderCount;
    metrics.avgPackagingCost = breakdown.boxCharges / metrics.orderCount;
    // Fulfillment cost = everything except storage
    const fulfillmentCost = metrics.totalCost - breakdown.storage;
    metrics.avgCostPerOrder = fulfillmentCost / metrics.orderCount;
    metrics.avgUnitsPerOrder = metrics.totalUnits / metrics.orderCount;
  }
  
  return { breakdown, metrics };
};

// Parse Excel file for 3PL bulk upload - extracts Summary and Detail sheets
const parse3PLExcel = async (file) => {
  // Load SheetJS from CDN if not already loaded
  const xlsx = await loadXLSX();
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = xlsx.read(data, { type: 'array' });
        
        const result = {
          fileName: file.name,
          summary: [],
          detail: [],
          invoiceLevel: [],
          dateRange: { start: null, end: null },
          orders: [],
          nonOrderCharges: [],
          format: 'unknown',
        };
        
        // Detect format based on sheet names
        const sheetNames = workbook.SheetNames;
        const hasDetailSheet = sheetNames.includes('Detail');
        const hasSummarySheet = sheetNames.includes('Summary');
        const hasShipmentsSheet = sheetNames.some(s => s.toLowerCase().includes('shipment'));
        const hasPackagingSheet = sheetNames.includes('Packaging');
        
        // FORMAT 1: Packiyo Invoice Format (Summary, Detail, Invoice Level sheets)
        if (hasDetailSheet && hasSummarySheet) {
          result.format = 'packiyo-invoice';
          
          // Parse Summary sheet
          const summarySheet = workbook.Sheets['Summary'];
          result.summary = xlsx.utils.sheet_to_json(summarySheet);
          
          // Parse Detail sheet
          const detailSheet = workbook.Sheets['Detail'];
          const detailRows = xlsx.utils.sheet_to_json(detailSheet);
          result.detail = detailRows;
          
          // Extract orders with dates
          detailRows.forEach(row => {
            const shipDateStr = row['Ship Datetime'] || row['Order Datetime'];
            if (!shipDateStr) return;
            
            // Parse date (format: "2025-10-19 04:58:32 PM" or "2025-09-16 08:53:45 AM")
            const dateStr = shipDateStr.toString().split(' ')[0];
            const shipDate = new Date(dateStr + 'T00:00:00');
            if (isNaN(shipDate)) return;
            
            const orderNumber = (row['Order Number'] || '').toString();
            const trackingNumber = (row['Tracking Number'] || '').toString();
            const uniqueKey = `${orderNumber}-${trackingNumber}`;
            const weekKey = getSunday(shipDate);
            
            // Update date range
            if (!result.dateRange.start || shipDate < new Date(result.dateRange.start)) {
              result.dateRange.start = shipDate.toISOString().split('T')[0];
            }
            if (!result.dateRange.end || shipDate > new Date(result.dateRange.end)) {
              result.dateRange.end = shipDate.toISOString().split('T')[0];
            }
            
            result.orders.push({
              uniqueKey,
              orderNumber,
              trackingNumber,
              shipDate: shipDate.toISOString().split('T')[0],
              weekKey,
              carrier: (row['Carrier Name'] || '').toString(),
              serviceLevel: (row['Service Level Name'] || '').toString(),
              state: (row['Ship Recipient Address State'] || '').toString(),
              postalCode: (row['Ship Recipient Address Postal Code'] || '').toString(),
              weight: parseFloat(row['Weight Value'] || 0),
              weightUnit: (row['Weight Unit'] || 'oz').toString(),
              packageType: (row['Package Type Name'] || '').toString(),
              charges: {
                additionalPick: parseFloat(row['Additional Pick Fee - Amount ($)'] || 0),
                additionalPickQty: parseInt(row['Additional Pick Fee - Quantity'] || 0),
                firstPick: parseFloat(row['First Pick Fee - Amount ($)'] || 0),
                firstPickQty: parseInt(row['First Pick Fee - Quantity'] || 0),
                box: parseFloat(row['Box Charge - Amount ($)'] || 0),
                boxQty: parseInt(row['Box Charge - Quantity'] || 0),
                reBoxing: parseFloat(row['Re-Boxing Fee - Amount ($)'] || 0),
                fbaForwarding: parseFloat(row['Fba Forwarding - Amount ($)'] || 0),
              },
            });
          });
          
          // Parse Invoice Level for non-order charges
          if (sheetNames.includes('Invoice Level')) {
            const invoiceSheet = workbook.Sheets['Invoice Level'];
            result.invoiceLevel = xlsx.utils.sheet_to_json(invoiceSheet);
          }
          
          // Extract non-order charges from Summary
          result.summary.forEach(row => {
            const charge = (row['Charge On Invoice'] || '').toString();
            const chargeLower = charge.toLowerCase();
            const amount = parseFloat(row['Amount Total ($)'] || 0);
            const count = parseInt(row['Count Total'] || 0);
            
            if (chargeLower.includes('storage') || chargeLower.includes('receiving') || 
                chargeLower.includes('shipping') || chargeLower.includes('credit') ||
                chargeLower.includes('special project')) {
              result.nonOrderCharges.push({
                chargeType: charge,
                amount,
                count,
                average: parseFloat(row['Average ($)'] || 0),
              });
            }
          });
        }
        
        // FORMAT 2: Packiyo Shipments Export (Shipments sheet with order/shipment_date columns)
        else if (hasShipmentsSheet) {
          result.format = 'packiyo-shipments';
          
          // Find the shipments sheet
          const shipmentsSheetName = sheetNames.find(s => s.toLowerCase().includes('shipment'));
          const shipmentsSheet = workbook.Sheets[shipmentsSheetName];
          const rows = xlsx.utils.sheet_to_json(shipmentsSheet);
          
          // Parse packaging costs if available
          let packagingCosts = {};
          if (hasPackagingSheet) {
            const packagingSheet = workbook.Sheets['Packaging'];
            const packagingRows = xlsx.utils.sheet_to_json(packagingSheet);
            packagingRows.forEach(row => {
              const type = (row['Type of Packaging'] || '').toString();
              const cost = parseFloat(row['Packaging Cost'] || 0);
              if (type && cost > 0) packagingCosts[type.toLowerCase()] = cost;
            });
          }
          
          rows.forEach(row => {
            // Try different column name variations
            const shipDateStr = row['shipment_date'] || row['Shipment Date'] || row['ship_date'] || row['order_date'] || row['Order Date'];
            if (!shipDateStr) return;
            
            // Parse date (format: "2025-07-31 21:25:24")
            const dateStr = shipDateStr.toString().split(' ')[0];
            const shipDate = new Date(dateStr + 'T00:00:00');
            if (isNaN(shipDate)) return;
            
            const orderNumber = (row['order'] || row['Order'] || row['order_number'] || row['Order Number'] || '').toString();
            const trackingNumber = (row['tracking_number'] || row['Tracking Number'] || '').toString();
            // Extract just the tracking number if it's a URL
            const trackingClean = trackingNumber.includes('http') ? trackingNumber.split('/').pop() : trackingNumber;
            const uniqueKey = `${orderNumber}-${trackingClean || shipDate.toISOString()}`;
            const weekKey = getSunday(shipDate);
            
            // Update date range
            if (!result.dateRange.start || shipDate < new Date(result.dateRange.start)) {
              result.dateRange.start = shipDate.toISOString().split('T')[0];
            }
            if (!result.dateRange.end || shipDate > new Date(result.dateRange.end)) {
              result.dateRange.end = shipDate.toISOString().split('T')[0];
            }
            
            // Try to estimate costs from packaging info
            let packagingCost = 0;
            const packaging = (row['packaging'] || row['Packaging'] || row['package_type'] || '').toString().toLowerCase();
            if (packaging && packagingCosts[packaging]) {
              packagingCost = packagingCosts[packaging];
            }
            
            result.orders.push({
              uniqueKey,
              orderNumber,
              trackingNumber: trackingClean,
              shipDate: shipDate.toISOString().split('T')[0],
              weekKey,
              carrier: (row['shipping_carrier'] || row['Shipping Carrier'] || row['user_defined_shipping_carrier'] || '').toString(),
              serviceLevel: (row['shipping_method'] || row['Shipping Method'] || '').toString(),
              state: (row['state'] || row['State'] || '').toString(),
              postalCode: (row['zip'] || row['Zip'] || row['postal_code'] || '').toString(),
              weight: parseFloat(row['weight'] || row['Weight'] || 0),
              weightUnit: 'oz',
              packageType: packaging,
              charges: {
                // This format doesn't have per-order charges, use packaging costs
                additionalPick: 0,
                additionalPickQty: 0,
                firstPick: 2.50, // Default pick fee estimate
                firstPickQty: 1,
                box: packagingCost,
                boxQty: packagingCost > 0 ? 1 : 0,
                reBoxing: 0,
                fbaForwarding: 0,
              },
            });
          });
        }
        
        // FORMAT 3: Simple summary sheet - try to extract what we can
        else {
          result.format = 'simple-summary';
          
          // Try first sheet
          const firstSheet = workbook.Sheets[sheetNames[0]];
          const rows = xlsx.utils.sheet_to_json(firstSheet, { header: 1 });
          
          // Look for any date info in filename
          const fileNameMatch = file.name.match(/(\d{1,2})[_-](\d{1,2})[_-]?(\d{1,2})?[_-]?(\d{1,2})?/);
          if (fileNameMatch) {
            // Try to parse date range from filename like "8_1-8_31" or "9_1-9_30"
            const month1 = parseInt(fileNameMatch[1]);
            const day1 = parseInt(fileNameMatch[2]);
            const month2 = fileNameMatch[3] ? parseInt(fileNameMatch[3]) : month1;
            const day2 = fileNameMatch[4] ? parseInt(fileNameMatch[4]) : 28;
            const year = 2025; // Default year
            
            result.dateRange.start = `${year}-${String(month1).padStart(2, '0')}-${String(day1).padStart(2, '0')}`;
            result.dateRange.end = `${year}-${String(month2).padStart(2, '0')}-${String(day2).padStart(2, '0')}`;
          }
          
          // Try to extract order count from content
          rows.forEach(row => {
            if (Array.isArray(row)) {
              const text = row.join(' ').toLowerCase();
              if (text.includes('order') && row[1]) {
                const count = parseInt(row[1]) || 0;
                if (count > 0 && count < 10000) {
                  // Create placeholder orders based on count
                  // This is imprecise but better than nothing
                }
              }
            }
          });
        }
        
        resolve(result);
      } catch (err) {
        console.error('Error parsing 3PL file:', err);
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

// Helper to get 3PL data for a specific week from the ledger
const get3PLForWeek = (ledger, weekKey) => {
  if (!ledger) return null;
  
  // Convert weekKey to date for fuzzy matching
  const targetDate = new Date(weekKey + 'T00:00:00');
  const targetStart = new Date(targetDate);
  targetStart.setDate(targetDate.getDate() - 6); // Start of week (7 days before)
  const targetEnd = new Date(targetDate);
  targetEnd.setDate(targetDate.getDate() + 1); // Include day after for timezone tolerance
  
  // Find orders that match this week (fuzzy match within 2 days of week boundary)
  const weekOrders = ledger.orders ? Object.values(ledger.orders).filter(o => {
    // Try exact match first
    if (o.weekKey === weekKey) return true;
    
    // Try fuzzy match - check if order's weekKey is within 2 days of target
    if (o.weekKey) {
      const orderWeekDate = new Date(o.weekKey + 'T00:00:00');
      const diffDays = Math.abs((orderWeekDate - targetDate) / (1000 * 60 * 60 * 24));
      if (diffDays <= 2) return true;
    }
    
    // Also try matching by shipDate
    if (o.shipDate) {
      const shipDate = new Date(o.shipDate + 'T00:00:00');
      return shipDate >= targetStart && shipDate <= targetEnd;
    }
    
    return false;
  }) : [];
  
  const breakdown = { storage: 0, shipping: 0, pickFees: 0, boxCharges: 0, receiving: 0, other: 0 };
  const metrics = {
    totalCost: 0,
    orderCount: weekOrders.length,
    totalUnits: 0,
    avgShippingCost: 0,
    avgPickCost: 0,
    avgPackagingCost: 0,
    avgCostPerOrder: 0,
    avgUnitsPerOrder: 0,
    shippingCount: 0,
    firstPickCount: 0,
    additionalPickCount: 0,
    carrierBreakdown: {},
    stateBreakdown: {},
  };
  
  let totalShipping = 0;
  
  weekOrders.forEach(order => {
    const c = order.charges || {};
    breakdown.pickFees += (c.firstPick || 0) + (c.additionalPick || 0);
    breakdown.boxCharges += c.box || 0;
    breakdown.other += (c.reBoxing || 0) + (c.fbaForwarding || 0);
    
    metrics.firstPickCount += c.firstPickQty || 0;
    metrics.additionalPickCount += c.additionalPickQty || 0;
    
    // Track by carrier
    if (order.carrier) {
      if (!metrics.carrierBreakdown[order.carrier]) metrics.carrierBreakdown[order.carrier] = { orders: 0, cost: 0 };
      metrics.carrierBreakdown[order.carrier].orders++;
    }
    
    // Track by state
    if (order.state) {
      if (!metrics.stateBreakdown[order.state]) metrics.stateBreakdown[order.state] = 0;
      metrics.stateBreakdown[order.state]++;
    }
  });
  
  // Add non-order charges allocated to this week (fuzzy match)
  Object.values(ledger.summaryCharges || {}).forEach(charge => {
    const chargeWeekDate = new Date((charge.weekKey || '') + 'T00:00:00');
    const diffDays = Math.abs((chargeWeekDate - targetDate) / (1000 * 60 * 60 * 24));
    
    if (charge.weekKey === weekKey || diffDays <= 2) {
      const chargeLower = (charge.chargeType || '').toLowerCase();
      if (chargeLower.includes('storage')) breakdown.storage += charge.amount || 0;
      else if (chargeLower.includes('shipping')) {
        breakdown.shipping += charge.amount || 0;
        totalShipping += charge.amount || 0;
        metrics.shippingCount += charge.count || 0;
      }
      else if (chargeLower.includes('receiving')) breakdown.receiving += charge.amount || 0;
      else breakdown.other += charge.amount || 0;
    }
  });
  
  metrics.totalUnits = metrics.firstPickCount + metrics.additionalPickCount;
  metrics.totalCost = breakdown.storage + breakdown.shipping + breakdown.pickFees + breakdown.boxCharges + breakdown.receiving + breakdown.other;
  
  // Return null if no data found (no orders and no costs)
  if (metrics.orderCount === 0 && metrics.totalCost === 0) return null;
  
  if (metrics.orderCount > 0) {
    metrics.avgPickCost = breakdown.pickFees / metrics.orderCount;
    metrics.avgPackagingCost = breakdown.boxCharges / metrics.orderCount;
    const fulfillmentCost = metrics.totalCost - breakdown.storage;
    metrics.avgCostPerOrder = fulfillmentCost / metrics.orderCount;
    metrics.avgUnitsPerOrder = metrics.totalUnits / metrics.orderCount;
    if (metrics.shippingCount > 0) metrics.avgShippingCost = totalShipping / metrics.shippingCount;
  }
  
  return { breakdown, metrics };
};

// Get 3PL data for a specific day by filtering ledger orders by shipDate
// NOTE: Storage is excluded as it's a weekly/monthly aggregate, not per-shipment
const get3PLForDay = (ledger, dayKey) => {
  if (!ledger || !ledger.orders) return null;
  
  // Find orders that shipped on this specific day
  const dayOrders = Object.values(ledger.orders).filter(o => o.shipDate === dayKey);
  
  if (dayOrders.length === 0) return null;
  
  const breakdown = { storage: 0, shipping: 0, pickFees: 0, boxCharges: 0, receiving: 0, other: 0 };
  const metrics = {
    totalCost: 0,
    orderCount: dayOrders.length,
    totalUnits: 0,
    avgShippingCost: 0,
    avgPickCost: 0,
    avgPackagingCost: 0,
    avgCostPerOrder: 0,
    avgUnitsPerOrder: 0,
    shippingCount: 0,
    firstPickCount: 0,
    additionalPickCount: 0,
    carrierBreakdown: {},
    stateBreakdown: {},
  };
  
  let totalShipping = 0;
  
  dayOrders.forEach(order => {
    const c = order.charges || {};
    breakdown.pickFees += (c.firstPick || 0) + (c.additionalPick || 0);
    breakdown.boxCharges += c.box || 0;
    breakdown.other += (c.reBoxing || 0) + (c.fbaForwarding || 0);
    
    metrics.firstPickCount += c.firstPickQty || 0;
    metrics.additionalPickCount += c.additionalPickQty || 0;
    
    // Track by carrier
    if (order.carrier) {
      if (!metrics.carrierBreakdown[order.carrier]) metrics.carrierBreakdown[order.carrier] = { orders: 0, cost: 0 };
      metrics.carrierBreakdown[order.carrier].orders++;
    }
    
    // Track by state
    if (order.state) {
      if (!metrics.stateBreakdown[order.state]) metrics.stateBreakdown[order.state] = 0;
      metrics.stateBreakdown[order.state]++;
    }
  });
  
  // Storage is NOT included in daily - it's a weekly/monthly aggregate charge
  // Only order-level charges (pick fees, box charges, etc.) are included
  
  metrics.totalUnits = metrics.firstPickCount + metrics.additionalPickCount;
  metrics.totalCost = breakdown.pickFees + breakdown.boxCharges + breakdown.other; // No storage
  
  if (metrics.orderCount > 0) {
    metrics.avgPickCost = breakdown.pickFees / metrics.orderCount;
    metrics.avgPackagingCost = breakdown.boxCharges / metrics.orderCount;
    metrics.avgCostPerOrder = metrics.totalCost / metrics.orderCount;
    metrics.avgUnitsPerOrder = metrics.totalUnits / metrics.orderCount;
  }
  
  return { breakdown, metrics };
};

// Get 3PL data for a period (month/quarter/year) by aggregating from ledger
const get3PLForPeriod = (ledger, periodKey) => {
  if (!ledger || !ledger.orders) return null;
  
  // Parse period key to determine date range
  let startDate, endDate;
  
  if (periodKey.match(/^\d{4}$/)) {
    // Year: "2025"
    startDate = new Date(parseInt(periodKey), 0, 1);
    endDate = new Date(parseInt(periodKey), 11, 31);
  } else if (periodKey.match(/^Q[1-4] \d{4}$/)) {
    // Quarter: "Q3 2024"
    const [q, year] = periodKey.split(' ');
    const quarter = parseInt(q[1]) - 1;
    startDate = new Date(parseInt(year), quarter * 3, 1);
    endDate = new Date(parseInt(year), quarter * 3 + 3, 0);
  } else if (periodKey.match(/^[A-Za-z]+ \d{4}$/)) {
    // Month: "September 2025"
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 
                    'july', 'august', 'september', 'october', 'november', 'december'];
    const parts = periodKey.split(' ');
    const monthIdx = months.indexOf(parts[0].toLowerCase());
    const year = parseInt(parts[1]);
    if (monthIdx >= 0) {
      startDate = new Date(year, monthIdx, 1);
      endDate = new Date(year, monthIdx + 1, 0);
    }
  }
  
  if (!startDate || !endDate) return null;
  
  // Filter orders within date range
  const periodOrders = Object.values(ledger.orders).filter(o => {
    const orderDate = new Date(o.shipDate + 'T00:00:00');
    return orderDate >= startDate && orderDate <= endDate;
  });
  
  if (periodOrders.length === 0) return null;
  
  const breakdown = { storage: 0, shipping: 0, pickFees: 0, boxCharges: 0, receiving: 0, other: 0 };
  const metrics = {
    totalCost: 0,
    orderCount: periodOrders.length,
    totalUnits: 0,
    avgCostPerOrder: 0,
    avgUnitsPerOrder: 0,
  };
  
  periodOrders.forEach(order => {
    const c = order.charges || {};
    breakdown.pickFees += (c.firstPick || 0) + (c.additionalPick || 0);
    breakdown.boxCharges += c.box || 0;
    breakdown.other += (c.reBoxing || 0) + (c.fbaForwarding || 0);
    metrics.totalUnits += (c.firstPickQty || 0) + (c.additionalPickQty || 0);
  });
  
  // Add summary charges within date range
  Object.values(ledger.summaryCharges || {}).forEach(charge => {
    const chargeDate = new Date((charge.weekKey || '') + 'T00:00:00');
    if (chargeDate >= startDate && chargeDate <= endDate) {
      const chargeLower = (charge.chargeType || '').toLowerCase();
      if (chargeLower.includes('storage')) breakdown.storage += charge.amount || 0;
      else if (chargeLower.includes('shipping')) breakdown.shipping += charge.amount || 0;
      else if (chargeLower.includes('receiving')) breakdown.receiving += charge.amount || 0;
      else breakdown.other += charge.amount || 0;
    }
  });
  
  metrics.totalCost = breakdown.storage + breakdown.shipping + breakdown.pickFees + breakdown.boxCharges + breakdown.receiving + breakdown.other;
  if (metrics.orderCount > 0) {
    metrics.avgCostPerOrder = (metrics.totalCost - breakdown.storage) / metrics.orderCount;
    metrics.avgUnitsPerOrder = metrics.totalUnits / metrics.orderCount;
  }
  
  return { breakdown, metrics };
};

export { parse3PLData, parse3PLExcel, get3PLForWeek, get3PLForDay, get3PLForPeriod };
