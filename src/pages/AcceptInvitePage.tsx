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

type Preview = { email: string; role: string; organization_name: string };

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

  useEffect(() => {
    if (!token) { setLoadErr('Missing invite token'); return; }
    (async () => {
      const { data, error } = await supabase.functions.invoke('accept-team-invite', {
        body: { token, mode: 'preview' },
      });
      if (error || (data as any)?.error) {
        setLoadErr((data as any)?.error || error?.message || 'Invalid invite');
        return;
      }
      setPreview(data as Preview);
    })();
  }, [token]);

  const acceptExisting = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('accept-team-invite', {
        body: { token, mode: 'accept' },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      toast.success('You joined the workspace');
      await refetch();
      if ((data as any)?.organization_id) switchOrganization((data as any).organization_id);
      navigate('/dashboard');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to accept');
    } finally { setBusy(false); }
  };

  const signUpAndAccept = async () => {
    if (!preview) return;
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setBusy(true);
    try {
      // 1) Create pre-confirmed user server-side (bypasses email confirm)
      const { data: sData, error: sErr } = await supabase.functions.invoke('accept-team-invite', {
        body: { token, mode: 'signup', password, full_name: fullName },
      });
      const sErrCode = (sData as any)?.error;
      if (sErr || (sErrCode && sErrCode !== 'user_exists')) {
        throw new Error(sErrCode || sErr?.message || 'Signup failed');
      }
      // 2) Sign in with the password (works whether we just created it or it existed)
      const { error: siErr } = await supabase.auth.signInWithPassword({ email: preview.email, password });
      if (siErr) throw siErr;
      // 3) Accept invite (attaches membership) — needs the just-set auth session
      await acceptExisting();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Signup failed');
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
                <Label>Create a password</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              <Button className="w-full" onClick={signUpAndAccept} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create account & join'}
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
