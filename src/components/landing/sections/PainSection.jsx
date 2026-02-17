import React, { useRef, useEffect, useState } from 'react';
import { Shuffle, EyeOff, FileSpreadsheet, AlertTriangle } from 'lucide-react';

const painPoints = [
  {
    icon: Shuffle,
    title: 'Scattered Data',
    stat: '6+ platforms',
    description: 'The average seller checks six or more platforms daily just to understand their business. Seller Central, Shopify, QuickBooks, ad managers, 3PL portals — none of them talk to each other.',
    color: 'from-rose-500 to-orange-500',
    bgGlow: 'bg-rose-500/10',
  },
  {
    icon: EyeOff,
    title: 'Blind Profitability',
    stat: '67% of sellers',
    description: "don't know their true net margin after all fees, ads, COGS, and 3PL costs. Revenue looks great — until you account for everything eating into it.",
    color: 'from-amber-500 to-yellow-500',
    bgGlow: 'bg-amber-500/10',
  },
  {
    icon: FileSpreadsheet,
    title: 'Manual Spreadsheets',
    stat: 'Hours every week',
    description: 'spent copying data between Amazon, Shopify, and Excel. By the time your spreadsheet is updated, the data is already stale and the decisions are already late.',
    color: 'from-blue-500 to-cyan-500',
    bgGlow: 'bg-blue-500/10',
  },
  {
    icon: AlertTriangle,
    title: 'Missed Opportunities',
    stat: 'Revenue left on the table',
    description: "Without real-time inventory and ad data, you're bleeding money on stockouts, over-spending on campaigns that aren't converting, and missing reorder windows.",
    color: 'from-violet-500 to-purple-500',
    bgGlow: 'bg-violet-500/10',
  },
];

function FadeIn({ children, delay = 0 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.15 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="transition-all duration-700"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(24px)',
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

export default function PainSection() {
  return (
    <section className="relative py-24 sm:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <FadeIn>
          <div className="text-center max-w-3xl mx-auto mb-16">
            <p className="text-emerald-400 text-sm font-semibold uppercase tracking-wider mb-3">The Problem</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Running an Ecommerce Brand Shouldn't Feel Like{' '}
              <span className="text-slate-400">Flying Blind</span>
            </h2>
            <p className="text-lg text-slate-400">
              You built a real business. But you're still making critical decisions based on fragmented data, gut feelings, and outdated spreadsheets.
            </p>
          </div>
        </FadeIn>

        {/* Pain cards */}
        <div className="grid sm:grid-cols-2 gap-6">
          {painPoints.map((pain, i) => (
            <FadeIn key={pain.title} delay={i * 100}>
              <div className="group relative bg-slate-900/60 border border-slate-800 rounded-2xl p-6 sm:p-8 hover:border-slate-700 transition-all duration-300">
                {/* Subtle glow on hover */}
                <div className={`absolute -inset-px ${pain.bgGlow} rounded-2xl opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-500`} />

                <div className="relative">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${pain.color} flex items-center justify-center mb-5 shadow-lg`}>
                    <pain.icon className="w-6 h-6 text-white" />
                  </div>

                  <div className="mb-3">
                    <span className={`text-sm font-bold bg-gradient-to-r ${pain.color} bg-clip-text text-transparent`}>
                      {pain.stat}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-white mb-2">{pain.title}</h3>
                  <p className="text-slate-400 leading-relaxed">{pain.description}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
