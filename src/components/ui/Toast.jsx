import React, { useEffect, useState, useRef } from 'react';
import { Check, AlertTriangle, X, Info } from 'lucide-react';

const Toast = ({ toast, setToast, showSaveConfirm }) => {
  const [toastQueue, setToastQueue] = useState([]);
  const queueRef = useRef([]);
  const timersRef = useRef(new Map());

  // Cleanup all timers on unmount
  useEffect(() => () => timersRef.current.forEach(t => clearTimeout(t)), []);

  // Track toast changes and build a queue
  useEffect(() => {
    if (toast) {
      const id = Date.now() + Math.random();
      const newToast = { ...toast, id };
      queueRef.current = [...queueRef.current, newToast].slice(-4); // Keep max 4
      setToastQueue([...queueRef.current]);

      const duration = toast.duration || (toast.action ? 10000 : 3500);
      // Each toast gets its own independent timer (no effect cleanup —
      // cleaning up here would cancel prior toasts' timers when a new one arrives)
      timersRef.current.set(id, setTimeout(() => {
        timersRef.current.delete(id);
        queueRef.current = queueRef.current.filter(t => t.id !== id);
        setToastQueue([...queueRef.current]);
        if (queueRef.current.length === 0) setToast(null);
      }, duration));
    }
  }, [toast]);
  
  const dismissToast = (id) => {
    if (timersRef.current.has(id)) { clearTimeout(timersRef.current.get(id)); timersRef.current.delete(id); }
    queueRef.current = queueRef.current.filter(t => t.id !== id);
    setToastQueue([...queueRef.current]);
    if (queueRef.current.length === 0) setToast(null);
  };
  
  if (showSaveConfirm) {
    return (
      <div className="fixed bottom-4 right-4 bg-gradient-to-r from-emerald-600 to-green-600 text-white px-5 py-3 rounded-xl shadow-2xl shadow-emerald-500/30 flex items-center gap-3 z-50 animate-slide-in">
        <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
          <Check className="w-4 h-4" />
        </div>
        <span className="font-medium">Saved!</span>
      </div>
    );
  }
  
  if (toastQueue.length === 0) return null;
  
  const config = {
    success: {
      bg: 'from-emerald-600 to-green-600',
      shadow: 'shadow-emerald-500/30',
      Icon: Check,
      iconBg: 'bg-white/20',
    },
    error: {
      bg: 'from-rose-600 to-red-600',
      shadow: 'shadow-rose-500/30',
      Icon: AlertTriangle,
      iconBg: 'bg-white/20',
    },
    warning: {
      bg: 'from-amber-500 to-orange-500',
      shadow: 'shadow-amber-500/30',
      Icon: AlertTriangle,
      iconBg: 'bg-white/20',
    },
    info: {
      bg: 'from-blue-600 to-cyan-600',
      shadow: 'shadow-blue-500/30',
      Icon: Info,
      iconBg: 'bg-white/20',
    },
  };
  
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end">
      {toastQueue.map((t, idx) => {
        const { bg, shadow, Icon, iconBg } = config[t.type] || config.success;
        return (
          <div 
            key={t.id}
            className={`px-4 py-3 rounded-xl shadow-2xl ${shadow} flex items-center gap-3 bg-gradient-to-r ${bg} text-white max-w-sm transition-all duration-200 animate-slide-in`}
            style={{ opacity: 1 - (toastQueue.length - 1 - idx) * 0.15 }}
          >
            <div className={`w-8 h-8 ${iconBg} rounded-lg flex items-center justify-center flex-shrink-0`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-medium block truncate">{t.message}</span>
              {t.submessage && (
                <span className="text-xs text-white/70 block truncate">{t.submessage}</span>
              )}
            </div>
            {t.action && (
              <button 
                onClick={() => {
                  t.action.onClick();
                  dismissToast(t.id);
                }}
                className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-all flex-shrink-0"
              >
                {t.action.label}
              </button>
            )}
            <button 
              onClick={() => dismissToast(t.id)}
              className="p-1 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

// Add keyframes for slide-in animation (include in your CSS)
// @keyframes slide-in { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
// .animate-slide-in { animation: slide-in 0.3s ease-out; }

export default Toast;
