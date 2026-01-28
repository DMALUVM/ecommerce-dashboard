import React from 'react';

const SettingSection = ({ title, children }) => (
  <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6 mb-6">
    <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
    {children}
  </div>
);

export default SettingSection;
