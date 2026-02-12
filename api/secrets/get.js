import {
  applyCors,
  handlePreflight,
  requireMethod,
  enforceRateLimit,
  enforceUserAuth,
  getUserSecrets,
} from '../_lib/security.js';

const ALLOWED_PROVIDERS = new Set(['shopify', 'packiyo', 'amazon', 'qbo']);

export default async function handler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json({ error: 'Origin not allowed' });
  if (handlePreflight(req, res)) return;
  if (!requireMethod(req, res, 'POST')) return;
  if (!enforceRateLimit(req, res, 'secrets-get', { max: 60, windowMs: 60_000 })) return;

  const user = await enforceUserAuth(req, res, { required: true });
  if (!user) return;

  try {
    const requested = Array.isArray(req.body?.providers) ? req.body.providers : [];
    const providers = requested.filter(p => ALLOWED_PROVIDERS.has(p));
    const secrets = await getUserSecrets(user.id, providers);
    return res.status(200).json({ success: true, secrets });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load encrypted secrets' });
  }
}
