import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Bell, X, AlertTriangle, Clock, Package, DollarSign, TrendingDown,
  CheckCircle, ChevronRight, Trash2, Settings
} from 'lucide-react';

const NotificationCenter = ({
  salesTaxConfig,
  inventoryData,
  allDaysData,
  appSettings,
  lastBackupDate,
  setView,
  setToast,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ecommerce_dismissed_notifications_v1') || '[]'); }
    catch { return []; }
  });
  const panelRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler); };
  }, [isOpen]);

  // Persist dismissed
  useEffect(() => {
    try { localStorage.setItem('ecommerce_dismissed_notifications_v1', JSON.stringify(dismissed.slice(-100))); }
    catch {}
  }, [dismissed]);

  // ── Generate notifications ──
  const notifications = useMemo(() => {
    const notifs = [];
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // 1. SALES TAX DEADLINES
    const { nexusStates = {}, filingHistory = {} } = salesTaxConfig || {};
    Object.entries(nexusStates).forEach(([code, config]) => {
      if (!config?.hasNexus) return;
      try {
        const frequency = config.frequency || 'monthly';
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        
        // Determine if filing is due this month
        let isDue = false;
        if (frequency === 'monthly') isDue = true;
        else if (frequency === 'quarterly') isDue = [3, 6, 9, 12].includes(currentMonth);
        else if (frequency === 'semi-annual') isDue = [6, 12].includes(currentMonth);
        else if (frequency === 'annual') isDue = currentMonth === 12;

        if (isDue) {
          const periodKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
          const filed = filingHistory?.[code]?.[periodKey]?.filed;
          if (!filed) {
            // Due date is typically the 20th of the following month
            const dueMonth = currentMonth === 12 ? 1 : currentMonth + 1;
            const dueYear = currentMonth === 12 ? currentYear + 1 : currentYear;
            const dueDate = new Date(dueYear, dueMonth - 1, 20);
            const daysUntil = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

            if (daysUntil <= 14) {
              notifs.push({
                id: `tax-${code}-${periodKey}`,
                type: daysUntil <= 3 ? 'critical' : daysUntil <= 7 ? 'warning' : 'info',
                category: 'tax',
                icon: DollarSign,
                title: `${code} tax filing ${daysUntil <= 0 ? 'OVERDUE' : `due in ${daysUntil} days`}`,
                body: `${frequency} filing for ${periodKey}. Due ${dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`,
                action: () => setView('sales-tax'),
                actionLabel: 'File Now',
                timestamp: now,
              });
            }
          }
        }
      } catch {}
    });

    // 2. INVENTORY ALERTS
    if (inventoryData && Array.isArray(inventoryData)) {
      const criticalDays = appSettings?.inventoryDaysCritical || 14;
      const lowDays = appSettings?.inventoryDaysLow || 30;

      inventoryData.forEach(item => {
        if (!item?.sku) return;
        const daysLeft = item.daysOfInventory || item.daysRemaining || 0;
        const qty = item.quantity || item.availableQuantity || 0;

        if (qty === 0) {
          notifs.push({
            id: `inv-oos-${item.sku}`,
            type: 'critical',
            category: 'inventory',
            icon: Package,
            title: `${item.sku} is OUT OF STOCK`,
            body: `${item.productName || item.sku} has 0 units available.`,
            action: () => setView('inventory'),
            actionLabel: 'View Inventory',
            timestamp: now,
          });
        } else if (daysLeft > 0 && daysLeft <= criticalDays) {
          notifs.push({
            id: `inv-crit-${item.sku}`,
            type: 'critical',
            category: 'inventory',
            icon: Package,
            title: `${item.sku}: ${daysLeft}d of stock left`,
            body: `Only ${qty} units remaining. Reorder immediately.`,
            action: () => setView('inventory'),
            actionLabel: 'View',
            timestamp: now,
          });
        } else if (daysLeft > 0 && daysLeft <= lowDays) {
          notifs.push({
            id: `inv-low-${item.sku}`,
            type: 'warning',
            category: 'inventory',
            icon: Package,
            title: `${item.sku}: ${daysLeft}d of stock left`,
            body: `${qty} units remaining. Plan reorder.`,
            action: () => setView('inventory'),
            actionLabel: 'View',
            timestamp: now,
          });
        }
      });
    }

    // 3. AD SPEND & REVENUE ANOMALIES
    // Disabled — computed comparisons across periods produce false positives 
    // when daily data comes from different upload sources (weekly vs daily vs API).
    // Tax deadlines, inventory, freshness, and backup alerts are reliable.
    const sortedDays = Object.keys(allDaysData || {}).sort();

    // 4. DATA FRESHNESS
    if (sortedDays.length > 0) {
      const lastDay = sortedDays[sortedDays.length - 1];
      const daysSinceSync = Math.floor((now - new Date(lastDay)) / (1000 * 60 * 60 * 24));
      if (daysSinceSync >= 3) {
        notifs.push({
          id: `sync-stale-${today}`,
          type: daysSinceSync >= 7 ? 'critical' : 'warning',
          category: 'system',
          icon: Clock,
          title: `Data is ${daysSinceSync} days old`,
          body: `Last sync: ${lastDay}. Connect SP-API or upload recent data.`,
          action: () => setView('settings'),
          actionLabel: 'Settings',
          timestamp: now,
        });
      }
    }

    // 5. BACKUP STALENESS
    const hasData = sortedDays.length > 0;
    if (hasData) {
      const daysSinceBackup = lastBackupDate 
        ? Math.floor((now - new Date(lastBackupDate)) / (1000 * 60 * 60 * 24)) 
        : 999;
      if (daysSinceBackup >= 7) {
        notifs.push({
          id: `backup-stale-${Math.floor(daysSinceBackup / 7)}`,
          type: daysSinceBackup >= 14 ? 'critical' : 'warning',
          category: 'system',
          icon: Clock,
          title: lastBackupDate ? `No backup in ${daysSinceBackup} days` : 'No backup yet',
          body: 'Export a backup to protect against data loss. Use the Export button in the header.',
          action: () => setView('settings'),
          actionLabel: 'Settings',
          timestamp: now,
        });
      }
    }

    // Sort: critical first, then warning, then info
    const priority = { critical: 0, warning: 1, info: 2 };
    return notifs.sort((a, b) => (priority[a.type] || 2) - (priority[b.type] || 2));
  }, [salesTaxConfig, inventoryData, allDaysData, appSettings, lastBackupDate, setView]);

  // Filter out dismissed
  const activeNotifications = notifications.filter(n => !dismissed.includes(n.id));
  const criticalCount = activeNotifications.filter(n => n.type === 'critical').length;
  const totalCount = activeNotifications.length;

  const dismissOne = (id) => setDismissed(prev => [...prev, id]);
  const dismissAll = () => setDismissed(prev => [...prev, ...activeNotifications.map(n => n.id)]);

  const typeStyles = {
    critical: 'border-rose-500/40 bg-rose-900/20',
    warning: 'border-amber-500/30 bg-amber-900/15',
    info: 'border-blue-500/30 bg-blue-900/15',
  };

  const typeIconColor = {
    critical: 'text-rose-400',
    warning: 'text-amber-400',
    info: 'text-blue-400',
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-slate-700/50 transition-colors"
        title={`${totalCount} notification${totalCount !== 1 ? 's' : ''}`}
      >
        <Bell className={`w-5 h-5 ${criticalCount > 0 ? 'text-rose-400' : totalCount > 0 ? 'text-amber-400' : 'text-slate-400'}`} />
        {totalCount > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center text-white ${
            criticalCount > 0 ? 'bg-rose-500 animate-pulse' : 'bg-amber-500'
          }`}>
            {totalCount > 9 ? '9+' : totalCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {isOpen && (
        <div className="fixed top-12 right-4 w-[360px] max-w-[calc(100vw-32px)] bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl shadow-black/40 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
            <h3 className="text-white font-semibold text-sm">Notifications</h3>
            <div className="flex items-center gap-2">
              {activeNotifications.length > 0 && (
                <button onClick={dismissAll} className="text-slate-500 hover:text-slate-300 text-xs">
                  Clear all
                </button>
              )}
              <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-[400px] overflow-y-auto">
            {activeNotifications.length === 0 ? (
              <div className="py-12 text-center">
                <CheckCircle className="w-10 h-10 text-emerald-400/50 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">All clear!</p>
                <p className="text-slate-600 text-xs mt-1">No alerts right now</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-700/50">
                {activeNotifications.map(notif => {
                  const Icon = notif.icon;
                  return (
                    <div
                      key={notif.id}
                      className={`px-4 py-3 border-l-2 ${typeStyles[notif.type]} hover:bg-slate-700/30 transition-colors`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 flex-shrink-0 ${typeIconColor[notif.type]}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium leading-tight">{notif.title}</p>
                          <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">{notif.body}</p>
                          <div className="flex items-center gap-3 mt-2">
                            {notif.action && (
                              <button
                                onClick={() => { notif.action(); setIsOpen(false); }}
                                className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                              >
                                {notif.actionLabel || 'View'} <ChevronRight className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              onClick={() => dismissOne(notif.id)}
                              className="text-xs text-slate-600 hover:text-slate-400"
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {activeNotifications.length > 0 && (
            <div className="px-4 py-2.5 border-t border-slate-700 bg-slate-800/80">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{criticalCount > 0 ? `${criticalCount} critical` : `${totalCount} alert${totalCount !== 1 ? 's' : ''}`}</span>
                <span className="flex gap-3">
                  {Object.entries(
                    activeNotifications.reduce((acc, n) => { acc[n.category] = (acc[n.category] || 0) + 1; return acc; }, {})
                  ).map(([cat, count]) => (
                    <span key={cat} className="capitalize">{cat}: {count}</span>
                  ))}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
