import React from 'react';
import { FileText, X, RefreshCw, Upload, Clock, Check, Trash2, CheckCircle } from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import { loadXLSX } from '../../utils/xlsx';

const INVOICE_CATEGORIES = [
  { value: 'operations', label: '🏢 Operations', color: 'slate' },
  { value: 'inventory', label: '📦 Inventory/COGS', color: 'amber' },
  { value: 'marketing', label: '📣 Marketing/Ads', color: 'violet' },
  { value: 'software', label: '💻 Software/SaaS', color: 'blue' },
  { value: 'shipping', label: '🚚 Shipping/3PL', color: 'emerald' },
  { value: 'taxes', label: '📋 Taxes/Fees', color: 'rose' },
  { value: 'other', label: '📎 Other', color: 'slate' },
];

const InvoiceModal = ({
  showInvoiceModal,
  setShowInvoiceModal,
  invoiceForm,
  setInvoiceForm,
  editingInvoice,
  setEditingInvoice,
  invoices,
  setInvoices,
  processingPdf,
  setProcessingPdf,
  callAI
}) => {
  if (!showInvoiceModal) return null;
  
  const categories = INVOICE_CATEGORIES;
  
  const resetForm = () => {
    setInvoiceForm({ vendor: '', description: '', amount: '', dueDate: '', recurring: false, frequency: 'monthly', category: 'operations' });
    setEditingInvoice(null);
  };
  
  const handleDelete = (id) => {
    setInvoices(prev => prev.filter(i => i.id !== id));
  };
  
  const handleMarkPaid = (id) => {
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, paid: true, paidDate: new Date().toISOString() } : i));
  };
  
  // PDF Upload and AI extraction
  const handlePdfUpload = async (file) => {
    if (!file) return;
    
    const fileName = file.name.toLowerCase();
    const isPdf = file.type.includes('pdf') || fileName.endsWith('.pdf');
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || file.type.includes('spreadsheet') || file.type.includes('excel');
    const isCsv = fileName.endsWith('.csv') || file.type.includes('csv');
    
    if (!isPdf && !isExcel && !isCsv) {
      alert('Please upload a PDF, Excel (.xlsx/.xls), or CSV file');
      return;
    }
    
    setProcessingPdf(true);
    
    try {
      let textContent = '';
      
      if (isCsv) {
        textContent = await file.text();
      } else if (isExcel) {
        const xlsxLib = await loadXLSX();
        const arrayBuffer = await file.arrayBuffer();
        const workbook = xlsxLib.read(arrayBuffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        textContent = xlsxLib.utils.sheet_to_csv(firstSheet);
      }
      
      if (isCsv || isExcel) {
        const systemPrompt = `You are an invoice data extractor. Extract the following from this invoice/bill data and respond ONLY with valid JSON, no other text:
{
  "vendor": "company name",
  "description": "brief description of what this invoice is for",
  "amount": number (just the number, no currency symbol),
  "dueDate": "YYYY-MM-DD format",
  "category": one of: "operations", "inventory", "marketing", "software", "shipping", "taxes", "other"
}
If you cannot find a field, use null. For dueDate, if only month/year given, use the 1st of that month. Look for amounts, totals, due dates, vendor names in the data.`;
        
        const text = await callAI(`Extract invoice details from this data:\n\n${textContent.slice(0, 5000)}`, systemPrompt);
        
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const extracted = JSON.parse(jsonMatch[0]);
          setInvoiceForm(prev => ({
            ...prev,
            vendor: extracted.vendor || prev.vendor,
            description: extracted.description || prev.description,
            amount: extracted.amount?.toString() || prev.amount,
            dueDate: extracted.dueDate || prev.dueDate,
            category: extracted.category || prev.category,
          }));
        }
      } else {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        
        const systemPrompt = `You are an invoice data extractor. Extract the following from the invoice and respond ONLY with valid JSON, no other text:
{
  "vendor": "company name",
  "description": "brief description of what this invoice is for",
  "amount": number (just the number, no currency symbol),
  "dueDate": "YYYY-MM-DD format",
  "category": one of: "operations", "inventory", "marketing", "software", "shipping", "taxes", "other"
}
If you cannot find a field, use null. For dueDate, if only month/year given, use the 1st of that month.`;
        
        const text = await callAI({
          system: systemPrompt,
          messages: [{ 
            role: 'user', 
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 }},
              { type: 'text', text: 'Extract the invoice details from this PDF.' }
            ]
          }]
        });
        
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const extracted = JSON.parse(jsonMatch[0]);
          setInvoiceForm(prev => ({
            ...prev,
            vendor: extracted.vendor || prev.vendor,
            description: extracted.description || prev.description,
            amount: extracted.amount?.toString() || prev.amount,
            dueDate: extracted.dueDate || prev.dueDate,
            category: extracted.category || prev.category,
          }));
        }
      }
    } catch (error) {
      console.error('File extraction error:', error);
      alert('Could not extract invoice details. Please enter manually.');
    } finally {
      setProcessingPdf(false);
    }
  };
  
  const upcomingInvoices = invoices.filter(i => !i.paid).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  const paidInvoices = invoices.filter(i => i.paid).sort((a, b) => new Date(b.paidDate) - new Date(a.paidDate)).slice(0, 10);
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FileText className="w-6 h-6 text-amber-400" />
            Upcoming Bills & Invoices
          </h2>
          <button onClick={() => { setShowInvoiceModal(false); resetForm(); }} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Add/Edit Form */}
        <div className="bg-slate-900/50 rounded-xl p-4 mb-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">{editingInvoice ? 'Edit Invoice' : 'Add New Invoice'}</h3>
          
          {/* PDF Upload */}
          <div className="mb-4">
            <label className={`flex items-center justify-center gap-2 p-3 border-2 border-dashed rounded-xl cursor-pointer transition-all ${processingPdf ? 'border-violet-500 bg-violet-950/30' : 'border-slate-600 hover:border-slate-500'}`}>
              <input type="file" accept=".pdf,.xlsx,.xls,.csv" onChange={(e) => e.target.files[0] && handlePdfUpload(e.target.files[0])} className="hidden" disabled={processingPdf} />
              {processingPdf ? (
                <>
                  <RefreshCw className="w-5 h-5 text-violet-400 animate-spin" />
                  <span className="text-violet-400">Extracting invoice details...</span>
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5 text-slate-400" />
                  <span className="text-slate-400">Upload PDF, Excel, or CSV to auto-fill</span>
                </>
              )}
            </label>
          </div>
          
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Vendor/Company *</label>
              <input 
                id="invoice-vendor"
                defaultValue={invoiceForm.vendor}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" 
                placeholder="Amazon, Shopify, etc." 
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Amount *</label>
              <input 
                type="number" 
                id="invoice-amount"
                defaultValue={invoiceForm.amount}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" 
                placeholder="0.00" 
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Due Date *</label>
              <input 
                type="date" 
                id="invoice-duedate"
                defaultValue={invoiceForm.dueDate}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" 
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Category</label>
              <select 
                id="invoice-category"
                defaultValue={invoiceForm.category}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
                {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          
          <div className="mb-3">
            <label className="block text-xs text-slate-400 mb-1">Description</label>
            <input 
              id="invoice-description"
              defaultValue={invoiceForm.description}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" 
              placeholder="Monthly subscription, inventory purchase, etc." 
            />
          </div>
          
          <div className="flex items-center gap-4 mb-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                id="invoice-recurring"
                defaultChecked={invoiceForm.recurring}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-violet-500" 
              />
              <span className="text-sm text-slate-300">Recurring bill</span>
            </label>
            <select 
              id="invoice-frequency"
              defaultValue={invoiceForm.frequency}
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1 text-white text-sm">
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          
          <div className="flex gap-2">
            <button onClick={() => {
              const vendor = document.getElementById('invoice-vendor')?.value || '';
              const amount = document.getElementById('invoice-amount')?.value || '';
              const dueDate = document.getElementById('invoice-duedate')?.value || '';
              const category = document.getElementById('invoice-category')?.value || 'operations';
              const description = document.getElementById('invoice-description')?.value || '';
              const recurring = document.getElementById('invoice-recurring')?.checked || false;
              const frequency = document.getElementById('invoice-frequency')?.value || 'monthly';
              
              if (!vendor || !amount || !dueDate) return;
              
              const invoice = {
                id: editingInvoice?.id || Date.now().toString(),
                vendor, description, amount: parseFloat(amount), dueDate, recurring, frequency, category,
                createdAt: editingInvoice?.createdAt || new Date().toISOString(),
                paid: editingInvoice?.paid || false,
              };
              
              if (editingInvoice) {
                setInvoices(prev => prev.map(i => i.id === editingInvoice.id ? invoice : i));
              } else {
                setInvoices(prev => [...prev, invoice]);
              }
              resetForm();
            }}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 rounded-lg text-sm">
              {editingInvoice ? 'Update' : 'Add Invoice'}
            </button>
            {editingInvoice && (
              <button onClick={resetForm} className="px-4 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 rounded-lg text-sm">
                Cancel
              </button>
            )}
          </div>
        </div>
        
        {/* Upcoming Invoices */}
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-amber-400 mb-2 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Upcoming ({upcomingInvoices.length})
          </h3>
          {upcomingInvoices.length > 0 ? (
            <div className="space-y-2">
              {upcomingInvoices.map(inv => {
                const daysUntil = Math.ceil((new Date(inv.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
                const isOverdue = daysUntil < 0;
                const isDueSoon = daysUntil <= 7 && daysUntil >= 0;
                const cat = categories.find(c => c.value === inv.category);
                
                return (
                  <div key={inv.id} className={`flex items-center justify-between p-3 rounded-xl border ${isOverdue ? 'bg-rose-900/20 border-rose-500/50' : isDueSoon ? 'bg-amber-900/20 border-amber-500/50' : 'bg-slate-900/50 border-slate-700'}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{cat?.label.split(' ')[0]}</span>
                      <div>
                        <p className="text-white font-medium">{inv.vendor}</p>
                        <p className="text-slate-400 text-xs">{inv.description || 'No description'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-white font-bold">{formatCurrency(inv.amount)}</p>
                        <p className={`text-xs ${isOverdue ? 'text-rose-400' : isDueSoon ? 'text-amber-400' : 'text-slate-400'}`}>
                          {isOverdue ? `${Math.abs(daysUntil)} days overdue` : daysUntil === 0 ? 'Due today' : `Due in ${daysUntil} days`}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => handleMarkPaid(inv.id)} className="p-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 rounded-lg text-emerald-400" title="Mark as paid">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setEditingInvoice(inv); setInvoiceForm({ vendor: inv.vendor, description: inv.description || '', amount: inv.amount.toString(), dueDate: inv.dueDate, recurring: inv.recurring || false, frequency: inv.frequency || 'monthly', category: inv.category || 'operations' }); }} className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-400" title="Edit">
                          <FileText className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(inv.id)} className="p-1.5 bg-rose-600/30 hover:bg-rose-600/50 rounded-lg text-rose-400" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-slate-500 text-sm text-center py-4">No upcoming invoices</p>
          )}
        </div>
        
        {/* Recently Paid */}
        {paidInvoices.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-emerald-400 mb-2 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Recently Paid
            </h3>
            <div className="space-y-1">
              {paidInvoices.map(inv => (
                <div key={inv.id} className="flex items-center justify-between p-2 bg-slate-900/30 rounded-lg opacity-60">
                  <span className="text-slate-400 text-sm">{inv.vendor}</span>
                  <span className="text-slate-400 text-sm">{formatCurrency(inv.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InvoiceModal;
