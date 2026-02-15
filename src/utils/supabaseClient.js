// Shared auth token helper
// Reads the Supabase session from localStorage (same session App.jsx manages).
// Does NOT create a second GoTrueClient — avoids the "Multiple GoTrueClient" warning.

/**
 * Get the current user's JWT access token, or null if not authenticated.
 * Non-throwing — safe to call anywhere.
 */
export async function getAuthToken() {
  try {
    // Supabase stores the session under sb-<projectRef>-auth-token in localStorage.
    // Derive the project ref from the env URL: https://<ref>.supabase.co
    const url = import.meta.env.VITE_SUPABASE_URL || '';
    const match = url.match(/\/\/([^.]+)\./);
    if (!match) return null;

    const key = `sb-${match[1]}-auth-token`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const session = JSON.parse(raw);
    return session?.access_token || null;
  } catch {
    return null;
  }
}
