import React from 'react';
import { 
  ChevronDown, BarChart3, Upload, Database, TrendingUp, Boxes, 
  Settings, Sun, Calendar, CalendarRange, GitCompare, Trophy, 
  PieChart, Zap, Brain, Truck, Landmark, DollarSign
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
  const dataViews = ['daily', 'weekly', 'period-view'];
  const analyticsViews = ['trends', 'analytics', 'yoy', 'skus', 'profitability', 'ads'];
  const operationsViews = ['inventory', '3pl', 'banking', 'sales-tax', 'forecast'];
  
  const isDataActive = dataViews.includes(view);
  const isAnalyticsActive = analyticsViews.includes(view);
  const isOperationsActive = operationsViews.includes(view);
  
  // Dropdown component
  const NavDropdown = ({ label, icon: Icon, items, isActive, dropdownKey }) => {
    const isOpen = navDropdown === dropdownKey;
    
    return (
      <div className="relative">
        <button 
          onClick={() => setNavDropdown(isOpen ? null : dropdownKey)}
          className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1 ${isActive ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
        >
          <Icon className="w-4 h-4" />
          {label}
          <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && (
          <div className="absolute top-full left-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 z-50 min-w-[160px]">
            {items.map(item => (
              <button
                key={item.view}
                onClick={() => { item.onClick(); setNavDropdown(null); }}
                disabled={item.disabled}
                className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 disabled:opacity-40 ${view === item.view ? 'bg-violet-600/30 text-violet-300' : 'text-slate-300 hover:bg-slate-700'}`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
                {item.badge && <span className="ml-auto text-xs bg-amber-500/30 text-amber-300 px-1.5 rounded">{item.badge}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };
  
  // Data dropdown items
  const dataItems = [
    ...(appSettings.modulesEnabled?.dailyTracking !== false ? [{
      view: 'daily', label: 'Days', icon: Sun,
      disabled: !Object.keys(allDaysData).filter(k => hasDailySalesData(allDaysData[k])).length,
      onClick: () => { const d = Object.keys(allDaysData).filter(k => hasDailySalesData(allDaysData[k])).sort().reverse(); if (d.length) { setSelectedDay(d[0]); setView('daily'); }},
      badge: Object.keys(allDaysData).filter(k => hasDailySalesData(allDaysData[k])).length || null
    }] : []),
    ...(appSettings.modulesEnabled?.weeklyTracking !== false ? [{
      view: 'weekly', label: 'Weeks', icon: Calendar,
      disabled: !Object.keys(allWeeksData).length,
      onClick: () => { const w = Object.keys(allWeeksData).sort().reverse(); if (w.length) { setSelectedWeek(w[0]); setView('weekly'); }},
      badge: Object.keys(allWeeksData).length || null
    }] : []),
    ...(appSettings.modulesEnabled?.periodTracking !== false ? [{
      view: 'period-view', label: 'Periods', icon: CalendarRange,
      disabled: !Object.keys(allPeriodsData).length,
      onClick: () => { const p = Object.keys(allPeriodsData).sort().reverse(); if (p.length) { setSelectedPeriod(p[0]); setView('period-view'); }},
      badge: Object.keys(allPeriodsData).length || null
    }] : []),
  ];
  
  // Analytics dropdown items
  const analyticsItems = [
    ...(appSettings.modulesEnabled?.trends !== false ? [{
      view: 'trends', label: 'Trends', icon: TrendingUp,
      disabled: Object.keys(allWeeksData).length < 2,
      onClick: () => setView('trends'),
    }] : []),
    {
      view: 'analytics', label: 'Analytics', icon: BarChart3,
      disabled: Object.keys(allWeeksData).length < 1,
      onClick: () => setView('analytics'),
    },
    ...(appSettings.modulesEnabled?.yoy !== false ? [{
      view: 'yoy', label: 'Year over Year', icon: GitCompare,
      disabled: Object.keys(allWeeksData).length < 2 && Object.keys(allPeriodsData).length < 2,
      onClick: () => setView('yoy'),
    }] : []),
    ...(appSettings.modulesEnabled?.skus !== false ? [{
      view: 'skus', label: 'SKU Analysis', icon: Trophy,
      disabled: Object.keys(allWeeksData).length < 1 && Object.keys(allPeriodsData).length < 1,
      onClick: () => setView('skus'),
    }] : []),
    ...(appSettings.modulesEnabled?.profitability !== false ? [{
      view: 'profitability', label: 'Profitability', icon: PieChart,
      disabled: Object.keys(allWeeksData).length < 1 && Object.keys(allPeriodsData).length < 1,
      onClick: () => setView('profitability'),
    }] : []),
    ...(appSettings.modulesEnabled?.ads !== false ? [{
      view: 'ads', label: 'Ads & Marketing', icon: Zap,
      onClick: () => setView('ads'),
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
      view: 'forecast', label: 'Forecast', icon: Brain,
      disabled: false,
      onClick: () => setView('forecast'),
    },
    ...(appSettings.modulesEnabled?.threepl !== false ? [{
      view: '3pl', label: '3PL / Fulfillment', icon: Truck,
      disabled: Object.keys(allWeeksData).length < 1 && Object.keys(allPeriodsData).length < 1,
      onClick: () => setView('3pl'),
    }] : []),
    {
      view: 'banking', label: 'Banking', icon: Landmark,
      disabled: false,
      onClick: () => setView('banking'),
      badge: bankingData.lastUpload && new Date().toDateString() !== new Date(bankingData.lastUpload).toDateString() ? '!' : null
    },
    ...(appSettings.modulesEnabled?.salesTax !== false ? [{
      view: 'sales-tax', label: 'Sales Tax', icon: DollarSign,
      disabled: false,
      onClick: () => setView('sales-tax'),
    }] : []),
  ];
  
  return (
    <div className="flex flex-wrap gap-2 mb-6 p-1.5 bg-slate-800/50 rounded-xl relative" onClick={(e) => { if (e.target === e.currentTarget) setNavDropdown(null); }}>
      {/* Core Navigation - Always visible */}
      <button onClick={() => setView('dashboard')} className={`px-3 py-2 rounded-lg text-sm font-medium ${view === 'dashboard' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><BarChart3 className="w-4 h-4 inline mr-1" />Dashboard</button>
      <button onClick={() => setView('upload')} className={`px-3 py-2 rounded-lg text-sm font-medium ${view === 'upload' || view === 'period-upload' || view === 'inv-upload' ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><Upload className="w-4 h-4 inline mr-1" />Upload</button>
      
      <div className="w-px bg-slate-600 mx-1" />
      
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
      
      <div className="w-px bg-slate-600 mx-1" />
      
      {/* Settings - Always visible */}
      <button onClick={() => setView('settings')} className={`px-3 py-2 rounded-lg text-sm font-medium ${view === 'settings' ? 'bg-slate-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><Settings className="w-4 h-4 inline mr-1" />Settings</button>
    </div>
  );
};

export default NavTabs;
