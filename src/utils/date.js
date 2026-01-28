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
  const d = date instanceof Date ? date : new Date(date + 'T12:00:00');
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Get the Sunday (week-ending) for a given date
// IMPORTANT: Uses T12:00:00 to prevent timezone shifts
export const getSunday = (date) => {
  // Handle both Date objects and string date keys
  const d = date instanceof Date 
    ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)
    : new Date(date + 'T12:00:00');
  
  const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  d.setDate(d.getDate() + daysUntilSunday);
  
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Get the Monday (week-starting) for a given date
export const getMonday = (date) => {
  const d = date instanceof Date 
    ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)
    : new Date(date + 'T12:00:00');
  
  const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setDate(d.getDate() - daysSinceMonday);
  
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
