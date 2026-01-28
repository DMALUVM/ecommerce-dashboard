import React from 'react';

const Toggle = ({ checked, onChange }) => (
  <button onClick={() => onChange(!checked)} className={`w-12 h-6 rounded-full transition-all ${checked ? 'bg-emerald-500' : 'bg-slate-600'}`}>
    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${checked ? 'translate-x-6' : 'translate-x-0.5'}`} />
  </button>
);

export default Toggle;
