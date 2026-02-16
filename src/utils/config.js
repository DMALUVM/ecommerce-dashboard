// Dashboard configuration constants

// ============================================================
// AI MODEL CONFIGURATION
// ============================================================
// 🔧 UPDATE MODELS HERE when new versions are released.
//    This is the SINGLE SOURCE OF TRUTH — all components import from here.
//    After editing, no other files need to change.
//
//    To add a new model: add an entry to AI_MODELS below.
//    To change the default: update AI_DEFAULT_MODEL.
//    To retire a model: remove its entry from AI_MODELS.
// ============================================================

const AI_MODELS = {
  // Anthropic
  'claude-opus-4-6':             { label: 'Claude Opus 4.6',    provider: 'anthropic', cost: '~$0.25/report', tier: 'Premium',  desc: 'Most intelligent, deepest analysis' },
  'claude-sonnet-4-5-20250929':  { label: 'Claude Sonnet 4.5',  provider: 'anthropic', cost: '~$0.04/report', tier: 'Balanced', desc: 'Best value — fast, smart, cheap' },
  'claude-opus-4-5-20250918':    { label: 'Claude Opus 4.5',    provider: 'anthropic', cost: '~$0.20/report', tier: 'Premium',  desc: 'Deep analysis, 5x cost' },
  'claude-haiku-4-5-20251001':   { label: 'Claude Haiku 4.5',   provider: 'anthropic', cost: '~$0.01/report', tier: 'Fast',     desc: 'Cheapest, shorter reports' },
  // OpenAI
  'gpt-4o':                      { label: 'GPT-4o',             provider: 'openai',    cost: '~$0.06/report', tier: 'Balanced', desc: 'OpenAI flagship, balanced speed/quality' },
  'gpt-4o-mini':                 { label: 'GPT-4o Mini',        provider: 'openai',    cost: '~$0.01/report', tier: 'Fast',     desc: 'Fast and affordable' },
  'o3':                          { label: 'o3 (Reasoning)',      provider: 'openai',    cost: '~$0.40/report', tier: 'Premium',  desc: 'Deep reasoning, highest cost' },
};

// Default model used for reports, forecasts, and new chat sessions
const AI_DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

// Token budgets per model tier (used by ads chat & report generation)
const AI_TOKEN_BUDGETS = {
  opus:   { audit: 16000, followUp: 12000, report: 12000 },
  sonnet: { audit: 12000, followUp:  8000, report: 12000 },
  haiku:  { audit:  8000, followUp:  4096, report:  8000 },
};

// Helper: get tier name from model string (works for both Anthropic and OpenAI models)
const getModelTier = (model) => {
  if (model?.includes('opus') || model === 'o3')    return 'opus';
  if (model?.includes('haiku') || model === 'gpt-4o-mini') return 'haiku';
  return 'sonnet'; // default: sonnet, gpt-4o, etc.
};

// Helper: get provider from model string
const getModelProvider = (model) => AI_MODELS[model]?.provider || 'anthropic';

// Helper: get display label for a model string
const getModelLabel = (model) => AI_MODELS[model]?.label || model;

// Ordered list for <select> dropdowns
const AI_MODEL_OPTIONS = Object.entries(AI_MODELS).map(([key, m]) => ({
  value: key, label: m.label, provider: m.provider, cost: m.cost, tier: m.tier, desc: m.desc,
}));

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

export { DEFAULT_DASHBOARD_WIDGETS, AI_MODELS, AI_DEFAULT_MODEL, AI_TOKEN_BUDGETS, AI_MODEL_OPTIONS, getModelTier, getModelLabel, getModelProvider };
