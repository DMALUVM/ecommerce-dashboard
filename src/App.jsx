import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Upload, DollarSign, TrendingUp, Package, ShoppingCart, BarChart3, Download, Calendar, ChevronLeft, ChevronRight, Trash2, FileSpreadsheet, Check, Database, AlertTriangle, AlertCircle, CheckCircle, Clock, Boxes, RefreshCw, Layers, CalendarRange, Settings } from 'lucide-react';

const parseCSV = (text) => {
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((header, i) => { obj[header.trim().replace(/^\uFEFF/, '')] = values[i]?.trim() || ''; });
    return obj;
  });
};

const parseCSVLine = (line) => {
  const result = []; let current = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) { result.push(current); current = ''; }
    else current += char;
  }
  result.push(current);
  return result;
};

const formatCurrency = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '$0.00';
  return (num < 0 ? '-' : '') + '$' + Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const formatPercent = (num) => (num === null || num === undefined || isNaN(num)) ? '0.0%' : num.toFixed(1) + '%';
const formatNumber = (num) => (num === null || num === undefined || isNaN(num)) ? '0' : Math.round(num).toLocaleString('en-US');

const getSunday = (date) => {
  const d = new Date(date);
  d.setDate(d.getDate() + (7 - d.getDay()) % 7);
  return d.toISOString().split('T')[0];
};

const STORAGE_KEY = 'ecommerce_dashboard_v5';
const INVENTORY_KEY = 'ecommerce_inventory_v5';
const COGS_KEY = 'ecommerce_cogs_v1';

// Supabase (cloud auth + storage)
// Create a .env.local file in your Vite project with:
//   VITE_SUPABASE_URL=...
//   VITE_SUPABASE_ANON_KEY=...
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const lsGet = (key) => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const lsSet = (key, value) => {
  try { localStorage.setItem(key, value); } catch {}
};


export default function Dashboard() {
  const [view, setView] = useState('upload');
  const [weekEnding, setWeekEnding] = useState('');
  const [files, setFiles] = useState({ amazon: null, shopify: null, cogs: null, threepl: null });
  const [fileNames, setFileNames] = useState({ amazon: '', shopify: '', cogs: '', threepl: '' });
  const [adSpend, setAdSpend] = useState({ meta: '', google: '' });
  const [allWeeksData, setAllWeeksData] = useState({});
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

// Auth + cloud sync
const [session, setSession] = useState(null);
const [authEmail, setAuthEmail] = useState('');
const [authPassword, setAuthPassword] = useState('');
const [authMode, setAuthMode] = useState('sign_in'); // sign_in | sign_up
const [authError, setAuthError] = useState('');
const [cloudStatus, setCloudStatus] = useState('');
const [isAuthReady, setIsAuthReady] = useState(false);
const lastSavedRef = useRef(0);
const saveTimerRef = useRef(null);
const isLoadingDataRef = useRef(false);

const handleAuth = async (e) => {
  e.preventDefault();
  setAuthError('');
  if (!supabase) { setAuthError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'); return; }
  try {
    if (authMode === 'sign_up') {
      const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
      if (error) throw error;
      setAuthError('Account created. You can sign in now.');
      setAuthMode('sign_in');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
      if (error) throw error;
    }
  } catch (err) {
    setAuthError(err?.message || 'Login failed');
  }
};

const handleLogout = async () => {
  if (!supabase) return;
  await supabase.auth.signOut();
};


  
  const [savedCogs, setSavedCogs] = useState({});
  const [cogsLastUpdated, setCogsLastUpdated] = useState(null);
  const [showCogsManager, setShowCogsManager] = useState(false);
  
  const [bulkImportResult, setBulkImportResult] = useState(null);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [customPeriodData, setCustomPeriodData] = useState(null);

  const [invFiles, setInvFiles] = useState({ amazon: null, threepl: null, cogs: null });
  const [invFileNames, setInvFileNames] = useState({ amazon: '', threepl: '', cogs: '' });
  const [invHistory, setInvHistory] = useState({});
  const [selectedInvDate, setSelectedInvDate] = useState(null);
  const [invSnapshotDate, setInvSnapshotDate] = useState('');
  
  const [showEditAdSpend, setShowEditAdSpend] = useState(false);
  const [editAdSpend, setEditAdSpend] = useState({ meta: '', google: '' });
  
  const [showReprocess, setShowReprocess] = useState(false);
  const [reprocessFiles, setReprocessFiles] = useState({ amazon: null, shopify: null, threepl: null });
  const [reprocessFileNames, setReprocessFileNames] = useState({ amazon: '', shopify: '', threepl: '' });
  const [reprocessAdSpend, setReprocessAdSpend] = useState({ meta: '', google: '' });

  // Period uploads (monthly/yearly totals without weekly breakdown)
  const [periodFiles, setPeriodFiles] = useState({ amazon: null, shopify: null, threepl: null });
  const [periodFileNames, setPeriodFileNames] = useState({ amazon: '', shopify: '', threepl: '' });
  const [periodAdSpend, setPeriodAdSpend] = useState({ meta: '', google: '' });
  const [periodLabel, setPeriodLabel] = useState('');
  const [allPeriodsData, setAllPeriodsData] = useState({});
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  
const PERIODS_KEY = 'ecommerce_periods_v1';

const combinedData = useMemo(() => ({
  sales: allWeeksData,
  inventory: invHistory,
  cogs: { lookup: savedCogs, updatedAt: cogsLastUpdated },
  periods: allPeriodsData,
}), [allWeeksData, invHistory, savedCogs, cogsLastUpdated, allPeriodsData]);

const loadFromLocal = useCallback(() => {
  try {
    const r = lsGet(STORAGE_KEY);
    if (r) {
      const d = JSON.parse(r);
      setAllWeeksData(d);
      const w = Object.keys(d).sort().reverse();
      if (w.length) { setSelectedWeek(w[0]); setView('weekly'); }
    }
  } catch {}

  try {
    const r = lsGet(INVENTORY_KEY);
    if (r) setInvHistory(JSON.parse(r));
  } catch {}

  try {
    const r = lsGet(COGS_KEY);
    if (r) {
      const d = JSON.parse(r);
      setSavedCogs(d.lookup || {});
      setCogsLastUpdated(d.updatedAt || null);
    }
  } catch {}

  try {
    const r = lsGet(PERIODS_KEY);
    if (r) setAllPeriodsData(JSON.parse(r));
  } catch {}
}, []);

const writeToLocal = useCallback((key, value) => {
  lsSet(key, value);
}, []);

const pushToCloudNow = useCallback(async (dataObj) => {
  if (!supabase || !session?.user?.id) return;
  setCloudStatus('Saving…');
  const payload = {
    user_id: session.user.id,
    data: dataObj,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('app_data').upsert(payload, { onConflict: 'user_id' });
  if (error) {
    setCloudStatus('Save failed (offline?)');
    return;
  }
  lastSavedRef.current = Date.now();
  setCloudStatus('Saved');
  setTimeout(() => setCloudStatus(''), 1500);
}, [session]);

const queueCloudSave = useCallback((nextDataObj) => {
  if (!session?.user?.id || !supabase) return;
  if (isLoadingDataRef.current) return;

  if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  saveTimerRef.current = setTimeout(() => {
    pushToCloudNow(nextDataObj);
  }, 800);
}, [session, pushToCloudNow]);

const loadFromCloud = useCallback(async () => {
  if (!supabase || !session?.user?.id) return false;
  setCloudStatus('Loading…');
  const { data, error } = await supabase
    .from('app_data')
    .select('data')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error) {
    setCloudStatus('');
    return false;
  }
  if (!data?.data) {
    setCloudStatus('');
    return false;
  }

  // Apply cloud data to state
  const cloud = data.data || {};
  isLoadingDataRef.current = true
  try {
    setAllWeeksData(cloud.sales || {});
    const w = Object.keys(cloud.sales || {}).sort().reverse();
    if (w.length) { setSelectedWeek(w[0]); setView('weekly'); }
    setInvHistory(cloud.inventory || {});
    setSavedCogs(cloud.cogs?.lookup || {});
    setCogsLastUpdated(cloud.cogs?.updatedAt || null);
    setAllPeriodsData(cloud.periods || {});

    // Also keep localStorage in sync for offline backup
    writeToLocal(STORAGE_KEY, JSON.stringify(cloud.sales || {}));
    writeToLocal(INVENTORY_KEY, JSON.stringify(cloud.inventory || {}));
    writeToLocal(COGS_KEY, JSON.stringify({ lookup: cloud.cogs?.lookup || {}, updatedAt: cloud.cogs?.updatedAt || null }));
    writeToLocal(PERIODS_KEY, JSON.stringify(cloud.periods || {}));
  } finally {
    isLoadingDataRef.current = false
  }

  setCloudStatus('');
  return true;
}, [session, writeToLocal]);

// Set up auth + initial load
useEffect(() => {
  let unsub = null;
  const boot = async () => {
    if (!supabase) {
      setIsAuthReady(true);
      loadFromLocal();
      return;
    }

    const { data } = await supabase.auth.getSession();
    setSession(data?.session || null);

    unsub = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    }).data?.subscription;

    setIsAuthReady(true);
  };

  boot();
  return () => { if (unsub) unsub.unsubscribe(); };
}, [loadFromLocal]);

// Whenever session changes: load cloud if present, else fall back to local.
useEffect(() => {
  const run = async () => {
    if (!isAuthReady) return;
    isLoadingDataRef.current = true;
    try {
      if (session?.user?.id && supabase) {
        const ok = await loadFromCloud();
        if (!ok) {
          // No cloud data yet: load local and push it up once.
          loadFromLocal();
          const localCombined = {
            sales: (() => { try { return JSON.parse(lsGet(STORAGE_KEY) || '{}'); } catch { return {}; } })(),
            inventory: (() => { try { return JSON.parse(lsGet(INVENTORY_KEY) || '{}'); } catch { return {}; } })(),
            cogs: (() => { try { return JSON.parse(lsGet(COGS_KEY) || '{"lookup":{},"updatedAt":null}'); } catch { return { lookup: {}, updatedAt: null }; } })(),
            periods: (() => { try { return JSON.parse(lsGet(PERIODS_KEY) || '{}'); } catch { return {}; } })(),
          };
          await pushToCloudNow(localCombined);
        }
      } else {
        loadFromLocal();
      }
    } finally {
      isLoadingDataRef.current = false;
    }
  };

  run();
}, [session, isAuthReady, loadFromCloud, loadFromLocal, pushToCloudNow]);

const save = async (d) => {
  try {
    writeToLocal(STORAGE_KEY, JSON.stringify(d));
    setShowSaveConfirm(true);
    setTimeout(() => setShowSaveConfirm(false), 2000);
    queueCloudSave({ ...combinedData, sales: d });
  } catch {}
};

const saveInv = async (d) => {
  try {
    writeToLocal(INVENTORY_KEY, JSON.stringify(d));
    setShowSaveConfirm(true);
    setTimeout(() => setShowSaveConfirm(false), 2000);
    queueCloudSave({ ...combinedData, inventory: d });
  } catch {}
};

const saveCogs = async (lookup) => {
  try {
    const updatedAt = new Date().toISOString();
    writeToLocal(COGS_KEY, JSON.stringify({ lookup, updatedAt }));
    setSavedCogs(lookup);
    setCogsLastUpdated(updatedAt);
    setShowSaveConfirm(true);
    setTimeout(() => setShowSaveConfirm(false), 2000);
    queueCloudSave({ ...combinedData, cogs: { lookup, updatedAt } });
  } catch {}
};

