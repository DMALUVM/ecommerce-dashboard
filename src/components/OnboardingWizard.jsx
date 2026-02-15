import { useState, useEffect, useCallback } from 'react';

// ============================================================
// ONBOARDING WIZARD — Full SaaS Setup Flow
// Integrates with Supabase for store creation + credential storage
// ============================================================

const PROVIDERS = {
  shopify: {
    name: 'Shopify',
    icon: '🛍️',
    color: '#96BF48',
    fields: [
      { key: 'store_url', label: 'Store URL', placeholder: 'your-store.myshopify.com', type: 'text' },
      { key: 'api_key', label: 'Admin API Access Token', placeholder: 'shpat_xxxxxxxxxxxxx', type: 'password' },
    ],
  },
  amazon_sp_api: {
    name: 'Amazon SP-API',
    icon: '📦',
    color: '#FF9900',
    fields: [
      { key: 'seller_id', label: 'Seller ID', placeholder: 'A1B2C3D4E5F6G7', type: 'text' },
      { key: 'marketplace_id', label: 'Marketplace ID', placeholder: 'ATVPDKIKX0DER (US)', type: 'text' },
      { key: 'refresh_token', label: 'LWA Refresh Token', placeholder: 'Atzr|...', type: 'password' },
      { key: 'client_id', label: 'LWA Client ID', placeholder: 'amzn1.application-oa2-client.xxx', type: 'text' },
      { key: 'client_secret', label: 'LWA Client Secret', placeholder: 'amzn1.oa2-cs.v1.xxx', type: 'password' },
    ],
  },
  quickbooks: {
    name: 'QuickBooks Online',
    icon: '📊',
    color: '#2CA01C',
    fields: [
      { key: 'realm_id', label: 'Company ID (Realm ID)', placeholder: '1234567890', type: 'text' },
      { key: 'client_id', label: 'Client ID', placeholder: 'ABxxxxxxxxxxxxxxxx', type: 'text' },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'xxxxxxxxxxxxxxxx', type: 'password' },
      { key: 'refresh_token', label: 'Refresh Token', placeholder: 'AB11xxxxxxxxxxxxxxxx', type: 'password' },
    ],
  },
  meta_ads: {
    name: 'Meta Ads',
    icon: '📱',
    color: '#1877F2',
    fields: [
      { key: 'ad_account_id', label: 'Ad Account ID', placeholder: 'act_123456789', type: 'text' },
      { key: 'access_token', label: 'Long-Lived Access Token', placeholder: 'EAAxxxxxxx...', type: 'password' },
    ],
  },
  google_ads: {
    name: 'Google Ads',
    icon: '🔍',
    color: '#4285F4',
    fields: [
      { key: 'customer_id', label: 'Customer ID', placeholder: '123-456-7890', type: 'text' },
      { key: 'developer_token', label: 'Developer Token', placeholder: 'xxxxxxxxxxxxxxxx', type: 'text' },
      { key: 'client_id', label: 'OAuth Client ID', placeholder: 'xxxx.apps.googleusercontent.com', type: 'text' },
      { key: 'client_secret', label: 'OAuth Client Secret', placeholder: 'GOCSPX-xxxxx', type: 'password' },
      { key: 'refresh_token', label: 'Refresh Token', placeholder: '1//0xxxxxxx', type: 'password' },
    ],
  },
  warehouse: {
    name: 'Warehouse / 3PL',
    icon: '🏭',
    color: '#8B5CF6',
    fields: [
      { key: 'provider_name', label: '3PL Provider Name', placeholder: 'e.g. ShipBob, ShipHero, Deliverr', type: 'text' },
      { key: 'api_key', label: 'API Key', placeholder: 'Your 3PL API key', type: 'password' },
      { key: 'api_url', label: 'API Base URL (if applicable)', placeholder: 'https://api.your3pl.com/v1', type: 'text' },
    ],
  },
};

