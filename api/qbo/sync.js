// /api/qbo/sync.js
// Fetches transactions from QuickBooks Online
import {
  applyCors,
  handlePreflight,
  requireMethod,
  enforceRateLimit,
  enforceUserAuth,
  getUserSecret,
} from '../_lib/security.js';

export default async function handler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json({ error: 'Origin not allowed' });
  if (handlePreflight(req, res)) return;
  if (!requireMethod(req, res, 'POST')) return;
  if (!enforceRateLimit(req, res, 'qbo-sync', { max: 30, windowMs: 60_000 })) return;

  const authUser = await enforceUserAuth(req, res, { required: false });
  if (!authUser && res.writableEnded) return;

  try {
    let { accessToken, realmId, refreshToken, startDate, endDate } = req.body || {};

    if (!accessToken || !realmId) {
      try {
        const record = authUser?.id ? await getUserSecret(authUser.id, 'qbo') : null;
        const secret = record?.secret || null;
        if (secret) {
          accessToken = accessToken || secret.accessToken;
          realmId = realmId || secret.realmId;
          refreshToken = refreshToken || secret.refreshToken;
        }
      } catch {
        // Ignore secret fetch failures and continue with request payload validation.
      }
    }

    // Validate required fields
    if (!accessToken || !realmId) {
      return res.status(400).json({ 
        error: 'Missing required fields: accessToken and realmId',
        received: { hasAccessToken: !!accessToken, hasRealmId: !!realmId }
      });
    }

    // Default to PRODUCTION (most users have real QBO accounts)
    // Set QBO_ENVIRONMENT=sandbox only if testing with sandbox account
    const isSandbox = process.env.QBO_ENVIRONMENT === 'sandbox';
    const baseUrl = isSandbox
      ? 'https://sandbox-quickbooks.api.intuit.com'
      : 'https://quickbooks.api.intuit.com';

    console.log('QBO Sync starting:', { 
      realmId, 
      environment: isSandbox ? 'sandbox' : 'production',
      baseUrl 
    });

    // Default to last 365 days if no startDate provided (full year of data)
    const queryStartDate = startDate || 
      new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const queryEndDate = endDate || new Date().toISOString().split('T')[0];

    const transactions = [];
    
    // Helper function to make QBO API calls with better error handling
    async function qboQuery(entityName, query) {
      const url = `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}`;
      
      console.log(`Fetching ${entityName}...`);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`${entityName} query failed:`, response.status, errorText);
        
        // Check if token expired
        if (response.status === 401) {
          throw { status: 401, message: 'Token expired', needsRefresh: true };
        }
        
        // Don't fail entire sync for individual query failures (except auth)
        console.warn(`Skipping ${entityName} due to error`);
        return [];
      }

      const data = await response.json();
      return data.QueryResponse?.[entityName] || [];
    }

    // ========== FETCH PURCHASES (Expenses, Bills, Checks) ==========
    const purchaseQuery = `SELECT * FROM Purchase WHERE TxnDate >= '${queryStartDate}' AND TxnDate <= '${queryEndDate}' ORDERBY TxnDate DESC MAXRESULTS 1000`;
    
    const purchases = await qboQuery('Purchase', purchaseQuery);
    console.log(`Found ${purchases.length} purchases`);

    // Transform purchases to standard format
    purchases.forEach(p => {
      transactions.push({
        id: `qbo-purchase-${p.Id}`,
        qboId: p.Id,
        qboType: 'Purchase',
        date: p.TxnDate,
        type: 'expense',
        amount: -Math.abs(p.TotalAmt || 0),
        description: p.PrivateNote || p.DocNumber || `${p.PaymentType || 'Payment'} - ${p.EntityRef?.name || 'Vendor'}`,
        account: p.AccountRef?.name || 'Unknown Account',
        accountId: p.AccountRef?.value,
        vendor: p.EntityRef?.name || '',
        vendorId: p.EntityRef?.value,
        category: p.Line?.[0]?.AccountBasedExpenseLineDetail?.AccountRef?.name || 
                  p.Line?.[0]?.ItemBasedExpenseLineDetail?.ItemRef?.name || 
                  'Uncategorized',
        paymentMethod: p.PaymentType || 'Other',
        memo: p.PrivateNote || '',
        lineItems: (p.Line || []).filter(l => l.DetailType !== 'SubTotalLineDetail').map(line => ({
          description: line.Description || '',
          amount: line.Amount || 0,
          account: line.AccountBasedExpenseLineDetail?.AccountRef?.name || 
                   line.ItemBasedExpenseLineDetail?.ItemRef?.name || '',
        })),
      });
    });

    // ========== FETCH DEPOSITS ==========
    const depositQuery = `SELECT * FROM Deposit WHERE TxnDate >= '${queryStartDate}' AND TxnDate <= '${queryEndDate}' ORDERBY TxnDate DESC MAXRESULTS 1000`;
    
    const deposits = await qboQuery('Deposit', depositQuery);
    console.log(`Found ${deposits.length} deposits`);

    deposits.forEach(d => {
      transactions.push({
        id: `qbo-deposit-${d.Id}`,
        qboId: d.Id,
        qboType: 'Deposit',
        date: d.TxnDate,
        type: 'income',
        amount: Math.abs(d.TotalAmt || 0),
        description: d.PrivateNote || 'Deposit',
        account: d.DepositToAccountRef?.name || 'Unknown Account',
        accountId: d.DepositToAccountRef?.value,
        vendor: '',
        category: 'Deposit',
        memo: d.PrivateNote || '',
        lineItems: (d.Line || []).map(line => ({
          description: line.Description || '',
          amount: line.Amount || 0,
          account: line.DepositLineDetail?.AccountRef?.name || '',
        })),
      });
    });

    // ========== FETCH TRANSFERS ==========
    const transferQuery = `SELECT * FROM Transfer WHERE TxnDate >= '${queryStartDate}' AND TxnDate <= '${queryEndDate}' ORDERBY TxnDate DESC MAXRESULTS 500`;
    
    const transfers = await qboQuery('Transfer', transferQuery);
    console.log(`Found ${transfers.length} transfers`);

    transfers.forEach(t => {
      transactions.push({
        id: `qbo-transfer-${t.Id}`,
        qboId: t.Id,
        qboType: 'Transfer',
        date: t.TxnDate,
        type: 'transfer',
        amount: t.Amount || 0,
        description: `Transfer: ${t.FromAccountRef?.name || 'Account'} → ${t.ToAccountRef?.name || 'Account'}`,
        account: t.FromAccountRef?.name || 'Unknown',
        accountId: t.FromAccountRef?.value,
        toAccount: t.ToAccountRef?.name,
        toAccountId: t.ToAccountRef?.value,
        category: 'Transfer',
        memo: t.PrivateNote || '',
      });
    });

    // ========== FETCH SALES RECEIPTS (Direct Sales Revenue) ==========
    const salesReceiptQuery = `SELECT * FROM SalesReceipt WHERE TxnDate >= '${queryStartDate}' AND TxnDate <= '${queryEndDate}' ORDERBY TxnDate DESC MAXRESULTS 1000`;
    
    const salesReceipts = await qboQuery('SalesReceipt', salesReceiptQuery);
    console.log(`Found ${salesReceipts.length} sales receipts`);

    salesReceipts.forEach(sr => {
      transactions.push({
        id: `qbo-salesreceipt-${sr.Id}`,
        qboId: sr.Id,
        qboType: 'SalesReceipt',
        date: sr.TxnDate,
        type: 'income',
        amount: Math.abs(sr.TotalAmt || 0),
        description: sr.DocNumber ? `Sales Receipt #${sr.DocNumber}` : `Sale to ${sr.CustomerRef?.name || 'Customer'}`,
        account: sr.DepositToAccountRef?.name || 'Undeposited Funds',
        accountId: sr.DepositToAccountRef?.value,
        vendor: sr.CustomerRef?.name || '',
        vendorId: sr.CustomerRef?.value,
        category: 'Sales Revenue',
        paymentMethod: sr.PaymentMethodRef?.name || sr.PaymentType || '',
        memo: sr.PrivateNote || '',
        balance: sr.Balance || 0,
        lineItems: (sr.Line || []).filter(l => l.DetailType === 'SalesItemLineDetail').map(line => ({
          description: line.Description || '',
          amount: line.Amount || 0,
          account: line.SalesItemLineDetail?.ItemRef?.name || '',
          quantity: line.SalesItemLineDetail?.Qty || 0,
          unitPrice: line.SalesItemLineDetail?.UnitPrice || 0,
        })),
      });
    });

    // ========== FETCH INVOICES (Revenue Recognition) ==========
    const invoiceQuery = `SELECT * FROM Invoice WHERE TxnDate >= '${queryStartDate}' AND TxnDate <= '${queryEndDate}' ORDERBY TxnDate DESC MAXRESULTS 1000`;
    
    const invoices = await qboQuery('Invoice', invoiceQuery);
    console.log(`Found ${invoices.length} invoices`);

    invoices.forEach(inv => {
      transactions.push({
        id: `qbo-invoice-${inv.Id}`,
        qboId: inv.Id,
        qboType: 'Invoice',
        date: inv.TxnDate,
        dueDate: inv.DueDate,
        type: 'income',
        amount: Math.abs(inv.TotalAmt || 0),
        description: inv.DocNumber ? `Invoice #${inv.DocNumber}` : `Invoice to ${inv.CustomerRef?.name || 'Customer'}`,
        account: 'Accounts Receivable',
        vendor: inv.CustomerRef?.name || '',
        vendorId: inv.CustomerRef?.value,
        category: 'Sales Revenue',
        memo: inv.PrivateNote || '',
        balance: inv.Balance || 0,
        isPaid: (inv.Balance || 0) === 0,
        lineItems: (inv.Line || []).filter(l => l.DetailType === 'SalesItemLineDetail').map(line => ({
          description: line.Description || '',
          amount: line.Amount || 0,
          account: line.SalesItemLineDetail?.ItemRef?.name || '',
          quantity: line.SalesItemLineDetail?.Qty || 0,
          unitPrice: line.SalesItemLineDetail?.UnitPrice || 0,
        })),
      });
    });

    // ========== FETCH PAYMENTS (Cash Received on Invoices) ==========
    const paymentQuery = `SELECT * FROM Payment WHERE TxnDate >= '${queryStartDate}' AND TxnDate <= '${queryEndDate}' ORDERBY TxnDate DESC MAXRESULTS 1000`;
    
    const payments = await qboQuery('Payment', paymentQuery);
    console.log(`Found ${payments.length} payments`);

    payments.forEach(pmt => {
      transactions.push({
        id: `qbo-payment-${pmt.Id}`,
        qboId: pmt.Id,
        qboType: 'Payment',
        date: pmt.TxnDate,
        type: 'income',
        amount: Math.abs(pmt.TotalAmt || 0),
        description: `Payment from ${pmt.CustomerRef?.name || 'Customer'}${pmt.PaymentRefNum ? ` (Ref: ${pmt.PaymentRefNum})` : ''}`,
        account: pmt.DepositToAccountRef?.name || 'Undeposited Funds',
        accountId: pmt.DepositToAccountRef?.value,
        vendor: pmt.CustomerRef?.name || '',
        vendorId: pmt.CustomerRef?.value,
        category: 'Customer Payment',
        paymentMethod: pmt.PaymentMethodRef?.name || '',
        memo: pmt.PrivateNote || '',
      });
    });

    // ========== FETCH REFUND RECEIPTS ==========
    const refundQuery = `SELECT * FROM RefundReceipt WHERE TxnDate >= '${queryStartDate}' AND TxnDate <= '${queryEndDate}' ORDERBY TxnDate DESC MAXRESULTS 500`;
    
    const refunds = await qboQuery('RefundReceipt', refundQuery);
    console.log(`Found ${refunds.length} refund receipts`);

    refunds.forEach(ref => {
      transactions.push({
        id: `qbo-refund-${ref.Id}`,
        qboId: ref.Id,
        qboType: 'RefundReceipt',
        date: ref.TxnDate,
        type: 'expense',
        amount: -Math.abs(ref.TotalAmt || 0),
        description: `Refund to ${ref.CustomerRef?.name || 'Customer'}`,
        account: ref.DepositToAccountRef?.name || 'Undeposited Funds',
        accountId: ref.DepositToAccountRef?.value,
        vendor: ref.CustomerRef?.name || '',
        category: 'Refund',
        memo: ref.PrivateNote || '',
      });
    });

    // ========== FETCH BILLS ==========
    const billQuery = `SELECT * FROM Bill WHERE TxnDate >= '${queryStartDate}' AND TxnDate <= '${queryEndDate}' ORDERBY TxnDate DESC MAXRESULTS 500`;
    
    const bills = await qboQuery('Bill', billQuery);
    console.log(`Found ${bills.length} bills`);

    bills.forEach(b => {
      transactions.push({
        id: `qbo-bill-${b.Id}`,
        qboId: b.Id,
        qboType: 'Bill',
        date: b.TxnDate,
        dueDate: b.DueDate,
        type: 'bill',
        amount: -Math.abs(b.TotalAmt || 0),
        description: b.DocNumber ? `Bill #${b.DocNumber}` : `Bill from ${b.VendorRef?.name || 'Vendor'}`,
        account: 'Accounts Payable',
        vendor: b.VendorRef?.name || '',
        vendorId: b.VendorRef?.value,
        category: b.Line?.[0]?.AccountBasedExpenseLineDetail?.AccountRef?.name || 'Bill',
        memo: b.PrivateNote || '',
        balance: b.Balance || 0,
        isPaid: (b.Balance || 0) === 0,
      });
    });

    // Sort all transactions by date (newest first)
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    // ========== FETCH ACCOUNT BALANCES ==========
    // This gets the ACTUAL current balances from QBO
    const accountQuery = `SELECT * FROM Account WHERE AccountType IN ('Bank', 'Credit Card', 'Other Current Asset') MAXRESULTS 100`;
    
    let accounts = [];
    try {
      accounts = await qboQuery('Account', accountQuery);
      console.log(`Found ${accounts.length} accounts`);
    } catch (e) {
      console.warn('Could not fetch accounts:', e);
    }

    // Transform accounts to useful format
    const accountBalances = accounts.map(a => ({
      id: a.Id,
      name: a.Name,
      fullName: a.FullyQualifiedName,
      type: a.AccountType,
      subType: a.AccountSubType,
      currentBalance: a.CurrentBalance || 0,
      displayBalance: a.AccountType === 'Credit Card' 
        ? Math.abs(a.CurrentBalance || 0) 
        : (a.CurrentBalance || 0),
      isActive: a.Active,
      currency: a.CurrencyRef?.value || 'USD',
    }));

    // Separate by type for easier use
    const bankAccounts = accountBalances.filter(a => a.type === 'Bank');
    const creditCards = accountBalances.filter(a => a.type === 'Credit Card');
    const otherAssets = accountBalances.filter(a => a.type === 'Other Current Asset');

    // Calculate totals from ACTUAL balances
    const totalCashAvailable = bankAccounts.reduce((sum, a) => sum + a.currentBalance, 0);
    const totalCreditCardDebt = creditCards.reduce((sum, a) => sum + Math.abs(a.currentBalance), 0);
    const netPosition = totalCashAvailable - totalCreditCardDebt;

    // ========== FETCH FULL CHART OF ACCOUNTS ==========
    const chartOfAccountsQuery = `SELECT * FROM Account MAXRESULTS 500`;
    let chartOfAccounts = [];
    try {
      chartOfAccounts = await qboQuery('Account', chartOfAccountsQuery);
      console.log(`Found ${chartOfAccounts.length} accounts in chart of accounts`);
    } catch (e) {
      console.warn('Could not fetch chart of accounts:', e);
    }

    // Transform to useful format with hierarchy
    const formattedChartOfAccounts = chartOfAccounts.map(a => ({
      id: a.Id,
      name: a.Name,
      fullName: a.FullyQualifiedName,
      type: a.AccountType,
      subType: a.AccountSubType,
      classification: a.Classification, // Asset, Liability, Equity, Revenue, Expense
      currentBalance: a.CurrentBalance || 0,
      isActive: a.Active,
      parentId: a.ParentRef?.value || null,
      description: a.Description || '',
    }));

    // ========== FETCH VENDORS ==========
    const vendorQuery = `SELECT * FROM Vendor WHERE Active = true MAXRESULTS 500`;
    let vendors = [];
    try {
      vendors = await qboQuery('Vendor', vendorQuery);
      console.log(`Found ${vendors.length} vendors`);
    } catch (e) {
      console.warn('Could not fetch vendors:', e);
    }

    // Calculate spending per vendor from transactions
    const vendorSpending = {};
    transactions.forEach(t => {
      if (t.vendor && (t.type === 'expense' || t.type === 'bill')) {
        if (!vendorSpending[t.vendor]) {
          vendorSpending[t.vendor] = { 
            name: t.vendor, 
            totalSpent: 0, 
            transactionCount: 0,
            lastTransaction: null,
            categories: {}
          };
        }
        vendorSpending[t.vendor].totalSpent += Math.abs(t.amount);
        vendorSpending[t.vendor].transactionCount += 1;
        if (!vendorSpending[t.vendor].lastTransaction || t.date > vendorSpending[t.vendor].lastTransaction) {
          vendorSpending[t.vendor].lastTransaction = t.date;
        }
        // Track spending by category for each vendor
        const cat = t.category || 'Uncategorized';
        vendorSpending[t.vendor].categories[cat] = (vendorSpending[t.vendor].categories[cat] || 0) + Math.abs(t.amount);
      }
    });

    // Sort vendors by spending
    const topVendors = Object.values(vendorSpending)
      .sort((a, b) => b.totalSpent - a.totalSpent);

    // ========== FETCH PROFIT & LOSS REPORT ==========
    // Get current year P&L
    const currentYear = new Date().getFullYear();
    const ytdStart = `${currentYear}-01-01`;
    const ytdEnd = new Date().toISOString().split('T')[0];
    
    let profitAndLoss = null;
    try {
      const plUrl = `${baseUrl}/v3/company/${realmId}/reports/ProfitAndLoss?start_date=${ytdStart}&end_date=${ytdEnd}&minorversion=65`;
      console.log('Fetching P&L report...');
      
      const plResponse = await fetch(plUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });

      if (plResponse.ok) {
        const plData = await plResponse.json();
        
        // Parse the P&L report structure
        const parseReportSection = (rows, result = {}) => {
          if (!rows) return result;
          rows.forEach(row => {
            if (row.type === 'Data' && row.ColData) {
              const name = row.ColData[0]?.value;
              const value = parseFloat(row.ColData[1]?.value) || 0;
              if (name) result[name] = value;
            }
            if (row.Rows?.Row) {
              parseReportSection(row.Rows.Row, result);
            }
            if (row.Summary?.ColData) {
              const name = row.Summary.ColData[0]?.value;
              const value = parseFloat(row.Summary.ColData[1]?.value) || 0;
              if (name && name.startsWith('Total')) {
                result[name] = value;
              }
            }
          });
          return result;
        };

        const reportData = parseReportSection(plData?.Rows?.Row);
        
        profitAndLoss = {
          period: { start: ytdStart, end: ytdEnd },
          totalIncome: reportData['Total Income'] || 0,
          totalCOGS: reportData['Total Cost of Goods Sold'] || 0,
          grossProfit: reportData['Gross Profit'] || 0,
          totalExpenses: reportData['Total Expenses'] || 0,
          netOperatingIncome: reportData['Net Operating Income'] || 0,
          netIncome: reportData['Net Income'] || 0,
          details: reportData,
          raw: plData, // Include raw for detailed parsing if needed
        };
        console.log('P&L fetched:', { 
          income: profitAndLoss.totalIncome, 
          expenses: profitAndLoss.totalExpenses,
          netIncome: profitAndLoss.netIncome 
        });
      }
    } catch (e) {
      console.warn('Could not fetch P&L report:', e);
    }

    // ========== ANALYZE REVENUE BY CHANNEL (Amazon vs Shopify) ==========
    // Parse deposits to identify ACTUAL SALES income
    const revenueByChannel = {
      amazon: { total: 0, byMonth: {}, transactions: [] },
      shopify: { total: 0, byMonth: {}, transactions: [] },
      other: { total: 0, byMonth: {}, transactions: [] },
    };

    // Only look at actual deposits (income)
    transactions.filter(t => t.type === 'income' && t.qboType === 'Deposit').forEach(t => {
      const desc = (t.description + ' ' + t.memo + ' ' + (t.lineItems?.map(l => l.description).join(' ') || '')).toLowerCase();
      const month = t.date?.substring(0, 7); // YYYY-MM
      
      let channel = 'other';
      
      // Amazon detection - simple keyword match
      // Amazon payouts typically show as "Amazon" or "AMZN" in deposits
      const isAmazon = (
        desc.includes('amazon') ||
        desc.includes('amzn')
      );
      
      // Exclude things that mention Amazon but aren't sales payouts
      const isAmazonExclusion = (
        desc.includes('amazon lending') ||
        desc.includes('amazon loan') ||
        desc.includes('amazon credit') ||
        desc.includes('amazon card') ||
        desc.includes('amazon prime card') ||
        desc.includes('amzn prime') ||
        desc.includes('refund') ||
        desc.includes('reimbursement')
      );
      
      // Shopify detection
      const isShopify = (
        desc.includes('shopify') ||
        desc.includes('shop pay')
      );
      
      // Non-revenue deposits to skip entirely
      const isNotRevenue = (
        desc.includes('lending') ||
        desc.includes('loan') ||
        desc.includes('owner contribution') ||
        desc.includes('capital contribution') ||
        desc.includes('investment') ||
        desc.includes('transfer from savings') ||
        desc.includes('interest income')
      );
      
      if (isNotRevenue) {
        revenueByChannel.other.total += t.amount;
        revenueByChannel.other.byMonth[month] = (revenueByChannel.other.byMonth[month] || 0) + t.amount;
        revenueByChannel.other.transactions.push({
          date: t.date,
          amount: t.amount,
          description: t.description,
          reason: 'non-revenue',
        });
        return;
      }
      
      // Categorize by channel
      if (isAmazon && !isAmazonExclusion) {
        channel = 'amazon';
      } else if (isShopify) {
        channel = 'shopify';
      }
      
      revenueByChannel[channel].total += t.amount;
      revenueByChannel[channel].byMonth[month] = (revenueByChannel[channel].byMonth[month] || 0) + t.amount;
      revenueByChannel[channel].transactions.push({
        date: t.date,
        amount: t.amount,
        description: t.description,
      });
    });
    
    // Log channel detection results for debugging
    console.log('Channel detection results:', {
      amazon: revenueByChannel.amazon.total,
      shopify: revenueByChannel.shopify.total,
      other: revenueByChannel.other.total,
      amazonTxnCount: revenueByChannel.amazon.transactions.length,
      shopifyTxnCount: revenueByChannel.shopify.transactions.length,
      otherTxnCount: revenueByChannel.other.transactions.length,
    });

    // Calculate summary stats
    const summary = {
      totalTransactions: transactions.length,
      totalExpenses: transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0),
      totalIncome: transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
      totalTransfers: transactions.filter(t => t.type === 'transfer').length,
      totalBills: transactions.filter(t => t.type === 'bill').length,
      dateRange: { start: queryStartDate, end: queryEndDate },
      // Actual account balances from QBO
      cashAvailable: totalCashAvailable,
      creditCardDebt: totalCreditCardDebt,
      netPosition: netPosition,
      // Vendor summary
      totalVendors: topVendors.length,
      topVendor: topVendors[0]?.name || null,
      topVendorSpend: topVendors[0]?.totalSpent || 0,
    };

    console.log('QBO Sync complete:', summary);

    return res.status(200).json({
      success: true,
      transactions,
      // Account data
      accounts: accountBalances,
      bankAccounts,
      creditCards,
      // NEW: Chart of Accounts
      chartOfAccounts: formattedChartOfAccounts,
      // NEW: Vendors with spending
      vendors: topVendors,
      // NEW: P&L Report
      profitAndLoss,
      // NEW: Revenue by channel
      revenueByChannel,
      summary,
      syncedAt: new Date().toISOString(),
      realmId,
    });

  } catch (error) {
    console.error('QBO Sync Error:', error);
    
    // Handle token expiration specifically
    if (error.status === 401 || error.needsRefresh) {
      return res.status(401).json({ 
        error: 'Token expired', 
        needsRefresh: true,
        message: 'Access token has expired. Please reconnect to QuickBooks.'
      });
    }
    
    return res.status(500).json({ 
      error: error.message || 'Unknown error',
      hint: 'Check Vercel logs for details. If token expired, reconnect to QuickBooks.'
    });
  }
}
