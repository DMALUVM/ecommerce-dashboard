/**
 * Dev-only logger utility
 * Silences console noise in production builds.
 * Usage: import { devLog, devWarn, devError } from '../utils/logger';
 */

const isDev = import.meta.env?.DEV !== false; // default true if not set

export const devLog = isDev ? (...args) => console.log(...args) : () => {};
export const devWarn = isDev ? (...args) => console.warn(...args) : () => {};
export const devError = isDev ? (...args) => console.error(...args) : () => {};

// Structured logger for audit trail (stores last N events in memory)
const MAX_LOG_SIZE = 200;
const _auditLog = [];

export const audit = (action, detail = '') => {
  const entry = {
    ts: new Date().toISOString(),
    action,
    detail: typeof detail === 'object' ? JSON.stringify(detail) : String(detail),
  };
  _auditLog.push(entry);
  if (_auditLog.length > MAX_LOG_SIZE) _auditLog.shift();
  devLog(`[audit] ${action}`, detail);
};

export const getAuditLog = () => [..._auditLog];
export const clearAuditLog = () => { _auditLog.length = 0; };

export default { devLog, devWarn, devError, audit, getAuditLog, clearAuditLog };
