import React from 'react';

const SettingRow = ({ label, desc, children }) => (
  <div className="flex items-center justify-between py-3 border-b border-slate-700/50 last:border-0">
    <div className="flex-1 pr-4">
      <p className="text-white font-medium">{label}</p>
      {desc && <p className="text-slate-400 text-sm">{desc}</p>}
    </div>
    <div className="flex-shrink-0">{children}</div>
  </div>
);

export default SettingRow;
