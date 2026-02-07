import React, { useState, useMemo } from 'react';
import { 
  Clock, ChevronDown, Database, Download, Filter, RefreshCw, 
  Save, Trash2, Upload, X, FileText, Shield
} from 'lucide-react';

const iconMap = {
  backup_export: Download,
  data_restore: Upload,
  weekly_save: Save,
  period_save: Save,
  daily_save: Save,
  store_delete: Trash2,
  auto_sync: RefreshCw,
  cogs_update: Database,
  settings_change: FileText,
};

const colorMap = {
  backup_export: 'text-emerald-400',
  data_restore: 'text-amber-400',
  weekly_save: 'text-blue-400',
  period_save: 'text-blue-400',
  daily_save: 'text-cyan-400',
  store_delete: 'text-rose-400',
  auto_sync: 'text-violet-400',
  cogs_update: 'text-orange-400',
  settings_change: 'text-slate-400',
};

const labelMap = {
  backup_export: 'Backup Exported',
  data_restore: 'Data Restored',
  weekly_save: 'Weekly Data Saved',
  period_save: 'Period Data Saved',
  daily_save: 'Daily Data Saved',
  store_delete: 'Store Deleted',
  auto_sync: 'Auto-Sync Completed',
  cogs_update: 'COGS Updated',
  settings_change: 'Settings Changed',
};

const formatTime = (ts) => {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const AuditLog = ({ isOpen, onClose, auditLog = [] }) => {
  const [filterAction, setFilterAction] = useState('all');

  const actionTypes = useMemo(() => {
    const types = new Set(auditLog.map(e => e.action));
    return ['all', ...Array.from(types)];
  }, [auditLog]);

  const filtered = useMemo(() => {
    const log = filterAction === 'all' ? auditLog : auditLog.filter(e => e.action === filterAction);
    return [...log].reverse(); // newest first
  }, [auditLog, filterAction]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[90]" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-slate-900 border-l border-slate-700 z-[91] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-600/20 rounded-xl">
              <Shield className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold">Activity Log</h2>
              <p className="text-slate-500 text-xs">{auditLog.length} events this session</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400"><X className="w-5 h-5" /></button>
        </div>

        {/* Filter */}
        {actionTypes.length > 2 && (
          <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm text-white outline-none"
            >
              {actionTypes.map(t => (
                <option key={t} value={t}>{t === 'all' ? 'All Events' : (labelMap[t] || t)}</option>
              ))}
            </select>
          </div>
        )}

        {/* Events */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-10 h-10 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No activity recorded yet</p>
              <p className="text-slate-600 text-xs mt-1">Actions like saving, syncing, and exporting will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {filtered.map((entry, idx) => {
                const Icon = iconMap[entry.action] || FileText;
                const color = colorMap[entry.action] || 'text-slate-400';
                const label = labelMap[entry.action] || entry.action;
                return (
                  <div key={idx} className="px-5 py-3 hover:bg-slate-800/50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 ${color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-white text-sm font-medium">{label}</span>
                          <span className="text-slate-600 text-xs flex-shrink-0 ml-2">{formatTime(entry.ts)}</span>
                        </div>
                        {entry.detail && (
                          <p className="text-slate-500 text-xs mt-0.5 truncate">{entry.detail}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 text-center">
          <p className="text-slate-600 text-xs">Activity is recorded for this session only</p>
        </div>
      </div>
    </>
  );
};

export default AuditLog;
