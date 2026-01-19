import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Upload, DollarSign, TrendingUp, TrendingDown, Package, ShoppingCart, BarChart3, Download, Calendar, ChevronLeft, ChevronRight, Trash2, FileSpreadsheet, Check, Database, AlertTriangle, AlertCircle, CheckCircle, Clock, Boxes, RefreshCw, Layers, CalendarRange, Settings, ArrowUpRight, ArrowDownRight, Minus, GitCompare, Trophy, Target, PieChart, Zap, Star, Eye, ShoppingBag, Award, Flame, Snowflake } from 'lucide-react';

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
const STORE_KEY = 'ecommerce_store_name_v1';
const GOALS_KEY = 'ecommerce_goals_v1';

// Supabase (cloud auth + storage)
// Create a .env.local file in your Vite project with:
//   VITE_SUPABASE_URL=...
//   VITE_SUPABASE_ANON_KEY=...
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
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
  const [files, setFiles] = useState({ amazon: null, shopify: null, cogs: null, threepl: [] }); // threepl is now array
  const [fileNames, setFileNames] = useState({ amazon: '', shopify: '', cogs: '', threepl: [] }); // threepl names array
  const [adSpend, setAdSpend] = useState({ meta: '', google: '' });
  const [allWeeksData, setAllWeeksData] = useState({});
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [reprocessPeriod, setReprocessPeriod] = useState(null); // For period reprocessing

  const [storeName, setStoreName] = useState('');

  // Goals & Targets
  const [goals, setGoals] = useState({ weeklyRevenue: 0, weeklyProfit: 0, monthlyRevenue: 0, monthlyProfit: 0 });
  const [showGoalsModal, setShowGoalsModal] = useState(false);

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
// Auto-lock (idle timeout)
const LOCK_MS = 10 * 60 * 1000; // 10 minutes
const ACTIVITY_KEY = "ecomm_last_activity_v1";
const [isLocked, setIsLocked] = useState(false);
const [unlockPassword, setUnlockPassword] = useState("");
const [unlockError, setUnlockError] = useState("");
const lastActivityRef = useRef(Date.now());

const markActivity = useCallback(() => {
  const now = Date.now();
  lastActivityRef.current = now;
  lsSet(ACTIVITY_KEY, String(now));
}, []);

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
  const [periodFiles, setPeriodFiles] = useState({ amazon: null, shopify: null, threepl: [] }); // threepl is array
  const [periodFileNames, setPeriodFileNames] = useState({ amazon: '', shopify: '', threepl: [] }); // threepl names array
  const [periodAdSpend, setPeriodAdSpend] = useState({ meta: '', google: '' });
  const [periodLabel, setPeriodLabel] = useState('');
  const [allPeriodsData, setAllPeriodsData] = useState({});
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  
  const clearPeriod3PLFiles = useCallback(() => {
    setPeriodFiles(p => ({ ...p, threepl: [] }));
    setPeriodFileNames(p => ({ ...p, threepl: [] }));
  }, []);
  
const PERIODS_KEY = 'ecommerce_periods_v1';

const combinedData = useMemo(() => ({
  sales: allWeeksData,
  inventory: invHistory,
  cogs: { lookup: savedCogs, updatedAt: cogsLastUpdated },
  periods: allPeriodsData,
  storeName,
}), [allWeeksData, invHistory, savedCogs, cogsLastUpdated, allPeriodsData, storeName]);

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

  try {
    const r = lsGet(STORE_KEY);
    if (r) setStoreName(r);
  } catch {}

  try {
    const r = lsGet(GOALS_KEY);
    if (r) setGoals(JSON.parse(r));
  } catch {}
}, []);

