# Ecommerce Dashboard — SaaS Launch: Pillar 1 & 2

## What's Included

| File | Purpose |
|------|---------|
| `001_multi_store_schema.sql` | Database migration — run in Supabase SQL Editor |
| `OnboardingWizard.jsx` | Full onboarding flow with API key instructions per platform |
| `StoreSwitcher.jsx` | Drop-in nav component for switching between stores |

---

## Implementation Order

### Step 1: Run the Database Migration

1. Open your Supabase project → **SQL Editor**
2. Paste the entire contents of `001_multi_store_schema.sql`
3. Click **Run**
4. Verify tables were created: `stores`, `store_credentials`, `subscriptions`, `onboarding_progress`, `sync_log`

**Then migrate your existing data:**

```sql
-- Find your user_id
SELECT id FROM auth.users WHERE email = 'your@email.com';

-- Create your store
INSERT INTO stores (user_id, name, platforms, is_default)
VALUES ('<your-user-id>', 'Tallowbourn', '["amazon", "shopify"]'::jsonb, true)
RETURNING id;

-- Link existing app_data to your store
UPDATE app_data SET store_id = '<store-id>' WHERE user_id = '<your-user-id>';
```

### Step 2: Integrate the Store Switcher

In your main App.jsx nav bar, add:

```jsx
import StoreSwitcher from './StoreSwitcher';

// In your nav component:
<StoreSwitcher
  supabase={supabase}
  userId={user.id}
  currentStoreId={activeStoreId}
  onStoreChange={(storeId) => {
    setActiveStoreId(storeId);
    // Refetch all data for the new store
    loadDashboardData(storeId);
  }}
  onAddStore={() => setShowOnboarding(true)}
/>
```

### Step 3: Add the Onboarding Wizard

Show this for new users or when adding a new store:

```jsx
import OnboardingWizard from './OnboardingWizard';

// In App.jsx:
{showOnboarding && (
  <OnboardingWizard
    supabase={supabase}
    userId={user.id}
    onComplete={({ storeName, platforms, credentials }) => {
      setShowOnboarding(false);
      // Refresh stores list
      fetchStores();
    }}
  />
)}
```

**When to show onboarding:**
- First login (no stores exist for user)
- User clicks "Add Another Store" in the switcher
- User clicks setup from Settings

### Step 4: Update Data Queries

Every data query needs to filter by `store_id` now:

```jsx
// BEFORE (single-user):
const { data } = await supabase
  .from('app_data')
  .select('*')
  .eq('user_id', userId);

// AFTER (multi-store):
const { data } = await supabase
  .from('app_data')
  .select('*')
  .eq('user_id', userId)
  .eq('store_id', activeStoreId);
```

Create a helper function to avoid repeating this:

```jsx
function storeQuery(table) {
  return supabase
    .from(table)
    .select('*')
    .eq('user_id', userId)
    .eq('store_id', activeStoreId);
}
```

---

## Schema Overview

```
auth.users (Supabase Auth)
  │
  ├── subscriptions (1:1) — Stripe billing status
  │
  ├── onboarding_progress (1:many) — setup wizard state
  │
  └── stores (1:many) — each brand/business
        │
        ├── store_credentials (1:many per provider)
        │     └── provider: shopify | amazon_sp_api | quickbooks | meta_ads | google_ads | warehouse
        │
        ├── app_data (1:many) — all dashboard data, keyed by store
        │
        └── sync_log (1:many) — audit trail of data syncs
```

---

## Security Notes

**API Key Encryption:** The `credentials_encrypted` field in `store_credentials` should be encrypted before storage. For production, use Supabase Vault or encrypt in your API route:

```javascript
// In your Vercel API route (server-side only):
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY; // 32-byte hex key
const IV_LENGTH = 16;

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  const [ivHex, encryptedHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

Generate your encryption key once:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add it to Vercel: `CREDENTIAL_ENCRYPTION_KEY=<your-key>`

**BYOK Model Benefits:**
- Customers own their API keys — they can revoke anytime from the source platform
- Keys are encrypted at rest in your database
- Keys are only decrypted server-side in API routes, never sent to the browser
- RLS ensures users can only access their own credentials

---

## Next Steps (Pillars 3 & 4)

**Pillar 3 — Stripe Billing:**
- Stripe Checkout for payment
- Webhook endpoint to update `subscriptions` table
- Middleware to gate features by plan
- Free tier: 1 store, 30-day history
- Pro tier: 5 stores, full history, AI, forecasting

**Pillar 4 — Landing Page:**
- Marketing page at root route
- Demo store with synthetic data (no personal data exposed)
- Pricing table
- Signup CTA → flows into onboarding wizard
