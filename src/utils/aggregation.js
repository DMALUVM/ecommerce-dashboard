// Data aggregation utilities

export const getMonths = (allWeeksData) => {
  const m = new Set();
  Object.keys(allWeeksData).forEach(w => {
    const d = new Date(w + 'T00:00:00');
    m.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  });
  return Array.from(m).sort().reverse();
};

export const getYears = (allWeeksData) => {
  const y = new Set();
  Object.keys(allWeeksData).forEach(w => {
    y.add(new Date(w + 'T00:00:00').getFullYear());
  });
  return Array.from(y).sort().reverse();
};

export const getMonthlyData = (ym, allWeeksData, threeplLedger, get3PLForWeek) => {
  const [y, m] = ym.split('-').map(Number);
  const weeks = Object.entries(allWeeksData).filter(([w]) => {
    const d = new Date(w + 'T00:00:00');
    return d.getFullYear() === y && d.getMonth() + 1 === m;
  });
  if (!weeks.length) return null;

  const agg = {
    weeks: weeks.map(([w]) => w),
    amazon: { revenue: 0, units: 0, returns: 0, cogs: 0, fees: 0, adSpend: 0, netProfit: 0 },
    shopify: { revenue: 0, units: 0, cogs: 0, threeplCosts: 0, adSpend: 0, metaSpend: 0, googleSpend: 0, discounts: 0, netProfit: 0, threeplBreakdown: { storage: 0, shipping: 0, pickFees: 0, boxCharges: 0, receiving: 0, other: 0 }, threeplMetrics: { orderCount: 0, totalUnits: 0 } },
    total: { revenue: 0, units: 0, cogs: 0, adSpend: 0, netProfit: 0 }
  };

  weeks.forEach(([w, d]) => {
    const ledger3PL = get3PLForWeek(threeplLedger, w);
    const weekThreeplCost = ledger3PL?.metrics?.totalCost || d.shopify?.threeplCosts || 0;
    const weekThreeplBreakdown = ledger3PL?.breakdown || d.shopify?.threeplBreakdown || {};
    const weekThreeplMetrics = ledger3PL?.metrics || d.shopify?.threeplMetrics || {};

    agg.amazon.revenue += d.amazon?.revenue || 0;
    agg.amazon.units += d.amazon?.units || 0;
    agg.amazon.returns += d.amazon?.returns || 0;
    agg.amazon.cogs += d.amazon?.cogs || 0;
    agg.amazon.fees += d.amazon?.fees || 0;
    agg.amazon.adSpend += d.amazon?.adSpend || 0;
    agg.amazon.netProfit += d.amazon?.netProfit || 0;
    agg.shopify.revenue += d.shopify?.revenue || 0;
    agg.shopify.units += d.shopify?.units || 0;
    agg.shopify.cogs += d.shopify?.cogs || 0;
    agg.shopify.threeplCosts += weekThreeplCost;
    agg.shopify.adSpend += d.shopify?.adSpend || 0;
    agg.shopify.metaSpend += d.shopify?.metaSpend || 0;
    agg.shopify.googleSpend += d.shopify?.googleSpend || 0;
    agg.shopify.discounts += d.shopify?.discounts || 0;
    const shopProfit = (d.shopify?.revenue || 0) - (d.shopify?.cogs || 0) - weekThreeplCost - (d.shopify?.adSpend || 0);
    agg.shopify.netProfit += shopProfit;
    agg.shopify.threeplBreakdown.storage += weekThreeplBreakdown.storage || 0;
    agg.shopify.threeplBreakdown.shipping += weekThreeplBreakdown.shipping || 0;
    agg.shopify.threeplBreakdown.pickFees += weekThreeplBreakdown.pickFees || 0;
    agg.shopify.threeplBreakdown.boxCharges += weekThreeplBreakdown.boxCharges || 0;
    agg.shopify.threeplBreakdown.receiving += weekThreeplBreakdown.receiving || 0;
    agg.shopify.threeplBreakdown.other += weekThreeplBreakdown.other || 0;
    agg.shopify.threeplMetrics.orderCount += weekThreeplMetrics.orderCount || 0;
    agg.shopify.threeplMetrics.totalUnits += weekThreeplMetrics.totalUnits || 0;
    agg.total.revenue += d.total?.revenue || 0;
    agg.total.units += d.total?.units || 0;
    agg.total.cogs += d.total?.cogs || 0;
    agg.total.adSpend += d.total?.adSpend || 0;
    agg.total.netProfit += (d.amazon?.netProfit || 0) + shopProfit;
  });

  agg.shopify.threeplMetrics.avgCostPerOrder = agg.shopify.threeplMetrics.orderCount > 0 ? (agg.shopify.threeplCosts - agg.shopify.threeplBreakdown.storage) / agg.shopify.threeplMetrics.orderCount : 0;
  agg.shopify.threeplMetrics.avgUnitsPerOrder = agg.shopify.threeplMetrics.orderCount > 0 ? agg.shopify.threeplMetrics.totalUnits / agg.shopify.threeplMetrics.orderCount : 0;
  agg.amazon.margin = agg.amazon.revenue > 0 ? (agg.amazon.netProfit / agg.amazon.revenue) * 100 : 0;
  agg.amazon.aov = agg.amazon.units > 0 ? agg.amazon.revenue / agg.amazon.units : 0;
  agg.amazon.roas = agg.amazon.adSpend > 0 ? agg.amazon.revenue / agg.amazon.adSpend : 0;
  agg.amazon.returnRate = agg.amazon.units > 0 ? (agg.amazon.returns / agg.amazon.units) * 100 : 0;
  agg.shopify.netMargin = agg.shopify.revenue > 0 ? (agg.shopify.netProfit / agg.shopify.revenue) * 100 : 0;
  agg.shopify.aov = agg.shopify.units > 0 ? agg.shopify.revenue / agg.shopify.units : 0;
  agg.shopify.roas = agg.shopify.adSpend > 0 ? agg.shopify.revenue / agg.shopify.adSpend : 0;
  agg.total.netMargin = agg.total.revenue > 0 ? (agg.total.netProfit / agg.total.revenue) * 100 : 0;
  agg.total.amazonShare = agg.total.revenue > 0 ? (agg.amazon.revenue / agg.total.revenue) * 100 : 0;
  agg.total.shopifyShare = agg.total.revenue > 0 ? (agg.shopify.revenue / agg.total.revenue) * 100 : 0;
  return agg;
};

