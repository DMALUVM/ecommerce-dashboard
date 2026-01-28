// AI utility functions
// Handles API calls to Claude AI

// ============ UNIFIED AI CONFIGURATION (Pro Plan) ============
// All AI features use these consistent settings for best results
const AI_CONFIG = {
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4000,  // Pro plan allows comprehensive responses
  maxDuration: 60,  // Pro plan 60-second timeout
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
const callAI = async (promptOrOptions, systemPrompt = '') => {
  let requestBody;
  
  if (typeof promptOrOptions === 'string') {
    // Simple prompt string
    requestBody = {
      system: systemPrompt || 'You are a helpful e-commerce analytics AI. Respond with JSON when requested.',
      messages: [{ role: 'user', content: promptOrOptions }],
      model: AI_CONFIG.model,
      max_tokens: AI_CONFIG.maxTokens,
    };
  } else {
    // Options object with messages array (supports complex content like PDFs)
    requestBody = {
      system: promptOrOptions.system || 'You are a helpful e-commerce analytics AI.',
      messages: promptOrOptions.messages || [],
      model: AI_CONFIG.model,
      max_tokens: AI_CONFIG.maxTokens,
    };
  }
  
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
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
    return fullText;
  }
  
  // Fallback to JSON response (shouldn't happen with streaming enabled)
  const data = await response.json();
  return data.content?.[0]?.text || '';
};


export { AI_CONFIG, callAI };
