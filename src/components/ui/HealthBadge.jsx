import React from 'react';

const HealthBadge = ({ health }) => {
  const s = { 
    critical: 'bg-rose-500/20 text-rose-400', 
    low: 'bg-amber-500/20 text-amber-400', 
    reorder: 'bg-amber-500/20 text-amber-400',  // AI urgency
    monitor: 'bg-cyan-500/20 text-cyan-400',    // AI urgency
    healthy: 'bg-emerald-500/20 text-emerald-400', 
    overstock: 'bg-violet-500/20 text-violet-400', 
    unknown: 'bg-slate-500/20 text-slate-400' 
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s[health] || s.unknown}`}>{health || '—'}</span>;
};

export default HealthBadge;
