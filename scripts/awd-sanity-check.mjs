import assert from 'node:assert/strict';

const normalizeSku = (sku) => (sku || '').trim().toUpperCase();
const normalizeSkuBase = (sku) => normalizeSku(sku).replace(/SHOP$/i, '');
const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

const buildFbaInventory = (items) => {
  const bySku = {};
  items.forEach((item) => {
    const skuKey = normalizeSku(item.sellerSku);
    if (!skuKey) return;
    const fulfillable = toNumber(item.inventoryDetails?.fulfillableQuantity);
    const inboundWorking = toNumber(item.inventoryDetails?.inboundWorkingQuantity);
    const inboundShipped = toNumber(item.inventoryDetails?.inboundShippedQuantity);
    const inboundReceiving = toNumber(item.inventoryDetails?.inboundReceivingQuantity);
    const reserved = toNumber(item.inventoryDetails?.reservedQuantity?.totalReservedQuantity);
    const totalInbound = inboundWorking + inboundShipped + inboundReceiving;
    const existing = bySku[skuKey];
    if (existing) {
      existing.fulfillable += fulfillable;
      existing.reserved += reserved;
      existing.totalInbound += totalInbound;
      return;
    }
    bySku[skuKey] = {
      sku: skuKey,
      fulfillable,
      reserved,
      totalInbound,
    };
  });
  return bySku;
};

const buildAwdInventory = (items) => {
  const bySku = {};
  items.forEach((item) => {
    const skuKey = normalizeSku(item.sku || item.sellerSku);
    if (!skuKey) return;
    const summary = item.inventorySummary || item.inventoryDetails || {};
    const onHand =
      item.totalInventory?.quantity ||
      summary.totalQuantity?.quantity ||
      summary.totalQuantity ||
      0;
    const inbound =
      item.totalInboundQuantity?.quantity ||
      item.totalInboundQuantity ||
      summary.inboundQuantity?.quantity ||
      summary.inboundQuantity ||
      0;
    const replenishment =
      item.replenishmentQuantity?.quantity ||
      item.replenishmentQuantity ||
      summary.replenishmentQuantity?.quantity ||
      summary.replenishmentQuantity ||
      0;
    const reserved =
      summary.reservedQuantity?.quantity ||
      summary.reservedQuantity ||
      item.reservedQuantity?.quantity ||
      item.reservedQuantity ||
      0;
    const awdQty = toNumber(onHand) + toNumber(reserved);
    const awdInbound = toNumber(inbound) + toNumber(replenishment);
    const existing = bySku[skuKey];
    if (existing) {
      existing.awdQuantity += awdQty;
      existing.awdInbound += awdInbound;
      return;
    }
    bySku[skuKey] = { sku: skuKey, awdQuantity: awdQty, awdInbound };
  });
  return bySku;
};

const mergeFbaAwd = (fbaInventory, awdInventory) => {
  const allSkus = new Set([...Object.keys(fbaInventory), ...Object.keys(awdInventory)].map(normalizeSku));
  const merged = {};
  allSkus.forEach((skuKey) => {
    const fba = fbaInventory[skuKey] || {};
    const awd = awdInventory[skuKey] || {};
    merged[skuKey] = {
      sku: skuKey,
      fbaTotal: toNumber(fba.fulfillable) + toNumber(fba.reserved),
      fbaInbound: toNumber(fba.totalInbound),
      awdQuantity: toNumber(awd.awdQuantity),
      awdInbound: toNumber(awd.awdInbound),
      amazonInbound: toNumber(fba.totalInbound) + toNumber(awd.awdInbound),
    };
  });
  return merged;
};

const calculateSnapshotTotals = (item) => {
  const totalInbound = toNumber(item.amazonInbound) + toNumber(item.awdInbound) + toNumber(item.threeplInbound);
  const totalUnits =
    toNumber(item.amazonQty) +
    toNumber(item.threeplQty) +
    toNumber(item.homeQty) +
    toNumber(item.awdQty) +
    totalInbound;
  return { totalInbound, totalUnits };
};

const tests = [];
const register = (name, fn) => tests.push({ name, fn });

register('Merges FBA+AWD across SKU case differences', () => {
  const fba = buildFbaInventory([
    {
      sellerSku: 'abc-123',
      inventoryDetails: {
        fulfillableQuantity: 10,
        inboundWorkingQuantity: 4,
        inboundShippedQuantity: 1,
        inboundReceivingQuantity: 0,
        reservedQuantity: { totalReservedQuantity: 2 },
      },
    },
  ]);
  const awd = buildAwdInventory([
    {
      sku: 'ABC-123',
      totalInventory: { quantity: 5 },
      totalInboundQuantity: { quantity: 3 },
      replenishmentQuantity: { quantity: 2 },
    },
  ]);
  const merged = mergeFbaAwd(fba, awd);
  const row = merged['ABC-123'];
  assert.ok(row, 'Expected merged row for ABC-123');
  assert.equal(row.fbaTotal, 12);
  assert.equal(row.awdQuantity, 5);
  assert.equal(row.awdInbound, 5);
  assert.equal(row.amazonInbound, 10);
});

register('Aggregates duplicate FBA records for same SKU', () => {
  const fba = buildFbaInventory([
    {
      sellerSku: 'Sku-1',
      inventoryDetails: {
        fulfillableQuantity: 7,
        inboundWorkingQuantity: 2,
        inboundShippedQuantity: 0,
        inboundReceivingQuantity: 0,
        reservedQuantity: { totalReservedQuantity: 1 },
      },
    },
    {
      sellerSku: 'SKU-1',
      inventoryDetails: {
        fulfillableQuantity: 3,
        inboundWorkingQuantity: 1,
        inboundShippedQuantity: 1,
        inboundReceivingQuantity: 0,
        reservedQuantity: { totalReservedQuantity: 0 },
      },
    },
  ]);
  assert.equal(Object.keys(fba).length, 1);
  assert.equal(fba['SKU-1'].fulfillable, 10);
  assert.equal(fba['SKU-1'].reserved, 1);
  assert.equal(fba['SKU-1'].totalInbound, 4);
});

register('FBA inbound selection does not double-count AWD inbound', () => {
  const item = {
    fbaInbound: 11,
    amazonInbound: 44, // combined field from API should not be used for FBA-only inbound
    totalInbound: 22,
    inbound: 33,
  };
  const selectedFbaInbound = toNumber(item.fbaInbound ?? item.totalInbound ?? item.inbound);
  assert.equal(selectedFbaInbound, 11);
});

register('Snapshot totals include AWD inbound and SHOP SKU normalization', () => {
  const baseSku = normalizeSkuBase('abc123shop');
  assert.equal(baseSku, 'ABC123');
  const { totalInbound, totalUnits } = calculateSnapshotTotals({
    amazonQty: 10,
    threeplQty: 20,
    homeQty: 5,
    awdQty: 7,
    amazonInbound: 3,
    awdInbound: 4,
    threeplInbound: 2,
  });
  assert.equal(totalInbound, 9);
  assert.equal(totalUnits, 51);
});

let passed = 0;
tests.forEach((test) => {
  test.fn();
  passed += 1;
  console.log(`PASS: ${test.name}`);
});

console.log(`\nAWD sanity check complete: ${passed}/${tests.length} tests passed.`);
