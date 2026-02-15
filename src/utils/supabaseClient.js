// Shared Supabase client singleton
// Used by ai.js for auth headers, and available for any module that needs auth state.
// App.jsx has its OWN client (unchanged) — this is a separate instance that shares
// the same localStorage session, so auth state stays in sync automatically.

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Only create if env vars are configured (matches App.jsx behavior)
export const supabase = (url && key)
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

/**
 * Get the current user's JWT access token, or null if not authenticated.
 * Non-throwing — safe to call anywhere.
 */
export async function getAuthToken() {
  try {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  } catch {
    return null;
  }
}
