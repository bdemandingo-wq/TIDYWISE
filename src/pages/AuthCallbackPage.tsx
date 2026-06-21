import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

/**
 * Handles Supabase auth redirects (invite, recovery, magiclink, signup).
 * Supabase appends tokens in the URL hash (#access_token=...&type=invite).
 * The client auto-detects and persists the session; we just route the user
 * to the right next step.
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const parseHash = () => {
      const hash = window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : window.location.hash;
      const params = new URLSearchParams(hash);
      return {
        type: params.get('type'),
        error: params.get('error') || params.get('error_description'),
      };
    };

    const query = new URLSearchParams(window.location.search);
    const next = query.get('next') || '/dashboard';

    const run = async () => {
      const { type, error: hashError } = parseHash();

      // Give supabase-js a tick to persist the session from the URL hash.
      await new Promise((r) => setTimeout(r, 50));
      const { data: { session } } = await supabase.auth.getSession();

      if (cancelled) return;

      if (hashError) {
        navigate(`/login?error=${encodeURIComponent(hashError)}`, { replace: true });
        return;
      }

      // Invite or password recovery → force user to set/choose a password first.
      if (type === 'invite' || type === 'recovery') {
        navigate(`/set-password?next=${encodeURIComponent(next)}`, { replace: true });
        return;
      }

      // Magic link / signup confirm / other → go straight to next (dashboard)
      // when we have a session, otherwise to login.
      if (session) {
        navigate(next, { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
