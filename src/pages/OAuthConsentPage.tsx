import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SEOHead } from '@/components/SEOHead';

/**
 * OAuth 2.1 consent screen for MCP clients (Claude, ChatGPT, Cursor…).
 * Supabase redirects here as /.lovable/oauth/consent?authorization_id=…
 *
 * Sign-in happens inline so the user never leaves the consent URL — a
 * redirect to /login would drop the authorization_id and silently break
 * the connector handshake.
 */
export default function OAuthConsentPage() {
  const [params] = useSearchParams();
  const authorizationId = params.get('authorization_id') ?? '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [details, setDetails] = useState<any>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError('Missing authorization_id. Start the connection again from your MCP client.');
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!active) return;
      if (!sess.session) {
        setNeedsSignIn(true);
        return;
      }
      setNeedsSignIn(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oauth = (supabase.auth as any).oauth;
      if (!oauth?.getAuthorizationDetails) {
        setError('This project does not have the OAuth authorization server enabled.');
        return;
      }
      const { data, error: detailsError } = await oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (detailsError) {
        setError(detailsError.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId, reloadKey]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    setPassword('');
    setReloadKey((k) => k + 1);
  }

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const oauth = (supabase.auth as any).oauth;
    const { data, error: decideError } = approve
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);
    if (decideError) {
      setBusy(false);
      setError(decideError.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError('No redirect returned by the authorization server.');
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="min-h-dvh flex items-center justify-center bg-background px-4 py-10">
      {/* index.html defaults every route to "index, follow", so a page without
          SEOHead is crawlable by omission. This one is a step inside an OAuth
          handshake and only works with a live authorization_id, so it must say
          otherwise explicitly. The sitemap generator excludes /.lovable too —
          both are needed: the sitemap stops it being advertised, noindex stops
          it being kept if a crawler arrives another way. */}
      <SEOHead
        title="Authorize access | TidyWise"
        description="Authorize an application to access your TidyWise account."
        noIndex
      />
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
        {error && (
          <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {needsSignIn ? (
          <form onSubmit={signIn} className="space-y-4">
            <div>
              <h1 className="text-xl font-semibold text-foreground">Sign in to continue</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Sign in to your TidyWise account to approve this connection.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="consent-email">Email</Label>
              <Input
                id="consent-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="consent-password">Password</Label>
              <Input
                id="consent-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        ) : !details ? (
          <p className="text-sm text-muted-foreground">Loading authorization request…</p>
        ) : (
          <div className="space-y-5">
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                Connect {details.client?.name ?? 'an app'} to TidyWise
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {details.client?.name ?? 'This client'} will be able to read your bookings,
                customers, and invoices, and create customers - acting as you, in the organizations
                you belong to.
              </p>
            </div>
            <div className="flex gap-3">
              <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
                Approve
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                disabled={busy}
                onClick={() => decide(false)}
              >
                Deny
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
