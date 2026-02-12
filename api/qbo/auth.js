// /api/qbo/auth.js
// Initiates QuickBooks OAuth flow
import crypto from 'crypto';
import {
  applyCors,
  handlePreflight,
  requireMethod,
  enforceRateLimit,
  enforceUserAuth,
} from '../_lib/security.js';

const buildStateCookie = (state) => {
  const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `qbo_oauth_state=${encodeURIComponent(state)}; Max-Age=600; Path=/api/qbo; HttpOnly; SameSite=Lax${secureFlag}`;
};

export default async function handler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json({ error: 'Origin not allowed' });
  if (handlePreflight(req, res)) return;
  if (!requireMethod(req, res, 'POST')) return;
  if (!enforceRateLimit(req, res, 'qbo-auth', { max: 20, windowMs: 60_000 })) return;

  const authUser = await enforceUserAuth(req, res, { required: false });
  if (!authUser && res.writableEnded) return;

  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;

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
    
    // Generate cryptographically secure state for CSRF protection
    const state = crypto.randomBytes(32).toString('base64url');
    res.setHeader('Set-Cookie', buildStateCookie(state));
    
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
