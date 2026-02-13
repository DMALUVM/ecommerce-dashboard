// /api/qbo/callback.js
// Handles OAuth callback from Intuit, exchanges code for tokens

export default async function handler(req, res) {
  // This endpoint receives GET request from Intuit OAuth redirect
  const { code, realmId, state, error, error_description } = req.query;

  // Handle OAuth errors
  if (error) {
    console.error('QBO OAuth Error:', error, error_description);
    res.setHeader('Content-Type', 'text/html');
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QuickBooks Connection Failed</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                   background: #0f172a; color: #f1f5f9; display: flex; align-items: center; 
                   justify-content: center; min-height: 100vh; margin: 0; }
            .container { text-align: center; padding: 2rem; }
            .error { color: #f87171; font-size: 1.25rem; margin-bottom: 1rem; }
            .message { color: #94a3b8; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error">❌ Connection Failed</div>
            <div class="message">${error_description || error || 'Unknown error occurred'}</div>
            <p style="margin-top: 2rem; color: #64748b;">You can close this window.</p>
          </div>
        </body>
      </html>
    `);
  }

  // Validate required params
  if (!code || !realmId) {
    res.setHeader('Content-Type', 'text/html');
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QuickBooks Connection Failed</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                   background: #0f172a; color: #f1f5f9; display: flex; align-items: center; 
                   justify-content: center; min-height: 100vh; margin: 0; }
            .container { text-align: center; padding: 2rem; }
            .error { color: #f87171; font-size: 1.25rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error">❌ Missing authorization code or company ID</div>
            <p style="color: #64748b;">Please try connecting again.</p>
          </div>
        </body>
      </html>
    `);
  }

  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  const redirectUri = process.env.QBO_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return res.status(500).json({ 
      error: 'QBO environment variables not configured' 
    });
  }

  try {
    // Exchange authorization code for access & refresh tokens
    const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    const tokens = await tokenResponse.json();

    // Check for token errors
    if (tokens.error) {
      console.error('QBO Token Error:', tokens);
      throw new Error(tokens.error_description || tokens.error);
    }

    if (!tokens.access_token) {
      throw new Error('No access token received from QuickBooks');
    }

    // Success! Return HTML that posts message to parent window and closes
    res.setHeader('Content-Type', 'text/html');
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QuickBooks Connected!</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                   background: #0f172a; color: #f1f5f9; display: flex; align-items: center; 
                   justify-content: center; min-height: 100vh; margin: 0; }
            .container { text-align: center; padding: 2rem; }
            .success { color: #4ade80; font-size: 1.5rem; margin-bottom: 1rem; }
            .spinner { width: 40px; height: 40px; border: 3px solid #334155; 
                       border-top-color: #4ade80; border-radius: 50%; 
                       animation: spin 1s linear infinite; margin: 1rem auto; }
            @keyframes spin { to { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success">✅ Connected to QuickBooks!</div>
            <div class="spinner"></div>
            <p style="color: #94a3b8;">Completing setup...</p>
          </div>
          <script>
            // Send credentials back to parent window
            if (window.opener) {
              window.opener.postMessage({
                type: 'QBO_AUTH_SUCCESS',
                accessToken: '${tokens.access_token}',
                refreshToken: '${tokens.refresh_token}',
                realmId: '${realmId}',
                expiresIn: ${tokens.expires_in || 3600},
                tokenType: '${tokens.token_type || 'bearer'}'
              }, window.location.origin);
              
              // Close this window after a brief delay
              setTimeout(() => window.close(), 1500);
            } else {
              // If no opener (direct navigation), show manual instructions
              document.body.innerHTML = \`
                <div class="container">
                  <div class="success">✅ Connected to QuickBooks!</div>
                  <p style="color: #94a3b8;">You can close this window and return to the dashboard.</p>
                </div>
              \`;
            }
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('QBO Callback Error:', error);
    res.setHeader('Content-Type', 'text/html');
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QuickBooks Connection Failed</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                   background: #0f172a; color: #f1f5f9; display: flex; align-items: center; 
                   justify-content: center; min-height: 100vh; margin: 0; }
            .container { text-align: center; padding: 2rem; max-width: 400px; }
            .error { color: #f87171; font-size: 1.25rem; margin-bottom: 1rem; }
            .message { color: #94a3b8; font-size: 0.875rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error">❌ Connection Failed</div>
            <div class="message">${error.message}</div>
            <p style="margin-top: 2rem; color: #64748b;">Please close this window and try again.</p>
          </div>
        </body>
      </html>
    `);
  }
}
