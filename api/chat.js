// api/chat.js - Anthropic Claude API with streaming
// Uses streaming to satisfy 25s first-byte requirement while using full 60s
import {
  applyCors,
  handlePreflight,
  requireMethod,
  enforceRateLimit,
  enforceUserAuth,
} from './_lib/security.js';

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json({ error: 'Origin not allowed' });
  if (handlePreflight(req, res)) return;
  if (!requireMethod(req, res, 'POST')) return;
  if (!enforceRateLimit(req, res, 'chat', { max: 45, windowMs: 60_000 })) return;

  const authUser = await enforceUserAuth(req, res);
  if (!authUser && res.writableEnded) return;

  try {
    const { system, messages, model = 'claude-sonnet-4-20250514', max_tokens = 4000 } = req.body || {};
    const safeMaxTokens = Math.min(12000, Math.max(256, Number(max_tokens) || 4000));

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array required' });
    }
    if (messages.length > 80) {
      return res.status(400).json({ error: 'Too many messages. Reduce conversation history and retry.' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    console.log('[chat.js] Calling Anthropic with', messages.length, 'messages');

    // Set headers for SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Send first byte immediately
    res.write(': connected\n\n');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: safeMaxTokens,
        messages,
        stream: true,
        ...(system && { system }),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[chat.js] Anthropic error:', response.status);
      res.write(`data: ${JSON.stringify({ type: 'error', error: errorText })}\n\n`);
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
            }
          } catch {
            // Skip partial chunk parse errors during streaming.
          }
        }
      }
    }

    // Send final message
    res.write(`data: ${JSON.stringify({ type: 'complete', content: [{ type: 'text', text: fullText }] })}\n\n`);
    console.log('[chat.js] Done, length:', fullText.length);
    return res.end();

  } catch (error) {
    console.error('[chat.js] Error:', error.message);
    
    // If headers not sent yet, send JSON error
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message });
    }
    
    // Otherwise send SSE error
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    return res.end();
  }
}
