import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, Shield, Zap, ArrowRight } from 'lucide-react';
import AuthModal from './AuthModal.jsx';

const features = [
  'Up to 5 stores',
  'Unlimited historical data',
  'AI-powered forecasting & insights',
  'All integrations (Amazon, Shopify, QuickBooks, Meta, Google)',
  'Real-time inventory tracking (FBA, AWD, 3PL)',
  'P&L waterfall & profitability analysis',
  'Sales tax tracking & filing deadlines',
  'Ad performance (TACOS, ACOS, ROAS)',
  'Weekly AI reports',
  'Data export (Excel, CSV)',
  'Priority support',
];

const faqs = [
  {
    q: 'What happens after the 14-day trial?',
    a: "You'll be prompted to subscribe to continue using EcommDashboard. Your data and settings are preserved — nothing is lost. If you choose not to subscribe, your account enters read-only mode.",
  },
  {
    q: 'Is my data secure?',
    a: 'Your API keys are encrypted at rest with AES-256. We use a BYOK (Bring Your Own Keys) model — you connect your own platform credentials, which means you can revoke access anytime from the source platform. All data is transmitted over HTTPS and stored in SOC 2 compliant infrastructure.',
  },
  {
    q: 'What integrations are supported?',
    a: 'Amazon Seller Central (SP-API), Shopify (Admin API), QuickBooks Online, Meta Ads (Facebook/Instagram), Google Ads, Google Sheets, and Packiyo (3PL). We\'re constantly adding more based on seller requests.',
  },
  {
    q: 'Can I manage multiple stores or brands?',
    a: 'Yes — the Pro plan supports up to 5 separate stores, each with their own integrations, data, and credentials. You can switch between them instantly from the dashboard.',
  },
  {
    q: 'Do I need technical skills to set it up?',
    a: 'Not at all. Our onboarding wizard walks you through connecting each platform step-by-step with screenshots and copy-paste instructions. Most sellers are fully set up within 15-20 minutes.',
  },
];

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-800 last:border-0">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between py-5 text-left group">
        <span className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors pr-4">{q}</span>
        <ChevronDown className={`w-4 h-4 text-slate-500 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-48 pb-5' : 'max-h-0'}`}>
        <p className="text-sm text-slate-400 leading-relaxed">{a}</p>
      </div>
    </div>
  );
}

export default function PricingSection({ supabase }) {
  const [authModal, setAuthModal] = useState(null);
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
    <section
      id="pricing"
      ref={ref}
      className="relative py-24 sm:py-32"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-900/50 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div
          className="text-center max-w-3xl mx-auto mb-12 transition-all duration-700"
          style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(24px)' }}
        >
          <p className="text-emerald-400 text-sm font-semibold uppercase tracking-wider mb-3">Simple Pricing</p>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            One Plan. Everything Included.{' '}
            <span className="text-slate-400">No Surprises.</span>
          </h2>
          <p className="text-lg text-slate-400">
            Start free for 14 days. No credit card required. Cancel anytime.
          </p>
        </div>

        {/* Pricing card */}
        <div
          className="max-w-lg mx-auto mb-20 transition-all duration-700"
          style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(24px)', transitionDelay: '150ms' }}
        >
          <div className="relative">
            {/* Glow */}
            <div className="absolute -inset-1 bg-gradient-to-br from-emerald-500/20 via-transparent to-violet-500/20 rounded-3xl blur-xl" />

            <div className="relative bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
              {/* Badge */}
              <div className="bg-gradient-to-r from-emerald-500 to-emerald-400 py-2 text-center">
                <span className="text-sm font-bold text-slate-950">14-Day Free Trial — No Credit Card</span>
              </div>

              <div className="p-8">
                {/* Price */}
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-5xl font-extrabold text-white">$79</span>
                  <span className="text-slate-400">/month</span>
                </div>
                <p className="text-sm text-slate-500 mb-8">Billed monthly. Save 20% with annual billing.</p>

                {/* CTA */}
                <button
                  onClick={() => setAuthModal('sign_up')}
                  className="group w-full py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-base transition-all shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 flex items-center justify-center gap-2 mb-8"
                >
                  Start Free Trial
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>

                {/* Features list */}
                <div className="space-y-3">
                  {features.map((feature) => (
                    <div key={feature} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-emerald-400" />
                      </div>
                      <span className="text-sm text-slate-300">{feature}</span>
                    </div>
                  ))}
                </div>

                {/* Trust indicators */}
                <div className="flex items-center gap-6 mt-8 pt-6 border-t border-slate-800">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Shield className="w-4 h-4" />
                    <span>256-bit encryption</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Zap className="w-4 h-4" />
                    <span>Cancel anytime</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div
          className="max-w-2xl mx-auto transition-all duration-700"
          style={{ opacity: visible ? 1 : 0, transitionDelay: '300ms' }}
        >
          <h3 className="text-xl font-bold text-center mb-8">Frequently Asked Questions</h3>
          <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl px-6">
            {faqs.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
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
