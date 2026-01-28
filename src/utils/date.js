// Helper: Check if a day has REAL sales data (not just Google/Meta Ads data)
export const hasDailySalesData = (dayData) => {
  if (!dayData) return false;
  const totalRevenue = dayData.total?.revenue || 0;
  const shopifyRevenue = dayData.shopify?.revenue || 0;
  const amazonRevenue = dayData.amazon?.revenue || 0;
  return totalRevenue > 0 || shopifyRevenue > 0 || amazonRevenue > 0;
};

// Helper: Format date to YYYY-MM-DD without timezone issues
export const formatDateKey = (date) => {
  const d = date instanceof Date 
    ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)
    : new Date(date + 'T12:00:00');
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Get the Sunday (week-ending) for a given date
// IMPORTANT: Uses noon time to prevent timezone shifts
export const getSunday = (date) => {
  const d = date instanceof Date 
    ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)
    : new Date(date + 'T12:00:00');
  
  const dayOfWeek = d.getDay();
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  d.setDate(d.getDate() + daysUntilSunday);
  
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Check if a date key is a Sunday
export const isSunday = (dateKey) => {
  const d = new Date(dateKey + 'T12:00:00');
  return d.getDay() === 0;
};

// Migrate week keys that aren't Sundays to their correct Sunday
export const migrateWeekKeys = (weeksData) => {
  if (!weeksData || typeof weeksData !== 'object') return { migratedData: weeksData, migrations: [] };
  
  const migrations = [];
  const migratedData = {};
  
  Object.entries(weeksData).forEach(([weekKey, data]) => {
    const correctSunday = getSunday(weekKey);
    
    if (weekKey !== correctSunday) {
      migrations.push({ from: weekKey, to: correctSunday });
      if (!migratedData[correctSunday]) {
        migratedData[correctSunday] = { ...data, weekEnding: correctSunday };
      }
    } else {
      migratedData[weekKey] = data;
    }
  });
  
  return { migratedData, migrations };
};
