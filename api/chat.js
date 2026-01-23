// api/chat.js - Anthropic Claude API with STREAMING
// CommonJS format ensures Node.js runtime (not Edge)

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { system, messages, model = 'claude-sonnet-4-20250514', max_tokens = 4000 } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array required' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  // Set streaming headers IMMEDIATELY to satisfy 25s first-byte requirement
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  
  // Send first byte immediately - this satisfies Vercel's 25s requirement
  res.write(': connected\n\n');
  res.flushHeaders();

  try {
    console.log('[chat.js] Calling Anthropic API with', messages.length, 'messages (streaming)');
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens,
        messages,
        stream: true,
        ...(system && { system }),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[chat.js] Anthropic error:', response.status, errorText);
      res.write('data: ' + JSON.stringify({ type: 'error', error: errorText, status: response.status }) + '\n\n');
      res.end();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    // Keep connection alive
    const keepalive = setInterval(function() {
      res.write(': keepalive\n\n');
    }, 15000);

    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;

        buffer += decoder.decode(result.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (!data || data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              
              if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
                fullText += parsed.delta.text;
                res.write('data: ' + JSON.stringify({ type: 'delta', text: parsed.delta.text }) + '\n\n');
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      clearInterval(keepalive);
      reader.releaseLock();
    }

    // Send complete response
    res.write('data: ' + JSON.stringify({ type: 'complete', content: [{ type: 'text', text: fullText }] }) + '\n\n');
    console.log('[chat.js] Streaming complete,', fullText.length, 'chars');
    res.end();
    
  } catch (error) {
    console.error('[chat.js] Error:', error);
    res.write('data: ' + JSON.stringify({ type: 'error', error: error.message }) + '\n\n');
    res.end();
  }
};

// Config for Vercel - this ensures 60s timeout
module.exports.config = {
  maxDuration: 60,
};
