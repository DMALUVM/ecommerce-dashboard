import React from 'react';

const MetricCard = ({ label, value, sub, icon: Icon, color = 'slate' }) => {
  const colors = { emerald: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/30', blue: 'from-blue-500/20 to-blue-600/5 border-blue-500/30', amber: 'from-amber-500/20 to-amber-600/5 border-amber-500/30', rose: 'from-rose-500/20 to-rose-600/5 border-rose-500/30', violet: 'from-violet-500/20 to-violet-600/5 border-violet-500/30', orange: 'from-orange-500/20 to-orange-600/5 border-orange-500/30', cyan: 'from-cyan-500/20 to-cyan-600/5 border-cyan-500/30' };
  const iconC = { emerald: 'text-emerald-400', blue: 'text-blue-400', amber: 'text-amber-400', rose: 'text-rose-400', violet: 'text-violet-400', orange: 'text-orange-400', cyan: 'text-cyan-400' };
  return (
    <div className={`bg-gradient-to-br ${colors[color] || colors.emerald} border rounded-2xl p-5`}>
      <div className="flex items-start justify-between mb-3"><span className="text-slate-400 text-sm font-medium">{label}</span>{Icon && <Icon className={`w-5 h-5 ${iconC[color] || iconC.emerald}`} />}</div>
      <div className="text-2xl font-bold text-white mb-1">{value}</div>
      {sub && <div className="text-sm text-slate-400">{sub}</div>}
    </div>
  );
};

export default MetricCard;
