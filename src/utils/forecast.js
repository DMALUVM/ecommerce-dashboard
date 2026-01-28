// Amazon forecast processing utilities
import { getSunday } from './date';

/**
 * Process Amazon SKU Economics forecast CSV data
 * Handles both weekly and 30-day forecasts, splitting monthly into weekly segments
 * @param {Array} csvData - Parsed CSV rows from Amazon SKU Economics report
 * @returns {Object|null} Processed forecast data with type, forecasts/forecast, and metadata
 */
export const processAmazonForecast = (csvData) => {
  if (!csvData || csvData.length === 0) return null;
  
  // Get date range from first row
  const startDateStr = csvData[0]['Start date'];
  const endDateStr = csvData[0]['End date'];
  
  if (!startDateStr || !endDateStr) return null;
  
  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);
  const daysDiff = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));
  
  // Aggregate forecast data
  let totalUnits = 0, totalSales = 0, totalProceeds = 0, totalAds = 0;
  const skuForecasts = {};
  
  csvData.forEach(r => {
    const sku = r['MSKU'] || '';
    const units = parseInt(r['Net units sold'] || r['Units sold'] || 0);
    const sales = parseFloat(r['Net sales'] || r['Sales'] || 0);
    const proceeds = parseFloat(r['Net proceeds total'] || 0);
    const ads = parseFloat(r['Sponsored Products charge total'] || 0);
    const cogs = parseFloat(r['Cost of goods sold per unit'] || 0);
    
    if (units > 0 || sales > 0) {
      totalUnits += units;
      totalSales += sales;
      totalProceeds += proceeds;
      totalAds += ads;
      
      if (sku) {
        skuForecasts[sku] = {
          sku,
          units,
          sales,
          proceeds,
          ads,
          cogsPerUnit: cogs,
          profitPerUnit: units > 0 ? proceeds / units : 0,
        };
      }
    }
  });
  
  // If this is a 30-day forecast (28-31 days), break it into weekly forecasts
  const isMontlyForecast = daysDiff >= 25 && daysDiff <= 35;
  const weeksInForecast = Math.ceil(daysDiff / 7);
  
  if (isMontlyForecast) {
    // Return multiple weekly forecasts
    const weeklyForecasts = {};
    const weeklyUnits = Math.round(totalUnits / weeksInForecast);
    const weeklySales = totalSales / weeksInForecast;
    const weeklyProceeds = totalProceeds / weeksInForecast;
    const weeklyAds = totalAds / weeksInForecast;
    
    // Generate a forecast for each week in the period
    for (let i = 0; i < weeksInForecast; i++) {
      const weekStart = new Date(startDate);
      weekStart.setDate(weekStart.getDate() + (i * 7));
      const weekKey = getSunday(weekStart);
      
      weeklyForecasts[weekKey] = {
        weekEnding: weekKey,
        startDate: startDateStr,
        endDate: endDateStr,
        uploadedAt: new Date().toISOString(),
        sourceType: '30-day-split',
        weekNumber: i + 1,
        totalWeeks: weeksInForecast,
        totals: {
          units: weeklyUnits,
          sales: weeklySales,
          proceeds: weeklyProceeds,
          ads: weeklyAds,
          profitPerUnit: weeklyUnits > 0 ? weeklyProceeds / weeklyUnits : 0,
        },
        skus: Object.fromEntries(Object.entries(skuForecasts).map(([sku, data]) => [sku, {
          ...data,
          units: Math.round(data.units / weeksInForecast),
          sales: data.sales / weeksInForecast,
          proceeds: data.proceeds / weeksInForecast,
          ads: data.ads / weeksInForecast,
        }])),
        skuCount: Object.keys(skuForecasts).length,
        // Also store the monthly total for reference
        monthlyTotal: {
          units: totalUnits,
          sales: totalSales,
          proceeds: totalProceeds,
          ads: totalAds,
        },
      };
    }
    
    return {
      type: 'monthly',
      forecasts: weeklyForecasts,
      period: { startDate: startDateStr, endDate: endDateStr, days: daysDiff },
      monthlyTotal: { units: totalUnits, sales: totalSales, proceeds: totalProceeds, ads: totalAds },
    };
  }
  
  // Standard weekly forecast
  const weekKey = getSunday(endDate);
  return {
    type: 'weekly',
    forecast: {
      weekEnding: weekKey,
      startDate: startDateStr,
      endDate: endDateStr,
      uploadedAt: new Date().toISOString(),
      sourceType: 'weekly',
      totals: {
        units: totalUnits,
        sales: totalSales,
        proceeds: totalProceeds,
        ads: totalAds,
        profitPerUnit: totalUnits > 0 ? totalProceeds / totalUnits : 0,
      },
      skus: skuForecasts,
      skuCount: Object.keys(skuForecasts).length,
    },
  };
};
