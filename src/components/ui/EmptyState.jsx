import React from 'react';
import { 
  Upload, BarChart3, TrendingUp, Boxes, DollarSign, Truck, Landmark, 
  Brain, Zap, Trophy, GitCompare, PieChart, ArrowRight, HelpCircle,
  Calendar, Database, Package, FileText
} from 'lucide-react';

// Preset configurations for each view
const presets = {
  daily: {
    icon: Calendar,
    color: 'amber',
    title: 'No Daily Data Yet',
    description: 'Upload daily sales reports or connect your Amazon SP-API to see day-by-day performance breakdowns.',
    steps: [
      { text: 'Go to Upload → Daily Sales', action: 'upload' },
      { text: 'Upload Amazon Business Report or Shopify Daily CSV', action: null },
      { text: 'Or connect SP-API in Settings for automatic daily sync', action: 'settings' },
    ],
  },
  weekly: {
    icon: Calendar,
    color: 'violet',
    title: 'No Weekly Data Yet',
    description: 'Import weekly sales data to track revenue, profit, and growth week over week.',
    steps: [
      { text: 'Go to Upload → Weekly Data', action: 'upload' },
      { text: 'Upload Amazon + Shopify reports for any week', action: null },
      { text: 'Or use Bulk Import to process multiple weeks at once', action: 'upload' },
    ],
  },
  trends: {
    icon: TrendingUp,
    color: 'cyan',
    title: 'Need More Data for Trends',
    description: 'Trends require at least 2 weeks of data to show patterns. Keep uploading and trends will appear automatically.',
    steps: [
      { text: 'Upload at least 2 weeks of sales data', action: 'upload' },
      { text: 'Daily data also generates trend charts', action: null },
    ],
  },
  yoy: {
    icon: GitCompare,
    color: 'indigo',
    title: 'Year-over-Year Needs Historical Data',
    description: 'Upload data from multiple time periods to compare performance across different timeframes.',
    steps: [
      { text: 'Import weekly or period data spanning multiple months', action: 'upload' },
      { text: 'Comparisons become available with 2+ periods', action: null },
    ],
  },
  profitability: {
    icon: PieChart,
    color: 'emerald',
    title: 'Set Up Profitability Tracking',
    description: 'To see profit margins and P&L breakdowns, you need sales data and COGS (cost of goods sold) configured.',
    steps: [
      { text: 'Upload sales data first', action: 'upload' },
      { text: 'Then set up COGS per SKU in the COGS Manager', action: 'cogs' },
      { text: 'Profit calculations appear automatically once both are set', action: null },
    ],
  },
  skus: {
    icon: Trophy,
    color: 'amber',
    title: 'No SKU Performance Data',
    description: 'SKU rankings need sales data with per-product breakdowns. Upload Amazon or Shopify reports with SKU-level detail.',
    steps: [
      { text: 'Upload reports that include SKU/ASIN columns', action: 'upload' },
      { text: 'Amazon Detail Page Sales or Shopify Product CSV work best', action: null },
    ],
  },
  ads: {
    icon: Zap,
    color: 'rose',
    title: 'No Advertising Data Yet',
    description: 'Upload ad campaign reports to analyze PPC performance, ROAS, and optimize your ad spend.',
    steps: [
      { text: 'Go to the Ads tab → Upload & Data', action: null },
      { text: 'Upload Amazon Sponsored Products/Brands campaign reports', action: null },
      { text: 'Or upload Meta/Google Ads exports for DTC analysis', action: null },
    ],
  },
  inventory: {
    icon: Boxes,
    color: 'blue',
    title: 'No Inventory Snapshots',
    description: 'Track stock levels, days of inventory, and reorder points by uploading inventory data or connecting Packiyo.',
    steps: [
      { text: 'Upload an Amazon FBA Inventory report', action: 'upload' },
      { text: 'Or connect Packiyo 3PL in Settings for live inventory', action: 'settings' },
      { text: 'Inventory alerts will trigger automatically when stock runs low', action: null },
    ],
  },
  '3pl': {
    icon: Truck,
    color: 'orange',
    title: 'No 3PL Cost Data',
    description: 'Track fulfillment costs by uploading invoices from your 3PL provider or entering costs manually.',
    steps: [
      { text: 'Upload 3PL invoice spreadsheets (Packiyo, ShipBob, etc.)', action: null },
      { text: 'Costs get matched to weeks for profit calculations', action: null },
    ],
  },
  banking: {
    icon: Landmark,
    color: 'slate',
    title: 'No Banking Data',
    description: 'Import bank statements to track cash flow, categorize expenses, and reconcile with your sales data.',
    steps: [
      { text: 'Connect QuickBooks Online in Settings', action: 'settings' },
      { text: 'Or upload bank statement CSV/OFX files', action: null },
    ],
  },
  forecast: {
    icon: Brain,
    color: 'purple',
    title: 'Start Forecasting',
    description: 'AI-powered forecasts need historical data to predict future sales, inventory needs, and revenue targets.',
    steps: [
      { text: 'Upload at least 2 weeks of sales data', action: 'upload' },
      { text: 'Forecasts improve with more historical data points', action: null },
      { text: 'Connect SP-API for the best automated forecasts', action: 'settings' },
    ],
  },
  'sales-tax': {
    icon: DollarSign,
    color: 'teal',
    title: 'Configure Sales Tax',
    description: 'Set up your nexus states and filing frequencies to track tax obligations and deadlines.',
    steps: [
      { text: 'Upload a Shopify Tax Report or Amazon Tax Document Library export', action: null },
      { text: 'Or manually add nexus states in the Sales Tax settings', action: null },
    ],
  },
};

