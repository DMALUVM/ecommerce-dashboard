import React, { useEffect, useState } from 'react';
import { Check, AlertTriangle, Trash2, X, Info } from 'lucide-react';

const Toast = ({ toast, setToast, showSaveConfirm }) => {
  const [isExiting, setIsExiting] = useState(false);
  
  useEffect(() => {
    if (toast) {
      setIsExiting(false);
      const duration = toast.action ? 10000 : 3000;
      const timer = setTimeout(() => {
        setIsExiting(true);
        setTimeout(() => setToast(null), 200); // Wait for exit animation
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [toast, setToast]);
  
  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => setToast(null), 200);
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
  
  if (toast) {
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
    
    const { bg, shadow, Icon, iconBg } = config[toast.type] || config.success;
    
    return (
      <div 
        className={`fixed bottom-4 right-4 px-4 py-3 rounded-xl shadow-2xl ${shadow} flex items-center gap-3 z-50 bg-gradient-to-r ${bg} text-white max-w-sm transition-all duration-200 ${
          isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0 animate-slide-in'
        }`}
      >
        <div className={`w-8 h-8 ${iconBg} rounded-lg flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-medium block truncate">{toast.message}</span>
          {toast.submessage && (
            <span className="text-xs text-white/70 block truncate">{toast.submessage}</span>
          )}
        </div>
        {toast.action && (
          <button 
            onClick={() => {
              toast.action.onClick();
              handleDismiss();
            }}
            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-all flex-shrink-0"
          >
            {toast.action.label}
          </button>
        )}
        <button 
          onClick={handleDismiss}
          className="p-1 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }
  
  return null;
};

// Add keyframes for slide-in animation (include in your CSS)
// @keyframes slide-in { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
// .animate-slide-in { animation: slide-in 0.3s ease-out; }

export default Toast;
