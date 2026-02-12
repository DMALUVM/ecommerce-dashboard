import {
  applyCors,
  handlePreflight,
  requireMethod,
  enforceRateLimit,
  enforceUserAuth,
  saveUserSecret,
} from '../_lib/security.js';

const ALLOWED_PROVIDERS = new Set(['shopify', 'packiyo', 'amazon', 'qbo']);

export default async function handler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json({ error: 'Origin not allowed' });
  if (handlePreflight(req, res)) return;
  if (!requireMethod(req, res, 'POST')) return;
  if (!enforceRateLimit(req, res, 'secrets-save', { max: 30, windowMs: 60_000 })) return;

  const user = await enforceUserAuth(req, res, { required: true });
  if (!user) return;

  try {
    const { provider, secret, metadata } = req.body || {};
    if (!provider || !ALLOWED_PROVIDERS.has(provider)) {
      return res.status(400).json({ error: 'Invalid provider' });
    }
    if (!secret || typeof secret !== 'object') {
      return res.status(400).json({ error: 'Secret payload is required' });
    }

    const result = await saveUserSecret(user.id, provider, secret, metadata || {});
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to save encrypted secret' });
  }
}
