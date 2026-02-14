import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Upload, DollarSign, TrendingUp, TrendingDown, Package, ShoppingCart, BarChart3, Download, Calendar, ChevronLeft, ChevronRight, ChevronDown, Trash2, FileSpreadsheet, Check, Database, AlertTriangle, AlertCircle, CheckCircle, Clock, Boxes, RefreshCw, Layers, CalendarRange, Settings, ArrowUpRight, ArrowDownRight, Minus, GitCompare, Trophy, Target, PieChart, Zap, Star, Eye, ShoppingBag, Award, Flame, Snowflake, Truck, FileText, MessageSquare, Send, X, Move, EyeOff, Bell, BellOff, Calculator, StickyNote, Sun, Moon, Palette, FileDown, GitCompareArrows, Smartphone, Cloud, Plus, Store, Loader2, HelpCircle, Brain, Landmark, Wallet, CreditCard, Building, ArrowUp, ArrowDown, User, Lightbulb, MoreHorizontal, LineChart, Sparkles, Keyboard, Globe } from 'lucide-react';
// Extracted utilities (keep App.jsx lean)
import { loadXLSX } from './utils/xlsx';
import { parseCSV, parseCSVLine } from './utils/csv';
import { formatCurrency, formatPercent, formatNumber } from './utils/format';
import { devWarn, devError, audit, getAuditLog } from './utils/logger';
import { hasDailySalesData, formatDateKey, getSunday } from './utils/date';
import { deriveWeeksFromDays, mergeWeekData } from './utils/weekly';
import { getShopifyAdsForDay, aggregateShopifyAdsForDays } from './utils/ads';
import { processUploadedFiles, mergeTier1IntoDailySales, mergeTier2IntoIntelData, buildComprehensiveAdsPrompt } from './utils/adsReportParser';
import { withShippingSkuRow, sumSkuRows } from './utils/reconcile';
import {
  STORAGE_KEY, INVENTORY_KEY, COGS_KEY, STORE_KEY, GOALS_KEY, PERIODS_KEY, SALES_TAX_KEY, PRODUCT_NAMES_KEY,
  SETTINGS_KEY, NOTES_KEY, WIDGET_KEY, THEME_KEY, INVOICES_KEY, AMAZON_FORECAST_KEY, THREEPL_LEDGER_KEY,
  WEEKLY_REPORTS_KEY, FORECAST_ACCURACY_KEY, FORECAST_CORRECTIONS_KEY,
  LZCompress, COMPRESSED_KEYS, lsGet, lsSet, trimIntelData
} from './utils/storage';
import { AI_MODELS, AI_DEFAULT_MODEL, AI_TOKEN_BUDGETS, AI_MODEL_OPTIONS, getModelTier, getModelLabel } from './utils/config';
import { callAI } from './utils/ai';
import { sanitizeHtml } from './utils/sanitize';
import { validateSaveData, checkConflict, upsertCloudData } from './utils/cloudSync';
import { prepareDataContext } from './utils/aiContextBuilder';
import { buildChatSystemPrompt } from './utils/aiPromptBuilder';
import ErrorBoundary from './components/ErrorBoundary';

// Extracted UI components
import NotificationCenter from './components/ui/NotificationCenter';
import EmptyState from './components/ui/EmptyState';
import KeyboardShortcuts from './components/ui/KeyboardShortcuts';
import AuditLog from './components/ui/AuditLog';
import { PrintButton, printProfitability, printInventory, printSalesTax, printDailySummary } from './components/ui/PrintView';
import MetricCard from './components/ui/MetricCard';
import HealthBadge from './components/ui/HealthBadge';
import SettingSection from './components/ui/SettingSection';
import SettingRow from './components/ui/SettingRow';
import Toggle from './components/ui/Toggle';
import AIChatPanel from './components/ui/AIChatPanel';
import WeeklyReportModal from './components/ui/WeeklyReportModal';
import NumberInput from './components/ui/NumberInput';
import Toast from './components/ui/Toast';
import ValidationModal from './components/ui/ValidationModal';
import GoalsModal from './components/ui/GoalsModal';
import ExportModal from './components/ui/ExportModal';
import UploadHelpModal from './components/ui/UploadHelpModal';
import BreakEvenModal from './components/ui/BreakEvenModal';
import ProductCatalogModal from './components/ui/ProductCatalogModal';
import ForecastModal from './components/ui/ForecastModal';
import ComparisonView from './components/ui/ComparisonView';
import WeekNoteEditor from './components/ui/WeekNoteEditor';
import ConflictResolutionModal from './components/ui/ConflictResolutionModal';
import WidgetConfigModal from './components/ui/WidgetConfigModal';
import CogsManager from './components/ui/CogsManager';
import InvoiceModal from './components/ui/InvoiceModal';
import StoreSelectorModal from './components/ui/StoreSelectorModal';
import DayDetailsModal from './components/ui/DayDetailsModal';
import ThreePLBulkUploadModal from './components/ui/ThreePLBulkUploadModal';
import AdsBulkUploadModal from './components/ui/AdsBulkUploadModal';
// AmazonAdsBulkUploadModal removed - consolidated into AmazonAdsIntelModal
import AmazonAdsIntelModal, { buildAdsIntelContext } from './components/ui/AmazonAdsIntelModal';
import DtcAdsIntelModal, { buildDtcIntelContext } from './components/ui/DtcAdsIntelModal';
import ChannelCard from './components/ui/ChannelCard';
import GoalsCard from './components/ui/GoalsCard';
import StateConfigModal from './components/ui/StateConfigModal';
import FilingDetailModal from './components/ui/FilingDetailModal';
import NavTabs from './components/ui/NavTabs';
import SettingsView from './components/views/SettingsView';
import BankingView from './components/views/BankingView';
import SalesTaxView from './components/views/SalesTaxView';
import AdsView from './components/views/AdsView';
import InventoryView from './components/views/InventoryView';
import DashboardView from './components/views/DashboardView';
import UploadView from './components/views/UploadView';
import TrendsView from './components/views/TrendsView';
import ForecastView from './components/views/ForecastView';
import ProfitabilityView from './components/views/ProfitabilityView';
import SkuRankingsView from './components/views/SkuRankingsView';
import ThreePLView from './components/views/ThreePLView';
import WeeklyView from './components/views/WeeklyView';
import DailyView from './components/views/DailyView';
import YoYView from './components/views/YoYView';
import PeriodDetailView from './components/views/PeriodDetailView';
import PnLView from './PnLView';
import ReportsAndActionsView from './ReportHistory';

// Dashboard widget configuration - defined at module level for consistent access
const DEFAULT_DASHBOARD_WIDGETS = {
  widgets: [
    { id: 'alerts', name: 'Alerts & Notifications', enabled: true, order: 0 },
    { id: 'todayPerformance', name: 'Last Week & MTD Performance', enabled: true, order: 1 },
    { id: 'weekProgress', name: 'This Week\'s Goal', enabled: true, order: 2 },
    { id: 'topSellers14d', name: 'Top Sellers (14 Days)', enabled: true, order: 3 },
    { id: 'worstSellers14d', name: 'Needs Attention (14 Days)', enabled: true, order: 4 },
    { id: 'topSellersYTD', name: 'Top Sellers (YTD)', enabled: false, order: 5 },
    { id: 'worstSellersYTD', name: 'Needs Attention (YTD)', enabled: false, order: 6 },
    { id: 'salesTax', name: 'Sales Tax Due', enabled: true, order: 7 },
    { id: 'aiForecast', name: 'AI Forecast', enabled: true, order: 8 },
    { id: 'billsDue', name: 'Bills & Invoices', enabled: true, order: 9 },
    { id: 'calendar', name: 'Daily Calendar', enabled: true, order: 10 },
    { id: 'summaryMetrics', name: 'Summary Metrics (Time Range)', enabled: false, order: 11 },
    { id: 'syncStatus', name: 'Sync & Backup Status', enabled: false, order: 12 },
    { id: 'quickUpload', name: 'Quick Upload', enabled: false, order: 13 },
    { id: 'dataHub', name: 'Data Hub', enabled: false, order: 14 },
  ],
  stacks: {}, // { 'salesTax': ['salesTax', 'billsDue'] } - widget stacks
  layout: 'auto',
};


// Parse QBO Transaction Detail CSV
const parseQBOTransactions = (content, categoryOverrides = {}) => {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  const transactions = [];
  const accounts = {};
  const categories = {};
  let currentAccount = null;
  let currentAccountType = 'checking';
  
  // First pass: Find account totals from "Total for [Account]" lines
  const accountTotals = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('Total for ')) {
      const cols = parseCSVLine(line);
      const match = cols[0].match(/Total for (.+)/);
      if (match) {
        const accountName = match[1].trim();
        // Parse the total amount (usually in column 8 or 9)
        let totalStr = (cols[9] || cols[8] || cols[7] || '').replace(/[$,"\s]/g, '');
        const total = parseFloat(totalStr) || 0;
        accountTotals[accountName] = total;
      }
    }
  }
  
  // Skip header rows
  let dataStartIndex = 0;
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    if (lines[i].includes('Transaction date') || lines[i].includes('transaction date')) {
      dataStartIndex = i + 1;
      break;
    }
  }
  
  // Bank account patterns - detect checking, savings, and credit card accounts
  const isBankAccount = (name) => {
    // Must NOT contain quotes (sign of corrupted multi-line CSV parsing)
    if (name.includes('"')) return false;
    
    // Must be reasonably short (account names are typically < 80 chars)
    if (name.length > 80) return false;
    
    // Must start with a letter (not a continuation of a memo)
    if (!/^[A-Za-z]/.test(name.trim())) return false;
    
    const lower = name.toLowerCase();
    
    // Skip things that are clearly NOT bank accounts
    if (lower.includes('depreciation') || lower.includes('accumulated') || 
        lower.includes('inventory asset') || lower.includes('accounts receivable') ||
        lower.includes('accounts payable') || lower.includes('retained earnings') ||
        lower.includes('equity') || lower.includes('total for')) return false;
    
    // Check for account number pattern like (5983) - 1234 or similar
    const hasAccountNumber = /\(\d{3,4}\)/.test(name);
    
    // Strong signals: explicit bank/card keywords
    const hasBankKeyword = (
      lower.includes('checking') ||
      lower.includes('savings') ||
      lower.includes('operations') ||
      lower.includes('money market') ||
      lower.includes('bank')
    );
    
    const hasCreditKeyword = (
      lower.includes('card') ||
      lower.includes('credit') ||
      lower.includes('amex') ||
      lower.includes('visa') ||
      lower.includes('mastercard') ||
      lower.includes('discover') ||
      lower.includes('platinum') ||
      lower.includes('chase') ||
      lower.includes('capital one') ||
      lower.includes('citi')
    );
    
    // Accept if has account number + keyword, or just strong keyword
    if (hasAccountNumber && (hasBankKeyword || hasCreditKeyword)) return true;
    if (hasBankKeyword || hasCreditKeyword) return true;
    
    // Also accept if it has an account number pattern and looks like a financial account
    if (hasAccountNumber && !lower.includes('asset') && !lower.includes('liability') && 
        !lower.includes('expense') && !lower.includes('income') && !lower.includes('cost of')) {
      // Could be a bank account with a non-standard name - accept it
      return true;
    }
    
    return false;
  };
  
  // Non-cash/asset patterns to skip
  const isNonCashAccount = (name) => {
    const lower = name.toLowerCase();
    return (
      lower.includes('depreciation') ||
      lower.includes('accumulated') ||
      lower.includes('asset') ||
      lower.includes('vehicle') ||
      lower.includes('equipment') ||
      lower.includes('tundra') ||
      lower.includes('furniture') ||
      lower.includes('inventory asset')
    );
  };
  
  for (let i = dataStartIndex; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const cols = parseCSVLine(line);
    
    // Check for account section headers
    if (cols[0] && cols[0].trim() && !cols[1]?.trim() && !cols[0].startsWith('Total for') && !cols[0].includes(',TOTAL')) {
      const potentialAccount = cols[0].trim();
      
      // Skip non-bank accounts
      if (isNonCashAccount(potentialAccount)) {
        currentAccount = null;
        continue;
      }
      
      // Only track real bank accounts
      if (isBankAccount(potentialAccount)) {
        currentAccount = potentialAccount;
        const lowerName = potentialAccount.toLowerCase();
        currentAccountType = (lowerName.includes('card') || 
                             lowerName.includes('credit') ||
                             lowerName.includes('amex') ||
                             lowerName.includes('platinum') ||
                             lowerName.includes('visa') ||
                             lowerName.includes('mastercard') ||
                             lowerName.includes('discover') ||
                             lowerName.includes('chase') ||
                             lowerName.includes('capital one') ||
                             lowerName.includes('citi')) ? 'credit_card' : 'checking';
        
        if (!accounts[currentAccount]) {
          // Get balance from totals we found earlier
          const balance = accountTotals[currentAccount] || 0;
          accounts[currentAccount] = { 
            name: currentAccount, 
            type: currentAccountType, 
            transactions: 0, 
            totalIn: 0, 
            totalOut: 0,
            balance: balance
          };
        }
      } else {
        currentAccount = null;
      }
      continue;
    }
    
    // Skip if we're not in a valid bank account
    if (!currentAccount) continue;
    
    // Skip total rows and metadata rows
    if (cols[0]?.startsWith('Total for') || cols[0]?.includes(',TOTAL') || cols[0]?.includes('Cash Basis')) continue;
    
    // Parse transaction row
    const dateStr = cols[1]?.trim();
    if (!dateStr || !dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) continue;
    
    const txnType = cols[2]?.trim() || '';
    const vendorName = cols[4]?.trim() || '';
    const memo = cols[6]?.trim() || '';
    const category = cols[7]?.trim() || 'Uncategorized';
    
    let amountStr = cols[8]?.trim().replace(/,/g, '').replace(/"/g, '') || '0';
    const amount = parseFloat(amountStr) || 0;
    
    // Parse date
    const dateParts = dateStr.split('/');
    const dateKey = `${dateParts[2]}-${dateParts[0].padStart(2, '0')}-${dateParts[1].padStart(2, '0')}`;
    
    // Create unique transaction ID using simple hash of full memo
    const memoHash = memo.split('').reduce((hash, char) => {
      return ((hash << 5) - hash) + char.charCodeAt(0) | 0;
    }, 0).toString(36);
    const txnId = `${dateKey}-${currentAccount?.slice(0,15)}-${amount.toFixed(2)}-${memoHash}`.replace(/[^a-zA-Z0-9-]/g, '');
    
    // Skip journal entries and non-cash items
    if (txnType === 'Journal Entry') continue;
    
    // Handle Credit Card Payments:
    // - From checking account: This is a cash OUTFLOW (expense) - money leaves checking
    // - On credit card account: This is a payment RECEIVED (reduces balance) - skip to avoid double-counting
    if (txnType === 'Credit Card Payment') {
      // If we're in a checking account and paying a credit card, record as expense
      if (currentAccountType === 'checking' && amount < 0) {
        // This IS an expense from the checking account - don't skip!
        // Fall through to normal processing
      } else {
        // Skip credit card payment entries on the credit card side
        continue;
      }
    }
    
    const categoryLower = category.toLowerCase();
    const memoLower = memo.toLowerCase();
    if (categoryLower.includes('depreciation') || categoryLower.includes('amortization') ||
        categoryLower.includes('accumulated') || categoryLower.includes('unrealized') ||
        memoLower.includes('depreciation') || memoLower.includes('amortization')) {
      continue;
    }
    
    // Determine income vs expense
    let isIncome = false;
    let isExpense = false;
    
    if (currentAccountType === 'credit_card') {
      // Credit card transactions: charges are expenses, credits/refunds are income
      // QBO can export credit card charges as:
      //   - Expense (positive amount) - most common
      //   - Bill / Bill Payment - for some card types
      //   - Check - sometimes used for card charges  
      //   - Credit Card Credit / Credit Card Refund (negative or positive) - refunds
      //   - Charge - some exports use this
      const txnLower = txnType.toLowerCase();
      
      if (txnLower.includes('credit') || txnLower.includes('refund') || txnLower.includes('return')) {
        // Refund/credit back to card
        isIncome = true;
      } else if (amount > 0) {
        // Positive amount on credit card = charge/expense
        isExpense = true;
      } else if (amount < 0 && !txnLower.includes('payment')) {
        // Negative amount that's not a payment = refund/credit
        isIncome = true;
      }
      // Note: Credit Card Payments are already skipped above
    } else {
      // Checking/savings accounts
      if (txnType === 'Deposit' && amount > 0) isIncome = true;
      else if (txnType === 'Sales Receipt' && amount > 0) isIncome = true;
      else if (txnType === 'Payment' && amount > 0) isIncome = true;
      else if (txnType === 'Payment' && amount < 0) isExpense = true;
      else if (txnType === 'Invoice' && amount > 0) isIncome = true;
      else if ((txnType === 'Expense' || txnType === 'Check') && amount < 0) isExpense = true;
      else if (txnType === 'Credit Card Payment' && amount < 0) isExpense = true; // Cash leaving to pay card
      else if (txnType === 'Refund Receipt') isExpense = true;
      else if (txnType === 'Transfer') {
        // Transfers need careful handling:
        // - Inter-account (checking ↔ savings): category will be another bank account → SKIP
        // - Amazon/Shopify deposits: category will be "Sales", "Revenue", etc. → INCOME
        // - Vendor payments via transfer: category will be expense category → EXPENSE
        const catLower = category.toLowerCase();
        const isInterAccount = (
          // Must have account number pattern like (1234) followed by a dash AND a bank/card keyword
          (/\(\d{4}\)\s*[-–]/.test(category) && (
            catLower.includes('checking') || catLower.includes('savings') || catLower.includes('money market') ||
            catLower.includes('card') || catLower.includes('operations')
          )) ||
          // Or explicit bank account keywords with account numbers
          (catLower.includes('checking') && /\(\d{4}\)/.test(category)) ||
          (catLower.includes('savings') && /\(\d{4}\)/.test(category))
        );
        
        if (isInterAccount) {
          continue; // Skip inter-account transfers entirely
        } else if (amount > 0) {
          isIncome = true; // External money coming in (Amazon/Shopify deposits, etc.)
        } else if (amount < 0) {
          isExpense = true; // Money going out via transfer
        }
      }
      else if (txnType === 'Payroll Check') isExpense = true;
      else if (txnType === 'Bill Payment' && amount < 0) isExpense = true;
      else if (amount > 0 && !isIncome) isIncome = true; // Catch-all: positive = income
      else if (amount < 0 && !isExpense) isExpense = true; // Catch-all: negative = expense
    }
    
    if (!isIncome && !isExpense) continue;
    
    const finalCategory = categoryOverrides[txnId] || category;
    const topCategory = finalCategory.split(':')[0].trim();
    const subCategory = finalCategory.includes(':') ? finalCategory.split(':').slice(1).join(':').trim() : '';
    
    // Extract vendor
    let vendor = vendorName;
    if (!vendor && memo) {
      const memoUpper = memo.toUpperCase();
      if (memoUpper.includes('AMAZON')) vendor = 'Amazon';
      else if (memoUpper.includes('SHOPIFY')) vendor = 'Shopify';
      else if (memoUpper.includes('GOOGLE')) vendor = 'Google';
      else if (memoUpper.includes('META') || memoUpper.includes('FACEBOOK')) vendor = 'Meta';
      else vendor = memo.split(' ')[0] || 'Unknown';
    }
    if (!vendor) vendor = 'Unknown';
    
    const txn = {
      id: txnId,
      date: dateKey,
      dateDisplay: dateStr,
      type: txnType,
      vendor,
      memo,
      category: finalCategory,
      originalCategory: category,
      topCategory,
      subCategory,
      amount: Math.abs(amount),
      isIncome,
      isExpense,
      account: currentAccount,
      accountType: currentAccountType,
    };
    
    transactions.push(txn);
    
    if (accounts[currentAccount]) {
      accounts[currentAccount].transactions++;
      if (txn.isIncome) accounts[currentAccount].totalIn += txn.amount;
      if (txn.isExpense) accounts[currentAccount].totalOut += txn.amount;
    }
    
    // Category stats
    if (!categories[topCategory]) {
      categories[topCategory] = { name: topCategory, count: 0, totalIn: 0, totalOut: 0, subCategories: {} };
    }
    categories[topCategory].count++;
    if (txn.isIncome) categories[topCategory].totalIn += txn.amount;
    if (txn.isExpense) categories[topCategory].totalOut += txn.amount;
    
    if (subCategory) {
      if (!categories[topCategory].subCategories[subCategory]) {
        categories[topCategory].subCategories[subCategory] = { count: 0, totalIn: 0, totalOut: 0 };
      }
      categories[topCategory].subCategories[subCategory].count++;
      if (txn.isIncome) categories[topCategory].subCategories[subCategory].totalIn += txn.amount;
      if (txn.isExpense) categories[topCategory].subCategories[subCategory].totalOut += txn.amount;
    }
  }
  
  // Sort by date
  transactions.sort((a, b) => a.date.localeCompare(b.date));
  
  // Generate monthly snapshots
  const monthlySnapshots = {};
  transactions.forEach(txn => {
    const monthKey = txn.date.substring(0, 7);
    if (!monthlySnapshots[monthKey]) {
      monthlySnapshots[monthKey] = { income: 0, expenses: 0, transactions: 0, byCategory: {} };
    }
    monthlySnapshots[monthKey].transactions++;
    if (txn.isIncome) monthlySnapshots[monthKey].income += txn.amount;
    if (txn.isExpense) monthlySnapshots[monthKey].expenses += txn.amount;
    
    if (!monthlySnapshots[monthKey].byCategory[txn.topCategory]) {
      monthlySnapshots[monthKey].byCategory[txn.topCategory] = { income: 0, expenses: 0 };
    }
    if (txn.isIncome) monthlySnapshots[monthKey].byCategory[txn.topCategory].income += txn.amount;
    if (txn.isExpense) monthlySnapshots[monthKey].byCategory[txn.topCategory].expenses += txn.amount;
  });
  
  Object.keys(monthlySnapshots).forEach(m => {
    monthlySnapshots[m].net = monthlySnapshots[m].income - monthlySnapshots[m].expenses;
  });
  
  return {
    transactions,
    accounts,
    categories,
    monthlySnapshots,
    dateRange: transactions.length > 0 ? {
      start: transactions[0].date,
      end: transactions[transactions.length - 1].date
    } : null,
    transactionCount: transactions.length,
  };
};

// AI_CONFIG and callAI imported from ./utils/ai.js — single source of truth

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

// CRITICAL: When Supabase is configured, DON'T load from localStorage on initial mount
// This prevents data leakage between users on shared browsers
// localStorage should ONLY be used when supabase is NOT configured (anonymous mode)
const shouldUseLocalStorage = !supabase;

// Safe localStorage getter - only reads if we're in anonymous mode
const safeLocalStorageGet = (key, defaultValue) => {
  if (!shouldUseLocalStorage) return defaultValue;
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
};

// Safe localStorage getter for strings (non-JSON)
const safeLocalStorageGetString = (key, defaultValue = '') => {
  if (!shouldUseLocalStorage) return defaultValue;
  try {
    return localStorage.getItem(key) || defaultValue;
  } catch {
    return defaultValue;
  }
};

// Safe localStorage setter - only writes if we're in anonymous mode OR for whitelisted keys
// CRITICAL: Prevents data leakage between Supabase users on shared browsers
const safeLocalStorageSet = (key, value) => {
  // Always allow theme preferences (non-sensitive, per-browser)
  const alwaysAllowedKeys = ['ecommerce_theme', 'ecommerce_settings_tab', 'ecomm_last_activity_v1'];
  if (!shouldUseLocalStorage && !alwaysAllowedKeys.includes(key)) return;
  try {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    lsSet(key, stringValue);
  } catch (e) {
    devWarn(`Failed to save to localStorage: ${key}`, e);
  }
};

const getCloudErrorText = (err) => {
  if (!err) return 'Unknown cloud error';
  const parts = [
    err?.message,
    err?.details,
    err?.hint,
    err?.error_description,
    typeof err === 'string' ? err : '',
  ]
    .filter(Boolean)
    .map(v => String(v).trim())
    .filter(Boolean);
  return parts.join(' | ') || 'Unknown cloud error';
};

const isSupabaseQuotaIssue = (err) => {
  const text = getCloudErrorText(err).toLowerCase();
  if (!text) return false;
  return (
    text.includes('exceeded your free plan quota') ||
    text.includes('billing cycle') ||
    text.includes('egress') ||
    text.includes('insufficient_quota') ||
    text.includes('quota')
  );
};

// Normalize SKU keys for deduplication - strips trailing "Shop" suffix and uppercases
const normalizeSkuKey = (sku) => (sku || '').trim().toUpperCase().replace(/SHOP$/i, '');

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

// Parse Excel file for 3PL bulk upload - extracts Summary and Detail sheets
const parse3PLExcel = async (file) => {
  // Load SheetJS from CDN if not already loaded
  const xlsx = await loadXLSX();
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = xlsx.read(data, { type: 'array' });
        
        const result = {
          fileName: file.name,
          summary: [],
          detail: [],
          invoiceLevel: [],
          dateRange: { start: null, end: null },
          orders: [],
          nonOrderCharges: [],
          format: 'unknown',
        };
        
        // Detect format based on sheet names
        const sheetNames = workbook.SheetNames;
        const hasDetailSheet = sheetNames.includes('Detail');
        const hasSummarySheet = sheetNames.includes('Summary');
        const hasShipmentsSheet = sheetNames.some(s => s.toLowerCase().includes('shipment'));
        const hasPackagingSheet = sheetNames.includes('Packaging');
        
        // FORMAT 1: Packiyo Invoice Format (Summary, Detail, Invoice Level sheets)
        if (hasDetailSheet && hasSummarySheet) {
          result.format = 'packiyo-invoice';
          
          // Parse Summary sheet
          const summarySheet = workbook.Sheets['Summary'];
          result.summary = xlsx.utils.sheet_to_json(summarySheet);
          
          // Parse Detail sheet
          const detailSheet = workbook.Sheets['Detail'];
          const detailRows = xlsx.utils.sheet_to_json(detailSheet);
          result.detail = detailRows;
          
          // Extract orders with dates
          detailRows.forEach(row => {
            const shipDateStr = row['Ship Datetime'] || row['Order Datetime'];
            if (!shipDateStr) return;
            
            // Parse date (format: "2025-10-19 04:58:32 PM" or "2025-09-16 08:53:45 AM")
            const dateStr = shipDateStr.toString().split(' ')[0];
            const shipDate = new Date(dateStr + 'T00:00:00');
            if (isNaN(shipDate)) return;
            
            const orderNumber = (row['Order Number'] || '').toString();
            const trackingNumber = (row['Tracking Number'] || '').toString();
            const uniqueKey = `${orderNumber}-${trackingNumber}`;
            const weekKey = getSunday(shipDate);
            
            // Update date range
            if (!result.dateRange.start || shipDate < new Date(result.dateRange.start)) {
              result.dateRange.start = shipDate.toISOString().split('T')[0];
            }
            if (!result.dateRange.end || shipDate > new Date(result.dateRange.end)) {
              result.dateRange.end = shipDate.toISOString().split('T')[0];
            }
            
            result.orders.push({
              uniqueKey,
              orderNumber,
              trackingNumber,
              shipDate: shipDate.toISOString().split('T')[0],
              weekKey,
              carrier: (row['Carrier Name'] || '').toString(),
              serviceLevel: (row['Service Level Name'] || '').toString(),
              state: (row['Ship Recipient Address State'] || '').toString(),
              postalCode: (row['Ship Recipient Address Postal Code'] || '').toString(),
              weight: parseFloat(row['Weight Value'] || 0),
              weightUnit: (row['Weight Unit'] || 'oz').toString(),
              packageType: (row['Package Type Name'] || '').toString(),
              charges: {
                additionalPick: parseFloat(row['Additional Pick Fee - Amount ($)'] || 0),
                additionalPickQty: parseInt(row['Additional Pick Fee - Quantity'] || 0),
                firstPick: parseFloat(row['First Pick Fee - Amount ($)'] || 0),
                firstPickQty: parseInt(row['First Pick Fee - Quantity'] || 0),
                box: parseFloat(row['Box Charge - Amount ($)'] || 0),
                boxQty: parseInt(row['Box Charge - Quantity'] || 0),
                reBoxing: parseFloat(row['Re-Boxing Fee - Amount ($)'] || 0),
                fbaForwarding: parseFloat(row['Fba Forwarding - Amount ($)'] || 0),
              },
            });
          });
          
          // Parse Invoice Level for non-order charges
          if (sheetNames.includes('Invoice Level')) {
            const invoiceSheet = workbook.Sheets['Invoice Level'];
            result.invoiceLevel = xlsx.utils.sheet_to_json(invoiceSheet);
          }
          
          // Extract non-order charges from Summary
          result.summary.forEach(row => {
            const charge = (row['Charge On Invoice'] || '').toString();
            const chargeLower = charge.toLowerCase();
            const amount = parseFloat(row['Amount Total ($)'] || 0);
            const count = parseInt(row['Count Total'] || 0);
            
            if (chargeLower.includes('storage') || chargeLower.includes('receiving') || 
                chargeLower.includes('shipping') || chargeLower.includes('credit') ||
                chargeLower.includes('special project')) {
              result.nonOrderCharges.push({
                chargeType: charge,
                amount,
                count,
                average: parseFloat(row['Average ($)'] || 0),
              });
            }
          });
        }
        
        // FORMAT 2: Packiyo Shipments Export (Shipments sheet with order/shipment_date columns)
        else if (hasShipmentsSheet) {
          result.format = 'packiyo-shipments';
          
          // Find the shipments sheet
          const shipmentsSheetName = sheetNames.find(s => s.toLowerCase().includes('shipment'));
          const shipmentsSheet = workbook.Sheets[shipmentsSheetName];
          const rows = xlsx.utils.sheet_to_json(shipmentsSheet);
          
          // Parse packaging costs if available
          let packagingCosts = {};
          if (hasPackagingSheet) {
            const packagingSheet = workbook.Sheets['Packaging'];
            const packagingRows = xlsx.utils.sheet_to_json(packagingSheet);
            packagingRows.forEach(row => {
              const type = (row['Type of Packaging'] || '').toString();
              const cost = parseFloat(row['Packaging Cost'] || 0);
              if (type && cost > 0) packagingCosts[type.toLowerCase()] = cost;
            });
          }
          
          rows.forEach(row => {
            // Try different column name variations
            const shipDateStr = row['shipment_date'] || row['Shipment Date'] || row['ship_date'] || row['order_date'] || row['Order Date'];
            if (!shipDateStr) return;
            
            // Parse date (format: "2025-07-31 21:25:24")
            const dateStr = shipDateStr.toString().split(' ')[0];
            const shipDate = new Date(dateStr + 'T00:00:00');
            if (isNaN(shipDate)) return;
            
            const orderNumber = (row['order'] || row['Order'] || row['order_number'] || row['Order Number'] || '').toString();
            const trackingNumber = (row['tracking_number'] || row['Tracking Number'] || '').toString();
            // Extract just the tracking number if it's a URL
            const trackingClean = trackingNumber.includes('http') ? trackingNumber.split('/').pop() : trackingNumber;
            const uniqueKey = `${orderNumber}-${trackingClean || shipDate.toISOString()}`;
            const weekKey = getSunday(shipDate);
            
            // Update date range
            if (!result.dateRange.start || shipDate < new Date(result.dateRange.start)) {
              result.dateRange.start = shipDate.toISOString().split('T')[0];
            }
            if (!result.dateRange.end || shipDate > new Date(result.dateRange.end)) {
              result.dateRange.end = shipDate.toISOString().split('T')[0];
            }
            
            // Try to estimate costs from packaging info
            let packagingCost = 0;
            const packaging = (row['packaging'] || row['Packaging'] || row['package_type'] || '').toString().toLowerCase();
            if (packaging && packagingCosts[packaging]) {
              packagingCost = packagingCosts[packaging];
            }
            
            result.orders.push({
              uniqueKey,
              orderNumber,
              trackingNumber: trackingClean,
              shipDate: shipDate.toISOString().split('T')[0],
              weekKey,
              carrier: (row['shipping_carrier'] || row['Shipping Carrier'] || row['user_defined_shipping_carrier'] || '').toString(),
              serviceLevel: (row['shipping_method'] || row['Shipping Method'] || '').toString(),
              state: (row['state'] || row['State'] || '').toString(),
              postalCode: (row['zip'] || row['Zip'] || row['postal_code'] || '').toString(),
              weight: parseFloat(row['weight'] || row['Weight'] || 0),
              weightUnit: 'oz',
              packageType: packaging,
              charges: {
                // This format doesn't have per-order charges, use packaging costs
                additionalPick: 0,
                additionalPickQty: 0,
                firstPick: 2.50, // Default pick fee estimate
                firstPickQty: 1,
                box: packagingCost,
                boxQty: packagingCost > 0 ? 1 : 0,
                reBoxing: 0,
                fbaForwarding: 0,
              },
            });
          });
        }
        
        // FORMAT 3: Simple summary sheet - try to extract what we can
        else {
          result.format = 'simple-summary';
          
          // Try first sheet
          const firstSheet = workbook.Sheets[sheetNames[0]];
          const rows = xlsx.utils.sheet_to_json(firstSheet, { header: 1 });
          
          // Look for any date info in filename
          const fileNameMatch = file.name.match(/(\d{1,2})[_-](\d{1,2})[_-]?(\d{1,2})?[_-]?(\d{1,2})?/);
          if (fileNameMatch) {
            // Try to parse date range from filename like "8_1-8_31" or "9_1-9_30"
            const month1 = parseInt(fileNameMatch[1]);
            const day1 = parseInt(fileNameMatch[2]);
            const month2 = fileNameMatch[3] ? parseInt(fileNameMatch[3]) : month1;
            const day2 = fileNameMatch[4] ? parseInt(fileNameMatch[4]) : 28;
            const year = 2025; // Default year
            
            result.dateRange.start = `${year}-${String(month1).padStart(2, '0')}-${String(day1).padStart(2, '0')}`;
            result.dateRange.end = `${year}-${String(month2).padStart(2, '0')}-${String(day2).padStart(2, '0')}`;
          }
          
          // Try to extract order count from content
          rows.forEach(row => {
            if (Array.isArray(row)) {
              const text = row.join(' ').toLowerCase();
              if (text.includes('order') && row[1]) {
                const count = parseInt(row[1]) || 0;
                if (count > 0 && count < 10000) {
                  // Create placeholder orders based on count
                  // This is imprecise but better than nothing
                }
              }
            }
          });
        }
        
        resolve(result);
      } catch (err) {
        devError('Error parsing 3PL file:', err);
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

// Helper to get profit from data that may use 'netProfit' or 'profit' field
// Period uploads sometimes use .profit, weekly data uses .netProfit
const getProfit = (obj) => {
  if (!obj) return 0;
  return obj.netProfit ?? obj.profit ?? 0;
};

// Helper to get 3PL data for a specific week from the ledger
const get3PLForWeek = (ledger, weekKey) => {
  if (!ledger) return null;
  
  // Convert weekKey to date for fuzzy matching
  const targetDate = new Date(weekKey + 'T00:00:00');
  const targetStart = new Date(targetDate);
  targetStart.setDate(targetDate.getDate() - 6); // Start of week (7 days before)
  const targetEnd = new Date(targetDate);
  targetEnd.setDate(targetDate.getDate() + 1); // Include day after for timezone tolerance
  
  // Step 1: Try EXACT week key match first (prevents double-counting)
  const exactMatches = ledger.orders ? Object.values(ledger.orders).filter(o => o.weekKey === weekKey) : [];
  
  // Step 2: Only fall back to fuzzy matching if exact match returns nothing
  const weekOrders = exactMatches.length > 0 ? exactMatches : (ledger.orders ? Object.values(ledger.orders).filter(o => {
    // Try fuzzy match - check if order's weekKey is within 1 day of target (tighter than before)
    if (o.weekKey) {
      const orderWeekDate = new Date(o.weekKey + 'T00:00:00');
      const diffDays = Math.abs((orderWeekDate - targetDate) / (1000 * 60 * 60 * 24));
      if (diffDays <= 1) return true;
    }
    
    // Also try matching by shipDate
    if (o.shipDate) {
      const shipDate = new Date(o.shipDate + 'T00:00:00');
      return shipDate >= targetStart && shipDate <= targetEnd;
    }
    
    return false;
  }) : []);
  
  const breakdown = { storage: 0, shipping: 0, pickFees: 0, boxCharges: 0, receiving: 0, other: 0 };
  const metrics = {
    totalCost: 0,
    orderCount: weekOrders.length,
    totalUnits: 0,
    avgShippingCost: 0,
    avgPickCost: 0,
    avgPackagingCost: 0,
    avgCostPerOrder: 0,
    avgUnitsPerOrder: 0,
    shippingCount: 0,
    firstPickCount: 0,
    additionalPickCount: 0,
    carrierBreakdown: {},
    stateBreakdown: {},
  };
  
  let totalShipping = 0;
  
  weekOrders.forEach(order => {
    const c = order.charges || {};
    breakdown.pickFees += (c.firstPick || 0) + (c.additionalPick || 0);
    breakdown.boxCharges += c.box || 0;
    breakdown.other += (c.reBoxing || 0) + (c.fbaForwarding || 0);
    
    metrics.firstPickCount += c.firstPickQty || 0;
    metrics.additionalPickCount += c.additionalPickQty || 0;
    
    // Track by carrier
    if (order.carrier) {
      if (!metrics.carrierBreakdown[order.carrier]) metrics.carrierBreakdown[order.carrier] = { orders: 0, cost: 0 };
      metrics.carrierBreakdown[order.carrier].orders++;
    }
    
    // Track by state
    if (order.state) {
      if (!metrics.stateBreakdown[order.state]) metrics.stateBreakdown[order.state] = 0;
      metrics.stateBreakdown[order.state]++;
    }
  });
  
  // Add non-order charges allocated to this week (exact match preferred, tight fuzzy fallback)
  Object.values(ledger.summaryCharges || {}).forEach(charge => {
    const chargeWeekDate = new Date((charge.weekKey || '') + 'T00:00:00');
    const diffDays = Math.abs((chargeWeekDate - targetDate) / (1000 * 60 * 60 * 24));
    
    if (charge.weekKey === weekKey || (exactMatches.length === 0 && diffDays <= 1)) {
      const chargeLower = (charge.chargeType || '').toLowerCase();
      if (chargeLower.includes('storage')) breakdown.storage += charge.amount || 0;
      else if (chargeLower.includes('shipping')) {
        breakdown.shipping += charge.amount || 0;
        totalShipping += charge.amount || 0;
        metrics.shippingCount += charge.count || 0;
      }
      else if (chargeLower.includes('receiving')) breakdown.receiving += charge.amount || 0;
      else breakdown.other += charge.amount || 0;
    }
  });
  
  metrics.totalUnits = metrics.firstPickCount + metrics.additionalPickCount;
  metrics.totalCost = breakdown.storage + breakdown.shipping + breakdown.pickFees + breakdown.boxCharges + breakdown.receiving + breakdown.other;
  
  // Return null if no data found (no orders and no costs)
  if (metrics.orderCount === 0 && metrics.totalCost === 0) return null;
  
  if (metrics.orderCount > 0) {
    metrics.avgPickCost = breakdown.pickFees / metrics.orderCount;
    metrics.avgPackagingCost = breakdown.boxCharges / metrics.orderCount;
    const fulfillmentCost = metrics.totalCost - breakdown.storage;
    metrics.avgCostPerOrder = fulfillmentCost / metrics.orderCount;
    metrics.avgUnitsPerOrder = metrics.totalUnits / metrics.orderCount;
    if (metrics.shippingCount > 0) metrics.avgShippingCost = totalShipping / metrics.shippingCount;
  }
  
  return { breakdown, metrics };
};

// Get 3PL data for a specific day by filtering ledger orders by shipDate
// NOTE: Storage is excluded as it's a weekly/monthly aggregate, not per-shipment
const get3PLForDay = (ledger, dayKey) => {
  if (!ledger || !ledger.orders) return null;
  
  // Find orders that shipped on this specific day
  const dayOrders = Object.values(ledger.orders).filter(o => o.shipDate === dayKey);
  
  if (dayOrders.length === 0) return null;
  
  const breakdown = { storage: 0, shipping: 0, pickFees: 0, boxCharges: 0, receiving: 0, other: 0 };
  const metrics = {
    totalCost: 0,
    orderCount: dayOrders.length,
    totalUnits: 0,
    avgShippingCost: 0,
    avgPickCost: 0,
    avgPackagingCost: 0,
    avgCostPerOrder: 0,
    avgUnitsPerOrder: 0,
    shippingCount: 0,
    firstPickCount: 0,
    additionalPickCount: 0,
    carrierBreakdown: {},
    stateBreakdown: {},
  };
  
  let totalShipping = 0;
  
  dayOrders.forEach(order => {
    const c = order.charges || {};
    breakdown.pickFees += (c.firstPick || 0) + (c.additionalPick || 0);
    breakdown.boxCharges += c.box || 0;
    breakdown.other += (c.reBoxing || 0) + (c.fbaForwarding || 0);
    
    metrics.firstPickCount += c.firstPickQty || 0;
    metrics.additionalPickCount += c.additionalPickQty || 0;
    
    // Track by carrier
    if (order.carrier) {
      if (!metrics.carrierBreakdown[order.carrier]) metrics.carrierBreakdown[order.carrier] = { orders: 0, cost: 0 };
      metrics.carrierBreakdown[order.carrier].orders++;
    }
    
    // Track by state
    if (order.state) {
      if (!metrics.stateBreakdown[order.state]) metrics.stateBreakdown[order.state] = 0;
      metrics.stateBreakdown[order.state]++;
    }
  });
  
  // Storage is NOT included in daily - it's a weekly/monthly aggregate charge
  // Only order-level charges (pick fees, box charges, etc.) are included
  
  metrics.totalUnits = metrics.firstPickCount + metrics.additionalPickCount;
  metrics.totalCost = breakdown.pickFees + breakdown.boxCharges + breakdown.other; // No storage
  
  if (metrics.orderCount > 0) {
    metrics.avgPickCost = breakdown.pickFees / metrics.orderCount;
    metrics.avgPackagingCost = breakdown.boxCharges / metrics.orderCount;
    metrics.avgCostPerOrder = metrics.totalCost / metrics.orderCount;
    metrics.avgUnitsPerOrder = metrics.totalUnits / metrics.orderCount;
  }
  
  return { breakdown, metrics };
};

// Get 3PL data for a period (month/quarter/year) by aggregating from ledger
const get3PLForPeriod = (ledger, periodKey) => {
  if (!ledger || !ledger.orders) return null;
  
  // Parse period key to determine date range
  let startDate, endDate;
  
  if (periodKey.match(/^\d{4}$/)) {
    // Year: "2025"
    startDate = new Date(parseInt(periodKey), 0, 1);
    endDate = new Date(parseInt(periodKey), 11, 31);
  } else if (periodKey.match(/^Q[1-4] \d{4}$/)) {
    // Quarter: "Q3 2024"
    const [q, year] = periodKey.split(' ');
    const quarter = parseInt(q[1]) - 1;
    startDate = new Date(parseInt(year), quarter * 3, 1);
    endDate = new Date(parseInt(year), quarter * 3 + 3, 0);
  } else if (periodKey.match(/^[A-Za-z]+ \d{4}$/)) {
    // Month: "September 2025"
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 
                    'july', 'august', 'september', 'october', 'november', 'december'];
    const parts = periodKey.split(' ');
    const monthIdx = months.indexOf(parts[0].toLowerCase());
    const year = parseInt(parts[1]);
    if (monthIdx >= 0) {
      startDate = new Date(year, monthIdx, 1);
      endDate = new Date(year, monthIdx + 1, 0);
    }
  }
  
  if (!startDate || !endDate) return null;
  
  // Filter orders within date range
  const periodOrders = Object.values(ledger.orders).filter(o => {
    const orderDate = new Date(o.shipDate + 'T00:00:00');
    return orderDate >= startDate && orderDate <= endDate;
  });
  
  if (periodOrders.length === 0) return null;
  
  const breakdown = { storage: 0, shipping: 0, pickFees: 0, boxCharges: 0, receiving: 0, other: 0 };
  const metrics = {
    totalCost: 0,
    orderCount: periodOrders.length,
    totalUnits: 0,
    avgCostPerOrder: 0,
    avgUnitsPerOrder: 0,
  };
  
  periodOrders.forEach(order => {
    const c = order.charges || {};
    breakdown.pickFees += (c.firstPick || 0) + (c.additionalPick || 0);
    breakdown.boxCharges += c.box || 0;
    breakdown.other += (c.reBoxing || 0) + (c.fbaForwarding || 0);
    metrics.totalUnits += (c.firstPickQty || 0) + (c.additionalPickQty || 0);
  });
  
  // Add summary charges within date range
  Object.values(ledger.summaryCharges || {}).forEach(charge => {
    const chargeDate = new Date((charge.weekKey || '') + 'T00:00:00');
    if (chargeDate >= startDate && chargeDate <= endDate) {
      const chargeLower = (charge.chargeType || '').toLowerCase();
      if (chargeLower.includes('storage')) breakdown.storage += charge.amount || 0;
      else if (chargeLower.includes('shipping')) breakdown.shipping += charge.amount || 0;
      else if (chargeLower.includes('receiving')) breakdown.receiving += charge.amount || 0;
      else breakdown.other += charge.amount || 0;
    }
  });
  
  metrics.totalCost = breakdown.storage + breakdown.shipping + breakdown.pickFees + breakdown.boxCharges + breakdown.receiving + breakdown.other;
  if (metrics.orderCount > 0) {
    metrics.avgCostPerOrder = (metrics.totalCost - breakdown.storage) / metrics.orderCount;
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
  const [allDaysData, setAllDaysData] = useState({}); // Daily data keyed by date YYYY-MM-DD
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null); // For daily upload
  const [viewingDayDetails, setViewingDayDetails] = useState(null); // For viewing day data details (date string)
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [toast, setToast] = useState(null); // { message: string, type: 'success' | 'error' }
  
  // Settings tab state
  const [settingsTab, setSettingsTab] = useState(() => {
    try { return safeLocalStorageGetString('ecommerce_settings_tab', 'general'); } catch (e) { devWarn("[init]", e?.message); return 'general'; }
  }); // 'general' | 'integrations' | 'thresholds' | 'display' | 'data' | 'account'
  
  // Persist settings tab selection
  useEffect(() => {
    try { safeLocalStorageSet('ecommerce_settings_tab', settingsTab); } catch (e) { if (e?.message) devWarn("[catch]", e.message); }
  }, [settingsTab]);
  
  // Undo deletion state - stores recently deleted items for 10-second undo window
  const [deletedItems, setDeletedItems] = useState([]); // Array of { type, key, data, expiry, undoTimer }
  
  const [reprocessPeriod, setReprocessPeriod] = useState(null); // For period reprocessing
  const [threeplTimeView, setThreeplTimeView] = useState('weekly'); // For 3PL analytics view (weekly or monthly only) (weekly or monthly only)
  const [threeplDateRange, setThreeplDateRange] = useState('all'); // 'week' | '4weeks' | 'month' | 'quarter' | 'year' | 'all' | 'custom'
  const [threeplCustomStart, setThreeplCustomStart] = useState('');
  const [threeplCustomEnd, setThreeplCustomEnd] = useState('');
  const [uploadTab, setUploadTab] = useState('amazon-bulk'); // For upload view tabs
  const [dashboardRange, setDashboardRange] = useState('month'); // 'yesterday' | 'week' | 'month' | 'quarter' | 'year'
  const [trendsTab, setTrendsTab] = useState('daily'); // 'daily' | 'weekly' | 'monthly' | 'yearly' for trends view
  const [profitSubTab, setProfitSubTab] = useState('profitability'); // 'profitability' | 'pnl'
  const [trendsChannel, setTrendsChannel] = useState('combined'); // 'amazon' | 'shopify' | 'combined' for trends filtering
  const [trendsDateRange, setTrendsDateRange] = useState({ start: null, end: null, preset: 'all' }); // Date range filter for trends
  const [profitPeriodIndex, setProfitPeriodIndex] = useState(-1); // -1 = most recent, 0+ = index from end of available periods
  const [dailyFiles, setDailyFiles] = useState({ amazon: null, shopify: null }); // Daily upload files
  const [dailyAdSpend, setDailyAdSpend] = useState({ meta: '', google: '' }); // Daily ad spend inputs
  const [calendarMonth, setCalendarMonth] = useState(null); // null = auto (latest data), or { year, month }
  
  // Amazon Campaign Data
  const [amazonCampaigns, setAmazonCampaigns] = useState(() => {
    try { return safeLocalStorageGet('ecommerce_amazon_campaigns_v1', { campaigns: [], lastUpdated: null, history: [], historicalDaily: {} }); }
    catch (e) { devWarn("[init]", e?.message); return { campaigns: [], lastUpdated: null, history: [], historicalDaily: {} }; }
  });
  const [amazonCampaignSort, setAmazonCampaignSort] = useState({ field: 'spend', dir: 'desc' });
  const [amazonCampaignFilter, setAmazonCampaignFilter] = useState({ status: 'all', type: 'all', search: '' });
  
  // Amazon Ads Intelligence Data (search terms, placements, targeting, etc.)
  const [adsIntelData, setAdsIntelData] = useState(() => {
    if (!shouldUseLocalStorage) return {};
    try { 
      const raw = lsGet('ecommerce_ads_intel_v1');
      return raw ? JSON.parse(raw) : {};
    }
    catch (e) { devWarn("[init]", e?.message); return {}; }
  });
  const [showAdsIntelUpload, setShowAdsIntelUpload] = useState(false);
  
  // DTC Ads Intel (Meta/Google/Amazon SQP/Shopify)
  const [dtcIntelData, setDtcIntelData] = useState(() => {
    if (!shouldUseLocalStorage) return {};
    try { 
      const raw = lsGet('ecommerce_dtc_intel_v1');
      return raw ? JSON.parse(raw) : {};
    }
    catch (e) { devWarn("[init]", e?.message); return {}; }
  });
  const [showDtcIntelUpload, setShowDtcIntelUpload] = useState(false);
  
  // Persist adsIntelData
  useEffect(() => {
    if (adsIntelData?.lastUpdated) {
      try { lsSet('ecommerce_ads_intel_v1', JSON.stringify(adsIntelData)); } catch (e) { if (e?.message) devWarn("[catch]", e.message); }
    }
  }, [adsIntelData]);
  
  // Persist dtcIntelData
  useEffect(() => {
    if (dtcIntelData?.lastUpdated) {
      try { lsSet('ecommerce_dtc_intel_v1', JSON.stringify(dtcIntelData)); } catch (e) { if (e?.message) devWarn("[catch]", e.message); }
    }
  }, [dtcIntelData]);

  // Report History & Action Tracker (Features 2 & 6)
  const [reportHistory, setReportHistory] = useState(() => {
    try { return safeLocalStorageGet('ecommerce_report_history_v1', []); } catch (e) { devWarn("[init]", e?.message); return []; }
  });
  const [actionItems, setActionItems] = useState(() => {
    try { return safeLocalStorageGet('ecommerce_action_items_v1', []); } catch (e) { devWarn("[init]", e?.message); return []; }
  });
  
  // Persist report history & action items
  useEffect(() => {
    if (reportHistory?.length) {
      try { lsSet('ecommerce_report_history_v1', JSON.stringify(reportHistory)); } catch (e) { if (e?.message) devWarn("[catch]", e.message); }
    }
  }, [reportHistory]);
  useEffect(() => {
    if (actionItems?.length) {
      try { lsSet('ecommerce_action_items_v1', JSON.stringify(actionItems)); } catch (e) { if (e?.message) devWarn("[catch]", e.message); }
    }
  }, [actionItems]);

  // Weekly Intelligence Reports
  const [weeklyReports, setWeeklyReports] = useState(() => {
    const defaultReports = { 
      weekly: { reports: [], lastGenerated: null },
      monthly: { reports: [], lastGenerated: null },
      quarterly: { reports: [], lastGenerated: null },
      annual: { reports: [], lastGenerated: null },
      preferences: { autoGenerate: true, emailDelivery: false, emailAddress: '' }, 
    };
    const stored = safeLocalStorageGet(WEEKLY_REPORTS_KEY, null);
    if (!stored) return defaultReports;
    return {
      weekly: stored?.weekly || defaultReports.weekly,
      monthly: stored?.monthly || defaultReports.monthly,
      quarterly: stored?.quarterly || defaultReports.quarterly,
      annual: stored?.annual || defaultReports.annual,
      preferences: stored?.preferences || defaultReports.preferences,
    };
  });
  const [showWeeklyReport, setShowWeeklyReport] = useState(false);
  const [currentReport, setCurrentReport] = useState(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState(null);
  const [reportType, setReportType] = useState('weekly');
  const [selectedReportPeriod, setSelectedReportPeriod] = useState(null); // null = latest

  const [storeName, setStoreName] = useState('');
  const [storeLogo, setStoreLogo] = useState(() => safeLocalStorageGetString('ecommerce_store_logo', null));
  
  // Shopify Integration
  const [shopifyCredentials, setShopifyCredentials] = useState({ storeUrl: '', clientId: '', clientSecret: '', connected: false, lastSync: null });
  
  // QuickBooks Online API Integration
  const [qboCredentials, setQboCredentials] = useState({ 
    clientId: '', 
    clientSecret: '', 
    realmId: '', // Company ID
    accessToken: '',
    refreshToken: '',
    connected: false, 
    lastSync: null,
    syncFrequency: 'daily', // daily, weekly, manual
    autoSync: false
  });
  const [shopifySyncStatus, setShopifySyncStatus] = useState({ loading: false, error: null, progress: '' });
  const [shopifySyncRange, setShopifySyncRange] = useState({ start: '', end: '' });
  const [shopifySyncPreview, setShopifySyncPreview] = useState(null);
  const [shopifyInventoryStatus, setShopifyInventoryStatus] = useState({ loading: false, error: null, lastSync: null });
  const [shopifyInventoryPreview, setShopifyInventoryPreview] = useState(null);
  const [shopifySmartSync, setShopifySmartSync] = useState({ enabled: true, missingDays: [], existingDays: [] });
  
  // Packiyo 3PL Direct Integration
  const [packiyoCredentials, setPackiyoCredentials] = useState({ 
    apiKey: '', 
    customerId: '134',
    baseUrl: 'https://excel3pl.packiyo.com/api/v1',
    connected: false, 
    lastSync: null,
    customerName: ''
  });
  const [packiyoInventoryStatus, setPackiyoInventoryStatus] = useState({ loading: false, error: null, lastSync: null });
  const [packiyoInventoryData, setPackiyoInventoryData] = useState(null);
  
  // Amazon SP-API Integration (FBA + AWD Inventory)
  const [amazonCredentials, setAmazonCredentials] = useState({
    clientId: '',
    clientSecret: '',
    refreshToken: '',
    sellerId: '',
    marketplaceId: 'ATVPDKIKX0DER', // US marketplace
    connected: false,
    lastSync: null,
    // Ads API (optional, separate credentials)
    adsClientId: '',
    adsClientSecret: '',
    adsRefreshToken: '',
    adsProfileId: '',
    adsConnected: false,
    adsLastSync: null,
  });
  const [amazonInventoryStatus, setAmazonInventoryStatus] = useState({ loading: false, error: null, lastSync: null });
  const [amazonInventoryData, setAmazonInventoryData] = useState(null);
  
  // Navigation dropdown states
  const [navDropdown, setNavDropdown] = useState(null); // 'data' | 'analytics' | 'operations' | null
  
  // Sales Tax Period Calculator
  const [taxPeriodType, setTaxPeriodType] = useState('month');
  const [taxPeriodValue, setTaxPeriodValue] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

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
  const [dataLoading, setDataLoading] = useState(true); // Shows skeletons during initial load
const skuDemandStatsRef = useRef({}); // Safety stock, seasonality, CV per SKU

// Conflict detection for multi-device sync
const [loadedCloudVersion, setLoadedCloudVersion] = useState(null); // Timestamp when we loaded from cloud
const [showConflictModal, setShowConflictModal] = useState(false);
const [conflictData, setConflictData] = useState(null); // { cloudData, cloudVersion, localData }
const conflictCheckRef = useRef(false); // Prevent multiple conflict checks
const saveInProgressRef = useRef(false); // Prevent concurrent saves
const pendingSaveDataRef = useRef(null); // Queue next save if one is in progress

// Multi-store support
const [stores, setStores] = useState([]); // List of { id, name, createdAt }
const [activeStoreId, setActiveStoreId] = useState(null);
const [showStoreSelector, setShowStoreSelector] = useState(false); // Header dropdown
const [showStoreModal, setShowStoreModal] = useState(false); // Full modal for create/manage
const [newStoreName, setNewStoreName] = useState('');

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
  
  // CRITICAL: Cancel any pending cloud saves BEFORE signing out
  // This prevents empty credentials from being saved to cloud
  if (saveTimerRef.current) {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
  }
  isLoadingDataRef.current = true; // Prevent sync effects from running
  
  await supabase.auth.signOut();
  setSession(null);
  // Clear any locked state
  setIsLocked(false);
  
  // CRITICAL: Clear localStorage to prevent data leakage between users
  const keysToKeep = ['ecommerce_theme',
    'ecommerce_shopify_creds_v1', 'ecommerce_packiyo_creds_v1',
    'ecommerce_amazon_creds_v1', 'ecommerce_qbo_creds_v1']; // Keep theme + API credentials
  const allKeys = Object.keys(localStorage).filter(k => k.startsWith('ecommerce_'));
  allKeys.forEach(k => {
    if (!keysToKeep.includes(k)) {
      localStorage.removeItem(k);
    }
  });
  
  // Reset ALL data state to prevent showing previous user's data
  // === Core Data ===
  setAllWeeksData({});
  setAllDaysData({});
  setAllPeriodsData({});
  setInvHistory({});
  setSavedCogs({});
  setCogsLastUpdated(null);
  setSavedProductNames({});
  setStoreName('');
  setStoreLogo('');
  
  // === Tax & Finance ===
  setSalesTaxConfig({ nexusStates: {}, filingHistory: {}, hiddenStates: [] });
  setInvoices([]);
  setBankingData({ transactions: [], accounts: {}, categories: {}, monthlySnapshots: {} });
  setConfirmedRecurring([]);
  
  // === Forecasts & AI ===
  setAmazonForecasts({});
  setForecastMeta({ lastUploads: { '7day': null, '30day': null, '60day': null }, history: [] });
  setAiForecasts(null);
  setAiForecastModule({ salesForecast: null, inventoryPlan: null, lastUpdated: null, loading: null, error: null });
  setAiLearningHistory({ predictions: [], outcomes: [], modelUpdates: [] });
  setUnifiedAIModel(null);
  setForecastAccuracyHistory({ records: [], lastUpdated: null, modelVersion: 1 });
  setForecastCorrections({ overall: { revenue: 1.0, units: 1.0, profit: 1.0 }, bySku: {}, byMonth: {}, byQuarter: {}, confidence: 0, samplesUsed: 0, lastUpdated: null });
  
  // === Goals & Notes ===
  setWeekNotes({});
  setGoals({ weeklyRevenue: 0, monthlyRevenue: 0, weeklyProfit: 0, monthlyProfit: 0 });
  setWeeklyReports({});
  
  // === Production & 3PL ===
  setProductionPipeline([]);
  setThreeplLedger({ orders: {}, weeklyTotals: {} });
  setReturnRates({ overall: {}, bySku: {}, byMonth: {}, byWeek: {} });
  setLeadTimeSettings({ defaultLeadTimeDays: 14, skuLeadTimes: {}, reorderBuffer: 7 });
  
  // === Ads & Campaigns ===
  setAmazonCampaigns({ campaigns: [], lastUpdated: null, history: [] });
  
  // === Widget & UI Config ===
  setWidgetConfig({});
  setAppSettings({
    inventoryDaysOptimal: 60, inventoryDaysLow: 30, inventoryDaysCritical: 14,
    tacosOptimal: 15, tacosWarning: 25, tacosMax: 35, roasTarget: 3.0,
    marginTarget: 25, marginWarning: 15,
    modulesEnabled: { weeklyTracking: true, periodTracking: true, inventory: true, trends: true, yoy: true, skus: true, profitability: true, ads: true, threepl: true, salesTax: true },
    dashboardDefaultRange: 'month', showWeeklyGoals: true, showMonthlyGoals: true,
    alertSalesTaxDays: 7, alertInventoryEnabled: true,
  });
  
  // === AI Chat History ===
  setAiMessages([]);
  setAdsAiMessages([]);
  
  // === Integrations ===
  setShopifyCredentials({ storeUrl: '', clientId: '', clientSecret: '', connected: false, lastSync: null });
  setPackiyoCredentials({ apiKey: '', customerId: '134', baseUrl: 'https://excel3pl.packiyo.com/api/v1', connected: false, lastSync: null, customerName: '' });
  
  // === Stores ===
  setStores([]);
  setActiveStoreId(null);
  
  // === Sync Status ===
  setLastBackupDate(null);
  setLastSyncDate(null);
  
  // === Conflict Detection ===
  setLoadedCloudVersion(null);
  setShowConflictModal(false);
  setConflictData(null);
  conflictCheckRef.current = false;
  
  // Re-enable data loading for next login (after all state is reset)
  isLoadingDataRef.current = false; setDataLoading(false);
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
  
  // SKU Return Rate Tracking - tracks returns at SKU level
  const [returnRates, setReturnRates] = useState(() => {
    const defaultRates = { bySku: {}, byWeek: {}, byMonth: {}, overall: { unitsSold: 0, unitsReturned: 0, returnRate: 0 }, lastUpdated: null };
    return safeLocalStorageGet('ecommerce_return_rates_v1', defaultRates);
  });
  
  // Persist return rates
  useEffect(() => {
    if (returnRates.lastUpdated) {
      safeLocalStorageSet('ecommerce_return_rates_v1', JSON.stringify(returnRates));
    }
  }, [returnRates]);
  
  const [showEditAdSpend, setShowEditAdSpend] = useState(false);
  const [editAdSpend, setEditAdSpend] = useState({ meta: '', google: '' });
  const [showEdit3PL, setShowEdit3PL] = useState(false);
  const [edit3PLCost, setEdit3PLCost] = useState('');
  const [lastBackupDate, setLastBackupDate] = useState(() => safeLocalStorageGetString('ecommerce_last_backup', null));
  const [lastSyncDate, setLastSyncDate] = useState(null);
  
  // Bulk Ad Upload state
  // const [bulkAdPlatform, setBulkAdPlatform] = useState('google'); // No longer needed - auto-detected
  const [bulkAdFiles, setBulkAdFiles] = useState([]); // Array of { name, content, parsed }
  const [bulkAdParsed, setBulkAdParsed] = useState(null); // Combined: { dailyData, weeklyData, totalSpend, error, dateRange }
  const [bulkAdProcessing, setBulkAdProcessing] = useState(false); // Processing multiple files
  
  // Amazon Bulk SKU Economics Upload state
  const [amazonBulkFiles, setAmazonBulkFiles] = useState([]); // Array of { file, name, parsed, reportType, dateRange }
  const [amazonBulkParsed, setAmazonBulkParsed] = useState(null); // Combined results after parsing
  const [amazonBulkProcessing, setAmazonBulkProcessing] = useState(false);
  
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
  
  // 3PL Ledger - stores all 3PL orders with dates for deduplication
  const [threeplLedger, setThreeplLedger] = useState({
    orders: {}, // { uniqueKey: { orderNumber, trackingNumber, shipDate, weekKey, charges: {}, carrier, serviceLevel, state, weight, ... } }
    summaryCharges: {}, // { uniqueKey: { date, chargeType, amount, count, ... } } - for non-order charges like storage, receiving
    importedFiles: [], // Track which files have been imported
  });
  const [show3PLBulkUpload, setShow3PLBulkUpload] = useState(false);
  const [threeplUploadStatus, setThreeplUploadStatus] = useState(null); // { processing: bool, results: [] }
  const [threeplSelectedFiles, setThreeplSelectedFiles] = useState([]);
  const [threeplProcessing, setThreeplProcessing] = useState(null); // null or { current: number, total: number, fileName: string }
  const [threeplResults, setThreeplResults] = useState(null);
  
  // Ads Bulk Upload (Meta & Google)
  const [showAdsBulkUpload, setShowAdsBulkUpload] = useState(false);
  const [adsSelectedFiles, setAdsSelectedFiles] = useState([]);
  const [adsProcessing, setAdsProcessing] = useState(null); // null or { current: number, total: number, fileName: string }
  const [adsResults, setAdsResults] = useState(null);
  
  // Amazon Ads Bulk Upload (Historical)
  // Amazon Ads Bulk Upload state removed - consolidated into AmazonAdsIntelModal
  
  // Banking Module - QBO Transaction Data
  const [bankingData, setBankingData] = useState(() => {
    const defaultBanking = { 
      transactions: [], 
      lastUpload: null, 
      accounts: {},
      categories: {},
      monthlySnapshots: {},
      categoryOverrides: {},
      vendorOverrides: {},
      settings: { reminderEnabled: true, reminderTime: '09:00' }
    };
    return safeLocalStorageGet('ecommerce_banking_v1', defaultBanking);
  });
  const [bankingFile, setBankingFile] = useState(null);
  const [bankingProcessing, setBankingProcessing] = useState(false);
  const [bankingDateRange, setBankingDateRange] = useState('month'); // 'week' | 'month' | 'quarter' | 'year' | 'all' | 'ytd'
  const [bankingTab, setBankingTab] = useState('overview'); // 'overview' | 'income' | 'expenses' | 'accounts' | 'trends' | 'ai' | 'cfo' | 'cards' | 'channels' | 'vendors'
  const [channelPeriod, setChannelPeriod] = useState('ytd'); // 'month' | 'ytd' | 'all' - for revenue channel view
  const [bankingCategoryFilter, setBankingCategoryFilter] = useState('all');
  const [showBankingUpload, setShowBankingUpload] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null); // Transaction being edited
  const [selectedTxnIds, setSelectedTxnIds] = useState(new Set()); // Selected transactions for merging
  const [showMergeModal, setShowMergeModal] = useState(false); // Merge modal visibility
  const [bankingDrilldown, setBankingDrilldown] = useState(null); // { category: string, type: 'expense'|'income' } for drill-down view
  const [editingAccountBalance, setEditingAccountBalance] = useState(null); // { name: string, balance: number } for manual balance edit
  const [profitTrackerPeriod, setProfitTrackerPeriod] = useState('month'); // Profit tracker period selector
  const [profitTrackerCustomRange, setProfitTrackerCustomRange] = useState({ start: '', end: '' });
  const [confirmedRecurring, setConfirmedRecurring] = useState(() => {
    return safeLocalStorageGet('ecommerce_recurring_v1', {});
  });
  const [showAddRecurring, setShowAddRecurring] = useState(false);
  const [recurringForm, setRecurringForm] = useState({ vendor: '', category: '', amount: '', notes: '' });
  const [skuDateRange, setSkuDateRange] = useState('all'); // 'all' | '4weeks' | 'ytd' | '2025' | '2024'
  
  // Save confirmed recurring to localStorage
  useEffect(() => {
    safeLocalStorageSet('ecommerce_recurring_v1', JSON.stringify(confirmedRecurring));
  }, [confirmedRecurring]);
  
  // Sales Tax Management
  const [salesTaxConfig, setSalesTaxConfig] = useState({
    nexusStates: {}, // { stateCode: { hasNexus: true, frequency: 'monthly', registrationId: '', portalUrl: '', customFilings: [], notes: '' } }
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
  
  // Local state for tax config form (to prevent re-render on each keystroke)
  const [taxFormRegistrationId, setTaxFormRegistrationId] = useState('');
  const [taxFormNotes, setTaxFormNotes] = useState('');
  
  // Initialize tax form fields when modal opens
  useEffect(() => {
    if (showTaxStateConfig && taxConfigState) {
      const config = salesTaxConfig.nexusStates?.[taxConfigState] || {};
      setTaxFormRegistrationId(config.registrationId || '');
      setTaxFormNotes(config.notes || '');
    }
  }, [showTaxStateConfig, taxConfigState, salesTaxConfig.nexusStates]);
  
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
  const [filingDetailState, setFilingDetailState] = useState(null); // { stateCode, data } for filing format modal
  const [editingPortalUrl, setEditingPortalUrl] = useState(null); // stateCode being edited
  const [editPortalUrlValue, setEditPortalUrlValue] = useState('');
  
  // AI Chatbot state
  const [showAIChat, setShowAIChat] = useState(false);
  const [aiMessages, setAiMessages] = useState(() => {
    try { return safeLocalStorageGet('ecommerce_ai_chat_history_v1', []); } catch (e) { devWarn("[init]", e?.message); return []; }
  });
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  
  // AI Ads Insights Chat (separate from main AI chat)
  const [showAdsAIChat, setShowAdsAIChat] = useState(false);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [adsAiMessages, setAdsAiMessages] = useState(() => {
    try { return safeLocalStorageGet('ecommerce_ads_ai_chat_v1', []); } catch (e) { devWarn("[init]", e?.message); return []; }
  });
  const [adsAiInput, setAdsAiInput] = useState('');
  const [adsAiLoading, setAdsAiLoading] = useState(false);
  const [aiChatModel, setAiChatModel] = useState(AI_DEFAULT_MODEL);
  // Prior report summaries — persisted so AI remembers past analyses
  const [adsAiReportHistory, setAdsAiReportHistory] = useState(() => {
    try { return safeLocalStorageGet('ecommerce_ads_report_history_v1', []); } catch (e) { devWarn("[init]", e?.message); return []; }
  });
  const pendingAdsAnalysisRef = useRef(false);
  
  // Help modal
  const [showUploadHelp, setShowUploadHelp] = useState(false);
  
  // ========== NEW MAJOR FEATURES ==========
  
  // 1. Onboarding Wizard for new users
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingComplete, setOnboardingComplete] = useState(() => {
    try { return safeLocalStorageGet('ecommerce_onboarding_complete_v1', false); } catch (e) { devWarn("[init]", e?.message); return false; }
  });
  
  // 2. PDF Report Export
  const [showPdfExport, setShowPdfExport] = useState(false);
  const [pdfExportConfig, setPdfExportConfig] = useState({
    reportType: 'weekly', // weekly, monthly, custom
    dateRange: { start: '', end: '' },
    includeSections: {
      summary: true,
      revenue: true,
      profitability: true,
      skuBreakdown: true,
      inventory: true,
      ads: true,
      trends: true,
    },
    branding: {
      showLogo: true,
      showStoreName: true,
    }
  });
  const [pdfGenerating, setPdfGenerating] = useState(false);
  
  // 3. (Industry Benchmarks removed)
  
  // 4. Push Notifications for inventory/alerts
  const [notificationSettings, setNotificationSettings] = useState(() => {
    try { 
      return safeLocalStorageGet('ecommerce_notifications_v1', {
        enabled: false,
        permission: 'default', // default, granted, denied
        alerts: {
          lowInventory: true,
          criticalInventory: true,
          overdueBills: true,
          goalsMissed: true,
          salesTaxDeadlines: true,
          weeklyReport: false,
        }
      }); 
    } catch { 
      return { enabled: false, permission: 'default', alerts: { lowInventory: true, criticalInventory: true, overdueBills: true, goalsMissed: true, salesTaxDeadlines: true, weeklyReport: false } }; 
    }
  });
  
  // ========== END NEW MAJOR FEATURES ==========
  
  // NEW FEATURES STATE
  // 1. Dashboard Widget Customization (DEFAULT_DASHBOARD_WIDGETS defined at module level)
  const [widgetConfig, setWidgetConfig] = useState(() => {
    try { 
      const stored = safeLocalStorageGet(WIDGET_KEY, null);
      // Must have widgets array with at least some items - validate each widget has required fields
      if (stored && Array.isArray(stored.widgets) && stored.widgets.length > 0) {
        // Validate structure
        const isValid = stored.widgets.every(w => w.id && typeof w.enabled === 'boolean');
        if (isValid) return stored;
      }
      // Invalid or missing - use defaults
      return JSON.parse(JSON.stringify(DEFAULT_DASHBOARD_WIDGETS));
    } catch { 
      return JSON.parse(JSON.stringify(DEFAULT_DASHBOARD_WIDGETS)); 
    }
  });
  const [editingWidgets, setEditingWidgets] = useState(false);
  const [draggedWidgetId, setDraggedWidgetId] = useState(null);
  const [dragOverWidgetId, setDragOverWidgetId] = useState(null);
  
  // Production Pipeline
  const PRODUCTION_KEY = 'ecommerce_production_v1';
  const [productionPipeline, setProductionPipeline] = useState(() => {
    try { return safeLocalStorageGet('ecommerce_production_v1', []); } catch (e) { devWarn("[init]", e?.message); return []; }
  });
  const [showAddProduction, setShowAddProduction] = useState(false);
  const [editingProduction, setEditingProduction] = useState(null);
  const [productionForm, setProductionForm] = useState({ 
    // Legacy single-item fields (kept for backwards compatibility)
    sku: '', 
    productName: '', 
    quantity: '', 
    expectedDate: '', 
    notes: '',
    // Enhanced PO fields
    poNumber: '',
    vendor: '',
    unitCost: '',
    paymentTerms: '50-50', // '30-70-ship' | '50-50' | 'net30' | 'custom'
    depositPercent: 50,
    depositPaid: false,
    depositPaidDate: '',
    balancePaid: false,
    balancePaidDate: '',
    shipments: [], // [{ date, units, paid }]
    // Net terms
    depositNetDays: 0, // Days after PO to pay deposit (0 = immediate)
    balanceNetDays: 0, // Days after shipment to pay balance (0 = on shipment)
    // Cure time (for soaps)
    cureTimeDays: 0, // Days product needs before sellable
    // Multi-SKU line items
    lineItems: [], // [{ sku, productName, quantity, unitCost }]
  });
  const [productionFile, setProductionFile] = useState(null);
  const [productionFileName, setProductionFileName] = useState('');
  const [extractingProduction, setExtractingProduction] = useState(false);
  const [showAddShipment, setShowAddShipment] = useState(null); // PO id for adding shipment
  const [shipmentForm, setShipmentForm] = useState({ date: '', units: '', notes: '' });
  
  // Lead Time Settings
  const [leadTimeSettings, setLeadTimeSettings] = useState(() => {
    const defaultSettings = { 
      defaultLeadTimeDays: 14, 
      skuLeadTimes: {}, 
      reorderBuffer: 7, 
      reorderTriggerDays: 60, 
      minOrderWeeks: 22,
      channelRules: {
        amazon: { minDaysOfSupply: 60, alertEnabled: true },
        threepl: { alertEnabled: true, defaultQtyThreshold: 50, skuThresholds: {}, categoryThresholds: { 'soap': 50, 'balm': 100, 'lip': 100 } },
      },
      skuSettings: {}, // SKU-level settings: { [sku]: { leadTime, reorderPoint, targetDays, alertThreshold, alertEnabled } }
      storageCostAllocation: 'proportional',
      // Category-based lead times: { "Lip Balm": { leadTimeDays: 14, reorderTriggerDays: 60, minOrderWeeks: 22 }, ... }
      categoryLeadTimes: {},
      // SKU → category mapping: { "DDPE0002Shop": "Lip Balm", ... }
      skuCategories: {},
    };
    const saved = safeLocalStorageGet('ecommerce_lead_times_v1', null);
    if (!saved) return defaultSettings;
    return {
      defaultLeadTimeDays: saved.defaultLeadTimeDays || 14,
      skuLeadTimes: saved.skuLeadTimes || {},
      reorderBuffer: saved.reorderBuffer || 7,
      reorderTriggerDays: saved.reorderTriggerDays || 60,
      minOrderWeeks: saved.minOrderWeeks || 22,
      channelRules: saved.channelRules || defaultSettings.channelRules,
      skuSettings: saved.skuSettings || {},
      storageCostAllocation: saved.storageCostAllocation || 'proportional',
      categoryLeadTimes: saved.categoryLeadTimes || {},
      skuCategories: saved.skuCategories || {},
    }; 
  });
  
  // SKU Settings Modal
  const [showSkuSettings, setShowSkuSettings] = useState(false);
  const [editingSku, setEditingSku] = useState(null);
  const [invShowZeroStock, setInvShowZeroStock] = useState(false);
  const [invSortColumn, setInvSortColumn] = useState('totalValue'); // Default sort by value
  const [invSortDirection, setInvSortDirection] = useState('desc'); // desc = highest first
  const [skuSettingsSearch, setSkuSettingsSearch] = useState('');
  const [skuSettingsEditItem, setSkuSettingsEditItem] = useState(null);
  const [skuSettingsEditForm, setSkuSettingsEditForm] = useState({});
  
  // SKU Performance table sorting
  const [skuSortColumn, setSkuSortColumn] = useState('revenue'); // revenue, profit, units, margin
  const [skuSortDirection, setSkuSortDirection] = useState('desc');
  const [skuSearchQuery, setSkuSearchQuery] = useState('');
  
  // Profitability table sorting
  const [profitSortColumn, setProfitSortColumn] = useState('profit');
  const [profitSortDirection, setProfitSortDirection] = useState('desc');
  
  // Save lead time settings
  useEffect(() => {
    safeLocalStorageSet('ecommerce_lead_times_v1', JSON.stringify(leadTimeSettings));
  }, [leadTimeSettings]);
  
  // Modular AI Forecasts State
  const [aiForecastModule, setAiForecastModule] = useState({
    sales: null,        // { tomorrow, week, month, quarter }
    inventory: null,    // { recommendations, alerts }
    amazon: null,       // Amazon channel specific
    shopify: null,      // Shopify channel specific
    comparison: null,   // AI vs Amazon comparison
    loading: null,      // Which module is loading
    lastUpdated: null,
  });
  
  // AI Learning Data - tracks all predictions vs actuals
  const [aiLearningHistory, setAiLearningHistory] = useState(() => {
    try { return safeLocalStorageGet('ecommerce_ai_learning_v1', { predictions: [], accuracy: {} }); } 
    catch (e) { devWarn("[init]", e?.message); return { predictions: [], accuracy: {} }; }
  });
  
  // ============ UNIFIED AI MODEL ============
  // Single source of truth for all AI learning - combines forecasts, patterns, and corrections
  const [unifiedAIModel, setUnifiedAIModel] = useState(() => {
    const defaultModel = { version: '1.0', lastUpdated: null, dataAvailability: {}, corrections: {}, signalWeights: {}, patterns: {}, predictions: [], accuracy: {}, confidence: {} };
    return safeLocalStorageGet('ecommerce_unified_ai_v1', defaultModel);
  });
  
  // Persist unified AI model
  useEffect(() => {
    if (unifiedAIModel.lastUpdated) {
      safeLocalStorageSet('ecommerce_unified_ai_v1', JSON.stringify(unifiedAIModel));
    }
  }, [unifiedAIModel]);
  
  useEffect(() => {
    safeLocalStorageSet('ecommerce_ai_learning_v1', JSON.stringify(aiLearningHistory));
  }, [aiLearningHistory]);
  
  // Save AI chat history to localStorage
  useEffect(() => {
    if (aiMessages.length > 0) {
      // Keep last 100 messages to avoid localStorage bloat
      const messagesToSave = aiMessages.slice(-100);
      safeLocalStorageSet('ecommerce_ai_chat_history_v1', JSON.stringify(messagesToSave));
    }
  }, [aiMessages]);
  
  // Persist Ads AI conversation across sessions
  useEffect(() => {
    if (adsAiMessages.length > 0) {
      const messagesToSave = adsAiMessages.slice(-60); // Keep last 60 messages
      safeLocalStorageSet('ecommerce_ads_ai_chat_v1', JSON.stringify(messagesToSave));
    }
  }, [adsAiMessages]);
  
  // Persist prior report summaries
  useEffect(() => {
    if (adsAiReportHistory.length > 0) {
      safeLocalStorageSet('ecommerce_ads_report_history_v1', JSON.stringify(adsAiReportHistory.slice(-10))); // Last 10 reports
    }
  }, [adsAiReportHistory]);
  
  // Listen for QBO OAuth callback from popup window
  useEffect(() => {
    const handleQBOMessage = (event) => {
      // SEC-007: Only accept messages from our own origin (popup is same domain)
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'QBO_AUTH_SUCCESS') {
        setQboCredentials(prev => ({
          ...prev,
          accessToken: event.data.accessToken,
          refreshToken: event.data.refreshToken,
          realmId: event.data.realmId || prev.realmId,
          connected: true,
          lastSync: null,
        }));
        setToast({ message: 'Connected to QuickBooks Online!', type: 'success' });
      }
    };
    
    window.addEventListener('message', handleQBOMessage);
    return () => window.removeEventListener('message', handleQBOMessage);
  }, []);
  
  // Persist onboarding completion
  useEffect(() => {
    if (onboardingComplete) {
      safeLocalStorageSet('ecommerce_onboarding_complete_v1', JSON.stringify(true));
    }
  }, [onboardingComplete]);
  
  // Persist notification settings
  useEffect(() => {
    safeLocalStorageSet('ecommerce_notifications_v1', JSON.stringify(notificationSettings));
  }, [notificationSettings]);

  // Backup reminder - prompt when data exists but no backup in 7+ days
  useEffect(() => {
    const hasData = Object.keys(allWeeksData).length > 0 || Object.keys(allDaysData).length > 0;
    if (!hasData) return;
    const daysSinceBackup = lastBackupDate ? Math.floor((Date.now() - new Date(lastBackupDate).getTime()) / (1000 * 60 * 60 * 24)) : 999;
    if (daysSinceBackup >= 7) {
      // Only show once per session
      const sessionKey = 'ecommerce_backup_reminder_shown';
      if (sessionStorage.getItem(sessionKey)) return;
      sessionStorage.setItem(sessionKey, '1');
      const timer = setTimeout(() => {
        setToast({ 
          message: lastBackupDate 
            ? `Last backup was ${daysSinceBackup} days ago. Export a backup to protect your data.`
            : 'You haven\'t backed up your data yet. Export a backup from the header bar.',
          type: 'warning',
          action: { label: 'Backup Now', onClick: exportAll }
        });
      }, 5000); // 5s delay so it doesn't flash on load
      return () => clearTimeout(timer);
    }
  }, [lastBackupDate, allWeeksData, allDaysData]);

  
  // Check if new user needs onboarding (no data and not completed)
  useEffect(() => {
    const hasAnyData = Object.keys(allWeeksData).length > 0 || 
                       Object.keys(allDaysData).length > 0 || 
                       Object.keys(allPeriodsData).length > 0;
    
    // Show onboarding for new users who haven't completed it
    if (!hasAnyData && !onboardingComplete && session) {
      // Small delay to let the app fully load
      const timer = setTimeout(() => setShowOnboarding(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [allWeeksData, allDaysData, allPeriodsData, onboardingComplete, session]);
  
  // 4. Browser Notifications
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  
  // 5. Forecasting
  const [showForecast, setShowForecast] = useState(false);
  
  // 7. Break-Even Calculator
  const [showBreakEven, setShowBreakEven] = useState(false);
  const [breakEvenInputs, setBreakEvenInputs] = useState({ adSpend: '', cogs: '', price: '', conversionRate: 2 });
  
  // 8. Notes/Journal
  const [weekNotes, setWeekNotes] = useState(() => {
    try { return safeLocalStorageGet(NOTES_KEY, {}); } catch (e) { devWarn("[init]", e?.message); return {}; }
  });
  const [editingNote, setEditingNote] = useState(null); // week key being edited
  const [noteText, setNoteText] = useState('');
  
  // 9. Theme Customization
  const [theme, setTheme] = useState(() => {
    try { return safeLocalStorageGet(THEME_KEY, { mode: 'dark', accent: 'violet' }); } catch (e) { devWarn("[init]", e?.message); return { mode: 'dark', accent: 'violet' }; }
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
  const [adsTimeTab, setAdsTimeTab] = useState('monthly'); // 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  const [adsYear, setAdsYear] = useState(new Date().getFullYear()); // Selected year
  const [adsMonth, setAdsMonth] = useState(new Date().getMonth()); // Selected month (0-11)
  const [adsQuarter, setAdsQuarter] = useState(Math.floor(new Date().getMonth() / 3) + 1); // 1-4
  const [adsSelectedWeek, setAdsSelectedWeek] = useState(null); // Selected week ending date for weekly comparison
  const [adsSelectedDay, setAdsSelectedDay] = useState(null); // Selected day for daily view
  const [adsViewMode, setAdsViewMode] = useState('overview'); // 'overview' | 'upload' | 'analysis' | 'reports'
  
  // Forecast view state
  const [forecastSort, setForecastSort] = useState({ field: 'totalSales', dir: 'desc' });
  const [forecastFilter, setForecastFilter] = useState('');
  const [forecastPeriodView, setForecastPeriodView] = useState('monthly'); // 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  const [forecastTab, setForecastTab] = useState('sales'); // sales, amazon, shopify, inventory, comparison, settings
  const [forecastPeriod, setForecastPeriod] = useState('week'); // tomorrow, week, month, quarter
  
  // 3. Mobile view detection
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Upcoming Invoices/Bills
  const [invoices, setInvoices] = useState(() => {
    try { return safeLocalStorageGet(INVOICES_KEY, []); } catch (e) { devWarn("[init]", e?.message); return []; }
  });
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [invoiceForm, setInvoiceForm] = useState({ vendor: '', description: '', amount: '', dueDate: '', recurring: false, frequency: 'monthly', category: 'operations' });
  const [processingPdf, setProcessingPdf] = useState(false);
  
  // Data Validation
  const [dataValidationWarnings, setDataValidationWarnings] = useState([]);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [pendingProcessAction, setPendingProcessAction] = useState(null);
  
  // Confirmation dialog for destructive actions
  const [confirmDialog, setConfirmDialog] = useState({ show: false, title: '', message: '', onConfirm: null, destructive: false, confirmText: null });
  
  const showConfirm = useCallback((title, message, onConfirm, destructive = true, confirmText = null) => {
    setConfirmDialog({ show: true, title, message, onConfirm, destructive, confirmText });
  }, []);
  
  // Success animation state
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const triggerSuccessAnimation = useCallback(() => {
    setShowSuccessAnimation(true);
    setTimeout(() => setShowSuccessAnimation(false), 1500);
  }, []);
  
  const ConfirmDialog = () => {
    if (!confirmDialog.show) return null;
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => setConfirmDialog(d => ({ ...d, show: false }))}>
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-slate-700 p-6 max-w-md w-full shadow-2xl transform transition-all" onClick={e => e.stopPropagation()}>
          <div className="flex items-start gap-4 mb-5">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${confirmDialog.destructive ? 'bg-rose-500/20 ring-2 ring-rose-500/30' : 'bg-amber-500/20 ring-2 ring-amber-500/30'}`}>
              <AlertTriangle className={`w-6 h-6 ${confirmDialog.destructive ? 'text-rose-400' : 'text-amber-400'}`} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">{confirmDialog.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{confirmDialog.message}</p>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button 
              onClick={() => setConfirmDialog(d => ({ ...d, show: false }))}
              className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition-all hover:scale-[1.02]"
            >
              Cancel
            </button>
            <button 
              onClick={() => { confirmDialog.onConfirm?.(); setConfirmDialog(d => ({ ...d, show: false })); }}
              className={`px-5 py-2.5 rounded-xl font-medium transition-all hover:scale-[1.02] flex items-center gap-2 ${
                confirmDialog.destructive 
                  ? 'bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white shadow-lg shadow-rose-500/20' 
                  : 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg shadow-amber-500/20'
              }`}
            >
              {confirmDialog.destructive && <Trash2 className="w-4 h-4" />}
              {confirmDialog.confirmText || (confirmDialog.destructive ? 'Delete' : 'Confirm')}
            </button>
          </div>
        </div>
      </div>
    );
  };
  
  // ========== ONBOARDING WIZARD ==========
  const OnboardingWizard = () => {
    if (!showOnboarding) return null;
    
    const steps = [
      { id: 'welcome', title: 'Welcome!', icon: Sparkles },
      { id: 'store', title: 'Your Store', icon: Store },
      { id: 'data', title: 'Upload Data', icon: Upload },
      { id: 'cogs', title: 'Product Costs', icon: DollarSign },
      { id: 'goals', title: 'Set Goals', icon: Target },
      { id: 'complete', title: 'All Set!', icon: Check },
    ];
    
    const currentStep = steps[onboardingStep];
    const progress = ((onboardingStep + 1) / steps.length) * 100;
    
    const nextStep = () => {
      if (onboardingStep < steps.length - 1) {
        setOnboardingStep(s => s + 1);
      } else {
        // Complete onboarding
        setOnboardingComplete(true);
        setShowOnboarding(false);
        setOnboardingStep(0);
        setToast({ message: '🎉 Setup complete! Welcome to your dashboard.', type: 'success' });
      }
    };
    
    const prevStep = () => {
      if (onboardingStep > 0) setOnboardingStep(s => s - 1);
    };
    
    const skipOnboarding = () => {
      setOnboardingComplete(true);
      setShowOnboarding(false);
      setOnboardingStep(0);
    };
    
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl border border-slate-700 w-full max-w-2xl shadow-2xl overflow-hidden">
          {/* Progress bar */}
          <div className="h-1 bg-slate-700">
            <div 
              className="h-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          
          {/* Step indicators */}
          <div className="flex justify-center gap-2 pt-6 pb-2">
            {steps.map((step, i) => (
              <div 
                key={step.id}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === onboardingStep ? 'w-8 bg-violet-500' : 
                  i < onboardingStep ? 'bg-violet-500' : 'bg-slate-600'
                }`}
              />
            ))}
          </div>
          
          {/* Content */}
          <div className="p-8">
            {/* Welcome Step */}
            {currentStep.id === 'welcome' && (
              <div className="text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-violet-500/30">
                  <Sparkles className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-3">Welcome to Your Dashboard!</h2>
                <p className="text-slate-400 text-lg mb-6 max-w-md mx-auto">
                  Let's get you set up in just a few minutes. We'll help you configure your store for accurate tracking.
                </p>
                <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto mt-8">
                  <div className="bg-slate-800/50 rounded-xl p-4 text-center">
                    <TrendingUp className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-300">Track Sales</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-xl p-4 text-center">
                    <PieChart className="w-6 h-6 text-violet-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-300">See Profits</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-xl p-4 text-center">
                    <Package className="w-6 h-6 text-amber-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-300">Manage Inventory</p>
                  </div>
                </div>
              </div>
            )}
            
            {/* Store Setup Step */}
            {currentStep.id === 'store' && (
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Store className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Name Your Store</h2>
                <p className="text-slate-400 mb-6">This will appear on your dashboard and reports.</p>
                
                <div className="max-w-sm mx-auto space-y-4">
                  <input
                    type="text"
                    placeholder="e.g., My Brand Store"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 text-center text-lg"
                  />
                  <p className="text-slate-500 text-sm">You can change this anytime in Settings</p>
                </div>
              </div>
            )}
            
            {/* Data Upload Step */}
            {currentStep.id === 'data' && (
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Upload className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Upload Your First Data</h2>
                <p className="text-slate-400 mb-6">You can upload Amazon or Shopify reports to get started.</p>
                
                <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                  <button
                    onClick={() => { setShowOnboarding(false); setView('upload'); setUploadTab('amazon-bulk'); }}
                    className="bg-gradient-to-br from-orange-500/20 to-orange-600/20 border border-orange-500/30 rounded-xl p-4 hover:border-orange-500/60 transition-all group"
                  >
                    <ShoppingCart className="w-8 h-8 text-orange-400 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                    <p className="text-white font-medium">Amazon</p>
                    <p className="text-orange-400 text-xs mt-1">SKU Economics, Payments</p>
                  </button>
                  <button
                    onClick={() => { setShowOnboarding(false); setView('upload'); setUploadTab('shopify-sync'); }}
                    className="bg-gradient-to-br from-green-500/20 to-green-600/20 border border-green-500/30 rounded-xl p-4 hover:border-green-500/60 transition-all group"
                  >
                    <Store className="w-8 h-8 text-green-400 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                    <p className="text-white font-medium">Shopify</p>
                    <p className="text-green-400 text-xs mt-1">API Sync or CSV</p>
                  </button>
                </div>
                
                <p className="text-slate-500 text-sm mt-6">
                  You can skip this for now and upload data later
                </p>
              </div>
            )}
            
            {/* COGS Setup Step */}
            {currentStep.id === 'cogs' && (
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <DollarSign className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Set Up Product Costs</h2>
                <p className="text-slate-400 mb-6">COGS (Cost of Goods Sold) helps calculate your true profit margins.</p>
                
                <div className="bg-slate-800/50 rounded-xl p-4 max-w-md mx-auto mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-slate-300">COGS Status</span>
                    {Object.keys(savedCogs).filter(k => savedCogs[k]?.cost > 0).length > 0 ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <Check className="w-4 h-4" />
                        {Object.keys(savedCogs).filter(k => savedCogs[k]?.cost > 0).length} SKUs configured
                      </span>
                    ) : (
                      <span className="text-amber-400">Not configured</span>
                    )}
                  </div>
                  <button
                    onClick={() => { setShowOnboarding(false); setShowCogsManager(true); }}
                    className="w-full py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-white font-medium transition-colors"
                  >
                    Open COGS Manager
                  </button>
                </div>
                
                <p className="text-slate-500 text-sm">
                  You can upload a CSV with SKU costs or enter them manually
                </p>
              </div>
            )}
            
            {/* Goals Step */}
            {currentStep.id === 'goals' && (
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Target className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Set Your Goals</h2>
                <p className="text-slate-400 mb-6">Track progress towards your revenue and profit targets.</p>
                
                <div className="max-w-sm mx-auto space-y-4">
                  <div>
                    <label className="block text-slate-400 text-sm mb-1 text-left">Weekly Revenue Goal</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                      <input
                        type="number"
                        placeholder="10000"
                        value={goals.weeklyRevenue || ''}
                        onChange={(e) => setGoals(g => ({ ...g, weeklyRevenue: parseFloat(e.target.value) || 0 }))}
                        className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-8 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-400 text-sm mb-1 text-left">Monthly Revenue Goal</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                      <input
                        type="number"
                        placeholder="40000"
                        value={goals.monthlyRevenue || ''}
                        onChange={(e) => setGoals(g => ({ ...g, monthlyRevenue: parseFloat(e.target.value) || 0 }))}
                        className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-8 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Complete Step */}
            {currentStep.id === 'complete' && (
              <div className="text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-green-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/30">
                  <Check className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-3">You're All Set!</h2>
                <p className="text-slate-400 text-lg mb-6 max-w-md mx-auto">
                  Your dashboard is ready. Start exploring your data and tracking your business performance.
                </p>
                
                <div className="bg-slate-800/50 rounded-xl p-4 max-w-md mx-auto">
                  <p className="text-slate-300 text-sm mb-3">Quick tips:</p>
                  <ul className="text-left text-sm text-slate-400 space-y-2">
                    <li className="flex items-start gap-2">
                      <Keyboard className="w-4 h-4 text-violet-400 mt-0.5" />
                      Press <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-xs">Shift + ?</kbd> to see keyboard shortcuts
                    </li>
                    <li className="flex items-start gap-2">
                      <MessageSquare className="w-4 h-4 text-violet-400 mt-0.5" />
                      Click the AI button to ask questions about your data
                    </li>
                    <li className="flex items-start gap-2">
                      <Settings className="w-4 h-4 text-violet-400 mt-0.5" />
                      Customize thresholds and alerts in Settings
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </div>
          
          {/* Footer */}
          <div className="px-8 pb-8 flex items-center justify-between">
            <button
              onClick={skipOnboarding}
              className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
            >
              Skip setup
            </button>
            
            <div className="flex items-center gap-3">
              {onboardingStep > 0 && (
                <button
                  onClick={prevStep}
                  className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition-colors flex items-center gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
              )}
              <button
                onClick={nextStep}
                className="px-6 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl font-medium shadow-lg shadow-violet-500/25 transition-all hover:scale-[1.02] flex items-center gap-2"
              >
                {onboardingStep === steps.length - 1 ? 'Get Started' : 'Continue'}
                {onboardingStep < steps.length - 1 && <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  // ========== PDF REPORT EXPORT MODAL ==========
  const PdfExportModal = () => {
    if (!showPdfExport) return null;
    
    const generatePdf = async () => {
      setPdfGenerating(true);
      
      try {
        // Calculate metrics for the report
        const sortedWeeks = Object.keys(allWeeksData).sort().reverse();
        const sortedDays = Object.keys(allDaysData).sort().reverse();
        
        // Get date range based on config
        let reportWeeks = [];
        let reportTitle = '';
        
        if (pdfExportConfig.reportType === 'weekly') {
          reportWeeks = sortedWeeks.slice(0, 1);
          reportTitle = `Weekly Report - ${reportWeeks[0] || 'No Data'}`;
        } else if (pdfExportConfig.reportType === 'monthly') {
          reportWeeks = sortedWeeks.slice(0, 4);
          reportTitle = `Monthly Report - ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
        } else {
          // Custom date range - filter weeks
          reportWeeks = sortedWeeks.filter(w => {
            if (!pdfExportConfig.dateRange.start || !pdfExportConfig.dateRange.end) return true;
            return w >= pdfExportConfig.dateRange.start && w <= pdfExportConfig.dateRange.end;
          });
          reportTitle = `Custom Report - ${pdfExportConfig.dateRange.start} to ${pdfExportConfig.dateRange.end}`;
        }
        
        // Aggregate metrics
        let totalRevenue = 0, totalProfit = 0, totalOrders = 0, totalUnits = 0, totalAdSpend = 0;
        reportWeeks.forEach(week => {
          const data = allWeeksData[week];
          if (data?.total) {
            totalRevenue += data.total.revenue || 0;
            totalProfit += data.total.profit || 0;
            totalOrders += data.total.orders || 0;
            totalUnits += data.total.units || 0;
            totalAdSpend += data.total.adSpend || 0;
          }
        });
        
        const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
        const tacos = totalRevenue > 0 ? (totalAdSpend / totalRevenue) * 100 : 0;
        const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;
        
        // Create HTML for PDF
        const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 40px; }
    .header { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #334155; }
    .logo { font-size: 14px; color: #8b5cf6; margin-bottom: 8px; }
    h1 { font-size: 28px; color: #ffffff; margin-bottom: 8px; }
    .date { color: #64748b; font-size: 14px; }
    .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 40px; }
    .metric { background: #1e293b; border-radius: 12px; padding: 20px; text-align: center; }
    .metric-value { font-size: 28px; font-weight: bold; color: #ffffff; }
    .metric-label { font-size: 12px; color: #94a3b8; margin-top: 4px; text-transform: uppercase; }
    .metric.positive .metric-value { color: #4ade80; }
    .metric.negative .metric-value { color: #f87171; }
    .section { margin-bottom: 30px; }
    .section-title { font-size: 18px; font-weight: 600; color: #ffffff; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #334155; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #334155; }
    th { color: #94a3b8; font-size: 12px; text-transform: uppercase; font-weight: 500; }
    td { color: #e2e8f0; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #334155; text-align: center; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    ${pdfExportConfig.branding.showStoreName && storeName ? `<div class="logo">${storeName.toUpperCase()}</div>` : ''}
    <h1>${reportTitle}</h1>
    <div class="date">Generated ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
  </div>
  
  ${pdfExportConfig.includeSections.summary ? `
  <div class="metrics">
    <div class="metric">
      <div class="metric-value">$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
      <div class="metric-label">Total Revenue</div>
    </div>
    <div class="metric ${totalProfit >= 0 ? 'positive' : 'negative'}">
      <div class="metric-value">$${Math.abs(totalProfit).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
      <div class="metric-label">Net Profit</div>
    </div>
    <div class="metric ${margin >= 20 ? 'positive' : margin >= 10 ? '' : 'negative'}">
      <div class="metric-value">${margin.toFixed(1)}%</div>
      <div class="metric-label">Profit Margin</div>
    </div>
    <div class="metric">
      <div class="metric-value">${totalOrders.toLocaleString()}</div>
      <div class="metric-label">Total Orders</div>
    </div>
    <div class="metric">
      <div class="metric-value">$${aov.toFixed(2)}</div>
      <div class="metric-label">Avg Order Value</div>
    </div>
    <div class="metric ${tacos <= 20 ? 'positive' : tacos <= 30 ? '' : 'negative'}">
      <div class="metric-value">${tacos.toFixed(1)}%</div>
      <div class="metric-label">TACOS</div>
    </div>
  </div>
  ` : ''}
  
  ${pdfExportConfig.includeSections.revenue && reportWeeks.length > 0 ? `
  <div class="section">
    <div class="section-title">Weekly Breakdown</div>
    <table>
      <thead>
        <tr>
          <th>Week</th>
          <th>Revenue</th>
          <th>Profit</th>
          <th>Orders</th>
          <th>Margin</th>
        </tr>
      </thead>
      <tbody>
        ${reportWeeks.slice(0, 8).map(week => {
          const data = allWeeksData[week];
          const rev = data?.total?.revenue || 0;
          const prof = data?.total?.profit || 0;
          const ord = data?.total?.orders || 0;
          const m = rev > 0 ? (prof / rev) * 100 : 0;
          return `
            <tr>
              <td>${week}</td>
              <td>$${rev.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              <td style="color: ${prof >= 0 ? '#4ade80' : '#f87171'}">$${prof.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              <td>${ord}</td>
              <td>${m.toFixed(1)}%</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}
  
  <div class="footer">
    <p>Generated by E-Commerce Dashboard • ecommdashboard.com</p>
  </div>
</body>
</html>
        `;
        
        // Create blob and download
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${storeName || 'Dashboard'}_Report_${new Date().toISOString().split('T')[0]}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        setToast({ message: 'Report exported! Open in browser and print to PDF.', type: 'success' });
        setShowPdfExport(false);
      } catch (err) {
        setToast({ message: 'Error generating report: ' + err.message, type: 'error' });
      } finally {
        setPdfGenerating(false);
      }
    };
    
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => setShowPdfExport(false)}>
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-slate-700 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="p-6 border-b border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-violet-500/20 rounded-xl flex items-center justify-center">
                <FileText className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Export Report</h3>
                <p className="text-slate-400 text-sm">Generate a professional PDF report</p>
              </div>
            </div>
          </div>
          
          <div className="p-6 space-y-4">
            {/* Report Type */}
            <div>
              <label className="block text-sm text-slate-300 mb-2">Report Type</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'weekly', label: 'Weekly' },
                  { id: 'monthly', label: 'Monthly' },
                  { id: 'custom', label: 'Custom' },
                ].map(type => (
                  <button
                    key={type.id}
                    onClick={() => setPdfExportConfig(c => ({ ...c, reportType: type.id }))}
                    className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      pdfExportConfig.reportType === type.id
                        ? 'bg-violet-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Custom Date Range */}
            {pdfExportConfig.reportType === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={pdfExportConfig.dateRange.start}
                    onChange={(e) => setPdfExportConfig(c => ({ ...c, dateRange: { ...c.dateRange, start: e.target.value } }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">End Date</label>
                  <input
                    type="date"
                    value={pdfExportConfig.dateRange.end}
                    onChange={(e) => setPdfExportConfig(c => ({ ...c, dateRange: { ...c.dateRange, end: e.target.value } }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                  />
                </div>
              </div>
            )}
            
            {/* Sections to Include */}
            <div>
              <label className="block text-sm text-slate-300 mb-2">Include Sections</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'summary', label: 'Summary Metrics' },
                  { id: 'revenue', label: 'Revenue Breakdown' },
                  { id: 'profitability', label: 'Profitability' },
                  { id: 'skuBreakdown', label: 'SKU Analysis' },
                  { id: 'inventory', label: 'Inventory Status' },
                  { id: 'ads', label: 'Ad Performance' },
                ].map(section => (
                  <label key={section.id} className="flex items-center gap-2 p-2 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700">
                    <input
                      type="checkbox"
                      checked={pdfExportConfig.includeSections[section.id]}
                      onChange={(e) => setPdfExportConfig(c => ({ 
                        ...c, 
                        includeSections: { ...c.includeSections, [section.id]: e.target.checked }
                      }))}
                      className="w-4 h-4 rounded border-slate-500 text-violet-600 focus:ring-violet-500"
                    />
                    <span className="text-sm text-slate-300">{section.label}</span>
                  </label>
                ))}
              </div>
            </div>
            
            {/* Branding */}
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pdfExportConfig.branding.showStoreName}
                  onChange={(e) => setPdfExportConfig(c => ({ 
                    ...c, 
                    branding: { ...c.branding, showStoreName: e.target.checked }
                  }))}
                  className="w-4 h-4 rounded border-slate-500 text-violet-600 focus:ring-violet-500"
                />
                <span className="text-sm text-slate-300">Include store name</span>
              </label>
            </div>
          </div>
          
          <div className="p-6 border-t border-slate-700 flex gap-3">
            <button
              onClick={() => setShowPdfExport(false)}
              className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={generatePdf}
              disabled={pdfGenerating}
              className="flex-1 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {pdfGenerating ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Generating...</>
              ) : (
                <><Download className="w-4 h-4" />Export Report</>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };
  
  // ========== INDUSTRY BENCHMARKS MODAL ==========
  // Amazon Forecasts (from Amazon's SKU Economics forecast reports)
  const [amazonForecasts, setAmazonForecasts] = useState(() => {
    try { return safeLocalStorageGet(AMAZON_FORECAST_KEY, {}); } catch (e) { devWarn("[init]", e?.message); return {}; }
  });
  
  // Forecast upload tracking - tracks when each type was last uploaded
  const [forecastMeta, setForecastMeta] = useState(() => {
    const defaultMeta = { lastUploads: { '7day': null, '30day': null, '60day': null }, history: [] };
    return safeLocalStorageGet('ecommerce_forecast_meta', defaultMeta);
  });
  
  // Save forecast meta to localStorage
  useEffect(() => {
    safeLocalStorageSet('ecommerce_forecast_meta', JSON.stringify(forecastMeta));
  }, [forecastMeta]);
  
  // ============ SELF-LEARNING FORECAST SYSTEM ============
  // Forecast accuracy history - persists learning over time
  const [forecastAccuracyHistory, setForecastAccuracyHistory] = useState(() => {
    const defaultHistory = { records: [], lastUpdated: null, modelVersion: 1 };
    return safeLocalStorageGet(FORECAST_ACCURACY_KEY, defaultHistory);
  });

  // Learned correction factors per SKU and overall
  const [forecastCorrections, setForecastCorrections] = useState(() => {
    const defaultCorrections = { 
      overall: { revenue: 1.0, units: 1.0, profit: 1.0 },
      bySku: {},
      byMonth: {},
      byQuarter: {},
      confidence: 0,
      samplesUsed: 0,
      lastUpdated: null
    };
    return safeLocalStorageGet(FORECAST_CORRECTIONS_KEY, defaultCorrections);
  });

  // AI insights state
  const [aiInsights, setAiInsights] = useState(null);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);

  // AI-powered forecasting state
  const [aiForecasts, setAiForecasts] = useState(() => {
    try { return safeLocalStorageGet('ecommerce_ai_forecasts_v1', null); }
    catch (e) { devWarn("[init]", e?.message); return null; }
  });
  const [aiForecastLoading, setAiForecastLoading] = useState(false);

  // Save AI forecasts to localStorage
  useEffect(() => {
    if (aiForecasts) {
      safeLocalStorageSet('ecommerce_ai_forecasts_v1', JSON.stringify(aiForecasts));
    }
  }, [aiForecasts]);

  // Save forecast accuracy history to localStorage
  useEffect(() => {
    safeLocalStorageSet(FORECAST_ACCURACY_KEY, JSON.stringify(forecastAccuracyHistory));
  }, [forecastAccuracyHistory]);

  // Save forecast corrections to localStorage
  useEffect(() => {
    safeLocalStorageSet(FORECAST_CORRECTIONS_KEY, JSON.stringify(forecastCorrections));
  }, [forecastCorrections]);
  // ============ END SELF-LEARNING FORECAST SYSTEM STATE ============
  
  // Calculate forecast alerts
  const forecastAlerts = useMemo(() => {
    const alerts = [];
    const now = new Date();
    
    const checkForecastAge = (type, days, label) => {
      const lastUpload = forecastMeta.lastUploads?.[type];
      if (!lastUpload) {
        alerts.push({ type, severity: 'warning', message: `No ${label} Amazon forecast uploaded yet`, action: 'upload' });
      } else {
        const uploadDate = new Date(lastUpload);
        const daysSince = Math.floor((now - uploadDate) / (1000 * 60 * 60 * 24));
        if (daysSince >= days) {
          alerts.push({ type, severity: 'warning', message: `${label} forecast is ${daysSince} days old (refresh every ${days} days)`, action: 'refresh' });
        } else {
          const daysUntil = days - daysSince;
          if (daysUntil <= 2) {
            alerts.push({ type, severity: 'info', message: `${label} forecast due for refresh in ${daysUntil} day(s)`, action: 'upcoming' });
          }
        }
      }
    };
    
    checkForecastAge('7day', 7, '7-day');
    checkForecastAge('30day', 30, '30-day');
    checkForecastAge('60day', 60, '60-day');
    
    // Check Amazon Campaign data freshness (weekly upload reminder)
    if (amazonCampaigns.lastUpdated) {
      const lastUpdate = new Date(amazonCampaigns.lastUpdated);
      const daysSince = Math.floor((now - lastUpdate) / (1000 * 60 * 60 * 24));
      if (daysSince >= 7) {
        alerts.push({ type: 'amazonCampaigns', severity: 'warning', message: `Amazon Campaign data is ${daysSince} days old (upload weekly)`, action: 'refresh' });
      } else if (daysSince >= 5) {
        alerts.push({ type: 'amazonCampaigns', severity: 'info', message: `Amazon Campaign refresh due in ${7 - daysSince} day(s)`, action: 'upcoming' });
      }
    } else {
      alerts.push({ type: 'amazonCampaigns', severity: 'info', message: 'Upload Amazon Campaign data for PPC analysis', action: 'upload' });
    }
    
    return alerts;
  }, [forecastMeta, amazonCampaigns.lastUpdated]);
  
  // ============ COMPREHENSIVE DATA STATUS DASHBOARD ============
  // Shows all uploaded data, what's feeding into predictions, and what's needed
  const dataStatus = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    // === FORECAST STATUS ===
    const forecastStatus = {
      '7day': {
        type: '7-day',
        lastUpload: forecastMeta.lastUploads?.['7day'],
        refreshDays: 7,
        daysUntilExpiry: null,
        status: 'missing',
        weeksCovered: [],
      },
      '30day': {
        type: '30-day', 
        lastUpload: forecastMeta.lastUploads?.['30day'],
        refreshDays: 30,
        daysUntilExpiry: null,
        status: 'missing',
        weeksCovered: [],
      },
      '60day': {
        type: '60-day',
        lastUpload: forecastMeta.lastUploads?.['60day'],
        refreshDays: 60,
        daysUntilExpiry: null,
        status: 'missing',
        weeksCovered: [],
      },
    };
    
    // Calculate expiry status for each forecast
    Object.keys(forecastStatus).forEach(key => {
      const f = forecastStatus[key];
      if (f.lastUpload) {
        const uploadDate = new Date(f.lastUpload);
        const daysSince = Math.floor((now - uploadDate) / (1000 * 60 * 60 * 24));
        f.daysUntilExpiry = f.refreshDays - daysSince;
        f.daysSinceUpload = daysSince;
        
        if (f.daysUntilExpiry <= 0) {
          f.status = 'expired';
        } else if (f.daysUntilExpiry <= 2) {
          f.status = 'expiring';
        } else {
          f.status = 'active';
        }
      }
    });
    
    // Get weeks covered by Amazon forecasts
    const forecastWeeks = Object.keys(amazonForecasts).sort();
    
    // === DAILY DATA STATUS ===
    const dailyDates = Object.keys(allDaysData).filter(d => hasDailySalesData(allDaysData[d])).sort();
    const last14Days = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = formatDateKey(d);
      last14Days.push({
        date: dateStr,
        hasData: hasDailySalesData(allDaysData[dateStr]),
        hasAdsOnly: !!allDaysData[dateStr] && !hasDailySalesData(allDaysData[dateStr]),
        data: allDaysData[dateStr] || null,
        dayOfWeek: d.toLocaleDateString('en-US', { weekday: 'short' }),
      });
    }
    last14Days.reverse(); // Oldest first
    
    // Calculate consecutive day streak (from today backwards)
    let streak = 0;
    for (let i = 1; i <= 30; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = formatDateKey(d);
      if (hasDailySalesData(allDaysData[dateStr])) {
        streak++;
      } else {
        break;
      }
    }
    
    // === WEEKLY DATA STATUS ===
    const weeklyDates = Object.keys(allWeeksData).sort();
    const recentWeeks = weeklyDates.slice(-8).map(w => ({
      weekEnding: w,
      data: allWeeksData[w],
      hasForecast: !!amazonForecasts[w],
      hasComparison: false, // Will be calculated later
    }));
    
    // === LEARNING DATA STATUS ===
    // Calculate comparisons inline to avoid circular dependency
    const matchedWeeks = new Set();
    Object.keys(amazonForecasts).forEach(forecastWeek => {
      if (allWeeksData[forecastWeek]) {
        matchedWeeks.add(forecastWeek);
      }
    });
    
    const pendingForecastWeeks = Object.keys(amazonForecasts).filter(w => {
      const weekDate = new Date(w + 'T00:00:00');
      return weekDate < now && !matchedWeeks.has(w);
    });
    
    // === DATA FLOW ANALYSIS ===
    const dataFlow = {
      // Forecasts → Learning: How many forecasts have matching actuals?
      forecastsWithActuals: matchedWeeks.size,
      forecastsAwaitingActuals: pendingForecastWeeks.length,
      
      // Daily → Weekly: How many days can be aggregated?
      dailyDaysAvailable: dailyDates.length,
      weeksFromDaily: new Set(dailyDates.map(d => {
        const date = new Date(d + 'T12:00:00');
        const dayOfWeek = date.getDay();
        const weekEnd = new Date(date);
        // Move to Sunday (week ending day): if already Sunday add 0, else add days to reach Sunday
        weekEnd.setDate(date.getDate() + (dayOfWeek === 0 ? 0 : 7 - dayOfWeek));
        return formatDateKey(weekEnd);
      })).size,
      
      // Weekly → Inventory: How many weeks feed velocity?
      weeksForVelocity: Math.min(4, weeklyDates.length),
      
      // Learning → Predictions: Is learning active?
      learningActive: forecastCorrections.confidence >= 30,
      learningConfidence: forecastCorrections.confidence,
      learningSamples: forecastCorrections.samplesUsed,
    };
    
    // === NEXT ACTIONS ===
    const nextActions = [];
    
    // Check forecast status
    Object.entries(forecastStatus).forEach(([key, f]) => {
      if (f.status === 'expired') {
        nextActions.push({
          priority: 'high',
          type: 'forecast',
          message: `${f.type} forecast expired! Upload new forecast now.`,
          action: 'upload-forecast',
        });
      } else if (f.status === 'expiring') {
        nextActions.push({
          priority: 'medium',
          type: 'forecast',
          message: `${f.type} forecast expires in ${f.daysUntilExpiry} day(s)`,
          action: 'upload-forecast',
        });
      } else if (f.status === 'missing') {
        nextActions.push({
          priority: 'low',
          type: 'forecast',
          message: `No ${f.type} forecast uploaded yet`,
          action: 'upload-forecast',
        });
      }
    });
    
    // Check for pending actuals (forecasts awaiting actual data)
    if (pendingForecastWeeks.length > 0) {
      const oldestPending = pendingForecastWeeks.sort()[0];
      nextActions.push({
        priority: 'high',
        type: 'actuals',
        message: `${pendingForecastWeeks.length} week(s) have forecasts but no actuals (oldest: ${oldestPending})`,
        action: 'upload-weekly',
      });
    }
    
    // Check daily data freshness
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = formatDateKey(yesterday);
    if (!hasDailySalesData(allDaysData[yesterdayStr])) {
      nextActions.push({
        priority: 'medium',
        type: 'daily',
        message: `Yesterday's data (${yesterday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}) not uploaded`,
        action: 'upload-daily',
      });
    }
    
    // Check if daily data can be aggregated
    const dailyNotInWeekly = dailyDates.filter(d => {
      const date = new Date(d + 'T12:00:00');
      const dayOfWeek = date.getDay();
      const weekEnd = new Date(date);
      // Move to Sunday (week ending day)
      weekEnd.setDate(date.getDate() + (dayOfWeek === 0 ? 0 : 7 - dayOfWeek));
      const weekKey = formatDateKey(weekEnd);
      return weekEnd <= now && (!allWeeksData[weekKey] || !allWeeksData[weekKey].aggregatedFrom);
    });
    
    // === AGGREGATION STATUS ===
    // Group daily data by week and check completeness
    const weekGroups = {};
    dailyDates.forEach(dayKey => {
      const date = new Date(dayKey + 'T12:00:00');
      const dayOfWeek = date.getDay();
      const weekEnd = new Date(date);
      weekEnd.setDate(date.getDate() + (dayOfWeek === 0 ? 0 : 7 - dayOfWeek));
      const weekKey = formatDateKey(weekEnd);
      
      if (!weekGroups[weekKey]) {
        weekGroups[weekKey] = { weekEnding: weekKey, days: [], missingDays: [] };
      }
      weekGroups[weekKey].days.push(dayKey);
    });
    
    // Calculate missing days for each week
    Object.values(weekGroups).forEach(week => {
      const weekEndDate = new Date(week.weekEnding + 'T12:00:00');
      for (let i = 6; i >= 0; i--) {
        const d = new Date(weekEndDate);
        d.setDate(weekEndDate.getDate() - i);
        const dayKey = formatDateKey(d);
        if (!week.days.includes(dayKey)) {
          week.missingDays.push({
            date: dayKey,
            dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
            display: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          });
        }
      }
      week.isComplete = week.missingDays.length === 0;
    });
    
    const completeWeeks = Object.values(weekGroups).filter(w => w.isComplete && !allWeeksData[w.weekEnding]);
    const incompleteWeeks = Object.values(weekGroups).filter(w => !w.isComplete);
    
    // Add aggregate action if there are complete weeks ready
    if (completeWeeks.length > 0) {
      const totalDaysInCompleteWeeks = completeWeeks.reduce((sum, w) => sum + w.days.length, 0);
      nextActions.push({
        priority: 'medium',
        type: 'aggregate',
        message: `${completeWeeks.length} complete week${completeWeeks.length !== 1 ? 's' : ''} ready to aggregate (${totalDaysInCompleteWeeks} days)`,
        action: 'aggregate-daily',
      });
    }
    
    const aggregationStatus = {
      completeWeeks: completeWeeks.length,
      incompleteWeeks: incompleteWeeks.length,
      weekDetails: Object.values(weekGroups).sort((a, b) => b.weekEnding.localeCompare(a.weekEnding)),
    };
    
    return {
      forecastStatus,
      forecastWeeks,
      aggregationStatus,
      dailyStatus: {
        totalDays: dailyDates.length,
        last14Days,
        streak,
        oldestDate: dailyDates[0] || null,
        newestDate: dailyDates[dailyDates.length - 1] || null,
      },
      weeklyStatus: {
        totalWeeks: weeklyDates.length,
        recentWeeks,
        oldestWeek: weeklyDates[0] || null,
        newestWeek: weeklyDates[weeklyDates.length - 1] || null,
      },
      learningStatus: {
        active: forecastCorrections.confidence >= 30,
        confidence: forecastCorrections.confidence,
        samples: forecastCorrections.samplesUsed,
        comparisons: matchedWeeks.size,
        pendingComparisons: pendingForecastWeeks.length,
        skusTracked: Object.keys(forecastCorrections.bySku).length,
        lastUpdated: forecastCorrections.lastUpdated,
      },
      dataFlow,
      nextActions: nextActions.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }),
    };
  }, [forecastMeta, amazonForecasts, allDaysData, allWeeksData, forecastCorrections]);
  // ============ END DATA STATUS DASHBOARD ============
  
  // ============ SKU RETURN RATE CALCULATION ============
  // Calculate return rates from weekly/daily data whenever it changes
  const calculateReturnRates = useCallback(() => {
    const bySku = {};
    const byWeek = {};
    const byMonth = {};
    let totalSold = 0;
    let totalReturned = 0;
    
    // Process weekly data for return rates
    const derivedWeeks = deriveWeeksFromDays(allDaysData || {});
const allWeekKeys = Array.from(new Set([
  ...Object.keys(allWeeksData || {}),
  ...Object.keys(derivedWeeks || {})
])).sort();

allWeekKeys.forEach((weekKey) => {
  const mergedWeek = mergeWeekData((allWeeksData || {})[weekKey], (derivedWeeks || {})[weekKey]);
  const amzData = mergedWeek?.amazon;
  if (!amzData) return;

  const weekSold = amzData.units || 0;
  let weekReturned = Math.abs(amzData.returns || 0);
  if (!weekReturned && Array.isArray(amzData.skuData)) {
    weekReturned = Math.abs(amzData.skuData.reduce((s, r) => s + (Number(r?.returns) || 0), 0));
  }
      if (weekSold > 0 || weekReturned > 0) {
        byWeek[weekKey] = {
          unitsSold: weekSold,
          unitsReturned: weekReturned,
          returnRate: weekSold > 0 ? (weekReturned / weekSold) * 100 : 0,
        };
        
        // Extract month from week ending date
        const monthKey = weekKey.slice(0, 7); // YYYY-MM
        if (!byMonth[monthKey]) {
          byMonth[monthKey] = { unitsSold: 0, unitsReturned: 0, returnRate: 0 };
        }
        byMonth[monthKey].unitsSold += weekSold;
        byMonth[monthKey].unitsReturned += weekReturned;
        
        totalSold += weekSold;
        totalReturned += weekReturned;
      }
      
      // Process SKU-level data from weekly skuData
      const skuData = amzData.skuData || {};
      Object.entries(skuData).forEach(([sku, data]) => {
        if (!sku || sku === 'undefined') return;
        
        const skuSold = data.units || 0;
        const skuReturned = Math.abs(data.returns || 0);
        
        if (!bySku[sku]) {
          bySku[sku] = { unitsSold: 0, unitsReturned: 0, returnRate: 0, history: [] };
        }
        bySku[sku].unitsSold += skuSold;
        bySku[sku].unitsReturned += skuReturned;
        
        // Track weekly history for this SKU
        if (skuSold > 0 || skuReturned > 0) {
          bySku[sku].history.push({
            week: weekKey,
            sold: skuSold,
            returned: skuReturned,
            rate: skuSold > 0 ? (skuReturned / skuSold) * 100 : 0,
          });
        }
      });
    });
    
    // Calculate final rates for each SKU
    Object.keys(bySku).forEach(sku => {
      const s = bySku[sku];
      s.returnRate = s.unitsSold > 0 ? (s.unitsReturned / s.unitsSold) * 100 : 0;
      // Keep only last 52 weeks of history
      s.history = s.history.slice(-52);
    });
    
    // Calculate final rates for each month
    Object.keys(byMonth).forEach(month => {
      const m = byMonth[month];
      m.returnRate = m.unitsSold > 0 ? (m.unitsReturned / m.unitsSold) * 100 : 0;
    });
    
    return {
      bySku,
      byWeek,
      byMonth,
      overall: {
        unitsSold: totalSold,
        unitsReturned: totalReturned,
        returnRate: totalSold > 0 ? (totalReturned / totalSold) * 100 : 0,
      },
      lastUpdated: new Date().toISOString(),
    };
  }, [allWeeksData]);
  
  // Auto-update return rates when weekly data changes
  useEffect(() => {
    const sortedWeeks = Object.keys(allWeeksData);
    if (sortedWeeks.length > 0) {
      const calculated = calculateReturnRates();
      // Only update if there's actual data
      if (calculated.overall.unitsSold > 0) {
        setReturnRates(calculated);
      }
    }
  }, [allWeeksData, calculateReturnRates]);
  // ============ END SKU RETURN RATE CALCULATION ============
  
  // Save Amazon forecasts to localStorage and cloud
  useEffect(() => {
    safeLocalStorageSet(AMAZON_FORECAST_KEY, JSON.stringify(amazonForecasts));
  }, [amazonForecasts]);
  
  // Save invoices to localStorage and cloud
  useEffect(() => {
    safeLocalStorageSet(INVOICES_KEY, JSON.stringify(invoices));
    // Sync to cloud when invoices change
    if (invoices.length > 0 || localStorage.getItem(INVOICES_KEY)) {
      queueCloudSave({ ...combinedData, invoices });
    }
  }, [invoices]);
  
  // Save notes to localStorage and cloud
  useEffect(() => {
    safeLocalStorageSet(NOTES_KEY, JSON.stringify(weekNotes));
  }, [weekNotes]);
  
  // Save goals to localStorage
  useEffect(() => {
    safeLocalStorageSet(GOALS_KEY, JSON.stringify(goals));
  }, [goals]);
  
  // Save product names to localStorage
  useEffect(() => {
    safeLocalStorageSet(PRODUCT_NAMES_KEY, JSON.stringify(savedProductNames));
  }, [savedProductNames]);
  
  // Save production pipeline to localStorage
  useEffect(() => {
    safeLocalStorageSet('ecommerce_production_v1', JSON.stringify(productionPipeline));
  }, [productionPipeline]);
  
  // Save widget config to localStorage (only if valid)
  useEffect(() => {
    if (widgetConfig && Array.isArray(widgetConfig.widgets) && widgetConfig.widgets.length > 0) {
      safeLocalStorageSet(WIDGET_KEY, JSON.stringify(widgetConfig));
    }
  }, [widgetConfig]);
  
  // Save theme to localStorage
  useEffect(() => {
    safeLocalStorageSet(THEME_KEY, JSON.stringify(theme));
  }, [theme]);
  
  // Save logo to localStorage
  useEffect(() => {
    if (storeLogo) {
      safeLocalStorageSet('ecommerce_store_logo', storeLogo);
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
  
  // Global Escape key handler - closes topmost modal
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key !== 'Escape') return;
      // Close in priority order (topmost first)
      if (showStoreSelector) { setShowStoreSelector(false); return; }
      if (showGoalsModal) { setShowGoalsModal(false); return; }
      if (showCogsManager) { setShowCogsManager(false); return; }
      if (showProductCatalog) { setShowProductCatalog(false); return; }
      if (showExportModal) { setShowExportModal(false); return; }
      if (showInvoiceModal) { setShowInvoiceModal(false); return; }
      if (showForecast) { setShowForecast(false); return; }
      if (showBreakEven) { setShowBreakEven(false); return; }
      if (showUploadHelp) { setShowUploadHelp(false); return; }
      if (showAdsIntelUpload) { setShowAdsIntelUpload(false); return; }
      if (showDtcIntelUpload) { setShowDtcIntelUpload(false); return; }
      if (showTaxStateConfig) { setShowTaxStateConfig(false); return; }
      if (selectedTaxState) { setSelectedTaxState(null); return; }
      if (viewingDayDetails) { setViewingDayDetails(null); return; }
      if (navDropdown) { setNavDropdown(null); return; }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  });

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
    
    // Auto-sync settings
    autoSync: {
      enabled: true, // Master toggle
      intervalHours: 4, // How often to sync (when app is open)
      onAppLoad: true, // Sync on app load if stale
      staleThresholdHours: 4, // Consider data stale after this many hours
      amazon: true, // Include Amazon in auto-sync
      shopify: true, // Include Shopify in auto-sync
      packiyo: true, // Include Packiyo in auto-sync
      qbo: true, // Include QuickBooks in auto-sync
    },

    // AI model selection
    aiModel: AI_DEFAULT_MODEL,
  });
  
  // Sync AI model selection to window global so outer-scope callAI can read it
  useEffect(() => {
    if (appSettings.aiModel) window.__aiModelOverride = appSettings.aiModel;
  }, [appSettings.aiModel]);
  
  const clearPeriod3PLFiles = useCallback(() => {
    setPeriodFiles(p => ({ ...p, threepl: [] }));
    setPeriodFileNames(p => ({ ...p, threepl: [] }));
  }, []);

// US States with sales tax info - comprehensive list with economic nexus thresholds
const US_STATES_TAX_INFO = {
  AL: { name: 'Alabama', hasStateTax: true, stateRate: 0.04, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 250000, transactions: null }, marketplaceFacilitator: true, sst: true, note: 'Simplified Seller Use Tax (SSUT) program available' },
  AK: { name: 'Alaska', hasStateTax: false, stateRate: 0, filingTypes: ['local'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: false, note: 'No state tax, but must collect for ARSSTC member localities' },
  AZ: { name: 'Arizona', hasStateTax: true, stateRate: 0.056, filingTypes: ['state', 'county', 'city'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: false, note: 'TPT license required' },
  AR: { name: 'Arkansas', hasStateTax: true, stateRate: 0.065, shippingTaxable: true, filingTypes: ['state', 'local'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  CA: { name: 'California', hasStateTax: true, stateRate: 0.0725, filingTypes: ['state', 'district'], reportFormat: 'district', nexusThreshold: { sales: 500000, transactions: null }, marketplaceFacilitator: true, sst: false, note: 'Highest threshold - $500K sales required' },
  CO: { name: 'Colorado', hasStateTax: true, stateRate: 0.029, filingTypes: ['state', 'county', 'city', 'special'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: false, note: 'Home rule cities (Denver, Aurora, etc.) require separate registration' },
  CT: { name: 'Connecticut', hasStateTax: true, stateRate: 0.0635, shippingTaxable: true, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: false },
  DE: { name: 'Delaware', hasStateTax: false, stateRate: 0, filingTypes: [], reportFormat: 'none', nexusThreshold: null, marketplaceFacilitator: false, sst: false, note: 'No sales tax' },
  FL: { name: 'Florida', hasStateTax: true, stateRate: 0.06, filingTypes: ['state', 'county'], reportFormat: 'county', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: false },
  GA: { name: 'Georgia', hasStateTax: true, stateRate: 0.04, shippingTaxable: true, filingTypes: ['state', 'local'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  HI: { name: 'Hawaii', hasStateTax: true, stateRate: 0.04, shippingTaxable: true, filingTypes: ['state', 'county'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: false, note: 'GET (Gross Excise Tax) not traditional sales tax - applies to seller' },
  ID: { name: 'Idaho', hasStateTax: true, stateRate: 0.06, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: true },
  IL: { name: 'Illinois', hasStateTax: true, stateRate: 0.0625, shippingTaxable: true, filingTypes: ['state', 'local'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: false, note: 'ROT (Retailers Occupation Tax) - multiple local taxes' },
  IN: { name: 'Indiana', hasStateTax: true, stateRate: 0.07, shippingTaxable: true, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  IA: { name: 'Iowa', hasStateTax: true, stateRate: 0.06, filingTypes: ['state', 'local'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: true },
  KS: { name: 'Kansas', hasStateTax: true, stateRate: 0.065, shippingTaxable: true, filingTypes: ['state', 'county', 'city'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: true },
  KY: { name: 'Kentucky', hasStateTax: true, stateRate: 0.06, shippingTaxable: true, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  LA: { name: 'Louisiana', hasStateTax: true, stateRate: 0.0445, filingTypes: ['state', 'parish'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: false, note: 'Parish taxes filed through Louisiana Sales Tax Commission' },
  ME: { name: 'Maine', hasStateTax: true, stateRate: 0.055, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: false },
  MD: { name: 'Maryland', hasStateTax: true, stateRate: 0.06, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: false, note: 'Annual report & LLC fees required separately' },
  MA: { name: 'Massachusetts', hasStateTax: true, stateRate: 0.0625, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: false },
  MI: { name: 'Michigan', hasStateTax: true, stateRate: 0.06, shippingTaxable: true, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  MN: { name: 'Minnesota', hasStateTax: true, stateRate: 0.06875, shippingTaxable: true, filingTypes: ['state', 'local'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  MS: { name: 'Mississippi', hasStateTax: true, stateRate: 0.07, shippingTaxable: true, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 250000, transactions: null }, marketplaceFacilitator: true, sst: false },
  MO: { name: 'Missouri', hasStateTax: true, stateRate: 0.04225, filingTypes: ['state', 'local'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: false },
  MT: { name: 'Montana', hasStateTax: false, stateRate: 0, filingTypes: [], reportFormat: 'none', nexusThreshold: null, marketplaceFacilitator: false, sst: false, note: 'No sales tax' },
  NE: { name: 'Nebraska', hasStateTax: true, stateRate: 0.055, shippingTaxable: true, filingTypes: ['state', 'local'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  NV: { name: 'Nevada', hasStateTax: true, stateRate: 0.0685, filingTypes: ['state', 'county'], reportFormat: 'county', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  NH: { name: 'New Hampshire', hasStateTax: false, stateRate: 0, filingTypes: [], reportFormat: 'none', nexusThreshold: null, marketplaceFacilitator: false, sst: false, note: 'No sales tax' },
  NJ: { name: 'New Jersey', hasStateTax: true, stateRate: 0.06625, shippingTaxable: true, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  NM: { name: 'New Mexico', hasStateTax: true, stateRate: 0.05125, shippingTaxable: true, filingTypes: ['state', 'local'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: false, note: 'Gross Receipts Tax (GRT) - not traditional sales tax' },
  NY: { name: 'New York', hasStateTax: true, stateRate: 0.04, shippingTaxable: true, filingTypes: ['state', 'county', 'city'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 500000, transactions: 100 }, marketplaceFacilitator: true, sst: false, note: 'High threshold - $500K AND 100+ transactions required' },
  NC: { name: 'North Carolina', hasStateTax: true, stateRate: 0.0475, shippingTaxable: true, filingTypes: ['state', 'county'], reportFormat: 'county', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  ND: { name: 'North Dakota', hasStateTax: true, stateRate: 0.05, shippingTaxable: true, filingTypes: ['state', 'local'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: true },
  OH: { name: 'Ohio', hasStateTax: true, stateRate: 0.0575, shippingTaxable: true, filingTypes: ['state', 'county'], reportFormat: 'county', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  OK: { name: 'Oklahoma', hasStateTax: true, stateRate: 0.045, filingTypes: ['state', 'county', 'city'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: true },
  OR: { name: 'Oregon', hasStateTax: false, stateRate: 0, filingTypes: [], reportFormat: 'none', nexusThreshold: null, marketplaceFacilitator: false, sst: false, note: 'No sales tax' },
  PA: { name: 'Pennsylvania', hasStateTax: true, stateRate: 0.06, shippingTaxable: true, filingTypes: ['state', 'local'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: false, note: 'Philadelphia & Allegheny County have additional local taxes' },
  RI: { name: 'Rhode Island', hasStateTax: true, stateRate: 0.07, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  SC: { name: 'South Carolina', hasStateTax: true, stateRate: 0.06, shippingTaxable: true, filingTypes: ['state', 'local'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: true },
  SD: { name: 'South Dakota', hasStateTax: true, stateRate: 0.045, shippingTaxable: true, filingTypes: ['state', 'municipal'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true, note: 'Origin of Wayfair decision' },
  TN: { name: 'Tennessee', hasStateTax: true, stateRate: 0.07, shippingTaxable: true, filingTypes: ['state', 'local'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: true },
  TX: { name: 'Texas', hasStateTax: true, stateRate: 0.0625, shippingTaxable: true, filingTypes: ['state', 'local'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 500000, transactions: null }, marketplaceFacilitator: true, sst: false, note: 'High threshold - $500K sales required' },
  UT: { name: 'Utah', hasStateTax: true, stateRate: 0.0485, filingTypes: ['state', 'local'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  VT: { name: 'Vermont', hasStateTax: true, stateRate: 0.06, shippingTaxable: true, filingTypes: ['state', 'local'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  VA: { name: 'Virginia', hasStateTax: true, stateRate: 0.043, filingTypes: ['state', 'local'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: false },
  WA: { name: 'Washington', hasStateTax: true, stateRate: 0.065, shippingTaxable: true, filingTypes: ['state', 'local'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: true, note: 'B&O tax also applies to some sellers' },
  WV: { name: 'West Virginia', hasStateTax: true, stateRate: 0.06, shippingTaxable: true, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  WI: { name: 'Wisconsin', hasStateTax: true, stateRate: 0.05, shippingTaxable: true, filingTypes: ['state', 'county'], reportFormat: 'county', nexusThreshold: { sales: 100000, transactions: null }, marketplaceFacilitator: true, sst: true },
  WY: { name: 'Wyoming', hasStateTax: true, stateRate: 0.04, filingTypes: ['state', 'local'], reportFormat: 'jurisdiction', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: true },
  DC: { name: 'District of Columbia', hasStateTax: true, stateRate: 0.06, shippingTaxable: true, filingTypes: ['state'], reportFormat: 'standard', nexusThreshold: { sales: 100000, transactions: 200 }, marketplaceFacilitator: true, sst: false },
};

// State-specific filing formats - defines exact fields needed for each state's return
// Based on actual state filing requirements as of 2025
const STATE_FILING_FORMATS = {
  WV: {
    name: 'West Virginia',
    formName: 'WV/CST-200CU (Combined Sales & Use Tax Return)',
    website: 'https://mytaxes.wvtax.gov/',
    fields: [
      { name: 'Line 1 - Gross Sales', key: 'grossSales', description: 'Total gross receipts/sales' },
      { name: 'Line 2 - Deductions', key: 'deductions', description: 'Non-taxable sales, exemptions' },
      { name: 'Line 3 - Net Taxable Sales', key: 'taxableSales', description: 'Line 1 minus Line 2' },
      { name: 'Line 4 - Tax Rate', key: 'taxRate', description: '6.0%' },
      { name: 'Line 5 - Tax Due', key: 'taxDue', description: 'Line 3 × 0.06' },
      { name: 'Line 6 - Tax Collected', key: 'taxCollected', description: 'Actual tax collected from customers' },
    ],
    calculate: (data) => ({
      grossSales: data.totalSales || data.sales || 0,
      deductions: 0,
      taxableSales: data.totalSales || data.sales || 0,
      taxRate: '6.0%',
      taxDue: (data.totalSales || data.sales || 0) * 0.06,
      taxCollected: data.taxOwed || data.tax || 0,
    }),
  },
  PA: {
    name: 'Pennsylvania',
    formName: 'PA-100 Sales, Use and Hotel Occupancy Tax Return',
    website: 'https://www.revenue.pa.gov/OnlineServices/myPATH/',
    fields: [
      { name: 'Line 1 - Gross Sales', key: 'grossSales', description: 'Total sales price of taxable goods' },
      { name: 'Line 2 - Sales Not Subject to Tax', key: 'exemptSales', description: 'Exempt sales (resale, manufacturing, etc.)' },
      { name: 'Line 3 - Net Taxable Sales', key: 'taxableSales', description: 'Line 1 minus Line 2' },
      { name: 'Line 4 - State Tax (6%)', key: 'stateTax', description: 'Line 3 × 0.06' },
      { name: 'Line 5 - Local Tax (if applicable)', key: 'localTax', description: 'Philadelphia 2%, Allegheny 1%' },
      { name: 'Line 6 - Total Tax Due', key: 'totalTax', description: 'Line 4 + Line 5' },
    ],
    note: 'Philadelphia adds 2% local tax, Allegheny County (Pittsburgh) adds 1%. Most remote sellers only owe state 6%.',
    calculate: (data) => ({
      grossSales: data.totalSales || data.sales || 0,
      exemptSales: 0,
      taxableSales: data.totalSales || data.sales || 0,
      stateTax: (data.totalSales || data.sales || 0) * 0.06,
      localTax: 0,
      totalTax: data.taxOwed || data.tax || 0,
    }),
  },
  MD: {
    name: 'Maryland',
    formName: 'Form 202 - Sales and Use Tax Return',
    website: 'https://interactive.marylandtaxes.gov/',
    fields: [
      { name: 'Line 1 - Gross Sales', key: 'grossSales', description: 'Total sales of tangible personal property' },
      { name: 'Line 2 - Exempt Sales', key: 'exemptSales', description: 'Sales for resale, exempt organizations' },
      { name: 'Line 3 - Net Taxable Sales', key: 'taxableSales', description: 'Line 1 minus Line 2' },
      { name: 'Line 4 - Tax Collected (6%)', key: 'taxCollected', description: 'Tax collected from customers' },
    ],
    note: 'Maryland has a single 6% rate statewide. No local taxes for remote sellers.',
    calculate: (data) => ({
      grossSales: data.totalSales || data.sales || 0,
      exemptSales: 0,
      taxableSales: data.totalSales || data.sales || 0,
      taxCollected: data.taxOwed || data.tax || 0,
    }),
  },
  VA: {
    name: 'Virginia',
    formName: 'Form ST-9 - Retail Sales and Use Tax Return',
    website: 'https://www.tax.virginia.gov/',
    fields: [
      { name: 'Line 1 - Gross Sales', key: 'grossSales', description: 'Total gross sales' },
      { name: 'Line 2 - Deductions', key: 'deductions', description: 'Exempt sales, sales for resale' },
      { name: 'Line 3 - Taxable Sales', key: 'taxableSales', description: 'Line 1 minus Line 2' },
      { name: 'Line 4a - State Tax (4.3%)', key: 'stateTax', description: 'Line 3 × 0.043' },
      { name: 'Line 4b - Local Tax (1%)', key: 'localTax', description: 'Line 3 × 0.01' },
      { name: 'Line 5 - Total Tax (5.3%)', key: 'totalTax', description: 'Line 4a + Line 4b' },
    ],
    note: 'Virginia has combined 5.3% rate (4.3% state + 1% local). Some areas have additional regional taxes.',
    calculate: (data) => ({
      grossSales: data.totalSales || data.sales || 0,
      deductions: 0,
      taxableSales: data.totalSales || data.sales || 0,
      stateTax: (data.totalSales || data.sales || 0) * 0.043,
      localTax: (data.totalSales || data.sales || 0) * 0.01,
      totalTax: data.taxOwed || data.tax || 0,
    }),
  },
  TX: {
    name: 'Texas',
    formName: 'Form 01-117 - Texas Sales and Use Tax Return',
    website: 'https://comptroller.texas.gov/taxes/sales/',
    fields: [
      { name: 'Item 1 - Total Sales', key: 'totalSales', description: 'Total receipts from all sales' },
      { name: 'Item 2 - Taxable Sales', key: 'taxableSales', description: 'Sales subject to sales tax' },
      { name: 'Item 3 - Taxable Purchases', key: 'taxablePurchases', description: 'Use tax on purchases (usually $0)' },
      { name: 'Item 4 - Total Tax Due', key: 'totalTax', description: 'State (6.25%) + Local taxes' },
    ],
    note: 'Texas has 6.25% state rate. Local taxes vary by location (up to 2% additional). Report location of delivery for local tax.',
    calculate: (data) => ({
      totalSales: data.totalSales || data.sales || 0,
      taxableSales: data.totalSales || data.sales || 0,
      taxablePurchases: 0,
      totalTax: data.taxOwed || data.tax || 0,
    }),
  },
  FL: {
    name: 'Florida',
    formName: 'Form DR-15 - Sales and Use Tax Return',
    website: 'https://floridarevenue.com/taxes/taxesfees/Pages/sales_tax.aspx',
    fields: [
      { name: 'Line 1 - Gross Sales', key: 'grossSales', description: 'Total gross sales' },
      { name: 'Line 2 - Exempt Sales', key: 'exemptSales', description: 'Tax-exempt sales' },
      { name: 'Line 3 - Taxable Amount', key: 'taxableSales', description: 'Line 1 minus Line 2' },
      { name: 'Line 4 - State Tax (6%)', key: 'stateTax', description: 'Line 3 × 0.06' },
      { name: 'Line 5 - County Surtax', key: 'surtax', description: 'Discretionary sales surtax (varies by county)' },
      { name: 'Line 6 - Total Tax Due', key: 'totalTax', description: 'Line 4 + Line 5' },
    ],
    note: 'Florida has 6% state rate plus county surtax (0-2.5%). Use customer shipping address to determine county.',
    calculate: (data) => ({
      grossSales: data.totalSales || data.sales || 0,
      exemptSales: 0,
      taxableSales: data.totalSales || data.sales || 0,
      stateTax: (data.totalSales || data.sales || 0) * 0.06,
      surtax: 0,
      totalTax: data.taxOwed || data.tax || 0,
    }),
  },
  CA: {
    name: 'California',
    formName: 'CDTFA-401 - State, Local, and District Sales and Use Tax Return',
    website: 'https://onlineservices.cdtfa.ca.gov/',
    fields: [
      { name: 'Line 1 - Total Gross Sales', key: 'grossSales', description: 'Total of all sales' },
      { name: 'Line 2 - Purchases Subject to Use Tax', key: 'useTaxPurchases', description: 'Usually $0 for sellers' },
      { name: 'Line 3 - Total', key: 'totalSubject', description: 'Line 1 + Line 2' },
      { name: 'Line 4 - Deductions', key: 'deductions', description: 'Nontaxable sales, exempt sales' },
      { name: 'Line 5 - Total Taxable', key: 'taxableSales', description: 'Line 3 minus Line 4' },
      { name: 'Line 6 - Tax Due', key: 'taxDue', description: 'Based on district tax rates' },
    ],
    note: 'CA requires district-level reporting. Base rate is 7.25% but varies by district (7.25%-10.75%). Use CDTFA online system.',
    calculate: (data) => ({
      grossSales: data.totalSales || data.sales || 0,
      useTaxPurchases: 0,
      totalSubject: data.totalSales || data.sales || 0,
      deductions: 0,
      taxableSales: data.totalSales || data.sales || 0,
      taxDue: data.taxOwed || data.tax || 0,
    }),
  },
  NY: {
    name: 'New York',
    formName: 'Form ST-100 - New York State and Local Sales and Use Tax Return',
    website: 'https://www.tax.ny.gov/bus/st/stidx.htm',
    fields: [
      { name: 'Part 1 - Gross Sales', key: 'grossSales', description: 'Gross sales and services' },
      { name: 'Part 1 - Non-Taxable Sales', key: 'nonTaxable', description: 'Exempt sales, clothing under $110' },
      { name: 'Part 1 - Taxable Sales', key: 'taxableSales', description: 'Gross minus non-taxable' },
      { name: 'Part 2 - State Tax (4%)', key: 'stateTax', description: 'Taxable × 0.04' },
      { name: 'Part 2 - Local Tax', key: 'localTax', description: 'Varies by jurisdiction (0-4.875%)' },
      { name: 'Total Tax Due', key: 'totalTax', description: 'State + Local' },
    ],
    note: 'NY exempts clothing/footwear under $110. NYC has 4.5% local tax. Use Schedule H for jurisdiction breakdown.',
    calculate: (data) => ({
      grossSales: data.totalSales || data.sales || 0,
      nonTaxable: 0,
      taxableSales: data.totalSales || data.sales || 0,
      stateTax: (data.totalSales || data.sales || 0) * 0.04,
      localTax: 0,
      totalTax: data.taxOwed || data.tax || 0,
    }),
  },
  OH: {
    name: 'Ohio',
    formName: 'UST 1 - Universal Sales Tax Return',
    website: 'https://tax.ohio.gov/sales_and_use.aspx',
    fields: [
      { name: 'Line 1 - Gross Receipts', key: 'grossSales', description: 'Total gross receipts' },
      { name: 'Line 2 - Exempt Sales', key: 'exemptSales', description: 'Non-taxable transactions' },
      { name: 'Line 3 - Net Taxable Sales', key: 'taxableSales', description: 'Line 1 minus Line 2' },
      { name: 'Line 4 - Tax Collected', key: 'taxCollected', description: 'Total tax collected' },
    ],
    note: 'Ohio has 5.75% state rate plus county taxes (0.75%-2.25%). Use county of delivery.',
    calculate: (data) => ({
      grossSales: data.totalSales || data.sales || 0,
      exemptSales: 0,
      taxableSales: data.totalSales || data.sales || 0,
      taxCollected: data.taxOwed || data.tax || 0,
    }),
  },
  NC: {
    name: 'North Carolina',
    formName: 'Form E-500 - Sales and Use Tax Return',
    website: 'https://www.ncdor.gov/taxes-forms/sales-and-use-tax',
    fields: [
      { name: 'Line 1 - Gross Receipts', key: 'grossSales', description: 'Total gross receipts' },
      { name: 'Line 2 - Exempt Receipts', key: 'exemptSales', description: 'Tax-exempt sales' },
      { name: 'Line 3 - Net Taxable Sales', key: 'taxableSales', description: 'Line 1 minus Line 2' },
      { name: 'Line 4 - State Tax (4.75%)', key: 'stateTax', description: 'Line 3 × 0.0475' },
      { name: 'Line 5 - Local Tax (2-2.75%)', key: 'localTax', description: 'County tax rate varies' },
      { name: 'Line 6 - Total Tax', key: 'totalTax', description: 'Line 4 + Line 5' },
    ],
    note: 'NC has 4.75% state + 2-2.75% county. Combined rates range 6.75%-7.5%. Use destination county.',
    calculate: (data) => ({
      grossSales: data.totalSales || data.sales || 0,
      exemptSales: 0,
      taxableSales: data.totalSales || data.sales || 0,
      stateTax: (data.totalSales || data.sales || 0) * 0.0475,
      localTax: 0,
      totalTax: data.taxOwed || data.tax || 0,
    }),
  },
  GA: {
    name: 'Georgia',
    formName: 'Form ST-3 - Sales and Use Tax Return',
    website: 'https://gtc.dor.ga.gov/',
    fields: [
      { name: 'Line 1 - Gross Sales', key: 'grossSales', description: 'Gross sales, use, and withdrawals' },
      { name: 'Line 2 - Deductions', key: 'deductions', description: 'Exempt and non-taxable sales' },
      { name: 'Line 3 - Taxable Sales', key: 'taxableSales', description: 'Line 1 minus Line 2' },
      { name: 'Line 4 - State Tax (4%)', key: 'stateTax', description: 'Line 3 × 0.04' },
      { name: 'Line 5 - Local Tax', key: 'localTax', description: 'LOST/SPLOST varies by jurisdiction' },
      { name: 'Line 6 - Total Tax', key: 'totalTax', description: 'Line 4 + Line 5' },
    ],
    note: 'GA has 4% state rate + 3-4% local option taxes. Combined rates 7-9%. File through Georgia Tax Center.',
    calculate: (data) => ({
      grossSales: data.totalSales || data.sales || 0,
      deductions: 0,
      taxableSales: data.totalSales || data.sales || 0,
      stateTax: (data.totalSales || data.sales || 0) * 0.04,
      localTax: 0,
      totalTax: data.taxOwed || data.tax || 0,
    }),
  },
  NJ: {
    name: 'New Jersey',
    formName: 'Form ST-50 - Sales and Use Tax Return',
    website: 'https://www.state.nj.us/treasury/taxation/su.shtml',
    fields: [
      { name: 'Line 1 - Gross Receipts', key: 'grossSales', description: 'Total gross receipts' },
      { name: 'Line 2 - Non-Taxable Sales', key: 'exemptSales', description: 'Exempt sales' },
      { name: 'Line 3 - Taxable Sales', key: 'taxableSales', description: 'Line 1 minus Line 2' },
      { name: 'Line 4 - Tax Due (6.625%)', key: 'taxDue', description: 'Line 3 × 0.06625' },
    ],
    note: 'NJ has single statewide 6.625% rate. No local taxes. Urban Enterprise Zones may have reduced rates.',
    calculate: (data) => ({
      grossSales: data.totalSales || data.sales || 0,
      exemptSales: 0,
      taxableSales: data.totalSales || data.sales || 0,
      taxDue: data.taxOwed || data.tax || 0,
    }),
  },
  // Generic format for states without specific config
  OK: {
    name: 'Oklahoma',
    formName: 'Form STS 20002 - Sales Tax Return',
    website: 'https://oktap.tax.ok.gov/',
    requiresJurisdictions: true,  // Flag for jurisdiction-level reporting
    jurisdictionType: 'county',
    fields: [
      { name: 'State Tax (4.5%)', key: 'stateTax', description: 'Total state tax collected' },
      { name: 'County/City Taxes', key: 'localTax', description: 'Breakdown by jurisdiction required' },
      { name: 'Total Tax Due', key: 'totalTax', description: 'State + Local' },
    ],
    note: 'Oklahoma requires county/city breakdown. Use OkTAP portal to report by jurisdiction. Local rates vary (0-6.5% additional).',
    calculate: (data, stateInfo) => ({
      stateTax: (data.totalSales || data.sales || 0) * 0.045,
      localTax: (data.taxOwed || data.tax || 0) - ((data.totalSales || data.sales || 0) * 0.045),
      totalTax: data.taxOwed || data.tax || 0,
    }),
    exportFormat: 'jurisdiction', // Triggers jurisdiction-level CSV export
  },
  CO: {
    name: 'Colorado',
    formName: 'DR 0100 - Colorado Retail Sales Tax Return',
    website: 'https://mytax.colorado.gov/',
    requiresJurisdictions: true,
    jurisdictionType: 'city/county',
    fields: [
      { name: 'State Tax (2.9%)', key: 'stateTax', description: 'State sales tax' },
      { name: 'RTD/CD/FD Taxes', key: 'specialTax', description: 'Regional transit, cultural, football district taxes' },
      { name: 'County Taxes', key: 'countyTax', description: 'Breakdown by county' },
      { name: 'City/Local Taxes', key: 'cityTax', description: 'Home rule cities require separate filing!' },
      { name: 'Total Tax Due', key: 'totalTax', description: 'All taxes' },
    ],
    note: 'Colorado home rule cities (Denver, Aurora, Colorado Springs, etc.) require SEPARATE registration and filing directly with the city. State-administered localities can be filed together.',
    calculate: (data, stateInfo) => ({
      stateTax: (data.totalSales || data.sales || 0) * 0.029,
      specialTax: 0,
      countyTax: 0,
      cityTax: (data.taxOwed || data.tax || 0) - ((data.totalSales || data.sales || 0) * 0.029),
      totalTax: data.taxOwed || data.tax || 0,
    }),
    exportFormat: 'jurisdiction',
  },
  KS: {
    name: 'Kansas',
    formName: 'ST-36 - Retailers Sales Tax Return',
    website: 'https://www.ksrevenue.gov/custservsalestax.html',
    requiresJurisdictions: true,
    jurisdictionType: 'jurisdiction',
    fields: [
      { name: 'Gross Sales', key: 'grossSales', description: 'Total sales' },
      { name: 'Exempt Sales', key: 'exemptSales', description: 'Non-taxable sales' },
      { name: 'Taxable Sales', key: 'taxableSales', description: 'Gross minus exempt' },
      { name: 'Tax by Jurisdiction', key: 'jurisdictionTax', description: 'Breakdown by city/county' },
    ],
    note: 'Kansas requires jurisdiction-level reporting. Use StreamlinedSalesTax.org or the Kansas WebFile system.',
    calculate: (data, stateInfo) => ({
      grossSales: data.totalSales || data.sales || 0,
      exemptSales: 0,
      taxableSales: data.totalSales || data.sales || 0,
      jurisdictionTax: data.taxOwed || data.tax || 0,
    }),
    exportFormat: 'jurisdiction',
  },
  LA: {
    name: 'Louisiana',
    formName: 'R-1029 - Louisiana Sales Tax Return',
    website: 'https://latap.revenue.louisiana.gov/',
    requiresJurisdictions: true,
    jurisdictionType: 'parish',
    fields: [
      { name: 'State Tax (4.45%)', key: 'stateTax', description: 'State sales tax' },
      { name: 'Parish Taxes', key: 'parishTax', description: 'Local parish taxes (vary widely)' },
      { name: 'Total Tax Due', key: 'totalTax', description: 'State + Parish' },
    ],
    note: 'Louisiana requires parish-level reporting. Remote sellers can use the Louisiana Sales & Use Tax Commission single return for most parishes.',
    calculate: (data, stateInfo) => ({
      stateTax: (data.totalSales || data.sales || 0) * 0.0445,
      parishTax: (data.taxOwed || data.tax || 0) - ((data.totalSales || data.sales || 0) * 0.0445),
      totalTax: data.taxOwed || data.tax || 0,
    }),
    exportFormat: 'jurisdiction',
  },
  DEFAULT: {
    name: 'Standard',
    formName: 'State Sales Tax Return',
    website: null,
    fields: [
      { name: 'Gross Sales', key: 'grossSales', description: 'Total sales shipped to state' },
      { name: 'Exempt Sales', key: 'exemptSales', description: 'Non-taxable sales' },
      { name: 'Net Taxable Sales', key: 'taxableSales', description: 'Gross minus exempt' },
      { name: 'Tax Collected', key: 'taxCollected', description: 'Tax you collected on orders' },
    ],
    calculate: (data, stateInfo) => ({
      grossSales: data.totalSales || data.sales || 0,
      exemptSales: 0,
      taxableSales: data.totalSales || data.sales || 0,
      taxCollected: data.taxOwed || data.tax || 0,
    }),
  },
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
  dailySales: allDaysData, // Daily data
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
  forecastMeta,
  weekNotes,
  goals,
  productNames: savedProductNames,
  theme,
  widgetConfig,
  productionPipeline,
  threeplLedger,
  amazonCampaigns,
  // Amazon Ads Intelligence (search terms, placements, targeting, etc.)
  adsIntelData,
  // Report History & Action Tracker
  reportHistory,
  actionItems,
  // Self-learning forecast data
  forecastAccuracyHistory,
  forecastCorrections,
  // SKU Return Rates
  returnRates,
  // AI-powered forecasts
  aiForecasts,
  // Modular AI system
  leadTimeSettings,
  aiForecastModule,
  aiLearningHistory,
  // UNIFIED AI MODEL - single source of truth for all learning
  unifiedAIModel,
  // AI Reports & Chat
  weeklyReports,
  aiMessages, // Chat history
  // Banking data
  bankingData,
  // Recurring expenses
  confirmedRecurring,
  // Shopify Integration credentials
  shopifyCredentials,
  // Packiyo 3PL Integration credentials
  packiyoCredentials,
  // Amazon SP-API Integration credentials
  amazonCredentials,
  // QuickBooks Online Integration credentials
  qboCredentials,
}), [allWeeksData, allDaysData, invHistory, savedCogs, cogsLastUpdated, allPeriodsData, storeName, storeLogo, salesTaxConfig, appSettings, invoices, amazonForecasts, forecastMeta, weekNotes, goals, savedProductNames, theme, widgetConfig, productionPipeline, threeplLedger, amazonCampaigns, adsIntelData, forecastAccuracyHistory, forecastCorrections, returnRates, aiForecasts, leadTimeSettings, aiForecastModule, aiLearningHistory, unifiedAIModel, weeklyReports, aiMessages, bankingData, confirmedRecurring, shopifyCredentials, packiyoCredentials, amazonCredentials, qboCredentials]);

const loadFromLocal = useCallback(() => {
  try {
    const r = lsGet(STORAGE_KEY);
    if (r) {
      const d = JSON.parse(r);
      setAllWeeksData(d);
      const today = new Date();
      // Allow current week: week is visible if it has started
      const w = Object.keys(d).filter(wk => {
        const weekEnd = new Date(wk + 'T12:00:00');
        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekStart.getDate() - 6);
        return weekStart <= today;
      }).sort().reverse();
      if (w.length) { setSelectedWeek(w[0]); }
    }
  } catch (e) { devError("[error]", e); }

  // Load daily data - check both keys for backwards compatibility
  try {
    let dailyData = null;
    const r = lsGet('ecommerce_daily_sales_v1');
    if (r) {
      try {
        dailyData = JSON.parse(r);
      } catch (parseErr) {
        devError('Failed to parse ecommerce_daily_sales_v1:', parseErr.message);
      }
    }
    
    // Also check legacy 'dailySales' key and merge if it has more data
    const legacyRaw = localStorage.getItem('dailySales'); // Direct access, no lsGet
    if (legacyRaw) {
      try {
        const legacy = JSON.parse(legacyRaw);
        const legacyDates = Object.keys(legacy);
        const datesWithAmazonSku = legacyDates.filter(d => legacy[d]?.amazon?.skuData?.length > 0);
        
        if (legacyDates.length > 0) {
          // Merge legacy data, preferring legacy if it has skuData
          dailyData = dailyData || {};
          let merged = 0;
          legacyDates.forEach(date => {
            const legacyDay = legacy[date];
            const existingDay = dailyData[date];
            // Use legacy if it has Amazon skuData and existing doesn't
            if (legacyDay?.amazon?.skuData?.length > 0 && !existingDay?.amazon?.skuData?.length) {
              dailyData[date] = { ...existingDay, ...legacyDay };
              merged++;
            } else if (!existingDay) {
              dailyData[date] = legacyDay;
              merged++;
            }
          });
        }
      } catch (legacyErr) {
        devError('Failed to parse legacy dailySales:', legacyErr.message);
      }
    }
    
    if (dailyData && Object.keys(dailyData).length > 0) {
      const daysWithAmazonSku = Object.keys(dailyData).filter(d => dailyData[d]?.amazon?.skuData?.length > 0);
      const daysWithShopifySku = Object.keys(dailyData).filter(d => {
        const shopifySkuData = dailyData[d]?.shopify?.skuData;
        return (Array.isArray(shopifySkuData) && shopifySkuData.length > 0) || 
               (shopifySkuData && typeof shopifySkuData === 'object' && Object.keys(shopifySkuData).length > 0);
      });
      const daysWithShopifyRevenue = Object.keys(dailyData).filter(d => (dailyData[d]?.shopify?.revenue || 0) > 0);
      if (daysWithShopifySku.length > 0) {
        const sampleDay = daysWithShopifySku[0];
        const sampleData = dailyData[sampleDay]?.shopify?.skuData;
      }
      setAllDaysData(dailyData);
    }
  } catch (err) {
    devError('Error loading daily data:', err);
  }

  try {
    const r = lsGet(INVENTORY_KEY);
    if (r) setInvHistory(JSON.parse(r));
  } catch (e) { if (e.message) devWarn("[init]", e.message); }

  try {
    const r = lsGet(COGS_KEY);
    if (r) {
      const d = JSON.parse(r);
      setSavedCogs(d.lookup || {});
      setCogsLastUpdated(d.updatedAt || null);
    }
  } catch (e) { if (e.message) devWarn("[init]", e.message); }

  // Load product names
  try {
    const names = lsGet(PRODUCT_NAMES_KEY);
    if (names) setSavedProductNames(JSON.parse(names));
  } catch (e) { if (e.message) devWarn("[init]", e.message); }

  try {
    const r = lsGet(PERIODS_KEY);
    if (r) setAllPeriodsData(JSON.parse(r));
  } catch (e) { if (e.message) devWarn("[init]", e.message); }

  try {
    const r = lsGet(STORE_KEY);
    if (r) setStoreName(r);
  } catch (e) { if (e.message) devWarn("[init]", e.message); }

  try {
    const r = lsGet(GOALS_KEY);
    if (r) setGoals(JSON.parse(r));
  } catch (e) { if (e.message) devWarn("[init]", e.message); }

  try {
    const r = lsGet(SALES_TAX_KEY);
    if (r) setSalesTaxConfig(JSON.parse(r));
  } catch (e) { if (e.message) devWarn("[init]", e.message); }

  try {
    const r = lsGet(SETTINGS_KEY);
    if (r) setAppSettings(prev => ({ ...prev, ...JSON.parse(r) }));
  } catch (e) { if (e.message) devWarn("[init]", e.message); }

  try {
    const r = lsGet(THREEPL_LEDGER_KEY);
    if (r) setThreeplLedger(JSON.parse(r));
  } catch (e) { if (e.message) devWarn("[init]", e.message); }

  // Load Shopify credentials from localStorage
  try {
    const r = lsGet('ecommerce_shopify_creds_v1');
    if (r) setShopifyCredentials(JSON.parse(r));
  } catch (e) { if (e.message) devWarn("[init]", e.message); }
  
  // Load Packiyo credentials from localStorage
  try {
    const r = lsGet('ecommerce_packiyo_creds_v1');
    if (r) setPackiyoCredentials(JSON.parse(r));
  } catch (e) { if (e.message) devWarn("[init]", e.message); }
  
  // Load Amazon credentials from localStorage
  try {
    const r = lsGet('ecommerce_amazon_creds_v1');
    if (r) setAmazonCredentials(JSON.parse(r));
  } catch (e) { if (e.message) devWarn("[init]", e.message); }
  
  // Load QBO credentials from localStorage
  try {
    const r = lsGet('ecommerce_qbo_creds_v1');
    if (r) setQboCredentials(JSON.parse(r));
  } catch (e) { if (e.message) devWarn("[init]", e.message); }
}, []);

// ALWAYS load API credentials from localStorage on mount, even when Supabase is configured.
// This ensures credentials survive CORS failures, cloud outages, and session changes.
// Cloud data will override these if it has newer values (via loadFromCloud).
useEffect(() => {
  const credKeys = [
    { key: 'ecommerce_shopify_creds_v1', setter: setShopifyCredentials },
    { key: 'ecommerce_packiyo_creds_v1', setter: setPackiyoCredentials },
    { key: 'ecommerce_amazon_creds_v1', setter: setAmazonCredentials },
    { key: 'ecommerce_qbo_creds_v1', setter: setQboCredentials },
  ];
  credKeys.forEach(({ key, setter }) => {
    try {
      const raw = lsGet(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Only apply if it has real data (not empty defaults)
        const hasData = parsed.connected || parsed.storeUrl || parsed.apiKey || 
                        parsed.refreshToken || parsed.accessToken || parsed.clientId;
        if (hasData) {
          setter(prev => {
            // Don't overwrite if state already has more complete data (from cloud)
            const prevHasData = prev.connected || prev.storeUrl || prev.apiKey || 
                               prev.refreshToken || prev.accessToken || prev.clientId;
            return prevHasData ? prev : parsed;
          });
        }
      }
    } catch (e) { if (e?.message) devWarn("[cred-restore]", e.message); }
  });
}, []);

// Sync 3PL ledger costs to weekly data when ledger changes
// This ensures profit calculations are accurate even if 3PL data was uploaded separately
useEffect(() => {
  if (!threeplLedger?.orders || Object.keys(threeplLedger.orders).length === 0) return;
  if (Object.keys(allWeeksData).length === 0) return;
  
  // Get unique week keys from ledger
  const ledgerWeeks = new Set(Object.values(threeplLedger.orders).map(o => o.weekKey).filter(Boolean));
  if (ledgerWeeks.size === 0) return;
  
  let needsUpdate = false;
  const updatedWeeks = { ...allWeeksData };
  
  ledgerWeeks.forEach(weekKey => {
    if (!updatedWeeks[weekKey]) return;
    
    // Calculate 3PL costs from ledger
    const ledger3PL = get3PLForWeek(threeplLedger, weekKey);
    const ledgerCost = ledger3PL?.metrics?.totalCost || 0;
    const currentCost = updatedWeeks[weekKey].shopify?.threeplCosts || 0;
    
    // Only update if ledger has more cost data than current
    if (ledgerCost > 0 && Math.abs(ledgerCost - currentCost) > 0.01) {
      const oldCost = currentCost;
      const shopProfit = (updatedWeeks[weekKey].shopify?.netProfit || 0) + oldCost - ledgerCost;
      
      updatedWeeks[weekKey] = {
        ...updatedWeeks[weekKey],
        shopify: {
          ...updatedWeeks[weekKey].shopify,
          threeplCosts: ledgerCost,
          threeplBreakdown: ledger3PL?.breakdown || updatedWeeks[weekKey].shopify?.threeplBreakdown,
          threeplMetrics: ledger3PL?.metrics || updatedWeeks[weekKey].shopify?.threeplMetrics,
          netProfit: shopProfit,
          netMargin: updatedWeeks[weekKey].shopify?.revenue > 0 ? (shopProfit / updatedWeeks[weekKey].shopify.revenue) * 100 : 0,
        },
        total: {
          ...updatedWeeks[weekKey].total,
          netProfit: (updatedWeeks[weekKey].amazon?.netProfit || 0) + shopProfit,
          netMargin: updatedWeeks[weekKey].total?.revenue > 0 ? (((updatedWeeks[weekKey].amazon?.netProfit || 0) + shopProfit) / updatedWeeks[weekKey].total.revenue) * 100 : 0,
        }
      };
      needsUpdate = true;
    }
  });
  
  if (needsUpdate) {
    setAllWeeksData(updatedWeeks);
    save(updatedWeeks);
  }
}, [threeplLedger]); // Only re-run when threeplLedger changes

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

const pushToCloudNow = useCallback(async (dataObj, forceOverwrite = false) => {
  if (!supabase || !session?.user?.id) return;
  if (saveInProgressRef.current) {
    // Save is busy — queue this data so it's saved when current save finishes
    pendingSaveDataRef.current = dataObj;
    return;
  }
  saveInProgressRef.current = true;
  setCloudStatus('Saving…');
  
  try {
  // CRITICAL SAFETY CHECK: Never overwrite populated data with empty data
  // This prevents accidental data loss from race conditions
  const localSalesCount = Object.keys(dataObj.sales || {}).length;
  const localDailyCount = Object.keys(dataObj.dailySales || {}).length;
  const localPeriodsCount = Object.keys(dataObj.periods || {}).length;
  const localDataSize = localSalesCount + localDailyCount + localPeriodsCount;
  
  // Check existing cloud data
  const { data: existingCheck } = await supabase
    .from('app_data')
    .select('data')
    .eq('user_id', session.user.id)
    .maybeSingle();
  
  if (existingCheck?.data?.storeData) {
    const targetStoreId = activeStoreId || 'default';
    const cloudStore = existingCheck.data.storeData[targetStoreId] || {};
    const cloudSalesCount = Object.keys(cloudStore.sales || {}).length;
    const cloudDailyCount = Object.keys(cloudStore.dailySales || {}).length;
    const cloudPeriodsCount = Object.keys(cloudStore.periods || {}).length;
    const cloudDataSize = cloudSalesCount + cloudDailyCount + cloudPeriodsCount;
    
    // If cloud has significant data but local is empty/minimal, BLOCK the save
    if (cloudDataSize > 5 && localDataSize === 0 && !forceOverwrite) {
      devError('BLOCKED: Attempted to overwrite', cloudDataSize, 'records with empty data. Use forceOverwrite=true to override.');
      setCloudStatus('Save blocked - would delete data');
      setTimeout(() => setCloudStatus(''), 3000);
      saveInProgressRef.current = false;
      pendingSaveDataRef.current = null;
      return;
    }
    
    // Warn if losing significant data (but still allow if not empty)
    if (cloudDataSize > localDataSize + 10 && !forceOverwrite) {
      devWarn('WARNING: Saving will reduce data count from', cloudDataSize, 'to', localDataSize);
    }
  }
  
  // First, check if cloud data has been modified since we last loaded (conflict detection)
  // Skip conflict check if we saved recently (our own save advancing the timestamp)
  const timeSinceLastSave = Date.now() - (lastSavedRef.current || 0);
  const skipConflictCheck = timeSinceLastSave < 10000; // 10s grace period after our own saves
  
  if (!forceOverwrite && loadedCloudVersion && !conflictCheckRef.current && !skipConflictCheck) {
    const { data: currentCloud } = await supabase
      .from('app_data')
      .select('updated_at')
      .eq('user_id', session.user.id)
      .maybeSingle();
    
    if (currentCloud?.updated_at && currentCloud.updated_at > loadedCloudVersion) {
      // Cloud has newer data - potential conflict!
      conflictCheckRef.current = true; // Prevent repeated checks
      
      // Fetch full data only when conflict is confirmed
      const { data: fullCloud } = await supabase
        .from('app_data')
        .select('data')
        .eq('user_id', session.user.id)
        .maybeSingle();
      
      // Store conflict info for resolution modal
      const targetStoreId = activeStoreId || 'default';
      let cloudStoreData;
      if (fullCloud?.data?.storeData?.[targetStoreId]) {
        cloudStoreData = fullCloud.data.storeData[targetStoreId];
      } else {
        cloudStoreData = fullCloud?.data || {};
      }
      
      setConflictData({
        cloudData: cloudStoreData,
        cloudVersion: currentCloud.updated_at,
        localData: dataObj,
        cloudUpdatedAt: new Date(currentCloud.updated_at).toLocaleString(),
        localUpdatedAt: new Date().toLocaleString(),
      });
      setShowConflictModal(true);
      setCloudStatus('Conflict detected');
      saveInProgressRef.current = false;
      pendingSaveDataRef.current = null;
      return;
    }
  }
  
  // Trim large ads intel data before cloud save to stay within Supabase row limits
  const cloudDataObj = { ...dataObj };
  if (cloudDataObj.adsIntelData) cloudDataObj.adsIntelData = trimIntelData(cloudDataObj.adsIntelData, 150);
  if (cloudDataObj.dtcIntelData) cloudDataObj.dtcIntelData = trimIntelData(cloudDataObj.dtcIntelData, 150);
  
  // SEC-003: Strip integration credentials from cloud saves
  // Credentials stay in memory + localStorage for sync; they never go to Supabase
  const CREDENTIAL_KEYS = ['shopifyCredentials', 'packiyoCredentials', 'amazonCredentials', 'qboCredentials'];
  CREDENTIAL_KEYS.forEach(key => {
    if (cloudDataObj[key]) {
      // Keep only non-sensitive fields (connected status, storeUrl, etc.)
      const cred = cloudDataObj[key];
      cloudDataObj[key] = {
        connected: cred.connected || false,
        lastSync: cred.lastSync || null,
        ...(cred.storeUrl && { storeUrl: cred.storeUrl }),
        ...(cred.realmId && { realmId: cred.realmId }),
        ...(cred.customerId && { customerId: cred.customerId }),
        ...(cred.sellerId && { sellerId: cred.sellerId }),
        ...(cred.marketplaceId && { marketplaceId: cred.marketplaceId }),
        // Ads API metadata (non-secret) — preserve connection state for cloud restore
        ...(cred.adsConnected !== undefined && { adsConnected: cred.adsConnected }),
        ...(cred.adsLastSync && { adsLastSync: cred.adsLastSync }),
        ...(cred.adsProfileId && { adsProfileId: cred.adsProfileId }),
      };
    }
  });
  
  const payload = {
    user_id: session.user.id,
    data: { 
      stores: stores,
      activeStoreId: activeStoreId,
      storeData: {
        [activeStoreId || 'default']: cloudDataObj
      }
    },
    updated_at: new Date().toISOString(),
  };
  
  // Merge with existing stores data to preserve other stores
  const { data: existingData } = await supabase
    .from('app_data')
    .select('data')
    .eq('user_id', session.user.id)
    .maybeSingle();
  
  if (existingData?.data?.storeData) {
    payload.data.storeData = {
      ...existingData.data.storeData,
      [activeStoreId || 'default']: cloudDataObj
    };
    payload.data.stores = existingData.data.stores || stores;
  }
  
  const { error } = await supabase.from('app_data').upsert(payload, { onConflict: 'user_id' });
  if (error) {
    devWarn('Cloud save failed:', error.message || error);
    // Update loadedCloudVersion to current cloud timestamp to prevent conflict loop
    try {
      const { data: latest } = await supabase.from('app_data').select('updated_at').eq('user_id', session.user.id).maybeSingle();
      if (latest?.updated_at) setLoadedCloudVersion(latest.updated_at);
    } catch (e) { devError("[error]", e); }
    setCloudStatus('Save failed (retry soon)');
    setTimeout(() => setCloudStatus(''), 3000);
    saveInProgressRef.current = false;
    pendingSaveDataRef.current = null; // Clear queue on error
    return;
  }
  
  // Update our version tracking
  setLoadedCloudVersion(payload.updated_at);
  conflictCheckRef.current = false;
  
  lastSavedRef.current = Date.now();
  setLastSyncDate(new Date().toISOString());
  setCloudStatus('Saved');
  setTimeout(() => setCloudStatus(''), 1500);
  saveInProgressRef.current = false;
  // Drain queued save if another save was requested while we were busy
  if (pendingSaveDataRef.current) {
    const queued = pendingSaveDataRef.current;
    pendingSaveDataRef.current = null;
    pushToCloudNow(queued);
  }
  } catch (networkErr) {
    // Handle CORS or network errors gracefully (e.g. Supabase unreachable)
    console.warn('[CloudSave] Network error (CORS or connectivity):', networkErr.message || networkErr);
    setCloudStatus('Save failed - network error');
    setTimeout(() => setCloudStatus(''), 5000);
    saveInProgressRef.current = false;
    pendingSaveDataRef.current = null; // Clear queue on network error to avoid retry loops
  }
}, [session, stores, activeStoreId, loadedCloudVersion]);

const queueCloudSave = useCallback((nextDataObj) => {
  if (!session?.user?.id || !supabase) return;
  if (isLoadingDataRef.current) return;

  if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  saveTimerRef.current = setTimeout(() => {
    pushToCloudNow(nextDataObj);
  }, 800);
}, [session, pushToCloudNow]);

const save3PLLedger = useCallback((newLedger) => {
  setThreeplLedger(newLedger);
  lsSet(THREEPL_LEDGER_KEY, JSON.stringify(newLedger));
  queueCloudSave({ ...combinedData, threeplLedger: newLedger });
}, [combinedData, queueCloudSave]);

// Store name persistence
useEffect(() => {
  try {
    if (storeName !== undefined) writeToLocal(STORE_KEY, storeName || '');
  } catch (e) { devError("[error]", e); }
  queueCloudSave({ ...combinedData, storeName });
}, [storeName]);

// Sync new features to cloud when they change
useEffect(() => {
  if (!session?.user?.id || !supabase) return;
  if (isLoadingDataRef.current) return; // Don't sync during initial load
  queueCloudSave(combinedData);
}, [invoices, amazonForecasts, weekNotes, goals, savedProductNames, theme, productionPipeline, allDaysData, bankingData, confirmedRecurring, shopifyCredentials, packiyoCredentials, amazonCredentials, qboCredentials, leadTimeSettings, appSettings, widgetConfig, salesTaxConfig, storeName, forecastCorrections]);

// ── Process ads file uploads (Tier 1 daily KPIs + Tier 2 deep analysis) ──
const processAdsUpload = useCallback(async (fileList) => {
  let JSZipLib = null;
  const hasZip = fileList.some(f => f.name.toLowerCase().endsWith('.zip'));
  if (hasZip) {
    try { const mod = await import('jszip'); JSZipLib = mod.default || mod; } catch(e) { devWarn('JSZip not available, ZIP files will be skipped'); }
  }
  const result = await processUploadedFiles(fileList, JSZipLib);
  if (result.tier1Results.length > 0) {
    setAllDaysData(prev => mergeTier1IntoDailySales(prev, result.tier1Results));
  }
  if (result.tier2Results.length > 0) {
    setAdsIntelData(prev => mergeTier2IntoIntelData(prev || {}, result.tier2Results));
  }
  if (result.tier1Results.length > 0 || result.tier2Results.length > 0) {
    queueCloudSave();
  }
  return result;
}, [queueCloudSave]);

// Persist Shopify credentials to localStorage for offline backup
useEffect(() => {
  if (shopifyCredentials.storeUrl || shopifyCredentials.connected) {
    try {
      // SEC-003 guard: Don't save stripped credentials
      if (shopifyCredentials.connected && !shopifyCredentials.clientSecret && !shopifyCredentials.accessToken) {
        return;
      }
      lsSet('ecommerce_shopify_creds_v1', JSON.stringify(shopifyCredentials));
    } catch (e) { if (e.message) devWarn("[init]", e.message); }
  }
}, [shopifyCredentials]);

// Persist Packiyo credentials to localStorage for offline backup
useEffect(() => {
  if (packiyoCredentials.apiKey || packiyoCredentials.connected) {
    try {
      // SEC-003 guard: Don't save stripped credentials
      if (packiyoCredentials.connected && !packiyoCredentials.apiKey) {
        return;
      }
      lsSet('ecommerce_packiyo_creds_v1', JSON.stringify(packiyoCredentials));
    } catch (e) { if (e.message) devWarn("[init]", e.message); }
  }
}, [packiyoCredentials]);

// Persist Amazon credentials to localStorage for offline backup
useEffect(() => {
  if (amazonCredentials.refreshToken || amazonCredentials.connected || amazonCredentials.adsRefreshToken || amazonCredentials.adsConnected) {
    try {
      // SEC-003 guard: Never save stripped credentials back to localStorage
      if (amazonCredentials.connected && !amazonCredentials.refreshToken && !amazonCredentials.clientId) {
        if (!amazonCredentials.adsRefreshToken) return; // Skip — would overwrite real credentials with stripped data
      }
      lsSet('ecommerce_amazon_creds_v1', JSON.stringify(amazonCredentials));
    } catch (e) { if (e.message) devWarn("[init]", e.message); }
  }
}, [amazonCredentials]);

// Persist QBO credentials to localStorage for offline backup
useEffect(() => {
  if (qboCredentials.accessToken || qboCredentials.connected || qboCredentials.clientId) {
    try {
      // SEC-003 guard: Don't save stripped credentials
      if (qboCredentials.connected && !qboCredentials.accessToken && !qboCredentials.clientId) {
        return;
      }
      lsSet('ecommerce_qbo_creds_v1', JSON.stringify(qboCredentials));
    } catch (e) { if (e.message) devWarn("[init]", e.message); }
  }
}, [qboCredentials]);

const loadFromCloud = useCallback(async (storeId = null) => {
  if (!supabase || !session?.user?.id) return { ok: false, reason: 'no_session', stores: [] };
  setCloudStatus('Loading…');
  
  try {
    const { data, error } = await supabase
      .from('app_data')
      .select('data, updated_at')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (error) {
      devError('Cloud load error:', error);
      setCloudStatus('');
      return { ok: false, reason: 'error', stores: [] }; // Error - do NOT overwrite
    }
    if (!data?.data) {
      setCloudStatus('');
      return { ok: false, reason: 'no_data', stores: [] }; // Truly new user - safe to initialize
    }

    // Store the cloud version timestamp for conflict detection
    const cloudVersion = data.updated_at || new Date().toISOString();
    setLoadedCloudVersion(cloudVersion);
    conflictCheckRef.current = false; // Reset conflict check flag

    const cloudData = data.data || {};
    
    // Handle multi-store structure
    const loadedStores = cloudData.stores || [];
    if (loadedStores.length > 0) {
      setStores(loadedStores);
    }
    
    // Determine which store to load
    const targetStoreId = storeId || cloudData.activeStoreId || (loadedStores[0]?.id) || 'default';
    setActiveStoreId(targetStoreId);
    
    // Get store-specific data (support both old and new format)
    let cloud;
    if (cloudData.storeData && cloudData.storeData[targetStoreId]) {
      cloud = cloudData.storeData[targetStoreId];
    } else if (cloudData.storeData?.default) {
      cloud = cloudData.storeData.default;
    } else {
      // Legacy format - data is directly in cloudData
      cloud = cloudData;
    }

    // Apply cloud data to state
    isLoadingDataRef.current = true;
    
    setAllWeeksData(cloud.sales || {});
    setAllDaysData(cloud.dailySales || {}); // Load daily data
    const today = new Date();
    // Allow current week: week is visible if it has started
    const w = Object.keys(cloud.sales || {}).filter(wk => {
      const weekEnd = new Date(wk + 'T12:00:00');
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 6);
      return weekStart <= today;
    }).sort().reverse();
    if (w.length) { setSelectedWeek(w[0]); }
    
    // SMART INVENTORY MERGE: Cloud save race condition can cause stale cloud inventory
    // (auto-sync saves fresh data to localStorage, but debounced cloud save gets cancelled
    // by other state updates, so cloud can lag behind localStorage)
    // Solution: Compare each snapshot's sync timestamps and keep the newer version
    const cloudInv = cloud.inventory || {};
    let localInv = {};
    try {
      const localInvRaw = lsGet(INVENTORY_KEY);
      if (localInvRaw) localInv = JSON.parse(localInvRaw);
    } catch (e) { /* use empty */ }
    
    const getSnapshotFreshness = (snapshot) => {
      if (!snapshot?.sources) return 0;
      return Math.max(
        new Date(snapshot.sources.lastPackiyoSync || 0).getTime(),
        new Date(snapshot.sources.lastAmazonFbaSync || 0).getTime(),
        new Date(snapshot.sources.lastAmazonSync || 0).getTime(),
        0
      );
    };
    
    const mergedInv = { ...cloudInv };
    let localWins = 0;
    Object.entries(localInv).forEach(([date, localSnapshot]) => {
      const cloudSnapshot = cloudInv[date];
      if (!cloudSnapshot) {
        mergedInv[date] = localSnapshot; // Local has data cloud doesn't
        localWins++;
      } else {
        const localFresh = getSnapshotFreshness(localSnapshot);
        const cloudFresh = getSnapshotFreshness(cloudSnapshot);
        // Also check if local has velocity data that cloud doesn't
        const localHasVelocity = localSnapshot.items?.some(i => (i.weeklyVel || 0) > 0);
        const cloudHasVelocity = cloudSnapshot.items?.some(i => (i.weeklyVel || 0) > 0);
        
        if (localFresh > cloudFresh || (localHasVelocity && !cloudHasVelocity)) {
          mergedInv[date] = localSnapshot;
          localWins++;
        }
      }
    });
    if (localWins > 0) {
      console.log(`[loadFromCloud] Inventory merge: kept ${localWins} newer local snapshots over stale cloud`);
    }
    setInvHistory(mergedInv);
    
    // Also persist merged inventory back to localStorage in case cloud had dates local didn't
    try { writeToLocal(INVENTORY_KEY, JSON.stringify(mergedInv)); } catch (e) { /* non-fatal */ }
    setSavedCogs(cloud.cogs?.lookup || {});
    setCogsLastUpdated(cloud.cogs?.updatedAt || null);
    setAllPeriodsData(cloud.periods || {});
    setStoreName(cloud.storeName || '');
    
    // CRITICAL: Sync the stores array name with the loaded store's actual name
    // This ensures the dropdown shows the correct name for the active store
    if (cloud.storeName && loadedStores.length > 0) {
      const updatedStores = loadedStores.map(s => 
        s.id === targetStoreId ? { ...s, name: cloud.storeName } : s
      );
      // Only update if there's actually a change
      const storeChanged = loadedStores.find(s => s.id === targetStoreId)?.name !== cloud.storeName;
      if (storeChanged) {
        setStores(updatedStores);
      }
    }
    
    if (cloud.storeLogo) setStoreLogo(cloud.storeLogo);
    setSalesTaxConfig(cloud.salesTax || { nexusStates: {}, filingHistory: {}, hiddenStates: [] });
    if (cloud.settings) setAppSettings(prev => ({ ...prev, ...cloud.settings }));
    
    // Load new features from cloud
    if (cloud.invoices) setInvoices(cloud.invoices);
    if (cloud.amazonForecasts) setAmazonForecasts(cloud.amazonForecasts);
    if (cloud.forecastMeta) setForecastMeta(cloud.forecastMeta);
    if (cloud.weekNotes) setWeekNotes(cloud.weekNotes);
    if (cloud.goals) setGoals(cloud.goals);
    if (cloud.productNames) setSavedProductNames(cloud.productNames);
    if (cloud.theme) setTheme(cloud.theme);
    if (cloud.widgetConfig) setWidgetConfig(cloud.widgetConfig);
    if (cloud.productionPipeline) setProductionPipeline(cloud.productionPipeline);
    if (cloud.threeplLedger) setThreeplLedger(cloud.threeplLedger);
    if (cloud.amazonCampaigns) setAmazonCampaigns(cloud.amazonCampaigns);
    if (cloud.adsIntelData) setAdsIntelData(cloud.adsIntelData);
    if (cloud.reportHistory) setReportHistory(cloud.reportHistory);
    if (cloud.actionItems) setActionItems(cloud.actionItems);
    
    // Load self-learning forecast data
    if (cloud.forecastAccuracyHistory) setForecastAccuracyHistory(cloud.forecastAccuracyHistory);
    if (cloud.forecastCorrections) setForecastCorrections(cloud.forecastCorrections);
    if (cloud.returnRates) setReturnRates(cloud.returnRates);
    if (cloud.aiForecasts) setAiForecasts(cloud.aiForecasts);
    if (cloud.leadTimeSettings) setLeadTimeSettings(cloud.leadTimeSettings);
    if (cloud.aiForecastModule) setAiForecastModule(cloud.aiForecastModule);
    if (cloud.aiLearningHistory) setAiLearningHistory(cloud.aiLearningHistory);
    if (cloud.unifiedAIModel) setUnifiedAIModel(cloud.unifiedAIModel);
    if (cloud.weeklyReports) setWeeklyReports(cloud.weeklyReports);
    if (cloud.aiMessages) setAiMessages(cloud.aiMessages);
    if (cloud.bankingData) setBankingData(cloud.bankingData);
    if (cloud.confirmedRecurring) setConfirmedRecurring(cloud.confirmedRecurring);
    // Load credentials from cloud - SEC-003: cloud saves no longer contain secrets
    // Only merge non-secret metadata (connected, lastSync, storeUrl) into existing state
    // Actual API keys/tokens stay in memory from localStorage init
    if (cloud.shopifyCredentials?.connected) {
      setShopifyCredentials(prev => ({
        ...prev,
        connected: cloud.shopifyCredentials.connected,
        lastSync: cloud.shopifyCredentials.lastSync || prev.lastSync,
        storeUrl: cloud.shopifyCredentials.storeUrl || prev.storeUrl,
      }));
    }
    if (cloud.packiyoCredentials?.connected) {
      setPackiyoCredentials(prev => ({
        ...prev,
        connected: cloud.packiyoCredentials.connected,
        lastSync: cloud.packiyoCredentials.lastSync || prev.lastSync,
      }));
    }
    if (cloud.amazonCredentials?.connected || cloud.amazonCredentials?.adsConnected) {
      setAmazonCredentials(prev => ({
        ...prev,
        connected: cloud.amazonCredentials.connected || prev.connected,
        lastSync: cloud.amazonCredentials.lastSync || prev.lastSync,
        sellerId: cloud.amazonCredentials.sellerId || prev.sellerId,
        marketplaceId: cloud.amazonCredentials.marketplaceId || prev.marketplaceId,
        // Restore Ads API metadata (secrets stay in localStorage only)
        adsConnected: cloud.amazonCredentials.adsConnected || prev.adsConnected,
        adsLastSync: cloud.amazonCredentials.adsLastSync || prev.adsLastSync,
        adsProfileId: cloud.amazonCredentials.adsProfileId || prev.adsProfileId,
      }));
    }
    if (cloud.qboCredentials?.connected) {
      setQboCredentials(prev => ({
        ...prev,
        connected: cloud.qboCredentials.connected,
        lastSync: cloud.qboCredentials.lastSync || prev.lastSync,
        realmId: cloud.qboCredentials.realmId || prev.realmId,
      }));
    }

    // Also keep localStorage in sync for offline backup
    writeToLocal(STORAGE_KEY, JSON.stringify(cloud.sales || {}));
    writeToLocal('ecommerce_daily_sales_v1', JSON.stringify(cloud.dailySales || {})); // Daily data localStorage
    writeToLocal(INVENTORY_KEY, JSON.stringify(cloud.inventory || {}));
    writeToLocal(COGS_KEY, JSON.stringify({ lookup: cloud.cogs?.lookup || {}, updatedAt: cloud.cogs?.updatedAt || null }));
    writeToLocal(PERIODS_KEY, JSON.stringify(cloud.periods || {}));
    writeToLocal(STORE_KEY, cloud.storeName || '');
    if (cloud.storeLogo) safeLocalStorageSet('ecommerce_store_logo', cloud.storeLogo);
    writeToLocal(SALES_TAX_KEY, JSON.stringify(cloud.salesTax || { nexusStates: {}, filingHistory: {}, hiddenStates: [] }));
    if (cloud.settings) writeToLocal(SETTINGS_KEY, JSON.stringify(cloud.settings));
    if (cloud.invoices) writeToLocal(INVOICES_KEY, JSON.stringify(cloud.invoices));
    if (cloud.amazonForecasts) writeToLocal(AMAZON_FORECAST_KEY, JSON.stringify(cloud.amazonForecasts));
    if (cloud.forecastMeta) writeToLocal('ecommerce_forecast_meta_v1', JSON.stringify(cloud.forecastMeta));
    if (cloud.weekNotes) writeToLocal(NOTES_KEY, JSON.stringify(cloud.weekNotes));
    if (cloud.goals) writeToLocal(GOALS_KEY, JSON.stringify(cloud.goals));
    if (cloud.productNames) writeToLocal(PRODUCT_NAMES_KEY, JSON.stringify(cloud.productNames));
    if (cloud.theme) writeToLocal(THEME_KEY, JSON.stringify(cloud.theme));
    if (cloud.widgetConfig) writeToLocal('ecommerce_widget_config_v1', JSON.stringify(cloud.widgetConfig));
    if (cloud.productionPipeline) safeLocalStorageSet('ecommerce_production_v1', JSON.stringify(cloud.productionPipeline));
    if (cloud.threeplLedger) writeToLocal(THREEPL_LEDGER_KEY, JSON.stringify(cloud.threeplLedger));
    if (cloud.amazonCampaigns) writeToLocal('ecommerce_amazon_campaigns_v1', JSON.stringify(cloud.amazonCampaigns));
    
    // Sync self-learning forecast data to localStorage
    if (cloud.forecastAccuracyHistory) writeToLocal(FORECAST_ACCURACY_KEY, JSON.stringify(cloud.forecastAccuracyHistory));
    if (cloud.forecastCorrections) writeToLocal(FORECAST_CORRECTIONS_KEY, JSON.stringify(cloud.forecastCorrections));
    if (cloud.returnRates) writeToLocal('ecommerce_return_rates_v1', JSON.stringify(cloud.returnRates));
    if (cloud.aiForecasts) writeToLocal('ecommerce_ai_forecasts_v1', JSON.stringify(cloud.aiForecasts));
    if (cloud.leadTimeSettings) writeToLocal('ecommerce_lead_times_v1', JSON.stringify(cloud.leadTimeSettings));
    if (cloud.aiLearningHistory) writeToLocal('ecommerce_ai_learning_v1', JSON.stringify(cloud.aiLearningHistory));
    if (cloud.unifiedAIModel) writeToLocal('ecommerce_unified_ai_v1', JSON.stringify(cloud.unifiedAIModel));
    if (cloud.weeklyReports) writeToLocal(WEEKLY_REPORTS_KEY, JSON.stringify(cloud.weeklyReports));
    if (cloud.aiMessages && cloud.aiMessages.length > 0) writeToLocal('ecommerce_ai_chat_history_v1', JSON.stringify(cloud.aiMessages));
    if (cloud.bankingData) writeToLocal('ecommerce_banking_v1', JSON.stringify(cloud.bankingData));
    if (cloud.confirmedRecurring) writeToLocal('ecommerce_recurring_v1', JSON.stringify(cloud.confirmedRecurring));
    // SEC-003: Cloud saves no longer contain secrets, so only restore connection status
    // Actual credentials remain in localStorage from the original connection flow
    // Only set connected status if we don't already have full credentials locally
    if (cloud.shopifyCredentials?.connected) {
      const local = JSON.parse(lsGet('ecommerce_shopify_creds_v1') || '{}');
      if (!local.clientSecret && !local.storeUrl) writeToLocal('ecommerce_shopify_creds_v1', JSON.stringify({ ...local, connected: cloud.shopifyCredentials.connected, lastSync: cloud.shopifyCredentials.lastSync }));
    }
    if (cloud.packiyoCredentials?.connected) {
      const local = JSON.parse(lsGet('ecommerce_packiyo_creds_v1') || '{}');
      if (!local.apiKey) writeToLocal('ecommerce_packiyo_creds_v1', JSON.stringify({ ...local, connected: cloud.packiyoCredentials.connected, lastSync: cloud.packiyoCredentials.lastSync }));
    }
    if (cloud.amazonCredentials?.connected || cloud.amazonCredentials?.adsConnected) {
      const local = JSON.parse(lsGet('ecommerce_amazon_creds_v1') || '{}');
      if (!local.refreshToken && !local.adsRefreshToken) {
        writeToLocal('ecommerce_amazon_creds_v1', JSON.stringify({ 
          ...local, 
          connected: cloud.amazonCredentials.connected, 
          lastSync: cloud.amazonCredentials.lastSync,
          adsConnected: cloud.amazonCredentials.adsConnected,
          adsLastSync: cloud.amazonCredentials.adsLastSync,
          adsProfileId: cloud.amazonCredentials.adsProfileId,
        }));
      }
    }
    if (cloud.qboCredentials?.connected) {
      const local = JSON.parse(lsGet('ecommerce_qbo_creds_v1') || '{}');
      if (!local.accessToken) writeToLocal('ecommerce_qbo_creds_v1', JSON.stringify({ ...local, connected: cloud.qboCredentials.connected, lastSync: cloud.qboCredentials.lastSync }));
    }

    setCloudStatus('');
    return { ok: true, reason: 'success', stores: loadedStores };
  } catch (err) {
    devError('Cloud load unexpected error:', err);
    setCloudStatus('');
    return { ok: false, reason: 'error', stores: [] };
  } finally {
    isLoadingDataRef.current = false; setDataLoading(false);
  }
}, [session, writeToLocal]);

// Store management functions
const createStore = useCallback(async (name) => {
  if (!name.trim()) return;
  const newStore = {
    id: `store_${Date.now()}`,
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
  const updatedStores = [...stores, newStore];
  
  // Clear current data for new store - COMPLETE LIST
  const emptyData = {
    sales: {},
    dailySales: {},
    inventory: {},
    cogs: { lookup: {}, updatedAt: null },
    periods: {},
    storeName: name.trim(),
    storeLogo: '',
    salesTax: { nexusStates: {}, hiddenStates: [], filingHistory: {} },
    settings: appSettings,
    invoices: [],
    amazonForecasts: {},
    forecastMeta: { lastUploads: {}, history: [] },
    weekNotes: {},
    goals,
    productNames: {},
    theme,
    widgetConfig: null,
    productionPipeline: [],
    threeplLedger: { orders: [], importedFiles: [], summaryCharges: {} },
    amazonCampaigns: { campaigns: [], history: [], lastUpdated: null },
    forecastAccuracyHistory: { records: [], lastUpdated: null, modelVersion: '1.0' },
    forecastCorrections: { overall: { revenue: 1, units: 1, profit: 1 }, bySku: {}, byMonth: {}, byQuarter: {}, confidence: 0, samplesUsed: 0 },
    aiForecasts: {},
    leadTimeSettings: {},
    aiForecastModule: null,
    aiLearningHistory: { predictions: [], modelUpdates: [] },
    weeklyReports: {},
    aiMessages: [],
    // Banking data for new store
    bankingData: {
      transactions: [],
      accounts: {},
      categories: {},
      monthlySnapshots: {},
      dateRange: null,
      transactionCount: 0,
      lastUpload: null,
      categoryOverrides: {},
      settings: {},
    },
    // Shopify credentials for new store
    shopifyCredentials: { storeUrl: '', clientId: '', clientSecret: '', connected: false, lastSync: null },
    // Packiyo 3PL credentials for new store
    packiyoCredentials: { apiKey: '', customerId: '134', baseUrl: 'https://excel3pl.packiyo.com/api/v1', connected: false, lastSync: null, customerName: '' },
    // Amazon SP-API credentials for new store
    amazonCredentials: { clientId: '', clientSecret: '', refreshToken: '', sellerId: '', marketplaceId: 'ATVPDKIKX0DER', connected: false, lastSync: null, adsClientId: '', adsClientSecret: '', adsRefreshToken: '', adsProfileId: '', adsConnected: false, adsLastSync: null },
  };
  
  // Save to cloud immediately with the new stores list
  if (supabase && session?.user?.id) {
    setCloudStatus('Creating store…');
    try {
      // Get existing data first
      const { data: existingData } = await supabase
        .from('app_data')
        .select('data')
        .eq('user_id', session.user.id)
        .maybeSingle();
      
      const payload = {
        user_id: session.user.id,
        data: {
          stores: updatedStores,
          activeStoreId: newStore.id,
          storeData: {
            ...(existingData?.data?.storeData || {}),
            [newStore.id]: emptyData
          }
        },
        updated_at: new Date().toISOString(),
      };
      
      const { error } = await supabase.from('app_data').upsert(payload, { onConflict: 'user_id' });
      if (error) throw error;
      
      setCloudStatus('Store created');
      setTimeout(() => setCloudStatus(''), 1500);
    } catch (err) {
      devError('Failed to save new store:', err);
      setCloudStatus('Save failed');
    }
  }
  
  // Update local state - COMPLETE LIST
  setStores(updatedStores);
  setActiveStoreId(newStore.id);
  setNewStoreName('');
  setAllWeeksData({});
  setAllDaysData({});
  setAllPeriodsData({});
  setInvHistory({});
  setStoreName(name.trim());
  setInvoices([]);
  setAmazonForecasts({});
  setThreeplLedger({ orders: [], importedFiles: [], summaryCharges: {} });
  setSavedCogs({});
  setSavedProductNames({});
  setStoreLogo('');
  setBankingData({
    transactions: [],
    accounts: {},
    categories: {},
    monthlySnapshots: {},
    dateRange: null,
    transactionCount: 0,
    lastUpload: null,
    categoryOverrides: {},
    settings: {},
  });
  setForecastCorrections({ overall: { revenue: 1, units: 1, profit: 1 }, bySku: {}, byMonth: {}, byQuarter: {}, confidence: 0, samplesUsed: 0 });
  setAiLearningHistory({ predictions: [], modelUpdates: [] });
  setAiMessages([]);
  setWeeklyReports({});
  
  setToast({ message: `Created store "${name}"`, type: 'success' });
  setShowStoreSelector(false);
  setShowStoreModal(false);
}, [stores, session, appSettings, goals, theme]);

const switchStore = useCallback(async (storeId) => {
  if (storeId === activeStoreId) {
    setShowStoreSelector(false);
    setShowStoreModal(false);
    return;
  }
  
  // Save current store first
  await pushToCloudNow(combinedData);
  
  // Load new store - this will also set activeStoreId and sync storeName
  await loadFromCloud(storeId);
  
  // Get the store name (loadFromCloud will have synced it)
  const store = stores.find(s => s.id === storeId);
  setToast({ message: `Switched to "${store?.name || storeName || 'store'}"`, type: 'success' });
  setShowStoreSelector(false);
  setShowStoreModal(false);
}, [activeStoreId, stores, combinedData, pushToCloudNow, loadFromCloud, storeName]);

const deleteStore = useCallback(async (storeId) => {
  const store = stores.find(s => s.id === storeId);
  if (!store) {
    setToast({ message: 'Store not found', type: 'error' });
    return;
  }
  
  // Use window.confirm to ensure it works
  const confirmed = window.confirm(`Delete store "${store.name}"? All data will be permanently lost.`);
  if (!confirmed) return;
  
  // If this is the last store, create a new empty one
  let updatedStores = stores.filter(s => s.id !== storeId);
  let newActiveId;
  
  if (updatedStores.length === 0) {
    // Create a fresh default store
    const newStore = {
      id: `store_${Date.now()}`,
      name: 'My Store',
      createdAt: new Date().toISOString(),
    };
    updatedStores = [newStore];
    newActiveId = newStore.id;
  } else {
    newActiveId = storeId === activeStoreId ? updatedStores[0].id : activeStoreId;
  }
  
  // Update local state first
  setStores(updatedStores);
  setActiveStoreId(newActiveId);
  
  // Clear all data for fresh start if last store was deleted
  if (stores.length === 1) {
    // Reset all state to defaults
    setAllWeeksData({});
    setAllDaysData({});
    setInvHistory({});
    setAllPeriodsData({});
    setBankingData({
      transactions: [],
      lastUpload: null,
      accounts: {},
      categories: {},
      monthlySnapshots: {},
      categoryOverrides: {},
      settings: { reminderEnabled: true, reminderTime: '09:00' }
    });
    // Clear localStorage
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('ecommerce_')) {
        localStorage.removeItem(key);
      }
    });
  }
  
  // Save updated stores list to cloud
  if (supabase && session?.user?.id) {
    try {
      const { data: existingData } = await supabase
        .from('app_data')
        .select('data')
        .eq('user_id', session.user.id)
        .maybeSingle();
      
      // Remove deleted store's data and update stores list
      const storeData = { ...(existingData?.data?.storeData || {}) };
      delete storeData[storeId];
      
      const payload = {
        user_id: session.user.id,
        data: {
          stores: updatedStores,
          activeStoreId: newActiveId,
          storeData
        },
        updated_at: new Date().toISOString(),
      };
      
      await supabase.from('app_data').upsert(payload, { onConflict: 'user_id' });
    } catch (err) {
      devError('Failed to delete store from cloud:', err);
      setToast({ message: 'Deleted locally but cloud sync failed', type: 'warning' });
      return;
    }
  }
  
  // Load new store data if we switched
  if (storeId === activeStoreId && updatedStores.length > 0) {
    await loadFromCloud(newActiveId);
  }
  
  audit('store_delete', store.name); setToast({ message: `Deleted store "${store.name}"`, type: 'success' });
}, [stores, activeStoreId, loadFromCloud, session]);

// Store Selector Modal - Now extracted to StoreSelectorModal component

// Set up auth + initial load
useEffect(() => {
  let unsub = null;
  const boot = async () => {
    if (!supabase) {
      setIsAuthReady(true);
      loadFromLocal();
      return;
    }

    try {
    const { data } = await supabase.auth.getSession();
    const initialSession = data?.session || null;
    
    // Track initial user ID
    if (initialSession?.user?.id) {
      const lastUserId = localStorage.getItem('ecommerce_last_user_id');
      if (lastUserId && lastUserId !== initialSession.user.id) {
        // Different user - clear localStorage (but keep credentials and theme)
        const keysToKeep = ['ecommerce_theme', 'ecommerce_last_user_id',
          'ecommerce_shopify_creds_v1', 'ecommerce_packiyo_creds_v1',
          'ecommerce_amazon_creds_v1', 'ecommerce_qbo_creds_v1'];
        Object.keys(localStorage).filter(k => k.startsWith('ecommerce_')).forEach(k => {
          if (!keysToKeep.includes(k)) localStorage.removeItem(k);
        });
      }
      localStorage.setItem('ecommerce_last_user_id', initialSession.user.id);
    }
    
    setSession(initialSession);

    unsub = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Check if user changed - clear localStorage if different user logs in
      const lastUserId = localStorage.getItem('ecommerce_last_user_id');
      const newUserId = nextSession?.user?.id;
      
      if (newUserId && lastUserId && newUserId !== lastUserId) {
        // Different user logging in - clear previous user's localStorage (keep credentials)
        const keysToKeep = ['ecommerce_theme', 'ecommerce_last_user_id',
          'ecommerce_shopify_creds_v1', 'ecommerce_packiyo_creds_v1',
          'ecommerce_amazon_creds_v1', 'ecommerce_qbo_creds_v1'];
        const allKeys = Object.keys(localStorage).filter(k => k.startsWith('ecommerce_'));
        allKeys.forEach(k => {
          if (!keysToKeep.includes(k)) {
            localStorage.removeItem(k);
          }
        });
      }
      
      // Track current user
      if (newUserId) {
        localStorage.setItem('ecommerce_last_user_id', newUserId);
      } else {
        localStorage.removeItem('ecommerce_last_user_id');
      }
      
      setSession(nextSession);
    }).data?.subscription;

    setIsAuthReady(true);
    } catch (bootErr) {
      // CORS or network failure - fall back to localStorage so app isn't stuck
      console.warn('[Boot] Supabase auth failed (CORS/network), falling back to localStorage:', bootErr.message || bootErr);
      setSession(null);
      setIsAuthReady(true);
      loadFromLocal();
    }
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
const hasInitializedRef = useRef(false);
const lastSessionIdRef = useRef(null);

useEffect(() => {
  // Reset initialization flag when user changes (new login, logout, etc.)
  if (session?.user?.id !== lastSessionIdRef.current) {
    hasInitializedRef.current = false;
    lastSessionIdRef.current = session?.user?.id || null;
  }
  
  // Only run once per session
  if (hasInitializedRef.current && session?.user?.id) return;
  
  const run = async () => {
    if (!isAuthReady) return;
    if (isLoadingDataRef.current) return; // Prevent concurrent loads
    
    isLoadingDataRef.current = true;
    hasInitializedRef.current = true;
    
    try {
      if (session?.user?.id && supabase) {
        const result = await loadFromCloud();
        if (!result.ok) {
          // Check the reason - only initialize empty state for truly new users
          if (result.reason === 'no_data') {
            // NEW USER: No cloud data yet - start with clean slate
            
            // Clear any existing state to ensure clean start
            setAllWeeksData({});
            setAllDaysData({});
            setInvHistory({});
            setSavedCogs({});
            setCogsLastUpdated(null);
            setAllPeriodsData({});
            setStoreName('');
            setStoreLogo('');
            setSalesTaxConfig({ nexusStates: {}, filingHistory: {}, hiddenStates: [] });
            setInvoices([]);
            setAmazonForecasts({});
            setForecastMeta({ lastUploads: { '7day': null, '30day': null, '60day': null }, history: [] });
            setWeekNotes({});
            setGoals({ weeklyRevenue: 0, monthlyRevenue: 0, weeklyProfit: 0, monthlyProfit: 0 });
            setSavedProductNames({});
            setProductionPipeline([]);
            setThreeplLedger({ orders: {}, weeklyTotals: {} });
            setAmazonCampaigns({ campaigns: [], lastUpdated: null, history: [] });
            setReturnRates({ overall: {}, bySku: {}, byMonth: {}, byWeek: {} });
            setLeadTimeSettings({ defaultLeadTimeDays: 14, skuLeadTimes: {}, reorderBuffer: 7 });
            setBankingData({ transactions: [], accounts: {}, categories: {}, monthlySnapshots: {} });
            setConfirmedRecurring([]);
            // Also reset AI forecast states
            setAiForecasts(null);
            setAiForecastModule({ salesForecast: null, inventoryPlan: null, lastUpdated: null, loading: null, error: null });
            setAiLearningHistory({ predictions: [], outcomes: [], modelUpdates: [] });
            setUnifiedAIModel(null);
            setForecastAccuracyHistory({ records: [], lastUpdated: null, modelVersion: 1 });
            setForecastCorrections({ overall: { revenue: 1.0, units: 1.0, profit: 1.0 }, bySku: {}, byMonth: {}, byQuarter: {}, confidence: 0, samplesUsed: 0, lastUpdated: null });
            setWidgetConfig({});
            setWeeklyReports({});
            setAiMessages([]);
            setAdsAiMessages([]);
            setShopifyCredentials({ storeUrl: '', clientId: '', clientSecret: '', connected: false, lastSync: null });
            setPackiyoCredentials({ apiKey: '', customerId: '134', baseUrl: 'https://excel3pl.packiyo.com/api/v1', connected: false, lastSync: null, customerName: '' });
            setAppSettings({
              inventoryDaysOptimal: 60, inventoryDaysLow: 30, inventoryDaysCritical: 14,
              tacosOptimal: 15, tacosWarning: 25, tacosMax: 35, roasTarget: 3.0,
              marginTarget: 25, marginWarning: 15,
              modulesEnabled: { weeklyTracking: true, periodTracking: true, inventory: true, trends: true, yoy: true, skus: true, profitability: true, ads: true, threepl: true, salesTax: true },
              dashboardDefaultRange: 'month', showWeeklyGoals: true, showMonthlyGoals: true,
              alertSalesTaxDays: 7, alertInventoryEnabled: true,
            });
            setLastBackupDate(null);
            setLastSyncDate(null);
            setLoadedCloudVersion(null);
            setShowConflictModal(false);
            setConflictData(null);
            
            // Create default store for new user
            const defaultStore = {
              id: `store_${Date.now()}`,
              name: 'My Store',
              createdAt: new Date().toISOString(),
            };
            setStores([defaultStore]);
            setActiveStoreId(defaultStore.id);
            
            // Push empty state to cloud so they have a record
            await pushToCloudNow({
              sales: {},
              dailySales: {},
              inventory: {},
              cogs: { lookup: {}, updatedAt: null },
              periods: {},
              storeName: '',
            });
          } else {
            // ERROR loading data - do NOT overwrite cloud! Just show error and retry
            devError('Error loading cloud data - NOT overwriting. Reason:', result.reason);
            setCloudStatus('Load failed - please refresh');
            // Try loading from localStorage as fallback for display only
            loadFromLocal();
          }
        } else {
          // Existing user with cloud data - loaded successfully
          // Create default store if loaded data has no stores
          if (result.stores.length === 0) {
            const defaultStore = {
              id: 'default',
              name: storeName || 'My Store',
              createdAt: new Date().toISOString(),
            };
            setStores([defaultStore]);
            setActiveStoreId(defaultStore.id);
          }
        }
      } else {
        // No session (anonymous user) - use localStorage
        loadFromLocal();
      }
    } finally {
      isLoadingDataRef.current = false; setDataLoading(false);
    }
  };

  run();
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [session, isAuthReady]);

const save = async (d) => {
  try {
    writeToLocal(STORAGE_KEY, JSON.stringify(d));
    setShowSaveConfirm(true);
    setTimeout(() => setShowSaveConfirm(false), 2000);
    queueCloudSave({ ...combinedData, sales: d });
  } catch (e) { devError("[error]", e); }
};

const saveInv = async (d) => {
  try {
    writeToLocal(INVENTORY_KEY, JSON.stringify(d));
    setShowSaveConfirm(true);
    setTimeout(() => setShowSaveConfirm(false), 2000);
    queueCloudSave({ ...combinedData, inventory: d });
  } catch (e) { devError("[error]", e); }
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
  } catch (e) { devError("[error]", e); }
};

// Save generated report to history (called by report modals)
const saveReportToHistory = useCallback((report) => {
  const entry = {
    id: `report_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    generatedAt: new Date().toISOString(),
    type: report.type || 'unknown', // 'amazon' | 'dtc'
    content: report.content || '',
    contentHtml: report.contentHtml || '',
    model: report.model || '',
    metrics: report.metrics || {},
  };
  const updated = [entry, ...(reportHistory || [])].slice(0, 50); // Keep last 50
  setReportHistory(updated);
  try { lsSet('ecommerce_report_history_v1', JSON.stringify(updated)); } catch (e) { if (e?.message) devWarn("[catch]", e.message); }
  queueCloudSave({ ...combinedData, reportHistory: updated });
  return entry;
}, [reportHistory, combinedData, queueCloudSave]);

const savePeriods = async (d) => {
  try {
    writeToLocal(PERIODS_KEY, JSON.stringify(d));
    setShowSaveConfirm(true);
    setTimeout(() => setShowSaveConfirm(false), 2000);
    queueCloudSave({ ...combinedData, periods: d });
  } catch (e) { devError("[error]", e); }
};

  const handleFile = useCallback(async (type, file, isInv = false) => {
    if (!file) return;
    
    // Check if it's an Excel file (for 3PL)
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    
    if (type === 'threepl' && isExcel) {
      // Parse Excel file for 3PL - extract Summary sheet
      try {
        const xlsx = await loadXLSX();
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target.result);
            const workbook = xlsx.read(data, { type: 'array' });
            
            // Look for Summary sheet
            if (workbook.SheetNames.includes('Summary')) {
              const summarySheet = workbook.Sheets['Summary'];
              const rows = xlsx.utils.sheet_to_json(summarySheet);
              setFiles(p => ({ ...p, threepl: [...(p.threepl || []), rows] }));
              setFileNames(p => ({ ...p, threepl: [...(p.threepl || []), file.name] }));
              setToast({ message: `Loaded ${rows.length} 3PL charges from Excel`, type: 'success' });
            } else {
              // Try first sheet as fallback
              const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
              const rows = xlsx.utils.sheet_to_json(firstSheet);
              setFiles(p => ({ ...p, threepl: [...(p.threepl || []), rows] }));
              setFileNames(p => ({ ...p, threepl: [...(p.threepl || []), file.name] }));
              setToast({ message: `Loaded ${rows.length} rows from 3PL Excel`, type: 'success' });
            }
          } catch (err) {
            devError('Error parsing 3PL Excel:', err);
            setToast({ message: 'Error parsing 3PL Excel file', type: 'error' });
          }
        };
        reader.readAsArrayBuffer(file);
      } catch (err) {
        devError('Error loading SheetJS:', err);
        setToast({ message: 'Error loading Excel parser', type: 'error' });
      }
      return;
    }
    
    // Regular CSV handling
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

  const handlePeriodFile = useCallback(async (type, file) => {
    if (!file) return;
    
    // Check if it's an Excel file (for 3PL)
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    
    if (type === 'threepl' && isExcel) {
      try {
        const xlsx = await loadXLSX();
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target.result);
            const workbook = xlsx.read(data, { type: 'array' });
            
            if (workbook.SheetNames.includes('Summary')) {
              const summarySheet = workbook.Sheets['Summary'];
              const rows = xlsx.utils.sheet_to_json(summarySheet);
              setPeriodFiles(p => ({ ...p, threepl: [...(p.threepl || []), rows] }));
              setPeriodFileNames(p => ({ ...p, threepl: [...(p.threepl || []), file.name] }));
              setToast({ message: `Loaded ${rows.length} 3PL charges from Excel`, type: 'success' });
            } else {
              const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
              const rows = xlsx.utils.sheet_to_json(firstSheet);
              setPeriodFiles(p => ({ ...p, threepl: [...(p.threepl || []), rows] }));
              setPeriodFileNames(p => ({ ...p, threepl: [...(p.threepl || []), file.name] }));
              setToast({ message: `Loaded ${rows.length} rows from 3PL Excel`, type: 'success' });
            }
          } catch (err) {
            devError('Error parsing 3PL Excel:', err);
            setToast({ message: 'Error parsing 3PL Excel file', type: 'error' });
          }
        };
        reader.readAsArrayBuffer(file);
      } catch (err) {
        devError('Error loading SheetJS:', err);
      }
      return;
    }
    
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

  const handleReprocessFile = useCallback(async (type, file) => {
    if (!file) return;
    
    // Check if it's an Excel file (for 3PL)
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    
    if (type === 'threepl' && isExcel) {
      try {
        const xlsx = await loadXLSX();
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target.result);
            const workbook = xlsx.read(data, { type: 'array' });
            
            if (workbook.SheetNames.includes('Summary')) {
              const summarySheet = workbook.Sheets['Summary'];
              const rows = xlsx.utils.sheet_to_json(summarySheet);
              setReprocessFiles(p => ({ ...p, [type]: rows }));
              setReprocessFileNames(p => ({ ...p, [type]: file.name }));
              setToast({ message: `Loaded ${rows.length} charges from 3PL Excel`, type: 'success' });
            } else {
              const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
              const rows = xlsx.utils.sheet_to_json(firstSheet);
              setReprocessFiles(p => ({ ...p, [type]: rows }));
              setReprocessFileNames(p => ({ ...p, [type]: file.name }));
              setToast({ message: `Loaded ${rows.length} rows from 3PL Excel`, type: 'success' });
            }
          } catch (err) {
            devError('Error parsing 3PL Excel:', err);
            setToast({ message: 'Error parsing 3PL Excel file', type: 'error' });
          }
        };
        reader.readAsArrayBuffer(file);
      } catch (err) {
        devError('Error loading SheetJS:', err);
      }
      return;
    }
    
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
    if (!reprocessFiles.amazon || !reprocessFiles.shopify) { setToast({ message: 'Upload Amazon & Shopify files first', type: 'error' }); return; }
    if (Object.keys(cogsLookup).length === 0) { setToast({ message: 'Set up COGS first via Store → COGS', type: 'error' }); return; }

    let amzRev = 0, amzUnits = 0, amzRet = 0, amzProfit = 0, amzCogs = 0, amzFees = 0, amzAds = 0;
    const amazonSkuData = {};
    reprocessFiles.amazon.forEach(r => {
      const net = parseInt(r['Net units sold'] || 0), sold = parseInt(r['Units sold'] || 0), ret = parseInt(r['Units returned'] || 0);
      const sales = parseFloat(r['Net sales'] || 0), proceeds = parseFloat(r['Net proceeds total'] || 0), sku = r['MSKU'] || '';
      const fees = parseFloat(r['FBA fulfillment fees total'] || 0) + parseFloat(r['Referral fee total'] || 0) + parseFloat(r['AWD Storage Fee total'] || 0);
      const ads = parseFloat(r['Sponsored Products charge total'] || 0);
      const name = r['Product title'] || r['product-name'] || sku;
      if (net !== 0 || sold > 0 || ret > 0 || sales !== 0 || proceeds !== 0) { 
        amzRev += sales; amzUnits += sold; amzRet += ret; amzProfit += proceeds; amzFees += fees; amzAds += ads; // COGS already in Net proceeds - do NOT add from lookup
        if (sku) {
          if (!amazonSkuData[sku]) amazonSkuData[sku] = { sku, name, unitsSold: 0, returns: 0, netSales: 0, netProceeds: 0, adSpend: 0, cogs: 0 };
          amazonSkuData[sku].unitsSold += sold;
          amazonSkuData[sku].returns += ret;
          amazonSkuData[sku].netSales += sales;
          amazonSkuData[sku].netProceeds += proceeds;
          amazonSkuData[sku].adSpend += ads;
          // COGS already in Net proceeds - per-SKU cogs derived below
        }
      }
    });

    let shopRev = 0, shopUnits = 0, shopCogs = 0, shopDisc = 0;
    const shopifySkuData = {};
    reprocessFiles.shopify.forEach(r => {
      const units = parseInt(r['Net items sold'] || r['Net quantity'] || 0);
      const grossSales = parseFloat(r['Gross sales'] || 0);
      const netSales = parseFloat(r['Net sales'] || 0);
      const sales = grossSales > 0 ? grossSales : netSales;
      const sku = r['Product variant SKU'] || '';
      const name = r['Product title'] || r['Product'] || sku;
      const disc = Math.abs(parseFloat(r['Discounts'] || 0));
      const returns = Math.abs(parseFloat(r['Returns'] || 0));
      shopRev += sales; shopUnits += units; shopCogs += (cogsLookup[sku] || 0) * units; shopDisc += disc;
      if (sku && (units > 0 || sales !== 0)) {
        if (!shopifySkuData[sku]) shopifySkuData[sku] = { sku, name, unitsSold: 0, netSales: 0, grossSales: 0, discounts: 0, returns: 0, cogs: 0 };
        shopifySkuData[sku].unitsSold += units;
        shopifySkuData[sku].netSales += netSales;
        shopifySkuData[sku].grossSales += sales;
        shopifySkuData[sku].discounts += disc;
        shopifySkuData[sku].returns += returns;
        shopifySkuData[sku].cogs += (cogsLookup[sku] || 0) * units;
      }
    });

    // Use enhanced 3PL parser
    const threeplData = parse3PLData(reprocessFiles.threepl);
    const threeplBreakdown = threeplData.breakdown;
    const threeplMetrics = threeplData.metrics;
    
    // Separate storage from fulfillment costs
    const storageCost = threeplBreakdown.storage || 0;
    const fulfillmentCost = threeplData.metrics.totalCost - storageCost;
    
    // Storage allocation: proportional by revenue OR to total (not just Shopify)
    const totalRev = amzRev + shopRev;
    const shopifyShare = totalRev > 0 ? shopRev / totalRev : 1;
    const amazonShare = totalRev > 0 ? amzRev / totalRev : 0;
    
    // Storage cost allocation based on settings
    const storageAlloc = leadTimeSettings.storageCostAllocation || 'proportional';
    let shopStorageCost = 0;
    let amzStorageCost = 0;
    
    if (storageAlloc === 'shopify') {
      // Legacy: all storage to Shopify (not recommended)
      shopStorageCost = storageCost;
    } else if (storageAlloc === 'proportional') {
      // Split by revenue share
      shopStorageCost = storageCost * shopifyShare;
      amzStorageCost = storageCost * amazonShare;
    }
    // 'total' = storage shown separately, not deducted from either channel
    
    const metaS = parseFloat(reprocessAdSpend.meta) || 0, googleS = parseFloat(reprocessAdSpend.google) || 0, shopAds = metaS + googleS;
    
    // Shopify profit: fulfillment cost + proportional storage (if not 'total' mode)
    const shopThreeplCost = fulfillmentCost + (storageAlloc !== 'total' ? shopStorageCost : 0);
    // shopRev is Gross sales, so subtract discounts to get net profit
    const shopProfit = shopRev - shopDisc - shopCogs - shopThreeplCost - shopAds;
    
    // Adjust Amazon profit for storage share (if proportional)
    const adjustedAmzProfit = storageAlloc === 'proportional' ? amzProfit - amzStorageCost : amzProfit;
    
    const totalProfit = adjustedAmzProfit + shopProfit - (storageAlloc === 'total' ? storageCost : 0);
    // Derive Amazon COGS from SKU Economics report (already embedded in Net proceeds)
    // amzProfit = Net proceeds total = Net sales - fees - ads - COGS
    amzCogs = Math.max(0, amzRev - amzFees - amzAds - amzProfit);
    // Derive per-SKU COGS from report data
    Object.values(amazonSkuData).forEach(s => { s.cogs = Math.max(0, (s.netSales || 0) - (s.netProceeds || 0) - (s.adSpend || 0)); });
    const totalCogs = amzCogs + shopCogs;

    const amazonSkus = Object.values(amazonSkuData).sort((a, b) => b.netSales - a.netSales);
    const shopifySkus = Object.values(shopifySkuData).sort((a, b) => b.netSales - a.netSales);

    const weekData = {
      weekEnding: weekKey, createdAt: new Date().toISOString(),
      amazon: { revenue: amzRev, units: amzUnits, returns: amzRet, cogs: amzCogs, fees: amzFees, adSpend: amzAds, 
        storageCost: amzStorageCost, // Proportional storage share
        netProfit: adjustedAmzProfit, 
        margin: amzRev > 0 ? (adjustedAmzProfit/amzRev)*100 : 0, aov: amzUnits > 0 ? amzRev/amzUnits : 0, roas: amzAds > 0 ? amzRev/amzAds : 0,
        returnRate: amzUnits > 0 ? (amzRet/amzUnits)*100 : 0, skuData: amazonSkus, source: 'sku-economics' },
      shopify: { revenue: shopRev, units: shopUnits, cogs: shopCogs, 
        threeplCosts: shopThreeplCost, // Fulfillment + proportional storage
        fulfillmentCost, storageCost: shopStorageCost, // Breakdown for display
        threeplBreakdown, threeplMetrics, adSpend: shopAds, metaSpend: metaS, googleSpend: googleS, discounts: shopDisc, netProfit: shopProfit, 
        netMargin: shopRev > 0 ? (shopProfit/shopRev)*100 : 0, aov: shopUnits > 0 ? shopRev/shopUnits : 0, roas: shopAds > 0 ? shopRev/shopAds : 0, skuData: shopifySkus },
      total: { revenue: totalRev, units: amzUnits + shopUnits, cogs: totalCogs, adSpend: amzAds + shopAds, 
        storageCost, storageCostAllocation: storageAlloc, // Total storage and method
        netProfit: totalProfit, netMargin: totalRev > 0 ? (totalProfit/totalRev)*100 : 0, roas: (amzAds + shopAds) > 0 ? totalRev/(amzAds + shopAds) : 0, 
        amazonShare: totalRev > 0 ? (amzRev/totalRev)*100 : 0, shopifyShare: totalRev > 0 ? (shopRev/totalRev)*100 : 0 }
    };

    const updated = { ...allWeeksData, [weekKey]: weekData };
    setAllWeeksData(updated); save(updated);
    setShowReprocess(false);
    setReprocessFiles({ amazon: null, shopify: null, threepl: null });
    setReprocessFileNames({ amazon: '', shopify: '', threepl: '' });
    setReprocessAdSpend({ meta: '', google: '' });
    } catch (err) {
      devError('Reprocess error:', err);
      setToast({ message: 'Error reprocessing: ' + err.message, type: 'error' });
    }
  }, [reprocessFiles, reprocessAdSpend, allWeeksData, savedCogs]);

  const getCogsLookup = useCallback(() => {
    const lookup = { ...savedCogs };
    if (files.cogs) files.cogs.forEach(r => { const s = r['SKU'] || r['sku']; const c = parseFloat(r['Cost Per Unit'] || 0); if (s && c) lookup[s] = c; });
    return lookup;
  }, [savedCogs, files.cogs]);

  // Normalize SKU keys and support common variants (e.g. SKU vs SKUShop) for consistent cost lookups
  const getCogsCost = useCallback((rawSku) => {
    const sku = (rawSku || '').toString().trim();
    if (!sku) return 0;

    const pick = (k) => {
      const v = savedCogs[k];
      if (typeof v === 'number') return v;
      if (v && typeof v.cost === 'number') return v.cost;
      return 0;
    };

    let c = pick(sku);
    if (c) return c;

    const compact = sku.replace(/\s+/g, '');
    c = pick(compact);
    if (c) return c;

    const base = compact.replace(/shop$/i, '');
    const candidates = [
      base,
      base + 'Shop',
      base.toUpperCase(),
      (base + 'Shop').toUpperCase(),
      base.toLowerCase(),
      (base + 'Shop').toLowerCase(),
    ];

    for (const k of candidates) {
      c = pick(k);
      if (c) return c;
    }
    return 0;
  }, [savedCogs]);


  const processAndSaveCogs = useCallback(() => {
    if (!files.cogs) return;
    const lookup = {};
    const names = {};

    const upsert = (rawSku, cost, name) => {
      const sku = (rawSku || '').toString().trim();
      if (!sku) return;
      const c = typeof cost === 'number' ? cost : parseFloat(cost || 0);
      if (!(c > 0)) return;

      const compact = sku.replace(/\s+/g, '');
      const base = compact.replace(/shop$/i, '');

      // Store multiple keys to maximize match rate across feeds
      const keys = new Set([
        sku,
        compact,
        base,
        base + 'Shop',
        sku.toUpperCase(),
        sku.toLowerCase(),
        compact.toUpperCase(),
        compact.toLowerCase(),
      ]);

      keys.forEach(k => { if (k) lookup[k] = c; });

      if (name) {
        const n = name.toString().trim();
        if (n) {
          names[sku] = n;
          names[compact] = n;
          names[base] = n;
          names[base + 'Shop'] = n;
        }
      }
    };

    files.cogs.forEach(r => {
      const s = r['SKU'] || r['sku'] || r['Sku'] || '';
      const c = parseFloat(r['Cost Per Unit'] || r['cost per unit'] || r['COGS'] || r['Cost'] || 0);
      const name = r['Product Name'] || r['Product Name '] || r['product name'] || r['Name'] || r['name'] || '';
      upsert(s, c, name);
    });

    saveCogs(lookup);
    setSavedProductNames(names);
    try { safeLocalStorageSet(PRODUCT_NAMES_KEY, JSON.stringify(names)); } catch (e) { if (e?.message) devWarn("[catch]", e.message); }
    setFiles(p => ({ ...p, cogs: null }));
    setFileNames(p => ({ ...p, cogs: '' }));
    setShowCogsManager(false);
  }, [files.cogs, saveCogs]);

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
  const processSales = useCallback(() => {
    const cogsLookup = getCogsLookup();
    if (!weekEnding) { setToast({ message: 'Please select a week ending date', type: 'error' }); return; }
    if (!files.amazon && !files.shopify) { setToast({ message: 'Upload at least one data file (Amazon or Shopify)', type: 'error' }); return; }
    
    // COGS is optional - just warn but proceed
    const noCogs = Object.keys(cogsLookup).length === 0;
    
    // Validate data before processing
    const amazonValidation = files.amazon ? validateUploadData('amazon', files.amazon) : { warnings: [], errors: [] };
    const shopifyValidation = files.shopify ? validateUploadData('shopify', files.shopify) : { warnings: [], errors: [] };
    const allWarnings = [...amazonValidation.warnings, ...amazonValidation.errors, ...shopifyValidation.warnings, ...shopifyValidation.errors];
    
    if (noCogs) {
      allWarnings.push({ type: 'warning', message: 'No COGS configured - profit calculations will be incomplete' });
    }
    
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
    (files.amazon || []).forEach(r => {
      const net = parseInt(r['Net units sold'] || 0), sold = parseInt(r['Units sold'] || 0), ret = parseInt(r['Units returned'] || 0);
      const sales = parseFloat(r['Net sales'] || 0), proceeds = parseFloat(r['Net proceeds total'] || 0), sku = r['MSKU'] || '';
      const fees = parseFloat(r['FBA fulfillment fees total'] || 0) + parseFloat(r['Referral fee total'] || 0) + parseFloat(r['AWD Storage Fee total'] || 0);
      const ads = parseFloat(r['Sponsored Products charge total'] || 0);
      const name = r['Product title'] || r['product-name'] || sku;
      if (net !== 0 || sold > 0 || ret > 0 || sales !== 0 || proceeds !== 0) { 
        amzRev += sales; amzUnits += sold; amzRet += ret; amzProfit += proceeds; amzFees += fees; amzAds += ads; // COGS already in Net proceeds - do NOT add from lookup
        if (sku) {
          if (!amazonSkuData[sku]) amazonSkuData[sku] = { sku, name, unitsSold: 0, returns: 0, netSales: 0, netProceeds: 0, adSpend: 0, cogs: 0 };
          amazonSkuData[sku].unitsSold += sold;
          amazonSkuData[sku].returns += ret;
          amazonSkuData[sku].netSales += sales;
          amazonSkuData[sku].netProceeds += proceeds;
          amazonSkuData[sku].adSpend += ads;
          // COGS already in Net proceeds - per-SKU cogs derived below
        }
      }
    });

    let shopRev = 0, shopUnits = 0, shopCogs = 0, shopDisc = 0;
    const shopifySkuData = {};
    (files.shopify || []).forEach(r => {
      const units = parseInt(r['Net items sold'] || r['Net quantity'] || 0);
      const grossSales = parseFloat(r['Gross sales'] || 0);
      const netSales = parseFloat(r['Net sales'] || 0);
      const sales = grossSales > 0 ? grossSales : netSales;
      const sku = r['Product variant SKU'] || '';
      const name = r['Product title'] || r['Product'] || sku;
      const disc = Math.abs(parseFloat(r['Discounts'] || 0));
      const returns = Math.abs(parseFloat(r['Returns'] || 0));
      shopRev += sales; shopUnits += units; shopCogs += (cogsLookup[sku] || 0) * units; shopDisc += disc;
      if (sku && (units > 0 || sales !== 0)) {
        if (!shopifySkuData[sku]) shopifySkuData[sku] = { sku, name, unitsSold: 0, netSales: 0, grossSales: 0, discounts: 0, returns: 0, cogs: 0 };
        shopifySkuData[sku].unitsSold += units;
        shopifySkuData[sku].netSales += netSales;
        shopifySkuData[sku].grossSales += sales;
        shopifySkuData[sku].discounts += disc;
        shopifySkuData[sku].returns += returns;
        shopifySkuData[sku].cogs += (cogsLookup[sku] || 0) * units;
      }
    });

    // Use enhanced 3PL parser
    const threeplData = parse3PLData(files.threepl);
    const threeplBreakdown = threeplData.breakdown;
    const threeplMetrics = threeplData.metrics;
    
    // Separate storage from fulfillment costs
    const storageCost = threeplBreakdown.storage || 0;
    const fulfillmentCost = threeplData.metrics.totalCost - storageCost;
    
    // Storage allocation: proportional by revenue
    const totalRev = amzRev + shopRev;
    const shopifyShare = totalRev > 0 ? shopRev / totalRev : 1;
    const amazonShare = totalRev > 0 ? amzRev / totalRev : 0;
    
    const storageAlloc = leadTimeSettings.storageCostAllocation || 'proportional';
    let shopStorageCost = 0, amzStorageCost = 0;
    
    if (storageAlloc === 'shopify') {
      shopStorageCost = storageCost;
    } else if (storageAlloc === 'proportional') {
      shopStorageCost = storageCost * shopifyShare;
      amzStorageCost = storageCost * amazonShare;
    }

    const metaS = parseFloat(adSpend.meta) || 0, googleS = parseFloat(adSpend.google) || 0, shopAds = metaS + googleS;
    const shopThreeplCost = fulfillmentCost + (storageAlloc !== 'total' ? shopStorageCost : 0);
    // shopRev is Gross sales, so subtract discounts to get net profit
    const shopProfit = shopRev - shopDisc - shopCogs - shopThreeplCost - shopAds;
    const adjustedAmzProfit = storageAlloc === 'proportional' ? amzProfit - amzStorageCost : amzProfit;
    const totalProfit = adjustedAmzProfit + shopProfit - (storageAlloc === 'total' ? storageCost : 0);
    // Derive Amazon COGS from SKU Economics report (already embedded in Net proceeds)
    // amzProfit = Net proceeds total = Net sales - fees - ads - COGS
    amzCogs = Math.max(0, amzRev - amzFees - amzAds - amzProfit);
    // Derive per-SKU COGS from report data
    Object.values(amazonSkuData).forEach(s => { s.cogs = Math.max(0, (s.netSales || 0) - (s.netProceeds || 0) - (s.adSpend || 0)); });
    const totalCogs = amzCogs + shopCogs;

    // Convert SKU data to sorted arrays
    const amazonSkus = Object.values(amazonSkuData).sort((a, b) => b.netSales - a.netSales);
    const shopifySkus = Object.values(shopifySkuData).sort((a, b) => b.netSales - a.netSales);

    const weekData = {
      weekEnding, createdAt: new Date().toISOString(),
      amazon: { revenue: amzRev, units: amzUnits, returns: amzRet, cogs: amzCogs, fees: amzFees, adSpend: amzAds, 
        storageCost: amzStorageCost, netProfit: adjustedAmzProfit, 
        margin: amzRev > 0 ? (adjustedAmzProfit/amzRev)*100 : 0, aov: amzUnits > 0 ? amzRev/amzUnits : 0, roas: amzAds > 0 ? amzRev/amzAds : 0,
        returnRate: amzUnits > 0 ? (amzRet/amzUnits)*100 : 0, skuData: amazonSkus, source: 'sku-economics' },
      shopify: { revenue: shopRev, units: shopUnits, cogs: shopCogs, 
        threeplCosts: shopThreeplCost, fulfillmentCost, storageCost: shopStorageCost,
        threeplBreakdown, threeplMetrics, adSpend: shopAds, metaSpend: metaS, googleSpend: googleS, discounts: shopDisc, netProfit: shopProfit, 
        netMargin: shopRev > 0 ? (shopProfit/shopRev)*100 : 0, aov: shopUnits > 0 ? shopRev/shopUnits : 0, roas: shopAds > 0 ? shopRev/shopAds : 0, skuData: shopifySkus },
      total: { revenue: totalRev, units: amzUnits + shopUnits, cogs: totalCogs, adSpend: amzAds + shopAds, 
        storageCost, storageCostAllocation: storageAlloc,
        netProfit: totalProfit, netMargin: totalRev > 0 ? (totalProfit/totalRev)*100 : 0, roas: (amzAds + shopAds) > 0 ? totalRev/(amzAds + shopAds) : 0, 
        amazonShare: totalRev > 0 ? (amzRev/totalRev)*100 : 0, shopifyShare: totalRev > 0 ? (shopRev/totalRev)*100 : 0 }
    };

    const updated = { ...allWeeksData, [weekEnding]: weekData };
    setAllWeeksData(updated); save(updated); setSelectedWeek(weekEnding); setView('weekly'); setIsProcessing(false);
    setFiles({ amazon: null, shopify: null, cogs: null, threepl: [] }); setFileNames({ amazon: '', shopify: '', cogs: '', threepl: [] }); setAdSpend({ meta: '', google: '' }); setWeekEnding('');
    audit('weekly_save', weekEnding); setToast({ message: 'Week data saved successfully!', type: 'success' });
  }, [files, adSpend, weekEnding, allWeeksData, getCogsLookup, save]);

  // Process daily upload
  const processDailyUpload = useCallback(async () => {
    if (!selectedDay) { setToast({ message: 'Please select a date', type: 'error' }); return; }
    if (!dailyFiles.amazon && !dailyFiles.shopify) { setToast({ message: 'Upload at least one data file', type: 'error' }); return; }
    
    const cogsLookup = getCogsLookup();
    setIsProcessing(true);
    
    try {
      let amzRev = 0, amzUnits = 0, amzRet = 0, amzProfit = 0, amzCogs = 0, amzFees = 0, amzAds = 0;
      const amazonSkuData = {};
      
      // Parse Amazon data if provided
      if (dailyFiles.amazon) {
        const amzData = await new Promise((resolve) => {
          dailyFiles.amazon.text().then(text => resolve(parseCSV(text)));
        });
        
        amzData.forEach(r => {
          const net = parseInt(r['Net units sold'] || 0), sold = parseInt(r['Units sold'] || 0), ret = parseInt(r['Units returned'] || 0);
          const sales = parseFloat(r['Net sales'] || 0), proceeds = parseFloat(r['Net proceeds total'] || 0), sku = r['MSKU'] || '';
          const fees = parseFloat(r['FBA fulfillment fees total'] || 0) + parseFloat(r['Referral fee total'] || 0) + parseFloat(r['AWD Storage Fee total'] || 0);
          const ads = parseFloat(r['Sponsored Products charge total'] || 0);
          const name = r['Product title'] || r['product-name'] || sku;
          if (net !== 0 || sold > 0 || ret > 0 || sales !== 0 || proceeds !== 0) { 
            amzRev += sales; amzUnits += sold; amzRet += ret; amzProfit += proceeds; amzFees += fees; amzAds += ads; // COGS already in Net proceeds - do NOT add from lookup
            if (sku) {
              if (!amazonSkuData[sku]) amazonSkuData[sku] = { sku, name, unitsSold: 0, returns: 0, netSales: 0, netProceeds: 0, adSpend: 0, cogs: 0 };
              amazonSkuData[sku].unitsSold += sold;
              amazonSkuData[sku].returns += ret;
              amazonSkuData[sku].netSales += sales;
              amazonSkuData[sku].netProceeds += proceeds;
              amazonSkuData[sku].adSpend += ads;
              // COGS already in Net proceeds - per-SKU cogs derived below
            }
          }
        });
      }
      
      let shopRev = 0, shopUnits = 0, shopCogs = 0, shopDisc = 0;
      const shopifySkuData = {};
      
      // Parse Shopify data if provided
      if (dailyFiles.shopify) {
        const shopData = await new Promise((resolve) => {
          dailyFiles.shopify.text().then(text => resolve(parseCSV(text)));
        });
        
        shopData.forEach(r => {
          const units = parseInt(r['Net items sold'] || r['Net quantity'] || 0);
          // Use Gross sales for revenue (before discounts), fallback to Net sales if Gross not available
          const grossSales = parseFloat(r['Gross sales'] || 0);
          const netSales = parseFloat(r['Net sales'] || 0);
          const sales = grossSales > 0 ? grossSales : netSales;
          const sku = r['Product variant SKU'] || '';
          const name = r['Product title'] || r['Product'] || sku;
          const disc = Math.abs(parseFloat(r['Discounts'] || 0));
          const returns = Math.abs(parseFloat(r['Returns'] || 0));
          shopRev += sales; shopUnits += units; shopCogs += (cogsLookup[sku] || 0) * units; shopDisc += disc;
          // Include SKUs if they have units OR sales (to capture shipping, etc.)
          if (sku && (units > 0 || sales !== 0)) {
            if (!shopifySkuData[sku]) shopifySkuData[sku] = { sku, name, unitsSold: 0, netSales: 0, grossSales: 0, discounts: 0, returns: 0, cogs: 0 };
            shopifySkuData[sku].unitsSold += units;
            shopifySkuData[sku].netSales += netSales;
            shopifySkuData[sku].grossSales += sales;
            shopifySkuData[sku].discounts += disc;
            shopifySkuData[sku].returns += returns;
            shopifySkuData[sku].cogs += (cogsLookup[sku] || 0) * units;
          }
        });
      }
      
      const metaS = parseFloat(dailyAdSpend.meta) || 0;
      const googleS = parseFloat(dailyAdSpend.google) || 0;
      const shopAds = metaS + googleS;
      // shopRev is now Gross sales, so subtract discounts to get net profit
      const shopProfit = shopRev - shopDisc - shopCogs - shopAds;
      const totalRev = amzRev + shopRev;
      const totalProfit = amzProfit + shopProfit;
      // Derive Amazon COGS from SKU Economics report (already embedded in Net proceeds)
    // amzProfit = Net proceeds total = Net sales - fees - ads - COGS
    amzCogs = Math.max(0, amzRev - amzFees - amzAds - amzProfit);
    // Derive per-SKU COGS from report data
    Object.values(amazonSkuData).forEach(s => { s.cogs = Math.max(0, (s.netSales || 0) - (s.netProceeds || 0) - (s.adSpend || 0)); });
    const totalCogs = amzCogs + shopCogs;
      
      const amazonSkus = Object.values(amazonSkuData).sort((a, b) => b.netSales - a.netSales);
      const shopifySkus = Object.values(shopifySkuData).sort((a, b) => b.netSales - a.netSales);
      
      const dayData = {
        date: selectedDay,
        createdAt: new Date().toISOString(),
        amazon: dailyFiles.amazon ? {
          revenue: amzRev, units: amzUnits, returns: amzRet, cogs: amzCogs, fees: amzFees, adSpend: amzAds, netProfit: amzProfit,
          margin: amzRev > 0 ? (amzProfit/amzRev)*100 : 0, aov: amzUnits > 0 ? amzRev/amzUnits : 0, roas: amzAds > 0 ? amzRev/amzAds : 0,
          returnRate: amzUnits > 0 ? (amzRet/amzUnits)*100 : 0, skuData: amazonSkus,
          source: 'sku-economics', // Marks this as authoritative - API sync will not overwrite
        } : null,
        shopify: dailyFiles.shopify ? {
          revenue: shopRev, units: shopUnits, cogs: shopCogs, adSpend: shopAds, metaSpend: metaS, googleSpend: googleS,
          discounts: shopDisc, netProfit: shopProfit, netMargin: shopRev > 0 ? (shopProfit/shopRev)*100 : 0,
          aov: shopUnits > 0 ? shopRev/shopUnits : 0, roas: shopAds > 0 ? shopRev/shopAds : 0, skuData: shopifySkus
        } : null,
      };
      
      // CRITICAL: Merge with existing data - preserve channels that weren't uploaded
      const existingDayData = allDaysData[selectedDay] || {};
      const existingShopify = existingDayData.shopify || {};
      
      // Preserve ALL existing ads data
      const metaSpend = existingDayData.metaSpend || existingShopify.metaSpend || 0;
      const googleSpend = existingDayData.googleSpend || existingShopify.googleSpend || 0;
      const totalAds = metaSpend + googleSpend;
      
      // Only update channels that were actually uploaded, preserve others
      // But merge ad data into shopify object
      const uploadedShopify = dailyFiles.shopify ? dayData.shopify : existingShopify;
      const mergedShopify = {
        ...uploadedShopify,
        metaSpend: metaSpend,
        metaAds: metaSpend,
        googleSpend: googleSpend,
        googleAds: googleSpend,
        adSpend: totalAds,
      };
      
      // Recalculate profit if we have ad spend
      if (totalAds > 0 && mergedShopify.revenue > 0) {
        const grossProfit = (mergedShopify.revenue || 0) - (mergedShopify.cogs || 0) - (mergedShopify.threeplCosts || 0);
        mergedShopify.netProfit = grossProfit - totalAds;
        mergedShopify.netMargin = mergedShopify.revenue > 0 ? (mergedShopify.netProfit / mergedShopify.revenue) * 100 : 0;
        mergedShopify.roas = totalAds > 0 ? mergedShopify.revenue / totalAds : 0;
      }
      
      const mergedDayData = {
        ...existingDayData,
        date: selectedDay,
        createdAt: new Date().toISOString(),
        // Preserve existing Amazon data if no new Amazon file uploaded
        amazon: dailyFiles.amazon ? dayData.amazon : existingDayData.amazon,
        // Shopify with merged ad data
        shopify: mergedShopify,
        // Preserve ALL existing ads data (Meta/Google from bulk upload)
        metaSpend: metaSpend,
        metaAds: metaSpend,
        metaImpressions: existingDayData.metaImpressions,
        metaClicks: existingDayData.metaClicks,
        metaCpc: existingDayData.metaCpc,
        metaCpa: existingDayData.metaCpa,
        metaConversions: existingDayData.metaConversions,
        metaPurchases: existingDayData.metaPurchases,
        googleSpend: googleSpend,
        googleAds: googleSpend,
        googleImpressions: existingDayData.googleImpressions,
        googleClicks: existingDayData.googleClicks,
        googleCpc: existingDayData.googleCpc,
        googleCpa: existingDayData.googleCpa,
        googleConversions: existingDayData.googleConversions,
      };
      
      // Recalculate totals based on merged data
      const finalAmazon = mergedDayData.amazon || {};
      const finalShopify = mergedDayData.shopify || {};
      const finalAmzRev = finalAmazon.revenue || 0;
      const finalShopRev = finalShopify.revenue || 0;
      const finalTotalRev = finalAmzRev + finalShopRev;
      const finalAmzProfit = finalAmazon.netProfit || 0;
      const finalShopProfit = finalShopify.netProfit || 0;
      const finalTotalProfit = finalAmzProfit + finalShopProfit;
      const finalAmzAds = finalAmazon.adSpend || 0;
      const finalShopAds = finalShopify.adSpend || 0;
      const finalTotalAds = finalAmzAds + finalShopAds;
      
      mergedDayData.total = {
        revenue: finalTotalRev,
        units: (finalAmazon.units || 0) + (finalShopify.units || 0),
        cogs: (finalAmazon.cogs || 0) + (finalShopify.cogs || 0),
        adSpend: finalTotalAds,
        netProfit: finalTotalProfit,
        netMargin: finalTotalRev > 0 ? (finalTotalProfit/finalTotalRev)*100 : 0,
        roas: finalTotalAds > 0 ? finalTotalRev/finalTotalAds : 0,
        amazonShare: finalTotalRev > 0 ? (finalAmzRev/finalTotalRev)*100 : 0,
        shopifyShare: finalTotalRev > 0 ? (finalShopRev/finalTotalRev)*100 : 0
      };
      
      const updatedDays = { ...allDaysData, [selectedDay]: mergedDayData };
      setAllDaysData(updatedDays);
      lsSet('ecommerce_daily_sales_v1', JSON.stringify(updatedDays));
      
      // Sync to cloud
      queueCloudSave({ ...combinedData, dailySales: updatedDays });
      
      // Reset form
      setDailyFiles({ amazon: null, shopify: null });
      setDailyAdSpend({ meta: '', google: '' });
      setSelectedDay(null);
      setIsProcessing(false);
      audit('daily_save', selectedDay); setToast({ message: `Daily data for ${new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} saved!`, type: 'success' });
      
    } catch (err) {
      devError('Daily upload error:', err);
      setIsProcessing(false);
      setToast({ message: 'Error processing daily data', type: 'error' });
    }
  }, [selectedDay, dailyFiles, dailyAdSpend, allDaysData, getCogsLookup, combinedData, queueCloudSave]);

  // Auto-aggregate daily data into weekly summaries
  const aggregateDailyToWeekly = useCallback(() => {
    const sortedDays = Object.keys(allDaysData).filter(d => hasDailySalesData(allDaysData[d])).sort();
    if (sortedDays.length === 0) {
      setToast({ message: 'No daily data to aggregate', type: 'error' });
      return;
    }
    
    // Group days by week (Monday to Sunday)
    const weeklyAgg = {};
    
    sortedDays.forEach(dayKey => {
      const dayData = allDaysData[dayKey];
      const date = new Date(dayKey + 'T12:00:00');
      // Get the Sunday of this week (week ending date)
      const dayOfWeek = date.getDay();
      const weekEnd = new Date(date);
      // Move to Sunday: if already Sunday add 0, else add days to reach Sunday
      weekEnd.setDate(date.getDate() + (dayOfWeek === 0 ? 0 : 7 - dayOfWeek));
      const weekKey = formatDateKey(weekEnd);
      
      if (!weeklyAgg[weekKey]) {
        weeklyAgg[weekKey] = {
          weekEnding: weekKey,
          days: [],
          amazon: { revenue: 0, units: 0, returns: 0, cogs: 0, fees: 0, adSpend: 0, netProfit: 0, skuData: {} },
          shopify: { revenue: 0, units: 0, cogs: 0, adSpend: 0, metaSpend: 0, googleSpend: 0, discounts: 0, netProfit: 0, skuData: {} },
        };
      }
      
      weeklyAgg[weekKey].days.push(dayKey);
      
      // Aggregate Amazon data
      if (dayData.amazon) {
        weeklyAgg[weekKey].amazon.revenue += dayData.amazon.revenue || 0;
        weeklyAgg[weekKey].amazon.units += dayData.amazon.units || 0;
        weeklyAgg[weekKey].amazon.returns += dayData.amazon.returns || 0;
        weeklyAgg[weekKey].amazon.cogs += dayData.amazon.cogs || 0;
        weeklyAgg[weekKey].amazon.fees += dayData.amazon.fees || 0;
        weeklyAgg[weekKey].amazon.adSpend += dayData.amazon.adSpend || 0;
        weeklyAgg[weekKey].amazon.netProfit += dayData.amazon.netProfit || 0;
        
        // Aggregate SKU data
        (dayData.amazon.skuData || []).forEach(sku => {
          if (!weeklyAgg[weekKey].amazon.skuData[sku.sku]) {
            weeklyAgg[weekKey].amazon.skuData[sku.sku] = { ...sku, unitsSold: 0, returns: 0, netSales: 0, netProceeds: 0, adSpend: 0, cogs: 0 };
          }
          weeklyAgg[weekKey].amazon.skuData[sku.sku].unitsSold += sku.unitsSold || 0;
          weeklyAgg[weekKey].amazon.skuData[sku.sku].returns += sku.returns || 0;
          weeklyAgg[weekKey].amazon.skuData[sku.sku].netSales += sku.netSales || 0;
          weeklyAgg[weekKey].amazon.skuData[sku.sku].netProceeds += sku.netProceeds || 0;
          weeklyAgg[weekKey].amazon.skuData[sku.sku].adSpend += sku.adSpend || 0;
          weeklyAgg[weekKey].amazon.skuData[sku.sku].cogs += sku.cogs || 0;
        });
      }
      
      // Aggregate Shopify data
      if (dayData.shopify) {
        weeklyAgg[weekKey].shopify.revenue += dayData.shopify.revenue || 0;
        weeklyAgg[weekKey].shopify.units += dayData.shopify.units || 0;
        weeklyAgg[weekKey].shopify.cogs += dayData.shopify.cogs || 0;
        weeklyAgg[weekKey].shopify.adSpend += dayData.shopify.adSpend || 0;
        weeklyAgg[weekKey].shopify.metaSpend += dayData.shopify.metaSpend || 0;
        weeklyAgg[weekKey].shopify.googleSpend += dayData.shopify.googleSpend || 0;
        weeklyAgg[weekKey].shopify.discounts += dayData.shopify.discounts || 0;
        weeklyAgg[weekKey].shopify.netProfit += dayData.shopify.netProfit || 0;
        
        // Aggregate SKU data
        (dayData.shopify.skuData || []).forEach(sku => {
          if (!weeklyAgg[weekKey].shopify.skuData[sku.sku]) {
            weeklyAgg[weekKey].shopify.skuData[sku.sku] = { ...sku, unitsSold: 0, netSales: 0, discounts: 0, cogs: 0 };
          }
          weeklyAgg[weekKey].shopify.skuData[sku.sku].unitsSold += sku.unitsSold || 0;
          weeklyAgg[weekKey].shopify.skuData[sku.sku].netSales += sku.netSales || 0;
          weeklyAgg[weekKey].shopify.skuData[sku.sku].discounts += sku.discounts || 0;
          weeklyAgg[weekKey].shopify.skuData[sku.sku].cogs += sku.cogs || 0;
        });
      }
    });
    
    // Filter to only include complete weeks (7 days, Mon-Sun)
    // Also track incomplete weeks for user feedback
    const completeWeeks = {};
    const incompleteWeeks = [];
    
    Object.entries(weeklyAgg).forEach(([weekKey, agg]) => {
      // Calculate which days should be in this week
      const weekEndDate = new Date(weekKey + 'T12:00:00');
      const expectedDays = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(weekEndDate);
        d.setDate(weekEndDate.getDate() - i);
        expectedDays.push(formatDateKey(d));
      }
      
      const missingDays = expectedDays.filter(d => !agg.days.includes(d));
      
      if (missingDays.length === 0) {
        // Complete week - include in aggregation
        completeWeeks[weekKey] = agg;
      } else {
        // Incomplete week - track for feedback
        incompleteWeeks.push({
          weekEnding: weekKey,
          daysPresent: agg.days.length,
          missingDays: missingDays.map(d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))
        });
      }
    });
    
    if (Object.keys(completeWeeks).length === 0) {
      const incompleteInfo = incompleteWeeks.map(w => 
        `Week ending ${new Date(w.weekEnding + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: missing ${w.missingDays.join(', ')}`
      ).join('\n');
      setToast({ 
        message: `No complete weeks to aggregate. ${incompleteWeeks.length > 0 ? `Incomplete weeks need all 7 days (Mon-Sun).` : ''}`, 
        type: 'error' 
      });
      return;
    }
    
    // Convert to weekly data format and merge with existing
    const newWeeksData = { ...allWeeksData };
    let weeksCreated = 0;
    let weeksUpdated = 0;
    
    Object.entries(completeWeeks).forEach(([weekKey, agg]) => {
      const amz = agg.amazon;
      const shop = agg.shopify;
      const totalRev = amz.revenue + shop.revenue;
      const totalProfit = amz.netProfit + shop.netProfit;
      const totalCogs = amz.cogs + shop.cogs;
      const totalAds = amz.adSpend + shop.adSpend;
      
      const weekData = {
        weekEnding: weekKey,
        createdAt: new Date().toISOString(),
        aggregatedFrom: agg.days, // Track which days were aggregated
        amazon: {
          revenue: amz.revenue,
          units: amz.units,
          returns: amz.returns,
          cogs: amz.cogs,
          fees: amz.fees,
          adSpend: amz.adSpend,
          netProfit: amz.netProfit,
          margin: amz.revenue > 0 ? (amz.netProfit / amz.revenue) * 100 : 0,
          aov: amz.units > 0 ? amz.revenue / amz.units : 0,
          roas: amz.adSpend > 0 ? amz.revenue / amz.adSpend : 0,
          returnRate: amz.units > 0 ? (amz.returns / amz.units) * 100 : 0,
          skuData: Object.values(amz.skuData).sort((a, b) => b.netSales - a.netSales),
        },
        shopify: {
          revenue: shop.revenue,
          units: shop.units,
          cogs: shop.cogs,
          adSpend: shop.adSpend,
          metaSpend: shop.metaSpend,
          googleSpend: shop.googleSpend,
          discounts: shop.discounts,
          netProfit: shop.netProfit,
          netMargin: shop.revenue > 0 ? (shop.netProfit / shop.revenue) * 100 : 0,
          aov: shop.units > 0 ? shop.revenue / shop.units : 0,
          roas: shop.adSpend > 0 ? shop.revenue / shop.adSpend : 0,
          skuData: Object.values(shop.skuData).sort((a, b) => b.netSales - a.netSales),
        },
        total: {
          revenue: totalRev,
          units: amz.units + shop.units,
          cogs: totalCogs,
          adSpend: totalAds,
          netProfit: totalProfit,
          netMargin: totalRev > 0 ? (totalProfit / totalRev) * 100 : 0,
          roas: totalAds > 0 ? totalRev / totalAds : 0,
          amazonShare: totalRev > 0 ? (amz.revenue / totalRev) * 100 : 0,
          shopifyShare: totalRev > 0 ? (shop.revenue / totalRev) * 100 : 0,
        },
      };
      
      if (newWeeksData[weekKey]) {
        weeksUpdated++;
      } else {
        weeksCreated++;
      }
      newWeeksData[weekKey] = weekData;
    });
    
    setAllWeeksData(newWeeksData);
    save(newWeeksData);
    
    // Calculate days aggregated from complete weeks
    const daysAggregated = Object.values(completeWeeks).reduce((sum, w) => sum + w.days.length, 0);
    
    let message = `Aggregated ${daysAggregated} days into ${weeksCreated + weeksUpdated} week${weeksCreated + weeksUpdated !== 1 ? 's' : ''} (${weeksCreated} new, ${weeksUpdated} updated)`;
    if (incompleteWeeks.length > 0) {
      message += `. ${incompleteWeeks.length} incomplete week${incompleteWeeks.length !== 1 ? 's' : ''} skipped (need all 7 days Mon-Sun)`;
    }
    setToast({ message, type: 'success' });
  }, [allDaysData, allWeeksData, save]);

  // Auto-sync daily data into weekly summaries - COMPREHENSIVE aggregation
  // This ensures weekly data always reflects the latest daily uploads
  useEffect(() => {
    if (Object.keys(allDaysData).length === 0) return;
    
    // Group ALL daily data by week
    const dailyByWeek = {};
    Object.entries(allDaysData).forEach(([dayKey, dayData]) => {
      if (!dayData) return;
      // Validate date key format (YYYY-MM-DD)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return;
      const date = new Date(dayKey + 'T12:00:00');
      if (isNaN(date.getTime())) return; // Skip invalid dates
      const dayOfWeek = date.getDay();
      const weekEnd = new Date(date);
      weekEnd.setDate(date.getDate() + (dayOfWeek === 0 ? 0 : 7 - dayOfWeek));
      const weekKey = weekEnd.toISOString().split('T')[0];
      
      if (!dailyByWeek[weekKey]) {
        dailyByWeek[weekKey] = {
          days: [],
          amazon: { revenue: 0, units: 0, returns: 0, cogs: 0, fees: 0, adSpend: 0, netProfit: 0, skuData: {} },
          shopify: { revenue: 0, units: 0, cogs: 0, adSpend: 0, metaSpend: 0, googleSpend: 0, discounts: 0, netProfit: 0, threeplCosts: 0, skuData: {} },
        };
      }
      dailyByWeek[weekKey].days.push(dayKey);
      
      // Aggregate Amazon
      if (dayData.amazon) {
        dailyByWeek[weekKey].amazon.revenue += dayData.amazon.revenue || 0;
        dailyByWeek[weekKey].amazon.units += dayData.amazon.units || 0;
        dailyByWeek[weekKey].amazon.returns += dayData.amazon.returns || 0;
        dailyByWeek[weekKey].amazon.cogs += dayData.amazon.cogs || 0;
        dailyByWeek[weekKey].amazon.fees += dayData.amazon.fees || 0;
        dailyByWeek[weekKey].amazon.adSpend += dayData.amazon.adSpend || 0;
        dailyByWeek[weekKey].amazon.netProfit += dayData.amazon.netProfit || 0;
        
        // Aggregate SKU data
        (dayData.amazon.skuData || []).forEach(sku => {
          const skuKey = sku.sku || sku.msku;
          if (!skuKey) return;
          if (!dailyByWeek[weekKey].amazon.skuData[skuKey]) {
            dailyByWeek[weekKey].amazon.skuData[skuKey] = { sku: skuKey, name: sku.name, unitsSold: 0, returns: 0, netSales: 0, netProceeds: 0, adSpend: 0, cogs: 0 };
          }
          dailyByWeek[weekKey].amazon.skuData[skuKey].unitsSold += sku.unitsSold || sku.units || 0;
          dailyByWeek[weekKey].amazon.skuData[skuKey].returns += sku.returns || 0;
          dailyByWeek[weekKey].amazon.skuData[skuKey].netSales += sku.netSales || sku.revenue || 0;
          dailyByWeek[weekKey].amazon.skuData[skuKey].netProceeds += sku.netProceeds || 0;
          dailyByWeek[weekKey].amazon.skuData[skuKey].adSpend += sku.adSpend || 0;
          dailyByWeek[weekKey].amazon.skuData[skuKey].cogs += sku.cogs || 0;
        });
      }
      
      // Aggregate Shopify
      if (dayData.shopify) {
        dailyByWeek[weekKey].shopify.revenue += dayData.shopify.revenue || 0;
        dailyByWeek[weekKey].shopify.units += dayData.shopify.units || 0;
        dailyByWeek[weekKey].shopify.cogs += dayData.shopify.cogs || 0;
        dailyByWeek[weekKey].shopify.discounts += dayData.shopify.discounts || 0;
        dailyByWeek[weekKey].shopify.netProfit += dayData.shopify.netProfit || 0;
        dailyByWeek[weekKey].shopify.threeplCosts += dayData.shopify.threeplCosts || 0;
        
        // Aggregate SKU data  
        (dayData.shopify.skuData || []).forEach(sku => {
          const skuKey = sku.sku;
          if (!skuKey) return;
          if (!dailyByWeek[weekKey].shopify.skuData[skuKey]) {
            dailyByWeek[weekKey].shopify.skuData[skuKey] = { sku: skuKey, name: sku.name, unitsSold: 0, netSales: 0, discounts: 0, cogs: 0 };
          }
          dailyByWeek[weekKey].shopify.skuData[skuKey].unitsSold += sku.unitsSold || sku.units || 0;
          dailyByWeek[weekKey].shopify.skuData[skuKey].netSales += sku.netSales || sku.revenue || 0;
          dailyByWeek[weekKey].shopify.skuData[skuKey].discounts += sku.discounts || 0;
          dailyByWeek[weekKey].shopify.skuData[skuKey].cogs += sku.cogs || 0;
        });
      }
      
      // Aggregate ads from both top-level and shopify object
      const metaSpend = dayData.metaSpend || dayData.shopify?.metaSpend || 0;
      const googleSpend = dayData.googleSpend || dayData.shopify?.googleSpend || 0;
      dailyByWeek[weekKey].shopify.metaSpend += metaSpend;
      dailyByWeek[weekKey].shopify.googleSpend += googleSpend;
      dailyByWeek[weekKey].shopify.adSpend += metaSpend + googleSpend;
    });
    
    // Merge with existing weekly data - daily aggregates fill gaps in weekly data
    // CRITICAL: Never let API-only daily data overwrite SKU Economics weekly data
    let needsUpdate = false;
    const updatedWeeks = { ...allWeeksData };
    
    Object.entries(dailyByWeek).forEach(([weekKey, dailyAgg]) => {
      const existingWeek = updatedWeeks[weekKey];
      
      // Check if existing week's Amazon data is from SKU Economics (authoritative)
      const existingAmzIsSkuEcon = existingWeek?.amazon?.source === 'sku-economics' || 
        (existingWeek?.amazon?.fees > 0 && !existingWeek?.aggregatedFrom);
      
      // Check if daily Amazon data is ALL from API (not SKU Economics)
      const dailyAmzAllApi = dailyAgg.days.every(dayKey => {
        const dayAmz = allDaysData[dayKey]?.amazon;
        return !dayAmz || dayAmz.source === 'amazon-orders-api';
      });
      
      // Don't overwrite SKU Economics Amazon data with API-only daily data
      const skipAmazonMerge = existingAmzIsSkuEcon && dailyAmzAllApi;
      
      // If no existing week or existing week is missing data, update it
      const shouldUpdate = !existingWeek || 
        // Update if daily has ads but weekly doesn't
        ((dailyAgg.shopify.metaSpend > 0 || dailyAgg.shopify.googleSpend > 0) && 
         !(existingWeek?.shopify?.metaSpend > 0 || existingWeek?.shopify?.googleSpend > 0)) ||
        // Update if daily has Amazon SKU data but weekly doesn't (and we're not protecting SKU Economics)
        (!skipAmazonMerge && Object.keys(dailyAgg.amazon.skuData).length > 0 && 
         !(existingWeek?.amazon?.skuData?.length > 0)) ||
        // Update if daily has Shopify SKU data but weekly doesn't
        (Object.keys(dailyAgg.shopify.skuData).length > 0 && 
         !(existingWeek?.shopify?.skuData?.length > 0)) ||
        // Update if daily has more days than what was aggregated before (but not if SKU Economics is being protected)
        (!skipAmazonMerge && dailyAgg.days.length > (existingWeek?.aggregatedFrom?.length || 0));
      
      if (shouldUpdate) {
        needsUpdate = true;
        
        // Merge - prefer daily aggregates for fields that are populated
        const amz = dailyAgg.amazon;
        const shop = dailyAgg.shopify;
        const existAmz = existingWeek?.amazon || {};
        const existShop = existingWeek?.shopify || {};
        
        // For Amazon: if SKU Economics is protected, keep existing data entirely
        const mergedAmz = skipAmazonMerge ? { ...existAmz } : {
          revenue: amz.revenue > 0 ? amz.revenue : (existAmz.revenue || 0),
          units: amz.units > 0 ? amz.units : (existAmz.units || 0),
          returns: amz.returns > 0 ? amz.returns : (existAmz.returns || 0),
          cogs: amz.cogs > 0 ? amz.cogs : (existAmz.cogs || 0),
          fees: amz.fees > 0 ? amz.fees : (existAmz.fees || 0),
          adSpend: amz.adSpend > 0 ? amz.adSpend : (existAmz.adSpend || 0),
          netProfit: amz.netProfit !== 0 ? amz.netProfit : (existAmz.netProfit || 0),
          skuData: Object.keys(amz.skuData).length > 0 
            ? Object.values(amz.skuData).sort((a, b) => (b.netSales || 0) - (a.netSales || 0))
            : (existAmz.skuData || []),
          // Propagate source tag
          source: amz.fees > 0 ? 'sku-economics' : (existAmz.source || 'daily-aggregation'),
        };
        
        const mergedShop = {
          revenue: shop.revenue > 0 ? shop.revenue : (existShop.revenue || 0),
          units: shop.units > 0 ? shop.units : (existShop.units || 0),
          cogs: shop.cogs > 0 ? shop.cogs : (existShop.cogs || 0),
          adSpend: shop.adSpend > 0 ? shop.adSpend : (existShop.adSpend || 0),
          metaSpend: shop.metaSpend > 0 ? shop.metaSpend : (existShop.metaSpend || 0),
          googleSpend: shop.googleSpend > 0 ? shop.googleSpend : (existShop.googleSpend || 0),
          discounts: shop.discounts > 0 ? shop.discounts : (existShop.discounts || 0),
          netProfit: shop.netProfit !== 0 ? shop.netProfit : (existShop.netProfit || 0),
          threeplCosts: shop.threeplCosts > 0 ? shop.threeplCosts : (existShop.threeplCosts || 0),
          skuData: Object.keys(shop.skuData).length > 0
            ? Object.values(shop.skuData).sort((a, b) => (b.netSales || 0) - (a.netSales || 0))
            : (existShop.skuData || []),
        };
        
        const totalRev = mergedAmz.revenue + mergedShop.revenue;
        const totalProfit = mergedAmz.netProfit + mergedShop.netProfit;
        const totalAds = mergedAmz.adSpend + mergedShop.adSpend;
        
        updatedWeeks[weekKey] = {
          weekEnding: weekKey,
          createdAt: existingWeek?.createdAt || new Date().toISOString(),
          aggregatedFrom: dailyAgg.days,
          amazon: {
            ...mergedAmz,
            margin: mergedAmz.revenue > 0 ? (mergedAmz.netProfit / mergedAmz.revenue * 100) : 0,
            aov: mergedAmz.units > 0 ? mergedAmz.revenue / mergedAmz.units : 0,
            roas: mergedAmz.adSpend > 0 ? mergedAmz.revenue / mergedAmz.adSpend : 0,
          },
          shopify: {
            ...mergedShop,
            netMargin: mergedShop.revenue > 0 ? (mergedShop.netProfit / mergedShop.revenue * 100) : 0,
            aov: mergedShop.units > 0 ? mergedShop.revenue / mergedShop.units : 0,
            roas: mergedShop.adSpend > 0 ? mergedShop.revenue / mergedShop.adSpend : 0,
          },
          total: {
            revenue: totalRev,
            units: mergedAmz.units + mergedShop.units,
            cogs: mergedAmz.cogs + mergedShop.cogs,
            adSpend: totalAds,
            netProfit: totalProfit,
            netMargin: totalRev > 0 ? (totalProfit / totalRev * 100) : 0,
            roas: totalAds > 0 ? totalRev / totalAds : 0,
            amazonShare: totalRev > 0 ? (mergedAmz.revenue / totalRev * 100) : 0,
            shopifyShare: totalRev > 0 ? (mergedShop.revenue / totalRev * 100) : 0,
          },
        };
      }
    });
    
    if (needsUpdate) {
      setAllWeeksData(updatedWeeks);
      save(updatedWeeks);
    }
  }, [allDaysData]); // Only depend on allDaysData to avoid loops

  // Auto-aggregate weekly data into monthly periods
  // This ensures period data is always up-to-date for AI queries
  useEffect(() => {
    if (Object.keys(allWeeksData).length === 0) return;
    
    // Group weekly data by month
    const monthlyAgg = {};
    Object.entries(allWeeksData).forEach(([weekKey, weekData]) => {
      if (!weekData) return;
      // Validate week key format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) return;
      
      // Use the week ending date to determine the month
      const monthKey = weekKey.slice(0, 7); // YYYY-MM
      const testDate = new Date(weekKey + 'T12:00:00');
      if (isNaN(testDate.getTime())) return; // Skip invalid dates
      const monthName = testDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      
      if (!monthlyAgg[monthKey]) {
        monthlyAgg[monthKey] = {
          monthKey,
          monthName,
          weeks: [],
          amazon: { revenue: 0, units: 0, profit: 0, adSpend: 0, cogs: 0, returns: 0, fees: 0 },
          shopify: { revenue: 0, units: 0, profit: 0, adSpend: 0, metaSpend: 0, googleSpend: 0, cogs: 0, discounts: 0 },
          total: { revenue: 0, units: 0, profit: 0, adSpend: 0, cogs: 0 },
        };
      }
      
      monthlyAgg[monthKey].weeks.push(weekKey);
      
      // Aggregate Amazon
      monthlyAgg[monthKey].amazon.revenue += weekData.amazon?.revenue || 0;
      monthlyAgg[monthKey].amazon.units += weekData.amazon?.units || 0;
      monthlyAgg[monthKey].amazon.profit += getProfit(weekData.amazon);
      monthlyAgg[monthKey].amazon.adSpend += weekData.amazon?.adSpend || 0;
      monthlyAgg[monthKey].amazon.cogs += weekData.amazon?.cogs || 0;
      monthlyAgg[monthKey].amazon.returns += weekData.amazon?.returns || 0;
      monthlyAgg[monthKey].amazon.fees += weekData.amazon?.fees || 0;
      
      // Aggregate Shopify
      monthlyAgg[monthKey].shopify.revenue += weekData.shopify?.revenue || 0;
      monthlyAgg[monthKey].shopify.units += weekData.shopify?.units || 0;
      monthlyAgg[monthKey].shopify.profit += getProfit(weekData.shopify);
      monthlyAgg[monthKey].shopify.adSpend += weekData.shopify?.adSpend || 0;
      monthlyAgg[monthKey].shopify.metaSpend += weekData.shopify?.metaSpend || 0;
      monthlyAgg[monthKey].shopify.googleSpend += weekData.shopify?.googleSpend || 0;
      monthlyAgg[monthKey].shopify.cogs += weekData.shopify?.cogs || 0;
      monthlyAgg[monthKey].shopify.discounts += weekData.shopify?.discounts || 0;
      
      // Aggregate totals
      monthlyAgg[monthKey].total.revenue += weekData.total?.revenue || 0;
      monthlyAgg[monthKey].total.units += weekData.total?.units || 0;
      monthlyAgg[monthKey].total.profit += getProfit(weekData.total);
      monthlyAgg[monthKey].total.adSpend += weekData.total?.adSpend || 0;
      monthlyAgg[monthKey].total.cogs += (weekData.amazon?.cogs || 0) + (weekData.shopify?.cogs || 0);
    });
    
    // Check if any monthly periods need updating
    let needsUpdate = false;
    const updatedPeriods = { ...allPeriodsData };
    
    // Only auto-aggregate recent months (last 2 years) - older data is already in period data
    const cutoffYear = new Date().getFullYear() - 1;
    Object.entries(monthlyAgg).forEach(([monthKey, monthData]) => {
      const year = parseInt(monthKey.slice(0, 4));
      if (year < cutoffYear) return; // Skip older data - it's already in period data
      
      const monthNum = parseInt(monthKey.slice(5, 7));
      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      const periodKey = `${monthNames[monthNum - 1]}-${year}`;
      
      const existingPeriod = updatedPeriods[periodKey];
      
      // Update if weekly aggregates have more data than existing period
      const weeklyTotal = monthData.total.revenue;
      const existingTotal = existingPeriod?.total?.revenue || 0;
      
      if (weeklyTotal > existingTotal * 1.01 || !existingPeriod) { // Allow 1% variance
        needsUpdate = true;
        
        updatedPeriods[periodKey] = {
          ...existingPeriod,
          period: periodKey,
          periodType: 'month',
          displayName: monthData.monthName,
          weeksIncluded: monthData.weeks,
          amazon: {
            revenue: monthData.amazon.revenue,
            units: monthData.amazon.units,
            profit: monthData.amazon.profit,
            adSpend: monthData.amazon.adSpend,
            cogs: monthData.amazon.cogs,
            returns: monthData.amazon.returns,
            fees: monthData.amazon.fees,
          },
          shopify: {
            revenue: monthData.shopify.revenue,
            units: monthData.shopify.units,
            profit: monthData.shopify.profit,
            adSpend: monthData.shopify.adSpend,
            metaSpend: monthData.shopify.metaSpend,
            googleSpend: monthData.shopify.googleSpend,
            cogs: monthData.shopify.cogs,
            discounts: monthData.shopify.discounts,
          },
          total: {
            revenue: monthData.total.revenue,
            units: monthData.total.units,
            profit: monthData.total.profit,
            adSpend: monthData.total.adSpend,
            cogs: monthData.total.cogs,
            margin: monthData.total.revenue > 0 ? (monthData.total.profit / monthData.total.revenue * 100) : 0,
          },
          aggregatedFromWeekly: true,
          lastUpdated: new Date().toISOString(),
        };
      }
    });
    
    if (needsUpdate) {
      setAllPeriodsData(updatedPeriods);
      try { safeLocalStorageSet('ecommerce_periods_v1', JSON.stringify(updatedPeriods)); } catch (e) { if (e?.message) devWarn("[catch]", e.message); }
    }
  }, [allWeeksData]); // Only depend on allWeeksData to avoid loops

  const processBulkImport = useCallback(() => {
    const cogsLookup = getCogsLookup();
    if (!files.amazon || !files.shopify) { setToast({ message: 'Upload Amazon & Shopify files', type: 'error' }); return; }
    if (Object.keys(cogsLookup).length === 0) { setToast({ message: 'Set up COGS first via Store → COGS', type: 'error' }); return; }
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
        if (net !== 0 || sold > 0 || ret > 0 || sales !== 0 || proceeds !== 0) { 
          amzRev += sales; amzUnits += sold; amzRet += ret; amzProfit += proceeds; amzFees += fees; amzAds += ads; // COGS already in Net proceeds - do NOT add from lookup
          if (sku) {
            if (!amazonSkuData[sku]) amazonSkuData[sku] = { sku, name, unitsSold: 0, returns: 0, netSales: 0, netProceeds: 0, adSpend: 0, cogs: 0 };
            amazonSkuData[sku].unitsSold += sold;
            amazonSkuData[sku].returns += ret;
            amazonSkuData[sku].netSales += sales;
            amazonSkuData[sku].netProceeds += proceeds;
            amazonSkuData[sku].adSpend += ads;
            // COGS already in Net proceeds - per-SKU cogs derived below
          }
        }
      });
      const amazonSkus = Object.values(amazonSkuData).sort((a, b) => b.netSales - a.netSales);
      if (amzRev > 0 || amzUnits > 0) {
        newWeeksData[weekEnd] = {
          weekEnding: weekEnd, createdAt: new Date().toISOString(),
          amazon: { revenue: amzRev, units: amzUnits, returns: amzRet, cogs: amzCogs, fees: amzFees, adSpend: amzAds, netProfit: amzProfit, 
            margin: amzRev > 0 ? (amzProfit/amzRev)*100 : 0, aov: amzUnits > 0 ? amzRev/amzUnits : 0, roas: amzAds > 0 ? amzRev/amzAds : 0,
            returnRate: amzUnits > 0 ? (amzRet/amzUnits)*100 : 0, skuData: amazonSkus, source: 'sku-economics' },
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
      const u = parseInt(r['Net items sold'] || r['Net quantity'] || 0);
      const grossSales = parseFloat(r['Gross sales'] || 0);
      const netSales = parseFloat(r['Net sales'] || 0);
      const s = grossSales > 0 ? grossSales : netSales;
      const sku = r['Product variant SKU'] || ''; 
      const name = r['Product title'] || r['Product'] || sku;
      const disc = Math.abs(parseFloat(r['Discounts'] || 0));
      const returns = Math.abs(parseFloat(r['Returns'] || 0));
      shopRev += s; shopUnits += u; shopCogs += (cogsLookup[sku] || 0) * u; shopDisc += disc;
      if (sku && (u > 0 || s !== 0)) {
        if (!shopifySkuData[sku]) shopifySkuData[sku] = { sku, name, unitsSold: 0, netSales: 0, grossSales: 0, discounts: 0, returns: 0, cogs: 0 };
        shopifySkuData[sku].unitsSold += u;
        shopifySkuData[sku].netSales += netSales;
        shopifySkuData[sku].grossSales += s;
        shopifySkuData[sku].discounts += disc;
        shopifySkuData[sku].returns += returns;
        shopifySkuData[sku].cogs += (cogsLookup[sku] || 0) * u;
      }
    });
    const shopifySkus = Object.values(shopifySkuData).sort((a, b) => b.netSales - a.netSales);
    const totalAmzRev = Object.values(newWeeksData).reduce((sum, w) => sum + (w.amazon?.revenue || 0), 0);
    if (totalAmzRev > 0 && shopRev > 0) {
      Object.keys(newWeeksData).forEach(weekEnd => {
        const week = newWeeksData[weekEnd];
        const prop = week.amazon.revenue / totalAmzRev;
        const wRev = shopRev * prop, wUnits = Math.round(shopUnits * prop), wCogs = shopCogs * prop, wDisc = shopDisc * prop;
        // shopRev is Gross sales, so subtract discounts for profit
        const wProfit = wRev - wDisc - wCogs;
        // Proportionally distribute SKU data
        const wShopifySkus = shopifySkus.map(s => ({ ...s, unitsSold: Math.round(s.unitsSold * prop), netSales: s.netSales * prop, grossSales: s.grossSales * prop, discounts: s.discounts * prop, cogs: s.cogs * prop }));
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
    if (!customStartDate || !customEndDate) { setToast({ message: 'Select start and end dates', type: 'error' }); return; }
    const start = new Date(customStartDate + 'T00:00:00'), end = new Date(customEndDate + 'T00:00:00');
    const weeksInRange = Object.entries(allWeeksData).filter(([w]) => { const d = new Date(w + 'T00:00:00'); return d >= start && d <= end; });
    if (!weeksInRange.length) { setToast({ message: 'No data found in selected date range', type: 'error' }); return; }

    const agg = { startDate: customStartDate, endDate: customEndDate, weeksIncluded: weeksInRange.length,
      amazon: { revenue: 0, units: 0, cogs: 0, adSpend: 0, netProfit: 0 }, shopify: { revenue: 0, units: 0, cogs: 0, adSpend: 0, netProfit: 0 },
      total: { revenue: 0, units: 0, cogs: 0, adSpend: 0, netProfit: 0 }, weeklyBreakdown: [] };

    weeksInRange.forEach(([w, d]) => {
      agg.amazon.revenue += d.amazon?.revenue || 0; agg.amazon.units += d.amazon?.units || 0; agg.amazon.cogs += d.amazon?.cogs || 0; agg.amazon.adSpend += d.amazon?.adSpend || 0; agg.amazon.netProfit += getProfit(d.amazon);
      agg.shopify.revenue += d.shopify?.revenue || 0; agg.shopify.units += d.shopify?.units || 0; agg.shopify.cogs += d.shopify?.cogs || 0; agg.shopify.adSpend += d.shopify?.adSpend || 0; agg.shopify.netProfit += getProfit(d.shopify);
      agg.total.revenue += d.total?.revenue || 0; agg.total.units += d.total?.units || 0; agg.total.cogs += d.total?.cogs || 0; agg.total.adSpend += d.total?.adSpend || 0; agg.total.netProfit += getProfit(d.total);
      agg.weeklyBreakdown.push({ week: w, revenue: d.total?.revenue || 0, profit: getProfit(d.total) });
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
    if (!periodFiles.amazon || !periodFiles.shopify || !periodLabel.trim()) { setToast({ message: 'Upload Amazon & Shopify files and enter a label (e.g., "January 2025")', type: 'error' }); return; }
    if (Object.keys(cogsLookup).length === 0) { setToast({ message: 'Set up COGS first via Store → COGS', type: 'error' }); return; }
    
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
      if (net !== 0 || sold > 0 || ret > 0 || sales !== 0 || proceeds !== 0) { 
        amzRev += sales; amzUnits += sold; amzRet += ret; amzProfit += proceeds; amzFees += fees; amzAds += ads; // COGS already in Net proceeds - do NOT add from lookup
        if (sku) {
          if (!amazonSkuData[sku]) amazonSkuData[sku] = { sku, name, unitsSold: 0, returns: 0, netSales: 0, netProceeds: 0, adSpend: 0, cogs: 0 };
          amazonSkuData[sku].unitsSold += sold;
          amazonSkuData[sku].returns += ret;
          amazonSkuData[sku].netSales += sales;
          amazonSkuData[sku].netProceeds += proceeds;
          amazonSkuData[sku].adSpend += ads;
          // COGS already in Net proceeds - per-SKU cogs derived below
        }
      }
    });

    let shopRev = 0, shopUnits = 0, shopCogs = 0, shopDisc = 0;
    const shopifySkuData = {};
    periodFiles.shopify.forEach(r => {
      const units = parseInt(r['Net items sold'] || r['Net quantity'] || 0);
      const grossSales = parseFloat(r['Gross sales'] || 0);
      const netSales = parseFloat(r['Net sales'] || 0);
      const sales = grossSales > 0 ? grossSales : netSales;
      const sku = r['Product variant SKU'] || '';
      const name = r['Product title'] || r['Product'] || sku;
      const disc = Math.abs(parseFloat(r['Discounts'] || 0));
      const returns = Math.abs(parseFloat(r['Returns'] || 0));
      shopRev += sales; shopUnits += units; shopCogs += (cogsLookup[sku] || 0) * units; shopDisc += disc;
      if (sku && (units > 0 || sales !== 0)) {
        if (!shopifySkuData[sku]) shopifySkuData[sku] = { sku, name, unitsSold: 0, netSales: 0, grossSales: 0, discounts: 0, returns: 0, cogs: 0 };
        shopifySkuData[sku].unitsSold += units;
        shopifySkuData[sku].netSales += netSales;
        shopifySkuData[sku].grossSales += sales;
        shopifySkuData[sku].discounts += disc;
        shopifySkuData[sku].returns += returns;
        shopifySkuData[sku].cogs += (cogsLookup[sku] || 0) * units;
      }
    });

    // Use enhanced 3PL parser
    const threeplData = parse3PLData(periodFiles.threepl);
    const threeplBreakdown = threeplData.breakdown;
    const threeplMetrics = threeplData.metrics;
    
    // Separate storage from fulfillment costs
    const storageCost = threeplBreakdown.storage || 0;
    const fulfillmentCost = threeplData.metrics.totalCost - storageCost;
    
    const totalRev = amzRev + shopRev;
    const shopifyShare = totalRev > 0 ? shopRev / totalRev : 1;
    const amazonShare = totalRev > 0 ? amzRev / totalRev : 0;
    
    const storageAlloc = leadTimeSettings.storageCostAllocation || 'proportional';
    let shopStorageCost = 0, amzStorageCost = 0;
    
    if (storageAlloc === 'shopify') {
      shopStorageCost = storageCost;
    } else if (storageAlloc === 'proportional') {
      shopStorageCost = storageCost * shopifyShare;
      amzStorageCost = storageCost * amazonShare;
    }

    const metaS = parseFloat(periodAdSpend.meta) || 0, googleS = parseFloat(periodAdSpend.google) || 0, shopAds = metaS + googleS;
    const shopThreeplCost = fulfillmentCost + (storageAlloc !== 'total' ? shopStorageCost : 0);
    // shopRev is Gross sales, so subtract discounts to get net profit
    const shopProfit = shopRev - shopDisc - shopCogs - shopThreeplCost - shopAds;
    const adjustedAmzProfit = storageAlloc === 'proportional' ? amzProfit - amzStorageCost : amzProfit;
    const totalProfit = adjustedAmzProfit + shopProfit - (storageAlloc === 'total' ? storageCost : 0);
    // Derive Amazon COGS from SKU Economics report (already embedded in Net proceeds)
    // amzProfit = Net proceeds total = Net sales - fees - ads - COGS
    amzCogs = Math.max(0, amzRev - amzFees - amzAds - amzProfit);
    // Derive per-SKU COGS from report data
    Object.values(amazonSkuData).forEach(s => { s.cogs = Math.max(0, (s.netSales || 0) - (s.netProceeds || 0) - (s.adSpend || 0)); });
    const totalCogs = amzCogs + shopCogs;

    const amazonSkus = Object.values(amazonSkuData).sort((a, b) => b.netSales - a.netSales);
    const shopifySkus = Object.values(shopifySkuData).sort((a, b) => b.netSales - a.netSales);

    const periodData = {
      label: periodLabel.trim(), createdAt: new Date().toISOString(),
      amazon: { revenue: amzRev, units: amzUnits, returns: amzRet, cogs: amzCogs, fees: amzFees, adSpend: amzAds, 
        storageCost: amzStorageCost, netProfit: adjustedAmzProfit, 
        margin: amzRev > 0 ? (adjustedAmzProfit/amzRev)*100 : 0, aov: amzUnits > 0 ? amzRev/amzUnits : 0, roas: amzAds > 0 ? amzRev/amzAds : 0,
        returnRate: amzUnits > 0 ? (amzRet/amzUnits)*100 : 0, skuData: amazonSkus, source: 'sku-economics' },
      shopify: { revenue: shopRev, units: shopUnits, cogs: shopCogs, 
        threeplCosts: shopThreeplCost, fulfillmentCost, storageCost: shopStorageCost,
        threeplBreakdown, threeplMetrics, adSpend: shopAds, metaSpend: metaS, googleSpend: googleS, discounts: shopDisc, netProfit: shopProfit, 
        netMargin: shopRev > 0 ? (shopProfit/shopRev)*100 : 0, aov: shopUnits > 0 ? shopRev/shopUnits : 0, roas: shopAds > 0 ? shopRev/shopAds : 0, skuData: shopifySkus },
      total: { revenue: totalRev, units: amzUnits + shopUnits, cogs: totalCogs, adSpend: amzAds + shopAds, 
        storageCost, storageCostAllocation: storageAlloc,
        netProfit: totalProfit, netMargin: totalRev > 0 ? (totalProfit/totalRev)*100 : 0, roas: (amzAds + shopAds) > 0 ? totalRev/(amzAds + shopAds) : 0, 
        amazonShare: totalRev > 0 ? (amzRev/totalRev)*100 : 0, shopifyShare: totalRev > 0 ? (shopRev/totalRev)*100 : 0 }
    };

    const periodKey = periodLabel.trim().toLowerCase().replace(/\s+/g, '-');
    const updated = { ...allPeriodsData, [periodKey]: periodData };
    setAllPeriodsData(updated); savePeriods(updated); setSelectedPeriod(periodKey); setView('period-view'); setIsProcessing(false);
    setPeriodFiles({ amazon: null, shopify: null, threepl: [] }); setPeriodFileNames({ amazon: '', shopify: '', threepl: [] }); setPeriodAdSpend({ meta: '', google: '' }); setPeriodLabel('');
    audit('period_save', selectedPeriod); setToast({ message: 'Period data saved successfully!', type: 'success' });
  }, [periodFiles, periodAdSpend, periodLabel, allPeriodsData, savedCogs, savePeriods]);

  const deletePeriod = (k) => { 
    const data = allPeriodsData[k];
    if (!data) return;
    
    // Show preview of what's being deleted
    const revenue = data.total?.revenue || 0;
    const units = data.total?.units || 0;
    
    // Delete immediately but allow undo
    const u = { ...allPeriodsData }; 
    delete u[k]; 
    setAllPeriodsData(u); 
    savePeriods(u); 
    
    // Store deleted item for undo
    const undoId = Date.now();
    const undoTimer = setTimeout(() => {
      setDeletedItems(prev => prev.filter(item => item.id !== undoId));
    }, 10000);
    
    setDeletedItems(prev => [...prev, { id: undoId, type: 'period', key: k, data, undoTimer }]);
    setToast({ 
      message: `Deleted ${k} ($${revenue.toFixed(0)} rev, ${units} units)`, 
      type: 'warning',
      action: {
        label: 'Undo',
        onClick: () => {
          clearTimeout(undoTimer);
          const restored = { ...allPeriodsData, [k]: data };
          setAllPeriodsData(restored);
          savePeriods(restored);
          setSelectedPeriod(k);
          setDeletedItems(prev => prev.filter(item => item.id !== undoId));
          setToast({ message: `Restored ${k}`, type: 'success' });
        }
      }
    });
    
    const r = Object.keys(u).sort().reverse(); 
    if (r.length) setSelectedPeriod(r[0]); 
    else { setUploadTab('period'); setView('upload'); setSelectedPeriod(null); }
  };

  const processInventory = useCallback(async () => {
    
    // DIRECT READ from localStorage to get SKU velocity data
    // Use lsGet to handle LZ compression properly
    let legacyDailyData = {};
    try {
      // Try the current key first (where Shopify sync saves data)
      // Use lsGet to decompress if needed
      let dailyRaw = lsGet('ecommerce_daily_sales_v1');
      if (dailyRaw) {
        legacyDailyData = typeof dailyRaw === 'string' ? JSON.parse(dailyRaw) : dailyRaw;
      }
      
      // Also check legacy key (not compressed) and merge if it has additional data
      const legacyRaw = localStorage.getItem('dailySales');
      if (legacyRaw) {
        try {
          const legacyData = JSON.parse(legacyRaw);
          // Merge legacy data (newer data takes precedence)
          Object.keys(legacyData).forEach(date => {
            if (!legacyDailyData[date]) {
              legacyDailyData[date] = legacyData[date];
            }
          });
        } catch (e) { if (e?.message) devWarn("[catch]", e.message); }
      }
      
      // Log data availability by channel
      const datesWithAmazonSku = Object.keys(legacyDailyData).filter(d => {
        const amzSku = legacyDailyData[d]?.amazon?.skuData;
        return (Array.isArray(amzSku) && amzSku.length > 0) || (amzSku && typeof amzSku === 'object' && Object.keys(amzSku).length > 0);
      });
      const datesWithShopifySku = Object.keys(legacyDailyData).filter(d => {
        const shopSku = legacyDailyData[d]?.shopify?.skuData;
        return (Array.isArray(shopSku) && shopSku.length > 0) || (shopSku && typeof shopSku === 'object' && Object.keys(shopSku).length > 0);
      });
      
      // Log sample Shopify SKU data structure if available
      if (datesWithShopifySku.length > 0) {
        const sampleDate = datesWithShopifySku[0];
        const sampleSkuData = legacyDailyData[sampleDate]?.shopify?.skuData;
        const firstSku = Array.isArray(sampleSkuData) ? sampleSkuData[0] : Object.values(sampleSkuData || {})[0];
      }
    } catch (e) {
      devError('Failed to read daily data from localStorage:', e);
    }
    
    // File is optional if Amazon SP-API is connected
    const hasAmazonFile = invFiles.amazon && invFiles.amazon.length > 0;
    const hasAmazonApi = amazonCredentials.refreshToken;
    
    if (!hasAmazonFile && !hasAmazonApi) { 
      setToast({ message: 'Upload Amazon FBA file or connect Amazon SP-API', type: 'error' }); 
      return; 
    }
    
    // Auto-set snapshot date to today if using API and no date selected
    let snapshotDate = invSnapshotDate;
    if (!snapshotDate && hasAmazonApi) {
      snapshotDate = new Date().toISOString().split('T')[0];
      setInvSnapshotDate(snapshotDate);
    }
    if (!snapshotDate) {
      setToast({ message: 'Please select a snapshot date', type: 'error' });
      return;
    }
    setIsProcessing(true);

    const cogsLookup = { ...savedCogs };
    if (invFiles.cogs) invFiles.cogs.forEach(r => { 
      const s = r['SKU'] || r['sku']; 
      if (s) cogsLookup[s] = parseFloat(r['Cost Per Unit'] || 0); 
    });

    // Build velocity from ALL available sales data sources
    // Priority: Weekly > Daily > Monthly (but we'll use all available)
    const sortedWeeks = Object.keys(allWeeksData).sort().reverse().slice(0, 4);
    const weeksCount = sortedWeeks.length;
    const shopifySkuVelocity = {};
    const amazonSkuVelocity = {};
    let velocityDataSource = 'none';
    
    // FIRST: Calculate velocity from DIRECT localStorage read (most reliable)
    const legacyDates = Object.keys(legacyDailyData).sort().reverse();
    
    // Check for dates with SKU data from EITHER channel
    const hasSkuData = (dayData) => {
      const amzSku = dayData?.amazon?.skuData;
      const shopSku = dayData?.shopify?.skuData;
      const amzHasData = (Array.isArray(amzSku) && amzSku.length > 0) || (amzSku && typeof amzSku === 'object' && Object.keys(amzSku).length > 0);
      const shopHasData = (Array.isArray(shopSku) && shopSku.length > 0) || (shopSku && typeof shopSku === 'object' && Object.keys(shopSku).length > 0);
      return amzHasData || shopHasData;
    };
    
    const datesWithSkuData = legacyDates.filter(d => hasSkuData(legacyDailyData[d]));
    const datesWithAmazonSku = legacyDates.filter(d => {
      const amzSku = legacyDailyData[d]?.amazon?.skuData;
      return (Array.isArray(amzSku) && amzSku.length > 0) || (amzSku && typeof amzSku === 'object' && Object.keys(amzSku).length > 0);
    });
    const datesWithShopifySku = legacyDates.filter(d => {
      const shopSku = legacyDailyData[d]?.shopify?.skuData;
      return (Array.isArray(shopSku) && shopSku.length > 0) || (shopSku && typeof shopSku === 'object' && Object.keys(shopSku).length > 0);
    });
    
    if (datesWithSkuData.length > 0) {
      
      const last28 = datesWithSkuData.slice(0, 28);
      
      // BUG FIX: Calculate per-channel weeksEquiv to avoid cross-channel dilution
      // If Amazon has 28 days of data but Shopify only 10, using combined count (28/7=4) 
      // would understate Shopify velocity by ~3x
      const amzDaysInWindow = last28.filter(d => {
        const amzSku = legacyDailyData[d]?.amazon?.skuData;
        return (Array.isArray(amzSku) && amzSku.length > 0) || (amzSku && typeof amzSku === 'object' && Object.keys(amzSku).length > 0);
      }).length;
      const shopDaysInWindow = last28.filter(d => {
        const shopSku = legacyDailyData[d]?.shopify?.skuData;
        return (Array.isArray(shopSku) && shopSku.length > 0) || (shopSku && typeof shopSku === 'object' && Object.keys(shopSku).length > 0);
      }).length;
      const amzWeeksEquiv = Math.max(amzDaysInWindow / 7, 0.14); // min ~1 day to avoid div/0
      const shopWeeksEquiv = Math.max(shopDaysInWindow / 7, 0.14);
      
      last28.forEach(d => {
        const dayData = legacyDailyData[d];
        // Amazon SKU data - store under multiple key variants for flexible matching
        const amazonSkuData = dayData?.amazon?.skuData;
        const amazonSkuList = Array.isArray(amazonSkuData) ? amazonSkuData : Object.values(amazonSkuData || {});
        amazonSkuList.forEach(item => {
          if (!item.sku) return;
          const units = item.unitsSold || item.units || 0;
          const velocity = units / amzWeeksEquiv;
          
          // BUG FIX: Use Set to avoid double-counting when SKU variants resolve to same string
          const keys = new Set([item.sku, item.sku.replace(/shop$/i, '').toUpperCase(), item.sku.toLowerCase(), item.sku.replace(/shop$/i, '').toLowerCase()]);
          keys.forEach(k => {
            if (!amazonSkuVelocity[k]) amazonSkuVelocity[k] = 0;
            amazonSkuVelocity[k] += velocity;
          });
        });
        // Shopify SKU data - store under multiple key variants for flexible matching
        const shopifySkuData = dayData?.shopify?.skuData;
        const shopifySkuList = Array.isArray(shopifySkuData) ? shopifySkuData : Object.values(shopifySkuData || {});
        shopifySkuList.forEach(item => {
          if (!item.sku) return;
          const units = item.unitsSold || item.units || 0;
          const velocity = units / shopWeeksEquiv;
          
          // BUG FIX: Use Set to avoid double-counting when SKU variants resolve to same string
          const keys = new Set([item.sku, item.sku.replace(/shop$/i, '').toUpperCase(), item.sku.toLowerCase(), item.sku.replace(/shop$/i, '').toLowerCase()]);
          keys.forEach(k => {
            if (!shopifySkuVelocity[k]) shopifySkuVelocity[k] = 0;
            shopifySkuVelocity[k] += velocity;
          });
        });
      });
      
      velocityDataSource = 'direct-localStorage';
    }
    
    // DEBUG: Log data availability
    
    // ALWAYS process weekly data - either as primary source or supplement for slow-moving SKUs
    // Daily data (from localStorage) covers last 28 days - great for fast sellers
    // Weekly data covers ALL weeks - catches slow-moving products that may not sell in any 28-day window
    const useWeeklyAsPrimary = velocityDataSource !== 'direct-localStorage';
    if (true) { // Always run - supplement slow movers even if daily data exists
    // SOURCE 1: Weekly sales data
    if (weeksCount > 0) {
      if (useWeeklyAsPrimary) velocityDataSource = 'weekly';
      else velocityDataSource += '+weekly-supplement';
      
      // Build weekly velocity lookup (separate from daily to avoid overwriting)
      const weeklyShopVel = {};
      const weeklyAmzVel = {};
      
      sortedWeeks.forEach(w => {
        const weekData = allWeeksData[w];
        
        // DEBUG: Log week structure in detail
        
        if (weekData.amazon?.skuData) {
          const skuArr = Array.isArray(weekData.amazon.skuData) ? weekData.amazon.skuData : Object.values(weekData.amazon.skuData);
          if (skuArr.length > 0) {
          }
        }
        if (weekData.shopify?.skuData) {
          const skuArr = Array.isArray(weekData.shopify.skuData) ? weekData.shopify.skuData : Object.values(weekData.shopify.skuData);
          if (skuArr.length > 0) {
          }
        }
        
        // Shopify SKU velocity - store in weekly accumulator
        if (weekData.shopify?.skuData) {
          const skuData = Array.isArray(weekData.shopify.skuData) 
            ? weekData.shopify.skuData 
            : Object.values(weekData.shopify.skuData);
          skuData.forEach(item => {
            if (!item.sku) return;
            if (!weeklyShopVel[item.sku]) weeklyShopVel[item.sku] = 0;
            const units = item.unitsSold || item.units || 0;
            weeklyShopVel[item.sku] += units;
          });
        }
        
        // Amazon SKU velocity from weekly data - store in weekly accumulator
        if (weekData.amazon?.skuData) {
          const skuData = Array.isArray(weekData.amazon.skuData)
            ? weekData.amazon.skuData
            : Object.values(weekData.amazon.skuData);
          skuData.forEach(item => {
            if (!item.sku) return;
            if (!weeklyAmzVel[item.sku]) weeklyAmzVel[item.sku] = 0;
            const units = item.unitsSold || item.units || 0;
            weeklyAmzVel[item.sku] += units;
          });
        }
      });
      
      // DEBUG: Log velocity totals after processing weekly data
      if (Object.keys(amazonSkuVelocity).length > 0) {
        const sampleSku = Object.keys(amazonSkuVelocity)[0];
      }
      
      // Convert totals to weekly averages
      Object.keys(weeklyShopVel).forEach(sku => {
        weeklyShopVel[sku] = weeklyShopVel[sku] / weeksCount;
      });
      Object.keys(weeklyAmzVel).forEach(sku => {
        weeklyAmzVel[sku] = weeklyAmzVel[sku] / weeksCount;
      });
      
      // Merge strategy: weekly data fills in gaps for slow-movers
      // If daily data already has velocity for a SKU, keep it (more recent/accurate)
      // If daily data has 0 velocity for a SKU, use weekly average (longer window catches slow sellers)
      let weeklySupplementCount = 0;
      Object.keys(weeklyShopVel).forEach(sku => {
        if (!shopifySkuVelocity[sku] || shopifySkuVelocity[sku] === 0) {
          shopifySkuVelocity[sku] = weeklyShopVel[sku];
          // Also store under normalized variants
          const baseSku = sku.replace(/shop$/i, '').toUpperCase();
          const skuLower = sku.toLowerCase();
          const baseSkuLower = baseSku.toLowerCase();
          if (!shopifySkuVelocity[baseSku]) shopifySkuVelocity[baseSku] = weeklyShopVel[sku];
          if (!shopifySkuVelocity[skuLower]) shopifySkuVelocity[skuLower] = weeklyShopVel[sku];
          if (!shopifySkuVelocity[baseSkuLower]) shopifySkuVelocity[baseSkuLower] = weeklyShopVel[sku];
          weeklySupplementCount++;
        }
      });
      Object.keys(weeklyAmzVel).forEach(sku => {
        if (!amazonSkuVelocity[sku] || amazonSkuVelocity[sku] === 0) {
          amazonSkuVelocity[sku] = weeklyAmzVel[sku];
          const baseSku = sku.replace(/shop$/i, '').toUpperCase();
          const skuLower = sku.toLowerCase();
          const baseSkuLower = baseSku.toLowerCase();
          if (!amazonSkuVelocity[baseSku]) amazonSkuVelocity[baseSku] = weeklyAmzVel[sku];
          if (!amazonSkuVelocity[skuLower]) amazonSkuVelocity[skuLower] = weeklyAmzVel[sku];
          if (!amazonSkuVelocity[baseSkuLower]) amazonSkuVelocity[baseSkuLower] = weeklyAmzVel[sku];
        }
      });
      
    }
    
    // SOURCE 2: Daily sales data - use if we have it and weekly didn't cover these SKUs
    const dailyDates = Object.keys(allDaysData).filter(d => {
      const dayData = allDaysData[d];
      return dayData && (dayData.amazon?.units > 0 || dayData.shopify?.units > 0);
    }).sort().reverse();
    let dailyDaysCount = dailyDates.length; // Track at function level for later use
    
    if (dailyDates.length > 0) {
      if (velocityDataSource === 'none') velocityDataSource = 'daily';
      else velocityDataSource += '+daily';
      
      // Group last 28 days of daily data
      const recentDays = dailyDates.slice(0, 28);
      const daysCount = recentDays.length;
      dailyDaysCount = daysCount; // Update with actual used count
      const weeksEquivalent = daysCount / 7;
      
      // DEBUG: Log daily data structure
      
      // Check a few days for skuData
      let amazonSkuDataFound = 0;
      let shopifySkuDataFound = 0;
      recentDays.slice(0, 5).forEach(d => {
        const day = allDaysData[d];
        const amzSkuData = day?.amazon?.skuData;
        const shopSkuData = day?.shopify?.skuData;
        if ((Array.isArray(amzSkuData) && amzSkuData.length > 0) || (amzSkuData && typeof amzSkuData === 'object' && Object.keys(amzSkuData).length > 0)) amazonSkuDataFound++;
        if ((Array.isArray(shopSkuData) && shopSkuData.length > 0) || (shopSkuData && typeof shopSkuData === 'object' && Object.keys(shopSkuData).length > 0)) shopifySkuDataFound++;
      });
      
      if (recentDays.length > 0) {
        const sampleDay = allDaysData[recentDays[0]];
        const shopifySkuData = sampleDay?.shopify?.skuData;
        const amazonSkuData = sampleDay?.amazon?.skuData;
        const shopifySkuDataLen = Array.isArray(shopifySkuData) ? shopifySkuData.length : Object.keys(shopifySkuData || {}).length;
        const amazonSkuDataLen = Array.isArray(amazonSkuData) ? amazonSkuData.length : Object.keys(amazonSkuData || {}).length;
      }
      
      // Temp accumulators for daily data
      const dailyAmazonVel = {};
      const dailyShopifyVel = {};
      
      recentDays.forEach(dayKey => {
        const dayData = allDaysData[dayKey];
        
        if (dayData.amazon?.skuData) {
          const skuData = Array.isArray(dayData.amazon.skuData)
            ? dayData.amazon.skuData
            : Object.values(dayData.amazon.skuData);
          skuData.forEach(item => {
            if (!item.sku) return;
            if (!dailyAmazonVel[item.sku]) dailyAmazonVel[item.sku] = 0;
            // Check multiple field names for units
            const units = item.unitsSold || item.units || item.Units || item.UNITS || item.quantity || 0;
            dailyAmazonVel[item.sku] += units;
          });
        }
        
        if (dayData.shopify?.skuData) {
          const skuData = Array.isArray(dayData.shopify.skuData)
            ? dayData.shopify.skuData
            : Object.values(dayData.shopify.skuData);
          skuData.forEach(item => {
            if (!item.sku) return;
            if (!dailyShopifyVel[item.sku]) dailyShopifyVel[item.sku] = 0;
            // Check multiple field names for units
            const units = item.unitsSold || item.units || item.Units || item.UNITS || item.quantity || 0;
            dailyShopifyVel[item.sku] += units;
          });
        }
      });
      
      // Convert to weekly and merge (only add if not already in weekly data)
      if (weeksEquivalent > 0) {
        Object.keys(dailyAmazonVel).forEach(sku => {
          const weeklyRate = dailyAmazonVel[sku] / weeksEquivalent;
          if (!amazonSkuVelocity[sku] || amazonSkuVelocity[sku] === 0) {
            amazonSkuVelocity[sku] = weeklyRate;
          }
        });
        Object.keys(dailyShopifyVel).forEach(sku => {
          const weeklyRate = dailyShopifyVel[sku] / weeksEquivalent;
          if (!shopifySkuVelocity[sku] || shopifySkuVelocity[sku] === 0) {
            shopifySkuVelocity[sku] = weeklyRate;
          }
        });
      }
      
    }
    
    // SOURCE 3: Monthly/Period data - use for SKUs not covered by weekly or daily
    const WEEKS_PER_MONTH = 4.33;
    const sortedPeriods = Object.keys(allPeriodsData).sort().reverse().slice(0, 3);
    const periodsCount = sortedPeriods.length;
    
    if (periodsCount > 0) {
      if (velocityDataSource === 'none') velocityDataSource = 'monthly';
      else velocityDataSource += '+monthly';
      
      // Temp accumulators for period data
      const periodAmazonVel = {};
      const periodShopifyVel = {};
      
      sortedPeriods.forEach(periodKey => {
        const periodData = allPeriodsData[periodKey];
        
        // Amazon SKU velocity from period data
        if (periodData.amazon?.skuData) {
          const skuData = Array.isArray(periodData.amazon.skuData)
            ? periodData.amazon.skuData
            : Object.values(periodData.amazon.skuData);
          skuData.forEach(item => {
            if (!item.sku) return;
            // Divide monthly units by weeks per month to get weekly rate
            const weeklyUnits = (item.unitsSold || item.units || 0) / WEEKS_PER_MONTH;
            if (!periodAmazonVel[item.sku]) periodAmazonVel[item.sku] = 0;
            periodAmazonVel[item.sku] += weeklyUnits;
          });
        }
        
        // Shopify SKU velocity from period data
        if (periodData.shopify?.skuData) {
          const skuData = Array.isArray(periodData.shopify.skuData)
            ? periodData.shopify.skuData
            : Object.values(periodData.shopify.skuData);
          skuData.forEach(item => {
            if (!item.sku) return;
            const weeklyUnits = (item.unitsSold || item.units || 0) / WEEKS_PER_MONTH;
            if (!periodShopifyVel[item.sku]) periodShopifyVel[item.sku] = 0;
            periodShopifyVel[item.sku] += weeklyUnits;
          });
        }
      });
      
      // Average across periods and merge (only add if not already covered)
      if (periodsCount > 0) {
        Object.keys(periodAmazonVel).forEach(sku => {
          const avgWeeklyRate = periodAmazonVel[sku] / periodsCount;
          if (!amazonSkuVelocity[sku] || amazonSkuVelocity[sku] === 0) {
            amazonSkuVelocity[sku] = avgWeeklyRate;
          }
        });
        Object.keys(periodShopifyVel).forEach(sku => {
          const avgWeeklyRate = periodShopifyVel[sku] / periodsCount;
          if (!shopifySkuVelocity[sku] || shopifySkuVelocity[sku] === 0) {
            shopifySkuVelocity[sku] = avgWeeklyRate;
          }
        });
      }
      
    }
    } // End of: always process weekly+monthly data as supplement for slow movers
    
    
    const hasWeeklyVelocityData = Object.keys(amazonSkuVelocity).length > 0 || Object.keys(shopifySkuVelocity).length > 0;

    // ===== INDUSTRY-STANDARD ENHANCEMENTS: Safety Stock, Seasonality, CV =====
    // 1. Safety Stock = Z × σ_weekly × √(lead_time_weeks) — protects against demand spikes
    // 2. Seasonality Index = monthly_avg / overall_avg — adjusts velocity for seasonal patterns
    // 3. Coefficient of Variation (CV) = σ / μ — classifies demand pattern
    const skuDemandStats = {}; // { sku: { weeklyDemands: [], monthlyDemands: {}, safetyStock, seasonalIndex, cv, demandClass } }
    const Z_SERVICE_LEVEL = 1.65; // 95% service level (industry standard for DTC)
    
    try {
      // Build weekly demand series per SKU from all available data
      const weeklySkuDemand = {}; // { sku: { 'YYYY-WW': units } }
      const monthlySkuDemand = {}; // { sku: { 'YYYY-MM': units } }
      
      // Use daily data to build weekly/monthly aggregates
      const allDateKeys = Object.keys(allDaysData).sort();
      allDateKeys.forEach(dateKey => {
        const day = allDaysData[dateKey];
        const weekNum = (() => {
          const d = new Date(dateKey);
          const oneJan = new Date(d.getFullYear(), 0, 1);
          return `${d.getFullYear()}-W${String(Math.ceil((((d - oneJan) / 86400000) + oneJan.getDay() + 1) / 7)).padStart(2, '0')}`;
        })();
        const monthKey = dateKey.substring(0, 7);
        
        // Process both channels
        ['shopify', 'amazon'].forEach(channel => {
          const skuData = day?.[channel]?.skuData;
          const skuList = Array.isArray(skuData) ? skuData : Object.values(skuData || {});
          skuList.forEach(item => {
            if (!item.sku) return;
            const normalizedSku = item.sku.replace(/shop$/i, '').toUpperCase();
            const units = item.unitsSold || item.units || 0;
            
            if (!weeklySkuDemand[normalizedSku]) weeklySkuDemand[normalizedSku] = {};
            if (!weeklySkuDemand[normalizedSku][weekNum]) weeklySkuDemand[normalizedSku][weekNum] = 0;
            weeklySkuDemand[normalizedSku][weekNum] += units;
            
            if (!monthlySkuDemand[normalizedSku]) monthlySkuDemand[normalizedSku] = {};
            if (!monthlySkuDemand[normalizedSku][monthKey]) monthlySkuDemand[normalizedSku][monthKey] = 0;
            monthlySkuDemand[normalizedSku][monthKey] += units;
          });
        });
      });
      
      // Calculate stats for each SKU
      Object.entries(weeklySkuDemand).forEach(([sku, weeklyData]) => {
        const weeklyValues = Object.values(weeklyData);
        const n = weeklyValues.length;
        if (n < 2) return; // Need at least 2 weeks for meaningful stats
        
        // Mean weekly demand
        const mean = weeklyValues.reduce((s, v) => s + v, 0) / n;
        
        // Standard deviation of weekly demand
        const variance = weeklyValues.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (n - 1);
        const stdDev = Math.sqrt(variance);
        
        // CV = σ / μ (coefficient of variation)
        const cv = mean > 0 ? stdDev / mean : 0;
        
        // Demand classification based on CV
        // Industry standard: Syntetos-Boylan classification
        let demandClass = 'smooth'; // CV < 0.5
        if (cv >= 1.0) demandClass = 'intermittent'; // Very erratic
        else if (cv >= 0.5) demandClass = 'lumpy'; // Moderate variability
        
        // Safety Stock = Z × σ × √(LT_weeks)
        // Lead time in weeks (default 14 days = 2 weeks, will be overridden per-SKU later)
        const defaultLeadTimeWeeks = (leadTimeSettings.defaultLeadTimeDays || 14) / 7;
        const safetyStock = Math.ceil(Z_SERVICE_LEVEL * stdDev * Math.sqrt(defaultLeadTimeWeeks));
        
        // Seasonality: Build monthly index
        // Compare each calendar month's avg demand to overall monthly average
        const monthlyData = monthlySkuDemand[sku] || {};
        const monthlyValues = Object.values(monthlyData);
        const overallMonthlyAvg = monthlyValues.length > 0 
          ? monthlyValues.reduce((s, v) => s + v, 0) / monthlyValues.length 
          : 0;
        
        // Group by calendar month (1-12) across years
        const calendarMonthTotals = {};
        const calendarMonthCounts = {};
        Object.entries(monthlyData).forEach(([monthKey, units]) => {
          const calMonth = parseInt(monthKey.split('-')[1]); // 1-12
          if (!calendarMonthTotals[calMonth]) { calendarMonthTotals[calMonth] = 0; calendarMonthCounts[calMonth] = 0; }
          calendarMonthTotals[calMonth] += units;
          calendarMonthCounts[calMonth]++;
        });
        
        // Build seasonal index for each calendar month
        const seasonalIndex = {};
        for (let m = 1; m <= 12; m++) {
          if (calendarMonthCounts[m] && overallMonthlyAvg > 0) {
            const monthAvg = calendarMonthTotals[m] / calendarMonthCounts[m];
            seasonalIndex[m] = monthAvg / overallMonthlyAvg;
          } else {
            seasonalIndex[m] = 1.0; // Default: no seasonal adjustment
          }
        }
        
        // Current month's seasonal factor
        const currentMonth = new Date().getMonth() + 1; // 1-12
        const currentSeasonalFactor = seasonalIndex[currentMonth] || 1.0;
        
        skuDemandStats[sku] = {
          weeklyMean: mean,
          weeklyStdDev: stdDev,
          cv: Math.round(cv * 100) / 100, // Round to 2 decimals
          demandClass,
          safetyStock,
          seasonalIndex,
          currentSeasonalFactor: Math.round(currentSeasonalFactor * 100) / 100,
          weeksOfData: n,
          monthsOfData: monthlyValues.length,
        };
      });
      
      const demandClasses = Object.values(skuDemandStats).reduce((acc, s) => { acc[s.demandClass] = (acc[s.demandClass] || 0) + 1; return acc; }, {});
      // Show a sample
      const sampleSku = Object.keys(skuDemandStats)[0];
      if (sampleSku) {
        const s = skuDemandStats[sampleSku];
      }
    } catch (statsErr) {
      devWarn('Demand stats calculation error:', statsErr);
    }
    
    // Store to ref so Packiyo sync can access it
    skuDemandStatsRef.current = skuDemandStats;

    // ===== AMAZON FBA/AWD INVENTORY - Use SP-API if connected, otherwise fall back to file upload =====
    const amzInv = {};
    let amzTotal = 0, amzValue = 0, amzInbound = 0;
    let amzSource = 'file-upload';
    let awdData = {};
    let awdTotal = 0;
    let awdValue = 0;

    // Try Amazon SP-API first if connected
    if (amazonCredentials.refreshToken) {
      try {
        const res = await fetch('/api/amazon/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: amazonCredentials.clientId,
            clientSecret: amazonCredentials.clientSecret,
            refreshToken: amazonCredentials.refreshToken,
            sellerId: amazonCredentials.sellerId,
            marketplaceId: amazonCredentials.marketplaceId,
            syncType: 'all', // Get both FBA and AWD
          }),
        });
        const data = await res.json();
        
        if (data.success && data.items) {
          amzSource = data.source || 'amazon-sp-api';
          
          // Log AWD data availability
          const awdItems = data.items.filter(i => (i.awdQuantity || 0) > 0 || (i.awdInbound || 0) > 0);
          console.log('[Inventory] Amazon API response:', { 
            totalItems: data.items.length, 
            awdItemCount: awdItems.length,
            awdError: data.awdError || 'none',
            awdErrorDetails: data.awdErrorDetails || '',
            sampleAwdItem: awdItems[0] || 'no AWD items found',
            syncType: data.syncType
          });
          
          const seenAmzSkus = new Set(); // Track duplicates
          data.items.forEach(item => {
            const sku = item.sku;
            if (!sku) return;
            
            // Skip duplicates (case-insensitive)
            const skuLower = sku.toLowerCase();
            if (seenAmzSkus.has(skuLower)) return;
            seenAmzSkus.add(skuLower);
            
            const skuUpper = sku.toUpperCase();
            
            // Use FBA quantities (AWD is separate distribution inventory)
            const avail = item.fbaFulfillable || item.available || 0;
            const reserved = item.fbaReserved || 0;
            const inb = item.fbaInbound || item.amazonInbound || 0;
            const total = avail + reserved;
            
            const cost = cogsLookup[sku] || cogsLookup[skuLower] || cogsLookup[skuUpper] || 0;
            amzTotal += total;
            amzValue += total * cost;
            amzInbound += inb;
            
            // Get velocity - try multiple case variants
            const amzVelFromWeekly = amazonSkuVelocity[sku] || amazonSkuVelocity[skuLower] || amazonSkuVelocity[skuUpper] || 0;
            const amzWeeklyVel = amzVelFromWeekly > 0 ? amzVelFromWeekly : 0;
            
            const itemData = { 
              sku: skuUpper, // Normalize to uppercase 
              asin: item.asin || '', 
              name: item.name || sku, 
              total, 
              inbound: inb, 
              cost, 
              amzWeeklyVel 
            };
            
            // Store under UPPERCASE for consistency
            amzInv[skuUpper] = itemData;
            
            // Track AWD separately
            if ((item.awdQuantity || 0) > 0 || (item.awdInbound || 0) > 0 || (item.awdReplenishment || 0) > 0) {
              const awdCost = cogsLookup[item.sku] || cogsLookup[skuLower] || cogsLookup[skuUpper] || 
                              cogsLookup[item.sku.replace(/Shop$/i, '')] || cogsLookup[item.sku.replace(/Shop$/i, '').toLowerCase()] || 0;
              awdData[skuUpper] = {
                sku: skuUpper,
                awdQuantity: item.awdQuantity || 0,
                awdInbound: item.awdInbound || 0,
                awdReplenishment: item.awdReplenishment || 0,
              };
              awdTotal += (item.awdQuantity || 0);
              awdValue += (item.awdQuantity || 0) * awdCost;
            }
          });
          
          // Update Amazon last sync time
          setAmazonCredentials(p => ({ ...p, lastSync: new Date().toISOString() }));
          console.log('[Inventory] AWD extraction:', { awdSkuCount: Object.keys(awdData).length, awdTotal, awdValue: awdValue.toFixed(2) });
        }
      } catch (err) {
        devError('Amazon SP-API sync failed, falling back to file:', err);
        // Fall through to file-based processing
      }
    }
    
    // Fall back to uploaded Amazon file if SP-API not connected or failed
    if (Object.keys(amzInv).length === 0 && invFiles.amazon) {
      amzSource = 'file-upload';
      const seenAmzSkus = new Set(); // Track duplicates
      invFiles.amazon.forEach(r => {
        const sku = r['sku'] || '', avail = parseInt(r['available'] || 0), inb = parseInt(r['inbound-quantity'] || 0);
        const res = parseInt(r['Total Reserved Quantity'] || 0), t30 = parseInt(r['units-shipped-t30'] || 0);
        const name = r['product-name'] || '', asin = r['asin'] || '';
        const skuLower = sku.toLowerCase();
        const skuUpper = sku.toUpperCase();
        
        // Skip duplicates (case-insensitive)
        if (seenAmzSkus.has(skuLower)) return;
        seenAmzSkus.add(skuLower);
        
        const cost = cogsLookup[sku] || cogsLookup[skuLower] || cogsLookup[skuUpper] || 0, total = avail + res;
        amzTotal += total; amzValue += total * cost; amzInbound += inb;
        
        // Use weekly data velocity if available, otherwise fall back to t30 from file
        const amzVelFromWeekly = amazonSkuVelocity[sku] || amazonSkuVelocity[skuLower] || amazonSkuVelocity[skuUpper] || 0;
        const amzVelFromFile = t30 / 4.3;
        const amzWeeklyVel = amzVelFromWeekly > 0 ? amzVelFromWeekly : amzVelFromFile;
        
        const itemData = { sku: skuUpper, asin, name, total, inbound: inb, cost, amzWeeklyVel };
        if (sku) {
          amzInv[skuUpper] = itemData; // Store under UPPERCASE
        }
      });
    }

    // ===== 3PL INVENTORY - Use Packiyo if connected, otherwise fall back to file upload =====
    let tplInv = {};
    let tplTotal = 0, tplValue = 0, tplInbound = 0;
    let tplSource = 'file';

    if (packiyoCredentials.connected && packiyoCredentials.apiKey) {
      // Fetch directly from Packiyo
      try {
        const res = await fetch('/api/packiyo/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: packiyoCredentials.apiKey,
            customerId: packiyoCredentials.customerId,
            baseUrl: packiyoCredentials.baseUrl,
            syncType: 'inventory',
          }),
        });
        const data = await res.json();
        
        if (data.success && data.items) {
          tplSource = 'packiyo-direct';
          
          // Track SKUs we've already added (case-insensitive)
          const seenSkusLower = new Set();
          
          data.items.forEach(item => {
            const sku = item.sku;
            if (!sku || sku.includes('Bundle') || item.name?.includes('Gift Card') || item.name?.includes('FREE')) return;
            
            // Case-insensitive duplicate check within Packiyo data
            const skuLower = sku.toLowerCase();
            if (seenSkusLower.has(skuLower)) {
              return;
            }
            seenSkusLower.add(skuLower);
            
            const qty = item.quantity_on_hand || 0;
            const inb = item.quantity_inbound || 0;
            // Try COGS with and without "Shop" suffix
            const cost = item.cost || cogsLookup[sku] || cogsLookup[sku.replace(/Shop$/i, '')] || 0;
            
            // ALWAYS include Packiyo SKUs - they're valid products even if temporarily out of stock
            // This ensures all 3PL products appear in inventory management
            tplTotal += qty;
            tplValue += qty * cost;
            tplInbound += inb;
            
            const itemData = { sku, name: item.name || sku, total: qty, inbound: inb, cost };
            
            // Store under UPPERCASE version for consistency
            tplInv[sku.toUpperCase()] = itemData;
          });
          
          // Update Packiyo last sync time
          setPackiyoCredentials(p => ({ ...p, lastSync: new Date().toISOString() }));
        }
      } catch (err) {
        devError('Packiyo sync failed, falling back to file:', err);
        // Fall through to file-based processing
      }
    }
    
    // Fall back to uploaded 3PL file if Packiyo not connected or failed
    if (Object.keys(tplInv).length === 0 && invFiles.threepl) {
      tplSource = 'file-upload';
      const seenTplSkus = new Set();
      invFiles.threepl.forEach(r => {
        const sku = r['sku'] || '', name = r['name'] || '', qty = parseInt(r['quantity_on_hand'] || 0);
        const inb = parseInt(r['quantity_inbound'] || 0);
        const skuLower = sku.toLowerCase();
        const skuUpper = sku.toUpperCase();
        
        // Skip duplicates
        if (seenTplSkus.has(skuLower)) return;
        seenTplSkus.add(skuLower);
        
        const cost = parseFloat(r['cost'] || 0) || cogsLookup[sku] || cogsLookup[skuLower] || cogsLookup[skuUpper] || 0;
        if (sku.includes('Bundle') || name.includes('Gift Card') || name.includes('FREE') || qty === 0) return;
        tplTotal += qty; tplValue += qty * cost; tplInbound += inb;
        
        const itemData = { sku: skuUpper, name, total: qty, inbound: inb, cost };
        if (sku) {
          tplInv[skuUpper] = itemData; // Store under UPPERCASE
        }
      });
    }

    // ===== HOME/OFFICE INVENTORY (Wormans Mill) from Shopify =====
    let homeInv = {};
    let homeTotal = 0, homeValue = 0;
    let homeSource = 'none';

    if (shopifyCredentials.connected) {
      try {
        const res = await fetch('/api/shopify/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeUrl: shopifyCredentials.storeUrl,
                                accessToken: shopifyCredentials.clientSecret,
            clientId: shopifyCredentials.clientId,
            clientSecret: shopifyCredentials.clientSecret,
            syncType: 'inventory',
          }),
        });
        const data = await res.json();
        
        if (data.success && data.items) {
          homeSource = 'shopify-sync';
          const seenHomeSkus = new Set();
          data.items.forEach(item => {
            const sku = item.sku;
            if (!sku) return;
            
            // Skip duplicates
            const skuLower = sku.toLowerCase();
            if (seenHomeSkus.has(skuLower)) return;
            seenHomeSkus.add(skuLower);
            
            const skuUpper = sku.toUpperCase();
            
            // Only get home/office location inventory (not 3PL locations)
            const homeQty = item.homeQty || 0;
            if (homeQty === 0) return;
            
            const cost = item.cost || cogsLookup[sku] || cogsLookup[skuLower] || cogsLookup[skuUpper] || 0;
            homeTotal += homeQty;
            homeValue += homeQty * cost;
            homeInv[skuUpper] = { sku: skuUpper, name: item.name || sku, total: homeQty, cost };
          });
        }
      } catch (err) {
        devError('Shopify inventory sync failed:', err);
      }
    }

    // ===== COMBINE ALL INVENTORY SOURCES =====
    // Build case-insensitive lookup maps for matching
    const tplInvLower = {};
    Object.entries(tplInv).forEach(([sku, data]) => {
      tplInvLower[sku.toLowerCase()] = data;
    });
    const homeInvLower = {};
    Object.entries(homeInv).forEach(([sku, data]) => {
      homeInvLower[sku.toLowerCase()] = data;
    });
    const amzInvLower = {};
    Object.entries(amzInv).forEach(([sku, data]) => {
      amzInvLower[sku.toLowerCase()] = data;
    });
    const amzVelLower = {};
    Object.entries(amazonSkuVelocity).forEach(([sku, vel]) => {
      amzVelLower[sku.toLowerCase()] = vel;
    });
    const shopVelLower = {};
    Object.entries(shopifySkuVelocity).forEach(([sku, vel]) => {
      shopVelLower[sku.toLowerCase()] = vel;
    });
    
    const allSkus = new Set([...Object.keys(amzInv), ...Object.keys(tplInv), ...Object.keys(homeInv)]);
    
    // Deduplicate SKUs - keep only one version of each SKU (prefer original case)
    const seenSkusLower = new Set();
    const uniqueSkus = [];
    allSkus.forEach(sku => {
      const skuLower = sku.toLowerCase();
      if (!seenSkusLower.has(skuLower)) {
        seenSkusLower.add(skuLower);
        uniqueSkus.push(sku);
      }
    });
    
    // Filter to only physical SKUs (those with COGS assigned)
    // Digital products without COGS should not appear in inventory tracking
    const cogsSkuSet = new Set();
    Object.keys(cogsLookup).forEach(k => {
      const cost = typeof cogsLookup[k] === 'number' ? cogsLookup[k] : cogsLookup[k]?.cost || 0;
      if (cost > 0) {
        cogsSkuSet.add(k.toLowerCase());
        // Also add variants (with/without Shop suffix)
        const base = k.replace(/shop$/i, '').toLowerCase();
        cogsSkuSet.add(base);
        cogsSkuSet.add(base + 'shop');
      }
    });
    
    const physicalSkus = cogsSkuSet.size > 0 
      ? uniqueSkus.filter(sku => cogsSkuSet.has(sku.toLowerCase()) || cogsSkuSet.has(sku.replace(/shop$/i, '').toLowerCase()))
      : uniqueSkus; // If no COGS at all, show everything (backwards compatible)
    
    const items = [];
    let critical = 0, low = 0, healthy = 0, overstock = 0;
    
    // Dynamic overstock threshold based on reorder cycle
    // If you order 22 weeks at a time with 60-day reorder trigger, having 200 days on hand is NORMAL
    // Overstock = more than one full order cycle + reorder trigger + lead time
    const globalLeadTimeDays = leadTimeSettings.defaultLeadTimeDays || 14;
    const globalMinOrderWeeks = leadTimeSettings.minOrderWeeks || 22;
    const globalReorderTriggerDays = leadTimeSettings.reorderTriggerDays || 60;
    const overstockThreshold = Math.max(90, (globalMinOrderWeeks * 7) + globalReorderTriggerDays + globalLeadTimeDays);
    // Also make "low" threshold relative: at least lead time + some buffer
    const lowThreshold = Math.max(30, globalLeadTimeDays + 14);
    const criticalThreshold = Math.max(14, globalLeadTimeDays);
    
    
    physicalSkus.forEach(sku => {
      const skuLower = sku.toLowerCase();
      
      // Case-insensitive lookups for all inventory sources
      const a = amzInv[sku] || amzInvLower[skuLower] || {};
      const t = tplInv[sku] || tplInvLower[skuLower] || {};
      const h = homeInv[sku] || homeInvLower[skuLower] || {};
      const awdItem = awdData[sku] || awdData[skuLower] || awdData[sku.toUpperCase()] || {};
      
      const aQty = a.total || 0;
      const tQty = t.total || 0;
      const hQty = h.total || 0;
      const awdQty = awdItem.awdQuantity || 0;
      const aInbound = a.inbound || 0;
      const awdInb = awdItem.awdInbound || 0;
      const tInbound = t.inbound || 0;
      const totalInbound = aInbound + awdInb + tInbound;
      const totalQty = aQty + tQty + hQty + awdQty + totalInbound;
      
      const cost = a.cost || t.cost || h.cost || cogsLookup[sku] || cogsLookup[skuLower] || 
                   cogsLookup[sku.replace(/Shop$/i, '')] || cogsLookup[sku.replace(/Shop$/i, '').toLowerCase()] || 
                   cogsLookup[sku.replace(/Shop$/i, '').toUpperCase()] || 0;
      
      // Get velocity from both weekly data AND Amazon inventory file
      // Priority: weekly sales data > t30 from inventory file
      
      // For velocity lookup, also try without "Shop" suffix since Shopify stores velocity under base SKU
      const skuWithoutShop = sku.replace(/shop$/i, '');
      const skuWithoutShopLower = skuWithoutShop.toLowerCase();
      const skuWithoutShopUpper = skuWithoutShop.toUpperCase();
      const skuWithShop = skuWithoutShop + 'Shop';
      const skuWithShopLower = skuWithShop.toLowerCase();
      
      const amzVelFromWeekly = amazonSkuVelocity[sku] || amzVelLower[skuLower] || 
                               amazonSkuVelocity[skuWithoutShop] || amzVelLower[skuWithoutShopLower] ||
                               amazonSkuVelocity[skuWithoutShopUpper] || amazonSkuVelocity[skuWithShop] || 0;
      const amzVelFromInv = a.amzWeeklyVel || 0; // This comes from t30 in inventory file
      const amzVel = amzVelFromWeekly > 0 ? amzVelFromWeekly : amzVelFromInv;
      
      const shopVel = shopifySkuVelocity[sku] || shopVelLower[skuLower] || 
                      shopifySkuVelocity[skuWithoutShop] || shopVelLower[skuWithoutShopLower] ||
                      shopifySkuVelocity[skuWithoutShopUpper] || shopifySkuVelocity[skuWithShop] ||
                      shopVelLower[skuWithShopLower] || 0;
      const totalVel = amzVel + shopVel;
      
      // Apply learned corrections
      let correctedVel = totalVel;
      let velocitySource = 'historical';
      if (forecastCorrections.confidence >= 30 && forecastCorrections.samplesUsed >= 2) {
        if (forecastCorrections.bySku[sku]?.samples >= 2) {
          correctedVel = totalVel * forecastCorrections.bySku[sku].units;
          velocitySource = 'sku-corrected';
        } else {
          correctedVel = totalVel * forecastCorrections.overall.units;
          velocitySource = 'overall-corrected';
        }
      }
      
      const dos = correctedVel > 0 ? Math.round((totalQty / correctedVel) * 7) : 999;
      let health = 'unknown';
      if (totalVel > 0) {
        if (dos < criticalThreshold) { health = 'critical'; critical++; }
        else if (dos < lowThreshold) { health = 'low'; low++; }
        else if (dos <= overstockThreshold) { health = 'healthy'; healthy++; }
        else { health = 'overstock'; overstock++; }
      }
      
      // Calculate stockout and reorder dates - simple math, no AI needed
      const today = new Date();
      // Lead time priority: per-SKU setting → per-SKU leadTimes → category lead time → global default
      const skuCategory = leadTimeSettings.skuCategories?.[sku] || leadTimeSettings.skuCategories?.[sku.replace(/shop$/i, '').toUpperCase()] || '';
      const categoryLT = skuCategory && leadTimeSettings.categoryLeadTimes?.[skuCategory];
      const leadTimeDays = leadTimeSettings.skuSettings?.[sku]?.leadTime 
        || leadTimeSettings.skuLeadTimes?.[sku] 
        || categoryLT?.leadTimeDays
        || leadTimeSettings.defaultLeadTimeDays || 14;
      const reorderTriggerDays = categoryLT?.reorderTriggerDays || leadTimeSettings.reorderTriggerDays || 60;
      const minOrderWeeks = categoryLT?.minOrderWeeks || leadTimeSettings.minOrderWeeks || 22;
      
      // Get demand stats for this SKU (safety stock, seasonality, CV)
      const normalizedSkuForStats = sku.replace(/shop$/i, '').toUpperCase();
      const demandStats = skuDemandStats[normalizedSkuForStats] || null;
      
      // Per-SKU safety stock with actual lead time
      const leadTimeWeeks = leadTimeDays / 7;
      const safetyStock = demandStats 
        ? Math.ceil(Z_SERVICE_LEVEL * demandStats.weeklyStdDev * Math.sqrt(leadTimeWeeks))
        : 0;
      
      // Seasonally-adjusted velocity (current month's factor)
      const seasonalFactor = demandStats?.currentSeasonalFactor || 1.0;
      const seasonalVel = correctedVel * seasonalFactor;
      
      // Reorder point = (daily velocity × lead time) + safety stock
      const dailyVelForReorder = seasonalVel / 7;
      const reorderPoint = Math.ceil((dailyVelForReorder * leadTimeDays) + safetyStock);
      
      let stockoutDate = null;
      let reorderByDate = null;
      let daysUntilMustOrder = null;
      let suggestedOrderQty = 0;
      
      if (totalVel > 0 && dos < 999) {
        // Stockout = today + days of supply
        const stockout = new Date(today);
        stockout.setDate(stockout.getDate() + dos);
        stockoutDate = stockout.toISOString().split('T')[0];
        
        // Days until must order: accounts for reorder trigger buffer + safety stock
        // Order when remaining stock covers: reorderTriggerDays (target buffer when shipment arrives) + leadTime demand + safety stock
        const reorderPointDays = seasonalVel > 0 ? Math.round((reorderPoint / seasonalVel) * 7) : leadTimeDays;
        daysUntilMustOrder = dos - reorderTriggerDays - reorderPointDays;
        const reorderBy = new Date(today);
        reorderBy.setDate(reorderBy.getDate() + daysUntilMustOrder);
        reorderByDate = reorderBy.toISOString().split('T')[0];
        
        // Suggested order = minOrderWeeks of supply + safety stock (use corrected velocity)
        suggestedOrderQty = Math.ceil(correctedVel * minOrderWeeks) + safetyStock;
      }
      
      items.push({ 
        sku, 
        name: a.name || t.name || h.name || sku, 
        asin: a.asin || '', 
        amazonQty: aQty, 
        threeplQty: tQty,
        homeQty: hQty,
        awdQty,
        awdInbound: awdInb,
        totalQty, 
        cost, 
        totalValue: totalQty * cost, 
        weeklyVel: totalVel, 
        correctedVel, 
        velocitySource, 
        amzWeeklyVel: amzVel, 
        shopWeeklyVel: shopVel, 
        daysOfSupply: dos, 
        health,
        stockoutDate,
        reorderByDate,
        daysUntilMustOrder,
        suggestedOrderQty,
        leadTimeDays,
        category: skuCategory || '',
        amazonInbound: aInbound, 
        threeplInbound: tInbound,
        // Industry-standard demand metrics
        safetyStock,
        reorderPoint,
        seasonalFactor,
        seasonalVel: Math.round(seasonalVel * 10) / 10,
        cv: demandStats?.cv || 0,
        demandClass: demandStats?.demandClass || 'unknown',
        weeksOfData: demandStats?.weeksOfData || 0,
      });
    });
    
    items.sort((a, b) => b.totalValue - a.totalValue);

    // ===== INDUSTRY-STANDARD SUPPLY CHAIN METRICS =====
    // ABC Classification (Pareto / 80-20 rule based on annual revenue contribution)
    const CARRYING_COST_RATE = 0.25; // 25% annual holding cost (industry standard: 20-30%)
    const ORDER_FIXED_COST = 150;    // Fixed cost per purchase order ($100-$200 typical)
    
    // Calculate annual revenue per SKU for ABC analysis
    const totalAnnualRevenue = items.reduce((sum, item) => {
      const annualUnits = (item.weeklyVel || 0) * 52;
      // Use selling price estimate: cost * 2.5x average markup (or use actual if available)
      const sellingPrice = item.cost > 0 ? item.cost * 2.5 : 0;
      return sum + (annualUnits * sellingPrice);
    }, 0);
    
    let cumulativeRevenue = 0;
    const totalInventoryValue = items.reduce((sum, item) => sum + (item.totalValue || 0), 0);
    const totalAnnualCOGS = items.reduce((sum, item) => sum + ((item.weeklyVel || 0) * 52 * (item.cost || 0)), 0);
    
    // Sort by annual revenue contribution for ABC classification
    const itemsByRevenue = [...items].sort((a, b) => {
      const aRev = (a.weeklyVel || 0) * 52 * (a.cost || 0) * 2.5;
      const bRev = (b.weeklyVel || 0) * 52 * (b.cost || 0) * 2.5;
      return bRev - aRev;
    });
    
    const abcLookup = {};
    itemsByRevenue.forEach(item => {
      const annualRev = (item.weeklyVel || 0) * 52 * (item.cost || 0) * 2.5;
      cumulativeRevenue += annualRev;
      const cumulativePct = totalAnnualRevenue > 0 ? (cumulativeRevenue / totalAnnualRevenue) * 100 : 100;
      
      let abcClass = 'C';
      if (cumulativePct <= 80) abcClass = 'A';      // Top ~20% of SKUs = 80% of revenue
      else if (cumulativePct <= 95) abcClass = 'B';  // Next ~30% = 15% of revenue
      // Remaining ~50% = 5% of revenue → C class
      
      abcLookup[item.sku] = abcClass;
    });
    
    // Apply ABC and calculate additional metrics per item
    items.forEach(item => {
      const annualDemandUnits = (item.weeklyVel || 0) * 52;
      const annualDemandCost = annualDemandUnits * (item.cost || 0);
      
      // ABC Classification
      item.abcClass = abcLookup[item.sku] || 'C';
      
      // Inventory Turnover = Annual COGS sold / Average Inventory Value
      // Use current stock as proxy for average inventory
      item.turnoverRate = item.totalValue > 0 
        ? Math.round((annualDemandCost / item.totalValue) * 10) / 10 
        : 0;
      
      // Annual Carrying Cost = Inventory Value × Carrying Cost Rate
      item.annualCarryingCost = Math.round(item.totalValue * CARRYING_COST_RATE * 100) / 100;
      
      // EOQ (Economic Order Quantity) = √(2 × D × S / H)
      // D = annual demand units, S = fixed order cost, H = annual holding cost per unit
      const holdingCostPerUnit = (item.cost || 0) * CARRYING_COST_RATE;
      item.eoq = holdingCostPerUnit > 0 && annualDemandUnits > 0
        ? Math.ceil(Math.sqrt((2 * annualDemandUnits * ORDER_FIXED_COST) / holdingCostPerUnit))
        : 0;
      
      // Sell-Through Rate = Units Sold / (Units Sold + Ending Inventory) over trailing period
      // Using 30-day window: weekly velocity * 4.3 weeks
      const monthlyUnitsSold = (item.weeklyVel || 0) * 4.3;
      item.sellThroughRate = (monthlyUnitsSold + item.totalQty) > 0
        ? Math.round((monthlyUnitsSold / (monthlyUnitsSold + item.totalQty)) * 1000) / 10
        : 0;
      
      // Weeks of Supply (complement to Days of Supply)
      item.weeksOfSupply = item.weeklyVel > 0 ? Math.round((item.totalQty / item.weeklyVel) * 10) / 10 : 999;
      
      // Stock-to-Sales Ratio = Current Inventory / Monthly Sales
      item.stockToSalesRatio = monthlyUnitsSold > 0
        ? Math.round((item.totalQty / monthlyUnitsSold) * 10) / 10
        : 999;
      
      // Stockout Risk Score (0-100) based on days of supply, lead time, and demand variability
      let stockoutRisk = 0;
      if (item.weeklyVel > 0) {
        // Base risk from days of supply vs lead time
        const dosRatio = item.daysOfSupply / Math.max(item.leadTimeDays, 1);
        if (dosRatio < 0.5) stockoutRisk = 95;      // Critical: less than half lead time
        else if (dosRatio < 1.0) stockoutRisk = 80;  // High: less than one lead time
        else if (dosRatio < 1.5) stockoutRisk = 50;  // Medium: less than 1.5× lead time
        else if (dosRatio < 2.5) stockoutRisk = 25;  // Low: 1.5-2.5× lead time
        else stockoutRisk = 5;                        // Minimal
        
        // Adjust for demand variability (higher CV = higher risk)
        const cvAdjustment = (item.cv || 0) * 15; // Up to +15 risk for CV=1.0
        stockoutRisk = Math.min(100, Math.round(stockoutRisk + cvAdjustment));
      }
      item.stockoutRisk = stockoutRisk;
      
      // Refined health status using dynamic thresholds aligned with reorder cycle + AI forecast
      // Uses reorder point and safety stock for classification, not just days of supply
      if (item.weeklyVel > 0) {
        if (item.daysUntilMustOrder !== null && item.daysUntilMustOrder < 0) {
          item.health = 'critical'; // Past reorder date
        } else if (item.daysOfSupply < criticalThreshold || (item.daysUntilMustOrder !== null && item.daysUntilMustOrder < 7)) {
          item.health = 'critical';
        } else if (item.daysOfSupply < lowThreshold || (item.daysUntilMustOrder !== null && item.daysUntilMustOrder < 14)) {
          item.health = 'low';
        } else if (item.daysOfSupply <= overstockThreshold) {
          item.health = 'healthy';
        } else {
          item.health = 'overstock';
        }
      }
    });
    
    // Recalculate status counts after refined classification
    critical = 0; low = 0; healthy = 0; overstock = 0;
    items.forEach(item => {
      if (item.health === 'critical') critical++;
      else if (item.health === 'low') low++;
      else if (item.health === 'healthy') healthy++;
      else if (item.health === 'overstock') overstock++;
    });
    
    // Aggregate supply chain KPIs
    const avgTurnover = items.filter(i => i.turnoverRate > 0).length > 0
      ? items.filter(i => i.turnoverRate > 0).reduce((s, i) => s + i.turnoverRate, 0) / items.filter(i => i.turnoverRate > 0).length
      : 0;
    const totalCarryingCost = items.reduce((s, i) => s + (i.annualCarryingCost || 0), 0);
    const avgSellThrough = items.filter(i => i.sellThroughRate > 0).length > 0
      ? items.filter(i => i.sellThroughRate > 0).reduce((s, i) => s + i.sellThroughRate, 0) / items.filter(i => i.sellThroughRate > 0).length
      : 0;
    const abcCounts = items.reduce((acc, i) => { acc[i.abcClass] = (acc[i.abcClass] || 0) + 1; return acc; }, {});
    const inStockRate = items.filter(i => i.weeklyVel > 0).length > 0
      ? Math.round((items.filter(i => i.weeklyVel > 0 && i.totalQty > 0).length / items.filter(i => i.weeklyVel > 0).length) * 1000) / 10
      : 100;

    // Re-sort by value (default)
    items.sort((a, b) => b.totalValue - a.totalValue);

    const hasAmazonWeeklyData = Object.keys(amazonSkuVelocity).length > 0;
    const hasShopifyWeeklyData = Object.keys(shopifySkuVelocity).length > 0;
    
    // Build velocity source description
    let velNote = '';
    if (velocityDataSource === 'none') {
      // Check if FBA inventory has t30 data
      const hasFbaT30 = Object.values(amzInv).some(item => item.amzWeeklyVel > 0);
      if (hasFbaT30) {
        velNote = 'Using FBA inventory t30 shipped units (upload weekly SKU Economics for more accuracy)';
      } else {
        velNote = 'No velocity data - Upload Amazon SKU Economics reports or run Shopify Sync to get sales velocity';
      }
    } else {
      const sources = [];
      if (velocityDataSource.includes('weekly')) sources.push(`${weeksCount} weeks`);
      if (velocityDataSource.includes('daily')) sources.push(`${dailyDaysCount} days`);
      if (velocityDataSource.includes('monthly')) sources.push(`${periodsCount} months`);
      velNote = `Velocity from: ${sources.join(' + ')} (${Object.keys(amazonSkuVelocity).length} Amazon SKUs, ${Object.keys(shopifySkuVelocity).length} Shopify SKUs)`;
    }
    
    const learningNote = forecastCorrections.confidence >= 30 
      ? ` + AI-corrected (${forecastCorrections.confidence.toFixed(0)}% confidence)`
      : '';
    
    const sourceNote = `Amazon: ${amzSource}${awdTotal > 0 ? ` (AWD: ${awdTotal} units)` : ''}, 3PL: ${tplSource}${homeSource !== 'none' ? `, Home: ${homeSource}` : ''}`;
    
    const snapshot = {
      date: snapshotDate, 
      createdAt: new Date().toISOString(), 
      velocitySource: velNote + learningNote,
      inventorySources: sourceNote,
      summary: { 
        totalUnits: amzTotal + tplTotal + homeTotal + awdTotal + amzInbound + tplInbound, 
        totalValue: amzValue + tplValue + homeValue + awdValue, 
        amazonUnits: amzTotal, 
        amazonValue: amzValue, 
        amazonInbound: amzInbound,
        awdUnits: awdTotal,
        awdValue: awdValue,
        threeplUnits: tplTotal, 
        threeplValue: tplValue, 
        threeplInbound: tplInbound,
        homeUnits: homeTotal,
        homeValue: homeValue,
        critical, 
        low, 
        healthy, 
        overstock, 
        skuCount: items.length,
        // Dynamic thresholds (based on reorder settings)
        thresholds: { critical: criticalThreshold, low: lowThreshold, overstock: overstockThreshold },
        // Supply Chain KPIs
        avgTurnover: Math.round(avgTurnover * 10) / 10,
        totalCarryingCost: Math.round(totalCarryingCost),
        avgSellThrough: Math.round(avgSellThrough * 10) / 10,
        inStockRate,
        abcCounts,
        totalAnnualCOGS: Math.round(totalAnnualCOGS),
      },
      items,
      awdData, // AWD inventory breakdown
      sources: {
        amazon: amzSource,
        threepl: tplSource,
        home: homeSource,
        amazonConnected: amazonCredentials.connected,
        packiyoConnected: packiyoCredentials.connected,
        shopifyConnected: shopifyCredentials.connected,
      },
      learningStatus: {
        correctionsApplied: forecastCorrections.confidence >= 30,
        confidence: forecastCorrections.confidence,
        samplesUsed: forecastCorrections.samplesUsed,
        lastUpdated: forecastCorrections.lastUpdated,
      }
    };

    const updated = { ...invHistory, [snapshotDate]: snapshot };
    setInvHistory(updated); 
    saveInv(updated); 
    setSelectedInvDate(snapshotDate); 
    setView('inventory'); 
    setIsProcessing(false);
    setInvFiles({ amazon: null, threepl: null, cogs: null }); 
    setInvFileNames({ amazon: '', threepl: '', cogs: '' }); 
    setInvSnapshotDate('');
    
    setToast({ 
      message: `Inventory snapshot saved (3PL: ${tplSource}, ${items.length} SKUs)`, 
      type: 'success' 
    });
  }, [invFiles, invSnapshotDate, invHistory, savedCogs, allWeeksData, allPeriodsData, allDaysData, forecastCorrections, packiyoCredentials, shopifyCredentials, amazonCredentials, leadTimeSettings]);

  const deleteWeek = (k) => { 
    const data = allWeeksData[k];
    if (!data) return;
    
    const revenue = data.total?.revenue || 0;
    const units = data.total?.units || 0;
    
    // Delete immediately
    const u = { ...allWeeksData }; 
    delete u[k]; 
    setAllWeeksData(u); 
    save(u); 
    
    // Store for undo
    const undoId = Date.now();
    const undoTimer = setTimeout(() => {
      setDeletedItems(prev => prev.filter(item => item.id !== undoId));
    }, 10000);
    
    setDeletedItems(prev => [...prev, { id: undoId, type: 'week', key: k, data, undoTimer }]);
    setToast({ 
      message: `Deleted week ${k} ($${revenue.toFixed(0)} rev, ${units} units)`, 
      type: 'warning',
      action: {
        label: 'Undo',
        onClick: () => {
          clearTimeout(undoTimer);
          const restored = { ...allWeeksData, [k]: data };
          setAllWeeksData(restored);
          save(restored);
          setSelectedWeek(k);
          setDeletedItems(prev => prev.filter(item => item.id !== undoId));
          setToast({ message: `Restored week ${k}`, type: 'success' });
        }
      }
    });
    
    const today = new Date();
    const r = Object.keys(u).filter(wk => {
      const weekEnd = new Date(wk + 'T12:00:00');
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 6);
      return weekStart <= today;
    }).sort().reverse(); 
    if (r.length) setSelectedWeek(r[0]); 
    else { setView('upload'); setSelectedWeek(null); }
  };
  
  const deleteInv = (k) => { 
    const data = invHistory[k];
    if (!data) return;
    
    const totalUnits = data.summary?.totalUnits || 0;
    
    // Delete immediately
    const u = { ...invHistory }; 
    delete u[k]; 
    setInvHistory(u); 
    saveInv(u); 
    
    // Store for undo
    const undoId = Date.now();
    const undoTimer = setTimeout(() => {
      setDeletedItems(prev => prev.filter(item => item.id !== undoId));
    }, 10000);
    
    setDeletedItems(prev => [...prev, { id: undoId, type: 'inventory', key: k, data, undoTimer }]);
    setToast({ 
      message: `Deleted inventory ${k} (${totalUnits} units)`, 
      type: 'warning',
      action: {
        label: 'Undo',
        onClick: () => {
          clearTimeout(undoTimer);
          const restored = { ...invHistory, [k]: data };
          setInvHistory(restored);
          saveInv(restored);
          setSelectedInvDate(k);
          setDeletedItems(prev => prev.filter(item => item.id !== undoId));
          setToast({ message: `Restored inventory ${k}`, type: 'success' });
        }
      }
    });
    
    const r = Object.keys(u).sort().reverse(); 
    if (r.length) setSelectedInvDate(r[0]); 
    else setSelectedInvDate(null); 
  };

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

  // Parse Amazon Campaign CSV (aggregate campaign data)
  const parseAmazonCampaignCSV = useCallback((content) => {
    try {
      const lines = content.trim().split(/\r?\n/);
      if (lines.length < 2) return { error: 'File is empty or has no data rows' };
      
      const header = lines[0].toLowerCase();
      
      // Check if this is Amazon campaign data
      if (!header.includes('campaigns') || !header.includes('roas')) {
        return { error: 'Not a valid Amazon Campaign report. Expected columns: Campaigns, Spend, Sales, ROAS' };
      }
      
      // Parse header to find column indices
      const headerCols = [];
      let current = '', inQuotes = false;
      for (const char of lines[0]) {
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) { headerCols.push(current.trim().toLowerCase()); current = ''; }
        else current += char;
      }
      headerCols.push(current.trim().toLowerCase());
      
      const colIdx = {
        state: headerCols.findIndex(h => h === 'state'),
        campaign: headerCols.findIndex(h => h === 'campaigns'),
        status: headerCols.findIndex(h => h === 'status'),
        type: headerCols.findIndex(h => h === 'type'),
        targeting: headerCols.findIndex(h => h === 'targeting'),
        startDate: headerCols.findIndex(h => h === 'start date'),
        budget: headerCols.findIndex(h => h.includes('budget') && !h.includes('converted')),
        clicks: headerCols.findIndex(h => h === 'clicks'),
        ctr: headerCols.findIndex(h => h === 'ctr'),
        spend: headerCols.findIndex(h => h === 'spend (converted)' || (h === 'spend' && !h.includes('converted'))),
        cpc: headerCols.findIndex(h => h === 'cpc (converted)' || (h === 'cpc' && !h.includes('converted'))),
        orders: headerCols.findIndex(h => h === 'orders'),
        sales: headerCols.findIndex(h => h === 'sales (converted)' || (h === 'sales' && !h.includes('converted'))),
        roas: headerCols.findIndex(h => h === 'roas'),
        impressionShare: headerCols.findIndex(h => h.includes('impression share')),
      };
      
      // If spend (converted) not found, try just spend
      if (colIdx.spend === -1) colIdx.spend = headerCols.findIndex(h => h === 'spend');
      if (colIdx.sales === -1) colIdx.sales = headerCols.findIndex(h => h === 'sales');
      if (colIdx.cpc === -1) colIdx.cpc = headerCols.findIndex(h => h === 'cpc');
      
      const campaigns = [];
      let totalSpend = 0, totalSales = 0, totalOrders = 0, totalClicks = 0;
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Parse CSV row
        const cols = [];
        let curr = '', inQ = false;
        for (const char of line) {
          if (char === '"') inQ = !inQ;
          else if (char === ',' && !inQ) { cols.push(curr); curr = ''; }
          else curr += char;
        }
        cols.push(curr);
        
        const parseNum = (val) => parseFloat((val || '').replace(/[\$,%]/g, '').replace(/,/g, '')) || 0;
        
        const campaign = {
          id: i,
          state: cols[colIdx.state] || '',
          name: cols[colIdx.campaign] || '',
          status: cols[colIdx.status] || '',
          type: cols[colIdx.type] || '',
          targeting: cols[colIdx.targeting] || '',
          startDate: cols[colIdx.startDate] || '',
          budget: parseNum(cols[colIdx.budget]),
          clicks: parseInt(cols[colIdx.clicks]) || 0,
          ctr: parseNum(cols[colIdx.ctr]),
          spend: parseNum(cols[colIdx.spend]),
          cpc: parseNum(cols[colIdx.cpc]),
          orders: parseInt(cols[colIdx.orders]) || 0,
          sales: parseNum(cols[colIdx.sales]),
          roas: parseNum(cols[colIdx.roas]),
          impressionShare: cols[colIdx.impressionShare] || '',
          acos: 0,
          convRate: 0,
        };
        
        // Calculate derived metrics
        campaign.acos = campaign.sales > 0 ? (campaign.spend / campaign.sales) * 100 : 0;
        campaign.convRate = campaign.clicks > 0 ? (campaign.orders / campaign.clicks) * 100 : 0;
        
        campaigns.push(campaign);
        totalSpend += campaign.spend;
        totalSales += campaign.sales;
        totalOrders += campaign.orders;
        totalClicks += campaign.clicks;
      }
      
      // Calculate summary metrics
      const summary = {
        totalCampaigns: campaigns.length,
        enabledCount: campaigns.filter(c => c.state === 'ENABLED').length,
        pausedCount: campaigns.filter(c => c.state === 'PAUSED').length,
        totalSpend,
        totalSales,
        totalOrders,
        totalClicks,
        roas: totalSpend > 0 ? totalSales / totalSpend : 0,
        acos: totalSales > 0 ? (totalSpend / totalSales) * 100 : 0,
        avgCpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
        convRate: totalClicks > 0 ? (totalOrders / totalClicks) * 100 : 0,
        byType: {
          SP: campaigns.filter(c => c.type === 'SP'),
          SB: campaigns.filter(c => c.type === 'SB2' || c.type === 'SB'),
          SD: campaigns.filter(c => c.type === 'SD'),
        }
      };
      
      return { campaigns, summary };
    } catch (e) {
      return { error: e.message };
    }
  }, []);

  // Save Amazon campaign data
  const saveAmazonCampaigns = useCallback((campaigns, summary) => {
    const now = new Date().toISOString();
    const weekKey = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Create snapshot with full campaign data for WoW comparison
    const snapshot = {
      date: now,
      weekKey,
      summary: { ...summary },
      // Store top campaigns for quick access in history
      topCampaigns: [...campaigns].sort((a, b) => b.spend - a.spend).slice(0, 20).map(c => ({
        name: c.name, type: c.type, state: c.state, spend: c.spend, sales: c.sales, orders: c.orders, roas: c.roas, acos: c.acos
      }))
    };
    
    // Merge with existing history, avoiding duplicate weeks
    const existingHistory = (amazonCampaigns.history || []).filter(h => h.weekKey !== weekKey);
    
    const newData = {
      campaigns,
      summary,
      lastUpdated: now,
      history: [snapshot, ...existingHistory].slice(0, 52), // Keep up to 52 weeks (1 year)
      // PRESERVE historical daily data for AI analysis
      historicalDaily: amazonCampaigns.historicalDaily || {},
      historicalLastUpdated: amazonCampaigns.historicalLastUpdated,
      historicalDateRange: amazonCampaigns.historicalDateRange,
    };
    
    setAmazonCampaigns(newData);
    safeLocalStorageSet('ecommerce_amazon_campaigns_v1', JSON.stringify(newData));
    
    // Sync to cloud
    queueCloudSave({ ...combinedData, amazonCampaigns: newData });
    
    return newData;
  }, [amazonCampaigns, combinedData, queueCloudSave]);

  // Parse bulk ad file (Google Ads or Meta Ads CSV) - Enhanced with full KPI extraction
  const parseBulkAdFile = useCallback((content, platform, filename = '') => {
    try {
      const lines = content.trim().split('\n');
      if (lines.length < 2) return { error: 'File is empty or has no data rows' };
      
      const header = lines[0].toLowerCase();
      const dailyData = [];
      let totalSpend = 0;
      let totalImpressions = 0;
      let totalClicks = 0;
      let totalConversions = 0;
      let totalConvValue = 0;
      
      // Parse all headers to find columns
      const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
      
      // Date column detection
      const dateCol = headers.findIndex(h => h === 'date' || h === 'day' || h === 'month' || h === 'hour' || h === 'quarter' || h.includes('date'));
      
      // Cost/Spend column
      const costCol = headers.findIndex(h => h === 'cost' || h === 'spend' || h === 'amount spent' || (h.includes('cost') && !h.includes('/') && !h.includes('per')));
      
      // Impressions
      const impressionsCol = headers.findIndex(h => h === 'impressions' || h === 'impr' || h.includes('impression'));
      
      // Clicks
      const clicksCol = headers.findIndex(h => h === 'clicks' || h === 'link clicks' || h.includes('click'));
      
      // CTR
      const ctrCol = headers.findIndex(h => h === 'ctr' || h === 'ctr (all)' || h.includes('click-through'));
      
      // CPC
      const cpcCol = headers.findIndex(h => h === 'avg. cpc' || h === 'cpc' || h === 'cost per link click' || h.includes('cost per click'));
      
      // CPM
      const cpmCol = headers.findIndex(h => h === 'cpm' || h.includes('cost per 1,000') || h.includes('cost per thousand'));
      
      // Conversions
      const conversionsCol = headers.findIndex(h => h === 'conversions' || h === 'purchases (all)' || h === 'purchases' || (h.includes('conv') && !h.includes('value') && !h.includes('cost')));
      
      // Conversion Value / Revenue
      const convValueCol = headers.findIndex(h => h === 'all conv. value' || h === 'purchases value (all)' || h === 'conv. value' || h === 'purchase value' || (h.includes('value') && (h.includes('conv') || h.includes('purchase'))));
      
      // ROAS
      const roasCol = headers.findIndex(h => h === 'conv. value / cost' || h === 'purchase (roas) (all)' || h === 'roas' || h.includes('roas'));
      
      // CPA / Cost per Conversion
      const cpaCol = headers.findIndex(h => h === 'cost / conv.' || h === 'cost per purchase (all)' || h === 'cpa' || h.includes('cost per purchase') || h.includes('cost per conv'));
      
      // Campaign name
      const campaignCol = headers.findIndex(h => h === 'campaign' || h === 'campaign name' || h.includes('campaign'));
      
      // Ad name/ID
      const adCol = headers.findIndex(h => h === 'ad name' || h === 'ad id' || h === 'ad' || h.includes('ad name'));
      
      // Detect format
      const hasDateCol = dateCol >= 0;
      const hasCostCol = costCol >= 0;
      const hasHourCol = headers.includes('hour');
      const isHourlyData = hasHourCol && !headers.includes('date') && !headers.includes('day');
      const isQuarterlyData = headers.includes('quarter');
      
      // Detect platform from headers if not specified
      let detectedPlatform = platform;
      if (header.includes('purchases value') || header.includes('amount spent') || header.includes('link clicks')) {
        detectedPlatform = 'meta';
      } else if (header.includes('avg. cpc') || header.includes('all conv. value')) {
        detectedPlatform = 'google';
      }
      
      if (!hasDateCol || !hasCostCol) {
        return { error: `Could not find required columns. Found headers: ${headers.join(', ')}` };
      }
      
      const monthNames = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
      
      // Helper to parse CSV value
      const parseValue = (val) => {
        if (!val || val === 'null' || val === 'undefined' || val === '') return 0;
        return parseFloat(val.replace(/"/g, '').replace(/\$/g, '').replace(/,/g, '').replace(/%/g, '')) || 0;
      };
      
      // Campaign-level aggregation for detailed breakdowns
      const campaignData = {};
      const adData = {};
      
      // For hourly data aggregation
      if (isHourlyData) {
        let hourlySpend = 0, hourlyImpressions = 0, hourlyClicks = 0, hourlyConversions = 0, hourlyConvValue = 0;
        
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const cols = [];
          let current = '', inQuotes = false;
          for (const char of line) {
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) { cols.push(current.trim()); current = ''; }
            else current += char;
          }
          cols.push(current.trim());
          
          hourlySpend += parseValue(cols[costCol]);
          hourlyImpressions += parseInt(parseValue(cols[impressionsCol])) || 0;
          hourlyClicks += parseInt(parseValue(cols[clicksCol])) || 0;
          hourlyConversions += parseValue(cols[conversionsCol]);
          hourlyConvValue += parseValue(cols[convValueCol]);
        }
        
        // Extract date from filename
        let dateStr;
        const filenameMatch = filename.match(/(\d{4})_(\d{2})_(\d{2})/);
        if (filenameMatch) {
          dateStr = `${filenameMatch[1]}-${filenameMatch[2]}-${filenameMatch[3]}`;
        } else {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          dateStr = yesterday.toISOString().split('T')[0];
        }
        
        dailyData.push({
          date: dateStr,
          spend: hourlySpend,
          impressions: hourlyImpressions,
          clicks: hourlyClicks,
          conversions: hourlyConversions,
          convValue: hourlyConvValue,
          cpc: hourlyClicks > 0 ? hourlySpend / hourlyClicks : 0,
          cpm: hourlyImpressions > 0 ? (hourlySpend / hourlyImpressions) * 1000 : 0,
          ctr: hourlyImpressions > 0 ? (hourlyClicks / hourlyImpressions) * 100 : 0,
          cpa: hourlyConversions > 0 ? hourlySpend / hourlyConversions : 0,
          roas: hourlySpend > 0 ? hourlyConvValue / hourlySpend : 0,
          isHourly: true,
        });
        
        totalSpend = hourlySpend;
        totalImpressions = hourlyImpressions;
        totalClicks = hourlyClicks;
        totalConversions = hourlyConversions;
        totalConvValue = hourlyConvValue;
      } else {
        // Parse data rows (daily or monthly)
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          // Handle CSV with quoted fields
          const cols = [];
          let current = '', inQuotes = false;
          for (const char of line) {
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) { cols.push(current.trim()); current = ''; }
            else current += char;
          }
          cols.push(current.trim());
          
          // Parse date
          let dateStr = cols[dateCol]?.replace(/"/g, '').trim();
          let parsedDate = null;
          let isMonthlyRecord = false;
          
          // Try quarterly format
          const quarterlyMatch = dateStr.match(/(\d)(?:st|nd|rd|th)\s+quarter\s+(\d{4})/i);
          if (quarterlyMatch) {
            const quarter = parseInt(quarterlyMatch[1]);
            const year = parseInt(quarterlyMatch[2]);
            const quarterEndMonth = quarter * 3 - 1;
            parsedDate = new Date(year, quarterEndMonth + 1, 0);
            isMonthlyRecord = true;
          }
          
          // Try "Mon YYYY" format
          if (!parsedDate) {
            const monthlyMatch = dateStr.match(/^(\w{3})\s+(\d{4})$/);
            if (monthlyMatch) {
              const month = monthNames[monthlyMatch[1].toLowerCase()];
              if (month !== undefined) {
                parsedDate = new Date(parseInt(monthlyMatch[2]), month + 1, 0);
                isMonthlyRecord = true;
              }
            }
          }
          
          // Try "Mon DD, YYYY" format (Meta format like "Jan 25, 2026")
          if (!parsedDate) {
            const metaMatch = dateStr.match(/^(\w{3})\s+(\d+),\s*(\d{4})$/);
            if (metaMatch) {
              const month = monthNames[metaMatch[1].toLowerCase()];
              if (month !== undefined) {
                parsedDate = new Date(parseInt(metaMatch[3]), month, parseInt(metaMatch[2]));
              }
            }
          }
          
          // Try "Day, Mon DD, YYYY" format (Google format)
          if (!parsedDate) {
            const googleMatch = dateStr.match(/\w+,\s*(\w+)\s+(\d+),\s*(\d{4})/);
            if (googleMatch) {
              const month = monthNames[googleMatch[1].toLowerCase().substring(0, 3)];
              if (month !== undefined) {
                parsedDate = new Date(parseInt(googleMatch[3]), month, parseInt(googleMatch[2]));
              }
            }
          }
          
          // Try ISO format
          if (!parsedDate && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            parsedDate = new Date(dateStr + 'T00:00:00');
          }
          
          // Try US format
          if (!parsedDate && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
            const parts = dateStr.split('/');
            parsedDate = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
          }
          
          if (!parsedDate || isNaN(parsedDate)) continue;
          
          // Parse all metrics
          const cost = parseValue(cols[costCol]);
          const impressions = parseInt(parseValue(cols[impressionsCol])) || 0;
          const clicks = clicksCol >= 0 ? parseInt(parseValue(cols[clicksCol])) || 0 : 0;
          const conversions = conversionsCol >= 0 ? parseValue(cols[conversionsCol]) : 0;
          const convValue = convValueCol >= 0 ? parseValue(cols[convValueCol]) : 0;
          const ctr = ctrCol >= 0 ? parseValue(cols[ctrCol]) : (impressions > 0 ? (clicks / impressions) * 100 : 0);
          const cpc = cpcCol >= 0 ? parseValue(cols[cpcCol]) : (clicks > 0 ? cost / clicks : 0);
          const cpm = cpmCol >= 0 ? parseValue(cols[cpmCol]) : (impressions > 0 ? (cost / impressions) * 1000 : 0);
          const cpa = cpaCol >= 0 ? parseValue(cols[cpaCol]) : (conversions > 0 ? cost / conversions : 0);
          const roas = roasCol >= 0 ? parseValue(cols[roasCol]) : (cost > 0 ? convValue / cost : 0);
          
          // Get campaign and ad info
          const campaign = campaignCol >= 0 ? cols[campaignCol]?.replace(/"/g, '').trim() : '';
          const adName = adCol >= 0 ? cols[adCol]?.replace(/"/g, '').trim() : '';
          
          // Calculate clicks from CPC if not provided
          const finalClicks = clicks > 0 ? clicks : (cpc > 0 ? Math.round(cost / cpc) : 0);
          
          if (cost > 0 || impressions > 0) {
            const dateKey = parsedDate.toISOString().split('T')[0];
            
            dailyData.push({
              date: dateKey,
              spend: cost,
              impressions,
              clicks: finalClicks,
              conversions,
              convValue,
              ctr,
              cpc,
              cpm,
              cpa,
              roas,
              campaign,
              adName,
              isMonthly: isMonthlyRecord,
              monthLabel: isMonthlyRecord ? dateStr : null,
              platform: detectedPlatform, // Tag each record with its source platform
            });
            
            totalSpend += cost;
            totalImpressions += impressions;
            totalClicks += finalClicks;
            totalConversions += conversions;
            totalConvValue += convValue;
            
            // Aggregate by campaign
            if (campaign) {
              if (!campaignData[campaign]) {
                campaignData[campaign] = { campaign, spend: 0, impressions: 0, clicks: 0, conversions: 0, convValue: 0, days: new Set() };
              }
              campaignData[campaign].spend += cost;
              campaignData[campaign].impressions += impressions;
              campaignData[campaign].clicks += finalClicks;
              campaignData[campaign].conversions += conversions;
              campaignData[campaign].convValue += convValue;
              campaignData[campaign].days.add(dateKey);
            }
            
            // Aggregate by ad
            if (adName) {
              if (!adData[adName]) {
                adData[adName] = { adName, campaign, spend: 0, impressions: 0, clicks: 0, conversions: 0, convValue: 0, days: new Set() };
              }
              adData[adName].spend += cost;
              adData[adName].impressions += impressions;
              adData[adName].clicks += finalClicks;
              adData[adName].conversions += conversions;
              adData[adName].convValue += convValue;
              adData[adName].days.add(dateKey);
            }
          }
        }
      }
      
      if (dailyData.length === 0) {
        return { error: 'No valid data rows found' };
      }
      
      // Sort by date
      dailyData.sort((a, b) => a.date.localeCompare(b.date));
      
      // Check if all monthly data
      const isAllMonthly = dailyData.every(d => d.isMonthly);
      
      // Aggregate daily data by date (combine multiple rows per day)
      const aggregatedByDate = {};
      dailyData.forEach(d => {
        if (!aggregatedByDate[d.date]) {
          aggregatedByDate[d.date] = { ...d, campaigns: new Set(), ads: new Set() };
        } else {
          aggregatedByDate[d.date].spend += d.spend;
          aggregatedByDate[d.date].impressions += d.impressions;
          aggregatedByDate[d.date].clicks += d.clicks;
          aggregatedByDate[d.date].conversions += d.conversions;
          aggregatedByDate[d.date].convValue += d.convValue;
        }
        if (d.campaign) aggregatedByDate[d.date].campaigns.add(d.campaign);
        if (d.adName) aggregatedByDate[d.date].ads.add(d.adName);
      });
      
      // Recalculate derived metrics for aggregated daily data
      const aggregatedDaily = Object.values(aggregatedByDate).map(d => ({
        ...d,
        cpc: d.clicks > 0 ? d.spend / d.clicks : 0,
        cpm: d.impressions > 0 ? (d.spend / d.impressions) * 1000 : 0,
        ctr: d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0,
        cpa: d.conversions > 0 ? d.spend / d.conversions : 0,
        roas: d.spend > 0 ? d.convValue / d.spend : 0,
        campaignCount: d.campaigns?.size || 0,
        adCount: d.ads?.size || 0,
      })).sort((a, b) => a.date.localeCompare(b.date));
      
      // Create weekly or monthly aggregations
      let weeklyData = [];
      let monthlyData = [];
      
      if (isAllMonthly) {
        monthlyData = aggregatedDaily.map(d => ({
          periodLabel: d.monthLabel,
          date: d.date,
          spend: d.spend,
          impressions: d.impressions,
          clicks: d.clicks,
          conversions: d.conversions,
          convValue: d.convValue,
          cpc: d.cpc,
          cpm: d.cpm,
          ctr: d.ctr,
          cpa: d.cpa,
          roas: d.roas,
        }));
      } else {
        // Aggregate into weeks
        const weeklyMap = {};
        aggregatedDaily.forEach(d => {
          const date = new Date(d.date + 'T12:00:00');
          const dayOfWeek = date.getDay();
          const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
          const weekEndDate = new Date(date);
          weekEndDate.setDate(weekEndDate.getDate() + daysUntilSunday);
          const weekEnding = formatDateKey(weekEndDate);
          
          if (!weeklyMap[weekEnding]) {
            weeklyMap[weekEnding] = { weekEnding, spend: 0, impressions: 0, clicks: 0, conversions: 0, convValue: 0, days: [], platform: d.platform };
          }
          weeklyMap[weekEnding].spend += d.spend;
          weeklyMap[weekEnding].impressions += d.impressions;
          weeklyMap[weekEnding].clicks += d.clicks;
          weeklyMap[weekEnding].conversions += d.conversions;
          weeklyMap[weekEnding].convValue += d.convValue;
          weeklyMap[weekEnding].days.push(d.date);
          // Keep platform from first record (all records in same file have same platform)
          if (!weeklyMap[weekEnding].platform && d.platform) {
            weeklyMap[weekEnding].platform = d.platform;
          }
        });
        
        // Calculate derived metrics
        Object.values(weeklyMap).forEach(w => {
          w.cpc = w.clicks > 0 ? w.spend / w.clicks : 0;
          w.cpm = w.impressions > 0 ? (w.spend / w.impressions) * 1000 : 0;
          w.ctr = w.impressions > 0 ? (w.clicks / w.impressions) * 100 : 0;
          w.cpa = w.conversions > 0 ? w.spend / w.conversions : 0;
          w.roas = w.spend > 0 ? w.convValue / w.spend : 0;
        });
        
        weeklyData = Object.values(weeklyMap).sort((a, b) => a.weekEnding.localeCompare(b.weekEnding));
      }
      
      // Calculate campaign performance summaries
      const campaignSummary = Object.values(campaignData).map(c => ({
        campaign: c.campaign,
        spend: c.spend,
        impressions: c.impressions,
        clicks: c.clicks,
        conversions: c.conversions,
        convValue: c.convValue,
        cpc: c.clicks > 0 ? c.spend / c.clicks : 0,
        cpm: c.impressions > 0 ? (c.spend / c.impressions) * 1000 : 0,
        ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
        cpa: c.conversions > 0 ? c.spend / c.conversions : 0,
        roas: c.spend > 0 ? c.convValue / c.spend : 0,
        daysActive: c.days.size,
      })).sort((a, b) => b.spend - a.spend);
      
      // Calculate ad performance summaries
      const adSummary = Object.values(adData).map(a => ({
        adName: a.adName,
        campaign: a.campaign,
        spend: a.spend,
        impressions: a.impressions,
        clicks: a.clicks,
        conversions: a.conversions,
        convValue: a.convValue,
        cpc: a.clicks > 0 ? a.spend / a.clicks : 0,
        ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0,
        cpa: a.conversions > 0 ? a.spend / a.conversions : 0,
        roas: a.spend > 0 ? a.convValue / a.spend : 0,
        daysActive: a.days.size,
      })).sort((a, b) => b.spend - a.spend);
      
      // Check existing data
      let weeksWithExistingData = 0;
      let monthsWithExistingData = 0;
      
      if (isAllMonthly) {
        monthlyData.forEach(m => {
          if (allPeriodsData[m.periodLabel]) monthsWithExistingData++;
        });
      } else {
        weeklyData.forEach(w => {
          if (allWeeksData[w.weekEnding]) weeksWithExistingData++;
        });
      }
      
      const dateRange = aggregatedDaily.length > 0 
        ? isAllMonthly 
          ? `${aggregatedDaily[0].monthLabel} - ${aggregatedDaily[aggregatedDaily.length - 1].monthLabel}`
          : `${new Date(aggregatedDaily[0].date + 'T00:00:00').toLocaleDateString()} - ${new Date(aggregatedDaily[aggregatedDaily.length - 1].date + 'T00:00:00').toLocaleDateString()}`
        : '';
      
      // Overall averages
      const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
      const avgCpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
      const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
      const overallRoas = totalSpend > 0 ? totalConvValue / totalSpend : 0;
      
      return {
        platform: detectedPlatform,
        dailyData: aggregatedDaily,
        weeklyData,
        monthlyData,
        isMonthlyData: isAllMonthly,
        totalSpend,
        totalImpressions,
        totalClicks,
        totalConversions,
        totalConvValue,
        avgCpc,
        avgCpm,
        avgCtr,
        avgCpa,
        overallRoas,
        dateRange,
        weeksWithExistingData,
        monthsWithExistingData,
        campaignSummary,
        adSummary,
        daysCount: aggregatedDaily.length,
        weeksCount: weeklyData.length,
      };
    } catch (e) {
      return { error: `Parse error: ${e.message}` };
    }
  }, [allWeeksData, allPeriodsData]);
  
  // ============ AMAZON BULK UPLOAD HANDLERS ============
  // Handle Amazon SKU Economics file selection
  const handleAmazonBulkFiles = useCallback(async (files) => {
    setAmazonBulkProcessing(true);
    const parsedFiles = [];
    
    for (const file of files) {
      try {
        const text = await file.text();
        const data = parseCSV(text);
        
        if (!data || data.length === 0) {
          parsedFiles.push({ name: file.name, error: 'Empty file', reportType: null });
          continue;
        }
        
        // Detect report type from date range
        const firstRow = data[0];
        const startDateStr = firstRow['Start date'] || '';
        const endDateStr = firstRow['End date'] || '';
        
        if (!startDateStr || !endDateStr) {
          parsedFiles.push({ name: file.name, error: 'Missing date columns', reportType: null, data });
          continue;
        }
        
        // Parse dates (format: MM/DD/YYYY)
        const parseDate = (str) => {
          const parts = str.split('/');
          if (parts.length === 3) {
            return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
          }
          return null;
        };
        
        const startDate = parseDate(startDateStr);
        const endDate = parseDate(endDateStr);
        
        if (!startDate || !endDate) {
          parsedFiles.push({ name: file.name, error: 'Invalid date format', reportType: null, data });
          continue;
        }
        
        // Calculate days difference to determine report type
        const daysDiff = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
        
        let reportType;
        if (daysDiff === 1) {
          reportType = 'daily';
        } else if (daysDiff >= 6 && daysDiff <= 8) {
          reportType = 'weekly';
        } else if (daysDiff >= 28 && daysDiff <= 31) {
          reportType = 'monthly';
        } else {
          reportType = daysDiff <= 14 ? 'daily' : daysDiff <= 40 ? 'monthly' : 'period';
        }
        
        // Calculate summary metrics
        let totalRevenue = 0, totalUnits = 0, skuCount = 0;
        data.forEach(row => {
          const revenue = parseFloat(row['Net sales'] || 0);
          const units = parseInt(row['Units sold'] || 0);
          if (revenue !== 0 || units > 0) {
            totalRevenue += revenue;
            totalUnits += units;
            // Support multiple possible SKU column names
            if (row['MSKU'] || row['msku'] || row['Msku'] || row['SKU'] || row['sku'] || row['Seller SKU']) skuCount++;
          }
        });
        
        parsedFiles.push({
          name: file.name,
          file,
          data,
          reportType,
          dateRange: {
            start: startDateStr,
            end: endDateStr,
            startDate,
            endDate,
            daysDiff,
          },
          revenue: totalRevenue,
          units: totalUnits,
          skuCount,
        });
      } catch (err) {
        parsedFiles.push({ name: file.name, error: err.message, reportType: null });
      }
    }
    
    // Sort by date
    parsedFiles.sort((a, b) => {
      if (!a.dateRange?.startDate) return 1;
      if (!b.dateRange?.startDate) return -1;
      return a.dateRange.startDate - b.dateRange.startDate;
    });
    
    // Calculate combined summary
    const summary = {
      dailyCount: parsedFiles.filter(f => f.reportType === 'daily').length,
      weeklyCount: parsedFiles.filter(f => f.reportType === 'weekly').length,
      monthlyCount: parsedFiles.filter(f => f.reportType === 'monthly').length,
      totalRevenue: parsedFiles.reduce((sum, f) => sum + (f.revenue || 0), 0),
      dateRange: parsedFiles.length > 0 ? {
        start: parsedFiles[0]?.dateRange?.start,
        end: parsedFiles[parsedFiles.length - 1]?.dateRange?.end,
      } : null,
    };
    
    setAmazonBulkFiles(parsedFiles);
    setAmazonBulkParsed(summary);
    setAmazonBulkProcessing(false);
  }, []);
  
  // Process Amazon bulk upload - import into appropriate data structures
  const processAmazonBulkUpload = useCallback(async () => {
    
    if (amazonBulkFiles.length === 0) {
      return;
    }
    
    setAmazonBulkProcessing(true);
    const cogsLookup = getCogsLookup();
    
    let dailyImported = 0, weeklyImported = 0, monthlyImported = 0;
    const updatedDailyData = { ...allDaysData };
    const updatedWeeklyData = { ...allWeeksData };
    const updatedPeriodsData = { ...allPeriodsData };
    
    try {
      for (const fileData of amazonBulkFiles) {
        if (!fileData.data || fileData.error) continue;
        
        const { reportType, dateRange, data } = fileData;
        
        // Calculate Amazon totals from this file
        let amzRev = 0, amzUnits = 0, amzRet = 0, amzProfit = 0, amzCogs = 0, amzFees = 0, amzAds = 0;
        const amazonSkuData = {};
        
        data.forEach(r => {
          const net = parseInt(r['Net units sold'] || 0);
          const sold = parseInt(r['Units sold'] || 0);
          const ret = parseInt(r['Units returned'] || 0);
          const sales = parseFloat(r['Net sales'] || 0);
          const proceeds = parseFloat(r['Net proceeds total'] || 0);
          // Support multiple possible SKU column names
          const sku = r['MSKU'] || r['msku'] || r['Msku'] || r['SKU'] || r['sku'] || r['Seller SKU'] || r['seller-sku'] || '';
          const fees = parseFloat(r['FBA fulfillment fees total'] || 0) + parseFloat(r['Referral fee total'] || 0);
          const ads = parseFloat(r['Sponsored Products charge total'] || 0);
          const name = r['Product title'] || r['product-name'] || sku;
          
          if (net !== 0 || sold > 0 || ret > 0 || sales !== 0) {
            amzRev += sales;
            amzUnits += sold;
            amzRet += ret;
            amzProfit += proceeds;
            amzFees += fees;
            amzAds += ads;
            amzCogs += 0; // COGS already in Net proceeds - derived after loop
            
            if (sku) {
              if (!amazonSkuData[sku]) {
                amazonSkuData[sku] = { sku, name, unitsSold: 0, returns: 0, netSales: 0, netProceeds: 0, adSpend: 0, cogs: 0 };
              }
              amazonSkuData[sku].unitsSold += sold;
              amazonSkuData[sku].returns += ret;
              amazonSkuData[sku].netSales += sales;
              amazonSkuData[sku].netProceeds += proceeds;
              amazonSkuData[sku].adSpend += ads;
              // COGS already in Net proceeds - per-SKU cogs derived below
            }
          }
        });
        
        // Derive Amazon COGS from SKU Economics report (already embedded in Net proceeds)
        amzCogs = Math.max(0, amzRev - amzFees - amzAds - amzProfit);
        Object.values(amazonSkuData).forEach(s => { s.cogs = Math.max(0, (s.netSales || 0) - (s.netProceeds || 0) - (s.adSpend || 0)); });
        
        const amazonSkus = Object.values(amazonSkuData).sort((a, b) => b.netSales - a.netSales);
        
        // DEBUG: Log what was parsed
        if (amazonSkus.length > 0) {
        }
        
        // Validate dateRange before using
        if (!dateRange || !dateRange.endDate) {
          devError('Missing dateRange or endDate for file:', fileData.name);
          continue;
        }
        
        
        if (reportType === 'daily') {
          // Import as daily data
          const dateKey = dateRange.endDate.toISOString().split('T')[0];
          
          const existingShopify = updatedDailyData[dateKey]?.shopify || { revenue: 0, units: 0, cogs: 0, netProfit: 0, adSpend: 0, skuData: [] };
          const totalRev = amzRev + (existingShopify.revenue || 0);
          const totalUnits = amzUnits + (existingShopify.units || 0);
          const totalProfit = amzProfit + (existingShopify.netProfit || 0);
          const totalCogs = amzCogs + (existingShopify.cogs || 0);
          const totalAdSpend = amzAds + (existingShopify.adSpend || existingShopify.metaSpend || 0) + (existingShopify.googleSpend || 0);
          
          updatedDailyData[dateKey] = {
            date: dateKey,
            createdAt: new Date().toISOString(),
            amazon: {
              revenue: amzRev, units: amzUnits, returns: amzRet, cogs: amzCogs,
              fees: amzFees, adSpend: amzAds, netProfit: amzProfit,
              margin: amzRev > 0 ? (amzProfit / amzRev) * 100 : 0,
              skuData: amazonSkus,
              source: 'sku-economics',
            },
            shopify: existingShopify,
            total: {
              revenue: totalRev,
              units: totalUnits,
              netProfit: totalProfit,
              cogs: totalCogs,
              adSpend: totalAdSpend,
              netMargin: totalRev > 0 ? (totalProfit / totalRev) * 100 : 0,
              roas: totalAdSpend > 0 ? totalRev / totalAdSpend : 0,
              amazonShare: totalRev > 0 ? (amzRev / totalRev) * 100 : 0,
              shopifyShare: totalRev > 0 ? ((existingShopify.revenue || 0) / totalRev) * 100 : 0,
            },
          };
          dailyImported++;
        } else if (reportType === 'weekly') {
          // Import as weekly data
          const weekKey = dateRange.endDate.toISOString().split('T')[0];
          
          // Get existing Shopify data if available (from Shopify sync)
          const existingWeek = updatedWeeklyData[weekKey];
          const shopifyData = existingWeek?.shopify || { revenue: 0, units: 0, cogs: 0, netProfit: 0, skuData: [] };
          
          const totalRev = amzRev + shopifyData.revenue;
          const totalProfit = amzProfit + shopifyData.netProfit;
          
          updatedWeeklyData[weekKey] = {
            weekEnding: weekKey,
            createdAt: new Date().toISOString(),
            amazon: {
              revenue: amzRev, units: amzUnits, returns: amzRet, cogs: amzCogs,
              fees: amzFees, adSpend: amzAds, netProfit: amzProfit,
              margin: amzRev > 0 ? (amzProfit / amzRev) * 100 : 0,
              aov: amzUnits > 0 ? amzRev / amzUnits : 0,
              roas: amzAds > 0 ? amzRev / amzAds : 0,
              returnRate: amzUnits > 0 ? (amzRet / amzUnits) * 100 : 0,
              skuData: amazonSkus,
              source: 'sku-economics',
            },
            shopify: shopifyData,
            total: {
              revenue: totalRev,
              units: amzUnits + shopifyData.units,
              cogs: amzCogs + shopifyData.cogs,
              adSpend: amzAds + (shopifyData.adSpend || 0),
              netProfit: totalProfit,
              netMargin: totalRev > 0 ? (totalProfit / totalRev) * 100 : 0,
              amazonShare: totalRev > 0 ? (amzRev / totalRev) * 100 : 100,
              shopifyShare: totalRev > 0 ? (shopifyData.revenue / totalRev) * 100 : 0,
            },
          };
          weeklyImported++;
        } else if (reportType === 'monthly') {
          // Import as period data
          const monthLabel = dateRange.startDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          
          const existingPeriodShopify = updatedPeriodsData[monthLabel]?.shopify || { revenue: 0, units: 0, cogs: 0, netProfit: 0, adSpend: 0, skuData: [] };
          const periodTotalRev = amzRev + (existingPeriodShopify.revenue || 0);
          const periodTotalUnits = amzUnits + (existingPeriodShopify.units || 0);
          const periodTotalProfit = amzProfit + (existingPeriodShopify.netProfit || 0);
          const periodTotalCogs = amzCogs + (existingPeriodShopify.cogs || 0);
          const periodTotalAdSpend = amzAds + (existingPeriodShopify.adSpend || existingPeriodShopify.metaSpend || 0) + (existingPeriodShopify.googleSpend || 0);
          
          updatedPeriodsData[monthLabel] = {
            label: monthLabel,
            createdAt: new Date().toISOString(),
            amazon: {
              revenue: amzRev, units: amzUnits, returns: amzRet, cogs: amzCogs,
              fees: amzFees, adSpend: amzAds, netProfit: amzProfit,
              margin: amzRev > 0 ? (amzProfit / amzRev) * 100 : 0,
              skuData: amazonSkus,
              source: 'sku-economics',
            },
            shopify: existingPeriodShopify,
            total: {
              revenue: periodTotalRev,
              units: periodTotalUnits,
              netProfit: periodTotalProfit,
              cogs: periodTotalCogs,
              adSpend: periodTotalAdSpend,
              netMargin: periodTotalRev > 0 ? (periodTotalProfit / periodTotalRev) * 100 : 0,
              amazonShare: periodTotalRev > 0 ? (amzRev / periodTotalRev) * 100 : 0,
              shopifyShare: periodTotalRev > 0 ? ((existingPeriodShopify.revenue || 0) / periodTotalRev) * 100 : 0,
            },
          };
          monthlyImported++;
        } else {
          devWarn('Unknown report type:', reportType, 'for file:', fileData.name);
        }
      }
      
      
      // Save all updated data
      if (dailyImported > 0) {
        setAllDaysData(updatedDailyData);
        
        // Limit daily data to last 90 days to prevent quota issues
        const sortedDays = Object.keys(updatedDailyData).sort();
        const daysToKeep = sortedDays.slice(-90);
        const trimmedDailyData = {};
        daysToKeep.forEach(d => { trimmedDailyData[d] = updatedDailyData[d]; });
        
        try { 
          safeLocalStorageSet('ecommerce_daily_sales_v1', JSON.stringify(trimmedDailyData)); 
        } catch(e) {
          devError('Failed to save daily data to localStorage:', e.message);
          // Try with even fewer days
          try {
            const last30 = sortedDays.slice(-30);
            const minimal = {};
            last30.forEach(d => { minimal[d] = updatedDailyData[d]; });
            safeLocalStorageSet('ecommerce_daily_sales_v1', JSON.stringify(minimal));
          } catch(e2) {
            devError('Also failed with 30 days:', e2.message);
            // Last resort - just save without skuData to reduce size
            try {
              const last30 = sortedDays.slice(-30);
              const compact = {};
              last30.forEach(d => { 
                const day = updatedDailyData[d];
                compact[d] = {
                  ...day,
                  amazon: day.amazon ? { ...day.amazon, skuData: [] } : day.amazon,
                  shopify: day.shopify ? { ...day.shopify, skuData: [] } : day.shopify,
                };
              });
              safeLocalStorageSet('ecommerce_daily_sales_v1', JSON.stringify(compact));
            } catch(e3) {
              devError('Cannot save daily data - localStorage full');
            }
          }
        }
      }
      if (weeklyImported > 0) {
        setAllWeeksData(updatedWeeklyData);
        save(updatedWeeklyData);
      }
      if (monthlyImported > 0) {
        setAllPeriodsData(updatedPeriodsData);
        try { safeLocalStorageSet('ecommerce_periods_data_v1', JSON.stringify(updatedPeriodsData)); } catch(e) {
          devError('Failed to save periods data:', e.message);
        }
      }
      
      setAmazonBulkFiles([]);
      setAmazonBulkParsed(null);
      
      const messages = [];
      if (dailyImported > 0) messages.push(`${dailyImported} daily`);
      if (weeklyImported > 0) messages.push(`${weeklyImported} weekly`);
      if (monthlyImported > 0) messages.push(`${monthlyImported} monthly`);
      
      if (messages.length > 0) {
        setToast({ 
          message: `Imported ${messages.join(', ')} report${dailyImported + weeklyImported + monthlyImported > 1 ? 's' : ''}!`, 
          type: 'success' 
        });
      } else {
        setToast({ 
          message: 'No data was imported. Check console for details.', 
          type: 'warning' 
        });
      }
      
      // Navigate to appropriate view
      if (weeklyImported > 0) {
        const todayDate = new Date();
        const latestWeek = Object.keys(updatedWeeklyData).filter(wk => {
          const weekEnd = new Date(wk + 'T12:00:00');
          const weekStart = new Date(weekEnd);
          weekStart.setDate(weekStart.getDate() - 6);
          return weekStart <= todayDate;
        }).sort().reverse()[0];
        if (latestWeek) setSelectedWeek(latestWeek);
        setView('weekly');
      } else if (dailyImported > 0) {
        const todayStr = new Date().toISOString().split('T')[0];
        const latestDay = Object.keys(updatedDailyData).filter(k => hasDailySalesData(updatedDailyData[k]) && k <= todayStr).sort().reverse()[0];
        if (latestDay) setSelectedDay(latestDay);
        setView('daily');
      } else if (monthlyImported > 0) {
        setView('periods');
      }
    } catch (err) {
      devError('Bulk upload error:', err);
      devError('Error stack:', err.stack);
      setToast({ message: 'Error processing files: ' + err.message, type: 'error' });
    } finally {
      setAmazonBulkProcessing(false);
    }
  }, [amazonBulkFiles, getCogsLookup, allDaysData, allWeeksData, allPeriodsData, save]);
  
  // Process bulk ad upload - update weeks or periods with ad spend
  const processBulkAdUpload = useCallback((parsed, platform) => {
    if (!parsed) return;
    
    // Handle monthly data
    if (parsed.isMonthlyData && parsed.monthlyData?.length > 0) {
      setIsProcessing(true);
      
      try {
        const updatedPeriods = { ...allPeriodsData };
        let updatedCount = 0;
        let createdCount = 0;
        let skippedCount = 0;
        const skippedMonths = [];
        
        parsed.monthlyData.forEach(m => {
          const periodKey = m.periodLabel; // "Apr 2024"
          // Use per-record platform if available, fallback to passed parameter
          const recordPlatform = m.platform || platform;
          
          // Check if we have weekly data for this month (weekly data takes precedence)
          // Parse "Apr 2024" to check for weekly data
          const monthMatch = periodKey.match(/^(\w{3})\s+(\d{4})$/);
          if (monthMatch) {
            const monthNames = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
            const monthNum = monthNames[monthMatch[1].toLowerCase()];
            const year = parseInt(monthMatch[2]);
            
            if (monthNum && year) {
              // Check if any weeks exist in this month
              const hasWeeklyData = Object.keys(allWeeksData).some(weekKey => {
                const weekDate = new Date(weekKey + 'T00:00:00');
                return weekDate.getFullYear() === year && weekDate.getMonth() + 1 === monthNum;
              });
              
              if (hasWeeklyData) {
                // Skip this month - weekly data takes precedence
                skippedCount++;
                skippedMonths.push(periodKey);
                return;
              }
            }
          }
          
          if (updatedPeriods[periodKey]) {
            // Period exists - update ad spend
            const period = updatedPeriods[periodKey];
            const oldGoogleSpend = period.shopify?.googleSpend || period.shopify?.googleAds || 0;
            const oldMetaSpend = period.shopify?.metaSpend || period.shopify?.metaAds || 0;
            
            let newMetaSpend = oldMetaSpend;
            let newGoogleSpend = oldGoogleSpend;
            
            if (recordPlatform === 'google') {
              newGoogleSpend = m.spend;
            } else {
              newMetaSpend = m.spend;
            }
            
            const totalShopAds = newMetaSpend + newGoogleSpend;
            const oldShopAds = period.shopify?.adSpend || 0;
            const shopProfit = (getProfit(periodData.shopify)) + oldShopAds - totalShopAds;
            
            updatedPeriods[periodKey] = {
              ...period,
              shopify: {
                ...period.shopify,
                adSpend: totalShopAds,
                metaSpend: newMetaSpend,
                metaAds: newMetaSpend,
                googleSpend: newGoogleSpend,
                googleAds: newGoogleSpend,
                netProfit: shopProfit,
              },
              total: {
                ...period.total,
                adSpend: (period.amazon?.adSpend || 0) + totalShopAds,
                netProfit: (getProfit(periodData.amazon)) + shopProfit,
              },
              // Store ad KPIs
              adKPIs: {
                ...(period.adKPIs || {}),
                [recordPlatform]: {
                  spend: m.spend,
                  impressions: m.impressions,
                  clicks: m.clicks,
                  conversions: m.conversions,
                  cpc: m.cpc,
                  cpa: m.cpa,
                  ctr: m.ctr,
                }
              }
            };
            updatedCount++;
          } else {
            // Period doesn't exist - create it with ad data
            const metaSpend = recordPlatform === 'meta' ? m.spend : 0;
            const googleSpend = recordPlatform === 'google' ? m.spend : 0;
            const totalAds = metaSpend + googleSpend;
            
            updatedPeriods[periodKey] = {
              amazon: { revenue: 0, units: 0, cogs: 0, fees: 0, adSpend: 0, netProfit: 0 },
              shopify: { 
                revenue: 0, units: 0, cogs: 0, threeplCosts: 0, 
                adSpend: totalAds, metaSpend, metaAds: metaSpend, googleSpend, googleAds: googleSpend,
                netProfit: -totalAds
              },
              total: { revenue: 0, units: 0, cogs: 0, adSpend: totalAds, netProfit: -totalAds },
              adKPIs: {
                [recordPlatform]: {
                  spend: m.spend,
                  impressions: m.impressions,
                  clicks: m.clicks,
                  conversions: m.conversions,
                  cpc: m.cpc,
                  cpa: m.cpa,
                  ctr: m.ctr,
                }
              },
              _adDataOnly: true,
            };
            createdCount++;
          }
        });
        
        setAllPeriodsData(updatedPeriods);
        savePeriods(updatedPeriods);
        
        setBulkAdFiles([]);
        setBulkAdParsed(null);
        
        // Show platforms that were updated
        const platformNames = parsed.platforms?.length > 0 
          ? (parsed.platforms.length === 2 ? 'Google & Meta' : parsed.platforms[0] === 'google' ? 'Google' : 'Meta')
          : 'Ad';
        let message = `${platformNames} ads updated for ${updatedCount + createdCount} month(s)`;
        if (skippedCount > 0) {
          message += `. Skipped ${skippedCount} month(s) with weekly data: ${skippedMonths.slice(0, 3).join(', ')}${skippedMonths.length > 3 ? '...' : ''}`;
        }
        setToast({ 
          message, 
          type: 'success' 
        });
      } catch (e) {
        setToast({ message: `Error: ${e.message}`, type: 'error' });
      } finally {
        setIsProcessing(false);
      }
      return;
    }
    
    // Handle weekly data (which comes from daily data aggregation)
    if (!parsed?.weeklyData?.length) return;
    
    setIsProcessing(true);
    
    try {
      const updated = { ...allWeeksData };
      const updatedDays = { ...allDaysData }; // Also store daily data
      let updatedCount = 0;
      let createdCount = 0;
      let dailyCount = 0;
      
      // First, store the raw daily data if available
      if (parsed.dailyData?.length > 0) {
        parsed.dailyData.forEach(d => {
          if (d.isMonthly || d.isHourly) return; // Skip monthly/hourly records for daily storage
          
          const dayKey = d.date; // YYYY-MM-DD format
          const existingDay = updatedDays[dayKey] || {};
          const existingShopify = existingDay.shopify || { revenue: 0, units: 0, cogs: 0, adSpend: 0, metaSpend: 0, googleSpend: 0, discounts: 0, netProfit: 0 };
          
          // Use per-record platform if available, fallback to passed parameter
          const recordPlatform = d.platform || platform;
          
          // Store ad spend in daily data - both at top level AND in shopify object
          if (recordPlatform === 'google') {
            const newGoogleSpend = d.spend;
            const existingMeta = existingDay.metaSpend || existingShopify.metaSpend || 0;
            const totalAds = existingMeta + newGoogleSpend;
            
            // Recalculate profit with updated ad spend
            const grossProfit = (existingShopify.revenue || 0) - (existingShopify.cogs || 0) - (existingShopify.threeplCosts || 0);
            const newNetProfit = grossProfit - totalAds;
            
            // Also update total object
            const existingAmazon = existingDay.amazon || {};
            const existingTotal = existingDay.total || {};
            const amzProfit = existingAmazon.netProfit || 0;
            const totalProfit = amzProfit + (existingShopify.revenue > 0 ? newNetProfit : (existingShopify.netProfit || 0));
            const totalRevenue = (existingAmazon.revenue || 0) + (existingShopify.revenue || 0);
            
            updatedDays[dayKey] = {
              ...existingDay,
              // Top level ad data with full KPIs
              googleSpend: newGoogleSpend,
              googleAds: newGoogleSpend,
              googleImpressions: d.impressions,
              googleClicks: d.clicks,
              googleCpc: d.cpc,
              googleCpm: d.cpm,
              googleCpa: d.cpa,
              googleCtr: d.ctr,
              googleConversions: d.conversions,
              googleConvValue: d.convValue,
              googleRoas: d.roas,
              // Also update shopify object
              shopify: {
                ...existingShopify,
                googleSpend: newGoogleSpend,
                googleAds: newGoogleSpend,
                adSpend: totalAds,
                netProfit: existingShopify.revenue > 0 ? newNetProfit : existingShopify.netProfit,
                netMargin: existingShopify.revenue > 0 ? (newNetProfit / existingShopify.revenue) * 100 : 0,
                roas: totalAds > 0 ? existingShopify.revenue / totalAds : 0,
              },
              // Update total with new profit calculation
              total: {
                ...existingTotal,
                revenue: totalRevenue,
                adSpend: (existingAmazon.adSpend || 0) + totalAds,
                netProfit: totalProfit,
                netMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
              },
              // Store detailed ad KPIs by platform
              adKPIs: {
                ...(existingDay.adKPIs || {}),
                google: {
                  spend: newGoogleSpend,
                  impressions: d.impressions,
                  clicks: d.clicks,
                  ctr: d.ctr,
                  cpc: d.cpc,
                  cpm: d.cpm,
                  conversions: d.conversions,
                  convValue: d.convValue,
                  cpa: d.cpa,
                  roas: d.roas,
                },
              },
            };
          } else {
            const newMetaSpend = d.spend;
            const existingGoogle = existingDay.googleSpend || existingShopify.googleSpend || 0;
            const totalAds = newMetaSpend + existingGoogle;
            
            // Recalculate profit with updated ad spend
            const grossProfit = (existingShopify.revenue || 0) - (existingShopify.cogs || 0) - (existingShopify.threeplCosts || 0);
            const newNetProfit = grossProfit - totalAds;
            
            // Also update total object
            const existingAmazon = existingDay.amazon || {};
            const existingTotal = existingDay.total || {};
            const amzProfit = existingAmazon.netProfit || 0;
            const totalProfit = amzProfit + (existingShopify.revenue > 0 ? newNetProfit : (existingShopify.netProfit || 0));
            const totalRevenue = (existingAmazon.revenue || 0) + (existingShopify.revenue || 0);
            
            updatedDays[dayKey] = {
              ...existingDay,
              // Top level ad data with full KPIs
              metaSpend: newMetaSpend,
              metaAds: newMetaSpend,
              metaImpressions: d.impressions,
              metaClicks: d.clicks,
              metaCpc: d.cpc,
              metaCpm: d.cpm,
              metaCpa: d.cpa,
              metaCtr: d.ctr,
              metaConversions: d.conversions,
              metaConvValue: d.convValue,
              metaRoas: d.roas,
              // Also update shopify object
              shopify: {
                ...existingShopify,
                metaSpend: newMetaSpend,
                metaAds: newMetaSpend,
                adSpend: totalAds,
                netProfit: existingShopify.revenue > 0 ? newNetProfit : existingShopify.netProfit,
                netMargin: existingShopify.revenue > 0 ? (newNetProfit / existingShopify.revenue) * 100 : 0,
                roas: totalAds > 0 ? existingShopify.revenue / totalAds : 0,
              },
              // Update total with new profit calculation
              total: {
                ...existingTotal,
                revenue: totalRevenue,
                adSpend: (existingAmazon.adSpend || 0) + totalAds,
                netProfit: totalProfit,
                netMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
              },
              // Store detailed ad KPIs by platform
              adKPIs: {
                ...(existingDay.adKPIs || {}),
                meta: {
                  spend: newMetaSpend,
                  impressions: d.impressions,
                  clicks: d.clicks,
                  ctr: d.ctr,
                  cpc: d.cpc,
                  cpm: d.cpm,
                  conversions: d.conversions,
                  convValue: d.convValue,
                  cpa: d.cpa,
                  roas: d.roas,
                },
              },
            };
          }
          dailyCount++;
        });
        
        // Save daily data to localStorage and queue cloud sync
        setAllDaysData(updatedDays);
        lsSet('ecommerce_daily_sales_v1', JSON.stringify(updatedDays));
        queueCloudSave({ ...combinedData, dailySales: updatedDays });
      }
      
      // Then aggregate into weekly data
      parsed.weeklyData.forEach(w => {
        const weekKey = w.weekEnding;
        // Use per-record platform if available, fallback to passed parameter
        const recordPlatform = w.platform || platform;
        
        if (updated[weekKey]) {
          // Week exists - update ad spend
          const week = updated[weekKey];
          const oldMetaSpend = week.shopify?.metaSpend || 0;
          const oldGoogleSpend = week.shopify?.googleSpend || 0;
          
          let newMetaSpend = oldMetaSpend;
          let newGoogleSpend = oldGoogleSpend;
          
          if (recordPlatform === 'google') {
            newGoogleSpend = w.spend;
          } else {
            newMetaSpend = w.spend;
          }
          
          const totalShopAds = newMetaSpend + newGoogleSpend;
          const oldShopAds = week.shopify?.adSpend || 0;
          const shopProfit = (week.shopify?.netProfit || 0) + oldShopAds - totalShopAds;
          
          // Build KPI object for this platform
          const platformKPIs = {
            spend: w.spend,
            impressions: w.impressions,
            clicks: w.clicks,
            ctr: w.ctr,
            cpc: w.cpc,
            cpm: w.cpm,
            conversions: w.conversions,
            convValue: w.convValue,
            cpa: w.cpa,
            roas: w.roas,
          };
          
          updated[weekKey] = {
            ...week,
            shopify: {
              ...week.shopify,
              adSpend: totalShopAds,
              metaSpend: newMetaSpend,
              metaAds: newMetaSpend,
              googleSpend: newGoogleSpend,
              googleAds: newGoogleSpend,
              netProfit: shopProfit,
              netMargin: week.shopify?.revenue > 0 ? (shopProfit / week.shopify.revenue) * 100 : 0,
              roas: totalShopAds > 0 ? week.shopify.revenue / totalShopAds : 0,
            },
            total: {
              ...week.total,
              adSpend: (week.amazon?.adSpend || 0) + totalShopAds,
              netProfit: (week.amazon?.netProfit || 0) + shopProfit,
              netMargin: week.total?.revenue > 0 ? (((week.amazon?.netProfit || 0) + shopProfit) / week.total.revenue) * 100 : 0,
              roas: ((week.amazon?.adSpend || 0) + totalShopAds) > 0 ? week.total.revenue / ((week.amazon?.adSpend || 0) + totalShopAds) : 0,
            },
            // Store detailed KPIs by platform for the Ads page
            adKPIs: {
              ...(week.adKPIs || {}),
              [recordPlatform]: platformKPIs,
            },
          };
          updatedCount++;
        } else {
          // Week doesn't exist - create a placeholder with just ad data
          // This allows ad data to be stored even before weekly sales data is uploaded
          const metaSpend = recordPlatform === 'meta' ? w.spend : 0;
          const googleSpend = recordPlatform === 'google' ? w.spend : 0;
          const totalAds = metaSpend + googleSpend;
          
          // Build KPI object for this platform
          const platformKPIs = {
            spend: w.spend,
            impressions: w.impressions,
            clicks: w.clicks,
            ctr: w.ctr,
            cpc: w.cpc,
            cpm: w.cpm,
            conversions: w.conversions,
            convValue: w.convValue,
            cpa: w.cpa,
            roas: w.roas,
          };
          
          updated[weekKey] = {
            amazon: { revenue: 0, units: 0, cogs: 0, fees: 0, adSpend: 0, netProfit: 0, returns: 0, skuData: [] },
            shopify: { 
              revenue: 0, units: 0, cogs: 0, threeplCosts: 0, 
              adSpend: totalAds, metaSpend, metaAds: metaSpend, googleSpend, googleAds: googleSpend,
              netProfit: -totalAds, netMargin: 0, roas: 0, skuData: [] 
            },
            total: { revenue: 0, units: 0, cogs: 0, adSpend: totalAds, netProfit: -totalAds, netMargin: 0, roas: 0 },
            adKPIs: {
              [recordPlatform]: platformKPIs,
            },
            _adDataOnly: true, // Flag to indicate this is placeholder ad data
          };
          createdCount++;
        }
      });
      
      setAllWeeksData(updated);
      save(updated);
      
      // Store campaign and ad summaries for the Ads page (if available)
      if (parsed.campaignSummary?.length > 0 || parsed.adSummary?.length > 0) {
        const existingAdAnalytics = JSON.parse(localStorage.getItem('ecommerce_ad_analytics_v1') || '{}');
        // Store for each detected platform
        const platforms = parsed.platforms || [platform || 'unknown'];
        platforms.forEach(plat => {
          const updatedAdAnalytics = {
            ...existingAdAnalytics,
            lastUpdated: new Date().toISOString(),
            [plat]: {
              ...existingAdAnalytics[plat],
              lastImport: new Date().toISOString(),
              dateRange: parsed.dateRange,
              totalSpend: parsed.totalSpend,
              totalImpressions: parsed.totalImpressions,
              totalClicks: parsed.totalClicks,
              totalConversions: parsed.totalConversions,
              totalConvValue: parsed.totalConvValue,
              avgCpc: parsed.avgCpc,
              avgCpm: parsed.avgCpm,
              avgCtr: parsed.avgCtr,
              avgCpa: parsed.avgCpa,
              overallRoas: parsed.overallRoas,
              campaigns: parsed.campaignSummary || [],
              ads: parsed.adSummary || [],
              dailyData: parsed.dailyData || [],
            },
          };
          safeLocalStorageSet('ecommerce_ad_analytics_v1', JSON.stringify(updatedAdAnalytics));
        });
      }
      
      // Clear upload state
      setBulkAdFiles([]);
      setBulkAdParsed(null);
      
      // Show platforms that were updated
      const platformNames = parsed.platforms?.length > 0 
        ? (parsed.platforms.length === 2 ? 'Google & Meta' : parsed.platforms[0] === 'google' ? 'Google' : 'Meta')
        : 'Ad';
      let msg = `${platformNames} ads: ${updatedCount} week(s) updated`;
      if (createdCount > 0) msg += `, ${createdCount} placeholder week(s) created`;
      if (dailyCount > 0) msg += `, ${dailyCount} day(s) stored`;
      setToast({ message: msg, type: 'success' });
    } catch (e) {
      setToast({ message: `Error: ${e.message}`, type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  }, [allWeeksData, allDaysData, allPeriodsData, save, combinedData]);

  const getMonths = () => { const m = new Set(); Object.keys(allWeeksData).forEach(w => { const d = new Date(w+'T00:00:00'); m.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`); }); return Array.from(m).sort().reverse(); };
  const getYears = () => { const y = new Set(); Object.keys(allWeeksData).forEach(w => { y.add(new Date(w+'T00:00:00').getFullYear()); }); return Array.from(y).sort().reverse(); };
  const months = getMonths();
  const now = new Date();
  // Safe defaults for vars that original view components expect as props
  const response = null;
  const run = null;
  const saved = null;
  const show = null;
  const sorted = null;
  const status = null;
  const t = null;
  const topSkus = [];
  const updated = null;
  const xlsx = null;
  const accounts = null;
  const best = null;
  const breakdown = null;
  const bump = null;
  const byMonth = null;
  const categories = null;
  const confirmed = null;
  const data = null;
  const entry = null;
  const events = null;
  const m = null;
  const metrics = null;
  const prior = null;
  const result = null;
  const shown = null;
  const store = null;
  const totalOrders = null;
  const total = null;
  const transactions = null;
  const unpaid = null;
  const uploads = null;

  const getMonthlyData = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    const weeks = Object.entries(allWeeksData).filter(([w]) => { const d = new Date(w+'T00:00:00'); return d.getFullYear() === y && d.getMonth()+1 === m; });
    if (!weeks.length) return null;
    const agg = { weeks: weeks.map(([w]) => w), 
      amazon: { revenue: 0, units: 0, returns: 0, cogs: 0, fees: 0, adSpend: 0, netProfit: 0 }, 
      shopify: { revenue: 0, units: 0, cogs: 0, threeplCosts: 0, adSpend: 0, metaSpend: 0, googleSpend: 0, discounts: 0, netProfit: 0, threeplBreakdown: { storage: 0, shipping: 0, pickFees: 0, boxCharges: 0, receiving: 0, other: 0 }, threeplMetrics: { orderCount: 0, totalUnits: 0 } }, 
      total: { revenue: 0, units: 0, cogs: 0, adSpend: 0, netProfit: 0 }};
    weeks.forEach(([w, d]) => {
      // Get ledger 3PL for this week
      const ledger3PL = get3PLForWeek(threeplLedger, w);
      const weekThreeplCost = ledger3PL?.metrics?.totalCost || d.shopify?.threeplCosts || 0;
      const weekThreeplBreakdown = ledger3PL?.breakdown || d.shopify?.threeplBreakdown || {};
      const weekThreeplMetrics = ledger3PL?.metrics || d.shopify?.threeplMetrics || {};
      
      agg.amazon.revenue += d.amazon?.revenue || 0; agg.amazon.units += d.amazon?.units || 0; agg.amazon.returns += d.amazon?.returns || 0;
      agg.amazon.cogs += d.amazon?.cogs || 0; agg.amazon.fees += d.amazon?.fees || 0; agg.amazon.adSpend += d.amazon?.adSpend || 0; agg.amazon.netProfit += getProfit(d.amazon);
      agg.shopify.revenue += d.shopify?.revenue || 0; agg.shopify.units += d.shopify?.units || 0; agg.shopify.cogs += d.shopify?.cogs || 0;
      agg.shopify.threeplCosts += weekThreeplCost; agg.shopify.adSpend += d.shopify?.adSpend || 0; 
      agg.shopify.metaSpend += d.shopify?.metaSpend || 0; agg.shopify.googleSpend += d.shopify?.googleSpend || 0;
      agg.shopify.discounts += d.shopify?.discounts || 0;
      // Recalculate shopify profit with ledger 3PL
      const shopProfit = (d.shopify?.revenue || 0) - (d.shopify?.cogs || 0) - weekThreeplCost - (d.shopify?.adSpend || 0);
      agg.shopify.netProfit += shopProfit;
      // Aggregate 3PL breakdown
      agg.shopify.threeplBreakdown.storage += weekThreeplBreakdown.storage || 0;
      agg.shopify.threeplBreakdown.shipping += weekThreeplBreakdown.shipping || 0;
      agg.shopify.threeplBreakdown.pickFees += weekThreeplBreakdown.pickFees || 0;
      agg.shopify.threeplBreakdown.boxCharges += weekThreeplBreakdown.boxCharges || 0;
      agg.shopify.threeplBreakdown.receiving += weekThreeplBreakdown.receiving || 0;
      agg.shopify.threeplBreakdown.other += weekThreeplBreakdown.other || 0;
      agg.shopify.threeplMetrics.orderCount += weekThreeplMetrics.orderCount || 0;
      agg.shopify.threeplMetrics.totalUnits += weekThreeplMetrics.totalUnits || 0;
      agg.total.revenue += d.total?.revenue || 0; agg.total.units += d.total?.units || 0; agg.total.cogs += d.total?.cogs || 0; agg.total.adSpend += d.total?.adSpend || 0; 
      agg.total.netProfit += (getProfit(d.amazon)) + shopProfit;
    });
    // Calculate metrics
    agg.shopify.threeplMetrics.avgCostPerOrder = agg.shopify.threeplMetrics.orderCount > 0 ? (agg.shopify.threeplCosts - agg.shopify.threeplBreakdown.storage) / agg.shopify.threeplMetrics.orderCount : 0;
    agg.shopify.threeplMetrics.avgUnitsPerOrder = agg.shopify.threeplMetrics.orderCount > 0 ? agg.shopify.threeplMetrics.totalUnits / agg.shopify.threeplMetrics.orderCount : 0;
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
      shopify: { revenue: 0, units: 0, cogs: 0, threeplCosts: 0, adSpend: 0, metaSpend: 0, googleSpend: 0, discounts: 0, netProfit: 0, threeplBreakdown: { storage: 0, shipping: 0, pickFees: 0, boxCharges: 0, receiving: 0, other: 0 }, threeplMetrics: { orderCount: 0, totalUnits: 0 } }, 
      total: { revenue: 0, units: 0, cogs: 0, adSpend: 0, netProfit: 0 }, monthlyBreakdown: {}};
    weeks.forEach(([w, d]) => {
      const dt = new Date(w+'T00:00:00'); const mk = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
      if (!agg.monthlyBreakdown[mk]) agg.monthlyBreakdown[mk] = { revenue: 0, netProfit: 0 };
      
      // Get ledger 3PL for this week
      const ledger3PL = get3PLForWeek(threeplLedger, w);
      const weekThreeplCost = ledger3PL?.metrics?.totalCost || d.shopify?.threeplCosts || 0;
      const weekThreeplBreakdown = ledger3PL?.breakdown || d.shopify?.threeplBreakdown || {};
      const weekThreeplMetrics = ledger3PL?.metrics || d.shopify?.threeplMetrics || {};
      
      agg.amazon.revenue += d.amazon?.revenue || 0; agg.amazon.units += d.amazon?.units || 0; agg.amazon.returns += d.amazon?.returns || 0;
      agg.amazon.cogs += d.amazon?.cogs || 0; agg.amazon.fees += d.amazon?.fees || 0; agg.amazon.adSpend += d.amazon?.adSpend || 0; agg.amazon.netProfit += getProfit(d.amazon);
      agg.shopify.revenue += d.shopify?.revenue || 0; agg.shopify.units += d.shopify?.units || 0; agg.shopify.cogs += d.shopify?.cogs || 0;
      agg.shopify.threeplCosts += weekThreeplCost; agg.shopify.adSpend += d.shopify?.adSpend || 0;
      agg.shopify.metaSpend += d.shopify?.metaSpend || 0; agg.shopify.googleSpend += d.shopify?.googleSpend || 0;
      agg.shopify.discounts += d.shopify?.discounts || 0;
      // Recalculate shopify profit with ledger 3PL
      const shopProfit = (d.shopify?.revenue || 0) - (d.shopify?.cogs || 0) - weekThreeplCost - (d.shopify?.adSpend || 0);
      agg.shopify.netProfit += shopProfit;
      // Aggregate 3PL breakdown
      agg.shopify.threeplBreakdown.storage += weekThreeplBreakdown.storage || 0;
      agg.shopify.threeplBreakdown.shipping += weekThreeplBreakdown.shipping || 0;
      agg.shopify.threeplBreakdown.pickFees += weekThreeplBreakdown.pickFees || 0;
      agg.shopify.threeplBreakdown.boxCharges += weekThreeplBreakdown.boxCharges || 0;
      agg.shopify.threeplBreakdown.receiving += weekThreeplBreakdown.receiving || 0;
      agg.shopify.threeplBreakdown.other += weekThreeplBreakdown.other || 0;
      agg.shopify.threeplMetrics.orderCount += weekThreeplMetrics.orderCount || 0;
      agg.shopify.threeplMetrics.totalUnits += weekThreeplMetrics.totalUnits || 0;
      agg.total.revenue += d.total?.revenue || 0; agg.total.units += d.total?.units || 0; agg.total.cogs += d.total?.cogs || 0; agg.total.adSpend += d.total?.adSpend || 0;
      agg.total.netProfit += (getProfit(d.amazon)) + shopProfit;
      agg.monthlyBreakdown[mk].revenue += d.total?.revenue || 0; agg.monthlyBreakdown[mk].netProfit += (getProfit(d.amazon)) + shopProfit;
    });
    // Calculate metrics
    agg.shopify.threeplMetrics.avgCostPerOrder = agg.shopify.threeplMetrics.orderCount > 0 ? (agg.shopify.threeplCosts - agg.shopify.threeplBreakdown.storage) / agg.shopify.threeplMetrics.orderCount : 0;
    agg.shopify.threeplMetrics.avgUnitsPerOrder = agg.shopify.threeplMetrics.orderCount > 0 ? agg.shopify.threeplMetrics.totalUnits / agg.shopify.threeplMetrics.orderCount : 0;
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
      version: '3.0',
      exportedAt: new Date().toISOString(),
      storeName,
      storeLogo,
      // Core sales data
      sales: allWeeksData,
      dailySales: allDaysData, // Daily data export
      periods: allPeriodsData,
      inventory: invHistory, 
      cogs: savedCogs,
      // Settings & config
      goals,
      settings: appSettings,
      salesTax: salesTaxConfig, // Renamed for consistency
      salesTaxConfig, // Keep old name for backward compatibility
      productNames: savedProductNames,
      theme,
      widgetConfig,
      // New features
      invoices,
      amazonForecasts,
      forecastMeta,
      weekNotes,
      productionPipeline,
      threeplLedger,
      amazonCampaigns,
      // Self-learning forecast data
      forecastAccuracyHistory,
      forecastCorrections,
      aiForecasts,
      leadTimeSettings,
      aiForecastModule,
      aiLearningHistory,
      // UNIFIED AI MODEL - single source of truth for all learning
      unifiedAIModel,
      // AI & Reports
      weeklyReports,
      aiMessages,
      // Banking data
      bankingData,
    };
    const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' }); 
    const a = document.createElement('a');
    // Use local date for filename (not UTC)
    const backupDate = new Date();
    const localDate = `${backupDate.getFullYear()}-${String(backupDate.getMonth() + 1).padStart(2, '0')}-${String(backupDate.getDate()).padStart(2, '0')}`;
    a.href = URL.createObjectURL(blob); 
    a.download = `${storeName || 'dashboard'}_FULL_backup_${localDate}.json`; 
    a.click();
    // Track last backup date
    const backupTimestamp = new Date().toISOString();
    safeLocalStorageSet('ecommerce_last_backup', backupTimestamp);
    setLastBackupDate(backupTimestamp);
    audit('backup_export', 'Complete backup v3.0'); setToast({ message: 'Complete backup downloaded (v3.0)', type: 'success' });
  };
  
  // COMPLETE RESTORE - restores ALL dashboard data
  const importData = (file) => { 
    const reader = new FileReader(); 
    reader.onload = async (e) => { 
      try { 
        const d = JSON.parse(e.target.result); 
        let restored = [];
        
        // Build merged data for cloud sync
        let mergedData = { ...combinedData };
        
        // Core data - deep merge to preserve ad data in weekly data
        if (d.sales && Object.keys(d.sales).length > 0) { 
          const mergedSales = { ...allWeeksData };
          Object.entries(d.sales).forEach(([weekKey, weekData]) => {
            const existing = mergedSales[weekKey] || {};
            const existingShopify = existing.shopify || {};
            const newShopify = weekData.shopify || {};
            
            // Preserve ad data from both sources (existing takes precedence)
            const metaSpend = existingShopify.metaSpend || existingShopify.metaAds || newShopify.metaSpend || newShopify.metaAds || 0;
            const googleSpend = existingShopify.googleSpend || existingShopify.googleAds || newShopify.googleSpend || newShopify.googleAds || 0;
            const totalAds = metaSpend + googleSpend;
            
            mergedSales[weekKey] = {
              ...existing,
              ...weekData,
              shopify: {
                ...newShopify,
                metaSpend: metaSpend,
                metaAds: metaSpend,
                googleSpend: googleSpend,
                googleAds: googleSpend,
                adSpend: totalAds || newShopify.adSpend || 0,
              },
            };
          });
          setAllWeeksData(mergedSales); 
          await save(mergedSales); 
          mergedData.sales = mergedSales;
          restored.push(`${Object.keys(d.sales).length} weeks`);
        }
        // Daily data - deep merge to preserve ad data
        if (d.dailySales && Object.keys(d.dailySales).length > 0) {
          const mergedDays = { ...allDaysData };
          Object.entries(d.dailySales).forEach(([dateKey, dayData]) => {
            const existing = mergedDays[dateKey] || {};
            // Preserve ad data from both sources
            const metaSpend = existing.metaSpend || existing.shopify?.metaSpend || dayData.metaSpend || dayData.shopify?.metaSpend || 0;
            const googleSpend = existing.googleSpend || existing.shopify?.googleSpend || dayData.googleSpend || dayData.shopify?.googleSpend || 0;
            
            mergedDays[dateKey] = {
              ...existing,
              ...dayData,
              // Ensure ad data is preserved
              metaSpend: metaSpend,
              metaAds: metaSpend,
              metaImpressions: existing.metaImpressions || dayData.metaImpressions,
              metaClicks: existing.metaClicks || dayData.metaClicks,
              metaCpc: existing.metaCpc || dayData.metaCpc,
              metaCpa: existing.metaCpa || dayData.metaCpa,
              metaConversions: existing.metaConversions || dayData.metaConversions,
              googleSpend: googleSpend,
              googleAds: googleSpend,
              googleImpressions: existing.googleImpressions || dayData.googleImpressions,
              googleClicks: existing.googleClicks || dayData.googleClicks,
              googleCpc: existing.googleCpc || dayData.googleCpc,
              googleCpa: existing.googleCpa || dayData.googleCpa,
              googleConversions: existing.googleConversions || dayData.googleConversions,
              // Merge shopify with ad data
              shopify: dayData.shopify ? {
                ...dayData.shopify,
                metaSpend: metaSpend,
                metaAds: metaSpend,
                googleSpend: googleSpend,
                googleAds: googleSpend,
                adSpend: metaSpend + googleSpend,
              } : existing.shopify,
            };
          });
          setAllDaysData(mergedDays);
          lsSet('ecommerce_daily_sales_v1', JSON.stringify(mergedDays));
          mergedData.dailySales = mergedDays;
          restored.push(`${Object.keys(d.dailySales).length} days`);
        }
        if (d.inventory && Object.keys(d.inventory).length > 0) { 
          const mergedInv = {...invHistory, ...d.inventory};
          setInvHistory(mergedInv); 
          await saveInv(mergedInv); 
          mergedData.inventory = mergedInv;
          restored.push('inventory');
        } 
        if (d.cogs && Object.keys(d.cogs).length > 0) { 
          setSavedCogs(d.cogs); 
          await saveCogs(d.cogs); 
          mergedData.cogs = { lookup: d.cogs, updatedAt: new Date().toISOString() };
          restored.push('COGS');
        } 
        if (d.periods && Object.keys(d.periods).length > 0) { 
          const mergedPeriods = {...allPeriodsData, ...d.periods};
          setAllPeriodsData(mergedPeriods); 
          await savePeriods(mergedPeriods); 
          mergedData.periods = mergedPeriods;
          restored.push(`${Object.keys(d.periods).length} periods`);
        } 
        if (d.goals) { 
          setGoals(d.goals); 
          lsSet(GOALS_KEY, JSON.stringify(d.goals)); 
          mergedData.goals = d.goals;
          restored.push('goals');
        } 
        if (d.storeName) { 
          setStoreName(d.storeName); 
          lsSet(STORE_KEY, d.storeName); 
          mergedData.storeName = d.storeName;
        }
        
        // Settings & config
        if (d.settings) {
          setAppSettings(d.settings);
          lsSet(SETTINGS_KEY, JSON.stringify(d.settings));
          mergedData.settings = d.settings;
          restored.push('settings');
        }
        if (d.salesTax || d.salesTaxConfig) {
          const taxConfig = d.salesTax || d.salesTaxConfig;
          setSalesTaxConfig(taxConfig);
          lsSet(SALES_TAX_KEY, JSON.stringify(taxConfig));
          mergedData.salesTax = taxConfig;
          restored.push('sales tax');
        }
        if (d.productNames) {
          setSavedProductNames(d.productNames);
          lsSet(PRODUCT_NAMES_KEY, JSON.stringify(d.productNames));
          mergedData.productNames = d.productNames;
          restored.push('product names');
        }
        if (d.theme) {
          setTheme(d.theme);
          lsSet(THEME_KEY, JSON.stringify(d.theme));
          mergedData.theme = d.theme;
        }
        
        // New features
        if (d.invoices && d.invoices.length > 0) {
          setInvoices(d.invoices);
          mergedData.invoices = d.invoices;
          restored.push(`${d.invoices.length} invoices`);
        }
        if (d.amazonForecasts && Object.keys(d.amazonForecasts).length > 0) {
          setAmazonForecasts(d.amazonForecasts);
          mergedData.amazonForecasts = d.amazonForecasts;
          restored.push(`${Object.keys(d.amazonForecasts).length} forecasts`);
        }
        if (d.forecastMeta) {
          setForecastMeta(d.forecastMeta);
          safeLocalStorageSet('ecommerce_forecast_meta', JSON.stringify(d.forecastMeta));
          mergedData.forecastMeta = d.forecastMeta;
          restored.push('forecast tracking');
        }
        if (d.weekNotes && Object.keys(d.weekNotes).length > 0) {
          const mergedNotes = {...weekNotes, ...d.weekNotes};
          setWeekNotes(mergedNotes);
          mergedData.weekNotes = mergedNotes;
          restored.push('notes');
        }
        if (d.productionPipeline && d.productionPipeline.length > 0) {
          setProductionPipeline(d.productionPipeline);
          mergedData.productionPipeline = d.productionPipeline;
          restored.push(`${d.productionPipeline.length} production orders`);
        }
        if (d.storeLogo) {
          setStoreLogo(d.storeLogo);
          mergedData.storeLogo = d.storeLogo;
        }
        if (d.threeplLedger && (Object.keys(d.threeplLedger.orders || {}).length > 0 || Object.keys(d.threeplLedger.summaryCharges || {}).length > 0)) {
          setThreeplLedger(d.threeplLedger);
          lsSet(THREEPL_LEDGER_KEY, JSON.stringify(d.threeplLedger));
          mergedData.threeplLedger = d.threeplLedger;
          restored.push(`${Object.keys(d.threeplLedger.orders || {}).length} 3PL orders`);
        }
        if (d.widgetConfig) {
          setWidgetConfig(d.widgetConfig);
          lsSet(WIDGET_KEY, JSON.stringify(d.widgetConfig));
          mergedData.widgetConfig = d.widgetConfig;
          restored.push('widget config');
        }
        
        // Restore self-learning forecast data
        if (d.forecastAccuracyHistory && d.forecastAccuracyHistory.records && d.forecastAccuracyHistory.records.length > 0) {
          setForecastAccuracyHistory(d.forecastAccuracyHistory);
          safeLocalStorageSet(FORECAST_ACCURACY_KEY, JSON.stringify(d.forecastAccuracyHistory));
          mergedData.forecastAccuracyHistory = d.forecastAccuracyHistory;
          restored.push(`${d.forecastAccuracyHistory.records.length} learning samples`);
        }
        if (d.forecastCorrections && d.forecastCorrections.samplesUsed > 0) {
          setForecastCorrections(d.forecastCorrections);
          safeLocalStorageSet(FORECAST_CORRECTIONS_KEY, JSON.stringify(d.forecastCorrections));
          mergedData.forecastCorrections = d.forecastCorrections;
          restored.push('forecast corrections');
        }
        
        // Restore additional data types
        if (d.amazonCampaigns && (d.amazonCampaigns.campaigns?.length > 0 || d.amazonCampaigns.history?.length > 0)) {
          setAmazonCampaigns(d.amazonCampaigns);
          lsSet('ecommerce_amazon_campaigns_v1', JSON.stringify(d.amazonCampaigns));
          mergedData.amazonCampaigns = d.amazonCampaigns;
          restored.push(`${d.amazonCampaigns.campaigns?.length || 0} ad campaigns`);
        }
        if (d.bankingData && d.bankingData.transactions?.length > 0) {
          setBankingData(d.bankingData);
          lsSet('ecommerce_banking_v1', JSON.stringify(d.bankingData));
          mergedData.bankingData = d.bankingData;
          restored.push(`${d.bankingData.transactions.length} banking transactions`);
        }
        if (d.aiMessages && d.aiMessages.length > 0) {
          setAiMessages(d.aiMessages);
          lsSet('ecommerce_ai_chat_history_v1', JSON.stringify(d.aiMessages));
          mergedData.aiMessages = d.aiMessages;
          restored.push('AI chat history');
        }
        if (d.aiLearningHistory && (d.aiLearningHistory.predictions?.length > 0 || d.aiLearningHistory.modelUpdates?.length > 0)) {
          setAiLearningHistory(d.aiLearningHistory);
          lsSet('ecommerce_ai_learning_v1', JSON.stringify(d.aiLearningHistory));
          mergedData.aiLearningHistory = d.aiLearningHistory;
          restored.push('AI learning history');
        }
        // UNIFIED AI MODEL - restore comprehensive learning state
        if (d.unifiedAIModel && d.unifiedAIModel.lastUpdated) {
          setUnifiedAIModel(d.unifiedAIModel);
          lsSet('ecommerce_unified_ai_v1', JSON.stringify(d.unifiedAIModel));
          mergedData.unifiedAIModel = d.unifiedAIModel;
          restored.push('Unified AI model');
        }
        if (d.weeklyReports && Object.keys(d.weeklyReports).length > 0) {
          setWeeklyReports(d.weeklyReports);
          lsSet(WEEKLY_REPORTS_KEY, JSON.stringify(d.weeklyReports));
          mergedData.weeklyReports = d.weeklyReports;
          restored.push(`${Object.keys(d.weeklyReports).length} reports`);
        }
        
        // CRITICAL: Push all merged data to cloud to ensure sync
        if (session?.user?.id && supabase) {
          queueCloudSave(mergedData);
        }
        
        audit('data_restore', `Restored: ${restored.join(', ')}`); setToast({ message: `Restored: ${restored.join(', ')}. Syncing to cloud...`, type: 'success' });
      } catch (err) { 
        devError('Import error:', err);
        setToast({ message: 'Invalid backup file: ' + err.message, type: 'error' });
      }
    }; 
    reader.readAsText(file); 
  };

  // 5. FORECASTING - Simple linear regression based forecast
  const generateForecast = useMemo(() => {
    const sortedWeeks = Object.keys(allWeeksData).sort();
    const sortedPeriods = Object.keys(allPeriodsData).sort();
    
    // Get Amazon forecast data - check all formats and find upcoming ones
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const upcomingForecasts = Object.entries(amazonForecasts)
      .filter(([weekKey, data]) => {
        // Try to parse the date - support multiple formats
        const d = new Date(weekKey + 'T00:00:00');
        const isValidDate = !isNaN(d);
        const isFuture = d >= today;
        const hasData = data && ((data.totalSales || 0) > 0 || (data.totals?.sales || 0) > 0);
        return isValidDate && isFuture && hasData;
      })
      .sort((a, b) => a[0].localeCompare(b[0]));
    
    // Debug: count how many forecasts we have
    const forecastCount = upcomingForecasts.length;
    
    // Calculate trend from recent weeks
    const calcWeeklyTrend = (weeks) => {
      if (weeks.length < 2) return { slope: 0, avgRev: 0, avgProfit: 0, avgUnits: 0 };
      const revenues = weeks.map(w => allWeeksData[w]?.total?.revenue || 0);
      const profits = weeks.map(w => getProfit(allWeeksData[w]?.total));
      const units = weeks.map(w => allWeeksData[w]?.total?.units || 0);
      
      const n = revenues.length;
      const avgRev = revenues.reduce((s, v) => s + v, 0) / n;
      const avgProfit = profits.reduce((s, v) => s + v, 0) / n;
      const avgUnits = units.reduce((s, v) => s + v, 0) / n;
      
      // Calculate slope (trend direction)
      const sumX = revenues.reduce((s, _, i) => s + i, 0);
      const sumY = revenues.reduce((s, v) => s + v, 0);
      const sumXY = revenues.reduce((s, v, i) => s + i * v, 0);
      const sumX2 = revenues.reduce((s, _, i) => s + i * i, 0);
      const denom = n * sumX2 - sumX * sumX;
      const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
      const slopePercent = avgRev > 0 ? (slope / avgRev * 100) : 0;
      
      return { slope, slopePercent, avgRev, avgProfit, avgUnits };
    };
    
    // Priority 1: If we have 4+ weeks of weekly data, use linear regression with variance
    // Filter out weeks with no revenue (incomplete data)
    const weeksWithRevenue = sortedWeeks.filter(w => (allWeeksData[w]?.total?.revenue || 0) > 0);
    if (weeksWithRevenue.length >= 4) {
      const recentWeeks = weeksWithRevenue.slice(-8);
      const trend = calcWeeklyTrend(recentWeeks);
      
      const revenues = recentWeeks.map(w => allWeeksData[w]?.total?.revenue || 0);
      const profits = recentWeeks.map(w => getProfit(allWeeksData[w]?.total));
      const units = recentWeeks.map(w => allWeeksData[w]?.total?.units || 0);
      
      // Calculate standard deviation for realistic variance
      const variance = revenues.reduce((s, v) => s + Math.pow(v - trend.avgRev, 2), 0) / revenues.length;
      const stdDev = Math.sqrt(variance);
      
      const n = revenues.length;
      const forecast = [];
      
      for (let i = 0; i < 4; i++) {
        // Calculate trend-based projection
        const trendRevenue = Math.max(0, trend.avgRev + trend.slope * (i + 1));
        const trendProfit = trend.avgProfit + (trend.avgProfit > 0 ? trend.slope * 0.35 * (i + 1) : trend.slope * 0.5 * (i + 1));
        const trendUnits = Math.max(0, Math.round(trend.avgUnits * (1 + trend.slopePercent / 100 * (i + 1))));
        
        // Check for Amazon forecast for this week (by index)
        const amazonForecast = upcomingForecasts[i]?.[1];
        
        if (amazonForecast) {
          const amzSales = amazonForecast.totalSales || amazonForecast.totals?.sales || 0;
          const amzProceeds = amazonForecast.totalProceeds || amazonForecast.totals?.proceeds || 0;
          const amzUnits = amazonForecast.totalUnits || amazonForecast.totals?.units || 0;
          
          // Use Amazon forecast primarily (70%) blended with trend (30%)
          forecast.push({
            week: `Week +${i + 1}`,
            weekDate: upcomingForecasts[i]?.[0],
            revenue: Math.round(amzSales * 0.7 + trendRevenue * 0.3),
            profit: Math.round(amzProceeds * 0.7 + trendProfit * 0.3),
            units: Math.round(amzUnits * 0.7 + trendUnits * 0.3),
            hasAmazonForecast: true,
            amazonRaw: { sales: amzSales, proceeds: amzProceeds, units: amzUnits },
          });
        } else {
          // Use pure trend with deterministic weekly variance (stable across re-renders)
          // Seeded by week index + data length to produce consistent but varied values
          const seed = (i + 1) * 9301 + recentWeeks.length * 49297;
          const pseudoRandom = (Math.sin(seed) * 49297) % 1;
          const weekVariance = 1 + (Math.abs(pseudoRandom) - 0.5) * 0.08 * (i + 1); // ±4-16% variance
          forecast.push({
            week: `Week +${i + 1}`,
            revenue: Math.round(trendRevenue * weekVariance),
            profit: Math.round(trendProfit * weekVariance),
            units: Math.round(trendUnits * weekVariance),
            hasAmazonForecast: false,
          });
        }
      }
      
      const monthlyRevenue = forecast.reduce((s, f) => s + f.revenue, 0);
      const monthlyProfit = forecast.reduce((s, f) => s + f.profit, 0);
      const monthlyUnits = forecast.reduce((s, f) => s + f.units, 0);
      
      const confidence = trend.avgRev > 0 ? Math.max(30, Math.min(95, 85 - (stdDev / trend.avgRev * 50))) : 50;
      
      return {
        weekly: forecast,
        monthly: { revenue: monthlyRevenue, profit: monthlyProfit, units: monthlyUnits },
        trend: { 
          revenue: trend.slope > trend.avgRev * 0.01 ? 'up' : trend.slope < -trend.avgRev * 0.01 ? 'down' : 'flat',
          revenueChange: trend.slopePercent,
        },
        confidence: confidence.toFixed(0),
        basedOn: recentWeeks.length,
        source: forecastCount > 0 ? 'weekly-amazon' : 'weekly',
        amazonBlended: forecastCount > 0,
        amazonForecastCount: forecastCount,
      };
    }
    
    // Priority 2: If we have 1-3 weeks of weekly data, use averages with decay
    if (weeksWithRevenue.length >= 1) {
      const trend = calcWeeklyTrend(weeksWithRevenue);
      
      // Get seasonality adjustment from period data
      let seasonalityFactor = 1.0;
      const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });
      const lastYearSameMonth = `${currentMonth} ${new Date().getFullYear() - 1}`;
      const thisYearData = allPeriodsData[`${currentMonth} ${new Date().getFullYear()}`];
      const lastYearData = allPeriodsData[lastYearSameMonth];
      
      if (lastYearData && lastYearData.total?.revenue > 0 && thisYearData && thisYearData.total?.revenue > 0) {
        const yoyGrowth = (thisYearData.total.revenue - lastYearData.total.revenue) / lastYearData.total.revenue;
        seasonalityFactor = 1 + (yoyGrowth * 0.25);
      }
      
      const forecast = [];
      for (let i = 0; i < 4; i++) {
        const amazonForecast = upcomingForecasts[i]?.[1];
        // Apply slight variance so weeks aren't identical
        const weekVariance = 1 + (i * 0.02) - 0.03; // Slight growth trend assumption
        
        if (amazonForecast && (amazonForecast.totalSales > 0 || amazonForecast.totals?.sales > 0)) {
          const amzSales = amazonForecast.totalSales || amazonForecast.totals?.sales || 0;
          const amzProceeds = amazonForecast.totalProceeds || amazonForecast.totals?.proceeds || 0;
          const amzUnits = amazonForecast.totalUnits || amazonForecast.totals?.units || 0;
          
          forecast.push({
            week: `Week +${i + 1}`,
            revenue: Math.round(amzSales * 0.7 + trend.avgRev * seasonalityFactor * 0.3),
            profit: Math.round(amzProceeds * 0.7 + trend.avgProfit * seasonalityFactor * 0.3),
            units: Math.round(amzUnits * 0.7 + trend.avgUnits * seasonalityFactor * 0.3),
            hasAmazonForecast: true,
          });
        } else {
          forecast.push({
            week: `Week +${i + 1}`,
            revenue: Math.round(trend.avgRev * seasonalityFactor * weekVariance),
            profit: Math.round(trend.avgProfit * seasonalityFactor * weekVariance),
            units: Math.round(trend.avgUnits * seasonalityFactor * weekVariance),
          });
        }
      }
      
      const hasAmazon = upcomingForecasts.length > 0;
      const hasPeriods = sortedPeriods.length > 0;
      
      return {
        weekly: forecast,
        monthly: { revenue: forecast.reduce((s, f) => s + f.revenue, 0), profit: forecast.reduce((s, f) => s + f.profit, 0), units: forecast.reduce((s, f) => s + f.units, 0) },
        trend: { revenue: trend.slopePercent > 2 ? 'up' : trend.slopePercent < -2 ? 'down' : 'flat', revenueChange: trend.slopePercent },
        confidence: Math.min(80, 40 + sortedWeeks.length * 12 + (hasAmazon ? 15 : 0) + (hasPeriods ? 8 : 0)).toFixed(0),
        basedOn: sortedWeeks.length,
        source: hasAmazon ? 'weekly-amazon' : 'weekly-avg',
        note: sortedWeeks.length < 4 ? `Based on ${sortedWeeks.length} week${sortedWeeks.length > 1 ? 's' : ''} of data${hasAmazon ? ' + Amazon forecast' : ''}. Need 4+ weeks for trend analysis.` : null,
        amazonBlended: hasAmazon,
        seasonalityApplied: seasonalityFactor !== 1.0 ? seasonalityFactor : null,
      };
    }
    
    // Priority 3: Only period data - use averages
    if (sortedPeriods.length >= 1) {
      let totalRevenue = 0, totalProfit = 0, totalUnits = 0, totalMonths = 0;
      
      sortedPeriods.forEach(p => {
        const period = allPeriodsData[p];
        const rev = (period.amazon?.revenue || 0) + (period.shopify?.revenue || 0);
        const profit = (getProfit(periodData.amazon)) + (getProfit(periodData.shopify));
        const units = (period.amazon?.units || 0) + (period.shopify?.units || 0);
        const startDate = new Date(period.startDate || p);
        const endDate = new Date(period.endDate || p);
        const months = Math.max(1, Math.round((endDate - startDate) / (1000 * 60 * 60 * 24 * 30)));
        totalRevenue += rev;
        totalProfit += profit;
        totalUnits += units;
        totalMonths += months;
      });
      
      const avgMonthlyRevenue = totalMonths > 0 ? totalRevenue / totalMonths : totalRevenue;
      const avgMonthlyProfit = totalMonths > 0 ? totalProfit / totalMonths : totalProfit;
      const avgMonthlyUnits = totalMonths > 0 ? totalUnits / totalMonths : totalUnits;
      
      const weeklyRevenue = avgMonthlyRevenue / 4;
      const weeklyProfit = avgMonthlyProfit / 4;
      const weeklyUnits = Math.round(avgMonthlyUnits / 4);
      
      const forecast = [];
      for (let i = 0; i < 4; i++) {
        const amazonForecast = upcomingForecasts[i]?.[1];
        const weekVariance = 1 + (i * 0.015); // Slight growth assumption
        
        if (amazonForecast && (amazonForecast.totalSales > 0 || amazonForecast.totals?.sales > 0)) {
          const amzSales = amazonForecast.totalSales || amazonForecast.totals?.sales || 0;
          const amzProceeds = amazonForecast.totalProceeds || amazonForecast.totals?.proceeds || 0;
          const amzUnits = amazonForecast.totalUnits || amazonForecast.totals?.units || 0;
          
          forecast.push({
            week: `Week +${i + 1}`,
            revenue: Math.round(amzSales * 0.7 + weeklyRevenue * 0.3),
            profit: Math.round(amzProceeds * 0.7 + weeklyProfit * 0.3),
            units: Math.round(amzUnits * 0.7 + weeklyUnits * 0.3),
            hasAmazonForecast: true,
          });
        } else {
          forecast.push({ 
            week: `Week +${i + 1}`, 
            revenue: Math.round(weeklyRevenue * weekVariance), 
            profit: Math.round(weeklyProfit * weekVariance), 
            units: Math.round(weeklyUnits * weekVariance),
          });
        }
      }
      
      return {
        weekly: forecast,
        monthly: { revenue: forecast.reduce((s, f) => s + f.revenue, 0), profit: forecast.reduce((s, f) => s + f.profit, 0), units: forecast.reduce((s, f) => s + f.units, 0) },
        trend: { revenue: 'flat', revenueChange: 0 },
        confidence: '45',
        basedOn: sortedPeriods.length,
        source: 'period',
        note: 'Based on period averages. Upload weekly data for accurate trend analysis.',
        amazonBlended: upcomingForecasts.length > 0,
      };
    }
    
    return null;
  }, [allWeeksData, allPeriodsData, amazonForecasts]);

  // ============ ENHANCED FORECAST WITH LEARNED CORRECTIONS ============
  // Apply learned correction factors to improve forecast accuracy
  const enhancedForecast = useMemo(() => {
    if (!generateForecast) return null;
    
    // Only apply corrections if confidence is at least 30%
    const shouldApplyCorrections = forecastCorrections.confidence >= 30 && forecastCorrections.samplesUsed >= 2;
    
    if (!shouldApplyCorrections) {
      return {
        ...generateForecast,
        corrected: false,
        correctionConfidence: forecastCorrections.confidence,
        correctionNote: forecastCorrections.samplesUsed < 2 
          ? 'Waiting for data overlap: Need weekly actual sales that match forecast periods'
          : 'Low confidence: Collecting more samples to improve accuracy',
      };
    }
    
    // Apply corrections to weekly forecasts
    const correctedWeekly = generateForecast.weekly?.map(week => {
      const weekDate = new Date(week.weekEnding);
      const month = weekDate.getMonth() + 1;
      const quarter = Math.ceil(month / 3);
      
      // Determine which correction to use (priority: month > quarter > overall)
      let revenueCorrection = forecastCorrections.overall.revenue;
      let unitsCorrection = forecastCorrections.overall.units;
      let profitCorrection = forecastCorrections.overall.profit;
      let correctionSource = 'overall';
      
      // Try month-specific correction
      if (forecastCorrections.byMonth[month]?.samples >= 2) {
        revenueCorrection = forecastCorrections.byMonth[month].revenue;
        unitsCorrection = forecastCorrections.byMonth[month].units;
        profitCorrection = forecastCorrections.byMonth[month].profit;
        correctionSource = `month-${month}`;
      }
      // Fall back to quarter-specific correction
      else if (forecastCorrections.byQuarter[quarter]?.samples >= 2) {
        revenueCorrection = forecastCorrections.byQuarter[quarter].revenue;
        unitsCorrection = forecastCorrections.byQuarter[quarter].units;
        profitCorrection = forecastCorrections.byQuarter[quarter].profit;
        correctionSource = `quarter-${quarter}`;
      }
      
      return {
        ...week,
        originalRevenue: week.revenue,
        originalUnits: week.units,
        originalProfit: week.profit,
        revenue: Math.round(week.revenue * revenueCorrection),
        units: Math.round(week.units * unitsCorrection),
        profit: Math.round(week.profit * profitCorrection),
        correctionApplied: {
          revenue: revenueCorrection,
          units: unitsCorrection,
          profit: profitCorrection,
          source: correctionSource,
        },
      };
    }) || [];
    
    // Recalculate monthly totals
    const correctedMonthly = {
      revenue: correctedWeekly.reduce((sum, w) => sum + w.revenue, 0),
      units: correctedWeekly.reduce((sum, w) => sum + w.units, 0),
      profit: correctedWeekly.reduce((sum, w) => sum + w.profit, 0),
    };
    
    // Calculate improvement from original
    const originalMonthly = generateForecast.monthly || { revenue: 0, units: 0, profit: 0 };
    const revenueChange = originalMonthly.revenue > 0 
      ? ((correctedMonthly.revenue - originalMonthly.revenue) / originalMonthly.revenue * 100).toFixed(1)
      : 0;
    
    return {
      ...generateForecast,
      weekly: correctedWeekly,
      monthly: correctedMonthly,
      originalMonthly,
      corrected: true,
      correctionConfidence: forecastCorrections.confidence,
      correctionSamplesUsed: forecastCorrections.samplesUsed,
      correctionNote: `Forecast adjusted by ${revenueChange}% based on ${forecastCorrections.samplesUsed} historical comparisons`,
      learningStatus: {
        confidence: forecastCorrections.confidence,
        samples: forecastCorrections.samplesUsed,
        skusTracked: Object.keys(forecastCorrections.bySku).length,
        lastUpdated: forecastCorrections.lastUpdated,
      },
    };
  }, [generateForecast, forecastCorrections]);
  // ============ END ENHANCED FORECAST ============

  // AMAZON FORECAST - Parse and store Amazon's forecast data
  const processAmazonForecast = (csvData) => {
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
      // Skip if forecast doesn't have the required structure
      if (!forecast || (!forecast.totals && !forecast.totalSales)) return;
      
      const match = findMatchingActual(weekKey);
      
      if (match && match.actual && match.actual.amazon) {
        const actual = match.actual;
        // Support both old (totalSales) and new (totals.sales) structures
        const forecastRev = forecast.totals?.sales || forecast.totalSales || 0;
        const actualRev = actual.amazon.revenue || 0;
        const forecastUnits = forecast.totals?.units || forecast.totalUnits || 0;
        const actualUnits = actual.amazon.units || 0;
        const forecastProfit = forecast.totals?.proceeds || forecast.totalProceeds || 0;
        const actualProfit = actual.amazon.netProfit || 0;
        
        // SKU-level comparison with correction factors for learning
        const skuComparisons = [];
        if (forecast.skus && actual.amazon.skuData) {
          const actualSkuMap = {};
          actual.amazon.skuData.forEach(s => { actualSkuMap[s.sku] = s; });
          
          Object.entries(forecast.skus).forEach(([sku, fcast]) => {
            if (!fcast) return; // Skip if fcast is undefined
            const actualSku = actualSkuMap[sku];
            const fcastUnits = fcast.units || 0;
            const fcastSales = fcast.sales || 0;
            if (actualSku) {
              skuComparisons.push({
                sku,
                forecast: { units: fcastUnits, sales: fcastSales },
                actual: { units: actualSku.unitsSold || 0, sales: actualSku.netSales || 0 },
                variance: {
                  units: (actualSku.unitsSold || 0) - fcastUnits,
                  unitsPercent: fcastUnits > 0 ? (((actualSku.unitsSold || 0) - fcastUnits) / fcastUnits * 100) : 0,
                  sales: (actualSku.netSales || 0) - fcastSales,
                  salesPercent: fcastSales > 0 ? (((actualSku.netSales || 0) - fcastSales) / fcastSales * 100) : 0,
                },
                // Correction factor for this SKU (for self-learning)
                correctionFactor: {
                  units: fcastUnits > 0 ? (actualSku.unitsSold || 0) / fcastUnits : 1,
                  sales: fcastSales > 0 ? (actualSku.netSales || 0) / fcastSales : 1,
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
          recordedAt: new Date().toISOString(),
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
          // Correction factors learned from this comparison (for self-learning)
          correctionFactors: {
            revenue: forecastRev > 0 ? actualRev / forecastRev : 1,
            units: forecastUnits > 0 ? actualUnits / forecastUnits : 1,
            profit: forecastProfit > 0 ? actualProfit / forecastProfit : 1,
          },
          // Temporal features for pattern learning
          temporalFeatures: {
            month: new Date(weekKey).getMonth() + 1,
            quarter: Math.ceil((new Date(weekKey).getMonth() + 1) / 3),
            weekOfYear: Math.ceil((new Date(weekKey) - new Date(new Date(weekKey).getFullYear(), 0, 1)) / (7 * 24 * 60 * 60 * 1000)),
          },
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

  // ============ AUTO-LEARNING EFFECT ============
  // Automatically detect new forecast comparisons and update learning
  useEffect(() => {
    if (getAmazonForecastComparison.length === 0) return;
    
    // Check if we have new comparisons that aren't in our history
    const existingWeeks = new Set(forecastAccuracyHistory.records.map(r => r.weekEnding));
    const newComparisons = getAmazonForecastComparison.filter(c => !existingWeeks.has(c.weekEnding));
    
    if (newComparisons.length > 0) {
      // Filter out comparisons where actuals are zero (data not yet uploaded)
      const validComparisons = newComparisons.filter(c => 
        (c.actual?.revenue > 0 || c.actual?.units > 0)
      );
      
      if (validComparisons.length === 0) return; // Don't poison the model with zero-actual records
      
      // Add new records to history
      const updatedRecords = [
        ...forecastAccuracyHistory.records.filter(r => 
          // Also clean any existing bad records (actuals = 0)
          r.actual?.revenue > 0 || r.actual?.units > 0
        ),
        ...validComparisons.map(c => ({
          weekEnding: c.weekEnding,
          recordedAt: new Date().toISOString(),
          forecast: c.forecast,
          actual: c.actual,
          variance: c.variance,
          accuracy: c.accuracy,
          correctionFactors: c.correctionFactors,
          temporalFeatures: c.temporalFeatures,
          skuComparisons: c.skuComparisons,
        }))
      ];
      
      setForecastAccuracyHistory({
        records: updatedRecords,
        lastUpdated: new Date().toISOString(),
        modelVersion: forecastAccuracyHistory.modelVersion
      });
      
      // Now compute new correction factors using EWMA (Exponential Weighted Moving Average)
      const alpha = 0.3; // Weight for recent data (higher = more responsive to recent trends)
      const records = updatedRecords.sort((a, b) => a.weekEnding.localeCompare(b.weekEnding));
      
      if (records.length >= 2) {
        // Overall correction factors
        let weightedRevenue = 0, weightedUnits = 0, weightedProfit = 0, totalWeight = 0;
        
        records.forEach((record, idx) => {
          const weight = Math.pow(1 - alpha, records.length - 1 - idx);
          weightedRevenue += weight * (record.correctionFactors?.revenue || 1);
          weightedUnits += weight * (record.correctionFactors?.units || 1);
          weightedProfit += weight * (record.correctionFactors?.profit || 1);
          totalWeight += weight;
        });
        
        const overallCorrections = {
          revenue: totalWeight > 0 ? weightedRevenue / totalWeight : 1,
          units: totalWeight > 0 ? weightedUnits / totalWeight : 1,
          profit: totalWeight > 0 ? weightedProfit / totalWeight : 1,
        };
        
        // SKU-level correction factors
        const skuCorrections = {};
        records.forEach(record => {
          if (record.skuComparisons) {
            record.skuComparisons.forEach(sc => {
              if (!skuCorrections[sc.sku]) {
                skuCorrections[sc.sku] = { samples: [], units: [], sales: [] };
              }
              if (sc.correctionFactor) {
                skuCorrections[sc.sku].units.push(sc.correctionFactor.units);
                skuCorrections[sc.sku].sales.push(sc.correctionFactor.sales);
                skuCorrections[sc.sku].samples.push(record.weekEnding);
              }
            });
          }
        });
        
        const bySku = {};
        Object.entries(skuCorrections).forEach(([sku, data]) => {
          if (data.units.length >= 2) {
            bySku[sku] = {
              units: data.units.reduce((a, b) => a + b, 0) / data.units.length,
              sales: data.sales.reduce((a, b) => a + b, 0) / data.sales.length,
              samples: data.samples.length,
            };
          }
        });
        
        // Monthly correction factors
        const byMonth = {};
        records.forEach(record => {
          const month = record.temporalFeatures?.month || new Date(record.weekEnding).getMonth() + 1;
          if (!byMonth[month]) {
            byMonth[month] = { revenue: [], units: [], profit: [] };
          }
          if (record.correctionFactors) {
            byMonth[month].revenue.push(record.correctionFactors.revenue);
            byMonth[month].units.push(record.correctionFactors.units);
            byMonth[month].profit.push(record.correctionFactors.profit);
          }
        });
        
        Object.keys(byMonth).forEach(month => {
          const data = byMonth[month];
          byMonth[month] = {
            revenue: data.revenue.length > 0 ? data.revenue.reduce((a, b) => a + b, 0) / data.revenue.length : 1,
            units: data.units.length > 0 ? data.units.reduce((a, b) => a + b, 0) / data.units.length : 1,
            profit: data.profit.length > 0 ? data.profit.reduce((a, b) => a + b, 0) / data.profit.length : 1,
            samples: data.revenue.length,
          };
        });
        
        // Quarterly correction factors
        const byQuarter = {};
        records.forEach(record => {
          const quarter = record.temporalFeatures?.quarter || Math.ceil((new Date(record.weekEnding).getMonth() + 1) / 3);
          if (!byQuarter[quarter]) {
            byQuarter[quarter] = { revenue: [], units: [], profit: [] };
          }
          if (record.correctionFactors) {
            byQuarter[quarter].revenue.push(record.correctionFactors.revenue);
            byQuarter[quarter].units.push(record.correctionFactors.units);
            byQuarter[quarter].profit.push(record.correctionFactors.profit);
          }
        });
        
        Object.keys(byQuarter).forEach(quarter => {
          const data = byQuarter[quarter];
          byQuarter[quarter] = {
            revenue: data.revenue.length > 0 ? data.revenue.reduce((a, b) => a + b, 0) / data.revenue.length : 1,
            units: data.units.length > 0 ? data.units.reduce((a, b) => a + b, 0) / data.units.length : 1,
            profit: data.profit.length > 0 ? data.profit.reduce((a, b) => a + b, 0) / data.profit.length : 1,
            samples: data.revenue.length,
          };
        });
        
        // Calculate confidence score (0-100)
        const stdDev = Math.sqrt(
          records.reduce((sum, r) => {
            const diff = (r.correctionFactors?.revenue || 1) - overallCorrections.revenue;
            return sum + diff * diff;
          }, 0) / records.length
        );
        const confidence = Math.min(95, Math.max(10, 100 - (stdDev * 30) - (10 / Math.sqrt(records.length))));
        
        setForecastCorrections({
          overall: overallCorrections,
          bySku,
          byMonth,
          byQuarter,
          confidence,
          samplesUsed: records.length,
          lastUpdated: new Date().toISOString(),
        });
      }
    }
  }, [getAmazonForecastComparison, forecastAccuracyHistory.records]);
  // ============ END AUTO-LEARNING EFFECT ============

  // ============ AUTO-SYNC EFFECT ============
  // Automatically sync Amazon, Shopify, and Packiyo data when stale
  const [autoSyncStatus, setAutoSyncStatus] = useState({ running: false, lastCheck: null, results: [] });
  
  // Check if a service is stale (needs sync)
  const isServiceStale = useCallback((lastSync, thresholdHours = 4) => {
    if (!lastSync) return true;
    const lastSyncTime = new Date(lastSync).getTime();
    const now = Date.now();
    const hoursSinceSync = (now - lastSyncTime) / (1000 * 60 * 60);
    return hoursSinceSync >= thresholdHours;
  }, []);
  
  // Auto-sync function
  const runAutoSync = useCallback(async (force = false) => {
    if (!appSettings.autoSync?.enabled && !force) return;
    if (autoSyncStatus.running) return;
    
    const threshold = appSettings.autoSync?.staleThresholdHours || 4;
    const results = [];
    
    setAutoSyncStatus(prev => ({ ...prev, running: true, lastCheck: new Date().toISOString() }));
    
    try {
      // Check Amazon Sales - use /api/amazon/sync with Reports API for bulk SKU-level daily data
      if (appSettings.autoSync?.amazon !== false && (amazonCredentials.connected || amazonCredentials.refreshToken)) {
        const amazonStale = isServiceStale(amazonCredentials.lastSync, threshold);
        
        if (amazonStale || force) {
          try {
            const amazonSyncBody = {
              syncType: 'sales',
              daysBack: 30,
              refreshToken: amazonCredentials.refreshToken,
              clientId: amazonCredentials.clientId,
              clientSecret: amazonCredentials.clientSecret,
              sellerId: amazonCredentials.sellerId,
              marketplaceId: amazonCredentials.marketplaceId || 'ATVPDKIKX0DER',
            };
            
            let data = null;
            let retries = 0;
            const maxRetries = 5; // First call polls ~90s server-side; retries are quick status checks
            
            // Reports API may need polling: request → pending → retry with reportId
            while (retries < maxRetries) {
              const res = await fetch('/api/amazon/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(amazonSyncBody),
              });
              data = await res.json();
              
              if (data.status === 'pending' && data.reportId) {
                // Report still generating — wait and retry with reportId
                console.log(`[AutoSync] Amazon report pending (${data.reportId}), retry ${retries + 1}/${maxRetries}...`);
                amazonSyncBody.reportId = data.reportId;
                retries++;
                await new Promise(r => setTimeout(r, 10000)); // Wait 10s before retry
                continue;
              }
              break; // Got final result (complete or error)
            }
            
            if (!data.error && data.dailySales) {
              // Merge API sales into allDaysData — NEVER overwrite days with SKU Economics data
              const cogsLookup = getCogsLookup();
              let daysAdded = 0, daysSkipped = 0;
              
              setAllDaysData(prev => {
                const updated = { ...prev };
                Object.entries(data.dailySales).forEach(([date, apiDay]) => {
                  const existing = updated[date];
                  
                  // RULE 1: Never overwrite a day that has SKU Economics data
                  // SKU Economics is tagged with source='sku-economics' or has detailed fee data
                  const hasSkuEconomics = existing?.amazon?.skuData?.length > 0 && 
                    (existing?.amazon?.source === 'sku-economics' || 
                     (existing?.amazon?.source !== 'amazon-orders-api' && existing?.amazon?.fees > 0));
                  
                  if (hasSkuEconomics) {
                    daysSkipped++;
                    return; // Skip - SKU Economics is more accurate
                  }
                  
                  // Fill COGS from our lookup for each SKU
                  const enrichedSkuData = (apiDay.amazon?.skuData || []).map(sku => ({
                    ...sku,
                    cogs: (cogsLookup[sku.sku] || cogsLookup[sku.sku?.replace(/Shop$/i, '')] || 
                           cogsLookup[sku.sku?.toUpperCase()] || cogsLookup[sku.sku?.toLowerCase()] || 0) * (sku.unitsSold || 0),
                  }));
                  
                  const totalCogs = enrichedSkuData.reduce((s, sk) => s + (sk.cogs || 0), 0);
                  const revenue = apiDay.amazon?.revenue || 0;
                  
                  // Orders API doesn't include fees — estimate using typical Amazon fee structure
                  // (referral ~15% + FBA ~15% = ~30% of revenue as fees)
                  const estimatedFees = revenue * 0.30;
                  const estimatedAds = apiDay.amazon?.adSpend || 0;
                  const amzNetProfit = revenue - totalCogs - estimatedFees - estimatedAds;
                  
                  const amazonData = {
                    ...apiDay.amazon,
                    cogs: totalCogs,
                    netProfit: amzNetProfit,
                    skuData: enrichedSkuData,
                    source: 'amazon-orders-api', // Tag so SKU Economics can override later
                  };
                  
                  // Preserve existing Shopify data and build proper total
                  const existingShopify = existing?.shopify || null;
                  const shopRev = existingShopify?.revenue || 0;
                  const shopProfit = existingShopify?.netProfit || 0;
                  const totalRev = revenue + shopRev;
                  const totalProfit = amzNetProfit + shopProfit;
                  const totalAdSpend = estimatedAds + (existingShopify?.adSpend || 0);
                  
                  updated[date] = {
                    ...(existing || {}),
                    date,
                    amazon: amazonData,
                    shopify: existingShopify,
                    total: {
                      revenue: totalRev,
                      units: (apiDay.amazon?.units || 0) + (existingShopify?.units || 0),
                      cogs: totalCogs + (existingShopify?.cogs || 0),
                      adSpend: totalAdSpend,
                      netProfit: totalProfit,
                      netMargin: totalRev > 0 ? (totalProfit / totalRev) * 100 : 0,
                      roas: totalAdSpend > 0 ? totalRev / totalAdSpend : 0,
                      amazonShare: totalRev > 0 ? (revenue / totalRev) * 100 : 0,
                      shopifyShare: totalRev > 0 ? (shopRev / totalRev) * 100 : 0,
                    },
                  };
                  daysAdded++;
                });
                
                console.log(`[AutoSync] Amazon Sales: ${daysAdded} days added, ${daysSkipped} days skipped (have SKU Economics)`);
                try { lsSet('ecommerce_daily_sales_v1', JSON.stringify(updated)); } catch (e) { devWarn('[AutoSync] Failed to persist daily data to localStorage'); }
                return updated;
              });
              
              queueCloudSave({ ...combinedData });
              
              setAmazonCredentials(p => ({ ...p, lastSync: new Date().toISOString() }));
              results.push({ service: 'Amazon Sales', success: true, days: Object.keys(data.dailySales).length, orders: data.summary?.totalOrders || 0 });
            } else if (data.status === 'pending') {
              results.push({ service: 'Amazon Sales', success: false, error: 'Report still generating - will complete on next sync' });
            } else {
              results.push({ service: 'Amazon Sales', success: false, error: data.error || `Sync failed` });
              devWarn('Amazon sales auto-sync failed:', data.error);
            }
          } catch (err) {
            results.push({ service: 'Amazon Sales', success: false, error: err.message });
            devWarn('Amazon sales auto-sync error:', err.message);
          }
        }
      }
      
      // Check Amazon Ads API — pull daily SP/SB/SD campaign performance
      // IMPORTANT: Run non-blocking (fire-and-forget) because the polling/retry loop
      // can take 2-4 minutes, which would block Shopify/Packiyo/QBO from syncing
      if (appSettings.autoSync?.amazonAds !== false && amazonCredentials.adsConnected && amazonCredentials.adsRefreshToken) {
        const adsStale = isServiceStale(amazonCredentials.adsLastSync, threshold);
        
        if (adsStale || force) {
          // Fire and forget — don't await
          (async () => {
            try {
              console.log('[AutoSync] Amazon Ads: starting background sync (non-blocking)...');
              const adsSyncBody = {
                syncType: 'daily',
                daysBack: 60,
                adsClientId: amazonCredentials.adsClientId,
                adsClientSecret: amazonCredentials.adsClientSecret,
                adsRefreshToken: amazonCredentials.adsRefreshToken,
                adsProfileId: amazonCredentials.adsProfileId,
              };
              
              let adsData = null;
              let adsRetries = 0;
              const maxAdsRetries = 3;
              
              while (adsRetries < maxAdsRetries) {
                const adsRes = await fetch('/api/amazon/ads-sync', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(adsSyncBody),
                });
                adsData = await adsRes.json();
                
                if (adsData.status === 'pending' && adsData.pendingReports) {
                  console.log(`[AutoSync] Amazon Ads reports pending, retry ${adsRetries + 1}/${maxAdsRetries}...`);
                  adsSyncBody.pendingReports = adsData.pendingReports;
                  adsRetries++;
                  await new Promise(r => setTimeout(r, 10000));
                  continue;
                }
                break;
              }
              
              if (adsData?.success && adsData?.dailyData) {
                let adsDaysUpdated = 0;
                
                setAllDaysData(prev => {
                  const updated = { ...prev };
                  Object.entries(adsData.dailyData).forEach(([date, adDay]) => {
                    if (!updated[date]) updated[date] = {};
                    if (!updated[date].amazon) updated[date].amazon = { sales: 0, units: 0, refunds: 0 };
                    
                    // Write ad metrics from API (REPLACE — re-sync is authoritative)
                    updated[date].amazon.adSpend = adDay.spend || 0;
                    updated[date].amazon.adRevenue = adDay.revenue || 0;
                    updated[date].amazon.adOrders = adDay.orders || 0;
                    updated[date].amazon.adImpressions = adDay.impressions || 0;
                    updated[date].amazon.adClicks = adDay.clicks || 0;
                    updated[date].amazon.acos = adDay.acos || 0;
                    updated[date].amazon.adRoas = adDay.roas || 0;
                    
                    // Write per-SKU ad spend for this date
                    const skuDay = adsData.skuDailyData?.[date];
                    if (skuDay && updated[date].amazon.skuData) {
                      updated[date].amazon.skuData = updated[date].amazon.skuData.map(sk => {
                        const match = skuDay[sk.sku] || skuDay[sk.asin] || skuDay[(sk.sku || '').toUpperCase()];
                        if (match) {
                          return { ...sk, adSpend: match.spend || 0, adRevenue: match.sales || 0, adOrders: match.orders || 0 };
                        }
                        return sk;
                      });
                    }
                    
                    // Recalculate netProfit if we have revenue data
                    const rev = updated[date].amazon.revenue || updated[date].amazon.sales || 0;
                    if (rev > 0) {
                      const cogs = updated[date].amazon.cogs || 0;
                      const fees = updated[date].amazon.fees || (rev * 0.30);
                      updated[date].amazon.netProfit = rev - cogs - fees - (adDay.spend || 0);
                    }
                    
                    adsDaysUpdated++;
                  });
                  
                  console.log(`[AutoSync] Amazon Ads: ${adsDaysUpdated} days updated, $${adsData.summary?.totalSpend?.toFixed(2)} total spend, ${adsData.summary?.skuCount || 0} SKUs`);
                  try { lsSet('ecommerce_daily_sales_v1', JSON.stringify(updated)); } catch (e) { devWarn('[AutoSync] Failed to persist ads data to localStorage'); }
                  return updated;
                });
                
                // Store transformed reports in adsIntelData for AI analysis
                if (adsData.reports) {
                  setAdsIntelData(prev => {
                    const updated = { ...(prev || {}), lastUpdated: new Date().toISOString(), source: 'amazon-ads-api' };
                    // Keep raw API data for AI context
                    if (adsData.reports.dailyOverview) updated._apiDailyOverview = adsData.reports.dailyOverview;
                    if (adsData.reports.spCampaigns) updated._apiSpCampaigns = adsData.reports.spCampaigns;
                    if (adsData.reports.spSearchTerms) updated._apiSpSearchTerms = adsData.reports.spSearchTerms;
                    if (adsData.reports.spAdvertised) updated._apiSpAdvertised = adsData.reports.spAdvertised;
                    if (adsData.reports.spPlacement) updated._apiSpPlacement = adsData.reports.spPlacement;
                    if (adsData.reports.spTargeting) updated._apiSpTargeting = adsData.reports.spTargeting;
                    if (adsData.reports.sbSearchTerms) updated._apiSbSearchTerms = adsData.reports.sbSearchTerms;
                    if (adsData.reports.sdCampaign) updated._apiSdCampaign = adsData.reports.sdCampaign;
                    if (adsData.skuSummary) updated.skuAdPerformance = adsData.skuSummary;
                    if (adsData.campaigns) updated.campaignSummary = adsData.campaigns;
                    updated.apiSyncSummary = adsData.summary;
                    
                    // ALSO store in nested format the UI Deep Analysis tab reads
                    // UI expects: adsIntelData.amazon.<report_type> = { records, headers, meta }
                    const toIntelFormat = (rows, label) => {
                      if (!rows || !rows.length) return null;
                      return {
                        records: rows,
                        headers: Object.keys(rows[0] || {}),
                        meta: { label, uploadedAt: new Date().toISOString(), source: 'amazon-ads-api', rowCount: rows.length }
                      };
                    };
                    
                    if (!updated.amazon) updated.amazon = {};
                    const rpts = adsData.reports;
                    if (rpts.spSearchTerms?.length) updated.amazon.sp_search_terms = toIntelFormat(rpts.spSearchTerms, 'SP Search Terms (API)');
                    if (rpts.spAdvertised?.length) updated.amazon.sp_advertised_product = toIntelFormat(rpts.spAdvertised, 'SP Advertised Product (API)');
                    if (rpts.spPlacement?.length) updated.amazon.sp_placement = toIntelFormat(rpts.spPlacement, 'SP Placement (API)');
                    if (rpts.spTargeting?.length) updated.amazon.sp_targeting = toIntelFormat(rpts.spTargeting, 'SP Targeting (API)');
                    if (rpts.sbSearchTerms?.length) updated.amazon.sb_search_terms = toIntelFormat(rpts.sbSearchTerms, 'SB Search Terms (API)');
                    if (rpts.sdCampaign?.length) updated.amazon.sd_campaigns = toIntelFormat(rpts.sdCampaign, 'SD Campaigns (API)');
                    // SP Campaigns: prefer per-campaign rows, fall back to daily overview
                    if (rpts.spCampaigns?.length) updated.amazon.sp_campaigns = toIntelFormat(rpts.spCampaigns, 'SP Campaigns (API)');
                    else if (rpts.dailyOverview?.length) updated.amazon.sp_campaigns = toIntelFormat(rpts.dailyOverview, 'SP Campaigns Daily (API)');
                    
                    return updated;
                  });
                }
                
                queueCloudSave({ ...combinedData });
                setAmazonCredentials(p => ({ ...p, adsLastSync: new Date().toISOString() }));
                console.log(`[AutoSync] Amazon Ads COMPLETE: ${adsData.summary?.daysWithData} days, $${adsData.summary?.totalSpend?.toFixed(0)} spend, ${adsData.summary?.campaignCount} campaigns, ${adsData.summary?.skuCount} SKUs`);
              } else if (adsData?.status === 'pending') {
                console.log('[AutoSync] Amazon Ads: reports still generating — will complete on next sync');
              } else {
                devWarn('Amazon Ads auto-sync failed:', adsData?.error);
              }
            } catch (err) {
              devWarn('Amazon Ads auto-sync error:', err.message);
            }
          })(); // Fire and forget — don't await this IIFE
        }
      }
      
      // Check Shopify Sales - use /api/shopify/sync endpoint
      // SEC-003 race fix: cloud load may set connected=true before localStorage restores the secret
      let shopifyToken = shopifyCredentials.clientSecret || shopifyCredentials.accessToken;
      let shopifyUrl = shopifyCredentials.storeUrl;
      if (shopifyCredentials.connected && !shopifyToken) {
        try {
          const ls = JSON.parse(lsGet('ecommerce_shopify_creds_v1') || '{}');
          if (ls.clientSecret || ls.accessToken) {
            shopifyToken = ls.clientSecret || ls.accessToken;
            shopifyUrl = ls.storeUrl || shopifyUrl;
            setShopifyCredentials(p => ({ ...p, clientSecret: ls.clientSecret || p.clientSecret, accessToken: ls.accessToken || p.accessToken, storeUrl: ls.storeUrl || p.storeUrl }));
          }
        } catch (e) {}
      }
      if (appSettings.autoSync?.shopify !== false && shopifyCredentials.connected && shopifyUrl && shopifyToken) {
        const shopifyStale = isServiceStale(shopifyCredentials.lastSync, threshold);
        
        if (shopifyStale || force) {
          try {
            // Validate we have real credentials before calling API
            if (!shopifyToken || shopifyToken.length < 5) {
              devWarn('[AutoSync] Shopify: credentials exist but token is too short, skipping');
            } else {
            // Sync last 30 days of orders (matches Amazon daysBack for velocity calc)
            const endDate = new Date().toISOString().split('T')[0];
            const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            
            const res = await fetch('/api/shopify/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                storeUrl: shopifyUrl,
                accessToken: shopifyToken,
                clientId: shopifyCredentials.clientId,
                clientSecret: shopifyToken,
                startDate,
                endDate,
                preview: false,
              }),
            });
            const data = await res.json();
            if (!data.error && res.ok) {
              setShopifyCredentials(p => ({ ...p, lastSync: new Date().toISOString() }));
              
              // Get COGS lookup once for all Shopify merges (daily + weekly)
              const shopCogsLookup = getCogsLookup();
              
              // Helper: enrich Shopify data with COGS from uploaded COGS file
              const enrichShopify = (shopifyData) => {
                if (!shopifyData) return shopifyData;
                let calculatedCogs = 0;
                const enrichedSkuData = (shopifyData.skuData || []).map(sku => {
                  const unitCost = shopCogsLookup[sku.sku] || shopCogsLookup[sku.sku?.replace(/Shop$/i, '')] || 
                                   shopCogsLookup[sku.sku?.toUpperCase()] || shopCogsLookup[sku.sku?.toLowerCase()] || 0;
                  const skuCogs = unitCost * (sku.unitsSold || sku.units || 0);
                  calculatedCogs += skuCogs;
                  return { ...sku, cogs: skuCogs };
                });
                const revenue = shopifyData.revenue || 0;
                const adSpend = (shopifyData.adSpend || 0) + (shopifyData.metaSpend || 0) + (shopifyData.googleSpend || 0);
                const netProfit = revenue - calculatedCogs - (shopifyData.threeplCosts || 0) - adSpend;
                return {
                  ...shopifyData,
                  skuData: enrichedSkuData,
                  cogs: calculatedCogs,
                  netProfit,
                  netMargin: revenue > 0 ? (netProfit / revenue) * 100 : 0,
                };
              };
              
              // Merge Shopify daily data into allDaysData
              if (data.dailyData && Object.keys(data.dailyData).length > 0) {
                let shopDaysAdded = 0, shopDaysUpdated = 0;
                
                setAllDaysData(prev => {
                  const updated = { ...prev };
                  Object.entries(data.dailyData).forEach(([date, apiDay]) => {
                    const existing = updated[date];
                    const enrichedShopify = enrichShopify(apiDay.shopify);
                    
                    // Preserve existing ad data (from Meta/Google bulk uploads)
                    const existingMeta = existing?.metaSpend || existing?.shopify?.metaSpend || 0;
                    const existingGoogle = existing?.googleSpend || existing?.shopify?.googleSpend || 0;
                    const existingDtcAds = existingMeta + existingGoogle;
                    
                    // Merge ad data into enriched shopify
                    if (existingDtcAds > 0 && enrichedShopify) {
                      enrichedShopify.metaSpend = existingMeta;
                      enrichedShopify.metaAds = existingMeta;
                      enrichedShopify.googleSpend = existingGoogle;
                      enrichedShopify.googleAds = existingGoogle;
                      enrichedShopify.adSpend = existingDtcAds;
                      // Recalculate profit with ad spend
                      enrichedShopify.netProfit = (enrichedShopify.revenue || 0) - (enrichedShopify.cogs || 0) - (enrichedShopify.threeplCosts || 0) - existingDtcAds;
                      enrichedShopify.netMargin = enrichedShopify.revenue > 0 ? (enrichedShopify.netProfit / enrichedShopify.revenue) * 100 : 0;
                    }
                    
                    const shopRev = enrichedShopify?.revenue || 0;
                    const shopProfit = enrichedShopify?.netProfit || 0;
                    const shopCogs = enrichedShopify?.cogs || 0;
                    const shopAds = enrichedShopify?.adSpend || 0;
                    
                    // Merge: preserve existing Amazon data, update Shopify
                    if (existing) {
                      const amzRev = existing.amazon?.revenue || 0;
                      const amzProfit = existing.amazon?.netProfit || 0;
                      const amzAds = existing.amazon?.adSpend || 0;
                      const amzCogs = existing.amazon?.cogs || 0;
                      const totalRev = amzRev + shopRev;
                      const totalProfit = amzProfit + shopProfit;
                      const totalAds = amzAds + shopAds;
                      
                      updated[date] = {
                        ...existing,
                        date,
                        shopify: enrichedShopify,
                        total: {
                          revenue: totalRev,
                          units: (existing.amazon?.units || 0) + (enrichedShopify?.units || 0),
                          cogs: amzCogs + shopCogs,
                          adSpend: totalAds,
                          netProfit: totalProfit,
                          netMargin: totalRev > 0 ? (totalProfit / totalRev) * 100 : 0,
                          roas: totalAds > 0 ? totalRev / totalAds : 0,
                          amazonShare: totalRev > 0 ? (amzRev / totalRev) * 100 : 0,
                          shopifyShare: totalRev > 0 ? (shopRev / totalRev) * 100 : 0,
                        },
                      };
                      shopDaysUpdated++;
                    } else {
                      updated[date] = {
                        date,
                        shopify: enrichedShopify,
                        amazon: null,
                        total: {
                          revenue: shopRev,
                          units: enrichedShopify?.units || 0,
                          cogs: shopCogs,
                          adSpend: shopAds,
                          netProfit: shopProfit,
                          netMargin: shopRev > 0 ? (shopProfit / shopRev) * 100 : 0,
                          roas: shopAds > 0 ? shopRev / shopAds : 0,
                          amazonShare: 0,
                          shopifyShare: 100,
                        },
                      };
                      shopDaysAdded++;
                    }
                  });
                  
                  console.log(`[AutoSync] Shopify Sales: ${shopDaysAdded} days added, ${shopDaysUpdated} days updated`);
                  try { lsSet('ecommerce_daily_sales_v1', JSON.stringify(updated)); } catch (e) { devWarn('[AutoSync] Failed to persist Shopify daily data'); }
                  return updated;
                });
              }
              
              // Merge Shopify weekly data into allWeeksData
              if (data.weeklyData && Object.keys(data.weeklyData).length > 0) {
                let shopWeeksUpdated = 0;
                
                setAllWeeksData(prev => {
                  const updated = { ...prev };
                  Object.entries(data.weeklyData).forEach(([weekKey, apiWeek]) => {
                    const existing = updated[weekKey];
                    const enrichedShopifyWeek = enrichShopify(apiWeek.shopify);
                    const shopRev = enrichedShopifyWeek?.revenue || 0;
                    const shopProfit = enrichedShopifyWeek?.netProfit || 0;
                    const shopCogs = enrichedShopifyWeek?.cogs || 0;
                    const shopAds = enrichedShopifyWeek?.adSpend || 0;
                    
                    if (existing) {
                      const amzRev = existing.amazon?.revenue || 0;
                      const amzProfit = existing.amazon?.netProfit || 0;
                      const amzCogs = existing.amazon?.cogs || 0;
                      const amzAds = existing.amazon?.adSpend || 0;
                      const totalRev = amzRev + shopRev;
                      const totalProfit = amzProfit + shopProfit;
                      const totalAds = amzAds + shopAds;
                      
                      updated[weekKey] = {
                        ...existing,
                        shopify: enrichedShopifyWeek,
                        total: {
                          ...existing.total,
                          revenue: totalRev,
                          units: (existing.amazon?.units || 0) + (enrichedShopifyWeek?.units || 0),
                          cogs: amzCogs + shopCogs,
                          adSpend: totalAds,
                          netProfit: totalProfit,
                          netMargin: totalRev > 0 ? (totalProfit / totalRev) * 100 : 0,
                          roas: totalAds > 0 ? totalRev / totalAds : 0,
                          amazonShare: totalRev > 0 ? (amzRev / totalRev) * 100 : 0,
                          shopifyShare: totalRev > 0 ? (shopRev / totalRev) * 100 : 0,
                        },
                      };
                    } else {
                      updated[weekKey] = {
                        shopify: enrichedShopifyWeek,
                        total: {
                          revenue: shopRev,
                          units: enrichedShopifyWeek?.units || 0,
                          cogs: shopCogs,
                          adSpend: shopAds,
                          netProfit: shopProfit,
                          netMargin: shopRev > 0 ? (shopProfit / shopRev) * 100 : 0,
                          amazonShare: 0,
                          shopifyShare: 100,
                        },
                      };
                    }
                    shopWeeksUpdated++;
                  });
                  
                  console.log(`[AutoSync] Shopify Weekly: ${shopWeeksUpdated} weeks merged`);
                  try { writeToLocal(STORAGE_KEY, JSON.stringify(updated)); } catch (e) { devWarn('[AutoSync] Failed to persist Shopify weekly data'); }
                  return updated;
                });
              }
              
              queueCloudSave({ ...combinedData });
              results.push({ service: 'Shopify', success: true, orders: data.orderCount || 0, days: Object.keys(data.dailyData || {}).length });
            } else {
              results.push({ service: 'Shopify', success: false, error: data.error || `HTTP ${res.status}` });
              devWarn('Shopify auto-sync failed:', data.error || res.status);
            }
            } // end else (has valid token)
          } catch (err) {
            results.push({ service: 'Shopify', success: false, error: err.message });
            devWarn('Shopify auto-sync error:', err.message);
          }
        }
      }
      
      // Fetch fresh Amazon FBA+AWD inventory for snapshot updates
      let freshAmazonFbaData = null;
      let fbaDataMergedIntoSnapshot = false;
      
      // Velocity lookups - built from daily+weekly data, used by both Packiyo and standalone FBA merge
      const autoAmazonVelLookup = {};
      const autoShopifyVelLookup = {};
      const autoVelocityTrends = {};
      
      const storeAutoVelocity = (lookup, sku, velocity) => {
        const baseSku = sku.replace(/shop$/i, '').toUpperCase();
        const keys = new Set([sku, sku.toLowerCase(), sku.toUpperCase(), baseSku, baseSku.toLowerCase(),
                   baseSku + 'Shop', baseSku.toLowerCase() + 'shop', baseSku + 'SHOP']);
        keys.forEach(key => {
          if (!lookup[key]) lookup[key] = 0;
          lookup[key] = Math.max(lookup[key], velocity);
        });
      };
      if (amazonCredentials.refreshToken) {
        try {
          console.log('[AutoSync] Fetching /api/amazon/sync with syncType: all (FBA + AWD)...');
          const fbaRes = await fetch('/api/amazon/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              syncType: 'all',
              refreshToken: amazonCredentials.refreshToken,
              clientId: amazonCredentials.clientId,
              clientSecret: amazonCredentials.clientSecret,
              sellerId: amazonCredentials.sellerId,
              marketplaceId: amazonCredentials.marketplaceId || 'ATVPDKIKX0DER',
            }),
          });
          const fbaData = await fbaRes.json();
          console.log('[AutoSync] Amazon FBA+AWD response:', { syncType: fbaData.syncType, itemCount: fbaData.items?.length, awdError: fbaData.awdError, summary: fbaData.summary });
          
          if (fbaData.awdError) {
            console.warn('[AutoSync] AWD API failed:', fbaData.awdError, fbaData.awdErrorDetails || '');
          }
          
          if (fbaData.success && fbaData.items) {
            freshAmazonFbaData = {};
            fbaData.items.forEach(item => {
              if (!item.sku) return;
              const skuUpper = item.sku.toUpperCase();
              const baseSku = skuUpper.replace(/SHOP$/, '');
              const fulfillable = item.fbaFulfillable || item.fulfillable || item.available || 0;
              const reserved = item.fbaReserved || item.reserved || 0;
              const inbound = item.fbaInbound || item.totalInbound || 0;
              const total = fulfillable + reserved;
              const awdQty = item.awdQuantity || 0;
              const awdInbound = item.awdInbound || 0;
              const entry = { fulfillable, reserved, inbound, total, awdQty, awdInbound, asin: item.asin || '' };
              [item.sku, item.sku.toLowerCase(), skuUpper, baseSku, baseSku.toLowerCase(), baseSku + 'SHOP', baseSku.toLowerCase() + 'shop'].forEach(k => {
                if (!freshAmazonFbaData[k]) freshAmazonFbaData[k] = entry;
              });
            });
            console.log('[AutoSync] Fresh FBA+AWD data built:', { skuCount: fbaData.items.length, hasAwdData: fbaData.items.some(i => (i.awdQuantity || 0) > 0) });
            
            // Persist FBA+AWD data independently so it survives page reload
            try {
              const fbaSnapshot = {
                items: fbaData.items,
                fetchedAt: new Date().toISOString(),
                hasAwdData: fbaData.items.some(i => (i.awdQuantity || 0) > 0),
              };
              localStorage.setItem('ecommerce_fba_awd_snapshot', JSON.stringify(fbaSnapshot));
              console.log('[AutoSync] FBA+AWD snapshot persisted to localStorage');
            } catch (e) { devWarn('[AutoSync] Failed to persist FBA+AWD snapshot:', e.message); }
          }
        } catch (err) {
          console.warn('[AutoSync] FBA+AWD fetch failed:', err.message);
        }
      }
      
      // ========== BUILD VELOCITY LOOKUPS (independent of Packiyo) ==========
      // These are used by both the Packiyo inventory merge AND the standalone FBA merge
      try {
        if (Object.keys(allDaysData).length > 0) {
          const allDates = Object.keys(allDaysData).sort().reverse();
          const last28Days = allDates.slice(0, 28);
          const skuDailyUnits = {};
          
          let amzDaysRecent = 0, amzDaysPrior = 0;
          let shopDaysRecent = 0, shopDaysPrior = 0;
          
          last28Days.forEach((date, dayIndex) => {
            const day = allDaysData[date];
            const isRecent = dayIndex < 14;
            
            const shopifySkuData = day?.shopify?.skuData;
            const shopifyList = Array.isArray(shopifySkuData) ? shopifySkuData : Object.values(shopifySkuData || {});
            const hasShopData = shopifyList.length > 0;
            if (hasShopData) { if (isRecent) shopDaysRecent++; else shopDaysPrior++; }
            
            const amazonSkuData = day?.amazon?.skuData;
            const amazonList = Array.isArray(amazonSkuData) ? amazonSkuData : Object.values(amazonSkuData || {});
            const hasAmzData = amazonList.length > 0;
            if (hasAmzData) { if (isRecent) amzDaysRecent++; else amzDaysPrior++; }
            
            shopifyList.forEach(item => {
              if (!item.sku) return;
              const normalizedSku = item.sku.replace(/shop$/i, '').toUpperCase();
              const units = item.unitsSold || item.units || 0;
              if (!skuDailyUnits[normalizedSku]) {
                skuDailyUnits[normalizedSku] = { recentShopify: 0, priorShopify: 0, recentAmazon: 0, priorAmazon: 0 };
              }
              if (isRecent) skuDailyUnits[normalizedSku].recentShopify += units;
              else skuDailyUnits[normalizedSku].priorShopify += units;
            });
            
            amazonList.forEach(item => {
              if (!item.sku) return;
              const normalizedSku = item.sku.replace(/shop$/i, '').toUpperCase();
              const units = item.unitsSold || item.units || 0;
              if (!skuDailyUnits[normalizedSku]) {
                skuDailyUnits[normalizedSku] = { recentShopify: 0, priorShopify: 0, recentAmazon: 0, priorAmazon: 0 };
              }
              if (isRecent) skuDailyUnits[normalizedSku].recentAmazon += units;
              else skuDailyUnits[normalizedSku].priorAmazon += units;
            });
          });
          
          const amzWeeksEquiv = Math.max((amzDaysRecent * 2 + amzDaysPrior) / 7, 0.14);
          const shopWeeksEquiv = Math.max((shopDaysRecent * 2 + shopDaysPrior) / 7, 0.14);
          console.log(`[AutoSync] Velocity data: AMZ ${amzDaysRecent}+${amzDaysPrior} days (weeksEquiv=${amzWeeksEquiv.toFixed(1)}), Shop ${shopDaysRecent}+${shopDaysPrior} days (weeksEquiv=${shopWeeksEquiv.toFixed(1)})`);
          
          Object.entries(skuDailyUnits).forEach(([sku, d]) => {
            const shopVel = shopWeeksEquiv > 0.14 ? ((d.recentShopify * 2) + d.priorShopify) / shopWeeksEquiv : 0;
            const amzVel = amzWeeksEquiv > 0.14 ? ((d.recentAmazon * 2) + d.priorAmazon) / amzWeeksEquiv : 0;
            storeAutoVelocity(autoShopifyVelLookup, sku, shopVel);
            storeAutoVelocity(autoAmazonVelLookup, sku, amzVel);
            
            const recentWeeklyShop = shopDaysRecent > 0 ? d.recentShopify / (shopDaysRecent / 7) : 0;
            const priorWeeklyShop = shopDaysPrior > 0 ? d.priorShopify / (shopDaysPrior / 7) : 0;
            const recentWeeklyAmz = amzDaysRecent > 0 ? d.recentAmazon / (amzDaysRecent / 7) : 0;
            const priorWeeklyAmz = amzDaysPrior > 0 ? d.priorAmazon / (amzDaysPrior / 7) : 0;
            const shopTrend = priorWeeklyShop > 0 ? ((recentWeeklyShop - priorWeeklyShop) / priorWeeklyShop) : 0;
            const amzTrend = priorWeeklyAmz > 0 ? ((recentWeeklyAmz - priorWeeklyAmz) / priorWeeklyAmz) : 0;
            autoVelocityTrends[sku] = { totalTrend: Math.round(((shopTrend + amzTrend) / 2) * 100) };
          });
        }
        
        // Weekly supplement for slow-moving SKUs
        const sortedWeeksForVel = Object.keys(allWeeksData).sort();
        if (sortedWeeksForVel.length > 0) {
          const weeklyShopVel = {};
          const weeklyAmzVel = {};
          
          sortedWeeksForVel.forEach(w => {
            const weekData = allWeeksData[w];
            if (weekData.shopify?.skuData) {
              const skuData = Array.isArray(weekData.shopify.skuData) ? weekData.shopify.skuData : Object.values(weekData.shopify.skuData);
              skuData.forEach(item => {
                if (!item.sku) return;
                const normalized = item.sku.replace(/shop$/i, '').toUpperCase();
                if (!weeklyShopVel[normalized]) weeklyShopVel[normalized] = 0;
                weeklyShopVel[normalized] += (item.unitsSold || item.units || 0);
              });
            }
            if (weekData.amazon?.skuData) {
              const skuData = Array.isArray(weekData.amazon.skuData) ? weekData.amazon.skuData : Object.values(weekData.amazon.skuData);
              skuData.forEach(item => {
                if (!item.sku) return;
                const normalized = item.sku.replace(/shop$/i, '').toUpperCase();
                if (!weeklyAmzVel[normalized]) weeklyAmzVel[normalized] = 0;
                weeklyAmzVel[normalized] += (item.unitsSold || item.units || 0);
              });
            }
          });
          
          const weekCount = sortedWeeksForVel.length;
          Object.entries(weeklyShopVel).forEach(([sku, totalUnits]) => {
            const weeklyAvg = totalUnits / weekCount;
            if (weeklyAvg > 0 && (!autoShopifyVelLookup[sku] || autoShopifyVelLookup[sku] === 0)) {
              storeAutoVelocity(autoShopifyVelLookup, sku, weeklyAvg);
            }
          });
          Object.entries(weeklyAmzVel).forEach(([sku, totalUnits]) => {
            const weeklyAvg = totalUnits / weekCount;
            if (weeklyAvg > 0 && (!autoAmazonVelLookup[sku] || autoAmazonVelLookup[sku] === 0)) {
              storeAutoVelocity(autoAmazonVelLookup, sku, weeklyAvg);
            }
          });
        }
      } catch (velErr) {
        devWarn('[AutoSync] Velocity calculation error:', velErr.message);
      }
      
      // Check Packiyo - use /api/packiyo/sync endpoint
      // SEC-003 race fix: cloud load may set connected=true before localStorage restores the apiKey
      let packiyoKey = packiyoCredentials.apiKey;
      let packiyoCustId = packiyoCredentials.customerId;
      let packiyoBase = packiyoCredentials.baseUrl;
      if (packiyoCredentials.connected && !packiyoKey) {
        try {
          const ls = JSON.parse(lsGet('ecommerce_packiyo_creds_v1') || '{}');
          if (ls.apiKey) {
            packiyoKey = ls.apiKey;
            packiyoCustId = ls.customerId || packiyoCustId;
            packiyoBase = ls.baseUrl || packiyoBase;
            setPackiyoCredentials(p => ({ ...p, apiKey: ls.apiKey, customerId: ls.customerId || p.customerId, baseUrl: ls.baseUrl || p.baseUrl }));
          }
        } catch (e) {}
      }
      if (appSettings.autoSync?.packiyo !== false && packiyoCredentials.connected && packiyoKey && packiyoCustId) {
        const packiyoStale = isServiceStale(packiyoCredentials.lastSync, threshold);
        
        if (packiyoStale || force) {
          try {
            const res = await fetch('/api/packiyo/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                syncType: 'inventory', // Use inventory for auto-sync
                apiKey: packiyoKey,
                customerId: packiyoCustId,
                baseUrl: packiyoBase,
              }),
            });
            const data = await res.json();
            if (!data.error && res.ok) {
              if (data.products) {
                setPackiyoInventoryData(data);
              }
              setPackiyoCredentials(p => ({ ...p, lastSync: new Date().toISOString() }));
              results.push({ service: 'Packiyo', success: true, skus: data.summary?.skuCount || data.products?.length || 0 });
              
              // ========== AUTO-SYNC: INVENTORY UPDATE ==========
              // Velocity lookups are now built at parent scope (before Packiyo)
              try {
                
                // Helper to get velocity with corrections
                const getAutoVelocity = (sku) => {
                  if (!sku) return { amazon: 0, shopify: 0, total: 0, corrected: 0, correctionApplied: false, trend: 0 };
                  const normalizedSku = sku.replace(/shop$/i, '').toUpperCase();
                  const variants = [sku, sku.toLowerCase(), sku.toUpperCase(), normalizedSku, normalizedSku.toLowerCase(),
                    normalizedSku + 'Shop', normalizedSku.toLowerCase() + 'shop', normalizedSku + 'SHOP'];
                  
                  let amazon = 0, shopify = 0;
                  for (const v of variants) {
                    if (autoAmazonVelLookup[v] > 0 && amazon === 0) amazon = autoAmazonVelLookup[v];
                    if (autoShopifyVelLookup[v] > 0 && shopify === 0) shopify = autoShopifyVelLookup[v];
                    if (amazon > 0 && shopify > 0) break;
                  }
                  
                  const total = amazon + shopify;
                  const trend = autoVelocityTrends[normalizedSku]?.totalTrend || 0;
                  let corrected = total;
                  let correctionApplied = false;
                  
                  if (forecastCorrections?.confidence >= 30 && forecastCorrections?.samplesUsed >= 2) {
                    if (forecastCorrections.bySku?.[normalizedSku]?.samples >= 2) {
                      corrected = total * (forecastCorrections.bySku[normalizedSku].units || 1);
                      correctionApplied = true;
                    } else if (forecastCorrections.overall?.units) {
                      corrected = total * forecastCorrections.overall.units;
                      correctionApplied = true;
                    }
                  }
                  
                  if (Math.abs(trend) > 20) {
                    corrected = corrected * (trend > 0 ? 1.1 : 0.9);
                  }
                  
                  return { amazon, shopify, total, corrected, correctionApplied, trend };
                };
                
                // Update inventory snapshot with Packiyo data + recalculated velocities
                if (data.inventoryBySku) {
                  const todayStr = new Date().toISOString().split('T')[0];
                  const targetDate = invHistory[todayStr] ? todayStr :
                    (selectedInvDate && invHistory[selectedInvDate]) ? selectedInvDate :
                    Object.keys(invHistory).sort().reverse()[0];
                  
                  if (targetDate && invHistory[targetDate]) {
                    const currentSnapshot = invHistory[targetDate];
                    const packiyoData = data.inventoryBySku;
                    const today = new Date();
                    const reorderTriggerDays = leadTimeSettings.reorderTriggerDays || 60;
                    const minOrderWeeks = leadTimeSettings.minOrderWeeks || 22;
                    const liveLeadTimeDays = leadTimeSettings.defaultLeadTimeDays || 14;
                    const liveOverstockThreshold = Math.max(90, (minOrderWeeks * 7) + reorderTriggerDays + liveLeadTimeDays);
                    const liveLowThreshold = Math.max(30, liveLeadTimeDays + 14);
                    const liveCriticalThreshold = Math.max(14, liveLeadTimeDays);
                    
                    // normalizeSkuKey already defined at module scope
                    const packiyoLookup = {};
                    Object.entries(packiyoData).forEach(([sku, item]) => {
                      packiyoLookup[normalizeSkuKey(sku)] = item;
                    });
                    
                    let newTplTotal = 0;
                    let newTplValue = 0;
                    let matchedCount = 0;
                    
                    const updatedItems = currentSnapshot.items.map(item => {
                      const normalizedItemSku = normalizeSkuKey(item.sku);
                      const packiyoItem = packiyoLookup[normalizedItemSku];
                      const newTplQty = packiyoItem?.quantityOnHand || packiyoItem?.quantity_on_hand || packiyoItem?.totalQty || 0;
                      const newTplInbound = packiyoItem?.quantityInbound || packiyoItem?.quantity_inbound || 0;
                      
                      if (packiyoItem) matchedCount++;
                      newTplTotal += newTplQty;
                      newTplValue += newTplQty * (item.cost || savedCogs[item.sku] || 0);
                      
                      // Use fresh Amazon data if available, otherwise keep existing
                      const normalizedItemSku2 = (item.sku || '').toUpperCase();
                      const freshAmz = freshAmazonFbaData?.[item.sku] || freshAmazonFbaData?.[normalizedItemSku2] || freshAmazonFbaData?.[(item.sku || '').toLowerCase()] || null;
                      const newAmazonQty = freshAmz ? freshAmz.total : (item.amazonQty || 0);
                      const newAmazonInbound = freshAmz ? freshAmz.inbound : (item.amazonInbound || 0);
                      const newAwdQty = freshAmz ? (freshAmz.awdQty || 0) : (item.awdQty || 0);
                      const newAwdInbound = freshAmz ? (freshAmz.awdInbound || 0) : (item.awdInbound || 0);
                      const newTotalQty = newAmazonQty + newTplQty + (item.homeQty || 0) + newAwdQty + newAmazonInbound + newAwdInbound + newTplInbound;
                      
                      // Get velocity with corrections
                      const velocityData = getAutoVelocity(item.sku);
                      const amzWeeklyVel = velocityData.amazon > 0 ? velocityData.amazon : (item.amzWeeklyVel || 0);
                      const shopWeeklyVel = velocityData.shopify > 0 ? velocityData.shopify : (item.shopWeeklyVel || 0);
                      const rawWeeklyVel = amzWeeklyVel + shopWeeklyVel;
                      const weeklyVel = rawWeeklyVel; // Display raw in UI
                      const correctedVelForDOS = velocityData.corrected > 0 ? velocityData.corrected : rawWeeklyVel;
                      
                      const dos = correctedVelForDOS > 0 ? Math.round((newTotalQty / correctedVelForDOS) * 7) : 999;
                      // Lead time: per-SKU → category → item stored → global default
                      const itemSkuCat = leadTimeSettings.skuCategories?.[item.sku] || leadTimeSettings.skuCategories?.[(item.sku || '').replace(/shop$/i, '').toUpperCase()] || '';
                      const itemCatLT = itemSkuCat && leadTimeSettings.categoryLeadTimes?.[itemSkuCat];
                      const leadTimeDays = leadTimeSettings.skuSettings?.[item.sku]?.leadTime || itemCatLT?.leadTimeDays || item.leadTimeDays || leadTimeSettings.defaultLeadTimeDays || 14;
                      
                      let stockoutDate = null;
                      let reorderByDate = null;
                      let daysUntilMustOrder = null;
                      
                      // Get demand stats for safety stock, seasonality, CV
                      const itemSkuNorm = (item.sku || '').trim().toUpperCase().replace(/SHOP$/i, '');
                      const demandStats = skuDemandStatsRef.current[itemSkuNorm] || null;
                      const leadTimeWeeks = leadTimeDays / 7;
                      const safetyStock = demandStats 
                        ? Math.ceil(1.65 * demandStats.weeklyStdDev * Math.sqrt(leadTimeWeeks))
                        : 0;
                      const seasonalFactor = demandStats?.currentSeasonalFactor || 1.0;
                      const seasonalVel = correctedVelForDOS * seasonalFactor;
                      const dailyVelForReorder = seasonalVel / 7;
                      const reorderPoint = Math.ceil((dailyVelForReorder * leadTimeDays) + safetyStock);
                      
                      if (correctedVelForDOS > 0 && dos < 999) {
                        const stockout = new Date(today);
                        stockout.setDate(stockout.getDate() + dos);
                        stockoutDate = stockout.toISOString().split('T')[0];
                        
                        const reorderPointDays = seasonalVel > 0 ? Math.round((reorderPoint / seasonalVel) * 7) : leadTimeDays;
                        daysUntilMustOrder = dos - reorderTriggerDays - reorderPointDays;
                        const reorderBy = new Date(today);
                        reorderBy.setDate(reorderBy.getDate() + daysUntilMustOrder);
                        reorderByDate = reorderBy.toISOString().split('T')[0];
                      }
                      
                      // Determine health status (dynamic thresholds + reorder urgency)
                      let health = 'unknown';
                      if (rawWeeklyVel > 0) {
                        if (daysUntilMustOrder !== null && daysUntilMustOrder < 0) health = 'critical';
                        else if (dos < liveCriticalThreshold || (daysUntilMustOrder !== null && daysUntilMustOrder < 7)) health = 'critical';
                        else if (dos < liveLowThreshold || (daysUntilMustOrder !== null && daysUntilMustOrder < 14)) health = 'low';
                        else if (dos <= liveOverstockThreshold) health = 'healthy';
                        else health = 'overstock';
                      }
                      
                      return {
                        ...item,
                        amazonQty: newAmazonQty,
                        amazonInbound: newAmazonInbound,
                        awdQty: newAwdQty,
                        awdInbound: newAwdInbound,
                        threeplQty: newTplQty,
                        threeplInbound: newTplInbound,
                        totalQty: newTotalQty,
                        totalValue: newTotalQty * (item.cost || 0),
                        weeklyVel,
                        rawWeeklyVel,
                        correctedVel: correctedVelForDOS,
                        amzWeeklyVel,
                        shopWeeklyVel,
                        correctionApplied: velocityData.correctionApplied,
                        velocityTrend: velocityData.trend,
                        daysOfSupply: dos,
                        stockoutDate,
                        reorderByDate,
                        daysUntilMustOrder,
                        health,
                        suggestedOrderQty: correctedVelForDOS > 0 ? Math.ceil(correctedVelForDOS * minOrderWeeks) + safetyStock : 0,
                        safetyStock,
                        reorderPoint,
                        seasonalFactor: Math.round(seasonalFactor * 100) / 100,
                        seasonalVel: Math.round(seasonalVel * 10) / 10,
                        cv: demandStats?.cv || 0,
                        demandClass: demandStats?.demandClass || 'unknown',
                      };
                    });
                    
                    updatedItems.sort((a, b) => b.totalValue - a.totalValue);
                    
                    // Recalculate supply chain KPIs from updated items
                    let critical = 0, low = 0, healthy = 0, overstock = 0;
                    updatedItems.forEach(item => {
                      if (item.health === 'critical') critical++;
                      else if (item.health === 'low') low++;
                      else if (item.health === 'healthy') healthy++;
                      else if (item.health === 'overstock') overstock++;
                    });
                    
                    const itemsWithTurnover = updatedItems.filter(i => i.turnoverRate > 0);
                    const avgTurnover = itemsWithTurnover.length > 0
                      ? itemsWithTurnover.reduce((s, i) => s + i.turnoverRate, 0) / itemsWithTurnover.length : 0;
                    const totalCarryingCost = updatedItems.reduce((s, i) => s + (i.annualCarryingCost || 0), 0);
                    const itemsWithSellThrough = updatedItems.filter(i => i.sellThroughRate > 0);
                    const avgSellThrough = itemsWithSellThrough.length > 0
                      ? itemsWithSellThrough.reduce((s, i) => s + i.sellThroughRate, 0) / itemsWithSellThrough.length : 0;
                    const itemsWithVel = updatedItems.filter(i => i.weeklyVel > 0);
                    const inStockRate = itemsWithVel.length > 0
                      ? Math.round((itemsWithVel.filter(i => i.totalQty > 0).length / itemsWithVel.length) * 1000) / 10 : 100;
                    const abcCounts = updatedItems.reduce((acc, i) => { acc[i.abcClass] = (acc[i.abcClass] || 0) + 1; return acc; }, {});
                    
                    // Recalculate Amazon totals from updated items if fresh data was used
                    const newAmzTotal = updatedItems.reduce((s, i) => s + (i.amazonQty || 0), 0);
                    const newAmzValue = updatedItems.reduce((s, i) => s + ((i.amazonQty || 0) * (i.cost || 0)), 0);
                    const newAmzInbound = updatedItems.reduce((s, i) => s + (i.amazonInbound || 0), 0);
                    const newAwdTotal = updatedItems.reduce((s, i) => s + (i.awdQty || 0), 0);
                    const newAwdValue = updatedItems.reduce((s, i) => s + ((i.awdQty || 0) * (i.cost || 0)), 0);
                    const homeUnits = currentSnapshot.summary?.homeUnits || 0;
                    const homeValue = currentSnapshot.summary?.homeValue || 0;
                    
                    const updatedSnapshot = {
                      ...currentSnapshot,
                      items: updatedItems,
                      summary: {
                        ...currentSnapshot.summary,
                        amazonUnits: newAmzTotal,
                        amazonValue: newAmzValue,
                        amazonInbound: newAmzInbound,
                        awdUnits: newAwdTotal,
                        awdValue: newAwdValue,
                        threeplUnits: newTplTotal,
                        threeplValue: newTplValue,
                        totalUnits: newAmzTotal + newTplTotal + homeUnits + newAwdTotal + newAmzInbound,
                        totalValue: newAmzValue + newTplValue + homeValue + newAwdValue,
                        skuCount: updatedItems.length,
                        // Recalculated supply chain KPIs
                        critical,
                        low,
                        healthy,
                        overstock,
                        avgTurnover: Math.round(avgTurnover * 10) / 10,
                        totalCarryingCost: Math.round(totalCarryingCost),
                        avgSellThrough: Math.round(avgSellThrough * 10) / 10,
                        inStockRate,
                        abcCounts,
                      },
                      sources: {
                        ...currentSnapshot.sources,
                        threepl: 'packiyo-auto-sync',
                        packiyoConnected: true,
                        lastPackiyoSync: new Date().toISOString(),
                        amazon: freshAmazonFbaData ? 'amazon-fba-auto-sync' : (currentSnapshot.sources?.amazon || 'unknown'),
                        lastAmazonFbaSync: freshAmazonFbaData ? new Date().toISOString() : (currentSnapshot.sources?.lastAmazonFbaSync || null),
                      },
                    };
                    
                    const updatedHistory = { ...invHistory, [targetDate]: updatedSnapshot };
                    setInvHistory(updatedHistory);
                    setSelectedInvDate(targetDate);
                    saveInv(updatedHistory);
                    fbaDataMergedIntoSnapshot = true;
                    
                  }
                }
              } catch (procErr) {
                devWarn('Auto-sync inventory processing error:', procErr);
                // Non-fatal - the API sync still succeeded
              }
            } else {
              results.push({ service: 'Packiyo', success: false, error: data.error || `HTTP ${res.status}` });
              devWarn('Packiyo auto-sync failed:', data.error || res.status);
            }
          } catch (err) {
            results.push({ service: 'Packiyo', success: false, error: err.message });
            devWarn('Packiyo auto-sync error:', err.message);
          }
        }
      }
      
      // ========== STANDALONE FBA+AWD MERGE (when Packiyo didn't run) ==========
      // If we fetched fresh FBA+AWD data but Packiyo didn't merge it into the snapshot,
      // do it now so AWD/FBA quantities are always persisted
      if (freshAmazonFbaData && !fbaDataMergedIntoSnapshot) {
        try {
          const todayStr = new Date().toISOString().split('T')[0];
          const targetDate = invHistory[todayStr] ? todayStr :
            (selectedInvDate && invHistory[selectedInvDate]) ? selectedInvDate :
            Object.keys(invHistory).sort().reverse()[0];
          
          if (targetDate && invHistory[targetDate]) {
            const currentSnapshot = invHistory[targetDate];
            const today = new Date();
            const reorderTriggerDays = leadTimeSettings.reorderTriggerDays || 60;
            const minOrderWeeks = leadTimeSettings.minOrderWeeks || 22;
            const liveLeadTimeDays = leadTimeSettings.defaultLeadTimeDays || 14;
            const liveOverstockThreshold = Math.max(90, (minOrderWeeks * 7) + reorderTriggerDays + liveLeadTimeDays);
            const liveLowThreshold = Math.max(30, liveLeadTimeDays + 14);
            const liveCriticalThreshold = Math.max(14, liveLeadTimeDays);
            
            // Build velocity lookups (reuse auto-sync ones if available)
            const getStandaloneVelocity = (sku) => {
              if (!sku) return { amazon: 0, shopify: 0, total: 0, corrected: 0, correctionApplied: false, trend: 0 };
              const normalizedSku = sku.replace(/shop$/i, '').toUpperCase();
              const variants = [sku, sku.toLowerCase(), sku.toUpperCase(), normalizedSku, normalizedSku.toLowerCase(),
                normalizedSku + 'Shop', normalizedSku.toLowerCase() + 'shop', normalizedSku + 'SHOP'];
              let amazon = 0, shopify = 0;
              for (const v of variants) {
                if (autoAmazonVelLookup[v] > 0 && amazon === 0) amazon = autoAmazonVelLookup[v];
                if (autoShopifyVelLookup[v] > 0 && shopify === 0) shopify = autoShopifyVelLookup[v];
                if (amazon > 0 && shopify > 0) break;
              }
              const total = amazon + shopify;
              let corrected = total;
              let correctionApplied = false;
              if (forecastCorrections?.confidence >= 30 && forecastCorrections?.samplesUsed >= 2) {
                if (forecastCorrections.bySku?.[normalizedSku]?.samples >= 2) {
                  corrected = total * (forecastCorrections.bySku[normalizedSku].units || 1);
                  correctionApplied = true;
                } else if (forecastCorrections.overall?.units) {
                  corrected = total * forecastCorrections.overall.units;
                  correctionApplied = true;
                }
              }
              return { amazon, shopify, total, corrected, correctionApplied, trend: 0 };
            };
            
            const updatedItems = currentSnapshot.items.map(item => {
              const normalizedItemSku2 = (item.sku || '').toUpperCase();
              const freshAmz = freshAmazonFbaData[item.sku] || freshAmazonFbaData[normalizedItemSku2] || freshAmazonFbaData[(item.sku || '').toLowerCase()] || null;
              if (!freshAmz) return item; // No fresh FBA data for this SKU, keep as-is
              
              const newAmazonQty = freshAmz.total;
              const newAmazonInbound = freshAmz.inbound;
              const newAwdQty = freshAmz.awdQty || 0;
              const newAwdInbound = freshAmz.awdInbound || 0;
              const newTotalQty = newAmazonQty + (item.threeplQty || 0) + (item.homeQty || 0) + newAwdQty + newAmazonInbound + newAwdInbound + (item.threeplInbound || 0);
              
              const velocityData = getStandaloneVelocity(item.sku);
              const amzWeeklyVel = velocityData.amazon > 0 ? velocityData.amazon : (item.amzWeeklyVel || 0);
              const shopWeeklyVel = velocityData.shopify > 0 ? velocityData.shopify : (item.shopWeeklyVel || 0);
              const rawWeeklyVel = amzWeeklyVel + shopWeeklyVel;
              const correctedVelForDOS = velocityData.corrected > 0 ? velocityData.corrected : rawWeeklyVel;
              
              const dos = correctedVelForDOS > 0 ? Math.round((newTotalQty / correctedVelForDOS) * 7) : 999;
              // Lead time: per-SKU → category → item stored → global default
              const fbaSkuCat = leadTimeSettings.skuCategories?.[item.sku] || leadTimeSettings.skuCategories?.[(item.sku || '').replace(/shop$/i, '').toUpperCase()] || '';
              const fbaCatLT = fbaSkuCat && leadTimeSettings.categoryLeadTimes?.[fbaSkuCat];
              const leadTimeDays = leadTimeSettings.skuSettings?.[item.sku]?.leadTime || fbaCatLT?.leadTimeDays || item.leadTimeDays || leadTimeSettings.defaultLeadTimeDays || 14;
              
              let stockoutDate = null, reorderByDate = null, daysUntilMustOrder = null;
              if (correctedVelForDOS > 0 && dos < 999) {
                const stockout = new Date(today);
                stockout.setDate(stockout.getDate() + dos);
                stockoutDate = stockout.toISOString().split('T')[0];
                daysUntilMustOrder = dos - reorderTriggerDays - leadTimeDays;
                const reorderBy = new Date(today);
                reorderBy.setDate(reorderBy.getDate() + daysUntilMustOrder);
                reorderByDate = reorderBy.toISOString().split('T')[0];
              }
              
              let health = 'unknown';
              if (rawWeeklyVel > 0) {
                if (daysUntilMustOrder !== null && daysUntilMustOrder < 0) health = 'critical';
                else if (dos < liveCriticalThreshold || (daysUntilMustOrder !== null && daysUntilMustOrder < 7)) health = 'critical';
                else if (dos < liveLowThreshold || (daysUntilMustOrder !== null && daysUntilMustOrder < 14)) health = 'low';
                else if (dos <= liveOverstockThreshold) health = 'healthy';
                else health = 'overstock';
              }
              
              return {
                ...item,
                amazonQty: newAmazonQty,
                amazonInbound: newAmazonInbound,
                awdQty: newAwdQty,
                awdInbound: newAwdInbound,
                totalQty: newTotalQty,
                totalValue: newTotalQty * (item.cost || 0),
                weeklyVel: rawWeeklyVel,
                correctedVel: correctedVelForDOS,
                amzWeeklyVel,
                shopWeeklyVel,
                daysOfSupply: dos,
                stockoutDate,
                reorderByDate,
                daysUntilMustOrder,
                health,
              };
            });
            
            // Recalculate summary
            let critical = 0, low = 0, healthy = 0, overstock = 0;
            updatedItems.forEach(item => {
              if (item.health === 'critical') critical++;
              else if (item.health === 'low') low++;
              else if (item.health === 'healthy') healthy++;
              else if (item.health === 'overstock') overstock++;
            });
            
            const newAmzTotal = updatedItems.reduce((s, i) => s + (i.amazonQty || 0), 0);
            const newAmzValue = updatedItems.reduce((s, i) => s + ((i.amazonQty || 0) * (i.cost || 0)), 0);
            const newAmzInbound = updatedItems.reduce((s, i) => s + (i.amazonInbound || 0), 0);
            const newAwdTotal = updatedItems.reduce((s, i) => s + (i.awdQty || 0), 0);
            const newAwdValue = updatedItems.reduce((s, i) => s + ((i.awdQty || 0) * (i.cost || 0)), 0);
            
            const updatedSnapshot = {
              ...currentSnapshot,
              items: updatedItems,
              summary: {
                ...currentSnapshot.summary,
                amazonUnits: newAmzTotal,
                amazonValue: newAmzValue,
                amazonInbound: newAmzInbound,
                awdUnits: newAwdTotal,
                awdValue: newAwdValue,
                totalUnits: newAmzTotal + (currentSnapshot.summary?.threeplUnits || 0) + (currentSnapshot.summary?.homeUnits || 0) + newAwdTotal + newAmzInbound,
                totalValue: newAmzValue + (currentSnapshot.summary?.threeplValue || 0) + (currentSnapshot.summary?.homeValue || 0) + newAwdValue,
                critical, low, healthy, overstock,
              },
              sources: {
                ...currentSnapshot.sources,
                amazon: 'amazon-fba-auto-sync',
                lastAmazonFbaSync: new Date().toISOString(),
              },
            };
            
            const updatedHistory = { ...invHistory, [targetDate]: updatedSnapshot };
            setInvHistory(updatedHistory);
            setSelectedInvDate(targetDate);
            saveInv(updatedHistory);
            fbaDataMergedIntoSnapshot = true;
            console.log('[AutoSync] FBA+AWD data merged into snapshot independently (no Packiyo)');
          } else if (freshAmazonFbaData) {
            // No existing snapshot — create a minimal one from FBA+AWD data
            const todayStr2 = new Date().toISOString().split('T')[0];
            const cogsLookup = getCogsLookup();
            const newItems = [];
            const seenSkus = new Set();
            
            Object.entries(freshAmazonFbaData).forEach(([sku, entry]) => {
              const normalizedSku = sku.replace(/shop$/i, '').toUpperCase();
              if (seenSkus.has(normalizedSku)) return;
              seenSkus.add(normalizedSku);
              
              const cost = cogsLookup[sku] || cogsLookup[normalizedSku] || cogsLookup[normalizedSku.toLowerCase()] || 0;
              if (cost === 0) return; // Skip SKUs without COGS
              
              const totalQty = (entry.total || 0) + (entry.awdQty || 0) + (entry.inbound || 0) + (entry.awdInbound || 0);
              newItems.push({
                sku: normalizedSku + 'Shop',
                name: normalizedSku,
                asin: entry.asin || '',
                amazonQty: entry.total || 0,
                threeplQty: 0,
                homeQty: 0,
                awdQty: entry.awdQty || 0,
                awdInbound: entry.awdInbound || 0,
                amazonInbound: entry.inbound || 0,
                threeplInbound: 0,
                totalQty,
                cost,
                totalValue: totalQty * cost,
                weeklyVel: 0,
                correctedVel: 0,
                amzWeeklyVel: 0,
                shopWeeklyVel: 0,
                daysOfSupply: 999,
                health: 'unknown',
                stockoutDate: null,
                reorderByDate: null,
                daysUntilMustOrder: null,
                suggestedOrderQty: 0,
                leadTimeDays: leadTimeSettings.defaultLeadTimeDays || 14,
                safetyStock: 0,
                reorderPoint: 0,
              });
            });
            
            if (newItems.length > 0) {
              const snapshot = {
                items: newItems,
                summary: {
                  skuCount: newItems.length,
                  totalUnits: newItems.reduce((s, i) => s + i.totalQty, 0),
                  totalValue: newItems.reduce((s, i) => s + i.totalValue, 0),
                  amazonUnits: newItems.reduce((s, i) => s + i.amazonQty, 0),
                  amazonValue: newItems.reduce((s, i) => s + (i.amazonQty * i.cost), 0),
                  awdUnits: newItems.reduce((s, i) => s + (i.awdQty || 0), 0),
                  awdValue: newItems.reduce((s, i) => s + ((i.awdQty || 0) * i.cost), 0),
                  threeplUnits: 0, threeplValue: 0,
                  critical: 0, low: 0, healthy: 0, overstock: 0,
                },
                sources: { amazon: 'amazon-fba-auto-sync', lastAmazonFbaSync: new Date().toISOString() },
              };
              const updatedHistory = { ...invHistory, [todayStr2]: snapshot };
              setInvHistory(updatedHistory);
              setSelectedInvDate(todayStr2);
              saveInv(updatedHistory);
              fbaDataMergedIntoSnapshot = true;
              console.log('[AutoSync] Created new inventory snapshot from FBA+AWD data:', newItems.length, 'SKUs');
            }
          }
        } catch (e) {
          devWarn('[AutoSync] Standalone FBA+AWD merge failed:', e.message);
        }
      }
      
      // Check QuickBooks Online
      if (appSettings.autoSync?.qbo !== false && (qboCredentials.connected || qboCredentials.refreshToken)) {
        const qboStale = isServiceStale(qboCredentials.lastSync, threshold);
        
        if (qboStale || force) {
          try {
            let currentAccessToken = qboCredentials.accessToken;
            
            // Pre-refresh if no access token but refresh token exists
            if (!currentAccessToken && qboCredentials.refreshToken) {
              try {
                const preRefreshRes = await fetch('/api/qbo/refresh', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ refreshToken: qboCredentials.refreshToken }),
                });
                if (preRefreshRes.ok) {
                  const preRefreshData = await preRefreshRes.json();
                  currentAccessToken = preRefreshData.accessToken;
                  setQboCredentials(p => ({
                    ...p,
                    accessToken: preRefreshData.accessToken,
                    refreshToken: preRefreshData.refreshToken || p.refreshToken,
                  }));
                }
              } catch (preRefreshErr) {
                devWarn('QBO pre-refresh failed:', preRefreshErr.message);
              }
            }
            
            if (!currentAccessToken || !qboCredentials.realmId) {
              devWarn('QBO auto-sync skipped: missing accessToken or realmId');
            } else {
            
            let res = await fetch('/api/qbo/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                realmId: qboCredentials.realmId,
                accessToken: currentAccessToken,
                refreshToken: qboCredentials.refreshToken,
              }),
            });
            
            // If token expired, try to refresh
            if (res.status === 401) {
              try {
                const refreshRes = await fetch('/api/qbo/refresh', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ refreshToken: qboCredentials.refreshToken }),
                });
                if (refreshRes.ok) {
                  const refreshData = await refreshRes.json();
                  currentAccessToken = refreshData.accessToken;
                  setQboCredentials(p => ({
                    ...p,
                    accessToken: refreshData.accessToken,
                    refreshToken: refreshData.refreshToken || p.refreshToken,
                  }));
                  // Retry with new token
                  res = await fetch('/api/qbo/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      realmId: qboCredentials.realmId,
                      accessToken: currentAccessToken,
                      refreshToken: refreshData.refreshToken || qboCredentials.refreshToken,
                    }),
                  });
                } else {
                  const refreshError = await refreshRes.json();
                  if (refreshError.needsReauth) {
                    setQboCredentials(p => ({ ...p, connected: false, accessToken: '', refreshToken: '' }));
                  }
                  throw new Error('QBO token refresh failed');
                }
              } catch (refreshErr) {
                throw refreshErr;
              }
            }
            
            if (res.ok) {
              const data = await res.json();
              // Merge transactions (same dedup logic as manual sync)
              setBankingData(prev => {
                const existingIds = new Set((prev?.transactions || []).map(t => t.qboId).filter(Boolean));
                const newTransactions = (data.transactions || []).filter(t => !existingIds.has(t.qboId));
                const allTxns = [...(prev?.transactions || []), ...newTransactions];
                return {
                  ...prev,
                  transactions: allTxns,
                  lastUpdated: new Date().toISOString(),
                  lastUpload: new Date().toISOString(),
                };
              });
              setQboCredentials(p => ({ ...p, lastSync: new Date().toISOString() }));
              const txnCount = data.transactions?.length || 0;
              results.push({ service: 'QuickBooks', success: true, transactions: txnCount });
            } else {
              results.push({ service: 'QuickBooks', success: false, error: `HTTP ${res.status}` });
              devWarn('QBO auto-sync failed:', res.status);
            }
            } // end else (has credentials)
          } catch (err) {
            results.push({ service: 'QuickBooks', success: false, error: err.message });
            devWarn('QBO auto-sync error:', err.message);
          }
        }
      }
      
      // Show results
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      
      if (successful.length > 0) {
        const summaryParts = successful.map(r => {
          if (r.service === 'Amazon') return 'Amazon';
          if (r.service === 'Shopify') return `Shopify (${r.orders} orders)`;
          if (r.service === 'Packiyo') return `Packiyo (${r.skus} SKUs)`;
          if (r.service === 'QuickBooks') return `QBO (${r.transactions} txns)`;
          return r.service;
        });
        setToast({
          message: `🔄 Auto-sync: ${summaryParts.join(', ')}`,
          type: 'success'
        });
      }
      
      if (failed.length > 0) {
        devWarn('Auto-sync failures:', failed);
        // Only show error toast if ALL failed
        if (successful.length === 0 && failed.length > 0) {
          setToast({
            message: `Auto-sync failed: ${failed.map(f => f.service).join(', ')}`,
            type: 'error'
          });
        }
      }
      
      if (results.length === 0) {
      }
      
    } catch (err) {
      devError('Auto-sync error:', err);
    } finally {
      audit('auto_sync', `${results.length} services: ${results.map(r => `${r.service}:${r.success ? 'ok' : 'fail'}`).join(', ')}`);
      setAutoSyncStatus(prev => ({ ...prev, running: false, results }));
      
      // CRITICAL: Force a cloud push AFTER all React state updates settle.
      // The debounced queueCloudSave from saveInv() can get cancelled by other state change
      // effects (e.g. allDaysData useEffect at line 4552), causing cloud to have stale inventory.
      // This 2-second delay ensures all state has propagated before the final push.
      setTimeout(() => {
        if (session?.user?.id && supabase && !isLoadingDataRef.current) {
          console.log('[AutoSync] Final cloud push to persist all synced data');
          // Read fresh from localStorage as source of truth (not stale combinedData closure)
          try {
            const freshInvRaw = lsGet(INVENTORY_KEY);
            const freshInv = freshInvRaw ? JSON.parse(freshInvRaw) : null;
            if (freshInv) {
              pushToCloudNow({ ...combinedData, inventory: freshInv });
            } else {
              pushToCloudNow(combinedData);
            }
          } catch (e) {
            pushToCloudNow(combinedData);
          }
        }
      }, 2000);
    }
  }, [appSettings.autoSync, amazonCredentials, shopifyCredentials, packiyoCredentials, qboCredentials, isServiceStale, autoSyncStatus.running, allDaysData, allWeeksData, forecastCorrections, invHistory, selectedInvDate, leadTimeSettings, savedCogs, getCogsLookup, queueCloudSave, combinedData]);
  
  // Run auto-sync on app load (if enabled)
  const runAutoSyncRef = useRef(runAutoSync);
  runAutoSyncRef.current = runAutoSync; // Always points to latest
  
  useEffect(() => {
    if (!appSettings.autoSync?.enabled) return;
    if (!appSettings.autoSync?.onAppLoad) return;
    
    // Delay auto-sync by 3 seconds to let app fully load
    const timer = setTimeout(() => {
      const anyConnected = amazonCredentials.connected || shopifyCredentials.connected || packiyoCredentials.connected;
      if (anyConnected) {
        runAutoSyncRef.current();
      }
    }, 3000);
    
    return () => clearTimeout(timer);
  }, []); // Only run once on mount
  
  // Set up interval for periodic sync (if enabled)
  useEffect(() => {
    if (!appSettings.autoSync?.enabled) return;
    
    const intervalHours = appSettings.autoSync?.intervalHours || 4;
    const intervalMs = intervalHours * 60 * 60 * 1000;
    
    
    const interval = setInterval(() => {
      const anyConnected = amazonCredentials.connected || shopifyCredentials.connected || packiyoCredentials.connected;
      if (anyConnected) {
        runAutoSyncRef.current();
      }
    }, intervalMs);
    
    return () => clearInterval(interval);
  }, [appSettings.autoSync?.enabled, appSettings.autoSync?.intervalHours]);
  // ============ END AUTO-SYNC EFFECT ============

  // ============ UNIFIED AI LEARNING SYSTEM ============
  // This is the master learning system that combines all data sources and learns continuously
  
  // Helper: Scan data availability across all sources
  const scanDataAvailability = useCallback(() => {
    const amazon = { daily: [], weekly: [], periods: [] };
    const shopify = { daily: [], weekly: [], periods: [] };
    
    // Scan daily data
    Object.entries(allDaysData).forEach(([dateKey, dayData]) => {
      if (dayData.amazon?.revenue > 0 || dayData.amazon?.units > 0) {
        amazon.daily.push(dateKey);
      }
      if (dayData.shopify?.revenue > 0 || dayData.shopify?.units > 0) {
        shopify.daily.push(dateKey);
      }
    });
    
    // Scan weekly data
    Object.entries(allWeeksData).forEach(([weekKey, weekData]) => {
      if (weekData.amazon?.revenue > 0 || weekData.amazon?.units > 0) {
        amazon.weekly.push(weekKey);
      }
      if (weekData.shopify?.revenue > 0 || weekData.shopify?.units > 0) {
        shopify.weekly.push(weekKey);
      }
    });
    
    // Scan period data (monthly, quarterly, yearly)
    Object.entries(allPeriodsData).forEach(([periodKey, periodData]) => {
      if (periodData.amazon?.revenue > 0 || periodData.amazon?.units > 0) {
        amazon.periods.push(periodKey);
      }
      if (periodData.shopify?.revenue > 0 || periodData.shopify?.units > 0) {
        shopify.periods.push(periodKey);
      }
    });
    
    return { amazon, shopify, lastScanned: new Date().toISOString() };
  }, [allDaysData, allWeeksData, allPeriodsData]);
  
  // Helper: Get estimated daily average from period data when daily data isn't available
  const getEstimatedDailyFromPeriod = useCallback((channel, dateKey) => {
    // Find which period this date falls into
    const date = new Date(dateKey + 'T12:00:00');
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const quarter = Math.ceil(month / 3);
    
    // Try monthly first, then quarterly, then yearly
    const monthKey = `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month-1]} ${year}`;
    const quarterKey = `Q${quarter} ${year}`;
    const yearKey = `${year}`;
    
    for (const periodKey of [monthKey, quarterKey, yearKey]) {
      const periodData = allPeriodsData[periodKey];
      if (periodData && periodData[channel]?.revenue > 0) {
        // Calculate days in period
        let daysInPeriod = 30; // default for monthly
        if (periodKey.startsWith('Q')) daysInPeriod = 91;
        if (/^\d{4}$/.test(periodKey)) daysInPeriod = 365;
        
        return {
          estimatedRevenue: periodData[channel].revenue / daysInPeriod,
          estimatedUnits: periodData[channel].units / daysInPeriod,
          estimatedProfit: getProfit(periodData[channel]) / daysInPeriod,
          source: periodKey,
          daysInPeriod,
          isEstimate: true,
        };
      }
    }
    return null;
  }, [allPeriodsData]);
  
  // Helper: Check if a day has complete data for a channel
  const hasDayData = useCallback((channel, dateKey) => {
    const dayData = allDaysData[dateKey];
    if (!dayData) return false;
    const channelData = dayData[channel];
    return channelData && (channelData.revenue > 0 || channelData.units > 0);
  }, [allDaysData]);
  
  // Helper: Get smart daily data that uses actuals when available, estimates when not
  const getSmartDailyData = useCallback((dateKey) => {
    const dayData = allDaysData[dateKey] || {};
    const result = {
      date: dateKey,
      amazon: { revenue: 0, units: 0, profit: 0, isEstimate: false, source: 'none' },
      shopify: { revenue: 0, units: 0, profit: 0, isEstimate: false, source: 'none' },
      total: { revenue: 0, units: 0, profit: 0 },
      hasActualAmazon: false,
      hasActualShopify: false,
      isComplete: false,
    };
    
    // Amazon data
    if (hasDayData('amazon', dateKey)) {
      result.amazon = {
        revenue: dayData.amazon.revenue || 0,
        units: dayData.amazon.units || 0,
        profit: dayData.amazon.netProfit || 0,
        isEstimate: false,
        source: 'daily',
      };
      result.hasActualAmazon = true;
    } else {
      // Try to get estimate from period data
      const estimate = getEstimatedDailyFromPeriod('amazon', dateKey);
      if (estimate) {
        result.amazon = {
          revenue: estimate.estimatedRevenue,
          units: estimate.estimatedUnits,
          profit: estimate.estimatedProfit,
          isEstimate: true,
          source: estimate.source,
        };
      }
    }
    
    // Shopify data
    if (hasDayData('shopify', dateKey)) {
      result.shopify = {
        revenue: dayData.shopify.revenue || 0,
        units: dayData.shopify.units || 0,
        profit: dayData.shopify.netProfit || 0,
        isEstimate: false,
        source: 'daily',
      };
      result.hasActualShopify = true;
    } else {
      const estimate = getEstimatedDailyFromPeriod('shopify', dateKey);
      if (estimate) {
        result.shopify = {
          revenue: estimate.estimatedRevenue,
          units: estimate.estimatedUnits,
          profit: estimate.estimatedProfit,
          isEstimate: true,
          source: estimate.source,
        };
      }
    }
    
    // Calculate totals
    result.total = {
      revenue: result.amazon.revenue + result.shopify.revenue,
      units: result.amazon.units + result.shopify.units,
      profit: result.amazon.profit + result.shopify.profit,
    };
    result.isComplete = result.hasActualAmazon && result.hasActualShopify;
    
    return result;
  }, [allDaysData, hasDayData, getEstimatedDailyFromPeriod]);
  
  // Helper: Calculate trend excluding days without data (don't treat missing as $0)
  const calculateSmartTrend = useCallback((daysCount = 14, channel = 'total') => {
    const today = new Date();
    const days = [];
    
    for (let i = 0; i < daysCount * 2; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];
      const smartData = getSmartDailyData(dateKey);
      
      // Only include days that have actual data for the requested channel
      // For 'total', require at least one channel to have actual data
      const hasData = channel === 'total' 
        ? (smartData.hasActualAmazon || smartData.hasActualShopify)
        : (channel === 'amazon' ? smartData.hasActualAmazon : smartData.hasActualShopify);
      
      if (hasData) {
        days.push({
          date: dateKey,
          revenue: channel === 'total' ? smartData.total.revenue : smartData[channel].revenue,
          profit: channel === 'total' ? smartData.total.profit : smartData[channel].profit,
          isEstimate: channel === 'total' 
            ? (smartData.amazon.isEstimate && smartData.shopify.isEstimate)
            : smartData[channel].isEstimate,
        });
      }
      
      if (days.length >= daysCount) break;
    }
    
    if (days.length < 4) return { trend: 0, recentAvg: 0, priorAvg: 0, daysAnalyzed: days.length, message: 'Insufficient data' };
    
    const half = Math.floor(days.length / 2);
    const recent = days.slice(0, half);
    const prior = days.slice(half);
    
    const recentAvg = recent.reduce((s, d) => s + d.revenue, 0) / recent.length;
    const priorAvg = prior.reduce((s, d) => s + d.revenue, 0) / prior.length;
    const trend = priorAvg > 0 ? ((recentAvg - priorAvg) / priorAvg) * 100 : 0;
    
    return {
      trend,
      recentAvg,
      priorAvg,
      daysAnalyzed: days.length,
      recentDays: recent.length,
      priorDays: prior.length,
      excludedEstimates: daysCount - days.length,
    };
  }, [getSmartDailyData]);
  
  // Main unified AI model update effect
  useEffect(() => {
    // Don't run until we have some data
    if (Object.keys(allDaysData).length === 0 && Object.keys(allWeeksData).length === 0 && Object.keys(allPeriodsData).length === 0) {
      return;
    }
    
    // Debounce updates
    const updateModel = () => {
      const dataAvailability = scanDataAvailability();
      
      // Calculate confidence based on data completeness
      const amazonDailyCount = dataAvailability.amazon.daily.length;
      const amazonPeriodCount = dataAvailability.amazon.periods.length;
      const shopifyDailyCount = dataAvailability.shopify.daily.length;
      const shopifyPeriodCount = dataAvailability.shopify.periods.length;
      
      // Amazon confidence: daily data is best, period data is okay
      const amazonConfidence = Math.min(100, (amazonDailyCount * 3) + (amazonPeriodCount * 10));
      const shopifyConfidence = Math.min(100, (shopifyDailyCount * 3) + (shopifyPeriodCount * 10));
      const overallConfidence = Math.round((amazonConfidence + shopifyConfidence) / 2);
      
      // Learn day-of-week patterns from actual daily data only
      const dayOfWeekPatterns = {};
      Object.entries(allDaysData).forEach(([dateKey, dayData]) => {
        // Only use days with actual sales data, not estimates
        if (!dayData.total?.revenue && !dayData.shopify?.revenue && !dayData.amazon?.revenue) return;
        
        const dayName = new Date(dateKey + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
        if (!dayOfWeekPatterns[dayName]) {
          dayOfWeekPatterns[dayName] = { count: 0, totalRevenue: 0, totalProfit: 0 };
        }
        dayOfWeekPatterns[dayName].count++;
        dayOfWeekPatterns[dayName].totalRevenue += dayData.total?.revenue || dayData.shopify?.revenue || dayData.amazon?.revenue || 0;
        dayOfWeekPatterns[dayName].totalProfit += dayData.total?.netProfit || dayData.shopify?.netProfit || dayData.amazon?.netProfit || 0;
      });
      
      // Calculate averages and find best/worst days
      const dayStats = Object.entries(dayOfWeekPatterns).map(([day, data]) => ({
        day,
        avgRevenue: data.count > 0 ? data.totalRevenue / data.count : 0,
        avgProfit: data.count > 0 ? data.totalProfit / data.count : 0,
        samples: data.count,
      })).sort((a, b) => b.avgRevenue - a.avgRevenue);
      
      const bestDays = dayStats.filter(d => d.samples >= 3).slice(0, 2).map(d => d.day);
      const worstDays = dayStats.filter(d => d.samples >= 3).slice(-2).map(d => d.day);
      
      // Learn seasonal patterns from period data
      const monthlyRevenue = {};
      Object.entries(allPeriodsData).forEach(([periodKey, data]) => {
        const monthMatch = periodKey.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
        if (monthMatch) {
          const month = monthMatch[1];
          if (!monthlyRevenue[month]) monthlyRevenue[month] = [];
          monthlyRevenue[month].push(data.total?.revenue || 0);
        }
      });
      
      // Find peak months
      const monthAvgs = Object.entries(monthlyRevenue).map(([month, revenues]) => ({
        month,
        avgRevenue: revenues.reduce((a, b) => a + b, 0) / revenues.length,
        samples: revenues.length,
      })).sort((a, b) => b.avgRevenue - a.avgRevenue);
      
      const seasonalPeaks = monthAvgs.filter(m => m.samples >= 1).slice(0, 3).map(m => m.month);
      
      // Merge existing correction factors (don't overwrite, just enhance)
      const existingCorrections = unifiedAIModel.corrections || {};
      const mergedCorrections = {
        ...existingCorrections,
        overall: forecastCorrections.overall || existingCorrections.overall || { revenue: 1, units: 1, profit: 1 },
        bySku: { ...existingCorrections.bySku, ...forecastCorrections.bySku },
        byMonth: { ...existingCorrections.byMonth, ...forecastCorrections.byMonth },
        byQuarter: { ...existingCorrections.byQuarter, ...forecastCorrections.byQuarter },
        byDayOfWeek: Object.fromEntries(
          dayStats.filter(d => d.samples >= 5).map(d => {
            const overallAvg = dayStats.reduce((s, x) => s + x.avgRevenue, 0) / dayStats.length;
            return [d.day, { revenue: overallAvg > 0 ? d.avgRevenue / overallAvg : 1 }];
          })
        ),
      };
      
      // Update the model
      setUnifiedAIModel(prev => ({
        ...prev,
        lastUpdated: new Date().toISOString(),
        dataAvailability,
        confidence: {
          amazon: amazonConfidence,
          shopify: shopifyConfidence,
          overall: overallConfidence,
        },
        corrections: mergedCorrections,
        patterns: {
          ...prev.patterns,
          bestDays,
          worstDays,
          seasonalPeaks,
          dayOfWeekStats: dayStats,
          monthlyStats: monthAvgs,
        },
        // Merge learning from forecastCorrections
        signalWeights: {
          dailyTrend: shopifyDailyCount > 14 ? 0.4 : 0.2,  // Less weight if little daily data
          weeklyAverage: 0.25,
          amazonForecast: amazonPeriodCount > 0 ? 0.2 : 0.1,
          seasonality: monthAvgs.length > 3 ? 0.1 : 0.05,
          momentum: 0.1,
        },
      }));
    };
    
    // Debounce to avoid excessive updates
    const timer = setTimeout(updateModel, 1000);
    return () => clearTimeout(timer);
  }, [allDaysData, allWeeksData, allPeriodsData, forecastCorrections, scanDataAvailability]);
  
  // ============ SMART DATA AGGREGATION ============
  // Provides comprehensive business metrics that properly handle gaps in daily data
  // Uses period data (monthly/quarterly) to fill in when daily data isn't available
  const unifiedBusinessMetrics = useMemo(() => {
    const metrics = {
      // Overall totals - prefer period data for historical accuracy
      allTime: { amazon: { revenue: 0, units: 0, profit: 0 }, shopify: { revenue: 0, units: 0, profit: 0 }, total: { revenue: 0, units: 0, profit: 0 } },
      
      // By year breakdown
      byYear: {},
      
      // Data source tracking - helps AI understand data completeness
      dataSources: {
        amazon: { dailyDates: [], periodNames: [], hasDailyGaps: false, gapsCoveredByPeriods: [] },
        shopify: { dailyDates: [], periodNames: [], hasDailyGaps: false, gapsCoveredByPeriods: [] },
      },
      
      // Proper averages that don't treat missing days as $0
      averages: {
        dailyRevenue: { amazon: 0, shopify: 0, total: 0, daysUsed: 0 },
        weeklyRevenue: { amazon: 0, shopify: 0, total: 0, weeksUsed: 0 },
        monthlyRevenue: { amazon: 0, shopify: 0, total: 0, monthsUsed: 0 },
      },
    };
    
    // Track which periods/years we have data for
    const yearlyTotals = {};
    const periodsCounted = new Set();
    
    // First pass: Collect all period data (most accurate for historical totals)
    Object.entries(allPeriodsData).forEach(([periodKey, data]) => {
      // Extract year from period key
      const yearMatch = periodKey.match(/(\d{4})/);
      const year = yearMatch ? yearMatch[1] : 'Unknown';
      
      if (!yearlyTotals[year]) {
        yearlyTotals[year] = { 
          amazon: { revenue: 0, units: 0, profit: 0, sources: [] }, 
          shopify: { revenue: 0, units: 0, profit: 0, sources: [] },
          total: { revenue: 0, units: 0, profit: 0 },
        };
      }
      
      // Check if this is a monthly period (most granular period data)
      const isMonthly = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(periodKey);
      const isQuarterly = /^Q\d/i.test(periodKey);
      const isYearly = /^\d{4}$/.test(periodKey);
      
      // For yearly totals, prefer monthly data, then quarterly, then yearly
      // Only add if we haven't already counted this data
      if (isMonthly) {
        // Monthly data - most accurate, always use
        if (data.amazon?.revenue > 0) {
          yearlyTotals[year].amazon.revenue += data.amazon.revenue;
          yearlyTotals[year].amazon.units += data.amazon.units || 0;
          yearlyTotals[year].amazon.profit += data.amazon.netProfit || 0;
          yearlyTotals[year].amazon.sources.push(periodKey);
          metrics.dataSources.amazon.periodNames.push(periodKey);
        }
        if (data.shopify?.revenue > 0) {
          yearlyTotals[year].shopify.revenue += data.shopify.revenue;
          yearlyTotals[year].shopify.units += data.shopify.units || 0;
          yearlyTotals[year].shopify.profit += data.shopify.netProfit || 0;
          yearlyTotals[year].shopify.sources.push(periodKey);
          metrics.dataSources.shopify.periodNames.push(periodKey);
        }
        periodsCounted.add(periodKey);
      } else if (isQuarterly && !periodsCounted.has(periodKey)) {
        // Check if we already have monthly data for this quarter
        const quarterNum = parseInt(periodKey.match(/Q(\d)/)?.[1] || '0');
        const monthsInQuarter = {
          1: ['Jan', 'Feb', 'Mar'],
          2: ['Apr', 'May', 'Jun'],
          3: ['Jul', 'Aug', 'Sep'],
          4: ['Oct', 'Nov', 'Dec'],
        }[quarterNum] || [];
        
        const hasMonthlyData = monthsInQuarter.some(m => periodsCounted.has(`${m} ${year}`));
        
        if (!hasMonthlyData) {
          // Use quarterly data since we don't have monthly
          if (data.amazon?.revenue > 0) {
            yearlyTotals[year].amazon.revenue += data.amazon.revenue;
            yearlyTotals[year].amazon.units += data.amazon.units || 0;
            yearlyTotals[year].amazon.profit += data.amazon.netProfit || 0;
            yearlyTotals[year].amazon.sources.push(periodKey);
            metrics.dataSources.amazon.periodNames.push(periodKey);
          }
          if (data.shopify?.revenue > 0) {
            yearlyTotals[year].shopify.revenue += data.shopify.revenue;
            yearlyTotals[year].shopify.units += data.shopify.units || 0;
            yearlyTotals[year].shopify.profit += data.shopify.netProfit || 0;
            yearlyTotals[year].shopify.sources.push(periodKey);
            metrics.dataSources.shopify.periodNames.push(periodKey);
          }
          periodsCounted.add(periodKey);
        }
      }
    });
    
    // For 2026 (current year), also check weekly data if no period data
    const currentYear = new Date().getFullYear().toString();
    if (!yearlyTotals[currentYear] || yearlyTotals[currentYear].amazon.sources.length === 0) {
      if (!yearlyTotals[currentYear]) {
        yearlyTotals[currentYear] = { 
          amazon: { revenue: 0, units: 0, profit: 0, sources: [] }, 
          shopify: { revenue: 0, units: 0, profit: 0, sources: [] },
          total: { revenue: 0, units: 0, profit: 0 },
        };
      }
      
      // Use weekly data for current year
      Object.entries(allWeeksData).forEach(([weekKey, data]) => {
        if (weekKey.startsWith(currentYear)) {
          if (data.amazon?.revenue > 0) {
            yearlyTotals[currentYear].amazon.revenue += data.amazon.revenue;
            yearlyTotals[currentYear].amazon.units += data.amazon.units || 0;
            yearlyTotals[currentYear].amazon.profit += data.amazon.netProfit || 0;
            yearlyTotals[currentYear].amazon.sources.push(`Week ${weekKey}`);
          }
          if (data.shopify?.revenue > 0) {
            yearlyTotals[currentYear].shopify.revenue += data.shopify.revenue;
            yearlyTotals[currentYear].shopify.units += data.shopify.units || 0;
            yearlyTotals[currentYear].shopify.profit += data.shopify.netProfit || 0;
            yearlyTotals[currentYear].shopify.sources.push(`Week ${weekKey}`);
          }
        }
      });
    }
    
    // Calculate totals by year
    Object.entries(yearlyTotals).forEach(([year, data]) => {
      data.total = {
        revenue: data.amazon.revenue + data.shopify.revenue,
        units: data.amazon.units + data.shopify.units,
        profit: data.amazon.profit + data.shopify.profit,
      };
      metrics.byYear[year] = data;
      
      // Add to all-time totals
      metrics.allTime.amazon.revenue += data.amazon.revenue;
      metrics.allTime.amazon.units += data.amazon.units;
      metrics.allTime.amazon.profit += data.amazon.profit;
      metrics.allTime.shopify.revenue += data.shopify.revenue;
      metrics.allTime.shopify.units += data.shopify.units;
      metrics.allTime.shopify.profit += data.shopify.profit;
    });
    
    metrics.allTime.total = {
      revenue: metrics.allTime.amazon.revenue + metrics.allTime.shopify.revenue,
      units: metrics.allTime.amazon.units + metrics.allTime.shopify.units,
      profit: metrics.allTime.amazon.profit + metrics.allTime.shopify.profit,
    };
    
    // Calculate proper averages from ACTUAL data only
    // Daily averages - only from days with actual data
    let amazonDailySum = 0, shopifyDailySum = 0, daysWithData = 0;
    Object.entries(allDaysData).forEach(([dateKey, data]) => {
      const hasAmazon = data.amazon?.revenue > 0;
      const hasShopify = data.shopify?.revenue > 0;
      if (hasAmazon || hasShopify) {
        daysWithData++;
        amazonDailySum += data.amazon?.revenue || 0;
        shopifyDailySum += data.shopify?.revenue || 0;
        if (hasAmazon) metrics.dataSources.amazon.dailyDates.push(dateKey);
        if (hasShopify) metrics.dataSources.shopify.dailyDates.push(dateKey);
      }
    });
    
    if (daysWithData > 0) {
      metrics.averages.dailyRevenue = {
        amazon: amazonDailySum / daysWithData,
        shopify: shopifyDailySum / daysWithData,
        total: (amazonDailySum + shopifyDailySum) / daysWithData,
        daysUsed: daysWithData,
      };
    }
    
    // Weekly averages - only from weeks with actual data
    let amazonWeeklySum = 0, shopifyWeeklySum = 0, weeksWithData = 0;
    Object.entries(allWeeksData).forEach(([weekKey, data]) => {
      const hasAmazon = data.amazon?.revenue > 0;
      const hasShopify = data.shopify?.revenue > 0;
      if (hasAmazon || hasShopify) {
        weeksWithData++;
        amazonWeeklySum += data.amazon?.revenue || 0;
        shopifyWeeklySum += data.shopify?.revenue || 0;
      }
    });
    
    if (weeksWithData > 0) {
      metrics.averages.weeklyRevenue = {
        amazon: amazonWeeklySum / weeksWithData,
        shopify: shopifyWeeklySum / weeksWithData,
        total: (amazonWeeklySum + shopifyWeeklySum) / weeksWithData,
        weeksUsed: weeksWithData,
      };
    }
    
    // Monthly averages - from period data
    let amazonMonthlySum = 0, shopifyMonthlySum = 0, monthsWithData = 0;
    Object.entries(allPeriodsData).forEach(([periodKey, data]) => {
      if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(periodKey)) {
        const hasAmazon = data.amazon?.revenue > 0;
        const hasShopify = data.shopify?.revenue > 0;
        if (hasAmazon || hasShopify) {
          monthsWithData++;
          amazonMonthlySum += data.amazon?.revenue || 0;
          shopifyMonthlySum += data.shopify?.revenue || 0;
        }
      }
    });
    
    if (monthsWithData > 0) {
      metrics.averages.monthlyRevenue = {
        amazon: amazonMonthlySum / monthsWithData,
        shopify: shopifyMonthlySum / monthsWithData,
        total: (amazonMonthlySum + shopifyMonthlySum) / monthsWithData,
        monthsUsed: monthsWithData,
      };
    }
    
    // Detect data gaps
    // For Amazon: check if we have monthly periods but few daily entries for 2025
    const amazon2025Months = metrics.dataSources.amazon.periodNames.filter(p => p.includes('2025'));
    const amazon2025Days = metrics.dataSources.amazon.dailyDates.filter(d => d.startsWith('2025'));
    if (amazon2025Months.length > 0 && amazon2025Days.length < 30) {
      metrics.dataSources.amazon.hasDailyGaps = true;
      metrics.dataSources.amazon.gapsCoveredByPeriods = amazon2025Months;
    }
    
    return metrics;
  }, [allDaysData, allWeeksData, allPeriodsData]);
  // ============ END UNIFIED AI LEARNING SYSTEM ============

  // Get upcoming Amazon forecasts (weeks we haven't reached yet)
  const upcomingAmazonForecasts = useMemo(() => {
    const today = new Date();
    return Object.entries(amazonForecasts)
      .filter(([weekKey]) => new Date(weekKey) > today)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([weekKey, data]) => ({ weekEnding: weekKey, ...data }));
  }, [amazonForecasts]);

  // ============ AI INSIGHTS GENERATION ============
  const generateAIInsights = useCallback(async () => {
    if (aiInsightsLoading) return;
    setAiInsightsLoading(true);
    
    try {
      // Prepare context data for AI analysis
      const recentWeeks = Object.keys(allWeeksData).sort().reverse().slice(0, 8);
      const weekData = recentWeeks.map(w => ({
        week: w,
        revenue: allWeeksData[w]?.total?.revenue || 0,
        profit: getProfit(allWeeksData[w]?.total),
        units: allWeeksData[w]?.total?.units || 0,
      }));
      
      const accuracyData = forecastAccuracyHistory.records.slice(-8).map(r => ({
        week: r.weekEnding,
        accuracy: r.accuracy,
        variance: r.variance?.revenuePercent || 0,
      }));
      
      const learningStatus = {
        confidence: forecastCorrections.confidence,
        samples: forecastCorrections.samplesUsed,
        overallRevenueFactor: forecastCorrections.overall?.revenue || 1,
        overallUnitsFactor: forecastCorrections.overall?.units || 1,
      };
      
      const prompt = `Analyze this e-commerce business data and provide 3-5 actionable insights:

Recent Sales (last 8 weeks): ${JSON.stringify(weekData)}

Forecast Accuracy History: ${JSON.stringify(accuracyData)}

Learning System Status: ${JSON.stringify(learningStatus)}

Focus on:
1. Sales trends and patterns
2. Forecast accuracy improvement opportunities
3. Inventory planning recommendations
4. Any concerning patterns

Keep insights brief and actionable. Format as numbered list.`;

      const insights = await callAI(prompt);
      setAiInsights({
        content: insights || 'Unable to generate insights',
        generatedAt: new Date().toISOString(),
        dataPoints: weekData.length + accuracyData.length,
      });
    } catch (err) {
      devError('AI insights error:', err);
      setAiInsights({
        content: 'Error generating insights: ' + err.message,
        generatedAt: new Date().toISOString(),
        error: true,
      });
    } finally {
      setAiInsightsLoading(false);
    }
  }, [allWeeksData, forecastAccuracyHistory.records, forecastCorrections, aiInsightsLoading]);
  // ============ END AI INSIGHTS ============

  // ============ AI-POWERED FORECASTING ============
  const generateAIForecasts = useCallback(async () => {
    if (aiForecastLoading) return;
    setAiForecastLoading(true);
    
    try {
      // ==================== DATA COLLECTION ====================
      const sortedWeeks = Object.keys(allWeeksData).sort();
      const sortedDays = Object.keys(allDaysData).filter(d => hasDailySalesData(allDaysData[d])).sort();
      const today = new Date();
      const amazonStartDate = new Date('2024-06-01'); // When Amazon sales started
      
      if (sortedWeeks.length < 2 && sortedDays.length < 7) {
        setAiForecasts({ error: 'Need at least 2 weeks or 7 days of data', generatedAt: new Date().toISOString() });
        return;
      }
      
      // ==================== DAILY DATA ANALYSIS (MOST IMPORTANT) ====================
      // Filter out incomplete days: Recent days with Shopify but no Amazon are incomplete
      const dailyData = sortedDays.slice(-60).map(d => {
        const data = allDaysData[d];
        const date = new Date(d + 'T12:00:00');
        const amazonRevenue = data?.amazon?.revenue || 0;
        const shopifyRevenue = data?.shopify?.revenue || 0;
        
        // A day is "complete" if:
        // 1. It has Amazon revenue > 0, OR
        // 2. It's before Amazon started (early data), OR
        // 3. It's before 2024 (pre-ecommerce era)
        const isComplete = amazonRevenue > 0 || date < amazonStartDate || date < new Date('2024-01-01');
        
        // Profit: prefer total.netProfit, fallback to summing channel profits
        let dayProfit = getProfit(data?.total);
        if (dayProfit === 0 && (amazonRevenue > 0 || shopifyRevenue > 0)) {
          dayProfit = (data?.amazon?.netProfit || 0) + (data?.shopify?.netProfit || 0);
        }
        
        return {
          date: d,
          dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'long' }),
          dayNum: date.getDay(),
          revenue: data?.total?.revenue || (amazonRevenue + shopifyRevenue),
          profit: dayProfit,
          units: data?.total?.units || 0,
          amazonRevenue,
          shopifyRevenue,
          isComplete, // Flag for filtering
        };
      }).filter(d => d.revenue > 0 && d.isComplete); // Only complete days with actual sales
      
      // Last 7 days, 14 days, 30 days analysis (using COMPLETE days only)
      const last7Days = dailyData.slice(-7);
      const last14Days = dailyData.slice(-14);
      const last30Days = dailyData.slice(-30);
      const prior7Days = dailyData.slice(-14, -7);
      
      const avg7Day = last7Days.length > 0 ? last7Days.reduce((s, d) => s + d.revenue, 0) / last7Days.length : 0;
      const avg14Day = last14Days.length > 0 ? last14Days.reduce((s, d) => s + d.revenue, 0) / last14Days.length : 0;
      const avg30Day = last30Days.length > 0 ? last30Days.reduce((s, d) => s + d.revenue, 0) / last30Days.length : 0;
      const avgPrior7 = prior7Days.length > 0 ? prior7Days.reduce((s, d) => s + d.revenue, 0) / prior7Days.length : avg7Day;
      
      // Momentum: Compare last 7 days to prior 7 days
      const momentum = avgPrior7 > 0 ? ((avg7Day - avgPrior7) / avgPrior7 * 100) : 0;
      
      // Day-of-week patterns
      const dayPatterns = {};
      ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].forEach(day => {
        const dayData = dailyData.filter(d => d.dayOfWeek === day);
        if (dayData.length > 0) {
          dayPatterns[day] = {
            avgRevenue: dayData.reduce((s, d) => s + d.revenue, 0) / dayData.length,
            avgProfit: dayData.reduce((s, d) => s + d.profit, 0) / dayData.length,
            sampleSize: dayData.length,
          };
        }
      });
      
      // Best and worst days
      const sortedDayPatterns = Object.entries(dayPatterns).sort((a, b) => b[1].avgRevenue - a[1].avgRevenue);
      const bestDays = sortedDayPatterns.slice(0, 2).map(([day]) => day);
      const worstDays = sortedDayPatterns.slice(-2).map(([day]) => day);
      
      // ==================== WEEKLY DATA ANALYSIS ====================
      const weeklyData = sortedWeeks.slice(-12).map(w => {
        const data = allWeeksData[w];
        // Profit: prefer total.netProfit, fallback to summing channel profits
        let weekProfit = getProfit(data?.total);
        if (weekProfit === 0 && (data?.amazon?.revenue || data?.shopify?.revenue)) {
          weekProfit = (data?.amazon?.netProfit || 0) + (data?.shopify?.netProfit || 0);
        }
        return {
          weekEnding: w,
          revenue: data?.total?.revenue || 0,
          profit: weekProfit,
          units: data?.total?.units || 0,
          margin: data?.total?.revenue > 0 ? (weekProfit / data?.total?.revenue * 100) : 0,
          amazonRevenue: data?.amazon?.revenue || 0,
          shopifyRevenue: data?.shopify?.revenue || 0,
          adSpend: data?.total?.adSpend || 0,
        };
      });
      
      // Filter to complete weeks only (> $1000 revenue or > 10% of average)
      const avgWeekRev = weeklyData.reduce((s, w) => s + w.revenue, 0) / weeklyData.length;
      const completeWeeks = weeklyData.filter(w => w.revenue > Math.max(1000, avgWeekRev * 0.1));
      
      // Weekly trend analysis
      const recentWeeks = completeWeeks.slice(-4);
      const olderWeeks = completeWeeks.slice(-8, -4);
      const recentWeekAvg = recentWeeks.length > 0 ? recentWeeks.reduce((s, w) => s + w.revenue, 0) / recentWeeks.length : 0;
      const olderWeekAvg = olderWeeks.length > 0 ? olderWeeks.reduce((s, w) => s + w.revenue, 0) / olderWeeks.length : recentWeekAvg;
      const weeklyTrend = olderWeekAvg > 0 ? ((recentWeekAvg - olderWeekAvg) / olderWeekAvg * 100) : 0;
      
      // ==================== AMAZON FORECAST ANALYSIS (CRITICAL) ====================
      const amazonForecastWeeks = Object.entries(amazonForecasts)
        .map(([week, data]) => ({
          weekEnding: week,
          forecastRevenue: data.totals?.sales || data.totals?.revenue || 0,
          forecastUnits: data.totals?.units || 0,
          forecastProceeds: data.totals?.proceeds || 0,
          skuCount: data.skuCount || Object.keys(data.skuForecasts || {}).length,
          isFuture: new Date(week) > today,
          isPast: new Date(week) <= today,
        }))
        .sort((a, b) => a.weekEnding.localeCompare(b.weekEnding));
      
      // Future Amazon forecasts (next 4 weeks)
      const futureAmazonForecasts = amazonForecastWeeks.filter(f => f.isFuture).slice(0, 4);
      
      // Amazon forecast accuracy: Compare past forecasts to actual results
      let amazonAccuracy = { samples: 0, avgError: 0, bias: 0 };
      const pastForecasts = amazonForecastWeeks.filter(f => f.isPast && f.forecastRevenue > 0);
      if (pastForecasts.length > 0) {
        let totalError = 0, totalBias = 0, samples = 0;
        pastForecasts.forEach(f => {
          const actual = allWeeksData[f.weekEnding]?.amazon?.revenue || 0;
          if (actual > 0) {
            const error = Math.abs(f.forecastRevenue - actual) / actual * 100;
            const bias = (f.forecastRevenue - actual) / actual * 100; // Positive = optimistic
            totalError += error;
            totalBias += bias;
            samples++;
          }
        });
        if (samples > 0) {
          amazonAccuracy = {
            samples,
            avgError: totalError / samples,
            bias: totalBias / samples, // Positive means Amazon typically over-predicts
          };
        }
      }
      
      // Adjust Amazon forecast based on historical accuracy
      const amazonBiasCorrection = amazonAccuracy.samples >= 2 ? (1 - amazonAccuracy.bias / 100) : 1;
      const adjustedAmazonForecast = futureAmazonForecasts.length > 0 
        ? futureAmazonForecasts[0].forecastRevenue * amazonBiasCorrection
        : null;
      
      // ==================== PREPARE PREDICTION INPUTS ====================
      const dailyBasedWeekly = avg7Day * 7; // Most recent daily × 7
      // Cap trend multiplier to max ±10% effect
      const trendMultiplier = Math.max(0.90, Math.min(1.10, 1 + weeklyTrend / 100 * 0.3));
      const trendAdjustedWeekly = dailyBasedWeekly * trendMultiplier;
      
      // ==================== PERIOD DATA ANALYSIS (2025 Monthly, 2024 Quarterly) ====================
      const periodsSummary = Object.entries(allPeriodsData).map(([label, data]) => ({
        period: label,
        type: (() => {
          const l = label.toLowerCase();
          if (l.match(/^\d{4}$/)) return 'yearly';
          if (l.match(/^q\d/i)) return 'quarterly';
          if (l.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i)) return 'monthly';
          return 'monthly';
        })(),
        totalRevenue: data.total?.revenue || 0,
        totalProfit: getProfit(data.total),
        totalUnits: data.total?.units || 0,
        margin: data.total?.revenue > 0 ? ((getProfit(data.total)) / data.total.revenue * 100) : 0,
      })).sort((a, b) => a.period.localeCompare(b.period));
      
      const months2025 = periodsSummary.filter(p => (p.period.includes('2025') || p.period.includes('-2025')) && p.type === 'monthly');
      const quarters2024 = periodsSummary.filter(p => (p.period.includes('2024') || p.period.includes('-2024')) && p.type === 'quarterly');
      
      // Calculate seasonal index for current month (if we have historical data)
      const currentMonth = today.toLocaleDateString('en-US', { month: 'long' });
      const monthlyData = periodsSummary.filter(p => p.type === 'monthly' && p.totalRevenue > 0);
      let seasonalIndex = 1.0;
      if (monthlyData.length >= 3) {
        const avgMonthlyRevenue = monthlyData.reduce((s, m) => s + m.totalRevenue, 0) / monthlyData.length;
        const currentMonthData = monthlyData.find(m => m.period.toLowerCase().includes(currentMonth.toLowerCase()));
        if (currentMonthData && avgMonthlyRevenue > 0) {
          seasonalIndex = currentMonthData.totalRevenue / avgMonthlyRevenue;
        }
      }
      
      // Get YoY baseline if available (same month last year)
      const lastYearSameMonth = `${currentMonth} ${today.getFullYear() - 1}`;
      const yoyBaseline = periodsSummary.find(p => p.period === lastYearSameMonth);
      
      // ==================== CALCULATE WEIGHTED PREDICTION ====================
      // CORE PRINCIPLE: Weekly prediction = Daily avg × 7, with small adjustments
      // This ensures math consistency: $6,212/day × 7 = $43,484/week
      
      let weightedPrediction = dailyBasedWeekly; // Start with core calculation
      
      // Apply SMALL adjustments (max ±15% total deviation from daily-based)
      if (adjustedAmazonForecast && futureAmazonForecasts.length > 0) {
        // Sanity check: Amazon forecast should be within 2x of daily-based
        const amazonWithinRange = adjustedAmazonForecast > dailyBasedWeekly * 0.5 && 
                                   adjustedAmazonForecast < dailyBasedWeekly * 2;
        
        if (amazonWithinRange) {
          // Blend: 75% daily-based, 15% trend, 10% Amazon
          weightedPrediction = (dailyBasedWeekly * 0.75) + (trendAdjustedWeekly * 0.15) + (adjustedAmazonForecast * 0.10);
        } else {
          // Amazon forecast out of range - ignore it
          weightedPrediction = (dailyBasedWeekly * 0.85) + (trendAdjustedWeekly * 0.15);
        }
      } else {
        // No Amazon forecast: 85% daily-based, 15% trend-adjusted
        weightedPrediction = (dailyBasedWeekly * 0.85) + (trendAdjustedWeekly * 0.15);
      }
      
      // STRICT SANITY BOUNDS: Max ±15% deviation from daily-based calculation
      const maxPrediction = dailyBasedWeekly * 1.15;
      const minPrediction = dailyBasedWeekly * 0.85;
      
      if (weightedPrediction > maxPrediction) {
        weightedPrediction = maxPrediction;
      }
      if (weightedPrediction < minPrediction) {
        weightedPrediction = minPrediction;
      }
      
      
      // Calculate profit prediction based on historical margin
      // Try daily data first, fall back to weekly data, then use default
      const dailyTotalRevenue = last30Days.reduce((s, d) => s + d.revenue, 0);
      const dailyTotalProfit = last30Days.reduce((s, d) => s + d.profit, 0);
      
      let avgProfitMargin;
      if (dailyTotalRevenue > 0 && dailyTotalProfit !== 0) {
        avgProfitMargin = dailyTotalProfit / dailyTotalRevenue;
      } else {
        // Fall back to weekly data
        const recentWeeks = sortedWeeks.slice(-8);
        const weeklyTotalRevenue = recentWeeks.reduce((s, w) => s + (allWeeksData[w]?.total?.revenue || 0), 0);
        const weeklyTotalProfit = recentWeeks.reduce((s, w) => {
          const wd = allWeeksData[w];
          let wp = getProfit(wd?.total);
          if (wp === 0 && (wd?.amazon?.revenue || wd?.shopify?.revenue)) {
            wp = (wd?.amazon?.netProfit || 0) + (wd?.shopify?.netProfit || 0);
          }
          return s + wp;
        }, 0);
        
        if (weeklyTotalRevenue > 0 && weeklyTotalProfit !== 0) {
          avgProfitMargin = weeklyTotalProfit / weeklyTotalRevenue;
        } else {
          avgProfitMargin = 0.25; // Default 25% margin if no profit data
        }
      }
      
      // Sanity check - margin should be between -50% and 60%
      if (isNaN(avgProfitMargin) || avgProfitMargin > 0.6) avgProfitMargin = 0.25;
      if (avgProfitMargin < -0.5) avgProfitMargin = -0.1; // Cap losses at -10% for forecasting
      
      const profitPrediction = weightedPrediction * avgProfitMargin;
      
      // ==================== INVENTORY ANALYSIS ====================
      const latestInvKey = Object.keys(invHistory).sort().reverse()[0];
      // Deduplicate inventory items - merge items that are the same SKU with different casing
      const rawInvItems = latestInvKey ? (invHistory[latestInvKey]?.items || []) : [];
      const deduped = {};
      rawInvItems.forEach(item => {
        const normSku = (item.sku || '').toUpperCase();
        if (!deduped[normSku] || (item.totalQty || 0) > (deduped[normSku].totalQty || 0)) {
          // Keep the entry with more inventory, or merge quantities
          if (deduped[normSku]) {
            // Merge: add quantities from duplicate
            item = { 
              ...item, 
              sku: normSku,
              amazonQty: (item.amazonQty || 0) + (deduped[normSku].amazonQty || 0),
              threeplQty: Math.max(item.threeplQty || 0, deduped[normSku].threeplQty || 0), // Don't double-count 3PL
              homeQty: Math.max(item.homeQty || 0, deduped[normSku].homeQty || 0),
              totalQty: (item.amazonQty || 0) + Math.max(item.threeplQty || 0, deduped[normSku].threeplQty || 0) + Math.max(item.homeQty || 0, deduped[normSku].homeQty || 0),
            };
          }
          deduped[normSku] = item;
        }
      });
      const inventoryItems = Object.values(deduped).map(item => ({
        sku: (item.sku || '').toUpperCase(),
        name: savedProductNames[item.sku] || savedProductNames[(item.sku || '').toUpperCase()] || item.name || item.sku,
        currentStock: item.totalQty || 0,
        weeklyVelocity: item.weeklyVel || 0,
        daysOfSupply: item.daysOfSupply || 0,
        health: item.health,
        reorderByDate: item.reorderByDate,
        daysUntilMustOrder: item.daysUntilMustOrder,
        aiUrgency: item.aiUrgency,
        aiAction: item.aiAction,
      }));
      
      const criticalInventory = inventoryItems.filter(i => i.daysOfSupply > 0 && i.daysOfSupply < 14);
      const lowInventory = inventoryItems.filter(i => i.daysOfSupply >= 14 && i.daysOfSupply < 30);
      
      // ==================== ADS SPEND ANALYSIS ====================
      // Handle both formats: shopify.googleSpend (with sales data) and root-level googleSpend (ads-only)
      const adsAnalysis = sortedDays.slice(-30).reduce((acc, d) => {
        const dayData = allDaysData[d];
        if (!dayData) return acc;
        
        // Support both nested (shopify.googleSpend) and flat (googleSpend) formats
        const googleAds = dayData?.shopify?.googleSpend || dayData?.googleSpend || dayData?.googleAds || 0;
        const metaAds = dayData?.shopify?.metaSpend || dayData?.metaSpend || dayData?.metaAds || 0;
        const adsMetrics = dayData?.shopify?.adsMetrics || {};
        
        // For flat format, metrics are at root level
        const googleImpressions = adsMetrics.googleImpressions || dayData?.googleImpressions || 0;
        const metaImpressions = adsMetrics.metaImpressions || dayData?.metaImpressions || 0;
        const googleClicks = adsMetrics.googleClicks || dayData?.googleClicks || 0;
        const metaClicks = adsMetrics.metaClicks || dayData?.metaClicks || 0;
        const googleConversions = adsMetrics.googleConversions || dayData?.googleConversions || 0;
        const metaPurchases = adsMetrics.metaPurchases || dayData?.metaConversions || 0;
        const metaPurchaseValue = adsMetrics.metaPurchaseValue || dayData?.metaPurchaseValue || 0;
        
        return {
          totalGoogleSpend: acc.totalGoogleSpend + googleAds,
          totalMetaSpend: acc.totalMetaSpend + metaAds,
          totalImpressions: acc.totalImpressions + googleImpressions + metaImpressions,
          totalClicks: acc.totalClicks + googleClicks + metaClicks,
          totalConversions: acc.totalConversions + googleConversions + metaPurchases,
          metaPurchaseValue: acc.metaPurchaseValue + metaPurchaseValue,
          daysWithAds: googleAds > 0 || metaAds > 0 ? acc.daysWithAds + 1 : acc.daysWithAds,
        };
      }, { totalGoogleSpend: 0, totalMetaSpend: 0, totalImpressions: 0, totalClicks: 0, totalConversions: 0, metaPurchaseValue: 0, daysWithAds: 0 });
      
      const totalAdSpend = adsAnalysis.totalGoogleSpend + adsAnalysis.totalMetaSpend;
      const avgDailyAdSpend = adsAnalysis.daysWithAds > 0 ? totalAdSpend / adsAnalysis.daysWithAds : 0;
      const overallCTR = adsAnalysis.totalImpressions > 0 ? (adsAnalysis.totalClicks / adsAnalysis.totalImpressions * 100) : 0;
      const avgCPC = adsAnalysis.totalClicks > 0 ? totalAdSpend / adsAnalysis.totalClicks : 0;
      
      // ==================== FULL AI FORECAST (Streaming - Uses Pro 60s) ====================
      const nextSunday = new Date(today);
      nextSunday.setDate(nextSunday.getDate() + (7 - nextSunday.getDay()) % 7 || 7);
      
      // Helper to read SSE stream from chat API (utilizes Pro 60s timeout)
      const fetchStreamingAI = async (prompt, systemPrompt) => {
        
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system: systemPrompt,
            messages: [{ role: 'user', content: prompt }],
            model: aiChatModel || AI_DEFAULT_MODEL,
            max_tokens: 4000,
          }),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          devError('API error:', response.status, errorText);
          throw new Error(`API error: ${response.status}`);
        }
        
        // Check if it's a streaming response
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/event-stream')) {
          // Read SSE stream
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let fullText = '';
          let buffer = '';
          
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line
            
            for (const line of lines) {
              // Skip comments (: ping, : keepalive, etc.)
              if (line.startsWith(':')) continue;
              
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.type === 'delta' && data.text) {
                    fullText += data.text;
                  } else if (data.type === 'done' && data.fullText) {
                    fullText = data.fullText;
                  } else if (data.type === 'complete' && data.content?.[0]?.text) {
                    fullText = data.content[0].text;
                  } else if (data.type === 'error') {
                    throw new Error(data.error);
                  }
                } catch (e) {
                  // Ignore parse errors for incomplete JSON
                }
              }
            }
          }
          
          return fullText;
        } else {
          // Fallback to JSON response (non-streaming)
          const data = await response.json();
          return data.content?.[0]?.text || '';
        }
      };
      
      // Build comprehensive AI prompt
      const prompt = `You are an e-commerce forecasting AI. Analyze patterns and provide insights.

## CRITICAL: USE THESE EXACT NUMBERS
My algorithm calculated: **$${weightedPrediction.toFixed(0)}/week** revenue, **$${profitPrediction.toFixed(0)}/week** profit
DO NOT generate different revenue numbers. Use $${weightedPrediction.toFixed(0)} as Week 1 prediction.

## CALCULATION BASIS
- Daily avg (last 7 days): $${avg7Day.toFixed(2)}/day
- Weekly projection: $${avg7Day.toFixed(2)} × 7 = $${(avg7Day * 7).toFixed(0)}/week
- Momentum: ${momentum > 0 ? '+' : ''}${momentum.toFixed(1)}%
- Profit margin: ${(avgProfitMargin * 100).toFixed(1)}%
${futureAmazonForecasts.length > 0 ? `- Amazon forecast (bias-corrected): $${adjustedAmazonForecast?.toFixed(0) || 'N/A'}/week` : ''}

## DATA SUMMARY
- ${dailyData.length} days of data, ${completeWeeks.length} complete weeks
- Best days: ${bestDays.join(', ')}
- Worst days: ${worstDays.join(', ')}
- Critical inventory: ${criticalInventory.length} SKUs
${totalAdSpend > 0 ? `- Ads (30d): $${totalAdSpend.toFixed(0)}, ${overallCTR.toFixed(1)}% CTR` : ''}
${yoyBaseline ? `- YoY: Last ${currentMonth}: $${yoyBaseline.totalRevenue.toFixed(0)}` : ''}
- Inventory: ${criticalInventory.length} critical, ${lowInventory.length} low stock
${totalAdSpend > 0 ? `- Ads (30d): $${totalAdSpend.toFixed(0)} spend, ${overallCTR.toFixed(1)}% CTR, ${adsAnalysis.totalConversions} conv` : ''}

## YOUR TASK
Provide insights and analysis. I will use my calculated $${weightedPrediction.toFixed(0)}/week for the actual predictions.

Week 1 starts: ${nextSunday.toISOString().split('T')[0]}

Respond with ONLY this JSON (no markdown):
{
  "analysis": {
    "confidence": "high|medium|low",
    "reasoning": "why this confidence level",
    "trendDirection": "up|stable|down",
    "dataQuality": "excellent|good|limited"
  },
  "actionableInsights": [
    {"category": "sales|inventory|marketing", "priority": "high|medium", "insight": "specific action", "expectedImpact": "result"}
  ],
  "risks": [
    {"risk": "description", "likelihood": "high|medium|low", "mitigation": "action"}
  ],
  "opportunities": [
    {"opportunity": "description", "action": "how to capitalize"}
  ]
}`;

      const systemPrompt = `You are an e-commerce forecasting AI. Provide analysis and insights only. The revenue predictions have already been calculated - DO NOT generate revenue numbers. Focus on patterns, risks, and actionable recommendations. Respond with valid JSON only.`;

      
      try {
        const responseText = await fetchStreamingAI(prompt, systemPrompt);
        
        // Parse JSON response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        let aiAnalysis = {};
        
        if (jsonMatch) {
          try {
            aiAnalysis = JSON.parse(jsonMatch[0]);
          } catch (e) { if (e?.message) devWarn("[catch]", e.message); }
        }
        
        // GENERATE FORECAST LOCALLY using our calculated values
        const weekDates = [];
        const next4Weeks = [];
        
        for (let i = 0; i < 4; i++) {
          const weekDate = new Date(nextSunday);
          weekDate.setDate(weekDate.getDate() + (i * 7));
          weekDates.push(weekDate.toISOString().split('T')[0]);
          
          // Start with our calculated prediction
          let weekRevenue = weightedPrediction;
          
          // Apply small trend adjustment for future weeks (max ±5% per week)
          const trendMultiplier = 1 + (weeklyTrend / 100 * 0.05 * i);
          weekRevenue = weekRevenue * Math.max(0.95, Math.min(1.05, trendMultiplier));
          
          // Blend with Amazon forecast if available and reasonable
          const amazonWeek = futureAmazonForecasts[i];
          if (amazonWeek && amazonAccuracy.samples >= 2) {
            const amazonRevenue = amazonWeek.forecastRevenue * (1 - amazonAccuracy.bias / 100);
            // Only blend if Amazon is within 50% of our prediction
            if (amazonRevenue > weightedPrediction * 0.5 && amazonRevenue < weightedPrediction * 1.5) {
              weekRevenue = weekRevenue * 0.85 + amazonRevenue * 0.15;
            }
          }
          
          // Calculate profit and units
          const weekProfit = weekRevenue * avgProfitMargin;
          const avgUnitValue = completeWeeks.length > 0 
            ? completeWeeks.reduce((s, w) => s + w.revenue, 0) / Math.max(1, completeWeeks.reduce((s, w) => s + (w.units || 0), 0))
            : 15;
          const weekUnits = Math.round(weekRevenue / (avgUnitValue || 15));
          
          next4Weeks.push({
            weekEnding: weekDates[i],
            predictedRevenue: Math.round(weekRevenue * 100) / 100,
            predictedProfit: Math.round(weekProfit * 100) / 100,
            predictedUnits: weekUnits,
            confidence: aiAnalysis.analysis?.confidence || (i === 0 ? 'high' : 'medium'),
            reasoning: i === 0 
              ? `Based on $${avg7Day.toFixed(0)}/day × 7 days = $${(avg7Day * 7).toFixed(0)}/week`
              : `Week ${i + 1} with ${weeklyTrend > 0 ? '+' : ''}${weeklyTrend.toFixed(1)}% trend`,
          });
        }
        
        // Build complete forecast object
        const forecast = {
          salesForecast: {
            next4Weeks,
            monthlyOutlook: {
              expectedRevenue: Math.round(next4Weeks.reduce((s, w) => s + w.predictedRevenue, 0)),
              expectedProfit: Math.round(next4Weeks.reduce((s, w) => s + w.predictedProfit, 0)),
              growthTrend: aiAnalysis.analysis?.trendDirection || (weeklyTrend > 5 ? 'up' : weeklyTrend < -5 ? 'down' : 'stable'),
              keyFactors: [
                `Daily avg: $${avg7Day.toFixed(0)}/day`,
                `Momentum: ${momentum > 0 ? '+' : ''}${momentum.toFixed(1)}%`,
                futureAmazonForecasts.length > 0 ? 'Amazon forecast integrated' : 'Historical patterns only',
              ],
            },
          },
          signalAnalysis: {
            dailySignalStrength: dailyData.length >= 14 ? 'strong' : dailyData.length >= 7 ? 'moderate' : 'weak',
            trendDirection: aiAnalysis.analysis?.trendDirection || (weeklyTrend > 5 ? 'up' : weeklyTrend < -5 ? 'down' : 'stable'),
            dataQuality: aiAnalysis.analysis?.dataQuality || (dailyData.length >= 14 ? 'excellent' : 'good'),
            confidence: aiAnalysis.analysis?.confidence || 'medium',
          },
          actionableInsights: aiAnalysis.actionableInsights || [],
          risks: aiAnalysis.risks || [],
          opportunities: aiAnalysis.opportunities || [],
        };
        
        setAiForecasts({
          ...forecast,
          generatedAt: new Date().toISOString(),
          source: 'claude-ai',
          model: aiChatModel || AI_DEFAULT_MODEL,
          calculatedSignals: {
            dailyAvg7: avg7Day,
            dailyAvg14: avg14Day,
            dailyAvg30: avg30Day,
            momentum,
            weeklyTrend,
            amazonBiasCorrection,
            weightedPrediction,
            profitPrediction,
            avgProfitMargin: avgProfitMargin * 100,
            seasonalIndex,
          },
          periodData: {
            months2025: months2025.length,
            quarters2024: quarters2024.length,
            totalPeriods: periodsSummary.length,
            yoyBaseline: yoyBaseline ? { period: yoyBaseline.period, revenue: yoyBaseline.totalRevenue, profit: yoyBaseline.totalProfit } : null,
            currentMonthSeasonalIndex: seasonalIndex,
          },
          adsAnalysis: {
            totalGoogleSpend: adsAnalysis.totalGoogleSpend,
            totalMetaSpend: adsAnalysis.totalMetaSpend,
            totalAdSpend,
            avgDailyAdSpend,
            totalImpressions: adsAnalysis.totalImpressions,
            totalClicks: adsAnalysis.totalClicks,
            totalConversions: adsAnalysis.totalConversions,
            metaPurchaseValue: adsAnalysis.metaPurchaseValue,
            overallCTR,
            avgCPC,
            daysWithAds: adsAnalysis.daysWithAds,
          },
          dataPoints: {
            dailyDays: dailyData.length,
            weeklyWeeks: completeWeeks.length,
            amazonForecastWeeks: futureAmazonForecasts.length,
            amazonAccuracySamples: amazonAccuracy.samples,
            adsDataDays: adsAnalysis.daysWithAds,
            periodMonths2025: months2025.length,
            periodQuarters2024: quarters2024.length,
          },
        });
        
        
      } catch (aiError) {
        devError('AI forecast error:', aiError);
        throw aiError; // Re-throw to be caught by outer catch
      }
      
    } catch (error) {
      devError('Forecast error:', error);
      setAiForecasts({ error: error.message || 'Failed to generate forecast', generatedAt: new Date().toISOString() });
    } finally {
      setAiForecastLoading(false);
    }
  }, [allWeeksData, allDaysData, amazonForecasts, invHistory, savedProductNames, forecastCorrections, aiForecastLoading]);
  // ============ END AI-POWERED FORECASTING ============

  // ============ MODULAR AI FORECAST SYSTEM ============
  
  // Helper to get lead time for a SKU
  const getLeadTime = useCallback((sku) => {
    return leadTimeSettings.skuLeadTimes[sku] || leadTimeSettings.defaultLeadTimeDays;
  }, [leadTimeSettings]);
  
  // 1. SALES FORECAST AI - Predict tomorrow, week, month, quarter
  const generateSalesForecastAI = useCallback(async (period = 'week') => {
    setAiForecastModule(prev => ({ ...prev, loading: 'sales' }));
    
    try {
      const sortedWeeks = Object.keys(allWeeksData).sort();
      const sortedDays = Object.keys(allDaysData).filter(d => hasDailySalesData(allDaysData[d])).sort();
      
      // Prepare historical data
      const weeklyHistory = sortedWeeks.slice(-12).map(w => {
        const wd = allWeeksData[w];
        let wp = getProfit(wd?.total);
        if (wp === 0 && (wd?.amazon?.revenue || wd?.shopify?.revenue)) {
          wp = (wd?.amazon?.netProfit || 0) + (wd?.shopify?.netProfit || 0);
        }
        return {
          weekEnding: w,
          revenue: wd?.total?.revenue || 0,
          profit: wp,
          units: wd?.total?.units || 0,
          amazonRevenue: wd?.amazon?.revenue || 0,
          shopifyRevenue: wd?.shopify?.revenue || 0,
        };
      });
      
      const dailyHistory = sortedDays.slice(-30).map(d => {
        const date = new Date(d + 'T12:00:00');
        const dd = allDaysData[d];
        let dp = getProfit(dd?.total);
        if (dp === 0 && (dd?.amazon?.revenue || dd?.shopify?.revenue)) {
          dp = (dd?.amazon?.netProfit || 0) + (dd?.shopify?.netProfit || 0);
        }
        return {
          date: d,
          dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'short' }),
          revenue: dd?.total?.revenue || (dd?.amazon?.revenue || 0) + (dd?.shopify?.revenue || 0),
          profit: dp,
          units: dd?.total?.units || 0,
        };
      });
      
      // Calculate key metrics for baseline - EXCLUDE ZERO REVENUE WEEKS
      // Filter to only weeks with actual revenue > $100 (to exclude placeholder/empty weeks)
      const activeWeeks = weeklyHistory.filter(w => w.revenue > 100);
      const activeDays = dailyHistory.filter(d => d.revenue > 0);
      
      // Calculate averages from ACTIVE data only
      const avgWeeklyRevenue = activeWeeks.length > 0 
        ? activeWeeks.reduce((sum, w) => sum + w.revenue, 0) / activeWeeks.length : 0;
      const avgWeeklyProfit = activeWeeks.length > 0
        ? activeWeeks.reduce((sum, w) => sum + w.profit, 0) / activeWeeks.length : 0;
      const avgWeeklyUnits = activeWeeks.length > 0
        ? activeWeeks.reduce((sum, w) => sum + w.units, 0) / activeWeeks.length : 0;
      const avgDailyRevenue = activeDays.length > 0
        ? activeDays.reduce((sum, d) => sum + d.revenue, 0) / activeDays.length : 0;
      const avgDailyProfit = activeDays.length > 0
        ? activeDays.reduce((sum, d) => sum + d.profit, 0) / activeDays.length : 0;
      const avgDailyUnits = activeDays.length > 0
        ? activeDays.reduce((sum, d) => sum + d.units, 0) / activeDays.length : 0;
      
      // Calculate weekly estimate from daily data (more accurate if we have recent daily data)
      const weeklyFromDaily = avgDailyRevenue * 7;
      const weeklyProfitFromDaily = avgDailyProfit * 7;
      const weeklyUnitsFromDaily = avgDailyUnits * 7;
      
      // If we have recent daily data (last 7 days), prefer that over weekly averages
      const recentDays = activeDays.slice(-7);
      const hasRecentDailyData = recentDays.length >= 5;
      
      // Use weighted average: 70% daily-based if recent, 30% weekly
      let effectiveWeeklyRevenue, effectiveWeeklyProfit, effectiveWeeklyUnits;
      if (hasRecentDailyData && weeklyFromDaily > 0) {
        effectiveWeeklyRevenue = weeklyFromDaily * 0.7 + avgWeeklyRevenue * 0.3;
        effectiveWeeklyProfit = weeklyProfitFromDaily * 0.7 + avgWeeklyProfit * 0.3;
        effectiveWeeklyUnits = weeklyUnitsFromDaily * 0.7 + avgWeeklyUnits * 0.3;
      } else if (avgWeeklyRevenue > 0) {
        effectiveWeeklyRevenue = avgWeeklyRevenue;
        effectiveWeeklyProfit = avgWeeklyProfit;
        effectiveWeeklyUnits = avgWeeklyUnits;
      } else {
        effectiveWeeklyRevenue = weeklyFromDaily;
        effectiveWeeklyProfit = weeklyProfitFromDaily;
        effectiveWeeklyUnits = weeklyUnitsFromDaily;
      }
      
      // Past predictions for learning
      const pastPredictions = aiLearningHistory.predictions
        .filter(p => p.type === 'sales' && p.actual !== undefined)
        .slice(-10);
      
      // Determine the baseline based on period
      let baselineRevenue, baselineProfit, baselineUnits;
      if (period === 'tomorrow') {
        baselineRevenue = avgDailyRevenue;
        baselineProfit = avgDailyProfit;
        baselineUnits = avgDailyUnits;
      } else if (period === 'week') {
        baselineRevenue = effectiveWeeklyRevenue;
        baselineProfit = effectiveWeeklyProfit;
        baselineUnits = effectiveWeeklyUnits;
      } else if (period === 'month') {
        baselineRevenue = effectiveWeeklyRevenue * 4.33;
        baselineProfit = effectiveWeeklyProfit * 4.33;
        baselineUnits = effectiveWeeklyUnits * 4.33;
      } else { // quarter
        baselineRevenue = effectiveWeeklyRevenue * 13;
        baselineProfit = effectiveWeeklyProfit * 13;
        baselineUnits = effectiveWeeklyUnits * 13;
      }
      
      const prompt = `You are an expert e-commerce sales forecaster. Analyze this data and predict sales.

CRITICAL: Base your prediction on the ACTUAL historical data. Do NOT make up numbers.

## REQUEST: Predict ${period === 'tomorrow' ? "TOMORROW's" : period === 'week' ? 'THIS WEEK' : period === 'month' ? 'THIS MONTH' : 'THIS QUARTER'} sales

## TODAY'S DATE: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}

## KEY BASELINES (calculated from ACTIVE data only - zero-revenue weeks excluded)
- Average Daily Revenue (last 30 days): $${avgDailyRevenue.toFixed(2)}/day
- Weekly estimate from daily data: $${weeklyFromDaily.toFixed(2)}/week
- Average from active weeks (${activeWeeks.length} weeks with sales): $${avgWeeklyRevenue.toFixed(2)}/week
- **EFFECTIVE WEEKLY BASELINE**: $${effectiveWeeklyRevenue.toFixed(2)} (${hasRecentDailyData ? '70% daily-based, 30% weekly' : 'weekly average'})
- EXPECTED BASELINE FOR ${period.toUpperCase()}: $${baselineRevenue.toFixed(2)} revenue, $${baselineProfit.toFixed(2)} profit, ${Math.round(baselineUnits)} units

## RECENT DAILY PERFORMANCE (MOST RELIABLE - ${activeDays.length} active days)
${JSON.stringify(dailyHistory.slice(-14), null, 2)}

## WEEKLY HISTORY (${activeWeeks.length} active weeks out of ${weeklyHistory.length} total)
${JSON.stringify(activeWeeks.slice(-8), null, 2)}

## PAST AI PREDICTIONS VS ACTUALS (for learning)
${pastPredictions.length > 0 ? JSON.stringify(pastPredictions, null, 2) : 'No past predictions yet'}

## LEARNING CORRECTIONS
Revenue Correction: ${forecastCorrections.overall?.revenue?.toFixed(3) || 1}x
Confidence: ${forecastCorrections.confidence?.toFixed(1) || 0}%

RULES:
1. PRIORITIZE recent daily data over older weekly data
2. Your "expected" prediction should be very close to the baseline of $${baselineRevenue.toFixed(0)}
3. "low" should be ~20% below baseline, "high" should be ~20% above
4. Only deviate significantly if there's a clear trend in the RECENT data
5. Ignore weeks with zero or near-zero revenue (they represent data gaps, not actual performance)

Respond with ONLY this JSON:
{
  "period": "${period}",
  "prediction": {
    "revenue": { "low": number, "expected": number (near $${baselineRevenue.toFixed(0)}), "high": number },
    "profit": { "low": number, "expected": number, "high": number },
    "units": { "low": number, "expected": number, "high": number }
  },
  "confidence": "high" | "medium" | "low",
  "reasoning": "explain based on actual data",
  "factors": ["factor1", "factor2"],
  "dayOfWeekInsight": "pattern insight if relevant",
  "trend": "up" | "stable" | "down"
}`;

      const responseText = await callAI(prompt, 'You are an expert e-commerce sales forecaster. Provide accurate, data-driven predictions. Always respond with valid JSON only.');
      
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let forecast = JSON.parse(jsonMatch[0]);
        
        // VALIDATION: Ensure predictions are within reasonable bounds
        const maxReasonable = baselineRevenue * 2.5;
        const minReasonable = baselineRevenue * 0.3;
        
        if (forecast.prediction?.revenue?.expected) {
          const pred = forecast.prediction.revenue.expected;
          if (pred > maxReasonable || pred < minReasonable) {
            // Adjust to reasonable values based on baseline
            forecast.prediction.revenue = {
              low: Math.round(baselineRevenue * 0.8),
              expected: Math.round(baselineRevenue),
              high: Math.round(baselineRevenue * 1.2),
            };
            forecast.prediction.profit = {
              low: Math.round(baselineProfit * 0.8),
              expected: Math.round(baselineProfit),
              high: Math.round(baselineProfit * 1.2),
            };
            forecast.prediction.units = {
              low: Math.round(baselineUnits * 0.8),
              expected: Math.round(baselineUnits),
              high: Math.round(baselineUnits * 1.2),
            };
            forecast.confidence = 'low';
            forecast.reasoning = `Adjusted to historical baseline of $${baselineRevenue.toFixed(0)}. Original AI prediction was outside reasonable range.`;
          }
        }
        
        // Store prediction for future learning
        const predictionRecord = {
          id: `sales-${period}-${Date.now()}`,
          type: 'sales',
          period,
          predictedAt: new Date().toISOString(),
          prediction: forecast.prediction,
          baseline: { revenue: baselineRevenue, profit: baselineProfit, units: baselineUnits },
          // actual will be filled in later when we have real data
        };
        
        setAiLearningHistory(prev => ({
          ...prev,
          predictions: [...prev.predictions.slice(-50), predictionRecord], // Keep last 50
        }));
        
        setAiForecastModule(prev => ({
          ...prev,
          sales: {
            ...prev.sales,
            [period]: { ...forecast, baseline: baselineRevenue, generatedAt: new Date().toISOString() },
          },
          loading: null,
          lastUpdated: new Date().toISOString(),
        }));
      }
    } catch (error) {
      devError('Sales Forecast AI error:', error);
      setAiForecastModule(prev => ({ ...prev, loading: null }));
    }
  }, [allWeeksData, allDaysData, forecastCorrections, aiLearningHistory]);
  
  // 2. INVENTORY AI - Reorder recommendations with lead times
  const generateInventoryAI = useCallback(async () => {
    setAiForecastModule(prev => ({ ...prev, loading: 'inventory' }));
    
    try {
      const latestInvKey = Object.keys(invHistory).sort().reverse()[0];
      if (!latestInvKey || !invHistory[latestInvKey]?.items?.length) {
        setToast({ message: 'No inventory data found. Upload an inventory snapshot first.', type: 'error' });
        setAiForecastModule(prev => ({ ...prev, loading: null }));
        return;
      }
      
      // Get reorder settings
      const reorderTriggerDays = leadTimeSettings.reorderTriggerDays || 60; // Want shipment to arrive when stock = this
      const minOrderWeeks = leadTimeSettings.minOrderWeeks || 22; // Minimum order size (5 months ≈ 22 weeks)
      const aiDefaultLeadTime = leadTimeSettings.defaultLeadTimeDays || 14;
      const aiOverstockThreshold = Math.max(90, (minOrderWeeks * 7) + reorderTriggerDays + aiDefaultLeadTime);
      const aiLowThreshold = Math.max(30, aiDefaultLeadTime + 14);
      const aiCriticalThreshold = Math.max(14, aiDefaultLeadTime);
      
      // Pre-calculated stockout dates and reorder points already exist on each item
      // Check if data comes from recent API sync (Packiyo/Amazon) - use that date instead of snapshot date
      const today = new Date();
      const snapshotData = invHistory[latestInvKey];
      const lastPackiyoSync = snapshotData?.sources?.lastPackiyoSync ? new Date(snapshotData.sources.lastPackiyoSync) : null;
      const lastAmazonSync = snapshotData?.sources?.lastAmazonSync ? new Date(snapshotData.sources.lastAmazonSync) : null;
      
      // Use most recent sync date, falling back to snapshot date
      let effectiveDataDate = new Date(latestInvKey + 'T12:00:00');
      if (lastPackiyoSync && lastPackiyoSync > effectiveDataDate) {
        effectiveDataDate = lastPackiyoSync;
      }
      if (lastAmazonSync && lastAmazonSync > effectiveDataDate) {
        effectiveDataDate = lastAmazonSync;
      }
      
      // Only apply days-elapsed if data is actually old
      const daysElapsed = Math.max(0, Math.floor((today - effectiveDataDate) / (1000 * 60 * 60 * 24)));
      
      
      // DEDUPLICATE inventory items by normalized SKU (case-insensitive)
      // Keep the item with the highest totalQty (most complete data)
      const rawItems = invHistory[latestInvKey]?.items || [];
      const dedupedByNormalizedSku = {};
      rawItems.forEach(item => {
        const normalizedSku = (item.sku || '').trim().toUpperCase();
        const existing = dedupedByNormalizedSku[normalizedSku];
        if (!existing || (item.totalQty || 0) > (existing.totalQty || 0)) {
          dedupedByNormalizedSku[normalizedSku] = item;
        }
      });
      const dedupedItems = Object.values(dedupedByNormalizedSku);
      
      const currentInventory = dedupedItems.map(item => {
        const weeklyVelocity = item.weeklyVel || 0;
        const dailyVelocity = weeklyVelocity / 7;
        const leadTimeDays = getLeadTime(item.sku);
        
        // Only adjust stock if data is old (daysElapsed > 0)
        const currentStock = daysElapsed > 0 
          ? Math.max(0, (item.totalQty || 0) - Math.round(dailyVelocity * daysElapsed))
          : (item.totalQty || 0);
        
        // Recalculate days of supply from TODAY
        const daysOfSupply = weeklyVelocity > 0 ? Math.round((currentStock / weeklyVelocity) * 7) : 999;
        
        // Recalculate dates from TODAY
        let stockoutDate = null;
        let reorderByDate = null;
        let daysUntilMustOrder = null;
        
        if (weeklyVelocity > 0 && daysOfSupply < 999) {
          const stockout = new Date(today);
          stockout.setDate(stockout.getDate() + daysOfSupply);
          stockoutDate = stockout.toISOString().split('T')[0];
          
          daysUntilMustOrder = daysOfSupply - reorderTriggerDays - leadTimeDays;
          const reorderBy = new Date(today);
          reorderBy.setDate(reorderBy.getDate() + daysUntilMustOrder);
          reorderByDate = reorderBy.toISOString().split('T')[0];
        }
        
        const suggestedOrderQty = item.suggestedOrderQty || Math.ceil(weeklyVelocity * minOrderWeeks);
        
        // Use pre-calculated urgency or derive consistently with inventory page
        // Match the inventory page health logic: dynamic thresholds based on reorder cycle
        let calculatedUrgency = 'healthy';
        if (dailyVelocity > 0) {
          if (daysUntilMustOrder < 0) calculatedUrgency = 'critical'; // Past reorder date
          else if (daysOfSupply < aiCriticalThreshold || daysUntilMustOrder < 7) calculatedUrgency = 'critical';
          else if (daysOfSupply < aiLowThreshold || daysUntilMustOrder < 14) calculatedUrgency = 'low';
          else if (daysOfSupply <= aiOverstockThreshold) calculatedUrgency = 'healthy';
          else calculatedUrgency = 'overstock';
        } else if (currentStock === 0) {
          calculatedUrgency = 'critical'; // No stock, no velocity
        }
        
        return {
          sku: item.sku,
          name: savedProductNames[item.sku] || item.name || item.sku,
          currentStock,
          amazonStock: item.amazonQty || 0,
          threeplStock: item.threeplQty || 0,
          awdStock: item.awdQty || 0,
          awdInbound: item.awdInbound || 0,
          amazonInbound: item.amazonInbound || 0,
          weeklyVelocity: Math.round(weeklyVelocity * 10) / 10,
          amzWeeklyVel: Math.round((item.amzWeeklyVel || 0) * 10) / 10,
          shopWeeklyVel: Math.round((item.shopWeeklyVel || 0) * 10) / 10,
          dailyVelocity: Math.round(dailyVelocity * 10) / 10,
          daysOfSupply,
          stockoutDate,
          reorderByDate,
          daysUntilMustOrder,
          suggestedOrderQty,
          calculatedUrgency,
          health: item.health,
          leadTimeDays,
          cost: getCogsCost(item.sku) || item.cost || 0,
          // Include demand metrics for AI context
          safetyStock: item.safetyStock || 0,
          reorderPoint: item.reorderPoint || 0,
          seasonalFactor: item.seasonalFactor || 1.0,
          cv: item.cv || 0,
          demandClass: item.demandClass || 'unknown',
          // Supply chain metrics
          abcClass: item.abcClass || 'C',
          turnoverRate: item.turnoverRate || 0,
          eoq: item.eoq || 0,
          sellThroughRate: item.sellThroughRate || 0,
          stockoutRisk: item.stockoutRisk || 0,
          annualCarryingCost: item.annualCarryingCost || 0,
        };
      });
      
      // Get production pipeline
      const pendingProduction = productionPipeline.map(p => ({
        sku: p.sku,
        quantity: p.quantity,
        expectedDate: p.expectedDate,
        daysUntilArrival: Math.ceil((new Date(p.expectedDate) - new Date()) / (1000 * 60 * 60 * 24)),
      }));
      
      const prompt = `You are an expert inventory planner. Review the pre-calculated inventory analysis and provide reorder recommendations.

## TODAY'S DATE: ${today.toISOString().split('T')[0]}

## REORDER SETTINGS
- Lead Time: ${leadTimeSettings.defaultLeadTimeDays} days (time from placing order to arrival)
- Target Buffer: ${reorderTriggerDays} days (want shipment to arrive when stock reaches this level)
- Minimum Order: ${minOrderWeeks} weeks of supply (${Math.round(minOrderWeeks / 4.3)} months)

## HOW REORDER DATES ARE CALCULATED:
- stockoutDate = Today + daysOfSupply (when stock hits 0)
- reorderByDate = Today + daysUntilMustOrder (when to place the order)
- Reorder point includes safety stock (Z=1.65, 95% service level) and seasonal adjustment
- safetyStock = units of buffer to protect against demand variability
- seasonalFactor = current month's demand relative to average (>1 = peak season, <1 = slow)
- cv = coefficient of variation (demand variability: smooth <0.5, lumpy 0.5-1.0, intermittent >1.0)
- suggestedOrderQty already includes safety stock buffer

## URGENCY LEVELS (dynamic thresholds based on reorder cycle — minOrderWeeks=${minOrderWeeks}, leadTime=${aiDefaultLeadTime}d):
- CRITICAL: daysUntilMustOrder < 0 (overdue!) OR daysOfSupply < ${aiCriticalThreshold} OR daysUntilMustOrder < 7
- REORDER: daysOfSupply < ${aiLowThreshold} OR daysUntilMustOrder < 14 (maps to "Low" on inventory page)
- HEALTHY: daysOfSupply ${aiLowThreshold}-${aiOverstockThreshold} AND daysUntilMustOrder >= 14
- MONITOR: daysOfSupply > ${aiOverstockThreshold} (overstock - excess capital tied up)

## SUPPLY CHAIN METRICS (per SKU):
- abcClass: A (top 80% revenue), B (next 15%), C (bottom 5%) — prioritize A-class items
- turnoverRate: annual turns (target 6×+ for DTC, 3-4× acceptable)
- eoq: Economic Order Quantity (optimal order size to minimize total cost)
- sellThroughRate: monthly sell-through % (>20% is good)
- stockoutRisk: 0-100 score combining days of supply, lead time, and demand variability
- annualCarryingCost: yearly cost of holding this inventory (25% of value)

## CURRENT INVENTORY (${currentInventory.length} SKUs) - ALL VALUES PRE-CALCULATED
${JSON.stringify(currentInventory.slice(0, 30), null, 2)}

## PENDING PRODUCTION ORDERS (${pendingProduction.length} orders)
${pendingProduction.length > 0 ? JSON.stringify(pendingProduction, null, 2) : 'No pending production orders'}

## IMPORTANT INSTRUCTIONS:
- Use the pre-calculated values (stockoutDate, reorderByDate, daysUntilMustOrder, suggestedOrderQty) - do NOT recalculate
- suggestedOrderQty is already set to ${minOrderWeeks} weeks of supply - use this value
- Factor in pending production: if production arrives before reorderByDate, it may change urgency
- For items with 0 velocity, mark as "monitor" or "healthy" based on stock levels

Respond with ONLY this JSON:
{
  "summary": {
    "criticalCount": number,
    "reorderCount": number,
    "healthyCount": number,
    "totalValue": number
  },
  "recommendations": [
    {
      "sku": "SKU code",
      "name": "Product name",
      "urgency": "critical" | "low" | "overstock" | "healthy",
      "action": "specific action to take",
      "currentStock": number,
      "daysOfSupply": number,
      "leadTimeDays": number,
      "weeklyVelocity": number,
      "suggestedOrderQty": number (use the pre-calculated value),
      "reorderDate": "use reorderByDate from input",
      "stockoutDate": "use stockoutDate from input", 
      "pendingProduction": number or null,
      "pendingArrivalDate": "date or null",
      "reasoning": "why this recommendation"
    }
  ],
  "alerts": ["urgent alert 1", "urgent alert 2"],
  "insights": "overall inventory health assessment"
}`;

      // Use unified AI helper that handles streaming
      const responseText = await callAI(prompt, 'You are an expert inventory planner for e-commerce. Provide specific, actionable reorder recommendations. Always respond with valid JSON only.');
      
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const inventory = JSON.parse(jsonMatch[0]);
        setAiForecastModule(prev => ({
          ...prev,
          inventory: { ...inventory, generatedAt: new Date().toISOString() },
          loading: null,
          lastUpdated: new Date().toISOString(),
        }));
        
        // Sync AI forecast results back to inventory snapshot
        const latestInvKey = Object.keys(invHistory).sort().reverse()[0];
        if (latestInvKey && invHistory[latestInvKey] && inventory.recommendations) {
          const aiDataBySku = {};
          
          // Also include the pre-calculated data we sent to the AI
          currentInventory.forEach(item => {
            aiDataBySku[item.sku] = {
              stockoutDate: item.stockoutDate,
              reorderByDate: item.reorderByDate,
              daysUntilMustOrder: item.daysUntilMustOrder,
              suggestedOrderQty: item.suggestedOrderQty,
              calculatedUrgency: item.calculatedUrgency,
              weeklyVelocity: item.weeklyVelocity,
              dailyVelocity: item.dailyVelocity,
            };
          });
          
          // Overlay AI recommendations (in case AI adjusted anything)
          inventory.recommendations.forEach(rec => {
            if (rec.sku) {
              aiDataBySku[rec.sku] = {
                ...aiDataBySku[rec.sku],
                urgency: rec.urgency,
                action: rec.action,
                aiStockoutDate: rec.stockoutDate,
                aiReorderDate: rec.reorderDate,
                aiSuggestedQty: rec.suggestedOrderQty,
                reasoning: rec.reasoning,
              };
            }
          });
          
          // Update inventory items with AI data
          const updatedItems = invHistory[latestInvKey].items.map(item => {
            const aiData = aiDataBySku[item.sku];
            if (aiData) {
              return {
                ...item,
                stockoutDate: aiData.stockoutDate || aiData.aiStockoutDate,
                reorderByDate: aiData.reorderByDate || aiData.aiReorderDate,
                daysUntilMustOrder: aiData.daysUntilMustOrder,
                suggestedOrderQty: aiData.suggestedOrderQty || aiData.aiSuggestedQty,
                aiUrgency: aiData.urgency || aiData.calculatedUrgency,
                aiAction: aiData.action,
                aiReasoning: aiData.reasoning,
                // Update weeklyVel if we calculated it
                weeklyVel: aiData.weeklyVelocity || item.weeklyVel,
              };
            }
            return item;
          });
          
          const updatedSnapshot = {
            ...invHistory[latestInvKey],
            items: updatedItems,
            aiForecast: {
              generatedAt: new Date().toISOString(),
              summary: inventory.summary,
              alerts: inventory.alerts,
              insights: inventory.insights,
            },
          };
          
          const updatedHistory = { ...invHistory, [latestInvKey]: updatedSnapshot };
          setInvHistory(updatedHistory);
          saveInv(updatedHistory);
        }
        
        setToast({ message: 'Inventory analysis complete & synced', type: 'success' });
      } else {
        devError('No JSON found in response:', responseText);
        throw new Error('Invalid response from AI');
      }
    } catch (error) {
      devError('Inventory AI error:', error);
      setAiForecastModule(prev => ({ ...prev, loading: null }));
      if (error.name === 'AbortError') {
        setToast({ message: 'Analysis timed out. Try again.', type: 'error' });
      } else {
        setToast({ message: `Analysis failed: ${error.message}`, type: 'error' });
      }
    }
  }, [invHistory, savedProductNames, savedCogs, productionPipeline, leadTimeSettings, getLeadTime]);
  
  // 3. CHANNEL FORECAST AI - Amazon or Shopify specific
  const generateChannelForecastAI = useCallback(async (channel = 'amazon') => {
    setAiForecastModule(prev => ({ ...prev, loading: channel }));
    
    try {
      // Filter to only weeks with actual revenue data
      const sortedWeeks = Object.keys(allWeeksData)
        .filter(w => (allWeeksData[w]?.total?.revenue || 0) > 0)
        .sort()
        .slice(-12);
      const sortedDays = Object.keys(allDaysData).filter(d => hasDailySalesData(allDaysData[d])).sort().slice(-30);
      
      const channelWeekly = sortedWeeks.map(w => {
        const data = allWeeksData[w]?.[channel] || {};
        return {
          weekEnding: w,
          revenue: data.revenue || 0,
          profit: data.netProfit || 0,
          units: data.units || 0,
          adSpend: data.adSpend || (channel === 'shopify' ? (data.metaSpend || 0) + (data.googleSpend || 0) : 0),
          margin: data.netMargin || data.margin || 0,
        };
      }).filter(w => w.revenue > 0); // Only include weeks with channel revenue
      
      const channelDaily = sortedDays.map(d => {
        const data = allDaysData[d]?.[channel] || {};
        return {
          date: d,
          revenue: data.revenue || 0,
          profit: data.netProfit || 0,
          units: data.units || 0,
        };
      }).filter(d => d.revenue > 0); // Only include days with channel revenue
      
      // Get Amazon forecasts if channel is amazon
      const amazonForecastData = channel === 'amazon' ? Object.entries(amazonForecasts)
        .filter(([week]) => new Date(week) > new Date())
        .slice(0, 4)
        .map(([week, data]) => ({
          weekEnding: week,
          amazonForecastedUnits: data.totals?.units || 0,
          amazonForecastedRevenue: data.totals?.revenue || 0,
        })) : [];
      
      const prompt = `You are an expert ${channel === 'amazon' ? 'Amazon' : 'Shopify'} channel analyst. Forecast performance for this specific channel.

## CHANNEL: ${channel.toUpperCase()}
## TODAY: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}

## ${channel.toUpperCase()} WEEKLY HISTORY (${channelWeekly.length} weeks)
${JSON.stringify(channelWeekly, null, 2)}

## ${channel.toUpperCase()} DAILY HISTORY (${channelDaily.length} days)
${JSON.stringify(channelDaily, null, 2)}

${channel === 'amazon' && amazonForecastData.length > 0 ? `## AMAZON'S OWN FORECAST (for comparison)
${JSON.stringify(amazonForecastData, null, 2)}` : ''}

Respond with ONLY this JSON:
{
  "channel": "${channel}",
  "nextWeek": {
    "revenue": { "low": number, "expected": number, "high": number },
    "profit": { "low": number, "expected": number, "high": number },
    "units": { "low": number, "expected": number, "high": number }
  },
  "nextMonth": {
    "revenue": number,
    "profit": number,
    "units": number
  },
  "trend": "up" | "stable" | "down",
  "growthRate": number (percentage),
  "confidence": "high" | "medium" | "low",
  "channelHealth": "excellent" | "good" | "fair" | "poor",
  "insights": ["insight 1", "insight 2"],
  "recommendations": ["recommendation 1", "recommendation 2"],
  ${channel === 'amazon' ? '"vsAmazonForecast": "how our AI prediction compares to Amazon\'s forecast",' : ''}
  "reasoning": "explanation of forecast"
}`;

      const responseText = await callAI(prompt, `You are an expert ${channel === 'amazon' ? 'Amazon marketplace' : 'Shopify/DTC'} analyst. Provide accurate channel-specific forecasts. Always respond with valid JSON only.`);
      
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const forecast = JSON.parse(jsonMatch[0]);
        setAiForecastModule(prev => ({
          ...prev,
          [channel]: { ...forecast, generatedAt: new Date().toISOString() },
          loading: null,
          lastUpdated: new Date().toISOString(),
        }));
      }
    } catch (error) {
      devError(`${channel} Forecast AI error:`, error);
      setAiForecastModule(prev => ({ ...prev, loading: null }));
    }
  }, [allWeeksData, allDaysData, amazonForecasts]);
  
  // 4. AI VS AMAZON COMPARISON - Compare predictions
  const generateForecastComparisonAI = useCallback(async () => {
    setAiForecastModule(prev => ({ ...prev, loading: 'comparison' }));
    
    try {
      // Get weeks where we have both Amazon forecast and actual data
      // IMPORTANT: Only include weeks that have ACTUALLY PASSED and have real sales data
      const today = new Date();
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      
      const comparisons = [];
      Object.keys(amazonForecasts).forEach(weekKey => {
        // Only compare weeks that have ended (in the past)
        if (weekKey >= todayKey) return; // Skip future/current weeks
        
        const forecast = amazonForecasts[weekKey];
        const actual = allWeeksData[weekKey];
        
        // Only include if we have BOTH forecast AND meaningful actual data
        const actualRevenue = actual?.amazon?.revenue || 0;
        const actualUnits = actual?.amazon?.units || 0;
        
        // Skip if actual data looks incomplete (no revenue)
        if (!actual || actualRevenue <= 0) return;
        
        const forecastRevenue = forecast.totals?.sales || forecast.totalSales || 0;
        const forecastUnits = forecast.totals?.units || forecast.totalUnits || 0;
        
        if (forecastRevenue > 0 || forecastUnits > 0) {
          comparisons.push({
            weekEnding: weekKey,
            amazonForecast: {
              revenue: forecastRevenue,
              units: forecastUnits,
            },
            actual: {
              revenue: actualRevenue,
              units: actualUnits,
            },
            variance: {
              revenuePercent: forecastRevenue > 0 ? (actualRevenue - forecastRevenue) / forecastRevenue * 100 : 0,
              unitsPercent: forecastUnits > 0 ? (actualUnits - forecastUnits) / forecastUnits * 100 : 0,
            },
          });
        }
      });
      
      // Get AI's past predictions
      const aiPredictions = aiLearningHistory.predictions.filter(p => p.actual !== undefined);
      
      const prompt = `You are an expert forecast analyst. Compare Amazon's forecasts vs actual results and analyze accuracy patterns.

## AMAZON FORECAST VS ACTUAL (${comparisons.length} weeks)
${JSON.stringify(comparisons, null, 2)}

## OUR AI'S PAST PREDICTIONS VS ACTUALS (${aiPredictions.length} records)
${aiPredictions.length > 0 ? JSON.stringify(aiPredictions.slice(-10), null, 2) : 'Not enough AI predictions yet for comparison'}

## CURRENT LEARNING CORRECTIONS
Revenue Correction Factor: ${forecastCorrections.overall?.revenue?.toFixed(3) || 'Not calculated'}
Units Correction Factor: ${forecastCorrections.overall?.units?.toFixed(3) || 'Not calculated'}
Confidence: ${forecastCorrections.confidence?.toFixed(1) || 0}%
Samples Used: ${forecastCorrections.samplesUsed || 0}

Analyze the data and respond with ONLY this JSON:
{
  "amazonAccuracy": {
    "averageRevenueError": number (percentage),
    "averageUnitsError": number (percentage),
    "bias": "overestimates" | "underestimates" | "balanced",
    "consistency": "high" | "medium" | "low"
  },
  "aiAccuracy": {
    "averageError": number or null,
    "improvement": "better than Amazon" | "similar" | "worse" | "not enough data"
  },
  "recommendedCorrection": {
    "revenue": number (multiplier),
    "units": number (multiplier),
    "confidence": number (0-100)
  },
  "patterns": ["pattern 1", "pattern 2"],
  "insights": "detailed analysis of forecast accuracy",
  "recommendations": ["how to improve forecasting"]
}`;

      const responseText = await callAI(prompt, 'You are an expert forecast accuracy analyst. Compare prediction models and identify improvement opportunities. Always respond with valid JSON only.');
      
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const comparison = JSON.parse(jsonMatch[0]);
        setAiForecastModule(prev => ({
          ...prev,
          comparison: { ...comparison, rawData: comparisons, generatedAt: new Date().toISOString() },
          loading: null,
          lastUpdated: new Date().toISOString(),
        }));
      }
    } catch (error) {
      devError('Forecast Comparison AI error:', error);
      setAiForecastModule(prev => ({ ...prev, loading: null }));
    }
  }, [amazonForecasts, allWeeksData, aiLearningHistory, forecastCorrections]);
  
  // Update learning when new actual data comes in
  const updateAILearning = useCallback(() => {
    // Find predictions that now have actual data
    const updatedPredictions = aiLearningHistory.predictions.map(pred => {
      if (pred.actual !== undefined) return pred; // Already has actual
      
      // Check if we now have actual data for this prediction
      if (pred.type === 'sales') {
        const predDate = new Date(pred.predictedAt);
        let actualData = null;
        
        if (pred.period === 'tomorrow') {
          const targetDate = new Date(predDate);
          targetDate.setDate(targetDate.getDate() + 1);
          const dateKey = formatDateKey(targetDate);
          if (allDaysData[dateKey] && hasDailySalesData(allDaysData[dateKey])) {
            actualData = {
              revenue: allDaysData[dateKey].total?.revenue || 0,
              profit: getProfit(allDaysData[dateKey].total),
              units: allDaysData[dateKey].total?.units || 0,
            };
          }
        } else if (pred.period === 'week') {
          // Find the week that ended after the prediction
          const sortedWeeks = Object.keys(allWeeksData).sort();
          const targetWeek = sortedWeeks.find(w => new Date(w) > predDate);
          if (targetWeek && allWeeksData[targetWeek]) {
            actualData = {
              revenue: allWeeksData[targetWeek].total?.revenue || 0,
              profit: getProfit(allWeeksData[targetWeek].total),
              units: allWeeksData[targetWeek].total?.units || 0,
            };
          }
        }
        
        if (actualData) {
          return {
            ...pred,
            actual: actualData,
            accuracy: {
              revenueError: pred.prediction?.revenue?.expected ? 
                ((actualData.revenue - pred.prediction.revenue.expected) / pred.prediction.revenue.expected * 100) : null,
              profitError: pred.prediction?.profit?.expected ?
                ((actualData.profit - pred.prediction.profit.expected) / pred.prediction.profit.expected * 100) : null,
            },
          };
        }
      }
      return pred;
    });
    
    // Only update if something changed
    const hasUpdates = updatedPredictions.some((pred, i) => 
      pred.actual !== undefined && aiLearningHistory.predictions[i]?.actual === undefined
    );
    
    if (hasUpdates) {
      setAiLearningHistory(prev => ({ ...prev, predictions: updatedPredictions }));
    }
  }, [aiLearningHistory, allDaysData, allWeeksData]);
  
  // Auto-update learning when data changes
  useEffect(() => {
    updateAILearning();
  }, [allDaysData, allWeeksData]);
  
  // ============ END MODULAR AI FORECAST SYSTEM ============

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

  const exportWeeklyDataCSV = (dateRange) => {
    const sortedWeeks = Object.keys(allWeeksData).sort().filter(w => {
      if (!dateRange) return true;
      return w >= dateRange.start && w <= dateRange.end;
    });
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
    const suffix = dateRange ? `_${dateRange.start}_to_${dateRange.end}` : '';
    exportToCSV(data, `weekly_sales${suffix}`, ['Week Ending', 'Total Revenue', 'Total Profit', 'Total Units', 'Amazon Revenue', 'Amazon Profit', 'Shopify Revenue', 'Shopify Profit', 'Total Ad Spend', 'Notes']);
  };

  const exportSKUDataCSV = (dateRange) => {
    const skuMap = {};
    // Include weekly data (primarily 2026)
    Object.entries(allWeeksData).forEach(([week, data]) => {
      // Filter by date range if provided
      if (dateRange && (week < dateRange.start || week > dateRange.end)) return;
      [...(data.amazon?.skuData || []), ...(data.shopify?.skuData || [])].forEach(s => {
        if (!skuMap[s.sku]) skuMap[s.sku] = { sku: s.sku, name: savedProductNames[s.sku] || s.name || '', totalUnits: 0, totalRevenue: 0, totalProfit: 0, periods: 0 };
        skuMap[s.sku].totalUnits += s.unitsSold || 0;
        skuMap[s.sku].totalRevenue += s.netSales || 0;
        skuMap[s.sku].totalProfit += s.netProceeds || (s.netSales || 0) - (s.cogs || 0);
        skuMap[s.sku].periods += 1;
      });
    });
    // Include period data (2024 quarterly, 2025 monthly) - only if no date range or date range covers it
    if (!dateRange) {
      Object.entries(allPeriodsData).forEach(([period, data]) => {
        // Skip yearly totals to avoid double-counting
        if (/^\d{4}$/.test(period)) return;
        [...(data.amazon?.skuData || []), ...(data.shopify?.skuData || [])].forEach(s => {
          if (!skuMap[s.sku]) skuMap[s.sku] = { sku: s.sku, name: savedProductNames[s.sku] || s.name || '', totalUnits: 0, totalRevenue: 0, totalProfit: 0, periods: 0 };
          skuMap[s.sku].totalUnits += s.unitsSold || 0;
          skuMap[s.sku].totalRevenue += s.netSales || 0;
          skuMap[s.sku].totalProfit += s.netProceeds || (s.netSales || 0) - (s.cogs || 0);
          skuMap[s.sku].periods += 1;
        });
      });
    }
    const data = Object.values(skuMap).map(s => ({
      'SKU': s.sku,
      'Product Name': s.name,
      'Total Units': s.totalUnits,
      'Total Revenue': s.totalRevenue.toFixed(2),
      'Total Profit': s.totalProfit.toFixed(2),
      'Periods Active': s.periods,
      'Avg Units/Period': (s.totalUnits / s.periods).toFixed(1),
    }));
    const suffix = dateRange ? `_${dateRange.start}_to_${dateRange.end}` : '';
    exportToCSV(data, `sku_performance${suffix}`, ['SKU', 'Product Name', 'Total Units', 'Total Revenue', 'Total Profit', 'Periods Active', 'Avg Units/Period']);
  };

  const exportInventoryCSV = (dateRange) => {
    // Find inventory snapshot within date range, or use latest
    const sortedDates = Object.keys(invHistory).sort();
    let targetDate = sortedDates[sortedDates.length - 1]; // Default to latest
    
    if (dateRange) {
      // Find the latest inventory date within the range
      const datesInRange = sortedDates.filter(d => d >= dateRange.start && d <= dateRange.end);
      if (datesInRange.length > 0) {
        targetDate = datesInRange[datesInRange.length - 1];
      }
    }
    
    if (!targetDate) return;
    const inv = invHistory[targetDate];
    const items = inv.items || [...(inv.fba || []), ...(inv.threepl || [])];
    const data = items.map(i => ({
      'SKU': i.sku,
      'Product Name': i.name || savedProductNames[i.sku] || '',
      'Amazon FBA': i.amazonQty || i.quantity || i.units || 0,
      '3PL': i.threeplQty || 0,
      'Total Units': i.totalQty || (i.amazonQty || 0) + (i.threeplQty || 0),
      'COGS': getCogsCost(i.sku) || i.cost || 0,
      'Total Value': i.totalValue || (((i.totalQty || 0) * (i.cost || getCogsCost(i.sku) || 0))).toFixed(2),
      'Days of Supply': i.daysOfSupply || '',
      'Stockout Date': i.stockoutDate || '',
      'Health Status': i.health || '',
      'Snapshot Date': targetDate,
    }));
    const suffix = dateRange ? `_${targetDate}` : '';
    exportToCSV(data, `inventory${suffix}`, ['SKU', 'Product Name', 'Amazon FBA', '3PL', 'Total Units', 'COGS', 'Total Value', 'Days of Supply', 'Stockout Date', 'Health Status', 'Snapshot Date']);
  };

  // UI Components
  const FileBox = ({ type, label, desc, req, isInv }) => {
    const fs = isInv ? invFiles : files, fn = isInv ? invFileNames : fileNames;
    const isMulti3PL = type === 'threepl' && !isInv;
    const hasFile = isMulti3PL ? (fs.threepl?.length > 0) : fs[type];
    const displayName = isMulti3PL ? (fn.threepl?.length > 0 ? `${fn.threepl.length} file(s)` : '') : fn[type];
    const acceptTypes = type === 'threepl' ? '.csv,.xlsx,.xls' : '.csv';
    
    return (
      <div className={`relative border-2 border-dashed rounded-xl p-4 ${hasFile ? 'border-emerald-400 bg-emerald-950/30' : 'border-slate-600 hover:border-slate-400 bg-slate-800/30'}`}>
        <input type="file" accept={acceptTypes} onChange={(e) => handleFile(type, e.target.files[0], isInv)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
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
    const acceptTypes = type === 'threepl' ? '.csv,.xlsx,.xls' : '.csv';
    
    return (
      <div className={`relative border-2 border-dashed rounded-xl p-4 ${hasFile ? 'border-emerald-400 bg-emerald-950/30' : 'border-slate-600 hover:border-slate-400 bg-slate-800/30'}`}>
        <input type="file" accept={acceptTypes} onChange={(e) => handlePeriodFile(type, e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
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



  // ChannelCard extracted to separate component




  // GoalsCard extracted to separate component


  // NavTabs extracted to separate component

  const dataBar = useMemo(() => (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4 sm:mb-6 p-3 sm:p-4 bg-slate-800/50 rounded-xl border border-slate-700">
      {/* Store Selector */}
      {session && stores.length > 0 && (
        <button 
          onClick={() => setShowStoreSelector(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/50 rounded-lg text-sm text-violet-300"
        >
          <Store className="w-4 h-4" />
          <span className="max-w-[120px] truncate">{stores.find(s => s.id === activeStoreId)?.name || storeName || 'My Store'}</span>
          <ChevronRight className="w-3 h-3" />
        </button>
      )}
      <div className="flex items-center gap-2 text-slate-400 text-xs sm:text-sm"><Database className="w-4 h-4" /><span>{Object.keys(allDaysData).length}d | {Object.keys(allWeeksData).length}w | {Object.keys(allPeriodsData).length}p</span></div>
      
      {/* Forecast Status Indicators */}
      <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-900/50 rounded-lg border border-slate-700">
        <Target className="w-3 h-3 text-amber-400" />
        {['7day', '30day', '60day'].map(type => {
          const status = dataStatus.forecastStatus[type];
          const label = type === '7day' ? '7d' : type === '30day' ? '30d' : '60d';
          return (
            <span key={type} className={`text-xs px-1.5 py-0.5 rounded ${
              status.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
              status.status === 'expiring' ? 'bg-amber-500/20 text-amber-400' :
              status.status === 'expired' ? 'bg-rose-500/20 text-rose-400' :
              'bg-slate-700 text-slate-500'
            }`} title={status.status === 'active' ? `${status.daysUntilExpiry} days left` : status.status}>
              {label}
            </span>
          );
        })}
      </div>
      
      <div className="hidden sm:flex items-center gap-2">
        {Object.keys(savedCogs).length > 0 ? <span className="text-emerald-400 text-xs flex items-center gap-1"><Check className="w-3 h-3" />{Object.keys(savedCogs).length} SKUs</span> : <span className="text-amber-400 text-xs">No COGS</span>}
        <button onClick={() => setShowCogsManager(true)} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white flex items-center gap-1"><Settings className="w-3 h-3" />COGS</button>
        <button onClick={() => setShowProductCatalog(true)} className="px-2 py-1 bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/50 rounded text-xs text-violet-300 flex items-center gap-1"><Package className="w-3 h-3" />Catalog{Object.keys(savedProductNames).length > 0 && <span className="text-violet-400">✓</span>}</button>
      </div>
      <button onClick={() => setShowGoalsModal(true)} className="hidden sm:flex px-2 py-1 bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/50 rounded text-xs text-amber-300 items-center gap-1"><Target className="w-3 h-3" />Goals</button>
      <div className="hidden md:flex items-center gap-2">
        <span className="text-slate-400 text-sm">Store:</span>
        <input 
          key={`store-name-${activeStoreId || 'default'}`}
          defaultValue={storeName} 
          onBlur={(e) => {
            if (e.target.value !== storeName) {
              setStoreName(e.target.value);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.target.blur();
            }
          }}
          placeholder="Your brand name"
          className="bg-slate-900 border border-slate-600 rounded-lg px-2 py-1 text-sm text-white w-44" />
      </div>
      <div className="flex-1" />
      <PrintButton title="Print Report" onPrint={() => {
        const hasDaily = Object.keys(allDaysData).length > 0;
        const hasWeekly = Object.keys(allWeeksData).length > 0;
        const hasInv = Object.keys(invHistory).length > 0;
        if (hasDaily) printDailySummary({ storeName, allDaysData });
        else if (hasWeekly) printProfitability({ storeName, allWeeksData, allDaysData, savedCogs });
        else if (hasInv) printInventory({ storeName, invHistory, savedCogs, appSettings });
        else setToast({ message: 'No data to print yet. Upload some data first.', type: 'warning' });
      }} />
      <button onClick={exportAll} className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white"><Download className="w-4 h-4" /><span className="hidden sm:inline">Export</span></button>
      <label className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white cursor-pointer"><Upload className="w-4 h-4" /><span className="hidden sm:inline">Import</span><input type="file" accept=".json" onChange={(e) => e.target.files[0] && importData(e.target.files[0])} className="hidden" /></label>
      <button onClick={() => setShowAuditLog(true)} className="flex items-center gap-2 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-400 hover:text-white transition-colors" title="Activity Log"><Clock className="w-4 h-4" /></button>
      <NotificationCenter salesTaxConfig={salesTaxConfig} inventoryData={invHistory?.[Object.keys(invHistory || {}).sort().pop()]?.items || []} allDaysData={allDaysData} appSettings={appSettings} lastBackupDate={lastBackupDate} setView={setView} setToast={setToast} />
    </div>
  ), [allWeeksData, allDaysData, allPeriodsData, savedCogs, savedProductNames, storeName, isLocked, cloudStatus, session, stores, activeStoreId, dataStatus, salesTaxConfig, invHistory, appSettings, lastBackupDate]);

  // Day Details Modal - shows detailed breakdown for a specific day
  const [editingDayAdSpend, setEditingDayAdSpend] = useState(false);
  const [dayAdSpendEdit, setDayAdSpendEdit] = useState({ meta: '', google: '' });
  
  // DayDetailsModal extracted to separate component

    // CogsManager extracted to separate component

  // Product Catalog Modal - maps SKUs to product names for AI
  // Upload Help Modal
  // FORECAST MODAL (Feature 5)
  // CSV EXPORT MODAL (Feature 10)
  // 3PL BULK UPLOAD MODAL - Now extracted to ThreePLBulkUploadModal component

    // ADS BULK UPLOAD MODAL - Now extracted to AdsBulkUploadModal component

    // AMAZON ADS BULK UPLOAD MODAL - Now extracted to AmazonAdsBulkUploadModal component

    // CONFLICT RESOLUTION MODAL (Multi-device sync)
  // DASHBOARD WIDGET CONFIGURATION MODAL with Drag & Drop - Now extracted to WidgetConfigModal

  // INVOICE/BILLS MODAL - Now extracted to InvoiceModal component

    // COMPARISON MODAL (Feature 12)
  // NOTES COMPONENT (Feature 8) - Now extracted to WeekNoteEditor

  const hasCogs = Object.keys(savedCogs).length > 0;
  
  // AI Chat - Prepare data context (extracted to utils/aiContextBuilder.js)
  const prepareCtx = () => prepareDataContext({
    allDaysData, allWeeksData, allPeriodsData,
    savedProductNames, savedCogs, invHistory,
    forecastCorrections, amazonForecasts, leadTimeSettings,
    storeName, salesTaxConfig, threeplLedger,
    goals, bankingData, aiLearningHistory,
    getProfit, get3PLForPeriod,
  });
  
  // Send AI Message - defined at component level, not nested
  const sendAIMessage = async (directMessage) => {
    const userMessage = directMessage || aiInput.trim();
    if (!userMessage || aiLoading) return;
    if (!directMessage) setAiInput('');
    setAiMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setAiLoading(true);
    
    try {
      const ctx = prepareCtx();
      
      // Build alerts summary for AI — each section wrapped so one bad calculation doesn't kill chat
      const alertsSummary = [];
      try {
        if (ctx.inventory?.lowStockItems?.length > 0) {
          alertsSummary.push(`LOW STOCK ALERT: ${ctx.inventory.lowStockItems.length} products need reorder (${ctx.inventory.lowStockItems.map(i => i.sku).join(', ')})`);
        }
        const criticalReorders = [...(ctx.inventory?.urgentReorder || []), ...(ctx.inventory?.needsReorderSoon || [])];
        if (criticalReorders.length > 0) {
          alertsSummary.push(`🚨 REORDER DEADLINES: ${criticalReorders.map(i => 
            `${i.sku} (${i.daysUntilMustOrder !== undefined && i.daysUntilMustOrder <= 0 ? 'OVERDUE' : (i.daysUntilMustOrder || '?') + ' days left'}${i.daysOverdue ? ', ' + i.daysOverdue + ' days overdue' : ''})`
          ).join(', ')}`);
        }
        if (ctx.salesTax?.nexusStates?.length > 0) {
          alertsSummary.push(`Sales tax nexus in ${ctx.salesTax.nexusStates.length} states: ${ctx.salesTax.nexusStates.map(s => s.state).join(', ')}`);
        }
        if (ctx.insights?.allTimeRevenue > 0) {
          const amazonShare = ctx.weeklyData.reduce((s, w) => s + (w.amazonRevenue || 0), 0) / ctx.insights.allTimeRevenue * 100;
          if (amazonShare > 90) {
            alertsSummary.push(`CHANNEL CONCENTRATION: ${amazonShare.toFixed(0)}% of revenue from Amazon - consider diversifying`);
          }
        }
        const ledgerOrders = Object.values(threeplLedger?.orders || {});
        if (ledgerOrders.length > 100) {
          let total3PL = 0;
          ledgerOrders.forEach(o => {
            const c = o.charges || {};
            total3PL += (c.firstPick || 0) + (c.additionalPick || 0) + (c.box || 0);
          });
          const avgCostPerOrder = total3PL / ledgerOrders.length;
          if (avgCostPerOrder > 12) {
            alertsSummary.push(`3PL COSTS ELEVATED: Avg $${avgCostPerOrder.toFixed(2)}/order - review fulfillment efficiency`);
          }
        }
      } catch (alertErr) { devWarn('AI chat: alerts section failed, continuing:', alertErr.message); }
      
      // Forecast data — safe defaults if assembly fails
      let forecastData = null;
      let multiSignalForecast = null;
      let forecastAccuracy = { records: [], summary: null };
      try {
        forecastData = enhancedForecast ? {
          nextMonth: enhancedForecast.monthly,
          originalNextMonth: enhancedForecast.originalMonthly,
          trend: generateForecast?.trend,
          confidence: generateForecast?.confidence,
          weekly: enhancedForecast.weekly,
          corrected: enhancedForecast.corrected,
          correctionNote: enhancedForecast.correctionNote,
          learningStatus: enhancedForecast.learningStatus,
        } : generateForecast ? {
          nextMonth: generateForecast.monthly,
          trend: generateForecast.trend,
          confidence: generateForecast.confidence,
          weekly: generateForecast.weekly
        } : null;
        
        multiSignalForecast = aiForecasts?.salesForecast ? {
          nextWeek: aiForecasts.salesForecast.next4Weeks?.[0] || null,
          next4Weeks: aiForecasts.salesForecast.next4Weeks || [],
          signals: aiForecasts.calculatedSignals || {},
          dataPoints: aiForecasts.dataPoints || {},
          generatedAt: aiForecasts.generatedAt,
          methodology: 'Weighted: 60% daily trends (last 7 days), 20% weekly averages, 20% Amazon forecasts (if available)',
        } : null;
        
        const records = forecastAccuracyHistory?.records || [];
        const withActuals = records.filter(r => r.actualRevenue !== undefined);
        forecastAccuracy = {
          records: records.slice(-20),
          summary: withActuals.length === 0 
            ? (records.length === 0 ? null : { message: 'No actuals recorded yet - waiting for weeks to complete' })
            : (() => {
                const avgRevenueError = withActuals.reduce((s, r) => {
                  const error = r.forecastRevenue > 0 ? Math.abs(r.actualRevenue - r.forecastRevenue) / r.forecastRevenue * 100 : 0;
                  return s + error;
                }, 0) / withActuals.length;
                const avgBias = withActuals.reduce((s, r) => {
                  const bias = r.forecastRevenue > 0 ? (r.actualRevenue - r.forecastRevenue) / r.forecastRevenue * 100 : 0;
                  return s + bias;
                }, 0) / withActuals.length;
                return {
                  samplesWithActuals: withActuals.length,
                  avgAccuracy: (100 - avgRevenueError).toFixed(1) + '%',
                  avgBias: (avgBias > 0 ? '+' : '') + avgBias.toFixed(1) + '% (positive = forecasts too low)',
                  recentTrend: withActuals.slice(-5).map(r => ({
                    week: r.weekEnding,
                    forecast: r.forecastRevenue,
                    actual: r.actualRevenue,
                    error: r.forecastRevenue > 0 ? ((r.actualRevenue - r.forecastRevenue) / r.forecastRevenue * 100).toFixed(1) + '%' : 'N/A'
                  }))
                };
              })(),
        };
      } catch (forecastErr) { devWarn('AI chat: forecast section failed, continuing:', forecastErr.message); }
      
      // Week notes
      const notesData = Object.entries(weekNotes || {}).filter(([k, v]) => v).map(([week, note]) => ({ week, note }));
      
      // Re-derive sortedDays for use in system prompt (prepareDataContext's sortedDays is out of scope)
      const sortedDays = Object.keys(allDaysData).filter(d => hasDailySalesData(allDaysData[d])).sort();
      
      const systemPrompt = buildChatSystemPrompt(ctx, {
        allDaysData, allWeeksData, sortedDays, savedProductNames,
        amazonCampaigns, amazonForecasts, forecastMeta,
        threeplLedger, goals, bankingData,
        productionPipeline, forecastAccuracy,
        forecastCorrections, alertsSummary, notesData,
      });

      const aiResponse = await callAI({
        system: systemPrompt,
        messages: [...aiMessages.slice(-10).map(m => ({ role: m.role, content: m.content })), { role: 'user', content: userMessage }],
      }, '', aiChatModel);
      
      setAiMessages(prev => [...prev, { role: 'assistant', content: aiResponse || 'Sorry, I could not process that.' }]);
    } catch (error) {
      devError('AI Chat error:', error);
      const errorMsg = error.message?.includes('API error') 
        ? `API Error: ${error.message}` 
        : error.message?.includes('API_KEY') 
          ? 'ANTHROPIC_API_KEY not configured on server. Add it to Vercel Environment Variables.'
          : `Error: ${error.message || 'Unknown error'}. Check browser console for details.`;
      setAiMessages(prev => [...prev, { role: 'assistant', content: errorMsg }]);
    } finally {
      setAiLoading(false);
    }
  };

  // Send AI Ads Message - Elite PPC analysis with memory + token efficiency
  const sendAdsAIMessage = async (directMessage) => {
    const userMessage = directMessage || adsAiInput.trim();
    if (!userMessage || adsAiLoading) return;
    if (!directMessage) setAdsAiInput('');
    setAdsAiMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setAdsAiLoading(true);
    
    try {
      // ── Determine request type for smart token allocation ──
      const isAuditRequest = /comprehensive|full audit|action plan|deep dive|generate.*report|all.*data|complete.*analysis|weekly.*review/i.test(userMessage);
      const isFirstMessage = adsAiMessages.length === 0;
      const needsFullContext = isFirstMessage || isAuditRequest;
      
      // Opus gets 16K for audits, Sonnet 12K, Haiku 8K (their sweet spots)
      const tier = getModelTier(aiChatModel);
      const budgets = AI_TOKEN_BUDGETS[tier];
      const tokenBudget = needsFullContext ? budgets.audit : budgets.followUp;
      
      // ── SYSTEM PROMPT: Instructions only (cacheable, no data) ──
      const systemPrompt = `You are a $15,000/month Amazon PPC strategist and multi-channel advertising expert performing analysis for Tallowbourn, a tallow-based skincare brand selling lip balms, body balms, and natural deodorant through Amazon and Shopify (DTC).

BUSINESS CONTEXT:
- Brand: Tallowbourn (premium tallow skincare — niche, health-conscious audience)
- Channels: Amazon (primary revenue) + Shopify DTC
- Products: Natural tallow lip balm, body balm, deodorant
- Ad platforms: Amazon Ads (SP/SB/SD), Google Ads, Meta Ads
- Key competitive space: natural/organic skincare, tallow skincare, clean beauty

YOUR ANALYSIS STANDARDS:
You produce reports that would justify a $15K/month retainer. Every recommendation must pass this test: "Would a CMO pay for this insight, or could they have Googled it?"

HARD RULES — NON-NEGOTIABLE:
1. CITE SPECIFIC DATA: Every claim must reference actual campaign names, search terms, ASINs, dollar amounts, and percentages from the provided data
2. SHOW THE MATH: "Search term 'tallow lip balm' spent $147 over 30d with 0 orders → $4.90/day wasted → $147/month savings if negated"
3. NO VAGUE LANGUAGE: Never say "consider", "you might", "look into", "it could be beneficial" — say DO THIS or STOP THIS
4. PRIORITIZE BY DOLLAR IMPACT: Lead with highest-savings or highest-revenue-potential items
5. IMPLEMENTATION STEPS: For every action, give exact click-path in Amazon/Google/Meta ad console
6. MATCH TYPE MATTERS: Always specify exact/phrase/broad for keyword recommendations
7. CROSS-REFERENCE: Compare SP vs SB vs SD efficiency, TOS vs RoS vs Product Pages, paid vs organic share
8. MISSING DATA: When data is insufficient, state exactly which report to download and upload
9. BID SPECIFICS: Include exact bid amounts, not just "increase bids"
10. TIME-BOUND: Every recommendation gets a "do by" date (this week / next 7 days / next 30 days)

FOR FULL AUDIT/ACTION PLAN REQUESTS — USE THIS STRUCTURE:

## 📊 EXECUTIVE SUMMARY
- Ad health score (1-10) with specific justification
- Total spend, revenue, blended ROAS, TACOS across all channels
- #1 urgent problem (with dollar impact) and #1 biggest opportunity

## 🔴 STOP: Cut Waste (This Week)
Each item: KEYWORD/CAMPAIGN → EXACT SPEND & TIMEFRAME → ZERO OR LOW SALES → SPECIFIC ACTION (negative match type, pause, reduce bid to $X) → MONTHLY SAVINGS

## 🟢 PROTECT: What's Working
Each item: KEYWORD/CAMPAIGN → ROAS, ACOS, CONV RATE → DEFEND STRATEGY (budget floor, bid floor, exact match isolation)

## 🚀 SCALE: Growth Opportunities  
Each item: OPPORTUNITY → MATH ("converting at X% with $Y/day — scaling to $Z/day projects $W additional revenue at similar ROAS") → STEP-BY-STEP LAUNCH PLAN

## 🔄 PLACEMENT OPTIMIZATION
TOS vs Product Pages vs RoS: ROAS comparison → Specific bid modifier recommendations with exact percentages

## 💰 BUDGET REALLOCATION
Current split → Recommended split with dollar amounts and rationale

## 📈 TREND DIAGNOSIS  
MoM trajectory with % changes, TACOS trend (growing ad-dependence?), seasonal preparation

## 🎯 THIS WEEK: Top 5 Priority Actions
1. [Specific action] → [$X impact] → [Y minutes to implement] → [Exact steps]

FOR FOLLOW-UP QUESTIONS:
Reference the full data from the prior analysis. Be concise but still specific with numbers. If asking about a specific campaign or keyword, zoom in on that data point.`;

      // ── USER MESSAGE: Data context + question (changes per request) ──
      let dataBlock = '';
      
      if (needsFullContext) {
        // Full data dump for comprehensive analysis
        const sortedDays = Object.keys(allDaysData || {}).sort();
        const last30Days = {};
        sortedDays.slice(-30).forEach(d => { last30Days[d] = allDaysData[d]; });
        
        // Primary: New Tier 2 comprehensive prompt (from adsReportParser)
        dataBlock = buildComprehensiveAdsPrompt(adsIntelData, last30Days, amazonCampaigns);
        
        // Append old-format intel if available and not redundant
        const oldContext = buildAdsIntelContext(adsIntelData);
        if (oldContext && !dataBlock.includes('SP SEARCH TERM')) {
          dataBlock += '\n' + oldContext;
        }
        const dtcContext = buildDtcIntelContext(dtcIntelData);
        if (dtcContext) dataBlock += '\n' + dtcContext;
        
        // ── Inject prior report memory for continuity ──
        if (adsAiReportHistory.length > 0) {
          const priorSummaries = adsAiReportHistory.slice(-3).map((r, i) => 
            `Report ${i + 1} (${r.date}): Health ${r.healthScore || '?'}/10 | Key issues: ${r.keyIssues || 'N/A'} | Actions taken: ${r.actionsTaken || 'pending'}`
          ).join('\n');
          dataBlock += `\n\n## PRIOR REPORT MEMORY (for tracking progress)\n${priorSummaries}\nCompare current data against these prior findings. Note what improved, what got worse, and what's stagnant.`;
        }
        
        // ── Build data sources manifest so AI cites its sources ──
        const sourcesList = [];
        const sortedDaysLocal = Object.keys(allDaysData || {}).sort();
        if (sortedDaysLocal.length > 0) sourcesList.push(`• Dashboard Daily KPIs: ${sortedDaysLocal.length} days (${sortedDaysLocal[0]} to ${sortedDaysLocal[sortedDaysLocal.length-1]}) — SP-API + Shopify`);
        if (amazonCampaigns?.campaigns?.length > 0) {
          const activeCamps = amazonCampaigns.campaigns.filter(c => c.state === 'ENABLED' && (c.spend || 0) > 0);
          const lastUpdated = amazonCampaigns.lastUpdated ? ` (uploaded ${amazonCampaigns.lastUpdated.slice(0, 10)})` : '';
          sourcesList.push(`• Amazon Campaign CSV${lastUpdated}: ${amazonCampaigns.campaigns.length} campaigns (${activeCamps.length} active with spend)`);
        }
        if (adsIntelData) {
          ['amazon','google','meta','shopify'].forEach(plat => {
            if (!adsIntelData[plat] || typeof adsIntelData[plat] !== 'object') return;
            Object.entries(adsIntelData[plat]).forEach(([reportType, data]) => {
              if (!data?.records) return;
              const label = data.meta?.label || reportType.replace(/_/g,' ');
              sourcesList.push(`• ${plat.charAt(0).toUpperCase()+plat.slice(1)} ${label}: ${data.records.length} rows (uploaded ${data.meta?.uploadedAt?.slice(0,10) || 'unknown'})`);
            });
          });
        }
        if (sourcesList.length > 0) {
          dataBlock += `\n\n## DATA SOURCES ANALYZED\n${sourcesList.join('\n')}\n\nIMPORTANT: Begin your report with a "📂 Sources Analyzed" section listing these exact data sources so the reader knows what the analysis is based on. If critical data is MISSING (e.g., no search terms, no placement data), call it out explicitly as a gap.`;
        }
      } else {
        // Lightweight context for follow-ups — compressed weekly summary
        const sortedDays = Object.keys(allDaysData || {}).sort();
        const last14 = sortedDays.slice(-14);
        let rSpend = 0, rRev = 0, rGoog = 0, rMeta = 0, rAmzSpend = 0;
        last14.forEach(d => {
          const day = allDaysData[d];
          rAmzSpend += (day?.amazon?.adSpend || 0);
          rGoog += (day?.shopify?.googleSpend || day?.googleSpend || 0);
          rMeta += (day?.shopify?.metaSpend || day?.metaSpend || 0);
          rRev += (day?.amazon?.revenue || 0) + (day?.shopify?.revenue || 0);
        });
        rSpend = rAmzSpend + rGoog + rMeta;
        const rAcos = rRev > 0 ? ((rAmzSpend / rRev) * 100).toFixed(1) : 'N/A';
        dataBlock = `[14-day snapshot: Amazon $${rAmzSpend.toFixed(0)} spend (ACOS ${rAcos}%), Google $${rGoog.toFixed(0)}, Meta $${rMeta.toFixed(0)}. Total spend $${rSpend.toFixed(0)}, revenue $${rRev.toFixed(0)}, blended ROAS ${rSpend > 0 ? (rRev/rSpend).toFixed(2) : 'N/A'}x. Full data was provided in the first message of this conversation.]`;
      }
      
      // Build message with data separated from question
      const userContent = needsFullContext 
        ? `Here is my current advertising data:\n\n${dataBlock}\n\n---\n\nMy request: ${userMessage}`
        : `${dataBlock}\n\n${userMessage}`;

      // ── Send with smart token budget ──
      // Truncate conversation history to prevent unbounded token growth
      // Keep first message (establishes context) + last 6 exchanges for continuity
      const trimmedHistory = adsAiMessages.length <= 8 
        ? adsAiMessages.map(m => ({ role: m.role, content: m.content }))
        : [
            ...adsAiMessages.slice(0, 2).map(m => ({ role: m.role, content: m.content })),
            { role: 'assistant', content: '[...earlier analysis truncated for token efficiency — key findings retained above...]' },
            ...adsAiMessages.slice(-6).map(m => ({ role: m.role, content: m.content })),
          ];
      
      const aiResponse = await callAI({
        system: systemPrompt,
        messages: [...trimmedHistory, { role: 'user', content: userContent }],
      }, '', aiChatModel, tokenBudget);
      
      const responseText = aiResponse || 'Sorry, I could not process that.';
      setAdsAiMessages(prev => [...prev, { role: 'assistant', content: responseText }]);
      
      // ── Auto-save report summary for future memory ──
      if (isAuditRequest || isFirstMessage) {
        // Extract health score if present
        const healthMatch = responseText.match(/health.*?(\d+)\s*\/\s*10|score.*?(\d+)\s*\/\s*10|(\d+)\s*\/\s*10/i);
        const healthScore = healthMatch ? (healthMatch[1] || healthMatch[2] || healthMatch[3]) : null;
        
        // Extract key issues (first few bullet points from STOP section)
        const stopSection = responseText.match(/##.*?STOP.*?\n([\s\S]*?)(?=##|$)/i);
        const keyIssues = stopSection 
          ? stopSection[1].split('\n').filter(l => l.trim().startsWith('-') || l.trim().startsWith('*')).slice(0, 3).map(l => l.replace(/^[\s\-\*]+/, '').substring(0, 80)).join('; ')
          : 'See report';
        
        setAdsAiReportHistory(prev => [...prev, {
          date: new Date().toISOString().slice(0, 10),
          model: getModelLabel(aiChatModel),
          healthScore,
          keyIssues,
          actionsTaken: 'pending', // User can update this
          tokenBudget,
        }]);
      }
    } catch (error) {
      devError('Ads AI Chat error:', error);
      setAdsAiMessages(prev => [...prev, { role: 'assistant', content: `Error: ${error.message}. Try a simpler question.` }]);
    } finally {
      setAdsAiLoading(false);
    }
  };

  // Auto-trigger action plan generation after upload
  useEffect(() => {
    if (pendingAdsAnalysisRef.current && showAdsAIChat && view === 'ads' && !adsAiLoading) {
      pendingAdsAnalysisRef.current = false;
      const autoPrompt = `Generate my complete Amazon Ads Action Plan. Analyze ALL of the data I've uploaded — search terms, placements, targeting, campaigns, daily performance, business reports, organic queries — everything. Tell me exactly what's working, what's wasting money, and give me a specific prioritized action plan I can implement this week. Include dollar amounts for every recommendation.`;
      setTimeout(() => sendAdsAIMessage(autoPrompt), 300);
    }
  }, [showAdsAIChat, view]);

  // Save weekly reports to localStorage
  useEffect(() => {
    safeLocalStorageSet(WEEKLY_REPORTS_KEY, JSON.stringify(weeklyReports));
  }, [weeklyReports]);

  // Generate Intelligence Report (weekly, monthly, quarterly, annual)
  const generateReport = async (type = 'weekly', forceRegenerate = false, specificPeriod = null) => {
    const sortedWeeks = Object.keys(allWeeksData).sort();
    const sortedPeriods = Object.keys(allPeriodsData).sort();
    const sortedDays = Object.keys(allDaysData).filter(d => hasDailySalesData(allDaysData[d])).sort();
    
    if (sortedWeeks.length === 0 && sortedPeriods.length === 0 && sortedDays.length === 0) {
      setReportError('No data available to generate report');
      return;
    }

    let periodKey, periodLabel, periodData = null, weeksInPeriod = [], dataSource = '';
    let comparisonData = null, comparisonLabel = '';

    if (type === 'weekly') {
      if (sortedWeeks.length === 0 && sortedDays.length === 0) {
        setReportError('No weekly data available');
        return;
      }
      
      // Use specific period if provided, otherwise find the most recent COMPLETE week
      if (specificPeriod && sortedWeeks.includes(specificPeriod)) {
        periodKey = specificPeriod;
        periodLabel = `Week ending ${periodKey}`;
        weeksInPeriod = [periodKey];
        dataSource = 'weekly';
        // Find comparison (previous week)
        const idx = sortedWeeks.indexOf(specificPeriod);
        if (idx > 0) {
          comparisonLabel = 'vs Previous Week';
          comparisonData = allWeeksData[sortedWeeks[idx - 1]];
        }
      } else {
        // Find the most recent COMPLETE week (with actual revenue)
        let selectedWeekIndex = sortedWeeks.length - 1;
        while (selectedWeekIndex >= 0) {
          const weekData = allWeeksData[sortedWeeks[selectedWeekIndex]];
          const weekRevenue = weekData?.total?.revenue || 0;
          if (weekRevenue > 100) { // Week has meaningful data
            break;
          }
          selectedWeekIndex--;
        }
        
        // If no complete week found, use daily data to build context
        if (selectedWeekIndex < 0) {
          // Use the most recent week key but note it's incomplete
          periodKey = sortedWeeks[sortedWeeks.length - 1] || formatDateKey(new Date());
          periodLabel = `Week ending ${periodKey} (In Progress)`;
          weeksInPeriod = [periodKey];
          dataSource = 'daily'; // Flag to use daily data
        } else {
          periodKey = sortedWeeks[selectedWeekIndex];
          periodLabel = `Week ending ${periodKey}`;
          weeksInPeriod = [periodKey];
          dataSource = 'weekly';
          // Comparison: previous complete week
          if (selectedWeekIndex > 0) {
            comparisonLabel = 'vs Previous Week';
            comparisonData = allWeeksData[sortedWeeks[selectedWeekIndex - 1]];
          }
        }
      }
    } else if (type === 'monthly') {
      const monthPeriods = sortedPeriods.filter(p => /^\d{4}-\d{2}$/.test(p) || /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i.test(p));
      const monthsFromWeeks = [...new Set(sortedWeeks.map(w => w.substring(0, 7)))].sort();
      
      if (monthPeriods.length > 0) {
        const latestMonthPeriod = monthPeriods[monthPeriods.length - 1];
        periodKey = latestMonthPeriod;
        periodLabel = latestMonthPeriod;
        periodData = allPeriodsData[latestMonthPeriod];
        dataSource = 'period';
        // Comparison: previous month or same month last year
        if (monthPeriods.length > 1) {
          comparisonLabel = 'vs Previous Month';
          comparisonData = allPeriodsData[monthPeriods[monthPeriods.length - 2]];
        }
      } else if (monthsFromWeeks.length > 0) {
        const latestMonth = monthsFromWeeks[monthsFromWeeks.length - 1];
        periodKey = latestMonth;
        const [year, month] = latestMonth.split('-');
        periodLabel = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        weeksInPeriod = sortedWeeks.filter(w => w.startsWith(latestMonth));
        dataSource = 'weekly';
      } else {
        setReportError('No monthly data available');
        return;
      }
    } else if (type === 'quarterly') {
      const quarterPeriods = sortedPeriods.filter(p => /Q[1-4]/i.test(p));
      
      if (quarterPeriods.length > 0) {
        const latestQuarterPeriod = quarterPeriods[quarterPeriods.length - 1];
        periodKey = latestQuarterPeriod;
        periodLabel = latestQuarterPeriod;
        periodData = allPeriodsData[latestQuarterPeriod];
        dataSource = 'period';
        // Comparison: previous quarter
        if (quarterPeriods.length > 1) {
          comparisonLabel = 'vs Previous Quarter';
          comparisonData = allPeriodsData[quarterPeriods[quarterPeriods.length - 2]];
        }
      } else if (sortedWeeks.length > 0) {
        const getQuarter = (dateStr) => Math.ceil(parseInt(dateStr.substring(5, 7)) / 3);
        const getYear = (dateStr) => dateStr.substring(0, 4);
        const quarterDataMap = {};
        sortedWeeks.forEach(w => {
          const q = `${getYear(w)}-Q${getQuarter(w)}`;
          if (!quarterDataMap[q]) quarterDataMap[q] = [];
          quarterDataMap[q].push(w);
        });
        const quarters = Object.keys(quarterDataMap).sort();
        if (quarters.length === 0) {
          setReportError('No quarterly data available');
          return;
        }
        const latestQuarter = quarters[quarters.length - 1];
        periodKey = latestQuarter;
        periodLabel = latestQuarter.replace('-', ' ');
        weeksInPeriod = quarterDataMap[latestQuarter];
        dataSource = 'weekly';
      } else {
        setReportError('No quarterly data available');
        return;
      }
    } else if (type === 'annual') {
      const yearPeriods = sortedPeriods.filter(p => /^\d{4}$/.test(p));
      const yearsFromWeeks = [...new Set(sortedWeeks.map(w => w.substring(0, 4)))].sort();
      
      if (yearPeriods.length > 0) {
        const latestYearPeriod = yearPeriods[yearPeriods.length - 1];
        periodKey = latestYearPeriod;
        periodLabel = latestYearPeriod;
        periodData = allPeriodsData[latestYearPeriod];
        dataSource = 'period';
        // Comparison: previous year
        if (yearPeriods.length > 1) {
          comparisonLabel = 'vs Previous Year';
          comparisonData = allPeriodsData[yearPeriods[yearPeriods.length - 2]];
        }
      } else if (yearsFromWeeks.length > 0) {
        const latestYear = yearsFromWeeks[yearsFromWeeks.length - 1];
        periodKey = latestYear;
        periodLabel = latestYear;
        weeksInPeriod = sortedWeeks.filter(w => w.startsWith(latestYear));
        dataSource = 'weekly';
      } else {
        setReportError('No annual data available');
        return;
      }
    }

    // Check for existing report
    const existingReport = weeklyReports[type]?.reports?.find(r => r.periodKey === periodKey);
    if (existingReport && !forceRegenerate) {
      setCurrentReport(existingReport);
      setReportType(type);
      setShowWeeklyReport(true);
      return;
    }

    setGeneratingReport(true);
    setReportError(null);
    setReportType(type);
    setShowWeeklyReport(true);

    try {
      // Build report data
      let reportData = { total: { revenue: 0, netProfit: 0, units: 0, adSpend: 0 }, amazon: { revenue: 0, netProfit: 0, adSpend: 0 }, shopify: { revenue: 0, netProfit: 0, adSpend: 0, threeplCosts: 0 } };
      
      if (dataSource === 'period' && periodData) {
        reportData.total.revenue = periodData.total?.revenue || 0;
        reportData.total.netProfit = getProfit(periodData.total);
        reportData.total.units = periodData.total?.units || 0;
        reportData.total.adSpend = periodData.total?.adSpend || 0;
        reportData.amazon.revenue = periodData.amazon?.revenue || 0;
        reportData.amazon.netProfit = getProfit(periodData.amazon);
        reportData.amazon.adSpend = periodData.amazon?.adSpend || 0;
        reportData.shopify.revenue = periodData.shopify?.revenue || 0;
        reportData.shopify.netProfit = getProfit(periodData.shopify);
        reportData.shopify.adSpend = periodData.shopify?.adSpend || 0;
        reportData.shopify.threeplCosts = periodData.shopify?.threeplCosts || 0;
      } else if (dataSource === 'daily') {
        // Use daily data when weekly data is incomplete
        const recentDays = sortedDays.slice(-7); // Last 7 days
        recentDays.forEach(d => {
          const dayData = allDaysData[d];
          if (!dayData) return;
          reportData.total.revenue += dayData.total?.revenue || 0;
          reportData.total.netProfit += getProfit(dayData.total);
          reportData.total.units += dayData.total?.units || 0;
          reportData.total.adSpend += dayData.total?.adSpend || 0;
          reportData.amazon.revenue += dayData.amazon?.revenue || 0;
          reportData.amazon.netProfit += dayData.amazon?.netProfit || 0;
          reportData.amazon.adSpend += dayData.amazon?.adSpend || 0;
          reportData.shopify.revenue += dayData.shopify?.revenue || 0;
          reportData.shopify.netProfit += dayData.shopify?.netProfit || 0;
          reportData.shopify.adSpend += dayData.shopify?.adSpend || 0;
          reportData.shopify.threeplCosts += dayData.shopify?.threeplCosts || 0;
        });
        // Update period label to reflect we're using daily data
        periodLabel = `Last ${recentDays.length} days (${recentDays[0]} to ${recentDays[recentDays.length - 1]})`;
      } else {
        weeksInPeriod.forEach(w => {
          const d = allWeeksData[w];
          if (!d) return;
          reportData.total.revenue += d.total?.revenue || 0;
          reportData.total.netProfit += getProfit(d.total);
          reportData.total.units += d.total?.units || 0;
          reportData.total.adSpend += d.total?.adSpend || 0;
          reportData.amazon.revenue += d.amazon?.revenue || 0;
          reportData.amazon.netProfit += getProfit(d.amazon);
          reportData.amazon.adSpend += d.amazon?.adSpend || 0;
          reportData.shopify.revenue += d.shopify?.revenue || 0;
          reportData.shopify.netProfit += getProfit(d.shopify);
          reportData.shopify.adSpend += d.shopify?.adSpend || 0;
          reportData.shopify.threeplCosts += d.shopify?.threeplCosts || 0;
        });
      }
      
      reportData.total.netMargin = reportData.total.revenue > 0 ? (reportData.total.netProfit / reportData.total.revenue * 100) : 0;
      reportData.total.amazonShare = reportData.total.revenue > 0 ? (reportData.amazon.revenue / reportData.total.revenue * 100) : 0;
      reportData.total.shopifyShare = reportData.total.revenue > 0 ? (reportData.shopify.revenue / reportData.total.revenue * 100) : 0;
      reportData.amazon.roas = reportData.amazon.adSpend > 0 ? (reportData.amazon.revenue / reportData.amazon.adSpend) : 0;
      reportData.shopify.roas = reportData.shopify.adSpend > 0 ? (reportData.shopify.revenue / reportData.shopify.adSpend) : 0;

      // Calculate comparison changes
      let changes = { revenue: 0, profit: 0, units: 0, margin: 0 };
      if (comparisonData) {
        const prevRev = comparisonData.total?.revenue || 0;
        const prevProfit = comparisonData.total?.netProfit || 0;
        const prevUnits = comparisonData.total?.units || 0;
        const prevMargin = prevRev > 0 ? (prevProfit / prevRev * 100) : 0;
        changes.revenue = prevRev > 0 ? ((reportData.total.revenue - prevRev) / prevRev * 100) : 0;
        changes.profit = prevProfit > 0 ? ((reportData.total.netProfit - prevProfit) / prevProfit * 100) : 0;
        changes.units = prevUnits > 0 ? ((reportData.total.units - prevUnits) / prevUnits * 100) : 0;
        changes.margin = reportData.total.netMargin - prevMargin;
      }

      // Get inventory alerts (top 3 only)
      const latestInvKey = Object.keys(invHistory).sort().pop();
      const latestInv = latestInvKey ? invHistory[latestInvKey] : null;
      const inventoryAlerts = latestInv?.items
        ? latestInv.items
            .filter(i => i.daysOfSupply && i.daysOfSupply < 45 && i.daysOfSupply > 0)
            .sort((a, b) => a.daysOfSupply - b.daysOfSupply)
            .slice(0, 3)
            .map(i => `${i.sku}:${i.daysOfSupply}d`)
        : [];

      // Get forecast alerts (top 2 only)
      const topAlerts = forecastAlerts.slice(0, 2).map(a => a.message?.substring(0, 50) || '');

      // Cash summary
      let cashInfo = '';
      if (bankingData.transactions?.length > 0) {
        const accts = Object.entries(bankingData.accounts || {}).filter(([n]) => /\(\d{4}\)/.test(n));
        const cash = accts.filter(([_, a]) => a.type !== 'credit_card').reduce((s, [_, a]) => s + (a.balance || 0), 0);
        const debt = accts.filter(([_, a]) => a.type === 'credit_card').reduce((s, [_, a]) => s + (a.balance || 0), 0);
        cashInfo = `Cash:$${(cash/1000).toFixed(0)}k Debt:$${(debt/1000).toFixed(0)}k`;
      }

      // AI Forecast
      const aiForecast = aiForecasts?.salesForecast?.next4Weeks?.[0];
      
      // Build ULTRA-MINIMAL prompt
      const p = `${type.toUpperCase()} REPORT ${periodLabel}
Rev:$${(reportData.total.revenue/1000).toFixed(1)}k${comparisonData ? `(${changes.revenue>0?'+':''}${changes.revenue.toFixed(0)}%)` : ''} Profit:$${(reportData.total.netProfit/1000).toFixed(1)}k Margin:${reportData.total.netMargin.toFixed(0)}% Units:${reportData.total.units}
AMZ:$${(reportData.amazon.revenue/1000).toFixed(1)}k ${reportData.amazon.roas.toFixed(1)}xROAS | SHOP:$${(reportData.shopify.revenue/1000).toFixed(1)}k ${reportData.shopify.roas.toFixed(1)}xROAS
${aiForecast ? `Forecast:$${(aiForecast.predictedRevenue/1000).toFixed(1)}k next wk` : ''}
${inventoryAlerts.length > 0 ? `LowStock:${inventoryAlerts.join(',')}` : ''}
${cashInfo}
${topAlerts.length > 0 ? `Alerts:${topAlerts.join(';')}` : ''}

Write markdown: Summary(3 sentences), Metrics Table(✅⚠️❌), Wins(3), Concerns(3), Channels, ${inventoryAlerts.length > 0 ? 'Inventory Actions,' : ''}Recommendations(5)`;

      const reportContent = await callAI(p, `E-commerce analyst for ${storeName || 'Store'}. Write detailed reports from compact data. Be specific with numbers.`);
      if (!reportContent) throw new Error('No report content generated');

      const newReport = {
        id: `${type}-report-${Date.now()}`,
        type,
        periodKey,
        periodLabel,
        generatedAt: new Date().toISOString(),
        content: reportContent,
        metrics: { 
          revenue: reportData.total.revenue, 
          profit: reportData.total.netProfit, 
          units: reportData.total.units, 
          margin: reportData.total.netMargin,
          changes,
        },
        dataSource,
        inventoryAlerts: inventoryAlerts.length,
        forecastWeeks: Object.keys(amazonForecasts).length,
      };

      setCurrentReport(newReport);
      setWeeklyReports(prev => ({
        ...prev,
        [type]: {
          reports: [newReport, ...(prev[type]?.reports || []).filter(r => r.periodKey !== periodKey)].slice(0, 52),
          lastGenerated: new Date().toISOString(),
        },
      }));
      
      setToast({ message: `${type.charAt(0).toUpperCase() + type.slice(1)} Report generated!`, type: 'success' });

    } catch (error) {
      devError('Report generation error:', error);
      setReportError(error.message || 'Failed to generate report');
    } finally {
      setGeneratingReport(false);
    }
  };

  const downloadReport = (report) => {
    if (!report) return;
    const blob = new Blob([report.content], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${report.type}_Report_${report.periodKey}.md`;
    a.click();
    setToast({ message: 'Report downloaded', type: 'success' });
  };

  // Weekly Report — extracted to WeeklyReportModal component
  const weeklyReportUI = showWeeklyReport && (
    <WeeklyReportModal
      showWeeklyReport={showWeeklyReport}
      setShowWeeklyReport={setShowWeeklyReport}
      reportType={reportType}
      setReportType={setReportType}
      currentReport={currentReport}
      setCurrentReport={setCurrentReport}
      reportError={reportError}
      setReportError={setReportError}
      generatingReport={generatingReport}
      generateReport={generateReport}
      downloadReport={downloadReport}
      weeklyReports={weeklyReports}
      selectedReportPeriod={selectedReportPeriod}
      setSelectedReportPeriod={setSelectedReportPeriod}
      allWeeksData={allWeeksData}
      allPeriodsData={allPeriodsData}
      formatCurrency={formatCurrency}
    />
  );
  
  // AI Chat — extracted to AIChatPanel component
  const aiChatPanelElement = (
    <AIChatPanel
      showAIChat={showAIChat}
      setShowAIChat={setShowAIChat}
      aiMessages={aiMessages}
      setAiMessages={setAiMessages}
      aiInput={aiInput}
      setAiInput={setAiInput}
      aiLoading={aiLoading}
      sendAIMessage={sendAIMessage}
      generateReport={generateReport}
      aiChatModel={aiChatModel}
      setAiChatModel={setAiChatModel}
      aiModelOptions={AI_MODEL_OPTIONS}
    />
  );

  
  // Calculate dashboard metrics based on selected range
  const dashboardMetrics = useMemo(() => {
    // CRITICAL: Derive weekly data from daily data for accuracy
    const derivedWeeks = deriveWeeksFromDays(allDaysData || {});
    
    // Helper to get merged week data - DERIVED TOTALS TAKE PRIORITY
    const getMergedWeek = (weekKey) => {
      const stored = allWeeksData[weekKey];
      const derived = derivedWeeks[weekKey];
      if (!stored && !derived) return null;
      if (!stored) return derived;
      if (!derived) return stored;
      
      // CRITICAL: If derived data has revenue, use derived totals
      const derivedHasData = (derived.total?.revenue || 0) > 0;
      
      if (derivedHasData) {
        return {
          ...stored,
          total: derived.total,
          amazon: {
            ...stored.amazon,
            revenue: derived.amazon?.revenue ?? stored.amazon?.revenue,
            units: derived.amazon?.units ?? stored.amazon?.units,
          },
          shopify: {
            ...stored.shopify,
            revenue: derived.shopify?.revenue ?? stored.shopify?.revenue,
            units: derived.shopify?.units ?? stored.shopify?.units,
          },
        };
      }
      
      return stored;
    };
    
    // Get all week keys from both sources
    const allWeekKeys = new Set([
      ...Object.keys(allWeeksData),
      ...Object.keys(derivedWeeks)
    ]);
    
    // Filter to only include weeks with actual revenue data (from merged)
    const sortedWeeks = Array.from(allWeekKeys)
      .filter(w => {
        const merged = getMergedWeek(w);
        return (merged?.total?.revenue || 0) > 0;
      })
      .sort();
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
    let usingDailyData = false;
    
    // Handle "yesterday" - use daily data (only days with real sales data)
    if (dashboardRange === 'yesterday') {
      const sortedDays = Object.keys(allDaysData).filter(d => hasDailySalesData(allDaysData[d])).sort();
      if (sortedDays.length > 0) {
        const yesterday = sortedDays[sortedDays.length - 1];
        const dayData = allDaysData[yesterday];
        const googleAds = dayData.shopify?.googleSpend || dayData.googleSpend || dayData.googleAds || 0;
        const metaAds = dayData.shopify?.metaSpend || dayData.metaSpend || dayData.metaAds || 0;
        const amazonAds = dayData.amazon?.adSpend || 0;
        current = {
          revenue: dayData.total?.revenue || 0,
          profit: getProfit(dayData.total),
          units: dayData.total?.units || 0,
          adSpend: dayData.total?.adSpend || 0,
          cogs: dayData.total?.cogs || 0,
          orders: (dayData.amazon?.units || 0) + (dayData.shopify?.units || 0),
          date: yesterday,
          amazonRev: dayData.amazon?.revenue || 0,
          shopifyRev: dayData.shopify?.revenue || 0,
          googleAds,
          metaAds,
          amazonAds,
        };
        usingDailyData = true;
        
        // Compare to day before
        if (sortedDays.length > 1) {
          const priorDay = sortedDays[sortedDays.length - 2];
          const priorData = allDaysData[priorDay];
          previous = {
            revenue: priorData.total?.revenue || 0,
            profit: priorData.total?.netProfit || 0,
          };
        }
      }
    } else if (dashboardRange === 'year' && allPeriodsData[currentYear]) {
      // Use period data for current year
      const period = allPeriodsData[currentYear];
      const googleAds = period?.shopify?.googleSpend || period?.shopify?.googleAds || 0;
      const metaAds = period?.shopify?.metaSpend || period?.shopify?.metaAds || 0;
      const amazonAds = period?.amazon?.adSpend || 0;
      current = {
        revenue: period.total?.revenue || 0,
        profit: getProfit(periodData.total),
        units: period.total?.units || 0,
        adSpend: period.total?.adSpend || 0,
        cogs: period.total?.cogs || 0,
        orders: (period.shopify?.threeplMetrics?.orderCount || 0) + (period.amazon?.units || 0),
        googleAds,
        metaAds,
        amazonAds,
      };
      usingPeriodData = true;
      
      // Compare to last year's period if available
      if (allPeriodsData[lastYear]) {
        const lastPeriod = allPeriodsData[lastYear];
        previous = {
          revenue: lastPeriod.total?.revenue || 0,
          profit: getProfit(lastPeriod.total),
        };
      }
    } else {
      // Use weekly data - with merged derived data for accuracy
      const weeklyAggWithAds = rangeWeeks.reduce((acc, w) => {
        const week = getMergedWeek(w);
        if (!week) return acc;
        const googleAds = week?.shopify?.googleSpend || week?.shopify?.googleAds || 0;
        const metaAds = week?.shopify?.metaSpend || week?.shopify?.metaAds || 0;
        const amazonAds = week?.amazon?.adSpend || 0;
        return {
          revenue: acc.revenue + (week.total?.revenue || 0),
          profit: acc.profit + (week.total?.netProfit || 0),
          units: acc.units + (week.total?.units || 0),
          adSpend: acc.adSpend + (week.total?.adSpend || 0),
          cogs: acc.cogs + (week.total?.cogs || 0),
          orders: acc.orders + (week.shopify?.threeplMetrics?.orderCount || 0) + (week.amazon?.units || 0),
          googleAds: acc.googleAds + googleAds,
          metaAds: acc.metaAds + metaAds,
          amazonAds: acc.amazonAds + amazonAds,
        };
      }, { revenue: 0, profit: 0, units: 0, adSpend: 0, cogs: 0, orders: 0, googleAds: 0, metaAds: 0, amazonAds: 0 });
      
      current = weeklyAggWithAds;
      
      // Previous range for comparison - use merged data
      const previousRangeWeeks = dashboardRange === 'week' 
        ? sortedWeeks.slice(-2, -1)
        : dashboardRange === 'month'
        ? sortedWeeks.slice(-8, -4)
        : dashboardRange === 'quarter'
        ? sortedWeeks.slice(-26, -13)
        : sortedWeeks.filter(w => w.startsWith(lastYear));
        
      previous = previousRangeWeeks.reduce((acc, w) => {
        const week = getMergedWeek(w);
        if (!week) return acc;
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
      'yesterday': 'Yesterday',
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
      usingDailyData,
      rangeLabel: rangeLabels[dashboardRange] || 'Last 30 Days',
      comparisonLabel: dashboardRange === 'yesterday' ? 'vs Prior Day' : dashboardRange === 'year' ? `vs ${lastYear}` : 'vs Prior Period'
    };
  }, [allWeeksData, allPeriodsData, allDaysData, dashboardRange]);

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
          </form>
          
          {/* Legal Links */}
          <div className="mt-6 pt-4 border-t border-slate-800 text-center">
            <p className="text-xs text-slate-500">
              By signing in, you agree to our{' '}
              <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300">
                Terms of Service
              </a>
              {' '}and{' '}
              <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300">
                Privacy Policy
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ========== GLOBAL MODALS (render on any view) ==========
  const GlobalModals = () => (
    <>
      <OnboardingWizard />
      <PdfExportModal />
      <ConfirmDialog />
    </>
  );

  // Destructure dashboardMetrics at component level so all views can access 'current'
  const { current, revenueChange, profitChange, rangeWeeks, sortedWeeks: dmSortedWeeks, sortedPeriods: dmSortedPeriods, usingPeriodData, usingDailyData, rangeLabel, comparisonLabel } = dashboardMetrics;

  // VIEWS
  
  // Wrap view content in ErrorBoundary — a crash in one tab won't take down the app.
  // key={view} resets the boundary when navigating between views.
  const wrapView = (content) => <ErrorBoundary name={view} key={view}>{content}</ErrorBoundary>;
  
  // Redirect removed views
  if (view === 'analytics') { setView('trends'); return null; }
  if (view === 'pnl') { setProfitSubTab('pnl'); setView('profitability'); return null; }
  
  // ==================== DASHBOARD VIEW ====================

  // ==================== GLOBAL MODALS (rendered once, not per-view) ====================
  const globalModals = (<><Toast toast={toast} setToast={setToast} showSaveConfirm={showSaveConfirm} /><DayDetailsModal viewingDayDetails={viewingDayDetails} setViewingDayDetails={setViewingDayDetails} allDaysData={allDaysData} setAllDaysData={setAllDaysData} getCogsCost={getCogsCost} savedProductNames={savedProductNames} editingDayAdSpend={editingDayAdSpend} setEditingDayAdSpend={setEditingDayAdSpend} dayAdSpendEdit={dayAdSpendEdit} setDayAdSpendEdit={setDayAdSpendEdit} queueCloudSave={queueCloudSave} combinedData={combinedData} setToast={setToast} /><ValidationModal showValidationModal={showValidationModal} setShowValidationModal={setShowValidationModal} dataValidationWarnings={dataValidationWarnings} setDataValidationWarnings={setDataValidationWarnings} pendingProcessAction={pendingProcessAction} setPendingProcessAction={setPendingProcessAction} />{aiChatPanelElement}{weeklyReportUI}<CogsManager showCogsManager={showCogsManager} setShowCogsManager={setShowCogsManager} savedCogs={savedCogs} cogsLastUpdated={cogsLastUpdated} files={files} setFiles={setFiles} setFileNames={setFileNames} processAndSaveCogs={processAndSaveCogs} FileBox={FileBox} /><ProductCatalogModal showProductCatalog={showProductCatalog} setShowProductCatalog={setShowProductCatalog} productCatalogFile={productCatalogFile} setProductCatalogFile={setProductCatalogFile} productCatalogFileName={productCatalogFileName} setProductCatalogFileName={setProductCatalogFileName} savedProductNames={savedProductNames} setSavedProductNames={setSavedProductNames} setToast={setToast} /><UploadHelpModal showUploadHelp={showUploadHelp} setShowUploadHelp={setShowUploadHelp} /><ForecastModal showForecast={showForecast} setShowForecast={setShowForecast} generateForecast={generateForecast} enhancedForecast={enhancedForecast} amazonForecasts={amazonForecasts} goals={goals} /><BreakEvenModal showBreakEven={showBreakEven} setShowBreakEven={setShowBreakEven} breakEvenInputs={breakEvenInputs} setBreakEvenInputs={setBreakEvenInputs} calculateBreakEven={calculateBreakEven} /><ExportModal showExportModal={showExportModal} setShowExportModal={setShowExportModal} exportWeeklyDataCSV={exportWeeklyDataCSV} exportSKUDataCSV={exportSKUDataCSV} exportInventoryCSV={exportInventoryCSV} exportAll={exportAll} invHistory={invHistory} allWeeksData={allWeeksData} allDaysData={allDaysData} /><ComparisonView compareMode={compareMode} setCompareMode={setCompareMode} compareItems={compareItems} setCompareItems={setCompareItems} allWeeksData={allWeeksData} weekNotes={weekNotes} /><InvoiceModal showInvoiceModal={showInvoiceModal} setShowInvoiceModal={setShowInvoiceModal} invoiceForm={invoiceForm} setInvoiceForm={setInvoiceForm} editingInvoice={editingInvoice} setEditingInvoice={setEditingInvoice} invoices={invoices} setInvoices={setInvoices} processingPdf={processingPdf} setProcessingPdf={setProcessingPdf} callAI={callAI} /><ThreePLBulkUploadModal show3PLBulkUpload={show3PLBulkUpload} setShow3PLBulkUpload={setShow3PLBulkUpload} threeplSelectedFiles={threeplSelectedFiles} setThreeplSelectedFiles={setThreeplSelectedFiles} threeplProcessing={threeplProcessing} setThreeplProcessing={setThreeplProcessing} threeplResults={threeplResults} setThreeplResults={setThreeplResults} threeplLedger={threeplLedger} parse3PLExcel={parse3PLExcel} save3PLLedger={save3PLLedger} get3PLForWeek={get3PLForWeek} getSunday={getSunday} allWeeksData={allWeeksData} setAllWeeksData={setAllWeeksData} save={save} /><AdsBulkUploadModal showAdsBulkUpload={showAdsBulkUpload} setShowAdsBulkUpload={setShowAdsBulkUpload} adsSelectedFiles={adsSelectedFiles} setAdsSelectedFiles={setAdsSelectedFiles} adsProcessing={adsProcessing} setAdsProcessing={setAdsProcessing} adsResults={adsResults} setAdsResults={setAdsResults} allDaysData={allDaysData} setAllDaysData={setAllDaysData} allWeeksData={allWeeksData} setAllWeeksData={setAllWeeksData} combinedData={combinedData} session={session} supabase={supabase} pushToCloudNow={pushToCloudNow} /><GoalsModal showGoalsModal={showGoalsModal} setShowGoalsModal={setShowGoalsModal} goals={goals} saveGoals={saveGoals} /><StoreSelectorModal showStoreModal={showStoreModal} setShowStoreModal={setShowStoreModal} session={session} stores={stores} activeStoreId={activeStoreId} switchStore={switchStore} deleteStore={deleteStore} createStore={createStore} /><ConflictResolutionModal showConflictModal={showConflictModal} setShowConflictModal={setShowConflictModal} conflictData={conflictData} setConflictData={setConflictData} conflictCheckRef={conflictCheckRef} pushToCloudNow={pushToCloudNow} loadFromCloud={loadFromCloud} setToast={setToast} setAllWeeksData={setAllWeeksData} setAllDaysData={setAllDaysData} setInvoices={setInvoices} /><WidgetConfigModal editingWidgets={editingWidgets} setEditingWidgets={setEditingWidgets} widgetConfig={widgetConfig} setWidgetConfig={setWidgetConfig} DEFAULT_DASHBOARD_WIDGETS={DEFAULT_DASHBOARD_WIDGETS} draggedWidgetId={draggedWidgetId} setDraggedWidgetId={setDraggedWidgetId} dragOverWidgetId={dragOverWidgetId} setDragOverWidgetId={setDragOverWidgetId} /><DtcAdsIntelModal show={showDtcIntelUpload} setShow={setShowDtcIntelUpload} dtcIntelData={dtcIntelData} setDtcIntelData={setDtcIntelData} setToast={setToast} callAI={callAI} saveReportToHistory={saveReportToHistory} queueCloudSave={queueCloudSave} allDaysData={allDaysData} setAllDaysData={setAllDaysData} /><AmazonAdsIntelModal show={showAdsIntelUpload} setShow={setShowAdsIntelUpload} adsIntelData={adsIntelData} setAdsIntelData={setAdsIntelData} combinedData={combinedData} queueCloudSave={queueCloudSave} allDaysData={allDaysData} setAllDaysData={setAllDaysData} amazonCampaigns={amazonCampaigns} setAmazonCampaigns={setAmazonCampaigns} setToast={setToast} callAI={callAI} saveReportToHistory={saveReportToHistory} onGoToAnalyst={() => { setAdsAiMessages([]); pendingAdsAnalysisRef.current = true; setView("ads"); setShowAdsAIChat(true); }} /><OnboardingWizard /><PdfExportModal /><KeyboardShortcuts setView={setView} exportAll={exportAll} setShowAdsAIChat={setShowAdsAIChat} setToast={setToast} /><AuditLog isOpen={showAuditLog} onClose={() => setShowAuditLog(false)} auditLog={getAuditLog()} /></>);

  if (view === 'dashboard') {
    return wrapView(<DashboardView
      activeStoreId={activeStoreId}
      adSpend={adSpend}
      aggregateDailyToWeekly={aggregateDailyToWeekly}
      aiForecastLoading={aiForecastLoading}
      aiForecasts={aiForecasts}
      allDaysData={allDaysData}
      allPeriodsData={allPeriodsData}
      allWeeksData={allWeeksData}
      amazonForecasts={amazonForecasts}
      appSettings={appSettings}
      bankingData={bankingData}
      calendarMonth={calendarMonth}
      comparisonLabel={comparisonLabel}
      current={current}
      dashboardRange={dashboardRange}
      dataStatus={dataStatus}
      DEFAULT_DASHBOARD_WIDGETS={DEFAULT_DASHBOARD_WIDGETS}
      dragOverWidgetId={dragOverWidgetId}
      draggedWidgetId={draggedWidgetId}
      exportAll={exportAll}
      forecastAlerts={forecastAlerts}
      generateAIForecasts={generateAIForecasts}
      generateForecast={generateForecast}
      get3PLForWeek={get3PLForWeek}
      getProfit={getProfit}
      globalModals={globalModals}
      goals={goals}
      hasCogs={hasCogs}
      hasDailySalesData={hasDailySalesData}
      invHistory={invHistory}
      invoices={invoices}
      lastBackupDate={lastBackupDate}
      navDropdown={navDropdown}
      periodLabel={periodLabel}
      profitChange={profitChange}
      revenueChange={revenueChange}
      salesTaxConfig={salesTaxConfig}
      savedCogs={savedCogs}
      savedProductNames={savedProductNames}
      session={session}
      setAnalyticsTab={setAnalyticsTab}
      setCalendarMonth={setCalendarMonth}
      setDashboardRange={setDashboardRange}
      setDragOverWidgetId={setDragOverWidgetId}
      setDraggedWidgetId={setDraggedWidgetId}
      setEditingWidgets={setEditingWidgets}
      setNavDropdown={setNavDropdown}
      setSelectedDay={setSelectedDay}
      setSelectedInvDate={setSelectedInvDate}
      setSelectedPeriod={setSelectedPeriod}
      setSelectedWeek={setSelectedWeek}
      setShowCogsManager={setShowCogsManager}
      setShowExportModal={setShowExportModal}
      setShowForecast={setShowForecast}
      setShowGoalsModal={setShowGoalsModal}
      setShowInvoiceModal={setShowInvoiceModal}
      setShowPdfExport={setShowPdfExport}
      setShowProductCatalog={setShowProductCatalog}
      setShowStoreModal={setShowStoreModal}
      setShowStoreSelector={setShowStoreSelector}
      setShowUploadHelp={setShowUploadHelp}
      setStoreName={setStoreName}
      setToast={setToast}
      setTrendsTab={setTrendsTab}
      setUploadTab={setUploadTab}
      setView={setView}
      setViewingDayDetails={setViewingDayDetails}
      setWeekEnding={setWeekEnding}
      setWidgetConfig={setWidgetConfig}
      showStoreSelector={showStoreSelector}
      storeLogo={storeLogo}
      storeName={storeName}
      stores={stores}
      supabase={supabase}
      switchStore={switchStore}
      threeplLedger={threeplLedger}
      usingDailyData={usingDailyData}
      usingPeriodData={usingPeriodData}
      view={view}
      widgetConfig={widgetConfig}
      runAutoSync={runAutoSync}
      autoSyncStatus={autoSyncStatus}
      dataLoading={dataLoading}
    />);
  }
  // ==================== UPLOAD VIEW (Combined) ====================
  if (view === 'upload' || view === 'period-upload' || view === 'inv-upload') {
    return wrapView(<UploadView
      adsIntelData={adsIntelData}
      aggregateDailyToWeekly={aggregateDailyToWeekly}
      allDaysData={allDaysData}
      allPeriodsData={allPeriodsData}
      allWeeksData={allWeeksData}
      amazonBulkFiles={amazonBulkFiles}
      amazonBulkParsed={amazonBulkParsed}
      amazonBulkProcessing={amazonBulkProcessing}
      amazonCredentials={amazonCredentials}
      amazonForecasts={amazonForecasts}
      appSettings={appSettings}
      bankingData={bankingData}
      bulkAdFiles={bulkAdFiles}
      bulkAdParsed={bulkAdParsed}
      bulkAdProcessing={bulkAdProcessing}
      current={current}
      dataStatus={dataStatus}
      dtcIntelData={dtcIntelData}
      exportAll={exportAll}
      FileBox={FileBox}
      fileNames={fileNames}
      files={files}
      forecastAlerts={forecastAlerts}
      forecastCorrections={forecastCorrections}
      forecastMeta={forecastMeta}
      getAmazonForecastComparison={getAmazonForecastComparison}
      getCogsCost={getCogsCost}
      getCogsLookup={getCogsLookup}
      globalModals={globalModals}
      handleAmazonBulkFiles={handleAmazonBulkFiles}
      handlePeriodFile={handlePeriodFile}
      hasDailySalesData={hasDailySalesData}
      importData={importData}
      invFiles={invFiles}
      invHistory={invHistory}
      invSnapshotDate={invSnapshotDate}
      isProcessing={isProcessing}
      navDropdown={navDropdown}
      packiyoCredentials={packiyoCredentials}
      parseBulkAdFile={parseBulkAdFile}
      periodAdSpend={periodAdSpend}
      periodFileNames={periodFileNames}
      periodFiles={periodFiles}
      periodLabel={periodLabel}
      processAmazonBulkUpload={processAmazonBulkUpload}
      processAmazonForecast={processAmazonForecast}
      processAndSaveCogs={processAndSaveCogs}
      processBulkAdUpload={processBulkAdUpload}
      processInventory={processInventory}
      processPeriod={processPeriod}
      reportType={reportType}
      save={save}
      saveInv={saveInv}
      savedCogs={savedCogs}
      savedProductNames={savedProductNames}
      setAllDaysData={setAllDaysData}
      setAllWeeksData={setAllWeeksData}
      setAmazonBulkFiles={setAmazonBulkFiles}
      setAmazonForecasts={setAmazonForecasts}
      setBulkAdFiles={setBulkAdFiles}
      setBulkAdParsed={setBulkAdParsed}
      setBulkAdProcessing={setBulkAdProcessing}
      setFileNames={setFileNames}
      setFiles={setFiles}
      setForecastCorrections={setForecastCorrections}
      setForecastMeta={setForecastMeta}
      setInvHistory={setInvHistory}
      setInvSnapshotDate={setInvSnapshotDate}
      setNavDropdown={setNavDropdown}
      setPeriodAdSpend={setPeriodAdSpend}
      setPeriodLabel={setPeriodLabel}
      setSavedProductNames={setSavedProductNames}
      setSelectedDay={setSelectedDay}
      setSelectedInvDate={setSelectedInvDate}
      setSelectedPeriod={setSelectedPeriod}
      setSelectedWeek={setSelectedWeek}
      setShopifyCredentials={setShopifyCredentials}
      setShopifyInventoryPreview={setShopifyInventoryPreview}
      setShopifyInventoryStatus={setShopifyInventoryStatus}
      setShopifySmartSync={setShopifySmartSync}
      setShopifySyncPreview={setShopifySyncPreview}
      setShopifySyncRange={setShopifySyncRange}
      setShopifySyncStatus={setShopifySyncStatus}
      setShowAdsIntelUpload={setShowAdsIntelUpload}
      setShowCogsManager={setShowCogsManager}
      setShowDtcIntelUpload={setShowDtcIntelUpload}
      setShowUploadHelp={setShowUploadHelp}
      setToast={setToast}
      setUploadTab={setUploadTab}
      setView={setView}
      shopifyCredentials={shopifyCredentials}
      shopifyInventoryPreview={shopifyInventoryPreview}
      shopifyInventoryStatus={shopifyInventoryStatus}
      shopifySmartSync={shopifySmartSync}
      shopifySyncPreview={shopifySyncPreview}
      shopifySyncRange={shopifySyncRange}
      shopifySyncStatus={shopifySyncStatus}
      stores={stores}
      toast={toast}
      uploadTab={uploadTab}
      view={view}
      weekEnding={weekEnding}
    />);
  }

  if (view === 'bulk') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-3 sm:p-4 lg:p-6">
        <div className="max-w-3xl mx-auto px-1 sm:px-0">{globalModals}
          <div className="text-center mb-8"><div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 mb-4"><Layers className="w-8 h-8 text-white" /></div><h1 className="text-3xl font-bold text-white mb-2">Bulk Import</h1><p className="text-slate-400">Auto-splits into weeks</p></div>
          <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />{dataBar}
          <div className="bg-amber-900/20 border border-amber-500/30 rounded-2xl p-5 mb-6"><h3 className="text-amber-400 font-semibold mb-2">How It Works</h3><ul className="text-slate-300 text-sm space-y-1"><li>• Upload Amazon with "End date" column</li><li>• Auto-groups by week ending Sunday</li><li>• Shopify distributed proportionally</li></ul></div>
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><FileBox type="amazon" label="Amazon Report" desc="Multi-week CSV" req /><FileBox type="shopify" label="Shopify Sales" desc="Matching period" req /></div>
          </div>
          {!hasCogs && <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4 mb-6"><p className="text-amber-400 font-semibold">COGS Required</p><p className="text-slate-300 text-sm">Click "COGS" button above first.</p></div>}
          {bulkImportResult && <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-2xl p-5 mb-6"><h3 className="text-emerald-400 font-semibold mb-2">Import Complete!</h3><p className="text-slate-300">Created <span className="text-white font-bold">{bulkImportResult.weeksCreated}</span> weeks</p><p className="text-slate-400 text-sm">{bulkImportResult.dateRange}</p></div>}
          <button onClick={processBulkImport} disabled={isProcessing || !files.amazon || !files.shopify || !hasCogs} className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2">{isProcessing ? <><Loader2 className="w-5 h-5 animate-spin" />Processing...</> : 'Import & Split'}</button>
        </div>
      </div>
    );
  }

  if (view === 'custom-select') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-3 sm:p-4 lg:p-6">
        <div className="max-w-3xl mx-auto px-1 sm:px-0">{globalModals}
          <div className="text-center mb-8"><div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-4"><CalendarRange className="w-8 h-8 text-white" /></div><h1 className="text-3xl font-bold text-white mb-2">Custom Period</h1></div>
          <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />{dataBar}
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
        <div className="max-w-7xl mx-auto">{globalModals}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div><h1 className="text-2xl lg:text-3xl font-bold text-white">Custom Period</h1><p className="text-slate-400">{data.startDate} to {data.endDate} ({data.weeksIncluded} weeks)</p></div>
            <button onClick={() => setView('custom-select')} className="bg-cyan-700 hover:bg-cyan-600 text-white px-3 py-2 rounded-lg text-sm">Change</button>
          </div>
          <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />
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

  // ==================== DAILY VIEW ====================
  if (view === 'daily' && selectedDay && allDaysData[selectedDay]) {
    return <DailyView
      adSpend={adSpend}
      allDaysData={allDaysData}
      allPeriodsData={allPeriodsData}
      allWeeksData={allWeeksData}
      appSettings={appSettings}
      bankingData={bankingData}
      combinedData={combinedData}
      current={current}
      get3PLForDay={get3PLForDay}
      get3PLForWeek={get3PLForWeek}
      getShopifyAdsForDay={getShopifyAdsForDay}
      getSunday={getSunday}
      globalModals={globalModals}
      hasDailySalesData={hasDailySalesData}
      invHistory={invHistory}
      navDropdown={navDropdown}
      queueCloudSave={queueCloudSave}
      selectedDay={selectedDay}
      setAllDaysData={setAllDaysData}
      setDeletedItems={setDeletedItems}
      setNavDropdown={setNavDropdown}
      setSelectedDay={setSelectedDay}
      setSelectedInvDate={setSelectedInvDate}
      setSelectedPeriod={setSelectedPeriod}
      setSelectedWeek={setSelectedWeek}
      setToast={setToast}
      setUploadTab={setUploadTab}
      setView={setView}
      storeLogo={storeLogo}
      storeName={storeName}
      sumSkuRows={sumSkuRows}
      threeplLedger={threeplLedger}
      view={view}
      withShippingSkuRow={withShippingSkuRow}
    />;
  }

  if (view === 'weekly' && selectedWeek) {
    return <WeeklyView
      adSpend={adSpend}
      allDaysData={allDaysData}
      allPeriodsData={allPeriodsData}
      allWeeksData={allWeeksData}
      appSettings={appSettings}
      bankingData={bankingData}
      current={current}
      deleteWeek={deleteWeek}
      edit3PLCost={edit3PLCost}
      editAdSpend={editAdSpend}
      editingNote={editingNote}
      files={files}
      get3PLForWeek={get3PLForWeek}
      globalModals={globalModals}
      handleReprocessFile={handleReprocessFile}
      hasDailySalesData={hasDailySalesData}
      invHistory={invHistory}
      mergeWeekData={mergeWeekData}
      navDropdown={navDropdown}
      noteText={noteText}
      parse3PLData={parse3PLData}
      reprocessAdSpend={reprocessAdSpend}
      reprocessFileNames={reprocessFileNames}
      reprocessFiles={reprocessFiles}
      reprocessWeek={reprocessWeek}
      selectedWeek={selectedWeek}
      setEdit3PLCost={setEdit3PLCost}
      setEditAdSpend={setEditAdSpend}
      setEditingNote={setEditingNote}
      setNavDropdown={setNavDropdown}
      setNoteText={setNoteText}
      setReprocessAdSpend={setReprocessAdSpend}
      setReprocessFileNames={setReprocessFileNames}
      setReprocessFiles={setReprocessFiles}
      setSelectedDay={setSelectedDay}
      setSelectedInvDate={setSelectedInvDate}
      setSelectedPeriod={setSelectedPeriod}
      setSelectedWeek={setSelectedWeek}
      setShowEdit3PL={setShowEdit3PL}
      setShowEditAdSpend={setShowEditAdSpend}
      setShowReprocess={setShowReprocess}
      setToast={setToast}
      setUploadTab={setUploadTab}
      setView={setView}
      setWeekNotes={setWeekNotes}
      showEdit3PL={showEdit3PL}
      showEditAdSpend={showEditAdSpend}
      showReprocess={showReprocess}
      showSaveConfirm={showSaveConfirm}
      storeLogo={storeLogo}
      storeName={storeName}
      threeplLedger={threeplLedger}
      toast={toast}
      updateWeek3PL={updateWeek3PL}
      updateWeekAdSpend={updateWeekAdSpend}
      view={view}
      weekEnding={weekEnding}
      weekNotes={weekNotes}
    />;
  }

  if (view === 'monthly') {
    const data = selectedMonth ? getMonthlyData(selectedMonth) : null, idx = months.indexOf(selectedMonth);
    if (!data) return <div className="min-h-screen bg-slate-950 text-white p-6 flex items-center justify-center">No data</div>;
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 lg:p-6">
        <div className="max-w-7xl mx-auto">{globalModals}
          <div className="mb-6"><h1 className="text-2xl lg:text-3xl font-bold text-white">Monthly Performance</h1><p className="text-slate-400">{new Date(selectedMonth+'-01T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} ({data.weeks.length} weeks)</p></div>
          <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />
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
        <div className="max-w-7xl mx-auto">{globalModals}
          <div className="mb-6"><h1 className="text-2xl lg:text-3xl font-bold text-white">Yearly Performance</h1><p className="text-slate-400">{selectedYear} ({data.weeks.length} weeks)</p></div>
          <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />
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
    return <PeriodDetailView
      adSpend={adSpend}
      allDaysData={allDaysData}
      allPeriodsData={allPeriodsData}
      allWeeksData={allWeeksData}
      appSettings={appSettings}
      bankingData={bankingData}
      clearPeriod3PLFiles={clearPeriod3PLFiles}
      deletePeriod={deletePeriod}
      files={files}
      globalModals={globalModals}
      handlePeriodFile={handlePeriodFile}
      hasDailySalesData={hasDailySalesData}
      invHistory={invHistory}
      navDropdown={navDropdown}
      parse3PLData={parse3PLData}
      periodAdSpend={periodAdSpend}
      periodAnalyticsView={periodAnalyticsView}
      periodFileNames={periodFileNames}
      periodFiles={periodFiles}
      reprocessPeriod={reprocessPeriod}
      savePeriods={savePeriods}
      selectedPeriod={selectedPeriod}
      setAllPeriodsData={setAllPeriodsData}
      setNavDropdown={setNavDropdown}
      setPeriodAdSpend={setPeriodAdSpend}
      setPeriodAnalyticsView={setPeriodAnalyticsView}
      setPeriodFileNames={setPeriodFileNames}
      setPeriodFiles={setPeriodFiles}
      setReprocessPeriod={setReprocessPeriod}
      setSelectedDay={setSelectedDay}
      setSelectedInvDate={setSelectedInvDate}
      setSelectedPeriod={setSelectedPeriod}
      setSelectedWeek={setSelectedWeek}
      setUploadTab={setUploadTab}
      setView={setView}
      view={view}
    />;
  }

  // Inventory Dashboard View
  if (view === 'inventory') {
    if (Object.keys(invHistory).length === 0) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-3 sm:p-4 lg:p-6">
          <div className="max-w-7xl mx-auto">{globalModals}
            <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />{dataBar}
            <EmptyState preset="inventory" setView={setView} />
          </div>
        </div>
      );
    }
    return wrapView(<InventoryView
      aiLoading={aiLoading}
      allDaysData={allDaysData}
      allPeriodsData={allPeriodsData}
      allWeeksData={allWeeksData}
      appSettings={appSettings}
      bankingData={bankingData}
      current={current}
      deleteInv={deleteInv}
      editingProduction={editingProduction}
      extractingProduction={extractingProduction}
      files={files}
      forecastCorrections={forecastCorrections}
      getAmazonForecastComparison={getAmazonForecastComparison}
      globalModals={globalModals}
      invHistory={invHistory}
      invShowZeroStock={invShowZeroStock}
      invSortColumn={invSortColumn}
      invSortDirection={invSortDirection}
      leadTimeSettings={leadTimeSettings}
      months={months}
      navDropdown={navDropdown}
      now={now}
      productionFile={productionFile}
      productionFileName={productionFileName}
      productionForm={productionForm}
      productionPipeline={productionPipeline}
      response={response}
      run={run}
      saved={saved}
      selectedInvDate={selectedInvDate}
      setAiInput={setAiInput}
      setAiLoading={setAiLoading}
      setAiMessages={setAiMessages}
      setConfirmDialog={setConfirmDialog}
      setEditingProduction={setEditingProduction}
      setExtractingProduction={setExtractingProduction}
      setInvShowZeroStock={setInvShowZeroStock}
      setInvSortColumn={setInvSortColumn}
      setInvSortDirection={setInvSortDirection}
      setLeadTimeSettings={setLeadTimeSettings}
      setNavDropdown={setNavDropdown}
      setProductionFile={setProductionFile}
      setProductionFileName={setProductionFileName}
      setProductionForm={setProductionForm}
      setProductionPipeline={setProductionPipeline}
      setSelectedDay={setSelectedDay}
      setSelectedInvDate={setSelectedInvDate}
      setSelectedPeriod={setSelectedPeriod}
      setSelectedWeek={setSelectedWeek}
      setShipmentForm={setShipmentForm}
      setShowAIChat={setShowAIChat}
      setShowAddProduction={setShowAddProduction}
      setShowAddShipment={setShowAddShipment}
      setShowSkuSettings={setShowSkuSettings}
      setSkuSettingsEditForm={setSkuSettingsEditForm}
      setSkuSettingsEditItem={setSkuSettingsEditItem}
      setSkuSettingsSearch={setSkuSettingsSearch}
      setToast={setToast}
      setUploadTab={setUploadTab}
      shipmentForm={shipmentForm}
      show={show}
      showAddProduction={showAddProduction}
      showAddShipment={showAddShipment}
      showSkuSettings={showSkuSettings}
      skuSettingsEditForm={skuSettingsEditForm}
      skuSettingsEditItem={skuSettingsEditItem}
      skuSettingsSearch={skuSettingsSearch}
      sorted={sorted}
      status={status}
      t={t}
      topSkus={topSkus}
      total={total}
      upcomingAmazonForecasts={upcomingAmazonForecasts}
      updated={updated}
      weekEnding={weekEnding}
      xlsx={xlsx}
      setView={setView}
      view={view}
      callAI={callAI}
    />);
  }

  // ==================== TRENDS VIEW ====================
  if (view === 'trends') {
    const hasTrendsData = Object.keys(allWeeksData).length >= 2 || Object.keys(allDaysData).length >= 7 || Object.keys(allPeriodsData).length >= 2;
    if (!hasTrendsData) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-3 sm:p-4 lg:p-6">
          <div className="max-w-7xl mx-auto">{globalModals}
            <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />{dataBar}
            <EmptyState preset="trends" setView={setView} />
          </div>
        </div>
      );
    }
    return <TrendsView
      adSpend={adSpend}
      allDaysData={allDaysData}
      allPeriodsData={allPeriodsData}
      allWeeksData={allWeeksData}
      amazonForecasts={amazonForecasts}
      appSettings={appSettings}
      bankingData={bankingData}
      current={current}
      dataBar={dataBar}
      enhancedForecast={enhancedForecast}
      forecastAccuracyHistory={forecastAccuracyHistory}
      generateForecast={generateForecast}
      getCogsCost={getCogsCost}
      getProfit={getProfit}
      globalModals={globalModals}
      hasDailySalesData={hasDailySalesData}
      invHistory={invHistory}
      navDropdown={navDropdown}
      returnRates={returnRates}
      revenueChange={revenueChange}
      savedCogs={savedCogs}
      savedProductNames={savedProductNames}
      setNavDropdown={setNavDropdown}
      setSelectedDay={setSelectedDay}
      setSelectedInvDate={setSelectedInvDate}
      setSelectedPeriod={setSelectedPeriod}
      setSelectedWeek={setSelectedWeek}
      setTrendsChannel={setTrendsChannel}
      setTrendsDateRange={setTrendsDateRange}
      setTrendsTab={setTrendsTab}
      setUploadTab={setUploadTab}
      setView={setView}
      setViewingDayDetails={setViewingDayDetails}
      trendsChannel={trendsChannel}
      trendsDateRange={trendsDateRange}
      trendsTab={trendsTab}
      view={view}
      weekEnding={weekEnding}
    />;
  }

  // ==================== YEAR-OVER-YEAR VIEW ====================
  if (view === 'yoy') {
    const hasYoYData = Object.keys(allWeeksData).length >= 2 || Object.keys(allPeriodsData).length >= 2;
    if (!hasYoYData) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-3 sm:p-4 lg:p-6">
          <div className="max-w-7xl mx-auto">{globalModals}
            <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />{dataBar}
            <EmptyState preset="yoy" setView={setView} />
          </div>
        </div>
      );
    }
    return <YoYView
      adSpend={adSpend}
      allDaysData={allDaysData}
      allPeriodsData={allPeriodsData}
      allWeeksData={allWeeksData}
      appSettings={appSettings}
      bankingData={bankingData}
      current={current}
      dataBar={dataBar}
      getProfit={getProfit}
      globalModals={globalModals}
      hasDailySalesData={hasDailySalesData}
      invHistory={invHistory}
      navDropdown={navDropdown}
      setNavDropdown={setNavDropdown}
      setSelectedDay={setSelectedDay}
      setSelectedInvDate={setSelectedInvDate}
      setSelectedPeriod={setSelectedPeriod}
      setSelectedWeek={setSelectedWeek}
      setUploadTab={setUploadTab}
      setView={setView}
      view={view}
    />;
  }

  // ==================== 3PL ANALYTICS VIEW ====================
  if (view === '3pl') {
    return wrapView(<ThreePLView
      allDaysData={allDaysData}
      allPeriodsData={allPeriodsData}
      allWeeksData={allWeeksData}
      appSettings={appSettings}
      bankingData={bankingData}
      dataBar={dataBar}
      files={files}
      get3PLForWeek={get3PLForWeek}
      globalModals={globalModals}
      hasDailySalesData={hasDailySalesData}
      invHistory={invHistory}
      navDropdown={navDropdown}
      setNavDropdown={setNavDropdown}
      setSelectedDay={setSelectedDay}
      setSelectedInvDate={setSelectedInvDate}
      setSelectedPeriod={setSelectedPeriod}
      setSelectedWeek={setSelectedWeek}
      setShow3PLBulkUpload={setShow3PLBulkUpload}
      setThreeplCustomEnd={setThreeplCustomEnd}
      setThreeplCustomStart={setThreeplCustomStart}
      setThreeplDateRange={setThreeplDateRange}
      setThreeplTimeView={setThreeplTimeView}
      setUploadTab={setUploadTab}
      setView={setView}
      threeplCustomEnd={threeplCustomEnd}
      threeplCustomStart={threeplCustomStart}
      threeplDateRange={threeplDateRange}
      threeplLedger={threeplLedger}
      threeplTimeView={threeplTimeView}
      view={view}
    />);
  }

  // ==================== SKU RANKINGS VIEW ====================
  if (view === 'skus') {
    const hasSkuData = Object.keys(allWeeksData).length > 0 || Object.keys(allPeriodsData).length > 0 || Object.keys(allDaysData).length > 0;
    if (!hasSkuData) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-3 sm:p-4 lg:p-6">
          <div className="max-w-7xl mx-auto">{globalModals}
            <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />{dataBar}
            <EmptyState preset="skus" setView={setView} />
          </div>
        </div>
      );
    }
    return <SkuRankingsView
      allDaysData={allDaysData}
      allPeriodsData={allPeriodsData}
      allWeeksData={allWeeksData}
      appSettings={appSettings}
      bankingData={bankingData}
      current={current}
      dataBar={dataBar}
      globalModals={globalModals}
      hasDailySalesData={hasDailySalesData}
      invHistory={invHistory}
      navDropdown={navDropdown}
      savedProductNames={savedProductNames}
      selectedInvDate={selectedInvDate}
      setNavDropdown={setNavDropdown}
      setSelectedDay={setSelectedDay}
      setSelectedInvDate={setSelectedInvDate}
      setSelectedPeriod={setSelectedPeriod}
      setSelectedWeek={setSelectedWeek}
      setSkuDateRange={setSkuDateRange}
      setSkuSearchQuery={setSkuSearchQuery}
      setSkuSortColumn={setSkuSortColumn}
      setSkuSortDirection={setSkuSortDirection}
      setUploadTab={setUploadTab}
      setView={setView}
      skuDateRange={skuDateRange}
      skuSearchQuery={skuSearchQuery}
      skuSortColumn={skuSortColumn}
      skuSortDirection={skuSortDirection}
      view={view}
    />;
  }

  // ==================== REPORTS & ACTIONS VIEW ====================
  if (view === 'reports') {
    return (
      <div className={`min-h-screen ${theme.mode === 'light' ? 'bg-slate-50 text-slate-900' : 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100'} p-4`}>
        <div className="max-w-7xl mx-auto">
          <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />
          <ReportsAndActionsView
            reportHistory={reportHistory} setReportHistory={setReportHistory}
            actionItems={actionItems} setActionItems={setActionItems}
            queueCloudSave={queueCloudSave} combinedData={combinedData}
            theme={theme} setToast={setToast}
          />
        </div>
      </div>
    );
  }

  // ==================== PROFITABILITY VIEW ====================
  if (view === 'profitability') {
    const hasProfitData = Object.keys(allWeeksData).length > 0 || Object.keys(allPeriodsData).length > 0;
    if (!hasProfitData) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-3 sm:p-4 lg:p-6">
          <div className="max-w-7xl mx-auto">{globalModals}
            <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />{dataBar}
            <EmptyState preset="profitability" setView={setView} setShowCogsManager={setShowCogsManager} />
          </div>
        </div>
      );
    }
    return <ProfitabilityView
      adSpend={adSpend}
      adsIntelData={adsIntelData}
      allDaysData={allDaysData}
      allPeriodsData={allPeriodsData}
      allWeeksData={allWeeksData}
      appSettings={appSettings}
      bankingData={bankingData}
      confirmedRecurring={confirmedRecurring}
      current={current}
      dataBar={dataBar}
      dtcIntelData={dtcIntelData}
      get3PLForWeek={get3PLForWeek}
      getProfit={getProfit}
      globalModals={globalModals}
      hasDailySalesData={hasDailySalesData}
      invHistory={invHistory}
      navDropdown={navDropdown}
      profitPeriodIndex={profitPeriodIndex}
      profitSubTab={profitSubTab}
      savedCogs={savedCogs}
      setNavDropdown={setNavDropdown}
      setProfitPeriodIndex={setProfitPeriodIndex}
      setProfitSubTab={setProfitSubTab}
      setSelectedDay={setSelectedDay}
      setSelectedInvDate={setSelectedInvDate}
      setSelectedPeriod={setSelectedPeriod}
      setSelectedWeek={setSelectedWeek}
      setTrendsTab={setTrendsTab}
      setUploadTab={setUploadTab}
      setView={setView}
      theme={theme}
      threeplLedger={threeplLedger}
      trendsTab={trendsTab}
      view={view}
    />;
  }


  // ==================== FORECAST VIEW (Unified Forecasting System) ====================
  if (view === 'forecast') {
    return wrapView(<ForecastView
      aiForecastLoading={aiForecastLoading}
      aiForecastModule={aiForecastModule}
      aiForecasts={aiForecasts}
      aiLearningHistory={aiLearningHistory}
      allDaysData={allDaysData}
      allPeriodsData={allPeriodsData}
      allWeeksData={allWeeksData}
      amazonForecasts={amazonForecasts}
      appSettings={appSettings}
      bankingData={bankingData}
      dataBar={dataBar}
      files={files}
      forecastCorrections={forecastCorrections}
      forecastPeriod={forecastPeriod}
      forecastTab={forecastTab}
      generateAIForecasts={generateAIForecasts}
      generateChannelForecastAI={generateChannelForecastAI}
      generateForecastComparisonAI={generateForecastComparisonAI}
      generateInventoryAI={generateInventoryAI}
      generateSalesForecastAI={generateSalesForecastAI}
      globalModals={globalModals}
      hasDailySalesData={hasDailySalesData}
      invHistory={invHistory}
      leadTimeSettings={leadTimeSettings}
      navDropdown={navDropdown}
      savedCogs={savedCogs}
      savedProductNames={savedProductNames}
      setForecastPeriod={setForecastPeriod}
      setForecastTab={setForecastTab}
      setLeadTimeSettings={setLeadTimeSettings}
      setNavDropdown={setNavDropdown}
      setSelectedDay={setSelectedDay}
      setSelectedInvDate={setSelectedInvDate}
      setSelectedPeriod={setSelectedPeriod}
      setSelectedWeek={setSelectedWeek}
      setUploadTab={setUploadTab}
      setView={setView}
      view={view}
    />);
  }

  if (view === 'ads') {
    return wrapView(<AdsView
      adSpend={adSpend}
      adsAiInput={adsAiInput}
      adsAiLoading={adsAiLoading}
      aiChatModel={aiChatModel}
      setAiChatModel={setAiChatModel}
      adsAiReportHistory={adsAiReportHistory}
      setAdsAiReportHistory={setAdsAiReportHistory}
      adsAiMessages={adsAiMessages}
      adsIntelData={adsIntelData}
      adsMonth={adsMonth}
      adsQuarter={adsQuarter}
      adsSelectedDay={adsSelectedDay}
      adsSelectedWeek={adsSelectedWeek}
      adsTimeTab={adsTimeTab}
      adsViewMode={adsViewMode}
      adsYear={adsYear}
      allDaysData={allDaysData}
      allPeriodsData={allPeriodsData}
      allWeeksData={allWeeksData}
      amazonCampaignFilter={amazonCampaignFilter}
      amazonCampaignSort={amazonCampaignSort}
      amazonCampaigns={amazonCampaigns}
      appSettings={appSettings}
      bankingData={bankingData}
      current={current}
      dataBar={dataBar}
      files={files}
      globalModals={globalModals}
      invHistory={invHistory}
      months={months}
      navDropdown={navDropdown}
      parseAmazonCampaignCSV={parseAmazonCampaignCSV}
      processAdsUpload={processAdsUpload}
      saveAmazonCampaigns={saveAmazonCampaigns}
      sendAdsAIMessage={sendAdsAIMessage}
      setAdsAiInput={setAdsAiInput}
      setAdsAiMessages={setAdsAiMessages}
      setAdsMonth={setAdsMonth}
      setAdsQuarter={setAdsQuarter}
      setAdsSelectedDay={setAdsSelectedDay}
      setAdsSelectedWeek={setAdsSelectedWeek}
      setAdsTimeTab={setAdsTimeTab}
      setAdsViewMode={setAdsViewMode}
      setAdsYear={setAdsYear}
      setAmazonCampaignFilter={setAmazonCampaignFilter}
      setAmazonCampaignSort={setAmazonCampaignSort}
      setNavDropdown={setNavDropdown}
      setSelectedDay={setSelectedDay}
      setSelectedInvDate={setSelectedInvDate}
      setSelectedPeriod={setSelectedPeriod}
      setSelectedWeek={setSelectedWeek}
      setShowAdsAIChat={setShowAdsAIChat}
      setShowAdsBulkUpload={setShowAdsBulkUpload}
      setShowAdsIntelUpload={setShowAdsIntelUpload}
      setToast={setToast}
      setUploadTab={setUploadTab}
      showAdsAIChat={showAdsAIChat}
      setView={setView}
      view={view}
      best={best}
      breakdown={breakdown}
      data={data}
      status={status}
      t={t}
      totalOrders={totalOrders}
      updated={updated}
      save={save}
    />);
  }

  // ==================== SALES TAX VIEW ====================
  if (view === 'sales-tax') {
    return wrapView(<SalesTaxView
      allDaysData={allDaysData}
      allPeriodsData={allPeriodsData}
      allWeeksData={allWeeksData}
      appSettings={appSettings}
      bankingData={bankingData}
      editPortalUrlValue={editPortalUrlValue}
      editingPortalUrl={editingPortalUrl}
      files={files}
      filingDetailState={filingDetailState}
      globalModals={globalModals}
      invHistory={invHistory}
      navDropdown={navDropdown}
      parsedTaxReport={parsedTaxReport}
      periodLabel={periodLabel}
      salesTaxConfig={salesTaxConfig}
      saveSalesTax={saveSalesTax}
      selectedTaxState={selectedTaxState}
      setEditPortalUrlValue={setEditPortalUrlValue}
      setEditingPortalUrl={setEditingPortalUrl}
      setFilingDetailState={setFilingDetailState}
      setNavDropdown={setNavDropdown}
      setParsedTaxReport={setParsedTaxReport}
      setSelectedDay={setSelectedDay}
      setSelectedInvDate={setSelectedInvDate}
      setSelectedPeriod={setSelectedPeriod}
      setSelectedTaxState={setSelectedTaxState}
      setSelectedWeek={setSelectedWeek}
      setShowHiddenStates={setShowHiddenStates}
      setShowTaxStateConfig={setShowTaxStateConfig}
      setTaxConfigState={setTaxConfigState}
      setTaxFilterStatus={setTaxFilterStatus}
      setTaxPeriodType={setTaxPeriodType}
      setTaxPeriodValue={setTaxPeriodValue}
      setTaxReportFileName={setTaxReportFileName}
      setToast={setToast}
      setUploadTab={setUploadTab}
      setViewingStateHistory={setViewingStateHistory}
      showHiddenStates={showHiddenStates}
      showTaxStateConfig={showTaxStateConfig}
      taxConfigState={taxConfigState}
      taxFilterStatus={taxFilterStatus}
      taxPeriodType={taxPeriodType}
      taxPeriodValue={taxPeriodValue}
      taxReportFileName={taxReportFileName}
      viewingStateHistory={viewingStateHistory}
      breakdown={breakdown}
      m={m}
      result={result}
      sorted={sorted}
      t={t}
      transactions={transactions}
      setView={setView}
      view={view}
    />);
  }

  // ==================== BANKING VIEW ====================
  if (view === 'banking') {
    return wrapView(<BankingView
      allDaysData={allDaysData}
      allPeriodsData={allPeriodsData}
      allWeeksData={allWeeksData}
      appSettings={appSettings}
      bankingData={bankingData}
      bankingDateRange={bankingDateRange}
      bankingDrilldown={bankingDrilldown}
      bankingProcessing={bankingProcessing}
      bankingTab={bankingTab}
      channelPeriod={channelPeriod}
      combinedData={combinedData}
      confirmedRecurring={confirmedRecurring}
      current={current}
      editingAccountBalance={editingAccountBalance}
      editingTransaction={editingTransaction}
      files={files}
      globalModals={globalModals}
      invHistory={invHistory}
      navDropdown={navDropdown}
      productionPipeline={productionPipeline}
      profitTrackerCustomRange={profitTrackerCustomRange}
      profitTrackerPeriod={profitTrackerPeriod}
      qboCredentials={qboCredentials}
      recurringForm={recurringForm}
      selectedTxnIds={selectedTxnIds}
      setBankingData={setBankingData}
      setBankingDateRange={setBankingDateRange}
      setBankingDrilldown={setBankingDrilldown}
      setBankingProcessing={setBankingProcessing}
      setBankingTab={setBankingTab}
      setChannelPeriod={setChannelPeriod}
      setConfirmedRecurring={setConfirmedRecurring}
      setEditingAccountBalance={setEditingAccountBalance}
      setEditingTransaction={setEditingTransaction}
      setNavDropdown={setNavDropdown}
      setProfitTrackerCustomRange={setProfitTrackerCustomRange}
      setProfitTrackerPeriod={setProfitTrackerPeriod}
      setRecurringForm={setRecurringForm}
      setSelectedDay={setSelectedDay}
      setSelectedInvDate={setSelectedInvDate}
      setSelectedPeriod={setSelectedPeriod}
      setSelectedTxnIds={setSelectedTxnIds}
      setSelectedWeek={setSelectedWeek}
      setShowAddRecurring={setShowAddRecurring}
      setShowMergeModal={setShowMergeModal}
      setToast={setToast}
      setUploadTab={setUploadTab}
      showAddRecurring={showAddRecurring}
      showMergeModal={showMergeModal}
      theme={theme}
      best={best}
      breakdown={breakdown}
      byMonth={byMonth}
      confirmed={confirmed}
      entry={entry}
      events={events}
      m={m}
      metrics={metrics}
      prior={prior}
      show={show}
      status={status}
      store={store}
      t={t}
      transactions={transactions}
      unpaid={unpaid}
      uploads={uploads}
      setView={setView}
      view={view}
      queueCloudSave={queueCloudSave}
    />);
  }

  // ==================== SETTINGS VIEW ====================
  if (view === 'settings') {
    return wrapView(<SettingsView
      actionItems={actionItems}
      activeStoreId={activeStoreId}
      allDaysData={allDaysData}
      allPeriodsData={allPeriodsData}
      allWeeksData={allWeeksData}
      amazonCredentials={amazonCredentials}
      amazonForecasts={amazonForecasts}
      amazonInventoryStatus={amazonInventoryStatus}
      appSettings={appSettings}
      autoSyncStatus={autoSyncStatus}
      bankingData={bankingData}
      combinedData={combinedData}
      current={current}
      exportAll={exportAll}
      files={files}
      forecastCorrections={forecastCorrections}
      getCogsLookup={getCogsLookup}
      globalModals={globalModals}
      goals={goals}
      importData={importData}
      invHistory={invHistory}
      invoices={invoices}
      isMobile={isMobile}
      leadTimeSettings={leadTimeSettings}
      localSettings={localSettings}
      months={months}
      navDropdown={navDropdown}
      notificationSettings={notificationSettings}
      now={now}
      packiyoCredentials={packiyoCredentials}
      packiyoInventoryData={packiyoInventoryData}
      packiyoInventoryStatus={packiyoInventoryStatus}
      qboCredentials={qboCredentials}
      runAutoSync={runAutoSync}
      savedCogs={savedCogs}
      savedProductNames={savedProductNames}
      saveInv={saveInv}
      selectedInvDate={selectedInvDate}
      session={session}
      setAllDaysData={setAllDaysData}
      setAllPeriodsData={setAllPeriodsData}
      setAllWeeksData={setAllWeeksData}
      setAmazonCredentials={setAmazonCredentials}
      setAdsIntelData={setAdsIntelData}
      setAmazonForecasts={setAmazonForecasts}
      setAmazonInventoryData={setAmazonInventoryData}
      setAmazonInventoryStatus={setAmazonInventoryStatus}
      setAppSettings={setAppSettings}
      setBankingData={setBankingData}
      setConfirmDialog={setConfirmDialog}
      setGoals={setGoals}
      setInvHistory={setInvHistory}
      setInvoices={setInvoices}
      setIsMobile={setIsMobile}
      setLeadTimeSettings={setLeadTimeSettings}
      setLocalSettings={setLocalSettings}
      setNavDropdown={setNavDropdown}
      setNotificationSettings={setNotificationSettings}
      setOnboardingStep={setOnboardingStep}
      setPackiyoCredentials={setPackiyoCredentials}
      setPackiyoInventoryData={setPackiyoInventoryData}
      setPackiyoInventoryStatus={setPackiyoInventoryStatus}
      setQboCredentials={setQboCredentials}
      setSavedCogs={setSavedCogs}
      setSelectedDay={setSelectedDay}
      setSelectedInvDate={setSelectedInvDate}
      setSelectedPeriod={setSelectedPeriod}
      setSelectedWeek={setSelectedWeek}
      setSettingsTab={setSettingsTab}
      setShopifyCredentials={setShopifyCredentials}
      setShowAdsBulkUpload={setShowAdsBulkUpload}
      setShowOnboarding={setShowOnboarding}
      setShowPdfExport={setShowPdfExport}
      setShowResetConfirm={setShowResetConfirm}
      setShowSaveConfirm={setShowSaveConfirm}
      setStoreLogo={setStoreLogo}
      setStoreName={setStoreName}
      setStores={setStores}
      setTheme={setTheme}
      setToast={setToast}
      setUploadTab={setUploadTab}
      setWeekNotes={setWeekNotes}
      settingsTab={settingsTab}
      shopifyCredentials={shopifyCredentials}
      showResetConfirm={showResetConfirm}
      skuDemandStatsRef={skuDemandStatsRef}
      storeLogo={storeLogo}
      storeName={storeName}
      stores={stores}
      theme={theme}
      toast={toast}
      setView={setView}
      view={view}
      save={save}
      queueCloudSave={queueCloudSave}
      pushToCloudNow={pushToCloudNow}
      supabase={supabase}
      accounts={accounts}
      best={best}
      bump={bump}
      categories={categories}
      entry={entry}
      m={m}
      metrics={metrics}
      prior={prior}
      result={result}
      saved={saved}
      show={show}
      shown={shown}
      sorted={sorted}
      status={status}
      store={store}
      t={t}
      transactions={transactions}
      uploads={uploads}
    />);
  }

  // Global modals that should render on any view
  const globalModalsElement = (
    <>
      <OnboardingWizard />
      <PdfExportModal />
      <ConfirmDialog />
    </>
  );

  return <div className="min-h-screen bg-slate-950 text-white p-6 flex items-center justify-center">{globalModalsElement}<div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>;
}