const savePeriods = async (d) => {
  try {
    writeToLocal(PERIODS_KEY, JSON.stringify(d));
    setShowSaveConfirm(true);
    setTimeout(() => setShowSaveConfirm(false), 2000);
    queueCloudSave({ ...combinedData, periods: d });
  } catch {}
};


  const handleFile = useCallback((type, file, isInv = false) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = parseCSV(e.target.result);
      if (isInv) { setInvFiles(p => ({ ...p, [type]: data })); setInvFileNames(p => ({ ...p, [type]: file.name })); }
      else { setFiles(p => ({ ...p, [type]: data })); setFileNames(p => ({ ...p, [type]: file.name })); }
    };
    reader.readAsText(file);
  }, []);

  const handlePeriodFile = useCallback((type, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = parseCSV(e.target.result);
      setPeriodFiles(p => ({ ...p, [type]: data }));
      setPeriodFileNames(p => ({ ...p, [type]: file.name }));
    };
    reader.readAsText(file);
  }, []);

  const handleReprocessFile = useCallback((type, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = parseCSV(e.target.result);
      setReprocessFiles(p => ({ ...p, [type]: data }));
      setReprocessFileNames(p => ({ ...p, [type]: file.name }));
    };
    reader.readAsText(file);
  }, []);

  const reprocessWeek = useCallback((weekKey) => {
    const cogsLookup = { ...savedCogs };
    if (!reprocessFiles.amazon || !reprocessFiles.shopify) { alert('Upload Amazon & Shopify files'); return; }
    if (Object.keys(cogsLookup).length === 0) { alert('Set up COGS first'); return; }

    let amzRev = 0, amzUnits = 0, amzRet = 0, amzProfit = 0, amzCogs = 0, amzFees = 0, amzAds = 0;
    const amazonSkuData = {};
    reprocessFiles.amazon.forEach(r => {
      const net = parseInt(r['Net units sold'] || 0), sold = parseInt(r['Units sold'] || 0), ret = parseInt(r['Units returned'] || 0);
      const sales = parseFloat(r['Net sales'] || 0), proceeds = parseFloat(r['Net proceeds total'] || 0), sku = r['MSKU'] || '';
      const fees = parseFloat(r['FBA fulfillment fees total'] || 0) + parseFloat(r['Referral fee total'] || 0) + parseFloat(r['AWD Storage Fee total'] || 0);
      const ads = parseFloat(r['Sponsored Products charge total'] || 0);
      const name = r['Product title'] || r['product-name'] || sku;
      if (net > 0 || sold > 0) { 
        amzRev += sales; amzUnits += sold; amzRet += ret; amzProfit += proceeds; amzFees += fees; amzAds += ads; amzCogs += (cogsLookup[sku] || 0) * net;
        if (sku) {
          if (!amazonSkuData[sku]) amazonSkuData[sku] = { sku, name, unitsSold: 0, returns: 0, netSales: 0, netProceeds: 0, adSpend: 0, cogs: 0 };
          amazonSkuData[sku].unitsSold += sold;
          amazonSkuData[sku].returns += ret;
          amazonSkuData[sku].netSales += sales;
          amazonSkuData[sku].netProceeds += proceeds;
          amazonSkuData[sku].adSpend += ads;
          amazonSkuData[sku].cogs += (cogsLookup[sku] || 0) * net;
        }
      }
    });

    let shopRev = 0, shopUnits = 0, shopCogs = 0, shopDisc = 0;
    const shopifySkuData = {};
    reprocessFiles.shopify.forEach(r => {
      const units = parseInt(r['Net items sold'] || 0), sales = parseFloat(r['Net sales'] || 0), sku = r['Product variant SKU'] || '';
      const name = r['Product title'] || r['Product'] || sku;
      const disc = Math.abs(parseFloat(r['Discounts'] || 0));
      shopRev += sales; shopUnits += units; shopCogs += (cogsLookup[sku] || 0) * units; shopDisc += disc;
      if (sku && units > 0) {
        if (!shopifySkuData[sku]) shopifySkuData[sku] = { sku, name, unitsSold: 0, netSales: 0, discounts: 0, cogs: 0 };
        shopifySkuData[sku].unitsSold += units;
        shopifySkuData[sku].netSales += sales;
        shopifySkuData[sku].discounts += disc;
        shopifySkuData[sku].cogs += (cogsLookup[sku] || 0) * units;
      }
    });

    let threeplCost = 0;
    if (reprocessFiles.threepl) reprocessFiles.threepl.forEach(r => { threeplCost += parseFloat(r['Amount Total ($)'] || 0); });

    const metaS = parseFloat(reprocessAdSpend.meta) || 0, googleS = parseFloat(reprocessAdSpend.google) || 0, shopAds = metaS + googleS;
    const shopProfit = shopRev - shopCogs - threeplCost - shopAds;
    const totalRev = amzRev + shopRev, totalProfit = amzProfit + shopProfit, totalCogs = amzCogs + shopCogs;

    const amazonSkus = Object.values(amazonSkuData).sort((a, b) => b.netSales - a.netSales);
    const shopifySkus = Object.values(shopifySkuData).sort((a, b) => b.netSales - a.netSales);

    const weekData = {
      weekEnding: weekKey, createdAt: new Date().toISOString(),
      amazon: { revenue: amzRev, units: amzUnits, returns: amzRet, cogs: amzCogs, fees: amzFees, adSpend: amzAds, netProfit: amzProfit, 
        margin: amzRev > 0 ? (amzProfit/amzRev)*100 : 0, aov: amzUnits > 0 ? amzRev/amzUnits : 0, roas: amzAds > 0 ? amzRev/amzAds : 0,
        returnRate: amzUnits > 0 ? (amzRet/amzUnits)*100 : 0, skuData: amazonSkus },
      shopify: { revenue: shopRev, units: shopUnits, cogs: shopCogs, threeplCosts: threeplCost, adSpend: shopAds, metaSpend: metaS, googleSpend: googleS, discounts: shopDisc, netProfit: shopProfit, 
        netMargin: shopRev > 0 ? (shopProfit/shopRev)*100 : 0, aov: shopUnits > 0 ? shopRev/shopUnits : 0, roas: shopAds > 0 ? shopRev/shopAds : 0, skuData: shopifySkus },
      total: { revenue: totalRev, units: amzUnits + shopUnits, cogs: totalCogs, adSpend: amzAds + shopAds, netProfit: totalProfit, netMargin: totalRev > 0 ? (totalProfit/totalRev)*100 : 0, roas: (amzAds + shopAds) > 0 ? totalRev/(amzAds + shopAds) : 0, amazonShare: totalRev > 0 ? (amzRev/totalRev)*100 : 0, shopifyShare: totalRev > 0 ? (shopRev/totalRev)*100 : 0 }
    };

    const updated = { ...allWeeksData, [weekKey]: weekData };
    setAllWeeksData(updated); save(updated);
    setShowReprocess(false);
    setReprocessFiles({ amazon: null, shopify: null, threepl: null });
    setReprocessFileNames({ amazon: '', shopify: '', threepl: '' });
    setReprocessAdSpend({ meta: '', google: '' });
  }, [reprocessFiles, reprocessAdSpend, allWeeksData, savedCogs]);

  const getCogsLookup = useCallback(() => {
    const lookup = { ...savedCogs };
    if (files.cogs) files.cogs.forEach(r => { const s = r['SKU'] || r['sku']; const c = parseFloat(r['Cost Per Unit'] || 0); if (s && c) lookup[s] = c; });
    return lookup;
  }, [savedCogs, files.cogs]);

  const processAndSaveCogs = useCallback(() => {
    if (!files.cogs) return;
    const lookup = {};
    files.cogs.forEach(r => { const s = r['SKU'] || r['sku']; const c = parseFloat(r['Cost Per Unit'] || 0); if (s) lookup[s] = c; });
    saveCogs(lookup);
    setFiles(p => ({ ...p, cogs: null })); setFileNames(p => ({ ...p, cogs: '' })); setShowCogsManager(false);
  }, [files.cogs]);

  const processSales = useCallback(() => {
    const cogsLookup = getCogsLookup();
    if (!files.amazon || !files.shopify || !weekEnding) { alert('Upload Amazon & Shopify files and select date'); return; }
    if (Object.keys(cogsLookup).length === 0) { alert('Set up COGS first via the COGS button'); return; }
    setIsProcessing(true);

    let amzRev = 0, amzUnits = 0, amzRet = 0, amzProfit = 0, amzCogs = 0, amzFees = 0, amzAds = 0;
    const amazonSkuData = {};
    files.amazon.forEach(r => {
      const net = parseInt(r['Net units sold'] || 0), sold = parseInt(r['Units sold'] || 0), ret = parseInt(r['Units returned'] || 0);
      const sales = parseFloat(r['Net sales'] || 0), proceeds = parseFloat(r['Net proceeds total'] || 0), sku = r['MSKU'] || '';
      const fees = parseFloat(r['FBA fulfillment fees total'] || 0) + parseFloat(r['Referral fee total'] || 0) + parseFloat(r['AWD Storage Fee total'] || 0);
      const ads = parseFloat(r['Sponsored Products charge total'] || 0);
      const name = r['Product title'] || r['product-name'] || sku;
      if (net > 0 || sold > 0) { 
        amzRev += sales; amzUnits += sold; amzRet += ret; amzProfit += proceeds; amzFees += fees; amzAds += ads; amzCogs += (cogsLookup[sku] || 0) * net;
        if (sku) {
          if (!amazonSkuData[sku]) amazonSkuData[sku] = { sku, name, unitsSold: 0, returns: 0, netSales: 0, netProceeds: 0, adSpend: 0, cogs: 0 };
          amazonSkuData[sku].unitsSold += sold;
          amazonSkuData[sku].returns += ret;
          amazonSkuData[sku].netSales += sales;
          amazonSkuData[sku].netProceeds += proceeds;
          amazonSkuData[sku].adSpend += ads;
          amazonSkuData[sku].cogs += (cogsLookup[sku] || 0) * net;
        }
      }
    });

    let shopRev = 0, shopUnits = 0, shopCogs = 0, shopDisc = 0;
    const shopifySkuData = {};
    files.shopify.forEach(r => {
      const units = parseInt(r['Net items sold'] || 0), sales = parseFloat(r['Net sales'] || 0), sku = r['Product variant SKU'] || '';
      const name = r['Product title'] || r['Product'] || sku;
      const disc = Math.abs(parseFloat(r['Discounts'] || 0));
      shopRev += sales; shopUnits += units; shopCogs += (cogsLookup[sku] || 0) * units; shopDisc += disc;
      if (sku && units > 0) {
        if (!shopifySkuData[sku]) shopifySkuData[sku] = { sku, name, unitsSold: 0, netSales: 0, discounts: 0, cogs: 0 };
        shopifySkuData[sku].unitsSold += units;
        shopifySkuData[sku].netSales += sales;
        shopifySkuData[sku].discounts += disc;
        shopifySkuData[sku].cogs += (cogsLookup[sku] || 0) * units;
      }
    });

    let threeplCost = 0;
    if (files.threepl) files.threepl.forEach(r => { threeplCost += parseFloat(r['Amount Total ($)'] || 0); });

    const metaS = parseFloat(adSpend.meta) || 0, googleS = parseFloat(adSpend.google) || 0, shopAds = metaS + googleS;
    const shopProfit = shopRev - shopCogs - threeplCost - shopAds;
    const totalRev = amzRev + shopRev, totalProfit = amzProfit + shopProfit, totalCogs = amzCogs + shopCogs;

    // Convert SKU data to sorted arrays
    const amazonSkus = Object.values(amazonSkuData).sort((a, b) => b.netSales - a.netSales);
    const shopifySkus = Object.values(shopifySkuData).sort((a, b) => b.netSales - a.netSales);

    const weekData = {
      weekEnding, createdAt: new Date().toISOString(),
      amazon: { revenue: amzRev, units: amzUnits, returns: amzRet, cogs: amzCogs, fees: amzFees, adSpend: amzAds, netProfit: amzProfit, 
        margin: amzRev > 0 ? (amzProfit/amzRev)*100 : 0, aov: amzUnits > 0 ? amzRev/amzUnits : 0, roas: amzAds > 0 ? amzRev/amzAds : 0,
        returnRate: amzUnits > 0 ? (amzRet/amzUnits)*100 : 0, skuData: amazonSkus },
      shopify: { revenue: shopRev, units: shopUnits, cogs: shopCogs, threeplCosts: threeplCost, adSpend: shopAds, metaSpend: metaS, googleSpend: googleS, discounts: shopDisc, netProfit: shopProfit, 
        netMargin: shopRev > 0 ? (shopProfit/shopRev)*100 : 0, aov: shopUnits > 0 ? shopRev/shopUnits : 0, roas: shopAds > 0 ? shopRev/shopAds : 0, skuData: shopifySkus },
      total: { revenue: totalRev, units: amzUnits + shopUnits, cogs: totalCogs, adSpend: amzAds + shopAds, netProfit: totalProfit, netMargin: totalRev > 0 ? (totalProfit/totalRev)*100 : 0, roas: (amzAds + shopAds) > 0 ? totalRev/(amzAds + shopAds) : 0, amazonShare: totalRev > 0 ? (amzRev/totalRev)*100 : 0, shopifyShare: totalRev > 0 ? (shopRev/totalRev)*100 : 0 }
    };

    const updated = { ...allWeeksData, [weekEnding]: weekData };
    setAllWeeksData(updated); save(updated); setSelectedWeek(weekEnding); setView('weekly'); setIsProcessing(false);
    setFiles({ amazon: null, shopify: null, cogs: null, threepl: null }); setFileNames({ amazon: '', shopify: '', cogs: '', threepl: '' }); setAdSpend({ meta: '', google: '' }); setWeekEnding('');
  }, [files, adSpend, weekEnding, allWeeksData, getCogsLookup]);

  const processBulkImport = useCallback(() => {
    const cogsLookup = getCogsLookup();
    if (!files.amazon || !files.shopify) { alert('Upload Amazon & Shopify files'); return; }
    if (Object.keys(cogsLookup).length === 0) { alert('Set up COGS first'); return; }
    setIsProcessing(true); setBulkImportResult(null);

    const amazonByWeek = {};
    files.amazon.forEach(row => {
      const endDate = row['End date'] || '';
      if (!endDate) return;
      let dateObj;
      if (endDate.includes('/')) { const [m, d, y] = endDate.split('/'); dateObj = new Date(y, m - 1, d); }
      else { dateObj = new Date(endDate); }
      const sunday = getSunday(dateObj);
      if (!amazonByWeek[sunday]) amazonByWeek[sunday] = [];
      amazonByWeek[sunday].push(row);
    });

    const amazonWeeks = Object.keys(amazonByWeek).sort();
    const newWeeksData = { ...allWeeksData };
    let weeksCreated = 0;

    amazonWeeks.forEach(weekEnd => {
      const rows = amazonByWeek[weekEnd];
      let amzRev = 0, amzUnits = 0, amzRet = 0, amzProfit = 0, amzCogs = 0, amzFees = 0, amzAds = 0;
      const amazonSkuData = {};
      rows.forEach(r => {
        const net = parseInt(r['Net units sold'] || 0), sold = parseInt(r['Units sold'] || 0), ret = parseInt(r['Units returned'] || 0);
        const sales = parseFloat(r['Net sales'] || 0), proceeds = parseFloat(r['Net proceeds total'] || 0), sku = r['MSKU'] || '';
        const fees = parseFloat(r['FBA fulfillment fees total'] || 0) + parseFloat(r['Referral fee total'] || 0) + parseFloat(r['AWD Storage Fee total'] || 0);
        const ads = parseFloat(r['Sponsored Products charge total'] || 0);
        const name = r['Product title'] || r['product-name'] || sku;
        if (net > 0 || sold > 0) { 
          amzRev += sales; amzUnits += sold; amzRet += ret; amzProfit += proceeds; amzFees += fees; amzAds += ads; amzCogs += (cogsLookup[sku] || 0) * net;
          if (sku) {
            if (!amazonSkuData[sku]) amazonSkuData[sku] = { sku, name, unitsSold: 0, returns: 0, netSales: 0, netProceeds: 0, adSpend: 0, cogs: 0 };
            amazonSkuData[sku].unitsSold += sold;
            amazonSkuData[sku].returns += ret;
            amazonSkuData[sku].netSales += sales;
            amazonSkuData[sku].netProceeds += proceeds;
            amazonSkuData[sku].adSpend += ads;
            amazonSkuData[sku].cogs += (cogsLookup[sku] || 0) * net;
          }
        }
      });
      const amazonSkus = Object.values(amazonSkuData).sort((a, b) => b.netSales - a.netSales);
      if (amzRev > 0 || amzUnits > 0) {
        newWeeksData[weekEnd] = {
          weekEnding: weekEnd, createdAt: new Date().toISOString(),
          amazon: { revenue: amzRev, units: amzUnits, returns: amzRet, cogs: amzCogs, fees: amzFees, adSpend: amzAds, netProfit: amzProfit, 
            margin: amzRev > 0 ? (amzProfit/amzRev)*100 : 0, aov: amzUnits > 0 ? amzRev/amzUnits : 0, roas: amzAds > 0 ? amzRev/amzAds : 0,
            returnRate: amzUnits > 0 ? (amzRet/amzUnits)*100 : 0, skuData: amazonSkus },
          shopify: { revenue: 0, units: 0, cogs: 0, threeplCosts: 0, adSpend: 0, metaSpend: 0, googleSpend: 0, discounts: 0, netProfit: 0, netMargin: 0, aov: 0, roas: 0, skuData: [] },
          total: { revenue: amzRev, units: amzUnits, cogs: amzCogs, adSpend: amzAds, netProfit: amzProfit, netMargin: amzRev > 0 ? (amzProfit/amzRev)*100 : 0, roas: amzAds > 0 ? amzRev/amzAds : 0, amazonShare: 100, shopifyShare: 0 }
        };
        weeksCreated++;
      }
    });

    // Distribute Shopify - also capture SKU data
    let shopRev = 0, shopUnits = 0, shopCogs = 0, shopDisc = 0;
    const shopifySkuData = {};
    files.shopify.forEach(r => { 
      const u = parseInt(r['Net items sold'] || 0), s = parseFloat(r['Net sales'] || 0), sku = r['Product variant SKU'] || ''; 
      const name = r['Product title'] || r['Product'] || sku;
      const disc = Math.abs(parseFloat(r['Discounts'] || 0));
      shopRev += s; shopUnits += u; shopCogs += (cogsLookup[sku] || 0) * u; shopDisc += disc;
      if (sku && u > 0) {
        if (!shopifySkuData[sku]) shopifySkuData[sku] = { sku, name, unitsSold: 0, netSales: 0, discounts: 0, cogs: 0 };
        shopifySkuData[sku].unitsSold += u;
        shopifySkuData[sku].netSales += s;
        shopifySkuData[sku].discounts += disc;
        shopifySkuData[sku].cogs += (cogsLookup[sku] || 0) * u;
      }
    });
    const shopifySkus = Object.values(shopifySkuData).sort((a, b) => b.netSales - a.netSales);
    const totalAmzRev = Object.values(newWeeksData).reduce((sum, w) => sum + (w.amazon?.revenue || 0), 0);
    if (totalAmzRev > 0 && shopRev > 0) {
      Object.keys(newWeeksData).forEach(weekEnd => {
        const week = newWeeksData[weekEnd];
        const prop = week.amazon.revenue / totalAmzRev;
        const wRev = shopRev * prop, wUnits = Math.round(shopUnits * prop), wCogs = shopCogs * prop, wDisc = shopDisc * prop, wProfit = wRev - wCogs;
        // Proportionally distribute SKU data
        const wShopifySkus = shopifySkus.map(s => ({ ...s, unitsSold: Math.round(s.unitsSold * prop), netSales: s.netSales * prop, discounts: s.discounts * prop, cogs: s.cogs * prop }));
        week.shopify = { revenue: wRev, units: wUnits, cogs: wCogs, threeplCosts: 0, adSpend: 0, metaSpend: 0, googleSpend: 0, discounts: wDisc, netProfit: wProfit, netMargin: wRev > 0 ? (wProfit/wRev)*100 : 0, aov: wUnits > 0 ? wRev/wUnits : 0, roas: 0, skuData: wShopifySkus };
        const tRev = week.amazon.revenue + wRev, tProfit = week.amazon.netProfit + wProfit;
        week.total = { revenue: tRev, units: week.amazon.units + wUnits, cogs: week.amazon.cogs + wCogs, adSpend: week.amazon.adSpend, netProfit: tProfit, netMargin: tRev > 0 ? (tProfit/tRev)*100 : 0, roas: week.amazon.adSpend > 0 ? tRev/week.amazon.adSpend : 0, amazonShare: tRev > 0 ? (week.amazon.revenue/tRev)*100 : 0, shopifyShare: tRev > 0 ? (wRev/tRev)*100 : 0 };
      });
    }

    setAllWeeksData(newWeeksData); save(newWeeksData);
    setBulkImportResult({ weeksCreated, dateRange: amazonWeeks.length > 0 ? `${amazonWeeks[0]} to ${amazonWeeks[amazonWeeks.length-1]}` : '' });
    setIsProcessing(false); setFiles({ amazon: null, shopify: null, cogs: null, threepl: null }); setFileNames({ amazon: '', shopify: '', cogs: '', threepl: '' });
  }, [files, allWeeksData, getCogsLookup]);

  const processCustomPeriod = useCallback(() => {
    if (!customStartDate || !customEndDate) { alert('Select dates'); return; }
    const start = new Date(customStartDate + 'T00:00:00'), end = new Date(customEndDate + 'T00:00:00');
    const weeksInRange = Object.entries(allWeeksData).filter(([w]) => { const d = new Date(w + 'T00:00:00'); return d >= start && d <= end; });
    if (!weeksInRange.length) { alert('No data in range'); return; }

    const agg = { startDate: customStartDate, endDate: customEndDate, weeksIncluded: weeksInRange.length,
      amazon: { revenue: 0, units: 0, cogs: 0, adSpend: 0, netProfit: 0 }, shopify: { revenue: 0, units: 0, cogs: 0, adSpend: 0, netProfit: 0 },
      total: { revenue: 0, units: 0, cogs: 0, adSpend: 0, netProfit: 0 }, weeklyBreakdown: [] };

    weeksInRange.forEach(([w, d]) => {
      agg.amazon.revenue += d.amazon?.revenue || 0; agg.amazon.units += d.amazon?.units || 0; agg.amazon.cogs += d.amazon?.cogs || 0; agg.amazon.adSpend += d.amazon?.adSpend || 0; agg.amazon.netProfit += d.amazon?.netProfit || 0;
      agg.shopify.revenue += d.shopify?.revenue || 0; agg.shopify.units += d.shopify?.units || 0; agg.shopify.cogs += d.shopify?.cogs || 0; agg.shopify.adSpend += d.shopify?.adSpend || 0; agg.shopify.netProfit += d.shopify?.netProfit || 0;
      agg.total.revenue += d.total?.revenue || 0; agg.total.units += d.total?.units || 0; agg.total.cogs += d.total?.cogs || 0; agg.total.adSpend += d.total?.adSpend || 0; agg.total.netProfit += d.total?.netProfit || 0;
      agg.weeklyBreakdown.push({ week: w, revenue: d.total?.revenue || 0, profit: d.total?.netProfit || 0 });
    });

    agg.amazon.margin = agg.amazon.revenue > 0 ? (agg.amazon.netProfit / agg.amazon.revenue) * 100 : 0;
    agg.shopify.netMargin = agg.shopify.revenue > 0 ? (agg.shopify.netProfit / agg.shopify.revenue) * 100 : 0;
    agg.total.netMargin = agg.total.revenue > 0 ? (agg.total.netProfit / agg.total.revenue) * 100 : 0;
    agg.total.amazonShare = agg.total.revenue > 0 ? (agg.amazon.revenue / agg.total.revenue) * 100 : 0;
    agg.total.shopifyShare = agg.total.revenue > 0 ? (agg.shopify.revenue / agg.total.revenue) * 100 : 0;
    agg.avgWeeklyRevenue = agg.total.revenue / weeksInRange.length;
    agg.avgWeeklyProfit = agg.total.netProfit / weeksInRange.length;

    setCustomPeriodData(agg); setView('custom');
  }, [customStartDate, customEndDate, allWeeksData]);

  // Process a period (month/year) without weekly breakdown
  const processPeriod = useCallback(() => {
    const cogsLookup = { ...savedCogs };
    if (!periodFiles.amazon || !periodFiles.shopify || !periodLabel.trim()) { alert('Upload Amazon & Shopify files and enter a label (e.g., "January 2025")'); return; }
    if (Object.keys(cogsLookup).length === 0) { alert('Set up COGS first via the COGS button'); return; }
    setIsProcessing(true);

    let amzRev = 0, amzUnits = 0, amzRet = 0, amzProfit = 0, amzCogs = 0, amzFees = 0, amzAds = 0;
    const amazonSkuData = {};
    periodFiles.amazon.forEach(r => {
      const net = parseInt(r['Net units sold'] || 0), sold = parseInt(r['Units sold'] || 0), ret = parseInt(r['Units returned'] || 0);
      const sales = parseFloat(r['Net sales'] || 0), proceeds = parseFloat(r['Net proceeds total'] || 0), sku = r['MSKU'] || '';
      const fees = parseFloat(r['FBA fulfillment fees total'] || 0) + parseFloat(r['Referral fee total'] || 0) + parseFloat(r['AWD Storage Fee total'] || 0);
      const ads = parseFloat(r['Sponsored Products charge total'] || 0);
      const name = r['Product title'] || r['product-name'] || sku;
      if (net > 0 || sold > 0) { 
        amzRev += sales; amzUnits += sold; amzRet += ret; amzProfit += proceeds; amzFees += fees; amzAds += ads; amzCogs += (cogsLookup[sku] || 0) * net;
        if (sku) {
          if (!amazonSkuData[sku]) amazonSkuData[sku] = { sku, name, unitsSold: 0, returns: 0, netSales: 0, netProceeds: 0, adSpend: 0, cogs: 0 };
          amazonSkuData[sku].unitsSold += sold;
          amazonSkuData[sku].returns += ret;
          amazonSkuData[sku].netSales += sales;
          amazonSkuData[sku].netProceeds += proceeds;
          amazonSkuData[sku].adSpend += ads;
          amazonSkuData[sku].cogs += (cogsLookup[sku] || 0) * net;
        }
      }
    });

    let shopRev = 0, shopUnits = 0, shopCogs = 0, shopDisc = 0;
    const shopifySkuData = {};
    periodFiles.shopify.forEach(r => {
      const units = parseInt(r['Net items sold'] || 0), sales = parseFloat(r['Net sales'] || 0), sku = r['Product variant SKU'] || '';
      const name = r['Product title'] || r['Product'] || sku;
      const disc = Math.abs(parseFloat(r['Discounts'] || 0));
      shopRev += sales; shopUnits += units; shopCogs += (cogsLookup[sku] || 0) * units; shopDisc += disc;
      if (sku && units > 0) {
        if (!shopifySkuData[sku]) shopifySkuData[sku] = { sku, name, unitsSold: 0, netSales: 0, discounts: 0, cogs: 0 };
        shopifySkuData[sku].unitsSold += units;
        shopifySkuData[sku].netSales += sales;
        shopifySkuData[sku].discounts += disc;
        shopifySkuData[sku].cogs += (cogsLookup[sku] || 0) * units;
      }
    });

    let threeplCost = 0;
    if (periodFiles.threepl) periodFiles.threepl.forEach(r => { threeplCost += parseFloat(r['Amount Total ($)'] || 0); });

    const metaS = parseFloat(periodAdSpend.meta) || 0, googleS = parseFloat(periodAdSpend.google) || 0, shopAds = metaS + googleS;
    const shopProfit = shopRev - shopCogs - threeplCost - shopAds;
    const totalRev = amzRev + shopRev, totalProfit = amzProfit + shopProfit, totalCogs = amzCogs + shopCogs;

    const amazonSkus = Object.values(amazonSkuData).sort((a, b) => b.netSales - a.netSales);
    const shopifySkus = Object.values(shopifySkuData).sort((a, b) => b.netSales - a.netSales);

    const periodData = {
      label: periodLabel.trim(), createdAt: new Date().toISOString(),
      amazon: { revenue: amzRev, units: amzUnits, returns: amzRet, cogs: amzCogs, fees: amzFees, adSpend: amzAds, netProfit: amzProfit, 
        margin: amzRev > 0 ? (amzProfit/amzRev)*100 : 0, aov: amzUnits > 0 ? amzRev/amzUnits : 0, roas: amzAds > 0 ? amzRev/amzAds : 0,
        returnRate: amzUnits > 0 ? (amzRet/amzUnits)*100 : 0, skuData: amazonSkus },
      shopify: { revenue: shopRev, units: shopUnits, cogs: shopCogs, threeplCosts: threeplCost, adSpend: shopAds, metaSpend: metaS, googleSpend: googleS, discounts: shopDisc, netProfit: shopProfit, 
        netMargin: shopRev > 0 ? (shopProfit/shopRev)*100 : 0, aov: shopUnits > 0 ? shopRev/shopUnits : 0, roas: shopAds > 0 ? shopRev/shopAds : 0, skuData: shopifySkus },
      total: { revenue: totalRev, units: amzUnits + shopUnits, cogs: totalCogs, adSpend: amzAds + shopAds, netProfit: totalProfit, netMargin: totalRev > 0 ? (totalProfit/totalRev)*100 : 0, roas: (amzAds + shopAds) > 0 ? totalRev/(amzAds + shopAds) : 0, amazonShare: totalRev > 0 ? (amzRev/totalRev)*100 : 0, shopifyShare: totalRev > 0 ? (shopRev/totalRev)*100 : 0 }
    };

    const periodKey = periodLabel.trim().toLowerCase().replace(/\s+/g, '-');
    const updated = { ...allPeriodsData, [periodKey]: periodData };
    setAllPeriodsData(updated); savePeriods(updated); setSelectedPeriod(periodKey); setView('period-view'); setIsProcessing(false);
    setPeriodFiles({ amazon: null, shopify: null, threepl: null }); setPeriodFileNames({ amazon: '', shopify: '', threepl: '' }); setPeriodAdSpend({ meta: '', google: '' }); setPeriodLabel('');
  }, [periodFiles, periodAdSpend, periodLabel, allPeriodsData, savedCogs]);

  const deletePeriod = (k) => { if (!confirm(`Delete ${k}?`)) return; const u = { ...allPeriodsData }; delete u[k]; setAllPeriodsData(u); savePeriods(u); const r = Object.keys(u).sort().reverse(); if (r.length) setSelectedPeriod(r[0]); else { setView('period-upload'); setSelectedPeriod(null); }};

  const processInventory = useCallback(() => {
    if (!invFiles.amazon || !invFiles.threepl || !invSnapshotDate) { alert('Upload files and select date'); return; }
    setIsProcessing(true);

    const cogsLookup = { ...savedCogs };
    if (invFiles.cogs) invFiles.cogs.forEach(r => { const s = r['SKU'] || r['sku']; if (s) cogsLookup[s] = parseFloat(r['Cost Per Unit'] || 0); });
    invFiles.threepl.forEach(r => { const s = r['sku']; const c = parseFloat(r['cost'] || 0); if (s && c && !cogsLookup[s]) cogsLookup[s] = c; });

    // Build Shopify velocity from actual SKU sales data
    const sortedWeeks = Object.keys(allWeeksData).sort().reverse().slice(0, 4);
    const weeksCount = sortedWeeks.length;
    const shopifySkuVelocity = {}; // sku -> weekly units
    
    if (weeksCount > 0) {
      // Aggregate Shopify SKU sales from recent weeks
      sortedWeeks.forEach(w => {
        const weekData = allWeeksData[w];
        if (weekData.shopify?.skuData) {
          weekData.shopify.skuData.forEach(item => {
            if (!shopifySkuVelocity[item.sku]) shopifySkuVelocity[item.sku] = 0;
            shopifySkuVelocity[item.sku] += item.unitsSold || 0;
          });
        }
      });
      // Convert totals to weekly averages
      Object.keys(shopifySkuVelocity).forEach(sku => {
        shopifySkuVelocity[sku] = shopifySkuVelocity[sku] / weeksCount;
      });
    }

    const amzInv = {}, tplInv = {};
    let amzTotal = 0, amzValue = 0, amzInbound = 0, tplTotal = 0, tplValue = 0, tplInbound = 0;

    invFiles.amazon.forEach(r => {
      const sku = r['sku'] || '', avail = parseInt(r['available'] || 0), inb = parseInt(r['inbound-quantity'] || 0);
      const res = parseInt(r['Total Reserved Quantity'] || 0), t30 = parseInt(r['units-shipped-t30'] || 0);
      const name = r['product-name'] || '', asin = r['asin'] || '';
      const cost = cogsLookup[sku] || 0, total = avail + res;
      amzTotal += total; amzValue += total * cost; amzInbound += inb;
      if (sku) amzInv[sku] = { sku, asin, name, total, inbound: inb, cost, amzWeeklyVel: t30 / 4.3 };
    });

    invFiles.threepl.forEach(r => {
      const sku = r['sku'] || '', name = r['name'] || '', qty = parseInt(r['quantity_on_hand'] || 0);
      const inb = parseInt(r['quantity_inbound'] || 0), cost = parseFloat(r['cost'] || 0) || cogsLookup[sku] || 0;
      if (sku.includes('Bundle') || name.includes('Gift Card') || name.includes('FREE') || qty === 0) return;
      tplTotal += qty; tplValue += qty * cost; tplInbound += inb;
      if (sku) tplInv[sku] = { sku, name, total: qty, inbound: inb, cost };
    });

    const allSkus = new Set([...Object.keys(amzInv), ...Object.keys(tplInv)]);
    const items = [];
    let critical = 0, low = 0, healthy = 0, overstock = 0;
    let hasShopifySkuData = Object.keys(shopifySkuVelocity).length > 0;

    allSkus.forEach(sku => {
      const a = amzInv[sku] || {}, t = tplInv[sku] || {};
      const aQty = a.total || 0, tQty = t.total || 0, totalQty = aQty + tQty;
      const cost = a.cost || t.cost || cogsLookup[sku] || 0;
      const amzVel = a.amzWeeklyVel || 0;
      const shopVel = shopifySkuVelocity[sku] || 0;
      const totalVel = amzVel + shopVel;
      const dos = totalVel > 0 ? Math.round((totalQty / totalVel) * 7) : 999;
      let health = 'unknown';
      if (totalVel > 0) {
        if (dos < 14) { health = 'critical'; critical++; }
        else if (dos < 30) { health = 'low'; low++; }
        else if (dos <= 90) { health = 'healthy'; healthy++; }
        else { health = 'overstock'; overstock++; }
      }
      items.push({ sku, name: a.name || t.name || sku, asin: a.asin || '', amazonQty: aQty, threeplQty: tQty, totalQty, cost, totalValue: totalQty * cost, weeklyVel: totalVel, amzWeeklyVel: amzVel, shopWeeklyVel: shopVel, daysOfSupply: dos, health, amazonInbound: a.inbound || 0, threeplInbound: t.inbound || 0 });
    });
    items.sort((a, b) => b.totalValue - a.totalValue);

    const velNote = hasShopifySkuData 
      ? `Amazon + Shopify SKU data (${weeksCount}wk avg)` 
      : weeksCount > 0 
        ? `Amazon only (no Shopify SKU data - re-process weeks to add)` 
        : 'Amazon only';
    const snapshot = {
      date: invSnapshotDate, createdAt: new Date().toISOString(), velocitySource: velNote,
      summary: { totalUnits: amzTotal + tplTotal, totalValue: amzValue + tplValue, amazonUnits: amzTotal, amazonValue: amzValue, amazonInbound: amzInbound, threeplUnits: tplTotal, threeplValue: tplValue, threeplInbound: tplInbound, critical, low, healthy, overstock, skuCount: items.length },
      items
    };

    const updated = { ...invHistory, [invSnapshotDate]: snapshot };
    setInvHistory(updated); saveInv(updated); setSelectedInvDate(invSnapshotDate); setView('inventory'); setIsProcessing(false);
    setInvFiles({ amazon: null, threepl: null, cogs: null }); setInvFileNames({ amazon: '', threepl: '', cogs: '' }); setInvSnapshotDate('');
  }, [invFiles, invSnapshotDate, invHistory, savedCogs, allWeeksData]);

  const deleteWeek = (k) => { if (!confirm(`Delete ${k}?`)) return; const u = { ...allWeeksData }; delete u[k]; setAllWeeksData(u); save(u); const r = Object.keys(u).sort().reverse(); if (r.length) setSelectedWeek(r[0]); else { setView('upload'); setSelectedWeek(null); }};
  const deleteInv = (k) => { if (!confirm(`Delete ${k}?`)) return; const u = { ...invHistory }; delete u[k]; setInvHistory(u); saveInv(u); const r = Object.keys(u).sort().reverse(); if (r.length) setSelectedInvDate(r[0]); else setSelectedInvDate(null); };

  const updateWeekAdSpend = useCallback((weekKey, metaSpend, googleSpend) => {
    const week = allWeeksData[weekKey];
    if (!week) return;
    const metaS = parseFloat(metaSpend) || 0, googleS = parseFloat(googleSpend) || 0;
    const totalShopAds = metaS + googleS;
    const oldShopAds = week.shopify.adSpend || 0;
    const shopProfit = week.shopify.netProfit + oldShopAds - totalShopAds; // adjust profit
    const updated = { ...allWeeksData };
    updated[weekKey] = {
      ...week,
      shopify: { ...week.shopify, adSpend: totalShopAds, metaSpend: metaS, googleSpend: googleS, netProfit: shopProfit,
        netMargin: week.shopify.revenue > 0 ? (shopProfit/week.shopify.revenue)*100 : 0,
        roas: totalShopAds > 0 ? week.shopify.revenue/totalShopAds : 0 },
      total: { ...week.total, adSpend: week.amazon.adSpend + totalShopAds, netProfit: week.amazon.netProfit + shopProfit,
        netMargin: week.total.revenue > 0 ? ((week.amazon.netProfit + shopProfit)/week.total.revenue)*100 : 0,
        roas: (week.amazon.adSpend + totalShopAds) > 0 ? week.total.revenue/(week.amazon.adSpend + totalShopAds) : 0 }
    };
    setAllWeeksData(updated); save(updated); setShowEditAdSpend(false);
  }, [allWeeksData]);

  const getMonths = () => { const m = new Set(); Object.keys(allWeeksData).forEach(w => { const d = new Date(w+'T00:00:00'); m.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`); }); return Array.from(m).sort().reverse(); };
  const getYears = () => { const y = new Set(); Object.keys(allWeeksData).forEach(w => { y.add(new Date(w+'T00:00:00').getFullYear()); }); return Array.from(y).sort().reverse(); };

  const getMonthlyData = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    const weeks = Object.entries(allWeeksData).filter(([w]) => { const d = new Date(w+'T00:00:00'); return d.getFullYear() === y && d.getMonth()+1 === m; });
    if (!weeks.length) return null;
    const agg = { weeks: weeks.map(([w]) => w), 
      amazon: { revenue: 0, units: 0, returns: 0, cogs: 0, fees: 0, adSpend: 0, netProfit: 0 }, 
      shopify: { revenue: 0, units: 0, cogs: 0, threeplCosts: 0, adSpend: 0, metaSpend: 0, googleSpend: 0, discounts: 0, netProfit: 0 }, 
      total: { revenue: 0, units: 0, cogs: 0, adSpend: 0, netProfit: 0 }};
    weeks.forEach(([, d]) => {
      agg.amazon.revenue += d.amazon?.revenue || 0; agg.amazon.units += d.amazon?.units || 0; agg.amazon.returns += d.amazon?.returns || 0;
      agg.amazon.cogs += d.amazon?.cogs || 0; agg.amazon.fees += d.amazon?.fees || 0; agg.amazon.adSpend += d.amazon?.adSpend || 0; agg.amazon.netProfit += d.amazon?.netProfit || 0;
      agg.shopify.revenue += d.shopify?.revenue || 0; agg.shopify.units += d.shopify?.units || 0; agg.shopify.cogs += d.shopify?.cogs || 0;
      agg.shopify.threeplCosts += d.shopify?.threeplCosts || 0; agg.shopify.adSpend += d.shopify?.adSpend || 0; 
      agg.shopify.metaSpend += d.shopify?.metaSpend || 0; agg.shopify.googleSpend += d.shopify?.googleSpend || 0;
      agg.shopify.discounts += d.shopify?.discounts || 0; agg.shopify.netProfit += d.shopify?.netProfit || 0;
      agg.total.revenue += d.total?.revenue || 0; agg.total.units += d.total?.units || 0; agg.total.cogs += d.total?.cogs || 0; agg.total.adSpend += d.total?.adSpend || 0; agg.total.netProfit += d.total?.netProfit || 0;
    });
    agg.amazon.margin = agg.amazon.revenue > 0 ? (agg.amazon.netProfit/agg.amazon.revenue)*100 : 0;
    agg.amazon.aov = agg.amazon.units > 0 ? agg.amazon.revenue/agg.amazon.units : 0;
    agg.amazon.roas = agg.amazon.adSpend > 0 ? agg.amazon.revenue/agg.amazon.adSpend : 0;
    agg.amazon.returnRate = agg.amazon.units > 0 ? (agg.amazon.returns/agg.amazon.units)*100 : 0;
    agg.shopify.netMargin = agg.shopify.revenue > 0 ? (agg.shopify.netProfit/agg.shopify.revenue)*100 : 0;
    agg.shopify.aov = agg.shopify.units > 0 ? agg.shopify.revenue/agg.shopify.units : 0;
    agg.shopify.roas = agg.shopify.adSpend > 0 ? agg.shopify.revenue/agg.shopify.adSpend : 0;
    agg.total.netMargin = agg.total.revenue > 0 ? (agg.total.netProfit/agg.total.revenue)*100 : 0;
    agg.total.amazonShare = agg.total.revenue > 0 ? (agg.amazon.revenue/agg.total.revenue)*100 : 0;
    agg.total.shopifyShare = agg.total.revenue > 0 ? (agg.shopify.revenue/agg.total.revenue)*100 : 0;
    return agg;
  };

  const getYearlyData = (year) => {
    const weeks = Object.entries(allWeeksData).filter(([w]) => new Date(w+'T00:00:00').getFullYear() === year);
    if (!weeks.length) return null;
    const agg = { weeks: weeks.map(([w]) => w), 
      amazon: { revenue: 0, units: 0, returns: 0, cogs: 0, fees: 0, adSpend: 0, netProfit: 0 }, 
      shopify: { revenue: 0, units: 0, cogs: 0, threeplCosts: 0, adSpend: 0, metaSpend: 0, googleSpend: 0, discounts: 0, netProfit: 0 }, 
      total: { revenue: 0, units: 0, cogs: 0, adSpend: 0, netProfit: 0 }, monthlyBreakdown: {}};
    weeks.forEach(([w, d]) => {
      const dt = new Date(w+'T00:00:00'); const mk = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
      if (!agg.monthlyBreakdown[mk]) agg.monthlyBreakdown[mk] = { revenue: 0, netProfit: 0 };
      agg.monthlyBreakdown[mk].revenue += d.total?.revenue || 0; agg.monthlyBreakdown[mk].netProfit += d.total?.netProfit || 0;
      agg.amazon.revenue += d.amazon?.revenue || 0; agg.amazon.units += d.amazon?.units || 0; agg.amazon.returns += d.amazon?.returns || 0;
      agg.amazon.cogs += d.amazon?.cogs || 0; agg.amazon.fees += d.amazon?.fees || 0; agg.amazon.adSpend += d.amazon?.adSpend || 0; agg.amazon.netProfit += d.amazon?.netProfit || 0;
      agg.shopify.revenue += d.shopify?.revenue || 0; agg.shopify.units += d.shopify?.units || 0; agg.shopify.cogs += d.shopify?.cogs || 0;
      agg.shopify.threeplCosts += d.shopify?.threeplCosts || 0; agg.shopify.adSpend += d.shopify?.adSpend || 0;
      agg.shopify.metaSpend += d.shopify?.metaSpend || 0; agg.shopify.googleSpend += d.shopify?.googleSpend || 0;
      agg.shopify.discounts += d.shopify?.discounts || 0; agg.shopify.netProfit += d.shopify?.netProfit || 0;
      agg.total.revenue += d.total?.revenue || 0; agg.total.units += d.total?.units || 0; agg.total.cogs += d.total?.cogs || 0; agg.total.adSpend += d.total?.adSpend || 0; agg.total.netProfit += d.total?.netProfit || 0;
    });
    agg.amazon.margin = agg.amazon.revenue > 0 ? (agg.amazon.netProfit/agg.amazon.revenue)*100 : 0;
    agg.amazon.aov = agg.amazon.units > 0 ? agg.amazon.revenue/agg.amazon.units : 0;
    agg.amazon.roas = agg.amazon.adSpend > 0 ? agg.amazon.revenue/agg.amazon.adSpend : 0;
    agg.amazon.returnRate = agg.amazon.units > 0 ? (agg.amazon.returns/agg.amazon.units)*100 : 0;
    agg.shopify.netMargin = agg.shopify.revenue > 0 ? (agg.shopify.netProfit/agg.shopify.revenue)*100 : 0;
    agg.shopify.aov = agg.shopify.units > 0 ? agg.shopify.revenue/agg.shopify.units : 0;
    agg.shopify.roas = agg.shopify.adSpend > 0 ? agg.shopify.revenue/agg.shopify.adSpend : 0;
    agg.total.netMargin = agg.total.revenue > 0 ? (agg.total.netProfit/agg.total.revenue)*100 : 0;
    agg.total.amazonShare = agg.total.revenue > 0 ? (agg.amazon.revenue/agg.total.revenue)*100 : 0;
    agg.total.shopifyShare = agg.total.revenue > 0 ? (agg.shopify.revenue/agg.total.revenue)*100 : 0;
    return agg;
  };

  const exportAll = () => { const blob = new Blob([JSON.stringify({ sales: allWeeksData, inventory: invHistory, cogs: savedCogs, periods: allPeriodsData }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `dashboard_backup_${new Date().toISOString().split('T')[0]}.json`; a.click(); };
  const importData = (file) => { const reader = new FileReader(); reader.onload = async (e) => { try { const d = JSON.parse(e.target.result); if (d.sales) { setAllWeeksData({...allWeeksData, ...d.sales}); await save({...allWeeksData, ...d.sales}); } if (d.inventory) { setInvHistory({...invHistory, ...d.inventory}); await saveInv({...invHistory, ...d.inventory}); } if (d.cogs) { setSavedCogs(d.cogs); await saveCogs(d.cogs); } if (d.periods) { setAllPeriodsData({...allPeriodsData, ...d.periods}); await savePeriods({...allPeriodsData, ...d.periods}); } alert('Imported!'); } catch { alert('Invalid file'); }}; reader.readAsText(file); };



// If Supabase is configured, require login so your data is private.
if (supabase && isAuthReady && !session) {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Dashboard Login</h1>
            <p className="text-slate-400 text-sm">Sign in to access your data from any device.</p>
          </div>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Email</label>
            <input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} type="email" required
              className="w-full rounded-xl bg-slate-950/60 border border-slate-700 px-3 py-2 outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Password</label>
            <input value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} type="password" required
              className="w-full rounded-xl bg-slate-950/60 border border-slate-700 px-3 py-2 outline-none focus:border-emerald-500" />
          </div>

          {authError && (
            <div className="text-sm text-rose-300 bg-rose-950/30 border border-rose-900/50 rounded-xl p-3">
              {authError}
            </div>
          )}

          <button type="submit" className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2">
            {authMode === 'sign_up' ? 'Create account' : 'Sign in'}
          </button>

          <button type="button" onClick={() => setAuthMode(authMode === 'sign_up' ? 'sign_in' : 'sign_up')}
            className="w-full rounded-xl border border-slate-700 hover:border-slate-500 text-slate-200 py-2">
            {authMode === 'sign_up' ? 'Have an account? Sign in' : 'New here? Create an account'}
          </button>

          <p className="text-xs text-slate-500">If you haven't added your Supabase keys yet, the app will run without login but data will stay on this device only.</p>
        </form>
      </div>
    </div>
  );
}
  // UI Components
  const FileBox = ({ type, label, desc, req, isInv }) => {
    const fs = isInv ? invFiles : files, fn = isInv ? invFileNames : fileNames;
    return (
      <div className={`relative border-2 border-dashed rounded-xl p-4 ${fs[type] ? 'border-emerald-400 bg-emerald-950/30' : 'border-slate-600 hover:border-slate-400 bg-slate-800/30'}`}>
        <input type="file" accept=".csv" onChange={(e) => handleFile(type, e.target.files[0], isInv)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${fs[type] ? 'bg-emerald-500' : 'bg-slate-700'}`}>
            {fs[type] ? <Check className="w-5 h-5 text-white" /> : <FileSpreadsheet className="w-5 h-5 text-slate-300" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2"><span className="font-medium text-white text-sm">{label}</span>{req && <span className="text-xs text-rose-400">*</span>}</div>
            {fs[type] ? <p className="text-xs text-emerald-400 truncate">{fn[type]}</p> : <p className="text-xs text-slate-500">{desc}</p>}
          </div>
        </div>
      </div>
    );
  };

  const MetricCard = ({ label, value, sub, icon: Icon, color = 'slate' }) => {
    const colors = { emerald: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/30', blue: 'from-blue-500/20 to-blue-600/5 border-blue-500/30', amber: 'from-amber-500/20 to-amber-600/5 border-amber-500/30', rose: 'from-rose-500/20 to-rose-600/5 border-rose-500/30', violet: 'from-violet-500/20 to-violet-600/5 border-violet-500/30', orange: 'from-orange-500/20 to-orange-600/5 border-orange-500/30', cyan: 'from-cyan-500/20 to-cyan-600/5 border-cyan-500/30' };
    const iconC = { emerald: 'text-emerald-400', blue: 'text-blue-400', amber: 'text-amber-400', rose: 'text-rose-400', violet: 'text-violet-400', orange: 'text-orange-400', cyan: 'text-cyan-400' };
    return (
      <div className={`bg-gradient-to-br ${colors[color] || colors.emerald} border rounded-2xl p-5`}>
        <div className="flex items-start justify-between mb-3"><span className="text-slate-400 text-sm font-medium">{label}</span>{Icon && <Icon className={`w-5 h-5 ${iconC[color] || iconC.emerald}`} />}</div>
        <div className="text-2xl font-bold text-white mb-1">{value}</div>
        {sub && <div className="text-sm text-slate-400">{sub}</div>}
      </div>
    );
  };

  const ChannelCard = ({ title, color, data, isAmz, showSkuTable = false }) => {
    const [expanded, setExpanded] = useState(false);
    const skuData = data.skuData || [];
    return (
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700 overflow-hidden">
        <div className={`border-l-4 ${color === 'orange' ? 'border-orange-500' : 'border-blue-500'} p-5`}>
          <h3 className={`text-lg font-bold ${color === 'orange' ? 'text-orange-400' : 'text-blue-400'} mb-4`}>{title}</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div><p className="text-slate-500 text-xs uppercase mb-1">Revenue</p><p className="text-xl font-bold text-white">{formatCurrency(data.revenue)}</p></div>
            <div><p className="text-slate-500 text-xs uppercase mb-1">Units</p><p className="text-xl font-bold text-white">{formatNumber(data.units)}</p></div>
            <div><p className="text-slate-500 text-xs uppercase mb-1">Net Profit</p><p className={`text-xl font-bold ${data.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(data.netProfit)}</p></div>
            <div><p className="text-slate-500 text-xs uppercase mb-1">Margin</p><p className={`text-xl font-bold ${(isAmz ? data.margin : data.netMargin) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatPercent(isAmz ? data.margin : data.netMargin)}</p></div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div><p className="text-slate-500 text-xs uppercase mb-1">COGS</p><p className="text-lg font-semibold text-white">{formatCurrency(data.cogs)}</p></div>
            <div><p className="text-slate-500 text-xs uppercase mb-1">{isAmz ? 'Fees' : '3PL Costs'}</p><p className="text-lg font-semibold text-white">{formatCurrency(isAmz ? data.fees : data.threeplCosts)}</p></div>
            <div><p className="text-slate-500 text-xs uppercase mb-1">Ad Spend</p><p className="text-lg font-semibold text-white">{formatCurrency(data.adSpend)}</p></div>
            <div><p className="text-slate-500 text-xs uppercase mb-1">ROAS</p><p className="text-lg font-semibold text-white">{(data.roas || 0).toFixed(2)}x</p></div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div><p className="text-slate-500 text-xs uppercase mb-1">AOV</p><p className="text-lg font-semibold text-white">{formatCurrency(data.aov)}</p></div>
            {isAmz ? (
              <>
                <div><p className="text-slate-500 text-xs uppercase mb-1">Returns</p><p className="text-lg font-semibold text-white">{formatNumber(data.returns || 0)}</p></div>
                <div><p className="text-slate-500 text-xs uppercase mb-1">Return Rate</p><p className="text-lg font-semibold text-white">{formatPercent(data.returnRate || 0)}</p></div>
              </>
            ) : (
              <>
                <div><p className="text-slate-500 text-xs uppercase mb-1">Meta Ads</p><p className="text-lg font-semibold text-white">{formatCurrency(data.metaSpend || 0)}</p></div>
                <div><p className="text-slate-500 text-xs uppercase mb-1">Google Ads</p><p className="text-lg font-semibold text-white">{formatCurrency(data.googleSpend || 0)}</p></div>
              </>
            )}
            <div><p className="text-slate-500 text-xs uppercase mb-1">{isAmz ? 'COGS/Unit' : 'Discounts'}</p><p className="text-lg font-semibold text-white">{isAmz ? formatCurrency(data.units > 0 ? data.cogs / data.units : 0) : formatCurrency(data.discounts || 0)}</p></div>
          </div>
          {showSkuTable && (
            <div className="mt-4 pt-4 border-t border-slate-700">
              <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-3">
                <ChevronRight className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                SKU Details ({skuData.length} products)
              </button>
              {expanded && (
                skuData.length > 0 ? (
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-900/50 sticky top-0">
                        <tr>
                          <th className="text-left text-xs font-medium text-slate-400 uppercase px-2 py-2">SKU</th>
                          <th className="text-right text-xs font-medium text-slate-400 uppercase px-2 py-2">Units</th>
                          <th className="text-right text-xs font-medium text-slate-400 uppercase px-2 py-2">Sales</th>
                          {isAmz && <th className="text-right text-xs font-medium text-slate-400 uppercase px-2 py-2">Proceeds</th>}
                          {isAmz && <th className="text-right text-xs font-medium text-slate-400 uppercase px-2 py-2">Ad Spend</th>}
                          {isAmz && <th className="text-right text-xs font-medium text-slate-400 uppercase px-2 py-2">Returns</th>}
                          {!isAmz && <th className="text-right text-xs font-medium text-slate-400 uppercase px-2 py-2">Discounts</th>}
                          <th className="text-right text-xs font-medium text-slate-400 uppercase px-2 py-2">COGS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/50">
                        {skuData.map((item, i) => (
                          <tr key={item.sku + i} className="hover:bg-slate-700/30">
                            <td className="px-2 py-2"><div className="max-w-[200px] truncate text-white" title={item.name}>{item.sku}</div></td>
                            <td className="text-right px-2 py-2 text-white">{formatNumber(item.unitsSold)}</td>
                            <td className="text-right px-2 py-2 text-white">{formatCurrency(item.netSales)}</td>
                            {isAmz && <td className="text-right px-2 py-2 text-emerald-400">{formatCurrency(item.netProceeds)}</td>}
                            {isAmz && <td className="text-right px-2 py-2 text-violet-400">{formatCurrency(item.adSpend)}</td>}
                            {isAmz && <td className="text-right px-2 py-2 text-rose-400">{formatNumber(item.returns)}</td>}
                            {!isAmz && <td className="text-right px-2 py-2 text-amber-400">{formatCurrency(item.discounts)}</td>}
                            <td className="text-right px-2 py-2 text-slate-400">{formatCurrency(item.cogs)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="bg-slate-900/50 rounded-lg p-4 text-center">
                    <p className="text-slate-400 text-sm">No SKU data available for this week.</p>
                    <p className="text-slate-500 text-xs mt-1">Re-upload your sales files to capture SKU-level detail.</p>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const HealthBadge = ({ health }) => {
    const s = { critical: 'bg-rose-500/20 text-rose-400', low: 'bg-amber-500/20 text-amber-400', healthy: 'bg-emerald-500/20 text-emerald-400', overstock: 'bg-violet-500/20 text-violet-400', unknown: 'bg-slate-500/20 text-slate-400' };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s[health] || s.unknown}`}>{health || '—'}</span>;
  };

  const NavTabs = () => (
    <div className="flex flex-wrap gap-2 mb-6 p-1 bg-slate-800/50 rounded-xl">
      <button onClick={() => setView('upload')} className={`px-3 py-2 rounded-lg text-sm font-medium ${view === 'upload' ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><Upload className="w-4 h-4 inline mr-1" />Weekly</button>
      <button onClick={() => setView('period-upload')} className={`px-3 py-2 rounded-lg text-sm font-medium ${view === 'period-upload' || view === 'period-view' ? 'bg-teal-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><CalendarRange className="w-4 h-4 inline mr-1" />Period</button>
      <button onClick={() => { const w = Object.keys(allWeeksData).sort().reverse(); if (w.length) { setSelectedWeek(w[0]); setView('weekly'); }}} disabled={!Object.keys(allWeeksData).length} className={`px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${view === 'weekly' ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><Calendar className="w-4 h-4 inline mr-1" />View Weeks</button>
      <button onClick={() => { const p = Object.keys(allPeriodsData).sort().reverse(); if (p.length) { setSelectedPeriod(p[0]); setView('period-view'); }}} disabled={!Object.keys(allPeriodsData).length} className={`px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${view === 'period-view' ? 'bg-teal-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><BarChart3 className="w-4 h-4 inline mr-1" />View Periods</button>
      <div className="w-px bg-slate-600 mx-1" />
      <button onClick={() => setView('inv-upload')} className={`px-3 py-2 rounded-lg text-sm font-medium ${view === 'inventory' || view === 'inv-upload' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><Boxes className="w-4 h-4 inline mr-1" />Inventory</button>
    </div>
  );

  const DataBar = () => (
    <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
      <div className="flex items-center gap-2 text-slate-400 text-sm"><Database className="w-4 h-4" /><span>{Object.keys(allWeeksData).length} weeks | {Object.keys(allPeriodsData).length} periods</span></div>
      <div className="flex items-center gap-2">
        {Object.keys(savedCogs).length > 0 ? <span className="text-emerald-400 text-xs flex items-center gap-1"><Check className="w-3 h-3" />{Object.keys(savedCogs).length} SKUs</span> : <span className="text-amber-400 text-xs">No COGS</span>}
        <button onClick={() => setShowCogsManager(true)} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white flex items-center gap-1"><Settings className="w-3 h-3" />COGS</button>
      </div>
      <div className="flex-1" />
      <button onClick={exportAll} className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white"><Download className="w-4 h-4" />Export</button>
      <label className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white cursor-pointer"><Upload className="w-4 h-4" />Import<input type="file" accept=".json" onChange={(e) => e.target.files[0] && importData(e.target.files[0])} className="hidden" /></label>
    </div>
  );

  const Toast = () => showSaveConfirm && <div className="fixed bottom-4 right-4 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50"><Check className="w-4 h-4" />Saved!</div>;

  const CogsManager = () => showCogsManager && (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-md w-full">
        <h2 className="text-xl font-bold text-white mb-4">Manage COGS</h2>
        {Object.keys(savedCogs).length > 0 ? (
          <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4 mb-4">
            <div className="flex items-center gap-2 text-emerald-400 mb-1"><Check className="w-5 h-5" /><span className="font-semibold">COGS Loaded</span></div>
            <p className="text-slate-300 text-sm">{Object.keys(savedCogs).length} SKUs</p>
            {cogsLastUpdated && <p className="text-slate-500 text-xs">Updated: {new Date(cogsLastUpdated).toLocaleDateString()}</p>}
          </div>
        ) : (
          <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4 mb-4">
            <p className="text-amber-400 font-semibold">No COGS Data</p>
            <p className="text-slate-300 text-sm">Upload a COGS file to enable profit calculations</p>
          </div>
        )}
        <div className="mb-4"><p className="text-slate-400 text-sm mb-2">Upload COGS file:</p><FileBox type="cogs" label="COGS File" desc="CSV with SKU and Cost Per Unit" /></div>
        <div className="flex gap-3">
          {files.cogs && <button onClick={processAndSaveCogs} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 rounded-xl">Save COGS</button>}
          <button onClick={() => { setShowCogsManager(false); setFiles(p => ({ ...p, cogs: null })); setFileNames(p => ({ ...p, cogs: '' })); }} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-xl">{files.cogs ? 'Cancel' : 'Close'}</button>
        </div>
      </div>
    </div>
  );

  const hasCogs = Object.keys(savedCogs).length > 0;

  // VIEWS
  if (view === 'upload') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-6">
        <div className="max-w-3xl mx-auto"><Toast /><CogsManager />
          <div className="text-center mb-8"><div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 mb-4"><BarChart3 className="w-8 h-8 text-white" /></div><h1 className="text-3xl font-bold text-white mb-2">Weekly Sales Upload</h1></div>
          <NavTabs /><DataBar />
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6 mb-6">
            <label className="block text-sm font-medium text-slate-300 mb-2">Week Ending (Sunday) <span className="text-rose-400">*</span></label>
            <input type="date" value={weekEnding} onChange={(e) => setWeekEnding(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white" />
          </div>
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-4">Data Files</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FileBox type="amazon" label="Amazon Report" desc="Tortuga CSV" req />
              <FileBox type="shopify" label="Shopify Sales" desc="Sales by variant" req />
              <FileBox type="threepl" label="3PL Costs" desc="Optional" />
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-4">Shopify Ad Spend</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm text-slate-400 mb-2">Meta</label><input type="number" value={adSpend.meta} onChange={(e) => setAdSpend(p => ({ ...p, meta: e.target.value }))} placeholder="0.00" className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white" /></div>
              <div><label className="block text-sm text-slate-400 mb-2">Google</label><input type="number" value={adSpend.google} onChange={(e) => setAdSpend(p => ({ ...p, google: e.target.value }))} placeholder="0.00" className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white" /></div>
            </div>
          </div>
          {!hasCogs && <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4 mb-6"><p className="text-amber-400 font-semibold">COGS Required</p><p className="text-slate-300 text-sm">Click "COGS" button above first.</p></div>}
          <button onClick={processSales} disabled={isProcessing || !files.amazon || !files.shopify || !hasCogs || !weekEnding} className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold py-4 rounded-xl">{isProcessing ? 'Processing...' : 'Generate Dashboard'}</button>
        </div>
      </div>
    );
  }

  if (view === 'bulk') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-6">
        <div className="max-w-3xl mx-auto"><Toast /><CogsManager />
          <div className="text-center mb-8"><div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 mb-4"><Layers className="w-8 h-8 text-white" /></div><h1 className="text-3xl font-bold text-white mb-2">Bulk Import</h1><p className="text-slate-400">Auto-splits into weeks</p></div>
          <NavTabs /><DataBar />
          <div className="bg-amber-900/20 border border-amber-500/30 rounded-2xl p-5 mb-6"><h3 className="text-amber-400 font-semibold mb-2">How It Works</h3><ul className="text-slate-300 text-sm space-y-1"><li>• Upload Amazon with "End date" column</li><li>• Auto-groups by week ending Sunday</li><li>• Shopify distributed proportionally</li></ul></div>
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><FileBox type="amazon" label="Amazon Report" desc="Multi-week CSV" req /><FileBox type="shopify" label="Shopify Sales" desc="Matching period" req /></div>
          </div>
          {!hasCogs && <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4 mb-6"><p className="text-amber-400 font-semibold">COGS Required</p><p className="text-slate-300 text-sm">Click "COGS" button above first.</p></div>}
          {bulkImportResult && <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-2xl p-5 mb-6"><h3 className="text-emerald-400 font-semibold mb-2">Import Complete!</h3><p className="text-slate-300">Created <span className="text-white font-bold">{bulkImportResult.weeksCreated}</span> weeks</p><p className="text-slate-400 text-sm">{bulkImportResult.dateRange}</p></div>}
          <button onClick={processBulkImport} disabled={isProcessing || !files.amazon || !files.shopify || !hasCogs} className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold py-4 rounded-xl">{isProcessing ? 'Processing...' : 'Import & Split'}</button>
        </div>
      </div>
    );
  }

  if (view === 'custom-select') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-6">
        <div className="max-w-3xl mx-auto"><Toast /><CogsManager />
          <div className="text-center mb-8"><div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-4"><CalendarRange className="w-8 h-8 text-white" /></div><h1 className="text-3xl font-bold text-white mb-2">Custom Period</h1></div>
          <NavTabs /><DataBar />
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm text-slate-400 mb-2">Start</label><input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white" /></div>
              <div><label className="block text-sm text-slate-400 mb-2">End</label><input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white" /></div>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <button onClick={() => { const n = new Date(), s = new Date(n.getFullYear(), n.getMonth() - 1, 1), e = new Date(n.getFullYear(), n.getMonth(), 0); setCustomStartDate(s.toISOString().split('T')[0]); setCustomEndDate(e.toISOString().split('T')[0]); }} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white">Last Month</button>
            <button onClick={() => { const n = new Date(), s = new Date(n.getFullYear(), n.getMonth() - 3, 1), e = new Date(n.getFullYear(), n.getMonth(), 0); setCustomStartDate(s.toISOString().split('T')[0]); setCustomEndDate(e.toISOString().split('T')[0]); }} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white">Last Quarter</button>
            <button onClick={() => { const n = new Date(); setCustomStartDate(`${n.getFullYear()}-01-01`); setCustomEndDate(n.toISOString().split('T')[0]); }} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white">YTD</button>
            <button onClick={() => { const y = new Date().getFullYear() - 1; setCustomStartDate(`${y}-01-01`); setCustomEndDate(`${y}-12-31`); }} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white">Last Year</button>
          </div>
          <button onClick={processCustomPeriod} disabled={!customStartDate || !customEndDate} className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold py-4 rounded-xl">Analyze</button>
        </div>
      </div>
    );
  }

  if (view === 'custom' && customPeriodData) {
    const data = customPeriodData;
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 lg:p-6">
        <div className="max-w-7xl mx-auto"><Toast /><CogsManager />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div><h1 className="text-2xl lg:text-3xl font-bold text-white">Custom Period</h1><p className="text-slate-400">{data.startDate} to {data.endDate} ({data.weeksIncluded} weeks)</p></div>
            <button onClick={() => setView('custom-select')} className="bg-cyan-700 hover:bg-cyan-600 text-white px-3 py-2 rounded-lg text-sm">Change</button>
          </div>
          <NavTabs />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <MetricCard label="Total Revenue" value={formatCurrency(data.total.revenue)} icon={DollarSign} color="emerald" />
            <MetricCard label="Net Profit" value={formatCurrency(data.total.netProfit)} sub={`${formatPercent(data.total.netMargin)} margin`} icon={TrendingUp} color={data.total.netProfit >= 0 ? 'emerald' : 'rose'} />
            <MetricCard label="Avg Weekly Rev" value={formatCurrency(data.avgWeeklyRevenue)} icon={Calendar} color="cyan" />
            <MetricCard label="Avg Weekly Profit" value={formatCurrency(data.avgWeeklyProfit)} icon={TrendingUp} color="cyan" />
          </div>
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5 mb-8"><h3 className="text-sm font-semibold text-slate-400 uppercase mb-4">Weekly Trend</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {data.weeklyBreakdown.map((w) => { const max = Math.max(...data.weeklyBreakdown.map(x => x.revenue)) || 1; return (
                <div key={w.week} className="flex items-center gap-4">
                  <span className="w-20 text-xs text-slate-400">{new Date(w.week+'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  <div className="flex-1 h-6 bg-slate-700 rounded overflow-hidden relative">
                    <div className={`h-full ${w.profit >= 0 ? 'bg-emerald-600' : 'bg-rose-600'}`} style={{ width: `${(w.revenue/max)*100}%` }} />
                    <div className="absolute inset-0 flex items-center justify-between px-2 text-xs"><span className="text-white">{formatCurrency(w.revenue)}</span><span className={w.profit >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{formatCurrency(w.profit)}</span></div>
                  </div>
                </div>
              );})}
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><ChannelCard title="Amazon" color="orange" data={data.amazon} isAmz /><ChannelCard title="Shopify" color="blue" data={data.shopify} /></div>
        </div>
      </div>
    );
  }

  if (view === 'weekly' && selectedWeek && allWeeksData[selectedWeek]) {
    const data = allWeeksData[selectedWeek], weeks = Object.keys(allWeeksData).sort().reverse(), idx = weeks.indexOf(selectedWeek);
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 lg:p-6">
        <div className="max-w-7xl mx-auto"><Toast /><CogsManager />
          {/* Edit Ad Spend Modal */}
          {showEditAdSpend && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-md w-full">
                <h2 className="text-xl font-bold text-white mb-4">Edit Shopify Ad Spend</h2>
                <p className="text-slate-400 text-sm mb-4">Week ending {new Date(selectedWeek+'T00:00:00').toLocaleDateString()}</p>
                <div className="space-y-4 mb-6">
                  <div><label className="block text-sm text-slate-400 mb-2">Meta Ads</label><input type="number" value={editAdSpend.meta} onChange={(e) => setEditAdSpend(p => ({ ...p, meta: e.target.value }))} placeholder="0.00" className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white" /></div>
                  <div><label className="block text-sm text-slate-400 mb-2">Google Ads</label><input type="number" value={editAdSpend.google} onChange={(e) => setEditAdSpend(p => ({ ...p, google: e.target.value }))} placeholder="0.00" className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white" /></div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => updateWeekAdSpend(selectedWeek, editAdSpend.meta, editAdSpend.google)} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 rounded-xl">Save</button>
                  <button onClick={() => setShowEditAdSpend(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-xl">Cancel</button>
                </div>
              </div>
            </div>
          )}
          {/* Reprocess Modal */}
          {showReprocess && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold text-white mb-2">Re-process Week</h2>
                <p className="text-slate-400 text-sm mb-4">Week ending {new Date(selectedWeek+'T00:00:00').toLocaleDateString()} - Upload files to add SKU detail</p>
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Amazon Report <span className="text-rose-400">*</span></label>
                    <div className={`relative border-2 border-dashed rounded-xl p-3 ${reprocessFiles.amazon ? 'border-emerald-400 bg-emerald-950/30' : 'border-slate-600 bg-slate-800/30'}`}>
                      <input type="file" accept=".csv" onChange={(e) => handleReprocessFile('amazon', e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                      <div className="flex items-center gap-2">
                        {reprocessFiles.amazon ? <Check className="w-4 h-4 text-emerald-400" /> : <FileSpreadsheet className="w-4 h-4 text-slate-400" />}
                        <span className={reprocessFiles.amazon ? 'text-emerald-400 text-sm' : 'text-slate-400 text-sm'}>{reprocessFileNames.amazon || 'Click to upload'}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Shopify Sales <span className="text-rose-400">*</span></label>
                    <div className={`relative border-2 border-dashed rounded-xl p-3 ${reprocessFiles.shopify ? 'border-emerald-400 bg-emerald-950/30' : 'border-slate-600 bg-slate-800/30'}`}>
                      <input type="file" accept=".csv" onChange={(e) => handleReprocessFile('shopify', e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                      <div className="flex items-center gap-2">
                        {reprocessFiles.shopify ? <Check className="w-4 h-4 text-emerald-400" /> : <FileSpreadsheet className="w-4 h-4 text-slate-400" />}
                        <span className={reprocessFiles.shopify ? 'text-emerald-400 text-sm' : 'text-slate-400 text-sm'}>{reprocessFileNames.shopify || 'Click to upload'}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">3PL Costs (Optional)</label>
                    <div className={`relative border-2 border-dashed rounded-xl p-3 ${reprocessFiles.threepl ? 'border-emerald-400 bg-emerald-950/30' : 'border-slate-600 bg-slate-800/30'}`}>
                      <input type="file" accept=".csv" onChange={(e) => handleReprocessFile('threepl', e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                      <div className="flex items-center gap-2">
                        {reprocessFiles.threepl ? <Check className="w-4 h-4 text-emerald-400" /> : <FileSpreadsheet className="w-4 h-4 text-slate-400" />}
                        <span className={reprocessFiles.threepl ? 'text-emerald-400 text-sm' : 'text-slate-400 text-sm'}>{reprocessFileNames.threepl || 'Click to upload'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm text-slate-400 mb-2">Meta Ads</label><input type="number" value={reprocessAdSpend.meta} onChange={(e) => setReprocessAdSpend(p => ({ ...p, meta: e.target.value }))} placeholder="0.00" className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white" /></div>
                    <div><label className="block text-sm text-slate-400 mb-2">Google Ads</label><input type="number" value={reprocessAdSpend.google} onChange={(e) => setReprocessAdSpend(p => ({ ...p, google: e.target.value }))} placeholder="0.00" className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white" /></div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => reprocessWeek(selectedWeek)} disabled={!reprocessFiles.amazon || !reprocessFiles.shopify} className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 text-white font-semibold py-2 rounded-xl">Re-process</button>
                  <button onClick={() => { setShowReprocess(false); setReprocessFiles({ amazon: null, shopify: null, threepl: null }); setReprocessFileNames({ amazon: '', shopify: '', threepl: '' }); setReprocessAdSpend({ meta: '', google: '' }); }} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-xl">Cancel</button>
                </div>
              </div>
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div><h1 className="text-2xl lg:text-3xl font-bold text-white">Weekly Performance</h1><p className="text-slate-400">Week ending {new Date(selectedWeek+'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p></div>
            <div className="flex gap-2">
              <button onClick={() => { setReprocessAdSpend({ meta: data.shopify.metaSpend || '', google: data.shopify.googleSpend || '' }); setShowReprocess(true); }} className="bg-violet-900/50 hover:bg-violet-800/50 border border-violet-600/50 text-violet-300 px-3 py-2 rounded-lg text-sm flex items-center gap-1"><RefreshCw className="w-4 h-4" />Re-process</button>
              <button onClick={() => { setEditAdSpend({ meta: data.shopify.metaSpend || '', google: data.shopify.googleSpend || '' }); setShowEditAdSpend(true); }} className="bg-blue-900/50 hover:bg-blue-800/50 border border-blue-600/50 text-blue-300 px-3 py-2 rounded-lg text-sm flex items-center gap-1"><DollarSign className="w-4 h-4" />Edit Ads</button>
              <button onClick={() => deleteWeek(selectedWeek)} className="bg-rose-900/50 hover:bg-rose-800/50 border border-rose-600/50 text-rose-300 px-3 py-2 rounded-lg text-sm"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
          <NavTabs />
          <div className="flex items-center gap-4 mb-6">
            <button onClick={() => idx < weeks.length - 1 && setSelectedWeek(weeks[idx + 1])} disabled={idx >= weeks.length - 1} className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg"><ChevronLeft className="w-5 h-5" /></button>
            <select value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)} className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white">{weeks.map(w => <option key={w} value={w}>{new Date(w+'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</option>)}</select>
            <button onClick={() => idx > 0 && setSelectedWeek(weeks[idx - 1])} disabled={idx <= 0} className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg"><ChevronRight className="w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <MetricCard label="Total Revenue" value={formatCurrency(data.total.revenue)} icon={DollarSign} color="emerald" />
            <MetricCard label="Total Units" value={formatNumber(data.total.units)} icon={Package} color="blue" />
            <MetricCard label="Net Profit" value={formatCurrency(data.total.netProfit)} sub={`${formatPercent(data.total.netMargin)} margin`} icon={TrendingUp} color={data.total.netProfit >= 0 ? 'emerald' : 'rose'} />
            <MetricCard label="Ad Spend" value={formatCurrency(data.total.adSpend)} sub={`${(data.total.roas || 0).toFixed(2)}x ROAS`} icon={BarChart3} color="violet" />
            <MetricCard label="COGS" value={formatCurrency(data.total.cogs)} icon={ShoppingCart} color="amber" />
          </div>
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5 mb-8">
            <h3 className="text-sm font-semibold text-slate-400 uppercase mb-4">Revenue by Channel</h3>
            <div className="h-4 bg-slate-700 rounded-full overflow-hidden flex mb-3"><div className="bg-orange-500 h-full" style={{ width: `${data.total.amazonShare}%` }} /><div className="bg-blue-500 h-full" style={{ width: `${data.total.shopifyShare}%` }} /></div>
            <div className="flex justify-between text-sm"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-orange-500" /><span className="text-slate-300">Amazon</span><span className="text-white font-semibold">{formatPercent(data.total.amazonShare)}</span></div><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500" /><span className="text-slate-300">Shopify</span><span className="text-white font-semibold">{formatPercent(data.total.shopifyShare)}</span></div></div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><ChannelCard title="Amazon" color="orange" data={data.amazon} isAmz showSkuTable /><ChannelCard title="Shopify" color="blue" data={data.shopify} showSkuTable /></div>
        </div>
      </div>
    );
  }

  if (view === 'monthly') {
    const months = getMonths(), data = selectedMonth ? getMonthlyData(selectedMonth) : null, idx = months.indexOf(selectedMonth);
    if (!data) return <div className="min-h-screen bg-slate-950 text-white p-6 flex items-center justify-center">No data</div>;
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 lg:p-6">
        <div className="max-w-7xl mx-auto"><Toast /><CogsManager />
          <div className="mb-6"><h1 className="text-2xl lg:text-3xl font-bold text-white">Monthly Performance</h1><p className="text-slate-400">{new Date(selectedMonth+'-01T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} ({data.weeks.length} weeks)</p></div>
          <NavTabs />
          <div className="flex items-center gap-4 mb-6">
            <button onClick={() => idx < months.length - 1 && setSelectedMonth(months[idx + 1])} disabled={idx >= months.length - 1} className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg"><ChevronLeft className="w-5 h-5" /></button>
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white">{months.map(m => <option key={m} value={m}>{new Date(m+'-01T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</option>)}</select>
            <button onClick={() => idx > 0 && setSelectedMonth(months[idx - 1])} disabled={idx <= 0} className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg"><ChevronRight className="w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <MetricCard label="Total Revenue" value={formatCurrency(data.total.revenue)} icon={DollarSign} color="emerald" />
            <MetricCard label="Total Units" value={formatNumber(data.total.units)} icon={Package} color="blue" />
            <MetricCard label="Net Profit" value={formatCurrency(data.total.netProfit)} sub={`${formatPercent(data.total.netMargin)} margin`} icon={TrendingUp} color={data.total.netProfit >= 0 ? 'emerald' : 'rose'} />
            <MetricCard label="Ad Spend" value={formatCurrency(data.total.adSpend)} icon={BarChart3} color="violet" />
            <MetricCard label="COGS" value={formatCurrency(data.total.cogs)} icon={ShoppingCart} color="amber" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><ChannelCard title="Amazon" color="orange" data={data.amazon} isAmz /><ChannelCard title="Shopify" color="blue" data={data.shopify} /></div>
        </div>
      </div>
    );
  }

  if (view === 'yearly') {
    const years = getYears(), data = selectedYear ? getYearlyData(selectedYear) : null, idx = years.indexOf(selectedYear);
    if (!data) return <div className="min-h-screen bg-slate-950 text-white p-6 flex items-center justify-center">No data</div>;
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 lg:p-6">
        <div className="max-w-7xl mx-auto"><Toast /><CogsManager />
          <div className="mb-6"><h1 className="text-2xl lg:text-3xl font-bold text-white">Yearly Performance</h1><p className="text-slate-400">{selectedYear} ({data.weeks.length} weeks)</p></div>
          <NavTabs />
          <div className="flex items-center gap-4 mb-6">
            <button onClick={() => idx < years.length - 1 && setSelectedYear(years[idx + 1])} disabled={idx >= years.length - 1} className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg"><ChevronLeft className="w-5 h-5" /></button>
            <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white">{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
            <button onClick={() => idx > 0 && setSelectedYear(years[idx - 1])} disabled={idx <= 0} className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg"><ChevronRight className="w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <MetricCard label="Total Revenue" value={formatCurrency(data.total.revenue)} icon={DollarSign} color="emerald" />
            <MetricCard label="Total Units" value={formatNumber(data.total.units)} icon={Package} color="blue" />
            <MetricCard label="Net Profit" value={formatCurrency(data.total.netProfit)} sub={`${formatPercent(data.total.netMargin)} margin`} icon={TrendingUp} color={data.total.netProfit >= 0 ? 'emerald' : 'rose'} />
            <MetricCard label="Ad Spend" value={formatCurrency(data.total.adSpend)} icon={BarChart3} color="violet" />
            <MetricCard label="COGS" value={formatCurrency(data.total.cogs)} icon={ShoppingCart} color="amber" />
          </div>
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5 mb-8"><h3 className="text-sm font-semibold text-slate-400 uppercase mb-4">Monthly Breakdown</h3>
            <div className="space-y-3">{Object.entries(data.monthlyBreakdown).sort().map(([m, md]) => { const max = Math.max(...Object.values(data.monthlyBreakdown).map(x => x.revenue)) || 1; return (
              <div key={m} className="flex items-center gap-4">
                <span className="w-12 text-sm text-slate-400">{new Date(m+'-01T00:00:00').toLocaleDateString('en-US', { month: 'short' })}</span>
                <div className="flex-1 h-8 bg-slate-700 rounded-lg overflow-hidden relative">
                  <div className={`h-full ${md.netProfit >= 0 ? 'bg-emerald-600' : 'bg-rose-600'}`} style={{ width: `${(md.revenue/max)*100}%` }} />
                  <div className="absolute inset-0 flex items-center justify-between px-3"><span className="text-white text-sm font-medium">{formatCurrency(md.revenue)}</span><span className={`text-sm font-medium ${md.netProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{formatCurrency(md.netProfit)}</span></div>
                </div>
              </div>
            );})}</div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><ChannelCard title="Amazon" color="orange" data={data.amazon} isAmz /><ChannelCard title="Shopify" color="blue" data={data.shopify} /></div>
        </div>
      </div>
    );
  }

  // Period Upload View (for monthly/yearly totals)
  if (view === 'period-upload') {
    const periods = Object.keys(allPeriodsData).sort().reverse();
    const PeriodFileBox = ({ type, label, desc, req }) => (
      <div className={`relative border-2 border-dashed rounded-xl p-4 ${periodFiles[type] ? 'border-emerald-400 bg-emerald-950/30' : 'border-slate-600 hover:border-slate-400 bg-slate-800/30'}`}>
        <input type="file" accept=".csv" onChange={(e) => handlePeriodFile(type, e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${periodFiles[type] ? 'bg-emerald-500' : 'bg-slate-700'}`}>
            {periodFiles[type] ? <Check className="w-5 h-5 text-white" /> : <FileSpreadsheet className="w-5 h-5 text-slate-300" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2"><span className="font-medium text-white text-sm">{label}</span>{req && <span className="text-xs text-rose-400">*</span>}</div>
            {periodFiles[type] ? <p className="text-xs text-emerald-400 truncate">{periodFileNames[type]}</p> : <p className="text-xs text-slate-500">{desc}</p>}
          </div>
        </div>
      </div>
    );
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-6">
        <div className="max-w-3xl mx-auto"><Toast /><CogsManager />
          <div className="text-center mb-8"><div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 mb-4"><CalendarRange className="w-8 h-8 text-white" /></div><h1 className="text-3xl font-bold text-white mb-2">Period Upload</h1><p className="text-slate-400">Upload monthly or yearly totals (no weekly breakdown)</p></div>
          <NavTabs /><DataBar />
          {periods.length > 0 && (
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-4 mb-6">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Existing Periods</h3>
              <div className="flex flex-wrap gap-2">{periods.map(p => <button key={p} onClick={() => { setSelectedPeriod(p); setView('period-view'); }} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white">{allPeriodsData[p]?.label || p}</button>)}</div>
            </div>
          )}
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6 mb-6">
            <label className="block text-sm font-medium text-slate-300 mb-2">Period Label <span className="text-rose-400">*</span></label>
            <input type="text" value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="e.g., January 2025, Q4 2024, 2024" className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white" />
          </div>
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-4">Data Files</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <PeriodFileBox type="amazon" label="Amazon Report" desc="Full period CSV" req />
              <PeriodFileBox type="shopify" label="Shopify Sales" desc="Full period CSV" req />
              <PeriodFileBox type="threepl" label="3PL Costs" desc="Optional" />
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-4">Shopify Ad Spend</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm text-slate-400 mb-2">Meta</label><input type="number" value={periodAdSpend.meta} onChange={(e) => setPeriodAdSpend(p => ({ ...p, meta: e.target.value }))} placeholder="0.00" className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white" /></div>
              <div><label className="block text-sm text-slate-400 mb-2">Google</label><input type="number" value={periodAdSpend.google} onChange={(e) => setPeriodAdSpend(p => ({ ...p, google: e.target.value }))} placeholder="0.00" className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white" /></div>
            </div>
          </div>
          {!Object.keys(savedCogs).length && <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4 mb-6"><p className="text-amber-400 font-semibold">COGS Required</p><p className="text-slate-300 text-sm">Click "COGS" button above first.</p></div>}
          <button onClick={processPeriod} disabled={isProcessing || !periodFiles.amazon || !periodFiles.shopify || !Object.keys(savedCogs).length || !periodLabel.trim()} className="w-full bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold py-4 rounded-xl">{isProcessing ? 'Processing...' : 'Generate Period Report'}</button>
        </div>
      </div>
    );
  }

  // Period View
  if (view === 'period-view' && selectedPeriod && allPeriodsData[selectedPeriod]) {
    const data = allPeriodsData[selectedPeriod], periods = Object.keys(allPeriodsData).sort().reverse(), idx = periods.indexOf(selectedPeriod);
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 lg:p-6">
        <div className="max-w-7xl mx-auto"><Toast /><CogsManager />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div><h1 className="text-2xl lg:text-3xl font-bold text-white">{data.label}</h1><p className="text-slate-400">Period Performance</p></div>
            <div className="flex gap-2">
              <button onClick={() => setView('period-upload')} className="bg-teal-700 hover:bg-teal-600 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-1"><Upload className="w-4 h-4" />New</button>
              <button onClick={() => deletePeriod(selectedPeriod)} className="bg-rose-900/50 hover:bg-rose-800/50 border border-rose-600/50 text-rose-300 px-3 py-2 rounded-lg text-sm"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
          <NavTabs />
          {periods.length > 1 && (
            <div className="flex items-center gap-4 mb-6">
              <button onClick={() => idx < periods.length - 1 && setSelectedPeriod(periods[idx + 1])} disabled={idx >= periods.length - 1} className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg"><ChevronLeft className="w-5 h-5" /></button>
              <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)} className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white">{periods.map(p => <option key={p} value={p}>{allPeriodsData[p]?.label || p}</option>)}</select>
              <button onClick={() => idx > 0 && setSelectedPeriod(periods[idx - 1])} disabled={idx <= 0} className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg"><ChevronRight className="w-5 h-5" /></button>
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <MetricCard label="Total Revenue" value={formatCurrency(data.total.revenue)} icon={DollarSign} color="emerald" />
            <MetricCard label="Total Units" value={formatNumber(data.total.units)} icon={Package} color="blue" />
            <MetricCard label="Net Profit" value={formatCurrency(data.total.netProfit)} sub={`${formatPercent(data.total.netMargin)} margin`} icon={TrendingUp} color={data.total.netProfit >= 0 ? 'emerald' : 'rose'} />
            <MetricCard label="Ad Spend" value={formatCurrency(data.total.adSpend)} sub={`${(data.total.roas || 0).toFixed(2)}x ROAS`} icon={BarChart3} color="violet" />
            <MetricCard label="COGS" value={formatCurrency(data.total.cogs)} icon={ShoppingCart} color="amber" />
          </div>
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5 mb-8">
            <h3 className="text-sm font-semibold text-slate-400 uppercase mb-4">Revenue by Channel</h3>
            <div className="h-4 bg-slate-700 rounded-full overflow-hidden flex mb-3"><div className="bg-orange-500 h-full" style={{ width: `${data.total.amazonShare}%` }} /><div className="bg-blue-500 h-full" style={{ width: `${data.total.shopifyShare}%` }} /></div>
            <div className="flex justify-between text-sm"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-orange-500" /><span className="text-slate-300">Amazon</span><span className="text-white font-semibold">{formatPercent(data.total.amazonShare)}</span></div><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500" /><span className="text-slate-300">Shopify</span><span className="text-white font-semibold">{formatPercent(data.total.shopifyShare)}</span></div></div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><ChannelCard title="Amazon" color="orange" data={data.amazon} isAmz showSkuTable /><ChannelCard title="Shopify" color="blue" data={data.shopify} showSkuTable /></div>
        </div>
      </div>
    );
  }

  // Inventory Upload View
  if (view === 'inv-upload') {
    const dates = Object.keys(invHistory).sort().reverse();
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-6">
        <div className="max-w-3xl mx-auto"><Toast /><CogsManager />
          <div className="text-center mb-8"><div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 mb-4"><Boxes className="w-8 h-8 text-white" /></div><h1 className="text-3xl font-bold text-white mb-2">Inventory Tracker</h1></div>
          <NavTabs /><DataBar />
          {dates.length > 0 && (
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-4 mb-6">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Previous Snapshots</h3>
              <div className="flex flex-wrap gap-2">{dates.slice(0, 8).map(d => <button key={d} onClick={() => { setSelectedInvDate(d); setView('inventory'); }} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white">{new Date(d+'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</button>)}</div>
            </div>
          )}
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6 mb-6">
            <label className="block text-sm font-medium text-slate-300 mb-2">Snapshot Date <span className="text-rose-400">*</span></label>
            <input type="date" value={invSnapshotDate} onChange={(e) => setInvSnapshotDate(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white" />
          </div>
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-4">Inventory Files</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FileBox type="amazon" label="Amazon FBA Inventory" desc="Inventory health report" req isInv />
              <FileBox type="threepl" label="3PL Inventory" desc="Products export" req isInv />
            </div>
          </div>
          {Object.keys(allWeeksData).length > 0 && <div className="bg-cyan-900/20 border border-cyan-500/30 rounded-xl p-4 mb-6"><p className="text-cyan-400 text-sm"><span className="font-semibold">Velocity:</span> Will use Amazon + Shopify sales data</p></div>}
          <button onClick={processInventory} disabled={isProcessing || !invFiles.amazon || !invFiles.threepl || !invSnapshotDate} className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold py-4 rounded-xl">{isProcessing ? 'Processing...' : 'Generate Report'}</button>
        </div>
      </div>
    );
  }

  // Inventory Dashboard View
  if (view === 'inventory' && selectedInvDate && invHistory[selectedInvDate]) {
    const dates = Object.keys(invHistory).sort().reverse();
    const data = invHistory[selectedInvDate];
    const idx = dates.indexOf(selectedInvDate);
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 lg:p-6">
        <div className="max-w-7xl mx-auto"><Toast /><CogsManager />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div><h1 className="text-2xl lg:text-3xl font-bold text-white">Inventory</h1><p className="text-slate-400">{new Date(selectedInvDate+'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p></div>
            <div className="flex gap-2">
              <button onClick={() => setView('inv-upload')} className="bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm"><RefreshCw className="w-4 h-4 inline mr-1" />New</button>
              <button onClick={() => deleteInv(selectedInvDate)} className="bg-rose-900/50 hover:bg-rose-800/50 text-rose-300 px-3 py-2 rounded-lg text-sm"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
          <NavTabs />
          {dates.length > 1 && (
            <div className="flex items-center gap-4 mb-6">
              <button onClick={() => idx < dates.length - 1 && setSelectedInvDate(dates[idx + 1])} disabled={idx >= dates.length - 1} className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg"><ChevronLeft className="w-5 h-5" /></button>
              <select value={selectedInvDate} onChange={(e) => setSelectedInvDate(e.target.value)} className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white">{dates.map(d => <option key={d} value={d}>{new Date(d+'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</option>)}</select>
              <button onClick={() => idx > 0 && setSelectedInvDate(dates[idx - 1])} disabled={idx <= 0} className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg"><ChevronRight className="w-5 h-5" /></button>
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <MetricCard label="Total Units" value={formatNumber(data.summary.totalUnits)} sub={data.summary.skuCount + ' SKUs'} icon={Package} color="blue" />
            <MetricCard label="Total Value" value={formatCurrency(data.summary.totalValue)} icon={DollarSign} color="emerald" />
            <MetricCard label="Amazon FBA" value={formatNumber(data.summary.amazonUnits)} sub={formatCurrency(data.summary.amazonValue)} icon={ShoppingCart} color="orange" />
            <MetricCard label="3PL" value={formatNumber(data.summary.threeplUnits)} sub={formatCurrency(data.summary.threeplValue)} icon={Boxes} color="violet" />
          </div>
          {data.velocitySource && <div className="bg-cyan-900/20 border border-cyan-500/30 rounded-xl p-3 mb-6"><p className="text-cyan-400 text-sm"><span className="font-semibold">Velocity:</span> {data.velocitySource}</p></div>}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4"><div className="flex items-center gap-2 mb-2"><AlertCircle className="w-5 h-5 text-rose-400" /><span className="text-rose-400 font-medium">Critical</span></div><p className="text-2xl font-bold text-white">{data.summary.critical}</p><p className="text-xs text-slate-400">&lt;14 days</p></div>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4"><div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-5 h-5 text-amber-400" /><span className="text-amber-400 font-medium">Low</span></div><p className="text-2xl font-bold text-white">{data.summary.low}</p><p className="text-xs text-slate-400">14-30 days</p></div>
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4"><div className="flex items-center gap-2 mb-2"><CheckCircle className="w-5 h-5 text-emerald-400" /><span className="text-emerald-400 font-medium">Healthy</span></div><p className="text-2xl font-bold text-white">{data.summary.healthy}</p><p className="text-xs text-slate-400">30-90 days</p></div>
            <div className="bg-violet-500/10 border border-violet-500/30 rounded-2xl p-4"><div className="flex items-center gap-2 mb-2"><Clock className="w-5 h-5 text-violet-400" /><span className="text-violet-400 font-medium">Overstock</span></div><p className="text-2xl font-bold text-white">{data.summary.overstock}</p><p className="text-xs text-slate-400">&gt;90 days</p></div>
          </div>
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-slate-700"><h3 className="text-lg font-semibold text-white">Products ({data.items.length})</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-900/50"><tr>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase px-4 py-3">Product</th>
                  <th className="text-right text-xs font-medium text-slate-400 uppercase px-4 py-3">Amazon</th>
                  <th className="text-right text-xs font-medium text-slate-400 uppercase px-4 py-3">3PL</th>
                  <th className="text-right text-xs font-medium text-slate-400 uppercase px-4 py-3">Total</th>
                  <th className="text-right text-xs font-medium text-slate-400 uppercase px-4 py-3">Value</th>
                  <th className="text-right text-xs font-medium text-slate-400 uppercase px-4 py-3">Amz Vel</th>
                  <th className="text-right text-xs font-medium text-slate-400 uppercase px-4 py-3">Shop Vel</th>
                  <th className="text-right text-xs font-medium text-slate-400 uppercase px-4 py-3">Total Vel</th>
                  <th className="text-right text-xs font-medium text-slate-400 uppercase px-4 py-3">Days</th>
                  <th className="text-center text-xs font-medium text-slate-400 uppercase px-4 py-3">Status</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-700/50">
                  {data.items.map((item) => (
                    <tr key={item.sku} className={`hover:bg-slate-700/30 ${item.health === 'critical' ? 'bg-rose-950/20' : item.health === 'low' ? 'bg-amber-950/20' : ''}`}>
                      <td className="px-4 py-3"><div className="max-w-xs"><p className="text-white text-sm font-medium truncate">{item.name}</p><p className="text-slate-500 text-xs">{item.sku}</p></div></td>
                      <td className="text-right px-4 py-3 text-white text-sm">{formatNumber(item.amazonQty)}</td>
                      <td className="text-right px-4 py-3 text-white text-sm">{formatNumber(item.threeplQty)}</td>
                      <td className="text-right px-4 py-3 text-white text-sm font-medium">{formatNumber(item.totalQty)}</td>
                      <td className="text-right px-4 py-3 text-white text-sm">{formatCurrency(item.totalValue)}</td>
                      <td className="text-right px-4 py-3 text-orange-400 text-sm">{(item.amzWeeklyVel || 0).toFixed(1)}</td>
                      <td className="text-right px-4 py-3 text-blue-400 text-sm">{(item.shopWeeklyVel || 0).toFixed(1)}</td>
                      <td className="text-right px-4 py-3 text-white text-sm font-medium">{item.weeklyVel.toFixed(1)}</td>
                      <td className="text-right px-4 py-3 text-white text-sm">{item.daysOfSupply === 999 ? '—' : item.daysOfSupply}</td>
                      <td className="text-center px-4 py-3"><HealthBadge health={item.health} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <div className="min-h-screen bg-slate-950 text-white p-6 flex items-center justify-center"><div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>;
}
