import { devWarn, devError } from '../../utils/logger';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  AlertCircle, AlertTriangle, Bell, Boxes, Brain, Check, CheckCircle, ChevronLeft, ChevronRight, Clock, DollarSign, Download, Edit, Eye, EyeOff, Filter, Flag, HelpCircle, Info, List, Loader2, Package, Plus, RefreshCw, Save, Search, Settings, ShoppingCart, Target, Trash2, TrendingUp, Truck, Upload, X, Zap
} from 'lucide-react';
import { loadXLSX } from '../../utils/xlsx';
import { formatCurrency, formatPercent, formatNumber } from '../../utils/format';
import { hasDailySalesData } from '../../utils/date';
import NavTabs from '../ui/NavTabs';
import HealthBadge from '../ui/HealthBadge';
import MetricCard from '../ui/MetricCard';

const InventoryView = ({
  aiLoading,
  allDaysData,
  allPeriodsData,
  allWeeksData,
  appSettings,
  bankingData,
  current,
  deleteInv,
  editingProduction,
  extractingProduction,
  files,
  forecastCorrections,
  getAmazonForecastComparison,
  globalModals,
  invHistory,
  invShowZeroStock,
  invSortColumn,
  invSortDirection,
  leadTimeSettings,
  months,
  navDropdown,
  now,
  productionFile,
  productionFileName,
  productionForm,
  productionPipeline,
  selectedInvDate,
  setAiInput,
  setAiLoading,
  setAiMessages,
  setConfirmDialog,
  setEditingProduction,
  setExtractingProduction,
  setInvShowZeroStock,
  setInvSortColumn,
  setInvSortDirection,
  setLeadTimeSettings,
  setNavDropdown,
  setProductionFile,
  setProductionFileName,
  setProductionForm,
  setProductionPipeline,
  setSelectedDay,
  setSelectedInvDate,
  setSelectedPeriod,
  setSelectedWeek,
  setShipmentForm,
  setShowAIChat,
  setShowAddProduction,
  setShowAddShipment,
  setShowSkuSettings,
  setSkuSettingsEditForm,
  setSkuSettingsEditItem,
  setSkuSettingsSearch,
  setToast,
  setUploadTab,
  shipmentForm,
  showAddProduction,
  showAddShipment,
  showSkuSettings,
  skuSettingsEditForm,
  skuSettingsEditItem,
  skuSettingsSearch,
  total,
  upcomingAmazonForecasts,
  weekEnding,
  setView,
  view,
  callAI
}) => {
  const dates = Object.keys(invHistory).sort().reverse();
  const data = invHistory[selectedInvDate];
  const idx = dates.indexOf(selectedInvDate);
  
  // Column visibility - persisted to localStorage
  const ALL_COLUMNS = [
    { key: 'name', label: 'Product', align: 'left', alwaysVisible: true },
    { key: 'abcClass', label: 'ABC', align: 'center' },
    { key: 'amazonQty', label: 'Amazon', align: 'right' },
    { key: 'threeplQty', label: '3PL', align: 'right' },
    { key: 'awdQty', label: 'AWD', align: 'right' },
    { key: 'amazonInbound', label: 'Inbound', align: 'right' },
    { key: 'totalQty', label: 'Total', align: 'right' },
    { key: 'totalValue', label: 'Value', align: 'right' },
    { key: 'amzWeeklyVel', label: 'AMZ Vel', align: 'right' },
    { key: 'shopWeeklyVel', label: 'Shop Vel', align: 'right' },
    { key: 'weeklyVel', label: 'Tot Vel', align: 'right' },
    { key: 'daysOfSupply', label: 'Days', align: 'right' },
    { key: 'turnoverRate', label: 'Turn', align: 'right' },
    { key: 'stockoutDate', label: 'Stockout', align: 'right' },
    { key: 'reorderByDate', label: 'Order By', align: 'right' },
    { key: 'health', label: 'Status', align: 'center', alwaysVisible: true },
  ];
  const [hiddenColumns, setHiddenColumns] = useState(() => {
    try {
      const saved = localStorage.getItem('ecommerce_inv_hidden_cols');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const columnPickerRef = useRef(null);
  
  useEffect(() => {
    localStorage.setItem('ecommerce_inv_hidden_cols', JSON.stringify(hiddenColumns));
  }, [hiddenColumns]);
  
  // Close column picker on outside click
  useEffect(() => {
    const handler = (e) => { if (columnPickerRef.current && !columnPickerRef.current.contains(e.target)) setShowColumnPicker(false); };
    if (showColumnPicker) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showColumnPicker]);
  
  const visibleColumns = ALL_COLUMNS.filter(c => c.alwaysVisible || !hiddenColumns.includes(c.key));
  const toggleColumn = (key) => {
    setHiddenColumns(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };
  
  // Defensive defaults for summary
  const summary = data.summary || {
    totalUnits: 0, totalValue: 0, amazonUnits: 0, amazonValue: 0, 
    amazonInbound: 0, threeplUnits: 0, threeplValue: 0, threeplInbound: 0,
    critical: 0, low: 0, healthy: 0, overstock: 0, skuCount: 0
  };
  const rawItems = data.items || [];
  
  // Log raw data for debugging
  
  // FILTER AND DEDUPLICATE SKUs
  // Priority: SKUs with inventory > 0, prefer "Shop" suffix variants
  // Use case-insensitive deduplication based on base SKU
  const deduplicatedItems = (() => {
    const skuMap = new Map();
    
    rawItems.forEach(item => {
      if (!item.sku) return;
      
      // Normalize SKU - remove "Shop" suffix and lowercase for dedup key
      const baseSku = item.sku.replace(/Shop$/i, '');
      const dedupKey = baseSku.toLowerCase(); // Case-insensitive dedup
      const isShopVariant = item.sku.toLowerCase().endsWith('shop');
      const hasInventory = (item.totalQty || 0) > 0;
      
      // Check if we already have this base SKU
      const existing = skuMap.get(dedupKey);
      
      if (!existing) {
        // First time seeing this SKU
        skuMap.set(dedupKey, { ...item, _baseSku: baseSku, _isShopVariant: isShopVariant });
      } else {
        // We have a duplicate - decide which to keep
        const existingHasInventory = (existing.totalQty || 0) > 0;
        
        // Priority: 
        // 1. Has inventory beats no inventory
        // 2. Shop variant beats non-Shop if both have same inventory status
        // 3. Higher inventory wins if tied
        if (hasInventory && !existingHasInventory) {
          // New item has inventory, existing doesn't - replace
          skuMap.set(dedupKey, { ...item, _baseSku: baseSku, _isShopVariant: isShopVariant });
        } else if (hasInventory === existingHasInventory) {
          // Both have same inventory status
          if (isShopVariant && !existing._isShopVariant) {
            // Prefer Shop variant
            skuMap.set(dedupKey, { ...item, _baseSku: baseSku, _isShopVariant: isShopVariant });
          } else if ((item.totalQty || 0) > (existing.totalQty || 0)) {
            // Higher inventory wins
            skuMap.set(dedupKey, { ...item, _baseSku: baseSku, _isShopVariant: isShopVariant });
          }
        }
        // Otherwise keep existing
      }
    });
    
    return Array.from(skuMap.values());
  })();
  
  // RECALCULATE health, daysOfSupply, and dates dynamically based on current date
  // If data comes from a recent API sync (Packiyo), use that date to avoid double-subtracting sales
  const today = new Date();
  
  // Check if we have recent API sync data
  const lastPackiyoSync = data.sources?.lastPackiyoSync ? new Date(data.sources.lastPackiyoSync) : null;
  const lastAmazonSync = data.sources?.lastAmazonSync ? new Date(data.sources.lastAmazonSync) : null;
  
  // Use the most recent sync date (Packiyo or Amazon), falling back to snapshot date
  let effectiveDataDate = new Date(selectedInvDate + 'T12:00:00');
  if (lastPackiyoSync && lastPackiyoSync > effectiveDataDate) {
    effectiveDataDate = lastPackiyoSync;
  }
  if (lastAmazonSync && lastAmazonSync > effectiveDataDate) {
    effectiveDataDate = lastAmazonSync;
  }
  
  // Only apply days-elapsed adjustment if data is actually old
  // If synced today, daysElapsed = 0, quantities are already current
  const daysElapsed = Math.max(0, Math.floor((today - effectiveDataDate) / (1000 * 60 * 60 * 24)));
  
  
  const recalculatedItems = deduplicatedItems.map(item => {
    const weeklyVel = item.weeklyVel || 0;
    // Use correctedVel (from forecast learning) if available, matching processInventory's dos calculation
    const effectiveVel = item.correctedVel || weeklyVel;
    const dailyVel = effectiveVel / 7;
    
    // Only adjust quantities if data is old (daysElapsed > 0)
    // If API sync is fresh (today), use quantities as-is
    const adjustedTotalQty = daysElapsed > 0 
      ? Math.max(0, (item.totalQty || 0) - Math.round(dailyVel * daysElapsed))
      : (item.totalQty || 0);
    
    // Recalculate days of supply from TODAY
    const newDaysOfSupply = effectiveVel > 0 ? Math.round((adjustedTotalQty / effectiveVel) * 7) : 999;
    
    // Recalculate stockout and reorder dates from TODAY
    // Lead time priority: per-SKU → category → item stored → global default
    const recalcSkuCat = leadTimeSettings.skuCategories?.[item.sku] || leadTimeSettings.skuCategories?.[(item.sku || '').replace(/shop$/i, '').toUpperCase()] || '';
    const recalcCatLT = recalcSkuCat && leadTimeSettings.categoryLeadTimes?.[recalcSkuCat];
    const leadTimeDays = leadTimeSettings.skuSettings?.[item.sku]?.leadTime || recalcCatLT?.leadTimeDays || item.leadTimeDays || leadTimeSettings.defaultLeadTimeDays || 14;
    const reorderTriggerDays = recalcCatLT?.reorderTriggerDays || leadTimeSettings.reorderTriggerDays || 60;
    const uiMinOrderWeeks = recalcCatLT?.minOrderWeeks || leadTimeSettings.minOrderWeeks || 22;
    const uiOverstockThreshold = Math.max(90, (uiMinOrderWeeks * 7) + reorderTriggerDays + leadTimeDays);
    const uiLowThreshold = Math.max(30, leadTimeDays + 14);
    const uiCriticalThreshold = Math.max(14, leadTimeDays);
    
    let newStockoutDate = null;
    let newReorderByDate = null;
    let newDaysUntilMustOrder = null;
    
    if (effectiveVel > 0 && newDaysOfSupply < 999) {
      const stockout = new Date(today);
      stockout.setDate(stockout.getDate() + newDaysOfSupply);
      newStockoutDate = stockout.toISOString().split('T')[0];
      
      newDaysUntilMustOrder = newDaysOfSupply - reorderTriggerDays - leadTimeDays;
      const reorderBy = new Date(today);
      reorderBy.setDate(reorderBy.getDate() + newDaysUntilMustOrder);
      newReorderByDate = reorderBy.toISOString().split('T')[0];
    }
    
    // Recalculate health using dynamic thresholds based on reorder cycle
    let newHealth = 'unknown';
    if (effectiveVel > 0) {
      if (newDaysUntilMustOrder !== null && newDaysUntilMustOrder < 0) {
        newHealth = 'critical'; // Past reorder date!
      } else if (newDaysOfSupply < uiCriticalThreshold || (newDaysUntilMustOrder !== null && newDaysUntilMustOrder < 7)) {
        newHealth = 'critical';
      } else if (newDaysOfSupply < uiLowThreshold || (newDaysUntilMustOrder !== null && newDaysUntilMustOrder < 14)) {
        newHealth = 'low';
      } else if (newDaysOfSupply <= uiOverstockThreshold) {
        newHealth = 'healthy';
      } else {
        newHealth = 'overstock';
      }
    } else {
      // No velocity data - classify by stock presence
      if (adjustedTotalQty === 0) newHealth = 'critical';
      else newHealth = 'healthy'; // Has stock but no sales data
    }
    
    // ========= SUPPLY CHAIN KPIs (calculate at render time from raw data) =========
    const CARRYING_COST_RATE = 0.25;
    const ORDER_FIXED_COST = 150;
    const itemCost = item.cost || 0;
    const itemTotalValue = adjustedTotalQty * itemCost;
    const annualDemandUnits = (weeklyVel || 0) * 52;
    const annualDemandCost = annualDemandUnits * itemCost;
    
    // Inventory Turnover = Annual COGS sold / Current Inventory Value
    const turnoverRate = item.turnoverRate || (itemTotalValue > 0 
      ? Math.round((annualDemandCost / itemTotalValue) * 10) / 10 
      : 0);
    
    // Annual Carrying Cost = Inventory Value × 25%
    const annualCarryingCost = item.annualCarryingCost || Math.round(itemTotalValue * CARRYING_COST_RATE * 100) / 100;
    
    // EOQ = √(2 × D × S / H)
    const holdingCostPerUnit = itemCost * CARRYING_COST_RATE;
    const eoq = item.eoq || (holdingCostPerUnit > 0 && annualDemandUnits > 0
      ? Math.ceil(Math.sqrt((2 * annualDemandUnits * ORDER_FIXED_COST) / holdingCostPerUnit))
      : 0);
    
    // Sell-Through Rate = Units Sold / (Units Sold + Ending Inventory) over 30 days
    const monthlyUnitsSold = (weeklyVel || 0) * 4.3;
    const sellThroughRate = item.sellThroughRate || ((monthlyUnitsSold + adjustedTotalQty) > 0
      ? Math.round((monthlyUnitsSold / (monthlyUnitsSold + adjustedTotalQty)) * 1000) / 10
      : 0);
    
    // Weeks of Supply
    const weeksOfSupply = weeklyVel > 0 ? Math.round((adjustedTotalQty / weeklyVel) * 10) / 10 : 999;
    
    // Stock-to-Sales Ratio
    const stockToSalesRatio = monthlyUnitsSold > 0
      ? Math.round((adjustedTotalQty / monthlyUnitsSold) * 10) / 10
      : 999;
    
    // Stockout Risk Score (0-100)
    let stockoutRisk = item.stockoutRisk || 0;
    if (weeklyVel > 0 && !item.stockoutRisk) {
      const dosRatio = newDaysOfSupply / Math.max(leadTimeDays, 1);
      if (dosRatio < 0.5) stockoutRisk = 95;
      else if (dosRatio < 1.0) stockoutRisk = 80;
      else if (dosRatio < 1.5) stockoutRisk = 50;
      else if (dosRatio < 2.5) stockoutRisk = 25;
      else stockoutRisk = 5;
      const cvAdjustment = (item.cv || 0) * 15;
      stockoutRisk = Math.min(100, Math.round(stockoutRisk + cvAdjustment));
    }
    
    // Proportionally adjust Amazon and 3PL quantities based on overall reduction
    const originalTotal = item.totalQty || 0;
    const adjustmentRatio = originalTotal > 0 ? adjustedTotalQty / originalTotal : 1;
    const adjustedAmazonQty = Math.round((item.amazonQty || 0) * adjustmentRatio);
    const adjustedThreeplQty = Math.round((item.threeplQty || 0) * adjustmentRatio);
    
    return {
      ...item,
      // Replace quantities with adjusted values (estimated current stock)
      totalQty: adjustedTotalQty,
      amazonQty: adjustedAmazonQty,
      threeplQty: adjustedThreeplQty,
      daysOfSupply: newDaysOfSupply,
      stockoutDate: newStockoutDate,
      reorderByDate: newReorderByDate,
      daysUntilMustOrder: newDaysUntilMustOrder,
      health: newHealth,
      // Supply chain KPIs (calculated from raw data if missing from snapshot)
      turnoverRate,
      annualCarryingCost,
      eoq,
      sellThroughRate,
      weeksOfSupply,
      stockToSalesRatio,
      stockoutRisk,
      totalValue: itemTotalValue,
      // Keep original snapshot values for reference
      _snapshotTotalQty: originalTotal,
      _snapshotAmazonQty: item.amazonQty || 0,
      _snapshotThreeplQty: item.threeplQty || 0,
      _originalDaysOfSupply: item.daysOfSupply,
      _daysElapsed: daysElapsed,
    };
  });
  
  // ========= ABC CLASSIFICATION (needs all items sorted by revenue) =========
  const itemsWithRevenue = recalculatedItems.map(item => ({
    ...item,
    _annualRevenue: (item.weeklyVel || 0) * 52 * (item.cost || 0),
  }));
  const totalAnnualRevenue = itemsWithRevenue.reduce((s, i) => s + i._annualRevenue, 0);
  const sortedByRevenue = [...itemsWithRevenue].sort((a, b) => b._annualRevenue - a._annualRevenue);
  
  let cumulativeRevenue = 0;
  const abcLookup = {};
  sortedByRevenue.forEach(item => {
    cumulativeRevenue += item._annualRevenue;
    const pct = totalAnnualRevenue > 0 ? (cumulativeRevenue / totalAnnualRevenue) * 100 : 100;
    if (pct <= 80) abcLookup[item.sku] = 'A';
    else if (pct <= 95) abcLookup[item.sku] = 'B';
    else abcLookup[item.sku] = 'C';
  });
  
  // Apply ABC to recalculated items
  const recalculatedWithABC = recalculatedItems.map(item => ({
    ...item,
    abcClass: item.abcClass || abcLookup[item.sku] || 'C',
  }));
  
  // Filter items based on user preference (show only with inventory by default)
  const filteredItems = invShowZeroStock ? recalculatedWithABC : recalculatedWithABC.filter(item => (item.totalQty || 0) > 0);
  
  // Sort items based on selected column
  const items = [...filteredItems].sort((a, b) => {
    let aVal, bVal;
    switch (invSortColumn) {
      case 'name': aVal = a.name || a.sku; bVal = b.name || b.sku; break;
      case 'amazonQty': aVal = a.amazonQty || 0; bVal = b.amazonQty || 0; break;
      case 'threeplQty': aVal = a.threeplQty || 0; bVal = b.threeplQty || 0; break;
      case 'totalQty': aVal = a.totalQty || 0; bVal = b.totalQty || 0; break;
      case 'totalValue': aVal = a.totalValue || 0; bVal = b.totalValue || 0; break;
      case 'amzWeeklyVel': aVal = a.amzWeeklyVel || 0; bVal = b.amzWeeklyVel || 0; break;
      case 'shopWeeklyVel': aVal = a.shopWeeklyVel || 0; bVal = b.shopWeeklyVel || 0; break;
      case 'weeklyVel': aVal = a.weeklyVel || 0; bVal = b.weeklyVel || 0; break;
      case 'daysOfSupply': aVal = a.daysOfSupply || 999; bVal = b.daysOfSupply || 999; break;
      case 'stockoutDate': aVal = a.stockoutDate || '9999'; bVal = b.stockoutDate || '9999'; break;
      case 'reorderByDate': aVal = a.reorderByDate || '9999'; bVal = b.reorderByDate || '9999'; break;
      case 'health': 
        const healthOrder = { critical: 0, low: 1, healthy: 2, overstock: 3, unknown: 4 };
        aVal = healthOrder[a.health] ?? 4; bVal = healthOrder[b.health] ?? 4; break;
      default: aVal = a.totalValue || 0; bVal = b.totalValue || 0;
    }
    if (typeof aVal === 'string') {
      return invSortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return invSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
  });
  
  // Export inventory to Excel
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [editingCategoryName, setEditingCategoryName] = useState(null);
  const [categoryForm, setCategoryForm] = useState({ name: '', leadTimeDays: 14, reorderTriggerDays: 60, minOrderWeeks: 22 });
  const [showAddCategory, setShowAddCategory] = useState(false);
  
  // Auto-categorize SKUs by product name keywords
  const autoCategorizeSkus = () => {
    const categories = Object.keys(leadTimeSettings.categoryLeadTimes || {});
    if (categories.length === 0) return;
    
    const allItems = data?.items || [];
    const updates = {};
    let assigned = 0;
    
    allItems.forEach(item => {
      const sku = item.sku;
      // Skip if already assigned
      if (leadTimeSettings.skuCategories?.[sku]) return;
      
      const name = (item.name || sku).toLowerCase();
      for (const cat of categories) {
        const catLower = cat.toLowerCase();
        // Match category name or common keywords in product name
        const keywords = catLower.split(/[\s&]+/).filter(w => w.length > 2);
        const matches = keywords.some(kw => name.includes(kw));
        if (matches) {
          updates[sku] = cat;
          assigned++;
          break;
        }
      }
    });
    
    if (assigned > 0) {
      setLeadTimeSettings(prev => ({
        ...prev,
        skuCategories: { ...prev.skuCategories, ...updates }
      }));
      setToast({ message: `Auto-assigned ${assigned} SKUs to categories`, type: 'success' });
    } else {
      setToast({ message: 'No unassigned SKUs matched any category names', type: 'info' });
    }
  };
  const exportInventoryExcel = async () => {
    if (exportingXlsx || items.length === 0) return;
    setExportingXlsx(true);
    try {
      const XLSX = await loadXLSX();
      const rows = items.map(item => ({
        'Product': item.name || item.sku,
        'SKU': item.sku,
        'ABC': item.abcClass || '',
        'Amazon': item.amazonQty || 0,
        '3PL': item.threeplQty || 0,
        'AWD': item.awdQty || 0,
        'Inbound': (item.amazonInbound || 0) + (item.awdInbound || 0) + (item.threeplInbound || 0),
        'Total Units': item.totalQty || 0,
        'Value': Math.round((item.totalValue || 0) * 100) / 100,
        'AMZ Velocity': Math.round((item.amzWeeklyVel || 0) * 10) / 10,
        'Shop Velocity': Math.round((item.shopWeeklyVel || 0) * 10) / 10,
        'Total Velocity': Math.round((item.weeklyVel || 0) * 10) / 10,
        'Days of Supply': item.daysOfSupply || 0,
        'Turnover': Math.round((item.turnoverRate || 0) * 10) / 10,
        'Stockout Date': item.stockoutDate || '',
        'Order By': item.reorderByDate || '',
        'Status': item.health || '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      // Set column widths
      ws['!cols'] = [
        { wch: 35 }, { wch: 20 }, { wch: 5 }, { wch: 10 }, { wch: 10 },
        { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
        { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 14 },
        { wch: 14 }, { wch: 12 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
      XLSX.writeFile(wb, `inventory_${selectedInvDate || new Date().toISOString().split('T')[0]}.xlsx`);
      if (setToast) setToast({ message: `Exported ${rows.length} products to Excel`, type: 'success' });
    } catch (err) {
      console.error('Excel export failed:', err);
      if (setToast) setToast({ message: 'Excel export failed: ' + err.message, type: 'error' });
    } finally {
      setExportingXlsx(false);
    }
  };

  // Recalculate summary based on filtered items
  // Use item-level calculations, but fall back to snapshot summary for 3PL if items don't have data
  const itemThreeplUnits = items.reduce((s, i) => s + (i.threeplQty || 0), 0);
  const itemThreeplValue = items.reduce((s, i) => s + ((i.threeplValue ?? ((i.threeplQty || 0) * (i.cost || 0))) || 0), 0);
  const itemAmazonUnits = items.reduce((s, i) => s + (i.amazonQty || 0), 0);
  const itemAmazonValue = items.reduce((s, i) => s + ((i.amazonValue ?? ((i.amazonQty || 0) * (i.cost || 0))) || 0), 0);
  
  const itemAwdUnits = items.reduce((s, i) => s + (i.awdQty || 0), 0);
  const itemAwdValue = items.reduce((s, i) => s + ((i.awdQty || 0) * (i.cost || 0)), 0);
  const itemInboundUnits = items.reduce((s, i) => s + (i.amazonInbound || 0) + (i.awdInbound || 0) + (i.threeplInbound || 0), 0);
  
  // Use item totals if available, otherwise fall back to snapshot summary
  const finalThreeplUnits = itemThreeplUnits > 0 ? itemThreeplUnits : (summary.threeplUnits || 0);
  const finalThreeplValue = itemThreeplValue > 0 ? itemThreeplValue : (summary.threeplValue || 0);
  const finalAmazonUnits = itemAmazonUnits > 0 ? itemAmazonUnits : (summary.amazonUnits || 0);
  const finalAmazonValue = itemAmazonValue > 0 ? itemAmazonValue : (summary.amazonValue || 0);
  const finalAwdUnits = itemAwdUnits > 0 ? itemAwdUnits : (summary.awdUnits || 0);
  const finalAwdValue = itemAwdValue > 0 ? itemAwdValue : (summary.awdValue || 0);
  const finalInboundUnits = itemInboundUnits > 0 ? itemInboundUnits : (summary.amazonInbound || 0);
  
  const filteredSummary = {
    ...summary,
    totalUnits: finalAmazonUnits + finalThreeplUnits + (summary.homeUnits || 0) + finalAwdUnits + finalInboundUnits,
    totalValue: finalAmazonValue + finalThreeplValue + (summary.homeValue || 0) + finalAwdValue,
    amazonUnits: finalAmazonUnits,
    amazonValue: finalAmazonValue,
    threeplUnits: finalThreeplUnits,
    threeplValue: finalThreeplValue,
    awdUnits: finalAwdUnits,
    awdValue: finalAwdValue,
    inboundUnits: finalInboundUnits,
    skuCount: items.length,
    critical: items.filter(i => i.health === 'critical').length,
    low: items.filter(i => i.health === 'low').length,
    healthy: items.filter(i => i.health === 'healthy').length,
    overstock: items.filter(i => i.health === 'overstock').length,
    // Recalculated supply chain KPIs from filtered items
    avgTurnover: (() => {
      const withTurnover = items.filter(i => i.turnoverRate > 0);
      return withTurnover.length > 0 ? Math.round(withTurnover.reduce((s, i) => s + i.turnoverRate, 0) / withTurnover.length * 10) / 10 : summary.avgTurnover || 0;
    })(),
    totalCarryingCost: Math.round(items.reduce((s, i) => s + (i.annualCarryingCost || 0), 0)) || summary.totalCarryingCost || 0,
    avgSellThrough: (() => {
      const withST = items.filter(i => i.sellThroughRate > 0);
      return withST.length > 0 ? Math.round(withST.reduce((s, i) => s + i.sellThroughRate, 0) / withST.length * 10) / 10 : summary.avgSellThrough || 0;
    })(),
    inStockRate: (() => {
      const withVel = items.filter(i => i.weeklyVel > 0);
      return withVel.length > 0 ? Math.round(withVel.filter(i => i.totalQty > 0).length / withVel.length * 1000) / 10 : summary.inStockRate || 100;
    })(),
    abcCounts: items.reduce((acc, i) => { if (i.abcClass) acc[i.abcClass] = (acc[i.abcClass] || 0) + 1; return acc; }, {}) || summary.abcCounts || {},
  };
  
  // Dynamic thresholds for display in tooltips and labels
  const displayThresholds = (() => {
    const lt = leadTimeSettings.defaultLeadTimeDays || 14;
    const mow = leadTimeSettings.minOrderWeeks || 22;
    return {
      critical: Math.max(14, lt),
      low: Math.max(30, lt + 14),
      overstock: Math.max(90, (mow * 7) + lt),
    };
  })();
  
  // Get SKU settings helper
  const getSkuSettings = (sku) => leadTimeSettings.skuSettings?.[sku] || {};
  
  // Check for custom low stock alerts
  const customAlerts = items.filter(item => {
    const settings = getSkuSettings(item.sku);
    if (!settings.alertEnabled) return false;
    
    // Check 3PL quantity threshold
    if (settings.threeplAlertQty && (item.threeplQty || 0) <= settings.threeplAlertQty) {
      return true;
    }
    // Check Amazon days of supply threshold  
    if (settings.amazonAlertDays) {
      const amzDays = item.amzWeeklyVel > 0 ? (item.amazonQty || 0) / (item.amzWeeklyVel / 7) : 999;
      if (amzDays <= settings.amazonAlertDays) return true;
    }
    // Check total reorder point
    if (settings.reorderPoint && (item.totalQty || 0) <= settings.reorderPoint) {
      return true;
    }
    return false;
  });
  
  // SKU Settings Modal - rendered inline to prevent focus loss on re-render
  const skuSettingsFilteredSkus = items.filter(item => 
    item.sku.toLowerCase().includes(skuSettingsSearch.toLowerCase()) ||
    item.name.toLowerCase().includes(skuSettingsSearch.toLowerCase())
  );
  
  const saveSkuSettingsHandler = (sku, settings) => {
    setLeadTimeSettings(prev => ({
      ...prev,
      skuSettings: {
        ...prev.skuSettings,
        [sku]: { ...prev.skuSettings?.[sku], ...settings }
      }
    }));
    setSkuSettingsEditItem(null);
    setSkuSettingsEditForm({});
    setToast({ message: `Settings saved for ${sku}`, type: 'success' });
  };
  
  const SkuSettingsModalJSX = showSkuSettings ? (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-white text-xl font-bold">⚙️ SKU Inventory Settings</h2>
            <p className="text-white/70 text-sm">Configure lead times, reorder points, and alerts per SKU</p>
          </div>
          <button onClick={() => { setShowSkuSettings(false); setSkuSettingsEditItem(null); setSkuSettingsEditForm({}); setSkuSettingsSearch(''); }} className="p-2 hover:bg-white/20 rounded-lg text-white">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        {/* Global Defaults */}
        <div className="p-4 bg-slate-800/50 border-b border-slate-700">
          <h3 className="text-white font-semibold mb-3">🌐 Global Defaults</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <label className="text-slate-400 text-xs block mb-1">Default Lead Time</label>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  value={leadTimeSettings.defaultLeadTimeDays} 
                  onChange={(e) => setLeadTimeSettings(prev => ({ ...prev, defaultLeadTimeDays: parseInt(e.target.value) || 14 }))}
                  className="w-20 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                />
                <span className="text-slate-500 text-xs">days</span>
              </div>
            </div>
            <div>
              <label className="text-slate-400 text-xs block mb-1">Reorder Trigger</label>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  value={leadTimeSettings.reorderTriggerDays} 
                  onChange={(e) => setLeadTimeSettings(prev => ({ ...prev, reorderTriggerDays: parseInt(e.target.value) || 60 }))}
                  className="w-20 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                />
                <span className="text-slate-500 text-xs">days</span>
              </div>
            </div>
            <div>
              <label className="text-slate-400 text-xs block mb-1">Amazon Min Supply</label>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  value={leadTimeSettings.channelRules?.amazon?.minDaysOfSupply || 60} 
                  onChange={(e) => setLeadTimeSettings(prev => ({ ...prev, channelRules: { ...prev.channelRules, amazon: { ...prev.channelRules?.amazon, minDaysOfSupply: parseInt(e.target.value) || 60 }}}))}
                  className="w-20 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                />
                <span className="text-slate-500 text-xs">days</span>
              </div>
            </div>
            <div>
              <label className="text-slate-400 text-xs block mb-1">3PL Default Alert</label>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  value={leadTimeSettings.channelRules?.threepl?.defaultQtyThreshold || 50} 
                  onChange={(e) => setLeadTimeSettings(prev => ({ ...prev, channelRules: { ...prev.channelRules, threepl: { ...prev.channelRules?.threepl, defaultQtyThreshold: parseInt(e.target.value) || 50 }}}))}
                  className="w-20 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                />
                <span className="text-slate-500 text-xs">units</span>
              </div>
            </div>
            <div>
              <label className="text-slate-400 text-xs block mb-1">Reorder Buffer</label>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  value={leadTimeSettings.reorderBuffer || 7} 
                  onChange={(e) => setLeadTimeSettings(prev => ({ ...prev, reorderBuffer: parseInt(e.target.value) || 7 }))}
                  className="w-20 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                />
                <span className="text-slate-500 text-xs">days</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Category Lead Times */}
        <div className="p-4 bg-slate-800/30 border-b border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold">📦 Category Lead Times</h3>
            <div className="flex gap-2">
              <button onClick={autoCategorizeSkus} className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-white text-xs flex items-center gap-1" title="Auto-assign SKUs to categories based on product name keywords">
                <Zap className="w-3 h-3" />Auto-Assign
              </button>
              <button onClick={() => { setShowAddCategory(true); setCategoryForm({ name: '', leadTimeDays: leadTimeSettings.defaultLeadTimeDays || 14, reorderTriggerDays: leadTimeSettings.reorderTriggerDays || 60, minOrderWeeks: leadTimeSettings.minOrderWeeks || 22 }); }} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white text-xs flex items-center gap-1">
                <Plus className="w-3 h-3" />Add Category
              </button>
            </div>
          </div>
          <p className="text-slate-500 text-xs mb-3">Set lead times per product category (e.g. lip balm, deodorant, soap). Assign SKUs to categories below. Per-SKU settings override category settings.</p>
          
          {/* Add category form */}
          {showAddCategory && (
            <div className="bg-slate-700/50 rounded-lg p-3 mb-3 flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-slate-400 text-xs block mb-1">Category Name</label>
                <input type="text" value={categoryForm.name} onChange={(e) => setCategoryForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Lip Balm" className="w-40 bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-white text-sm" autoFocus />
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1">Lead Time</label>
                <div className="flex items-center gap-1"><input type="number" value={categoryForm.leadTimeDays} onChange={(e) => setCategoryForm(f => ({ ...f, leadTimeDays: parseInt(e.target.value) || 14 }))} className="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm text-center" /><span className="text-slate-500 text-xs">days</span></div>
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1">Reorder Trigger</label>
                <div className="flex items-center gap-1"><input type="number" value={categoryForm.reorderTriggerDays} onChange={(e) => setCategoryForm(f => ({ ...f, reorderTriggerDays: parseInt(e.target.value) || 60 }))} className="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm text-center" /><span className="text-slate-500 text-xs">days</span></div>
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1">Min Order</label>
                <div className="flex items-center gap-1"><input type="number" value={categoryForm.minOrderWeeks} onChange={(e) => setCategoryForm(f => ({ ...f, minOrderWeeks: parseInt(e.target.value) || 22 }))} className="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm text-center" /><span className="text-slate-500 text-xs">wks</span></div>
              </div>
              <button onClick={() => {
                if (!categoryForm.name.trim()) return;
                setLeadTimeSettings(prev => ({
                  ...prev,
                  categoryLeadTimes: {
                    ...prev.categoryLeadTimes,
                    [categoryForm.name.trim()]: {
                      leadTimeDays: categoryForm.leadTimeDays,
                      reorderTriggerDays: categoryForm.reorderTriggerDays,
                      minOrderWeeks: categoryForm.minOrderWeeks,
                    }
                  }
                }));
                setShowAddCategory(false);
                setCategoryForm({ name: '', leadTimeDays: 14, reorderTriggerDays: 60, minOrderWeeks: 22 });
                setToast({ message: `Category "${categoryForm.name.trim()}" added`, type: 'success' });
              }} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-white text-xs">Save</button>
              <button onClick={() => setShowAddCategory(false)} className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 rounded text-white text-xs">Cancel</button>
            </div>
          )}
          
          {/* Category list */}
          {Object.keys(leadTimeSettings.categoryLeadTimes || {}).length > 0 ? (
            <div className="grid gap-2">
              {Object.entries(leadTimeSettings.categoryLeadTimes).map(([catName, catSettings]) => {
                const skuCount = Object.values(leadTimeSettings.skuCategories || {}).filter(c => c === catName).length;
                const isEditing = editingCategoryName === catName;
                
                if (isEditing) {
                  return (
                    <div key={catName} className="bg-emerald-900/20 border border-emerald-700/50 rounded-lg p-3 flex flex-wrap gap-3 items-end">
                      <div>
                        <label className="text-slate-400 text-xs block mb-1">Category</label>
                        <input type="text" value={categoryForm.name} onChange={(e) => setCategoryForm(f => ({ ...f, name: e.target.value }))} className="w-36 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm" />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs block mb-1">Lead Time</label>
                        <div className="flex items-center gap-1"><input type="number" value={categoryForm.leadTimeDays} onChange={(e) => setCategoryForm(f => ({ ...f, leadTimeDays: parseInt(e.target.value) || 14 }))} className="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm text-center" /><span className="text-slate-500 text-xs">d</span></div>
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs block mb-1">Reorder</label>
                        <div className="flex items-center gap-1"><input type="number" value={categoryForm.reorderTriggerDays} onChange={(e) => setCategoryForm(f => ({ ...f, reorderTriggerDays: parseInt(e.target.value) || 60 }))} className="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm text-center" /><span className="text-slate-500 text-xs">d</span></div>
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs block mb-1">Min Order</label>
                        <div className="flex items-center gap-1"><input type="number" value={categoryForm.minOrderWeeks} onChange={(e) => setCategoryForm(f => ({ ...f, minOrderWeeks: parseInt(e.target.value) || 22 }))} className="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm text-center" /><span className="text-slate-500 text-xs">w</span></div>
                      </div>
                      <button onClick={() => {
                        const newName = categoryForm.name.trim() || catName;
                        setLeadTimeSettings(prev => {
                          const updated = { ...prev };
                          // If renamed, update the key and all SKU mappings
                          const newCatLT = { ...prev.categoryLeadTimes };
                          if (newName !== catName) delete newCatLT[catName];
                          newCatLT[newName] = { leadTimeDays: categoryForm.leadTimeDays, reorderTriggerDays: categoryForm.reorderTriggerDays, minOrderWeeks: categoryForm.minOrderWeeks };
                          updated.categoryLeadTimes = newCatLT;
                          if (newName !== catName) {
                            const newCats = { ...prev.skuCategories };
                            Object.keys(newCats).forEach(sku => { if (newCats[sku] === catName) newCats[sku] = newName; });
                            updated.skuCategories = newCats;
                          }
                          return updated;
                        });
                        setEditingCategoryName(null);
                      }} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-white text-xs">Save</button>
                      <button onClick={() => setEditingCategoryName(null)} className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 rounded text-white text-xs">Cancel</button>
                    </div>
                  );
                }
                
                return (
                  <div key={catName} className="bg-slate-700/30 rounded-lg px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-white font-medium text-sm min-w-[120px]">{catName}</span>
                      <span className="text-emerald-400 text-xs">{catSettings.leadTimeDays}d lead</span>
                      <span className="text-amber-400 text-xs">{catSettings.reorderTriggerDays}d trigger</span>
                      <span className="text-cyan-400 text-xs">{catSettings.minOrderWeeks}w min order</span>
                      <span className="text-slate-500 text-xs">{skuCount} SKU{skuCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setEditingCategoryName(catName); setCategoryForm({ name: catName, leadTimeDays: catSettings.leadTimeDays, reorderTriggerDays: catSettings.reorderTriggerDays, minOrderWeeks: catSettings.minOrderWeeks }); }} className="px-2 py-1 bg-slate-600 hover:bg-slate-500 rounded text-slate-300 text-xs">Edit</button>
                      <button onClick={() => {
                        if (!confirm(`Delete category "${catName}"? SKUs assigned to it will become uncategorized.`)) return;
                        setLeadTimeSettings(prev => {
                          const newCatLT = { ...prev.categoryLeadTimes };
                          delete newCatLT[catName];
                          const newCats = { ...prev.skuCategories };
                          Object.keys(newCats).forEach(sku => { if (newCats[sku] === catName) delete newCats[sku]; });
                          return { ...prev, categoryLeadTimes: newCatLT, skuCategories: newCats };
                        });
                      }} className="px-2 py-1 bg-rose-900/50 hover:bg-rose-800/50 rounded text-rose-400 text-xs">×</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-slate-500 text-sm text-center py-3 bg-slate-800/30 rounded-lg">No categories defined. Add categories like "Lip Balm", "Deodorant", "Tallow Balm" to set lead times by product type.</div>
          )}
        </div>
        
        {/* Search and Filter */}
        <div className="p-4 border-b border-slate-700 flex gap-4 items-center">
          <input 
            type="text"
            placeholder="🔍 Search SKUs..."
            value={skuSettingsSearch}
            onChange={(e) => setSkuSettingsSearch(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white"
          />
          <label className="flex items-center gap-2 text-sm text-slate-400 whitespace-nowrap">
            <input 
              type="checkbox" 
              checked={invShowZeroStock} 
              onChange={(e) => setInvShowZeroStock(e.target.checked)}
              className="rounded bg-slate-700 border-slate-600"
            />
            Show zero stock
          </label>
        </div>
        
        {/* SKU List */}
        <div className="flex-1 overflow-y-auto p-4">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-900 z-10">
              <tr className="border-b border-slate-700">
                <th className="text-left text-slate-400 py-2 px-2" style={{width: '200px'}}>SKU / Product</th>
                <th className="text-center text-slate-400 py-2 px-2" style={{width: '120px'}}>Category</th>
                <th className="text-right text-slate-400 py-2 px-2" style={{width: '80px'}}>Amazon</th>
                <th className="text-right text-slate-400 py-2 px-2" style={{width: '80px'}}>3PL</th>
                <th className="text-center text-slate-400 py-2 px-2" style={{width: '100px'}}>Lead Time</th>
                <th className="text-center text-slate-400 py-2 px-2" style={{width: '100px'}}>Reorder Qty</th>
                <th className="text-center text-slate-400 py-2 px-2" style={{width: '100px'}}>3PL Alert Qty</th>
                <th className="text-center text-slate-400 py-2 px-2" style={{width: '100px'}}>AMZ Alert Days</th>
                <th className="text-center text-slate-400 py-2 px-2" style={{width: '100px'}}>Target Days</th>
                <th className="text-center text-slate-400 py-2 px-2" style={{width: '120px'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {skuSettingsFilteredSkus.map(item => {
                const settings = getSkuSettings(item.sku);
                const isEditing = skuSettingsEditItem === item.sku;
                
                if (isEditing) {

                    return (
                    <tr key={item.sku} className="border-b border-slate-700/50 bg-emerald-900/20">
                      <td className="py-3 px-2">
                        <p className="text-white font-medium">{item.sku}</p>
                        <p className="text-slate-500 text-xs truncate max-w-[180px]">{item.name}</p>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <select
                          value={leadTimeSettings.skuCategories?.[item.sku] || ''}
                          onChange={(e) => setLeadTimeSettings(prev => ({
                            ...prev,
                            skuCategories: { ...prev.skuCategories, [item.sku]: e.target.value || undefined }
                          }))}
                          className="w-full bg-slate-700 border border-slate-600 rounded px-1 py-1.5 text-white text-xs"
                        >
                          <option value="">—</option>
                          {Object.keys(leadTimeSettings.categoryLeadTimes || {}).map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </td>
                      <td className="text-right py-3 px-2 text-orange-400 font-medium">{formatNumber(item.amazonQty || 0)}</td>
                      <td className="text-right py-3 px-2 text-violet-400 font-medium">{formatNumber(item.threeplQty || 0)}</td>
                      <td className="py-3 px-2 text-center">
                        <input 
                          type="number" 
                          value={skuSettingsEditForm.leadTime || ''} 
                          onChange={(e) => setSkuSettingsEditForm(f => ({...f, leadTime: e.target.value}))} 
                          placeholder={String(leadTimeSettings.defaultLeadTimeDays)} 
                          className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-center text-sm" 
                        />
                      </td>
                      <td className="py-3 px-2 text-center">
                        <input 
                          type="number" 
                          value={skuSettingsEditForm.reorderPoint || ''} 
                          onChange={(e) => setSkuSettingsEditForm(f => ({...f, reorderPoint: e.target.value}))} 
                          placeholder="—" 
                          className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-center text-sm" 
                        />
                      </td>
                      <td className="py-3 px-2 text-center">
                        <input 
                          type="number" 
                          value={skuSettingsEditForm.threeplAlertQty || ''} 
                          onChange={(e) => setSkuSettingsEditForm(f => ({...f, threeplAlertQty: e.target.value}))} 
                          placeholder="50" 
                          className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-center text-sm" 
                        />
                      </td>
                      <td className="py-3 px-2 text-center">
                        <input 
                          type="number" 
                          value={skuSettingsEditForm.amazonAlertDays || ''} 
                          onChange={(e) => setSkuSettingsEditForm(f => ({...f, amazonAlertDays: e.target.value}))} 
                          placeholder="60" 
                          className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-center text-sm" 
                        />
                      </td>
                      <td className="py-3 px-2 text-center">
                        <input 
                          type="number" 
                          value={skuSettingsEditForm.targetDays || ''} 
                          onChange={(e) => setSkuSettingsEditForm(f => ({...f, targetDays: e.target.value}))} 
                          placeholder="90" 
                          className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-center text-sm" 
                        />
                      </td>
                      <td className="py-3 px-2 text-center whitespace-nowrap">
                        <button onClick={() => saveSkuSettingsHandler(item.sku, { 
                          leadTime: skuSettingsEditForm.leadTime ? parseInt(skuSettingsEditForm.leadTime) : undefined,
                          reorderPoint: skuSettingsEditForm.reorderPoint ? parseInt(skuSettingsEditForm.reorderPoint) : undefined,
                          threeplAlertQty: skuSettingsEditForm.threeplAlertQty ? parseInt(skuSettingsEditForm.threeplAlertQty) : undefined,
                          amazonAlertDays: skuSettingsEditForm.amazonAlertDays ? parseInt(skuSettingsEditForm.amazonAlertDays) : undefined,
                          targetDays: skuSettingsEditForm.targetDays ? parseInt(skuSettingsEditForm.targetDays) : undefined,
                          alertEnabled: true,
                        })} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-white text-xs mr-2">Save</button>
                        <button onClick={() => { setSkuSettingsEditItem(null); setSkuSettingsEditForm({}); }} className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 rounded text-white text-xs">Cancel</button>
                      </td>
                    </tr>
                  );
                }
                
                const hasCustomSettings = settings.leadTime || settings.reorderPoint || settings.threeplAlertQty || settings.amazonAlertDays || settings.targetDays;
                
                return (
                  <tr key={item.sku} className={`border-b border-slate-700/50 hover:bg-slate-800/30 ${hasCustomSettings ? 'bg-emerald-900/10' : ''}`}>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        {hasCustomSettings && <span className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0" title="Custom settings" />}
                        <div>
                          <p className="text-white font-medium">{item.sku}</p>
                          <p className="text-slate-500 text-xs truncate max-w-[160px]">{item.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <select
                        value={leadTimeSettings.skuCategories?.[item.sku] || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setLeadTimeSettings(prev => {
                            const newCats = { ...prev.skuCategories };
                            if (val) newCats[item.sku] = val; else delete newCats[item.sku];
                            return { ...prev, skuCategories: newCats };
                          });
                        }}
                        className="w-full bg-slate-800 border border-slate-700 rounded px-1 py-1 text-xs text-slate-300 cursor-pointer"
                      >
                        <option value="">—</option>
                        {Object.keys(leadTimeSettings.categoryLeadTimes || {}).map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </td>
                    <td className="text-right py-2 px-2 text-orange-400">{formatNumber(item.amazonQty || 0)}</td>
                    <td className="text-right py-2 px-2 text-violet-400">{formatNumber(item.threeplQty || 0)}</td>
                    <td className="text-center py-2 px-2">{settings.leadTime ? <span className="text-emerald-400">{settings.leadTime}d</span> : (() => { const cat = leadTimeSettings.skuCategories?.[item.sku]; const catLT = cat && leadTimeSettings.categoryLeadTimes?.[cat]?.leadTimeDays; return catLT ? <span className="text-cyan-400" title={`From category: ${cat}`}>{catLT}d</span> : <span className="text-slate-500">{leadTimeSettings.defaultLeadTimeDays}d</span>; })()}</td>
                    <td className="text-center py-2 px-2">{settings.reorderPoint ? <span className="text-emerald-400">{formatNumber(settings.reorderPoint)}</span> : <span className="text-slate-500">—</span>}</td>
                    <td className="text-center py-2 px-2">
                      {settings.threeplAlertQty ? <span className="text-amber-400">{formatNumber(settings.threeplAlertQty)}</span> : <span className="text-slate-500">—</span>}
                    </td>
                    <td className="text-center py-2 px-2">
                      {settings.amazonAlertDays ? <span className="text-amber-400">{settings.amazonAlertDays}d</span> : <span className="text-slate-500">—</span>}
                    </td>
                    <td className="text-center py-2 px-2">
                      {settings.targetDays ? <span className="text-cyan-400">{settings.targetDays}d</span> : <span className="text-slate-500">90d</span>}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <button onClick={() => { setSkuSettingsEditItem(item.sku); setSkuSettingsEditForm(settings); }} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 text-xs">Edit</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {skuSettingsFilteredSkus.length === 0 && (
            <div className="text-center py-8 text-slate-400">No SKUs found matching your search</div>
          )}
        </div>
        
        {/* Footer with summary */}
        <div className="p-4 border-t border-slate-700 bg-slate-800/50 flex items-center justify-between">
          <div className="text-slate-400 text-sm">
            <span className="text-white font-medium">{Object.keys(leadTimeSettings.skuSettings || {}).length}</span> SKUs with custom settings
          </div>
          <button onClick={() => { setShowSkuSettings(false); setSkuSettingsEditItem(null); setSkuSettingsEditForm({}); setSkuSettingsSearch(''); }} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white">Close</button>
        </div>
      </div>
    </div>
  ) : null;
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 lg:p-6">
      <div className="max-w-7xl mx-auto">{globalModals}{SkuSettingsModalJSX}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div><h1 className="text-2xl lg:text-3xl font-bold text-white">📦 Inventory Management</h1><p className="text-slate-400">{new Date(selectedInvDate+'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} • {items.length} active SKUs</p></div>
          <div className="flex gap-2">
            <button onClick={() => setShowSkuSettings(true)} className="bg-violet-700 hover:bg-violet-600 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-1"><Settings className="w-4 h-4" />SKU Settings</button>
            <button onClick={() => { setUploadTab('inventory'); setView('upload'); }} className="bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm"><RefreshCw className="w-4 h-4 inline mr-1" />New</button>
            <button onClick={() => deleteInv(selectedInvDate)} className="bg-rose-900/50 hover:bg-rose-800/50 text-rose-300 px-3 py-2 rounded-lg text-sm"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
        <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />
        {dates.length > 1 && (
          <div className="flex items-center gap-4 mb-6">
            <button onClick={() => idx < dates.length - 1 && setSelectedInvDate(dates[idx + 1])} disabled={idx >= dates.length - 1} className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg"><ChevronLeft className="w-5 h-5" /></button>
            <select value={selectedInvDate} onChange={(e) => setSelectedInvDate(e.target.value)} className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white">{dates.map(d => <option key={d} value={d}>{new Date(d+'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</option>)}</select>
            <button onClick={() => idx > 0 && setSelectedInvDate(dates[idx - 1])} disabled={idx <= 0} className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg"><ChevronRight className="w-5 h-5" /></button>
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <MetricCard label="Total Units" value={formatNumber(filteredSummary.totalUnits)} sub={filteredSummary.skuCount + ' active SKUs'} icon={Package} color="blue" />
          <MetricCard label="Total Value (at cost)" value={formatCurrency(filteredSummary.totalValue)} sub="Units × COGS" icon={DollarSign} color="emerald" />
          <MetricCard label="Amazon FBA" value={formatNumber(filteredSummary.amazonUnits)} sub={formatCurrency(filteredSummary.amazonValue)} icon={ShoppingCart} color="orange" />
          <MetricCard label="3PL" value={formatNumber(filteredSummary.threeplUnits)} sub={formatCurrency(filteredSummary.threeplValue)} icon={Boxes} color="violet" />
          <MetricCard label="AWD" value={formatNumber(filteredSummary.awdUnits || 0)} sub={formatCurrency(filteredSummary.awdValue || 0)} icon={Boxes} color="amber" />
          <MetricCard label="Inbound" value={formatNumber(filteredSummary.inboundUnits || 0)} sub="In transit" icon={Package} color="sky" />
        </div>
        {data.velocitySource && <div className="bg-cyan-900/20 border border-cyan-500/30 rounded-xl p-3 mb-6"><p className="text-cyan-400 text-sm"><span className="font-semibold">Velocity:</span> {data.velocitySource}</p></div>}
        
        {/* Warning when no velocity data */}
        {(!data.velocitySource || data.velocitySource.includes('no weekly data')) && (
          <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-3 mb-6 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-amber-300 text-sm font-medium">Limited Velocity Data</p>
              <p className="text-slate-400 text-xs">
                Stock-out dates and reorder recommendations may be inaccurate. For better predictions, sync sales data via 
                <button onClick={() => setView('upload')} className="text-amber-400 hover:text-amber-300 underline ml-1">Upload → Shopify Sync</button> or ensure your FBA inventory file includes the "units-shipped-t30" column.
              </p>
            </div>
          </div>
        )}
        
        {/* Learning Status Banner */}
        {data.learningStatus?.correctionsApplied && (
          <div className="bg-purple-900/20 border border-purple-500/30 rounded-xl p-3 mb-6 flex items-center gap-3">
            <Brain className="w-5 h-5 text-purple-400" />
            <div className="flex-1">
              <p className="text-purple-300 text-sm font-medium">AI-Enhanced Predictions Active</p>
              <p className="text-slate-400 text-xs">
                Velocity calculations adjusted using {data.learningStatus.samplesUsed} weeks of learned data ({data.learningStatus.confidence.toFixed(0)}% confidence)
              </p>
            </div>
            <div className="text-right">
              <p className="text-purple-300 text-xs">Correction Factor</p>
              <p className="text-white font-mono text-sm">{(forecastCorrections.overall?.units || 1).toFixed(2)}x</p>
            </div>
          </div>
        )}
        {!data.learningStatus?.correctionsApplied && forecastCorrections.samplesUsed > 0 && (
          <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-3 mb-6 flex items-center gap-3">
            <Brain className="w-5 h-5 text-amber-400" />
            <div className="flex-1">
              <p className="text-amber-300 text-sm font-medium">AI Learning in Progress</p>
              <p className="text-slate-400 text-xs">
                {forecastCorrections.samplesUsed} samples collected • {forecastCorrections.confidence.toFixed(0)}% confidence (30% needed to activate)
              </p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 cursor-help" title={`SKUs with less than ${displayThresholds.critical} days of supply remaining, or whose reorder date has already passed. These need immediate attention to avoid stockouts.`}><div className="flex items-center gap-2 mb-2"><AlertCircle className="w-5 h-5 text-rose-400" /><span className="text-rose-400 font-medium">Critical</span><HelpCircle className="w-3 h-3 text-rose-400/30" /></div><p className="text-2xl font-bold text-white">{filteredSummary.critical}</p><p className="text-xs text-slate-400">&lt;{displayThresholds.critical} days supply</p></div>
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 cursor-help" title={`SKUs with ${displayThresholds.critical}-${displayThresholds.low} days of supply remaining. You should start planning a reorder now to avoid running low before your shipment arrives.`}><div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-5 h-5 text-amber-400" /><span className="text-amber-400 font-medium">Low</span><HelpCircle className="w-3 h-3 text-amber-400/30" /></div><p className="text-2xl font-bold text-white">{filteredSummary.low}</p><p className="text-xs text-slate-400">{displayThresholds.critical}-{displayThresholds.low} days supply</p></div>
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 cursor-help" title={`SKUs with ${displayThresholds.low}-${displayThresholds.overstock} days of supply. These are well-stocked and don't need immediate attention. Threshold is based on your ${leadTimeSettings.minOrderWeeks || 22}-week minimum order cycle + ${leadTimeSettings.defaultLeadTimeDays || 14}-day lead time.`}><div className="flex items-center gap-2 mb-2"><CheckCircle className="w-5 h-5 text-emerald-400" /><span className="text-emerald-400 font-medium">Healthy</span><HelpCircle className="w-3 h-3 text-emerald-400/30" /></div><p className="text-2xl font-bold text-white">{filteredSummary.healthy}</p><p className="text-xs text-slate-400">{displayThresholds.low}-{displayThresholds.overstock} days supply</p></div>
          <div className="bg-violet-500/10 border border-violet-500/30 rounded-2xl p-4 cursor-help" title={`SKUs with over ${displayThresholds.overstock} days of supply. This exceeds your full reorder cycle (${leadTimeSettings.minOrderWeeks || 22} weeks + ${leadTimeSettings.defaultLeadTimeDays || 14}-day lead time). Excess inventory ties up capital. Consider slowing reorders or running promotions.`}><div className="flex items-center gap-2 mb-2"><Clock className="w-5 h-5 text-violet-400" /><span className="text-violet-400 font-medium">Overstock</span><HelpCircle className="w-3 h-3 text-violet-400/30" /></div><p className="text-2xl font-bold text-white">{filteredSummary.overstock}</p><p className="text-xs text-slate-400">&gt;{displayThresholds.overstock} days supply</p></div>
        </div>
        
        {/* Supply Chain KPIs Dashboard */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 cursor-help" title="How many times inventory is sold and replaced per year. Calculated as (Annual COGS ÷ Current Inventory Value). Higher = faster-selling inventory. Requires COGS and velocity data. Target: 6×+ for DTC, 3-4× acceptable.">
            <p className="text-slate-400 text-xs mb-1 flex items-center gap-1">🔄 Inventory Turnover <HelpCircle className="w-2.5 h-2.5 text-slate-600" /></p>
            <p className={`text-lg font-bold ${filteredSummary.avgTurnover >= 6 ? 'text-emerald-400' : filteredSummary.avgTurnover >= 3 ? 'text-amber-400' : filteredSummary.avgTurnover > 0 ? 'text-rose-400' : 'text-slate-600'}`}>
              {filteredSummary.avgTurnover > 0 ? `${filteredSummary.avgTurnover}×` : '—'}
            </p>
            <p className="text-slate-500 text-[10px]">{filteredSummary.avgTurnover > 0 ? (filteredSummary.avgTurnover >= 6 ? 'Excellent' : filteredSummary.avgTurnover >= 3 ? 'Average' : 'Below target') : 'Needs COGS + velocity'} (6×+ ideal)</p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 cursor-help" title="Annual cost of holding your current inventory. Estimated at 25% of total inventory value, covering storage, insurance, depreciation, and opportunity cost. Lower is better — reduce overstock to minimize.">
            <p className="text-slate-400 text-xs mb-1 flex items-center gap-1">💰 Carrying Cost/yr <HelpCircle className="w-2.5 h-2.5 text-slate-600" /></p>
            <p className="text-lg font-bold text-amber-400">{filteredSummary.totalCarryingCost > 0 ? formatCurrency(filteredSummary.totalCarryingCost) : '—'}</p>
            <p className="text-slate-500 text-[10px]">{filteredSummary.totalCarryingCost > 0 ? '25% of inventory value' : 'Needs COGS data'}</p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 cursor-help" title="Percentage of inventory sold in a 30-day period. Calculated as (Units Sold in 30d ÷ (Units Sold + Ending Stock)). Higher = inventory moves faster. 20%+ is good for DTC, 10-20% is average.">
            <p className="text-slate-400 text-xs mb-1 flex items-center gap-1">📈 Sell-Through Rate <HelpCircle className="w-2.5 h-2.5 text-slate-600" /></p>
            <p className={`text-lg font-bold ${filteredSummary.avgSellThrough >= 20 ? 'text-emerald-400' : filteredSummary.avgSellThrough >= 10 ? 'text-amber-400' : filteredSummary.avgSellThrough > 0 ? 'text-rose-400' : 'text-slate-600'}`}>
              {filteredSummary.avgSellThrough > 0 ? `${filteredSummary.avgSellThrough}%` : '—'}
            </p>
            <p className="text-slate-500 text-[10px]">{filteredSummary.avgSellThrough > 0 ? '30-day avg (20%+ good)' : 'Needs velocity data'}</p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 cursor-help" title="Percentage of active SKUs (with sales velocity) that currently have stock available. Target 95%+ to avoid lost sales from stockouts.">
            <p className="text-slate-400 text-xs mb-1 flex items-center gap-1">✅ In-Stock Rate <HelpCircle className="w-2.5 h-2.5 text-slate-600" /></p>
            <p className={`text-lg font-bold ${filteredSummary.inStockRate >= 95 ? 'text-emerald-400' : filteredSummary.inStockRate >= 85 ? 'text-amber-400' : 'text-rose-400'}`}>
              {filteredSummary.inStockRate}%
            </p>
            <p className="text-slate-500 text-[10px]">Target: 95%+ service level</p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 cursor-help" title="ABC Classification ranks SKUs by revenue contribution. A items = top 80% of revenue (highest priority), B items = next 15%, C items = bottom 5%. Focus inventory investment on A-class products.">
            <p className="text-slate-400 text-xs mb-1 flex items-center gap-1">🏷️ ABC Classification <HelpCircle className="w-2.5 h-2.5 text-slate-600" /></p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-400 font-medium">A:{filteredSummary.abcCounts?.A || 0}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400 font-medium">B:{filteredSummary.abcCounts?.B || 0}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400 font-medium">C:{filteredSummary.abcCounts?.C || 0}</span>
            </div>
            <p className="text-slate-500 text-[10px]">Revenue-based Pareto</p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 cursor-help" title="Total safety stock units across all SKUs. Safety stock is extra inventory held to protect against demand variability and supply delays. Calculated at 95% service level (Z=1.65) based on demand coefficient of variation.">
            <p className="text-slate-400 text-xs mb-1 flex items-center gap-1">🛡️ Safety Stock Buffer <HelpCircle className="w-2.5 h-2.5 text-slate-600" /></p>
            <p className="text-lg font-bold text-cyan-400">{items.reduce((s, i) => s + (i.safetyStock || 0), 0).toLocaleString()}</p>
            <p className="text-slate-500 text-[10px]">95% service level (Z=1.65)</p>
          </div>
        </div>
        
        {/* Reorder Alert - Items with less than 120 days supply */}
        {(() => {
          const lowStock = items.filter(item => item.daysOfSupply !== 999 && item.daysOfSupply < 120 && item.daysOfSupply > 0);
          if (lowStock.length === 0) return null;
          const criticalItems = lowStock.filter(i => i.daysOfSupply < 30);
          const warningItems = lowStock.filter(i => i.daysOfSupply >= 30 && i.daysOfSupply < 60);
          const watchItems = lowStock.filter(i => i.daysOfSupply >= 60 && i.daysOfSupply < 120);
          return (
            <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-amber-400 font-semibold mb-1">📦 Reorder Alert: Less Than 120 Days Supply</h4>
                  <p className="text-slate-300 text-sm mb-3">
                    {lowStock.length} SKU{lowStock.length > 1 ? 's' : ''} running low on inventory
                    {criticalItems.length > 0 && <span className="text-rose-400 ml-2">({criticalItems.length} critical!)</span>}
                  </p>
                  <div className="bg-slate-900/50 rounded-lg p-3 max-h-48 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-slate-500 text-xs">
                          <th className="text-left pb-2">SKU</th>
                          <th className="text-right pb-2">Qty</th>
                          <th className="text-right pb-2">Velocity/wk</th>
                          <th className="text-right pb-2">Days Left</th>
                          <th className="text-left pb-2 pl-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lowStock.sort((a, b) => a.daysOfSupply - b.daysOfSupply).slice(0, 15).map(item => (
                          <tr key={item.sku} className="border-t border-slate-700/50">
                            <td className="py-1.5 text-white max-w-[150px] truncate" title={item.name}>{item.sku}</td>
                            <td className="py-1.5 text-right text-white">{formatNumber(item.totalQty)}</td>
                            <td className="py-1.5 text-right text-slate-400">{item.weeklyVel.toFixed(1)}</td>
                            <td className={`py-1.5 text-right font-semibold ${item.daysOfSupply < 30 ? 'text-rose-400' : item.daysOfSupply < 60 ? 'text-amber-400' : 'text-yellow-400'}`}>{item.daysOfSupply}</td>
                            <td className="py-1.5 pl-2">
                              {item.daysOfSupply < 30 ? <span className="text-xs bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded">CRITICAL</span> :
                               item.daysOfSupply < 60 ? <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">ORDER NOW</span> :
                               <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">WATCH</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {lowStock.length > 15 && <p className="text-slate-500 text-xs mt-2">+ {lowStock.length - 15} more...</p>}
                  </div>
                  <div className="flex gap-4 mt-3 text-xs">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-rose-500 rounded" />&lt;30 days: {criticalItems.length}</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-500 rounded" />30-60 days: {warningItems.length}</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-yellow-500 rounded" />60-120 days: {watchItems.length}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
        
        {/* Custom SKU Alerts - Based on user-defined thresholds */}
        {customAlerts.length > 0 && (
          <div className="bg-rose-900/20 border border-rose-500/30 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <Bell className="w-6 h-6 text-rose-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-rose-400 font-semibold mb-1">🔔 Custom Threshold Alerts</h4>
                <p className="text-slate-300 text-sm mb-3">
                  {customAlerts.length} SKU{customAlerts.length > 1 ? 's' : ''} hit your custom alert thresholds
                </p>
                <div className="bg-slate-900/50 rounded-lg p-3 max-h-48 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-500 text-xs">
                        <th className="text-left pb-2">SKU</th>
                        <th className="text-right pb-2">Amazon</th>
                        <th className="text-right pb-2">3PL</th>
                        <th className="text-right pb-2">Total</th>
                        <th className="text-left pb-2 pl-2">Alert Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customAlerts.map(item => {
                        const settings = getSkuSettings(item.sku);
                        let alertReason = [];
                        if (settings.threeplAlertQty && (item.threeplQty || 0) <= settings.threeplAlertQty) {
                          alertReason.push(`3PL ≤ ${settings.threeplAlertQty}`);
                        }
                        if (settings.amazonAlertDays) {
                          const amzDays = item.amzWeeklyVel > 0 ? (item.amazonQty || 0) / (item.amzWeeklyVel / 7) : 999;
                          if (amzDays <= settings.amazonAlertDays) {
                            alertReason.push(`AMZ ≤ ${settings.amazonAlertDays}d`);
                          }
                        }
                        if (settings.reorderPoint && (item.totalQty || 0) <= settings.reorderPoint) {
                          alertReason.push(`Total ≤ ${settings.reorderPoint}`);
                        }
                        return (
                          <tr key={item.sku} className="border-t border-slate-700/50">
                            <td className="py-1.5">
                              <p className="text-white max-w-[150px] truncate" title={item.name}>{item.sku}</p>
                              <p className="text-slate-500 text-xs truncate">{item.name}</p>
                            </td>
                            <td className="py-1.5 text-right text-orange-400">{formatNumber(item.amazonQty || 0)}</td>
                            <td className="py-1.5 text-right text-violet-400">{formatNumber(item.threeplQty || 0)}</td>
                            <td className="py-1.5 text-right text-white font-medium">{formatNumber(item.totalQty)}</td>
                            <td className="py-1.5 pl-2">
                              {alertReason.map((r, i) => (
                                <span key={i} className="text-xs bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded mr-1">{r}</span>
                              ))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-between items-center mt-3">
                  <p className="text-slate-500 text-xs">Based on your custom SKU settings</p>
                  <button onClick={() => setShowSkuSettings(true)} className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1">
                    <Settings className="w-3 h-3" />Manage Settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700 overflow-hidden">
          <div className="p-4 border-b border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h3 className="text-lg font-semibold text-white">Products ({items.length})</h3>
              {/* AI Learning Status */}
              {forecastCorrections.confidence >= 30 ? (
                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-900/30 border border-emerald-500/30 rounded-full">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  <span className="text-emerald-400 text-xs font-medium">
                    AI Learning Active ({forecastCorrections.confidence.toFixed(0)}% confidence)
                  </span>
                </div>
              ) : forecastCorrections.samplesUsed > 0 ? (
                <div className="flex items-center gap-2 px-3 py-1 bg-amber-900/30 border border-amber-500/30 rounded-full">
                  <div className="w-2 h-2 bg-amber-400 rounded-full" />
                  <span className="text-amber-400 text-xs font-medium">
                    Learning... ({forecastCorrections.samplesUsed} samples, need 2+)
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1 bg-slate-700/50 border border-slate-600/30 rounded-full">
                  <div className="w-2 h-2 bg-slate-500 rounded-full" />
                  <span className="text-slate-400 text-xs">
                    Sync sales to enable AI learning
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-400">
                <input 
                  type="checkbox" 
                  checked={invShowZeroStock} 
                  onChange={(e) => setInvShowZeroStock(e.target.checked)}
                  className="rounded bg-slate-700 border-slate-600"
                />
                Show zero stock
              </label>
              <button 
                onClick={exportInventoryExcel} 
                disabled={exportingXlsx || items.length === 0}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg text-white text-sm flex items-center gap-1"
                title="Export to Excel"
              >
                <Download className="w-4 h-4" />{exportingXlsx ? 'Exporting...' : 'Export'}
              </button>
              <div className="relative" ref={columnPickerRef}>
                <button 
                  onClick={() => setShowColumnPicker(!showColumnPicker)}
                  className={`px-3 py-1.5 rounded-lg text-white text-sm flex items-center gap-1 ${hiddenColumns.length > 0 ? 'bg-amber-600 hover:bg-amber-500' : 'bg-slate-600 hover:bg-slate-500'}`}
                  title="Show/hide columns"
                >
                  {hiddenColumns.length > 0 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}{hiddenColumns.length > 0 ? `${hiddenColumns.length} hidden` : 'Columns'}
                </button>
                {showColumnPicker && (
                  <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 py-2 w-48">
                    <p className="text-xs text-slate-400 px-3 pb-2 border-b border-slate-700">Toggle columns</p>
                    {ALL_COLUMNS.filter(c => !c.alwaysVisible).map(col => (
                      <label key={col.key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700/50 cursor-pointer text-sm">
                        <input 
                          type="checkbox" 
                          checked={!hiddenColumns.includes(col.key)} 
                          onChange={() => toggleColumn(col.key)}
                          className="rounded bg-slate-700 border-slate-600 text-emerald-500"
                        />
                        <span className={hiddenColumns.includes(col.key) ? 'text-slate-500' : 'text-white'}>{col.label}</span>
                      </label>
                    ))}
                    {hiddenColumns.length > 0 && (
                      <button onClick={() => setHiddenColumns([])} className="text-xs text-amber-400 hover:text-amber-300 px-3 pt-2 border-t border-slate-700 w-full text-left mt-1">
                        Show all columns
                      </button>
                    )}
                  </div>
                )}
              </div>
              <button onClick={() => setShowSkuSettings(true)} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white text-sm flex items-center gap-1">
                <Settings className="w-4 h-4" />Settings
              </button>
            </div>
          </div>
          
          {/* Demand Intelligence Summary */}
          {items.some(i => i.safetyStock > 0) && (
            <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
                <p className="text-slate-400 text-xs mb-1">📊 Demand Classification</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {(() => {
                    const classes = items.reduce((acc, i) => { if (i.demandClass && i.demandClass !== 'unknown') acc[i.demandClass] = (acc[i.demandClass] || 0) + 1; return acc; }, {});
                    return Object.entries(classes).map(([cls, count]) => (
                      <span key={cls} className={`text-xs px-2 py-0.5 rounded-full ${cls === 'smooth' ? 'bg-emerald-900/50 text-emerald-400' : cls === 'lumpy' ? 'bg-amber-900/50 text-amber-400' : 'bg-rose-900/50 text-rose-400'}`}>
                        {cls}: {count}
                      </span>
                    ));
                  })()}
                </div>
              </div>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
                <p className="text-slate-400 text-xs mb-1">📅 Seasonal Factor</p>
                {(() => {
                  const factors = items.filter(i => i.seasonalFactor && i.seasonalFactor !== 1);
                  const avg = factors.length > 0 ? factors.reduce((s, i) => s + i.seasonalFactor, 0) / factors.length : 1;
                  return (
                    <>
                      <p className={`font-semibold ${avg > 1.1 ? 'text-emerald-400' : avg < 0.9 ? 'text-amber-400' : 'text-white'}`}>
                        {avg.toFixed(2)}x avg
                      </p>
                      <p className="text-slate-500 text-xs">{avg > 1.1 ? '↑ Peak season' : avg < 0.9 ? '↓ Slow season' : '→ Normal season'}</p>
                    </>
                  );
                })()}
              </div>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
                <p className="text-slate-400 text-xs mb-1">⚠️ High Variability</p>
                {(() => {
                  const highCV = items.filter(i => i.cv >= 0.8).sort((a, b) => b.cv - a.cv);
                  return highCV.length > 0 ? (
                    <>
                      <p className="text-rose-400 font-semibold">{highCV.length} SKUs</p>
                      <p className="text-slate-500 text-xs truncate" title={highCV.map(i => i.sku).join(', ')}>
                        {highCV.slice(0, 2).map(i => i.sku).join(', ')}{highCV.length > 2 ? '...' : ''}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-emerald-400 font-semibold">None</p>
                      <p className="text-slate-500 text-xs">All SKUs have stable demand</p>
                    </>
                  );
                })()}
              </div>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
                <p className="text-slate-400 text-xs mb-1">🔢 EOQ Optimization</p>
                {(() => {
                  const withEOQ = items.filter(i => i.eoq > 0);
                  const totalEOQ = withEOQ.reduce((s, i) => s + i.eoq, 0);
                  const aboveEOQ = withEOQ.filter(i => i.totalQty > i.eoq * 1.5);
                  return (
                    <>
                      <p className="text-white font-semibold">{withEOQ.length} SKUs</p>
                      <p className="text-slate-500 text-xs">{aboveEOQ.length > 0 ? `${aboveEOQ.length} above optimal qty` : 'Orders optimized'}</p>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
          
          <div className="overflow-x-auto">
            <table className="w-full" style={{tableLayout: 'fixed', minWidth: `${visibleColumns.length * 80 + 35}px`}}>
              <colgroup>
                {visibleColumns.map(col => {
                  const widths = { name: 180, abcClass: 32, amazonQty: 70, threeplQty: 65, awdQty: 60, amazonInbound: 65, totalQty: 75, totalValue: 95, amzWeeklyVel: 55, shopWeeklyVel: 55, weeklyVel: 55, daysOfSupply: 50, turnoverRate: 55, stockoutDate: 70, reorderByDate: 70, health: 78 };
                  return <col key={col.key} style={{width: `${widths[col.key] || 70}px`}} />;
                })}
                <col style={{width: '35px'}} />
              </colgroup>
              <thead className="bg-slate-900/50"><tr>
                {visibleColumns.map(col => (
                  <th 
                    key={col.key}
                    onClick={() => {
                      if (invSortColumn === col.key) {
                        setInvSortDirection(invSortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        setInvSortColumn(col.key);
                        setInvSortDirection('desc');
                      }
                    }}
                    className={`text-${col.align} text-xs font-medium text-slate-400 uppercase px-2 py-3 cursor-pointer hover:text-white hover:bg-slate-800/50 select-none transition-colors ${col.align === 'left' ? 'px-3' : ''}`}
                  >
                    <span className="flex items-center gap-1" style={{ justifyContent: col.align === 'left' ? 'flex-start' : col.align === 'right' ? 'flex-end' : 'center' }}>
                      {col.label}
                      {invSortColumn === col.key && (
                        <span className="text-emerald-400">{invSortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </span>
                  </th>
                ))}
                <th className="text-center text-xs font-medium text-slate-400 uppercase px-2 py-3">⚙️</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-700/50">
                {items.map((item) => {
                  const settings = getSkuSettings(item.sku);
                  const hasCustomSettings = settings.leadTime || settings.reorderPoint || settings.threeplAlertQty || settings.amazonAlertDays || settings.targetDays;
                  const isAlerted = customAlerts.some(a => a.sku === item.sku);
                  
                  // Cell renderers by column key
                  const cellMap = {
                    name: (
                      <td key="name" className="px-3 py-2 overflow-hidden">
                        <div className="flex items-start gap-1">
                          {isAlerted && <Bell className="w-3 h-3 text-rose-400 flex-shrink-0 mt-1" />}
                          <div className="overflow-hidden">
                            <p className="text-white text-sm font-medium overflow-hidden text-ellipsis whitespace-nowrap" title={item.name}>{item.name}</p>
                            <p className="text-slate-500 text-xs overflow-hidden text-ellipsis whitespace-nowrap">{item.sku}</p>
                          </div>
                        </div>
                      </td>
                    ),
                    abcClass: (
                      <td key="abcClass" className="text-center px-1 py-2">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                          item.abcClass === 'A' ? 'bg-emerald-900/50 text-emerald-400' :
                          item.abcClass === 'B' ? 'bg-blue-900/50 text-blue-400' :
                          'bg-slate-700/50 text-slate-500'
                        }`} title={`ABC Class: ${item.abcClass} | EOQ: ${item.eoq || 0} units | Carrying Cost: ${formatCurrency(item.annualCarryingCost || 0)}/yr | Sell-Through: ${item.sellThroughRate || 0}% | Risk: ${item.stockoutRisk || 0}/100`}>
                          {item.abcClass || '—'}
                        </span>
                      </td>
                    ),
                    amazonQty: <td key="amazonQty" className="text-right px-2 py-2 text-orange-400 text-sm">{formatNumber(item.amazonQty)}</td>,
                    threeplQty: <td key="threeplQty" className={`text-right px-2 py-2 text-sm ${settings.threeplAlertQty && (item.threeplQty || 0) <= settings.threeplAlertQty ? 'text-rose-400 font-bold' : 'text-violet-400'}`}>{formatNumber(item.threeplQty)}</td>,
                    awdQty: <td key="awdQty" className="text-right px-2 py-2 text-amber-400 text-sm">{formatNumber(item.awdQty || 0)}</td>,
                    amazonInbound: <td key="amazonInbound" className="text-right px-2 py-2 text-sky-400 text-sm">{formatNumber((item.amazonInbound || 0) + (item.awdInbound || 0) + (item.threeplInbound || 0))}</td>,
                    totalQty: <td key="totalQty" className="text-right px-2 py-2 text-white text-sm font-medium tabular-nums">{formatNumber(item.totalQty)}</td>,
                    totalValue: <td key="totalValue" className="text-right px-2 py-2 text-white text-sm tabular-nums overflow-hidden text-ellipsis whitespace-nowrap" title={formatCurrency(item.totalValue)}>{item.totalValue >= 10000 ? '$' + (item.totalValue / 1000).toFixed(1) + 'k' : formatCurrency(item.totalValue)}</td>,
                    amzWeeklyVel: <td key="amzWeeklyVel" className="text-right px-2 py-2 text-orange-400 text-sm">{(item.amzWeeklyVel || 0).toFixed(1)}</td>,
                    shopWeeklyVel: <td key="shopWeeklyVel" className="text-right px-2 py-2 text-blue-400 text-sm">{(item.shopWeeklyVel || 0).toFixed(1)}</td>,
                    weeklyVel: <td key="weeklyVel" className="text-right px-2 py-2 text-white text-sm font-medium">{item.weeklyVel?.toFixed(1) || '0.0'}</td>,
                    daysOfSupply: (
                      <td key="daysOfSupply" className="text-right px-2 py-2" title={item.safetyStock > 0 ? `Safety Stock: ${item.safetyStock} units | Reorder Point: ${item.reorderPoint} units | CV: ${item.cv} (${item.demandClass}) | Season: ${item.seasonalFactor}x | EOQ: ${item.eoq} units | Carrying Cost: ${formatCurrency(item.annualCarryingCost || 0)}/yr` : ''}>
                        <span className="text-white text-sm">{item.daysOfSupply === 999 ? '—' : item.daysOfSupply}</span>
                        {item.safetyStock > 0 && <span className="block text-[10px] text-cyan-500">SS:{item.safetyStock}</span>}
                      </td>
                    ),
                    turnoverRate: (
                      <td key="turnoverRate" className="text-right px-2 py-2" title={`Turnover: ${item.turnoverRate}×/yr | Sell-Through: ${item.sellThroughRate}% | Stock:Sales: ${item.stockToSalesRatio === 999 ? '—' : item.stockToSalesRatio + ':1'} | Stockout Risk: ${item.stockoutRisk}/100`}>
                        <span className={`text-sm ${item.turnoverRate >= 8 ? 'text-emerald-400' : item.turnoverRate >= 4 ? 'text-white' : item.turnoverRate > 0 ? 'text-amber-400' : 'text-slate-600'}`}>{item.turnoverRate > 0 ? `${item.turnoverRate}×` : '—'}</span>
                        {item.sellThroughRate > 0 && <span className={`block text-[10px] ${item.sellThroughRate >= 20 ? 'text-emerald-500' : item.sellThroughRate >= 10 ? 'text-slate-400' : 'text-amber-500'}`}>{item.sellThroughRate}%</span>}
                      </td>
                    ),
                    stockoutDate: <td key="stockoutDate" className="text-right px-2 py-2 text-slate-400 text-xs">{item.stockoutDate ? (() => { const d = new Date(item.stockoutDate); const thisYear = new Date().getFullYear(); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== thisYear ? { year: '2-digit' } : {}) }); })() : '—'}</td>,
                    reorderByDate: <td key="reorderByDate" className={`text-right px-2 py-2 text-xs font-medium ${item.daysUntilMustOrder < 0 ? 'text-rose-400' : item.daysUntilMustOrder < 14 ? 'text-amber-400' : 'text-slate-400'}`}>{item.reorderByDate ? (() => { const d = new Date(item.reorderByDate); const thisYear = new Date().getFullYear(); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== thisYear ? { year: '2-digit' } : {}) }); })() : '—'}</td>,
                    health: (
                      <td key="health" className="text-center px-2 py-2" title={`${item.demandClass !== 'unknown' ? `Demand: ${item.demandClass} (CV=${item.cv})` : ''} ${item.safetyStock > 0 ? `| SS: ${item.safetyStock}` : ''} ${item.seasonalFactor && item.seasonalFactor !== 1 ? `| Season: ${item.seasonalFactor}x` : ''}`}>
                        <HealthBadge health={item.health} />
                        {item.demandClass && item.demandClass !== 'unknown' && (
                          <span className={`block text-[9px] mt-0.5 ${item.demandClass === 'smooth' ? 'text-emerald-500' : item.demandClass === 'lumpy' ? 'text-amber-500' : 'text-rose-500'}`}>
                            {item.demandClass}
                          </span>
                        )}
                      </td>
                    ),
                  };
                  
                  return (
                    <tr key={item.sku} className={`hover:bg-slate-700/30 ${isAlerted ? 'bg-rose-950/30' : item.health === 'critical' ? 'bg-rose-950/20' : item.health === 'low' ? 'bg-amber-950/20' : ''}`}>
                      {visibleColumns.map(col => cellMap[col.key])}
                      <td className="text-center px-2 py-2">
                        <button 
                          onClick={() => { setShowSkuSettings(true); setSkuSettingsSearch(item.sku); setSkuSettingsEditItem(item.sku); setSkuSettingsEditForm(settings); }}
                          className={`p-1 rounded ${hasCustomSettings ? 'bg-emerald-600/30 text-emerald-400' : 'bg-slate-700/50 text-slate-500 hover:text-slate-300'}`}
                          title={hasCustomSettings ? 'Has custom settings' : 'Configure settings'}
                        >
                          <Settings className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Smart Inventory Forecast Section */}
        <div className="mt-8 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-emerald-400" />
                Smart Inventory Forecast
              </h2>
              <p className="text-slate-400 text-sm">AI-powered predictions using historical data, Amazon forecasts, and production pipeline</p>
            </div>
            <button 
              disabled={aiLoading}
              onClick={async () => {
                setAiLoading(true);
                
                // Gather all the data for AI analysis
                const inventoryItems = items;
                const sortedWeeks = Object.keys(allWeeksData).sort();
                const recentWeeks = sortedWeeks.slice(-12);
                
                // Build velocity history per SKU
                const skuVelocityHistory = {};
                recentWeeks.forEach(week => {
                  const weekData = allWeeksData[week];
                  [...(weekData?.amazon?.skus || []), ...(weekData?.shopify?.skus || [])].forEach(sku => {
                    if (!skuVelocityHistory[sku.sku]) skuVelocityHistory[sku.sku] = [];
                    skuVelocityHistory[sku.sku].push({ week, units: sku.units || 0 });
                  });
                });
                
                // Get Amazon forecasts
                const amazonForecastData = upcomingAmazonForecasts.length > 0 ? upcomingAmazonForecasts[0] : null;
                
                // Get production pipeline
                const pendingProduction = productionPipeline.filter(p => p.status !== 'received');
                
                // Build context for AI
                const analysisContext = {
                  currentInventory: inventoryItems.slice(0, 30).map(i => ({
                    sku: i.sku,
                    name: i.name,
                    totalQty: i.totalQty,
                    weeklyVelocity: i.weeklyVel,
                    daysOfSupply: i.daysOfSupply,
                    health: i.health,
                    stockoutDate: i.stockoutDate,
                    reorderByDate: i.reorderByDate,
                    suggestedOrderQty: i.suggestedOrderQty,
                    safetyStock: i.safetyStock || 0,
                    seasonalFactor: i.seasonalFactor || 1.0,
                    cv: i.cv || 0,
                    demandClass: i.demandClass || 'unknown',
                  })),
                  velocityTrends: Object.entries(skuVelocityHistory).slice(0, 20).map(([sku, history]) => ({
                    sku,
                    avgVelocity: history.reduce((s, h) => s + h.units, 0) / Math.max(history.length, 1),
                    trend: history.length >= 4 ? (history.slice(-2).reduce((s, h) => s + h.units, 0) / 2) - (history.slice(0, 2).reduce((s, h) => s + h.units, 0) / 2) : 0
                  })),
                  amazonForecast: amazonForecastData ? {
                    weekEnding: amazonForecastData.weekEnding,
                    projectedUnits: amazonForecastData.totals?.units || amazonForecastData.totalUnits || 0,
                    projectedRevenue: amazonForecastData.totals?.sales || amazonForecastData.totalSales || 0,
                    topSkus: Object.entries(amazonForecastData.skus || {}).slice(0, 10).map(([sku, data]) => ({ sku, units: data?.units || 0 }))
                  } : null,
                  productionPipeline: pendingProduction.map(p => ({
                    sku: p.sku,
                    product: p.productName,
                    quantity: p.quantity,
                    expectedDate: p.expectedDate,
                    daysUntil: p.expectedDate ? Math.ceil((new Date(p.expectedDate) - new Date()) / (1000 * 60 * 60 * 24)) : null
                  })),
                  forecastAccuracy: getAmazonForecastComparison.length > 0 ? {
                    avgAccuracy: (100 - Math.abs(getAmazonForecastComparison.reduce((s, c) => s + c.variance.revenuePercent, 0) / getAmazonForecastComparison.length)).toFixed(1),
                    samples: getAmazonForecastComparison.length
                  } : null
                };
                
                setAiInput('');
                setShowAIChat(true);
                setAiMessages(prev => [...prev, { 
                  role: 'user', 
                  content: `Analyze my inventory and provide a smart forecast. Here's my data:\n\n${JSON.stringify(analysisContext, null, 2)}\n\nPlease:\n1. Identify which SKUs are at risk of stockout\n2. Factor in the production pipeline timing\n3. Compare current velocity vs Amazon's forecast\n4. Give me a prioritized reorder recommendation\n5. Flag any SKUs where production won't arrive in time`
                }]);
                
                // Trigger AI analysis
                try {
                  const prompt = `You are an inventory planning expert. Analyze this e-commerce inventory data and provide actionable recommendations.

DATA:
${JSON.stringify(analysisContext, null, 2)}

Provide a concise analysis covering:
1. **Stockout Risk** - Which SKUs will run out first and when
2. **Production Timing** - Will incoming production arrive before stockouts?
3. **Velocity Analysis** - Are sales trending up/down? How does this compare to Amazon's forecast?
4. **Reorder Priority** - Ranked list of what to reorder first
5. **Specific Actions** - What should I do this week?

Be specific with SKU names and numbers. Use bullet points for clarity.`;
                  
                  const result = await callAI(prompt);
                  setAiMessages(prev => [...prev, { 
                    role: 'assistant', 
                    content: result || 'Unable to generate forecast analysis.'
                  }]);
                } catch (err) {
                  devError('AI Forecast Analysis error:', err);
                  setAiMessages(prev => [...prev, { 
                    role: 'assistant', 
                    content: 'Error generating forecast. Please try again.'
                  }]);
                } finally {
                  setAiLoading(false);
                }
              }}
              className={`px-4 py-2 rounded-lg text-sm text-white flex items-center gap-2 ${aiLoading ? 'bg-slate-600 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500'}`}
            >
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {aiLoading ? 'Analyzing...' : 'Run AI Forecast Analysis'}
            </button>
          </div>
          
          {/* Forecast Data Sources */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {/* Historical Velocity */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-blue-400" />
                <span className="text-blue-400 font-medium text-sm">Historical Data</span>
              </div>
              <p className="text-2xl font-bold text-white">{Object.keys(allWeeksData).length} weeks</p>
              <p className="text-slate-400 text-xs">Sales velocity baseline</p>
            </div>
            
            {/* Amazon Forecast */}
            <div className={`rounded-xl border p-4 ${upcomingAmazonForecasts.length > 0 ? 'bg-orange-900/20 border-orange-500/30' : 'bg-slate-800/50 border-slate-700'}`}>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-orange-400" />
                <span className="text-orange-400 font-medium text-sm">Amazon Forecast</span>
              </div>
              {upcomingAmazonForecasts.length > 0 ? (
                <>
                  <p className="text-2xl font-bold text-white">{formatNumber(upcomingAmazonForecasts[0].totals?.units || upcomingAmazonForecasts[0].totalUnits || 0)} units</p>
                  <p className="text-slate-400 text-xs">Projected next week</p>
                </>
              ) : (
                <>
                  <p className="text-slate-500 text-lg">Not uploaded</p>
                  <button onClick={() => { setUploadTab('forecast'); setView('upload'); }} className="text-orange-400 text-xs hover:underline">Upload forecast →</button>
                </>
              )}
            </div>
            
            {/* Production Pipeline */}
            <div className={`rounded-xl border p-4 ${productionPipeline.filter(p => p.status !== 'received').length > 0 ? 'bg-cyan-900/20 border-cyan-500/30' : 'bg-slate-800/50 border-slate-700'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Truck className="w-5 h-5 text-cyan-400" />
                <span className="text-cyan-400 font-medium text-sm">Incoming Production</span>
              </div>
              {productionPipeline.filter(p => p.status !== 'received').length > 0 ? (
                <>
                  <p className="text-2xl font-bold text-white">{formatNumber(productionPipeline.filter(p => p.status !== 'received').reduce((s, p) => s + (p.quantity || 0), 0))} units</p>
                  <p className="text-slate-400 text-xs">{productionPipeline.filter(p => p.status !== 'received').length} orders pending</p>
                </>
              ) : (
                <>
                  <p className="text-slate-500 text-lg">None tracked</p>
                  <p className="text-slate-500 text-xs">Add production below</p>
                </>
              )}
            </div>
            
            {/* Forecast Accuracy */}
            <div className={`rounded-xl border p-4 ${getAmazonForecastComparison.length > 0 ? 'bg-emerald-900/20 border-emerald-500/30' : 'bg-slate-800/50 border-slate-700'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-5 h-5 text-emerald-400" />
                <span className="text-emerald-400 font-medium text-sm">Forecast Accuracy</span>
              </div>
              {getAmazonForecastComparison.length > 0 ? (
                <>
                  <p className="text-2xl font-bold text-white">
                    {(100 - Math.abs(getAmazonForecastComparison.reduce((s, c) => s + c.variance.revenuePercent, 0) / getAmazonForecastComparison.length)).toFixed(0)}%
                  </p>
                  <p className="text-slate-400 text-xs">Based on {getAmazonForecastComparison.length} weeks</p>
                </>
              ) : (
                <>
                  <p className="text-slate-500 text-lg">No data yet</p>
                  <p className="text-slate-500 text-xs">Upload actuals after forecasts</p>
                </>
              )}
            </div>
          </div>
          
          {/* Critical Items Quick View */}
          {(() => {
            const criticalItems = items.filter(i => i.daysOfSupply < 30 && i.daysOfSupply !== 999 && i.daysOfSupply > 0);
            const incomingForCritical = criticalItems.map(item => {
              const incoming = productionPipeline.find(p => p.sku === item.sku && p.status !== 'received');
              return { ...item, incoming };
            });
            
            if (criticalItems.length === 0) return (
              <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                  <span className="text-emerald-400 font-medium">All inventory levels healthy!</span>
                </div>
                <p className="text-slate-400 text-sm mt-1">No SKUs are critically low on stock.</p>
              </div>
            );
            
            return (
              <div className="bg-rose-900/20 border border-rose-500/30 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-rose-400" />
                    <span className="text-rose-400 font-semibold">Critical Stock Alert: {criticalItems.length} SKUs</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-500 text-xs border-b border-slate-700">
                        <th className="text-left pb-2">SKU</th>
                        <th className="text-right pb-2">Stock</th>
                        <th className="text-right pb-2">Velocity/wk</th>
                        <th className="text-right pb-2">Days Left</th>
                        <th className="text-left pb-2 pl-3">Incoming Production</th>
                        <th className="text-left pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incomingForCritical.sort((a, b) => a.daysOfSupply - b.daysOfSupply).slice(0, 10).map(item => {
                        const willArrive = item.incoming?.expectedDate ? Math.ceil((new Date(item.incoming.expectedDate) - new Date()) / (1000 * 60 * 60 * 24)) : null;
                        const willStockOut = willArrive !== null && willArrive > item.daysOfSupply;
                        return (
                          <tr key={item.sku} className="border-t border-slate-700/50">
                            <td className="py-2 text-white font-mono">{item.sku}</td>
                            <td className="py-2 text-right text-white">{formatNumber(item.totalQty)}</td>
                            <td className="py-2 text-right text-slate-400">{item.weeklyVel.toFixed(1)}</td>
                            <td className="py-2 text-right text-rose-400 font-bold">{item.daysOfSupply}</td>
                            <td className="py-2 pl-3">
                              {item.incoming ? (
                                <span className="text-cyan-400">
                                  {formatNumber(item.incoming.quantity)} units in {willArrive}d
                                </span>
                              ) : (
                                <span className="text-slate-500">None scheduled</span>
                              )}
                            </td>
                            <td className="py-2">
                              {item.incoming ? (
                                willStockOut ? (
                                  <span className="text-xs bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded">⚠️ Will stockout</span>
                                ) : (
                                  <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">✓ Covered</span>
                                )
                              ) : (
                                <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">Order now</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
        
        {/* Production Pipeline / Purchase Orders Section */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Truck className="w-6 h-6 text-cyan-400" />
                Purchase Orders & Production
              </h2>
              <p className="text-slate-400 text-sm">Track open POs, payment terms, and incoming inventory</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { 
                setProductionForm({ 
                  sku: '', productName: '', quantity: '', expectedDate: '', notes: '',
                  poNumber: '', vendor: '', unitCost: '', paymentTerms: '50-50', depositPercent: 50,
                  depositPaid: false, depositPaidDate: '', balancePaid: false, balancePaidDate: '', shipments: [],
                  depositNetDays: 0, balanceNetDays: 0, cureTimeDays: 0, lineItems: []
                }); 
                setEditingProduction(null); 
                setShowAddProduction(true); 
              }} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm text-white flex items-center gap-2">
                <Plus className="w-4 h-4" />Add Purchase Order
              </button>
            </div>
          </div>
          
          {/* AI Extract from File */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 mb-4">
            <p className="text-slate-300 text-sm mb-3">📄 Have a production order or PO? Upload it and AI will extract the data:</p>
            <div className="flex items-center gap-3">
              <label className={`flex-1 border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all ${productionFile ? 'border-cyan-500/50 bg-cyan-950/20' : 'border-slate-600 hover:border-slate-500'}`}>
                <input type="file" accept=".csv,.xlsx,.xls,.pdf,.txt" onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    setProductionFileName(file.name);
                    const reader = new FileReader();
                    reader.onload = (ev) => setProductionFile(ev.target.result);
                    reader.readAsText(file);
                  }
                }} className="hidden" />
                <div className="flex items-center justify-center gap-2">
                  {productionFile ? <Check className="w-5 h-5 text-cyan-400" /> : <Upload className="w-5 h-5 text-slate-400" />}
                  <span className={productionFile ? 'text-cyan-400' : 'text-slate-400'}>{productionFile ? productionFileName : 'Upload PO, invoice, or CSV'}</span>
                </div>
              </label>
              {productionFile && (
                <button 
                  onClick={async () => {
                    if (!productionFile) return;
                    setExtractingProduction(true);
                    try {
                      const text = await callAI(`Extract production/manufacturing order data from this document. Return ONLY a JSON array with objects containing: sku, productName, quantity (number), expectedDate (YYYY-MM-DD format), notes (optional). If you can't find a date, use empty string. If you can't find SKU, use the product name. Here's the document:\n\n${productionFile}`);
                      
                      // Try to parse JSON from the response
                      const jsonMatch = text.match(/\[[\s\S]*\]/);
                      if (jsonMatch) {
                        const extracted = JSON.parse(jsonMatch[0]);
                        if (Array.isArray(extracted) && extracted.length > 0) {
                          // Add each extracted item to pipeline
                          const newItems = extracted.map(item => ({
                            id: Date.now() + Math.random(),
                            sku: item.sku || '',
                            productName: item.productName || item.product_name || item.name || '',
                            quantity: parseInt(item.quantity) || 0,
                            expectedDate: item.expectedDate || item.expected_date || item.date || '',
                            notes: item.notes || '',
                            status: 'pending',
                            createdAt: new Date().toISOString()
                          }));
                          setProductionPipeline(prev => [...prev, ...newItems]);
                          setToast({ message: `Extracted ${newItems.length} production items`, type: 'success' });
                          setProductionFile(null);
                          setProductionFileName('');
                        } else {
                          setToast({ message: 'No production data found in file', type: 'error' });
                        }
                      } else {
                        setToast({ message: 'Could not parse production data', type: 'error' });
                      }
                    } catch (err) {
                      setToast({ message: 'Error extracting data: ' + err.message, type: 'error' });
                    }
                    setExtractingProduction(false);
                  }}
                  disabled={extractingProduction}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 rounded-lg text-sm text-white flex items-center gap-2"
                >
                  {extractingProduction ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {extractingProduction ? 'Extracting...' : 'Extract with AI'}
                </button>
              )}
            </div>
          </div>
          
          {/* Add/Edit Production Modal */}
          {showAddProduction && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-2xl w-full my-8">
                <h3 className="text-lg font-semibold text-white mb-4">{editingProduction ? 'Edit Purchase Order' : 'Add Purchase Order'}</h3>
                
                {/* Product Preset - Quick Fill */}
                <div className="bg-gradient-to-r from-cyan-900/30 to-blue-900/30 rounded-xl p-4 mb-4 border border-cyan-500/30">
                  <label className="block text-sm text-cyan-400 mb-2">Quick Fill — Product Type</label>
                  <select 
                    onChange={(e) => {
                      const preset = e.target.value;
                      if (preset === 'lip-balm') {
                        setProductionForm(p => ({ 
                          ...p, 
                          paymentTerms: '30-70-ship', 
                          depositPercent: 30,
                          depositNetDays: 30,
                          balanceNetDays: 60,
                          cureTimeDays: 0,
                        }));
                      } else if (preset === 'tallow-balm' || preset === 'deodorant') {
                        setProductionForm(p => ({ 
                          ...p, 
                          paymentTerms: '50-50', 
                          depositPercent: 50,
                          depositNetDays: 0,
                          balanceNetDays: 0,
                          cureTimeDays: 0,
                        }));
                      } else if (preset === 'soap') {
                        setProductionForm(p => ({ 
                          ...p, 
                          paymentTerms: '50-50', 
                          depositPercent: 50,
                          depositNetDays: 0,
                          balanceNetDays: 0,
                          cureTimeDays: 21, // 3 weeks default cure time
                        }));
                      }
                    }}
                    className="w-full bg-slate-800 border border-cyan-500/50 rounded-lg px-3 py-2 text-white"
                    defaultValue=""
                  >
                    <option value="" disabled>Select product type to auto-fill terms...</option>
                    <option value="lip-balm">🧴 Lip Balm — 30% deposit (Net 30), 70% on ship (Net 60)</option>
                    <option value="tallow-balm">🫙 Tallow Balm — 50/50, due immediately</option>
                    <option value="deodorant">🧴 Deodorant — 50/50, due immediately</option>
                    <option value="soap">🧼 Soap — 50/50, due immediately + 3 week cure time</option>
                  </select>
                </div>
                
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">PO Number</label>
                    <input type="text" value={productionForm.poNumber || ''} onChange={(e) => setProductionForm(p => ({ ...p, poNumber: e.target.value }))} placeholder="PO-2025-001" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Vendor/Manufacturer</label>
                    <input type="text" value={productionForm.vendor || ''} onChange={(e) => setProductionForm(p => ({ ...p, vendor: e.target.value }))} placeholder="Manufacturer name" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white" />
                  </div>
                </div>
                
                {/* Line Items - Multiple SKUs */}
                <div className="bg-slate-900/50 rounded-xl p-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-white font-medium">Line Items</h4>
                    <button
                      type="button"
                      onClick={() => setProductionForm(p => ({
                        ...p,
                        lineItems: [...(p.lineItems || []), { sku: '', productName: '', quantity: '', unitCost: '' }]
                      }))}
                      className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-white text-sm flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" /> Add Item
                    </button>
                  </div>
                  
                  {/* Show legacy single item if no line items yet */}
                  {(!productionForm.lineItems || productionForm.lineItems.length === 0) && (
                    <div className="grid grid-cols-12 gap-2 mb-2">
                      <div className="col-span-2">
                        <label className="block text-xs text-slate-500 mb-1">SKU</label>
                        <input 
                          type="text" 
                          value={productionForm.sku} 
                          onChange={(e) => setProductionForm(p => ({ ...p, sku: e.target.value }))} 
                          placeholder="SKU" 
                          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-white text-sm" 
                        />
                      </div>
                      <div className="col-span-4">
                        <label className="block text-xs text-slate-500 mb-1">Product Name</label>
                        <input 
                          type="text" 
                          value={productionForm.productName} 
                          onChange={(e) => setProductionForm(p => ({ ...p, productName: e.target.value }))} 
                          placeholder="Product description" 
                          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-white text-sm" 
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs text-slate-500 mb-1">Qty</label>
                        <input 
                          type="number" 
                          value={productionForm.quantity} 
                          onChange={(e) => setProductionForm(p => ({ ...p, quantity: e.target.value }))} 
                          placeholder="1000" 
                          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-white text-sm" 
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs text-slate-500 mb-1">Unit Cost</label>
                        <input 
                          type="number" 
                          step="0.01"
                          value={productionForm.unitCost} 
                          onChange={(e) => setProductionForm(p => ({ ...p, unitCost: e.target.value }))} 
                          placeholder="0.45" 
                          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-white text-sm" 
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs text-slate-500 mb-1">Line Total</label>
                        <div className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-emerald-400 text-sm">
                          {formatCurrency((parseFloat(productionForm.quantity) || 0) * (parseFloat(productionForm.unitCost) || 0))}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Line items list */}
                  {(productionForm.lineItems || []).map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 mb-2 items-end">
                      <div className="col-span-2">
                        {idx === 0 && <label className="block text-xs text-slate-500 mb-1">SKU</label>}
                        <input 
                          type="text" 
                          value={item.sku} 
                          onChange={(e) => {
                            const newItems = [...productionForm.lineItems];
                            newItems[idx] = { ...newItems[idx], sku: e.target.value };
                            setProductionForm(p => ({ ...p, lineItems: newItems }));
                          }} 
                          placeholder="SKU" 
                          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-white text-sm" 
                        />
                      </div>
                      <div className="col-span-3">
                        {idx === 0 && <label className="block text-xs text-slate-500 mb-1">Product Name</label>}
                        <input 
                          type="text" 
                          value={item.productName} 
                          onChange={(e) => {
                            const newItems = [...productionForm.lineItems];
                            newItems[idx] = { ...newItems[idx], productName: e.target.value };
                            setProductionForm(p => ({ ...p, lineItems: newItems }));
                          }} 
                          placeholder="Product" 
                          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-white text-sm" 
                        />
                      </div>
                      <div className="col-span-2">
                        {idx === 0 && <label className="block text-xs text-slate-500 mb-1">Qty</label>}
                        <input 
                          type="number" 
                          value={item.quantity} 
                          onChange={(e) => {
                            const newItems = [...productionForm.lineItems];
                            newItems[idx] = { ...newItems[idx], quantity: e.target.value };
                            setProductionForm(p => ({ ...p, lineItems: newItems }));
                          }} 
                          placeholder="1000" 
                          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-white text-sm" 
                        />
                      </div>
                      <div className="col-span-2">
                        {idx === 0 && <label className="block text-xs text-slate-500 mb-1">Unit Cost</label>}
                        <input 
                          type="number" 
                          step="0.01"
                          value={item.unitCost} 
                          onChange={(e) => {
                            const newItems = [...productionForm.lineItems];
                            newItems[idx] = { ...newItems[idx], unitCost: e.target.value };
                            setProductionForm(p => ({ ...p, lineItems: newItems }));
                          }} 
                          placeholder="0.45" 
                          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-white text-sm" 
                        />
                      </div>
                      <div className="col-span-2">
                        {idx === 0 && <label className="block text-xs text-slate-500 mb-1">Line Total</label>}
                        <div className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-emerald-400 text-sm">
                          {formatCurrency((parseFloat(item.quantity) || 0) * (parseFloat(item.unitCost) || 0))}
                        </div>
                      </div>
                      <div className="col-span-1">
                        {idx === 0 && <label className="block text-xs text-slate-500 mb-1">&nbsp;</label>}
                        <button
                          type="button"
                          onClick={() => {
                            const newItems = productionForm.lineItems.filter((_, i) => i !== idx);
                            setProductionForm(p => ({ ...p, lineItems: newItems }));
                          }}
                          className="p-1.5 text-slate-500 hover:text-rose-400"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  {/* Total */}
                  <div className="flex justify-end mt-3 pt-3 border-t border-slate-700">
                    <div className="text-right">
                      <span className="text-slate-400 text-sm mr-4">Total PO Value:</span>
                      <span className="text-emerald-400 font-bold text-lg">
                        {formatCurrency(
                          ((productionForm.lineItems || []).length > 0 
                            ? productionForm.lineItems.reduce((sum, item) => sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.unitCost) || 0)), 0)
                            : (parseFloat(productionForm.quantity) || 0) * (parseFloat(productionForm.unitCost) || 0)
                          )
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Payment Terms */}
                <div className="bg-slate-900/50 rounded-xl p-4 mb-4">
                  <h4 className="text-white font-medium mb-3">Payment Terms</h4>
                  <div className="grid grid-cols-3 gap-4 mb-3">
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Payment Structure</label>
                      <select 
                        value={productionForm.paymentTerms || '50-50'} 
                        onChange={(e) => {
                          const terms = e.target.value;
                          let deposit = 50;
                          if (terms === '30-70-ship') deposit = 30;
                          else if (terms === 'net30') deposit = 0;
                          else if (terms === '100-upfront') deposit = 100;
                          setProductionForm(p => ({ ...p, paymentTerms: terms, depositPercent: deposit }));
                        }}
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white"
                      >
                        <option value="30-70-ship">30% Deposit, 70% As Ships</option>
                        <option value="50-50">50% Deposit, 50% At Completion</option>
                        <option value="net30">Net 30 (Pay on Delivery)</option>
                        <option value="100-upfront">100% Upfront</option>
                        <option value="custom">Custom Terms</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Deposit %</label>
                      <input 
                        type="number" 
                        value={productionForm.depositPercent || 50} 
                        onChange={(e) => setProductionForm(p => ({ ...p, depositPercent: parseInt(e.target.value) || 0 }))} 
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white"
                        disabled={productionForm.paymentTerms !== 'custom'}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Cure Time (days)</label>
                      <input 
                        type="number" 
                        value={productionForm.cureTimeDays || 0} 
                        onChange={(e) => setProductionForm(p => ({ ...p, cureTimeDays: parseInt(e.target.value) || 0 }))} 
                        placeholder="0"
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white"
                      />
                      <p className="text-slate-500 text-xs mt-1">For soaps needing cure time</p>
                    </div>
                  </div>
                  
                  {/* Net Terms Row */}
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Deposit Due (Net Days)</label>
                      <input 
                        type="number" 
                        value={productionForm.depositNetDays || 0} 
                        onChange={(e) => setProductionForm(p => ({ ...p, depositNetDays: parseInt(e.target.value) || 0 }))} 
                        placeholder="0 = immediately"
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white"
                      />
                      <p className="text-slate-500 text-xs mt-1">{productionForm.depositNetDays > 0 ? `Due ${productionForm.depositNetDays} days after PO` : 'Due immediately'}</p>
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Balance Due (Net Days)</label>
                      <input 
                        type="number" 
                        value={productionForm.balanceNetDays || 0} 
                        onChange={(e) => setProductionForm(p => ({ ...p, balanceNetDays: parseInt(e.target.value) || 0 }))} 
                        placeholder="0 = on shipment"
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white"
                      />
                      <p className="text-slate-500 text-xs mt-1">{productionForm.balanceNetDays > 0 ? `Due ${productionForm.balanceNetDays} days after shipment` : 'Due on shipment/completion'}</p>
                    </div>
                  </div>
                  
                  {/* Payment Status */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-800 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-slate-400 text-sm">Deposit ({productionForm.depositPercent || 50}%)</span>
                        <span className="text-amber-400 font-medium">
                          {formatCurrency((parseFloat(productionForm.quantity) || 0) * (parseFloat(productionForm.unitCost) || 0) * ((productionForm.depositPercent || 50) / 100))}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={productionForm.depositPaid || false}
                            onChange={(e) => setProductionForm(p => ({ ...p, depositPaid: e.target.checked, depositPaidDate: e.target.checked ? new Date().toISOString().split('T')[0] : '' }))}
                            className="w-4 h-4 rounded"
                          />
                          <span className="text-white text-sm">Paid</span>
                        </label>
                        {productionForm.depositPaid && (
                          <input 
                            type="date" 
                            value={productionForm.depositPaidDate || ''} 
                            onChange={(e) => setProductionForm(p => ({ ...p, depositPaidDate: e.target.value }))}
                            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm flex-1"
                          />
                        )}
                      </div>
                    </div>
                    <div className="bg-slate-800 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-slate-400 text-sm">Balance ({100 - (productionForm.depositPercent || 50)}%)</span>
                        <span className="text-rose-400 font-medium">
                          {formatCurrency((parseFloat(productionForm.quantity) || 0) * (parseFloat(productionForm.unitCost) || 0) * ((100 - (productionForm.depositPercent || 50)) / 100))}
                        </span>
                      </div>
                      {productionForm.paymentTerms !== '30-70-ship' ? (
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={productionForm.balancePaid || false}
                              onChange={(e) => setProductionForm(p => ({ ...p, balancePaid: e.target.checked, balancePaidDate: e.target.checked ? new Date().toISOString().split('T')[0] : '' }))}
                              className="w-4 h-4 rounded"
                            />
                            <span className="text-white text-sm">Paid</span>
                          </label>
                          {productionForm.balancePaid && (
                            <input 
                              type="date" 
                              value={productionForm.balancePaidDate || ''} 
                              onChange={(e) => setProductionForm(p => ({ ...p, balancePaidDate: e.target.value }))}
                              className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm flex-1"
                            />
                          )}
                        </div>
                      ) : (
                        <p className="text-slate-500 text-xs">Paid as units ship (tracked via shipments)</p>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Expected Date & Notes */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Expected Completion Date</label>
                    <input type="date" value={productionForm.expectedDate} onChange={(e) => setProductionForm(p => ({ ...p, expectedDate: e.target.value }))} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Notes</label>
                    <input type="text" value={productionForm.notes} onChange={(e) => setProductionForm(p => ({ ...p, notes: e.target.value }))} placeholder="Additional notes..." className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white" />
                  </div>
                </div>
                
                <div className="flex gap-3 mt-6">
                  <button onClick={() => {
                    // Validate: need either single item or line items
                    const hasLineItems = productionForm.lineItems && productionForm.lineItems.length > 0;
                    const hasSingleItem = productionForm.sku || productionForm.productName;
                    
                    if (!hasLineItems && !hasSingleItem) {
                      setToast({ message: 'Add at least one item (SKU or Product Name)', type: 'error' });
                      return;
                    }
                    
                    // Calculate total from line items or single item
                    let totalValue = 0;
                    let totalQty = 0;
                    let lineItems = [];
                    
                    if (hasLineItems) {
                      lineItems = productionForm.lineItems.map(item => ({
                        sku: item.sku,
                        productName: item.productName,
                        quantity: parseInt(item.quantity) || 0,
                        unitCost: parseFloat(item.unitCost) || 0,
                      }));
                      totalValue = lineItems.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);
                      totalQty = lineItems.reduce((sum, item) => sum + item.quantity, 0);
                    } else {
                      totalQty = parseInt(productionForm.quantity) || 0;
                      totalValue = totalQty * (parseFloat(productionForm.unitCost) || 0);
                    }
                    
                    const poData = {
                      ...productionForm,
                      quantity: hasLineItems ? totalQty : (parseInt(productionForm.quantity) || 0),
                      unitCost: hasLineItems ? (totalQty > 0 ? totalValue / totalQty : 0) : (parseFloat(productionForm.unitCost) || 0),
                      depositPercent: parseInt(productionForm.depositPercent) || 50,
                      totalValue,
                      lineItems: hasLineItems ? lineItems : [],
                      shipments: productionForm.shipments || [],
                    };
                    if (editingProduction) {
                      setProductionPipeline(prev => prev.map(p => p.id === editingProduction ? { ...p, ...poData } : p));
                      setToast({ message: 'Purchase Order updated', type: 'success' });
                    } else {
                      const newItem = {
                        id: Date.now(),
                        ...poData,
                        status: 'pending',
                        createdAt: new Date().toISOString()
                      };
                      setProductionPipeline(prev => [...prev, newItem]);
                      setToast({ message: 'Purchase Order added', type: 'success' });
                    }
                    setShowAddProduction(false);
                    setEditingProduction(null);
                  }} className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-2 rounded-lg">
                    {editingProduction ? 'Save Changes' : 'Add Purchase Order'}
                  </button>
                  <button onClick={() => { setShowAddProduction(false); setEditingProduction(null); }} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-lg">Cancel</button>
                </div>
              </div>
            </div>
          )}
          
          {/* Production Pipeline Table */}
          {productionPipeline.length > 0 ? (
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 overflow-hidden">
              {/* Cash Flow Summary */}
              {(() => {
                const totalPOValue = productionPipeline.reduce((s, p) => s + (p.totalValue || (p.quantity * (p.unitCost || 0))), 0);
                const totalDeposits = productionPipeline.reduce((s, p) => {
                  const value = p.totalValue || (p.quantity * (p.unitCost || 0));
                  const depositAmt = value * ((p.depositPercent || 50) / 100);
                  return s + (p.depositPaid ? depositAmt : 0);
                }, 0);
                const totalBalancePaid = productionPipeline.reduce((s, p) => {
                  if (p.paymentTerms === '30-70-ship') {
                    // For rolling payments, sum shipment payments
                    const shippedUnits = (p.shipments || []).reduce((su, sh) => su + (sh.units || 0), 0);
                    const shippedValue = shippedUnits * (p.unitCost || 0);
                    const balancePercent = (100 - (p.depositPercent || 30)) / 100;
                    return s + (shippedValue * balancePercent);
                  } else {
                    const value = p.totalValue || (p.quantity * (p.unitCost || 0));
                    const balanceAmt = value * ((100 - (p.depositPercent || 50)) / 100);
                    return s + (p.balancePaid ? balanceAmt : 0);
                  }
                }, 0);
                const totalPaid = totalDeposits + totalBalancePaid;
                const totalOutstanding = totalPOValue - totalPaid;
                const totalUnitsOrdered = productionPipeline.reduce((s, p) => s + (p.quantity || 0), 0);
                const totalUnitsReceived = productionPipeline.reduce((s, p) => {
                  if (p.status === 'received') return s + (p.quantity || 0);
                  return s + (p.shipments || []).reduce((su, sh) => su + (sh.units || 0), 0);
                }, 0);
                
                return (
                  <div className="bg-slate-900/50 p-4 border-b border-slate-700">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                      <div>
                        <p className="text-slate-500 text-xs">Total PO Value</p>
                        <p className="text-white font-bold">{formatCurrency(totalPOValue)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">Paid to Date</p>
                        <p className="text-emerald-400 font-bold">{formatCurrency(totalPaid)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">Outstanding</p>
                        <p className="text-rose-400 font-bold">{formatCurrency(totalOutstanding)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">Units Ordered</p>
                        <p className="text-cyan-400 font-bold">{formatNumber(totalUnitsOrdered)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">Units Received</p>
                        <p className="text-white font-bold">{formatNumber(totalUnitsReceived)}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}
              
              <table className="w-full">
                <thead className="bg-slate-900/50">
                  <tr>
                    <th className="text-left px-4 py-3 text-slate-400 text-xs uppercase">PO / Product</th>
                    <th className="text-right px-4 py-3 text-slate-400 text-xs uppercase">Qty</th>
                    <th className="text-right px-4 py-3 text-slate-400 text-xs uppercase">Unit Cost</th>
                    <th className="text-right px-4 py-3 text-slate-400 text-xs uppercase">Total Value</th>
                    <th className="text-center px-4 py-3 text-slate-400 text-xs uppercase">Payment</th>
                    <th className="text-left px-4 py-3 text-slate-400 text-xs uppercase">Status</th>
                    <th className="text-center px-4 py-3 text-slate-400 text-xs uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {productionPipeline.sort((a, b) => new Date(a.expectedDate || '9999-12-31') - new Date(b.expectedDate || '9999-12-31')).map(item => {
                    const totalValue = item.totalValue || (item.quantity * (item.unitCost || 0));
                    const depositAmt = totalValue * ((item.depositPercent || 50) / 100);
                    const balanceAmt = totalValue - depositAmt;
                    const shippedUnits = (item.shipments || []).reduce((s, sh) => s + (sh.units || 0), 0);
                    const unitsRemaining = item.quantity - shippedUnits;
                    
                    // Calculate payment status
                    let paidAmt = item.depositPaid ? depositAmt : 0;
                    if (item.paymentTerms === '30-70-ship') {
                      paidAmt += shippedUnits * (item.unitCost || 0) * ((100 - (item.depositPercent || 30)) / 100);
                    } else if (item.balancePaid) {
                      paidAmt += balanceAmt;
                    }
                    const paidPercent = totalValue > 0 ? (paidAmt / totalValue * 100) : 0;
                    
                    // Calculate payment due dates based on Net terms
                    const poDate = item.createdAt ? new Date(item.createdAt) : new Date();
                    const depositNetDays = item.depositNetDays || 0;
                    const balanceNetDays = item.balanceNetDays || 0;
                    const depositDueDate = depositNetDays > 0 ? new Date(poDate.getTime() + depositNetDays * 24*60*60*1000) : null;
                    
                    // For balance due date, calculate from last shipment or expected date
                    const lastShipment = item.shipments?.length > 0 ? item.shipments[item.shipments.length - 1] : null;
                    const shipDate = lastShipment ? new Date(lastShipment.date) : (item.expectedDate ? new Date(item.expectedDate) : null);
                    const balanceDueDate = balanceNetDays > 0 && shipDate ? new Date(shipDate.getTime() + balanceNetDays * 24*60*60*1000) : null;
                    
                    // Calculate cure time (for soaps)
                    const cureTimeDays = item.cureTimeDays || 0;
                    let cureEndDate = null;
                    let cureRemaining = null;
                    if (cureTimeDays > 0 && item.status === 'received') {
                      // Assume cure starts when received - use last shipment date or today
                      const receiveDate = lastShipment ? new Date(lastShipment.date) : new Date();
                      cureEndDate = new Date(receiveDate.getTime() + cureTimeDays * 24*60*60*1000);
                      cureRemaining = Math.ceil((cureEndDate - new Date()) / (24*60*60*1000));
                    }
                    
                    // Check if deposit is overdue
                    const isDepositOverdue = !item.depositPaid && depositDueDate && new Date() > depositDueDate;
                    const daysUntilDepositDue = depositDueDate && !item.depositPaid ? Math.ceil((depositDueDate - new Date()) / (24*60*60*1000)) : null;
                    
                    return (
                      <tr key={item.id} className="border-t border-slate-700/50 hover:bg-slate-700/20">
                        <td className="px-4 py-3">
                          <div>
                            {/* Show line items if present, otherwise single product */}
                            {item.lineItems && item.lineItems.length > 0 ? (
                              <div>
                                {item.lineItems.map((li, idx) => (
                                  <p key={idx} className="text-white text-sm">
                                    <span className="text-slate-500">{li.sku || '—'}</span>
                                    {li.productName && <span className="ml-2">{li.productName}</span>}
                                    <span className="text-cyan-400 ml-2">×{li.quantity}</span>
                                  </p>
                                ))}
                                {item.lineItems.length > 1 && (
                                  <p className="text-slate-500 text-xs mt-1">{item.lineItems.length} items</p>
                                )}
                              </div>
                            ) : (
                              <p className="text-white font-medium">{item.productName || item.sku || '—'}</p>
                            )}
                            <div className="flex flex-wrap gap-2 mt-1">
                              {item.poNumber && <span className="text-slate-500 text-xs">PO: {item.poNumber}</span>}
                              {item.vendor && <span className="text-slate-500 text-xs">• {item.vendor}</span>}
                              {/* Payment terms badge */}
                              {(depositNetDays > 0 || balanceNetDays > 0) && (
                                <span className="text-amber-400/70 text-xs">
                                  Net {depositNetDays}/{balanceNetDays}
                                </span>
                              )}
                              {/* Cure time badge */}
                              {cureTimeDays > 0 && (
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  cureRemaining !== null 
                                    ? cureRemaining <= 0 
                                      ? 'bg-emerald-500/20 text-emerald-400' 
                                      : 'bg-amber-500/20 text-amber-400'
                                    : 'bg-slate-600 text-slate-400'
                                }`}>
                                  🧼 {cureRemaining !== null 
                                    ? cureRemaining <= 0 
                                      ? 'Cured ✓' 
                                      : `${cureRemaining}d cure left`
                                    : `${cureTimeDays}d cure`}
                                </span>
                              )}
                              {/* Deposit due alert */}
                              {isDepositOverdue && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400">
                                  ⚠️ Deposit overdue!
                                </span>
                              )}
                              {daysUntilDepositDue !== null && daysUntilDepositDue > 0 && daysUntilDepositDue <= 7 && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                                  Deposit due in {daysUntilDepositDue}d
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="text-cyan-400 font-semibold">{formatNumber(item.quantity)}</p>
                          {shippedUnits > 0 && item.status !== 'received' && (
                            <p className="text-slate-500 text-xs">{formatNumber(shippedUnits)} shipped</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-300">{item.unitCost ? formatCurrency(item.unitCost) : '—'}</td>
                        <td className="px-4 py-3 text-right text-white font-medium">{totalValue > 0 ? formatCurrency(totalValue) : '—'}</td>
                        <td className="px-4 py-3">
                          {totalValue > 0 ? (
                            <div className="flex flex-col items-center">
                              <div className="w-full bg-slate-700 rounded-full h-2 mb-1">
                                <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${Math.min(100, paidPercent)}%` }} />
                              </div>
                              <span className="text-xs text-slate-400">{paidPercent.toFixed(0)}% paid</span>
                            </div>
                          ) : (
                            <span className="text-slate-500 text-xs">No cost set</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <select 
                            value={item.status || 'pending'} 
                            onChange={(e) => setProductionPipeline(prev => prev.map(p => p.id === item.id ? { ...p, status: e.target.value } : p))}
                            className={`text-xs px-2 py-1 rounded-lg border-0 ${
                              item.status === 'received' ? 'bg-emerald-500/20 text-emerald-400' :
                              item.status === 'shipped' ? 'bg-blue-500/20 text-blue-400' :
                              item.status === 'in_production' ? 'bg-amber-500/20 text-amber-400' :
                              'bg-slate-700 text-slate-300'
                            }`}
                          >
                            <option value="pending">Pending</option>
                            <option value="in_production">In Production</option>
                            <option value="partial">Partial Ship</option>
                            <option value="shipped">Shipped</option>
                            <option value="received">Received</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {item.paymentTerms === '30-70-ship' && (
                              <button 
                                onClick={() => { setShowAddShipment(item.id); setShipmentForm({ date: new Date().toISOString().split('T')[0], units: '', notes: '' }); }}
                                className="p-1.5 hover:bg-cyan-900/50 rounded text-cyan-400 hover:text-cyan-300"
                                title="Log Shipment"
                              >
                                <Package className="w-4 h-4" />
                              </button>
                            )}
                            <button onClick={() => {
                              setProductionForm({
                                sku: item.sku || '',
                                productName: item.productName || '',
                                quantity: item.quantity?.toString() || '',
                                expectedDate: item.expectedDate || '',
                                notes: item.notes || '',
                                poNumber: item.poNumber || '',
                                vendor: item.vendor || '',
                                unitCost: item.unitCost?.toString() || '',
                                paymentTerms: item.paymentTerms || '50-50',
                                depositPercent: item.depositPercent || 50,
                                depositPaid: item.depositPaid || false,
                                depositPaidDate: item.depositPaidDate || '',
                                balancePaid: item.balancePaid || false,
                                balancePaidDate: item.balancePaidDate || '',
                                shipments: item.shipments || [],
                                depositNetDays: item.depositNetDays || 0,
                                balanceNetDays: item.balanceNetDays || 0,
                                cureTimeDays: item.cureTimeDays || 0,
                                lineItems: item.lineItems || [],
                              });
                              setEditingProduction(item.id);
                              setShowAddProduction(true);
                            }} className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white">
                              <Settings className="w-4 h-4" />
                            </button>
                            <button onClick={() => {
                              setConfirmDialog({
                                show: true,
                                title: 'Delete Purchase Order?',
                                message: `This will remove "${item.name || 'this order'}" from your pipeline. This cannot be undone.`,
                                destructive: true,
                                onConfirm: () => {
                                  setProductionPipeline(prev => prev.filter(p => p.id !== item.id));
                                  setToast({ message: 'Purchase order deleted', type: 'success' });
                                }
                              });
                            }} className="p-1.5 hover:bg-rose-900/50 rounded text-slate-400 hover:text-rose-400">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* Summary */}
              <div className="bg-slate-900/50 px-4 py-3 border-t border-slate-700">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">{productionPipeline.length} purchase orders</span>
                  <span className="text-cyan-400 font-semibold">{formatNumber(productionPipeline.reduce((s, p) => s + (p.quantity || 0), 0))} total units on order</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-800/30 rounded-2xl border border-dashed border-slate-600 p-8 text-center">
              <Truck className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 mb-2">No purchase orders tracked</p>
              <p className="text-slate-500 text-sm">Add open POs to track incoming inventory and cash flow</p>
            </div>
          )}
          
          {/* Add Shipment Modal */}
          {showAddShipment && (() => {
            const po = productionPipeline.find(p => p.id === showAddShipment);
            if (!po) return null;
            const totalShipped = (po.shipments || []).reduce((s, sh) => s + (sh.units || 0), 0);
            const remaining = (po.quantity || 0) - totalShipped;
            const unitCost = po.unitCost || 0;
            const balancePercent = (100 - (po.depositPercent || 30)) / 100;
            
            return (
              <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-md w-full">
                  <h3 className="text-lg font-semibold text-white mb-2">Log Shipment</h3>
                  <p className="text-slate-400 text-sm mb-4">{po.productName || po.sku} — {formatNumber(remaining)} units remaining</p>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Units Received</label>
                      <input 
                        type="number" 
                        value={shipmentForm.units} 
                        onChange={(e) => setShipmentForm(f => ({ ...f, units: e.target.value }))}
                        max={remaining}
                        placeholder={`Max: ${formatNumber(remaining)}`}
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Date Received</label>
                      <input 
                        type="date" 
                        value={shipmentForm.date} 
                        onChange={(e) => setShipmentForm(f => ({ ...f, date: e.target.value }))}
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
                      />
                    </div>
                    <div className="bg-slate-900/50 rounded-lg p-3">
                      <p className="text-slate-400 text-sm mb-1">Payment Due for This Shipment</p>
                      <p className="text-rose-400 font-bold text-lg">
                        {formatCurrency((parseInt(shipmentForm.units) || 0) * unitCost * balancePercent)}
                      </p>
                      <p className="text-slate-500 text-xs">{formatNumber(shipmentForm.units || 0)} units × {formatCurrency(unitCost)} × {(balancePercent * 100).toFixed(0)}%</p>
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Notes (optional)</label>
                      <input 
                        type="text" 
                        value={shipmentForm.notes} 
                        onChange={(e) => setShipmentForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="Shipment tracking, notes..."
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
                      />
                    </div>
                  </div>
                  
                  <div className="flex gap-3 mt-6">
                    <button 
                      onClick={() => {
                        const units = parseInt(shipmentForm.units) || 0;
                        if (units <= 0) {
                          setToast({ message: 'Enter units received', type: 'error' });
                          return;
                        }
                        if (units > remaining) {
                          setToast({ message: `Cannot exceed ${formatNumber(remaining)} remaining units`, type: 'error' });
                          return;
                        }
                        
                        const newShipment = {
                          id: Date.now(),
                          date: shipmentForm.date || new Date().toISOString().split('T')[0],
                          units: units,
                          amountPaid: units * unitCost * balancePercent,
                          notes: shipmentForm.notes,
                        };
                        
                        setProductionPipeline(prev => prev.map(p => {
                          if (p.id !== showAddShipment) return p;
                          const updatedShipments = [...(p.shipments || []), newShipment];
                          const totalShippedNow = updatedShipments.reduce((s, sh) => s + (sh.units || 0), 0);
                          const newStatus = totalShippedNow >= p.quantity ? 'received' : 'partial';
                          return { ...p, shipments: updatedShipments, status: newStatus };
                        }));
                        
                        setToast({ message: `Logged ${formatNumber(units)} units received`, type: 'success' });
                        setShowAddShipment(null);
                        setShipmentForm({ date: '', units: '', notes: '' });
                      }}
                      className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-2 rounded-lg"
                    >
                      Log Shipment
                    </button>
                    <button 
                      onClick={() => { setShowAddShipment(null); setShipmentForm({ date: '', units: '', notes: '' }); }}
                      className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
          
          {/* Inventory Planning Section */}
          {productionPipeline.length > 0 && (
            <div className="bg-gradient-to-r from-cyan-900/30 to-blue-900/30 rounded-xl border border-cyan-500/30 p-5 mt-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Brain className="w-5 h-5 text-cyan-400" />
                Inventory Planning & Reorder Timing
              </h3>
              
              {(() => {
                // Calculate velocity for SKUs in POs
                const sortedWeeks = Object.keys(allWeeksData).sort().slice(-8);
                const skuVelocity = {};
                
                sortedWeeks.forEach(w => {
                  const shopify = allWeeksData[w]?.shopify?.skuData || [];
                  const amazon = allWeeksData[w]?.amazon?.skuData || [];
                  [...shopify, ...amazon].forEach(s => {
                    const sku = s.sku || s.msku;
                    if (!skuVelocity[sku]) skuVelocity[sku] = [];
                    skuVelocity[sku].push(s.unitsSold || s.units || 0);
                  });
                });
                
                // Get current inventory
                const latestInvKey = Object.keys(invHistory).sort().reverse()[0];
                const currentInv = latestInvKey ? (invHistory[latestInvKey]?.items || []) : [];
                const invBySku = {};
                currentInv.forEach(item => { invBySku[item.sku] = item.totalQty || 0; });
                
                // Calculate for each PO's SKU
                const poAnalysis = productionPipeline.filter(po => po.status !== 'received').map(po => {
                  const sku = po.sku;
                  const weeklyVel = skuVelocity[sku]?.length > 0 
                    ? skuVelocity[sku].reduce((s, u) => s + u, 0) / skuVelocity[sku].length 
                    : 0;
                  const currentStock = invBySku[sku] || 0;
                  const totalShipped = (po.shipments || []).reduce((s, sh) => s + (sh.units || 0), 0);
                  const incomingFromPO = (po.quantity || 0) - totalShipped;
                  const totalAvailable = currentStock + incomingFromPO;
                  const weeksOfSupply = weeklyVel > 0 ? totalAvailable / weeklyVel : Infinity;
                  const monthsOfSupply = weeksOfSupply / 4.33;
                  
                  // Calculate when to reorder for 6 months coverage
                  const targetMonths = 6;
                  const targetUnits = weeklyVel * 4.33 * targetMonths;
                  const unitsNeeded = Math.max(0, targetUnits - totalAvailable);
                  
                  return {
                    ...po,
                    weeklyVel,
                    currentStock,
                    incomingFromPO,
                    totalAvailable,
                    weeksOfSupply,
                    monthsOfSupply,
                    targetUnits,
                    unitsNeeded,
                  };
                });
                
                return (
                  <div className="space-y-4">
                    {poAnalysis.map(po => (
                      <div key={po.id} className="bg-slate-800/50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="text-white font-medium">{po.productName || po.sku}</p>
                            <p className="text-slate-500 text-xs">Velocity: {formatNumber(Math.round(po.weeklyVel))}/week • {formatNumber(Math.round(po.weeklyVel * 4.33))}/month</p>
                          </div>
                          <div className={`px-3 py-1 rounded-lg text-sm font-medium ${
                            po.monthsOfSupply >= 6 ? 'bg-emerald-500/20 text-emerald-400' :
                            po.monthsOfSupply >= 3 ? 'bg-amber-500/20 text-amber-400' :
                            'bg-rose-500/20 text-rose-400'
                          }`}>
                            {po.monthsOfSupply === Infinity ? '∞' : po.monthsOfSupply.toFixed(1)} months supply
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-4 gap-3 text-sm">
                          <div>
                            <p className="text-slate-500 text-xs">Current Stock</p>
                            <p className="text-white font-medium">{formatNumber(po.currentStock)}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs">Incoming (PO)</p>
                            <p className="text-cyan-400 font-medium">{formatNumber(po.incomingFromPO)}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs">Total Available</p>
                            <p className="text-white font-medium">{formatNumber(po.totalAvailable)}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs">Need for 6mo</p>
                            <p className={`font-medium ${po.unitsNeeded > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                              {po.unitsNeeded > 0 ? formatNumber(Math.round(po.unitsNeeded)) : '✓ Covered'}
                            </p>
                          </div>
                        </div>
                        
                        {po.unitsNeeded > 0 && po.unitCost > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-700">
                            <p className="text-slate-400 text-sm">
                              💡 <strong>Suggested Reorder:</strong> {formatNumber(Math.ceil(po.unitsNeeded / 1000) * 1000)} units 
                              @ {formatCurrency(po.unitCost)}/unit = <span className="text-amber-400 font-medium">{formatCurrency(Math.ceil(po.unitsNeeded / 1000) * 1000 * po.unitCost)}</span> PO value
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                    
                    {poAnalysis.length === 0 && (
                      <p className="text-slate-400 text-center py-4">All POs are fully received. Add new POs to see inventory planning.</p>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InventoryView;
