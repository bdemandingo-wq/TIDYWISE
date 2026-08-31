import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type Preview = { email: string; role: string; organization_name: string; existing_user?: boolean };
type PreviewResponse = Preview & InviteResponse & { already_accepted?: boolean };
type InviteResponse = {
  success?: boolean;
  created?: boolean;
  existing_user?: boolean;
  requires_sign_in?: boolean;
  email?: string;
  organization_id?: string;
  role?: string;
  error?: string;
  message?: string;
  attempt_id?: string;
};

const ACTIVE_ORG_KEY = 'tidywise_active_org';
const INVITE_JOIN_KEY = 'tidywise_invite_joined_workspace';
/** Survives the emailed-code roundtrip so the name typed here isn't lost. */
const INVITE_NAME_KEY = 'tidywise_invite_full_name';


function dashboardDestination(role?: string) {
  return role === 'manager' || role === 'admin' ? '/dashboard/scheduler' : '/dashboard';
}

function rememberJoinedOrganization(organizationId?: string) {
  if (!organizationId) return;
  try {
    localStorage.setItem(ACTIVE_ORG_KEY, organizationId);
  } catch {
    // Ignore storage failures; the organization context will still refetch.
  }
}

async function getExactFunctionError(data: unknown, error: unknown, fallback = 'Invite request failed') {
  const format = (message: unknown, attemptId?: unknown) => {
    const text = String(message || fallback);
    return attemptId ? `${text} (attempt_id: ${String(attemptId)})` : text;
  };

  const response = data as InviteResponse | null;
  if (response?.error) return format(response.error, response.attempt_id);

  const context = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json() as { error?: unknown; message?: unknown; attempt_id?: unknown } | null;
      if (body?.error) return format(body.error, body.attempt_id);
      if (body?.message) return format(body.message, body.attempt_id);
    } catch {
      // Fall through to the platform error message below.
    }
  }

  return (error as Error | null)?.message || fallback;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForInviteSession(expectedEmail?: string) {
  const expected = expectedEmail?.toLowerCase();
  for (let attempt = 0; attempt < 12; attempt++) {
    const { data: sessionData } = await supabase.auth.getSession();
    const sessionUser = sessionData.session?.user;
    if (sessionUser && (!expected || sessionUser.email?.toLowerCase() === expected)) return sessionUser;

    const { data: userData } = await supabase.auth.getUser();
    if (userData.user && (!expected || userData.user.email?.toLowerCase() === expected)) return userData.user;

    await sleep(350);
  }

  throw new Error('session_not_ready_after_invite_accept');
}

