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
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [signInErr, setSignInErr] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  const completeInviteJoin = async (response: InviteResponse, expectedEmail?: string) => {
    if (!response.organization_id) {
      throw new Error(response.attempt_id ? `missing_organization_id (attempt_id: ${response.attempt_id})` : 'missing_organization_id');
    }

    rememberJoinedOrganization(response.organization_id);
    await waitForInviteSession(expectedEmail || response.email);

    try {
      sessionStorage.setItem(INVITE_JOIN_KEY, JSON.stringify({
        organization_id: response.organization_id,
        attempt_id: response.attempt_id,
        at: Date.now(),
      }));
    } catch {
      // Session storage is only a safety net for route guards.
    }

    await refetch();
    switchOrganization(response.organization_id);
    window.location.replace(dashboardDestination(response.role));
  };

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

  const signInExistingThenAccept = async () => {
    if (!preview) return;
    if (!password) { toast.error('Enter the existing account password'); return; }
    setBusy(true);
    setSignInErr(null);
    try {
      await signInWithInvitePassword(preview.email, password);

      const { data, error } = await supabase.functions.invoke('accept-team-invite', {
        body: { token, mode: 'accept' },
      });
      if (error || (data as InviteResponse)?.error) throw new Error(await getExactFunctionError(data, error));

      toast.success('You joined the workspace');
      await completeInviteJoin(data as InviteResponse, preview.email);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const friendly = /invalid login credentials/i.test(message)
        ? 'That password does not match the existing account for this invite.'
        : message;
      setSignInErr(friendly);
      toast.error(friendly);
    } finally { setBusy(false); }
  };

  const sendPasswordReset = async () => {
    if (!preview) return;
    setResetBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(preview.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success('Password reset link sent');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send reset link');
    } finally { setResetBusy(false); }
  };

  const signUpAndAccept = async () => {
    if (!preview) return;
    if (preview.existing_user) { await signInExistingThenAccept(); return; }
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
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="max-w-md w-full">
          <CardHeader><CardTitle>Invite unavailable</CardTitle></CardHeader>
          <CardContent><p className="text-muted-foreground">{loadErr}</p></CardContent>
        </Card>
      </div>
    );
  }
  if (!preview || authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const emailMatches = user?.email?.toLowerCase() === preview.email.toLowerCase();

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
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
                  {resetBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reset password for this account'}
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
              <div>
                <Label>Your name</Label>
                <Input value={fullName} onChange={e => setFullName(e.target.value)} />
              </div>
              <div>
                <Label>{preview.existing_user ? 'Password' : 'Create a password'}</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              {preview.existing_user && (
                <p className="text-xs text-muted-foreground">
                  This email already has an account. Use that account password to join this workspace.
                </p>
              )}
              <Button className="w-full" onClick={signUpAndAccept} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : preview.existing_user ? 'Sign in & join' : 'Create account & join'}
              </Button>
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
