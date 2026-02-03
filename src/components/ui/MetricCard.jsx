import React from 'react';

const MetricCard = ({ label, value, sub, icon: Icon, color = 'slate', trend, onClick }) => {
  const colors = { 
    emerald: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/30 hover:border-emerald-400/50', 
    blue: 'from-blue-500/20 to-blue-600/5 border-blue-500/30 hover:border-blue-400/50', 
    amber: 'from-amber-500/20 to-amber-600/5 border-amber-500/30 hover:border-amber-400/50', 
    rose: 'from-rose-500/20 to-rose-600/5 border-rose-500/30 hover:border-rose-400/50', 
    violet: 'from-violet-500/20 to-violet-600/5 border-violet-500/30 hover:border-violet-400/50', 
    orange: 'from-orange-500/20 to-orange-600/5 border-orange-500/30 hover:border-orange-400/50', 
    cyan: 'from-cyan-500/20 to-cyan-600/5 border-cyan-500/30 hover:border-cyan-400/50',
    slate: 'from-slate-500/20 to-slate-600/5 border-slate-500/30 hover:border-slate-400/50',
  };
  const iconC = { 
    emerald: 'text-emerald-400 bg-emerald-500/20', 
    blue: 'text-blue-400 bg-blue-500/20', 
    amber: 'text-amber-400 bg-amber-500/20', 
    rose: 'text-rose-400 bg-rose-500/20', 
    violet: 'text-violet-400 bg-violet-500/20', 
    orange: 'text-orange-400 bg-orange-500/20', 
    cyan: 'text-cyan-400 bg-cyan-500/20',
    slate: 'text-slate-400 bg-slate-500/20',
  };
  
  const trendColors = {
    up: 'text-emerald-400',
    down: 'text-rose-400',
    flat: 'text-slate-400',
  };
  
  const trendIcons = {
    up: '↑',
    down: '↓',
    flat: '→',
  };

  return (
    <div 
      className={`bg-gradient-to-br ${colors[color] || colors.emerald} border rounded-2xl p-5 transition-all duration-200 hover:shadow-lg hover:shadow-black/10 hover:-translate-y-0.5 ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-slate-400 text-sm font-medium">{label}</span>
        {Icon && (
          <div className={`p-1.5 rounded-lg ${iconC[color] || iconC.emerald}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-white mb-1 transition-all duration-300">{value}</div>
      {(sub || trend) && (
        <div className="flex items-center gap-2">
          {trend && (
            <span className={`text-sm font-medium ${trendColors[trend.direction] || trendColors.flat}`}>
              {trendIcons[trend.direction]} {trend.value}
            </span>
          )}
          {sub && <span className="text-sm text-slate-400">{sub}</span>}
        </div>
      )}
    </div>
  );
};

export default MetricCard;
