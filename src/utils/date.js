// Helper: Check if a day has REAL sales data (not just Google/Meta Ads data)
// Real daily data has revenue > 0 from actual sales uploads
// Ads-only data may have total/shopify objects but with no revenue
export const hasDailySalesData = (dayData) => {
  if (!dayData) return false;
  // Check for actual revenue - ads-only days have total/shopify but revenue is 0 or undefined
  const totalRevenue = dayData.total?.revenue || 0;
  const shopifyRevenue = dayData.shopify?.revenue || 0;
  const amazonRevenue = dayData.amazon?.revenue || 0;
  return totalRevenue > 0 || shopifyRevenue > 0 || amazonRevenue > 0;
};

// Helper: Format date to YYYY-MM-DD without timezone issues
export const formatDateKey = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const getSunday = (date) => {
  const d = new Date(date);
  d.setDate(d.getDate() + (7 - d.getDay()) % 7);
  return formatDateKey(d);
};
