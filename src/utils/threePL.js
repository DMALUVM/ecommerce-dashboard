// 3PL (Third-Party Logistics) utility functions
import { loadXLSX } from './xlsx';
import { getSunday } from './date';

const parse3PLData = (threeplFiles) => {
  const breakdown = { storage: 0, shipping: 0, pickFees: 0, boxCharges: 0, receiving: 0, other: 0 };
  const metrics = {
    totalCost: 0, orderCount: 0, totalUnits: 0, avgShippingCost: 0, avgPickCost: 0,
    avgPackagingCost: 0, avgCostPerOrder: 0, avgUnitsPerOrder: 0, shippingCount: 0,
    firstPickCount: 0, additionalPickCount: 0,
  };
  
  if (!threeplFiles) return { breakdown, metrics };
  
  let filesArray;
  if (Array.isArray(threeplFiles)) {
    if (threeplFiles.length > 0 && Array.isArray(threeplFiles[0])) {
      filesArray = threeplFiles;
    } else {
      filesArray = [threeplFiles];
    }
  } else {
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
        metrics.avgShippingCost = avg;
      } else if (chargeLower.includes('first pick')) {
        breakdown.pickFees += amount;
        metrics.firstPickCount += count;
        metrics.orderCount += count;
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
  
  metrics.totalUnits = metrics.firstPickCount + metrics.additionalPickCount;
  if (metrics.orderCount > 0) {
    metrics.avgPickCost = breakdown.pickFees / metrics.orderCount;
    metrics.avgPackagingCost = breakdown.boxCharges / metrics.orderCount;
    const fulfillmentCost = metrics.totalCost - breakdown.storage;
    metrics.avgCostPerOrder = fulfillmentCost / metrics.orderCount;
    metrics.avgUnitsPerOrder = metrics.totalUnits / metrics.orderCount;
  }
  
  return { breakdown, metrics };
};

const parse3PLExcel = async (file) => {
  const xlsx = await loadXLSX();
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = xlsx.read(data, { type: 'array' });
        
        const result = {
          fileName: file.name, summary: [], detail: [], invoiceLevel: [],
          dateRange: { start: null, end: null }, orders: [], nonOrderCharges: [], format: 'unknown',
        };
        
        const sheetNames = workbook.SheetNames;
        const hasDetailSheet = sheetNames.includes('Detail');
        const hasSummarySheet = sheetNames.includes('Summary');
        const hasShipmentsSheet = sheetNames.some(s => s.toLowerCase().includes('shipment'));
        const hasPackagingSheet = sheetNames.includes('Packaging');
        
        if (hasDetailSheet && hasSummarySheet) {
          result.format = 'packiyo-invoice';
          const summarySheet = workbook.Sheets['Summary'];
          result.summary = xlsx.utils.sheet_to_json(summarySheet);
          const detailSheet = workbook.Sheets['Detail'];
          const detailRows = xlsx.utils.sheet_to_json(detailSheet);
          result.detail = detailRows;
          
          detailRows.forEach(row => {
            const shipDateStr = row['Ship Datetime'] || row['Order Datetime'];
            if (!shipDateStr) return;
            const dateStr = shipDateStr.toString().split(' ')[0];
            const shipDate = new Date(dateStr + 'T12:00:00');
            if (isNaN(shipDate)) return;
            
            const orderNumber = (row['Order Number'] || '').toString();
            const trackingNumber = (row['Tracking Number'] || '').toString();
            const uniqueKey = `${orderNumber}-${trackingNumber}`;
            const weekKey = getSunday(shipDate);
            
            if (!result.dateRange.start || shipDate < new Date(result.dateRange.start + 'T12:00:00')) {
              result.dateRange.start = shipDate.toISOString().split('T')[0];
            }
            if (!result.dateRange.end || shipDate > new Date(result.dateRange.end + 'T12:00:00')) {
              result.dateRange.end = shipDate.toISOString().split('T')[0];
            }
            
            result.orders.push({
              uniqueKey, orderNumber, trackingNumber,
              shipDate: shipDate.toISOString().split('T')[0], weekKey,
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
          
          if (sheetNames.includes('Invoice Level')) {
            const invoiceSheet = workbook.Sheets['Invoice Level'];
            result.invoiceLevel = xlsx.utils.sheet_to_json(invoiceSheet);
          }
          
          result.summary.forEach(row => {
            const charge = (row['Charge On Invoice'] || '').toString();
            const chargeLower = charge.toLowerCase();
            const amount = parseFloat(row['Amount Total ($)'] || 0);
            const count = parseInt(row['Count Total'] || 0);
            
            if (chargeLower.includes('storage') || chargeLower.includes('receiving') || 
                chargeLower.includes('shipping') || chargeLower.includes('credit') ||
                chargeLower.includes('special project')) {
              result.nonOrderCharges.push({
                chargeType: charge, amount, count,
                average: parseFloat(row['Average ($)'] || 0),
              });
            }
          });
        } else if (hasShipmentsSheet) {
          result.format = 'packiyo-shipments';
          const shipmentsSheetName = sheetNames.find(s => s.toLowerCase().includes('shipment'));
          const shipmentsSheet = workbook.Sheets[shipmentsSheetName];
          const rows = xlsx.utils.sheet_to_json(shipmentsSheet);
          
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
            const shipDateStr = row['shipment_date'] || row['Shipment Date'] || row['ship_date'] || row['order_date'] || row['Order Date'];
            if (!shipDateStr) return;
            const dateStr = shipDateStr.toString().split(' ')[0];
            const shipDate = new Date(dateStr + 'T12:00:00');
            if (isNaN(shipDate)) return;
            
            const orderNumber = (row['order'] || row['Order'] || row['order_number'] || row['Order Number'] || '').toString();
            const trackingNumber = (row['tracking_number'] || row['Tracking Number'] || '').toString();
            const trackingClean = trackingNumber.includes('http') ? trackingNumber.split('/').pop() : trackingNumber;
            const uniqueKey = `${orderNumber}-${trackingClean || shipDate.toISOString()}`;
            const weekKey = getSunday(shipDate);
            
            if (!result.dateRange.start || shipDate < new Date(result.dateRange.start + 'T12:00:00')) {
              result.dateRange.start = shipDate.toISOString().split('T')[0];
            }
            if (!result.dateRange.end || shipDate > new Date(result.dateRange.end + 'T12:00:00')) {
              result.dateRange.end = shipDate.toISOString().split('T')[0];
            }
            
            let packagingCost = 0;
            const packaging = (row['packaging'] || row['Packaging'] || row['package_type'] || '').toString().toLowerCase();
            if (packaging && packagingCosts[packaging]) {
              packagingCost = packagingCosts[packaging];
            }
            
            result.orders.push({
              uniqueKey, orderNumber, trackingNumber: trackingClean,
              shipDate: shipDate.toISOString().split('T')[0], weekKey,
              carrier: (row['shipping_carrier'] || row['Shipping Carrier'] || row['user_defined_shipping_carrier'] || '').toString(),
              serviceLevel: (row['shipping_method'] || row['Shipping Method'] || '').toString(),
              state: (row['state'] || row['State'] || '').toString(),
              postalCode: (row['zip'] || row['Zip'] || row['postal_code'] || '').toString(),
              weight: parseFloat(row['weight'] || row['Weight'] || 0),
              weightUnit: 'oz', packageType: packaging,
              charges: {
                additionalPick: 0, additionalPickQty: 0, firstPick: 2.50, firstPickQty: 1,
                box: packagingCost, boxQty: packagingCost > 0 ? 1 : 0, reBoxing: 0, fbaForwarding: 0,
              },
            });
          });
        } else {
          result.format = 'simple-summary';
          const firstSheet = workbook.Sheets[sheetNames[0]];
          const rows = xlsx.utils.sheet_to_json(firstSheet, { header: 1 });
          
          const fileNameMatch = file.name.match(/(\d{1,2})[_-](\d{1,2})[_-]?(\d{1,2})?[_-]?(\d{1,2})?/);
          if (fileNameMatch) {
            const month1 = parseInt(fileNameMatch[1]);
            const day1 = parseInt(fileNameMatch[2]);
            const month2 = fileNameMatch[3] ? parseInt(fileNameMatch[3]) : month1;
            const day2 = fileNameMatch[4] ? parseInt(fileNameMatch[4]) : 28;
            const year = 2025;
            result.dateRange.start = `${year}-${String(month1).padStart(2, '0')}-${String(day1).padStart(2, '0')}`;
            result.dateRange.end = `${year}-${String(month2).padStart(2, '0')}-${String(day2).padStart(2, '0')}`;
          }
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

const get3PLForWeek = (ledger, weekKey) => {
  if (!ledger) return null;
  
  const targetDate = new Date(weekKey + 'T12:00:00');
  const targetStart = new Date(targetDate);
  targetStart.setDate(targetDate.getDate() - 6);
  const targetEnd = new Date(targetDate);
  targetEnd.setDate(targetDate.getDate() + 1);
  
  const weekOrders = ledger.orders ? Object.values(ledger.orders).filter(o => {
    if (o.weekKey === weekKey) return true;
    if (o.weekKey) {
      const orderWeekDate = new Date(o.weekKey + 'T12:00:00');
      const diffDays = Math.abs((orderWeekDate - targetDate) / (1000 * 60 * 60 * 24));
      if (diffDays <= 2) return true;
    }
    if (o.shipDate) {
      const shipDate = new Date(o.shipDate + 'T12:00:00');
      return shipDate >= targetStart && shipDate <= targetEnd;
    }
    return false;
  }) : [];
  
  const breakdown = { storage: 0, shipping: 0, pickFees: 0, boxCharges: 0, receiving: 0, other: 0 };
  const metrics = {
    totalCost: 0, orderCount: weekOrders.length, totalUnits: 0, avgShippingCost: 0, avgPickCost: 0,
    avgPackagingCost: 0, avgCostPerOrder: 0, avgUnitsPerOrder: 0, shippingCount: 0, firstPickCount: 0,
    additionalPickCount: 0, carrierBreakdown: {}, stateBreakdown: {},
  };
  
  let totalShipping = 0;
  
  weekOrders.forEach(order => {
    const c = order.charges || {};
    breakdown.pickFees += (c.firstPick || 0) + (c.additionalPick || 0);
    breakdown.boxCharges += c.box || 0;
    breakdown.other += (c.reBoxing || 0) + (c.fbaForwarding || 0);
    metrics.firstPickCount += c.firstPickQty || 0;
    metrics.additionalPickCount += c.additionalPickQty || 0;
    if (order.carrier) {
      if (!metrics.carrierBreakdown[order.carrier]) metrics.carrierBreakdown[order.carrier] = { orders: 0, cost: 0 };
      metrics.carrierBreakdown[order.carrier].orders++;
    }
    if (order.state) {
      if (!metrics.stateBreakdown[order.state]) metrics.stateBreakdown[order.state] = 0;
      metrics.stateBreakdown[order.state]++;
    }
  });
  
  Object.values(ledger.summaryCharges || {}).forEach(charge => {
    const chargeWeekDate = new Date((charge.weekKey || '') + 'T12:00:00');
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

const get3PLForDay = (ledger, dayKey) => {
  if (!ledger || !ledger.orders) return null;
  const dayOrders = Object.values(ledger.orders).filter(o => o.shipDate === dayKey);
  if (dayOrders.length === 0) return null;
  
  const breakdown = { storage: 0, shipping: 0, pickFees: 0, boxCharges: 0, receiving: 0, other: 0 };
  const metrics = {
    totalCost: 0, orderCount: dayOrders.length, totalUnits: 0, avgShippingCost: 0, avgPickCost: 0,
    avgPackagingCost: 0, avgCostPerOrder: 0, avgUnitsPerOrder: 0, shippingCount: 0, firstPickCount: 0,
    additionalPickCount: 0, carrierBreakdown: {}, stateBreakdown: {},
  };
  
  dayOrders.forEach(order => {
    const c = order.charges || {};
    breakdown.pickFees += (c.firstPick || 0) + (c.additionalPick || 0);
    breakdown.boxCharges += c.box || 0;
    breakdown.other += (c.reBoxing || 0) + (c.fbaForwarding || 0);
    metrics.firstPickCount += c.firstPickQty || 0;
    metrics.additionalPickCount += c.additionalPickQty || 0;
    if (order.carrier) {
      if (!metrics.carrierBreakdown[order.carrier]) metrics.carrierBreakdown[order.carrier] = { orders: 0, cost: 0 };
      metrics.carrierBreakdown[order.carrier].orders++;
    }
    if (order.state) {
      if (!metrics.stateBreakdown[order.state]) metrics.stateBreakdown[order.state] = 0;
      metrics.stateBreakdown[order.state]++;
    }
  });
  
  metrics.totalUnits = metrics.firstPickCount + metrics.additionalPickCount;
  metrics.totalCost = breakdown.pickFees + breakdown.boxCharges + breakdown.other;
  
  if (metrics.orderCount > 0) {
    metrics.avgPickCost = breakdown.pickFees / metrics.orderCount;
    metrics.avgPackagingCost = breakdown.boxCharges / metrics.orderCount;
    metrics.avgCostPerOrder = metrics.totalCost / metrics.orderCount;
    metrics.avgUnitsPerOrder = metrics.totalUnits / metrics.orderCount;
  }
  
  return { breakdown, metrics };
};

const get3PLForPeriod = (ledger, periodKey) => {
  if (!ledger || !ledger.orders) return null;
  
  let startDate, endDate;
  
  if (periodKey.match(/^\d{4}$/)) {
    startDate = new Date(parseInt(periodKey), 0, 1);
    endDate = new Date(parseInt(periodKey), 11, 31);
  } else if (periodKey.match(/^Q[1-4] \d{4}$/)) {
    const [q, year] = periodKey.split(' ');
    const quarter = parseInt(q[1]) - 1;
    startDate = new Date(parseInt(year), quarter * 3, 1);
    endDate = new Date(parseInt(year), quarter * 3 + 3, 0);
  } else if (periodKey.match(/^[A-Za-z]+ \d{4}$/)) {
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
  
  const periodOrders = Object.values(ledger.orders).filter(o => {
    const orderDate = new Date(o.shipDate + 'T12:00:00');
    return orderDate >= startDate && orderDate <= endDate;
  });
  
  if (periodOrders.length === 0) return null;
  
  const breakdown = { storage: 0, shipping: 0, pickFees: 0, boxCharges: 0, receiving: 0, other: 0 };
  const metrics = { totalCost: 0, orderCount: periodOrders.length, totalUnits: 0, avgCostPerOrder: 0, avgUnitsPerOrder: 0 };
  
  periodOrders.forEach(order => {
    const c = order.charges || {};
    breakdown.pickFees += (c.firstPick || 0) + (c.additionalPick || 0);
    breakdown.boxCharges += c.box || 0;
    breakdown.other += (c.reBoxing || 0) + (c.fbaForwarding || 0);
    metrics.totalUnits += (c.firstPickQty || 0) + (c.additionalPickQty || 0);
  });
  
  Object.values(ledger.summaryCharges || {}).forEach(charge => {
    const chargeDate = new Date((charge.weekKey || '') + 'T12:00:00');
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