export const getYearlyData = (year, allWeeksData, threeplLedger, get3PLForWeek) => {
  const weeks = Object.entries(allWeeksData).filter(([w]) => new Date(w + 'T00:00:00').getFullYear() === year);
  if (!weeks.length) return null;

  const agg = {
    weeks: weeks.map(([w]) => w),
    amazon: { revenue: 0, units: 0, returns: 0, cogs: 0, fees: 0, adSpend: 0, netProfit: 0 },
    shopify: { revenue: 0, units: 0, cogs: 0, threeplCosts: 0, adSpend: 0, metaSpend: 0, googleSpend: 0, discounts: 0, netProfit: 0, threeplBreakdown: { storage: 0, shipping: 0, pickFees: 0, boxCharges: 0, receiving: 0, other: 0 }, threeplMetrics: { orderCount: 0, totalUnits: 0 } },
    total: { revenue: 0, units: 0, cogs: 0, adSpend: 0, netProfit: 0 },
    monthlyBreakdown: {}
  };

  weeks.forEach(([w, d]) => {
    const dt = new Date(w + 'T00:00:00');
    const mk = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    if (!agg.monthlyBreakdown[mk]) agg.monthlyBreakdown[mk] = { revenue: 0, netProfit: 0 };
    const ledger3PL = get3PLForWeek(threeplLedger, w);
    const weekThreeplCost = ledger3PL?.metrics?.totalCost || d.shopify?.threeplCosts || 0;
    const weekThreeplBreakdown = ledger3PL?.breakdown || d.shopify?.threeplBreakdown || {};
    const weekThreeplMetrics = ledger3PL?.metrics || d.shopify?.threeplMetrics || {};

    agg.amazon.revenue += d.amazon?.revenue || 0;
    agg.amazon.units += d.amazon?.units || 0;
    agg.amazon.returns += d.amazon?.returns || 0;
    agg.amazon.cogs += d.amazon?.cogs || 0;
    agg.amazon.fees += d.amazon?.fees || 0;
    agg.amazon.adSpend += d.amazon?.adSpend || 0;
    agg.amazon.netProfit += d.amazon?.netProfit || 0;
    agg.shopify.revenue += d.shopify?.revenue || 0;
    agg.shopify.units += d.shopify?.units || 0;
    agg.shopify.cogs += d.shopify?.cogs || 0;
    agg.shopify.threeplCosts += weekThreeplCost;
    agg.shopify.adSpend += d.shopify?.adSpend || 0;
    agg.shopify.metaSpend += d.shopify?.metaSpend || 0;
    agg.shopify.googleSpend += d.shopify?.googleSpend || 0;
    agg.shopify.discounts += d.shopify?.discounts || 0;
    const shopProfit = (d.shopify?.revenue || 0) - (d.shopify?.cogs || 0) - weekThreeplCost - (d.shopify?.adSpend || 0);
    agg.shopify.netProfit += shopProfit;
    agg.shopify.threeplBreakdown.storage += weekThreeplBreakdown.storage || 0;
    agg.shopify.threeplBreakdown.shipping += weekThreeplBreakdown.shipping || 0;
    agg.shopify.threeplBreakdown.pickFees += weekThreeplBreakdown.pickFees || 0;
    agg.shopify.threeplBreakdown.boxCharges += weekThreeplBreakdown.boxCharges || 0;
    agg.shopify.threeplBreakdown.receiving += weekThreeplBreakdown.receiving || 0;
    agg.shopify.threeplBreakdown.other += weekThreeplBreakdown.other || 0;
    agg.shopify.threeplMetrics.orderCount += weekThreeplMetrics.orderCount || 0;
    agg.shopify.threeplMetrics.totalUnits += weekThreeplMetrics.totalUnits || 0;
    agg.total.revenue += d.total?.revenue || 0;
    agg.total.units += d.total?.units || 0;
    agg.total.cogs += d.total?.cogs || 0;
    agg.total.adSpend += d.total?.adSpend || 0;
    agg.total.netProfit += (d.amazon?.netProfit || 0) + shopProfit;
    agg.monthlyBreakdown[mk].revenue += d.total?.revenue || 0;
    agg.monthlyBreakdown[mk].netProfit += (d.amazon?.netProfit || 0) + shopProfit;
  });

  agg.shopify.threeplMetrics.avgCostPerOrder = agg.shopify.threeplMetrics.orderCount > 0 ? (agg.shopify.threeplCosts - agg.shopify.threeplBreakdown.storage) / agg.shopify.threeplMetrics.orderCount : 0;
  agg.shopify.threeplMetrics.avgUnitsPerOrder = agg.shopify.threeplMetrics.orderCount > 0 ? agg.shopify.threeplMetrics.totalUnits / agg.shopify.threeplMetrics.orderCount : 0;
  agg.amazon.margin = agg.amazon.revenue > 0 ? (agg.amazon.netProfit / agg.amazon.revenue) * 100 : 0;
  agg.amazon.aov = agg.amazon.units > 0 ? agg.amazon.revenue / agg.amazon.units : 0;
  agg.amazon.roas = agg.amazon.adSpend > 0 ? agg.amazon.revenue / agg.amazon.adSpend : 0;
  agg.amazon.returnRate = agg.amazon.units > 0 ? (agg.amazon.returns / agg.amazon.units) * 100 : 0;
  agg.shopify.netMargin = agg.shopify.revenue > 0 ? (agg.shopify.netProfit / agg.shopify.revenue) * 100 : 0;
  agg.shopify.aov = agg.shopify.units > 0 ? agg.shopify.revenue / agg.shopify.units : 0;
  agg.shopify.roas = agg.shopify.adSpend > 0 ? agg.shopify.revenue / agg.shopify.adSpend : 0;
  agg.total.netMargin = agg.total.revenue > 0 ? (agg.total.netProfit / agg.total.revenue) * 100 : 0;
  agg.total.amazonShare = agg.total.revenue > 0 ? (agg.amazon.revenue / agg.total.revenue) * 100 : 0;
  agg.total.shopifyShare = agg.total.revenue > 0 ? (agg.shopify.revenue / agg.total.revenue) * 100 : 0;
  return agg;
};
