// /api/qbo/refresh.js
// Refreshes expired QBO access token using refresh token

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Missing refreshToken' });
  }

  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ 
      error: 'QBO credentials not configured in environment variables' 
    });
  }

  try {
    const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      console.error('QBO Refresh Error:', tokens);
      
      // If refresh token is also expired, user needs to re-authenticate
      if (tokens.error === 'invalid_grant') {
        return res.status(401).json({
          error: 'Refresh token expired',
          needsReauth: true,
          message: 'Your QuickBooks session has expired. Please reconnect to QuickBooks.'
        });
      }
      
      throw new Error(tokens.error_description || tokens.error);
    }

    if (!tokens.access_token) {
      throw new Error('No access token received');
    }

    res.status(200).json({
      success: true,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token, // QBO may rotate refresh tokens
      expiresIn: tokens.expires_in || 3600,
      tokenType: tokens.token_type || 'bearer',
      refreshedAt: new Date().toISOString(),
    });

  } catch (error) {
    console.error('QBO Token Refresh Error:', error);
    res.status(500).json({ error: error.message });
  }
}
