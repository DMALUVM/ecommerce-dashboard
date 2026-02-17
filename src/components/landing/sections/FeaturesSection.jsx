import React, { useRef, useState, useEffect } from 'react';
import { LayoutDashboard, TrendingDown, Package, Megaphone, Sparkles, Landmark } from 'lucide-react';

const features = [
  {
    icon: LayoutDashboard,
    title: 'Unified Dashboard',
    description: 'All your channels — Amazon, Shopify, DTC — in one real-time view. Daily, weekly, monthly, yearly. No more toggling between tabs.',
    color: 'from-emerald-400 to-emerald-600',
    shadow: 'shadow-emerald-500/20',
    screenshotSlot: 'dashboard-overview',
  },
  {
    icon: TrendingDown,
    title: 'True P&L',
    description: 'See exactly where your money goes: Revenue → COGS → Ads → 3PL fees → Net Profit. A real waterfall breakdown, not guesswork.',
    color: 'from-violet-400 to-violet-600',
    shadow: 'shadow-violet-500/20',
    screenshotSlot: 'pnl-waterfall',
  },
  {
    icon: Package,
    title: 'Inventory Intelligence',
    description: 'FBA, AWD, and 3PL levels with PO tracking, reorder alerts, and payment term management. Never miss a restock window again.',
    color: 'from-blue-400 to-blue-600',
    shadow: 'shadow-blue-500/20',
    screenshotSlot: 'inventory-view',
  },
  {
    icon: Megaphone,
    title: 'Ad Performance',
    description: 'Amazon PPC, Meta, and Google Ads in one unified view. Track TACOS, ACOS, and ROAS across every channel without spreadsheet gymnastics.',
    color: 'from-orange-400 to-orange-600',
    shadow: 'shadow-orange-500/20',
    screenshotSlot: 'ads-performance',
  },
  {
    icon: Sparkles,
    title: 'AI Forecasting',
    description: 'Revenue predictions powered by AI with accuracy tracking. Know what\'s coming before it hits — plan inventory, budget, and hiring with confidence.',
    color: 'from-pink-400 to-rose-600',
    shadow: 'shadow-rose-500/20',
    screenshotSlot: 'ai-forecast',
  },
  {
    icon: Landmark,
    title: 'Banking & Tax',
    description: 'QuickBooks synced automatically. State-by-state sales tax tracking with filing deadlines and nexus analysis. Your CFO in a dashboard.',
    color: 'from-cyan-400 to-cyan-600',
    shadow: 'shadow-cyan-500/20',
    screenshotSlot: 'banking-tax',
  },
];

function FadeIn({ children, delay = 0 }) {
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
  return (
    <div
      ref={ref}
      className="transition-all duration-700"
      style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(24px)', transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export default function FeaturesSection() {
  return (
    <section id="features" className="relative py-24 sm:py-32">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-900/50 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <FadeIn>
          <div className="text-center max-w-3xl mx-auto mb-16">
            <p className="text-emerald-400 text-sm font-semibold uppercase tracking-wider mb-3">The Solution</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-white">
              Everything You Need to Run a{' '}
              <span className="bg-gradient-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent">Profitable</span>{' '}
              Ecommerce Brand
            </h2>
            <p className="text-lg text-slate-400">
              Every feature is designed to replace a spreadsheet, eliminate a tab, or surface an insight you'd otherwise miss.
            </p>
          </div>
        </FadeIn>

        {/* Feature grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <FadeIn key={feature.title} delay={i * 80}>
              <div className="group relative h-full bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden hover:border-slate-700 transition-all duration-300">
                {/* Screenshot placeholder */}
                <div className="aspect-[16/9] bg-gradient-to-br from-slate-800/50 to-slate-900 flex items-center justify-center border-b border-slate-800/50 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-800/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <span className="text-xs text-slate-600">{feature.screenshotSlot} screenshot</span>
                  {/* Replace with: <img src={`/screenshots/${feature.screenshotSlot}.png`} alt={feature.title} className="w-full h-full object-cover" /> */}
                </div>

                {/* Content */}
                <div className="p-6">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 ${feature.shadow} shadow-lg`}>
                    <feature.icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{feature.description}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