export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { refetch, switchOrganization } = useOrganization();

  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState(() => {
    try { return sessionStorage.getItem(INVITE_NAME_KEY) || ''; } catch { return ''; }
  });
  const [busy, setBusy] = useState(false);
  const [signInErr, setSignInErr] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);


  const completeInviteJoin = async (response: InviteResponse, expectedEmail?: string) => {
    if (!response.organization_id) {
      throw new Error(response.attempt_id ? `missing_organization_id (attempt_id: ${response.attempt_id})` : 'missing_organization_id');
    }

    rememberJoinedOrganization(response.organization_id);
    const joinedUser = await waitForInviteSession(expectedEmail || response.email);

    // Name the teammate typed on this screen wins over whatever stale name the
    // account already carried (a leftover "Test Client" profile, for example).
    const typedName = fullName.trim();
    if (typedName) {
      const { error: nameError } = await supabase
        .from('profiles')
        .update({ full_name: typedName })
        .eq('id', joinedUser.id);
      if (nameError) console.warn('[AcceptInvite] could not save name:', nameError.message);
    }

    const { data: membership, error: membershipError } = await supabase
      .from('org_memberships')
      .select('organization_id, role')
      .eq('organization_id', response.organization_id)
      .eq('user_id', joinedUser.id)
      .maybeSingle();

    if (membershipError) {
      throw new Error(`membership_verify_failed: ${membershipError.message}${response.attempt_id ? ` (attempt_id: ${response.attempt_id})` : ''}`);
    }
    if (!membership) {
      throw new Error(`membership_missing_after_accept${response.attempt_id ? ` (attempt_id: ${response.attempt_id})` : ''}`);
    }
    if (membership.role !== 'owner' && membership.role !== 'manager') {
      throw new Error(`invalid_invite_membership_role: ${membership.role}${response.attempt_id ? ` (attempt_id: ${response.attempt_id})` : ''}`);
    }

    try {
      sessionStorage.setItem(INVITE_JOIN_KEY, JSON.stringify({
        organization_id: response.organization_id,
        attempt_id: response.attempt_id,
        at: Date.now(),
      }));
    } catch {
      // Session storage is only a safety net for route guards.
    }

    try { sessionStorage.removeItem(INVITE_NAME_KEY); } catch { /* ignore */ }
    await refetch();
    switchOrganization(response.organization_id);
    try { sessionStorage.removeItem('tidywise_invite_pending'); } catch { /* ignore */ }
    window.location.replace(dashboardDestination(response.role));

  };


  // Flag the invite as in-flight so the auth provisioning effect does not
  // create a brand-new trial org for this user mid-acceptance.
  useEffect(() => {
    if (!token) return;
    try { sessionStorage.setItem('tidywise_invite_pending', 'true'); } catch { /* ignore */ }
    return () => { try { sessionStorage.removeItem('tidywise_invite_pending'); } catch { /* ignore */ } };
  }, [token]);

  useEffect(() => {
    if (!token) { setLoadErr('Missing invite token'); return; }
    (async () => {
      const { data, error } = await supabase.functions.invoke('accept-team-invite', {
        body: { token, mode: 'preview' },
      });
      if (error || (data as PreviewResponse | null)?.error) {
        setLoadErr(await getExactFunctionError(data, error, 'Invalid invite'));
        return;
      }
      setPreview(data as Preview);
    })();
  }, [token]);


  const acceptExisting = async () => {
    setBusy(true);
    setSignInErr(null);
    try {
      const { data, error } = await supabase.functions.invoke('accept-team-invite', {
        body: { token, mode: 'accept' },
      });
      if (error || (data as InviteResponse)?.error) throw new Error(await getExactFunctionError(data, error));
      toast.success('You joined the workspace');
      await completeInviteJoin(data as InviteResponse, preview?.email || user?.email || undefined);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to accept';
      setSignInErr(message);
      toast.error(message);
    } finally { setBusy(false); }
  };

  const signInWithInvitePassword = async (email: string, passwordValue: string, retries = 0) => {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const { error } = await supabase.auth.signInWithPassword({ email, password: passwordValue });
      if (!error) return;
      lastError = error;
      if (attempt < retries) await new Promise(resolve => setTimeout(resolve, 700 * (attempt + 1)));
    }
    throw lastError || new Error('Sign in failed');
  };

  const sendPasswordReset = async () => {
    if (!preview) return;
    if (!fullName.trim()) { toast.error('Enter your name first'); return; }
    setResetBusy(true);
    try {
      try { sessionStorage.setItem(INVITE_NAME_KEY, fullName.trim()); } catch { /* ignore */ }
      const { error } = await supabase.auth.signInWithOtp({
        email: preview.email,
        options: { shouldCreateUser: false },
      });
      if (error) throw error;
      const next = `/accept-invite?token=${encodeURIComponent(token)}`;
      toast.success('Password setup code sent');
      navigate(`/reset-password?email=${encodeURIComponent(preview.email)}&next=${encodeURIComponent(next)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send password setup code');
    } finally { setResetBusy(false); }
  };


  const signUpAndAccept = async () => {
    if (!preview) return;
    if (preview.existing_user) { await sendPasswordReset(); return; }
    if (!fullName.trim()) { toast.error('Enter your name'); return; }

    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setBusy(true);
    setSignInErr(null);
    try {
      // 1) Server verifies the invite. Existing users are attached immediately;
      // new users are created pre-confirmed and attached immediately.
      const { data: sData, error: sErr } = await supabase.functions.invoke('accept-team-invite', {
        body: { token, mode: 'signup', password, full_name: fullName },
      });
      if (sErr || (sData as InviteResponse)?.error) {
        throw new Error(await getExactFunctionError(sData, sErr, 'Signup failed'));
      }

      // 2) Sign in with the password typed on this screen. For existing users,
      // this must be their existing password; no confirmation email is involved.
      await signInWithInvitePassword(preview.email, password, (sData as InviteResponse)?.created ? 2 : 0);

      toast.success('You joined the workspace');
      await completeInviteJoin(sData as InviteResponse, preview.email);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const friendly = /invalid login credentials/i.test(message)
        ? 'That password does not match the existing account for this invite.'
        : message;
      setSignInErr(friendly);
      toast.error(friendly);
    } finally { setBusy(false); }
  };


  if (loadErr) {
    return (
      <div className="portal-v2 portal-v2-scroll min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="max-w-md w-full">
          <CardHeader><CardTitle>Invite unavailable</CardTitle></CardHeader>
          <CardContent><p className="text-muted-foreground">{loadErr}</p></CardContent>
        </Card>
      </div>
    );
  }
  if (!preview || authLoading) {
    return <div className="portal-v2 portal-v2-scroll min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const emailMatches = user?.email?.toLowerCase() === preview.email.toLowerCase();

  return (
    <div className="portal-v2 portal-v2-scroll min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Join {preview.organization_name}</CardTitle>
          <CardDescription>
            You've been invited as <strong>{preview.role}</strong> using <strong>{preview.email}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {signInErr && (
            <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-xs text-destructive">{signInErr}</p>
              {!user && preview.existing_user && (
                <Button type="button" variant="outline" size="sm" className="w-full" onClick={sendPasswordReset} disabled={resetBusy}>
                  {resetBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Email me a password setup code'}
                </Button>
              )}
            </div>
          )}
          {user && emailMatches && (
            <Button className="w-full" onClick={acceptExisting} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Accept invitation'}
            </Button>
          )}
          {user && !emailMatches && (
            <div className="space-y-3">
              <p className="text-sm text-destructive">
                You're signed in as {user.email}. Sign out and sign in as {preview.email} to accept.
              </p>
              <Button variant="outline" className="w-full" onClick={() => navigate('/logout')}>Sign out</Button>
            </div>
          )}
          {!user && (
            <div className="space-y-3">
              {preview.existing_user ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    This email already has a TidyWise login. Verify the email to create a new password, then return here to join this workspace.
                  </p>
                  <Button className="w-full" onClick={sendPasswordReset} disabled={resetBusy}>
                    {resetBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Email me a code to create my password'}
                  </Button>
                  {!showExistingPassword ? (
                    <Button type="button" variant="outline" className="w-full" onClick={() => setShowExistingPassword(true)}>
                      I already have a TidyWise password
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <Label>Your TidyWise password</Label>
                        <Input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
                      </div>
                      <Button className="w-full" onClick={signInExistingThenAccept} disabled={busy || !password}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign in & join'}
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <Label>Your name</Label>
                    <Input value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="name" />
                  </div>
                  <div>
                    <Label>Create your password</Label>
                    <Input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
                  </div>
                  <Button className="w-full" onClick={signUpAndAccept} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create my account & join'}
                  </Button>
                </>
              )}
              <p className="text-xs text-center text-muted-foreground">
                Already have an account? <a className="underline" href={`/login?next=/accept-invite?token=${token}`}>Sign in</a>
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
