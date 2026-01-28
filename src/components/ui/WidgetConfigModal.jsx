import React from 'react';
import { Layers, X, Eye, EyeOff, Move, ArrowUp, ArrowDown } from 'lucide-react';
import { WIDGET_KEY } from '../../utils/storage';

const WidgetConfigModal = ({
  editingWidgets,
  setEditingWidgets,
  widgetConfig,
  setWidgetConfig,
  DEFAULT_DASHBOARD_WIDGETS,
  draggedWidgetId,
  setDraggedWidgetId,
  dragOverWidgetId,
  setDragOverWidgetId
}) => {
  if (!editingWidgets) return null;
  
  // Get widgets from state, falling back to defaults if needed
  const widgets = (widgetConfig?.widgets && widgetConfig.widgets.length > 0) 
    ? widgetConfig.widgets 
    : DEFAULT_DASHBOARD_WIDGETS.widgets;
  
  const enabledWidgets = widgets.filter(w => w.enabled).sort((a, b) => (a.order || 0) - (b.order || 0));
  const disabledWidgets = widgets.filter(w => !w.enabled).sort((a, b) => (a.order || 0) - (b.order || 0));
  
  const toggleWidget = (widgetId) => {
    const newWidgets = widgets.map(w => 
      w.id === widgetId ? { ...w, enabled: !w.enabled } : { ...w }
    );
    setWidgetConfig({ widgets: newWidgets, layout: 'auto' });
  };
  
  const moveWidget = (widgetId, direction) => {
    const sortedWidgets = [...widgets].sort((a, b) => (a.order || 0) - (b.order || 0));
    const idx = sortedWidgets.findIndex(w => w.id === widgetId);
    if (idx === -1) return;
    
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= sortedWidgets.length) return;
    
    const tempOrder = sortedWidgets[idx].order;
    sortedWidgets[idx] = { ...sortedWidgets[idx], order: sortedWidgets[newIdx].order };
    sortedWidgets[newIdx] = { ...sortedWidgets[newIdx], order: tempOrder };
    
    setWidgetConfig({ widgets: sortedWidgets, layout: 'auto' });
  };
  
  // Drag and drop handlers
  const handleDragStart = (e, widgetId) => {
    setDraggedWidgetId(widgetId);
    e.dataTransfer.effectAllowed = 'move';
  };
  
  const handleDragOver = (e, widgetId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (widgetId !== draggedWidgetId) {
      setDragOverWidgetId(widgetId);
    }
  };
  
  const handleDragLeave = () => {
    setDragOverWidgetId(null);
  };
  
  const handleDrop = (e, targetWidgetId) => {
    e.preventDefault();
    if (!draggedWidgetId || draggedWidgetId === targetWidgetId) {
      setDraggedWidgetId(null);
      setDragOverWidgetId(null);
      return;
    }
    
    // Reorder widgets
    const sortedWidgets = [...widgets].sort((a, b) => (a.order || 0) - (b.order || 0));
    const draggedIdx = sortedWidgets.findIndex(w => w.id === draggedWidgetId);
    const targetIdx = sortedWidgets.findIndex(w => w.id === targetWidgetId);
    
    if (draggedIdx !== -1 && targetIdx !== -1) {
      // Remove dragged widget and insert at target position
      const [removed] = sortedWidgets.splice(draggedIdx, 1);
      sortedWidgets.splice(targetIdx, 0, removed);
      
      // Reassign order values
      const reorderedWidgets = sortedWidgets.map((w, i) => ({ ...w, order: i }));
      setWidgetConfig({ widgets: reorderedWidgets, layout: 'auto' });
    }
    
    setDraggedWidgetId(null);
    setDragOverWidgetId(null);
  };
  
  const handleDragEnd = () => {
    setDraggedWidgetId(null);
    setDragOverWidgetId(null);
  };
  
  const resetToDefaults = () => {
    localStorage.removeItem(WIDGET_KEY);
    setWidgetConfig(JSON.parse(JSON.stringify(DEFAULT_DASHBOARD_WIDGETS)));
  };
  
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-violet-400" />
              Customize Dashboard
            </h2>
            <p className="text-slate-400 text-sm mt-1">Show, hide, and reorder dashboard widgets</p>
          </div>
          <button onClick={() => setEditingWidgets(false)} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {/* Active Widgets */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Active Widgets ({enabledWidgets.length})
              <span className="text-slate-500 text-xs font-normal ml-2">Drag to reorder</span>
            </h3>
            <div className="space-y-2">
              {enabledWidgets.map((widget, idx) => (
                <div 
                  key={widget.id} 
                  draggable
                  onDragStart={(e) => handleDragStart(e, widget.id)}
                  onDragOver={(e) => handleDragOver(e, widget.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, widget.id)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-3 bg-slate-800/50 border rounded-xl p-3 cursor-grab active:cursor-grabbing transition-all ${
                    draggedWidgetId === widget.id ? 'opacity-50 border-violet-500' : 
                    dragOverWidgetId === widget.id ? 'border-violet-500 bg-violet-500/10' : 'border-slate-700'
                  }`}
                >
                  <Move className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <div className="flex flex-col gap-0.5">
                    <button 
                      onClick={() => moveWidget(widget.id, 'up')} 
                      disabled={idx === 0}
                      className="p-1 hover:bg-slate-700 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ArrowUp className="w-3 h-3 text-slate-400" />
                    </button>
                    <button 
                      onClick={() => moveWidget(widget.id, 'down')} 
                      disabled={idx === enabledWidgets.length - 1}
                      className="p-1 hover:bg-slate-700 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ArrowDown className="w-3 h-3 text-slate-400" />
                    </button>
                  </div>
                  <div className="flex-1">
                    <span className="text-white font-medium">{widget.name}</span>
                  </div>
                  <button 
                    onClick={() => toggleWidget(widget.id)}
                    className="p-2 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 rounded-lg text-rose-400"
                    title="Hide widget"
                  >
                    <EyeOff className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {enabledWidgets.length === 0 && (
                <p className="text-slate-500 text-sm italic">No widgets enabled. Add some from below!</p>
              )}
            </div>
          </div>
          
          {/* Hidden Widgets */}
          <div>
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              <EyeOff className="w-4 h-4" />
              Hidden Widgets ({disabledWidgets.length})
            </h3>
            {disabledWidgets.length > 0 ? (
              <div className="space-y-2">
                {disabledWidgets.map(widget => (
                  <div key={widget.id} className="flex items-center gap-3 bg-slate-800/30 border border-slate-700/50 rounded-xl p-3 opacity-60 hover:opacity-100 transition-opacity">
                    <div className="flex-1">
                      <span className="text-slate-300">{widget.name}</span>
                    </div>
                    <button 
                      onClick={() => toggleWidget(widget.id)}
                      className="p-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-lg text-emerald-400"
                      title="Show widget"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-sm italic">All widgets are currently visible</p>
            )}
          </div>
        </div>
        
        <div className="p-4 border-t border-slate-700 bg-slate-800/50 flex justify-between items-center">
          <button 
            onClick={resetToDefaults}
            className="px-4 py-2 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 rounded-lg text-rose-400 text-sm"
          >
            Reset to Defaults
          </button>
          <button onClick={() => setEditingWidgets(false)} className="px-6 py-2 bg-violet-600 hover:bg-violet-500 rounded-xl text-white font-medium">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default WidgetConfigModal;
