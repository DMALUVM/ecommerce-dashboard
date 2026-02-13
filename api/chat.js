// api/chat.js - Anthropic Claude API with streaming
// Uses streaming to satisfy 25s first-byte requirement while using full 60s

export const config = {
  maxDuration: 60,
};

// Valid model prefixes we accept
const VALID_MODEL_PREFIXES = ['claude-sonnet', 'claude-opus', 'claude-haiku'];
const MAX_TOKENS_CEILING = 16000; // Hard ceiling — client cannot exceed this
const MAX_PAYLOAD_BYTES = 1_500_000; // ~1.5 MB max request body

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Enforce payload size limit
    const rawBody = JSON.stringify(req.body || {});
    if (rawBody.length > MAX_PAYLOAD_BYTES) {
      return res.status(413).json({ error: `Request too large (${Math.round(rawBody.length / 1024)}KB). Max ${Math.round(MAX_PAYLOAD_BYTES / 1024)}KB.` });
    }

    const { system, messages, model = 'claude-sonnet-4-5-20250929', max_tokens = 4000 } = req.body || {};

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array required and must not be empty' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured. Add it to Vercel Environment Variables.' });
    }

    // Validate model string — reject unknown models
    const isValidModel = VALID_MODEL_PREFIXES.some(prefix => model.startsWith(prefix));
    if (!isValidModel) {
      return res.status(400).json({ error: `Invalid model "${model}". Allowed prefixes: ${VALID_MODEL_PREFIXES.join(', ')}` });
    }
    const safeModel = model;

    // Clamp max_tokens to ceiling — never trust client value
    const safeMaxTokens = Math.min(Math.max(1, parseInt(max_tokens) || 4000), MAX_TOKENS_CEILING);

    // Estimate input size for logging
    const inputChars = JSON.stringify(messages).length + (system?.length || 0);
    console.log(`[chat.js] model=${safeModel}, messages=${messages.length}, ~${Math.round(inputChars/4)}tok input, max_tokens=${safeMaxTokens}${safeMaxTokens !== max_tokens ? ` (clamped from ${max_tokens})` : ''}`);

    // Set headers for SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Send first byte immediately to satisfy Vercel's 25s first-byte requirement
    res.write(': connected\n\n');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: safeModel,
        max_tokens: safeMaxTokens,
        messages,
        stream: true,
        ...(system && { system }),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[chat.js] Anthropic error ${response.status}: ${errorText.slice(0, 500)}`);
      
      // Parse Anthropic error for user-friendly message
      let userError = `Anthropic API error (${response.status})`;
      try {
        const errObj = JSON.parse(errorText);
        if (errObj.error?.message) userError = errObj.error.message;
      } catch (e) { /* use generic */ }
      
      res.write(`data: ${JSON.stringify({ type: 'error', error: userError })}\n\n`);
      return res.end();
    }

    // Read the stream
    let fullText = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              fullText += parsed.delta.text;
              res.write(`data: ${JSON.stringify({ type: 'delta', text: parsed.delta.text })}\n\n`);
            } else if (parsed.type === 'message_stop') {
              // Stream complete
            } else if (parsed.type === 'error') {
              console.error('[chat.js] Stream error:', parsed.error);
              res.write(`data: ${JSON.stringify({ type: 'error', error: parsed.error?.message || 'Stream error' })}\n\n`);
            }
          } catch (e) {
            // Skip parse errors for incomplete JSON chunks
          }
        }
      }
    }

    // Send final message
    res.write(`data: ${JSON.stringify({ type: 'complete', content: [{ type: 'text', text: fullText }] })}\n\n`);
    console.log(`[chat.js] Done, ${fullText.length} chars output`);
    return res.end();

  } catch (error) {
    console.error('[chat.js] Error:', error.message, error.stack?.split('\n').slice(0, 3).join(' '));
    
    // If headers not sent yet, send JSON error
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message });
    }
    
    // Otherwise send SSE error
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    return res.end();
  }
}
