import React from 'react';

// Base shimmer animation
const shimmer = "animate-pulse bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 bg-[length:200%_100%]";

// Single skeleton bar
export const SkeletonBar = ({ className = "h-4 w-full" }) => (
  <div className={`${shimmer} rounded ${className}`} />
);

// Skeleton for a KPI metric card
export const SkeletonCard = () => (
  <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5">
    <div className="flex items-center justify-between mb-3">
      <SkeletonBar className="h-3 w-20" />
      <SkeletonBar className="h-8 w-8 rounded-xl" />
    </div>
    <SkeletonBar className="h-8 w-32 mb-2" />
    <SkeletonBar className="h-3 w-24" />
  </div>
);

// Skeleton for a 4-card KPI row
export const SkeletonKPIRow = ({ count = 4 }) => (
  <div className={`grid grid-cols-2 lg:grid-cols-${count} gap-4 mb-6`}>
    {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
  </div>
);

// Skeleton for a chart area
export const SkeletonChart = ({ height = "h-64" }) => (
  <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5 mb-6">
    <div className="flex items-center justify-between mb-4">
      <SkeletonBar className="h-4 w-40" />
      <div className="flex gap-2">
        <SkeletonBar className="h-7 w-16 rounded-lg" />
        <SkeletonBar className="h-7 w-16 rounded-lg" />
      </div>
    </div>
    <div className={`${height} ${shimmer} rounded-xl`} />
  </div>
);

// Skeleton for a table
export const SkeletonTable = ({ rows = 5, cols = 4 }) => (
  <div className="bg-slate-800/50 rounded-2xl border border-slate-700 overflow-hidden">
    {/* Header */}
    <div className="px-5 py-3 border-b border-slate-700 flex gap-4">
      {Array.from({ length: cols }).map((_, i) => (
        <SkeletonBar key={i} className="h-3 flex-1" />
      ))}
    </div>
    {/* Rows */}
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="px-5 py-3 border-b border-slate-700/50 flex gap-4">
        {Array.from({ length: cols }).map((_, c) => (
          <SkeletonBar key={c} className={`h-4 flex-1 ${c === 0 ? 'w-32' : ''}`} />
        ))}
      </div>
    ))}
  </div>
);

// Skeleton for the full dashboard page
export const SkeletonDashboard = () => (
  <div className="space-y-6">
    <SkeletonKPIRow count={4} />
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <SkeletonChart />
      <SkeletonChart />
    </div>
    <SkeletonTable rows={4} cols={5} />
  </div>
);

// Skeleton for a list/feed
export const SkeletonList = ({ items = 3 }) => (
  <div className="space-y-3">
    {Array.from({ length: items }).map((_, i) => (
      <div key={i} className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 flex items-center gap-4">
        <SkeletonBar className="h-10 w-10 rounded-xl flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <SkeletonBar className="h-4 w-3/4" />
          <SkeletonBar className="h-3 w-1/2" />
        </div>
        <SkeletonBar className="h-6 w-16 rounded-lg" />
      </div>
    ))}
  </div>
);

export default {
  SkeletonBar,
  SkeletonCard,
  SkeletonKPIRow,
  SkeletonChart,
  SkeletonTable,
  SkeletonDashboard,
  SkeletonList,
};