const saveGoals = useCallback((newGoals) => {
  setGoals(newGoals);
  lsSet(GOALS_KEY, JSON.stringify(newGoals));
  setShowGoalsModal(false);
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

// Store name persistence
useEffect(() => {
  try {
    if (storeName !== undefined) writeToLocal(STORE_KEY, storeName || '');
  } catch {}
  queueCloudSave({ ...combinedData, storeName });
}, [storeName]);

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
    setStoreName(cloud.storeName || '');

    // Also keep localStorage in sync for offline backup
    writeToLocal(STORAGE_KEY, JSON.stringify(cloud.sales || {}));
    writeToLocal(INVENTORY_KEY, JSON.stringify(cloud.inventory || {}));
    writeToLocal(COGS_KEY, JSON.stringify({ lookup: cloud.cogs?.lookup || {}, updatedAt: cloud.cogs?.updatedAt || null }));
    writeToLocal(PERIODS_KEY, JSON.stringify(cloud.periods || {}));
    writeToLocal(STORE_KEY, cloud.storeName || '');
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

// Auto-lock: track activity + idle check
useEffect(() => {
  const saved = parseInt(lsGet(ACTIVITY_KEY) || '0', 10);
  if (saved) lastActivityRef.current = saved;
  const bump = () => markActivity();
  const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
  events.forEach((ev) => window.addEventListener(ev, bump, { passive: true }));
  return () => events.forEach((ev) => window.removeEventListener(ev, bump));
}, [markActivity]);

useEffect(() => {
  if (!session?.user?.id || !supabase) return;
  if (isLocked) return;
  const t = setInterval(() => {
    const last = lastActivityRef.current || parseInt(lsGet(ACTIVITY_KEY) || '0', 10) || Date.now();
    if (Date.now() - last > LOCK_MS) {
      setIsLocked(true);
      setUnlockPassword('');
      setUnlockError('');
    }
  }, 30000);
  return () => clearInterval(t);
}, [session, supabase, isLocked]);

// Manual lock helper
const lockNow = () => {
  setIsLocked(true);
  setUnlockPassword('');
  setUnlockError('');
};

const handleUnlock = async (e) => {
  e.preventDefault();
  setUnlockError('');
  if (!supabase || !session?.user?.email) {
    setUnlockError('Auth not ready');
    return;
  }
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: unlockPassword,
    });
    if (error) throw error;
    setIsLocked(false);
    setUnlockPassword('');
    markActivity();
  } catch (err) {
    setUnlockError(err?.message || 'Unlock failed');
  }
};

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
            storeName: (() => { try { return (lsGet(STORE_KEY) || ''); } catch { return ''; } })(),
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
      else if (type === 'threepl') {
        // 3PL supports multiple files - append to array
        setFiles(p => ({ ...p, threepl: [...(p.threepl || []), data] }));
        setFileNames(p => ({ ...p, threepl: [...(p.threepl || []), file.name] }));
      }
      else { setFiles(p => ({ ...p, [type]: data })); setFileNames(p => ({ ...p, [type]: file.name })); }
    };
    reader.readAsText(file);
  }, []);

  const clear3PLFiles = useCallback(() => {
    setFiles(p => ({ ...p, threepl: [] }));
    setFileNames(p => ({ ...p, threepl: [] }));
  }, []);

  const handlePeriodFile = useCallback((type, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = parseCSV(e.target.result);
      if (type === 'threepl') {
        // 3PL supports multiple files for periods too
        setPeriodFiles(p => ({ ...p, threepl: [...(p.threepl || []), data] }));
        setPeriodFileNames(p => ({ ...p, threepl: [...(p.threepl || []), file.name] }));
      } else {
        setPeriodFiles(p => ({ ...p, [type]: data }));
        setPeriodFileNames(p => ({ ...p, [type]: file.name }));
      }
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
    const threeplBreakdown = { storage: 0, shipping: 0, pickFees: 0, boxCharges: 0, receiving: 0, other: 0 };
    if (reprocessFiles.threepl) reprocessFiles.threepl.forEach(r => { 
      const charge = r['Charge On Invoice'] || '';
      const amount = parseFloat(r['Amount Total ($)'] || 0);
      threeplCost += amount;
      const chargeLower = charge.toLowerCase();
      if (chargeLower.includes('storage')) threeplBreakdown.storage += amount;
      else if (chargeLower.includes('shipping')) threeplBreakdown.shipping += amount;
      else if (chargeLower.includes('pick')) threeplBreakdown.pickFees += amount;
      else if (chargeLower.includes('box') || chargeLower.includes('mailer')) threeplBreakdown.boxCharges += amount;
      else if (chargeLower.includes('receiving')) threeplBreakdown.receiving += amount;
      else threeplBreakdown.other += amount;
    });

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
      shopify: { revenue: shopRev, units: shopUnits, cogs: shopCogs, threeplCosts: threeplCost, threeplBreakdown, adSpend: shopAds, metaSpend: metaS, googleSpend: googleS, discounts: shopDisc, netProfit: shopProfit, 
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
    const threeplBreakdown = { storage: 0, shipping: 0, pickFees: 0, boxCharges: 0, receiving: 0, other: 0 };
    if (files.threepl) files.threepl.forEach(r => { 
      const charge = r['Charge On Invoice'] || '';
      const amount = parseFloat(r['Amount Total ($)'] || 0);
      threeplCost += amount;
      const chargeLower = charge.toLowerCase();
      if (chargeLower.includes('storage')) threeplBreakdown.storage += amount;
      else if (chargeLower.includes('shipping')) threeplBreakdown.shipping += amount;
      else if (chargeLower.includes('pick')) threeplBreakdown.pickFees += amount;
      else if (chargeLower.includes('box') || chargeLower.includes('mailer')) threeplBreakdown.boxCharges += amount;
      else if (chargeLower.includes('receiving')) threeplBreakdown.receiving += amount;
      else threeplBreakdown.other += amount;
    });

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
      shopify: { revenue: shopRev, units: shopUnits, cogs: shopCogs, threeplCosts: threeplCost, threeplBreakdown, adSpend: shopAds, metaSpend: metaS, googleSpend: googleS, discounts: shopDisc, netProfit: shopProfit, 
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
    const threeplBreakdown = { storage: 0, shipping: 0, pickFees: 0, boxCharges: 0, receiving: 0, other: 0 };
    // Handle multiple 3PL files
    const threeplFiles = Array.isArray(periodFiles.threepl) ? periodFiles.threepl : (periodFiles.threepl ? [periodFiles.threepl] : []);
    threeplFiles.forEach(fileData => {
      fileData.forEach(r => { 
        const charge = r['Charge On Invoice'] || '';
        const amount = parseFloat(r['Amount Total ($)'] || 0);
        threeplCost += amount;
        const chargeLower = charge.toLowerCase();
        if (chargeLower.includes('storage')) threeplBreakdown.storage += amount;
        else if (chargeLower.includes('shipping')) threeplBreakdown.shipping += amount;
        else if (chargeLower.includes('pick')) threeplBreakdown.pickFees += amount;
        else if (chargeLower.includes('box') || chargeLower.includes('mailer')) threeplBreakdown.boxCharges += amount;
        else if (chargeLower.includes('receiving')) threeplBreakdown.receiving += amount;
        else threeplBreakdown.other += amount;
      });
    });

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
      shopify: { revenue: shopRev, units: shopUnits, cogs: shopCogs, threeplCosts: threeplCost, threeplBreakdown, adSpend: shopAds, metaSpend: metaS, googleSpend: googleS, discounts: shopDisc, netProfit: shopProfit, 
        netMargin: shopRev > 0 ? (shopProfit/shopRev)*100 : 0, aov: shopUnits > 0 ? shopRev/shopUnits : 0, roas: shopAds > 0 ? shopRev/shopAds : 0, skuData: shopifySkus },
      total: { revenue: totalRev, units: amzUnits + shopUnits, cogs: totalCogs, adSpend: amzAds + shopAds, netProfit: totalProfit, netMargin: totalRev > 0 ? (totalProfit/totalRev)*100 : 0, roas: (amzAds + shopAds) > 0 ? totalRev/(amzAds + shopAds) : 0, amazonShare: totalRev > 0 ? (amzRev/totalRev)*100 : 0, shopifyShare: totalRev > 0 ? (shopRev/totalRev)*100 : 0 }
    };

    const periodKey = periodLabel.trim().toLowerCase().replace(/\s+/g, '-');
    const updated = { ...allPeriodsData, [periodKey]: periodData };
    setAllPeriodsData(updated); savePeriods(updated); setSelectedPeriod(periodKey); setView('period-view'); setIsProcessing(false);
    setPeriodFiles({ amazon: null, shopify: null, threepl: [] }); setPeriodFileNames({ amazon: '', shopify: '', threepl: [] }); setPeriodAdSpend({ meta: '', google: '' }); setPeriodLabel('');
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

  const exportAll = () => { const blob = new Blob([JSON.stringify({ sales: allWeeksData, inventory: invHistory, cogs: savedCogs, periods: allPeriodsData, goals, storeName }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${storeName || 'dashboard'}_backup_${new Date().toISOString().split('T')[0]}.json`; a.click(); };
  const importData = (file) => { const reader = new FileReader(); reader.onload = async (e) => { try { const d = JSON.parse(e.target.result); if (d.sales) { setAllWeeksData({...allWeeksData, ...d.sales}); await save({...allWeeksData, ...d.sales}); } if (d.inventory) { setInvHistory({...invHistory, ...d.inventory}); await saveInv({...invHistory, ...d.inventory}); } if (d.cogs) { setSavedCogs(d.cogs); await saveCogs(d.cogs); } if (d.periods) { setAllPeriodsData({...allPeriodsData, ...d.periods}); await savePeriods({...allPeriodsData, ...d.periods}); } if (d.goals) { setGoals(d.goals); lsSet(GOALS_KEY, JSON.stringify(d.goals)); } if (d.storeName) { setStoreName(d.storeName); lsSet(STORE_KEY, d.storeName); } alert('Imported!'); } catch { alert('Invalid file'); }}; reader.readAsText(file); };

// If logged in but locked, require password to continue
if (supabase && isAuthReady && session && isLocked) {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-violet-500 flex items-center justify-center">
            <Clock className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Unlock Dashboard</h1>
            <p className="text-slate-400 text-sm">Session locked after 10 minutes of inactivity.</p>
          </div>
        </div>

        <form onSubmit={handleUnlock} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Password</label>
            <input value={unlockPassword} onChange={(e) => setUnlockPassword(e.target.value)} type="password" required
              className="w-full rounded-xl bg-slate-950/60 border border-slate-700 px-3 py-2 outline-none focus:border-violet-500" />
          </div>

          {unlockError && (
            <div className="text-sm text-rose-300 bg-rose-950/30 border border-rose-900/50 rounded-xl p-3">
              {unlockError}
            </div>
          )}

          <button type="submit" className="w-full rounded-xl bg-violet-500 hover:bg-violet-400 text-slate-950 font-semibold py-2">
            Unlock
          </button>

          <button type="button" onClick={handleLogout}
            className="w-full rounded-xl border border-slate-700 hover:border-slate-500 text-slate-200 py-2">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}

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

// Locked screen (session exists, password recheck)
if (supabase && isAuthReady && session && isLocked) {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-violet-500 flex items-center justify-center">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Locked</h1>
            <p className="text-slate-400 text-sm">Enter your password to continue.</p>
          </div>
        </div>

        <form onSubmit={handleUnlock} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Password</label>
            <input
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
              type="password"
              required
              className="w-full rounded-xl bg-slate-950/60 border border-slate-700 px-3 py-2 outline-none focus:border-violet-500"
            />
          </div>

          {unlockError && (
            <div className="text-sm text-rose-300 bg-rose-950/30 border border-rose-900/50 rounded-xl p-3">
              {unlockError}
            </div>
          )}

          <button type="submit" className="w-full rounded-xl bg-violet-500 hover:bg-violet-400 text-slate-950 font-semibold py-2">
            Unlock
          </button>

          <button type="button" onClick={handleLogout} className="w-full rounded-xl border border-slate-700 hover:border-slate-500 text-slate-200 py-2">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
  // UI Components
  const FileBox = ({ type, label, desc, req, isInv }) => {
    const fs = isInv ? invFiles : files, fn = isInv ? invFileNames : fileNames;
    const isMulti3PL = type === 'threepl' && !isInv;
    const hasFile = isMulti3PL ? (fs.threepl?.length > 0) : fs[type];
    const displayName = isMulti3PL ? (fn.threepl?.length > 0 ? `${fn.threepl.length} file(s)` : '') : fn[type];
    
    return (
      <div className={`relative border-2 border-dashed rounded-xl p-4 ${hasFile ? 'border-emerald-400 bg-emerald-950/30' : 'border-slate-600 hover:border-slate-400 bg-slate-800/30'}`}>
        <input type="file" accept=".csv" onChange={(e) => handleFile(type, e.target.files[0], isInv)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${hasFile ? 'bg-emerald-500' : 'bg-slate-700'}`}>
            {hasFile ? <Check className="w-5 h-5 text-white" /> : <FileSpreadsheet className="w-5 h-5 text-slate-300" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2"><span className="font-medium text-white text-sm">{label}</span>{req && <span className="text-xs text-rose-400">*</span>}{isMulti3PL && <span className="text-xs text-cyan-400">(multi)</span>}</div>
            {hasFile ? (
              <div className="flex items-center gap-2">
                <p className="text-xs text-emerald-400 truncate">{displayName}</p>
                {isMulti3PL && fn.threepl?.length > 0 && (
                  <button onClick={(e) => { e.stopPropagation(); clear3PLFiles(); }} className="text-xs text-rose-400 hover:text-rose-300">Clear</button>
                )}
              </div>
            ) : <p className="text-xs text-slate-500">{desc}</p>}
          </div>
        </div>
        {isMulti3PL && fn.threepl?.length > 0 && (
          <div className="mt-2 text-xs text-slate-400">
            {fn.threepl.map((name, i) => <div key={i} className="truncate">• {name}</div>)}
          </div>
        )}
      </div>
    );
  };

  // Period FileBox with multi-3PL support
  const PeriodFileBox = ({ type, label, desc, req }) => {
    const isMulti3PL = type === 'threepl';
    const hasFile = isMulti3PL ? (periodFiles.threepl?.length > 0) : periodFiles[type];
    const displayName = isMulti3PL ? (periodFileNames.threepl?.length > 0 ? `${periodFileNames.threepl.length} file(s)` : '') : periodFileNames[type];
    
    return (
      <div className={`relative border-2 border-dashed rounded-xl p-4 ${hasFile ? 'border-emerald-400 bg-emerald-950/30' : 'border-slate-600 hover:border-slate-400 bg-slate-800/30'}`}>
        <input type="file" accept=".csv" onChange={(e) => handlePeriodFile(type, e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${hasFile ? 'bg-emerald-500' : 'bg-slate-700'}`}>
            {hasFile ? <Check className="w-5 h-5 text-white" /> : <FileSpreadsheet className="w-5 h-5 text-slate-300" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2"><span className="font-medium text-white text-sm">{label}</span>{req && <span className="text-xs text-rose-400">*</span>}{isMulti3PL && <span className="text-xs text-cyan-400">(multi)</span>}</div>
            {hasFile ? (
              <div className="flex items-center gap-2">
                <p className="text-xs text-emerald-400 truncate">{displayName}</p>
                {isMulti3PL && periodFileNames.threepl?.length > 0 && (
                  <button onClick={(e) => { e.stopPropagation(); clearPeriod3PLFiles(); }} className="text-xs text-rose-400 hover:text-rose-300">Clear</button>
                )}
              </div>
            ) : <p className="text-xs text-slate-500">{desc}</p>}
          </div>
        </div>
        {isMulti3PL && periodFileNames.threepl?.length > 0 && (
          <div className="mt-2 text-xs text-slate-400">
            {periodFileNames.threepl.map((name, i) => <div key={i} className="truncate">• {name}</div>)}
          </div>
        )}
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
    const [show3plBreakdown, setShow3plBreakdown] = useState(false);
    const skuData = data.skuData || [];
    const threeplBreakdown = data.threeplBreakdown || {};
    const has3plData = !isAmz && (data.threeplCosts > 0);
    const has3plBreakdown = has3plData && Object.values(threeplBreakdown).some(v => v > 0);
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
            <div>
              <p className="text-slate-500 text-xs uppercase mb-1">{isAmz ? 'Fees' : '3PL Costs'}</p>
              <p className="text-lg font-semibold text-white">{formatCurrency(isAmz ? data.fees : data.threeplCosts)}</p>
              {has3plData && <button onClick={() => setShow3plBreakdown(!show3plBreakdown)} className="text-xs text-blue-400 hover:text-blue-300">{show3plBreakdown ? 'Hide' : 'Details'}</button>}
            </div>
            <div><p className="text-slate-500 text-xs uppercase mb-1">Ad Spend</p><p className="text-lg font-semibold text-white">{formatCurrency(data.adSpend)}</p></div>
            <div><p className="text-slate-500 text-xs uppercase mb-1">TACOS</p><p className="text-lg font-semibold text-white">{(data.roas || 0).toFixed(2)}x</p></div>
          </div>
          {/* 3PL Breakdown */}
          {show3plBreakdown && has3plData && (
            <div className="bg-slate-900/50 rounded-xl p-4 mb-4">
              <h4 className="text-sm font-semibold text-slate-300 mb-3">3PL Cost Breakdown</h4>
              {has3plBreakdown ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {threeplBreakdown.shipping > 0 && <div className="flex justify-between"><span className="text-slate-400 text-sm">Shipping</span><span className="text-white text-sm">{formatCurrency(threeplBreakdown.shipping)}</span></div>}
                  {threeplBreakdown.pickFees > 0 && <div className="flex justify-between"><span className="text-slate-400 text-sm">Pick Fees</span><span className="text-white text-sm">{formatCurrency(threeplBreakdown.pickFees)}</span></div>}
                  {threeplBreakdown.storage > 0 && <div className="flex justify-between"><span className="text-slate-400 text-sm">Storage</span><span className="text-white text-sm">{formatCurrency(threeplBreakdown.storage)}</span></div>}
                  {threeplBreakdown.boxCharges > 0 && <div className="flex justify-between"><span className="text-slate-400 text-sm">Box/Mailer</span><span className="text-white text-sm">{formatCurrency(threeplBreakdown.boxCharges)}</span></div>}
                  {threeplBreakdown.receiving > 0 && <div className="flex justify-between"><span className="text-slate-400 text-sm">Receiving</span><span className="text-white text-sm">{formatCurrency(threeplBreakdown.receiving)}</span></div>}
                  {threeplBreakdown.other > 0 && <div className="flex justify-between"><span className="text-slate-400 text-sm">Other</span><span className="text-white text-sm">{formatCurrency(threeplBreakdown.other)}</span></div>}
                </div>
              ) : (
                <p className="text-slate-500 text-sm">No breakdown available. Re-process this week with a 3PL CSV to see the breakdown.</p>
              )}
            </div>
          )}
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

  // Reusable Goals Progress Card
  const GoalsCard = ({ weekRevenue = 0, weekProfit = 0, monthRevenue = 0, monthProfit = 0, monthLabel = '' }) => {
    const hasGoals = goals.weeklyRevenue > 0 || goals.weeklyProfit > 0 || goals.monthlyRevenue > 0 || goals.monthlyProfit > 0;
    if (!hasGoals) return null;
    
    const ProgressBar = ({ current, target, label }) => {
      if (!target || target <= 0) return null;
      const pct = Math.min((current / target) * 100, 100);
      const hit = current >= target;
      return (
        <div className="mb-3">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-slate-400">{label}</span>
            <span className="text-white">{formatCurrency(current)} / {formatCurrency(target)}</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div className={`h-full transition-all ${hit ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
          </div>
          <p className={`text-xs mt-0.5 ${hit ? 'text-emerald-400' : 'text-amber-400'}`}>{pct.toFixed(0)}% {hit && '🎉'}</p>
        </div>
      );
    };
    
    return (
      <div className="bg-gradient-to-br from-amber-900/20 to-slate-800/50 rounded-xl border border-amber-500/30 p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-amber-400 font-semibold flex items-center gap-2"><Target className="w-4 h-4" />Goals Progress</h3>
          <button onClick={() => setShowGoalsModal(true)} className="text-xs text-slate-400 hover:text-white">Edit</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {goals.weeklyRevenue > 0 && <ProgressBar current={weekRevenue} target={goals.weeklyRevenue} label="Weekly Revenue" />}
          {goals.weeklyProfit > 0 && <ProgressBar current={weekProfit} target={goals.weeklyProfit} label="Weekly Profit" />}
          {goals.monthlyRevenue > 0 && <ProgressBar current={monthRevenue} target={goals.monthlyRevenue} label={monthLabel ? `${monthLabel} Revenue` : 'Monthly Revenue'} />}
          {goals.monthlyProfit > 0 && <ProgressBar current={monthProfit} target={goals.monthlyProfit} label={monthLabel ? `${monthLabel} Profit` : 'Monthly Profit'} />}
        </div>
      </div>
    );
  };

  const NavTabs = () => (
    <div className="flex flex-wrap gap-2 mb-6 p-1 bg-slate-800/50 rounded-xl">
      <button onClick={() => setView('upload')} className={`px-3 py-2 rounded-lg text-sm font-medium ${view === 'upload' ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><Upload className="w-4 h-4 inline mr-1" />Weekly</button>
      <button onClick={() => setView('period-upload')} className={`px-3 py-2 rounded-lg text-sm font-medium ${view === 'period-upload' || view === 'period-view' ? 'bg-teal-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><CalendarRange className="w-4 h-4 inline mr-1" />Period</button>
      <button onClick={() => { const w = Object.keys(allWeeksData).sort().reverse(); if (w.length) { setSelectedWeek(w[0]); setView('weekly'); }}} disabled={!Object.keys(allWeeksData).length} className={`px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${view === 'weekly' ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><Calendar className="w-4 h-4 inline mr-1" />View Weeks</button>
      <button onClick={() => { const p = Object.keys(allPeriodsData).sort().reverse(); if (p.length) { setSelectedPeriod(p[0]); setView('period-view'); }}} disabled={!Object.keys(allPeriodsData).length} className={`px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${view === 'period-view' ? 'bg-teal-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><BarChart3 className="w-4 h-4 inline mr-1" />View Periods</button>
      <div className="w-px bg-slate-600 mx-1" />
      <button onClick={() => setView('trends')} disabled={Object.keys(allWeeksData).length < 2} className={`px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${view === 'trends' ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><TrendingUp className="w-4 h-4 inline mr-1" />Trends</button>
      <button onClick={() => setView('yoy')} disabled={Object.keys(allWeeksData).length < 2} className={`px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${view === 'yoy' ? 'bg-amber-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><GitCompare className="w-4 h-4 inline mr-1" />YoY</button>
      <button onClick={() => setView('skus')} disabled={Object.keys(allWeeksData).length < 1} className={`px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${view === 'skus' ? 'bg-pink-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><Trophy className="w-4 h-4 inline mr-1" />SKUs</button>
      <button onClick={() => setView('profitability')} disabled={Object.keys(allWeeksData).length < 1} className={`px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${view === 'profitability' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><PieChart className="w-4 h-4 inline mr-1" />Profit</button>
      <button onClick={() => setView('ads')} disabled={Object.keys(allWeeksData).length < 1} className={`px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${view === 'ads' ? 'bg-purple-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><Zap className="w-4 h-4 inline mr-1" />Ads</button>
      <div className="w-px bg-slate-600 mx-1" />
      <button onClick={() => setView('inv-upload')} className={`px-3 py-2 rounded-lg text-sm font-medium ${view === 'inventory' || view === 'inv-upload' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><Boxes className="w-4 h-4 inline mr-1" />Inventory</button>
    </div>
  );

  const dataBar = useMemo(() => (
    <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
      <div className="flex items-center gap-2 text-slate-400 text-sm"><Database className="w-4 h-4" /><span>{Object.keys(allWeeksData).length} weeks | {Object.keys(allPeriodsData).length} periods</span></div>
      <div className="flex items-center gap-2">
        {Object.keys(savedCogs).length > 0 ? <span className="text-emerald-400 text-xs flex items-center gap-1"><Check className="w-3 h-3" />{Object.keys(savedCogs).length} SKUs</span> : <span className="text-amber-400 text-xs">No COGS</span>}
        <button onClick={() => setShowCogsManager(true)} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white flex items-center gap-1"><Settings className="w-3 h-3" />COGS</button>
      </div>
      <button onClick={() => setShowGoalsModal(true)} className="px-2 py-1 bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/50 rounded text-xs text-amber-300 flex items-center gap-1"><Target className="w-3 h-3" />Goals</button>
      <div className="flex items-center gap-2">
        <span className="text-slate-400 text-sm">Store:</span>
        <input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Your brand name"
          className="bg-slate-900 border border-slate-600 rounded-lg px-2 py-1 text-sm text-white w-44" />
      </div>
      <div className="flex-1" />
      <button onClick={exportAll} className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white"><Download className="w-4 h-4" />Export</button>
      <label className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white cursor-pointer"><Upload className="w-4 h-4" />Import<input type="file" accept=".json" onChange={(e) => e.target.files[0] && importData(e.target.files[0])} className="hidden" /></label>
    </div>
  ), [allWeeksData, allPeriodsData, savedCogs, storeName, isLocked, cloudStatus, session]);

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

  const GoalsModal = () => {
    const [tempGoals, setTempGoals] = useState(goals);
    if (!showGoalsModal) return null;
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-md w-full">
          <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2"><Target className="w-6 h-6 text-amber-400" />Set Goals</h2>
          <p className="text-slate-400 text-sm mb-4">Set revenue and profit targets to track your progress</p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1">Weekly Revenue Target</label>
              <input type="number" value={tempGoals.weeklyRevenue || ''} onChange={(e) => setTempGoals(p => ({ ...p, weeklyRevenue: parseFloat(e.target.value) || 0 }))} placeholder="e.g., 5000" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white" />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Weekly Profit Target</label>
              <input type="number" value={tempGoals.weeklyProfit || ''} onChange={(e) => setTempGoals(p => ({ ...p, weeklyProfit: parseFloat(e.target.value) || 0 }))} placeholder="e.g., 1500" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white" />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Monthly Revenue Target</label>
              <input type="number" value={tempGoals.monthlyRevenue || ''} onChange={(e) => setTempGoals(p => ({ ...p, monthlyRevenue: parseFloat(e.target.value) || 0 }))} placeholder="e.g., 20000" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white" />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Monthly Profit Target</label>
              <input type="number" value={tempGoals.monthlyProfit || ''} onChange={(e) => setTempGoals(p => ({ ...p, monthlyProfit: parseFloat(e.target.value) || 0 }))} placeholder="e.g., 6000" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white" />
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={() => saveGoals(tempGoals)} className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2 rounded-xl">Save Goals</button>
            <button onClick={() => setShowGoalsModal(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-xl">Cancel</button>
          </div>
        </div>
      </div>
    );
  };

  const hasCogs = Object.keys(savedCogs).length > 0;

  // VIEWS
  if (view === 'upload') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-6">
        <div className="max-w-3xl mx-auto"><Toast /><CogsManager /><GoalsModal />
          <div className="text-center mb-8"><div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 mb-4"><BarChart3 className="w-8 h-8 text-white" /></div><h1 className="text-3xl font-bold text-white mb-2">{storeName ? storeName + ' Weekly Upload' : 'Weekly Sales Upload'}</h1></div>
          <NavTabs />{dataBar}
          <GoalsCard 
            weekRevenue={Object.keys(allWeeksData).length > 0 ? allWeeksData[Object.keys(allWeeksData).sort().reverse()[0]]?.total?.revenue || 0 : 0}
            weekProfit={Object.keys(allWeeksData).length > 0 ? allWeeksData[Object.keys(allWeeksData).sort().reverse()[0]]?.total?.netProfit || 0 : 0}
          />
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
        <div className="max-w-3xl mx-auto"><Toast /><CogsManager /><GoalsModal />
          <div className="text-center mb-8"><div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 mb-4"><Layers className="w-8 h-8 text-white" /></div><h1 className="text-3xl font-bold text-white mb-2">Bulk Import</h1><p className="text-slate-400">Auto-splits into weeks</p></div>
          <NavTabs />{dataBar}
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
        <div className="max-w-3xl mx-auto"><Toast /><CogsManager /><GoalsModal />
          <div className="text-center mb-8"><div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-4"><CalendarRange className="w-8 h-8 text-white" /></div><h1 className="text-3xl font-bold text-white mb-2">Custom Period</h1></div>
          <NavTabs />{dataBar}
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
        <div className="max-w-7xl mx-auto"><Toast /><CogsManager /><GoalsModal />
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
        <div className="max-w-7xl mx-auto"><Toast /><CogsManager /><GoalsModal />
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
            <div><h1 className="text-2xl lg:text-3xl font-bold text-white">{storeName ? storeName + ' Dashboard' : 'Weekly Performance'}</h1><p className="text-slate-400">Week ending {new Date(selectedWeek+'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p></div>
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
            <MetricCard label="Ad Spend" value={formatCurrency(data.total.adSpend)} sub={`${(data.total.roas || 0).toFixed(2)}x TACOS`} icon={BarChart3} color="violet" />
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
        <div className="max-w-7xl mx-auto"><Toast /><CogsManager /><GoalsModal />
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
        <div className="max-w-7xl mx-auto"><Toast /><CogsManager /><GoalsModal />
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
    const PeriodFileBoxLocal = ({ type, label, desc, req }) => {
      const isMulti3PL = type === 'threepl';
      const hasFile = isMulti3PL ? (periodFiles.threepl?.length > 0) : periodFiles[type];
      const displayName = isMulti3PL ? (periodFileNames.threepl?.length > 0 ? `${periodFileNames.threepl.length} file(s)` : '') : periodFileNames[type];
      
      return (
        <div className={`relative border-2 border-dashed rounded-xl p-4 ${hasFile ? 'border-emerald-400 bg-emerald-950/30' : 'border-slate-600 hover:border-slate-400 bg-slate-800/30'}`}>
          <input type="file" accept=".csv" onChange={(e) => handlePeriodFile(type, e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${hasFile ? 'bg-emerald-500' : 'bg-slate-700'}`}>
              {hasFile ? <Check className="w-5 h-5 text-white" /> : <FileSpreadsheet className="w-5 h-5 text-slate-300" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2"><span className="font-medium text-white text-sm">{label}</span>{req && <span className="text-xs text-rose-400">*</span>}{isMulti3PL && <span className="text-xs text-cyan-400">(+add more)</span>}</div>
              {hasFile ? (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-emerald-400 truncate">{displayName}</p>
                  {isMulti3PL && periodFileNames.threepl?.length > 0 && (
                    <button onClick={(e) => { e.stopPropagation(); clearPeriod3PLFiles(); }} className="text-xs text-rose-400 hover:text-rose-300">Clear</button>
                  )}
                </div>
              ) : <p className="text-xs text-slate-500">{desc}</p>}
            </div>
          </div>
          {isMulti3PL && periodFileNames.threepl?.length > 0 && (
            <div className="mt-2 text-xs text-slate-400">
              {periodFileNames.threepl.map((name, i) => <div key={i} className="truncate">• {name}</div>)}
            </div>
          )}
        </div>
      );
    };
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-6">
        <div className="max-w-3xl mx-auto"><Toast /><CogsManager /><GoalsModal />
          <div className="text-center mb-8"><div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 mb-4"><CalendarRange className="w-8 h-8 text-white" /></div><h1 className="text-3xl font-bold text-white mb-2">Period Upload</h1><p className="text-slate-400">Upload monthly or yearly totals (no weekly breakdown)</p></div>
          <NavTabs />{dataBar}
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
              <PeriodFileBoxLocal type="amazon" label="Amazon Report" desc="Full period CSV" req />
              <PeriodFileBoxLocal type="shopify" label="Shopify Sales" desc="Full period CSV" req />
              <PeriodFileBoxLocal type="threepl" label="3PL Costs" desc="Optional - click to add multiple" />
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
        <div className="max-w-7xl mx-auto"><Toast /><CogsManager /><GoalsModal />
          {/* Period Reprocess Modal */}
          {reprocessPeriod && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-md w-full">
                <h2 className="text-xl font-bold text-white mb-2">Update Period: {allPeriodsData[reprocessPeriod]?.label}</h2>
                <p className="text-slate-400 text-sm mb-4">Add or update 3PL costs and ad spend for this period</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-300 mb-2">3PL Cost Files (click multiple times to add)</label>
                    <div className={`relative border-2 border-dashed rounded-xl p-4 ${periodFiles.threepl?.length > 0 ? 'border-emerald-400 bg-emerald-950/30' : 'border-slate-600 hover:border-slate-400 bg-slate-800/30'}`}>
                      <input type="file" accept=".csv" onChange={(e) => handlePeriodFile('threepl', e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                      <div className="text-center">
                        {periodFileNames.threepl?.length > 0 ? (
                          <div>
                            <p className="text-emerald-400 text-sm">{periodFileNames.threepl.length} file(s) selected</p>
                            {periodFileNames.threepl.map((n, i) => <p key={i} className="text-xs text-slate-400 truncate">• {n}</p>)}
                            <button onClick={(e) => { e.stopPropagation(); clearPeriod3PLFiles(); }} className="text-xs text-rose-400 mt-2">Clear all</button>
                          </div>
                        ) : (
                          <p className="text-slate-500 text-sm">Click to add 3PL files</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-slate-300 mb-1">Meta Ad Spend</label>
                      <input type="number" value={periodAdSpend.meta} onChange={(e) => setPeriodAdSpend(p => ({ ...p, meta: e.target.value }))} placeholder={String(allPeriodsData[reprocessPeriod]?.shopify?.metaSpend || 0)} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white" />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-300 mb-1">Google Ad Spend</label>
                      <input type="number" value={periodAdSpend.google} onChange={(e) => setPeriodAdSpend(p => ({ ...p, google: e.target.value }))} placeholder={String(allPeriodsData[reprocessPeriod]?.shopify?.googleSpend || 0)} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white" />
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button onClick={() => {
                    const existing = allPeriodsData[reprocessPeriod];
                    if (!existing) return;
                    
                    // Calculate new 3PL costs from uploaded files
                    let newThreeplCost = existing.shopify?.threeplCosts || 0;
                    const newBreakdown = { ...(existing.shopify?.threeplBreakdown || { storage: 0, shipping: 0, pickFees: 0, boxCharges: 0, receiving: 0, other: 0 }) };
                    
                    if (periodFiles.threepl?.length > 0) {
                      newThreeplCost = 0;
                      Object.keys(newBreakdown).forEach(k => newBreakdown[k] = 0);
                      periodFiles.threepl.forEach(fileData => {
                        fileData.forEach(r => {
                          const charge = r['Charge On Invoice'] || '';
                          const amount = parseFloat(r['Amount Total ($)'] || 0);
                          newThreeplCost += amount;
                          const chargeLower = charge.toLowerCase();
                          if (chargeLower.includes('storage')) newBreakdown.storage += amount;
                          else if (chargeLower.includes('shipping')) newBreakdown.shipping += amount;
                          else if (chargeLower.includes('pick')) newBreakdown.pickFees += amount;
                          else if (chargeLower.includes('box') || chargeLower.includes('mailer')) newBreakdown.boxCharges += amount;
                          else if (chargeLower.includes('receiving')) newBreakdown.receiving += amount;
                          else newBreakdown.other += amount;
                        });
                      });
                    }
                    
                    // Update ad spend if provided
                    const newMeta = periodAdSpend.meta ? parseFloat(periodAdSpend.meta) : (existing.shopify?.metaSpend || 0);
                    const newGoogle = periodAdSpend.google ? parseFloat(periodAdSpend.google) : (existing.shopify?.googleSpend || 0);
                    const newShopAds = newMeta + newGoogle;
                    
                    // Recalculate profit
                    const shopRev = existing.shopify?.revenue || 0;
                    const shopCogs = existing.shopify?.cogs || 0;
                    const newShopProfit = shopRev - shopCogs - newThreeplCost - newShopAds;
                    const amzProfit = existing.amazon?.netProfit || 0;
                    const totalRev = existing.total?.revenue || 0;
                    const newTotalProfit = amzProfit + newShopProfit;
                    
                    const updated = {
                      ...allPeriodsData,
                      [reprocessPeriod]: {
                        ...existing,
                        shopify: {
                          ...existing.shopify,
                          threeplCosts: newThreeplCost,
                          threeplBreakdown: newBreakdown,
                          metaSpend: newMeta,
                          googleSpend: newGoogle,
                          adSpend: newShopAds,
                          netProfit: newShopProfit,
                          netMargin: shopRev > 0 ? (newShopProfit / shopRev) * 100 : 0,
                        },
                        total: {
                          ...existing.total,
                          adSpend: (existing.amazon?.adSpend || 0) + newShopAds,
                          netProfit: newTotalProfit,
                          netMargin: totalRev > 0 ? (newTotalProfit / totalRev) * 100 : 0,
                        }
                      }
                    };
                    setAllPeriodsData(updated);
                    savePeriods(updated);
                    setReprocessPeriod(null);
                    setPeriodFiles(p => ({ ...p, threepl: [] }));
                    setPeriodFileNames(p => ({ ...p, threepl: [] }));
                    setPeriodAdSpend({ meta: '', google: '' });
                  }} className="flex-1 bg-teal-600 hover:bg-teal-500 text-white font-semibold py-2 rounded-xl">Update Period</button>
                  <button onClick={() => { setReprocessPeriod(null); clearPeriod3PLFiles(); setPeriodAdSpend({ meta: '', google: '' }); }} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-xl">Cancel</button>
                </div>
              </div>
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div><h1 className="text-2xl lg:text-3xl font-bold text-white">{data.label}</h1><p className="text-slate-400">Period Performance</p></div>
            <div className="flex gap-2">
              <button onClick={() => setReprocessPeriod(selectedPeriod)} className="bg-cyan-700 hover:bg-cyan-600 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-1"><RefreshCw className="w-4 h-4" />Update 3PL/Ads</button>
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
            <MetricCard label="Ad Spend" value={formatCurrency(data.total.adSpend)} sub={`${(data.total.roas || 0).toFixed(2)}x TACOS`} icon={BarChart3} color="violet" />
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
        <div className="max-w-3xl mx-auto"><Toast /><CogsManager /><GoalsModal />
          <div className="text-center mb-8"><div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 mb-4"><Boxes className="w-8 h-8 text-white" /></div><h1 className="text-3xl font-bold text-white mb-2">Inventory Tracker</h1></div>
          <NavTabs />{dataBar}
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
        <div className="max-w-7xl mx-auto"><Toast /><CogsManager /><GoalsModal />
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
          {/* Reorder Alert - Items with less than 120 days supply */}
          {(() => {
            const lowStock = data.items.filter(item => item.daysOfSupply !== 999 && item.daysOfSupply < 120 && item.daysOfSupply > 0);
            if (lowStock.length === 0) return null;
            const criticalItems = lowStock.filter(i => i.daysOfSupply < 30);
            const warningItems = lowStock.filter(i => i.daysOfSupply >= 30 && i.daysOfSupply < 60);
            const watchItems = lowStock.filter(i => i.daysOfSupply >= 60 && i.daysOfSupply < 120);
            return (
              <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-amber-400 font-semibold mb-1">📦 Reorder Alert: Less Than 120 Days Supply</h4>
                    <p className="text-slate-300 text-sm mb-3">
                      {lowStock.length} SKU{lowStock.length > 1 ? 's' : ''} running low on inventory
                      {criticalItems.length > 0 && <span className="text-rose-400 ml-2">({criticalItems.length} critical!)</span>}
                    </p>
                    <div className="bg-slate-900/50 rounded-lg p-3 max-h-48 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-slate-500 text-xs">
                            <th className="text-left pb-2">SKU</th>
                            <th className="text-right pb-2">Qty</th>
                            <th className="text-right pb-2">Velocity/wk</th>
                            <th className="text-right pb-2">Days Left</th>
                            <th className="text-left pb-2 pl-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lowStock.sort((a, b) => a.daysOfSupply - b.daysOfSupply).slice(0, 15).map(item => (
                            <tr key={item.sku} className="border-t border-slate-700/50">
                              <td className="py-1.5 text-white max-w-[150px] truncate" title={item.name}>{item.sku}</td>
                              <td className="py-1.5 text-right text-white">{formatNumber(item.totalQty)}</td>
                              <td className="py-1.5 text-right text-slate-400">{item.weeklyVel.toFixed(1)}</td>
                              <td className={`py-1.5 text-right font-semibold ${item.daysOfSupply < 30 ? 'text-rose-400' : item.daysOfSupply < 60 ? 'text-amber-400' : 'text-yellow-400'}`}>{item.daysOfSupply}</td>
                              <td className="py-1.5 pl-2">
                                {item.daysOfSupply < 30 ? <span className="text-xs bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded">CRITICAL</span> :
                                 item.daysOfSupply < 60 ? <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">ORDER NOW</span> :
                                 <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">WATCH</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {lowStock.length > 15 && <p className="text-slate-500 text-xs mt-2">+ {lowStock.length - 15} more...</p>}
                    </div>
                    <div className="flex gap-4 mt-3 text-xs">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 bg-rose-500 rounded" />&lt;30 days: {criticalItems.length}</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-500 rounded" />30-60 days: {warningItems.length}</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 bg-yellow-500 rounded" />60-120 days: {watchItems.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
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

  // ==================== TRENDS VIEW ====================
  if (view === 'trends') {
    const sortedWeeks = Object.keys(allWeeksData).sort();
    const recentWeeks = sortedWeeks.slice(-12); // Last 12 weeks
    const weeklyData = recentWeeks.map(w => ({ week: w, ...allWeeksData[w] }));
    
    // Calculate week-over-week changes
    const latestWeek = weeklyData[weeklyData.length - 1];
    const prevWeek = weeklyData[weeklyData.length - 2];
    const fourWeeksAgo = weeklyData[weeklyData.length - 5];
    
    const calcChange = (current, previous) => {
      if (!previous || previous === 0) return null;
      return ((current - previous) / previous) * 100;
    };
    
    const ChangeIndicator = ({ current, previous, format = 'currency' }) => {
      const change = calcChange(current, previous);
      if (change === null) return <span className="text-slate-500 text-sm">—</span>;
      const isPositive = change > 0;
      const isNeutral = Math.abs(change) < 0.5;
      const color = isNeutral ? 'text-slate-400' : isPositive ? 'text-emerald-400' : 'text-rose-400';
      const Icon = isNeutral ? Minus : isPositive ? ArrowUpRight : ArrowDownRight;
      return (
        <span className={`flex items-center gap-1 text-sm ${color}`}>
          <Icon className="w-4 h-4" />
          {Math.abs(change).toFixed(1)}%
        </span>
      );
    };
    
    // Rolling 4-week averages
    const calcRolling = (weeks, field, subfield) => {
      if (weeks.length < 4) return null;
      const last4 = weeks.slice(-4);
      const sum = last4.reduce((acc, w) => acc + (subfield ? w[field]?.[subfield] : w[field]) || 0, 0);
      return sum / 4;
    };
    
    // Monthly aggregation
    const monthlyData = {};
    sortedWeeks.forEach(w => {
      const month = w.substring(0, 7); // YYYY-MM
      if (!monthlyData[month]) monthlyData[month] = { revenue: 0, profit: 0, units: 0, weeks: 0 };
      monthlyData[month].revenue += allWeeksData[w].total?.revenue || 0;
      monthlyData[month].profit += allWeeksData[w].total?.netProfit || 0;
      monthlyData[month].units += allWeeksData[w].total?.units || 0;
      monthlyData[month].weeks += 1;
    });
    const months = Object.keys(monthlyData).sort().slice(-6);
    
    // Find max values for chart scaling
    const maxRevenue = Math.max(...weeklyData.map(w => w.total?.revenue || 0));
    const maxProfit = Math.max(...weeklyData.map(w => Math.abs(w.total?.netProfit || 0)));
    const maxMonthlyRev = Math.max(...months.map(m => monthlyData[m].revenue));
    
    return (
      <div className="min-h-screen bg-slate-950 p-4 lg:p-6">
        <div className="max-w-7xl mx-auto"><Toast /><CogsManager /><GoalsModal />
          <NavTabs />
          {dataBar}
          
          <div className="mb-6">
            <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">📈 Trends Dashboard</h1>
            <p className="text-slate-400">Performance trends and week-over-week analysis</p>
          </div>
          
          {/* Week-over-Week Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm mb-1">Revenue (This Week)</p>
              <p className="text-2xl font-bold text-white">{formatCurrency(latestWeek?.total?.revenue)}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-slate-500 text-xs">vs last week</span>
                <ChangeIndicator current={latestWeek?.total?.revenue} previous={prevWeek?.total?.revenue} />
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm mb-1">Net Profit (This Week)</p>
              <p className={`text-2xl font-bold ${(latestWeek?.total?.netProfit || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(latestWeek?.total?.netProfit)}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-slate-500 text-xs">vs last week</span>
                <ChangeIndicator current={latestWeek?.total?.netProfit} previous={prevWeek?.total?.netProfit} />
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm mb-1">Units Sold (This Week)</p>
              <p className="text-2xl font-bold text-white">{formatNumber(latestWeek?.total?.units)}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-slate-500 text-xs">vs last week</span>
                <ChangeIndicator current={latestWeek?.total?.units} previous={prevWeek?.total?.units} />
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm mb-1">Margin (This Week)</p>
              <p className={`text-2xl font-bold ${(latestWeek?.total?.netMargin || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatPercent(latestWeek?.total?.netMargin)}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-slate-500 text-xs">vs last week</span>
                <ChangeIndicator current={latestWeek?.total?.netMargin} previous={prevWeek?.total?.netMargin} />
              </div>
            </div>
          </div>
          
          {/* Goals Progress */}
          {(goals.weeklyRevenue > 0 || goals.monthlyRevenue > 0) && (
            <div className="bg-gradient-to-br from-amber-900/20 to-slate-800/50 rounded-xl border border-amber-500/30 p-5 mb-6">
              <h3 className="text-lg font-semibold text-amber-400 mb-4 flex items-center gap-2"><Target className="w-5 h-5" />Goals Progress</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {goals.weeklyRevenue > 0 && (
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">Weekly Revenue</span>
                      <span className="text-white">{formatCurrency(latestWeek?.total?.revenue || 0)} / {formatCurrency(goals.weeklyRevenue)}</span>
                    </div>
                    <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full transition-all ${((latestWeek?.total?.revenue || 0) / goals.weeklyRevenue) >= 1 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(((latestWeek?.total?.revenue || 0) / goals.weeklyRevenue) * 100, 100)}%` }} />
                    </div>
                    <p className={`text-xs mt-1 ${((latestWeek?.total?.revenue || 0) / goals.weeklyRevenue) >= 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {(((latestWeek?.total?.revenue || 0) / goals.weeklyRevenue) * 100).toFixed(0)}% of goal
                      {((latestWeek?.total?.revenue || 0) / goals.weeklyRevenue) >= 1 && ' 🎉'}
                    </p>
                  </div>
                )}
                {goals.weeklyProfit > 0 && (
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">Weekly Profit</span>
                      <span className="text-white">{formatCurrency(latestWeek?.total?.netProfit || 0)} / {formatCurrency(goals.weeklyProfit)}</span>
                    </div>
                    <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full transition-all ${((latestWeek?.total?.netProfit || 0) / goals.weeklyProfit) >= 1 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(Math.max(((latestWeek?.total?.netProfit || 0) / goals.weeklyProfit) * 100, 0), 100)}%` }} />
                    </div>
                    <p className={`text-xs mt-1 ${((latestWeek?.total?.netProfit || 0) / goals.weeklyProfit) >= 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {(((latestWeek?.total?.netProfit || 0) / goals.weeklyProfit) * 100).toFixed(0)}% of goal
                      {((latestWeek?.total?.netProfit || 0) / goals.weeklyProfit) >= 1 && ' 🎉'}
                    </p>
                  </div>
                )}
                {goals.monthlyRevenue > 0 && months.length > 0 && (
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">Monthly Revenue ({new Date(months[months.length-1] + '-01').toLocaleDateString('en-US', { month: 'short' })})</span>
                      <span className="text-white">{formatCurrency(monthlyData[months[months.length-1]]?.revenue || 0)} / {formatCurrency(goals.monthlyRevenue)}</span>
                    </div>
                    <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full transition-all ${((monthlyData[months[months.length-1]]?.revenue || 0) / goals.monthlyRevenue) >= 1 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(((monthlyData[months[months.length-1]]?.revenue || 0) / goals.monthlyRevenue) * 100, 100)}%` }} />
                    </div>
                    <p className={`text-xs mt-1 ${((monthlyData[months[months.length-1]]?.revenue || 0) / goals.monthlyRevenue) >= 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {(((monthlyData[months[months.length-1]]?.revenue || 0) / goals.monthlyRevenue) * 100).toFixed(0)}% of goal
                    </p>
                  </div>
                )}
                {goals.monthlyProfit > 0 && months.length > 0 && (
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">Monthly Profit ({new Date(months[months.length-1] + '-01').toLocaleDateString('en-US', { month: 'short' })})</span>
                      <span className="text-white">{formatCurrency(monthlyData[months[months.length-1]]?.profit || 0)} / {formatCurrency(goals.monthlyProfit)}</span>
                    </div>
                    <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full transition-all ${((monthlyData[months[months.length-1]]?.profit || 0) / goals.monthlyProfit) >= 1 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(Math.max(((monthlyData[months[months.length-1]]?.profit || 0) / goals.monthlyProfit) * 100, 0), 100)}%` }} />
                    </div>
                    <p className={`text-xs mt-1 ${((monthlyData[months[months.length-1]]?.profit || 0) / goals.monthlyProfit) >= 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {(((monthlyData[months[months.length-1]]?.profit || 0) / goals.monthlyProfit) * 100).toFixed(0)}% of goal
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* 4-Week Rolling Averages */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">📊 4-Week Rolling Averages</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-slate-400 text-sm">Avg Weekly Revenue</p>
                <p className="text-xl font-bold text-white">{formatCurrency(calcRolling(weeklyData, 'total', 'revenue'))}</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm">Avg Weekly Profit</p>
                <p className="text-xl font-bold text-emerald-400">{formatCurrency(calcRolling(weeklyData, 'total', 'netProfit'))}</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm">Avg Weekly Units</p>
                <p className="text-xl font-bold text-white">{formatNumber(calcRolling(weeklyData, 'total', 'units'))}</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm">Avg Margin</p>
                <p className="text-xl font-bold text-emerald-400">{formatPercent(calcRolling(weeklyData, 'total', 'netMargin'))}</p>
              </div>
            </div>
          </div>
          
          {/* Weekly Revenue Chart */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">Weekly Revenue Trend</h3>
            <div className="flex items-end gap-1 h-48">
              {weeklyData.map((w, i) => {
                const height = maxRevenue > 0 ? ((w.total?.revenue || 0) / maxRevenue) * 100 : 0;
                const isLatest = i === weeklyData.length - 1;
                return (
                  <div key={w.week} className="flex-1 flex flex-col items-center group relative">
                    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-slate-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                      {new Date(w.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}<br/>
                      {formatCurrency(w.total?.revenue)}
                    </div>
                    <div 
                      className={`w-full rounded-t transition-all ${isLatest ? 'bg-violet-500' : 'bg-violet-500/60'} hover:bg-violet-400`}
                      style={{ height: `${Math.max(height, 2)}%` }}
                    />
                    <span className="text-[10px] text-slate-500 mt-1 truncate w-full text-center">
                      {new Date(w.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Weekly Profit Chart */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">Weekly Profit Trend</h3>
            <div className="flex items-end gap-1 h-48">
              {weeklyData.map((w, i) => {
                const profit = w.total?.netProfit || 0;
                const height = maxProfit > 0 ? (Math.abs(profit) / maxProfit) * 100 : 0;
                const isPositive = profit >= 0;
                const isLatest = i === weeklyData.length - 1;
                return (
                  <div key={w.week} className="flex-1 flex flex-col items-center group relative">
                    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-slate-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                      {new Date(w.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}<br/>
                      {formatCurrency(profit)}
                    </div>
                    <div 
                      className={`w-full rounded-t transition-all ${isPositive ? (isLatest ? 'bg-emerald-500' : 'bg-emerald-500/60') : (isLatest ? 'bg-rose-500' : 'bg-rose-500/60')} hover:opacity-80`}
                      style={{ height: `${Math.max(height, 2)}%` }}
                    />
                    <span className="text-[10px] text-slate-500 mt-1 truncate w-full text-center">
                      {new Date(w.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Channel Split Over Time */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">Channel Revenue Split</h3>
            <div className="space-y-2">
              {weeklyData.slice(-8).map(w => {
                const amzShare = w.total?.amazonShare || 0;
                const shopShare = w.total?.shopifyShare || 0;
                return (
                  <div key={w.week} className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 w-20">{new Date(w.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    <div className="flex-1 h-6 bg-slate-900 rounded-full overflow-hidden flex">
                      <div className="bg-orange-500 h-full transition-all" style={{ width: `${amzShare}%` }} title={`Amazon: ${amzShare.toFixed(1)}%`} />
                      <div className="bg-blue-500 h-full transition-all" style={{ width: `${shopShare}%` }} title={`Shopify: ${shopShare.toFixed(1)}%`} />
                    </div>
                    <span className="text-xs text-orange-400 w-12">{amzShare.toFixed(0)}%</span>
                    <span className="text-xs text-blue-400 w-12">{shopShare.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-3 text-xs">
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-orange-500 rounded" />Amazon</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded" />Shopify</span>
            </div>
          </div>
          
          {/* Monthly Summary Table */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
            <h3 className="text-lg font-semibold text-white mb-4">Monthly Summary</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left text-slate-400 font-medium py-2">Month</th>
                    <th className="text-right text-slate-400 font-medium py-2">Revenue</th>
                    <th className="text-right text-slate-400 font-medium py-2">Profit</th>
                    <th className="text-right text-slate-400 font-medium py-2">Units</th>
                    <th className="text-right text-slate-400 font-medium py-2">Margin</th>
                    <th className="text-right text-slate-400 font-medium py-2">Weeks</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map(m => {
                    const d = monthlyData[m];
                    const margin = d.revenue > 0 ? (d.profit / d.revenue) * 100 : 0;
                    return (
                      <tr key={m} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="py-2 text-white">{new Date(m + '-01T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</td>
                        <td className="py-2 text-right text-white">{formatCurrency(d.revenue)}</td>
                        <td className={`py-2 text-right ${d.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(d.profit)}</td>
                        <td className="py-2 text-right text-white">{formatNumber(d.units)}</td>
                        <td className={`py-2 text-right ${margin >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatPercent(margin)}</td>
                        <td className="py-2 text-right text-slate-400">{d.weeks}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== YEAR-OVER-YEAR VIEW ====================
  if (view === 'yoy') {
    const sortedWeeks = Object.keys(allWeeksData).sort();
    const weekYears = [...new Set(sortedWeeks.map(w => w.substring(0, 4)))].sort();
    
    // Also check for annual periods (labeled as "2024", "2025", etc.)
    const periodYears = Object.keys(allPeriodsData).filter(k => /^\d{4}$/.test(k)).sort();
    const allYears = [...new Set([...weekYears, ...periodYears])].sort();
    
    const currentYear = allYears[allYears.length - 1];
    const previousYear = allYears.length > 1 ? allYears[allYears.length - 2] : null;
    
    // Get year data - prioritize period data if available, otherwise use weekly
    const getYearData = (year) => {
      // Check if we have a period for this year
      if (allPeriodsData[year]) {
        const p = allPeriodsData[year];
        return {
          source: 'period',
          label: p.label,
          weeks: 0,
          revenue: p.total?.revenue || 0,
          profit: p.total?.netProfit || 0,
          units: p.total?.units || 0,
          amazonRev: p.amazon?.revenue || 0,
          shopifyRev: p.shopify?.revenue || 0,
          adSpend: p.total?.adSpend || 0,
          cogs: p.total?.cogs || 0,
        };
      }
      // Fall back to weekly data
      const yearWeeks = sortedWeeks.filter(w => w.startsWith(year));
      return {
        source: 'weekly',
        label: `${year} (${yearWeeks.length} weeks)`,
        weeks: yearWeeks.length,
        revenue: yearWeeks.reduce((sum, w) => sum + (allWeeksData[w].total?.revenue || 0), 0),
        profit: yearWeeks.reduce((sum, w) => sum + (allWeeksData[w].total?.netProfit || 0), 0),
        units: yearWeeks.reduce((sum, w) => sum + (allWeeksData[w].total?.units || 0), 0),
        amazonRev: yearWeeks.reduce((sum, w) => sum + (allWeeksData[w].amazon?.revenue || 0), 0),
        shopifyRev: yearWeeks.reduce((sum, w) => sum + (allWeeksData[w].shopify?.revenue || 0), 0),
        adSpend: yearWeeks.reduce((sum, w) => sum + (allWeeksData[w].total?.adSpend || 0), 0),
        cogs: yearWeeks.reduce((sum, w) => sum + (allWeeksData[w].total?.cogs || 0), 0),
      };
    };
    
    const currentYearData = currentYear ? getYearData(currentYear) : null;
    const previousYearData = previousYear ? getYearData(previousYear) : null;
    
    // Month-over-month YoY comparison (only works with weekly data)
    const getMonthlyByYear = (year) => {
      const months = {};
      sortedWeeks.filter(w => w.startsWith(year)).forEach(w => {
        const month = w.substring(5, 7);
        if (!months[month]) months[month] = { revenue: 0, profit: 0, units: 0 };
        months[month].revenue += allWeeksData[w].total?.revenue || 0;
        months[month].profit += allWeeksData[w].total?.netProfit || 0;
        months[month].units += allWeeksData[w].total?.units || 0;
      });
      return months;
    };
    
    const currentMonths = currentYear ? getMonthlyByYear(currentYear) : {};
    const previousMonths = previousYear ? getMonthlyByYear(previousYear) : {};
    const allMonths = ['01','02','03','04','05','06','07','08','09','10','11','12'];
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    
    const hasMonthlyData = Object.keys(currentMonths).length > 0 || Object.keys(previousMonths).length > 0;
    
    const calcYoYChange = (current, previous) => {
      if (!previous || previous === 0) return null;
      return ((current - previous) / previous) * 100;
    };
    
    const YoYBadge = ({ change }) => {
      if (change === null) return <span className="text-slate-500">—</span>;
      const isPositive = change > 0;
      const color = isPositive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400';
      const Icon = isPositive ? ArrowUpRight : ArrowDownRight;
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm ${color}`}>
          <Icon className="w-3 h-3" />
          {Math.abs(change).toFixed(1)}%
        </span>
      );
    };
    
    // Find max for chart
    const maxMonthlyRev = Math.max(
      ...allMonths.map(m => Math.max(currentMonths[m]?.revenue || 0, previousMonths[m]?.revenue || 0))
    );
    
    return (
      <div className="min-h-screen bg-slate-950 p-4 lg:p-6">
        <div className="max-w-7xl mx-auto"><Toast /><CogsManager /><GoalsModal />
          <NavTabs />
          {dataBar}
          
          <div className="mb-6">
            <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">📅 Year-over-Year Comparison</h1>
            <p className="text-slate-400">{previousYear && currentYear ? `Comparing ${currentYear} vs ${previousYear}` : (currentYear ? `${currentYear} data (add previous year data to compare)` : 'No data available - upload periods labeled as years (e.g., "2024", "2025")')}</p>
          </div>
          
          {!currentYearData && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-8 text-center">
              <p className="text-slate-400 mb-4">No year data found.</p>
              <p className="text-slate-500 text-sm">To see YoY comparisons:</p>
              <ul className="text-slate-500 text-sm mt-2 space-y-1">
                <li>• Upload weekly data with dates, OR</li>
                <li>• Create Periods labeled exactly as years (e.g., "2024", "2025")</li>
              </ul>
            </div>
          )}
          
          {currentYearData && (
          <>
          {/* Year Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Current Year */}
            <div className="bg-gradient-to-br from-violet-900/30 to-slate-800/50 rounded-xl border border-violet-500/30 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-violet-400">{currentYear}</h3>
                <span className="text-xs px-2 py-1 bg-violet-500/20 text-violet-300 rounded">{currentYearData.source === 'period' ? 'Period Data' : 'Weekly Data'}</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-slate-400 text-sm">Revenue</p>
                  <p className="text-2xl font-bold text-white">{formatCurrency(currentYearData.revenue)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">Net Profit</p>
                  <p className={`text-2xl font-bold ${currentYearData.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(currentYearData.profit)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">Units Sold</p>
                  <p className="text-xl font-bold text-white">{formatNumber(currentYearData.units)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">Margin</p>
                  <p className={`text-xl font-bold ${currentYearData.revenue > 0 && (currentYearData.profit/currentYearData.revenue) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {formatPercent(currentYearData.revenue > 0 ? (currentYearData.profit/currentYearData.revenue)*100 : 0)}
                  </p>
                </div>
              </div>
              <p className="text-slate-500 text-sm mt-3">{currentYearData.source === 'period' ? currentYearData.label : `${currentYearData.weeks} weeks of data`}</p>
            </div>
            
            {/* Previous Year */}
            {previousYearData ? (
              <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-400">{previousYear}</h3>
                  <span className="text-xs px-2 py-1 bg-slate-600 text-slate-300 rounded">{previousYearData.source === 'period' ? 'Period Data' : 'Weekly Data'}</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-slate-400 text-sm">Revenue</p>
                    <p className="text-2xl font-bold text-white">{formatCurrency(previousYearData.revenue)}</p>
                    <YoYBadge change={calcYoYChange(currentYearData.revenue, previousYearData.revenue)} />
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Net Profit</p>
                    <p className={`text-2xl font-bold ${previousYearData.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(previousYearData.profit)}</p>
                    <YoYBadge change={calcYoYChange(currentYearData.profit, previousYearData.profit)} />
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Units Sold</p>
                    <p className="text-xl font-bold text-white">{formatNumber(previousYearData.units)}</p>
                    <YoYBadge change={calcYoYChange(currentYearData.units, previousYearData.units)} />
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Margin</p>
                    <p className={`text-xl font-bold ${previousYearData.revenue > 0 && (previousYearData.profit/previousYearData.revenue) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatPercent(previousYearData.revenue > 0 ? (previousYearData.profit/previousYearData.revenue)*100 : 0)}
                    </p>
                  </div>
                </div>
                <p className="text-slate-500 text-sm mt-3">{previousYearData.weeks} weeks of data</p>
              </div>
            ) : (
              <div className="bg-slate-800/30 rounded-xl border border-dashed border-slate-600 p-5 flex items-center justify-center">
                <p className="text-slate-500 text-center">Upload {parseInt(currentYear) - 1} data to enable YoY comparison</p>
              </div>
            )}
          </div>
          
          {/* Monthly YoY Chart - only shows with weekly data */}
          {previousYear && hasMonthlyData && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">Monthly Revenue: {currentYear} vs {previousYear}</h3>
              <div className="flex items-end gap-2 h-64">
                {allMonths.map((m, i) => {
                  const currRev = currentMonths[m]?.revenue || 0;
                  const prevRev = previousMonths[m]?.revenue || 0;
                  const currHeight = maxMonthlyRev > 0 ? (currRev / maxMonthlyRev) * 100 : 0;
                  const prevHeight = maxMonthlyRev > 0 ? (prevRev / maxMonthlyRev) * 100 : 0;
                  return (
                    <div key={m} className="flex-1 flex flex-col items-center">
                      <div className="flex gap-0.5 items-end h-48 w-full">
                        <div className="flex-1 flex flex-col justify-end group relative">
                          <div className="absolute bottom-full mb-1 hidden group-hover:block bg-slate-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                            {previousYear}: {formatCurrency(prevRev)}
                          </div>
                          <div className="w-full bg-slate-600 rounded-t transition-all hover:bg-slate-500" style={{ height: `${Math.max(prevHeight, 1)}%` }} />
                        </div>
                        <div className="flex-1 flex flex-col justify-end group relative">
                          <div className="absolute bottom-full mb-1 hidden group-hover:block bg-slate-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                            {currentYear}: {formatCurrency(currRev)}
                          </div>
                          <div className="w-full bg-violet-500 rounded-t transition-all hover:bg-violet-400" style={{ height: `${Math.max(currHeight, 1)}%` }} />
                        </div>
                      </div>
                      <span className="text-xs text-slate-400 mt-2">{monthNames[i]}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-3 text-sm justify-center">
                <span className="flex items-center gap-2"><span className="w-3 h-3 bg-slate-600 rounded" />{previousYear}</span>
                <span className="flex items-center gap-2"><span className="w-3 h-3 bg-violet-500 rounded" />{currentYear}</span>
              </div>
            </div>
          )}
          
          {/* Monthly Comparison Table - only shows with weekly data */}
          {hasMonthlyData && (
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
            <h3 className="text-lg font-semibold text-white mb-4">Month-by-Month Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left text-slate-400 font-medium py-2">Month</th>
                    <th className="text-right text-slate-400 font-medium py-2">{currentYear} Revenue</th>
                    {previousYear && <th className="text-right text-slate-400 font-medium py-2">{previousYear} Revenue</th>}
                    {previousYear && <th className="text-right text-slate-400 font-medium py-2">YoY Change</th>}
                    <th className="text-right text-slate-400 font-medium py-2">{currentYear} Profit</th>
                    {previousYear && <th className="text-right text-slate-400 font-medium py-2">{previousYear} Profit</th>}
                  </tr>
                </thead>
                <tbody>
                  {allMonths.map((m, i) => {
                    const curr = currentMonths[m] || { revenue: 0, profit: 0 };
                    const prev = previousMonths[m] || { revenue: 0, profit: 0 };
                    const hasData = curr.revenue > 0 || prev.revenue > 0;
                    if (!hasData) return null;
                    const change = calcYoYChange(curr.revenue, prev.revenue);
                    return (
                      <tr key={m} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="py-2 text-white">{monthNames[i]}</td>
                        <td className="py-2 text-right text-white">{formatCurrency(curr.revenue)}</td>
                        {previousYear && <td className="py-2 text-right text-slate-400">{formatCurrency(prev.revenue)}</td>}
                        {previousYear && <td className="py-2 text-right"><YoYBadge change={change} /></td>}
                        <td className={`py-2 text-right ${curr.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(curr.profit)}</td>
                        {previousYear && <td className={`py-2 text-right ${prev.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(prev.profit)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-slate-600">
                  <tr className="font-semibold">
                    <td className="py-2 text-white">Total</td>
                    <td className="py-2 text-right text-white">{formatCurrency(currentYearData.revenue)}</td>
                    {previousYear && <td className="py-2 text-right text-slate-400">{formatCurrency(previousYearData.revenue)}</td>}
                    {previousYear && <td className="py-2 text-right"><YoYBadge change={calcYoYChange(currentYearData.revenue, previousYearData.revenue)} /></td>}
                    <td className={`py-2 text-right ${currentYearData.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(currentYearData.profit)}</td>
                    {previousYear && <td className={`py-2 text-right ${previousYearData.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(previousYearData.profit)}</td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          )}
          
          {!hasMonthlyData && (
            <div className="bg-slate-800/30 rounded-xl border border-dashed border-slate-600 p-6 text-center">
              <p className="text-slate-500">Monthly breakdown requires weekly data uploads.</p>
              <p className="text-slate-600 text-sm mt-1">Period data shows annual totals only.</p>
            </div>
          )}
          </>
          )}
        </div>
      </div>
    );
  }

  // ==================== SKU RANKINGS VIEW ====================
  if (view === 'skus') {
    const sortedWeeks = Object.keys(allWeeksData).sort();
    const recentWeeks = sortedWeeks.slice(-4);
    const olderWeeks = sortedWeeks.slice(-8, -4);
    
    // Aggregate SKU data across all weeks
    const skuAggregates = {};
    const skuRecentData = {};
    const skuOlderData = {};
    
    sortedWeeks.forEach(w => {
      const week = allWeeksData[w];
      const isRecent = recentWeeks.includes(w);
      const isOlder = olderWeeks.includes(w);
      
      // Amazon SKUs
      (week.amazon?.skuData || []).forEach(s => {
        if (!skuAggregates[s.sku]) skuAggregates[s.sku] = { sku: s.sku, name: s.name, channel: 'Amazon', units: 0, revenue: 0, profit: 0, cogs: 0, weeks: 0 };
        skuAggregates[s.sku].units += s.unitsSold || 0;
        skuAggregates[s.sku].revenue += s.netSales || 0;
        skuAggregates[s.sku].cogs += s.cogs || 0;
        skuAggregates[s.sku].profit += (s.netProceeds || s.netSales || 0) - (s.cogs || 0);
        skuAggregates[s.sku].weeks += 1;
        
        if (isRecent) {
          if (!skuRecentData[s.sku]) skuRecentData[s.sku] = { units: 0, revenue: 0 };
          skuRecentData[s.sku].units += s.unitsSold || 0;
          skuRecentData[s.sku].revenue += s.netSales || 0;
        }
        if (isOlder) {
          if (!skuOlderData[s.sku]) skuOlderData[s.sku] = { units: 0, revenue: 0 };
          skuOlderData[s.sku].units += s.unitsSold || 0;
          skuOlderData[s.sku].revenue += s.netSales || 0;
        }
      });
      
      // Shopify SKUs
      (week.shopify?.skuData || []).forEach(s => {
        const key = 'shop_' + s.sku;
        if (!skuAggregates[key]) skuAggregates[key] = { sku: s.sku, name: s.name, channel: 'Shopify', units: 0, revenue: 0, profit: 0, cogs: 0, weeks: 0 };
        skuAggregates[key].units += s.unitsSold || 0;
        skuAggregates[key].revenue += s.netSales || 0;
        skuAggregates[key].cogs += s.cogs || 0;
        skuAggregates[key].profit += (s.netSales || 0) - (s.cogs || 0);
        skuAggregates[key].weeks += 1;
        
        if (isRecent) {
          if (!skuRecentData[key]) skuRecentData[key] = { units: 0, revenue: 0 };
          skuRecentData[key].units += s.unitsSold || 0;
          skuRecentData[key].revenue += s.netSales || 0;
        }
        if (isOlder) {
          if (!skuOlderData[key]) skuOlderData[key] = { units: 0, revenue: 0 };
          skuOlderData[key].units += s.unitsSold || 0;
          skuOlderData[key].revenue += s.netSales || 0;
        }
      });
    });
    
    const allSkus = Object.values(skuAggregates);
    const topByRevenue = [...allSkus].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const topByUnits = [...allSkus].sort((a, b) => b.units - a.units).slice(0, 10);
    const topByProfit = [...allSkus].sort((a, b) => b.profit - a.profit).slice(0, 10);
    
    // Calculate growth rates
    const skusWithGrowth = allSkus.map(s => {
      const key = s.channel === 'Shopify' ? 'shop_' + s.sku : s.sku;
      const recent = skuRecentData[key]?.revenue || 0;
      const older = skuOlderData[key]?.revenue || 0;
      const growth = older > 0 ? ((recent - older) / older) * 100 : (recent > 0 ? 100 : 0);
      return { ...s, recentRev: recent, olderRev: older, growth };
    }).filter(s => s.recentRev > 0 || s.olderRev > 0);
    
    const risingStars = [...skusWithGrowth].filter(s => s.growth > 0 && s.recentRev > 50).sort((a, b) => b.growth - a.growth).slice(0, 5);
    const declining = [...skusWithGrowth].filter(s => s.growth < -10 && s.olderRev > 50).sort((a, b) => a.growth - b.growth).slice(0, 5);
    
    // Dead stock (in inventory but no recent sales)
    const invData = selectedInvDate ? invHistory[selectedInvDate] : null;
    const deadStock = invData ? invData.items.filter(item => {
      const hasStock = item.totalQty > 0;
      const noRecentSales = !skuRecentData[item.sku] && !skuRecentData['shop_' + item.sku];
      return hasStock && noRecentSales;
    }).slice(0, 10) : [];
    
    const SkuTable = ({ data, title, icon, color, showProfit = false, showGrowth = false }) => (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
        <h3 className={`text-lg font-semibold ${color} mb-4 flex items-center gap-2`}>{icon}{title}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-slate-400 font-medium py-2">#</th>
                <th className="text-left text-slate-400 font-medium py-2">SKU</th>
                <th className="text-left text-slate-400 font-medium py-2">Channel</th>
                <th className="text-right text-slate-400 font-medium py-2">Revenue</th>
                <th className="text-right text-slate-400 font-medium py-2">Units</th>
                {showProfit && <th className="text-right text-slate-400 font-medium py-2">Profit</th>}
                {showGrowth && <th className="text-right text-slate-400 font-medium py-2">Growth</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((s, i) => (
                <tr key={s.sku + s.channel + i} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                  <td className="py-2 text-slate-500">{i + 1}</td>
                  <td className="py-2"><div className="max-w-[200px] truncate text-white" title={s.name}>{s.sku}</div></td>
                  <td className="py-2"><span className={`text-xs px-2 py-0.5 rounded ${s.channel === 'Amazon' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>{s.channel}</span></td>
                  <td className="py-2 text-right text-white">{formatCurrency(s.revenue)}</td>
                  <td className="py-2 text-right text-white">{formatNumber(s.units)}</td>
                  {showProfit && <td className={`py-2 text-right ${s.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(s.profit)}</td>}
                  {showGrowth && <td className={`py-2 text-right ${s.growth >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{s.growth > 0 ? '+' : ''}{s.growth.toFixed(0)}%</td>}
                </tr>
              ))}
              {data.length === 0 && <tr><td colSpan={showProfit ? 6 : showGrowth ? 6 : 5} className="py-4 text-center text-slate-500">No data available</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
    
    return (
      <div className="min-h-screen bg-slate-950 p-4 lg:p-6">
        <div className="max-w-7xl mx-auto"><Toast /><CogsManager /><GoalsModal />
          <NavTabs />
          {dataBar}
          
          <div className="mb-6">
            <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">🏆 SKU Performance Rankings</h1>
            <p className="text-slate-400">Identify your best sellers, most profitable products, and trends</p>
          </div>
          
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 text-center">
              <p className="text-3xl font-bold text-white">{allSkus.length}</p>
              <p className="text-slate-400 text-sm">Total SKUs</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 text-center">
              <p className="text-3xl font-bold text-emerald-400">{formatCurrency(allSkus.reduce((s, x) => s + x.revenue, 0))}</p>
              <p className="text-slate-400 text-sm">Total Revenue</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 text-center">
              <p className="text-3xl font-bold text-white">{formatNumber(allSkus.reduce((s, x) => s + x.units, 0))}</p>
              <p className="text-slate-400 text-sm">Total Units</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 text-center">
              <p className="text-3xl font-bold text-amber-400">{formatCurrency(allSkus.length > 0 ? allSkus.reduce((s, x) => s + x.revenue, 0) / allSkus.length : 0)}</p>
              <p className="text-slate-400 text-sm">Avg Revenue/SKU</p>
            </div>
          </div>
          
          {/* Top Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <SkuTable data={topByRevenue} title="Top 10 by Revenue" icon={<DollarSign className="w-5 h-5" />} color="text-emerald-400" />
            <SkuTable data={topByUnits} title="Top 10 by Units" icon={<Package className="w-5 h-5" />} color="text-blue-400" />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <SkuTable data={topByProfit} title="Top 10 Most Profitable" icon={<Award className="w-5 h-5" />} color="text-amber-400" showProfit />
            <SkuTable data={risingStars} title="Rising Stars (4wk growth)" icon={<Flame className="w-5 h-5" />} color="text-orange-400" showGrowth />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SkuTable data={declining} title="Watch List (Declining)" icon={<TrendingDown className="w-5 h-5" />} color="text-rose-400" showGrowth />
            {deadStock.length > 0 && (
              <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                <h3 className="text-lg font-semibold text-slate-400 mb-4 flex items-center gap-2"><Snowflake className="w-5 h-5" />Dead Stock (No Recent Sales)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-700"><th className="text-left text-slate-400 py-2">SKU</th><th className="text-right text-slate-400 py-2">Qty</th><th className="text-right text-slate-400 py-2">Value</th></tr></thead>
                    <tbody>
                      {deadStock.map(s => (
                        <tr key={s.sku} className="border-b border-slate-700/50"><td className="py-2 text-white">{s.sku}</td><td className="py-2 text-right text-white">{formatNumber(s.totalQty)}</td><td className="py-2 text-right text-slate-400">{formatCurrency(s.totalValue)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==================== PROFITABILITY VIEW ====================
  if (view === 'profitability') {
    const sortedWeeks = Object.keys(allWeeksData).sort();
    const recentWeeks = sortedWeeks.slice(-4);
    
    // Aggregate data
    const totals = { revenue: 0, cogs: 0, amazonFees: 0, threeplCosts: 0, adSpend: 0, profit: 0 };
    const weeklyBreakdown = [];
    
    recentWeeks.forEach(w => {
      const week = allWeeksData[w];
      const rev = week.total?.revenue || 0;
      const cogs = week.total?.cogs || 0;
      const amzFees = week.amazon?.fees || 0;
      const threepl = week.shopify?.threeplCosts || 0;
      const ads = week.total?.adSpend || 0;
      const profit = week.total?.netProfit || 0;
      
      totals.revenue += rev;
      totals.cogs += cogs;
      totals.amazonFees += amzFees;
      totals.threeplCosts += threepl;
      totals.adSpend += ads;
      totals.profit += profit;
      
      weeklyBreakdown.push({ week: w, revenue: rev, cogs, amazonFees: amzFees, threeplCosts: threepl, adSpend: ads, profit });
    });
    
    // Calculate percentages
    const pcts = {
      cogs: totals.revenue > 0 ? (totals.cogs / totals.revenue) * 100 : 0,
      amazonFees: totals.revenue > 0 ? (totals.amazonFees / totals.revenue) * 100 : 0,
      threeplCosts: totals.revenue > 0 ? (totals.threeplCosts / totals.revenue) * 100 : 0,
      adSpend: totals.revenue > 0 ? (totals.adSpend / totals.revenue) * 100 : 0,
      profit: totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0,
    };
    
    // Waterfall segments
    const waterfall = [
      { label: 'Revenue', value: totals.revenue, color: 'bg-violet-500', running: totals.revenue },
      { label: 'COGS', value: -totals.cogs, color: 'bg-rose-500', running: totals.revenue - totals.cogs },
      { label: 'Amazon Fees', value: -totals.amazonFees, color: 'bg-orange-500', running: totals.revenue - totals.cogs - totals.amazonFees },
      { label: '3PL Costs', value: -totals.threeplCosts, color: 'bg-blue-500', running: totals.revenue - totals.cogs - totals.amazonFees - totals.threeplCosts },
      { label: 'Ad Spend', value: -totals.adSpend, color: 'bg-purple-500', running: totals.revenue - totals.cogs - totals.amazonFees - totals.threeplCosts - totals.adSpend },
      { label: 'Net Profit', value: totals.profit, color: totals.profit >= 0 ? 'bg-emerald-500' : 'bg-rose-500', running: totals.profit },
    ];
    
    const maxVal = Math.max(totals.revenue, Math.abs(totals.profit));
    
    // Cost trends over time
    const costTrends = sortedWeeks.slice(-8).map(w => {
      const week = allWeeksData[w];
      const rev = week.total?.revenue || 1;
      return {
        week: w,
        cogsPct: ((week.total?.cogs || 0) / rev) * 100,
        adsPct: ((week.total?.adSpend || 0) / rev) * 100,
        feesPct: (((week.amazon?.fees || 0) + (week.shopify?.threeplCosts || 0)) / rev) * 100,
      };
    });
    
    return (
      <div className="min-h-screen bg-slate-950 p-4 lg:p-6">
        <div className="max-w-7xl mx-auto"><Toast /><CogsManager /><GoalsModal />
          <NavTabs />
          {dataBar}
          
          <div className="mb-6">
            <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">💰 Profitability Deep Dive</h1>
            <p className="text-slate-400">Understand where your money goes (Last 4 weeks)</p>
          </div>
          
          {/* Profit Waterfall */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">Profit Waterfall</h3>
            <div className="flex items-end gap-2 h-64 mb-4">
              {waterfall.map((item, i) => {
                const height = maxVal > 0 ? (Math.abs(item.value) / maxVal) * 100 : 0;
                return (
                  <div key={item.label} className="flex-1 flex flex-col items-center group relative">
                    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-slate-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                      {item.label}: {formatCurrency(item.value)}
                    </div>
                    <div className={`w-full rounded-t ${item.color} transition-all hover:opacity-80`} style={{ height: `${Math.max(height, 3)}%` }} />
                    <span className="text-xs text-slate-400 mt-2 text-center">{item.label}</span>
                    <span className={`text-sm font-semibold ${item.value >= 0 ? 'text-white' : 'text-rose-400'}`}>{formatCurrency(item.value)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Cost Breakdown Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">COGS</p>
              <p className="text-xl font-bold text-white">{formatCurrency(totals.cogs)}</p>
              <p className="text-rose-400 text-sm">{pcts.cogs.toFixed(1)}% of revenue</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">Amazon Fees</p>
              <p className="text-xl font-bold text-white">{formatCurrency(totals.amazonFees)}</p>
              <p className="text-orange-400 text-sm">{pcts.amazonFees.toFixed(1)}% of revenue</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">3PL Costs</p>
              <p className="text-xl font-bold text-white">{formatCurrency(totals.threeplCosts)}</p>
              <p className="text-blue-400 text-sm">{pcts.threeplCosts.toFixed(1)}% of revenue</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">Ad Spend</p>
              <p className="text-xl font-bold text-white">{formatCurrency(totals.adSpend)}</p>
              <p className="text-purple-400 text-sm">{pcts.adSpend.toFixed(1)}% of revenue</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-900/30 to-slate-800/50 rounded-xl border border-emerald-500/30 p-4">
              <p className="text-slate-400 text-sm">Net Profit</p>
              <p className={`text-xl font-bold ${totals.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(totals.profit)}</p>
              <p className={`text-sm ${pcts.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{pcts.profit.toFixed(1)}% margin</p>
            </div>
          </div>
          
          {/* Cost % Trends */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">Cost % of Revenue Over Time</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left text-slate-400 py-2">Week</th>
                    <th className="text-right text-slate-400 py-2">COGS %</th>
                    <th className="text-right text-slate-400 py-2">Ads %</th>
                    <th className="text-right text-slate-400 py-2">Fees %</th>
                  </tr>
                </thead>
                <tbody>
                  {costTrends.map(t => (
                    <tr key={t.week} className="border-b border-slate-700/50">
                      <td className="py-2 text-white">{new Date(t.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                      <td className="py-2 text-right text-rose-400">{t.cogsPct.toFixed(1)}%</td>
                      <td className="py-2 text-right text-purple-400">{t.adsPct.toFixed(1)}%</td>
                      <td className="py-2 text-right text-orange-400">{t.feesPct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Break-even Analysis */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
            <h3 className="text-lg font-semibold text-white mb-4">Break-Even Analysis</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-slate-400 text-sm mb-2">Your average costs are <span className="text-white font-semibold">{(100 - pcts.profit).toFixed(1)}%</span> of revenue</p>
                <p className="text-slate-400 text-sm mb-2">To break even, you need <span className="text-emerald-400 font-semibold">{formatCurrency(totals.cogs + totals.amazonFees + totals.threeplCosts + totals.adSpend)}</span> in revenue</p>
                <p className="text-slate-400 text-sm">Every <span className="text-white font-semibold">$100</span> in revenue generates <span className={`font-semibold ${pcts.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(pcts.profit)}</span> profit</p>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <p className="text-slate-500 text-xs uppercase mb-2">Revenue Breakdown</p>
                <div className="h-4 bg-slate-700 rounded-full overflow-hidden flex">
                  <div className="bg-rose-500 h-full" style={{ width: `${pcts.cogs}%` }} title={`COGS: ${pcts.cogs.toFixed(1)}%`} />
                  <div className="bg-orange-500 h-full" style={{ width: `${pcts.amazonFees}%` }} title={`Fees: ${pcts.amazonFees.toFixed(1)}%`} />
                  <div className="bg-blue-500 h-full" style={{ width: `${pcts.threeplCosts}%` }} title={`3PL: ${pcts.threeplCosts.toFixed(1)}%`} />
                  <div className="bg-purple-500 h-full" style={{ width: `${pcts.adSpend}%` }} title={`Ads: ${pcts.adSpend.toFixed(1)}%`} />
                  <div className={`${pcts.profit >= 0 ? 'bg-emerald-500' : 'bg-rose-600'} h-full`} style={{ width: `${Math.abs(pcts.profit)}%` }} />
                </div>
                <div className="flex flex-wrap gap-3 mt-3 text-xs">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-rose-500 rounded" />COGS</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-orange-500 rounded" />Fees</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-500 rounded" />3PL</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-purple-500 rounded" />Ads</span>
                  <span className="flex items-center gap-1"><span className={`w-2 h-2 ${pcts.profit >= 0 ? 'bg-emerald-500' : 'bg-rose-600'} rounded`} />Profit</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== ADS PERFORMANCE VIEW ====================
  if (view === 'ads') {
    const sortedWeeks = Object.keys(allWeeksData).sort();
    
    // Aggregate ad data
    const adData = sortedWeeks.map(w => {
      const week = allWeeksData[w];
      const amzAds = week.amazon?.adSpend || 0;
      const amzRev = week.amazon?.revenue || 0;
      const metaAds = week.shopify?.metaSpend || 0;
      const googleAds = week.shopify?.googleSpend || 0;
      const shopRev = week.shopify?.revenue || 0;
      const totalAds = amzAds + metaAds + googleAds;
      const totalRev = amzRev + shopRev;
      
      return {
        week: w,
        amzAds, amzRev, amzRoas: amzAds > 0 ? amzRev / amzAds : 0,
        metaAds, googleAds, shopRev, shopRoas: (metaAds + googleAds) > 0 ? shopRev / (metaAds + googleAds) : 0,
        totalAds, totalRev, totalRoas: totalAds > 0 ? totalRev / totalAds : 0,
        adPct: totalRev > 0 ? (totalAds / totalRev) * 100 : 0,
      };
    });
    
    const recentData = adData.slice(-4);
    const totals = recentData.reduce((acc, d) => ({
      amzAds: acc.amzAds + d.amzAds,
      amzRev: acc.amzRev + d.amzRev,
      metaAds: acc.metaAds + d.metaAds,
      googleAds: acc.googleAds + d.googleAds,
      shopRev: acc.shopRev + d.shopRev,
      totalAds: acc.totalAds + d.totalAds,
      totalRev: acc.totalRev + d.totalRev,
    }), { amzAds: 0, amzRev: 0, metaAds: 0, googleAds: 0, shopRev: 0, totalAds: 0, totalRev: 0 });
    
    const avgRoas = totals.totalAds > 0 ? totals.totalRev / totals.totalAds : 0;
    const amzRoas = totals.amzAds > 0 ? totals.amzRev / totals.amzAds : 0;
    const shopifyAds = totals.metaAds + totals.googleAds;
    const shopRoas = shopifyAds > 0 ? totals.shopRev / shopifyAds : 0;
    
    // TACOS = Ad Spend / Total Revenue (as percentage)
    const totalTacos = totals.totalRev > 0 ? (totals.totalAds / totals.totalRev) * 100 : 0;
    const amzTacos = totals.amzRev > 0 ? (totals.amzAds / totals.amzRev) * 100 : 0;
    const shopTacos = totals.shopRev > 0 ? (shopifyAds / totals.shopRev) * 100 : 0;
    
    // Find optimal ad spend (week with lowest TACOS that has sales)
    const bestWeek = [...adData].filter(d => d.totalAds > 0 && d.totalRev > 0).sort((a, b) => a.adPct - b.adPct)[0];
    
    const tacosColor = (tacos) => tacos <= 10 ? 'text-emerald-400' : tacos <= 20 ? 'text-amber-400' : 'text-rose-400';
    
    return (
      <div className="min-h-screen bg-slate-950 p-4 lg:p-6">
        <div className="max-w-7xl mx-auto"><Toast /><CogsManager /><GoalsModal />
          <NavTabs />
          {dataBar}
          
          <div className="mb-6">
            <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">⚡ Ad Performance Analytics</h1>
            <p className="text-slate-400">Track TACOS (Total Ad Cost of Sale = Ad Spend ÷ Total Revenue), ad spend efficiency, and channel performance</p>
          </div>
          
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gradient-to-br from-purple-900/30 to-slate-800/50 rounded-xl border border-purple-500/30 p-4">
              <p className="text-slate-400 text-sm">Total Ad Spend (4wk)</p>
              <p className="text-2xl font-bold text-white">{formatCurrency(totals.totalAds)}</p>
              <p className="text-purple-400 text-sm">{totalTacos.toFixed(1)}% of revenue</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">Overall TACOS</p>
              <p className={`text-2xl font-bold ${tacosColor(totalTacos)}`}>{totalTacos.toFixed(1)}%</p>
              <p className="text-slate-500 text-sm">Target: &lt;15%</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">Amazon TACOS</p>
              <p className={`text-2xl font-bold ${tacosColor(amzTacos)}`}>{amzTacos.toFixed(1)}%</p>
              <p className="text-orange-400 text-sm">{formatCurrency(totals.amzAds)} spent</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">Shopify TACOS</p>
              <p className={`text-2xl font-bold ${tacosColor(shopTacos)}`}>{shopTacos.toFixed(1)}%</p>
              <p className="text-blue-400 text-sm">{formatCurrency(shopifyAds)} spent</p>
            </div>
          </div>
          
          {/* Meta vs Google breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
              <h3 className="text-lg font-semibold text-white mb-4">Shopify Ad Breakdown</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Meta Ads</span>
                  <span className="text-white font-semibold">{formatCurrency(totals.metaAds)}</span>
                </div>
                <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                  <div className="bg-blue-500 h-full" style={{ width: shopifyAds > 0 ? `${(totals.metaAds / shopifyAds) * 100}%` : '0%' }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Google Ads</span>
                  <span className="text-white font-semibold">{formatCurrency(totals.googleAds)}</span>
                </div>
                <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                  <div className="bg-red-500 h-full" style={{ width: shopifyAds > 0 ? `${(totals.googleAds / shopifyAds) * 100}%` : '0%' }} />
                </div>
              </div>
            </div>
            
            {bestWeek && (
              <div className="bg-gradient-to-br from-emerald-900/30 to-slate-800/50 rounded-xl border border-emerald-500/30 p-5">
                <h3 className="text-lg font-semibold text-emerald-400 mb-4 flex items-center gap-2"><Star className="w-5 h-5" />Best Performing Week (Lowest TACOS)</h3>
                <p className="text-white text-xl font-bold mb-2">{new Date(bestWeek.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-slate-400">Ad Spend:</span> <span className="text-white">{formatCurrency(bestWeek.totalAds)}</span></div>
                  <div><span className="text-slate-400">Revenue:</span> <span className="text-white">{formatCurrency(bestWeek.totalRev)}</span></div>
                  <div><span className="text-slate-400">TACOS:</span> <span className="text-emerald-400 font-bold">{bestWeek.adPct.toFixed(1)}%</span></div>
                  <div><span className="text-slate-400">Efficiency:</span> <span className="text-white">${(bestWeek.totalRev / bestWeek.totalAds).toFixed(2)} per $1</span></div>
                </div>
              </div>
            )}
          </div>
          
          {/* TACOS Trend Chart */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">TACOS Trend (Lower is Better)</h3>
            <div className="flex items-end gap-2 h-48">
              {adData.slice(-12).map((d, i) => {
                const tacos = d.adPct;
                const height = Math.min(tacos * 3, 100); // Scale for display
                return (
                  <div key={d.week} className="flex-1 flex flex-col items-center group relative">
                    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-slate-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                      {new Date(d.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}<br/>
                      TACOS: {tacos.toFixed(1)}%<br/>
                      Spend: {formatCurrency(d.totalAds)}
                    </div>
                    <div className={`w-full rounded-t transition-all hover:opacity-80 ${tacos <= 10 ? 'bg-emerald-500' : tacos <= 20 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ height: `${Math.max(height, 3)}%` }} />
                    <span className="text-[10px] text-slate-500 mt-1">{new Date(d.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-3 text-xs justify-center">
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500 rounded" />Great (&lt;10%)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-500 rounded" />OK (10-20%)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-rose-500 rounded" />High (&gt;20%)</span>
            </div>
          </div>
          
          {/* Weekly Ad Performance Table */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
            <h3 className="text-lg font-semibold text-white mb-4">Weekly Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left text-slate-400 py-2">Week</th>
                    <th className="text-right text-slate-400 py-2">Amazon Ads</th>
                    <th className="text-right text-slate-400 py-2">Meta</th>
                    <th className="text-right text-slate-400 py-2">Google</th>
                    <th className="text-right text-slate-400 py-2">Total Ads</th>
                    <th className="text-right text-slate-400 py-2">Revenue</th>
                    <th className="text-right text-slate-400 py-2">TACOS</th>
                  </tr>
                </thead>
                <tbody>
                  {adData.slice(-8).reverse().map(d => (
                    <tr key={d.week} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-2 text-white">{new Date(d.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                      <td className="py-2 text-right text-orange-400">{formatCurrency(d.amzAds)}</td>
                      <td className="py-2 text-right text-blue-400">{formatCurrency(d.metaAds)}</td>
                      <td className="py-2 text-right text-red-400">{formatCurrency(d.googleAds)}</td>
                      <td className="py-2 text-right text-white">{formatCurrency(d.totalAds)}</td>
                      <td className="py-2 text-right text-white">{formatCurrency(d.totalRev)}</td>
                      <td className={`py-2 text-right font-semibold ${tacosColor(d.adPct)}`}>{d.adPct.toFixed(1)}%</td>
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
