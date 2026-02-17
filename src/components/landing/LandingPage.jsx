import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import LandingNav from './sections/LandingNav.jsx';
import HeroSection from './sections/HeroSection.jsx';
import PainSection from './sections/PainSection.jsx';
import FeaturesSection from './sections/FeaturesSection.jsx';
import DashboardPreviewSection from './sections/DashboardPreviewSection.jsx';
import SocialProofSection from './sections/SocialProofSection.jsx';
import PricingSection from './sections/PricingSection.jsx';
import CtaSection from './sections/CtaSection.jsx';
import LandingFooter from './sections/LandingFooter.jsx';

export default function LandingPage({ session, supabase }) {
  const location = useLocation();
  const showLogin = new URLSearchParams(location.search).get('login') === 'true';

  // Smooth scroll for anchor links
  useEffect(() => {
    const hash = location.hash;
    if (hash) {
      const el = document.querySelector(hash);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  }, [location.hash]);

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (session) {
      window.location.href = '/app';
    }
  }, [session]);

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-x-hidden">
      <LandingNav supabase={supabase} showLogin={showLogin} />
      <main>
        <HeroSection supabase={supabase} />
        <PainSection />
        <FeaturesSection />
        <DashboardPreviewSection />
        <SocialProofSection />
        <PricingSection supabase={supabase} />
        <CtaSection supabase={supabase} />
      </main>
      <LandingFooter />
    </div>
  );
}
