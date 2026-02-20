import React, { useState, useRef, useMemo, useCallback } from 'react';
import {
  AlertTriangle, BarChart3, Brain, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight,
  Clock, Database, DollarSign, Eye, FileSpreadsheet, FileText, Flame, Globe, Loader2, RefreshCw, Search,
  Send, ShieldAlert, Sparkles, Target, Trash2, TrendingDown, TrendingUp, Trophy, Upload, X, Zap
} from 'lucide-react';
import { formatCurrency, formatPercent, formatNumber } from '../../utils/format';
import { getShopifyAdsForDay, aggregateShopifyAdsForDays } from '../../utils/ads';
import { hasDailySalesData } from '../../utils/date';
import { AI_MODEL_OPTIONS, getModelLabel } from '../../utils/config';
import NavTabs from '../ui/NavTabs';

// ── Markdown → HTML for PDF export & in-app rendering ──
const markdownToHtml = (md) => {
  if (!md) return '';
  // First escape HTML entities
  let text = md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Extract and convert markdown tables before line-level processing
  const lines = text.split('\n');
  const result = [];
  let i = 0;
  while (i < lines.length) {
    // Detect a markdown table: line with pipes, followed by separator row (|---|---|)
    if (lines[i].includes('|') && i + 1 < lines.length && /^\|?\s*[-:]+[-|\s:]+$/.test(lines[i + 1])) {
      const headerLine = lines[i];
      const sepLine = lines[i + 1];
      // Parse alignment from separator
      const aligns = sepLine.split('|').filter(c => c.trim()).map(c => {
        const t = c.trim();
        if (t.startsWith(':') && t.endsWith(':')) return 'center';
        if (t.endsWith(':')) return 'right';
        return 'left';
      });
      // Parse header cells
      const headerCells = headerLine.split('|').filter(c => c.trim()).map(c => c.trim());
      let tableHtml = '<div class="table-wrap"><table><thead><tr>';
      headerCells.forEach((cell, ci) => {
        const align = aligns[ci] || 'left';
        tableHtml += `<th style="text-align:${align}">${cell}</th>`;
      });
      tableHtml += '</tr></thead><tbody>';
      i += 2; // skip header + separator
      while (i < lines.length && lines[i].includes('|') && !/^\|?\s*[-:]+[-|\s:]+$/.test(lines[i])) {
        const cells = lines[i].split('|').filter(c => c.trim() !== '' || lines[i].trim().startsWith('|')).map(c => c.trim());
        // Handle leading/trailing pipe: split on | and filter
        const rowCells = lines[i].replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
        tableHtml += '<tr>';
        rowCells.forEach((cell, ci) => {
          const align = aligns[ci] || 'left';
          tableHtml += `<td style="text-align:${align}">${cell}</td>`;
        });
        tableHtml += '</tr>';
        i++;
      }
      tableHtml += '</tbody></table></div>';
      result.push(tableHtml);
    } else {
      result.push(lines[i]);
      i++;
    }
  }
  text = result.join('\n');

  // Now process inline/block markdown
  let html = text
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^---$/gm, '<hr/>')
    .replace(/^[\-\*] (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  html = html.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    if (/^<[a-z]/.test(trimmed)) return trimmed;
    return `<p>${trimmed}</p>`;
  }).join('\n');
  return html;
};

const fmtDate = (dateStr) => {
  try { const d = new Date(dateStr + 'T12:00:00'); return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return dateStr || ''; }
};

const tacosColor = (t) => t <= 15 ? 'text-emerald-400' : t <= 25 ? 'text-amber-400' : 'text-rose-400';
const roasColor = (r) => r >= 4 ? 'text-emerald-400' : r >= 2 ? 'text-amber-400' : 'text-rose-400';
const acosColor = (a) => a <= 25 ? 'text-emerald-400' : a <= 40 ? 'text-amber-400' : 'text-rose-400';

