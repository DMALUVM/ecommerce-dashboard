import React, { useEffect } from 'react';
import { Check, AlertTriangle, Trash2 } from 'lucide-react';

const Toast = ({ toast, setToast, showSaveConfirm }) => {
  useEffect(() => {
    if (toast) {
      // Longer timeout for warnings with undo actions
      const duration = toast.action ? 10000 : 3000;
      const timer = setTimeout(() => setToast(null), duration);
      return () => clearTimeout(timer);
    }
  }, [toast, setToast]);
  
  if (showSaveConfirm) {
    return <div className="fixed bottom-4 right-4 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50"><Check className="w-4 h-4" />Saved!</div>;
  }
  
  if (toast) {
    const bgColor = toast.type === 'error' ? 'bg-rose-600' : 
                    toast.type === 'warning' ? 'bg-amber-600' : 'bg-emerald-600';
    const Icon = toast.type === 'error' ? AlertTriangle : 
                 toast.type === 'warning' ? Trash2 : Check;
    
    return (
      <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50 ${bgColor} text-white`}>
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span>{toast.message}</span>
        {toast.action && (
          <button 
            onClick={() => {
              toast.action.onClick();
              setToast(null);
            }}
            className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
          >
            {toast.action.label}
          </button>
        )}
      </div>
    );
  }
  
  return null;
};

export default Toast;
