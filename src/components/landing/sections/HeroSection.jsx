import React, { useState } from 'react';
import { ArrowRight, Play, TrendingUp, DollarSign, Package, BarChart3, ShoppingCart, Zap } from 'lucide-react';
import AuthModal from './AuthModal.jsx';

function FloatingCard({ icon, label, value, color, className }) {
  const CardIcon = icon;
  return (
    <div className={`absolute bg-slate-900/90 backdrop-blur-md border border-slate-700/50 rounded-xl px-4 py-3 shadow-2xl ${className}`}>
      <div className="flex items-center gap-2.5">
        <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center`}>
          <CardIcon className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-[11px] text-slate-400 leading-tight">{label}</p>
          <p className="text-sm font-bold text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}

export default function HeroSection({ supabase }) {
  const [authModal, setAuthModal] = useState(null);

  const scrollToPreview = () => {
    document.getElementById('dashboard-preview')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative min-h-screen flex items-center pt-20 overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-emerald-500/8 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-violet-500/8 rounded-full blur-[128px]" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left — Copy */}
          <div className="max-w-2xl">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 mb-8">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-300">Built for Amazon & Shopify sellers</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1] mb-6">
              Your Entire Ecommerce Business.{' '}
              <span className="bg-gradient-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent">One Dashboard.</span>{' '}
              <span className="text-slate-400">Zero Guesswork.</span>
            </h1>

            <p className="text-lg sm:text-xl text-slate-400 leading-relaxed mb-10 max-w-xl">
              Stop toggling between Seller Central, Shopify, QuickBooks, and spreadsheets. See revenue, profit, inventory, and ads in one place — updated automatically.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => setAuthModal('sign_up')}
                className="group px-8 py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-base transition-all shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 flex items-center justify-center gap-2"
              >
                Start Your Free Trial
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <button
                onClick={scrollToPreview}
                className="group px-8 py-4 rounded-xl border border-slate-700 hover:border-slate-500 text-slate-200 font-semibold text-base transition-all flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4 text-emerald-400" />
                See It In Action
              </button>
            </div>

            {/* Trust badges */}
            <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3">
              <span className="text-xs text-slate-500 uppercase tracking-wider font-medium">Works with</span>
              {['Amazon', 'Shopify', 'QuickBooks', 'Meta Ads', 'Google Ads'].map((name) => (
                <span key={name} className="text-sm text-slate-400 font-medium px-3 py-1 rounded-lg bg-slate-800/50 border border-slate-800">
                  {name}
                </span>
              ))}
            </div>
          </div>

          {/* Right — Visual */}
          <div className="relative hidden lg:block">
            {/* Main dashboard mockup placeholder */}
            <div className="relative">
              {/* Glow */}
              <div className="absolute -inset-4 bg-gradient-to-br from-emerald-500/10 via-transparent to-violet-500/10 rounded-3xl blur-2xl" />

              {/* Screenshot container */}
              <div className="relative bg-slate-900/80 border border-slate-700/50 rounded-2xl p-1 shadow-2xl">
                <div className="rounded-xl overflow-hidden bg-slate-950">
                  {/* Browser chrome */}
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 border-b border-slate-800">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                      <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                      <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                    </div>
                    <div className="flex-1 mx-4">
                      <div className="h-5 rounded-md bg-slate-800 max-w-xs" />
                    </div>
                  </div>

                  {/* Screenshot slot — replace src with actual screenshot */}
                  <div className="aspect-[16/10] bg-gradient-to-br from-slate-900 to-slate-950 flex items-center justify-center relative overflow-hidden">
                    {/* Placeholder grid to simulate dashboard */}
                    <div className="absolute inset-4 grid grid-cols-4 grid-rows-3 gap-3 opacity-30">
                      {Array.from({ length: 12 }).map((_, i) => (
                        <div key={i} className="rounded-lg bg-slate-800 animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
                      ))}
                    </div>
                    <p className="text-slate-600 text-sm z-10">Dashboard screenshot goes here</p>
                    {/* <img src="/screenshots/dashboard-hero.png" alt="EcommDashboard overview" className="w-full h-full object-cover object-top" /> */}
                  </div>
                </div>
              </div>

              {/* Floating KPI cards */}
              <FloatingCard
                icon={DollarSign}
                label="Weekly Revenue"
                value="$47,832"
                color="bg-emerald-500"
                className="top-8 -left-16 animate-float-slow"
              />
              <FloatingCard
                icon={TrendingUp}
                label="Profit Margin"
                value="32.4%"
                color="bg-violet-500"
                className="top-1/2 -right-12 animate-float-delayed"
              />
              <FloatingCard
                icon={Package}
                label="Units In Stock"
                value="12,847"
                color="bg-blue-500"
                className="bottom-12 -left-8 animate-float-slow-2"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Auth Modal */}
      {authModal && (
        <AuthModal
          supabase={supabase}
          mode={authModal}
          onModeChange={setAuthModal}
          onClose={() => setAuthModal(null)}
        />
      )}
    </section>
  );
}