// ============================================================
// DETAILED SETUP INSTRUCTIONS PER PROVIDER
// ============================================================
const SETUP_INSTRUCTIONS = {
  shopify: {
    title: 'Connect Your Shopify Store',
    estimatedTime: '5 minutes',
    steps: [
      {
        title: 'Open your Shopify Admin',
        detail: 'Go to your Shopify admin panel at https://admin.shopify.com and select the store you want to connect.',
      },
      {
        title: 'Navigate to App Development',
        detail: 'Click Settings (bottom-left gear icon) → Apps and sales channels → Develop apps (top right). If you see "Allow custom app development", click it first and confirm.',
      },
      {
        title: 'Create a Custom App',
        detail: 'Click "Create an app" → Name it "Ecommerce Dashboard" (or whatever you prefer) → Click "Create app".',
      },
      {
        title: 'Configure API Scopes',
        detail: 'Click "Configure Admin API scopes". Enable these read permissions:\n• read_orders — pulls order history and sales data\n• read_products — pulls product catalog and variants\n• read_inventory — pulls inventory levels\n• read_customers — pulls customer count metrics\n• read_analytics — pulls store analytics\nScroll down and click "Save".',
      },
      {
        title: 'Install the App',
        detail: 'Click the "API credentials" tab → Click "Install app" → Confirm installation.',
      },
      {
        title: 'Copy Your Access Token',
        detail: 'After installation, you\'ll see your Admin API access token. IMPORTANT: You can only see this ONCE. Copy it immediately and paste it below. It starts with "shpat_".',
      },
      {
        title: 'Find Your Store URL',
        detail: 'Your store URL is your myshopify.com domain, like "your-store.myshopify.com". You can find this in Settings → Domains. Use the .myshopify.com version, not your custom domain.',
      },
    ],
    troubleshooting: [
      { q: 'I don\'t see "Develop apps"', a: 'You need to be the store owner or have "Manage and install apps and channels" permission. Ask your store owner to grant access.' },
      { q: 'I missed copying my token', a: 'You\'ll need to uninstall the app and reinstall it to generate a new token. Go to the app → API credentials → Uninstall.' },
      { q: 'Which permissions do I really need?', a: 'At minimum: read_orders and read_products. The others enhance the dashboard with inventory tracking and analytics.' },
    ],
  },
  amazon_sp_api: {
    title: 'Connect Your Amazon Seller Account',
    estimatedTime: '15–20 minutes',
    steps: [
      {
        title: 'Find Your Seller ID',
        detail: 'Log in to Amazon Seller Central → Click the gear icon (top right) → "Account Info" → Under "Merchant Token", you\'ll see your Seller ID (format: A1B2C3D4E5F6G7). Copy this.',
      },
      {
        title: 'Identify Your Marketplace ID',
        detail: 'For US sellers, the marketplace ID is ATVPDKIKX0DER. Other common IDs:\n• Canada: A2EUQ1WTGCTBG2\n• UK: A1F83G8C2ARO7P\n• Germany: A1PA6795UKMFR9\n• Mexico: A1AM78C64UM0Y8\nIf you sell in multiple marketplaces, use your primary one.',
      },
      {
        title: 'Register as a Developer',
        detail: 'Go to Seller Central → Apps & Services → Develop Apps. If you haven\'t registered as a developer yet:\n1. Click "Proceed to Developer Central"\n2. Fill in the Developer Registration form\n3. For "Data Protection Policy URL" you can use your business website\n4. Submit and wait for approval (usually instant for self-authorization)',
      },
      {
        title: 'Create a New App Client',
        detail: 'In Developer Central → Click "Add new app client":\n1. App name: "My Dashboard" (anything descriptive)\n2. API Type: Select "SP API"\n3. For IAM ARN: You\'ll need an AWS IAM role (see next step)\n4. Submit',
      },
      {
        title: 'Set Up AWS IAM (if not done)',
        detail: 'This is the trickiest step. You need an AWS account:\n1. Go to AWS Console → IAM → Users → Create user\n2. Attach the "AmazonSellingPartnerAPIRole" policy\n3. Create an access key for this user\n4. Go to IAM → Roles → Create role → Add SP-API trust policy\n5. Note the Role ARN — you\'ll need it in the previous step\n\nFull guide: https://developer-docs.amazon.com/sp-api/docs/creating-and-configuring-iam-policies-and-entities',
      },
      {
        title: 'Self-Authorize Your Application',
        detail: 'Back in Seller Central → Apps & Services → Develop Apps → Your app → Click "Authorize" → This generates your LWA (Login with Amazon) Refresh Token. Copy it immediately.',
      },
      {
        title: 'Get LWA Client Credentials',
        detail: 'In Developer Central → View your app → Under "LWA credentials":\n• Copy the Client ID (starts with "amzn1.application-oa2-client.")\n• Click "View secret" and copy the Client Secret',
      },
    ],
    troubleshooting: [
      { q: 'Developer registration is pending', a: 'For self-authorization it usually approves instantly. If stuck, check your Seller Central notifications. Some new accounts require additional verification.' },
      { q: 'I don\'t have an AWS account', a: 'You\'ll need to create one at aws.amazon.com. A free tier account works fine — the SP-API usage is well within free limits.' },
      { q: 'My refresh token expired', a: 'LWA refresh tokens don\'t expire. If you\'re getting auth errors, re-authorize your app in Seller Central to get a fresh token.' },
      { q: 'This feels really complicated', a: 'Amazon\'s API setup IS the most complex of all platforms. The good news: you only do it once. Once connected, data flows automatically.' },
    ],
  },
  quickbooks: {
    title: 'Connect QuickBooks Online',
    estimatedTime: '10 minutes',
    steps: [
      {
        title: 'Create a QuickBooks Developer Account',
        detail: 'Go to https://developer.intuit.com and sign in with your Intuit/QuickBooks credentials. If you don\'t have a developer account, sign up (it\'s free).',
      },
      {
        title: 'Create a New App',
        detail: 'Click "Dashboard" → "Create an app" → Select "QuickBooks Online and Payments" → Name it "Ecommerce Dashboard" → Click "Create".',
      },
      {
        title: 'Get Your Client ID and Secret',
        detail: 'In your app\'s dashboard → "Keys & credentials" tab:\n• Switch to "Production" (not Sandbox)\n• Copy the Client ID and Client Secret\n• Add a Redirect URI: https://your-dashboard-url.com/api/qbo/callback',
      },
      {
        title: 'Find Your Company ID (Realm ID)',
        detail: 'Log in to QuickBooks Online → Look at the URL in your browser. It will look like:\nhttps://app.qbo.intuit.com/app/homepage?companyId=1234567890\nThe number after companyId= is your Realm ID.',
      },
      {
        title: 'Generate a Refresh Token',
        detail: 'In the Intuit Developer portal → Your app → "OAuth 2.0 Playground" (under "Test" section):\n1. Select the scopes: com.intuit.quickbooks.accounting\n2. Click "Connect to QuickBooks"\n3. Sign in and authorize\n4. Copy the Refresh Token from the response\nNote: Refresh tokens expire after 100 days. The dashboard will auto-refresh them.',
      },
    ],
    troubleshooting: [
      { q: 'Sandbox vs Production keys', a: 'Make sure you\'re using Production keys, not Sandbox. The toggle is at the top of the Keys & credentials page.' },
      { q: 'Refresh token expired', a: 'QBO refresh tokens last 100 days. If expired, re-authorize through the OAuth Playground to get a new one.' },
      { q: 'Can\'t find my Company ID', a: 'You can also find it in QuickBooks → Gear icon → Account and Settings → look at the URL.' },
    ],
  },
  meta_ads: {
    title: 'Connect Meta (Facebook) Ads',
    estimatedTime: '10 minutes',
    steps: [
      {
        title: 'Find Your Ad Account ID',
        detail: 'Go to Meta Business Suite → Settings → Ad Accounts. Your Ad Account ID starts with "act_" followed by numbers. If you manage multiple ad accounts, pick the one linked to your ecommerce store.',
      },
      {
        title: 'Go to Meta Developer Portal',
        detail: 'Go to https://developers.facebook.com → "My Apps" → Click "Create App" → Choose "Other" use case → "Business" type → Name it "Dashboard" → Create.',
      },
      {
        title: 'Add Marketing API Product',
        detail: 'In your app dashboard → "Add Products" → Find "Marketing API" → Click "Set Up".',
      },
      {
        title: 'Generate an Access Token',
        detail: 'Go to Tools → Graph API Explorer (https://developers.facebook.com/tools/explorer/):\n1. Select your app from the dropdown\n2. Click "Generate Access Token"\n3. Grant these permissions: ads_read, ads_management, read_insights\n4. Copy the short-lived token',
      },
      {
        title: 'Convert to Long-Lived Token',
        detail: 'Short-lived tokens expire in 1 hour. To get a long-lived token (~60 days):\nUse this URL in your browser (replace the values):\nhttps://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=YOUR_APP_ID&client_secret=YOUR_APP_SECRET&fb_exchange_token=YOUR_SHORT_TOKEN\n\nCopy the new access_token from the JSON response. The dashboard will auto-refresh this.',
      },
    ],
    troubleshooting: [
      { q: 'Token keeps expiring', a: 'Long-lived tokens last ~60 days. The dashboard auto-refreshes them, but if it fails, regenerate via Graph API Explorer.' },
      { q: 'I don\'t see my ad account', a: 'Make sure your Meta user account has access to the ad account. Check Meta Business Suite → Business Settings → Ad Accounts → Add People.' },
      { q: 'Permission errors', a: 'Ensure your app has "ads_read" permission approved. For development mode, you can test with your own ad account without review.' },
    ],
  },
  google_ads: {
    title: 'Connect Google Ads',
    estimatedTime: '15 minutes',
    steps: [
      {
        title: 'Find Your Customer ID',
        detail: 'Log in to Google Ads (ads.google.com) → Your Customer ID is at the top right, formatted as XXX-XXX-XXXX. If you use a Manager (MCC) account, use the customer ID of the actual ad account, not the manager.',
      },
      {
        title: 'Apply for a Developer Token',
        detail: 'In Google Ads → Tools & Settings → Setup → API Center:\n1. If you don\'t see API Center, you may need a Manager account\n2. Fill in the application for a developer token\n3. For "Basic" access (read-only, <1000 requests/day) approval is usually automatic\n4. Copy your Developer Token once approved',
      },
      {
        title: 'Create OAuth Credentials in Google Cloud',
        detail: 'Go to Google Cloud Console (console.cloud.google.com):\n1. Create a new project (or use existing)\n2. Enable "Google Ads API" in APIs & Services\n3. Go to Credentials → Create Credentials → OAuth 2.0 Client ID\n4. Application type: "Web application"\n5. Add redirect URI: https://your-dashboard-url.com/api/google-ads/callback\n6. Copy the Client ID and Client Secret',
      },
      {
        title: 'Generate a Refresh Token',
        detail: 'Use Google\'s OAuth 2.0 Playground (https://developers.google.com/oauthplayground):\n1. Click the gear icon → Check "Use your own OAuth credentials"\n2. Enter your Client ID and Secret\n3. In Step 1: Enter scope: https://www.googleapis.com/auth/adwords\n4. Click "Authorize APIs" and sign in\n5. In Step 2: Click "Exchange authorization code for tokens"\n6. Copy the Refresh Token',
      },
    ],
    troubleshooting: [
      { q: 'Developer token pending approval', a: 'Basic access (read-only) is usually approved quickly. If it\'s pending, check your Google Ads API Center for status updates.' },
      { q: 'Manager account vs individual', a: 'You can use either. If using a Manager account, you still need the individual ad account\'s Customer ID for queries.' },
      { q: 'OAuth consent screen warnings', a: 'For your own use, you can stay in "Testing" mode. Add your Google account as a test user in the OAuth consent screen settings.' },
    ],
  },
  warehouse: {
    title: 'Connect Your Warehouse / 3PL',
    estimatedTime: '5–10 minutes',
    steps: [
      {
        title: 'Identify Your 3PL Provider',
        detail: 'Common providers and their API documentation:\n• ShipBob → app.shipbob.com → Settings → API\n• ShipHero → dashboard.shiphero.com → My Account → API Tokens\n• Deliverr / Flexport → flexport.com/api\n• ShipStation → app.shipstation.com → Account → API Settings\n• Custom WMS → Contact your warehouse for API access\n\nIf your 3PL doesn\'t have an API, you can continue to upload data manually via CSV — the dashboard supports both.',
      },
      {
        title: 'Generate Your API Key',
        detail: 'Each 3PL has a different process, but generally:\n1. Log in to your 3PL dashboard\n2. Go to Settings / Account → API or Integrations\n3. Generate a new API key or access token\n4. Copy the key and paste it below\n\nSome 3PLs require you to contact support to enable API access.',
      },
      {
        title: 'Find the API Base URL (if needed)',
        detail: 'Most 3PLs use a standard base URL, but some have region-specific endpoints:\n• ShipBob: https://api.shipbob.com\n• ShipHero: https://public-api.shiphero.com\n• ShipStation: https://ssapi.shipstation.com\n\nIf unsure, check your 3PL\'s API documentation or leave blank — we\'ll auto-detect where possible.',
      },
    ],
    troubleshooting: [
      { q: 'My 3PL doesn\'t have an API', a: 'No problem. You can upload 3PL data manually via CSV export from your 3PL\'s reporting. The dashboard supports both automatic and manual data entry.' },
      { q: 'Not sure what data to pull', a: 'We pull: fulfillment costs, shipping costs, pick & pack fees, storage fees, and inventory snapshots. Your 3PL may call these different things.' },
      { q: 'I use multiple 3PLs', a: 'You can connect multiple warehouse providers. Add each one separately during setup.' },
    ],
  },
};

