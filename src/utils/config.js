// Dashboard configuration constants

// Dashboard widget configuration - defined at module level for consistent access
const DEFAULT_DASHBOARD_WIDGETS = {
  widgets: [
    { id: 'alerts', name: 'Alerts & Notifications', enabled: true, order: 0 },
    { id: 'todayPerformance', name: 'Last Week & MTD Performance', enabled: true, order: 1 },
    { id: 'weekProgress', name: 'This Week\'s Goal', enabled: true, order: 2 },
    { id: 'topSellers14d', name: 'Top Sellers (14 Days)', enabled: true, order: 3 },
    { id: 'worstSellers14d', name: 'Needs Attention (14 Days)', enabled: true, order: 4 },
    { id: 'topSellersYTD', name: 'Top Sellers (YTD)', enabled: false, order: 5 },
    { id: 'worstSellersYTD', name: 'Needs Attention (YTD)', enabled: false, order: 6 },
    { id: 'salesTax', name: 'Sales Tax Due', enabled: true, order: 7 },
    { id: 'aiForecast', name: 'AI Forecast', enabled: true, order: 8 },
    { id: 'billsDue', name: 'Bills & Invoices', enabled: true, order: 9 },
    { id: 'calendar', name: 'Daily Calendar', enabled: true, order: 10 },
    { id: 'summaryMetrics', name: 'Summary Metrics (Time Range)', enabled: false, order: 11 },
    { id: 'syncStatus', name: 'Sync & Backup Status', enabled: false, order: 12 },
    { id: 'quickUpload', name: 'Quick Upload', enabled: false, order: 13 },
    { id: 'dataHub', name: 'Data Hub', enabled: false, order: 14 },
  ],
  stacks: {}, // { 'salesTax': ['salesTax', 'billsDue'] } - widget stacks
  layout: 'auto',
};

export { DEFAULT_DASHBOARD_WIDGETS };
