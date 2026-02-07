import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  BarChart3, Boxes, Brain, Calendar, ChevronRight, Command, DollarSign, FileText,
  GitCompare, Home, Keyboard, Landmark, LineChart, MessageSquare, Package,
  PieChart, Search, Settings, ShoppingCart, TrendingUp, Truck, Upload, X, Zap
} from 'lucide-react';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: Home, shortcut: '1' },
  { id: 'upload', label: 'Upload Data', icon: Upload, shortcut: '2' },
  { id: 'daily', label: 'Daily View', icon: Calendar },
  { id: 'weekly', label: 'Weekly View', icon: Calendar },
  { id: 'trends', label: 'Trends & Analytics', icon: TrendingUp },
  { id: 'profitability', label: 'Profitability & P&L', icon: PieChart },
  { id: 'skus', label: 'SKU Rankings', icon: ShoppingCart },
  { id: 'yoy', label: 'Year-over-Year', icon: GitCompare },
  { id: 'ads', label: 'Advertising', icon: Zap },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: '3pl', label: '3PL Fulfillment', icon: Truck },
  { id: 'forecast', label: 'Forecasting', icon: Brain },
  { id: 'banking', label: 'Banking', icon: Landmark },
  { id: 'sales-tax', label: 'Sales Tax', icon: DollarSign },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const KeyboardShortcuts = ({ setView, exportAll, setShowAdsAIChat, setToast }) => {
  const [showPalette, setShowPalette] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef(null);

  const filtered = useMemo(() => {
    if (!search) return navItems;
    const q = search.toLowerCase();
    return navItems.filter(item =>
      item.label.toLowerCase().includes(q) || item.id.includes(q)
    );
  }, [search]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [search]);

  const closePalette = useCallback(() => {
    setShowPalette(false);
    setSearch('');
    setSelectedIdx(0);
  }, []);

  const executeItem = useCallback((item) => {
    setView(item.id);
    closePalette();
  }, [setView, closePalette]);

  // Global keyboard handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const tag = e.target.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;

      // ⌘K / Ctrl+K — Command palette
      if (mod && e.key === 'k') {
        e.preventDefault();
        setShowPalette(prev => !prev);
        setSearch('');
        setSelectedIdx(0);
        return;
      }

      // ⌘E / Ctrl+E — Export backup
      if (mod && e.key === 'e' && !e.shiftKey) {
        e.preventDefault();
        if (exportAll) exportAll();
        return;
      }

      // ⌘/ / Ctrl+/ — AI Chat
      if (mod && e.key === '/') {
        e.preventDefault();
        if (setShowAdsAIChat) setShowAdsAIChat(prev => !prev);
        return;
      }

      // Don't intercept typing in inputs
      if (isInput) return;

      // ? — Show shortcut help
      if (e.key === '?' && !mod) {
        e.preventDefault();
        setToast({ 
          message: '⌘K Navigate • ⌘E Export • ⌘/ AI Chat • Esc Close', 
          type: 'info',
          duration: 4000
        });
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [exportAll, setShowAdsAIChat, setToast]);

  // Palette keyboard navigation
  useEffect(() => {
    if (!showPalette) return;

    const handlePaletteKeys = (e) => {
      if (e.key === 'Escape') {
        closePalette();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(prev => Math.min(prev + 1, filtered.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(prev => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' && filtered[selectedIdx]) {
        e.preventDefault();
        executeItem(filtered[selectedIdx]);
        return;
      }
    };

    document.addEventListener('keydown', handlePaletteKeys);
    return () => document.removeEventListener('keydown', handlePaletteKeys);
  }, [showPalette, filtered, selectedIdx, closePalette, executeItem]);

  // Auto-focus input
  useEffect(() => {
    if (showPalette && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [showPalette]);

  if (!showPalette) return null;

  const isMac = typeof navigator !== 'undefined' && navigator.platform?.toUpperCase().includes('MAC');
  const modKey = isMac ? '⌘' : 'Ctrl';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999]" onClick={closePalette} />
      
      {/* Palette */}
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg z-[1000]">
        <div className="bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700">
            <Search className="w-5 h-5 text-slate-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Navigate to..."
              className="flex-1 bg-transparent text-white outline-none placeholder-slate-500 text-sm"
            />
            <kbd className="hidden sm:inline px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-400 font-mono">esc</kbd>
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-slate-500 text-sm">No matching views</div>
            ) : (
              filtered.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => executeItem(item)}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      idx === selectedIdx ? 'bg-violet-600/30 text-white' : 'text-slate-300 hover:bg-slate-700/50'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 text-sm">{item.label}</span>
                    {item.shortcut && (
                      <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-xs text-slate-500 font-mono">{item.shortcut}</kbd>
                    )}
                    <ChevronRight className={`w-3 h-3 ${idx === selectedIdx ? 'text-violet-400' : 'text-slate-600'}`} />
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-slate-700 flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><kbd className="px-1 bg-slate-700 rounded font-mono">↑↓</kbd> Navigate</span>
            <span className="flex items-center gap-1"><kbd className="px-1 bg-slate-700 rounded font-mono">↵</kbd> Open</span>
            <span className="flex items-center gap-1"><kbd className="px-1 bg-slate-700 rounded font-mono">{modKey}E</kbd> Export</span>
            <span className="flex items-center gap-1"><kbd className="px-1 bg-slate-700 rounded font-mono">{modKey}/</kbd> AI Chat</span>
          </div>
        </div>
      </div>
    </>
  );
};

export default KeyboardShortcuts;
