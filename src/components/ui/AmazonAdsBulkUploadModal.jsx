import React from 'react';
import { TrendingUp, X, Upload, FileSpreadsheet, RefreshCw, Eye, Check, AlertCircle } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/format';
import { lsSet } from '../../utils/storage';

const AmazonAdsBulkUploadModal = ({
  showAmazonAdsBulkUpload,
  setShowAmazonAdsBulkUpload,
  amazonAdsFile,
  setAmazonAdsFile,
  amazonAdsProcessing,
  setAmazonAdsProcessing,
  amazonAdsResults,
  setAmazonAdsResults,
  allDaysData,
  setAllDaysData,
  amazonCampaigns,
  setAmazonCampaigns,
  combinedData,
  queueCloudSave,
  setToast
}) => {
  if (!showAmazonAdsBulkUpload) return null;
  
  // Parse DD/MM/YYYY date format
  const parseAmazonDate = (dateStr) => {
    if (!dateStr) return null;
    const str = String(dateStr).trim();
    
    // Format: DD/MM/YYYY
    const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      const day = parseInt(match[1]);
      const month = parseInt(match[2]) - 1;
      const year = parseInt(match[3]);
      const d = new Date(year, month, day);
      return d.toISOString().split('T')[0];
    }
    
    // Format: YYYY-MM-DD
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) return str;
    
    return null;
  };
  
  const parseNumber = (val) => {
    if (val === null || val === undefined || val === '' || val === 'null') return 0;
    const str = String(val).replace(/[$,%]/g, '').trim();
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  };
  
  const processAmazonAdsFile = async () => {
    if (!amazonAdsFile) return;
    
    setAmazonAdsProcessing(true);
    
    try {
      const text = await amazonAdsFile.text();
      const lines = text.split('\n').map(l => l.trim()).filter(l => l);
      
      if (lines.length < 2) {
        setAmazonAdsResults({ status: 'error', message: 'File has no data rows' });
        setAmazonAdsProcessing(false);
        return;
      }
      
      const parseCSVLine = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (const char of line) {
          if (char === '"') inQuotes = !inQuotes;
          else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
          else current += char;
        }
        result.push(current.trim());
        return result;
      };
      
      const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/"/g, '').trim());
      const getColIdx = (names) => headers.findIndex(h => names.some(n => h === n || h.includes(n)));
      
      const colMap = {
        date: getColIdx(['date', 'day']),
        spend: getColIdx(['spend']),
        revenue: getColIdx(['revenue']),
        orders: getColIdx(['orders']),
        conversions: getColIdx(['conversions']),
        roas: getColIdx(['roas']),
        acos: getColIdx(['acos']),
        impressions: getColIdx(['impressions']),
        clicks: getColIdx(['clicks']),
        ctr: getColIdx(['ctr']),
        cpc: getColIdx(['avg cpc', 'cpc']),
        convRate: getColIdx(['conv rate', 'conversion rate']),
        tacos: getColIdx(['total acos', 'tacos']),
        totalUnits: getColIdx(['total units ordered', 'total units']),
        totalRevenue: getColIdx(['total revenue']),
      };
      
      if (colMap.date === -1) {
        setAmazonAdsResults({ status: 'error', message: 'No "date" column found' });
        setAmazonAdsProcessing(false);
        return;
      }
      
      const dailyData = {};
      let skippedRows = 0;
      
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        const dateStr = cols[colMap.date];
        const parsedDate = parseAmazonDate(dateStr);
        
        if (!parsedDate) { skippedRows++; continue; }
        
        const spend = parseNumber(cols[colMap.spend]);
        const totalRevenue = parseNumber(cols[colMap.totalRevenue]);
        if (spend === 0 && totalRevenue === 0) { skippedRows++; continue; }
        
        dailyData[parsedDate] = {
          spend, adRevenue: parseNumber(cols[colMap.revenue]), orders: parseNumber(cols[colMap.orders]),
          conversions: parseNumber(cols[colMap.conversions]), roas: parseNumber(cols[colMap.roas]),
          acos: parseNumber(cols[colMap.acos]), impressions: parseNumber(cols[colMap.impressions]),
          clicks: parseNumber(cols[colMap.clicks]), ctr: parseNumber(cols[colMap.ctr]),
          cpc: parseNumber(cols[colMap.cpc]), convRate: parseNumber(cols[colMap.convRate]),
          tacos: parseNumber(cols[colMap.tacos]), totalUnits: parseNumber(cols[colMap.totalUnits]),
          totalRevenue,
        };
      }
      
      const dates = Object.keys(dailyData).sort();
      if (dates.length === 0) {
        setAmazonAdsResults({ status: 'error', message: 'No valid data rows found' });
        setAmazonAdsProcessing(false);
        return;
      }
      
      const totals = Object.values(dailyData).reduce((acc, d) => ({
        spend: acc.spend + d.spend, totalRevenue: acc.totalRevenue + d.totalRevenue,
        impressions: acc.impressions + d.impressions, clicks: acc.clicks + d.clicks,
        conversions: acc.conversions + d.conversions,
      }), { spend: 0, totalRevenue: 0, impressions: 0, clicks: 0, conversions: 0 });
      
      setAmazonAdsResults({ status: 'preview', dailyData, dateRange: { start: dates[0], end: dates[dates.length - 1] }, daysCount: dates.length, skippedRows, totals });
      setAmazonAdsProcessing(false);
    } catch (err) {
      setAmazonAdsResults({ status: 'error', message: err.message });
      setAmazonAdsProcessing(false);
    }
  };
  
  const confirmImport = () => {
    if (!amazonAdsResults?.dailyData) return;
    setAmazonAdsProcessing(true);
    
    let updatedDays = { ...allDaysData };
    let daysUpdated = 0;
    
    // Calculate advanced analytics from the data
    const dailyEntries = Object.entries(amazonAdsResults.dailyData);
    const sortedEntries = dailyEntries.sort((a, b) => a[0].localeCompare(b[0]));
    
    // Calculate week-over-week and day-of-week patterns
    const dayOfWeekStats = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    const monthlyStats = {};
    const weeklyStats = {};
    
    sortedEntries.forEach(([date, adsData]) => {
      const d = new Date(date + 'T12:00:00');
      const dow = d.getDay();
      const monthKey = date.substring(0, 7);
      
      // Get week ending (Sunday)
      const dayOfWeek = d.getDay();
      const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
      const weekEnd = new Date(d);
      weekEnd.setDate(weekEnd.getDate() + daysUntilSunday);
      const weekKey = weekEnd.toISOString().split('T')[0];
      
      // Aggregate day of week stats
      dayOfWeekStats[dow].push({
        roas: adsData.roas || 0,
        acos: adsData.acos || 0,
        spend: adsData.spend || 0,
        conversions: adsData.conversions || 0,
      });
      
      // Aggregate monthly stats
      if (!monthlyStats[monthKey]) {
        monthlyStats[monthKey] = { spend: 0, revenue: 0, totalRevenue: 0, orders: 0, conversions: 0, clicks: 0, impressions: 0, days: 0 };
      }
      monthlyStats[monthKey].spend += adsData.spend || 0;
      monthlyStats[monthKey].revenue += adsData.adRevenue || adsData.revenue || 0;
      monthlyStats[monthKey].totalRevenue += adsData.totalRevenue || 0;
      monthlyStats[monthKey].orders += adsData.orders || 0;
      monthlyStats[monthKey].conversions += adsData.conversions || 0;
      monthlyStats[monthKey].clicks += adsData.clicks || 0;
      monthlyStats[monthKey].impressions += adsData.impressions || 0;
      monthlyStats[monthKey].days++;
      
      // Aggregate weekly stats
      if (!weeklyStats[weekKey]) {
        weeklyStats[weekKey] = { spend: 0, revenue: 0, totalRevenue: 0, orders: 0, conversions: 0, clicks: 0, impressions: 0, days: 0 };
      }
      weeklyStats[weekKey].spend += adsData.spend || 0;
      weeklyStats[weekKey].revenue += adsData.adRevenue || adsData.revenue || 0;
      weeklyStats[weekKey].totalRevenue += adsData.totalRevenue || 0;
      weeklyStats[weekKey].orders += adsData.orders || 0;
      weeklyStats[weekKey].conversions += adsData.conversions || 0;
      weeklyStats[weekKey].clicks += adsData.clicks || 0;
      weeklyStats[weekKey].impressions += adsData.impressions || 0;
      weeklyStats[weekKey].days++;
      
      // Store in daily data
      const existingDay = updatedDays[date] || {
        total: { revenue: 0, units: 0, cogs: 0, adSpend: 0, netProfit: 0 },
        amazon: { revenue: 0, units: 0, cogs: 0, adSpend: 0, netProfit: 0 },
        shopify: { revenue: 0, units: 0, cogs: 0, adSpend: 0, metaSpend: 0, googleSpend: 0, netProfit: 0 },
      };
      
      updatedDays[date] = {
        ...existingDay,
        amazonAdsMetrics: {
          spend: adsData.spend, adRevenue: adsData.adRevenue, orders: adsData.orders,
          conversions: adsData.conversions, roas: adsData.roas, acos: adsData.acos,
          impressions: adsData.impressions, clicks: adsData.clicks, ctr: adsData.ctr,
          cpc: adsData.cpc, convRate: adsData.convRate, tacos: adsData.tacos,
          totalUnits: adsData.totalUnits, totalRevenue: adsData.totalRevenue,
        },
      };
      daysUpdated++;
    });
    
    // Calculate day-of-week insights
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dowInsights = Object.entries(dayOfWeekStats).map(([dow, stats]) => {
      if (stats.length === 0) return null;
      const avgRoas = stats.reduce((s, d) => s + d.roas, 0) / stats.length;
      const avgAcos = stats.reduce((s, d) => s + d.acos, 0) / stats.length;
      const avgSpend = stats.reduce((s, d) => s + d.spend, 0) / stats.length;
      const avgConv = stats.reduce((s, d) => s + d.conversions, 0) / stats.length;
      return { day: dayNames[dow], avgRoas, avgAcos, avgSpend, avgConversions: avgConv, sampleSize: stats.length };
    }).filter(Boolean);
    
    // Find best/worst days
    const bestDay = dowInsights.reduce((best, d) => d.avgRoas > best.avgRoas ? d : best, dowInsights[0]);
    const worstDay = dowInsights.reduce((worst, d) => d.avgRoas < worst.avgRoas ? d : worst, dowInsights[0]);
    
    // Calculate monthly trends with derived metrics
    const monthlyTrends = Object.entries(monthlyStats).map(([month, stats]) => ({
      month,
      ...stats,
      roas: stats.spend > 0 ? stats.revenue / stats.spend : 0,
      acos: stats.revenue > 0 ? (stats.spend / stats.revenue) * 100 : 0,
      tacos: stats.totalRevenue > 0 ? (stats.spend / stats.totalRevenue) * 100 : 0,
      ctr: stats.impressions > 0 ? (stats.clicks / stats.impressions) * 100 : 0,
      cpc: stats.clicks > 0 ? stats.spend / stats.clicks : 0,
      convRate: stats.clicks > 0 ? (stats.conversions / stats.clicks) * 100 : 0,
    })).sort((a, b) => a.month.localeCompare(b.month));
    
    // Calculate weekly trends with derived metrics
    const weeklyTrends = Object.entries(weeklyStats).map(([week, stats]) => ({
      weekEnding: week,
      ...stats,
      roas: stats.spend > 0 ? stats.revenue / stats.spend : 0,
      acos: stats.revenue > 0 ? (stats.spend / stats.revenue) * 100 : 0,
      tacos: stats.totalRevenue > 0 ? (stats.spend / stats.totalRevenue) * 100 : 0,
    })).sort((a, b) => a.weekEnding.localeCompare(b.weekEnding));
    
    setAllDaysData(updatedDays);
    lsSet('dailySales', JSON.stringify(updatedDays));
    
    // Save comprehensive analytics to amazonCampaigns for AI analysis
    const updatedCampaigns = {
      ...amazonCampaigns,
      historicalDaily: {
        ...(amazonCampaigns.historicalDaily || {}),
        ...amazonAdsResults.dailyData,
      },
      historicalLastUpdated: new Date().toISOString(),
      historicalDateRange: amazonAdsResults.dateRange,
      analytics: {
        dayOfWeekInsights: dowInsights,
        bestPerformingDay: bestDay,
        worstPerformingDay: worstDay,
        monthlyTrends,
        weeklyTrends,
        totals: amazonAdsResults.totals,
        dateRange: amazonAdsResults.dateRange,
        daysAnalyzed: daysUpdated,
      },
    };
    setAmazonCampaigns(updatedCampaigns);
    lsSet('ecommerce_amazon_campaigns_v1', JSON.stringify(updatedCampaigns));
    
    queueCloudSave({ ...combinedData, dailySales: updatedDays, amazonCampaigns: updatedCampaigns });
    
    setAmazonAdsResults({ status: 'success', daysImported: daysUpdated, dateRange: amazonAdsResults.dateRange });
    setAmazonAdsProcessing(false);
    setToast({ message: `Imported ${daysUpdated} days of Amazon Ads history with analytics for AI analysis!`, type: 'success' });
  };
  
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl border border-orange-500/30 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Import Amazon Ads History</h2>
                <p className="text-slate-400 text-sm">Upload historical ad performance data</p>
              </div>
            </div>
            <button onClick={() => { setShowAmazonAdsBulkUpload(false); setAmazonAdsFile(null); setAmazonAdsResults(null); }} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
          
          {!amazonAdsResults && (
            <div className="space-y-4">
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                <h3 className="text-white font-medium mb-2">Expected CSV Format</h3>
                <p className="text-slate-400 text-sm mb-3">Your file should have columns like:</p>
                <code className="text-xs text-orange-300 bg-slate-900 px-2 py-1 rounded block overflow-x-auto">date, Spend, Revenue, Impressions, Clicks, CTR, ROAS, ACOS, TACOS, Total Revenue</code>
                <p className="text-slate-500 text-xs mt-2">Date format: DD/MM/YYYY or YYYY-MM-DD</p>
              </div>
              
              <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${amazonAdsFile ? 'border-orange-500/50 bg-orange-950/20' : 'border-slate-600 hover:border-slate-500'}`}>
                <input type="file" accept=".csv" onChange={(e) => setAmazonAdsFile(e.target.files[0])} className="hidden" id="amazon-ads-file" />
                <label htmlFor="amazon-ads-file" className="cursor-pointer">
                  {amazonAdsFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <FileSpreadsheet className="w-8 h-8 text-orange-400" />
                      <div className="text-left"><p className="text-white font-medium">{amazonAdsFile.name}</p><p className="text-slate-400 text-sm">{(amazonAdsFile.size / 1024).toFixed(1)} KB</p></div>
                    </div>
                  ) : (<><Upload className="w-10 h-10 text-slate-500 mx-auto mb-3" /><p className="text-white font-medium">Drop your CSV file here</p><p className="text-slate-400 text-sm">or click to browse</p></>)}
                </label>
              </div>
              
              <button onClick={processAmazonAdsFile} disabled={!amazonAdsFile || amazonAdsProcessing} className="w-full py-3 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-700 disabled:opacity-50 rounded-xl text-white font-semibold flex items-center justify-center gap-2">
                {amazonAdsProcessing ? <><RefreshCw className="w-5 h-5 animate-spin" />Processing...</> : <><Eye className="w-5 h-5" />Preview Import</>}
              </button>
            </div>
          )}
          
          {amazonAdsResults?.status === 'preview' && (
            <div className="space-y-4">
              <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3"><Check className="w-5 h-5 text-emerald-400" /><span className="text-emerald-400 font-medium">File parsed successfully!</span></div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><p className="text-slate-400">Days Found</p><p className="text-white text-lg font-bold">{amazonAdsResults.daysCount}</p></div>
                  <div><p className="text-slate-400">Date Range</p><p className="text-white">{amazonAdsResults.dateRange.start} → {amazonAdsResults.dateRange.end}</p></div>
                </div>
              </div>
              
              <div className="bg-slate-800/50 rounded-xl p-4">
                <h3 className="text-white font-medium mb-3">Data Summary</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-slate-900/50 rounded-lg p-3"><p className="text-slate-400 text-xs">Total Ad Spend</p><p className="text-orange-400 font-bold">{formatCurrency(amazonAdsResults.totals.spend)}</p></div>
                  <div className="bg-slate-900/50 rounded-lg p-3"><p className="text-slate-400 text-xs">Total Revenue</p><p className="text-emerald-400 font-bold">{formatCurrency(amazonAdsResults.totals.totalRevenue)}</p></div>
                  <div className="bg-slate-900/50 rounded-lg p-3"><p className="text-slate-400 text-xs">Avg TACOS</p><p className="text-white font-bold">{amazonAdsResults.totals.totalRevenue > 0 ? ((amazonAdsResults.totals.spend / amazonAdsResults.totals.totalRevenue) * 100).toFixed(1) : 0}%</p></div>
                  <div className="bg-slate-900/50 rounded-lg p-3"><p className="text-slate-400 text-xs">Impressions</p><p className="text-white font-bold">{formatNumber(amazonAdsResults.totals.impressions)}</p></div>
                  <div className="bg-slate-900/50 rounded-lg p-3"><p className="text-slate-400 text-xs">Clicks</p><p className="text-white font-bold">{formatNumber(amazonAdsResults.totals.clicks)}</p></div>
                  <div className="bg-slate-900/50 rounded-lg p-3"><p className="text-slate-400 text-xs">Conversions</p><p className="text-white font-bold">{formatNumber(amazonAdsResults.totals.conversions)}</p></div>
                </div>
              </div>
              
              <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4">
                <p className="text-amber-300 text-sm"><strong>Note:</strong> This import will add ad metrics for the Ads tab. It will NOT overwrite any existing sales/profit data from SKU Economics uploads.</p>
              </div>
              
              <div className="flex gap-3">
                <button onClick={() => { setAmazonAdsResults(null); setAmazonAdsFile(null); }} className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-white font-semibold">Cancel</button>
                <button onClick={confirmImport} disabled={amazonAdsProcessing} className="flex-1 py-3 bg-orange-600 hover:bg-orange-500 rounded-xl text-white font-semibold flex items-center justify-center gap-2">
                  {amazonAdsProcessing ? <><RefreshCw className="w-5 h-5 animate-spin" />Importing...</> : <><Check className="w-5 h-5" />Confirm Import</>}
                </button>
              </div>
            </div>
          )}
          
          {amazonAdsResults?.status === 'success' && (
            <div className="space-y-4">
              <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-6 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4"><Check className="w-8 h-8 text-emerald-400" /></div>
                <h3 className="text-xl font-bold text-white mb-2">Import Complete!</h3>
                <p className="text-slate-400">Successfully imported <span className="text-emerald-400 font-bold">{amazonAdsResults.daysImported}</span> days of Amazon Ads data</p>
                <p className="text-slate-500 text-sm mt-2">{amazonAdsResults.dateRange.start} → {amazonAdsResults.dateRange.end}</p>
              </div>
              <button onClick={() => { setShowAmazonAdsBulkUpload(false); setAmazonAdsFile(null); setAmazonAdsResults(null); }} className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-white font-semibold">Done</button>
            </div>
          )}
          
          {amazonAdsResults?.status === 'error' && (
            <div className="space-y-4">
              <div className="bg-rose-900/20 border border-rose-500/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2"><AlertCircle className="w-5 h-5 text-rose-400" /><span className="text-rose-400 font-medium">Import Failed</span></div>
                <p className="text-slate-400">{amazonAdsResults.message}</p>
              </div>
              <button onClick={() => { setAmazonAdsResults(null); setAmazonAdsFile(null); }} className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-white font-semibold">Try Again</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AmazonAdsBulkUploadModal;
