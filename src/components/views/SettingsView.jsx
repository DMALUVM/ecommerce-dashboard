import { devWarn, devError } from '../../utils/logger';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  AlertTriangle, BarChart3, Bell, Boxes, Check, ChevronRight, Cloud, Copy, Database, Download, Eye, FileText, Filter, Globe, HelpCircle, Home, Info, Landmark, Loader2, Moon, Package, Plus, Receipt, RefreshCw, Save, Send, Settings, ShoppingBag, ShoppingCart, Sparkles, Store, Sun, Target, Trash2, TrendingUp, Truck, Upload, User, Users, X, Zap
} from 'lucide-react';
import { formatCurrency, formatPercent, formatNumber } from '../../utils/format';
import { lsSet } from '../../utils/storage';
import { hasDailySalesData } from '../../utils/date';
import { AI_MODELS, AI_DEFAULT_MODEL } from '../../utils/config';
import NavTabs from '../ui/NavTabs';
import NumberInput from '../ui/NumberInput';
import SettingRow from '../ui/SettingRow';
import SettingSection from '../ui/SettingSection';
import Toggle from '../ui/Toggle';

// SKU normalization helper - strips Shop suffix and uppercases
const normalizeSkuKey = (sku) => (sku || '').trim().toUpperCase().replace(/SHOP$/i, '');

