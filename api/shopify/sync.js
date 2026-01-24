// api/shopify/sync.js
// Shopify sync for orders, inventory, and product catalog.
// Metrics:
// - Daily/weekly "revenue" (dashboard): Gross collected (includes tax + shipping, net of discounts, net of refunds when possible)
// - SKU-level netSales: variant-style (excludes shipping; includes item tax; net of discounts and refunded items)
//
// Notes:
// - Shopify analytics reports (like "Total sales breakdown") can attribute refunds by refund date.
//   This sync attributes refunds back to the original order day (created_at in store timezone).
// - Uses store IANA timezone for date bucketing and query windows so day keys match Shopify Admin.

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    storeUrl,
    accessToken,
    clientId,
    clientSecret,
    startDate,
    endDate,
    preview,
    test,
    syncType,
  } = req.body || {};

  if (!storeUrl) return res.status(400).json({ error: 'storeUrl is required' });

  const cleanStoreUrl = normalizeStoreUrl(storeUrl);
  const baseUrl = `https://${cleanStoreUrl}/admin/api/2025-07`;

  // Auth strategy:
  // 1) accessToken explicitly provided
  // 2) clientSecret used as access token (common in private/custom-app workflows)
  // 3) env fallback
  const token =
    (typeof accessToken === 'string' && accessToken.trim()) ||
    (typeof clientSecret === 'string' && clientSecret.trim()) ||
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

  if (!token) {
    return res.status(400).json({
      error:
        'Missing Shopify access token. Provide accessToken, or use clientSecret as token, or set SHOPIFY_ADMIN_ACCESS_TOKEN.',
    });
  }

  try {
    // Fetch shop info (timezone + name)
    const shopRes = await fetch(`${baseUrl}/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
    });

    if (!shopRes.ok) {
      const t = await shopRes.text();
      return res.status(shopRes.status).json({
        error: `Shopify API error (shop.json): ${shopRes.status} ${t.slice(0, 200)}`,
      });
    }

    const shopData = await shopRes.json();
    const shop = shopData.shop || {};
    const ianaTimeZone = shop.iana_timezone || shop.timezone || 'UTC';

    if (test) {
      return res.status(200).json({
        success: true,
        shopName: shop.name || cleanStoreUrl,
        email: shop.email,
        timezone: ianaTimeZone,
      });
    }

    if (syncType === 'products') {
      const products = await fetchAllProducts(baseUrl, token);
      return res.status(200).json({ success: true, syncType: 'products', products });
    }

    if (syncType === 'inventory') {
      const inventory = await fetchInventorySnapshot(baseUrl, token);
      return res.status(200).json({ success: true, syncType: 'inventory', ...inventory });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Missing date range' });
    }

    // Build store-local query window converted to UTC ISO strings
    const createdAtMin = zonedLocalDateTimeToUtcIso(ianaTimeZone, `${startDate}T00:00:00`);
    const createdAtMax = zonedLocalDateTimeToUtcIso(ianaTimeZone, `${endDate}T23:59:59`);

    const orders = await fetchAllOrders(baseUrl, token, createdAtMin, createdAtMax);

    const { dailyData, weeklyData, skuTotals, totals } = aggregateOrders({
      orders,
      ianaTimeZone,
    });

    // Build preview payload
    const skuData = Object.values(skuTotals)
      .sort((a, b) => (b.netSales || 0) - (a.netSales || 0))
      .slice(0, 250);

    const response = {
      success: true,
      shopName: shop.name || cleanStoreUrl,
      timezone: ianaTimeZone,
      dateRange: { startDate, endDate },
      orderCount: orders.length,
      totals,
      skuData,
      ...(preview ? {} : { dailyData, weeklyData }),
    };

    return res.status(200).json(response);
  } catch (err) {
    console.error('[shopify/sync] error:', err);
    return res.status(500).json({ error: err?.message || 'Shopify sync failed' });
  }
}

function normalizeStoreUrl(storeUrl) {
  let s = String(storeUrl || '').trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!s.includes('.myshopify.com')) {
    // If they entered "mystore" or "mystore.myshopify.com", normalize to *.myshopify.com
    s = s.replace('.myshopify.com', '') + '.myshopify.com';
  }
  return s;
}

// ---------- Timezone helpers ----------

function toStoreDateKey(ianaTimeZone, isoLike) {
  const d = new Date(isoLike);
  // Format as YYYY-MM-DD in the store timezone
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ianaTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find(p => p.type === 'year')?.value || '1970';
  const m = parts.find(p => p.type === 'month')?.value || '01';
  const day = parts.find(p => p.type === 'day')?.value || '01';
  return `${y}-${m}-${day}`;
}

function getWeekEndingStoreKey(dateKey) {
  // dateKey is YYYY-MM-DD (already store-local). Week ending is Sunday.
  const d = new Date(`${dateKey}T00:00:00`);
  const day = d.getDay();
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + daysUntilSunday);
  return d.toISOString().slice(0, 10);
}

function getTimeZoneOffsetMs(timeZone, date) {
  // Offset at "date" for the given zone, in milliseconds.
  // Technique: format the same instant in the target TZ and parse as UTC.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = dtf.formatToParts(date);
  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const asUtc = Date.parse(
    `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}Z`
  );
  return asUtc - date.getTime();
}

function zonedLocalDateTimeToUtcIso(timeZone, localIsoNoTz) {
  // localIsoNoTz example: "2026-01-23T00:00:00"
  const [datePart, timePart = '00:00:00'] = localIsoNoTz.split('T');
  const [y, m, d] = datePart.split('-').map(n => parseInt(n, 10));
  const [hh, mm, ss] = timePart.split(':').map(n => parseInt(n, 10));

  // Start with a UTC guess
  let guess = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  let offset = getTimeZoneOffsetMs(timeZone, guess);
  let utc = new Date(guess.getTime() - offset);

  // One more pass in case offset changes across DST boundary
  const offset2 = getTimeZoneOffsetMs(timeZone, utc);
  if (offset2 !== offset) {
    utc = new Date(guess.getTime() - offset2);
  }

  return utc.toISOString();
}

// ---------- Shopify fetchers ----------

async function fetchAllOrders(baseUrl, token, createdAtMinIso, createdAtMaxIso) {
  const orders = [];
  let pageInfo = null;
  let hasNext = true;

  while (hasNext) {
    const url = pageInfo
      ? `${baseUrl}/orders.json?limit=250&page_info=${encodeURIComponent(pageInfo)}`
      : `${baseUrl}/orders.json?limit=250&status=any&created_at_min=${encodeURIComponent(
          createdAtMinIso
        )}&created_at_max=${encodeURIComponent(createdAtMaxIso)}&fields=id,name,created_at,processed_at,financial_status,cancelled_at,total_price,current_total_price,total_discounts,total_tax,subtotal_price,total_shipping_price_set,shipping_lines,tax_lines,line_items,refunds`;

    const res = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Orders fetch failed: ${res.status} ${t.slice(0, 200)}`);
    }

    const data = await res.json();
    orders.push(...(data.orders || []));

    const linkHeader = res.headers.get('Link') || '';
    const nextMatch = linkHeader.match(/<[^>]*page_info=([^>&]+)[^>]*>;\s*rel="next"/);
    pageInfo = nextMatch ? nextMatch[1] : null;
    hasNext = !!pageInfo;

    if (orders.length > 20000) break; // safety
  }

  return orders;
}

