// /api/qbo/callback.js
// Handles OAuth callback from Intuit, exchanges code for tokens

const parseCookies = (cookieHeader = '') => {
  const cookies = {};
  cookieHeader.split(';').forEach((part) => {
    const [rawName, ...rawValueParts] = part.split('=');
    if (!rawName) return;
    const name = rawName.trim();
    if (!name) return;
    const rawValue = rawValueParts.join('=').trim();
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  });
  return cookies;
};

const clearStateCookie = (res) => {
  const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `qbo_oauth_state=; Max-Age=0; Path=/api/qbo; HttpOnly; SameSite=Lax${secureFlag}`);
};

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const safeJsonForScript = (value) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // This endpoint receives GET request from Intuit OAuth redirect
  const { code, realmId, state, error, error_description } = req.query;
  const oauthCode = Array.isArray(code) ? code[0] : code;
  const qboRealmId = Array.isArray(realmId) ? realmId[0] : realmId;
  const oauthState = Array.isArray(state) ? state[0] : state;
  const oauthError = Array.isArray(error) ? error[0] : error;
  const oauthErrorDescription = Array.isArray(error_description) ? error_description[0] : error_description;
  const appOrigin = process.env.APP_ORIGIN || process.env.VITE_APP_ORIGIN || '';
  const safeAppOrigin = String(appOrigin || '').replace(/'/g, "\\'");

  // Handle OAuth errors
  if (oauthError) {
    console.error('QBO OAuth Error:', oauthError, oauthErrorDescription);
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
            <div class="message">${escapeHtml(oauthErrorDescription || oauthError || 'Unknown error occurred')}</div>
            <p style="margin-top: 2rem; color: #64748b;">You can close this window.</p>
          </div>
        </body>
      </html>
    `);
  }

  // Validate required params
  if (!oauthCode || !qboRealmId || !oauthState) {
    clearStateCookie(res);
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
            <div class="error">❌ Missing authorization response fields</div>
            <p style="color: #64748b;">Please try connecting again.</p>
          </div>
        </body>
      </html>
    `);
  }

  const cookies = parseCookies(req.headers.cookie || '');
  const expectedState = cookies.qbo_oauth_state || '';
  if (!expectedState || expectedState !== oauthState) {
    clearStateCookie(res);
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
            .container { text-align: center; padding: 2rem; max-width: 420px; }
            .error { color: #f87171; font-size: 1.25rem; margin-bottom: 1rem; }
            .message { color: #94a3b8; font-size: 0.875rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error">❌ Security validation failed</div>
            <div class="message">OAuth state did not match. Please close this window and reconnect from the dashboard.</div>
          </div>
        </body>
      </html>
    `);
  }

  clearStateCookie(res);

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
        code: oauthCode,
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

    const postMessagePayload = safeJsonForScript({
      type: 'QBO_AUTH_SUCCESS',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      realmId: String(qboRealmId),
      expiresIn: Number(tokens.expires_in || 3600),
      tokenType: String(tokens.token_type || 'bearer'),
      state: String(oauthState),
    });

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
              const targetOrigin = '${safeAppOrigin}' || window.location.origin;
              const payload = ${postMessagePayload};
              window.opener.postMessage(payload, targetOrigin);
              
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
            <div class="message">${escapeHtml(error.message)}</div>
            <p style="margin-top: 2rem; color: #64748b;">Please close this window and try again.</p>
          </div>
        </body>
      </html>
    `);
  }
}
