// /api/qbo/auth.js
// Initiates QuickBooks OAuth flow

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    
    if (!clientId || !redirectUri) {
      return res.status(500).json({ 
        error: 'QBO_CLIENT_ID or QBO_REDIRECT_URI not configured in environment variables' 
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
    res.status(500).json({ error: error.message });
  }
}
