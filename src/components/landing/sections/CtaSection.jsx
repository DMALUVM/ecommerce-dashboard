import React, { useState, useRef, useEffect } from 'react';
import { ArrowRight, TrendingUp } from 'lucide-react';
import AuthModal from './AuthModal.jsx';

export default function CtaSection({ supabase }) {
  const [authModal, setAuthModal] = useState(null);
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
    <section ref={ref} className="relative py-24 sm:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className="relative overflow-hidden rounded-3xl transition-all duration-700"
          style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(24px)' }}
        >
          {/* Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-emerald-950/40 to-slate-900 border border-emerald-500/10 rounded-3xl" />
          <div className="absolute top-0 left-1/4 w-[500px] h-[300px] bg-emerald-500/8 rounded-full blur-[100px]" />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[250px] bg-violet-500/8 rounded-full blur-[100px]" />

          <div className="relative px-8 py-16 sm:px-16 sm:py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center mx-auto mb-8 shadow-lg shadow-emerald-500/25">
              <TrendingUp className="w-7 h-7 text-white" />
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-6 max-w-3xl mx-auto leading-tight">
              Your Competitors Are Already Optimizing.{' '}
              <span className="bg-gradient-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent">Are You?</span>
            </h2>

            <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              Every day without unified analytics is a day you're making decisions in the dark.
              Sellers using real-time dashboards make faster, more profitable decisions — and they're
              pulling ahead while you're still copying numbers into spreadsheets.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => setAuthModal('sign_up')}
                className="group px-10 py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-base transition-all shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 flex items-center gap-2"
              >
                Start Your Free Trial
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <p className="text-sm text-slate-500">14 days free. No credit card required.</p>
            </div>
          </div>
        </div>
      </div>

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
