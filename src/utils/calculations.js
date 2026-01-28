// Business calculation utilities

// Break-even calculator for advertising analysis
const calculateBreakEven = (adSpend, cogs, price, conversionRate) => {
  if (!price || price <= cogs) return null;
  const profitPerUnit = price - cogs;
  const unitsToBreakEven = Math.ceil(adSpend / profitPerUnit);
  const clicksNeeded = conversionRate > 0 ? Math.ceil(unitsToBreakEven / (conversionRate / 100)) : 0;
  const revenueAtBreakEven = unitsToBreakEven * price;
  const roasAtBreakEven = adSpend > 0 ? revenueAtBreakEven / adSpend : 0;
  return { unitsToBreakEven, clicksNeeded, revenueAtBreakEven, roasAtBreakEven, profitPerUnit };
};

export { calculateBreakEven };
