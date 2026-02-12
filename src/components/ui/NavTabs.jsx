import React, { useEffect, useMemo, useRef } from 'react';
import { 
  ChevronDown, BarChart3, Upload, Database, TrendingUp, Boxes, 
  Settings, Sun, Calendar, CalendarRange, GitCompare, Trophy, 
  PieChart, Zap, Brain, Truck, Landmark, DollarSign, CheckSquare
} from 'lucide-react';

const DATA_VIEWS = ['daily', 'weekly', 'period-view'];
const ANALYTICS_VIEWS = ['trends', 'yoy', 'skus', 'profitability', 'ads'];
const OPERATIONS_VIEWS = ['inventory', '3pl', 'banking', 'sales-tax', 'forecast'];

const baseButtonClasses = 'px-3 sm:px-4 py-2.5 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0 min-h-11';
const inactiveButtonClasses = 'text-slate-300 hover:bg-slate-700 hover:text-white';

const NavDropdown = ({ label, icon, items, isActive, isOpen, onToggle, onClose, activeView }) => {
  const DropdownIcon = icon;

  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`${label} navigation`}
        className={`${baseButtonClasses} ${isActive ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/20' : inactiveButtonClasses}`}
      >
        <DropdownIcon className="w-4 h-4" />
        <span>{label}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl py-1.5 z-50 min-w-[220px] max-w-[min(92vw,320px)]">
          {items.map((item, index) => (
            <React.Fragment key={item.view}>
              {item.divider && index > 0 && <div className="border-t border-slate-700 my-1.5" />}
              <button
                onClick={() => { item.onClick(); onClose(); }}
                disabled={item.disabled}
                className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2.5 disabled:opacity-40 transition-all ${activeView === item.view ? 'bg-violet-600/20 text-violet-300' : 'text-slate-300 hover:bg-slate-700/70'}`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
                {item.badge ? <span className="ml-auto text-xs bg-violet-500/30 text-violet-300 px-2 py-0.5 rounded-full">{item.badge}</span> : null}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};

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
  setUploadTab
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

  const dailyKeys = useMemo(
    () => Object.keys(allDaysData).filter((k) => hasDailySalesData(allDaysData[k])).sort().reverse(),
    [allDaysData, hasDailySalesData],
  );
  const weeklyKeys = useMemo(() => Object.keys(allWeeksData).sort().reverse(), [allWeeksData]);
  const periodKeys = useMemo(() => Object.keys(allPeriodsData).sort().reverse(), [allPeriodsData]);
  const inventoryKeys = useMemo(() => Object.keys(invHistory).sort().reverse(), [invHistory]);

  const isDataActive = DATA_VIEWS.includes(view);
  const isAnalyticsActive = ANALYTICS_VIEWS.includes(view);
  const isOperationsActive = OPERATIONS_VIEWS.includes(view);

  // Data dropdown items
  const dataItems = [
    ...(appSettings.modulesEnabled?.dailyTracking !== false ? [{
      view: 'daily', label: 'Daily View', icon: Sun,
      disabled: !dailyKeys.length,
      onClick: () => {
        if (dailyKeys.length) {
          setSelectedDay(dailyKeys[0]);
          setView('daily');
        }
      },
      badge: dailyKeys.length || null
    }] : []),
    ...(appSettings.modulesEnabled?.weeklyTracking !== false ? [{
      view: 'weekly', label: 'Weekly View', icon: Calendar,
      disabled: !weeklyKeys.length,
      onClick: () => {
        if (weeklyKeys.length) {
          setSelectedWeek(weeklyKeys[0]);
          setView('weekly');
        }
      },
      badge: weeklyKeys.length || null
    }] : []),
    ...(appSettings.modulesEnabled?.periodTracking !== false ? [{
      view: 'period-view', label: 'Period View', icon: CalendarRange,
      disabled: !periodKeys.length,
      onClick: () => {
        if (periodKeys.length) {
          setSelectedPeriod(periodKeys[0]);
          setView('period-view');
        }
      },
      badge: periodKeys.length || null
    }] : []),
  ];

  // Analytics dropdown items
  const analyticsItems = [
    ...(appSettings.modulesEnabled?.trends !== false ? [{
      view: 'trends', label: 'Trends & Charts', icon: TrendingUp,
      disabled: weeklyKeys.length < 2,
      onClick: () => setView('trends'),
    }] : []),
    ...(appSettings.modulesEnabled?.yoy !== false ? [{
      view: 'yoy', label: 'Year over Year', icon: GitCompare,
      disabled: weeklyKeys.length < 2 && periodKeys.length < 2,
      onClick: () => setView('yoy'),
    }] : []),
    ...(appSettings.modulesEnabled?.profitability !== false ? [{
      view: 'profitability', label: 'Profitability & P&L', icon: PieChart,
      disabled: weeklyKeys.length < 1 && periodKeys.length < 1,
      onClick: () => setView('profitability'),
      divider: true,
    }] : []),
    ...(appSettings.modulesEnabled?.skus !== false ? [{
      view: 'skus', label: 'SKU Performance', icon: Trophy,
      disabled: weeklyKeys.length < 1 && periodKeys.length < 1,
      onClick: () => setView('skus'),
    }] : []),
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
      onClick: () => {
        if (inventoryKeys.length) {
          setSelectedInvDate(inventoryKeys[0]);
          setView('inventory');
        } else {
          setUploadTab('inventory');
          setView('upload');
        }
      },
    }] : []),
    {
      view: 'forecast', label: 'Forecasting', icon: Brain,
      disabled: false,
      onClick: () => setView('forecast'),
    },
    ...(appSettings.modulesEnabled?.threepl !== false ? [{
      view: '3pl', label: '3PL Costs', icon: Truck,
      disabled: weeklyKeys.length < 1 && periodKeys.length < 1,
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
    <div ref={navRef} className="sticky top-[max(0.5rem,env(safe-area-inset-top))] z-30">
      <div className={`flex items-center gap-1 sm:gap-2 mb-4 sm:mb-6 p-1.5 bg-slate-900/85 border border-slate-700/80 rounded-xl backdrop-blur-sm relative scroll-px-2 ${navDropdown ? '' : 'overflow-x-auto scrollbar-hide snap-x pr-2'}`}>
        {/* Core Navigation - Always visible */}
        <button onClick={() => setView('dashboard')} className={`${baseButtonClasses} snap-start ${view === 'dashboard' ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-lg shadow-emerald-500/20' : inactiveButtonClasses}`}><BarChart3 className="w-4 h-4" /><span>Home</span></button>
        <button onClick={() => setView('upload')} className={`${baseButtonClasses} snap-start ${view === 'upload' || view === 'period-upload' || view === 'inv-upload' ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/20' : inactiveButtonClasses}`}><Upload className="w-4 h-4" /><span>Upload</span></button>

        <div className="w-px bg-slate-600 mx-0.5 sm:mx-1 h-6 flex-shrink-0" />

        {/* Data Views Dropdown */}
        {dataItems.length > 0 && (
          <NavDropdown
            label="Data"
            icon={Database}
            items={dataItems}
            isActive={isDataActive}
            isOpen={navDropdown === 'data'}
            onToggle={() => setNavDropdown(navDropdown === 'data' ? null : 'data')}
            onClose={() => setNavDropdown(null)}
            activeView={view}
          />
        )}

        {/* Analytics Dropdown */}
        {analyticsItems.length > 0 && (
          <NavDropdown
            label="Analytics"
            icon={TrendingUp}
            items={analyticsItems}
            isActive={isAnalyticsActive}
            isOpen={navDropdown === 'analytics'}
            onToggle={() => setNavDropdown(navDropdown === 'analytics' ? null : 'analytics')}
            onClose={() => setNavDropdown(null)}
            activeView={view}
          />
        )}

        {/* Operations Dropdown */}
        {operationsItems.length > 0 && (
          <NavDropdown
            label="Operations"
            icon={Boxes}
            items={operationsItems}
            isActive={isOperationsActive}
            isOpen={navDropdown === 'operations'}
            onToggle={() => setNavDropdown(navDropdown === 'operations' ? null : 'operations')}
            onClose={() => setNavDropdown(null)}
            activeView={view}
          />
        )}

        <div className="w-px bg-slate-600 mx-0.5 sm:mx-1 h-6 flex-shrink-0" />

        {/* Reports & Actions */}
        <button onClick={() => setView('reports')} className={`${baseButtonClasses} snap-start ${view === 'reports' ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg shadow-amber-500/20' : inactiveButtonClasses}`}><CheckSquare className="w-4 h-4" /><span>Tasks</span></button>

        {/* Settings */}
        <button onClick={() => setView('settings')} className={`${baseButtonClasses} snap-start ${view === 'settings' ? 'bg-gradient-to-r from-slate-600 to-slate-500 text-white shadow-lg shadow-slate-500/20' : inactiveButtonClasses}`}><Settings className="w-4 h-4" /><span>Settings</span></button>
      </div>
    </div>
  );
};

export default NavTabs;
