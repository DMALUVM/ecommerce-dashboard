import React, { useState, useRef, useEffect } from 'react';
import { LayoutDashboard, TrendingDown, Package, Megaphone } from 'lucide-react';

const tabs = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'KPIs, alerts, top sellers, and weekly goals at a glance' },
  { id: 'pnl', label: 'P&L', icon: TrendingDown, description: 'Revenue waterfall from gross sales to net profit' },
  { id: 'inventory', label: 'Inventory', icon: Package, description: 'FBA, AWD, and 3PL stock levels with PO tracking' },
  { id: 'ads', label: 'Ads', icon: Megaphone, description: 'Amazon PPC + Meta + Google ad performance' },
];

export default function DashboardPreviewSection() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const activeTabData = tabs.find((t) => t.id === activeTab);

  return (
    <section
      id="dashboard-preview"
      ref={ref}
      className="relative py-24 sm:py-32"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div
          className="text-center max-w-3xl mx-auto mb-12 transition-all duration-700"
          style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(24px)' }}
        >
          <p className="text-emerald-400 text-sm font-semibold uppercase tracking-wider mb-3">See It In Action</p>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            A Dashboard Built by Sellers,{' '}
            <span className="text-slate-400">for Sellers</span>
          </h2>
          <p className="text-lg text-slate-400">
            Every view is designed to answer the questions you actually ask every day. No fluff, no vanity metrics.
          </p>
        </div>

        {/* Tab switcher */}
        <div
          className="flex justify-center gap-2 mb-8 flex-wrap transition-all duration-700"
          style={{ opacity: visible ? 1 : 0, transitionDelay: '200ms' }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Main preview */}
        <div
          className="relative transition-all duration-700"
          style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(32px)', transitionDelay: '300ms' }}
        >
          {/* Glow */}
          <div className="absolute -inset-8 bg-gradient-to-br from-emerald-500/5 via-transparent to-violet-500/5 rounded-3xl blur-3xl" />

          {/* Browser frame */}
          <div className="relative bg-slate-900/80 border border-slate-700/50 rounded-2xl overflow-hidden shadow-2xl">
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 bg-slate-900 border-b border-slate-800">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-rose-500/60" />
                <div className="w-3 h-3 rounded-full bg-amber-500/60" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
              </div>
              <div className="flex-1 mx-8">
                <div className="h-6 rounded-lg bg-slate-800/80 max-w-md mx-auto flex items-center justify-center">
                  <span className="text-[11px] text-slate-500">app.ecommdashboard.com</span>
                </div>
              </div>
            </div>

            {/* Screenshot area */}
            <div className="aspect-[16/9] bg-gradient-to-br from-slate-900 to-slate-950 relative overflow-hidden">
              {/* Placeholder — swap with real screenshot per tab */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <activeTabData.icon className="w-12 h-12 text-slate-700" />
                <p className="text-slate-600 text-sm">{activeTabData.label} screenshot goes here</p>
                <p className="text-slate-700 text-xs">{activeTabData.description}</p>
              </div>
              {/*
                Replace with per-tab screenshots:
                <img
                  src={`/screenshots/${activeTab}-preview.png`}
                  alt={`${activeTabData.label} view`}
                  className="w-full h-full object-cover object-top"
                />
              */}
            </div>
          </div>

          {/* Caption */}
          <p className="text-center text-sm text-slate-500 mt-4">
            {activeTabData.description}
          </p>
        </div>
      </div>
    </section>
  );
}
