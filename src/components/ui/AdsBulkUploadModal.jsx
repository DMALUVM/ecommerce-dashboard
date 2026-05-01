import React, { useState } from 'react';
import { TrendingUp, X, Upload, FileSpreadsheet, RefreshCw, CheckCircle, AlertTriangle, Eye } from 'lucide-react';
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
  const [parsedPreview, setParsedPreview] = useState(null);

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

  const parseAdsDate = (dateStr) => {
    if (!dateStr) return null;
    const str = dateStr.replace(/"/g, '').trim();

    const metaMatch = str.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
    if (metaMatch) {
      const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
      const month = months[metaMatch[1].toLowerCase().substring(0, 3)];
      const day = parseInt(metaMatch[2]);
      const year = parseInt(metaMatch[3]);
      if (month !== undefined && day && year) {
        return new Date(year, month, day).toISOString().split('T')[0];
      }
    }

    const googleMatch = str.match(/^[A-Za-z]+,\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
    if (googleMatch) {
      const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
      const month = months[googleMatch[1].toLowerCase().substring(0, 3)];
      const day = parseInt(googleMatch[2]);
      const year = parseInt(googleMatch[3]);
      if (month !== undefined && day && year) {
        return new Date(year, month, day).toISOString().split('T')[0];
      }
    }

    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) return str;

    const usMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (usMatch) {
      return new Date(parseInt(usMatch[3]), parseInt(usMatch[1]) - 1, parseInt(usMatch[2])).toISOString().split('T')[0];
    }

    return null;
  };

  const parseNumber = (val) => {
    if (val === null || val === undefined || val === 'null' || val === '') return 0;
    const str = String(val).replace(/[$,]/g, '').trim();
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  };

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

          // Find the actual header row (skip title/metadata rows)
          let headerLineIdx = 0;
          for (let i = 0; i < Math.min(lines.length, 5); i++) {
            const cols = parseCSVLine(lines[i]).map(h => h.toLowerCase().replace(/"/g, ''));
            if (cols.some(h => h === 'date' || h === 'day' || h.includes('date'))) {
              headerLineIdx = i;
              break;
            }
          }

          const headers = parseCSVLine(lines[headerLineIdx]).map(h => h.toLowerCase().replace(/"/g, ''));
          const dateColIdx = headers.findIndex(h => h === 'date' || h === 'day' || h.includes('date'));

          if (dateColIdx === -1) {
            reject(new Error('No date column found. Expected "Date" or "Day" column.'));
            return;
          }

          const isMetaAds = headers.some(h => h.includes('ad name') || h.includes('amount spent') || h.includes('roas'));
          const isGoogleAds = headers.some(h => h.includes('avg. cpc') || h.includes('avg cpc') || h.includes('cost / conv') || h.includes('cost/conv'));

          if (!isMetaAds && !isGoogleAds) {
            reject(new Error('Unrecognized format. Headers: ' + headers.slice(0, 6).join(', ')));
            return;
          }

          const getColIdx = (patterns, excludePatterns = []) => headers.findIndex(h =>
            patterns.some(p => h.includes(p)) && !excludePatterns.some(ex => h.includes(ex))
          );

          let spendIdx = -1, purchaseValueIdx = -1, purchasesIdx = -1;
          let impressionsIdx = -1, clicksIdx = -1;
          let costIdx = -1, cpcIdx = -1, costPerConvIdx = -1;
          let convIdx = -1, clicksGoogleIdx = -1, roasIdx = -1;
          const columnMapping = {};

          if (isMetaAds) {
            spendIdx = getColIdx(['amount spent', 'spend']);
            purchaseValueIdx = getColIdx(['value:paid', 'purchases value', 'purchase value', 'website purchase value'], ['roas', 'cost']);
            roasIdx = getColIdx(['roas'], []);
            purchasesIdx = getColIdx(['paid purchases', 'purchases (all)', 'purchases', 'website purchases', 'results'], ['value', 'roas', 'type', 'cost']);
            impressionsIdx = getColIdx(['impressions']);
            clicksIdx = headers.findIndex(h => h.includes('link clicks'));
            if (clicksIdx === -1) clicksIdx = getColIdx(['clicks (all)', 'clicks'], []);

            columnMapping['Spend'] = spendIdx >= 0 ? headers[spendIdx] : 'NOT FOUND';
            columnMapping['Purchases'] = purchasesIdx >= 0 ? headers[purchasesIdx] : 'NOT FOUND';
            columnMapping['Purchase Value'] = purchaseValueIdx >= 0 ? headers[purchaseValueIdx] : (roasIdx >= 0 ? `computed from ${headers[roasIdx]}` : 'NOT FOUND');
            columnMapping['Impressions'] = impressionsIdx >= 0 ? headers[impressionsIdx] : 'NOT FOUND';
            columnMapping['Clicks'] = clicksIdx >= 0 ? headers[clicksIdx] : 'NOT FOUND';
          } else {
            impressionsIdx = getColIdx(['impressions']);
            cpcIdx = getColIdx(['avg. cpc', 'avg cpc']);
            costIdx = getColIdx(['cost'], ['conv', 'click', 'value']);
            if (costIdx === -1) costIdx = headers.findIndex(h => h === 'cost');
            costPerConvIdx = getColIdx(['cost / conv', 'cost/conv', 'cost per conv']);
            convIdx = getColIdx(['conversions', 'conv.'], ['cost', 'rate', 'value', 'all']);
            clicksGoogleIdx = getColIdx(['clicks'], ['cost', 'rate']);

            columnMapping['Cost'] = costIdx >= 0 ? headers[costIdx] : 'NOT FOUND';
            columnMapping['Conversions'] = convIdx >= 0 ? headers[convIdx] : (costPerConvIdx >= 0 ? `derived from ${headers[costPerConvIdx]}` : 'NOT FOUND');
            columnMapping['Clicks'] = clicksGoogleIdx >= 0 ? headers[clicksGoogleIdx] : (cpcIdx >= 0 ? `derived from ${headers[cpcIdx]}` : 'NOT FOUND');
            columnMapping['Impressions'] = impressionsIdx >= 0 ? headers[impressionsIdx] : 'NOT FOUND';
            columnMapping['CPC'] = cpcIdx >= 0 ? headers[cpcIdx] : 'NOT FOUND';
            columnMapping['Cost/Conv'] = costPerConvIdx >= 0 ? headers[costPerConvIdx] : 'NOT FOUND';
          }

          console.log(`[AdsUpload] ${file.name}: detected=${isMetaAds ? 'Meta' : 'Google'}`);
          console.log(`[AdsUpload] Headers: ${headers.join(' | ')}`);
          console.log(`[AdsUpload] Column mapping:`, columnMapping);

          const dailyData = {};
          let rowsParsed = 0, rowsSkipped = 0, runningSpend = 0;

          for (let i = headerLineIdx + 1; i < lines.length; i++) {
            const cols = parseCSVLine(lines[i]);
            const dateStr = cols[dateColIdx];
            const parsedDate = parseAdsDate(dateStr);

            if (!parsedDate) {
              if (dateStr && dateStr.trim() && !dateStr.toLowerCase().includes('total')) {
                rowsSkipped++;
              }
              continue;
            }
            rowsParsed++;

            if (!dailyData[parsedDate]) {
              dailyData[parsedDate] = {
                metaSpend: 0, googleSpend: 0,
                metaImpressions: 0, googleImpressions: 0,
                metaClicks: 0, googleClicks: 0,
                metaPurchases: 0, googleConversions: 0,
                metaPurchaseValue: 0,
                metaROAS: 0, googleCostPerConv: 0,
                metaCPM: 0, metaCPC: 0, googleCPC: 0,
                metaCTR: 0, googleCTR: 0,
              };
            }

            if (isMetaAds) {
              const spend = spendIdx >= 0 ? parseNumber(cols[spendIdx]) : 0;
              dailyData[parsedDate].metaSpend += spend;
              dailyData[parsedDate].metaImpressions += impressionsIdx >= 0 ? parseNumber(cols[impressionsIdx]) : 0;
              dailyData[parsedDate].metaClicks += clicksIdx >= 0 ? parseNumber(cols[clicksIdx]) : 0;
              dailyData[parsedDate].metaPurchases += purchasesIdx >= 0 ? parseNumber(cols[purchasesIdx]) : 0;
              if (purchaseValueIdx >= 0) {
                dailyData[parsedDate].metaPurchaseValue += parseNumber(cols[purchaseValueIdx]);
              } else if (roasIdx >= 0 && spend > 0) {
                dailyData[parsedDate].metaPurchaseValue += spend * parseNumber(cols[roasIdx]);
              }
              runningSpend += spend;
            } else {
              const spend = costIdx >= 0 ? parseNumber(cols[costIdx]) : 0;
              dailyData[parsedDate].googleSpend += spend;
              dailyData[parsedDate].googleImpressions += impressionsIdx >= 0 ? parseNumber(cols[impressionsIdx]) : 0;
              runningSpend += spend;

              if (clicksGoogleIdx >= 0) {
                dailyData[parsedDate].googleClicks += parseNumber(cols[clicksGoogleIdx]);
              } else if (cpcIdx >= 0 && spend > 0) {
                const avgCpc = parseNumber(cols[cpcIdx]);
                if (avgCpc > 0) dailyData[parsedDate].googleClicks += Math.round(spend / avgCpc);
              }

              if (convIdx >= 0) {
                dailyData[parsedDate].googleConversions += parseNumber(cols[convIdx]);
              } else if (costPerConvIdx >= 0 && spend > 0) {
                const costPerConv = parseNumber(cols[costPerConvIdx]);
                if (costPerConv > 0) dailyData[parsedDate].googleConversions += Math.round(spend / costPerConv);
              }

              if (cpcIdx >= 0) dailyData[parsedDate].googleCPC = parseNumber(cols[cpcIdx]);
              if (costPerConvIdx >= 0) dailyData[parsedDate].googleCostPerConv = parseNumber(cols[costPerConvIdx]);
            }
          }

          console.log(`[AdsUpload] ${file.name}: ${rowsParsed} rows parsed, ${rowsSkipped} skipped, total spend: $${runningSpend.toFixed(2)}`);

          // Derived metrics
          Object.keys(dailyData).forEach(date => {
            const d = dailyData[date];
            if (d.metaImpressions > 0) {
              d.metaCPM = (d.metaSpend / d.metaImpressions) * 1000;
              d.metaCTR = (d.metaClicks / d.metaImpressions) * 100;
            }
            if (d.metaClicks > 0) d.metaCPC = d.metaSpend / d.metaClicks;
            if (d.metaSpend > 0 && d.metaPurchaseValue > 0) d.metaROAS = d.metaPurchaseValue / d.metaSpend;
            if (d.googleImpressions > 0) d.googleCTR = (d.googleClicks / d.googleImpressions) * 100;
            if (d.googleClicks > 0) d.googleCPC = d.googleSpend / d.googleClicks;
          });

          const dates = Object.keys(dailyData).sort();
          if (dates.length === 0) {
            reject(new Error('No valid daily data found'));
            return;
          }

          // Sample: first 3 days for preview
          const sampleDays = dates.slice(0, 3).map(d => {
            const day = dailyData[d];
            return {
              date: d,
              spend: isMetaAds ? day.metaSpend : day.googleSpend,
              clicks: isMetaAds ? day.metaClicks : day.googleClicks,
              conversions: isMetaAds ? day.metaPurchases : day.googleConversions,
            };
          });

          resolve({
            type: isMetaAds ? 'meta' : 'google',
            dailyData,
            dateRange: { start: dates[0], end: dates[dates.length - 1] },
            daysCount: dates.length,
            columnMapping,
            sampleDays,
            rowsParsed,
            rowsSkipped,
          });
        } catch (err) {
          reject(new Error(`Parse error: ${err.message}`));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  // Phase 1: Parse files and show preview (don't apply yet)
  const analyzeFiles = async () => {
    const totalFiles = adsSelectedFiles.length;
    const processResults = [];
    const allParsedFiles = [];
    let totalDaysUpdated = 0;

    for (let i = 0; i < adsSelectedFiles.length; i++) {
      const file = adsSelectedFiles[i];
      setAdsProcessing({ current: i + 1, total: totalFiles, fileName: file.name });
      try {
        const parsed = await parseAdsFile(file);
        let totalSpend = 0;
        Object.values(parsed.dailyData).forEach(d => {
          totalSpend += (parsed.type === 'meta' ? d.metaSpend : d.googleSpend) || 0;
        });
        allParsedFiles.push(parsed);
        processResults.push({
          file: file.name, status: 'success', type: parsed.type,
          daysUpdated: parsed.daysCount, dateRange: parsed.dateRange,
          totalSpend,
          columnMapping: parsed.columnMapping,
          sampleDays: parsed.sampleDays,
          rowsParsed: parsed.rowsParsed,
          rowsSkipped: parsed.rowsSkipped,
        });
        totalDaysUpdated += parsed.daysCount;
      } catch (err) {
        console.error('Error processing ads file:', file.name, err);
        processResults.push({ file: file.name, status: 'error', error: err.message });
      }
    }

    setAdsProcessing(null);
    setParsedPreview({ files: allParsedFiles, results: processResults, totalDaysUpdated });
  };

  // Phase 2: Apply parsed data to state (called after user confirms preview)
  const applyParsedData = () => {
    const { files: allParsedFiles, results: processResults, totalDaysUpdated } = parsedPreview;
    const allDatesAffected = new Set();
    allParsedFiles.forEach(p => Object.keys(p.dailyData).forEach(d => allDatesAffected.add(d)));

    // Merge into daily data
    setAllDaysData(prev => {
      const updatedDays = { ...prev };
      for (const parsed of allParsedFiles) {
        Object.entries(parsed.dailyData).forEach(([date, adsData]) => {
          const existingDay = updatedDays[date] || {
            total: { revenue: 0, units: 0, cogs: 0, adSpend: 0, netProfit: 0 },
            amazon: { revenue: 0, units: 0, cogs: 0, adSpend: 0, netProfit: 0 },
            shopify: { revenue: 0, units: 0, cogs: 0, adSpend: 0, metaSpend: 0, googleSpend: 0, netProfit: 0 },
          };

          const newMetaSpend = parsed.type === 'meta' ? adsData.metaSpend : (existingDay.shopify?.metaSpend || 0);
          const newGoogleSpend = parsed.type === 'google' ? adsData.googleSpend : (existingDay.shopify?.googleSpend || 0);
          const dtcAdSpend = newMetaSpend + newGoogleSpend;

          const adsMetrics = {
            ...(existingDay.shopify?.adsMetrics || {}),
            ...(parsed.type === 'meta' ? {
              metaImpressions: adsData.metaImpressions, metaClicks: adsData.metaClicks,
              metaPurchases: adsData.metaPurchases, metaPurchaseValue: adsData.metaPurchaseValue,
              metaROAS: adsData.metaROAS, metaCPM: adsData.metaCPM,
              metaCPC: adsData.metaCPC, metaCTR: adsData.metaCTR,
            } : {}),
            ...(parsed.type === 'google' ? {
              googleImpressions: adsData.googleImpressions, googleClicks: adsData.googleClicks,
              googleConversions: adsData.googleConversions, googleCTR: adsData.googleCTR,
              googleCPC: adsData.googleCPC, googleCostPerConv: adsData.googleCostPerConv,
            } : {}),
          };

          const shopRev = existingDay.shopify?.revenue || 0;
          const shopCogs = existingDay.shopify?.cogs || 0;
          const shopThreepl = existingDay.shopify?.threeplCosts || 0;
          const shopProfit = shopRev - shopCogs - dtcAdSpend - shopThreepl;
          const amzProfit = existingDay.amazon?.netProfit || 0;

          updatedDays[date] = {
            ...existingDay,
            shopify: {
              ...existingDay.shopify,
              adSpend: dtcAdSpend, metaSpend: newMetaSpend, googleSpend: newGoogleSpend,
              netProfit: shopProfit, adsMetrics,
            },
            metaSpend: newMetaSpend, metaAds: newMetaSpend,
            googleSpend: newGoogleSpend, googleAds: newGoogleSpend,
            total: {
              ...existingDay.total,
              adSpend: dtcAdSpend + (existingDay.amazon?.adSpend || 0),
              netProfit: amzProfit + shopProfit,
            },
          };
        });
      }
      try { lsSet('ecommerce_daily_sales_v1', JSON.stringify(updatedDays)); } catch (e) {}

      let storedMeta = 0, storedGoogle = 0;
      allDatesAffected.forEach(date => {
        storedMeta += updatedDays[date]?.shopify?.metaSpend || 0;
        storedGoogle += updatedDays[date]?.shopify?.googleSpend || 0;
      });
      console.log(`[AdsUpload] Applied — Meta: $${storedMeta.toFixed(2)}, Google: $${storedGoogle.toFixed(2)}`);

      return updatedDays;
    });

    // Update weekly data
    if (setAllWeeksData) {
      const weeksToUpdate = new Set();
      allDatesAffected.forEach(dateStr => {
        const d = new Date(dateStr + 'T12:00:00');
        const dayOfWeek = d.getDay();
        const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
        const weekEnd = new Date(d);
        weekEnd.setDate(weekEnd.getDate() + daysUntilSunday);
        weeksToUpdate.add(weekEnd.toISOString().split('T')[0]);
      });

      setAllWeeksData(prev => {
        const updatedWeeks = { ...prev };
        const adsByDate = {};
        for (const parsed of allParsedFiles) {
          Object.entries(parsed.dailyData).forEach(([date, d]) => {
            if (!adsByDate[date]) adsByDate[date] = { metaSpend: 0, googleSpend: 0 };
            if (parsed.type === 'meta') adsByDate[date].metaSpend += d.metaSpend || 0;
            else adsByDate[date].googleSpend += d.googleSpend || 0;
          });
        }

        weeksToUpdate.forEach(weekKey => {
          if (!updatedWeeks[weekKey]) return;
          const weekEnd = new Date(weekKey + 'T12:00:00');
          let weekMeta = 0, weekGoogle = 0;
          for (let i = 6; i >= 0; i--) {
            const dayDate = new Date(weekEnd);
            dayDate.setDate(weekEnd.getDate() - i);
            const dayKey = dayDate.toISOString().split('T')[0];
            if (adsByDate[dayKey]) {
              weekMeta += adsByDate[dayKey].metaSpend || 0;
              weekGoogle += adsByDate[dayKey].googleSpend || 0;
            }
          }
          const existingShopify = updatedWeeks[weekKey].shopify || {};
          const totalAds = weekMeta + weekGoogle;
          const shopRev = existingShopify.revenue || 0;
          const shopProfit = shopRev - (existingShopify.cogs || 0) - totalAds - (existingShopify.threeplCosts || 0);
          updatedWeeks[weekKey] = {
            ...updatedWeeks[weekKey],
            shopify: {
              ...existingShopify,
              metaSpend: weekMeta, metaAds: weekMeta,
              googleSpend: weekGoogle, googleAds: weekGoogle,
              adSpend: totalAds, netProfit: shopProfit,
            },
            total: {
              ...updatedWeeks[weekKey].total,
              adSpend: (updatedWeeks[weekKey].amazon?.adSpend || 0) + totalAds,
              netProfit: (updatedWeeks[weekKey].amazon?.netProfit || 0) + shopProfit,
            },
          };
        });
        try { lsSet('ecommerce_weekly_sales_v1', JSON.stringify(updatedWeeks)); } catch (e) {}
        return updatedWeeks;
      });
    }

    if (session?.user?.id && supabase) {
      setTimeout(() => pushToCloudNow(combinedData), 500);
    }

    setAdsResults({
      processResults,
      totalDaysUpdated,
      datesAffected: allDatesAffected.size,
    });
    setParsedPreview(null);
  };

  const resetAll = () => {
    setShowAdsBulkUpload(false);
    setAdsSelectedFiles([]);
    setAdsResults(null);
    setParsedPreview(null);
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
          <button onClick={resetAll} className="p-2 hover:bg-white/20 rounded-lg text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {parsedPreview ? (
            /* ═══ PREVIEW STEP ═══ */
            <div className="space-y-4">
              <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Eye className="w-5 h-5 text-amber-400" />
                  <span className="text-amber-400 font-semibold">Review Before Applying</span>
                </div>
                <p className="text-slate-400 text-sm">Verify the column mapping and totals are correct before saving.</p>
              </div>

              {parsedPreview.results.map((r, idx) => (
                <div key={idx} className={`rounded-xl border p-4 ${r.status === 'success' ? 'bg-slate-800/50 border-slate-700' : 'bg-rose-900/30 border-rose-500/30'}`}>
                  {r.status === 'success' ? (
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-white font-medium text-sm">{r.file}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${r.type === 'meta' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                          {r.type === 'meta' ? 'Meta' : 'Google'}
                        </span>
                      </div>

                      {/* Column mapping */}
                      <div className="bg-slate-900/50 rounded-lg p-3 mb-3">
                        <p className="text-slate-500 text-xs font-medium mb-2 uppercase tracking-wider">Column Mapping</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          {Object.entries(r.columnMapping).map(([field, col]) => (
                            <div key={field} className="flex justify-between gap-2">
                              <span className="text-slate-400">{field}</span>
                              <span className={`font-mono truncate ${col === 'NOT FOUND' ? 'text-rose-400' : 'text-emerald-400'}`}>{col}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Sample data */}
                      {r.sampleDays && r.sampleDays.length > 0 && (
                        <div className="bg-slate-900/50 rounded-lg p-3 mb-3">
                          <p className="text-slate-500 text-xs font-medium mb-2 uppercase tracking-wider">Sample Days (first 3)</p>
                          <div className="grid grid-cols-4 gap-1 text-xs">
                            <span className="text-slate-500">Date</span>
                            <span className="text-slate-500">Spend</span>
                            <span className="text-slate-500">Clicks</span>
                            <span className="text-slate-500">Conv</span>
                            {r.sampleDays.map((s, i) => (
                              <React.Fragment key={i}>
                                <span className="text-slate-300">{s.date}</span>
                                <span className="text-white">${s.spend.toFixed(2)}</span>
                                <span className="text-white">{Math.round(s.clicks)}</span>
                                <span className="text-white">{Math.round(s.conversions)}</span>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Summary */}
                      <div className="flex justify-between items-center text-sm border-t border-slate-700 pt-3">
                        <span className="text-slate-400">
                          {r.rowsParsed} rows parsed{r.rowsSkipped > 0 ? `, ${r.rowsSkipped} skipped` : ''} &bull; {r.daysUpdated} days &bull; {r.dateRange?.start} to {r.dateRange?.end}
                        </span>
                        <span className="text-white font-bold text-lg">${(r.totalSpend || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                      <div>
                        <p className="text-white text-sm font-medium">{r.file}</p>
                        <p className="text-rose-400 text-xs">{r.error}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <div className="flex gap-3">
                <button
                  onClick={applyParsedData}
                  disabled={!parsedPreview.files.length}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 rounded-xl text-white font-semibold flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" />
                  Apply to Dashboard
                </button>
                <button
                  onClick={() => { setParsedPreview(null); setAdsSelectedFiles([]); }}
                  className="py-3 px-6 bg-slate-700 hover:bg-slate-600 rounded-xl text-white font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : !adsResults ? (
            /* ═══ UPLOAD STEP ═══ */
            <>
              <div className="bg-slate-800/50 rounded-xl p-4 mb-4">
                <h3 className="text-white font-semibold mb-2">Supported Formats</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-blue-900/30 rounded-lg p-3 border border-blue-500/30">
                    <p className="text-blue-400 font-medium mb-1">Meta/Facebook Ads</p>
                    <p className="text-slate-400 text-xs">Export from Meta Ads Manager with:</p>
                    <p className="text-slate-300 text-xs mt-1">Date, Amount spent, Purchases, ROAS, Impressions, Link clicks</p>
                  </div>
                  <div className="bg-amber-900/30 rounded-lg p-3 border border-amber-500/30">
                    <p className="text-amber-400 font-medium mb-1">Google Ads</p>
                    <p className="text-slate-400 text-xs">Export from Google Ads with:</p>
                    <p className="text-slate-300 text-xs mt-1">Day, Cost, Conversions, Impressions, Clicks, Avg. CPC</p>
                  </div>
                </div>
              </div>

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
                <p className="text-slate-500 text-xs mt-3">Supports .csv &bull; Multiple files OK &bull; Meta & Google can be mixed</p>
              </div>

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

                  {adsProcessing && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-400">Analyzing: {adsProcessing.fileName}</span>
                        <span className="text-white font-medium">{adsProcessing.current} of {adsProcessing.total}</span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
                        <div className="bg-violet-500 h-full rounded-full transition-all" style={{ width: `${(adsProcessing.current / adsProcessing.total) * 100}%` }} />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={analyzeFiles}
                    disabled={adsProcessing}
                    className="w-full mt-4 py-3 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-600 rounded-xl text-white font-semibold flex items-center justify-center gap-2"
                  >
                    {adsProcessing ? (
                      <><RefreshCw className="w-5 h-5 animate-spin" />Analyzing...</>
                    ) : (
                      <><Eye className="w-5 h-5" />Analyze {adsSelectedFiles.length} File{adsSelectedFiles.length > 1 ? 's' : ''}</>
                    )}
                  </button>
                </div>
              )}
            </>
          ) : (
            /* ═══ RESULTS STEP ═══ */
            <div className="space-y-4">
              <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold">Applied Successfully</span>
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

              <div className="space-y-2">
                {adsResults.processResults.map((r, idx) => (
                  <div key={idx} className={`rounded-lg p-3 ${r.status === 'success' ? 'bg-slate-800' : 'bg-rose-900/30 border border-rose-500/30'}`}>
                    <div className="flex items-center gap-3">
                      {r.status === 'success' ? (
                        <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                      )}
                      <div>
                        <p className="text-white text-sm">{r.file}</p>
                        {r.status === 'success' ? (
                          <p className="text-slate-400 text-xs">
                            {r.type === 'meta' ? 'Meta' : 'Google'} &bull; {r.daysUpdated} days &bull; ${(r.totalSpend || 0).toFixed(2)} total spend &bull; {r.dateRange?.start} to {r.dateRange?.end}
                          </p>
                        ) : (
                          <p className="text-rose-400 text-xs">{r.error}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={resetAll} className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-white font-semibold">
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