const colorMap = {
  amber: { bg: 'from-amber-500 to-orange-600', ring: 'ring-amber-500/20', text: 'text-amber-400', btn: 'bg-amber-600 hover:bg-amber-500' },
  violet: { bg: 'from-violet-500 to-indigo-600', ring: 'ring-violet-500/20', text: 'text-violet-400', btn: 'bg-violet-600 hover:bg-violet-500' },
  cyan: { bg: 'from-cyan-500 to-blue-600', ring: 'ring-cyan-500/20', text: 'text-cyan-400', btn: 'bg-cyan-600 hover:bg-cyan-500' },
  indigo: { bg: 'from-indigo-500 to-blue-600', ring: 'ring-indigo-500/20', text: 'text-indigo-400', btn: 'bg-indigo-600 hover:bg-indigo-500' },
  emerald: { bg: 'from-emerald-500 to-green-600', ring: 'ring-emerald-500/20', text: 'text-emerald-400', btn: 'bg-emerald-600 hover:bg-emerald-500' },
  rose: { bg: 'from-rose-500 to-pink-600', ring: 'ring-rose-500/20', text: 'text-rose-400', btn: 'bg-rose-600 hover:bg-rose-500' },
  blue: { bg: 'from-blue-500 to-indigo-600', ring: 'ring-blue-500/20', text: 'text-blue-400', btn: 'bg-blue-600 hover:bg-blue-500' },
  orange: { bg: 'from-orange-500 to-red-600', ring: 'ring-orange-500/20', text: 'text-orange-400', btn: 'bg-orange-600 hover:bg-orange-500' },
  slate: { bg: 'from-slate-500 to-slate-600', ring: 'ring-slate-500/20', text: 'text-slate-400', btn: 'bg-slate-600 hover:bg-slate-500' },
  purple: { bg: 'from-purple-500 to-violet-600', ring: 'ring-purple-500/20', text: 'text-purple-400', btn: 'bg-purple-600 hover:bg-purple-500' },
  teal: { bg: 'from-teal-500 to-cyan-600', ring: 'ring-teal-500/20', text: 'text-teal-400', btn: 'bg-teal-600 hover:bg-teal-500' },
};

const EmptyState = ({ 
  preset, // Use a named preset from above
  icon: CustomIcon, 
  color: customColor,
  title: customTitle, 
  description: customDescription, 
  steps: customSteps,
  setView, // For navigation buttons
  setShowCogsManager, // For COGS action
  compact = false, // Smaller version for inline use
}) => {
  const config = preset ? presets[preset] : {};
  const Icon = CustomIcon || config.icon || HelpCircle;
  const color = customColor || config.color || 'slate';
  const title = customTitle || config.title || 'No Data Available';
  const description = customDescription || config.description || '';
  const steps = customSteps || config.steps || [];
  const c = colorMap[color] || colorMap.slate;

  const handleAction = (action) => {
    if (!action) return;
    if (action === 'upload' && setView) setView('upload');
    else if (action === 'settings' && setView) setView('settings');
    else if (action === 'cogs' && setShowCogsManager) setShowCogsManager(true);
    else if (setView) setView(action);
  };

  if (compact) {
    return (
      <div className="text-center py-8 px-4">
        <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${c.bg} mb-3 opacity-60`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <h3 className="text-white font-semibold mb-1">{title}</h3>
        <p className="text-slate-400 text-sm max-w-sm mx-auto mb-3">{description}</p>
        {steps.length > 0 && steps[0].action && (
          <button onClick={() => handleAction(steps[0].action)} className={`px-4 py-2 ${c.btn} rounded-lg text-sm text-white font-medium inline-flex items-center gap-2`}>
            {steps[0].text} <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto py-12 px-4">
      {/* Icon */}
      <div className="text-center mb-6">
        <div className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br ${c.bg} ring-4 ${c.ring} mb-4`}>
          <Icon className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
        <p className="text-slate-400 leading-relaxed">{description}</p>
      </div>

      {/* Steps */}
      {steps.length > 0 && (
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">How to get started</h3>
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className={`flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br ${c.bg} flex items-center justify-center mt-0.5`}>
                <span className="text-white text-xs font-bold">{i + 1}</span>
              </div>
              <div className="flex-1">
                {step.action ? (
                  <button 
                    onClick={() => handleAction(step.action)} 
                    className={`text-left ${c.text} hover:text-white transition-colors text-sm font-medium flex items-center gap-1`}
                  >
                    {step.text} <ArrowRight className="w-3 h-3" />
                  </button>
                ) : (
                  <p className="text-slate-300 text-sm">{step.text}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick action */}
      {steps.length > 0 && steps[0].action && (
        <div className="mt-6 text-center">
          <button 
            onClick={() => handleAction(steps[0].action)} 
            className={`px-6 py-3 ${c.btn} rounded-xl text-white font-semibold inline-flex items-center gap-2 shadow-lg transition-colors`}
          >
            <Upload className="w-4 h-4" /> Get Started
          </button>
        </div>
      )}
    </div>
  );
};

export default EmptyState;
