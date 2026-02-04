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

    // Default to last 90 days if no startDate provided
    const queryStartDate = startDate || 
      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
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

    // Calculate summary stats
    const summary = {
      totalTransactions: transactions.length,
      totalExpenses: transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0),
      totalIncome: transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
      totalTransfers: transactions.filter(t => t.type === 'transfer').length,
      totalBills: transactions.filter(t => t.type === 'bill').length,
      dateRange: { start: queryStartDate, end: queryEndDate },
    };

    console.log('QBO Sync complete:', summary);

    return res.status(200).json({
      success: true,
      transactions,
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
