import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import App from './App.jsx';
import LandingPage from './components/landing/LandingPage.jsx';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Share a single Supabase client across the app
const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

function ProtectedRoute({ session, isAuthReady, children }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthReady && !session && supabase) {
      navigate('/?login=true', { replace: true });
    }
  }, [isAuthReady, session, navigate]);

  // Still loading auth state
  if (!isAuthReady && supabase) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return children;
}

export default function AppRouter() {
  const [session, setSession] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setIsAuthReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <Routes>
      <Route path="/" element={<LandingPage session={session} supabase={supabase} />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute session={session} isAuthReady={isAuthReady}>
            <App routerSession={session} routerSupabase={supabase} />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
