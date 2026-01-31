import React, { useState } from 'react';
import { TrendingUp, X, Upload, FileSpreadsheet, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import { lsSet } from '../../utils/storage';

const AdsBulkUploadModal = ({
  showAdsBulkUpload,
  setShowAdsBulkUpload,
  adsSelectedFiles,
  setAdsSelectedFiles,
  adsProcessing,
  setAdsProcessing,
  adsResults,
  setAdsResults,
  allDaysData,
  setAllDaysData,
  allWeeksData,
  setAllWeeksData,
  combinedData,
  session,
  supabase,
  pushToCloudNow
}) => {
  const [dragActive, setDragActive] = useState(false);
  
  if (!showAdsBulkUpload) return null;
  
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };
  
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = [...e.dataTransfer.files].filter(f => f.name.endsWith('.csv'));
    setAdsSelectedFiles(prev => [...prev, ...files]);
  };
  
  const handleFileSelect = (e) => {
    const files = [...e.target.files].filter(f => f.name.endsWith('.csv'));
    setAdsSelectedFiles(prev => [...prev, ...files]);
  };
  
  const removeFile = (idx) => setAdsSelectedFiles(prev => prev.filter((_, i) => i !== idx));
  
  // Parse date formats from Meta and Google ads exports
  const parseAdsDate = (dateStr) => {
    if (!dateStr) return null;
    const str = dateStr.replace(/"/g, '').trim();
    
    // Format: "Jan 4, 2026" or "Dec 31, 2025" (Meta)
    const metaMatch = str.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
    if (metaMatch) {
      const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
      const month = months[metaMatch[1].toLowerCase().substring(0, 3)];
      const day = parseInt(metaMatch[2]);
      const year = parseInt(metaMatch[3]);
      if (month !== undefined && day && year) {
        const d = new Date(year, month, day);
        return d.toISOString().split('T')[0];
      }
    }
    
    // Format: "Mon, Dec 29, 2025" (Google)
    const googleMatch = str.match(/^[A-Za-z]+,\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
    if (googleMatch) {
      const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
      const month = months[googleMatch[1].toLowerCase().substring(0, 3)];
      const day = parseInt(googleMatch[2]);
      const year = parseInt(googleMatch[3]);
      if (month !== undefined && day && year) {
        const d = new Date(year, month, day);
        return d.toISOString().split('T')[0];
      }
    }
    
    // Format: YYYY-MM-DD
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) return str;
    
    // Format: MM/DD/YYYY
    const usMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (usMatch) {
      const d = new Date(parseInt(usMatch[3]), parseInt(usMatch[1]) - 1, parseInt(usMatch[2]));
      return d.toISOString().split('T')[0];
    }
    
    return null;
  };
  
  // Parse currency/number values
  const parseNumber = (val) => {
    if (val === null || val === undefined || val === 'null' || val === '') return 0;
    const str = String(val).replace(/[$,]/g, '').trim();
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  };
  
  // Detect file type and parse accordingly
  const parseAdsFile = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          const lines = text.split('\n').map(l => l.trim()).filter(l => l);
          if (lines.length < 2) {
            reject(new Error('File has no data rows'));
            return;
          }
          
          // Parse header
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
          
          const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/"/g, ''));
          const dateColIdx = headers.findIndex(h => h === 'date' || h === 'day' || h.includes('date'));
          
          if (dateColIdx === -1) {
            reject(new Error('No date column found. Expected "Date" or "Day" column.'));
            return;
          }
          
          // Detect file type by headers
          const isMetaAds = headers.some(h => h.includes('ad name') || h.includes('amount spent') || h.includes('roas'));
          const isGoogleAds = headers.some(h => h.includes('avg. cpc') || h.includes('avg cpc') || h.includes('cost / conv'));
          
          if (!isMetaAds && !isGoogleAds) {
            reject(new Error('Unrecognized ads format. Expected Meta or Google Ads export.'));
            return;
          }
          
          // Map headers to indices
          const getColIdx = (patterns) => headers.findIndex(h => patterns.some(p => h.includes(p)));
          const getExactColIdx = (patterns, excludePatterns = []) => headers.findIndex(h => 
            patterns.some(p => h.includes(p)) && !excludePatterns.some(ex => h.includes(ex))
          );
          
          const dailyData = {};
          
          // Parse data rows
          for (let i = 1; i < lines.length; i++) {
            const cols = parseCSVLine(lines[i]);
            const dateStr = cols[dateColIdx];
            const parsedDate = parseAdsDate(dateStr);
            
            if (!parsedDate) continue;
            
            if (!dailyData[parsedDate]) {
              dailyData[parsedDate] = {
                metaSpend: 0, googleSpend: 0,
                metaImpressions: 0, googleImpressions: 0,
                metaClicks: 0, googleClicks: 0,
                metaPurchases: 0, googleConversions: 0,
                metaPurchaseValue: 0, googleConversionValue: 0,
                metaROAS: 0, googleCostPerConv: 0,
                metaCPM: 0, metaCPC: 0, googleCPC: 0,
                metaCTR: 0, googleCTR: 0,
              };
            }
            
            if (isMetaAds) {
              const spendIdx = getColIdx(['amount spent']);
              const purchaseValueIdx = getColIdx(['purchases value', 'purchase value', 'website purchase value']);
              const purchasesIdx = getExactColIdx(['purchases (all)', 'purchases', 'website purchases'], ['value']);
              const impressionsIdx = getColIdx(['impressions']);
              const clicksIdx = getColIdx(['link clicks', 'clicks']);
              
              dailyData[parsedDate].metaSpend += parseNumber(cols[spendIdx]);
              dailyData[parsedDate].metaImpressions += parseNumber(cols[impressionsIdx]);
              dailyData[parsedDate].metaClicks += parseNumber(cols[clicksIdx]);
              dailyData[parsedDate].metaPurchases += parseNumber(cols[purchasesIdx]);
              dailyData[parsedDate].metaPurchaseValue += parseNumber(cols[purchaseValueIdx]);
            } else if (isGoogleAds) {
              const impressionsIdx = getColIdx(['impressions']);
              const cpcIdx = getColIdx(['avg. cpc', 'avg cpc']);
              const costIdx = getColIdx(['cost']);
              const costPerConvIdx = getColIdx(['cost / conv', 'cost/conv', 'cost per conv']);
              
              dailyData[parsedDate].googleSpend += parseNumber(cols[costIdx]);
              dailyData[parsedDate].googleImpressions += parseNumber(cols[impressionsIdx]);
              dailyData[parsedDate].googleCPC = parseNumber(cols[cpcIdx]);
              dailyData[parsedDate].googleCostPerConv = parseNumber(cols[costPerConvIdx]);

              const avgCpc = parseNumber(cols[cpcIdx]);
              const costForClicks = parseNumber(cols[costIdx]);
              if (avgCpc > 0) {
                dailyData[parsedDate].googleClicks += Math.round(costForClicks / avgCpc);
              }

              const cost = parseNumber(cols[costIdx]);
              const costPerConv = parseNumber(cols[costPerConvIdx]);
              if (costPerConv > 0) {
                dailyData[parsedDate].googleConversions += Math.round(cost / costPerConv);
              }
            }
          }
          
          // Calculate derived metrics for Meta
          Object.keys(dailyData).forEach(date => {
            const d = dailyData[date];
            if (d.metaImpressions > 0) {
              d.metaCPM = (d.metaSpend / d.metaImpressions) * 1000;
              d.metaCTR = (d.metaClicks / d.metaImpressions) * 100;
            }
            if (d.metaClicks > 0) {
              d.metaCPC = d.metaSpend / d.metaClicks;
            }
            if (d.metaSpend > 0 && d.metaPurchaseValue > 0) {
              d.metaROAS = d.metaPurchaseValue / d.metaSpend;
            }
            if (d.googleImpressions > 0) {
              d.googleCTR = (d.googleClicks / d.googleImpressions) * 100;
            }
            if (d.googleClicks > 0) {
              d.googleCPC = d.googleSpend / d.googleClicks;
            }
          });
          
          const dates = Object.keys(dailyData).sort();
          if (dates.length === 0) {
            reject(new Error('No valid daily data found'));
            return;
          }
          
          resolve({
            type: isMetaAds ? 'meta' : 'google',
            dailyData,
            dateRange: { start: dates[0], end: dates[dates.length - 1] },
            daysCount: dates.length,
          });
        } catch (err) {
          reject(new Error(`Parse error: ${err.message}`));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };
  
  const processFiles = async () => {
    const totalFiles = adsSelectedFiles.length;
    const processResults = [];
    let updatedDays = { ...allDaysData };
    let totalDaysUpdated = 0;
    let allDatesAffected = new Set();
    
    for (let i = 0; i < adsSelectedFiles.length; i++) {
      const file = adsSelectedFiles[i];
      
      setAdsProcessing({ current: i + 1, total: totalFiles, fileName: file.name });
      
      try {
        const parsed = await parseAdsFile(file);
        let daysUpdated = 0;
        
        Object.entries(parsed.dailyData).forEach(([date, adsData]) => {
          allDatesAffected.add(date);
          
          const existingDay = updatedDays[date] || {
            total: { revenue: 0, units: 0, cogs: 0, adSpend: 0, netProfit: 0 },
            amazon: { revenue: 0, units: 0, cogs: 0, adSpend: 0, netProfit: 0 },
            shopify: { revenue: 0, units: 0, cogs: 0, adSpend: 0, metaSpend: 0, googleSpend: 0, netProfit: 0 },
          };
          
          const newMetaSpend = parsed.type === 'meta' ? adsData.metaSpend : (existingDay.shopify?.metaSpend || 0);
          const newGoogleSpend = parsed.type === 'google' ? adsData.googleSpend : (existingDay.shopify?.googleSpend || 0);
          const totalAdSpend = newMetaSpend + newGoogleSpend;
          
          const adsMetrics = {
            ...(existingDay.shopify?.adsMetrics || {}),
            ...(parsed.type === 'meta' ? {
              metaImpressions: adsData.metaImpressions,
              metaClicks: adsData.metaClicks,
              metaPurchases: adsData.metaPurchases,
              metaPurchaseValue: adsData.metaPurchaseValue,
              metaROAS: adsData.metaROAS,
              metaCPM: adsData.metaCPM,
              metaCPC: adsData.metaCPC,
              metaCTR: adsData.metaCTR,
            } : {}),
            ...(parsed.type === 'google' ? {
              googleImpressions: adsData.googleImpressions,
              googleClicks: adsData.googleClicks,
              googleConversions: adsData.googleConversions,
              googleCTR: adsData.googleCTR,
              googleCPC: adsData.googleCPC,
              googleCostPerConv: adsData.googleCostPerConv,
            } : {}),
          };
          
          const shopifyRevenue = existingDay.shopify?.revenue || 0;
          const shopifyCogs = existingDay.shopify?.cogs || 0;
          const shopifyThreeplCosts = existingDay.shopify?.threeplCosts || 0;
          const shopifyDiscounts = existingDay.shopify?.discounts || 0;
          const newShopifyProfit = shopifyRevenue - shopifyCogs - totalAdSpend - shopifyThreeplCosts - shopifyDiscounts;
          
          const amazonProfit = existingDay.amazon?.netProfit || 0;
          const totalProfit = amazonProfit + newShopifyProfit;
          
          updatedDays[date] = {
            ...existingDay,
            shopify: {
              ...existingDay.shopify,
              adSpend: totalAdSpend,
              metaSpend: newMetaSpend,
              googleSpend: newGoogleSpend,
              netProfit: newShopifyProfit,
              adsMetrics,
            },
            total: {
              ...existingDay.total,
              adSpend: totalAdSpend + (existingDay.amazon?.adSpend || 0),
              netProfit: totalProfit,
            },
          };
          
          daysUpdated++;
        });
        
        totalDaysUpdated += daysUpdated;
        processResults.push({
          file: file.name,
          status: 'success',
          type: parsed.type,
          daysUpdated,
          dateRange: parsed.dateRange,
        });
      } catch (err) {
        console.error('Error processing ads file:', file.name, err);
        processResults.push({
          file: file.name,
          status: 'error',
          error: err.message,
        });
      }
    }
    
    // Save updated data
    if (totalDaysUpdated > 0) {
      setAllDaysData(updatedDays);
      lsSet('ecommerce_daily_sales_v1', JSON.stringify(updatedDays));
      
      // Also update weekly data with ads spend from daily data
      if (allWeeksData && setAllWeeksData) {
        const updatedWeeks = { ...allWeeksData };
        const weeksToUpdate = new Set();
        
        // Figure out which weeks need updating
        allDatesAffected.forEach(dateStr => {
          const d = new Date(dateStr + 'T12:00:00');
          const dayOfWeek = d.getDay();
          const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
          const weekEnd = new Date(d);
          weekEnd.setDate(weekEnd.getDate() + daysUntilSunday);
          const weekKey = weekEnd.toISOString().split('T')[0];
          weeksToUpdate.add(weekKey);
        });
        
        // For each affected week, aggregate ads from daily data
        weeksToUpdate.forEach(weekKey => {
          if (!updatedWeeks[weekKey]) return;
          
          // Calculate all 7 days of this week
          const weekEnd = new Date(weekKey + 'T12:00:00');
          let weekMetaSpend = 0;
          let weekGoogleSpend = 0;
          
          for (let i = 6; i >= 0; i--) {
            const dayDate = new Date(weekEnd);
            dayDate.setDate(weekEnd.getDate() - i);
            const dayKey = dayDate.toISOString().split('T')[0];
            const dayData = updatedDays[dayKey];
            
            if (dayData?.shopify) {
              weekMetaSpend += dayData.shopify.metaSpend || 0;
              weekGoogleSpend += dayData.shopify.googleSpend || 0;
            }
          }
          
          // Update week's Shopify data
          const existingShopify = updatedWeeks[weekKey].shopify || {};
          const totalShopifyAds = weekMetaSpend + weekGoogleSpend;
          const shopifyRevenue = existingShopify.revenue || 0;
          const shopifyCogs = existingShopify.cogs || 0;
          const shopifyThreeplCosts = existingShopify.threeplCosts || 0;
          const shopifyDiscounts = existingShopify.discounts || 0;
          const shopifyProfit = shopifyRevenue - shopifyCogs - totalShopifyAds - shopifyThreeplCosts - shopifyDiscounts;
          
          updatedWeeks[weekKey] = {
            ...updatedWeeks[weekKey],
            shopify: {
              ...existingShopify,
              metaSpend: weekMetaSpend,
              metaAds: weekMetaSpend,
              googleSpend: weekGoogleSpend,
              googleAds: weekGoogleSpend,
              adSpend: totalShopifyAds,
              netProfit: shopifyProfit,
            },
            total: {
              ...updatedWeeks[weekKey].total,
              adSpend: (updatedWeeks[weekKey].amazon?.adSpend || 0) + totalShopifyAds,
              netProfit: (updatedWeeks[weekKey].amazon?.netProfit || 0) + shopifyProfit,
            },
          };
        });
        
        setAllWeeksData(updatedWeeks);
        lsSet('ecommerce_weekly_sales_v1', JSON.stringify(updatedWeeks));
      }
      
      const freshCombinedData = {
        ...combinedData,
        dailySales: updatedDays,
        weeklySales: allWeeksData ? { ...allWeeksData } : combinedData.weeklySales,
      };
      if (session?.user?.id && supabase) {
        pushToCloudNow(freshCombinedData);
      }
    }
    
    setAdsResults({
      processResults,
      totalDaysUpdated,
      datesAffected: allDatesAffected.size,
    });
    setAdsProcessing(null);
  };
  
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-purple-600 p-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-6 h-6" />Bulk Upload Ads Data
            </h2>
            <p className="text-white/70 text-sm">Import Meta (Facebook) & Google Ads daily data</p>
          </div>
          <button onClick={() => { setShowAdsBulkUpload(false); setAdsSelectedFiles([]); setAdsResults(null); }} className="p-2 hover:bg-white/20 rounded-lg text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {!adsResults ? (
            <>
              {/* Instructions */}
              <div className="bg-slate-800/50 rounded-xl p-4 mb-4">
                <h3 className="text-white font-semibold mb-2">Supported Formats</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-blue-900/30 rounded-lg p-3 border border-blue-500/30">
                    <p className="text-blue-400 font-medium mb-1">📘 Meta/Facebook Ads</p>
                    <p className="text-slate-400 text-xs">Export from Meta Ads Manager with:</p>
                    <p className="text-slate-300 text-xs mt-1">Date, Amount spent, Purchases, ROAS, Impressions, Clicks, CTR, CPC, CPM</p>
                  </div>
                  <div className="bg-amber-900/30 rounded-lg p-3 border border-amber-500/30">
                    <p className="text-amber-400 font-medium mb-1">🔶 Google Ads</p>
                    <p className="text-slate-400 text-xs">Export from Google Ads with:</p>
                    <p className="text-slate-300 text-xs mt-1">Date, Impressions, Avg CPC, Cost, Cost/conv</p>
                  </div>
                </div>
                <p className="text-slate-500 text-xs mt-3">✓ Daily data will be parsed and aggregated by date • ✓ Sales data will NOT be overwritten • ✓ Existing ads data for same dates will be replaced</p>
              </div>
              
              {/* Drop Zone */}
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${dragActive ? 'border-violet-500 bg-violet-500/10' : 'border-slate-600 hover:border-slate-500'}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <TrendingUp className="w-12 h-12 text-slate-500 mx-auto mb-3" />
                <p className="text-white font-medium mb-1">Drop CSV files here</p>
                <p className="text-slate-400 text-sm mb-3">or click to browse</p>
                <input type="file" multiple accept=".csv" onChange={handleFileSelect} className="hidden" id="ads-file-input" />
                <label htmlFor="ads-file-input" className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-white cursor-pointer inline-block">
                  Select Files
                </label>
                <p className="text-slate-500 text-xs mt-3">Supports .csv • Multiple files OK • Meta & Google can be mixed</p>
              </div>
              
              {/* Selected Files */}
              {adsSelectedFiles.length > 0 && (
                <div className="mt-4">
                  <p className="text-slate-400 text-sm mb-2">Selected Files ({adsSelectedFiles.length})</p>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {adsSelectedFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-slate-900/50 rounded-lg p-2">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="w-4 h-4 text-violet-400" />
                          <span className="text-white text-sm">{file.name}</span>
                          <span className="text-slate-500 text-xs">({(file.size / 1024).toFixed(1)} KB)</span>
                        </div>
                        <button onClick={() => removeFile(idx)} className="text-slate-400 hover:text-rose-400">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  
                  {/* Progress Bar */}
                  {adsProcessing && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-400">Processing: {adsProcessing.fileName}</span>
                        <span className="text-white font-medium">{adsProcessing.current} of {adsProcessing.total}</span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
                        <div 
                          className="bg-violet-500 h-full rounded-full transition-all duration-300 ease-out"
                          style={{ width: `${(adsProcessing.current / adsProcessing.total) * 100}%` }}
                        />
                      </div>
                      <p className="text-slate-500 text-xs text-center">
                        {Math.round((adsProcessing.current / adsProcessing.total) * 100)}% complete
                      </p>
                    </div>
                  )}
                  
                  <button
                    onClick={processFiles}
                    disabled={adsProcessing}
                    className="w-full mt-4 py-3 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-600 rounded-xl text-white font-semibold flex items-center justify-center gap-2"
                  >
                    {adsProcessing ? (
                      <><RefreshCw className="w-5 h-5 animate-spin" />Processing {adsProcessing.current}/{adsProcessing.total}...</>
                    ) : (
                      <><Upload className="w-5 h-5" />Import {adsSelectedFiles.length} File{adsSelectedFiles.length > 1 ? 's' : ''}</>
                    )}
                  </button>
                </div>
              )}
            </>
          ) : (
            /* Results */
            <div className="space-y-4">
              <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold">Import Complete</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-emerald-400">{adsResults.totalDaysUpdated}</p>
                    <p className="text-slate-400 text-xs">Days Updated</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-violet-400">{adsResults.datesAffected}</p>
                    <p className="text-slate-400 text-xs">Unique Dates</p>
                  </div>
                </div>
              </div>
              
              {/* File Results */}
              <div className="space-y-2">
                {adsResults.processResults.map((r, idx) => (
                  <div key={idx} className={`rounded-lg p-3 flex items-center justify-between ${r.status === 'success' ? 'bg-slate-800' : 'bg-rose-900/30 border border-rose-500/30'}`}>
                    <div className="flex items-center gap-3">
                      {r.status === 'success' ? (
                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-rose-400" />
                      )}
                      <div>
                        <p className="text-white text-sm">{r.file}</p>
                        {r.status === 'success' ? (
                          <p className="text-slate-400 text-xs">
                            {r.type === 'meta' ? '📘 Meta' : '🔶 Google'} • {r.daysUpdated} days • {r.dateRange?.start} to {r.dateRange?.end}
                          </p>
                        ) : (
                          <p className="text-rose-400 text-xs">{r.error}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              <button
                onClick={() => { setShowAdsBulkUpload(false); setAdsSelectedFiles([]); setAdsResults(null); }}
                className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-white font-semibold"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdsBulkUploadModal;
