import React, { useEffect, useRef } from 'react';
import { 
  ChevronDown, BarChart3, Upload, Database, TrendingUp, Boxes, 
  Settings, Sun, Calendar, CalendarRange, GitCompare, Trophy, 
  PieChart, Zap, Brain, Truck, Landmark, DollarSign, CheckSquare
} from 'lucide-react';

const NavTabs = ({
  view,
  setView,
  navDropdown,
  setNavDropdown,
  appSettings,
  allDaysData,
  allWeeksData,
  allPeriodsData,
  hasDailySalesData,
  setSelectedDay,
  setSelectedWeek,
  setSelectedPeriod,
  invHistory,
  setSelectedInvDate,
  setUploadTab,
  bankingData
}) => {
  const navRef = useRef(null);
  
  // Close dropdown on outside click (works on mobile too)
  useEffect(() => {
    if (!navDropdown) return;
    const handleClickOutside = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setNavDropdown(null);
      }
    };
    // Use mousedown for desktop, touchstart for mobile
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [navDropdown, setNavDropdown]);
  
  const dataViews = ['daily', 'weekly', 'period-view'];
  const analyticsViews = ['trends', 'yoy', 'skus', 'profitability', 'ads'];
  const operationsViews = ['inventory', '3pl', 'banking', 'sales-tax', 'forecast'];
  
  const isDataActive = dataViews.includes(view);
  const isAnalyticsActive = analyticsViews.includes(view);
  const isOperationsActive = operationsViews.includes(view);
  
  // Dropdown component
  const NavDropdown = ({ label, icon: Icon, items, isActive, dropdownKey }) => {
    const isOpen = navDropdown === dropdownKey;
    
    return (
      <div className="relative flex-shrink-0">
        <button 
          onClick={() => setNavDropdown(isOpen ? null : dropdownKey)}
          className={`px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-all whitespace-nowrap ${isActive ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/20' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
        >
          <Icon className="w-4 h-4" />
          <span className="hidden sm:inline">{label}</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && (
          <div className="absolute top-full left-0 sm:left-0 mt-2 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl py-1.5 z-50 min-w-[200px] max-w-[calc(100vw-32px)]">
            {items.map((item, index) => (
              <React.Fragment key={item.view}>
                {item.divider && index > 0 && <div className="border-t border-slate-700 my-1.5" />}
                <button
                  onClick={() => { item.onClick(); setNavDropdown(null); }}
                  disabled={item.disabled}
                  className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2.5 disabled:opacity-40 transition-all ${view === item.view ? 'bg-violet-600/20 text-violet-300' : 'text-slate-300 hover:bg-slate-700/70'}`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                  {item.badge && <span className="ml-auto text-xs bg-violet-500/30 text-violet-300 px-2 py-0.5 rounded-full">{item.badge}</span>}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    );
  };
  
  // Data dropdown items
  const dataItems = [
    ...(appSettings.modulesEnabled?.dailyTracking !== false ? [{
      view: 'daily', label: 'Daily View', icon: Sun,
      disabled: !Object.keys(allDaysData).filter(k => hasDailySalesData(allDaysData[k])).length,
      onClick: () => { const d = Object.keys(allDaysData).filter(k => hasDailySalesData(allDaysData[k])).sort().reverse(); if (d.length) { setSelectedDay(d[0]); setView('daily'); }},
      badge: Object.keys(allDaysData).filter(k => hasDailySalesData(allDaysData[k])).length || null
    }] : []),
    ...(appSettings.modulesEnabled?.weeklyTracking !== false ? [{
      view: 'weekly', label: 'Weekly View', icon: Calendar,
      disabled: !Object.keys(allWeeksData).length,
      onClick: () => { const w = Object.keys(allWeeksData).sort().reverse(); if (w.length) { setSelectedWeek(w[0]); setView('weekly'); }},
      badge: Object.keys(allWeeksData).length || null
    }] : []),
    ...(appSettings.modulesEnabled?.periodTracking !== false ? [{
      view: 'period-view', label: 'Period View', icon: CalendarRange,
      disabled: !Object.keys(allPeriodsData).length,
      onClick: () => { const p = Object.keys(allPeriodsData).sort().reverse(); if (p.length) { setSelectedPeriod(p[0]); setView('period-view'); }},
      badge: Object.keys(allPeriodsData).length || null
    }] : []),
  ];
  
  // Analytics dropdown items - reorganized and cleaner
  const analyticsItems = [
    // Time-based analysis
    ...(appSettings.modulesEnabled?.trends !== false ? [{
      view: 'trends', label: 'Trends & Charts', icon: TrendingUp,
      disabled: Object.keys(allWeeksData).length < 2,
      onClick: () => setView('trends'),
    }] : []),
    ...(appSettings.modulesEnabled?.yoy !== false ? [{
      view: 'yoy', label: 'Year over Year', icon: GitCompare,
      disabled: Object.keys(allWeeksData).length < 2 && Object.keys(allPeriodsData).length < 2,
      onClick: () => setView('yoy'),
    }] : []),
    // Product & profit analysis (with divider)
    ...(appSettings.modulesEnabled?.profitability !== false ? [{
      view: 'profitability', label: '💰 Profitability & P&L', icon: PieChart,
      disabled: Object.keys(allWeeksData).length < 1 && Object.keys(allPeriodsData).length < 1,
      onClick: () => setView('profitability'),
      divider: true,
    }] : []),
    ...(appSettings.modulesEnabled?.skus !== false ? [{
      view: 'skus', label: 'SKU Performance', icon: Trophy,
      disabled: Object.keys(allWeeksData).length < 1 && Object.keys(allPeriodsData).length < 1,
      onClick: () => setView('skus'),
    }] : []),
    // Marketing (with divider)
    ...(appSettings.modulesEnabled?.ads !== false ? [{
      view: 'ads', label: 'Ads & Marketing', icon: Zap,
      onClick: () => setView('ads'),
      divider: true,
    }] : []),
  ];
  
  // Operations dropdown items
  const operationsItems = [
    ...(appSettings.modulesEnabled?.inventory !== false ? [{
      view: 'inventory', label: 'Inventory', icon: Boxes,
      disabled: false,
      onClick: () => { if (Object.keys(invHistory).length) { const d = Object.keys(invHistory).sort().reverse()[0]; setSelectedInvDate(d); setView('inventory'); } else { setUploadTab('inventory'); setView('upload'); }},
    }] : []),
    {
      view: 'forecast', label: 'Forecasting', icon: Brain,
      disabled: false,
      onClick: () => setView('forecast'),
    },
    ...(appSettings.modulesEnabled?.threepl !== false ? [{
      view: '3pl', label: '3PL Costs', icon: Truck,
      disabled: Object.keys(allWeeksData).length < 1 && Object.keys(allPeriodsData).length < 1,
      onClick: () => setView('3pl'),
    }] : []),
    {
      view: 'banking', label: 'Banking', icon: Landmark,
      disabled: false,
      onClick: () => setView('banking'),
      divider: true,
    },
    ...(appSettings.modulesEnabled?.salesTax !== false ? [{
      view: 'sales-tax', label: 'Sales Tax', icon: DollarSign,
      disabled: false,
      onClick: () => setView('sales-tax'),
    }] : []),
  ];
  
  return (
    <div ref={navRef} className="flex items-center gap-1 sm:gap-2 mb-4 sm:mb-6 p-1.5 bg-slate-800/50 rounded-xl relative overflow-x-auto scrollbar-hide">
      {/* Core Navigation - Always visible */}
      <button onClick={() => setView('dashboard')} className={`px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0 ${view === 'dashboard' ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}><BarChart3 className="w-4 h-4" /><span className="hidden sm:inline">Dashboard</span></button>
      <button onClick={() => setView('upload')} className={`px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0 ${view === 'upload' || view === 'period-upload' || view === 'inv-upload' ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/20' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}><Upload className="w-4 h-4" /><span className="hidden sm:inline">Upload</span></button>
      
      <div className="w-px bg-slate-600 mx-0.5 sm:mx-1 h-6 flex-shrink-0" />
      
      {/* Data Views Dropdown */}
      {dataItems.length > 0 && (
        <NavDropdown 
          label="Data" 
          icon={Database} 
          items={dataItems}
          isActive={isDataActive}
          dropdownKey="data"
        />
      )}
      
      {/* Analytics Dropdown */}
      {analyticsItems.length > 0 && (
        <NavDropdown 
          label="Analytics" 
          icon={TrendingUp} 
          items={analyticsItems}
          isActive={isAnalyticsActive}
          dropdownKey="analytics"
        />
      )}
      
      {/* Operations Dropdown */}
      {operationsItems.length > 0 && (
        <NavDropdown 
          label="Operations" 
          icon={Boxes} 
          items={operationsItems}
          isActive={isOperationsActive}
          dropdownKey="operations"
        />
      )}
      
      <div className="w-px bg-slate-600 mx-0.5 sm:mx-1 h-6 flex-shrink-0" />
      
      {/* Reports & Actions */}
      <button onClick={() => setView('reports')} className={`px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0 ${view === 'reports' ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg shadow-amber-500/20' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}><CheckSquare className="w-4 h-4" /><span className="hidden sm:inline">Actions</span></button>
      
      {/* Settings */}
      <button onClick={() => setView('settings')} className={`px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0 ${view === 'settings' ? 'bg-gradient-to-r from-slate-600 to-slate-500 text-white shadow-lg shadow-slate-500/20' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}><Settings className="w-4 h-4" /><span className="hidden sm:inline">Settings</span></button>
    </div>
  );
};

export default NavTabs;
