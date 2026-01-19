import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Upload, DollarSign, TrendingUp, TrendingDown, Package, ShoppingCart, BarChart3, Download, Calendar, ChevronLeft, ChevronRight, Trash2, FileSpreadsheet, Check, Database, AlertTriangle, AlertCircle, CheckCircle, Clock, Boxes, RefreshCw, Layers, CalendarRange, Settings, ArrowUpRight, ArrowDownRight, Minus, GitCompare, Trophy, Target, PieChart, Zap, Star, Eye, ShoppingBag, Award, Flame, Snowflake, Truck, FileText, MessageSquare, Send, X, Move, EyeOff, Bell, BellOff, Calculator, StickyNote, Sun, Moon, Palette, FileDown, GitCompareArrows, Smartphone, Cloud, Plus } from 'lucide-react';

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
const PERIODS_KEY = 'ecommerce_periods_v1';
const SALES_TAX_KEY = 'ecommerce_sales_tax_v1';
const PRODUCT_NAMES_KEY = 'ecommerce_product_names_v1';
const SETTINGS_KEY = 'ecommerce_settings_v1';
const NOTES_KEY = 'ecommerce_notes_v1';
const WIDGET_KEY = 'ecommerce_widgets_v1';
const THEME_KEY = 'ecommerce_theme_v1';
const INVOICES_KEY = 'ecommerce_invoices_v1';
const AMAZON_FORECAST_KEY = 'ecommerce_amazon_forecast_v1';

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

// Enhanced 3PL parsing - extracts detailed metrics from 3PL CSV files
const parse3PLData = (threeplFiles) => {
  const breakdown = { storage: 0, shipping: 0, pickFees: 0, boxCharges: 0, receiving: 0, other: 0 };
  const metrics = {
    totalCost: 0,
    orderCount: 0,
    totalUnits: 0,
    avgShippingCost: 0,
    avgPickCost: 0,
    avgPackagingCost: 0,
    avgCostPerOrder: 0,
    avgUnitsPerOrder: 0,
    shippingCount: 0,
    firstPickCount: 0,
    additionalPickCount: 0,
  };
  
  if (!threeplFiles) return { breakdown, metrics };
  
  // Normalize to array of file data arrays
  // threeplFiles could be:
  // 1. null/undefined -> return empty
  // 2. Array of row objects (single file): [{Charge: x}, {Charge: y}] 
  // 3. Array of arrays (multiple files): [[{row1}, {row2}], [{row1}, {row2}]]
  let filesArray;
  if (Array.isArray(threeplFiles)) {
    // Check if first element is an array (multiple files) or an object (single file's rows)
    if (threeplFiles.length > 0 && Array.isArray(threeplFiles[0])) {
      // Multiple files: [[rows], [rows]]
      filesArray = threeplFiles;
    } else {
      // Single file: [rows] - wrap it
      filesArray = [threeplFiles];
    }
  } else {
    // Single non-array item (shouldn't happen but handle it)
    filesArray = [[threeplFiles]];
  }
  
  filesArray.forEach(fileData => {
    if (!fileData || !Array.isArray(fileData)) return;
    fileData.forEach(r => {
      if (!r || typeof r !== 'object') return;
      const charge = r['Charge On Invoice'] || '';
      const amount = parseFloat(r['Amount Total ($)'] || 0);
      const count = parseInt(r['Count Total'] || 0);
      const avg = parseFloat(r['Average ($)'] || 0);
      const chargeLower = charge.toLowerCase();
      
      metrics.totalCost += amount;
      
      if (chargeLower.includes('storage')) {
        breakdown.storage += amount;
      } else if (chargeLower.includes('shipping')) {
        breakdown.shipping += amount;
        metrics.shippingCount += count;
        metrics.avgShippingCost = avg; // Use the average from the row
      } else if (chargeLower.includes('first pick')) {
        breakdown.pickFees += amount;
        metrics.firstPickCount += count;
        metrics.orderCount += count; // First pick count = order count
      } else if (chargeLower.includes('additional pick')) {
        breakdown.pickFees += amount;
        metrics.additionalPickCount += count;
      } else if (chargeLower.includes('pick')) {
        breakdown.pickFees += amount;
      } else if (chargeLower.includes('box') || chargeLower.includes('mailer')) {
        breakdown.boxCharges += amount;
      } else if (chargeLower.includes('receiving')) {
        breakdown.receiving += amount;
      } else {
        breakdown.other += amount;
      }
    });
  });
  
  // Calculate derived metrics
  metrics.totalUnits = metrics.firstPickCount + metrics.additionalPickCount;
  
  if (metrics.orderCount > 0) {
    metrics.avgPickCost = breakdown.pickFees / metrics.orderCount;
    metrics.avgPackagingCost = breakdown.boxCharges / metrics.orderCount;
    // Fulfillment cost = everything except storage
    const fulfillmentCost = metrics.totalCost - breakdown.storage;
    metrics.avgCostPerOrder = fulfillmentCost / metrics.orderCount;
    metrics.avgUnitsPerOrder = metrics.totalUnits / metrics.orderCount;
  }
  
  return { breakdown, metrics };
};

export default function Dashboard() {
  const [view, setView] = useState('dashboard'); // Start with dashboard
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
  const [threeplTimeView, setThreeplTimeView] = useState('weekly'); // For 3PL analytics view
  const [uploadTab, setUploadTab] = useState('weekly'); // For upload view tabs
  const [dashboardRange, setDashboardRange] = useState('month'); // 'week' | 'month' | 'quarter' | 'year'

  const [storeName, setStoreName] = useState('');
  const [storeLogo, setStoreLogo] = useState(() => localStorage.getItem('ecommerce_store_logo') || null);

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
  setSession(null);
  // Clear any locked state
  setIsLocked(false);
};

  
  const [savedCogs, setSavedCogs] = useState({});
  const [savedProductNames, setSavedProductNames] = useState({}); // SKU -> Product Name mapping
  const [cogsLastUpdated, setCogsLastUpdated] = useState(null);
  const [showCogsManager, setShowCogsManager] = useState(false);
  const [showProductCatalog, setShowProductCatalog] = useState(false);
  const [productCatalogFile, setProductCatalogFile] = useState(null);
  const [productCatalogFileName, setProductCatalogFileName] = useState('');
  
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
  const [showEdit3PL, setShowEdit3PL] = useState(false);
  const [edit3PLCost, setEdit3PLCost] = useState('');
  const [lastBackupDate, setLastBackupDate] = useState(() => localStorage.getItem('ecommerce_last_backup') || null);
  const [lastSyncDate, setLastSyncDate] = useState(null);
  
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
  const [periodAnalyticsView, setPeriodAnalyticsView] = useState(null); // 'skus' | 'profit' | 'ads' | '3pl' | null
  
  // Sales Tax Management
  const [salesTaxConfig, setSalesTaxConfig] = useState({
    nexusStates: {}, // { stateCode: { hasNexus: true, frequency: 'monthly', registrationId: '', customFilings: [], notes: '' } }
    filingHistory: {}, // { stateCode: { 'YYYY-MM' or 'YYYY-QN': { filed: true, paidDate: '', amount: 0, confirmationNum: '', reportData: {} } } }
    hiddenStates: [], // states user wants to hide from view
  });
  const [selectedTaxState, setSelectedTaxState] = useState(null);
  const [taxReportFile, setTaxReportFile] = useState(null);
  const [taxReportFileName, setTaxReportFileName] = useState('');
  const [parsedTaxReport, setParsedTaxReport] = useState(null);
  const [showTaxStateConfig, setShowTaxStateConfig] = useState(false);
  const [taxConfigState, setTaxConfigState] = useState(null); // state being configured
  const [showHiddenStates, setShowHiddenStates] = useState(false);
  const [taxFilterStatus, setTaxFilterStatus] = useState('all'); // 'all' | 'due' | 'upcoming'
  
  // Settings view state
  const [localSettings, setLocalSettings] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
  // Sales tax modal state
  const [newCustomFiling, setNewCustomFiling] = useState({ name: '', frequency: 'annual', dueMonth: 1, dueDay: 15, amount: '' });
  const [taxFilingConfirmNum, setTaxFilingConfirmNum] = useState('');
  const [taxFilingPaidAmount, setTaxFilingPaidAmount] = useState('');
  const [taxFilingNotes, setTaxFilingNotes] = useState('');
  const [viewingStateHistory, setViewingStateHistory] = useState(null); // state code to view history for
  const [taxViewTab, setTaxViewTab] = useState('states'); // 'states' | 'history' | 'nexus-info'
  
  // AI Chatbot state
  const [showAIChat, setShowAIChat] = useState(false);
  const [aiMessages, setAiMessages] = useState([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  
  // Help modal
  const [showUploadHelp, setShowUploadHelp] = useState(false);
  
  // NEW FEATURES STATE
  // 1. Dashboard Widget Customization
  const [widgetConfig, setWidgetConfig] = useState(() => {
    try { return JSON.parse(localStorage.getItem(WIDGET_KEY)) || null; } catch { return null; }
  });
  const [editingWidgets, setEditingWidgets] = useState(false);
  
  // Production Pipeline
  const PRODUCTION_KEY = 'ecommerce_production_v1';
  const [productionPipeline, setProductionPipeline] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ecommerce_production_v1')) || []; } catch { return []; }
  });
  const [showAddProduction, setShowAddProduction] = useState(false);
  const [editingProduction, setEditingProduction] = useState(null);
  const [productionForm, setProductionForm] = useState({ sku: '', productName: '', quantity: '', expectedDate: '', notes: '' });
  const [productionFile, setProductionFile] = useState(null);
  const [productionFileName, setProductionFileName] = useState('');
  const [extractingProduction, setExtractingProduction] = useState(false);
  
  // 4. Browser Notifications
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  
  // 5. Forecasting
  const [showForecast, setShowForecast] = useState(false);
  
  // 7. Break-Even Calculator
  const [showBreakEven, setShowBreakEven] = useState(false);
  const [breakEvenInputs, setBreakEvenInputs] = useState({ adSpend: '', cogs: '', price: '', conversionRate: 2 });
  
  // 8. Notes/Journal
  const [weekNotes, setWeekNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem(NOTES_KEY)) || {}; } catch { return {}; }
  });
  const [editingNote, setEditingNote] = useState(null); // week key being edited
  const [noteText, setNoteText] = useState('');
  
  // 9. Theme Customization
  const [theme, setTheme] = useState(() => {
    try { return JSON.parse(localStorage.getItem(THEME_KEY)) || { mode: 'dark', accent: 'violet' }; } catch { return { mode: 'dark', accent: 'violet' }; }
  });
  
  // 10. CSV Export modal
  const [showExportModal, setShowExportModal] = useState(false);
  
  // 12. Comparison Mode
  const [compareMode, setCompareMode] = useState(false);
  const [compareItems, setCompareItems] = useState([]); // Array of week keys or SKUs to compare
  
  // Analytics view state
  const [analyticsTab, setAnalyticsTab] = useState('forecast');
  const [selectedSkusToCompare, setSelectedSkusToCompare] = useState([]);
  const [selectedWeeksToCompare, setSelectedWeeksToCompare] = useState([]);
  
  // 3. Mobile view detection
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Upcoming Invoices/Bills
  const [invoices, setInvoices] = useState(() => {
    try { return JSON.parse(localStorage.getItem(INVOICES_KEY)) || []; } catch { return []; }
  });
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [invoiceForm, setInvoiceForm] = useState({ vendor: '', description: '', amount: '', dueDate: '', recurring: false, frequency: 'monthly', category: 'operations' });
  const [processingPdf, setProcessingPdf] = useState(false);
  
  // Data Validation
  const [dataValidationWarnings, setDataValidationWarnings] = useState([]);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [pendingProcessAction, setPendingProcessAction] = useState(null);
  
  // Amazon Forecasts (from Amazon's SKU Economics forecast reports)
  const [amazonForecasts, setAmazonForecasts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(AMAZON_FORECAST_KEY)) || {}; } catch { return {}; }
  });
  
  // Save Amazon forecasts to localStorage and cloud
  useEffect(() => {
    localStorage.setItem(AMAZON_FORECAST_KEY, JSON.stringify(amazonForecasts));
  }, [amazonForecasts]);
  
  // Save invoices to localStorage and cloud
  useEffect(() => {
    localStorage.setItem(INVOICES_KEY, JSON.stringify(invoices));
  }, [invoices]);
  
  // Save notes to localStorage and cloud
  useEffect(() => {
    localStorage.setItem(NOTES_KEY, JSON.stringify(weekNotes));
  }, [weekNotes]);
  
  // Save goals to localStorage
  useEffect(() => {
    localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
  }, [goals]);
  
  // Save product names to localStorage
  useEffect(() => {
    localStorage.setItem(PRODUCT_NAMES_KEY, JSON.stringify(savedProductNames));
  }, [savedProductNames]);
  
  // Save production pipeline to localStorage
  useEffect(() => {
    localStorage.setItem('ecommerce_production_v1', JSON.stringify(productionPipeline));
  }, [productionPipeline]);
  
  // Save widget config to localStorage
  useEffect(() => {
    if (widgetConfig) localStorage.setItem(WIDGET_KEY, JSON.stringify(widgetConfig));
  }, [widgetConfig]);
  
  // Save theme to localStorage
  useEffect(() => {
    localStorage.setItem(THEME_KEY, JSON.stringify(theme));
  }, [theme]);
  
  // Save logo to localStorage
  useEffect(() => {
    if (storeLogo) {
      localStorage.setItem('ecommerce_store_logo', storeLogo);
    } else {
      localStorage.removeItem('ecommerce_store_logo');
    }
  }, [storeLogo]);
  
  // Mobile detection
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Request notification permission
  const requestNotifications = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationsEnabled(permission === 'granted');
    }
  };
  
  // Send browser notification
  const sendNotification = (title, body) => {
    if (notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' });
    }
  };
  
  // App Settings
  const [appSettings, setAppSettings] = useState({
    // Inventory thresholds
    inventoryDaysOptimal: 60, // Days of inventory considered optimal
    inventoryDaysLow: 30, // Days of inventory considered low
    inventoryDaysCritical: 14, // Days of inventory considered critical
    
    // Ad performance thresholds
    tacosOptimal: 15, // TACOS % considered optimal
    tacosWarning: 25, // TACOS % that triggers warning
    tacosMax: 35, // TACOS % considered too high
    roasTarget: 3.0, // Target ROAS
    
    // Profit thresholds
    marginTarget: 25, // Target net margin %
    marginWarning: 15, // Margin % that triggers warning
    
    // Module visibility
    modulesEnabled: {
      weeklyTracking: true,
      periodTracking: true,
      inventory: true,
      trends: true,
      yoy: true,
      skus: true,
      profitability: true,
      ads: true,
      threepl: true,
      salesTax: true,
    },
    
    // Dashboard preferences
    dashboardDefaultRange: 'month', // Default time range for dashboard
    showWeeklyGoals: true,
    showMonthlyGoals: true,
    
    // Alerts preferences
    alertSalesTaxDays: 7, // Days before due date to show alert
    alertInventoryEnabled: true,
    alertGoalsEnabled: true,
    alertSalesTaxEnabled: true,
    
    // Display preferences
    currencySymbol: '$',
    dateFormat: 'US', // 'US' (MM/DD/YYYY) or 'EU' (DD/MM/YYYY)
  });
  
  const clearPeriod3PLFiles = useCallback(() => {
    setPeriodFiles(p => ({ ...p, threepl: [] }));
    setPeriodFileNames(p => ({ ...p, threepl: [] }));
  }, []);

// US States with sales tax info - comprehensive list with economic nexus thresholds
const US_STATES_TAX_INFO = {
  AL: { name: 'Alabama', hasStateTax: true, stateRate: 0.04, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 250000, transactions: null }, marketplaceFacilitator: true, sst: true, note: 'Simplified Seller Use Tax (SSUT) program available' },
  AK: { name: 'Alaska', hasStateTax: false, stateRate: 0, filingTypes: ['local'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: false, note: 'No state tax, but must collect for ARSSTC member localities' },
  AZ: { name: 'Arizona', hasStateTax: true, stateRate: 0.056, filingTypes: ['state', 'county', 'city'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: false, note: 'TPT license required' },
  AR: { name: 'Arkansas', hasStateTax: true, stateRate: 0.065, filingTypes: ['state', 'local'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  CA: { name: 'California', hasStateTax: true, stateRate: 0.0725, filingTypes: ['state', 'district'], reportFormat: 'district', nexusThreshold: { sales: 500000, transactions: null }, marketplaceFacilitator: true, sst: false, note: 'Highest threshold - $500K sales required' },
  CO: { name: 'Colorado', hasStateTax: true, stateRate: 0.029, filingTypes: ['state', 'county', 'city', 'special'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: false, note: 'Home rule cities (Denver, Aurora, etc.) require separate registration' },
  CT: { name: 'Connecticut', hasStateTax: true, stateRate: 0.0635, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: false },
  DE: { name: 'Delaware', hasStateTax: false, stateRate: 0, filingTypes: [], reportFormat: 'none', nexusThreshold: null, marketplaceFacilitator: false, sst: false, note: 'No sales tax' },
  FL: { name: 'Florida', hasStateTax: true, stateRate: 0.06, filingTypes: ['state', 'county'], reportFormat: 'county', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: false },
  GA: { name: 'Georgia', hasStateTax: true, stateRate: 0.04, filingTypes: ['state', 'local'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  HI: { name: 'Hawaii', hasStateTax: true, stateRate: 0.04, filingTypes: ['state', 'county'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: false, note: 'GET (Gross Excise Tax) not traditional sales tax - applies to seller' },
  ID: { name: 'Idaho', hasStateTax: true, stateRate: 0.06, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: true },
  IL: { name: 'Illinois', hasStateTax: true, stateRate: 0.0625, filingTypes: ['state', 'local'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: false, note: 'ROT (Retailers Occupation Tax) - multiple local taxes' },
  IN: { name: 'Indiana', hasStateTax: true, stateRate: 0.07, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  IA: { name: 'Iowa', hasStateTax: true, stateRate: 0.06, filingTypes: ['state', 'local'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: true },
  KS: { name: 'Kansas', hasStateTax: true, stateRate: 0.065, filingTypes: ['state', 'county', 'city'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: true },
  KY: { name: 'Kentucky', hasStateTax: true, stateRate: 0.06, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  LA: { name: 'Louisiana', hasStateTax: true, stateRate: 0.0445, filingTypes: ['state', 'parish'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: false, note: 'Parish taxes filed through Louisiana Sales Tax Commission' },
  ME: { name: 'Maine', hasStateTax: true, stateRate: 0.055, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: false },
  MD: { name: 'Maryland', hasStateTax: true, stateRate: 0.06, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: false, note: 'Annual report & LLC fees required separately' },
  MA: { name: 'Massachusetts', hasStateTax: true, stateRate: 0.0625, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: false },
  MI: { name: 'Michigan', hasStateTax: true, stateRate: 0.06, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  MN: { name: 'Minnesota', hasStateTax: true, stateRate: 0.06875, filingTypes: ['state', 'local'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  MS: { name: 'Mississippi', hasStateTax: true, stateRate: 0.07, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 250000, transactions: null }, marketplaceFacilitator: true, sst: false },
  MO: { name: 'Missouri', hasStateTax: true, stateRate: 0.04225, filingTypes: ['state', 'local'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: false },
  MT: { name: 'Montana', hasStateTax: false, stateRate: 0, filingTypes: [], reportFormat: 'none', nexusThreshold: null, marketplaceFacilitator: false, sst: false, note: 'No sales tax' },
  NE: { name: 'Nebraska', hasStateTax: true, stateRate: 0.055, filingTypes: ['state', 'local'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  NV: { name: 'Nevada', hasStateTax: true, stateRate: 0.0685, filingTypes: ['state', 'county'], reportFormat: 'county', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  NH: { name: 'New Hampshire', hasStateTax: false, stateRate: 0, filingTypes: [], reportFormat: 'none', nexusThreshold: null, marketplaceFacilitator: false, sst: false, note: 'No sales tax' },
  NJ: { name: 'New Jersey', hasStateTax: true, stateRate: 0.06625, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  NM: { name: 'New Mexico', hasStateTax: true, stateRate: 0.05125, filingTypes: ['state', 'local'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: false, note: 'Gross Receipts Tax (GRT) - not traditional sales tax' },
  NY: { name: 'New York', hasStateTax: true, stateRate: 0.04, filingTypes: ['state', 'county', 'city'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 500000, transactions: 100 }, marketplaceFacilitator: true, sst: false, note: 'High threshold - $500K AND 100+ transactions required' },
  NC: { name: 'North Carolina', hasStateTax: true, stateRate: 0.0475, filingTypes: ['state', 'county'], reportFormat: 'county', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  ND: { name: 'North Dakota', hasStateTax: true, stateRate: 0.05, filingTypes: ['state', 'local'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: true },
  OH: { name: 'Ohio', hasStateTax: true, stateRate: 0.0575, filingTypes: ['state', 'county'], reportFormat: 'county', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  OK: { name: 'Oklahoma', hasStateTax: true, stateRate: 0.045, filingTypes: ['state', 'county', 'city'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: true },
  OR: { name: 'Oregon', hasStateTax: false, stateRate: 0, filingTypes: [], reportFormat: 'none', nexusThreshold: null, marketplaceFacilitator: false, sst: false, note: 'No sales tax' },
  PA: { name: 'Pennsylvania', hasStateTax: true, stateRate: 0.06, filingTypes: ['state', 'local'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: false, note: 'Philadelphia & Allegheny County have additional local taxes' },
  RI: { name: 'Rhode Island', hasStateTax: true, stateRate: 0.07, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  SC: { name: 'South Carolina', hasStateTax: true, stateRate: 0.06, filingTypes: ['state', 'local'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: true },
  SD: { name: 'South Dakota', hasStateTax: true, stateRate: 0.045, filingTypes: ['state', 'municipal'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true, note: 'Origin of Wayfair decision' },
  TN: { name: 'Tennessee', hasStateTax: true, stateRate: 0.07, filingTypes: ['state', 'local'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: true },
  TX: { name: 'Texas', hasStateTax: true, stateRate: 0.0625, filingTypes: ['state', 'local'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 500000, transactions: null }, marketplaceFacilitator: true, sst: false, note: 'High threshold - $500K sales required' },
  UT: { name: 'Utah', hasStateTax: true, stateRate: 0.0485, filingTypes: ['state', 'local'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  VT: { name: 'Vermont', hasStateTax: true, stateRate: 0.06, filingTypes: ['state', 'local'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  VA: { name: 'Virginia', hasStateTax: true, stateRate: 0.043, filingTypes: ['state', 'local'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: false },
  WA: { name: 'Washington', hasStateTax: true, stateRate: 0.065, filingTypes: ['state', 'local'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: true, note: 'B&O tax also applies to some sellers' },
  WV: { name: 'West Virginia', hasStateTax: true, stateRate: 0.06, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  WI: { name: 'Wisconsin', hasStateTax: true, stateRate: 0.05, filingTypes: ['state', 'county'], reportFormat: 'county', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: true },
  WY: { name: 'Wyoming', hasStateTax: true, stateRate: 0.04, filingTypes: ['state', 'local'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  DC: { name: 'District of Columbia', hasStateTax: true, stateRate: 0.06, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: false },
};

// Filing frequency due date calculator
const getNextDueDate = (frequency, stateCode) => {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const currentDay = now.getDate();
  
  // Most states have 20th of month due dates, some vary
  const dueDayOfMonth = 20;
  
  if (frequency === 'monthly') {
    // Due 20th of following month
    let dueMonth = currentMonth + 1;
    let dueYear = currentYear;
    if (dueMonth > 11) { dueMonth = 0; dueYear++; }
    const dueDate = new Date(dueYear, dueMonth, dueDayOfMonth);
    if (dueDate <= now) {
      dueMonth++;
      if (dueMonth > 11) { dueMonth = 0; dueYear++; }
      return new Date(dueYear, dueMonth, dueDayOfMonth);
    }
    return dueDate;
  } else if (frequency === 'quarterly') {
    // Q1 (Jan-Mar) due Apr 20, Q2 (Apr-Jun) due Jul 20, Q3 (Jul-Sep) due Oct 20, Q4 (Oct-Dec) due Jan 20
    const quarterEnds = [[3, 20], [6, 20], [9, 20], [0, 20]]; // [month, day]
    const quarterYears = [0, 0, 0, 1]; // year offset
    for (let i = 0; i < 4; i++) {
      const [m, d] = quarterEnds[i];
      const y = currentYear + quarterYears[i];
      const dueDate = new Date(y, m, d);
      if (dueDate > now) return dueDate;
    }
    return new Date(currentYear + 1, 3, 20);
  } else if (frequency === 'semi-annual') {
    // Jan-Jun due Jul 20, Jul-Dec due Jan 20
    const h1Due = new Date(currentYear, 6, 20); // Jul 20
    const h2Due = new Date(currentYear + 1, 0, 20); // Jan 20 next year
    if (h1Due > now) return h1Due;
    if (h2Due > now) return h2Due;
    return new Date(currentYear + 1, 6, 20);
  } else if (frequency === 'annual') {
    // Due Jan 20 of following year
    const dueDate = new Date(currentYear + 1, 0, 20);
    if (dueDate <= now) return new Date(currentYear + 2, 0, 20);
    return dueDate;
  }
  return new Date(currentYear, currentMonth + 1, 20);
};

// Parse Shopify tax report - handles jurisdiction-based reports
const parseShopifyTaxReport = (csvData, stateCode) => {
  const stateInfo = US_STATES_TAX_INFO[stateCode];
  const result = {
    state: stateCode,
    stateName: stateInfo?.name || stateCode,
    periodStart: null,
    periodEnd: null,
    totalSales: 0,
    totalTaxableSales: 0,
    totalExemptSales: 0,
    totalTaxCollected: 0,
    stateTax: 0,
    countyTax: 0,
    cityTax: 0,
    specialTax: 0,
    jurisdictions: [],
    byType: { state: [], county: [], city: [], special: [] }
  };
  
  csvData.forEach(row => {
    const jurisdiction = row['Tax jurisdiction'] || '';
    const type = (row['Tax jurisdiction type'] || '').toLowerCase();
    const county = (row['Tax county'] || '').trim();
    const code = row['Tax jurisdiction code'] || '';
    const rate = parseFloat(row['Tax rate'] || 0);
    const totalSales = parseFloat(row['Total net item sales'] || 0);
    const taxableSales = parseFloat(row['Total taxable item sales'] || 0);
    const exemptSales = parseFloat(row['Total exempt and non-taxable item sales'] || 0);
    const itemTax = parseFloat(row['Total item tax amount'] || 0);
    const shippingTax = parseFloat(row['Total shipping tax amount'] || 0);
    const totalTax = itemTax + shippingTax;
    
    result.totalSales += totalSales;
    result.totalTaxableSales += taxableSales;
    result.totalExemptSales += exemptSales;
    result.totalTaxCollected += totalTax;
    
    const jurisdictionData = {
      name: jurisdiction,
      type,
      county: county.replace(' -', '').trim(),
      code,
      rate,
      totalSales,
      taxableSales,
      exemptSales,
      taxAmount: totalTax
    };
    
    result.jurisdictions.push(jurisdictionData);
    
    if (type === 'state') {
      result.stateTax += totalTax;
      result.byType.state.push(jurisdictionData);
    } else if (type === 'county') {
      result.countyTax += totalTax;
      result.byType.county.push(jurisdictionData);
    } else if (type === 'city') {
      result.cityTax += totalTax;
      result.byType.city.push(jurisdictionData);
    } else {
      result.specialTax += totalTax;
      result.byType.special.push(jurisdictionData);
    }
  });
  
  return result;
};

const combinedData = useMemo(() => ({
  sales: allWeeksData,
  inventory: invHistory,
  cogs: { lookup: savedCogs, updatedAt: cogsLastUpdated },
  periods: allPeriodsData,
  storeName,
  storeLogo,
  salesTax: salesTaxConfig,
  settings: appSettings,
  // New features
  invoices,
  amazonForecasts,
  weekNotes,
  goals,
  productNames: savedProductNames,
  theme,
  productionPipeline,
}), [allWeeksData, invHistory, savedCogs, cogsLastUpdated, allPeriodsData, storeName, storeLogo, salesTaxConfig, appSettings, invoices, amazonForecasts, weekNotes, goals, savedProductNames, theme, productionPipeline]);

const loadFromLocal = useCallback(() => {
  try {
    const r = lsGet(STORAGE_KEY);
    if (r) {
      const d = JSON.parse(r);
      setAllWeeksData(d);
      const w = Object.keys(d).sort().reverse();
      if (w.length) { setSelectedWeek(w[0]); }
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

  // Load product names
  try {
    const names = lsGet(PRODUCT_NAMES_KEY);
    if (names) setSavedProductNames(JSON.parse(names));
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

  try {
    const r = lsGet(SALES_TAX_KEY);
    if (r) setSalesTaxConfig(JSON.parse(r));
  } catch {}

  try {
    const r = lsGet(SETTINGS_KEY);
    if (r) setAppSettings(prev => ({ ...prev, ...JSON.parse(r) }));
  } catch {}
}, []);

const saveGoals = useCallback((newGoals) => {
  setGoals(newGoals);
  lsSet(GOALS_KEY, JSON.stringify(newGoals));
  setShowGoalsModal(false);
}, []);

const saveSalesTax = useCallback((newConfig) => {
  setSalesTaxConfig(newConfig);
  lsSet(SALES_TAX_KEY, JSON.stringify(newConfig));
}, []);

const saveSettings = useCallback((newSettings) => {
  setAppSettings(newSettings);
  lsSet(SETTINGS_KEY, JSON.stringify(newSettings));
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
  setLastSyncDate(new Date().toISOString());
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

// Sync new features to cloud when they change
useEffect(() => {
  if (!session?.user?.id || !supabase) return;
  queueCloudSave(combinedData);
}, [invoices, amazonForecasts, weekNotes, goals, savedProductNames, theme, productionPipeline]);

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
    if (w.length) { setSelectedWeek(w[0]); }
    setInvHistory(cloud.inventory || {});
    setSavedCogs(cloud.cogs?.lookup || {});
    setCogsLastUpdated(cloud.cogs?.updatedAt || null);
    setAllPeriodsData(cloud.periods || {});
    setStoreName(cloud.storeName || '');
    if (cloud.storeLogo) setStoreLogo(cloud.storeLogo);
    setSalesTaxConfig(cloud.salesTax || { nexusStates: {}, filingHistory: {}, hiddenStates: [] });
    if (cloud.settings) setAppSettings(prev => ({ ...prev, ...cloud.settings }));
    
    // Load new features from cloud
    if (cloud.invoices) setInvoices(cloud.invoices);
    if (cloud.amazonForecasts) setAmazonForecasts(cloud.amazonForecasts);
    if (cloud.weekNotes) setWeekNotes(cloud.weekNotes);
    if (cloud.goals) setGoals(cloud.goals);
    if (cloud.productNames) setSavedProductNames(cloud.productNames);
    if (cloud.theme) setTheme(cloud.theme);
    if (cloud.productionPipeline) setProductionPipeline(cloud.productionPipeline);

    // Also keep localStorage in sync for offline backup
    writeToLocal(STORAGE_KEY, JSON.stringify(cloud.sales || {}));
    writeToLocal(INVENTORY_KEY, JSON.stringify(cloud.inventory || {}));
    writeToLocal(COGS_KEY, JSON.stringify({ lookup: cloud.cogs?.lookup || {}, updatedAt: cloud.cogs?.updatedAt || null }));
    writeToLocal(PERIODS_KEY, JSON.stringify(cloud.periods || {}));
    writeToLocal(STORE_KEY, cloud.storeName || '');
    if (cloud.storeLogo) localStorage.setItem('ecommerce_store_logo', cloud.storeLogo);
    writeToLocal(SALES_TAX_KEY, JSON.stringify(cloud.salesTax || { nexusStates: {}, filingHistory: {}, hiddenStates: [] }));
    if (cloud.settings) writeToLocal(SETTINGS_KEY, JSON.stringify(cloud.settings));
    if (cloud.invoices) writeToLocal(INVOICES_KEY, JSON.stringify(cloud.invoices));
    if (cloud.amazonForecasts) writeToLocal(AMAZON_FORECAST_KEY, JSON.stringify(cloud.amazonForecasts));
    if (cloud.weekNotes) writeToLocal(NOTES_KEY, JSON.stringify(cloud.weekNotes));
    if (cloud.goals) writeToLocal(GOALS_KEY, JSON.stringify(cloud.goals));
    if (cloud.productNames) writeToLocal(PRODUCT_NAMES_KEY, JSON.stringify(cloud.productNames));
    if (cloud.theme) writeToLocal(THEME_KEY, JSON.stringify(cloud.theme));
    if (cloud.productionPipeline) localStorage.setItem('ecommerce_production_v1', JSON.stringify(cloud.productionPipeline));
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
    try {
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

    // Use enhanced 3PL parser
    const threeplData = parse3PLData(reprocessFiles.threepl);
    const threeplCost = threeplData.metrics.totalCost;
    const threeplBreakdown = threeplData.breakdown;
    const threeplMetrics = threeplData.metrics;

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
      shopify: { revenue: shopRev, units: shopUnits, cogs: shopCogs, threeplCosts: threeplCost, threeplBreakdown, threeplMetrics, adSpend: shopAds, metaSpend: metaS, googleSpend: googleS, discounts: shopDisc, netProfit: shopProfit, 
        netMargin: shopRev > 0 ? (shopProfit/shopRev)*100 : 0, aov: shopUnits > 0 ? shopRev/shopUnits : 0, roas: shopAds > 0 ? shopRev/shopAds : 0, skuData: shopifySkus },
      total: { revenue: totalRev, units: amzUnits + shopUnits, cogs: totalCogs, adSpend: amzAds + shopAds, netProfit: totalProfit, netMargin: totalRev > 0 ? (totalProfit/totalRev)*100 : 0, roas: (amzAds + shopAds) > 0 ? totalRev/(amzAds + shopAds) : 0, amazonShare: totalRev > 0 ? (amzRev/totalRev)*100 : 0, shopifyShare: totalRev > 0 ? (shopRev/totalRev)*100 : 0 }
    };

    const updated = { ...allWeeksData, [weekKey]: weekData };
    setAllWeeksData(updated); save(updated);
    setShowReprocess(false);
    setReprocessFiles({ amazon: null, shopify: null, threepl: null });
    setReprocessFileNames({ amazon: '', shopify: '', threepl: '' });
    setReprocessAdSpend({ meta: '', google: '' });
    } catch (err) {
      console.error('Reprocess error:', err);
      alert('Error reprocessing: ' + err.message);
    }
  }, [reprocessFiles, reprocessAdSpend, allWeeksData, savedCogs]);

  const getCogsLookup = useCallback(() => {
    const lookup = { ...savedCogs };
    if (files.cogs) files.cogs.forEach(r => { const s = r['SKU'] || r['sku']; const c = parseFloat(r['Cost Per Unit'] || 0); if (s && c) lookup[s] = c; });
    return lookup;
  }, [savedCogs, files.cogs]);

  const processAndSaveCogs = useCallback(() => {
    if (!files.cogs) return;
    const lookup = {};
    const names = {};
    files.cogs.forEach(r => { 
      const s = r['SKU'] || r['sku']; 
      const c = parseFloat(r['Cost Per Unit'] || 0); 
      const name = r['Product Name'] || r['Product Name '] || r['product name'] || r['Name'] || r['name'] || '';
      if (s) {
        lookup[s] = c;
        if (name) names[s] = name.trim();
      }
    });
    saveCogs(lookup);
    setSavedProductNames(names);
    // Save product names to localStorage
    try { localStorage.setItem(PRODUCT_NAMES_KEY, JSON.stringify(names)); } catch(e) {}
    setFiles(p => ({ ...p, cogs: null })); setFileNames(p => ({ ...p, cogs: '' })); setShowCogsManager(false);
  }, [files.cogs]);

  // Data Validation Function
  const validateUploadData = useCallback((type, data) => {
    const warnings = [];
    const errors = [];
    
    if (type === 'amazon' && data) {
      // Check for required columns
      const requiredCols = ['MSKU', 'Net sales', 'Units sold'];
      const sampleRow = data[0] || {};
      const missingCols = requiredCols.filter(col => !(col in sampleRow));
      if (missingCols.length > 0) {
        errors.push({ type: 'error', message: `Missing required columns: ${missingCols.join(', ')}`, detail: 'Make sure you downloaded the SKU Economics report' });
      }
      
      // Check for data quality
      let negativeRevenue = 0, zeroUnits = 0, missingSku = 0, totalRows = 0;
      data.forEach(row => {
        totalRows++;
        const revenue = parseFloat(row['Net sales'] || 0);
        const units = parseInt(row['Units sold'] || 0);
        const sku = row['MSKU'] || '';
        
        if (revenue < 0) negativeRevenue++;
        if (units === 0 && revenue > 0) zeroUnits++;
        if (!sku && (units > 0 || revenue > 0)) missingSku++;
      });
      
      if (negativeRevenue > 0) {
        warnings.push({ type: 'warning', message: `${negativeRevenue} rows have negative revenue`, detail: 'This may be due to refunds - usually OK' });
      }
      if (zeroUnits > totalRows * 0.5 && totalRows > 5) {
        warnings.push({ type: 'warning', message: `${zeroUnits} of ${totalRows} rows have 0 units`, detail: 'Check if this is the correct date range' });
      }
      if (missingSku > 0) {
        warnings.push({ type: 'warning', message: `${missingSku} rows missing SKU`, detail: 'These rows will be skipped' });
      }
      if (totalRows === 0) {
        errors.push({ type: 'error', message: 'No data rows found', detail: 'The file appears to be empty' });
      }
      if (totalRows < 3 && totalRows > 0) {
        warnings.push({ type: 'info', message: `Only ${totalRows} SKUs found`, detail: 'This seems low - verify the date range' });
      }
    }
    
    if (type === 'shopify' && data) {
      // Check for required columns
      const requiredCols = ['Product variant SKU', 'Net sales', 'Net items sold'];
      const sampleRow = data[0] || {};
      const missingCols = requiredCols.filter(col => !(col in sampleRow));
      if (missingCols.length > 0) {
        errors.push({ type: 'error', message: `Missing required columns: ${missingCols.join(', ')}`, detail: 'Make sure you downloaded Sales by product variant SKU' });
      }
      
      // Check data quality
      let negativeRevenue = 0, missingSku = 0, totalRows = 0;
      data.forEach(row => {
        totalRows++;
        const revenue = parseFloat(row['Net sales'] || 0);
        const sku = row['Product variant SKU'] || '';
        
        if (revenue < 0) negativeRevenue++;
        if (!sku && revenue !== 0) missingSku++;
      });
      
      if (negativeRevenue > 0) {
        warnings.push({ type: 'warning', message: `${negativeRevenue} rows have negative revenue`, detail: 'This may be due to refunds - usually OK' });
      }
      if (missingSku > 0) {
        warnings.push({ type: 'warning', message: `${missingSku} rows missing SKU`, detail: 'These rows will be grouped as unknown' });
      }
      if (totalRows === 0) {
        errors.push({ type: 'error', message: 'No data rows found', detail: 'The file appears to be empty' });
      }
    }
    
    if (type === 'cogs' && data) {
      let missingCost = 0, negativeCost = 0, zeroCost = 0, totalRows = 0;
      data.forEach(row => {
        const sku = row['SKU'] || row['sku'] || row['MSKU'] || row['Product variant SKU'] || '';
        const cost = parseFloat(row['Cost'] || row['cost'] || row['COGS'] || row['cogs'] || row['Cost Per Unit'] || row['Unit Cost'] || 0);
        if (sku) {
          totalRows++;
          if (isNaN(cost) || cost === 0) zeroCost++;
          if (cost < 0) negativeCost++;
        }
      });
      
      if (zeroCost > totalRows * 0.3 && totalRows > 0) {
        warnings.push({ type: 'warning', message: `${zeroCost} of ${totalRows} SKUs have $0 cost`, detail: 'Make sure COGS column is correctly named' });
      }
      if (negativeCost > 0) {
        errors.push({ type: 'error', message: `${negativeCost} SKUs have negative cost`, detail: 'COGS values should be positive' });
      }
    }
    
    if (type === 'inventory' && data) {
      let negativeQty = 0, totalRows = 0;
      data.forEach(row => {
        const qty = parseInt(row['Quantity'] || row['quantity'] || row['Available'] || row['available'] || row['Total units'] || 0);
        totalRows++;
        if (qty < 0) negativeQty++;
      });
      
      if (negativeQty > 0) {
        warnings.push({ type: 'warning', message: `${negativeQty} items have negative quantity`, detail: 'This may indicate data issues' });
      }
    }
    
    // Check for date range issues
    if ((type === 'amazon' || type === 'shopify') && data && data.length > 0) {
      const firstRow = data[0];
      const startDate = firstRow['Start date'] || firstRow['start_date'] || '';
      const endDate = firstRow['End date'] || firstRow['end_date'] || '';
      
      if (startDate && endDate && weekEnding) {
        const reportEnd = new Date(endDate);
        const selectedEnd = new Date(weekEnding + 'T00:00:00');
        const daysDiff = Math.abs((reportEnd - selectedEnd) / (1000 * 60 * 60 * 24));
        
        if (daysDiff > 3) {
          warnings.push({ 
            type: 'warning', 
            message: `Report date (${endDate}) doesn't match selected week (${weekEnding})`, 
            detail: `There's a ${Math.round(daysDiff)} day difference - verify you selected the correct date` 
          });
        }
      }
      
      // Check for SKUs missing COGS
      const cogsLookup = { ...savedCogs };
      if (Object.keys(cogsLookup).length > 0) {
        const skusWithoutCogs = [];
        data.forEach(row => {
          const sku = type === 'amazon' ? row['MSKU'] : row['Product variant SKU'];
          const units = type === 'amazon' ? parseInt(row['Units sold'] || 0) : parseInt(row['Net items sold'] || 0);
          if (sku && units > 0 && !cogsLookup[sku]) {
            if (!skusWithoutCogs.includes(sku)) skusWithoutCogs.push(sku);
          }
        });
        
        if (skusWithoutCogs.length > 0) {
          warnings.push({ 
            type: 'warning', 
            message: `${skusWithoutCogs.length} SKUs missing COGS`, 
            detail: `These SKUs will show $0 cost: ${skusWithoutCogs.slice(0, 5).join(', ')}${skusWithoutCogs.length > 5 ? '...' : ''}` 
          });
        }
      }
    }
    
    return { warnings, errors, hasErrors: errors.length > 0 };
  }, [weekEnding, savedCogs]);

  // Validation Modal Component (defined inline for access to state)
  const ValidationModal = () => {
    if (!showValidationModal) return null;
    const hasErrors = dataValidationWarnings.some(w => w.type === 'error');
    
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto">
          <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            {hasErrors ? <AlertCircle className="w-6 h-6 text-rose-400" /> : <AlertTriangle className="w-6 h-6 text-amber-400" />}
            Data Validation {hasErrors ? 'Errors' : 'Warnings'}
          </h2>
          <p className="text-slate-400 text-sm mb-4">
            {hasErrors ? 'Please fix these issues before proceeding:' : 'Review these warnings before proceeding:'}
          </p>
          
          <div className="space-y-3 mb-6">
            {dataValidationWarnings.map((warning, idx) => (
              <div key={idx} className={`rounded-lg p-3 ${
                warning.type === 'error' ? 'bg-rose-900/30 border border-rose-500/50' :
                warning.type === 'warning' ? 'bg-amber-900/30 border border-amber-500/50' :
                'bg-blue-900/30 border border-blue-500/50'
              }`}>
                <p className={`font-medium ${
                  warning.type === 'error' ? 'text-rose-300' :
                  warning.type === 'warning' ? 'text-amber-300' :
                  'text-blue-300'
                }`}>
                  {warning.type === 'error' ? '❌' : warning.type === 'warning' ? '⚠️' : 'ℹ️'} {warning.message}
                </p>
                {warning.detail && <p className="text-slate-400 text-sm mt-1">{warning.detail}</p>}
              </div>
            ))}
          </div>
          
          <div className="flex gap-3">
            {!hasErrors && (
              <button 
                onClick={() => {
                  setShowValidationModal(false);
                  if (pendingProcessAction) {
                    pendingProcessAction();
                    setPendingProcessAction(null);
                  }
                }} 
                className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2 rounded-lg"
              >
                Continue Anyway
              </button>
            )}
            <button 
              onClick={() => { 
                setShowValidationModal(false); 
                setPendingProcessAction(null);
                setDataValidationWarnings([]);
              }} 
              className={`${hasErrors ? 'flex-1' : ''} bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg`}
            >
              {hasErrors ? 'Go Back & Fix' : 'Cancel'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const processSales = useCallback(() => {
    const cogsLookup = getCogsLookup();
    if (!files.amazon || !files.shopify || !weekEnding) { alert('Upload Amazon & Shopify files and select date'); return; }
    if (Object.keys(cogsLookup).length === 0) { alert('Set up COGS first via the COGS button'); return; }
    
    // Validate data before processing
    const amazonValidation = validateUploadData('amazon', files.amazon);
    const shopifyValidation = validateUploadData('shopify', files.shopify);
    const allWarnings = [...amazonValidation.warnings, ...amazonValidation.errors, ...shopifyValidation.warnings, ...shopifyValidation.errors];
    
    if (allWarnings.length > 0) {
      setDataValidationWarnings(allWarnings);
      setPendingProcessAction(() => processSalesCore);
      setShowValidationModal(true);
      return;
    }
    
    processSalesCore();
  }, [files, adSpend, weekEnding, allWeeksData, getCogsLookup, validateUploadData]);
  
  const processSalesCore = useCallback(() => {
    const cogsLookup = getCogsLookup();
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

    // Use enhanced 3PL parser
    const threeplData = parse3PLData(files.threepl);
    const threeplCost = threeplData.metrics.totalCost;
    const threeplBreakdown = threeplData.breakdown;
    const threeplMetrics = threeplData.metrics;

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
      shopify: { revenue: shopRev, units: shopUnits, cogs: shopCogs, threeplCosts: threeplCost, threeplBreakdown, threeplMetrics, adSpend: shopAds, metaSpend: metaS, googleSpend: googleS, discounts: shopDisc, netProfit: shopProfit, 
        netMargin: shopRev > 0 ? (shopProfit/shopRev)*100 : 0, aov: shopUnits > 0 ? shopRev/shopUnits : 0, roas: shopAds > 0 ? shopRev/shopAds : 0, skuData: shopifySkus },
      total: { revenue: totalRev, units: amzUnits + shopUnits, cogs: totalCogs, adSpend: amzAds + shopAds, netProfit: totalProfit, netMargin: totalRev > 0 ? (totalProfit/totalRev)*100 : 0, roas: (amzAds + shopAds) > 0 ? totalRev/(amzAds + shopAds) : 0, amazonShare: totalRev > 0 ? (amzRev/totalRev)*100 : 0, shopifyShare: totalRev > 0 ? (shopRev/totalRev)*100 : 0 }
    };

    const updated = { ...allWeeksData, [weekEnding]: weekData };
    setAllWeeksData(updated); save(updated); setSelectedWeek(weekEnding); setView('weekly'); setIsProcessing(false);
    setFiles({ amazon: null, shopify: null, cogs: null, threepl: [] }); setFileNames({ amazon: '', shopify: '', cogs: '', threepl: [] }); setAdSpend({ meta: '', google: '' }); setWeekEnding('');
    setToast({ message: 'Week data saved successfully!', type: 'success' });
  }, [files, adSpend, weekEnding, allWeeksData, getCogsLookup, save]);

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
    
    // Validate data before processing
    const amazonValidation = validateUploadData('amazon', periodFiles.amazon);
    const shopifyValidation = validateUploadData('shopify', periodFiles.shopify);
    const allWarnings = [...amazonValidation.warnings, ...amazonValidation.errors, ...shopifyValidation.warnings, ...shopifyValidation.errors];
    
    if (allWarnings.length > 0) {
      setDataValidationWarnings(allWarnings);
      setPendingProcessAction(() => processPeriodCore);
      setShowValidationModal(true);
      return;
    }
    
    processPeriodCore();
  }, [periodFiles, periodAdSpend, periodLabel, savedCogs, allPeriodsData, validateUploadData]);
  
  const processPeriodCore = useCallback(() => {
    const cogsLookup = { ...savedCogs };
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

    // Use enhanced 3PL parser
    const threeplData = parse3PLData(periodFiles.threepl);
    const threeplCost = threeplData.metrics.totalCost;
    const threeplBreakdown = threeplData.breakdown;
    const threeplMetrics = threeplData.metrics;

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
      shopify: { revenue: shopRev, units: shopUnits, cogs: shopCogs, threeplCosts: threeplCost, threeplBreakdown, threeplMetrics, adSpend: shopAds, metaSpend: metaS, googleSpend: googleS, discounts: shopDisc, netProfit: shopProfit, 
        netMargin: shopRev > 0 ? (shopProfit/shopRev)*100 : 0, aov: shopUnits > 0 ? shopRev/shopUnits : 0, roas: shopAds > 0 ? shopRev/shopAds : 0, skuData: shopifySkus },
      total: { revenue: totalRev, units: amzUnits + shopUnits, cogs: totalCogs, adSpend: amzAds + shopAds, netProfit: totalProfit, netMargin: totalRev > 0 ? (totalProfit/totalRev)*100 : 0, roas: (amzAds + shopAds) > 0 ? totalRev/(amzAds + shopAds) : 0, amazonShare: totalRev > 0 ? (amzRev/totalRev)*100 : 0, shopifyShare: totalRev > 0 ? (shopRev/totalRev)*100 : 0 }
    };

    const periodKey = periodLabel.trim().toLowerCase().replace(/\s+/g, '-');
    const updated = { ...allPeriodsData, [periodKey]: periodData };
    setAllPeriodsData(updated); savePeriods(updated); setSelectedPeriod(periodKey); setView('period-view'); setIsProcessing(false);
    setPeriodFiles({ amazon: null, shopify: null, threepl: [] }); setPeriodFileNames({ amazon: '', shopify: '', threepl: [] }); setPeriodAdSpend({ meta: '', google: '' }); setPeriodLabel('');
    setToast({ message: 'Period data saved successfully!', type: 'success' });
  }, [periodFiles, periodAdSpend, periodLabel, allPeriodsData, savedCogs, savePeriods]);

  const deletePeriod = (k) => { if (!confirm(`Delete ${k}?`)) return; const u = { ...allPeriodsData }; delete u[k]; setAllPeriodsData(u); savePeriods(u); const r = Object.keys(u).sort().reverse(); if (r.length) setSelectedPeriod(r[0]); else { setUploadTab('period'); setView('upload'); setSelectedPeriod(null); }};

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

  // Update 3PL costs for a week
  const updateWeek3PL = useCallback((weekKey, threeplCost) => {
    const week = allWeeksData[weekKey];
    if (!week) return;
    const newCost = parseFloat(threeplCost) || 0;
    const oldCost = week.shopify?.threeplCosts || 0;
    const shopProfit = (week.shopify?.netProfit || 0) + oldCost - newCost; // adjust profit
    const updated = { ...allWeeksData };
    updated[weekKey] = {
      ...week,
      shopify: { 
        ...week.shopify, 
        threeplCosts: newCost, 
        netProfit: shopProfit,
        netMargin: week.shopify?.revenue > 0 ? (shopProfit / week.shopify.revenue) * 100 : 0,
      },
      total: { 
        ...week.total, 
        netProfit: (week.amazon?.netProfit || 0) + shopProfit,
        netMargin: week.total?.revenue > 0 ? (((week.amazon?.netProfit || 0) + shopProfit) / week.total.revenue) * 100 : 0,
      }
    };
    setAllWeeksData(updated); 
    save(updated); 
    setShowEdit3PL(false);
    setToast({ message: '3PL costs updated', type: 'success' });
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

  // COMPLETE BACKUP - includes ALL dashboard data
  const exportAll = () => { 
    const fullBackup = {
      version: '2.1',
      exportedAt: new Date().toISOString(),
      storeName,
      storeLogo,
      // Core sales data
      sales: allWeeksData, 
      periods: allPeriodsData,
      inventory: invHistory, 
      cogs: savedCogs,
      // Settings & config
      goals,
      settings: appSettings,
      salesTaxConfig,
      productNames: savedProductNames,
      theme,
      // New features
      invoices,
      amazonForecasts,
      weekNotes,
      productionPipeline,
    };
    const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' }); 
    const a = document.createElement('a'); 
    a.href = URL.createObjectURL(blob); 
    a.download = `${storeName || 'dashboard'}_FULL_backup_${new Date().toISOString().split('T')[0]}.json`; 
    a.click();
    // Track last backup date
    const now = new Date().toISOString();
    localStorage.setItem('ecommerce_last_backup', now);
    setLastBackupDate(now);
    setToast({ message: 'Backup downloaded successfully', type: 'success' });
  };
  
  // COMPLETE RESTORE - restores ALL dashboard data
  const importData = (file) => { 
    const reader = new FileReader(); 
    reader.onload = async (e) => { 
      try { 
        const d = JSON.parse(e.target.result); 
        let restored = [];
        
        // Core data
        if (d.sales && Object.keys(d.sales).length > 0) { 
          setAllWeeksData(prev => ({...prev, ...d.sales})); 
          await save({...allWeeksData, ...d.sales}); 
          restored.push(`${Object.keys(d.sales).length} weeks`);
        } 
        if (d.inventory && Object.keys(d.inventory).length > 0) { 
          setInvHistory(prev => ({...prev, ...d.inventory})); 
          await saveInv({...invHistory, ...d.inventory}); 
          restored.push('inventory');
        } 
        if (d.cogs && Object.keys(d.cogs).length > 0) { 
          setSavedCogs(d.cogs); 
          await saveCogs(d.cogs); 
          restored.push('COGS');
        } 
        if (d.periods && Object.keys(d.periods).length > 0) { 
          setAllPeriodsData(prev => ({...prev, ...d.periods})); 
          await savePeriods({...allPeriodsData, ...d.periods}); 
          restored.push(`${Object.keys(d.periods).length} periods`);
        } 
        if (d.goals) { 
          setGoals(d.goals); 
          lsSet(GOALS_KEY, JSON.stringify(d.goals)); 
          restored.push('goals');
        } 
        if (d.storeName) { 
          setStoreName(d.storeName); 
          lsSet(STORE_KEY, d.storeName); 
        }
        
        // Settings & config
        if (d.settings) {
          setAppSettings(d.settings);
          lsSet(SETTINGS_KEY, JSON.stringify(d.settings));
          restored.push('settings');
        }
        if (d.salesTaxConfig) {
          setSalesTaxConfig(d.salesTaxConfig);
          lsSet(SALES_TAX_KEY, JSON.stringify(d.salesTaxConfig));
          restored.push('sales tax');
        }
        if (d.productNames) {
          setSavedProductNames(d.productNames);
          lsSet(PRODUCT_NAMES_KEY, JSON.stringify(d.productNames));
          restored.push('product names');
        }
        if (d.theme) {
          setTheme(d.theme);
          lsSet(THEME_KEY, JSON.stringify(d.theme));
        }
        
        // New features
        if (d.invoices && d.invoices.length > 0) {
          setInvoices(d.invoices);
          restored.push(`${d.invoices.length} invoices`);
        }
        if (d.amazonForecasts && Object.keys(d.amazonForecasts).length > 0) {
          setAmazonForecasts(d.amazonForecasts);
          restored.push(`${Object.keys(d.amazonForecasts).length} forecasts`);
        }
        if (d.weekNotes && Object.keys(d.weekNotes).length > 0) {
          setWeekNotes(prev => ({...prev, ...d.weekNotes}));
          restored.push('notes');
        }
        if (d.productionPipeline && d.productionPipeline.length > 0) {
          setProductionPipeline(d.productionPipeline);
          restored.push(`${d.productionPipeline.length} production orders`);
        }
        if (d.storeLogo) {
          setStoreLogo(d.storeLogo);
        }
        
        setToast({ message: `Restored: ${restored.join(', ')}`, type: 'success' });
      } catch (err) { 
        console.error('Import error:', err);
        setToast({ message: 'Invalid backup file', type: 'error' });
      }
    }; 
    reader.readAsText(file); 
  };

  // 5. FORECASTING - Simple linear regression based forecast
  const generateForecast = useMemo(() => {
    const sortedWeeks = Object.keys(allWeeksData).sort();
    
    // If we have 4+ weeks of weekly data, use that (most accurate)
    if (sortedWeeks.length >= 4) {
      const recentWeeks = sortedWeeks.slice(-8); // Use last 8 weeks for trend
      const revenues = recentWeeks.map(w => allWeeksData[w]?.total?.revenue || 0);
      const profits = recentWeeks.map(w => allWeeksData[w]?.total?.netProfit || 0);
      const units = recentWeeks.map(w => allWeeksData[w]?.total?.units || 0);
      
      // Simple linear regression
      const calcTrend = (data) => {
        const n = data.length;
        const sumX = data.reduce((s, _, i) => s + i, 0);
        const sumY = data.reduce((s, v) => s + v, 0);
        const sumXY = data.reduce((s, v, i) => s + i * v, 0);
        const sumX2 = data.reduce((s, _, i) => s + i * i, 0);
        const denom = n * sumX2 - sumX * sumX;
        const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
        const intercept = (sumY - slope * sumX) / n;
        return { slope, intercept, avg: sumY / n };
      };
      
      const revTrend = calcTrend(revenues);
      const profTrend = calcTrend(profits);
      const unitTrend = calcTrend(units);
      
      // Project next 4 weeks
      const n = revenues.length;
      const forecast = [];
      for (let i = 0; i < 4; i++) {
        const weekNum = n + i;
        forecast.push({
          week: `Week +${i + 1}`,
          revenue: Math.max(0, revTrend.intercept + revTrend.slope * weekNum),
          profit: profTrend.intercept + profTrend.slope * weekNum,
          units: Math.max(0, Math.round(unitTrend.intercept + unitTrend.slope * weekNum)),
        });
      }
      
      const monthlyRevenue = forecast.reduce((s, f) => s + f.revenue, 0);
      const monthlyProfit = forecast.reduce((s, f) => s + f.profit, 0);
      const monthlyUnits = forecast.reduce((s, f) => s + f.units, 0);
      
      const variance = revenues.reduce((s, v) => s + Math.pow(v - revTrend.avg, 2), 0) / revenues.length;
      const stdDev = Math.sqrt(variance);
      const confidence = revTrend.avg > 0 ? Math.max(0, Math.min(100, 100 - (stdDev / revTrend.avg * 100))) : 0;
      
      return {
        weekly: forecast,
        monthly: { revenue: monthlyRevenue, profit: monthlyProfit, units: monthlyUnits },
        trend: { 
          revenue: revTrend.slope > 0 ? 'up' : revTrend.slope < 0 ? 'down' : 'flat',
          revenueChange: revTrend.avg > 0 ? (revTrend.slope / revTrend.avg * 100) : 0,
        },
        confidence: confidence.toFixed(0),
        basedOn: recentWeeks.length,
        source: 'weekly',
      };
    }
    
    // Fallback: Use period data if available (less accurate, uses averages)
    const sortedPeriods = Object.keys(allPeriodsData).sort();
    if (sortedPeriods.length >= 1) {
      // Calculate totals from all periods
      let totalRevenue = 0, totalProfit = 0, totalUnits = 0, totalMonths = 0;
      
      sortedPeriods.forEach(p => {
        const period = allPeriodsData[p];
        const rev = (period.amazon?.revenue || 0) + (period.shopify?.revenue || 0);
        const profit = (period.amazon?.netProfit || 0) + (period.shopify?.netProfit || 0);
        const units = (period.amazon?.units || 0) + (period.shopify?.units || 0);
        
        // Estimate months in period (rough)
        const startDate = new Date(period.startDate || p);
        const endDate = new Date(period.endDate || p);
        const months = Math.max(1, Math.round((endDate - startDate) / (1000 * 60 * 60 * 24 * 30)));
        
        totalRevenue += rev;
        totalProfit += profit;
        totalUnits += units;
        totalMonths += months;
      });
      
      // Calculate monthly averages
      const avgMonthlyRevenue = totalMonths > 0 ? totalRevenue / totalMonths : totalRevenue;
      const avgMonthlyProfit = totalMonths > 0 ? totalProfit / totalMonths : totalProfit;
      const avgMonthlyUnits = totalMonths > 0 ? totalUnits / totalMonths : totalUnits;
      
      // Weekly projections (divide monthly by 4)
      const weeklyRevenue = avgMonthlyRevenue / 4;
      const weeklyProfit = avgMonthlyProfit / 4;
      const weeklyUnits = Math.round(avgMonthlyUnits / 4);
      
      const forecast = [
        { week: 'Week +1', revenue: weeklyRevenue, profit: weeklyProfit, units: weeklyUnits },
        { week: 'Week +2', revenue: weeklyRevenue, profit: weeklyProfit, units: weeklyUnits },
        { week: 'Week +3', revenue: weeklyRevenue, profit: weeklyProfit, units: weeklyUnits },
        { week: 'Week +4', revenue: weeklyRevenue, profit: weeklyProfit, units: weeklyUnits },
      ];
      
      return {
        weekly: forecast,
        monthly: { revenue: avgMonthlyRevenue, profit: avgMonthlyProfit, units: Math.round(avgMonthlyUnits) },
        trend: { revenue: 'flat', revenueChange: 0 },
        confidence: '50', // Lower confidence for period-based forecast
        basedOn: sortedPeriods.length,
        source: 'period',
        note: 'Based on period averages. Upload weekly data for trend analysis.',
      };
    }
    
    return null;
  }, [allWeeksData, allPeriodsData]);

  // AMAZON FORECAST - Parse and store Amazon's forecast data
  const processAmazonForecast = (csvData) => {
    if (!csvData || csvData.length === 0) return null;
    
    // Get date range from first row
    const startDate = csvData[0]['Start date'];
    const endDate = csvData[0]['End date'];
    const weekKey = endDate ? getSunday(new Date(endDate)) : null;
    
    if (!weekKey) return null;
    
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
    
    return {
      weekEnding: weekKey,
      startDate,
      endDate,
      uploadedAt: new Date().toISOString(),
      totals: {
        units: totalUnits,
        sales: totalSales,
        proceeds: totalProceeds,
        ads: totalAds,
        profitPerUnit: totalUnits > 0 ? totalProceeds / totalUnits : 0,
      },
      skus: skuForecasts,
      skuCount: Object.keys(skuForecasts).length,
    };
  };

  // Compare Amazon forecast vs actual results - comprehensive analysis with fuzzy matching
  const getAmazonForecastComparison = useMemo(() => {
    const comparisons = [];
    
    // Helper to find best matching actual week (within 3 days)
    const findMatchingActual = (forecastWeekKey) => {
      // First try exact match
      if (allWeeksData[forecastWeekKey]) {
        return { weekKey: forecastWeekKey, actual: allWeeksData[forecastWeekKey], matchType: 'exact' };
      }
      
      // Fuzzy match - look for weeks within 3 days
      const forecastDate = new Date(forecastWeekKey + 'T00:00:00');
      const weekKeys = Object.keys(allWeeksData);
      
      for (const weekKey of weekKeys) {
        const actualDate = new Date(weekKey + 'T00:00:00');
        const daysDiff = Math.abs((forecastDate - actualDate) / (1000 * 60 * 60 * 24));
        
        if (daysDiff <= 3) {
          return { weekKey, actual: allWeeksData[weekKey], matchType: 'fuzzy', daysDiff };
        }
      }
      
      return null;
    };
    
    Object.entries(amazonForecasts).forEach(([weekKey, forecast]) => {
      const match = findMatchingActual(weekKey);
      
      if (match && match.actual && match.actual.amazon) {
        const actual = match.actual;
        const forecastRev = forecast.totals.sales;
        const actualRev = actual.amazon.revenue || 0;
        const forecastUnits = forecast.totals.units;
        const actualUnits = actual.amazon.units || 0;
        const forecastProfit = forecast.totals.proceeds;
        const actualProfit = actual.amazon.netProfit || 0;
        
        // SKU-level comparison
        const skuComparisons = [];
        if (forecast.skus && actual.amazon.skuData) {
          const actualSkuMap = {};
          actual.amazon.skuData.forEach(s => { actualSkuMap[s.sku] = s; });
          
          Object.entries(forecast.skus).forEach(([sku, fcast]) => {
            const actualSku = actualSkuMap[sku];
            if (actualSku) {
              skuComparisons.push({
                sku,
                forecast: { units: fcast.units, sales: fcast.sales },
                actual: { units: actualSku.unitsSold, sales: actualSku.netSales },
                variance: {
                  units: actualSku.unitsSold - fcast.units,
                  unitsPercent: fcast.units > 0 ? ((actualSku.unitsSold - fcast.units) / fcast.units * 100) : 0,
                  sales: actualSku.netSales - fcast.sales,
                  salesPercent: fcast.sales > 0 ? ((actualSku.netSales - fcast.sales) / fcast.sales * 100) : 0,
                },
              });
            }
          });
        }
        
        comparisons.push({
          weekEnding: weekKey,
          actualWeekKey: match.weekKey,
          matchType: match.matchType,
          daysDiff: match.daysDiff || 0,
          uploadedAt: forecast.uploadedAt,
          forecast: {
            revenue: forecastRev,
            units: forecastUnits,
            profit: forecastProfit,
            skuCount: forecast.skuCount || 0,
          },
          actual: {
            revenue: actualRev,
            units: actualUnits,
            profit: actualProfit,
          },
          variance: {
            revenue: actualRev - forecastRev,
            revenuePercent: forecastRev > 0 ? ((actualRev - forecastRev) / forecastRev * 100) : 0,
            units: actualUnits - forecastUnits,
            unitsPercent: forecastUnits > 0 ? ((actualUnits - forecastUnits) / forecastUnits * 100) : 0,
            profit: actualProfit - forecastProfit,
            profitPercent: forecastProfit > 0 ? ((actualProfit - forecastProfit) / forecastProfit * 100) : 0,
          },
          accuracy: forecastRev > 0 ? Math.max(0, 100 - Math.abs((actualRev - forecastRev) / forecastRev * 100)) : 0,
          status: actualRev >= forecastRev ? 'beat' : 'missed',
          skuComparisons: skuComparisons.sort((a, b) => Math.abs(b.variance.salesPercent) - Math.abs(a.variance.salesPercent)),
          // ML training data
          mlFeatures: {
            forecastWeek: weekKey,
            forecastRevenue: forecastRev,
            forecastUnits: forecastUnits,
            actualRevenue: actualRev,
            actualUnits: actualUnits,
            error: actualRev - forecastRev,
            errorPercent: forecastRev > 0 ? ((actualRev - forecastRev) / forecastRev * 100) : 0,
            skuCount: forecast.skuCount || 0,
            // Could add: day of week, month, season, etc.
            month: new Date(weekKey).getMonth() + 1,
            quarter: Math.ceil((new Date(weekKey).getMonth() + 1) / 3),
          },
        });
      }
    });
    
    return comparisons.sort((a, b) => b.weekEnding.localeCompare(a.weekEnding));
  }, [amazonForecasts, allWeeksData]);
  
  // Get pending forecasts (uploaded but no matching actual yet)
  const pendingForecasts = useMemo(() => {
    const matched = new Set(getAmazonForecastComparison.map(c => c.weekEnding));
    return Object.entries(amazonForecasts)
      .filter(([weekKey]) => !matched.has(weekKey))
      .map(([weekKey, forecast]) => ({
        weekEnding: weekKey,
        forecast,
        isPast: new Date(weekKey) < new Date(),
        daysUntil: Math.ceil((new Date(weekKey) - new Date()) / (1000 * 60 * 60 * 24)),
      }))
      .sort((a, b) => a.weekEnding.localeCompare(b.weekEnding));
  }, [amazonForecasts, getAmazonForecastComparison]);
  
  // ML Training Data Export - accumulates all historical comparisons
  const mlTrainingData = useMemo(() => {
    if (getAmazonForecastComparison.length === 0) return null;
    
    return {
      samples: getAmazonForecastComparison.map(c => c.mlFeatures),
      summary: {
        totalSamples: getAmazonForecastComparison.length,
        avgError: getAmazonForecastComparison.reduce((s, c) => s + c.mlFeatures.errorPercent, 0) / getAmazonForecastComparison.length,
        stdDev: Math.sqrt(
          getAmazonForecastComparison.reduce((s, c) => {
            const avg = getAmazonForecastComparison.reduce((s2, c2) => s2 + c2.mlFeatures.errorPercent, 0) / getAmazonForecastComparison.length;
            return s + Math.pow(c.mlFeatures.errorPercent - avg, 2);
          }, 0) / getAmazonForecastComparison.length
        ),
        // Bias: positive = Amazon under-forecasts, negative = Amazon over-forecasts
        bias: getAmazonForecastComparison.reduce((s, c) => s + c.mlFeatures.errorPercent, 0) / getAmazonForecastComparison.length,
        // Suggested correction factor
        correctionFactor: 1 + (getAmazonForecastComparison.reduce((s, c) => s + c.mlFeatures.errorPercent, 0) / getAmazonForecastComparison.length / 100),
      },
    };
  }, [getAmazonForecastComparison]);
  
  // Calculate rolling forecast accuracy metrics
  const forecastAccuracyMetrics = useMemo(() => {
    const comparisons = getAmazonForecastComparison;
    if (comparisons.length === 0) return null;
    
    // Overall accuracy
    const avgAccuracy = comparisons.reduce((s, c) => s + c.accuracy, 0) / comparisons.length;
    const avgRevenueVariance = comparisons.reduce((s, c) => s + c.variance.revenuePercent, 0) / comparisons.length;
    const avgUnitsVariance = comparisons.reduce((s, c) => s + c.variance.unitsPercent, 0) / comparisons.length;
    
    // Trend - is accuracy improving?
    const recentComparisons = comparisons.slice(0, 4); // Last 4 weeks
    const olderComparisons = comparisons.slice(4, 8); // 4 weeks before that
    const recentAccuracy = recentComparisons.length > 0 ? recentComparisons.reduce((s, c) => s + c.accuracy, 0) / recentComparisons.length : 0;
    const olderAccuracy = olderComparisons.length > 0 ? olderComparisons.reduce((s, c) => s + c.accuracy, 0) / olderComparisons.length : 0;
    const accuracyTrend = olderComparisons.length > 0 ? recentAccuracy - olderAccuracy : 0;
    
    // Bias detection - does Amazon consistently over/under forecast?
    const overForecasts = comparisons.filter(c => c.variance.revenuePercent < 0).length;
    const underForecasts = comparisons.filter(c => c.variance.revenuePercent > 0).length;
    const bias = overForecasts > underForecasts * 1.5 ? 'over' : underForecasts > overForecasts * 1.5 ? 'under' : 'neutral';
    
    // Best/worst predicted weeks
    const sortedByAccuracy = [...comparisons].sort((a, b) => b.accuracy - a.accuracy);
    const bestWeek = sortedByAccuracy[0];
    const worstWeek = sortedByAccuracy[sortedByAccuracy.length - 1];
    
    return {
      totalWeeks: comparisons.length,
      avgAccuracy,
      avgRevenueVariance,
      avgUnitsVariance,
      recentAccuracy,
      accuracyTrend,
      bias,
      biasDescription: bias === 'over' ? 'Amazon tends to over-forecast (actuals lower than predicted)' :
                       bias === 'under' ? 'Amazon tends to under-forecast (actuals higher than predicted)' :
                       'Amazon forecasts are balanced',
      beatCount: comparisons.filter(c => c.status === 'beat').length,
      missedCount: comparisons.filter(c => c.status === 'missed').length,
      bestWeek,
      worstWeek,
    };
  }, [getAmazonForecastComparison]);

  // Get upcoming Amazon forecasts (weeks we haven't reached yet)
  const upcomingAmazonForecasts = useMemo(() => {
    const today = new Date();
    return Object.entries(amazonForecasts)
      .filter(([weekKey]) => new Date(weekKey) > today)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([weekKey, data]) => ({ weekEnding: weekKey, ...data }));
  }, [amazonForecasts]);

  // 7. BREAK-EVEN CALCULATOR
  const calculateBreakEven = (adSpend, cogs, price, conversionRate) => {
    if (!price || price <= cogs) return null;
    const profitPerUnit = price - cogs;
    const unitsToBreakEven = Math.ceil(adSpend / profitPerUnit);
    const clicksNeeded = conversionRate > 0 ? Math.ceil(unitsToBreakEven / (conversionRate / 100)) : 0;
    const revenueAtBreakEven = unitsToBreakEven * price;
    const roasAtBreakEven = adSpend > 0 ? revenueAtBreakEven / adSpend : 0;
    return { unitsToBreakEven, clicksNeeded, revenueAtBreakEven, roasAtBreakEven, profitPerUnit };
  };

  // 10. CSV EXPORT functions
  const exportToCSV = (data, filename, headers) => {
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(h => {
        const val = row[h] ?? '';
        return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
      }).join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const exportWeeklyDataCSV = () => {
    const sortedWeeks = Object.keys(allWeeksData).sort();
    const data = sortedWeeks.map(w => {
      const d = allWeeksData[w];
      return {
        'Week Ending': w,
        'Total Revenue': d.total?.revenue?.toFixed(2) || 0,
        'Total Profit': d.total?.netProfit?.toFixed(2) || 0,
        'Total Units': d.total?.units || 0,
        'Amazon Revenue': d.amazon?.revenue?.toFixed(2) || 0,
        'Amazon Profit': d.amazon?.netProfit?.toFixed(2) || 0,
        'Shopify Revenue': d.shopify?.revenue?.toFixed(2) || 0,
        'Shopify Profit': d.shopify?.netProfit?.toFixed(2) || 0,
        'Total Ad Spend': d.total?.adSpend?.toFixed(2) || 0,
        'Notes': weekNotes[w] || '',
      };
    });
    exportToCSV(data, 'weekly_sales', ['Week Ending', 'Total Revenue', 'Total Profit', 'Total Units', 'Amazon Revenue', 'Amazon Profit', 'Shopify Revenue', 'Shopify Profit', 'Total Ad Spend', 'Notes']);
  };

  const exportSKUDataCSV = () => {
    const skuMap = {};
    Object.entries(allWeeksData).forEach(([week, data]) => {
      [...(data.amazon?.skuData || []), ...(data.shopify?.skuData || [])].forEach(s => {
        if (!skuMap[s.sku]) skuMap[s.sku] = { sku: s.sku, name: s.name || '', totalUnits: 0, totalRevenue: 0, totalProfit: 0, weeks: 0 };
        skuMap[s.sku].totalUnits += s.unitsSold || 0;
        skuMap[s.sku].totalRevenue += s.netSales || 0;
        skuMap[s.sku].totalProfit += s.netProceeds || (s.netSales || 0) - (s.cogs || 0);
        skuMap[s.sku].weeks += 1;
      });
    });
    const data = Object.values(skuMap).map(s => ({
      'SKU': s.sku,
      'Product Name': s.name,
      'Total Units': s.totalUnits,
      'Total Revenue': s.totalRevenue.toFixed(2),
      'Total Profit': s.totalProfit.toFixed(2),
      'Weeks Active': s.weeks,
      'Avg Units/Week': (s.totalUnits / s.weeks).toFixed(1),
    }));
    exportToCSV(data, 'sku_performance', ['SKU', 'Product Name', 'Total Units', 'Total Revenue', 'Total Profit', 'Weeks Active', 'Avg Units/Week']);
  };

  const exportInventoryCSV = () => {
    const latestDate = Object.keys(invHistory).sort().pop();
    if (!latestDate) return;
    const inv = invHistory[latestDate];
    const data = [...(inv.fba || []), ...(inv.threepl || [])].map(i => ({
      'SKU': i.sku,
      'Location': i.source || 'Unknown',
      'Units': i.quantity || i.units || 0,
      'COGS': savedCogs[i.sku] || 0,
      'Value': ((i.quantity || i.units || 0) * (savedCogs[i.sku] || 0)).toFixed(2),
    }));
    exportToCSV(data, 'inventory', ['SKU', 'Location', 'Units', 'COGS', 'Value']);
  };

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
    const [skuSort, setSkuSort] = useState({ field: 'netSales', dir: 'desc' });
    const skuDataRaw = data.skuData || [];
    const threeplBreakdown = data.threeplBreakdown || {};
    const has3plData = !isAmz && (data.threeplCosts > 0);
    const has3plBreakdown = has3plData && Object.values(threeplBreakdown).some(v => v > 0);
    
    // Add calculated fields and sort
    const skuData = useMemo(() => {
      const withCalcs = skuDataRaw.map(item => {
        // Amazon: netProceeds IS the profit (already has COGS, fees, and ad spend deducted)
        // Shopify: netSales already has discounts deducted, subtract COGS
        const profit = isAmz 
          ? (item.netProceeds || 0)
          : (item.netSales || 0) - (item.cogs || 0);
        // For $/Unit: Amazon uses proceeds (the profit), Shopify uses netSales
        const proceedsPerUnit = item.unitsSold > 0 
          ? (isAmz ? item.netProceeds : item.netSales) / item.unitsSold 
          : 0;
        return { ...item, profit, proceedsPerUnit };
      });
      return withCalcs.sort((a, b) => {
        const aVal = a[skuSort.field] || 0;
        const bVal = b[skuSort.field] || 0;
        return skuSort.dir === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }, [skuDataRaw, skuSort, isAmz]);
    
    const handleSort = (field) => {
      setSkuSort(prev => ({ field, dir: prev.field === field && prev.dir === 'desc' ? 'asc' : 'desc' }));
    };
    
    const SortHeader = ({ field, label, align = 'right' }) => (
      <th 
        onClick={() => handleSort(field)}
        className={`text-${align} text-xs font-medium text-slate-400 uppercase px-2 py-2 cursor-pointer hover:text-white transition-colors ${skuSort.field === field ? 'text-violet-400' : ''}`}
      >
        {label} {skuSort.field === field && (skuSort.dir === 'desc' ? '↓' : '↑')}
      </th>
    );
    
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
              {has3plData && <button onClick={() => setShow3plBreakdown(!show3plBreakdown)} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"><Truck className="w-3 h-3" />{show3plBreakdown ? 'Hide Details' : 'View Details'}</button>}
            </div>
            <div><p className="text-slate-500 text-xs uppercase mb-1">Ad Spend</p><p className="text-lg font-semibold text-white">{formatCurrency(data.adSpend)}</p></div>
            <div><p className="text-slate-500 text-xs uppercase mb-1">TACOS</p><p className="text-lg font-semibold text-white">{(data.roas || 0).toFixed(2)}x</p></div>
          </div>
          {/* 3PL Breakdown */}
          {show3plBreakdown && has3plData && (
            <div className="bg-slate-900/50 rounded-xl p-4 mb-4">
              <h4 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2"><Truck className="w-4 h-4 text-blue-400" />3PL Cost Breakdown</h4>
              {has3plBreakdown ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                    {threeplBreakdown.shipping > 0 && <div className="flex justify-between"><span className="text-slate-400 text-sm">Shipping</span><span className="text-white text-sm">{formatCurrency(threeplBreakdown.shipping)}</span></div>}
                    {threeplBreakdown.pickFees > 0 && <div className="flex justify-between"><span className="text-slate-400 text-sm">Pick Fees</span><span className="text-white text-sm">{formatCurrency(threeplBreakdown.pickFees)}</span></div>}
                    {threeplBreakdown.storage > 0 && <div className="flex justify-between"><span className="text-slate-400 text-sm">Storage</span><span className="text-white text-sm">{formatCurrency(threeplBreakdown.storage)}</span></div>}
                    {threeplBreakdown.boxCharges > 0 && <div className="flex justify-between"><span className="text-slate-400 text-sm">Box/Mailer</span><span className="text-white text-sm">{formatCurrency(threeplBreakdown.boxCharges)}</span></div>}
                    {threeplBreakdown.receiving > 0 && <div className="flex justify-between"><span className="text-slate-400 text-sm">Receiving</span><span className="text-white text-sm">{formatCurrency(threeplBreakdown.receiving)}</span></div>}
                    {threeplBreakdown.other > 0 && <div className="flex justify-between"><span className="text-slate-400 text-sm">Other</span><span className="text-white text-sm">{formatCurrency(threeplBreakdown.other)}</span></div>}
                  </div>
                  {/* Enhanced 3PL Metrics */}
                  {data.threeplMetrics && data.threeplMetrics.orderCount > 0 ? (
                    <div className="border-t border-slate-700 pt-3 mt-3">
                      <h5 className="text-xs font-semibold text-cyan-400 uppercase mb-2">📦 Order Metrics</h5>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-slate-800/50 rounded-lg p-2">
                          <p className="text-slate-500 text-xs">Orders</p>
                          <p className="text-white font-semibold">{formatNumber(data.threeplMetrics.orderCount)}</p>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-2">
                          <p className="text-slate-500 text-xs">Units Picked</p>
                          <p className="text-white font-semibold">{formatNumber(data.threeplMetrics.totalUnits)}</p>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-2">
                          <p className="text-slate-500 text-xs">Avg Units/Order</p>
                          <p className="text-white font-semibold">{data.threeplMetrics.avgUnitsPerOrder.toFixed(1)}</p>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-2">
                          <p className="text-slate-500 text-xs">Avg Ship Cost</p>
                          <p className="text-white font-semibold">{formatCurrency(data.threeplMetrics.avgShippingCost)}</p>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-2">
                          <p className="text-slate-500 text-xs">Avg Pick Cost</p>
                          <p className="text-white font-semibold">{formatCurrency(data.threeplMetrics.avgPickCost)}</p>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-2">
                          <p className="text-slate-500 text-xs">Avg Packaging</p>
                          <p className="text-white font-semibold">{formatCurrency(data.threeplMetrics.avgPackagingCost)}</p>
                        </div>
                        <div className="bg-cyan-900/30 rounded-lg p-2 border border-cyan-500/30">
                          <p className="text-cyan-400 text-xs font-medium">Avg Cost/Order</p>
                          <p className="text-cyan-300 font-bold">{formatCurrency(data.threeplMetrics.avgCostPerOrder)}</p>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-2">
                          <p className="text-slate-500 text-xs">Storage</p>
                          <p className="text-white font-semibold">{formatCurrency(threeplBreakdown.storage)}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="border-t border-slate-700 pt-3 mt-3">
                      <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3">
                        <p className="text-amber-400 text-sm font-medium">📊 Order metrics not available</p>
                        <p className="text-slate-400 text-xs mt-1">To see orders, avg cost/order, and other metrics:</p>
                        <ul className="text-slate-500 text-xs mt-1 list-disc list-inside">
                          <li>Re-process this data with a 3PL CSV that includes "Count Total" column</li>
                          <li>Make sure your 3PL file has "First Pick Fee" rows (used to count orders)</li>
                        </ul>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-slate-500 text-sm">No breakdown available. Re-process this data with a 3PL CSV to see the breakdown.</p>
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
                          <SortHeader field="unitsSold" label="Units" />
                          <SortHeader field="netSales" label="Sales" />
                          {isAmz && <SortHeader field="netProceeds" label="Proceeds" />}
                          {isAmz && <SortHeader field="adSpend" label="Ad Spend" />}
                          {isAmz && <SortHeader field="returns" label="Returns" />}
                          {!isAmz && <SortHeader field="discounts" label="Discounts" />}
                          <SortHeader field="cogs" label="COGS" />
                          <SortHeader field="profit" label="Profit" />
                          <SortHeader field="proceedsPerUnit" label="$/Unit" />
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
                            <td className={`text-right px-2 py-2 font-medium ${item.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(item.profit)}</td>
                            <td className={`text-right px-2 py-2 font-medium ${item.proceedsPerUnit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(item.proceedsPerUnit)}</td>
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

  // Reusable Goals Progress Card with Trend Analysis
  const GoalsCard = ({ weekRevenue = 0, weekProfit = 0, monthRevenue = 0, monthProfit = 0, monthLabel = '' }) => {
    const hasGoals = goals.weeklyRevenue > 0 || goals.weeklyProfit > 0 || goals.monthlyRevenue > 0 || goals.monthlyProfit > 0;
    if (!hasGoals) return null;
    
    // Calculate trend data
    const sortedWeeks = Object.keys(allWeeksData).sort();
    const recentWeeks = sortedWeeks.slice(-8); // Last 8 weeks for trend
    const weeklyRevenues = recentWeeks.map(w => allWeeksData[w]?.total?.revenue || 0);
    const weeklyProfits = recentWeeks.map(w => allWeeksData[w]?.total?.netProfit || 0);
    
    // Simple linear regression for trend
    const calcTrend = (data) => {
      if (data.length < 3) return { slope: 0, projected: data[data.length - 1] || 0, trend: 'stable' };
      const n = data.length;
      const sumX = data.reduce((s, _, i) => s + i, 0);
      const sumY = data.reduce((s, v) => s + v, 0);
      const sumXY = data.reduce((s, v, i) => s + i * v, 0);
      const sumX2 = data.reduce((s, _, i) => s + i * i, 0);
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      const projected = slope * n + intercept; // Project next period
      const avgChange = slope / (sumY / n) * 100; // % change per period
      return { 
        slope, 
        projected, 
        avgChange,
        trend: avgChange > 2 ? 'up' : avgChange < -2 ? 'down' : 'stable'
      };
    };
    
    const revenueTrend = calcTrend(weeklyRevenues);
    const profitTrend = calcTrend(weeklyProfits);
    
    // Calculate monthly projection (4 weeks)
    const projectedMonthlyRevenue = revenueTrend.projected * 4;
    const projectedMonthlyProfit = profitTrend.projected * 4;
    
    const ProgressBar = ({ current, target, label, projected, trendDir }) => {
      if (!target || target <= 0) return null;
      const pct = Math.min((current / target) * 100, 100);
      const hit = current >= target;
      const projectedPct = projected ? Math.min((projected / target) * 100, 150) : null;
      const willHit = projected >= target;
      const diff = current - target;
      const projectedDiff = projected ? projected - target : null;
      
      return (
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-slate-400">{label}</span>
            <span className="text-white">{formatCurrency(current)} / {formatCurrency(target)}</span>
          </div>
          <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden relative">
            <div className={`h-full transition-all ${hit ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
            {projectedPct && (
              <div 
                className={`absolute top-0 h-full w-1 ${willHit ? 'bg-emerald-300' : 'bg-rose-400'}`} 
                style={{ left: `${Math.min(projectedPct, 100)}%` }}
                title={`Projected: ${formatCurrency(projected)}`}
              />
            )}
          </div>
          <div className="flex justify-between items-center mt-1">
            <p className={`text-xs ${hit ? 'text-emerald-400' : 'text-amber-400'}`}>
              {pct.toFixed(0)}% {hit ? '🎉' : ''} 
              <span className="text-slate-500 ml-1">
                ({diff >= 0 ? '+' : ''}{formatCurrency(diff)})
              </span>
            </p>
            {projected && recentWeeks.length >= 3 && (
              <p className={`text-xs flex items-center gap-1 ${willHit ? 'text-emerald-400' : 'text-rose-400'}`}>
                {trendDir === 'up' ? <TrendingUp className="w-3 h-3" /> : trendDir === 'down' ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                Trend: {willHit ? 'On track' : `${formatCurrency(Math.abs(projectedDiff))} short`}
              </p>
            )}
          </div>
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
          {goals.weeklyRevenue > 0 && (
            <ProgressBar 
              current={weekRevenue} 
              target={goals.weeklyRevenue} 
              label="Weekly Revenue" 
              projected={revenueTrend.projected}
              trendDir={revenueTrend.trend}
            />
          )}
          {goals.weeklyProfit > 0 && (
            <ProgressBar 
              current={weekProfit} 
              target={goals.weeklyProfit} 
              label="Weekly Profit" 
              projected={profitTrend.projected}
              trendDir={profitTrend.trend}
            />
          )}
          {goals.monthlyRevenue > 0 && (
            <ProgressBar 
              current={monthRevenue} 
              target={goals.monthlyRevenue} 
              label={monthLabel ? `${monthLabel} Revenue` : 'Monthly Revenue'} 
              projected={projectedMonthlyRevenue}
              trendDir={revenueTrend.trend}
            />
          )}
          {goals.monthlyProfit > 0 && (
            <ProgressBar 
              current={monthProfit} 
              target={goals.monthlyProfit} 
              label={monthLabel ? `${monthLabel} Profit` : 'Monthly Profit'} 
              projected={projectedMonthlyProfit}
              trendDir={profitTrend.trend}
            />
          )}
        </div>
        {recentWeeks.length >= 3 && (
          <div className="mt-3 pt-3 border-t border-slate-700/50">
            <p className="text-xs text-slate-400">
              📈 Trend based on last {recentWeeks.length} weeks | 
              Revenue: <span className={revenueTrend.trend === 'up' ? 'text-emerald-400' : revenueTrend.trend === 'down' ? 'text-rose-400' : 'text-slate-300'}>
                {revenueTrend.avgChange > 0 ? '+' : ''}{revenueTrend.avgChange.toFixed(1)}%/wk
              </span> | 
              Profit: <span className={profitTrend.trend === 'up' ? 'text-emerald-400' : profitTrend.trend === 'down' ? 'text-rose-400' : 'text-slate-300'}>
                {profitTrend.avgChange > 0 ? '+' : ''}{profitTrend.avgChange.toFixed(1)}%/wk
              </span>
            </p>
          </div>
        )}
      </div>
    );
  };

  const NavTabs = () => (
    <div className="flex flex-wrap gap-2 mb-6 p-1.5 bg-slate-800/50 rounded-xl">
      {/* Main Navigation */}
      <button onClick={() => setView('dashboard')} className={`px-3 py-2 rounded-lg text-sm font-medium ${view === 'dashboard' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><BarChart3 className="w-4 h-4 inline mr-1" />Dashboard</button>
      <button onClick={() => setView('upload')} className={`px-3 py-2 rounded-lg text-sm font-medium ${view === 'upload' || view === 'period-upload' || view === 'inv-upload' ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><Upload className="w-4 h-4 inline mr-1" />Upload</button>
      
      <div className="w-px bg-slate-600 mx-1" />
      
      {/* Data Views */}
      {appSettings.modulesEnabled?.weeklyTracking !== false && (
        <button onClick={() => { const w = Object.keys(allWeeksData).sort().reverse(); if (w.length) { setSelectedWeek(w[0]); setView('weekly'); }}} disabled={!Object.keys(allWeeksData).length} className={`px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${view === 'weekly' ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><Calendar className="w-4 h-4 inline mr-1" />Weeks</button>
      )}
      {appSettings.modulesEnabled?.periodTracking !== false && (
        <button onClick={() => { const p = Object.keys(allPeriodsData).sort().reverse(); if (p.length) { setSelectedPeriod(p[0]); setView('period-view'); }}} disabled={!Object.keys(allPeriodsData).length} className={`px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${view === 'period-view' ? 'bg-teal-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><CalendarRange className="w-4 h-4 inline mr-1" />Periods</button>
      )}
      {appSettings.modulesEnabled?.inventory !== false && (
        <button onClick={() => { if (Object.keys(invHistory).length) { const d = Object.keys(invHistory).sort().reverse()[0]; setSelectedInvDate(d); setView('inventory'); } else { setUploadTab('inventory'); setView('upload'); }}} className={`px-3 py-2 rounded-lg text-sm font-medium ${view === 'inventory' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><Boxes className="w-4 h-4 inline mr-1" />Inventory</button>
      )}
      
      <div className="w-px bg-slate-600 mx-1" />
      
      {/* Analytics */}
      {appSettings.modulesEnabled?.trends !== false && (
        <button onClick={() => setView('trends')} disabled={Object.keys(allWeeksData).length < 2} className={`px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${view === 'trends' ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><TrendingUp className="w-4 h-4 inline mr-1" />Trends</button>
      )}
      <button onClick={() => setView('analytics')} disabled={Object.keys(allWeeksData).length < 1} className={`px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${view === 'analytics' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><BarChart3 className="w-4 h-4 inline mr-1" />Analytics</button>
      {appSettings.modulesEnabled?.yoy !== false && (
        <button onClick={() => setView('yoy')} disabled={Object.keys(allWeeksData).length < 2 && Object.keys(allPeriodsData).length < 2} className={`px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${view === 'yoy' ? 'bg-amber-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><GitCompare className="w-4 h-4 inline mr-1" />YoY</button>
      )}
      {appSettings.modulesEnabled?.skus !== false && (
        <button onClick={() => setView('skus')} disabled={Object.keys(allWeeksData).length < 1 && Object.keys(allPeriodsData).length < 1} className={`px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${view === 'skus' ? 'bg-pink-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><Trophy className="w-4 h-4 inline mr-1" />SKUs</button>
      )}
      {appSettings.modulesEnabled?.profitability !== false && (
        <button onClick={() => setView('profitability')} disabled={Object.keys(allWeeksData).length < 1 && Object.keys(allPeriodsData).length < 1} className={`px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${view === 'profitability' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><PieChart className="w-4 h-4 inline mr-1" />Profit</button>
      )}
      {appSettings.modulesEnabled?.ads !== false && (
        <button onClick={() => setView('ads')} disabled={Object.keys(allWeeksData).length < 1 && Object.keys(allPeriodsData).length < 1} className={`px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${view === 'ads' ? 'bg-purple-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><Zap className="w-4 h-4 inline mr-1" />Ads</button>
      )}
      {appSettings.modulesEnabled?.threepl !== false && (
        <button onClick={() => setView('3pl')} disabled={Object.keys(allWeeksData).length < 1 && Object.keys(allPeriodsData).length < 1} className={`px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${view === '3pl' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><Truck className="w-4 h-4 inline mr-1" />3PL</button>
      )}
      
      <div className="w-px bg-slate-600 mx-1" />
      
      {/* Compliance & Settings */}
      {appSettings.modulesEnabled?.salesTax !== false && (
        <button onClick={() => setView('sales-tax')} className={`px-3 py-2 rounded-lg text-sm font-medium ${view === 'sales-tax' ? 'bg-rose-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><DollarSign className="w-4 h-4 inline mr-1" />Sales Tax</button>
      )}
      <button onClick={() => setView('settings')} className={`px-3 py-2 rounded-lg text-sm font-medium ${view === 'settings' ? 'bg-slate-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><Settings className="w-4 h-4 inline mr-1" />Settings</button>
    </div>
  );

  const dataBar = useMemo(() => (
    <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
      <div className="flex items-center gap-2 text-slate-400 text-sm"><Database className="w-4 h-4" /><span>{Object.keys(allWeeksData).length} weeks | {Object.keys(allPeriodsData).length} periods</span></div>
      <div className="flex items-center gap-2">
        {Object.keys(savedCogs).length > 0 ? <span className="text-emerald-400 text-xs flex items-center gap-1"><Check className="w-3 h-3" />{Object.keys(savedCogs).length} SKUs</span> : <span className="text-amber-400 text-xs">No COGS</span>}
        <button onClick={() => setShowCogsManager(true)} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white flex items-center gap-1"><Settings className="w-3 h-3" />COGS</button>
        <button onClick={() => setShowProductCatalog(true)} className="px-2 py-1 bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/50 rounded text-xs text-violet-300 flex items-center gap-1"><Package className="w-3 h-3" />Catalog{Object.keys(savedProductNames).length > 0 && <span className="text-violet-400">✓</span>}</button>
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
  ), [allWeeksData, allPeriodsData, savedCogs, savedProductNames, storeName, isLocked, cloudStatus, session]);

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

  // Product Catalog Modal - maps SKUs to product names for AI
  const ProductCatalogModal = () => {
    if (!showProductCatalog) return null;
    
    const handleFileUpload = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      setProductCatalogFileName(file.name);
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target.result;
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) return;
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const skuCol = headers.findIndex(h => h.toLowerCase() === 'sku');
        const nameCol = headers.findIndex(h => h.toLowerCase().includes('product') || h.toLowerCase() === 'name');
        if (skuCol === -1 || nameCol === -1) {
          alert('CSV must have SKU and Product Name columns');
          return;
        }
        const catalog = {};
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
          const sku = cols[skuCol];
          const name = cols[nameCol];
          if (sku && name) catalog[sku] = name;
        }
        setProductCatalogFile(catalog);
      };
      reader.readAsText(file);
    };
    
    const saveCatalog = () => {
      if (!productCatalogFile) return;
      setSavedProductNames(productCatalogFile);
      try { localStorage.setItem(PRODUCT_NAMES_KEY, JSON.stringify(productCatalogFile)); } catch(e) {}
      setShowProductCatalog(false);
      setProductCatalogFile(null);
      setProductCatalogFileName('');
    };
    
    // Get category summary
    const getCategorySummary = (names) => {
      const categories = {};
      Object.entries(names).forEach(([sku, name]) => {
        const nameLower = name.toLowerCase();
        let cat = 'Other';
        if (nameLower.includes('lip balm')) cat = 'Lip Balm';
        else if (nameLower.includes('deodorant') && nameLower.includes('sensitive')) cat = 'Sensitive Deodorant';
        else if (nameLower.includes('deodorant') && nameLower.includes('extra strength')) cat = 'Extra Strength Deodorant';
        else if (nameLower.includes('deodorant')) cat = 'Deodorant';
        else if (nameLower.includes('soap') && nameLower.includes('athlete')) cat = "Athlete's Shield";
        else if (nameLower.includes('soap')) cat = 'Tallow Soap';
        else if (nameLower.includes('sun balm')) cat = 'Sun Balm';
        else if (nameLower.includes('tallow balm')) cat = 'Tallow Balm';
        if (!categories[cat]) categories[cat] = 0;
        categories[cat]++;
      });
      return categories;
    };
    
    const currentCategories = getCategorySummary(savedProductNames);
    const previewCategories = productCatalogFile ? getCategorySummary(productCatalogFile) : null;
    
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
          <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            <Package className="w-6 h-6 text-violet-400" />
            Product Catalog
          </h2>
          <p className="text-slate-400 text-sm mb-4">
            Map SKUs to product names so AI can answer questions like "How much lip balm did I sell?"
          </p>
          
          {/* Current catalog status */}
          {Object.keys(savedProductNames).length > 0 ? (
            <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2 text-emerald-400 mb-2">
                <Check className="w-5 h-5" />
                <span className="font-semibold">{Object.keys(savedProductNames).length} Products Mapped</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(currentCategories).map(([cat, count]) => (
                  <span key={cat} className="text-xs bg-slate-700 px-2 py-1 rounded text-slate-300">
                    {cat}: {count}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-amber-900/30 border border-amber-500/30 rounded-xl p-4 mb-4">
              <p className="text-amber-400 font-semibold">No Product Catalog</p>
              <p className="text-slate-400 text-sm">Upload a CSV with SKU and Product Name columns</p>
            </div>
          )}
          
          {/* File upload */}
          <div className="mb-4">
            <label className="block text-sm text-slate-300 mb-2">Upload Product Catalog CSV:</label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-violet-600 file:text-white file:cursor-pointer"
            />
            {productCatalogFileName && (
              <p className="text-violet-400 text-sm mt-2">📄 {productCatalogFileName}</p>
            )}
          </div>
          
          {/* Preview */}
          {productCatalogFile && (
            <div className="bg-slate-900/50 rounded-xl p-4 mb-4">
              <p className="text-white font-semibold mb-2">Preview: {Object.keys(productCatalogFile).length} products found</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {Object.entries(previewCategories).map(([cat, count]) => (
                  <span key={cat} className="text-xs bg-violet-600/30 px-2 py-1 rounded text-violet-300">
                    {cat}: {count}
                  </span>
                ))}
              </div>
              <div className="max-h-32 overflow-y-auto text-xs space-y-1">
                {Object.entries(productCatalogFile).slice(0, 5).map(([sku, name]) => (
                  <div key={sku} className="flex gap-2">
                    <span className="text-slate-500 font-mono">{sku}</span>
                    <span className="text-slate-300 truncate">{name}</span>
                  </div>
                ))}
                {Object.keys(productCatalogFile).length > 5 && (
                  <p className="text-slate-500">...and {Object.keys(productCatalogFile).length - 5} more</p>
                )}
              </div>
            </div>
          )}
          
          <div className="flex gap-3">
            {productCatalogFile && (
              <button onClick={saveCatalog} className="flex-1 bg-violet-600 hover:bg-violet-500 text-white font-semibold py-2 rounded-xl">
                Save Catalog
              </button>
            )}
            <button 
              onClick={() => { setShowProductCatalog(false); setProductCatalogFile(null); setProductCatalogFileName(''); }} 
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-xl"
            >
              {productCatalogFile ? 'Cancel' : 'Close'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Upload Help Modal
  const UploadHelpModal = () => {
    if (!showUploadHelp) return null;
    
    const HelpSection = ({ icon, title, steps, color = 'violet' }) => (
      <div className={`bg-slate-900/50 rounded-xl p-4 border border-${color}-500/20`}>
        <h4 className={`text-${color}-400 font-semibold mb-3 flex items-center gap-2`}>
          {icon}
          {title}
        </h4>
        <ol className="space-y-2 text-sm text-slate-300">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className={`text-${color}-400 font-medium`}>{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>
    );
    
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <FileText className="w-6 h-6 text-violet-400" />
              How to Upload Data
            </h2>
            <button onClick={() => setShowUploadHelp(false)} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="space-y-4">
            <HelpSection 
              icon={<ShoppingCart className="w-5 h-5" />}
              title="Amazon Sales (SKU Economics Report)"
              color="orange"
              steps={[
                'Go to Seller Central → Reports → Business Reports → SKU Economics',
                'Select your marketplace',
                'Set Data Aggregation to "MSKU"',
                'Select your desired date range',
                'Check ALL boxes under "Set Report Configurations"',
                'Important: Make sure COGS are entered in Amazon for accurate data',
                'Export as CSV'
              ]}
            />
            
            <HelpSection 
              icon={<ShoppingBag className="w-5 h-5" />}
              title="Shopify Sales"
              color="blue"
              steps={[
                'Go to Analytics → Reports',
                'Find "Total sales by product variant SKU"',
                'Select your date range',
                'Export as CSV'
              ]}
            />
            
            <HelpSection 
              icon={<Boxes className="w-5 h-5" />}
              title="Amazon Inventory (FBA)"
              color="emerald"
              steps={[
                'Go to Inventory → FBA Inventory',
                'Click "Reports"',
                'Select "Inventory Report"',
                'Download as CSV'
              ]}
            />
            
            <HelpSection 
              icon={<Truck className="w-5 h-5" />}
              title="3PL Inventory (Packiyo)"
              color="amber"
              steps={[
                'Go to Inventory → Products',
                'Click Export',
                'Convert Excel file to CSV format'
              ]}
            />
            
            <HelpSection 
              icon={<DollarSign className="w-5 h-5" />}
              title="3PL Charges"
              color="rose"
              steps={[
                'Create or export a CSV with your weekly 3PL charges',
                'Include columns for charge types and amounts',
                'Upload to track fulfillment costs'
              ]}
            />
          </div>
          
          <div className="mt-6 pt-4 border-t border-slate-700">
            <button 
              onClick={() => setShowUploadHelp(false)} 
              className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold py-2 rounded-xl"
            >
              Got It!
            </button>
          </div>
        </div>
      </div>
    );
  };

  // FORECAST MODAL (Feature 5)
  const ForecastModal = () => {
    if (!showForecast || !generateForecast) return null;
    const f = generateForecast;
    
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-emerald-400" />
              Revenue Forecast
            </h2>
            <button onClick={() => setShowForecast(false)} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="bg-slate-900/50 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400">Based on</span>
              <span className="text-white font-medium">{f.basedOn} {f.source === 'period' ? 'period(s)' : 'weeks'} of data</span>
            </div>
            {f.source === 'period' && (
              <div className="mb-2 p-2 bg-amber-900/30 border border-amber-500/30 rounded-lg">
                <p className="text-amber-300 text-xs">⚠️ Using period averages. Upload weekly data for trend analysis.</p>
              </div>
            )}
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400">Trend Direction</span>
              <span className={`font-medium flex items-center gap-1 ${f.trend.revenue === 'up' ? 'text-emerald-400' : f.trend.revenue === 'down' ? 'text-rose-400' : 'text-slate-400'}`}>
                {f.trend.revenue === 'up' ? <TrendingUp className="w-4 h-4" /> : f.trend.revenue === 'down' ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                {f.trend.revenueChange > 0 ? '+' : ''}{f.trend.revenueChange.toFixed(1)}% per week
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Confidence</span>
              <span className={`font-medium ${parseFloat(f.confidence) > 70 ? 'text-emerald-400' : parseFloat(f.confidence) > 40 ? 'text-amber-400' : 'text-rose-400'}`}>{f.confidence}%</span>
            </div>
          </div>
          
          <h3 className="text-sm font-semibold text-slate-400 uppercase mb-3">Weekly Projections</h3>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {f.weekly.map((w, i) => (
              <div key={i} className="bg-slate-900/50 rounded-xl p-3 text-center">
                <p className="text-slate-500 text-xs mb-1">{w.week}</p>
                <p className="text-white font-bold">{formatCurrency(w.revenue)}</p>
                <p className={`text-sm ${w.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(w.profit)}</p>
                <p className="text-slate-500 text-xs">{w.units} units</p>
              </div>
            ))}
          </div>
          
          <div className="bg-gradient-to-r from-emerald-900/30 to-violet-900/30 rounded-xl p-4 border border-emerald-500/30">
            <h3 className="text-sm font-semibold text-emerald-400 uppercase mb-3">Next Month Projection</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-slate-400 text-sm">Revenue</p>
                <p className="text-2xl font-bold text-white">{formatCurrency(f.monthly.revenue)}</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm">Profit</p>
                <p className={`text-2xl font-bold ${f.monthly.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(f.monthly.profit)}</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm">Units</p>
                <p className="text-2xl font-bold text-white">{formatNumber(f.monthly.units)}</p>
              </div>
            </div>
            {goals.monthlyRevenue > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-700">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">vs Monthly Goal</span>
                  <span className={f.monthly.revenue >= goals.monthlyRevenue ? 'text-emerald-400' : 'text-amber-400'}>
                    {f.monthly.revenue >= goals.monthlyRevenue ? '✓ On track' : `${formatCurrency(goals.monthlyRevenue - f.monthly.revenue)} short`}
                  </span>
                </div>
              </div>
            )}
          </div>
          
          <p className="text-slate-500 text-xs mt-4 text-center">
            * Forecast based on linear trend analysis. Actual results may vary.
          </p>
        </div>
      </div>
    );
  };

  // BREAK-EVEN CALCULATOR (Feature 7)
  const BreakEvenModal = () => {
    if (!showBreakEven) return null;
    const result = calculateBreakEven(
      parseFloat(breakEvenInputs.adSpend) || 0,
      parseFloat(breakEvenInputs.cogs) || 0,
      parseFloat(breakEvenInputs.price) || 0,
      parseFloat(breakEvenInputs.conversionRate) || 2
    );
    
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-md w-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Calculator className="w-6 h-6 text-amber-400" />
              Break-Even Calculator
            </h2>
            <button onClick={() => setShowBreakEven(false)} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Ad Spend ($)</label>
              <input type="number" value={breakEvenInputs.adSpend} onChange={e => setBreakEvenInputs(p => ({...p, adSpend: e.target.value}))}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white" placeholder="500" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">COGS per Unit ($)</label>
              <input type="number" value={breakEvenInputs.cogs} onChange={e => setBreakEvenInputs(p => ({...p, cogs: e.target.value}))}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white" placeholder="5" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Selling Price ($)</label>
              <input type="number" value={breakEvenInputs.price} onChange={e => setBreakEvenInputs(p => ({...p, price: e.target.value}))}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white" placeholder="25" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Conversion Rate (%)</label>
              <input type="number" value={breakEvenInputs.conversionRate} onChange={e => setBreakEvenInputs(p => ({...p, conversionRate: e.target.value}))}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white" placeholder="2" />
            </div>
          </div>
          
          {result && parseFloat(breakEvenInputs.price) > parseFloat(breakEvenInputs.cogs) ? (
            <div className="bg-slate-900/50 rounded-xl p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-400">Profit per Unit</span>
                <span className="text-emerald-400 font-bold">{formatCurrency(result.profitPerUnit)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Units to Break Even</span>
                <span className="text-white font-bold">{result.unitsToBreakEven}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Clicks Needed (at {breakEvenInputs.conversionRate}% CVR)</span>
                <span className="text-white font-bold">{formatNumber(result.clicksNeeded)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Revenue at Break-Even</span>
                <span className="text-white font-bold">{formatCurrency(result.revenueAtBreakEven)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">ROAS at Break-Even</span>
                <span className="text-amber-400 font-bold">{result.roasAtBreakEven.toFixed(2)}x</span>
              </div>
            </div>
          ) : parseFloat(breakEvenInputs.price) <= parseFloat(breakEvenInputs.cogs) && breakEvenInputs.price ? (
            <div className="bg-rose-900/30 border border-rose-500/50 rounded-xl p-4 text-center">
              <p className="text-rose-400">Price must be greater than COGS to make profit</p>
            </div>
          ) : (
            <div className="bg-slate-900/50 rounded-xl p-4 text-center text-slate-500">
              Enter values above to calculate break-even point
            </div>
          )}
        </div>
      </div>
    );
  };

  // CSV EXPORT MODAL (Feature 10)
  const ExportModal = () => {
    if (!showExportModal) return null;
    
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-md w-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <FileDown className="w-6 h-6 text-emerald-400" />
              Export Data
            </h2>
            <button onClick={() => setShowExportModal(false)} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="space-y-3">
            <button onClick={() => { exportWeeklyDataCSV(); setShowExportModal(false); }}
              className="w-full p-4 bg-slate-900/50 hover:bg-slate-700 border border-slate-600 rounded-xl text-left flex items-center gap-3">
              <Calendar className="w-6 h-6 text-violet-400" />
              <div>
                <p className="text-white font-medium">Weekly Sales Data</p>
                <p className="text-slate-400 text-sm">Revenue, profit, units by week</p>
              </div>
            </button>
            
            <button onClick={() => { exportSKUDataCSV(); setShowExportModal(false); }}
              className="w-full p-4 bg-slate-900/50 hover:bg-slate-700 border border-slate-600 rounded-xl text-left flex items-center gap-3">
              <Package className="w-6 h-6 text-pink-400" />
              <div>
                <p className="text-white font-medium">SKU Performance</p>
                <p className="text-slate-400 text-sm">All SKUs with totals and averages</p>
              </div>
            </button>
            
            <button onClick={() => { exportInventoryCSV(); setShowExportModal(false); }}
              disabled={Object.keys(invHistory).length === 0}
              className="w-full p-4 bg-slate-900/50 hover:bg-slate-700 border border-slate-600 rounded-xl text-left flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed">
              <Boxes className="w-6 h-6 text-amber-400" />
              <div>
                <p className="text-white font-medium">Inventory Snapshot</p>
                <p className="text-slate-400 text-sm">Current inventory with values</p>
              </div>
            </button>
            
            <button onClick={() => { exportAll(); setShowExportModal(false); }}
              className="w-full p-4 bg-slate-900/50 hover:bg-slate-700 border border-slate-600 rounded-xl text-left flex items-center gap-3">
              <Database className="w-6 h-6 text-emerald-400" />
              <div>
                <p className="text-white font-medium">Full Backup (JSON)</p>
                <p className="text-slate-400 text-sm">Complete data backup for restore</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // INVOICE/BILLS MODAL
  const InvoiceModal = () => {
    if (!showInvoiceModal) return null;
    
    const categories = [
      { value: 'operations', label: '🏢 Operations', color: 'slate' },
      { value: 'inventory', label: '📦 Inventory/COGS', color: 'amber' },
      { value: 'marketing', label: '📣 Marketing/Ads', color: 'violet' },
      { value: 'software', label: '💻 Software/SaaS', color: 'blue' },
      { value: 'shipping', label: '🚚 Shipping/3PL', color: 'emerald' },
      { value: 'taxes', label: '📋 Taxes/Fees', color: 'rose' },
      { value: 'other', label: '📎 Other', color: 'slate' },
    ];
    
    const resetForm = () => {
      setInvoiceForm({ vendor: '', description: '', amount: '', dueDate: '', recurring: false, frequency: 'monthly', category: 'operations' });
      setEditingInvoice(null);
    };
    
    const handleSave = () => {
      if (!invoiceForm.vendor || !invoiceForm.amount || !invoiceForm.dueDate) return;
      
      const invoice = {
        id: editingInvoice?.id || Date.now().toString(),
        ...invoiceForm,
        amount: parseFloat(invoiceForm.amount),
        createdAt: editingInvoice?.createdAt || new Date().toISOString(),
        paid: editingInvoice?.paid || false,
      };
      
      if (editingInvoice) {
        setInvoices(prev => prev.map(i => i.id === editingInvoice.id ? invoice : i));
      } else {
        setInvoices(prev => [...prev, invoice]);
      }
      resetForm();
    };
    
    const handleDelete = (id) => {
      setInvoices(prev => prev.filter(i => i.id !== id));
    };
    
    const handleMarkPaid = (id) => {
      setInvoices(prev => prev.map(i => i.id === id ? { ...i, paid: true, paidDate: new Date().toISOString() } : i));
    };
    
    // PDF Upload and AI extraction
    const handlePdfUpload = async (file) => {
      if (!file || !file.type.includes('pdf')) {
        alert('Please upload a PDF file');
        return;
      }
      
      setProcessingPdf(true);
      
      try {
        // Convert PDF to base64
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        
        // Send to AI to extract invoice details
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system: `You are an invoice data extractor. Extract the following from the invoice and respond ONLY with valid JSON, no other text:
{
  "vendor": "company name",
  "description": "brief description of what this invoice is for",
  "amount": number (just the number, no currency symbol),
  "dueDate": "YYYY-MM-DD format",
  "category": one of: "operations", "inventory", "marketing", "software", "shipping", "taxes", "other"
}
If you cannot find a field, use null. For dueDate, if only month/year given, use the 1st of that month.`,
            messages: [{ 
              role: 'user', 
              content: [
                { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 }},
                { type: 'text', text: 'Extract the invoice details from this PDF.' }
              ]
            }]
          }),
        });
        
        if (!response.ok) throw new Error('API error');
        const data = await response.json();
        const text = data.content?.[0]?.text || '';
        
        // Parse the JSON response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const extracted = JSON.parse(jsonMatch[0]);
          setInvoiceForm(prev => ({
            ...prev,
            vendor: extracted.vendor || prev.vendor,
            description: extracted.description || prev.description,
            amount: extracted.amount?.toString() || prev.amount,
            dueDate: extracted.dueDate || prev.dueDate,
            category: extracted.category || prev.category,
          }));
        }
      } catch (error) {
        console.error('PDF extraction error:', error);
        alert('Could not extract invoice details. Please enter manually.');
      } finally {
        setProcessingPdf(false);
      }
    };
    
    const upcomingInvoices = invoices.filter(i => !i.paid).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    const paidInvoices = invoices.filter(i => i.paid).sort((a, b) => new Date(b.paidDate) - new Date(a.paidDate)).slice(0, 10);
    
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <FileText className="w-6 h-6 text-amber-400" />
              Upcoming Bills & Invoices
            </h2>
            <button onClick={() => { setShowInvoiceModal(false); resetForm(); }} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Add/Edit Form */}
          <div className="bg-slate-900/50 rounded-xl p-4 mb-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">{editingInvoice ? 'Edit Invoice' : 'Add New Invoice'}</h3>
            
            {/* PDF Upload */}
            <div className="mb-4">
              <label className={`flex items-center justify-center gap-2 p-3 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${processingPdf ? 'border-violet-500 bg-violet-950/30' : 'border-slate-600 hover:border-slate-500'}`}>
                <input type="file" accept=".pdf" onChange={(e) => e.target.files[0] && handlePdfUpload(e.target.files[0])} className="hidden" disabled={processingPdf} />
                {processingPdf ? (
                  <>
                    <RefreshCw className="w-5 h-5 text-violet-400 animate-spin" />
                    <span className="text-violet-400">Extracting invoice details...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 text-slate-400" />
                    <span className="text-slate-400">Upload PDF to auto-fill</span>
                  </>
                )}
              </label>
            </div>
            
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Vendor/Company *</label>
                <input value={invoiceForm.vendor} onChange={e => setInvoiceForm(p => ({...p, vendor: e.target.value}))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" placeholder="Amazon, Shopify, etc." />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Amount *</label>
                <input type="number" value={invoiceForm.amount} onChange={e => setInvoiceForm(p => ({...p, amount: e.target.value}))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" placeholder="0.00" />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Due Date *</label>
                <input type="date" value={invoiceForm.dueDate} onChange={e => setInvoiceForm(p => ({...p, dueDate: e.target.value}))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Category</label>
                <select value={invoiceForm.category} onChange={e => setInvoiceForm(p => ({...p, category: e.target.value}))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm">
                  {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>
            
            <div className="mb-3">
              <label className="block text-xs text-slate-400 mb-1">Description</label>
              <input value={invoiceForm.description} onChange={e => setInvoiceForm(p => ({...p, description: e.target.value}))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" placeholder="Monthly subscription, inventory purchase, etc." />
            </div>
            
            <div className="flex items-center gap-4 mb-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={invoiceForm.recurring} onChange={e => setInvoiceForm(p => ({...p, recurring: e.target.checked}))}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-violet-500" />
                <span className="text-sm text-slate-300">Recurring bill</span>
              </label>
              {invoiceForm.recurring && (
                <select value={invoiceForm.frequency} onChange={e => setInvoiceForm(p => ({...p, frequency: e.target.value}))}
                  className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1 text-white text-sm">
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              )}
            </div>
            
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={!invoiceForm.vendor || !invoiceForm.amount || !invoiceForm.dueDate}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 rounded-lg text-sm">
                {editingInvoice ? 'Update' : 'Add Invoice'}
              </button>
              {editingInvoice && (
                <button onClick={resetForm} className="px-4 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 rounded-lg text-sm">
                  Cancel
                </button>
              )}
            </div>
          </div>
          
          {/* Upcoming Invoices */}
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-amber-400 mb-2 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Upcoming ({upcomingInvoices.length})
            </h3>
            {upcomingInvoices.length > 0 ? (
              <div className="space-y-2">
                {upcomingInvoices.map(inv => {
                  const daysUntil = Math.ceil((new Date(inv.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
                  const isOverdue = daysUntil < 0;
                  const isDueSoon = daysUntil <= 7 && daysUntil >= 0;
                  const cat = categories.find(c => c.value === inv.category);
                  
                  return (
                    <div key={inv.id} className={`flex items-center justify-between p-3 rounded-xl border ${isOverdue ? 'bg-rose-900/20 border-rose-500/50' : isDueSoon ? 'bg-amber-900/20 border-amber-500/50' : 'bg-slate-900/50 border-slate-700'}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{cat?.label.split(' ')[0]}</span>
                        <div>
                          <p className="text-white font-medium">{inv.vendor}</p>
                          <p className="text-slate-400 text-xs">{inv.description || 'No description'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-white font-bold">{formatCurrency(inv.amount)}</p>
                          <p className={`text-xs ${isOverdue ? 'text-rose-400' : isDueSoon ? 'text-amber-400' : 'text-slate-400'}`}>
                            {isOverdue ? `${Math.abs(daysUntil)} days overdue` : daysUntil === 0 ? 'Due today' : `Due in ${daysUntil} days`}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => handleMarkPaid(inv.id)} className="p-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 rounded-lg text-emerald-400" title="Mark as paid">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={() => { setEditingInvoice(inv); setInvoiceForm({ vendor: inv.vendor, description: inv.description || '', amount: inv.amount.toString(), dueDate: inv.dueDate, recurring: inv.recurring || false, frequency: inv.frequency || 'monthly', category: inv.category || 'operations' }); }} className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-400" title="Edit">
                            <FileText className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(inv.id)} className="p-1.5 bg-rose-600/30 hover:bg-rose-600/50 rounded-lg text-rose-400" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-slate-500 text-sm text-center py-4">No upcoming invoices</p>
            )}
          </div>
          
          {/* Recently Paid */}
          {paidInvoices.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-emerald-400 mb-2 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Recently Paid
              </h3>
              <div className="space-y-1">
                {paidInvoices.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between p-2 bg-slate-900/30 rounded-lg opacity-60">
                    <span className="text-slate-400 text-sm">{inv.vendor}</span>
                    <span className="text-slate-400 text-sm">{formatCurrency(inv.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // COMPARISON MODAL (Feature 12)
  const ComparisonView = () => {
    if (!compareMode || compareItems.length < 2) return null;
    
    const sortedWeeks = Object.keys(allWeeksData).sort();
    const items = compareItems.slice(0, 4).map(key => {
      const data = allWeeksData[key];
      if (!data) return null;
      return {
        key,
        label: key,
        revenue: data.total?.revenue || 0,
        profit: data.total?.netProfit || 0,
        units: data.total?.units || 0,
        margin: data.total?.revenue ? ((data.total?.netProfit || 0) / data.total.revenue * 100) : 0,
        amazonRev: data.amazon?.revenue || 0,
        shopifyRev: data.shopify?.revenue || 0,
        note: weekNotes[key] || '',
      };
    }).filter(Boolean);
    
    if (items.length < 2) return null;
    
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <GitCompareArrows className="w-6 h-6 text-violet-400" />
              Compare Weeks
            </h2>
            <button onClick={() => { setCompareMode(false); setCompareItems([]); }} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left text-slate-400 py-2 px-3">Metric</th>
                  {items.map(item => (
                    <th key={item.key} className="text-right text-white py-2 px-3 font-semibold">{item.label}</th>
                  ))}
                  <th className="text-right text-slate-400 py-2 px-3">Difference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                <tr>
                  <td className="py-3 px-3 text-slate-400">Revenue</td>
                  {items.map(item => <td key={item.key} className="text-right py-3 px-3 text-white font-medium">{formatCurrency(item.revenue)}</td>)}
                  <td className={`text-right py-3 px-3 font-medium ${items[1].revenue >= items[0].revenue ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {items[1].revenue >= items[0].revenue ? '+' : ''}{formatCurrency(items[1].revenue - items[0].revenue)}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-3 text-slate-400">Profit</td>
                  {items.map(item => <td key={item.key} className={`text-right py-3 px-3 font-medium ${item.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(item.profit)}</td>)}
                  <td className={`text-right py-3 px-3 font-medium ${items[1].profit >= items[0].profit ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {items[1].profit >= items[0].profit ? '+' : ''}{formatCurrency(items[1].profit - items[0].profit)}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-3 text-slate-400">Units</td>
                  {items.map(item => <td key={item.key} className="text-right py-3 px-3 text-white">{formatNumber(item.units)}</td>)}
                  <td className={`text-right py-3 px-3 font-medium ${items[1].units >= items[0].units ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {items[1].units >= items[0].units ? '+' : ''}{formatNumber(items[1].units - items[0].units)}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-3 text-slate-400">Margin</td>
                  {items.map(item => <td key={item.key} className="text-right py-3 px-3 text-white">{item.margin.toFixed(1)}%</td>)}
                  <td className={`text-right py-3 px-3 font-medium ${items[1].margin >= items[0].margin ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {items[1].margin >= items[0].margin ? '+' : ''}{(items[1].margin - items[0].margin).toFixed(1)}%
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-3 text-slate-400">Amazon</td>
                  {items.map(item => <td key={item.key} className="text-right py-3 px-3 text-orange-400">{formatCurrency(item.amazonRev)}</td>)}
                  <td className={`text-right py-3 px-3 font-medium ${items[1].amazonRev >= items[0].amazonRev ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {items[1].amazonRev >= items[0].amazonRev ? '+' : ''}{formatCurrency(items[1].amazonRev - items[0].amazonRev)}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-3 text-slate-400">Shopify</td>
                  {items.map(item => <td key={item.key} className="text-right py-3 px-3 text-blue-400">{formatCurrency(item.shopifyRev)}</td>)}
                  <td className={`text-right py-3 px-3 font-medium ${items[1].shopifyRev >= items[0].shopifyRev ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {items[1].shopifyRev >= items[0].shopifyRev ? '+' : ''}{formatCurrency(items[1].shopifyRev - items[0].shopifyRev)}
                  </td>
                </tr>
                {items.some(i => i.note) && (
                  <tr>
                    <td className="py-3 px-3 text-slate-400">Notes</td>
                    {items.map(item => <td key={item.key} className="text-right py-3 px-3 text-slate-300 text-sm max-w-[150px] truncate">{item.note || '—'}</td>)}
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          <div className="mt-4 pt-4 border-t border-slate-700 flex justify-between items-center">
            <p className="text-slate-500 text-sm">Select weeks from the dashboard to compare</p>
            <button onClick={() => { setCompareMode(false); setCompareItems([]); }}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-medium">
              Done
            </button>
          </div>
        </div>
      </div>
    );
  };

  // NOTES COMPONENT (Feature 8)
  const WeekNoteEditor = ({ weekKey, compact = false }) => {
    const note = weekNotes[weekKey] || '';
    const isEditing = editingNote === weekKey;
    
    if (compact) {
      return note ? (
        <div className="flex items-center gap-1 text-amber-400 text-xs cursor-pointer" onClick={() => { setEditingNote(weekKey); setNoteText(note); }}>
          <StickyNote className="w-3 h-3" />
          <span className="truncate max-w-[100px]">{note}</span>
        </div>
      ) : (
        <button onClick={() => { setEditingNote(weekKey); setNoteText(''); }} className="text-slate-500 hover:text-slate-400 text-xs flex items-center gap-1">
          <StickyNote className="w-3 h-3" />Add note
        </button>
      );
    }
    
    if (isEditing) {
      return (
        <div className="flex gap-2 items-start">
          <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a note (e.g., 'Ran 20% off promo')"
            className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm resize-none" rows={2} />
          <div className="flex flex-col gap-1">
            <button onClick={() => { setWeekNotes(p => ({...p, [weekKey]: noteText})); setEditingNote(null); }}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg">Save</button>
            <button onClick={() => setEditingNote(null)} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      );
    }
    
    return note ? (
      <div className="flex items-start gap-2 bg-amber-900/20 border border-amber-500/30 rounded-lg p-2 cursor-pointer" onClick={() => { setEditingNote(weekKey); setNoteText(note); }}>
        <StickyNote className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-amber-200 text-sm">{note}</p>
      </div>
    ) : (
      <button onClick={() => { setEditingNote(weekKey); setNoteText(''); }} className="text-slate-500 hover:text-slate-400 text-sm flex items-center gap-1">
        <StickyNote className="w-4 h-4" />Add note for this week
      </button>
    );
  };

  const hasCogs = Object.keys(savedCogs).length > 0;
  
  // AI Chat - Prepare data context function
  const prepareDataContext = () => {
    const weeksCount = Object.keys(allWeeksData).length;
    const periodsCount = Object.keys(allPeriodsData).length;
    const sortedWeeks = Object.keys(allWeeksData).sort();
    
    const weeksSummary = sortedWeeks.map(week => {
      const data = allWeeksData[week];
      const amz = data.amazon || {};
      const shop = data.shopify || {};
      const total = data.total || {};
      return {
        weekEnding: week,
        totalRevenue: total.revenue || 0,
        totalProfit: total.netProfit || 0,
        totalUnits: total.units || 0,
        margin: total.revenue ? ((total.netProfit || 0) / total.revenue * 100).toFixed(1) : 0,
        amazonRevenue: amz.revenue || 0,
        amazonProfit: amz.netProfit || 0,
        shopifyRevenue: shop.revenue || 0,
        shopifyProfit: shop.netProfit || 0,
      };
    });
    
    const periodsSummary = Object.entries(allPeriodsData).map(([label, data]) => {
      const amz = data.amazon || {};
      const shop = data.shopify || {};
      return {
        period: label,
        label: data.label || label,
        type: label.match(/^\d{4}$/) ? 'yearly' : label.match(/^q\d/i) ? 'quarterly' : 'monthly',
        totalRevenue: data.total?.revenue || 0,
        totalProfit: data.total?.netProfit || 0,
        totalUnits: data.total?.units || 0,
        totalCogs: data.total?.cogs || 0,
        totalAdSpend: data.total?.adSpend || 0,
        margin: data.total?.revenue > 0 ? ((data.total?.netProfit || 0) / data.total.revenue * 100) : 0,
        amazonRevenue: amz.revenue || 0,
        amazonProfit: amz.netProfit || 0,
        amazonUnits: amz.units || 0,
        shopifyRevenue: shop.revenue || 0,
        shopifyProfit: shop.netProfit || 0,
        shopifyUnits: shop.units || 0,
        threeplCosts: shop.threeplCosts || 0,
        skuCount: ((amz.skuData || []).length + (shop.skuData || []).length),
      };
    }).sort((a, b) => a.period.localeCompare(b.period));
    
    const skuWeeklyBreakdown = {};
    sortedWeeks.forEach(week => {
      const data = allWeeksData[week];
      (data.amazon?.skuData || []).forEach(s => {
        const sku = s.sku || s.msku || 'unknown';
        if (!skuWeeklyBreakdown[sku]) {
          skuWeeklyBreakdown[sku] = { sku, name: s.name || s.title || sku, channel: 'Amazon', weeks: {}, totals: { revenue: 0, units: 0, profit: 0, fees: 0 } };
        }
        const units = s.unitsSold || s.units || 0;
        const revenue = s.netSales || s.revenue || 0;
        const proceeds = s.netProceeds || revenue;
        // Amazon: netProceeds IS the profit (already has COGS, fees, and ad spend deducted)
        const profit = proceeds;
        const fees = revenue - proceeds;
        skuWeeklyBreakdown[sku].weeks[week] = { units, revenue, profit, fees, profitPerUnit: units > 0 ? profit / units : 0 };
        skuWeeklyBreakdown[sku].totals.revenue += revenue;
        skuWeeklyBreakdown[sku].totals.units += units;
        skuWeeklyBreakdown[sku].totals.profit += profit;
        skuWeeklyBreakdown[sku].totals.fees += fees;
      });
      (data.shopify?.skuData || []).forEach(s => {
        const sku = 'SHOP_' + (s.sku || 'unknown');
        if (!skuWeeklyBreakdown[sku]) {
          skuWeeklyBreakdown[sku] = { sku: s.sku, name: s.name || s.title || s.sku, channel: 'Shopify', weeks: {}, totals: { revenue: 0, units: 0, profit: 0, fees: 0 } };
        }
        const units = s.unitsSold || s.units || 0;
        const revenue = s.netSales || s.revenue || 0;
        // Shopify: netSales already has discounts deducted, subtract COGS
        const profit = revenue - (s.cogs || 0);
        skuWeeklyBreakdown[sku].weeks[week] = { units, revenue, profit, fees: 0, profitPerUnit: units > 0 ? profit / units : 0 };
        skuWeeklyBreakdown[sku].totals.revenue += revenue;
        skuWeeklyBreakdown[sku].totals.units += units;
        skuWeeklyBreakdown[sku].totals.profit += profit;
      });
    });
    
    const skuAnalysis = Object.values(skuWeeklyBreakdown).filter(s => s.totals.units >= 1).map(s => {
      const weekDates = Object.keys(s.weeks).sort();
      const recentWeeks = weekDates.slice(-4);
      const olderWeeks = weekDates.slice(-8, -4);
      let recentUnits = 0, recentProfit = 0, olderUnits = 0, olderProfit = 0;
      recentWeeks.forEach(w => { recentUnits += s.weeks[w].units; recentProfit += s.weeks[w].profit; });
      olderWeeks.forEach(w => { olderUnits += s.weeks[w].units; olderProfit += s.weeks[w].profit; });
      const recentPPU = recentUnits > 0 ? recentProfit / recentUnits : 0;
      const olderPPU = olderUnits > 0 ? olderProfit / olderUnits : 0;
      const ppuChange = olderWeeks.length > 0 ? recentPPU - olderPPU : 0;
      const overallPPU = s.totals.units > 0 ? s.totals.profit / s.totals.units : 0;
      const overallMargin = s.totals.revenue > 0 ? (s.totals.profit / s.totals.revenue * 100) : 0;
      // Get product name from savedProductNames if available
      const productName = savedProductNames[s.sku] || s.name || s.sku;
      return {
        sku: s.sku, name: s.name, productName, channel: s.channel,
        totalRevenue: s.totals.revenue, totalUnits: s.totals.units, totalProfit: s.totals.profit, totalFees: s.totals.fees,
        profitPerUnit: overallPPU, margin: overallMargin,
        recentProfitPerUnit: recentPPU, priorProfitPerUnit: olderPPU, profitPerUnitChange: ppuChange,
        trend: ppuChange > 0.5 ? 'improving' : ppuChange < -0.5 ? 'declining' : 'stable',
      };
    }).sort((a, b) => b.totalRevenue - a.totalRevenue);
    
    const latestInvDate = Object.keys(invHistory).sort().reverse()[0];
    const latestInv = latestInvDate ? invHistory[latestInvDate] : null;
    const inventorySummary = latestInv ? {
      asOfDate: latestInvDate, totalUnits: latestInv.totalUnits || 0, totalValue: latestInv.totalValue || 0,
      lowStockItems: (latestInv.items || []).filter(i => i.health === 'low' || i.health === 'critical').map(i => ({ sku: i.sku, units: i.totalUnits })),
    } : null;
    
    const taxSummary = {
      nexusStates: Object.entries(salesTaxConfig.nexusStates || {}).filter(([,v]) => v.hasNexus).map(([code, config]) => ({ state: US_STATES_TAX_INFO[code]?.name || code, frequency: config.frequency })),
      totalPaidAllTime: Object.values(salesTaxConfig.filingHistory || {}).reduce((sum, periods) => sum + Object.values(periods).reduce((s, p) => s + (p.amount || 0), 0), 0),
    };
    
    // Build product catalog with categories from product names
    const productCatalog = Object.entries(savedProductNames).map(([sku, name]) => {
      // Auto-detect category from product name
      const nameLower = name.toLowerCase();
      let category = 'Other';
      if (nameLower.includes('lip balm')) category = 'Lip Balm';
      else if (nameLower.includes('deodorant') && nameLower.includes('sensitive')) category = 'Sensitive Skin Deodorant';
      else if (nameLower.includes('deodorant') && nameLower.includes('extra strength')) category = 'Extra Strength Deodorant';
      else if (nameLower.includes('deodorant')) category = 'Deodorant';
      else if (nameLower.includes('soap') && nameLower.includes('athlete')) category = "Athlete's Shield Soap";
      else if (nameLower.includes('soap')) category = 'Tallow Soap Bars';
      else if (nameLower.includes('sun balm')) category = 'Sun Balm';
      else if (nameLower.includes('tallow balm')) category = 'Tallow Balm';
      
      return { sku, name, category };
    });
    
    // Group SKUs by category for easier AI lookup
    const skusByCategory = {};
    productCatalog.forEach(p => {
      if (!skusByCategory[p.category]) skusByCategory[p.category] = [];
      skusByCategory[p.category].push(p.sku);
    });
    
    const allTimeRevenue = weeksSummary.reduce((s, w) => s + w.totalRevenue, 0);
    const allTimeProfit = weeksSummary.reduce((s, w) => s + w.totalProfit, 0);
    const allTimeUnits = weeksSummary.reduce((s, w) => s + w.totalUnits, 0);
    const recentWeeksData = weeksSummary.slice(-4);
    const priorWeeksData = weeksSummary.slice(-8, -4);
    const recentRevenue = recentWeeksData.reduce((s, w) => s + w.totalRevenue, 0);
    const priorRevenue = priorWeeksData.reduce((s, w) => s + w.totalRevenue, 0);
    const recentProfit = recentWeeksData.reduce((s, w) => s + w.totalProfit, 0);
    const priorProfit = priorWeeksData.reduce((s, w) => s + w.totalProfit, 0);
    
    return {
      storeName: storeName || 'E-Commerce Store',
      dataRange: { weeksTracked: weeksCount, periodsTracked: periodsCount, oldestWeek: sortedWeeks[0], newestWeek: sortedWeeks[sortedWeeks.length - 1] },
      weeklyData: weeksSummary,
      periodData: periodsSummary,
      skuAnalysis: skuAnalysis.slice(0, 30),
      skusByProfitPerUnit: [...skuAnalysis].sort((a, b) => b.profitPerUnit - a.profitPerUnit).slice(0, 10),
      decliningSkus: skuAnalysis.filter(s => s.trend === 'declining').slice(0, 10),
      improvingSkus: skuAnalysis.filter(s => s.trend === 'improving').slice(0, 10),
      productCatalog,
      skusByCategory,
      inventory: inventorySummary,
      salesTax: taxSummary,
      goals,
      insights: {
        allTimeRevenue, allTimeProfit, allTimeUnits,
        avgWeeklyRevenue: weeksCount > 0 ? allTimeRevenue / weeksCount : 0,
        avgWeeklyProfit: weeksCount > 0 ? allTimeProfit / weeksCount : 0,
        overallMargin: allTimeRevenue > 0 ? (allTimeProfit / allTimeRevenue * 100) : 0,
        overallProfitPerUnit: allTimeUnits > 0 ? allTimeProfit / allTimeUnits : 0,
        recentVsPrior: {
          recentRevenue, priorRevenue, revenueChange: priorRevenue > 0 ? ((recentRevenue - priorRevenue) / priorRevenue * 100) : 0,
          recentProfit, priorProfit, profitChange: priorProfit > 0 ? ((recentProfit - priorProfit) / priorProfit * 100) : 0,
        },
        topChannel: allTimeRevenue > 0 ? (weeksSummary.reduce((s, w) => s + w.amazonRevenue, 0) > allTimeRevenue / 2 ? 'Amazon' : 'Shopify') : 'Unknown',
      },
    };
  };
  
  // Send AI Message - defined at component level, not nested
  const sendAIMessage = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const userMessage = aiInput.trim();
    setAiInput('');
    setAiMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setAiLoading(true);
    
    try {
      const ctx = prepareDataContext();
      
      // Build alerts summary for AI
      const alertsSummary = [];
      if (ctx.inventory?.lowStockItems?.length > 0) {
        alertsSummary.push(`LOW STOCK ALERT: ${ctx.inventory.lowStockItems.length} products need reorder (${ctx.inventory.lowStockItems.map(i => i.sku).join(', ')})`);
      }
      if (ctx.salesTax?.nexusStates?.length > 0) {
        alertsSummary.push(`Sales tax nexus in ${ctx.salesTax.nexusStates.length} states: ${ctx.salesTax.nexusStates.map(s => s.state).join(', ')}`);
      }
      
      // Include forecast data if available
      const forecastData = generateForecast ? {
        nextMonth: generateForecast.monthly,
        trend: generateForecast.trend,
        confidence: generateForecast.confidence,
        weekly: generateForecast.weekly
      } : null;
      
      // Include week notes
      const notesData = Object.entries(weekNotes).filter(([k, v]) => v).map(([week, note]) => ({ week, note }));
      
      const systemPrompt = `You are an expert e-commerce analyst and business advisor for "${ctx.storeName}". You have access to ALL uploaded sales data and can answer questions about any aspect of the business.

IMPORTANT PROFIT CALCULATION NOTES:
- Amazon "Net Proceeds" IS the profit - it already has COGS, fees, and ad spend deducted
- Shopify profit = Net Sales - COGS (discounts already deducted from Net Sales)
- Do NOT double-count COGS or ad spend when calculating Amazon profit

STORE: ${ctx.storeName}
DATA RANGE: ${ctx.dataRange.weeksTracked} weeks tracked (${ctx.dataRange.oldestWeek || 'N/A'} to ${ctx.dataRange.newestWeek || 'N/A'})

=== KEY METRICS (All Time) ===
- Total Revenue: $${ctx.insights.allTimeRevenue.toFixed(2)}
- Total Profit: $${ctx.insights.allTimeProfit.toFixed(2)}
- Total Units Sold: ${ctx.insights.allTimeUnits}
- Overall Margin: ${ctx.insights.overallMargin.toFixed(1)}%
- Avg Profit/Unit: $${ctx.insights.overallProfitPerUnit.toFixed(2)}
- Avg Weekly Revenue: $${ctx.insights.avgWeeklyRevenue.toFixed(2)}
- Avg Weekly Profit: $${ctx.insights.avgWeeklyProfit.toFixed(2)}

=== RECENT TREND (Last 4 weeks vs Prior 4 weeks) ===
- Recent Revenue: $${ctx.insights.recentVsPrior.recentRevenue.toFixed(2)}
- Prior Revenue: $${ctx.insights.recentVsPrior.priorRevenue.toFixed(2)}
- Revenue Change: ${ctx.insights.recentVsPrior.revenueChange.toFixed(1)}%
- Recent Profit: $${ctx.insights.recentVsPrior.recentProfit.toFixed(2)}
- Prior Profit: $${ctx.insights.recentVsPrior.priorProfit.toFixed(2)}
- Profit Change: ${ctx.insights.recentVsPrior.profitChange.toFixed(1)}%

=== FORECAST (Next 4 Weeks Projection) ===
${forecastData ? `
- Projected Monthly Revenue: $${forecastData.nextMonth.revenue.toFixed(2)}
- Projected Monthly Profit: $${forecastData.nextMonth.profit.toFixed(2)}
- Projected Monthly Units: ${forecastData.nextMonth.units}
- Trend Direction: ${forecastData.trend.revenue} (${forecastData.trend.revenueChange.toFixed(1)}% per week)
- Forecast Confidence: ${forecastData.confidence}%
- Weekly Projections: ${JSON.stringify(forecastData.weekly)}
` : 'Not enough data for forecast (need 4+ weeks)'}

=== GOALS ===
- Weekly Revenue Target: $${ctx.goals.weeklyRevenue || 0}
- Weekly Profit Target: $${ctx.goals.weeklyProfit || 0}
- Monthly Revenue Target: $${ctx.goals.monthlyRevenue || 0}
- Monthly Profit Target: $${ctx.goals.monthlyProfit || 0}
${ctx.goals.weeklyRevenue > 0 && ctx.weeklyData.length > 0 ? `- Last Week vs Goal: ${ctx.weeklyData[ctx.weeklyData.length-1]?.totalRevenue >= ctx.goals.weeklyRevenue ? 'MET' : 'MISSED'}` : ''}

=== ALERTS ===
${alertsSummary.length > 0 ? alertsSummary.join('\n') : 'No active alerts'}

=== PRODUCT CATALOG (SKU to Product Name mapping) ===
${JSON.stringify(ctx.productCatalog)}

=== SKUs BY CATEGORY ===
${JSON.stringify(ctx.skusByCategory)}
When user asks about a product type (e.g., "lip balm", "deodorant", "soap"), find the matching category and aggregate data for those SKUs.

=== WEEKLY DATA (most recent 12 weeks) ===
${JSON.stringify(ctx.weeklyData.slice().reverse().slice(0, 12))}

=== PERIOD DATA (Quarterly/Monthly/Yearly Historical) ===
${ctx.periodData.length > 0 ? 'Historical periods tracked: ' + ctx.periodData.length + '\n' + JSON.stringify(ctx.periodData) : 'No historical period data uploaded yet (quarterly/monthly/yearly)'}

=== WEEK NOTES (user annotations) ===
${notesData.length > 0 ? JSON.stringify(notesData) : 'No notes added'}

=== TOP SKUS BY REVENUE (with profit/unit trends) ===
${JSON.stringify(ctx.skuAnalysis.slice(0, 15))}

=== SKUS WITH DECLINING PROFITABILITY ===
${JSON.stringify(ctx.decliningSkus)}

=== SKUS WITH IMPROVING PROFITABILITY ===
${JSON.stringify(ctx.improvingSkus)}

=== INVENTORY STATUS ===
${ctx.inventory ? `As of ${ctx.inventory.asOfDate}: ${ctx.inventory.totalUnits} total units, $${ctx.inventory.totalValue?.toFixed(2) || 0} value` : 'No inventory data'}
${ctx.inventory?.lowStockItems?.length > 0 ? `Low stock items: ${JSON.stringify(ctx.inventory.lowStockItems)}` : ''}

=== SALES TAX ===
${ctx.salesTax?.nexusStates?.length > 0 ? `Nexus states: ${JSON.stringify(ctx.salesTax.nexusStates)}` : 'No nexus states configured'}
Total sales tax paid all-time: $${ctx.salesTax?.totalPaidAllTime?.toFixed(2) || 0}

=== UPCOMING BILLS & INVOICES ===
${invoices.filter(i => !i.paid).length > 0 ? `
Upcoming bills (${invoices.filter(i => !i.paid).length} total, $${invoices.filter(i => !i.paid).reduce((s, i) => s + i.amount, 0).toFixed(2)}):
${JSON.stringify(invoices.filter(i => !i.paid).map(i => ({ vendor: i.vendor, amount: i.amount, dueDate: i.dueDate, category: i.category, daysUntilDue: Math.ceil((new Date(i.dueDate) - new Date()) / (1000 * 60 * 60 * 24)) })))}
` : 'No upcoming bills'}

=== AMAZON FORECASTS (from Amazon's projections) ===
${upcomingAmazonForecasts.length > 0 ? `
Upcoming Amazon projections:
${JSON.stringify(upcomingAmazonForecasts.map(f => ({ weekEnding: f.weekEnding, projectedRevenue: f.totals.sales, projectedUnits: f.totals.units, projectedProfit: f.totals.proceeds, skuCount: f.skuCount })))}
` : 'No upcoming Amazon forecasts uploaded'}

${getAmazonForecastComparison.length > 0 ? `
Forecast vs Actual Accuracy (Amazon) - ${getAmazonForecastComparison.length} weeks tracked:
${JSON.stringify(getAmazonForecastComparison.slice(0, 8).map(c => ({ 
  week: c.weekEnding, 
  forecastRev: c.forecast.revenue, 
  actualRev: c.actual.revenue, 
  variance: c.variance.revenuePercent.toFixed(1) + '%',
  accuracy: c.accuracy.toFixed(1) + '%',
  status: c.status 
})))}
` : ''}

${forecastAccuracyMetrics ? `
FORECAST ACCURACY INSIGHTS:
- Overall Accuracy: ${forecastAccuracyMetrics.avgAccuracy.toFixed(1)}% (based on ${forecastAccuracyMetrics.totalWeeks} weeks)
- Beat forecast ${forecastAccuracyMetrics.beatCount} times, Missed ${forecastAccuracyMetrics.missedCount} times
- Average Revenue Variance: ${forecastAccuracyMetrics.avgRevenueVariance > 0 ? '+' : ''}${forecastAccuracyMetrics.avgRevenueVariance.toFixed(1)}%
- Forecast Bias: ${forecastAccuracyMetrics.biasDescription}
- Recent 4-week Accuracy: ${forecastAccuracyMetrics.recentAccuracy.toFixed(1)}%
- Accuracy Trend: ${forecastAccuracyMetrics.accuracyTrend > 0 ? 'Improving' : forecastAccuracyMetrics.accuracyTrend < 0 ? 'Declining' : 'Stable'} (${forecastAccuracyMetrics.accuracyTrend > 0 ? '+' : ''}${forecastAccuracyMetrics.accuracyTrend.toFixed(1)}%)
${forecastAccuracyMetrics.bestWeek ? `- Best Predicted Week: ${forecastAccuracyMetrics.bestWeek.weekEnding} (${forecastAccuracyMetrics.bestWeek.accuracy.toFixed(1)}% accurate)` : ''}
${forecastAccuracyMetrics.worstWeek ? `- Worst Predicted Week: ${forecastAccuracyMetrics.worstWeek.weekEnding} (${forecastAccuracyMetrics.worstWeek.accuracy.toFixed(1)}% accurate)` : ''}
` : ''}

${mlTrainingData ? `
ML CORRECTION MODEL (based on ${mlTrainingData.summary.totalSamples} samples):
- Amazon Bias: ${mlTrainingData.summary.bias > 0 ? 'Under-forecasts' : 'Over-forecasts'} by ${Math.abs(mlTrainingData.summary.bias).toFixed(1)}% on average
- Correction Factor: ${mlTrainingData.summary.correctionFactor.toFixed(3)}x (multiply Amazon forecast by this)
- Prediction Variance: ±${mlTrainingData.summary.stdDev.toFixed(1)}%
- When user asks about expected revenue, apply correction: Amazon Forecast × ${mlTrainingData.summary.correctionFactor.toFixed(3)} = Adjusted Forecast
` : ''}

${pendingForecasts.length > 0 ? `
PENDING FORECASTS (awaiting actual data):
${pendingForecasts.map(pf => `- Week ${pf.weekEnding}: ${pf.forecast.totals.sales.toFixed(0)} forecasted (${pf.isPast ? 'PAST - needs actuals uploaded' : pf.daysUntil + ' days until week ends'})`).join('\n')}
` : ''}

=== PRODUCTION PIPELINE (incoming inventory) ===
${productionPipeline.length > 0 ? `
${productionPipeline.length} production orders in pipeline (${formatNumber(productionPipeline.reduce((s, p) => s + (p.quantity || 0), 0))} total units):
${JSON.stringify(productionPipeline.map(p => ({ 
  sku: p.sku, 
  product: p.productName, 
  quantity: p.quantity, 
  expectedDate: p.expectedDate, 
  status: p.status,
  daysUntil: p.expectedDate ? Math.ceil((new Date(p.expectedDate) - new Date()) / (1000 * 60 * 60 * 24)) : null
})))}
` : 'No production orders in pipeline'}

=== WHAT YOU CAN HELP WITH ===
- Analyze sales trends and patterns (weekly, monthly, quarterly, yearly)
- Year-over-year comparisons (2024 vs 2025, Q1 vs Q1, etc.)
- Quarterly and monthly trend analysis
- Compare performance across weeks, months, quarters, years, products
- Identify best/worst performing SKUs and their trends over time
- Track progress toward goals
- Explain profit margins and calculations
- Forecast future revenue based on historical trends
- Compare Amazon's projections vs actual performance
- Inventory planning recommendations
- Answer questions about specific products by name or SKU
- Provide insights on advertising effectiveness (TACOS, ROAS) and how it changes over time
- Sales tax obligations by state
- Upcoming bills and cash flow planning
- Production pipeline tracking and timing
- Seasonality analysis (which months/quarters perform best)
- Channel mix analysis (Amazon vs Shopify trends)
- Cost structure analysis (COGS, fees, ads as % of revenue over time)

Format all currency as $X,XXX.XX. Be concise but thorough. Reference specific numbers when discussing trends. When comparing periods, always show the actual numbers and % change. If the user asks about data you don't have, let them know what they need to upload.`;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system: systemPrompt, messages: [...aiMessages.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: userMessage }] }),
      });
      
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json();
      setAiMessages(prev => [...prev, { role: 'assistant', content: data.content?.[0]?.text || 'Sorry, I could not process that.' }]);
    } catch (error) {
      console.error('AI Chat error:', error);
      setAiMessages(prev => [...prev, { role: 'assistant', content: 'Error processing request. Check /api/chat endpoint.' }]);
    } finally {
      setAiLoading(false);
    }
  };
  
  // AI Chat UI - rendered as JSX variable, not a component function
  const aiChatUI = showAIChat && (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)]">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-white font-semibold">AI Assistant</h3>
              <p className="text-white/70 text-xs">Ask about your business data</p>
            </div>
          </div>
          <button onClick={() => setShowAIChat(false)} className="p-2 hover:bg-white/20 rounded-lg text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="h-80 overflow-y-auto p-4 space-y-4">
          {aiMessages.length === 0 && (
            <div className="text-center text-slate-400 py-8">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Ask me anything about your business!</p>
              <div className="mt-4 space-y-2">
                <button onClick={() => setAiInput("What was my total revenue last month?")} className="block w-full text-left px-3 py-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-xs text-slate-300">💡 "What was my total revenue last month?"</button>
                <button onClick={() => setAiInput("Which SKU has the best profit per unit?")} className="block w-full text-left px-3 py-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-xs text-slate-300">💡 "Which SKU has the best profit per unit?"</button>
                <button onClick={() => setAiInput("Which SKUs are declining in profitability?")} className="block w-full text-left px-3 py-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-xs text-slate-300">💡 "Which SKUs are declining in profitability?"</button>
              </div>
            </div>
          )}
          {aiMessages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2 ${msg.role === 'user' ? 'bg-violet-600 text-white' : 'bg-slate-700 text-slate-200'}`}>
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          {aiLoading && (
            <div className="flex justify-start">
              <div className="bg-slate-700 rounded-2xl px-4 py-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-slate-700">
          <div className="flex gap-2">
            <input
              type="text"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendAIMessage(); } }}
              placeholder="Ask about your data..."
              className="flex-1 bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-violet-500"
              autoComplete="off"
            />
            <button onClick={sendAIMessage} disabled={!aiInput.trim() || aiLoading} className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-xl text-white">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
  
  // AI Chat Button - rendered as JSX variable
  const aiChatButton = !showAIChat && (
    <button onClick={() => setShowAIChat(true)} className="fixed bottom-4 right-4 z-50 w-14 h-14 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center group">
      <MessageSquare className="w-6 h-6 text-white" />
      <span className="absolute right-full mr-3 px-3 py-1 bg-slate-800 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Ask AI Assistant</span>
    </button>
  );

  
  // Calculate dashboard metrics based on selected range
  const dashboardMetrics = useMemo(() => {
    const sortedWeeks = Object.keys(allWeeksData).sort();
    const sortedPeriods = Object.keys(allPeriodsData).sort();
    const now = new Date();
    const currentYear = now.getFullYear().toString();
    const lastYear = (now.getFullYear() - 1).toString();
    
    // Helper to filter weeks by time range
    const getWeeksInRange = (range) => {
      if (range === 'week') {
        return sortedWeeks.slice(-1);
      } else if (range === 'month') {
        // Last 30 days worth of weeks (~4-5 weeks)
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return sortedWeeks.filter(w => new Date(w) >= thirtyDaysAgo);
      } else if (range === 'quarter') {
        // Last 90 days
        const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        return sortedWeeks.filter(w => new Date(w) >= ninetyDaysAgo);
      } else if (range === 'year') {
        // Current year
        return sortedWeeks.filter(w => w.startsWith(currentYear));
      }
      return sortedWeeks.slice(-4);
    };
    
    const rangeWeeks = getWeeksInRange(dashboardRange);
    
    // For "year" view, prefer period data if available
    let current = { revenue: 0, profit: 0, units: 0, adSpend: 0, cogs: 0, orders: 0 };
    let previous = { revenue: 0, profit: 0 };
    let usingPeriodData = false;
    
    if (dashboardRange === 'year' && allPeriodsData[currentYear]) {
      // Use period data for current year
      const period = allPeriodsData[currentYear];
      current = {
        revenue: period.total?.revenue || 0,
        profit: period.total?.netProfit || 0,
        units: period.total?.units || 0,
        adSpend: period.total?.adSpend || 0,
        cogs: period.total?.cogs || 0,
        orders: (period.shopify?.threeplMetrics?.orderCount || 0) + (period.amazon?.units || 0),
      };
      usingPeriodData = true;
      
      // Compare to last year's period if available
      if (allPeriodsData[lastYear]) {
        const lastPeriod = allPeriodsData[lastYear];
        previous = {
          revenue: lastPeriod.total?.revenue || 0,
          profit: lastPeriod.total?.netProfit || 0,
        };
      }
    } else {
      // Use weekly data
      current = rangeWeeks.reduce((acc, w) => {
        const week = allWeeksData[w];
        return {
          revenue: acc.revenue + (week.total?.revenue || 0),
          profit: acc.profit + (week.total?.netProfit || 0),
          units: acc.units + (week.total?.units || 0),
          adSpend: acc.adSpend + (week.total?.adSpend || 0),
          cogs: acc.cogs + (week.total?.cogs || 0),
          orders: acc.orders + (week.shopify?.threeplMetrics?.orderCount || 0) + (week.amazon?.units || 0),
        };
      }, { revenue: 0, profit: 0, units: 0, adSpend: 0, cogs: 0, orders: 0 });
      
      // Previous range for comparison
      const previousRangeWeeks = dashboardRange === 'week' 
        ? sortedWeeks.slice(-2, -1)
        : dashboardRange === 'month'
        ? sortedWeeks.slice(-8, -4)
        : dashboardRange === 'quarter'
        ? sortedWeeks.slice(-26, -13)
        : sortedWeeks.filter(w => w.startsWith(lastYear));
        
      previous = previousRangeWeeks.reduce((acc, w) => {
        const week = allWeeksData[w];
        return {
          revenue: acc.revenue + (week.total?.revenue || 0),
          profit: acc.profit + (week.total?.netProfit || 0),
        };
      }, { revenue: 0, profit: 0 });
    }
    
    // Changes
    const revenueChange = previous.revenue > 0 ? ((current.revenue - previous.revenue) / previous.revenue) * 100 : 0;
    const profitChange = previous.profit !== 0 ? ((current.profit - previous.profit) / Math.abs(previous.profit)) * 100 : 0;
    
    // Range label
    const rangeLabels = {
      'week': 'This Week',
      'month': 'Last 30 Days',
      'quarter': 'Last 90 Days',
      'year': currentYear,
    };
    
    return { 
      current, 
      previous, 
      revenueChange, 
      profitChange, 
      rangeWeeks, 
      sortedWeeks,
      sortedPeriods,
      usingPeriodData,
      rangeLabel: rangeLabels[dashboardRange] || 'Last 30 Days',
      comparisonLabel: dashboardRange === 'year' ? `vs ${lastYear}` : 'vs Prior Period'
    };
  }, [allWeeksData, allPeriodsData, dashboardRange]);

  // ==================== AUTH SCREENS (must come after all hooks) ====================
  
  // Show loading spinner while auth is initializing
  if (supabase && !isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-6 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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

  // VIEWS
  
  // ==================== DASHBOARD VIEW ====================
  if (view === 'dashboard') {
    const hasData = Object.keys(allWeeksData).length > 0 || Object.keys(allPeriodsData).length > 0;
    const { current, revenueChange, profitChange, rangeWeeks, sortedWeeks, sortedPeriods, usingPeriodData, rangeLabel, comparisonLabel } = dashboardMetrics;
    
    // Get alerts
    const alerts = [];
    if (!hasCogs) alerts.push({ type: 'warning', text: 'Set up COGS to track profitability accurately' });
    if (appSettings.alertGoalsEnabled && goals.weeklyRevenue > 0 && sortedWeeks.length > 0) {
      const lastWeekRevenue = allWeeksData[sortedWeeks[sortedWeeks.length - 1]]?.total?.revenue || 0;
      if (lastWeekRevenue < goals.weeklyRevenue) {
        alerts.push({ type: 'warning', text: `Below weekly revenue target of ${formatCurrency(goals.weeklyRevenue)}` });
      }
    }
    
    // Check inventory alerts
    const latestInv = Object.keys(invHistory).sort().reverse()[0];
    const invAlerts = latestInv ? (invHistory[latestInv]?.items || []).filter(i => i.health === 'critical' || i.health === 'low') : [];
    if (invAlerts.length > 0 && appSettings.alertInventoryEnabled) {
      alerts.push({ type: 'critical', text: `${invAlerts.length} products need reorder attention` });
    }
    
    // Check upcoming invoices/bills
    const upcomingBills = invoices.filter(i => !i.paid);
    const overdueBills = upcomingBills.filter(i => new Date(i.dueDate) < new Date());
    const dueSoonBills = upcomingBills.filter(i => {
      const daysUntil = Math.ceil((new Date(i.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
      return daysUntil >= 0 && daysUntil <= 7;
    });
    if (overdueBills.length > 0) {
      const total = overdueBills.reduce((s, i) => s + i.amount, 0);
      alerts.push({ type: 'critical', text: `${overdueBills.length} overdue bills totaling ${formatCurrency(total)}`, link: 'invoices' });
    } else if (dueSoonBills.length > 0) {
      const total = dueSoonBills.reduce((s, i) => s + i.amount, 0);
      alerts.push({ type: 'warning', text: `${dueSoonBills.length} bills due within 7 days (${formatCurrency(total)})`, link: 'invoices' });
    }
    
    // Check sales tax deadlines
    if (appSettings.alertSalesTaxEnabled) {
      const now = new Date();
      const alertDays = appSettings.alertSalesTaxDays || 7;
      const alertThreshold = new Date(now.getTime() + alertDays * 24 * 60 * 60 * 1000);
      
      Object.entries(salesTaxConfig.nexusStates || {}).forEach(([stateCode, config]) => {
        if (!config.hasNexus) return;
        const nextDue = getNextDueDate(config.frequency || 'monthly', stateCode);
        const stateName = US_STATES_TAX_INFO[stateCode]?.name || stateCode;
        
        if (nextDue < now) {
          alerts.push({ type: 'critical', text: `${stateName} sales tax filing is OVERDUE!`, link: 'sales-tax' });
        } else if (nextDue <= alertThreshold) {
          const daysUntil = Math.ceil((nextDue - now) / (1000 * 60 * 60 * 24));
          alerts.push({ type: 'warning', text: `${stateName} sales tax due in ${daysUntil} days`, link: 'sales-tax' });
        }
        
        // Check custom filings too
        (config.customFilings || []).forEach(filing => {
          const filingDue = new Date(now.getFullYear(), filing.dueMonth - 1, filing.dueDay);
          if (filingDue < now) filingDue.setFullYear(filingDue.getFullYear() + 1);
          if (filingDue <= alertThreshold) {
            const daysUntil = Math.ceil((filingDue - now) / (1000 * 60 * 60 * 24));
            if (daysUntil <= 0) {
              alerts.push({ type: 'critical', text: `${stateName} ${filing.name} is OVERDUE!`, link: 'sales-tax' });
            } else {
              alerts.push({ type: 'warning', text: `${stateName} ${filing.name} due in ${daysUntil} days`, link: 'sales-tax' });
            }
          }
        });
      });
    }
    
    // Calculate total upcoming bills for display
    const totalUpcomingBills = upcomingBills.reduce((s, i) => s + i.amount, 0);
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 lg:p-6">
        <div className="max-w-7xl mx-auto"><Toast /><ValidationModal />{aiChatUI}{aiChatButton}<CogsManager /><ProductCatalogModal /><UploadHelpModal /><ForecastModal /><BreakEvenModal /><ExportModal /><ComparisonView /><InvoiceModal /><GoalsModal />
          
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              {storeLogo && (
                <img src={storeLogo} alt="Store logo" className="w-12 h-12 object-contain rounded-xl bg-white p-1.5" />
              )}
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold text-white">{storeName ? storeName + ' Dashboard' : 'E-Commerce Dashboard'}</h1>
                <p className="text-slate-400">Business performance overview</p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Store name"
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white w-40" />
              <button onClick={() => setShowGoalsModal(true)} className="px-3 py-2 bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/50 rounded-lg text-sm text-amber-300 flex items-center gap-1"><Target className="w-4 h-4" />Goals</button>
              <button onClick={() => setShowCogsManager(true)} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white flex items-center gap-1"><Settings className="w-4 h-4" />COGS</button>
              <button onClick={() => setShowProductCatalog(true)} className="px-3 py-2 bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/50 rounded-lg text-sm text-violet-300 flex items-center gap-1"><Package className="w-4 h-4" />Catalog{Object.keys(savedProductNames).length > 0 && <span className="ml-1">✓</span>}</button>
              <button onClick={() => setShowInvoiceModal(true)} className={`px-3 py-2 rounded-lg text-sm flex items-center gap-1 ${upcomingBills.length > 0 ? 'bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/50 text-amber-300' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}>
                <FileText className="w-4 h-4" />Bills{upcomingBills.length > 0 && <span className="ml-1 px-1.5 py-0.5 bg-amber-500/30 rounded text-xs">{upcomingBills.length}</span>}
              </button>
              {generateForecast ? (
                <button onClick={() => setShowForecast(true)} className="px-3 py-2 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/50 rounded-lg text-sm text-emerald-300 flex items-center gap-1"><TrendingUp className="w-4 h-4" />Forecast</button>
              ) : (
                <button onClick={() => setView('analytics')} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-400 flex items-center gap-1" title="Need 4+ weeks for forecast"><TrendingUp className="w-4 h-4" />Forecast</button>
              )}
              <button onClick={() => setShowBreakEven(true)} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white flex items-center gap-1"><Calculator className="w-4 h-4" /></button>
              <button onClick={() => setShowExportModal(true)} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white flex items-center gap-1"><FileDown className="w-4 h-4" /></button>
              <button onClick={() => setShowUploadHelp(true)} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white flex items-center gap-1"><FileText className="w-4 h-4" /></button>
              <button onClick={() => setView('settings')} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white flex items-center gap-1"><Settings className="w-4 h-4" /></button>
            </div>
          </div>
          
          <NavTabs />
          
          {/* No Data State */}
          {!hasData ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 mb-6">
                <BarChart3 className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Welcome to Your Dashboard</h2>
              <p className="text-slate-400 mb-8 max-w-md mx-auto">Get started by uploading your sales data. We support Amazon and Shopify exports.</p>
              
              {/* Getting Started Checklist */}
              <div className="max-w-xl mx-auto mb-8 bg-slate-800/50 rounded-2xl border border-slate-700 p-6 text-left">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                  Getting Started Checklist
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    {session ? <Check className="w-5 h-5 text-emerald-400" /> : <div className="w-5 h-5 rounded-full border-2 border-slate-600" />}
                    <span className={session ? 'text-emerald-400' : 'text-slate-300'}>Sign up for cloud sync</span>
                    {!session && <button onClick={() => setView('settings')} className="text-xs text-violet-400 hover:text-violet-300 ml-auto">Setup →</button>}
                  </div>
                  <div className="flex items-center gap-3">
                    {Object.keys(savedCogs).length > 0 ? <Check className="w-5 h-5 text-emerald-400" /> : <div className="w-5 h-5 rounded-full border-2 border-slate-600" />}
                    <span className={Object.keys(savedCogs).length > 0 ? 'text-emerald-400' : 'text-slate-300'}>Set up COGS for profit tracking</span>
                    {Object.keys(savedCogs).length === 0 && <button onClick={() => setShowCogsManager(true)} className="text-xs text-violet-400 hover:text-violet-300 ml-auto">Setup →</button>}
                  </div>
                  <div className="flex items-center gap-3">
                    {Object.keys(allPeriodsData).length > 0 ? <Check className="w-5 h-5 text-emerald-400" /> : <div className="w-5 h-5 rounded-full border-2 border-slate-600" />}
                    <span className={Object.keys(allPeriodsData).length > 0 ? 'text-emerald-400' : 'text-slate-300'}>Upload historical data (2024-2025)</span>
                    {Object.keys(allPeriodsData).length === 0 && <button onClick={() => { setUploadTab('period'); setView('upload'); }} className="text-xs text-violet-400 hover:text-violet-300 ml-auto">Upload →</button>}
                  </div>
                  <div className="flex items-center gap-3">
                    {Object.keys(allWeeksData).length > 0 ? <Check className="w-5 h-5 text-emerald-400" /> : <div className="w-5 h-5 rounded-full border-2 border-slate-600" />}
                    <span className={Object.keys(allWeeksData).length > 0 ? 'text-emerald-400' : 'text-slate-300'}>Upload your first weekly report</span>
                    {Object.keys(allWeeksData).length === 0 && <button onClick={() => { setUploadTab('weekly'); setView('upload'); }} className="text-xs text-violet-400 hover:text-violet-300 ml-auto">Upload →</button>}
                  </div>
                  <div className="flex items-center gap-3">
                    {goals.weeklyRevenue > 0 || goals.monthlyRevenue > 0 ? <Check className="w-5 h-5 text-emerald-400" /> : <div className="w-5 h-5 rounded-full border-2 border-slate-600" />}
                    <span className={goals.weeklyRevenue > 0 || goals.monthlyRevenue > 0 ? 'text-emerald-400' : 'text-slate-300'}>Set revenue goals</span>
                    {!(goals.weeklyRevenue > 0 || goals.monthlyRevenue > 0) && <button onClick={() => setShowGoalsModal(true)} className="text-xs text-violet-400 hover:text-violet-300 ml-auto">Setup →</button>}
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button onClick={() => { setUploadTab('weekly'); setView('upload'); }} className="px-6 py-3 bg-violet-600 hover:bg-violet-500 rounded-xl font-semibold flex items-center justify-center gap-2">
                  <Upload className="w-5 h-5" />Upload Weekly Data
                </button>
                <button onClick={() => { setUploadTab('period'); setView('upload'); }} className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-semibold flex items-center justify-center gap-2">
                  <CalendarRange className="w-5 h-5" />Upload Period Data
                </button>
                <button onClick={() => setShowUploadHelp(true)} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl font-semibold flex items-center justify-center gap-2 text-slate-300">
                  <FileText className="w-5 h-5" />How to Upload
                </button>
              </div>
              <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto text-left">
                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                  <Calendar className="w-6 h-6 text-violet-400 mb-2" />
                  <h3 className="font-semibold text-white mb-1">Weekly Tracking</h3>
                  <p className="text-slate-400 text-sm">Upload weekly reports for detailed trends and analysis</p>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                  <CalendarRange className="w-6 h-6 text-teal-400 mb-2" />
                  <h3 className="font-semibold text-white mb-1">Period Reports</h3>
                  <p className="text-slate-400 text-sm">Upload monthly or yearly totals for YoY comparisons</p>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                  <Boxes className="w-6 h-6 text-emerald-400 mb-2" />
                  <h3 className="font-semibold text-white mb-1">Inventory Alerts</h3>
                  <p className="text-slate-400 text-sm">Track stock levels and get reorder notifications</p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Alerts */}
              {alerts.length > 0 && (
                <div className="mb-6 space-y-2">
                  {alerts.map((alert, i) => (
                    <div 
                      key={i} 
                      onClick={() => {
                        if (alert.link === 'invoices') setShowInvoiceModal(true);
                        else if (alert.link) setView(alert.link);
                      }}
                      className={`flex items-center justify-between p-3 rounded-xl ${alert.type === 'critical' ? 'bg-rose-900/30 border border-rose-500/50' : 'bg-amber-900/30 border border-amber-500/50'} ${alert.link ? 'cursor-pointer hover:opacity-80' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <AlertTriangle className={`w-5 h-5 ${alert.type === 'critical' ? 'text-rose-400' : 'text-amber-400'}`} />
                        <span className={alert.type === 'critical' ? 'text-rose-300' : 'text-amber-300'}>{alert.text}</span>
                      </div>
                      {alert.link && <ChevronRight className="w-5 h-5 text-slate-400" />}
                    </div>
                  ))}
                </div>
              )}
              
              {/* Quick Action Widgets */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* Amazon Forecast Widget */}
                {upcomingAmazonForecasts.length > 0 ? (
                  <div className="bg-gradient-to-br from-orange-900/30 to-amber-900/20 rounded-2xl border border-orange-500/30 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-orange-400 text-sm font-semibold flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />Amazon Forecast
                      </h3>
                      <button onClick={() => { setUploadTab('forecast'); setView('upload'); }} className="text-xs text-slate-400 hover:text-white">View all</button>
                    </div>
                    <p className="text-2xl font-bold text-white">{formatCurrency(upcomingAmazonForecasts[0].totals.sales)}</p>
                    <p className="text-slate-400 text-sm">Projected for week ending {new Date(upcomingAmazonForecasts[0].weekEnding + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                    <p className="text-slate-500 text-xs mt-1">{upcomingAmazonForecasts[0].skuCount} SKUs • {formatNumber(upcomingAmazonForecasts[0].totals.units)} units</p>
                  </div>
                ) : (
                  <div className="bg-slate-800/30 rounded-2xl border border-dashed border-slate-600 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-slate-400 text-sm font-semibold flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />Amazon Forecast
                      </h3>
                    </div>
                    <p className="text-slate-500 text-sm mb-2">No forecast uploaded</p>
                    <button onClick={() => { setUploadTab('forecast'); setView('upload'); }} className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1">
                      <Upload className="w-3 h-3" />Upload Amazon forecast
                    </button>
                  </div>
                )}
                
                {/* Upcoming Bills Widget */}
                {upcomingBills.length > 0 ? (
                  <div className="bg-gradient-to-br from-rose-900/30 to-pink-900/20 rounded-2xl border border-rose-500/30 p-4 cursor-pointer hover:border-rose-400/50" onClick={() => setShowInvoiceModal(true)}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-rose-400 text-sm font-semibold flex items-center gap-2">
                        <FileText className="w-4 h-4" />Upcoming Bills
                      </h3>
                      <span className="text-xs text-slate-400">{upcomingBills.length} due</span>
                    </div>
                    <p className="text-2xl font-bold text-white">{formatCurrency(totalUpcomingBills)}</p>
                    {(() => {
                      const nextBill = upcomingBills.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
                      const daysUntil = Math.ceil((new Date(nextBill.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
                      return (
                        <>
                          <p className="text-slate-400 text-sm">Next: {nextBill.vendor}</p>
                          <p className={`text-xs mt-1 ${daysUntil <= 3 ? 'text-rose-400' : daysUntil <= 7 ? 'text-amber-400' : 'text-slate-500'}`}>
                            {daysUntil <= 0 ? 'Due today!' : `Due in ${daysUntil} days`}
                          </p>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="bg-slate-800/30 rounded-2xl border border-dashed border-slate-600 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-slate-400 text-sm font-semibold flex items-center gap-2">
                        <FileText className="w-4 h-4" />Upcoming Bills
                      </h3>
                    </div>
                    <p className="text-slate-500 text-sm mb-2">No bills tracked</p>
                    <button onClick={() => setShowInvoiceModal(true)} className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1">
                      <Plus className="w-3 h-3" />Add a bill
                    </button>
                  </div>
                )}
                
                {/* Sync & Backup Status Widget */}
                <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-slate-300 text-sm font-semibold flex items-center gap-2">
                      <Database className="w-4 h-4" />Data Status
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {/* Cloud Sync Status */}
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-sm">Cloud Sync</span>
                      {session ? (
                        <div className="flex items-center gap-2">
                          {cloudStatus && <span className="text-blue-400 text-xs">{cloudStatus}</span>}
                          {!cloudStatus && <span className="text-emerald-400 text-xs flex items-center gap-1"><Check className="w-3 h-3" />Connected</span>}
                        </div>
                      ) : (
                        <span className="text-amber-400 text-xs flex items-center gap-1"><AlertCircle className="w-3 h-3" />Local only</span>
                      )}
                    </div>
                    {/* Last Sync (for cloud users) */}
                    {session && lastSyncDate && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-sm">Last Sync</span>
                        <span className="text-slate-400 text-xs">{new Date(lastSyncDate).toLocaleString()}</span>
                      </div>
                    )}
                    {/* Last Backup */}
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-sm">Last Backup</span>
                      {lastBackupDate ? (
                        <span className={`text-xs ${(new Date() - new Date(lastBackupDate)) / (1000 * 60 * 60 * 24) > 7 ? 'text-amber-400' : 'text-slate-400'}`}>
                          {new Date(lastBackupDate).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-rose-400 text-xs">Never</span>
                      )}
                    </div>
                    {/* Quick Actions */}
                    <div className="flex gap-2 mt-2">
                      <button onClick={exportAll} className="flex-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs text-white flex items-center justify-center gap-1">
                        <Download className="w-3 h-3" />Backup
                      </button>
                      {!session && (
                        <button onClick={() => setView('settings')} className="flex-1 px-2 py-1.5 bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/50 rounded-lg text-xs text-violet-300 flex items-center justify-center gap-1">
                          <Cloud className="w-3 h-3" />Enable Sync
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Quick Upload - Show if most recent week is missing */}
              {(() => {
                const today = new Date();
                // Get the most recent Sunday (last completed week)
                const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
                const lastSunday = new Date(today);
                // If today is Sunday, use today; otherwise go back to last Sunday
                lastSunday.setDate(today.getDate() - (dayOfWeek === 0 ? 0 : dayOfWeek));
                const lastWeekEnd = lastSunday.toISOString().split('T')[0];
                const hasLastWeek = allWeeksData[lastWeekEnd];
                if (!hasLastWeek && Object.keys(allWeeksData).length > 0) {
                  return (
                    <div className="bg-violet-900/20 border border-violet-500/30 rounded-xl p-4 mb-6 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Calendar className="w-5 h-5 text-violet-400" />
                        <div>
                          <p className="text-violet-300 font-medium">Most recent week data missing</p>
                          <p className="text-slate-400 text-sm">Week ending {new Date(lastWeekEnd + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                        </div>
                      </div>
                      <button onClick={() => { setWeekEnding(lastWeekEnd); setUploadTab('weekly'); setView('upload'); }} className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm text-white flex items-center gap-2">
                        <Upload className="w-4 h-4" />Upload This Week
                      </button>
                    </div>
                  );
                }
                return null;
              })()}
              
              {/* Check for weeks with missing 3PL or Ad data */}
              {(() => {
                const recentWeeks = Object.entries(allWeeksData)
                  .sort((a, b) => b[0].localeCompare(a[0]))
                  .slice(0, 4); // Check last 4 weeks
                
                const incompleteWeeks = recentWeeks.filter(([key, data]) => {
                  const has3PL = data.shopify?.threeplCosts > 0;
                  const hasAds = (data.shopify?.metaSpend > 0) || (data.shopify?.googleSpend > 0);
                  return !has3PL || !hasAds;
                });
                
                if (incompleteWeeks.length > 0) {
                  return (
                    <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4 mb-6">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-amber-300 font-medium mb-2">Some weeks have incomplete cost data</p>
                          <div className="space-y-2">
                            {incompleteWeeks.slice(0, 3).map(([key, data]) => {
                              const missing = [];
                              if (!data.shopify?.threeplCosts) missing.push('3PL');
                              if (!data.shopify?.metaSpend && !data.shopify?.googleSpend) missing.push('Ads');
                              return (
                                <div key={key} className="flex items-center justify-between text-sm">
                                  <span className="text-slate-400">
                                    Week of {new Date(key + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    <span className="text-amber-400/70 ml-2">— missing {missing.join(' & ')}</span>
                                  </span>
                                  <button 
                                    onClick={() => { setSelectedWeek(key); setView('weekly'); }}
                                    className="text-amber-400 hover:text-amber-300 text-xs underline"
                                  >
                                    Update
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          {incompleteWeeks.length > 3 && (
                            <p className="text-slate-500 text-xs mt-2">+ {incompleteWeeks.length - 3} more weeks</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
              
              {/* Time Range Toggle & Key Metrics */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="text-slate-400 text-sm mr-2">View:</span>
                {[
                  { key: 'week', label: 'Week' },
                  { key: 'month', label: 'Month' },
                  { key: 'quarter', label: 'Quarter' },
                  { key: 'year', label: 'Year' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setDashboardRange(key)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      dashboardRange === key
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                {usingPeriodData && (
                  <span className="text-xs text-teal-400 ml-2">(from period data)</span>
                )}
              </div>
              
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                <div className="bg-gradient-to-br from-emerald-900/40 to-emerald-800/20 rounded-2xl border border-emerald-500/30 p-5">
                  <p className="text-emerald-400 text-sm font-medium mb-1">Revenue</p>
                  <p className="text-2xl lg:text-3xl font-bold text-white">{formatCurrency(current.revenue)}</p>
                  {revenueChange !== 0 && (
                    <p className={`text-sm flex items-center gap-1 mt-1 ${revenueChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {revenueChange >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      {Math.abs(revenueChange).toFixed(1)}% {comparisonLabel}
                    </p>
                  )}
                </div>
                <div className={`rounded-2xl border p-5 ${current.profit >= 0 ? 'bg-gradient-to-br from-blue-900/40 to-blue-800/20 border-blue-500/30' : 'bg-gradient-to-br from-rose-900/40 to-rose-800/20 border-rose-500/30'}`}>
                  <p className={`text-sm font-medium mb-1 ${current.profit >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>Net Profit</p>
                  <p className="text-2xl lg:text-3xl font-bold text-white">{formatCurrency(current.profit)}</p>
                  {profitChange !== 0 && (
                    <p className={`text-sm flex items-center gap-1 mt-1 ${profitChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {profitChange >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      {Math.abs(profitChange).toFixed(1)}% {comparisonLabel}
                    </p>
                  )}
                </div>
                <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5">
                  <p className="text-slate-400 text-sm font-medium mb-1">Units Sold</p>
                  <p className="text-2xl lg:text-3xl font-bold text-white">{formatNumber(current.units)}</p>
                </div>
                <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5">
                  <p className="text-slate-400 text-sm font-medium mb-1">Ad Spend</p>
                  <p className="text-2xl lg:text-3xl font-bold text-white">{formatCurrency(current.adSpend)}</p>
                  <p className="text-slate-500 text-sm mt-1">{current.revenue > 0 ? ((current.adSpend / current.revenue) * 100).toFixed(1) : 0}% TACOS</p>
                </div>
                <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5">
                  <p className="text-slate-400 text-sm font-medium mb-1">Net Margin</p>
                  <p className={`text-2xl lg:text-3xl font-bold ${current.revenue > 0 && (current.profit / current.revenue) * 100 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {current.revenue > 0 ? ((current.profit / current.revenue) * 100).toFixed(1) : 0}%
                  </p>
                </div>
              </div>
              
              {/* Goals Progress */}
              {(goals.weeklyRevenue > 0 || goals.weeklyProfit > 0 || goals.monthlyRevenue > 0 || goals.monthlyProfit > 0) && sortedWeeks.length > 0 ? (
                <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5 mb-6">
                  <h3 className="text-sm font-semibold text-amber-400 uppercase mb-4 flex items-center gap-2"><Target className="w-4 h-4" />Goals Progress</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {goals.weeklyRevenue > 0 && sortedWeeks.length > 0 && (
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-400">Weekly Revenue</span>
                          <span className="text-white">{formatCurrency(allWeeksData[sortedWeeks[sortedWeeks.length - 1]]?.total?.revenue || 0)} / {formatCurrency(goals.weeklyRevenue)}</span>
                        </div>
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div className={`h-full ${(allWeeksData[sortedWeeks[sortedWeeks.length - 1]]?.total?.revenue || 0) >= goals.weeklyRevenue ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                            style={{ width: `${Math.min(100, ((allWeeksData[sortedWeeks[sortedWeeks.length - 1]]?.total?.revenue || 0) / goals.weeklyRevenue) * 100)}%` }} />
                        </div>
                      </div>
                    )}
                    {goals.weeklyProfit > 0 && sortedWeeks.length > 0 && (
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-400">Weekly Profit</span>
                          <span className="text-white">{formatCurrency(allWeeksData[sortedWeeks[sortedWeeks.length - 1]]?.total?.netProfit || 0)} / {formatCurrency(goals.weeklyProfit)}</span>
                        </div>
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div className={`h-full ${(allWeeksData[sortedWeeks[sortedWeeks.length - 1]]?.total?.netProfit || 0) >= goals.weeklyProfit ? 'bg-emerald-500' : 'bg-amber-500'}`}
                            style={{ width: `${Math.min(100, Math.max(0, ((allWeeksData[sortedWeeks[sortedWeeks.length - 1]]?.total?.netProfit || 0) / goals.weeklyProfit) * 100))}%` }} />
                        </div>
                      </div>
                    )}
                    {goals.monthlyRevenue > 0 && (
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-400">Monthly Revenue</span>
                          <span className="text-white">{formatCurrency(current.revenue)} / {formatCurrency(goals.monthlyRevenue)}</span>
                        </div>
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div className={`h-full ${current.revenue >= goals.monthlyRevenue ? 'bg-emerald-500' : 'bg-amber-500'}`}
                            style={{ width: `${Math.min(100, (current.revenue / goals.monthlyRevenue) * 100)}%` }} />
                        </div>
                      </div>
                    )}
                    {goals.monthlyProfit > 0 && (
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-400">Monthly Profit</span>
                          <span className="text-white">{formatCurrency(current.profit)} / {formatCurrency(goals.monthlyProfit)}</span>
                        </div>
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div className={`h-full ${current.profit >= goals.monthlyProfit ? 'bg-emerald-500' : 'bg-amber-500'}`}
                            style={{ width: `${Math.min(100, Math.max(0, (current.profit / goals.monthlyProfit) * 100))}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-slate-800/30 rounded-2xl border border-dashed border-slate-600 p-5 mb-6 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Target className="w-6 h-6 text-slate-500" />
                    <div>
                      <p className="text-slate-400 font-medium">No goals set</p>
                      <p className="text-slate-500 text-sm">Set revenue and profit targets to track your progress</p>
                    </div>
                  </div>
                  <button onClick={() => setShowGoalsModal(true)} className="px-4 py-2 bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/50 rounded-lg text-amber-300 text-sm font-medium">
                    Set Goals
                  </button>
                </div>
              )}
              
              {/* Quick Actions & Recent Data */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {/* Recent Weeks */}
                <div className="lg:col-span-2 bg-slate-800/50 rounded-2xl border border-slate-700 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-slate-300 uppercase">Recent Weeks</h3>
                    <div className="flex items-center gap-2">
                      {compareMode ? (
                        <span className="text-xs text-violet-400">Select weeks to compare ({compareItems.length}/2)</span>
                      ) : (
                        <button onClick={() => setCompareMode(true)} className="text-xs text-slate-400 hover:text-violet-300 flex items-center gap-1"><GitCompareArrows className="w-3 h-3" />Compare</button>
                      )}
                      <button onClick={() => { setUploadTab('weekly'); setView('upload'); }} className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1"><Upload className="w-3 h-3" />Add Week</button>
                    </div>
                  </div>
                  {sortedWeeks.length > 0 ? (
                    <div className="space-y-2">
                      {sortedWeeks.slice(-5).reverse().map(w => {
                        const week = allWeeksData[w];
                        const isSelected = compareItems.includes(w);
                        const note = weekNotes[w];
                        return (
                          <div key={w} className={`flex items-center gap-2 ${compareMode ? '' : ''}`}>
                            {compareMode && (
                              <button onClick={() => {
                                if (isSelected) setCompareItems(p => p.filter(x => x !== w));
                                else if (compareItems.length < 2) setCompareItems(p => [...p, w]);
                              }} className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-violet-600 border-violet-500' : 'border-slate-600 hover:border-violet-500'}`}>
                                {isSelected && <Check className="w-4 h-4 text-white" />}
                              </button>
                            )}
                            <button onClick={() => { if (!compareMode) { setSelectedWeek(w); setView('weekly'); }}} className={`flex-1 flex items-center justify-between p-3 bg-slate-900/50 hover:bg-slate-700/50 rounded-xl transition-colors ${isSelected ? 'ring-2 ring-violet-500' : ''}`}>
                              <div className="flex items-center gap-3">
                                <Calendar className="w-5 h-5 text-violet-400" />
                                <div className="text-left">
                                  <p className="text-white font-medium">{new Date(w + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                                  <div className="flex items-center gap-2">
                                    <p className="text-slate-500 text-xs">{formatNumber(week.total?.units || 0)} units</p>
                                    {note && <span className="text-amber-400 text-xs flex items-center gap-0.5"><StickyNote className="w-3 h-3" /></span>}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-emerald-400 font-semibold">{formatCurrency(week.total?.revenue || 0)}</p>
                                <p className={`text-xs ${(week.total?.netProfit || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(week.total?.netProfit || 0)} profit</p>
                              </div>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-center py-4">No weekly data yet</p>
                  )}
                  {compareMode && compareItems.length === 2 && (
                    <button onClick={() => {}} className="w-full mt-3 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-white font-medium text-sm">
                      Compare Selected Weeks
                    </button>
                  )}
                </div>
                
                {/* Quick Stats & Actions */}
                <div className="space-y-4">
                  {/* Data Summary */}
                  <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5">
                    <h3 className="text-sm font-semibold text-slate-300 uppercase mb-3">Data Summary</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between"><span className="text-slate-400">Weeks tracked</span><span className="text-white font-medium">{Object.keys(allWeeksData).length}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Periods saved</span><span className="text-white font-medium">{Object.keys(allPeriodsData).length}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">COGS entries</span><span className="text-white font-medium">{Object.keys(savedCogs).length}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Inventory snapshots</span><span className="text-white font-medium">{Object.keys(invHistory).length}</span></div>
                    </div>
                  </div>
                  
                  {/* Quick Actions */}
                  <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5">
                    <h3 className="text-sm font-semibold text-slate-300 uppercase mb-3">Quick Actions</h3>
                    <div className="space-y-2">
                      <button onClick={() => { setUploadTab('weekly'); setView('upload'); }} className="w-full p-2 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 rounded-lg text-violet-300 text-sm text-left flex items-center gap-2"><Upload className="w-4 h-4" />Upload Weekly Data</button>
                      <button onClick={() => { setUploadTab('period'); setView('upload'); }} className="w-full p-2 bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/30 rounded-lg text-teal-300 text-sm text-left flex items-center gap-2"><CalendarRange className="w-4 h-4" />Upload Period Data</button>
                      <button onClick={() => { setUploadTab('inventory'); setView('upload'); }} className="w-full p-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 rounded-lg text-emerald-300 text-sm text-left flex items-center gap-2"><Boxes className="w-4 h-4" />Upload Inventory</button>
                      <button onClick={exportAll} className="w-full p-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 text-sm text-left flex items-center gap-2"><Download className="w-4 h-4" />Export All Data</button>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Periods */}
              {Object.keys(allPeriodsData).length > 0 && (
                <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-slate-300 uppercase">Saved Periods</h3>
                    <button onClick={() => { setUploadTab('period'); setView('upload'); }} className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1"><Upload className="w-3 h-3" />Add Period</button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {Object.keys(allPeriodsData).sort().reverse().map(p => {
                      const period = allPeriodsData[p];
                      return (
                        <button key={p} onClick={() => { setSelectedPeriod(p); setView('period-view'); }} className="p-3 bg-slate-900/50 hover:bg-slate-700/50 rounded-xl text-left transition-colors">
                          <p className="text-white font-medium text-sm">{period.label}</p>
                          <p className="text-emerald-400 font-semibold">{formatCurrency(period.total?.revenue || 0)}</p>
                          <p className={`text-xs ${(period.total?.netProfit || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(period.total?.netProfit || 0)}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ==================== UPLOAD VIEW (Combined) ====================
  if (view === 'upload' || view === 'period-upload' || view === 'inv-upload') {
    
    // Local FileBox for period uploads
    const PeriodFileBox = ({ type, label, desc, req, multi }) => {
      const hasFile = multi ? (periodFiles[type]?.length > 0) : periodFiles[type];
      const fileName = multi ? (periodFileNames[type]?.join(', ') || '') : periodFileNames[type];
      return (
        <div className={`relative border-2 border-dashed rounded-xl p-4 transition-all ${hasFile ? 'border-emerald-500/50 bg-emerald-950/20' : 'border-slate-600 hover:border-slate-500 bg-slate-800/30'}`}>
          <input type="file" accept=".csv" onChange={(e) => handlePeriodFile(type, e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
          <div className="flex items-start gap-3">
            {hasFile ? <Check className="w-5 h-5 text-emerald-400 mt-0.5" /> : <FileSpreadsheet className="w-5 h-5 text-slate-400 mt-0.5" />}
            <div className="flex-1 min-w-0">
              <p className={`font-medium ${hasFile ? 'text-emerald-400' : 'text-white'}`}>{label}{req && <span className="text-rose-400 ml-1">*</span>}</p>
              <p className="text-slate-500 text-sm truncate">{hasFile ? fileName : desc}</p>
            </div>
          </div>
        </div>
      );
    };
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 lg:p-6">
        <div className="max-w-4xl mx-auto"><Toast /><ValidationModal />{aiChatUI}{aiChatButton}<CogsManager /><ProductCatalogModal /><UploadHelpModal /><ForecastModal /><BreakEvenModal /><ExportModal /><ComparisonView /><InvoiceModal /><GoalsModal />
          
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 mb-4">
              <Upload className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">Upload Data</h1>
            <p className="text-slate-400 mb-3">Import your sales reports and track performance</p>
            <button onClick={() => setShowUploadHelp(true)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-300 flex items-center gap-2 mx-auto">
              <FileText className="w-4 h-4" />How to Get These Files
            </button>
          </div>
          
          <NavTabs />
          
          {/* Upload Type Tabs */}
          <div className="flex gap-2 mb-6 p-1 bg-slate-800/50 rounded-xl">
            <button onClick={() => setUploadTab('weekly')} className={`flex-1 px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 ${uploadTab === 'weekly' ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
              <Calendar className="w-5 h-5" />Weekly
            </button>
            <button onClick={() => setUploadTab('period')} className={`flex-1 px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 ${uploadTab === 'period' ? 'bg-teal-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
              <CalendarRange className="w-5 h-5" />Period
            </button>
            <button onClick={() => setUploadTab('inventory')} className={`flex-1 px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 ${uploadTab === 'inventory' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
              <Boxes className="w-5 h-5" />Inventory
            </button>
            <button onClick={() => setUploadTab('forecast')} className={`flex-1 px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 ${uploadTab === 'forecast' ? 'bg-amber-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
              <TrendingUp className="w-5 h-5" />Forecast
            </button>
          </div>
          
          {/* Weekly Upload */}
          {uploadTab === 'weekly' && (
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-white mb-1">Weekly Sales Upload</h2>
              <p className="text-slate-400 text-sm mb-6">Upload your Amazon and Shopify weekly reports</p>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-2">Week Ending Date <span className="text-rose-400">*</span></label>
                <input type="date" value={weekEnding} onChange={(e) => setWeekEnding(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white" />
              </div>
              
              {/* Date Range Guide */}
              {weekEnding && (() => {
                const endDate = new Date(weekEnding + 'T00:00:00');
                const startDate = new Date(endDate);
                startDate.setDate(startDate.getDate() - 6);
                const formatDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                const formatShort = (d) => d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
                return (
                  <div className="bg-indigo-900/30 border border-indigo-500/30 rounded-xl p-4 mb-6">
                    <h3 className="text-indigo-300 font-semibold mb-3 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Date Ranges for Week: {formatDate(startDate)} – {formatDate(endDate)}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div className="bg-slate-800/50 rounded-lg p-3">
                        <p className="text-orange-400 font-medium mb-1">📦 Amazon SKU Economics</p>
                        <p className="text-white font-mono text-xs">{formatShort(startDate)} → {formatShort(endDate)}</p>
                        <p className="text-slate-400 text-xs mt-1">Seller Central → Reports → Business Reports → SKU Economics</p>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-3">
                        <p className="text-blue-400 font-medium mb-1">🛒 Shopify Sales by Product</p>
                        <p className="text-white font-mono text-xs">{formatShort(startDate)} → {formatShort(endDate)}</p>
                        <p className="text-slate-400 text-xs mt-1">Analytics → Reports → Sales by product variant SKU</p>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-3">
                        <p className="text-teal-400 font-medium mb-1">🚚 3PL Invoice (if applicable)</p>
                        <p className="text-white font-mono text-xs">{formatShort(startDate)} → {formatShort(endDate)}</p>
                        <p className="text-slate-400 text-xs mt-1">Download fulfillment invoice for this week</p>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-3">
                        <p className="text-violet-400 font-medium mb-1">📣 Ad Spend (Meta/Google)</p>
                        <p className="text-white font-mono text-xs">{formatShort(startDate)} → {formatShort(endDate)}</p>
                        <p className="text-slate-400 text-xs mt-1">Enter total spend for this 7-day period</p>
                      </div>
                    </div>
                  </div>
                );
              })()}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <FileBox type="amazon" label="Amazon Report" desc="Business Reports > Detail Page" req />
                <FileBox type="shopify" label="Shopify Sales" desc="Analytics > Sales by product" req />
                <FileBox type="threepl" label="3PL Costs" desc="Fulfillment invoice CSV" multi />
                <FileBox type="cogs" label="COGS File" desc="SKU & Cost Per Unit columns" />
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div><label className="block text-sm text-slate-400 mb-2">Meta Ad Spend</label><input type="number" value={adSpend.meta} onChange={(e) => setAdSpend(p => ({ ...p, meta: e.target.value }))} placeholder="0.00" className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white" /></div>
                <div><label className="block text-sm text-slate-400 mb-2">Google Ad Spend</label><input type="number" value={adSpend.google} onChange={(e) => setAdSpend(p => ({ ...p, google: e.target.value }))} placeholder="0.00" className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white" /></div>
              </div>
              
              {!hasCogs && <div className="bg-amber-900/30 border border-amber-500/50 rounded-xl p-4 mb-6 flex items-start gap-3"><AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" /><div><p className="text-amber-300 font-medium">COGS not set up</p><p className="text-amber-200/70 text-sm">Upload a COGS file or configure in settings for profit tracking</p></div></div>}
              
              <button onClick={processSales} disabled={isProcessing || !files.amazon || !files.shopify || !weekEnding || !hasCogs} className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold py-4 rounded-xl">{isProcessing ? 'Processing...' : 'Process Weekly Data'}</button>
            </div>
          )}
          
          {/* Period Upload */}
          {uploadTab === 'period' && (
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-white mb-1">Period Upload</h2>
              <p className="text-slate-400 text-sm mb-6">Upload monthly or yearly totals for historical tracking</p>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-2">Period Label <span className="text-rose-400">*</span></label>
                <input type="text" value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="e.g., 2024, Q1 2025, January 2025" className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white" />
                <p className="text-slate-500 text-xs mt-1">Tip: Use "2024" or "2025" for YoY comparisons</p>
              </div>
              
              {/* Period Date Range Guide */}
              {periodLabel && (() => {
                // Try to determine date range from label
                let startDate = '', endDate = '', suggestion = '';
                const label = periodLabel.trim().toLowerCase();
                const currentYear = new Date().getFullYear();
                
                if (/^20\d{2}$/.test(periodLabel.trim())) {
                  // Full year like "2024"
                  startDate = `01/01/${periodLabel.trim()}`;
                  endDate = `12/31/${periodLabel.trim()}`;
                  suggestion = `Full year ${periodLabel.trim()}`;
                } else if (/q[1-4]\s*20\d{2}/i.test(label)) {
                  // Quarter like "Q1 2025"
                  const match = label.match(/q([1-4])\s*(20\d{2})/i);
                  if (match) {
                    const q = parseInt(match[1]);
                    const y = match[2];
                    const qStarts = ['01/01', '04/01', '07/01', '10/01'];
                    const qEnds = ['03/31', '06/30', '09/30', '12/31'];
                    startDate = `${qStarts[q-1]}/${y}`;
                    endDate = `${qEnds[q-1]}/${y}`;
                    suggestion = `Q${q} ${y}`;
                  }
                }
                
                if (startDate && endDate) {
                  return (
                    <div className="bg-teal-900/20 border border-teal-500/30 rounded-xl p-4 mb-6">
                      <h3 className="text-teal-300 font-semibold mb-3 flex items-center gap-2">
                        <CalendarRange className="w-4 h-4" />
                        Date Range for "{suggestion}"
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <p className="text-orange-400 font-medium mb-1">📦 Amazon SKU Economics</p>
                          <p className="text-white font-mono">{startDate} → {endDate}</p>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <p className="text-blue-400 font-medium mb-1">🛒 Shopify Sales by Product</p>
                          <p className="text-white font-mono">{startDate} → {endDate}</p>
                        </div>
                      </div>
                      <p className="text-slate-400 text-xs mt-3">Make sure both reports use the same date range</p>
                    </div>
                  );
                }
                return null;
              })()}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <PeriodFileBox type="amazon" label="Amazon Report" desc="Business Reports" req />
                <PeriodFileBox type="shopify" label="Shopify Sales" desc="Sales by product" req />
                <PeriodFileBox type="threepl" label="3PL Costs" desc="Fulfillment CSV" multi />
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div><label className="block text-sm text-slate-400 mb-2">Meta Ad Spend</label><input type="number" value={periodAdSpend.meta} onChange={(e) => setPeriodAdSpend(p => ({ ...p, meta: e.target.value }))} placeholder="0.00" className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white" /></div>
                <div><label className="block text-sm text-slate-400 mb-2">Google Ad Spend</label><input type="number" value={periodAdSpend.google} onChange={(e) => setPeriodAdSpend(p => ({ ...p, google: e.target.value }))} placeholder="0.00" className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white" /></div>
              </div>
              
              {!hasCogs && <div className="bg-amber-900/30 border border-amber-500/50 rounded-xl p-4 mb-6 flex items-start gap-3"><AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" /><div><p className="text-amber-300 font-medium">COGS not set up</p><p className="text-amber-200/70 text-sm">Upload a COGS file or configure in settings for profit tracking</p></div></div>}
              
              <button onClick={processPeriod} disabled={isProcessing || !periodFiles.amazon || !periodFiles.shopify || !periodLabel.trim() || !hasCogs} className="w-full bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold py-4 rounded-xl">{isProcessing ? 'Processing...' : 'Save Period Data'}</button>
            </div>
          )}
          
          {/* Inventory Upload */}
          {uploadTab === 'inventory' && (
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-white mb-1">Inventory Upload</h2>
              <p className="text-slate-400 text-sm mb-6">Track stock levels and get reorder alerts</p>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-2">Snapshot Date <span className="text-rose-400">*</span></label>
                <input type="date" value={invSnapshotDate} onChange={(e) => setInvSnapshotDate(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white" />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <FileBox type="amazon" label="Amazon FBA Inventory" desc="Inventory health report" req isInv />
                <FileBox type="threepl" label="3PL Inventory" desc="Products export" req isInv />
              </div>
              
              <button onClick={processInventory} disabled={isProcessing || !invFiles.amazon || !invFiles.threepl || !invSnapshotDate} className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold py-4 rounded-xl">{isProcessing ? 'Processing...' : 'Process Inventory'}</button>
            </div>
          )}
          
          {/* Amazon Forecast Upload */}
          {uploadTab === 'forecast' && (
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-white mb-1">Amazon Forecast Upload</h2>
              <p className="text-slate-400 text-sm mb-4">Upload Amazon's projected sales to compare against actual results</p>
              
              {/* Upcoming Week Date Range */}
              {(() => {
                const today = new Date();
                const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
                
                // For forecasts, we want FUTURE dates starting TOMORROW
                // Calculate the upcoming Sunday (end of this forecast period)
                const tomorrow = new Date(today);
                tomorrow.setDate(today.getDate() + 1);
                const tomorrowDay = tomorrow.getDay();
                
                // Find the Sunday that ends the week containing tomorrow
                const upcomingSunday = new Date(tomorrow);
                if (tomorrowDay === 0) {
                  // Tomorrow is Sunday - that's the end of this week
                  // Keep it as is
                } else {
                  // Find the Sunday after tomorrow
                  upcomingSunday.setDate(tomorrow.getDate() + (7 - tomorrowDay));
                }
                
                // The start of the forecast period is tomorrow
                const forecastStart = new Date(tomorrow);
                
                const formatDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const formatShort = (d) => d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
                
                // Also show next full week for users who want to plan ahead
                const nextWeekMonday = new Date(upcomingSunday);
                nextWeekMonday.setDate(upcomingSunday.getDate() + 1);
                const nextWeekSunday = new Date(nextWeekMonday);
                nextWeekSunday.setDate(nextWeekMonday.getDate() + 6);
                
                return (
                  <div className="bg-orange-900/20 border border-orange-500/30 rounded-xl p-4 mb-6">
                    <h3 className="text-orange-300 font-semibold mb-3 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Amazon Forecast Date Ranges
                    </h3>
                    <p className="text-slate-400 text-sm mb-3">Forecasts are for <span className="text-orange-300">future dates</span> — today ({formatDate(today)}) is excluded</p>
                    
                    {/* Rest of This Week (starting tomorrow) */}
                    <div className="bg-slate-800/50 rounded-lg p-3 mb-3">
                      <p className="text-orange-400 font-medium mb-1">📦 This Week's Forecast (ending {formatDate(upcomingSunday)})</p>
                      <p className="text-white font-mono text-lg">{formatShort(forecastStart)} → {formatShort(upcomingSunday)}</p>
                      <p className="text-slate-400 text-xs mt-1">{formatDate(forecastStart)} through {formatDate(upcomingSunday)}</p>
                    </div>
                    
                    {/* Next Full Week */}
                    <div className="bg-slate-800/30 rounded-lg p-3 mb-3">
                      <p className="text-amber-400/70 font-medium mb-1">📅 Next Week's Forecast (full week)</p>
                      <p className="text-white/70 font-mono">{formatShort(nextWeekMonday)} → {formatShort(nextWeekSunday)}</p>
                      <p className="text-slate-500 text-xs mt-1">{formatDate(nextWeekMonday)} through {formatDate(nextWeekSunday)}</p>
                    </div>
                    
                    <ol className="text-slate-300 text-sm space-y-1 list-decimal list-inside">
                      <li>Seller Central → Reports → Business Reports → <span className="text-orange-300">SKU Economics</span></li>
                      <li>Set date range to a <span className="text-orange-300 font-medium">future week</span> (dates shown above)</li>
                      <li>Amazon shows <span className="text-orange-300 font-medium">projected</span> sales for future dates</li>
                      <li>Export as CSV and upload below</li>
                    </ol>
                  </div>
                );
              })()}
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-2">Amazon Forecast CSV <span className="text-rose-400">*</span></label>
                <div className={`relative border-2 border-dashed rounded-xl p-6 transition-all ${files.amazonForecast ? 'border-amber-500/50 bg-amber-950/20' : 'border-slate-600 hover:border-slate-500 bg-slate-800/30'}`}>
                  <input type="file" accept=".csv" onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      setFiles(p => ({ ...p, amazonForecast: null }));
                      setFileNames(p => ({ ...p, amazonForecast: file.name }));
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const parsed = parseCSV(ev.target.result);
                        setFiles(p => ({ ...p, amazonForecast: parsed }));
                      };
                      reader.readAsText(file);
                    }
                  }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  <div className="flex flex-col items-center gap-2">
                    {files.amazonForecast ? <Check className="w-8 h-8 text-amber-400" /> : <Upload className="w-8 h-8 text-slate-400" />}
                    <p className={`font-medium ${files.amazonForecast ? 'text-amber-400' : 'text-white'}`}>
                      {files.amazonForecast ? fileNames.amazonForecast : 'Click to upload Amazon forecast CSV'}
                    </p>
                    {files.amazonForecast && (
                      <p className="text-slate-400 text-sm">{files.amazonForecast.length} SKUs found</p>
                    )}
                  </div>
                </div>
              </div>
              
              <button onClick={() => {
                if (!files.amazonForecast) return;
                const forecast = processAmazonForecast(files.amazonForecast);
                if (forecast) {
                  setAmazonForecasts(prev => ({ ...prev, [forecast.weekEnding]: forecast }));
                  setFiles(p => ({ ...p, amazonForecast: null }));
                  setFileNames(p => ({ ...p, amazonForecast: '' }));
                  setToast({ message: `Forecast saved for week ending ${forecast.weekEnding}`, type: 'success' });
                } else {
                  setToast({ message: 'Could not parse forecast data', type: 'error' });
                }
              }} disabled={!files.amazonForecast} className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold py-4 rounded-xl mb-6">
                Save Forecast
              </button>
              
              {/* Existing Forecasts */}
              {Object.keys(amazonForecasts).length > 0 && (
                <div className="border-t border-slate-700 pt-6">
                  <h3 className="text-sm font-semibold text-slate-300 uppercase mb-4">Saved Forecasts</h3>
                  <div className="space-y-2">
                    {Object.entries(amazonForecasts).sort((a, b) => b[0].localeCompare(a[0])).map(([weekKey, forecast]) => {
                      const hasActual = allWeeksData[weekKey];
                      const isPast = new Date(weekKey) < new Date();
                      return (
                        <div key={weekKey} className={`flex items-center justify-between p-3 rounded-xl ${hasActual ? 'bg-emerald-900/20 border border-emerald-500/30' : isPast ? 'bg-slate-700/30 border border-slate-600' : 'bg-amber-900/20 border border-amber-500/30'}`}>
                          <div>
                            <p className="text-white font-medium">Week ending {new Date(weekKey + 'T00:00:00').toLocaleDateString()}</p>
                            <p className="text-slate-400 text-sm">
                              {formatCurrency(forecast.totals.sales)} projected • {forecast.skuCount} SKUs
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {hasActual ? (
                              <span className="text-emerald-400 text-sm flex items-center gap-1"><Check className="w-4 h-4" />Has actuals</span>
                            ) : isPast ? (
                              <span className="text-slate-400 text-sm">Awaiting actuals</span>
                            ) : (
                              <span className="text-amber-400 text-sm">Upcoming</span>
                            )}
                            <button onClick={() => {
                              const updated = { ...amazonForecasts };
                              delete updated[weekKey];
                              setAmazonForecasts(updated);
                            }} className="p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-rose-400">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* Forecast vs Actual Comparison */}
              {getAmazonForecastComparison.length > 0 && (
                <div className="border-t border-slate-700 pt-6 mt-6">
                  <h3 className="text-sm font-semibold text-slate-300 uppercase mb-4">Forecast Accuracy</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left text-slate-400 py-2">Week</th>
                          <th className="text-right text-slate-400 py-2">Forecast</th>
                          <th className="text-right text-slate-400 py-2">Actual</th>
                          <th className="text-right text-slate-400 py-2">Variance</th>
                          <th className="text-right text-slate-400 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getAmazonForecastComparison.map(c => (
                          <tr key={c.weekEnding} className="border-b border-slate-700/50">
                            <td className="py-2 text-white">{new Date(c.weekEnding + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                            <td className="py-2 text-right text-slate-400">{formatCurrency(c.forecast.revenue)}</td>
                            <td className="py-2 text-right text-white font-medium">{formatCurrency(c.actual.revenue)}</td>
                            <td className={`py-2 text-right font-medium ${c.variance.revenuePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {c.variance.revenuePercent >= 0 ? '+' : ''}{c.variance.revenuePercent.toFixed(1)}%
                            </td>
                            <td className="py-2 text-right">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${c.status === 'beat' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-rose-900/50 text-rose-400'}`}>
                                {c.status === 'beat' ? '↑ Beat' : '↓ Missed'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Import/Export */}
          <div className="mt-6 flex gap-3 justify-center">
            <button onClick={exportAll} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white flex items-center gap-2"><Download className="w-4 h-4" />Export All Data</button>
            <label className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white flex items-center gap-2 cursor-pointer"><Upload className="w-4 h-4" />Import Data<input type="file" accept=".json" onChange={(e) => e.target.files[0] && importData(e.target.files[0])} className="hidden" /></label>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'bulk') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-6">
        <div className="max-w-3xl mx-auto"><Toast /><ValidationModal />{aiChatUI}{aiChatButton}<CogsManager /><ProductCatalogModal /><UploadHelpModal /><ForecastModal /><BreakEvenModal /><ExportModal /><ComparisonView /><InvoiceModal /><GoalsModal />
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
        <div className="max-w-3xl mx-auto"><Toast /><ValidationModal />{aiChatUI}{aiChatButton}<CogsManager /><ProductCatalogModal /><UploadHelpModal /><ForecastModal /><BreakEvenModal /><ExportModal /><ComparisonView /><InvoiceModal /><GoalsModal />
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
        <div className="max-w-7xl mx-auto"><Toast /><ValidationModal />{aiChatUI}{aiChatButton}<CogsManager /><ProductCatalogModal /><UploadHelpModal /><ForecastModal /><BreakEvenModal /><ExportModal /><ComparisonView /><InvoiceModal /><GoalsModal />
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
        <div className="max-w-7xl mx-auto"><Toast /><ValidationModal />{aiChatUI}{aiChatButton}<CogsManager /><ProductCatalogModal /><UploadHelpModal /><ForecastModal /><BreakEvenModal /><ExportModal /><ComparisonView /><InvoiceModal /><GoalsModal />
          {/* Edit Ad Spend Modal */}
          {showEditAdSpend && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-md w-full">
                <h2 className="text-xl font-bold text-white mb-2">Edit Ad Spend</h2>
                <p className="text-slate-400 text-sm mb-4">Week ending {new Date(selectedWeek+'T00:00:00').toLocaleDateString()}</p>
                
                <div className="space-y-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-blue-500"></span>Meta Ads (Facebook/Instagram)
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                      <input type="number" value={editAdSpend.meta} onChange={(e) => setEditAdSpend(p => ({ ...p, meta: e.target.value }))} placeholder="0.00" className="w-full bg-slate-900 border border-slate-600 rounded-xl pl-8 pr-4 py-3 text-white" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-red-500"></span>Google Ads
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                      <input type="number" value={editAdSpend.google} onChange={(e) => setEditAdSpend(p => ({ ...p, google: e.target.value }))} placeholder="0.00" className="w-full bg-slate-900 border border-slate-600 rounded-xl pl-8 pr-4 py-3 text-white" />
                    </div>
                  </div>
                </div>
                
                {/* Total Summary */}
                <div className="bg-slate-900/50 rounded-xl p-3 mb-6">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Total Ad Spend</span>
                    <span className="text-white font-bold text-lg">{formatCurrency((parseFloat(editAdSpend.meta) || 0) + (parseFloat(editAdSpend.google) || 0))}</span>
                  </div>
                </div>
                
                <p className="text-slate-500 text-xs mb-4">💡 Tip: Amazon ad spend is included automatically from SKU Economics report</p>
                
                <div className="flex gap-3">
                  <button onClick={() => updateWeekAdSpend(selectedWeek, editAdSpend.meta, editAdSpend.google)} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 rounded-xl">Save</button>
                  <button onClick={() => setShowEditAdSpend(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-xl">Cancel</button>
                </div>
              </div>
            </div>
          )}
          {/* Edit 3PL Costs Modal */}
          {showEdit3PL && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-md w-full">
                <h2 className="text-xl font-bold text-white mb-4">Edit 3PL / Fulfillment Costs</h2>
                <p className="text-slate-400 text-sm mb-4">Week ending {new Date(selectedWeek+'T00:00:00').toLocaleDateString()}</p>
                
                {/* Option 1: Upload 3PL File */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Option 1: Upload 3PL Invoice</label>
                  <div className={`relative border-2 border-dashed rounded-xl p-4 ${reprocessFiles.threepl ? 'border-teal-400 bg-teal-950/30' : 'border-slate-600 bg-slate-800/30'}`}>
                    <input type="file" accept=".csv" onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const parsed = parseCSV(ev.target.result);
                          setReprocessFiles(p => ({ ...p, threepl: parsed }));
                          setReprocessFileNames(p => ({ ...p, threepl: file.name }));
                          // Auto-calculate cost from file
                          const threeplData = parse3PLData(parsed);
                          setEdit3PLCost(threeplData.metrics.totalCost.toString());
                        };
                        reader.readAsText(file);
                      }
                    }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    <div className="flex flex-col items-center gap-2">
                      {reprocessFiles.threepl ? <Check className="w-6 h-6 text-teal-400" /> : <Upload className="w-6 h-6 text-slate-400" />}
                      <span className={reprocessFiles.threepl ? 'text-teal-400 text-sm' : 'text-slate-400 text-sm'}>
                        {reprocessFileNames.threepl || 'Click to upload 3PL CSV'}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-slate-700" />
                  <span className="text-slate-500 text-sm">OR</span>
                  <div className="flex-1 h-px bg-slate-700" />
                </div>
                
                {/* Option 2: Enter Amount Manually */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Option 2: Enter Total Manually</label>
                  <input type="number" value={edit3PLCost} onChange={(e) => setEdit3PLCost(e.target.value)} placeholder="0.00" className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white" />
                  <p className="text-slate-500 text-xs mt-2">Total fulfillment costs (shipping, pick & pack, storage, etc.)</p>
                </div>
                
                <div className="flex gap-3">
                  <button onClick={() => {
                    updateWeek3PL(selectedWeek, edit3PLCost);
                    setReprocessFiles(p => ({ ...p, threepl: null }));
                    setReprocessFileNames(p => ({ ...p, threepl: '' }));
                  }} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 rounded-xl">Save</button>
                  <button onClick={() => {
                    setShowEdit3PL(false);
                    setReprocessFiles(p => ({ ...p, threepl: null }));
                    setReprocessFileNames(p => ({ ...p, threepl: '' }));
                  }} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-xl">Cancel</button>
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
            <div className="flex items-center gap-4">
              {storeLogo && (
                <img src={storeLogo} alt="Store logo" className="w-12 h-12 object-contain rounded-xl bg-white p-1.5" />
              )}
              <div><h1 className="text-2xl lg:text-3xl font-bold text-white">{storeName ? storeName + ' Dashboard' : 'Weekly Performance'}</h1><p className="text-slate-400">Week ending {new Date(selectedWeek+'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p></div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setReprocessAdSpend({ meta: data.shopify.metaSpend || '', google: data.shopify.googleSpend || '' }); setShowReprocess(true); }} className="bg-violet-900/50 hover:bg-violet-800/50 border border-violet-600/50 text-violet-300 px-3 py-2 rounded-lg text-sm flex items-center gap-1"><RefreshCw className="w-4 h-4" />Re-process</button>
              <button onClick={() => { setEditAdSpend({ meta: data.shopify.metaSpend || '', google: data.shopify.googleSpend || '' }); setShowEditAdSpend(true); }} className="bg-blue-900/50 hover:bg-blue-800/50 border border-blue-600/50 text-blue-300 px-3 py-2 rounded-lg text-sm flex items-center gap-1"><DollarSign className="w-4 h-4" />Edit Ads</button>
              <button onClick={() => { setEdit3PLCost(data.shopify?.threeplCosts?.toString() || ''); setShowEdit3PL(true); }} className="bg-teal-900/50 hover:bg-teal-800/50 border border-teal-600/50 text-teal-300 px-3 py-2 rounded-lg text-sm flex items-center gap-1"><Truck className="w-4 h-4" />Edit 3PL</button>
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
          
          {/* Week Notes */}
          <div className="mt-6 bg-slate-800/50 rounded-2xl border border-slate-700 p-5">
            <h3 className="text-sm font-semibold text-slate-400 uppercase mb-3 flex items-center gap-2"><StickyNote className="w-4 h-4" />Week Notes</h3>
            <WeekNoteEditor weekKey={selectedWeek} />
          </div>
        </div>
      </div>
    );
  }

  if (view === 'monthly') {
    const months = getMonths(), data = selectedMonth ? getMonthlyData(selectedMonth) : null, idx = months.indexOf(selectedMonth);
    if (!data) return <div className="min-h-screen bg-slate-950 text-white p-6 flex items-center justify-center">No data</div>;
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 lg:p-6">
        <div className="max-w-7xl mx-auto"><Toast /><ValidationModal />{aiChatUI}{aiChatButton}<CogsManager /><ProductCatalogModal /><UploadHelpModal /><ForecastModal /><BreakEvenModal /><ExportModal /><ComparisonView /><InvoiceModal /><GoalsModal />
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
        <div className="max-w-7xl mx-auto"><Toast /><ValidationModal />{aiChatUI}{aiChatButton}<CogsManager /><ProductCatalogModal /><UploadHelpModal /><ForecastModal /><BreakEvenModal /><ExportModal /><ComparisonView /><InvoiceModal /><GoalsModal />
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

  // Period View
  if (view === 'period-view' && selectedPeriod && allPeriodsData[selectedPeriod]) {
    const data = allPeriodsData[selectedPeriod], periods = Object.keys(allPeriodsData).sort().reverse(), idx = periods.indexOf(selectedPeriod);
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 lg:p-6">
        <div className="max-w-7xl mx-auto"><Toast /><ValidationModal />{aiChatUI}{aiChatButton}<CogsManager /><ProductCatalogModal /><UploadHelpModal /><ForecastModal /><BreakEvenModal /><ExportModal /><ComparisonView /><InvoiceModal /><GoalsModal />
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
                    
                    // Use enhanced 3PL parser for full metrics
                    let newThreeplCost = existing.shopify?.threeplCosts || 0;
                    let newBreakdown = existing.shopify?.threeplBreakdown || { storage: 0, shipping: 0, pickFees: 0, boxCharges: 0, receiving: 0, other: 0 };
                    let newMetrics = existing.shopify?.threeplMetrics || null;
                    
                    if (periodFiles.threepl?.length > 0) {
                      const threeplData = parse3PLData(periodFiles.threepl);
                      newThreeplCost = threeplData.metrics.totalCost;
                      newBreakdown = threeplData.breakdown;
                      newMetrics = threeplData.metrics;
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
                          threeplMetrics: newMetrics,
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
              <button onClick={() => { setUploadTab('period'); setView('upload'); }} className="bg-teal-700 hover:bg-teal-600 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-1"><Upload className="w-4 h-4" />New</button>
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
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5 mb-6">
            <h3 className="text-sm font-semibold text-slate-400 uppercase mb-4">Revenue by Channel</h3>
            <div className="h-4 bg-slate-700 rounded-full overflow-hidden flex mb-3"><div className="bg-orange-500 h-full" style={{ width: `${data.total.amazonShare}%` }} /><div className="bg-blue-500 h-full" style={{ width: `${data.total.shopifyShare}%` }} /></div>
            <div className="flex justify-between text-sm"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-orange-500" /><span className="text-slate-300">Amazon</span><span className="text-white font-semibold">{formatPercent(data.total.amazonShare)}</span></div><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500" /><span className="text-slate-300">Shopify</span><span className="text-white font-semibold">{formatPercent(data.total.shopifyShare)}</span></div></div>
          </div>
          
          {/* Period Analytics Quick Access Buttons */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <button onClick={() => setPeriodAnalyticsView(periodAnalyticsView === 'skus' ? null : 'skus')} className={`p-3 rounded-xl border text-left transition-all ${periodAnalyticsView === 'skus' ? 'bg-pink-600/20 border-pink-500/50' : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'}`}>
              <Trophy className={`w-5 h-5 mb-1 ${periodAnalyticsView === 'skus' ? 'text-pink-400' : 'text-slate-400'}`} />
              <p className={`text-sm font-medium ${periodAnalyticsView === 'skus' ? 'text-pink-300' : 'text-white'}`}>SKU Rankings</p>
              <p className="text-xs text-slate-500">{(data.amazon?.skuData?.length || 0) + (data.shopify?.skuData?.length || 0)} products</p>
            </button>
            <button onClick={() => setPeriodAnalyticsView(periodAnalyticsView === 'profit' ? null : 'profit')} className={`p-3 rounded-xl border text-left transition-all ${periodAnalyticsView === 'profit' ? 'bg-emerald-600/20 border-emerald-500/50' : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'}`}>
              <PieChart className={`w-5 h-5 mb-1 ${periodAnalyticsView === 'profit' ? 'text-emerald-400' : 'text-slate-400'}`} />
              <p className={`text-sm font-medium ${periodAnalyticsView === 'profit' ? 'text-emerald-300' : 'text-white'}`}>Profitability</p>
              <p className="text-xs text-slate-500">{formatPercent(data.total.netMargin)} margin</p>
            </button>
            <button onClick={() => setPeriodAnalyticsView(periodAnalyticsView === 'ads' ? null : 'ads')} className={`p-3 rounded-xl border text-left transition-all ${periodAnalyticsView === 'ads' ? 'bg-purple-600/20 border-purple-500/50' : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'}`}>
              <Zap className={`w-5 h-5 mb-1 ${periodAnalyticsView === 'ads' ? 'text-purple-400' : 'text-slate-400'}`} />
              <p className={`text-sm font-medium ${periodAnalyticsView === 'ads' ? 'text-purple-300' : 'text-white'}`}>Ad Performance</p>
              <p className="text-xs text-slate-500">{formatCurrency(data.total.adSpend)} spent</p>
            </button>
            <button onClick={() => setPeriodAnalyticsView(periodAnalyticsView === '3pl' ? null : '3pl')} className={`p-3 rounded-xl border text-left transition-all ${periodAnalyticsView === '3pl' ? 'bg-blue-600/20 border-blue-500/50' : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'}`}>
              <Truck className={`w-5 h-5 mb-1 ${periodAnalyticsView === '3pl' ? 'text-blue-400' : 'text-slate-400'}`} />
              <p className={`text-sm font-medium ${periodAnalyticsView === '3pl' ? 'text-blue-300' : 'text-white'}`}>3PL Costs</p>
              <p className="text-xs text-slate-500">{formatCurrency(data.shopify?.threeplCosts || 0)}</p>
            </button>
          </div>
          
          {/* SKU Rankings Panel */}
          {periodAnalyticsView === 'skus' && (
            <div className="bg-slate-800/50 rounded-2xl border border-pink-500/30 p-5 mb-6">
              <h3 className="text-lg font-semibold text-pink-400 mb-4 flex items-center gap-2"><Trophy className="w-5 h-5" />SKU Rankings - {data.label}</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-semibold text-orange-400 mb-3">Amazon Top SKUs</h4>
                  {data.amazon?.skuData?.length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto">{data.amazon.skuData.slice(0, 10).map((sku, i) => (<div key={sku.sku} className="flex items-center gap-3 p-2 bg-slate-900/50 rounded-lg"><span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-amber-500 text-black' : i === 1 ? 'bg-slate-400 text-black' : i === 2 ? 'bg-amber-700 text-white' : 'bg-slate-700 text-white'}`}>{i + 1}</span><div className="flex-1 min-w-0"><p className="text-white text-sm truncate">{sku.sku}</p><p className="text-slate-500 text-xs">{formatNumber(sku.unitsSold)} units</p></div><p className="text-emerald-400 font-semibold">{formatCurrency(sku.netSales)}</p></div>))}</div>
                  ) : <p className="text-slate-500 text-sm">No SKU data</p>}
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-blue-400 mb-3">Shopify Top SKUs</h4>
                  {data.shopify?.skuData?.length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto">{data.shopify.skuData.slice(0, 10).map((sku, i) => (<div key={sku.sku} className="flex items-center gap-3 p-2 bg-slate-900/50 rounded-lg"><span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-amber-500 text-black' : i === 1 ? 'bg-slate-400 text-black' : i === 2 ? 'bg-amber-700 text-white' : 'bg-slate-700 text-white'}`}>{i + 1}</span><div className="flex-1 min-w-0"><p className="text-white text-sm truncate">{sku.sku}</p><p className="text-slate-500 text-xs">{formatNumber(sku.unitsSold)} units</p></div><p className="text-emerald-400 font-semibold">{formatCurrency(sku.netSales)}</p></div>))}</div>
                  ) : <p className="text-slate-500 text-sm">No SKU data</p>}
                </div>
              </div>
            </div>
          )}
          
          {/* Profitability Panel */}
          {periodAnalyticsView === 'profit' && (
            <div className="bg-slate-800/50 rounded-2xl border border-emerald-500/30 p-5 mb-6">
              <h3 className="text-lg font-semibold text-emerald-400 mb-4 flex items-center gap-2"><PieChart className="w-5 h-5" />Profitability - {data.label}</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div><h4 className="text-sm font-semibold text-slate-300 mb-3">Profit Waterfall</h4><div className="space-y-2"><div className="flex justify-between items-center p-2 bg-emerald-900/30 rounded-lg"><span className="text-slate-300">Revenue</span><span className="text-emerald-400 font-semibold">{formatCurrency(data.total.revenue)}</span></div><div className="flex justify-between items-center p-2 bg-rose-900/30 rounded-lg"><span className="text-slate-300">− COGS</span><span className="text-rose-400">({formatCurrency(data.total.cogs)})</span></div><div className="flex justify-between items-center p-2 bg-rose-900/30 rounded-lg"><span className="text-slate-300">− Amazon Fees</span><span className="text-rose-400">({formatCurrency(data.amazon?.fees || 0)})</span></div><div className="flex justify-between items-center p-2 bg-rose-900/30 rounded-lg"><span className="text-slate-300">− 3PL Costs</span><span className="text-rose-400">({formatCurrency(data.shopify?.threeplCosts || 0)})</span></div><div className="flex justify-between items-center p-2 bg-rose-900/30 rounded-lg"><span className="text-slate-300">− Ad Spend</span><span className="text-rose-400">({formatCurrency(data.total.adSpend)})</span></div><div className="flex justify-between items-center p-2 bg-slate-700 rounded-lg border-2 border-emerald-500/50"><span className="text-white font-semibold">Net Profit</span><span className={`font-bold ${data.total.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(data.total.netProfit)}</span></div></div></div>
                <div><h4 className="text-sm font-semibold text-slate-300 mb-3">Cost Breakdown</h4><div className="space-y-3"><div><div className="flex justify-between text-sm mb-1"><span className="text-slate-400">COGS</span><span className="text-white">{formatPercent(data.total.revenue > 0 ? (data.total.cogs / data.total.revenue) * 100 : 0)}</span></div><div className="h-2 bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-amber-500" style={{ width: `${Math.min(100, data.total.revenue > 0 ? (data.total.cogs / data.total.revenue) * 100 : 0)}%` }} /></div></div><div><div className="flex justify-between text-sm mb-1"><span className="text-slate-400">Fees & Fulfillment</span><span className="text-white">{formatPercent(data.total.revenue > 0 ? (((data.amazon?.fees || 0) + (data.shopify?.threeplCosts || 0)) / data.total.revenue) * 100 : 0)}</span></div><div className="h-2 bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${Math.min(100, data.total.revenue > 0 ? (((data.amazon?.fees || 0) + (data.shopify?.threeplCosts || 0)) / data.total.revenue) * 100 : 0)}%` }} /></div></div><div><div className="flex justify-between text-sm mb-1"><span className="text-slate-400">Advertising</span><span className="text-white">{formatPercent(data.total.revenue > 0 ? (data.total.adSpend / data.total.revenue) * 100 : 0)}</span></div><div className="h-2 bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-purple-500" style={{ width: `${Math.min(100, data.total.revenue > 0 ? (data.total.adSpend / data.total.revenue) * 100 : 0)}%` }} /></div></div><div><div className="flex justify-between text-sm mb-1"><span className="text-slate-400">Net Margin</span><span className={data.total.netMargin >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{formatPercent(data.total.netMargin)}</span></div><div className="h-2 bg-slate-700 rounded-full overflow-hidden"><div className={`h-full ${data.total.netMargin >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(100, Math.abs(data.total.netMargin))}%` }} /></div></div></div></div>
              </div>
            </div>
          )}
          
          {/* Ads Panel */}
          {periodAnalyticsView === 'ads' && (
            <div className="bg-slate-800/50 rounded-2xl border border-purple-500/30 p-5 mb-6">
              <h3 className="text-lg font-semibold text-purple-400 mb-4 flex items-center gap-2"><Zap className="w-5 h-5" />Ad Performance - {data.label}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4"><div className="bg-slate-900/50 rounded-lg p-3"><p className="text-slate-500 text-xs">Total Ad Spend</p><p className="text-white text-xl font-bold">{formatCurrency(data.total.adSpend)}</p></div><div className="bg-slate-900/50 rounded-lg p-3"><p className="text-slate-500 text-xs">TACOS</p><p className={`text-xl font-bold ${data.total.revenue > 0 && (data.total.adSpend / data.total.revenue) * 100 <= 15 ? 'text-emerald-400' : 'text-amber-400'}`}>{data.total.revenue > 0 ? ((data.total.adSpend / data.total.revenue) * 100).toFixed(1) : 0}%</p></div><div className="bg-slate-900/50 rounded-lg p-3"><p className="text-slate-500 text-xs">Amazon Ads</p><p className="text-orange-400 text-xl font-bold">{formatCurrency(data.amazon?.adSpend || 0)}</p></div><div className="bg-slate-900/50 rounded-lg p-3"><p className="text-slate-500 text-xs">Shopify Ads</p><p className="text-blue-400 text-xl font-bold">{formatCurrency(data.shopify?.adSpend || 0)}</p></div></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div className="bg-orange-900/20 rounded-lg p-4 border border-orange-500/30"><h4 className="text-orange-400 font-semibold mb-2">Amazon</h4><div className="space-y-1 text-sm"><div className="flex justify-between"><span className="text-slate-400">Sponsored Products</span><span className="text-white">{formatCurrency(data.amazon?.adSpend || 0)}</span></div><div className="flex justify-between"><span className="text-slate-400">TACOS</span><span className="text-white">{data.amazon?.revenue > 0 ? ((data.amazon.adSpend / data.amazon.revenue) * 100).toFixed(1) : 0}%</span></div></div></div><div className="bg-blue-900/20 rounded-lg p-4 border border-blue-500/30"><h4 className="text-blue-400 font-semibold mb-2">Shopify</h4><div className="space-y-1 text-sm"><div className="flex justify-between"><span className="text-slate-400">Meta Ads</span><span className="text-white">{formatCurrency(data.shopify?.metaSpend || 0)}</span></div><div className="flex justify-between"><span className="text-slate-400">Google Ads</span><span className="text-white">{formatCurrency(data.shopify?.googleSpend || 0)}</span></div><div className="flex justify-between"><span className="text-slate-400">TACOS</span><span className="text-white">{data.shopify?.revenue > 0 ? ((data.shopify.adSpend / data.shopify.revenue) * 100).toFixed(1) : 0}%</span></div></div></div></div>
            </div>
          )}
          
          {/* 3PL Panel */}
          {periodAnalyticsView === '3pl' && (
            <div className="bg-slate-800/50 rounded-2xl border border-blue-500/30 p-5 mb-6">
              <h3 className="text-lg font-semibold text-blue-400 mb-4 flex items-center gap-2"><Truck className="w-5 h-5" />3PL Fulfillment - {data.label}</h3>
              {data.shopify?.threeplCosts > 0 ? (<><div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4"><div className="bg-slate-900/50 rounded-lg p-3"><p className="text-slate-500 text-xs">Total 3PL</p><p className="text-white text-xl font-bold">{formatCurrency(data.shopify.threeplCosts)}</p></div><div className="bg-slate-900/50 rounded-lg p-3"><p className="text-slate-500 text-xs">% of Revenue</p><p className="text-white text-xl font-bold">{data.shopify.revenue > 0 ? ((data.shopify.threeplCosts / data.shopify.revenue) * 100).toFixed(1) : 0}%</p></div>{data.shopify.threeplMetrics?.orderCount > 0 && (<><div className="bg-cyan-900/30 rounded-lg p-3 border border-cyan-500/30"><p className="text-cyan-400 text-xs">Orders</p><p className="text-cyan-300 text-xl font-bold">{formatNumber(data.shopify.threeplMetrics.orderCount)}</p></div><div className="bg-cyan-900/30 rounded-lg p-3 border border-cyan-500/30"><p className="text-cyan-400 text-xs">Avg Cost/Order</p><p className="text-cyan-300 text-xl font-bold">{formatCurrency(data.shopify.threeplMetrics.avgCostPerOrder)}</p></div></>)}</div>{data.shopify.threeplBreakdown && (<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">{data.shopify.threeplBreakdown.shipping > 0 && <div className="bg-slate-900/50 rounded-lg p-2"><p className="text-slate-500 text-xs">Shipping</p><p className="text-blue-400 font-semibold">{formatCurrency(data.shopify.threeplBreakdown.shipping)}</p></div>}{data.shopify.threeplBreakdown.pickFees > 0 && <div className="bg-slate-900/50 rounded-lg p-2"><p className="text-slate-500 text-xs">Pick Fees</p><p className="text-emerald-400 font-semibold">{formatCurrency(data.shopify.threeplBreakdown.pickFees)}</p></div>}{data.shopify.threeplBreakdown.storage > 0 && <div className="bg-slate-900/50 rounded-lg p-2"><p className="text-slate-500 text-xs">Storage</p><p className="text-violet-400 font-semibold">{formatCurrency(data.shopify.threeplBreakdown.storage)}</p></div>}{data.shopify.threeplBreakdown.boxCharges > 0 && <div className="bg-slate-900/50 rounded-lg p-2"><p className="text-slate-500 text-xs">Packaging</p><p className="text-amber-400 font-semibold">{formatCurrency(data.shopify.threeplBreakdown.boxCharges)}</p></div>}{data.shopify.threeplBreakdown.receiving > 0 && <div className="bg-slate-900/50 rounded-lg p-2"><p className="text-slate-500 text-xs">Receiving</p><p className="text-slate-300 font-semibold">{formatCurrency(data.shopify.threeplBreakdown.receiving)}</p></div>}{data.shopify.threeplBreakdown.other > 0 && <div className="bg-slate-900/50 rounded-lg p-2"><p className="text-slate-500 text-xs">Other</p><p className="text-slate-300 font-semibold">{formatCurrency(data.shopify.threeplBreakdown.other)}</p></div>}</div>)}{data.shopify.threeplMetrics?.orderCount > 0 && (<div className="border-t border-slate-700 pt-4"><h4 className="text-sm font-semibold text-cyan-400 mb-3">📦 Order Metrics</h4><div className="grid grid-cols-2 md:grid-cols-4 gap-3"><div className="bg-slate-900/50 rounded-lg p-2"><p className="text-slate-500 text-xs">Units Picked</p><p className="text-white font-semibold">{formatNumber(data.shopify.threeplMetrics.totalUnits)}</p></div><div className="bg-slate-900/50 rounded-lg p-2"><p className="text-slate-500 text-xs">Avg Units/Order</p><p className="text-white font-semibold">{data.shopify.threeplMetrics.avgUnitsPerOrder?.toFixed(1) || '—'}</p></div><div className="bg-slate-900/50 rounded-lg p-2"><p className="text-slate-500 text-xs">Avg Ship Cost</p><p className="text-white font-semibold">{formatCurrency(data.shopify.threeplMetrics.avgShippingCost)}</p></div><div className="bg-slate-900/50 rounded-lg p-2"><p className="text-slate-500 text-xs">Avg Pick Cost</p><p className="text-white font-semibold">{formatCurrency(data.shopify.threeplMetrics.avgPickCost)}</p></div></div></div>)}</>) : (<div className="text-center py-6"><Truck className="w-12 h-12 text-slate-600 mx-auto mb-3" /><p className="text-slate-400">No 3PL data for this period</p><p className="text-slate-500 text-sm mt-1">Click "Update 3PL/Ads" to add 3PL cost files</p></div>)}
            </div>
          )}
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><ChannelCard title="Amazon" color="orange" data={data.amazon} isAmz showSkuTable /><ChannelCard title="Shopify" color="blue" data={data.shopify} showSkuTable /></div>
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
        <div className="max-w-7xl mx-auto"><Toast /><ValidationModal />{aiChatUI}{aiChatButton}<CogsManager /><ProductCatalogModal /><UploadHelpModal /><ForecastModal /><BreakEvenModal /><ExportModal /><ComparisonView /><InvoiceModal /><GoalsModal />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div><h1 className="text-2xl lg:text-3xl font-bold text-white">Inventory</h1><p className="text-slate-400">{new Date(selectedInvDate+'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p></div>
            <div className="flex gap-2">
              <button onClick={() => { setUploadTab('inventory'); setView('upload'); }} className="bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm"><RefreshCw className="w-4 h-4 inline mr-1" />New</button>
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
          
          {/* Smart Inventory Forecast Section */}
          <div className="mt-8 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-6 h-6 text-emerald-400" />
                  Smart Inventory Forecast
                </h2>
                <p className="text-slate-400 text-sm">AI-powered predictions using historical data, Amazon forecasts, and production pipeline</p>
              </div>
              <button 
                onClick={async () => {
                  // Gather all the data for AI analysis
                  const inventoryItems = data.items || [];
                  const sortedWeeks = Object.keys(allWeeksData).sort();
                  const recentWeeks = sortedWeeks.slice(-12);
                  
                  // Build velocity history per SKU
                  const skuVelocityHistory = {};
                  recentWeeks.forEach(week => {
                    const weekData = allWeeksData[week];
                    [...(weekData?.amazon?.skus || []), ...(weekData?.shopify?.skus || [])].forEach(sku => {
                      if (!skuVelocityHistory[sku.sku]) skuVelocityHistory[sku.sku] = [];
                      skuVelocityHistory[sku.sku].push({ week, units: sku.units || 0 });
                    });
                  });
                  
                  // Get Amazon forecasts
                  const amazonForecastData = upcomingAmazonForecasts.length > 0 ? upcomingAmazonForecasts[0] : null;
                  
                  // Get production pipeline
                  const pendingProduction = productionPipeline.filter(p => p.status !== 'received');
                  
                  // Build context for AI
                  const analysisContext = {
                    currentInventory: inventoryItems.slice(0, 30).map(i => ({
                      sku: i.sku,
                      name: i.name,
                      totalQty: i.totalQty,
                      weeklyVelocity: i.weeklyVel,
                      daysOfSupply: i.daysOfSupply,
                      health: i.health
                    })),
                    velocityTrends: Object.entries(skuVelocityHistory).slice(0, 20).map(([sku, history]) => ({
                      sku,
                      avgVelocity: history.reduce((s, h) => s + h.units, 0) / Math.max(history.length, 1),
                      trend: history.length >= 4 ? (history.slice(-2).reduce((s, h) => s + h.units, 0) / 2) - (history.slice(0, 2).reduce((s, h) => s + h.units, 0) / 2) : 0
                    })),
                    amazonForecast: amazonForecastData ? {
                      weekEnding: amazonForecastData.weekEnding,
                      projectedUnits: amazonForecastData.totals.units,
                      projectedRevenue: amazonForecastData.totals.sales,
                      topSkus: Object.entries(amazonForecastData.skus || {}).slice(0, 10).map(([sku, data]) => ({ sku, units: data.units }))
                    } : null,
                    productionPipeline: pendingProduction.map(p => ({
                      sku: p.sku,
                      product: p.productName,
                      quantity: p.quantity,
                      expectedDate: p.expectedDate,
                      daysUntil: p.expectedDate ? Math.ceil((new Date(p.expectedDate) - new Date()) / (1000 * 60 * 60 * 24)) : null
                    })),
                    forecastAccuracy: getAmazonForecastComparison.length > 0 ? {
                      avgAccuracy: (100 - Math.abs(getAmazonForecastComparison.reduce((s, c) => s + c.variance.revenuePercent, 0) / getAmazonForecastComparison.length)).toFixed(1),
                      samples: getAmazonForecastComparison.length
                    } : null
                  };
                  
                  setAiInput('');
                  setShowAiChat(true);
                  setAiMessages(prev => [...prev, { 
                    role: 'user', 
                    content: `Analyze my inventory and provide a smart forecast. Here's my data:\n\n${JSON.stringify(analysisContext, null, 2)}\n\nPlease:\n1. Identify which SKUs are at risk of stockout\n2. Factor in the production pipeline timing\n3. Compare current velocity vs Amazon's forecast\n4. Give me a prioritized reorder recommendation\n5. Flag any SKUs where production won't arrive in time`
                  }]);
                  
                  // Trigger AI analysis
                  try {
                    const response = await fetch('/api/chat', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        messages: [{
                          role: 'user',
                          content: `You are an inventory planning expert. Analyze this e-commerce inventory data and provide actionable recommendations.

DATA:
${JSON.stringify(analysisContext, null, 2)}

Provide a concise analysis covering:
1. **Stockout Risk** - Which SKUs will run out first and when
2. **Production Timing** - Will incoming production arrive before stockouts?
3. **Velocity Analysis** - Are sales trending up/down? How does this compare to Amazon's forecast?
4. **Reorder Priority** - Ranked list of what to reorder first
5. **Specific Actions** - What should I do this week?

Be specific with SKU names and numbers. Use bullet points for clarity.`
                        }]
                      })
                    });
                    const result = await response.json();
                    setAiMessages(prev => [...prev, { 
                      role: 'assistant', 
                      content: result.content?.[0]?.text || result.choices?.[0]?.message?.content || 'Unable to generate forecast analysis.'
                    }]);
                  } catch (err) {
                    setAiMessages(prev => [...prev, { 
                      role: 'assistant', 
                      content: 'Error generating forecast. Please try again.'
                    }]);
                  }
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm text-white flex items-center gap-2"
              >
                <Zap className="w-4 h-4" />Run AI Forecast Analysis
              </button>
            </div>
            
            {/* Forecast Data Sources */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              {/* Historical Velocity */}
              <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-5 h-5 text-blue-400" />
                  <span className="text-blue-400 font-medium text-sm">Historical Data</span>
                </div>
                <p className="text-2xl font-bold text-white">{Object.keys(allWeeksData).length} weeks</p>
                <p className="text-slate-400 text-xs">Sales velocity baseline</p>
              </div>
              
              {/* Amazon Forecast */}
              <div className={`rounded-xl border p-4 ${upcomingAmazonForecasts.length > 0 ? 'bg-orange-900/20 border-orange-500/30' : 'bg-slate-800/50 border-slate-700'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-5 h-5 text-orange-400" />
                  <span className="text-orange-400 font-medium text-sm">Amazon Forecast</span>
                </div>
                {upcomingAmazonForecasts.length > 0 ? (
                  <>
                    <p className="text-2xl font-bold text-white">{formatNumber(upcomingAmazonForecasts[0].totals.units)} units</p>
                    <p className="text-slate-400 text-xs">Projected next week</p>
                  </>
                ) : (
                  <>
                    <p className="text-slate-500 text-lg">Not uploaded</p>
                    <button onClick={() => { setUploadTab('forecast'); setView('upload'); }} className="text-orange-400 text-xs hover:underline">Upload forecast →</button>
                  </>
                )}
              </div>
              
              {/* Production Pipeline */}
              <div className={`rounded-xl border p-4 ${productionPipeline.filter(p => p.status !== 'received').length > 0 ? 'bg-cyan-900/20 border-cyan-500/30' : 'bg-slate-800/50 border-slate-700'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Truck className="w-5 h-5 text-cyan-400" />
                  <span className="text-cyan-400 font-medium text-sm">Incoming Production</span>
                </div>
                {productionPipeline.filter(p => p.status !== 'received').length > 0 ? (
                  <>
                    <p className="text-2xl font-bold text-white">{formatNumber(productionPipeline.filter(p => p.status !== 'received').reduce((s, p) => s + (p.quantity || 0), 0))} units</p>
                    <p className="text-slate-400 text-xs">{productionPipeline.filter(p => p.status !== 'received').length} orders pending</p>
                  </>
                ) : (
                  <>
                    <p className="text-slate-500 text-lg">None tracked</p>
                    <p className="text-slate-500 text-xs">Add production below</p>
                  </>
                )}
              </div>
              
              {/* Forecast Accuracy */}
              <div className={`rounded-xl border p-4 ${getAmazonForecastComparison.length > 0 ? 'bg-emerald-900/20 border-emerald-500/30' : 'bg-slate-800/50 border-slate-700'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-5 h-5 text-emerald-400" />
                  <span className="text-emerald-400 font-medium text-sm">Forecast Accuracy</span>
                </div>
                {getAmazonForecastComparison.length > 0 ? (
                  <>
                    <p className="text-2xl font-bold text-white">
                      {(100 - Math.abs(getAmazonForecastComparison.reduce((s, c) => s + c.variance.revenuePercent, 0) / getAmazonForecastComparison.length)).toFixed(0)}%
                    </p>
                    <p className="text-slate-400 text-xs">Based on {getAmazonForecastComparison.length} weeks</p>
                  </>
                ) : (
                  <>
                    <p className="text-slate-500 text-lg">No data yet</p>
                    <p className="text-slate-500 text-xs">Upload actuals after forecasts</p>
                  </>
                )}
              </div>
            </div>
            
            {/* Critical Items Quick View */}
            {(() => {
              const criticalItems = data.items.filter(i => i.daysOfSupply < 30 && i.daysOfSupply !== 999 && i.daysOfSupply > 0);
              const incomingForCritical = criticalItems.map(item => {
                const incoming = productionPipeline.find(p => p.sku === item.sku && p.status !== 'received');
                return { ...item, incoming };
              });
              
              if (criticalItems.length === 0) return (
                <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                    <span className="text-emerald-400 font-medium">All inventory levels healthy!</span>
                  </div>
                  <p className="text-slate-400 text-sm mt-1">No SKUs are critically low on stock.</p>
                </div>
              );
              
              return (
                <div className="bg-rose-900/20 border border-rose-500/30 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-rose-400" />
                      <span className="text-rose-400 font-semibold">Critical Stock Alert: {criticalItems.length} SKUs</span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-slate-500 text-xs border-b border-slate-700">
                          <th className="text-left pb-2">SKU</th>
                          <th className="text-right pb-2">Stock</th>
                          <th className="text-right pb-2">Velocity/wk</th>
                          <th className="text-right pb-2">Days Left</th>
                          <th className="text-left pb-2 pl-3">Incoming Production</th>
                          <th className="text-left pb-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {incomingForCritical.sort((a, b) => a.daysOfSupply - b.daysOfSupply).slice(0, 10).map(item => {
                          const willArrive = item.incoming?.expectedDate ? Math.ceil((new Date(item.incoming.expectedDate) - new Date()) / (1000 * 60 * 60 * 24)) : null;
                          const willStockOut = willArrive !== null && willArrive > item.daysOfSupply;
                          return (
                            <tr key={item.sku} className="border-t border-slate-700/50">
                              <td className="py-2 text-white font-mono">{item.sku}</td>
                              <td className="py-2 text-right text-white">{formatNumber(item.totalQty)}</td>
                              <td className="py-2 text-right text-slate-400">{item.weeklyVel.toFixed(1)}</td>
                              <td className="py-2 text-right text-rose-400 font-bold">{item.daysOfSupply}</td>
                              <td className="py-2 pl-3">
                                {item.incoming ? (
                                  <span className="text-cyan-400">
                                    {formatNumber(item.incoming.quantity)} units in {willArrive}d
                                  </span>
                                ) : (
                                  <span className="text-slate-500">None scheduled</span>
                                )}
                              </td>
                              <td className="py-2">
                                {item.incoming ? (
                                  willStockOut ? (
                                    <span className="text-xs bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded">⚠️ Will stockout</span>
                                  ) : (
                                    <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">✓ Covered</span>
                                  )
                                ) : (
                                  <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">Order now</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
          
          {/* Production Pipeline Section */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Truck className="w-6 h-6 text-cyan-400" />
                  Production Pipeline
                </h2>
                <p className="text-slate-400 text-sm">Track upcoming inventory from manufacturers</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setProductionForm({ sku: '', productName: '', quantity: '', expectedDate: '', notes: '' }); setEditingProduction(null); setShowAddProduction(true); }} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm text-white flex items-center gap-2">
                  <Plus className="w-4 h-4" />Add Production
                </button>
              </div>
            </div>
            
            {/* AI Extract from File */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 mb-4">
              <p className="text-slate-300 text-sm mb-3">📄 Have a production order or PO? Upload it and AI will extract the data:</p>
              <div className="flex items-center gap-3">
                <label className={`flex-1 border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all ${productionFile ? 'border-cyan-500/50 bg-cyan-950/20' : 'border-slate-600 hover:border-slate-500'}`}>
                  <input type="file" accept=".csv,.xlsx,.xls,.pdf,.txt" onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      setProductionFileName(file.name);
                      const reader = new FileReader();
                      reader.onload = (ev) => setProductionFile(ev.target.result);
                      reader.readAsText(file);
                    }
                  }} className="hidden" />
                  <div className="flex items-center justify-center gap-2">
                    {productionFile ? <Check className="w-5 h-5 text-cyan-400" /> : <Upload className="w-5 h-5 text-slate-400" />}
                    <span className={productionFile ? 'text-cyan-400' : 'text-slate-400'}>{productionFile ? productionFileName : 'Upload PO, invoice, or CSV'}</span>
                  </div>
                </label>
                {productionFile && (
                  <button 
                    onClick={async () => {
                      if (!productionFile) return;
                      setExtractingProduction(true);
                      try {
                        const response = await fetch('/api/chat', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            messages: [{
                              role: 'user',
                              content: `Extract production/manufacturing order data from this document. Return ONLY a JSON array with objects containing: sku, productName, quantity (number), expectedDate (YYYY-MM-DD format), notes (optional). If you can't find a date, use empty string. If you can't find SKU, use the product name. Here's the document:\n\n${productionFile}`
                            }]
                          })
                        });
                        const data = await response.json();
                        // Try to parse JSON from the response
                        const text = data.choices?.[0]?.message?.content || data.content || '';
                        const jsonMatch = text.match(/\[[\s\S]*\]/);
                        if (jsonMatch) {
                          const extracted = JSON.parse(jsonMatch[0]);
                          if (Array.isArray(extracted) && extracted.length > 0) {
                            // Add each extracted item to pipeline
                            const newItems = extracted.map(item => ({
                              id: Date.now() + Math.random(),
                              sku: item.sku || '',
                              productName: item.productName || item.product_name || item.name || '',
                              quantity: parseInt(item.quantity) || 0,
                              expectedDate: item.expectedDate || item.expected_date || item.date || '',
                              notes: item.notes || '',
                              status: 'pending',
                              createdAt: new Date().toISOString()
                            }));
                            setProductionPipeline(prev => [...prev, ...newItems]);
                            setToast({ message: `Extracted ${newItems.length} production items`, type: 'success' });
                            setProductionFile(null);
                            setProductionFileName('');
                          } else {
                            setToast({ message: 'No production data found in file', type: 'error' });
                          }
                        } else {
                          setToast({ message: 'Could not parse production data', type: 'error' });
                        }
                      } catch (err) {
                        setToast({ message: 'Error extracting data: ' + err.message, type: 'error' });
                      }
                      setExtractingProduction(false);
                    }}
                    disabled={extractingProduction}
                    className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 rounded-lg text-sm text-white flex items-center gap-2"
                  >
                    {extractingProduction ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    {extractingProduction ? 'Extracting...' : 'Extract with AI'}
                  </button>
                )}
              </div>
            </div>
            
            {/* Add/Edit Production Modal */}
            {showAddProduction && (
              <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-md w-full">
                  <h3 className="text-lg font-semibold text-white mb-4">{editingProduction ? 'Edit Production' : 'Add Production'}</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">SKU</label>
                      <input type="text" value={productionForm.sku} onChange={(e) => setProductionForm(p => ({ ...p, sku: e.target.value }))} placeholder="ABC-123" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white" />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Product Name</label>
                      <input type="text" value={productionForm.productName} onChange={(e) => setProductionForm(p => ({ ...p, productName: e.target.value }))} placeholder="Product description" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white" />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Quantity Being Made</label>
                      <input type="number" value={productionForm.quantity} onChange={(e) => setProductionForm(p => ({ ...p, quantity: e.target.value }))} placeholder="1000" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white" />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Expected Ready Date</label>
                      <input type="date" value={productionForm.expectedDate} onChange={(e) => setProductionForm(p => ({ ...p, expectedDate: e.target.value }))} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white" />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Notes (optional)</label>
                      <textarea value={productionForm.notes} onChange={(e) => setProductionForm(p => ({ ...p, notes: e.target.value }))} placeholder="Manufacturer, PO number, etc." rows={2} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white" />
                    </div>
                  </div>
                  <div className="flex gap-3 mt-6">
                    <button onClick={() => {
                      if (!productionForm.sku && !productionForm.productName) {
                        setToast({ message: 'SKU or Product Name required', type: 'error' });
                        return;
                      }
                      if (editingProduction) {
                        setProductionPipeline(prev => prev.map(p => p.id === editingProduction ? { ...p, ...productionForm, quantity: parseInt(productionForm.quantity) || 0 } : p));
                        setToast({ message: 'Production updated', type: 'success' });
                      } else {
                        const newItem = {
                          id: Date.now(),
                          ...productionForm,
                          quantity: parseInt(productionForm.quantity) || 0,
                          status: 'pending',
                          createdAt: new Date().toISOString()
                        };
                        setProductionPipeline(prev => [...prev, newItem]);
                        setToast({ message: 'Production added', type: 'success' });
                      }
                      setShowAddProduction(false);
                      setEditingProduction(null);
                    }} className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-2 rounded-lg">
                      {editingProduction ? 'Save Changes' : 'Add to Pipeline'}
                    </button>
                    <button onClick={() => { setShowAddProduction(false); setEditingProduction(null); }} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-lg">Cancel</button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Production Pipeline Table */}
            {productionPipeline.length > 0 ? (
              <div className="bg-slate-800/50 rounded-2xl border border-slate-700 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-900/50">
                    <tr>
                      <th className="text-left px-4 py-3 text-slate-400 text-xs uppercase">SKU</th>
                      <th className="text-left px-4 py-3 text-slate-400 text-xs uppercase">Product</th>
                      <th className="text-right px-4 py-3 text-slate-400 text-xs uppercase">Quantity</th>
                      <th className="text-left px-4 py-3 text-slate-400 text-xs uppercase">Expected Date</th>
                      <th className="text-left px-4 py-3 text-slate-400 text-xs uppercase">Status</th>
                      <th className="text-center px-4 py-3 text-slate-400 text-xs uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productionPipeline.sort((a, b) => new Date(a.expectedDate || '9999-12-31') - new Date(b.expectedDate || '9999-12-31')).map(item => {
                      const daysUntil = item.expectedDate ? Math.ceil((new Date(item.expectedDate) - new Date()) / (1000 * 60 * 60 * 24)) : null;
                      return (
                        <tr key={item.id} className="border-t border-slate-700/50 hover:bg-slate-700/20">
                          <td className="px-4 py-3 text-white font-mono text-sm">{item.sku || '—'}</td>
                          <td className="px-4 py-3 text-white text-sm max-w-[200px] truncate" title={item.productName}>{item.productName || '—'}</td>
                          <td className="px-4 py-3 text-right text-cyan-400 font-semibold">{formatNumber(item.quantity)}</td>
                          <td className="px-4 py-3 text-sm">
                            {item.expectedDate ? (
                              <span className={daysUntil <= 7 ? 'text-emerald-400' : daysUntil <= 30 ? 'text-amber-400' : 'text-slate-300'}>
                                {new Date(item.expectedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                {daysUntil !== null && <span className="text-slate-500 text-xs ml-2">({daysUntil <= 0 ? 'Due!' : `${daysUntil}d`})</span>}
                              </span>
                            ) : <span className="text-slate-500">TBD</span>}
                          </td>
                          <td className="px-4 py-3">
                            <select 
                              value={item.status || 'pending'} 
                              onChange={(e) => setProductionPipeline(prev => prev.map(p => p.id === item.id ? { ...p, status: e.target.value } : p))}
                              className={`text-xs px-2 py-1 rounded-lg border-0 ${
                                item.status === 'received' ? 'bg-emerald-500/20 text-emerald-400' :
                                item.status === 'shipped' ? 'bg-blue-500/20 text-blue-400' :
                                item.status === 'in_production' ? 'bg-amber-500/20 text-amber-400' :
                                'bg-slate-700 text-slate-300'
                              }`}
                            >
                              <option value="pending">Pending</option>
                              <option value="in_production">In Production</option>
                              <option value="shipped">Shipped</option>
                              <option value="received">Received</option>
                            </select>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => {
                                setProductionForm({
                                  sku: item.sku || '',
                                  productName: item.productName || '',
                                  quantity: item.quantity?.toString() || '',
                                  expectedDate: item.expectedDate || '',
                                  notes: item.notes || ''
                                });
                                setEditingProduction(item.id);
                                setShowAddProduction(true);
                              }} className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white">
                                <Settings className="w-4 h-4" />
                              </button>
                              <button onClick={() => {
                                if (confirm('Delete this production item?')) {
                                  setProductionPipeline(prev => prev.filter(p => p.id !== item.id));
                                  setToast({ message: 'Production item deleted', type: 'success' });
                                }
                              }} className="p-1.5 hover:bg-rose-900/50 rounded text-slate-400 hover:text-rose-400">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {/* Summary */}
                <div className="bg-slate-900/50 px-4 py-3 border-t border-slate-700">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">{productionPipeline.length} production orders</span>
                    <span className="text-cyan-400 font-semibold">{formatNumber(productionPipeline.reduce((s, p) => s + (p.quantity || 0), 0))} total units incoming</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-800/30 rounded-2xl border border-dashed border-slate-600 p-8 text-center">
                <Truck className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 mb-2">No production orders tracked</p>
                <p className="text-slate-500 text-sm">Add upcoming manufacturing runs to track incoming inventory</p>
              </div>
            )}
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
        <div className="max-w-7xl mx-auto"><Toast /><ValidationModal />{aiChatUI}{aiChatButton}<CogsManager /><ProductCatalogModal /><UploadHelpModal /><ForecastModal /><BreakEvenModal /><ExportModal /><ComparisonView /><InvoiceModal /><GoalsModal />
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
        <div className="max-w-7xl mx-auto"><Toast /><ValidationModal />{aiChatUI}{aiChatButton}<CogsManager /><ProductCatalogModal /><UploadHelpModal /><ForecastModal /><BreakEvenModal /><ExportModal /><ComparisonView /><InvoiceModal /><GoalsModal />
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

  // ==================== 3PL ANALYTICS VIEW ====================
  if (view === '3pl') {
    const sortedWeeks = Object.keys(allWeeksData).sort();
    
    // Aggregate 3PL data by week
    const weeklyData = sortedWeeks.map(w => {
      const week = allWeeksData[w];
      const metrics = week.shopify?.threeplMetrics || {};
      const breakdown = week.shopify?.threeplBreakdown || {};
      return {
        week: w,
        type: 'week',
        label: new Date(w + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        totalCost: week.shopify?.threeplCosts || 0,
        orderCount: metrics.orderCount || 0,
        totalUnits: metrics.totalUnits || 0,
        avgCostPerOrder: metrics.avgCostPerOrder || 0,
        avgShippingCost: metrics.avgShippingCost || 0,
        avgPickCost: metrics.avgPickCost || 0,
        avgPackagingCost: metrics.avgPackagingCost || 0,
        avgUnitsPerOrder: metrics.avgUnitsPerOrder || 0,
        storage: breakdown.storage || 0,
        shipping: breakdown.shipping || 0,
        pickFees: breakdown.pickFees || 0,
        boxCharges: breakdown.boxCharges || 0,
        receiving: breakdown.receiving || 0,
        revenue: week.shopify?.revenue || 0,
      };
    }).filter(d => d.totalCost > 0);
    
    // Also get Period 3PL data
    const periodData = Object.entries(allPeriodsData).map(([key, period]) => {
      const metrics = period.shopify?.threeplMetrics || {};
      const breakdown = period.shopify?.threeplBreakdown || {};
      return {
        period: key,
        type: 'period',
        label: period.label || key,
        totalCost: period.shopify?.threeplCosts || 0,
        orderCount: metrics.orderCount || 0,
        totalUnits: metrics.totalUnits || 0,
        avgCostPerOrder: metrics.avgCostPerOrder || 0,
        avgShippingCost: metrics.avgShippingCost || 0,
        avgPickCost: metrics.avgPickCost || 0,
        avgPackagingCost: metrics.avgPackagingCost || 0,
        avgUnitsPerOrder: metrics.avgUnitsPerOrder || 0,
        storage: breakdown.storage || 0,
        shipping: breakdown.shipping || 0,
        pickFees: breakdown.pickFees || 0,
        boxCharges: breakdown.boxCharges || 0,
        receiving: breakdown.receiving || 0,
        revenue: period.shopify?.revenue || 0,
      };
    }).filter(d => d.totalCost > 0);
    
    // Aggregate by month (weekly data only)
    const monthlyData = {};
    weeklyData.forEach(w => {
      const month = w.week.substring(0, 7);
      if (!monthlyData[month]) {
        monthlyData[month] = { 
          month, totalCost: 0, orderCount: 0, totalUnits: 0, 
          storage: 0, shipping: 0, pickFees: 0, boxCharges: 0, receiving: 0,
          revenue: 0, weeks: 0
        };
      }
      monthlyData[month].totalCost += w.totalCost;
      monthlyData[month].orderCount += w.orderCount;
      monthlyData[month].totalUnits += w.totalUnits;
      monthlyData[month].storage += w.storage;
      monthlyData[month].shipping += w.shipping;
      monthlyData[month].pickFees += w.pickFees;
      monthlyData[month].boxCharges += w.boxCharges;
      monthlyData[month].receiving += w.receiving;
      monthlyData[month].revenue += w.revenue;
      monthlyData[month].weeks += 1;
    });
    
    // Calculate averages for monthly data
    Object.values(monthlyData).forEach(m => {
      m.avgCostPerOrder = m.orderCount > 0 ? (m.totalCost - m.storage) / m.orderCount : 0;
      m.avgUnitsPerOrder = m.orderCount > 0 ? m.totalUnits / m.orderCount : 0;
      m.costAsPercentOfRevenue = m.revenue > 0 ? (m.totalCost / m.revenue) * 100 : 0;
    });
    
    const months = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));
    
    // Recent 4 weeks totals
    const recentWeeks = weeklyData.slice(-4);
    const recentTotals = recentWeeks.reduce((acc, w) => ({
      totalCost: acc.totalCost + w.totalCost,
      orderCount: acc.orderCount + w.orderCount,
      totalUnits: acc.totalUnits + w.totalUnits,
      storage: acc.storage + w.storage,
      shipping: acc.shipping + w.shipping,
      pickFees: acc.pickFees + w.pickFees,
      boxCharges: acc.boxCharges + w.boxCharges,
      revenue: acc.revenue + w.revenue,
    }), { totalCost: 0, orderCount: 0, totalUnits: 0, storage: 0, shipping: 0, pickFees: 0, boxCharges: 0, revenue: 0 });
    
    recentTotals.avgCostPerOrder = recentTotals.orderCount > 0 ? (recentTotals.totalCost - recentTotals.storage) / recentTotals.orderCount : 0;
    recentTotals.avgUnitsPerOrder = recentTotals.orderCount > 0 ? recentTotals.totalUnits / recentTotals.orderCount : 0;
    recentTotals.costAsPercentOfRevenue = recentTotals.revenue > 0 ? (recentTotals.totalCost / recentTotals.revenue) * 100 : 0;
    
    // Find max for chart scaling
    const maxWeeklyCost = Math.max(...weeklyData.map(d => d.totalCost), 1);
    const maxMonthlyCost = Math.max(...months.map(d => d.totalCost), 1);
    
    // Use component-level state for time view toggle
    const timeView = threeplTimeView;
    const setTimeView = setThreeplTimeView;
    
    // Check if we have any 3PL data at all
    const hasWeeklyData = weeklyData.length > 0;
    const hasPeriodData = periodData.length > 0;
    
    if (!hasWeeklyData && !hasPeriodData) {
      return (
        <div className="min-h-screen bg-slate-950 p-4 lg:p-6">
          <div className="max-w-7xl mx-auto"><Toast /><ValidationModal />{aiChatUI}{aiChatButton}<CogsManager /><ProductCatalogModal /><UploadHelpModal /><ForecastModal /><BreakEvenModal /><ExportModal /><ComparisonView /><InvoiceModal /><GoalsModal />
            <NavTabs />{dataBar}
            <div className="text-center py-12">
              <Truck className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">No 3PL Data Yet</h2>
              <p className="text-slate-400 mb-4">Upload data with 3PL files to see fulfillment analytics</p>
              <div className="text-slate-500 text-sm">
                <p>When uploading weekly or period data, include your 3PL CSV files</p>
                <p>to track shipping costs, order metrics, and fulfillment efficiency.</p>
              </div>
            </div>
          </div>
        </div>
      );
    }
    
    // If only period data, show a different view
    if (!hasWeeklyData && hasPeriodData) {
      return (
        <div className="min-h-screen bg-slate-950 p-4 lg:p-6">
          <div className="max-w-7xl mx-auto"><Toast /><ValidationModal />{aiChatUI}{aiChatButton}<CogsManager /><ProductCatalogModal /><UploadHelpModal /><ForecastModal /><BreakEvenModal /><ExportModal /><ComparisonView /><InvoiceModal /><GoalsModal />
            <NavTabs />{dataBar}
            
            <div className="mb-6">
              <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">🚚 3PL Fulfillment Analytics</h1>
              <p className="text-slate-400">Period-level 3PL data (upload weekly data for trend charts)</p>
            </div>
            
            {/* Period 3PL Summary */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">Period 3PL Summary</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left text-slate-400 py-2">Period</th>
                      <th className="text-right text-slate-400 py-2">Total 3PL</th>
                      <th className="text-right text-slate-400 py-2">Orders</th>
                      <th className="text-right text-slate-400 py-2">Units</th>
                      <th className="text-right text-slate-400 py-2">Avg/Order</th>
                      <th className="text-right text-slate-400 py-2">Shipping</th>
                      <th className="text-right text-slate-400 py-2">Pick Fees</th>
                      <th className="text-right text-slate-400 py-2">Storage</th>
                      <th className="text-right text-slate-400 py-2">% of Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodData.map(d => {
                      const pctOfRev = d.revenue > 0 ? (d.totalCost / d.revenue) * 100 : 0;
                      return (
                        <tr key={d.period} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                          <td className="py-3 text-white font-medium">{d.label}</td>
                          <td className="py-3 text-right text-white font-semibold">{formatCurrency(d.totalCost)}</td>
                          <td className="py-3 text-right text-white">{d.orderCount > 0 ? formatNumber(d.orderCount) : '—'}</td>
                          <td className="py-3 text-right text-white">{d.totalUnits > 0 ? formatNumber(d.totalUnits) : '—'}</td>
                          <td className={`py-3 text-right font-semibold ${d.avgCostPerOrder > 0 ? (d.avgCostPerOrder <= 10 ? 'text-emerald-400' : d.avgCostPerOrder <= 15 ? 'text-amber-400' : 'text-rose-400') : 'text-slate-500'}`}>
                            {d.avgCostPerOrder > 0 ? formatCurrency(d.avgCostPerOrder) : '—'}
                          </td>
                          <td className="py-3 text-right text-blue-400">{formatCurrency(d.shipping)}</td>
                          <td className="py-3 text-right text-emerald-400">{formatCurrency(d.pickFees)}</td>
                          <td className="py-3 text-right text-violet-400">{formatCurrency(d.storage)}</td>
                          <td className={`py-3 text-right ${pctOfRev <= 10 ? 'text-emerald-400' : pctOfRev <= 15 ? 'text-amber-400' : 'text-rose-400'}`}>
                            {pctOfRev.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
              <p className="text-blue-400 text-sm">💡 <strong>Tip:</strong> Upload weekly data with 3PL files to see trend charts, week-over-week comparisons, and more detailed analytics.</p>
            </div>
          </div>
        </div>
      );
    }
    
    return (
      <div className="min-h-screen bg-slate-950 p-4 lg:p-6">
        <div className="max-w-7xl mx-auto"><Toast /><ValidationModal />{aiChatUI}{aiChatButton}<CogsManager /><ProductCatalogModal /><UploadHelpModal /><ForecastModal /><BreakEvenModal /><ExportModal /><ComparisonView /><InvoiceModal /><GoalsModal />
          <NavTabs />
          {dataBar}
          
          <div className="mb-6">
            <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">🚚 3PL Fulfillment Analytics</h1>
            <p className="text-slate-400">Track shipping costs, order metrics, and fulfillment efficiency over time</p>
          </div>
          
          {/* Summary Cards - Last 4 Weeks */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-900/30 to-slate-800/50 rounded-xl border border-blue-500/30 p-4">
              <p className="text-slate-400 text-sm">Total 3PL (4wk)</p>
              <p className="text-2xl font-bold text-white">{formatCurrency(recentTotals.totalCost)}</p>
              <p className="text-blue-400 text-xs">{recentTotals.costAsPercentOfRevenue.toFixed(1)}% of revenue</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">Orders</p>
              <p className="text-2xl font-bold text-white">{formatNumber(recentTotals.orderCount)}</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">Units Shipped</p>
              <p className="text-2xl font-bold text-white">{formatNumber(recentTotals.totalUnits)}</p>
            </div>
            <div className="bg-cyan-900/30 rounded-xl border border-cyan-500/30 p-4">
              <p className="text-cyan-400 text-sm">Avg Cost/Order</p>
              <p className="text-2xl font-bold text-cyan-300">{formatCurrency(recentTotals.avgCostPerOrder)}</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">Avg Units/Order</p>
              <p className="text-2xl font-bold text-white">{recentTotals.avgUnitsPerOrder.toFixed(1)}</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">Storage</p>
              <p className="text-2xl font-bold text-white">{formatCurrency(recentTotals.storage)}</p>
            </div>
          </div>
          
          {/* Time View Toggle */}
          <div className="flex gap-2 mb-4">
            <button onClick={() => setTimeView('weekly')} className={`px-4 py-2 rounded-lg text-sm font-medium ${timeView === 'weekly' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>Weekly</button>
            <button onClick={() => setTimeView('monthly')} className={`px-4 py-2 rounded-lg text-sm font-medium ${timeView === 'monthly' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>Monthly</button>
          </div>
          
          {/* Cost Trend Chart */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              {timeView === 'weekly' ? 'Weekly' : 'Monthly'} 3PL Costs
            </h3>
            <div className="flex items-end gap-1 h-48">
              {(timeView === 'weekly' ? weeklyData.slice(-12) : months.slice(-12)).map((d, i) => {
                const data = d;
                const height = timeView === 'weekly' 
                  ? (data.totalCost / maxWeeklyCost) * 100 
                  : (data.totalCost / maxMonthlyCost) * 100;
                const label = timeView === 'weekly' 
                  ? new Date(data.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : new Date(data.month + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                return (
                  <div key={timeView === 'weekly' ? data.week : data.month} className="flex-1 flex flex-col items-center group relative">
                    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-slate-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                      {label}<br/>
                      Total: {formatCurrency(data.totalCost)}<br/>
                      Orders: {formatNumber(data.orderCount)}<br/>
                      Avg/Order: {formatCurrency(data.avgCostPerOrder)}
                    </div>
                    <div className="w-full flex flex-col justify-end h-40">
                      {/* Stacked bar */}
                      <div className="w-full bg-violet-500 rounded-t" style={{ height: `${(data.storage / data.totalCost) * height}%` }} title="Storage" />
                      <div className="w-full bg-blue-500" style={{ height: `${(data.shipping / data.totalCost) * height}%` }} title="Shipping" />
                      <div className="w-full bg-emerald-500" style={{ height: `${(data.pickFees / data.totalCost) * height}%` }} title="Pick Fees" />
                      <div className="w-full bg-amber-500" style={{ height: `${(data.boxCharges / data.totalCost) * height}%` }} title="Packaging" />
                    </div>
                    <span className="text-[9px] text-slate-500 mt-1 truncate w-full text-center">{label}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-3 text-xs justify-center flex-wrap">
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-violet-500 rounded" />Storage</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded" />Shipping</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500 rounded" />Pick Fees</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-500 rounded" />Packaging</span>
            </div>
          </div>
          
          {/* Cost Per Order Trend */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">Average Cost Per Order Trend</h3>
            <div className="flex items-end gap-1 h-40">
              {(timeView === 'weekly' ? weeklyData.slice(-12) : months.slice(-12)).map((d) => {
                const maxAvg = Math.max(...(timeView === 'weekly' ? weeklyData : months).map(x => x.avgCostPerOrder), 1);
                const height = (d.avgCostPerOrder / maxAvg) * 100;
                const label = timeView === 'weekly' 
                  ? new Date(d.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : new Date(d.month + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                const color = d.avgCostPerOrder <= 10 ? 'bg-emerald-500' : d.avgCostPerOrder <= 15 ? 'bg-amber-500' : 'bg-rose-500';
                return (
                  <div key={timeView === 'weekly' ? d.week : d.month} className="flex-1 flex flex-col items-center group relative">
                    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-slate-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                      {label}: {formatCurrency(d.avgCostPerOrder)}/order
                    </div>
                    <div className={`w-full rounded-t transition-all hover:opacity-80 ${color}`} style={{ height: `${Math.max(height, 3)}%` }} />
                    <span className="text-[9px] text-slate-500 mt-1 truncate w-full text-center">{label}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-3 text-xs justify-center">
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500 rounded" />Great ($10 or less)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-500 rounded" />OK ($10-15)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-rose-500 rounded" />High ($15+)</span>
            </div>
          </div>
          
          {/* Detailed Table */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
            <h3 className="text-lg font-semibold text-white mb-4">{timeView === 'weekly' ? 'Weekly' : 'Monthly'} Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left text-slate-400 py-2">{timeView === 'weekly' ? 'Week' : 'Month'}</th>
                    <th className="text-right text-slate-400 py-2">Total</th>
                    <th className="text-right text-slate-400 py-2">Orders</th>
                    <th className="text-right text-slate-400 py-2">Units</th>
                    <th className="text-right text-slate-400 py-2">Avg/Order</th>
                    <th className="text-right text-slate-400 py-2">Shipping</th>
                    <th className="text-right text-slate-400 py-2">Pick Fees</th>
                    <th className="text-right text-slate-400 py-2">Packaging</th>
                    <th className="text-right text-slate-400 py-2">Storage</th>
                    <th className="text-right text-slate-400 py-2">% of Rev</th>
                  </tr>
                </thead>
                <tbody>
                  {(timeView === 'weekly' ? weeklyData.slice(-12).reverse() : months.slice(-12).reverse()).map(d => {
                    const pctOfRev = d.revenue > 0 ? (d.totalCost / d.revenue) * 100 : 0;
                    const label = timeView === 'weekly' 
                      ? new Date(d.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : new Date(d.month + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                    return (
                      <tr key={timeView === 'weekly' ? d.week : d.month} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="py-2 text-white">{label}</td>
                        <td className="py-2 text-right text-white font-medium">{formatCurrency(d.totalCost)}</td>
                        <td className="py-2 text-right text-white">{formatNumber(d.orderCount)}</td>
                        <td className="py-2 text-right text-white">{formatNumber(d.totalUnits)}</td>
                        <td className={`py-2 text-right font-semibold ${d.avgCostPerOrder <= 10 ? 'text-emerald-400' : d.avgCostPerOrder <= 15 ? 'text-amber-400' : 'text-rose-400'}`}>{formatCurrency(d.avgCostPerOrder)}</td>
                        <td className="py-2 text-right text-blue-400">{formatCurrency(d.shipping)}</td>
                        <td className="py-2 text-right text-emerald-400">{formatCurrency(d.pickFees)}</td>
                        <td className="py-2 text-right text-amber-400">{formatCurrency(d.boxCharges)}</td>
                        <td className="py-2 text-right text-violet-400">{formatCurrency(d.storage)}</td>
                        <td className={`py-2 text-right ${pctOfRev <= 10 ? 'text-emerald-400' : pctOfRev <= 15 ? 'text-amber-400' : 'text-rose-400'}`}>{pctOfRev.toFixed(1)}%</td>
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

  // ==================== SKU RANKINGS VIEW ====================
  if (view === 'skus') {
    const sortedWeeks = Object.keys(allWeeksData).sort();
    const recentWeeks = sortedWeeks.slice(-4);
    const olderWeeks = sortedWeeks.slice(-8, -4);
    
    // Aggregate SKU data across all weeks
    const skuAggregates = {};
    const skuRecentData = {};
    const skuOlderData = {};
    
    // NEW: Track weekly profit per unit for each SKU
    const skuWeeklyData = {}; // { sku: { weekDate: { units, revenue, profit, profitPerUnit, fees } } }
    
    sortedWeeks.forEach(w => {
      const week = allWeeksData[w];
      const isRecent = recentWeeks.includes(w);
      const isOlder = olderWeeks.includes(w);
      
      // Amazon SKUs
      (week.amazon?.skuData || []).forEach(s => {
        // Amazon: netProceeds IS the profit (already has COGS, fees, and ad spend deducted)
        const weekProceeds = s.netProceeds || 0;
        const weekProfit = weekProceeds;
        
        if (!skuAggregates[s.sku]) skuAggregates[s.sku] = { sku: s.sku, name: s.name, channel: 'Amazon', units: 0, revenue: 0, profit: 0, cogs: 0, weeks: 0 };
        skuAggregates[s.sku].units += s.unitsSold || 0;
        skuAggregates[s.sku].revenue += s.netSales || 0;
        skuAggregates[s.sku].cogs += s.cogs || 0;
        skuAggregates[s.sku].profit += weekProfit;
        skuAggregates[s.sku].weeks += 1;
        
        // Track weekly data for profit per unit trending
        if (!skuWeeklyData[s.sku]) skuWeeklyData[s.sku] = { sku: s.sku, name: s.name, channel: 'Amazon', weeks: {} };
        const weekUnits = s.unitsSold || 0;
        const weekRevenue = s.netSales || 0;
        const weekFees = weekRevenue - weekProceeds; // Amazon fees = net sales - net proceeds
        skuWeeklyData[s.sku].weeks[w] = {
          units: weekUnits,
          revenue: weekRevenue,
          proceeds: weekProceeds,
          cogs: s.cogs || 0,
          profit: weekProfit,
          fees: weekFees,
          profitPerUnit: weekUnits > 0 ? weekProfit / weekUnits : 0,
          feesPerUnit: weekUnits > 0 ? weekFees / weekUnits : 0,
          revenuePerUnit: weekUnits > 0 ? weekRevenue / weekUnits : 0,
        };
        
        if (isRecent) {
          if (!skuRecentData[s.sku]) skuRecentData[s.sku] = { units: 0, revenue: 0, profit: 0 };
          skuRecentData[s.sku].units += s.unitsSold || 0;
          skuRecentData[s.sku].revenue += s.netSales || 0;
          skuRecentData[s.sku].profit += weekProfit;
        }
        if (isOlder) {
          if (!skuOlderData[s.sku]) skuOlderData[s.sku] = { units: 0, revenue: 0, profit: 0 };
          skuOlderData[s.sku].units += s.unitsSold || 0;
          skuOlderData[s.sku].revenue += s.netSales || 0;
          skuOlderData[s.sku].profit += weekProfit;
        }
      });
      
      // Shopify SKUs
      (week.shopify?.skuData || []).forEach(s => {
        // Shopify: netSales already has discounts deducted, subtract COGS
        const weekProfit = (s.netSales || 0) - (s.cogs || 0);
        
        const key = 'shop_' + s.sku;
        if (!skuAggregates[key]) skuAggregates[key] = { sku: s.sku, name: s.name, channel: 'Shopify', units: 0, revenue: 0, profit: 0, cogs: 0, weeks: 0 };
        skuAggregates[key].units += s.unitsSold || 0;
        skuAggregates[key].revenue += s.netSales || 0;
        skuAggregates[key].cogs += s.cogs || 0;
        skuAggregates[key].profit += weekProfit;
        skuAggregates[key].weeks += 1;
        
        // Track weekly data for Shopify too
        if (!skuWeeklyData[key]) skuWeeklyData[key] = { sku: s.sku, name: s.name, channel: 'Shopify', weeks: {} };
        const weekUnits = s.unitsSold || 0;
        const weekRevenue = s.netSales || 0;
        skuWeeklyData[key].weeks[w] = {
          units: weekUnits,
          revenue: weekRevenue,
          cogs: s.cogs || 0,
          profit: weekProfit,
          fees: 0,
          profitPerUnit: weekUnits > 0 ? weekProfit / weekUnits : 0,
          feesPerUnit: 0,
          revenuePerUnit: weekUnits > 0 ? weekRevenue / weekUnits : 0,
        };
        
        if (isRecent) {
          if (!skuRecentData[key]) skuRecentData[key] = { units: 0, revenue: 0, profit: 0 };
          skuRecentData[key].units += s.unitsSold || 0;
          skuRecentData[key].revenue += s.netSales || 0;
          skuRecentData[key].profit += weekProfit;
        }
        if (isOlder) {
          if (!skuOlderData[key]) skuOlderData[key] = { units: 0, revenue: 0 };
          skuOlderData[key].units += s.unitsSold || 0;
          skuOlderData[key].revenue += s.netSales || 0;
        }
      });
    });
    
    // Calculate profit per unit trends (recent 4 weeks vs prior 4 weeks)
    const skuProfitTrends = Object.entries(skuWeeklyData)
      .filter(([key, data]) => data.channel === 'Amazon' && Object.keys(data.weeks).length >= 2)
      .map(([key, data]) => {
        const weekDates = Object.keys(data.weeks).sort();
        const recentWeekDates = weekDates.slice(-4);
        const olderWeekDates = weekDates.slice(-8, -4);
        
        // Calculate averages for recent and older periods
        let recentUnits = 0, recentProfit = 0, recentFees = 0;
        let olderUnits = 0, olderProfit = 0, olderFees = 0;
        
        recentWeekDates.forEach(w => {
          const d = data.weeks[w];
          recentUnits += d.units;
          recentProfit += d.profit;
          recentFees += d.fees;
        });
        
        olderWeekDates.forEach(w => {
          const d = data.weeks[w];
          olderUnits += d.units;
          olderProfit += d.profit;
          olderFees += d.fees;
        });
        
        const recentPPU = recentUnits > 0 ? recentProfit / recentUnits : 0;
        const olderPPU = olderUnits > 0 ? olderProfit / olderUnits : 0;
        const recentFPU = recentUnits > 0 ? recentFees / recentUnits : 0;
        const olderFPU = olderUnits > 0 ? olderFees / olderUnits : 0;
        
        const ppuChange = recentPPU - olderPPU;
        const ppuChangePercent = olderPPU !== 0 ? (ppuChange / Math.abs(olderPPU)) * 100 : 0;
        const fpuChange = recentFPU - olderFPU;
        
        return {
          sku: data.sku,
          name: data.name,
          channel: data.channel,
          weeklyData: weekDates.slice(-8).map(w => ({ week: w, ...data.weeks[w] })),
          recentPPU,
          olderPPU,
          ppuChange,
          ppuChangePercent,
          recentFPU,
          olderFPU,
          fpuChange,
          recentUnits,
          olderUnits,
          totalUnits: recentUnits + olderUnits,
        };
      })
      .filter(s => s.totalUnits >= 5) // Only SKUs with meaningful volume
      .sort((a, b) => a.ppuChange - b.ppuChange); // Sort by biggest decline first
    
    const decliningProfitability = skuProfitTrends.filter(s => s.ppuChange < -0.5).slice(0, 10);
    const improvingProfitability = skuProfitTrends.filter(s => s.ppuChange > 0.5).sort((a, b) => b.ppuChange - a.ppuChange).slice(0, 10);
    
    const allSkus = Object.values(skuAggregates).map(s => ({
      ...s,
      profitPerUnit: s.units > 0 ? s.profit / s.units : 0,
      margin: s.revenue > 0 ? (s.profit / s.revenue) * 100 : 0,
    }));
    const topByRevenue = [...allSkus].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const topByUnits = [...allSkus].sort((a, b) => b.units - a.units).slice(0, 10);
    const topByProfit = [...allSkus].sort((a, b) => b.profit - a.profit).slice(0, 10);
    const topByProfitPerUnit = [...allSkus].filter(s => s.units >= 5).sort((a, b) => b.profitPerUnit - a.profitPerUnit).slice(0, 10);
    
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
    
    const SkuTable = ({ data, title, icon, color, showProfit = false, showGrowth = false, showProfitPerUnit = false }) => (
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
                {showProfitPerUnit && <th className="text-right text-slate-400 font-medium py-2">$/Unit</th>}
                {showProfitPerUnit && <th className="text-right text-slate-400 font-medium py-2">Margin</th>}
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
                  {showProfitPerUnit && <td className={`py-2 text-right ${s.profitPerUnit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(s.profitPerUnit)}</td>}
                  {showProfitPerUnit && <td className={`py-2 text-right ${s.margin >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{s.margin.toFixed(1)}%</td>}
                  {showGrowth && <td className={`py-2 text-right ${s.growth >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{s.growth > 0 ? '+' : ''}{s.growth.toFixed(0)}%</td>}
                </tr>
              ))}
              {data.length === 0 && <tr><td colSpan={showProfit ? 6 : showProfitPerUnit ? 8 : showGrowth ? 6 : 5} className="py-4 text-center text-slate-500">No data available</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
    
    return (
      <div className="min-h-screen bg-slate-950 p-4 lg:p-6">
        <div className="max-w-7xl mx-auto"><Toast /><ValidationModal />{aiChatUI}{aiChatButton}<CogsManager /><ProductCatalogModal /><UploadHelpModal /><ForecastModal /><BreakEvenModal /><ExportModal /><ComparisonView /><InvoiceModal /><GoalsModal />
          <NavTabs />
          {dataBar}
          
          <div className="mb-6">
            <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">🏆 SKU Performance Rankings</h1>
            <p className="text-slate-400">Identify your best sellers, most profitable products, and trends</p>
          </div>
          
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
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
              <p className="text-3xl font-bold text-amber-400">{formatCurrency(allSkus.reduce((s, x) => s + x.profit, 0))}</p>
              <p className="text-slate-400 text-sm">Total Profit</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 text-center">
              <p className="text-3xl font-bold text-violet-400">
                {formatCurrency(allSkus.reduce((s, x) => s + x.units, 0) > 0 
                  ? allSkus.reduce((s, x) => s + x.profit, 0) / allSkus.reduce((s, x) => s + x.units, 0) 
                  : 0)}
              </p>
              <p className="text-slate-400 text-sm">Avg $/Unit Profit</p>
            </div>
          </div>
          
          {/* NEW: Profit Per Unit Trends - Amazon Focus */}
          {(decliningProfitability.length > 0 || improvingProfitability.length > 0) && (
            <div className="mb-6 bg-gradient-to-r from-slate-800/50 to-slate-900/50 rounded-2xl border border-slate-700 p-6">
              <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <TrendingDown className="w-6 h-6 text-orange-400" />
                Amazon Profit Per Unit Trends
              </h2>
              <p className="text-slate-400 text-sm mb-6">Track how fees and costs are impacting your per-unit profitability over time</p>
              
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* Declining Profitability */}
                {decliningProfitability.length > 0 && (
                  <div className="bg-rose-900/10 border border-rose-500/20 rounded-xl p-5">
                    <h3 className="text-lg font-semibold text-rose-400 mb-4 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      ⚠️ Declining Profit/Unit (Watch These!)
                    </h3>
                    <div className="space-y-4">
                      {decliningProfitability.map(s => (
                        <div key={s.sku} className="bg-slate-900/50 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <p className="text-white font-semibold">{s.sku}</p>
                              <p className="text-slate-500 text-xs">{s.totalUnits} units over {s.weeklyData.length} weeks</p>
                            </div>
                            <div className="text-right">
                              <p className={`text-lg font-bold ${s.ppuChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {s.ppuChange >= 0 ? '+' : ''}{formatCurrency(s.ppuChange)}/unit
                              </p>
                              <p className="text-slate-500 text-xs">
                                {formatCurrency(s.olderPPU)} → {formatCurrency(s.recentPPU)}
                              </p>
                            </div>
                          </div>
                          {/* Mini sparkline chart */}
                          <div className="flex items-end gap-1 h-12">
                            {s.weeklyData.map((w, i) => {
                              const maxPPU = Math.max(...s.weeklyData.map(x => Math.abs(x.profitPerUnit))) || 1;
                              const height = Math.abs(w.profitPerUnit) / maxPPU * 100;
                              const isPositive = w.profitPerUnit >= 0;
                              return (
                                <div key={i} className="flex-1 flex flex-col items-center">
                                  <div 
                                    className={`w-full rounded-t ${isPositive ? 'bg-emerald-500/60' : 'bg-rose-500/60'}`}
                                    style={{ height: `${Math.max(height, 5)}%` }}
                                    title={`${w.week}: ${formatCurrency(w.profitPerUnit)}/unit`}
                                  />
                                  <span className="text-[8px] text-slate-600 mt-1">{w.week.slice(5)}</span>
                                </div>
                              );
                            })}
                          </div>
                          {/* Fee analysis */}
                          {s.fpuChange > 0.1 && (
                            <div className="mt-3 text-xs text-amber-400 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              Fees increased by {formatCurrency(s.fpuChange)}/unit
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Improving Profitability */}
                {improvingProfitability.length > 0 && (
                  <div className="bg-emerald-900/10 border border-emerald-500/20 rounded-xl p-5">
                    <h3 className="text-lg font-semibold text-emerald-400 mb-4 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5" />
                      ✅ Improving Profit/Unit
                    </h3>
                    <div className="space-y-4">
                      {improvingProfitability.map(s => (
                        <div key={s.sku} className="bg-slate-900/50 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <p className="text-white font-semibold">{s.sku}</p>
                              <p className="text-slate-500 text-xs">{s.totalUnits} units over {s.weeklyData.length} weeks</p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold text-emerald-400">
                                +{formatCurrency(s.ppuChange)}/unit
                              </p>
                              <p className="text-slate-500 text-xs">
                                {formatCurrency(s.olderPPU)} → {formatCurrency(s.recentPPU)}
                              </p>
                            </div>
                          </div>
                          {/* Mini sparkline chart */}
                          <div className="flex items-end gap-1 h-12">
                            {s.weeklyData.map((w, i) => {
                              const maxPPU = Math.max(...s.weeklyData.map(x => Math.abs(x.profitPerUnit))) || 1;
                              const height = Math.abs(w.profitPerUnit) / maxPPU * 100;
                              const isPositive = w.profitPerUnit >= 0;
                              return (
                                <div key={i} className="flex-1 flex flex-col items-center">
                                  <div 
                                    className={`w-full rounded-t ${isPositive ? 'bg-emerald-500/60' : 'bg-rose-500/60'}`}
                                    style={{ height: `${Math.max(height, 5)}%` }}
                                    title={`${w.week}: ${formatCurrency(w.profitPerUnit)}/unit`}
                                  />
                                  <span className="text-[8px] text-slate-600 mt-1">{w.week.slice(5)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Top Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <SkuTable data={topByRevenue} title="Top 10 by Revenue" icon={<DollarSign className="w-5 h-5" />} color="text-emerald-400" showProfitPerUnit />
            <SkuTable data={topByUnits} title="Top 10 by Units" icon={<Package className="w-5 h-5" />} color="text-blue-400" showProfitPerUnit />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <SkuTable data={topByProfit} title="Top 10 Total Profit" icon={<Award className="w-5 h-5" />} color="text-amber-400" showProfit showProfitPerUnit />
            <SkuTable data={topByProfitPerUnit} title="Top 10 Best $/Unit" icon={<Zap className="w-5 h-5" />} color="text-violet-400" showProfitPerUnit />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <SkuTable data={risingStars} title="Rising Stars (4wk growth)" icon={<Flame className="w-5 h-5" />} color="text-orange-400" showGrowth showProfitPerUnit />
            <SkuTable data={declining} title="Watch List (Declining)" icon={<TrendingDown className="w-5 h-5" />} color="text-rose-400" showGrowth showProfitPerUnit />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

  // ==================== ANALYTICS VIEW (Forecast & Compare) ====================
  if (view === 'analytics') {
    const sortedWeeks = Object.keys(allWeeksData).sort();
    
    // Build SKU data for forecasting
    const skuWeeklyTotals = {};
    sortedWeeks.forEach(w => {
      const week = allWeeksData[w];
      [...(week.amazon?.skuData || []), ...(week.shopify?.skuData || [])].forEach(s => {
        const key = s.sku;
        if (!skuWeeklyTotals[key]) skuWeeklyTotals[key] = { sku: s.sku, name: s.name || '', weeks: {} };
        if (!skuWeeklyTotals[key].weeks[w]) skuWeeklyTotals[key].weeks[w] = { units: 0, revenue: 0, profit: 0 };
        skuWeeklyTotals[key].weeks[w].units += s.unitsSold || 0;
        skuWeeklyTotals[key].weeks[w].revenue += s.netSales || 0;
        // Amazon: netProceeds IS profit; Shopify: netSales - cogs
        const profit = s.netProceeds !== undefined ? s.netProceeds : (s.netSales || 0) - (s.cogs || 0);
        skuWeeklyTotals[key].weeks[w].profit += profit;
      });
    });
    
    // Generate SKU-level forecasts
    const skuForecasts = Object.values(skuWeeklyTotals).map(sku => {
      const weekDates = Object.keys(sku.weeks).sort();
      if (weekDates.length < 4) return { ...sku, forecast: null };
      
      const recentWeeks = weekDates.slice(-8);
      const revenues = recentWeeks.map(w => sku.weeks[w]?.revenue || 0);
      const units = recentWeeks.map(w => sku.weeks[w]?.units || 0);
      const profits = recentWeeks.map(w => sku.weeks[w]?.profit || 0);
      
      // Simple linear regression
      const calcTrend = (data) => {
        const n = data.length;
        if (n === 0) return { slope: 0, intercept: 0, avg: 0 };
        const sumX = data.reduce((s, _, i) => s + i, 0);
        const sumY = data.reduce((s, v) => s + v, 0);
        const sumXY = data.reduce((s, v, i) => s + i * v, 0);
        const sumX2 = data.reduce((s, _, i) => s + i * i, 0);
        const denom = n * sumX2 - sumX * sumX;
        const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
        const intercept = (sumY - slope * sumX) / n;
        return { slope, intercept, avg: sumY / n };
      };
      
      const revTrend = calcTrend(revenues);
      const unitTrend = calcTrend(units);
      const profTrend = calcTrend(profits);
      
      const n = revenues.length;
      const nextMonthRev = [0, 1, 2, 3].reduce((sum, i) => sum + Math.max(0, revTrend.intercept + revTrend.slope * (n + i)), 0);
      const nextMonthUnits = [0, 1, 2, 3].reduce((sum, i) => sum + Math.max(0, unitTrend.intercept + unitTrend.slope * (n + i)), 0);
      const nextMonthProfit = [0, 1, 2, 3].reduce((sum, i) => sum + profTrend.intercept + profTrend.slope * (n + i), 0);
      
      const totalRevenue = Object.values(sku.weeks).reduce((s, w) => s + w.revenue, 0);
      const totalUnits = Object.values(sku.weeks).reduce((s, w) => s + w.units, 0);
      
      return {
        ...sku,
        totalRevenue,
        totalUnits,
        weeksActive: weekDates.length,
        forecast: {
          nextMonthRevenue: nextMonthRev,
          nextMonthUnits: Math.round(nextMonthUnits),
          nextMonthProfit: nextMonthProfit,
          trend: revTrend.slope > 0 ? 'up' : revTrend.slope < 0 ? 'down' : 'flat',
          avgWeeklyRevenue: revTrend.avg,
        }
      };
    }).filter(s => s.totalRevenue > 0).sort((a, b) => b.totalRevenue - a.totalRevenue);
    
    // Week comparison data
    const weekCompareData = selectedWeeksToCompare.map(w => {
      const data = allWeeksData[w];
      if (!data) return null;
      return {
        week: w,
        revenue: data.total?.revenue || 0,
        profit: data.total?.netProfit || 0,
        units: data.total?.units || 0,
        adSpend: data.total?.adSpend || 0,
        cogs: data.total?.cogs || 0,
        amazonRev: data.amazon?.revenue || 0,
        shopifyRev: data.shopify?.revenue || 0,
        margin: data.total?.revenue ? (data.total.netProfit / data.total.revenue * 100) : 0,
      };
    }).filter(Boolean);
    
    // SKU comparison data  
    const skuCompareData = selectedSkusToCompare.map(sku => {
      const data = skuWeeklyTotals[sku];
      if (!data) return null;
      const totals = Object.values(data.weeks).reduce((acc, w) => ({
        units: acc.units + w.units,
        revenue: acc.revenue + w.revenue,
        profit: acc.profit + w.profit,
      }), { units: 0, revenue: 0, profit: 0 });
      return {
        sku: data.sku,
        name: data.name,
        ...totals,
        profitPerUnit: totals.units > 0 ? totals.profit / totals.units : 0,
        margin: totals.revenue > 0 ? (totals.profit / totals.revenue * 100) : 0,
        weeksActive: Object.keys(data.weeks).length,
      };
    }).filter(Boolean);
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 lg:p-6">
        <div className="max-w-7xl mx-auto"><Toast /><ValidationModal />{aiChatUI}{aiChatButton}<CogsManager /><ProductCatalogModal /><UploadHelpModal /><ForecastModal /><BreakEvenModal /><ExportModal /><ComparisonView /><InvoiceModal /><GoalsModal />
          
          <div className="mb-6">
            <h1 className="text-2xl lg:text-3xl font-bold text-white">Analytics & Forecasting</h1>
            <p className="text-slate-400">Predict future performance and compare metrics</p>
          </div>
          
          <NavTabs />
          
          {/* Analytics Sub-tabs */}
          <div className="flex flex-wrap gap-2 mb-6 p-1 bg-slate-800/50 rounded-xl w-fit">
            <button onClick={() => setAnalyticsTab('forecast')} className={`px-4 py-2 rounded-lg text-sm font-medium ${analyticsTab === 'forecast' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
              <TrendingUp className="w-4 h-4 inline mr-1" />Total Forecast
            </button>
            <button onClick={() => setAnalyticsTab('amazon-accuracy')} className={`px-4 py-2 rounded-lg text-sm font-medium ${analyticsTab === 'amazon-accuracy' ? 'bg-orange-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
              <Target className="w-4 h-4 inline mr-1" />Amazon Accuracy
            </button>
            <button onClick={() => setAnalyticsTab('sku-forecast')} className={`px-4 py-2 rounded-lg text-sm font-medium ${analyticsTab === 'sku-forecast' ? 'bg-pink-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
              <Package className="w-4 h-4 inline mr-1" />SKU Forecast
            </button>
            <button onClick={() => setAnalyticsTab('compare-weeks')} className={`px-4 py-2 rounded-lg text-sm font-medium ${analyticsTab === 'compare-weeks' ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
              <GitCompare className="w-4 h-4 inline mr-1" />Compare Weeks
            </button>
            <button onClick={() => setAnalyticsTab('compare-skus')} className={`px-4 py-2 rounded-lg text-sm font-medium ${analyticsTab === 'compare-skus' ? 'bg-amber-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
              <Trophy className="w-4 h-4 inline mr-1" />Compare SKUs
            </button>
          </div>
          
          {/* AMAZON FORECAST ACCURACY TAB */}
          {analyticsTab === 'amazon-accuracy' && (
            <div className="space-y-6">
              {forecastAccuracyMetrics ? (
                <>
                  {/* Accuracy Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-gradient-to-br from-orange-900/40 to-amber-900/20 rounded-2xl border border-orange-500/30 p-5">
                      <p className="text-orange-400 text-sm font-medium mb-1">Overall Accuracy</p>
                      <p className="text-3xl font-bold text-white">{forecastAccuracyMetrics.avgAccuracy.toFixed(1)}%</p>
                      <p className="text-slate-400 text-xs mt-1">Based on {forecastAccuracyMetrics.totalWeeks} weeks</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5">
                      <p className="text-slate-400 text-sm font-medium mb-1">Beat / Missed</p>
                      <p className="text-2xl font-bold">
                        <span className="text-emerald-400">{forecastAccuracyMetrics.beatCount}</span>
                        <span className="text-slate-500 mx-2">/</span>
                        <span className="text-rose-400">{forecastAccuracyMetrics.missedCount}</span>
                      </p>
                      <p className="text-slate-400 text-xs mt-1">Win rate: {((forecastAccuracyMetrics.beatCount / forecastAccuracyMetrics.totalWeeks) * 100).toFixed(0)}%</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5">
                      <p className="text-slate-400 text-sm font-medium mb-1">Avg Revenue Variance</p>
                      <p className={`text-2xl font-bold ${forecastAccuracyMetrics.avgRevenueVariance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {forecastAccuracyMetrics.avgRevenueVariance >= 0 ? '+' : ''}{forecastAccuracyMetrics.avgRevenueVariance.toFixed(1)}%
                      </p>
                      <p className="text-slate-400 text-xs mt-1">{forecastAccuracyMetrics.avgRevenueVariance >= 0 ? 'Above' : 'Below'} forecast on average</p>
                    </div>
                    <div className={`rounded-2xl border p-5 ${forecastAccuracyMetrics.accuracyTrend >= 0 ? 'bg-emerald-900/20 border-emerald-500/30' : 'bg-rose-900/20 border-rose-500/30'}`}>
                      <p className={`text-sm font-medium mb-1 ${forecastAccuracyMetrics.accuracyTrend >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>Accuracy Trend</p>
                      <p className="text-2xl font-bold text-white flex items-center gap-2">
                        {forecastAccuracyMetrics.accuracyTrend >= 0 ? <TrendingUp className="w-6 h-6 text-emerald-400" /> : <TrendingDown className="w-6 h-6 text-rose-400" />}
                        {forecastAccuracyMetrics.accuracyTrend >= 0 ? '+' : ''}{forecastAccuracyMetrics.accuracyTrend.toFixed(1)}%
                      </p>
                      <p className="text-slate-400 text-xs mt-1">{forecastAccuracyMetrics.accuracyTrend >= 0 ? 'Improving' : 'Declining'} vs prior period</p>
                    </div>
                  </div>
                  
                  {/* Bias Analysis */}
                  <div className={`rounded-xl border p-4 ${
                    forecastAccuracyMetrics.bias === 'over' ? 'bg-amber-900/20 border-amber-500/30' :
                    forecastAccuracyMetrics.bias === 'under' ? 'bg-emerald-900/20 border-emerald-500/30' :
                    'bg-slate-800/50 border-slate-700'
                  }`}>
                    <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
                      <AlertCircle className="w-5 h-5" />
                      Forecast Bias Analysis
                    </h3>
                    <p className="text-slate-300">{forecastAccuracyMetrics.biasDescription}</p>
                    {forecastAccuracyMetrics.bias !== 'neutral' && (
                      <p className="text-slate-400 text-sm mt-2">
                        💡 Tip: {forecastAccuracyMetrics.bias === 'over' 
                          ? 'Consider multiplying Amazon forecasts by 0.9-0.95 for more realistic expectations.'
                          : 'Amazon may be conservative - you can expect to beat forecasts more often than not.'}
                      </p>
                    )}
                  </div>
                  
                  {/* Week-by-Week Comparison Table */}
                  <div className="bg-slate-800/50 rounded-2xl border border-slate-700 overflow-hidden">
                    <div className="p-4 border-b border-slate-700">
                      <h3 className="font-semibold text-white">Week-by-Week Comparison</h3>
                      <p className="text-slate-400 text-sm">Forecast vs Actual for each week {getAmazonForecastComparison.some(c => c.matchType === 'fuzzy') && '(includes fuzzy matches)'}</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-slate-900/50">
                          <tr>
                            <th className="text-left px-4 py-3 text-slate-400 text-xs uppercase">Week</th>
                            <th className="text-right px-4 py-3 text-slate-400 text-xs uppercase">Forecast</th>
                            <th className="text-right px-4 py-3 text-slate-400 text-xs uppercase">Actual</th>
                            <th className="text-right px-4 py-3 text-slate-400 text-xs uppercase">Variance</th>
                            <th className="text-right px-4 py-3 text-slate-400 text-xs uppercase">Accuracy</th>
                            <th className="text-center px-4 py-3 text-slate-400 text-xs uppercase">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {getAmazonForecastComparison.map(comp => (
                            <tr key={comp.weekEnding} className="border-t border-slate-700/50 hover:bg-slate-700/20">
                              <td className="px-4 py-3 text-white">
                                {new Date(comp.weekEnding + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                {comp.matchType === 'fuzzy' && <span className="text-amber-400 text-xs ml-1">~</span>}
                              </td>
                              <td className="px-4 py-3 text-right text-orange-400">{formatCurrency(comp.forecast.revenue)}</td>
                              <td className="px-4 py-3 text-right text-white font-medium">{formatCurrency(comp.actual.revenue)}</td>
                              <td className={`px-4 py-3 text-right font-medium ${comp.variance.revenuePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {comp.variance.revenuePercent >= 0 ? '+' : ''}{comp.variance.revenuePercent.toFixed(1)}%
                              </td>
                              <td className={`px-4 py-3 text-right ${comp.accuracy >= 90 ? 'text-emerald-400' : comp.accuracy >= 80 ? 'text-amber-400' : 'text-rose-400'}`}>
                                {comp.accuracy.toFixed(1)}%
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${comp.status === 'beat' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                  {comp.status === 'beat' ? '✓ Beat' : '✗ Missed'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  
                  {/* ML Insights Panel */}
                  {mlTrainingData && (
                    <div className="bg-gradient-to-r from-violet-900/30 to-indigo-900/30 rounded-2xl border border-violet-500/30 p-5">
                      <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                        <Zap className="w-5 h-5 text-violet-400" />
                        Machine Learning Insights
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-slate-400">Training Samples</p>
                          <p className="text-white font-semibold text-lg">{mlTrainingData.summary.totalSamples}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Amazon Bias</p>
                          <p className={`font-semibold text-lg ${mlTrainingData.summary.bias > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {mlTrainingData.summary.bias > 0 ? 'Under-forecasts' : 'Over-forecasts'} by {Math.abs(mlTrainingData.summary.bias).toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-400">Suggested Multiplier</p>
                          <p className="text-violet-400 font-semibold text-lg">{mlTrainingData.summary.correctionFactor.toFixed(3)}x</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Prediction Variance</p>
                          <p className="text-white font-semibold text-lg">±{mlTrainingData.summary.stdDev.toFixed(1)}%</p>
                        </div>
                      </div>
                      <p className="text-slate-500 text-xs mt-3">
                        💡 Apply the multiplier to Amazon's forecast for a corrected prediction: Forecast × {mlTrainingData.summary.correctionFactor.toFixed(3)} = Adjusted Forecast
                      </p>
                    </div>
                  )}
                </>
              ) : (
                /* Show pending forecasts even when no matches yet */
                <div className="space-y-6">
                  {pendingForecasts.length > 0 && (
                    <div className="bg-amber-900/20 rounded-2xl border border-amber-500/30 p-5">
                      <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-amber-400" />
                        Pending Forecasts ({pendingForecasts.length})
                      </h3>
                      <p className="text-slate-400 text-sm mb-4">These forecasts are waiting for matching actual data</p>
                      <div className="space-y-2">
                        {pendingForecasts.map(pf => (
                          <div key={pf.weekEnding} className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3">
                            <div>
                              <p className="text-white font-medium">Week ending {new Date(pf.weekEnding + 'T00:00:00').toLocaleDateString()}</p>
                              <p className="text-slate-400 text-sm">{formatCurrency(pf.forecast.totals.sales)} forecasted • {pf.forecast.skuCount} SKUs</p>
                            </div>
                            <div className="text-right">
                              {pf.isPast ? (
                                <span className="text-rose-400 text-sm">⏳ Awaiting actual data</span>
                              ) : (
                                <span className="text-amber-400 text-sm">{pf.daysUntil} days until week ends</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="bg-slate-800/30 rounded-2xl border border-dashed border-slate-600 p-8 text-center">
                    <Target className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">No Matching Forecast & Actual Data Yet</h3>
                    <p className="text-slate-400 mb-4">Upload actual weekly data for a forecasted week to see accuracy analysis</p>
                    <p className="text-slate-500 text-sm mb-4">Fuzzy matching enabled: weeks within 3 days will match automatically</p>
                  
                    {/* Debug info */}
                    <div className="bg-slate-900/50 rounded-xl p-4 text-left max-w-lg mx-auto mb-4">
                      <p className="text-slate-500 text-xs uppercase mb-3">Data Matching Status</p>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-orange-400 font-medium mb-2">Forecast Weeks:</p>
                          {Object.keys(amazonForecasts).length > 0 ? (
                            <ul className="text-slate-400 space-y-1">
                              {Object.keys(amazonForecasts).sort().map(k => (
                                <li key={k}>{k}</li>
                              ))}
                            </ul>
                          ) : <p className="text-slate-500">None</p>}
                        </div>
                        <div>
                          <p className="text-blue-400 font-medium mb-2">Actual Weeks:</p>
                          {Object.keys(allWeeksData).length > 0 ? (
                            <ul className="text-slate-400 space-y-1">
                              {Object.keys(allWeeksData).sort().reverse().slice(0, 6).map(k => (
                                <li key={k}>{k}</li>
                              ))}
                            </ul>
                          ) : <p className="text-slate-500">None</p>}
                        </div>
                      </div>
                    </div>
                  
                    <div className="flex gap-3 justify-center">
                      <button onClick={() => { setUploadTab('forecast'); setView('upload'); }} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg text-white">
                        Upload Forecast
                      </button>
                      <button onClick={() => { setUploadTab('weekly'); setView('upload'); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white">
                        Upload Weekly Data
                      </button>
                    </div>
                  </div>
              )}
            </div>
          )}
          
          {/* TOTAL FORECAST TAB */}
          {analyticsTab === 'forecast' && generateForecast && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-emerald-900/40 to-emerald-800/20 rounded-2xl border border-emerald-500/30 p-6">
                  <p className="text-emerald-400 text-sm font-medium mb-1">Projected Monthly Revenue</p>
                  <p className="text-3xl font-bold text-white">{formatCurrency(generateForecast.monthly.revenue)}</p>
                  <p className={`text-sm mt-1 flex items-center gap-1 ${generateForecast.trend.revenue === 'up' ? 'text-emerald-400' : generateForecast.trend.revenue === 'down' ? 'text-rose-400' : 'text-slate-400'}`}>
                    {generateForecast.trend.revenue === 'up' ? <TrendingUp className="w-4 h-4" /> : generateForecast.trend.revenue === 'down' ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                    {generateForecast.trend.revenueChange > 0 ? '+' : ''}{generateForecast.trend.revenueChange.toFixed(1)}% weekly trend
                  </p>
                </div>
                <div className={`rounded-2xl border p-6 ${generateForecast.monthly.profit >= 0 ? 'bg-gradient-to-br from-blue-900/40 to-blue-800/20 border-blue-500/30' : 'bg-gradient-to-br from-rose-900/40 to-rose-800/20 border-rose-500/30'}`}>
                  <p className={`text-sm font-medium mb-1 ${generateForecast.monthly.profit >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>Projected Monthly Profit</p>
                  <p className="text-3xl font-bold text-white">{formatCurrency(generateForecast.monthly.profit)}</p>
                  {goals.monthlyProfit > 0 && (
                    <p className={`text-sm mt-1 ${generateForecast.monthly.profit >= goals.monthlyProfit ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {generateForecast.monthly.profit >= goals.monthlyProfit ? '✓ On track for goal' : `${formatCurrency(goals.monthlyProfit - generateForecast.monthly.profit)} below goal`}
                    </p>
                  )}
                </div>
                <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6">
                  <p className="text-slate-400 text-sm font-medium mb-1">Projected Monthly Units</p>
                  <p className="text-3xl font-bold text-white">{formatNumber(generateForecast.monthly.units)}</p>
                  <p className="text-slate-500 text-sm mt-1">Confidence: {generateForecast.confidence}%</p>
                </div>
              </div>
              
              <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Weekly Projections</h3>
                <div className="grid grid-cols-4 gap-4">
                  {generateForecast.weekly.map((w, i) => (
                    <div key={i} className="bg-slate-900/50 rounded-xl p-4 text-center">
                      <p className="text-slate-500 text-sm mb-2">{w.week}</p>
                      <p className="text-xl font-bold text-white">{formatCurrency(w.revenue)}</p>
                      <p className={`text-sm ${w.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(w.profit)} profit</p>
                      <p className="text-slate-500 text-xs mt-1">{w.units} units</p>
                    </div>
                  ))}
                </div>
              </div>
              
              <p className="text-slate-500 text-sm text-center">Based on {generateForecast.basedOn} weeks of historical data using linear trend analysis</p>
            </div>
          )}
          
          {analyticsTab === 'forecast' && !generateForecast && (
            <div className="bg-slate-800/30 rounded-2xl border border-dashed border-slate-600 p-12 text-center">
              <TrendingUp className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 text-lg">Need at least 4 weeks of data for forecasting</p>
              <p className="text-slate-500 text-sm mt-2">Currently have {sortedWeeks.length} week(s)</p>
            </div>
          )}
          
          {/* SKU FORECAST TAB */}
          {analyticsTab === 'sku-forecast' && (
            <div className="space-y-6">
              <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                  SKU-Level Forecast (Next Month)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left text-slate-400 font-medium py-2">SKU</th>
                        <th className="text-left text-slate-400 font-medium py-2">Product</th>
                        <th className="text-right text-slate-400 font-medium py-2">Avg/Week</th>
                        <th className="text-right text-slate-400 font-medium py-2">Trend</th>
                        <th className="text-right text-slate-400 font-medium py-2">Proj. Revenue</th>
                        <th className="text-right text-slate-400 font-medium py-2">Proj. Units</th>
                        <th className="text-right text-slate-400 font-medium py-2">Proj. Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {skuForecasts.slice(0, 20).map((s, i) => (
                        <tr key={s.sku} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                          <td className="py-3 text-white font-mono text-xs">{s.sku}</td>
                          <td className="py-3 text-slate-300 max-w-[200px] truncate">{s.name || '—'}</td>
                          <td className="py-3 text-right text-white">{s.forecast ? formatCurrency(s.forecast.avgWeeklyRevenue) : '—'}</td>
                          <td className="py-3 text-right">
                            {s.forecast ? (
                              <span className={`flex items-center justify-end gap-1 ${s.forecast.trend === 'up' ? 'text-emerald-400' : s.forecast.trend === 'down' ? 'text-rose-400' : 'text-slate-400'}`}>
                                {s.forecast.trend === 'up' ? <TrendingUp className="w-4 h-4" /> : s.forecast.trend === 'down' ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                                {s.forecast.trend}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="py-3 text-right text-emerald-400 font-medium">{s.forecast ? formatCurrency(s.forecast.nextMonthRevenue) : '—'}</td>
                          <td className="py-3 text-right text-white">{s.forecast ? formatNumber(s.forecast.nextMonthUnits) : '—'}</td>
                          <td className={`py-3 text-right font-medium ${s.forecast?.nextMonthProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {s.forecast ? formatCurrency(s.forecast.nextMonthProfit) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-slate-600">
                      <tr className="font-semibold">
                        <td colSpan="4" className="py-3 text-white">Total (Top 20 SKUs)</td>
                        <td className="py-3 text-right text-emerald-400">{formatCurrency(skuForecasts.slice(0, 20).reduce((s, x) => s + (x.forecast?.nextMonthRevenue || 0), 0))}</td>
                        <td className="py-3 text-right text-white">{formatNumber(skuForecasts.slice(0, 20).reduce((s, x) => s + (x.forecast?.nextMonthUnits || 0), 0))}</td>
                        <td className="py-3 text-right text-emerald-400">{formatCurrency(skuForecasts.slice(0, 20).reduce((s, x) => s + (x.forecast?.nextMonthProfit || 0), 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}
          
          {/* COMPARE WEEKS TAB */}
          {analyticsTab === 'compare-weeks' && (
            <div className="space-y-6">
              <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Select Weeks to Compare (up to 4)</h3>
                <div className="flex flex-wrap gap-2 mb-4">
                  {sortedWeeks.slice().reverse().slice(0, 12).map(w => {
                    const isSelected = selectedWeeksToCompare.includes(w);
                    return (
                      <button key={w} onClick={() => {
                        if (isSelected) setSelectedWeeksToCompare(prev => prev.filter(x => x !== w));
                        else if (selectedWeeksToCompare.length < 4) setSelectedWeeksToCompare(prev => [...prev, w]);
                      }} className={`px-3 py-2 rounded-lg text-sm ${isSelected ? 'bg-violet-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                        {new Date(w + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {isSelected && <Check className="w-4 h-4 inline ml-1" />}
                      </button>
                    );
                  })}
                </div>
                {selectedWeeksToCompare.length > 0 && (
                  <button onClick={() => setSelectedWeeksToCompare([])} className="text-sm text-slate-400 hover:text-white">Clear selection</button>
                )}
              </div>
              
              {weekCompareData.length >= 2 && (
                <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left text-slate-400 font-medium py-2">Metric</th>
                        {weekCompareData.map(w => (
                          <th key={w.week} className="text-right text-white font-medium py-2">
                            {new Date(w.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </th>
                        ))}
                        {weekCompareData.length === 2 && <th className="text-right text-slate-400 font-medium py-2">Difference</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {[
                        { key: 'revenue', label: 'Revenue', format: formatCurrency, color: 'text-white' },
                        { key: 'profit', label: 'Profit', format: formatCurrency, color: 'profit' },
                        { key: 'units', label: 'Units', format: formatNumber, color: 'text-white' },
                        { key: 'margin', label: 'Margin', format: v => v.toFixed(1) + '%', color: 'text-white' },
                        { key: 'adSpend', label: 'Ad Spend', format: formatCurrency, color: 'text-violet-400' },
                        { key: 'amazonRev', label: 'Amazon', format: formatCurrency, color: 'text-orange-400' },
                        { key: 'shopifyRev', label: 'Shopify', format: formatCurrency, color: 'text-blue-400' },
                      ].map(metric => (
                        <tr key={metric.key}>
                          <td className="py-3 text-slate-400">{metric.label}</td>
                          {weekCompareData.map(w => (
                            <td key={w.week} className={`py-3 text-right font-medium ${metric.color === 'profit' ? (w[metric.key] >= 0 ? 'text-emerald-400' : 'text-rose-400') : metric.color}`}>
                              {metric.format(w[metric.key])}
                            </td>
                          ))}
                          {weekCompareData.length === 2 && (
                            <td className={`py-3 text-right font-medium ${weekCompareData[1][metric.key] >= weekCompareData[0][metric.key] ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {weekCompareData[1][metric.key] >= weekCompareData[0][metric.key] ? '+' : ''}
                              {metric.key === 'margin' 
                                ? (weekCompareData[1][metric.key] - weekCompareData[0][metric.key]).toFixed(1) + '%'
                                : metric.format(weekCompareData[1][metric.key] - weekCompareData[0][metric.key])}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              
              {weekCompareData.length < 2 && (
                <div className="bg-slate-800/30 rounded-2xl border border-dashed border-slate-600 p-12 text-center">
                  <GitCompare className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 text-lg">Select at least 2 weeks to compare</p>
                </div>
              )}
            </div>
          )}
          
          {/* COMPARE SKUS TAB */}
          {analyticsTab === 'compare-skus' && (
            <div className="space-y-6">
              <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Select SKUs to Compare (up to 5)</h3>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {skuForecasts.slice(0, 50).map(s => {
                    const isSelected = selectedSkusToCompare.includes(s.sku);
                    return (
                      <button key={s.sku} onClick={() => {
                        if (isSelected) setSelectedSkusToCompare(prev => prev.filter(x => x !== s.sku));
                        else if (selectedSkusToCompare.length < 5) setSelectedSkusToCompare(prev => [...prev, s.sku]);
                      }} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm ${isSelected ? 'bg-amber-600/30 border border-amber-500/50' : 'bg-slate-700/50 hover:bg-slate-600/50'}`}>
                        <span className="flex items-center gap-2">
                          {isSelected && <Check className="w-4 h-4 text-amber-400" />}
                          <span className="font-mono text-xs text-slate-400">{s.sku}</span>
                          <span className="text-white truncate max-w-[200px]">{s.name || 'Unknown'}</span>
                        </span>
                        <span className="text-emerald-400">{formatCurrency(s.totalRevenue)}</span>
                      </button>
                    );
                  })}
                </div>
                {selectedSkusToCompare.length > 0 && (
                  <button onClick={() => setSelectedSkusToCompare([])} className="mt-2 text-sm text-slate-400 hover:text-white">Clear selection</button>
                )}
              </div>
              
              {skuCompareData.length >= 2 && (
                <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left text-slate-400 font-medium py-2">Metric</th>
                        {skuCompareData.map(s => (
                          <th key={s.sku} className="text-right text-white font-medium py-2 max-w-[120px]">
                            <span className="block font-mono text-xs text-slate-400">{s.sku}</span>
                            <span className="block truncate text-sm">{s.name || 'Unknown'}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {[
                        { key: 'revenue', label: 'Total Revenue', format: formatCurrency },
                        { key: 'profit', label: 'Total Profit', format: formatCurrency, isProfit: true },
                        { key: 'units', label: 'Total Units', format: formatNumber },
                        { key: 'profitPerUnit', label: 'Profit/Unit', format: formatCurrency, isProfit: true },
                        { key: 'margin', label: 'Margin %', format: v => v.toFixed(1) + '%' },
                        { key: 'weeksActive', label: 'Weeks Active', format: v => v },
                      ].map(metric => (
                        <tr key={metric.key}>
                          <td className="py-3 text-slate-400">{metric.label}</td>
                          {skuCompareData.map(s => {
                            const maxVal = Math.max(...skuCompareData.map(x => x[metric.key]));
                            const isMax = s[metric.key] === maxVal && maxVal > 0;
                            return (
                              <td key={s.sku} className={`py-3 text-right font-medium ${metric.isProfit ? (s[metric.key] >= 0 ? 'text-emerald-400' : 'text-rose-400') : 'text-white'} ${isMax ? 'bg-emerald-900/20' : ''}`}>
                                {metric.format(s[metric.key])}
                                {isMax && <Trophy className="w-3 h-3 inline ml-1 text-amber-400" />}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              
              {skuCompareData.length < 2 && (
                <div className="bg-slate-800/30 rounded-2xl border border-dashed border-slate-600 p-12 text-center">
                  <Trophy className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 text-lg">Select at least 2 SKUs to compare</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==================== PROFITABILITY VIEW ====================
  if (view === 'profitability') {
    const sortedWeeks = Object.keys(allWeeksData).sort();
    const recentWeeks = sortedWeeks.slice(-4);
    const olderWeeks = sortedWeeks.slice(-8, -4);
    
    // Aggregate data for recent 4 weeks
    const totals = { revenue: 0, cogs: 0, amazonFees: 0, threeplCosts: 0, adSpend: 0, profit: 0, units: 0, returns: 0 };
    const weeklyBreakdown = [];
    
    recentWeeks.forEach(w => {
      const week = allWeeksData[w];
      const rev = week.total?.revenue || 0;
      const cogs = week.total?.cogs || 0;
      const amzFees = week.amazon?.fees || 0;
      const threepl = week.shopify?.threeplCosts || 0;
      const ads = week.total?.adSpend || 0;
      const profit = week.total?.netProfit || 0;
      const units = week.total?.units || 0;
      const returns = week.amazon?.returns || 0;
      
      totals.revenue += rev;
      totals.cogs += cogs;
      totals.amazonFees += amzFees;
      totals.threeplCosts += threepl;
      totals.adSpend += ads;
      totals.profit += profit;
      totals.units += units;
      totals.returns += returns;
      
      weeklyBreakdown.push({ week: w, revenue: rev, cogs, amazonFees: amzFees, threeplCosts: threepl, adSpend: ads, profit, units, returns, margin: rev > 0 ? (profit/rev)*100 : 0 });
    });
    
    // Calculate prior period for comparison
    const priorTotals = { revenue: 0, profit: 0, cogs: 0, adSpend: 0 };
    olderWeeks.forEach(w => {
      const week = allWeeksData[w];
      priorTotals.revenue += week.total?.revenue || 0;
      priorTotals.profit += week.total?.netProfit || 0;
      priorTotals.cogs += week.total?.cogs || 0;
      priorTotals.adSpend += week.total?.adSpend || 0;
    });
    
    // Calculate percentages
    const pcts = {
      cogs: totals.revenue > 0 ? (totals.cogs / totals.revenue) * 100 : 0,
      amazonFees: totals.revenue > 0 ? (totals.amazonFees / totals.revenue) * 100 : 0,
      threeplCosts: totals.revenue > 0 ? (totals.threeplCosts / totals.revenue) * 100 : 0,
      adSpend: totals.revenue > 0 ? (totals.adSpend / totals.revenue) * 100 : 0,
      profit: totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0,
    };
    
    // Prior period percentages
    const priorPcts = {
      cogs: priorTotals.revenue > 0 ? (priorTotals.cogs / priorTotals.revenue) * 100 : 0,
      profit: priorTotals.revenue > 0 ? (priorTotals.profit / priorTotals.revenue) * 100 : 0,
      adSpend: priorTotals.revenue > 0 ? (priorTotals.adSpend / priorTotals.revenue) * 100 : 0,
    };
    
    // Calculate key metrics
    const avgOrderValue = totals.units > 0 ? totals.revenue / totals.units : 0;
    const profitPerUnit = totals.units > 0 ? totals.profit / totals.units : 0;
    const returnRate = (totals.units + totals.returns) > 0 ? (totals.returns / (totals.units + totals.returns)) * 100 : 0;
    const grossMargin = totals.revenue > 0 ? ((totals.revenue - totals.cogs) / totals.revenue) * 100 : 0;
    const operatingMargin = totals.revenue > 0 ? ((totals.revenue - totals.cogs - totals.amazonFees - totals.threeplCosts) / totals.revenue) * 100 : 0;
    
    // Identify biggest cost driver
    const costDrivers = [
      { name: 'COGS', value: totals.cogs, pct: pcts.cogs },
      { name: 'Amazon Fees', value: totals.amazonFees, pct: pcts.amazonFees },
      { name: '3PL Costs', value: totals.threeplCosts, pct: pcts.threeplCosts },
      { name: 'Ad Spend', value: totals.adSpend, pct: pcts.adSpend },
    ].sort((a, b) => b.value - a.value);
    
    // SKU-level profitability
    const skuProfitability = [];
    recentWeeks.forEach(w => {
      const week = allWeeksData[w];
      [...(week.amazon?.skuData || []), ...(week.shopify?.skuData || [])].forEach(s => {
        const existing = skuProfitability.find(x => x.sku === s.sku);
        const profit = s.netProceeds !== undefined ? s.netProceeds : (s.netSales || 0) - (s.cogs || 0);
        const revenue = s.netSales || 0;
        if (existing) {
          existing.revenue += revenue;
          existing.profit += profit;
          existing.units += s.unitsSold || 0;
        } else {
          skuProfitability.push({ sku: s.sku, name: s.name || '', revenue, profit, units: s.unitsSold || 0 });
        }
      });
    });
    
    // Calculate margin and sort
    const skuWithMargins = skuProfitability.map(s => ({
      ...s,
      margin: s.revenue > 0 ? (s.profit / s.revenue) * 100 : 0,
      profitPerUnit: s.units > 0 ? s.profit / s.units : 0,
    })).filter(s => s.revenue > 100); // Filter out tiny SKUs
    
    const topProfitSkus = [...skuWithMargins].sort((a, b) => b.profit - a.profit).slice(0, 5);
    const worstMarginSkus = [...skuWithMargins].sort((a, b) => a.margin - b.margin).slice(0, 5);
    const bestMarginSkus = [...skuWithMargins].sort((a, b) => b.margin - a.margin).slice(0, 5);
    
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
    const costTrends = sortedWeeks.slice(-12).map(w => {
      const week = allWeeksData[w];
      const rev = week.total?.revenue || 1;
      return {
        week: w,
        revenue: week.total?.revenue || 0,
        cogsPct: ((week.total?.cogs || 0) / rev) * 100,
        adsPct: ((week.total?.adSpend || 0) / rev) * 100,
        feesPct: (((week.amazon?.fees || 0) + (week.shopify?.threeplCosts || 0)) / rev) * 100,
        margin: ((week.total?.netProfit || 0) / rev) * 100,
      };
    });
    
    return (
      <div className="min-h-screen bg-slate-950 p-4 lg:p-6">
        <div className="max-w-7xl mx-auto"><Toast /><ValidationModal />{aiChatUI}{aiChatButton}<CogsManager /><ProductCatalogModal /><UploadHelpModal /><ForecastModal /><BreakEvenModal /><ExportModal /><ComparisonView /><InvoiceModal /><GoalsModal />
          <NavTabs />
          {dataBar}
          
          <div className="mb-6">
            <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">💰 Profitability Deep Dive</h1>
            <p className="text-slate-400">Understand where your money goes (Last {recentWeeks.length} weeks: {recentWeeks.length > 0 ? new Date(recentWeeks[0] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''} - {recentWeeks.length > 0 ? new Date(recentWeeks[recentWeeks.length-1] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''})</p>
          </div>
          
          {/* Key Insights Alert */}
          <div className="bg-gradient-to-r from-indigo-900/40 to-violet-900/40 border border-indigo-500/30 rounded-xl p-4 mb-6">
            <h3 className="text-indigo-300 font-semibold mb-2 flex items-center gap-2"><Zap className="w-4 h-4" />Key Insights</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-slate-400">Biggest Cost Driver</p>
                <p className="text-white font-semibold">{costDrivers[0]?.name}: {costDrivers[0]?.pct.toFixed(1)}% of revenue</p>
              </div>
              <div>
                <p className="text-slate-400">Profit Per Unit</p>
                <p className={`font-semibold ${profitPerUnit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(profitPerUnit)}</p>
              </div>
              <div>
                <p className="text-slate-400">Margin Trend vs Prior 4 Weeks</p>
                <p className={`font-semibold flex items-center gap-1 ${pcts.profit >= priorPcts.profit ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {pcts.profit >= priorPcts.profit ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {pcts.profit >= priorPcts.profit ? '+' : ''}{(pcts.profit - priorPcts.profit).toFixed(1)}%
                </p>
              </div>
            </div>
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
          
          {/* Margin Metrics Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">Gross Margin</p>
              <p className="text-2xl font-bold text-white">{grossMargin.toFixed(1)}%</p>
              <p className="text-slate-500 text-xs">Revenue - COGS</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">Operating Margin</p>
              <p className="text-2xl font-bold text-white">{operatingMargin.toFixed(1)}%</p>
              <p className="text-slate-500 text-xs">Before ad spend</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-900/30 to-slate-800/50 rounded-xl border border-emerald-500/30 p-4">
              <p className="text-slate-400 text-sm">Net Margin</p>
              <p className={`text-2xl font-bold ${pcts.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{pcts.profit.toFixed(1)}%</p>
              <p className="text-slate-500 text-xs">After all costs</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">Return Rate</p>
              <p className={`text-2xl font-bold ${returnRate < 5 ? 'text-emerald-400' : returnRate < 10 ? 'text-amber-400' : 'text-rose-400'}`}>{returnRate.toFixed(1)}%</p>
              <p className="text-slate-500 text-xs">{totals.returns} returns</p>
            </div>
          </div>
          
          {/* Cost Breakdown Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <p className="text-slate-400 text-sm">COGS</p>
              <p className="text-xl font-bold text-white">{formatCurrency(totals.cogs)}</p>
              <p className="text-rose-400 text-sm">{pcts.cogs.toFixed(1)}% of revenue</p>
              {priorPcts.cogs > 0 && <p className={`text-xs ${pcts.cogs <= priorPcts.cogs ? 'text-emerald-400' : 'text-rose-400'}`}>{pcts.cogs <= priorPcts.cogs ? '↓' : '↑'} vs prior</p>}
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
              <p className="text-slate-400 text-sm">Ad Spend (TACOS)</p>
              <p className="text-xl font-bold text-white">{formatCurrency(totals.adSpend)}</p>
              <p className="text-purple-400 text-sm">{pcts.adSpend.toFixed(1)}% of revenue</p>
              {priorPcts.adSpend > 0 && <p className={`text-xs ${pcts.adSpend <= priorPcts.adSpend ? 'text-emerald-400' : 'text-rose-400'}`}>{pcts.adSpend <= priorPcts.adSpend ? '↓' : '↑'} vs prior</p>}
            </div>
            <div className="bg-gradient-to-br from-emerald-900/30 to-slate-800/50 rounded-xl border border-emerald-500/30 p-4">
              <p className="text-slate-400 text-sm">Net Profit</p>
              <p className={`text-xl font-bold ${totals.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(totals.profit)}</p>
              <p className={`text-sm ${pcts.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{pcts.profit.toFixed(1)}% margin</p>
            </div>
          </div>
          
          {/* SKU Profitability Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Top Profit SKUs */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />Top Profit Generators
              </h3>
              <div className="space-y-2">
                {topProfitSkus.map((s, i) => (
                  <div key={s.sku} className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-400 font-bold">#{i+1}</span>
                      <span className="text-white truncate max-w-[120px]">{s.name || s.sku}</span>
                    </div>
                    <span className="text-emerald-400 font-semibold">{formatCurrency(s.profit)}</span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Best Margin SKUs */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" />Best Margins
              </h3>
              <div className="space-y-2">
                {bestMarginSkus.map((s, i) => (
                  <div key={s.sku} className="flex justify-between items-center text-sm">
                    <span className="text-white truncate max-w-[150px]">{s.name || s.sku}</span>
                    <span className="text-emerald-400 font-semibold">{s.margin.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Worst Margin SKUs */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-400" />Margin Opportunities
              </h3>
              <div className="space-y-2">
                {worstMarginSkus.map((s, i) => (
                  <div key={s.sku} className="flex justify-between items-center text-sm">
                    <span className="text-white truncate max-w-[150px]">{s.name || s.sku}</span>
                    <span className={`font-semibold ${s.margin < 0 ? 'text-rose-400' : 'text-amber-400'}`}>{s.margin.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
              <p className="text-slate-500 text-xs mt-2">Consider raising prices or cutting ad spend</p>
            </div>
          </div>
          
          {/* Weekly Breakdown Table */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">Weekly Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left text-slate-400 py-2">Week</th>
                    <th className="text-right text-slate-400 py-2">Revenue</th>
                    <th className="text-right text-slate-400 py-2">COGS</th>
                    <th className="text-right text-slate-400 py-2">Fees</th>
                    <th className="text-right text-slate-400 py-2">3PL</th>
                    <th className="text-right text-slate-400 py-2">Ads</th>
                    <th className="text-right text-slate-400 py-2">Profit</th>
                    <th className="text-right text-slate-400 py-2">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyBreakdown.map(w => (
                    <tr key={w.week} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-2 text-white">{new Date(w.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                      <td className="py-2 text-right text-white">{formatCurrency(w.revenue)}</td>
                      <td className="py-2 text-right text-rose-400">{formatCurrency(w.cogs)}</td>
                      <td className="py-2 text-right text-orange-400">{formatCurrency(w.amazonFees)}</td>
                      <td className="py-2 text-right text-blue-400">{formatCurrency(w.threeplCosts)}</td>
                      <td className="py-2 text-right text-purple-400">{formatCurrency(w.adSpend)}</td>
                      <td className={`py-2 text-right font-semibold ${w.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(w.profit)}</td>
                      <td className={`py-2 text-right ${w.margin >= 20 ? 'text-emerald-400' : w.margin >= 10 ? 'text-amber-400' : 'text-rose-400'}`}>{w.margin.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-600">
                  <tr className="font-semibold">
                    <td className="py-2 text-white">Total</td>
                    <td className="py-2 text-right text-white">{formatCurrency(totals.revenue)}</td>
                    <td className="py-2 text-right text-rose-400">{formatCurrency(totals.cogs)}</td>
                    <td className="py-2 text-right text-orange-400">{formatCurrency(totals.amazonFees)}</td>
                    <td className="py-2 text-right text-blue-400">{formatCurrency(totals.threeplCosts)}</td>
                    <td className="py-2 text-right text-purple-400">{formatCurrency(totals.adSpend)}</td>
                    <td className={`py-2 text-right ${totals.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(totals.profit)}</td>
                    <td className={`py-2 text-right ${pcts.profit >= 20 ? 'text-emerald-400' : pcts.profit >= 10 ? 'text-amber-400' : 'text-rose-400'}`}>{pcts.profit.toFixed(1)}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          
          {/* Cost % Trends Chart */}
          {costTrends.length >= 4 && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">Margin Trend Over Time ({costTrends.length} weeks)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left text-slate-400 py-2">Week</th>
                      <th className="text-right text-slate-400 py-2">Revenue</th>
                      <th className="text-right text-slate-400 py-2">COGS %</th>
                      <th className="text-right text-slate-400 py-2">Ads %</th>
                      <th className="text-right text-slate-400 py-2">Fees %</th>
                      <th className="text-right text-slate-400 py-2">Net Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costTrends.map(t => (
                      <tr key={t.week} className="border-b border-slate-700/50">
                        <td className="py-2 text-white">{new Date(t.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                        <td className="py-2 text-right text-white">{formatCurrency(t.revenue)}</td>
                        <td className="py-2 text-right text-rose-400">{t.cogsPct.toFixed(1)}%</td>
                        <td className="py-2 text-right text-purple-400">{t.adsPct.toFixed(1)}%</td>
                        <td className="py-2 text-right text-orange-400">{t.feesPct.toFixed(1)}%</td>
                        <td className={`py-2 text-right font-semibold ${t.margin >= 20 ? 'text-emerald-400' : t.margin >= 10 ? 'text-amber-400' : t.margin >= 0 ? 'text-white' : 'text-rose-400'}`}>{t.margin.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {/* Break-even Analysis */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
            <h3 className="text-lg font-semibold text-white mb-4">Break-Even Analysis</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-slate-400 text-sm mb-2">Your average costs are <span className="text-white font-semibold">{(100 - pcts.profit).toFixed(1)}%</span> of revenue</p>
                <p className="text-slate-400 text-sm mb-2">For every <span className="text-white font-semibold">$1,000</span> in revenue, you keep <span className={`font-semibold ${pcts.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(pcts.profit * 10)}</span></p>
                <p className="text-slate-400 text-sm mb-4">Average Order Value: <span className="text-white font-semibold">{formatCurrency(avgOrderValue)}</span></p>
                
                <div className="bg-slate-900/50 rounded-lg p-4">
                  <p className="text-white font-semibold mb-2">🎯 To increase margin by 5%:</p>
                  <ul className="text-slate-400 text-sm space-y-1">
                    <li>• Reduce COGS by {formatCurrency(totals.revenue * 0.05)} (negotiate suppliers)</li>
                    <li>• Cut ad spend by {((totals.adSpend * 0.05 / totals.revenue) * 100 / pcts.adSpend * 100).toFixed(0)}% (optimize targeting)</li>
                    <li>• Increase prices by ~{(5 / (100 - pcts.profit) * 100).toFixed(1)}%</li>
                  </ul>
                </div>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <p className="text-slate-500 text-xs uppercase mb-2">Revenue Breakdown</p>
                <div className="h-6 bg-slate-700 rounded-full overflow-hidden flex mb-2">
                  <div className="bg-rose-500 h-full" style={{ width: `${pcts.cogs}%` }} title={`COGS: ${pcts.cogs.toFixed(1)}%`} />
                  <div className="bg-orange-500 h-full" style={{ width: `${pcts.amazonFees}%` }} title={`Fees: ${pcts.amazonFees.toFixed(1)}%`} />
                  <div className="bg-blue-500 h-full" style={{ width: `${pcts.threeplCosts}%` }} title={`3PL: ${pcts.threeplCosts.toFixed(1)}%`} />
                  <div className="bg-purple-500 h-full" style={{ width: `${pcts.adSpend}%` }} title={`Ads: ${pcts.adSpend.toFixed(1)}%`} />
                  <div className={`${pcts.profit >= 0 ? 'bg-emerald-500' : 'bg-rose-600'} h-full`} style={{ width: `${Math.abs(pcts.profit)}%` }} />
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-rose-500 rounded" />COGS {pcts.cogs.toFixed(0)}%</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-orange-500 rounded" />Fees {pcts.amazonFees.toFixed(0)}%</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-500 rounded" />3PL {pcts.threeplCosts.toFixed(0)}%</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-purple-500 rounded" />Ads {pcts.adSpend.toFixed(0)}%</span>
                  <span className="flex items-center gap-1"><span className={`w-2 h-2 ${pcts.profit >= 0 ? 'bg-emerald-500' : 'bg-rose-600'} rounded`} />Profit {pcts.profit.toFixed(0)}%</span>
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
        <div className="max-w-7xl mx-auto"><Toast /><ValidationModal />{aiChatUI}{aiChatButton}<CogsManager /><ProductCatalogModal /><UploadHelpModal /><ForecastModal /><BreakEvenModal /><ExportModal /><ComparisonView /><InvoiceModal /><GoalsModal />
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

  // ==================== SALES TAX VIEW ====================
  if (view === 'sales-tax') {
    const { nexusStates, filingHistory, hiddenStates } = salesTaxConfig;
    
    // Get states with nexus sorted by next due date
    const nexusStatesList = Object.entries(nexusStates || {})
      .filter(([code, config]) => config.hasNexus)
      .map(([code, config]) => ({
        code,
        ...US_STATES_TAX_INFO[code],
        ...config,
        nextDue: getNextDueDate(config.frequency || 'monthly', code)
      }))
      .sort((a, b) => a.nextDue - b.nextDue);
    
    // Calculate upcoming due items
    const now = new Date();
    const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    const overdue = nexusStatesList.filter(s => s.nextDue < now);
    const dueSoon = nexusStatesList.filter(s => s.nextDue >= now && s.nextDue <= sevenDays);
    const upcoming = nexusStatesList.filter(s => s.nextDue > sevenDays && s.nextDue <= thirtyDays);
    
    // Handle tax report file upload
    const handleTaxReportUpload = (file, stateCode) => {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = parseCSV(e.target.result);
        const parsed = parseShopifyTaxReport(data, stateCode);
        setParsedTaxReport(parsed);
        setTaxReportFileName(file.name);
      };
      reader.readAsText(file);
    };
    
    // Toggle nexus for a state
    const toggleNexus = (stateCode) => {
      const updated = { ...salesTaxConfig };
      if (!updated.nexusStates) updated.nexusStates = {};
      if (!updated.nexusStates[stateCode]) {
        updated.nexusStates[stateCode] = { hasNexus: true, frequency: 'monthly', registrationId: '', customFilings: [], notes: '' };
      } else {
        updated.nexusStates[stateCode].hasNexus = !updated.nexusStates[stateCode].hasNexus;
      }
      saveSalesTax(updated);
    };
    
    // Toggle hidden state
    const toggleHideState = (stateCode) => {
      const updated = { ...salesTaxConfig };
      if (!updated.hiddenStates) updated.hiddenStates = [];
      if (updated.hiddenStates.includes(stateCode)) {
        updated.hiddenStates = updated.hiddenStates.filter(s => s !== stateCode);
      } else {
        updated.hiddenStates = [...updated.hiddenStates, stateCode];
      }
      saveSalesTax(updated);
    };
    
    // Update state config
    const updateStateConfig = (stateCode, field, value) => {
      const updated = { ...salesTaxConfig };
      if (!updated.nexusStates) updated.nexusStates = {};
      if (!updated.nexusStates[stateCode]) {
        updated.nexusStates[stateCode] = { hasNexus: false, frequency: 'monthly', registrationId: '', customFilings: [], notes: '' };
      }
      updated.nexusStates[stateCode][field] = value;
      saveSalesTax(updated);
    };
    
    // Add custom filing to a state
    const addCustomFiling = (stateCode, filing) => {
      const updated = { ...salesTaxConfig };
      if (!updated.nexusStates[stateCode].customFilings) {
        updated.nexusStates[stateCode].customFilings = [];
      }
      updated.nexusStates[stateCode].customFilings.push(filing);
      saveSalesTax(updated);
    };
    
    // Remove custom filing
    const removeCustomFiling = (stateCode, index) => {
      const updated = { ...salesTaxConfig };
      updated.nexusStates[stateCode].customFilings.splice(index, 1);
      saveSalesTax(updated);
    };
    
    // Mark filing as complete
    const markFilingComplete = (stateCode, periodKey, data) => {
      const updated = { ...salesTaxConfig };
      if (!updated.filingHistory[stateCode]) {
        updated.filingHistory[stateCode] = {};
      }
      updated.filingHistory[stateCode][periodKey] = {
        filed: true,
        filedDate: new Date().toISOString(),
        ...data
      };
      saveSalesTax(updated);
      setParsedTaxReport(null);
      setTaxReportFileName('');
    };
    
    // State configuration modal
    const StateConfigModal = () => {
      if (!showTaxStateConfig || !taxConfigState) return null;
      const stateInfo = US_STATES_TAX_INFO[taxConfigState];
      const config = (nexusStates || {})[taxConfigState] || { hasNexus: false, frequency: 'monthly', registrationId: '', customFilings: [], notes: '' };
      
      return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-2xl w-full my-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">{stateInfo?.name || taxConfigState}</h2>
                <p className="text-slate-400 text-sm">Configure sales tax settings</p>
              </div>
              <button onClick={() => { setShowTaxStateConfig(false); setTaxConfigState(null); }} className="p-2 hover:bg-slate-700 rounded-lg"><Trash2 className="w-5 h-5 text-slate-400" /></button>
            </div>
            
            {/* Basic Info */}
            <div className="space-y-4 mb-6">
              <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl">
                <span className="text-white">Nexus Established</span>
                <button onClick={() => toggleNexus(taxConfigState)} className={`w-12 h-6 rounded-full transition-colors ${config.hasNexus ? 'bg-emerald-500' : 'bg-slate-600'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${config.hasNexus ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-2">Filing Frequency</label>
                <select value={config.frequency || 'monthly'} onChange={(e) => updateStateConfig(taxConfigState, 'frequency', e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white">
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="semi-annual">Semi-Annual</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-2">State Registration / Account ID</label>
                <input type="text" value={config.registrationId || ''} onChange={(e) => updateStateConfig(taxConfigState, 'registrationId', e.target.value)} placeholder="e.g., 12-345678-9" className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white" />
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-2">Notes</label>
                <textarea value={config.notes || ''} onChange={(e) => updateStateConfig(taxConfigState, 'notes', e.target.value)} placeholder="Any notes about this state's requirements..." rows={2} className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white" />
              </div>
            </div>
            
            {/* State Info */}
            {stateInfo && (
              <div className="bg-slate-900/50 rounded-xl p-4 mb-6">
                <h4 className="text-sm font-semibold text-slate-300 mb-3">State Tax Information</h4>
                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                  <div className="bg-slate-800/50 rounded-lg p-2">
                    <span className="text-slate-500 text-xs">Base State Rate</span>
                    <p className="text-white font-semibold">{(stateInfo.stateRate * 100).toFixed(2)}%</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-2">
                    <span className="text-slate-500 text-xs">Filing Types</span>
                    <p className="text-white font-semibold capitalize">{stateInfo.filingTypes?.join(', ') || 'N/A'}</p>
                  </div>
                </div>
                
                {/* Economic Nexus Thresholds */}
                {stateInfo.nexusThreshold && (
                  <div className="bg-violet-900/20 border border-violet-500/30 rounded-lg p-3 mb-3">
                    <h5 className="text-violet-400 text-xs font-semibold mb-2">Economic Nexus Threshold</h5>
                    <div className="flex gap-4 text-sm">
                      {stateInfo.nexusThreshold.sales && (
                        <div>
                          <span className="text-slate-400">Sales:</span>
                          <span className="text-white ml-1 font-semibold">{formatCurrency(stateInfo.nexusThreshold.sales)}</span>
                        </div>
                      )}
                      {stateInfo.nexusThreshold.transactions && (
                        <div>
                          <span className="text-slate-400">Transactions:</span>
                          <span className="text-white ml-1 font-semibold">{stateInfo.nexusThreshold.transactions}+</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Features */}
                <div className="flex flex-wrap gap-2 mb-2">
                  {stateInfo.marketplaceFacilitator && (
                    <span className="px-2 py-1 bg-emerald-900/30 border border-emerald-500/30 rounded text-xs text-emerald-400">Marketplace Facilitator Law</span>
                  )}
                  {stateInfo.sst && (
                    <span className="px-2 py-1 bg-blue-900/30 border border-blue-500/30 rounded text-xs text-blue-400">SST Member</span>
                  )}
                </div>
                
                {stateInfo.note && (
                  <div className="flex items-start gap-2 text-amber-400 text-xs mt-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{stateInfo.note}</span>
                  </div>
                )}
              </div>
            )}
            
            {/* Custom Filings */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-slate-300 mb-3">Additional Filings (LLC Fees, Annual Reports, etc.)</h4>
              
              {config.customFilings?.length > 0 && (
                <div className="space-y-2 mb-4">
                  {config.customFilings.map((f, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                      <div>
                        <span className="text-white">{f.name}</span>
                        <span className="text-slate-500 text-sm ml-2">({f.frequency}, due {f.dueMonth}/{f.dueDay})</span>
                        {f.amount && <span className="text-emerald-400 text-sm ml-2">{formatCurrency(parseFloat(f.amount))}</span>}
                      </div>
                      <button onClick={() => removeCustomFiling(taxConfigState, i)} className="text-rose-400 hover:text-rose-300"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-3 mb-3">
                <input type="text" value={newCustomFiling.name} onChange={(e) => setNewCustomFiling(p => ({ ...p, name: e.target.value }))} placeholder="Filing name (e.g., LLC Annual Fee)" className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
                <select value={newCustomFiling.frequency} onChange={(e) => setNewCustomFiling(p => ({ ...p, frequency: e.target.value }))} className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm">
                  <option value="annual">Annual</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="monthly">Monthly</option>
                </select>
                <div className="flex gap-2">
                  <input type="number" value={newCustomFiling.dueMonth} onChange={(e) => setNewCustomFiling(p => ({ ...p, dueMonth: e.target.value }))} placeholder="Month" min="1" max="12" className="w-1/2 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
                  <input type="number" value={newCustomFiling.dueDay} onChange={(e) => setNewCustomFiling(p => ({ ...p, dueDay: e.target.value }))} placeholder="Day" min="1" max="31" className="w-1/2 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
                </div>
                <input type="number" value={newCustomFiling.amount} onChange={(e) => setNewCustomFiling(p => ({ ...p, amount: e.target.value }))} placeholder="Amount ($)" className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
              </div>
              <button onClick={() => { if (newCustomFiling.name) { addCustomFiling(taxConfigState, newCustomFiling); setNewCustomFiling({ name: '', frequency: 'annual', dueMonth: 0, dueDay: 15, amount: '' }); }}} disabled={!newCustomFiling.name} className="w-full py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg text-sm text-white">Add Filing</button>
            </div>
            
            <div className="flex gap-3">
              <button onClick={() => toggleHideState(taxConfigState)} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white">{hiddenStates.includes(taxConfigState) ? 'Unhide State' : 'Hide State'}</button>
              <button onClick={() => { setShowTaxStateConfig(false); setTaxConfigState(null); }} className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm text-white font-semibold">Done</button>
            </div>
          </div>
        </div>
      );
    };
    
    // Filing detail modal with report upload
    const FilingDetailModal = () => {
      if (!selectedTaxState) return null;
      const stateInfo = US_STATES_TAX_INFO[selectedTaxState];
      const config = (nexusStates || {})[selectedTaxState] || {};
      const nextDue = getNextDueDate(config.frequency || 'monthly', selectedTaxState);
      const periodKey = config.frequency === 'monthly' 
        ? `${nextDue.getFullYear()}-${String(nextDue.getMonth()).padStart(2, '0')}`
        : config.frequency === 'quarterly'
        ? `${nextDue.getFullYear()}-Q${Math.ceil((nextDue.getMonth() + 1) / 3)}`
        : `${nextDue.getFullYear()}`;
      
      return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-4xl w-full my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">{stateInfo?.name} - Sales Tax Filing</h2>
                <p className="text-slate-400 text-sm">Due: {nextDue.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              </div>
              <button onClick={() => { setSelectedTaxState(null); setParsedTaxReport(null); setTaxReportFileName(''); }} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400">✕</button>
            </div>
            
            {/* Upload Tax Report */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Upload Shopify Tax Report</h3>
              <div className={`relative border-2 border-dashed rounded-xl p-6 ${taxReportFileName ? 'border-emerald-500/50 bg-emerald-950/20' : 'border-slate-600 hover:border-slate-500 bg-slate-800/30'}`}>
                <input type="file" accept=".csv" onChange={(e) => handleTaxReportUpload(e.target.files[0], selectedTaxState)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                <div className="text-center">
                  {taxReportFileName ? (
                    <><Check className="w-8 h-8 text-emerald-400 mx-auto mb-2" /><p className="text-emerald-400">{taxReportFileName}</p></>
                  ) : (
                    <><Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" /><p className="text-slate-400">Drop Shopify tax report CSV or click to upload</p><p className="text-slate-500 text-xs mt-1">Analytics → Reports → Taxes → Export by jurisdiction</p></>
                  )}
                </div>
              </div>
            </div>
            
            {/* Parsed Report */}
            {parsedTaxReport && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">Tax Report Summary</h3>
                
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-slate-900/50 rounded-xl p-4">
                    <p className="text-slate-400 text-xs">Total Sales</p>
                    <p className="text-xl font-bold text-white">{formatCurrency(parsedTaxReport.totalSales)}</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-xl p-4">
                    <p className="text-slate-400 text-xs">Taxable Sales</p>
                    <p className="text-xl font-bold text-emerald-400">{formatCurrency(parsedTaxReport.totalTaxableSales)}</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-xl p-4">
                    <p className="text-slate-400 text-xs">Exempt Sales</p>
                    <p className="text-xl font-bold text-slate-300">{formatCurrency(parsedTaxReport.totalExemptSales)}</p>
                  </div>
                  <div className="bg-rose-900/30 border border-rose-500/30 rounded-xl p-4">
                    <p className="text-rose-400 text-xs">Tax Collected</p>
                    <p className="text-xl font-bold text-white">{formatCurrency(parsedTaxReport.totalTaxCollected)}</p>
                  </div>
                </div>
                
                {/* Tax Breakdown by Type */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="bg-violet-900/20 border border-violet-500/30 rounded-lg p-3">
                    <p className="text-violet-400 text-xs">State Tax</p>
                    <p className="text-lg font-semibold text-white">{formatCurrency(parsedTaxReport.stateTax)}</p>
                  </div>
                  <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
                    <p className="text-blue-400 text-xs">County Tax</p>
                    <p className="text-lg font-semibold text-white">{formatCurrency(parsedTaxReport.countyTax)}</p>
                  </div>
                  <div className="bg-teal-900/20 border border-teal-500/30 rounded-lg p-3">
                    <p className="text-teal-400 text-xs">City Tax</p>
                    <p className="text-lg font-semibold text-white">{formatCurrency(parsedTaxReport.cityTax)}</p>
                  </div>
                  <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3">
                    <p className="text-amber-400 text-xs">Special Tax</p>
                    <p className="text-lg font-semibold text-white">{formatCurrency(parsedTaxReport.specialTax)}</p>
                  </div>
                </div>
                
                {/* Jurisdiction Details */}
                <div className="bg-slate-900/50 rounded-xl overflow-hidden">
                  <div className="p-3 border-b border-slate-700">
                    <h4 className="text-sm font-semibold text-slate-300">Jurisdiction Breakdown</h4>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-800 sticky top-0">
                        <tr>
                          <th className="text-left p-2 text-slate-400">Jurisdiction</th>
                          <th className="text-left p-2 text-slate-400">Type</th>
                          <th className="text-right p-2 text-slate-400">Rate</th>
                          <th className="text-right p-2 text-slate-400">Taxable</th>
                          <th className="text-right p-2 text-slate-400">Tax Due</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedTaxReport.jurisdictions.map((j, i) => (
                          <tr key={i} className="border-b border-slate-700/50">
                            <td className="p-2 text-white">{j.name}{j.county && <span className="text-slate-500 text-xs ml-1">({j.county})</span>}</td>
                            <td className="p-2 capitalize text-slate-400">{j.type}</td>
                            <td className="p-2 text-right text-slate-300">{(j.rate * 100).toFixed(3)}%</td>
                            <td className="p-2 text-right text-slate-300">{formatCurrency(j.taxableSales)}</td>
                            <td className="p-2 text-right font-semibold text-emerald-400">{formatCurrency(j.taxAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
            
            {/* Filing Confirmation */}
            <div className="border-t border-slate-700 pt-6">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Mark as Filed</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Confirmation Number</label>
                  <input type="text" value={taxFilingConfirmNum} onChange={(e) => setTaxFilingConfirmNum(e.target.value)} placeholder="State confirmation #" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Amount Paid</label>
                  <input type="number" value={taxFilingPaidAmount} onChange={(e) => setTaxFilingPaidAmount(e.target.value)} placeholder={parsedTaxReport ? parsedTaxReport.totalTaxCollected.toFixed(2) : '0.00'} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Notes</label>
                  <input type="text" value={taxFilingNotes} onChange={(e) => setTaxFilingNotes(e.target.value)} placeholder="Any notes..." className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
                </div>
              </div>
              <button 
                onClick={() => markFilingComplete(selectedTaxState, periodKey, { 
                  confirmationNum: taxFilingConfirmNum, 
                  amount: parseFloat(taxFilingPaidAmount) || parsedTaxReport?.totalTaxCollected || 0,
                  notes: taxFilingNotes,
                  reportData: parsedTaxReport 
                })}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-semibold text-white"
              >
                <Check className="w-5 h-5 inline mr-2" />Mark as Filed & Paid
              </button>
            </div>
          </div>
        </div>
      );
    };
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 lg:p-6">
        <div className="max-w-7xl mx-auto"><Toast /><ValidationModal />{aiChatUI}{aiChatButton}<CogsManager /><ProductCatalogModal /><UploadHelpModal /><ForecastModal /><BreakEvenModal /><ExportModal /><ComparisonView /><InvoiceModal /><GoalsModal /><StateConfigModal /><FilingDetailModal />
          
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-white">Sales Tax Management</h1>
              <p className="text-slate-400">Track nexus, filings, and compliance across states</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-slate-400 text-sm">{Object.values(nexusStates).filter(s => s.hasNexus).length} states with nexus</span>
            </div>
          </div>
          
          <NavTabs />
          
          {/* Alerts */}
          {(overdue.length > 0 || dueSoon.length > 0) && (
            <div className="mb-6 space-y-2">
              {overdue.map(s => (
                <div key={s.code} className="flex items-center justify-between p-3 bg-rose-900/30 border border-rose-500/50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-400" />
                    <span className="text-rose-300"><strong>{s.name}</strong> filing is overdue! Was due {s.nextDue.toLocaleDateString()}</span>
                  </div>
                  <button onClick={() => setSelectedTaxState(s.code)} className="px-3 py-1 bg-rose-600 hover:bg-rose-500 rounded-lg text-sm text-white">File Now</button>
                </div>
              ))}
              {dueSoon.map(s => (
                <div key={s.code} className="flex items-center justify-between p-3 bg-amber-900/30 border border-amber-500/50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-amber-400" />
                    <span className="text-amber-300"><strong>{s.name}</strong> due in {Math.ceil((s.nextDue - now) / (1000 * 60 * 60 * 24))} days ({s.nextDue.toLocaleDateString()})</span>
                  </div>
                  <button onClick={() => setSelectedTaxState(s.code)} className="px-3 py-1 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm text-white">File</button>
                </div>
              ))}
            </div>
          )}
          
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5">
              <p className="text-slate-400 text-sm">States with Nexus</p>
              <p className="text-3xl font-bold text-white">{nexusStatesList.length}</p>
            </div>
            <div className="bg-rose-900/20 border border-rose-500/30 rounded-2xl p-5">
              <p className="text-rose-400 text-sm">Overdue</p>
              <p className="text-3xl font-bold text-rose-400">{overdue.length}</p>
            </div>
            <div className="bg-amber-900/20 border border-amber-500/30 rounded-2xl p-5">
              <p className="text-amber-400 text-sm">Due Within 7 Days</p>
              <p className="text-3xl font-bold text-amber-400">{dueSoon.length}</p>
            </div>
            <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-2xl p-5">
              <p className="text-emerald-400 text-sm">Upcoming (30 days)</p>
              <p className="text-3xl font-bold text-emerald-400">{upcoming.length}</p>
            </div>
          </div>
          
          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Nexus States List */}
            <div className="lg:col-span-2 bg-slate-800/50 rounded-2xl border border-slate-700 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Your Nexus States</h3>
                <select value={taxFilterStatus} onChange={(e) => setTaxFilterStatus(e.target.value)} className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white">
                  <option value="all">All States</option>
                  <option value="due">Overdue</option>
                  <option value="upcoming">Due Soon</option>
                </select>
              </div>
              
              {nexusStatesList.length === 0 ? (
                <div className="text-center py-8">
                  <DollarSign className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400">No nexus states configured</p>
                  <p className="text-slate-500 text-sm">Add states from the list on the right</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {nexusStatesList
                    .filter(s => taxFilterStatus === 'all' || (taxFilterStatus === 'due' && s.nextDue < now) || (taxFilterStatus === 'upcoming' && s.nextDue >= now && s.nextDue <= sevenDays))
                    .map(state => {
                      const isOverdue = state.nextDue < now;
                      const isDueSoon = state.nextDue >= now && state.nextDue <= sevenDays;
                      return (
                        <div key={state.code} className={`flex items-center justify-between p-4 rounded-xl transition-colors ${isOverdue ? 'bg-rose-900/20 border border-rose-500/30' : isDueSoon ? 'bg-amber-900/20 border border-amber-500/30' : 'bg-slate-900/50 hover:bg-slate-700/50'}`}>
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${isOverdue ? 'bg-rose-600' : isDueSoon ? 'bg-amber-600' : 'bg-slate-700'}`}>{state.code}</div>
                            <div>
                              <p className="text-white font-medium">{state.name}</p>
                              <p className="text-slate-400 text-sm capitalize">{state.frequency} filing • {state.registrationId || 'No ID set'}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className={`text-sm font-medium ${isOverdue ? 'text-rose-400' : isDueSoon ? 'text-amber-400' : 'text-slate-300'}`}>
                                {isOverdue ? 'Overdue' : `Due ${state.nextDue.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                              </p>
                              <p className="text-slate-500 text-xs">{Math.ceil((state.nextDue - now) / (1000 * 60 * 60 * 24))} days</p>
                            </div>
                            <button onClick={() => setSelectedTaxState(state.code)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg" title="File/Upload Report"><Upload className="w-4 h-4" /></button>
                            <button onClick={() => setViewingStateHistory(state.code)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg" title="View History"><FileText className="w-4 h-4" /></button>
                            <button onClick={() => { setTaxConfigState(state.code); setShowTaxStateConfig(true); }} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg" title="Settings"><Settings className="w-4 h-4" /></button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
            
            {/* State Selector */}
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Add States</h3>
                <button onClick={() => setShowHiddenStates(!showHiddenStates)} className="text-xs text-slate-400 hover:text-slate-300">{showHiddenStates ? 'Hide' : 'Show'} Hidden ({(hiddenStates || []).length})</button>
              </div>
              
              <div className="space-y-1 max-h-[500px] overflow-y-auto">
                {Object.entries(US_STATES_TAX_INFO)
                  .filter(([code]) => !(hiddenStates || []).includes(code) || showHiddenStates)
                  .filter(([code]) => !nexusStates[code]?.hasNexus)
                  .sort(([, a], [, b]) => a.name.localeCompare(b.name))
                  .map(([code, info]) => (
                    <div key={code} className={`flex items-center justify-between p-2 rounded-lg hover:bg-slate-700/50 ${hiddenStates.includes(code) ? 'opacity-50' : ''}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-500 w-6">{code}</span>
                        <span className="text-white text-sm">{info.name}</span>
                        {!info.hasStateTax && <span className="text-xs text-emerald-400">(No tax)</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        {info.hasStateTax && (
                          <button onClick={() => toggleNexus(code)} className="px-2 py-1 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/50 rounded text-xs text-emerald-300">+ Add</button>
                        )}
                        <button onClick={() => toggleHideState(code)} className="p-1 text-slate-500 hover:text-slate-300"><Eye className="w-3 h-3" /></button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
          
          {/* Filing History */}
          {Object.keys(filingHistory || {}).length > 0 && (
            <div className="mt-6 bg-slate-800/50 rounded-2xl border border-slate-700 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Filing History</h3>
                <div className="flex items-center gap-2">
                  <select 
                    value={viewingStateHistory || 'all'} 
                    onChange={(e) => setViewingStateHistory(e.target.value === 'all' ? null : e.target.value)} 
                    className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white"
                  >
                    <option value="all">All States</option>
                    {Object.keys(filingHistory || {}).sort().map(code => (
                      <option key={code} value={code}>{US_STATES_TAX_INFO[code]?.name || code}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left p-3 text-slate-400">State</th>
                      <th className="text-left p-3 text-slate-400">Period</th>
                      <th className="text-right p-3 text-slate-400">Amount Paid</th>
                      <th className="text-left p-3 text-slate-400">Confirmation #</th>
                      <th className="text-left p-3 text-slate-400">Filed Date</th>
                      <th className="text-left p-3 text-slate-400">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(filingHistory || {})
                      .filter(([stateCode]) => !viewingStateHistory || stateCode === viewingStateHistory)
                      .flatMap(([stateCode, periods]) => 
                        Object.entries(periods || {})
                          .sort(([a], [b]) => b.localeCompare(a))
                          .map(([period, data]) => (
                            <tr key={`${stateCode}-${period}`} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  <span className="w-8 h-8 bg-slate-700 rounded flex items-center justify-center text-xs font-bold text-white">{stateCode}</span>
                                  <span className="text-white">{US_STATES_TAX_INFO[stateCode]?.name || stateCode}</span>
                                </div>
                              </td>
                              <td className="p-3 text-slate-300">{period}</td>
                              <td className="p-3 text-right text-emerald-400 font-semibold">{formatCurrency(data.amount || 0)}</td>
                              <td className="p-3 text-slate-400 font-mono text-xs">{data.taxFilingConfirmNumationNum || data.confirmationNum || '-'}</td>
                              <td className="p-3 text-slate-400">{data.filedDate ? new Date(data.filedDate).toLocaleDateString() : '-'}</td>
                              <td className="p-3 text-slate-500 text-xs max-w-[200px] truncate">{data.notes || '-'}</td>
                            </tr>
                          ))
                      )}
                  </tbody>
                </table>
              </div>
              {/* Totals by State */}
              <div className="mt-4 pt-4 border-t border-slate-700">
                <h4 className="text-sm font-semibold text-slate-300 mb-3">Total Paid by State</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {Object.entries(filingHistory || {}).map(([stateCode, periods]) => {
                    const total = Object.values(periods || {}).reduce((sum, p) => sum + (p.amount || 0), 0);
                    const count = Object.keys(periods || {}).length;
                    return (
                      <div key={stateCode} className="bg-slate-900/50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-400">{stateCode}</span>
                          <span className="text-xs text-slate-500">{count} filings</span>
                        </div>
                        <p className="text-lg font-bold text-emerald-400">{formatCurrency(total)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          
          {/* Economic Nexus Reference Guide */}
          <div className="mt-6 bg-slate-800/50 rounded-2xl border border-slate-700 p-5">
            <h3 className="text-lg font-semibold text-white mb-2">Economic Nexus Quick Reference</h3>
            <p className="text-slate-400 text-sm mb-4">Remote seller thresholds that trigger sales tax collection requirements (post-Wayfair)</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
              {/* High Threshold States */}
              <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4">
                <h4 className="text-emerald-400 font-semibold mb-2 flex items-center gap-2"><Check className="w-4 h-4" />High Threshold ($500K+)</h4>
                <div className="text-sm text-slate-300 space-y-1">
                  <p><span className="text-white font-medium">California:</span> $500K sales</p>
                  <p><span className="text-white font-medium">New York:</span> $500K + 100 transactions</p>
                  <p><span className="text-white font-medium">Texas:</span> $500K sales</p>
                </div>
              </div>
              
              {/* Standard Threshold States */}
              <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
                <h4 className="text-blue-400 font-semibold mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Standard Threshold ($100K)</h4>
                <p className="text-slate-400 text-sm">Most states: $100K sales OR 200 transactions (some states removed transaction threshold)</p>
              </div>
              
              {/* Special Cases */}
              <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4">
                <h4 className="text-amber-400 font-semibold mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Special Requirements</h4>
                <div className="text-sm text-slate-300 space-y-1">
                  <p><span className="text-white font-medium">Colorado:</span> Home-rule cities separate</p>
                  <p><span className="text-white font-medium">Louisiana:</span> Parish filing required</p>
                  <p><span className="text-white font-medium">Alaska:</span> Local only (ARSSTC)</p>
                </div>
              </div>
            </div>
            
            {/* SST Member States */}
            <div className="bg-slate-900/50 rounded-xl p-4">
              <h4 className="text-slate-300 font-semibold mb-2">Streamlined Sales Tax (SST) Member States</h4>
              <p className="text-slate-500 text-xs mb-2">These states offer simplified registration and filing through the SST system</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(US_STATES_TAX_INFO)
                  .filter(([, info]) => info.sst)
                  .map(([code]) => (
                    <span key={code} className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300">{code}</span>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== SETTINGS VIEW ====================
  if (view === 'settings') {
    // Default settings structure
    const defaultSettings = {
      inventoryDaysOptimal: 60,
      inventoryDaysLow: 30,
      inventoryDaysCritical: 14,
      tacosOptimal: 15,
      tacosWarning: 25,
      tacosMax: 35,
      roasTarget: 3.0,
      marginTarget: 25,
      marginWarning: 15,
      modulesEnabled: {
        weeklyTracking: true,
        periodTracking: true,
        inventory: true,
        trends: true,
        yoy: true,
        skus: true,
        profitability: true,
        ads: true,
        threepl: true,
        salesTax: true,
      },
      dashboardDefaultRange: 'month',
      showWeeklyGoals: true,
      showMonthlyGoals: true,
      alertSalesTaxDays: 7,
      alertInventoryEnabled: true,
      alertGoalsEnabled: true,
      alertSalesTaxEnabled: true,
      currencySymbol: '$',
      dateFormat: 'US',
    };
    
    // Merge defaults with saved settings
    const currentLocalSettings = {
      ...defaultSettings,
      ...(localSettings || appSettings),
      modulesEnabled: {
        ...defaultSettings.modulesEnabled,
        ...((localSettings || appSettings)?.modulesEnabled || {}),
      }
    };
    
    const updateSetting = (path, value) => {
      setLocalSettings(prev => {
        const base = prev || appSettings || defaultSettings;
        const updated = JSON.parse(JSON.stringify({ ...defaultSettings, ...base })); // Deep clone with defaults
        const keys = path.split('.');
        let obj = updated;
        for (let i = 0; i < keys.length - 1; i++) {
          if (!obj[keys[i]]) obj[keys[i]] = {};
          obj = obj[keys[i]];
        }
        obj[keys[keys.length - 1]] = value;
        return updated;
      });
    };
    
    const handleSave = () => {
      saveSettings(currentLocalSettings);
      setShowSaveConfirm(true);
      setTimeout(() => setShowSaveConfirm(false), 2000);
    };
    
    const resetToDefaults = () => {
      setLocalSettings(defaultSettings);
      setShowResetConfirm(false);
    };
    
    const SettingSection = ({ title, children }) => (
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
        {children}
      </div>
    );
    
    const SettingRow = ({ label, desc, children }) => (
      <div className="flex items-center justify-between py-3 border-b border-slate-700/50 last:border-0">
        <div className="flex-1 pr-4">
          <p className="text-white font-medium">{label}</p>
          {desc && <p className="text-slate-400 text-sm">{desc}</p>}
        </div>
        <div className="flex-shrink-0">{children}</div>
      </div>
    );
    
    const Toggle = ({ checked, onChange }) => (
      <button onClick={() => onChange(!checked)} className={`w-12 h-6 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-600'}`}>
        <div className={`w-5 h-5 bg-white rounded-full transition-transform ${checked ? 'translate-x-6' : 'translate-x-0.5'}`} />
      </button>
    );
    
    const NumberInput = ({ value, onChange, min, max, step = 1, suffix = '' }) => (
      <div className="flex items-center gap-2">
        <input type="number" value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} min={min} max={max} step={step} className="w-20 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-right" />
        {suffix && <span className="text-slate-400 text-sm">{suffix}</span>}
      </div>
    );
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 lg:p-6">
        <div className="max-w-4xl mx-auto"><Toast /><ValidationModal />{aiChatUI}{aiChatButton}<CogsManager /><ProductCatalogModal /><UploadHelpModal /><ForecastModal /><BreakEvenModal /><ExportModal /><ComparisonView /><InvoiceModal /><GoalsModal />
          
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-white">Settings</h1>
              <p className="text-slate-400">Customize your dashboard experience</p>
            </div>
            <button onClick={handleSave} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-semibold text-white flex items-center gap-2"><Check className="w-5 h-5" />Save Changes</button>
          </div>
          
          <NavTabs />
          
          {/* Inventory Thresholds */}
          <SettingSection title="📦 Inventory Thresholds">
            <p className="text-slate-400 text-sm mb-4">Define what stock levels trigger alerts</p>
            <SettingRow label="Optimal Days of Inventory" desc="Stock level considered healthy">
              <NumberInput value={currentLocalSettings.inventoryDaysOptimal} onChange={(v) => updateSetting('inventoryDaysOptimal', v)} min={1} max={365} suffix="days" />
            </SettingRow>
            <SettingRow label="Low Stock Threshold" desc="Triggers low stock warning">
              <NumberInput value={currentLocalSettings.inventoryDaysLow} onChange={(v) => updateSetting('inventoryDaysLow', v)} min={1} max={180} suffix="days" />
            </SettingRow>
            <SettingRow label="Critical Stock Threshold" desc="Triggers urgent reorder alert">
              <NumberInput value={currentLocalSettings.inventoryDaysCritical} onChange={(v) => updateSetting('inventoryDaysCritical', v)} min={1} max={60} suffix="days" />
            </SettingRow>
          </SettingSection>
          
          {/* Ad Performance */}
          <SettingSection title="📊 Ad Performance (TACOS)">
            <p className="text-slate-400 text-sm mb-4">Total Advertising Cost of Sale thresholds</p>
            <SettingRow label="Optimal TACOS" desc="Ad spend % of revenue considered good">
              <NumberInput value={currentLocalSettings.tacosOptimal} onChange={(v) => updateSetting('tacosOptimal', v)} min={1} max={50} suffix="%" />
            </SettingRow>
            <SettingRow label="Warning TACOS" desc="Triggers yellow warning indicator">
              <NumberInput value={currentLocalSettings.tacosWarning} onChange={(v) => updateSetting('tacosWarning', v)} min={1} max={75} suffix="%" />
            </SettingRow>
            <SettingRow label="Maximum TACOS" desc="Triggers red alert indicator">
              <NumberInput value={currentLocalSettings.tacosMax} onChange={(v) => updateSetting('tacosMax', v)} min={1} max={100} suffix="%" />
            </SettingRow>
            <SettingRow label="Target ROAS" desc="Return on ad spend target">
              <NumberInput value={currentLocalSettings.roasTarget} onChange={(v) => updateSetting('roasTarget', v)} min={0.5} max={20} step={0.1} suffix="x" />
            </SettingRow>
          </SettingSection>
          
          {/* Profit Thresholds */}
          <SettingSection title="💰 Profit Thresholds">
            <SettingRow label="Target Net Margin" desc="Net profit margin goal">
              <NumberInput value={currentLocalSettings.marginTarget} onChange={(v) => updateSetting('marginTarget', v)} min={1} max={100} suffix="%" />
            </SettingRow>
            <SettingRow label="Margin Warning" desc="Below this triggers warning">
              <NumberInput value={currentLocalSettings.marginWarning} onChange={(v) => updateSetting('marginWarning', v)} min={1} max={50} suffix="%" />
            </SettingRow>
          </SettingSection>
          
          {/* Alert Preferences */}
          <SettingSection title="🔔 Alert Preferences">
            <SettingRow label="Inventory Alerts" desc="Show low stock warnings on dashboard">
              <Toggle checked={currentLocalSettings.alertInventoryEnabled} onChange={(v) => updateSetting('alertInventoryEnabled', v)} />
            </SettingRow>
            <SettingRow label="Goals Alerts" desc="Show missed targets on dashboard">
              <Toggle checked={currentLocalSettings.alertGoalsEnabled} onChange={(v) => updateSetting('alertGoalsEnabled', v)} />
            </SettingRow>
            <SettingRow label="Sales Tax Alerts" desc="Show upcoming filing deadlines">
              <Toggle checked={currentLocalSettings.alertSalesTaxEnabled} onChange={(v) => updateSetting('alertSalesTaxEnabled', v)} />
            </SettingRow>
            <SettingRow label="Sales Tax Alert Days" desc="Days before deadline to show alert">
              <NumberInput value={currentLocalSettings.alertSalesTaxDays} onChange={(v) => updateSetting('alertSalesTaxDays', v)} min={1} max={30} suffix="days" />
            </SettingRow>
          </SettingSection>
          
          {/* Module Visibility */}
          <SettingSection title="📱 Module Visibility">
            <p className="text-slate-400 text-sm mb-4">Show/hide sections to streamline your dashboard</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              <SettingRow label="Weekly Tracking">
                <Toggle checked={currentLocalSettings.modulesEnabled?.weeklyTracking !== false} onChange={(v) => updateSetting('modulesEnabled.weeklyTracking', v)} />
              </SettingRow>
              <SettingRow label="Period Tracking">
                <Toggle checked={currentLocalSettings.modulesEnabled?.periodTracking !== false} onChange={(v) => updateSetting('modulesEnabled.periodTracking', v)} />
              </SettingRow>
              <SettingRow label="Inventory">
                <Toggle checked={currentLocalSettings.modulesEnabled?.inventory !== false} onChange={(v) => updateSetting('modulesEnabled.inventory', v)} />
              </SettingRow>
              <SettingRow label="Trends Analytics">
                <Toggle checked={currentLocalSettings.modulesEnabled?.trends !== false} onChange={(v) => updateSetting('modulesEnabled.trends', v)} />
              </SettingRow>
              <SettingRow label="YoY Comparison">
                <Toggle checked={currentLocalSettings.modulesEnabled?.yoy !== false} onChange={(v) => updateSetting('modulesEnabled.yoy', v)} />
              </SettingRow>
              <SettingRow label="SKU Rankings">
                <Toggle checked={currentLocalSettings.modulesEnabled?.skus !== false} onChange={(v) => updateSetting('modulesEnabled.skus', v)} />
              </SettingRow>
              <SettingRow label="Profitability">
                <Toggle checked={currentLocalSettings.modulesEnabled?.profitability !== false} onChange={(v) => updateSetting('modulesEnabled.profitability', v)} />
              </SettingRow>
              <SettingRow label="Ads Analytics">
                <Toggle checked={currentLocalSettings.modulesEnabled?.ads !== false} onChange={(v) => updateSetting('modulesEnabled.ads', v)} />
              </SettingRow>
              <SettingRow label="3PL Analytics">
                <Toggle checked={currentLocalSettings.modulesEnabled?.threepl !== false} onChange={(v) => updateSetting('modulesEnabled.threepl', v)} />
              </SettingRow>
              <SettingRow label="Sales Tax">
                <Toggle checked={currentLocalSettings.modulesEnabled?.salesTax !== false} onChange={(v) => updateSetting('modulesEnabled.salesTax', v)} />
              </SettingRow>
            </div>
          </SettingSection>
          
          {/* Dashboard Preferences */}
          <SettingSection title="🏠 Dashboard Preferences">
            <SettingRow label="Default Time Range" desc="Initial view when loading dashboard">
              <select value={currentLocalSettings.dashboardDefaultRange || 'month'} onChange={(e) => updateSetting('dashboardDefaultRange', e.target.value)} className="bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white">
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="quarter">Quarter</option>
                <option value="year">Year</option>
              </select>
            </SettingRow>
            <SettingRow label="Show Weekly Goals" desc="Display weekly targets on dashboard">
              <Toggle checked={currentLocalSettings.showWeeklyGoals !== false} onChange={(v) => updateSetting('showWeeklyGoals', v)} />
            </SettingRow>
            <SettingRow label="Show Monthly Goals" desc="Display monthly targets on dashboard">
              <Toggle checked={currentLocalSettings.showMonthlyGoals !== false} onChange={(v) => updateSetting('showMonthlyGoals', v)} />
            </SettingRow>
          </SettingSection>
          
          {/* Theme & Display (Feature 9) */}
          <SettingSection title="🎨 Theme & Display">
            <SettingRow label="Color Theme" desc="Customize accent colors">
              <div className="flex gap-2">
                {['violet', 'emerald', 'blue', 'rose', 'amber'].map(color => (
                  <button key={color} onClick={() => setTheme(p => ({...p, accent: color}))}
                    className={`w-8 h-8 rounded-full bg-${color}-500 ${theme.accent === color ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-800' : ''}`} />
                ))}
              </div>
            </SettingRow>
            <SettingRow label="Mobile-Optimized View" desc="Simplified layout for small screens">
              <Toggle checked={isMobile} onChange={() => {}} disabled />
              <span className="text-slate-500 text-xs ml-2">(Auto-detected)</span>
            </SettingRow>
          </SettingSection>
          
          {/* Notifications (Feature 4) */}
          <SettingSection title="🔔 Notifications">
            <SettingRow label="Browser Notifications" desc="Get alerts for low stock and tax deadlines">
              {notificationsEnabled ? (
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400 text-sm">Enabled</span>
                </div>
              ) : (
                <button onClick={requestNotifications} className="px-4 py-2 bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/50 rounded-lg text-sm text-violet-300 flex items-center gap-2">
                  <Bell className="w-4 h-4" />Enable Notifications
                </button>
              )}
            </SettingRow>
            <SettingRow label="Sales Tax Alert Days" desc="Days before due date to show alert">
              <NumberInput value={currentLocalSettings.alertSalesTaxDays || 7} onChange={(v) => updateSetting('alertSalesTaxDays', v)} min={1} max={30} suffix="days" />
            </SettingRow>
          </SettingSection>
          
          {/* Account */}
          {supabase && session && (
            <SettingSection title="👤 Account">
              <SettingRow label="Logged in as" desc={session.user?.email || 'Unknown'}>
                <span className="text-emerald-400 text-sm flex items-center gap-1"><Check className="w-4 h-4" />Connected</span>
              </SettingRow>
              <SettingRow label="Sign Out" desc="Log out of your account">
                <button onClick={handleLogout} className="px-4 py-2 bg-rose-600/30 hover:bg-rose-600/50 border border-rose-500/50 rounded-lg text-sm text-rose-300 flex items-center gap-2">
                  Sign Out
                </button>
              </SettingRow>
            </SettingSection>
          )}
          
          {/* Store Branding */}
          <SettingSection title="🏪 Store Branding">
            <SettingRow label="Store Name" desc="Displayed in the dashboard header">
              <input 
                type="text" 
                value={storeName} 
                onChange={(e) => setStoreName(e.target.value)} 
                placeholder="Your Store Name"
                className="w-48 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
              />
            </SettingRow>
            <SettingRow label="Store Logo" desc="Upload your logo (PNG, JPG - max 500KB)">
              <div className="flex items-center gap-3">
                {storeLogo && (
                  <img src={storeLogo} alt="Store logo" className="w-10 h-10 object-contain rounded-lg bg-white p-1" />
                )}
                <label className="px-3 py-2 bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/50 rounded-lg text-sm text-violet-300 cursor-pointer flex items-center gap-2">
                  <Upload className="w-4 h-4" />{storeLogo ? 'Change' : 'Upload'}
                  <input 
                    type="file" 
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        if (file.size > 500 * 1024) {
                          setToast({ message: 'Logo must be under 500KB', type: 'error' });
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          setStoreLogo(ev.target.result);
                          setToast({ message: 'Logo uploaded successfully', type: 'success' });
                        };
                        reader.readAsDataURL(file);
                      }
                    }} 
                    className="hidden" 
                  />
                </label>
                {storeLogo && (
                  <button onClick={() => { setStoreLogo(null); setToast({ message: 'Logo removed', type: 'success' }); }} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-300">
                    Remove
                  </button>
                )}
              </div>
            </SettingRow>
            <p className="text-slate-500 text-xs mt-3">Your logo will appear in the dashboard header next to your store name.</p>
          </SettingSection>
          
          {/* Security & Privacy */}
          <SettingSection title="🔒 Security & Privacy">
            <div className="space-y-4">
              <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4">
                <p className="text-emerald-400 font-semibold mb-2">✅ Your Data is Private</p>
                <p className="text-slate-300 text-sm">Each user account has completely separate data. Other users who sign up cannot see your data, and you cannot see theirs. This is enforced at the database level using Row Level Security (RLS).</p>
              </div>
              
              <div className="bg-slate-900/50 rounded-xl p-4">
                <p className="text-white font-medium mb-2">How Data Storage Works</p>
                <ul className="text-slate-400 text-sm space-y-2">
                  <li className="flex items-start gap-2">
                    <Cloud className="w-4 h-4 mt-0.5 text-blue-400 flex-shrink-0" />
                    <span><strong className="text-white">Cloud Sync (Logged In):</strong> Data syncs to Supabase and is accessible from any device when you log in with the same account.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Database className="w-4 h-4 mt-0.5 text-amber-400 flex-shrink-0" />
                    <span><strong className="text-white">Local Backup:</strong> Data is also stored in your browser's localStorage as a backup in case of connectivity issues.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Download className="w-4 h-4 mt-0.5 text-emerald-400 flex-shrink-0" />
                    <span><strong className="text-white">Manual Backups:</strong> Downloaded to your browser's default download folder (usually ~/Downloads). You can change this in your browser settings.</span>
                  </li>
                </ul>
              </div>
              
              {session && (
                <div className="bg-slate-900/50 rounded-xl p-4">
                  <p className="text-white font-medium mb-2">Logged in as</p>
                  <p className="text-slate-400 text-sm">{session.user?.email}</p>
                </div>
              )}
            </div>
          </SettingSection>
          
          {/* Data Management */}
          <SettingSection title="🗄️ Data Management">
            <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4 mb-4">
              <p className="text-amber-400 font-semibold mb-1">💡 Backup Before Updates</p>
              <p className="text-slate-300 text-sm">Always export a backup before pushing app updates. Your data is stored in the browser - a full backup ensures you can restore everything.</p>
            </div>
            <SettingRow label="Full Backup" desc="Downloads ALL data: weeks, periods, inventory, forecasts, invoices, settings">
              <button onClick={exportAll} className="px-4 py-2 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/50 rounded-lg text-sm text-emerald-300 flex items-center gap-2"><Download className="w-4 h-4" />Export Full Backup</button>
            </SettingRow>
            <SettingRow label="Restore from Backup" desc="Import a previously exported JSON file">
              <label className="px-4 py-2 bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/50 rounded-lg text-sm text-violet-300 flex items-center gap-2 cursor-pointer"><Upload className="w-4 h-4" />Import Backup<input type="file" accept=".json" onChange={(e) => e.target.files[0] && importData(e.target.files[0])} className="hidden" /></label>
            </SettingRow>
            <div className="mt-4 p-3 bg-slate-900/50 rounded-lg">
              <p className="text-slate-400 text-xs mb-2">Backup includes:</p>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <span className="text-slate-500">• {Object.keys(allWeeksData).length} weeks of sales data</span>
                <span className="text-slate-500">• {Object.keys(allPeriodsData).length} period reports</span>
                <span className="text-slate-500">• {Object.keys(invHistory).length} inventory snapshots</span>
                <span className="text-slate-500">• {Object.keys(savedCogs).length} COGS entries</span>
                <span className="text-slate-500">• {Object.keys(amazonForecasts).length} Amazon forecasts</span>
                <span className="text-slate-500">• {invoices.length} invoices/bills</span>
                <span className="text-slate-500">• {Object.keys(weekNotes).length} week notes</span>
                <span className="text-slate-500">• All settings & goals</span>
              </div>
            </div>
            <SettingRow label="Reset Settings Only" desc="Restore settings to defaults (keeps all data)">
              {showResetConfirm ? (
                <div className="flex gap-2">
                  <button onClick={resetToDefaults} className="px-3 py-2 bg-rose-600 hover:bg-rose-500 rounded-lg text-sm text-white">Confirm Reset</button>
                  <button onClick={() => setShowResetConfirm(false)} className="px-3 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-sm text-white">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setShowResetConfirm(true)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white">Reset Settings</button>
              )}
            </SettingRow>
          </SettingSection>
          
          {/* Danger Zone */}
          {session && (
            <SettingSection title="⚠️ Danger Zone">
              <div className="bg-rose-900/20 border border-rose-500/30 rounded-xl p-4">
                <p className="text-rose-400 font-semibold mb-2">Delete All My Data</p>
                <p className="text-slate-300 text-sm mb-4">This will permanently delete all your data from the cloud. This action cannot be undone. We recommend exporting a backup first.</p>
                <button 
                  onClick={async () => {
                    if (!confirm('Are you sure you want to delete ALL your data? This cannot be undone!')) return;
                    if (!confirm('FINAL WARNING: All weeks, periods, inventory, forecasts, invoices, and settings will be permanently deleted. Continue?')) return;
                    try {
                      // Delete from Supabase
                      if (supabase && session?.user?.id) {
                        await supabase.from('app_data').delete().eq('user_id', session.user.id);
                      }
                      // Clear localStorage
                      localStorage.clear();
                      // Reset all state
                      setAllWeeksData({});
                      setAllPeriodsData({});
                      setInvHistory({});
                      setSavedCogs({});
                      setInvoices([]);
                      setAmazonForecasts({});
                      setWeekNotes({});
                      setGoals({ weeklyRevenue: 0, weeklyProfit: 0, monthlyRevenue: 0, monthlyProfit: 0 });
                      setStoreName('');
                      setStoreLogo(null);
                      setToast({ message: 'All data deleted successfully', type: 'success' });
                    } catch (err) {
                      setToast({ message: 'Error deleting data: ' + err.message, type: 'error' });
                    }
                  }}
                  className="px-4 py-2 bg-rose-600/30 hover:bg-rose-600/50 border border-rose-500/50 rounded-lg text-sm text-rose-300 flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />Delete All My Data
                </button>
              </div>
            </SettingSection>
          )}
          
          {/* About */}
          <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6 text-center">
            <p className="text-slate-400 text-sm">E-Commerce Dashboard v5.0</p>
            <p className="text-slate-500 text-xs mt-1">Built for tracking Amazon & Shopify performance</p>
            <div className="flex justify-center gap-4 mt-4 text-xs text-slate-500">
              <span>{Object.keys(allWeeksData).length} weeks tracked</span>
              <span>•</span>
              <span>{Object.keys(allPeriodsData).length} periods saved</span>
              <span>•</span>
              <span>{Object.keys(savedCogs).length} SKUs configured</span>
            </div>
          </div>
          
        </div>
      </div>
    );
  }

  return <div className="min-h-screen bg-slate-950 text-white p-6 flex items-center justify-center"><div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>;
}
