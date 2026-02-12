import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Activity, AlertCircle, AlertTriangle, BarChart3, Brain, Building, Check, ChevronLeft, ChevronRight, CreditCard, DollarSign, Edit, EyeOff, FileText, Filter, Flag, GitCompareArrows, HelpCircle, Key, Landmark, LineChart, Package, Plus, RefreshCw, Save, Settings, ShoppingBag, Target, TrendingDown, TrendingUp, Upload, User, Wallet, X
} from 'lucide-react';
import { formatCurrency, formatPercent, formatNumber } from '../../utils/format';
import { parseQBOTransactions } from '../../utils/banking';

const getProfit = (obj) => {
  if (!obj) return 0;
  return obj.netProfit ?? obj.profit ?? 0;
};
import { hasDailySalesData } from '../../utils/date';
import { lsSet } from '../../utils/storage';
import NavTabs from '../ui/NavTabs';

const BankingView = ({
  allDaysData,
  allPeriodsData,
  allWeeksData,
  appSettings,
  bankingData,
  bankingDateRange,
  bankingDrilldown,
  bankingProcessing,
  bankingTab,
  channelPeriod,
  combinedData,
  confirmedRecurring,
  current,
  editingAccountBalance,
  editingTransaction,
  files,
  globalModals,
  invHistory,
  navDropdown,
  productionPipeline,
  profitTrackerCustomRange,
  profitTrackerPeriod,
  qboCredentials,
  recurringForm,
  selectedTxnIds,
  setBankingData,
  setBankingDateRange,
  setBankingDrilldown,
  setBankingProcessing,
  setBankingTab,
  setChannelPeriod,
  setConfirmedRecurring,
  setEditingAccountBalance,
  setEditingTransaction,
  setNavDropdown,
  setProfitTrackerCustomRange,
  setProfitTrackerPeriod,
  setRecurringForm,
  setSelectedDay,
  setSelectedInvDate,
  setSelectedPeriod,
  setSelectedTxnIds,
  setSelectedWeek,
  setShowAddRecurring,
  setShowMergeModal,
  setToast,
  setUploadTab,
  showAddRecurring,
  showMergeModal,
  theme,
  setView,
  view,
  queueCloudSave
}) => {
  const now = new Date();
  
  // Helper to normalize vendor names (combine similar vendors)
  // User-defined vendor overrides: { 'original vendor lowercase': 'Display Name' }
  const vendorOverrides = bankingData.vendorOverrides || {};
  
  const normalizeVendor = (vendor) => {
    if (!vendor) return vendor;
    const v = vendor.toLowerCase().trim();
    
    // Check user-defined vendor overrides FIRST
    if (vendorOverrides[v]) return vendorOverrides[v];
    for (const [pattern, replacement] of Object.entries(vendorOverrides)) {
      if (v.includes(pattern.toLowerCase())) return replacement;
    }
    
    // Combine Marpac variants
    if (v.includes('marpac')) return 'Marpac';
    
    // Combine Formunova variants
    if (v.includes('formunova')) return 'FormuNova';
    
    // Combine Alibaba variants
    if (v.includes('alibaba')) return 'Alibaba';
    
    // Combine 3PL services under Excel 3PL (includes Findley)
    if (v.includes('3pl') || v.includes('excel 3pl') || v.includes('excel3pl') || v.includes('findley')) return 'Excel 3PL';
    
    // Combine Shulman Rogers variants (law firm)
    if (v.includes('shulman rogers') || v.includes('shulman') || (v.includes('rogers') && v.includes('law'))) return 'Shulman Rogers';
    
    // Combine Amazon variants (but keep as vendor, not the marketplace)
    if (v.includes('amazon') && !v.includes('seller') && !v.includes('marketplace')) {
      if (v.includes('advertising') || v.includes('ads')) return 'Amazon Advertising';
      return 'Amazon';
    }
    
    // Combine Shopify variants
    if (v.includes('shopify')) return 'Shopify';
    
    // Combine PayPal variants
    if (v.includes('paypal')) return 'PayPal';
    
    // Combine UPS variants
    if (v.includes('ups') && (v.includes('ship') || v.includes('freight') || v.length < 10)) return 'UPS';
    
    // Combine FedEx variants
    if (v.includes('fedex')) return 'FedEx';
    
    // Combine USPS variants
    if (v.includes('usps') || v.includes('postal')) return 'USPS';
    
    // Add other vendor normalizations as needed
    return vendor;
  };
  
  // Helper to normalize category names (combine COGS variants)
  const normalizeCategory = (cat) => {
    if (!cat) return 'Uncategorized';
    const c = cat.toLowerCase();
    // Combine all COGS variants
    if (c.includes('cost of goods sold') || 
        c.startsWith('cogs') || 
        c.includes(':cogs') ||
        c.includes('supplies & materials') ||
        c.includes('inventory') ||
        c.includes('product costs')) {
      return 'Cost of Goods Sold';
    }
    // Combine Legal/Accounting variants
    if (c.includes('legal') && c.includes('accounting')) {
      return 'Legal & Accounting';
    }
    if (c.includes('legal') && c.includes('fees')) {
      return 'Legal & Accounting';
    }
    // Combine Advertising variants
    if (c.includes('advertising') || c.includes('marketing')) {
      return 'Advertising & Marketing';
    }
    // Combine Utilities variants
    if (c.includes('utilities')) {
      return 'Utilities';
    }
    // For sub-categories, use the parent category
    if (c.includes(':')) {
      // Return the parent category (before the colon)
      return cat.split(':')[0].trim();
    }
    return cat;
  };
  
  // Helper to detect if a category is actually a bank/credit card account (not a real expense category)
  // These are PAYMENTS to accounts, not expenses - they would double-count
  const isAccountCategory = (cat) => {
    if (!cat) return false;
    const c = cat.toLowerCase();
    
    // Only match if the category looks like an actual financial account
    // Must have BOTH an account keyword AND an account number pattern like (1234) - XXXX
    const hasAccountNumber = /\(\d{4}\)\s*[-–]/.test(cat);
    
    const isCardAccount = (
      (c.includes('card') || c.includes('amex') || c.includes('visa') || c.includes('mastercard') || c.includes('discover')) &&
      hasAccountNumber
    );
    const isBankTransferAccount = (
      (c.includes('checking') || c.includes('savings') || c.includes('operations') || c.includes('money market')) &&
      hasAccountNumber
    );
    
    return isCardAccount || isBankTransferAccount;
  };
  
  // Pre-calculate whether credit card accounts exist (for CC payment handling)
  const hasCCAccounts = (bankingData.transactions || []).some(tx => tx.accountType === 'credit_card');
  
  // Pre-calculate whether we have bank-level deposit data (CSV uploads with actual bank transactions)
  // If we do, then Sales Receipts / Invoices / "income" type entries WITHOUT a bank account are
  // accrual-basis duplicates — the cash already shows up as a Deposit on the checking account
  const hasBankDeposits = (bankingData.transactions || []).some(tx => 
    tx.accountType === 'checking' && (tx.type || '').toLowerCase() === 'deposit'
  );
  
  // Transform transactions to ensure they have correct flags
  // Three sources of data:
  // 1. CSV-parsed bank account transactions (have accountType) → trust parser's isIncome/isExpense
  // 2. QBO API-synced transactions (have qboId/qboType) → trust API's type='income'/'expense'
  // 3. Legacy/other transactions → derive from type field
  const transformedTxns = (bankingData.transactions || []).map(t => {
    // Normalize vendor and category
    const normalizedVendor = normalizeVendor(t.vendor);
    const normalizedCategory = normalizeCategory(t.topCategory || t.category || t.account);
    
    const typeLower = (t.type || '').toLowerCase();
    const qboTypeLower = (t.qboType || '').toLowerCase();
    
    // Check data source
    const isOnBankAccount = !!t.accountType; // CSV-parsed
    const isQboApiTransaction = !!(t.qboId || t.id?.startsWith('qbo-')); // QBO API-synced
    
    // === SOURCE 1: CSV-parsed bank account transactions ===
    // Trust the parser's original flags - EXCEPT for Credit Card Payments
    // CC Payments are cash movement (paying down debt), not new expenses
    // The actual expenses were recorded when charges hit the CC account
    if (isOnBankAccount) {
      const isCCPayment = typeLower === 'credit card payment';
      return {
        ...t,
        isIncome: t.isIncome || false,
        isExpense: isCCPayment ? false : (t.isExpense || false), // CC Payments are NOT expenses
        isTransfer: isCCPayment, // Treat CC payments as transfers (internal cash movement)
        amount: Math.abs(t.amount || t.originalAmount || 0),
        topCategory: normalizedCategory,
        vendor: normalizedVendor,
      };
    }
    
    // === SOURCE 2: QBO API-synced transactions ===
    // For CASH-BASIS accounting (matching QBO P&L reports):
    // - Income = only Deposits (actual cash received into bank)
    // - Expenses = only Purchases (actual cash spent)
    // Skip: SalesReceipts, Invoices, Payments (duplicates or accrual entries)
    // Skip: Bills (accrual - the Purchase is the cash expense)
    if (isQboApiTransaction) {
      let isIncome = false;
      let isExpense = false;
      let isTransfer = false;
      
      // Detect transaction type from qboType field OR from ID prefix
      // (some older data may not have qboType but ID shows the entity type)
      const idPrefix = (t.id || '').toLowerCase().split('-')[1] || ''; // 'qbo-deposit-123' → 'deposit'
      const effectiveQboType = qboTypeLower || idPrefix;
      
      // Cash-basis: Only count actual cash movements
      if (effectiveQboType === 'deposit') {
        // Deposit = actual cash received in bank account
        isIncome = true;
      } else if (effectiveQboType === 'purchase') {
        // Purchase = actual cash spent (includes CC charges, checks, etc.)
        isExpense = true;
      } else if (effectiveQboType === 'refundreceipt' || effectiveQboType === 'refund') {
        // Refunds = cash going out to customers
        isExpense = true;
      } else if (typeLower === 'transfer' || effectiveQboType === 'transfer') {
        // Transfers = internal cash movement, not income/expense
        isTransfer = true;
      }
      // Skip: salesreceipt, invoice, payment, bill, billpayment
      // These are either accrual entries or duplicates of Deposits/Purchases
      
      return {
        ...t,
        isIncome,
        isExpense,
        isTransfer,
        amount: Math.abs(t.amount || t.originalAmount || 0),
        topCategory: normalizedCategory,
        vendor: normalizedVendor,
      };
    }
    
    // === SOURCE 3: Legacy/other transactions — derive from type field ===
    const categoryIsAccount = isAccountCategory(t.topCategory || t.category);
    const isInterAccountTransfer = typeLower === 'transfer' && categoryIsAccount;
    const isJournalEntry = typeLower === 'journal entry';
    
    let isIncome = false;
    let isExpense = false;
    
    const hasOriginalSign = t.originalAmount !== undefined && t.originalAmount !== null;
    
    if (isJournalEntry || isInterAccountTransfer) {
      // Skip: journal entries and inter-account transfers are not income/expense
    } else if (typeLower === 'sales receipt' || typeLower === 'invoice') {
      if (!hasBankDeposits) {
        isIncome = true;
      }
    } else if (typeLower === 'deposit' || typeLower === 'bank deposit') {
      isIncome = true;
    } else if (typeLower === 'income') {
      isIncome = true;
    } else if (typeLower === 'payment') {
      if (hasOriginalSign) {
        if (t.originalAmount >= 0) isIncome = true;
        else isExpense = !categoryIsAccount;
      } else {
        isIncome = t.isIncome || false;
        isExpense = (t.isExpense || false) && !categoryIsAccount;
      }
    } else if (typeLower === 'refund receipt' || typeLower === 'credit memo') {
      isExpense = true;
    } else if (typeLower === 'transfer' && !categoryIsAccount) {
      isIncome = t.isIncome || false;
      isExpense = t.isExpense || false;
    } else if (typeLower === 'expense' || typeLower === 'check' || typeLower === 'payroll check') {
      if (!categoryIsAccount) {
        isExpense = true;
      }
    } else if (typeLower === 'bill' || typeLower === 'bill payment') {
      if (!categoryIsAccount) {
        isExpense = true;
      }
    } else if (typeLower === 'credit card payment') {
      if (hasCCAccounts) {
        isExpense = false;
        isIncome = false;
      }
    } else if (t.isIncome !== undefined) {
      isIncome = t.isIncome;
      isExpense = t.isExpense && !categoryIsAccount;
    } else {
      if (hasOriginalSign) {
        if (t.originalAmount > 0) isIncome = true;
        else if (t.originalAmount < 0) isExpense = true;
      } else {
        isIncome = true; // Catch-all: positive amount
      }
    }
    
    return {
      ...t,
      isIncome,
      isExpense,
      isTransfer: isInterAccountTransfer || false,
      amount: Math.abs(t.amount || t.originalAmount || 0),
      topCategory: normalizedCategory,
      vendor: normalizedVendor,
    };
  });
  
  // ========= DEDUPLICATE transactions (CSV-parsed + API-synced can overlap) =========
  // QBO CSV uploads create IDs like "2026-01-03-General_Oper-150.00-abc"
  // QBO API syncs create IDs like "qbo-deposit-4468"
  // Same transactions get stored twice with different IDs — dedup by (date, amount, account)
  const dedupedTxns = (() => {
    const seen = new Map(); // key → { index, txn }
    const result = [];
    
    // Sort: bank-account transactions first (they have accountType and correct cash flow flags),
    // then API transactions (richer metadata but may be accrual-basis duplicates)
    const sorted = [...transformedTxns].sort((a, b) => {
      const aHasClass = (a.isIncome || a.isExpense) ? 0 : 1;
      const bHasClass = (b.isIncome || b.isExpense) ? 0 : 1;
      if (aHasClass !== bHasClass) return aHasClass - bHasClass; // Prefer classified transactions
      const aIsBank = a.accountType ? 0 : 1;
      const bIsBank = b.accountType ? 0 : 1;
      return aIsBank - bIsBank; // Then prefer bank-account transactions
    });
    
    sorted.forEach(t => {
      // Create a dedup key from date + absolute amount + account prefix
      // DO NOT include vendor - CSV and API often have different vendor values for the same transaction
      // (e.g., CSV has "Shopify" but API has empty vendor for the same deposit)
      const amt = Math.round(Math.abs(t.amount || 0) * 100); // cents to avoid float issues
      const acctKey = (t.account || '').substring(0, 20).toLowerCase().replace(/[^a-z0-9]/g, '');
      const dedupKey = `${t.date || ''}-${amt}-${acctKey}`;
      
      if (!seen.has(dedupKey)) {
        seen.set(dedupKey, { index: result.length, txn: t });
        result.push(t);
      } else {
        // If existing entry was skipped (neither income nor expense) but this one is classified,
        // replace with the classified version (bank-level cash flow beats accrual-basis API entry)
        const existing = seen.get(dedupKey);
        if (!existing.txn.isIncome && !existing.txn.isExpense && (t.isIncome || t.isExpense)) {
          result[existing.index] = t;
          seen.set(dedupKey, { index: existing.index, txn: t });
        }
      }
    });
    
    return result;
  })();
  
  const sortedTxns = [...dedupedTxns].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const categories = bankingData.categories || {};
  const accounts = bankingData.accounts || {};
  const monthlySnapshots = bankingData.monthlySnapshots || {};
  
  // Calculate date filter
  const getDateFilter = () => {
    const today = new Date();
    switch (bankingDateRange) {
      case 'week': return new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      case 'month': return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      case 'quarter': return new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1).toISOString().split('T')[0];
      case 'ytd': return `${today.getFullYear()}-01-01`;
      case 'year': return new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      default: return '1900-01-01';
    }
  };
  const dateFilter = getDateFilter();
  const filteredTxns = sortedTxns.filter(t => t.date >= dateFilter);
  
  // Calculate totals (excluding credit card payments which would double-count)
  const totalIncome = filteredTxns.filter(t => t.isIncome).reduce((s, t) => s + t.amount, 0);
  const totalExpenses = filteredTxns.filter(t => t.isExpense).reduce((s, t) => s + t.amount, 0);
  const netCashFlow = totalIncome - totalExpenses;
  
  // Group by category for filtered transactions (with normalized categories)
  const expensesByCategory = {};
  const incomeByCategory = {};
  filteredTxns.forEach(t => {
    const cat = normalizeCategory(t.topCategory);
    if (t.isExpense) {
      if (!expensesByCategory[cat]) expensesByCategory[cat] = 0;
      expensesByCategory[cat] += t.amount;
    } else if (t.isIncome) {
      if (!incomeByCategory[cat]) incomeByCategory[cat] = 0;
      incomeByCategory[cat] += t.amount;
    }
  });
  
  // Sort categories by amount - ALL categories for detailed tabs
  const topExpenseCategories = Object.entries(expensesByCategory).sort((a, b) => b[1] - a[1]);
  const topIncomeCategories = Object.entries(incomeByCategory).sort((a, b) => b[1] - a[1]);
  
  // Calculate monthly data from transactions (for avg profit display)
  const monthlyFromTxns = {};
  sortedTxns.forEach(t => {
    const month = t.date?.substring(0, 7);
    if (!month) return;
    if (!monthlyFromTxns[month]) {
      monthlyFromTxns[month] = { income: 0, expenses: 0, net: 0 };
    }
    if (t.isIncome) {
      monthlyFromTxns[month].income += t.amount;
      monthlyFromTxns[month].net += t.amount;
    }
    if (t.isExpense) {
      monthlyFromTxns[month].expenses += t.amount;
      monthlyFromTxns[month].net -= t.amount;
    }
  });
  const monthKeysFromTxns = Object.keys(monthlyFromTxns).sort().slice(-12);
  
  // ==================== RECURRING EXPENSE DETECTION ====================
  // Detect recurring expenses by looking for same vendor + similar amount across multiple months
  // AND by looking for exact same dollar amounts appearing in multiple months
  const detectRecurringExpenses = () => {
    // APPROACH 1: Group all expenses by vendor (from description) and track monthly occurrences
    const vendorPatterns = {};
    
    // APPROACH 2: Group by exact dollar amount to catch recurring charges
    const amountPatterns = {};
    
    // Process all expenses
    sortedTxns.filter(t => t.isExpense && t.amount > 10).forEach(t => {
      // Extract vendor from description (first part before common separators)
      const desc = (t.description || '').toUpperCase();
      const vendor = desc.split(/\s+(PAYMENT|AUTOPAY|ACH|DEBIT|BILL|#|\d{4,})/)[0].trim().substring(0, 40);
      const month = t.date.substring(0, 7); // YYYY-MM
      
      // Track by vendor
      if (vendor && vendor.length >= 3) {
        const key = vendor;
        if (!vendorPatterns[key]) {
          vendorPatterns[key] = {
            vendor: vendor,
            category: t.topCategory,
            months: {},
            amounts: [],
            descriptions: new Set(),
            txnIds: [],
          };
        }
        
        if (!vendorPatterns[key].months[month]) {
          vendorPatterns[key].months[month] = { total: 0, count: 0, amounts: [] };
        }
        vendorPatterns[key].months[month].total += t.amount;
        vendorPatterns[key].months[month].count++;
        vendorPatterns[key].months[month].amounts.push(t.amount);
        vendorPatterns[key].amounts.push(t.amount);
        vendorPatterns[key].descriptions.add(t.description?.substring(0, 50));
        vendorPatterns[key].txnIds.push(t.id);
      }
      
      // Track by exact amount (for subscriptions that may have different descriptions)
      const amountKey = t.amount.toFixed(2);
      if (!amountPatterns[amountKey]) {
        amountPatterns[amountKey] = {
          amount: t.amount,
          months: {},
          vendors: new Set(),
          descriptions: new Set(),
          category: t.topCategory,
          txnIds: [],
        };
      }
      if (!amountPatterns[amountKey].months[month]) {
        amountPatterns[amountKey].months[month] = { count: 0, dates: [] };
      }
      amountPatterns[amountKey].months[month].count++;
      amountPatterns[amountKey].months[month].dates.push(t.date);
      amountPatterns[amountKey].vendors.add(vendor || 'Unknown');
      amountPatterns[amountKey].descriptions.add(t.description?.substring(0, 50));
      amountPatterns[amountKey].txnIds.push(t.id);
    });
    
    // Analyze patterns
    const recurring = [];
    const allMonths = [...new Set(sortedTxns.map(t => t.date.substring(0, 7)))].sort();
    const recentMonths = allMonths.slice(-6); // Look at last 6 months
    const usedKeys = new Set(); // Prevent duplicates
    
    // VENDOR-BASED DETECTION (original approach)
    Object.entries(vendorPatterns).forEach(([key, pattern]) => {
      const monthsWithCharges = Object.keys(pattern.months).filter(m => recentMonths.includes(m));
      if (monthsWithCharges.length < 2) return; // Need at least 2 months
      
      // Calculate typical monthly amount (median to avoid outliers)
      const monthlyAmounts = monthsWithCharges.map(m => pattern.months[m].total).sort((a, b) => a - b);
      const medianAmount = monthlyAmounts[Math.floor(monthlyAmounts.length / 2)];
      
      // Check consistency - amounts should be within 30% of median (relaxed from 20%)
      const isConsistent = monthlyAmounts.every(a => Math.abs(a - medianAmount) / medianAmount < 0.3);
      
      // Calculate average amount
      const avgAmount = monthlyAmounts.reduce((s, a) => s + a, 0) / monthlyAmounts.length;
      
      // Include if appears in 2+ months with any amount > $25
      if (avgAmount >= 25 && monthsWithCharges.length >= 2) {
        const isConfirmed = confirmedRecurring[key]?.confirmed;
        const isIgnored = confirmedRecurring[key]?.ignored || confirmedRecurring[key]?.notRecurring;
        
        usedKeys.add(key);
        recurring.push({
          key,
          vendor: pattern.vendor,
          category: pattern.category,
          monthlyAmount: Math.round(avgAmount),
          frequency: monthsWithCharges.length,
          totalMonths: recentMonths.length,
          consistency: isConsistent ? 'high' : 'medium',
          description: [...pattern.descriptions][0] || pattern.vendor,
          confirmed: isConfirmed || false,
          ignored: isIgnored || false,
          annualCost: Math.round(avgAmount * 12),
          detectionType: 'vendor',
        });
      }
    });
    
    // EXACT AMOUNT DETECTION (new approach for subscriptions with varying descriptions)
    Object.entries(amountPatterns).forEach(([amountKey, pattern]) => {
      const monthsWithCharges = Object.keys(pattern.months).filter(m => recentMonths.includes(m));
      if (monthsWithCharges.length < 2) return; // Need at least 2 months
      
      // Skip small amounts
      if (pattern.amount < 10) return;
      
      // Check if this is truly recurring (same amount, appears once per month typically)
      const avgChargesPerMonth = monthsWithCharges.reduce((s, m) => s + pattern.months[m].count, 0) / monthsWithCharges.length;
      
      // Only flag if it's roughly once per month (1-2 charges) and appears consistently
      if (avgChargesPerMonth > 3) return; // Too many charges, probably not a subscription
      
      // Create a unique key combining amount and first vendor
      const vendorList = [...pattern.vendors];
      const primaryVendor = vendorList[0] || 'Unknown';
      const key = `AMOUNT_${amountKey}_${primaryVendor.substring(0, 10)}`;
      
      // Skip if we already have this from vendor detection
      if (usedKeys.has(primaryVendor)) return;
      
      const isConfirmed = confirmedRecurring[key]?.confirmed;
      const isIgnored = confirmedRecurring[key]?.ignored || confirmedRecurring[key]?.notRecurring;
      
      recurring.push({
        key,
        vendor: vendorList.length > 1 ? `${primaryVendor} (+${vendorList.length - 1} more)` : primaryVendor,
        category: pattern.category,
        monthlyAmount: Math.round(pattern.amount),
        frequency: monthsWithCharges.length,
        totalMonths: recentMonths.length,
        consistency: 'exact', // Exact same amount
        description: [...pattern.descriptions][0] || `$${pattern.amount.toFixed(2)} charge`,
        confirmed: isConfirmed || false,
        ignored: isIgnored || false,
        annualCost: Math.round(pattern.amount * 12),
        detectionType: 'amount',
      });
    });
    
    // ADD MANUALLY FLAGGED TRANSACTIONS as recurring
    Object.entries(confirmedRecurring).forEach(([key, data]) => {
      if (data.flaggedFromTxn && data.confirmed && !data.manual) {
        // This was flagged from a transaction
        recurring.push({
          key,
          vendor: data.vendor || key,
          category: data.category || 'Flagged',
          monthlyAmount: data.amount || 0,
          frequency: 12, // Assume monthly
          totalMonths: 12,
          consistency: 'flagged',
          description: data.description || data.vendor,
          confirmed: true,
          ignored: false,
          annualCost: (data.amount || 0) * 12,
          detectionType: 'flagged',
        });
      }
    });
    
    // Sort by annual cost
    return recurring.sort((a, b) => b.annualCost - a.annualCost);
  };
  
  const detectedRecurring = detectRecurringExpenses();
  
  // Get manually added recurring expenses
  const manualRecurring = Object.entries(confirmedRecurring)
    .filter(([_, data]) => data.manual && data.confirmed)
    .map(([key, data]) => ({
      key,
      vendor: data.vendor,
      category: data.category,
      monthlyAmount: data.amount,
      annualCost: (data.amount || 0) * 12,
      frequency: 12,
      totalMonths: 12,
      consistency: 'high',
      description: data.notes || data.vendor,
      confirmed: true,
      manual: true,
    }));
  
  const confirmedRecurringList = [
    ...detectedRecurring.filter(r => r.confirmed && r.monthlyAmount > 0),
    ...manualRecurring.filter(r => r.monthlyAmount > 0),
  ];
  const pendingRecurringList = detectedRecurring.filter(r => !r.confirmed && !r.ignored && r.monthlyAmount > 0);
  const totalMonthlyRecurring = confirmedRecurringList.reduce((s, r) => s + (r.monthlyAmount || 0), 0);
  const totalAnnualRecurring = totalMonthlyRecurring * 12;
  
  // Calculate EOY projection using recurring expenses
  const today = new Date();
  const currentMonth = today.getMonth(); // 0-11
  const remainingMonths = 12 - currentMonth - 1; // Months left in year (not counting current)
  const projectedRecurringCosts = totalMonthlyRecurring * remainingMonths;
  
  // Get period label for headers
  const getPeriodLabel = () => {
    switch (bankingDateRange) {
      case 'week': return 'Last 7 Days';
      case 'month': return 'This Month';
      case 'quarter': return 'This Quarter';
      case 'ytd': return 'Year to Date';
      case 'year': return 'Last 12 Months';
      default: return 'All Time';
    }
  };
  const periodLabel = getPeriodLabel();
  
  // Check if data is stale
  const isDataStale = !bankingData.lastUpload || 
    new Date().toDateString() !== new Date(bankingData.lastUpload).toDateString();
  const isQboConnected = qboCredentials?.connected;
  
  // Monthly trend data
  const monthKeys = Object.keys(monthlySnapshots).sort().slice(-12);
  
  // Handle file upload
  const handleBankingUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setBankingProcessing(true);
    try {
      const content = await file.text();
      // Pass existing category overrides to parser
      const parsed = parseQBOTransactions(content, bankingData.categoryOverrides || {});
      
      if (parsed.transactions.length === 0) {
        setToast({ message: 'No transactions found in file', type: 'error' });
        setBankingProcessing(false);
        return;
      }
      
      // Smart merge: deduplicate transactions based on ID
      let mergedTransactions = parsed.transactions;
      let newCount = parsed.transactions.length;
      let duplicateCount = 0;
      
      if (bankingData.transactions?.length > 0) {
        const existingIds = new Set(bankingData.transactions.map(t => t.id));
        const newTxns = parsed.transactions.filter(t => !existingIds.has(t.id));
        duplicateCount = parsed.transactions.length - newTxns.length;
        
        // Merge: keep existing transactions, add only new ones
        // Sort by date to maintain chronological order
        mergedTransactions = [...bankingData.transactions, ...newTxns]
          .sort((a, b) => b.date.localeCompare(a.date));
        newCount = newTxns.length;
      }
      
      // Recalculate all aggregates from merged transactions
      const accounts = {};
      const categories = {};
      const monthlySnapshots = {};
      
      // Track net change from new transactions for each account
      const newTxnNetByAccount = {};
      
      mergedTransactions.forEach(txn => {
        // Account aggregates
        if (!accounts[txn.account]) {
          // Start with existing balance if we have prior data, otherwise use parsed balance
          const existingBalance = bankingData.accounts?.[txn.account]?.balance;
          const existingInitialBalance = bankingData.accounts?.[txn.account]?.initialBalance;
          accounts[txn.account] = { 
            name: txn.account, 
            type: txn.accountType, 
            transactions: 0, 
            totalIn: 0, 
            totalOut: 0,
            // Preserve initial balance if set, or use existing balance as starting point
            initialBalance: existingInitialBalance ?? existingBalance ?? 0,
            balance: existingBalance ?? parsed.accounts[txn.account]?.balance ?? 0,
          };
        }
        accounts[txn.account].transactions++;
        if (txn.isIncome) accounts[txn.account].totalIn += txn.amount;
        if (txn.isExpense) accounts[txn.account].totalOut += txn.amount;
        
        // Category aggregates
        const cat = txn.topCategory || 'Uncategorized';
        if (!categories[cat]) categories[cat] = { totalIn: 0, totalOut: 0, count: 0, subcategories: {} };
        categories[cat].count++;
        if (txn.isIncome) categories[cat].totalIn += txn.amount;
        if (txn.isExpense) categories[cat].totalOut += txn.amount;
        
        // Monthly snapshots
        const month = txn.date.substring(0, 7);
        if (!monthlySnapshots[month]) monthlySnapshots[month] = { income: 0, expenses: 0, net: 0, transactions: 0 };
        monthlySnapshots[month].transactions++;
        if (txn.isIncome) {
          monthlySnapshots[month].income += txn.amount;
          monthlySnapshots[month].net += txn.amount;
        }
        if (txn.isExpense) {
          monthlySnapshots[month].expenses += txn.amount;
          monthlySnapshots[month].net -= txn.amount;
        }
      });
      
      // Update account balances properly:
      // - If balance was manually set, preserve it and add net of new transactions
      // - If we had existing data, add the NET of new transactions to existing balance
      // - If this is first upload, use parsed balance from QBO
      if (bankingData.transactions?.length > 0 && newCount > 0) {
        // Calculate net change from NEW transactions only
        const newTxns = parsed.transactions.filter(t => !new Set(bankingData.transactions.map(bt => bt.id)).has(t.id));
        const netByAccount = {};
        newTxns.forEach(txn => {
          if (!netByAccount[txn.account]) netByAccount[txn.account] = 0;
          if (txn.isIncome) netByAccount[txn.account] += txn.amount;
          if (txn.isExpense) netByAccount[txn.account] -= txn.amount;
        });
        
        // Apply net change to existing balances
        Object.entries(netByAccount).forEach(([acctName, netChange]) => {
          if (accounts[acctName]) {
            const existingBal = bankingData.accounts?.[acctName]?.balance || 0;
            const wasManuallySet = bankingData.accounts?.[acctName]?.balanceManuallySet;
            accounts[acctName].balance = existingBal + netChange;
            // Preserve manual set flag
            if (wasManuallySet) {
              accounts[acctName].balanceManuallySet = true;
              accounts[acctName].balanceSetDate = bankingData.accounts[acctName].balanceSetDate;
            }
          }
        });
      } else {
        // First upload - use parsed balances (net of transactions in report)
        // User may need to set initial balance manually
        Object.entries(parsed.accounts).forEach(([name, acct]) => {
          if (accounts[name]) {
            accounts[name].balance = acct.balance || 0;
          }
        });
      }
      
      // Calculate date range
      const dates = mergedTransactions.map(t => t.date).sort();
      const dateRange = { 
        start: dates[0], 
        end: dates[dates.length - 1] 
      };
      
      const newBankingData = {
        transactions: mergedTransactions,
        accounts,
        categories,
        monthlySnapshots,
        dateRange,
        transactionCount: mergedTransactions.length,
        lastUpload: new Date().toISOString(),
        categoryOverrides: bankingData.categoryOverrides || {},
        vendorOverrides: bankingData.vendorOverrides || {},
        settings: bankingData.settings,
      };
      
      setBankingData(newBankingData);
      lsSet('ecommerce_banking_v1', JSON.stringify(newBankingData));
      queueCloudSave({ ...combinedData, bankingData: newBankingData });
      
      const message = duplicateCount > 0 
        ? `Added ${newCount} new transactions (${duplicateCount} duplicates skipped). Total: ${mergedTransactions.length}`
        : `Imported ${newCount} transactions from ${dateRange.start} to ${dateRange.end}`;
      setToast({ message, type: 'success' });
    } catch (err) {
      setToast({ message: 'Error parsing file: ' + err.message, type: 'error' });
    }
    setBankingProcessing(false);
    e.target.value = '';
  };
  
  // Handle category override for a transaction
  const handleCategoryChange = (txnId, newCategory) => {
    const newOverrides = { ...bankingData.categoryOverrides, [txnId]: newCategory };
    const newBankingData = {
      ...bankingData,
      categoryOverrides: newOverrides,
    };
    setBankingData(newBankingData);
    lsSet('ecommerce_banking_v1', JSON.stringify(newBankingData));
    queueCloudSave({ ...combinedData, bankingData: newBankingData });
    setToast({ message: 'Category updated', type: 'success' });
  };
  
  // Handle vendor rename (maps old vendor name → new display name for all transactions)
  const handleVendorRename = (oldVendorName, newVendorName) => {
    if (!oldVendorName || !newVendorName || oldVendorName === newVendorName) return;
    const existingOverrides = bankingData.vendorOverrides || {};
    const newOverrides = { ...existingOverrides, [oldVendorName.toLowerCase().trim()]: newVendorName.trim() };
    const newBankingData = { ...bankingData, vendorOverrides: newOverrides };
    setBankingData(newBankingData);
    lsSet('ecommerce_banking_v1', JSON.stringify(newBankingData));
    queueCloudSave({ ...combinedData, bankingData: newBankingData });
    setToast({ message: `Vendor renamed: "${oldVendorName}" → "${newVendorName}"`, type: 'success' });
  };
  
  // Handle bulk category update for all transactions from a specific vendor
  const handleVendorCategoryUpdate = (vendorName, newCategory) => {
    if (!vendorName || !newCategory) return;
    const newOverrides = { ...(bankingData.categoryOverrides || {}) };
    let count = 0;
    sortedTxns.filter(t => {
      const normalized = normalizeVendor(t.vendor);
      return normalized === vendorName && t.isExpense;
    }).forEach(t => {
      newOverrides[t.id] = newCategory;
      count++;
    });
    const newBankingData = { ...bankingData, categoryOverrides: newOverrides };
    setBankingData(newBankingData);
    lsSet('ecommerce_banking_v1', JSON.stringify(newBankingData));
    queueCloudSave({ ...combinedData, bankingData: newBankingData });
    setToast({ message: `Updated ${count} transactions for "${vendorName}" to category "${newCategory}"`, type: 'success' });
  };
  
  // Handle merging multiple transactions into one
  const handleMergeTransactions = (mergedVendor, mergedCategory, mergedIsExpense) => {
    if (selectedTxnIds.size < 2) return;
    
    const selectedTxns = sortedTxns.filter(t => selectedTxnIds.has(t.id));
    if (selectedTxns.length < 2) return;
    
    // Calculate merged amount
    const mergedAmount = selectedTxns.reduce((sum, t) => sum + (t.amount || 0), 0);
    const mergedIsIncome = !mergedIsExpense;
    
    // Use earliest date
    const dates = selectedTxns.map(t => t.date).sort();
    const mergedDate = dates[0];
    const mergedDateDisplay = selectedTxns.find(t => t.date === mergedDate)?.dateDisplay || mergedDate;
    
    // Create a merged transaction ID
    const mergedId = `merged-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    // Build merged memo from originals
    const mergedMemo = selectedTxns.map(t => `${t.vendor}: $${t.amount.toFixed(2)}`).join(' + ');
    
    const topCategory = mergedCategory.split(':')[0].trim();
    const subCategory = mergedCategory.includes(':') ? mergedCategory.split(':').slice(1).join(':').trim() : '';
    
    const mergedTxn = {
      id: mergedId,
      date: mergedDate,
      dateDisplay: mergedDateDisplay,
      type: 'Merged',
      vendor: mergedVendor,
      memo: mergedMemo,
      category: mergedCategory,
      originalCategory: mergedCategory,
      topCategory,
      subCategory,
      amount: mergedAmount,
      isIncome: mergedIsIncome,
      isExpense: mergedIsExpense,
      account: selectedTxns[0].account,
      accountType: selectedTxns[0].accountType,
      mergedFrom: selectedTxns.map(t => t.id), // Track originals
    };
    
    // Remove selected transactions and add merged one
    const removedIds = new Set(selectedTxns.map(t => t.id));
    const newTransactions = [
      mergedTxn,
      ...(bankingData.transactions || []).filter(t => !removedIds.has(t.id)),
    ];
    
    const newBankingData = {
      ...bankingData,
      transactions: newTransactions,
    };
    setBankingData(newBankingData);
    lsSet('ecommerce_banking_v1', JSON.stringify(newBankingData));
    queueCloudSave({ ...combinedData, bankingData: newBankingData });
    
    setSelectedTxnIds(new Set());
    setShowMergeModal(false);
    setToast({ message: `Merged ${selectedTxns.length} transactions into "${mergedVendor}" (${formatCurrency(mergedAmount)})`, type: 'success' });
  };
  

    return (
    <div className={`min-h-screen ${theme === 'light' ? 'bg-gray-100' : 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900'}`}>
      <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />
      <div className="max-w-7xl mx-auto px-4 py-6">
        {globalModals}
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white flex items-center gap-3">
              <Landmark className="w-8 h-8 text-green-400" />
              Banking & Cash Flow
            </h1>
            <p className="text-slate-400 mt-1">
              {bankingData.lastUpload 
                ? `Last updated: ${new Date(bankingData.lastUpload).toLocaleString()}`
                : 'Upload your QBO transaction export to get started'}
              {bankingData.transactions?.length > 0 && ` • ${bankingData.transactions.length} transactions`}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Stale Data Alert - suppress if QBO auto-sync is connected */}
            {isDataStale && !isQboConnected && bankingData.transactions?.length > 0 && (
              <div className="px-3 py-2 bg-amber-500/20 border border-amber-500/50 rounded-lg text-amber-300 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Banking data not uploaded today
              </div>
            )}
            
            {/* Upload Button */}
            <label className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-white font-medium cursor-pointer flex items-center gap-2 transition-colors">
              <Upload className="w-4 h-4" />
              {bankingProcessing ? 'Processing...' : 'Upload QBO Export'}
              <input type="file" accept=".csv" onChange={handleBankingUpload} className="hidden" disabled={bankingProcessing} />
            </label>
          </div>
        </div>
        
        {/* Date Range Selector */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {[
            { key: 'week', label: 'Last 7 Days' },
            { key: 'month', label: 'This Month' },
            { key: 'quarter', label: 'This Quarter' },
            { key: 'ytd', label: 'Year to Date' },
            { key: 'year', label: 'Last 12 Months' },
            { key: 'all', label: 'All Time' },
          ].map(r => (
            <button
              key={r.key}
              onClick={() => setBankingDateRange(r.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                bankingDateRange === r.key 
                  ? 'bg-green-600 text-white' 
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        
        {bankingData.transactions?.length === 0 ? (
          /* Empty State */
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-12 text-center">
            <Landmark className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">No Banking Data Yet</h2>
            <p className="text-slate-400 mb-6 max-w-md mx-auto">
              Upload your QuickBooks Online Transaction Detail by Account report to analyze your cash flow, expenses, and profitability.
            </p>
            <label className="px-6 py-3 bg-green-600 hover:bg-green-500 rounded-xl text-white font-medium cursor-pointer inline-flex items-center gap-2 transition-colors">
              <Upload className="w-5 h-5" />
              Upload QBO Export (.csv)
              <input type="file" accept=".csv" onChange={handleBankingUpload} className="hidden" />
            </label>
          </div>
        ) : (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gradient-to-br from-emerald-900/40 to-emerald-800/20 rounded-xl border border-emerald-500/30 p-5 group relative" title="Total deposits and incoming payments for the selected period. Includes Amazon/Shopify payouts, customer payments, and other income.">
                <p className="text-emerald-400 text-sm font-medium mb-1 flex items-center gap-1">Total Income <HelpCircle className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" /></p>
                <p className="text-2xl font-bold text-white">{formatCurrency(totalIncome)}</p>
                <p className="text-slate-400 text-xs mt-1">{filteredTxns.filter(t => t.isIncome).length} deposits</p>
              </div>
              <div className="bg-gradient-to-br from-rose-900/40 to-rose-800/20 rounded-xl border border-rose-500/30 p-5 group relative" title="Total outgoing payments for the selected period. Includes checks, bill payments, credit card charges, payroll, and other expenses. Excludes inter-account transfers.">
                <p className="text-rose-400 text-sm font-medium mb-1 flex items-center gap-1">Total Expenses <HelpCircle className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" /></p>
                <p className="text-2xl font-bold text-white">{formatCurrency(totalExpenses)}</p>
                <p className="text-slate-400 text-xs mt-1">{filteredTxns.filter(t => t.isExpense).length} expenses</p>
              </div>
              <div className={`bg-gradient-to-br ${netCashFlow >= 0 ? 'from-blue-900/40 to-blue-800/20 border-blue-500/30' : 'from-amber-900/40 to-amber-800/20 border-amber-500/30'} rounded-xl border p-5 group relative`} title="Income minus Expenses. This is cash flow, NOT profit. Income reflects marketplace payouts (after marketplace fees) but does NOT deduct COGS. Positive = more cash coming in than going out.">
                <p className={`${netCashFlow >= 0 ? 'text-blue-400' : 'text-amber-400'} text-sm font-medium mb-1 flex items-center gap-1`}>Net Cash Flow <HelpCircle className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" /></p>
                <p className="text-2xl font-bold text-white">{formatCurrency(netCashFlow)}</p>
                <p className="text-slate-400 text-xs mt-1">{totalIncome > 0 ? `${((netCashFlow / totalIncome) * 100).toFixed(1)}% margin` : (totalExpenses > 0 ? 'No income yet' : 'No transactions')}</p>
              </div>
              <div className="bg-gradient-to-br from-violet-900/40 to-violet-800/20 rounded-xl border border-violet-500/30 p-5 group relative" title="Average monthly net cash flow (income - expenses) across months in the selected period. Represents average monthly cash surplus/deficit based on bank transactions.">
                <p className="text-violet-400 text-sm font-medium mb-1 flex items-center gap-1">Avg Monthly Profit <HelpCircle className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" /></p>
                <p className="text-2xl font-bold text-white">
                  {formatCurrency((() => {
                    // Calculate avg monthly profit from FILTERED transactions (respects date range)
                    const filteredMonthly = {};
                    filteredTxns.forEach(t => {
                      const month = t.date?.substring(0, 7);
                      if (!month) return;
                      if (!filteredMonthly[month]) filteredMonthly[month] = { income: 0, expenses: 0, net: 0 };
                      if (t.isIncome) { filteredMonthly[month].income += t.amount; filteredMonthly[month].net += t.amount; }
                      if (t.isExpense) { filteredMonthly[month].expenses += t.amount; filteredMonthly[month].net -= t.amount; }
                    });
                    const filteredMonthKeys = Object.keys(filteredMonthly).sort();
                    return filteredMonthKeys.length > 0 
                      ? filteredMonthKeys.reduce((s, m) => s + (filteredMonthly[m]?.net || 0), 0) / filteredMonthKeys.length 
                      : 0;
                  })())}
                </p>
                <p className="text-slate-400 text-xs mt-1">{periodLabel}</p>
              </div>
            </div>
            
            {/* Account Balances - CFO Summary */}
            {Object.keys(bankingData.accounts || {}).length > 0 && (() => {
              // Filter to only show real bank accounts with actual balances
              const realAccts = Object.entries(bankingData.accounts).filter(([name, acct]) => {
                // Skip accounts with zero or near-zero balance
                if (acct.balance === undefined || isNaN(acct.balance)) return false;
                if (Math.abs(acct.balance) < 1) return false; // Skip balances under $1
                
                // Skip placeholder/empty accounts by name
                const lower = name.toLowerCase();
                if (lower === 'cash' || lower === 'amazon credit' || lower === 'petty cash') return false;
                
                // Skip if name looks corrupted (has quotes or is super long)
                if (name.includes('"')) return false;
                if (name.length > 100) return false;
                
                // Skip if name looks like a transaction description (has commas before account pattern)
                if (name.includes(',') && !/\(\d{4}\)/.test(name)) return false;
                
                // Skip if name contains common transaction words
                if (lower.includes('water') || lower.includes('filter') || lower.includes('purchase')) return false;
                
                // Include QBO synced accounts (verified real accounts with balance)
                if (acct.qboId) return true;
                
                // Accept accounts that have a balance and reasonable name
                const looksLikeAccount = (
                  /\(\d{4}\)/.test(name) || // Has (1234) pattern
                  (lower.includes('checking') && !name.includes(',')) ||
                  (lower.includes('savings') && !name.includes(',')) ||
                  (lower.includes('operations') && !name.includes(',')) ||
                  (lower.includes('card') && !name.includes(',')) ||
                  (lower.includes('credit') && !name.includes(',')) ||
                  (lower.includes('platinum') && !name.includes(',')) ||
                  (lower.includes('prime') && !name.includes(',')) ||
                  (lower.includes('business') && !name.includes(',')) ||
                  lower.includes('amex') ||
                  lower.includes('chase') ||
                  lower.includes('bank') ||
                  lower.includes('capital') ||
                  acct.type === 'credit_card'
                );
                return looksLikeAccount;
              });
              const checkingAccts = realAccts.filter(([_, a]) => a.type !== 'credit_card');
              const creditAccts = realAccts.filter(([_, a]) => a.type === 'credit_card');
              const totalCash = checkingAccts.reduce((s, [_, a]) => s + (a.balance || 0), 0);
              const totalDebt = creditAccts.reduce((s, [_, a]) => s + (a.balance || 0), 0);
              const netPosition = totalCash - totalDebt;
              
              if (realAccts.length === 0) return null;
              
              return (
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 mb-6">
                  {/* Summary Row */}
                  <div className="grid grid-cols-3 gap-4 mb-4 pb-4 border-b border-slate-700">
                    <div className="text-center">
                      <p className="text-emerald-400 text-xs font-medium mb-1">💵 Cash Available</p>
                      <p className="text-2xl font-bold text-emerald-400">{formatCurrency(totalCash)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-rose-400 text-xs font-medium mb-1">💳 Credit Card Debt</p>
                      <p className="text-2xl font-bold text-rose-400">{formatCurrency(totalDebt)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-slate-400 text-xs font-medium mb-1">📊 Net Position</p>
                      <p className={`text-2xl font-bold ${netPosition >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(netPosition)}</p>
                    </div>
                  </div>
                  
                  {/* Individual Accounts */}
                  <div className="space-y-2">
                    {realAccts.map(([name, acct]) => {
                      const isCard = acct.type === 'credit_card';
                      const balance = acct.balance || 0;
                      const shortName = name.split('(')[0].trim();
                      return (
                        <div key={name} className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-0">
                          <div className="flex items-center gap-2">
                            {isCard ? <CreditCard className="w-4 h-4 text-rose-400" /> : <Wallet className="w-4 h-4 text-emerald-400" />}
                            <span className="text-white text-sm">{shortName}</span>
                            <span className="text-slate-500 text-xs">({acct.transactions} txns)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`font-bold ${isCard ? 'text-rose-400' : 'text-emerald-400'}`}>
                              {formatCurrency(balance)}
                            </span>
                            <button
                              onClick={() => setEditingAccountBalance({ name, balance: Math.abs(balance), isCard })}
                              className="p-1 text-slate-500 hover:text-white hover:bg-slate-700 rounded transition-colors"
                              title="Edit balance"
                            >
                              <Settings className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-500 mt-3 text-center">
                    Click ⚙️ to manually correct balances • Re-upload QBO for latest transactions
                  </p>
                </div>
              );
            })()}
            
            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-slate-700 pb-2 overflow-x-auto">
              {[
                { key: 'overview', label: 'Overview', icon: BarChart3 },
                { key: 'cfo', label: 'CFO Dashboard', icon: Target },
                { key: 'channels', label: 'Channels', icon: ShoppingBag },
                { key: 'vendors', label: 'Vendors', icon: Building },
                { key: 'cards', label: 'Credit Cards', icon: CreditCard },
                { key: 'recurring', label: 'Recurring', icon: RefreshCw },
                { key: 'expenses', label: 'Expenses', icon: TrendingDown },
                { key: 'income', label: 'Income', icon: Wallet },
                { key: 'trends', label: 'Trends', icon: TrendingUp },
                { key: 'transactions', label: 'Transactions', icon: FileText },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => { setBankingTab(tab.key); setBankingDrilldown(null); }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap ${
                    bankingTab === tab.key 
                      ? 'bg-green-600 text-white' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>
            
            {/* Overview Tab */}
            {bankingTab === 'overview' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Expenses */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-rose-400" />
                    Top Expenses — {periodLabel}
                  </h3>
                  <div className="space-y-3">
                    {topExpenseCategories.length === 0 ? (
                      <p className="text-slate-500 text-sm">No expenses in this period</p>
                    ) : topExpenseCategories.slice(0, 8).map(([cat, amount], i) => (
                      <div 
                        key={cat} 
                        className="flex items-center gap-3 cursor-pointer hover:bg-slate-700/30 rounded-lg p-1 -mx-1 transition-colors"
                        onClick={() => { setBankingTab('expenses'); setBankingDrilldown({ category: cat, type: 'expense' }); }}
                      >
                        <div className="w-6 text-slate-500 text-sm">{i + 1}</div>
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-white truncate flex items-center gap-1">
                              {cat}
                              <ChevronRight className="w-3 h-3 text-slate-500" />
                            </span>
                            <span className="text-rose-400 font-medium">{formatCurrency(amount)}</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-rose-500/70 rounded-full"
                              style={{ width: `${(amount / (topExpenseCategories[0]?.[1] || 1)) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Top Income */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-emerald-400" />
                    Top Income — {periodLabel}
                  </h3>
                  <div className="space-y-3">
                    {topIncomeCategories.length === 0 ? (
                      <p className="text-slate-500 text-sm">No income in this period</p>
                    ) : topIncomeCategories.slice(0, 8).map(([cat, amount], i) => (
                      <div 
                        key={cat} 
                        className="flex items-center gap-3 cursor-pointer hover:bg-slate-700/30 rounded-lg p-1 -mx-1 transition-colors"
                        onClick={() => { setBankingTab('income'); setBankingDrilldown({ category: cat, type: 'income' }); }}
                      >
                        <div className="w-6 text-slate-500 text-sm">{i + 1}</div>
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-white truncate flex items-center gap-1">
                              {cat}
                              <ChevronRight className="w-3 h-3 text-slate-500" />
                            </span>
                            <span className="text-emerald-400 font-medium">{formatCurrency(amount)}</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-emerald-500/70 rounded-full"
                              style={{ width: `${(amount / (topIncomeCategories[0]?.[1] || 1)) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Profit Tracker Card */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-violet-400" />
                    Profit Tracker
                  </h3>
                  {(() => {
                    // Calculate profit based on QBO transactions
                    const calculateProfit = () => {
                      if (sortedTxns.length === 0) return { income: 0, expenses: 0, profit: 0, label: '', count: 0 };
                      
                      const now = new Date();
                      let filtered = [];
                      let label = '';
                      
                      switch (profitTrackerPeriod) {
                        case 'week': {
                          const weekStart = new Date(now);
                          weekStart.setDate(now.getDate() - now.getDay());
                          filtered = sortedTxns.filter(t => new Date(t.date) >= weekStart);
                          label = 'This Week';
                          break;
                        }
                        case 'month': {
                          const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                          filtered = sortedTxns.filter(t => t.date.startsWith(monthStr));
                          label = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                          break;
                        }
                        case 'quarter': {
                          const qMonth = Math.floor(now.getMonth() / 3) * 3;
                          const qStart = new Date(now.getFullYear(), qMonth, 1);
                          filtered = sortedTxns.filter(t => new Date(t.date) >= qStart);
                          label = `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
                          break;
                        }
                        case 'year': {
                          const yearStr = String(now.getFullYear());
                          filtered = sortedTxns.filter(t => t.date.startsWith(yearStr));
                          label = now.getFullYear().toString();
                          break;
                        }
                        case 'all': {
                          filtered = sortedTxns;
                          const years = [...new Set(sortedTxns.map(t => t.date.substring(0, 4)))].sort();
                          label = years.length > 1 ? `${years[0]} - ${years[years.length - 1]}` : years[0] || 'All Time';
                          break;
                        }
                        case 'custom': {
                          if (profitTrackerCustomRange.start && profitTrackerCustomRange.end) {
                            filtered = sortedTxns.filter(t => t.date >= profitTrackerCustomRange.start && t.date <= profitTrackerCustomRange.end);
                            label = `${profitTrackerCustomRange.start} to ${profitTrackerCustomRange.end}`;
                          }
                          break;
                        }
                        default:
                          filtered = sortedTxns;
                      }
                      
                      const income = filtered.filter(t => !t.isExpense).reduce((s, t) => s + Math.abs(t.amount), 0);
                      const expenses = filtered.filter(t => t.isExpense).reduce((s, t) => s + Math.abs(t.amount), 0);
                      return { income, expenses, profit: income - expenses, label, count: filtered.length };
                    };
                    
                    const data = calculateProfit();
                    
                    return (
                      <>
                        {/* Period Selector */}
                        <div className="flex flex-wrap gap-1 mb-4">
                          {[
                            { key: 'week', label: 'Week' },
                            { key: 'month', label: 'Month' },
                            { key: 'quarter', label: 'Qtr' },
                            { key: 'year', label: 'Year' },
                            { key: 'all', label: 'All' },
                            { key: 'custom', label: '...' },
                          ].map(p => (
                            <button
                              key={p.key}
                              onClick={() => setProfitTrackerPeriod(p.key)}
                              className={`px-2 py-1 text-xs rounded ${profitTrackerPeriod === p.key ? 'bg-violet-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                        
                        {/* Custom Range Inputs */}
                        {profitTrackerPeriod === 'custom' && (
                          <div className="flex gap-2 mb-4">
                            <input
                              type="date"
                              value={profitTrackerCustomRange.start}
                              onChange={(e) => setProfitTrackerCustomRange(r => ({ ...r, start: e.target.value }))}
                              className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white"
                            />
                            <span className="text-slate-500 text-xs self-center">to</span>
                            <input
                              type="date"
                              value={profitTrackerCustomRange.end}
                              onChange={(e) => setProfitTrackerCustomRange(r => ({ ...r, end: e.target.value }))}
                              className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white"
                            />
                          </div>
                        )}
                        
                        {/* Period Label */}
                        <p className="text-slate-400 text-xs mb-3">{data.label} • {data.count} transactions</p>
                        
                        {/* Profit Display */}
                        <div className={`text-3xl font-bold mb-4 ${data.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {data.profit >= 0 ? '+' : ''}{formatCurrency(data.profit)}
                        </div>
                        
                        {/* Income & Expenses Breakdown */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-emerald-500/10 rounded-lg p-3">
                            <p className="text-emerald-400 text-xs mb-1">Income</p>
                            <p className="text-white font-semibold">{formatCurrency(data.income)}</p>
                          </div>
                          <div className="bg-rose-500/10 rounded-lg p-3">
                            <p className="text-rose-400 text-xs mb-1">Expenses</p>
                            <p className="text-white font-semibold">{formatCurrency(data.expenses)}</p>
                          </div>
                        </div>
                        
                        {/* Profit Margin */}
                        {data.income > 0 && (
                          <div className="mt-3 text-xs text-slate-400">
                            Profit Margin: <span className={data.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {((data.profit / data.income) * 100).toFixed(1)}%
                            </span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
                
                {/* Monthly Cash Flow Chart */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 lg:col-span-2">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-blue-400" />
                    Monthly Cash Flow Trend
                  </h3>
                  {monthKeys.length > 0 && (() => {
                    const maxVal = Math.max(...monthKeys.map(m => Math.max(monthlySnapshots[m]?.income || 0, monthlySnapshots[m]?.expenses || 0)), 1);
                    return (
                      <>
                        <div className="flex items-end gap-1 h-48">
                          {monthKeys.map((m, i) => {
                            const snap = monthlySnapshots[m];
                            const incomeHeight = ((snap?.income || 0) / maxVal) * 100;
                            const expenseHeight = ((snap?.expenses || 0) / maxVal) * 100;
                            return (
                              <div key={m} className="flex-1 flex flex-col items-center group relative">
                                <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 hidden group-hover:block bg-slate-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-50 shadow-lg">
                                  {new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}<br/>
                                  In: {formatCurrency(snap?.income || 0)}<br/>
                                  Out: {formatCurrency(snap?.expenses || 0)}<br/>
                                  Net: <span className={snap?.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{formatCurrency(snap?.net || 0)}</span>
                                </div>
                                <div className="w-full flex gap-0.5 items-end h-40">
                                  <div className="flex-1 bg-emerald-500/70 rounded-t transition-all" style={{ height: `${incomeHeight}%`, minHeight: incomeHeight > 0 ? '4px' : '0' }} />
                                  <div className="flex-1 bg-rose-500/70 rounded-t transition-all" style={{ height: `${expenseHeight}%`, minHeight: expenseHeight > 0 ? '4px' : '0' }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex gap-1 mt-2">
                          {monthKeys.map(m => (
                            <div key={m} className="flex-1 text-center text-[10px] text-slate-500">
                              {new Date(m + '-01').toLocaleDateString('en-US', { month: 'short' })}
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-center gap-6 mt-3 text-xs">
                          <span className="flex items-center gap-2"><span className="w-3 h-3 bg-emerald-500 rounded" />Income</span>
                          <span className="flex items-center gap-2"><span className="w-3 h-3 bg-rose-500 rounded" />Expenses</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
            
            {/* Recurring Expenses Tab */}
            {bankingTab === 'recurring' && (
              <div className="space-y-6">
                {/* Header with Add Button */}
                <div className="flex items-center justify-between">
                  <div className="bg-slate-800/30 rounded-lg p-3 text-sm text-slate-400 flex-1 mr-4">
                    {(() => {
                      const allMonths = [...new Set(sortedTxns.map(t => t.date.substring(0, 7)))].sort();
                      const expenseCount = sortedTxns.filter(t => t.isExpense).length;
                      return (
                        <>
                          📊 Analyzing {expenseCount} expense transactions across {allMonths.length} months 
                          ({allMonths.length > 0 ? `${allMonths[0]} to ${allMonths[allMonths.length - 1]}` : 'no data'})
                          {detectedRecurring.length > 0 && ` • Found ${detectedRecurring.length} potential recurring expenses`}
                        </>
                      );
                    })()}
                  </div>
                  <button
                    onClick={() => { setRecurringForm({ vendor: '', category: '', amount: '', notes: '' }); setShowAddRecurring(true); }}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white text-sm flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Manual
                  </button>
                </div>
                
                {/* Manual Add Recurring Modal */}
                {showAddRecurring && (
                  <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-md w-full">
                      <h3 className="text-lg font-semibold text-white mb-4">Add Recurring Expense</h3>
                      <p className="text-slate-400 text-sm mb-4">Manually add a recurring expense that wasn't auto-detected (e.g., agency retainers, subscriptions).</p>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm text-slate-400 mb-1">Vendor / Description</label>
                          <input 
                            type="text" 
                            value={recurringForm.vendor} 
                            onChange={(e) => setRecurringForm(f => ({ ...f, vendor: e.target.value }))}
                            placeholder="e.g., Marketing Agency, Software Subscription"
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-slate-400 mb-1">Category</label>
                          <select
                            value={recurringForm.category}
                            onChange={(e) => setRecurringForm(f => ({ ...f, category: e.target.value }))}
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
                          >
                            <option value="">Select category...</option>
                            <option value="Marketing">Marketing</option>
                            <option value="Software & Subscriptions">Software & Subscriptions</option>
                            <option value="Professional Services">Professional Services</option>
                            <option value="Insurance">Insurance</option>
                            <option value="Utilities">Utilities</option>
                            <option value="Rent">Rent</option>
                            <option value="Payroll">Payroll</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm text-slate-400 mb-1">Monthly Amount ($)</label>
                          <input 
                            type="number" 
                            value={recurringForm.amount} 
                            onChange={(e) => setRecurringForm(f => ({ ...f, amount: e.target.value }))}
                            placeholder="3000"
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-slate-400 mb-1">Notes (optional)</label>
                          <input 
                            type="text" 
                            value={recurringForm.notes} 
                            onChange={(e) => setRecurringForm(f => ({ ...f, notes: e.target.value }))}
                            placeholder="Any additional notes"
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
                          />
                        </div>
                      </div>
                      <div className="flex gap-3 mt-6">
                        <button
                          onClick={() => {
                            if (!recurringForm.vendor || !recurringForm.amount) {
                              setToast({ message: 'Vendor and amount are required', type: 'error' });
                              return;
                            }
                            const key = `MANUAL_${recurringForm.vendor.toUpperCase().replace(/\s+/g, '_')}`;
                            setConfirmedRecurring(prev => ({
                              ...prev,
                              [key]: {
                                confirmed: true,
                                manual: true,
                                vendor: recurringForm.vendor,
                                category: recurringForm.category || 'Other',
                                amount: parseFloat(recurringForm.amount) || 0,
                                notes: recurringForm.notes,
                                addedAt: new Date().toISOString(),
                              }
                            }));
                            setToast({ message: 'Recurring expense added', type: 'success' });
                            setShowAddRecurring(false);
                          }}
                          className="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2 rounded-lg"
                        >
                          Add Recurring
                        </button>
                        <button 
                          onClick={() => setShowAddRecurring(false)}
                          className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-gradient-to-br from-purple-900/40 to-purple-800/20 rounded-xl border border-purple-500/30 p-5">
                    <p className="text-purple-400 text-sm font-medium mb-1">Confirmed Monthly Recurring</p>
                    <p className="text-3xl font-bold text-white">{formatCurrency(totalMonthlyRecurring)}</p>
                    <p className="text-slate-400 text-sm mt-1">{confirmedRecurringList.length} recurring expenses</p>
                  </div>
                  <div className="bg-gradient-to-br from-rose-900/40 to-rose-800/20 rounded-xl border border-rose-500/30 p-5">
                    <p className="text-rose-400 text-sm font-medium mb-1">Annual Recurring Cost</p>
                    <p className="text-3xl font-bold text-white">{formatCurrency(totalAnnualRecurring)}</p>
                    <p className="text-slate-400 text-sm mt-1">Fixed costs per year</p>
                  </div>
                  <div className="bg-gradient-to-br from-amber-900/40 to-amber-800/20 rounded-xl border border-amber-500/30 p-5">
                    <p className="text-amber-400 text-sm font-medium mb-1">Remaining This Year</p>
                    <p className="text-3xl font-bold text-white">{formatCurrency(projectedRecurringCosts)}</p>
                    <p className="text-slate-400 text-sm mt-1">{remainingMonths} months × {formatCurrency(totalMonthlyRecurring)}</p>
                  </div>
                </div>
                
                {/* Pending Detection - Needs Confirmation */}
                {pendingRecurringList.length > 0 && (
                  <div className="bg-slate-800/50 rounded-xl border border-amber-500/30 p-5">
                    <h3 className="text-lg font-semibold text-amber-400 mb-4 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      Detected Recurring Expenses — Please Review
                    </h3>
                    <p className="text-slate-400 text-sm mb-4">
                      These expenses appear regularly in your banking data. Confirm which ones are truly recurring to improve EOY projections.
                    </p>
                    <div className="space-y-3">
                      {pendingRecurringList.map(item => (
                        <div key={item.key} className="bg-slate-700/50 rounded-lg p-4 flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <p className="text-white font-medium">{item.vendor}</p>
                              <span className={`px-2 py-0.5 rounded text-xs ${
                                item.consistency === 'high' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                              }`}>
                                {item.consistency === 'high' ? 'Very Consistent' : 'Somewhat Consistent'}
                              </span>
                            </div>
                            <p className="text-slate-400 text-sm mt-1">{item.category} • Found in {item.frequency} of last {item.totalMonths} months</p>
                          </div>
                          <div className="text-right mr-4">
                            <p className="text-rose-400 font-bold">{formatCurrency(item.monthlyAmount)}/mo</p>
                            <p className="text-slate-500 text-xs">{formatCurrency(item.annualCost)}/year</p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setConfirmedRecurring(prev => ({ ...prev, [item.key]: { confirmed: true, amount: item.monthlyAmount } }))}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white text-sm"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmedRecurring(prev => ({ ...prev, [item.key]: { ignored: true } }))}
                              className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 rounded-lg text-white text-sm"
                            >
                              Ignore
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* No recurring detected message */}
                {pendingRecurringList.length === 0 && confirmedRecurringList.length === 0 && (
                  <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6 text-center">
                    <RefreshCw className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-white mb-2">No Recurring Expenses Detected</h3>
                    <p className="text-slate-400 text-sm mb-4">
                      To detect recurring expenses, you need at least 2 months of banking data with similar charges appearing in multiple months.
                    </p>
                    <div className="text-slate-500 text-xs space-y-1">
                      <p>Detection criteria: Same vendor, $50+ average, appears in 2+ months of last 6</p>
                      <p>Make sure your QBO export includes multiple months of transaction history</p>
                    </div>
                  </div>
                )}
                
                {/* Confirmed Recurring */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Check className="w-5 h-5 text-emerald-400" />
                    Confirmed Recurring Expenses
                  </h3>
                  {confirmedRecurringList.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-700">
                            <th className="text-left text-slate-400 font-medium py-2 px-2">Vendor</th>
                            <th className="text-left text-slate-400 font-medium py-2 px-2">Category</th>
                            <th className="text-center text-slate-400 font-medium py-2 px-2">Source</th>
                            <th className="text-right text-slate-400 font-medium py-2 px-2">Monthly</th>
                            <th className="text-right text-slate-400 font-medium py-2 px-2">Annual</th>
                            <th className="text-center text-slate-400 font-medium py-2 px-2">Remove</th>
                          </tr>
                        </thead>
                        <tbody>
                          {confirmedRecurringList.map(item => (
                            <tr key={item.key} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                              <td className="py-3 px-2 text-white">{item.vendor}</td>
                              <td className="py-3 px-2 text-slate-400">{item.category}</td>
                              <td className="py-3 px-2 text-center">
                                {item.manual ? (
                                  <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs">Manual</span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-xs">Auto-detected</span>
                                )}
                              </td>
                              <td className="py-3 px-2 text-right text-rose-400 font-medium">{formatCurrency(item.monthlyAmount)}</td>
                              <td className="py-3 px-2 text-right text-slate-300">{formatCurrency(item.annualCost)}</td>
                              <td className="py-3 px-2 text-center">
                                <button
                                  onClick={() => {
                                    if (item.manual) {
                                      // For manual items, completely remove
                                      setConfirmedRecurring(prev => {
                                        const updated = { ...prev };
                                        delete updated[item.key];
                                        return updated;
                                      });
                                    } else {
                                      // For auto-detected, mark as NOT recurring (ignored)
                                      setConfirmedRecurring(prev => ({
                                        ...prev,
                                        [item.key]: { ignored: true, notRecurring: true }
                                      }));
                                    }
                                    setToast({ message: 'Removed from recurring', type: 'success' });
                                  }}
                                  className="text-slate-500 hover:text-rose-400 p-1"
                                  title={item.manual ? "Delete" : "Mark as NOT recurring"}
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-slate-600">
                            <td className="py-3 px-2 font-bold text-white" colSpan={3}>Total</td>
                            <td className="py-3 px-2 text-right font-bold text-rose-400">{formatCurrency(totalMonthlyRecurring)}</td>
                            <td className="py-3 px-2 text-right font-bold text-white">{formatCurrency(totalAnnualRecurring)}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <RefreshCw className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                      <p className="text-slate-400">No confirmed recurring expenses yet.</p>
                      <p className="text-slate-500 text-sm mt-1">Review the detected expenses above and confirm which ones recur monthly.</p>
                    </div>
                  )}
                </div>
                
                {/* Marked as NOT Recurring - ability to undo */}
                {(() => {
                  const ignoredItems = Object.entries(confirmedRecurring)
                    .filter(([_, data]) => data.ignored || data.notRecurring)
                    .map(([key, data]) => ({ key, ...data }));
                  
                  if (ignoredItems.length === 0) return null;
                  
                  return (
                    <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 p-5">
                      <h3 className="text-md font-medium text-slate-400 mb-3 flex items-center gap-2">
                        <EyeOff className="w-4 h-4" />
                        Marked as NOT Recurring ({ignoredItems.length})
                      </h3>
                      <p className="text-slate-500 text-sm mb-3">These items were marked as not recurring and won't appear in detected expenses.</p>
                      <div className="flex flex-wrap gap-2">
                        {ignoredItems.map(item => (
                          <div key={item.key} className="bg-slate-700/50 rounded-lg px-3 py-2 flex items-center gap-2">
                            <span className="text-slate-400 text-sm">{item.key.replace(/^MANUAL_/, '').replace(/_/g, ' ')}</span>
                            <button
                              onClick={() => setConfirmedRecurring(prev => {
                                const updated = { ...prev };
                                delete updated[item.key];
                                return updated;
                              })}
                              className="text-slate-500 hover:text-emerald-400 p-0.5"
                              title="Undo - allow detection again"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                
                {/* EOY Impact */}
                <div className="bg-gradient-to-r from-purple-900/30 to-indigo-900/30 rounded-xl border border-purple-500/30 p-5">
                  <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <Brain className="w-5 h-5 text-purple-400" />
                    EOY Profit Impact
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-800/50 rounded-lg p-4">
                      <p className="text-slate-400 text-sm mb-1">Known Fixed Costs (Remaining)</p>
                      <p className="text-2xl font-bold text-rose-400">{formatCurrency(projectedRecurringCosts)}</p>
                      <p className="text-slate-500 text-xs mt-1">{remainingMonths} months of confirmed recurring</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-4">
                      <p className="text-slate-400 text-sm mb-1">Monthly Overhead Rate</p>
                      <p className="text-2xl font-bold text-white">{formatCurrency(totalMonthlyRecurring)}</p>
                      <p className="text-slate-500 text-xs mt-1">Before variable costs & COGS</p>
                    </div>
                  </div>
                  <p className="text-slate-400 text-sm mt-4">
                    💡 <strong>Tip:</strong> Your recurring expenses are predictable costs that will hit regardless of sales volume. 
                    Factor these in when setting monthly profit targets — you need to clear {formatCurrency(totalMonthlyRecurring)} in gross profit just to break even on fixed costs.
                  </p>
                </div>
              </div>
            )}
            
            {/* Expenses Tab */}
            {bankingTab === 'expenses' && (
              <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                {/* Drill-down view */}
                {bankingDrilldown && bankingDrilldown.type === 'expense' ? (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <button 
                        onClick={() => setBankingDrilldown(null)}
                        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                      >
                        <ChevronLeft className="w-5 h-5" />
                        <span className="text-lg font-semibold text-white">{bankingDrilldown.category}</span>
                      </button>
                      <span className="text-rose-400 font-bold text-lg">
                        {formatCurrency(expensesByCategory[bankingDrilldown.category] || 0)}
                      </span>
                    </div>
                    <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-slate-800">
                          <tr className="border-b border-slate-700">
                            <th className="text-left text-slate-400 font-medium py-2 px-2">Date</th>
                            <th className="text-left text-slate-400 font-medium py-2 px-2">Description</th>
                            <th className="text-left text-slate-400 font-medium py-2 px-2">Account</th>
                            <th className="text-right text-slate-400 font-medium py-2 px-2">Amount</th>
                            <th className="text-center text-slate-400 font-medium py-2 px-2">Recurring</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredTxns
                            .filter(t => t.isExpense && t.topCategory === bankingDrilldown.category)
                            .map((txn, i) => {
                              // Check if this transaction is flagged as recurring
                              const vendorKey = (txn.description || txn.name || '').toUpperCase().split(/\s+(PAYMENT|AUTOPAY|ACH|DEBIT|BILL|#|\d{4,})/)[0].trim().substring(0, 40);
                              const txnKey = `TXN_${vendorKey}_${txn.amount.toFixed(2)}`;
                              const isFlaggedRecurring = confirmedRecurring[txnKey]?.confirmed || confirmedRecurring[vendorKey]?.confirmed;
                              const isMarkedNotRecurring = confirmedRecurring[txnKey]?.notRecurring || confirmedRecurring[vendorKey]?.notRecurring;
                              
                              return (
                                <tr key={txn.id || i} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                                  <td className="py-2 px-2 text-slate-400 whitespace-nowrap">{txn.date}</td>
                                  <td className="py-2 px-2 text-white">{txn.name}</td>
                                  <td className="py-2 px-2 text-slate-400 text-xs">{txn.account?.split('(')[0]?.trim() || '-'}</td>
                                  <td className="py-2 px-2 text-right text-rose-400 font-medium">{formatCurrency(txn.amount)}</td>
                                  <td className="py-2 px-2 text-center">
                                    {isFlaggedRecurring ? (
                                      <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs">
                                        ✓ Recurring
                                      </span>
                                    ) : isMarkedNotRecurring ? (
                                      <span className="text-slate-500 text-xs">Not recurring</span>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setConfirmedRecurring(prev => ({
                                            ...prev,
                                            [txnKey]: {
                                              confirmed: true,
                                              flaggedFromTxn: true,
                                              vendor: vendorKey,
                                              description: txn.name || txn.description,
                                              amount: txn.amount,
                                              category: txn.topCategory,
                                              flaggedAt: new Date().toISOString(),
                                            }
                                          }));
                                          setToast({ message: `"${vendorKey}" flagged as recurring ($${txn.amount.toFixed(2)}/mo)`, type: 'success' });
                                        }}
                                        className="px-2 py-0.5 bg-slate-700 hover:bg-purple-600 text-slate-400 hover:text-white rounded text-xs transition-colors"
                                        title="Flag this as a recurring monthly expense"
                                      >
                                        🔁 Flag
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-white">Expenses — {periodLabel}</h3>
                      <span className="text-slate-400 text-sm">{topExpenseCategories.length} categories • Click to drill down</span>
                    </div>
                    <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-slate-800">
                          <tr className="border-b border-slate-700">
                            <th className="text-left text-slate-400 font-medium py-2 px-2">Category</th>
                            <th className="text-right text-slate-400 font-medium py-2 px-2">Total</th>
                            <th className="text-right text-slate-400 font-medium py-2 px-2">% of Expenses</th>
                            <th className="text-right text-slate-400 font-medium py-2 px-2">Txns</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topExpenseCategories.map(([cat, amount]) => {
                            const pct = (amount / totalExpenses) * 100;
                            const count = filteredTxns.filter(t => t.isExpense && t.topCategory === cat).length;
                            return (
                              <tr 
                                key={cat} 
                                className="border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer"
                                onClick={() => setBankingDrilldown({ category: cat, type: 'expense' })}
                              >
                                <td className="py-2 px-2 text-white flex items-center gap-2">
                                  {cat}
                                  <ChevronRight className="w-4 h-4 text-slate-500" />
                                </td>
                                <td className="py-2 px-2 text-right text-rose-400 font-medium">{formatCurrency(amount)}</td>
                                <td className="py-2 px-2 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                      <div className="h-full bg-rose-500" style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="text-slate-400 w-12 text-right">{pct.toFixed(1)}%</span>
                                  </div>
                                </td>
                                <td className="py-2 px-2 text-right text-slate-400">{count}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-slate-600">
                            <td className="py-2 px-2 font-bold text-white">Total</td>
                            <td className="py-2 px-2 text-right font-bold text-rose-400">{formatCurrency(totalExpenses)}</td>
                            <td className="py-2 px-2 text-right text-slate-400">100%</td>
                            <td className="py-2 px-2 text-right text-slate-400">{filteredTxns.filter(t => t.isExpense).length}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
            
            {/* Income Tab */}
            {bankingTab === 'income' && (
              <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                {/* Drill-down view */}
                {bankingDrilldown && bankingDrilldown.type === 'income' ? (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <button 
                        onClick={() => setBankingDrilldown(null)}
                        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                      >
                        <ChevronLeft className="w-5 h-5" />
                        <span className="text-lg font-semibold text-white">{bankingDrilldown.category}</span>
                      </button>
                      <span className="text-emerald-400 font-bold text-lg">
                        {formatCurrency(incomeByCategory[bankingDrilldown.category] || 0)}
                      </span>
                    </div>
                    <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-slate-800">
                          <tr className="border-b border-slate-700">
                            <th className="text-left text-slate-400 font-medium py-2 px-2">Date</th>
                            <th className="text-left text-slate-400 font-medium py-2 px-2">Description</th>
                            <th className="text-left text-slate-400 font-medium py-2 px-2">Account</th>
                            <th className="text-right text-slate-400 font-medium py-2 px-2">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredTxns
                            .filter(t => t.isIncome && t.topCategory === bankingDrilldown.category)
                            .map((txn, i) => (
                              <tr key={txn.id || i} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                                <td className="py-2 px-2 text-slate-400 whitespace-nowrap">{txn.date}</td>
                                <td className="py-2 px-2 text-white">{txn.name}</td>
                                <td className="py-2 px-2 text-slate-400 text-xs">{txn.account?.split('(')[0]?.trim() || '-'}</td>
                                <td className="py-2 px-2 text-right text-emerald-400 font-medium">{formatCurrency(txn.amount)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-white">Income — {periodLabel}</h3>
                      <span className="text-slate-400 text-sm">{topIncomeCategories.length} sources • Click to drill down</span>
                    </div>
                    <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-slate-800">
                          <tr className="border-b border-slate-700">
                            <th className="text-left text-slate-400 font-medium py-2 px-2">Category</th>
                            <th className="text-right text-slate-400 font-medium py-2 px-2">Total</th>
                            <th className="text-right text-slate-400 font-medium py-2 px-2">% of Income</th>
                            <th className="text-right text-slate-400 font-medium py-2 px-2">Txns</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topIncomeCategories.map(([cat, amount]) => {
                            const pct = (amount / totalIncome) * 100;
                            const count = filteredTxns.filter(t => t.isIncome && t.topCategory === cat).length;
                            return (
                              <tr 
                                key={cat} 
                                className="border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer"
                                onClick={() => setBankingDrilldown({ category: cat, type: 'income' })}
                              >
                                <td className="py-2 px-2 text-white flex items-center gap-2">
                                  {cat}
                                  <ChevronRight className="w-4 h-4 text-slate-500" />
                                </td>
                                <td className="py-2 px-2 text-right text-emerald-400 font-medium">{formatCurrency(amount)}</td>
                                <td className="py-2 px-2 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                      <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="text-slate-400 w-12 text-right">{pct.toFixed(1)}%</span>
                                  </div>
                                </td>
                                <td className="py-2 px-2 text-right text-slate-400">{count}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-slate-600">
                            <td className="py-2 px-2 font-bold text-white">Total</td>
                            <td className="py-2 px-2 text-right font-bold text-emerald-400">{formatCurrency(totalIncome)}</td>
                            <td className="py-2 px-2 text-right text-slate-400">100%</td>
                            <td className="py-2 px-2 text-right text-slate-400">{filteredTxns.filter(t => t.isIncome).length}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
            
            {/* Trends Tab */}
            {bankingTab === 'trends' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Monthly Cash Flow Chart */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                  <h3 className="text-lg font-semibold text-white mb-2">Monthly Cash Flow</h3>
                  <p className="text-xs text-slate-500 mb-4">Income deposits minus expenses (not profit)</p>
                  {monthKeys.length > 0 && (() => {
                    const netValues = monthKeys.map(m => monthlySnapshots[m]?.net || 0);
                    const maxAbs = Math.max(...netValues.map(n => Math.abs(n)), 1000); // Min $1000 for scale
                    
                    return (
                      <div className="h-48">
                        <div className="flex items-end gap-1 h-full">
                          {monthKeys.map(m => {
                            const net = monthlySnapshots[m]?.net || 0;
                            const heightPct = Math.min((Math.abs(net) / maxAbs) * 100, 100);
                            const isPositive = net >= 0;
                            return (
                              <div key={m} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                                <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 hidden group-hover:block bg-slate-900 text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap z-50 shadow-xl border border-slate-600">
                                  <div className="font-medium">{new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</div>
                                  <div className={`text-sm ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(net)}</div>
                                </div>
                                <div 
                                  className={`w-full rounded-t transition-all hover:opacity-80 ${isPositive ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                  style={{ height: `${Math.max(heightPct, 3)}%` }}
                                />
                                <span className="text-[9px] text-slate-500 mt-1 truncate w-full text-center">{new Date(m + '-01').toLocaleDateString('en-US', { month: 'short' })}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                
                {/* Cash Flow Summary */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                  <h3 className="text-lg font-semibold text-white mb-4">Cash Flow Summary</h3>
                  {(() => {
                    const currentYear = now.getFullYear();
                    const ytdMonths = monthKeys.filter(m => m.startsWith(String(currentYear)));
                    const ytdIncome = ytdMonths.reduce((s, m) => s + (monthlySnapshots[m]?.income || 0), 0);
                    const ytdExpenses = ytdMonths.reduce((s, m) => s + (monthlySnapshots[m]?.expenses || 0), 0);
                    const ytdNet = ytdIncome - ytdExpenses;
                    
                    // Get last year same period for comparison if available
                    const lastYear = currentYear - 1;
                    const lastYearMonths = monthKeys.filter(m => m.startsWith(String(lastYear)));
                    const lastYearSamePeriod = lastYearMonths.slice(0, ytdMonths.length);
                    const lastYearNet = lastYearSamePeriod.reduce((s, m) => s + (monthlySnapshots[m]?.net || 0), 0);
                    const yoyChange = lastYearNet !== 0 ? ((ytdNet - lastYearNet) / Math.abs(lastYearNet)) * 100 : 0;
                    
                    return (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center p-3 bg-emerald-900/20 border border-emerald-500/30 rounded-lg">
                          <span className="text-emerald-400">YTD Income (Deposits)</span>
                          <span className="font-bold text-emerald-400">{formatCurrency(ytdIncome)}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-rose-900/20 border border-rose-500/30 rounded-lg">
                          <span className="text-rose-400">YTD Expenses</span>
                          <span className="font-bold text-rose-400">{formatCurrency(ytdExpenses)}</span>
                        </div>
                        <div className="flex justify-between items-center p-4 bg-slate-700/50 rounded-xl">
                          <span className="text-white font-medium">YTD Net Cash Flow</span>
                          <span className={`text-xl font-bold ${ytdNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(ytdNet)}</span>
                        </div>
                        {lastYearSamePeriod.length > 0 && lastYearNet !== 0 && (
                          <div className="flex justify-between items-center p-3 bg-slate-700/30 rounded-lg">
                            <span className="text-slate-400">vs Same Period Last Year</span>
                            <span className={`font-medium flex items-center gap-1 ${yoyChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {yoyChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                              {yoyChange >= 0 ? '+' : ''}{yoyChange.toFixed(1)}%
                            </span>
                          </div>
                        )}
                        <div className="p-3 bg-amber-900/20 border border-amber-500/30 rounded-lg">
                          <p className="text-amber-400 text-xs">
                            ⚠️ <strong>Note:</strong> Cash flow ≠ profit. Income deposits include revenue minus marketplace fees, not COGS. 
                            For true profit analysis, see your Sales data.
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
            
            {/* Transactions Tab */}
            {bankingTab === 'transactions' && (
              <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">Transactions — {periodLabel}</h3>
                  <div className="flex items-center gap-3">
                    {selectedTxnIds.size >= 2 && (
                      <button
                        onClick={() => setShowMergeModal(true)}
                        className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm text-white font-medium flex items-center gap-1.5 transition-colors"
                      >
                        <GitCompareArrows className="w-3.5 h-3.5" />
                        Merge {selectedTxnIds.size} Selected
                      </button>
                    )}
                    {selectedTxnIds.size > 0 && selectedTxnIds.size < 2 && (
                      <span className="text-xs text-amber-400">Select at least 2 to merge</span>
                    )}
                    {selectedTxnIds.size > 0 && (
                      <button
                        onClick={() => setSelectedTxnIds(new Set())}
                        className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-300"
                      >
                        Clear selection
                      </button>
                    )}
                    <span className="text-slate-400 text-sm">{filteredTxns.length} transactions</span>
                    {Object.keys(bankingData.categoryOverrides || {}).length > 0 && (
                      <span className="text-xs bg-violet-500/20 text-violet-300 px-2 py-1 rounded">
                        {Object.keys(bankingData.categoryOverrides).length} recategorized
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-500 mb-4">💡 Click a row to edit category • Use checkboxes to select & merge transactions from the same vendor</p>
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-800 z-10">
                      <tr className="border-b border-slate-700">
                        <th className="text-left text-slate-400 font-medium py-2 px-2 w-8">
                          <input
                            type="checkbox"
                            checked={filteredTxns.slice(0, 300).length > 0 && filteredTxns.slice(0, 300).every(t => selectedTxnIds.has(t.id))}
                            onChange={(e) => {
                              if (e.target.checked) {
                                const newSet = new Set(selectedTxnIds);
                                filteredTxns.slice(0, 300).forEach(t => newSet.add(t.id));
                                setSelectedTxnIds(newSet);
                              } else {
                                setSelectedTxnIds(new Set());
                              }
                            }}
                            className="rounded bg-slate-700 border-slate-600"
                          />
                        </th>
                        <th className="text-left text-slate-400 font-medium py-2 px-3">Date</th>
                        <th className="text-left text-slate-400 font-medium py-2 px-3">Vendor</th>
                        <th className="text-left text-slate-400 font-medium py-2 px-3">Category</th>
                        <th className="text-right text-slate-400 font-medium py-2 px-3">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTxns.slice(0, 300).map((txn, i) => {
                        const hasOverride = bankingData.categoryOverrides?.[txn.id];
                        const isSelected = selectedTxnIds.has(txn.id);
                        return (
                          <tr 
                            key={txn.id || i} 
                            className={`border-b border-slate-700/50 hover:bg-slate-700/50 cursor-pointer transition-colors ${isSelected ? 'bg-violet-900/30 border-violet-500/30' : ''}`}
                          >
                            <td className="py-3 px-2" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const newSet = new Set(selectedTxnIds);
                                  if (e.target.checked) newSet.add(txn.id);
                                  else newSet.delete(txn.id);
                                  setSelectedTxnIds(newSet);
                                }}
                                className="rounded bg-slate-700 border-slate-600"
                              />
                            </td>
                            <td className="py-3 px-3 text-slate-400 whitespace-nowrap" onClick={() => setEditingTransaction(txn)}>{txn.dateDisplay}</td>
                            <td className="py-3 px-3" onClick={() => setEditingTransaction(txn)}>
                              <div className="text-white">{txn.vendor}</div>
                              <div className="text-slate-500 text-xs truncate max-w-[200px]">{txn.memo?.slice(0, 40) || ''}</div>
                            </td>
                            <td className="py-3 px-3" onClick={() => setEditingTransaction(txn)}>
                              <span className={`px-2 py-1 rounded text-xs ${hasOverride ? 'bg-violet-500/20 text-violet-300' : 'bg-slate-700 text-slate-300'}`}>
                                {txn.topCategory}
                              </span>
                            </td>
                            <td className={`py-3 px-3 text-right font-medium whitespace-nowrap ${txn.isIncome ? 'text-emerald-400' : 'text-rose-400'}`} onClick={() => setEditingTransaction(txn)}>
                              {txn.isIncome ? '+' : '-'}{formatCurrency(txn.amount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredTxns.length > 300 && (
                    <p className="text-center text-slate-500 py-4">Showing first 300 of {filteredTxns.length} transactions</p>
                  )}
                </div>
              </div>
            )}
            
            {/* Transaction Edit Modal */}
            {editingTransaction && (
              <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={() => setEditingTransaction(null)}>
                <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                  <div className="p-6 border-b border-slate-700">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-bold text-white">Edit Transaction</h2>
                      <button onClick={() => setEditingTransaction(null)} className="text-slate-400 hover:text-white">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  <div className="p-6 space-y-4">
                    {/* Transaction Details */}
                    <div className="bg-slate-900/50 rounded-lg p-4 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Date</span>
                        <span className="text-white">{editingTransaction.dateDisplay}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Vendor</span>
                        <span className="text-white">{editingTransaction.vendor}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Amount</span>
                        <span className={editingTransaction.isIncome ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                          {editingTransaction.isIncome ? '+' : '-'}{formatCurrency(editingTransaction.amount)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Account</span>
                        <span className="text-white text-sm">{editingTransaction.account?.split('(')[0]}</span>
                      </div>
                      {editingTransaction.memo && (
                        <div className="pt-2 border-t border-slate-700">
                          <span className="text-slate-400 text-xs">Memo</span>
                          <p className="text-slate-300 text-sm mt-1">{editingTransaction.memo}</p>
                        </div>
                      )}
                    </div>
                    
                    {/* Category Edit */}
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Category</label>
                      <input
                        type="text"
                        defaultValue={editingTransaction.category}
                        id="txn-category-input"
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                        placeholder="Enter category..."
                      />
                      <p className="text-xs text-slate-500 mt-2">Original: {editingTransaction.originalCategory || editingTransaction.category}</p>
                    </div>
                    
                    {/* Quick Categories */}
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Quick Select</label>
                      <div className="flex flex-wrap gap-2">
                        {['Advertising & marketing', 'Cost of goods sold', 'Shipping & delivery', 'Office expenses', 'Software & subscriptions', 'Payroll expenses', 'Channel Sales', 'Sales'].map(cat => (
                          <button
                            key={cat}
                            onClick={() => {
                              document.getElementById('txn-category-input').value = cat;
                            }}
                            className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-300"
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="p-6 border-t border-slate-700 flex gap-3">
                    <button
                      onClick={() => setEditingTransaction(null)}
                      className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        const newCat = document.getElementById('txn-category-input').value;
                        if (newCat && newCat !== editingTransaction.category) {
                          handleCategoryChange(editingTransaction.id, newCat);
                        }
                        setEditingTransaction(null);
                      }}
                      className="flex-1 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-white font-medium"
                    >
                      Save Category
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Merge Transactions Modal */}
            {showMergeModal && selectedTxnIds.size >= 2 && (() => {
              const selectedTxns = sortedTxns.filter(t => selectedTxnIds.has(t.id));
              const totalAmount = selectedTxns.reduce((s, t) => s + t.amount, 0);
              const vendors = [...new Set(selectedTxns.map(t => t.vendor))];
              const categories = [...new Set(selectedTxns.map(t => t.topCategory || t.category))];
              const allExpense = selectedTxns.every(t => t.isExpense);
              const allIncome = selectedTxns.every(t => t.isIncome);
              return (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={() => setShowMergeModal(false)}>
                  <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                    <div className="p-6 border-b border-slate-700">
                      <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                          <GitCompareArrows className="w-5 h-5 text-violet-400" />
                          Merge {selectedTxns.length} Transactions
                        </h2>
                        <button onClick={() => setShowMergeModal(false)} className="text-slate-400 hover:text-white">
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    <div className="p-6 space-y-4">
                      {/* Selected transactions preview */}
                      <div className="bg-slate-900/50 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                        {selectedTxns.map(t => (
                          <div key={t.id} className="flex justify-between items-center text-sm">
                            <div>
                              <span className="text-slate-400 mr-2">{t.dateDisplay}</span>
                              <span className="text-white">{t.vendor}</span>
                              <span className="text-slate-500 ml-2 text-xs">{t.topCategory}</span>
                            </div>
                            <span className={t.isIncome ? 'text-emerald-400' : 'text-rose-400'}>
                              {t.isIncome ? '+' : '-'}{formatCurrency(t.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                      
                      <div className="bg-violet-900/20 border border-violet-500/30 rounded-lg p-3 text-center">
                        <span className="text-slate-400 text-sm">Combined total: </span>
                        <span className="text-white font-bold text-lg">{formatCurrency(totalAmount)}</span>
                      </div>
                      
                      {/* Vendor selection */}
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Vendor Name</label>
                        <input
                          type="text"
                          id="merge-vendor-input"
                          defaultValue={vendors[0] || ''}
                          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                          placeholder="Enter vendor name..."
                        />
                        {vendors.length > 1 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {vendors.map(v => (
                              <button
                                key={v}
                                onClick={() => { document.getElementById('merge-vendor-input').value = v; }}
                                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-300"
                              >
                                {v}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {/* Category selection */}
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Category</label>
                        <input
                          type="text"
                          id="merge-category-input"
                          defaultValue={categories[0] || ''}
                          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                          placeholder="Enter category..."
                        />
                        {categories.length > 1 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {categories.map(c => (
                              <button
                                key={c}
                                onClick={() => { document.getElementById('merge-category-input').value = c; }}
                                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-300"
                              >
                                {c}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {['Advertising & marketing', 'Cost of goods sold', 'Shipping & delivery', 'Office expenses', 'Software & subscriptions', 'Payroll expenses'].map(cat => (
                            <button
                              key={cat}
                              onClick={() => { document.getElementById('merge-category-input').value = cat; }}
                              className="px-2 py-1 bg-slate-700/50 hover:bg-slate-600 rounded text-xs text-slate-500"
                            >
                              {cat}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      {/* Type selection (only if mixed) */}
                      {!allExpense && !allIncome && (
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-2">Transaction Type</label>
                          <div className="flex gap-2">
                            <button
                              id="merge-type-expense"
                              onClick={() => { document.getElementById('merge-type-expense').classList.add('ring-2', 'ring-rose-500'); document.getElementById('merge-type-income').classList.remove('ring-2', 'ring-emerald-500'); }}
                              className="flex-1 px-3 py-2 bg-rose-900/30 hover:bg-rose-800/40 border border-rose-500/30 rounded-lg text-rose-300 text-sm ring-2 ring-rose-500"
                            >
                              Expense
                            </button>
                            <button
                              id="merge-type-income"
                              onClick={() => { document.getElementById('merge-type-income').classList.add('ring-2', 'ring-emerald-500'); document.getElementById('merge-type-expense').classList.remove('ring-2', 'ring-rose-500'); }}
                              className="flex-1 px-3 py-2 bg-emerald-900/30 hover:bg-emerald-800/40 border border-emerald-500/30 rounded-lg text-emerald-300 text-sm"
                            >
                              Income
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-6 border-t border-slate-700 flex gap-3">
                      <button
                        onClick={() => setShowMergeModal(false)}
                        className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-white"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          const vendor = document.getElementById('merge-vendor-input')?.value || vendors[0];
                          const category = document.getElementById('merge-category-input')?.value || categories[0];
                          const isExpenseBtn = document.getElementById('merge-type-expense');
                          const isExpense = allExpense || (!allIncome && (!isExpenseBtn || isExpenseBtn.classList.contains('ring-rose-500')));
                          handleMergeTransactions(vendor, category, isExpense);
                        }}
                        className="flex-1 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-white font-medium flex items-center justify-center gap-2"
                      >
                        <GitCompareArrows className="w-4 h-4" />
                        Merge Transactions
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
            
            {/* Account Balance Edit Modal */}
            {editingAccountBalance && (
              <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                <div className="bg-slate-800 rounded-xl border border-slate-600 p-6 max-w-md w-full">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    {editingAccountBalance.isCard ? <CreditCard className="w-5 h-5 text-rose-400" /> : <Wallet className="w-5 h-5 text-emerald-400" />}
                    Edit Account Balance
                  </h3>
                  <p className="text-slate-400 text-sm mb-4">
                    {editingAccountBalance.name?.split('(')[0]?.trim()}
                  </p>
                  <div className="mb-4">
                    <label className="block text-sm text-slate-400 mb-1">
                      Current Balance {editingAccountBalance.isCard ? '(amount owed)' : '(available)'}
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">$</span>
                      <input
                        type="number"
                        step="0.01"
                        id="account-balance-input"
                        defaultValue={editingAccountBalance.balance.toFixed(2)}
                        className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                        placeholder="0.00"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Enter the actual balance from your bank/card statement
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setEditingAccountBalance(null)}
                      className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        const newBalance = parseFloat(document.getElementById('account-balance-input').value) || 0;
                        // For credit cards, store as positive (debt owed)
                        const finalBalance = editingAccountBalance.isCard ? newBalance : newBalance;
                        
                        // Update bankingData with new balance
                        const updatedAccounts = { ...bankingData.accounts };
                        if (updatedAccounts[editingAccountBalance.name]) {
                          updatedAccounts[editingAccountBalance.name] = {
                            ...updatedAccounts[editingAccountBalance.name],
                            balance: finalBalance,
                            balanceManuallySet: true,
                            balanceSetDate: new Date().toISOString(),
                          };
                        }
                        
                        const newBankingData = {
                          ...bankingData,
                          accounts: updatedAccounts,
                        };
                        
                        setBankingData(newBankingData);
                        lsSet('ecommerce_banking_v1', JSON.stringify(newBankingData));
                        queueCloudSave({ ...combinedData, bankingData: newBankingData });
                        
                        setToast({ message: `Balance updated for ${editingAccountBalance.name.split('(')[0].trim()}`, type: 'success' });
                        setEditingAccountBalance(null);
                      }}
                      className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white font-medium"
                    >
                      Save Balance
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* CFO Dashboard Tab */}
            {bankingTab === 'cfo' && (() => {
              // Calculate monthly aggregations from actual transactions
              const monthlyData = {};
              sortedTxns.forEach(t => {
                const month = t.date?.substring(0, 7);
                if (!month) return;
                if (!monthlyData[month]) {
                  monthlyData[month] = { income: 0, expenses: 0, net: 0, byCategory: {} };
                }
                if (t.isIncome) {
                  monthlyData[month].income += t.amount;
                  monthlyData[month].net += t.amount;
                }
                if (t.isExpense) {
                  monthlyData[month].expenses += t.amount;
                  monthlyData[month].net -= t.amount;
                  // Track by normalized category
                  const cat = normalizeCategory(t.topCategory);
                  monthlyData[month].byCategory[cat] = (monthlyData[month].byCategory[cat] || 0) + t.amount;
                }
              });
              
              const monthKeys = Object.keys(monthlyData).sort();
              
              // Calculate CFO metrics
              const currentMonth = now.toISOString().slice(0, 7);
              const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
              const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 7);
              
              const currentMonthData = monthlyData[currentMonth] || { income: 0, expenses: 0, net: 0, byCategory: {} };
              const lastMonthData = monthlyData[lastMonth] || { income: 0, expenses: 0, net: 0, byCategory: {} };
              const twoMonthsAgoData = monthlyData[twoMonthsAgo] || { income: 0, expenses: 0, net: 0, byCategory: {} };
              
              // Get COGS for this month (using normalized category name)
              const monthCOGS = currentMonthData.byCategory['Cost of Goods Sold'] || 0;
              const monthOpEx = currentMonthData.expenses - monthCOGS;
              
              // Operating metrics
              const operatingMargin = currentMonthData.income > 0 
                ? (currentMonthData.net / currentMonthData.income * 100) 
                : 0;
                
              // Burn rate (avg monthly expenses over last 3 months)
              const last3Months = monthKeys.filter(m => m <= currentMonth).slice(-3);
              const avgMonthlyExpenses = last3Months.length > 0 
                ? last3Months.reduce((s, m) => s + (monthlyData[m]?.expenses || 0), 0) / last3Months.length 
                : 0;
              
              // Net cash flow (avg monthly net over last 3 months)
              const avgMonthlyNet = last3Months.length > 0
                ? last3Months.reduce((s, m) => s + (monthlyData[m]?.net || 0), 0) / last3Months.length
                : 0;
              
              // Runway calculation - get actual cash from accounts
              const realAccts = Object.entries(bankingData.accounts || {}).filter(([name, acct]) => {
                if (Math.abs(acct.balance || 0) < 1) return false;
                if (acct.qboId) return true;
                return /\(\d{4}\)/.test(name) || name.toLowerCase().includes('operations');
              });
              const totalCash = realAccts.filter(([_, a]) => a.type !== 'credit_card').reduce((s, [_, a]) => s + (a.balance || 0), 0);
              
              // If net cash flow is positive, business is self-sustaining
              const runwayMonths = avgMonthlyNet >= 0 ? Infinity : totalCash / Math.abs(avgMonthlyNet);
              const isCashFlowPositive = avgMonthlyNet >= 0;
              
              // MoM growth
              const revenueMoM = lastMonthData.income > 0 
                ? ((currentMonthData.income - lastMonthData.income) / lastMonthData.income * 100) 
                : (currentMonthData.income > 0 ? 100 : 0);
              const expenseMoM = lastMonthData.expenses > 0 
                ? ((currentMonthData.expenses - lastMonthData.expenses) / lastMonthData.expenses * 100) 
                : 0;
              
              // Expense efficiency (operating expenses / revenue)
              const opexRatio = currentMonthData.income > 0 
                ? (monthOpEx / currentMonthData.income * 100) 
                : 0;
              
              // YTD calculations from banking
              const currentYear = now.getFullYear();
              const ytdMonths = monthKeys.filter(m => m.startsWith(String(currentYear)));
              const ytdIncome = ytdMonths.reduce((s, m) => s + (monthlyData[m]?.income || 0), 0);
              const ytdExpenses = ytdMonths.reduce((s, m) => s + (monthlyData[m]?.expenses || 0), 0);
              const ytdCashFlow = ytdIncome - ytdExpenses;
              
              // Get actual sales profit data if available
              const currentYearForWeeks = new Date().getFullYear().toString();
              const sortedWeeks2026 = Object.keys(allWeeksData).filter(w => w.startsWith(currentYearForWeeks)).sort();
              const actualYTDProfit = sortedWeeks2026.reduce((s, w) => s + (getProfit(allWeeksData[w]?.total)), 0);
              const actualYTDRevenue = sortedWeeks2026.reduce((s, w) => s + (allWeeksData[w]?.total?.revenue || 0), 0);
              const weeksWithData = sortedWeeks2026.filter(w => (allWeeksData[w]?.total?.revenue || 0) > 0).length;
              
              // Use sales data for forecast if available, otherwise banking
              const hasActualSalesData = weeksWithData > 0;
              const monthsCompleted = ytdMonths.length || (weeksWithData > 0 ? Math.ceil(weeksWithData / 4.33) : 0);
              const monthsRemaining = 12 - Math.max(monthsCompleted, now.getMonth() + 1);
              
              // Calculate forecast based on best available data
              let forecastBasis, avgMonthlyProfit, linearProjection, trendProjection;
              
              // Get recurring expenses for deduction
              const recurringMonthlyExpenses = totalMonthlyRecurring || 0;
              const recurringCostsRemaining = recurringMonthlyExpenses * monthsRemaining;
              
              // Determine which data source to use - default to banking data on banking tab
              const hasBothDataSources = hasActualSalesData && actualYTDRevenue > 0 && ytdMonths.length > 0;
              
              // Use banking data by default on banking tab, fall back to sales if no banking data
              const effectiveBasis = ytdMonths.length > 0 ? 'cashflow' : 'sales';
              
              if (effectiveBasis === 'sales' && hasActualSalesData && actualYTDRevenue > 0) {
                // Use actual sales profit data
                forecastBasis = 'sales';
                const avgWeeklyProfit = actualYTDProfit / Math.max(weeksWithData, 1);
                avgMonthlyProfit = avgWeeklyProfit * 4.33;
                // Deduct recurring expenses from projections
                linearProjection = actualYTDProfit + (avgMonthlyProfit * monthsRemaining) - recurringCostsRemaining;
                
                // For trend, use last 4 weeks if available
                const recentWeeks = sortedWeeks2026.slice(-4);
                const recentProfit = recentWeeks.reduce((s, w) => s + (getProfit(allWeeksData[w]?.total)), 0);
                const recentAvgWeekly = recentProfit / Math.max(recentWeeks.length, 1);
                const recentAvgMonthly = recentAvgWeekly * 4.33;
                trendProjection = actualYTDProfit + (recentAvgMonthly * monthsRemaining) - recurringCostsRemaining;
              } else {
                // Fall back to banking cash flow
                forecastBasis = 'cashflow';
                avgMonthlyProfit = ytdMonths.length > 0 ? ytdCashFlow / ytdMonths.length : 0;
                // Deduct recurring expenses from projections
                linearProjection = ytdCashFlow + (avgMonthlyProfit * monthsRemaining) - recurringCostsRemaining;
                
                // Trend using last 3 months
                const recentMonths = ytdMonths.slice(-3);
                const recentAvgNet = recentMonths.length > 0 
                  ? recentMonths.reduce((s, m) => s + (monthlyData[m]?.net || 0), 0) / recentMonths.length 
                  : avgMonthlyProfit;
                trendProjection = ytdCashFlow + (recentAvgNet * monthsRemaining) - recurringCostsRemaining;
              }
              
              // ==================== OPEN PO CASH FLOW ====================
              // Calculate outstanding PO payments
              const openPOs = productionPipeline.filter(po => po.status !== 'received');
              const poAnalysis = openPOs.map(po => {
                const totalValue = po.totalValue || ((po.quantity || 0) * (po.unitCost || 0));
                const depositPercent = po.depositPercent || 50;
                const depositAmt = totalValue * (depositPercent / 100);
                const balancePercent = (100 - depositPercent) / 100;
                
                // Calculate what's been paid
                let paidSoFar = po.depositPaid ? depositAmt : 0;
                
                if (po.paymentTerms === '30-70-ship') {
                  // Rolling payments - sum shipment payments
                  const shippedUnits = (po.shipments || []).reduce((s, sh) => s + (sh.units || 0), 0);
                  paidSoFar += shippedUnits * (po.unitCost || 0) * balancePercent;
                } else if (po.balancePaid) {
                  paidSoFar += totalValue * balancePercent;
                }
                
                const outstanding = totalValue - paidSoFar;
                const unitsRemaining = (po.quantity || 0) - (po.shipments || []).reduce((s, sh) => s + (sh.units || 0), 0);
                
                return {
                  ...po,
                  totalValue,
                  paidSoFar,
                  outstanding,
                  unitsRemaining,
                };
              });
              
              const totalPOValue = poAnalysis.reduce((s, po) => s + po.totalValue, 0);
              const totalPOPaid = poAnalysis.reduce((s, po) => s + po.paidSoFar, 0);
              const totalPOOutstanding = poAnalysis.reduce((s, po) => s + po.outstanding, 0);
              
              // Projected COGS from open POs (when goods arrive and sell)
              const totalUnitsIncoming = poAnalysis.reduce((s, po) => s + po.unitsRemaining, 0);
              const avgUnitCost = totalUnitsIncoming > 0 
                ? poAnalysis.reduce((s, po) => s + (po.unitsRemaining * (po.unitCost || 0)), 0) / totalUnitsIncoming 
                : 0;
              
              // Tooltip component
              const KPICard = ({ label, value, subLabel, color, tooltip }) => (
                <div className="bg-slate-700/50 rounded-lg p-4 relative group cursor-help">
                  <p className="text-slate-400 text-xs mb-1">{label}</p>
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  <p className="text-slate-500 text-xs">{subLabel}</p>
                  {tooltip && (
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-72 p-3 bg-slate-900 border border-slate-600 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
                      <p className="text-sm text-slate-200">{tooltip}</p>
                    </div>
                  )}
                </div>
              );
              
              return (
                <div className="space-y-6">
                  {/* Key Performance Indicators */}
                  <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                    <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                      <Target className="w-5 h-5 text-violet-400" />
                      Key Performance Indicators — {new Date(currentMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </h3>
                    <p className="text-slate-500 text-xs mb-4">Hover over each metric for detailed explanation</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <KPICard 
                        label="Operating Margin"
                        value={`${operatingMargin.toFixed(1)}%`}
                        subLabel="Net / Revenue"
                        color={operatingMargin >= 0 ? 'text-emerald-400' : 'text-rose-400'}
                        tooltip={`Your net cash flow (${formatCurrency(currentMonthData.net)}) divided by income (${formatCurrency(currentMonthData.income)}) = ${operatingMargin.toFixed(1)}%. This shows what percentage of revenue you keep after all expenses. A healthy e-commerce business typically aims for 15-30%.`}
                      />
                      <KPICard 
                        label="OpEx Ratio"
                        value={`${opexRatio.toFixed(1)}%`}
                        subLabel="Operating Exp / Revenue"
                        color={opexRatio <= 50 ? 'text-emerald-400' : opexRatio <= 70 ? 'text-amber-400' : 'text-rose-400'}
                        tooltip={`Operating expenses (${formatCurrency(monthOpEx)}) excluding COGS, divided by revenue (${formatCurrency(currentMonthData.income)}) = ${opexRatio.toFixed(1)}%. This measures operational efficiency. Lower is better — under 50% is excellent, 50-70% is acceptable, over 70% needs attention.`}
                      />
                      <KPICard 
                        label="Revenue MoM"
                        value={`${revenueMoM >= 0 ? '+' : ''}${revenueMoM.toFixed(1)}%`}
                        subLabel="vs Last Month"
                        color={revenueMoM >= 0 ? 'text-emerald-400' : 'text-rose-400'}
                        tooltip={`Revenue changed from ${formatCurrency(lastMonthData.income)} last month to ${formatCurrency(currentMonthData.income)} this month = ${revenueMoM >= 0 ? '+' : ''}${revenueMoM.toFixed(1)}% change. Consistent positive MoM growth indicates healthy business expansion.`}
                      />
                      <KPICard 
                        label="Cash Runway"
                        value={isCashFlowPositive ? 'Positive' : `${runwayMonths.toFixed(1)}mo`}
                        subLabel={isCashFlowPositive ? 'Net cash flow +' : 'At current burn'}
                        color={isCashFlowPositive ? 'text-emerald-400' : runwayMonths >= 6 ? 'text-emerald-400' : runwayMonths >= 3 ? 'text-amber-400' : 'text-rose-400'}
                        tooltip={isCashFlowPositive 
                          ? `Your business is cash flow positive! Average net: ${formatCurrency(avgMonthlyNet)}/month. You're generating more income than expenses, so runway is unlimited.`
                          : `With ${formatCurrency(totalCash)} cash and avg monthly net loss of ${formatCurrency(Math.abs(avgMonthlyNet))}, you have ${runwayMonths.toFixed(1)} months of runway. This factors in your revenue, not just expenses.`}
                      />
                    </div>
                  </div>
                  
                  {/* AI Profit Forecast */}
                  <div className="bg-gradient-to-r from-violet-900/30 to-indigo-900/30 rounded-xl border border-violet-500/30 p-5">
                    <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                      <Brain className="w-5 h-5 text-violet-400" />
                      AI Year-End {forecastBasis === 'sales' ? 'Profit' : 'Cash Flow'} Forecast — {currentYear}
                    </h3>
                    <p className="text-slate-400 text-xs mb-4">
                      {forecastBasis === 'sales' 
                        ? `Based on ${weeksWithData} weeks of actual sales data with ${formatCurrency(actualYTDRevenue)} revenue`
                        : `Based on banking cash flow data (${ytdMonths.length} months). Upload sales data for profit-based forecasting.`}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div className="bg-slate-800/50 rounded-lg p-4">
                        <p className="text-slate-400 text-xs mb-1">YTD Actual {forecastBasis === 'sales' ? 'Profit' : 'Cash Flow'}</p>
                        <p className={`text-2xl font-bold ${(forecastBasis === 'sales' ? actualYTDProfit : ytdCashFlow) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {formatCurrency(forecastBasis === 'sales' ? actualYTDProfit : ytdCashFlow)}
                        </p>
                        <p className="text-slate-500 text-xs">
                          {forecastBasis === 'sales' ? `${weeksWithData} weeks` : `${ytdMonths.length} months`} completed
                        </p>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-4">
                        <p className="text-slate-400 text-xs mb-1">Linear Projection</p>
                        <p className={`text-2xl font-bold ${linearProjection >= 0 ? 'text-cyan-400' : 'text-rose-400'}`}>
                          {formatCurrency(linearProjection)}
                        </p>
                        <p className="text-slate-500 text-xs">
                          Avg {formatCurrency(avgMonthlyProfit)}/mo × {12 - (forecastBasis === 'sales' ? Math.ceil(weeksWithData / 4.33) : ytdMonths.length)} remaining
                        </p>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-4 border border-violet-500/30">
                        <p className="text-violet-400 text-xs mb-1">🤖 AI Trend Forecast</p>
                        <p className={`text-2xl font-bold ${trendProjection >= 0 ? 'text-violet-400' : 'text-rose-400'}`}>
                          {formatCurrency(trendProjection)}
                        </p>
                        <p className="text-slate-500 text-xs">Weighted recent trends</p>
                      </div>
                    </div>
                    
                    {/* Recurring Expenses Deduction */}
                    {recurringMonthlyExpenses > 0 && (
                      <div className="bg-rose-900/20 border border-rose-500/30 rounded-lg p-3 mb-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <RefreshCw className="w-4 h-4 text-rose-400" />
                            <span className="text-rose-400 text-sm font-medium">Recurring Expenses Factored In</span>
                          </div>
                          <span className="text-rose-400 font-bold">-{formatCurrency(recurringCostsRemaining)}</span>
                        </div>
                        <p className="text-slate-500 text-xs mt-1">
                          {confirmedRecurringList.length} confirmed recurring × {monthsRemaining} months remaining
                          ({formatCurrency(recurringMonthlyExpenses)}/mo)
                        </p>
                      </div>
                    )}
                    
                    <div className="bg-slate-800/30 rounded-lg p-3">
                      <p className="text-slate-400 text-sm">
                        <span className="text-violet-400 font-medium">📊 Forecast Methodology:</span> 
                        {forecastBasis === 'sales' 
                          ? ` Using ${weeksWithData} weeks of actual sales profit data. Linear projection uses your average weekly profit (${formatCurrency(avgMonthlyProfit / 4.33)}) × remaining weeks. AI Trend weights your last 4 weeks more heavily to capture recent momentum.`
                          : ` Using banking cash flow data. Linear projection extrapolates your average monthly net (${formatCurrency(avgMonthlyProfit)}). AI Trend weights recent 3 months higher to reflect current performance.`
                        }
                        {recurringMonthlyExpenses > 0 && ` 🔄 Deducting ${formatCurrency(recurringCostsRemaining)} in confirmed recurring expenses (${monthsRemaining} months × ${formatCurrency(recurringMonthlyExpenses)}/mo).`}
                        {trendProjection > linearProjection 
                          ? " 📈 Recent performance is trending above average!" 
                          : trendProjection < linearProjection 
                            ? " 📉 Recent performance is below average — may need attention."
                            : ""}
                      </p>
                    </div>
                  </div>
                  
                  {/* Open PO Cash Flow */}
                  {openPOs.length > 0 && totalPOOutstanding > 0 && (
                    <div className="bg-gradient-to-r from-amber-900/30 to-orange-900/30 rounded-xl border border-amber-500/30 p-5">
                      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <Package className="w-5 h-5 text-amber-400" />
                        Open Purchase Orders — Cash Flow Impact
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                        <div className="bg-slate-800/50 rounded-lg p-4">
                          <p className="text-slate-400 text-xs mb-1">Total PO Value</p>
                          <p className="text-2xl font-bold text-white">{formatCurrency(totalPOValue)}</p>
                          <p className="text-slate-500 text-xs">{openPOs.length} open POs</p>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-4">
                          <p className="text-slate-400 text-xs mb-1">Paid to Date</p>
                          <p className="text-2xl font-bold text-emerald-400">{formatCurrency(totalPOPaid)}</p>
                          <p className="text-slate-500 text-xs">{totalPOValue > 0 ? ((totalPOPaid / totalPOValue * 100).toFixed(0)) : 0}% complete</p>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-4 border border-rose-500/30">
                          <p className="text-rose-400 text-xs mb-1">Outstanding Balance</p>
                          <p className="text-2xl font-bold text-rose-400">{formatCurrency(totalPOOutstanding)}</p>
                          <p className="text-slate-500 text-xs">Payments still due</p>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-4">
                          <p className="text-slate-400 text-xs mb-1">Units Incoming</p>
                          <p className="text-2xl font-bold text-cyan-400">{formatNumber(totalUnitsIncoming)}</p>
                          <p className="text-slate-500 text-xs">@ avg {formatCurrency(avgUnitCost)}/unit</p>
                        </div>
                      </div>
                      
                      {/* Per-PO breakdown */}
                      <div className="space-y-2">
                        {poAnalysis.map(po => (
                          <div key={po.id} className="bg-slate-800/30 rounded-lg p-3 flex items-center justify-between">
                            <div className="flex-1">
                              <p className="text-white font-medium">{po.productName || po.sku}</p>
                              <p className="text-slate-500 text-xs">
                                {po.paymentTerms === '30-70-ship' ? '30/70 rolling' : po.paymentTerms === '50-50' ? '50/50 at completion' : po.paymentTerms}
                                {po.vendor && ` • ${po.vendor}`}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-rose-400 font-medium">{formatCurrency(po.outstanding)} due</p>
                              <p className="text-slate-500 text-xs">{formatNumber(po.unitsRemaining)} units remaining</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      <p className="text-slate-400 text-sm mt-4 pt-3 border-t border-slate-700">
                        💡 <strong>Cash Flow Note:</strong> Outstanding PO balance ({formatCurrency(totalPOOutstanding)}) represents future cash outflows as goods ship. 
                        Factor this into your cash reserves planning. When goods arrive and sell, the unit cost becomes COGS on your P&L.
                      </p>
                    </div>
                  )}
                  
                  {/* Cash Flow Analysis */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                      <h3 className="text-lg font-semibold text-white mb-4">Burn Rate Analysis</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center p-3 bg-slate-700/30 rounded-lg">
                          <span className="text-slate-400">Avg Monthly Expenses</span>
                          <span className="font-bold text-rose-400">{formatCurrency(avgMonthlyExpenses)}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-slate-700/30 rounded-lg">
                          <span className="text-slate-400">Expense Growth MoM</span>
                          <span className={`font-bold flex items-center gap-1 ${expenseMoM <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {expenseMoM >= 0 ? '+' : ''}{expenseMoM.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-slate-700/30 rounded-lg">
                          <span className="text-slate-400">Cash Position</span>
                          <span className="font-bold text-emerald-400">{formatCurrency(totalCash)}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-slate-700/30 rounded-lg">
                          <span className="text-slate-400">Runway</span>
                          <span className={`font-bold ${runwayMonths >= 6 ? 'text-emerald-400' : runwayMonths >= 3 ? 'text-amber-400' : 'text-rose-400'}`}>
                            {runwayMonths === Infinity ? 'Profitable' : `${runwayMonths.toFixed(1)} months`}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                      <h3 className="text-lg font-semibold text-white mb-4">Expense Breakdown (This Month)</h3>
                      <div className="space-y-2">
                        {topExpenseCategories.slice(0, 6).map(([cat, amount]) => {
                          const pct = totalExpenses > 0 ? (amount / totalExpenses * 100) : 0;
                          return (
                            <div key={cat} className="flex items-center gap-2">
                              <div className="flex-1">
                                <div className="flex justify-between text-sm mb-1">
                                  <span className="text-slate-300 truncate">{cat}</span>
                                  <span className="text-slate-400">{formatCurrency(amount)}</span>
                                </div>
                                <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden">
                                  <div className="h-full bg-rose-500/60 rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                              <span className="text-slate-500 text-xs w-12 text-right">{pct.toFixed(0)}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
            
            {/* Credit Cards Tab */}
            {bankingTab === 'cards' && (() => {
              // Get credit card accounts
              const realAccts = Object.entries(bankingData.accounts || {}).filter(([name, _]) => 
                /\(\d{4}\)\s*-\s*\d+$/.test(name) && !name.includes('"') && name.length <= 60
              );
              const creditAccts = realAccts.filter(([_, a]) => a.type === 'credit_card');
              
              // Get credit card transactions grouped by card
              const cardTransactions = {};
              creditAccts.forEach(([name, _]) => {
                cardTransactions[name] = sortedTxns.filter(t => t.account === name && t.isExpense);
              });
              
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              
              // Determine card type and calculate optimal payment dates
              const getCardAnalysis = (cardName, txns) => {
                const nameLower = cardName.toLowerCase();
                const isAmexPlatinum = nameLower.includes('platinum');
                const isAmexPrime = nameLower.includes('prime') || nameLower.includes('amazon');
                const isAmex = nameLower.includes('amex') || nameLower.includes('american express') || isAmexPlatinum || isAmexPrime;
                
                // Get charges from the CURRENT statement cycle only (not yet closed or just recently closed)
                // Old charges from previous statement cycles are assumed to have been paid
                const recentCharges = txns.filter(t => {
                  const txnDate = new Date(t.date + 'T12:00:00');
                  const daysSinceTxn = Math.floor((today - txnDate) / (1000 * 60 * 60 * 24));
                  // Only include charges from last 35 days (current statement cycle)
                  // Older charges are from previous statements which should have been paid
                  return daysSinceTxn >= 0 && daysSinceTxn < 35;
                }).sort((a, b) => a.date.localeCompare(b.date));
                
                // Calculate payment schedule for each charge
                // Amex Business cards typically have:
                // - Statement closes on a fixed date each month (we'll estimate end of month)
                // - Standard due date: 25 days after statement close
                // - Amex Platinum "Please Pay By" is a suggestion; actual due is ~14 days later
                
                const chargeAnalysis = recentCharges.map(t => {
                  const txnDate = new Date(t.date + 'T12:00:00');
                  
                  // Determine which statement this charge will appear on
                  // If charge is in first 25 days of month, it's on that month's statement
                  // Otherwise it rolls to next month's statement
                  let statementMonth, statementYear;
                  if (txnDate.getDate() <= 25) {
                    statementMonth = txnDate.getMonth();
                    statementYear = txnDate.getFullYear();
                  } else {
                    statementMonth = txnDate.getMonth() + 1;
                    statementYear = txnDate.getFullYear();
                    if (statementMonth > 11) {
                      statementMonth = 0;
                      statementYear++;
                    }
                  }
                  
                  // Statement closes at end of the statement month
                  const statementCloseDate = new Date(statementYear, statementMonth + 1, 0);
                  statementCloseDate.setHours(23, 59, 59, 999);
                  
                  // Standard payment due: 25 days after statement close
                  const standardDueDate = new Date(statementCloseDate);
                  standardDueDate.setDate(standardDueDate.getDate() + 25);
                  standardDueDate.setHours(23, 59, 59, 999);
                  
                  // For Amex Platinum: "Please Pay By" is 25 days after close, but REAL due date is ~14 days later
                  // Total: 39 days after statement close
                  let realDueDate, optimalPayDate;
                  if (isAmexPlatinum) {
                    realDueDate = new Date(statementCloseDate);
                    realDueDate.setDate(realDueDate.getDate() + 39);
                    optimalPayDate = new Date(realDueDate);
                    optimalPayDate.setDate(optimalPayDate.getDate() - 5);
                  } else {
                    realDueDate = new Date(standardDueDate);
                    optimalPayDate = new Date(standardDueDate);
                    optimalPayDate.setDate(optimalPayDate.getDate() - 5);
                  }
                  
                  // Calculate days until due
                  const daysUntilDue = Math.ceil((realDueDate - today) / (1000 * 60 * 60 * 24));
                  const daysUntilOptimal = Math.ceil((optimalPayDate - today) / (1000 * 60 * 60 * 24));
                  
                  // Is this charge urgent? (due within 10 days)
                  const isUrgent = daysUntilDue <= 10 && daysUntilDue > -5;
                  // Only flag as past due if significantly overdue (5+ days) AND statement recently closed
                  // This avoids false positives from old charges that were already paid
                  const statementAge = Math.floor((today - statementCloseDate) / (1000 * 60 * 60 * 24));
                  const isPastDue = daysUntilDue < -5 && statementAge < 60;
                  
                  return {
                    ...t,
                    txnDate,
                    statementCloseDate,
                    standardDueDate,
                    realDueDate,
                    optimalPayDate,
                    daysUntilDue,
                    daysUntilOptimal,
                    isUrgent,
                    isPastDue,
                  };
                });
                
                // Group charges by statement period
                const statementGroups = {};
                chargeAnalysis.forEach(c => {
                  const key = c.statementCloseDate.toISOString().slice(0, 7);
                  if (!statementGroups[key]) {
                    statementGroups[key] = {
                      statementCloseDate: c.statementCloseDate,
                      realDueDate: c.realDueDate,
                      optimalPayDate: c.optimalPayDate,
                      daysUntilDue: c.daysUntilDue,
                      charges: [],
                      total: 0,
                    };
                  }
                  statementGroups[key].charges.push(c);
                  statementGroups[key].total += c.amount;
                });
                
                // Find next payment needed (soonest due date with unpaid charges)
                const sortedStatements = Object.values(statementGroups).sort((a, b) => a.realDueDate - b.realDueDate);
                const nextStatement = sortedStatements.find(s => s.daysUntilDue > -30); // Allow some past due
                
                // Urgent charges (due within 10 days)
                const urgentCharges = chargeAnalysis.filter(c => c.isUrgent && !c.isPastDue);
                const pastDueCharges = chargeAnalysis.filter(c => c.isPastDue);
                
                // Total balance from account
                const balance = bankingData.accounts?.[cardName]?.balance || 0;
                
                return {
                  cardName,
                  isAmex,
                  isAmexPlatinum,
                  isAmexPrime,
                  balance,
                  charges: chargeAnalysis,
                  statementGroups: sortedStatements,
                  nextStatement,
                  urgentCharges,
                  pastDueCharges,
                  totalPending: recentCharges.reduce((s, t) => s + t.amount, 0),
                };
              };
              
              const cardAnalyses = creditAccts.map(([name, _]) => getCardAnalysis(name, cardTransactions[name] || []));
              
              // Find any urgent payments across all cards
              const allUrgentCharges = cardAnalyses.flatMap(c => c.urgentCharges);
              const allPastDueCharges = cardAnalyses.flatMap(c => c.pastDueCharges);
              
              return (
                <div className="space-y-6">
                  {/* Past Due Alert */}
                  {allPastDueCharges.length > 0 && (
                    <div className="bg-rose-900/30 border border-rose-500/50 rounded-xl p-4">
                      <h3 className="text-lg font-semibold text-rose-400 mb-2 flex items-center gap-2">
                        <AlertCircle className="w-5 h-5" />
                        Past Due Warning
                      </h3>
                      <p className="text-rose-200">
                        You have {allPastDueCharges.length} charges that may be past their due date.
                        Pay immediately to avoid late fees and interest.
                      </p>
                    </div>
                  )}
                  
                  {/* Payment Due Soon Alert */}
                  {allUrgentCharges.length > 0 && allPastDueCharges.length === 0 && (
                    <div className="bg-amber-900/30 border border-amber-500/50 rounded-xl p-4">
                      <h3 className="text-lg font-semibold text-amber-400 mb-2 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" />
                        Payment Due Soon
                      </h3>
                      <p className="text-amber-200">
                        You have charges with payments due within 10 days.
                        Pay by the optimal dates below to avoid interest while maximizing your cash flow.
                      </p>
                    </div>
                  )}
                  
                  {/* Amex Card Rules Reference */}
                  <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <HelpCircle className="w-5 h-5 text-cyan-400" />
                      Amex Business Card Payment Rules
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-slate-700/30 rounded-lg p-4 border-l-4 border-violet-500">
                        <h4 className="font-semibold text-violet-400 mb-2">💳 Business Platinum</h4>
                        <ul className="text-sm text-slate-300 space-y-1">
                          <li>• Statement closes ~end of month</li>
                          <li>• "Please Pay By" = 25 days after close</li>
                          <li>• <span className="text-amber-400">Actual due date = ~39 days after close</span></li>
                          <li>• Pay in full by actual due date = no interest</li>
                          <li>• <span className="text-emerald-400">Strategy: Pay 5 days before actual due</span></li>
                        </ul>
                      </div>
                      <div className="bg-slate-700/30 rounded-lg p-4 border-l-4 border-amber-500">
                        <h4 className="font-semibold text-amber-400 mb-2">📦 Business Prime (Amazon)</h4>
                        <ul className="text-sm text-slate-300 space-y-1">
                          <li>• Statement closes ~end of month</li>
                          <li>• Due date = 25 days after statement close</li>
                          <li>• Optional: 90-day terms (forfeits 5% back)</li>
                          <li>• Pay in full by due date = no interest</li>
                          <li>• <span className="text-emerald-400">Strategy: Pay 5 days before due</span></li>
                        </ul>
                      </div>
                    </div>
                  </div>
                  
                  {/* Card-by-Card Analysis */}
                  {cardAnalyses.map(card => (
                    <div key={card.cardName} className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                          <CreditCard className={`w-5 h-5 ${card.isAmexPlatinum ? 'text-violet-400' : card.isAmexPrime ? 'text-amber-400' : 'text-cyan-400'}`} />
                          {card.cardName.split('(')[0].trim()}
                          {card.isAmexPlatinum && <span className="text-xs bg-violet-500/30 text-violet-300 px-2 py-0.5 rounded">Platinum</span>}
                          {card.isAmexPrime && <span className="text-xs bg-amber-500/30 text-amber-300 px-2 py-0.5 rounded">Prime</span>}
                        </h3>
                        <span className="text-rose-400 font-bold text-lg">{formatCurrency(card.balance)}</span>
                      </div>
                      
                      {/* Next Payment Due */}
                      {card.nextStatement && (
                        <div className={`mb-4 p-4 rounded-lg ${
                          card.nextStatement.daysUntilDue < 0 ? 'bg-rose-900/30 border border-rose-500/30' :
                          card.nextStatement.daysUntilDue <= 10 ? 'bg-amber-900/30 border border-amber-500/30' : 
                          'bg-emerald-900/20 border border-emerald-500/30'
                        }`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className={`font-medium ${
                                card.nextStatement.daysUntilDue < 0 ? 'text-rose-400' :
                                card.nextStatement.daysUntilDue <= 10 ? 'text-amber-400' : 
                                'text-emerald-400'
                              }`}>
                                {card.nextStatement.daysUntilDue < 0 ? '🚨 Check Statement - Payment May Be Due' :
                                 card.nextStatement.daysUntilDue <= 10 ? '⚠️ Payment Window Open' : 
                                 '✓ On Track'}
                              </p>
                              <p className="text-sm text-slate-300 mt-1">
                                Current Balance: <span className="font-bold text-white">{formatCurrency(Math.abs(card.balance))}</span>
                                <span className="text-slate-500 text-xs ml-1">(from QBO)</span>
                              </p>
                              <p className="text-sm text-slate-300">
                                Suggested Pay By: <span className="font-bold text-cyan-400">{card.nextStatement.optimalPayDate.toLocaleDateString()}</span>
                                <span className="text-slate-500 ml-1">
                                  ({card.nextStatement.daysUntilDue - 5 > 0 ? `~${card.nextStatement.daysUntilDue - 5} days` : 'soon'})
                                </span>
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-slate-400 text-xs">Est. Due Date</p>
                              <p className={`font-bold text-lg ${card.nextStatement.daysUntilDue < 0 ? 'text-rose-400' : 'text-white'}`}>
                                {card.nextStatement.realDueDate.toLocaleDateString()}
                              </p>
                              <p className="text-xs text-slate-500 mt-1">Verify w/ statement</p>
                            </div>
                          </div>
                          <p className="text-xs text-slate-500 mt-2 pt-2 border-t border-slate-700/50">
                            💡 Due dates are estimates based on typical {card.isAmex ? 'Amex' : 'credit card'} billing cycles. Always check your actual statement.
                          </p>
                        </div>
                      )}
                      
                      {/* Recent Charges Summary */}
                      {card.charges.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="text-sm font-medium text-slate-400">Recent Activity (Last 35 Days)</h4>
                          <div className="bg-slate-700/30 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-slate-300 text-sm">{card.charges.length} charges tracked</span>
                              <span className="text-slate-400 text-sm">{formatCurrency(card.charges.reduce((s, c) => s + c.amount, 0))}</span>
                            </div>
                            <p className="text-xs text-slate-500">
                              Note: This is recent activity only, not your full statement balance
                            </p>
                          </div>
                        </div>
                      )}
                      
                      {card.charges.length === 0 && (
                        <p className="text-slate-500 text-sm">No recent charges found for this card in the last 60 days.</p>
                      )}
                    </div>
                  ))}
                  
                  {creditAccts.length === 0 && (
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-8 text-center">
                      <CreditCard className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                      <p className="text-slate-400">No credit card accounts found in your banking data.</p>
                      <p className="text-slate-500 text-sm mt-1">Upload a QBO file that includes your credit card transactions.</p>
                    </div>
                  )}
                </div>
              );
            })()}
            
            {/* Revenue Channels Tab - Amazon vs Shopify */}
            {bankingTab === 'channels' && (() => {
              // Get revenue by channel from QBO sync
              const qboChannels = bankingData.revenueByChannel;
              
              const now = new Date();
              const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
              const currentYear = now.getFullYear();
              
              // Helper to filter QBO channel data by period
              const getQboChannelByPeriod = (channelData, period) => {
                if (!channelData?.byMonth) return 0;
                const entries = Object.entries(channelData.byMonth);
                
                switch (period) {
                  case 'month':
                    return channelData.byMonth[currentMonth] || 0;
                  case 'ytd':
                    return entries
                      .filter(([m]) => m.startsWith(String(currentYear)))
                      .reduce((s, [_, v]) => s + v, 0);
                  default: // 'all'
                    return channelData.total || 0;
                }
              };
              
              // Calculate from allDaysData as backup/additional source
              const channelData = { amazon: {}, shopify: {}, other: {} };
              Object.entries(allDaysData || {}).forEach(([date, day]) => {
                const month = date.substring(0, 7);
                
                // Amazon revenue from daily data
                const amazonRev = (day.amazon?.sales || 0);
                if (amazonRev > 0) {
                  if (!channelData.amazon[month]) channelData.amazon[month] = 0;
                  channelData.amazon[month] += amazonRev;
                }
                
                // Shopify revenue from daily data
                const shopifyRev = (day.shopify?.sales || 0) || (day.totalSales && !day.amazon?.sales ? day.totalSales : 0);
                if (shopifyRev > 0) {
                  if (!channelData.shopify[month]) channelData.shopify[month] = 0;
                  channelData.shopify[month] += shopifyRev;
                }
              });
              
              // Determine data source - prefer QBO if available, else use daily data
              const hasQboData = qboChannels && (qboChannels.amazon?.total > 0 || qboChannels.shopify?.total > 0);
              const hasDailyData = Object.keys(channelData.amazon).length > 0 || Object.keys(channelData.shopify).length > 0;
              
              // Calculate totals based on period and data source
              let amazonAmount, shopifyAmount, otherAmount;
              
              if (hasQboData) {
                // Use QBO bank deposits data filtered by period
                amazonAmount = getQboChannelByPeriod(qboChannels.amazon, channelPeriod);
                shopifyAmount = getQboChannelByPeriod(qboChannels.shopify, channelPeriod);
                otherAmount = getQboChannelByPeriod(qboChannels.other, channelPeriod);
              } else if (hasDailyData) {
                // Fallback to daily sales data
                const getDailyByPeriod = (data, period) => {
                  const entries = Object.entries(data);
                  switch (period) {
                    case 'month':
                      return data[currentMonth] || 0;
                    case 'ytd':
                      return entries
                        .filter(([m]) => m.startsWith(String(currentYear)))
                        .reduce((s, [_, v]) => s + v, 0);
                    default:
                      return entries.reduce((s, [_, v]) => s + v, 0);
                  }
                };
                amazonAmount = getDailyByPeriod(channelData.amazon, channelPeriod);
                shopifyAmount = getDailyByPeriod(channelData.shopify, channelPeriod);
                otherAmount = 0;
              } else {
                amazonAmount = 0;
                shopifyAmount = 0;
                otherAmount = 0;
              }
              
              const totalAmount = amazonAmount + shopifyAmount;
              
              // Get monthly data for chart - combine both sources
              const getMonthlyData = () => {
                const months = {};
                
                // Add QBO data
                if (qboChannels?.amazon?.byMonth) {
                  Object.entries(qboChannels.amazon.byMonth).forEach(([m, v]) => {
                    if (!months[m]) months[m] = { amazon: 0, shopify: 0 };
                    months[m].amazon = v;
                  });
                }
                if (qboChannels?.shopify?.byMonth) {
                  Object.entries(qboChannels.shopify.byMonth).forEach(([m, v]) => {
                    if (!months[m]) months[m] = { amazon: 0, shopify: 0 };
                    months[m].shopify = v;
                  });
                }
                
                // If no QBO data, use daily data
                if (Object.keys(months).length === 0) {
                  Object.entries(channelData.amazon).forEach(([m, v]) => {
                    if (!months[m]) months[m] = { amazon: 0, shopify: 0 };
                    months[m].amazon = v;
                  });
                  Object.entries(channelData.shopify).forEach(([m, v]) => {
                    if (!months[m]) months[m] = { amazon: 0, shopify: 0 };
                    months[m].shopify = v;
                  });
                }
                
                return months;
              };
              
              const monthlyData = getMonthlyData();
              const allMonths = Object.keys(monthlyData).sort().slice(-12);
              
              return (
                <div className="space-y-6">
                  {/* Period Selector */}
                  <div className="flex gap-2">
                    {['month', 'ytd', 'all'].map(p => (
                      <button
                        key={p}
                        onClick={() => setChannelPeriod(p)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          channelPeriod === p 
                            ? 'bg-emerald-600 text-white' 
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        {p === 'month' ? 'This Month' : p === 'ytd' ? 'Year to Date' : 'All Time'}
                      </button>
                    ))}
                  </div>
                  
                  {/* Data Source Indicator */}
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    {hasQboData ? (
                      <>
                        <Landmark className="w-3 h-3" />
                        <span>Data from QuickBooks bank deposits</span>
                      </>
                    ) : hasDailyData ? (
                      <>
                        <BarChart3 className="w-3 h-3" />
                        <span>Data from daily sales uploads</span>
                      </>
                    ) : null}
                  </div>
                  
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Amazon */}
                    <div className="bg-gradient-to-br from-orange-900/30 to-amber-900/20 rounded-xl border border-orange-500/30 p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
                          <Package className="w-5 h-5 text-orange-400" />
                        </div>
                        <div>
                          <p className="text-orange-400 font-medium">Amazon</p>
                          <p className="text-slate-400 text-xs">FBA + Seller Central</p>
                        </div>
                      </div>
                      <p className="text-3xl font-bold text-white">{formatCurrency(amazonAmount)}</p>
                      {totalAmount > 0 && (
                        <p className="text-orange-400 text-sm mt-1">
                          {(amazonAmount / totalAmount * 100).toFixed(1)}% of revenue
                        </p>
                      )}
                    </div>
                    
                    {/* Shopify */}
                    <div className="bg-gradient-to-br from-green-900/30 to-emerald-900/20 rounded-xl border border-green-500/30 p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                          <ShoppingBag className="w-5 h-5 text-green-400" />
                        </div>
                        <div>
                          <p className="text-green-400 font-medium">Shopify</p>
                          <p className="text-slate-400 text-xs">Direct to Consumer</p>
                        </div>
                      </div>
                      <p className="text-3xl font-bold text-white">{formatCurrency(shopifyAmount)}</p>
                      {totalAmount > 0 && (
                        <p className="text-green-400 text-sm mt-1">
                          {(shopifyAmount / totalAmount * 100).toFixed(1)}% of revenue
                        </p>
                      )}
                    </div>
                    
                    {/* Total */}
                    <div className="bg-gradient-to-br from-violet-900/30 to-purple-900/20 rounded-xl border border-violet-500/30 p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-violet-500/20 rounded-lg flex items-center justify-center">
                          <DollarSign className="w-5 h-5 text-violet-400" />
                        </div>
                        <div>
                          <p className="text-violet-400 font-medium">Total Revenue</p>
                          <p className="text-slate-400 text-xs">
                            {channelPeriod === 'month' ? 'This Month' : channelPeriod === 'ytd' ? 'Year to Date' : 'All Time'}
                          </p>
                        </div>
                      </div>
                      <p className="text-3xl font-bold text-white">{formatCurrency(totalAmount)}</p>
                      {otherAmount > 0 && (
                        <p className="text-slate-400 text-sm mt-1">
                          + {formatCurrency(otherAmount)} other income
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* Monthly Breakdown Chart */}
                  <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                    <h3 className="text-lg font-semibold text-white mb-4">Monthly Revenue by Channel</h3>
                    {allMonths.length > 0 ? (
                      <div className="space-y-3">
                        {allMonths.slice(-6).map(month => {
                          const amz = monthlyData[month]?.amazon || 0;
                          const shp = monthlyData[month]?.shopify || 0;
                          const total = amz + shp;
                          const maxTotal = Math.max(...allMonths.slice(-6).map(m => (monthlyData[m]?.amazon || 0) + (monthlyData[m]?.shopify || 0)));
                          
                          return (
                            <div key={month} className="space-y-1">
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-300">{new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                                <span className="text-white font-medium">{formatCurrency(total)}</span>
                              </div>
                              <div className="h-6 bg-slate-700 rounded-full overflow-hidden flex">
                                {amz > 0 && (
                                  <div 
                                    className="bg-gradient-to-r from-orange-500 to-amber-500 h-full flex items-center justify-center text-xs font-medium"
                                    style={{ width: `${maxTotal > 0 ? (amz / maxTotal) * 100 : 0}%` }}
                                  >
                                    {amz > maxTotal * 0.1 && formatCurrency(amz)}
                                  </div>
                                )}
                                {shp > 0 && (
                                  <div 
                                    className="bg-gradient-to-r from-green-500 to-emerald-500 h-full flex items-center justify-center text-xs font-medium"
                                    style={{ width: `${maxTotal > 0 ? (shp / maxTotal) * 100 : 0}%` }}
                                  >
                                    {shp > maxTotal * 0.1 && formatCurrency(shp)}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <ShoppingBag className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                        <p className="text-slate-400">No sales channel data available yet.</p>
                        <p className="text-slate-500 text-sm mt-1">Sync with QuickBooks or upload daily sales data to see channel breakdown.</p>
                      </div>
                    )}
                    
                    {/* Legend */}
                    {allMonths.length > 0 && (
                      <div className="flex gap-6 mt-4 pt-4 border-t border-slate-700">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-gradient-to-r from-orange-500 to-amber-500"></div>
                          <span className="text-sm text-slate-400">Amazon</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-gradient-to-r from-green-500 to-emerald-500"></div>
                          <span className="text-sm text-slate-400">Shopify</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            
            {/* Vendors Tab - Top Spending */}
            {bankingTab === 'vendors' && (() => {
              const chartOfAccounts = bankingData.chartOfAccounts || [];
              const profitAndLoss = bankingData.profitAndLoss;
              
              // Use the main banking date range filter for consistency
              const vendorDateFilter = dateFilter;
              
              // Calculate vendor spending from filtered transactions (only real expenses)
              const vendorSpendingFromTxns = {};
              sortedTxns.filter(t => t.date >= vendorDateFilter && t.isExpense).forEach(t => {
                // Use vendor name if available, otherwise try to extract from description
                let vendorName = t.vendor;
                const desc = (t.description || '').toLowerCase();
                const memo = (t.memo || '').toLowerCase();
                const combined = desc + ' ' + memo;
                
                // First check if description/memo contains known vendor patterns
                // This catches payments where vendor field isn't set but description mentions the vendor
                if (!vendorName || vendorName === '' || vendorName === 'Unknown Vendor') {
                  // Check for known vendors in description
                  if (combined.includes('shulman')) {
                    vendorName = 'Shulman Rogers';
                  } else if (combined.includes('marpac')) {
                    vendorName = 'Marpac';
                  } else if (combined.includes('formunova')) {
                    vendorName = 'FormuNova';
                  } else if (combined.includes('alibaba')) {
                    vendorName = 'Alibaba';
                  } else if (combined.includes('3pl') || combined.includes('excel')) {
                    vendorName = 'Excel 3PL';
                  } else if (combined.includes('amazon')) {
                    vendorName = 'Amazon';
                  } else if (combined.includes('shopify')) {
                    vendorName = 'Shopify';
                  } else {
                    // Try to extract vendor from description
                    const rawDesc = t.description || '';
                    if (rawDesc && rawDesc.length > 2) {
                      vendorName = rawDesc.split(' - ')[0].split(',')[0].split('#')[0].trim();
                      if (vendorName.length < 2 || vendorName.length > 60) {
                        vendorName = null;
                      }
                    }
                  }
                }
                
                if (!vendorName) return; // Skip if no vendor name
                
                // Normalize vendor name
                vendorName = normalizeVendor(vendorName);
                
                // Generic vendor names should be split by category instead of grouped
                // This prevents "Online" from lumping together unrelated expenses
                const genericVendors = ['online', 'internet', 'web', 'digital', 'electronic', 'misc', 'miscellaneous', 'other', 'various'];
                const isGenericVendor = genericVendors.includes(vendorName.toLowerCase());
                const cat = normalizeCategory(t.topCategory || t.category);
                
                // For generic vendors, use category as the grouping key
                const groupKey = isGenericVendor ? cat : vendorName;
                const displayName = isGenericVendor ? cat : vendorName;
                
                if (!vendorSpendingFromTxns[groupKey]) {
                  vendorSpendingFromTxns[groupKey] = { 
                    name: displayName, 
                    totalSpent: 0, 
                    transactionCount: 0,
                    categories: {},
                    lastTransaction: null,
                    isCategory: isGenericVendor, // Flag to indicate this is a category grouping
                  };
                }
                vendorSpendingFromTxns[groupKey].totalSpent += Math.abs(t.amount);
                vendorSpendingFromTxns[groupKey].transactionCount += 1;
                // Track category breakdown
                vendorSpendingFromTxns[groupKey].categories[cat] = 
                  (vendorSpendingFromTxns[groupKey].categories[cat] || 0) + Math.abs(t.amount);
                if (!vendorSpendingFromTxns[groupKey].lastTransaction || t.date > vendorSpendingFromTxns[groupKey].lastTransaction) {
                  vendorSpendingFromTxns[groupKey].lastTransaction = t.date;
                }
              });
              
              // Sort by spend
              const displayVendors = Object.values(vendorSpendingFromTxns)
                .filter(v => v.totalSpent > 0)
                .sort((a, b) => b.totalSpent - a.totalSpent);
              
              const totalVendorSpend = displayVendors.reduce((s, v) => s + v.totalSpent, 0);
              
              // Get date range label
              const dateRangeLabel = {
                'week': 'Last 7 Days',
                'month': 'This Month',
                'quarter': 'This Quarter',
                'ytd': 'Year to Date',
                'year': 'Last 12 Months',
                'all': 'All Time'
              }[bankingDateRange] || 'Selected Period';
              
              return (
                <div className="space-y-6">
                  {/* P&L Summary if available */}
                  {profitAndLoss && (
                    <div className="bg-gradient-to-br from-emerald-900/20 to-cyan-900/20 rounded-xl border border-emerald-500/30 p-5">
                      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <LineChart className="w-5 h-5 text-emerald-400" />
                        Profit & Loss Summary (YTD from QBO)
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-3 bg-slate-900/50 rounded-lg">
                          <p className="text-emerald-400 text-xs font-medium">Total Income</p>
                          <p className="text-xl font-bold text-white">{formatCurrency(profitAndLoss.totalIncome)}</p>
                        </div>
                        <div className="text-center p-3 bg-slate-900/50 rounded-lg">
                          <p className="text-amber-400 text-xs font-medium">Cost of Goods</p>
                          <p className="text-xl font-bold text-white">{formatCurrency(profitAndLoss.totalCOGS)}</p>
                        </div>
                        <div className="text-center p-3 bg-slate-900/50 rounded-lg">
                          <p className="text-rose-400 text-xs font-medium">Total Expenses</p>
                          <p className="text-xl font-bold text-white">{formatCurrency(profitAndLoss.totalExpenses)}</p>
                        </div>
                        <div className="text-center p-3 bg-slate-900/50 rounded-lg">
                          <p className={`text-xs font-medium ${profitAndLoss.netIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>Net Income</p>
                          <p className={`text-xl font-bold ${profitAndLoss.netIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {formatCurrency(profitAndLoss.netIncome)}
                          </p>
                        </div>
                      </div>
                      <p className="text-slate-500 text-xs mt-3">
                        Period: {profitAndLoss.period?.start} to {profitAndLoss.period?.end}
                      </p>
                    </div>
                  )}
                  
                  {/* Vendor Overrides Summary */}
                  {Object.keys(vendorOverrides).length > 0 && (
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                          <GitCompareArrows className="w-4 h-4 text-violet-400" />
                          Vendor Mappings ({Object.keys(vendorOverrides).length})
                        </h4>
                        <button
                          onClick={() => {
                            if (confirm('Clear all vendor mappings?')) {
                              const newBankingData = { ...bankingData, vendorOverrides: {} };
                              setBankingData(newBankingData);
                              lsSet('ecommerce_banking_v1', JSON.stringify(newBankingData));
                              queueCloudSave({ ...combinedData, bankingData: newBankingData });
                              setToast({ message: 'All vendor mappings cleared', type: 'success' });
                            }
                          }}
                          className="text-xs text-slate-500 hover:text-rose-400 transition-colors"
                        >Clear All</button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(vendorOverrides).map(([from, to]) => (
                          <span key={from} className="inline-flex items-center gap-1 px-2 py-1 bg-slate-700/50 rounded text-xs">
                            <span className="text-slate-400">{from}</span>
                            <span className="text-slate-600">→</span>
                            <span className="text-violet-400">{to}</span>
                            <button
                              onClick={() => {
                                const newOvr = { ...vendorOverrides };
                                delete newOvr[from];
                                const newBD = { ...bankingData, vendorOverrides: newOvr };
                                setBankingData(newBD);
                                lsSet('ecommerce_banking_v1', JSON.stringify(newBD));
                                queueCloudSave({ ...combinedData, bankingData: newBD });
                              }}
                              className="text-slate-600 hover:text-rose-400 ml-1"
                            ><X className="w-3 h-3" /></button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Top Vendors */}
                  <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Building className="w-5 h-5 text-violet-400" />
                        Top Vendors by Spending
                        <span className="text-sm font-normal text-slate-400">({dateRangeLabel})</span>
                      </h3>
                      <span className="text-slate-400 text-sm">{displayVendors.length} vendors • {formatCurrency(totalVendorSpend)} total</span>
                    </div>
                    
                    {displayVendors.length > 0 ? (
                      <div className="space-y-3">
                        {displayVendors.slice(0, 15).map((vendor, idx) => {
                          const pct = totalVendorSpend > 0 ? (vendor.totalSpent / totalVendorSpend * 100) : 0;
                          const topCategory = Object.entries(vendor.categories || {})
                            .sort((a, b) => b[1] - a[1])[0];
                          const allCategories = Object.entries(vendor.categories || {}).sort((a, b) => b[1] - a[1]);
                          
                          return (
                            <div key={vendor.name} className="bg-slate-900/50 rounded-lg p-4 group">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                    idx === 0 ? 'bg-amber-500 text-black' :
                                    idx === 1 ? 'bg-slate-300 text-black' :
                                    idx === 2 ? 'bg-amber-700 text-white' :
                                    'bg-slate-700 text-slate-300'
                                  }`}>
                                    {idx + 1}
                                  </span>
                                  <div>
                                    <p className="text-white font-medium flex items-center gap-2">
                                      {vendor.name}
                                      {vendor.isCategory && (
                                        <span className="text-xs px-1.5 py-0.5 bg-violet-500/30 text-violet-300 rounded">category</span>
                                      )}
                                    </p>
                                    {topCategory && !vendor.isCategory && (
                                      <p className="text-slate-500 text-xs">
                                        Top: {topCategory[0]} ({formatCurrency(topCategory[1])})
                                      </p>
                                    )}
                                    {vendor.isCategory && (
                                      <p className="text-slate-500 text-xs">
                                        {vendor.transactionCount} transactions
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {!vendor.isCategory && (
                                      <>
                                        <button
                                          onClick={() => {
                                            const newName = prompt(`Rename vendor "${vendor.name}" to:`, vendor.name);
                                            if (newName && newName.trim() !== vendor.name) {
                                              handleVendorRename(vendor.name, newName.trim());
                                            }
                                          }}
                                          className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
                                          title="Rename this vendor"
                                        >Rename</button>
                                        <button
                                          onClick={() => {
                                            const existingCats = Object.keys(expensesByCategory).sort();
                                            const catList = existingCats.map((c, i) => `${i + 1}. ${c}`).join('\n');
                                            const input = prompt(
                                              `Set category for all "${vendor.name}" transactions.\n\nExisting categories:\n${catList}\n\nEnter category name:`,
                                              topCategory ? topCategory[0] : ''
                                            );
                                            if (input && input.trim()) {
                                              handleVendorCategoryUpdate(vendor.name, input.trim());
                                            }
                                          }}
                                          className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
                                          title="Change category for all this vendor's transactions"
                                        >Category</button>
                                      </>
                                    )}
                                  </div>
                                  <div className="text-right">
                                    <p className="text-rose-400 font-bold">{formatCurrency(vendor.totalSpent)}</p>
                                    {!vendor.isCategory && (
                                      <p className="text-slate-500 text-xs">{vendor.transactionCount} transactions</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {allCategories.length > 1 && !vendor.isCategory && (
                                <div className="flex flex-wrap gap-1.5 mt-2 mb-2">
                                  {allCategories.slice(0, 5).map(([cat, amt]) => (
                                    <span key={cat} className="text-xs px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">
                                      {cat}: {formatCurrency(amt)}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <p className="text-slate-500 text-xs mt-1 text-right">{pct.toFixed(1)}% of total spend</p>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Building className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                        <p className="text-slate-400">No vendor data available yet.</p>
                        <p className="text-slate-500 text-sm mt-1">Sync with QuickBooks to see vendor spending breakdown.</p>
                      </div>
                    )}
                    
                    {/* Total */}
                    {displayVendors.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-700 flex justify-between items-center">
                        <span className="text-slate-400 font-medium">Total Vendor Spending</span>
                        <span className="text-white font-bold text-lg">{formatCurrency(totalVendorSpend)}</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Chart of Accounts Summary */}
                  {chartOfAccounts.length > 0 && (
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-cyan-400" />
                        Chart of Accounts
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'].map(classification => {
                          const accounts = chartOfAccounts.filter(a => a.classification === classification);
                          const total = accounts.reduce((s, a) => s + Math.abs(a.currentBalance || 0), 0);
                          
                          return (
                            <div key={classification} className="bg-slate-900/50 rounded-lg p-3 text-center">
                              <p className={`text-xs font-medium mb-1 ${
                                classification === 'Asset' ? 'text-emerald-400' :
                                classification === 'Liability' ? 'text-rose-400' :
                                classification === 'Equity' ? 'text-violet-400' :
                                classification === 'Revenue' ? 'text-cyan-400' :
                                'text-amber-400'
                              }`}>{classification}</p>
                              <p className="text-lg font-bold text-white">{accounts.length}</p>
                              <p className="text-slate-500 text-xs">accounts</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
};

export default BankingView;
