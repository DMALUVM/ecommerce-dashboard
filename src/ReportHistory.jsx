// ============================================================
// ReportHistory.jsx — Report History, Comparison & Action Tracker
// Stores generated reports, compares across periods, and tracks action items
// ============================================================
import React, { useState, useMemo } from 'react';
import { Clock, FileText, ChevronDown, ChevronUp, CheckCircle2, Circle, ArrowRight, Play, Trash2, Filter, Download, CheckSquare } from 'lucide-react';

// ============ REPORT HISTORY LIST ============
const ReportHistoryPanel = ({ reportHistory, onSelect, onCompare, selectedId, theme }) => {
  const light = theme?.mode === 'light';
  const sorted = [...(reportHistory || [])].sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
  const [compareA, setCompareA] = useState(null);
  const [compareB, setCompareB] = useState(null);
  
  if (!sorted.length) {
    return (
      <div className={`text-center py-10 ${light ? 'text-slate-500' : 'text-slate-400'}`}>
        <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No reports yet</p>
        <p className="text-sm mt-1">Generate an Amazon PPC or DTC Action Report to see it here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Compare mode */}
      {compareA && (
        <div className={`p-3 rounded-lg text-sm ${light ? 'bg-violet-50 border border-violet-200' : 'bg-violet-900/20 border border-violet-500/30'}`}>
          <span className={`${light ? 'text-violet-700' : 'text-violet-300'}`}>
            Comparing: <strong>{new Date(compareA.generatedAt).toLocaleDateString()}</strong>
            {compareB ? ` vs ${new Date(compareB.generatedAt).toLocaleDateString()}` : ' — select another report'}
          </span>
          {compareB && (
            <button onClick={() => { onCompare(compareA, compareB); setCompareA(null); setCompareB(null); }}
              className="ml-3 px-3 py-1 bg-violet-600 text-white rounded text-xs hover:bg-violet-500">
              View Comparison
            </button>
          )}
          <button onClick={() => { setCompareA(null); setCompareB(null); }}
            className={`ml-2 text-xs ${light ? 'text-slate-500' : 'text-slate-400'} hover:underline`}>Cancel</button>
        </div>
      )}
      
      {sorted.map((report) => {
        const d = new Date(report.generatedAt);
        const isSelected = selectedId === report.id;
        const metrics = report.metrics || {};
        
        return (
          <div key={report.id}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              isSelected 
                ? (light ? 'bg-violet-50 border-violet-300' : 'bg-violet-900/20 border-violet-500/50')
                : (light ? 'bg-white border-slate-200 hover:border-slate-300' : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-600')
            }`}
            onClick={() => onSelect(report)}>
            <div className="flex items-center justify-between">
              <div>
                <div className={`font-semibold text-sm ${light ? 'text-slate-900' : 'text-white'}`}>
                  {report.type === 'amazon' ? '🛒 Amazon PPC Report' : '📊 DTC Action Report'}
                </div>
                <div className={`text-xs ${light ? 'text-slate-500' : 'text-slate-400'} mt-0.5`}>
                  {d.toLocaleDateString()} at {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {report.model && <span className="ml-2 opacity-60">· {report.model.includes('opus') ? 'Opus' : report.model.includes('haiku') ? 'Haiku' : 'Sonnet'}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!compareA && (
                  <button onClick={(e) => { e.stopPropagation(); setCompareA(report); }}
                    className={`text-xs px-2 py-1 rounded ${light ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                    Compare
                  </button>
                )}
                {compareA && compareA.id !== report.id && !compareB && (
                  <button onClick={(e) => { e.stopPropagation(); setCompareB(report); }}
                    className="text-xs px-2 py-1 rounded bg-violet-600 text-white hover:bg-violet-500">
                    vs This
                  </button>
                )}
              </div>
            </div>
            
            {/* Quick metrics */}
            {(metrics.revenue || metrics.adSpend || metrics.roas) && (
              <div className="flex gap-4 mt-2">
                {metrics.revenue > 0 && <span className={`text-xs ${light ? 'text-slate-500' : 'text-slate-400'}`}>Rev: <strong className={light ? 'text-slate-700' : 'text-slate-200'}>${Math.round(metrics.revenue).toLocaleString()}</strong></span>}
                {metrics.adSpend > 0 && <span className={`text-xs ${light ? 'text-slate-500' : 'text-slate-400'}`}>Ad$: <strong className="text-rose-400">${Math.round(metrics.adSpend).toLocaleString()}</strong></span>}
                {metrics.roas > 0 && <span className={`text-xs ${light ? 'text-slate-500' : 'text-slate-400'}`}>ROAS: <strong className={metrics.roas >= 2.5 ? 'text-emerald-400' : 'text-amber-400'}>{metrics.roas.toFixed(2)}x</strong></span>}
                {metrics.actionCount > 0 && <span className={`text-xs ${light ? 'text-slate-500' : 'text-slate-400'}`}>{metrics.actionCount} actions</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ============ REPORT COMPARISON VIEW ============
const ReportComparison = ({ reportA, reportB, theme, onClose }) => {
  const light = theme?.mode === 'light';
  const ma = reportA?.metrics || {};
  const mb = reportB?.metrics || {};
  
  const metrics = [
    { label: 'Revenue', a: ma.revenue, b: mb.revenue, format: 'currency' },
    { label: 'Ad Spend', a: ma.adSpend, b: mb.adSpend, format: 'currency', invert: true },
    { label: 'ROAS', a: ma.roas, b: mb.roas, format: 'roas' },
    { label: 'ACOS/TACOS', a: ma.tacos || ma.acos, b: mb.tacos || mb.acos, format: 'pct', invert: true },
    { label: 'Net Profit', a: ma.netProfit, b: mb.netProfit, format: 'currency' },
    { label: 'Actions Generated', a: ma.actionCount, b: mb.actionCount, format: 'number' },
  ].filter(m => (m.a || 0) > 0 || (m.b || 0) > 0);

  const fmtVal = (v, fmt) => {
    if (v === undefined || v === null) return '—';
    if (fmt === 'currency') return `$${Math.round(v).toLocaleString()}`;
    if (fmt === 'roas') return `${v.toFixed(2)}x`;
    if (fmt === 'pct') return `${v.toFixed(1)}%`;
    return v.toLocaleString();
  };

  return (
    <div className={`${light ? 'bg-white border-slate-200' : 'bg-slate-800/40 border-slate-700/50'} border rounded-xl p-5`}>
      <div className="flex justify-between items-center mb-4">
        <h3 className={`text-lg font-bold ${light ? 'text-slate-800' : 'text-white'}`}>Report Comparison</h3>
        <button onClick={onClose} className={`text-sm ${light ? 'text-slate-500 hover:text-slate-700' : 'text-slate-400 hover:text-white'}`}>Close</button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className={`${light ? 'text-slate-500 border-slate-200' : 'text-slate-400 border-slate-700'} border-b`}>
            <th className="text-left py-2">Metric</th>
            <th className="text-right py-2">{new Date(reportA.generatedAt).toLocaleDateString()}</th>
            <th className="text-right py-2">{new Date(reportB.generatedAt).toLocaleDateString()}</th>
            <th className="text-right py-2">Change</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map(({ label, a, b, format, invert }) => {
            const change = (a && b && b !== 0) ? ((a - b) / Math.abs(b)) * 100 : 0;
            const isGood = invert ? change <= 0 : change >= 0;
            return (
              <tr key={label} className={`${light ? 'border-slate-100' : 'border-slate-800'} border-b`}>
                <td className={`py-2 ${light ? 'text-slate-700' : 'text-slate-300'}`}>{label}</td>
                <td className={`text-right font-mono ${light ? 'text-slate-500' : 'text-slate-400'}`}>{fmtVal(b, format)}</td>
                <td className={`text-right font-mono font-bold ${light ? 'text-slate-900' : 'text-white'}`}>{fmtVal(a, format)}</td>
                <td className={`text-right font-mono text-xs ${isGood ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {change !== 0 ? `${change > 0 ? '+' : ''}${change.toFixed(1)}%` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ============ ACTION TRACKER / KANBAN ============
const ActionTracker = ({ actionItems, setActionItems, queueCloudSave, combinedData, theme }) => {
  const light = theme?.mode === 'light';
  const [filterPlatform, setFilterPlatform] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [draggedId, setDraggedId] = useState(null);
  
  const columns = [
    { key: 'todo', label: 'To Do', icon: Circle, color: light ? 'border-slate-300' : 'border-slate-600' },
    { key: 'in_progress', label: 'In Progress', icon: Play, color: 'border-blue-500' },
    { key: 'done', label: 'Done', icon: CheckCircle2, color: 'border-emerald-500' },
  ];
  
  const filtered = (actionItems || []).filter(item => {
    if (filterPlatform !== 'all' && item.platform !== filterPlatform) return false;
    if (filterPriority !== 'all' && item.priority !== filterPriority) return false;
    return true;
  });
  
  const moveItem = (itemId, newStatus) => {
    const updated = (actionItems || []).map(item => 
      item.id === itemId ? { ...item, status: newStatus, updatedAt: new Date().toISOString() } : item
    );
    setActionItems(updated);
    if (queueCloudSave && combinedData) {
      queueCloudSave({ ...combinedData, actionItems: updated });
    }
  };
  
  const deleteItem = (itemId) => {
    const updated = (actionItems || []).filter(item => item.id !== itemId);
    setActionItems(updated);
    if (queueCloudSave && combinedData) {
      queueCloudSave({ ...combinedData, actionItems: updated });
    }
  };
  
  const clearDone = () => {
    const updated = (actionItems || []).filter(item => item.status !== 'done');
    setActionItems(updated);
    if (queueCloudSave && combinedData) {
      queueCloudSave({ ...combinedData, actionItems: updated });
    }
  };
  
  const platforms = [...new Set((actionItems || []).map(i => i.platform).filter(Boolean))];
  const doneCount = (actionItems || []).filter(i => i.status === 'done').length;
  const totalCount = (actionItems || []).length;
  
  const priorityColors = {
    quick: { bg: light ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-emerald-900/20 text-emerald-300 border-emerald-500/30', label: '🟢 Quick Win' },
    medium: { bg: light ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-amber-900/20 text-amber-300 border-amber-500/30', label: '🟡 Medium' },
    strategic: { bg: light ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-rose-900/20 text-rose-300 border-rose-500/30', label: '🔴 Strategic' },
  };
  
  if (!actionItems?.length) {
    return (
      <div className={`text-center py-10 ${light ? 'text-slate-500' : 'text-slate-400'}`}>
        <CheckSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No action items yet</p>
        <p className="text-sm mt-1">Generate a report and click "Create Action Items" to populate tasks.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className={`${light ? 'bg-white border-slate-200' : 'bg-slate-800/40 border-slate-700/50'} border rounded-xl p-4`}>
        <div className="flex items-center justify-between mb-2">
          <span className={`text-sm font-medium ${light ? 'text-slate-700' : 'text-slate-300'}`}>
            {doneCount}/{totalCount} actions completed
          </span>
          <span className={`text-xs ${light ? 'text-slate-500' : 'text-slate-400'}`}>
            {totalCount > 0 ? `${Math.round(doneCount / totalCount * 100)}%` : '0%'}
          </span>
        </div>
        <div className={`h-2 rounded-full ${light ? 'bg-slate-100' : 'bg-slate-700'}`}>
          <div className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${totalCount > 0 ? (doneCount / totalCount * 100) : 0}%` }} />
        </div>
      </div>
      
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className={`w-4 h-4 ${light ? 'text-slate-400' : 'text-slate-500'}`} />
        <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)}
          className={`text-xs px-2 py-1 rounded border ${light ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-800 border-slate-600 text-slate-300'}`}>
          <option value="all">All Platforms</option>
          {platforms.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
          className={`text-xs px-2 py-1 rounded border ${light ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-800 border-slate-600 text-slate-300'}`}>
          <option value="all">All Priorities</option>
          <option value="quick">🟢 Quick Win</option>
          <option value="medium">🟡 Medium</option>
          <option value="strategic">🔴 Strategic</option>
        </select>
        {doneCount > 0 && (
          <button onClick={clearDone} className="text-xs px-2 py-1 rounded bg-rose-600/20 text-rose-400 hover:bg-rose-600/30 ml-auto">
            Clear {doneCount} done
          </button>
        )}
      </div>
      
      {/* Kanban Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {columns.map(col => {
          const items = filtered.filter(i => i.status === col.key);
          const ColIcon = col.icon;
          return (
            <div key={col.key}
              className={`rounded-xl border-t-2 ${col.color} ${light ? 'bg-slate-50' : 'bg-slate-800/30'} p-3 min-h-[200px]`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (draggedId) moveItem(draggedId, col.key); setDraggedId(null); }}>
              <div className="flex items-center gap-2 mb-3">
                <ColIcon className={`w-4 h-4 ${col.key === 'done' ? 'text-emerald-400' : col.key === 'in_progress' ? 'text-blue-400' : (light ? 'text-slate-400' : 'text-slate-500')}`} />
                <span className={`text-sm font-semibold ${light ? 'text-slate-700' : 'text-slate-300'}`}>{col.label}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${light ? 'bg-slate-200 text-slate-600' : 'bg-slate-700 text-slate-400'}`}>{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map(item => (
                  <div key={item.id} draggable
                    onDragStart={() => setDraggedId(item.id)}
                    className={`p-3 rounded-lg border cursor-grab active:cursor-grabbing transition-all hover:shadow-md ${
                      light ? 'bg-white border-slate-200 hover:border-slate-300' : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                    } ${draggedId === item.id ? 'opacity-50' : ''}`}>
                    <div className={`text-sm ${light ? 'text-slate-800' : 'text-slate-200'} leading-snug`}>{item.text}</div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1.5">
                        {item.priority && priorityColors[item.priority] && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${priorityColors[item.priority].bg}`}>
                            {priorityColors[item.priority].label}
                          </span>
                        )}
                        {item.platform && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${light ? 'bg-slate-100 text-slate-500' : 'bg-slate-700 text-slate-400'}`}>
                            {item.platform}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {col.key !== 'done' && (
                          <button onClick={() => moveItem(item.id, col.key === 'todo' ? 'in_progress' : 'done')}
                            className={`p-1 rounded ${light ? 'hover:bg-slate-100' : 'hover:bg-slate-700'}`}
                            title={col.key === 'todo' ? 'Start' : 'Complete'}>
                            {col.key === 'todo' ? <Play className="w-3 h-3 text-blue-400" /> : <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                          </button>
                        )}
                        <button onClick={() => deleteItem(item.id)}
                          className={`p-1 rounded ${light ? 'hover:bg-rose-50' : 'hover:bg-rose-900/30'}`}>
                          <Trash2 className="w-3 h-3 text-rose-400" />
                        </button>
                      </div>
                    </div>
                    {item.impact && (
                      <div className={`text-[10px] mt-1.5 ${light ? 'text-slate-400' : 'text-slate-500'}`}>
                        💰 {item.impact}
                      </div>
                    )}
                  </div>
                ))}
                {items.length === 0 && (
                  <div className={`text-center py-6 text-xs ${light ? 'text-slate-400' : 'text-slate-600'}`}>
                    {col.key === 'done' ? 'No completed items' : 'Drag items here'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============ PARSE ACTIONS FROM REPORT MARKDOWN ============
const parseActionsFromReport = (markdown, reportType, reportId) => {
  if (!markdown) return [];
  const actions = [];
  
  // Find implementation checklist section
  const checklistMatch = markdown.match(/(?:IMPLEMENTATION CHECKLIST|📋.*CHECKLIST|📋.*Implementation)([\s\S]*?)(?=##|$)/i);
  const topActionsMatch = markdown.match(/(?:TOP \d+ ACTIONS|⚡.*ACTIONS|⚡.*Action)([\s\S]*?)(?=##|$)/i);
  
  const sections = [checklistMatch?.[1], topActionsMatch?.[1]].filter(Boolean);
  
  sections.forEach(section => {
    // Match numbered items or bullet points
    const lines = section.split('\n').filter(l => l.trim());
    let currentPlatform = '';
    let currentPriority = 'medium';
    
    lines.forEach(line => {
      const trimmed = line.trim();
      
      // Detect platform headers
      if (/meta ads|meta/i.test(trimmed) && !/^\d/.test(trimmed)) currentPlatform = 'Meta Ads';
      else if (/google ads|google/i.test(trimmed) && !/^\d/.test(trimmed)) currentPlatform = 'Google Ads';
      else if (/amazon|seller central/i.test(trimmed) && !/^\d/.test(trimmed)) currentPlatform = 'Amazon';
      else if (/shopify|theme|seo|content/i.test(trimmed) && !/^\d/.test(trimmed)) currentPlatform = 'Shopify';
      
      // Detect priority
      if (/quick win|🟢|under 5 min|<5 min/i.test(trimmed)) currentPriority = 'quick';
      else if (/medium|🟡|5-15 min/i.test(trimmed)) currentPriority = 'medium';
      else if (/strategic|🔴|15\+ min/i.test(trimmed)) currentPriority = 'strategic';
      
      // Match action items (numbered or bulleted)
      const actionMatch = trimmed.match(/^(?:\d+[.)]\s*|[-*]\s*|☐\s*)(.{15,})/);
      if (actionMatch) {
        const text = actionMatch[1].replace(/\*\*/g, '').replace(/`/g, '').trim();
        // Skip headers and non-actionable lines
        if (text.length > 15 && text.length < 300 && !/^(?:for each|current|after|time|estimated|where)/i.test(text)) {
          actions.push({
            id: `action_${reportId}_${actions.length}_${Date.now()}`,
            text: text.slice(0, 200),
            status: 'todo',
            priority: currentPriority,
            platform: currentPlatform || (reportType === 'amazon' ? 'Amazon' : 'Multi-channel'),
            sourceReportId: reportId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }
    });
  });
  
  // Deduplicate by similar text
  const unique = [];
  actions.forEach(a => {
    const isDup = unique.some(u => {
      const sim = u.text.slice(0, 40).toLowerCase();
      return a.text.slice(0, 40).toLowerCase() === sim;
    });
    if (!isDup) unique.push(a);
  });
  
  return unique.slice(0, 30); // Cap at 30 actions
};

// ============ MAIN EXPORT: Combined Reports & Actions View ============
const ReportsAndActionsView = ({ 
  reportHistory, setReportHistory, 
  actionItems, setActionItems,
  queueCloudSave, combinedData, theme, setToast
}) => {
  const light = theme?.mode === 'light';
  const [activeTab, setActiveTab] = useState('actions'); // 'history' | 'actions'
  const [selectedReport, setSelectedReport] = useState(null);
  const [comparisonData, setComparisonData] = useState(null);
  
  const handleSelectReport = (report) => {
    setSelectedReport(selectedReport?.id === report.id ? null : report);
  };
  
  const handleCompare = (a, b) => {
    setComparisonData({ a, b });
  };
  
  const handleCreateActions = (report) => {
    if (!report?.content) return;
    const newActions = parseActionsFromReport(report.content, report.type, report.id);
    if (newActions.length === 0) {
      setToast?.({ message: 'Could not parse action items from this report', type: 'error' });
      return;
    }
    // Merge with existing, avoiding duplicates from same report
    const existingNonSource = (actionItems || []).filter(a => a.sourceReportId !== report.id);
    const merged = [...existingNonSource, ...newActions];
    setActionItems(merged);
    if (queueCloudSave && combinedData) {
      queueCloudSave({ ...combinedData, actionItems: merged });
    }
    setToast?.({ message: `${newActions.length} action items created from report`, type: 'success' });
    setActiveTab('actions');
  };
  
  return (
    <div className="space-y-4">
      {/* Tab Switcher */}
      <div className="flex items-center gap-1">
        {[
          { key: 'actions', label: `Action Board (${(actionItems || []).filter(i => i.status !== 'done').length})`, icon: CheckSquare },
          { key: 'history', label: `Report History (${(reportHistory || []).length})`, icon: Clock },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? (light ? 'bg-violet-100 text-violet-700' : 'bg-violet-600/20 text-violet-300')
                : (light ? 'text-slate-500 hover:bg-slate-100' : 'text-slate-400 hover:bg-slate-800')
            }`}>
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>
      
      {/* Content */}
      {activeTab === 'actions' && (
        <ActionTracker 
          actionItems={actionItems} 
          setActionItems={setActionItems}
          queueCloudSave={queueCloudSave}
          combinedData={combinedData}
          theme={theme}
        />
      )}
      
      {activeTab === 'history' && (
        <div className="space-y-4">
          {comparisonData && (
            <ReportComparison 
              reportA={comparisonData.a} 
              reportB={comparisonData.b} 
              theme={theme}
              onClose={() => setComparisonData(null)} 
            />
          )}
          
          <ReportHistoryPanel
            reportHistory={reportHistory}
            onSelect={handleSelectReport}
            onCompare={handleCompare}
            selectedId={selectedReport?.id}
            theme={theme}
          />
          
          {/* Selected Report Detail */}
          {selectedReport && (
            <div className={`${light ? 'bg-white border-slate-200' : 'bg-slate-800/40 border-slate-700/50'} border rounded-xl p-5`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`font-bold ${light ? 'text-slate-800' : 'text-white'}`}>
                  {selectedReport.type === 'amazon' ? '🛒 Amazon Report' : '📊 DTC Report'} — {new Date(selectedReport.generatedAt).toLocaleDateString()}
                </h3>
                <button onClick={() => handleCreateActions(selectedReport)}
                  className="px-3 py-1.5 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-500 flex items-center gap-1">
                  <CheckSquare className="w-3.5 h-3.5" />
                  Create Action Items
                </button>
              </div>
              {selectedReport.content && (
                <div className={`prose prose-sm max-w-none ${light ? '' : 'prose-invert'} max-h-96 overflow-y-auto rounded-lg p-4 ${light ? 'bg-slate-50' : 'bg-slate-900/50'}`}
                  dangerouslySetInnerHTML={{ __html: selectedReport.contentHtml || selectedReport.content.replace(/\n/g, '<br/>') }} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReportsAndActionsView;
