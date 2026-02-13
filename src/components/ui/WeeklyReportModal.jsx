import React from 'react';
import { X, Download, RefreshCw, AlertTriangle, FileText, Zap } from 'lucide-react';
import { sanitizeHtml } from '../../utils/sanitize';

const WeeklyReportModal = ({
  showWeeklyReport,
  setShowWeeklyReport,
  reportType,
  setReportType,
  currentReport,
  setCurrentReport,
  reportError,
  setReportError,
  generatingReport,
  generateReport,
  downloadReport,
  weeklyReports,
  selectedReportPeriod,
  setSelectedReportPeriod,
  allWeeksData,
  allPeriodsData,
  formatCurrency
}) => {
  if (!showWeeklyReport) return null;

  const sortedWeeks = Object.keys(allWeeksData).sort().reverse();
  const sortedPeriods = Object.keys(allPeriodsData).sort().reverse();

  const getAvailablePeriods = () => {
    if (reportType === 'weekly') {
      return sortedWeeks.filter(w => (allWeeksData[w]?.total?.revenue || 0) > 100).slice(0, 12);
    } else if (reportType === 'monthly') {
      const monthPeriods = sortedPeriods.filter(p => /^\d{4}-\d{2}$/.test(p) || /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i.test(p));
      const monthsFromWeeks = [...new Set(sortedWeeks.map(w => w.substring(0, 7)))].sort().reverse();
      return monthPeriods.length > 0 ? monthPeriods.slice(0, 12) : monthsFromWeeks.slice(0, 12);
    } else if (reportType === 'quarterly') {
      const quarterPeriods = sortedPeriods.filter(p => /Q[1-4]/i.test(p));
      if (quarterPeriods.length > 0) return quarterPeriods.slice(0, 8);
      const getQuarter = (dateStr) => Math.ceil(parseInt(dateStr.substring(5, 7)) / 3);
      const getYear = (dateStr) => dateStr.substring(0, 4);
      return [...new Set(sortedWeeks.map(w => `${getYear(w)}-Q${getQuarter(w)}`))].slice(0, 8);
    } else if (reportType === 'annual') {
      const yearPeriods = sortedPeriods.filter(p => /^\d{4}$/.test(p));
      const yearsFromWeeks = [...new Set(sortedWeeks.map(w => w.substring(0, 4)))].sort().reverse();
      return yearPeriods.length > 0 ? yearPeriods.slice(0, 5) : yearsFromWeeks.slice(0, 5);
    }
    return [];
  };

  const renderMarkdown = (content) => {
    let html = content;
    const tableRegex = /\|(.+)\|\n\|[-:\s|]+\|\n((?:\|.+\|\n?)+)/g;
    html = html.replace(tableRegex, (match, headerRow, bodyRows) => {
      const headers = headerRow.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
      const rows = bodyRows.trim().split('\n').map(row => {
        const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    });
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/^- (.*$)/gim, '<li>$1</li>');
    html = html.replace(/^\d+\. (.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    html = html.replace(/^(?!<[hultdp]|<\/)(.*\S.*)$/gim, '<p>$1</p>');
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/\n\n/g, '<br/>');
    return html;
  };

  const availablePeriods = getAvailablePeriods();

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className={`p-6 flex items-center justify-between flex-shrink-0 ${
          reportType === 'weekly' ? 'bg-gradient-to-r from-emerald-600 to-teal-600' :
          reportType === 'monthly' ? 'bg-gradient-to-r from-blue-600 to-indigo-600' :
          reportType === 'quarterly' ? 'bg-gradient-to-r from-violet-600 to-purple-600' :
          'bg-gradient-to-r from-amber-600 to-orange-600'
        }`}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl">
              {reportType === 'weekly' ? '📅' : reportType === 'monthly' ? '📊' : reportType === 'quarterly' ? '📈' : '🏆'}
            </div>
            <div>
              <h2 className="text-white text-xl font-bold">{reportType.charAt(0).toUpperCase() + reportType.slice(1)} Intelligence Report</h2>
              <p className="text-white/70 text-sm">{currentReport?.periodLabel || 'AI-powered business analysis'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {currentReport && (
              <button onClick={() => downloadReport(currentReport)} className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-white text-sm flex items-center gap-2">
                <Download className="w-4 h-4" />Download
              </button>
            )}
            <button onClick={() => { setShowWeeklyReport(false); setCurrentReport(null); setReportError(null); }} className="p-2 hover:bg-white/20 rounded-lg text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-2 flex flex-wrap gap-2 items-center justify-between">
          <div className="flex gap-2">
            {['weekly', 'monthly', 'quarterly', 'annual'].map(type => (
              <button
                key={type}
                onClick={() => { setReportType(type); setSelectedReportPeriod(null); setCurrentReport(weeklyReports[type]?.reports?.[0] || null); setReportError(null); }}
                className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 ${reportType === type ? 'bg-white/20 text-white font-medium' : 'text-slate-400 hover:bg-white/10'}`}
              >
                {type === 'weekly' ? '📅' : type === 'monthly' ? '📊' : type === 'quarterly' ? '📈' : '🏆'}
                {type.charAt(0).toUpperCase() + type.slice(1)}
                {weeklyReports[type]?.reports?.length > 0 && <span className="w-2 h-2 rounded-full bg-emerald-400"></span>}
              </button>
            ))}
          </div>
          
          {availablePeriods.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-sm">Period:</span>
              <select 
                value={selectedReportPeriod || ''} 
                onChange={(e) => setSelectedReportPeriod(e.target.value || null)}
                className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm min-w-[160px]"
              >
                <option value="">Latest Complete</option>
                {availablePeriods.map(p => {
                  let label = p;
                  if (reportType === 'weekly') {
                    const rev = allWeeksData[p]?.total?.revenue || 0;
                    label = `Week ${p} (${formatCurrency(rev)})`;
                  }
                  return <option key={p} value={p}>{label}</option>;
                })}
              </select>
              <button 
                onClick={() => generateReport(reportType, true, selectedReportPeriod)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white text-sm flex items-center gap-1"
              >
                <Zap className="w-3 h-3" />Generate
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {generatingReport ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-6" />
              <h3 className="text-white text-lg font-semibold mb-2">Generating Report...</h3>
              <p className="text-slate-400 text-sm">Analyzing your business data...</p>
            </div>
          ) : reportError ? (
            <div className="flex flex-col items-center justify-center py-20">
              <AlertTriangle className="w-16 h-16 text-rose-400 mb-6" />
              <h3 className="text-white text-lg font-semibold mb-2">Unable to Generate Report</h3>
              <p className="text-slate-400 text-sm mb-6">{reportError}</p>
              <button onClick={() => generateReport(reportType, true, selectedReportPeriod)} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-white">Try Again</button>
            </div>
          ) : currentReport ? (
            <div className="report-content text-slate-200">
              <style>{`
                .report-content { color: #e2e8f0; line-height: 1.7; }
                .report-content h1 { color: #ffffff; font-size: 1.5rem; font-weight: bold; border-bottom: 1px solid #475569; padding-bottom: 0.75rem; margin: 1.5rem 0 1rem 0; }
                .report-content h2 { color: #34d399; font-size: 1.25rem; font-weight: 600; margin: 2rem 0 1rem 0; }
                .report-content h3 { color: #22d3ee; font-size: 1.1rem; font-weight: 500; margin: 1.5rem 0 0.75rem 0; }
                .report-content p { color: #e2e8f0; margin: 0.75rem 0; }
                .report-content strong, .report-content b { color: #ffffff; font-weight: 600; }
                .report-content li { color: #e2e8f0; margin: 0.5rem 0 0.5rem 1.5rem; }
                .report-content ul, .report-content ol { margin: 0.5rem 0; }
                .report-content table { width: 100%; border-collapse: collapse; margin: 1rem 0; background: rgba(51, 65, 85, 0.3); border-radius: 0.5rem; overflow: hidden; }
                .report-content th { color: #cbd5e1; font-weight: 600; text-align: left; padding: 0.75rem; border-bottom: 1px solid #475569; background: rgba(51, 65, 85, 0.5); }
                .report-content td { color: #e2e8f0; padding: 0.75rem; border-bottom: 1px solid rgba(71, 85, 105, 0.5); }
                .report-content tr:nth-child(even) { background: rgba(51, 65, 85, 0.2); }
                .report-content tr:hover { background: rgba(51, 65, 85, 0.4); }
                .report-content a { color: #60a5fa; }
                .report-content code { background: rgba(51, 65, 85, 0.5); padding: 0.125rem 0.375rem; border-radius: 0.25rem; color: #fbbf24; }
              `}</style>
              <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderMarkdown(currentReport.content)) }} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20">
              <FileText className="w-16 h-16 text-slate-600 mb-6" />
              <h3 className="text-white text-lg font-semibold mb-2">No {reportType} Report Yet</h3>
              <p className="text-slate-400 text-sm mb-6">Generate an AI-powered report for insights.</p>
              <button onClick={() => generateReport(reportType, false, selectedReportPeriod)} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-white flex items-center gap-2">
                <Zap className="w-5 h-5" />Generate Report
              </button>
            </div>
          )}
        </div>

        {weeklyReports[reportType]?.reports?.length > 0 && !generatingReport && (
          <div className="border-t border-slate-700 p-4 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-sm">History:</span>
                {weeklyReports[reportType].reports.slice(0, 5).map(r => (
                  <button key={r.id} onClick={() => setCurrentReport(r)} className={`px-3 py-1 rounded-lg text-xs ${currentReport?.id === r.id ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                    {r.periodLabel}
                  </button>
                ))}
              </div>
              <button onClick={() => generateReport(reportType, true, selectedReportPeriod)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-300 flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />Regenerate
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WeeklyReportModal;