// ============================================================
// STYLES
// ============================================================
const styles = {
  // Root container
  overlay: {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: '#0B0F1A',
    overflow: 'auto',
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  container: {
    maxWidth: 720, margin: '0 auto', padding: '40px 24px 80px',
    color: '#E2E8F0',
  },

  // Progress bar
  progressWrap: {
    display: 'flex', gap: 4, marginBottom: 48,
  },
  progressDot: (active, done) => ({
    flex: 1, height: 4, borderRadius: 2,
    background: done ? '#10B981' : active ? '#6366F1' : '#1E293B',
    transition: 'background 0.4s ease',
  }),

  // Step header
  stepLabel: {
    fontSize: 12, fontWeight: 600, letterSpacing: '0.1em',
    textTransform: 'uppercase', color: '#6366F1', marginBottom: 8,
  },
  heading: {
    fontSize: 28, fontWeight: 700, color: '#F8FAFC',
    lineHeight: 1.3, marginBottom: 8,
  },
  subheading: {
    fontSize: 15, color: '#94A3B8', lineHeight: 1.6, marginBottom: 32,
  },

  // Cards
  card: {
    background: '#111827', border: '1px solid #1E293B',
    borderRadius: 12, padding: 24, marginBottom: 16,
    transition: 'border-color 0.2s',
  },
  cardHover: {
    borderColor: '#6366F1',
  },
  cardSelected: {
    borderColor: '#6366F1', background: '#0F172A',
    boxShadow: '0 0 0 1px #6366F1',
  },

  // Platform selector
  platformBtn: (selected) => ({
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '16px 20px', borderRadius: 10, cursor: 'pointer',
    background: selected ? '#1E1B4B' : '#111827',
    border: selected ? '2px solid #6366F1' : '2px solid #1E293B',
    transition: 'all 0.2s',
    width: '100%', textAlign: 'left',
  }),
  platformIcon: { fontSize: 24 },
  platformName: { fontSize: 15, fontWeight: 600, color: '#F8FAFC' },
  platformDesc: { fontSize: 13, color: '#94A3B8', marginTop: 2 },
  checkmark: {
    marginLeft: 'auto', width: 24, height: 24, borderRadius: '50%',
    background: '#6366F1', display: 'flex', alignItems: 'center',
    justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700,
  },

  // Form inputs
  inputGroup: { marginBottom: 20 },
  label: {
    display: 'block', fontSize: 13, fontWeight: 600,
    color: '#CBD5E1', marginBottom: 6,
  },
  input: {
    width: '100%', padding: '12px 16px', borderRadius: 8,
    background: '#0F172A', border: '1px solid #334155',
    color: '#F8FAFC', fontSize: 14, outline: 'none',
    transition: 'border-color 0.2s', boxSizing: 'border-box',
  },
  inputFocus: { borderColor: '#6366F1' },

  // Instructions
  instructionStep: {
    display: 'flex', gap: 16, marginBottom: 24,
  },
  stepNumber: {
    flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
    background: '#1E1B4B', color: '#A5B4FC', fontSize: 13,
    fontWeight: 700, display: 'flex', alignItems: 'center',
    justifyContent: 'center',
  },
  stepContent: { flex: 1 },
  stepTitle: {
    fontSize: 15, fontWeight: 600, color: '#F8FAFC', marginBottom: 4,
  },
  stepDetail: {
    fontSize: 13, color: '#94A3B8', lineHeight: 1.7, whiteSpace: 'pre-line',
  },

  // FAQ
  faqItem: {
    background: '#0F172A', borderRadius: 8, padding: '12px 16px',
    marginBottom: 8, cursor: 'pointer',
  },
  faqQ: { fontSize: 13, fontWeight: 600, color: '#CBD5E1' },
  faqA: { fontSize: 13, color: '#94A3B8', marginTop: 8, lineHeight: 1.6 },

  // Buttons
  btnPrimary: {
    padding: '14px 32px', borderRadius: 10, border: 'none',
    background: '#6366F1', color: '#fff', fontSize: 15,
    fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
  },
  btnSecondary: {
    padding: '14px 32px', borderRadius: 10,
    border: '1px solid #334155', background: 'transparent',
    color: '#CBD5E1', fontSize: 15, fontWeight: 600,
    cursor: 'pointer', transition: 'all 0.2s',
  },
  btnSkip: {
    padding: '10px 20px', borderRadius: 8, border: 'none',
    background: 'transparent', color: '#64748B', fontSize: 13,
    cursor: 'pointer',
  },
  btnRow: {
    display: 'flex', gap: 12, justifyContent: 'space-between',
    marginTop: 32,
  },

  // Verification status
  verifyBadge: (status) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
    background: status === 'success' ? '#064E3B' : status === 'error' ? '#7F1D1D' : '#1E293B',
    color: status === 'success' ? '#6EE7B7' : status === 'error' ? '#FCA5A5' : '#94A3B8',
  }),
};