async function fetchAllProducts(baseUrl, token) {
  const out = [];
  let pageInfo = null;
  let hasNext = true;

  while (hasNext) {
    const url = pageInfo
      ? `${baseUrl}/products.json?limit=250&page_info=${encodeURIComponent(pageInfo)}`
      : `${baseUrl}/products.json?limit=250&fields=id,title,handle,variants`;

    const res = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Products fetch failed: ${res.status} ${t.slice(0, 200)}`);
    }

    const data = await res.json();
    (data.products || []).forEach(p => {
      (p.variants || []).forEach(v => {
        if (!v?.sku) return;
        out.push({
          sku: v.sku,
          productTitle: p.title,
          variantTitle: v.title,
          price: safeNum(v.price),
          inventoryItemId: v.inventory_item_id,
          variantId: v.id,
          productId: p.id,
        });
      });
    });

    const linkHeader = res.headers.get('Link') || '';
    const nextMatch = linkHeader.match(/<[^>]*page_info=([^>&]+)[^>]*>;\s*rel="next"/);
    pageInfo = nextMatch ? nextMatch[1] : null;
    hasNext = !!pageInfo;

    if (out.length > 50000) break;
  }

  return out;
}

async function fetchInventorySnapshot(baseUrl, token) {
  // Lightweight inventory snapshot based on products endpoint (no per-location breakdown).
  // For detailed inventory by location, you'd also call /locations and /inventory_levels.
  const items = [];
  let pageInfo = null;
  let hasNext = true;

  while (hasNext) {
    const url = pageInfo
      ? `${baseUrl}/products.json?limit=250&page_info=${encodeURIComponent(pageInfo)}`
      : `${baseUrl}/products.json?limit=250&fields=id,title,variants`;

    const res = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Inventory fetch failed: ${res.status} ${t.slice(0, 200)}`);
    }

    const data = await res.json();
    (data.products || []).forEach(p => {
      (p.variants || []).forEach(v => {
        if (!v?.sku) return;
        items.push({
          sku: v.sku,
          name: `${p.title}${v.title && v.title !== 'Default Title' ? ` - ${v.title}` : ''}`,
          totalQty: safeNum(v.inventory_quantity),
          homeQty: safeNum(v.inventory_quantity),
          threeplQty: 0,
          cost: 0,
          totalValue: 0,
        });
      });
    });

    const linkHeader = res.headers.get('Link') || '';
    const nextMatch = linkHeader.match(/<[^>]*page_info=([^>&]+)[^>]*>;\s*rel="next"/);
    pageInfo = nextMatch ? nextMatch[1] : null;
    hasNext = !!pageInfo;

    if (items.length > 50000) break;
  }

  return {
    date: new Date().toISOString().slice(0, 10),
    source: 'shopify-inventory-basic',
    locations: [],
    summary: {
      skuCount: items.length,
      totalUnits: items.reduce((s, i) => s + (i.totalQty || 0), 0),
      totalValue: 0,
      note: 'Basic variant-level inventory (no location breakdown).',
    },
    items,
  };
}

