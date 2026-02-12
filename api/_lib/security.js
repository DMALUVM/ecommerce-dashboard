import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const rateStore = new Map();

const nowMs = () => Date.now();

const getEnv = (name, fallback = '') => process.env[name] || fallback;

const getAllowedOrigins = () => {
  const raw = getEnv('ALLOWED_ORIGINS', '');
  if (!raw) return [];
  return raw
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
};

const isDevOrigin = (origin) => /localhost|127\.0\.0\.1/.test(origin || '');

export const applyCors = (req, res, methods = 'POST, OPTIONS') => {
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();
  const appOrigin = getEnv('APP_ORIGIN', getEnv('VITE_APP_ORIGIN', ''));
  const requestHost = req.headers.host || '';
  let allowOrigin = '';

  if (!origin) {
    allowOrigin = '*';
  } else if (allowedOrigins.length === 0) {
    let originHost = '';
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = '';
    }
    if (isDevOrigin(origin) || (appOrigin && origin === appOrigin) || (originHost && originHost === requestHost)) {
      allowOrigin = origin;
    }
  } else if (allowedOrigins.includes(origin)) {
    allowOrigin = origin;
  }

  if (!allowOrigin) {
    return false;
  }

  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return true;
};

export const handlePreflight = (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
};

export const requireMethod = (req, res, method = 'POST') => {
  if (req.method !== method) {
    res.status(405).json({ error: 'Method not allowed' });
    return false;
  }
  return true;
};

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
};

export const checkRateLimit = (req, keyPrefix, { max = 60, windowMs = 60_000 } = {}) => {
  if (rateStore.size > 1000) {
    const now = nowMs();
    for (const [storedKey, storedEntry] of rateStore.entries()) {
      if (!storedEntry || now >= storedEntry.resetAt) rateStore.delete(storedKey);
    }
  }

  const key = `${keyPrefix}:${getClientIp(req)}`;
  const entry = rateStore.get(key);
  const now = nowMs();

  if (!entry || now >= entry.resetAt) {
    rateStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1, retryAfterSec: 0 };
  }

  if (entry.count >= max) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  entry.count += 1;
  rateStore.set(key, entry);
  return { allowed: true, remaining: Math.max(0, max - entry.count), retryAfterSec: 0 };
};

export const enforceRateLimit = (req, res, keyPrefix, options = {}) => {
  const result = checkRateLimit(req, keyPrefix, options);
  if (!result.allowed) {
    res.setHeader('Retry-After', String(result.retryAfterSec));
    res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
    return false;
  }
  return true;
};

const getSupabaseUrl = () => getEnv('SUPABASE_URL', getEnv('VITE_SUPABASE_URL', ''));
const getSupabaseAnonKey = () => getEnv('SUPABASE_ANON_KEY', getEnv('VITE_SUPABASE_ANON_KEY', ''));
const getSupabaseServiceRoleKey = () => getEnv('SUPABASE_SERVICE_ROLE_KEY', '');

export const getBearerToken = (req) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim();
};

export const shouldRequireApiAuth = () => {
  if (getEnv('REQUIRE_API_AUTH', '').toLowerCase() === 'true') return true;
  return getEnv('NODE_ENV', '').toLowerCase() === 'production';
};

export const getAuthenticatedUser = async (req) => {
  const token = getBearerToken(req);
  if (!token) return null;

  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
};

export const enforceUserAuth = async (req, res, { required = shouldRequireApiAuth() } = {}) => {
  const user = await getAuthenticatedUser(req);
  if (!required) return user;
  if (user) return user;

  res.status(401).json({ error: 'Unauthorized' });
  return null;
};

const normalizeEncryptionKey = () => {
  const raw = getEnv('SECRETS_ENCRYPTION_KEY', '').trim();
  if (!raw) throw new Error('SECRETS_ENCRYPTION_KEY is not configured');

  if (raw.startsWith('base64:')) {
    const decoded = Buffer.from(raw.slice('base64:'.length), 'base64');
    if (decoded.length >= 32) return decoded.subarray(0, 32);
  }

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  return crypto.createHash('sha256').update(raw).digest();
};

const getServiceSupabase = () => {
  const supabaseUrl = getSupabaseUrl();
  const serviceRole = getSupabaseServiceRoleKey();
  if (!supabaseUrl || !serviceRole) {
    throw new Error('Supabase service role is not configured');
  }
  return createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const encryptJson = (value) => {
  const key = normalizeEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    version: 1,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    authTag: authTag.toString('base64'),
  };
};

const decryptJson = (encrypted) => {
  const key = normalizeEncryptionKey();
  const iv = Buffer.from(encrypted.iv, 'base64');
  const authTag = Buffer.from(encrypted.authTag, 'base64');
  const ciphertext = Buffer.from(encrypted.ciphertext, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  return JSON.parse(plaintext);
};

const SECURE_SECRETS_KEY = '_secureSecrets';

const readAppData = async (userId) => {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('app_data')
    .select('data')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.data || {};
};

const writeAppData = async (userId, dataPayload) => {
  const supabase = getServiceSupabase();
  const { error } = await supabase.from('app_data').upsert({
    user_id: userId,
    data: dataPayload,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw error;
};

const cleanObject = (obj) => {
  const output = {};
  Object.entries(obj || {}).forEach(([key, value]) => {
    if (value === undefined) return;
    output[key] = value;
  });
  return output;
};

export const saveUserSecret = async (userId, provider, secret, metadata = {}) => {
  if (!userId) throw new Error('userId is required');
  if (!provider) throw new Error('provider is required');
  const current = await readAppData(userId);
  const secureSecrets = cleanObject(current[SECURE_SECRETS_KEY] || {});
  const encrypted = encryptJson(cleanObject(secret));
  secureSecrets[provider] = {
    ...encrypted,
    metadata: cleanObject(metadata),
    updatedAt: new Date().toISOString(),
  };

  const next = {
    ...current,
    [SECURE_SECRETS_KEY]: secureSecrets,
  };
  await writeAppData(userId, next);
  return { provider, updatedAt: secureSecrets[provider].updatedAt };
};

export const getUserSecret = async (userId, provider) => {
  const current = await readAppData(userId);
  const secureSecrets = cleanObject(current[SECURE_SECRETS_KEY] || {});
  const encrypted = secureSecrets[provider];
  if (!encrypted?.ciphertext || !encrypted?.iv || !encrypted?.authTag) {
    return null;
  }
  const value = decryptJson(encrypted);
  return {
    provider,
    secret: value,
    metadata: cleanObject(encrypted.metadata || {}),
    updatedAt: encrypted.updatedAt || null,
  };
};

export const getUserSecrets = async (userId, providers = []) => {
  const current = await readAppData(userId);
  const secureSecrets = cleanObject(current[SECURE_SECRETS_KEY] || {});
  const result = {};

  const keys = providers.length > 0 ? providers : Object.keys(secureSecrets);
  keys.forEach((provider) => {
    const encrypted = secureSecrets[provider];
    if (!encrypted?.ciphertext || !encrypted?.iv || !encrypted?.authTag) return;
    try {
      result[provider] = {
        secret: decryptJson(encrypted),
        metadata: cleanObject(encrypted.metadata || {}),
        updatedAt: encrypted.updatedAt || null,
      };
    } catch {
      // Skip undecryptable entries to avoid blocking valid secrets.
    }
  });

  return result;
};
