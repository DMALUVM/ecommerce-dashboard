import React from 'react';
import { FileText, X, ShoppingCart, ShoppingBag, Boxes, Truck, DollarSign } from 'lucide-react';

const COLOR_CLASS_MAP = {
  violet: { border: 'border-violet-500/20', text: 'text-violet-400' },
  orange: { border: 'border-orange-500/20', text: 'text-orange-400' },
  blue: { border: 'border-blue-500/20', text: 'text-blue-400' },
  emerald: { border: 'border-emerald-500/20', text: 'text-emerald-400' },
  amber: { border: 'border-amber-500/20', text: 'text-amber-400' },
  rose: { border: 'border-rose-500/20', text: 'text-rose-400' },
};

const HelpSection = ({ icon, title, steps, color = 'violet' }) => {
  const colorClasses = COLOR_CLASS_MAP[color] || COLOR_CLASS_MAP.violet;

  return (
    <div className={`bg-slate-900/50 rounded-xl p-4 border ${colorClasses.border}`}>
      <h4 className={`${colorClasses.text} font-semibold mb-3 flex items-center gap-2`}>
        {icon}
        {title}
      </h4>
      <ol className="space-y-2 text-sm text-slate-300">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-2">
            <span className={`${colorClasses.text} font-medium`}>{i + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
};

const UploadHelpModal = ({ showUploadHelp, setShowUploadHelp }) => {
  if (!showUploadHelp) return null;
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FileText className="w-6 h-6 text-violet-400" />
            How to Upload Data
          </h2>
          <button onClick={() => setShowUploadHelp(false)} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="space-y-4">
          <HelpSection 
            icon={<ShoppingCart className="w-5 h-5" />}
            title="Amazon Sales (SKU Economics Report)"
            color="orange"
            steps={[
              'Go to Seller Central → Reports → Business Reports → SKU Economics',
              'Select your marketplace',
              'Set Data Aggregation to "MSKU"',
              'Select your desired date range',
              'Check ALL boxes under "Set Report Configurations"',
              'Important: Make sure COGS are entered in Amazon for accurate data',
              'Export as CSV'
            ]}
          />
          
          <HelpSection 
            icon={<ShoppingBag className="w-5 h-5" />}
            title="Shopify Sales"
            color="blue"
            steps={[
              'Go to Analytics → Reports',
              'Find "Total sales by product variant SKU"',
              'Select your date range',
              'Export as CSV'
            ]}
          />
          
          <HelpSection 
            icon={<Boxes className="w-5 h-5" />}
            title="Amazon Inventory (FBA)"
            color="emerald"
            steps={[
              'Go to Inventory → FBA Inventory',
              'Click "Reports"',
              'Select "Inventory Report"',
              'Download as CSV'
            ]}
          />
          
          <HelpSection 
            icon={<Truck className="w-5 h-5" />}
            title="3PL Inventory (Packiyo)"
            color="amber"
            steps={[
              'Go to Inventory → Products',
              'Click Export',
              'Convert Excel file to CSV format'
            ]}
          />
          
          <HelpSection 
            icon={<DollarSign className="w-5 h-5" />}
            title="3PL Charges"
            color="rose"
            steps={[
              'Create or export a CSV with your weekly 3PL charges',
              'Include columns for charge types and amounts',
              'Upload to track fulfillment costs'
            ]}
          />
        </div>
        
        <div className="mt-6 pt-4 border-t border-slate-700">
          <button 
            onClick={() => setShowUploadHelp(false)} 
            className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold py-2 rounded-xl"
          >
            Got It!
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadHelpModal;
