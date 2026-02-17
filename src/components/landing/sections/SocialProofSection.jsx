import React, { useRef, useState, useEffect } from 'react';
import { Database, Plug, Clock, Star } from 'lucide-react';

const metrics = [
  { icon: Database, value: '1M+', label: 'Data points synced daily', color: 'text-emerald-400' },
  { icon: Plug, value: '6', label: 'Platform integrations', color: 'text-violet-400' },
  { icon: Clock, value: '10+', label: 'Hours saved per week', color: 'text-blue-400' },
  { icon: Star, value: '100%', label: 'Data ownership — your keys, your data', color: 'text-amber-400' },
];

const testimonials = [
  {
    quote: "I used to spend my entire Monday morning pulling reports from Amazon, Shopify, and QuickBooks into a spreadsheet. Now I open one tab and everything's there.",
    name: 'Coming soon',
    role: '7-Figure Amazon Seller',
    avatar: null,
  },
  {
    quote: "The P&L waterfall alone was worth it. I had no idea my 3PL fees were eating 8% of revenue until I saw it visualized. We switched providers and saved $4K/month.",
    name: 'Coming soon',
    role: 'DTC Brand Owner',
    avatar: null,
  },
  {
    quote: "We manage inventory across FBA, AWD, and our own 3PL. The inventory view with PO tracking replaced a $300/month tool we were barely using.",
    name: 'Coming soon',
    role: 'Multi-Channel Seller',
    avatar: null,
  },
];

function AnimatedCounter({ target, visible }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const parsed = parseInt(target.replace(/[^0-9]/g, ''), 10);
    if (isNaN(parsed)) return;
    const duration = 1500;
    const steps = 40;
    const increment = parsed / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= parsed) { setCount(parsed); clearInterval(timer); }
      else setCount(Math.floor(current));
    }, duration / steps);
    return () => clearInterval(timer);
  }, [visible, target]);

  if (typeof count === 'string') return target;
  const formatted = count >= 1000000 ? `${(count / 1000000).toFixed(0)}M` : count >= 1000 ? `${(count / 1000).toFixed(0)}K` : count;
  return `${formatted}`;
}

export default function SocialProofSection() {
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
    <section ref={ref} className="relative py-24 sm:py-32">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-950/10 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Metric counters */}
        <div
          className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-20 transition-all duration-700"
          style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(24px)' }}
        >
          {metrics.map((metric) => (
            <div key={metric.label} className="text-center p-6 rounded-2xl bg-slate-900/40 border border-slate-800/50">
              <metric.icon className={`w-6 h-6 ${metric.color} mx-auto mb-3`} />
              <div className={`text-3xl sm:text-4xl font-extrabold ${metric.color} mb-1`}>
                <AnimatedCounter target={metric.value} visible={visible} />
              </div>
              <p className="text-sm text-slate-400">{metric.label}</p>
            </div>
          ))}
        </div>

        {/* Testimonials */}
        <div
          className="transition-all duration-700"
          style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(24px)', transitionDelay: '200ms' }}
        >
          <p className="text-center text-emerald-400 text-sm font-semibold uppercase tracking-wider mb-8">What Sellers Are Saying</p>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <div key={i} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col">
                {/* Stars */}
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star key={j} className="w-4 h-4 text-amber-400 fill-amber-400" />
                  ))}
                </div>

                <blockquote className="text-slate-300 leading-relaxed flex-1 mb-6">
                  "{t.quote}"
                </blockquote>

                <div className="flex items-center gap-3 pt-4 border-t border-slate-800">
                  {/* Avatar placeholder */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-violet-500 flex items-center justify-center text-white text-sm font-bold">
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
