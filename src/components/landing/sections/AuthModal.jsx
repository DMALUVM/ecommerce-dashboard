import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, BarChart3 } from 'lucide-react';

export default function AuthModal({ supabase, mode, onModeChange, onClose }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!supabase) return;
    setError('');
    setLoading(true);
    try {
      const { error: authError } = mode === 'sign_up'
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.message);
      } else {
        onClose();
        navigate('/app');
      }
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">
              {mode === 'sign_up' ? 'Start Your Free Trial' : 'Welcome Back'}
            </h2>
            <p className="text-slate-400 text-sm">
              {mode === 'sign_up' ? '14 days free. No credit card required.' : 'Sign in to your dashboard.'}
            </p>
          </div>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              placeholder="you@company.com"
              className="w-full rounded-xl bg-slate-950/60 border border-slate-700 px-3 py-2.5 outline-none focus:border-emerald-500 text-white placeholder:text-slate-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              autoComplete={mode === 'sign_up' ? 'new-password' : 'current-password'}
              placeholder="••••••••"
              className="w-full rounded-xl bg-slate-950/60 border border-slate-700 px-3 py-2.5 outline-none focus:border-emerald-500 text-white placeholder:text-slate-500 transition-colors"
            />
          </div>

          {error && (
            <div className="text-sm text-rose-300 bg-rose-950/30 border border-rose-900/50 rounded-xl p-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold py-2.5 transition-colors"
          >
            {loading ? 'Please wait...' : mode === 'sign_up' ? 'Create Account' : 'Sign In'}
          </button>

          <button
            type="button"
            onClick={() => onModeChange(mode === 'sign_up' ? 'sign_in' : 'sign_up')}
            className="w-full rounded-xl border border-slate-700 hover:border-slate-500 text-slate-200 py-2.5 transition-colors"
          >
            {mode === 'sign_up' ? 'Already have an account? Sign in' : 'New here? Start free trial'}
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-slate-800 text-center">
          <p className="text-xs text-slate-500">
            By continuing, you agree to our{' '}
            <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300">Terms</a>
            {' '}and{' '}
            <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300">Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>
  );
}
