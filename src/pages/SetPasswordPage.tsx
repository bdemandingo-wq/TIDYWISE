import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';

/**
 * Set Password page — shown after a user clicks an invite or recovery link.
 * Requires an active Supabase session (established by /auth/callback). If
 * there is no session, we send the user to /login.
 */
export default function SetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next') || '/dashboard';

  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) Try to consume tokens from URL hash (Supabase invite/recovery deep-link)
      const hash = window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : window.location.hash;
      const hashParams = new URLSearchParams(hash);
      const access_token = hashParams.get('access_token');
      const refresh_token = hashParams.get('refresh_token');
      const errDesc = hashParams.get('error_description');

      if (errDesc) {
        setError(decodeURIComponent(errDesc.replace(/\+/g, ' ')));
      }

      if (access_token && refresh_token) {
        const { error: setErr } = await supabase.auth.setSession({ access_token, refresh_token });
        if (setErr) {
          if (!cancelled) {
            setError('Your invite link has expired. Please request a new one.');
            setChecking(false);
          }
          return;
        }
        // Clean the hash so a refresh doesn't re-process tokens
        try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* no-op */ }
      }

      // 2) Check for an active session
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!session) {
        const emailHint = searchParams.get('email');
        const loginUrl = emailHint
          ? `/login?email=${encodeURIComponent(emailHint)}`
          : '/login';
        navigate(loginUrl, { replace: true });
        return;
      }
      setEmail(session.user.email ?? null);
      setChecking(false);
    })();
    return () => { cancelled = true; };
  }, [navigate, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must include a letter and a number.');
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (updateError) {
      setError(updateError.message || 'Could not set password. Please try again.');
      return;
    }

    toast.success('Password set — welcome!');
    navigate(next, { replace: true });
  };

  if (checking) {
    return (
      <div className="portal-v2 portal-v2-scroll min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <SEOHead title="Set Your Password — TidyWise" description="Choose a password to activate your TidyWise account." />
      <div className="portal-v2 portal-v2-scroll min-h-screen flex items-center justify-center bg-background px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>Set your password</CardTitle>
            <CardDescription>
              {email ? <>One last step for <strong>{email}</strong>. Choose a password to finish activating your account.</> : 'Choose a password to finish activating your account.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground p-1"
                    aria-label={showPwd ? 'Hide password' : 'Show password'}
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type={showPwd ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                  required
                />
              </div>

              {error && (
                <p className="text-sm text-destructive" role="alert">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Setting password…</>) : 'Set password & continue'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
