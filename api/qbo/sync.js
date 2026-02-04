// /api/qbo/sync.js
// Fetches transactions from QuickBooks Online

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessToken, realmId, refreshToken, startDate, endDate } = req.body || {};

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
    // Parse deposits to identify ACTUAL SALES income (not transfers, loans, refunds, etc.)
    const revenueByChannel = {
      amazon: { total: 0, byMonth: {}, transactions: [] },
      shopify: { total: 0, byMonth: {}, transactions: [] },
      other: { total: 0, byMonth: {}, transactions: [] },
    };

    // Only look at actual deposits (income), not transfers
    transactions.filter(t => t.type === 'income' && t.qboType === 'Deposit').forEach(t => {
      const desc = (t.description + ' ' + t.memo + ' ' + (t.lineItems?.map(l => l.description).join(' ') || '')).toLowerCase();
      const month = t.date?.substring(0, 7); // YYYY-MM
      
      // Skip if this looks like a loan, refund, or credit card related
      const isNotRevenue = (
        desc.includes('lending') ||
        desc.includes('loan') ||
        desc.includes('credit card') ||
        desc.includes('refund') ||
        desc.includes('reimbursement') ||
        desc.includes('transfer from') ||
        desc.includes('owner') ||
        desc.includes('capital contribution') ||
        desc.includes('investment')
      );
      
      if (isNotRevenue) {
        // Still track in other, but don't count as channel revenue
        revenueByChannel.other.total += t.amount;
        revenueByChannel.other.byMonth[month] = (revenueByChannel.other.byMonth[month] || 0) + t.amount;
        return;
      }
      
      let channel = 'other';
      
      // Amazon detection - look for specific payout patterns
      const isAmazonPayout = (
        (desc.includes('amazon') && (
          desc.includes('payout') ||
          desc.includes('settlement') ||
          desc.includes('disbursement') ||
          desc.includes('mktp') ||
          desc.includes('marketplace') ||
          desc.includes('services llc') ||
          desc.includes('seller')
        )) ||
        desc.includes('amzn mktp') ||
        desc.includes('amazon services') ||
        desc.includes('amazon.com')
      );
      
      // Shopify detection - look for specific payout patterns
      const isShopifyPayout = (
        (desc.includes('shopify') && (
          desc.includes('payout') ||
          desc.includes('payment') ||
          desc.includes('inc')
        )) ||
        desc.includes('shop pay') ||
        desc.includes('shopify inc') ||
        desc.includes('shopify payout')
      );
      
      if (isAmazonPayout) {
        channel = 'amazon';
      } else if (isShopifyPayout) {
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