const Sparkline = ({ data, color = 'bg-cyan-500', h = 32 }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 0.01);
  return (
    <div className="flex items-end gap-px" style={{ height: `${h}px` }}>
      {data.slice(-14).map((v, i) => (
        <div key={i} className={`flex-1 ${color} rounded-t opacity-80 hover:opacity-100 transition-opacity`}
          style={{ height: `${Math.max((v / max) * 100, 4)}%`, minWidth: '3px', minHeight: '2px' }} />
      ))}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// AdsView — Advertising Command Center
// ══════════════════════════════════════════════════════════════

const AdsView = ({
  adSpend, adsApiStatus, adsAiInput, adsAiLoading, adsAiMessages, adsIntelData,
  aiChatModel, setAiChatModel,
  adsAiReportHistory, setAdsAiReportHistory,
  adsMonth, adsQuarter, adsSelectedDay, adsSelectedWeek, adsTimeTab,
  adsViewMode, adsYear, allDaysData, allPeriodsData, allWeeksData,
  amazonCampaignFilter, amazonCampaignSort, amazonCampaigns, appSettings,
  bankingData, current, dataBar, files, globalModals, invHistory, months,
  navDropdown, parseAmazonCampaignCSV, processAdsUpload,
  saveAmazonCampaigns, sendAdsAIMessage, setAdsAiInput, setAdsAiMessages,
  setAdsMonth, setAdsQuarter, setAdsSelectedDay, setAdsSelectedWeek,
  setAdsTimeTab, setAdsViewMode, setAdsYear, setAmazonCampaignFilter,
  setAmazonCampaignSort, setNavDropdown, setSelectedDay, setSelectedInvDate,
  setSelectedPeriod, setSelectedWeek, setShowAdsAIChat, setShowAdsBulkUpload,
  setShowAdsIntelUpload, setShowDtcIntelUpload, dtcIntelData, setToast, reportHistory, setReportHistory, setUploadTab, showAdsAIChat, storeName,
  setView, view, save
}) => {
  const sortedWeeks = Object.keys(allWeeksData).sort();
  const sortedDays = Object.keys(allDaysData || {}).sort();
  const hasDailyData = sortedDays.length > 0;

  const [uploadStatus, setUploadStatus] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showDataSources, setShowDataSources] = useState(false);
  const [expandedReport, setExpandedReport] = useState(null); // track which checklist row is expanded
  const [dateRange, setDateRange] = useState(30);
  const [reportMode, setReportMode] = useState('all');
  const [viewingReportId, setViewingReportId] = useState(null);
  const [showSavedReports, setShowSavedReports] = useState(false);
  const fileInputRef = useRef(null);

  const campaigns = amazonCampaigns?.campaigns || [];
  const hasCampaignData = campaigns.length > 0;

  const deepReportCount = useMemo(() => {
    if (!adsIntelData) return 0;
    let count = 0;
    for (const [key, val] of Object.entries(adsIntelData)) {
      if (key === 'lastUpdated' || key === 'reportCount' || typeof val !== 'object') continue;
      for (const [, data] of Object.entries(val)) { if (data?.records) count++; }
    }
    return count;
  }, [adsIntelData]);

  const dateRangeLabel = dateRange === 'all' ? 'All Time' : `${dateRange}d`;

  // ══════════════════════════════════════════════════════════════
  // UNIFIED PERIOD DATA — single source of truth for ALL metrics
  // ══════════════════════════════════════════════════════════════
  const periodData = useMemo(() => {
    const cutoff = dateRange === 'all' ? null : (() => {
      const d = new Date(); d.setDate(d.getDate() - dateRange);
      return d.toISOString().slice(0, 10);
    })();
    const days = sortedDays.filter(d => !cutoff || d >= cutoff);

    // Prior period for delta comparison
    const priorCutoff = (cutoff && dateRange !== 'all') ? (() => {
      const d = new Date(cutoff + 'T12:00:00'); d.setDate(d.getDate() - dateRange);
      return d.toISOString().slice(0, 10);
    })() : null;
    const priorDays = priorCutoff ? sortedDays.filter(d => d >= priorCutoff && d < cutoff) : [];

    const aggregate = (dayList) => {
      let spend = 0, rev = 0, amzSpend = 0, amzRev = 0, amzAdRev = 0,
          gSpend = 0, mSpend = 0, shopRev = 0,
          gClicks = 0, mClicks = 0, amzClicks = 0,
          gImpr = 0, mImpr = 0, amzImpr = 0,
          gConv = 0, mPurch = 0, amzConv = 0, mPurchVal = 0, gConvVal = 0;
      dayList.forEach(d => {
        const day = allDaysData[d]; if (!day) return;
        const aS = day.amazon?.adSpend ?? day.amazonAdsMetrics?.spend ?? 0;
        const gS = day.shopify?.googleSpend ?? day.googleSpend ?? day.googleAds ?? 0;
        const mS = day.shopify?.metaSpend ?? day.metaSpend ?? day.metaAds ?? 0;
        const aR = day.amazon?.revenue || 0;
        const sR = day.shopify?.revenue || 0;
        const aAR = day.amazon?.adRevenue || day.amazonAdsMetrics?.totalRevenue || 0;
        const am = day.shopify?.adsMetrics || {};
        const amzM = day.amazonAdsMetrics || {};
        amzSpend += aS; gSpend += gS; mSpend += mS;
        amzRev += aR; shopRev += sR; amzAdRev += aAR;
        spend += aS + gS + mS; rev += aR + sR;
        gClicks += am.googleClicks || day.googleClicks || 0; mClicks += am.metaClicks || day.metaClicks || 0; amzClicks += amzM.clicks || day.amazon?.adClicks || 0;
        gImpr += am.googleImpressions || day.googleImpressions || 0; mImpr += am.metaImpressions || day.metaImpressions || 0; amzImpr += amzM.impressions || day.amazon?.adImpressions || 0;
        gConv += am.googleConversions || day.googleConversions || 0; mPurch += am.metaPurchases || day.metaPurchases || day.metaConversions || 0;
        amzConv += amzM.conversions || day.amazon?.adOrders || 0; mPurchVal += am.metaPurchaseValue || day.metaPurchaseValue || 0;
        gConvVal += am.googleConvValue || day.googleConvValue || day.googleConversionValue || 0;
      });
      const totalClicks = gClicks + mClicks + amzClicks;
      const totalImpr = gImpr + mImpr + amzImpr;
      return {
        spend, rev, amzSpend, amzRev, amzAdRev, gSpend, mSpend, shopRev,
        gClicks, mClicks, amzClicks, totalClicks, gImpr, mImpr, amzImpr, totalImpr,
        gConv, mPurch, amzConv, mPurchVal,
        totalConv: gConv + mPurch + amzConv,
        tacos: rev > 0 ? (spend / rev) * 100 : 0,
        roas: spend > 0 ? rev / spend : 0,
        amzTacos: amzRev > 0 ? (amzSpend / amzRev) * 100 : 0,
        amzAcos: amzAdRev > 0 ? (amzSpend / amzAdRev) * 100 : 0,
        amzRoas: amzSpend > 0 ? amzRev / amzSpend : 0,
        cpc: totalClicks > 0 ? spend / totalClicks : 0,
        ctr: totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0,
        gCpc: gClicks > 0 ? gSpend / gClicks : 0,
        gCtr: gImpr > 0 ? (gClicks / gImpr) * 100 : 0,
        gConvRate: gClicks > 0 ? (gConv / gClicks) * 100 : 0,
        gConvVal,
        gRoas: gSpend > 0 ? (gConvVal > 0 ? gConvVal / gSpend : 0) : 0,
        mCpc: mClicks > 0 ? mSpend / mClicks : 0,
        mCtr: mImpr > 0 ? (mClicks / mImpr) * 100 : 0,
        mCpa: mPurch > 0 ? mSpend / mPurch : 0,
        mRoas: mSpend > 0 ? mPurchVal / mSpend : 0,
        amzAdRoas: amzSpend > 0 ? amzAdRev / amzSpend : 0,
        adRevPct: rev > 0 ? (amzAdRev / rev) * 100 : 0,
        organicRev: rev - amzAdRev,
        organicPct: rev > 0 ? ((rev - amzAdRev) / rev) * 100 : 0,
        days: dayList.length,
      };
    };

    const cur = aggregate(days);
    const prior = aggregate(priorDays);

    // Trend data for charts
    const trend = days.map(d => {
      const day = allDaysData[d]; if (!day) return null;
      const aS = day.amazon?.adSpend ?? day.amazonAdsMetrics?.spend ?? 0;
      const gS = day.shopify?.googleSpend ?? day.googleSpend ?? day.googleAds ?? 0;
      const mS = day.shopify?.metaSpend ?? day.metaSpend ?? day.metaAds ?? 0;
      const s = aS + gS + mS;
      const aR = day.amazon?.revenue || 0; const sR = day.shopify?.revenue || 0; const r = aR + sR;
      return { date: d, spend: s, rev: r, amzSpend: aS, gSpend: gS, mSpend: mS,
        tacos: r > 0 ? (s / r) * 100 : (s > 0 ? 100 : 0), roas: s > 0 ? r / s : 0 };
    }).filter(Boolean);

    // Day-of-week
    const dowBuckets = [0,1,2,3,4,5,6].map(() => ({ spend: 0, rev: 0, count: 0 }));
    days.forEach(d => {
      const day = allDaysData[d]; if (!day) return;
      const dayOfWeek = new Date(d + 'T12:00:00').getDay(); if (isNaN(dayOfWeek)) return;
      const aS = day.amazon?.adSpend ?? 0;
      const gS = day.shopify?.googleSpend ?? day.googleSpend ?? day.googleAds ?? 0;
      const mS = day.shopify?.metaSpend ?? day.metaSpend ?? day.metaAds ?? 0;
      const r = (day.amazon?.revenue || 0) + (day.shopify?.revenue || 0);
      dowBuckets[dayOfWeek].spend += aS + gS + mS; dowBuckets[dayOfWeek].rev += r; dowBuckets[dayOfWeek].count++;
    });
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const dowData = dowBuckets.map((d, i) => ({ day: dayNames[i], avgSpend: d.count > 0 ? d.spend / d.count : 0, avgRev: d.count > 0 ? d.rev / d.count : 0, roas: d.spend > 0 ? d.rev / d.spend : 0, count: d.count }));

    // Budget split
    const budgetTotal = cur.amzSpend + cur.gSpend + cur.mSpend;
    const budgetSplit = budgetTotal > 0 ? { amazon: (cur.amzSpend / budgetTotal) * 100, google: (cur.gSpend / budgetTotal) * 100, meta: (cur.mSpend / budgetTotal) * 100 } : { amazon: 0, google: 0, meta: 0 };

    // Platform sparklines
    const aTrend = days.map(d => allDaysData[d]?.amazon?.adSpend ?? allDaysData[d]?.amazonAdsMetrics?.spend ?? 0);
    const gTrend = days.map(d => allDaysData[d]?.shopify?.googleSpend || allDaysData[d]?.googleSpend || allDaysData[d]?.googleAds || 0);
    const mTrend = days.map(d => allDaysData[d]?.shopify?.metaSpend || allDaysData[d]?.metaSpend || allDaysData[d]?.metaAds || 0);

    // Daily table rows
    const tableRows = days.map(d => {
      const day = allDaysData[d]; if (!day) return null;
      const aAds = day.amazon?.adSpend ?? day.amazonAdsMetrics?.spend ?? 0;
      const gAds = day.shopify?.googleSpend ?? day.googleSpend ?? day.googleAds ?? 0;
      const mAds = day.shopify?.metaSpend ?? day.metaSpend ?? day.metaAds ?? 0;
      const aR = day.amazon?.revenue || 0; const sR = day.shopify?.revenue || 0;
      const totalAds = aAds + gAds + mAds; const totalRev = aR + sR;
      const am = day.shopify?.adsMetrics || {};
      const amzM = day.amazonAdsMetrics || {};
      const clicks = (amzM.clicks || day.amazon?.adClicks || 0) + (am.googleClicks || day.googleClicks || 0) + (am.metaClicks || day.metaClicks || 0);
      const conversions = (amzM.conversions || day.amazon?.adOrders || 0) + (am.googleConversions || day.googleConversions || 0) + (am.metaPurchases || day.metaPurchases || 0);
      return { date: d, amazonAds: aAds, googleAds: gAds, metaAds: mAds, totalAds, amazonRev: aR, shopifyRev: sR, totalRev, tacos: totalRev > 0 ? (totalAds / totalRev) * 100 : 0, roas: totalAds > 0 ? totalRev / totalAds : 0, clicks, conversions };
    }).filter(Boolean);

    return { current: cur, prior, trend, dowData, budgetSplit, days, priorDays, aTrend, gTrend, mTrend, tableRows };
  }, [sortedDays, allDaysData, dateRange]);

  // ══════════════════════════════════════════════════════════════
  // AMAZON ADS INTELLIGENCE (search terms, campaigns, SKUs, etc.)
  // ══════════════════════════════════════════════════════════════
  const amazonAdsInsights = useMemo(() => {
    const intel = {
      hasData: false, wastedSpend: [], topWinners: [], topCampaigns: [],
      skuPerformance: [], placementInsights: null, negativeKeywords: [],
      summary: null, zeroSaleCampaigns: [], zeroSaleDays: [],
      acosSpikeDays: [], staleCampaignWarning: false,
    };
    const cutoffDate = dateRange === 'all' ? null : (() => { const d = new Date(); d.setDate(d.getDate() - dateRange); return d.toISOString().slice(0, 10); })();
    const inRange = (r) => { if (!cutoffDate) return true; return (r['Date'] || r['date'] || '') >= cutoffDate; };

    const daysWithAds = periodData.days.filter(d => {
      const day = allDaysData[d];
      return (day?.amazon?.adSpend > 0) || (day?.amazonAdsMetrics?.spend > 0);
    });
    if (daysWithAds.length >= 1) intel.hasData = true;
    intel.summary = { totalTerms: 0, totalSpend: periodData.current.spend, totalSales: periodData.current.rev, overallRoas: periodData.current.roas, wastedTotal: 0, wastedPct: 0, daysCount: periodData.current.days };

    // CAMPAIGNS
    if (hasCampaignData) {
      intel.hasData = true;
      const activeCamps = campaigns.filter(c => (c.spend || 0) > 0);
      intel.topCampaigns = activeCamps
        .map(c => ({ name: c.name || '', spend: c.spend || 0, sales: c.sales || 0, clicks: c.clicks || 0, impressions: c.impressions || 0, orders: c.orders || 0, roas: c.roas || (c.spend > 0 && c.sales > 0 ? c.sales / c.spend : 0), acos: c.acos || (c.spend > 0 && c.sales > 0 ? (c.spend / c.sales) * 100 : 999), state: c.state || '', type: c.type || 'SP' }))
        .sort((a, b) => b.spend - a.spend).slice(0, 15);
      intel.zeroSaleCampaigns = activeCamps.filter(c => c.spend > 1 && (c.sales || 0) === 0)
        .map(c => ({ name: c.name || '', spend: c.spend || 0, clicks: c.clicks || 0, type: c.type || 'SP' })).sort((a, b) => b.spend - a.spend);
      const allZero = campaigns.every(c => (c.spend || 0) === 0);
      const hasApiData = adsIntelData && (adsIntelData._apiSpCampaigns?.length > 0 || adsIntelData.amazon?.sp_campaigns?.records?.length > 0);
      const hasSufficientDailyData = daysWithAds.length >= 7 && periodData.current.amzSpend > 100;
      intel.staleCampaignWarning = allZero && daysWithAds.length > 0 && !hasApiData && !hasSufficientDailyData;
    }

    // ACTIONABLE: Zero-sale days & ACOS spikes (last 14d of selected range)
    periodData.days.slice(-14).forEach(d => {
      const day = allDaysData[d]; if (!day) return;
      const spend = day?.amazon?.adSpend ?? 0;
      const rev = day?.amazon?.adRevenue || day?.amazon?.revenue || 0;
      if (spend > 5 && rev === 0) intel.zeroSaleDays.push({ date: d, spend, platform: 'Amazon' });
      const gS = day?.shopify?.googleSpend ?? day?.googleSpend ?? 0;
      const mS = day?.shopify?.metaSpend ?? day?.metaSpend ?? 0;
      const sR = day?.shopify?.revenue || 0;
      if (gS > 5 && sR === 0) intel.zeroSaleDays.push({ date: d, spend: gS, platform: 'Google' });
      if (mS > 5 && sR === 0) intel.zeroSaleDays.push({ date: d, spend: mS, platform: 'Meta' });
      const acos = rev > 0 ? (spend / rev) * 100 : (spend > 10 ? 999 : 0);
      if (spend > 20 && acos > 50) intel.acosSpikeDays.push({ date: d, spend, rev, acos: Math.min(acos, 999) });
    });
    intel.zeroSaleDays.sort((a, b) => b.spend - a.spend);

    // ENRICHMENT: adsIntelData (API sync / uploaded reports)
    if (adsIntelData) {
      const amz = adsIntelData.amazon || {};
      const getRecords = (nestedKey, flatKey) => {
        const nested = amz[nestedKey]?.records;
        const flat = adsIntelData[flatKey];
        if (nested?.length) return nested;
        if (Array.isArray(flat) && flat.length) return flat;
        return [];
      };

      // Search Terms
      const spST = getRecords('sp_search_terms', '_apiSpSearchTerms').filter(inRange);
      const sbST = getRecords('sb_search_terms', '_apiSbSearchTerms').filter(inRange);
      const allSearchTerms = [...spST, ...sbST];
      if (allSearchTerms.length > 0) {
        intel.hasData = true;
        const tm = {};
        allSearchTerms.forEach(r => {
          const t = r['Customer Search Term'] || r['searchTerm'] || ''; if (!t) return;
          if (!tm[t]) tm[t] = { term: t, spend: 0, sales: 0, clicks: 0, impressions: 0, orders: 0 };
          tm[t].spend += Number(r['Spend'] || r['cost'] || 0);
          tm[t].sales += Number(r['7 Day Total Sales'] || r['14 Day Total Sales'] || r['sales7d'] || r['salesClicks14d'] || 0);
          tm[t].clicks += Number(r['Clicks'] || r['clicks'] || 0);
          tm[t].impressions += Number(r['Impressions'] || r['impressions'] || 0);
          tm[t].orders += Number(r['7 Day Total Orders (#)'] || r['14 Day Total Orders (#)'] || r['purchases7d'] || r['purchasesClicks14d'] || 0);
        });
        const terms = Object.values(tm);
        intel.wastedSpend = terms.filter(t => t.spend >= 5 && t.sales === 0).sort((a, b) => b.spend - a.spend).slice(0, 10);
        intel.topWinners = terms.filter(t => t.spend >= 3 && t.sales > 0).map(t => ({ ...t, roas: t.sales / t.spend, acos: t.spend / t.sales * 100 })).sort((a, b) => b.roas - a.roas).slice(0, 10);
        intel.negativeKeywords = terms.filter(t => t.clicks >= 10 && t.orders === 0).sort((a, b) => b.spend - a.spend).slice(0, 10);
        const wTotal = intel.wastedSpend.reduce((s, t) => s + t.spend, 0);
        const totalTermSpend = terms.reduce((s, t) => s + t.spend, 0);
        intel.summary = { ...intel.summary, totalTerms: terms.length, wastedTotal: wTotal, wastedPct: totalTermSpend > 0 ? (wTotal / totalTermSpend) * 100 : 0 };
      }

      // Campaigns from API (override CSV)
      const csd = adsIntelData.campaignSummary;
      if (Array.isArray(csd) && csd.length > 0) {
        intel.topCampaigns = csd.filter(c => c.spend > 0).map(c => ({ name: c.name || '', type: c.type || 'SP', spend: c.spend || 0, sales: c.revenue || 0, clicks: c.clicks || 0, impressions: c.impressions || 0, orders: c.orders || 0, roas: c.roas || (c.spend > 0 ? (c.revenue || 0) / c.spend : 0), acos: c.acos || (c.revenue > 0 ? (c.spend / c.revenue) * 100 : 999) })).sort((a, b) => b.spend - a.spend).slice(0, 15);
      } else {
        const raw = getRecords('sp_campaigns', '_apiSpCampaigns');
        const rows = (raw.length ? raw : getRecords('sp_campaigns', '_apiDailyOverview')).filter(inRange);
        if (rows.length > 0) {
          const cm = {};
          rows.forEach(r => {
            const n = r['Campaign Name'] || r['campaignName'] || ''; if (!n) return;
            if (!cm[n]) cm[n] = { name: n, type: r['Campaign Type'] || r['campaignType'] || r['type'] || 'SP', spend: 0, sales: 0, clicks: 0, impressions: 0, orders: 0 };
            cm[n].spend += Number(r['Spend'] || r['cost'] || r['spend'] || 0);
            cm[n].sales += Number(r['Sales'] || r['7 Day Total Sales'] || r['sales'] || r['sales7d'] || 0);
            cm[n].clicks += Number(r['Clicks'] || r['clicks'] || 0);
            cm[n].impressions += Number(r['Impressions'] || r['impressions'] || 0);
            cm[n].orders += Number(r['7 Day Total Orders (#)'] || r['purchases7d'] || 0);
          });
          intel.topCampaigns = Object.values(cm).filter(c => c.spend > 0).map(c => ({ ...c, roas: c.spend > 0 ? c.sales / c.spend : 0, acos: c.sales > 0 ? (c.spend / c.sales) * 100 : 999 })).sort((a, b) => b.spend - a.spend).slice(0, 15);
        }
      }

      // SKU Performance
      const skuRows = getRecords('sp_advertised_product', '_apiSpAdvertised').filter(inRange);
      if (skuRows.length > 0) {
        intel.hasData = true;
        const sm = {};
        skuRows.forEach(r => {
          const sku = r['Advertised SKU'] || r['advertisedSku'] || r['SKU'] || ''; if (!sku) return;
          if (!sm[sku]) sm[sku] = { sku, asin: r['Advertised ASIN'] || r['advertisedAsin'] || '', spend: 0, sales: 0, clicks: 0, orders: 0 };
          sm[sku].spend += Number(r['Spend'] || r['cost'] || 0);
          sm[sku].sales += Number(r['7 Day Total Sales'] || r['sales7d'] || 0);
          sm[sku].clicks += Number(r['Clicks'] || r['clicks'] || 0);
          sm[sku].orders += Number(r['7 Day Total Orders (#)'] || r['7 Day Total Units (#)'] || r['purchases7d'] || r['unitsSoldClicks7d'] || 0);
        });
        intel.skuPerformance = Object.values(sm).filter(s => s.spend > 0).map(s => ({ ...s, roas: s.spend > 0 ? s.sales / s.spend : 0, acos: s.sales > 0 ? (s.spend / s.sales) * 100 : 999 })).sort((a, b) => b.spend - a.spend).slice(0, 10);
      } else if (Array.isArray(adsIntelData.skuAdPerformance) && adsIntelData.skuAdPerformance.length > 0) {
        intel.hasData = true;
        intel.skuPerformance = adsIntelData.skuAdPerformance.filter(s => s.spend > 0).map(s => ({ sku: s.sku || '', asin: s.asin || '', spend: s.spend || 0, sales: s.revenue || s.sales || 0, clicks: s.clicks || 0, orders: s.orders || 0, roas: s.roas || (s.spend > 0 ? (s.revenue || s.sales || 0) / s.spend : 0), acos: s.acos || (s.revenue > 0 ? (s.spend / s.revenue) * 100 : 999) })).sort((a, b) => b.spend - a.spend).slice(0, 10);
      }

      // Placement
      const plRows = getRecords('sp_placement', '_apiSpPlacement').filter(inRange);
      if (plRows.length > 0) {
        intel.hasData = true;
        const pm = {};
        plRows.forEach(r => {
          const p = r['Placement'] || r['placementClassification'] || ''; if (!p) return;
          if (!pm[p]) pm[p] = { placement: p, spend: 0, sales: 0, clicks: 0, impressions: 0 };
          pm[p].spend += Number(r['Spend'] || r['cost'] || 0);
          pm[p].sales += Number(r['7 Day Total Sales'] || r['sales7d'] || 0);
          pm[p].clicks += Number(r['Clicks'] || r['clicks'] || 0);
          pm[p].impressions += Number(r['Impressions'] || r['impressions'] || 0);
        });
        intel.placementInsights = Object.values(pm).map(p => ({ ...p, roas: p.spend > 0 ? p.sales / p.spend : 0, cpc: p.clicks > 0 ? p.spend / p.clicks : 0, ctr: p.impressions > 0 ? (p.clicks / p.impressions) * 100 : 0 }));
      }
    }
    return intel;
  }, [adsIntelData, dateRange, periodData, allDaysData, hasCampaignData, campaigns]);

  // ══════════════════════════════════════════════════════════════
  // DATA COMPLETENESS INDICATOR
  // ══════════════════════════════════════════════════════════════
  const dataCompleteness = useMemo(() => {
    const checks = [];
    const { current: cur } = periodData;

    // Amazon checks
    const amzDailyDays = sortedDays.filter(d => (allDaysData[d]?.amazon?.adSpend ?? allDaysData[d]?.amazonAdsMetrics?.spend ?? 0) > 0).length;
    checks.push({ platform: 'Amazon', type: 'Daily KPIs', status: amzDailyDays >= 7 ? 'complete' : amzDailyDays > 0 ? 'partial' : 'missing', detail: amzDailyDays > 0 ? `${amzDailyDays}d tracked` : 'Upload daily sales data', weight: 15 });

    checks.push({ platform: 'Amazon', type: 'Campaigns', status: hasCampaignData ? 'complete' : 'missing', detail: hasCampaignData ? `${campaigns.filter(c => (c.spend||0) > 0).length} active` : 'Upload campaign report', weight: 10 });

    const hasAmzST = adsIntelData?.amazon?.sp_search_terms?.records?.length > 0;
    const stCount = hasAmzST ? adsIntelData.amazon.sp_search_terms.records.length : 0;
    checks.push({ platform: 'Amazon', type: 'Search Terms', status: hasAmzST ? 'complete' : 'missing', detail: hasAmzST ? `${stCount} terms` : 'Upload for keyword insights', weight: 15 });

    const hasAmzPlc = adsIntelData?.amazon?.sp_placement?.records?.length > 0;
    checks.push({ platform: 'Amazon', type: 'Placements', status: hasAmzPlc ? 'complete' : 'missing', detail: hasAmzPlc ? 'TOS/RoS/PDP data' : 'Upload placement report', weight: 10 });

    // Google checks
    const gDays = sortedDays.filter(d => (allDaysData[d]?.shopify?.googleSpend ?? allDaysData[d]?.googleSpend ?? 0) > 0).length;
    const hasGoogleCamp = adsIntelData?.google && Object.keys(adsIntelData.google).some(k => adsIntelData.google[k]?.records?.length > 0);
    checks.push({ platform: 'Google', type: 'Daily Spend', status: gDays >= 7 ? 'complete' : gDays > 0 ? 'partial' : 'missing', detail: gDays > 0 ? `${gDays}d tracked` : 'No Google data', weight: 10 });
    checks.push({ platform: 'Google', type: 'Campaign Details', status: hasGoogleCamp ? 'complete' : 'missing', detail: hasGoogleCamp ? `${Object.values(adsIntelData.google).reduce((s, d) => s + (d?.records?.length || 0), 0)} rows` : (gDays > 0 ? 'Upload Google Ads CSV' : 'N/A'), weight: 15 });

    // Meta checks
    const mDays = sortedDays.filter(d => (allDaysData[d]?.shopify?.metaSpend ?? allDaysData[d]?.metaSpend ?? 0) > 0).length;
    const hasMetaCamp = adsIntelData?.meta && Object.keys(adsIntelData.meta).some(k => adsIntelData.meta[k]?.records?.length > 0);
    checks.push({ platform: 'Meta', type: 'Daily Spend', status: mDays >= 7 ? 'complete' : mDays > 0 ? 'partial' : 'missing', detail: mDays > 0 ? `${mDays}d tracked` : 'No Meta data', weight: 10 });
    checks.push({ platform: 'Meta', type: 'Campaign/Creative', status: hasMetaCamp ? 'complete' : 'missing', detail: hasMetaCamp ? `${Object.values(adsIntelData.meta).reduce((s, d) => s + (d?.records?.length || 0), 0)} rows` : (mDays > 0 ? 'Upload Meta Ads CSV' : 'N/A'), weight: 15 });

    // Score
    const maxScore = checks.reduce((s, c) => s + c.weight, 0);
    const score = checks.reduce((s, c) => s + (c.status === 'complete' ? c.weight : c.status === 'partial' ? c.weight * 0.5 : 0), 0);
    const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    const missingCount = checks.filter(c => c.status === 'missing' && c.detail !== 'N/A').length;

    return { checks, pct, missingCount };
  }, [sortedDays, allDaysData, adsIntelData, hasCampaignData, campaigns, periodData]);

  // ══════════════════════════════════════════════════════════════
  // CROSS-PLATFORM INTELLIGENCE (Google & Meta)
  // ══════════════════════════════════════════════════════════════
  const googleInsights = useMemo(() => {
    if (!adsIntelData?.google || typeof adsIntelData.google !== 'object') return null;
    const intel = { hasData: false, topCampaigns: [], wastedTerms: [], topTerms: [] };
    const cutoffDate = dateRange === 'all' ? null : (() => { const d = new Date(); d.setDate(d.getDate() - dateRange); return d.toISOString().slice(0, 10); })();
    const inRange = (r) => { if (!cutoffDate) return true; return (r['Day'] || r['Date'] || r['date'] || '') >= cutoffDate; };

    for (const [reportType, data] of Object.entries(adsIntelData.google)) {
      if (!data?.records?.length) continue;
      intel.hasData = true;
      const records = data.records.filter(inRange);

      // Detect campaigns
      const campKey = data.headers?.find(h => /campaign/i.test(h));
      const spendKey = data.headers?.find(h => /^(spend|cost|amount)/i.test(h));
      const salesKey = data.headers?.find(h => /conv.*value|sales|revenue/i.test(h));
      const clicksKey = data.headers?.find(h => /^clicks$/i.test(h));
      const convKey = data.headers?.find(h => /^conversions$/i.test(h));
      const imprKey = data.headers?.find(h => /^impressions$/i.test(h));
      const termKey = data.headers?.find(h => /search.*term/i.test(h));

      if (campKey && spendKey) {
        const cm = {};
        records.forEach(r => {
          const n = r[campKey]; if (!n) return;
          if (!cm[n]) cm[n] = { name: n, spend: 0, sales: 0, clicks: 0, conv: 0, impr: 0 };
          cm[n].spend += Number(r[spendKey] || 0);
          cm[n].sales += Number(r[salesKey] || 0);
          cm[n].clicks += Number(r[clicksKey] || 0);
          cm[n].conv += Number(r[convKey] || 0);
          cm[n].impr += Number(r[imprKey] || 0);
        });
        const gcamps = Object.values(cm).filter(c => c.spend > 0).map(c => ({
          ...c, roas: c.spend > 0 && c.sales > 0 ? c.sales / c.spend : 0,
          cpc: c.clicks > 0 ? c.spend / c.clicks : 0,
          ctr: c.impr > 0 ? (c.clicks / c.impr) * 100 : 0,
          convRate: c.clicks > 0 ? (c.conv / c.clicks) * 100 : 0,
        })).sort((a, b) => b.spend - a.spend);
        if (gcamps.length > intel.topCampaigns.length) intel.topCampaigns = gcamps.slice(0, 12);
      }

      if (termKey && spendKey) {
        const tm = {};
        records.forEach(r => {
          const t = r[termKey]; if (!t) return;
          if (!tm[t]) tm[t] = { term: t, spend: 0, sales: 0, clicks: 0, conv: 0 };
          tm[t].spend += Number(r[spendKey] || 0);
          tm[t].sales += Number(r[salesKey] || 0);
          tm[t].clicks += Number(r[clicksKey] || 0);
          tm[t].conv += Number(r[convKey] || 0);
        });
        const terms = Object.values(tm);
        intel.wastedTerms = terms.filter(t => t.spend >= 5 && t.conv === 0).sort((a, b) => b.spend - a.spend).slice(0, 10);
        intel.topTerms = terms.filter(t => t.spend >= 3 && t.conv > 0).map(t => ({ ...t, roas: t.sales > 0 && t.spend > 0 ? t.sales / t.spend : 0, cpa: t.conv > 0 ? t.spend / t.conv : 0 })).sort((a, b) => b.roas - a.roas).slice(0, 10);
      }
    }
    return intel.hasData ? intel : null;
  }, [adsIntelData, dateRange]);

  const metaInsights = useMemo(() => {
    if (!adsIntelData?.meta || typeof adsIntelData.meta !== 'object') return null;
    const intel = { hasData: false, topCampaigns: [], topAdSets: [], placementBreakdown: [] };
    const cutoffDate = dateRange === 'all' ? null : (() => { const d = new Date(); d.setDate(d.getDate() - dateRange); return d.toISOString().slice(0, 10); })();
    const inRange = (r) => { if (!cutoffDate) return true; return (r['Day'] || r['Date'] || r['date'] || r['Reporting starts'] || '') >= cutoffDate; };

    for (const [reportType, data] of Object.entries(adsIntelData.meta)) {
      if (!data?.records?.length) continue;
      intel.hasData = true;
      const records = data.records.filter(inRange);

      const campKey = data.headers?.find(h => /campaign.*name/i.test(h));
      const adSetKey = data.headers?.find(h => /ad.*set.*name/i.test(h));
      const spendKey = data.headers?.find(h => /^(spend|amount.*spent|cost)/i.test(h));
      const salesKey = data.headers?.find(h => /purchase.*value|conv.*value|revenue/i.test(h));
      const clicksKey = data.headers?.find(h => /^(link.*clicks|clicks)$/i.test(h));
      const purchKey = data.headers?.find(h => /purchases|conversions/i.test(h));
      const imprKey = data.headers?.find(h => /^(impressions|reach)$/i.test(h));
      const placementKey = data.headers?.find(h => /placement/i.test(h));

      if (campKey && spendKey) {
        const cm = {};
        records.forEach(r => {
          const n = r[campKey]; if (!n) return;
          if (!cm[n]) cm[n] = { name: n, spend: 0, sales: 0, clicks: 0, purch: 0, impr: 0 };
          cm[n].spend += Number(r[spendKey] || 0);
          cm[n].sales += Number(r[salesKey] || 0);
          cm[n].clicks += Number(r[clicksKey] || 0);
          cm[n].purch += Number(r[purchKey] || 0);
          cm[n].impr += Number(r[imprKey] || 0);
        });
        const mcamps = Object.values(cm).filter(c => c.spend > 0).map(c => ({
          ...c, roas: c.spend > 0 && c.sales > 0 ? c.sales / c.spend : 0,
          cpa: c.purch > 0 ? c.spend / c.purch : 0,
          ctr: c.impr > 0 ? (c.clicks / c.impr) * 100 : 0,
        })).sort((a, b) => b.spend - a.spend);
        if (mcamps.length > intel.topCampaigns.length) intel.topCampaigns = mcamps.slice(0, 12);
      }

      if (adSetKey && spendKey) {
        const sm = {};
        records.forEach(r => {
          const n = r[adSetKey]; if (!n) return;
          if (!sm[n]) sm[n] = { name: n, spend: 0, sales: 0, clicks: 0, purch: 0 };
          sm[n].spend += Number(r[spendKey] || 0);
          sm[n].sales += Number(r[salesKey] || 0);
          sm[n].clicks += Number(r[clicksKey] || 0);
          sm[n].purch += Number(r[purchKey] || 0);
        });
        intel.topAdSets = Object.values(sm).filter(s => s.spend > 0).map(s => ({
          ...s, roas: s.spend > 0 && s.sales > 0 ? s.sales / s.spend : 0,
          cpa: s.purch > 0 ? s.spend / s.purch : 0,
        })).sort((a, b) => b.spend - a.spend).slice(0, 10);
      }

      if (placementKey && spendKey) {
        const pm = {};
        records.forEach(r => {
          const p = r[placementKey]; if (!p) return;
          if (!pm[p]) pm[p] = { placement: p, spend: 0, sales: 0, clicks: 0, impr: 0 };
          pm[p].spend += Number(r[spendKey] || 0);
          pm[p].sales += Number(r[salesKey] || 0);
          pm[p].clicks += Number(r[clicksKey] || 0);
          pm[p].impr += Number(r[imprKey] || 0);
        });
        intel.placementBreakdown = Object.values(pm).filter(p => p.spend > 0).map(p => ({
          ...p, roas: p.spend > 0 && p.sales > 0 ? p.sales / p.spend : 0,
          ctr: p.impr > 0 ? (p.clicks / p.impr) * 100 : 0,
        })).sort((a, b) => b.spend - a.spend);
      }
    }
    return intel.hasData ? intel : null;
  }, [adsIntelData, dateRange]);

  // ══════════════════════════════════════════════════════════════
  // HANDLERS
  // ══════════════════════════════════════════════════════════════
  const handleFileDrop = useCallback(async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    if (!processAdsUpload) { setToast({ message: 'Upload handler not available', type: 'error' }); return; }
    setUploadStatus({ processing: true, results: null, error: null });
    try {
      const result = await processAdsUpload(Array.from(fileList));
      setUploadStatus({ processing: false, results: result, error: null });
      const { summary } = result;
      if (summary.tier1 > 0 || summary.tier2 > 0) setToast({ message: `Processed ${summary.totalFiles} reports: ${summary.tier1} daily KPIs, ${summary.tier2} deep analysis${summary.unrecognized > 0 ? `, ${summary.unrecognized} unrecognized` : ''}`, type: 'success' });
      else if (summary.unrecognized > 0) setToast({ message: `${summary.unrecognized} file(s) not recognized`, type: 'warning' });
    } catch (err) { setUploadStatus({ processing: false, results: null, error: err.message }); setToast({ message: `Upload error: ${err.message}`, type: 'error' }); }
  }, [processAdsUpload, setToast]);

  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDrop = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); handleFileDrop(e.dataTransfer.files); };

  const REPORT_MODES = [
    { key: 'all', label: 'All Platforms', icon: '🌐', desc: 'Amazon + Google + Meta cross-platform audit' },
    { key: 'amazon', label: 'Amazon', icon: '📦', desc: 'Campaigns, keywords, placements, ACOS deep dive' },
    { key: 'dtc', label: 'DTC', icon: '🛍️', desc: 'Google + Meta DTC channel analysis' },
    { key: 'google', label: 'Google', icon: '🔍', desc: 'Search terms, CPC, conversions, Quality Score' },
    { key: 'meta', label: 'Meta', icon: '📱', desc: 'Creative, audiences, CPA, ROAS analysis' },
  ];

  const pctDelta = (curr, prev) => prev > 0 ? ((curr - prev) / prev) * 100 : (curr > 0 ? 100 : 0);
  const DeltaBadge = ({ curr, prev, invert = false }) => {
    const d = pctDelta(curr, prev);
    if (Math.abs(d) < 0.5 || (prev === 0 && curr === 0)) return null;
    const good = invert ? d < 0 : d > 0;
    return <span className={`text-[10px] font-medium flex items-center gap-0.5 ${good ? 'text-emerald-400' : 'text-rose-400'}`}>{good ? <TrendingUp className="w-2.5 h-2.5"/> : <TrendingDown className="w-2.5 h-2.5"/>}{Math.abs(d).toFixed(0)}%</span>;
  };

  const { current: cur, prior, trend, dowData, budgetSplit, tableRows } = periodData;

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-slate-950 p-4 lg:p-6">
      <div className="max-w-7xl mx-auto">{globalModals}
        <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />
        {dataBar}

        {/* ── HEADER + UNIFIED DATE RANGE ── */}
        <div className="mb-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-white">Advertising Command Center</h1>
              <p className="text-slate-500 text-sm mt-0.5">
                {sortedDays.length > 0 ? `${sortedDays.length} days tracked` : 'No data yet'}{hasCampaignData ? ` · ${campaigns.length} campaigns` : ''}{deepReportCount > 0 ? ` · ${deepReportCount} deep reports` : ''}
                {adsApiStatus?.connected && (
                  <span className="inline-flex items-center gap-1.5 ml-2 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-[10px] font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>
                    Ads API Live{adsApiStatus.lastSync ? ` · ${new Date(adsApiStatus.lastSync).toLocaleDateString()}` : ''}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5 p-0.5 bg-slate-800/60 rounded-lg border border-slate-700/50">
                {[7, 14, 30, 60, 90, 'all'].map(range => (
                  <button key={range} onClick={() => setDateRange(range)}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${dateRange === range ? 'bg-cyan-600 text-white shadow-sm shadow-cyan-500/30' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/50'}`}>
                    {range === 'all' ? 'All' : range + 'd'}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowAdsAIChat(true)} className="px-4 py-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 rounded-lg text-white flex items-center gap-2 font-medium shadow-lg shadow-orange-500/20 transition-all text-sm">
                <Zap className="w-3.5 h-3.5"/>AI
              </button>
            </div>
          </div>
        </div>

        {/* ── TAB BAR ── */}
        <div className="flex gap-1.5 mb-5 p-1 bg-slate-800/40 rounded-xl overflow-x-auto">
          {[
            { key: 'overview', label: 'Dashboard', icon: BarChart3, gradient: 'from-cyan-600 to-blue-600' },
            { key: 'reports', label: 'AI Reports', icon: Brain, gradient: 'from-orange-600 to-amber-600' },
            { key: 'upload', label: 'Data', icon: Database, gradient: 'from-violet-600 to-purple-600' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setAdsViewMode(tab.key)}
              className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${adsViewMode === tab.key ? `bg-gradient-to-r ${tab.gradient} text-white shadow-lg` : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}>
              <tab.icon className="w-4 h-4"/>{tab.label}
              {tab.key === 'upload' && deepReportCount > 0 && <span className="px-1.5 py-0.5 bg-white/20 rounded text-[10px]">{deepReportCount}</span>}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════ */}
        {/* DASHBOARD TAB                                          */}
        {/* ════════════════════════════════════════════════════════ */}
        {adsViewMode === 'overview' && (<>

          {/* ── HERO KPIs ── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-5">
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-800/40 rounded-xl border border-slate-700/60 p-3.5">
              <div className="flex items-center justify-between"><p className="text-slate-500 text-[10px] uppercase tracking-wider">Ad Spend</p><DeltaBadge curr={cur.spend} prev={prior.spend} invert/></div>
              <p className="text-xl font-bold text-white mt-0.5">{formatCurrency(cur.spend)}</p>
              {prior.days > 0 && <p className="text-slate-600 text-[9px] mt-0.5">vs {formatCurrency(prior.spend)} prior</p>}
            </div>
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-800/40 rounded-xl border border-slate-700/60 p-3.5">
              <div className="flex items-center justify-between"><p className="text-slate-500 text-[10px] uppercase tracking-wider">Revenue</p><DeltaBadge curr={cur.rev} prev={prior.rev}/></div>
              <p className="text-xl font-bold text-emerald-400 mt-0.5">{formatCurrency(cur.rev)}</p>
              {prior.days > 0 && <p className="text-slate-600 text-[9px] mt-0.5">vs {formatCurrency(prior.rev)} prior</p>}
            </div>
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-800/40 rounded-xl border border-slate-700/60 p-3.5">
              <div className="flex items-center justify-between"><p className="text-slate-500 text-[10px] uppercase tracking-wider">TACOS</p><DeltaBadge curr={cur.tacos} prev={prior.tacos} invert/></div>
              <p className={`text-xl font-bold mt-0.5 ${tacosColor(cur.tacos)}`}>{cur.tacos > 0 ? cur.tacos.toFixed(1) + '%' : '—'}</p>
            </div>
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-800/40 rounded-xl border border-slate-700/60 p-3.5">
              <div className="flex items-center justify-between"><p className="text-slate-500 text-[10px] uppercase tracking-wider">ROAS</p><DeltaBadge curr={cur.roas} prev={prior.roas}/></div>
              <p className={`text-xl font-bold mt-0.5 ${roasColor(cur.roas)}`}>{cur.roas > 0 ? cur.roas.toFixed(2) + 'x' : '—'}</p>
            </div>
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-800/40 rounded-xl border border-slate-700/60 p-3.5">
              <div className="flex items-center justify-between"><p className="text-slate-500 text-[10px] uppercase tracking-wider">Avg CPC</p><DeltaBadge curr={cur.cpc} prev={prior.cpc} invert/></div>
              <p className={`text-xl font-bold mt-0.5 ${cur.cpc > 0 ? (cur.cpc < 1.5 ? 'text-emerald-400' : cur.cpc < 2.5 ? 'text-amber-400' : 'text-rose-400') : 'text-white'}`}>{cur.cpc > 0 ? formatCurrency(cur.cpc) : '—'}</p>
            </div>
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-800/40 rounded-xl border border-slate-700/60 p-3.5">
              <div className="flex items-center justify-between"><p className="text-slate-500 text-[10px] uppercase tracking-wider">Conversions</p><DeltaBadge curr={cur.totalConv} prev={prior.totalConv}/></div>
              <p className="text-xl font-bold text-white mt-0.5">{formatNumber(cur.totalConv)}</p>
            </div>
          </div>

          {/* ── DATA COMPLETENESS INDICATOR ── */}
          {dataCompleteness.pct < 100 && (
            <div className="bg-slate-800/30 rounded-xl border border-slate-700/60 p-4 mb-5">
              <button onClick={() => setShowDataSources(p => !p)} className="w-full flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Database className="w-4 h-4 text-cyan-400"/>
                  <span className="text-white text-sm font-medium">Data Completeness: {dataCompleteness.pct}%</span>
                  {dataCompleteness.missingCount > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded-full">{dataCompleteness.missingCount} gap{dataCompleteness.missingCount !== 1 ? 's' : ''}</span>}
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${showDataSources ? 'rotate-180' : ''}`}/>
              </button>
              <div className="mt-2 h-1.5 rounded-full bg-slate-700/50 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${dataCompleteness.pct >= 80 ? 'bg-emerald-500' : dataCompleteness.pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${dataCompleteness.pct}%` }}/>
              </div>
              {showDataSources && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {dataCompleteness.checks.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 rounded-lg hover:bg-slate-700/20">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.status === 'complete' ? 'bg-emerald-500' : c.status === 'partial' ? 'bg-amber-500' : 'bg-slate-600'}`}/>
                      <span className="text-slate-400 w-14 shrink-0">{c.platform}</span>
                      <span className="text-white flex-1">{c.type}</span>
                      <span className={`text-[10px] ${c.status === 'complete' ? 'text-emerald-400' : c.status === 'partial' ? 'text-amber-400' : 'text-slate-600'}`}>
                        {c.status === 'missing' && c.detail !== 'N/A' ? (
                          <button onClick={() => setAdsViewMode('upload')} className="text-cyan-400 hover:underline">{c.detail}</button>
                        ) : c.detail}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── PLATFORM CARDS ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
            <div className="bg-gradient-to-br from-orange-900/15 to-slate-800/40 rounded-xl border border-orange-500/20 p-4">
              <div className="flex items-center justify-between mb-2"><h4 className="text-orange-400 font-semibold text-sm flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-orange-500"/>Amazon</h4><span className="text-white font-bold text-lg">{formatCurrency(cur.amzSpend)}</span></div>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div><span className="text-slate-500">Revenue</span><p className="text-emerald-400 font-medium">{formatCurrency(cur.amzRev)}</p></div>
                <div><span className="text-slate-500">TACOS</span><p className={`font-medium ${tacosColor(cur.amzTacos)}`}>{cur.amzTacos > 0 ? cur.amzTacos.toFixed(1) + '%' : '—'}</p></div>
                <div><span className="text-slate-500">ACOS</span><p className={`font-medium ${acosColor(cur.amzAcos)}`}>{cur.amzAcos > 0 ? cur.amzAcos.toFixed(1) + '%' : '—'}</p></div>
                <div><span className="text-slate-500">Ad ROAS</span><p className={`font-medium ${roasColor(cur.amzAdRoas)}`}>{cur.amzAdRoas > 0 ? cur.amzAdRoas.toFixed(2) + 'x' : '—'}</p></div>
              </div>
              <Sparkline data={periodData.aTrend} color="bg-orange-500" h={24} />
            </div>
            <div className="bg-gradient-to-br from-red-900/15 to-slate-800/40 rounded-xl border border-red-500/20 p-4">
              <div className="flex items-center justify-between mb-2"><h4 className="text-red-400 font-semibold text-sm flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-red-500"/>Google</h4><span className="text-white font-bold text-lg">{formatCurrency(cur.gSpend)}</span></div>
              {cur.gSpend > 0 ? <>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div><span className="text-slate-500">ROAS</span><p className={`font-medium ${cur.gRoas > 0 ? roasColor(cur.gRoas) : 'text-slate-500'}`}>{cur.gRoas > 0 ? cur.gRoas.toFixed(2) + 'x' : '—'}</p></div>
                  <div><span className="text-slate-500">CTR</span><p className={`font-medium ${cur.gCtr > 3 ? 'text-emerald-400' : cur.gCtr > 1 ? 'text-amber-400' : 'text-slate-400'}`}>{cur.gCtr > 0 ? cur.gCtr.toFixed(1) + '%' : '—'}</p></div>
                  <div><span className="text-slate-500">CPC</span><p className={`font-medium ${cur.gCpc > 0 ? (cur.gCpc < 1.5 ? 'text-emerald-400' : cur.gCpc < 3 ? 'text-amber-400' : 'text-rose-400') : 'text-slate-500'}`}>{cur.gCpc > 0 ? formatCurrency(cur.gCpc) : '—'}</p></div>
                  <div><span className="text-slate-500">Conv%</span><p className={`font-medium ${cur.gConvRate > 5 ? 'text-emerald-400' : cur.gConvRate > 2 ? 'text-amber-400' : 'text-slate-400'}`}>{cur.gConvRate > 0 ? cur.gConvRate.toFixed(1) + '%' : '—'}</p></div>
                </div>
                <Sparkline data={periodData.gTrend} color="bg-red-500" h={24} />
              </> : <p className="text-slate-600 text-xs mt-1">No Google Ads data — <button onClick={() => setAdsViewMode('upload')} className="text-red-400 hover:underline">upload Campaign or Search Term report</button></p>}
            </div>
            <div className="bg-gradient-to-br from-blue-900/15 to-slate-800/40 rounded-xl border border-blue-500/20 p-4">
              <div className="flex items-center justify-between mb-2"><h4 className="text-blue-400 font-semibold text-sm flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"/>Meta</h4><span className="text-white font-bold text-lg">{formatCurrency(cur.mSpend)}</span></div>
              {cur.mSpend > 0 ? <>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div><span className="text-slate-500">ROAS</span><p className={`font-medium ${cur.mRoas > 0 ? roasColor(cur.mRoas) : 'text-slate-500'}`}>{cur.mRoas > 0 ? cur.mRoas.toFixed(2) + 'x' : '—'}</p></div>
                  <div><span className="text-slate-500">CTR</span><p className={`font-medium ${cur.mCtr > 2 ? 'text-emerald-400' : cur.mCtr > 0.8 ? 'text-amber-400' : 'text-slate-400'}`}>{cur.mCtr > 0 ? cur.mCtr.toFixed(2) + '%' : '—'}</p></div>
                  <div><span className="text-slate-500">CPA</span><p className={`font-medium ${cur.mCpa > 0 && cur.mCpa <= 15 ? 'text-emerald-400' : cur.mCpa <= 30 ? 'text-amber-400' : 'text-rose-400'}`}>{cur.mCpa > 0 ? formatCurrency(cur.mCpa) : '—'}</p></div>
                  <div><span className="text-slate-500">CPC</span><p className={`font-medium ${cur.mCpc > 0 ? (cur.mCpc < 1 ? 'text-emerald-400' : cur.mCpc < 2 ? 'text-amber-400' : 'text-rose-400') : 'text-slate-500'}`}>{cur.mCpc > 0 ? formatCurrency(cur.mCpc) : '—'}</p></div>
                </div>
                <Sparkline data={periodData.mTrend} color="bg-blue-500" h={24} />
              </> : <p className="text-slate-600 text-xs mt-1">No Meta Ads data — <button onClick={() => setAdsViewMode('upload')} className="text-blue-400 hover:underline">upload Campaign or Ad Set report</button></p>}
            </div>
          </div>

          {/* ── PER-PLATFORM PROFITABILITY ── */}
          {cur.spend > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
              <div className="bg-slate-800/30 rounded-xl border border-slate-700/60 p-3.5">
                <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Amazon Net (Rev - Ad Spend)</p>
                <p className={`text-lg font-bold ${(cur.amzRev - cur.amzSpend) > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(cur.amzRev - cur.amzSpend)}</p>
                <p className="text-slate-600 text-[10px]">{cur.amzSpend > 0 ? `${((cur.amzRev - cur.amzSpend) / cur.amzSpend * 100).toFixed(0)}% ROI` : ''}</p>
              </div>
              <div className="bg-slate-800/30 rounded-xl border border-slate-700/60 p-3.5">
                <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">DTC Net (Shopify Rev - G/M Spend)</p>
                <p className={`text-lg font-bold ${(cur.shopRev - cur.gSpend - cur.mSpend) > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(cur.shopRev - cur.gSpend - cur.mSpend)}</p>
                <p className="text-slate-600 text-[10px]">Attribution approximate — platform conversions may overlap</p>
              </div>
              <div className="bg-slate-800/30 rounded-xl border border-slate-700/60 p-3.5">
                <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Blended MER (Total Rev / Total Spend)</p>
                <p className={`text-lg font-bold ${cur.roas >= 3 ? 'text-emerald-400' : cur.roas >= 1.5 ? 'text-amber-400' : 'text-rose-400'}`}>{cur.roas > 0 ? cur.roas.toFixed(2) + 'x' : '—'}</p>
                <p className="text-slate-600 text-[10px]">Ground truth — no attribution overlap</p>
              </div>
            </div>
          )}

          {/* ── ALERTS ── */}
          {(amazonAdsInsights.staleCampaignWarning || amazonAdsInsights.zeroSaleCampaigns.length > 0 || amazonAdsInsights.zeroSaleDays.length > 0) && (
            <div className="space-y-2 mb-5">
              {amazonAdsInsights.staleCampaignWarning && (
                <div className="flex items-center gap-3 bg-amber-900/20 border border-amber-500/30 rounded-xl p-3.5">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0"/>
                  <div className="flex-1 min-w-0"><p className="text-amber-200 text-sm font-medium">Campaign CSV is stale</p><p className="text-amber-400/70 text-xs">All {campaigns.length} campaigns show $0 spend, but daily data shows {formatCurrency(cur.amzSpend)} Amazon ad spend. Upload a fresh report.</p></div>
                  <button onClick={() => setAdsViewMode('upload')} className="px-3 py-1.5 bg-amber-600/30 border border-amber-500/40 rounded-lg text-amber-200 text-xs font-medium hover:bg-amber-600/50 whitespace-nowrap">Upload →</button>
                </div>
              )}
              {amazonAdsInsights.zeroSaleCampaigns.length > 0 && (
                <div className="flex items-center gap-3 bg-rose-900/15 border border-rose-500/20 rounded-xl p-3.5">
                  <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0"/>
                  <div className="flex-1 min-w-0"><p className="text-rose-200 text-sm font-medium">{amazonAdsInsights.zeroSaleCampaigns.length} campaign{amazonAdsInsights.zeroSaleCampaigns.length > 1 ? 's' : ''} with zero sales</p><p className="text-rose-400/70 text-xs">{formatCurrency(amazonAdsInsights.zeroSaleCampaigns.reduce((s, c) => s + c.spend, 0))} spent with $0 attributed revenue</p></div>
                  <button onClick={() => { setAdsAiInput(`Diagnose these zero-sale campaigns: ${amazonAdsInsights.zeroSaleCampaigns.map(c => `${c.name} (${formatCurrency(c.spend)} spent)`).join(', ')}. What's wrong and what should I do?`); setShowAdsAIChat(true); }} className="px-3 py-1.5 bg-rose-600/30 border border-rose-500/40 rounded-lg text-rose-200 text-xs font-medium hover:bg-rose-600/50 whitespace-nowrap">Diagnose →</button>
                </div>
              )}
              {amazonAdsInsights.zeroSaleDays.length > 0 && (
                <div className="flex items-center gap-3 bg-orange-900/15 border border-orange-500/20 rounded-xl p-3.5">
                  <Flame className="w-5 h-5 text-orange-400 shrink-0"/>
                  <div className="flex-1 min-w-0"><p className="text-orange-200 text-sm font-medium">{amazonAdsInsights.zeroSaleDays.length} zero-revenue ad day{amazonAdsInsights.zeroSaleDays.length > 1 ? 's' : ''} (recent)</p><p className="text-orange-400/70 text-xs">{formatCurrency(amazonAdsInsights.zeroSaleDays.reduce((s, d) => s + d.spend, 0))} potentially wasted across {[...new Set(amazonAdsInsights.zeroSaleDays.map(d => d.platform))].join(', ')}</p></div>
                </div>
              )}
            </div>
          )}

          {/* ── TACOS TREND CHART ── */}
          {trend.length > 2 && (() => {
            const daysWithSpend = trend.filter(d => d.spend > 0);
            if (daysWithSpend.length < 2) return null;
            const tacosValues = daysWithSpend.map(d => d.tacos).filter(t => t > 0 && t < 200);
            if (tacosValues.length < 2) return null;
            const minT = Math.min(...tacosValues); const maxT = Math.max(...tacosValues);
            const padMin = 0;
            const padMax = Math.ceil(maxT * 1.15) || 1;
            const scaleRange = padMax || 1;
            const last7 = daysWithSpend.slice(-7), prev7 = daysWithSpend.slice(-14, -7);
            const last7T = (() => { const s = last7.reduce((a, d) => a + d.spend, 0); const r = last7.reduce((a, d) => a + d.rev, 0); return r > 0 ? (s / r) * 100 : 0; })();
            const prev7T = (() => { const s = prev7.reduce((a, d) => a + d.spend, 0); const r = prev7.reduce((a, d) => a + d.rev, 0); return r > 0 ? (s / r) * 100 : 0; })();
            const d7 = prev7T > 0 ? last7T - prev7T : 0;
            const chartH = daysWithSpend.length > 60 ? 120 : 100;
            return (
              <div className="bg-slate-800/30 rounded-xl border border-slate-700/60 p-4 mb-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-semibold text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-cyan-400"/>TACOS Trend — {dateRangeLabel}</h3>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-400">7d: <span className={`font-bold ${last7T <= 10 ? 'text-emerald-400' : last7T <= 20 ? 'text-amber-400' : 'text-rose-400'}`}>{last7T.toFixed(1)}%</span></span>
                    {d7 !== 0 && <span className={`flex items-center gap-0.5 ${d7 < 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{d7 < 0 ? <TrendingDown className="w-3 h-3"/> : <TrendingUp className="w-3 h-3"/>}{Math.abs(d7).toFixed(1)}pp</span>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <div className="flex flex-col justify-between text-[10px] text-slate-600 pr-1" style={{ minWidth: '30px' }}>
                    <span>{padMax}%</span><span>{Math.round(padMax / 2)}%</span><span>0%</span>
                  </div>
                  <div className="flex items-end gap-px flex-1 relative" style={{ height: `${chartH}px` }}>
                    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                      <div className="border-b border-slate-700/30" style={{ height: '1px' }}/><div className="border-b border-slate-700/30" style={{ height: '1px' }}/><div style={{ height: '1px' }}/>
                    </div>
                    {daysWithSpend.map((d, i) => {
                      const t = d.tacos;
                      const barPx = Math.max(((t - padMin) / scaleRange) * chartH, 3);
                      const color = t <= 10 ? 'bg-emerald-500' : t <= 20 ? 'bg-amber-500' : 'bg-rose-500';
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end group relative" style={{ minWidth: '4px', height: `${chartH}px` }}>
                          <div className={`w-full rounded-t ${color} cursor-default`} style={{ height: `${barPx}px`, opacity: 0.85 }}/>
                          <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 pointer-events-none">
                            <div className="bg-slate-900 border border-slate-600 rounded-lg p-2 text-xs whitespace-nowrap shadow-xl">
                              <p className="text-slate-400">{fmtDate(d.date)}</p>
                              <p className="text-white">Spend: {formatCurrency(d.spend)}</p>
                              <p className="text-emerald-400">Rev: {formatCurrency(d.rev)}</p>
                              <p className={`font-bold ${t <= 10 ? 'text-emerald-400' : t <= 20 ? 'text-amber-400' : 'text-rose-400'}`}>TACOS: {t.toFixed(1)}%</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex justify-between text-[10px] text-slate-600 mt-1" style={{ paddingLeft: '34px' }}>
                  <span>{fmtDate(daysWithSpend[0].date)}</span>
                  <div className="flex items-center gap-2.5">
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>≤10%</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"/>≤20%</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500"/>&gt;20%</span>
                  </div>
                  <span>{fmtDate(daysWithSpend[daysWithSpend.length - 1].date)}</span>
                </div>
              </div>
            );
          })()}

          {/* ── INTELLIGENCE SECTION ── */}
          {(amazonAdsInsights.hasData || googleInsights?.hasData || metaInsights?.hasData) && (
            <div className="mb-5">
              <h2 className="text-base font-bold text-white flex items-center gap-2 mb-3"><Flame className="w-4 h-4 text-orange-400"/>Intelligence — {dateRangeLabel}</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

                {/* Campaign Performance */}
                {amazonAdsInsights.topCampaigns.length > 0 && (
                  <div className="bg-slate-800/30 rounded-xl border border-slate-700/60 p-4">
                    <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-400"/>Campaigns by Spend</h3>
                    <div className="space-y-1">
                      {amazonAdsInsights.topCampaigns.slice(0, 8).map((c, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg hover:bg-slate-700/30">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.roas >= 3 ? 'bg-emerald-500' : c.roas >= 1.5 ? 'bg-amber-500' : 'bg-rose-500'}`}/>
                          <span className="text-white flex-1 truncate">{c.name}</span>
                          <span className="text-slate-500 w-8 text-right">{c.type || 'SP'}</span>
                          <span className="text-slate-300 w-16 text-right">{formatCurrency(c.spend)}</span>
                          <span className={`font-semibold w-12 text-right ${roasColor(c.roas)}`}>{c.roas > 0 ? c.roas.toFixed(1) + 'x' : '—'}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-slate-600 text-[10px] mt-2">Top {Math.min(8, amazonAdsInsights.topCampaigns.length)} by spend · ROAS color-coded</p>
                  </div>
                )}

                {/* Revenue Attribution */}
                {cur.rev > 0 && (
                  <div className="bg-slate-800/30 rounded-xl border border-slate-700/60 p-4">
                    <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-400"/>Revenue Attribution — {dateRangeLabel}</h3>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex-1 h-5 rounded-full overflow-hidden bg-slate-700/50 flex">
                        <div className="bg-violet-500 h-full transition-all" style={{ width: `${cur.adRevPct}%` }}/>
                        <div className="bg-emerald-500 h-full transition-all" style={{ width: `${cur.organicPct}%` }}/>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div><span className="flex items-center gap-1.5 text-slate-500"><span className="w-2 h-2 rounded-full bg-violet-500"/>Ad-Attributed</span><p className="text-violet-400 font-bold mt-0.5">{formatCurrency(cur.amzAdRev)} <span className="font-normal text-slate-500">({cur.adRevPct.toFixed(0)}%)</span></p></div>
                      <div><span className="flex items-center gap-1.5 text-slate-500"><span className="w-2 h-2 rounded-full bg-emerald-500"/>Organic</span><p className="text-emerald-400 font-bold mt-0.5">{formatCurrency(cur.organicRev)} <span className="font-normal text-slate-500">({cur.organicPct.toFixed(0)}%)</span></p></div>
                      <div><span className="text-slate-500">Total Spend</span><p className="text-white font-bold mt-0.5">{formatCurrency(cur.spend)}</p></div>
                    </div>
                    {cur.tacos > 20 && <p className="text-amber-400 text-[10px] mt-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/>TACOS {cur.tacos.toFixed(1)}% — consider reducing ad dependency</p>}
                  </div>
                )}

                {/* Wasted Spend */}
                {amazonAdsInsights.wastedSpend.length > 0 && (
                  <div className="bg-gradient-to-br from-rose-900/10 to-slate-800/30 rounded-xl border border-rose-500/20 p-4">
                    <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-rose-400"/>Wasted Spend <span className="text-rose-400/70 font-normal text-[10px]">{formatCurrency(amazonAdsInsights.summary?.wastedTotal || 0)}</span></h3>
                    <div className="space-y-1">
                      {amazonAdsInsights.wastedSpend.slice(0, 6).map((t, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 rounded-lg hover:bg-rose-900/10">
                          <span className="text-white flex-1 truncate">{t.term}</span>
                          <span className="text-rose-400 font-medium">{formatCurrency(t.spend)}</span>
                          <span className="text-slate-600">{t.clicks}c</span>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => { setAdsAiInput('Generate negative keywords from my search term data with match types and savings estimates.'); setShowAdsAIChat(true); }} className="mt-2 text-[10px] text-rose-400 hover:text-rose-300">Get negative keyword list →</button>
                  </div>
                )}

                {/* Top Winners */}
                {amazonAdsInsights.topWinners.length > 0 && (
                  <div className="bg-gradient-to-br from-emerald-900/10 to-slate-800/30 rounded-xl border border-emerald-500/20 p-4">
                    <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4 text-emerald-400"/>Top Search Terms</h3>
                    <div className="space-y-1">
                      {amazonAdsInsights.topWinners.slice(0, 6).map((t, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 rounded-lg hover:bg-emerald-900/10">
                          <span className="text-white flex-1 truncate">{t.term}</span>
                          <span className="text-emerald-400 font-medium">{t.roas.toFixed(1)}x</span>
                          <span className="text-slate-500">{formatCurrency(t.spend)}</span>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => { setAdsAiInput('Which of my top search terms should I scale? Show me the math for each.'); setShowAdsAIChat(true); }} className="mt-2 text-[10px] text-emerald-400 hover:text-emerald-300">Get scaling plan →</button>
                  </div>
                )}

                {/* SKU Performance */}
                {amazonAdsInsights.skuPerformance.length > 0 && (
                  <div className="bg-slate-800/30 rounded-xl border border-slate-700/60 p-4">
                    <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><Target className="w-4 h-4 text-violet-400"/>SKU Ad Performance</h3>
                    <div className="space-y-1">
                      {amazonAdsInsights.skuPerformance.slice(0, 6).map((s, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 rounded-lg hover:bg-slate-700/30">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.roas >= 3 ? 'bg-emerald-500' : s.roas >= 1.5 ? 'bg-amber-500' : 'bg-rose-500'}`}/>
                          <span className="text-white flex-1 truncate font-mono text-[10px]">{s.sku}</span>
                          <span className="text-slate-300 w-14 text-right">{formatCurrency(s.spend)}</span>
                          <span className={`font-semibold w-14 text-right ${acosColor(s.acos)}`}>{s.acos < 999 ? s.acos.toFixed(0) + '%' : '—'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Placement Performance */}
                {amazonAdsInsights.placementInsights && amazonAdsInsights.placementInsights.length > 0 && (
                  <div className="bg-slate-800/30 rounded-xl border border-slate-700/60 p-4">
                    <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-amber-400"/>Placements</h3>
                    <div className="space-y-2">
                      {amazonAdsInsights.placementInsights.map((p, i) => (
                        <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg hover:bg-slate-700/30">
                          <span className="text-white font-medium flex-1 truncate">{p.placement}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-slate-400">{formatCurrency(p.spend)}</span>
                            <span className={`font-semibold ${roasColor(p.roas)}`}>{p.roas.toFixed(1)}x</span>
                            <span className="text-slate-500">{formatCurrency(p.cpc)} CPC</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Negative Keywords */}
                {amazonAdsInsights.negativeKeywords.length > 0 && (
                  <div className="bg-slate-800/30 rounded-xl border border-amber-500/15 p-4">
                    <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400"/>Negative Keyword Candidates</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {amazonAdsInsights.negativeKeywords.map((t, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-slate-700/40 rounded-lg text-[10px] border border-slate-600/30">
                          <span className="text-white">{t.term}</span>
                          <span className="text-rose-400">{formatCurrency(t.spend)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Budget Allocation */}
                {cur.spend > 0 && (
                  <div className="bg-slate-800/30 rounded-xl border border-slate-700/60 p-4">
                    <h3 className="text-white font-semibold text-sm mb-3">Budget Allocation</h3>
                    {(() => {
                      const total = cur.amzSpend + cur.gSpend + cur.mSpend;
                      if (total === 0) return <p className="text-slate-600 text-xs">No spend data</p>;
                      return <>
                        <div className="flex h-7 rounded-full overflow-hidden mb-2">
                          {budgetSplit.amazon > 0 && <div className="bg-orange-500 h-full flex items-center justify-center" style={{ width: `${budgetSplit.amazon}%` }}>
                            {budgetSplit.amazon >= 15 && <span className="text-[10px] font-bold text-white/90 truncate px-1">{budgetSplit.amazon.toFixed(0)}%</span>}
                          </div>}
                          {budgetSplit.google > 0 && <div className="bg-red-500 h-full flex items-center justify-center" style={{ width: `${budgetSplit.google}%` }}>
                            {budgetSplit.google >= 10 && <span className="text-[10px] font-bold text-white/90 truncate px-1">{budgetSplit.google.toFixed(0)}%</span>}
                          </div>}
                          {budgetSplit.meta > 0 && <div className="bg-blue-500 h-full flex items-center justify-center" style={{ width: `${budgetSplit.meta}%` }}>
                            {budgetSplit.meta >= 10 && <span className="text-[10px] font-bold text-white/90 truncate px-1">{budgetSplit.meta.toFixed(0)}%</span>}
                          </div>}
                        </div>
                        <div className="flex gap-4 text-xs">
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500"/>Amazon {budgetSplit.amazon.toFixed(0)}% <span className="text-slate-600">{formatCurrency(cur.amzSpend)}</span></span>
                          {budgetSplit.google > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"/>Google {budgetSplit.google.toFixed(0)}% <span className="text-slate-600">{formatCurrency(cur.gSpend)}</span></span>}
                          {budgetSplit.meta > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"/>Meta {budgetSplit.meta.toFixed(0)}% <span className="text-slate-600">{formatCurrency(cur.mSpend)}</span></span>}
                        </div>
                      </>;
                    })()}
                  </div>
                )}

                {/* Google Campaigns */}
                {googleInsights?.topCampaigns?.length > 0 && (
                  <div className="bg-gradient-to-br from-red-900/10 to-slate-800/30 rounded-xl border border-red-500/20 p-4">
                    <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-red-500"/>Google Campaigns</h3>
                    <div className="space-y-1">
                      {googleInsights.topCampaigns.slice(0, 8).map((c, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg hover:bg-slate-700/30">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.roas >= 3 ? 'bg-emerald-500' : c.roas >= 1.5 ? 'bg-amber-500' : 'bg-rose-500'}`}/>
                          <span className="text-white flex-1 truncate">{c.name}</span>
                          <span className="text-slate-300 w-14 text-right">{formatCurrency(c.spend)}</span>
                          <span className={`font-semibold w-12 text-right ${roasColor(c.roas)}`}>{c.roas > 0 ? c.roas.toFixed(1) + 'x' : '—'}</span>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => { setAdsAiInput('Deep dive into my Google Ads campaigns. Which should I scale, pause, or restructure? Show the math.'); setShowAdsAIChat(true); }} className="mt-2 text-[10px] text-red-400 hover:text-red-300">Get Google analysis →</button>
                  </div>
                )}

                {/* Google Wasted Terms */}
                {googleInsights?.wastedTerms?.length > 0 && (
                  <div className="bg-gradient-to-br from-rose-900/10 to-slate-800/30 rounded-xl border border-rose-500/20 p-4">
                    <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-rose-400"/>Google Wasted Terms</h3>
                    <div className="space-y-1">
                      {googleInsights.wastedTerms.slice(0, 6).map((t, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 rounded-lg hover:bg-rose-900/10">
                          <span className="text-white flex-1 truncate">{t.term}</span>
                          <span className="text-rose-400 font-medium">{formatCurrency(t.spend)}</span>
                          <span className="text-slate-600">{t.clicks}c / 0 conv</span>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => { setAdsAiInput('Generate Google Ads negative keyword list from my search term data with match types and savings estimates.'); setShowAdsAIChat(true); }} className="mt-2 text-[10px] text-rose-400 hover:text-rose-300">Get negative keywords →</button>
                  </div>
                )}

                {/* Meta Campaign Performance */}
                {metaInsights?.topCampaigns?.length > 0 && (
                  <div className="bg-gradient-to-br from-blue-900/10 to-slate-800/30 rounded-xl border border-blue-500/20 p-4">
                    <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"/>Meta Campaigns</h3>
                    <div className="space-y-1">
                      {metaInsights.topCampaigns.slice(0, 8).map((c, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg hover:bg-slate-700/30">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.roas >= 3 ? 'bg-emerald-500' : c.roas >= 1.5 ? 'bg-amber-500' : 'bg-rose-500'}`}/>
                          <span className="text-white flex-1 truncate">{c.name}</span>
                          <span className="text-slate-300 w-14 text-right">{formatCurrency(c.spend)}</span>
                          <span className={`font-semibold w-12 text-right ${roasColor(c.roas)}`}>{c.roas > 0 ? c.roas.toFixed(1) + 'x' : '—'}</span>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => { setAdsAiInput('Analyze my Meta Ads campaigns. Which creatives and audiences are winning? What should I kill, scale, or test next?'); setShowAdsAIChat(true); }} className="mt-2 text-[10px] text-blue-400 hover:text-blue-300">Get Meta analysis →</button>
                  </div>
                )}

                {/* Meta Placement Breakdown */}
                {metaInsights?.placementBreakdown?.length > 0 && (
                  <div className="bg-slate-800/30 rounded-xl border border-blue-500/15 p-4">
                    <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-blue-400"/>Meta Placements</h3>
                    <div className="space-y-2">
                      {metaInsights.placementBreakdown.map((p, i) => (
                        <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg hover:bg-slate-700/30">
                          <span className="text-white font-medium flex-1 truncate">{p.placement}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-slate-400">{formatCurrency(p.spend)}</span>
                            <span className={`font-semibold ${roasColor(p.roas)}`}>{p.roas > 0 ? p.roas.toFixed(1) + 'x' : '—'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Day of Week */}
                {dowData.some(d => d.count > 0) && (() => {
                  const maxRev = Math.max(...dowData.map(x => x.avgRev), 0.01);
                  return (
                  <div className="bg-slate-800/30 rounded-xl border border-slate-700/60 p-4">
                    <h3 className="text-white font-semibold text-sm mb-3">Day of Week Performance</h3>
                    <div className="flex items-end gap-1" style={{ height: '72px' }}>
                      {dowData.map((d, i) => {
                        const barH = Math.max((d.avgRev / maxRev) * 52, 3);
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center justify-end group relative" style={{ height: '72px' }}>
                            <div className="w-full bg-cyan-500 rounded-t" style={{ height: `${barH}px`, opacity: d.count > 0 ? 0.7 : 0.2 }}/>
                            <span className="text-[9px] text-slate-600 mt-1 leading-none">{d.day}</span>
                            <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 pointer-events-none">
                              <div className="bg-slate-900 border border-slate-600 rounded p-1.5 text-[10px] whitespace-nowrap shadow-xl">
                                <p className="text-white">${d.avgRev.toFixed(0)} avg rev</p>
                                <p className="text-slate-400">${d.avgSpend.toFixed(0)} avg spend</p>
                                <p className={roasColor(d.roas)}>{d.roas.toFixed(1)}x ROAS</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ── DAILY TABLE ── */}
          {tableRows.length > 0 && (
            <div className="mb-5">
              <h2 className="text-base font-bold text-white flex items-center gap-2 mb-3"><Calendar className="w-4 h-4 text-cyan-400"/>Daily Breakdown — {dateRangeLabel} <span className="text-slate-600 font-normal text-sm">({tableRows.length} days)</span></h2>
              <div className="bg-slate-800/30 rounded-xl border border-slate-700/60 overflow-hidden">
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-800 z-10">
                      <tr className="border-b border-slate-700 text-slate-500 text-[10px] uppercase">
                        <th className="py-2.5 px-3 text-left">Date</th><th className="py-2.5 px-2 text-right">Amazon</th><th className="py-2.5 px-2 text-right">Google</th><th className="py-2.5 px-2 text-right">Meta</th><th className="py-2.5 px-2 text-right">Spend</th><th className="py-2.5 px-2 text-right">Revenue</th><th className="py-2.5 px-2 text-right">ROAS</th><th className="py-2.5 px-2 text-right">TACOS</th><th className="py-2.5 px-2 text-right">Clicks</th><th className="py-2.5 px-2 text-right">Conv</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.slice().reverse().map((d, i) => (
                        <tr key={i} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                          <td className="py-2 px-3 text-slate-400">{fmtDate(d.date)}</td>
                          <td className="py-2 px-2 text-right text-orange-400">{d.amazonAds > 0 ? formatCurrency(d.amazonAds) : '—'}</td>
                          <td className="py-2 px-2 text-right text-red-400">{d.googleAds > 0 ? formatCurrency(d.googleAds) : '—'}</td>
                          <td className="py-2 px-2 text-right text-blue-400">{d.metaAds > 0 ? formatCurrency(d.metaAds) : '—'}</td>
                          <td className="py-2 px-2 text-right text-white font-medium">{formatCurrency(d.totalAds)}</td>
                          <td className="py-2 px-2 text-right text-emerald-400">{formatCurrency(d.totalRev)}</td>
                          <td className={`py-2 px-2 text-right font-medium ${d.roas >= 3 ? 'text-emerald-400' : d.roas >= 1.5 ? 'text-amber-400' : d.roas > 0 ? 'text-rose-400' : 'text-slate-600'}`}>{d.roas > 0 ? d.roas.toFixed(1) + 'x' : '—'}</td>
                          <td className={`py-2 px-2 text-right font-medium ${tacosColor(d.tacos)}`}>{d.tacos > 0 ? d.tacos.toFixed(1) + '%' : '—'}</td>
                          <td className="py-2 px-2 text-right text-slate-400">{d.clicks > 0 ? formatNumber(d.clicks) : '—'}</td>
                          <td className="py-2 px-2 text-right text-violet-400">{d.conversions > 0 ? d.conversions : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="sticky bottom-0 bg-slate-800">
                      <tr className="border-t border-slate-600 font-medium">
                        <td className="py-2 px-3 text-white">Total ({tableRows.length}d)</td>
                        <td className="py-2 px-2 text-right text-orange-400">{formatCurrency(cur.amzSpend)}</td>
                        <td className="py-2 px-2 text-right text-red-400">{formatCurrency(cur.gSpend)}</td>
                        <td className="py-2 px-2 text-right text-blue-400">{formatCurrency(cur.mSpend)}</td>
                        <td className="py-2 px-2 text-right text-white">{formatCurrency(cur.spend)}</td>
                        <td className="py-2 px-2 text-right text-emerald-400">{formatCurrency(cur.rev)}</td>
                        <td className={`py-2 px-2 text-right ${cur.roas >= 3 ? 'text-emerald-400' : cur.roas >= 1.5 ? 'text-amber-400' : 'text-rose-400'}`}>{cur.roas > 0 ? cur.roas.toFixed(1) + 'x' : '—'}</td>
                        <td className={`py-2 px-2 text-right ${tacosColor(cur.tacos)}`}>{cur.tacos > 0 ? cur.tacos.toFixed(1) + '%' : '—'}</td>
                        <td className="py-2 px-2 text-right text-slate-400">{formatNumber(cur.totalClicks)}</td>
                        <td className="py-2 px-2 text-right text-violet-400">{cur.totalConv}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>)}

        {/* ════════════════════════════════════════════════════════ */}
        {/* AI REPORTS TAB                                         */}
        {/* ════════════════════════════════════════════════════════ */}
        {adsViewMode === 'reports' && (<>

          {/* ═══════════════════════════════════════════════════ */}
          {/* DEEP ACTION REPORTS — Best possible output         */}
          {/* ═══════════════════════════════════════════════════ */}
          <div className="bg-gradient-to-br from-violet-900/20 via-slate-800/40 to-orange-900/15 rounded-xl border border-violet-500/30 p-5 mb-5">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
              <div>
                <h3 className="text-white text-lg font-bold flex items-center gap-2"><FileText className="w-5 h-5 text-violet-400"/>Deep Action Reports</h3>
                <p className="text-slate-400 text-xs mt-0.5">Full structured audit with bid calculations, waste analysis, and step-by-step actions</p>
              </div>
              <span className="px-2.5 py-1 bg-violet-600/30 border border-violet-500/40 rounded-lg text-violet-300 text-[10px] font-bold uppercase tracking-wider">Best Quality</span>
            </div>

            {/* Data status indicators */}
            <div className="flex flex-wrap gap-2 mb-4">
              {(() => {
                const indicators = [];
                const hasAmzData = adsIntelData?.lastUpdated;
                const hasDtcData = dtcIntelData?.lastUpdated;
                if (hasAmzData) {
                  const amzDate = new Date(adsIntelData.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  indicators.push({ label: `Amazon data loaded (${amzDate})`, ok: true });
                } else {
                  indicators.push({ label: 'No Amazon data — upload on Data tab', ok: false });
                }
                if (hasDtcData) {
                  const dtcDate = new Date(dtcIntelData.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  indicators.push({ label: `DTC data loaded (${dtcDate})`, ok: true });
                } else {
                  indicators.push({ label: 'No DTC data — upload on Data tab', ok: false });
                }
                return indicators.map((ind, i) => (
                  <span key={i} className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-lg ${ind.ok ? 'bg-emerald-900/30 border border-emerald-500/30 text-emerald-400' : 'bg-slate-800/60 border border-slate-700/50 text-slate-500'}`}>
                    {ind.ok ? <Check className="w-3 h-3"/> : <AlertTriangle className="w-3 h-3"/>}{ind.label}
                  </span>
                ));
              })()}
            </div>

            {/* Deep Report buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                onClick={() => { if (adsIntelData?.lastUpdated) setShowAdsIntelUpload(true); else { setAdsViewMode('upload'); setToast({ message: 'Upload Amazon PPC data first', type: 'info' }); } }}
                className={`relative px-5 py-4 rounded-xl font-semibold text-sm flex items-center gap-3 transition-all ${adsIntelData?.lastUpdated ? 'bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white shadow-lg shadow-orange-500/20' : 'bg-slate-800/60 border border-slate-700/50 text-slate-500 hover:border-orange-500/40 hover:text-slate-300'}`}>
                <span className="text-xl">📦</span>
                <div className="text-left">
                  <div className="flex items-center gap-2">Amazon Deep Report {!adsIntelData?.lastUpdated && <span className="text-[9px] bg-slate-700 px-1.5 py-0.5 rounded">needs data</span>}</div>
                  <p className={`text-[10px] font-normal mt-0.5 ${adsIntelData?.lastUpdated ? 'text-orange-200/80' : 'text-slate-600'}`}>Campaigns, search terms, placements, bid math, SKU profitability</p>
                </div>
                <FileText className="w-4 h-4 ml-auto opacity-60"/>
              </button>

              <button
                onClick={() => { if (dtcIntelData?.lastUpdated) setShowDtcIntelUpload(true); else { setAdsViewMode('upload'); setToast({ message: 'Upload Google/Meta data first', type: 'info' }); } }}
                className={`relative px-5 py-4 rounded-xl font-semibold text-sm flex items-center gap-3 transition-all ${dtcIntelData?.lastUpdated ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20' : 'bg-slate-800/60 border border-slate-700/50 text-slate-500 hover:border-cyan-500/40 hover:text-slate-300'}`}>
                <span className="text-xl">🛍️</span>
                <div className="text-left">
                  <div className="flex items-center gap-2">DTC Deep Report {!dtcIntelData?.lastUpdated && <span className="text-[9px] bg-slate-700 px-1.5 py-0.5 rounded">needs data</span>}</div>
                  <p className={`text-[10px] font-normal mt-0.5 ${dtcIntelData?.lastUpdated ? 'text-cyan-200/80' : 'text-slate-600'}`}>Google + Meta campaigns, creative analysis, audience, budget allocation</p>
                </div>
                <FileText className="w-4 h-4 ml-auto opacity-60"/>
              </button>
            </div>

            <p className="text-slate-600 text-[10px] mt-3 text-center">Uses 9-framework analysis system with pre-computed bid calculations and waste detection</p>
          </div>

          {/* ═══════════════════════════════════════════════════ */}
          {/* SAVED REPORTS — Previously generated deep reports   */}
          {/* ═══════════════════════════════════════════════════ */}
          {(() => {
            const saved = (reportHistory || []).filter(r => r.content && (r.type === 'amazon' || r.type === 'dtc'));
            if (saved.length === 0) return null;
            const viewingReport = viewingReportId ? saved.find(r => r.id === viewingReportId) : null;
            return (
              <div className="bg-slate-800/30 rounded-xl border border-slate-700/60 p-4 mb-5">
                <div className="flex items-center justify-between mb-3">
                  <button onClick={() => setShowSavedReports(!showSavedReports)} className="flex items-center gap-2 text-white font-medium text-sm hover:text-slate-200 transition-colors">
                    <FileText className="w-4 h-4 text-violet-400" />
                    Saved Reports ({saved.length})
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${showSavedReports ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {showSavedReports && !viewingReport && (
                  <div className="space-y-1.5">
                    {saved.map(r => {
                      const date = new Date(r.generatedAt);
                      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                      const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                      const m = r.metrics || {};
                      return (
                        <div key={r.id} className="flex items-center gap-3 bg-slate-900/50 rounded-lg px-3 py-2.5 group hover:bg-slate-900/80 transition-colors">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${r.type === 'amazon' ? 'bg-orange-500' : 'bg-cyan-500'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-slate-200 text-xs font-medium">{r.type === 'amazon' ? 'Amazon PPC Audit' : 'DTC Audit'}</span>
                              <span className="text-slate-500 text-[10px]">{dateStr} {timeStr}</span>
                              {r.model && <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400">{r.model}</span>}
                            </div>
                            {(m.adSpend > 0 || m.revenue > 0) && (
                              <div className="flex items-center gap-3 mt-0.5 text-[10px] text-slate-500">
                                {m.revenue > 0 && <span>Rev {formatCurrency(m.revenue)}</span>}
                                {m.adSpend > 0 && <span>Spend {formatCurrency(m.adSpend)}</span>}
                                {m.roas > 0 && <span className={roasColor(m.roas)}>ROAS {m.roas.toFixed(2)}</span>}
                                {m.acos > 0 && <span className={acosColor(m.acos)}>ACOS {m.acos.toFixed(1)}%</span>}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setViewingReportId(r.id)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors" title="View report">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => { navigator.clipboard.writeText(r.content); setToast({ message: 'Report copied', type: 'success' }); }} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors" title="Copy text">
                              <FileSpreadsheet className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => {
                              if (!window.confirm('Delete this report?')) return;
                              const updated = (reportHistory || []).filter(rr => rr.id !== r.id);
                              setReportHistory(updated);
                            }} className="p-1.5 rounded-lg hover:bg-rose-900/50 text-slate-500 hover:text-rose-400 transition-colors" title="Delete report">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {viewingReport && (
                  <div>
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-700/50">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setViewingReportId(null)} className="text-slate-400 hover:text-white transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                        <span className="text-slate-200 text-sm font-medium">{viewingReport.type === 'amazon' ? 'Amazon PPC Audit' : 'DTC Audit'}</span>
                        <span className="text-slate-500 text-xs">{new Date(viewingReport.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => { navigator.clipboard.writeText(viewingReport.content); setToast({ message: 'Copied', type: 'success' }); }} className="text-slate-500 hover:text-white text-[10px] px-2 py-1 bg-slate-700/40 rounded-lg hover:bg-slate-700">Copy</button>
                        <button onClick={() => {
                          const blob = new Blob([viewingReport.content], { type: 'text/markdown' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a'); a.href = url; a.download = `report-${viewingReport.type}-${viewingReport.generatedAt.slice(0,10)}.md`; a.click();
                          URL.revokeObjectURL(url);
                        }} className="text-slate-500 hover:text-white text-[10px] px-2 py-1 bg-slate-700/40 rounded-lg hover:bg-slate-700">Download .md</button>
                        <button onClick={() => setViewingReportId(null)} className="text-slate-500 hover:text-white text-[10px] px-2 py-1 bg-slate-700/40 rounded-lg hover:bg-slate-700">Close</button>
                      </div>
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto text-sm text-slate-200 leading-relaxed ads-report-content" dangerouslySetInnerHTML={{ __html: markdownToHtml(viewingReport.content) }} />
                  </div>
                )}
              </div>
            );
          })()}

          {/* ═══════════════════════════════════════════════════ */}
          {/* QUICK CHAT AUDIT — Faster, conversational          */}
          {/* ═══════════════════════════════════════════════════ */}
          <div className="bg-gradient-to-r from-orange-900/15 to-amber-900/10 rounded-xl border border-orange-500/25 p-5 mb-5">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div>
                <h3 className="text-white text-base font-semibold flex items-center gap-2"><Brain className="w-4 h-4 text-orange-400"/>Quick Chat Audit</h3>
                <p className="text-slate-500 text-xs mt-0.5">Conversational AI audit — ask follow-up questions, drill into specifics</p>
              </div>
              <select value={aiChatModel} onChange={e => setAiChatModel(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs">
                <optgroup label="Anthropic">{AI_MODEL_OPTIONS.filter(m => m.provider === 'anthropic').map(m => <option key={m.value} value={m.value}>{m.label} ({m.cost})</option>)}</optgroup>
                <optgroup label="OpenAI">{AI_MODEL_OPTIONS.filter(m => m.provider === 'openai').map(m => <option key={m.value} value={m.value}>{m.label} ({m.cost})</option>)}</optgroup>
              </select>
            </div>

            {/* Report Scope */}
            <div className="mb-4">
              <div className="flex flex-wrap gap-1.5">
                {REPORT_MODES.map(m => (
                  <button key={m.key} onClick={() => setReportMode(m.key)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${reportMode === m.key ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-md' : 'bg-slate-700/40 text-slate-400 hover:text-white hover:bg-slate-700 border border-slate-600/30'}`}>
                    <span>{m.icon}</span>{m.label}
                  </button>
                ))}
              </div>
              <p className="text-slate-600 text-[10px] mt-1.5">{REPORT_MODES.find(m => m.key === reportMode)?.desc}</p>
            </div>

            {/* Generate */}
            <button onClick={() => {
              const prompts = {
                all: `Generate a COMPREHENSIVE CROSS-PLATFORM ADVERTISING AUDIT.

ANALYSIS RULES:
- Every recommendation MUST cite the exact campaign/keyword name, current metrics, and dollar impact from the data
- Show bid formula math: Target Bid = Target ACOS × AOV × Conv Rate
- Cross-reference: tie Amazon search terms to campaigns, Google keywords to landing pages, Meta ads to purchase data
- Rank everything by dollar impact (biggest money first)
- Label all Google/Meta numbers as "Platform ROAS" — use TACOS (Total Ad Spend / Total Revenue) as ground truth

REQUIRED SECTIONS:

## 📊 EXECUTIVE SUMMARY
Health score 1-10 with specific justification. Total spend, revenue, TACOS. Per-platform: spend, Platform ROAS, contribution. Revenue equation diagnosis: Traffic × Conv Rate × AOV — which lever is broken? #1 problem costing money NOW (with $ amount). #1 untapped opportunity (with $ estimate).

## 🚫 KILL LIST — Cut Waste Immediately
| Campaign/Keyword | Platform | Spend | Sales/Conv | ROAS | Action (neg exact/phrase, pause, reduce bid to $X.XX) |
Minimum 10 items. Threshold: $10+ spend with $0 sales on Amazon, $15+ on Google, $30+ on Meta. For each negative keyword: specify EXACT vs PHRASE and which campaign.
BOTTOM LINE: "Total monthly savings from cuts: $X"

## 🏆 PROTECT & SCALE — Winners
| Campaign/Keyword | Platform | Spend | ROAS | Conv Rate | Action |
For each winner: is it budget-capped? Target bid calculation. Scaling math: "Currently $X/day at Y ROAS → scale to $Z/day, projecting $W additional revenue." Minimum 8 items.

## 📍 PLACEMENT OPTIMIZATION (Amazon)
TOS vs Product Pages vs RoS: ROAS, CPC, Conv Rate comparison. For each campaign with 50+ clicks on TOS: calculate recommended modifier % = (TOS ROAS / Rest ROAS - 1) × 100.

## 💰 CROSS-PLATFORM BUDGET REALLOCATION
| Channel | Current $/Day | Platform ROAS | Est True ROAS (discount 30-50%) | Recommended $/Day | $ Change |
Total budget stays same. Account for attribution overlap. Meta drives demand → Google captures it. BOTTOM LINE: "Reallocation improves estimated TACOS from X% to Y%."

## 📊 TREND DIAGNOSIS
WoW and MoM trajectory for spend, revenue, ACOS/TACOS. Is ad dependency growing or shrinking? Seasonal patterns? Any campaigns showing declining ROAS trend?

## 🎯 THIS WEEK: Top 5 Priority Actions
Ranked by dollar impact. For each: (1) exact action, (2) where in which ad console, (3) current metric → target metric, (4) expected $/week impact, (5) minutes to implement.`,

                amazon: `Generate a DEEP-DIVE AMAZON ADS AUDIT.

ANALYSIS RULES:
- ONLY cite numbers from the data. Never fabricate campaign names or metrics.
- Show bid formula math on EVERY bid recommendation: Target Bid = Target ACOS × AOV × Conv Rate
- Cross-reference: search terms → campaigns → placements → product profitability
- Rank by dollar impact. Minimum data thresholds: $10+ spend for negatives, 50+ clicks for placement modifiers.

REQUIRED SECTIONS:

## 📊 AMAZON AD HEALTH
Score 1-10 with specific justification. Total: spend, sales, ROAS, ACOS, TACOS. Brand vs non-brand split: % of spend on branded keywords and efficiency difference. Match type comparison: Exact vs Phrase vs Broad ROAS. Funnel: Impressions → Clicks (CTR) → Orders (Conv Rate) — where's the biggest drop-off?

## 🔍 SEARCH TERM DEEP DIVE
### Top 10 Profitable Terms
| Search Term | Spend | Sales | ROAS | ACOS | Conv% | Match Type | Action (increase bid to $X.XX — show math) |
### Top 10 Wasteful Terms
| Search Term | Spend Wasted | Clicks | Orders | Campaign | Action (neg EXACT or PHRASE — specify which and why) |
### Search Term Isolation Candidates
Terms converting in broad/phrase that aren't exact-targeted yet. For each: source campaign → destination campaign → negative to add → bid to set.
BOTTOM LINE: "Negating waste saves ~$X/month. Isolating winners captures ~$X/month additional."

## 📋 CAMPAIGN-BY-CAMPAIGN AUDIT
| Campaign | Type | Status | Spend | Sales | ROAS | ACOS | CPC | Conv% | Budget |
Flag any with ROAS<1.5x (🔴) or ACOS>40% (⚠️). For EACH flagged campaign: 2-3 specific fixes (keywords to negate, bid adjustments with amounts, budget verdict). Check for budget-capped winners — campaigns hitting budget with strong ROAS need budget increases.

## 🎯 TARGETING & MATCH TYPE ANALYSIS
Broad vs Phrase vs Exact efficiency table. Auto vs Manual comparison. Which match types are discovering winners vs burning cash? Specific recommendations: terms to graduate from broad → exact, terms to negate in auto.

## 📍 PLACEMENT OPTIMIZATION
| Campaign | TOS ROAS | TOS Conv% | Product Pages ROAS | Rest ROAS | Current Modifier | Recommended Modifier (show math) |
Only for campaigns with 50+ clicks on TOS. Formula: (TOS ROAS / Baseline ROAS - 1) × 100. Cap at +900%.

## 💡 SKU-LEVEL AD PROFITABILITY
| ASIN/SKU | Ad Spend | Ad Revenue | ACOS | Ad Conv% | Organic Conv% (if available) | Verdict |
Flag: ACOS > margin → unprofitable. Ad conv << organic conv → listing problem. Low spend + high ROAS → under-invested. Spending on ads but losing Buy Box → stop until Buy Box fixed.

## 🎯 THIS WEEK: Top 5 Amazon Actions
Ranked by dollar impact. For each: (1) exact action, (2) Seller Central click-path, (3) current metric → target, (4) expected $/week, (5) minutes.
Total estimated impact: "$X/month from all 5 actions combined."`,

                dtc: `Generate a DTC ADVERTISING AUDIT (Google + Meta combined).

ANALYSIS RULES:
- Label ALL Google/Meta revenue as "Platform ROAS" — it overstates true performance by 20-50% due to attribution overlap
- TACOS (Total Ad Spend / Total Shopify Revenue) is the real metric. MER (Revenue / Ad Spend) is the inverse.
- Cross-reference: Google keywords → landing pages, Meta ads → purchase data, both → Shopify conversion funnel
- Every recommendation: exact name, current metrics, specific action, dollar impact

REQUIRED SECTIONS:

## 📊 DTC AD HEALTH
Score 1-10. Total DTC spend, Shopify revenue, TACOS, MER. Per-platform: spend, Platform ROAS (labeled clearly). Attribution caveat: "Combined platform-reported revenue is $X vs Shopify revenue of $Y — overlap factor of Z." Revenue equation: sessions × conv rate × AOV = revenue. Which lever is weakest?

## 🔍 GOOGLE DEEP DIVE
### Campaign Performance
| Campaign | Type | Cost | Conv Value | Platform ROAS | CPC | Conv Rate | Impression Share | Verdict |
Brand search: is impression share >85%? If not, increase bids. PMax: what % is brand cannibalization? Calculate true non-brand PMax ROAS.
### Search Term Quality
Top 5 converters (scale), Top 5 wasters (negate — specify EXACT vs PHRASE). Total monthly waste.
### Bid Optimization
For top campaigns: Target Bid = Target CPA × Conv Rate. Show exact new bid amounts.

## 📱 META DEEP DIVE
### Campaign/Ad Performance
| Name | Type | Spend | Purchases | Platform ROAS | CPP | CTR | Frequency | Verdict |
Kill rule: CPP > 2x account avg after $30 spend. Fatigue check: frequency > 3.0 + declining CTR.
### Creative Analysis
Which ad formats/angles winning? Hook rate and CTR patterns? 3 specific new creative briefs based on winners: format, hook concept, CTA, testing budget.
### Audience/Placement
Best demographics if available. Feed vs Reels vs Stories vs Audience Network — kill any placement with $30+ spend and 0 purchases.

## 💰 GOOGLE vs META Side-by-Side
| Metric | Google | Meta | Winner |
CPC, CTR, CPA, Platform ROAS, estimated true ROAS (discounted). Which channel has better marginal efficiency? Budget shift recommendation.

## 🔄 BUDGET REALLOCATION
| Channel | Current $/Day | Platform ROAS | Recommended $/Day | $ Change | Why |
Remember: Meta creates demand, Google captures it. Cutting Meta hurts Google non-brand in 2-4 weeks.
BOTTOM LINE: "Reallocation saves/generates ~$X/month."

## 🎯 THIS WEEK: Top 5 DTC Actions
Ranked by dollar impact. For each: platform, exact action, current → target metric, $/week impact, minutes.`,

                google: `Generate a DEEP-DIVE GOOGLE ADS AUDIT.

ANALYSIS RULES:
- Label all revenue as "Platform ROAS" — Google over-attributes by 20-30%
- Show bid math: Target Bid = Target CPA × Conv Rate. Exact amounts, not "increase bids."
- Specify NEGATIVE EXACT vs NEGATIVE PHRASE for every negative keyword and explain why

REQUIRED SECTIONS:

## 📊 GOOGLE ADS HEALTH
Score 1-10. Total: cost, conversions, conv value, Platform ROAS, avg CPC, CTR. Brand vs non-brand split (if identifiable). Campaign type breakdown: Search vs PMax vs Display vs Demand Gen.

## 🔍 SEARCH TERM ANALYSIS
### Top 10 Performers (by conv value)
| Search Term | Campaign | Cost | Conv | Conv Value | ROAS | CPC | Action (scale: increase bid to $X.XX — show math) |
### Top 10 Wasters ($0 conversions)
| Search Term | Campaign | Cost | Clicks | Action (neg EXACT or PHRASE — specify which) |
### Match Type Efficiency
Exact vs Phrase vs Broad: CPC, CTR, Conv Rate, ROAS comparison. Is broad match + Smart Bidding working or bleeding money?
BOTTOM LINE: "Negating waste saves ~$X/month."

## 📋 CAMPAIGN PERFORMANCE
| Campaign | Type | Cost | Conv | Conv Value | ROAS | CPC | CTR | Imp Share | Verdict |
Flag underperformers (ROAS < 2x) and budget-capped winners. For each: specific action with exact bid/budget numbers.
PMax audit: estimated brand cannibalization %. True non-brand PMax ROAS.

## 💡 KEYWORD OPPORTUNITIES
Gaps: converting search terms not yet targeted as keywords. Competitor terms worth testing. Long-tail opportunities from search term data.

## 🎯 THIS WEEK: Top 5 Google Actions
Ranked by dollar impact. Exact action, Google Ads click-path, expected $/week, minutes to implement.`,

                meta: `Generate a DEEP-DIVE META ADS AUDIT.

ANALYSIS RULES:
- Label ALL revenue as "Platform ROAS" — Meta over-attributes by 20-50% vs actual Shopify
- Kill rule: CPP > 2x account avg after $30 spend → OFF. No exceptions.
- Creative is the #1 lever. Analyze hooks, formats, and angles, not just spend/ROAS.

REQUIRED SECTIONS:

## 📊 META ADS HEALTH
Score 1-10. Total: spend, purchases, purchase value, Platform ROAS, avg CPP, avg CPC, avg CPM. Account frequency check — is the audience saturating? Prospecting vs retargeting split.

## 🎨 CREATIVE & AD PERFORMANCE
| Ad Name | Campaign | Spend | Purchases | Platform ROAS | CPP | CTR | CPC | Frequency | Verdict |
### Kill List (CPP > 2x avg OR ROAS < 0.5x avg after $30 spend)
For each: current metrics, why it's failing, monthly savings from pausing.
### Scale List (ROAS > 1.5x avg)
For each: current budget, recommended daily increase (max 20% every 3 days), projected additional purchases.
### Creative Patterns
What formats/hooks/angles are winning vs losing? Video vs static? UGC vs polished? 3 new creative briefs: format, hook (first 3 seconds), body points, CTA, product, testing budget.

## 👥 AUDIENCE & DEMOGRAPHIC ANALYSIS
Best age/gender segment (the "golden cohort") — how much better than average? Worst segment to exclude. Advantage+ signal assessment.

## 📍 PLACEMENT BREAKDOWN
| Placement | Spend | Purchases | Platform ROAS | CPP | Verdict (Scale/Keep/Kill) |
Feed vs Reels vs Stories vs Audience Network. Kill any with $30+ spend and 0 purchases. Is Audience Network wasting money?

## 🎯 THIS WEEK: Top 5 Meta Actions
Ranked by dollar impact. For each: Meta Ads Manager navigation path, exact action, expected $/week, minutes.`,
              };
              setShowAdsAIChat(true);
              setTimeout(() => sendAdsAIMessage(prompts[reportMode]), 200);
            }} className="w-full px-5 py-3.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 rounded-xl text-white font-semibold shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 transition-all">
              <Zap className="w-4 h-4"/>Generate {REPORT_MODES.find(m => m.key === reportMode)?.label} Audit
            </button>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
              {[
                { label: 'Negative Keywords', emoji: '🚫', prompt: "Top 20 negative keywords to add TODAY. For each: the exact search term, which campaign to negate in, EXACT vs PHRASE match type, spend wasted, clicks with 0 orders. Show total monthly savings. Only include terms with $10+ spend and $0 sales." },
                { label: 'Scale Opps', emoji: '📈', prompt: "Top 10 scaling opportunities ranked by revenue potential. For each: keyword/campaign name, current spend, ROAS, conv rate, AOV. Calculate target bid using formula: Target Bid = Target ACOS × AOV × Conv Rate. Show projected additional revenue if bid is increased. Flag budget-capped campaigns." },
                { label: 'Bid Calculator', emoji: '🧮', prompt: "For my top 15 converting search terms, calculate optimal bids using: Target Bid = Target ACOS × AOV × Conv Rate. Show current CPC vs target bid at 25% ACOS and 30% ACOS. Flag terms where current CPC is >20% above or below target. Show the math for each." },
                { label: 'Weekly Plan', emoji: '📋', prompt: "Build my specific weekly PPC action plan based on the data. Monday: exact negatives to add (list them). Tuesday: exact bid adjustments (list amounts). Wednesday: placement modifier changes. Thursday: budget reallocations (exact amounts). Friday: search term isolation moves. Include the specific campaign names, keywords, and dollar amounts from my data." },
              ].map((a, i) => (
                <button key={i} onClick={() => { setShowAdsAIChat(true); setTimeout(() => sendAdsAIMessage(a.prompt), 200); }}
                  className="px-3 py-2.5 bg-slate-700/40 hover:bg-slate-700 rounded-lg text-white text-xs flex items-center gap-1.5 border border-slate-600/30 transition-colors">
                  <span>{a.emoji}</span>{a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Report History */}
          {adsAiReportHistory && adsAiReportHistory.length > 0 && (
            <div className="bg-slate-800/30 rounded-xl border border-slate-700/60 p-4 mb-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-slate-400 font-medium text-xs flex items-center gap-1.5"><Clock className="w-3.5 h-3.5"/>History ({adsAiReportHistory.length})</h3>
                <button onClick={() => setAdsAiReportHistory([])} className="text-[10px] text-slate-600 hover:text-rose-400">Clear</button>
              </div>
              <div className="space-y-1">
                {adsAiReportHistory.slice(-5).reverse().map((r, i) => (
                  <div key={i} className="flex items-center justify-between bg-slate-900/40 rounded-lg px-3 py-1.5 text-[10px]">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">{r.date}</span>
                      <span className={`px-1 py-0.5 rounded ${r.model === 'Opus' ? 'bg-violet-900/50 text-violet-300' : 'bg-slate-700 text-slate-400'}`}>{r.model}</span>
                      {r.healthScore && <span className={`font-bold ${parseInt(r.healthScore) >= 7 ? 'text-emerald-400' : parseInt(r.healthScore) >= 4 ? 'text-amber-400' : 'text-rose-400'}`}>{r.healthScore}/10</span>}
                    </div>
                    <select value={r.actionsTaken || 'pending'} onChange={e => { setAdsAiReportHistory(prev => prev.map((rr, ri) => ri === prev.length - 1 - i ? { ...rr, actionsTaken: e.target.value } : rr)); }} className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-[9px] text-slate-400">
                      <option value="pending">⏳ Pending</option><option value="in-progress">🔄 In Progress</option><option value="completed">✅ Done</option><option value="skipped">⏭ Skip</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Report Output */}
          {adsAiMessages.length > 0 && (
            <div className="bg-slate-800/30 rounded-xl border border-slate-700/60 p-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="text-white font-semibold text-sm">Report Output</h3>
                <div className="flex items-center gap-1">
                  <button onClick={() => { const r = adsAiMessages.filter(m => m.role === 'assistant').map(m => m.content).join('\n\n---\n\n'); navigator.clipboard.writeText(r).then(() => setToast({ message: 'Copied', type: 'success' })); }} className="text-slate-500 hover:text-white text-[10px] px-2 py-1 bg-slate-700/40 rounded-lg hover:bg-slate-700">📋 Text</button>
                  <button onClick={() => { const r = adsAiMessages.filter(m => m.role === 'assistant').map(m => m.content).join('\n\n---\n\n'); const html = markdownToHtml(r); const blob = new Blob([html], { type: 'text/html' }); const item = new ClipboardItem({ 'text/html': blob, 'text/plain': new Blob([r], { type: 'text/plain' }) }); navigator.clipboard.write([item]).then(() => setToast({ message: 'Copied for Docs', type: 'success' })).catch(() => navigator.clipboard.writeText(r)); }} className="text-slate-500 hover:text-white text-[10px] px-2 py-1 bg-slate-700/40 rounded-lg hover:bg-slate-700">📄 Docs</button>
                  <button onClick={() => { const bn = storeName || 'Brand'; const r = adsAiMessages.map(m => m.role === 'user' ? `**PROMPT:** ${m.content}` : m.content).join('\n\n---\n\n'); const h = `# ${bn} Advertising Audit\n**${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}** · ${getModelLabel(aiChatModel)}\n\n---\n\n`; const blob = new Blob([h + r], { type: 'text/markdown' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${(bn).toLowerCase().replace(/\s+/g, '-')}-audit-${new Date().toISOString().slice(0, 10)}.md`; a.click(); URL.revokeObjectURL(url); setToast({ message: 'Downloaded', type: 'success' }); }} className="text-slate-500 hover:text-white text-[10px] px-2 py-1 bg-slate-700/40 rounded-lg hover:bg-slate-700">⬇ .md</button>
                  <button onClick={() => {
                    const report = adsAiMessages.filter(m => m.role === 'assistant').map(m => m.content).join('\n\n---\n\n');
                    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                    const modelName = getModelLabel(aiChatModel);
                    const modeLabel = REPORT_MODES.find(m => m.key === reportMode)?.label || 'All Platforms';
                    const htmlBody = markdownToHtml(report);
                    const bn = storeName || 'Brand';
                    const fileName = `${(bn).toLowerCase().replace(/\s+/g, '-')}-ppc-audit-${new Date().toISOString().slice(0, 10)}`;
                    const kpiCards = [
                      { label: 'Ad Spend', value: `$${(cur.spend || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
                      { label: 'Revenue', value: `$${(cur.rev || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
                      { label: 'ROAS', value: `${(cur.roas || 0).toFixed(2)}x` },
                      { label: 'ACOS', value: `${cur.roas > 0 ? (100 / cur.roas).toFixed(1) : '0'}%` },
                      { label: 'TACOS', value: `${(cur.tacos || 0).toFixed(1)}%` },
                    ];
                    const kpiHtml = `<div class="kpi-strip">${kpiCards.map(k => `<div class="kpi-card"><div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div></div>`).join('')}</div>`;
                    const pdfStyles = `
@page { margin: 0.6in 0.65in; size: letter; }
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif; color: #1a1a2e; line-height: 1.6; font-size: 10pt; }

/* ── Cover Header ── */
.cover { background: linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0f3460 100%); color: white; padding: 36px 44px 24px; margin: -0.6in -0.65in 0; }
.cover .brand { font-size: 11pt; font-weight: 500; letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-bottom: 2px; }
.cover h1 { font-size: 26pt; font-weight: 900; letter-spacing: -0.5px; margin: 0 0 4px; line-height: 1.15; }
.cover .subtitle { font-size: 12pt; font-weight: 300; color: rgba(255,255,255,0.7); margin-bottom: 16px; }
.cover .meta-row { display: flex; gap: 24px; font-size: 8.5pt; color: rgba(255,255,255,0.45); border-top: 1px solid rgba(255,255,255,0.1); padding-top: 12px; }

/* ── KPI Strip ── */
.kpi-strip { display: flex; gap: 0; margin: 0 -0.65in; padding: 18px 44px; background: #0a1628; border-bottom: 3px solid #e94560; }
.kpi-card { flex: 1; text-align: center; border-right: 1px solid rgba(255,255,255,0.08); padding: 0 12px; }
.kpi-card:last-child { border-right: none; }
.kpi-label { font-size: 7pt; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.4); margin-bottom: 3px; font-weight: 600; }
.kpi-value { font-size: 16pt; font-weight: 800; color: white; letter-spacing: -0.3px; }

/* ── Content Area ── */
.content { padding: 28px 0 0; }
.confidential { background: #f8f9fa; border-left: 4px solid #e94560; padding: 10px 16px; margin-bottom: 28px; font-size: 8pt; color: #6b7280; font-weight: 500; letter-spacing: 0.3px; }

/* ── Typography ── */
h1 { font-size: 18pt; font-weight: 800; color: #0f172a; margin: 36px 0 12px; letter-spacing: -0.3px; }
h2 { font-size: 13pt; font-weight: 700; color: #1e293b; margin: 30px 0 10px; padding-bottom: 8px; border-bottom: 2.5px solid #e94560; letter-spacing: -0.2px; }
h3 { font-size: 11pt; font-weight: 600; color: #334155; margin: 22px 0 8px; padding-left: 12px; border-left: 3px solid #6366f1; }
h4 { font-size: 10pt; font-weight: 600; color: #475569; margin: 16px 0 6px; }
p { font-size: 10pt; margin-bottom: 6px; line-height: 1.65; color: #374151; }
li { font-size: 10pt; margin-bottom: 4px; line-height: 1.55; color: #374151; }
ul, ol { padding-left: 20px; margin-bottom: 10px; }
strong { color: #e94560; font-weight: 700; }
em { color: #6366f1; }
code { background: #f1f5f9; padding: 1px 6px; border-radius: 3px; font-size: 9pt; font-family: 'SF Mono', 'Fira Code', monospace; color: #7c3aed; }
hr { border: none; border-top: 1px solid #e5e7eb; margin: 28px 0; }

/* ── Tables ── */
.table-wrap { margin: 14px 0 18px; border-radius: 6px; overflow: hidden; border: 1px solid #d1d5db; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
.table-wrap table, table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin: 0; }
.table-wrap th, table th {
  background: #0f172a; color: #e2e8f0; font-weight: 700; text-align: left;
  padding: 9px 10px; font-size: 7pt; text-transform: uppercase; letter-spacing: 0.6px;
  border-bottom: 2px solid #e94560; white-space: nowrap;
}
.table-wrap td, table td {
  padding: 7px 10px; border-bottom: 1px solid #f3f4f6; font-size: 8.5pt;
  color: #374151; vertical-align: top; line-height: 1.4;
}
.table-wrap tbody tr:nth-child(even), table tbody tr:nth-child(even) { background: #f9fafb; }
.table-wrap tbody tr:nth-child(odd), table tbody tr:nth-child(odd) { background: #ffffff; }

/* ── Footer ── */
.footer { margin-top: 48px; padding-top: 16px; border-top: 2px solid #0f172a; text-align: center; }
.footer p { font-size: 7.5pt; color: #9ca3af; margin-bottom: 2px; }
.footer .brand-line { font-size: 8.5pt; font-weight: 700; color: #1e293b; letter-spacing: 0.5px; margin-bottom: 4px; }

/* ── Print Overrides ── */
@media print {
  .no-print { display: none !important; }
  .cover, .kpi-strip { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .table-wrap th, table th { background: #0f172a !important; color: #e2e8f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  table { page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  h2, h3 { page-break-after: avoid; }
  .table-wrap { page-break-inside: auto; }
}`;
                    const printDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${fileName}</title><style>${pdfStyles}</style></head><body>
<div class="cover">
  <div class="brand">${bn}</div>
  <h1>PPC Advertising Audit</h1>
  <div class="subtitle">${modeLabel} Performance Report</div>
  <div class="meta-row"><span>${dateStr}</span><span>${modelName}</span><span>${dateRangeLabel} window</span></div>
</div>
${kpiHtml}
<div class="content">
  <div class="no-print" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:14px 24px;margin-bottom:24px;border-radius:8px;font-size:10pt;display:flex;justify-content:space-between;align-items:center;">
    <span><strong>PDF Preview</strong> — Use Ctrl+P / Cmd+P and select "Save as PDF"</span>
    <button onclick="window.print()" style="background:white;color:#6366f1;border:none;padding:8px 20px;border-radius:6px;font-weight:700;cursor:pointer;font-size:10pt;">Save as PDF</button>
  </div>
  <div class="confidential">CONFIDENTIAL — Proprietary advertising intelligence for ${bn}. Do not distribute.</div>
  ${htmlBody}
</div>
<div class="footer">
  <p class="brand-line">${bn} Advertising Command Center</p>
  <p>${modeLabel} Audit &middot; ${dateStr} &middot; ${modelName}</p>
  <p style="margin-top:6px;font-size:6.5pt;color:#d1d5db;">AI-generated analysis. Validate recommendations before implementation. ID: ${Date.now().toString(36).toUpperCase()}</p>
</div></body></html>`;
                    const blob = new Blob([printDoc], { type: 'text/html' });
                    const blobUrl = URL.createObjectURL(blob);
                    const w = window.open(blobUrl, '_blank');
                    if (!w) { setToast({ message: 'Please allow popups to export PDF', type: 'error' }); URL.revokeObjectURL(blobUrl); return; }
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                  }} className="px-3 py-1.5 bg-gradient-to-r from-orange-600/80 to-amber-600/80 rounded-lg text-white text-[10px] font-medium hover:from-orange-500 hover:to-amber-500 flex items-center gap-1">📊 Export PDF</button>
                </div>
              </div>
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {adsAiMessages.map((msg, i) => (
                  <div key={i} className={`${msg.role === 'user' ? 'bg-orange-900/15 border border-orange-500/15' : 'bg-slate-900/40'} rounded-xl p-4 group relative`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[10px] text-slate-600 mb-1">{msg.role === 'user' ? 'Prompt' : 'AI Report'}</p>
                      <button onClick={() => { if (msg.role === 'user') setAdsAiMessages(prev => prev.filter((_, j) => j !== i && j !== i + 1)); else setAdsAiMessages(prev => prev.filter((_, j) => j !== i)); }}
                        className="hidden group-hover:block p-1 rounded hover:bg-rose-900/30 text-slate-700 hover:text-rose-400"><X className="w-3 h-3"/></button>
                    </div>
                    {msg.role === 'assistant' ? (
                      <div className="text-sm text-slate-200 leading-relaxed ads-report-content" dangerouslySetInnerHTML={{ __html: markdownToHtml(msg.content) }} />
                    ) : (
                      <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    )}
                  </div>
                ))}
                {adsAiLoading && <div className="bg-slate-900/40 rounded-xl p-4"><div className="flex gap-1"><div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}/><div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}/><div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}/></div></div>}
              </div>
            </div>
          )}
        </>)}

        {/* ════════════════════════════════════════════════════════ */}
        {/* DATA TAB                                               */}
        {/* ════════════════════════════════════════════════════════ */}
        {adsViewMode === 'upload' && (<>
          <div className={`rounded-xl border-2 border-dashed p-6 text-center transition-all mb-5 ${isDragging ? 'border-violet-400 bg-violet-900/20' : 'border-slate-700/60 bg-slate-800/20 hover:border-slate-600'}`}
            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
            {uploadStatus?.processing ? (
              <div className="py-4"><Loader2 className="w-10 h-10 text-violet-400 mx-auto mb-3 animate-spin"/><p className="text-white font-medium text-sm">Processing...</p></div>
            ) : (<>
              <Upload className="w-8 h-8 text-slate-500 mx-auto mb-3"/>
              <h3 className="text-white font-semibold mb-1">Drop Ad Reports Here</h3>
              <p className="text-slate-500 text-xs mb-3 max-w-md mx-auto">CSV, XLSX, or ZIP — auto-detects Amazon PPC, Google Ads, Meta Ads, Shopify, Brand Analytics</p>
              <button onClick={() => fileInputRef.current?.click()} className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 rounded-xl text-white text-sm font-medium shadow-lg shadow-violet-500/20">
                <span className="flex items-center gap-2"><FileSpreadsheet className="w-4 h-4"/>Choose Files</span>
              </button>
              <input ref={fileInputRef} type="file" multiple accept=".csv,.xlsx,.xls,.zip,.tsv" className="hidden" onChange={e => handleFileDrop(e.target.files)}/>
              <div className="flex justify-center gap-4 mt-4 text-[10px] text-slate-600">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-500"/>Amazon</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500"/>Google</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"/>Meta</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>Shopify</span>
              </div>
            </>)}
          </div>

          {uploadStatus?.results && (
            <div className="bg-slate-800/30 rounded-xl border border-slate-700/60 p-4 mb-5">
              <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400"/>Last Upload</h3>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="bg-emerald-900/15 rounded-lg border border-emerald-500/20 p-3 text-center"><p className="text-xl font-bold text-emerald-400">{uploadStatus.results.summary.tier1}</p><p className="text-slate-500 text-[10px]">Daily KPIs</p></div>
                <div className="bg-violet-900/15 rounded-lg border border-violet-500/20 p-3 text-center"><p className="text-xl font-bold text-violet-400">{uploadStatus.results.summary.tier2}</p><p className="text-slate-500 text-[10px]">Deep Analysis</p></div>
                <div className={`rounded-lg border p-3 text-center ${uploadStatus.results.summary.unrecognized > 0 ? 'bg-amber-900/15 border-amber-500/20' : 'bg-slate-800/30 border-slate-700/50'}`}><p className={`text-xl font-bold ${uploadStatus.results.summary.unrecognized > 0 ? 'text-amber-400' : 'text-slate-600'}`}>{uploadStatus.results.summary.unrecognized}</p><p className="text-slate-500 text-[10px]">Unrecognized</p></div>
              </div>
              <div className="space-y-1">
                {uploadStatus.results.summary.reportTypes.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-slate-900/30 rounded-lg px-3 py-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${r.platform === 'amazon' ? 'bg-orange-500' : r.platform === 'google' ? 'bg-red-500' : r.platform === 'meta' ? 'bg-blue-500' : 'bg-emerald-500'}`}/>
                    <span className="text-white flex-1">{r.label}</span>
                    <span className="text-slate-600 text-[10px] truncate max-w-[180px]">{r.fileName}</span>
                  </div>
                ))}
                {uploadStatus.results.unrecognized.map((r, i) => (
                  <div key={`u${i}`} className="flex items-center gap-2 text-xs bg-amber-900/10 rounded-lg px-3 py-1.5">
                    <AlertTriangle className="w-3 h-3 text-amber-400"/><span className="text-amber-300 flex-1">{r.fileName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-slate-800/20 rounded-xl border border-slate-700/50 p-4">
            <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><Database className="w-4 h-4 text-cyan-400"/>Loaded Data</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div className="bg-slate-900/40 rounded-lg p-3"><div className="flex items-center gap-1.5 mb-1"><span className="w-2 h-2 rounded-full bg-orange-500"/><span className="text-white text-xs font-medium">Amazon</span></div><p className="text-slate-500 text-[10px]">{sortedDays.filter(d => allDaysData[d]?.amazon?.adSpend > 0).length}d daily · {sortedDays.filter(d => (allDaysData[d]?.amazonAdsMetrics?.spend || 0) > 0).length}d bulk</p></div>
              <div className="bg-slate-900/40 rounded-lg p-3"><div className="flex items-center gap-1.5 mb-1"><span className="w-2 h-2 rounded-full bg-red-500"/><span className="text-white text-xs font-medium">Google</span></div><p className="text-slate-500 text-[10px]">{sortedDays.filter(d => (allDaysData[d]?.shopify?.googleSpend ?? allDaysData[d]?.googleSpend ?? 0) > 0).length}d spend · {sortedDays.filter(d => (allDaysData[d]?.googleImpressions ?? allDaysData[d]?.shopify?.adsMetrics?.googleImpressions ?? 0) > 0).length}d metrics</p></div>
              <div className="bg-slate-900/40 rounded-lg p-3"><div className="flex items-center gap-1.5 mb-1"><span className="w-2 h-2 rounded-full bg-blue-500"/><span className="text-white text-xs font-medium">Meta</span></div><p className="text-slate-500 text-[10px]">{sortedDays.filter(d => (allDaysData[d]?.shopify?.metaSpend ?? allDaysData[d]?.metaSpend ?? 0) > 0).length}d spend · {sortedDays.filter(d => (allDaysData[d]?.metaImpressions ?? allDaysData[d]?.shopify?.adsMetrics?.metaImpressions ?? 0) > 0).length}d metrics</p></div>
            </div>
            {(() => {
              const ALL_REPORTS = [
                { platform: 'amazon', key: 'sp_campaigns', label: 'SP Campaigns', source: 'API + CSV' },
                { platform: 'amazon', key: 'sp_search_terms', label: 'SP Search Terms', source: 'API + CSV' },
                { platform: 'amazon', key: 'sp_advertised_product', label: 'SP Advertised Product', source: 'API + CSV' },
                { platform: 'amazon', key: 'sp_purchased_product', label: 'SP Purchased Product', source: 'CSV only' },
                { platform: 'amazon', key: 'sp_targeting', label: 'SP Targeting', source: 'API + CSV' },
                { platform: 'amazon', key: 'sp_placement', label: 'SP Placement', source: 'API + CSV' },
                { platform: 'amazon', key: 'sb_campaigns', label: 'SB Campaigns', source: 'API + CSV' },
                { platform: 'amazon', key: 'sb_search_terms', label: 'SB Search Terms', source: 'API + CSV' },
                { platform: 'amazon', key: 'sb_campaign_placement', label: 'SB Campaign Placement', source: 'CSV only' },
                { platform: 'amazon', key: 'sd_campaigns', label: 'SD Campaigns', source: 'API + CSV' },
                { platform: 'amazon', key: 'search_query_performance', label: 'Search Query Performance', source: 'CSV only (Brand Analytics)' },
                { platform: 'amazon', key: 'business_report_child', label: 'Business Report (Child ASIN)', source: 'CSV only (Seller Central)' },
                { platform: 'amazon', key: 'business_report_parent', label: 'Business Report (Parent ASIN)', source: 'CSV only (Seller Central)' },
                { platform: 'amazon', key: 'sku_economics', label: 'SKU Economics', source: 'CSV only (Seller Central)' },
                { platform: 'google', key: 'google_campaign_perf', label: 'Google Campaign Performance', source: 'CSV only' },
                { platform: 'google', key: 'google_search_terms', label: 'Google Search Terms', source: 'CSV only' },
                { platform: 'google', key: 'google_keywords', label: 'Google Keywords', source: 'CSV only' },
                { platform: 'google', key: 'google_ad_groups', label: 'Google Ad Groups', source: 'CSV only' },
                { platform: 'meta', key: 'meta_campaign_perf', label: 'Meta Campaign Performance', source: 'CSV only' },
                { platform: 'meta', key: 'meta_ad_sets', label: 'Meta Ad Sets', source: 'CSV only' },
                { platform: 'meta', key: 'meta_ads', label: 'Meta Ads', source: 'CSV only' },
                { platform: 'meta', key: 'meta_placement', label: 'Meta Placement', source: 'CSV only' },
              ];
              const platformColor = { amazon: 'bg-orange-500', google: 'bg-red-500', meta: 'bg-blue-500' };
              const getFreshness = (uploadedAt) => {
                if (!uploadedAt) return null;
                const days = Math.floor((Date.now() - new Date(uploadedAt).getTime()) / 86400000);
                if (days <= 7) return { dot: 'bg-emerald-500', text: 'text-emerald-500', label: days === 0 ? 'today' : `${days}d ago` };
                if (days <= 14) return { dot: 'bg-amber-500', text: 'text-amber-500', label: `${days}d ago` };
                return { dot: 'bg-rose-500', text: 'text-rose-500', label: `${days}d ago` };
              };
              return (
                <div>
                  <h4 className="text-violet-400 text-[10px] font-semibold uppercase tracking-wider mb-2">Deep Analysis Reports</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {ALL_REPORTS.map(({ platform, key, label, source }) => {
                      const data = adsIntelData?.[platform]?.[key];
                      const hasData = data?.records?.length > 0;
                      const freshness = hasData ? getFreshness(data.meta?.uploadedAt || data.uploadedAt) : null;
                      const rptId = `${platform}-${key}`;
                      const isExpanded = expandedReport === rptId;
                      return (
                        <div key={rptId}
                          onClick={() => hasData && setExpandedReport(isExpanded ? null : rptId)}
                          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs ${hasData ? 'bg-slate-900/30 cursor-pointer hover:bg-slate-800/50 transition-colors' : 'bg-slate-900/15 border border-dashed border-slate-700/40'} ${isExpanded ? 'ring-1 ring-violet-500/50' : ''}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${hasData ? (freshness?.dot || platformColor[platform] || 'bg-emerald-500') : 'bg-slate-700'}`}/>
                          <span className={`flex-1 truncate ${hasData ? 'text-white' : 'text-slate-600'}`}>{data?.meta?.label || label}</span>
                          {hasData ? (
                            <span className="flex items-center gap-1.5 shrink-0">
                              <span className="text-slate-500 text-[10px]">{data.records.length} rows{data.meta?.source === 'amazon-ads-api' ? ' · API' : ''}</span>
                              {freshness && <span className={`text-[10px] ${freshness.text}`}>· {freshness.label}</span>}
                              <ChevronDown className={`w-3 h-3 text-slate-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}/>
                            </span>
                          ) : (
                            <span className="text-slate-700 text-[10px] italic shrink-0">{source}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* Expanded detail panel for selected report */}
                  {expandedReport && (() => {
                    const rpt = ALL_REPORTS.find(r => `${r.platform}-${r.key}` === expandedReport);
                    if (!rpt) return null;
                    const data = adsIntelData?.[rpt.platform]?.[rpt.key];
                    if (!data?.records?.length) return null;
                    const records = data.records;
                    const headers = data.headers || Object.keys(records[0] || {});
                    // Build a smart summary based on report type
                    const isBizReport = rpt.key.startsWith('business_report');
                    const isSkuEcon = rpt.key === 'sku_economics';
                    const isCampaign = rpt.key.includes('campaign');
                    const isSearchTerms = rpt.key.includes('search_term');
                    // Extract useful summary stats
                    let summaryItems = [];
                    if (isBizReport) {
                      const asins = [...new Set(records.map(r => r['(Child) ASIN'] || r['(Parent) ASIN'] || r['ASIN'] || r.asin || '').filter(Boolean))];
                      const titles = records.filter(r => (r['Title'] || r.title || '').trim()).length;
                      summaryItems = [
                        { label: 'Unique ASINs', value: asins.length },
                        { label: 'With titles', value: titles, warn: titles === 0 },
                        { label: 'Missing titles', value: records.length - titles, warn: records.length - titles > 0 },
                      ];
                    } else if (isSkuEcon) {
                      const asins = [...new Set(records.map(r => r['ASIN'] || r['Parent ASIN'] || r.asin || '').filter(Boolean))];
                      const withMargin = records.filter(r => Number(r['Contribution margin'] || r['Contribution Margin'] || r.contributionMargin || 0) !== 0).length;
                      const withCogs = records.filter(r => Number(r['Cost of goods per unit'] || r['COGS per unit'] || r.cogsPerUnit || 0) !== 0).length;
                      summaryItems = [
                        { label: 'Unique ASINs', value: asins.length },
                        { label: 'With margin data', value: withMargin },
                        { label: 'With COGS', value: withCogs },
                      ];
                    } else if (isCampaign) {
                      const campNames = [...new Set(records.map(r => r['Campaign Name'] || r['Campaign name'] || r.campaign || r.name || '').filter(Boolean))];
                      summaryItems = [{ label: 'Campaigns', value: campNames.length }];
                    } else if (isSearchTerms) {
                      summaryItems = [{ label: 'Search terms', value: records.length }];
                    }
                    return (
                      <div className="mt-2 bg-slate-900/60 border border-slate-700/50 rounded-lg p-3 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <p className="text-white text-xs font-medium">{rpt.label} — Data Preview</p>
                          <button onClick={(e) => { e.stopPropagation(); setExpandedReport(null); }} className="text-slate-500 hover:text-white text-[10px]">Close</button>
                        </div>
                        {/* Summary stats */}
                        {summaryItems.length > 0 && (
                          <div className="flex gap-3 flex-wrap">
                            {summaryItems.map((s, i) => (
                              <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full ${s.warn ? 'bg-amber-900/40 text-amber-400' : 'bg-slate-800 text-slate-300'}`}>
                                {s.label}: <span className="font-medium">{s.value}</span>
                              </span>
                            ))}
                          </div>
                        )}
                        {/* Column headers detected */}
                        <div>
                          <p className="text-slate-500 text-[10px] mb-1">Columns detected ({headers.length}):</p>
                          <p className="text-slate-400 text-[10px] leading-relaxed">{headers.join(' · ')}</p>
                        </div>
                        {/* Sample rows */}
                        <div>
                          <p className="text-slate-500 text-[10px] mb-1">Sample data (first {Math.min(5, records.length)} of {records.length} rows):</p>
                          <div className="overflow-x-auto">
                            <table className="w-full text-[10px]">
                              <thead><tr className="border-b border-slate-700/50">
                                {headers.slice(0, 6).map((h, i) => <th key={i} className="py-1 px-1.5 text-left text-slate-500 font-medium whitespace-nowrap">{h.length > 20 ? h.substring(0, 18) + '..' : h}</th>)}
                                {headers.length > 6 && <th className="py-1 px-1.5 text-slate-600">+{headers.length - 6} more</th>}
                              </tr></thead>
                              <tbody>{records.slice(0, 5).map((row, ri) => (
                                <tr key={ri} className="border-b border-slate-800/30">
                                  {headers.slice(0, 6).map((h, ci) => {
                                    const val = row[h];
                                    const display = val == null ? '—' : String(val).length > 25 ? String(val).substring(0, 23) + '..' : String(val);
                                    return <td key={ci} className="py-0.5 px-1.5 text-slate-300 whitespace-nowrap">{display}</td>;
                                  })}
                                  {headers.length > 6 && <td className="py-0.5 px-1.5 text-slate-600">…</td>}
                                </tr>
                              ))}</tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

            {adsIntelData?.amazon?.search_query_performance && (
              <div className="mt-4 pt-4 border-t border-slate-700/50">
                <h4 className="text-amber-400 text-[10px] font-semibold uppercase tracking-wider mb-2">Brand Analytics — Search Query Performance</h4>
                <div className="overflow-x-auto"><table className="w-full text-xs">
                  <thead><tr className="border-b border-slate-700/50 text-slate-500"><th className="py-1.5 text-left">#</th><th className="py-1.5 text-left">Query</th><th className="py-1.5 text-right">Volume</th><th className="py-1.5 text-right">Brand %</th><th className="py-1.5 text-right">Click %</th></tr></thead>
                  <tbody>{adsIntelData.amazon.search_query_performance.records.slice(0, 15).map((r, i) => (
                    <tr key={i} className="border-b border-slate-800/30"><td className="py-1 text-slate-600">{i + 1}</td><td className="py-1 text-white">{r['Search Query'] || '—'}</td><td className="py-1 text-right text-slate-400">{formatNumber(Number(r['Search Query Volume'] || 0))}</td><td className="py-1 text-right text-cyan-400">{Number(r['Impressions: Brand Share %'] || 0).toFixed(1)}%</td><td className="py-1 text-right text-emerald-400">{Number(r['Clicks: Brand Share %'] || 0).toFixed(1)}%</td></tr>
                  ))}</tbody>
                </table></div>
              </div>
            )}
          </div>
        </>)}

        {/* ════════════════════════════════════════════════════════ */}
        {/* FLOATING AI CHAT                                       */}
        {/* ════════════════════════════════════════════════════════ */}
        {showAdsAIChat && (
          <div className="fixed bottom-4 right-4 z-50 w-[520px] max-w-[calc(100vw-2rem)]">
            <div className="bg-slate-800 rounded-2xl border border-orange-500/40 shadow-2xl overflow-hidden">
              <div className="bg-gradient-to-r from-orange-600 to-amber-600 p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center"><Zap className="w-4 h-4 text-white"/></div>
                  <div><h3 className="text-white font-semibold text-sm">AI Ads Analyst</h3><p className="text-white/60 text-[10px]">{sortedDays.length}d data{deepReportCount > 0 ? ` · ${deepReportCount} reports` : ''}</p></div>
                </div>
                <div className="flex items-center gap-1.5">
                  <select value={aiChatModel} onChange={e => setAiChatModel(e.target.value)} className="bg-white/10 border border-white/20 rounded-lg px-1.5 py-1 text-white text-[10px]">
                    <optgroup label="Anthropic">{AI_MODEL_OPTIONS.filter(m => m.provider === 'anthropic').map(m => <option key={m.value} value={m.value}>{m.label.replace('Claude ', '')} ({m.cost})</option>)}</optgroup>
                    <optgroup label="OpenAI">{AI_MODEL_OPTIONS.filter(m => m.provider === 'openai').map(m => <option key={m.value} value={m.value}>{m.label} ({m.cost})</option>)}</optgroup>
                  </select>
                  <button onClick={() => setAdsAiMessages([])} className="p-1.5 hover:bg-white/20 rounded-lg text-white/60 hover:text-white" title="Clear"><RefreshCw className="w-3.5 h-3.5"/></button>
                  <button onClick={() => setShowAdsAIChat(false)} className="p-1.5 hover:bg-white/20 rounded-lg text-white"><X className="w-4 h-4"/></button>
                </div>
              </div>
              <div className="h-[30rem] overflow-y-auto p-4 space-y-3">
                {adsAiMessages.length === 0 && (
                  <div className="text-center text-slate-500 py-2">
                    <Zap className="w-8 h-8 mx-auto mb-2 opacity-40"/>
                    <p className="text-xs mb-3">Ask anything about your ads</p>
                    <div className="space-y-1.5 text-left">
                      <button onClick={() => sendAdsAIMessage("Generate my complete cross-platform Ads Action Plan with specific recommendations and dollar amounts.")} className="block w-full px-3 py-2.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 rounded-lg text-xs text-white font-semibold shadow-lg shadow-orange-500/20">⚡ Full Action Plan</button>
                      <button onClick={() => sendAdsAIMessage("Which campaigns or search terms are wasting money? Give me negative keyword suggestions.")} className="block w-full px-3 py-2 bg-slate-700/40 hover:bg-slate-700 rounded-lg text-xs text-slate-300">⚠️ Find wasted spend</button>
                      <button onClick={() => sendAdsAIMessage("What are my best scaling opportunities across all platforms?")} className="block w-full px-3 py-2 bg-slate-700/40 hover:bg-slate-700 rounded-lg text-xs text-slate-300">🚀 Scaling opportunities</button>
                      <button onClick={() => sendAdsAIMessage("How should I reallocate budget across Amazon, Google, and Meta?")} className="block w-full px-3 py-2 bg-slate-700/40 hover:bg-slate-700 rounded-lg text-xs text-slate-300">💰 Budget allocation</button>
                    </div>
                  </div>
                )}
                {adsAiMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group`}>
                    <div className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 relative ${msg.role === 'user' ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-200'}`}>
                      <button onClick={() => { if (msg.role === 'user') setAdsAiMessages(prev => prev.filter((_, j) => j !== i && j !== i + 1)); else setAdsAiMessages(prev => prev.filter((_, j) => j !== i)); }}
                        className={`absolute -top-1.5 -right-1.5 hidden group-hover:flex w-4 h-4 items-center justify-center rounded-full text-white shadow ${msg.role === 'user' ? 'bg-rose-500' : 'bg-slate-500 hover:bg-rose-500'}`}>
                        <X className="w-2.5 h-2.5"/>
                      </button>
                      {msg.role === 'assistant' ? (
                        <div className="text-xs leading-relaxed ads-report-content" dangerouslySetInnerHTML={{ __html: markdownToHtml(msg.content) }} />
                      ) : (
                        <p className="text-xs whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                {adsAiLoading && <div className="flex justify-start"><div className="bg-slate-700 rounded-2xl px-4 py-3"><div className="flex gap-1"><div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}/><div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}/><div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}/></div></div></div>}
              </div>
              <div className="p-3 border-t border-slate-700"><div className="flex gap-2">
                <input type="text" value={adsAiInput} onChange={e => setAdsAiInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendAdsAIMessage(); } }} placeholder="Ask about campaigns, ROAS, keywords..." className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-orange-500" autoComplete="off"/>
                <button onClick={sendAdsAIMessage} disabled={!adsAiInput.trim() || adsAiLoading} className="px-3 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 rounded-xl text-white"><Send className="w-3.5 h-3.5"/></button>
              </div></div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default AdsView;
