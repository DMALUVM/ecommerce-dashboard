import React, { useState, useCallback } from 'react';
import { Brain, X, Upload, CheckCircle, AlertTriangle, Search, ShoppingCart, Target, Eye, TrendingUp, BarChart3, Check } from 'lucide-react';
import * as XLSX from 'xlsx';

// ============ REPORT TYPES ============

const REPORT_TYPES = [
  { key: 'dailyOverview', label: 'Daily Ads Overview', icon: TrendingUp, color: 'yellow', accept: '.csv', desc: 'Seller Central daily ads overview (recent 30d)' },
  { key: 'historicalDaily', label: 'Historical Daily Data', icon: BarChart3, color: 'indigo', accept: '.csv', desc: 'Historical daily ads data (months/years)' },
  { key: 'spSearchTerms', label: 'SP Search Terms', icon: Search, color: 'blue', accept: '.xlsx,.csv', desc: 'Sponsored Products Search Term Report' },
  { key: 'spAdvertised', label: 'SP Advertised Products', icon: ShoppingCart, color: 'green', desc: 'Sponsored Products Advertised Product Report' },
  { key: 'spPlacement', label: 'SP Placements', icon: BarChart3, color: 'purple', desc: 'Sponsored Products Placement Report' },
  { key: 'spTargeting', label: 'SP Targeting', icon: Target, color: 'orange', desc: 'Sponsored Products Targeting Report' },
  { key: 'sbSearchTerms', label: 'SB Search Terms', icon: Search, color: 'cyan', desc: 'Sponsored Brands Search Term Report' },
  { key: 'sdCampaign', label: 'SD Campaigns', icon: Eye, color: 'pink', desc: 'Sponsored Display Campaign Report' },
  { key: 'businessReport', label: 'Business Report', icon: TrendingUp, color: 'emerald', accept: '.csv', desc: 'Amazon Business Report (by ASIN or child ASIN)' },
  { key: 'searchQueryPerf', label: 'Search Query Perf', icon: Search, color: 'amber', accept: '.csv', desc: 'Search Query Performance (Brand View)' },
];

// ============ PARSERS ============

const parseXlsx = async (file) => {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: null });
};

const parseCSVLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
};

const parseCSV = (text) => {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes('asin') || lower.includes('date') || lower.includes('search query')) {
      headerIdx = i;
      break;
    }
  }
  const headers = parseCSVLine(lines[headerIdx]);
  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 3) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = cols[idx] || null; });
    rows.push(row);
  }
  return rows;
};

