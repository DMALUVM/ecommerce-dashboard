// /api/qbo/auth.js
// Initiates QuickBooks OAuth flow

export default async function handler(req, res) {
  // Set CORS headers for browser requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    
    // Debug logging (remove in production)
    console.log('QBO Auth - Client ID exists:', !!clientId);
    console.log('QBO Auth - Redirect URI exists:', !!redirectUri);
    
    if (!clientId) {
      return res.status(500).json({ 
        error: 'QBO_CLIENT_ID not configured',
        details: 'Please set the QBO_CLIENT_ID environment variable in your Vercel/deployment settings'
      });
    }
    
    if (!redirectUri) {
      return res.status(500).json({ 
        error: 'QBO_REDIRECT_URI not configured',
        details: 'Please set the QBO_REDIRECT_URI environment variable in your Vercel/deployment settings'
      });
    }

    // Scopes needed for transaction access
    const scope = 'com.intuit.quickbooks.accounting';
    
    // Generate random state for CSRF protection
    const state = Math.random().toString(36).substring(2, 15) + 
                  Math.random().toString(36).substring(2, 15);
    
    // Build Intuit OAuth URL
    const authUrl = 'https://appcenter.intuit.com/connect/oauth2?' +
      `client_id=${encodeURIComponent(clientId)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scope)}&` +
      `state=${encodeURIComponent(state)}`;

    res.status(200).json({ 
      authUrl, 
      state,
      message: 'Redirect user to authUrl to begin OAuth flow'
    });
  } catch (error) {
    console.error('QBO Auth Error:', error);
    res.status(500).json({ 
      error: 'Internal server error during QBO auth',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
