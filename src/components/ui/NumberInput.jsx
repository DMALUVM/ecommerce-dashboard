import React from 'react';

const NumberInput = ({ value, onChange, min, max, step = 1, suffix = '' }) => (
  <div className="flex items-center gap-2">
    <input type="number" value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} min={min} max={max} step={step} className="w-20 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-right" />
    {suffix && <span className="text-slate-400 text-sm">{suffix}</span>}
  </div>
);

export default NumberInput;