const num = (v) => {
  if (v === null || v === undefined || v === '' || v === '--') return 0;
  const s = String(v).replace(/[$,%]/g, '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

const normalizeDate = (d) => {
  if (!d) return null;
  const s = String(d).replace(/"/g, '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split('/');
    return `${yyyy}-${mm}-${dd}`;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const parts = s.split('/');
    return `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
  }
  return s;
};

// ============ AUTO-DETECT REPORT TYPE ============

const detectReportType = (rows, fileName) => {
  if (!rows || rows.length === 0) return null;
  const headers = Object.keys(rows[0]).map(h => h.toLowerCase());
  const headerStr = headers.join(' ');
  const fileNameLower = fileName.toLowerCase();
  
  // Daily Ads Overview detection
  if ((headers.includes('date') || headers.includes('\"date\"')) && 
      (headerStr.includes('spend') || headerStr.includes('roas') || headerStr.includes('acos'))) {
    // Check if it's historical (more than 60 days) or recent
    if (rows.length > 60) return 'historicalDaily';
    return 'dailyOverview';
  }
  
  // SP Search Terms
  if (headerStr.includes('customer search term') || headerStr.includes('search term') && headerStr.includes('campaign')) {
    if (headerStr.includes('brand') || fileNameLower.includes('sb') || fileNameLower.includes('brand')) {
      return 'sbSearchTerms';
    }
    return 'spSearchTerms';
  }
  
  // SP Advertised Products
  if (headerStr.includes('advertised asin') || headerStr.includes('advertised sku')) {
    return 'spAdvertised';
  }
  
  // SP Placement
  if (headerStr.includes('placement') && (headerStr.includes('top of search') || headerStr.includes('product pages'))) {
    return 'spPlacement';
  }
  
  // SP Targeting
  if (headerStr.includes('targeting') && headerStr.includes('match type')) {
    return 'spTargeting';
  }
  
  // SD Campaign
  if (headerStr.includes('display') || (fileNameLower.includes('sd') && headerStr.includes('campaign'))) {
    return 'sdCampaign';
  }
  
  // Business Report
  if (headerStr.includes('(parent)') || headerStr.includes('(child)') || 
      (headerStr.includes('asin') && headerStr.includes('sessions') && headerStr.includes('page views'))) {
    return 'businessReport';
  }
  
  // Search Query Performance
  if (headerStr.includes('search query') && headerStr.includes('search query score')) {
    return 'searchQueryPerf';
  }
  
  return null;
};

// ============ AGGREGATION FUNCTIONS ============

const aggregateDailyOverview = (rows) => {
  const days = rows.map(r => ({
    date: normalizeDate(r['date'] || r['Date']),
    spend: num(r['Spend']),
    revenue: num(r['Revenue']),
    orders: num(r['Orders']),
    conversions: num(r['Conversions']),
    roas: num(r['ROAS']),
    acos: num(r['ACOS']),
    impressions: num(r['Impressions']),
    clicks: num(r['Clicks']),
    ctr: num(r['CTR']),
    cpc: num(r['Avg CPC']),
    convRate: num(r['Conv Rate']),
    tacos: num(r['Total ACOS (TACOS)']),
    totalUnits: num(r['Total Units Ordered']),
    totalRevenue: num(r['Total Revenue']),
  })).filter(d => d.date && d.spend > 0).sort((a, b) => a.date.localeCompare(b.date));

  if (days.length === 0) return null;

  const monthly = {};
  days.forEach(d => {
    const m = d.date.substring(0, 7);
    if (!monthly[m]) monthly[m] = { month: m, spend: 0, revenue: 0, totalRevenue: 0, orders: 0, clicks: 0, impressions: 0, days: 0 };
    monthly[m].spend += d.spend;
    monthly[m].revenue += d.revenue;
    monthly[m].totalRevenue += d.totalRevenue;
    monthly[m].orders += d.orders;
    monthly[m].clicks += d.clicks;
    monthly[m].impressions += d.impressions;
    monthly[m].days++;
  });
  const monthlyArr = Object.values(monthly).map(m => ({
    ...m,
    roas: m.spend > 0 ? m.revenue / m.spend : 0,
    acos: m.revenue > 0 ? (m.spend / m.revenue) * 100 : 0,
    tacos: m.totalRevenue > 0 ? (m.spend / m.totalRevenue) * 100 : 0,
  })).sort((a, b) => a.month.localeCompare(b.month));

  const totalSpend = days.reduce((s, d) => s + d.spend, 0);
  const totalAdRevenue = days.reduce((s, d) => s + d.revenue, 0);
  const totalRevenue = days.reduce((s, d) => s + d.totalRevenue, 0);
  const totalOrders = days.reduce((s, d) => s + d.orders, 0);

  return {
    dateRange: { from: days[0].date, to: days[days.length - 1].date },
    totalDays: days.length,
    totalSpend, totalAdRevenue, totalRevenue, totalOrders,
    overallROAS: totalSpend > 0 ? totalAdRevenue / totalSpend : 0,
    overallACOS: totalAdRevenue > 0 ? (totalSpend / totalAdRevenue) * 100 : 0,
    overallTACOS: totalRevenue > 0 ? (totalSpend / totalRevenue) * 100 : 0,
    monthly: monthlyArr,
    days: days,
  };
};

const aggregateSPSearchTerms = (rows) => {
  const terms = {};
  rows.forEach(r => {
    const term = r['Customer Search Term'] || r['Search Term'] || '';
    if (!term) return;
    if (!terms[term]) terms[term] = { term, spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 };
    terms[term].spend += num(r['Spend'] || r['Cost']);
    terms[term].sales += num(r['7 Day Total Sales'] || r['Sales']);
    terms[term].orders += num(r['7 Day Total Orders (#)'] || r['Orders']);
    terms[term].clicks += num(r['Clicks']);
    terms[term].impressions += num(r['Impressions']);
  });
  const arr = Object.values(terms).map(t => ({
    ...t, acos: t.sales > 0 ? (t.spend / t.sales) * 100 : 999, roas: t.spend > 0 ? t.sales / t.spend : 0
  }));
  return {
    totalTerms: arr.length,
    topBySpend: arr.sort((a, b) => b.spend - a.spend).slice(0, 20),
    topBySales: [...arr].sort((a, b) => b.sales - a.sales).slice(0, 20),
    worstACOS: arr.filter(t => t.spend > 10).sort((a, b) => b.acos - a.acos).slice(0, 20),
    bestACOS: arr.filter(t => t.sales > 0).sort((a, b) => a.acos - b.acos).slice(0, 20),
  };
};

const aggregateSPAdvertised = (rows) => {
  const products = {};
  rows.forEach(r => {
    const asin = r['Advertised ASIN'] || r['ASIN'] || '';
    if (!asin) return;
    if (!products[asin]) products[asin] = { asin, sku: r['Advertised SKU'] || '', spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 };
    products[asin].spend += num(r['Spend'] || r['Cost']);
    products[asin].sales += num(r['7 Day Total Sales'] || r['Sales']);
    products[asin].orders += num(r['7 Day Total Orders (#)'] || r['Orders']);
    products[asin].clicks += num(r['Clicks']);
    products[asin].impressions += num(r['Impressions']);
  });
  return Object.values(products).map(p => ({
    ...p, acos: p.sales > 0 ? (p.spend / p.sales) * 100 : 999, roas: p.spend > 0 ? p.sales / p.spend : 0
  })).sort((a, b) => b.spend - a.spend);
};

const aggregateSPPlacement = (rows) => {
  const placements = {};
  rows.forEach(r => {
    const placement = r['Placement'] || r['Placement Type'] || 'Unknown';
    if (!placements[placement]) placements[placement] = { placement, spend: 0, sales: 0, clicks: 0, impressions: 0 };
    placements[placement].spend += num(r['Spend'] || r['Cost']);
    placements[placement].sales += num(r['7 Day Total Sales'] || r['Sales']);
    placements[placement].clicks += num(r['Clicks']);
    placements[placement].impressions += num(r['Impressions']);
  });
  return {
    byPlacement: Object.values(placements).map(p => ({
      ...p, acos: p.sales > 0 ? (p.spend / p.sales) * 100 : 999, roas: p.spend > 0 ? p.sales / p.spend : 0
    })).sort((a, b) => b.spend - a.spend)
  };
};

const aggregateSPTargeting = (rows) => {
  const targets = {};
  rows.forEach(r => {
    const targeting = r['Targeting'] || r['Keyword'] || '';
    const matchType = r['Match Type'] || '';
    const key = `${targeting}|${matchType}`;
    if (!targets[key]) targets[key] = { targeting, matchType, spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 };
    targets[key].spend += num(r['Spend'] || r['Cost']);
    targets[key].sales += num(r['7 Day Total Sales'] || r['Sales']);
    targets[key].orders += num(r['7 Day Total Orders (#)'] || r['Orders']);
    targets[key].clicks += num(r['Clicks']);
    targets[key].impressions += num(r['Impressions']);
  });
  return Object.values(targets).map(t => ({
    ...t, acos: t.sales > 0 ? (t.spend / t.sales) * 100 : 999, roas: t.spend > 0 ? t.sales / t.spend : 0
  })).sort((a, b) => b.spend - a.spend);
};

const aggregateSBSearchTerms = (rows) => aggregateSPSearchTerms(rows);
const aggregateSDCampaign = (rows) => aggregateSPAdvertised(rows);

const aggregateBusinessReport = (rows) => {
  return rows.map(r => ({
    asin: r['(Parent) ASIN'] || r['(Child) ASIN'] || r['ASIN'] || '',
    title: r['Title'] || '',
    sessions: num(r['Sessions']),
    pageViews: num(r['Page Views']),
    buyBoxPct: num(r['Buy Box Percentage']),
    unitsOrdered: num(r['Units Ordered']),
    unitSessionPct: num(r['Unit Session Percentage']),
    orderedRevenue: num(r['Ordered Product Sales']),
  })).filter(r => r.asin).sort((a, b) => b.orderedRevenue - a.orderedRevenue);
};

const aggregateSearchQueryPerf = (rows) => {
  return rows.map(r => ({
    query: r['Search Query'] || '',
    queryScore: num(r['Search Query Score']),
    impressions: num(r['Impressions']),
    clicks: num(r['Clicks']),
    cartAdds: num(r['Cart Adds']),
    purchases: num(r['Purchases']),
  })).filter(r => r.query).sort((a, b) => b.impressions - a.impressions);
};

// ============ BUILD AI CONTEXT ============

export const buildAdsIntelContext = (intelData) => {
  if (!intelData || !intelData.lastUpdated) return '';
  
  let context = `\n=== AMAZON ADS INTELLIGENCE (Updated: ${new Date(intelData.lastUpdated).toLocaleDateString()}) ===\n`;

  if (intelData.dailyOverview) {
    const d = intelData.dailyOverview;
    context += `\nRECENT DAILY (${d.dateRange.from} to ${d.dateRange.to}, ${d.totalDays}d): Spend $${Math.round(d.totalSpend)} | Ad Rev $${Math.round(d.totalAdRevenue)} | ROAS ${d.overallROAS.toFixed(2)} | ACOS ${d.overallACOS.toFixed(1)}%\n`;
  }

  if (intelData.historicalDaily) {
    const d = intelData.historicalDaily;
    context += `\nHISTORICAL (${d.dateRange.from} to ${d.dateRange.to}, ${d.totalDays}d): Spend $${Math.round(d.totalSpend)} | Ad Rev $${Math.round(d.totalAdRevenue)} | ROAS ${d.overallROAS.toFixed(2)}\n`;
  }

  if (intelData.spSearchTerms) {
    context += `\nSP SEARCH TERMS: ${intelData.spSearchTerms.totalTerms} terms tracked\n`;
    context += `Top spending: ${intelData.spSearchTerms.topBySpend.slice(0,5).map(t => `"${t.term}" $${Math.round(t.spend)}`).join(', ')}\n`;
  }

  return context;
};

// ============ COMPONENT ============

const AmazonAdsIntelModal = ({
  show,
  setShow,
  adsIntelData,
  setAdsIntelData,
  combinedData,
  queueCloudSave,
  allDaysData,
  setAllDaysData,
  amazonCampaigns,
  setAmazonCampaigns,
  setToast,
  onGoToAnalyst,
}) => {
  const [pendingFiles, setPendingFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState([]);
  const [dataSaved, setDataSaved] = useState(false);

  if (!show) return null;

  const handleFileDrop = useCallback(async (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || e.target?.files || []);
    if (files.length === 0) return;

    const newPending = [];
    for (const file of files) {
      try {
        let rows;
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          rows = await parseXlsx(file);
        } else {
          const text = await file.text();
          rows = parseCSV(text);
        }
        const detectedType = detectReportType(rows, file.name);
        newPending.push({
          file,
          rows,
          detectedType,
          rowCount: rows.length,
        });
      } catch (err) {
        console.error('Error reading file:', err);
      }
    }
    setPendingFiles(prev => [...prev, ...newPending]);
    setResults([]);
    setDataSaved(false);
  }, []);

  const removeFile = (idx) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
    setResults([]);
    setDataSaved(false);
  };

  const processAndSave = async () => {
    if (pendingFiles.length === 0) return;
    
    setProcessing(true);
    const newIntel = { ...adsIntelData, lastUpdated: new Date().toISOString() };
    const processResults = [];
    const newDaysData = { ...allDaysData };

    for (const pf of pendingFiles) {
      if (!pf.detectedType) {
        processResults.push({ name: pf.file.name, status: 'error', error: 'Unknown file type' });
        continue;
      }

      try {
        let summary;
        switch (pf.detectedType) {
          case 'dailyOverview': summary = aggregateDailyOverview(pf.rows); break;
          case 'historicalDaily': summary = aggregateDailyOverview(pf.rows); break;
          case 'spSearchTerms': summary = aggregateSPSearchTerms(pf.rows); break;
          case 'spAdvertised': summary = aggregateSPAdvertised(pf.rows); break;
          case 'spPlacement': summary = aggregateSPPlacement(pf.rows); break;
          case 'spTargeting': summary = aggregateSPTargeting(pf.rows); break;
          case 'sbSearchTerms': summary = aggregateSBSearchTerms(pf.rows); break;
          case 'sdCampaign': summary = aggregateSDCampaign(pf.rows); break;
          case 'businessReport': summary = aggregateBusinessReport(pf.rows); break;
          case 'searchQueryPerf': summary = aggregateSearchQueryPerf(pf.rows); break;
        }

        if (summary) {
          newIntel[pf.detectedType] = summary;
          
          // Also write daily data to allDaysData for dashboard tracking
          if ((pf.detectedType === 'dailyOverview' || pf.detectedType === 'historicalDaily') && summary.days) {
            summary.days.forEach(day => {
              if (!newDaysData[day.date]) newDaysData[day.date] = {};
              newDaysData[day.date].amazonAdSpend = day.spend;
              newDaysData[day.date].amazonAdRevenue = day.revenue;
              newDaysData[day.date].amazonAdOrders = day.orders;
              newDaysData[day.date].amazonROAS = day.roas;
              newDaysData[day.date].amazonACOS = day.acos;
            });
          }
        }

        const label = REPORT_TYPES.find(rt => rt.key === pf.detectedType)?.label || pf.detectedType;
        processResults.push({ name: pf.file.name, status: 'success', rows: pf.rowCount, type: label });
      } catch (err) {
        processResults.push({ name: pf.file.name, status: 'error', error: err.message });
      }
    }

    // Save to state
    setAdsIntelData(newIntel);
    setAllDaysData(newDaysData);
    
    // Update amazonCampaigns lastUpdated for data health tracking
    if (setAmazonCampaigns) {
      setAmazonCampaigns(prev => ({
        ...prev,
        lastUpdated: new Date().toISOString()
      }));
    }
    
    // Queue cloud save
    if (queueCloudSave) queueCloudSave();
    
    setResults(processResults);
    setProcessing(false);
    setDataSaved(true);
    
    // Show toast
    const successCount = processResults.filter(r => r.status === 'success').length;
    if (setToast && successCount > 0) {
      setToast({ message: `✓ ${successCount} file(s) saved to ads intelligence`, type: 'success' });
    }
  };

  const handleClose = () => {
    setShow(false);
    setPendingFiles([]);
    setResults([]);
    setDataSaved(false);
  };

  const handleSaveAndClose = async () => {
    if (pendingFiles.length > 0 && !dataSaved) {
      await processAndSave();
    }
    handleClose();
  };

  const handleGenerateActionPlan = async () => {
    if (pendingFiles.length > 0 && !dataSaved) {
      await processAndSave();
    }
    handleClose();
    if (onGoToAnalyst) onGoToAnalyst();
  };

  const hasExistingData = adsIntelData?.lastUpdated;
  const existingDataSummary = hasExistingData ? [
    adsIntelData.dailyOverview && `${adsIntelData.dailyOverview.totalDays}d overview`,
    adsIntelData.historicalDaily && `${adsIntelData.historicalDaily.totalDays}d historical`,
    adsIntelData.spSearchTerms && `${adsIntelData.spSearchTerms.totalTerms} search terms`,
    adsIntelData.spAdvertised?.length && `${adsIntelData.spAdvertised.length} products`,
  ].filter(Boolean).join(' • ') : '';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 p-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Brain className="w-6 h-6" />Amazon Ads Intelligence
            </h2>
            <p className="text-white/70 text-sm">Upload reports for tracking and AI analysis</p>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-white/20 rounded-lg text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {/* Existing Data Status */}
          {hasExistingData && (
            <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-lg p-3">
              <p className="text-emerald-400 font-medium flex items-center gap-2">
                <Check className="w-4 h-4" />
                Intel loaded · {new Date(adsIntelData.lastUpdated).toLocaleDateString()}
              </p>
              {existingDataSummary && (
                <p className="text-slate-400 text-xs mt-1">{existingDataSummary}</p>
              )}
            </div>
          )}

          {/* Drop Zone */}
          <div
            onDrop={handleFileDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById('ads-intel-file-input').click()}
            className="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center hover:border-slate-500 cursor-pointer transition-colors"
          >
            <Upload className="w-10 h-10 text-slate-500 mx-auto mb-3" />
            <p className="text-white font-medium">Drop more files or click to add</p>
            <p className="text-slate-400 text-sm mt-1">CSV & XLSX — search terms, placements, targeting, business reports, daily overviews, and more</p>
            <input
              id="ads-intel-file-input"
              type="file"
              multiple
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileDrop}
            />
          </div>

          {/* Pending Files */}
          {pendingFiles.length > 0 && (
            <div>
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">{pendingFiles.length} FILE{pendingFiles.length > 1 ? 'S' : ''} DETECTED</p>
              <div className="space-y-2">
                {pendingFiles.map((pf, idx) => {
                  const rt = REPORT_TYPES.find(r => r.key === pf.detectedType);
                  return (
                    <div key={idx} className="flex items-center justify-between bg-slate-800/50 border border-emerald-500/30 rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                        <div>
                          <p className="text-white text-sm font-medium">{pf.file.name}</p>
                          <p className="text-emerald-400 text-xs">
                            {rt ? rt.label : 'Unknown'} · {pf.rowCount} rows
                          </p>
                        </div>
                      </div>
                      <button onClick={() => removeFile(idx)} className="text-slate-400 hover:text-white p-1">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Processing Results */}
          {results.length > 0 && (
            <div className="bg-slate-800/50 rounded-lg p-3">
              <p className="text-slate-300 text-sm font-medium mb-2">Processing Results</p>
              {results.map((r, idx) => (
                <div key={idx} className={`flex items-center gap-2 text-sm ${r.status === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {r.status === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  <span>{r.name}: {r.status === 'success' ? `${r.rows} rows → ${r.type}` : r.error}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 space-y-3">
          {/* Primary action: Save & Close OR Process */}
          {pendingFiles.length > 0 && !dataSaved && (
            <button
              onClick={processAndSave}
              disabled={processing}
              className="w-full px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {processing ? (
                <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing...</>
              ) : (
                <><Check className="w-5 h-5" /> Save {pendingFiles.length} File{pendingFiles.length > 1 ? 's' : ''}</>
              )}
            </button>
          )}

          {/* After saving or if no pending files */}
          {(dataSaved || pendingFiles.length === 0) && (
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium"
              >
                Close
              </button>
              <button
                onClick={handleGenerateActionPlan}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white rounded-xl font-semibold flex items-center justify-center gap-2"
              >
                <Brain className="w-5 h-5" /> Generate Action Plan
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AmazonAdsIntelModal;