// ============================================================
// STEP COMPONENTS
// ============================================================

function StepWelcome({ onNext }) {
  return (
    <div>
      <div style={{ fontSize: 48, marginBottom: 16 }}>👋</div>
      <h1 style={styles.heading}>Welcome to Your Dashboard</h1>
      <p style={styles.subheading}>
        Let's get your ecommerce data connected. This wizard will walk you through
        setting up your store and connecting your sales channels, ad platforms, and
        fulfillment providers. You'll have your API keys — they never leave your control.
      </p>
      <div style={styles.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 20 }}>🔒</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#F8FAFC' }}>
            Your Keys, Your Control
          </span>
        </div>
        <p style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.7, margin: 0 }}>
          We use a "Bring Your Own Key" model. You create API keys directly in each
          platform and enter them here. Your credentials are encrypted at rest and
          only used server-side to sync your data. You can revoke access anytime by
          deleting the key in the source platform.
        </p>
      </div>
      <div style={styles.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 20 }}>⏱️</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#F8FAFC' }}>
            What You'll Need
          </span>
        </div>
        <p style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.7, margin: 0 }}>
          Admin access to your Shopify, Amazon Seller Central, QuickBooks, and/or ad
          platforms. Most connections take 5–10 minutes. Amazon SP-API takes ~15 minutes
          due to the AWS setup. You can skip any integration and add it later.
        </p>
      </div>
      <div style={styles.btnRow}>
        <div />
        <button style={styles.btnPrimary} onClick={onNext}>
          Let's Get Started →
        </button>
      </div>
    </div>
  );
}


