import React from 'react';
import { Package, Check } from 'lucide-react';
import { PRODUCT_NAMES_KEY } from '../../utils/storage';

const ProductCatalogModal = ({
  showProductCatalog,
  setShowProductCatalog,
  productCatalogFile,
  setProductCatalogFile,
  productCatalogFileName,
  setProductCatalogFileName,
  savedProductNames,
  setSavedProductNames,
  setToast
}) => {
  if (!showProductCatalog) return null;
  
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setProductCatalogFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return;
      
      // Parse CSV properly handling quoted fields with commas
      const parseCSVLine = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
              current += '"';
              i++; // Skip escaped quote
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result;
      };
      
      const headers = parseCSVLine(lines[0]).map(h => h.replace(/"/g, '').trim().toLowerCase());
      const skuCol = headers.findIndex(h => h === 'sku');
      const nameCol = headers.findIndex(h => h.includes('product') || h === 'name');
      if (skuCol === -1 || nameCol === -1) {
        alert('CSV must have SKU and Product Name columns');
        return;
      }
      const catalog = {};
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        const sku = (cols[skuCol] || '').replace(/"/g, '').trim();
        const name = (cols[nameCol] || '').replace(/"/g, '').trim();
        if (sku && name) catalog[sku] = name;
      }
      setProductCatalogFile(catalog);
      setToast({ message: `Parsed ${Object.keys(catalog).length} products`, type: 'success' });
    };
    reader.readAsText(file);
  };
  
  const saveCatalog = () => {
    if (!productCatalogFile) return;
    setSavedProductNames(productCatalogFile);
    try { localStorage.setItem(PRODUCT_NAMES_KEY, JSON.stringify(productCatalogFile)); } catch(e) {}
    setShowProductCatalog(false);
    setProductCatalogFile(null);
    setProductCatalogFileName('');
  };
  
  // Get category summary
  const getCategorySummary = (names) => {
    const categories = {};
    Object.entries(names).forEach(([sku, name]) => {
      const nameLower = name.toLowerCase();
      let cat = 'Other';
      if (nameLower.includes('lip balm')) cat = 'Lip Balm';
      else if (nameLower.includes('deodorant') && nameLower.includes('sensitive')) cat = 'Sensitive Deodorant';
      else if (nameLower.includes('deodorant') && nameLower.includes('extra strength')) cat = 'Extra Strength Deodorant';
      else if (nameLower.includes('deodorant')) cat = 'Deodorant';
      else if (nameLower.includes('soap') && nameLower.includes('athlete')) cat = "Athlete's Shield";
      else if (nameLower.includes('soap')) cat = 'Tallow Soap';
      else if (nameLower.includes('sun balm')) cat = 'Sun Balm';
      else if (nameLower.includes('tallow balm')) cat = 'Tallow Balm';
      if (!categories[cat]) categories[cat] = 0;
      categories[cat]++;
    });
    return categories;
  };
  
  const currentCategories = getCategorySummary(savedProductNames);
  const previewCategories = productCatalogFile ? getCategorySummary(productCatalogFile) : null;
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
          <Package className="w-6 h-6 text-violet-400" />
          Product Catalog
        </h2>
        <p className="text-slate-400 text-sm mb-4">
          Map SKUs to product names so AI can answer questions like "How much lip balm did I sell?"
        </p>
        
        {/* Current catalog status */}
        {Object.keys(savedProductNames).length > 0 ? (
          <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-xl p-4 mb-4">
            <div className="flex items-center gap-2 text-emerald-400 mb-2">
              <Check className="w-5 h-5" />
              <span className="font-semibold">{Object.keys(savedProductNames).length} Products Mapped</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(currentCategories).map(([cat, count]) => (
                <span key={cat} className="text-xs bg-slate-700 px-2 py-1 rounded text-slate-300">
                  {cat}: {count}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-amber-900/30 border border-amber-500/30 rounded-xl p-4 mb-4">
            <p className="text-amber-400 font-semibold">No Product Catalog</p>
            <p className="text-slate-400 text-sm">Upload a CSV with SKU and Product Name columns</p>
          </div>
        )}
        
        {/* File upload */}
        <div className="mb-4">
          <label className="block text-sm text-slate-300 mb-2">Upload Product Catalog CSV:</label>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-violet-600 file:text-white file:cursor-pointer"
          />
          {productCatalogFileName && (
            <p className="text-violet-400 text-sm mt-2">📄 {productCatalogFileName}</p>
          )}
        </div>
        
        {/* Preview */}
        {productCatalogFile && (
          <div className="bg-slate-900/50 rounded-xl p-4 mb-4">
            <p className="text-white font-semibold mb-2">Preview: {Object.keys(productCatalogFile).length} products found</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {Object.entries(previewCategories).map(([cat, count]) => (
                <span key={cat} className="text-xs bg-violet-600/30 px-2 py-1 rounded text-violet-300">
                  {cat}: {count}
                </span>
              ))}
            </div>
            <div className="max-h-32 overflow-y-auto text-xs space-y-1">
              {Object.entries(productCatalogFile).slice(0, 5).map(([sku, name]) => (
                <div key={sku} className="flex gap-2">
                  <span className="text-slate-500 font-mono">{sku}</span>
                  <span className="text-slate-300 truncate">{name}</span>
                </div>
              ))}
              {Object.keys(productCatalogFile).length > 5 && (
                <p className="text-slate-500">...and {Object.keys(productCatalogFile).length - 5} more</p>
              )}
            </div>
          </div>
        )}
        
        <div className="flex gap-3">
          {productCatalogFile && (
            <button onClick={saveCatalog} className="flex-1 bg-violet-600 hover:bg-violet-500 text-white font-semibold py-2 rounded-xl">
              Save Catalog
            </button>
          )}
          <button 
            onClick={() => { setShowProductCatalog(false); setProductCatalogFile(null); setProductCatalogFileName(''); }} 
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-xl"
          >
            {productCatalogFile ? 'Cancel' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductCatalogModal;
