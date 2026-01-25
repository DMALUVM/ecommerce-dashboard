// Weekly aggregation helpers
// Goal: allow Weekly view to be driven by either stored weekly rollups OR derived-from-daily data,
// and ensure Amazon SKU rows reconcile to header totals.

const num = (v) => (v === null || v === undefined || isNaN(v) ? 0 : Number(v));

const weekEndingSunday = (dateKey) => {
  // dateKey: YYYY-MM-DD
  const d = new Date(dateKey + 'T12:00:00');
  const day = d.getDay(); // 0=Sun
  const end = new Date(d);
  end.setDate(d.getDate() + (day === 0 ? 0 : 7 - day));
  const yyyy = end.getFullYear();
  const mm = String(end.getMonth() + 1).padStart(2, '0');
  const dd = String(end.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const sumSkuField = (arr, field) => arr.reduce((s, r) => s + num(r?.[field]), 0);

const reconcileAmazonSkus = (amazon, skuData) => {
  const out = Array.isArray(skuData) ? skuData.map(s => ({ ...s })) : [];
  const targetRev = num(amazon?.revenue);
  const targetUnits = num(amazon?.units);
  const targetProfit = num(amazon?.netProfit ?? amazon?.netProceeds);

  const sumRev = sumSkuField(out, 'netSales');
  const sumUnits = sumSkuField(out, 'unitsSold');
  const sumProfit = sumSkuField(out, 'netProceeds');

  // If SKU sums are wildly off (common when an old build attached the wrong skuData array),
  // don't try to "scale" from zero. Just return as-is and let the UI show a warning.
  if (out.length === 0) return out;

  // Scale revenue/proceeds if they differ materially, but keep per-unit fields intact.
  const shouldScaleRev = targetRev > 0 && sumRev > 0 && Math.abs(sumRev - targetRev) / targetRev > 0.01;
  const shouldScaleProfit = targetProfit > 0 && sumProfit > 0 && Math.abs(sumProfit - targetProfit) / targetProfit > 0.01;

  const revScale = shouldScaleRev ? (targetRev / sumRev) : 1;
  const profitScale = shouldScaleProfit ? (targetProfit / sumProfit) : 1;

  // Units mismatch usually means skuData is not aggregated correctly. Scale only if both are present.
  const shouldScaleUnits = targetUnits > 0 && sumUnits > 0 && Math.abs(sumUnits - targetUnits) / targetUnits > 0.01;
  const unitScale = shouldScaleUnits ? (targetUnits / sumUnits) : 1;

  return out.map(s => {
    const unitsSold = num(s.unitsSold) * unitScale;
    return {
      ...s,
      unitsSold,
      returns: num(s.returns), // keep
      netSales: num(s.netSales) * revScale,
      netProceeds: num(s.netProceeds) * profitScale,
      adSpend: num(s.adSpend),
      cogs: num(s.cogs),
      // Preserve explicit per-unit values if present
      netProceedsPerUnit: s.netProceedsPerUnit,
    };
  });
};

export const deriveWeeksFromDays = (allDaysData = {}) => {
  const keys = Object.keys(allDaysData || {}).sort();
  const weeks = {};

  for (const dayKey of keys) {
    const day = allDaysData[dayKey];
    if (!day) continue;

    // include if any channel has revenue OR ads present (week-in-progress should still show)
    const hasAny =
      num(day?.amazon?.revenue) > 0 ||
      num(day?.shopify?.revenue) > 0 ||
      num(day?.metaSpend ?? day?.shopify?.metaSpend) > 0 ||
      num(day?.googleSpend ?? day?.shopify?.googleSpend) > 0;

    if (!hasAny) continue;

    const wk = weekEndingSunday(dayKey);

    if (!weeks[wk]) {
      weeks[wk] = {
        weekEnding: wk,
        days: [],
        meta: { isInProgress: true, daysPresent: 0 },
        amazon: { revenue: 0, units: 0, returns: 0, cogs: 0, fees: 0, adSpend: 0, netProfit: 0, skuData: [] },
        shopify: { revenue: 0, units: 0, cogs: 0, adSpend: 0, metaSpend: 0, googleSpend: 0, discounts: 0, netProfit: 0, skuData: [], adsMetrics: { metaImpressions: 0, metaClicks: 0, metaPurchases: 0, metaPurchaseValue: 0, metaCTR: 0, metaCPC: 0, metaCPM: 0, metaROAS: 0, googleImpressions: 0, googleClicks: 0, googleConversions: 0, googleCTR: 0, googleCPC: 0, googleCostPerConv: 0 } },
        total: { revenue: 0, units: 0, cogs: 0, adSpend: 0, netProfit: 0, netMargin: 0, roas: 0, amazonShare: 0, shopifyShare: 0 },
      };
    }

    const w = weeks[wk];
    w.days.push(dayKey);
    w.meta.daysPresent += 1;

    // Amazon
    if (day.amazon) {
      w.amazon.revenue += num(day.amazon.revenue);
      w.amazon.units += num(day.amazon.units);
      w.amazon.returns += num(day.amazon.returns);
      w.amazon.cogs += num(day.amazon.cogs);
      w.amazon.fees += num(day.amazon.fees);
      w.amazon.adSpend += num(day.amazon.adSpend);
      w.amazon.netProfit += num(day.amazon.netProfit ?? day.amazon.netProceeds);

      // SKU aggregation
      const skuArr = Array.isArray(day.amazon.skuData) ? day.amazon.skuData : [];
      // Use map for accumulation
      if (!w.amazon._skuMap) w.amazon._skuMap = {};
      for (const s of skuArr) {
        const sku = (s?.sku || '').trim();
        if (!sku) continue;
        if (!w.amazon._skuMap[sku]) {
          w.amazon._skuMap[sku] = {
            sku,
            name: s?.name || sku,
            unitsSold: 0,
            returns: 0,
            netSales: 0,
            netProceeds: 0,
            adSpend: 0,
            cogs: 0,
            netProceedsPerUnit: s?.netProceedsPerUnit,
          };
        }
        const t = w.amazon._skuMap[sku];
        t.unitsSold += num(s.unitsSold);
        t.returns += num(s.returns);
        t.netSales += num(s.netSales);
        t.netProceeds += num(s.netProceeds);
        t.adSpend += num(s.adSpend);
        t.cogs += num(s.cogs);
        if (t.netProceedsPerUnit === undefined || t.netProceedsPerUnit === null) {
          t.netProceedsPerUnit = s?.netProceedsPerUnit;
        }
      }
    }

    // Shopify
    if (day.shopify) {
      w.shopify.revenue += num(day.shopify.revenue);
      w.shopify.units += num(day.shopify.units);
      w.shopify.cogs += num(day.shopify.cogs);
      w.shopify.discounts += num(day.shopify.discounts);
      const meta = num(day.metaSpend ?? day.shopify.metaSpend);
      const google = num(day.googleSpend ?? day.shopify.googleSpend);
      w.shopify.metaSpend += meta;
      w.shopify.googleSpend += google;
      w.shopify.adSpend += num(day.shopify.adSpend ?? (meta + google));
      w.shopify.netProfit += num(day.shopify.netProfit);
// Ads KPI metrics (supports nested shopify.adsMetrics or flat root fields from bulk imports)
const dm = day.shopify.adsMetrics || {};
const metaImpr = num(dm.metaImpressions ?? day.metaImpressions);
const metaClicks = num(dm.metaClicks ?? day.metaClicks);
const metaPurch = num(dm.metaPurchases ?? day.metaPurchases ?? day.metaConversions);
const metaValue = num(dm.metaPurchaseValue ?? day.metaPurchaseValue);
const googleImpr = num(dm.googleImpressions ?? day.googleImpressions);
const googleClicks = num(dm.googleClicks ?? day.googleClicks);
const googleConv = num(dm.googleConversions ?? day.googleConversions);

if (!w.shopify.adsMetrics) {
  w.shopify.adsMetrics = { metaImpressions: 0, metaClicks: 0, metaPurchases: 0, metaPurchaseValue: 0, metaCTR: 0, metaCPC: 0, metaCPM: 0, metaROAS: 0, googleImpressions: 0, googleClicks: 0, googleConversions: 0, googleCTR: 0, googleCPC: 0, googleCostPerConv: 0 };
}
w.shopify.adsMetrics.metaImpressions += metaImpr;
w.shopify.adsMetrics.metaClicks += metaClicks;
w.shopify.adsMetrics.metaPurchases += metaPurch;
w.shopify.adsMetrics.metaPurchaseValue += metaValue;
w.shopify.adsMetrics.googleImpressions += googleImpr;
w.shopify.adsMetrics.googleClicks += googleClicks;
w.shopify.adsMetrics.googleConversions += googleConv;

      if (!w.shopify._skuMap) w.shopify._skuMap = {};
      const skuArr = Array.isArray(day.shopify.skuData) ? day.shopify.skuData : [];
      for (const s of skuArr) {
        const sku = (s?.sku || '').trim();
        if (!sku) continue;
        if (!w.shopify._skuMap[sku]) {
          w.shopify._skuMap[sku] = { sku, name: s?.name || sku, unitsSold: 0, netSales: 0, discounts: 0, cogs: 0 };
        }
        const t = w.shopify._skuMap[sku];
        t.unitsSold += num(s.unitsSold);
        t.netSales += num(s.netSales);
        t.discounts += num(s.discounts);
        t.cogs += num(s.cogs);
      }
    }
  }

  // Finalize: convert sku maps, compute totals, shares, mark in-progress
  Object.values(weeks).forEach(w => {
    // in-progress if not all 7 days present
    w.meta.isInProgress = (w.days.length < 7);

    if (w.amazon._skuMap) {
      w.amazon.skuData = Object.values(w.amazon._skuMap).sort((a, b) => num(b.netSales) - num(a.netSales));
      delete w.amazon._skuMap;
      // reconcile to header totals so the table adds up to the card
      w.amazon.skuData = reconcileAmazonSkus(w.amazon, w.amazon.skuData);
    } else {
      w.amazon.skuData = [];
    }

    if (w.shopify._skuMap) {
      w.shopify.skuData = Object.values(w.shopify._skuMap).sort((a, b) => num(b.netSales) - num(a.netSales));
      delete w.shopify._skuMap;
    } else {
      w.shopify.skuData = [];
    }

// Derive weekly ad KPIs from accumulated totals (prefer weighted / ratio-based metrics)
if (w.shopify.adsMetrics) {
  const am = w.shopify.adsMetrics;
  const metaSpend = num(w.shopify.metaSpend);
  const googleSpend = num(w.shopify.googleSpend);

  am.metaCTR = am.metaImpressions > 0 ? (am.metaClicks / am.metaImpressions) * 100 : 0;
  am.metaCPC = am.metaClicks > 0 ? (metaSpend / am.metaClicks) : 0;
  am.metaCPM = am.metaImpressions > 0 ? (metaSpend / am.metaImpressions) * 1000 : 0;
  am.metaROAS = metaSpend > 0 ? (am.metaPurchaseValue / metaSpend) : 0;

  am.googleCTR = am.googleImpressions > 0 ? (am.googleClicks / am.googleImpressions) * 100 : 0;
  am.googleCPC = am.googleClicks > 0 ? (googleSpend / am.googleClicks) : 0;
  am.googleCostPerConv = am.googleConversions > 0 ? (googleSpend / am.googleConversions) : 0;
}

    const totalRevenue = num(w.amazon.revenue) + num(w.shopify.revenue);
    const totalUnits = num(w.amazon.units) + num(w.shopify.units);
    const totalCogs = num(w.amazon.cogs) + num(w.shopify.cogs);
    const totalAdSpend = num(w.amazon.adSpend) + num(w.shopify.adSpend);
    const totalNetProfit = num(w.amazon.netProfit) + num(w.shopify.netProfit);

    w.total = {
      revenue: totalRevenue,
      units: totalUnits,
      cogs: totalCogs,
      adSpend: totalAdSpend,
      netProfit: totalNetProfit,
      netMargin: totalRevenue > 0 ? (totalNetProfit / totalRevenue) * 100 : 0,
      roas: totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0,
      amazonShare: totalRevenue > 0 ? (num(w.amazon.revenue) / totalRevenue) * 100 : 0,
      shopifyShare: totalRevenue > 0 ? (num(w.shopify.revenue) / totalRevenue) * 100 : 0,
    };
  });

  return weeks;
};

export const mergeWeekData = (storedWeek, derivedWeek) => {
  if (!storedWeek && !derivedWeek) return null;

  const base = storedWeek || derivedWeek;
  const wk = base.weekEnding || base.week_end || base.week || base.weekKey || derivedWeek?.weekEnding;

  const mergedAmazon = {
    ...(storedWeek?.amazon || {}),
    ...(derivedWeek?.amazon || {}),
  };
  const mergedShopify = {
    ...(storedWeek?.shopify || {}),
    ...(derivedWeek?.shopify || {}),
  };

// Merge Shopify adsMetrics (weekly KPIs). Prefer derived if it contains any non-zero signals.
const storedAds = storedWeek?.shopify?.adsMetrics || {};
const derivedAds = derivedWeek?.shopify?.adsMetrics || {};
const hasAdsSignals = (m) => {
  const n = (v) => (v === null || v === undefined || isNaN(v) ? 0 : Number(v));
  return (
    n(m.metaImpressions) > 0 ||
    n(m.googleImpressions) > 0 ||
    n(m.metaClicks) > 0 ||
    n(m.googleClicks) > 0 ||
    n(m.metaPurchases) > 0 ||
    n(m.googleConversions) > 0 ||
    n(m.metaPurchaseValue) > 0
  );
};
mergedShopify.adsMetrics = hasAdsSignals(derivedAds)
  ? { ...storedAds, ...derivedAds }
  : { ...derivedAds, ...storedAds };


  // Prefer derived skuData if available (it reconciles to header totals)
  mergedAmazon.skuData = (derivedWeek?.amazon?.skuData?.length ? derivedWeek.amazon.skuData : (storedWeek?.amazon?.skuData || []));
  mergedShopify.skuData = (derivedWeek?.shopify?.skuData?.length ? derivedWeek.shopify.skuData : (storedWeek?.shopify?.skuData || []));

  // Recompute totals from channels (critical for older stored weeks)
  const totalRevenue = num(mergedAmazon.revenue) + num(mergedShopify.revenue);
  const totalUnits = num(mergedAmazon.units) + num(mergedShopify.units);
  const totalCogs = num(mergedAmazon.cogs) + num(mergedShopify.cogs);
  const totalAdSpend = num(mergedAmazon.adSpend) + num(mergedShopify.adSpend);
  const totalNetProfit = num(mergedAmazon.netProfit ?? mergedAmazon.netProceeds) + num(mergedShopify.netProfit);

  const total = {
    revenue: totalRevenue,
    units: totalUnits,
    cogs: totalCogs,
    adSpend: totalAdSpend,
    netProfit: totalNetProfit,
    netMargin: totalRevenue > 0 ? (totalNetProfit / totalRevenue) * 100 : 0,
    roas: totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0,
    amazonShare: totalRevenue > 0 ? (num(mergedAmazon.revenue) / totalRevenue) * 100 : 0,
    shopifyShare: totalRevenue > 0 ? (num(mergedShopify.revenue) / totalRevenue) * 100 : 0,
  };

  return {
    ...base,
    weekEnding: wk || base.weekEnding,
    amazon: mergedAmazon,
    shopify: mergedShopify,
    total,
    meta: {
      ...(storedWeek?.meta || {}),
      ...(derivedWeek?.meta || {}),
    },
    days: derivedWeek?.days || storedWeek?.days || [],
  };
};
