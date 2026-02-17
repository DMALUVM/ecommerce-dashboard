import React, { useState, useEffect } from 'react';
import { BarChart3, Menu, X } from 'lucide-react';
import AuthModal from './AuthModal.jsx';

export default function LandingNav({ supabase, showLogin }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authModal, setAuthModal] = useState(showLogin ? 'sign_in' : null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMobileMenuOpen(false);
  };

  return (
    <>
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-slate-950/95 backdrop-blur-md border-b border-slate-800/50 shadow-lg' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            {/* Logo */}
            <a href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:shadow-emerald-500/40 transition-shadow">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-bold text-white">EcommDashboard</span>
            </a>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-8">
              <button onClick={() => scrollTo('features')} className="text-sm text-slate-300 hover:text-white transition-colors">Features</button>
              <button onClick={() => scrollTo('pricing')} className="text-sm text-slate-300 hover:text-white transition-colors">Pricing</button>
              <button onClick={() => setAuthModal('sign_in')} className="text-sm text-slate-300 hover:text-white transition-colors">Log In</button>
              <button onClick={() => setAuthModal('sign_up')} className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold transition-colors shadow-lg shadow-emerald-500/25">
                Start Free Trial
              </button>
            </div>

            {/* Mobile menu toggle */}
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 text-slate-300 hover:text-white">
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-slate-900/98 backdrop-blur-md border-t border-slate-800/50 px-4 py-4 space-y-3">
            <button onClick={() => scrollTo('features')} className="block w-full text-left text-slate-300 hover:text-white py-2">Features</button>
            <button onClick={() => scrollTo('pricing')} className="block w-full text-left text-slate-300 hover:text-white py-2">Pricing</button>
            <button onClick={() => { setMobileMenuOpen(false); setAuthModal('sign_in'); }} className="block w-full text-left text-slate-300 hover:text-white py-2">Log In</button>
            <button onClick={() => { setMobileMenuOpen(false); setAuthModal('sign_up'); }} className="block w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold py-2.5 text-center">
              Start Free Trial
            </button>
          </div>
        )}
      </nav>

      {/* Auth Modal */}
      {authModal && (
        <AuthModal
          supabase={supabase}
          mode={authModal}
          onModeChange={setAuthModal}
          onClose={() => setAuthModal(null)}
        />
      )}
    </>
  );
}