const SettingsView = ({
  actionItems,
  activeStoreId,
  allDaysData,
  allPeriodsData,
  allWeeksData,
  amazonCredentials,
  amazonForecasts,
  amazonInventoryStatus,
  appSettings,
  autoSyncStatus,
  bankingData,
  combinedData,
  current,
  exportAll,
  files,
  forecastCorrections,
  getCogsLookup,
  globalModals,
  goals,
  importData,
  invHistory,
  invoices,
  isMobile,
  leadTimeSettings,
  localSettings,
  months,
  navDropdown,
  notificationSettings,
  now,
  packiyoCredentials,
  packiyoInventoryData,
  packiyoInventoryStatus,
  qboCredentials,
  shipSidekickCredentials,
  runAutoSync,
  savedCogs,
  savedProductNames,
  saveInv,
  saveSettings,
  selectedInvDate,
  session,
  setAllDaysData,
  setAllPeriodsData,
  setAllWeeksData,
  setAmazonCredentials,
  setAdsIntelData,
  setAmazonForecasts,
  setAmazonInventoryData,
  setAmazonInventoryStatus,
  setAppSettings,
  setBankingData,
  setConfirmDialog,
  setGoals,
  setInvHistory,
  setInvoices,
  setIsMobile,
  setLeadTimeSettings,
  setLocalSettings,
  setNavDropdown,
  setNotificationSettings,
  setOnboardingStep,
  setPackiyoCredentials,
  setPackiyoInventoryData,
  setPackiyoInventoryStatus,
  setQboCredentials,
  setShipSidekickCredentials,
  setSavedCogs,
  setSelectedDay,
  setSelectedInvDate,
  setSelectedPeriod,
  setSelectedWeek,
  setSettingsTab,
  setShopifyCredentials,
  setShowAdsBulkUpload,
  setShowOnboarding,
  setShowPdfExport,
  setShowResetConfirm,
  setShowSaveConfirm,
  setStoreLogo,
  setStoreName,
  setStores,
  setTheme,
  setToast,
  setUploadTab,
  setWeekNotes,
  settingsTab,
  shopifyCredentials,
  showResetConfirm,
  skuDemandStatsRef,
  storeLogo,
  storeName,
  stores,
  theme,
  toast,
  setView,
  view,
  save,
  queueCloudSave,
  pushToCloudNow,
  supabase
}) => {
  // Logout handler
  const handleLogout = async () => {
    if (!supabase) return;
    try { await supabase.auth.signOut(); } catch (e) { console.error('Logout error:', e); }
    window.location.reload();
  };
  
  // Category lead time form state (local to settings page)
  const [settingsCategoryForm, setSettingsCategoryForm] = useState({ name: '', leadTimeDays: 14, reorderTriggerDays: 60, minOrderWeeks: 22 });
  const [expandedSettingsCategories, setExpandedSettingsCategories] = useState({});
  
  // Build SKU name lookup from invHistory
  const settingsSkuNameLookup = useMemo(() => {
    const lookup = {};
    if (invHistory) {
      const latestKey = Object.keys(invHistory).sort().reverse()[0];
      if (latestKey) {
        (invHistory[latestKey]?.items || []).forEach(i => { if (i.sku) lookup[i.sku] = i.name || i.sku; });
      }
    }
    return lookup;
  }, [invHistory]);
  
  // Default settings structure
  const defaultSettings = {
    inventoryDaysOptimal: 60,
    inventoryDaysLow: 30,
    inventoryDaysCritical: 14,
    tacosOptimal: 15,
    tacosWarning: 25,
    tacosMax: 35,
    roasTarget: 3.0,
    marginTarget: 25,
    marginWarning: 15,
    modulesEnabled: {
      weeklyTracking: true,
      periodTracking: true,
      inventory: true,
      trends: true,
      yoy: true,
      skus: true,
      profitability: true,
      ads: true,
      threepl: true,
      salesTax: true,
    },
    dashboardDefaultRange: 'month',
    showWeeklyGoals: true,
    showMonthlyGoals: true,
    alertSalesTaxDays: 7,
    alertInventoryEnabled: true,
    alertGoalsEnabled: true,
    alertSalesTaxEnabled: true,
    currencySymbol: '$',
    dateFormat: 'US',
    aiModel: AI_DEFAULT_MODEL,
  };
  
  // Merge defaults with saved settings
  const currentLocalSettings = {
    ...defaultSettings,
    ...(localSettings || appSettings),
    modulesEnabled: {
      ...defaultSettings.modulesEnabled,
      ...((localSettings || appSettings)?.modulesEnabled || {}),
    }
  };
  
  const updateSetting = (path, value) => {
    setLocalSettings(prev => {
      const base = prev || appSettings || defaultSettings;
      const updated = JSON.parse(JSON.stringify({ ...defaultSettings, ...base })); // Deep clone with defaults
      const keys = path.split('.');
      let obj = updated;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]]) obj[keys[i]] = {};
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      return updated;
    });
  };
  
  const handleSave = () => {
    saveSettings(currentLocalSettings);
    setShowSaveConfirm(true);
    setTimeout(() => setShowSaveConfirm(false), 2000);
  };
  
  const resetToDefaults = () => {
    setLocalSettings(defaultSettings);
    setShowResetConfirm(false);
  };
  

    return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 lg:p-6">
      <div className="max-w-7xl mx-auto">{globalModals}
        
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white">Settings</h1>
            <p className="text-slate-400">Customize your dashboard experience</p>
          </div>
          <button onClick={handleSave} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-semibold text-white flex items-center gap-2"><Check className="w-5 h-5" />Save Changes</button>
        </div>
        
        <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />
        
        {/* Settings Tabs */}
        <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-6 p-1 bg-slate-800/50 rounded-xl">
          {[
            { id: 'general', label: 'General', mobileLabel: '🏪', icon: Store },
            { id: 'inventory', label: 'Inventory', mobileLabel: '📦', icon: Package },
            { id: 'integrations', label: 'Integrations', mobileLabel: '🔗', icon: RefreshCw },
            { id: 'thresholds', label: 'Thresholds', mobileLabel: '📊', icon: Target },
            { id: 'display', label: 'Display', mobileLabel: '🎨', icon: Eye },
            { id: 'data', label: 'Data', mobileLabel: '🗄️', icon: Database },
            { id: 'account', label: 'Account', mobileLabel: '👤', icon: User },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSettingsTab(tab.id)}
              className={`flex-1 min-w-[50px] sm:min-w-[90px] px-2 sm:px-4 py-2 sm:py-2.5 rounded-lg text-sm font-medium transition-all ${
                settingsTab === tab.id 
                  ? 'bg-violet-600 text-white shadow-lg' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <span className="sm:hidden">{tab.mobileLabel}</span>
              <span className="hidden sm:inline">{tab.mobileLabel} {tab.label}</span>
            </button>
          ))}
        </div>
        
        {/* ========== GENERAL TAB ========== */}
        {settingsTab === 'general' && (
          <>
        {/* Store Management - For Cloud Users */}
        {session && (
          <SettingSection title="🏪 Store Management">
            <p className="text-slate-400 text-sm mb-4">Manage multiple stores or rename your current store</p>
            
            {/* Current Store */}
            <div className="bg-slate-800/50 rounded-xl p-4 mb-4">
              <p className="text-slate-400 text-xs uppercase mb-2">Current Store</p>
              <div className="flex items-center gap-3">
                <Store className="w-8 h-8 text-violet-400" />
                <div className="flex-1">
                  <input 
                    key={`store-name-${activeStoreId}`}
                    defaultValue={storeName || stores.find(s => s.id === activeStoreId)?.name || ''} 
                    onBlur={(e) => {
                      const newName = e.target.value;
                      setStoreName(newName);
                      // Also update in stores array if it exists
                      if (stores.length > 0 && activeStoreId) {
                        const updated = stores.map(s => s.id === activeStoreId ? { ...s, name: newName } : s);
                        setStores(updated);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.target.blur();
                      }
                    }}
                    className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white w-full focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Enter store name"
                  />
                </div>
              </div>
              <p className="text-slate-500 text-xs mt-2">Press Enter or click outside to save. This name appears in exports and reports.</p>
            </div>
            
            {/* All Stores */}
            {stores.length >= 1 && (
              <div className="space-y-2 mb-4">
                <p className="text-slate-400 text-xs uppercase">
                  {stores.length > 1 ? 'Switch Store' : 'Your Store'}
                </p>
                {stores.map(store => (
                  <div key={store.id} className={`flex items-center justify-between p-3 rounded-xl border ${store.id === activeStoreId ? 'bg-violet-900/30 border-violet-500/50' : 'bg-slate-800/30 border-slate-700 hover:bg-slate-700/50'}`}>
                    <div className="flex items-center gap-3">
                      <Store className={`w-5 h-5 ${store.id === activeStoreId ? 'text-violet-400' : 'text-slate-500'}`} />
                      <span className={store.id === activeStoreId ? 'text-white font-medium' : 'text-slate-300'}>{store.name}</span>
                      {store.id === activeStoreId && <span className="text-xs text-violet-400 bg-violet-500/20 px-2 py-0.5 rounded">Active</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {store.id !== activeStoreId && (
                        <button 
                          onClick={() => switchStore(store.id)}
                          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white"
                        >
                          Switch
                        </button>
                      )}
                      <button 
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          deleteStore(store.id);
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                        title={stores.length === 1 ? "Delete and start fresh" : "Delete store"}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* Create New Store */}
            <div className="flex gap-2">
              <input 
                placeholder="New store name..."
                className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                id="new-store-name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target.value.trim()) {
                    createStore(e.target.value.trim());
                    e.target.value = '';
                  }
                }}
              />
              <button 
                onClick={() => {
                  const input = document.getElementById('new-store-name');
                  if (input?.value?.trim()) {
                    createStore(input.value.trim());
                    input.value = '';
                  }
                }}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-white flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />Add Store
              </button>
            </div>
            <p className="text-slate-500 text-xs mt-2">Each store has separate data. Great for multiple brands or demo data.</p>
          </SettingSection>
        )}
        
        {/* Store Branding - Always visible in General tab */}
        <SettingSection title="🏪 Store Branding">
          <SettingRow label="Store Name" desc="Displayed in the dashboard header">
            <input 
              type="text" 
              value={storeName} 
              onChange={(e) => setStoreName(e.target.value)} 
              placeholder="Your Store Name"
              className="w-48 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
            />
          </SettingRow>
          <SettingRow label="Store Logo" desc="Upload your logo (PNG, JPG - max 500KB)">
            <div className="flex items-center gap-3">
              {storeLogo && (
                <img src={storeLogo} alt="Store logo" className="w-10 h-10 object-contain rounded-lg bg-white p-1" />
              )}
              <label className="px-3 py-2 bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/50 rounded-lg text-sm text-violet-300 cursor-pointer flex items-center gap-2">
                <Upload className="w-4 h-4" />{storeLogo ? 'Change' : 'Upload'}
                <input 
                  type="file" 
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      if (file.size > 500 * 1024) {
                        setToast({ message: 'Logo must be under 500KB', type: 'error' });
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        setStoreLogo(ev.target.result);
                        setToast({ message: 'Logo uploaded successfully', type: 'success' });
                      };
                      reader.readAsDataURL(file);
                    }
                  }} 
                  className="hidden" 
                />
              </label>
              {storeLogo && (
                <button onClick={() => { setStoreLogo(null); setToast({ message: 'Logo removed', type: 'success' }); }} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-300">
                  Remove
                </button>
              )}
            </div>
          </SettingRow>
          <p className="text-slate-500 text-xs mt-3">Your logo will appear in the dashboard header next to your store name.</p>
        </SettingSection>
          </>
        )}
        
        {/* ========== INVENTORY TAB ========== */}
        {settingsTab === 'inventory' && (
          <>
        <SettingSection title="📦 Inventory Alert Rules">
          <p className="text-slate-400 text-sm mb-4">Configure alerts for low inventory across different channels</p>
          
          {/* Amazon Inventory Alerts */}
          <div className="bg-orange-900/20 border border-orange-500/30 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-orange-400 font-medium flex items-center gap-2">
                🛒 Amazon FBA Inventory
              </h4>
              <label className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  checked={leadTimeSettings.channelRules?.amazon?.alertEnabled ?? true}
                  onChange={(e) => setLeadTimeSettings(prev => ({
                    ...prev,
                    channelRules: {
                      ...prev.channelRules,
                      amazon: { ...prev.channelRules?.amazon, alertEnabled: e.target.checked }
                    }
                  }))}
                  className="w-4 h-4 rounded bg-slate-700 border-slate-600"
                />
                <span className="text-slate-300 text-sm">Enabled</span>
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Minimum Days of Supply</label>
                <input 
                  type="number"
                  value={leadTimeSettings.channelRules?.amazon?.minDaysOfSupply || 60}
                  onChange={(e) => setLeadTimeSettings(prev => ({
                    ...prev,
                    channelRules: {
                      ...prev.channelRules,
                      amazon: { ...prev.channelRules?.amazon, minDaysOfSupply: parseInt(e.target.value) || 60 }
                    }
                  }))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white"
                  min="1"
                />
                <p className="text-slate-500 text-xs mt-1">Alert when Amazon inventory falls below this many days of supply</p>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Production Lead Time (days)</label>
                <input 
                  type="number"
                  value={leadTimeSettings.defaultLeadTimeDays || 14}
                  onChange={(e) => setLeadTimeSettings(prev => ({ ...prev, defaultLeadTimeDays: parseInt(e.target.value) || 14 }))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white"
                  min="1"
                />
                <p className="text-slate-500 text-xs mt-1">Time from placing order to receiving inventory</p>
              </div>
            </div>
          </div>
          
          {/* 3PL / Packiyo Inventory Alerts */}
          <div className="bg-cyan-900/20 border border-cyan-500/30 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-cyan-400 font-medium flex items-center gap-2">
                📦 3PL / Packiyo Inventory
              </h4>
              <label className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  checked={leadTimeSettings.channelRules?.threepl?.alertEnabled ?? true}
                  onChange={(e) => setLeadTimeSettings(prev => ({
                    ...prev,
                    channelRules: {
                      ...prev.channelRules,
                      threepl: { ...prev.channelRules?.threepl, alertEnabled: e.target.checked }
                    }
                  }))}
                  className="w-4 h-4 rounded bg-slate-700 border-slate-600"
                />
                <span className="text-slate-300 text-sm">Enabled</span>
              </label>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm text-slate-400 mb-1">Default Quantity Threshold (all SKUs)</label>
              <input 
                type="number"
                value={leadTimeSettings.channelRules?.threepl?.defaultQtyThreshold || 50}
                onChange={(e) => setLeadTimeSettings(prev => ({
                  ...prev,
                  channelRules: {
                    ...prev.channelRules,
                    threepl: { ...prev.channelRules?.threepl, defaultQtyThreshold: parseInt(e.target.value) || 50 }
                  }
                }))}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white"
                min="1"
              />
              <p className="text-slate-500 text-xs mt-1">Alert when any 3PL SKU falls below this quantity</p>
            </div>
            
            {/* Category-based thresholds */}
            <div className="mb-4">
              <label className="block text-sm text-slate-400 mb-2">Category Thresholds (by keyword in product name)</label>
              <div className="space-y-2">
                {Object.entries(leadTimeSettings.channelRules?.threepl?.categoryThresholds || { soap: 50, balm: 100, lip: 100 }).map(([keyword, threshold]) => (
                  <div key={keyword} className="flex items-center gap-2">
                    <input 
                      type="text"
                      value={keyword}
                      readOnly
                      className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                    />
                    <input 
                      type="number"
                      value={threshold}
                      onChange={(e) => {
                        const newThreshold = parseInt(e.target.value) || 50;
                        setLeadTimeSettings(prev => ({
                          ...prev,
                          channelRules: {
                            ...prev.channelRules,
                            threepl: {
                              ...prev.channelRules?.threepl,
                              categoryThresholds: {
                                ...prev.channelRules?.threepl?.categoryThresholds,
                                [keyword]: newThreshold
                              }
                            }
                          }
                        }));
                      }}
                      className="w-24 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
                      min="1"
                    />
                    <button
                      onClick={() => {
                        const newThresholds = { ...leadTimeSettings.channelRules?.threepl?.categoryThresholds };
                        delete newThresholds[keyword];
                        setLeadTimeSettings(prev => ({
                          ...prev,
                          channelRules: {
                            ...prev.channelRules,
                            threepl: { ...prev.channelRules?.threepl, categoryThresholds: newThresholds }
                          }
                        }));
                      }}
                      className="p-2 text-rose-400 hover:bg-rose-900/30 rounded-lg"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                
                {/* Add new category threshold */}
                <div className="flex items-center gap-2 mt-2">
                  <input 
                    type="text"
                    placeholder="keyword (e.g., soap, lotion)"
                    id="new-category-keyword"
                    className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-500"
                  />
                  <input 
                    type="number"
                    placeholder="qty"
                    id="new-category-threshold"
                    className="w-24 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-500"
                    min="1"
                  />
                  <button
                    onClick={() => {
                      const keywordEl = document.getElementById('new-category-keyword');
                      const thresholdEl = document.getElementById('new-category-threshold');
                      const keyword = keywordEl?.value?.trim().toLowerCase();
                      const threshold = parseInt(thresholdEl?.value) || 50;
                      if (keyword) {
                        setLeadTimeSettings(prev => ({
                          ...prev,
                          channelRules: {
                            ...prev.channelRules,
                            threepl: {
                              ...prev.channelRules?.threepl,
                              categoryThresholds: {
                                ...prev.channelRules?.threepl?.categoryThresholds,
                                [keyword]: threshold
                              }
                            }
                          }
                        }));
                        if (keywordEl) keywordEl.value = '';
                        if (thresholdEl) thresholdEl.value = '';
                      }
                    }}
                    className="p-2 text-emerald-400 hover:bg-emerald-900/30 rounded-lg"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-slate-500 text-xs mt-2">Products containing these keywords will use the specified threshold</p>
            </div>
          </div>
        </SettingSection>
        
        <SettingSection title="💰 Storage Cost Allocation">
          <p className="text-slate-400 text-sm mb-4">Choose how 3PL storage costs are allocated across channels</p>
          
          <div className="space-y-3">
            {[
              { id: 'proportional', label: 'Proportional by Revenue', desc: 'Split storage costs based on each channel\'s revenue share (recommended)' },
              { id: 'total', label: 'Show as Separate Line', desc: 'Storage costs shown separately, not deducted from either channel profit' },
              { id: 'shopify', label: 'All to Shopify (Legacy)', desc: 'Deduct all storage costs from Shopify only (not recommended)' },
            ].map(option => (
              <label 
                key={option.id}
                className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                  leadTimeSettings.storageCostAllocation === option.id 
                    ? 'bg-violet-900/30 border-violet-500/50' 
                    : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                }`}
              >
                <input 
                  type="radio"
                  name="storageCostAllocation"
                  value={option.id}
                  checked={leadTimeSettings.storageCostAllocation === option.id}
                  onChange={(e) => setLeadTimeSettings(prev => ({ ...prev, storageCostAllocation: e.target.value }))}
                  className="mt-1"
                />
                <div>
                  <p className="text-white font-medium">{option.label}</p>
                  <p className="text-slate-400 text-sm">{option.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </SettingSection>
        
        <SettingSection title="📅 Reorder Settings">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Target Buffer (days)</label>
              <input 
                type="number"
                value={leadTimeSettings.reorderTriggerDays || 60}
                onChange={(e) => setLeadTimeSettings(prev => ({ ...prev, reorderTriggerDays: parseInt(e.target.value) || 60 }))}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white"
                min="1"
              />
              <p className="text-slate-500 text-xs mt-1">Want shipment to arrive when stock reaches this many days</p>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Minimum Order Size (weeks)</label>
              <input 
                type="number"
                value={leadTimeSettings.minOrderWeeks || 22}
                onChange={(e) => setLeadTimeSettings(prev => ({ ...prev, minOrderWeeks: parseInt(e.target.value) || 22 }))}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white"
                min="1"
              />
              <p className="text-slate-500 text-xs mt-1">Minimum weeks of supply per order ({Math.round((leadTimeSettings.minOrderWeeks || 22) / 4.3)} months)</p>
            </div>
          </div>
        </SettingSection>
        
        {/* Category Lead Times */}
        <SettingSection title="📦 Category Lead Times">
          <p className="text-slate-400 text-sm mb-4">Set different lead times per product category. Per-SKU overrides still take priority. Assign SKUs to categories in the Inventory Settings modal.</p>
          
          {/* Add new category */}
          <div className="flex gap-3 items-end mb-4 flex-wrap">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Category Name</label>
              <input 
                type="text" 
                value={settingsCategoryForm?.name || ''} 
                onChange={(e) => setSettingsCategoryForm(f => ({ ...f, name: e.target.value }))} 
                placeholder="e.g. Lip Balm, Deodorant" 
                className="w-44 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm" 
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Lead Time</label>
              <div className="flex items-center gap-1">
                <input type="number" value={settingsCategoryForm?.leadTimeDays || 14} onChange={(e) => setSettingsCategoryForm(f => ({ ...f, leadTimeDays: parseInt(e.target.value) || 14 }))} className="w-16 px-2 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm text-center" />
                <span className="text-slate-500 text-xs">days</span>
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Reorder Trigger</label>
              <div className="flex items-center gap-1">
                <input type="number" value={settingsCategoryForm?.reorderTriggerDays || 60} onChange={(e) => setSettingsCategoryForm(f => ({ ...f, reorderTriggerDays: parseInt(e.target.value) || 60 }))} className="w-16 px-2 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm text-center" />
                <span className="text-slate-500 text-xs">days</span>
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Min Order</label>
              <div className="flex items-center gap-1">
                <input type="number" value={settingsCategoryForm?.minOrderWeeks || 22} onChange={(e) => setSettingsCategoryForm(f => ({ ...f, minOrderWeeks: parseInt(e.target.value) || 22 }))} className="w-16 px-2 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm text-center" />
                <span className="text-slate-500 text-xs">wks</span>
              </div>
            </div>
            <button 
              onClick={() => {
                const name = (settingsCategoryForm?.name || '').trim();
                if (!name) { setToast({ message: 'Enter a category name', type: 'error' }); return; }
                setLeadTimeSettings(prev => ({
                  ...prev,
                  categoryLeadTimes: {
                    ...prev.categoryLeadTimes,
                    [name]: {
                      leadTimeDays: settingsCategoryForm?.leadTimeDays || 14,
                      reorderTriggerDays: settingsCategoryForm?.reorderTriggerDays || 60,
                      minOrderWeeks: settingsCategoryForm?.minOrderWeeks || 22,
                    }
                  }
                }));
                setSettingsCategoryForm({ name: '', leadTimeDays: 14, reorderTriggerDays: 60, minOrderWeeks: 22 });
                setToast({ message: `Category "${name}" added`, type: 'success' });
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white text-sm"
            >Add</button>
            <button
              onClick={() => {
                const categories = Object.keys(leadTimeSettings.categoryLeadTimes || {});
                if (categories.length === 0) { setToast({ message: 'Add categories first', type: 'error' }); return; }
                const latestKey = Object.keys(invHistory).sort().reverse()[0];
                const allItems = latestKey ? (invHistory[latestKey]?.items || []) : [];
                if (allItems.length === 0) { setToast({ message: 'No inventory data. Process inventory first.', type: 'error' }); return; }
                const updates = {};
                let assigned = 0;
                let skipped = 0;
                const sortedCats = [...categories].sort((a, b) => b.length - a.length);
                allItems.forEach(item => {
                  const sku = item.sku;
                  if (!sku) return;
                  if (leadTimeSettings.skuCategories?.[sku]) { skipped++; return; }
                  const searchText = `${(item.name || '').toLowerCase()} ${sku.toLowerCase()}`;
                  for (const cat of sortedCats) {
                    const catLower = cat.toLowerCase();
                    if (searchText.includes(catLower)) { updates[sku] = cat; assigned++; break; }
                    const keywords = catLower.split(/[\s'&,/]+/).filter(w => w.length >= 3);
                    if (keywords.length > 1 && keywords.every(kw => searchText.includes(kw))) { updates[sku] = cat; assigned++; break; }
                    if (keywords.length === 1 && keywords[0].length >= 4 && searchText.includes(keywords[0])) { updates[sku] = cat; assigned++; break; }
                  }
                });
                if (assigned > 0) {
                  setLeadTimeSettings(prev => ({ ...prev, skuCategories: { ...prev.skuCategories, ...updates } }));
                  const affectedCats = [...new Set(Object.values(updates))];
                  setExpandedSettingsCategories(prev => { const exp = { ...prev }; affectedCats.forEach(c => { exp[c] = true; }); return exp; });
                  setToast({ message: `Auto-assigned ${assigned} SKUs${skipped > 0 ? ` (${skipped} already assigned)` : ''}`, type: 'success' });
                } else {
                  setToast({ message: skipped > 0 ? `All ${skipped} SKUs already assigned. Click Re-assign All to override.` : `No matches in ${allItems.length} SKUs for: ${categories.join(', ')}`, type: 'info' });
                }
              }}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-white text-sm flex items-center gap-1"
              title="Auto-assign unassigned SKUs to categories"
            ><Zap className="w-3 h-3" />Auto-Assign</button>
            <button
              onClick={() => {
                const categories = Object.keys(leadTimeSettings.categoryLeadTimes || {});
                if (categories.length === 0) { setToast({ message: 'Add categories first', type: 'error' }); return; }
                const latestKey = Object.keys(invHistory).sort().reverse()[0];
                const allItems = latestKey ? (invHistory[latestKey]?.items || []) : [];
                if (allItems.length === 0) { setToast({ message: 'No inventory data. Process inventory first.', type: 'error' }); return; }
                const updates = {};
                let assigned = 0;
                const sortedCats = [...categories].sort((a, b) => b.length - a.length);
                allItems.forEach(item => {
                  const sku = item.sku;
                  if (!sku) return;
                  const searchText = `${(item.name || '').toLowerCase()} ${sku.toLowerCase()}`;
                  for (const cat of sortedCats) {
                    const catLower = cat.toLowerCase();
                    if (searchText.includes(catLower)) { updates[sku] = cat; assigned++; break; }
                    const keywords = catLower.split(/[\s'&,/]+/).filter(w => w.length >= 3);
                    if (keywords.length > 1 && keywords.every(kw => searchText.includes(kw))) { updates[sku] = cat; assigned++; break; }
                    if (keywords.length === 1 && keywords[0].length >= 4 && searchText.includes(keywords[0])) { updates[sku] = cat; assigned++; break; }
                  }
                });
                if (assigned > 0) {
                  setLeadTimeSettings(prev => ({ ...prev, skuCategories: { ...prev.skuCategories, ...updates } }));
                  const affectedCats = [...new Set(Object.values(updates))];
                  setExpandedSettingsCategories(prev => { const exp = { ...prev }; affectedCats.forEach(c => { exp[c] = true; }); return exp; });
                  setToast({ message: `Re-assigned ${assigned} SKUs to categories`, type: 'success' });
                } else {
                  setToast({ message: `No matches in ${allItems.length} SKUs for: ${categories.join(', ')}`, type: 'info' });
                }
              }}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-white text-sm flex items-center gap-1"
              title="Re-assign ALL SKUs (overrides existing)"
            ><RefreshCw className="w-3 h-3" />Re-assign All</button>
          </div>
          
          {/* Category list */}
          {Object.keys(leadTimeSettings.categoryLeadTimes || {}).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(leadTimeSettings.categoryLeadTimes).map(([catName, catSettings]) => {
                const assignedSkus = Object.entries(leadTimeSettings.skuCategories || {}).filter(([, c]) => c === catName).map(([sku]) => sku);
                const skuCount = assignedSkus.length;
                const categories = Object.keys(leadTimeSettings.categoryLeadTimes || {});
                const isExpanded = expandedSettingsCategories[catName];
                return (
                  <div key={catName} className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-wrap flex-1 cursor-pointer" onClick={() => setExpandedSettingsCategories(prev => ({ ...prev, [catName]: !prev[catName] }))}>
                        <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        <span className="text-white font-medium min-w-[130px]">{catName}</span>
                        <span className="text-emerald-400 text-sm">{catSettings.leadTimeDays}d lead time</span>
                        <span className="text-amber-400 text-sm">{catSettings.reorderTriggerDays}d trigger</span>
                        <span className="text-cyan-400 text-sm">{catSettings.minOrderWeeks}w min order</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${skuCount > 0 ? 'bg-emerald-900/50 text-emerald-400' : 'bg-slate-600/50 text-slate-400'}`}>{skuCount} SKU{skuCount !== 1 ? 's' : ''}</span>
                      </div>
                      <button 
                        onClick={() => {
                          if (!confirm(`Delete category "${catName}"?`)) return;
                          setLeadTimeSettings(prev => {
                            const newCatLT = { ...prev.categoryLeadTimes };
                            delete newCatLT[catName];
                            const newCats = { ...prev.skuCategories };
                            Object.keys(newCats).forEach(sku => { if (newCats[sku] === catName) delete newCats[sku]; });
                            return { ...prev, categoryLeadTimes: newCatLT, skuCategories: newCats };
                          });
                        }}
                        className="px-2 py-1 bg-rose-900/50 hover:bg-rose-800/50 rounded text-rose-400 text-xs ml-2"
                      >Remove</button>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-slate-700/50 bg-slate-900/30 px-4 py-2">
                        {assignedSkus.length > 0 ? (
                          <div className="space-y-1 max-h-60 overflow-y-auto">
                            {assignedSkus.map(sku => (
                              <div key={sku} className="flex items-center justify-between py-1 px-2 rounded hover:bg-slate-700/30 group">
                                <div className="flex-1 min-w-0">
                                  <span className="text-white text-xs font-mono">{sku}</span>
                                  <span className="text-slate-500 text-xs ml-2">{settingsSkuNameLookup[sku] || ''}</span>
                                </div>
                                <select
                                  value={catName}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setLeadTimeSettings(prev => {
                                      const newCats = { ...prev.skuCategories };
                                      if (val) newCats[sku] = val; else delete newCats[sku];
                                      return { ...prev, skuCategories: newCats };
                                    });
                                  }}
                                  className="bg-slate-700 border border-slate-600 rounded px-1 py-0.5 text-xs text-slate-300 opacity-70 group-hover:opacity-100"
                                >
                                  <option value="">Unassign</option>
                                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-slate-500 text-xs py-1">No SKUs assigned. Use Auto-Assign or set per-SKU in the Inventory Settings modal.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              
              {/* Unassigned SKUs */}
              {(() => {
                const latestKey = Object.keys(invHistory || {}).sort().reverse()[0];
                const allSkus = latestKey ? (invHistory[latestKey]?.items || []) : [];
                const unassigned = allSkus.filter(i => i.sku && !leadTimeSettings.skuCategories?.[i.sku]);
                const categories = Object.keys(leadTimeSettings.categoryLeadTimes || {});
                if (unassigned.length === 0) return null;
                const isExpanded = expandedSettingsCategories.__unassigned;
                return (
                  <div className="mt-3">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => setExpandedSettingsCategories(prev => ({ ...prev, __unassigned: !prev.__unassigned }))}>
                      <ChevronRight className={`w-4 h-4 text-amber-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      <span className="text-amber-400 text-sm font-medium">{unassigned.length} unassigned SKU{unassigned.length !== 1 ? 's' : ''}</span>
                      <span className="text-slate-500 text-xs">— click to assign individually</span>
                    </div>
                    {isExpanded && (
                      <div className="mt-2 bg-amber-900/10 border border-amber-700/30 rounded-lg px-4 py-2 space-y-1 max-h-60 overflow-y-auto">
                        {unassigned.map(item => (
                          <div key={item.sku} className="flex items-center justify-between py-1 px-2 rounded hover:bg-slate-700/30">
                            <div className="flex-1 min-w-0">
                              <span className="text-white text-xs font-mono">{item.sku}</span>
                              <span className="text-slate-500 text-xs ml-2">{item.name || ''}</span>
                            </div>
                            <select
                              value=""
                              onChange={(e) => {
                                if (!e.target.value) return;
                                setLeadTimeSettings(prev => ({ ...prev, skuCategories: { ...prev.skuCategories, [item.sku]: e.target.value } }));
                              }}
                              className="bg-slate-700 border border-slate-600 rounded px-1 py-0.5 text-xs text-slate-300"
                            >
                              <option value="">Assign to...</option>
                              {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="text-center py-4 text-slate-500 text-sm bg-slate-800/30 rounded-lg">
              No categories yet. Add categories like <span className="text-white">"Lip Balm"</span>, <span className="text-white">"Deodorant"</span>, <span className="text-white">"Tallow Balm"</span>, <span className="text-white">"Athlete's Shield Soap"</span>, <span className="text-white">"Tallow Soap"</span> to manage lead times by product type.
            </div>
          )}
        </SettingSection>
          </>
        )}
        
        {/* ========== INTEGRATIONS TAB ========== */}
        {settingsTab === 'integrations' && (
          <>
        {/* Shopify Connection */}
        <SettingSection title="🛒 Shopify Connection">
          <p className="text-slate-400 text-sm mb-4">Connect your Shopify store to automatically sync orders, inventory, and tax data</p>
          
          {shopifyCredentials.connected ? (
            <div className="space-y-4">
              <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
                      <Check className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-emerald-400 font-medium">Connected</p>
                      <p className="text-slate-400 text-sm">{shopifyCredentials.storeUrl}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm('Disconnect from Shopify? Your synced data will remain.')) {
                        setShopifyCredentials({ storeUrl: '', clientId: '', clientSecret: '', connected: false, lastSync: null });
                        setToast({ message: 'Shopify disconnected', type: 'success' });
                      }
                    }}
                    className="px-4 py-2 bg-rose-600/30 hover:bg-rose-600/50 border border-rose-500/50 rounded-lg text-sm text-rose-300"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
              <SettingRow label="Go to Sync" desc="Sync orders from your Shopify store">
                <button
                  onClick={() => { setUploadTab('shopify-sync'); setView('upload'); }}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm text-white flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />Sync Now
                </button>
              </SettingRow>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-slate-900/50 rounded-xl p-4">
                <div className="space-y-4">
                  <div>
                    <label className="block text-slate-300 text-sm font-medium mb-2">Store URL</label>
                    <input
                      type="text"
                      placeholder="your-store.myshopify.com"
                      value={shopifyCredentials.storeUrl}
                      onChange={(e) => setShopifyCredentials(p => ({ ...p, storeUrl: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <p className="text-slate-500 text-xs mt-1">Just the store name, e.g. "mystore.myshopify.com"</p>
                  </div>
                  <div>
                    <label className="block text-slate-300 text-sm font-medium mb-2">Client ID</label>
                    <input
                      type="text"
                      placeholder="Your app's Client ID"
                      value={shopifyCredentials.clientId}
                      onChange={(e) => setShopifyCredentials(p => ({ ...p, clientId: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <p className="text-slate-500 text-xs mt-1">From Dev Dashboard → Your App → Settings</p>
                  </div>
                  <div>
                    <label className="block text-slate-300 text-sm font-medium mb-2">Client Secret</label>
                    <input
                      type="text" style={{WebkitTextSecurity: "disc"}}
                      placeholder="Your app's Client Secret"
                      value={shopifyCredentials.clientSecret}
                      onChange={(e) => setShopifyCredentials(p => ({ ...p, clientSecret: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <p className="text-slate-500 text-xs mt-1">Keep this secret! Never share it.</p>
                  </div>
                  <button
                    onClick={async () => {
                      if (!shopifyCredentials.storeUrl || !shopifyCredentials.clientSecret) {
                        setToast({ message: 'Please enter store URL and Admin API access token', type: 'error' });
                        return;
                      }
                      
                      setToast({ message: 'Connecting to Shopify...', type: 'info' });
                      
                      // Add timeout to prevent hanging
                      const controller = new AbortController();
                      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
                      
                      // Test connection
                      try {
                        const res = await fetch('/api/shopify/sync', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          signal: controller.signal,
                          body: JSON.stringify({
                            storeUrl: shopifyCredentials.storeUrl,
                            accessToken: shopifyCredentials.clientSecret,
                            clientId: shopifyCredentials.clientId,
                            clientSecret: shopifyCredentials.clientSecret,
                            test: true,
                          }),
                        });
                        clearTimeout(timeoutId);
                        
                        if (!res.ok) {
                          const errorText = await res.text();
                          throw new Error(`API error ${res.status}: ${errorText.slice(0, 100)}`);
                        }
                        
                        const data = await res.json();
                        if (data.error) throw new Error(data.error);
                        if (data.success) {
                          const updatedCreds = { ...shopifyCredentials, connected: true };
                          setShopifyCredentials(updatedCreds);
                          // IMMEDIATELY save to cloud to persist across sessions
                          if (session?.user?.id && supabase) {
                            pushToCloudNow({ ...combinedData, shopifyCredentials: updatedCreds }, true);
                          }
                          setToast({ message: `Connected to ${data.shopName || 'Shopify'}!`, type: 'success' });
                        }
                      } catch (err) {
                        clearTimeout(timeoutId);
                        const errorMsg = err.name === 'AbortError' 
                          ? 'Request timed out. Make sure api/shopify/sync.js is deployed to Vercel.'
                          : err.message;
                        setToast({ message: 'Connection failed: ' + errorMsg, type: 'error' });
                      }
                    }}
                    disabled={!shopifyCredentials.storeUrl || !shopifyCredentials.clientSecret}
                    className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:hover:bg-green-600 rounded-xl text-white font-semibold flex items-center justify-center gap-2"
                  >
                    <ShoppingBag className="w-5 h-5" />
                    Test & Connect
                  </button>
                </div>
              </div>
              
              <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
                <h4 className="text-blue-400 font-medium mb-2 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4" />
                  How to get your credentials (Updated Jan 2026)
                </h4>
                <ol className="text-slate-300 text-sm space-y-2">
                  <li>1. Go to <a href="https://partners.shopify.com" target="_blank" className="text-blue-400 underline">Shopify Partners</a> → Apps → Create app</li>
                  <li>2. Or in your store: Settings → Apps → Develop apps → Create app</li>
                  <li>3. Configure Admin API scopes: <code className="bg-slate-800 px-1 rounded">read_orders</code>, <code className="bg-slate-800 px-1 rounded">read_products</code>, <code className="bg-slate-800 px-1 rounded">read_inventory</code>, <code className="bg-slate-800 px-1 rounded">read_locations</code></li>
                  <li>4. Go to app Settings to find your <strong>Client ID</strong> and <strong>Client Secret</strong></li>
                  <li>5. Install the app on your store</li>
                </ol>
                <p className="text-slate-500 text-xs mt-3">Note: As of Jan 2026, Shopify uses OAuth. Tokens are generated automatically and refresh every 24 hours.</p>
              </div>
            </div>
          )}
        </SettingSection>
        
        {/* Packiyo 3PL Connection (Legacy) */}
        <SettingSection title="📦 Packiyo 3PL (Legacy — replaced by Ship Sidekick)">
          <p className="text-slate-400 text-sm mb-4">This integration has been replaced by Ship Sidekick above. If you still need Packiyo access, the connection is preserved below.</p>
          
          {packiyoCredentials.connected ? (
            <div className="space-y-4">
              <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
                      <Check className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-emerald-400 font-medium">Connected to Excel3PL</p>
                      <p className="text-slate-400 text-sm">{packiyoCredentials.customerName || 'Packiyo'}</p>
                      {packiyoCredentials.lastSync && (
                        <p className="text-slate-500 text-xs">Last sync: {new Date(packiyoCredentials.lastSync).toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm('Disconnect from Packiyo? Your synced inventory will remain.')) {
                        setPackiyoCredentials({ apiKey: '', customerId: '134', baseUrl: 'https://excel3pl.packiyo.com/api/v1', connected: false, lastSync: null, customerName: '' });
                        setPackiyoInventoryData(null);
                        setToast({ message: 'Packiyo disconnected', type: 'success' });
                      }
                    }}
                    className="px-4 py-2 bg-rose-600/30 hover:bg-rose-600/50 border border-rose-500/50 rounded-lg text-sm text-rose-300"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
              
              {/* Sync Inventory Button */}
              <SettingRow label="Sync 3PL Inventory" desc="Pull latest inventory from Packiyo and update inventory">
                <button
                  onClick={async () => {
                    setPackiyoInventoryStatus({ loading: true, error: null, lastSync: null });
                    try {
                      const res = await fetch('/api/packiyo/sync', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          apiKey: packiyoCredentials.apiKey,
                          customerId: packiyoCredentials.customerId,
                          baseUrl: packiyoCredentials.baseUrl,
                          syncType: 'inventory',
                        }),
                      });
                      const data = await res.json();
                      if (data.error) throw new Error(data.error);
                      
                      // Merge with COGS data for proper valuation
                      if (data.items) {
                        data.items = data.items.map(item => ({
                          ...item,
                          cost: item.cost || savedCogs[item.sku] || 0,
                          value: (item.quantity_on_hand || 0) * (item.cost || savedCogs[item.sku] || 0),
                        }));
                        // Recalculate totals
                        data.summary.totalValue = data.items.reduce((sum, i) => sum + (i.value || 0), 0);
                      }
                      if (data.inventoryBySku) {
                        Object.keys(data.inventoryBySku).forEach(sku => {
                          const item = data.inventoryBySku[sku];
                          item.cost = item.cost || savedCogs[sku] || 0;
                          item.totalValue = (item.totalQty || item.quantity_on_hand || 0) * item.cost;
                        });
                      }
                      
                      setPackiyoInventoryData(data);
                      setPackiyoInventoryStatus({ loading: false, error: null, lastSync: new Date().toISOString() });
                      setPackiyoCredentials(p => ({ ...p, lastSync: new Date().toISOString() }));
                      
                      // Show toast with summary
                      const skuCount = data.summary?.skuCount || data.summary?.productsWithSku || 0;
                      const totalValue = data.summary?.totalValue || 0;
                      setToast({ 
                        message: `Synced ${skuCount} SKUs from Packiyo (${formatCurrency(totalValue)} value)`, 
                        type: 'success' 
                      });
                      
                      // ========== INDUSTRY-STANDARD VELOCITY CALCULATION ==========
                      // Features:
                      // 1. Weighted Moving Average (recent weeks count more)
                      // 2. Separate Amazon/Shopify tracking
                      // 3. Trend detection (acceleration/deceleration)
                      // 4. Apply learned forecast corrections
                      
                      const amazonVelocityLookup = {};
                      const shopifyVelocityLookup = {};
                      const velocityTrends = {}; // Track if velocity is accelerating/decelerating
                      const rawVelocityLookup = {}; // Store uncorrected velocity
                      
                      try {
                        
                        if (Object.keys(allDaysData).length > 0) {
                          // Get last 28 days sorted by date
                          const allDates = Object.keys(allDaysData).sort().reverse();
                          const last28Days = allDates.slice(0, 28);
                          const last14Days = last28Days.slice(0, 14);
                          const prior14Days = last28Days.slice(14, 28);
                          
                          
                          // Stats tracking
                          let daysWithShopifySkuData = 0;
                          let daysWithAmazonSkuData = 0;
                          let totalShopifyUnits = 0;
                          let totalAmazonUnits = 0;
                          let uniqueShopifySkus = new Set();
                          let uniqueAmazonSkus = new Set();
                          
                          // Temporary storage for weighted calculation
                          const skuDailyUnits = {}; // { sku: { shopify: [day1, day2...], amazon: [day1, day2...] } }
                          
                          // Helper to store velocity under multiple key variants
                          const storeVelocity = (lookup, sku, velocity) => {
                            const skuLower = sku.toLowerCase();
                            const skuUpper = sku.toUpperCase();
                            const baseSku = sku.replace(/shop$/i, '').toUpperCase();
                            const baseSkuLower = baseSku.toLowerCase();
                            const withShop = baseSku + 'Shop';
                            const withShopLower = withShop.toLowerCase();
                            const withShopUpper = baseSku + 'SHOP';
                            
                            [sku, skuLower, skuUpper, baseSku, baseSkuLower, withShop, withShopLower, withShopUpper].forEach(key => {
                              if (!lookup[key]) lookup[key] = 0;
                              lookup[key] = Math.max(lookup[key], velocity); // Use max to avoid double-counting
                            });
                          };
                          
                          // Collect daily units for each SKU
                          last28Days.forEach((date, dayIndex) => {
                            const day = allDaysData[date];
                            const isRecent = dayIndex < 14; // First 14 days = recent
                            
                            // Process Shopify SKU data
                            const shopifySkuData = day?.shopify?.skuData;
                            const shopifyList = Array.isArray(shopifySkuData) ? shopifySkuData : Object.values(shopifySkuData || {});
                            
                            if (shopifyList.length > 0) daysWithShopifySkuData++;
                            
                            shopifyList.forEach(item => {
                              if (!item.sku) return;
                              const normalizedSku = item.sku.replace(/shop$/i, '').toUpperCase();
                              uniqueShopifySkus.add(normalizedSku);
                              const units = item.unitsSold || item.units || 0;
                              totalShopifyUnits += units;
                              
                              if (!skuDailyUnits[normalizedSku]) {
                                skuDailyUnits[normalizedSku] = { shopify: [], amazon: [], recentShopify: 0, priorShopify: 0, recentAmazon: 0, priorAmazon: 0 };
                              }
                              skuDailyUnits[normalizedSku].shopify.push(units);
                              if (isRecent) {
                                skuDailyUnits[normalizedSku].recentShopify += units;
                              } else {
                                skuDailyUnits[normalizedSku].priorShopify += units;
                              }
                            });
                            
                            // Process Amazon SKU data
                            const amazonSkuData = day?.amazon?.skuData;
                            const amazonList = Array.isArray(amazonSkuData) ? amazonSkuData : Object.values(amazonSkuData || {});
                            
                            if (amazonList.length > 0) daysWithAmazonSkuData++;
                            
                            amazonList.forEach(item => {
                              if (!item.sku) return;
                              const normalizedSku = item.sku.replace(/shop$/i, '').toUpperCase();
                              uniqueAmazonSkus.add(normalizedSku);
                              const units = item.unitsSold || item.units || 0;
                              totalAmazonUnits += units;
                              
                              if (!skuDailyUnits[normalizedSku]) {
                                skuDailyUnits[normalizedSku] = { shopify: [], amazon: [], recentShopify: 0, priorShopify: 0, recentAmazon: 0, priorAmazon: 0 };
                              }
                              skuDailyUnits[normalizedSku].amazon.push(units);
                              if (isRecent) {
                                skuDailyUnits[normalizedSku].recentAmazon += units;
                              } else {
                                skuDailyUnits[normalizedSku].priorAmazon += units;
                              }
                            });
                          });
                          
                          // Calculate WEIGHTED velocity for each SKU
                          // Formula: (Recent 2 weeks × 2 + Prior 2 weeks × 1) / 3 weeks equivalent
                          // This gives 2x weight to recent performance
                          Object.entries(skuDailyUnits).forEach(([sku, data]) => {
                            // Shopify weighted velocity
                            const shopifyRecent = data.recentShopify; // Units in last 14 days
                            const shopifyPrior = data.priorShopify;   // Units in prior 14 days
                            // Weighted: recent counts 2x, so it's like having 3 periods of 14 days
                            const shopifyWeightedTotal = (shopifyRecent * 2) + shopifyPrior;
                            const shopifyWeeksEquiv = 3 * 2; // 3 periods × 2 weeks each = 6 weeks equivalent
                            const shopifyVel = shopifyWeeksEquiv > 0 ? shopifyWeightedTotal / shopifyWeeksEquiv : 0;
                            
                            // Amazon weighted velocity
                            const amazonRecent = data.recentAmazon;
                            const amazonPrior = data.priorAmazon;
                            const amazonWeightedTotal = (amazonRecent * 2) + amazonPrior;
                            const amazonVel = shopifyWeeksEquiv > 0 ? amazonWeightedTotal / shopifyWeeksEquiv : 0;
                            
                            // Store raw velocities
                            storeVelocity(shopifyVelocityLookup, sku, shopifyVel);
                            storeVelocity(amazonVelocityLookup, sku, amazonVel);
                            
                            // Calculate trend (is velocity accelerating or decelerating?)
                            const recentWeeklyShopify = shopifyRecent / 2;
                            const priorWeeklyShopify = shopifyPrior / 2;
                            const recentWeeklyAmazon = amazonRecent / 2;
                            const priorWeeklyAmazon = amazonPrior / 2;
                            
                            const shopifyTrend = priorWeeklyShopify > 0 ? ((recentWeeklyShopify - priorWeeklyShopify) / priorWeeklyShopify) : 0;
                            const amazonTrend = priorWeeklyAmazon > 0 ? ((recentWeeklyAmazon - priorWeeklyAmazon) / priorWeeklyAmazon) : 0;
                            
                            velocityTrends[sku] = {
                              shopifyTrend: Math.round(shopifyTrend * 100), // % change
                              amazonTrend: Math.round(amazonTrend * 100),
                              totalTrend: Math.round(((shopifyTrend + amazonTrend) / 2) * 100),
                              accelerating: (shopifyTrend + amazonTrend) > 0.1, // >10% increase
                              decelerating: (shopifyTrend + amazonTrend) < -0.1, // >10% decrease
                            };
                            
                            // Store raw (uncorrected) velocity
                            rawVelocityLookup[sku] = shopifyVel + amazonVel;
                          });
                          
                          
                          // Show sample velocities with trends
                          const shopifyOnlySamples = ['DDPE0032', 'DDPE0005', 'DDPE0027'];
                          shopifyOnlySamples.forEach(sku => {
                            const trend = velocityTrends[sku];
                          });
                        } else {
                        }
                        
                        // SUPPLEMENT: Use weekly data for slow-moving SKUs with 0 daily velocity
                        // Daily data covers 28 days - slow sellers (soaps, etc.) may not sell in that window
                        // Weekly data covers ALL uploaded weeks - much longer window catches slow movers
                        const sortedWeeks = Object.keys(allWeeksData).sort();
                        if (sortedWeeks.length > 0) {
                          let weeklySupplementCount = 0;
                          const weeklyShopVel = {};
                          const weeklyAmzVel = {};
                          
                          sortedWeeks.forEach(w => {
                            const weekData = allWeeksData[w];
                            if (weekData.shopify?.skuData) {
                              const skuData = Array.isArray(weekData.shopify.skuData) ? weekData.shopify.skuData : Object.values(weekData.shopify.skuData);
                              skuData.forEach(item => {
                                if (!item.sku) return;
                                const normalized = item.sku.replace(/shop$/i, '').toUpperCase();
                                if (!weeklyShopVel[normalized]) weeklyShopVel[normalized] = 0;
                                weeklyShopVel[normalized] += (item.unitsSold || item.units || 0);
                              });
                            }
                            if (weekData.amazon?.skuData) {
                              const skuData = Array.isArray(weekData.amazon.skuData) ? weekData.amazon.skuData : Object.values(weekData.amazon.skuData);
                              skuData.forEach(item => {
                                if (!item.sku) return;
                                const normalized = item.sku.replace(/shop$/i, '').toUpperCase();
                                if (!weeklyAmzVel[normalized]) weeklyAmzVel[normalized] = 0;
                                weeklyAmzVel[normalized] += (item.unitsSold || item.units || 0);
                              });
                            }
                          });
                          
                          // Convert to weekly averages and fill gaps
                          const weekCount = sortedWeeks.length;
                          Object.entries(weeklyShopVel).forEach(([sku, totalUnits]) => {
                            const weeklyAvg = totalUnits / weekCount;
                            // Only supplement if daily data has 0 for this SKU
                            if (weeklyAvg > 0 && (!shopifyVelocityLookup[sku] || shopifyVelocityLookup[sku] === 0)) {
                              storeVelocity(shopifyVelocityLookup, sku, weeklyAvg);
                              weeklySupplementCount++;
                            }
                          });
                          Object.entries(weeklyAmzVel).forEach(([sku, totalUnits]) => {
                            const weeklyAvg = totalUnits / weekCount;
                            if (weeklyAvg > 0 && (!amazonVelocityLookup[sku] || amazonVelocityLookup[sku] === 0)) {
                              storeVelocity(amazonVelocityLookup, sku, weeklyAvg);
                            }
                          });
                          
                        }
                      } catch (e) {
                        devError('Error calculating velocity:', e);
                      }
                      
                      // Helper to get velocities for a SKU with forecast corrections applied
                      const getVelocitiesForSku = (sku) => {
                        if (!sku) return { amazon: 0, shopify: 0, total: 0, corrected: 0, correctionApplied: false, trend: 0 };
                        
                        const normalizedSku = sku.replace(/shop$/i, '').toUpperCase();
                        const variants = [
                          sku, sku.toLowerCase(), sku.toUpperCase(),
                          normalizedSku, normalizedSku.toLowerCase(),
                          normalizedSku + 'Shop', normalizedSku.toLowerCase() + 'shop', normalizedSku + 'SHOP',
                        ];
                        
                        let amazon = 0, shopify = 0;
                        for (const variant of variants) {
                          if (amazonVelocityLookup[variant] > 0 && amazon === 0) amazon = amazonVelocityLookup[variant];
                          if (shopifyVelocityLookup[variant] > 0 && shopify === 0) shopify = shopifyVelocityLookup[variant];
                          if (amazon > 0 && shopify > 0) break;
                        }
                        
                        const total = amazon + shopify;
                        const trend = velocityTrends[normalizedSku]?.totalTrend || 0;
                        
                        // Apply forecast corrections if we have enough confidence
                        let corrected = total;
                        let correctionApplied = false;
                        
                        if (forecastCorrections?.confidence >= 30 && forecastCorrections?.samplesUsed >= 2) {
                          // Check for SKU-specific correction first
                          if (forecastCorrections.bySku?.[normalizedSku]?.samples >= 2) {
                            corrected = total * (forecastCorrections.bySku[normalizedSku].units || 1);
                            correctionApplied = true;
                            // console.log(`Applied SKU correction to ${normalizedSku}: ${total.toFixed(2)} → ${corrected.toFixed(2)}`);
                          } else if (forecastCorrections.overall?.units) {
                            // Fall back to overall correction
                            corrected = total * forecastCorrections.overall.units;
                            correctionApplied = true;
                          }
                        }
                        
                        // Also apply trend adjustment for accelerating/decelerating products
                        // If accelerating >20%, bump up by 10%. If decelerating >20%, reduce by 10%
                        if (Math.abs(trend) > 20) {
                          const trendAdjustment = trend > 0 ? 1.1 : 0.9;
                          corrected = corrected * trendAdjustment;
                        }
                        
                        return { amazon, shopify, total, corrected, correctionApplied, trend };
                      };
                      
                      // Update current inventory snapshot with fresh Packiyo 3PL data
                      const today = new Date().toISOString().split('T')[0];
                      
                      // Find the best snapshot to update: today's, selected, or most recent
                      const targetDate = invHistory[today] ? today : 
                                        (selectedInvDate && invHistory[selectedInvDate]) ? selectedInvDate :
                                        Object.keys(invHistory).sort().reverse()[0];
                      
                      
                      if (targetDate && invHistory[targetDate] && data.inventoryBySku) {
                        const currentSnapshot = invHistory[targetDate];
                        const packiyoData = data.inventoryBySku;
                        
                        // Debug: log the keys/SKUs from both sources
                        
                        const today = new Date();
                        const reorderTriggerDays = leadTimeSettings.reorderTriggerDays || 60;
                        const minOrderWeeks = leadTimeSettings.minOrderWeeks || 22;
                        
                        // Create lookup that handles "Shop" suffix variations AND case insensitivity
                        // e.g., DDPE0022Shop should match DDPE0022, ddpe0022, etc.
                        // Base SKU is always uppercase without "Shop" suffix
                        const packiyoLookup = {};
                        
                        Object.entries(packiyoData).forEach(([sku, item]) => {
                          const normalizedKey = normalizeSkuKey(sku);
                          // Store with normalized key - this deduplicates automatically
                          packiyoLookup[normalizedKey] = item;
                        });
                        
                        
                        // Update each item's 3PL quantity and recalculate stockout dates
                        let newTplTotal = 0;
                        let newTplValue = 0;
                        let matchedCount = 0;
                        
                        // Debug: Log first few SKUs from both sources to diagnose mismatch
                        const packiyoSkuList = Object.keys(packiyoLookup).slice(0, 10);
                        const snapshotSkuList = currentSnapshot.items.slice(0, 10).map(i => i.sku);
                        
                        const updatedItems = currentSnapshot.items.map(item => {
                          // Normalize the item SKU the same way
                          const normalizedItemSku = normalizeSkuKey(item.sku);
                          
                          // Look up in normalized Packiyo lookup
                          let packiyoItem = packiyoLookup[normalizedItemSku];
                          
                          // Handle both snake_case and camelCase field names
                          const newTplQty = packiyoItem?.quantityOnHand || packiyoItem?.quantity_on_hand || packiyoItem?.totalQty || 0;
                          const newTplInbound = packiyoItem?.quantityInbound || packiyoItem?.quantity_inbound || 0;
                          
                          if (packiyoItem) {
                            matchedCount++;
                            if (matchedCount <= 3) {
                            }
                          }
                          
                          newTplTotal += newTplQty;
                          newTplValue += newTplQty * (item.cost || savedCogs[item.sku] || 0);
                          
                          const newTotalQty = (item.amazonQty || 0) + newTplQty + (item.homeQty || 0) + (item.awdQty || 0) + (item.amazonInbound || 0) + (item.awdInbound || 0) + newTplInbound;

                          // Get velocities from lookup with corrections applied
                          const velocityData = getVelocitiesForSku(item.sku);
                          const amzWeeklyVel = velocityData.amazon > 0 ? velocityData.amazon : (item.amzWeeklyVel || 0);
                          const shopWeeklyVel = velocityData.shopify > 0 ? velocityData.shopify : (item.shopWeeklyVel || 0);
                          const rawWeeklyVel = amzWeeklyVel + shopWeeklyVel;
                          
                          // Use CORRECTED velocity for DOS calculation (includes learning adjustments)
                          // But display RAW velocity in the UI for clarity (Tot Vel = AMZ + Shop)
                          const correctedVelForDOS = velocityData.corrected > 0 ? velocityData.corrected : rawWeeklyVel;
                          const correctionApplied = velocityData.correctionApplied;
                          const velocityTrend = velocityData.trend;
                          
                          // Display RAW total velocity (AMZ + Shop), but use corrected for DOS
                          const weeklyVel = rawWeeklyVel; // Show raw in UI
                          
                          // Debug: Log velocity lookup for first few items
                          if (matchedCount <= 5) {
                          }
                          
                          // Use CORRECTED velocity for Days of Supply calculation
                          const dos = correctedVelForDOS > 0 ? Math.round((newTotalQty / correctedVelForDOS) * 7) : 999;
                          const leadTimeDays = item.leadTimeDays || leadTimeSettings.defaultLeadTimeDays || 14;
                          
                          // Recalculate stockout and reorder dates using CORRECTED velocity
                          let stockoutDate = null;
                          let reorderByDate = null;
                          let daysUntilMustOrder = null;
                          
                          // Get demand stats for safety stock, seasonality, CV
                          const demandStats = skuDemandStatsRef.current[normalizeSkuKey(item.sku)] || null;
                          const leadTimeWeeks = leadTimeDays / 7;
                          const safetyStock = demandStats 
                            ? Math.ceil(1.65 * demandStats.weeklyStdDev * Math.sqrt(leadTimeWeeks))
                            : 0;
                          const seasonalFactor = demandStats?.currentSeasonalFactor || 1.0;
                          const seasonalVel = correctedVelForDOS * seasonalFactor;
                          const dailyVelForReorder = seasonalVel / 7;
                          const reorderPoint = Math.ceil((dailyVelForReorder * leadTimeDays) + safetyStock);
                          
                          if (correctedVelForDOS > 0 && dos < 999) {
                            const stockout = new Date(today);
                            stockout.setDate(stockout.getDate() + dos);
                            stockoutDate = stockout.toISOString().split('T')[0];
                            
                            const reorderPointDays = seasonalVel > 0 ? Math.round((reorderPoint / seasonalVel) * 7) : leadTimeDays;
                            daysUntilMustOrder = dos - reorderTriggerDays - reorderPointDays;
                            const reorderBy = new Date(today);
                            reorderBy.setDate(reorderBy.getDate() + daysUntilMustOrder);
                            reorderByDate = reorderBy.toISOString().split('T')[0];
                          }
                          
                          return {
                            ...item,
                            threeplQty: newTplQty,
                            threeplInbound: newTplInbound,
                            totalQty: newTotalQty,
                            totalValue: newTotalQty * (item.cost || 0),
                            weeklyVel, // RAW total velocity (AMZ + Shop) - displayed in UI
                            rawWeeklyVel, // Same as weeklyVel for clarity
                            correctedVel: correctedVelForDOS, // Corrected velocity - used for DOS
                            amzWeeklyVel, // Amazon-only velocity
                            shopWeeklyVel, // Shopify-only velocity
                            correctionApplied, // Whether forecast correction was applied
                            velocityTrend, // % trend (positive = accelerating)
                            daysOfSupply: dos,
                            stockoutDate,
                            reorderByDate,
                            daysUntilMustOrder,
                            suggestedOrderQty: correctedVelForDOS > 0 ? Math.ceil(correctedVelForDOS * minOrderWeeks) + safetyStock : 0,
                            safetyStock,
                            reorderPoint,
                            seasonalFactor: Math.round(seasonalFactor * 100) / 100,
                            seasonalVel: Math.round(seasonalVel * 10) / 10,
                            cv: demandStats?.cv || 0,
                            demandClass: demandStats?.demandClass || 'unknown',
                          };
                        });
                        
                        
                        // If no matches were found, we need to add Packiyo items as new items
                        // Filter out 0-qty items (digital products) from Packiyo
                        const physicalPackiyoItems = Object.entries(packiyoData)
                          .filter(([sku, item]) => {
                            const qty = item.quantityOnHand || item.quantity_on_hand || item.totalQty || 0;
                            return qty > 0; // Only physical products with inventory
                          })
                          .map(([sku, item]) => {
                            // Normalize SKU - strip Shop suffix, uppercase
                            const normalizedSku = normalizeSkuKey(sku);
                            return [normalizedSku, item];
                          })
                          // Deduplicate by normalized SKU (in case both DDPE0022 and DDPE0022Shop exist)
                          .filter((entry, idx, arr) => arr.findIndex(e => e[0] === entry[0]) === idx);
                        
                        
                        // If no matches, add Packiyo items directly
                        if (matchedCount === 0 && physicalPackiyoItems.length > 0) {
                          
                          // Reset totals since we're creating fresh
                          newTplTotal = 0;
                          newTplValue = 0;
                          
                          const today = new Date();
                          const reorderTriggerDays = leadTimeSettings.reorderTriggerDays || 60;
                          const minOrderWeeks = leadTimeSettings.minOrderWeeks || 22;
                          const defaultLeadTime = leadTimeSettings.defaultLeadTimeDays || 14;
                          
                          // Create new items from Packiyo physical products
                          const packiyoOnlyItems = physicalPackiyoItems.map(([normalizedSku, item]) => {
                            const qty = item.quantityOnHand || item.quantity_on_hand || item.totalQty || 0;
                            const cost = item.cost || savedCogs[normalizedSku] || savedCogs[normalizedSku + 'Shop'] || 0;
                            const inbound = item.quantityInbound || item.quantity_inbound || 0;
                            
                            // Get velocities from lookup with corrections
                            const velocityData = getVelocitiesForSku(normalizedSku);
                            const amzWeeklyVel = velocityData.amazon;
                            const shopWeeklyVel = velocityData.shopify;
                            const rawWeeklyVel = amzWeeklyVel + shopWeeklyVel;
                            const weeklyVel = velocityData.corrected > 0 ? velocityData.corrected : rawWeeklyVel;
                            const dos = weeklyVel > 0 ? Math.round((qty / weeklyVel) * 7) : 999;
                            
                            // Calculate stockout and reorder dates
                            let stockoutDate = null;
                            let reorderByDate = null;
                            let daysUntilMustOrder = null;
                            
                            if (weeklyVel > 0 && dos < 999) {
                              const stockout = new Date(today);
                              stockout.setDate(stockout.getDate() + dos);
                              stockoutDate = stockout.toISOString().split('T')[0];
                              
                              daysUntilMustOrder = dos - reorderTriggerDays - defaultLeadTime;
                              const reorderBy = new Date(today);
                              reorderBy.setDate(reorderBy.getDate() + daysUntilMustOrder);
                              reorderByDate = reorderBy.toISOString().split('T')[0];
                            }
                            
                            newTplTotal += qty;
                            newTplValue += qty * cost;
                            
                            return {
                              sku: normalizedSku, // Use normalized SKU (no Shop suffix, uppercase)
                              name: item.name || savedProductNames[normalizedSku] || savedProductNames[normalizedSku + 'Shop'] || normalizedSku,
                              threeplQty: qty,
                              threeplInbound: inbound,
                              amazonQty: 0,
                              homeQty: 0,
                              totalQty: qty,
                              cost,
                              totalValue: qty * cost,
                              source: 'packiyo',
                              weeklyVel,
                              rawWeeklyVel,
                              amzWeeklyVel,
                              shopWeeklyVel,
                              correctionApplied: velocityData.correctionApplied,
                              velocityTrend: velocityData.trend,
                              daysOfSupply: dos,
                              stockoutDate,
                              reorderByDate,
                              daysUntilMustOrder,
                              suggestedOrderQty: weeklyVel > 0 ? Math.ceil(weeklyVel * minOrderWeeks) : 0,
                              leadTimeDays: defaultLeadTime,
                            };
                          });
                          
                          // Combine with any existing items that have Amazon data
                          const existingWithData = updatedItems.filter(i => (i.amazonQty || 0) > 0 || (i.homeQty || 0) > 0);
                          const combinedItems = [...existingWithData, ...packiyoOnlyItems];
                          combinedItems.sort((a, b) => b.totalValue - a.totalValue);
                          
                          
                          updatedItems.length = 0;
                          updatedItems.push(...combinedItems);
                        } else if (matchedCount < physicalPackiyoItems.length) {
                          // Some Packiyo items weren't matched - add them as new items
                          const matchedSkus = new Set(updatedItems.filter(i => i.threeplQty > 0).map(i => normalizeSkuKey(i.sku)));
                          
                          const today = new Date();
                          const reorderTriggerDays = leadTimeSettings.reorderTriggerDays || 60;
                          const minOrderWeeks = leadTimeSettings.minOrderWeeks || 22;
                          const defaultLeadTime = leadTimeSettings.defaultLeadTimeDays || 14;
                          
                          const unmatchedPackiyoItems = physicalPackiyoItems
                            .filter(([normalizedSku]) => !matchedSkus.has(normalizedSku))
                            .map(([normalizedSku, item]) => {
                              const qty = item.quantityOnHand || item.quantity_on_hand || item.totalQty || 0;
                              const cost = item.cost || savedCogs[normalizedSku] || savedCogs[normalizedSku + 'Shop'] || 0;
                              const inbound = item.quantityInbound || item.quantity_inbound || 0;
                              
                              // Get velocities from lookup with corrections
                              const velocityData = getVelocitiesForSku(normalizedSku);
                              const amzWeeklyVel = velocityData.amazon;
                              const shopWeeklyVel = velocityData.shopify;
                              const rawWeeklyVel = amzWeeklyVel + shopWeeklyVel;
                              const weeklyVel = velocityData.corrected > 0 ? velocityData.corrected : rawWeeklyVel;
                              const dos = weeklyVel > 0 ? Math.round((qty / weeklyVel) * 7) : 999;
                              
                              // Calculate stockout and reorder dates
                              let stockoutDate = null;
                              let reorderByDate = null;
                              let daysUntilMustOrder = null;
                              
                              if (weeklyVel > 0 && dos < 999) {
                                const stockout = new Date(today);
                                stockout.setDate(stockout.getDate() + dos);
                                stockoutDate = stockout.toISOString().split('T')[0];
                                
                                daysUntilMustOrder = dos - reorderTriggerDays - defaultLeadTime;
                                const reorderBy = new Date(today);
                                reorderBy.setDate(reorderBy.getDate() + daysUntilMustOrder);
                                reorderByDate = reorderBy.toISOString().split('T')[0];
                              }
                              
                              newTplTotal += qty;
                              newTplValue += qty * cost;
                              
                              return {
                                sku: normalizedSku,
                                name: item.name || savedProductNames[normalizedSku] || savedProductNames[normalizedSku + 'Shop'] || normalizedSku,
                                threeplQty: qty,
                                threeplInbound: inbound,
                                amazonQty: 0,
                                homeQty: 0,
                                totalQty: qty,
                                cost,
                                totalValue: qty * cost,
                                source: 'packiyo',
                                weeklyVel,
                                rawWeeklyVel,
                                amzWeeklyVel,
                                shopWeeklyVel,
                                correctionApplied: velocityData.correctionApplied,
                                velocityTrend: velocityData.trend,
                                daysOfSupply: dos,
                                stockoutDate,
                                reorderByDate,
                                daysUntilMustOrder,
                                suggestedOrderQty: weeklyVel > 0 ? Math.ceil(weeklyVel * minOrderWeeks) : 0,
                                leadTimeDays: defaultLeadTime,
                              };
                            });
                          
                          if (unmatchedPackiyoItems.length > 0) {
                            updatedItems.push(...unmatchedPackiyoItems);
                          }
                        }
                        
                        // Sort by total value
                        updatedItems.sort((a, b) => b.totalValue - a.totalValue);
                        
                        // Recalculate supply chain KPIs
                        let critical2 = 0, low2 = 0, healthy2 = 0, overstock2 = 0;
                        updatedItems.forEach(item => {
                          if (item.health === 'critical') critical2++;
                          else if (item.health === 'low') low2++;
                          else if (item.health === 'healthy') healthy2++;
                          else if (item.health === 'overstock') overstock2++;
                        });
                        const withTurnover2 = updatedItems.filter(i => i.turnoverRate > 0);
                        const avgTurnover2 = withTurnover2.length > 0 ? withTurnover2.reduce((s, i) => s + i.turnoverRate, 0) / withTurnover2.length : 0;
                        const totalCarrying2 = updatedItems.reduce((s, i) => s + (i.annualCarryingCost || 0), 0);
                        const withSellThru2 = updatedItems.filter(i => i.sellThroughRate > 0);
                        const avgSellThru2 = withSellThru2.length > 0 ? withSellThru2.reduce((s, i) => s + i.sellThroughRate, 0) / withSellThru2.length : 0;
                        const withVel2 = updatedItems.filter(i => i.weeklyVel > 0);
                        const inStock2 = withVel2.length > 0 ? Math.round((withVel2.filter(i => i.totalQty > 0).length / withVel2.length) * 1000) / 10 : 100;
                        const abc2 = updatedItems.reduce((acc, i) => { acc[i.abcClass] = (acc[i.abcClass] || 0) + 1; return acc; }, {});
                        
                        // Update the snapshot
                        const updatedSnapshot = {
                          ...currentSnapshot,
                          items: updatedItems,
                          summary: {
                            ...currentSnapshot.summary,
                            threeplUnits: newTplTotal,
                            threeplValue: newTplValue,
                            totalUnits: (currentSnapshot.summary?.amazonUnits || 0) + newTplTotal + (currentSnapshot.summary?.homeUnits || 0) + (currentSnapshot.summary?.awdUnits || 0) + (currentSnapshot.summary?.amazonInbound || 0),
                            totalValue: (currentSnapshot.summary?.amazonValue || 0) + newTplValue + (currentSnapshot.summary?.homeValue || 0) + (currentSnapshot.summary?.awdValue || 0),
                            skuCount: updatedItems.length,
                            critical: critical2, low: low2, healthy: healthy2, overstock: overstock2,
                            avgTurnover: Math.round(avgTurnover2 * 10) / 10,
                            totalCarryingCost: Math.round(totalCarrying2),
                            avgSellThrough: Math.round(avgSellThru2 * 10) / 10,
                            inStockRate: inStock2,
                            abcCounts: abc2,
                          },
                          sources: {
                            ...currentSnapshot.sources,
                            threepl: 'packiyo-direct',
                            packiyoConnected: true,
                            lastPackiyoSync: new Date().toISOString(),
                          },
                        };
                        
                        
                        const updatedHistory = { ...invHistory, [targetDate]: updatedSnapshot };
                        setInvHistory(updatedHistory);
                        setSelectedInvDate(targetDate); // Make sure the updated snapshot is selected
                        saveInv(updatedHistory);
                        setToast({ message: `Updated inventory with ${newTplTotal.toLocaleString()} 3PL units (${formatCurrency(newTplValue)})`, type: 'success' });
                      } else if (data.inventoryBySku && Object.keys(data.inventoryBySku).length > 0) {
                        // Check if there's ANY snapshot we can merge with for today's date
                        const todayDate = new Date().toISOString().split('T')[0];
                        const existingTodaySnapshot = invHistory[todayDate];
                        
                        if (existingTodaySnapshot) {
                          // MERGE with existing today snapshot - don't overwrite!
                          const packiyoData = data.inventoryBySku;
                          
                          // Create Packiyo lookup with normalized keys
                          const packiyoLookup = {};
                          Object.entries(packiyoData).forEach(([sku, item]) => {
                            const normalizedKey = normalizeSkuKey(sku);
                            packiyoLookup[normalizedKey] = item;
                          });
                          
                          let newTplTotal = 0;
                          let newTplValue = 0;
                          
                          // Update existing items with Packiyo quantities
                          const updatedItems = existingTodaySnapshot.items.map(item => {
                            const normalizedItemSku = normalizeSkuKey(item.sku);
                            const packiyoItem = packiyoLookup[normalizedItemSku];
                            const newTplQty = packiyoItem?.quantityOnHand || packiyoItem?.quantity_on_hand || packiyoItem?.totalQty || 0;
                            const newTplInbound = packiyoItem?.quantityInbound || packiyoItem?.quantity_inbound || 0;
                            
                            newTplTotal += newTplQty;
                            newTplValue += newTplQty * (item.cost || savedCogs[item.sku] || savedCogs[normalizedItemSku] || 0);
                            
                            const newTotalQty = (item.amazonQty || 0) + newTplQty + (item.homeQty || 0) + (item.awdQty || 0) + (item.amazonInbound || 0) + (item.awdInbound || 0) + newTplInbound;

                            return {
                              ...item, // PRESERVE Amazon + AWD data!
                              threeplQty: newTplQty,
                              threeplInbound: newTplInbound,
                              totalQty: newTotalQty,
                              totalValue: newTotalQty * (item.cost || 0),
                            };
                          });

                          updatedItems.sort((a, b) => b.totalValue - a.totalValue);

                          const mergedSnapshot = {
                            ...existingTodaySnapshot,
                            items: updatedItems,
                            summary: {
                              ...existingTodaySnapshot.summary,
                              threeplUnits: newTplTotal,
                              threeplValue: newTplValue,
                              totalUnits: (existingTodaySnapshot.summary?.amazonUnits || 0) + newTplTotal + (existingTodaySnapshot.summary?.homeUnits || 0) + (existingTodaySnapshot.summary?.awdUnits || 0) + (existingTodaySnapshot.summary?.amazonInbound || 0),
                              totalValue: (existingTodaySnapshot.summary?.amazonValue || 0) + newTplValue + (existingTodaySnapshot.summary?.homeValue || 0) + (existingTodaySnapshot.summary?.awdValue || 0),
                              skuCount: updatedItems.length,
                            },
                            sources: {
                              ...existingTodaySnapshot.sources,
                              threepl: 'packiyo-direct',
                              packiyoConnected: true,
                              lastPackiyoSync: new Date().toISOString(),
                            },
                          };
                          
                          const newHistory = { ...invHistory, [todayDate]: mergedSnapshot };
                          setInvHistory(newHistory);
                          setSelectedInvDate(todayDate);
                          saveInv(newHistory);
                          setToast({ message: `Merged ${newTplTotal.toLocaleString()} 3PL units with existing inventory`, type: 'success' });
                        } else {
                          // No snapshot exists for today - don't create 3PL-only snapshot that would lose Amazon data
                          // Instead, tell user to create inventory snapshot first
                          setToast({ 
                            message: 'Packiyo synced but no inventory snapshot exists for today. Go to Inventory tab and create a new snapshot to include Amazon + 3PL data.', 
                            type: 'warning' 
                          });
                        }
                      }
                    } catch (err) {
                      setPackiyoInventoryStatus({ loading: false, error: err.message, lastSync: null });
                      setToast({ message: 'Packiyo sync failed: ' + err.message, type: 'error' });
                    }
                  }}
                  disabled={packiyoInventoryStatus.loading}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm text-white flex items-center gap-2"
                >
                  {packiyoInventoryStatus.loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Syncing...</>
                  ) : (
                    <><RefreshCw className="w-4 h-4" />Sync Now</>
                  )}
                </button>
              </SettingRow>
              
              {/* Show inventory preview if available */}
              {packiyoInventoryData && (
                <div className="bg-slate-800/50 rounded-xl p-4 mt-4">
                  <h4 className="text-white font-medium mb-3">Packiyo Inventory</h4>
                  {(() => {
                    // Calculate total value using COGS lookup
                    const items = packiyoInventoryData.items || [];
                    const cogsLookup = getCogsLookup();
                    
                    // Smart COGS lookup that handles SKU variants (e.g. DDPE0003Shop -> DDPE0003)
                    const smartCogs = (sku) => {
                      if (!sku) return 0;
                      const s = sku.trim();
                      const pick = (k) => { const v = cogsLookup[k]; return typeof v === 'number' ? v : (v?.cost || 0); };
                      let c = pick(s); if (c) return c;
                      const base = s.replace(/Shop$/i, '');
                      for (const k of [base, base + 'Shop', s.toLowerCase(), base.toLowerCase(), s.toUpperCase(), base.toUpperCase()]) {
                        c = pick(k); if (c) return c;
                      }
                      return 0;
                    };
                    
                    // Add COGS-based value to each item
                    const itemsWithValue = items.map(item => {
                      const cogs = smartCogs(item.sku);
                      return {
                        ...item,
                        cogs,
                        value: item.quantity_on_hand * cogs,
                      };
                    }).sort((a, b) => b.value - a.value); // Sort by value
                    
                    const totalValue = itemsWithValue.reduce((s, i) => s + i.value, 0);
                    const totalUnits = items.reduce((s, i) => s + (i.quantity_on_hand || 0), 0);
                    const skusWithCogs = itemsWithValue.filter(i => i.cogs > 0).length;
                    
                    return (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                          <div className="bg-slate-900/50 rounded-lg p-3">
                            <p className="text-slate-400 text-xs">Total Units</p>
                            <p className="text-xl font-bold text-white">{totalUnits.toLocaleString()}</p>
                          </div>
                          <div className="bg-slate-900/50 rounded-lg p-3">
                            <p className="text-slate-400 text-xs">Total Value</p>
                            <p className="text-xl font-bold text-emerald-400">{formatCurrency(totalValue)}</p>
                            {skusWithCogs < items.length && (
                              <p className="text-amber-400 text-[10px]">{skusWithCogs}/{items.length} have COGS</p>
                            )}
                          </div>
                          <div className="bg-slate-900/50 rounded-lg p-3">
                            <p className="text-slate-400 text-xs">SKUs</p>
                            <p className="text-xl font-bold text-white">{items.length}</p>
                          </div>
                          <div className="bg-slate-900/50 rounded-lg p-3">
                            <p className="text-slate-400 text-xs">Source</p>
                            <p className="text-sm font-medium text-violet-400">Excel3PL Direct</p>
                          </div>
                        </div>
                        
                        {/* Top items preview - sorted by value */}
                        {itemsWithValue.length > 0 && (
                          <div>
                            <p className="text-slate-400 text-sm mb-2">Top Items by Value</p>
                            <div className="space-y-1 max-h-48 overflow-y-auto">
                              {itemsWithValue.slice(0, 10).map(item => (
                                <div key={item.sku} className="flex items-center justify-between text-sm bg-slate-900/30 rounded px-2 py-1">
                                  <span className="text-slate-300 truncate flex-1">{item.sku}</span>
                                  <span className="text-white font-medium ml-2">{item.quantity_on_hand}</span>
                                  <span className={`ml-2 w-20 text-right ${item.cogs > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                                    {item.cogs > 0 ? formatCurrency(item.value) : 'No COGS'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
              
              {packiyoInventoryStatus.error && (
                <div className="bg-rose-900/30 border border-rose-500/30 rounded-lg p-3">
                  <p className="text-rose-400 text-sm">{packiyoInventoryStatus.error}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-slate-900/50 rounded-xl p-4">
                <div className="space-y-4">
                  <div>
                    <label className="block text-slate-300 text-sm font-medium mb-2">API Token</label>
                    <input
                      type="text" style={{WebkitTextSecurity: "disc"}}
                      placeholder="Your Packiyo API token"
                      value={packiyoCredentials.apiKey}
                      onChange={(e) => setPackiyoCredentials(p => ({ ...p, apiKey: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <p className="text-slate-500 text-xs mt-1">From Packiyo → Settings → API Keys</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-300 text-sm font-medium mb-2">Customer ID</label>
                      <input
                        type="text"
                        placeholder="134"
                        value={packiyoCredentials.customerId}
                        onChange={(e) => setPackiyoCredentials(p => ({ ...p, customerId: e.target.value }))}
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 text-sm font-medium mb-2">Base URL</label>
                      <input
                        type="text"
                        placeholder="https://excel3pl.packiyo.com/api/v1"
                        value={packiyoCredentials.baseUrl}
                        onChange={(e) => setPackiyoCredentials(p => ({ ...p, baseUrl: e.target.value }))}
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      if (!packiyoCredentials.apiKey || !packiyoCredentials.customerId) {
                        setToast({ message: 'Please enter API Token and Customer ID', type: 'error' });
                        return;
                      }
                      try {
                        const res = await fetch('/api/packiyo/sync', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            apiKey: packiyoCredentials.apiKey,
                            customerId: packiyoCredentials.customerId,
                            baseUrl: packiyoCredentials.baseUrl,
                            test: true,
                          }),
                        });
                        const data = await res.json();
                        if (data.error) throw new Error(data.error);
                        if (data.success) {
                          const updatedCreds = { ...packiyoCredentials, connected: true, customerName: data.customerName || 'Excel3PL' };
                          setPackiyoCredentials(updatedCreds);
                          // IMMEDIATELY save to cloud to persist across sessions
                          if (session?.user?.id && supabase) {
                            pushToCloudNow({ ...combinedData, packiyoCredentials: updatedCreds }, true);
                          }
                          setToast({ message: `Connected to ${data.customerName || 'Packiyo'}!`, type: 'success' });
                        }
                      } catch (err) {
                        setToast({ message: 'Connection failed: ' + err.message, type: 'error' });
                      }
                    }}
                    disabled={!packiyoCredentials.apiKey || !packiyoCredentials.customerId}
                    className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:hover:bg-violet-600 rounded-xl text-white font-semibold flex items-center justify-center gap-2"
                  >
                    <Boxes className="w-5 h-5" />
                    Test & Connect
                  </button>
                </div>
              </div>
              
              <div className="bg-violet-900/20 border border-violet-500/30 rounded-xl p-4">
                <h4 className="text-violet-400 font-medium mb-2 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4" />
                  Your Packiyo Connection Info
                </h4>
                <div className="text-slate-300 text-sm space-y-1">
                  <p><strong>URL:</strong> https://excel3pl.packiyo.com/api/v1</p>
                  <p><strong>Tenant:</strong> excel3pl</p>
                  <p><strong>Customer ID:</strong> 134</p>
                </div>
                <p className="text-slate-500 text-xs mt-3">This will pull inventory directly from Packiyo, separate from Shopify's inventory sync.</p>
              </div>
            </div>
          )}
        </SettingSection>

        {/* Ship Sidekick 3PL + Shipping */}
        <SettingSection title="🚚 Ship Sidekick (3PL + Shipping)">
          <p className="text-slate-400 text-sm mb-4">Your primary 3PL provider — syncs inventory, carriers, and shipping rates directly to the Inventory page</p>

          {shipSidekickCredentials?.connected ? (
            <div className="space-y-4">
              <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
                      <Check className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-emerald-400 font-medium">Connected</p>
                      <p className="text-slate-400 text-sm">{shipSidekickCredentials.accountName || 'Ship Sidekick'}</p>
                      <p className="text-slate-500 text-xs">
                        Environment: {shipSidekickCredentials.environment === 'production' ? 'Production' : 'Test'}
                        {shipSidekickCredentials.clientSlug && ` | Org: ${shipSidekickCredentials.clientSlug}`}
                      </p>
                      {shipSidekickCredentials.lastSync && (
                        <p className="text-slate-500 text-xs">Last sync: {new Date(shipSidekickCredentials.lastSync).toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm('Disconnect from Ship Sidekick?')) {
                        setShipSidekickCredentials({ apiKey: '', clientSlug: 'tallowbourn', environment: 'production', connected: false, lastSync: null, accountName: '' });
                        setToast({ message: 'Ship Sidekick disconnected', type: 'success' });
                      }
                    }}
                    className="px-4 py-2 bg-rose-600/30 hover:bg-rose-600/50 border border-rose-500/50 rounded-lg text-sm text-rose-300"
                  >
                    Disconnect
                  </button>
                </div>
              </div>

              {/* Sync 3PL Inventory */}
              <SettingRow label="Sync 3PL Inventory" desc="Pull latest inventory from Ship Sidekick and update inventory page">
                <button
                  onClick={async () => {
                    setPackiyoInventoryStatus({ loading: true, error: null, lastSync: null });
                    try {
                      const res = await fetch('/api/shipsidekick/sync', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          apiKey: shipSidekickCredentials.apiKey,
                          clientSlug: shipSidekickCredentials.clientSlug,
                          environment: shipSidekickCredentials.environment || 'production',
                          syncType: 'inventory',
                        }),
                      });
                      const data = await res.json();
                      if (data.debugLog) {
                        setShipSidekickCredentials(p => ({ ...p, lastDebugLog: data.debugLog, lastRawKeys: data.rawResponseKeys, lastMatchedUrl: data.matchedUrl }));
                      }
                      if (data.error) throw new Error(data.error);
                      if (data.inventoryBySku || data.products) {
                        setPackiyoInventoryData(data);
                      }
                      setShipSidekickCredentials(p => ({ ...p, lastSync: new Date().toISOString() }));
                      setPackiyoInventoryStatus({ loading: false, error: null, lastSync: new Date().toISOString() });

                      // ===== MERGE INTO EXISTING INVENTORY SNAPSHOT =====
                      if (data.inventoryBySku) {
                        const todayStr = new Date().toISOString().split('T')[0];
                        const targetDate = invHistory[todayStr] ? todayStr :
                          (selectedInvDate && invHistory[selectedInvDate]) ? selectedInvDate :
                          Object.keys(invHistory).sort().reverse()[0];

                        if (targetDate && invHistory[targetDate]) {
                          const currentSnapshot = invHistory[targetDate];
                          const tplLookup = {};
                          Object.entries(data.inventoryBySku).forEach(([sku, item]) => {
                            tplLookup[normalizeSkuKey(sku)] = item;
                          });

                          let newTplTotal = 0, newTplValue = 0;
                          const today = new Date();
                          const reorderTriggerDays = leadTimeSettings.reorderTriggerDays || 60;
                          const minOrderWeeks = leadTimeSettings.minOrderWeeks || 22;
                          const liveLeadTimeDays = leadTimeSettings.defaultLeadTimeDays || 14;
                          const liveOverstockThreshold = Math.max(90, (minOrderWeeks * 7) + reorderTriggerDays + liveLeadTimeDays);
                          const liveLowThreshold = Math.max(30, liveLeadTimeDays + 14);
                          const liveCriticalThreshold = Math.max(14, liveLeadTimeDays);

                          const updatedItems = currentSnapshot.items.map(item => {
                            const normalizedSku = normalizeSkuKey(item.sku);
                            const tplItem = tplLookup[normalizedSku];
                            const newTplQty = tplItem?.quantity_on_hand || tplItem?.quantityOnHand || tplItem?.totalQty || 0;
                            const newTplInbound = tplItem?.quantity_inbound || tplItem?.quantityInbound || 0;

                            newTplTotal += newTplQty;
                            newTplValue += newTplQty * (item.cost || savedCogs[item.sku] || 0);

                            const newTotalQty = (item.amazonQty || 0) + newTplQty + (item.homeQty || 0) + (item.awdQty || 0) + (item.amazonInbound || 0) + (item.awdInbound || 0) + newTplInbound;
                            const vel = item.correctedVel || item.weeklyVel || 0;
                            const dos = vel > 0 ? Math.round((newTotalQty / vel) * 7) : 999;

                            let stockoutDate = null, reorderByDate = null, daysUntilMustOrder = null;
                            const leadTimeDays = item.leadTimeDays || liveLeadTimeDays;
                            const demandStats = skuDemandStatsRef?.current?.[normalizeSkuKey(item.sku)] || null;
                            const leadTimeWeeks = leadTimeDays / 7;
                            const safetyStock = demandStats ? Math.ceil(1.65 * demandStats.weeklyStdDev * Math.sqrt(leadTimeWeeks)) : (item.safetyStock || 0);
                            const seasonalFactor = demandStats?.currentSeasonalFactor || item.seasonalFactor || 1.0;
                            const seasonalVel = vel * seasonalFactor;
                            const dailyVelForReorder = seasonalVel / 7;
                            const reorderPoint = Math.ceil((dailyVelForReorder * leadTimeDays) + safetyStock);

                            if (vel > 0 && dos < 999) {
                              const stockout = new Date(today);
                              stockout.setDate(stockout.getDate() + dos);
                              stockoutDate = stockout.toISOString().split('T')[0];
                              const reorderPointDays = seasonalVel > 0 ? Math.round((reorderPoint / seasonalVel) * 7) : leadTimeDays;
                              daysUntilMustOrder = dos - reorderTriggerDays - reorderPointDays;
                              const reorderBy = new Date(today);
                              reorderBy.setDate(reorderBy.getDate() + daysUntilMustOrder);
                              reorderByDate = reorderBy.toISOString().split('T')[0];
                            }

                            let health = item.health || 'unknown';
                            const rawVel = item.rawWeeklyVel || item.weeklyVel || 0;
                            if (rawVel > 0) {
                              if (daysUntilMustOrder !== null && daysUntilMustOrder < 0) health = 'critical';
                              else if (dos < liveCriticalThreshold || (daysUntilMustOrder !== null && daysUntilMustOrder < 7)) health = 'critical';
                              else if (dos < liveLowThreshold || (daysUntilMustOrder !== null && daysUntilMustOrder < 14)) health = 'low';
                              else if (dos <= liveOverstockThreshold) health = 'healthy';
                              else health = 'overstock';
                            }

                            return {
                              ...item,
                              threeplQty: newTplQty,
                              threeplInbound: newTplInbound,
                              totalQty: newTotalQty,
                              totalValue: newTotalQty * (item.cost || 0),
                              daysOfSupply: dos,
                              stockoutDate,
                              reorderByDate,
                              daysUntilMustOrder,
                              health,
                              safetyStock,
                              reorderPoint,
                              suggestedOrderQty: vel > 0 ? Math.ceil(vel * minOrderWeeks) + safetyStock : 0,
                            };
                          });

                          // Add 3PL-only SKUs not already in snapshot
                          const existingSkus = new Set(updatedItems.map(i => normalizeSkuKey(i.sku)));
                          Object.entries(data.inventoryBySku).forEach(([sku, item]) => {
                            const nSku = normalizeSkuKey(sku);
                            if (existingSkus.has(nSku)) return;
                            const qty = item.quantity_on_hand || item.quantityOnHand || item.totalQty || 0;
                            if (qty === 0) return;
                            const cost = item.cost || savedCogs[nSku] || savedCogs[nSku + 'Shop'] || 0;
                            const inbound = item.quantity_inbound || item.quantityInbound || 0;
                            newTplTotal += qty;
                            newTplValue += qty * cost;
                            updatedItems.push({
                              sku: nSku, name: item.name || nSku,
                              threeplQty: qty, threeplInbound: inbound,
                              amazonQty: 0, homeQty: 0, awdQty: 0, awdInbound: 0, amazonInbound: 0,
                              totalQty: qty + inbound, cost, totalValue: (qty + inbound) * cost,
                              weeklyVel: 0, rawWeeklyVel: 0, correctedVel: 0,
                              amzWeeklyVel: 0, shopWeeklyVel: 0,
                              daysOfSupply: 999, health: 'unknown',
                              stockoutDate: null, reorderByDate: null, daysUntilMustOrder: null,
                              suggestedOrderQty: 0, safetyStock: 0, reorderPoint: 0,
                              leadTimeDays: liveLeadTimeDays,
                            });
                          });

                          updatedItems.sort((a, b) => b.totalValue - a.totalValue);

                          let critical = 0, low = 0, healthy = 0, overstock = 0;
                          updatedItems.forEach(i => {
                            if (i.health === 'critical') critical++;
                            else if (i.health === 'low') low++;
                            else if (i.health === 'healthy') healthy++;
                            else if (i.health === 'overstock') overstock++;
                          });

                          // Recalculate all inventory totals from items for accuracy
                          const newAmzTotal = updatedItems.reduce((s, i) => s + (i.amazonQty || 0), 0);
                          const newAmzValue = updatedItems.reduce((s, i) => s + ((i.amazonQty || 0) * (i.cost || 0)), 0);
                          const newAmzInbound = updatedItems.reduce((s, i) => s + (i.amazonInbound || 0), 0);
                          const newAwdTotal = updatedItems.reduce((s, i) => s + (i.awdQty || 0), 0);
                          const newAwdValue = updatedItems.reduce((s, i) => s + ((i.awdQty || 0) * (i.cost || 0)), 0);
                          const newHomeUnits = updatedItems.reduce((s, i) => s + (i.homeQty || 0), 0);
                          const newHomeValue = updatedItems.reduce((s, i) => s + ((i.homeQty || 0) * (i.cost || 0)), 0);

                          const updatedSnapshot = {
                            ...currentSnapshot,
                            items: updatedItems,
                            summary: {
                              ...currentSnapshot.summary,
                              amazonUnits: newAmzTotal,
                              amazonValue: newAmzValue,
                              amazonInbound: newAmzInbound,
                              awdUnits: newAwdTotal,
                              awdValue: newAwdValue,
                              homeUnits: newHomeUnits,
                              homeValue: newHomeValue,
                              threeplUnits: newTplTotal,
                              threeplValue: newTplValue,
                              totalUnits: updatedItems.reduce((s, i) => s + (i.totalQty || 0), 0),
                              totalValue: updatedItems.reduce((s, i) => s + (i.totalValue || 0), 0),
                              skuCount: updatedItems.length,
                              critical, low, healthy, overstock,
                            },
                            sources: {
                              ...currentSnapshot.sources,
                              threepl: 'shipsidekick-manual-sync',
                              lastShipSidekickSync: new Date().toISOString(),
                            },
                          };

                          const updatedHistory = { ...invHistory, [targetDate]: updatedSnapshot };
                          setInvHistory(updatedHistory);
                          setSelectedInvDate(targetDate);
                          saveInv(updatedHistory);
                          setToast({ message: `Updated inventory: ${newTplTotal.toLocaleString()} 3PL units across ${updatedItems.length} SKUs`, type: 'success' });
                        } else {
                          setToast({ message: `Synced ${data.summary?.skuCount || 0} SKUs from Ship Sidekick (no snapshot to update)`, type: 'warning' });
                        }
                      } else {
                        setToast({ message: `Synced ${data.summary?.skuCount || 0} SKUs from Ship Sidekick`, type: 'success' });
                      }
                    } catch (err) {
                      setPackiyoInventoryStatus({ loading: false, error: err.message, lastSync: null });
                      setToast({ message: 'Inventory sync failed: ' + err.message, type: 'error' });
                    }
                  }}
                  disabled={packiyoInventoryStatus?.loading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm text-white flex items-center gap-2"
                >
                  {packiyoInventoryStatus?.loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Syncing...</>
                  ) : (
                    <><RefreshCw className="w-4 h-4" />Sync Inventory</>
                  )}
                </button>
              </SettingRow>

              {/* Diagnostic: Raw API dump */}
              <SettingRow label="API Diagnostic" desc="Dump raw Ship Sidekick API response to debug inventory mismatch">
                <button
                  onClick={async () => {
                    setShipSidekickCredentials(p => ({ ...p, lastDebugLog: ['Running diagnostic...'] }));
                    try {
                      const res = await fetch('/api/shipsidekick/sync', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          apiKey: shipSidekickCredentials.apiKey,
                          clientSlug: shipSidekickCredentials.clientSlug,
                          environment: shipSidekickCredentials.environment || 'production',
                          syncType: 'diagnostic',
                        }),
                      });
                      const data = await res.json();
                      // Format the raw response as debug lines
                      const lines = [];
                      lines.push('=== RAW API DIAGNOSTIC ===');
                      if (data.productsEndpoint?.data?.data) {
                        for (const p of data.productsEndpoint.data.data) {
                          lines.push(`PRODUCT: ${p.name || p.title} (id=${p.id})`);
                          lines.push(`  keys: ${JSON.stringify(Object.keys(p))}`);
                          const variants = p.productVariants || p.variants || [];
                          for (const v of variants) {
                            lines.push(`  VARIANT: ${v.sku} (id=${v.id})`);
                            lines.push(`    all keys: ${JSON.stringify(Object.keys(v))}`);
                            // Show ALL numeric fields
                            const nums = {};
                            for (const [k, val] of Object.entries(v)) {
                              if (typeof val === 'number') nums[k] = val;
                            }
                            lines.push(`    numeric fields: ${JSON.stringify(nums)}`);
                            const levels = v.inventoryLevels || v.inventory_levels || [];
                            lines.push(`    inventoryLevels (${Array.isArray(levels) ? levels.length : typeof levels}): ${JSON.stringify(levels).slice(0, 800)}`);
                          }
                        }
                      } else {
                        lines.push(`Products raw: ${JSON.stringify(data.productsEndpoint).slice(0, 2000)}`);
                      }
                      lines.push('--- /inventory-levels endpoint ---');
                      lines.push(JSON.stringify(data.inventoryLevelsEndpoint)?.slice(0, 2000) || 'null');
                      lines.push('--- variant detail ---');
                      lines.push(JSON.stringify(data.variantDetail)?.slice(0, 1000) || 'null');
                      setShipSidekickCredentials(p => ({ ...p, lastDebugLog: lines }));
                    } catch (err) {
                      setShipSidekickCredentials(p => ({ ...p, lastDebugLog: ['Diagnostic error: ' + err.message] }));
                    }
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm text-white flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />Run Diagnostic
                </button>
              </SettingRow>

              {/* Inventory Sync Debug Log */}
              {shipSidekickCredentials.lastDebugLog && shipSidekickCredentials.lastDebugLog.length > 0 && (
                <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-400">Inventory Sync Debug Log</span>
                    <button onClick={() => setShipSidekickCredentials(p => ({ ...p, lastDebugLog: null }))} className="text-xs text-slate-500 hover:text-slate-300">Clear</button>
                  </div>
                  {shipSidekickCredentials.lastMatchedUrl && (
                    <div className="text-xs text-green-400 mb-1">Matched URL: {shipSidekickCredentials.lastMatchedUrl}</div>
                  )}
                  {shipSidekickCredentials.lastRawKeys && (
                    <div className="text-xs text-yellow-400 mb-1">Response keys: {JSON.stringify(shipSidekickCredentials.lastRawKeys)}</div>
                  )}
                  <div className="max-h-96 overflow-y-auto text-xs font-mono text-slate-400 space-y-0.5 select-all">
                    {shipSidekickCredentials.lastDebugLog.map((line, i) => (
                      <div key={i} className={line.includes('SUCCESS') || line.includes('200') ? 'text-green-400' : line.includes('ERROR') || line.includes('401') || line.includes('403') ? 'text-red-400' : line.startsWith('  VARIANT:') ? 'text-cyan-400' : line.startsWith('PRODUCT:') ? 'text-yellow-400' : ''}>{line}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sync Carriers */}
              <SettingRow label="Sync Carriers" desc="Fetch available carriers from Ship Sidekick">
                <button
                  onClick={async () => {
                    setToast({ message: 'Syncing carriers...', type: 'info' });
                    try {
                      const res = await fetch('/api/shipsidekick/sync', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          apiKey: shipSidekickCredentials.apiKey,
                          clientSlug: shipSidekickCredentials.clientSlug,
                          environment: shipSidekickCredentials.environment || 'production',
                          syncType: 'carriers',
                        }),
                      });
                      const data = await res.json();
                      if (data.error) throw new Error(data.error);
                      setShipSidekickCredentials(p => ({ ...p, carriers: data.carriers }));
                      setToast({ message: `Synced ${data.carriers?.length || 0} carriers from Ship Sidekick`, type: 'success' });
                    } catch (err) {
                      setToast({ message: 'Carrier sync failed: ' + err.message, type: 'error' });
                    }
                  }}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />Sync Carriers
                </button>
              </SettingRow>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-slate-900/50 rounded-xl p-4">
                <div className="space-y-4">
                  <div>
                    <label className="block text-slate-300 text-sm font-medium mb-2">API Key</label>
                    <input
                      type="text" style={{WebkitTextSecurity: "disc"}}
                      placeholder="e.g. ea9003f9-4af7-4e13-8999-a89ab3d3ab59"
                      value={shipSidekickCredentials?.apiKey || ''}
                      onChange={(e) => setShipSidekickCredentials(p => ({ ...p, apiKey: e.target.value.trim() }))}
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-slate-500 text-xs mt-1">From Ship Sidekick dashboard: Settings &gt; API Keys</p>
                  </div>
                  <div>
                    <label className="block text-slate-300 text-sm font-medium mb-2">Client Slug <span className="text-slate-500 font-normal">(optional — required for child/sub-org accounts)</span></label>
                    <input
                      type="text"
                      placeholder="e.g. acme-corp"
                      value={shipSidekickCredentials?.clientSlug || ''}
                      onChange={(e) => setShipSidekickCredentials(p => ({ ...p, clientSlug: e.target.value.trim() }))}
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-slate-500 text-xs mt-1">If your account is a child org under a parent, enter your org slug here</p>
                  </div>
                  <div>
                    <label className="block text-slate-300 text-sm font-medium mb-2">Environment</label>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setShipSidekickCredentials(p => ({ ...p, environment: 'production' }))}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                          (shipSidekickCredentials?.environment || 'production') === 'production'
                            ? 'bg-blue-600/30 border-blue-500/50 text-blue-300'
                            : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        Production
                      </button>
                      <button
                        onClick={() => setShipSidekickCredentials(p => ({ ...p, environment: 'test' }))}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                          shipSidekickCredentials?.environment === 'test'
                            ? 'bg-amber-600/30 border-amber-500/50 text-amber-300'
                            : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        Test / Sandbox
                      </button>
                    </div>
                    <p className="text-slate-500 text-xs mt-1">Production uses www.shipsidekick.com — Test uses test.shipsidekick.com. Make sure your API key matches the environment.</p>
                  </div>
                  <button
                    onClick={async () => {
                      if (!shipSidekickCredentials?.apiKey) {
                        setToast({ message: 'Please enter your Ship Sidekick API key', type: 'error' });
                        return;
                      }

                      setToast({ message: 'Connecting to Ship Sidekick...', type: 'info' });
                      setShipSidekickCredentials(p => ({ ...p, _debugLog: null, _testing: true }));

                      const controller = new AbortController();
                      const timeoutId = setTimeout(() => controller.abort(), 120000);

                      try {
                        const res = await fetch('/api/shipsidekick/sync', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          signal: controller.signal,
                          body: JSON.stringify({
                            apiKey: shipSidekickCredentials.apiKey,
                            clientSlug: shipSidekickCredentials.clientSlug,
                            environment: shipSidekickCredentials.environment || 'production',
                            test: true,
                          }),
                        });
                        clearTimeout(timeoutId);

                        if (!res.ok) {
                          const errorText = await res.text();
                          setShipSidekickCredentials(p => ({ ...p, _debugLog: [`API route error: ${res.status} ${errorText.slice(0, 500)}`], _testing: false }));
                          throw new Error(`API error ${res.status}: ${errorText.slice(0, 100)}`);
                        }

                        const data = await res.json();

                        // Always store the debug log
                        if (data.debugLog) {
                          setShipSidekickCredentials(p => ({ ...p, _debugLog: data.debugLog, _testing: false }));
                        }

                        if (data.error) {
                          setShipSidekickCredentials(p => ({ ...p, _debugLog: data.debugLog || [data.error], _testing: false }));
                          throw new Error(data.error);
                        }
                        if (data.success) {
                          const updatedCreds = {
                            ...shipSidekickCredentials,
                            connected: true,
                            lastSync: new Date().toISOString(),
                            accountName: data.accountName || 'Ship Sidekick',
                            _debugLog: data.debugLog || ['Connected successfully!'],
                            _testing: false,
                          };
                          setShipSidekickCredentials(updatedCreds);
                          if (session?.user?.id && supabase) {
                            pushToCloudNow({ ...combinedData, shipSidekickCredentials: updatedCreds }, true);
                          }
                          setToast({ message: `Connected to ${data.accountName || 'Ship Sidekick'} (${data.environment})!`, type: 'success' });
                        }
                      } catch (err) {
                        clearTimeout(timeoutId);
                        const errorMsg = err.name === 'AbortError'
                          ? 'Request timed out. Make sure api/shipsidekick/sync.js is deployed to Vercel.'
                          : err.message;
                        setShipSidekickCredentials(p => ({ ...p, _testing: false, _debugLog: p._debugLog || [errorMsg] }));
                        setToast({ message: 'Connection failed: ' + errorMsg, type: 'error' });
                      }
                    }}
                    disabled={!shipSidekickCredentials?.apiKey || shipSidekickCredentials?._testing}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 rounded-xl text-white font-semibold flex items-center justify-center gap-2"
                  >
                    {shipSidekickCredentials?._testing ? (
                      <><Loader2 className="w-5 h-5 animate-spin" />Testing connection...</>
                    ) : (
                      <><Truck className="w-5 h-5" />Test & Connect</>
                    )}
                  </button>
                </div>
              </div>

              {/* Debug Log Panel */}
              {shipSidekickCredentials?._debugLog && shipSidekickCredentials._debugLog.length > 0 && (
                <div className="bg-slate-950 border border-slate-700 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-amber-400 font-medium text-sm flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Connection Debug Log
                    </h4>
                    <button
                      onClick={() => setShipSidekickCredentials(p => ({ ...p, _debugLog: null }))}
                      className="text-slate-500 hover:text-slate-300 text-xs"
                    >
                      Clear
                    </button>
                  </div>
                  <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap overflow-x-auto max-h-64 overflow-y-auto bg-slate-900 rounded-lg p-3">
                    {shipSidekickCredentials._debugLog.join('\n')}
                  </pre>
                  <p className="text-slate-500 text-xs mt-2">Share this log with Ship Sidekick support if the issue persists.</p>
                </div>
              )}

              <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
                <h4 className="text-blue-400 font-medium mb-2 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4" />
                  Troubleshooting 401 Errors
                </h4>
                <ul className="text-slate-300 text-sm space-y-2">
                  <li><strong>API Key:</strong> Regenerate it in Ship Sidekick dashboard under Settings &gt; API Keys</li>
                  <li><strong>Client Slug:</strong> If your account is a child org under a parent, you must provide the org slug (e.g. acme-corp)</li>
                  <li><strong>Environment:</strong> Use a production key with Production and a test key with Test/Sandbox — do not mix them</li>
                </ul>
              </div>
            </div>
          )}
        </SettingSection>

        {/* Amazon SP-API Connection */}
        <SettingSection title="🛒 Amazon SP-API Connection">
          <p className="text-slate-400 text-sm mb-4">Connect to Amazon Selling Partner API for FBA and AWD inventory sync. This does NOT overwrite your 3PL or Shopify Wormans Mill inventory.</p>
          
          {amazonCredentials.connected ? (
            <div className="space-y-4">
              <div className="bg-orange-900/30 border border-orange-500/30 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-500/20 rounded-full flex items-center justify-center">
                      <Check className="w-5 h-5 text-orange-400" />
                    </div>
                    <div>
                      <p className="text-orange-400 font-medium">Connected to Amazon SP-API</p>
                      <p className="text-slate-400 text-sm">FBA + AWD Inventory Sync</p>
                      {amazonCredentials.lastSync && (
                        <p className="text-slate-500 text-xs">Last sync: {new Date(amazonCredentials.lastSync).toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm('Disconnect from Amazon SP-API? Your synced inventory will remain.')) {
                        setAmazonCredentials({ 
                          clientId: '', clientSecret: '', refreshToken: '', sellerId: '', 
                          marketplaceId: 'ATVPDKIKX0DER', connected: false, lastSync: null,
                          adsClientId: '', adsClientSecret: '', adsRefreshToken: '', adsProfileId: '',
                          adsConnected: false, adsLastSync: null
                        });
                        setAmazonInventoryData(null);
                        setToast({ message: 'Amazon SP-API disconnected', type: 'success' });
                      }
                    }}
                    className="px-4 py-2 bg-rose-600/30 hover:bg-rose-600/50 border border-rose-500/50 rounded-lg text-sm text-rose-300"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
              
              {/* Sync Inventory Button */}
              <SettingRow label="Sync Amazon Inventory" desc="Pull FBA and AWD inventory from Amazon">
                <button
                  onClick={async () => {
                    setAmazonInventoryStatus({ loading: true, error: null, lastSync: null });
                    try {
                      const res = await fetch('/api/amazon/sync', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          clientId: amazonCredentials.clientId,
                          clientSecret: amazonCredentials.clientSecret,
                          refreshToken: amazonCredentials.refreshToken,
                          sellerId: amazonCredentials.sellerId,
                          marketplaceId: amazonCredentials.marketplaceId,
                          syncType: 'all',
                        }),
                      });
                      const data = await res.json();
                      if (data.error) throw new Error(data.error);
                      
                      setAmazonInventoryData(data);
                      setAmazonInventoryStatus({ loading: false, error: null, lastSync: new Date().toISOString() });
                      setAmazonCredentials(p => ({ ...p, lastSync: new Date().toISOString() }));

                      const fbaUnits = data.summary?.fbaUnits || data.summary?.totalUnits || 0;
                      const awdUnitsFromApi = data.summary?.awdUnits || 0;

                      // ===== MERGE AMAZON FBA + AWD INTO EXISTING INVENTORY SNAPSHOT =====
                      if (data.items && data.items.length > 0) {
                        const todayStr = new Date().toISOString().split('T')[0];
                        const targetDate = invHistory[todayStr] ? todayStr :
                          (selectedInvDate && invHistory[selectedInvDate]) ? selectedInvDate :
                          Object.keys(invHistory).sort().reverse()[0];

                        if (targetDate && invHistory[targetDate]) {
                          const currentSnapshot = invHistory[targetDate];

                          // Build lookup from Amazon data (multiple SKU case variants including Shop suffix)
                          const amzLookup = {};
                          let apiAwdTotal = 0;
                          data.items.forEach(item => {
                            if (!item.sku) return;
                            const fulfillable = item.fbaFulfillable || item.fulfillable || item.available || 0;
                            const reserved = item.fbaReserved || item.reserved || 0;
                            const inbound = item.fbaInbound || item.totalInbound || 0;
                            const total = fulfillable + reserved;
                            const awd = item.awdQuantity || 0;
                            const awdInb = item.awdInbound || 0;
                            apiAwdTotal += awd;
                            const entry = { total, inbound, awdQty: awd, awdInbound: awdInb, asin: item.asin || '' };
                            const skuUpper = item.sku.toUpperCase();
                            const baseSku = skuUpper.replace(/SHOP$/, '');
                            // Match auto-sync pattern: include SHOP suffix variants for matching
                            [item.sku, item.sku.toLowerCase(), skuUpper, baseSku, baseSku.toLowerCase(),
                             baseSku + 'SHOP', baseSku.toLowerCase() + 'shop', baseSku + 'Shop'].forEach(k => {
                              if (!amzLookup[k]) amzLookup[k] = entry;
                            });
                          });
                          // Build SEPARATE AWD lookup from raw AWD data (handles SKU mismatch between FBA & AWD in backend merge)
                          const awdLookup = {};
                          (data.awdInventory || []).forEach(awdItem => {
                            const awdSku = awdItem.sku || awdItem.msku || '';
                            if (!awdSku) return;
                            const entry = { awdQty: awdItem.awdQuantity || 0, awdInbound: awdItem.awdInbound || 0 };
                            const upper = awdSku.toUpperCase();
                            const base = upper.replace(/SHOP$/, '');
                            [awdSku, awdSku.toLowerCase(), upper, base, base.toLowerCase(),
                             base + 'SHOP', base.toLowerCase() + 'shop', base + 'Shop'].forEach(k => {
                              if (!awdLookup[k]) awdLookup[k] = entry;
                            });
                          });
                          console.log('[Amazon Sync] Built lookups:', {
                            amzKeys: Object.keys(amzLookup).length, awdKeys: Object.keys(awdLookup).length,
                            apiAwdTotal, items: data.items.length, rawAwdItems: (data.awdInventory || []).length
                          });

                          const today = new Date();
                          const reorderTriggerDays = leadTimeSettings.reorderTriggerDays || 60;
                          const minOrderWeeks = leadTimeSettings.minOrderWeeks || 22;
                          const liveLeadTimeDays = leadTimeSettings.defaultLeadTimeDays || 14;
                          const liveOverstockThreshold = Math.max(90, (minOrderWeeks * 7) + reorderTriggerDays + liveLeadTimeDays);
                          const liveLowThreshold = Math.max(30, liveLeadTimeDays + 14);
                          const liveCriticalThreshold = Math.max(14, liveLeadTimeDays);

                          let matchedCount = 0, awdNonZero = 0;
                          const updatedItems = currentSnapshot.items.map(item => {
                            const sku = item.sku || '';
                            const nSku = normalizeSkuKey(sku);
                            // Try direct SKU, then normalized (without Shop suffix), then with Shop suffix
                            const amz = amzLookup[sku] || amzLookup[sku.toUpperCase()] || amzLookup[sku.toLowerCase()] ||
                              amzLookup[nSku] || amzLookup[nSku.toLowerCase()] ||
                              amzLookup[nSku + 'SHOP'] || amzLookup[nSku + 'Shop'] || amzLookup[nSku.toLowerCase() + 'shop'] || null;

                            if (amz) matchedCount++;
                            const newAmazonQty = amz ? amz.total : (item.amazonQty || 0);
                            const newAmazonInbound = amz ? amz.inbound : (item.amazonInbound || 0);
                            // Use separate AWD lookup as fallback (handles backend SKU mismatch between FBA & AWD)
                            const awdFallback = awdLookup[sku] || awdLookup[sku.toUpperCase()] || awdLookup[sku.toLowerCase()] ||
                              awdLookup[nSku] || awdLookup[nSku.toLowerCase()] ||
                              awdLookup[nSku + 'SHOP'] || awdLookup[nSku + 'Shop'] || awdLookup[nSku.toLowerCase() + 'shop'] || null;
                            const newAwdQty = (amz && amz.awdQty > 0) ? amz.awdQty : (awdFallback ? awdFallback.awdQty : (item.awdQty || 0));
                            const newAwdInbound = (amz && amz.awdInbound > 0) ? amz.awdInbound : (awdFallback ? awdFallback.awdInbound : (item.awdInbound || 0));
                            if (newAwdQty > 0) awdNonZero++;

                            const newTotalQty = newAmazonQty + (item.threeplQty || 0) + (item.homeQty || 0) + newAwdQty + newAmazonInbound + newAwdInbound + (item.threeplInbound || 0);
                            const vel = item.correctedVel || item.weeklyVel || 0;
                            const dos = vel > 0 ? Math.round((newTotalQty / vel) * 7) : 999;

                            let stockoutDate = null, reorderByDate = null, daysUntilMustOrder = null;
                            const leadTimeDays = item.leadTimeDays || liveLeadTimeDays;
                            const demandStats = skuDemandStatsRef?.current?.[normalizeSkuKey(sku)] || null;
                            const leadTimeWeeks = leadTimeDays / 7;
                            const safetyStock = demandStats ? Math.ceil(1.65 * demandStats.weeklyStdDev * Math.sqrt(leadTimeWeeks)) : (item.safetyStock || 0);
                            const seasonalFactor = demandStats?.currentSeasonalFactor || item.seasonalFactor || 1.0;
                            const seasonalVel = vel * seasonalFactor;
                            const dailyVelForReorder = seasonalVel / 7;
                            const reorderPoint = Math.ceil((dailyVelForReorder * leadTimeDays) + safetyStock);

                            if (vel > 0 && dos < 999) {
                              const stockout = new Date(today);
                              stockout.setDate(stockout.getDate() + dos);
                              stockoutDate = stockout.toISOString().split('T')[0];
                              const reorderPointDays = seasonalVel > 0 ? Math.round((reorderPoint / seasonalVel) * 7) : leadTimeDays;
                              daysUntilMustOrder = dos - reorderTriggerDays - reorderPointDays;
                              const reorderBy = new Date(today);
                              reorderBy.setDate(reorderBy.getDate() + daysUntilMustOrder);
                              reorderByDate = reorderBy.toISOString().split('T')[0];
                            }

                            let health = item.health || 'unknown';
                            const rawVel = item.rawWeeklyVel || item.weeklyVel || 0;
                            if (rawVel > 0) {
                              if (daysUntilMustOrder !== null && daysUntilMustOrder < 0) health = 'critical';
                              else if (dos < liveCriticalThreshold || (daysUntilMustOrder !== null && daysUntilMustOrder < 7)) health = 'critical';
                              else if (dos < liveLowThreshold || (daysUntilMustOrder !== null && daysUntilMustOrder < 14)) health = 'low';
                              else if (dos <= liveOverstockThreshold) health = 'healthy';
                              else health = 'overstock';
                            }

                            return {
                              ...item,
                              amazonQty: newAmazonQty,
                              amazonInbound: newAmazonInbound,
                              awdQty: newAwdQty,
                              awdInbound: newAwdInbound,
                              totalQty: newTotalQty,
                              totalValue: newTotalQty * (item.cost || 0),
                              daysOfSupply: dos,
                              stockoutDate,
                              reorderByDate,
                              daysUntilMustOrder,
                              health,
                              safetyStock,
                              reorderPoint,
                              suggestedOrderQty: vel > 0 ? Math.ceil(vel * minOrderWeeks) + safetyStock : 0,
                            };
                          });
                          console.log('[Amazon Sync] Merge results:', { matchedCount, awdNonZero, totalItems: updatedItems.length });

                          updatedItems.sort((a, b) => b.totalValue - a.totalValue);

                          let critical = 0, low = 0, healthy = 0, overstock = 0;
                          updatedItems.forEach(i => {
                            if (i.health === 'critical') critical++;
                            else if (i.health === 'low') low++;
                            else if (i.health === 'healthy') healthy++;
                            else if (i.health === 'overstock') overstock++;
                          });

                          const newAmzTotal = updatedItems.reduce((s, i) => s + (i.amazonQty || 0), 0);
                          const newAmzValue = updatedItems.reduce((s, i) => s + ((i.amazonQty || 0) * (i.cost || 0)), 0);
                          const newAmzInbound = updatedItems.reduce((s, i) => s + (i.amazonInbound || 0), 0);
                          const newAwdTotal = updatedItems.reduce((s, i) => s + (i.awdQty || 0), 0);
                          const newAwdValue = updatedItems.reduce((s, i) => s + ((i.awdQty || 0) * (i.cost || 0)), 0);

                          const updatedSnapshot = {
                            ...currentSnapshot,
                            items: updatedItems,
                            summary: {
                              ...currentSnapshot.summary,
                              amazonUnits: newAmzTotal,
                              amazonValue: newAmzValue,
                              amazonInbound: newAmzInbound,
                              awdUnits: newAwdTotal,
                              awdValue: newAwdValue,
                              totalUnits: updatedItems.reduce((s, i) => s + (i.totalQty || 0), 0),
                              totalValue: updatedItems.reduce((s, i) => s + (i.totalValue || 0), 0),
                              skuCount: updatedItems.length,
                              critical, low, healthy, overstock,
                            },
                            sources: {
                              ...currentSnapshot.sources,
                              amazon: 'amazon-fba-manual-sync',
                              lastAmazonSync: new Date().toISOString(),
                              lastAmazonFbaSync: new Date().toISOString(),
                            },
                          };

                          const updatedHistory = { ...invHistory, [targetDate]: updatedSnapshot };
                          setInvHistory(updatedHistory);
                          setSelectedInvDate(targetDate);
                          saveInv(updatedHistory);
                          setToast({
                            message: `Updated inventory: ${newAmzTotal.toLocaleString()} FBA + ${newAwdTotal.toLocaleString()} AWD units`,
                            type: 'success'
                          });
                        } else {
                          setToast({
                            message: `Synced ${fbaUnits.toLocaleString()} FBA${awdUnitsFromApi > 0 ? ` + ${awdUnitsFromApi.toLocaleString()} AWD` : ''} (no snapshot to update)`,
                            type: 'warning'
                          });
                        }
                      } else {
                        setToast({
                          message: `Synced ${fbaUnits.toLocaleString()} FBA units${awdUnitsFromApi > 0 ? ` + ${awdUnitsFromApi.toLocaleString()} AWD units` : ''}`,
                          type: 'success'
                        });
                      }
                    } catch (err) {
                      setAmazonInventoryStatus({ loading: false, error: err.message, lastSync: null });
                      setToast({ message: 'Amazon sync failed: ' + err.message, type: 'error' });
                    }
                  }}
                  disabled={amazonInventoryStatus.loading}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 rounded-lg text-sm text-white flex items-center gap-2"
                >
                  {amazonInventoryStatus.loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Syncing...</>
                  ) : (
                    <><RefreshCw className="w-4 h-4" />Sync Now</>
                  )}
                </button>
              </SettingRow>
              
              {amazonInventoryStatus.error && (
                <div className="bg-rose-900/30 border border-rose-500/30 rounded-lg p-3">
                  <p className="text-rose-400 text-sm">{amazonInventoryStatus.error}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-slate-900/50 rounded-xl p-4">
                <div className="space-y-4">
                  <div>
                    <label className="block text-slate-300 text-sm mb-1">LWA Client ID</label>
                    <input
                      type="text"
                      value={amazonCredentials.clientId}
                      onChange={(e) => setAmazonCredentials(p => ({ ...p, clientId: e.target.value }))}
                      placeholder="amzn1.application-oa2-client.xxx"
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 text-sm mb-1">LWA Client Secret</label>
                    <input
                      type="text" style={{WebkitTextSecurity: "disc"}}
                      value={amazonCredentials.clientSecret}
                      onChange={(e) => setAmazonCredentials(p => ({ ...p, clientSecret: e.target.value }))}
                      placeholder="Enter client secret"
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 text-sm mb-1">Refresh Token</label>
                    <input
                      type="text" style={{WebkitTextSecurity: "disc"}}
                      value={amazonCredentials.refreshToken}
                      onChange={(e) => setAmazonCredentials(p => ({ ...p, refreshToken: e.target.value }))}
                      placeholder="Atzr|xxx"
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 text-sm mb-1">Seller ID (optional)</label>
                    <input
                      type="text"
                      value={amazonCredentials.sellerId}
                      onChange={(e) => setAmazonCredentials(p => ({ ...p, sellerId: e.target.value }))}
                      placeholder="AXXXXXXXXX"
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                    />
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/amazon/sync', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            clientId: amazonCredentials.clientId,
                            clientSecret: amazonCredentials.clientSecret,
                            refreshToken: amazonCredentials.refreshToken,
                            sellerId: amazonCredentials.sellerId,
                            marketplaceId: amazonCredentials.marketplaceId,
                            test: true,
                          }),
                        });
                        const data = await res.json();
                        if (data.error) throw new Error(data.error);
                        if (data.success) {
                          const updatedCreds = { ...amazonCredentials, connected: true };
                          setAmazonCredentials(updatedCreds);
                          if (session?.user?.id && supabase) {
                            pushToCloudNow({ ...combinedData, amazonCredentials: updatedCreds }, true);
                          }
                          setToast({ message: 'Connected to Amazon SP-API!', type: 'success' });
                        }
                      } catch (err) {
                        setToast({ message: 'Connection failed: ' + err.message, type: 'error' });
                      }
                    }}
                    disabled={!amazonCredentials.clientId || !amazonCredentials.clientSecret || !amazonCredentials.refreshToken}
                    className="w-full py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:hover:bg-orange-600 rounded-xl text-white font-semibold flex items-center justify-center gap-2"
                  >
                    <ShoppingCart className="w-5 h-5" />
                    Test & Connect
                  </button>
                </div>
              </div>
              
              <div className="bg-orange-900/20 border border-orange-500/30 rounded-xl p-4">
                <h4 className="text-orange-400 font-medium mb-2 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4" />
                  Getting Your Amazon SP-API Credentials
                </h4>
                <div className="text-slate-300 text-sm space-y-2">
                  <p>1. Go to <strong>Seller Central → Apps & Services → Develop Apps</strong></p>
                  <p>2. Create or select your app and authorize it</p>
                  <p>3. Copy your LWA Client ID, Client Secret, and Refresh Token</p>
                  <p>4. Required permissions: <code className="bg-slate-800 px-1 rounded">Inventory</code></p>
                </div>
                <p className="text-slate-500 text-xs mt-3">This syncs FBA and AWD inventory only. 3PL (Packiyo) and Wormans Mill (Shopify) inventory are preserved separately.</p>
              </div>
            </div>
          )}
        </SettingSection>
        
        {/* Amazon Ads API Connection */}
        <SettingSection title="📊 Amazon Ads API">
          <p className="text-slate-400 text-sm mb-4">Connect to Amazon Advertising API for automatic daily campaign performance data. Uses separate credentials from SP-API.</p>
          
          {amazonCredentials.adsConnected ? (
            <div className="space-y-4">
              <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
                      <Check className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-emerald-400 font-medium">Amazon Ads API Connected</p>
                      <p className="text-slate-400 text-sm">Profile: {amazonCredentials.adsProfileId}</p>
                      {amazonCredentials.adsLastSync && (
                        <p className="text-slate-500 text-xs">Last sync: {new Date(amazonCredentials.adsLastSync).toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm('Disconnect Amazon Ads API?')) {
                        setAmazonCredentials(prev => ({ 
                          ...prev,
                          adsClientId: '', adsClientSecret: '', adsRefreshToken: '', adsProfileId: '',
                          adsConnected: false, adsLastSync: null,
                        }));
                        setToast({ message: 'Amazon Ads API disconnected', type: 'success' });
                      }
                    }}
                    className="px-4 py-2 bg-rose-600/30 hover:bg-rose-600/50 border border-rose-500/50 rounded-lg text-sm text-rose-300"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
              
              {/* Manual Sync Button */}
              <SettingRow label="Sync Campaign Data" desc="Pull 30 days of SP/SB/SD campaigns, search terms, SKU-level spend, targeting, placements">
                <button
                  onClick={async (e) => {
                    const btn = e.currentTarget;
                    btn.disabled = true;
                    btn.classList.add('opacity-60');
                    const startTime = Date.now();
                    setToast({ message: '📊 Creating 8 report requests...', type: 'info', duration: 60000 });
                    try {
                      let data = null;
                      let retries = 0;
                      const syncBody = {
                        syncType: 'daily',
                        daysBack: 60,
                        adsClientId: amazonCredentials.adsClientId,
                        adsClientSecret: amazonCredentials.adsClientSecret,
                        adsRefreshToken: amazonCredentials.adsRefreshToken,
                        adsProfileId: amazonCredentials.adsProfileId,
                      };

                      while (retries < 5) {
                        const elapsed = Math.round((Date.now() - startTime) / 1000);
                        if (retries === 0) {
                          setToast({ message: `📊 Waiting for Amazon to generate reports... (${elapsed}s)`, type: 'info', duration: 60000 });
                        } else {
                          const completed = data?.completedCount || 0;
                          const total = data?.totalCount || 8;
                          setToast({ message: `⏳ Reports generating... ${completed}/${total} ready (retry ${retries}/5, ${elapsed}s)`, type: 'info', duration: 60000 });
                        }
                        const r = await fetch('/api/amazon/ads-sync', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(syncBody),
                        });
                        data = await r.json();

                        if (data.status === 'pending' && data.pendingReports) {
                          syncBody.pendingReports = data.pendingReports;
                          retries++;
                          await new Promise(r => setTimeout(r, 8000));
                          continue;
                        }
                        break;
                      }

                      if (data?.success && data?.dailyData) {
                        // 1. Write daily ad totals + per-SKU ad spend to allDaysData
                        setAllDaysData(prev => {
                          const updated = { ...prev };
                          Object.entries(data.dailyData).forEach(([date, adDay]) => {
                            if (!updated[date]) updated[date] = {};
                            if (!updated[date].amazon) updated[date].amazon = {};
                            updated[date].amazon.adSpend = adDay.spend || 0;
                            updated[date].amazon.adRevenue = adDay.revenue || 0;
                            updated[date].amazon.adOrders = adDay.orders || 0;
                            updated[date].amazon.adImpressions = adDay.impressions || 0;
                            updated[date].amazon.adClicks = adDay.clicks || 0;
                            updated[date].amazon.acos = adDay.acos || 0;
                            updated[date].amazon.adRoas = adDay.roas || 0;
                            if (!updated[date].amazon.revenue) updated[date].amazon.revenue = 0;

                            // Write per-SKU ad spend for this date
                            const skuDay = data.skuDailyData?.[date];
                            if (skuDay && updated[date].amazon.skuData) {
                              updated[date].amazon.skuData = updated[date].amazon.skuData.map(sk => {
                                const match = skuDay[sk.sku] || skuDay[sk.asin] || skuDay[(sk.sku || '').toUpperCase()];
                                if (match) {
                                  return { ...sk, adSpend: match.spend || 0, adRevenue: match.sales || 0, adOrders: match.orders || 0 };
                                }
                                return sk;
                              });
                            }
                          });
                          try { localStorage.setItem('ecommerce_daily_sales_v1', JSON.stringify(updated)); } catch(e) {}
                          return updated;
                        });

                        // 2. Store transformed reports in adsIntelData for AI analysis
                        //    Uses _api prefix to avoid conflicting with aggregated format from file uploads
                        //    AI prompt builder reads both aggregated keys and _api keys
                        if (setAdsIntelData && data.reports) {
                          setAdsIntelData(prev => {
                            const updated = { ...(prev || {}), lastUpdated: new Date().toISOString(), source: 'amazon-ads-api' };
                            // Store raw rows under _api keys for AI to analyze
                            if (data.reports.dailyOverview) updated._apiDailyOverview = data.reports.dailyOverview;
                            if (data.reports.spCampaigns) updated._apiSpCampaigns = data.reports.spCampaigns;
                            if (data.reports.spSearchTerms) updated._apiSpSearchTerms = data.reports.spSearchTerms;
                            if (data.reports.spAdvertised) updated._apiSpAdvertised = data.reports.spAdvertised;
                            if (data.reports.spPlacement) updated._apiSpPlacement = data.reports.spPlacement;
                            if (data.reports.spTargeting) updated._apiSpTargeting = data.reports.spTargeting;
                            if (data.reports.sbSearchTerms) updated._apiSbSearchTerms = data.reports.sbSearchTerms;
                            if (data.reports.sdCampaign) updated._apiSdCampaign = data.reports.sdCampaign;
                            // Store pre-computed summaries for direct display
                            if (data.skuSummary) updated.skuAdPerformance = data.skuSummary;
                            if (data.campaigns) updated.campaignSummary = data.campaigns;
                            updated.apiSyncSummary = data.summary;
                            
                            // ALSO store in nested format the UI Deep Analysis tab reads
                            const toIntelFormat = (rows, label) => {
                              if (!rows || !rows.length) return null;
                              return {
                                records: rows,
                                headers: Object.keys(rows[0] || {}),
                                meta: { label, uploadedAt: new Date().toISOString(), source: 'amazon-ads-api', rowCount: rows.length }
                              };
                            };
                            
                            if (!updated.amazon) updated.amazon = {};
                            const rpts = data.reports;
                            if (rpts.spSearchTerms?.length) updated.amazon.sp_search_terms = toIntelFormat(rpts.spSearchTerms, 'SP Search Terms (API)');
                            if (rpts.spAdvertised?.length) updated.amazon.sp_advertised_product = toIntelFormat(rpts.spAdvertised, 'SP Advertised Product (API)');
                            if (rpts.spPlacement?.length) updated.amazon.sp_placement = toIntelFormat(rpts.spPlacement, 'SP Placement (API)');
                            if (rpts.spTargeting?.length) updated.amazon.sp_targeting = toIntelFormat(rpts.spTargeting, 'SP Targeting (API)');
                            if (rpts.sbSearchTerms?.length) updated.amazon.sb_search_terms = toIntelFormat(rpts.sbSearchTerms, 'SB Search Terms (API)');
                            if (rpts.sdCampaign?.length) updated.amazon.sd_campaigns = toIntelFormat(rpts.sdCampaign, 'SD Campaigns (API)');
                            if (rpts.spCampaigns?.length) updated.amazon.sp_campaigns = toIntelFormat(rpts.spCampaigns, 'SP Campaigns (API)');
                            else if (rpts.dailyOverview?.length) updated.amazon.sp_campaigns = toIntelFormat(rpts.dailyOverview, 'SP Campaigns Daily (API)');
                            
                            return updated;
                          });
                        }

                        setAmazonCredentials(prev => ({ ...prev, adsLastSync: new Date().toISOString() }));
                        if (queueCloudSave) queueCloudSave();
                        
                        const rc = data.summary.reportCounts || {};
                        const elapsed = Math.round((Date.now() - startTime) / 1000);
                        const parts = [`${data.summary.daysWithData} days`, `$${data.summary.totalSpend.toFixed(0)} spend`, `${data.summary.campaignCount} campaigns`, `${data.summary.skuCount || 0} SKUs`];
                        if (rc.spSearchTerms) parts.push(`${rc.spSearchTerms} search terms`);
                        setToast({ message: `✅ Ads synced in ${elapsed}s: ${parts.join(' · ')}`, type: 'success' });
                      } else if (data?.status === 'pending') {
                        setToast({ message: '⏳ Reports still generating — will complete on next sync', type: 'info' });
                      } else {
                        setToast({ message: '❌ ' + (data?.error || 'Ads sync failed'), type: 'error' });
                      }
                    } catch (err) {
                      setToast({ message: `❌ Ads sync error: ${err.message}`, type: 'error' });
                    } finally {
                      btn.disabled = false;
                      btn.classList.remove('opacity-60');
                    }
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm text-white font-medium flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />Sync Now
                </button>
              </SettingRow>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Ads LWA Client ID</label>
                  <input
                    type="text"
                    placeholder="amzn1.application-oa2-client.xxxxxxxx"
                    value={amazonCredentials.adsClientId}
                    onChange={e => setAmazonCredentials(p => ({ ...p, adsClientId: e.target.value.trim() }))}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Ads LWA Client Secret</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={amazonCredentials.adsClientSecret}
                    onChange={e => setAmazonCredentials(p => ({ ...p, adsClientSecret: e.target.value.trim() }))}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Ads LWA Refresh Token</label>
                  <input
                    type="password"
                    placeholder="Atzr|xxxxxxxx"
                    value={amazonCredentials.adsRefreshToken}
                    onChange={e => setAmazonCredentials(p => ({ ...p, adsRefreshToken: e.target.value.trim() }))}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Ads Profile ID <span className="text-slate-500">(auto-detected on connect)</span></label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Will be auto-detected..."
                      value={amazonCredentials.adsProfileId}
                      onChange={e => setAmazonCredentials(p => ({ ...p, adsProfileId: e.target.value.trim() }))}
                      className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                    />
                    <button
                      onClick={async () => {
                        if (!amazonCredentials.adsClientId || !amazonCredentials.adsRefreshToken) {
                          setToast({ message: 'Enter Client ID and Refresh Token first', type: 'error' });
                          return;
                        }
                        setToast({ message: 'Fetching ad profiles...', type: 'info' });
                        try {
                          const r = await fetch('/api/amazon/ads-sync', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              syncType: 'profiles',
                              adsClientId: amazonCredentials.adsClientId,
                              adsClientSecret: amazonCredentials.adsClientSecret,
                              adsRefreshToken: amazonCredentials.adsRefreshToken,
                            }),
                          });
                          const data = await r.json();
                          if (data.error) throw new Error(data.error);
                          if (data.profiles?.length > 0) {
                            // Auto-select US seller profile
                            const usProfile = data.profiles.find(p => p.countryCode === 'US' && p.type === 'seller');
                            const chosen = usProfile || data.profiles[0];
                            setAmazonCredentials(p => ({ ...p, adsProfileId: chosen.profileId }));
                            setToast({ message: `Found ${data.profiles.length} profile(s) — selected "${chosen.name}" (${chosen.profileId})`, type: 'success' });
                          } else {
                            setToast({ message: 'No advertising profiles found. Make sure your app has advertising API access.', type: 'error' });
                          }
                        } catch (err) {
                          setToast({ message: err.message, type: 'error' });
                        }
                      }}
                      disabled={!amazonCredentials.adsClientId || !amazonCredentials.adsRefreshToken}
                      className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded-lg text-sm text-slate-300 whitespace-nowrap"
                    >
                      Fetch Profiles
                    </button>
                  </div>
                </div>
                
                <button
                  disabled={!amazonCredentials.adsClientId || !amazonCredentials.adsClientSecret || !amazonCredentials.adsRefreshToken || !amazonCredentials.adsProfileId}
                  onClick={async () => {
                    setToast({ message: 'Testing Amazon Ads connection...', type: 'info' });
                    try {
                      const r = await fetch('/api/amazon/ads-sync', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          syncType: 'test',
                          adsClientId: amazonCredentials.adsClientId,
                          adsClientSecret: amazonCredentials.adsClientSecret,
                          adsRefreshToken: amazonCredentials.adsRefreshToken,
                          adsProfileId: amazonCredentials.adsProfileId,
                        }),
                      });
                      const data = await r.json();
                      if (data.error) throw new Error(data.error);
                      
                      setAmazonCredentials(p => ({ ...p, adsConnected: true, adsLastSync: null }));
                      setToast({ message: `Connected! Found ${data.profiles?.length || 0} profile(s). You can now sync campaign data.`, type: 'success' });
                    } catch (err) {
                      setToast({ message: `Connection failed: ${err.message}`, type: 'error' });
                    }
                  }}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 rounded-xl text-white font-semibold flex items-center justify-center gap-2"
                >
                  <Target className="w-5 h-5" />
                  Test & Connect
                </button>
              </div>
              
              <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4">
                <h4 className="text-emerald-400 font-medium mb-2 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4" />
                  Getting Your Amazon Ads API Credentials
                </h4>
                <div className="text-slate-300 text-sm space-y-2">
                  <p>1. Go to <strong>Amazon Advertising API Console</strong> → Create or select your app</p>
                  <p>2. Under <strong>Settings → Authorization</strong>, generate a refresh token</p>
                  <p>3. Copy your LWA Client ID, Client Secret, and Refresh Token</p>
                  <p>4. Profile ID is auto-detected — click "Fetch Profiles" after entering credentials</p>
                </div>
                <p className="text-slate-500 text-xs mt-3">This pulls daily SP/SB/SD campaign data via the Reporting API. Syncs spend, revenue, ACOS, and campaign performance into your daily tracking automatically.</p>
              </div>
            </div>
          )}
        </SettingSection>
        <SettingSection title="🔄 Auto-Sync Settings">
          <p className="text-slate-400 text-sm mb-4">
            Automatically sync Amazon, Shopify, and Packiyo data to keep inventory velocity accurate
          </p>
          
          {/* Master Toggle */}
          <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-4 mb-4">
            <div>
              <p className="text-white font-medium">Enable Auto-Sync</p>
              <p className="text-slate-400 text-xs">Automatically sync connected services when data is stale</p>
            </div>
            <button
              onClick={() => setAppSettings(prev => ({
                ...prev,
                autoSync: { ...prev.autoSync, enabled: !prev.autoSync?.enabled }
              }))}
              className={`w-12 h-6 rounded-full transition-colors relative ${appSettings.autoSync?.enabled ? 'bg-emerald-500' : 'bg-slate-600'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${appSettings.autoSync?.enabled ? 'left-6' : 'left-0.5'}`} />
            </button>
          </div>
          
          {appSettings.autoSync?.enabled && (
            <div className="space-y-4">
              {/* Sync Interval */}
              <div className="bg-slate-800/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-white font-medium">Sync Interval</p>
                  <select
                    value={appSettings.autoSync?.intervalHours || 4}
                    onChange={(e) => setAppSettings(prev => ({
                      ...prev,
                      autoSync: { ...prev.autoSync, intervalHours: parseInt(e.target.value) }
                    }))}
                    className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white"
                  >
                    <option value={1}>Every 1 hour</option>
                    <option value={2}>Every 2 hours</option>
                    <option value={4}>Every 4 hours</option>
                    <option value={6}>Every 6 hours</option>
                    <option value={12}>Every 12 hours</option>
                    <option value={24}>Once daily</option>
                  </select>
                </div>
                <p className="text-slate-500 text-xs">How often to sync while the app is open</p>
              </div>
              
              {/* Sync on App Load */}
              <div className="flex items-center justify-between bg-slate-800/30 rounded-lg p-4">
                <div>
                  <p className="text-white font-medium">Sync on App Load</p>
                  <p className="text-slate-400 text-xs">Automatically sync when you open the dashboard</p>
                </div>
                <button
                  onClick={() => setAppSettings(prev => ({
                    ...prev,
                    autoSync: { ...prev.autoSync, onAppLoad: !prev.autoSync?.onAppLoad }
                  }))}
                  className={`w-12 h-6 rounded-full transition-colors relative ${appSettings.autoSync?.onAppLoad !== false ? 'bg-emerald-500' : 'bg-slate-600'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${appSettings.autoSync?.onAppLoad !== false ? 'left-6' : 'left-0.5'}`} />
                </button>
              </div>
              
              {/* Service Toggles */}
              <div className="bg-slate-800/30 rounded-lg p-4">
                <p className="text-white font-medium mb-3">Services to Auto-Sync</p>
                
                <div className="space-y-3">
                  {/* Amazon */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${amazonCredentials.connected ? 'bg-orange-400' : 'bg-slate-500'}`} />
                      <span className="text-slate-300">Amazon SP-API</span>
                      {amazonCredentials.lastSync && (
                        <span className="text-slate-500 text-xs">
                          Last: {new Date(amazonCredentials.lastSync).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setAppSettings(prev => ({
                        ...prev,
                        autoSync: { ...prev.autoSync, amazon: !prev.autoSync?.amazon }
                      }))}
                      disabled={!amazonCredentials.connected}
                      className={`w-10 h-5 rounded-full transition-colors relative ${appSettings.autoSync?.amazon !== false && amazonCredentials.connected ? 'bg-orange-500' : 'bg-slate-600'} ${!amazonCredentials.connected ? 'opacity-50' : ''}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${appSettings.autoSync?.amazon !== false ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </div>
                  
                  {/* Amazon Ads API */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${amazonCredentials.adsConnected ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                      <span className="text-slate-300">Amazon Ads API</span>
                      {amazonCredentials.adsLastSync && (
                        <span className="text-slate-500 text-xs">
                          Last: {new Date(amazonCredentials.adsLastSync).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setAppSettings(prev => ({
                        ...prev,
                        autoSync: { ...prev.autoSync, amazonAds: !prev.autoSync?.amazonAds }
                      }))}
                      disabled={!amazonCredentials.adsConnected}
                      className={`w-10 h-5 rounded-full transition-colors relative ${appSettings.autoSync?.amazonAds !== false && amazonCredentials.adsConnected ? 'bg-emerald-500' : 'bg-slate-600'} ${!amazonCredentials.adsConnected ? 'opacity-50' : ''}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${appSettings.autoSync?.amazonAds !== false ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </div>
                  
                  {/* Shopify */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${shopifyCredentials.connected ? 'bg-green-400' : 'bg-slate-500'}`} />
                      <span className="text-slate-300">Shopify</span>
                      {shopifyCredentials.lastSync && (
                        <span className="text-slate-500 text-xs">
                          Last: {new Date(shopifyCredentials.lastSync).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setAppSettings(prev => ({
                        ...prev,
                        autoSync: { ...prev.autoSync, shopify: !prev.autoSync?.shopify }
                      }))}
                      disabled={!shopifyCredentials.connected}
                      className={`w-10 h-5 rounded-full transition-colors relative ${appSettings.autoSync?.shopify !== false && shopifyCredentials.connected ? 'bg-green-500' : 'bg-slate-600'} ${!shopifyCredentials.connected ? 'opacity-50' : ''}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${appSettings.autoSync?.shopify !== false ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </div>
                  
                  {/* Ship Sidekick 3PL */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${shipSidekickCredentials?.connected ? 'bg-blue-400' : 'bg-slate-500'}`} />
                      <span className="text-slate-300">Ship Sidekick 3PL</span>
                      {shipSidekickCredentials?.lastSync && (
                        <span className="text-slate-500 text-xs">
                          Last: {new Date(shipSidekickCredentials.lastSync).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setAppSettings(prev => ({
                        ...prev,
                        autoSync: { ...prev.autoSync, shipsidekick: !prev.autoSync?.shipsidekick }
                      }))}
                      disabled={!shipSidekickCredentials?.connected}
                      className={`w-10 h-5 rounded-full transition-colors relative ${appSettings.autoSync?.shipsidekick !== false && shipSidekickCredentials?.connected ? 'bg-blue-500' : 'bg-slate-600'} ${!shipSidekickCredentials?.connected ? 'opacity-50' : ''}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${appSettings.autoSync?.shipsidekick !== false ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${qboCredentials.connected ? 'bg-green-400' : 'bg-slate-500'}`} />
                      <span className="text-slate-300">QuickBooks</span>
                      {qboCredentials.lastSync && (
                        <span className="text-slate-500 text-xs">
                          Last: {new Date(qboCredentials.lastSync).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setAppSettings(prev => ({
                        ...prev,
                        autoSync: { ...prev.autoSync, qbo: !prev.autoSync?.qbo }
                      }))}
                      disabled={!qboCredentials.connected}
                      className={`w-10 h-5 rounded-full transition-colors relative ${appSettings.autoSync?.qbo !== false && qboCredentials.connected ? 'bg-green-500' : 'bg-slate-600'} ${!qboCredentials.connected ? 'opacity-50' : ''}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${appSettings.autoSync?.qbo !== false ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Manual Sync Button */}
              <button
                onClick={() => runAutoSync(true)}
                disabled={autoSyncStatus.running}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 rounded-lg text-white font-medium flex items-center justify-center gap-2"
              >
                {autoSyncStatus.running ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Sync All Now
                  </>
                )}
              </button>
              
              {autoSyncStatus.lastCheck && (
                <p className="text-center text-slate-500 text-xs">
                  Last check: {new Date(autoSyncStatus.lastCheck).toLocaleString()}
                </p>
              )}
            </div>
          )}
          
          {!appSettings.autoSync?.enabled && (
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
              <p className="text-blue-400 text-sm">
                💡 <strong>Pro tip:</strong> Enable auto-sync to keep your velocity data accurate. 
                The system will automatically fetch the latest inventory and sales data from your connected services.
              </p>
            </div>
          )}
        </SettingSection>
        
        {/* Inventory Source Configuration */}
        <SettingSection title="🏪 Inventory Sources">
          <p className="text-slate-400 text-sm mb-4">Configure which sources provide inventory for each location</p>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-violet-500/20 rounded-lg flex items-center justify-center">
                  <Truck className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <p className="text-white font-medium">3PL Inventory</p>
                  <p className="text-slate-400 text-xs">Fulfillment center stock</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {shipSidekickCredentials?.connected ? (
                  <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded-full">Ship Sidekick</span>
                ) : packiyoCredentials.connected ? (
                  <span className="px-2 py-1 bg-violet-500/20 text-violet-400 text-xs rounded-full">Packiyo (Legacy)</span>
                ) : (
                  <span className="px-2 py-1 bg-slate-600/50 text-slate-400 text-xs rounded-full">Not Connected</span>
                )}
              </div>
            </div>
            
            <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
                  <Store className="w-4 h-4 text-green-400" />
                </div>
                <div>
                  <p className="text-white font-medium">Wormans Mill Inventory</p>
                  <p className="text-slate-400 text-xs">Home/office stock</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {shopifyCredentials.connected ? (
                  <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">Shopify Sync</span>
                ) : (
                  <span className="px-2 py-1 bg-slate-600/50 text-slate-400 text-xs rounded-full">Not Connected</span>
                )}
              </div>
            </div>
            
            <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4 text-orange-400" />
                </div>
                <div>
                  <p className="text-white font-medium">Amazon FBA + AWD Inventory</p>
                  <p className="text-slate-400 text-xs">Amazon fulfillment centers</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {amazonCredentials.connected ? (
                  <span className="px-2 py-1 bg-orange-500/20 text-orange-400 text-xs rounded-full">SP-API Direct</span>
                ) : (
                  <span className="px-2 py-1 bg-slate-600/50 text-slate-400 text-xs rounded-full">File Upload</span>
                )}
              </div>
            </div>
          </div>
          
          <p className="text-slate-500 text-xs mt-4">
            ℹ️ Inventory sources are additive and don't overwrite each other. Amazon FBA/AWD, 3PL (Packiyo), and Wormans Mill (Shopify) inventories are tracked separately.
          </p>
        </SettingSection>
        
        {/* QuickBooks Online API Connection */}
        <SettingSection title="💳 QuickBooks Online API">
          <p className="text-slate-400 text-sm mb-4">Connect to QuickBooks Online to automatically sync bank transactions, eliminating manual CSV uploads</p>
          
          {qboCredentials.connected ? (
            <div className="space-y-4">
              <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
                      <Check className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-emerald-400 font-medium">Connected to QuickBooks</p>
                      <p className="text-slate-400 text-sm">Company ID: {qboCredentials.realmId}</p>
                      {qboCredentials.lastSync && (
                        <p className="text-slate-500 text-xs">Last sync: {new Date(qboCredentials.lastSync).toLocaleString()}</p>
                      )}
                      {!qboCredentials.accessToken && qboCredentials.refreshToken && (
                        <p className="text-amber-400 text-xs mt-1">⚠️ Token expired — will auto-refresh on next sync</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (window.confirm('Disconnect QuickBooks? Your synced transactions will remain.')) {
                        setQboCredentials({ clientId: '', clientSecret: '', realmId: '', accessToken: '', refreshToken: '', connected: false, lastSync: null, syncFrequency: 'daily', autoSync: false });
                        setToast({ message: 'QuickBooks disconnected', type: 'success' });
                      }
                    }}
                    className="px-4 py-2 bg-rose-600/30 hover:bg-rose-600/50 border border-rose-500/50 rounded-lg text-sm text-rose-300"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
              
              <SettingRow label="Auto-Sync" desc="Automatically sync transactions">
                <Toggle 
                  checked={qboCredentials.autoSync} 
                  onChange={(v) => setQboCredentials(p => ({ ...p, autoSync: v }))} 
                />
              </SettingRow>
              
              {qboCredentials.autoSync && (
                <SettingRow label="Sync Frequency" desc="How often to pull new transactions">
                  <select
                    value={qboCredentials.syncFrequency}
                    onChange={(e) => setQboCredentials(p => ({ ...p, syncFrequency: e.target.value }))}
                    className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </SettingRow>
              )}
              
              <button
                onClick={async () => {
                  setToast({ message: 'Syncing from QuickBooks...', type: 'info' });
                  
                  let currentAccessToken = qboCredentials.accessToken;
                  
                  try {
                    // If no access token but we have a refresh token, refresh first
                    if (!currentAccessToken && qboCredentials.refreshToken) {
                      setToast({ message: 'Refreshing QuickBooks token...', type: 'info' });
                      const refreshRes = await fetch('/api/qbo/refresh', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ refreshToken: qboCredentials.refreshToken }),
                      });
                      if (refreshRes.ok) {
                        const refreshData = await refreshRes.json();
                        currentAccessToken = refreshData.accessToken;
                        setQboCredentials(p => ({
                          ...p,
                          accessToken: refreshData.accessToken,
                          refreshToken: refreshData.refreshToken || p.refreshToken,
                        }));
                      } else {
                        const refreshError = await refreshRes.json().catch(() => ({}));
                        if (refreshError.needsReauth) {
                          setQboCredentials(p => ({ ...p, connected: false, accessToken: '', refreshToken: '' }));
                          throw new Error('Session expired. Please reconnect to QuickBooks.');
                        }
                        throw new Error('Failed to refresh token. Please reconnect to QuickBooks.');
                      }
                    }
                    
                    if (!currentAccessToken) {
                      throw new Error('No QuickBooks access token. Please connect to QuickBooks first.');
                    }
                    
                    if (!qboCredentials.realmId) {
                      throw new Error('No QuickBooks Company ID (realmId). Please reconnect to QuickBooks.');
                    }
                    
                    // Sync with current (or refreshed) token
                    let res = await fetch('/api/qbo/sync', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        realmId: qboCredentials.realmId,
                        accessToken: currentAccessToken,
                        refreshToken: qboCredentials.refreshToken,
                      }),
                    });
                    
                    // If token expired, try to refresh
                    if (res.status === 401) {
                      setToast({ message: 'Token expired, refreshing...', type: 'info' });
                      
                      const refreshRes = await fetch('/api/qbo/refresh', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          refreshToken: qboCredentials.refreshToken,
                        }),
                      });
                      
                      if (refreshRes.ok) {
                        const refreshData = await refreshRes.json();
                        currentAccessToken = refreshData.accessToken;
                        
                        // Update stored tokens
                        setQboCredentials(p => ({
                          ...p,
                          accessToken: refreshData.accessToken,
                          refreshToken: refreshData.refreshToken || p.refreshToken,
                        }));
                        
                        // Retry sync with new token
                        res = await fetch('/api/qbo/sync', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            realmId: qboCredentials.realmId,
                            accessToken: currentAccessToken,
                            refreshToken: refreshData.refreshToken || qboCredentials.refreshToken,
                          }),
                        });
                      } else {
                        const refreshError = await refreshRes.json();
                        if (refreshError.needsReauth) {
                          setQboCredentials(p => ({ ...p, connected: false, accessToken: '', refreshToken: '' }));
                          throw new Error('Session expired. Please reconnect to QuickBooks.');
                        }
                        throw new Error('Failed to refresh token');
                      }
                    }
                    
                    if (res.ok) {
                      const data = await res.json();
                      
                      // Update banking data with transactions AND real account balances
                      setBankingData(prev => {
                        const existingIds = new Set((prev?.transactions || []).map(t => t.qboId).filter(Boolean));
                        
                        // Transform QBO transactions to match the expected format
                        const newTransactions = (data.transactions || [])
                          .filter(t => !existingIds.has(t.qboId))
                          .map(t => {
                            // Determine income/expense based on type and amount
                            const isIncome = t.type === 'income' || (t.type === 'transfer' && t.amount > 0);
                            const isExpense = t.type === 'expense' || t.type === 'bill' || (t.type === 'transfer' && t.amount < 0);
                            
                            // Map QBO entity type to a display-friendly transaction type
                            const displayType = t.qboType === 'SalesReceipt' ? 'Sales Receipt'
                              : t.qboType === 'Invoice' ? 'Invoice'
                              : t.qboType === 'Payment' ? 'Payment'
                              : t.qboType === 'RefundReceipt' ? 'Refund Receipt'
                              : t.qboType === 'Deposit' ? 'Deposit'
                              : t.qboType === 'Purchase' ? 'Expense'
                              : t.qboType === 'Transfer' ? 'Transfer'
                              : t.qboType === 'Bill' ? 'Bill'
                              : t.type;
                            
                            // Calculate display amount (always positive for display)
                            const displayAmount = Math.abs(t.amount);
                            
                            // Determine top category from QBO data
                            const topCategory = t.category || t.account || 'Uncategorized';
                            
                            return {
                              ...t,
                              // Override type with display-friendly QBO type for banking tab classification
                              type: displayType,
                              // Add required flags for banking view
                              isIncome,
                              isExpense,
                              // Store positive amount for consistent display
                              amount: displayAmount,
                              originalAmount: t.amount,
                              // Category mapping
                              topCategory,
                              subCategory: t.memo || t.description || '',
                              // Ensure date is properly formatted
                              date: t.date || new Date().toISOString().split('T')[0],
                            };
                          });
                        
                        // Convert QBO accounts array to our accounts object format
                        const updatedAccounts = { ...(prev?.accounts || {}) };
                        
                        // Update with ACTUAL balances from QBO
                        if (data.bankAccounts) {
                          data.bankAccounts.forEach(acc => {
                            updatedAccounts[acc.name] = {
                              ...updatedAccounts[acc.name],
                              name: acc.name,
                              type: 'checking',
                              balance: acc.currentBalance,
                              qboId: acc.id,
                              lastSynced: new Date().toISOString(),
                              transactions: 0,
                            };
                          });
                        }
                        
                        if (data.creditCards) {
                          data.creditCards.forEach(acc => {
                            updatedAccounts[acc.name] = {
                              ...updatedAccounts[acc.name],
                              name: acc.name,
                              type: 'credit_card',
                              balance: Math.abs(acc.currentBalance),
                              qboId: acc.id,
                              lastSynced: new Date().toISOString(),
                              transactions: 0,
                            };
                          });
                        }
                        
                        // Recalculate categories from all transactions (including new ones)
                        const allTxns = [...(prev?.transactions || []), ...newTransactions];
                        const updatedCategories = {};
                        allTxns.forEach(txn => {
                          const cat = txn.topCategory || 'Uncategorized';
                          if (!updatedCategories[cat]) {
                            updatedCategories[cat] = { totalIn: 0, totalOut: 0, transactions: 0 };
                          }
                          if (txn.isIncome) updatedCategories[cat].totalIn += txn.amount;
                          if (txn.isExpense) updatedCategories[cat].totalOut += txn.amount;
                          updatedCategories[cat].transactions += 1;
                        });
                        
                        // Recalculate account transaction counts
                        allTxns.forEach(txn => {
                          const acctName = txn.account;
                          if (acctName && updatedAccounts[acctName]) {
                            updatedAccounts[acctName].transactions = (updatedAccounts[acctName].transactions || 0) + 1;
                          }
                        });
                        
                        return {
                          ...prev,
                          transactions: allTxns,
                          accounts: updatedAccounts,
                          categories: updatedCategories,
                          lastUpdated: new Date().toISOString(),
                          lastUpload: new Date().toISOString(),
                          // Store summary from QBO
                          qboSummary: data.summary,
                          // NEW: Store vendors with spending data
                          vendors: data.vendors || [],
                          // NEW: Store chart of accounts
                          chartOfAccounts: data.chartOfAccounts || [],
                          // NEW: Store P&L report
                          profitAndLoss: data.profitAndLoss || null,
                          // NEW: Store revenue by channel (Amazon vs Shopify)
                          revenueByChannel: data.revenueByChannel || null,
                        };
                      });
                      
                      setQboCredentials(p => ({ ...p, lastSync: new Date().toISOString() }));
                      
                      const txnCount = data.transactions?.length || 0;
                      const acctCount = (data.bankAccounts?.length || 0) + (data.creditCards?.length || 0);
                      const vendorCount = data.vendors?.length || 0;
                      const hasPL = data.profitAndLoss ? true : false;
                      setToast({ 
                        message: `Synced ${txnCount} transactions, ${acctCount} accounts, ${vendorCount} vendors${hasPL ? ', P&L report' : ''} from QuickBooks`, 
                        type: 'success' 
                      });
                    } else {
                      const errorData = await res.json();
                      throw new Error(errorData.error || 'Sync failed');
                    }
                  } catch (err) {
                    setToast({ message: 'QuickBooks sync failed: ' + err.message, type: 'error' });
                  }
                }}
                className="w-full px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-xl text-white font-medium flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />Sync Now
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-slate-900/50 rounded-xl p-4">
                <div className="space-y-4">
                  <div>
                    <label className="block text-slate-300 text-sm font-medium mb-2">Client ID</label>
                    <input
                      type="text"
                      placeholder="Your QBO app Client ID"
                      value={qboCredentials.clientId}
                      onChange={(e) => setQboCredentials(p => ({ ...p, clientId: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 text-sm font-medium mb-2">Client Secret</label>
                    <input
                      type="text" style={{WebkitTextSecurity: "disc"}}
                      placeholder="Your QBO app Client Secret"
                      value={qboCredentials.clientSecret}
                      onChange={(e) => setQboCredentials(p => ({ ...p, clientSecret: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 text-sm font-medium mb-2">Company ID (Realm ID)</label>
                    <input
                      type="text"
                      placeholder="Your QuickBooks company ID"
                      value={qboCredentials.realmId}
                      onChange={(e) => setQboCredentials(p => ({ ...p, realmId: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-slate-500 text-xs mt-1">Found in your QBO URL: ...app.qbo.intuit.com/app/homepage?companyId=<strong>123456789</strong></p>
                  </div>
                  
                  <button
                    onClick={async () => {
                      if (!qboCredentials.clientId || !qboCredentials.clientSecret) {
                        setToast({ message: 'Please enter Client ID and Client Secret', type: 'error' });
                        return;
                      }
                      
                      setToast({ message: 'Initiating QuickBooks OAuth...', type: 'info' });
                      
                      try {
                        // Redirect to QBO OAuth
                        const res = await fetch('/api/qbo/auth', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            clientId: qboCredentials.clientId,
                            clientSecret: qboCredentials.clientSecret,
                            realmId: qboCredentials.realmId,
                          }),
                        });
                        
                        if (res.ok) {
                          const data = await res.json();
                          if (data.authUrl) {
                            // Open OAuth window
                            window.open(data.authUrl, 'qbo-oauth', 'width=600,height=700');
                          } else if (data.accessToken) {
                            // Direct token (for testing)
                            setQboCredentials(p => ({ 
                              ...p, 
                              accessToken: data.accessToken,
                              refreshToken: data.refreshToken,
                              connected: true, 
                              lastSync: null 
                            }));
                            setToast({ message: 'Connected to QuickBooks!', type: 'success' });
                          }
                        } else {
                          throw new Error('Authentication failed');
                        }
                      } catch (err) {
                        setToast({ message: 'QuickBooks connection failed: ' + err.message, type: 'error' });
                      }
                    }}
                    disabled={!qboCredentials.clientId || !qboCredentials.clientSecret}
                    className="w-full px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-700 disabled:to-slate-700 rounded-xl text-white font-medium flex items-center justify-center gap-2"
                  >
                    <Landmark className="w-4 h-4" />Connect to QuickBooks
                  </button>
                </div>
              </div>
              
              <details className="bg-slate-800/30 rounded-xl p-4">
                <summary className="text-slate-300 font-medium cursor-pointer">Getting Your QuickBooks API Credentials</summary>
                <div className="mt-4 space-y-3 text-slate-400 text-sm">
                  <p><strong className="text-white">1.</strong> Go to <a href="https://developer.intuit.com" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">developer.intuit.com</a> and sign in</p>
                  <p><strong className="text-white">2.</strong> Create a new app or select existing app</p>
                  <p><strong className="text-white">3.</strong> Go to Keys & OAuth → Production Keys</p>
                  <p><strong className="text-white">4.</strong> Copy Client ID and Client Secret</p>
                  <p><strong className="text-white">5.</strong> Add this redirect URI: <code className="bg-slate-900 px-2 py-1 rounded text-xs">{typeof window !== 'undefined' ? window.location.origin : ''}/api/qbo/callback</code></p>
                  <p><strong className="text-white">6.</strong> Your Company ID is in the QBO URL when logged in</p>
                </div>
              </details>
              
              <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4">
                <p className="text-amber-300 text-sm flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>QBO API requires a backend server to handle OAuth. If you're running this locally, you can still use CSV uploads on the Banking page.</span>
                </p>
              </div>
              
              {/* Reset button for stuck QBO state */}
              {(qboCredentials.refreshToken || qboCredentials.accessToken || qboCredentials.realmId) && (
                <button
                  onClick={() => {
                    setQboCredentials({ clientId: '', clientSecret: '', realmId: '', accessToken: '', refreshToken: '', connected: false, lastSync: null, syncFrequency: 'daily', autoSync: false });
                    setToast({ message: 'QBO connection reset. You can reconnect now.', type: 'success' });
                  }}
                  className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-sm text-slate-300 flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-3 h-3" />Reset QBO Connection
                </button>
              )}
            </div>
          )}
        </SettingSection>
          </>
        )}
        
        {/* ========== THRESHOLDS TAB ========== */}
        {settingsTab === 'thresholds' && (
          <>
        {/* Inventory Thresholds */}
        <SettingSection title="📦 Inventory Thresholds">
          <p className="text-slate-400 text-sm mb-4">Define what stock levels trigger alerts</p>
          <SettingRow label="Optimal Days of Inventory" desc="Stock level considered healthy">
            <NumberInput value={currentLocalSettings.inventoryDaysOptimal} onChange={(v) => updateSetting('inventoryDaysOptimal', v)} min={1} max={365} suffix="days" />
          </SettingRow>
          <SettingRow label="Low Stock Threshold" desc="Triggers low stock warning">
            <NumberInput value={currentLocalSettings.inventoryDaysLow} onChange={(v) => updateSetting('inventoryDaysLow', v)} min={1} max={180} suffix="days" />
          </SettingRow>
          <SettingRow label="Critical Stock Threshold" desc="Triggers urgent reorder alert">
            <NumberInput value={currentLocalSettings.inventoryDaysCritical} onChange={(v) => updateSetting('inventoryDaysCritical', v)} min={1} max={60} suffix="days" />
          </SettingRow>
        </SettingSection>
        
        {/* Ad Performance */}
        <SettingSection title="📊 Ad Performance (TACOS)">
          <p className="text-slate-400 text-sm mb-4">Total Advertising Cost of Sale thresholds</p>
          <SettingRow label="Optimal TACOS" desc="Ad spend % of revenue considered good">
            <NumberInput value={currentLocalSettings.tacosOptimal} onChange={(v) => updateSetting('tacosOptimal', v)} min={1} max={50} suffix="%" />
          </SettingRow>
          <SettingRow label="Warning TACOS" desc="Triggers yellow warning indicator">
            <NumberInput value={currentLocalSettings.tacosWarning} onChange={(v) => updateSetting('tacosWarning', v)} min={1} max={75} suffix="%" />
          </SettingRow>
          <SettingRow label="Maximum TACOS" desc="Triggers red alert indicator">
            <NumberInput value={currentLocalSettings.tacosMax} onChange={(v) => updateSetting('tacosMax', v)} min={1} max={100} suffix="%" />
          </SettingRow>
          <SettingRow label="Target ROAS" desc="Return on ad spend target">
            <NumberInput value={currentLocalSettings.roasTarget} onChange={(v) => updateSetting('roasTarget', v)} min={0.5} max={20} step={0.1} suffix="x" />
          </SettingRow>
        </SettingSection>
        
        {/* Profit Thresholds */}
        <SettingSection title="💰 Profit Thresholds">
          <SettingRow label="Target Net Margin" desc="Net profit margin goal">
            <NumberInput value={currentLocalSettings.marginTarget} onChange={(v) => updateSetting('marginTarget', v)} min={1} max={100} suffix="%" />
          </SettingRow>
          <SettingRow label="Margin Warning" desc="Below this triggers warning">
            <NumberInput value={currentLocalSettings.marginWarning} onChange={(v) => updateSetting('marginWarning', v)} min={1} max={50} suffix="%" />
          </SettingRow>
        </SettingSection>
        
        {/* Alert Preferences */}
        <SettingSection title="🔔 Alert Preferences">
          <SettingRow label="Inventory Alerts" desc="Show low stock warnings on dashboard">
            <Toggle checked={currentLocalSettings.alertInventoryEnabled} onChange={(v) => updateSetting('alertInventoryEnabled', v)} />
          </SettingRow>
          <SettingRow label="Goals Alerts" desc="Show missed targets on dashboard">
            <Toggle checked={currentLocalSettings.alertGoalsEnabled} onChange={(v) => updateSetting('alertGoalsEnabled', v)} />
          </SettingRow>
          <SettingRow label="Sales Tax Alerts" desc="Show upcoming filing deadlines">
            <Toggle checked={currentLocalSettings.alertSalesTaxEnabled} onChange={(v) => updateSetting('alertSalesTaxEnabled', v)} />
          </SettingRow>
          <SettingRow label="Sales Tax Alert Days" desc="Days before deadline to show alert">
            <NumberInput value={currentLocalSettings.alertSalesTaxDays} onChange={(v) => updateSetting('alertSalesTaxDays', v)} min={1} max={30} suffix="days" />
          </SettingRow>
        </SettingSection>
          </>
        )}
        
        {/* ========== DISPLAY TAB ========== */}
        {settingsTab === 'display' && (
          <>
        {/* Module Visibility */}
        <SettingSection title="📱 Module Visibility">
          <p className="text-slate-400 text-sm mb-4">Show/hide sections to streamline your dashboard</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <SettingRow label="Weekly Tracking">
              <Toggle checked={currentLocalSettings.modulesEnabled?.weeklyTracking !== false} onChange={(v) => updateSetting('modulesEnabled.weeklyTracking', v)} />
            </SettingRow>
            <SettingRow label="Period Tracking">
              <Toggle checked={currentLocalSettings.modulesEnabled?.periodTracking !== false} onChange={(v) => updateSetting('modulesEnabled.periodTracking', v)} />
            </SettingRow>
            <SettingRow label="Inventory">
              <Toggle checked={currentLocalSettings.modulesEnabled?.inventory !== false} onChange={(v) => updateSetting('modulesEnabled.inventory', v)} />
            </SettingRow>
            <SettingRow label="Trends Analytics">
              <Toggle checked={currentLocalSettings.modulesEnabled?.trends !== false} onChange={(v) => updateSetting('modulesEnabled.trends', v)} />
            </SettingRow>
            <SettingRow label="YoY Comparison">
              <Toggle checked={currentLocalSettings.modulesEnabled?.yoy !== false} onChange={(v) => updateSetting('modulesEnabled.yoy', v)} />
            </SettingRow>
            <SettingRow label="SKU Rankings">
              <Toggle checked={currentLocalSettings.modulesEnabled?.skus !== false} onChange={(v) => updateSetting('modulesEnabled.skus', v)} />
            </SettingRow>
            <SettingRow label="Profitability">
              <Toggle checked={currentLocalSettings.modulesEnabled?.profitability !== false} onChange={(v) => updateSetting('modulesEnabled.profitability', v)} />
            </SettingRow>
            <SettingRow label="Ads Analytics">
              <Toggle checked={currentLocalSettings.modulesEnabled?.ads !== false} onChange={(v) => updateSetting('modulesEnabled.ads', v)} />
            </SettingRow>
            <SettingRow label="3PL Analytics">
              <Toggle checked={currentLocalSettings.modulesEnabled?.threepl !== false} onChange={(v) => updateSetting('modulesEnabled.threepl', v)} />
            </SettingRow>
            <SettingRow label="Sales Tax">
              <Toggle checked={currentLocalSettings.modulesEnabled?.salesTax !== false} onChange={(v) => updateSetting('modulesEnabled.salesTax', v)} />
            </SettingRow>
          </div>
        </SettingSection>
        
        {/* Dashboard Preferences */}
        <SettingSection title="🏠 Dashboard Preferences">
          <SettingRow label="Default Time Range" desc="Initial view when loading dashboard">
            <select value={currentLocalSettings.dashboardDefaultRange || 'month'} onChange={(e) => updateSetting('dashboardDefaultRange', e.target.value)} className="bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white">
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="quarter">Quarter</option>
              <option value="year">Year</option>
            </select>
          </SettingRow>
          <SettingRow label="Show Weekly Goals" desc="Display weekly targets on dashboard">
            <Toggle checked={currentLocalSettings.showWeeklyGoals !== false} onChange={(v) => updateSetting('showWeeklyGoals', v)} />
          </SettingRow>
          <SettingRow label="Show Monthly Goals" desc="Display monthly targets on dashboard">
            <Toggle checked={currentLocalSettings.showMonthlyGoals !== false} onChange={(v) => updateSetting('showMonthlyGoals', v)} />
          </SettingRow>
        </SettingSection>
        
        {/* Theme & Display (Feature 9) */}
        <SettingSection title="🎨 Theme & Display">
          <SettingRow label="Appearance" desc="Switch between dark and light mode">
            <div className="flex items-center gap-2">
              <button onClick={() => setTheme(p => ({...p, mode: 'dark'}))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${theme.mode === 'dark' ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                <Moon className="w-3.5 h-3.5" /> Dark
              </button>
              <button onClick={() => setTheme(p => ({...p, mode: 'light'}))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${theme.mode === 'light' ? 'bg-amber-100 text-amber-800' : 'bg-slate-800 text-slate-400'}`}>
                <Sun className="w-3.5 h-3.5" /> Light
              </button>
            </div>
          </SettingRow>
          <SettingRow label="Color Theme" desc="Customize accent colors">
            <div className="flex gap-2">
              {['violet', 'emerald', 'blue', 'rose', 'amber'].map(color => (
                <button key={color} onClick={() => setTheme(p => ({...p, accent: color}))}
                  className={`w-8 h-8 rounded-full bg-${color}-500 ${theme.accent === color ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-800' : ''}`} />
              ))}
            </div>
          </SettingRow>
          <SettingRow label="Mobile-Optimized View" desc="Simplified layout for small screens">
            <div className="flex items-center gap-2">
              <Toggle checked={isMobile} onChange={(val) => setIsMobile(val)} />
              <span className="text-slate-500 text-xs">(Auto-detected)</span>
            </div>
          </SettingRow>
        </SettingSection>

        {/* AI Model Selection */}
        <SettingSection title="🧠 AI Model">
          <SettingRow label="Report Generation Model" desc="Controls Amazon PPC & DTC Action Reports only">
            <select
              value={currentLocalSettings.aiModel || AI_DEFAULT_MODEL}
              onChange={(e) => updateSetting('aiModel', e.target.value)}
              className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              {Object.entries(AI_MODELS).map(([key, m]) => (
                <option key={key} value={key}>{m.label} — {m.tier} ({m.cost})</option>
              ))}
            </select>
          </SettingRow>
          <div className="bg-slate-800/50 rounded-lg p-3 text-xs text-slate-400 space-y-1">
            <p><strong className="text-white">How models are routed:</strong></p>
            <p>🟣 <strong className="text-violet-300">Action Reports</strong> (Amazon PPC + DTC) → <strong className="text-white">Your selection above</strong> (default: Sonnet 4.5)</p>
            <p>💬 <strong className="text-cyan-300">AI Chat</strong> → Your selection in Ads tab (default: Sonnet 4.5)</p>
            <p>📈 <strong className="text-emerald-300">Forecasts & Analytics</strong> → Sonnet 4.5 (always, needs precision)</p>
            <p className="text-slate-500 mt-2">Sonnet 4.5 = best value for reports. Switch to Opus for quarterly deep-dives (~5x cost, deepest reasoning).</p>
          </div>
        </SettingSection>
        
        {/* Notifications (Feature 4) - Enhanced */}
        <SettingSection title="🔔 Push Notifications">
          <SettingRow label="Enable Notifications" desc="Get browser push notifications for important alerts">
            {notificationSettings.enabled && notificationSettings.permission === 'granted' ? (
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400 text-sm">Enabled</span>
                <button 
                  onClick={() => setNotificationSettings(s => ({ ...s, enabled: false }))}
                  className="ml-2 text-xs text-slate-500 hover:text-slate-300"
                >
                  Disable
                </button>
              </div>
            ) : notificationSettings.permission === 'denied' ? (
              <div className="text-rose-400 text-sm">Blocked - enable in browser settings</div>
            ) : (
              <button 
                onClick={async () => {
                  if ('Notification' in window) {
                    const permission = await Notification.requestPermission();
                    if (permission === 'granted') {
                      setNotificationSettings(s => ({ ...s, enabled: true, permission: 'granted' }));
                      new Notification('Notifications Enabled!', {
                        body: 'You will now receive alerts for inventory and deadlines.',
                        icon: storeLogo || '/favicon.ico'
                      });
                      setToast({ message: 'Push notifications enabled!', type: 'success' });
                    } else {
                      setNotificationSettings(s => ({ ...s, permission }));
                      setToast({ message: 'Notification permission denied', type: 'error' });
                    }
                  } else {
                    setToast({ message: 'Your browser does not support notifications', type: 'error' });
                  }
                }} 
                className="px-4 py-2 bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/50 rounded-lg text-sm text-violet-300 flex items-center gap-2"
              >
                <Bell className="w-4 h-4" />Enable Notifications
              </button>
            )}
          </SettingRow>
          
          {notificationSettings.enabled && (
            <>
              <div className="border-t border-slate-700/50 my-4" />
              <p className="text-slate-400 text-sm mb-3">Notify me about:</p>
              
              <SettingRow label="Low Inventory" desc="When products fall below reorder threshold">
                <button
                  onClick={() => setNotificationSettings(s => ({ 
                    ...s, 
                    alerts: { ...s.alerts, lowInventory: !s.alerts.lowInventory } 
                  }))}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    notificationSettings.alerts.lowInventory ? 'bg-emerald-500' : 'bg-slate-600'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${
                    notificationSettings.alerts.lowInventory ? 'left-6' : 'left-0.5'
                  }`} />
                </button>
              </SettingRow>
              
              <SettingRow label="Critical Inventory" desc="When products have < 7 days of stock">
                <button
                  onClick={() => setNotificationSettings(s => ({ 
                    ...s, 
                    alerts: { ...s.alerts, criticalInventory: !s.alerts.criticalInventory } 
                  }))}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    notificationSettings.alerts.criticalInventory ? 'bg-emerald-500' : 'bg-slate-600'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${
                    notificationSettings.alerts.criticalInventory ? 'left-6' : 'left-0.5'
                  }`} />
                </button>
              </SettingRow>
              
              <SettingRow label="Overdue Bills" desc="When invoices pass their due date">
                <button
                  onClick={() => setNotificationSettings(s => ({ 
                    ...s, 
                    alerts: { ...s.alerts, overdueBills: !s.alerts.overdueBills } 
                  }))}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    notificationSettings.alerts.overdueBills ? 'bg-emerald-500' : 'bg-slate-600'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${
                    notificationSettings.alerts.overdueBills ? 'left-6' : 'left-0.5'
                  }`} />
                </button>
              </SettingRow>
              
              <SettingRow label="Sales Tax Deadlines" desc="Reminder before tax filing dates">
                <button
                  onClick={() => setNotificationSettings(s => ({ 
                    ...s, 
                    alerts: { ...s.alerts, salesTaxDeadlines: !s.alerts.salesTaxDeadlines } 
                  }))}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    notificationSettings.alerts.salesTaxDeadlines ? 'bg-emerald-500' : 'bg-slate-600'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${
                    notificationSettings.alerts.salesTaxDeadlines ? 'left-6' : 'left-0.5'
                  }`} />
                </button>
              </SettingRow>
              
              <SettingRow label="Goals Missed" desc="When weekly/monthly goals aren't met">
                <button
                  onClick={() => setNotificationSettings(s => ({ 
                    ...s, 
                    alerts: { ...s.alerts, goalsMissed: !s.alerts.goalsMissed } 
                  }))}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    notificationSettings.alerts.goalsMissed ? 'bg-emerald-500' : 'bg-slate-600'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${
                    notificationSettings.alerts.goalsMissed ? 'left-6' : 'left-0.5'
                  }`} />
                </button>
              </SettingRow>
              
              <div className="mt-4 p-3 bg-slate-800/50 rounded-lg">
                <button
                  onClick={() => {
                    if ('Notification' in window && Notification.permission === 'granted') {
                      new Notification('Test Notification', {
                        body: 'Push notifications are working correctly!',
                        icon: storeLogo || '/favicon.ico'
                      });
                    }
                  }}
                  className="text-sm text-violet-400 hover:text-violet-300 flex items-center gap-2"
                >
                  <Bell className="w-4 h-4" />
                  Send Test Notification
                </button>
              </div>
            </>
          )}
          
          <SettingRow label="Sales Tax Alert Days" desc="Days before due date to show alert">
            <NumberInput value={currentLocalSettings.alertSalesTaxDays || 7} onChange={(v) => updateSetting('alertSalesTaxDays', v)} min={1} max={30} suffix="days" />
          </SettingRow>
        </SettingSection>

        {/* Slack Alerts */}
        <SettingSection title="💬 Slack Alerts">
          <SettingRow label="Slack Webhook URL" desc="Get weekly summaries and threshold alerts in Slack">
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={currentLocalSettings.slackWebhookUrl || ''}
                onChange={(e) => updateSetting('slackWebhookUrl', e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 w-80 font-mono text-xs"
              />
              {currentLocalSettings.slackWebhookUrl && (
                <button onClick={async () => {
                  try {
                    const r = await fetch('/api/alerts/test-slack', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ webhookUrl: currentLocalSettings.slackWebhookUrl, storeName }),
                    });
                    const d = await r.json();
                    setToast({ message: d.success ? '✅ Test message sent to Slack!' : d.error, type: d.success ? 'success' : 'error' });
                  } catch (e) { setToast({ message: e.message, type: 'error' }); }
                }} className="px-3 py-2 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/50 rounded-lg text-sm text-emerald-300">
                  Test
                </button>
              )}
            </div>
          </SettingRow>
          <SettingRow label="Weekly Summary" desc="Send Monday 8am ET performance summary (even when all metrics are healthy)">
            <Toggle checked={currentLocalSettings.sendWeeklySummary !== false} onChange={(val) => updateSetting('sendWeeklySummary', val)} />
          </SettingRow>
          <div className="bg-slate-800/50 rounded-lg p-3 text-xs text-slate-400 space-y-1">
            <p><strong className="text-white">How to get a Slack webhook URL:</strong></p>
            <p>1. Go to <strong className="text-cyan-300">api.slack.com/apps</strong> → Create New App → From Scratch</p>
            <p>2. Pick a name (e.g. "Store Alerts") and your workspace</p>
            <p>3. Click <strong className="text-cyan-300">Incoming Webhooks</strong> → Activate → Add New Webhook to Workspace</p>
            <p>4. Pick the channel → Copy the webhook URL → Paste above</p>
          </div>
        </SettingSection>

        {/* Scheduled Reports */}
        <SettingSection title="📅 Scheduled Reports">
          <SettingRow label="Auto-Generate Reports" desc="Automatically generate reports every Monday at 8:15am ET">
            <Toggle checked={currentLocalSettings.scheduledReportsEnabled || false} onChange={(val) => updateSetting('scheduledReportsEnabled', val)} />
          </SettingRow>
          {currentLocalSettings.scheduledReportsEnabled && (
            <>
              <SettingRow label="Amazon PPC Report" desc="Generate weekly if data exists">
                <Toggle checked={currentLocalSettings.scheduleAmazon !== false} onChange={(val) => updateSetting('scheduleAmazon', val)} />
              </SettingRow>
              <SettingRow label="DTC Ads Report" desc="Generate weekly if data exists">
                <Toggle checked={currentLocalSettings.scheduleDtc !== false} onChange={(val) => updateSetting('scheduleDtc', val)} />
              </SettingRow>
              <SettingRow label="Notify Slack" desc="Post a summary when reports are generated">
                <Toggle checked={currentLocalSettings.scheduleNotifySlack !== false} onChange={(val) => updateSetting('scheduleNotifySlack', val)} />
              </SettingRow>
            </>
          )}
          <div className="bg-slate-800/50 rounded-lg p-3 text-xs text-slate-400">
            <p>Reports are generated server-side using your selected AI model. They appear in the <strong className="text-violet-300">Actions</strong> tab → Report History. Requires Slack webhook for notifications.</p>
            <p className="mt-1 text-slate-500">Estimated cost: ~$0.04-0.06 per report (Sonnet) · ~$0.15-0.25 (Opus)</p>
          </div>
        </SettingSection>

        {/* Google Sheets Export */}
        <SettingSection title="📊 Google Sheets Export">
          <SettingRow label="Spreadsheet ID" desc="The ID from your Google Sheet URL">
            <input
              type="text"
              value={currentLocalSettings.googleSheetId || ''}
              onChange={(e) => updateSetting('googleSheetId', e.target.value)}
              placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
              className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 w-80 font-mono text-xs"
            />
          </SettingRow>
          {currentLocalSettings.googleSheetId && (
            <SettingRow label="Push Data Now" desc="Write P&L, channels, and action items to your sheet">
              <button onClick={async () => {
                try {
                  setToast({ message: 'Pushing to Google Sheets...', type: 'info' });
                  const r = await fetch('/api/sheets/push', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      spreadsheetId: currentLocalSettings.googleSheetId,
                      weeklyData: allWeeksData,
                      actionItems,
                    }),
                  });
                  const d = await r.json();
                  if (d.success) {
                    setToast({ message: `✅ Pushed ${d.results.length} sheets! Opening...`, type: 'success' });
                    window.open(d.spreadsheetUrl, '_blank');
                  } else {
                    setToast({ message: d.error, type: 'error' });
                  }
                } catch (e) { setToast({ message: e.message, type: 'error' }); }
              }} className="px-4 py-2 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/50 rounded-lg text-sm text-emerald-300 flex items-center gap-2">
                <Globe className="w-4 h-4" /> Push to Sheets
              </button>
            </SettingRow>
          )}
          <div className="bg-slate-800/50 rounded-lg p-3 text-xs text-slate-400 space-y-1">
            <p><strong className="text-white">Setup:</strong></p>
            <p>1. Create a Google Sheet (or use an existing one)</p>
            <p>2. Share it with: <strong className="text-cyan-300">{process.env?.GOOGLE_SERVICE_ACCOUNT_EMAIL || 'your-service-account@project.iam.gserviceaccount.com'}</strong> (Editor access)</p>
            <p>3. Copy the spreadsheet ID from the URL: docs.google.com/spreadsheets/d/<strong className="text-white">THIS_PART</strong>/edit</p>
            <p>4. Paste it above and click Push</p>
            <p className="mt-1 text-slate-500">Creates 3 tabs: P&L, Channels, Actions. Each push overwrites previous data.</p>
          </div>
        </SettingSection>
          </>
        )}
        
        {/* ========== ACCOUNT TAB ========== */}
        {settingsTab === 'account' && (
          <>
        {/* Account */}
        {supabase && session && (
          <SettingSection title="👤 Account">
            <SettingRow label="Logged in as" desc={session.user?.email || 'Unknown'}>
              <span className="text-emerald-400 text-sm flex items-center gap-1"><Check className="w-4 h-4" />Connected</span>
            </SettingRow>
            <SettingRow label="Sign Out" desc="Log out of your account">
              <button onClick={handleLogout} className="px-4 py-2 bg-rose-600/30 hover:bg-rose-600/50 border border-rose-500/50 rounded-lg text-sm text-rose-300 flex items-center gap-2">
                Sign Out
              </button>
            </SettingRow>
          </SettingSection>
        )}
          </>
        )}
        
        {/* ========== DATA TAB ========== */}
        {settingsTab === 'data' && (
          <>
        {/* Security & Privacy */}
        <SettingSection title="🔒 Security & Privacy">
          <div className="space-y-4">
            <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4">
              <p className="text-emerald-400 font-semibold mb-2">✅ Your Data is Private</p>
              <p className="text-slate-300 text-sm">Each user account has completely separate data. Other users who sign up cannot see your data, and you cannot see theirs. This is enforced at the database level using Row Level Security (RLS).</p>
            </div>
            
            <div className="bg-slate-900/50 rounded-xl p-4">
              <p className="text-white font-medium mb-2">How Data Storage Works</p>
              <ul className="text-slate-400 text-sm space-y-2">
                <li className="flex items-start gap-2">
                  <Cloud className="w-4 h-4 mt-0.5 text-blue-400 flex-shrink-0" />
                  <span><strong className="text-white">Cloud Sync (Logged In):</strong> Data syncs to Supabase and is accessible from any device when you log in with the same account.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Database className="w-4 h-4 mt-0.5 text-amber-400 flex-shrink-0" />
                  <span><strong className="text-white">Local Backup:</strong> Data is also stored in your browser's localStorage as a backup in case of connectivity issues.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Download className="w-4 h-4 mt-0.5 text-emerald-400 flex-shrink-0" />
                  <span><strong className="text-white">Manual Backups:</strong> Downloaded to your browser's default download folder (usually ~/Downloads). You can change this in your browser settings.</span>
                </li>
              </ul>
            </div>
            
            {session && (
              <div className="bg-slate-900/50 rounded-xl p-4">
                <p className="text-white font-medium mb-2">Logged in as</p>
                <p className="text-slate-400 text-sm">{session.user?.email}</p>
              </div>
            )}
          </div>
        </SettingSection>
        
        {/* Data Management */}
        <SettingSection title="🗄️ Data Management">
          <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4 mb-4">
            <p className="text-amber-400 font-semibold mb-1">💡 Backup Before Updates</p>
            <p className="text-slate-300 text-sm">Always export a backup before pushing app updates. Your data is stored in the browser - a full backup ensures you can restore everything.</p>
          </div>
          <SettingRow label="Full Backup" desc="Downloads ALL data: weeks, periods, inventory, forecasts, invoices, settings">
            <button onClick={exportAll} className="px-4 py-2 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/50 rounded-lg text-sm text-emerald-300 flex items-center gap-2"><Download className="w-4 h-4" />Export Full Backup</button>
          </SettingRow>
          <SettingRow label="Restore from Backup" desc="Import a previously exported JSON file">
            <label className="px-4 py-2 bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/50 rounded-lg text-sm text-violet-300 flex items-center gap-2 cursor-pointer"><Upload className="w-4 h-4" />Import Backup<input type="file" accept=".json" onChange={(e) => e.target.files[0] && importData(e.target.files[0])} className="hidden" /></label>
          </SettingRow>
          
          {/* Bulk Import Section */}
          <div className="mt-4 pt-4 border-t border-slate-700">
            <h4 className="text-white font-medium mb-3 flex items-center gap-2"><Upload className="w-4 h-4 text-cyan-400" />Bulk Import Tools</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button 
                onClick={() => setShowAdsBulkUpload(true)}
                className="p-3 bg-violet-900/30 hover:bg-violet-900/50 border border-violet-500/30 rounded-xl text-left flex items-center gap-3"
              >
                <TrendingUp className="w-8 h-8 text-violet-400" />
                <div>
                  <p className="text-white font-medium">Ads Data Upload</p>
                  <p className="text-slate-400 text-xs">Import Meta & Google Ads CSV exports</p>
                </div>
              </button>
              <button 
                onClick={() => setShow3PLBulkUpload(true)}
                className="p-3 bg-blue-900/30 hover:bg-blue-900/50 border border-blue-500/30 rounded-xl text-left flex items-center gap-3"
              >
                <Truck className="w-8 h-8 text-blue-400" />
                <div>
                  <p className="text-white font-medium">3PL Bulk Upload</p>
                  <p className="text-slate-400 text-xs">Import Packiyo Excel files</p>
                </div>
              </button>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-slate-900/50 rounded-lg">
            <p className="text-slate-400 text-xs mb-2">Backup includes:</p>
            <div className="grid grid-cols-2 gap-1 text-xs">
              <span className="text-slate-500">• {Object.keys(allDaysData).length} days of daily data</span>
              <span className="text-slate-500">• {Object.keys(allWeeksData).length} weeks of sales data</span>
              <span className="text-slate-500">• {Object.keys(allPeriodsData).length} period reports</span>
              <span className="text-slate-500">• {Object.keys(invHistory).length} inventory snapshots</span>
              <span className="text-slate-500">• {Object.keys(savedCogs).length} COGS entries</span>
              <span className="text-slate-500">• {Object.keys(amazonForecasts).length} Amazon forecasts</span>
              <span className="text-slate-500">• {invoices.length} invoices/bills</span>
              <span className="text-slate-500">• All settings & goals</span>
            </div>
          </div>
          
          {/* Delete Individual Data */}
          <div className="mt-6 pt-6 border-t border-slate-700">
            <h4 className="text-white font-medium mb-3 flex items-center gap-2"><Trash2 className="w-4 h-4 text-rose-400" />Delete Individual Records</h4>
            <p className="text-slate-400 text-sm mb-4">Remove specific days, weeks or periods from your data.</p>
            
            {/* Daily Data */}
            {Object.keys(allDaysData).length > 0 && (() => {
              const allDays = Object.keys(allDaysData);
              const withSales = allDays.filter(d => hasDailySalesData(allDaysData[d])).length;
              const adsOnly = allDays.length - withSales;
              return (
              <div className="mb-4">
                <p className="text-slate-300 text-sm mb-2">Daily Data ({withSales} with sales, {adsOnly} ads-only)</p>
                <div className="flex flex-wrap gap-2">
                  {allDays.sort().reverse().slice(0, 14).map(dayKey => {
                    const hasRealData = hasDailySalesData(allDaysData[dayKey]);
                    return (
                    <div key={dayKey} className={`flex items-center gap-1 rounded-lg px-2 py-1 ${hasRealData ? 'bg-cyan-900/30 border border-cyan-500/30' : 'bg-amber-900/20 border border-amber-500/20'}`}>
                      <span className={`text-xs ${hasRealData ? 'text-cyan-300' : 'text-amber-400/70'}`}>{new Date(dayKey + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{!hasRealData && ' (ads)'}</span>
                      <button
                        onClick={() => {
                          if (confirm(`Delete ${dayKey}? This cannot be undone.`)) {
                            const updated = { ...allDaysData };
                            delete updated[dayKey];
                            setAllDaysData(updated);
                            lsSet('ecommerce_daily_sales_v1', JSON.stringify(updated));
                            queueCloudSave({ ...combinedData, dailySales: updated });
                            setToast({ message: 'Day deleted', type: 'success' });
                          }
                        }}
                        className="text-rose-400 hover:text-rose-300 p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );})}
                  {allDays.length > 14 && <span className="text-slate-500 text-xs self-center">+{allDays.length - 14} more</span>}
                </div>
              </div>
            );})()}
            
            {/* Weekly Data */}
            {Object.keys(allWeeksData).length > 0 && (
              <div className="mb-4">
                <p className="text-slate-300 text-sm mb-2">Weekly Data ({Object.keys(allWeeksData).length} weeks)</p>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(allWeeksData).sort().reverse().map(weekKey => (
                    <div key={weekKey} className="flex items-center gap-1 bg-slate-700/50 rounded-lg px-2 py-1">
                      <span className="text-slate-300 text-xs">{new Date(weekKey + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      <button
                        onClick={() => {
                          if (confirm(`Delete week ${weekKey}? This cannot be undone.`)) {
                            const updated = { ...allWeeksData };
                            delete updated[weekKey];
                            setAllWeeksData(updated);
                            save(updated);
                            setToast({ message: 'Week deleted', type: 'success' });
                          }
                        }}
                        className="text-rose-400 hover:text-rose-300 p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Period Data */}
            {Object.keys(allPeriodsData).length > 0 && (
              <div className="mb-4">
                <p className="text-slate-300 text-sm mb-2">Period Data ({Object.keys(allPeriodsData).length} periods)</p>
                
                {/* Empty periods warning and bulk delete */}
                {(() => {
                  const emptyPeriods = Object.keys(allPeriodsData).filter(k => {
                    const p = allPeriodsData[k];
                    return (p.total?.revenue || 0) === 0 || ((p.amazon?.skuData?.length || 0) + (p.shopify?.skuData?.length || 0)) === 0;
                  });
                  if (emptyPeriods.length > 0) {
                    return (
                      <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3 mb-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-amber-400 text-sm font-medium">⚠️ {emptyPeriods.length} Empty Period{emptyPeriods.length > 1 ? 's' : ''} Found</p>
                            <p className="text-slate-400 text-xs">{emptyPeriods.slice(0, 5).join(', ')}{emptyPeriods.length > 5 ? '...' : ''}</p>
                          </div>
                          <button
                            onClick={() => {
                              if (confirm(`Delete ${emptyPeriods.length} empty period(s)?\n\n${emptyPeriods.join(', ')}\n\nThis cannot be undone.`)) {
                                const updated = { ...allPeriodsData };
                                emptyPeriods.forEach(k => delete updated[k]);
                                setAllPeriodsData(updated);
                                savePeriods(updated);
                                setToast({ message: `Deleted ${emptyPeriods.length} empty periods`, type: 'success' });
                              }
                            }}
                            className="px-3 py-1.5 bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/50 rounded-lg text-amber-300 text-xs font-medium"
                          >
                            Delete All Empty
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
                
                <div className="flex flex-wrap gap-2">
                  {Object.keys(allPeriodsData).sort().map(periodKey => {
                    const p = allPeriodsData[periodKey];
                    const isEmpty = (p.total?.revenue || 0) === 0;
                    const skuCount = (p.amazon?.skuData?.length || 0) + (p.shopify?.skuData?.length || 0);
                    return (
                    <div key={periodKey} className={`flex items-center gap-1 rounded-lg px-2 py-1 ${isEmpty ? 'bg-rose-900/30 border border-rose-500/30' : 'bg-slate-700/50'}`}>
                      <span className={`text-xs ${isEmpty ? 'text-rose-400' : 'text-slate-300'}`}>
                        {p.label || periodKey}
                        {isEmpty && ' ⚠️'}
                        {!isEmpty && skuCount > 0 && <span className="text-slate-500 ml-1">({skuCount})</span>}
                      </span>
                      <button
                        onClick={() => {
                          if (confirm(`Delete period "${p.label || periodKey}"? This cannot be undone.`)) {
                            const updated = { ...allPeriodsData };
                            delete updated[periodKey];
                            setAllPeriodsData(updated);
                            savePeriods(updated);
                            setToast({ message: 'Period deleted', type: 'success' });
                          }
                        }}
                        className="text-rose-400 hover:text-rose-300 p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );})}
                </div>
              </div>
            )}
            
            {/* Inventory Data */}
            {Object.keys(invHistory).length > 0 && (
              <div className="mb-4">
                <p className="text-slate-300 text-sm mb-2">Inventory Snapshots ({Object.keys(invHistory).length})</p>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(invHistory).sort().reverse().slice(0, 10).map(invKey => (
                    <div key={invKey} className="flex items-center gap-1 bg-slate-700/50 rounded-lg px-2 py-1">
                      <span className="text-slate-300 text-xs">{invKey}</span>
                      <button
                        onClick={() => {
                          if (confirm(`Delete inventory snapshot ${invKey}? This cannot be undone.`)) {
                            const updated = { ...invHistory };
                            delete updated[invKey];
                            setInvHistory(updated);
                            saveInv(updated);
                            setToast({ message: 'Inventory snapshot deleted', type: 'success' });
                          }
                        }}
                        className="text-rose-400 hover:text-rose-300 p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {Object.keys(invHistory).length > 10 && <span className="text-slate-500 text-xs self-center">+{Object.keys(invHistory).length - 10} more</span>}
                </div>
              </div>
            )}
          </div>
          <SettingRow label="Reset Settings Only" desc="Restore settings to defaults (keeps all data)">
            {showResetConfirm ? (
              <div className="flex gap-2">
                <button onClick={resetToDefaults} className="px-3 py-2 bg-rose-600 hover:bg-rose-500 rounded-lg text-sm text-white">Confirm Reset</button>
                <button onClick={() => setShowResetConfirm(false)} className="px-3 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-sm text-white">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setShowResetConfirm(true)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white">Reset Settings</button>
            )}
          </SettingRow>
        </SettingSection>
          </>
        )}
        
        {/* ========== DANGER ZONE - ACCOUNT TAB ========== */}
        {settingsTab === 'account' && (
          <>
        {/* Danger Zone */}
        {session && (
          <SettingSection title="⚠️ Danger Zone">
            <div className="bg-rose-900/20 border border-rose-500/30 rounded-xl p-4">
              <p className="text-rose-400 font-semibold mb-2">Delete All My Data</p>
              <p className="text-slate-300 text-sm mb-4">This will permanently delete all your data from the cloud. This action cannot be undone. We recommend exporting a backup first.</p>
              <button 
                onClick={() => {
                  setConfirmDialog({
                    show: true,
                    title: '⚠️ Delete ALL Data?',
                    message: 'This will permanently delete ALL your data including weeks, periods, inventory, forecasts, invoices, and settings. This CANNOT be undone. Export a backup first!',
                    destructive: true,
                    confirmText: 'Delete Everything',
                    onConfirm: async () => {
                      try {
                        // Delete from Supabase
                        if (supabase && session?.user?.id) {
                          await supabase.from('app_data').delete().eq('user_id', session.user.id);
                        }
                        // Clear localStorage
                        localStorage.clear();
                        // Reset all state
                        setAllWeeksData({});
                        setAllPeriodsData({});
                        setInvHistory({});
                        setSavedCogs({});
                        setInvoices([]);
                        setAmazonForecasts({});
                        setWeekNotes({});
                        setGoals({ weeklyRevenue: 0, weeklyProfit: 0, monthlyRevenue: 0, monthlyProfit: 0 });
                        setStoreName('');
                        setStoreLogo(null);
                        setToast({ message: 'All data deleted successfully', type: 'success' });
                      } catch (err) {
                        setToast({ message: 'Error deleting data: ' + err.message, type: 'error' });
                      }
                    }
                  });
                }}
                className="px-4 py-2 bg-rose-600/30 hover:bg-rose-600/50 border border-rose-500/50 rounded-lg text-sm text-rose-300 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />Delete All My Data
              </button>
            </div>
          </SettingSection>
        )}
          </>
        )}
        
        {/* About */}
        <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6 text-center">
          <p className="text-slate-400 text-sm">E-Commerce Dashboard v5.0</p>
          <p className="text-slate-500 text-xs mt-1">Built for tracking Amazon & Shopify performance</p>
          <div className="flex justify-center gap-4 mt-4 text-xs text-slate-500">
            <span>{Object.keys(allWeeksData).length} weeks tracked</span>
            <span>•</span>
            <span>{Object.keys(allPeriodsData).length} periods saved</span>
            <span>•</span>
            <span>{Object.keys(savedCogs).filter(k => savedCogs[k]?.cost > 0).length} SKUs configured</span>
          </div>
          
          {/* Quick Actions */}
          <div className="flex justify-center gap-3 mt-4 pt-4 border-t border-slate-700/50">
            <button
              onClick={() => { setShowOnboarding(true); setOnboardingStep(0); }}
              className="text-xs text-slate-400 hover:text-violet-400 flex items-center gap-1 transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              Restart Setup Guide
            </button>
            <span className="text-slate-600">•</span>
            <button
              onClick={() => setShowPdfExport(true)}
              className="text-xs text-slate-400 hover:text-emerald-400 flex items-center gap-1 transition-colors"
            >
              <FileText className="w-3 h-3" />
              Export Report
            </button>
          </div>
          
          {/* Legal Links */}
          <div className="flex justify-center gap-4 mt-4 pt-4 border-t border-slate-700/50">
            <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-violet-400 transition-colors">
              Terms of Service
            </a>
            <span className="text-slate-600">•</span>
            <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-violet-400 transition-colors">
              Privacy Policy
            </a>
          </div>
        </div>
        
      </div>
    </div>
  );
};

export default SettingsView;
