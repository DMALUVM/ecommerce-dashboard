export const STORAGE_KEY = 'ecommerce_dashboard_v5';
export const INVENTORY_KEY = 'ecommerce_inventory_v5';
export const COGS_KEY = 'ecommerce_cogs_v1';
export const STORE_KEY = 'ecommerce_store_name_v1';
export const GOALS_KEY = 'ecommerce_goals_v1';
export const PERIODS_KEY = 'ecommerce_periods_v1';
export const SALES_TAX_KEY = 'ecommerce_sales_tax_v1';
export const PRODUCT_NAMES_KEY = 'ecommerce_product_names_v1';
export const SETTINGS_KEY = 'ecommerce_settings_v1';
export const NOTES_KEY = 'ecommerce_notes_v1';
export const WIDGET_KEY = 'ecommerce_widgets_v1';
export const THEME_KEY = 'ecommerce_theme_v1';
export const INVOICES_KEY = 'ecommerce_invoices_v1';
export const AMAZON_FORECAST_KEY = 'ecommerce_amazon_forecast_v1';
export const THREEPL_LEDGER_KEY = 'ecommerce_3pl_ledger_v1';
export const WEEKLY_REPORTS_KEY = 'ecommerce_weekly_reports_v1';
export const FORECAST_ACCURACY_KEY = 'ecommerce_forecast_accuracy_v1';
export const FORECAST_CORRECTIONS_KEY = 'ecommerce_forecast_corrections_v1';

// ============ LOCALSTORAGE COMPRESSION ============
// Simple LZW-based compression for localStorage (handles large datasets efficiently)
export const LZCompress = {
  compress: (str) => {
    if (!str || str.length < 1000) return str; // Don't compress small strings
    try {
      const dict = new Map();
      let dictSize = 256;
      for (let i = 0; i < 256; i++) dict.set(String.fromCharCode(i), i);
      
      let w = '';
      const result = [];
      for (const c of str) {
        const wc = w + c;
        if (dict.has(wc)) {
          w = wc;
        } else {
          result.push(dict.get(w));
          dict.set(wc, dictSize++);
          w = c;
        }
      }
      if (w) result.push(dict.get(w));
      
      // Convert to base64-safe string with marker
      return 'LZ1:' + result.map(n => String.fromCharCode(n + 32)).join('');
    } catch (e) {
      console.warn('LZCompress: compression failed, storing uncompressed', e);
      return str; // Return uncompressed on error
    }
  },
  decompress: (compressed) => {
    if (!compressed || !compressed.startsWith('LZ1:')) return compressed;
    try {
      const str = compressed.slice(4);
      const codes = [...str].map(c => c.charCodeAt(0) - 32);
      
      const dict = new Map();
      let dictSize = 256;
      for (let i = 0; i < 256; i++) dict.set(i, String.fromCharCode(i));
      
      let w = String.fromCharCode(codes[0]);
      let result = w;
      for (let i = 1; i < codes.length; i++) {
        const k = codes[i];
        let entry;
        if (dict.has(k)) {
          entry = dict.get(k);
        } else if (k === dictSize) {
          entry = w + w[0];
        } else {
          console.warn('LZCompress: invalid dictionary entry, returning raw data');
          return compressed.slice(4); // Invalid, return as-is minus marker
        }
        result += entry;
        dict.set(dictSize++, w + entry[0]);
        w = entry;
      }
      return result;
    } catch (e) {
      console.warn('LZCompress: decompression failed, returning raw data', e);
      return compressed.slice(4); // Return without marker on error
    }
  }
};

// Keys that benefit from compression (large JSON data)
export const COMPRESSED_KEYS = [
  'ecommerce_sales_data_v2',
  'ecommerce_daily_sales_v1', 
  'ecommerce_inventory_v1',
  'ecommerce_periods_v1',
  'ecommerce_3pl_ledger_v1',
  'ecommerce_banking_v1',
  'ecommerce_ai_chat_history_v1',
];

export const lsGet = (key) => {
  try { 
    const raw = localStorage.getItem(key);
    if (COMPRESSED_KEYS.includes(key) && raw?.startsWith('LZ1:')) {
      return LZCompress.decompress(raw);
    }
    return raw; 
  } catch { return null; }
};

export const lsSet = (key, value) => {
  try { 
    // Compress large data for specific keys
    const toStore = COMPRESSED_KEYS.includes(key) ? LZCompress.compress(value) : value;
    localStorage.setItem(key, toStore);
  } catch (e) {
    // Handle quota exceeded
    if (e.name === 'QuotaExceededError') {
      console.warn(`localStorage quota exceeded for ${key}. Attempting cleanup...`);
      // Try to clear old chat history to make room
      try {
        const chatKey = 'ecommerce_ai_chat_history_v1';
        const chat = localStorage.getItem(chatKey);
        if (chat) {
          const messages = JSON.parse(LZCompress.decompress(chat) || chat);
          if (messages.length > 50) {
            localStorage.setItem(chatKey, LZCompress.compress(JSON.stringify(messages.slice(-50))));
          }
        }
        // Retry the save
        const toStore = COMPRESSED_KEYS.includes(key) ? LZCompress.compress(value) : value;
        localStorage.setItem(key, toStore);
      } catch {
        console.error('Failed to save to localStorage even after cleanup');
      }
    }
  }
};
