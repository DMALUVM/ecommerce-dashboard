// Shopify Ads helpers (used across Daily / Weekly / Period / Ads / Trends)
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const getShopifyAdsForDay = (dayRecord) => {
  const day = dayRecord || {};
  const shopify = day.shopify || {};
  const dm = shopify.adsMetrics || {};

  const metaSpend = num(shopify.metaSpend ?? day.metaSpend ?? day.metaAds);
  const googleSpend = num(shopify.googleSpend ?? day.googleSpend ?? day.googleAds);

  const metaImpressions = num(dm.metaImpressions ?? day.metaImpressions);
  const metaClicks = num(dm.metaClicks ?? day.metaClicks);
  const metaPurchases = num(dm.metaPurchases ?? day.metaPurchases ?? day.metaConversions ?? day.metaConversionCount);
  const metaPurchaseValue = num(dm.metaPurchaseValue ?? day.metaPurchaseValue);

  const googleImpressions = num(dm.googleImpressions ?? day.googleImpressions);
  const googleClicks = num(dm.googleClicks ?? day.googleClicks);
  const googleConversions = num(dm.googleConversions ?? day.googleConversions ?? day.googleConv);

  // Prefer stored KPIs if provided; otherwise derive from totals for consistency
  const metaCTR = metaImpressions > 0 ? (metaClicks / metaImpressions) * 100 : num(dm.metaCTR ?? day.metaCtr);
  const metaCPC = metaClicks > 0 ? (metaSpend / metaClicks) : num(dm.metaCPC ?? day.metaCpc);
  const metaCPM = metaImpressions > 0 ? (metaSpend / metaImpressions) * 1000 : num(dm.metaCPM ?? day.metaCpm);
  const metaROAS = metaSpend > 0 ? (metaPurchaseValue / metaSpend) : num(dm.metaROAS ?? day.metaRoas);

  const googleCTR = googleImpressions > 0 ? (googleClicks / googleImpressions) * 100 : num(dm.googleCTR ?? day.googleCtr);
  const googleCPC = googleClicks > 0 ? (googleSpend / googleClicks) : num(dm.googleCPC ?? day.googleCpc);
  const googleCostPerConv = googleConversions > 0 ? (googleSpend / googleConversions) : num(dm.googleCostPerConv ?? day.googleCpa);

  return {
    metaSpend,
    googleSpend,
    metaImpressions,
    metaClicks,
    metaPurchases,
    metaPurchaseValue,
    metaCTR,
    metaCPC,
    metaCPM,
    metaROAS,
    googleImpressions,
    googleClicks,
    googleConversions,
    googleCTR,
    googleCPC,
    googleCostPerConv,
  };
};

export const hasShopifyAdsSignals = (ads) => {
  const a = ads || {};
  return (
    num(a.metaSpend) > 0 ||
    num(a.googleSpend) > 0 ||
    num(a.metaImpressions) > 0 ||
    num(a.googleImpressions) > 0 ||
    num(a.metaClicks) > 0 ||
    num(a.googleClicks) > 0 ||
    num(a.metaPurchases) > 0 ||
    num(a.googleConversions) > 0
  );
};

export const aggregateShopifyAdsForDays = (dayRecords) => {
  const days = Array.isArray(dayRecords) ? dayRecords : [];
  const totals = {
    metaSpend: 0,
    googleSpend: 0,
    metaImpressions: 0,
    metaClicks: 0,
    metaPurchases: 0,
    metaPurchaseValue: 0,
    googleImpressions: 0,
    googleClicks: 0,
    googleConversions: 0,
  };

  days.forEach((d) => {
    const a = getShopifyAdsForDay(d);
    totals.metaSpend += num(a.metaSpend);
    totals.googleSpend += num(a.googleSpend);
    totals.metaImpressions += num(a.metaImpressions);
    totals.metaClicks += num(a.metaClicks);
    totals.metaPurchases += num(a.metaPurchases);
    totals.metaPurchaseValue += num(a.metaPurchaseValue);
    totals.googleImpressions += num(a.googleImpressions);
    totals.googleClicks += num(a.googleClicks);
    totals.googleConversions += num(a.googleConversions);
  });

  // Derive KPIs
  const metaCTR = totals.metaImpressions > 0 ? (totals.metaClicks / totals.metaImpressions) * 100 : 0;
  const metaCPC = totals.metaClicks > 0 ? (totals.metaSpend / totals.metaClicks) : 0;
  const metaCPM = totals.metaImpressions > 0 ? (totals.metaSpend / totals.metaImpressions) * 1000 : 0;
  const metaROAS = totals.metaSpend > 0 ? (totals.metaPurchaseValue / totals.metaSpend) : 0;

  const googleCTR = totals.googleImpressions > 0 ? (totals.googleClicks / totals.googleImpressions) * 100 : 0;
  const googleCPC = totals.googleClicks > 0 ? (totals.googleSpend / totals.googleClicks) : 0;
  const googleCostPerConv = totals.googleConversions > 0 ? (totals.googleSpend / totals.googleConversions) : 0;

  return {
    ...totals,
    metaCTR,
    metaCPC,
    metaCPM,
    metaROAS,
    googleCTR,
    googleCPC,
    googleCostPerConv,
  };
};
