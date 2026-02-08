import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  AlertCircle, AlertTriangle, ArrowDown, ArrowDownRight, ArrowUp, ArrowUpRight, Award, BarChart3, Boxes, Brain, Calendar, CalendarRange, Check, CheckCircle, ChevronDown, ChevronRight, Clock, Database, DollarSign, Download, Eye, EyeOff, FileDown, FileText, Filter, Grid, HelpCircle, Layers, Link, Loader2, Move, Package, Plus, RefreshCw, Settings, Store, Sun, Target, TrendingDown, TrendingUp, Upload, Zap
} from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/format';
import { formatDateKey } from '../../utils/date';
import { deriveWeeksFromDays } from '../../utils/weekly';
import { getNextDueDate } from '../../utils/salesTax';
import { US_STATES_TAX_INFO } from '../../utils/taxData';
import NavTabs from '../ui/NavTabs';
import { SkeletonKPIRow, SkeletonChart, SkeletonTable } from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import { PrintButton, printDailySummary, printProfitability } from '../ui/PrintView';

const DashboardView = ({
  activeStoreId,
  adSpend,
  aggregateDailyToWeekly,
  aiForecastLoading,
  aiForecasts,
  allDaysData,
  allPeriodsData,
  allWeeksData,
  amazonForecasts,
  appSettings,
  bankingData,
  calendarMonth,
  comparisonLabel,
  current,
  dashboardRange,
  dataStatus,
  DEFAULT_DASHBOARD_WIDGETS,
  dragOverWidgetId,
  draggedWidgetId,
  exportAll,
  forecastAlerts,
  generateAIForecasts,
  generateForecast,
  get3PLForWeek,
  getProfit,
  globalModals,
  goals,
  hasCogs,
  hasDailySalesData,
  invHistory,
  invoices,
  lastBackupDate,
  navDropdown,
  periodLabel,
  profitChange,
  revenueChange,
  salesTaxConfig,
  savedCogs,
  savedProductNames,
  session,
  setAnalyticsTab,
  setCalendarMonth,
  setDashboardRange,
  setDragOverWidgetId,
  setDraggedWidgetId,
  setEditingWidgets,
  setNavDropdown,
  setSelectedDay,
  setSelectedInvDate,
  setSelectedPeriod,
  setSelectedWeek,
  setShowCogsManager,
  setShowExportModal,
  setShowForecast,
  setShowGoalsModal,
  setShowInvoiceModal,
  setShowPdfExport,
  setShowProductCatalog,
  setShowStoreModal,
  setShowStoreSelector,
  setShowUploadHelp,
  setStoreName,
  setToast,
  setTrendsTab,
  setUploadTab,
  setView,
  setViewingDayDetails,
  setWeekEnding,
  setWidgetConfig,
  showStoreSelector,
  storeLogo,
  storeName,
  stores,
  supabase,
  switchStore,
  threeplLedger,
  usingDailyData,
  usingPeriodData,
  view,
  widgetConfig,
  runAutoSync,
  autoSyncStatus,
  dataLoading,
}) => {
    const hasData = Object.keys(allWeeksData).length > 0 || Object.keys(allPeriodsData).length > 0 || Object.keys(allDaysData).length > 0;
    const sortedWeeks = Object.keys(allWeeksData).filter(w => (allWeeksData[w]?.total?.revenue || 0) > 0).sort();

    // Get alerts
    const alerts = [];
    if (!hasCogs) alerts.push({ type: 'warning', text: 'Set up COGS to track profitability accurately' });
    // Weekly goal tracking is now handled by the progress bar widget instead of alerts
    // Inventory alerts are handled by NotificationCenter with proper logic
    
    // Check upcoming invoices/bills
    const upcomingBills = invoices.filter(i => !i.paid);
    const overdueBills = upcomingBills.filter(i => new Date(i.dueDate) < new Date());
    const dueSoonBills = upcomingBills.filter(i => {
      const daysUntil = Math.ceil((new Date(i.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
      return daysUntil >= 0 && daysUntil <= 7;
    });
    if (overdueBills.length > 0) {
      const total = overdueBills.reduce((s, i) => s + i.amount, 0);
      alerts.push({ type: 'critical', text: `${overdueBills.length} overdue bills totaling ${formatCurrency(total)}`, link: 'invoices' });
    } else if (dueSoonBills.length > 0) {
      const total = dueSoonBills.reduce((s, i) => s + i.amount, 0);
      alerts.push({ type: 'warning', text: `${dueSoonBills.length} bills due within 7 days (${formatCurrency(total)})`, link: 'invoices' });
    }
    
    // Check sales tax deadlines
    if (appSettings.alertSalesTaxEnabled) {
      const now = new Date();
      const alertDays = appSettings.alertSalesTaxDays || 7;
      const alertThreshold = new Date(now.getTime() + alertDays * 24 * 60 * 60 * 1000);
      
      Object.entries(salesTaxConfig.nexusStates || {}).forEach(([stateCode, config]) => {
        if (!config.hasNexus) return;
        const nextDue = getNextDueDate(config.frequency || 'monthly', stateCode);
        const stateName = US_STATES_TAX_INFO[stateCode]?.name || stateCode;
        
        if (nextDue < now) {
          alerts.push({ type: 'critical', text: `${stateName} sales tax filing is OVERDUE!`, link: 'sales-tax' });
        } else if (nextDue <= alertThreshold) {
          const daysUntil = Math.ceil((nextDue - now) / (1000 * 60 * 60 * 24));
          alerts.push({ type: 'warning', text: `${stateName} sales tax due in ${daysUntil} days`, link: 'sales-tax' });
        }
        
        // Check custom filings too
        (config.customFilings || []).forEach(filing => {
          const filingDue = new Date(now.getFullYear(), filing.dueMonth - 1, filing.dueDay);
          if (filingDue < now) filingDue.setFullYear(filingDue.getFullYear() + 1);
          if (filingDue <= alertThreshold) {
            const daysUntil = Math.ceil((filingDue - now) / (1000 * 60 * 60 * 24));
            if (daysUntil <= 0) {
              alerts.push({ type: 'critical', text: `${stateName} ${filing.name} is OVERDUE!`, link: 'sales-tax' });
            } else {
              alerts.push({ type: 'warning', text: `${stateName} ${filing.name} due in ${daysUntil} days`, link: 'sales-tax' });
            }
          }
        });
      });
    }
    
    // Forecast alerts
    forecastAlerts.filter(a => a.severity === 'warning').forEach(a => {
      alerts.push({ type: 'warning', text: a.message, link: 'forecast' });
    });
    
    // QBO/Banking data stale alert
    if (bankingData.transactions?.length > 0) {
      const lastUpload = bankingData.lastUpload ? new Date(bankingData.lastUpload) : null;
      const today = new Date();
      const isStale = !lastUpload || 
        (today.getTime() - lastUpload.getTime()) > 24 * 60 * 60 * 1000; // More than 24 hours old
      
      if (isStale) {
        const daysSince = lastUpload 
          ? Math.floor((today.getTime() - lastUpload.getTime()) / (24 * 60 * 60 * 1000))
          : null;
        alerts.push({ 
          type: 'warning', 
          text: daysSince 
            ? `QBO data is ${daysSince} day${daysSince !== 1 ? 's' : ''} old - upload latest transactions`
            : 'QBO data needs to be uploaded',
          link: 'banking' 
        });
      }
    }
    
    // Check for weeks with missing 3PL or Ads data - only PAST weeks in current year
    const today = new Date();
    const todayKey = formatDateKey(today);
    const currentYear = today.getFullYear();
    
    const recentWeeks = Object.entries(allWeeksData)
      .filter(([key]) => key.startsWith(`${currentYear}-`) && key <= todayKey) // Only PAST weeks in current year
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 4); // Last 4 past weeks of current year
    
    const weeksMissing3PL = recentWeeks.filter(([key, data]) => {
      // Check weekly shopify.threeplCosts
      const weeklyHas3PL = (data.shopify?.threeplCosts || 0) > 0;
      // Check ledger
      const ledgerData = get3PLForWeek(threeplLedger, key);
      const ledgerHas3PL = ledgerData && (ledgerData.metrics?.totalCost || 0) > 0;
      // Return true if BOTH sources are missing
      return !weeklyHas3PL && !ledgerHas3PL;
    });
    
    const weeksMissingAds = recentWeeks.filter(([key, data]) => {
      // Check weekly data
      const weeklyHasAds = (data.shopify?.metaSpend > 0) || (data.shopify?.googleSpend > 0);
      if (weeklyHasAds) return false;
      
      // Also check if daily data has ads for this week
      const weekEndDate = new Date(key + 'T12:00:00');
      let dailyAdsTotal = 0;
      for (let i = 6; i >= 0; i--) {
        const d = new Date(weekEndDate);
        d.setDate(weekEndDate.getDate() - i);
        const dayKey = d.toISOString().split('T')[0];
        const dayData = allDaysData[dayKey];
        if (dayData) {
          dailyAdsTotal += (dayData.metaSpend || dayData.shopify?.metaSpend || 0);
          dailyAdsTotal += (dayData.googleSpend || dayData.shopify?.googleSpend || 0);
        }
      }
      
      return dailyAdsTotal === 0; // Only missing if BOTH weekly and daily have no ads
    });
    
    // Helper to format week dates
    const formatWeekDates = (weeks) => {
      return weeks.map(([key]) => {
        const endDate = new Date(key + 'T12:00:00');
        const startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - 6);
        return `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}-${endDate.toLocaleDateString('en-US', { day: 'numeric' })}`;
      }).join(', ');
    };
    
    if (weeksMissing3PL.length > 0) {
      const weekDates = formatWeekDates(weeksMissing3PL);
      alerts.push({ 
        type: 'warning', 
        text: `Missing 3PL data: ${weekDates}`,
        link: '3pl',
        action: () => setView('3pl')
      });
    }
    
    if (weeksMissingAds.length > 0) {
      const weekDates = formatWeekDates(weeksMissingAds);
      alerts.push({ 
        type: 'warning', 
        text: `Missing Ads data: ${weekDates}`,
        link: 'ads-upload',
        action: () => { setUploadTab('bulk-ads'); setView('upload'); }
      });
    }
    
    // Calculate total upcoming bills for display
    const totalUpcomingBills = upcomingBills.reduce((s, i) => s + i.amount, 0);
    
    // Calculate weekly progress with AI projection
    const getWeeklyProgress = () => {
      if (goals.weeklyRevenue <= 0) return null;
      
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0 = Sunday
      const daysIntoWeek = dayOfWeek === 0 ? 7 : dayOfWeek; // Sunday is end of week
      const daysRemaining = 7 - daysIntoWeek;
      
      // Get current week's date range (Monday to Sunday) using consistent date format
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysIntoWeek + 1);
      
      let currentWeekRevenue = 0;
      let daysWithCompleteData = 0; // Days with Amazon data (our limiting factor)
      let daysWithAnyData = 0;
      const dailyRevenues = [];
      const missingDays = [];
      
      // Sum up daily revenue for this week (check each day of current week)
      for (let i = 0; i < daysIntoWeek; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        const dateKey = formatDateKey(d);
        const dayData = allDaysData[dateKey];
        
        // Check if day has REAL Amazon data (not zero which means not yet reported)
        const hasAmazonData = dayData?.amazon?.revenue > 0;
        const hasShopifyData = dayData?.shopify?.revenue > 0;
        const dayRevenue = dayData?.total?.revenue || 0;
        
        if (hasAmazonData) {
          // Full data day - Amazon + Shopify
          currentWeekRevenue += dayRevenue;
          dailyRevenues.push(dayRevenue);
          daysWithCompleteData++;
          daysWithAnyData++;
        } else if (hasShopifyData) {
          // Shopify only - Amazon not yet reported
          // Add Shopify revenue but don't count as complete day for projection
          currentWeekRevenue += dayRevenue;
          daysWithAnyData++;
          missingDays.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
        }
      }
      
      // Calculate projection based on COMPLETE days only
      let projectedTotal = currentWeekRevenue;
      let projectionMethod = 'none';
      let avgDailyRevenue = 0;
      let neededPerDay = 0;
      
      if (daysWithCompleteData > 0) {
        // Use average from complete days (with Amazon data) to project
        avgDailyRevenue = dailyRevenues.reduce((s, r) => s + r, 0) / daysWithCompleteData;
        
        // Project remaining days + days with only Shopify data
        const daysToProject = daysRemaining + (daysWithAnyData - daysWithCompleteData);
        projectedTotal = currentWeekRevenue + (avgDailyRevenue * daysToProject);
        projectionMethod = 'daily-avg';
        
        // Calculate what we need per remaining day to hit goal
        if (daysRemaining > 0) {
          const remaining = goals.weeklyRevenue - currentWeekRevenue;
          neededPerDay = remaining > 0 ? remaining / daysRemaining : 0;
        }
      } else if (sortedWeeks.length > 0) {
        // No complete daily data for current week - use last week's total as projection
        const lastWeekData = allWeeksData[sortedWeeks[sortedWeeks.length - 1]];
        projectedTotal = lastWeekData?.total?.revenue || 0;
        projectionMethod = 'last-week';
        avgDailyRevenue = projectedTotal / 7;
        neededPerDay = goals.weeklyRevenue / 7;
      }
      
      const progressPct = (currentWeekRevenue / goals.weeklyRevenue) * 100;
      const projectedPct = (projectedTotal / goals.weeklyRevenue) * 100;
      const onTrack = projectedTotal >= goals.weeklyRevenue;
      const shortfall = goals.weeklyRevenue - projectedTotal;
      
      return {
        currentRevenue: currentWeekRevenue,
        projectedTotal,
        goal: goals.weeklyRevenue,
        progressPct: Math.min(progressPct, 100),
        projectedPct: Math.min(projectedPct, 150),
        onTrack,
        shortfall,
        daysRemaining,
        daysWithData: daysWithCompleteData,
        daysWithAnyData,
        projectionMethod,
        avgDailyRevenue,
        neededPerDay,
        missingDays,
      };
    };
    
    const weeklyProgress = getWeeklyProgress();
    
    // Calculate sales tax due this month
    const getSalesTaxDueThisMonth = () => {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const endOfMonth = new Date(currentYear, currentMonth + 1, 0);
      
      const statesDue = [];
      
      Object.entries(salesTaxConfig.nexusStates || {}).forEach(([stateCode, config]) => {
        if (!config.hasNexus) return;
        
        const stateName = US_STATES_TAX_INFO[stateCode]?.name || stateCode;
        const nextDue = getNextDueDate(config.frequency || 'monthly', stateCode);
        
        // Check if due this month
        if (nextDue.getMonth() === currentMonth && nextDue.getFullYear() === currentYear) {
          const daysUntil = Math.ceil((nextDue - now) / (1000 * 60 * 60 * 24));
          statesDue.push({
            stateCode,
            stateName,
            dueDate: nextDue,
            daysUntil,
            frequency: config.frequency || 'monthly',
            isOverdue: daysUntil < 0,
          });
        }
        
        // Also check custom filings (LLC, annual reports, etc.)
        (config.customFilings || []).forEach(filing => {
          const filingDue = new Date(currentYear, filing.dueMonth - 1, filing.dueDay);
          if (filingDue.getMonth() === currentMonth) {
            const daysUntil = Math.ceil((filingDue - now) / (1000 * 60 * 60 * 24));
            statesDue.push({
              stateCode,
              stateName,
              dueDate: filingDue,
              daysUntil,
              filingName: filing.name,
              isCustom: true,
              isOverdue: daysUntil < 0,
            });
          }
        });
      });
      
      return statesDue.sort((a, b) => a.daysUntil - b.daysUntil);
    };
    
    const salesTaxDueThisMonth = getSalesTaxDueThisMonth();
    
    // Calculate Week-to-Date and Month-to-Date Performance metrics
    const getPeriodMetrics = () => {
      const today = new Date();
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      
      // Find the latest day with complete data
      const sortedDays = Object.keys(allDaysData).filter(k => ((allDaysData[k]?.amazon?.revenue || 0) + (allDaysData[k]?.shopify?.revenue || 0)) > 0).sort().reverse();
      const latestDayKey = sortedDays[0];
      if (!latestDayKey) return null;
      
      const latestDate = new Date(latestDayKey + 'T12:00:00');
      const dataFreshness = Math.floor((today - latestDate) / (1000 * 60 * 60 * 24));
      
      // Calculate the LAST COMPLETE WEEK (Mon-Sun) that has data
      // Find the Sunday that ends the week containing the latest data
      const latestDayOfWeek = latestDate.getDay(); // 0=Sun, 1=Mon, etc
      const weekEndDate = new Date(latestDate);
      // If latest is not Sunday, go back to find the previous Sunday (end of last complete week)
      if (latestDayOfWeek !== 0) {
        weekEndDate.setDate(latestDate.getDate() - latestDayOfWeek); // Go to previous Sunday
      }
      // weekEndDate is now the Sunday that ends the complete week
      
      const weekStartDate = new Date(weekEndDate);
      weekStartDate.setDate(weekEndDate.getDate() - 6); // Monday of that week
      
      const weekStartKey = `${weekStartDate.getFullYear()}-${String(weekStartDate.getMonth() + 1).padStart(2, '0')}-${String(weekStartDate.getDate()).padStart(2, '0')}`;
      const weekEndKey = `${weekEndDate.getFullYear()}-${String(weekEndDate.getMonth() + 1).padStart(2, '0')}-${String(weekEndDate.getDate()).padStart(2, '0')}`;
      
      // Previous week for comparison
      const prevWeekEndDate = new Date(weekStartDate);
      prevWeekEndDate.setDate(prevWeekEndDate.getDate() - 1); // Sunday before
      const prevWeekStartDate = new Date(prevWeekEndDate);
      prevWeekStartDate.setDate(prevWeekEndDate.getDate() - 6);
      
      const prevWeekStartKey = `${prevWeekStartDate.getFullYear()}-${String(prevWeekStartDate.getMonth() + 1).padStart(2, '0')}-${String(prevWeekStartDate.getDate()).padStart(2, '0')}`;
      const prevWeekEndKey = `${prevWeekEndDate.getFullYear()}-${String(prevWeekEndDate.getMonth() + 1).padStart(2, '0')}-${String(prevWeekEndDate.getDate()).padStart(2, '0')}`;
      
      // Get start of current month (for MTD - this still uses current month through latest data)
      const monthStart = new Date(latestDate.getFullYear(), latestDate.getMonth(), 1);
      const monthStartKey = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}-01`;
      
      // Previous month for comparison (same day of month)
      const prevMonthStart = new Date(latestDate.getFullYear(), latestDate.getMonth() - 1, 1);
      const prevMonthEndDate = new Date(prevMonthStart);
      prevMonthEndDate.setDate(Math.min(latestDate.getDate(), new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth() + 1, 0).getDate()));
      const prevMonthStartKey = `${prevMonthStart.getFullYear()}-${String(prevMonthStart.getMonth() + 1).padStart(2, '0')}-01`;
      const prevMonthEndKey = `${prevMonthEndDate.getFullYear()}-${String(prevMonthEndDate.getMonth() + 1).padStart(2, '0')}-${String(prevMonthEndDate.getDate()).padStart(2, '0')}`;
      
      // Helper to aggregate days in a range
      const aggregateDays = (startKey, endKey) => {
        const days = Object.keys(allDaysData).filter(k => k >= startKey && k <= endKey && ((allDaysData[k]?.amazon?.revenue || 0) + (allDaysData[k]?.shopify?.revenue || 0)) > 0);
        let revenue = 0, units = 0, netProfit = 0, adSpend = 0, amazonRev = 0, shopifyRev = 0, cogs = 0;
        
        days.forEach(k => {
          const d = allDaysData[k];
          const amazon = d.amazon || {};
          const shopify = d.shopify || {};
          
          // Compute COGS from SKU data
          let aCogs = amazon.cogs || 0;
          if (!aCogs && amazon.skuData) aCogs = amazon.skuData.reduce((s, sku) => s + (sku.cogs || 0), 0);
          let sCogs = shopify.cogs || 0;
          if (!sCogs && shopify.skuData) sCogs = shopify.skuData.reduce((s, sku) => s + (sku.cogs || 0), 0);
          
          revenue += (amazon.revenue || 0) + (shopify.revenue || 0);
          units += (amazon.units || 0) + (shopify.units || 0);
          netProfit += (amazon.netProfit || amazon.netProceeds || 0) + (shopify.netProfit || 0);
          adSpend += (amazon.adSpend || 0) + (shopify.metaSpend || d.metaSpend || 0) + (shopify.googleSpend || d.googleSpend || 0);
          amazonRev += amazon.revenue || 0;
          shopifyRev += shopify.revenue || 0;
          cogs += aCogs + sCogs;
        });
        
        return { revenue, units, netProfit, adSpend, amazonRev, shopifyRev, cogs, daysCount: days.length };
      };
      
      // Aggregate periods
      const wtd = aggregateDays(weekStartKey, weekEndKey);
      const mtd = aggregateDays(monthStartKey, latestDayKey); // MTD through latest data
      const prevWtd = aggregateDays(prevWeekStartKey, prevWeekEndKey);
      const prevMtd = aggregateDays(prevMonthStartKey, prevMonthEndKey);
      
      if (wtd.daysCount === 0 && mtd.daysCount === 0) return null;
      
      // Format week label - show full date range for clarity
      const weekLabel = `${weekStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      
      return {
        wtd: {
          ...wtd,
          margin: wtd.revenue > 0 ? (wtd.netProfit / wtd.revenue) * 100 : 0,
          tacos: wtd.revenue > 0 ? (wtd.adSpend / wtd.revenue) * 100 : 0,
          revenueChange: prevWtd.revenue > 0 ? ((wtd.revenue - prevWtd.revenue) / prevWtd.revenue) * 100 : null,
          profitChange: prevWtd.netProfit !== 0 ? ((wtd.netProfit - prevWtd.netProfit) / Math.abs(prevWtd.netProfit)) * 100 : null,
          weekLabel,
          weekEndDate: weekEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        },
        prevWtd: {
          ...prevWtd,
          margin: prevWtd.revenue > 0 ? (prevWtd.netProfit / prevWtd.revenue) * 100 : 0,
          tacos: prevWtd.revenue > 0 ? (prevWtd.adSpend / prevWtd.revenue) * 100 : 0,
          weekLabel: `${prevWeekStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${prevWeekEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        },
        mtd: {
          ...mtd,
          margin: mtd.revenue > 0 ? (mtd.netProfit / mtd.revenue) * 100 : 0,
          tacos: mtd.revenue > 0 ? (mtd.adSpend / mtd.revenue) * 100 : 0,
          revenueChange: prevMtd.revenue > 0 ? ((mtd.revenue - prevMtd.revenue) / prevMtd.revenue) * 100 : null,
          profitChange: prevMtd.netProfit !== 0 ? ((mtd.netProfit - prevMtd.netProfit) / Math.abs(prevMtd.netProfit)) * 100 : null,
        },
        latestDay: latestDayKey,
        dataFreshness,
        weekStartKey,
        monthName: latestDate.toLocaleDateString('en-US', { month: 'long' }),
      };
    };
    
    const periodMetrics = getPeriodMetrics();
    
    // Helper to check if a widget is enabled
    const isWidgetEnabled = (widgetId) => {
      const widgets = widgetConfig?.widgets || DEFAULT_DASHBOARD_WIDGETS.widgets;
      const widget = widgets.find(w => w.id === widgetId);
      if (widget) return widget.enabled;
      // Fallback to default
      const defaultWidget = DEFAULT_DASHBOARD_WIDGETS.widgets.find(w => w.id === widgetId);
      return defaultWidget?.enabled ?? true;
    };

    // Get CSS order for a widget (used for drag-and-drop reordering)
    const getWidgetOrder = (widgetId) => {
      const widgets = widgetConfig?.widgets || DEFAULT_DASHBOARD_WIDGETS.widgets;
      const widget = widgets.find(w => w.id === widgetId);
      return widget?.order ?? 99;
    };
    
    // Get sorted widgets for dashboard rendering
    const getSortedWidgets = () => {
      const widgets = widgetConfig?.widgets || DEFAULT_DASHBOARD_WIDGETS.widgets;
      return [...widgets].filter(w => w.enabled).sort((a, b) => (a.order || 0) - (b.order || 0));
    };
    
    // Hide widget from dashboard
    const hideWidget = (widgetId) => {
      const widgets = widgetConfig?.widgets || DEFAULT_DASHBOARD_WIDGETS.widgets;
      const newWidgets = widgets.map(w => 
        w.id === widgetId ? { ...w, enabled: false } : { ...w }
      );
      setWidgetConfig({ widgets: newWidgets, layout: 'auto' });
    };
    
    // Dashboard drag handlers with stacking support
    // Widget reordering is handled by the Customize modal (WidgetConfigModal)
    // CSS order on DraggableWidget reflects the saved order
    
    // Data Health Check - detect discrepancies between stored weekly and derived daily data
    // (computed inline, not as a hook, since we're inside a conditional)
    const dataHealthCheck = (() => {
      const issues = [];
      const derivedWeeks = deriveWeeksFromDays(allDaysData || {});
      
      // Check last 4 weeks with data
      const weeksToCheck = Object.keys(allWeeksData)
        .filter(w => (allWeeksData[w]?.total?.revenue || 0) > 0)
        .sort()
        .slice(-4);
      
      weeksToCheck.forEach(weekKey => {
        const stored = allWeeksData[weekKey];
        const derived = derivedWeeks[weekKey];
        
        if (stored && derived) {
          const storedRev = stored.total?.revenue || 0;
          const derivedRev = derived.total?.revenue || 0;
          
          // If both have revenue and they differ by more than 5%, flag it
          if (storedRev > 0 && derivedRev > 0) {
            const diff = Math.abs(storedRev - derivedRev);
            const diffPct = (diff / Math.max(storedRev, derivedRev)) * 100;
            
            if (diffPct > 5) {
              issues.push({
                week: weekKey,
                storedRev,
                derivedRev,
                diff,
                diffPct,
                message: `Week ${weekKey}: Stored ($${storedRev.toFixed(0)}) vs Daily ($${derivedRev.toFixed(0)}) differ by ${diffPct.toFixed(0)}%`
              });
            }
          }
        }
      });
      
      return {
        healthy: issues.length === 0,
        issues,
        message: issues.length === 0 
          ? 'Data is consistent' 
          : `${issues.length} week(s) have data discrepancies`
      };
    })();
    
    // DraggableWidget - applies CSS order from widget config + hover hide button
    const DraggableWidget = ({ id, children, className = '' }) => {
      return (
        <div
          style={{ order: getWidgetOrder(id) }}
          className={`relative group ${className}`}
        >
          {/* Hide button - visible on hover */}
          <div className="absolute -top-2 -right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
            <button
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); hideWidget(id); }}
              className="p-1.5 bg-slate-700 hover:bg-rose-600 rounded-lg shadow-lg transition-colors border border-slate-600"
              title="Hide widget"
            >
              <EyeOff className="w-3 h-3 text-slate-300" />
            </button>
          </div>
          {children}
        </div>
      );
    };
    
    // DashboardWidget - full widget with title/icon for consistent look
    const DashboardWidget = ({ id, title, icon: Icon, children, className = '', noPadding = false }) => {
      return (
        <DraggableWidget id={id} className={className}>
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-2xl border border-slate-700 hover:border-slate-600 transition-colors">
            {title && (
              <div className="flex items-center gap-3 mb-4 p-5 pb-0">
                {Icon && (
                  <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20">
                    <Icon className="w-5 h-5 text-violet-400" />
                  </div>
                )}
                <h3 className="text-lg font-bold text-white">{title}</h3>
              </div>
            )}
            <div className={noPadding ? '' : 'p-5 pt-0'}>
              {children}
            </div>
          </div>
        </DraggableWidget>
      );
    };
    
    // Compute Top/Worst Sellers
    const getProductPerformance = (days) => {
      // Filter to only valid date keys
      const sortedDays = Object.keys(allDaysData)
        .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && hasDailySalesData(allDaysData[d]))
        .sort();
      
      if (sortedDays.length === 0) return { top: [], worst: [], period: 'No Data', daysAnalyzed: 0 };
      
      let relevantDays;
      let periodLabel;
      
      if (days === 'ytd') {
        // Year to date
        const currentYear = String(new Date().getFullYear());
        relevantDays = sortedDays.filter(d => d.startsWith(currentYear));
        periodLabel = 'Year to Date';
      } else {
        // Last N days
        try {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - Number(days));
          if (isNaN(cutoffDate.getTime())) throw new Error('Invalid date');
          const cutoffKey = cutoffDate.toISOString().split('T')[0];
          relevantDays = sortedDays.filter(d => d >= cutoffKey);
          periodLabel = `Last ${days} Days`;
        } catch {
          relevantDays = sortedDays.slice(-14); // Fallback to last 14 entries
          periodLabel = 'Recent';
        }
      }
      
      if (relevantDays.length === 0) return { top: [], worst: [], period: periodLabel, daysAnalyzed: 0 };
      
      // Aggregate by SKU
      const skuData = {};
      relevantDays.forEach(dayKey => {
        const dayData = allDaysData[dayKey];
        if (!dayData) return;
        
        // Amazon
        (dayData.amazon?.skuData || []).forEach(s => {
          const sku = s.sku || s.msku || '';
          if (!sku) return;
          if (!skuData[sku]) skuData[sku] = { sku, name: savedProductNames[sku] || s.name || sku, units: 0, revenue: 0, profit: 0, channel: 'Amazon' };
          skuData[sku].units += s.unitsSold || s.units || 0;
          skuData[sku].revenue += s.netSales || s.revenue || 0;
          skuData[sku].profit += s.netProceeds || 0;
        });
        
        // Shopify  
        (dayData.shopify?.skuData || []).forEach(s => {
          const sku = s.sku || '';
          if (!sku) return;
          if (!skuData[sku]) skuData[sku] = { sku, name: savedProductNames[sku] || s.name || sku, units: 0, revenue: 0, profit: 0, channel: 'Shopify' };
          skuData[sku].units += s.unitsSold || s.units || 0;
          skuData[sku].revenue += s.netSales || s.revenue || 0;
        });
      });
      
      const products = Object.values(skuData).filter(p => p.units > 0 || p.revenue > 0);
      const sortedByRevenue = [...products].sort((a, b) => b.revenue - a.revenue);
      
      return {
        top: sortedByRevenue.slice(0, 5),
        worst: sortedByRevenue.filter(p => p.revenue > 100).slice(-5).reverse(), // Only show products with >$100 revenue
        period: periodLabel,
        daysAnalyzed: relevantDays.length,
      };
    };
    
    const performance14d = getProductPerformance(14);
    const performanceYTD = getProductPerformance('ytd');
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 lg:p-6">
        <div className="max-w-7xl mx-auto">{globalModals}
          
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              {storeLogo && (
                <img src={storeLogo} alt="Store logo" className="w-12 h-12 object-contain rounded-xl bg-white p-1.5" />
              )}
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold text-white">{storeName ? storeName + ' Dashboard' : 'E-Commerce Dashboard'}</h1>
                <div className="flex items-center gap-3">
                  <p className="text-slate-400">Business performance overview</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Store Selector Dropdown - Always visible */}
              {session && (
                <div className="relative">
                  <button 
                    onClick={() => setShowStoreSelector(!showStoreSelector)}
                    className="px-4 py-2 bg-gradient-to-r from-violet-600/40 to-purple-600/40 hover:from-violet-600/60 hover:to-purple-600/60 border border-violet-500/50 rounded-xl text-sm text-white flex items-center gap-2 shadow-lg"
                  >
                    <Store className="w-4 h-4 text-violet-300" />
                    <span className="max-w-[150px] truncate font-medium">{stores.find(s => s.id === activeStoreId)?.name || storeName || 'My Store'}</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${showStoreSelector ? 'rotate-180' : ''}`} />
                  </button>
                  {showStoreSelector && (
                    <>
                      {/* Backdrop to close dropdown */}
                      <div className="fixed inset-0 z-40" onClick={() => setShowStoreSelector(false)} />
                      <div className="absolute top-full mt-2 right-0 w-72 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl z-50 overflow-hidden">
                        <div className="p-3 border-b border-slate-700 bg-slate-800/80">
                          <p className="text-white font-semibold flex items-center gap-2">
                            <Store className="w-4 h-4 text-violet-400" />
                            Switch Store
                          </p>
                          <p className="text-slate-400 text-xs mt-0.5">Select or create a store</p>
                        </div>
                        <div className="p-2 max-h-64 overflow-y-auto">
                          {stores.length === 0 ? (
                            <div className="text-center py-4 text-slate-500 text-sm">
                              <p>Current store: <span className="text-white">{storeName || 'My Store'}</span></p>
                              <p className="text-xs mt-1">Create a new store below to switch between them</p>
                            </div>
                          ) : (
                            stores.map(store => {
                              const isActive = store.id === activeStoreId;
                              return (
                                <button
                                  key={store.id}
                                  onClick={() => {
                                    if (!isActive) {
                                      switchStore(store.id);
                                    }
                                    setShowStoreSelector(false);
                                  }}
                                  className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 mb-1 transition-all ${isActive ? 'bg-violet-600/30 text-white border border-violet-500/50' : 'bg-slate-700/30 hover:bg-slate-700/70 text-slate-300'}`}
                                >
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isActive ? 'bg-violet-600' : 'bg-slate-600'}`}>
                                    <Store className="w-4 h-4 text-white" />
                                  </div>
                                  <span className={`flex-1 truncate font-medium ${isActive ? 'text-white' : 'text-slate-300'}`}>{store.name}</span>
                                  {isActive && <Check className="w-5 h-5 text-violet-400" />}
                                </button>
                              );
                            })
                          )}
                        </div>
                        <div className="p-2 border-t border-slate-700 bg-slate-900/50">
                          <button
                            onClick={() => { setShowStoreSelector(false); setShowStoreModal(true); }}
                            className="w-full text-left px-3 py-2.5 rounded-lg bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 flex items-center gap-2 text-sm border border-violet-500/30"
                          >
                            <Plus className="w-4 h-4" />
                            <span className="font-medium">Create New Store</span>
                          </button>
                          <button
                            onClick={() => { setShowStoreSelector(false); setShowStoreModal(true); }}
                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-700/50 text-slate-400 flex items-center gap-2 text-xs mt-1"
                          >
                            <Settings className="w-3 h-3" />
                            Manage All Stores
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              {/* Consolidated Store Settings Dropdown */}
              <div className="relative" ref={el => el && (el.dataset.dropdown = 'store-settings')}>
                <button 
                  onClick={(e) => {
                    const dropdown = document.getElementById('store-settings-dropdown');
                    if (dropdown) dropdown.classList.toggle('hidden');
                  }}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white flex items-center gap-1"
                >
                  <Settings className="w-4 h-4" />
                  Store
                  <ChevronDown className="w-3 h-3" />
                </button>
                <div id="store-settings-dropdown" className="hidden absolute right-0 top-full mt-1 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 py-1">
                  <button onClick={() => { setShowGoalsModal(true); document.getElementById('store-settings-dropdown')?.classList.add('hidden'); }} className="w-full px-4 py-2.5 text-left hover:bg-slate-700 flex items-center gap-2 text-sm">
                    <Target className="w-4 h-4 text-amber-400" />
                    <span className="text-white">Goals</span>
                    {(goals.weeklyRevenue > 0 || goals.monthlyRevenue > 0) && <Check className="w-3 h-3 text-emerald-400 ml-auto" />}
                  </button>
                  <button onClick={() => { setShowCogsManager(true); document.getElementById('store-settings-dropdown')?.classList.add('hidden'); }} className="w-full px-4 py-2.5 text-left hover:bg-slate-700 flex items-center gap-2 text-sm">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    <span className="text-white">COGS</span>
                    {Object.keys(savedCogs).length > 0 && <span className="text-emerald-400 text-xs ml-auto">{Object.keys(savedCogs).length} SKUs</span>}
                  </button>
                  <button onClick={() => { setShowProductCatalog(true); document.getElementById('store-settings-dropdown')?.classList.add('hidden'); }} className="w-full px-4 py-2.5 text-left hover:bg-slate-700 flex items-center gap-2 text-sm">
                    <Package className="w-4 h-4 text-violet-400" />
                    <span className="text-white">Catalog</span>
                    {Object.keys(savedProductNames).length > 0 && <Check className="w-3 h-3 text-emerald-400 ml-auto" />}
                  </button>
                  <div className="border-t border-slate-700 my-1" />
                  <button onClick={() => { setShowInvoiceModal(true); document.getElementById('store-settings-dropdown')?.classList.add('hidden'); }} className="w-full px-4 py-2.5 text-left hover:bg-slate-700 flex items-center gap-2 text-sm">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <span className="text-white">Bills & Invoices</span>
                    {upcomingBills.length > 0 && <span className="px-1.5 py-0.5 bg-amber-500/30 rounded text-xs text-amber-300 ml-auto">{upcomingBills.length}</span>}
                  </button>
                </div>
              </div>
              {/* Quick action buttons */}
              <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-1">
                <button onClick={() => setEditingWidgets(true)} className="px-3 py-2 hover:bg-slate-700 rounded flex items-center gap-1.5 text-cyan-400 text-sm font-medium" title="Customize Dashboard"><Layers className="w-4 h-4" /><span className="hidden sm:inline">Customize</span></button>
                {generateForecast ? (
                  <button onClick={() => setShowForecast(true)} className="p-2 hover:bg-slate-700 rounded text-emerald-400" title="View Forecast"><TrendingUp className="w-4 h-4" /></button>
                ) : (
                  <button onClick={() => setView('analytics')} className="p-2 hover:bg-slate-700 rounded text-slate-500" title="Need 4+ weeks for forecast"><TrendingUp className="w-4 h-4" /></button>
                )}
                <button onClick={() => setShowExportModal(true)} className="p-2 hover:bg-slate-700 rounded text-slate-300" title="Export CSV"><FileDown className="w-4 h-4" /></button>
                <button onClick={() => setShowPdfExport(true)} className="p-2 hover:bg-slate-700 rounded text-violet-400" title="Export PDF Report"><FileText className="w-4 h-4" /></button>
                <button onClick={() => setShowUploadHelp(true)} className="p-2 hover:bg-slate-700 rounded text-slate-300" title="Help"><HelpCircle className="w-4 h-4" /></button>
                {/* Sync Status Indicator */}
                {runAutoSync && (
                  <button 
                    onClick={() => runAutoSync(true)} 
                    disabled={autoSyncStatus?.running}
                    className={`p-2 hover:bg-slate-700 rounded flex items-center gap-1.5 text-sm font-medium disabled:opacity-70 ${
                      autoSyncStatus?.running ? 'text-violet-400' : 
                      autoSyncStatus?.results?.length > 0 && autoSyncStatus.results.every(r => r.success) ? 'text-emerald-400' :
                      autoSyncStatus?.results?.some(r => !r.success) ? 'text-amber-400' : 'text-slate-400'
                    }`}
                    title={autoSyncStatus?.running ? 'Syncing data...' : autoSyncStatus?.lastCheck ? `Last sync: ${new Date(autoSyncStatus.lastCheck).toLocaleTimeString()}` : 'Sync all connected services'}
                  >
                    <RefreshCw className={`w-4 h-4 ${autoSyncStatus?.running ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">
                      {autoSyncStatus?.running ? 'Syncing...' : 'Sync'}
                    </span>
                    {autoSyncStatus?.lastCheck && !autoSyncStatus?.running && (
                      <span className="hidden md:inline text-xs text-slate-500 ml-0.5">
                        {new Date(autoSyncStatus.lastCheck).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
          
          <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />
          
          {/* No Data State */}
          {!hasData && dataLoading ? (
            <div className="space-y-6 animate-in fade-in">
              <SkeletonKPIRow count={4} />
              <SkeletonChart height="h-48" />
              <SkeletonChart height="h-32" />
            </div>
          ) : !hasData ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 mb-6">
                <BarChart3 className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Welcome to Your Dashboard</h2>
              <p className="text-slate-400 mb-8 max-w-md mx-auto">Get started by uploading your sales data. We support Amazon and Shopify exports.</p>
              
              {/* Getting Started Checklist */}
              <div className="max-w-xl mx-auto mb-8 bg-slate-800/50 rounded-2xl border border-slate-700 p-6 text-left">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                    Getting Started Checklist
                  </h3>
                  <button 
                    onClick={() => { setUploadTab('amazon-bulk'); setView('upload'); }}
                    className="text-xs text-slate-400 hover:text-white px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded-lg"
                  >
                    Skip for now →
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    {session ? <Check className="w-5 h-5 text-emerald-400" /> : <div className="w-5 h-5 rounded-full border-2 border-slate-600" />}
                    <span className={session ? 'text-emerald-400' : 'text-slate-300'}>
                      {session ? 'Cloud sync enabled' : 'Enable cloud sync'}
                    </span>
                    {!session && supabase && (
                      <span className="text-xs text-slate-500 ml-1">(You're already signed in!)</span>
                    )}
                    {!session && !supabase && (
                      <span className="text-xs text-amber-400 ml-auto">Local only - data stays on this device</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {storeName && storeName.trim() !== '' && storeName !== 'My Store' ? <Check className="w-5 h-5 text-emerald-400" /> : <div className="w-5 h-5 rounded-full border-2 border-slate-600" />}
                    <span className={storeName && storeName.trim() !== '' && storeName !== 'My Store' ? 'text-emerald-400' : 'text-slate-300'}>Name your store</span>
                    {(!storeName || storeName.trim() === '' || storeName === 'My Store') && (
                      <div className="ml-auto flex items-center gap-2">
                        <input 
                          type="text" 
                          placeholder="Enter store name..."
                          className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs text-white w-32 focus:border-violet-500 focus:outline-none"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.target.value.trim()) {
                              setStoreName(e.target.value.trim());
                              setToast({ message: `Store named "${e.target.value.trim()}"!`, type: 'success' });
                              e.target.value = '';
                            }
                          }}
                          onBlur={(e) => {
                            if (e.target.value.trim()) {
                              setStoreName(e.target.value.trim());
                              setToast({ message: `Store named "${e.target.value.trim()}"!`, type: 'success' });
                              e.target.value = '';
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {Object.keys(savedCogs).length > 0 ? <Check className="w-5 h-5 text-emerald-400" /> : <div className="w-5 h-5 rounded-full border-2 border-slate-600" />}
                    <span className={Object.keys(savedCogs).length > 0 ? 'text-emerald-400' : 'text-slate-300'}>Set up COGS for profit tracking</span>
                    {Object.keys(savedCogs).length === 0 && <button onClick={() => setShowCogsManager(true)} className="text-xs text-violet-400 hover:text-violet-300 ml-auto">Setup →</button>}
                  </div>
                  <div className="flex items-center gap-3">
                    {Object.keys(allPeriodsData).length > 0 ? <Check className="w-5 h-5 text-emerald-400" /> : <div className="w-5 h-5 rounded-full border-2 border-slate-600" />}
                    <span className={Object.keys(allPeriodsData).length > 0 ? 'text-emerald-400' : 'text-slate-300'}>Upload historical data (2024-2025)</span>
                    {Object.keys(allPeriodsData).length === 0 && <button onClick={() => { setUploadTab('period'); setView('upload'); }} className="text-xs text-violet-400 hover:text-violet-300 ml-auto">Upload →</button>}
                  </div>
                  <div className="flex items-center gap-3">
                    {Object.keys(allWeeksData).length > 0 ? <Check className="w-5 h-5 text-emerald-400" /> : <div className="w-5 h-5 rounded-full border-2 border-slate-600" />}
                    <span className={Object.keys(allWeeksData).length > 0 ? 'text-emerald-400' : 'text-slate-300'}>Upload your first weekly report</span>
                    {Object.keys(allWeeksData).length === 0 && <button onClick={() => { setUploadTab('amazon-bulk'); setView('upload'); }} className="text-xs text-violet-400 hover:text-violet-300 ml-auto">Upload →</button>}
                  </div>
                  <div className="flex items-center gap-3">
                    {goals.weeklyRevenue > 0 || goals.monthlyRevenue > 0 ? <Check className="w-5 h-5 text-emerald-400" /> : <div className="w-5 h-5 rounded-full border-2 border-slate-600" />}
                    <span className={goals.weeklyRevenue > 0 || goals.monthlyRevenue > 0 ? 'text-emerald-400' : 'text-slate-300'}>Set revenue goals</span>
                    {!(goals.weeklyRevenue > 0 || goals.monthlyRevenue > 0) && <button onClick={() => setShowGoalsModal(true)} className="text-xs text-violet-400 hover:text-violet-300 ml-auto">Setup →</button>}
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button onClick={() => { setUploadTab('amazon-bulk'); setView('upload'); }} className="px-6 py-3 bg-violet-600 hover:bg-violet-500 rounded-xl font-semibold flex items-center justify-center gap-2">
                  <Upload className="w-5 h-5" />Upload Amazon Data
                </button>
                <button onClick={() => { setUploadTab('period'); setView('upload'); }} className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-semibold flex items-center justify-center gap-2">
                  <CalendarRange className="w-5 h-5" />Upload Period Data
                </button>
                <button onClick={() => setShowUploadHelp(true)} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl font-semibold flex items-center justify-center gap-2 text-slate-300">
                  <FileText className="w-5 h-5" />How to Upload
                </button>
              </div>
              <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto text-left">
                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                  <Calendar className="w-6 h-6 text-violet-400 mb-2" />
                  <h3 className="font-semibold text-white mb-1">Weekly Tracking</h3>
                  <p className="text-slate-400 text-sm">Upload weekly reports for detailed trends and analysis</p>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                  <CalendarRange className="w-6 h-6 text-teal-400 mb-2" />
                  <h3 className="font-semibold text-white mb-1">Period Reports</h3>
                  <p className="text-slate-400 text-sm">Upload monthly or yearly totals for YoY comparisons</p>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                  <Boxes className="w-6 h-6 text-emerald-400 mb-2" />
                  <h3 className="font-semibold text-white mb-1">Inventory Alerts</h3>
                  <p className="text-slate-400 text-sm">Track stock levels and get reorder notifications</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              {/* Alerts */}
              {isWidgetEnabled('alerts') && alerts.length > 0 && (
                <DashboardWidget id="alerts" title="Alerts" icon={AlertTriangle} className="mb-6" noPadding>
                  <div className="px-5 pb-5 space-y-2">
                    {alerts.map((alert, i) => (
                      <div 
                        key={i} 
                        onClick={() => {
                          if (alert.action) {
                            alert.action();
                          } else if (alert.link === 'invoices') {
                            setShowInvoiceModal(true);
                          } else if (alert.link === 'forecast') {
                            setUploadTab('forecast'); setView('upload');
                          } else if (alert.link === 'sales-tax') {
                            setView('sales-tax');
                          } else if (alert.link === 'ads-upload') {
                            setUploadTab('ads'); setView('upload');
                          } else if (alert.link === '3pl') {
                            setView('3pl');
                          } else if (alert.link) {
                            setView(alert.link);
                          }
                        }}
                        className={`flex items-center justify-between p-3 rounded-xl ${alert.type === 'critical' ? 'bg-rose-900/30 border border-rose-500/50' : 'bg-amber-900/30 border border-amber-500/50'} ${alert.link || alert.action ? 'cursor-pointer hover:opacity-80' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          <AlertTriangle className={`w-5 h-5 ${alert.type === 'critical' ? 'text-rose-400' : 'text-amber-400'}`} />
                          <span className={alert.type === 'critical' ? 'text-rose-300' : 'text-amber-300'}>{alert.text}</span>
                        </div>
                        {(alert.link || alert.action) && <ChevronRight className="w-5 h-5 text-slate-400" />}
                      </div>
                    ))}
                  </div>
                </DashboardWidget>
              )}
              
              {/* Week-to-Date & Month-to-Date Performance */}
              {isWidgetEnabled('todayPerformance') && periodMetrics && (
                <DraggableWidget id="todayPerformance" className="mb-6">
                <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-2xl border border-slate-700 overflow-hidden">
                  <div className="p-5">
                    {/* Header with data freshness */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20">
                          <TrendingUp className="w-5 h-5 text-violet-400" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-white">Performance Overview</h3>
                          <p className="text-slate-400 text-sm flex items-center gap-2">
                            Data through {periodMetrics.latestDay ? new Date(periodMetrics.latestDay + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A'}
                            {autoSyncStatus?.running && (
                              <span className="text-xs px-2 py-0.5 rounded bg-violet-500/20 text-violet-400 animate-pulse flex items-center gap-1">
                                <RefreshCw className="w-3 h-3 animate-spin" /> Syncing...
                              </span>
                            )}
                            {!autoSyncStatus?.running && periodMetrics.dataFreshness > 0 && (
                              <span className={`text-xs px-1.5 py-0.5 rounded ${periodMetrics.dataFreshness <= 2 ? 'bg-cyan-500/20 text-cyan-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                {periodMetrics.dataFreshness === 1 ? '1 day ago' : `${periodMetrics.dataFreshness} days ago`}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <button onClick={() => setView('daily')} className="text-sm text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                        Daily View <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                    
                    {/* WTD and Prior Week Side by Side */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Current Week */}
                      <div className="bg-slate-900/50 rounded-xl p-4 border border-violet-500/20">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold text-violet-400 flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Current Week: {periodMetrics.wtd.weekLabel || ''}
                          </h4>
                          <span className="text-xs text-slate-500">{periodMetrics.wtd.daysCount} days</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-slate-500 text-xs">Revenue</p>
                            <p className="text-xl font-bold text-white">{formatCurrency(periodMetrics.wtd.revenue)}</p>
                            {periodMetrics.wtd.revenueChange !== null && (
                              <p className={`text-xs flex items-center gap-1 ${periodMetrics.wtd.revenueChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {periodMetrics.wtd.revenueChange >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                                {Math.abs(periodMetrics.wtd.revenueChange).toFixed(1)}% vs prior wk
                              </p>
                            )}
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs">Net Profit</p>
                            <p className={`text-xl font-bold ${periodMetrics.wtd.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {formatCurrency(periodMetrics.wtd.netProfit)}
                            </p>
                            <p className="text-xs text-slate-500">{periodMetrics.wtd.margin.toFixed(1)}% margin</p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs">Units</p>
                            <p className="text-lg font-semibold text-white">{formatNumber(periodMetrics.wtd.units)}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs">Ad Spend</p>
                            <p className="text-lg font-semibold text-violet-400">{formatCurrency(periodMetrics.wtd.adSpend)}</p>
                            <p className={`text-xs ${periodMetrics.wtd.tacos <= 15 ? 'text-emerald-400' : periodMetrics.wtd.tacos <= 25 ? 'text-amber-400' : 'text-rose-400'}`}>
                              {periodMetrics.wtd.tacos.toFixed(1)}% TACOS
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Prior Week */}
                      <div className="bg-slate-900/50 rounded-xl p-4 border border-cyan-500/20">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold text-cyan-400 flex items-center gap-2">
                            <CalendarRange className="w-4 h-4" />
                            Prior Week: {periodMetrics.prevWtd.weekLabel || ''}
                          </h4>
                          <span className="text-xs text-slate-500">{periodMetrics.prevWtd.daysCount} days</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-slate-500 text-xs">Revenue</p>
                            <p className="text-xl font-bold text-white">{formatCurrency(periodMetrics.prevWtd.revenue)}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs">Net Profit</p>
                            <p className={`text-xl font-bold ${periodMetrics.prevWtd.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {formatCurrency(periodMetrics.prevWtd.netProfit)}
                            </p>
                            <p className="text-xs text-slate-500">{periodMetrics.prevWtd.margin.toFixed(1)}% margin</p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs">Units</p>
                            <p className="text-lg font-semibold text-white">{formatNumber(periodMetrics.prevWtd.units)}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs">Ad Spend</p>
                            <p className="text-lg font-semibold text-violet-400">{formatCurrency(periodMetrics.prevWtd.adSpend)}</p>
                            <p className={`text-xs ${periodMetrics.prevWtd.tacos <= 15 ? 'text-emerald-400' : periodMetrics.prevWtd.tacos <= 25 ? 'text-amber-400' : 'text-rose-400'}`}>
                              {periodMetrics.prevWtd.tacos.toFixed(1)}% TACOS
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Channel Split Bar (Current Week) */}
                    <div className="mt-4 bg-slate-900/50 rounded-xl p-3 border border-slate-700/50">
                      <div className="flex justify-between text-xs text-slate-400 mb-2">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" />Amazon: {formatCurrency(periodMetrics.wtd.amazonRev)}</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />Shopify: {formatCurrency(periodMetrics.wtd.shopifyRev)}</span>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden flex">
                        {periodMetrics.wtd.revenue > 0 && (
                          <>
                            <div className="bg-orange-500 h-full" style={{ width: `${(periodMetrics.wtd.amazonRev / periodMetrics.wtd.revenue) * 100}%` }} />
                            <div className="bg-blue-500 h-full" style={{ width: `${(periodMetrics.wtd.shopifyRev / periodMetrics.wtd.revenue) * 100}%` }} />
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                </DraggableWidget>
              )}
              
              {/* Weekly Progress Bar */}
              {isWidgetEnabled('weekProgress') && weeklyProgress && (
                <DraggableWidget id="weekProgress" className="mb-6">
                <div className={`rounded-2xl border p-4 ${
                  weeklyProgress.onTrack 
                    ? 'bg-gradient-to-r from-emerald-900/30 to-teal-900/20 border-emerald-500/30' 
                    : weeklyProgress.projectedPct >= 80 
                      ? 'bg-gradient-to-r from-amber-900/30 to-yellow-900/20 border-amber-500/30'
                      : 'bg-gradient-to-r from-rose-900/30 to-red-900/20 border-rose-500/30'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className={`text-sm font-semibold flex items-center gap-2 ${
                      weeklyProgress.onTrack ? 'text-emerald-400' : weeklyProgress.projectedPct >= 80 ? 'text-amber-400' : 'text-rose-400'
                    }`}>
                      <Target className="w-4 h-4" />
                      This Week's Goal
                    </h3>
                    <span className="text-white font-bold">
                      {formatCurrency(weeklyProgress.currentRevenue)} / {formatCurrency(weeklyProgress.goal)}
                    </span>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="relative h-4 bg-slate-800 rounded-full overflow-hidden mb-2">
                    {/* Current progress */}
                    <div 
                      className={`absolute left-0 top-0 h-full transition-all rounded-full ${
                        weeklyProgress.onTrack ? 'bg-emerald-500' : weeklyProgress.projectedPct >= 80 ? 'bg-amber-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${Math.min(weeklyProgress.progressPct, 100)}%` }}
                    />
                    {/* Projected endpoint marker */}
                    {weeklyProgress.daysRemaining > 0 && weeklyProgress.projectionMethod !== 'none' && (
                      <div 
                        className={`absolute top-0 h-full w-1 ${weeklyProgress.onTrack ? 'bg-emerald-300' : 'bg-amber-300'}`}
                        style={{ left: `${Math.min(weeklyProgress.projectedPct, 100)}%` }}
                        title={`Projected: ${formatCurrency(weeklyProgress.projectedTotal)}`}
                      />
                    )}
                    {/* Goal line at 100% */}
                    <div className="absolute right-0 top-0 h-full w-0.5 bg-white/50" />
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-4">
                      <span className="text-slate-400">{weeklyProgress.progressPct.toFixed(0)}% achieved</span>
                      {weeklyProgress.daysRemaining > 0 && (
                        <span className="text-slate-500">{weeklyProgress.daysRemaining} days left</span>
                      )}
                      {weeklyProgress.daysWithData > 0 && (
                        <span className="text-slate-500 text-xs">({weeklyProgress.daysWithData} days data)</span>
                      )}
                    </div>
                    <div className={`font-medium ${weeklyProgress.onTrack ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {weeklyProgress.projectionMethod !== 'none' ? (
                        weeklyProgress.onTrack 
                          ? `✓ On track (${formatCurrency(weeklyProgress.projectedTotal)} projected)`
                          : `${formatCurrency(Math.abs(weeklyProgress.shortfall))} short projected`
                      ) : (
                        weeklyProgress.daysWithData === 0 ? 'Upload daily data for projection' : ''
                      )}
                    </div>
                  </div>
                  
                  {/* Additional insights */}
                  {weeklyProgress.projectionMethod !== 'none' && weeklyProgress.daysRemaining > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-700/50 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <span className="text-slate-400">
                        Avg: <span className="text-cyan-400">{formatCurrency(weeklyProgress.avgDailyRevenue)}/day</span>
                      </span>
                      {!weeklyProgress.onTrack && weeklyProgress.neededPerDay > 0 && (
                        <span className="text-slate-400">
                          Need: <span className="text-amber-400">{formatCurrency(weeklyProgress.neededPerDay)}/day</span> to hit goal
                        </span>
                      )}
                      {weeklyProgress.missingDays?.length > 0 && (
                        <span className="text-slate-500">
                          ⏳ Awaiting Amazon: {weeklyProgress.missingDays.join(', ')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                </DraggableWidget>
              )}
              
              {/* Top Sellers (14 Days) */}
              {isWidgetEnabled('topSellers14d') && performance14d.top.length > 0 && (
                <DashboardWidget id="topSellers14d" title={`Top Sellers (${performance14d.daysAnalyzed} Days)`} icon={TrendingUp} className="mb-6">
                  <div className="space-y-2">
                    {performance14d.top.map((p, i) => (
                      <div key={p.sku} className="flex items-center gap-3 bg-slate-900/50 rounded-lg p-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                          i === 0 ? 'bg-amber-500/20 text-amber-400' : 
                          i === 1 ? 'bg-slate-400/20 text-slate-300' : 
                          i === 2 ? 'bg-orange-600/20 text-orange-400' : 
                          'bg-slate-700/50 text-slate-400'
                        }`}>
                          #{i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium truncate text-sm">{p.name || p.sku}</p>
                          <p className="text-slate-500 text-xs">{p.sku}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-emerald-400 font-semibold">{formatCurrency(p.revenue)}</p>
                          <p className="text-slate-500 text-xs">{p.units} units</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setView('skus')} className="mt-3 w-full text-center text-sm text-cyan-400 hover:text-cyan-300 py-2">
                    View All Products →
                  </button>
                </DashboardWidget>
              )}
              
              {/* Worst Sellers / Needs Attention (14 Days) */}
              {isWidgetEnabled('worstSellers14d') && performance14d.worst.length > 0 && (
                <DashboardWidget id="worstSellers14d" title={`Needs Attention (${performance14d.daysAnalyzed} Days)`} icon={AlertTriangle} className="mb-6">
                  <p className="text-slate-400 text-xs mb-3">Products with lowest revenue (min $100)</p>
                  <div className="space-y-2">
                    {performance14d.worst.map((p, i) => (
                      <div key={p.sku} className="flex items-center gap-3 bg-rose-900/20 rounded-lg p-3 border border-rose-500/20">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-rose-500/20">
                          <TrendingDown className="w-4 h-4 text-rose-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium truncate text-sm">{p.name || p.sku}</p>
                          <p className="text-slate-500 text-xs">{p.sku}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-rose-400 font-semibold">{formatCurrency(p.revenue)}</p>
                          <p className="text-slate-500 text-xs">{p.units} units</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </DashboardWidget>
              )}
              
              {/* Top Sellers YTD */}
              {isWidgetEnabled('topSellersYTD') && performanceYTD.top.length > 0 && (
                <DashboardWidget id="topSellersYTD" title="Top Sellers (YTD)" icon={Award} className="mb-6">
                  <div className="space-y-2">
                    {performanceYTD.top.map((p, i) => (
                      <div key={p.sku} className="flex items-center gap-3 bg-slate-900/50 rounded-lg p-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                          i === 0 ? 'bg-amber-500/20 text-amber-400' : 
                          i === 1 ? 'bg-slate-400/20 text-slate-300' : 
                          i === 2 ? 'bg-orange-600/20 text-orange-400' : 
                          'bg-slate-700/50 text-slate-400'
                        }`}>
                          #{i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium truncate text-sm">{p.name || p.sku}</p>
                          <p className="text-slate-500 text-xs">{p.sku}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-emerald-400 font-semibold">{formatCurrency(p.revenue)}</p>
                          <p className="text-slate-500 text-xs">{p.units} units</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </DashboardWidget>
              )}
              
              {/* Worst Sellers YTD */}
              {isWidgetEnabled('worstSellersYTD') && performanceYTD.worst.length > 0 && (
                <DashboardWidget id="worstSellersYTD" title="Needs Attention (YTD)" icon={AlertTriangle} className="mb-6">
                  <p className="text-slate-400 text-xs mb-3">Lowest performing products year-to-date</p>
                  <div className="space-y-2">
                    {performanceYTD.worst.map((p, i) => (
                      <div key={p.sku} className="flex items-center gap-3 bg-rose-900/20 rounded-lg p-3 border border-rose-500/20">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-rose-500/20">
                          <TrendingDown className="w-4 h-4 text-rose-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium truncate text-sm">{p.name || p.sku}</p>
                          <p className="text-slate-500 text-xs">{p.sku}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-rose-400 font-semibold">{formatCurrency(p.revenue)}</p>
                          <p className="text-slate-500 text-xs">{p.units} units</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </DashboardWidget>
              )}
              
              {/* Quick Action Widgets */}
              <div style={{ order: Math.min(getWidgetOrder('salesTax'), getWidgetOrder('aiForecast'), getWidgetOrder('billsDue'), getWidgetOrder('syncStatus')) }} className="mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {(() => {
                  // Widget content renderers (just the content, no wrapper)
                  const renderSalesTax = () => (
                    <div 
                      className={`rounded-2xl border p-4 cursor-pointer hover:opacity-90 h-full ${
                        salesTaxDueThisMonth.some(s => s.isOverdue) 
                          ? 'bg-gradient-to-br from-rose-900/30 to-red-900/20 border-rose-500/30'
                          : salesTaxDueThisMonth.length > 0
                            ? 'bg-gradient-to-br from-violet-900/30 to-purple-900/20 border-violet-500/30'
                            : 'bg-slate-800/30 border-slate-700'
                      }`}
                      onClick={() => setView('sales-tax')}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className={`text-sm font-semibold flex items-center gap-2 ${
                          salesTaxDueThisMonth.some(s => s.isOverdue) ? 'text-rose-400' : salesTaxDueThisMonth.length > 0 ? 'text-violet-400' : 'text-slate-400'
                        }`}>
                          <DollarSign className="w-4 h-4" />Sales Tax
                        </h3>
                        <span className="text-xs text-slate-400">This month</span>
                      </div>
                      {salesTaxDueThisMonth.length > 0 ? (
                        <>
                          <p className="text-lg font-bold text-white mb-1">{salesTaxDueThisMonth.length} filing{salesTaxDueThisMonth.length > 1 ? 's' : ''} due</p>
                          <div className="space-y-1">
                            {salesTaxDueThisMonth.slice(0, 2).map((st, i) => (
                              <p key={i} className={`text-xs ${st.isOverdue ? 'text-rose-400' : st.daysUntil <= 7 ? 'text-amber-400' : 'text-slate-400'}`}>
                                {st.stateName}: {st.isOverdue ? 'OVERDUE' : `${st.daysUntil}d`}
                              </p>
                            ))}
                          </div>
                        </>
                      ) : Object.keys(salesTaxConfig.nexusStates || {}).length > 0 ? (
                        <>
                          <p className="text-emerald-400 text-sm mb-1 flex items-center gap-1"><Check className="w-4 h-4" />All clear</p>
                          <p className="text-slate-500 text-xs">No filings due</p>
                        </>
                      ) : (
                        <>
                          <p className="text-slate-500 text-sm mb-1">No nexus configured</p>
                          <p className="text-xs text-violet-400">Setup states →</p>
                        </>
                      )}
                    </div>
                  );

                  const renderAiForecast = () => (
                    aiForecasts && !aiForecasts.error && aiForecasts.salesForecast ? (
                      <div className="bg-gradient-to-br from-purple-900/30 to-indigo-900/20 rounded-2xl border border-purple-500/30 p-4 h-full">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-purple-400 text-sm font-semibold flex items-center gap-2">
                            <Brain className="w-4 h-4" />AI Forecast
                          </h3>
                          <span className="text-xs text-slate-400">Multi-Signal</span>
                        </div>
                        {aiForecasts.salesForecast.next4Weeks?.[0] && (
                          <>
                            <p className="text-2xl font-bold text-white">{formatCurrency(aiForecasts.salesForecast.next4Weeks[0].predictedRevenue || 0)}</p>
                            <p className="text-slate-400 text-sm">Next week</p>
                            <p className={`text-xs mt-1 ${(aiForecasts.salesForecast.next4Weeks[0].predictedProfit || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {formatCurrency(aiForecasts.salesForecast.next4Weeks[0].predictedProfit || 0)} profit
                            </p>
                          </>
                        )}
                        <button 
                          onClick={generateAIForecasts}
                          disabled={aiForecastLoading}
                          className="mt-2 text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
                        >
                          {aiForecastLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          Refresh
                        </button>
                      </div>
                    ) : (
                      <div className="bg-gradient-to-br from-purple-900/20 to-slate-800 rounded-2xl border border-dashed border-purple-500/30 p-4 h-full">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-purple-400 text-sm font-semibold flex items-center gap-2">
                            <Brain className="w-4 h-4" />AI Forecast
                          </h3>
                        </div>
                        <p className="text-slate-400 text-sm mb-2">Multi-signal predictions</p>
                        <button 
                          onClick={generateAIForecasts}
                          disabled={aiForecastLoading || (Object.keys(allWeeksData).length < 2 && Object.keys(allDaysData).filter(d => hasDailySalesData(allDaysData[d])).length < 7)}
                          className="text-xs bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 px-3 py-1.5 rounded-lg text-white flex items-center gap-1"
                        >
                          {aiForecastLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                          Generate
                        </button>
                      </div>
                    )
                  );

                  const renderBillsDue = () => (
                    upcomingBills.length > 0 ? (
                      <div className="bg-gradient-to-br from-rose-900/30 to-pink-900/20 rounded-2xl border border-rose-500/30 p-4 cursor-pointer hover:border-rose-400/50 h-full" onClick={() => setShowInvoiceModal(true)}>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-rose-400 text-sm font-semibold flex items-center gap-2">
                            <FileText className="w-4 h-4" />Bills Due
                          </h3>
                          <span className="text-xs text-slate-400">{upcomingBills.length}</span>
                        </div>
                        <p className="text-2xl font-bold text-white">{formatCurrency(totalUpcomingBills)}</p>
                        {(() => {
                          const nextBill = upcomingBills.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
                          const daysUntil = Math.ceil((new Date(nextBill.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
                          return (
                            <>
                              <p className="text-slate-400 text-sm truncate">Next: {nextBill.vendor}</p>
                              <p className={`text-xs ${daysUntil <= 3 ? 'text-rose-400' : 'text-slate-500'}`}>
                                {daysUntil <= 0 ? 'Due today!' : `${daysUntil}d`}
                              </p>
                            </>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="bg-slate-800/30 rounded-2xl border border-dashed border-slate-600 p-4 h-full">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-slate-400 text-sm font-semibold flex items-center gap-2">
                            <FileText className="w-4 h-4" />Bills Due
                          </h3>
                        </div>
                        <p className="text-slate-500 text-sm mb-2">No bills tracked</p>
                        <button onClick={() => setShowInvoiceModal(true)} className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1">
                          <Plus className="w-3 h-3" />Add bill
                        </button>
                      </div>
                    )
                  );

                  const renderSyncStatus = () => (
                    <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-4 h-full">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-slate-300 text-sm font-semibold flex items-center gap-2">
                          <Database className="w-4 h-4" />Data Status
                        </h3>
                        {runAutoSync && (
                          <button 
                            onClick={() => runAutoSync(true)} 
                            disabled={autoSyncStatus?.running}
                            className="px-2 py-1 bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/50 rounded-lg text-xs text-violet-300 flex items-center gap-1 disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3 h-3 ${autoSyncStatus?.running ? 'animate-spin' : ''}`} />
                            {autoSyncStatus?.running ? 'Syncing...' : 'Sync All'}
                          </button>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 text-sm">Cloud</span>
                          {!supabase ? (
                            <span className="text-slate-500 text-xs">Off</span>
                          ) : session ? (
                            <span className="text-emerald-400 text-xs flex items-center gap-1"><Check className="w-3 h-3" />On</span>
                          ) : (
                            <span className="text-amber-400 text-xs">Local</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 text-sm">Backup</span>
                          {lastBackupDate ? (
                            <span className="text-slate-400 text-xs">{new Date(lastBackupDate).toLocaleDateString()}</span>
                          ) : (
                            <span className="text-slate-500 text-xs">Never</span>
                          )}
                        </div>
                        <button onClick={exportAll} className="w-full mt-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs text-white flex items-center justify-center gap-1">
                          <Download className="w-3 h-3" />Backup Now
                        </button>
                      </div>
                    </div>
                  );

                  // Map widget IDs to their render functions
                  const widgetRenderers = {
                    salesTax: renderSalesTax,
                    aiForecast: renderAiForecast,
                    billsDue: renderBillsDue,
                    syncStatus: renderSyncStatus,
                  };

                  const gridWidgetIds = ['salesTax', 'aiForecast', 'billsDue', 'syncStatus'];

                  return gridWidgetIds.filter(id => isWidgetEnabled(id)).map(id => (
                    <DraggableWidget key={id} id={id}>
                      {widgetRenderers[id]()}
                    </DraggableWidget>
                  ));
                })()}
              </div>
              </div>
              
              {/* Quick Upload Alert - Show if most recent week is missing */}
              <div style={{ order: 50 }}>
              {(() => {
                const today = new Date();
                const sortedWeeks = Object.keys(allWeeksData).sort();
                if (sortedWeeks.length === 0) return null; // Don't show if no data at all
                
                // Get the expected most recent week end (last Sunday)
                const dayOfWeek = today.getDay(); // 0 = Sunday
                const lastSunday = new Date(today);
                // Go back to the most recent Sunday
                if (dayOfWeek !== 0) {
                  lastSunday.setDate(today.getDate() - dayOfWeek);
                }
                const expectedWeekEnd = `${lastSunday.getFullYear()}-${String(lastSunday.getMonth() + 1).padStart(2, '0')}-${String(lastSunday.getDate()).padStart(2, '0')}`;
                
                // Check if we have data for the expected week OR the most recent week is within 7 days
                const hasExpectedWeek = allWeeksData[expectedWeekEnd];
                const mostRecentWeek = sortedWeeks[sortedWeeks.length - 1];
                const mostRecentDate = new Date(mostRecentWeek + 'T00:00:00');
                const daysSinceLast = Math.floor((today - mostRecentDate) / (1000 * 60 * 60 * 24));
                
                // Only show alert if the most recent data is more than 7 days old AND we don't have this week
                if (!hasExpectedWeek && daysSinceLast > 7) {
                  return (
                    <div className="bg-violet-900/20 border border-violet-500/30 rounded-xl p-4 mb-6 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Calendar className="w-5 h-5 text-violet-400" />
                        <div>
                          <p className="text-violet-300 font-medium">Most recent week data missing</p>
                          <p className="text-slate-400 text-sm">Week ending {new Date(expectedWeekEnd + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} (last data: {daysSinceLast} days ago)</p>
                        </div>
                      </div>
                      <button onClick={() => { setWeekEnding(expectedWeekEnd); setUploadTab('amazon-bulk'); setView('upload'); }} className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm text-white flex items-center gap-2">
                        <Upload className="w-4 h-4" />Upload This Week
                      </button>
                    </div>
                  );
                }
                return null;
              })()}
              </div>
              
              {/* ============ DATA HUB - Complete Data Status ============ */}
              {isWidgetEnabled('dataHub') && (
              <DraggableWidget id="dataHub" className="mb-6">
              <div className="bg-gradient-to-r from-slate-800/70 to-slate-900/70 rounded-2xl border border-purple-500/30 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <Database className="w-5 h-5 text-purple-400" />
                    Data Hub - What's Powering Your Predictions
                  </h3>
                  <button onClick={() => setView('analytics')} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
                    View Forecast Accuracy →
                  </button>
                </div>
                
                {/* Data Actions Required */}
                {dataStatus.nextActions.length > 0 && (
                  <div className="mb-4 space-y-2">
                    {dataStatus.nextActions.slice(0, 3).map((action, idx) => (
                      <div key={idx} className={`flex items-center justify-between p-3 rounded-lg text-sm ${
                        action.priority === 'high' ? 'bg-rose-900/30 border border-rose-500/30' :
                        action.priority === 'medium' ? 'bg-amber-900/30 border border-amber-500/30' :
                        'bg-slate-700/30 border border-slate-600/30'
                      }`}>
                        <div className="flex items-center gap-2">
                          <AlertCircle className={`w-4 h-4 ${
                            action.priority === 'high' ? 'text-rose-400' :
                            action.priority === 'medium' ? 'text-amber-400' : 'text-slate-400'
                          }`} />
                          <span className={
                            action.priority === 'high' ? 'text-rose-300' :
                            action.priority === 'medium' ? 'text-amber-300' : 'text-slate-300'
                          }>{action.message}</span>
                        </div>
                        <button 
                          onClick={() => {
                            if (action.action === 'upload-forecast') { setUploadTab('forecast'); setView('upload'); }
                            else if (action.action === 'upload-weekly') { setUploadTab('amazon-bulk'); setView('upload'); }
                            else if (action.action === 'upload-daily') { setUploadTab('amazon-bulk'); setView('upload'); }
                            else if (action.action === 'aggregate-daily') aggregateDailyToWeekly();
                          }}
                          className="px-3 py-1 bg-slate-600/50 hover:bg-slate-500/50 rounded text-xs text-white"
                        >
                          {action.action === 'aggregate-daily' ? 'Aggregate' : 'Upload Now'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  {/* Amazon Forecasts Status - NEW PROMINENT CARD */}
                  <div className="bg-gradient-to-br from-amber-900/30 to-orange-900/20 rounded-xl p-3 border border-amber-500/30">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-medium text-amber-300 uppercase">Amazon Forecasts</span>
                      </div>
                    </div>
                    <div className="space-y-1 mb-2">
                      {['7day', '30day', '60day'].map(type => {
                        const status = dataStatus.forecastStatus[type];
                        return (
                          <div key={type} className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">{status.type}</span>
                            {status.status === 'active' ? (
                              <span className="text-emerald-400 flex items-center gap-1">
                                <Check className="w-3 h-3" />{status.daysUntilExpiry}d
                              </span>
                            ) : status.status === 'expiring' ? (
                              <span className="text-amber-400">⚠️ {status.daysUntilExpiry}d</span>
                            ) : status.status === 'expired' ? (
                              <span className="text-rose-400">Expired</span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <button 
                      onClick={() => { setUploadTab('forecast'); setView('upload'); }}
                      className="w-full py-1.5 bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/50 rounded-lg text-xs text-amber-300 flex items-center justify-center gap-1"
                    >
                      <Upload className="w-3 h-3" /> Update
                    </button>
                  </div>
                  
                  {/* Daily Data Status */}
                  <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="w-4 h-4 text-cyan-400" />
                      <span className="text-xs font-medium text-slate-300 uppercase">Daily Data</span>
                    </div>
                    <p className="text-lg font-semibold text-white">{dataStatus.dailyStatus.totalDays} days</p>
                    <p className="text-xs text-slate-400 mb-2">
                      {dataStatus.dailyStatus.streak > 0 ? (
                        <span className="text-emerald-400">🔥 {dataStatus.dailyStatus.streak}-day streak</span>
                      ) : dataStatus.dailyStatus.newestDate ? (
                        `Latest: ${new Date(dataStatus.dailyStatus.newestDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                      ) : 'No data yet'}
                    </p>
                    <button 
                      onClick={() => { setUploadTab('amazon-bulk'); setView('upload'); }}
                      className="w-full py-1.5 bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/50 rounded-lg text-xs text-cyan-300 flex items-center justify-center gap-1"
                    >
                      <Upload className="w-3 h-3" /> Upload
                    </button>
                  </div>
                  
                  {/* Weekly Data Status */}
                  <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700">
                    <div className="flex items-center gap-2 mb-2">
                      <CalendarRange className="w-4 h-4 text-violet-400" />
                      <span className="text-xs font-medium text-slate-300 uppercase">Weekly Data</span>
                    </div>
                    <p className="text-lg font-semibold text-white">{dataStatus.weeklyStatus.totalWeeks} weeks</p>
                    <p className="text-xs text-slate-400 mb-2">
                      {dataStatus.weeklyStatus.newestWeek ? (
                        `Latest: ${new Date(dataStatus.weeklyStatus.newestWeek + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                      ) : 'No data yet'}
                    </p>
                    <button 
                      onClick={() => { setUploadTab('amazon-bulk'); setView('upload'); }}
                      className="w-full py-1.5 bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/50 rounded-lg text-xs text-violet-300 flex items-center justify-center gap-1"
                    >
                      <Upload className="w-3 h-3" /> Upload
                    </button>
                  </div>
                  
                  {/* Inventory Status */}
                  <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700">
                    <div className="flex items-center gap-2 mb-2">
                      <Boxes className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-medium text-slate-300 uppercase">Inventory</span>
                    </div>
                    <p className="text-lg font-semibold text-white">{Object.keys(invHistory).length} snapshots</p>
                    <p className="text-xs text-slate-400 mb-2">
                      {Object.keys(invHistory).length > 0 ? (
                        `Latest: ${new Date(Object.keys(invHistory).sort().reverse()[0] + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                      ) : 'No data yet'}
                    </p>
                    <button 
                      onClick={() => { setUploadTab('inventory'); setView('upload'); }}
                      className="w-full py-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/50 rounded-lg text-xs text-emerald-300 flex items-center justify-center gap-1"
                    >
                      <Upload className="w-3 h-3" /> Upload
                    </button>
                  </div>
                  
                  {/* AI Learning Status */}
                  <div className={`rounded-xl p-3 border ${dataStatus.learningStatus.active ? 'bg-gradient-to-br from-purple-900/30 to-indigo-900/20 border-purple-500/30' : 'bg-slate-800/50 border-slate-700'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Brain className="w-4 h-4 text-purple-400" />
                      <span className="text-xs font-medium text-slate-300 uppercase">AI Learning</span>
                    </div>
                    <p className={`text-lg font-semibold ${dataStatus.learningStatus.active ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {dataStatus.learningStatus.active ? 'Active' : 'Training'}
                    </p>
                    <p className="text-xs text-slate-400 mb-2">
                      {dataStatus.learningStatus.samples} samples • {dataStatus.learningStatus.confidence.toFixed(0)}% conf
                    </p>
                    <button 
                      onClick={() => { setAnalyticsTab('amazon-accuracy'); setView('analytics'); }}
                      className="w-full py-1.5 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/50 rounded-lg text-xs text-purple-300 flex items-center justify-center gap-1"
                    >
                      <Eye className="w-3 h-3" /> View Accuracy
                    </button>
                  </div>
                </div>
                
                {/* Forecast vs Actuals - Link only to avoid circular dependency */}
                {Object.keys(amazonForecasts).length > 0 && Object.keys(allWeeksData).length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-700/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Forecast vs Actuals tracking available</span>
                      </div>
                      <button 
                        onClick={() => { setAnalyticsTab('amazon-accuracy'); setView('analytics'); }}
                        className="text-xs text-purple-400 hover:text-purple-300"
                      >
                        View Accuracy Details →
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Data Flow Visualization */}
                <div className="mt-4 pt-4 border-t border-slate-700/50">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-cyan-500" />
                        <span className="text-slate-400">Daily</span>
                      </div>
                      <span className="text-slate-600">→</span>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-violet-500" />
                        <span className="text-slate-400">Weekly</span>
                      </div>
                      <span className="text-slate-600">→</span>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-slate-400">Inventory Velocity</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="text-slate-400">Forecasts</span>
                      </div>
                      <span className="text-slate-600">+</span>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-purple-500" />
                        <span className="text-slate-400">Learning</span>
                      </div>
                      <span className="text-slate-600">→</span>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-slate-400">Predictions</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              </DraggableWidget>
              )}
              {/* ============ END DATA HUB ============ */}
              
              {/* ============ DAILY CALENDAR ============ */}
              {isWidgetEnabled('calendar') && Object.keys(allDaysData).filter(d => hasDailySalesData(allDaysData[d])).length > 0 && (
                <DraggableWidget id="calendar" className="mb-6">
                <div className="bg-gradient-to-br from-slate-800 to-slate-800/50 rounded-2xl border border-slate-700 p-6 shadow-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                        <Calendar className="w-5 h-5 text-cyan-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white">Daily Calendar</h3>
                        <p className="text-slate-400 text-xs">Click any day to view details</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => { setTrendsTab('daily'); setView('trends'); }}
                      className="text-xs text-cyan-400 hover:text-cyan-300"
                    >
                      View Trends →
                    </button>
                  </div>
                  
                  {(() => {
                    // Get current month and year - use calendarMonth state if set, otherwise auto-detect
                    const now = new Date();
                    const daysWithSales = Object.keys(allDaysData).filter(d => hasDailySalesData(allDaysData[d])).sort();
                    const allDaysWithAny = Object.keys(allDaysData).sort();
                    const latestDate = daysWithSales.length > 0 ? new Date(daysWithSales[daysWithSales.length - 1] + 'T12:00:00') : now;
                    
                    // Use calendarMonth state if set, otherwise use latest data month
                    const viewMonth = calendarMonth ? calendarMonth.month : latestDate.getMonth();
                    const viewYear = calendarMonth ? calendarMonth.year : latestDate.getFullYear();
                    
                    // Get available months for navigation (months with any data)
                    const availableMonths = new Set();
                    allDaysWithAny.forEach(d => {
                      const date = new Date(d + 'T12:00:00');
                      availableMonths.add(`${date.getFullYear()}-${date.getMonth()}`);
                    });
                    const sortedMonths = Array.from(availableMonths).sort();
                    const currentMonthKey = `${viewYear}-${viewMonth}`;
                    const currentMonthIdx = sortedMonths.indexOf(currentMonthKey);
                    const hasPrevMonth = currentMonthIdx > 0;
                    const hasNextMonth = currentMonthIdx < sortedMonths.length - 1;
                    
                    // Get first day of month and number of days
                    const firstDay = new Date(viewYear, viewMonth, 1);
                    const lastDay = new Date(viewYear, viewMonth + 1, 0);
                    const startPadding = firstDay.getDay(); // 0=Sunday
                    const totalDays = lastDay.getDate();
                    
                    // Calculate month totals
                    const monthDays = daysWithSales.filter(d => {
                      const date = new Date(d + 'T12:00:00');
                      return date.getMonth() === viewMonth && date.getFullYear() === viewYear;
                    });
                    const monthRevenue = monthDays.reduce((sum, d) => sum + (allDaysData[d]?.total?.revenue || 0), 0);
                    const monthProfit = monthDays.reduce((sum, d) => sum + (getProfit(allDaysData[d]?.total)), 0);
                    
                    // Count days missing ads data and track which days
                    const daysMissingMetaList = monthDays.filter(d => {
                      const data = allDaysData[d];
                      return !((data?.shopify?.metaSpend || data?.metaSpend || data?.metaAds || 0) > 0);
                    });
                    const daysMissingGoogleList = monthDays.filter(d => {
                      const data = allDaysData[d];
                      return !((data?.shopify?.googleSpend || data?.googleSpend || data?.googleAds || 0) > 0);
                    });
                    const daysMissingMeta = daysMissingMetaList.length;
                    const daysMissingGoogle = daysMissingGoogleList.length;
                    
                    // Format dates for display (just day numbers)
                    const formatMissingDays = (days) => {
                      if (days.length === 0) return '';
                      if (days.length <= 7) {
                        return days.map(d => parseInt(d.split('-')[2])).join(', ');
                      }
                      // If more than 7, show first 5 + "..."
                      const dayNums = days.map(d => parseInt(d.split('-')[2]));
                      return dayNums.slice(0, 5).join(', ') + ` +${days.length - 5} more`;
                    };
                    
                    // Navigate to prev/next month
                    const goPrevMonth = () => {
                      if (hasPrevMonth) {
                        const [year, month] = sortedMonths[currentMonthIdx - 1].split('-').map(Number);
                        setCalendarMonth({ year, month });
                      }
                    };
                    const goNextMonth = () => {
                      if (hasNextMonth) {
                        const [year, month] = sortedMonths[currentMonthIdx + 1].split('-').map(Number);
                        setCalendarMonth({ year, month });
                      }
                    };
                    const goToLatest = () => setCalendarMonth(null);
                    
                    return (
                      <>
                        {/* Month Header with Navigation */}
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={goPrevMonth}
                              disabled={!hasPrevMonth}
                              className={`w-7 h-7 flex items-center justify-center rounded-lg ${hasPrevMonth ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-800/50 text-slate-600 cursor-not-allowed'}`}
                            >
                              ←
                            </button>
                            <h4 className="text-white font-medium min-w-[140px] text-center">
                              {new Date(viewYear, viewMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                            </h4>
                            <button 
                              onClick={goNextMonth}
                              disabled={!hasNextMonth}
                              className={`w-7 h-7 flex items-center justify-center rounded-lg ${hasNextMonth ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-800/50 text-slate-600 cursor-not-allowed'}`}
                            >
                              →
                            </button>
                            {calendarMonth && (
                              <button onClick={goToLatest} className="ml-2 px-2 py-1 text-xs bg-cyan-500/20 text-cyan-400 rounded hover:bg-cyan-500/30">
                                Latest
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-slate-400">{monthDays.length} days</span>
                            <span className="text-emerald-400">{formatCurrency(monthRevenue)}</span>
                            <span className={monthProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{formatCurrency(monthProfit)} profit</span>
                          </div>
                        </div>
                        
                        {/* Missing Ads Data Alert - only show for current month */}
                        {(() => {
                          const isCurrentMonth = viewMonth === now.getMonth() && viewYear === now.getFullYear();
                          if (!isCurrentMonth) return null;
                          if (monthDays.length === 0) return null;
                          if (daysMissingMeta === 0 && daysMissingGoogle === 0) return null;
                          
                          return (
                            <div className="mb-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span>⚠️ Missing ads data:</span>
                                {daysMissingMeta > 0 && (
                                  <span className="px-2 py-0.5 bg-blue-500/20 rounded" title={daysMissingMetaList.join(', ')}>
                                    Meta: {daysMissingMeta} days ({formatMissingDays(daysMissingMetaList)})
                                  </span>
                                )}
                                {daysMissingGoogle > 0 && (
                                  <span className="px-2 py-0.5 bg-yellow-500/20 rounded" title={daysMissingGoogleList.join(', ')}>
                                    Google: {daysMissingGoogle} days ({formatMissingDays(daysMissingGoogleList)})
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                        
                        {/* Calendar Grid */}
                        <div className="grid grid-cols-7 gap-1 mb-2">
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                            <div key={day} className="text-center text-xs text-slate-500 py-1">{day}</div>
                          ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                          {/* Padding for days before month starts */}
                          {Array(startPadding).fill(null).map((_, i) => (
                            <div key={`pad-${i}`} className="h-12" />
                          ))}
                          
                          {/* Calendar days */}
                          {Array(totalDays).fill(null).map((_, i) => {
                            const dayNum = i + 1;
                            const dateKey = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                            const dayData = allDaysData[dateKey];
                            const hasSales = hasDailySalesData(dayData);
                            const hasAdsOnly = dayData && !hasSales;
                            const isToday = dateKey === formatDateKey(now);
                            const revenue = dayData?.total?.revenue || 0;
                            
                            // Calculate profit - use stored value or calculate from components
                            let profit = dayData?.total?.netProfit || 0;
                            if (profit === 0 && revenue > 0) {
                              // Fallback: calculate from amazon + shopify profits
                              const amzProfit = dayData?.amazon?.netProfit || 0;
                              const shopProfit = dayData?.shopify?.netProfit || 0;
                              profit = amzProfit + shopProfit;
                              // If still 0, try to calculate from revenue - cogs - ads
                              if (profit === 0) {
                                const amzRev = dayData?.amazon?.revenue || 0;
                                const amzCogs = dayData?.amazon?.cogs || 0;
                                const amzFees = dayData?.amazon?.fees || 0;
                                const amzAds = dayData?.amazon?.adSpend || 0;
                                const shopRev = dayData?.shopify?.revenue || 0;
                                const shopCogs = dayData?.shopify?.cogs || 0;
                                const shopAds = dayData?.shopify?.adSpend || dayData?.shopify?.metaSpend || 0;
                                const metaAds = dayData?.metaSpend || dayData?.metaAds || 0;
                                const googleAds = dayData?.googleSpend || dayData?.googleAds || 0;
                                profit = (amzRev - amzCogs - amzFees - amzAds) + (shopRev - shopCogs - shopAds - metaAds - googleAds);
                              }
                            }
                            
                            // Check if day has specific ads data - check ALL possible locations
                            const googleAds = dayData?.googleSpend || dayData?.googleAds || dayData?.shopify?.googleSpend || dayData?.shopify?.googleAds || 0;
                            const metaAds = dayData?.metaSpend || dayData?.metaAds || dayData?.shopify?.metaSpend || dayData?.shopify?.metaAds || 0;
                            const hasGoogle = googleAds > 0;
                            const hasMeta = metaAds > 0;
                            
                            return (
                              <div 
                                key={dayNum}
                                onClick={() => {
                                  if (hasSales) {
                                    setViewingDayDetails(dateKey);
                                  } else if (hasAdsOnly) {
                                    setSelectedDay(dateKey);
                                    setUploadTab('amazon-bulk');
                                    setView('upload');
                                  }
                                }}
                                className={`h-16 rounded-lg p-1 text-center relative transition-all ${
                                  hasSales 
                                    ? 'bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 cursor-pointer' 
                                    : hasAdsOnly
                                      ? 'bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 cursor-pointer'
                                      : 'bg-slate-800/50 border border-slate-700/50'
                                } ${isToday ? 'ring-2 ring-white/50' : ''}`}
                              >
                                <div className={`text-xs font-medium ${hasSales ? 'text-cyan-300' : hasAdsOnly ? 'text-amber-400/60' : 'text-slate-500'}`}>
                                  {dayNum}
                                </div>
                                {hasSales && (
                                  <>
                                    <div className="text-[10px] font-medium text-cyan-400 truncate">
                                      {formatCurrency(revenue).replace('$', '').replace('.00', '')}
                                    </div>
                                    <div className={`text-[9px] font-medium truncate ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      {profit >= 0 ? '+' : ''}{formatCurrency(profit).replace('$', '').replace('.00', '')}
                                    </div>
                                    {/* Ad platform indicators */}
                                    {(hasMeta || hasGoogle) && (
                                      <div className="flex justify-center gap-0.5 mt-0.5">
                                        {hasMeta && <span className="text-[7px] text-blue-400 font-medium bg-blue-500/20 px-0.5 rounded">M</span>}
                                        {hasGoogle && <span className="text-[7px] text-yellow-400 font-medium bg-yellow-500/20 px-0.5 rounded">G</span>}
                                      </div>
                                    )}
                                  </>
                                )}
                                {hasAdsOnly && (
                                  <div className="flex justify-center gap-0.5 mt-1">
                                    {hasMeta && <span className="text-[7px] text-blue-400 font-medium bg-blue-500/20 px-0.5 rounded">M</span>}
                                    {hasGoogle && <span className="text-[7px] text-yellow-400 font-medium bg-yellow-500/20 px-0.5 rounded">G</span>}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        
                        {/* Legend */}
                        <div className="flex items-center justify-center gap-4 mt-4 text-xs text-slate-400 flex-wrap">
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded bg-cyan-500/20 border border-cyan-500/30" />
                            <span>Sales data</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[8px] text-blue-400 font-medium bg-blue-500/20 px-1 rounded">M</span>
                            <span>Meta ads</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[8px] text-yellow-400 font-medium bg-yellow-500/20 px-1 rounded">G</span>
                            <span>Google ads</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded bg-amber-500/10 border border-amber-500/20" />
                            <span>Ads only</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded bg-slate-800/50 border border-slate-700/50" />
                            <span>No data</span>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
                </DraggableWidget>
              )}
              {/* ============ END DAILY CALENDAR ============ */}
              
              {/* Time Range Toggle & Key Metrics - Optional Widget */}
              {isWidgetEnabled('summaryMetrics') && (
              <DraggableWidget id="summaryMetrics" className="mb-6">
              <>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="text-slate-400 text-sm mr-2">View:</span>
                {[
                  { key: 'yesterday', label: 'Yesterday' },
                  { key: 'week', label: 'Week' },
                  { key: 'month', label: 'Month' },
                  { key: 'quarter', label: 'Quarter' },
                  { key: 'year', label: 'Year' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setDashboardRange(key)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      dashboardRange === key
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                {usingPeriodData && (
                  <span className="text-xs text-teal-400 ml-2">(from period data)</span>
                )}
                {usingDailyData && (
                  <span className="text-xs text-cyan-400 ml-2">(from daily data)</span>
                )}
              </div>
              
              {/* No Daily Data Message */}
              {dashboardRange === 'yesterday' && !usingDailyData && (
                <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-8 mb-6 text-center">
                  <Clock className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <h3 className="text-lg font-semibold text-white mb-2">No Daily Data Available</h3>
                  <p className="text-slate-400 mb-4">Upload yesterday's sales data to see daily metrics</p>
                  <button 
                    onClick={() => { setUploadTab('amazon-bulk'); setView('upload'); }}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-white font-medium"
                  >
                    Upload Daily Data
                  </button>
                </div>
              )}
              
              {/* Daily Channel Breakdown (only for yesterday view) */}
              {dashboardRange === 'yesterday' && usingDailyData && current.date && (
                <div className="bg-slate-800/50 rounded-2xl border border-cyan-500/30 p-5 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-cyan-400 uppercase flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      {new Date(current.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-orange-900/20 rounded-xl border border-orange-500/30 p-4">
                      <p className="text-orange-400 text-sm font-medium mb-1">🛒 Amazon</p>
                      <p className="text-xl font-bold text-white">{formatCurrency(current.amazonRev || 0)}</p>
                      <p className="text-slate-500 text-xs mt-1">{current.revenue > 0 ? ((current.amazonRev / current.revenue) * 100).toFixed(0) : 0}% of total</p>
                    </div>
                    <div className="bg-green-900/20 rounded-xl border border-green-500/30 p-4">
                      <p className="text-green-400 text-sm font-medium mb-1">🛍️ Shopify</p>
                      <p className="text-xl font-bold text-white">{formatCurrency(current.shopifyRev || 0)}</p>
                      <p className="text-slate-500 text-xs mt-1">{current.revenue > 0 ? ((current.shopifyRev / current.revenue) * 100).toFixed(0) : 0}% of total</p>
                    </div>
                  </div>
                </div>
              )}
              
              {(dashboardRange !== 'yesterday' || usingDailyData) && (
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                <div className="bg-gradient-to-br from-emerald-900/40 to-emerald-800/20 rounded-2xl border border-emerald-500/30 p-5">
                  <p className="text-emerald-400 text-sm font-medium mb-1">Revenue</p>
                  <p className="text-2xl lg:text-3xl font-bold text-white">{formatCurrency(current.revenue)}</p>
                  {revenueChange !== 0 && (
                    <p className={`text-sm flex items-center gap-1 mt-1 ${revenueChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {revenueChange >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      {Math.abs(revenueChange).toFixed(1)}% {comparisonLabel}
                    </p>
                  )}
                </div>
                <div className={`rounded-2xl border p-5 ${current.profit >= 0 ? 'bg-gradient-to-br from-blue-900/40 to-blue-800/20 border-blue-500/30' : 'bg-gradient-to-br from-rose-900/40 to-rose-800/20 border-rose-500/30'}`}>
                  <p className={`text-sm font-medium mb-1 ${current.profit >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>Net Profit</p>
                  <p className="text-2xl lg:text-3xl font-bold text-white">{formatCurrency(current.profit)}</p>
                  {profitChange !== 0 && (
                    <p className={`text-sm flex items-center gap-1 mt-1 ${profitChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {profitChange >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      {Math.abs(profitChange).toFixed(1)}% {comparisonLabel}
                    </p>
                  )}
                </div>
                <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5">
                  <p className="text-slate-400 text-sm font-medium mb-1">Units Sold</p>
                  <p className="text-2xl lg:text-3xl font-bold text-white">{formatNumber(current.units)}</p>
                </div>
                <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5">
                  <p className="text-slate-400 text-sm font-medium mb-1">Ad Spend</p>
                  <p className="text-2xl lg:text-3xl font-bold text-white">{formatCurrency(current.adSpend)}</p>
                  <p className="text-slate-500 text-sm mt-1">{current.revenue > 0 ? ((current.adSpend / current.revenue) * 100).toFixed(1) : 0}% TACOS</p>
                  {(current.googleAds > 0 || current.metaAds > 0 || current.amazonAds > 0) && (
                    <div className="mt-3 pt-3 border-t border-slate-700 space-y-1 text-xs">
                      {current.googleAds > 0 && <div className="flex justify-between"><span className="text-red-400">● Google</span><span className="text-white">{formatCurrency(current.googleAds)}</span></div>}
                      {current.metaAds > 0 && <div className="flex justify-between"><span className="text-blue-400">● Meta</span><span className="text-white">{formatCurrency(current.metaAds)}</span></div>}
                      {current.amazonAds > 0 && <div className="flex justify-between"><span className="text-orange-400">● Amazon</span><span className="text-white">{formatCurrency(current.amazonAds)}</span></div>}
                    </div>
                  )}
                </div>
                <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5">
                  <p className="text-slate-400 text-sm font-medium mb-1">Net Margin</p>
                  <p className={`text-2xl lg:text-3xl font-bold ${current.revenue > 0 && (current.profit / current.revenue) * 100 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {current.revenue > 0 ? ((current.profit / current.revenue) * 100).toFixed(1) : 0}%
                  </p>
                </div>
              </div>
              )}
              </>
              </DraggableWidget>
              )}
              {/* End Summary Metrics Widget */}
            </div>
          )}
        </div>
      </div>
    );

};

export default DashboardView;
