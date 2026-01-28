import React, { useState } from 'react';
import { Truck, X, Upload, FileSpreadsheet, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { formatNumber } from '../../utils/format';

const ThreePLBulkUploadModal = ({
  show3PLBulkUpload,
  setShow3PLBulkUpload,
  threeplSelectedFiles,
  setThreeplSelectedFiles,
  threeplProcessing,
  setThreeplProcessing,
  threeplResults,
  setThreeplResults,
  threeplLedger,
  parse3PLExcel,
  save3PLLedger,
  get3PLForWeek,
  getSunday,
  allWeeksData,
  setAllWeeksData,
  save
}) => {
  const [dragActive, setDragActive] = useState(false);
  
  // Use Dashboard-level state for files, processing, results
  const selectedFiles = threeplSelectedFiles;
  const setSelectedFiles = setThreeplSelectedFiles;
  const processing = threeplProcessing;
  const setProcessing = setThreeplProcessing;
  const results = threeplResults;
  const setResults = setThreeplResults;
  
  if (!show3PLBulkUpload) return null;
  
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };
  
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = [...e.dataTransfer.files].filter(f => 
      f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.csv')
    );
    setSelectedFiles(prev => [...prev, ...files]);
  };
  
  const handleFileSelect = (e) => {
    const files = [...e.target.files].filter(f => 
      f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.csv')
    );
    setSelectedFiles(prev => [...prev, ...files]);
  };
  
  const removeFile = (idx) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
  };
  
  const processFiles = async () => {
    const totalFiles = selectedFiles.length;
    const processResults = [];
    let newOrders = { ...threeplLedger.orders };
    let newSummaryCharges = { ...threeplLedger.summaryCharges };
    let newImportedFiles = [...(threeplLedger.importedFiles || [])];
    let totalAdded = 0;
    let totalSkipped = 0;
    let weeksAffected = new Set();
    
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      
      // Update progress
      setProcessing({ current: i + 1, total: totalFiles, fileName: file.name });
      
      try {
        const parsed = await parse3PLExcel(file);
        let fileAdded = 0;
        let fileSkipped = 0;
        
        // Process orders
        parsed.orders.forEach(order => {
          if (newOrders[order.uniqueKey]) {
            fileSkipped++;
          } else {
            newOrders[order.uniqueKey] = order;
            fileAdded++;
            weeksAffected.add(order.weekKey);
          }
        });
        
        // Process non-order charges (allocate to weeks based on file date range)
        if (parsed.dateRange.start && parsed.dateRange.end) {
          const startDate = new Date(parsed.dateRange.start);
          const endDate = new Date(parsed.dateRange.end);
          
          parsed.nonOrderCharges.forEach((charge, idx) => {
            const weekKey = getSunday(endDate);
            const chargeKey = `${file.name}-${charge.chargeType}-${idx}`;
            
            if (!newSummaryCharges[chargeKey]) {
              newSummaryCharges[chargeKey] = {
                ...charge,
                weekKey,
                sourceFile: file.name,
                dateRange: { start: parsed.dateRange.start, end: parsed.dateRange.end },
              };
              weeksAffected.add(weekKey);
            }
          });
        }
        
        newImportedFiles.push({
          name: file.name,
          importedAt: new Date().toISOString(),
          ordersAdded: fileAdded,
          dateRange: parsed.dateRange,
        });
        
        totalAdded += fileAdded;
        totalSkipped += fileSkipped;
        
        processResults.push({
          file: file.name,
          status: 'success',
          ordersAdded: fileAdded,
          ordersSkipped: fileSkipped,
          dateRange: parsed.dateRange,
          format: parsed.format,
        });
      } catch (err) {
        console.error('Error processing file:', file.name, err);
        processResults.push({
          file: file.name,
          status: 'error',
          error: err.message,
        });
      }
    }
    
    // Save updated ledger
    const newLedger = {
      orders: newOrders,
      summaryCharges: newSummaryCharges,
      importedFiles: newImportedFiles,
    };
    save3PLLedger(newLedger);
    
    // Update weekly data with new 3PL costs
    if (weeksAffected.size > 0) {
      const updatedWeeks = { ...allWeeksData };
      let weeksUpdated = 0;
      
      weeksAffected.forEach(weekKey => {
        if (updatedWeeks[weekKey]) {
          const ledger3PL = get3PLForWeek(newLedger, weekKey);
          const newThreeplCost = ledger3PL?.metrics?.totalCost || 0;
          const oldCost = updatedWeeks[weekKey].shopify?.threeplCosts || 0;
          
          if (newThreeplCost > 0 && newThreeplCost !== oldCost) {
            const shopProfit = (updatedWeeks[weekKey].shopify?.netProfit || 0) + oldCost - newThreeplCost;
            updatedWeeks[weekKey] = {
              ...updatedWeeks[weekKey],
              shopify: {
                ...updatedWeeks[weekKey].shopify,
                threeplCosts: newThreeplCost,
                threeplBreakdown: ledger3PL?.breakdown || updatedWeeks[weekKey].shopify?.threeplBreakdown,
                threeplMetrics: ledger3PL?.metrics || updatedWeeks[weekKey].shopify?.threeplMetrics,
                netProfit: shopProfit,
                netMargin: updatedWeeks[weekKey].shopify?.revenue > 0 ? (shopProfit / updatedWeeks[weekKey].shopify.revenue) * 100 : 0,
              },
              total: {
                ...updatedWeeks[weekKey].total,
                netProfit: (updatedWeeks[weekKey].amazon?.netProfit || 0) + shopProfit,
                netMargin: updatedWeeks[weekKey].total?.revenue > 0 ? (((updatedWeeks[weekKey].amazon?.netProfit || 0) + shopProfit) / updatedWeeks[weekKey].total.revenue) * 100 : 0,
              }
            };
            weeksUpdated++;
          }
        }
      });
      
      if (weeksUpdated > 0) {
        setAllWeeksData(updatedWeeks);
        save(updatedWeeks);
      }
    }
    
    setResults({
      files: processResults,
      totalAdded,
      totalSkipped,
      weeksAffected: weeksAffected.size,
    });
    setProcessing(null);
  };
  
  const ledgerStats = {
    totalOrders: Object.keys(threeplLedger.orders || {}).length,
    totalFiles: (threeplLedger.importedFiles || []).length,
    weeks: new Set(Object.values(threeplLedger.orders || {}).map(o => o.weekKey)).size,
  };
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Truck className="w-6 h-6 text-blue-400" />
            3PL Bulk Upload
          </h2>
          <button onClick={() => { setShow3PLBulkUpload(false); setThreeplSelectedFiles([]); setThreeplResults(null); }} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Current Stats */}
        <div className="bg-slate-900/50 rounded-xl p-4 mb-4">
          <p className="text-slate-400 text-sm mb-2">Current 3PL Data</p>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-white">{formatNumber(ledgerStats.totalOrders)}</p>
              <p className="text-slate-500 text-xs">Orders</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{ledgerStats.weeks}</p>
              <p className="text-slate-500 text-xs">Weeks</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{ledgerStats.totalFiles}</p>
              <p className="text-slate-500 text-xs">Files Imported</p>
            </div>
          </div>
        </div>
        
        {!results ? (
          <>
            {/* Drop Zone */}
            <div 
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${dragActive ? 'border-blue-500 bg-blue-500/10' : 'border-slate-600 hover:border-slate-500'}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Upload className="w-12 h-12 text-slate-500 mx-auto mb-3" />
              <p className="text-white font-medium mb-1">Drop 3PL Excel files here</p>
              <p className="text-slate-400 text-sm mb-3">or click to browse</p>
              <input
                type="file"
                multiple
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="hidden"
                id="threepl-file-input"
              />
              <label htmlFor="threepl-file-input" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white cursor-pointer inline-block">
                Select Files
              </label>
              <p className="text-slate-500 text-xs mt-3">Supports .xlsx, .xls, .csv • Multiple files OK • Duplicates auto-skipped</p>
            </div>
            
            {/* Selected Files */}
            {selectedFiles.length > 0 && (
              <div className="mt-4">
                <p className="text-slate-400 text-sm mb-2">Selected Files ({selectedFiles.length})</p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {selectedFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-slate-900/50 rounded-lg p-2">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                        <span className="text-white text-sm">{file.name}</span>
                        <span className="text-slate-500 text-xs">({(file.size / 1024).toFixed(1)} KB)</span>
                      </div>
                      <button onClick={() => removeFile(idx)} className="text-slate-400 hover:text-rose-400">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                
                {/* Progress Bar */}
                {processing && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Processing: {processing.fileName}</span>
                      <span className="text-white font-medium">{processing.current} of {processing.total}</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
                      <div 
                        className="bg-blue-500 h-full rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${(processing.current / processing.total) * 100}%` }}
                      />
                    </div>
                    <p className="text-slate-500 text-xs text-center">
                      {Math.round((processing.current / processing.total) * 100)}% complete
                    </p>
                  </div>
                )}
                
                <button
                  onClick={processFiles}
                  disabled={processing}
                  className="w-full mt-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 rounded-xl text-white font-semibold flex items-center justify-center gap-2"
                >
                  {processing ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      Processing {processing.current}/{processing.total}...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      Import {selectedFiles.length} File{selectedFiles.length > 1 ? 's' : ''}
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        ) : (
          /* Results */
          <div className="space-y-4">
            <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                <span className="text-emerald-400 font-semibold">Import Complete</span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-emerald-400">{results.totalAdded}</p>
                  <p className="text-slate-400 text-xs">Orders Added</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-400">{results.totalSkipped}</p>
                  <p className="text-slate-400 text-xs">Duplicates Skipped</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-400">{results.weeksAffected}</p>
                  <p className="text-slate-400 text-xs">Weeks Updated</p>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <p className="text-slate-400 text-sm">File Details</p>
              {results.files.map((r, idx) => (
                <div key={idx} className={`flex items-center justify-between rounded-lg p-3 ${r.status === 'success' ? 'bg-slate-900/50' : 'bg-rose-900/20 border border-rose-500/30'}`}>
                  <div className="flex items-center gap-2">
                    {r.status === 'success' ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                    )}
                    <span className="text-white text-sm">{r.file}</span>
                    {r.format && <span className="text-xs text-slate-500">({r.format})</span>}
                  </div>
                  {r.status === 'success' ? (
                    <span className="text-slate-400 text-sm">
                      +{r.ordersAdded} orders {r.dateRange?.start && `(${r.dateRange.start} to ${r.dateRange.end})`}
                    </span>
                  ) : (
                    <span className="text-rose-400 text-sm">{r.error}</span>
                  )}
                </div>
              ))}
            </div>
            
            <button
              onClick={() => { setSelectedFiles([]); setResults(null); }}
              className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-white font-semibold"
            >
              Import More Files
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ThreePLBulkUploadModal;
