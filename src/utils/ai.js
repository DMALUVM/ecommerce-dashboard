// AI utility functions — single source of truth
// Handles API calls to Claude AI via /api/chat streaming endpoint
import { AI_DEFAULT_MODEL } from './config';

// ============ UNIFIED AI CONFIGURATION (Pro Plan) ============
// Model string imported from config.js — edit ONLY there when models update
const AI_CONFIG = {
  model: AI_DEFAULT_MODEL,
  maxTokens: 16000,  // Default for chat/quick actions; reports override higher
  maxDuration: 300,  // Pro plan 300-second timeout (action reports need 3-5 min)
  streaming: true,  // Use streaming to avoid 25s first-byte timeout

  // Forecast calculation weights (data-driven, not AI-generated)
  forecastWeights: {
    daily: 0.60,    // 60% weight on recent daily average
    weekly: 0.20,   // 20% weight on weekly trend
    amazon: 0.20,   // 20% weight on Amazon forecast (if available)
  },

  // Sanity bounds for AI adjustments
  bounds: {
    maxAdjustment: 0.05,  // Max ±5% adjustment per future week
    maxTotalDeviation: 0.25, // Max ±25% from calculated baseline
  },

  // Learning configuration
  learning: {
    minSamplesForCorrection: 3,  // Need 3+ samples before applying learned corrections
    correctionDecay: 0.95,       // Older corrections weighted less
    maxCorrectionFactor: 1.5,    // Max correction multiplier
    minCorrectionFactor: 0.5,    // Min correction multiplier
  },
};

// Helper to call AI with unified config (streaming)
// Can be called as:
//   callAI(prompt, systemPrompt) - for simple prompts
//   callAI({ messages: [...], system: '...' }) - for chat with history or complex content
const callAI = async (promptOrOptions, systemPrompt = '', modelOverride = null, maxTokensOverride = null) => {
  // Model priority: explicit override > window global (report selector) > AI_CONFIG default
  // Guard: ensure model is always a string (window.__aiModelOverride could theoretically be corrupted)
  const rawModel = modelOverride || (typeof window !== 'undefined' && typeof window.__aiModelOverride === 'string' && window.__aiModelOverride) || AI_CONFIG.model;
  const selectedModel = typeof rawModel === 'string' ? rawModel : AI_CONFIG.model;
  const tokenLimit = maxTokensOverride || AI_CONFIG.maxTokens;
  let requestBody;

  // Sanitize messages to ensure all content is plain strings (prevents circular refs from window/DOM leaking in)
  const sanitizeMessages = (msgs) => (msgs || []).map(m => ({
    role: String(m.role || 'user'),
    content: typeof m.content === 'string' ? m.content : (m.content != null ? String(m.content) : ''),
  }));

  if (typeof promptOrOptions === 'string') {
    // Simple prompt string
    requestBody = {
      system: systemPrompt || 'You are a helpful e-commerce analytics AI. Respond with JSON when requested.',
      messages: [{ role: 'user', content: promptOrOptions }],
      model: selectedModel,
      max_tokens: tokenLimit,
    };
  } else {
    // Options object with messages array (supports complex content like PDFs)
    requestBody = {
      system: typeof promptOrOptions.system === 'string' ? promptOrOptions.system : 'You are a helpful e-commerce analytics AI.',
      messages: sanitizeMessages(promptOrOptions.messages),
      model: selectedModel,
      max_tokens: tokenLimit,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 360000); // 6 min — long reports stream 32K tokens over ~4-5 min

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AI API error: ${response.status} - ${error}`);
    }

    // Handle streaming response
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith(':')) continue; // Skip SSE comments like ": connected"
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'delta' && data.text) fullText += data.text;
              else if (data.type === 'complete' && data.content?.[0]?.text) fullText = data.content[0].text;
              else if (data.type === 'done' && data.fullText) fullText = data.fullText;
              else if (data.type === 'error') throw new Error(data.error);
            } catch (e) { /* Skip parse errors for incomplete JSON */ }
          }
        }
      }
      clearTimeout(timeoutId);
      return fullText;
    }

    // Fallback to JSON response (shouldn't happen with streaming enabled)
    const data = await response.json();
    clearTimeout(timeoutId);
    return data.content?.[0]?.text || '';
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('AI request timed out after 6 minutes — report may be too large');
    }
    throw err;
  }
};

export { AI_CONFIG, callAI };