// ---------- Aggregation ----------

function aggregateOrders({ orders, ianaTimeZone }) {
  const dailyData = {};
  const weeklyData = {};
  const skuTotals = {};

  const totals = {
    grossCollected: 0,
    orders: 0,
    units: 0,
    discounts: 0,
    tax: 0,
    shipping: 0,
    refunds: 0,
    netSales: 0, // variant-style net sales (sum of SKU netSales)
  };

  for (const order of orders || []) {
    if (!order?.created_at) continue;
    if (order.cancelled_at) continue;

    const orderDateKey = toStoreDateKey(ianaTimeZone, order.created_at);
    const weekKey = getWeekEndingStoreKey(orderDateKey);

    const orderGrossCollected = safeNum(order.current_total_price ?? order.total_price); // includes tax + shipping, net of discounts; may already include refunds
    const orderDiscount = safeNum(order.total_discounts);
    const orderTax = safeNum(order.total_tax);
    const orderShipping =
      safeNum(order.total_shipping_price_set?.shop_money?.amount) ||
      (Array.isArray(order.shipping_lines)
        ? order.shipping_lines.reduce((s, l) => s + safeNum(l.price), 0)
        : 0);

    // Refunds: best-effort (in case current_total_price is not net)
    const refundAmount = sumRefundTransactions(order);
    const grossCollectedNetRefunds =
      orderGrossCollected > 0 && refundAmount > 0 ? Math.max(0, orderGrossCollected - refundAmount) : orderGrossCollected;

    // Ensure buckets exist
    if (!dailyData[orderDateKey]) dailyData[orderDateKey] = blankDay();
    if (!weeklyData[weekKey]) weeklyData[weekKey] = blankWeek();

    // Dashboard metric: gross collected (matches Total sales breakdown "Total sales" more closely)
    dailyData[orderDateKey].shopify.revenue += grossCollectedNetRefunds;
    dailyData[orderDateKey].shopify.discounts += orderDiscount;
    dailyData[orderDateKey].shopify.orders += 1;
    dailyData[orderDateKey].shopify.taxTotal += orderTax;
    dailyData[orderDateKey].shopify.shippingTotal += orderShipping;
    dailyData[orderDateKey].total.revenue += grossCollectedNetRefunds;

    weeklyData[weekKey].shopify.revenue += grossCollectedNetRefunds;
    weeklyData[weekKey].shopify.discounts += orderDiscount;
    weeklyData[weekKey].shopify.orders += 1;
    weeklyData[weekKey].shopify.taxTotal += orderTax;
    weeklyData[weekKey].shopify.shippingTotal += orderShipping;
    weeklyData[weekKey].total.revenue += grossCollectedNetRefunds;

    totals.grossCollected += grossCollectedNetRefunds;
    totals.discounts += orderDiscount;
    totals.tax += orderTax;
    totals.shipping += orderShipping;
    totals.refunds += refundAmount;
    totals.orders += 1;

    // SKU net sales + units
    const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
    const refundDeltasByLineItemId = buildRefundLineItemDeltas(order);

    for (const li of lineItems) {
      const sku = (li?.sku || '').trim();
      if (!sku) continue;

      const qty = safeNum(li.quantity);
      if (qty <= 0) continue;

      // Net item sales exclude shipping; include item tax
      // Use line-level discounts where available
      const linePrice = safeNum(li.price) * qty;

      const lineDiscount = safeNum(li.total_discount) || sumDiscountAllocations(li);
      const lineTax = Array.isArray(li.tax_lines) ? li.tax_lines.reduce((s, t) => s + safeNum(t.price), 0) : 0;

      const refunded = refundDeltasByLineItemId[String(li.id)] || { qty: 0, subtotal: 0, tax: 0 };

      const netQty = Math.max(0, qty - safeNum(refunded.qty));
      // Subtotal after discounts, then subtract refunded subtotal, then add tax net of refunded tax
      const netSales = Math.max(
        0,
        (linePrice - lineDiscount) - safeNum(refunded.subtotal) + (lineTax - safeNum(refunded.tax))
      );

      // Update daily/weekly units based on netQty
      dailyData[orderDateKey].shopify.units += netQty;
      dailyData[orderDateKey].total.units += netQty;

      weeklyData[weekKey].shopify.units += netQty;
      weeklyData[weekKey].total.units += netQty;

      totals.units += netQty;
      totals.netSales += netSales;

      if (!skuTotals[sku]) {
        skuTotals[sku] = { sku, unitsSold: 0, netSales: 0, discounts: 0, tax: 0 };
      }
      skuTotals[sku].unitsSold += netQty;
      skuTotals[sku].netSales += netSales;
      skuTotals[sku].discounts += lineDiscount;
      skuTotals[sku].tax += lineTax;

      // Also attach to per-day skuData map (for UI drilldown)
      addSkuToBucket(dailyData[orderDateKey].shopify.skuData, sku, netQty, netSales, lineDiscount, lineTax);
      addSkuToBucket(weeklyData[weekKey].shopify.skuData, sku, netQty, netSales, lineDiscount, lineTax);
    }
  }

  // Derived metrics
  totals.aov = totals.orders > 0 ? totals.grossCollected / totals.orders : 0;

  return { dailyData, weeklyData, skuTotals, totals };
}

