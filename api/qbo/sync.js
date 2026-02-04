// /api/qbo/sync.js
// Fetches transactions from QuickBooks Online

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { accessToken, realmId, refreshToken, startDate, endDate } = req.body;

  // Validate required fields
  if (!accessToken || !realmId) {
    return res.status(400).json({ 
      error: 'Missing required fields: accessToken and realmId' 
    });
  }

  // Determine API base URL based on environment
  const isProduction = process.env.QBO_ENVIRONMENT === 'production';
  const baseUrl = isProduction
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';

  // Default to last 90 days if no startDate provided
  const queryStartDate = startDate || 
    new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const queryEndDate = endDate || new Date().toISOString().split('T')[0];

  try {
    const transactions = [];
    
    // ========== FETCH PURCHASES (Expenses, Bills, Checks) ==========
    const purchaseQuery = `SELECT * FROM Purchase WHERE TxnDate >= '${queryStartDate}' AND TxnDate <= '${queryEndDate}' ORDERBY TxnDate DESC MAXRESULTS 1000`;
    
    const purchaseResponse = await fetch(
      `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(purchaseQuery)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      }
    );

    if (!purchaseResponse.ok) {
      const errorText = await purchaseResponse.text();
      
      // Check if token expired
      if (purchaseResponse.status === 401) {
        return res.status(401).json({ 
          error: 'Token expired', 
          needsRefresh: true,
          message: 'Access token has expired. Please reconnect to QuickBooks.'
        });
      }
      
      throw new Error(`QBO API error (${purchaseResponse.status}): ${errorText}`);
    }

    const purchaseData = await purchaseResponse.json();
    const purchases = purchaseData.QueryResponse?.Purchase || [];

    // Transform purchases to standard format
    purchases.forEach(p => {
      transactions.push({
        id: `qbo-purchase-${p.Id}`,
        qboId: p.Id,
        qboType: 'Purchase',
        date: p.TxnDate,
        type: 'expense',
        amount: -Math.abs(p.TotalAmt || 0), // Expenses are negative
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
    
    const depositResponse = await fetch(
      `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(depositQuery)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      }
    );

    if (depositResponse.ok) {
      const depositData = await depositResponse.json();
      const deposits = depositData.QueryResponse?.Deposit || [];

      deposits.forEach(d => {
        transactions.push({
          id: `qbo-deposit-${d.Id}`,
          qboId: d.Id,
          qboType: 'Deposit',
          date: d.TxnDate,
          type: 'income',
          amount: Math.abs(d.TotalAmt || 0), // Income is positive
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
    }

    // ========== FETCH TRANSFERS ==========
    const transferQuery = `SELECT * FROM Transfer WHERE TxnDate >= '${queryStartDate}' AND TxnDate <= '${queryEndDate}' ORDERBY TxnDate DESC MAXRESULTS 500`;
    
    const transferResponse = await fetch(
      `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(transferQuery)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      }
    );

    if (transferResponse.ok) {
      const transferData = await transferResponse.json();
      const transfers = transferData.QueryResponse?.Transfer || [];

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
    }

    // ========== FETCH BILLS (if you want to track AP) ==========
    const billQuery = `SELECT * FROM Bill WHERE TxnDate >= '${queryStartDate}' AND TxnDate <= '${queryEndDate}' ORDERBY TxnDate DESC MAXRESULTS 500`;
    
    const billResponse = await fetch(
      `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(billQuery)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      }
    );

    if (billResponse.ok) {
      const billData = await billResponse.json();
      const bills = billData.QueryResponse?.Bill || [];

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
    }

    // Sort all transactions by date (newest first)
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Calculate summary stats
    const summary = {
      totalTransactions: transactions.length,
      totalExpenses: transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0),
      totalIncome: transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
      totalTransfers: transactions.filter(t => t.type === 'transfer').length,
      dateRange: { start: queryStartDate, end: queryEndDate },
    };

    res.status(200).json({
      success: true,
      transactions,
      summary,
      syncedAt: new Date().toISOString(),
      realmId,
    });

  } catch (error) {
    console.error('QBO Sync Error:', error);
    res.status(500).json({ 
      error: error.message,
      hint: 'If token expired, user needs to reconnect to QuickBooks'
    });
  }
}