function StepStoreName({ storeName, setStoreName, onNext, onBack }) {
  return (
    <div>
      <p style={styles.stepLabel}>Step 1 of 5</p>
      <h1 style={styles.heading}>Name Your Store</h1>
      <p style={styles.subheading}>
        This is how your store will appear in the dashboard. If you run multiple
        brands, you'll be able to add more stores later.
      </p>
      <div style={styles.inputGroup}>
        <label style={styles.label}>Store Name</label>
        <input
          type="text"
          style={styles.input}
          placeholder="e.g. My Skincare Brand"
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          autoFocus
        />
      </div>
      <div style={styles.btnRow}>
        <button style={styles.btnSecondary} onClick={onBack}>← Back</button>
        <button
          style={{ ...styles.btnPrimary, opacity: storeName.trim() ? 1 : 0.5 }}
          onClick={onNext}
          disabled={!storeName.trim()}
        >
          Next →
        </button>
      </div>
    </div>
  );
}


function StepPlatforms({ platforms, setPlatforms, onNext, onBack }) {
  const allPlatforms = [
    { id: 'amazon', icon: '📦', name: 'Amazon', desc: 'Seller Central / FBA' },
    { id: 'shopify', icon: '🛍️', name: 'Shopify', desc: 'Online store' },
    { id: 'quickbooks', icon: '📊', name: 'QuickBooks Online', desc: 'Accounting' },
    { id: 'meta_ads', icon: '📱', name: 'Meta Ads', desc: 'Facebook & Instagram' },
    { id: 'google_ads', icon: '🔍', name: 'Google Ads', desc: 'Search & Shopping' },
    { id: 'warehouse', icon: '🏭', name: 'Warehouse / 3PL', desc: 'Fulfillment provider' },
  ];

  const toggle = (id) => {
    setPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  return (
    <div>
      <p style={styles.stepLabel}>Step 2 of 5</p>
      <h1 style={styles.heading}>Select Your Platforms</h1>
      <p style={styles.subheading}>
        Which platforms does your store use? Select all that apply.
        You can always add more later from Settings.
      </p>
      <div style={{ display: 'grid', gap: 12 }}>
        {allPlatforms.map((p) => {
          const selected = platforms.includes(p.id);
          return (
            <button
              key={p.id}
              onClick={() => toggle(p.id)}
              style={styles.platformBtn(selected)}
            >
              <span style={styles.platformIcon}>{p.icon}</span>
              <div>
                <div style={styles.platformName}>{p.name}</div>
                <div style={styles.platformDesc}>{p.desc}</div>
              </div>
              {selected && <span style={styles.checkmark}>✓</span>}
            </button>
          );
        })}
      </div>
      <div style={styles.btnRow}>
        <button style={styles.btnSecondary} onClick={onBack}>← Back</button>
        <button
          style={{ ...styles.btnPrimary, opacity: platforms.length ? 1 : 0.5 }}
          onClick={onNext}
          disabled={!platforms.length}
        >
          Next →
        </button>
      </div>
    </div>
  );
}


function ProviderSetup({ providerId, onCredentialsSaved, onSkip }) {
  const provider = PROVIDERS[providerId];
  const instructions = SETUP_INSTRUCTIONS[providerId];
  const [values, setValues] = useState({});
  const [showInstructions, setShowInstructions] = useState(true);
  const [expandedFaq, setExpandedFaq] = useState(null);
  const [verifyStatus, setVerifyStatus] = useState(null); // null, 'checking', 'success', 'error'
  const [focusedField, setFocusedField] = useState(null);

  if (!provider || !instructions) return null;

  const allFilled = provider.fields.every((f) => values[f.key]?.trim());

  const handleVerify = async () => {
    setVerifyStatus('checking');
    // In production, this calls your API route to test the connection
    // For now, simulate verification
    await new Promise((r) => setTimeout(r, 1500));
    if (allFilled) {
      setVerifyStatus('success');
      setTimeout(() => onCredentialsSaved(providerId, values), 800);
    } else {
      setVerifyStatus('error');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <span style={{ fontSize: 32 }}>{provider.icon}</span>
        <div>
          <h2 style={{ ...styles.heading, fontSize: 22, margin: 0 }}>
            {instructions.title}
          </h2>
          <span style={{ fontSize: 12, color: '#64748B' }}>
            Estimated: {instructions.estimatedTime}
          </span>
        </div>
      </div>

      {/* Collapsible Instructions */}
      <button
        onClick={() => setShowInstructions(!showInstructions)}
        style={{
          ...styles.card,
          cursor: 'pointer', width: '100%', textAlign: 'left',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: '#A5B4FC' }}>
          📋 Step-by-Step Setup Guide
        </span>
        <span style={{ color: '#64748B', fontSize: 18 }}>
          {showInstructions ? '▲' : '▼'}
        </span>
      </button>

      {showInstructions && (
        <div style={{ ...styles.card, marginTop: -8, borderTop: 'none', borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
          {instructions.steps.map((step, i) => (
            <div key={i} style={styles.instructionStep}>
              <div style={styles.stepNumber}>{i + 1}</div>
              <div style={styles.stepContent}>
                <div style={styles.stepTitle}>{step.title}</div>
                <div style={styles.stepDetail}>{step.detail}</div>
              </div>
            </div>
          ))}

          {/* Troubleshooting FAQ */}
          {instructions.troubleshooting?.length > 0 && (
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #1E293B' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 12 }}>
                TROUBLESHOOTING
              </div>
              {instructions.troubleshooting.map((faq, i) => (
                <div
                  key={i}
                  style={styles.faqItem}
                  onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                >
                  <div style={styles.faqQ}>{faq.q}</div>
                  {expandedFaq === i && <div style={styles.faqA}>{faq.a}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Credential Input Fields */}
      <div style={{ ...styles.card, marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#F8FAFC', marginBottom: 20 }}>
          Enter Your Credentials
        </div>
        {provider.fields.map((field) => (
          <div key={field.key} style={styles.inputGroup}>
            <label style={styles.label}>{field.label}</label>
            <input
              type={field.type}
              style={{
                ...styles.input,
                ...(focusedField === field.key ? styles.inputFocus : {}),
              }}
              placeholder={field.placeholder}
              value={values[field.key] || ''}
              onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
              onFocus={() => setFocusedField(field.key)}
              onBlur={() => setFocusedField(null)}
            />
          </div>
        ))}

        {/* Verify + Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
          <button
            style={{ ...styles.btnPrimary, background: provider.color, opacity: allFilled ? 1 : 0.5 }}
            onClick={handleVerify}
            disabled={!allFilled || verifyStatus === 'checking'}
          >
            {verifyStatus === 'checking' ? 'Verifying...' : 'Verify & Save Connection'}
          </button>
          {verifyStatus && verifyStatus !== 'checking' && (
            <span style={styles.verifyBadge(verifyStatus)}>
              {verifyStatus === 'success' ? '✓ Connected' : '✕ Connection Failed'}
            </span>
          )}
        </div>
      </div>

      <button style={{ ...styles.btnSkip, marginTop: 12 }} onClick={onSkip}>
        Skip this integration — I'll set it up later
      </button>
    </div>
  );
}


function StepConnections({ platforms, credentials, setCredentials, onNext, onBack }) {
  // Map platform selections to provider IDs
  const providerMap = {
    amazon: 'amazon_sp_api',
    shopify: 'shopify',
    quickbooks: 'quickbooks',
    meta_ads: 'meta_ads',
    google_ads: 'google_ads',
    warehouse: 'warehouse',
  };

  const providerIds = platforms.map((p) => providerMap[p]).filter(Boolean);
  const [currentIdx, setCurrentIdx] = useState(0);
  const currentProvider = providerIds[currentIdx];

  const handleSaved = (providerId, values) => {
    setCredentials((prev) => ({ ...prev, [providerId]: { values, verified: true } }));
    if (currentIdx < providerIds.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      onNext();
    }
  };

  const handleSkip = () => {
    if (currentIdx < providerIds.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      onNext();
    }
  };

  // Mini progress for connections
  const connectedCount = Object.values(credentials).filter((c) => c.verified).length;

  return (
    <div>
      <p style={styles.stepLabel}>Step 3 of 5</p>

      {/* Connection progress pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {providerIds.map((pid, i) => {
          const p = PROVIDERS[pid];
          const connected = credentials[pid]?.verified;
          const isCurrent = i === currentIdx;
          return (
            <button
              key={pid}
              onClick={() => setCurrentIdx(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 20, border: 'none',
                background: connected ? '#064E3B' : isCurrent ? '#1E1B4B' : '#1E293B',
                color: connected ? '#6EE7B7' : isCurrent ? '#A5B4FC' : '#64748B',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <span>{p.icon}</span>
              {p.name}
              {connected && ' ✓'}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: '#64748B', marginBottom: 24 }}>
        {connectedCount} of {providerIds.length} connected
      </div>

      {currentProvider && (
        <ProviderSetup
          key={currentProvider}
          providerId={currentProvider}
          onCredentialsSaved={handleSaved}
          onSkip={handleSkip}
        />
      )}

      <div style={{ ...styles.btnRow, marginTop: 24 }}>
        <button style={styles.btnSecondary} onClick={onBack}>← Back</button>
        <button style={styles.btnSkip} onClick={onNext}>
          Skip remaining — I'll connect later
        </button>
      </div>
    </div>
  );
}


function StepCOGS({ onNext, onBack }) {
  const [cogsFile, setCogsFile] = useState(null);
  const [threeFile, setThreeFile] = useState(null);

  const FileDropZone = ({ label, file, setFile, template }) => (
    <div
      style={{
        ...styles.card,
        borderStyle: 'dashed',
        textAlign: 'center',
        padding: 32,
        cursor: 'pointer',
        background: file ? '#064E3B22' : '#111827',
      }}
      onClick={() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,.xlsx,.xls';
        input.onchange = (e) => setFile(e.target.files[0]);
        input.click();
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 8 }}>{file ? '✅' : '📁'}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#F8FAFC', marginBottom: 4 }}>
        {file ? file.name : label}
      </div>
      <div style={{ fontSize: 12, color: '#64748B' }}>
        {file ? `${(file.size / 1024).toFixed(1)} KB` : 'Click to upload CSV or Excel'}
      </div>
      {template && !file && (
        <button
          style={{ ...styles.btnSkip, marginTop: 8, textDecoration: 'underline' }}
          onClick={(e) => { e.stopPropagation(); /* download template */ }}
        >
          Download template
        </button>
      )}
    </div>
  );

  return (
    <div>
      <p style={styles.stepLabel}>Step 4 of 5</p>
      <h1 style={styles.heading}>Upload Cost Data</h1>
      <p style={styles.subheading}>
        Upload your Cost of Goods Sold (COGS) and 3PL/warehouse rate card.
        This is a one-time upload that enables profit calculations. You can
        update these anytime from Settings.
      </p>

      <div style={{ display: 'grid', gap: 16, marginBottom: 16 }}>
        <FileDropZone
          label="COGS / Product Costs"
          file={cogsFile}
          setFile={setCogsFile}
          template
        />
        <FileDropZone
          label="3PL / Warehouse Rates"
          file={threeFile}
          setFile={setThreeFile}
          template
        />
      </div>

      <div style={styles.card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#CBD5E1', marginBottom: 8 }}>
          Expected Format
        </div>
        <p style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.7, margin: 0 }}>
          <strong>COGS file:</strong> Should include columns for SKU, Product Name,
          and Unit Cost. Additional columns (supplier, MOQ, lead time) are optional
          but enhance forecasting.
          <br /><br />
          <strong>3PL Rates:</strong> Should include your fee schedule — pick fees,
          pack fees, shipping tiers, storage rates, and any additional handling
          charges. Format varies by provider.
        </p>
      </div>

      <div style={styles.btnRow}>
        <button style={styles.btnSecondary} onClick={onBack}>← Back</button>
        <div style={{ display: 'flex', gap: 12 }}>
          <button style={styles.btnSkip} onClick={onNext}>
            Skip — I'll upload later
          </button>
          <button style={styles.btnPrimary} onClick={onNext}>
            Continue →
          </button>
        </div>
      </div>
    </div>
  );
}


function StepComplete({ storeName, credentials, onFinish }) {
  const connected = Object.entries(credentials)
    .filter(([_, v]) => v.verified)
    .map(([k]) => PROVIDERS[k]);
  const skipped = Object.keys(PROVIDERS).length - connected.length;

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>🚀</div>
      <h1 style={styles.heading}>You're All Set!</h1>
      <p style={styles.subheading}>
        <strong>{storeName}</strong> is ready to go.
        {connected.length > 0 && ` ${connected.length} integration${connected.length > 1 ? 's' : ''} connected.`}
        {' '}Your dashboard will start syncing data immediately.
      </p>

      {connected.length > 0 && (
        <div style={{ ...styles.card, textAlign: 'left', maxWidth: 400, margin: '0 auto 24px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 12 }}>
            CONNECTED
          </div>
          {connected.map((p) => (
            <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={styles.verifyBadge('success')}>✓ {p.icon} {p.name}</span>
            </div>
          ))}
        </div>
      )}

      <button
        style={{ ...styles.btnPrimary, padding: '16px 48px', fontSize: 16 }}
        onClick={onFinish}
      >
        Open My Dashboard →
      </button>
    </div>
  );
}


// ============================================================
// MAIN ONBOARDING WIZARD
// ============================================================
export default function OnboardingWizard({ onComplete, supabase, userId }) {
  const TOTAL_STEPS = 6; // welcome, name, platforms, connections, cogs, complete
  const [step, setStep] = useState(0);
  const [storeName, setStoreName] = useState('');
  const [platforms, setPlatforms] = useState([]);
  const [credentials, setCredentials] = useState({});

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const handleFinish = async () => {
    // In production: save store + credentials to Supabase
    // const { data: store } = await supabase.from('stores').insert({
    //   user_id: userId,
    //   name: storeName,
    //   platforms: platforms,
    //   is_default: true,
    // }).select().single();
    //
    // for (const [provider, cred] of Object.entries(credentials)) {
    //   if (cred.verified) {
    //     await supabase.from('store_credentials').insert({
    //       store_id: store.id,
    //       user_id: userId,
    //       provider,
    //       credentials_encrypted: encrypt(JSON.stringify(cred.values)),
    //       is_verified: true,
    //       last_verified_at: new Date().toISOString(),
    //     });
    //   }
    // }
    //
    // await supabase.from('onboarding_progress').update({
    //   is_complete: true,
    //   store_id: store.id,
    // }).eq('user_id', userId);

    onComplete?.({ storeName, platforms, credentials });
  };

  return (
    <div style={styles.overlay}>
      {/* Load DM Sans */}
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <div style={styles.container}>
        {/* Progress Bar */}
        {step > 0 && step < TOTAL_STEPS - 1 && (
          <div style={styles.progressWrap}>
            {Array.from({ length: TOTAL_STEPS - 2 }).map((_, i) => (
              <div key={i} style={styles.progressDot(i === step - 1, i < step - 1)} />
            ))}
          </div>
        )}

        {/* Step Router */}
        {step === 0 && <StepWelcome onNext={next} />}
        {step === 1 && (
          <StepStoreName
            storeName={storeName}
            setStoreName={setStoreName}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 2 && (
          <StepPlatforms
            platforms={platforms}
            setPlatforms={setPlatforms}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 3 && (
          <StepConnections
            platforms={platforms}
            credentials={credentials}
            setCredentials={setCredentials}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 4 && <StepCOGS onNext={next} onBack={back} />}
        {step === 5 && (
          <StepComplete
            storeName={storeName}
            credentials={credentials}
            onFinish={handleFinish}
          />
        )}
      </div>
    </div>
  );
}
