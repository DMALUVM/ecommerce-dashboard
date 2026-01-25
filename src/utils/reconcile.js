const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const withShippingSkuRow = (skuData, shippingCollected) => {
  const rows = Array.isArray(skuData) ? [...skuData] : [];
  const ship = num(shippingCollected);
  if (ship <= 0) return rows;

  const already = rows.some((r) => (r && (r.isShipping || String(r.sku || '').toLowerCase() === 'shipping')));
  if (already) return rows;

  rows.push({
    sku: 'Shipping',
    name: 'Shipping (collected)',
    unitsSold: 0,
    grossSales: ship,
    discounts: 0,
    netSales: ship,
    cogs: 0,
    profit: ship,
    isShipping: true,
  });
  return rows;
};

export const sumSkuRows = (skuData, fields = { units: 'unitsSold', revenue: 'netSales', cogs: 'cogs', profit: 'profit' }) => {
  const rows = Array.isArray(skuData) ? skuData : [];
  return rows.reduce(
    (acc, r) => {
      if (!r) return acc;
      acc.units += num(r[fields.units]);
      acc.revenue += num(r[fields.revenue]);
      acc.cogs += num(r[fields.cogs]);
      acc.profit += num(r[fields.profit]);
      return acc;
    },
    { units: 0, revenue: 0, cogs: 0, profit: 0 }
  );
};
