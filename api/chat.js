// api/chat.js - Multi-provider AI API with streaming
// Supports: Anthropic Claude, OpenAI GPT/o-series
// SEC-006: Model validation + token cap
// SEC-005: In-memory rate limiting
// SEC-004: Soft auth logging (prep for enforcement)
// BE-201: SSE buffer fix

export const config = {
  maxDuration: 60,
};

// === Provider Configuration ===
const PROVIDERS = {
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    envKey: 'ANTHROPIC_API_KEY',
    buildHeaders: (key) => ({
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    }),
    buildBody: ({ model, messages, system, max_tokens }) => ({
      model, max_tokens, messages, stream: true,
      ...(system && { system }),
    }),
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    envKey: 'OPENAI_API_KEY',
    buildHeaders: (key) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    }),
    buildBody: ({ model, messages, system, max_tokens }) => ({
      model,
      max_completion_tokens: max_tokens,
      stream: true,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...messages,
      ],
    }),
  },
};

// === SEC-006: Model → Provider mapping ===
function detectProvider(model) {
  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gpt-') || model.startsWith('o3') || model.startsWith('o1')) return 'openai';
  return null;
}

const MAX_TOKENS_CEILING = 16384;
const MAX_PAYLOAD_BYTES = 1_500_000; // ~1.5 MB

// === SEC-005: Simple Rate Limiter ===
// In-memory sliding window — survives within warm Vercel instance (~5-15 min).
// Resets on cold start, which is fine for burst protection.
const RATE_WINDOW_MS = 60_000;   // 1-minute window
const RATE_MAX_REQUESTS = 30;    // 30 requests/min per IP (generous for normal use)
const rateBuckets = new Map();   // IP → { count, windowStart }

function checkRateLimit(ip) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);

  if (!bucket || (now - bucket.windowStart) > RATE_WINDOW_MS) {
    // New window
    rateBuckets.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: RATE_MAX_REQUESTS - 1 };
  }

  bucket.count++;
  if (bucket.count > RATE_MAX_REQUESTS) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((bucket.windowStart + RATE_WINDOW_MS - now) / 1000) };
  }

  return { allowed: true, remaining: RATE_MAX_REQUESTS - bucket.count };
}

// Periodic cleanup of stale buckets (prevent memory leak on long-lived instances)
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS * 2;
  for (const [ip, bucket] of rateBuckets.entries()) {
    if (bucket.windowStart < cutoff) rateBuckets.delete(ip);
  }
}, RATE_WINDOW_MS * 5);

// === Stream parsers per provider ===
// Each returns { text, done, error } from a parsed SSE data line
function parseAnthropicEvent(parsed) {
  if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
    return { text: parsed.delta.text };
  }
  if (parsed.type === 'message_stop') {
    return { done: true };
  }
  if (parsed.type === 'error') {
    return { error: parsed.error?.message || 'Stream error' };
  }
  return {};
}

