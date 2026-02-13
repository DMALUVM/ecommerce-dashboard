// sanitize.js — Lightweight HTML sanitizer for AI/report output
// Strips dangerous tags, event handlers, and javascript: URLs
// Used wherever dangerouslySetInnerHTML renders untrusted content

// Tags that are NEVER allowed in rendered output
const DANGEROUS_TAGS = /(<\s*\/?\s*(script|iframe|object|embed|form|input|textarea|select|button|link|meta|base|applet|style)\b[^>]*>)/gi;

// on* event handlers (onclick, onerror, onload, etc.)
const EVENT_HANDLERS = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

// javascript:, vbscript:, data: URLs in href/src/action attributes
const DANGEROUS_URLS = /(href|src|action)\s*=\s*(?:"[^"]*(?:javascript|vbscript|data)\s*:[^"]*"|'[^']*(?:javascript|vbscript|data)\s*:[^']*')/gi;

// expression() in style attributes (IE CSS XSS)
const CSS_EXPRESSIONS = /expression\s*\(/gi;

// Standalone <style> content that could contain dangerous CSS
const STYLE_CONTENT = /<style\b[^>]*>[\s\S]*?<\/style>/gi;

/**
 * Sanitize HTML string by removing XSS vectors.
 * Preserves safe formatting tags (p, h1-h6, strong, em, ul, ol, li, table, etc.)
 * 
 * @param {string} html - Raw HTML string (e.g. from markdown conversion)
 * @returns {string} - Sanitized HTML safe for dangerouslySetInnerHTML
 */
export const sanitizeHtml = (html) => {
  if (!html || typeof html !== 'string') return '';
  
  let clean = html;
  
  // 1. Remove dangerous tags entirely
  clean = clean.replace(DANGEROUS_TAGS, '');
  
  // 2. Remove inline event handlers from any remaining tags
  clean = clean.replace(EVENT_HANDLERS, '');
  
  // 3. Neutralize javascript:/vbscript:/data: URLs
  clean = clean.replace(DANGEROUS_URLS, (match, attr) => `${attr}="#blocked"`);
  
  // 4. Remove CSS expressions
  clean = clean.replace(CSS_EXPRESSIONS, 'blocked(');
  
  // 5. Remove standalone <style> blocks (but allow inline style= attributes)
  clean = clean.replace(STYLE_CONTENT, '');
  
  return clean;
};

export default sanitizeHtml;
