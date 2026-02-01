import React, { useState, useMemo } from 'react';
import { FileDown, X, Calendar, Package, Boxes, Database, Download, CalendarRange, ChevronDown } from 'lucide-react';

const ExportModal = ({ 
  showExportModal, 
  setShowExportModal, 
  exportWeeklyDataCSV, 
  exportSKUDataCSV, 
  exportInventoryCSV, 
  exportAll,
  invHistory,
  allWeeksData,
  allDaysData,
}) => {
  // Date range state
  const [dateRangeType, setDateRangeType] = useState('all'); // 'all', 'preset', 'custom'
  const [preset, setPreset] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showPresets, setShowPresets] = useState(false);
  
  // Calculate available date range from data
  const dataDateRange = useMemo(() => {
    const weekDates = Object.keys(allWeeksData || {}).sort();
    const dayDates = Object.keys(allDaysData || {}).filter(k => k.match(/^\d{4}-\d{2}-\d{2}$/)).sort();
    const invDates = Object.keys(invHistory || {}).sort();
    
    const allDates = [...weekDates, ...dayDates, ...invDates].sort();
    return {
      earliest: allDates[0] || new Date().toISOString().split('T')[0],
      latest: allDates[allDates.length - 1] || new Date().toISOString().split('T')[0],
    };
  }, [allWeeksData, allDaysData, invHistory]);
  
  // Calculate date range based on selection
  const getDateRange = () => {
    const today = new Date();
    
    // Helper to format date as YYYY-MM-DD in local timezone (not UTC)
    const formatLocalDate = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    const todayStr = formatLocalDate(today);
    
    if (dateRangeType === 'all') {
      return { start: dataDateRange.earliest, end: dataDateRange.latest };
    }
    
    if (dateRangeType === 'custom') {
      return { start: startDate || dataDateRange.earliest, end: endDate || todayStr };
    }
    
    // Presets - get Monday of a given week (without mutating input)
    const getWeekStart = (date) => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
      d.setDate(diff);
      return d;
    };
    
    // Get Sunday of a given week
    const getWeekEnd = (date) => {
      const monday = getWeekStart(date);
      monday.setDate(monday.getDate() + 6); // Sunday
      return monday;
    };
    
    switch (preset) {
      case 'thisWeek': {
        const weekStart = getWeekStart(new Date());
        return { start: formatLocalDate(weekStart), end: todayStr };
      }
      case 'lastWeek': {
        // Last week = the full Mon-Sun week before the current week
        const thisWeekStart = getWeekStart(new Date());
        const lastWeekEnd = new Date(thisWeekStart);
        lastWeekEnd.setDate(lastWeekEnd.getDate() - 1); // Sunday of last week
        const lastWeekStart = new Date(lastWeekEnd);
        lastWeekStart.setDate(lastWeekStart.getDate() - 6); // Monday of last week
        return { start: formatLocalDate(lastWeekStart), end: formatLocalDate(lastWeekEnd) };
      }
      case 'thisMonth': {
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        return { start: formatLocalDate(monthStart), end: todayStr };
      }
      case 'lastMonth': {
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        return { start: formatLocalDate(lastMonthStart), end: formatLocalDate(lastMonthEnd) };
      }
      case 'last30': {
        const thirtyAgo = new Date(today);
        thirtyAgo.setDate(thirtyAgo.getDate() - 30);
        return { start: formatLocalDate(thirtyAgo), end: todayStr };
      }
      case 'last90': {
        const ninetyAgo = new Date(today);
        ninetyAgo.setDate(ninetyAgo.getDate() - 90);
        return { start: formatLocalDate(ninetyAgo), end: todayStr };
      }
      case 'thisQuarter': {
        const quarter = Math.floor(today.getMonth() / 3);
        const quarterStart = new Date(today.getFullYear(), quarter * 3, 1);
        return { start: formatLocalDate(quarterStart), end: todayStr };
      }
      case 'thisYear': {
        const yearStart = new Date(today.getFullYear(), 0, 1);
        return { start: formatLocalDate(yearStart), end: todayStr };
      }
      case 'lastYear': {
        const lastYearStart = new Date(today.getFullYear() - 1, 0, 1);
        const lastYearEnd = new Date(today.getFullYear() - 1, 11, 31);
        return { start: formatLocalDate(lastYearStart), end: formatLocalDate(lastYearEnd) };
      }
      default:
        return { start: dataDateRange.earliest, end: dataDateRange.latest };
    }
  };
  
  const dateRange = getDateRange();
  
  const presetLabels = {
    all: 'All Time',
    thisWeek: 'This Week',
    lastWeek: 'Last Week',
    thisMonth: 'This Month',
    lastMonth: 'Last Month',
    last30: 'Last 30 Days',
    last90: 'Last 90 Days',
    thisQuarter: 'This Quarter',
    thisYear: 'This Year',
    lastYear: 'Last Year',
  };
  
  const handlePresetSelect = (p) => {
    if (p === 'all') {
      setDateRangeType('all');
    } else {
      setDateRangeType('preset');
      setPreset(p);
    }
    setShowPresets(false);
  };
  
  const handleExportWeekly = () => {
    exportWeeklyDataCSV(dateRange);
    setShowExportModal(false);
  };
  
  const handleExportSKU = () => {
    exportSKUDataCSV(dateRange);
    setShowExportModal(false);
  };
  
  const handleExportInventory = () => {
    exportInventoryCSV(dateRange);
    setShowExportModal(false);
  };
  
  const handleExportAllCSVs = () => {
    // Export all 3 CSVs with slight delay to avoid browser blocking
    exportWeeklyDataCSV(dateRange);
    setTimeout(() => exportSKUDataCSV(dateRange), 300);
    setTimeout(() => exportInventoryCSV(dateRange), 600);
    setShowExportModal(false);
  };
  
  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };
  
  if (!showExportModal) return null;
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FileDown className="w-6 h-6 text-emerald-400" />
            Export Data
          </h2>
          <button onClick={() => setShowExportModal(false)} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Date Range Selector */}
        <div className="mb-6 p-4 bg-slate-900/50 rounded-xl border border-slate-700">
          <div className="flex items-center gap-2 mb-3">
            <CalendarRange className="w-5 h-5 text-cyan-400" />
            <span className="text-white font-medium">Date Range</span>
          </div>
          
          {/* Quick Presets Dropdown */}
          <div className="relative mb-3">
            <button 
              onClick={() => setShowPresets(!showPresets)}
              className="w-full p-3 bg-slate-800 border border-slate-600 rounded-lg text-left flex items-center justify-between hover:border-slate-500"
            >
              <span className="text-white">
                {dateRangeType === 'all' ? 'All Time' : 
                 dateRangeType === 'custom' ? 'Custom Range' : 
                 presetLabels[preset]}
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showPresets ? 'rotate-180' : ''}`} />
            </button>
            
            {showPresets && (
              <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden">
                {Object.entries(presetLabels).map(([key, label]) => (
                  <button 
                    key={key}
                    onClick={() => handlePresetSelect(key)}
                    className={`w-full px-4 py-2 text-left hover:bg-slate-700 ${
                      (dateRangeType === 'all' && key === 'all') || (dateRangeType === 'preset' && preset === key) 
                        ? 'bg-cyan-900/30 text-cyan-400' 
                        : 'text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <button 
                  onClick={() => { setDateRangeType('custom'); setShowPresets(false); }}
                  className={`w-full px-4 py-2 text-left hover:bg-slate-700 border-t border-slate-700 ${
                    dateRangeType === 'custom' ? 'bg-cyan-900/30 text-cyan-400' : 'text-white'
                  }`}
                >
                  Custom Range...
                </button>
              </div>
            )}
          </div>
          
          {/* Custom Date Inputs */}
          {dateRangeType === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Start Date</label>
                <input 
                  type="date" 
                  value={startDate || dataDateRange.earliest}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full p-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">End Date</label>
                <input 
                  type="date" 
                  value={endDate || new Date().toISOString().split('T')[0]}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full p-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm"
                />
              </div>
            </div>
          )}
          
          {/* Selected Range Display */}
          <div className="mt-3 text-sm text-slate-400 text-center">
            {formatDateDisplay(dateRange.start)} → {formatDateDisplay(dateRange.end)}
          </div>
        </div>
        
        {/* Export Buttons */}
        <div className="space-y-3">
          <button onClick={handleExportWeekly}
            className="w-full p-4 bg-slate-900/50 hover:bg-slate-700 border border-slate-600 rounded-xl text-left flex items-center gap-3 transition-colors">
            <Calendar className="w-6 h-6 text-violet-400" />
            <div className="flex-1">
              <p className="text-white font-medium">Weekly Sales Data</p>
              <p className="text-slate-400 text-sm">Revenue, profit, units by week</p>
            </div>
          </button>
          
          <button onClick={handleExportSKU}
            className="w-full p-4 bg-slate-900/50 hover:bg-slate-700 border border-slate-600 rounded-xl text-left flex items-center gap-3 transition-colors">
            <Package className="w-6 h-6 text-pink-400" />
            <div className="flex-1">
              <p className="text-white font-medium">SKU Performance</p>
              <p className="text-slate-400 text-sm">All SKUs with totals and averages</p>
            </div>
          </button>
          
          <button onClick={handleExportInventory}
            disabled={Object.keys(invHistory || {}).length === 0}
            className="w-full p-4 bg-slate-900/50 hover:bg-slate-700 border border-slate-600 rounded-xl text-left flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            <Boxes className="w-6 h-6 text-amber-400" />
            <div className="flex-1">
              <p className="text-white font-medium">Inventory Snapshot</p>
              <p className="text-slate-400 text-sm">Current inventory with values</p>
            </div>
          </button>
          
          {/* Export All CSVs Button */}
          <div className="pt-3 border-t border-slate-700">
            <button onClick={handleExportAllCSVs}
              className="w-full p-4 bg-emerald-900/30 hover:bg-emerald-800/40 border border-emerald-500/50 rounded-xl text-left flex items-center gap-3 transition-colors">
              <Download className="w-6 h-6 text-emerald-400" />
              <div className="flex-1">
                <p className="text-emerald-400 font-medium">Export All CSVs</p>
                <p className="text-slate-400 text-sm">Download all 3 reports at once</p>
              </div>
            </button>
          </div>
          
          {/* Full Backup */}
          <div className="pt-3 border-t border-slate-700">
            <button onClick={() => { exportAll(); setShowExportModal(false); }}
              className="w-full p-4 bg-slate-900/50 hover:bg-slate-700 border border-slate-600 rounded-xl text-left flex items-center gap-3 transition-colors">
              <Database className="w-6 h-6 text-slate-400" />
              <div className="flex-1">
                <p className="text-white font-medium">Full Backup (JSON)</p>
                <p className="text-slate-400 text-sm">Complete data backup for restore</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