function parseOpenAIEvent(parsed) {
  if (parsed.choices?.[0]?.delta?.content) {
    return { text: parsed.choices[0].delta.content };
  }
  if (parsed.choices?.[0]?.finish_reason === 'stop') {
    return { done: true };
  }
  if (parsed.error) {
    return { error: parsed.error.message || 'Stream error' };
  }
  return {};
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // === SEC-005: Rate Limiting ===
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const rateResult = checkRateLimit(clientIp);

  res.setHeader('X-RateLimit-Limit', RATE_MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, rateResult.remaining));

  if (!rateResult.allowed) {
    console.warn(`[chat.js] RATE LIMITED: ${clientIp} (${RATE_MAX_REQUESTS} req/${RATE_WINDOW_MS/1000}s exceeded)`);
    res.setHeader('Retry-After', rateResult.retryAfter);
    return res.status(429).json({
      error: `Rate limit exceeded. Max ${RATE_MAX_REQUESTS} requests per minute. Retry after ${rateResult.retryAfter}s.`
    });
  }

  try {
    // === SEC-004: Soft Auth Check (log-only) ===
    const authHeader = req.headers.authorization;
    const hasAuth = authHeader?.startsWith('Bearer ') && authHeader.length > 20;
    if (!hasAuth) {
      console.warn(`[chat.js] AUTH WARNING: No valid auth token from ${clientIp} — would be blocked in enforced mode`);
    }
    // Future: verify JWT with Supabase here, return 401 if invalid

    // Enforce payload size limit
    const rawBody = JSON.stringify(req.body || {});
    if (rawBody.length > MAX_PAYLOAD_BYTES) {
      return res.status(413).json({ error: `Request too large (${Math.round(rawBody.length / 1024)}KB). Max ${Math.round(MAX_PAYLOAD_BYTES / 1024)}KB.` });
    }

    const { system, messages, model = 'claude-sonnet-4-6', max_tokens = 4000 } = req.body || {};

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array required and must not be empty' });
    }

    // === SEC-006: Validate model → detect provider ===
    const providerName = detectProvider(model);
    if (!providerName) {
      return res.status(400).json({ error: `Unknown model "${model}". Supported: claude-*, gpt-*, o3, o1` });
    }

    const providerConfig = PROVIDERS[providerName];
    const apiKey = process.env[providerConfig.envKey];
    if (!apiKey) {
      return res.status(500).json({ error: `${providerConfig.envKey} not configured. Add it to Vercel Environment Variables.` });
    }

    const safeModel = model;
    // Clamp max_tokens to ceiling
    const safeMaxTokens = Math.min(Math.max(1, parseInt(max_tokens) || 4000), MAX_TOKENS_CEILING);

    // Log request details
    const inputChars = JSON.stringify(messages).length + (system?.length || 0);
    console.log(`[chat.js] ip=${clientIp.slice(-8)} auth=${hasAuth ? 'yes' : 'NO'} provider=${providerName} model=${safeModel} msgs=${messages.length} ~${Math.round(inputChars/4)}tok max=${safeMaxTokens}${safeMaxTokens !== max_tokens ? `(clamped)` : ''}`);

    // Set headers for SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send first byte immediately to satisfy Vercel's 25s first-byte requirement
    res.write(': connected\n\n');

    // Build and send provider-specific request
    const response = await fetch(providerConfig.url, {
      method: 'POST',
      headers: providerConfig.buildHeaders(apiKey),
      body: JSON.stringify(providerConfig.buildBody({
        model: safeModel,
        messages,
        system,
        max_tokens: safeMaxTokens,
      })),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[chat.js] ${providerName} error ${response.status}: ${errorText.slice(0, 500)}`);

      let userError = `${providerName} API error (${response.status})`;
      try {
        const errObj = JSON.parse(errorText);
        if (errObj.error?.message) userError = errObj.error.message;
      } catch (e) { /* use generic */ }

      res.write(`data: ${JSON.stringify({ type: 'error', error: userError })}\n\n`);
      return res.end();
    }

    // === BE-201: SSE Stream with proper buffering ===
    const parseEvent = providerName === 'openai' ? parseOpenAIEvent : parseAnthropicEvent;
    let fullText = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = ''; // Buffer for incomplete lines across chunks

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Prepend any leftover from previous chunk
      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split('\n');

      // Keep the last (potentially incomplete) line in the buffer
      sseBuffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const result = parseEvent(parsed);

            if (result.text) {
              fullText += result.text;
              res.write(`data: ${JSON.stringify({ type: 'delta', text: result.text })}\n\n`);
            } else if (result.error) {
              console.error(`[chat.js] ${providerName} stream error:`, result.error);
              res.write(`data: ${JSON.stringify({ type: 'error', error: result.error })}\n\n`);
            }
            // result.done is handled implicitly when the stream ends
          } catch (e) {
            // Skip parse errors for incomplete JSON (shouldn't happen with buffer, but safety net)
          }
        }
      }
    }

    // Process any remaining buffered data
    if (sseBuffer.trim().startsWith('data: ')) {
      try {
        const data = sseBuffer.slice(6).trim();
        if (data && data !== '[DONE]') {
          const parsed = JSON.parse(data);
          const result = parseEvent(parsed);
          if (result.text) {
            fullText += result.text;
            res.write(`data: ${JSON.stringify({ type: 'delta', text: result.text })}\n\n`);
          }
        }
      } catch (e) { /* ignore trailing incomplete data */ }
    }

    // Send final message
    res.write(`data: ${JSON.stringify({ type: 'complete', content: [{ type: 'text', text: fullText }] })}\n\n`);
    console.log(`[chat.js] Done, ${providerName}/${safeModel}, ${fullText.length} chars output`);
    return res.end();

  } catch (error) {
    console.error('[chat.js] Error:', error.message, error.stack?.split('\n').slice(0, 3).join(' '));

    if (!res.headersSent) {
      return res.status(500).json({ error: error.message });
    }

    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    return res.end();
  }
}
