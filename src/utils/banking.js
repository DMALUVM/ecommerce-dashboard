// Banking utility functions
// Handles QBO (QuickBooks Online) transaction parsing

import { parseCSVLine } from './csv';

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
  
  // Bank account patterns - must have account number pattern like (5983), (1003), (1009)
  const isBankAccount = (name) => {
    // Must have account number in parentheses pattern at end
    const hasAccountNumber = /\(\d{4}\)\s*-\s*\d+$/.test(name);
    if (!hasAccountNumber) return false;
    
    // Must NOT contain quotes (sign of corrupted multi-line CSV parsing)
    if (name.includes('"')) return false;
    
    // Must be reasonably short (account names are typically < 50 chars)
    if (name.length > 60) return false;
    
    // Must start with a letter (not a continuation of a memo)
    if (!/^[A-Za-z]/.test(name.trim())) return false;
    
    const lower = name.toLowerCase();
    return (
      lower.includes('checking') ||
      lower.includes('savings') ||
      lower.includes('operations') ||
      lower.includes('card') ||
      lower.includes('credit') ||
      lower.includes('amex') ||
      lower.includes('visa') ||
      lower.includes('mastercard') ||
      lower.includes('platinum') ||
      lower.includes('(5983)') ||
      lower.includes('(1003)') ||
      lower.includes('(1009)')
    );
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
                             lowerName.includes('1003') ||
                             lowerName.includes('1009')) ? 'credit_card' : 'checking';
        
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
      const txnLower = txnType.toLowerCase();
      if (txnLower.includes('credit') || txnLower.includes('refund') || txnLower.includes('return')) {
        isIncome = true;
      } else if (amount > 0) {
        isExpense = true;
      } else if (amount < 0 && !txnLower.includes('payment')) {
        isIncome = true; // Negative non-payment = refund/credit
      }
    } else {
      // Checking/savings accounts
      if (txnType === 'Deposit' && amount > 0) isIncome = true;
      else if (txnType === 'Sales Receipt' && amount > 0) isIncome = true;
      else if (txnType === 'Payment' && amount > 0) isIncome = true;
      else if (txnType === 'Payment' && amount < 0) isExpense = true;
      else if (txnType === 'Invoice' && amount > 0) isIncome = true;
      else if ((txnType === 'Expense' || txnType === 'Check') && amount < 0) isExpense = true;
      else if (txnType === 'Credit Card Payment' && amount < 0) isExpense = true;
      else if (txnType === 'Refund Receipt') isExpense = true;
      else if (txnType === 'Transfer') {
        // Only skip true inter-account transfers (checking <-> savings with account number)
        const catLower = category.toLowerCase();
        const isInterAccount = (
          (/\(\d{4}\)\s*[-–]/.test(category) && (
            catLower.includes('checking') || catLower.includes('savings') || catLower.includes('money market') ||
            catLower.includes('card') || catLower.includes('operations')
          )) ||
          (catLower.includes('checking') && /\(\d{4}\)/.test(category)) ||
          (catLower.includes('savings') && /\(\d{4}\)/.test(category))
        );
        if (isInterAccount) {
          continue;
        } else if (amount > 0) isIncome = true;
        else if (amount < 0) isExpense = true;
      }
      else if (txnType === 'Payroll Check') isExpense = true;
      else if (txnType === 'Bill Payment' && amount < 0) isExpense = true;
      else if (amount > 0 && !isIncome) isIncome = true;  // Catch-all: positive = income
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

export { parseQBOTransactions };
