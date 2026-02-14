import React, { useState, useRef, useMemo, useCallback } from 'react';
import {
  AlertTriangle, BarChart3, Brain, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight,
  Clock, Database, DollarSign, FileSpreadsheet, Flame, Globe, Loader2, RefreshCw, Search,
  Send, ShieldAlert, Sparkles, Target, TrendingDown, TrendingUp, Trophy, Upload, X, Zap
} from 'lucide-react';
import { formatCurrency, formatPercent, formatNumber } from '../../utils/format';
import { getShopifyAdsForDay, aggregateShopifyAdsForDays } from '../../utils/ads';
import { hasDailySalesData } from '../../utils/date';
import { AI_MODEL_OPTIONS, getModelLabel } from '../../utils/config';
import NavTabs from '../ui/NavTabs';

// ── Markdown → HTML for PDF export ──
const markdownToHtml = (md) => {
  if (!md) return '';
  let html = md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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

// ── Safe date formatter ──
const fmtDate = (dateStr) => {
  try { const d = new Date(dateStr + 'T12:00:00'); return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return dateStr || ''; }
};

// ── Color helpers ──
const tacosColor = (t) => t <= 15 ? 'text-emerald-400' : t <= 25 ? 'text-amber-400' : 'text-rose-400';
const roasColor = (r) => r >= 4 ? 'text-emerald-400' : r >= 2 ? 'text-amber-400' : 'text-rose-400';
const acosColor = (a) => a <= 25 ? 'text-emerald-400' : a <= 40 ? 'text-amber-400' : 'text-rose-400';

// ── Mini sparkline component ──
const Sparkline = ({ data, color = 'bg-cyan-500', h = 32 }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 0.01);
  return (
    <div className="flex items-end gap-px" style={{ height: `${h}px` }}>
      {data.slice(-14).map((v, i) => (
        <div key={i} className={`flex-1 ${color} rounded-t opacity-60 hover:opacity-100 transition-opacity`}
          style={{ height: `${Math.max((v / max) * 100, 4)}%`, minHeight: '1px' }} />
      ))}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// AdsView — Advertising Command Center
// ══════════════════════════════════════════════════════════════

const AdsView = ({
  adSpend, adsAiInput, adsAiLoading, adsAiMessages, adsIntelData,
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
  setShowAdsIntelUpload, setToast, setUploadTab, showAdsAIChat, setView,
  view, save
}) => {
  // ── Core data ──
  const sortedWeeks = Object.keys(allWeeksData).sort();
  const sortedDays = Object.keys(allDaysData || {}).sort();
  const hasDailyData = sortedDays.length > 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // ── Local state ──
  const [uploadStatus, setUploadStatus] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showDataSources, setShowDataSources] = useState(false);
  const [intelDateRange, setIntelDateRange] = useState(30);
  const [showTables, setShowTables] = useState(false);
  const [reportMode, setReportMode] = useState('all');
  const fileInputRef = useRef(null);

  const campaigns = amazonCampaigns?.campaigns || [];
  const hasCampaignData = campaigns.length > 0;

  // Count deep analysis reports
  const deepReportCount = useMemo(() => {
    if (!adsIntelData) return 0;
    let count = 0;
    for (const [key, val] of Object.entries(adsIntelData)) {
      if (key === 'lastUpdated' || key === 'reportCount' || typeof val !== 'object') continue;
      for (const [, data] of Object.entries(val)) {
        if (data?.records) count++;
      }
    }
    return count;
  }, [adsIntelData]);


  // ══════════════════════════════════════════════════════════════
  // INTELLIGENCE COMPUTATIONS
  // ══════════════════════════════════════════════════════════════

  // ── Amazon Ads Intelligence (allDaysData + campaigns + adsIntelData) ──
  const amazonAdsInsights = useMemo(() => {
    const intel = {
      hasData: false, wastedSpend: [], topWinners: [], topCampaigns: [],
      skuPerformance: [], placementInsights: null, negativeKeywords: [],
      summary: null, trendData: [], zeroSaleCampaigns: [], zeroSaleDays: [],
      acosSpikeDays: [], staleCampaignWarning: false,
      dateRange: { earliest: null, latest: null, daysAvailable: 0 },
    };

    const cutoffDate = intelDateRange === 'all' ? null : (() => { const d = new Date(); d.setDate(d.getDate() - intelDateRange); return d.toISOString().slice(0, 10); })();
    const inRange = (r) => { if (!cutoffDate) return true; return (r['Date'] || r['date'] || '') >= cutoffDate; };

    // PRIMARY: Build from allDaysData (always available)
    const daysWithAds = sortedDays.filter(d => {
      if (cutoffDate && d < cutoffDate) return false;
      const day = allDaysData[d];
      return (day?.amazon?.adSpend > 0) || (day?.amazonAdsMetrics?.spend > 0);
    });

    if (daysWithAds.length >= 1) {
      intel.hasData = true;
      let totalSpend = 0, totalRev = 0;
      daysWithAds.forEach(d => {
        const day = allDaysData[d];
        const spend = day?.amazon?.adSpend || day?.amazonAdsMetrics?.spend || 0;
        const adRev = day?.amazon?.adRevenue || day?.amazonAdsMetrics?.totalRevenue || 0;
        const totalDayRev = day?.amazon?.revenue || adRev || 0;
        totalSpend += spend;
        totalRev += totalDayRev;
        const tacos = totalDayRev > 0 ? (spend / totalDayRev) * 100 : (spend > 0 ? 100 : 0);
        intel.trendData.push({ date: d, spend, rev: totalDayRev, adRev, tacos, acos: adRev > 0 ? (spend / adRev) * 100 : 0, roas: spend > 0 ? totalDayRev / spend : 0 });
      });
      intel.dateRange = { earliest: daysWithAds[0], latest: daysWithAds[daysWithAds.length - 1], daysAvailable: daysWithAds.length };
      intel.summary = { totalTerms: 0, totalSpend, totalSales: totalRev, overallRoas: totalSpend > 0 ? totalRev / totalSpend : 0, wastedTotal: 0, wastedPct: 0, daysCount: daysWithAds.length };
    }

    // CAMPAIGNS: from amazonCampaigns (CSV) or API
    if (hasCampaignData) {
      intel.hasData = true;
      const activeCamps = campaigns.filter(c => (c.spend || 0) > 0);
      intel.topCampaigns = activeCamps
        .map(c => ({ name: c.name || '', spend: c.spend || 0, sales: c.sales || 0, clicks: c.clicks || 0, impressions: c.impressions || 0, orders: c.orders || 0, roas: c.roas || (c.spend > 0 && c.sales > 0 ? c.sales / c.spend : 0), acos: c.acos || (c.spend > 0 && c.sales > 0 ? (c.spend / c.sales) * 100 : 999), state: c.state || '', type: c.type || 'SP' }))
        .sort((a, b) => b.spend - a.spend).slice(0, 15);
      intel.zeroSaleCampaigns = activeCamps.filter(c => c.spend > 1 && (c.sales || 0) === 0)
        .map(c => ({ name: c.name || '', spend: c.spend || 0, clicks: c.clicks || 0, type: c.type || 'SP' }))
        .sort((a, b) => b.spend - a.spend);

      // Stale warning: only show if CSV is the ONLY data source and it's all $0
      // Suppress when: API data exists OR daily data already covers ad spend well
      const allZero = campaigns.every(c => (c.spend || 0) === 0);
      const hasApiData = adsIntelData && (adsIntelData._apiSpCampaigns?.length > 0 || adsIntelData.amazon?.sp_campaigns?.records?.length > 0 || adsIntelData._apiSpSearchTerms?.length > 0 || adsIntelData.amazon?.sp_search_terms?.records?.length > 0);
      const hasSufficientDailyData = daysWithAds.length >= 7 && totalSpend > 100;
      intel.staleCampaignWarning = allZero && daysWithAds.length > 0 && !hasApiData && !hasSufficientDailyData;
    }

    // ACTIONABLE: Zero-sale days & spikes (last 14d)
    const cut14 = (() => { const d = new Date(); d.setDate(d.getDate() - 14); return d.toISOString().slice(0, 10); })();
    sortedDays.filter(d => d >= cut14).forEach(d => {
      const day = allDaysData[d]; if (!day) return;
      const spend = day?.amazon?.adSpend || 0;
      const rev = day?.amazon?.adRevenue || day?.amazon?.revenue || 0;
      if (spend > 5 && rev === 0) intel.zeroSaleDays.push({ date: d, spend, platform: 'Amazon' });
      const gS = day?.shopify?.googleSpend || day?.googleSpend || 0;
      const mS = day?.shopify?.metaSpend || day?.metaSpend || 0;
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

      // Search Terms (SP uses 7-day, SB uses 14-day attribution windows)
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
        intel.summary = { ...intel.summary, totalTerms: terms.length, wastedTotal: wTotal, wastedPct: terms.reduce((s, t) => s + t.spend, 0) > 0 ? (wTotal / terms.reduce((s, t) => s + t.spend, 0)) * 100 : 0 };
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
            if (!cm[n]) cm[n] = { name: n, spend: 0, sales: 0, clicks: 0, impressions: 0, orders: 0 };
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
  }, [adsIntelData, intelDateRange, sortedDays, allDaysData, hasCampaignData, campaigns]);

  // ── Multi-Platform Intelligence ──
  const platformInsights = useMemo(() => {
    const cutoffDate = intelDateRange === 'all' ? null : (() => { const d = new Date(); d.setDate(d.getDate() - intelDateRange); return d.toISOString().slice(0, 10); })();
    const filteredDays = sortedDays.filter(d => !cutoffDate || d >= cutoffDate);
    const google = { trend: [], totalSpend: 0, totalClicks: 0, totalImpressions: 0, totalConversions: 0, daysActive: 0 };
    const meta = { trend: [], totalSpend: 0, totalClicks: 0, totalImpressions: 0, totalPurchases: 0, totalPurchaseValue: 0, daysActive: 0 };
    const dow = [0,1,2,3,4,5,6].map(() => ({ amzSpend: 0, amzRev: 0, gSpend: 0, mSpend: 0, totalSpend: 0, totalRev: 0, count: 0 }));
    let totalSpendAll = 0, totalRevAll = 0;

    filteredDays.forEach(d => {
      const day = allDaysData[d]; if (!day) return;
      const gAds = day?.shopify?.googleSpend || day?.googleSpend || day?.googleAds || 0;
      const mAds = day?.shopify?.metaSpend || day?.metaSpend || day?.metaAds || 0;
      const aAds = day?.amazon?.adSpend || 0;
      const aRev = day?.amazon?.revenue || 0;
      const sRev = day?.shopify?.revenue || 0;
      const am = day?.shopify?.adsMetrics || {};
      if (gAds > 0) { google.daysActive++; google.totalSpend += gAds; google.totalClicks += am.googleClicks || 0; google.totalImpressions += am.googleImpressions || 0; google.totalConversions += am.googleConversions || 0; google.trend.push({ date: d, spend: gAds }); }
      if (mAds > 0) { meta.daysActive++; meta.totalSpend += mAds; meta.totalClicks += am.metaClicks || 0; meta.totalImpressions += am.metaImpressions || 0; meta.totalPurchases += am.metaPurchases || 0; meta.totalPurchaseValue += am.metaPurchaseValue || 0; meta.trend.push({ date: d, spend: mAds }); }
      const dayOfWeek = new Date(d + 'T12:00:00').getDay();
      if (!isNaN(dayOfWeek)) { dow[dayOfWeek].amzSpend += aAds; dow[dayOfWeek].amzRev += aRev; dow[dayOfWeek].gSpend += gAds; dow[dayOfWeek].mSpend += mAds; dow[dayOfWeek].totalSpend += aAds + gAds + mAds; dow[dayOfWeek].totalRev += aRev + sRev; dow[dayOfWeek].count++; }
      totalSpendAll += aAds + gAds + mAds;
      totalRevAll += aRev + sRev;
    });

    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const dowData = dow.map((d, i) => ({ day: dayNames[i], avgSpend: d.count > 0 ? d.totalSpend / d.count : 0, avgRev: d.count > 0 ? d.totalRev / d.count : 0, roas: d.totalSpend > 0 ? d.totalRev / d.totalSpend : 0, count: d.count }));
    google.cpc = google.totalClicks > 0 ? google.totalSpend / google.totalClicks : 0;
    google.ctr = google.totalImpressions > 0 ? (google.totalClicks / google.totalImpressions) * 100 : 0;
    google.convRate = google.totalClicks > 0 ? (google.totalConversions / google.totalClicks) * 100 : 0;
    meta.cpc = meta.totalClicks > 0 ? meta.totalSpend / meta.totalClicks : 0;
    meta.ctr = meta.totalImpressions > 0 ? (meta.totalClicks / meta.totalImpressions) * 100 : 0;
    meta.cpa = meta.totalPurchases > 0 ? meta.totalSpend / meta.totalPurchases : 0;
    meta.roas = meta.totalSpend > 0 ? meta.totalPurchaseValue / meta.totalSpend : 0;
    const blendedRoas = totalSpendAll > 0 ? totalRevAll / totalSpendAll : 0;
    const blendedTacos = totalRevAll > 0 ? (totalSpendAll / totalRevAll) * 100 : 0;

    return { google, meta, dowData, blendedRoas, blendedTacos, totalSpendAll, totalRevAll };
  }, [sortedDays, allDaysData, intelDateRange]);

  // ── Revenue Attribution ──
  const revenueAttribution = useMemo(() => {
    const cutoff = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); })();
    let totalRev = 0, adRev = 0, adSpend = 0;
    sortedDays.filter(d => d >= cutoff).forEach(d => {
      const day = allDaysData[d];
      totalRev += (day?.amazon?.revenue || 0) + (day?.shopify?.revenue || 0);
      adRev += day?.amazon?.adRevenue || 0;
      adSpend += (day?.amazon?.adSpend || 0) + (day?.shopify?.googleSpend || day?.googleSpend || 0) + (day?.shopify?.metaSpend || day?.metaSpend || 0);
    });
    const organicRev = totalRev - adRev;
    return { totalRev, adRev, organicRev, adSpend, adPct: totalRev > 0 ? (adRev / totalRev) * 100 : 0, organicPct: totalRev > 0 ? (organicRev / totalRev) * 100 : 0, tacos: totalRev > 0 ? (adSpend / totalRev) * 100 : 0 };
  }, [sortedDays, allDaysData]);

  // ── WoW Comparison ──
  const wowComparison = useMemo(() => {
    const now = new Date();
    const thisWeekStart = new Date(now); thisWeekStart.setDate(thisWeekStart.getDate() - 6);
    const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(thisWeekStart); lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
    const fmt = d => d.toISOString().slice(0, 10);

    const agg = (days) => {
      let spend = 0, rev = 0, clicks = 0, impressions = 0;
      days.forEach(d => {
        const day = allDaysData[d]; if (!day) return;
        spend += (day?.amazon?.adSpend || 0) + (day?.shopify?.googleSpend || day?.googleSpend || 0) + (day?.shopify?.metaSpend || day?.metaSpend || 0);
        rev += (day?.amazon?.revenue || 0) + (day?.shopify?.revenue || 0);
        const am = day?.shopify?.adsMetrics || {};
        clicks += (am.googleClicks || 0) + (am.metaClicks || 0) + (day?.amazonAdsMetrics?.clicks || 0);
        impressions += (am.googleImpressions || 0) + (am.metaImpressions || 0) + (day?.amazonAdsMetrics?.impressions || 0);
      });
      return { spend, rev, clicks, impressions, tacos: rev > 0 ? (spend / rev) * 100 : 0, roas: spend > 0 ? rev / spend : 0 };
    };

    const thisW = sortedDays.filter(d => d >= fmt(thisWeekStart));
    const lastW = sortedDays.filter(d => d >= fmt(lastWeekStart) && d <= fmt(lastWeekEnd));
    return { this: agg(thisW), last: agg(lastW), thisDays: thisW.length, lastDays: lastW.length };
  }, [sortedDays, allDaysData]);

  // ══════════════════════════════════════════════════════════════
  // PERIOD NAVIGATION & AGGREGATION
  // ══════════════════════════════════════════════════════════════

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const availableYears = [...new Set([...sortedWeeks, ...sortedDays].map(d => parseInt(d.slice(0, 4))))].filter(Boolean).sort();
  if (availableYears.length === 0) availableYears.push(today.getFullYear());
  const weeksInYear = sortedWeeks.filter(w => w.startsWith(String(adsYear)));
  const daysInMonth = sortedDays.filter(d => { const dt = new Date(d+'T00:00:00'); return dt.getMonth() === adsMonth && dt.getFullYear() === adsYear; });
  const monthsWithData = [...new Set([...sortedWeeks,...sortedDays].filter(d=>d.startsWith(String(adsYear))).map(d=>new Date(d+'T00:00:00').getMonth()))].sort((a,b)=>a-b);

  if (adsTimeTab === 'daily' && !adsSelectedDay && sortedDays.length > 0)
    setTimeout(() => setAdsSelectedDay(sortedDays[sortedDays.length - 1]), 0);

  const aggregateDailyData = (days) => days.reduce((acc, d) => {
    const day = allDaysData[d]; if (!day) return acc;
    const gAds = day.shopify?.googleSpend || day.googleSpend || day.googleAds || 0;
    const mAds = day.shopify?.metaSpend || day.metaSpend || day.metaAds || 0;
    const aAds = day.amazon?.adSpend || day.amazonAdsMetrics?.spend || 0;
    const am = day.shopify?.adsMetrics || {};
    const gI = am.googleImpressions||0, mI = am.metaImpressions||0;
    const gC = am.googleClicks||0, mC = am.metaClicks||0;
    const gCv = am.googleConversions||0, mP = am.metaPurchases||day.metaConversions||0;
    const mPV = am.metaPurchaseValue||0;
    const amz = day.amazonAdsMetrics||{};
    const aI = amz.impressions||0, aC = amz.clicks||0, aCv = amz.conversions||0;
    const sR = day.shopify?.revenue||0, aR = day.amazon?.revenue||0;
    return {
      googleAds:acc.googleAds+gAds, metaAds:acc.metaAds+mAds, amazonAds:acc.amazonAds+aAds,
      totalAds:acc.totalAds+gAds+mAds+aAds,
      googleImpressions:acc.googleImpressions+gI, metaImpressions:acc.metaImpressions+mI,
      amazonImpressions:acc.amazonImpressions+aI, totalImpressions:acc.totalImpressions+gI+mI+aI,
      googleClicks:acc.googleClicks+gC, metaClicks:acc.metaClicks+mC, amazonClicks:acc.amazonClicks+aC,
      totalClicks:acc.totalClicks+gC+mC+aC,
      googleConversions:acc.googleConversions+gCv, metaPurchases:acc.metaPurchases+mP,
      amazonConversions:acc.amazonConversions+aCv, metaPurchaseValue:acc.metaPurchaseValue+mPV,
      shopifyRev:acc.shopifyRev+sR, amazonRev:acc.amazonRev+aR, totalRev:acc.totalRev+sR+aR,
      count:acc.count+1,
    };
  }, {googleAds:0,metaAds:0,amazonAds:0,totalAds:0,googleImpressions:0,metaImpressions:0,amazonImpressions:0,totalImpressions:0,googleClicks:0,metaClicks:0,amazonClicks:0,totalClicks:0,googleConversions:0,metaPurchases:0,amazonConversions:0,metaPurchaseValue:0,shopifyRev:0,amazonRev:0,totalRev:0,count:0});

  const aggregateWeeklyData = (weeks) => weeks.reduce((acc, w) => {
    const week = allWeeksData[w]; if (!week) return acc;
    const amzAds = week.amazon?.adSpend||0, amzRev = week.amazon?.revenue||0;
    let mAds = week.shopify?.metaAds||week.shopify?.metaSpend||0;
    let gAds = week.shopify?.googleAds||week.shopify?.googleSpend||0;
    if (mAds===0 && gAds===0) {
      const we=new Date(w+'T00:00:00'), ws=new Date(we); ws.setDate(ws.getDate()-6);
      sortedDays.filter(d=>{const dt=new Date(d+'T00:00:00');return dt>=ws&&dt<=we;}).forEach(d=>{
        const dy=allDaysData[d]; mAds+=dy?.shopify?.metaSpend||dy?.metaSpend||dy?.metaAds||0;
        gAds+=dy?.shopify?.googleSpend||dy?.googleSpend||dy?.googleAds||0;
      });
    }
    const shopAds=(mAds+gAds)>0?(mAds+gAds):(week.shopify?.adSpend||0);
    const shopRev=week.shopify?.revenue||0, totalRev=week.total?.revenue||(amzRev+shopRev);
    return { amzAds:acc.amzAds+amzAds, amzRev:acc.amzRev+amzRev, metaAds:acc.metaAds+mAds,
      googleAds:acc.googleAds+gAds, shopAds:acc.shopAds+shopAds, shopRev:acc.shopRev+shopRev,
      totalAds:acc.totalAds+amzAds+shopAds, totalRev:acc.totalRev+totalRev, count:acc.count+1 };
  }, {amzAds:0,amzRev:0,metaAds:0,googleAds:0,shopAds:0,shopRev:0,totalAds:0,totalRev:0,count:0});

  // Period selectors
  const getWeeksForPeriod = () => {
    if (adsTimeTab==='weekly') return adsSelectedWeek?[adsSelectedWeek]:[];
    if (adsTimeTab==='monthly') { const ms=new Date(adsYear,adsMonth,1),me=new Date(adsYear,adsMonth+1,0); return sortedWeeks.filter(w=>{const d=new Date(w+'T00:00:00');return d>=ms&&d<=me;}); }
    if (adsTimeTab==='quarterly') { const qs=new Date(adsYear,(adsQuarter-1)*3,1),qe=new Date(adsYear,adsQuarter*3,0); return sortedWeeks.filter(w=>{const d=new Date(w+'T00:00:00');return d>=qs&&d<=qe;}); }
    if (adsTimeTab==='yearly') return weeksInYear;
    return weeksInYear.slice(-4);
  };
  const getDaysForPeriod = () => {
    if (adsTimeTab==='daily') return adsSelectedDay?[adsSelectedDay]:sortedDays.length>0?[sortedDays[sortedDays.length-1]]:[];
    if (adsTimeTab==='weekly') { if (adsSelectedWeek) { const we=new Date(adsSelectedWeek+'T00:00:00'),ws=new Date(we);ws.setDate(ws.getDate()-6); return sortedDays.filter(d=>{const dt=new Date(d+'T00:00:00');return dt>=ws&&dt<=we;}); } const sda=new Date(today);sda.setDate(sda.getDate()-7); return sortedDays.filter(d=>{const dt=new Date(d+'T00:00:00');return dt>=sda&&dt<=today;}); }
    return daysInMonth;
  };

  const periodWeeks = getWeeksForPeriod();
  const periodDays = getDaysForPeriod();
  const dailyTotals = aggregateDailyData(periodDays);
  const weeklyTotals = aggregateWeeklyData(periodWeeks);
  const useDailyData = adsTimeTab === 'daily' || adsTimeTab === 'weekly';
  const hasDailyMG = dailyTotals.metaAds>0||dailyTotals.googleAds>0;
  const hasWeeklyMG = weeklyTotals.metaAds>0||weeklyTotals.googleAds>0;

  const totals = useDailyData ? {
    ...dailyTotals, amzAds:dailyTotals.amazonAds||0, amzRev:dailyTotals.amazonRev||0,
    shopAds:dailyTotals.googleAds+dailyTotals.metaAds, shopRev:dailyTotals.shopifyRev||0, totalRev:dailyTotals.totalRev||0
  } : {
    ...weeklyTotals,
    metaAds:hasDailyMG&&!hasWeeklyMG?dailyTotals.metaAds:weeklyTotals.metaAds,
    googleAds:hasDailyMG&&!hasWeeklyMG?dailyTotals.googleAds:weeklyTotals.googleAds,
    shopAds:hasDailyMG&&!hasWeeklyMG?(dailyTotals.metaAds+dailyTotals.googleAds):weeklyTotals.shopAds,
    totalAds:hasDailyMG&&!hasWeeklyMG?(weeklyTotals.amzAds+dailyTotals.metaAds+dailyTotals.googleAds):weeklyTotals.totalAds,
  };

  const totalTacos = totals.totalRev>0?(totals.totalAds/totals.totalRev)*100:0;
  const amzTacos = totals.amzRev>0?(totals.amzAds/totals.amzRev)*100:0;
  const cpc = dailyTotals.totalClicks>0?dailyTotals.totalAds/dailyTotals.totalClicks:0;
  const ctr = dailyTotals.totalImpressions>0?(dailyTotals.totalClicks/dailyTotals.totalImpressions)*100:0;

  const getPeriodLabel = () => {
    if (adsTimeTab==='daily' && periodDays.length===1) return new Date(periodDays[0]+'T00:00:00').toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',year:'numeric'});
    if (adsTimeTab==='weekly') return `Last 7 Days`;
    if (adsTimeTab==='monthly') return `${monthNames[adsMonth]} ${adsYear}`;
    if (adsTimeTab==='quarterly') return `Q${adsQuarter} ${adsYear}`;
    if (adsTimeTab==='yearly') return `${adsYear}`;
    return '';
  };
  const goToPrev = () => {
    if (adsTimeTab==='daily'){const i=sortedDays.indexOf(adsSelectedDay);if(i>0)setAdsSelectedDay(sortedDays[i-1]);}
    else if(adsTimeTab==='monthly'){if(adsMonth===0){setAdsMonth(11);setAdsYear(adsYear-1);}else setAdsMonth(adsMonth-1);}
    else if(adsTimeTab==='weekly'){const i=weeksInYear.indexOf(adsSelectedWeek);if(i>0)setAdsSelectedWeek(weeksInYear[i-1]);}
    else if(adsTimeTab==='quarterly'){if(adsQuarter===1){setAdsQuarter(4);setAdsYear(adsYear-1);}else setAdsQuarter(adsQuarter-1);}
    else if(adsTimeTab==='yearly')setAdsYear(adsYear-1);
  };
  const goToNext = () => {
    if(adsTimeTab==='daily'){const i=sortedDays.indexOf(adsSelectedDay);if(i<sortedDays.length-1)setAdsSelectedDay(sortedDays[i+1]);}
    else if(adsTimeTab==='monthly'){if(adsMonth===11){setAdsMonth(0);setAdsYear(adsYear+1);}else setAdsMonth(adsMonth+1);}
    else if(adsTimeTab==='weekly'){const i=weeksInYear.indexOf(adsSelectedWeek);if(i<weeksInYear.length-1)setAdsSelectedWeek(weeksInYear[i+1]);}
    else if(adsTimeTab==='quarterly'){if(adsQuarter===4){setAdsQuarter(1);setAdsYear(adsYear+1);}else setAdsQuarter(adsQuarter+1);}
    else if(adsTimeTab==='yearly')setAdsYear(adsYear+1);
  };

  // Table data
  const dailyTableData = (useDailyData?periodDays:daysInMonth).map(d => {
    const day=allDaysData[d]; const gAds=day?.shopify?.googleSpend||day?.googleSpend||day?.googleAds||0;
    const mAds=day?.shopify?.metaSpend||day?.metaSpend||day?.metaAds||0;
    const aAds=day?.amazon?.adSpend||0;
    const sR=day?.shopify?.revenue||0, aR=day?.amazon?.revenue||0;
    return {date:d,googleAds:gAds,metaAds:mAds,amazonAds:aAds,totalAds:gAds+mAds+aAds,shopifyRev:sR,amazonRev:aR,totalRev:sR+aR};
  });
  const weeklyTableData = periodWeeks.map(w => {
    const week=allWeeksData[w]; const amzAds=week?.amazon?.adSpend||0;
    let mAds=week?.shopify?.metaAds||week?.shopify?.metaSpend||0, gAds=week?.shopify?.googleAds||week?.shopify?.googleSpend||0;
    if(mAds===0&&gAds===0){const we=new Date(w+'T00:00:00'),ws=new Date(we);ws.setDate(ws.getDate()-6);sortedDays.filter(d=>{const dt=new Date(d+'T00:00:00');return dt>=ws&&dt<=we;}).forEach(d=>{const dy=allDaysData[d];mAds+=dy?.shopify?.metaSpend||dy?.metaSpend||dy?.metaAds||0;gAds+=dy?.shopify?.googleSpend||dy?.googleSpend||dy?.googleAds||0;});}
    const totalAds=amzAds+mAds+gAds, totalRev=week?.total?.revenue||0;
    return {week:w,amzAds,metaAds:mAds,googleAds:gAds,totalAds,totalRev,tacos:totalRev>0?(totalAds/totalRev)*100:0};
  });

  // Upload handler
  const handleFileDrop = useCallback(async (fileList) => {
    if (!fileList||fileList.length===0) return;
    if (!processAdsUpload) { setToast({message:'Upload handler not available',type:'error'}); return; }
    setUploadStatus({processing:true,results:null,error:null});
    try {
      const result = await processAdsUpload(Array.from(fileList));
      setUploadStatus({processing:false,results:result,error:null});
      const {summary}=result;
      if(summary.tier1>0||summary.tier2>0) setToast({message:`Processed ${summary.totalFiles} reports: ${summary.tier1} daily KPIs, ${summary.tier2} deep analysis${summary.unrecognized>0?`, ${summary.unrecognized} unrecognized`:''}`,type:'success'});
      else if(summary.unrecognized>0) setToast({message:`${summary.unrecognized} file(s) not recognized`,type:'warning'});
    } catch(err) { setUploadStatus({processing:false,results:null,error:err.message}); setToast({message:`Upload error: ${err.message}`,type:'error'}); }
  }, [processAdsUpload, setToast]);
  const handleDragOver=(e)=>{e.preventDefault();e.stopPropagation();setIsDragging(true);};
  const handleDragLeave=(e)=>{e.preventDefault();e.stopPropagation();setIsDragging(false);};
  const handleDrop=(e)=>{e.preventDefault();e.stopPropagation();setIsDragging(false);handleFileDrop(e.dataTransfer.files);};

  // Report modes
  const REPORT_MODES = [
    { key: 'all', label: 'All Platforms', icon: '🌐', desc: 'Amazon + Google + Meta cross-platform audit' },
    { key: 'amazon', label: 'Amazon', icon: '📦', desc: 'Campaigns, keywords, placements, ACOS deep dive' },
    { key: 'dtc', label: 'DTC', icon: '🛍️', desc: 'Google + Meta DTC channel analysis' },
    { key: 'google', label: 'Google', icon: '🔍', desc: 'Search terms, CPC, conversions, Quality Score' },
    { key: 'meta', label: 'Meta', icon: '📱', desc: 'Creative, audiences, CPA, ROAS analysis' },
  ];

  // WoW delta helper
  const delta = (curr, prev) => prev > 0 ? ((curr - prev) / prev) * 100 : 0;
  const DeltaBadge = ({ curr, prev, invert = false }) => {
    const d = delta(curr, prev);
    if (Math.abs(d) < 0.5 || prev === 0) return null;
    const good = invert ? d < 0 : d > 0;
    return <span className={`text-[10px] font-medium flex items-center gap-0.5 ${good ? 'text-emerald-400' : 'text-rose-400'}`}>{good ? <TrendingUp className="w-2.5 h-2.5"/> : <TrendingDown className="w-2.5 h-2.5"/>}{Math.abs(d).toFixed(0)}%</span>;
  };

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-slate-950 p-4 lg:p-6">
      <div className="max-w-7xl mx-auto">{globalModals}
        <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />
        {dataBar}

        {/* ── HEADER ── */}
        <div className="mb-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-white">Advertising Command Center</h1>
              <p className="text-slate-500 text-sm mt-0.5">{sortedDays.length > 0 ? `${sortedDays.length} days tracked` : 'No data yet'}{hasCampaignData ? ` · ${campaigns.length} campaigns` : ''}{deepReportCount > 0 ? ` · ${deepReportCount} deep reports` : ''}</p>
            </div>
            <button onClick={()=>setShowAdsAIChat(true)} className="px-4 py-2.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 rounded-xl text-white flex items-center gap-2 font-medium shadow-lg shadow-orange-500/20 transition-all">
              <Zap className="w-4 h-4"/>Ask AI
            </button>
          </div>
        </div>

        {/* ── TAB BAR ── */}
        <div className="flex gap-1.5 mb-5 p-1 bg-slate-800/40 rounded-xl overflow-x-auto">
          {[
            { key: 'overview', label: 'Dashboard', icon: BarChart3, gradient: 'from-cyan-600 to-blue-600' },
            { key: 'reports', label: 'AI Reports', icon: Brain, gradient: 'from-orange-600 to-amber-600' },
            { key: 'upload', label: 'Data', icon: Database, gradient: 'from-violet-600 to-purple-600' },
          ].map(tab => (
            <button key={tab.key} onClick={()=>setAdsViewMode(tab.key)}
              className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${adsViewMode===tab.key ? `bg-gradient-to-r ${tab.gradient} text-white shadow-lg` : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}>
              <tab.icon className="w-4 h-4"/>{tab.label}
              {tab.key === 'upload' && deepReportCount > 0 && <span className="px-1.5 py-0.5 bg-white/20 rounded text-[10px]">{deepReportCount}</span>}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════ */}
        {/* DASHBOARD TAB                                          */}
        {/* ════════════════════════════════════════════════════════ */}
        {adsViewMode==='overview' && (<>

          {/* ── HERO KPIs with WoW ── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-5">
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-800/40 rounded-xl border border-slate-700/60 p-3.5">
              <div className="flex items-center justify-between"><p className="text-slate-500 text-[10px] uppercase tracking-wider">Ad Spend</p><DeltaBadge curr={wowComparison.this.spend} prev={wowComparison.last.spend} invert/></div>
              <p className="text-xl font-bold text-white mt-0.5">{formatCurrency(useDailyData?dailyTotals.totalAds:totals.totalAds)}</p>
            </div>
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-800/40 rounded-xl border border-slate-700/60 p-3.5">
              <div className="flex items-center justify-between"><p className="text-slate-500 text-[10px] uppercase tracking-wider">Revenue</p><DeltaBadge curr={wowComparison.this.rev} prev={wowComparison.last.rev}/></div>
              <p className="text-xl font-bold text-emerald-400 mt-0.5">{formatCurrency(useDailyData?dailyTotals.totalRev:totals.totalRev)}</p>
            </div>
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-800/40 rounded-xl border border-slate-700/60 p-3.5">
              <div className="flex items-center justify-between"><p className="text-slate-500 text-[10px] uppercase tracking-wider">TACOS</p><DeltaBadge curr={wowComparison.this.tacos} prev={wowComparison.last.tacos} invert/></div>
              <p className={`text-xl font-bold mt-0.5 ${tacosColor(totalTacos)}`}>{totalTacos > 0 ? totalTacos.toFixed(1) + '%' : '—'}</p>
            </div>
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-800/40 rounded-xl border border-slate-700/60 p-3.5">
              <div className="flex items-center justify-between"><p className="text-slate-500 text-[10px] uppercase tracking-wider">ROAS</p><DeltaBadge curr={wowComparison.this.roas} prev={wowComparison.last.roas}/></div>
              <p className={`text-xl font-bold mt-0.5 ${roasColor(totals.totalRev > 0 && totals.totalAds > 0 ? totals.totalRev / totals.totalAds : 0)}`}>{totals.totalAds > 0 ? (totals.totalRev / totals.totalAds).toFixed(2) + 'x' : '—'}</p>
            </div>
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-800/40 rounded-xl border border-slate-700/60 p-3.5">
              <p className="text-slate-500 text-[10px] uppercase tracking-wider">Avg CPC</p>
              <p className={`text-xl font-bold mt-0.5 ${cpc < 1.5 ? 'text-emerald-400' : cpc < 2.5 ? 'text-amber-400' : 'text-rose-400'}`}>{cpc > 0 ? formatCurrency(cpc) : '—'}</p>
            </div>
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-800/40 rounded-xl border border-slate-700/60 p-3.5">
              <p className="text-slate-500 text-[10px] uppercase tracking-wider">Conversions</p>
              <p className="text-xl font-bold text-white mt-0.5">{formatNumber(dailyTotals.googleConversions+dailyTotals.metaPurchases+dailyTotals.amazonConversions)}</p>
            </div>
          </div>

          {/* ── PLATFORM CARDS ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
            {/* Amazon */}
            <div className="bg-gradient-to-br from-orange-900/15 to-slate-800/40 rounded-xl border border-orange-500/20 p-4">
              <div className="flex items-center justify-between mb-2"><h4 className="text-orange-400 font-semibold text-sm flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-orange-500"/>Amazon</h4><span className="text-white font-bold text-lg">{formatCurrency(totals.amzAds||dailyTotals.amazonAds)}</span></div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div><span className="text-slate-500">Revenue</span><p className="text-emerald-400 font-medium">{formatCurrency(totals.amzRev||dailyTotals.amazonRev)}</p></div>
                <div><span className="text-slate-500">TACOS</span><p className={`font-medium ${tacosColor(amzTacos)}`}>{amzTacos > 0 ? amzTacos.toFixed(1) + '%' : '—'}</p></div>
              </div>
              <Sparkline data={amazonAdsInsights.trendData.slice(-14).map(d => d.spend)} color="bg-orange-500" h={24} />
            </div>
            {/* Google */}
            <div className="bg-gradient-to-br from-red-900/15 to-slate-800/40 rounded-xl border border-red-500/20 p-4">
              <div className="flex items-center justify-between mb-2"><h4 className="text-red-400 font-semibold text-sm flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-red-500"/>Google</h4><span className="text-white font-bold text-lg">{formatCurrency(totals.googleAds||dailyTotals.googleAds)}</span></div>
              {(dailyTotals.googleAds > 0 || dailyTotals.googleImpressions > 0) ? <>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><span className="text-slate-500">Clicks</span><p className="text-white font-medium">{formatNumber(dailyTotals.googleClicks)}</p></div>
                  <div><span className="text-slate-500">Conv</span><p className="text-emerald-400 font-medium">{dailyTotals.googleConversions}</p></div>
                  <div><span className="text-slate-500">CPC</span><p className={`font-medium ${platformInsights.google.cpc <= 1 ? 'text-emerald-400' : platformInsights.google.cpc <= 2 ? 'text-amber-400' : 'text-rose-400'}`}>{platformInsights.google.cpc > 0 ? formatCurrency(platformInsights.google.cpc) : '—'}</p></div>
                </div>
                <Sparkline data={platformInsights.google.trend.slice(-14).map(d => d.spend)} color="bg-red-500" h={24} />
              </> : <p className="text-slate-600 text-xs mt-1">No data — <button onClick={()=>setAdsViewMode('upload')} className="text-red-400 hover:underline">upload</button></p>}
            </div>
            {/* Meta */}
            <div className="bg-gradient-to-br from-blue-900/15 to-slate-800/40 rounded-xl border border-blue-500/20 p-4">
              <div className="flex items-center justify-between mb-2"><h4 className="text-blue-400 font-semibold text-sm flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"/>Meta</h4><span className="text-white font-bold text-lg">{formatCurrency(totals.metaAds||dailyTotals.metaAds)}</span></div>
              {(dailyTotals.metaAds > 0 || dailyTotals.metaImpressions > 0) ? <>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><span className="text-slate-500">Clicks</span><p className="text-white font-medium">{formatNumber(dailyTotals.metaClicks)}</p></div>
                  <div><span className="text-slate-500">Purchases</span><p className="text-emerald-400 font-medium">{formatNumber(Math.round(dailyTotals.metaPurchases))}</p></div>
                  <div><span className="text-slate-500">CPA</span><p className={`font-medium ${platformInsights.meta.cpa > 0 && platformInsights.meta.cpa <= 15 ? 'text-emerald-400' : platformInsights.meta.cpa <= 30 ? 'text-amber-400' : 'text-rose-400'}`}>{platformInsights.meta.cpa > 0 ? formatCurrency(platformInsights.meta.cpa) : '—'}</p></div>
                </div>
                <Sparkline data={platformInsights.meta.trend.slice(-14).map(d => d.spend)} color="bg-blue-500" h={24} />
              </> : <p className="text-slate-600 text-xs mt-1">No data — <button onClick={()=>setAdsViewMode('upload')} className="text-blue-400 hover:underline">upload</button></p>}
            </div>
          </div>

          {/* ── ALERTS ── */}
          {(amazonAdsInsights.staleCampaignWarning || amazonAdsInsights.zeroSaleCampaigns.length > 0 || amazonAdsInsights.zeroSaleDays.length > 0 || amazonAdsInsights.acosSpikeDays.length > 0) && (
            <div className="space-y-2 mb-5">
              {amazonAdsInsights.staleCampaignWarning && (
                <div className="flex items-center gap-3 bg-amber-900/20 border border-amber-500/30 rounded-xl p-3.5">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0"/>
                  <div className="flex-1 min-w-0"><p className="text-amber-200 text-sm font-medium">Campaign CSV is stale</p><p className="text-amber-400/70 text-xs">All {campaigns.length} campaigns show $0 spend, but daily data shows active ad spend of {formatCurrency(amazonAdsInsights.summary?.totalSpend || 0)}. Upload a fresh report.</p></div>
                  <button onClick={()=>setAdsViewMode('upload')} className="px-3 py-1.5 bg-amber-600/30 border border-amber-500/40 rounded-lg text-amber-200 text-xs font-medium hover:bg-amber-600/50 whitespace-nowrap">Upload →</button>
                </div>
              )}
              {amazonAdsInsights.zeroSaleCampaigns.length > 0 && (
                <div className="flex items-center gap-3 bg-rose-900/15 border border-rose-500/20 rounded-xl p-3.5">
                  <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0"/>
                  <div className="flex-1 min-w-0"><p className="text-rose-200 text-sm font-medium">{amazonAdsInsights.zeroSaleCampaigns.length} campaign{amazonAdsInsights.zeroSaleCampaigns.length > 1 ? 's' : ''} with zero sales</p><p className="text-rose-400/70 text-xs">{formatCurrency(amazonAdsInsights.zeroSaleCampaigns.reduce((s, c) => s + c.spend, 0))} spent with $0 attributed revenue</p></div>
                  <button onClick={()=>{setAdsAiInput(`Diagnose these zero-sale campaigns: ${amazonAdsInsights.zeroSaleCampaigns.map(c => `${c.name} (${formatCurrency(c.spend)} spent)`).join(', ')}. What's wrong and what should I do?`);setShowAdsAIChat(true);}} className="px-3 py-1.5 bg-rose-600/30 border border-rose-500/40 rounded-lg text-rose-200 text-xs font-medium hover:bg-rose-600/50 whitespace-nowrap">Diagnose →</button>
                </div>
              )}
              {amazonAdsInsights.zeroSaleDays.length > 0 && (
                <div className="flex items-center gap-3 bg-orange-900/15 border border-orange-500/20 rounded-xl p-3.5">
                  <Flame className="w-5 h-5 text-orange-400 shrink-0"/>
                  <div className="flex-1 min-w-0"><p className="text-orange-200 text-sm font-medium">{amazonAdsInsights.zeroSaleDays.length} zero-revenue ad day{amazonAdsInsights.zeroSaleDays.length > 1 ? 's' : ''} (last 14d)</p><p className="text-orange-400/70 text-xs">{formatCurrency(amazonAdsInsights.zeroSaleDays.reduce((s, d) => s + d.spend, 0))} potentially wasted across {[...new Set(amazonAdsInsights.zeroSaleDays.map(d => d.platform))].join(', ')}</p></div>
                </div>
              )}
            </div>
          )}

          {/* ── TACOS TREND ── */}
          {amazonAdsInsights.trendData.length > 2 && (() => {
            const trend = amazonAdsInsights.trendData.slice(-30);
            const tacosValues = trend.map(d => d.tacos).filter(t => t > 0 && t < 200);
            const minT = tacosValues.length > 0 ? Math.min(...tacosValues) : 0;
            const maxT = tacosValues.length > 0 ? Math.max(...tacosValues) : 50;
            const range = maxT - minT;
            const padMin = range > 2 ? minT - range * 0.15 : minT - 2;
            const padMax = range > 2 ? maxT + range * 0.1 : maxT + 2;
            const scaleRange = padMax - padMin;
            const last7 = trend.slice(-7), prev7 = trend.slice(-14, -7);
            const last7T = (() => { const s = last7.reduce((a, d) => a + d.spend, 0); const r = last7.reduce((a, d) => a + d.rev, 0); return r > 0 ? (s / r) * 100 : 0; })();
            const prev7T = (() => { const s = prev7.reduce((a, d) => a + d.spend, 0); const r = prev7.reduce((a, d) => a + d.rev, 0); return r > 0 ? (s / r) * 100 : 0; })();
            const d7 = prev7T > 0 ? last7T - prev7T : 0;
            return (
              <div className="bg-slate-800/30 rounded-xl border border-slate-700/60 p-4 mb-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-semibold text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-cyan-400"/>TACOS Trend — {trend.length}d</h3>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-400">7d: <span className={`font-bold ${last7T <= 10 ? 'text-emerald-400' : last7T <= 20 ? 'text-amber-400' : 'text-rose-400'}`}>{last7T.toFixed(1)}%</span></span>
                    {d7 !== 0 && <span className={`flex items-center gap-0.5 ${d7 < 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{d7 < 0 ? <TrendingDown className="w-3 h-3"/> : <TrendingUp className="w-3 h-3"/>}{Math.abs(d7).toFixed(1)}pp</span>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <div className="flex flex-col justify-between text-[10px] text-slate-600 pr-1" style={{ minWidth: '30px' }}>
                    <span>{Math.ceil(padMax)}%</span>
                    <span>{Math.round((padMax + padMin) / 2)}%</span>
                    <span>{Math.floor(Math.max(padMin, 0))}%</span>
                  </div>
                  <div className="flex items-end gap-px flex-1" style={{ height: '80px' }}>
                    {trend.map((d, i) => {
                      const t = d.tacos;
                      const h = scaleRange > 0 ? Math.min(Math.max(((t - padMin) / scaleRange) * 100, 6), 100) : 50;
                      const color = t <= 10 ? 'bg-emerald-500' : t <= 20 ? 'bg-amber-500' : 'bg-rose-500';
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end group relative">
                          <div className={`w-full rounded-t ${color} opacity-70 hover:opacity-100 transition-opacity cursor-default`} style={{ height: `${h}%` }}/>
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
                  <span>{fmtDate(trend[0].date)}</span>
                  <div className="flex items-center gap-2.5">
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>≤10%</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"/>≤20%</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500"/>&gt;20%</span>
                  </div>
                  <span>{fmtDate(trend[trend.length - 1].date)}</span>
                </div>
              </div>
            );
          })()}

          {/* ── INTELLIGENCE SECTION ── */}
          {amazonAdsInsights.hasData && (
            <div className="mb-5">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                <h2 className="text-base font-bold text-white flex items-center gap-2"><Flame className="w-4 h-4 text-orange-400"/>Intelligence</h2>
                <div className="flex items-center gap-1.5">
                  {[7, 14, 30, 60, 90, 'all'].map(range => (
                    <button key={range} onClick={() => setIntelDateRange(range)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${intelDateRange === range ? 'bg-orange-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/50'}`}>
                      {range === 'all' ? 'All' : range + 'd'}
                    </button>
                  ))}
                </div>
              </div>

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
                          <span className="text-slate-500 w-8 text-right">{c.type}</span>
                          <span className="text-slate-300 w-16 text-right">{formatCurrency(c.spend)}</span>
                          <span className={`font-semibold w-12 text-right ${roasColor(c.roas)}`}>{c.roas > 0 ? c.roas.toFixed(1) + 'x' : '—'}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-slate-600 text-[10px] mt-2">Showing top {Math.min(8, amazonAdsInsights.topCampaigns.length)} by spend · ROAS color-coded</p>
                  </div>
                )}

                {/* Revenue Attribution */}
                {revenueAttribution.totalRev > 0 && (
                  <div className="bg-slate-800/30 rounded-xl border border-slate-700/60 p-4">
                    <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-400"/>Revenue Attribution (30d)</h3>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex-1 h-5 rounded-full overflow-hidden bg-slate-700/50 flex">
                        <div className="bg-violet-500 h-full transition-all" style={{ width: `${revenueAttribution.adPct}%` }}/>
                        <div className="bg-emerald-500 h-full transition-all" style={{ width: `${revenueAttribution.organicPct}%` }}/>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div><span className="flex items-center gap-1.5 text-slate-500"><span className="w-2 h-2 rounded-full bg-violet-500"/>Ad-Attributed</span><p className="text-violet-400 font-bold mt-0.5">{formatCurrency(revenueAttribution.adRev)} <span className="font-normal text-slate-500">({revenueAttribution.adPct.toFixed(0)}%)</span></p></div>
                      <div><span className="flex items-center gap-1.5 text-slate-500"><span className="w-2 h-2 rounded-full bg-emerald-500"/>Organic</span><p className="text-emerald-400 font-bold mt-0.5">{formatCurrency(revenueAttribution.organicRev)} <span className="font-normal text-slate-500">({revenueAttribution.organicPct.toFixed(0)}%)</span></p></div>
                    </div>
                    {revenueAttribution.tacos > 20 && <p className="text-amber-400 text-[10px] mt-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/>TACOS {revenueAttribution.tacos.toFixed(1)}% — consider reducing ad dependency</p>}
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
                    <button onClick={()=>{setAdsAiInput('Generate negative keywords from my search term data with match types and savings estimates.');setShowAdsAIChat(true);}} className="mt-2 text-[10px] text-rose-400 hover:text-rose-300">Get negative keyword list →</button>
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
                    <button onClick={()=>{setAdsAiInput('Which of my top search terms should I scale? Show me the math for each.');setShowAdsAIChat(true);}} className="mt-2 text-[10px] text-emerald-400 hover:text-emerald-300">Get scaling plan →</button>
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
              </div>
            </div>
          )}

          {/* ── CROSS-PLATFORM ── */}
          {platformInsights.totalSpendAll > 0 && (
            <div className="mb-5">
              <h2 className="text-base font-bold text-white flex items-center gap-2 mb-3"><Globe className="w-4 h-4 text-cyan-400"/>Cross-Platform</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
                <div className="bg-gradient-to-br from-cyan-900/15 to-slate-800/40 rounded-xl border border-cyan-500/20 p-3">
                  <p className="text-slate-500 text-[10px] uppercase">Blended TACOS</p>
                  <p className={`text-lg font-bold ${tacosColor(platformInsights.blendedTacos)}`}>{platformInsights.blendedTacos.toFixed(1)}%</p>
                </div>
                <div className="bg-slate-800/40 rounded-xl border border-slate-700/60 p-3">
                  <p className="text-slate-500 text-[10px] uppercase">Total Spend</p>
                  <p className="text-lg font-bold text-white">{formatCurrency(platformInsights.totalSpendAll)}</p>
                </div>
                <div className="bg-slate-800/40 rounded-xl border border-slate-700/60 p-3">
                  <p className="text-slate-500 text-[10px] uppercase">Total Revenue</p>
                  <p className="text-lg font-bold text-emerald-400">{formatCurrency(platformInsights.totalRevAll)}</p>
                </div>
                <div className="bg-slate-800/40 rounded-xl border border-slate-700/60 p-3">
                  <p className="text-slate-500 text-[10px] uppercase">Blended ROAS</p>
                  <p className={`text-lg font-bold ${roasColor(platformInsights.blendedRoas)}`}>{platformInsights.blendedRoas.toFixed(2)}x</p>
                </div>
              </div>

              {/* Budget Split + DOW */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* Budget Allocation */}
                <div className="bg-slate-800/30 rounded-xl border border-slate-700/60 p-4">
                  <h3 className="text-white font-semibold text-sm mb-3">Budget Allocation</h3>
                  {(() => {
                    const total = (amazonAdsInsights.summary?.totalSpend || 0) + platformInsights.google.totalSpend + platformInsights.meta.totalSpend;
                    if (total === 0) return <p className="text-slate-600 text-xs">No spend data</p>;
                    const amzPct = ((amazonAdsInsights.summary?.totalSpend || 0) / total) * 100;
                    const gPct = (platformInsights.google.totalSpend / total) * 100;
                    const mPct = (platformInsights.meta.totalSpend / total) * 100;
                    return <>
                      <div className="flex h-4 rounded-full overflow-hidden mb-2">
                        {amzPct > 0 && <div className="bg-orange-500 h-full" style={{ width: `${amzPct}%` }}/>}
                        {gPct > 0 && <div className="bg-red-500 h-full" style={{ width: `${gPct}%` }}/>}
                        {mPct > 0 && <div className="bg-blue-500 h-full" style={{ width: `${mPct}%` }}/>}
                      </div>
                      <div className="flex gap-4 text-xs">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500"/>Amazon {amzPct.toFixed(0)}%</span>
                        {gPct > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"/>Google {gPct.toFixed(0)}%</span>}
                        {mPct > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"/>Meta {mPct.toFixed(0)}%</span>}
                      </div>
                    </>;
                  })()}
                </div>
                {/* Day of Week */}
                <div className="bg-slate-800/30 rounded-xl border border-slate-700/60 p-4">
                  <h3 className="text-white font-semibold text-sm mb-3">Day of Week Performance</h3>
                  <div className="flex items-end gap-1" style={{ height: '56px' }}>
                    {platformInsights.dowData.map((d, i) => {
                      const maxRev = Math.max(...platformInsights.dowData.map(x => x.avgRev), 0.01);
                      const h = (d.avgRev / maxRev) * 100;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center group relative">
                          <div className="w-full bg-cyan-500 opacity-50 hover:opacity-90 rounded-t transition-opacity" style={{ height: `${Math.max(h, 4)}%` }}/>
                          <span className="text-[9px] text-slate-600 mt-1">{d.day}</span>
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
              </div>
            </div>
          )}

          {/* ── PERIOD DETAIL (collapsible) ── */}
          <div className="mb-5">
            <button onClick={() => setShowTables(!showTables)} className="flex items-center gap-2 text-white text-sm font-semibold mb-3 hover:text-slate-300 transition-colors">
              <ChevronDown className={`w-4 h-4 transition-transform ${showTables ? '' : '-rotate-90'}`}/>Period Detail
            </button>
            {showTables && (<>
              <div className="flex gap-2 mb-3 p-1 bg-slate-800/40 rounded-xl overflow-x-auto">
                {['daily','weekly','monthly','quarterly','yearly'].map(t=>(
                  <button key={t} onClick={()=>setAdsTimeTab(t)} disabled={t==='daily'&&!hasDailyData}
                    className={`flex-1 min-w-fit px-3 py-2 rounded-lg font-medium text-xs transition-all capitalize ${adsTimeTab===t?'bg-cyan-600 text-white':'text-slate-400 hover:bg-slate-700 disabled:opacity-30'}`}>{t}</button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <select value={adsYear} onChange={e=>setAdsYear(parseInt(e.target.value))} className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs">{availableYears.map(y=><option key={y} value={y}>{y}</option>)}</select>
                {adsTimeTab==='monthly'&&<select value={adsMonth} onChange={e=>setAdsMonth(parseInt(e.target.value))} className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs">{monthNames.map((m,i)=><option key={i} value={i} disabled={!monthsWithData.includes(i)}>{m}</option>)}</select>}
                {adsTimeTab==='daily'&&sortedDays.length>0&&<select value={adsSelectedDay||''} onChange={e=>setAdsSelectedDay(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs">{sortedDays.slice().reverse().slice(0,90).map(d=><option key={d} value={d}>{new Date(d+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</option>)}</select>}
                {adsTimeTab==='weekly'&&weeksInYear.length>0&&<select value={adsSelectedWeek||''} onChange={e=>setAdsSelectedWeek(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs">{weeksInYear.slice().reverse().map(w=><option key={w} value={w}>{new Date(w+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}</option>)}</select>}
                {adsTimeTab==='quarterly'&&<select value={adsQuarter} onChange={e=>setAdsQuarter(parseInt(e.target.value))} className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs">{[1,2,3,4].map(q=><option key={q} value={q}>Q{q}</option>)}</select>}
                <div className="flex gap-1 ml-auto">
                  <button onClick={goToPrev} className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-white"><ChevronLeft className="w-3.5 h-3.5"/></button>
                  <button onClick={goToNext} className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-white"><ChevronRight className="w-3.5 h-3.5"/></button>
                </div>
              </div>

              <p className="text-slate-300 text-sm font-medium mb-2">{getPeriodLabel()} <span className="text-slate-600 font-normal">· {useDailyData?periodDays.length:periodWeeks.length} {useDailyData?'day':'week'}{(useDailyData?periodDays.length:periodWeeks.length)!==1?'s':''}</span></p>

              {useDailyData && dailyTableData.length > 0 && (
                <div className="bg-slate-800/30 rounded-xl border border-slate-700/60 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-xs">
                  <thead><tr className="border-b border-slate-700 text-slate-500 text-[10px] uppercase"><th className="py-2.5 px-3 text-left">Date</th><th className="py-2.5 px-2 text-right">Amazon</th><th className="py-2.5 px-2 text-right">Google</th><th className="py-2.5 px-2 text-right">Meta</th><th className="py-2.5 px-2 text-right">Total</th><th className="py-2.5 px-2 text-right">Revenue</th><th className="py-2.5 px-2 text-right">TACOS</th></tr></thead>
                  <tbody>{dailyTableData.map((d,i)=>{const tc=d.totalRev>0?(d.totalAds/d.totalRev)*100:0;return(<tr key={i} className="border-b border-slate-800/40 hover:bg-slate-800/20"><td className="py-2 px-3 text-slate-400">{fmtDate(d.date)}</td><td className="py-2 px-2 text-right text-orange-400">{d.amazonAds>0?formatCurrency(d.amazonAds):'—'}</td><td className="py-2 px-2 text-right text-red-400">{d.googleAds>0?formatCurrency(d.googleAds):'—'}</td><td className="py-2 px-2 text-right text-blue-400">{d.metaAds>0?formatCurrency(d.metaAds):'—'}</td><td className="py-2 px-2 text-right text-white">{formatCurrency(d.totalAds)}</td><td className="py-2 px-2 text-right text-white">{formatCurrency(d.totalRev)}</td><td className={`py-2 px-2 text-right font-medium ${tacosColor(tc)}`}>{tc>0?tc.toFixed(1)+'%':'—'}</td></tr>);})}</tbody>
                  <tfoot><tr className="border-t border-slate-600 font-medium"><td className="py-2 px-3 text-white">Total</td><td className="py-2 px-2 text-right text-orange-400">{formatCurrency(dailyTotals.amazonAds)}</td><td className="py-2 px-2 text-right text-red-400">{formatCurrency(dailyTotals.googleAds)}</td><td className="py-2 px-2 text-right text-blue-400">{formatCurrency(dailyTotals.metaAds)}</td><td className="py-2 px-2 text-right text-white">{formatCurrency(dailyTotals.totalAds)}</td><td className="py-2 px-2 text-right text-white">{formatCurrency(dailyTotals.totalRev)}</td><td className={`py-2 px-2 text-right ${tacosColor(totalTacos)}`}>{totalTacos>0?totalTacos.toFixed(1)+'%':'—'}</td></tr></tfoot>
                </table></div></div>
              )}

              {!useDailyData && weeklyTableData.length > 0 && (
                <div className="bg-slate-800/30 rounded-xl border border-slate-700/60 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-xs">
                  <thead><tr className="border-b border-slate-700 text-slate-500 text-[10px] uppercase"><th className="py-2.5 px-3 text-left">Week</th><th className="py-2.5 px-2 text-right">Amazon</th><th className="py-2.5 px-2 text-right">Google</th><th className="py-2.5 px-2 text-right">Meta</th><th className="py-2.5 px-2 text-right">Total</th><th className="py-2.5 px-2 text-right">Revenue</th><th className="py-2.5 px-2 text-right">TACOS</th></tr></thead>
                  <tbody>{weeklyTableData.map((w,i)=>(<tr key={i} className="border-b border-slate-800/40 hover:bg-slate-800/20"><td className="py-2 px-3 text-slate-400">{fmtDate(w.week)}</td><td className="py-2 px-2 text-right text-orange-400">{formatCurrency(w.amzAds)}</td><td className="py-2 px-2 text-right text-red-400">{formatCurrency(w.googleAds)}</td><td className="py-2 px-2 text-right text-blue-400">{formatCurrency(w.metaAds)}</td><td className="py-2 px-2 text-right text-white">{formatCurrency(w.totalAds)}</td><td className="py-2 px-2 text-right text-white">{formatCurrency(w.totalRev)}</td><td className={`py-2 px-2 text-right font-medium ${tacosColor(w.tacos)}`}>{w.tacos>0?w.tacos.toFixed(1)+'%':'—'}</td></tr>))}</tbody>
                  <tfoot><tr className="border-t border-slate-600 font-medium"><td className="py-2 px-3 text-white">Total</td><td className="py-2 px-2 text-right text-orange-400">{formatCurrency(totals.amzAds)}</td><td className="py-2 px-2 text-right text-red-400">{formatCurrency(totals.googleAds)}</td><td className="py-2 px-2 text-right text-blue-400">{formatCurrency(totals.metaAds)}</td><td className="py-2 px-2 text-right text-white">{formatCurrency(totals.totalAds)}</td><td className="py-2 px-2 text-right text-white">{formatCurrency(totals.totalRev)}</td><td className={`py-2 px-2 text-right ${tacosColor(totalTacos)}`}>{totalTacos>0?totalTacos.toFixed(1)+'%':'—'}</td></tr></tfoot>
                </table></div></div>
              )}

              {((useDailyData&&dailyTableData.length===0)||(!useDailyData&&weeklyTableData.length===0))&&(
                <div className="text-center py-8 bg-slate-800/20 rounded-xl border border-slate-700/40">
                  <p className="text-slate-500 text-sm">No data for {getPeriodLabel()}</p>
                </div>
              )}
            </>)}
          </div>
        </>)}

        {/* ════════════════════════════════════════════════════════ */}
        {/* AI REPORTS TAB                                         */}
        {/* ════════════════════════════════════════════════════════ */}
        {adsViewMode==='reports' && (<>
          <div className="bg-gradient-to-r from-orange-900/15 to-amber-900/10 rounded-xl border border-orange-500/25 p-5 mb-5">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div>
                <h3 className="text-white text-lg font-semibold flex items-center gap-2"><Brain className="w-5 h-5 text-orange-400"/>AI Ads Audit</h3>
                <p className="text-slate-500 text-xs mt-0.5">Cross-platform audit from all loaded data sources</p>
              </div>
              <select value={aiChatModel} onChange={e => setAiChatModel(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs">
                {AI_MODEL_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>

            {/* Data Sources */}
            {(() => {
              const sources = [];
              if (sortedDays.length > 0) sources.push({ platform: 'Dashboard', type: `Daily KPIs (${sortedDays.length}d)`, color: 'bg-violet-500' });
              if (hasCampaignData) { const ac = campaigns.filter(c => (c.spend||0)>0).length; sources.push({ platform: 'Amazon', type: `Campaigns (${ac} active)`, color: 'bg-orange-500' }); }
              if (adsIntelData) { ['amazon','google','meta','shopify'].forEach(p => { if (!adsIntelData[p] || typeof adsIntelData[p] !== 'object') return; Object.entries(adsIntelData[p]).forEach(([rt, data]) => { if (!data?.records) return; sources.push({ platform: p.charAt(0).toUpperCase()+p.slice(1), type: `${data.meta?.label||rt} (${data.records.length})`, color: p==='amazon'?'bg-orange-500':p==='google'?'bg-red-500':p==='meta'?'bg-blue-500':'bg-emerald-500' }); }); }); }
              return (
                <button onClick={()=>setShowDataSources(p=>!p)} className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 mb-4">
                  <Database className="w-3.5 h-3.5"/>{sources.length} data source{sources.length!==1?'s':''}<ChevronDown className={`w-3 h-3 transition-transform ${showDataSources?'rotate-180':''}`}/>
                </button>
              );
            })()}
            {showDataSources && (
              <div className="bg-slate-900/50 rounded-lg border border-slate-700/50 p-3 mb-4 space-y-1">
                {(() => {
                  const sources = [];
                  if (sortedDays.length > 0) sources.push({ p: 'Dashboard', t: `Daily KPIs (${sortedDays.length}d)`, c: 'bg-violet-500' });
                  if (hasCampaignData) sources.push({ p: 'Amazon', t: `Campaigns (${campaigns.filter(c=>(c.spend||0)>0).length} active)`, c: 'bg-orange-500' });
                  if (adsIntelData) { ['amazon','google','meta','shopify'].forEach(pl => { if (!adsIntelData[pl] || typeof adsIntelData[pl] !== 'object') return; Object.entries(adsIntelData[pl]).forEach(([rt, data]) => { if (!data?.records) return; sources.push({ p: pl.charAt(0).toUpperCase()+pl.slice(1), t: `${data.meta?.label||rt} (${data.records.length} rows)`, c: pl==='amazon'?'bg-orange-500':pl==='google'?'bg-red-500':pl==='meta'?'bg-blue-500':'bg-emerald-500' }); }); }); }
                  return sources.map((s,i) => <div key={i} className="flex items-center gap-2 text-xs"><span className={`w-1.5 h-1.5 rounded-full ${s.c}`}/><span className="text-slate-500 w-16">{s.p}</span><span className="text-slate-300">{s.t}</span></div>);
                })()}
              </div>
            )}

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
                all: `Generate a COMPREHENSIVE CROSS-PLATFORM ADVERTISING AUDIT.\n\nREQUIRED SECTIONS:\n## 📊 EXECUTIVE SUMMARY — Health score 1-10, total spend/revenue/ROAS per platform, #1 urgent issue, #1 opportunity\n## 🚫 CUT WASTE — Exact campaign/keyword names, spend amounts, $0 sales, specific actions\n## 🏆 PROTECT WINNERS — Top performers, defend/scale strategy\n## 📈 SCALE OPPORTUNITIES — Current metrics, scaling math, launch plan\n## 📍 PLACEMENT OPTIMIZATION — TOS vs Product Pages vs RoS with bid modifier %\n## 💰 CROSS-PLATFORM BUDGET REALLOCATION — Current → Recommended split with math\n## 📊 TREND DIAGNOSIS — MoM trajectory, TACOS trend direction\n## 🎯 THIS WEEK: Top 5 Priority Actions — action → $ impact → minutes → click-path`,
                amazon: `Generate a DEEP-DIVE AMAZON ADS AUDIT.\n\nREQUIRED SECTIONS:\n## 📊 AMAZON AD HEALTH — Score 1-10, spend, ACOS, TACOS, organic split\n## 🔍 SEARCH TERM ANALYSIS — Top 10 profitable, top 10 wasteful, negative keyword list with match types\n## 📋 CAMPAIGN PERFORMANCE — Every campaign with full KPIs, flag ROAS<1.5x or ACOS>40%\n## 🎯 TARGETING ANALYSIS — Broad vs Phrase vs Exact efficiency, auto vs manual, harvesting recommendations\n## 📍 PLACEMENT OPTIMIZATION — TOS vs Product Pages vs RoS: ROAS, CPC, bid modifier %\n## 💡 SKU-LEVEL PERFORMANCE — Which products profitable to advertise vs burning budget?\n## 🔄 CAMPAIGN STRUCTURE — Segmentation recommendations, single-keyword exact match for top performers\n## 🎯 THIS WEEK: Top 5 Amazon Actions`,
                dtc: `Generate a DTC ADVERTISING AUDIT (Google + Meta).\n\nREQUIRED SECTIONS:\n## 📊 DTC AD HEALTH — Combined score, total DTC spend, ROAS, CPA, vs Amazon efficiency\n## 🔍 GOOGLE DEEP DIVE — Campaigns, search terms, CPC, conversion rate, keyword opportunities\n## 📱 META DEEP DIVE — Creative fatigue, audiences, placements, CPA, frequency\n## 💰 GOOGLE vs META — Side-by-side CPC/CTR/CPA/ROAS comparison\n## 🔄 BUDGET REALLOCATION — Current → Recommended Google/Meta split with math\n## 🎯 THIS WEEK: Top 5 DTC Actions`,
                google: `Generate a DEEP-DIVE GOOGLE ADS AUDIT.\n\nREQUIRED SECTIONS:\n## 📊 GOOGLE ADS HEALTH — Score 1-10, spend, clicks, CPC, CTR, conversions, cost/conversion\n## 🔍 SEARCH TERM ANALYSIS — Top performers, wasteful terms, match type efficiency\n## 📋 CAMPAIGN PERFORMANCE — Every campaign with recommendations (scale/pause/restructure)\n## 💡 KEYWORD OPPORTUNITIES — Missing keywords, competitor gaps, long-tail with CPC estimates\n## 🎯 BID STRATEGY — Current assessment, recommended changes with $ amounts\n## 🎯 THIS WEEK: Top 5 Google Actions`,
                meta: `Generate a DEEP-DIVE META ADS AUDIT.\n\nREQUIRED SECTIONS:\n## 📊 META ADS HEALTH — Score 1-10, spend, impressions, CTR, CPC, purchases, CPA, ROAS\n## 🎨 CREATIVE PERFORMANCE — Which ads performing, fatigue indicators, refresh timing\n## 👥 AUDIENCE ANALYSIS — Best converting audiences, lookalike vs interest vs retargeting\n## 📍 PLACEMENT BREAKDOWN — Feed vs Stories vs Reels: CPC, CTR, CPA\n## 📈 SCALING PLAN — Which to scale, daily budget, expected CPA at higher spend\n## 🎯 THIS WEEK: Top 5 Meta Actions`,
              };
              setShowAdsAIChat(true);
              setTimeout(() => sendAdsAIMessage(prompts[reportMode]), 200);
            }} className="w-full px-5 py-3.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 rounded-xl text-white font-semibold shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 transition-all">
              <Zap className="w-4 h-4"/>Generate {REPORT_MODES.find(m => m.key === reportMode)?.label} Audit
            </button>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
              {[
                { label: 'Negative Keywords', emoji: '🚫', prompt: "Top 20 negative keywords to add TODAY with match types, campaigns, and monthly savings." },
                { label: 'Scale Opps', emoji: '📈', prompt: "Top 10 scaling opportunities: campaign/keyword, current spend, ROAS, recommended spend, projected revenue." },
                { label: 'Organic vs Paid', emoji: '🔄', prompt: "Where am I paying for organic clicks? Where to increase paid? Specific keywords with $ impact." },
                { label: 'Weekly Plan', emoji: '📋', prompt: "Weekly PPC maintenance checklist: what to check every Monday, bid adjustments, thresholds." },
              ].map((a,i) => (
                <button key={i} onClick={()=>{setShowAdsAIChat(true);setTimeout(()=>sendAdsAIMessage(a.prompt),200);}}
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
                <button onClick={()=>{if(window.confirm('Clear report history?'))setAdsAiReportHistory([]);}} className="text-[10px] text-slate-600 hover:text-rose-400">Clear</button>
              </div>
              <div className="space-y-1">
                {adsAiReportHistory.slice(-5).reverse().map((r,i)=>(
                  <div key={i} className="flex items-center justify-between bg-slate-900/40 rounded-lg px-3 py-1.5 text-[10px]">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">{r.date}</span>
                      <span className={`px-1 py-0.5 rounded ${r.model==='Opus'?'bg-violet-900/50 text-violet-300':'bg-slate-700 text-slate-400'}`}>{r.model}</span>
                      {r.healthScore && <span className={`font-bold ${parseInt(r.healthScore)>=7?'text-emerald-400':parseInt(r.healthScore)>=4?'text-amber-400':'text-rose-400'}`}>{r.healthScore}/10</span>}
                    </div>
                    <select value={r.actionsTaken||'pending'} onChange={e=>{setAdsAiReportHistory(prev=>prev.map((rr,ri)=>ri===prev.length-1-i?{...rr,actionsTaken:e.target.value}:rr));}} className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-[9px] text-slate-400">
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
                  <button onClick={()=>{ const r = adsAiMessages.filter(m=>m.role==='assistant').map(m=>m.content).join('\n\n---\n\n'); navigator.clipboard.writeText(r).then(()=>setToast({message:'Copied',type:'success'})); }} className="text-slate-500 hover:text-white text-[10px] px-2 py-1 bg-slate-700/40 rounded-lg hover:bg-slate-700">📋 Text</button>
                  <button onClick={()=>{ const r = adsAiMessages.filter(m=>m.role==='assistant').map(m=>m.content).join('\n\n---\n\n'); const html = markdownToHtml(r); const blob = new Blob([html], {type:'text/html'}); const item = new ClipboardItem({'text/html': blob, 'text/plain': new Blob([r], {type:'text/plain'})}); navigator.clipboard.write([item]).then(()=>setToast({message:'Copied for Docs',type:'success'})).catch(()=>navigator.clipboard.writeText(r)); }} className="text-slate-500 hover:text-white text-[10px] px-2 py-1 bg-slate-700/40 rounded-lg hover:bg-slate-700">📄 Docs</button>
                  <button onClick={()=>{ const r = adsAiMessages.map(m=>m.role==='user'?`**PROMPT:** ${m.content}`:m.content).join('\n\n---\n\n'); const h = `# Tallowbourn Advertising Audit\n**${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}** · ${getModelLabel(aiChatModel)}\n\n---\n\n`; const blob = new Blob([h+r], {type:'text/markdown'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `tallowbourn-audit-${new Date().toISOString().slice(0,10)}.md`; a.click(); URL.revokeObjectURL(url); setToast({message:'Downloaded',type:'success'}); }} className="text-slate-500 hover:text-white text-[10px] px-2 py-1 bg-slate-700/40 rounded-lg hover:bg-slate-700">⬇ .md</button>
                  <button onClick={()=>{
                    const report = adsAiMessages.filter(m=>m.role==='assistant').map(m=>m.content).join('\n\n---\n\n');
                    const dateStr = new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
                    const modelName = getModelLabel(aiChatModel);
                    const modeLabel = REPORT_MODES.find(m => m.key === reportMode)?.label || 'All Platforms';
                    const htmlBody = markdownToHtml(report);
                    const kpiHtml = amazonAdsInsights.summary ? `<div class="kpi-bar"><div class="kpi"><span class="kpi-label">Ad Spend</span><span class="kpi-value">$${(amazonAdsInsights.summary.totalSpend||0).toLocaleString(undefined,{maximumFractionDigits:0})}</span></div><div class="kpi"><span class="kpi-label">Revenue</span><span class="kpi-value">$${(amazonAdsInsights.summary.totalSales||0).toLocaleString(undefined,{maximumFractionDigits:0})}</span></div><div class="kpi"><span class="kpi-label">ROAS</span><span class="kpi-value">${(amazonAdsInsights.summary.overallRoas||0).toFixed(2)}x</span></div><div class="kpi"><span class="kpi-label">TACOS</span><span class="kpi-value">${(platformInsights.blendedTacos||0).toFixed(1)}%</span></div><div class="kpi"><span class="kpi-label">Days</span><span class="kpi-value">${amazonAdsInsights.summary.daysCount||0}</span></div></div>` : '';
                    const printDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tallowbourn ${modeLabel} Audit</title><style>@page{margin:.75in;size:letter}*{box-sizing:border-box}body{font-family:'Segoe UI',system-ui,sans-serif;color:#1a1a2e;line-height:1.65;max-width:100%;padding:0;margin:0;font-size:11pt}.header{background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460);color:white;padding:32px 40px 20px;margin:-.75in -.75in 0}.header h1{font-size:22pt;margin:0 0 4px;font-weight:800}.header .subtitle{font-size:13pt;opacity:.85;margin-bottom:12px;font-weight:300}.header .meta{font-size:9pt;opacity:.7;display:flex;gap:20px}.kpi-bar{display:flex;gap:0;margin:0 -.75in;padding:16px 40px;background:#0a1628}.kpi{flex:1;text-align:center;border-right:1px solid rgba(255,255,255,.1)}.kpi:last-child{border-right:none}.kpi-label{display:block;font-size:8pt;text-transform:uppercase;letter-spacing:.5px;color:rgba(255,255,255,.5);margin-bottom:2px}.kpi-value{display:block;font-size:14pt;font-weight:700;color:white}.content{padding-top:24px}h2{color:#1a1a2e;border-bottom:3px solid #e94560;padding-bottom:6px;margin-top:32px;font-size:14pt}h3{color:#16213e;margin-top:22px;font-size:12pt;border-left:3px solid #e94560;padding-left:10px}h4{color:#444;margin-top:16px;font-size:11pt}p,li{font-size:11pt;margin-bottom:6px}ul,ol{padding-left:22px}strong{color:#e94560}code{background:#f0f0f0;padding:1px 5px;border-radius:3px;font-size:10pt}hr{border:none;border-top:1px solid #ddd;margin:28px 0}blockquote{border-left:3px solid #e94560;margin:16px 0;padding:8px 16px;background:#fff5f5;font-style:italic}.footer{margin-top:48px;padding-top:16px;border-top:2px solid #1a1a2e;font-size:8pt;color:#888;text-align:center}.confidential{background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:10px 16px;margin-bottom:24px;font-size:9pt;color:#856404}@media print{.no-print{display:none!important}.header,.kpi-bar{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><div class="header"><h1>Tallowbourn Advertising Audit</h1><div class="subtitle">${modeLabel} Performance Report</div><div class="meta"><span>${dateStr}</span><span>${modelName}</span><span>${intelDateRange==='all'?'All data':intelDateRange+'d window'}</span></div></div>${kpiHtml}<div class="content"><div class="no-print" style="background:#fff3cd;padding:12px 20px;margin-bottom:20px;border-radius:8px;font-size:10pt;color:#856404">Press Ctrl+P → Save as PDF</div><div class="confidential">CONFIDENTIAL — Proprietary advertising data for Tallowbourn.</div>${htmlBody}</div><div class="footer"><p><strong>Tallowbourn Advertising Command Center</strong></p><p>${modeLabel} Audit · ${dateStr} · ${modelName} · ${Date.now().toString(36).toUpperCase()}</p><p style="margin-top:6px;font-size:7pt">AI-generated analysis. Validate before implementation.</p></div></body></html>`;
                    const w = window.open('','_blank','width=900,height=700'); w.document.write(printDoc); w.document.close(); setTimeout(()=>w.print(), 500);
                  }} className="px-3 py-1.5 bg-gradient-to-r from-orange-600/80 to-amber-600/80 rounded-lg text-white text-[10px] font-medium hover:from-orange-500 hover:to-amber-500 flex items-center gap-1">📊 Export PDF</button>
                </div>
              </div>
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {adsAiMessages.map((msg,i)=>(
                  <div key={i} className={`${msg.role==='user'?'bg-orange-900/15 border border-orange-500/15':'bg-slate-900/40'} rounded-xl p-4 group relative`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[10px] text-slate-600 mb-1">{msg.role==='user'?'Prompt':'AI Report'}</p>
                      <button onClick={()=>{ if (msg.role==='user') setAdsAiMessages(prev=>prev.filter((_,j)=>j!==i&&j!==i+1)); else setAdsAiMessages(prev=>prev.filter((_,j)=>j!==i)); }}
                        className="hidden group-hover:block p-1 rounded hover:bg-rose-900/30 text-slate-700 hover:text-rose-400"><X className="w-3 h-3"/></button>
                    </div>
                    <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                ))}
                {adsAiLoading&&<div className="bg-slate-900/40 rounded-xl p-4"><div className="flex gap-1"><div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{animationDelay:'0ms'}}/><div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{animationDelay:'150ms'}}/><div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{animationDelay:'300ms'}}/></div></div>}
              </div>
            </div>
          )}
        </>)}

        {/* ════════════════════════════════════════════════════════ */}
        {/* DATA TAB                                               */}
        {/* ════════════════════════════════════════════════════════ */}
        {adsViewMode==='upload' && (<>
          {/* Upload Zone */}
          <div className={`rounded-xl border-2 border-dashed p-6 text-center transition-all mb-5 ${isDragging?'border-violet-400 bg-violet-900/20':'border-slate-700/60 bg-slate-800/20 hover:border-slate-600'}`}
            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
            {uploadStatus?.processing ? (
              <div className="py-4"><Loader2 className="w-10 h-10 text-violet-400 mx-auto mb-3 animate-spin"/><p className="text-white font-medium text-sm">Processing...</p></div>
            ) : (<>
              <Upload className="w-8 h-8 text-slate-500 mx-auto mb-3"/>
              <h3 className="text-white font-semibold mb-1">Drop Ad Reports Here</h3>
              <p className="text-slate-500 text-xs mb-3 max-w-md mx-auto">CSV, XLSX, or ZIP — auto-detects Amazon PPC, Google Ads, Meta Ads, Shopify, Brand Analytics</p>
              <button onClick={()=>fileInputRef.current?.click()} className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 rounded-xl text-white text-sm font-medium shadow-lg shadow-violet-500/20">
                <span className="flex items-center gap-2"><FileSpreadsheet className="w-4 h-4"/>Choose Files</span>
              </button>
              <input ref={fileInputRef} type="file" multiple accept=".csv,.xlsx,.xls,.zip,.tsv" className="hidden" onChange={e=>handleFileDrop(e.target.files)}/>
              <div className="flex justify-center gap-4 mt-4 text-[10px] text-slate-600">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-500"/>Amazon</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500"/>Google</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"/>Meta</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>Shopify</span>
              </div>
            </>)}
          </div>

          {/* Upload Results */}
          {uploadStatus?.results && (
            <div className="bg-slate-800/30 rounded-xl border border-slate-700/60 p-4 mb-5">
              <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400"/>Last Upload</h3>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="bg-emerald-900/15 rounded-lg border border-emerald-500/20 p-3 text-center"><p className="text-xl font-bold text-emerald-400">{uploadStatus.results.summary.tier1}</p><p className="text-slate-500 text-[10px]">Daily KPIs</p></div>
                <div className="bg-violet-900/15 rounded-lg border border-violet-500/20 p-3 text-center"><p className="text-xl font-bold text-violet-400">{uploadStatus.results.summary.tier2}</p><p className="text-slate-500 text-[10px]">Deep Analysis</p></div>
                <div className={`rounded-lg border p-3 text-center ${uploadStatus.results.summary.unrecognized>0?'bg-amber-900/15 border-amber-500/20':'bg-slate-800/30 border-slate-700/50'}`}><p className={`text-xl font-bold ${uploadStatus.results.summary.unrecognized>0?'text-amber-400':'text-slate-600'}`}>{uploadStatus.results.summary.unrecognized}</p><p className="text-slate-500 text-[10px]">Unrecognized</p></div>
              </div>
              <div className="space-y-1">
                {uploadStatus.results.summary.reportTypes.map((r,i)=>(
                  <div key={i} className="flex items-center gap-2 text-xs bg-slate-900/30 rounded-lg px-3 py-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${r.platform==='amazon'?'bg-orange-500':r.platform==='google'?'bg-red-500':r.platform==='meta'?'bg-blue-500':'bg-emerald-500'}`}/>
                    <span className="text-white flex-1">{r.label}</span>
                    <span className="text-slate-600 text-[10px] truncate max-w-[180px]">{r.fileName}</span>
                  </div>
                ))}
                {uploadStatus.results.unrecognized.map((r,i)=>(
                  <div key={`u${i}`} className="flex items-center gap-2 text-xs bg-amber-900/10 rounded-lg px-3 py-1.5">
                    <AlertTriangle className="w-3 h-3 text-amber-400"/><span className="text-amber-300 flex-1">{r.fileName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Data Inventory */}
          <div className="bg-slate-800/20 rounded-xl border border-slate-700/50 p-4">
            <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><Database className="w-4 h-4 text-cyan-400"/>Loaded Data</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div className="bg-slate-900/40 rounded-lg p-3"><div className="flex items-center gap-1.5 mb-1"><span className="w-2 h-2 rounded-full bg-orange-500"/><span className="text-white text-xs font-medium">Amazon</span></div><p className="text-slate-500 text-[10px]">{sortedDays.filter(d=>allDaysData[d]?.amazon?.adSpend>0).length}d SP-API · {sortedDays.filter(d=>(allDaysData[d]?.amazonAdsMetrics?.spend||0)>0).length}d bulk</p></div>
              <div className="bg-slate-900/40 rounded-lg p-3"><div className="flex items-center gap-1.5 mb-1"><span className="w-2 h-2 rounded-full bg-red-500"/><span className="text-white text-xs font-medium">Google</span></div><p className="text-slate-500 text-[10px]">{sortedDays.filter(d=>(allDaysData[d]?.shopify?.googleSpend||0)>0).length}d spend · {sortedDays.filter(d=>(allDaysData[d]?.shopify?.adsMetrics?.googleImpressions||0)>0).length}d metrics</p></div>
              <div className="bg-slate-900/40 rounded-lg p-3"><div className="flex items-center gap-1.5 mb-1"><span className="w-2 h-2 rounded-full bg-blue-500"/><span className="text-white text-xs font-medium">Meta</span></div><p className="text-slate-500 text-[10px]">{sortedDays.filter(d=>(allDaysData[d]?.shopify?.metaSpend||0)>0).length}d spend · {sortedDays.filter(d=>(allDaysData[d]?.shopify?.adsMetrics?.metaImpressions||0)>0).length}d metrics</p></div>
            </div>
            {deepReportCount > 0 ? (
              <div>
                <h4 className="text-violet-400 text-[10px] font-semibold uppercase tracking-wider mb-2">Deep Analysis Reports</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                  {Object.entries(adsIntelData||{}).map(([platform,reports])=>{
                    if(platform==='lastUpdated'||platform==='reportCount'||typeof reports!=='object') return null;
                    return Object.entries(reports).map(([rt,data])=>{
                      if(!data?.records) return null;
                      return (<div key={`${platform}-${rt}`} className="flex items-center gap-2 bg-slate-900/30 rounded-lg px-3 py-1.5 text-xs">
                        <span className={`w-1.5 h-1.5 rounded-full ${platform==='amazon'?'bg-orange-500':platform==='google'?'bg-red-500':platform==='meta'?'bg-blue-500':'bg-emerald-500'}`}/>
                        <span className="text-white flex-1 truncate">{data.meta?.label||rt}</span>
                        <span className="text-slate-600 text-[10px]">{data.records.length} rows</span>
                      </div>);
                    });
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <Brain className="w-6 h-6 text-slate-700 mx-auto mb-1"/><p className="text-slate-600 text-xs">No deep analysis data — upload search terms, placements, or campaigns for AI reports</p>
              </div>
            )}

            {/* Brand Analytics */}
            {adsIntelData?.amazon?.search_query_performance && (
              <div className="mt-4 pt-4 border-t border-slate-700/50">
                <h4 className="text-amber-400 text-[10px] font-semibold uppercase tracking-wider mb-2">Brand Analytics — Search Query Performance</h4>
                <div className="overflow-x-auto"><table className="w-full text-xs">
                  <thead><tr className="border-b border-slate-700/50 text-slate-500"><th className="py-1.5 text-left">#</th><th className="py-1.5 text-left">Query</th><th className="py-1.5 text-right">Volume</th><th className="py-1.5 text-right">Brand %</th><th className="py-1.5 text-right">Click %</th></tr></thead>
                  <tbody>{adsIntelData.amazon.search_query_performance.records.slice(0,15).map((r,i)=>(
                    <tr key={i} className="border-b border-slate-800/30"><td className="py-1 text-slate-600">{i+1}</td><td className="py-1 text-white">{r['Search Query']||'—'}</td><td className="py-1 text-right text-slate-400">{formatNumber(Number(r['Search Query Volume']||0))}</td><td className="py-1 text-right text-cyan-400">{Number(r['Impressions: Brand Share %']||0).toFixed(1)}%</td><td className="py-1 text-right text-emerald-400">{Number(r['Clicks: Brand Share %']||0).toFixed(1)}%</td></tr>
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
                  <select value={aiChatModel} onChange={e=>setAiChatModel(e.target.value)} className="bg-white/10 border border-white/20 rounded-lg px-1.5 py-1 text-white text-[10px]">
                    {AI_MODEL_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label.replace('Claude ', '')}</option>)}
                  </select>
                  <button onClick={()=>setAdsAiMessages([])} className="p-1.5 hover:bg-white/20 rounded-lg text-white/60 hover:text-white" title="Clear"><RefreshCw className="w-3.5 h-3.5"/></button>
                  <button onClick={()=>setShowAdsAIChat(false)} className="p-1.5 hover:bg-white/20 rounded-lg text-white"><X className="w-4 h-4"/></button>
                </div>
              </div>
              <div className="h-[30rem] overflow-y-auto p-4 space-y-3">
                {adsAiMessages.length===0 && (
                  <div className="text-center text-slate-500 py-2">
                    <Zap className="w-8 h-8 mx-auto mb-2 opacity-40"/>
                    <p className="text-xs mb-3">Ask anything about your ads</p>
                    <div className="space-y-1.5 text-left">
                      <button onClick={()=>sendAdsAIMessage("Generate my complete cross-platform Ads Action Plan with specific recommendations and dollar amounts.")} className="block w-full px-3 py-2.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 rounded-lg text-xs text-white font-semibold shadow-lg shadow-orange-500/20">⚡ Full Action Plan</button>
                      <button onClick={()=>sendAdsAIMessage("Which campaigns or search terms are wasting money? Give me negative keyword suggestions.")} className="block w-full px-3 py-2 bg-slate-700/40 hover:bg-slate-700 rounded-lg text-xs text-slate-300">⚠️ Find wasted spend</button>
                      <button onClick={()=>sendAdsAIMessage("What are my best scaling opportunities across all platforms?")} className="block w-full px-3 py-2 bg-slate-700/40 hover:bg-slate-700 rounded-lg text-xs text-slate-300">🚀 Scaling opportunities</button>
                      <button onClick={()=>sendAdsAIMessage("How should I reallocate budget across Amazon, Google, and Meta?")} className="block w-full px-3 py-2 bg-slate-700/40 hover:bg-slate-700 rounded-lg text-xs text-slate-300">💰 Budget allocation</button>
                    </div>
                  </div>
                )}
                {adsAiMessages.map((msg,i)=>(
                  <div key={i} className={`flex ${msg.role==='user'?'justify-end':'justify-start'} group`}>
                    <div className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 relative ${msg.role==='user'?'bg-orange-600 text-white':'bg-slate-700 text-slate-200'}`}>
                      <button onClick={()=>{ if (msg.role==='user') setAdsAiMessages(prev=>prev.filter((_,j)=>j!==i&&j!==i+1)); else setAdsAiMessages(prev=>prev.filter((_,j)=>j!==i)); }}
                        className={`absolute -top-1.5 -right-1.5 hidden group-hover:flex w-4 h-4 items-center justify-center rounded-full text-white shadow ${msg.role==='user'?'bg-rose-500':'bg-slate-500 hover:bg-rose-500'}`}>
                        <X className="w-2.5 h-2.5"/>
                      </button>
                      <p className="text-xs whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {adsAiLoading&&<div className="flex justify-start"><div className="bg-slate-700 rounded-2xl px-4 py-3"><div className="flex gap-1"><div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{animationDelay:'0ms'}}/><div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{animationDelay:'150ms'}}/><div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{animationDelay:'300ms'}}/></div></div></div>}
              </div>
              <div className="p-3 border-t border-slate-700"><div className="flex gap-2">
                <input type="text" value={adsAiInput} onChange={e=>setAdsAiInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();sendAdsAIMessage();}}} placeholder="Ask about campaigns, ROAS, keywords..." className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-orange-500" autoComplete="off"/>
                <button onClick={sendAdsAIMessage} disabled={!adsAiInput.trim()||adsAiLoading} className="px-3 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 rounded-xl text-white"><Send className="w-3.5 h-3.5"/></button>
              </div></div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default AdsView;