function blankDay() {
  return {
    shopify: {
      revenue: 0,
      units: 0,
      discounts: 0,
      orders: 0,
      skuData: {},
      taxTotal: 0,
      shippingTotal: 0,
    },
    total: { revenue: 0, units: 0, orders: 0, cogs: 0, netProfit: 0 },
  };
}

function blankWeek() {
  return {
    shopify: {
      revenue: 0,
      units: 0,
      discounts: 0,
      orders: 0,
      skuData: {},
      taxTotal: 0,
      shippingTotal: 0,
    },
    total: { revenue: 0, units: 0, orders: 0, cogs: 0, netProfit: 0 },
  };
}

function safeNum(v) {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sumDiscountAllocations(li) {
  const allocs = Array.isArray(li.discount_allocations) ? li.discount_allocations : [];
  return allocs.reduce((s, a) => s + safeNum(a.amount), 0);
}

function sumRefundTransactions(order) {
  const refunds = Array.isArray(order.refunds) ? order.refunds : [];
  let total = 0;
  for (const r of refunds) {
    const tx = Array.isArray(r.transactions) ? r.transactions : [];
    for (const t of tx) {
      const kind = (t.kind || '').toLowerCase();
      const status = (t.status || '').toLowerCase();
      if (kind === 'refund' && (status === 'success' || status === 'pending' || !status)) {
        total += safeNum(t.amount);
      }
    }
  }
  return total;
}

function buildRefundLineItemDeltas(order) {
  // Map line_item_id -> { qty, subtotal, tax }
  const out = {};
  const refunds = Array.isArray(order.refunds) ? order.refunds : [];
  for (const r of refunds) {
    const rlis = Array.isArray(r.refund_line_items) ? r.refund_line_items : [];
    for (const x of rlis) {
      const liId = x.line_item_id || x.line_item?.id;
      if (!liId) continue;
      const key = String(liId);
      if (!out[key]) out[key] = { qty: 0, subtotal: 0, tax: 0 };
      out[key].qty += safeNum(x.quantity);
      out[key].subtotal += safeNum(x.subtotal);
      out[key].tax += safeNum(x.total_tax);
    }
  }
  return out;
}

function addSkuToBucket(bucketObj, sku, units, netSales, discounts, tax) {
  if (!bucketObj[sku]) {
    bucketObj[sku] = { sku, unitsSold: 0, netSales: 0, discounts: 0, tax: 0 };
  }
  bucketObj[sku].unitsSold += units;
  bucketObj[sku].netSales += netSales;
  bucketObj[sku].discounts += discounts;
  bucketObj[sku].tax += tax;
}
